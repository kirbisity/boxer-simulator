// Ground styles: painted (proof of concept). See src/scenery.js (GROUND) for the contract.
//
// "Painted": every ground drawn from textures generated at load, nothing
// downloaded. Each surface is two layers (say grass and a worn track), each
// a 512² albedo (roughness in alpha) and a 512² normal map (height in alpha),
// painted on a canvas with strokes and stamps and finished per pixel. They
// tile at 1.3–2.6 m. A third, place-sized layout map (256–512²) says where
// the second layer shows (the track, the churned strip, the wet sand), the
// large-scale tint, wetness and paint; a small noise map picks between two
// differently placed samples of each layer so the tile does not repeat. The
// layers meet by height (grass stands over the dirt, water fills the low
// spots first). One MeshStandardMaterial, patched in onBeforeCompile; world
// xz drives every lookup, the ground is flat so its normal is built in world
// space with no tangents. Out where the foothills rise the detail fades into
// the place's own painted texture, which the foothills wear too.

/* global THREE */
import { BLOOD_DYE_GLSL, bloodDyeShader } from '../blooddye.js';

const PAINTED_GROUND_TEXELS = 512;

// ---- noise -----------------------------------------------------------------------

/** A seeded generator from a string. */
function paintedGroundRandom(text) {
  let seed = 2166136261;
  for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const paintedGroundSmooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Tileable value noise over a size² image, `cells` lattice cells across at the first octave, 0..1. */
function paintedGroundTileNoise(size, cells, random, octaves = 4) {
  const out = new Float32Array(size * size);
  let amplitude = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    const n = cells << octave;
    const lattice = new Float32Array(n * n);
    for (let index = 0; index < lattice.length; index += 1) lattice[index] = random();
    const step = n / size;
    for (let y = 0; y < size; y += 1) {
      const fy = y * step;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      const row0 = (y0 % n) * n;
      const row1 = ((y0 + 1) % n) * n;
      for (let x = 0; x < size; x += 1) {
        const fx = x * step;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % n;
        const c1 = (x0 + 1) % n;
        const a = lattice[row0 + c0] + (lattice[row0 + c1] - lattice[row0 + c0]) * sx;
        const b = lattice[row1 + c0] + (lattice[row1 + c1] - lattice[row1 + c0]) * sx;
        out[y * size + x] += (a + (b - a) * sy) * amplitude;
      }
    }
    total += amplitude;
    amplitude *= 0.5;
  }
  for (let index = 0; index < out.length; index += 1) out[index] /= total;
  return out;
}

let paintedGroundFbmTable = null;
/** Fractal noise over the world, 0..1: a lookup into a 256² tileable table (period 16 units), each seed its own offset. */
function paintedGroundFbm(x, z, seed) {
  if (!paintedGroundFbmTable) paintedGroundFbmTable = paintedGroundTileNoise(256, 16, paintedGroundRandom('painted:fbm'), 4);
  const table = paintedGroundFbmTable;
  const fx = (x + seed * 3.71) * 16;
  const fz = (z + seed * 5.37) * 16;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const x0 = ix & 255;
  const x1 = (ix + 1) & 255;
  const z0 = (iz & 255) * 256;
  const z1 = ((iz + 1) & 255) * 256;
  const a = table[z0 + x0] + (table[z0 + x1] - table[z0 + x0]) * tx;
  const b = table[z1 + x0] + (table[z1 + x1] - table[z1 + x0]) * tx;
  return Math.min(1, Math.max(0, (a + (b - a) * tz - 0.5) * 1.8 + 0.5));
}

// ---- the painting sheet: a colour canvas and a height canvas, drawn together --------

const paintedGroundGrey = (value, alpha = 1) => {
  const g = Math.round(Math.max(0, Math.min(1, value)) * 255);
  return `rgba(${g},${g},${g},${alpha})`;
};
const paintedGroundHsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

function paintedGroundSheet(random, base, baseHeight = 0.5, size = PAINTED_GROUND_TEXELS) {
  const make = () => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas.getContext('2d', { willReadFrequently: true });
  };
  const colour = make();
  colour.fillStyle = base;
  colour.fillRect(0, 0, size, size);
  const height = make();
  height.fillStyle = paintedGroundGrey(baseHeight);
  height.fillRect(0, 0, size, size);
  for (const context of [colour, height]) {
    context.lineCap = 'round';
    context.lineJoin = 'round';
  }
  const rr = (a, b) => a + (b - a) * random();
  /** Draw at (x, y) and at each wrapped copy the reach overlaps, so the sheet tiles. */
  const wrap = (x, y, reach, draw) => {
    for (const ox of [-size, 0, size]) {
      if (x + ox + reach < 0 || x + ox - reach > size) continue;
      for (const oy of [-size, 0, size]) {
        if (y + oy + reach < 0 || y + oy - reach > size) continue;
        draw(x + ox, y + oy);
      }
    }
  };
  /** An ellipse: `fill` on the colour (or null), height `h` (or null) at alpha `ha`. */
  const blob = (x, y, rx, ry, turn, fill, h, ha = 1) => wrap(x, y, Math.max(rx, ry), (X, Y) => {
    for (const [context, style] of [[colour, fill], [height, h === null ? null : paintedGroundGrey(h, ha)]]) {
      if (!style) continue;
      context.fillStyle = style;
      context.beginPath();
      context.ellipse(X, Y, rx, ry, turn, 0, Math.PI * 2);
      context.fill();
    }
  });
  /** A rounded mound (top > edge) or a pit (top < edge). */
  const dome = (x, y, rx, ry, turn, fill, top, edge, alpha = 1) => wrap(x, y, Math.max(rx, ry), (X, Y) => {
    for (const context of [colour, height]) {
      context.save();
      context.translate(X, Y);
      context.rotate(turn);
      context.scale(1, ry / rx);
      context.beginPath();
      context.arc(0, 0, rx, 0, Math.PI * 2);
      if (context === colour) {
        if (!fill) {
          context.restore();
          continue;
        }
        context.fillStyle = fill;
      } else {
        const gradient = context.createRadialGradient(0, 0, 0, 0, 0, rx);
        gradient.addColorStop(0, paintedGroundGrey(top, alpha));
        gradient.addColorStop(0.65, paintedGroundGrey(top * 0.7 + edge * 0.3, alpha));
        gradient.addColorStop(1, paintedGroundGrey(edge, 0));
        context.fillStyle = gradient;
      }
      context.fill();
      context.restore();
    }
  });
  /** A curved stroke from (x, y), `length` long at `angle`, bending by `bend`. */
  const stroke = (x, y, length, angle, bend, width, fill, h, ha = 1) => {
    const ex = Math.cos(angle) * length;
    const ey = Math.sin(angle) * length;
    const cx = ex / 2 - Math.sin(angle) * length * bend;
    const cy = ey / 2 + Math.cos(angle) * length * bend;
    wrap(x, y, length + width, (X, Y) => {
      for (const [context, style] of [[colour, fill], [height, h === null ? null : paintedGroundGrey(h, ha)]]) {
        if (!style) continue;
        context.strokeStyle = style;
        context.lineWidth = width;
        context.beginPath();
        context.moveTo(X, Y);
        context.quadraticCurveTo(X + cx, Y + cy, X + ex, Y + ey);
        context.stroke();
      }
    });
  };
  return { size, colour, height, random, rr, wrap, blob, dome, stroke };
}

/** A footprint, heel at (x, y), pointing along `angle`: a rim pushed up round a pressed sole. */
function paintedGroundFoot(sheet, x, y, angle, scale, depth, fill) {
  const { dome } = sheet;
  const at = (along, across) => [x + Math.cos(angle) * along * scale - Math.sin(angle) * across * scale, y + Math.sin(angle) * along * scale + Math.cos(angle) * across * scale];
  const parts = [[0, 0, 10, 9], [20, -2, 12, 7], [40, 0, 15, 12]];
  for (const [along, across, rx, ry] of parts) dome(...at(along, across), (rx + 5) * scale, (ry + 5) * scale, angle, null, 0.6, 0.5, 0.45);
  for (const [along, across, rx, ry] of parts) dome(...at(along, across), rx * scale, ry * scale, angle, fill, depth, 0.5);
  for (let toe = 0; toe < 5; toe += 1) dome(...at(58 - Math.abs(toe - 1) * 2.5, -10 + toe * 5), 3.6 * scale, 3.4 * scale, angle, fill, depth + 0.05, 0.5);
}

/** A hoof print: a crescent rim, the pressed hoof, the frog raised in the middle. */
function paintedGroundHoof(sheet, x, y, angle, scale, fill) {
  const { dome } = sheet;
  dome(x + Math.cos(angle) * 4 * scale, y + Math.sin(angle) * 4 * scale, 20 * scale, 17 * scale, angle, null, 0.7, 0.5, 0.6);
  dome(x, y, 15 * scale, 12 * scale, angle, fill, 0.22, 0.5);
  dome(x - Math.cos(angle) * 9 * scale, y - Math.sin(angle) * 9 * scale, 9 * scale, 8 * scale, angle, null, 0.5, 0.5);
  dome(x - Math.cos(angle) * 3 * scale, y - Math.sin(angle) * 3 * scale, 6 * scale, 3 * scale, angle, null, 0.36, 0.2);
}

/** Read the sheet back, run `post` on the raw arrays, and pack the two textures. */
function paintedGroundFinish(sheet, { relief, rough, post, blur = 1 }) {
  const { size } = sheet;
  const count = size * size;
  const rgb = sheet.colour.getImageData(0, 0, size, size).data;
  const raw = sheet.height.getImageData(0, 0, size, size).data;
  let height = new Float32Array(count);
  for (let index = 0; index < count; index += 1) height[index] = raw[index * 4] / 255;
  for (let pass = 0; pass < blur; pass += 1) {
    const next = new Float32Array(count);
    for (let y = 0; y < size; y += 1) {
      const up = ((y - 1 + size) % size) * size;
      const row = y * size;
      const down = ((y + 1) % size) * size;
      for (let x = 0; x < size; x += 1) {
        const left = (x - 1 + size) % size;
        const right = (x + 1) % size;
        next[row + x] = (height[row + x] * 4 + height[up + x] + height[down + x] + height[row + left] + height[row + right]) / 8;
      }
    }
    height = next;
  }
  post?.({ size, height, rgb, random: sheet.random });
  const colour = new Uint8Array(count * 4);
  const normal = new Uint8Array(count * 4);
  const mean = [0, 0, 0];
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const dx = height[y * size + ((x + 1) % size)] - height[y * size + ((x - 1 + size) % size)];
      const dz = height[down + x] - height[up + x];
      const nx = -dx * 0.5 * relief;
      const nz = -dz * 0.5 * relief;
      const length = Math.sqrt(nx * nx + nz * nz + 1);
      const at = index * 4;
      normal[at] = (nx / length * 0.5 + 0.5) * 255;
      normal[at + 1] = (nz / length * 0.5 + 0.5) * 255;
      normal[at + 2] = (1 / length * 0.5 + 0.5) * 255;
      normal[at + 3] = Math.max(0, Math.min(1, height[index])) * 255;
      for (let channel = 0; channel < 3; channel += 1) {
        colour[at + channel] = rgb[at + channel];
        mean[channel] += rgb[at + channel];
      }
      const r = typeof rough === 'function' ? rough(height[index], rgb, at) : rough;
      colour[at + 3] = Math.max(0.02, Math.min(1, r)) * 255;
    }
  }
  return {
    colour: paintedGroundDataTexture(colour, size, true),
    normal: paintedGroundDataTexture(normal, size, true),
    mean: mean.map((value) => value / count / 255),
    bytes: count * 4 * 2 * 4 / 3,
  };
}

function paintedGroundDataTexture(data, size, repeat) {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** Multiply the colour by a tileable noise (lo..hi), for the low-frequency mottling inside a tile. */
function paintedGroundMottle(rgb, size, noise, lo, hi) {
  for (let index = 0; index < size * size; index += 1) {
    const k = lo + (hi - lo) * noise[index];
    for (let channel = 0; channel < 3; channel += 1) rgb[index * 4 + channel] = Math.min(255, rgb[index * 4 + channel] * k);
  }
}

// ---- the layers ------------------------------------------------------------------

const PAINTED_GROUND_LAYERS = {
  /** Summer grass: blades over thatch and earth, clover, a few flowers. */
  grass(random, { flowers = false } = {}) {
    const s = paintedGroundSheet(random, '#43602a', 0.35);
    const { rr } = s;
    for (let index = 0; index < 80; index += 1) s.blob(rr(0, 512), rr(0, 512), rr(4, 14), rr(3, 10), rr(0, 3), paintedGroundHsl(30, 28, rr(20, 30), 0.6), 0.25, 0.6);
    for (let index = 0; index < 1800; index += 1) s.stroke(rr(0, 512), rr(0, 512), rr(6, 14), rr(0, 6.3), rr(-0.3, 0.3), 1, paintedGroundHsl(rr(40, 52), rr(25, 40), rr(36, 52)), 0.4);
    const blades = 13000;
    for (let index = 0; index < blades; index += 1) {
      const t = index / blades;
      s.stroke(rr(0, 512), rr(0, 512), rr(5, 16), rr(0, 6.3), rr(-0.35, 0.35), rr(0.9, 1.9),
        paintedGroundHsl(rr(68, 98), rr(26, 48), 18 + t * 24 + rr(-5, 5)), 0.42 + 0.55 * t);
    }
    for (let index = 0; index < 70; index += 1) {
      const x = rr(0, 512);
      const y = rr(0, 512);
      const leaves = 3 + Math.floor(rr(0, 2));
      const spin = rr(0, 6.3);
      const shade = rr(24, 32);
      for (let leaf = 0; leaf < leaves; leaf += 1) {
        const a = spin + (leaf / leaves) * Math.PI * 2;
        s.dome(x + Math.cos(a) * 3.6, y + Math.sin(a) * 3.6, rr(2.6, 3.6), rr(2.4, 3.2), a, paintedGroundHsl(118, 36, shade), 1, 0.8);
      }
    }
    if (flowers) {
      for (let index = 0; index < 24; index += 1) {
        const white = random() < 0.5;
        s.dome(rr(0, 512), rr(0, 512), rr(1.6, 2.6), rr(1.6, 2.6), 0, white ? '#f2f0e4' : '#f1d23a', 1, 0.9);
      }
    }
    return paintedGroundFinish(s, {
      relief: 5,
      rough: (h) => 0.78 + 0.18 * (1 - h),
      post: ({ size, rgb, random: rnd }) => paintedGroundMottle(rgb, size, paintedGroundTileNoise(size, 4, rnd, 3), 0.84, 1.14),
    });
  },

  /** Bare trodden earth: grit, pebbles, a few flattened blades. */
  dirt(random) {
    const s = paintedGroundSheet(random, '#6a523d', 0.5);
    const { rr } = s;
    for (let index = 0; index < 40; index += 1) s.blob(rr(0, 512), rr(0, 512), rr(15, 40), rr(10, 30), rr(0, 3), paintedGroundHsl(25, 30, 22, 0.25), 0.42, 0.4);
    for (let index = 0; index < 3500; index += 1) s.blob(rr(0, 512), rr(0, 512), rr(0.6, 1.4), rr(0.6, 1.4), 0, paintedGroundHsl(rr(22, 36), rr(18, 34), rr(18, 44), 0.7), rr(0.45, 0.7), 0.7);
    for (let index = 0; index < 110; index += 1) {
      const r = rr(2, 6);
      s.dome(rr(0, 512), rr(0, 512), r, r * rr(0.6, 0.95), rr(0, 3), paintedGroundHsl(rr(20, 36), rr(10, 24), rr(26, 44)), 0.92, 0.5);
    }
    for (let index = 0; index < 500; index += 1) s.stroke(rr(0, 512), rr(0, 512), rr(6, 14), rr(0, 6.3), rr(-0.2, 0.2), 1, paintedGroundHsl(rr(55, 90), rr(22, 38), rr(24, 38), 0.85), 0.56);
    return paintedGroundFinish(s, {
      relief: 7,
      rough: 0.92,
      post: ({ size, height, rgb, random: rnd }) => {
        const lumps = paintedGroundTileNoise(size, 6, rnd, 4);
        for (let index = 0; index < size * size; index += 1) height[index] += (lumps[index] - 0.5) * 0.3;
        paintedGroundMottle(rgb, size, paintedGroundTileNoise(size, 3, rnd, 3), 0.84, 1.16);
      },
    });
  },

  /** Churned mud: hoof or foot prints, clods, straw trodden in, water standing in the low spots. */
  mud(random, { prints = 'hoof' } = {}) {
    const s = paintedGroundSheet(random, '#4a3727', 0.5);
    const { rr } = s;
    for (let index = 0; index < 45; index += 1) {
      const r = rr(5, 14);
      s.dome(rr(0, 512), rr(0, 512), r, r * rr(0.5, 0.9), rr(0, 3), paintedGroundHsl(28, rr(24, 32), rr(24, 30)), rr(0.64, 0.76), 0.5);
    }
    for (let index = 0; index < 160; index += 1) s.stroke(rr(0, 512), rr(0, 512), rr(8, 20), rr(0, 6.3), rr(-0.2, 0.2), rr(1, 1.6), paintedGroundHsl(rr(42, 55), rr(25, 35), rr(30, 40), 0.75), 0.56);
    const hooves = prints === 'foot' ? 0 : prints === 'mixed' ? 6 : 12;
    const feet = prints === 'hoof' ? 0 : prints === 'mixed' ? 9 : 14;
    for (let index = 0; index < hooves; index += 1) paintedGroundHoof(s, rr(0, 512), rr(0, 512), rr(0, 6.3), rr(0.75, 1.2), 'rgba(30,20,12,0.22)');
    for (let index = 0; index < feet; index += 1) paintedGroundFoot(s, rr(0, 512), rr(0, 512), rr(0, 6.3), rr(0.7, 0.85), 0.24, 'rgba(30,20,12,0.3)');
    return paintedGroundFinish(s, {
      relief: 5,
      rough: (h) => 0.5 + 0.42 * paintedGroundSmooth(0.25, 0.5, h),
      post: ({ size, height, rgb, random: rnd }) => {
        const lumps = paintedGroundTileNoise(size, 5, rnd, 4);
        const ruts = paintedGroundTileNoise(size, 12, rnd, 2);
        for (let index = 0; index < size * size; index += 1) {
          height[index] += (lumps[index] - 0.5) * 0.35 + (ruts[index] - 0.5) * 0.3;
          const wet = 0.62 + 0.5 * paintedGroundSmooth(0.15, 0.55, height[index]);
          for (let channel = 0; channel < 3; channel += 1) rgb[index * 4 + channel] *= Math.min(1.1, wet);
        }
      },
    });
  },

  /** The high plain: dusty ground, bunch grass in tufts, black and red volcanic grit. */
  drygrass(random) {
    const s = paintedGroundSheet(random, '#8a7c58', 0.4);
    const { rr } = s;
    for (let index = 0; index < 9000; index += 1) {
      const kind = random();
      const fill = kind < 0.45 ? paintedGroundHsl(20, 10, rr(14, 26)) : kind < 0.7 ? paintedGroundHsl(12, 40, rr(28, 38)) : paintedGroundHsl(40, 25, rr(62, 75));
      s.blob(rr(0, 512), rr(0, 512), rr(0.6, 1.5), rr(0.6, 1.5), 0, fill, rr(0.4, 0.6));
    }
    for (let index = 0; index < 60; index += 1) {
      const r = rr(3, 8);
      s.dome(rr(0, 512), rr(0, 512), r, r * rr(0.6, 0.9), rr(0, 3), random() < 0.5 ? paintedGroundHsl(15, 8, rr(16, 26)) : paintedGroundHsl(12, 35, rr(26, 34)), 0.95, 0.45);
    }
    for (let index = 0; index < 2400; index += 1) s.stroke(rr(0, 512), rr(0, 512), rr(5, 12), rr(0, 6.3), rr(-0.2, 0.2), 1, paintedGroundHsl(rr(40, 52), rr(25, 40), rr(48, 68), 0.9), 0.48);
    const tufts = 170;
    for (let tuft = 0; tuft < tufts; tuft += 1) {
      const cx = rr(0, 512);
      const cy = rr(0, 512);
      const reach = rr(10, 22);
      s.blob(cx, cy, reach * 0.35, reach * 0.35, 0, paintedGroundHsl(35, 25, 30, 0.8), 0.55);
      for (let blade = 0; blade < 50; blade += 1) {
        const t = blade / 50;
        const a = rr(0, 6.3);
        const start = rr(0, reach * 0.25);
        s.stroke(cx + Math.cos(a) * start, cy + Math.sin(a) * start, reach * rr(0.5, 1.1), a, rr(-0.25, 0.25), rr(1, 1.8),
          paintedGroundHsl(rr(38, 55), rr(22, 48), 40 + t * 28 + rr(-6, 6)), 0.55 + 0.42 * t);
      }
    }
    return paintedGroundFinish(s, {
      relief: 5,
      rough: 0.94,
      post: ({ size, rgb, random: rnd }) => paintedGroundMottle(rgb, size, paintedGroundTileNoise(size, 4, rnd, 3), 0.86, 1.12),
    });
  },

  /** Volcanic grit: black, grey and red cinders, pebbles, a few dead blades. */
  grit(random) {
    const s = paintedGroundSheet(random, '#7d6d5a', 0.5);
    const { rr } = s;
    for (let index = 0; index < 18000; index += 1) {
      const kind = random();
      const fill = kind < 0.25 ? paintedGroundHsl(20, 8, rr(14, 26)) : kind < 0.65 ? paintedGroundHsl(12, 38, rr(26, 40)) : kind < 0.85 ? paintedGroundHsl(30, 12, rr(40, 55)) : paintedGroundHsl(38, 30, rr(55, 70));
      const r = rr(0.6, 1.6);
      s.blob(rr(0, 512), rr(0, 512), r, r, 0, fill, rr(0.4, 0.75));
    }
    for (let index = 0; index < 170; index += 1) {
      const r = rr(2, 7);
      s.dome(rr(0, 512), rr(0, 512), r, r * rr(0.6, 0.9), rr(0, 3), random() < 0.6 ? paintedGroundHsl(15, 6, rr(12, 24)) : paintedGroundHsl(10, 40, rr(24, 34)), 0.95, 0.5);
    }
    for (let index = 0; index < 350; index += 1) s.stroke(rr(0, 512), rr(0, 512), rr(5, 12), rr(0, 6.3), rr(-0.2, 0.2), 1, paintedGroundHsl(rr(40, 50), rr(25, 40), rr(50, 66), 0.9), 0.56);
    return paintedGroundFinish(s, {
      relief: 4,
      rough: 0.96,
      post: ({ size, height, rgb, random: rnd }) => {
        const lumps = paintedGroundTileNoise(size, 6, rnd, 3);
        for (let index = 0; index < size * size; index += 1) height[index] += (lumps[index] - 0.5) * 0.2;
        paintedGroundMottle(rgb, size, paintedGroundTileNoise(size, 3, rnd, 3), 0.85, 1.15);
      },
    });
  },

  /**
   * Gobi-edge steppe (Mobei): short, sparse grass in thin clumps on grey-brown
   * gravel and grit, the ground between showing everywhere: a grazed, wind-dried
   * sward, not the high plain's bunch grass.
   */
  steppe(random) {
    const s = paintedGroundSheet(random, '#7e7458', 0.45);
    const { rr } = s;
    for (let index = 0; index < 12000; index += 1) {
      const kind = random();
      const fill = kind < 0.4 ? paintedGroundHsl(30, 8, rr(30, 42)) : kind < 0.8 ? paintedGroundHsl(36, 14, rr(44, 56)) : paintedGroundHsl(40, 18, rr(62, 72));
      s.blob(rr(0, 512), rr(0, 512), rr(0.6, 1.4), rr(0.6, 1.4), 0, fill, rr(0.4, 0.65));
    }
    for (let index = 0; index < 90; index += 1) {
      const r = rr(2, 5);
      s.dome(rr(0, 512), rr(0, 512), r, r * rr(0.6, 0.9), rr(0, 3), paintedGroundHsl(28, 6, rr(28, 44)), 0.9, 0.48);
    }
    for (let clump = 0; clump < 260; clump += 1) {
      const cx = rr(0, 512);
      const cy = rr(0, 512);
      const reach = rr(4, 10);
      for (let blade = 0; blade < 14; blade += 1) {
        s.stroke(cx + rr(-2, 2), cy + rr(-2, 2), reach * rr(0.5, 1), rr(0, 6.3), rr(-0.2, 0.2), rr(0.8, 1.3), paintedGroundHsl(rr(48, 70), rr(18, 34), rr(38, 56)), 0.56);
      }
    }
    return paintedGroundFinish(s, {
      relief: 4,
      rough: 0.95,
      post: ({ size, rgb, random: rnd }) => paintedGroundMottle(rgb, size, paintedGroundTileNoise(size, 4, rnd, 3), 0.86, 1.12),
    });
  },

  /** Bare gravel and grit, grey-brown (Mobei) or, `pale`, sand-coloured flint and limestone scree (Carrhae). */
  gravel(random, { pale = false } = {}) {
    const s = paintedGroundSheet(random, pale ? '#b8a07a' : '#6e6656', 0.5);
    const { rr } = s;
    const light = pale ? [58, 82] : [38, 60];
    for (let index = 0; index < 16000; index += 1) {
      const kind = random();
      const fill = kind < 0.3 ? paintedGroundHsl(28, 8, rr(light[0] - 16, light[0])) : kind < 0.8 ? paintedGroundHsl(34, pale ? 26 : 12, rr(...light)) : paintedGroundHsl(22, 20, rr(light[0] - 6, light[1] - 10));
      const r = rr(0.6, 1.8);
      s.blob(rr(0, 512), rr(0, 512), r, r * rr(0.7, 1), 0, fill, rr(0.45, 0.8));
    }
    for (let index = 0; index < 220; index += 1) {
      const r = rr(1.5, 5);
      s.dome(rr(0, 512), rr(0, 512), r, r * rr(0.6, 0.9), rr(0, 3), paintedGroundHsl(30, pale ? 18 : 8, rr(light[0] - 10, light[1])), 0.95, 0.5);
    }
    return paintedGroundFinish(s, {
      relief: 4,
      rough: 0.96,
      post: ({ size, height, rgb, random: rnd }) => {
        const lumps = paintedGroundTileNoise(size, 6, rnd, 3);
        for (let index = 0; index < size * size; index += 1) height[index] += (lumps[index] - 0.5) * 0.18;
        paintedGroundMottle(rgb, size, paintedGroundTileNoise(size, 3, rnd, 3), 0.88, 1.12);
      },
    });
  },

  /**
   * The Jazira's plain below Harran in summer (Carrhae): pale sand blown thin
   * over gravel, dry dead stalks, and camelthorn (Alhagi) in low grey-green tufts.
   */
  desert(random) {
    const s = paintedGroundSheet(random, '#c8b08a', 0.5);
    const { rr } = s;
    for (let index = 0; index < 10000; index += 1) {
      const kind = random();
      const fill = kind < 0.55 ? paintedGroundHsl(38, 38, rr(70, 84), 0.6) : kind < 0.9 ? paintedGroundHsl(32, 22, rr(52, 64), 0.55) : paintedGroundHsl(25, 12, rr(36, 46), 0.6);
      s.blob(rr(0, 512), rr(0, 512), rr(0.5, 1.2), rr(0.5, 1.2), 0, fill, null);
    }
    for (let index = 0; index < 120; index += 1) {
      const r = rr(1.5, 4);
      s.dome(rr(0, 512), rr(0, 512), r, r * 0.8, rr(0, 3), paintedGroundHsl(32, 20, rr(58, 74)), 0.9, 0.5);
    }
    for (let index = 0; index < 500; index += 1) s.stroke(rr(0, 512), rr(0, 512), rr(4, 9), rr(0, 6.3), rr(-0.3, 0.3), 0.8, paintedGroundHsl(rr(36, 44), rr(20, 32), rr(56, 68), 0.85), 0.52);
    for (let tuft = 0; tuft < 40; tuft += 1) {
      const cx = rr(0, 512);
      const cy = rr(0, 512);
      const reach = rr(6, 13);
      s.blob(cx, cy, reach * 0.4, reach * 0.4, 0, paintedGroundHsl(35, 20, 40, 0.5), 0.56);
      for (let twig = 0; twig < 30; twig += 1) s.stroke(cx, cy, reach * rr(0.4, 1), rr(0, 6.3), rr(-0.5, 0.5), rr(0.8, 1.4), paintedGroundHsl(rr(70, 95), rr(12, 24), rr(34, 48)), 0.6);
    }
    return paintedGroundFinish(s, {
      relief: 5,
      rough: 0.93,
      post: ({ size, rgb, random: rnd }) => paintedGroundMottle(rgb, size, paintedGroundTileNoise(size, 3, rnd, 3), 0.9, 1.1),
    });
  },

  /** Autumn grass trodden flat: long stalks lying one way, earth between. */
  trampled(random) {
    const s = paintedGroundSheet(random, '#5a5233', 0.4);
    const { rr } = s;
    const lean = paintedGroundTileNoise(64, 2, random, 2);
    for (let index = 0; index < 90; index += 1) s.blob(rr(0, 512), rr(0, 512), rr(10, 30), rr(6, 20), rr(0, 3), paintedGroundHsl(28, 30, rr(22, 30), 0.6), 0.3, 0.6);
    const stalks = 7500;
    for (let index = 0; index < stalks; index += 1) {
      const t = index / stalks;
      const x = rr(0, 512);
      const y = rr(0, 512);
      const angle = 0.5 + (lean[(Math.floor(y / 8) % 64) * 64 + (Math.floor(x / 8) % 64)] - 0.5) * 3 + rr(-0.35, 0.35);
      s.stroke(x, y, rr(14, 40), angle, rr(-0.12, 0.12), rr(1.2, 2.4), paintedGroundHsl(rr(38, 72), rr(22, 45), 26 + t * 26 + rr(-5, 5)), 0.45 + 0.35 * t);
    }
    return paintedGroundFinish(s, {
      relief: 5,
      rough: 0.88,
      post: ({ size, rgb, random: rnd }) => paintedGroundMottle(rgb, size, paintedGroundTileNoise(size, 4, rnd, 3), 0.84, 1.14),
    });
  },

  /** Arena sand raked in parallel furrows. */
  sandRaked(random) {
    const s = paintedGroundSheet(random, '#b88f5c', 0.5);
    const { rr } = s;
    for (let index = 0; index < 14000; index += 1) {
      const kind = random();
      const fill = kind < 0.4 ? paintedGroundHsl(36, 45, rr(70, 82), 0.6) : kind < 0.8 ? paintedGroundHsl(30, 30, rr(38, 50), 0.5) : paintedGroundHsl(12, 35, rr(40, 50), 0.6);
      s.blob(rr(0, 512), rr(0, 512), rr(0.5, 1.2), rr(0.5, 1.2), 0, fill, null);
    }
    for (let index = 0; index < 90; index += 1) {
      const r = rr(1, 2.6);
      s.dome(rr(0, 512), rr(0, 512), r, r * 0.8, rr(0, 3), paintedGroundHsl(rr(25, 40), rr(10, 30), rr(40, 70)), 0.85, 0.5);
    }
    return paintedGroundFinish(s, {
      relief: 6,
      rough: 0.95,
      post: ({ size, height, rgb, random: rnd }) => {
        const wobble = paintedGroundTileNoise(size, 3, rnd, 3);
        const depth = paintedGroundTileNoise(size, 4, rnd, 3);
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            const index = y * size + x;
            const phase = (y / size) * 28 + (wobble[index] - 0.5) * 1.6;
            const groove = 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);
            const amount = 0.6 + 0.4 * depth[index];
            height[index] += groove * 0.07 * amount + (rnd() - 0.5) * 0.025;
            const k = 0.92 + 0.12 * groove * amount;
            for (let channel = 0; channel < 3; channel += 1) rgb[index * 4 + channel] = Math.min(255, rgb[index * 4 + channel] * k);
          }
        }
      },
    });
  },

  /** Arena sand trodden: the rake lines gone, footprints and scuffs. */
  sandTrodden(random) {
    const s = paintedGroundSheet(random, '#b38a58', 0.5);
    const { rr } = s;
    for (let index = 0; index < 12000; index += 1) {
      const kind = random();
      const fill = kind < 0.4 ? paintedGroundHsl(36, 45, rr(70, 82), 0.6) : kind < 0.8 ? paintedGroundHsl(30, 30, rr(38, 50), 0.5) : paintedGroundHsl(12, 35, rr(40, 50), 0.6);
      s.blob(rr(0, 512), rr(0, 512), rr(0.5, 1.2), rr(0.5, 1.2), 0, fill, null);
    }
    for (let index = 0; index < 22; index += 1) {
      const x = rr(0, 512);
      const y = rr(0, 512);
      const a = rr(0, 6.3);
      const length = rr(40, 90);
      for (let step = 0; step < 6; step += 1) {
        const t = step / 6;
        s.dome(x + Math.cos(a) * length * t, y + Math.sin(a) * length * t, rr(6, 10), rr(4, 7), a, 'rgba(110,80,50,0.08)', 0.3, 0.5, 0.6);
      }
    }
    for (let index = 0; index < 12; index += 1) paintedGroundFoot(s, rr(0, 512), rr(0, 512), rr(0, 6.3), rr(0.85, 1.05), 0.34, 'rgba(110,75,40,0.16)');
    return paintedGroundFinish(s, {
      relief: 6,
      rough: 0.95,
      post: ({ size, height, rgb, random: rnd }) => {
        const lumps = paintedGroundTileNoise(size, 6, rnd, 4);
        for (let index = 0; index < size * size; index += 1) height[index] += (lumps[index] - 0.5) * 0.18 + (rnd() - 0.5) * 0.025;
        paintedGroundMottle(rgb, size, paintedGroundTileNoise(size, 3, rnd, 3), 0.9, 1.08);
      },
    });
  },

  /** Setts in staggered rows; mud and straw in the joints. `worn`: the same stones, polished paler, joints filled. */
  cobbles(random, { worn = false } = {}) {
    const s = paintedGroundSheet(random, worn ? '#4d3f2e' : '#3a3229', worn ? 0.3 : 0.12);
    const { rr } = s;
    // The joints first, so the stones cover all but what lies between them.
    for (let index = 0; index < 120; index += 1) s.blob(rr(0, 512), rr(0, 512), rr(4, 12), rr(3, 9), rr(0, 3), paintedGroundHsl(30, 30, rr(18, 28), 0.7), worn ? 0.32 : 0.2, 0.7);
    for (let index = 0; index < (worn ? 300 : 600); index += 1) s.stroke(rr(0, 512), rr(0, 512), rr(6, 14), rr(0, 6.3), rr(-0.2, 0.2), 1.2, paintedGroundHsl(rr(42, 52), rr(40, 55), rr(48, 62)), worn ? 0.36 : 0.26);
    const rows = 16;
    const columns = 14;
    const cellW = 512 / columns;
    const cellH = 512 / rows;
    // One seeded generator for the stones, so the worn layer has the same stones as the plain one.
    const stones = paintedGroundRandom('painted:cobbles');
    const sr = (a, b) => a + (b - a) * stones();
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const cx = (column + 0.5 + (row % 2) * 0.5 + sr(-0.12, 0.12)) * cellW;
        const cy = (row + 0.5) * cellH + sr(-1.5, 1.5);
        const hw = (cellW * sr(0.72, 0.9)) / 2;
        const hh = (cellH * sr(0.72, 0.88)) / 2;
        const turn = sr(-0.16, 0.16);
        const family = stones();
        const lightness = family < 0.5 ? sr(32, 50) : family < 0.85 ? sr(30, 42) : sr(36, 46);
        const fill = family < 0.5 ? paintedGroundHsl(32, 12, lightness + (worn ? 14 : 0)) : family < 0.85 ? paintedGroundHsl(24, 24, lightness + (worn ? 14 : 0)) : paintedGroundHsl(40, 6, lightness - 4 + (worn ? 13 : 0));
        const top = sr(0.86, 1);
        s.wrap(cx, cy, Math.max(hw, hh) + 2, (X, Y) => {
          const radius = Math.min(hw, hh) * 0.65;
          const shape = (context) => {
            context.beginPath();
            context.moveTo(-hw + radius, -hh);
            context.arcTo(hw, -hh, hw, hh, radius);
            context.arcTo(hw, hh, -hw, hh, radius);
            context.arcTo(-hw, hh, -hw, -hh, radius);
            context.arcTo(-hw, -hh, hw, -hh, radius);
            context.closePath();
          };
          for (const context of [s.colour, s.height]) {
            context.save();
            context.translate(X, Y);
            context.rotate(turn);
            shape(context);
            if (context === s.colour) {
              context.fillStyle = fill;
              context.fill();
              context.strokeStyle = 'rgba(30,24,18,0.35)';
              context.lineWidth = 2.5;
              context.stroke();
            } else {
              const gradient = context.createRadialGradient(sr(-2, 2), sr(-2, 2), 0, 0, 0, Math.max(hw, hh) * 1.05);
              gradient.addColorStop(0, paintedGroundGrey(worn ? top * 0.82 : top));
              gradient.addColorStop(worn ? 0.7 : 0.55, paintedGroundGrey(worn ? top * 0.8 : top * 0.88));
              gradient.addColorStop(1, paintedGroundGrey(worn ? 0.42 : 0.38));
              context.fillStyle = gradient;
              context.fill();
            }
            context.restore();
          }
        });
      }
    }
    return paintedGroundFinish(s, {
      relief: worn ? 5 : 6,
      rough: (h) => (h < 0.36 ? 0.95 : worn ? 0.62 : 0.82),
      post: ({ size, rgb, random: rnd }) => {
        const speckle = paintedGroundTileNoise(size, 64, rnd, 2);
        paintedGroundMottle(rgb, size, speckle, 0.85, 1.12);
        paintedGroundMottle(rgb, size, paintedGroundTileNoise(size, 3, rnd, 3), 0.88, 1.1);
      },
    });
  },

  /**
   * Granite paving of a Jiangnan water town, 2.4 m a sheet: long slabs laid
   * in courses across the street, grey to blue-grey, their edges worn round,
   * moss and grass in the joints, a few cracked.
   */
  slabs(random) {
    const s = paintedGroundSheet(random, '#3c4434', 0.3);
    const { rr } = s;
    // Moss and earth in the joints, under everything.
    for (let index = 0; index < 400; index += 1) s.stroke(rr(0, 512), rr(0, 512), rr(4, 10), rr(0, 6.3), rr(-0.3, 0.3), 1.2, paintedGroundHsl(rr(70, 100), rr(30, 45), rr(22, 34)), 0.3);
    const rows = 5;
    const rowH = 512 / rows;
    for (let row = 0; row < rows; row += 1) {
      let x = rr(0, 120);
      const end = x + 512;
      while (x < end - 50) {
        const length = Math.min(end - x, rr(130, 240));
        const y = row * rowH;
        const lightness = rr(36, 54);
        // Mostly warm grey granite, a few cooler slabs; the morning sky lights them blue enough.
        const fill = random() < 0.85 ? paintedGroundHsl(rr(28, 45), rr(7, 13), lightness) : paintedGroundHsl(rr(60, 90), rr(4, 8), lightness - 3);
        const w = length - rr(3, 6);
        const h = rowH - rr(3, 6);
        const cracked = random() < 0.15 ? rr(-w / 3, w / 3) : null;
        const bends = [rr(-8, 8), rr(-8, 8)];
        s.wrap(x + length / 2, y + rowH / 2, length, (X, Y) => {
          s.colour.fillStyle = fill;
          s.colour.fillRect(X - w / 2, Y - h / 2, w, h);
          // Worn: paler down the middle where feet go.
          const glow = s.colour.createRadialGradient(X, Y, 0, X, Y, w / 2);
          glow.addColorStop(0, 'rgba(255,255,250,0.1)');
          glow.addColorStop(1, 'rgba(255,255,250,0)');
          s.colour.fillStyle = glow;
          s.colour.fillRect(X - w / 2, Y - h / 2, w, h);
          const face = s.height.createLinearGradient(0, Y - h / 2, 0, Y + h / 2);
          face.addColorStop(0, paintedGroundGrey(0.6));
          face.addColorStop(0.08, paintedGroundGrey(0.84));
          face.addColorStop(0.5, paintedGroundGrey(0.8));
          face.addColorStop(0.92, paintedGroundGrey(0.84));
          face.addColorStop(1, paintedGroundGrey(0.6));
          s.height.fillStyle = face;
          s.height.fillRect(X - w / 2, Y - h / 2, w, h);
          if (cracked !== null) {
            for (const [context, style] of [[s.colour, 'rgba(30,34,26,0.7)'], [s.height, paintedGroundGrey(0.4)]]) {
              context.strokeStyle = style;
              context.lineWidth = 1.5;
              context.beginPath();
              context.moveTo(X + cracked, Y - h / 2);
              context.lineTo(X + cracked + bends[0], Y);
              context.lineTo(X + cracked + bends[1], Y + h / 2);
              context.stroke();
            }
          }
        });
        x += length;
      }
    }
    // Moss creeping out of the joints onto the stones' edges.
    for (let index = 0; index < 220; index += 1) {
      const y = Math.round(rr(0, rows)) * rowH + rr(-3, 3);
      s.blob(rr(0, 512), y, rr(3, 10), rr(1.5, 4), 0, paintedGroundHsl(rr(75, 100), rr(30, 45), rr(24, 36), 0.6), null);
    }
    return paintedGroundFinish(s, {
      relief: 5,
      rough: (h) => (h < 0.5 ? 0.97 : 0.88),
      post: ({ size, rgb, random: rnd }) => {
        paintedGroundMottle(rgb, size, paintedGroundTileNoise(size, 64, rnd, 2), 0.88, 1.1);
        paintedGroundMottle(rgb, size, paintedGroundTileNoise(size, 4, rnd, 3), 0.9, 1.08);
      },
    });
  },

  /** Dry beach sand: wind ripples with dark grains in the troughs, shells and shell grit. */
  beachDry(random) {
    const s = paintedGroundSheet(random, '#d0a66a', 0.5);
    const { rr } = s;
    for (let index = 0; index < 9000; index += 1) {
      const kind = random();
      const fill = kind < 0.5 ? paintedGroundHsl(40, 45, rr(78, 90), 0.6) : kind < 0.85 ? paintedGroundHsl(35, 25, rr(50, 62), 0.5) : paintedGroundHsl(20, 10, rr(25, 35), 0.6);
      s.blob(rr(0, 512), rr(0, 512), rr(0.5, 1.1), rr(0.5, 1.1), 0, fill, null);
    }
    for (let index = 0; index < 30; index += 1) {
      const x = rr(0, 512);
      const y = rr(0, 512);
      const r = rr(4, 9);
      const a = rr(0, 6.3);
      const tone = random() < 0.6 ? paintedGroundHsl(35, 30, rr(88, 95)) : paintedGroundHsl(12, 45, rr(78, 86));
      s.dome(x, y, r, r * 0.8, a, tone, 0.9, 0.5);
      for (let rib = -3; rib <= 3; rib += 1) s.stroke(x, y, r * 0.9, a + rib * 0.32 + Math.PI / 2, 0, 0.7, 'rgba(120,95,70,0.35)', 0.75, 0.5);
    }
    for (let index = 0; index < 40; index += 1) s.blob(rr(0, 512), rr(0, 512), rr(0.8, 1.8), rr(0.6, 1.3), rr(0, 3), paintedGroundHsl(35, 20, rr(72, 84)), 0.62);
    for (let index = 0; index < 4; index += 1) paintedGroundFoot(s, rr(0, 512), rr(0, 512), rr(0, 6.3), 0.95, 0.36, 'rgba(120,95,60,0.08)');
    return paintedGroundFinish(s, {
      relief: 6,
      rough: 0.92,
      post: ({ size, height, rgb, random: rnd }) => {
        const wander = paintedGroundTileNoise(size, 3, rnd, 3);
        const fine = paintedGroundTileNoise(size, 8, rnd, 2);
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            const index = y * size + x;
            const phase = (x / size) * 20 + (y / size) * 2 + (wander[index] - 0.5) * 2.4 + (fine[index] - 0.5) * 0.4;
            const f = phase - Math.floor(phase);
            let profile = f < 0.72 ? f / 0.72 : (1 - f) / 0.28;
            profile = profile * profile * (3 - 2 * profile);
            height[index] += 0.05 * profile * (0.35 + 0.65 * fine[index]) + (rnd() - 0.5) * 0.02;
            let k = 0.93 + 0.08 * profile;
            if (profile < 0.18 && rnd() < 0.3) k *= 0.62;
            for (let channel = 0; channel < 3; channel += 1) rgb[index * 4 + channel] = Math.min(255, rgb[index * 4 + channel] * k);
          }
        }
      },
    });
  },

  /** Wet sand below the tide line: smooth, darker, faint backwash ripples, worm holes, small shells. */
  beachWet(random) {
    const s = paintedGroundSheet(random, '#8e6c44', 0.5);
    const { rr } = s;
    for (let index = 0; index < 6000; index += 1) s.blob(rr(0, 512), rr(0, 512), rr(0.5, 1.1), rr(0.5, 1.1), 0, random() < 0.6 ? paintedGroundHsl(35, 30, rr(60, 72), 0.5) : paintedGroundHsl(25, 15, rr(25, 38), 0.5), null);
    for (let index = 0; index < 70; index += 1) {
      const x = rr(0, 512);
      const y = rr(0, 512);
      s.dome(x, y, 3.2, 3.2, 0, null, 0.64, 0.5);
      s.dome(x, y, 1.3, 1.3, 0, 'rgba(40,30,20,0.8)', 0.2, 0.5);
    }
    for (let index = 0; index < 18; index += 1) {
      const r = rr(2.5, 6);
      s.dome(rr(0, 512), rr(0, 512), r, r * 0.8, rr(0, 3), random() < 0.6 ? paintedGroundHsl(35, 25, rr(80, 90)) : paintedGroundHsl(12, 40, rr(70, 80)), 0.85, 0.5);
    }
    return paintedGroundFinish(s, {
      relief: 6,
      rough: 0.42,
      post: ({ size, height, rgb, random: rnd }) => {
        const wander = paintedGroundTileNoise(size, 2, rnd, 3);
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            const index = y * size + x;
            const phase = (x / size) * 12 + (wander[index] - 0.5) * 3;
            height[index] += 0.03 * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2));
          }
        }
        paintedGroundMottle(rgb, size, paintedGroundTileNoise(size, 3, rnd, 3), 0.88, 1.1);
      },
    });
  },

  /** Concrete: aggregate, a broom finish, pits, cracks and oil stains. `worn`: darker, smoother, more stained. */
  concrete(random, { worn = false } = {}) {
    const s = paintedGroundSheet(random, worn ? '#525356' : '#626366', 0.5);
    const { rr } = s;
    for (let index = 0; index < 9000; index += 1) {
      const r = rr(0.5, 1.6);
      s.blob(rr(0, 512), rr(0, 512), r, r, 0, paintedGroundHsl(rr(20, 220), rr(0, 8), rr(30, 70), 0.6), rr(0.48, 0.62));
    }
    for (let index = 0; index < 220; index += 1) s.blob(rr(0, 512), rr(0, 512), rr(0.8, 2), rr(0.8, 2), 0, 'rgba(25,25,28,0.7)', 0.2);
    for (let index = 0; index < (worn ? 3 : 1); index += 1) s.blob(rr(0, 512), rr(0, 512), rr(30, 70), rr(20, 45), rr(0, 3), 'rgba(18,18,22,0.14)', null);
    for (let crack = 0; crack < (worn ? 1 : 2); crack += 1) {
      let x = rr(0, 512);
      let y = rr(0, 512);
      let a = rr(0, 6.3);
      for (let step = 0; step < 45; step += 1) {
        a += rr(-0.35, 0.35);
        const nx = x + Math.cos(a) * 4;
        const ny = y + Math.sin(a) * 4;
        s.wrap(x, y, 8, (X, Y) => {
          for (const [context, style, width] of [[s.colour, 'rgba(20,20,24,0.85)', 1.2], [s.height, paintedGroundGrey(0.22), 2.2]]) {
            context.strokeStyle = style;
            context.lineWidth = width;
            context.beginPath();
            context.moveTo(X, Y);
            context.lineTo(X + nx - x, Y + ny - y);
            context.stroke();
          }
        });
        x = (nx + 512) % 512;
        y = (ny + 512) % 512;
      }
    }
    return paintedGroundFinish(s, {
      relief: 5,
      rough: (h, rgb, at) => (worn ? 0.42 : 0.55) + 0.25 * (rgb[at] / 255) - (h < 0.3 ? 0.1 : 0),
      post: ({ size, height, rgb, random: rnd }) => {
        const wander = paintedGroundTileNoise(size, 4, rnd, 2);
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            const index = y * size + x;
            height[index] += 0.012 * Math.sin(((y / size) * 110 + (wander[index] - 0.5) * 3) * Math.PI * 2) + (rnd() - 0.5) * 0.02;
          }
        }
        paintedGroundMottle(rgb, size, paintedGroundTileNoise(size, 3, rnd, 4), 0.82, 1.12);
      },
    });
  },
};

/** Each layer once per page, shared by the places that use it. */
const paintedGroundLayerCache = new Map();
function paintedGroundLayer(name) {
  if (!paintedGroundLayerCache.has(name)) {
    const [painter, variant] = name.split(':');
    const options = { 'grass:flowers': { flowers: true }, 'mud:foot': { prints: 'foot' }, 'mud:mixed': { prints: 'mixed' }, 'cobbles:worn': { worn: true }, 'concrete:worn': { worn: true }, 'gravel:pale': { pale: true } }[name] ?? {};
    void variant;
    const started = performance.now();
    paintedGroundLayerCache.set(name, PAINTED_GROUND_LAYERS[painter](paintedGroundRandom(`painted:${name}`), options));
    paintedGroundLayerCache.get(name).ms = Math.round(performance.now() - started);
  }
  return paintedGroundLayerCache.get(name);
}

let paintedGroundNoiseTexture = null;
/** 128² tileable noise, four independent channels: which sample of A, of B, brightness, wear. */
function paintedGroundNoise() {
  if (paintedGroundNoiseTexture) return paintedGroundNoiseTexture;
  const size = 128;
  const random = paintedGroundRandom('painted:noise');
  const channels = [0, 1, 2, 3].map(() => paintedGroundTileNoise(size, 4, random, 4));
  const data = new Uint8Array(size * size * 4);
  for (let index = 0; index < size * size; index += 1) {
    for (let channel = 0; channel < 4; channel += 1) data[index * 4 + channel] = Math.max(0, Math.min(255, (channels[channel][index] - 0.5) * 2.2 * 255 + 128));
  }
  paintedGroundNoiseTexture = paintedGroundDataTexture(data, size, true);
  return paintedGroundNoiseTexture;
}

// ---- the places ------------------------------------------------------------------

const PAINTED_GROUND_GRASS_MACRO = [[1.14, 1.04, 0.78], [0.86, 1.0, 0.9]];
const PAINTED_GROUND_DRY_MACRO = [[1.06, 0.98, 0.9], [0.92, 0.95, 1.0]];
const PAINTED_GROUND_SAND_MACRO = [[1.04, 1.0, 0.95], [0.95, 0.95, 0.97]];
const PAINTED_GROUND_STONE_MACRO = [[1.06, 1.01, 0.95], [0.9, 0.92, 0.95]];

/**
 * Per place: the two layers and their tile (m), how each is broken up
 * (0 none, 1 a rotated second sample, 2 a shifted one), the macro tint,
 * wetness [darken, roughness, fill-the-low-spots, flatten], a decal colour
 * and roughness, the foothills' keepOut (fade the detail out beyond it),
 * how far to match the place's own mean colour, and the layout: (x, z) →
 * [B share, macro, wetness, decal], 0..1 each. `pools`: its wettest spots are
 * standing water (blood dissolves in them), a cloud spreading at most that far (m).
 */
const PAINTED_GROUND_PLACES = {
  meadow: {
    a: 'grass:flowers', b: 'dirt', tiles: [1.4, 1.3], bomb: [1, 1], macro: PAINTED_GROUND_GRASS_MACRO, keepOut: [13, 11], match: 0.85,
    layout: (x, z, f) => {
      const trackZ = -3.2 + 0.16 * x + 1.4 * Math.sin(x / 6.5);
      const edge = Math.abs(z - trackZ) + (f(x * 0.6, z * 0.6, 1) - 0.5) * 1.2;
      let worn = 1 - paintedGroundSmooth(0.5, 1.1, edge);
      const reach = Math.hypot(x, z);
      worn = Math.max(worn, paintedGroundSmooth(0.5, 0.72, f(x * 0.4, z * 0.4, 2)) * (1 - paintedGroundSmooth(2.5, 6, reach)));
      worn = Math.max(worn, paintedGroundSmooth(0.66, 0.8, f(x * 0.2, z * 0.2, 3)) * 0.85);
      return [worn, f(x * 0.05, z * 0.05, 4) * 0.7 + f(x * 0.3, z * 0.3, 5) * 0.3, 0, 0];
    },
  },
  field: {
    a: 'grass', b: 'mud:hoof', tiles: [1.4, 1.6], bomb: [1, 1], macro: PAINTED_GROUND_GRASS_MACRO, keepOut: [32, 22], match: 0.85,
    wet: [0.7, 0.18, 2, 0.7], env: 1, envSplit: [0.15, 0.8], pools: 0.8,
    layout: (x, z, f) => {
      const ex = Math.abs(x) - 25 + (f(x * 0.1, z * 0.1, 6) - 0.5) * 5;
      const ez = Math.abs(z) - 8 + (f(x * 0.15, z * 0.15, 7) - 0.5) * 4;
      let churn = (1 - paintedGroundSmooth(-1, 1.5, ez)) * (1 - paintedGroundSmooth(-2, 2, ex));
      churn *= 0.7 + 0.45 * f(x * 0.5, z * 0.5, 8);
      const wet = paintedGroundSmooth(0.6, 0.72, f(x * 0.3, z * 0.3, 9)) * churn * 0.8;
      return [Math.min(1, churn), f(x * 0.04, z * 0.04, 10) * 0.7 + f(x * 0.25, z * 0.25, 11) * 0.3, wet, 0];
    },
  },
  plain: {
    a: 'drygrass', b: 'grit', tiles: [1.6, 1.3], bomb: [1, 1], macro: PAINTED_GROUND_DRY_MACRO, keepOut: [14, 10], match: 0.85,
    layout: (x, z, f) => {
      const reach = Math.hypot(x, z);
      const grit = paintedGroundSmooth(0.5, 0.66, f(x * 0.16, z * 0.16, 12) * 0.75 + f(x * 0.8, z * 0.8, 13) * 0.25 + (1 - paintedGroundSmooth(2, 8, reach)) * 0.15);
      return [grit, f(x * 0.05, z * 0.05, 14) * 0.7 + f(x * 0.3, z * 0.3, 15) * 0.3, 0, 0];
    },
  },
  // The Gobi's edge: sparse steppe grass, bare gravel in patches and in long wind-scoured streaks.
  mobei: {
    a: 'steppe', b: 'gravel', tiles: [1.6, 1.4], bomb: [1, 1], macro: PAINTED_GROUND_DRY_MACRO, keepOut: [32, 22], match: 0.85,
    layout: (x, z, f) => {
      const streak = f(x * 0.05, z * 0.22, 50);
      const bare = paintedGroundSmooth(0.5, 0.68, f(x * 0.14, z * 0.14, 51) * 0.7 + streak * 0.3);
      return [bare, f(x * 0.04, z * 0.04, 52) * 0.7 + f(x * 0.3, z * 0.3, 53) * 0.3, 0, 0];
    },
  },
  // Champagne: summer grass, churned to earth across the middle where the horse rode and the lines met.
  catalaunian: {
    a: 'grass', b: 'mud:hoof', tiles: [1.4, 1.6], bomb: [1, 1], macro: PAINTED_GROUND_GRASS_MACRO, keepOut: [32, 22], match: 0.85,
    layout: (x, z, f) => {
      const ex = Math.abs(x) - 22 + (f(x * 0.1, z * 0.1, 54) - 0.5) * 6;
      const ez = Math.abs(z) - 9 + (f(x * 0.15, z * 0.15, 55) - 0.5) * 5;
      let churn = (1 - paintedGroundSmooth(-1, 2, ez)) * (1 - paintedGroundSmooth(-2, 3, ex));
      churn *= 0.55 + 0.45 * f(x * 0.5, z * 0.5, 56);
      return [Math.min(1, churn), f(x * 0.04, z * 0.04, 57) * 0.7 + f(x * 0.25, z * 0.25, 58) * 0.3, 0, 0];
    },
  },
  // Below Harran: sand over gravel, the gravel bared in patches.
  carrhae: {
    a: 'desert', b: 'gravel:pale', tiles: [1.8, 1.4], bomb: [2, 1], macro: PAINTED_GROUND_SAND_MACRO, keepOut: [32, 22], match: 0.7,
    layout: (x, z, f) => {
      const bare = paintedGroundSmooth(0.55, 0.7, f(x * 0.12, z * 0.12, 59) * 0.75 + f(x * 0.6, z * 0.6, 60) * 0.25);
      return [bare, f(x * 0.05, z * 0.05, 61) * 0.7 + f(x * 0.3, z * 0.3, 62) * 0.3, 0, 0];
    },
  },
  sengoku: {
    a: 'trampled', b: 'mud:mixed', tiles: [1.8, 1.6], bomb: [1, 1], macro: PAINTED_GROUND_GRASS_MACRO, keepOut: [13, 9], match: 0.85,
    wet: [0.68, 0.14, 2, 0.75], env: 1, envSplit: [0.15, 0.8], pools: 0.8,
    layout: (x, z, f) => {
      const box = Math.max(Math.abs(x) / 10, Math.abs(z) / 6);
      const mud = paintedGroundSmooth(0.42, 0.6, f(x * 0.25, z * 0.25, 16) * 0.8 + (1 - paintedGroundSmooth(0.5, 1.2, box)) * 0.35);
      const wet = paintedGroundSmooth(0.58, 0.72, f(x * 0.3 + 5, z * 0.3, 17)) * mud * 0.9;
      return [mud, f(x * 0.05, z * 0.05, 18) * 0.7 + f(x * 0.3, z * 0.3, 19) * 0.3, wet, 0];
    },
  },
  colosseum: {
    a: 'sandRaked', b: 'sandTrodden', tiles: [1.5, 1.7], bomb: [2, 1], macro: PAINTED_GROUND_SAND_MACRO, match: 0.3,
    decal: [0.33, 0.13, 0.08, 0.7], decalRough: 0.6,
    layout: (x, z, f, random) => {
      const ring = Math.hypot(x / 6, z / 4.2) + (f(x * 0.35, z * 0.35, 20) - 0.5) * 0.45;
      const trodden = 1 - paintedGroundSmooth(0.65, 1.05, ring);
      let stain = 0;
      for (const [sx, sz, r] of PAINTED_GROUND_STAINS) {
        const d = Math.hypot(x - sx, z - sz) / r;
        stain = Math.max(stain, paintedGroundSmooth(0.4, 0.65, Math.exp(-d * d) * (0.55 + 0.7 * f(x * 2.5, z * 2.5, 21))));
      }
      void random;
      return [trodden, f(x * 0.12, z * 0.12, 22) * 0.6 + f(x * 0.5, z * 0.5, 23) * 0.4, 0, stain];
    },
  },
  town: {
    a: 'cobbles', b: 'cobbles:worn', tiles: [2, 2], bomb: [0, 0], macro: PAINTED_GROUND_STONE_MACRO, match: 0.15,
    decal: [0.29, 0.23, 0.16, 0.9], decalRough: 0.5, wet: [0.8, 0.35, 1.5, 0.3],
    layout: (x, z, f) => {
      const wear = 1 - paintedGroundSmooth(2.2, 4.8, Math.abs(z - 0.8 * Math.sin(x / 9)) + (f(x * 0.3, z * 0.3, 24) - 0.5) * 1.6);
      const mud = paintedGroundSmooth(0.62, 0.74, f(x * 0.3, z * 0.3, 25)) * paintedGroundSmooth(2.5, 5, Math.abs(z));
      return [wear, f(x * 0.06, z * 0.06, 26) * 0.6 + f(x * 0.35, z * 0.35, 27) * 0.4, mud * 0.5, mud];
    },
  },
  // The water town's square: granite slabs, grass and moss growing in from the edges by the houses and the canal, damp in the morning.
  jiangnan: {
    a: 'slabs', b: 'grass', tiles: [2.4, 1.4], bomb: [0, 1], macro: PAINTED_GROUND_STONE_MACRO, match: 0.15,
    wet: [0.85, 0.55, 1.5, 0.3],
    layout: (x, z, f) => {
      // How far into the margins: the house fronts (x = ±19.5, z = −15.5) and the canal's edge (z = 11.8).
      const margin = Math.max(Math.abs(x) - 16.8, -z - 12.8, z - 10.4);
      const grass = paintedGroundSmooth(0, 2, margin + (f(x * 0.4, z * 0.4, 40) - 0.5) * 2.2) * 0.9 + paintedGroundSmooth(0.7, 0.82, f(x * 0.25, z * 0.25, 41)) * 0.45;
      const wet = paintedGroundSmooth(0.6, 0.75, f(x * 0.3, z * 0.3, 42)) * 0.6;
      return [Math.min(1, grass), f(x * 0.06, z * 0.06, 43) * 0.6 + f(x * 0.35, z * 0.35, 44) * 0.4, wet, 0];
    },
  },
  coastFort: {
    a: 'beachDry', b: 'beachWet', tiles: [1.6, 1.6], bomb: [2, 1], macro: PAINTED_GROUND_SAND_MACRO, match: 0.35,
    wet: [0.55, 0.22, 1, 0.6], env: 1, envSplit: [0.15, 0.55], decal: [0.42, 0.34, 0.24, 0.8], decalRough: 0.8,
    layout: (x, z, f) => paintedGroundShore(x, z, f, 28),
  },
  coastVillage: {
    a: 'beachDry', b: 'beachWet', tiles: [1.6, 1.6], bomb: [2, 1], macro: PAINTED_GROUND_SAND_MACRO, match: 0.35,
    wet: [0.55, 0.22, 1, 0.6], env: 1, envSplit: [0.15, 0.55], decal: [0.2, 0.22, 0.12, 0.9], decalRough: 0.3,
    layout: (x, z, f) => paintedGroundShore(x, z, f, 29),
  },
  port: {
    a: 'concrete', b: 'concrete:worn', tiles: [2.2, 2.6], bomb: [1, 1], macro: PAINTED_GROUND_STONE_MACRO, match: 0.5, quay: true,
    wet: [0.62, 0.06, 3, 0.95], env: 1, envSplit: [0.5, 2.5], pools: 1,
    layout: (x, z, f) => {
      let puddle = paintedGroundSmooth(0.58, 0.66, f(x * 0.22, z * 0.22, 30));
      for (const [px, pz, r] of [[1.8, 1.4, 1.3], [-2.6, -1.4, 1.0], [4.5, -3.2, 1.6]]) {
        const d = Math.hypot((x - px) / r, (z - pz) / (r * 0.7)) + (f(x * 1.2, z * 1.2, 31) - 0.5) * 0.5;
        puddle = Math.max(puddle, 1 - paintedGroundSmooth(0.7, 1.05, d));
      }
      const damp = 0.25 + 0.15 * paintedGroundSmooth(2, 9, z);
      return [paintedGroundSmooth(0.4, 0.6, f(x * 0.12, z * 0.12, 32)), f(x * 0.08, z * 0.08, 33) * 0.6 + f(x * 0.4, z * 0.4, 34) * 0.4, Math.max(damp, puddle), 0];
    },
  },
};

/** Where the blood soaked into the colosseum sand (x, z, radius m). */
const PAINTED_GROUND_STAINS = [[1.2, 0.8, 0.35], [-2.4, 1.6, 0.5], [3.1, -1.9, 0.3], [-0.9, -2.2, 0.42], [-4.6, -0.6, 0.28]];

/** The shore (sea at +x): dry sand, the wrack line, wet sand darkening to a glaze at the water. */
function paintedGroundShore(x, z, f, seed) {
  const tide = 4.5 + 1.2 * Math.sin(z * 0.21) + 0.6 * Math.sin(z * 0.57 + 1) + (f(x * 0.2, z * 0.2, seed) - 0.5) * 1.2;
  const wetSand = paintedGroundSmooth(tide - 0.3, tide + 1.2, x);
  const glaze = paintedGroundSmooth(tide + 0.5, tide + 9, x) * 0.85 + wetSand * 0.25;
  const line = Math.abs(x - (tide - 0.7)) + (f(x * 2, z * 2, seed + 1) - 0.5) * 0.35;
  const wrack = (1 - paintedGroundSmooth(0.1, 0.42, line)) * paintedGroundSmooth(0.32, 0.55, f(x * 1.3, z * 1.3, seed + 2));
  return [wetSand, f(x * 0.06, z * 0.06, seed + 3) * 0.6 + f(x * 0.4, z * 0.4, seed + 4) * 0.4, Math.min(1, glaze), wrack];
}

/** The place's layout over the box its ground covers. */
function paintedGroundLayout(spec, box, random) {
  const size = Math.max(box.w, box.d) > 100 ? 512 : Math.max(box.w, box.d) > 40 ? 384 : 256;
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j += 1) {
    const z = box.z0 + ((j + 0.5) / size) * box.d;
    for (let i = 0; i < size; i += 1) {
      const x = box.x0 + ((i + 0.5) / size) * box.w;
      const value = spec.layout(x, z, paintedGroundFbm, random);
      const at = (j * size + i) * 4;
      for (let channel = 0; channel < 4; channel += 1) data[at + channel] = Math.max(0, Math.min(1, value[channel])) * 255;
    }
  }
  return { texture: paintedGroundDataTexture(data, size, false), bytes: size * size * 4 * 4 / 3 };
}

/** The mean colour of a ground's own painted map (8×8 average), or null. */
function paintedGroundMeanOf(map) {
  if (!map?.image) return null;
  const small = Object.assign(document.createElement('canvas'), { width: 8, height: 8 });
  const paint = small.getContext('2d');
  paint.drawImage(map.image, 0, 0, 8, 8);
  const data = paint.getImageData(0, 0, 8, 8).data;
  const mean = [0, 0, 0];
  for (let index = 0; index < data.length; index += 4) for (let channel = 0; channel < 3; channel += 1) mean[channel] += data[index + channel] / 255 / 64;
  return mean;
}

// ---- the material ------------------------------------------------------------------

/** Wetness from which a painted puddle is standing water (smoothstep edges). */
const PAINTED_GROUND_POOL = [0.5, 0.75];

const PAINTED_GROUND_FRAGMENT_HEAD = `
uniform sampler2D uPgColA;
uniform sampler2D uPgNrmA;
uniform sampler2D uPgColB;
uniform sampler2D uPgNrmB;
uniform sampler2D uPgLayout;
uniform sampler2D uPgNoise;
uniform vec4 uPgLayoutBox;
uniform vec2 uPgTile;
uniform vec2 uPgBomb;
uniform vec3 uPgMacroLow;
uniform vec3 uPgMacroHigh;
uniform vec3 uPgCalib;
uniform vec4 uPgWet;
uniform vec4 uPgDecal;
uniform float uPgDecalRough;
uniform vec4 uPgFade;
uniform float uPgRelief;
uniform float uPgOrigRough;
uniform vec2 uPgEnv;
varying vec3 vPaintedWorld;
#ifdef PAINTED_POOLS
${BLOOD_DYE_GLSL}
#endif
vec2 pgRot(vec2 p) { return vec2(0.6 * p.x - 0.8 * p.y, 0.8 * p.x + 0.6 * p.y); }
vec2 pgUnrot(vec2 p) { return vec2(0.6 * p.x + 0.8 * p.y, -0.8 * p.x + 0.6 * p.y); }
void pgLayer(sampler2D colTex, sampler2D nrmTex, vec2 p, float tile, float bomb, float pick, out vec4 c, out vec4 n) {
  vec2 u1 = p / tile;
  c = texture2D(colTex, u1);
  n = texture2D(nrmTex, u1);
  n.xyz = n.xyz * 2.0 - 1.0;
  if (bomb > 0.5) {
    vec2 u2 = bomb > 1.5 ? u1 + vec2(0.37, 0.61) : pgRot(p) / (tile * 1.37) + vec2(0.37, 0.61);
    vec4 c2 = texture2D(colTex, u2);
    vec4 n2 = texture2D(nrmTex, u2);
    n2.xyz = n2.xyz * 2.0 - 1.0;
    if (bomb < 1.5) n2.xy = pgUnrot(n2.xy);
    float w = clamp((pick - 0.5) * 3.0 + (n2.a - n.a) * 2.0 + 0.5, 0.0, 1.0);
    c = mix(c, c2, w);
    n = mix(n, n2, w);
  }
}
`;

const PAINTED_GROUND_FRAGMENT_BODY = `
vec2 pgP = vPaintedWorld.xz;
vec4 pgLay = texture2D(uPgLayout, (pgP - uPgLayoutBox.xy) / uPgLayoutBox.zw);
vec4 pgNz = texture2D(uPgNoise, pgP / 23.0);
vec4 pgCA; vec4 pgNA; vec4 pgCB; vec4 pgNB;
pgLayer(uPgColA, uPgNrmA, pgP, uPgTile.x, uPgBomb.x, pgNz.r, pgCA, pgNA);
pgLayer(uPgColB, uPgNrmB, pgP + vec2(3.1, 1.7), uPgTile.y, uPgBomb.y, pgNz.g, pgCB, pgNB);
float pgWB = clamp((pgLay.r - 0.5) * 4.0 + (pgNB.a - pgNA.a) * 3.0 * min(pgLay.r, 1.0 - pgLay.r) * 4.0 + 0.5, 0.0, 1.0);
pgWB = pgLay.r < 0.004 ? 0.0 : pgLay.r > 0.996 ? 1.0 : pgWB;
vec4 pgC = mix(pgCA, pgCB, pgWB);
vec4 pgN = mix(pgNA, pgNB, pgWB);
float pgH = pgN.a;
vec3 pgCol = pgC.rgb * uPgCalib * mix(uPgMacroLow, uPgMacroHigh, pgLay.g) * (0.92 + 0.16 * pgNz.b);
float pgRough = pgC.a;
vec2 pgSlope = pgN.xy / max(pgN.z, 0.25) * uPgRelief;
#ifdef PAINTED_QUAY
  vec2 pgJ = abs(fract(pgP / 6.0 + 0.5) - 0.5) * 6.0;
  float pgJoint = 1.0 - smoothstep(0.008, 0.022, min(pgJ.x, pgJ.y));
  pgCol *= 1.0 - 0.6 * pgJoint;
  pgSlope += vec2(pgJ.x < pgJ.y ? sign(fract(pgP.x / 6.0 + 0.5) - 0.5) : 0.0, pgJ.y <= pgJ.x ? sign(fract(pgP.y / 6.0 + 0.5) - 0.5) : 0.0) * pgJoint * 0.6;
  float pgWear = smoothstep(0.2, 0.55, pgNz.a * 0.5 + pgH * 0.9 - 0.05);
  float pgLineY = 1.0 - smoothstep(0.065, 0.08, abs(pgP.y + 4.6));
  float pgLineX = (1.0 - smoothstep(0.055, 0.07, abs(pgP.x + 7.5))) * step(pgP.y, -4.6);
  float pgDash = (1.0 - smoothstep(0.05, 0.065, abs(pgP.y - 5.2))) * step(0.45, fract(pgP.x / 3.0));
  float pgYellow = max(pgLineY, pgLineX) * pgWear;
  pgCol = mix(pgCol, vec3(0.86, 0.66, 0.13), pgYellow * 0.92);
  pgCol = mix(pgCol, vec3(0.86, 0.86, 0.82), pgDash * pgWear * 0.85);
  pgRough = mix(pgRough, 0.38, max(pgYellow, pgDash * pgWear));
  pgSlope *= 1.0 - 0.6 * max(pgYellow, pgDash * pgWear);
#endif
float pgWet = clamp(pgLay.b + (0.5 - pgH) * uPgWet.z * pgLay.b * (1.0 - pgLay.b) * 4.0, 0.0, 1.0);
pgCol *= mix(1.0, uPgWet.x, pgWet);
pgRough = mix(pgRough, uPgWet.y, pgWet * pgWet);
pgSlope *= 1.0 - pgWet * uPgWet.w;
#ifdef PAINTED_POOLS
  float pgBlood = bloodDyeAt(pgP) * smoothstep(${PAINTED_GROUND_POOL[0]}, ${PAINTED_GROUND_POOL[1]}, pgWet);
  pgCol = mix(pgCol, bloodDyeColour, pgBlood);
#endif
float pgDec = pgLay.a * uPgDecal.a;
pgCol = mix(pgCol, uPgDecal.rgb, pgDec);
pgRough = mix(pgRough, uPgDecalRough, pgDec);
#ifdef PAINTED_FADE
  vec2 pgQ = max(abs(pgP) - uPgFade.xy, 0.0);
  float pgFar = smoothstep(uPgFade.z, uPgFade.w, length(pgQ));
  pgCol = mix(pgCol, texture2D(map, vUv).rgb, pgFar);
  pgRough = mix(pgRough, uPgOrigRough, pgFar);
  pgSlope *= 1.0 - pgFar;
#endif
diffuseColor.rgb *= pgCol;
vec3 pgNormalW = normalize(vec3(pgSlope.x, 1.0, pgSlope.y));
`;

function paintedGroundMaterial(view, spec, layers, layout, box, original) {
  const fade = !!spec.keepOut && !!original.map;
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, map: fade ? original.map : null });
  const toVec3 = (array) => new THREE.Vector3(...array);
  const decal = spec.decal ?? [0, 0, 0, 0];
  const wet = spec.wet ?? [1, 1, 0, 0];
  const uniforms = {
    uPgColA: { value: layers.a.colour },
    uPgNrmA: { value: layers.a.normal },
    uPgColB: { value: layers.b.colour },
    uPgNrmB: { value: layers.b.normal },
    uPgLayout: { value: layout },
    uPgNoise: { value: paintedGroundNoise() },
    uPgLayoutBox: { value: new THREE.Vector4(box.x0, box.z0, box.w, box.d) },
    uPgTile: { value: new THREE.Vector2(...spec.tiles) },
    uPgBomb: { value: new THREE.Vector2(...spec.bomb) },
    uPgMacroLow: { value: toVec3(spec.macro[0]) },
    uPgMacroHigh: { value: toVec3(spec.macro[1]) },
    uPgCalib: { value: toVec3(original.calib) },
    uPgWet: { value: new THREE.Vector4(...wet) },
    uPgDecal: { value: new THREE.Vector4(...decal) },
    uPgDecalRough: { value: spec.decalRough ?? 1 },
    uPgFade: { value: new THREE.Vector4(...(spec.keepOut ?? [0, 0]), -2, 5) },
    uPgRelief: { value: 1 },
    uPgOrigRough: { value: original.roughness },
    uPgEnv: { value: new THREE.Vector2(...(spec.envSplit ?? [1, 1])) },
  };
  material.userData.painted = uniforms;
  if (spec.env) {
    material.envMap = view.steelEnv ?? null;
    material.envMapIntensity = spec.env;
    material.userData.reflects = spec.env;
    material.userData.paintedEnv = true;
  }
  if (fade) material.defines = { PAINTED_FADE: '' };
  if (spec.quay) material.defines = { ...material.defines, PAINTED_QUAY: '' };
  if (spec.pools) material.defines = { ...material.defines, PAINTED_POOLS: '' };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (spec.pools) bloodDyeShader(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPaintedWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaintedWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PAINTED_GROUND_FRAGMENT_HEAD}`)
      .replace('#include <map_fragment>', PAINTED_GROUND_FRAGMENT_BODY)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = pgRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(pgNormalW, 0.0)).xyz);')
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n#if defined( RE_IndirectSpecular )\nradiance *= mix(uPgEnv.x, uPgEnv.y, pgWet);\n#endif')
      .replace('#include <tonemapping_fragment>', '#ifdef PAINTED_POOLS\ngl_FragColor.rgb *= mix(vec3(1.0), bloodDyeFilter, pgBlood);\n#endif\n#include <tonemapping_fragment>');
  };
  material.customProgramCacheKey = () => `painted-ground${fade ? '-fade' : ''}${spec.quay ? '-quay' : ''}${spec.pools ? '-pools' : ''}`;
  return material;
}

// ---- the style ------------------------------------------------------------------

/** What the last builds cost: place → { ms, bytes }. */
export const PAINTED_GROUND_COST = {};

function paintedGroundBuild({ place, view, scale, keepOut, grounds, rng }) {
  const own = PAINTED_GROUND_PLACES[place];
  if (!own || !grounds.length) return null;
  // On a wider floor (a battle map's) the detail stays to the floor's edge (keepOut) and the layout, drawn for the place's own size, is stretched with the floor.
  const spec = scale > 1 ? { ...own, keepOut: keepOut ?? own.keepOut, layout: (x, z, f, random) => own.layout(x / scale, z / scale, f, random) } : own;
  const started = performance.now();
  const fresh = [spec.a, spec.b].filter((name) => !paintedGroundLayerCache.has(name));
  const layers = { a: paintedGroundLayer(spec.a), b: paintedGroundLayer(spec.b) };
  const group = new THREE.Group();
  let bytes = fresh.reduce((sum, name) => sum + paintedGroundLayerCache.get(name).bytes, 0);
  let layoutMs = 0;
  for (const ground of grounds) {
    const geometry = ground.geometry.clone();
    ground.updateMatrix();
    geometry.applyMatrix4(ground.matrix);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    const box = { x0: bounds.min.x, z0: bounds.min.z, w: bounds.max.x - bounds.min.x, d: bounds.max.z - bounds.min.z };
    const layoutStarted = performance.now();
    const layout = paintedGroundLayout(spec, box, rng);
    layoutMs += performance.now() - layoutStarted;
    bytes += layout.bytes;
    const own = paintedGroundMeanOf(ground.material.map);
    const mine = layers.a.mean;
    const calib = own ? own.map((value, channel) => Math.max(0.6, Math.min(1.6, 1 + (value / Math.max(0.02, mine[channel]) - 1) * spec.match))) : [1, 1, 1];
    const material = paintedGroundMaterial(view, spec, layers, layout.texture, box, { map: ground.material.map, roughness: ground.material.roughness ?? 0.95, calib });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.userData.paintedGround = true;
    group.add(mesh);
  }
  // The field's hoof-churned strip was a translucent brown sheet over the grass: the layout draws it now, so hide the sheet with the ground.
  const placeGroup = grounds[0].parent;
  for (const child of placeGroup?.children ?? []) {
    if (child.isMesh && !grounds.includes(child) && child.geometry?.type === 'PlaneGeometry' && child.material?.transparent && Math.abs(child.position.y - 0.004) < 1e-4) {
      child.userData.scenery = 'ground';
      child.visible = false;
    }
  }
  PAINTED_GROUND_COST[place] = { ms: Math.round(performance.now() - started), bytes: Math.round(bytes), layoutMs: Math.round(layoutMs), layers: fresh.map((name) => `${name} ${paintedGroundLayerCache.get(name).ms}ms`) };
  group.userData.paintedCost = PAINTED_GROUND_COST[place];
  // Its standing water, for the blood: the wettest spots of the layout.
  if (spec.pools) group.userData.bloodDyeWater = [(x, z) => ({ wet: paintedGroundSmooth(...PAINTED_GROUND_POOL, spec.layout(x, z, paintedGroundFbm, rng)[2]), reach: spec.pools })];
  return group;
}

/** Ground styles: { id, label, blurb, hidesGround: bool, build({ place, view, kind, arena, grounds, rng }) -> THREE.Group, apply?({ place, view, kind, arena, group }) }. */
export const PAINTED_GROUND = [
  {
    id: 'ground-painted',
    label: 'Painted relief',
    blurb: 'Generated at load, nothing downloaded: per surface two 512² layers (albedo+roughness, normal+height) tiling at 1.3–2.6 m, a place-sized layout map (worn track, churned strip, tide line, puddles), anti-tiling by height-blended second samples, one Standard material.',
    hidesGround: true,
    build: paintedGroundBuild,
    apply({ view, group }) {
      group.traverse((object) => {
        if (object.material?.userData?.paintedEnv && view.steelEnv) object.material.envMap = view.steelEnv;
      });
    },
  },
];
