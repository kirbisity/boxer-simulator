// Noise for the open air (src/env/): a seeded lattice noise for building land on the processor, and one small
// tiling picture of noise that every env shader reads (gusts, cloud, the grain of the ground) and that the
// processor can read too (envNoiseAt), so a cloud's shadow on a fighter and on the grass under him are one shadow.

/* global THREE */

/** A seeded generator (mulberry32): the same land from the same seed. */
export function envRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const envHash = (x, z, seed) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Smooth lattice noise, 0..1, one lattice cell per unit. `wrap` (cells) makes it tile. */
export function envValueNoise(x, z, seed, wrap = 0) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  // Quintic ease: no creases in the land's slope at the lattice lines.
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const at = (ix, iz) => (wrap ? envHash(((ix % wrap) + wrap) % wrap, ((iz % wrap) + wrap) % wrap, seed) : envHash(ix, iz, seed));
  const a = at(x0, z0);
  const b = at(x0 + 1, z0);
  const c = at(x0, z0 + 1);
  const d = at(x0 + 1, z0 + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/**
 * Noise summed over `octaves`, each twice as fine and half as strong, 0..1. `ridge` folds each octave about its
 * middle so the high ground comes to crests (a range of hills) instead of domes.
 */
export function envFbm(x, z, seed, octaves = 4, ridge = false, wrap = 0) {
  let sum = 0;
  let weight = 0.5;
  let total = 0;
  let scale = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    let n = envValueNoise(x * scale + octave * 17.3, z * scale - octave * 9.1, seed + octave * 101, wrap ? wrap * scale : 0);
    if (ridge) {
      n = 1 - Math.abs(n * 2 - 1);
      n *= n;
    }
    sum += n * weight;
    total += weight;
    weight *= 0.5;
    scale *= 2;
  }
  return sum / total;
}

// ---- the shared picture ----------------------------------------------------------------------------------------

/** The picture's width in texels and how many lattice cells cross it: read at 1 / (cells x length) it gives features `length` m wide. */
export const ENV_NOISE_SIZE = 256;
export const ENV_NOISE_CELLS = 16;

let envNoiseData = null;
let envNoiseTextureMade = null;

/**
 * The picture's values, 0..1, four to a texel: [0] smooth single noise, [1] the same from another seed,
 * [2] four octaves summed (cloud, the grain of the ground), [3] four octaves from another seed.
 */
export function envNoiseValues() {
  if (envNoiseData) return envNoiseData;
  const size = ENV_NOISE_SIZE;
  const cells = ENV_NOISE_CELLS;
  const data = new Float32Array(size * size * 4);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const x = (column / size) * cells;
      const z = (row / size) * cells;
      const at = (row * size + column) * 4;
      data[at] = envValueNoise(x, z, 5, cells);
      data[at + 1] = envValueNoise(x, z, 71, cells);
      data[at + 2] = envFbm(x, z, 13, 4, false, cells);
      data[at + 3] = envFbm(x, z, 29, 4, false, cells);
    }
  }
  envNoiseData = data;
  return data;
}

/** The picture as a texture (made once): repeating, mip-mapped. */
export function envNoiseTexture() {
  if (envNoiseTextureMade) return envNoiseTextureMade;
  const values = envNoiseValues();
  const bytes = new Uint8Array(values.length);
  for (let index = 0; index < values.length; index += 1) bytes[index] = Math.round(Math.min(1, Math.max(0, values[index])) * 255);
  const texture = new THREE.DataTexture(bytes, ENV_NOISE_SIZE, ENV_NOISE_SIZE, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  envNoiseTextureMade = texture;
  return texture;
}

/** The picture read on the processor as a shader reads it: `u`, `v` in turns of the picture, `channel` 0..3. */
export function envNoiseAt(u, v, channel) {
  const values = envNoiseValues();
  const size = ENV_NOISE_SIZE;
  const x = (u - Math.floor(u)) * size - 0.5;
  const z = (v - Math.floor(v)) * size - 0.5;
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const at = (ix, iz) => values[((((iz % size) + size) % size) * size + (((ix % size) + size) % size)) * 4 + channel];
  const top = at(x0, z0) + (at(x0 + 1, z0) - at(x0, z0)) * fx;
  const bottom = at(x0, z0 + 1) + (at(x0 + 1, z0 + 1) - at(x0, z0 + 1)) * fx;
  return top + (bottom - top) * fz;
}
