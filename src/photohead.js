// The head of a photo face (photoface.js): the drawn head's shape (face.js:
// the sex's construction and the body's morph, facemorph.js), changed a
// little by the fighter's region (faceregions.js REGION_SHAPES: skull,
// jaw, face length), with a real face's structure raised in it (brow ridge,
// eye sockets, nose, cheekbones, lips, chin) where the photo atlas has them,
// so the outline and profile carry the face and the texture stays on it.
//
// The mesh is a grid round the head, dense over the face and sparse behind
// it. Texture coordinates are read on the head before the face's structure
// and the body's morph move it, so both carry the photo with them. Across
// the face u follows the head's own width at each height (an orthographic
// view from the front, as the photo was taken), not its azimuth, so the
// cheeks are not stretched towards the ears.
//
// Plain arrays out (no Three.js), so it can be checked in Node.

import { FACE_MORPH, faceMarks, morphHeadPoint } from './facemorph.js';
import { HEAD_MODEL_DATA } from './headmodel-data.js';

export const PHOTO_HEAD = {
  // The grid: columns round (dense at the face), rows down (dense from the brow to the chin); a crowd's head is coarse.
  columns: 72,
  rows: 56,
  coarse: [36, 28],
  // How much the body's morph shows on a photo head (its shape already widens with fat and training: face.js photoShape).
  morphGain: 1.0,
  // The skull's anatomy over the drawn construction (unit space): the occiput behind, hollow temples, the cheekbones' breadth,
  // the step under the jaw's edge.
  // And a real head's proportions over the drawn one's: narrower (`width`: breadth about 0.8 of its length) and the face below
  // the eyes longer (`lowerLength`), so from the front the face is taller than it is wide (hairline to chin about 1.3 times the
  // cheekbones' width).
  // (lowerLength 1.0, was 1.12: with the construction's own chinLength the face below the eyes came to ~1.25 of the vertex-to-eye
  // height, where a real face's is about equal (Farkas 1994): the chin long and sharp. The user's call, 2026-11-10.)
  anatomy: { occiput: 0.08, temple: 0.045, zygoma: 0.03, jawEdge: 0.09, width: 0.85, lowerLength: 1.0 },
  // The face's structure, of the head's radius (unit space) and of the atlas (u round, rows down), before the region's changes.
  nose: { root: 0.05, tip: 0.2, width: 0.013, tipWidth: 0.022, tipHeight: 0.018, wing: 0.06, wingAt: 0.024 },
  brow: { height: 0.018, width: 0.06, depth: 0.03, above: 0.055 },
  socket: { depth: 0.05, width: 0.032, height: 0.022, eyeball: 0.025 },
  cheekbone: { height: 0.045, at: 0.115, below: 0.07, width: 0.045, depth: 0.035 },
  lips: { upper: 0.032, lower: 0.036, width: 0.034 },
  chin: { height: 0.05, width: 0.04, depth: 0.03 },
  // The base model (tools/headmodel.py, headmodel-data.js): a real head's shape, in place of the drawn head's stretched sphere
  // (whose face below the eyes was some 13% too long and whose jaw ran to a point). `on`: used; `eye`, `mouth`: where its eye
  // sockets' centres and its lip line are (y, head radii), the texture's eye row and lip line put there. Its own nose, sockets,
  // brow, cheekbones, lips and chin are an average man's or woman's: a region's measures change them (faceStructure, as a change
  // from no region's). The user's call, 2026-11-10. Off until its features are fitted to the face photos' (the atlas'
  // eyes, nose, mouth and chin, by a warp of the model): as it stands the photo's features miss the model's.
  // `relief`: the face model's features stand this much prouder on it than on the drawn head (whose flat face plane set them
  // shallow); `contrast`: a region's departures (its group's nose, lips, brow, cheekbones...) this much stronger, so the
  // facial models of the groups (faceregions.js SHAPE_GROUPS) read apart.
  model: { on: false, plain: false, eye: -0.07, mouth: -0.79, noseFootRow: 0.605, relief: 1.35, contrast: 1.5 },
  // Of the shading normal, how much is the smooth head's (the rest the face's): softens the nose's and sockets' facets.
  softNormal: 0.4,
  // The shadow under the nose and in the sockets, painted per vertex (1 is none).
  occlusion: { socket: 0.16, underNose: 0.14, wing: 0.1, mouth: 0.08 },
};

const headSmooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const headBump = (dx, dy, sx, sy) => Math.exp(-0.5 * ((dx / sx) ** 2 + (dy / sy) ** 2));

/** Parameters spaced by a density: `count` + 1 values from `from` to `to`, closer where `density` is high. */
function headSpaced(count, from, to, density) {
  const samples = 2048;
  const cumulative = [0];
  for (let index = 1; index <= samples; index += 1) {
    const at = from + ((to - from) * (index - 0.5)) / samples;
    cumulative.push(cumulative[index - 1] + density(at));
  }
  const total = cumulative[samples];
  const values = [];
  let cursor = 0;
  for (let step = 0; step <= count; step += 1) {
    const wanted = (total * step) / count;
    while (cursor < samples && cumulative[cursor + 1] < wanted) cursor += 1;
    const share = (wanted - cumulative[cursor]) / Math.max(1e-9, cumulative[cursor + 1] - cumulative[cursor]);
    values.push(from + ((to - from) * (cursor + Math.min(1, share))) / samples);
  }
  return values;
}

const HEAD_TABLES = {};
/** The base model's radii for a sex (decoded once). */
function headTable(sex) {
  if (HEAD_TABLES[sex]) return HEAD_TABLES[sex];
  const text = atob(HEAD_MODEL_DATA[sex].radii);
  const radii = new Float32Array(text.length / 2);
  for (let index = 0; index < radii.length; index += 1) radii[index] = (text.charCodeAt(2 * index) | (text.charCodeAt(2 * index + 1) << 8)) / 10000;
  HEAD_TABLES[sex] = { ...HEAD_MODEL_DATA[sex], radii };
  return HEAD_TABLES[sex];
}

/** The base model's surface in direction (x, y, z) (any length), head radii: its distance along it, read between the table's samples. */
export function headModelPoint(x, y, z, female = false) {
  const { polars, azimuths } = HEAD_MODEL_DATA;
  const table = headTable(female ? 'female' : 'male');
  const length = Math.hypot(x, y, z) || 1;
  const polar = Math.acos(Math.max(-1, Math.min(1, y / length)));
  const azimuth = Math.atan2(z, x);
  const row = Math.min(polars - 1e-6, (polar / Math.PI) * polars);
  const column = (((azimuth + Math.PI) / (2 * Math.PI)) * azimuths) % azimuths;
  const r0 = Math.floor(row);
  const c0 = Math.floor(column);
  const c1 = (c0 + 1) % azimuths;
  const fr = row - r0;
  const fc = column - c0;
  const at = (r, c) => table.radii[r * azimuths + c];
  const radius = (at(r0, c0) * (1 - fc) + at(r0, c1) * fc) * (1 - fr) + (at(r0 + 1, c0) * (1 - fc) + at(r0 + 1, c1) * fc) * fr;
  return [(x / length) * radius, (y / length) * radius, (z / length) * radius];
}

const HEAD_MESHES = {};
/** The base model's own mesh for a sex: { points: [[x, y, z]] (head radii), indices }, decoded once; null without one. */
function headMesh(female) {
  const sex = female ? 'female' : 'male';
  const data = HEAD_MODEL_DATA[sex];
  if (!data?.points) return null;
  if (HEAD_MESHES[sex]) return HEAD_MESHES[sex];
  const bytes = (text) => {
    const raw = atob(text);
    const out = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) out[index] = raw.charCodeAt(index);
    return out.buffer;
  };
  const coords = new Int16Array(bytes(data.points));
  const points = [];
  for (let index = 0; index < coords.length; index += 3) points.push([coords[index] / 16000, coords[index + 1] / 16000, coords[index + 2] / 16000]);
  HEAD_MESHES[sex] = { points, indices: Array.from(new Uint16Array(bytes(data.triangles))) };
  return HEAD_MESHES[sex];
}

/** Smooth normals of a triangle mesh (each point's faces' normals summed by their area). */
function meshNormals(points, indices) {
  const normals = new Float32Array(points.length * 3);
  for (let corner = 0; corner < indices.length; corner += 3) {
    const [a, b, c] = [indices[corner], indices[corner + 1], indices[corner + 2]];
    const e1 = [0, 1, 2].map((axis) => points[b][axis] - points[a][axis]);
    const e2 = [0, 1, 2].map((axis) => points[c][axis] - points[a][axis]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const vertex of [a, b, c]) for (let axis = 0; axis < 3; axis += 1) normals[vertex * 3 + axis] += n[axis];
  }
  for (let vertex = 0; vertex < points.length; vertex += 1) {
    const length = Math.hypot(normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2]) || 1;
    for (let axis = 0; axis < 3; axis += 1) normals[vertex * 3 + axis] /= length;
  }
  return normals;
}

/** The region's own changes on the base model (unit space): its skull's breadth, its face's length, its jaw, its cheekbones' breadth. */
function applyRegionToModel(point, region) {
  let [x, y, z] = point;
  const across = Math.abs(z);
  const azimuth = Math.atan2(across, x);
  const zygoma = Math.exp(-(((y + 0.12) / 0.11) ** 2)) * Math.exp(-(((azimuth - 1.3) / 0.3) ** 2)) * 0.5 * (region.cheekbone ?? 0);
  x *= 1 + PHOTO_HEAD.anatomy.zygoma * zygoma;
  z *= 1 + PHOTO_HEAD.anatomy.zygoma * zygoma;
  const ceph = region.cephalic ?? 0;
  z *= 1 + 0.05 * ceph;
  x *= 1 - 0.035 * ceph;
  if (y < 0) {
    y *= 1 + 0.05 * (region.faceLength ?? 0);
    z *= 1 + 0.06 * (region.jaw ?? 0) * headSmooth(-0.35, -0.85, y) - 0.03 * (region.faceLength ?? 0) * headSmooth(-0.2, -0.7, y);
  }
  return [x, y, z];
}

/** How much longer the face below the eyes is than the drawn head's: a real face's, and the region's face length. */
const lowerScale = (region) => PHOTO_HEAD.anatomy.lowerLength * (1 + 0.05 * (region.faceLength ?? 0));

/**
 * A real skull's anatomy and the region's changes over the drawn construction (unit space, before the morph): the cranium long
 * behind (the occiput past the neck), hollow temples, the cheekbones' breadth, the jaw's edge stepping in to the throat (less on
 * a fat face), and the region's skull breadth, face length and jaw.
 */
function applyRegionShape(point, region, body = {}) {
  let [x, y, z] = point;
  const a = PHOTO_HEAD.anatomy;
  const full = body.full ?? 0;
  const across = Math.abs(z);
  const azimuth = Math.atan2(across, x);
  // The occiput: the back of the cranium further back, most at the level of the ears and above.
  if (x < 0) x *= 1 + a.occiput * headSmooth(-0.55, -0.1, y) * headSmooth(1.05, 0.7, y);
  // Temples: hollow above the cheekbones, in front of the ears (fat fills them).
  const temple = Math.exp(-(((y - 0.22) / 0.16) ** 2)) * Math.exp(-(((azimuth - 1.05) / 0.28) ** 2)) * (1 - full);
  // Cheekbones: the face's widest, just under the eyes towards the ears.
  const zygoma = Math.exp(-(((y + 0.12) / 0.11) ** 2)) * Math.exp(-(((azimuth - 1.3) / 0.3) ** 2)) * (1 + 0.5 * (region.cheekbone ?? 0));
  const radial = 1 - a.temple * temple + a.zygoma * zygoma;
  x *= radial;
  z *= radial;
  // The jaw's edge: under the jaw, from the chin round to its corners, the surface steps in towards the throat.
  const under = headSmooth(-0.72, -0.98, y) * headSmooth(0.35, 0.85, azimuth) * (1 - 0.7 * full);
  z *= 1 - a.jawEdge * under;
  const ceph = region.cephalic ?? 0;
  z *= (1 + 0.05 * ceph) * a.width;
  x *= 1 - 0.035 * ceph;
  if (y < 0) {
    y *= lowerScale(region);
    z *= 1 + 0.06 * (region.jaw ?? 0) * headSmooth(-0.35, -0.85, y) - 0.03 * (region.faceLength ?? 0) * headSmooth(-0.2, -0.7, y);
  }
  return [x, y, z];
}

/**
 * The atlas' landmarks for a fighter (his jitter on top): eye row, lip line, chin, nose tip (rows), and the eyes' u offset.
 */
export function photoLandmarks(atlas, jitter = {}) {
  const eyeRow = atlas.eyeRow + (jitter.eyeRow ?? 0);
  const mouthRow = atlas.mouthRow + (jitter.mouthRow ?? 0);
  return { eyeRow, mouthRow, chinRow: atlas.chinRow, noseRow: eyeRow + 0.55 * (mouthRow - eyeRow), eyeU: atlas.eyeU };
}

/** The face's structure at an atlas place (u from the middle, row down): its height out of the head (unit radius), and its shadow. */
function faceStructure(du, row, marks, region) {
  const h = PHOTO_HEAD;
  const { eyeRow, mouthRow, chinRow, noseRow, eyeU } = marks;
  const r = (name) => region[name] ?? 0;
  let height = 0;
  // The nose: a ridge from between the eyes to the tip, wider as it goes down, the tip and the wings.
  const root = eyeRow - 0.015;
  const along = Math.min(1, Math.max(0, (row - root) / (noseRow - root)));
  const fade = row > noseRow ? Math.exp(-(((row - noseRow) / 0.012) ** 2)) : row < root ? Math.exp(-(((root - row) / 0.02) ** 2)) : 1;
  const bridge = 1 + 0.35 * r('noseBridge') - 0.15 * r('lidFold');
  const wide = 1 + 0.3 * r('noseWidth');
  height += (h.nose.root + (h.nose.tip * 0.75 - h.nose.root) * along ** 1.3) * bridge * fade * Math.exp(-0.5 * (du / (h.nose.width * wide * (1 + 0.8 * along))) ** 2);
  height += h.nose.tip * 0.35 * (1 + 0.2 * r('noseBridge')) * headBump(du, row - noseRow, h.nose.tipWidth * wide, h.nose.tipHeight);
  for (const side of [-1, 1]) {
    height += h.nose.wing * headBump(du - side * h.nose.wingAt * (1 + 0.4 * r('noseWidth')), row - noseRow - 0.008, 0.012 * wide, 0.012);
    const eye = du - side * eyeU;
    // The brow ridge over each eye, the socket under it, the eyeball and (for a fold) a fuller upper lid.
    height += h.brow.height * (1 + 0.6 * r('brow')) * headBump(eye, row - (eyeRow - h.brow.above), h.brow.width, h.brow.depth);
    height -= h.socket.depth * (1 + 0.5 * r('socket') - 0.4 * r('lidFold')) * headBump(eye, row - eyeRow - 0.003, h.socket.width, h.socket.height);
    height += h.socket.eyeball * headBump(eye, row - eyeRow, 0.022, 0.012);
    height += 0.012 * Math.max(0, r('lidFold')) * headBump(eye, row - eyeRow + 0.012, 0.03, 0.01);
    // The cheekbones.
    height += h.cheekbone.height * (1 + 0.6 * r('cheekbone')) * headBump(du - side * h.cheekbone.at * (1 + 0.15 * r('cheekWidth')), row - eyeRow - h.cheekbone.below, h.cheekbone.width, h.cheekbone.depth);
  }
  height += 0.02 * headBump(du, row - (eyeRow - 0.045), 0.03, 0.015);
  // The lips, the line between them, the fold under them; the chin.
  const lips = 1 + 0.5 * r('lips');
  height += h.lips.upper * lips * headBump(du, row - mouthRow + 0.014, h.lips.width * (1 + 0.15 * r('lips')), 0.01);
  height += h.lips.lower * (1 + 0.6 * r('lips')) * headBump(du, row - mouthRow - 0.016, h.lips.width * 0.95, 0.012);
  height -= 0.006 * headBump(du, row - mouthRow, 0.03, 0.004);
  height -= 0.008 * headBump(du, row - mouthRow - 0.045, 0.035, 0.008);
  height += h.chin.height * (1 + 0.6 * r('chin')) * headBump(du, row - chinRow + 0.03, h.chin.width, h.chin.depth);
  // Shadow: in the sockets, under the nose and beside its wings, at the mouth's corners.
  const o = h.occlusion;
  let shade = 0;
  for (const side of [-1, 1]) {
    shade += o.socket * headBump(du - side * eyeU, row - eyeRow + 0.004, 0.03, 0.02) * (1 - 0.5 * Math.max(0, r('lidFold')));
    shade += o.wing * headBump(du - side * 0.036 * wide, row - noseRow - 0.01, 0.008, 0.012);
    shade += o.mouth * headBump(du - side * 0.036, row - mouthRow, 0.008, 0.008);
  }
  shade += o.underNose * headBump(du, row - noseRow - 0.028, 0.026, 0.01);
  return { height, shade: Math.min(0.45, shade) };
}

/**
 * The head's mesh: { positions, normals, uvs, colors, indices, uvAt(x, y, z), point(x, y, z) } in the head's local space (radius
 * applied). `deform(x, y, z)`: the drawn head's shape for a point of the unit sphere (unit space, no morph, no skull scale);
 * `skull`: face.js SKULL; `shape`: its drawn shape (its `morph`, `crown`, `chinLength`); `eyeLine`: face.js FACE.eyeLine;
 * `atlas`: PHOTO_ATLAS; `region`: the fighter's shape changes; `jitter`: his proportions; `coarse`: a crowd's head.
 * `point` gives the head's surface without the face's structure (for hair and beards, which sit on it).
 */
export function buildPhotoHead({ radius, deform, skull, shape, eyeLine, atlas, region = {}, jitter = {}, coarse = false, female = false }) {
  const [columns, rows] = coarse ? PHOTO_HEAD.coarse : [PHOTO_HEAD.columns, PHOTO_HEAD.rows];
  const azimuths = headSpaced(columns, -Math.PI, Math.PI, (az) => 1 + 3 * Math.exp(-((az / 0.9) ** 2)));
  const polars = headSpaced(rows, 0, Math.PI, (polar) => 1 + 2.5 * Math.exp(-(((polar - 2.0) / 0.7) ** 2)));
  const morph = shape.morph;
  const morphed = (p) => {
    if (!morph) return p;
    const m = morphHeadPoint(p[0], p[1], p[2], morph);
    return p.map((value, axis) => value + (m[axis] - value) * PHOTO_HEAD.morphGain);
  };
  // The head without its face: the drawn shape and the region's (unit space).
  const base = [];
  const body = { ...(morph ?? {}), female };
  const model = PHOTO_HEAD.model.on;
  // The head without its face's region changes (unit space): the base model's (its skull's scale taken out), or the drawn shape.
  const bare = (x, y, z) => {
    if (!model) return applyRegionShape(deform(x, y, z), region, body);
    const p = headModelPoint(x, y, z, female);
    return applyRegionToModel([p[0] / skull[0], p[1] / skull[1], p[2] / skull[2]], region);
  };
  for (const polar of polars) for (const az of azimuths) base.push(bare(Math.sin(polar) * Math.cos(az), Math.cos(polar), Math.sin(polar) * Math.sin(az)));
  const stride = columns + 1;
  const widths = polars.map((_, row) => Math.max(1e-4, ...base.slice(row * stride, row * stride + stride).map((p) => Math.abs(p[2]))));
  const heights = polars.map((_, row) => base[row * stride][1]);
  const marks = photoLandmarks(atlas, jitter);
  // (The landmarks' heights on the head as built: the face below the eyes is longer, applyRegionShape.)
  // (On the base model, its own eyes, lip line and chin, the region's face length on them.)
  const regionLower = 1 + 0.05 * (region.faceLength ?? 0);
  const modelChin = HEAD_MODEL_DATA[female ? 'female' : 'male'].chin;
  const modelMarks = HEAD_MODEL_DATA[female ? 'female' : 'male'];
  const eye = model ? ((modelMarks.eye ?? PHOTO_HEAD.model.eye) / skull[1]) * regionLower : (eyeLine / skull[1]) * lowerScale(region);
  const chinAt = model ? (modelChin / skull[1]) * regionLower : -atlas.chinT * shape.chinLength * lowerScale(region);
  const mouthAt = model ? ((modelMarks.mouth ?? PHOTO_HEAD.model.mouth) / skull[1]) * regionLower : eye + atlas.mouthShare * (chinAt - eye);
  const bottom = model ? chinAt - 0.12 : -shape.chinLength * lowerScale(region);
  // (On the base model its nose's foot too, where the photos have theirs.)
  const noseKnot = model && modelMarks.nose !== undefined ? [[(modelMarks.nose / skull[1]) * regionLower, 1 - PHOTO_HEAD.model.noseFootRow]] : [];
  const knots = [[1, 1], [atlas.hairlineAt, 1 - atlas.hairlineRow], [eye, 1 - marks.eyeRow], ...noseKnot, [mouthAt, 1 - marks.mouthRow], [chinAt, 1 - atlas.chinRow], [bottom, 0]];
  const vOf = (y) => {
    const height = y >= 0 ? Math.asin(Math.min(1, y / (shape.crown * (1 + 0.0)))) / (Math.PI / 2) : Math.max(bottom * 1.05, y);
    for (let knot = 1; knot < knots.length; knot += 1) {
      const [h0, v0] = knots[knot - 1];
      const [h1, v1] = knots[knot];
      if (height >= h1 || knot === knots.length - 1) return Math.min(1, Math.max(0, v0 + ((v1 - v0) * (h0 - height)) / (h0 - h1)));
    }
    return 0;
  };
  const widen = jitter.width ?? 0;
  // (The region's departures, stronger on the base model: its facial model.)
  const faceModelRegion = Object.fromEntries(Object.entries(region).map(([key, value]) => [key, typeof value === 'number' ? value * PHOTO_HEAD.model.contrast : value]));
  // u: across the face by the head's width there (as seen from the front), round the back by the angle beyond the side.
  const uOf = (x, z, width, az) => {
    if (width < 2e-3) return 0.5 + az / (Math.PI * 2);
    const across = Math.asin(Math.min(1, Math.abs(z) / width));
    const angle = (x >= 0 ? across : Math.PI - across) * (az >= 0 ? 1 : -1);
    return 0.5 + (angle / (Math.PI * 2)) / (1 + widen * Math.exp(-((angle / 0.9) ** 2)));
  };
  const widthAt = (y) => {
    let best = 0;
    let bestDistance = Infinity;
    heights.forEach((height, row) => {
      const distance = Math.abs(height - y);
      if (distance < bestDistance) [best, bestDistance] = [widths[row], distance];
    });
    return best;
  };
  // ---- The base model's own mesh (its nose, lips, eyelids and ears as modelled), the photo laid on it ------------------------
  const own = model ? headMesh(female) : null;
  if (own) {
    const uScale = HEAD_MODEL_DATA[female ? 'female' : 'male'].uScale ?? 1;
    // (Across the face the photo's angle stretched so its eyes land on the mesh's; easing to none round the back.)
    const fitU = (x, y, z) => {
      const az = Math.atan2(z, x);
      const width = widthAt(y);
      const u = uOf(x, z, width, az) - 0.5;
      const angle = u * Math.PI * 2;
      return 0.5 + (angle * (1 + (uScale - 1) * Math.exp(-((angle / 1.1) ** 2)))) / (Math.PI * 2);
    };
    const units = own.points.map((p) => applyRegionToModel([p[0] / skull[0], p[1] / skull[1], p[2] / skull[2]], region));
    const meshUvs = [];
    for (const p of units) meshUvs.push(fitU(p[0], p[1], p[2]), vOf(p[1]));
    const unitNormals = meshNormals(units, own.indices);
    // The region's facial model as a change on the mesh (its nose, lips, brow... from no region's), along the surface.
    const raisedUnit = units.map((p, vertex) => {
      const du = meshUvs[vertex * 2] - 0.5;
      const rowAt = 1 - meshUvs[vertex * 2 + 1];
      if (Math.abs(du) >= 0.2 || p[0] < 0) return p;
      const change = faceStructure(du, rowAt, marks, faceModelRegion).height - faceStructure(du, rowAt, marks, {}).height;
      const front = headSmooth(-0.2, 0.3, p[0]);
      return p.map((value, axis) => value + unitNormals[vertex * 3 + axis] * change * front);
    });
    const finalUnit = raisedUnit.map(morphed);
    const scaled = finalUnit.map((p) => [p[0] * skull[0] * radius, p[1] * skull[1] * radius, p[2] * skull[2] * radius]);
    const colours = [];
    for (const p of finalUnit) colours.push(...(morph ? faceMarks(p[0], p[1], p[2], morph) : [1, 1, 1]));
    return {
      positions: scaled.flat(),
      normals: meshNormals(scaled, own.indices),
      uvs: meshUvs,
      colors: colours,
      indices: own.indices,
      uvAt: (x, y, z) => {
        const unit = [x / (skull[0] * radius), y / (skull[1] * radius), z / (skull[2] * radius)];
        return [fitU(unit[0], unit[1], unit[2]), vOf(unit[1])];
      },
      point: (x, y, z) => {
        const p = morphed(bare(x, y, z));
        return [p[0] * skull[0], p[1] * skull[1], p[2] * skull[2]];
      },
      most: FACE_MORPH.most,
      mouthY: mouthAt * skull[1],
      earZ: Math.abs(bare(-0.06, -0.08, 1)[2]),
      // (Its own ears: the drawn ones are not added.)
      ears: true,
    };
  }
  const uvs = [];
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const p = base[row * stride + column];
      uvs.push(uOf(p[0], p[2], widths[row], azimuths[column]), vOf(p[1]));
    }
  }
  const indices = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * stride + column;
      const b = a + stride;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const normalsOf = (points) => {
    const normals = new Float32Array(points.length * 3);
    for (let corner = 0; corner < indices.length; corner += 3) {
      const [a, b, c] = [indices[corner], indices[corner + 1], indices[corner + 2]];
      const e1 = points[b].map((value, axis) => value - points[a][axis]);
      const e2 = points[c].map((value, axis) => value - points[a][axis]);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      for (const vertex of [a, b, c]) for (let axis = 0; axis < 3; axis += 1) normals[vertex * 3 + axis] += n[axis];
    }
    for (let vertex = 0; vertex < points.length; vertex += 1) {
      const length = Math.hypot(normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2]) || 1;
      for (let axis = 0; axis < 3; axis += 1) normals[vertex * 3 + axis] /= length;
    }
    return normals;
  };
  // The face raised out of the head along its normal, then the body's morph over both.
  const baseNormals = normalsOf(base);
  const faces = [];
  const shades = [];
  base.forEach((p, vertex) => {
    const du = uvs[vertex * 2] - 0.5;
    const rowAt = 1 - uvs[vertex * 2 + 1];
    const front = headSmooth(-0.2, 0.3, p[0]);
    // (The base model is featureless across the face: the region's face model is raised on it, where the photo's features are.)
    const { height: raised, shade } = Math.abs(du) < 0.2 ? faceStructure(du, rowAt, marks, model ? faceModelRegion : region) : { height: 0, shade: 0 };
    const height = model ? raised * PHOTO_HEAD.model.relief : raised;
    faces.push(p.map((value, axis) => value + baseNormals[vertex * 3 + axis] * height * front));
    shades.push(shade * front);
  });
  const smoothHead = base.map(morphed);
  const finalUnit = faces.map(morphed);
  const scale = (p) => [p[0] * skull[0] * radius, p[1] * skull[1] * radius, p[2] * skull[2] * radius];
  const final = finalUnit.map(scale);
  const sharp = normalsOf(final);
  const soft = normalsOf(smoothHead.map(scale));
  const normals = new Float32Array(sharp.length);
  for (let vertex = 0; vertex < final.length; vertex += 1) {
    const n = [0, 1, 2].map((axis) => sharp[vertex * 3 + axis] * (1 - PHOTO_HEAD.softNormal) + soft[vertex * 3 + axis] * PHOTO_HEAD.softNormal);
    const length = Math.hypot(...n) || 1;
    for (let axis = 0; axis < 3; axis += 1) normals[vertex * 3 + axis] = n[axis] / length;
  }
  // Per vertex: the body's marks (hollows, jowls, red cheeks: facemorph.js) and the face's shadow.
  const colors = [];
  finalUnit.forEach((p, vertex) => {
    const paint = morph ? faceMarks(p[0], p[1], p[2], morph) : [1, 1, 1];
    const light = 1 - shades[vertex];
    colors.push(...paint.map((value) => Math.min(1, value * light)));
  });
  return {
    positions: final.flat(),
    normals,
    uvs,
    colors,
    indices,
    /** Texture coordinates for a point near the head (an ear), in the head's local space. */
    uvAt: (x, y, z) => {
      const unit = [x / (skull[0] * radius), y / (skull[1] * radius), z / (skull[2] * radius)];
      return [uOf(unit[0], unit[2], widthAt(unit[1]), Math.atan2(unit[2], unit[0])), vOf(unit[1])];
    },
    /** The head's surface without the face (unit space, skull scale applied, no radius): for hair and beards to sit on. */
    point: (x, y, z) => {
      const p = morphed(bare(x, y, z));
      return [p[0] * skull[0], p[1] * skull[1], p[2] * skull[2]];
    },
    most: FACE_MORPH.most,
    // The lip line's height (head radii, skull scale applied) and the side of the head where the ears sit (z, unit space).
    mouthY: mouthAt * skull[1],
    earZ: Math.abs(bare(-0.06, -0.08, 1)[2]),
  };
}
