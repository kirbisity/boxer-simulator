// A low-polygon body, built the way game characters are: each part is a
// loft of elliptical rings along its bones, with a designed profile (the
// deltoid cap, the biceps, the narrow elbow, the calf), and the parts
// overlap where they meet rather than being fused. ~3k triangles for the
// whole body, and no lumps: every ring is a clean ellipse. 'faceted' drops to
// seven sides and flat normals, for a low-poly art look.

import { P } from './body.js';
import { relax, skinWeights } from './bodymesh.js';
import { vec } from './pose.js';
import { BONE, bindPoints, boneFrames } from './rig.js';
import { glovedFists, outfitOf } from './outfits.js';

// Tops: where the hem and neckline sit along the trunk (0 hips, 1 neck),
// how far the cloth stands off the skin, how long the sleeves run (a share of
// the upper arm; above 1, on down the forearm), and any layer beneath.
export const TOPS = {
  sportsBra: { hem: 0.56, neck: 0.86, loose: 1.05, sleeve: 0 },
  tank: { hem: 0.04, neck: 0.95, loose: 1.05, sleeve: 0 },
  tee: { hem: 0.02, neck: 0.98, loose: 1.06, sleeve: 0.5, sleeveLoose: 1.22 },
  longsleeve: { hem: 0, neck: 0.99, loose: 1.05, sleeve: 1.85, sleeveLoose: 1.16 },
  compression: { hem: 0.02, neck: 0.99, loose: 1.03, sleeve: 1.85, sleeveLoose: 1.08 },
  jacket: { hem: -0.1, neck: 1.0, loose: 1.11, sleeve: 1.85, sleeveLoose: 1.24, ribbed: true },
  hoodie: { hem: -0.1, neck: 1.0, loose: 1.11, sleeve: 1.8, sleeveLoose: 1.24, ribbed: true },
  puffer: { hem: -0.06, neck: 0.98, loose: 1.21, sleeve: 0, inner: 'longsleeve' },
  flannel: { hem: -0.08, neck: 0.99, loose: 1.1, sleeve: 1.82, sleeveLoose: 1.2 },
  suit: { hem: -0.16, neck: 0.99, loose: 1.09, sleeve: 1.85, sleeveLoose: 1.2 },
  waistcoat: { hem: -0.02, neck: 0.93, loose: 1.08, sleeve: 0, inner: 'longsleeve' },
  aloha: { hem: -0.06, neck: 0.98, loose: 1.11, sleeve: 0.55, sleeveLoose: 1.3 },
  haramaki: { hem: -0.02, neck: 0.45, loose: 1.05, sleeve: 0 },
  // A medieval tunic: to the waist as a shirt, then a skirt to mid-thigh (`skirt`, thigh shares), belted.
  tunic: { hem: -0.1, neck: 0.97, loose: 1.12, sleeve: 1.7, sleeveLoose: 1.26, skirt: 0.5 },
};

export const LOFT = {
  // Belly: fat layer thickness (m) past which the abdomen bulges and hangs;
  // how far forward it bulges, and how far below the waistband it hangs,
  // per metre of layer past that.
  bellyFrom: 0.035,
  bellyScale: 0.9,
  bellyDrop: 2.2,
  // Trunk lean radius (m) below which the body looks wasted, and over what
  // span it reaches the BMI floor's look (~0.107 m for a 180 cm man).
  wastingFrom: 0.135,
  wastingSpan: 0.03,
  sides: 18,
  facetedSides: 7,
  // Rings per unit of each part's count; above 1 is denser along the limbs.
  rowDensity: 1.4,
  // A light relaxation rounds the ring edges without losing the shapes.
  relaxPasses: 2,
  relaxAmount: 0.3,
};

const smooth = (t) => t * t * (3 - 2 * t);

/** Piecewise-smooth interpolation through [u, value] stops. */
function profile(stops) {
  return (u) => {
    if (u <= stops[0][0]) return stops[0][1];
    for (let index = 1; index < stops.length; index += 1) {
      const [u0, v0] = stops[index - 1];
      const [u1, v1] = stops[index];
      if (u <= u1) return v0 + (v1 - v0) * smooth((u - u0) / (u1 - u0));
    }
    return stops.at(-1)[1];
  };
}

/**
 * Add one loft to the mesh arrays.
 * @param rings [{ center, depthAxis, widthAxis, depth, width }]
 */
function loft(mesh, rings, sides, { capStart = true, capEnd = true, color = 'skin', inflate = 1, bones = () => null } = {}) {
  const start = mesh.positions.length / 3;
  // A colour may be a pattern: a function of the ring (and its index), and
  // of the angle round it (0 at the front, as the depth axis points).
  const paint = typeof color === 'function' ? color : () => color;
  for (const [ringIndex, ring] of rings.entries()) {
    for (let step = 0; step < sides; step += 1) {
      const angle = (step / sides) * Math.PI * 2;
      const p = vec.add(ring.center, vec.add(vec.scale(ring.depthAxis, Math.cos(angle) * ring.depth * inflate), vec.scale(ring.widthAxis, Math.sin(angle) * ring.width * inflate)));
      mesh.positions.push(...p);
      // Weighted where the body's own surface is beneath it: cloth standing
      // off the skin would otherwise follow the bones less than the skin
      // under it, and the skin would come through when a limb moves.
      mesh.weightPositions.push(...vec.add(ring.center, vec.add(vec.scale(ring.depthAxis, Math.cos(angle) * ring.depth), vec.scale(ring.widthAxis, Math.sin(angle) * ring.width))));
      mesh.colors.push(paint(ring, angle, ringIndex, step));
      mesh.bones.push(bones(ring, Math.cos(angle)));
    }
  }
  for (let row = 0; row < rings.length - 1; row += 1) {
    for (let step = 0; step < sides; step += 1) {
      const a = start + row * sides + step;
      const b = start + row * sides + ((step + 1) % sides);
      mesh.indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
  }
  const cap = (row, flip) => {
    const center = mesh.positions.length / 3;
    mesh.positions.push(...rings[row].center);
    mesh.weightPositions.push(...rings[row].center);
    mesh.colors.push(paint(rings[row], 0, row, 0));
    mesh.bones.push(bones(rings[row], 0));
    for (let step = 0; step < sides; step += 1) {
      const a = start + row * sides + step;
      const b = start + row * sides + ((step + 1) % sides);
      if (flip) mesh.indices.push(center, b, a);
      else mesh.indices.push(center, a, b);
    }
  };
  if (capStart) cap(0, false);
  if (capEnd) cap(rings.length - 1, true);
}

/** Rings along a straight run from a to b, oriented by a frame's forward axis. */
function along(a, b, forward, count, from, to, depthAt, widthAt, offsetAt = () => 0) {
  const axis = vec.normalize(vec.sub(b, a));
  const depthAxis = vec.normalize(vec.sub(forward, vec.scale(axis, vec.dot(forward, axis))));
  const widthAxis = vec.cross(axis, depthAxis);
  const length = vec.length(vec.sub(b, a));
  const rings = [];
  for (let index = 0; index <= count; index += 1) {
    const t = from + ((to - from) * index) / count;
    const center = vec.add(vec.add(a, vec.scale(axis, t * length)), vec.scale(depthAxis, offsetAt(t)));
    rings.push({ t, center, depthAxis, widthAxis, depth: depthAt(t), width: widthAt(t) });
  }
  return rings;
}

function computeNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let face = 0; face < indices.length; face += 3) {
    const [a, b, c] = [indices[face], indices[face + 1], indices[face + 2]];
    const p = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    const n = vec.cross(vec.sub(p(b), p(a)), vec.sub(p(c), p(a)));
    for (const i of [a, b, c]) for (let axis = 0; axis < 3; axis += 1) normals[i * 3 + axis] += n[axis];
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= length;
    normals[i + 1] /= length;
    normals[i + 2] /= length;
  }
  return normals;
}

// Armour kinds drawn from a table of pieces. Each slot holds one piece or
// a list of them, the same both sides or per side ({ l, r }); a piece is
// [from, to, inflate, paint], along the part (for a forearm, `to` at or
// below 0 counts back from the wrist). Paint is a role, or a pattern of
// roles: rows (by ring), mail (rings in a weave), rivets (dots on a base),
// a front panel, or heraldry (the design's surcoat field).
const MAIL = { mail: true };
const LACED = { rows: ['steel', 'lace'] };
const MANICA = { rows: ['steel', 'lace'] };
const BALTEUS = [0.04, 0.24, 1.14, { rows: ['steel', 'gold', 'steel'] }];
export const ARMOR_KINDS = {
  // Tosei gusoku: a solid cuirass of riveted horizontal steel lames, laced
  // skirt and sleeves, the war mask on the kabuto.
  toseiDo: {
    trunk: [-0.1, 1.02, 1.19, { rows: ['steel', 'steel', 'steel2'], rivets: 4 }], skirt: [0.5, 0.45, 1.24, LACED], collar: 'steel',
    upperArm: [-0.18, 0.45, 1.62, LACED], forearm: [-0.04, -0.04, 1.3, 'top'], thigh: [0.25, 0.85, 1.3, LACED], shin: [0.04, 0.86, 1.34, 'steel'],
  },
  // Ashigaru: a plain lacquered okegawa-do with the lord's mon, a short skirt,
  // cloth sleeves and simple shin guards.
  okegawa: {
    trunk: [-0.05, 0.96, 1.17, { mon: [0.68, 0.07, 'gold'], base: 'armor' }], skirt: [0.3, 0.4, 1.2, { rows: ['armor', 'lace'] }],
    forearm: [-0.04, -0.04, 1.22, 'top'], shin: [0.1, 0.8, 1.3, 'armor'],
  },
  // A knight in mail: hauberk to the knees, mail sleeves and chausses, and a
  // surcoat in his colours over it.
  mail: {
    trunk: [[-0.12, 1.02, 1.1, MAIL], [-0.1, 0.94, 1.22, { heraldry: true }]], skirt: [[0.62, 0.35, 1.13, MAIL], [0.72, 0.45, 1.32, { heraldry: true }]], collar: 'mail',
    upperArm: [-0.3, 1.04, 1.14, MAIL], forearm: [-0.06, 0, 1.14, MAIL], thigh: [-0.05, 1.04, 1.1, MAIL], shin: [-0.12, 0.95, 1.1, MAIL],
  },
  // A foot soldier: a riveted brigandine over a quilted coat, a short skirt
  // of lames, spaulders, vambraces and knee cops; the legs otherwise bare of steel.
  brigandine: {
    trunk: [-0.06, 0.95, 1.21, { rivets: 3, base: 'cloth' }], skirt: [0.28, 0.35, 1.22, { rows: ['steel', 'steel2'] }],
    upperArm: [-0.2, 0.36, 1.62, 'steel'], forearm: [0.18, -0.08, 1.3, 'steel'], knee: [0.82, 1.05, 1.45, 'steel'],
  },
  // Murmillo: belt, the manica on the sword arm, a short greave on the lead leg over a quilted wrap.
  murmillo: {
    belt: BALTEUS, upperArm: { r: [-0.25, 1.02, 1.32, MANICA] }, forearm: { r: [-0.06, -0.02, 1.32, MANICA] },
    thigh: { l: [0.62, 1.0, 1.18, 'pad'] }, shin: { l: [-0.05, 0.55, 1.32, 'steel'] },
  },
  // Secutor: like the murmillo, the greave higher.
  secutor: {
    belt: BALTEUS, upperArm: { r: [-0.25, 1.02, 1.32, MANICA] }, forearm: { r: [-0.06, -0.02, 1.32, MANICA] },
    thigh: { l: [0.55, 1.0, 1.18, 'pad'] }, shin: { l: [-0.12, 0.9, 1.32, 'steel'] },
  },
  // Retiarius: no helmet, no greaves; the galerus standing up from the left shoulder, a manica on that arm.
  retiarius: {
    belt: BALTEUS, upperArm: { l: [[-0.32, 0.28, 2.0, 'steel'], [0.2, 1.02, 1.3, MANICA]] }, forearm: { l: [-0.06, -0.02, 1.3, MANICA] },
  },
  // Thraex: quilted wraps up both thighs, high greaves over them, the manica.
  thraex: {
    belt: BALTEUS, upperArm: { r: [-0.25, 1.02, 1.32, MANICA] }, forearm: { r: [-0.06, -0.02, 1.32, MANICA] },
    thigh: [[0.05, 0.75, 1.2, { rows: ['pad', 'kit'] }], [0.68, 1.05, 1.34, 'steel']], shin: [-0.14, 0.9, 1.32, { rows: ['steel', 'steel', 'gold'] }],
  },
};

/** The pieces in a slot of an armour kind, for one side. */
function armorPieces(kind, slot, side) {
  const value = kind?.[slot];
  if (!value) return [];
  const forSide = Array.isArray(value) ? value : value[side];
  if (!forSide) return [];
  return Array.isArray(forSide[0]) ? forSide : [forSide];
}

/** A paint as the loft wants it: a role, or a function of the ring and its place. */
function paintFor(paint, armor) {
  if (typeof paint === 'string') return paint;
  if (paint.mail) return (ring, angle, index, step) => ((index + step) % 2 ? 'mail' : 'mail2');
  if (paint.heraldry) return (ring, angle) => heraldry(armor?.heraldry, ring.t, Math.sin(angle), Math.cos(angle));
  if (paint.mon) {
    // A round crest on the breast: centred `t` up the trunk, `size` across.
    const [centre, size, role] = paint.mon;
    return (ring, angle) => (Math.cos(angle) > 0 && Math.hypot((ring.t - centre) / size, Math.sin(angle) / (size * 2.6)) < 1 ? role : paint.base);
  }
  if (paint.panel) {
    const [from, to, ahead, role] = paint.panel;
    return (ring, angle) => (ring.t > from && ring.t < to && Math.cos(angle) > ahead ? role : paint.base);
  }
  return (ring, angle, index, step) => {
    if (paint.rivets && index % paint.rivets === 1 && step % 3 === 0) return 'gold';
    if (paint.rows) return paint.rows[index % paint.rows.length];
    return paint.base;
  };
}

/** A surcoat's field: plain, per pale, quarterly, a cross, a chevron, or a chief. */
function heraldry(kind, t, across, ahead) {
  switch (kind) {
    case 'pale': return across > 0 ? 'cloth' : 'cloth2';
    case 'quarterly': return (across > 0) !== (t > 0.45) ? 'cloth' : 'cloth2';
    case 'cross': return ahead > 0 && (Math.abs(across) < 0.16 || Math.abs(t - 0.62) < 0.06) ? 'cloth2' : 'cloth';
    case 'chevron': return ahead > 0 && Math.abs(t - (0.35 + Math.abs(across) * 0.5)) < 0.07 ? 'cloth2' : 'cloth';
    case 'chief': return t > 0.74 ? 'cloth2' : 'cloth';
    default: return 'cloth';
  }
}

/** Split every triangle's corners apart so each face shades flat. */
function facet(positions, indices, colors, bones, weightPositions) {
  const flatPositions = [];
  const flatIndices = [];
  const flatColors = [];
  const flatBones = [];
  const flatWeights = [];
  for (let face = 0; face < indices.length; face += 1) {
    const i = indices[face];
    flatPositions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    flatColors.push(colors[i]);
    flatBones.push(bones[i]);
    flatWeights.push(weightPositions[i * 3], weightPositions[i * 3 + 1], weightPositions[i * 3 + 2]);
    flatIndices.push(face);
  }
  return { positions: flatPositions, indices: flatIndices, colors: flatColors, bones: flatBones, weightPositions: flatWeights };
}

export function buildLoftBody(body, { faceted = false, lowDetail = false } = {}) {
  // Low detail (a crowd): fewer sides and rows, still smooth.
  const sides = faceted ? LOFT.facetedSides : lowDetail ? Math.round(LOFT.sides * 0.6) : LOFT.sides;
  const rows = faceted ? 0.5 : lowDetail ? LOFT.rowDensity * 0.6 : LOFT.rowDensity;
  const count = (n) => Math.max(2, Math.round(n * rows));
  const points = bindPoints(body);
  const frames = boneFrames(points, body);
  const at = (name) => points[P[name]];
  const seg = body.segments;
  const L = body.lengths;
  const mesh = { positions: [], weightPositions: [], indices: [], colors: [], bones: [] };
  const build = seg.trunk.tissue.muscle / (seg.trunk.tissue.muscle + seg.trunk.tissue.fat);
  // The trunk is a lean shape (from the radius without fat) under a layer
  // of fat, laid on where fat goes: thickest at the waist and belly, then
  // the hips (more so for women), least over the shoulders.
  const R = seg.trunk.muscleRadius;
  const fatLayer = Math.max(0, seg.trunk.skinRadius - seg.trunk.muscleRadius);
  const female = body.inputs.sex === 'female';
  const forward = [1, 0, 0];

  // Trunk: hips, waist, chest, shoulders, narrowing into the neck.
  const hipHalf = L.hipSpan / 2 + seg.lThigh.muscleRadius * 0.85;
  const neckR = L.headRadius * (0.44 + 0.12 * body.neckIndex);
  const hipFat = female ? 1.6 : 1.1;
  // Wasting (0 at a normal build, 1 at the BMI floor): the abdomen sinks
  // behind the ribs, the waist pinches and the chest shrinks onto its cage.
  const wasting = Math.min(1, Math.max(0, (LOFT.wastingFrom - R) / LOFT.wastingSpan));
  const leanWidth = profile([[-0.12, hipHalf * 0.8], [0.02, hipHalf], [0.3, (L.hipSpan * 0.42 + R * 0.25) * (1 - 0.3 * wasting)], [0.62, (L.shoulderSpan * 0.42 + 0.02) * (1 - 0.14 * wasting)], [0.84, L.shoulderSpan * 0.48 * (1 - 0.06 * wasting)], [0.94, L.shoulderSpan * 0.4], [1.04, neckR * (1.7 + 0.5 * body.neckIndex)], [1.12, neckR * 1.15]]);
  const fatWidth = profile([[-0.12, 0.9 * hipFat], [0.05, 1.25 * hipFat], [0.3, 1.55], [0.6, 1.05], [0.86, 0.55], [1.04, 0.45], [1.12, 0.25]]);
  const leanDepth = profile([[-0.12, R * 0.5], [0.02, R * 0.62], [0.3, R * 0.55 * (1 - 0.3 * wasting)], [0.62, R * 0.62 * (1 + 0.15 * build) * (1 - 0.1 * wasting)], [0.88, R * 0.52], [1.04, neckR * 1.3], [1.12, neckR * 1.05]]);
  const fatDepth = profile([[-0.12, 0.8], [0.1, 1.05], [0.3, 1.45], [0.62, 0.95], [0.88, 0.5], [1.04, 0.6], [1.12, 0.35]]);
  // The belly carries forward of the spine as fat thickens.
  const leanOffset = profile([[0, -0.012], [0.3, 0], [0.65, 0.012], [1, -0.01]]);
  const fatOffset = profile([[0, 0.1], [0.25, 0.55], [0.45, 0.35], [0.65, 0.1], [1, 0]]);
  // Past a thick enough layer the abdomen bulges forward, then hangs: the
  // trunk carries on below the waistband as an apron in front of the thighs,
  // narrowing and thinning to its hem.
  const belly = Math.max(0, fatLayer - LOFT.bellyFrom);
  const bulge = profile([[-0.12, 0.7], [0.15, 1], [0.4, 0.4], [0.6, 0]]);
  const hem = -0.12 - (belly * LOFT.bellyDrop) / vec.length(vec.sub(at('neck'), at('pelvis')));
  const bodyWidth = (u) => leanWidth(u) + fatLayer * fatWidth(u);
  const bodyDepth = (u) => leanDepth(u) + fatLayer * fatDepth(u) + belly * LOFT.bellyScale * bulge(u);
  const bodyLean = (u) => leanOffset(u) + fatLayer * fatOffset(u) + belly * LOFT.bellyScale * 0.8 * bulge(u);
  // 0 at the hem, 1 at the waistband.
  const apron = (u) => Math.sqrt(Math.max(0, (u - hem) / (-0.12 - hem)));
  const width = (u) => (u >= -0.12 ? bodyWidth(u) : bodyWidth(-0.12) * (0.55 + 0.45 * apron(u)));
  const depth = (u) => (u >= -0.12 ? bodyDepth(u) : bodyDepth(-0.12) * (0.3 + 0.7 * apron(u)));
  const lean = (u) => (u >= -0.12 ? bodyLean(u) : bodyLean(-0.12) + bodyDepth(-0.12) * 0.7 * (1 - apron(u)));
  const trunkRings = (from, to, rings) => along(at('pelvis'), at('neck'), forward, rings, from, to, depth, width, lean);
  // Skin weights go by distance; a wide belly lies nearer the hanging
  // forearms than the spine, so the abdomen is bound to the torso alone,
  // and the apron to the pelvis and spine, not the legs it hangs over.
  // The front of a fat belly lies over the thighs too, which swing forward
  // in a crouch; only the sides and back of the hips follow the legs.
  const torso = [BONE.pelvis, BONE.spine, BONE.chest, BONE.lThigh, BONE.rThigh];
  const hanging = [BONE.pelvis, BONE.spine, BONE.chest];
  const abdomen = (ring, front) => (ring.t < -0.12 || (belly > 0 && front > 0.2) ? hanging : ring.t < 0.55 ? torso : null);
  loft(mesh, trunkRings(Math.min(-0.12, hem), 1.12, count(18) + Math.round((-0.12 - Math.min(-0.12, hem)) * 10)), sides, { bones: abdomen });
  // Kit is geometry, not paint: shorts, waistband and (for women) a sports
  // top are lofts a little proud of the skin, so their edges are crisp.
  // Shorts sit on the hips under the belly, which hangs over them.
  const unbulged = (shape, bellyPart) => (u) => shape(u) - belly * LOFT.bellyScale * bellyPart * bulge(u);
  const shortsRings = (from, to, rings) => along(at('pelvis'), at('neck'), forward, rings, from, to, unbulged(bodyDepth, 1), bodyWidth, unbulged(bodyLean, 0.8));
  // The outfit, piece by piece. Every piece is a loft over the body part
  // it covers, painted by role (top, trim, shirt, tie, armour, steel...);
  // the view turns roles into the design's colours.
  const { look } = outfitOf(body.inputs);
  const top = look.top && (!look.top.female || female) ? look.top : null;
  const topShape = top ? TOPS[top.kind] : null;
  const bottom = look.bottom ?? null;
  const armor = look.armor ?? null;
  const plate = armor?.kind === 'plate';
  const lamellar = armor?.kind === 'lamellar';
  const hoplomachus = armor?.kind === 'hoplomachus';
  // A kind drawn from the table of pieces.
  const kit = ARMOR_KINDS[armor?.kind] ?? null;
  const tablePiece = (rings, inflate, paint, bones) => loft(mesh, rings, sides, { color: paintFor(paint, armor), inflate, capStart: false, capEnd: false, ...(bones ? { bones } : {}) });
  // Lamellar: rows of lacquered scales, laced between rows and down each column.
  const laced = (ring, angle, index) => (index % 3 === 2 ? 'lace' : 'steel');
  const hanging3 = [BONE.pelvis, BONE.lThigh, BONE.rThigh];
  // Patterns on the trunk: a zip, a suit's V with the shirt and tie in it,
  // an open shirt, checks, quilting, a seam down the side.
  const topPattern = (ring, angle, index, step) => {
    const u = ring.t;
    const ahead = Math.cos(angle);
    const side = Math.abs(Math.sin(angle));
    switch (top.kind) {
      case 'jacket': case 'hoodie':
        return top.zip && ahead > 0 && side < 0.06 ? 'trim' : 'top';
      case 'compression':
        return side > 0.93 ? 'trim' : 'top';
      case 'suit': case 'waistcoat': {
        const open = top.kind === 'suit' ? 0.5 : 0.55;
        const width = (u - open) * (top.kind === 'suit' ? 1.4 : 1.6);
        if (ahead > 0.25 && u > open && side < width) {
          if (side < 0.06) return 'tie';
          if (top.waistcoat && side > width * 0.55) return 'pattern';
          return 'shirt';
        }
        return 'top';
      }
      case 'flannel':
        if (ahead > 0.2 && side < 0.22) return 'shirt';
        return ((index >> 1) + (step >> 1)) % 2 ? 'pattern' : 'top';
      case 'aloha':
        if (ahead > 0.2 && side < 0.25) return 'skin';
        return (index * 3 + step * 5) % 7 === 0 ? 'pattern' : 'top';
      case 'puffer':
        return index % 2 ? 'trim' : 'top';
      default:
        return 'top';
    }
  };
  // Below the waist: shorts on the hips, a belt, a sumo's mawashi.
  const shortsOn = (role, inflate) => loft(mesh, shortsRings(-0.12, 0.2, count(5)), sides, { color: role, inflate, capStart: false, capEnd: false, bones: abdomen });
  if (bottom) {
    switch (bottom.kind) {
      case 'trunks': case 'longShorts':
        shortsOn('kit', 1.05);
        loft(mesh, shortsRings(0.17, 0.25, 1), sides, { color: bottom.trim ? 'trim2' : 'band', inflate: 1.08, capStart: false, capEnd: false, bones: abdomen });
        break;
      case 'mawashi':
        if (bottom.under) shortsOn('under', 1.04);
        shortsOn('mawashi', bottom.under ? 1.07 : 1.04);
        loft(mesh, shortsRings(-0.04, 0.2, count(3)), sides, { color: 'mawashi', inflate: 1.14, capStart: false, capEnd: false, bones: abdomen });
        break;
      case 'loincloth':
        // The subligaculum: wrapped linen, with a fold hanging in front.
        shortsOn('kit', 1.05);
        break;
      case 'slacks': case 'pants': case 'jeans': case 'cargo':
        shortsOn('kit', 1.06);
        loft(mesh, shortsRings(0.12, 0.17, 1), sides, { color: 'belt', inflate: 1.075, capStart: false, capEnd: false, bones: abdomen });
        break;
      default:
        shortsOn('kit', bottom.kind === 'tights' ? 1.03 : 1.06);
    }
  }
  // A skirt (or a knight's tassets) hangs from the waist past the hips and
  // is carried by the pelvis and both thighs.
  const trunkLength = vec.length(vec.sub(at('neck'), at('pelvis')));
  const skirtTo = (share) => -0.12 - (share * L.thigh) / trunkLength;
  // Flared to the hem (an A-line skirt, tassets spreading over the thighs),
  // so a fighting stance does not push the legs through it.
  const skirtRings = (hemAt, rings, flare = 0.3) => along(at('pelvis'), at('neck'), forward, rings, hemAt, 0.2,
    (u) => (u >= -0.12 ? unbulged(bodyDepth, 1)(u) : bodyDepth(-0.12) * (1 + flare * 0.7 * Math.sqrt((-0.12 - u) / (-0.12 - hemAt)))),
    (u) => (u >= -0.12 ? bodyWidth(u) : bodyWidth(-0.12) * (1 + flare * Math.sqrt((-0.12 - u) / (-0.12 - hemAt)))),
    (u) => (u >= -0.12 ? unbulged(bodyLean, 0.8)(u) : unbulged(bodyLean, 0.8)(-0.12)));
  const skirted = Boolean(bottom?.skirt && female);
  if (skirted) loft(mesh, skirtRings(skirtTo(0.85), count(8), 0.5), sides, { color: 'kit', inflate: 1.16, capStart: false, capEnd: false, bones: () => hanging3 });
  if (plate) loft(mesh, skirtRings(skirtTo(0.4), count(5)), sides, { color: (ring, angle, index) => (index % 2 ? 'steel2' : 'steel'), inflate: 1.2, capStart: false, capEnd: false, bones: () => hanging3 });
  // Kusazuri: the laced skirt of plates, in panels, over the hips and thighs.
  if (lamellar) loft(mesh, skirtRings(skirtTo(0.5), count(6), 0.45), sides, { color: (ring, angle, index) => (index % 2 ? 'lace' : 'steel'), inflate: 1.24, capStart: false, capEnd: false, bones: () => hanging3 });
  if (bottom?.kind === 'loincloth') loft(mesh, skirtRings(skirtTo(0.22), count(2), 0.5), sides, { color: 'kit', inflate: 1.16, capStart: false, capEnd: false, bones: () => hanging3 });
  // The balteus: a gladiator's broad bronze belt.
  if (hoplomachus) loft(mesh, shortsRings(0.04, 0.24, count(3)), sides, { color: (ring, angle, index) => (index === 1 ? 'gold' : 'steel'), inflate: 1.14, capStart: false, capEnd: false, bones: abdomen });
  // The top, over any layer beneath it; then body armour over both.
  if (topShape?.inner) loft(mesh, trunkRings(-0.02, 0.99, count(12)), sides, { color: 'shirt', inflate: TOPS[topShape.inner].loose, capStart: false, capEnd: false, bones: abdomen });
  if (topShape?.skirt) {
    loft(mesh, skirtRings(skirtTo(topShape.skirt), count(5), 0.45), sides, { color: 'top', inflate: 1.2, capStart: false, capEnd: false, bones: () => hanging3 });
    loft(mesh, shortsRings(0.1, 0.16, 1), sides, { color: 'belt', inflate: 1.16, capStart: false, capEnd: false, bones: abdomen });
  }
  if (topShape) {
    loft(mesh, trunkRings(topShape.hem, topShape.neck, count(Math.max(4, Math.round(14 * (topShape.neck - topShape.hem))))), sides, { color: topPattern, inflate: topShape.loose, capStart: false, capEnd: false, bones: abdomen });
    if (topShape.ribbed) loft(mesh, trunkRings(topShape.hem, topShape.hem + 0.06, 1), sides, { color: 'trim', inflate: topShape.loose + 0.012, capStart: false, capEnd: false, bones: abdomen });
  }
  if (armor) {
    const shell = { riot: [-0.05, 0.97, 1.25], heavyRiot: [-0.08, 1.12, 1.3], carrier: [0.05, 0.9, 1.2], plate: [-0.12, 1.02, 1.17], lamellar: [-0.1, 1.02, 1.2] }[armor.kind];
    const role = (ring, angle, index, step) => {
      if (plate) return armor.fluted && step % 2 ? 'steel2' : 'steel';
      // The ō-yoroi's leather front panel, where the bowstring would catch.
      if (lamellar && armor.panel && ring.t > 0.3 && ring.t < 0.86 && Math.cos(angle) > 0.82) return 'leather';
      if (lamellar && armor.trim && index % 5 === 0) return 'gold';
      if (lamellar) return laced(ring, angle, index, step);
      if (armor.kind === 'carrier') return Math.abs(Math.sin(angle)) < 0.75 ? 'armor' : 'top';
      return 'armor';
    };
    if (shell) loft(mesh, trunkRings(shell[0], shell[1], count(lamellar ? 15 : 12)), sides, { color: role, inflate: shell[2], capStart: false, capEnd: false, bones: abdomen });
  }
  for (const [from, to, inflate, paint] of armorPieces(kit, 'trunk', 'l')) tablePiece(trunkRings(from, to, count(Math.max(4, Math.round(14 * (to - from))))), inflate, paint, abdomen);
  for (const [hem, flare, inflate, paint] of armorPieces(kit, 'skirt', 'l')) tablePiece(skirtRings(skirtTo(hem), count(6), flare), inflate, paint, () => hanging3);
  for (const [from, to, inflate, paint] of armorPieces(kit, 'belt', 'l')) tablePiece(shortsRings(from, to, count(3)), inflate, paint, abdomen);
  loft(mesh, along(at('neck'), at('head'), forward, count(3), -0.05, 0.6, () => neckR, () => neckR * 1.05), sides, { capEnd: false });
  // A collar up the neck: plate's gorget, or heavy riot armour's padded collar.
  // The riot collar starts lower and flares out over the trapezius, so no skin shows between it and the vest.
  const collarFrom = plate || lamellar || kit?.collar ? -0.15 : -0.6;
  const flare = (t) => 1 + (plate || lamellar || kit?.collar ? 0 : 0.9 * Math.max(0, -t) / 0.6);
  if (plate || lamellar || kit?.collar || armor?.kind === 'heavyRiot') loft(mesh, along(at('neck'), at('head'), forward, count(3), collarFrom, 0.55, (t) => neckR * 1.55 * flare(t), (t) => neckR * 1.6 * flare(t) * flare(t)), sides, { color: kit?.collar ? paintFor(kit.collar, armor) : plate ? 'steel' : 'armor', capStart: false, capEnd: false });
  const armorPiece = (rings, inflate, role = plate ? 'steel' : 'armor') => loft(mesh, rings, sides, { color: role, inflate, capStart: false, capEnd: false });

  for (const side of ['l', 'r']) {
    const shoulder = at(`${side}Shoulder`);
    const elbow = at(`${side}Elbow`);
    const hand = at(`${side}Hand`);
    const upperR = seg[`${side}UpperArm`].skinRadius;
    const foreR = seg[`${side}Forearm`].skinRadius;
    const armBuild = seg[`${side}UpperArm`].tissue.muscle / (seg[`${side}UpperArm`].tissue.muscle + seg[`${side}UpperArm`].tissue.fat);
    const armForward = frames[BONE[`${side}UpperArm`]].x;
    // Deltoid cap, biceps and triceps (deeper than wide), the narrow elbow.
    // It starts well inside the trunk so its end never shows at the shoulder.
    // Its root closes to a point inside the shoulder, so no end face shows.
    const upperDepth = profile([[-0.3, upperR * 0.08], [-0.06, upperR * 1.22], [0.15, upperR * 1.2], [0.5, upperR * (1 + 0.15 * armBuild)], [0.9, upperR * 0.74], [1, upperR * 0.7]]);
    const upperWidth = profile([[-0.3, upperR * 0.08], [-0.06, upperR * 1.25], [0.15, upperR * 1.15], [0.5, upperR * 0.92], [1, upperR * 0.72]]);
    loft(mesh, along(shoulder, elbow, armForward, count(10), -0.3, 1.0, upperDepth, upperWidth), sides, { capStart: false });
    // Forearm: full below the elbow, tapering to the wrist inside the glove
    // (or, bare, on to the wrist above the fist).
    // Bare, the forearm runs right into the back of the fist.
    const wrist = glovedFists(body.inputs) ? 0.74 : 0.98;
    const forearmRings = (from, to, rings) => along(elbow, hand, armForward, rings, from, to,
      profile([[-0.04, upperR * 0.7], [0.2, foreR * 1.05], [0.74, foreR * 0.6], [0.98, foreR * 0.6]]),
      profile([[-0.04, upperR * 0.72], [0.2, foreR * 1.18], [0.74, foreR * 0.68], [0.98, foreR * 0.7]]));
    loft(mesh, forearmRings(-0.04, wrist, count(8)), sides);
    // Sleeves follow the arm's own shape, deltoid and all, a little off it,
    // from as deep in the shoulder as the arm's skin starts.
    const upperArmRings = (from, to, rings) => along(shoulder, elbow, armForward, rings, from, to, (t) => Math.max(upperDepth(t), upperR * 0.9), (t) => Math.max(upperWidth(t), upperR * 0.9));
    const sleeveOf = (shape, role) => {
      if (!shape?.sleeve) return;
      const outer = side === 'l' ? 1 : -1;
      let pattern = role;
      if (role === 'top' && top?.stripe) pattern = (ring, angle) => (Math.sin(angle) * outer > 0.85 ? 'stripe' : 'top');
      if (role === 'top' && top?.kind === 'flannel') pattern = (ring, angle, index, step) => (((index >> 1) + (step >> 1)) % 2 ? 'pattern' : 'top');
      if (role === 'top' && top?.kind === 'aloha') pattern = (ring, angle, index, step) => ((index * 3 + step * 5) % 7 === 0 ? 'pattern' : 'top');
      loft(mesh, upperArmRings(-0.3, shape.sleeve > 1 ? 1.05 : shape.sleeve, count(6)), sides, { color: pattern, inflate: shape.sleeveLoose, capStart: false, capEnd: false });
      if (shape.sleeve > 1) {
        loft(mesh, forearmRings(-0.06, shape.sleeve - 1, count(5)), sides, { color: pattern, inflate: shape.sleeveLoose, capStart: false, capEnd: false });
        if (shape.ribbed || top?.kind === 'suit') loft(mesh, forearmRings(shape.sleeve - 1.07, shape.sleeve - 1, 1), sides, { color: top?.kind === 'suit' ? 'shirt' : 'trim', inflate: shape.sleeveLoose + 0.04, capStart: false, capEnd: false });
      }
    };
    if (topShape?.inner) sleeveOf(TOPS[topShape.inner], 'shirt');
    sleeveOf(topShape, 'top');
    if (lamellar) {
      // Sode: broad laced shoulder plates; kote: armoured cloth sleeves.
      armorPiece(upperArmRings(-0.18, 0.5, count(4)), 1.85 * (armor.sode ?? 1), (ring, angle, index) => (index % 2 ? 'lace' : 'steel'));
      armorPiece(forearmRings(-0.04, wrist - 0.04, count(4)), 1.3, 'top');
    } else if (hoplomachus) {
      // The manica: a segmented guard down the sword arm only.
      if (side === 'r') {
        armorPiece(upperArmRings(-0.25, 1.02, count(7)), 1.32, (ring, angle, index) => (index % 2 ? 'lace' : 'steel'));
        armorPiece(forearmRings(-0.06, wrist - 0.02, count(6)), 1.32, (ring, angle, index) => (index % 2 ? 'lace' : 'steel'));
      }
    } else if (kit) {
      for (const [from, to, inflate, paint] of armorPieces(kit, 'upperArm', side)) tablePiece(upperArmRings(from, to, count(Math.max(3, Math.round(7 * (to - from))))), inflate, paint);
      for (const [from, to, inflate, paint] of armorPieces(kit, 'forearm', side)) tablePiece(forearmRings(from, to <= 0 ? wrist + to : to, count(5)), inflate, paint);
    } else if (armor && armor.kind !== 'carrier') {
      const big = { riot: 1.6, heavyRiot: 1.85, plate: 1.65 }[armor.kind];
      armorPiece(upperArmRings(-0.2, 0.38, count(3)), big);
      if (plate) armorPiece(upperArmRings(0.36, 1.0, count(4)), 1.28);
      if (plate) armorPiece(forearmRings(-0.12, 0.12, count(2)), 1.5);
      armorPiece(forearmRings(0.12, wrist - 0.06, count(4)), plate ? 1.32 : 1.42);
    }

    const hip = at(`${side}Hip`);
    const knee = at(`${side}Knee`);
    const foot = at(`${side}Foot`);
    const thighR = seg[`${side}Thigh`].skinRadius;
    const shankR = seg[`${side}Shank`].skinRadius;
    const legForward = frames[BONE[`${side}Thigh`]].x;
    const thighRings = (from, to, rings) => along(hip, knee, legForward, rings, from, to,
      profile([[-0.14, thighR * 1.0], [0.1, thighR * 1.18], [0.5, thighR * 1.0], [0.92, thighR * 0.66], [1, shankR * 0.92]]),
      profile([[-0.14, thighR * 1.0], [0.1, thighR * 1.1], [0.5, thighR * 0.95], [1, shankR * 0.9]]),
      profile([[0, 0], [0.5, thighR * 0.08], [1, 0]]));
    loft(mesh, thighRings(-0.14, 1.0, count(10)), sides);
    // The legs of the bottom: how far down the thigh, then the shin, it runs.
    const legReach = { trunks: [0.42, 0], longShorts: [0.62, 0], splitShorts: [0.28, 0], hikingShorts: [0.55, 0], tights: [1.04, 0.92], trackPants: [1.04, 0.9], pants: [1.04, 0.9], slacks: [1.04, 0.92], jeans: [1.04, 0.9], cargo: [1.04, 0.9], joggers: [1.04, 0.9] }[bottom?.kind] ?? [0, 0];
    const legLoose = { tights: 1.03, trackPants: 1.14, splitShorts: 1.06, trunks: 1.08, longShorts: 1.1 }[bottom?.kind] ?? 1.12;
    const outer = side === 'l' ? 1 : -1;
    const legPattern = (ring, angle) => {
      if (bottom?.stripe && Math.abs(Math.sin(angle)) > 0.9) return 'trim2';
      if (bottom?.kind === 'cargo' && ring.t > 0.35 && ring.t < 0.62 && Math.sin(angle) * outer > 0.55) return 'trim2';
      return 'kit';
    };
    if (bottom?.under) loft(mesh, thighRings(-0.05, 0.4, count(3)), sides, { color: 'under', inflate: 1.05, capStart: false, capEnd: false });
    if (legReach[0] > 0 && !skirted) loft(mesh, thighRings(-0.05, legReach[0], count(Math.max(3, Math.round(9 * legReach[0])))), sides, { color: legPattern, inflate: legLoose, capStart: false, capEnd: false });
    if (lamellar) {
      // Haidate: laced apron plates down the thigh.
      armorPiece(thighRings(0.25, 0.85, count(5)), 1.3, (ring, angle, index) => (index % 2 ? 'lace' : 'steel'));
    } else if (hoplomachus) {
      // Ocreae: high greaves, up over the knee.
      armorPiece(thighRings(0.68, 1.05, count(3)), 1.34, 'steel');
    } else if (kit) {
      for (const [from, to, inflate, paint] of armorPieces(kit, 'thigh', side)) tablePiece(thighRings(from, to, count(Math.max(2, Math.round(8 * (to - from))))), inflate, paint);
      for (const [from, to, inflate, paint] of armorPieces(kit, 'knee', side)) tablePiece(thighRings(from, to, count(2)), inflate, paint);
    } else if (armor) {
      if (plate) armorPiece(thighRings(-0.05, 0.84, count(5)), 1.26);
      if (armor.kind === 'heavyRiot') armorPiece(thighRings(0.05, 0.7, count(3)), 1.35);
      armorPiece(thighRings(0.82, 1.05, count(2)), plate ? 1.5 : 1.45, plate ? 'steel' : 'pad');
    }
    // Shin and calf: the calf sits high and behind.
    // The shin starts inside the thigh, so the knee bends without a seam.
    const shinRings = (from, to, rings) => along(knee, foot, frames[BONE[`${side}Shin`]].x, rings, from, to,
      profile([[-0.12, shankR * 0.6], [0, shankR * 0.92], [0.28, shankR * 1.1], [0.7, shankR * 0.7], [0.97, shankR * 0.5]]),
      profile([[-0.12, shankR * 0.6], [0, shankR * 0.9], [0.28, shankR * 0.98], [0.97, shankR * 0.52]]),
      profile([[0, 0], [0.28, -shankR * 0.18], [0.7, -shankR * 0.05], [1, 0]]));
    loft(mesh, shinRings(-0.12, 0.97, count(10)), sides);
    if (legReach[1] > 0 && !skirted) {
      // Trousers fall straight to the shoe; joggers and track pants gather.
      const gathered = bottom.kind === 'joggers' || bottom.kind === 'trackPants';
      loft(mesh, along(knee, foot, frames[BONE[`${side}Shin`]].x, count(8), -0.14, legReach[1], () => shankR * 1.12, () => shankR * 1.1), sides, { color: legPattern, inflate: bottom.kind === 'tights' ? 1.0 : gathered ? 1.12 : 1.22, capStart: false, capEnd: false });
      if (gathered) loft(mesh, shinRings(legReach[1] - 0.08, legReach[1], 1), sides, { color: 'trim2', inflate: 1.15, capStart: false, capEnd: false });
    }
    if (lamellar) {
      // Suneate: splinted shin guards.
      armorPiece(shinRings(0.04, 0.86, count(5)), 1.34, 'steel');
    } else if (hoplomachus) {
      armorPiece(shinRings(-0.14, 0.9, count(6)), 1.32, (ring, angle, index) => (index === 0 ? 'gold' : 'steel'));
    } else if (kit) {
      for (const [from, to, inflate, paint] of armorPieces(kit, 'shin', side)) tablePiece(shinRings(from, to, count(Math.max(2, Math.round(7 * (to - from))))), inflate, paint);
    } else if (armor) {
      armorPiece(shinRings(-0.12, 0.12, count(2)), plate ? 1.5 : 1.45, plate ? 'steel' : 'pad');
      if (plate || armor.kind !== 'carrier') armorPiece(shinRings(0.1, plate ? 0.95 : 0.8, count(4)), plate ? 1.32 : 1.35);
    }
    // Boot shafts up the shin; heels for a woman in business dress.
    const feet = (female && look.femaleFeet) || look.feet || {};
    // Shafts up the shin: an ankle boot just over the ankle bone.
    const shaft = { boxingBoot: [feet.high ? 0.45 : 0.62, 1.2], hikingBoot: [0.74, 1.36], compactBoot: [0.76, 1.3], tacticalBoot: [0.66, 1.36], heelAnkleBoot: [0.74, 1.2] }[feet.kind];
    if (shaft && !plate) loft(mesh, shinRings(shaft[0], 0.98, count(3)), sides, { color: 'boot', inflate: shaft[1], capStart: false, capEnd: false });
    if (feet.socks) loft(mesh, shinRings(0.66, 0.75, 1), sides, { color: 'sock', inflate: 1.28, capStart: false, capEnd: false });
  }

  let { positions, indices, colors, bones, weightPositions } = mesh;
  if (faceted) ({ positions, indices, colors, bones, weightPositions } = facet(positions, indices, colors, bones, weightPositions));
  let positionArray = Float32Array.from(positions);
  const indexArray = Uint32Array.from(indices);
  if (!faceted) {
    // Smooth the skin only: cloth tubes are all open edges, and relaxing an
    // open edge pulls it in — hems would sink into the body beneath them.
    const loose = Float32Array.from(positionArray);
    positionArray = relax({ positions: positionArray, indices: indexArray }, LOFT.relaxPasses, LOFT.relaxAmount).positions;
    colors.forEach((region, vertex) => {
      if (region !== 'skin') positionArray.set(loose.subarray(vertex * 3, vertex * 3 + 3), vertex * 3);
    });
  }
  const normals = computeNormals(positionArray, indexArray);
  // `regions` names what each vertex is (skin, kit, band, top) for painting.
  return { positions: positionArray, normals, indices: indexArray, regions: colors, ...skinWeights(Float32Array.from(weightPositions), frames, bones), bindFrames: frames, bindPoints: points };
}
