// Photo faces: a head drawn from a photographed face, with a normal map for
// its relief and a roughness map, in place of the drawn anime eyes, brows and
// mouth. On unless the page is opened with #faces=off (the drawn faces).
//
// The faces are regional "average face" composites (frontal photos): each is
// projected offline (tools/photofaces/avg_build.py) into one canonical
// cylindrical atlas (PHOTO_ATLAS: the face at the middle, the eyes, lip line
// and chin at fixed places, the back of the head at both edges), the rest of
// the head synthesised as skin, its light flattened, and its colour stored
// relative to its own cheeks: the game multiplies it by the fighter's skin, so
// face and body match. One set of texture coordinates on the head (photohead.js)
// fits every face.
//
// Who gets which face: faceregions.js (by culture and kit, or the fighter's
// own `faceRegion`), two regions blended per fighter, with his skin and
// proportions jittered by a seed, so an army is not one man cloned.
//
// The atlases are in assets/faces/ (PHOTO_FACES.base), each face's maps
// fetched when a fighter first wears it; the single-file bundle carries them
// as data URLs (PHOTO_FACE_EMBED). Missing, the heads stay drawn.

/* global THREE */
import { nearestRegion, regionGroup, regionShape, regionsFor, REGION_DETAIL, toneShift } from './faceregions.js';
import { SKIN_TONES } from './skintones.js';
import { SCALP_GLSL } from './photohair.js';

/**
 * Where the landmarks sit in the atlas: u from the face's centre (eyes, ears); rows from the crown (eye line, lip line, chin, and
 * about where a hairline is: `hairlineRow`, put on the head at `hairlineAt` of the way from the middle up to the crown, by angle).
 * `eyeHalf`: an eye's half-width (u) and half-height (v), for the blink.
 */
export const PHOTO_ATLAS = { eyeU: 0.0668, earU: 0.258, eyeRow: 0.44, mouthRow: 0.70, chinRow: 0.88, mouthShare: 0.56, chinT: 0.95, hairlineRow: 0.22, hairlineAt: 0.36, eyeHalf: [0.027, 0.013] };

export const PHOTO_FACES = {
  base: 'assets/faces/',
  // How much a fighter varies: the second region's share of his face, his skin's brightness and warmth, his face's width and
  // the height of his eyes and mouth (atlas rows).
  vary: { blend: [0.15, 0.45], bright: 0.06, warm: 0.03, width: 0.06, eyeRow: 0.008, mouthRow: 0.012, region: 0.8, shape: 0.25, measured: 0.35 },
  // The face's ambient light, scaled: a fill, so a face under an overhead key is not darker and muddier than the chest beside it.
  fill: 1.8,
  normalScale: 1,
};

const photoManifest = { faces: null, neutral: 0.8, thumb: [32, 16] };
/** The regions there are faces of for a sex (the character creator's origins), or null: photo faces off, or not loaded yet. */
export function photoFaceRegions(sex) {
  if (!photoFacesOn() || !photoManifest.faces) return null;
  const wanted = sex === 'female' ? 'female' : 'male';
  return Object.values(photoManifest.faces).filter((face) => face.sex === wanted).map((face) => face.region);
}

const photoTextures = new Map();
let photoWanted = null;
let photoLoading = null;

/** Whether heads are drawn from photos: on, unless the URL says #faces=off (the drawn faces); the harness may set it. */
export function photoFacesOn() {
  if (photoWanted === null) {
    const hash = typeof location === 'undefined' ? '' : location.hash.replace(/^#/, '');
    photoWanted = new URLSearchParams(hash).get('faces') !== 'off';
  }
  return photoWanted;
}

// The single-file bundle (tools/bundle.js) fills this with the maps as data URLs, by file name; the page served from the
// repository fetches them from PHOTO_FACES.base.
const PHOTO_FACE_EMBED = null;
/** Where a face file is read from: the bundle's data URL, or the folder. */
const photoFile = (file) => PHOTO_FACE_EMBED?.[file] ?? `${PHOTO_FACES.base}${file}`;

/** Turn photo faces on or off (the next heads built follow it); loads the manifest on the way on. */
export function setPhotoFaces(on) {
  photoWanted = Boolean(on);
  return photoWanted ? loadPhotoFaces() : Promise.resolve(0);
}

/** Load the faces' manifest (once): which faces there are, their skin and hair, a thumbnail each; resolves to how many. */
export function loadPhotoFaces() {
  photoLoading ??= fetch(photoFile('manifest.json')).then((answer) => (answer.ok ? answer.json() : null)).catch(() => null).then((data) => {
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
  const texture = new THREE.TextureLoader().load(photoFile(file), (loaded) => {
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
  let shared = 0;
  let total = 0;
  for (const [file, { bytes }] of photoTextures) {
    const face = /^(.*)-(albedo\.jpg|normal\.png)$/.exec(file);
    if (face) faces[face[1]] = (faces[face[1]] ?? 0) + bytes;
    else shared += bytes;
    total += bytes;
  }
  const pending = [...photoTextures.values()].filter(({ bytes }) => bytes === 0).length;
  return { faces: Object.keys(faces).length, perFace: faces, shared, total, pending, available: photoManifest.faces ? Object.keys(photoManifest.faces).length : 0 };
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
const PHOTO_NO_FACE_KITS = new Set(['silverback', 'humanoid', 'miniHumanoid', 'combatBot']);

/**
 * The face a fighter is drawn with (the same for the same inputs, every time it is asked), or null (photo faces off, the manifest
 * not loaded, a machine or an ape). `{ primary, secondary, blend, skin, hair, jitter, shape, detail }`: two faces of his sex
 * blended, his skin colour (the face's maps are relative to it), his hair's (greying with age), the jitter of his proportions,
 * his head's region shape (faceregions.js REGION_SHAPES, the composite's measured nose, jitter: photohead.js), and the detail
 * the shader paints (stubble, freckles, moles, redness, age lines).
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
  // The second: another of his culture's, else the nearest of the same group (faceregions.js), else the nearest of all.
  const others = regions.filter((region) => region !== first);
  const kin = available.filter((region) => region !== first && regionGroup(region) === regionGroup(first));
  const second = others.length ? others[Math.floor(random() * others.length)] : nearestRegion(first, kin.length ? kin : available.filter((region) => region !== first));
  const vary = PHOTO_FACES.vary;
  const primary = photoManifest.faces[`${sex}-${first}`];
  const secondary = photoManifest.faces[`${sex}-${second}`] ?? primary;
  const blend = vary.blend[0] + random() * (vary.blend[1] - vary.blend[0]);
  const skin = new THREE.Color(primary.skin).lerp(new THREE.Color(secondary.skin), blend);
  const hsl = skin.getHSL({});
  skin.setHSL(hsl.h + (random() - 0.5) * 2 * vary.warm * 0.1, hsl.s * (1 + (random() - 0.5) * 2 * vary.warm), hsl.l * (1 + (random() - 0.5) * 2 * vary.bright));
  // An origin chosen with a lighter or darker skin than its own (faceregions.js toneShift): the composite's skin moved by the
  // ratio of the two tones, channel by channel, so it stays this face's skin, a shade off. (No draw from `random`: the rest of
  // his casting is the same whatever his tone.)
  const shift = toneShift(inputs);
  if (shift) {
    const from = new THREE.Color(SKIN_TONES[shift.from]);
    const to = new THREE.Color(SKIN_TONES[shift.to]);
    skin.setRGB(Math.min(1, (skin.r * to.r) / from.r), Math.min(1, (skin.g * to.g) / from.g), Math.min(1, (skin.b * to.b) / from.b));
  }
  const age = inputs.age ?? 30;
  const grey = Math.min(1, Math.max(0, (age - 42) / 30)) * 0.75;
  const hair = new THREE.Color(primary.hair).lerp(new THREE.Color(secondary.hair), blend).lerp(new THREE.Color(0x9a958e), grey);
  const jitter = { width: (random() - 0.5) * 2 * vary.width, eyeRow: (random() - 0.5) * 2 * vary.eyeRow, mouthRow: (random() - 0.5) * 2 * vary.mouthRow };
  // The head's shape: the two regions' tendencies blended, the composite's own nose, his own jitter.
  const shapeA = regionShape(first);
  const shapeB = regionShape(second);
  const shape = {};
  for (const name of PHOTO_SHAPE_KEYS) {
    let value = (shapeA[name] ?? 0) * (1 - blend) + (shapeB[name] ?? 0) * blend;
    if (name === 'noseWidth') value = value * (1 - vary.measured) + (primary.measured?.noseWidth ?? 0) * vary.measured;
    shape[name] = value * vary.region + (random() - 0.5) * 2 * vary.shape;
  }
  // What the shader paints: stubble by the region and age (and full where he wears a beard), freckles on fair skin of freckled
  // regions, a few moles, ruddiness on light skin, age lines.
  const light = Math.min(1, Math.max(0, (skin.getHSL({}).l - 0.45) / 0.25));
  const group = regionGroup(first);
  const facialHair = inputs.look?.facialHair ?? 'none';
  const beardy = (REGION_DETAIL.beard[group] ?? 0.5) * (0.6 + 0.4 * Math.min(1, age / 35));
  const detail = {
    seed: random() * 100,
    stubble: sex === 'male' ? Math.min(1, (facialHair === 'none' ? 0.25 + 0.35 * random() : 0.85) * beardy * (facialHair === 'none' ? 1 : 1.4)) : 0,
    freckles: (REGION_DETAIL.freckles[first] ?? 0) * light * (random() < 0.6 ? 0.3 + 0.7 * random() : 0),
    moles: 0.002 + 0.01 * random(),
    redness: light * (0.25 + 0.4 * random()),
    wrinkles: Math.min(1, Math.max(0, (age - 35) / 35, ((inputs.bodyFat ?? 0.15) - 0.25) * 1.2)),
  };
  const cast = { id: `${primary.key}+${secondary.key}`, primary, secondary, blend, skin: `#${skin.getHexString()}`, hair: `#${hair.getHexString()}`, jitter, shape, detail, age };
  photoCasts.set(inputs, cast);
  return cast;
}
const PHOTO_SHAPE_KEYS = ['noseBridge', 'noseWidth', 'brow', 'cheekbone', 'cheekWidth', 'socket', 'lidFold', 'lips', 'jaw', 'chin', 'faceLength', 'cephalic'];

const PHOTO_SHADER_HEAD = `
uniform sampler2D faceMap2;
uniform sampler2D faceDetail;
uniform sampler2D faceWrinkleMap;
uniform sampler2D facePores;
uniform float faceBlend;
uniform float faceLid;
uniform float faceSeed;
uniform float faceStubble;
uniform float faceFreckles;
uniform float faceMoles;
uniform float faceRedness;
uniform float faceWrinkles;
uniform float faceFill;
uniform vec3 faceHairTint;
uniform float faceHairline;
uniform float faceTemple;
uniform float faceSideburn;
uniform float faceHairNape;
uniform float faceHairDensity;
uniform float faceCrown;
uniform float faceHairSeed;
uniform float faceBeard;
uniform float faceMustache;
float faceHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
${SCALP_GLSL}`;

/**
 * The head's material for a face: lit (standard), the two faces' albedos blended in the shader with the fighter's detail painted
 * over them (shared masks: detail.png, wrinkles.png, pores.png; avg_shared.py), the first face's normal map with age lines and
 * pores, the shared roughness map, the body's marks and the face's shadow per vertex (photohead.js), a blink (the eyelids drawn
 * down over the eyes: `userData.lid`, 0 open to 1 shut), and a fill on the face's ambient light (PHOTO_FACES.fill). Its colour is
 * the fighter's skin (over the atlas' neutral). In a crowd (`painted`) its colours are per vertex instead (paintFromFace).
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
    vertexColors: true,
  });
  material.normalScale.set(PHOTO_FACES.normalScale, PHOTO_FACES.normalScale);
  const pores = photoTexture('pores.png');
  pores.wrapT = THREE.RepeatWrapping;
  const skin = new THREE.Color(cast.skin);
  const hair = new THREE.Color(cast.hair);
  const tint = new THREE.Vector3(...['r', 'g', 'b'].map((c) => Math.min(1, Math.max(0.12, hair[c] / Math.max(0.05, skin[c])))));
  const d = cast.detail;
  const uniforms = {
    faceMap2: { value: photoTexture(`${cast.secondary.key}-albedo.jpg`) }, faceBlend: { value: cast.blend }, faceLid: { value: 0 },
    faceDetail: { value: photoTexture('detail.png') }, faceWrinkleMap: { value: photoTexture('wrinkles.png') }, facePores: { value: pores },
    faceSeed: { value: d.seed }, faceStubble: { value: d.stubble }, faceFreckles: { value: d.freckles }, faceMoles: { value: d.moles },
    faceRedness: { value: d.redness }, faceWrinkles: { value: d.wrinkles }, faceFill: { value: PHOTO_FACES.fill }, faceHairTint: { value: tint },
    // The painted scalp and beard (photohair.js photoScalp; face.js sets them once the style is known): bald until then.
    faceHairline: { value: 0.2 }, faceTemple: { value: 0 }, faceSideburn: { value: 0.5 }, faceHairNape: { value: 0.64 }, faceHairDensity: { value: 0 },
    faceCrown: { value: 0 }, faceHairSeed: { value: 0 }, faceBeard: { value: 0 }, faceMustache: { value: 0 },
  };
  const [eyeHalfU, eyeHalfV] = PHOTO_ATLAS.eyeHalf;
  const lidTone = (photoManifest.neutral * 0.92).toFixed(3);
  const normals = THREE.ShaderChunk.normal_fragment_maps.replace('vec3 mapN = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0;', `vec3 mapN = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0;
	vec4 faceMask = texture2D( faceDetail, vUv );
	mapN.xy += ( texture2D( faceWrinkleMap, vUv ).xy * 2.0 - 1.0 ) * faceWrinkles * 0.2;
	mapN.xy += ( texture2D( facePores, vUv * vec2( 40.0, 20.0 ) ).xy * 2.0 - 1.0 ) * 0.5 * faceMask.a;
	float scalpN = faceScalp( vUv );
	mapN.x += ( faceNoise( vec2( vUv.x * 900.0, ( 1.0 - vUv.y ) * 45.0 + faceHairSeed ) ) - 0.5 ) * 1.2 * scalpN;`);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>${PHOTO_SHADER_HEAD}`)
      .replace('#include <map_fragment>', `vec4 texelColor = mix(texture2D(map, vUv), texture2D(faceMap2, vUv), faceBlend);
texelColor = mapTexelToLinear(texelColor);
vec4 faceArea = texture2D(faceDetail, vUv);
// Skin grain; ruddy nose and cheeks; stubble (dots of the hair's colour over a shadow of it); freckles; moles; age lines.
texelColor.rgb *= 1.0 + (texture2D(facePores, vUv * vec2(40.0, 20.0)).b - 0.5) * 0.12 * faceArea.a;
texelColor.rgb = mix(texelColor.rgb, texelColor.rgb * vec3(1.05, 0.88, 0.88), faceArea.g * faceRedness);
float hairDot = step(0.5, faceHash(floor(vUv * vec2(1100.0, 550.0)) + faceSeed));
texelColor.rgb *= mix(vec3(1.0), faceHairTint, faceArea.r * faceStubble * (0.3 + 0.55 * hairDot));
vec2 freckleCell = vUv * vec2(560.0, 280.0);
float freckle = step(faceHash(floor(freckleCell) + faceSeed * 1.7), 0.2) * smoothstep(0.42, 0.18, length(fract(freckleCell) - 0.5));
texelColor.rgb *= 1.0 - vec3(0.12, 0.17, 0.2) * freckle * faceFreckles * faceArea.a;
vec2 moleCell = vUv * vec2(110.0, 55.0);
float mole = step(faceHash(floor(moleCell) + faceSeed * 3.3), faceMoles) * smoothstep(0.2, 0.1, length(fract(moleCell) - 0.5));
texelColor.rgb *= 1.0 - vec3(0.45, 0.5, 0.5) * mole * faceArea.a;
texelColor.rgb *= 1.0 - faceArea.b * faceWrinkles * 0.1;
// The scalp's hair, painted to an irregular hairline (photohair.js), and a beard's or moustache's density under its cards.
float strandTone = faceNoise(vec2(vUv.x * 900.0, (1.0 - vUv.y) * 45.0 + faceHairSeed));
vec3 hairTone = faceHairTint * ${photoManifest.neutral.toFixed(3)} * (0.65 + 0.7 * strandTone);
texelColor.rgb = mix(texelColor.rgb, hairTone, faceScalp(vUv));
float beardCover = faceArea.r * clamp(faceBeard + faceMustache * step(1.0 - vUv.y, ${(PHOTO_ATLAS.mouthRow - 0.006).toFixed(3)}), 0.0, 1.0);
texelColor.rgb = mix(texelColor.rgb, hairTone, beardCover * (0.5 + 0.45 * step(0.45, faceHash(floor(vUv * vec2(1100.0, 550.0)) + faceSeed))));
// The eyelids: down over each eye from its top, as far as faceLid, in the skin's own neutral.
for (int side = -1; side <= 1; side += 2) {
  vec2 eye = vec2(0.5 + float(side) * ${PHOTO_ATLAS.eyeU.toFixed(4)}, ${(1 - PHOTO_ATLAS.eyeRow).toFixed(4)});
  vec2 d = (vUv - eye) / vec2(${(eyeHalfU * 1.25).toFixed(4)}, ${(eyeHalfV * 1.6).toFixed(4)});
  float shut = step(dot(d, d), 1.0) * step(1.0 - 2.0 * faceLid, d.y);
  texelColor.rgb = mix(texelColor.rgb, vec3(${lidTone}), shut * step(0.02, faceLid));
}
diffuseColor *= texelColor;`)
      .replace('#include <normal_fragment_maps>', normals)
      .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>
#if defined( RE_IndirectDiffuse )
	irradiance *= faceFill;
#endif`);
  };
  material.customProgramCacheKey = () => 'photoface3';
  material.userData.photoFace = cast.id;
  material.userData.lid = uniforms.faceLid;
  material.userData.fill = uniforms.faceFill;
  material.userData.scalp = uniforms;
  material.userData.faceTextures = [uniforms.faceMap2.value, uniforms.faceDetail.value, uniforms.faceWrinkleMap.value, pores];
  return material;
}

/**
 * Paint a geometry's vertices from a face's thumbnails (the two blended) at their texture coordinates, times the skin and times
 * what the vertex colours already hold (the body's marks and the face's shadow): a crowd's heads.
 */
export function paintFromFace(geometry, cast) {
  const uv = geometry.attributes.uv;
  const [width, height] = photoManifest.thumb;
  const skin = new THREE.Color(cast.skin);
  const scale = 1 / (255 * photoManifest.neutral);
  const before = geometry.attributes.color;
  const sample = (u, v) => {
    const x = Math.min(width - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor((1 - v) * height)));
    return (y * width + x) * 3;
  };
  const colours = new Float32Array(uv.count * 3);
  for (let index = 0; index < uv.count; index += 1) {
    const a = sample(uv.getX(index), uv.getY(index));
    for (let channel = 0; channel < 3; channel += 1) {
      const value = cast.primary.thumb[a + channel] * (1 - cast.blend) + cast.secondary.thumb[a + channel] * cast.blend;
      const mark = before ? before.array[index * 3 + channel] : 1;
      colours[index * 3 + channel] = Math.min(1, value * scale * [skin.r, skin.g, skin.b][channel] * mark);
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
    for (const texture of [material.map, material.normalMap, material.roughnessMap, ...(material.userData.faceTextures ?? [])]) if (texture) used.add(texture);
  });
  for (const [file, entry] of photoTextures) {
    if (used.has(entry.texture)) continue;
    entry.texture.dispose();
    photoTextures.delete(file);
  }
}

/** Set the faces' fill (PHOTO_FACES.fill) for the next heads and for those under `root` now. */
export function setPhotoFill(value, root = null) {
  PHOTO_FACES.fill = value;
  root?.traverse((object) => {
    if (object.material?.userData?.fill) object.material.userData.fill.value = value;
  });
  return value;
}
