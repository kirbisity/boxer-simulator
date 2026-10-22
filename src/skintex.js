// The skin's textures for round two's body styles (bodystyles.js v1..v6):
// one atlas of four maps shared by the skin lofts, each loft part unwrapped
// as a cylinder (the angle round it, the length along it; the tiles are
// skindetail.js's):
//
//   albedo  a multiplier on the skin tone, so one map serves every tone:
//           darker and redder in the cavities, the rib gaps and the creases
//           (armpit, groin, elbow, knee, the folds of fat), veins on a lean
//           muscled arm, stretch marks on the heavy, a flush at the working
//           joints, mottling; paler and bluer in the starved, ruddier in the
//           heavy;
//   normal  the fine anatomy's slopes in the loft's tangent space (three's
//           normalMap reads it with no tangents: it builds the frame from the
//           texture coordinates), for a toon or standard skin;
//   ao      how shut in each place is (three reads it as aoMap, on uv2);
//   rough   sweat on a trained man's high places, dry skin on the starved.
//
// The anatomy comes from one of two sources: `rules` (skinrules.js: the
// fine height written as functions of the place on the part) or `field`
// (the flesh style's signed-distance anatomy, fleshbody.js, read at the
// loft's surface: its normals and occlusion baked onto the cheap loft,
// the classic high-to-low bake). The marks (creases, veins...) are always
// the rules'.
//
// A Lambert skin (the game's probe-lite look) has the albedo and the
// occlusion only: three r128 lights Lambert per vertex, with no normal map,
// so the albedo carries the cavity shading baked in. See `applySkinTextures`.
//
// The maps are made once per composition bucket (`compositionKey`) and kept
// in a small cache; the work is a generator of slices (`skinTextureSteps`)
// a game drives between frames (`runSkinTexturesAsync`). No Three.js here
// but in `applySkinTextures`.

import { DETAIL, DETAIL_TILES } from './skindetail.js';
import { sculptTraits } from './sculpt.js';
import { ruleForTile, rulesTraits } from './skinrules.js';

export const SKINTEX = {
  // The albedo's "no change" (a share of white): below 1 so a place can be paler or bluer than the tone; the material's colour makes it up.
  neutral: 0.88,
  // How dark a full cavity and a full crease are, and how dark a vein.
  cavityDark: 0.34,
  creaseDark: 0.42,
  // A dip (m) under the blurred height that is a full cavity, and the blur (texels) it is measured against.
  cavityDepth: 0.003,
  cavityBlur: 6,
  // The field bake: read at every `lattice`-th texel; the large forms (a blur this wide) taken out of its normals, so only the anatomy is left.
  lattice: 2,
  fieldFormBlur: 14,
  // ...its rims softened by a small blur first, and its slopes scaled (the field's creases are sharper than skin's).
  fieldSoften: 2,
  fieldStrength: 0.75,
  // The most the field's surface is trusted to lie off the loft's (m); beyond it the bake fades to flat.
  fieldReach: 0.028,
  // Occlusion probes along the field's normal (m).
  aoProbes: [0.007, 0.018],
  // Time (ms) a slice may take before it hands the thread back, and the most buckets kept.
  sliceMs: 6,
  cacheLimit: 16,
};

const [ATLAS_WIDTH, ATLAS_HEIGHT] = DETAIL.atlas;
const GUTTER = DETAIL.gutter;
const TILES = Object.entries(DETAIL_TILES).map(([name, tile]) => {
  const [from, to] = DETAIL.spans[tile.span];
  return { name, ...tile, inner: tile.w - 2 * GUTTER, tall: tile.h - 2 * GUTTER, from, to };
});

const texClamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const texSmooth = (low, high, x) => {
  const t = texClamp((x - low) / (high - low));
  return t * t * (3 - 2 * t);
};

// ---- Composition buckets, and the cache -----------------------------------------

/** Which bodies share a set of maps: the same style, sex and frame, close in fat, muscle, neck, height and training. */
export function compositionKey(body, style = '') {
  const traits = sculptTraits(body);
  const step = (value, size) => Math.round(value / size);
  return [style, body.inputs.sex, body.inputs.frame, `f${step(traits.trunk.fat, 0.006)}`, `l${step(traits.arm.fat, 0.006)}`, `d${step(traits.developed, 0.15)}`, `n${step(body.neckIndex, 0.35)}`, `h${step(body.inputs.heightCm, 6)}`, `x${step(body.inputs.exercise, 0.25)}`, `a${step(body.inputs.age ?? 30, 15)}`].join('|');
}

const CACHE = new Map();
export const skinTextureCache = { map: CACHE, hits: 0, misses: 0 };
export function clearSkinTextureCache() {
  CACHE.clear();
  skinTextureCache.hits = 0;
  skinTextureCache.misses = 0;
}
/** A bucket's maps, if made (counted as a hit or a miss), most recently used last. */
export function cachedSkinTextures(key) {
  const found = CACHE.get(key);
  if (found) {
    CACHE.delete(key);
    CACHE.set(key, found);
    skinTextureCache.hits += 1;
  } else skinTextureCache.misses += 1;
  return found ?? null;
}
export function storeSkinTextures(key, textures) {
  CACHE.set(key, textures);
  while (CACHE.size > SKINTEX.cacheLimit) CACHE.delete(CACHE.keys().next().value);
}

// ---- Rasterising the loft into the atlas ------------------------------------------

/**
 * Where each texel of the atlas is on the body: the loft's skin triangles drawn into the atlas by their texture coordinates, each
 * texel holding the bind-pose position and normal under it (Phong-curved, so a coarse loft's facets do not print). The gutter
 * texels take their nearest neighbour's.
 */
export function rasterizeSkin(mesh) {
  const { positions, normals, indices, uvs, regions } = mesh;
  const pos = new Float32Array(ATLAS_WIDTH * ATLAS_HEIGHT * 3);
  const nor = new Float32Array(ATLAS_WIDTH * ATLAS_HEIGHT * 3);
  const covered = new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT);
  const flat = [0, 0, 0];
  const curved = [0, 0, 0];
  for (let face = 0; face < indices.length; face += 3) {
    const a = indices[face];
    const b = indices[face + 1];
    const c = indices[face + 2];
    if (regions[a] !== 'skin' || regions[b] !== 'skin' || regions[c] !== 'skin') continue;
    const ua = uvs[a * 2] * ATLAS_WIDTH;
    const va = uvs[a * 2 + 1] * ATLAS_HEIGHT;
    const ub = uvs[b * 2] * ATLAS_WIDTH;
    const vb = uvs[b * 2 + 1] * ATLAS_HEIGHT;
    const uc = uvs[c * 2] * ATLAS_WIDTH;
    const vc = uvs[c * 2 + 1] * ATLAS_HEIGHT;
    const det = (ub - ua) * (vc - va) - (uc - ua) * (vb - va);
    if (Math.abs(det) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ua, ub, uc) - 0.5));
    const x1 = Math.min(ATLAS_WIDTH - 1, Math.ceil(Math.max(ua, ub, uc) - 0.5));
    const y0 = Math.max(0, Math.floor(Math.min(va, vb, vc) - 0.5));
    const y1 = Math.min(ATLAS_HEIGHT - 1, Math.ceil(Math.max(va, vb, vc) - 0.5));
    const corners = [a, b, c];
    for (let y = y0; y <= y1; y += 1) {
      const py = y + 0.5;
      for (let x = x0; x <= x1; x += 1) {
        const px = x + 0.5;
        const w1 = ((px - ua) * (vc - va) - (uc - ua) * (py - va)) / det;
        const w2 = ((ub - ua) * (py - va) - (px - ua) * (vb - va)) / det;
        const w0 = 1 - w1 - w2;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const at = y * ATLAS_WIDTH + x;
        covered[at] = 1;
        const weights = [w0, w1, w2];
        for (let axis = 0; axis < 3; axis += 1) {
          flat[axis] = w0 * positions[a * 3 + axis] + w1 * positions[b * 3 + axis] + w2 * positions[c * 3 + axis];
          nor[at * 3 + axis] = w0 * normals[a * 3 + axis] + w1 * normals[b * 3 + axis] + w2 * normals[c * 3 + axis];
          curved[axis] = 0;
        }
        // Phong tessellation: each corner's tangent plane pulls the flat point out onto the curved surface the corners' normals imply.
        for (let corner = 0; corner < 3; corner += 1) {
          const vertex = corners[corner];
          let along = 0;
          for (let axis = 0; axis < 3; axis += 1) along += (flat[axis] - positions[vertex * 3 + axis]) * normals[vertex * 3 + axis];
          for (let axis = 0; axis < 3; axis += 1) curved[axis] += weights[corner] * (flat[axis] - along * normals[vertex * 3 + axis]);
        }
        for (let axis = 0; axis < 3; axis += 1) pos[at * 3 + axis] = curved[axis];
      }
    }
  }
  for (let pass = 0; pass < GUTTER + 1; pass += 1) {
    const before = covered.slice();
    for (let y = 0; y < ATLAS_HEIGHT; y += 1) {
      for (let x = 0; x < ATLAS_WIDTH; x += 1) {
        const at = y * ATLAS_WIDTH + x;
        if (before[at]) continue;
        let source = -1;
        for (let dy = -1; dy <= 1 && source < 0; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= ATLAS_WIDTH || ny >= ATLAS_HEIGHT || !before[ny * ATLAS_WIDTH + nx]) continue;
            source = ny * ATLAS_WIDTH + nx;
            break;
          }
        }
        if (source < 0) continue;
        covered[at] = 2;
        pos.copyWithin(at * 3, source * 3, source * 3 + 3);
        nor.copyWithin(at * 3, source * 3, source * 3 + 3);
      }
    }
  }
  for (let at = 0; at < covered.length; at += 1) {
    if (!covered[at]) continue;
    const length = Math.hypot(nor[at * 3], nor[at * 3 + 1], nor[at * 3 + 2]) || 1;
    for (let axis = 0; axis < 3; axis += 1) nor[at * 3 + axis] /= length;
  }
  return { width: ATLAS_WIDTH, height: ATLAS_HEIGHT, pos, nor, covered };
}

/** A tile texel's neighbour `dc` columns round (wrapping) and `dr` rows along (clamped): its index in the atlas. */
function tileTexel(tile, column, row, dc, dr) {
  const period = tile.inner - 1;
  let c = column - GUTTER + dc;
  c = ((c % period) + period) % period;
  const r = Math.min(tile.tall - 1, Math.max(0, row - GUTTER + dr));
  return (tile.y + GUTTER + r) * ATLAS_WIDTH + tile.x + GUTTER + c;
}

/**
 * The surface frame at each texel: unit T (round the part, the way the texture's u grows) and B (along it, v), both in the loft's
 * tangent plane, and the metres one texel spans each way.
 */
function texelFrames(raster) {
  const { pos, nor } = raster;
  const frame = new Float32Array(ATLAS_WIDTH * ATLAS_HEIGHT * 8);
  for (const tile of TILES) {
    for (let row = 0; row < tile.h; row += 1) {
      for (let column = 0; column < tile.w; column += 1) {
        const at = (tile.y + row) * ATLAS_WIDTH + tile.x + column;
        const left = tileTexel(tile, column, row, -1, 0);
        const right = tileTexel(tile, column, row, 1, 0);
        const down = tileTexel(tile, column, row, 0, -1);
        const up = tileTexel(tile, column, row, 0, 1);
        const rows = (Math.min(tile.tall - 1, row - GUTTER + 1) - Math.max(0, row - GUTTER - 1)) || 1;
        const n = [nor[at * 3], nor[at * 3 + 1], nor[at * 3 + 2]];
        const T = [0, 1, 2].map((axis) => (pos[right * 3 + axis] - pos[left * 3 + axis]) / 2);
        const B = [0, 1, 2].map((axis) => (pos[up * 3 + axis] - pos[down * 3 + axis]) / rows);
        const tLength = Math.hypot(...T) || 1e-4;
        const bLength = Math.hypot(...B) || 1e-4;
        const tn = T[0] * n[0] + T[1] * n[1] + T[2] * n[2];
        const t = T.map((value, axis) => value - n[axis] * tn);
        const tl = Math.hypot(...t) || 1;
        const bn = B[0] * n[0] + B[1] * n[1] + B[2] * n[2];
        const b = B.map((value, axis) => value - n[axis] * bn);
        const bl = Math.hypot(...b) || 1;
        frame.set([t[0] / tl, t[1] / tl, t[2] / tl, b[0] / bl, b[1] / bl, b[2] / bl, tLength, bLength], at * 8);
      }
    }
  }
  return frame;
}

// ---- Blur ----------------------------------------------------------------------------------

/** A box blur of one channel of the atlas, tile by tile: round each part (the angle wraps) and clamped along it. */
export function blurAtlas(source, radius) {
  const across = new Float32Array(source.length);
  const out = new Float32Array(source.length);
  const window = 2 * radius + 1;
  for (const tile of TILES) {
    const period = tile.inner - 1;
    for (let row = 0; row < tile.h; row += 1) {
      const base = (tile.y + row) * ATLAS_WIDTH + tile.x + GUTTER;
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) sum += source[base + (((k % period) + period) % period)];
      for (let column = 0; column < period; column += 1) {
        across[base + column] = sum / window;
        sum += source[base + ((column + radius + 1) % period)] - source[base + ((((column - radius) % period) + period) % period)];
      }
      across[base + period] = across[base];
      for (let g = 1; g <= GUTTER; g += 1) {
        across[base - g] = across[base + period - g];
        across[base + period + g] = across[base + g];
      }
    }
    for (let column = 0; column < tile.w; column += 1) {
      const rowAt = (r) => (tile.y + GUTTER + Math.min(tile.tall - 1, Math.max(0, r))) * ATLAS_WIDTH + tile.x + column;
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) sum += across[rowAt(k)];
      for (let row = 0; row < tile.tall; row += 1) {
        out[rowAt(row)] = sum / window;
        sum += across[rowAt(row + radius + 1)] - across[rowAt(row - radius)];
      }
      for (let g = 1; g <= GUTTER; g += 1) {
        out[(tile.y + GUTTER - g) * ATLAS_WIDTH + tile.x + column] = out[rowAt(0)];
        out[(tile.y + GUTTER + tile.tall - 1 + g) * ATLAS_WIDTH + tile.x + column] = out[rowAt(tile.tall - 1)];
      }
    }
  }
  return out;
}

// ---- Noise -------------------------------------------------------------------------------

const hash = (x, y, seed) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Smooth value noise in 0..1, a different pattern for each seed. */
export function texNoise(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = hash(ix, iy, seed) * (1 - sx) + hash(ix + 1, iy, seed) * sx;
  const bottom = hash(ix, iy + 1, seed) * (1 - sx) + hash(ix + 1, iy + 1, seed) * sx;
  return top * (1 - sy) + bottom * sy;
}

// ---- Making the maps ------------------------------------------------------------------------------

/**
 * The maps, as slices of work (a generator: each `yield` is a place to hand the thread back; its return value is the maps).
 * `mesh`: the built loft (with `uvs`); `source`: 'rules' or 'field' (then `field`: the flesh style's signed distance);
 * `layers`: which maps; `share`: how much of the rules' fine height the mesh already has (the maps carry the rest).
 */
export function* skinTextureSteps(body, { mesh, source = 'rules', field = null, layers = ['albedo', 'normal', 'ao', 'rough'], share = 0, seed = 7 } = {}) {
  const R = rulesTraits(body);
  const size = ATLAS_WIDTH * ATLAS_HEIGHT;
  const raster = rasterizeSkin(mesh);
  yield 'raster';
  const frames = texelFrames(raster);
  yield 'frames';
  // The rules at every texel: the fine height still to draw, and the marks.
  const height = new Float32Array(size);
  const crease = new Float32Array(size);
  const vein = new Float32Array(size);
  const stretch = new Float32Array(size);
  const flush = new Float32Array(size);
  for (const tile of TILES) {
    const rule = ruleForTile(R, tile);
    for (let row = 0; row < tile.h; row += 1) {
      const t = tile.from + (tile.to - tile.from) * texClamp((row - GUTTER) / (tile.tall - 1));
      for (let column = 0; column < tile.w; column += 1) {
        const angle = ((column - GUTTER) / (tile.inner - 1)) * Math.PI * 2;
        const at = (tile.y + row) * ATLAS_WIDTH + tile.x + column;
        const mark = rule(t, angle);
        // The trunk's hanging apron (below its hem) and what is not skin take nothing.
        const reach = tile.span === 'trunk' ? texSmooth(-0.125, -0.06, t) : 1;
        height[at] = mark.h * (1 - share) * reach;
        crease[at] = mark.crease * reach;
        vein[at] = mark.vein;
        stretch[at] = mark.stretch * reach;
        flush[at] = mark.flush;
      }
    }
    yield `rules ${tile.name}`;
  }
  // The anatomy's normals and occlusion: the rules' height, or the field baked.
  const normal = new Float32Array(size * 3);
  const occlusion = new Float32Array(size).fill(1);
  const cavity = new Float32Array(size);
  if (source === 'field') {
    yield* bakeField(raster, field, frames, normal, occlusion, cavity);
  } else {
    const blurred = blurAtlas(height, SKINTEX.cavityBlur);
    yield 'blurred';
    for (const tile of TILES) {
      for (let row = 0; row < tile.h; row += 1) {
        for (let column = 0; column < tile.w; column += 1) {
          const at = (tile.y + row) * ATLAS_WIDTH + tile.x + column;
          const slopeT = (height[tileTexel(tile, column, row, 1, 0)] - height[tileTexel(tile, column, row, -1, 0)]) / (2 * frames[at * 8 + 6]);
          const slopeB = (height[tileTexel(tile, column, row, 0, 1)] - height[tileTexel(tile, column, row, 0, -1)]) / (2 * frames[at * 8 + 7]);
          const length = Math.hypot(slopeT, slopeB, 1);
          normal[at * 3] = -slopeT / length;
          normal[at * 3 + 1] = -slopeB / length;
          normal[at * 3 + 2] = 1 / length;
          const dip = (blurred[at] - height[at]) / SKINTEX.cavityDepth;
          cavity[at] = texClamp(dip);
          occlusion[at] = 1 - 0.5 * texSmooth(0, 1.4, dip);
        }
      }
      yield `normals ${tile.name}`;
    }
  }
  const out = { width: ATLAS_WIDTH, height: ATLAS_HEIGHT, neutral: SKINTEX.neutral };
  if (layers.includes('normal')) out.normal = encodeNormals(normal, frames);
  yield 'normal';
  if (layers.includes('ao')) {
    const ao = new Uint8Array(size).fill(255);
    for (let at = 0; at < size; at += 1) ao[at] = Math.round(255 * texClamp(occlusion[at] * (1 - 0.45 * crease[at])));
    out.ao = ao;
  }
  if (layers.includes('rough')) {
    const rough = new Uint8Array(size);
    // Sweat: the more trained, the wetter on the high places; the starved are dry; the creases never shine.
    const sweat = texClamp(0.2 + 0.8 * R.exercise);
    const dry = R.rawBony;
    for (let at = 0; at < size; at += 1) {
      const high = texClamp(1 - cavity[at] * 2);
      rough[at] = Math.round(255 * texClamp(0.64 - 0.26 * sweat * high + 0.18 * dry + 0.15 * crease[at], 0.25, 0.95));
    }
    out.rough = rough;
  }
  yield 'ao and roughness';
  if (layers.includes('albedo')) {
    const albedo = new Uint8Array(size * 4);
    const flat = Math.round(SKINTEX.neutral * 255);
    for (let at = 0; at < size; at += 1) albedo.set([flat, flat, flat, 255], at * 4);
    for (const tile of TILES) {
      paintTile(albedo, tile, { R, cavity, crease, vein, stretch, flush, seed });
      yield `albedo ${tile.name}`;
    }
    out.albedo = albedo;
  }
  out.bytes = (out.albedo?.length ?? 0) + (out.normal?.length ?? 0) + (out.ao?.length ?? 0) + (out.rough?.length ?? 0);
  return out;
}

/**
 * The field's normals and occlusion at each texel: the texel's point moved along the loft's normal onto the field's surface, the
 * field's gradient there taken into the loft's tangent frame, its large forms (where the field and the loft simply disagree) blurred
 * out; the occlusion from the field read a little way out along its normal. At every `lattice`-th texel, filled in between.
 */
function* bakeField(raster, field, frames, normal, occlusion, cavity) {
  const { pos, nor, covered } = raster;
  const step = SKINTEX.lattice;
  const size = ATLAS_WIDTH * ATLAS_HEIGHT;
  const nx = new Float32Array(size);
  const ny = new Float32Array(size);
  const aoAt = new Float32Array(size).fill(1);
  const known = new Uint8Array(size);
  const e = 0.0015;
  for (let y = 0; y < ATLAS_HEIGHT; y += step) {
    for (let x = 0; x < ATLAS_WIDTH; x += step) {
      const at = y * ATLAS_WIDTH + x;
      if (!covered[at]) continue;
      const n = [nor[at * 3], nor[at * 3 + 1], nor[at * 3 + 2]];
      let p = [pos[at * 3], pos[at * 3 + 1], pos[at * 3 + 2]];
      let d = field(p[0], p[1], p[2]);
      const trust = 1 - texSmooth(SKINTEX.fieldReach * 0.6, SKINTEX.fieldReach, Math.abs(d));
      d = texClamp(d, -SKINTEX.fieldReach, SKINTEX.fieldReach);
      p = [p[0] - n[0] * d, p[1] - n[1] * d, p[2] - n[2] * d];
      // The gradient by a tetrahedron of four reads.
      const a = field(p[0] + e, p[1] - e, p[2] - e);
      const b = field(p[0] - e, p[1] - e, p[2] + e);
      const c = field(p[0] - e, p[1] + e, p[2] - e);
      const f = field(p[0] + e, p[1] + e, p[2] + e);
      let g = [a - b - c + f, -a - b + c + f, -a + b - c + f];
      const gl = Math.hypot(...g) || 1;
      g = g.map((value) => value / gl);
      // Trusted only where the field's surface lies near the loft's: elsewhere the loft's own normal.
      const m = [0, 1, 2].map((axis) => n[axis] * (1 - trust) + g[axis] * trust);
      const T = frames.subarray(at * 8, at * 8 + 3);
      const B = frames.subarray(at * 8 + 3, at * 8 + 6);
      nx[at] = m[0] * T[0] + m[1] * T[1] + m[2] * T[2];
      ny[at] = m[0] * B[0] + m[1] * B[1] + m[2] * B[2];
      let shut = 0;
      SKINTEX.aoProbes.forEach((probe, index) => {
        const reach = field(p[0] + g[0] * probe, p[1] + g[1] * probe, p[2] + g[2] * probe);
        shut += texClamp((probe - reach) / probe) / (index + 1);
      });
      aoAt[at] = 1 - trust * texClamp(shut * 0.9);
      known[at] = 1;
    }
    if (y % (step * 16) === 0) yield `field row ${y}`;
  }
  // Fill in between the lattice, bilinearly.
  for (let y = 0; y < ATLAS_HEIGHT; y += 1) {
    for (let x = 0; x < ATLAS_WIDTH; x += 1) {
      const at = y * ATLAS_WIDTH + x;
      if (!covered[at] || known[at]) continue;
      const x0 = x - (x % step);
      const y0 = y - (y % step);
      let sx = 0;
      let sy = 0;
      let sa = 0;
      let weight = 0;
      for (const [dx, dy] of [[0, 0], [step, 0], [0, step], [step, step]]) {
        const near = Math.min(ATLAS_HEIGHT - 1, y0 + dy) * ATLAS_WIDTH + Math.min(ATLAS_WIDTH - 1, x0 + dx);
        if (!known[near]) continue;
        const w = (1 - Math.abs(x - x0 - dx) / step) * (1 - Math.abs(y - y0 - dy) / step);
        sx += nx[near] * w;
        sy += ny[near] * w;
        sa += aoAt[near] * w;
        weight += w;
      }
      if (weight > 0) {
        nx[at] = sx / weight;
        ny[at] = sy / weight;
        aoAt[at] = sa / weight;
      }
    }
  }
  yield 'field filled';
  // Soften the field's own rims (its shapes meet in creases sharper than skin's), then take out the large forms.
  const softX = blurAtlas(nx, SKINTEX.fieldSoften);
  const softY = blurAtlas(ny, SKINTEX.fieldSoften);
  nx.set(softX);
  ny.set(softY);
  const formX = blurAtlas(nx, SKINTEX.fieldFormBlur);
  const formY = blurAtlas(ny, SKINTEX.fieldFormBlur);
  const formAo = blurAtlas(aoAt, SKINTEX.fieldFormBlur);
  yield 'field forms';
  for (let at = 0; at < size; at += 1) {
    const x = texClamp((nx[at] - formX[at]) * SKINTEX.fieldStrength, -0.9, 0.9);
    const y = texClamp((ny[at] - formY[at]) * SKINTEX.fieldStrength, -0.9, 0.9);
    const z = Math.sqrt(Math.max(0.05, 1 - x * x - y * y));
    normal[at * 3] = x;
    normal[at * 3 + 1] = y;
    normal[at * 3 + 2] = z;
    // The occlusion keeps its large forms (a fold is large), the cavity is its local dip.
    occlusion[at] = texClamp(0.35 + 0.65 * aoAt[at]);
    cavity[at] = texClamp((formAo[at] - aoAt[at]) * 1.6 + (1 - aoAt[at]) * 0.25);
  }
}

/**
 * The tangent-space normals as RGBA bytes, as three's derivative frame reads them: it scales the round and the along slopes by
 * how fast u and v run over the surface (the larger to 1), so a tile whose texels are longer one way would flatten that way's
 * slopes: each is stretched back by that ratio before it is stored.
 */
function encodeNormals(normal, frames) {
  const size = ATLAS_WIDTH * ATLAS_HEIGHT;
  const out = new Uint8Array(size * 4);
  for (let at = 0; at < size; at += 1) {
    const tLength = frames[at * 8 + 6] || 1;
    const bLength = frames[at * 8 + 7] || 1;
    // |grad u| ~ 1 / (metres per texel round * width), |grad v| ~ 1 / (metres per texel along * height).
    const gu = 1 / (tLength * ATLAS_WIDTH);
    const gv = 1 / (bLength * ATLAS_HEIGHT);
    const top = Math.max(gu, gv) || 1;
    let x = normal[at * 3] / (gu / top || 1);
    let y = normal[at * 3 + 1] / (gv / top || 1);
    let z = normal[at * 3 + 2] || 1;
    const largest = Math.max(1, Math.abs(x), Math.abs(y), Math.abs(z));
    x /= largest;
    y /= largest;
    z /= largest;
    out[at * 4] = Math.round((x * 0.5 + 0.5) * 255);
    out[at * 4 + 1] = Math.round((y * 0.5 + 0.5) * 255);
    out[at * 4 + 2] = Math.round((z * 0.5 + 0.5) * 255);
    out[at * 4 + 3] = 255;
  }
  return out;
}

/** Paint one tile's albedo: every texel, gutter included. */
function paintTile(albedo, tile, { R, cavity, crease, vein, stretch, flush, seed }) {
  const neutral = SKINTEX.neutral;
  // The body's state is one colour all over (by part it left a seam where an arm met the trunk).
  const ruddy = texSmooth(0.025, 0.09, R.traits.trunk.fat) * (R.female ? 0.8 : 1);
  const pale = R.rawBony;
  const exercise = R.exercise;
  for (let row = 0; row < tile.h; row += 1) {
    for (let column = 0; column < tile.w; column += 1) {
      const at = (tile.y + row) * ATLAS_WIDTH + tile.x + column;
      // The noise runs on the texel grid of the tile, wrapping round it.
      const wrapped = ((column - GUTTER) % (tile.inner - 1) + tile.inner - 1) % (tile.inner - 1);
      let r = 1;
      let g = 1;
      let b = 1;
      // Cavities and creases: darker, redder than they are dark in the healthy, greyer in the starved.
      const hollow = cavity[at] ** 0.9 * SKINTEX.cavityDark;
      r *= 1 - hollow * (0.5 + 0.35 * pale);
      g *= 1 - hollow * (0.9 - 0.05 * pale);
      b *= 1 - hollow * (0.85 - 0.1 * pale);
      // Creases (a fold, the armpit) darker and browner, less red than a hollow.
      const fold = crease[at] * SKINTEX.creaseDark;
      r *= 1 - fold * 0.7;
      g *= 1 - fold * 0.85;
      b *= 1 - fold * 0.85;
      // Veins: blue-green under thin skin.
      r *= 1 - 0.2 * vein[at];
      g *= 1 - 0.12 * vein[at];
      b *= 1 - 0.03 * vein[at];
      // Stretch marks: pink-violet lines.
      r *= 1 - 0.05 * stretch[at];
      g *= 1 - 0.16 * stretch[at];
      b *= 1 - 0.07 * stretch[at];
      // Flush at the working joints (elbow, knee), more in the trained and the heavy, little in the starved.
      const red = flush[at] * (0.05 + 0.05 * exercise + 0.05 * ruddy) * (1 - 0.7 * pale);
      r *= 1 + red * 0.6;
      g *= 1 - red;
      b *= 1 - red;
      // The state of the body: ruddy when heavy, pale and blue-grey when starved.
      r *= 1 + 0.05 * ruddy - 0.04 * pale;
      g *= 1 - 0.035 * ruddy - 0.01 * pale;
      b *= 1 - 0.05 * ruddy + 0.03 * pale;
      // Mottling at two scales, and a fine grain.
      const motley = texNoise(wrapped * 0.07 + tile.x, row * 0.07 + tile.y, seed) * 0.6 + texNoise(wrapped * 0.3 + tile.x, row * 0.3 + tile.y, seed + 3) * 0.4 - 0.5;
      const grain = hash(wrapped + tile.x * 3, row + tile.y * 5, seed + 11) - 0.5;
      r *= 1 + 0.06 * motley + 0.015 * grain;
      g *= 1 + 0.07 * motley + 0.015 * grain;
      b *= 1 + 0.06 * motley + 0.015 * grain;
      const base = at * 4;
      albedo[base] = Math.round(texClamp(r * neutral) * 255);
      albedo[base + 1] = Math.round(texClamp(g * neutral) * 255);
      albedo[base + 2] = Math.round(texClamp(b * neutral) * 255);
      albedo[base + 3] = 255;
    }
  }
}

/** Drive a slice generator to its end now (a test, a tool, a load screen): its result. */
export function runSkinTextures(steps) {
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}

/** Drive it a few milliseconds at a time, handing the thread back between slices (a game between frames). */
export async function runSkinTexturesAsync(steps, sliceMs = SKINTEX.sliceMs) {
  let sliceStart = performance.now();
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
    if (performance.now() - sliceStart > sliceMs) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      sliceStart = performance.now();
    }
  }
}

// ---- The renderer's side -----------------------------------------------------------------------------

const GPU = new WeakMap();

/** The maps as three textures, made once for a set of maps. */
function gpuTextures(textures) {
  /* global THREE */
  let made = GPU.get(textures);
  if (made) return made;
  const texture = (data, format) => {
    const result = new THREE.DataTexture(data, textures.width, textures.height, format, THREE.UnsignedByteType);
    result.minFilter = THREE.LinearMipmapLinearFilter;
    result.magFilter = THREE.LinearFilter;
    result.generateMipmaps = true;
    result.anisotropy = 4;
    result.needsUpdate = true;
    return result;
  };
  made = {
    albedo: textures.albedo && texture(textures.albedo, THREE.RGBAFormat),
    normal: textures.normal && texture(textures.normal, THREE.RGBAFormat),
    ao: textures.ao && texture(textures.ao, THREE.LuminanceFormat),
    rough: textures.rough && texture(textures.rough, THREE.LuminanceFormat),
  };
  GPU.set(textures, made);
  return made;
}

/**
 * The maps on a skin material, as far as it can use them: a Lambert one takes the albedo and the occlusion; a toon one the normals
 * too; a standard one the roughness as well. `upgrade` swaps a Lambert skin for a standard one (per-pixel light, so the normals
 * show), keeping its colour and skinning. `relief` scales the normals (1 the true slopes). Returns the material to use.
 */
export function applySkinTextures(material, textures, { relief = 1, upgrade = false } = {}) {
  let target = material;
  if (upgrade && material.isMeshLambertMaterial) {
    target = new THREE.MeshStandardMaterial({ color: material.color, vertexColors: material.vertexColors, skinning: material.skinning, roughness: 0.62, metalness: 0 });
  }
  const made = gpuTextures(textures);
  if (made.albedo) {
    target.map = made.albedo;
    // The albedo's "no change" is under white (room for paler and bluer): made up in the colour.
    target.color.multiplyScalar(1 / textures.neutral);
  }
  if (made.ao) {
    target.aoMap = made.ao;
    target.aoMapIntensity = 1;
  }
  if (made.normal && relief > 0 && (target.isMeshStandardMaterial || target.isMeshToonMaterial || target.isMeshPhongMaterial)) {
    target.normalMap = made.normal;
    target.normalScale = new THREE.Vector2(relief, relief);
  }
  if (made.rough && target.isMeshStandardMaterial) {
    target.roughnessMap = made.rough;
    target.roughness = 1;
  }
  target.needsUpdate = true;
  return target;
}
