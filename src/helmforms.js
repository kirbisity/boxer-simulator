// The gladiators' helmets as measured forms: every part a smooth surface given as data (stations of a profile), drawn by
// arenaview.js and unwrapped for the baked relief (tools/blender/helmforms.py reads the same surfaces through
// tools/helmforms-dump.mjs). Plain (no Three.js).
//
// Head coordinates as in arenaview.js and wardrobe.js: x forward, y up, z left, in head radii (r ≈ 11 cm as drawn), the
// head's centre at the origin, the chin near y = -1.33, the eyes near y = -0.07, the nose's tip at y = -0.5.
//
// Two kinds of surface, both symmetric about the face's middle (z = 0) and both parametrised by (u, v), u from -1 (right)
// to 1 (left) and v from 0 to 1; their texture coordinates are (|u|, v), so a sheet holds one half at twice the detail:
//
//   loft   rings round the upright axis, u the angle (u · span · π from the front), v formAlong the stations. A station's
//          height `y` and radius `rad` are a number or K values evenly from the front (0) to the edge of the part
//          (span · π), interpolated smoothly round it; stations are interpolated smoothly formAlong v (each span cut `sub` times).
//          A loft with a `fit` is fitted over the head (HELM_HEAD, formFitStations): its stations are made from the head's
//          outline, a padding gap out from it, from the given foot up to the crown.
//   sweep  sections formAlong a spine in the middle plane, v formAlong the stations, u round the section (0 at the `top` side,
//          ±1 at the `bottom`). A station is a pair of points `bottom`/`top` (x, y) and a half-width `w` (`wt` at the top,
//          if it differs), or a tube's centre `at`, radius `r` and side-to-side ratio `rz`. `square` (< 1) squares the
//          section off (a box-like crest); 1 is an ellipse. A sweep with a `seat` (the name of a fitted part) stands on that
//          part: a station's `foot` x puts its bottom just inside the part's surface in the middle plane, and its top is the
//          given `top` (x, y), or `rise` [dx, height] from the surface at its foot.
//
// Proportions from the surviving helmets (see helmmaps.js for the references): the Pompeii barracks finds in Naples (MANN
// inv. 5672-5674 murmillo, 5649 thraex, 5642 secutor) and the British Museum's murmillo (1946,0514.1, 46 cm high, about
// 3.5 kg); the Louvre's thraex from Pompeii (Br 1108, 38 cm). Where a helmet is 40-46 cm overall on a head of r = 11.5 cm,
// it spans about 4 r from the visor's foot to the crest's top. A bowl is not a ball: it follows the skull inside it, longer
// front to back than it is broad (a skull's breadth about 0.75-0.8 of its length), its sides flatter, the brow sloping back
// and the occiput full, a padding of 1-2 cm (the lining) between.

const HELM_PI = Math.PI;

// ---- The head inside -----------------------------------------------------------------------------------------------------

/**
 * The head the helmets are fitted over: the game's head (photohead.js, the default; drawn with HEAD_SCALE as the rest of the
 * head), measured in the game over small and large, lean and fat fighters and long- and broad-headed regions (Korea, Central
 * Asia, West Africa, a woman), the greatest of them: at each height `y` (head radii), the head's greatest distance from the
 * upright axis at keys every sixteenth of a turn from the face (0) round to the back (π). The cranium is about 2.0 r long and
 * 1.45-1.5 r broad (a cranial index of 0.7-0.76), its widest just above the ears, the brow sloping back from y = 0.2, the
 * occiput fullest at the ears' height, the crown at `crown`. Below the eyes, the face: the nose's tip (y = -0.5) at the front,
 * the cheeks (fullest on a fat face) and the jaw. The ears stand out to about 0.77 at the sides, y -0.3 to 0.14.
 */
export const HELM_HEAD = {
  crown: 1.09,
  rows: [
    [-1.3, [0.81, 0.71, 0.63, 0.57, 0.52, 0.5, 0.46, 0.43, 0.41]],
    [-1.2, [0.84, 0.77, 0.67, 0.63, 0.56, 0.56, 0.5, 0.45, 0.42]],
    [-1.1, [0.84, 0.79, 0.72, 0.67, 0.64, 0.61, 0.56, 0.48, 0.46]],
    [-1.0, [0.82, 0.79, 0.81, 0.76, 0.69, 0.69, 0.63, 0.53, 0.51]],
    [-0.9, [0.82, 0.82, 0.86, 0.83, 0.77, 0.77, 0.7, 0.6, 0.56]],
    [-0.8, [0.89, 0.85, 0.88, 0.86, 0.84, 0.82, 0.75, 0.64, 0.61]],
    [-0.7, [0.9, 0.87, 0.91, 0.89, 0.87, 0.87, 0.81, 0.73, 0.67]],
    [-0.6, [0.9, 0.9, 0.95, 0.95, 0.86, 0.87, 0.82, 0.77, 0.75]],
    [-0.5, [1.15, 1.0, 0.98, 0.97, 0.84, 0.85, 0.84, 0.81, 0.81]],
    [-0.4, [1.11, 0.98, 0.97, 0.95, 0.81, 0.83, 0.83, 0.88, 0.9]],
    [-0.3, [1.05, 0.96, 0.95, 0.91, 0.8, 0.82, 0.86, 0.94, 0.96]],
    [-0.2, [1.04, 0.96, 0.93, 0.87, 0.8, 0.83, 0.89, 0.99, 1.01]],
    [-0.1, [1.02, 0.93, 0.88, 0.83, 0.79, 0.8, 0.89, 1.01, 1.04]],
    [0.0, [1.02, 0.97, 0.87, 0.8, 0.76, 0.79, 0.9, 1.02, 1.04]],
    [0.1, [1.0, 0.97, 0.87, 0.78, 0.75, 0.78, 0.89, 1.01, 1.04]],
    [0.2, [0.98, 0.96, 0.85, 0.77, 0.74, 0.77, 0.89, 1.0, 1.03]],
    [0.3, [0.94, 0.92, 0.83, 0.76, 0.72, 0.76, 0.87, 0.98, 1.01]],
    [0.4, [0.89, 0.88, 0.8, 0.72, 0.69, 0.73, 0.83, 0.94, 0.96]],
    [0.5, [0.86, 0.85, 0.77, 0.7, 0.67, 0.7, 0.8, 0.91, 0.93]],
    [0.6, [0.81, 0.8, 0.73, 0.66, 0.63, 0.66, 0.77, 0.86, 0.88]],
    [0.7, [0.73, 0.72, 0.65, 0.59, 0.57, 0.59, 0.68, 0.77, 0.79]],
    [0.8, [0.67, 0.65, 0.59, 0.54, 0.52, 0.54, 0.62, 0.7, 0.72]],
    [0.9, [0.58, 0.57, 0.52, 0.47, 0.45, 0.47, 0.54, 0.6, 0.62]],
    [1.0, [0.42, 0.41, 0.37, 0.34, 0.32, 0.33, 0.37, 0.42, 0.43]],
  ],
};
const HELM_HEAD_KEYS = HELM_HEAD.rows[0][1].length;
/**
 * A helmet kind's drawn span [front-back, height, side-to-side] about the head's centre. The fitted bowls are a touch
 * broader than the bare head-fit (still well under the old round bowls: about 21 cm across against 27); the Iron
 * Pagoda's bowl is drawn a little smaller and narrower, the steppe helmet narrower still (a tall, thin, pointed bowl), the
 * Roman galea's round bowl drawn in to the head; the Ming elite's tall bowl a touch narrower side to side (6%).
 */
export const HELM_SPAN = { arenaHelm: [1, 1, 1.07], kabuto: [1, 1, 1.07], pagodaHelm: [0.95, 0.95, 0.88], steppeHelm: [0.96, 1, 0.82], galea: [0.94, 0.97, 0.82], mingHelm: [1, 1, 0.94] };
/** The cranium's half-breadth over the ears' tops (y > 0.15) the helmets are fitted to: a broader head widens them (render.js). */
export const HELM_HEAD_BREADTH = Math.max(...HELM_HEAD.rows.filter(([y]) => y > 0.15).map(([, keys]) => keys[(HELM_HEAD_KEYS - 1) / 2]));

/** A keyed value (a number, or keys evenly round from the front) as `count` keys. */
function formResample(value, count = HELM_HEAD_KEYS) {
  return Array.from({ length: count }, (_, index) => formKeyed(value, index / (count - 1)));
}

/**
 * The outline of a fitted surface in one half-plane (key `k` of HELM_HEAD's, from the face round to the back): the head's
 * outline pushed out along its normal by the padding, `gap` at the sides growing to `top` over the crown, raised by `lift`
 * at the top (a taller bowl); and never narrower below than above (it must go on over the head: below the head's widest it
 * falls straight). Points (rad, y) from the bottom up to the top, where rad is 0.
 */
function formFitOutline(k, { gap, top = gap, lift = 0 }) {
  const head = [...HELM_HEAD.rows.map(([y, rads]) => [rads[k], y]), [0, HELM_HEAD.crown]];
  const out = head.map(([rad, y], index) => {
    const before = head[Math.max(0, index - 1)];
    const after = head[Math.min(head.length - 1, index + 1)];
    const tx = after[0] - before[0];
    const ty = after[1] - before[1];
    const length = Math.hypot(tx, ty) || 1;
    const normal = index === head.length - 1 ? [0, 1] : [ty / length, -tx / length];
    const up = Math.max(0, normal[1]);
    const pad = gap + (top - gap) * up * up;
    return [rad + normal[0] * pad, y + normal[1] * pad + lift * up * up];
  });
  for (let index = out.length - 2; index >= 0; index -= 1) out[index][0] = Math.max(out[index][0], out[index + 1][0]);
  for (let index = 1; index < out.length; index += 1) out[index][1] = Math.max(out[index][1], out[index - 1][1] + 1e-3);
  return out;
}

/** An outline's radius at height y (straight down below its lowest point). */
function formOutlineAt(outline, y) {
  if (y <= outline[0][1]) return outline[0][0];
  for (let index = 1; index < outline.length; index += 1) {
    const [r0, y0] = outline[index - 1];
    const [r1, y1] = outline[index];
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 0;
}

/**
 * A fitted surface's stations: `rows` + 1 rings from its `foot` (heights, keyed round from the front) up to the top, spaced
 * evenly along the outline at each key (formFitOutline: `gap`, `top`, `lift`). Each station's keys are HELM_HEAD's.
 */
export function formFitStations(fit) {
  const foot = formResample(fit.foot);
  const keys = foot.map((footY, k) => {
    const outline = formFitOutline(k, fit);
    const points = [[formOutlineAt(outline, footY), footY], ...outline.filter(([, y]) => y > footY + 1e-3)];
    const along = [0];
    for (let index = 1; index < points.length; index += 1) along.push(along[index - 1] + Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]));
    const total = along.at(-1);
    return Array.from({ length: fit.rows + 1 }, (_, row) => {
      const at = (total * row) / fit.rows;
      let index = 1;
      while (index < points.length - 1 && along[index] < at) index += 1;
      const share = (at - along[index - 1]) / Math.max(1e-9, along[index] - along[index - 1]);
      return points[index - 1].map((value, axis) => value + (points[index][axis] - value) * share);
    });
  });
  return Array.from({ length: fit.rows + 1 }, (_, row) => ({ rad: keys.map((ring) => Math.max(0, ring[row][0])), y: keys.map((ring) => ring[row][1]) }));
}

// ---- The forms ---------------------------------------------------------------------------------------------------------

// Where the bowl of a brimmed helmet ends and its brim begins, keys every eighth of a turn from the front: over the brow
// in front, falling past the ears at the sides to the nape behind (the brim is the helmet's neck guard).
const BRIM_FOOT_Y = [0.3, 0.12, -0.26, -0.58, -0.7];
// The bowl of the brimmed helmets (murmillo, thraex, hoplomachus) fitted over the head from that foot to the crown: a
// padding of about 1.6 cm at the sides, front and back (0.15 r), a little more over the crown, where the crest's foot
// stands. `lift`: how much higher the crown stands (the thraex's is the taller).
const formBowlFit = (lift = 0) => ({ foot: BRIM_FOOT_Y, gap: 0.15, top: 0.2, lift, rows: 12 });
const BRIM_FOOT = formFitStations(formBowlFit())[0];
const formPlus = (keys, add) => keys.map((value, index) => value + (typeof add === 'number' ? add : add[index]));

const formBowl = (lift = 0) => ({ kind: 'loft', span: 1, seg: [40, 1], region: 'bowl', look: 'metal', ink: true, fit: formBowlFit(lift) });

// The brim, from the bowl's foot out to the rolled lip: turned up over the brow at the front (`peak`: how high), reaching
// out from the bowl `front` at the front, broad and near level at the sides (`side`), widest and sloping down behind
// (`back`, `droop`).
const formBrim = ({ peak, front, side, back, droop }) => {
  const reach = formResample([front, (front + side) / 2 + 0.05, side, (side + back) / 2 + 0.03, back]);
  const fall = formResample([peak, 0.04, -0.08, -droop * 0.7, -droop]);
  const at = (share) => ({ y: formPlus(BRIM_FOOT.y, fall.map((value) => value * share)), rad: formPlus(BRIM_FOOT.rad, reach.map((value) => value * share)) });
  const outer = at(1);
  return {
    kind: 'loft', span: 1, seg: [48, 2], region: 'brim', look: 'metal', ink: true, double: true, flip: true,
    stations: [{ y: BRIM_FOOT.y, rad: formPlus(BRIM_FOOT.rad, -0.02) }, at(0.5), outer, { y: formPlus(outer.y, 0.07), rad: formPlus(outer.rad, 0.02) }],
  };
};

// The visor: two halves closing over the face from under the brim to below the chin, the foot flared over the throat;
// keys from the middle seam round to the hinges by the ears, where its top edge meets the brim's falling foot, just
// outside the bowl. Its sides follow the face (the cheeks of a heavy man inside, 1.5-2 cm off), its front stands clear
// of the nose.
const formVisor = (top = 0.32) => ({
  kind: 'loft', span: 0.47, seg: [24, 3], region: 'visor', look: 'visor', ink: true, double: true,
  stations: [
    { y: [-1.58, -1.52, -1.38], rad: [1.3, 1.16, 1.0] },
    { y: [-1.3, -1.25, -1.15], rad: [1.18, 1.08, 0.95] },
    { y: [-0.7, -0.7, -0.68], rad: [1.3, 1.2, 1.03] },
    { y: [0.02, -0.04, -0.16], rad: [1.31, 1.18, 1.0] },
    { y: [top, top - 0.12, -0.2], rad: [1.16, 1.08, 0.95] },
  ],
});

// The side feathers in their tubes (thraex and hoplomachus): where the tube stands on the bowl, how many feathers.
const HELM_FEATHERS = { at: [-0.05, 0.8, 0.76], tilt: 0.3 };

export const HELM_FORMS = {
  // Murmillo (Pompeii MANN 5672-5674, BM 1946,0514.1): a broad brim, nearly flat at the sides, turned up in a peak over
  // the brow and sweeping down behind; the tall crest box (crista) standing from the brow to the nape, its front edge
  // hollowed and its top jutting forward over the brow, broad on top and squared; a channel of horsehair formAlong it; the
  // two-part visor with a large grille of small round holes over each half of the upper face.
  murmillo: {
    sheet: 'formMurmillo',
    grille: 'panel',
    parts: {
      bowl: formBowl(0),
      brim: formBrim({ peak: 0.32, front: 0.24, side: 0.61, back: 0.74, droop: 0.38 }),
      visor: formVisor(0.34),
      crest: {
        kind: 'sweep', seg: [12, 4], region: 'crest', look: 'metal', ink: true, square: 0.55, seat: 'bowl',
        stations: [
          { foot: 0.8, rise: [0.06, 0.12], w: 0.05 },
          { foot: 0.66, top: [1.22, 2.02], w: 0.1, wt: 0.17 },
          { foot: 0.3, top: [0.72, 2.4], w: 0.1, wt: 0.19 },
          { foot: -0.18, top: [-0.02, 2.48], w: 0.1, wt: 0.19 },
          { foot: -0.66, top: [-0.78, 2.3], w: 0.1, wt: 0.17 },
          { foot: -0.98, top: [-1.32, 1.76], w: 0.09, wt: 0.14 },
          { foot: -1.12, top: [-1.46, 0.98], w: 0.06 },
          { foot: -1.17, rise: [-0.08, 0.1], w: 0.03 },
        ],
      },
      plume: {
        kind: 'sweep', seg: [8, 3], region: null, look: 'hair', ink: false,
        stations: [
          { at: [1.12, 2.12], r: 0.04, rz: 1 },
          { at: [0.72, 2.48], r: 0.12, rz: 0.75 },
          { at: [-0.02, 2.56], r: 0.13, rz: 0.75 },
          { at: [-0.78, 2.38], r: 0.12, rz: 0.75 },
          { at: [-1.3, 1.86], r: 0.08, rz: 0.8 },
          { at: [-1.52, 1.4], r: 0.02, rz: 1 },
        ],
      },
    },
  },
  // Thraex (Pompeii MANN 5649 and the Gorgon helmet; Louvre Br 1108): a taller bowl; the brim narrower at the sides and
  // turned up steeply over the brow; the crest a high solid ridge rising from the nape over the crown to the griffin's
  // head at the front, its beak hooked forward and down; feather tubes at the sides; the visor's grille in two round
  // panels of linked holes over the eyes.
  thraex: {
    sheet: 'formThraex',
    grille: 'disc',
    feathers: { ...HELM_FEATHERS, perSide: 2 },
    parts: {
      bowl: formBowl(0.12),
      brim: formBrim({ peak: 0.5, front: 0.2, side: 0.49, back: 0.7, droop: 0.42 }),
      visor: formVisor(0.36),
      crest: {
        kind: 'sweep', seg: [12, 4], region: 'crest', look: 'metal', ink: true, square: 0.7, seat: 'bowl',
        stations: [
          { foot: -1.14, rise: [-0.08, 0.12], w: 0.03 },
          { foot: -1.02, top: [-1.24, 1.32], w: 0.08, wt: 0.1 },
          { foot: -0.5, top: [-0.62, 2.02], w: 0.09, wt: 0.11 },
          { foot: 0.12, top: [0.2, 2.2], w: 0.09, wt: 0.11 },
          { foot: 0.56, top: [0.78, 2.14], w: 0.1, wt: 0.12 },
          { foot: 0.7, top: [0.98, 1.98], w: 0.1, wt: 0.12 },
        ],
      },
      griffin: {
        kind: 'sweep', seg: [12, 4], region: 'tube', look: 'metal', ink: true,
        stations: [
          { at: [0.74, 1.8], r: 0.2, rz: 0.6 },
          { at: [0.94, 2.06], r: 0.19, rz: 0.72 },
          { at: [1.14, 2.22], r: 0.23, rz: 0.85 },
          { at: [1.36, 2.18], r: 0.17, rz: 0.78 },
          { at: [1.52, 2.04], r: 0.1, rz: 0.62 },
          { at: [1.6, 1.86], r: 0.05, rz: 0.6 },
          { at: [1.56, 1.72], r: 0.005, rz: 1 },
        ],
      },
    },
  },
  // Hoplomachus (the same Pompeii brimmed helmet, without the griffin): a low crest ridge carrying a tall brush of
  // horsehair from brow to nape, a feather each side, the visor with round grilles.
  hoplomachus: {
    sheet: 'formHoplomachus',
    grille: 'disc',
    feathers: { ...HELM_FEATHERS, perSide: 1 },
    parts: {
      bowl: formBowl(0.08),
      brim: formBrim({ peak: 0.42, front: 0.22, side: 0.53, back: 0.7, droop: 0.4 }),
      visor: formVisor(0.35),
      crest: {
        kind: 'sweep', seg: [8, 2], region: 'crest', look: 'metal', ink: true, square: 0.7, seat: 'bowl',
        stations: [
          { foot: 0.95, rise: [0.06, 0.12], w: 0.04 },
          { foot: 0.8, rise: [0.14, 0.28], w: 0.08 },
          { foot: 0.2, rise: [0.04, 0.31], w: 0.09 },
          { foot: -0.55, rise: [-0.08, 0.34], w: 0.09 },
          { foot: -1.0, rise: [-0.16, 0.28], w: 0.07 },
          { foot: -1.13, rise: [-0.1, 0.1], w: 0.03 },
        ],
      },
      plume: {
        kind: 'sweep', seg: [8, 3], region: null, look: 'hair', ink: false, square: 0.8,
        stations: [
          { at: [1.06, 1.3], r: 0.06, rz: 1 },
          { at: [0.88, 1.74], r: 0.2, rz: 0.6 },
          { at: [0.28, 2.19], r: 0.28, rz: 0.5 },
          { at: [-0.48, 2.17], r: 0.28, rz: 0.5 },
          { at: [-1.16, 1.58], r: 0.24, rz: 0.55 },
          { at: [-1.6, 0.84], r: 0.12, rz: 0.7 },
          { at: [-1.7, 0.45], r: 0.02, rz: 1 },
        ],
      },
    },
  },
  // Secutor (Pompeii MANN 5642): a smooth, closed egg of bronze that wraps the whole head, nothing standing out for a net
  // or a trident to catch: two small round eyeholes (about 3 cm), close together; a low, rounded crest from the brow to the
  // nape, standing only a few centimetres; the foot flaring into a short neck guard behind and at the sides.
  secutor: {
    sheet: 'formSecutor',
    eyes: { y: -0.06, z: 0.29, r: 0.12 },
    parts: {
      // Fitted close over the whole head (1.4 cm at the sides, clear of the nose in front), drawn up over the crown into
      // the egg's point; below, the neck guard flaring out behind and at the sides.
      shell: {
        kind: 'loft', span: 1, seg: [40, 1], region: 'shell', look: 'metal', ink: true,
        fit: { foot: [-1.34, -1.32, -1.26, -1.24, -1.24], gap: 0.13, top: 0.3, rows: 14 },
        flare: [
          { dy: [-0.22, -0.2, -0.18, -0.26, -0.32], out: [0.1, 0.14, 0.22, 0.34, 0.4] },
          { dy: [-0.1, -0.09, -0.08, -0.11, -0.13], out: [0.03, 0.04, 0.07, 0.11, 0.13] },
        ],
      },
      crest: {
        kind: 'sweep', seg: [10, 4], region: 'crest', look: 'metal', ink: true, seat: 'shell',
        stations: [
          { foot: 1.0, rise: [0.04, 0.08], w: 0.03 },
          { foot: 0.86, rise: [0.08, 0.22], w: 0.06 },
          { foot: 0.42, rise: [0.04, 0.34], w: 0.07 },
          { foot: -0.26, rise: [-0.02, 0.34], w: 0.07 },
          { foot: -0.8, rise: [-0.08, 0.3], w: 0.06 },
          { foot: -1.08, rise: [-0.1, 0.22], w: 0.05 },
          { foot: -1.16, rise: [-0.06, 0.08], w: 0.03 },
        ],
      },
    },
  },
  // Scissor (arbelas; no helmet survives: reliefs show a closed helmet like the secutor's): a rounder closed bowl (more
  // room inside than the secutor's), a low ridge over the crown, two larger round eye openings with grilles, breathing
  // holes below, a broad neck guard.
  scissor: {
    sheet: 'formScissor',
    eyes: { y: -0.04, z: 0.36, r: 0.2 },
    parts: {
      shell: {
        kind: 'loft', span: 1, seg: [36, 1], region: 'shell', look: 'metal', ink: true,
        fit: { foot: [-1.32, -1.3, -1.18, -1.06, -1.06], gap: 0.19, top: 0.26, rows: 12 },
        flare: [
          { dy: [-0.18, -0.18, -0.18, -0.22, -0.24], out: [0.06, 0.12, 0.3, 0.46, 0.52] },
          { dy: [-0.08, -0.08, -0.08, -0.1, -0.11], out: [0.02, 0.04, 0.1, 0.16, 0.18] },
        ],
      },
      crest: {
        kind: 'sweep', seg: [8, 2], region: 'crest', look: 'metal', ink: true, seat: 'shell',
        stations: [
          { foot: 1.08, rise: [0.04, 0.1], w: 0.03 },
          { foot: 0.8, rise: [0.06, 0.18], w: 0.06 },
          { foot: 0.0, rise: [0.0, 0.2], w: 0.06 },
          { foot: -0.84, rise: [-0.08, 0.2], w: 0.06 },
          { foot: -1.14, rise: [-0.08, 0.1], w: 0.03 },
        ],
      },
    },
  },
};

/** A fitted part's stations (formFitStations), a closed shell's neck guard (`flare`: its rings' drop and reach) below its foot. */
function formFitPart(part) {
  const fitted = formFitStations(part.fit);
  const flare = (part.flare ?? []).map(({ dy, out }) => ({ y: formPlus(fitted[0].y, formResample(dy)), rad: formPlus(fitted[0].rad, formResample(out)) }));
  part.stations = [...flare, ...fitted];
  return part;
}

/** A form's seated parts (a crest's or keel's foot on its part in the middle plane: `foot` x, `rise` or `top`). */
function formSeat(form) {
  for (const part of Object.values(form.parts)) {
    if (!part.seat) continue;
    const seat = form.parts[part.seat];
    part.stations = part.stations.map((station) => {
      if (station.foot === undefined) return station;
      const { foot, rise, top, ...rest } = station;
      const surface = formMidline(seat, foot);
      return { ...rest, bottom: [foot, surface - 0.03], top: top ?? [foot + rise[0], surface + rise[1]] };
    });
  }
}

// The fitted parts' stations, then the parts seated on them (a crest's foot on its bowl in the middle plane).
for (const form of Object.values(HELM_FORMS)) {
  for (const part of Object.values(form.parts)) if (part.fit) formFitPart(part);
  formSeat(form);
}

// ---- The foot soldier's helmets of the fifteenth century, and the conquistador's cabasset ----------------------------------

/**
 * The fifteenth century's infantry helmets as measured forms, fitted over the same head, their fine work (rivets, turned
 * edges, flutes, hammering) baked in their sheets (helmforms.py `euro`), the sights and face openings cut out of them by
 * the sheet (a cut-out in the normal map's alpha: helmmaps.js helmMaterial `cut`). A helmet kind is drawn in the design
 * its wearer's kit names (outfits.js `head.design`, a key of HELM_DESIGNS[kind]; helmstyle.js `#kettle=` overrides it for
 * comparison) by any unit that wears it (wardrobe.js). The pieces (see helmmaps.js for the links), in cm on a head of
 * r ≈ 11.5 cm:
 *
 *   kettleRidged     the one-piece war hat (Cleveland Museum of Art 1916.1919, Italy c. 1460: 30.3 x 25.9 x 17.5 cm, a smooth
 *                    rounded crown raised to a low medial ridge, the lining's rivet holes along it, small rivets round the
 *                    dome's foot and the brim's outer edge, the brim wide and sloping down; Met 04.3.234, said to be from
 *                    Lake Morat: 33.7 x 33 x 23.3 cm). Its bowl a lining's room off the head, the brim 4-5 cm all round.
 *   kettleBurgundian the Burgundian war hat (Met 04.3.228, Burgundy or Flanders c. 1475: 37.1 cm long, 24.8 cm broad,
 *                    25.9 cm high): a tall skull fluted in a spiral up to a point, the brim long before and behind and
 *                    narrow at the sides, pulled down steeply over the face, a sight cut across it at the eyes.
 *   salletGerman     the German sallet (Met 29.158.11, Hans Blarer the Younger, Basel c. 1470-80: 37.4 cm long, 20.2 cm
 *                    broad, 24.8 cm high; Met 42.50.32, Caspar Rieder, c. 1480): a close skull with a low keel, drawn down
 *                    over the face to the nose with a sight across the eyes, down over the ears, and out behind in a long
 *                    tail; worn with a bevor (a scoop of plate from the chest to under the nose) strapped round the neck.
 *   cabassetSpanish  the conquistador's cabasset ("Spanish morion"; the pointed cabacete's descendant, Tavares, ASAC Bulletin 105,
 *                    2012): the Met's 14.25.533 (possibly Spanish, 23.5 cm high, 24.3 broad, 32.2 long), 14.25.1851, 27.159.12
 *                    and 14.25.532 (25.4-27.3 high, 29.2-34.3 long); the Royal Collection's RCIN 67296: a tall almond skull
 *                    raised in one piece to a short stalk bent back, a narrow brim peaked a little fore and aft, its edge
 *                    turned and roped, the lining's brass-capped rivets round the skull's foot, etched in bands from the point.
 */

/** A fitted bowl (formFitPart) with its stations made. */
const formHatBowl = (fit, seg = 28) => formFitPart({ kind: 'loft', span: 1, seg: [seg, 1], region: 'bowl', look: 'metal', ink: true, fit });

/**
 * A hat's brim from its bowl's foot out and down to its edge, the edge turned down (`lip`: the turn's drop and how far it
 * comes in): `reach` how far out and `fall` how far down at the edge, keys every eighth of a turn from the front; `bow`, how
 * much the middle stands above the straight line out (a brim a little arched); `seg` cuts round.
 */
function formHatBrim(bowl, { reach, fall, bow = 0.02, lip = [0.06, 0.012], seg = 28 }) {
  const foot = bowl.stations[0];
  const out = formResample(reach);
  const down = formResample(fall);
  const at = (share, rise = 0) => ({ y: formPlus(foot.y, down.map((value) => value * share + rise)), rad: formPlus(foot.rad, out.map((value) => value * share)) });
  const edge = at(1);
  return {
    kind: 'loft', span: 1, seg: [seg, 1], region: 'brim', look: 'metal', ink: true, double: true, flip: true,
    stations: [{ y: foot.y, rad: formPlus(foot.rad, -0.03) }, at(0.5, bow), edge, { y: formPlus(edge.y, -lip[0]), rad: formPlus(edge.rad, -lip[1]) }],
  };
}

/** A low ridge (a keel) standing on a fitted part in the middle plane, from `front` to `back` (x), at most `high` tall. */
function formKeel(seat, { front, back, high, w = 0.03, seg = [6, 1] }) {
  const feet = Array.from({ length: 7 }, (_, index) => front + ((back - front) * index) / 6);
  const rise = [0.25, 0.75, 1, 1, 1, 0.75, 0.25];
  return { kind: 'sweep', seg, region: 'comb', look: 'metal', ink: true, square: 0.6, seat, stations: feet.map((foot, index) => ({ foot, rise: [0, high * rise[index]], w })) };
}

export const DESIGN_FORMS = {
  kettleRidged: (() => {
    const bowl = formHatBowl({ foot: [0.24, 0.2, 0.12, 0.08, 0.05], gap: 0.17, top: 0.24, lift: 0.12, rows: 8 });
    return {
      sheet: 'formKettleRidged', build: 'kettle', period: 'Italy, c. 1460', label: 'Ridged kettle hat',
      regions: { bowl: [0, 0.42, 1, 1], brim: [0, 0.1, 1, 0.42], comb: [0, 0, 1, 0.1] },
      parts: {
        bowl,
        brim: formHatBrim(bowl, { reach: [0.3, 0.36, 0.4, 0.36, 0.32], fall: [-0.2, -0.21, -0.24, -0.23, -0.22] }),
        comb: formKeel('bowl', { front: 0.96, back: -1.02, high: 0.07 }),
      },
    };
  })(),
  kettleBurgundian: (() => {
    const bowl = formHatBowl({ foot: [0.32, 0.27, 0.19, 0.15, 0.12], gap: 0.16, top: 0.3, lift: 0.42, rows: 9 });
    const top = formLoftPoint(bowl, 0, 1)[1];
    return {
      sheet: 'formKettleBurgundian', build: 'kettle', period: 'Burgundy or Flanders, c. 1475', label: 'Burgundian war hat', cut: true,
      // The sight across the brim's front at the eyes (y), as far round as `z` each side, `h` high.
      sight: { y: -0.05, z: 0.56, h: 0.08 },
      regions: { bowl: [0, 0.42, 1, 1], brim: [0, 0.1, 1, 0.42], comb: [0, 0, 1, 0.1] },
      parts: {
        bowl,
        brim: formHatBrim(bowl, { reach: [0.34, 0.27, 0.2, 0.36, 0.5], fall: [-0.62, -0.5, -0.3, -0.36, -0.42], bow: 0.03, lip: [0.05, 0.012] }),
        // The point the flutes run up to.
        comb: {
          kind: 'sweep', seg: [6, 2], region: 'comb', look: 'metal', ink: true,
          stations: [{ at: [0, top - 0.06], r: 0.1, rz: 1 }, { at: [0, top + 0.04], r: 0.05, rz: 1 }, { at: [0, top + 0.13], r: 0.006, rz: 1 }],
        },
      },
    };
  })(),
  salletGerman: (() => {
    const shell = formFitPart({
      kind: 'loft', span: 1, seg: [24, 1], region: 'shell', look: 'metal', ink: true,
      fit: { foot: [-0.42, -0.5, -0.64, -0.72, -0.74], gap: 0.15, top: 0.24, lift: 0.1, rows: 9 },
      // The tail: out behind, a little at the sides, none before the face.
      flare: [
        { dy: [-0.01, -0.03, -0.07, -0.24, -0.34], out: [0.01, 0.03, 0.07, 0.42, 0.74] },
        { dy: [-0.005, -0.015, -0.035, -0.11, -0.15], out: [0.005, 0.012, 0.03, 0.18, 0.3] },
      ],
    });
    return {
      sheet: 'formSalletGerman', build: 'sallet', period: 'Basel, c. 1470-80', label: 'German sallet and bevor', cut: true,
      sight: { y: 0.0, z: 0.56, h: 0.085 },
      regions: { shell: [0, 0.38, 1, 1], bevor: [0, 0.08, 1, 0.38], comb: [0, 0, 1, 0.08] },
      parts: {
        shell,
        comb: formKeel('shell', { front: 0.9, back: -1.05, high: 0.05 }),
        // The bevor: from the upper chest up over the chin to under the nose, its top inside the sallet's foot; keys from
        // the middle round to its edges below the ears.
        bevor: {
          kind: 'loft', span: 0.4, seg: [14, 1], region: 'bevor', look: 'metal', ink: true, double: true,
          stations: [
            { y: [-1.66, -1.6, -1.46], rad: [1.24, 1.12, 0.94] },
            { y: [-1.36, -1.32, -1.22], rad: [1.1, 1.02, 0.9] },
            { y: [-0.96, -0.94, -0.9], rad: [1.18, 1.1, 0.96] },
            { y: [-0.56, -0.58, -0.62], rad: [1.24, 1.14, 0.98] },
            { y: [-0.34, -0.38, -0.5], rad: [1.18, 1.1, 0.96] },
          ],
        },
      },
    };
  })(),
  cabassetSpanish: (() => {
    // Raised from the brow and nape all round, a tall almond-shaped skull drawn up to a point (`lift`), the stalk on it.
    const bowl = formHatBowl({ foot: [0.3, 0.25, 0.16, 0.1, 0.06], gap: 0.16, top: 0.3, lift: 0.62, rows: 10 }, 24);
    const top = formLoftPoint(bowl, 0, 1)[1];
    return {
      sheet: 'formCabassetSpanish', build: 'cabasset', period: 'Spain or north Italy, c. 1530-60', label: 'Spanish cabasset',
      regions: { bowl: [0, 0.42, 1, 1], brim: [0, 0.1, 1, 0.42], comb: [0, 0, 1, 0.1] },
      parts: {
        bowl,
        // The narrow brim, a little down at the sides and peaked up before and behind.
        brim: formHatBrim(bowl, { reach: [0.34, 0.3, 0.26, 0.3, 0.36], fall: [0.02, -0.03, -0.07, -0.03, 0.03], bow: 0.01, lip: [0.03, 0.01], seg: 24 }),
        // The stalk: a short stub of the skull's point, bent back.
        comb: {
          kind: 'sweep', seg: [6, 2], region: 'comb', look: 'metal', ink: true,
          stations: [{ at: [0.0, top - 0.05], r: 0.07, rz: 1 }, { at: [-0.05, top + 0.05], r: 0.035, rz: 1 }, { at: [-0.13, top + 0.1], r: 0.025, rz: 1 }],
        },
      },
    };
  })(),
};

// The designs' keels seated on their parts.
for (const form of Object.values(DESIGN_FORMS)) formSeat(form);

/** The designs a helmet kind is drawn in (a kit's `head.design`; helmstyle.js `kettle`), each a form of DESIGN_FORMS. */
export const HELM_DESIGNS = {
  kettleHat: { a: 'kettleRidged', b: 'kettleBurgundian', c: 'salletGerman' },
  cabasset: { spanish: 'cabassetSpanish' },
};

/** The design form a helmet kind is drawn in for a choice (null: drawn as before). */
export function designFormOf(kind, choice) {
  const name = HELM_DESIGNS[kind]?.[choice];
  return name ? DESIGN_FORMS[name] : null;
}

/** Triangles a design is drawn with (before outlines). */
export function designTriangles(name) {
  return Object.values(DESIGN_FORMS[name].parts).reduce((sum, part) => {
    const [nu, nv] = formCuts(part);
    return sum + nu * nv * 2;
  }, 0);
}

// ---- The samurai's kabuto and masks --------------------------------------------------------------------------------------

/**
 * The kabuto's bowl (hachi), an oval dome of riveted plates fitted over the head like the gladiators' bowls (wardrobe.js
 * draws it, its ribs down the plates' joins and the tehen's ring at the top): its foot (the koshimaki) over the brow in
 * front and round the head just above the ears and the occiput, a lining's room (about 1.6 cm) inside, a little more over
 * the crown. The shikoro hangs from its foot, the peak (mabizashi) juts from it over the brow, the crest (maedate) stands
 * on it at `brow` (x, y). `front`, `side`, `back`: its foot's radius at the front, the sides and the back, and `footY` the
 * foot's height there; `top`, its crown's height.
 */
export const KABUTO_FORM = (() => {
  const bowl = formFitPart({ kind: 'loft', span: 1, seg: [24, 1], fit: { foot: [0.14, 0.1, 0.05, 0.03, 0.02], gap: 0.15, top: 0.22, rows: 10 } });
  const foot = bowl.stations[0];
  const last = HELM_HEAD_KEYS - 1;
  const browY = 0.32;
  return {
    bowl,
    front: foot.rad[0], side: foot.rad[last / 2], back: foot.rad[last],
    footY: { front: foot.y[0], side: foot.y[last / 2], back: foot.y[last] },
    top: bowl.stations.at(-1).y[0],
    brow: [formOutlineAt(formFitOutline(0, bowl.fit), browY), browY],
  };
})();

/**
 * How each of the samurai's masks is set on the face: drawn on a sphere (radius `R`; menpo.js, wardrobe.js), each of its
 * points is moved to stand `gap` off the face (HELM_HEAD) in the same direction round, its height mapped by `y`: heights
 * on the mask [as drawn, on the face] from the top down (its top edge, the eyes, the nose, the mouth, the chin's foot),
 * straight between. The oni somen covers the whole face, its top under the kabuto's foot, its eye holes over the eyes;
 * the half masks (menpo, ressei-men, tengu) from under the eyes, the nose over the nose, the mouth over the mouth, the chin
 * cupped under the chin. Relief stands off the mask as drawn.
 */
export const MASK_FITS = {
  oni: { R: 1.12, gap: 0.06, y: [[0.91, 0.3], [0.16, -0.07], [-0.37, -0.74], [-1.0, -1.42]] },
  ressei: { R: 1.1, gap: 0.06, y: [[0.27, -0.2], [-0.4, -0.74], [-1.06, -1.42]] },
  tengu: { R: 1.1, gap: 0.06, y: [[0.27, -0.2], [-0.4, -0.74], [-1.06, -1.42]] },
  // The masks as first drawn (`#masks=now`, or without the maps): the menpo and the oni's whole face.
  menpo: { R: 1.06, gap: 0.06, y: [[-0.067, -0.28], [-0.12, -0.45], [-0.34, -0.74], [-0.98, -1.42]] },
  oniFace: { R: 1.08, gap: 0.06, y: [[0.83, 0.3], [0.16, -0.07], [-0.04, -0.45], [-0.36, -0.74], [-0.94, -1.42]] },
};

/** The head's (HELM_HEAD) distance from the upright axis at height y, `azimuth` (rad) round from the face. */
export function headRadiusAt(azimuth, y) {
  const s = Math.min(1, Math.abs(azimuth) / HELM_PI);
  const rows = HELM_HEAD.rows;
  if (y <= rows[0][0]) return formKeyed(rows[0][1], s);
  for (let index = 1; index < rows.length; index += 1) {
    const [y1, keys1] = rows[index];
    if (y <= y1) {
      const [y0, keys0] = rows[index - 1];
      const a = formKeyed(keys0, s);
      return a + ((formKeyed(keys1, s) - a) * (y - y0)) / (y1 - y0);
    }
  }
  const [yTop, keysTop] = rows.at(-1);
  const share = Math.min(1, (y - yTop) / (HELM_HEAD.crown - yTop));
  return formKeyed(keysTop, s) * Math.sqrt(Math.max(0, 1 - share * share));
}

/** A point of a mask as drawn (head radii, on or off its sphere: MASK_FITS) set on the face. */
export function maskOnFace(fit, [x, y, z]) {
  let segment = 1;
  while (segment < fit.y.length - 1 && y < fit.y[segment][0]) segment += 1;
  const [[a0, b0], [a1, b1]] = [fit.y[segment - 1], fit.y[segment]];
  const height = b0 + ((b1 - b0) * (y - a0)) / (a1 - a0);
  const azimuth = Math.atan2(z, x);
  const off = Math.hypot(x, z) - Math.sqrt(Math.max(0, fit.R * fit.R - y * y));
  const radius = headRadiusAt(azimuth, height) + fit.gap + off;
  return [radius * Math.cos(azimuth), height, radius * Math.sin(azimuth)];
}

/** The sheet regions (u0, v0, u1, v1; v up) the parts lay their coordinates into, by the sheet's kind. */
export const FORM_REGIONS = {
  brimmed: { bowl: [0, 0.6, 1, 1], brim: [0, 0.42, 1, 0.6], visor: [0, 0, 0.46, 0.42], crest: [0.46, 0.14, 1, 0.42], tube: [0.46, 0, 1, 0.14] },
  closed: { shell: [0, 0.3, 1, 1], crest: [0, 0, 1, 0.3] },
};

/** A helmet's regions (its sheet's layout). */
export const formRegions = (style) => DESIGN_FORMS[style]?.regions ?? (HELM_FORMS[style].parts.shell ? FORM_REGIONS.closed : FORM_REGIONS.brimmed);

// ---- The surfaces ------------------------------------------------------------------------------------------------------

/** Catmull-Rom between b and c (a before, d after) at t. */
function formSpline(a, b, c, d, t) {
  return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
}

/** A value smoothly formAlong a list at k (0..length-1), the ends held. */
function formAlong(values, k) {
  const n = values.length;
  if (n === 1) return values[0];
  const i = Math.min(n - 2, Math.max(0, Math.floor(k)));
  const t = k - i;
  const at = (j) => values[Math.min(n - 1, Math.max(0, j))];
  return formSpline(at(i - 1), at(i), at(i + 1), at(i + 2), t);
}

/** Keys evenly from 0 to 1 (a number is the same all round), at s in 0..1, mirrored past both ends. */
function formKeyed(value, s) {
  if (typeof value === 'number') return value;
  const n = value.length;
  const k = Math.min(1, Math.max(0, s)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(k));
  const at = (j) => value[j < 0 ? -j : j > n - 1 ? 2 * (n - 1) - j : j];
  return formSpline(at(i - 1), at(i), at(i + 1), at(i + 2), k - i);
}

/** A loft's point at (u, v). */
function formLoftPoint(part, u, v) {
  const a = u * part.span * HELM_PI;
  const s = Math.abs(u);
  const k = v * (part.stations.length - 1);
  const rad = Math.max(0, formAlong(part.stations.map((st) => formKeyed(st.rad, s)), k));
  const y = formAlong(part.stations.map((st) => formKeyed(st.y, s)), k);
  return [rad * Math.cos(a), y, rad * Math.sin(a)];
}

/** A sweep's station at v: its bottom and top points and half-widths (a tube's made from its centre and radius). */
function formSweepStation(part, v) {
  const st = part.stations;
  const k = v * (st.length - 1);
  if (st[0].at) {
    const centre = (t) => [formAlong(st.map((s) => s.at[0]), t * (st.length - 1)), formAlong(st.map((s) => s.at[1]), t * (st.length - 1))];
    const c = centre(v);
    const e = 1e-3;
    const p0 = centre(Math.max(0, v - e));
    const p1 = centre(Math.min(1, v + e));
    const tx = p1[0] - p0[0];
    const ty = p1[1] - p0[1];
    const len = Math.hypot(tx, ty) || 1;
    const n = [-ty / len, tx / len];
    const r = formAlong(st.map((s) => s.r), k);
    const w = r * formAlong(st.map((s) => s.rz ?? 1), k);
    return { bottom: [c[0] - n[0] * r, c[1] - n[1] * r], top: [c[0] + n[0] * r, c[1] + n[1] * r], w, wt: w };
  }
  const pick = (key, j) => formAlong(st.map((s) => s[key][j]), k);
  const w = formAlong(st.map((s) => s.w), k);
  return { bottom: [pick('bottom', 0), pick('bottom', 1)], top: [pick('top', 0), pick('top', 1)], w, wt: formAlong(st.map((s) => s.wt ?? s.w), k) };
}

const formPow = (x, e) => Math.sign(x) * Math.abs(x) ** e;

/** A sweep's point at (u, v). */
function formSweepPoint(part, u, v) {
  const { bottom, top, w, wt } = formSweepStation(part, v);
  const phi = u * HELM_PI;
  const e = part.square ?? 1;
  const c = formPow(Math.cos(phi), e);
  const s = formPow(Math.sin(phi), e);
  const half = [(top[0] - bottom[0]) / 2, (top[1] - bottom[1]) / 2];
  const width = w + (wt - w) * (1 + Math.cos(phi)) / 2;
  return [(top[0] + bottom[0]) / 2 + half[0] * c, (top[1] + bottom[1]) / 2 + half[1] * c, width * s];
}

/** The height of a loft's surface in the middle plane at x (in front, x > 0, or behind), its topmost where it rises twice. */
function formMidline(part, x) {
  if (Math.abs(x) < 1e-6) return formLoftPoint(part, 0, 1)[1];
  const u = x > 0 ? 0 : 1;
  const steps = 400;
  let best = -Infinity;
  let last = formLoftPoint(part, u, 0);
  for (let step = 1; step <= steps; step += 1) {
    const point = formLoftPoint(part, u, step / steps);
    const [x0, x1] = [last[0], point[0]];
    if ((x0 - x) * (x1 - x) <= 0 && x0 !== x1) best = Math.max(best, last[1] + ((point[1] - last[1]) * (x - x0)) / (x1 - x0));
    last = point;
  }
  return best;
}

/** A part's point at (u, v) in head radii. */
export function formPoint(part, u, v) {
  return part.kind === 'loft' ? formLoftPoint(part, u, v) : formSweepPoint(part, u, v);
}

/** How many cuts round (u) and formAlong (v) a part's grid has. */
export function formCuts(part) {
  const [round, sub] = part.seg;
  return [round, (part.stations.length - 1) * sub];
}

/** Whether a sweep's grid, wound plainly (u then v), would face inward (its spine run back to front or front to back). */
function formFacesIn(part) {
  const e = 1e-3;
  const p = formSweepPoint(part, 0, 0.5);
  const pu = formSweepPoint(part, e, 0.5);
  const pv = formSweepPoint(part, 0, 0.5 + e);
  const du = pu.map((x, i) => x - p[i]);
  const dv = pv.map((x, i) => x - p[i]);
  const normal = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
  const { bottom, top } = formSweepStation(part, 0.5);
  const out = [p[0] - (top[0] + bottom[0]) / 2, p[1] - (top[1] + bottom[1]) / 2, p[2]];
  return normal[0] * out[0] + normal[1] * out[1] + normal[2] * out[2] < 0;
}

/**
 * A part's mesh as plain arrays: `positions` (head radii), `uvs` (|u|, v), `indices`, wound so the faces look out (a
 * loft's stations from its foot up, a sweep's sections from the top round). `flip` turns them over.
 */
export function formGrid(part) {
  const [nu, nv] = formCuts(part);
  const positions = [];
  const uvs = [];
  for (let j = 0; j <= nv; j += 1) {
    for (let i = 0; i <= nu; i += 1) {
      const u = -1 + (2 * i) / nu;
      const v = j / nv;
      positions.push(...formPoint(part, u, v));
      uvs.push(Math.abs(u), v);
    }
  }
  const indices = [];
  const reverse = (part.kind === 'loft' ? true : formFacesIn(part)) !== !!part.flip;
  const row = nu + 1;
  for (let j = 0; j < nv; j += 1) {
    for (let i = 0; i < nu; i += 1) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row + 1;
      const d = a + row;
      if (reverse) indices.push(a, c, b, a, d, c);
      else indices.push(a, b, c, a, c, d);
    }
  }
  return { positions, uvs, indices };
}

/** Triangles a helmet's parts are drawn with (before outlines). */
export function formTriangles(style) {
  return Object.values(HELM_FORMS[style].parts).reduce((sum, part) => {
    const [nu, nv] = formCuts(part);
    return sum + nu * nv * 2;
  }, 0);
}

/**
 * The visors' grilles (the maps cut them; helmforms.py), in the face's front view (z across, y up, head radii): `disc`, a
 * round panel of linked holes over each eye (the thraex's and hoplomachus's, Pompeii); `panel`, a broad grille over each
 * half of the upper face from beside the middle seam round to the hinge (the murmillo's, British Museum 1946,0514.1). `y`,
 * `z`, `r`: a disc standing for it where the maps are off. `pitch`, `hole`: the holes' spacing and radius.
 */
export const FORM_GRILLES = {
  disc: { shape: 'disc', y: -0.02, z: 0.36, r: 0.33, pitch: 0.07, hole: 0.023 },
  panel: { shape: 'panel', y: -0.08, z: 0.44, r: 0.38, box: [0.06, -0.56, 0.84, 0.3], round: 0.2, pitch: 0.066, hole: 0.022 },
};

/** The point of a facing surface (a visor or a shell) seen from the front at height y and across z, and its outward normal. */
export function formFacing(part, y, z) {
  let best = null;
  const steps = 96;
  for (let i = 0; i <= steps; i += 1) {
    for (let j = 0; j <= steps; j += 1) {
      const u = -1 + (2 * i) / steps;
      const v = j / steps;
      const p = formPoint(part, u, v);
      if (p[0] <= 0) continue;
      const d = (p[1] - y) ** 2 + (p[2] - z) ** 2;
      if (!best || d < best.d) best = { d, u, v, p };
    }
  }
  const e = 1e-3;
  const pu = formPoint(part, best.u + e, best.v);
  const pv = formPoint(part, best.u, Math.min(1, best.v + e));
  const du = pu.map((x, i) => x - best.p[i]);
  const dv = pv.map((x, i) => x - best.p[i]);
  const normal = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
  const length = (Math.hypot(...normal) || 1) * (normal[0] < 0 ? -1 : 1);
  return { at: best.p, normal: normal.map((x) => x / length) };
}
