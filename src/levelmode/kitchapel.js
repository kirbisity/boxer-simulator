// The castle kit's sanctuary and crypt: what the vaulted chapel (levelmode/stages/dunnottar-chapel.js) and the vault's crypt
// (dunnottar-vault.js) are dressed in that the general kit has no word for. Three parts, each called from kit.js:
//  - `kcDecor(batch, dyn, decor)`: the decor kinds the chapel adds (a gabled roof, iron chandeliers, clusters of votive candles, the sea-gate's
//    bars), appended to the section's batch (merged, one mesh per material per chunk of ground), their flames and lights noted for the kit's
//    own flame cards and its pool of four real lights (so the whole nave has at most four dynamic lights: the nearest of the chandeliers and braziers).
//  - `kcProp(prop, ctx)`: the crypt's and the chapel's furniture (pillars, a rack, sarcophagi, a chest, skull heaps, a lever).
//  - `kcExtras(section, mats, textures)`: what glows and is not lit by a light: the stained glass (one merged mesh, flashing cold with the lightning),
//    the cold shafts from it, the floor's warm pools under the chandeliers and candles, the keyhole of the cell's doors with its spill of light across
//    the floor and (once the boss is down) the marks that lead to them, the sea-gate's grey glow. All additive and cheap: a few meshes in all.
//  - `kcDoubleDoor(mats, look)`: the cell's two heavy arched leaves, hinged at the jambs, opened by `apply(open)`.

import { KitBatch, kgBox, kgCylinder, kgExtrude, kgLump, kgOpening, kgPlace, kgShape, kgTube } from './kitgeo.js';
import { ktRandom } from './kittex.js';

/** Where a point (lx, lz) of a thing at [x, y, z] turned `yaw` is in the world. */
function kcAt(at, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return (lx, lz) => [at[0] + lx * c + lz * s, at[2] - lx * s + lz * c];
}

const kcRing = (x, y, z, r, count = 24) => Array.from({ length: count + 1 }, (_, k) => [x + Math.cos((k / count) * Math.PI * 2) * r, y, z + Math.sin((k / count) * Math.PI * 2) * r]);

// ---- materials ----------------------------------------------------------------------------------------------------

/**
 * Add the chapel's own materials to the kit's set (kit.js, once, after `ktMaterials`): `nave`, the underside of the great vault, is the ashlar with a warm glow of
 * its own (an emissive map of the same stone): high over the candles the stone is dim and amber, not black, where no light of the pool reaches (the probe the realistic
 * look lights with has next to no light for a surface that faces down, and four real lights cannot fill a nave).
 */
export function kcMaterials(mats) {
  const nave = mats.ashlar.clone();
  nave.emissive = new THREE.Color(0xa0622c);
  nave.emissiveMap = nave.map;
  nave.emissiveIntensity = 0.42;
  nave.onBeforeCompile = mats.ashlar.onBeforeCompile;
  const key = mats.ashlar.customProgramCacheKey;
  nave.customProgramCacheKey = () => `${key()}-nave`;
  mats.nave = nave;
}

// ---- decor into the batch -----------------------------------------------------------------------------------

/** An iron chandelier: a hoop and a smaller hoop on spokes, hung by three chains from the vault, a candle round the rim, a flame to each and a warm light. */
function kcChandelier(batch, dyn, decor) {
  const [x, y, z] = decor.at;
  const r = decor.radius ?? 1.3;
  const top = decor.chain ?? y + 3;
  kgTube(batch, 'iron', kcRing(x, y, z, r), 0.055, { segments: 28, sides: 5 });
  kgTube(batch, 'iron', kcRing(x, y + 0.3, z, r * 0.5, 16), 0.035, { segments: 18, sides: 4 });
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    kgTube(batch, 'iron', [[x, y + 0.3, z], [x + Math.cos(a) * r * 0.5, y + 0.14, z + Math.sin(a) * r * 0.5], [x + Math.cos(a) * r, y, z + Math.sin(a) * r]], 0.03, { segments: 4, sides: 4 });
  }
  kgCylinder(batch, 'iron', x, y + 0.18, z, 0.1, 0.17, 0.5, { sides: 6 });
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI * 2 + 0.2;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    kgTube(batch, 'iron', [[px, y + 0.05, pz], [(px + x) / 2, (y + top) / 2, (pz + z) / 2], [x, top, z]], 0.022, { segments: 10, sides: 4 });
  }
  const candles = decor.candles ?? 8;
  for (let k = 0; k < candles; k += 1) {
    const a = (k / candles) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    kgCylinder(batch, 'iron', px, y - 0.02, pz, 0.075, 0.05, 0.08, { sides: 6 });
    kgCylinder(batch, 'bone', px, y + 0.05, pz, 0.038, 0.042, 0.24, { sides: 6, tint: [1.35, 1.2, 0.9] });
    dyn.flames.push({ at: [px, y + 0.32, pz], size: 0.3, candle: true });
  }
  dyn.lights.push({ at: [x, y - 0.5, z], color: 0xffb468, power: decor.power ?? 2.4, range: decor.range ?? 24 });
}

/** A cluster of votive candles: a low iron dish and wax stubs of every height, each with a small flame. */
function kcVotive(batch, dyn, decor) {
  const [x, y, z] = decor.at;
  const random = ktRandom(Math.floor(Math.abs(x * 97 + z * 61)) + 11);
  kgCylinder(batch, 'iron', x, y, z, 0.46, 0.5, 0.05, { sides: 10, tint: 0.8 });
  for (let k = 0; k < (decor.count ?? 6); k += 1) {
    const angle = random() * Math.PI * 2;
    const reach = Math.sqrt(random()) * 0.4;
    const px = x + Math.cos(angle) * reach;
    const pz = z + Math.sin(angle) * reach;
    const height = 0.07 + random() * 0.24;
    kgCylinder(batch, 'bone', px, y + 0.05, pz, 0.026 + random() * 0.01, 0.034, height, { sides: 5, tint: [1.3, 1.15, 0.85] });
    dyn.flames.push({ at: [px, y + 0.05 + height + 0.05, pz], size: 0.085 + random() * 0.03, candle: true });
  }
}

/** The nave's roof, seen from outside: a gable of slate over the stone, its eaves a little out over the walls. */
function kcRoof(batch, roof) {
  const length = roof.z1 - roof.z0 + 0.8;
  const e = roof.eave;
  // A shell, not a lid: the gable's outline with the vault's own curve cut out of its underside (so the nave's ceiling is the vault, and the chandeliers hang in it).
  const inner = roof.wall + 0.4;
  const span = length - inner * 2;
  const arc = [];
  for (let k = 0; k <= 24; k += 1) {
    const t = -1 + (2 * k) / 24;
    arc.push([inner + ((t + 1) / 2) * span, Math.max(e - 0.7, roof.spring + roof.crown * Math.sqrt(Math.max(0, 1 - t * t)) + 0.12)]);
  }
  const shape = kgShape([[0, e - 0.7], [inner, e - 0.7], ...arc, [length - inner, e - 0.7], [length, e - 0.7], [length, e + 0.25], [length / 2, roof.ridge], [0, e + 0.25]]);
  kgExtrude(batch, 'rubble', 'ruin', shape, roof.x1 - roof.x0 + 0.8, kgPlace((roof.x0 + roof.x1) / 2, 0, roof.z0 - 0.4, -Math.PI / 2), { tint: 0.75 });
  // The ridge: a line of stone along the top.
  kgBox(batch, 'ashlar', (roof.x0 + roof.x1) / 2, roof.ridge + 0.1, (roof.z0 + roof.z1) / 2, roof.x1 - roof.x0 + 0.9, 0.3, 0.5, 0, { tint: 0.9 });
}

/** The sea-gate's bars across its arch (the physics shuts it; this draws the iron). */
function kcSeaGate(batch, gate) {
  const half = (gate.b[0] - gate.a[0]) / 2;
  const mid = (gate.a[0] + gate.b[0]) / 2;
  const spring = gate.y1 - half;
  const count = Math.round((half * 2) / 0.26);
  for (let k = 0; k <= count; k += 1) {
    const dx = -half + (half * 2 * k) / count;
    const high = spring + Math.sqrt(Math.max(0, half * half - dx * dx));
    kgBox(batch, 'iron', mid + dx, (gate.y0 + high) / 2, gate.a[1], 0.05, high - gate.y0, 0.05, 0);
  }
  for (const h of [0.2, 0.5, 0.78]) kgBox(batch, 'iron', mid, gate.y0 + (spring - gate.y0) * h, gate.a[1], half * 2, 0.06, 0.06, 0);
}

/** The chapel's roof for the section's silhouette (seen from afar or above): its walls are the solids', the roof is decor. */
export function kcFar(batch, section) {
  for (const decor of section.decor ?? []) if (decor.kind === 'chapelroof') kcRoof(batch, decor);
}

/** Decor the chapel and the crypt add. Returns true if it was one of them (glass and the doors' light are drawn by `kcExtras`). */
export function kcDecor(batch, dyn, decor) {
  switch (decor.kind) {
    case 'chandelier': kcChandelier(batch, dyn, decor); return true;
    case 'votive': kcVotive(batch, dyn, decor); return true;
    case 'chapelroof': kcRoof(batch, decor); return true;
    case 'seagate': kcSeaGate(batch, decor); return true;
    default: return decor.kind === 'glass' || decor.kind === 'doorlight';
  }
}

// ---- props -------------------------------------------------------------------------------------------------------

/** A prop the kit's own list does not have. Returns true if it was one of these. */
export function kcProp(prop, ctx) {
  const { batch } = ctx;
  const at = prop.at;
  const yaw = prop.yaw ?? 0;
  const here = kcAt(at, yaw);
  const y = at[1];
  const random = ktRandom(Math.floor(Math.abs(at[0] * 131 + at[2] * 71 + y * 17)) + 5);
  const box = (material, lx, ly, lz, w, h, d, turn = 0, options = {}) => {
    const [x, z] = here(lx, lz);
    kgBox(batch, material, x, y + ly, z, w, h, d, yaw + turn, { faces: ['top', 'ends', 'sides'], ...options });
  };
  switch (prop.what) {
    case 'pillar': {
      // A round stone pillar from the floor to the vault: a plinth, a shaft that tapers a little, a flared capital and a square abacus under the springing ribs.
      const h = prop.height ?? 10;
      const [x, z] = here(0, 0);
      kgBox(batch, 'ashlar', x, y + 0.25, z, 1.5, 0.5, 1.5, 0, { aoFrom: y });
      kgBox(batch, 'ashlar', x, y + 0.6, z, 1.25, 0.2, 1.25, 0.4, { aoFrom: y });
      kgCylinder(batch, 'ashlar', x, y + 0.7, z, 0.5, 0.58, h - 2.2, { sides: 12, aoFrom: y, aoSpan: 4 });
      for (const lift of [0.22, 0.55]) kgCylinder(batch, 'ashlar', x, y + h - 1.5 - lift, z, 0.62 - lift * 0.1, 0.62 - lift * 0.1, 0.1, { sides: 12 });
      kgCylinder(batch, 'ashlar', x, y + h - 1.5, z, 0.95, 0.52, 1.0, { sides: 12, tint: 1.02 });
      kgBox(batch, 'ashlar', x, y + h - 0.35, z, 1.5, 0.3, 1.5, 0, { tint: 1.05 });
      // Four shafts of rib running up from the abacus to the vault.
      for (const [sx, sz] of [[0.4, 0.4], [-0.4, 0.4], [0.4, -0.4], [-0.4, -0.4]]) kgCylinder(batch, 'ashlar', x + sx, y + h - 0.2, z + sz, 0.14, 0.2, 1.3, { sides: 6, tint: 0.95 });
      return true;
    }
    case 'rack': {
      // The torturer's rack: two beams on legs, a roller at each end with its ratchet wheel and pawl, cross-bars, rope and straps.
      box('wood', 0, 0.62, 0.38, 2.4, 0.13, 0.14);
      box('wood', 0, 0.62, -0.38, 2.4, 0.13, 0.14);
      for (let k = 0; k < 6; k += 1) box('wood', -1.0 + k * 0.4, 0.7, 0, 0.1, 0.06, 0.92);
      for (const [lx, lz] of [[-1.1, -0.38], [1.1, -0.38], [-1.1, 0.38], [1.1, 0.38]]) box('wood', lx, 0.3, lz, 0.14, 0.62, 0.14, 0, { aoFrom: y });
      for (const lx of [-1.3, 1.3]) {
        const [x, z] = here(lx, 0);
        kgCylinder(batch, 'wood', x, y + 0.7, z, 0.1, 0.1, 1.0, { sides: 8, tiltX: Math.PI / 2 + yaw * 0 });
        kgCylinder(batch, 'iron', x, y + 0.7, z + Math.cos(yaw) * 0.55, 0.2, 0.2, 0.05, { sides: 10, tiltX: Math.PI / 2 });
      }
      box('iron', 1.3, 0.92, 0.55, 0.05, 0.22, 0.05, 0.2);
      box('cloth', 0, 0.78, 0, 1.5, 0.03, 0.34, 0, { tint: [0.6, 0.5, 0.4] });
      box('iron', -0.9, 0.78, 0.38, 0.12, 0.04, 0.2);
      box('iron', -0.9, 0.78, -0.38, 0.12, 0.04, 0.2);
      return true;
    }
    case 'sarcophagus': {
      // A stone box and its lid; the lid of a broken one is shoved off and a corner of it lies on the floor.
      box('ashlar', 0, 0.36, 0, 2.2, 0.72, 0.86, 0, { aoFrom: y });
      if (prop.broken) {
        box('ashlar', 0.4, 0.86, 0.3, 1.9, 0.18, 0.8, 0.35, { tint: 0.95 });
        box('ashlar', -1.0, 0.1, 0.95, 0.5, 0.2, 0.4, 0.6, { tint: 0.85 });
        box('bone', -0.2, 0.74, -0.05, 0.9, 0.08, 0.22, 0.3);
      } else {
        box('ashlar', 0, 0.82, 0, 2.3, 0.14, 0.92, 0, { tint: 1.05 });
        box('ashlar', 0, 0.92, 0, 1.4, 0.07, 0.3, 0, { tint: 1.1 });
      }
      return true;
    }
    case 'chest': {
      box('wood', 0, 0.22, 0, 0.88, 0.44, 0.58, 0, { aoFrom: y });
      box('wood', 0, 0.5, 0, 0.84, 0.12, 0.54, 0, { tint: 1.05 });
      for (const lx of [-0.3, 0.3]) box('iron', lx, 0.3, 0, 0.07, 0.62, 0.62);
      box('iron', 0, 0.42, 0.3, 0.12, 0.14, 0.03, 0, { tint: [1.6, 1.3, 0.8] });
      return true;
    }
    case 'skullpile': {
      const size = prop.size ?? 1;
      for (let k = 0; k < 20; k += 1) {
        const ring = k < 12 ? 0.55 : 0.22;
        const angle = random() * Math.PI * 2;
        const [px, pz] = here(Math.cos(angle) * ring * size * 1.1, Math.sin(angle) * ring * size);
        const r = (0.09 + random() * 0.05) * (0.85 + size * 0.2);
        kgLump(batch, 'bone', px, y + r * (k < 12 ? 0.9 : 3.0 + random()), pz, r, r * 1.05, r * 1.1, { seed: k + 3, detail: 0, tint: [0.9 + random() * 0.2, 0.9 + random() * 0.15, 0.85] });
      }
      for (let k = 0; k < 5; k += 1) {
        const [px, pz] = here((random() - 0.5) * 1.2 * size, (random() - 0.5) * 1.0 * size);
        kgBox(batch, 'bone', px, y + 0.06, pz, 0.34 + random() * 0.3, 0.05, 0.06, random() * 6);
      }
      return true;
    }
    case 'lever': {
      // A plate of iron let into the wall, a handle that pivots: it reads as a loose stone to a man who does not look.
      const dir = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[prop.face ?? 'W'];
      const sx = at[0] + dir[0] * 0.05;
      const sz = at[2] + dir[1] * 0.05;
      kgBox(batch, 'iron', sx, y, sz, Math.abs(dir[0]) * 0.06 + 0.02, 0.34, Math.abs(dir[1]) * 0.06 + 0.3, 0, { tint: [1.2, 0.9, 0.7] });
      kgBox(batch, 'iron', sx + dir[0] * 0.12, y + 0.04, sz + dir[1] * 0.1, Math.abs(dir[0]) * 0.05 + 0.05, 0.05, Math.abs(dir[1]) * 0.05 + 0.4, 0.2, { tint: [1.3, 1.0, 0.8] });
      return true;
    }
    default:
      return false;
  }
}

// ---- the cell's doors ------------------------------------------------------------------------------------------

/** One leaf of the doors: the half of a pointed arch (the outline of kgOpening) as a thick board with iron straps, a ring and studs; hinged at x 0, its width running toward `sgn` (+1 or -1). */
function kcLeaf(mats, look, sgn, seed) {
  const group = new THREE.Group();
  const batch = new KitBatch(mats, seed);
  const half = look.width / 2;
  const y0 = 0.05;
  const outline = kgOpening(0, look.width, y0, look.height, 'pointed');
  // The outline runs bottom-left, bottom-right, up the right side, over the apex, down the left arch to the left spring. This leaf is the left half (its hinge at the left jamb),
  // counter-clockwise: along the foot to the middle, up the middle line, back down the arch; then mirrored for the right one.
  const arch = outline.filter(([x], i) => i > 0 && x < -1e-6);
  const left = [[-half, y0], [0, y0], [0, look.height], ...arch].map(([x, y]) => [x + half, y]);
  const poly = sgn > 0 ? left : [...left].reverse().map(([x, y]) => [-x, y]);
  kgExtrude(batch, 'wood', 'black', kgShape(poly), 0.2, kgPlace(0, 0, 0, 0), { aoFrom: null, tint: 0.85, jitter: 0.04 });
  // Iron: three straps across, studs along them, a lock plate with a ring on the meeting side.
  for (const h of [0.22, 0.5, 0.78]) {
    const yy = look.height * h * 0.9;
    kgBox(batch, 'iron', (sgn * half) / 2, yy, 0.115, half - 0.1, 0.12, 0.04, 0, { jitter: 0 });
    kgBox(batch, 'iron', (sgn * half) / 2, yy, -0.115, half - 0.1, 0.12, 0.04, 0, { jitter: 0 });
    for (let s = 0.25; s < half - 0.2; s += 0.34) kgCylinder(batch, 'iron', sgn * s, yy - 0.02, 0.135, 0.035, 0.04, 0.04, { sides: 6, tiltX: Math.PI / 2, tint: [1.4, 1.1, 0.8] });
  }
  kgBox(batch, 'iron', sgn * (half - 0.32), look.height * 0.34, 0.12, 0.34, 0.5, 0.03, 0, { jitter: 0 });
  kgTube(batch, 'iron', Array.from({ length: 17 }, (_, k) => [sgn * (half - 0.32) + Math.cos((k / 16) * Math.PI * 2) * 0.12, look.height * 0.36 + Math.sin((k / 16) * Math.PI * 2) * 0.12, 0.17]), 0.022, { segments: 16, sides: 4, tint: [1.2, 0.9, 0.7] });
  batch.build(group, { name: 'leaf' });
  return group;
}

/**
 * The cell's doors: two leaves of a pointed arch hinged at the jambs, `apply(open)` swinging them (0 shut, 1 open: toward +z of the door's own frame, which
 * kit.js sets to look into the cell). `look`: { width, height }. Returns { group, apply }.
 */
export function kcDoubleDoor(mats, look) {
  const group = new THREE.Group();
  const left = new THREE.Group();
  const right = new THREE.Group();
  // (Each leaf's own x runs 0 at its hinge to the middle: the left one's toward +x from the -x jamb, the right one's toward -x from the +x jamb.)
  left.add(kcLeaf(mats, look, 1, 91));
  right.add(kcLeaf(mats, look, -1, 93));
  left.position.set(-look.width / 2, 0, 0);
  right.position.set(look.width / 2, 0, 0);
  group.add(left, right);
  return {
    group,
    apply: (open) => {
      left.rotation.y = -1.75 * open;
      right.rotation.y = 1.75 * open;
    },
  };
}

// ---- what glows ------------------------------------------------------------------------------------------------------

/** The colours of the glass, by name (multiplied into the grey of the pane's texture). */
const KC_HUE = { blue: [0.3, 0.5, 1.0], amber: [1.0, 0.68, 0.22], red: [0.95, 0.2, 0.2], green: [0.3, 0.8, 0.4], rose: [1.0, 0.5, 0.62] };

let KC_GLASS = null;
/** Stained glass as a map: lead lines round panes of every grey (the hue is the mesh's, by vertex), a mullion up the middle, a ring of tracery at the top. */
function kcGlassTexture() {
  if (KC_GLASS) return KC_GLASS;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const random = ktRandom(41);
  g.fillStyle = '#1a1812';
  g.fillRect(0, 0, 128, 256);
  const cols = 6;
  const rows = 22;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const level = 120 + Math.floor(random() * 135);
      const x = (c * 128) / cols + 1.5;
      const y = 256 - ((r + 1) * 256) / rows + 1.5;
      const w = 128 / cols - 3;
      const h = 256 / rows - 3;
      const gradient = g.createRadialGradient(x + w / 2, y + h / 2, 1, x + w / 2, y + h / 2, w);
      gradient.addColorStop(0, `rgb(${Math.min(255, level + 50)},${Math.min(255, level + 50)},${Math.min(255, level + 50)})`);
      gradient.addColorStop(1, `rgb(${level - 40},${level - 40},${level - 40})`);
      g.fillStyle = gradient;
      g.fillRect(x, y, w, h);
    }
  }
  g.strokeStyle = '#0c0b08';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(64, 0);
  g.lineTo(64, 256);
  g.stroke();
  KC_GLASS = new THREE.CanvasTexture(canvas);
  return KC_GLASS;
}

let KC_SPILL = null;
/** A long soft wedge of light: bright at its foot (the bottom row), fading and widening away (the map of the floor under the doors' keyhole). */
function kcSpillTexture() {
  if (KC_SPILL) return KC_SPILL;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const across = g.createLinearGradient(0, 0, 64, 0);
  across.addColorStop(0, 'rgba(255,200,120,0)');
  across.addColorStop(0.5, 'rgba(255,214,150,1)');
  across.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = across;
  g.fillRect(0, 0, 64, 128);
  const along = g.createLinearGradient(0, 0, 0, 128);
  along.addColorStop(0, 'rgba(0,0,0,1)');
  along.addColorStop(0.55, 'rgba(0,0,0,0.5)');
  along.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = along;
  g.fillRect(0, 0, 64, 128);
  KC_SPILL = new THREE.CanvasTexture(canvas);
  return KC_SPILL;
}

/** A merged mesh of quads, from `quads` = [{ corners: [[x, y, z] x4], color: [r, g, b] }], with `uv` the four corners' (0 0, 1 0, 1 1, 0 1). */
function kcQuads(quads, material, order = 2) {
  const position = [];
  const uv = [];
  const color = [];
  for (const quad of quads) {
    for (const k of [0, 1, 2, 0, 2, 3]) {
      position.push(...quad.corners[k]);
      color.push(...(quad.color ?? [1, 1, 1]));
    }
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = order;
  return mesh;
}

/** A flat card on the floor at (x, y, z), `size` across, turned `yaw` (for a pool of light). */
const kcFloorCard = (x, y, z, size, color, yaw = 0) => {
  const h = size / 2;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const at = (u, v) => [x + u * c + v * s, y, z - u * s + v * c];
  return { corners: [at(-h, -h), at(h, -h), at(h, h), at(-h, h)], color };
};

const KC_ADD = { transparent: true, depthWrite: false, blending: 2, side: 2, fog: false };

/**
 * What glows in a section and is not a light: see the file's head. Returns null if the section has none of it, else { group, update(time, state) } with
 * `state` = { flash: the lightning's brightness 0..1, door: the state of the cell's doors ('closed' | 'open'), phase: the ending's phase or null }.
 */
export function kcExtras(section, mats, textures) {
  const decor = section.decor ?? [];
  const glass = decor.filter((d) => d.kind === 'glass');
  const chandeliers = decor.filter((d) => d.kind === 'chandelier');
  const votives = decor.filter((d) => d.kind === 'votive');
  const doorlight = decor.find((d) => d.kind === 'doorlight');
  const seagate = decor.find((d) => d.kind === 'seagate');
  if (!glass.length && !chandeliers.length && !doorlight && !seagate) return null;
  const group = new THREE.Group();
  group.name = `glow:${section.id}`;
  const parts = {};
  const floor = section.terrain.filter((s) => s.kind === 'slab' && s.style === 'flags').reduce((top, s) => Math.max(top, s.top), -Infinity);
  const centre = section.bounds?.[0]?.at ?? [0, 0];
  // The glass, one mesh: each pane in its opening's outline.
  if (glass.length) {
    const position = [];
    const uvs = [];
    const colors = [];
    const random = ktRandom(17);
    for (const g of glass) {
      const outline = kgOpening(0, g.width, 0, g.height, g.shape);
      const geometry = new THREE.ShapeGeometry(new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y))), 6);
      const matrix = kgPlace(g.at[0], g.at[1], g.at[2], g.yaw);
      const p = geometry.attributes.position;
      const hue = KC_HUE[g.hue] ?? KC_HUE.amber;
      const v = new THREE.Vector3();
      const vary = 0.85 + random() * 0.3;
      const index = geometry.index;
      for (let k = 0; k < index.count; k += 1) {
        const i = index.getX(k);
        v.set(p.getX(i), p.getY(i), p.getZ(i));
        uvs.push(v.x / g.width + 0.5, v.y / g.height);
        v.applyMatrix4(matrix);
        position.push(v.x, v.y, v.z);
        colors.push(hue[0] * vary, hue[1] * vary, hue[2] * vary);
      }
      geometry.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    parts.glass = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: kcGlassTexture(), vertexColors: true, side: THREE.DoubleSide, fog: false }));
    parts.glass.renderOrder = 1;
    group.add(parts.glass);
    // The cold shafts from the side windows down to the floor: one card each, slanting in from the glass.
    const quads = [];
    for (const g of glass) {
      if (g.shape === 'pointed' || g.width < 1.6) continue;
      const along = [Math.cos(g.yaw), -Math.sin(g.yaw)];
      const toward = [centre[0] - g.at[0], centre[1] - g.at[2]];
      // (The wall's own normal, toward the inside: the way the window's wall faces the nave's middle.)
      const normal = [-Math.sin(g.yaw), -Math.cos(g.yaw)];
      const inward = normal[0] * toward[0] + normal[1] * toward[1] >= 0 ? normal : [-normal[0], -normal[1]];
      const top = g.height * 0.9 + g.at[1];
      const reach = 4.6;
      const wide = g.width * 0.5;
      const a = [g.at[0] - along[0] * wide, top, g.at[2] - along[1] * wide];
      const b = [g.at[0] + along[0] * wide, top, g.at[2] + along[1] * wide];
      const c = [b[0] + inward[0] * reach + along[0] * wide * 0.7, floor + 0.05, b[2] + inward[1] * reach + along[1] * wide * 0.7];
      const d = [a[0] + inward[0] * reach - along[0] * wide * 0.7, floor + 0.05, a[2] + inward[1] * reach - along[1] * wide * 0.7];
      quads.push({ corners: [d, c, b, a], color: [0.7, 0.8, 1] });
    }
    if (quads.length) {
      parts.shafts = kcQuads(quads, new THREE.MeshBasicMaterial({ map: textures.shaft, vertexColors: true, ...KC_ADD, opacity: 0.1 }), 3);
      group.add(parts.shafts);
    }
  }
  // The floor's warm pools: a wide one under each chandelier, a small one at each cluster of candles.
  const pools = [];
  for (const c of chandeliers) pools.push(kcFloorCard(c.at[0], floor + 0.04, c.at[2], 13, [1.0, 0.62, 0.28]));
  for (const v of votives) pools.push(kcFloorCard(v.at[0], floor + 0.045, v.at[2], 3.2, [0.8, 0.5, 0.22]));
  if (pools.length) {
    parts.pools = kcQuads(pools, new THREE.MeshBasicMaterial({ map: textures.glow, vertexColors: true, ...KC_ADD, opacity: 0.3, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), 2);
    group.add(parts.pools);
  }
  // A halo round each chandelier's flames (one soft sprite: the candles are too small to be seen from the door).
  parts.halos = [];
  for (const c of chandeliers) {
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.glow, color: 0xffa955, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, fog: false }));
    halo.scale.setScalar(6.5);
    halo.position.set(c.at[0], c.at[1] + 0.35, c.at[2]);
    halo.renderOrder = 5;
    group.add(halo);
    parts.halos.push(halo);
  }
  // The sea-gate: a cold, grey-blue light beyond the bars.
  if (seagate) {
    const x = (seagate.a[0] + seagate.b[0]) / 2;
    const w = seagate.b[0] - seagate.a[0];
    parts.sea = kcQuads([{ corners: [[x - w / 2, seagate.y0, seagate.a[1] - 0.35], [x + w / 2, seagate.y0, seagate.a[1] - 0.35], [x + w / 2, seagate.y1 + 0.4, seagate.a[1] - 0.35], [x - w / 2, seagate.y1 + 0.4, seagate.a[1] - 0.35]], color: [0.5, 0.62, 0.8] }], new THREE.MeshBasicMaterial({ map: textures.glow, vertexColors: true, ...KC_ADD, opacity: 0.55 }), 2);
    group.add(parts.sea);
  }
  // The cell's doors: the keyhole's glow, the line of light between the leaves, its spill across the floor, the marks to it once the boss is down, the cell's own glow once they open.
  const door = {};
  if (doorlight) {
    const [kx, ky, kz] = doorlight.at;
    const toward = [Math.sign(doorlight.floorTo[0] - kx) || 1, 0];
    door.keyhole = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.glow, color: 0xffd48c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9, fog: false }));
    door.keyhole.scale.setScalar(0.85);
    door.keyhole.position.set(kx + 0.08, ky, kz);
    door.keyhole.renderOrder = 6;
    door.core = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.glow, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9, fog: false }));
    door.core.scale.setScalar(0.28);
    door.core.position.set(kx + 0.1, ky, kz);
    door.core.renderOrder = 7;
    // An aura over the whole doorway: a big soft warm sprite, so that the doors are the brightest thing at the far end of the nave.
    door.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.glow, color: 0xff9d4d, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.4, fog: false }));
    door.aura.scale.set(5.5, 6.5, 1);
    door.aura.position.set(kx + 0.5, floor + 2.5, kz);
    door.aura.renderOrder = 4;
    const material = (map, opacity, color = 0xffc880) => new THREE.MeshBasicMaterial({ map, color, ...KC_ADD, opacity });
    // The line between the leaves: a thin tall card in the doors' plane.
    door.slit = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 4.6), material(textures.glow, 0.7));
    door.slit.position.set(kx + 0.04, floor + 2.4, kz);
    door.slit.rotation.y = Math.PI / 2;
    door.slit.renderOrder = 5;
    // The seam of light round the leaves: a thin bright line up one side, over the arch and down the other.
    const outline = kgOpening(0, doorlight.width ?? 3.8, 0.05, doorlight.height ?? 4.8, 'pointed');
    const seam = [];
    for (let k = 1; k < outline.length; k += 1) {
      const a = outline[k];
      const b = outline[(k + 1) % outline.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const length = Math.hypot(dx, dy) || 1;
      const nx = (dy / length) * 0.13;
      const ny = (-dx / length) * 0.13;
      const at = (p, o) => [kx + 0.04, floor + p[1] + o * ny, kz + p[0] + o * nx];
      seam.push({ corners: [at(a, 0), at(b, 0), at(b, 1), at(a, 1)], color: [1, 1, 1] });
    }
    door.seam = kcQuads(seam, new THREE.MeshBasicMaterial({ color: 0xffc070, ...KC_ADD, opacity: 0.7 }), 5);
    // The spill: a wedge along the floor from the doors toward `floorTo`.
    const length = Math.abs(doorlight.floorTo[0] - kx);
    const spill = kcQuads([{ corners: [[kx + 0.3, floor + 0.05, kz - 0.7], [kx + 0.3, floor + 0.05, kz + 0.7], [kx + toward[0] * length, floor + 0.05, kz + 3.4], [kx + toward[0] * length, floor + 0.05, kz - 3.4]], color: [1, 1, 1] }], material(kcSpillTexture(), 0.4), 3);
    // (The wedge's map runs 0 at its foot to 1 at its far end along v; the quad's corner order above puts the foot at the doors.)
    door.spill = spill;
    // A beam in the air: two crossed cards from the keyhole straight out into the nave.
    const beam = kcQuads([
      { corners: [[kx + 0.2, ky - 0.18, kz], [kx + 0.2, ky + 0.18, kz], [kx + toward[0] * 7.5, ky + 0.9, kz], [kx + toward[0] * 7.5, ky - 0.9, kz]], color: [1, 1, 1] },
      { corners: [[kx + 0.2, ky, kz - 0.18], [kx + 0.2, ky, kz + 0.18], [kx + toward[0] * 7.5, ky, kz + 0.9], [kx + toward[0] * 7.5, ky, kz - 0.9]], color: [1, 1, 1] },
    ], material(kcSpillTexture(), 0.18), 4);
    door.beam = beam;
    // The cell's glow, in the doorway, as the leaves open.
    door.cell = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 4.4), material(textures.glow, 0, 0xffb46a));
    door.cell.position.set(kx - 0.9, floor + 2.3, kz);
    door.cell.rotation.y = Math.PI / 2;
    door.cell.renderOrder = 4;
    // The marks: chevrons on the floor from the middle of the nave to the doors, for when the boss is down.
    const marks = [];
    const dir = [toward[0] * -1, 0];
    const [markFrom, markTo] = doorlight.marks ?? [1.8, Math.min(length, 16)];
    for (let s = markFrom; s < markTo; s += 2.6) {
      const mx = kx + toward[0] * s;
      const half = 0.7;
      const u = [dir[0], dir[1]];
      const w = [0, 1];
      const at = (a, b) => [mx + u[0] * a * half + w[0] * b * half, floor + 0.05, kz + u[1] * a * half + w[1] * b * half];
      marks.push({ corners: [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)], color: [1, 1, 1] });
    }
    door.marks = kcQuads(marks, new THREE.MeshBasicMaterial({ map: textures.waymark, color: 0xffd090, ...KC_ADD, opacity: 0, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }), 4);
    door.marks.visible = false;
    door.open = 0;
    group.add(door.keyhole, door.core, door.aura, door.slit, door.seam, door.spill, door.beam, door.cell, door.marks);
  }
  let last = null;
  return {
    group,
    update(t, state = {}) {
      const dt = last === null ? 0 : Math.min(0.1, t - last);
      last = t;
      const flash = state.flash ?? 0;
      if (parts.glass) parts.glass.material.color.setScalar(0.34 + 0.05 * Math.sin(t * 0.7) + flash * 2.4);
      if (parts.shafts) parts.shafts.material.opacity = 0.08 + 0.015 * Math.sin(t * 0.6) + flash * 0.55;
      if (parts.pools) parts.pools.material.opacity = 0.3 + 0.05 * Math.sin(t * 2.9) + 0.03 * Math.sin(t * 7.1);
      parts.halos.forEach((halo, k) => { halo.material.opacity = 0.42 + 0.06 * Math.sin(t * 2.3 + k * 1.7) + 0.04 * Math.sin(t * 6.1 + k); });
      if (parts.sea) parts.sea.material.opacity = 0.4 + 0.12 * Math.sin(t * 0.9) + flash * 0.5;
      if (door.keyhole) {
        const target = state.door === 'open' ? 1 : 0;
        door.open += (target - door.open) * Math.min(1, dt * 2.2);
        const dead = Boolean(state.phase) && state.phase !== 'locked';
        // Shut with the boss standing: a steady lit keyhole and a thin spill. Boss down: the glow swells and breathes, the marks come, and the cell's own light as the leaves part.
        const pulse = dead ? 0.8 + 0.2 * Math.sin(t * 3.2) : 0.62 + 0.1 * Math.sin(t * 1.6);
        door.keyhole.material.opacity = (dead ? 1 : 0.85) * pulse * (1 - door.open * 0.6);
        door.keyhole.scale.setScalar(dead ? 1.4 + 0.25 * Math.sin(t * 3.2) : 1.05);
        door.core.material.opacity = pulse;
        door.aura.material.opacity = (dead ? 0.85 : 0.42) * pulse * (1 - door.open * 0.7);
        door.aura.scale.set(dead ? 6.5 : 5.5, dead ? 7.5 : 6.5, 1);
        door.slit.material.opacity = (dead ? 0.95 : 0.8) * pulse * (1 - door.open);
        door.seam.material.opacity = (dead ? 0.95 : 0.7) * pulse * (1 - door.open);
        door.spill.material.opacity = (dead ? 0.9 : 0.55) * pulse + door.open * 0.2;
        door.beam.material.opacity = (dead ? 0.34 : 0.16) * pulse * (1 - door.open * 0.7);
        door.cell.material.opacity = door.open * (0.55 + 0.1 * Math.sin(t * 2.4));
        door.cell.visible = door.open > 0.01;
        door.marks.visible = dead;
        if (dead) door.marks.material.opacity = 0.45 + 0.4 * Math.sin(t * 2.6);
      }
    },
  };
}
