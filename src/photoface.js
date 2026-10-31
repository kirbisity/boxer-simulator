// Photo faces (a prototype): a head drawn from a photographed face, with a
// normal map for its relief and a roughness map, in place of the drawn anime
// eyes, brows and mouth. Off unless the page is opened with #faces=photo (or
// the harness turns it on).
//
// The faces are regional "average face" composites (frontal photos): each is
// projected offline (tools/photofaces/avg_build.py) into one canonical
// cylindrical atlas (PHOTO_ATLAS: the face at the middle, the eyes, lip line
// and chin at fixed places, the back of the head at both edges), the rest of
// the head synthesised as skin, its light flattened, and its colour stored
// relative to its own cheeks: the game multiplies it by the fighter's skin, so
// face and body match. One set of texture coordinates on the head (face.js
// photoUV) fits every face.
//
// Who gets which face: faceregions.js (by culture and kit, or the fighter's
// own `faceRegion`), two regions blended per fighter, with his skin and
// proportions jittered by a seed, so an army is not one man cloned.
//
// The atlases are not in the repository (their source still has to be
// cleared): they are loaded at run time from PHOTO_FACES.base, a local folder
// served by the dev server, each face's maps only when a fighter first wears
// it. Missing, the heads stay drawn.

/* global THREE */
import { nearestRegion, regionsFor } from './faceregions.js';

/**
 * Where the landmarks sit in the atlas: u from the face's centre (eyes, ears); rows from the crown (eye line, lip line, chin, and
 * about where a hairline is: `hairlineRow`, put on the head at `hairlineAt` of the way from the middle up to the crown, by angle).
 * `eyeHalf`: an eye's half-width (u) and half-height (v), for the blink.
 */
export const PHOTO_ATLAS = { eyeU: 0.0668, earU: 0.258, eyeRow: 0.44, mouthRow: 0.70, chinRow: 0.88, mouthShare: 0.56, chinT: 0.95, hairlineRow: 0.22, hairlineAt: 0.36, eyeHalf: [0.027, 0.013] };

export const PHOTO_FACES = {
  base: 'faces-local/avg/',
  // How much a fighter varies: the second region's share of his face, his skin's brightness and warmth, his face's width and
  // the height of his eyes and mouth (atlas rows).
  vary: { blend: [0.15, 0.45], bright: 0.06, warm: 0.03, width: 0.06, eyeRow: 0.008, mouthRow: 0.012 },
  normalScale: 1,
};

const photoManifest = { faces: null, neutral: 0.8, thumb: [32, 16] };
const photoTextures = new Map();
let photoWanted = null;
let photoLoading = null;

/** Whether heads are drawn from photos: #faces=photo in the URL (default off), or set by the harness. */
export function photoFacesOn() {
  if (photoWanted === null) {
    const hash = typeof location === 'undefined' ? '' : location.hash.replace(/^#/, '');
    photoWanted = new URLSearchParams(hash).get('faces') === 'photo';
  }
  return photoWanted;
}

/** Turn photo faces on or off (the next heads built follow it); loads the manifest on the way on. */
export function setPhotoFaces(on) {
  photoWanted = Boolean(on);
  return photoWanted ? loadPhotoFaces() : Promise.resolve(0);
}

/** Load the faces' manifest (once): which faces there are, their skin and hair, a thumbnail each; resolves to how many. */
export function loadPhotoFaces() {
  photoLoading ??= fetch(`${PHOTO_FACES.base}manifest.json`).then((answer) => (answer.ok ? answer.json() : null)).catch(() => null).then((data) => {
    if (!data) return 0;
    photoManifest.neutral = data.neutral;
    photoManifest.thumb = data.thumb;
    photoManifest.faces = Object.fromEntries(Object.entries(data.faces).map(([key, face]) => {
      const bytes = Uint8Array.from(atob(face.thumb), (char) => char.charCodeAt(0));
      return [key, { key, ...face, thumb: bytes }];
    }));
    return Object.keys(photoManifest.faces).length;
  });
  return photoLoading;
}

function photoTexture(file) {
  if (photoTextures.has(file)) return photoTextures.get(file).texture;
  const texture = new THREE.TextureLoader().load(`${PHOTO_FACES.base}${file}`, (loaded) => {
    const entry = photoTextures.get(file);
    if (entry) entry.bytes = Math.round(loaded.image.width * loaded.image.height * 4 * (4 / 3));
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  photoTextures.set(file, { texture, bytes: 0 });
  return texture;
}

/** What the loaded maps cost on the GPU (RGBA8 with mipmaps): each face's and all together (bytes). */
export function photoFaceStats() {
  const faces = {};
  let total = 0;
  for (const [file, { bytes }] of photoTextures) {
    const key = file.replace(/-(albedo\.jpg|normal\.png)$/, '');
    faces[key] = (faces[key] ?? 0) + bytes;
    total += bytes;
  }
  const pending = [...photoTextures.values()].filter(({ bytes }) => bytes === 0).length;
  return { faces: Object.keys(faces).filter((key) => key !== 'rough.png').length, perFace: faces, total, pending, available: photoManifest.faces ? Object.keys(photoManifest.faces).length : 0 };
}

/** A small photoSeeded generator (mulberry32). */
function photoSeeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
const photoHash = (text) => [...String(text ?? '')].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0, 2166136261);

const photoCasts = new WeakMap();
let photoCastCount = 0;
/** Start a fight's casting: its fighters are seeded 0, 1, 2, ... in the order they are built, so a fight looks the same each time. */
export function resetPhotoCasting() {
  photoCastCount = 0;
}
const PHOTO_NO_FACE_KITS = new Set(['silverback', 'humanoid', 'combatBot']);

/**
 * The face a fighter is drawn with (the same for the same inputs, every time it is asked), or null (photo faces off, the manifest
 * not loaded, a machine or an ape). `{ primary, secondary, blend, skin, hair, jitter }`: two faces of his sex blended, his skin
 * colour (the face's maps are relative to it), his hair's, and the jitter of his proportions.
 */
export function photoFaceFor(inputs, outfitRegion = null) {
  if (!photoFacesOn() || !photoManifest.faces) return null;
  if (PHOTO_NO_FACE_KITS.has(inputs.outfit?.kind) || inputs.build?.rigid) return null;
  if (photoCasts.has(inputs)) return photoCasts.get(inputs);
  const sex = inputs.sex === 'female' ? 'female' : 'male';
  const available = Object.values(photoManifest.faces).filter((face) => face.sex === sex).map((face) => face.region);
  const random = photoSeeded(photoHash(inputs.name) + photoCastCount * 7919);
  photoCastCount += 1;
  const regions = regionsFor(inputs, outfitRegion).map((region) => nearestRegion(region, available));
  const first = regions[Math.floor(random() * regions.length) % regions.length];
  // The second: another of his culture's, or the nearest other region of his sex.
  const others = regions.filter((region) => region !== first);
  const second = others.length ? others[Math.floor(random() * others.length)] : nearestRegion(first, available.filter((region) => region !== first));
  const vary = PHOTO_FACES.vary;
  const primary = photoManifest.faces[`${sex}-${first}`];
  const secondary = photoManifest.faces[`${sex}-${second}`] ?? primary;
  const blend = vary.blend[0] + random() * (vary.blend[1] - vary.blend[0]);
  const skin = new THREE.Color(primary.skin).lerp(new THREE.Color(secondary.skin), blend);
  const hsl = skin.getHSL({});
  skin.setHSL(hsl.h + (random() - 0.5) * 2 * vary.warm * 0.1, hsl.s * (1 + (random() - 0.5) * 2 * vary.warm), hsl.l * (1 + (random() - 0.5) * 2 * vary.bright));
  const hair = new THREE.Color(primary.hair).lerp(new THREE.Color(secondary.hair), blend);
  const jitter = { width: (random() - 0.5) * 2 * vary.width, eyeRow: (random() - 0.5) * 2 * vary.eyeRow, mouthRow: (random() - 0.5) * 2 * vary.mouthRow };
  const cast = { id: `${primary.key}+${secondary.key}`, primary, secondary, blend, skin: `#${skin.getHexString()}`, hair: `#${hair.getHexString()}`, jitter };
  photoCasts.set(inputs, cast);
  return cast;
}

/**
 * The head's material for a face: lit (standard), the two faces' albedos blended in the shader, the first's normal map, the
 * shared roughness map, and a blink (the eyelids drawn down over the eyes: `userData.lid`, 0 open to 1 shut); its colour is the
 * fighter's skin (over the atlas' neutral). In a crowd (`painted`) its colours are per vertex instead (paintFromFace).
 */
export function photoSkinMaterial(cast, { painted = false } = {}) {
  const colour = new THREE.Color(cast.skin).multiplyScalar(1 / photoManifest.neutral);
  if (painted) {
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    material.userData.photoFace = cast.id;
    return material;
  }
  const material = new THREE.MeshStandardMaterial({
    color: colour,
    map: photoTexture(`${cast.primary.key}-albedo.jpg`),
    normalMap: photoTexture(`${cast.primary.key}-normal.png`),
    roughnessMap: photoTexture('rough.png'),
    roughness: 1,
    metalness: 0,
  });
  material.normalScale.set(PHOTO_FACES.normalScale, PHOTO_FACES.normalScale);
  const uniforms = { faceMap2: { value: photoTexture(`${cast.secondary.key}-albedo.jpg`) }, faceBlend: { value: cast.blend }, faceLid: { value: 0 } };
  const [eyeHalfU, eyeHalfV] = PHOTO_ATLAS.eyeHalf;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>
uniform sampler2D faceMap2;
uniform float faceBlend;
uniform float faceLid;`)
      .replace('#include <map_fragment>', `vec4 texelColor = mix(texture2D(map, vUv), texture2D(faceMap2, vUv), faceBlend);
texelColor = mapTexelToLinear(texelColor);
// The eyelids: down over each eye from its top, as far as faceLid, in the skin's own neutral.
for (int side = -1; side <= 1; side += 2) {
  vec2 eye = vec2(0.5 + float(side) * ${PHOTO_ATLAS.eyeU.toFixed(4)}, ${(1 - PHOTO_ATLAS.eyeRow).toFixed(4)});
  vec2 d = (vUv - eye) / vec2(${(eyeHalfU * 1.25).toFixed(4)}, ${(eyeHalfV * 1.6).toFixed(4)});
  float shut = step(dot(d, d), 1.0) * step(1.0 - 2.0 * faceLid, d.y);
  texelColor.rgb = mix(texelColor.rgb, vec3(${(photoManifest.neutral * 0.9).toFixed(3)}), shut * step(0.02, faceLid));
}
diffuseColor *= texelColor;`);
  };
  material.customProgramCacheKey = () => 'photoface';
  material.userData.photoFace = cast.id;
  material.userData.lid = uniforms.faceLid;
  material.userData.faceMap2 = uniforms.faceMap2.value;
  return material;
}

/** Paint a geometry's vertices from a face's thumbnails (the two blended) at their texture coordinates, times the skin: a crowd's heads. */
export function paintFromFace(geometry, cast) {
  const uv = geometry.attributes.uv;
  const [width, height] = photoManifest.thumb;
  const skin = new THREE.Color(cast.skin);
  const scale = 1 / (255 * photoManifest.neutral);
  const sample = (thumb, u, v) => {
    const x = Math.min(width - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor((1 - v) * height)));
    return (y * width + x) * 3;
  };
  const colours = new Float32Array(uv.count * 3);
  for (let index = 0; index < uv.count; index += 1) {
    const a = sample(cast.primary.thumb, uv.getX(index), uv.getY(index));
    for (let channel = 0; channel < 3; channel += 1) {
      const value = cast.primary.thumb[a + channel] * (1 - cast.blend) + cast.secondary.thumb[a + channel] * cast.blend;
      colours[index * 3 + channel] = value * scale * [skin.r, skin.g, skin.b][channel];
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
}

/** Let go of the maps no head in `root` (the scene) wears any more: a fight's faces are freed when the next one is built. */
export function releaseUnusedPhotoFaces(root) {
  const used = new Set();
  root.traverse((object) => {
    const material = object.material;
    if (!material?.userData?.photoFace) return;
    for (const texture of [material.map, material.normalMap, material.roughnessMap, material.userData.faceMap2]) if (texture) used.add(texture);
  });
  for (const [file, entry] of photoTextures) {
    if (used.has(entry.texture)) continue;
    entry.texture.dispose();
    photoTextures.delete(file);
  }
}
