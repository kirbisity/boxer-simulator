// Ground styles: photo (proof of concept). See src/scenery.js (GROUND) for the contract.
//
// Real photo-scanned PBR ground (Poly Haven, CC0; docs/credits-ground-photo.md):
// a diffuse, a normal and (cobbles, concrete) a roughness map per surface, tiled
// at their real size in world space. Two samples of each (the second turned and
// scaled) are swapped by a large non-repeating noise so no repeat shows, and a
// macro noise varies the brightness and hue over tens of metres. A per-place
// mask (R: a second surface, G: wet, B: wear) lays in the place's own features,
// blended by height (the second surface fills the first's low spots first):
// the meadow's worn track, the field's churned strip, the plain's bunch grass,
// the sengoku mud, the colosseum's raked sand (procedural grooves) and stains,
// the town's mud in the joints, the beach's tide line, the port's puddles and
// painted lines. Colours stay sRGB-authored like the rest of the game: each
// photo is tinted towards the place's own painted mean so the art direction
// (and the generated foothills, which carry on in that colour) hold.

/* global THREE */

import { PHOTO_GROUND_DATA } from './photo-data.js';

/** Per place: the surfaces, tints (× after the auto-match to the painted ground), roughness, features. */
const PHOTO_GROUND_PLACES = {
  meadow: { primary: 'grass', secondary: 'path', adjust: [0.98, 1.04, 0.95], tintB: [1.0, 1.0, 0.95], roughness: 1, roughB: 0.95, macro: 0.32, hue: [1.12, 1.0, 0.8], mask: 'meadow' },
  field: { primary: 'grass', secondary: 'mud', adjust: [0.98, 1.0, 0.95], tintB: [1.12, 1.0, 0.85], roughness: 1, roughB: 0.7, macro: 0.36, hue: [1.12, 1.0, 0.8], mask: 'field', wet: [0.75, 0.3] },
  plain: { primary: 'grit', secondary: 'grass', adjust: [0.96, 0.94, 0.92], tintB: [1.1, 1.04, 0.84], roughness: 1, roughB: 1, macro: 0.3, hue: [1.08, 1.0, 0.86], hueMatch: 0.3, mask: 'plain' },
  sengoku: { primary: 'grass', secondary: 'mud', adjust: [1.04, 1.0, 0.92], tintB: [1.12, 1.0, 0.85], roughness: 1, roughB: 0.7, macro: 0.32, hue: [1.12, 1.0, 0.82], mask: 'sengoku', wet: [0.62, 0.1], reflects: 0.6 },
  colosseum: { primary: 'arenaSand', secondary: 'mud', adjust: [0.95, 0.95, 0.95], tintB: [1.2, 0.8, 0.72], roughness: 1, roughB: 0.9, macro: 0.16, hue: [1.04, 1.0, 0.94], hueMatch: 0.85, contrast: 1.1, normalScale: 0.8, mask: 'colosseum', rake: 1 },
  town: { primary: 'cobbles', secondary: 'mud', adjust: [1.05, 1.0, 0.92], tintB: [1.1, 1.0, 0.85], roughness: 1, roughB: 0.75, macro: 0.25, hue: [1.06, 1.0, 0.9], hueMatch: 0.7, scale: 0.85, mask: 'town', wet: [0.7, 0.15], reflects: 0.5 },
  coastFort: { primary: 'beachSand', secondary: 'mud', adjust: [1.05, 1.0, 0.9], tintB: [0.8, 0.85, 0.6], roughness: 1, roughB: 0.8, macro: 0.2, hue: [1.06, 1.0, 0.9], hueMatch: 1, contrast: 1.05, mask: 'beach', wet: [0.6, 0.12], reflects: 0.55 },
  coastVillage: { primary: 'beachSand', secondary: 'mud', adjust: [1.02, 0.97, 0.88], tintB: [0.75, 0.82, 0.55], roughness: 1, roughB: 0.8, macro: 0.22, hue: [1.06, 1.0, 0.9], hueMatch: 1, contrast: 1.05, mask: 'beach', wet: [0.6, 0.12], reflects: 0.55, debris: true },
  port: { primary: 'concrete', secondary: null, adjust: [1.0, 1.0, 1.0], tintB: [1, 1, 1], roughness: 0.75, roughB: 0.75, macro: 0.3, hue: [1.0, 1.0, 1.04], mask: 'port', wet: [0.55, 0.03], reflects: 1.0, lines: true, normalScale: 0.6 },
};

// ---- textures ---------------------------------------------------------------

const photoGroundCache = {};

/** A texture decoded from a data URL, async: the image arrives a frame or so later. */
function photoGroundImage(url, view, onLoad) {
  const texture = new THREE.Texture();
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(8, view.renderer.capabilities.getMaxAnisotropy());
  const image = new Image();
  image.onload = () => {
    texture.image = image;
    texture.needsUpdate = true;
    onLoad(image);
  };
  image.src = url;
  return texture;
}

/** One surface's maps, shared across places; `ready` resolves once all are decoded. */
function photoGroundSurface(key, view) {
  if (photoGroundCache[key]) return photoGroundCache[key];
  const data = PHOTO_GROUND_DATA[key];
  const started = performance.now();
  let resolve;
  const ready = new Promise((done) => { resolve = done; });
  const wanted = data.roughness ? 3 : 2;
  let loaded = 0;
  const surface = { key, data, ready, image: null, decodeMs: 0 };
  const arrived = () => {
    loaded += 1;
    if (loaded === wanted) {
      surface.decodeMs = performance.now() - started;
      resolve(surface);
    }
  };
  surface.map = photoGroundImage(data.diffuse, view, (image) => { surface.image = image; arrived(); });
  surface.normal = photoGroundImage(data.normal, view, arrived);
  surface.rough = data.roughness ? photoGroundImage(data.roughness, view, arrived) : null;
  photoGroundCache[key] = surface;
  return surface;
}

// ---- noise ------------------------------------------------------------------

function photoGroundHash(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise, tileable with period `period` (in lattice cells) when one is given. */
function photoGroundValue(x, y, seed, period = 0) {
  let xi = Math.floor(x);
  let yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  let xj = xi + 1;
  let yj = yi + 1;
  if (period) {
    xi = ((xi % period) + period) % period;
    yi = ((yi % period) + period) % period;
    xj = (xi + 1) % period;
    yj = (yi + 1) % period;
  }
  const a = photoGroundHash(xi, yi, seed);
  const b = photoGroundHash(xj, yi, seed);
  const c = photoGroundHash(xi, yj, seed);
  const d = photoGroundHash(xj, yj, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function photoGroundFbm(x, y, seed, octaves = 4, period) {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += photoGroundValue(x, y, seed + octave * 17, period ? period << octave : 0) * amp;
    total += amp;
    x *= 2;
    y *= 2;
    amp *= 0.5;
  }
  return sum / total;
}

const photoGroundSmooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

let photoGroundMacroTexture = null;

/** A tileable RGB noise (three independent fbm fields) for the macro variation, shared by every place. */
function photoGroundMacro() {
  if (photoGroundMacroTexture) return photoGroundMacroTexture;
  const size = 256;
  const cells = 8;
  const bytes = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const at = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = photoGroundFbm((x / size) * cells, (y / size) * cells, 11 + channel * 101, 5, cells);
        bytes[at + channel] = Math.max(0, Math.min(255, (value - 0.5) * 1.6 * 255 + 128));
      }
      bytes[at + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  photoGroundMacroTexture = texture;
  return texture;
}

// ---- the per-place masks (R: second surface, G: wet, B: wear) ------------------

const PHOTO_GROUND_MASKS = {
  // A worn track curving across the green past the fight, bare patches where the fighters stand.
  meadow({ x, z, n, m }) {
    const centre = -4.5 + 0.22 * x + 1.6 * Math.sin(x * 0.09);
    const distance = Math.abs(z - centre) / Math.sqrt(1 + 0.22 * 0.22);
    const track = photoGroundSmooth(1.7, 0.4, distance + (n - 0.5) * 1.4);
    const ruts = photoGroundSmooth(0.35, 0.1, Math.abs(Math.abs(z - centre) - 0.75)) * photoGroundSmooth(2.2, 1.4, distance);
    const trodden = photoGroundSmooth(6.5, 1.5, Math.hypot(x / 1.2, z)) * photoGroundSmooth(0.45, 0.7, m) * 0.55;
    return [Math.min(1, track * 0.78 + ruts * 0.25 + trodden), 0, 0];
  },
  // Hoof-churned earth down the middle (the painted track's rectangle), its edges ragged.
  field({ x, z, n, m, arena }) {
    const ax = arena.halfX * 0.85;
    const az = arena.halfZ * 0.45;
    const edge = Math.max(Math.abs(x) - ax, (Math.abs(z) - az) * 1.6);
    const churn = photoGroundSmooth(2.5, -1.5, edge + (n - 0.5) * 6);
    const wet = churn * photoGroundSmooth(0.64, 0.74, m * 0.6 + n * 0.4) * 0.8;
    return [churn * photoGroundSmooth(0.2, 0.55, n * 0.6 + m * 0.4) * 0.95, wet, 0];
  },
  // Bunch grass in clumps over the volcanic grit, fewer where the fight treads.
  plain({ x, z, n, m }) {
    const clumps = photoGroundSmooth(0.5, 0.62, photoGroundFbm(x / 0.9, z / 0.9, 41, 3) * 0.6 + m * 0.4);
    const trodden = photoGroundSmooth(9, 3, Math.hypot(x / 1.3, z));
    return [clumps * 0.85 * (1 - 0.75 * trodden), 0, 0];
  },
  // The armies' mud across the middle, puddles standing in its lowest parts.
  sengoku({ x, z, n, m }) {
    const ellipse = Math.hypot(x / 16, z / 10);
    const mud = photoGroundSmooth(1.0, 0.35, ellipse + (n - 0.5) * 0.7) * photoGroundSmooth(0.25, 0.6, n * 0.5 + m * 0.5);
    const puddle = photoGroundSmooth(0.85, 1.0, mud) * photoGroundSmooth(0.6, 0.68, n * 0.5 + m * 0.5);
    return [Math.min(1, mud), puddle, 0];
  },
  // A few dark stains; the middle trodden (the rake's lines scuffed out).
  colosseum({ x, z, n, m, rng, cache }) {
    cache.stains ??= Array.from({ length: 7 }, () => ({ x: (rng() - 0.5) * 12, z: (rng() - 0.5) * 8, r: 0.25 + rng() * 0.5 }));
    let stain = 0;
    for (const spot of cache.stains) stain = Math.max(stain, photoGroundSmooth(spot.r, spot.r * 0.3, Math.hypot(x - spot.x, z - spot.z) + (n - 0.5) * 0.5));
    const trodden = photoGroundSmooth(1.05, 0.55, Math.hypot(x / 6.5, z / 4.4) + (m - 0.5) * 0.5);
    return [stain * 0.75, 0, trodden];
  },
  // Mud and straw in the joints, thicker towards the house fronts; a few damp hollows.
  town({ x, z, n, m }) {
    const edge = photoGroundSmooth(6, 11, Math.max(Math.abs(x), Math.abs(z) * 1.15));
    const mud = Math.min(1, edge * 0.7 + photoGroundSmooth(0.55, 0.75, n) * 0.5);
    const wet = photoGroundSmooth(0.66, 0.74, m * 0.6 + n * 0.4) * 0.8;
    return [mud, wet, 0];
  },
  // Wet sand from the tide line to the sea (+x), the high-water line of weed and wrack above it.
  beach({ x, z, n, m, recipe }) {
    const tide = 16 + Math.sin(z * 0.11) * 1.4 + Math.sin(z * 0.37 + 1) * 0.5 + (n - 0.5) * 1.2;
    const wet = photoGroundSmooth(tide - 1.6, tide + 1.2, x);
    const wrackAt = tide - 4.2 + (m - 0.5) * 1.5;
    const wrack = photoGroundSmooth(0.7, 0.15, Math.abs(x - wrackAt)) * photoGroundSmooth(0.35, 0.6, n) * (recipe.debris ? 0.95 : 0.6);
    return [wrack, wet, 0];
  },
  // Puddles in the low spots of the slabs.
  port({ n, m }) {
    const pool = n * 0.55 + m * 0.45;
    return [0, photoGroundSmooth(0.56, 0.6, pool) * 0.95 + photoGroundSmooth(0.46, 0.56, pool) * 0.05, 0];
  },
};

/** The mask over the ground's rectangle, as a DataTexture (row j is z = z0 + (j + 0.5) / size × depth). */
function photoGroundMask(recipe, rect, arena, rng) {
  const size = 384;
  const bytes = new Uint8Array(size * size * 4);
  const paint = PHOTO_GROUND_MASKS[recipe.mask];
  const cache = {};
  for (let j = 0; j < size; j += 1) {
    const z = rect.z0 + ((j + 0.5) / size) * rect.depth;
    for (let i = 0; i < size; i += 1) {
      const x = rect.x0 + ((i + 0.5) / size) * rect.width;
      const n = photoGroundFbm(x / 2.2, z / 2.2, 7, 3);
      const m = photoGroundFbm(x / 9, z / 9, 29, 2);
      const [r, g, b] = paint({ x, z, n, m, arena, rng, cache, recipe });
      const at = (j * size + i) * 4;
      bytes[at] = r * 255;
      bytes[at + 1] = g * 255;
      bytes[at + 2] = b * 255;
      bytes[at + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

// ---- the material -------------------------------------------------------------

const PHOTO_GROUND_VERTEX = {
  common: '#include <common>\nvarying vec3 vGpWorld;\n#ifdef PHOTO_GROUND_TERRAIN\nattribute float fade;\nvarying float vGpFade;\n#endif',
  begin: '#include <begin_vertex>\nvGpWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#ifdef PHOTO_GROUND_TERRAIN\nvGpFade = fade;\n#endif',
};

const PHOTO_GROUND_FRAGMENT_HEAD = `#include <common>
varying vec3 vGpWorld;
uniform sampler2D uGpMapB;
uniform sampler2D uGpNormalB;
uniform sampler2D uGpMask;
uniform sampler2D uGpMacro;
uniform vec4 uGpRect;
uniform vec2 uGpMetres;
uniform vec3 uGpTintA;
uniform vec3 uGpTintB;
uniform vec3 uGpHue;
uniform float uGpMacroAmp;
uniform vec2 uGpWet;
uniform float uGpRoughB;
uniform float uGpRake;
uniform float uGpLines;
uniform float uGpNormalScale;
uniform float uGpHasB;
uniform vec3 uGpMeanA;
uniform float uGpContrast;
uniform vec3 uGpTintMean;
#ifdef PHOTO_GROUND_TERRAIN
varying float vGpFade;
#endif
vec2 gpRot(vec2 p, float a) { float c = cos(a); float s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
float gpBand(float d, float halfWidth) { float w = fwidth(d) + 0.004; return 1.0 - smoothstep(halfWidth - w, halfWidth + w, abs(d)); }
`;

// The surfaces: two turned samples of the first, swapped by noise; the second blended in by the mask and the first's height.
const PHOTO_GROUND_MAP = `
vec2 gpXZ = vec2(vGpWorld.x, -vGpWorld.z);
vec3 gpMac = texture2D(uGpMacro, gpXZ / 71.0).rgb;
vec3 gpMac2 = texture2D(uGpMacro, gpXZ / 19.3 + 0.37).rgb;
vec3 gpMac3 = texture2D(uGpMacro, gpXZ / 5.7 + 0.71).rgb;
vec2 gpUv1 = gpXZ / uGpMetres.x;
vec2 gpUv2 = gpRot(gpXZ, 0.9) / (uGpMetres.x * 1.27) + vec2(0.31, 0.77);
float gpSwap = smoothstep(0.42, 0.58, gpMac2.r * 0.7 + gpMac3.g * 0.3);
vec3 gpA = mix(texture2D(map, gpUv1).rgb, texture2D(map, gpUv2).rgb, gpSwap);
float gpH = dot(gpA, vec3(0.333));
gpA = max(uGpMeanA + (gpA - uGpMeanA) * uGpContrast, 0.0);
vec2 gpMaskUv = (vec2(vGpWorld.x, vGpWorld.z) - uGpRect.xy) / uGpRect.zw;
vec2 gpInside2 = smoothstep(vec2(0.0), vec2(0.03), gpMaskUv) * smoothstep(vec2(1.0), vec2(0.97), gpMaskUv);
vec4 gpM = texture2D(uGpMask, gpMaskUv) * gpInside2.x * gpInside2.y;
vec2 gpUvB = gpRot(gpXZ, 0.4) / uGpMetres.y;
vec2 gpUvB2 = gpRot(gpXZ, -1.3) / (uGpMetres.y * 1.21) + vec2(0.53, 0.19);
vec3 gpB = mix(texture2D(uGpMapB, gpUvB).rgb, texture2D(uGpMapB, gpUvB2).rgb, gpSwap);
float gpHB = dot(gpB, vec3(0.333));
float gpEdge = (gpM.r - 0.5) * 2.2 + (gpHB - gpH) * 1.6 + (gpMac3.b - 0.5) * 0.7 + (gpMac2.g - 0.5) * 0.4;
float gpT = uGpHasB * smoothstep(-0.12, 0.12, gpEdge) * smoothstep(0.0, 0.08, gpM.r);
vec3 gpAc = gpA * uGpTintA;
float gpTrod = smoothstep(0.05, 0.7, gpM.r) * uGpHasB;
gpAc = mix(gpAc, vec3(dot(gpAc, vec3(0.333))) * vec3(1.06, 1.0, 0.82), 0.4 * gpTrod) * (1.0 - 0.2 * gpTrod);
vec3 gpCol = mix(gpAc, gpB * uGpTintB, gpT);
float gpMacV = (gpMac.g - 0.5) * 1.1 + (gpMac2.b - 0.5) * 0.5;
gpCol *= 1.0 + uGpMacroAmp * gpMacV;
gpCol *= mix(vec3(1.0), uGpHue, uGpMacroAmp * 2.4 * clamp(gpMac.r - 0.35, 0.0, 1.0));
float gpRakePhase = 0.0;
float gpRakeAmt = 0.0;
if (uGpRake > 0.0) {
  gpRakePhase = vGpWorld.z * 6.2831 / 0.15 + 1.8 * sin(vGpWorld.x * 0.21) + 3.0 * gpMac3.r;
  gpRakeAmt = uGpRake * (1.0 - gpM.b) * (1.0 - gpT) * (1.0 - smoothstep(0.25, 0.8, fwidth(gpRakePhase)));
  gpCol *= 1.0 - 0.07 * gpRakeAmt * sin(gpRakePhase);
}
float gpPaint = 0.0;
float gpJoint = 0.0;
if (uGpLines > 0.0) {
  float gpWear = smoothstep(0.25, 0.55, gpH + (gpMac3.r - 0.5) * 0.6);
  gpPaint = max(gpBand(vGpWorld.z - 7.1, 0.07), gpBand(vGpWorld.z + 7.1, 0.07));
  gpPaint = max(gpPaint, gpBand(vGpWorld.x - 10.6, 0.07) * step(abs(vGpWorld.z), 7.17));
  gpPaint = max(gpPaint, gpBand(vGpWorld.x + 10.6, 0.07) * step(abs(vGpWorld.z), 7.17));
  gpPaint = max(gpPaint, gpBand(vGpWorld.z, 0.06) * step(0.5, fract(vGpWorld.x / 3.0)) * step(10.6, abs(vGpWorld.x)));
  gpPaint *= gpWear;
  vec2 gpSlab = abs(fract(vGpWorld.xz / 6.0 + 0.5) - 0.5) * 6.0;
  gpJoint = max(gpBand(gpSlab.x, 0.015), gpBand(gpSlab.y, 0.015));
  gpCol = mix(gpCol, vec3(0.78, 0.62, 0.12), gpPaint * 0.85);
  gpCol *= 1.0 - 0.55 * gpJoint;
}
float gpWet = clamp(gpM.g, 0.0, 1.0);
float gpDamp = clamp(gpWet * 1.6, 0.0, 1.0);
gpCol *= mix(1.0, uGpWet.x, gpDamp);
#ifdef PHOTO_GROUND_TERRAIN
  // Out on the generated land: fade to its height-and-slope colour, the photo's grain kept in.
  vec3 gpGrain = mix(vec3(1.0), gpCol / uGpTintMean, 0.55);
  gpCol = mix(gpCol, vColor * gpGrain, vGpFade);
#endif
diffuseColor.rgb *= gpCol;
`;

const PHOTO_GROUND_ROUGHNESS = `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  roughnessFactor *= mix(texture2D(roughnessMap, gpUv1).g, texture2D(roughnessMap, gpUv2).g, gpSwap);
#endif
roughnessFactor = mix(roughnessFactor, uGpRoughB, gpT);
roughnessFactor = mix(roughnessFactor, 0.45, gpPaint);
roughnessFactor = mix(roughnessFactor, uGpWet.y, smoothstep(0.3, 0.9, gpWet));
`;

// The normal: the same blend in tangent space (x along world x, y along -z), the rake's grooves added, water flat.
const PHOTO_GROUND_NORMAL = `
vec3 gpN1 = texture2D(normalMap, gpUv1).xyz * 2.0 - 1.0;
vec3 gpN2 = texture2D(normalMap, gpUv2).xyz * 2.0 - 1.0;
gpN2.xy = gpRot(gpN2.xy, -0.9);
vec3 gpNB = texture2D(uGpNormalB, gpUvB).xyz * 2.0 - 1.0;
gpNB.xy = gpRot(gpNB.xy, -0.4);
vec3 gpNB2 = texture2D(uGpNormalB, gpUvB2).xyz * 2.0 - 1.0;
gpNB2.xy = gpRot(gpNB2.xy, 1.3);
gpNB = mix(gpNB, gpNB2, gpSwap);
vec3 gpN = mix(mix(gpN1, gpN2, gpSwap), gpNB, gpT);
gpN.xy *= uGpNormalScale;
gpN.y -= 0.45 * gpRakeAmt * cos(gpRakePhase);
gpN.xy *= 1.0 - smoothstep(0.4, 0.95, gpWet) * 0.92;
gpN.xy *= 1.0 - gpPaint * 0.6;
#ifdef PHOTO_GROUND_TERRAIN
  gpN.xy *= 1.0 - 0.6 * vGpFade;
#endif
normal = normalize(normal * gpN.z + (viewMatrix * vec4(gpN.x, 0.0, -gpN.y, 0.0)).xyz);
`;

function photoGroundMaterial(view, recipe, surfaceA, surfaceB, mask, rect, tintA, terrain = false) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: surfaceA.map,
    normalMap: surfaceA.normal,
    roughnessMap: surfaceA.rough,
    roughness: recipe.roughness,
    metalness: 0,
  });
  const uniforms = {
    uGpMapB: { value: surfaceB.map },
    uGpNormalB: { value: surfaceB.normal },
    uGpMask: { value: mask },
    uGpMacro: { value: photoGroundMacro() },
    uGpRect: { value: new THREE.Vector4(rect.x0, rect.z0, rect.width, rect.depth) },
    uGpMetres: { value: new THREE.Vector2(surfaceA.data.metres * (recipe.scale ?? 1.15), surfaceB.data.metres * (recipe.scaleB ?? 1.15)) },
    uGpTintA: { value: new THREE.Vector3(...tintA) },
    uGpTintB: { value: new THREE.Vector3(...recipe.tintB) },
    uGpHue: { value: new THREE.Vector3(...recipe.hue) },
    uGpMacroAmp: { value: recipe.macro },
    uGpWet: { value: new THREE.Vector2(...(recipe.wet ?? [1, 1])) },
    uGpRoughB: { value: recipe.roughB },
    uGpRake: { value: recipe.rake ?? 0 },
    uGpLines: { value: recipe.lines ? 1 : 0 },
    uGpNormalScale: { value: recipe.normalScale ?? 1 },
    uGpHasB: { value: recipe.secondary ? 1 : 0 },
    uGpMeanA: { value: new THREE.Vector3(...surfaceA.data.mean.map((value) => value / 255)) },
    uGpContrast: { value: recipe.contrast ?? 1.25 },
    uGpTintMean: { value: new THREE.Vector3(...surfaceA.data.mean.map((value, channel) => (value / 255) * tintA[channel])) },
  };
  material.userData.photoGround = uniforms;
  if (recipe.reflects) {
    material.envMap = view.steelEnv;
    material.envMapIntensity = recipe.reflects;
    material.userData.reflects = recipe.reflects;
  }
  if (terrain) {
    material.vertexColors = true;
    material.defines = { PHOTO_GROUND_TERRAIN: '' };
  }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', PHOTO_GROUND_VERTEX.common)
      .replace('#include <begin_vertex>', PHOTO_GROUND_VERTEX.begin);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', PHOTO_GROUND_FRAGMENT_HEAD)
      .replace('#include <map_fragment>', PHOTO_GROUND_MAP)
      .replace('#include <color_fragment>', '')
      .replace('#include <roughnessmap_fragment>', PHOTO_GROUND_ROUGHNESS)
      .replace('#include <normal_fragment_maps>', PHOTO_GROUND_NORMAL);
  };
  material.customProgramCacheKey = () => `photo-ground-${terrain ? 't' : 'f'}`;
  return material;
}

// ---- matching the painted ground and the foothills ------------------------------

/** The mean colour (0..1) of a painted ground's map. */
function photoGroundPaintedMean(ground) {
  const image = ground?.material?.map?.image;
  if (!image) return null;
  const small = Object.assign(document.createElement('canvas'), { width: 8, height: 8 });
  const paint = small.getContext('2d');
  paint.drawImage(image, 0, 0, 8, 8);
  const data = paint.getImageData(0, 0, 8, 8).data;
  const sum = [0, 0, 0];
  for (let index = 0; index < data.length; index += 4) for (let channel = 0; channel < 3; channel += 1) sum[channel] += data[index + channel];
  return sum.map((value) => value / (data.length / 4) / 255);
}

/**
 * The generated foothills (src/scenery/generated.js) reuse the painted ground's
 * material where the land is flat, so it runs on without a seam; the land rises
 * over the outer part of the flat ground, so most of what shows beyond the fight
 * is that land. While this style is in force the land wears this style's own
 * material instead (the same world-space photo, macro and mask, fading to the
 * land's height-and-slope vertex colour with the photo's grain as it rises), so
 * the photo runs on over the hills with no seam; the painted material comes back
 * when it is not. Swapped in onBeforeRender (it takes effect the next frame), so
 * it follows the style switch without a hook for leaving. Untagged flat overlays
 * (the field's track, the beach's wet strip) wear the flat photo material the same way.
 */
function photoGroundHookLand(group, makeTerrainMaterial) {
  const place = group.parent;
  if (!place) return;
  const shown = () => group.visible && place.visible;
  place.traverse((object) => {
    if (!object.isMesh || group.children.includes(object) || object.userData.photoGroundHooked) return;
    const generated = object.material?.userData?.generated;
    if (generated && object.geometry.attributes.fade) {
      object.userData.photoGroundHooked = true;
      const painted = object.material;
      const photo = makeTerrainMaterial();
      const previous = object.onBeforeRender;
      object.onBeforeRender = (...args) => {
        previous?.(...args);
        object.material = shown() ? photo : painted;
      };
      return;
    }
    // Untagged flat overlays lying on the ground (the field's translucent track, the beach's wet-sand strip): wear the photo too.
    if (object.geometry?.type === 'PlaneGeometry' && Math.abs(object.position.y) < 0.02 && Math.abs(object.rotation.x + Math.PI / 2) < 1e-3 && object.material?.isMeshStandardMaterial && !object.userData.scenery) {
      object.userData.photoGroundHooked = true;
      const painted = object.material;
      const photo = group.children[0].material;
      const previous = object.onBeforeRender;
      object.onBeforeRender = (...args) => {
        previous?.(...args);
        object.material = shown() ? photo : painted;
      };
    }
  });
}

// ---- the style ----------------------------------------------------------------

function photoGroundBuild({ place, view, arena, grounds, rng }) {
  const recipe = PHOTO_GROUND_PLACES[place];
  if (!recipe || !grounds.length) return null;
  const started = performance.now();
  const surfaceA = photoGroundSurface(recipe.primary, view);
  const surfaceB = recipe.secondary ? photoGroundSurface(recipe.secondary, view) : surfaceA;
  // Tint the photo towards the painted ground's mean (the place's art direction, and the foothills' colour).
  const painted = photoGroundPaintedMean(grounds[0]);
  const mean = surfaceA.data.mean.map((value) => value / 255);
  // Brightness matched in full, hue half way: the photo keeps its own browns and greys.
  const luma = (rgb) => rgb[0] * 0.3 + rgb[1] * 0.55 + rgb[2] * 0.15;
  const gain = painted ? luma(painted) / luma(mean) : 1;
  const tintA = mean.map((value, channel) => {
    const match = painted ? painted[channel] / value / gain : 1;
    return Math.min(1.6, Math.max(0.6, gain * (1 + (match - 1) * (recipe.hueMatch ?? 0.5)))) * recipe.adjust[channel];
  });
  const box = new THREE.Box3();
  for (const ground of grounds) {
    ground.updateWorldMatrix(true, false);
    ground.geometry.computeBoundingBox();
    box.union(ground.geometry.boundingBox.clone().applyMatrix4(ground.matrixWorld));
  }
  const rect = { x0: box.min.x, z0: box.min.z, width: box.max.x - box.min.x, depth: box.max.z - box.min.z };
  const maskStarted = performance.now();
  const mask = photoGroundMask(recipe, rect, arena, rng);
  const maskMs = performance.now() - maskStarted;
  const material = photoGroundMaterial(view, recipe, surfaceA, surfaceB, mask, rect, tintA);
  const group = new THREE.Group();
  for (const ground of grounds) {
    const mesh = new THREE.Mesh(ground.geometry, material);
    mesh.applyMatrix4(ground.matrixWorld);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.visible = false;
  const makeTerrainMaterial = () => photoGroundMaterial(view, recipe, surfaceA, surfaceB, mask, rect, tintA, true);
  group.userData.photoGround = { surfaceA, tintA, recipe, makeTerrainMaterial, wanted: false, timing: { buildMs: 0, maskMs, decodeMs: 0 } };
  Promise.all([surfaceA.ready, surfaceB.ready]).then(() => {
    const timing = group.userData.photoGround.timing;
    timing.decodeMs = Math.max(surfaceA.decodeMs, surfaceB.decodeMs);
    timing.readyMs = performance.now() - started;
    group.userData.photoGround.ready = true;
    if (group.userData.photoGround.wanted && group.parent?.visible) group.visible = true;
  });
  group.userData.photoGround.timing.buildMs = performance.now() - started;
  return group;
}

function photoGroundApply({ view, group }) {
  const state = group.userData.photoGround;
  state.wanted = true;
  group.visible = Boolean(state.ready);
  // The look's environment (probe-lite's cube) for the wet places' reflections.
  for (const mesh of group.children) if (mesh.material.userData.reflects) mesh.material.envMap = view.steelEnv;
  photoGroundHookLand(group, state.makeTerrainMaterial);
}

/** Ground styles: { id, label, blurb, hidesGround: bool, build({ place, view, kind, arena, grounds, rng }) -> THREE.Group, apply?({ place, view, kind, arena, group }) }. */
export const PHOTO_GROUND = [
  {
    id: 'ground-photo',
    label: 'Photo: scanned PBR ground',
    blurb: 'Real CC0 photo-scanned ground (Poly Haven): diffuse, normal and roughness tiled at their real size, two turned samples swapped by noise and a macro variation so no repeat shows, and each place\'s features (track, churned strip, mud, raked sand, wet tide line, puddles, painted lines) blended in by a mask.',
    hidesGround: true,
    build: photoGroundBuild,
    apply: photoGroundApply,
  },
];
