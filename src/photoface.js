// Photo faces (a prototype): a head drawn from a photographed cylindrical
// head unwrap (albedo), with a normal map for its relief and a roughness map,
// in place of the drawn anime eyes, brows and mouth. Off unless the page is
// opened with #faces=photo (or the harness turns it on).
//
// Each unwrap is warped offline into one canonical atlas (PHOTO_ATLAS: the
// face at the middle, the eyes, mouth, chin and ears at fixed places, the
// back of the head at both edges), so one set of texture coordinates on the
// head (face.js photoUV) fits every face. The atlases are not part of the
// repository: they are evaluation scans, loaded at run time from
// PHOTO_FACES.base (a local folder served by the dev server). Missing, the
// heads stay drawn.

/* global THREE */

/**
 * Where the landmarks sit in the atlas: u from the face's centre (eyes, ears); rows from the crown (eye line, lip line, chin, and
 * about where a hairline is: `hairlineRow`, put on the head at `hairlineAt` of the way from the middle up to the crown, by angle).
 */
export const PHOTO_ATLAS = { eyeU: 0.0668, earU: 0.258, eyeRow: 0.44, mouthRow: 0.70, chinRow: 0.88, mouthShare: 0.56, chinT: 0.95, hairlineRow: 0.22, hairlineAt: 0.36 };

/**
 * The faces: `sex`, `group` (who they are cast as: 'eastAsian' or 'european'), `build` ('heavy' or 'medium'),
 * `beard` (the scan has one), `longHair`, `skin` (its cheeks' colour, given to the body so the neck meets the face), `hair` (its hair's colour, for drawn hair over it).
 */
export const PHOTO_FACES = {
  base: 'faces-local/',
  set: {
    redhead: { sex: 'male', group: 'european', build: 'heavy', beard: false, skin: '#dea58b', hair: '#5a2a14' },
    bearded: { sex: 'male', group: 'european', build: 'medium', beard: true, skin: '#cf9072', hair: '#2a1a10' },
    goatee: { sex: 'male', group: 'mediterranean', build: 'heavy', beard: true, skin: '#b48a81', hair: '#141210' },
    asianMan: { sex: 'male', group: 'eastAsian', build: 'medium', beard: false, longHair: true, skin: '#cba095', hair: '#1a1614' },
    blonde: { sex: 'female', group: 'european', build: 'heavy', skin: '#e2b299', hair: '#c8ae78' },
    asianLong: { sex: 'female', group: 'eastAsian', build: 'medium', longHair: true, skin: '#b89082', hair: '#1c1410' },
    asianWoman: { sex: 'female', group: 'eastAsian', build: 'heavy', skin: '#e1b19b', hair: '#120c0c' },
  },
  // The material: a little sheen on the skin from the sun, the relief's strength.
  normalScale: 1,
  envIntensity: 0,
};

// Kits worn in the game by Chinese, Japanese, Korean and Mongol fighters.
const EAST_ASIAN_KITS = new Set([
  'samurai', 'ashigaru', 'samuraiTosei', 'oyoroi', 'ronin', 'yakuza', 'sohei', 'sumo',
  'mingGarrison', 'mingBrigandine', 'mingElite', 'hanSoldier', 'kungfu', 'wuxia', 'guanYu', 'ironPagoda', 'monk',
  'dobok', 'steppeMedium', 'steppeLight', 'kheshig',
]);
const NO_FACE_KITS = new Set(['silverback', 'humanoid', 'combatBot']);
const LONG_HAIR = new Set(['long', 'midLong', 'hime', 'ponytail', 'ringlets', 'ringletPigtails']);

const loaded = new Map();
let wanted = null;
let loading = null;

/** Whether heads are drawn from photos: #faces=photo in the URL (default off), or set by the harness. */
export function photoFacesOn() {
  if (wanted === null) {
    const hash = typeof location === 'undefined' ? '' : location.hash.replace(/^#/, '');
    wanted = new URLSearchParams(hash).get('faces') === 'photo';
  }
  return wanted;
}

/** Turn photo faces on or off (the next heads built follow it); loads the atlases on the way on. */
export function setPhotoFaces(on) {
  wanted = Boolean(on);
  return wanted ? loadPhotoFaces() : Promise.resolve(0);
}

function loadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function textureOf(image, { mipmaps = true } = {}) {
  const texture = new THREE.Texture(image);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.generateMipmaps = mipmaps;
  texture.needsUpdate = true;
  return texture;
}

/** A coarse copy of the albedo to read colours from (the crowd's heads are painted per vertex from it). */
function sampler(image, width = 128, height = 64) {
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  const paint = canvas.getContext('2d');
  paint.drawImage(image, 0, 0, width, height);
  const { data } = paint.getImageData(0, 0, width, height);
  return (u, v) => {
    const x = Math.min(width - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor((1 - v) * height)));
    const at = (y * width + x) * 4;
    return [data[at] / 255, data[at + 1] / 255, data[at + 2] / 255];
  };
}

/** Load every face's maps (once); resolves to how many loaded. */
export function loadPhotoFaces() {
  loading ??= Promise.all(Object.keys(PHOTO_FACES.set).map(async (id) => {
    const [albedo, normal, rough] = await Promise.all(['albedo.jpg', 'normal.png', 'rough.png'].map((suffix) => loadImage(`${PHOTO_FACES.base}${id}-${suffix}`)));
    if (!albedo || !normal || !rough) return;
    loaded.set(id, { id, ...PHOTO_FACES.set[id], map: textureOf(albedo), normalMap: textureOf(normal), roughnessMap: textureOf(rough), sample: sampler(albedo), bytes: gpuBytes([albedo, normal, rough]) });
  })).then(() => loaded.size);
  return loading;
}

/** GPU memory of a face's maps: RGBA8 with a full mip chain (a third more). */
function gpuBytes(images) {
  return images.reduce((sum, image) => sum + Math.round(image.width * image.height * 4 * (4 / 3)), 0);
}

/** What the loaded faces cost: per face and all together (bytes). */
export function photoFaceStats() {
  const faces = [...loaded.values()].map(({ id, bytes }) => ({ id, bytes }));
  return { faces, total: faces.reduce((sum, face) => sum + face.bytes, 0) };
}

const hashOf = (text) => [...String(text ?? '')].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);

/**
 * The face a fighter is drawn with, or null (photo faces off, not loaded, a machine or an ape, or no scan like him:
 * there is none of a dark-skinned man or woman in the set, so those keep the drawn face).
 */
export function photoFaceFor(inputs) {
  if (!photoFacesOn() || loaded.size === 0) return null;
  const kit = inputs.outfit?.kind;
  if (NO_FACE_KITS.has(kit) || inputs.build?.rigid) return null;
  const look = inputs.look ?? {};
  const tone = look.skinTone ?? 'medium';
  if (tone === 'deep') return null;
  const female = inputs.sex === 'female';
  const eastAsian = EAST_ASIAN_KITS.has(kit);
  const heavy = inputs.frame === 'large' || (inputs.calories ?? 0) >= 4400;
  const bearded = ['beard', 'longBeard', 'mustache', 'handlebar'].includes(look.facialHair);
  const pick = (...ids) => ids.map((id) => loaded.get(id)).find(Boolean) ?? null;
  if (female) {
    if (eastAsian) return LONG_HAIR.has(look.hairStyle) ? pick('asianLong', 'asianWoman') : pick('asianWoman', 'asianLong');
    if (tone === 'light' || tone === 'porcelain') return pick('blonde');
    return LONG_HAIR.has(look.hairStyle) ? pick('asianLong', 'blonde') : pick('asianWoman', 'blonde');
  }
  if (eastAsian) return pick('asianMan');
  if (tone === 'tan' || tone === 'lightTan') return pick('goatee', 'bearded');
  if (bearded) return pick('bearded', 'redhead');
  if (heavy) return pick('redhead', 'bearded');
  return pick(hashOf(inputs.name) % 2 ? 'redhead' : 'bearded');
}

/** The head's material for a face: lit (standard), its maps; in a crowd (`painted`) its colours per vertex instead. */
export function photoSkinMaterial(face, { painted = false } = {}) {
  if (painted) {
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    material.userData.photoFace = face.id;
    return material;
  }
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: face.map,
    normalMap: face.normalMap,
    roughnessMap: face.roughnessMap,
    roughness: 1,
    metalness: 0,
  });
  material.normalScale.set(PHOTO_FACES.normalScale, PHOTO_FACES.normalScale);
  material.userData.photoFace = face.id;
  return material;
}

/** Paint a geometry's vertices from a face's albedo at their texture coordinates (for the crowd's baked heads). */
export function paintFromFace(geometry, face) {
  const uv = geometry.attributes.uv;
  const colours = new Float32Array(uv.count * 3);
  for (let index = 0; index < uv.count; index += 1) colours.set(face.sample(uv.getX(index), uv.getY(index)), index * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
}
