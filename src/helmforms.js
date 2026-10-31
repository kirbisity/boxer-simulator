// The gladiators' helmets as measured forms: every part a smooth surface given as data (stations of a profile), drawn by
// arenaview.js and unwrapped for the baked relief (tools/blender/helmforms.py reads the same surfaces through
// tools/helmforms-dump.mjs). Plain (no Three.js).
//
// Head coordinates as in arenaview.js and wardrobe.js: x forward, y up, z left, in head radii (r ≈ 11.5 cm), the head's
// centre at the origin, the chin near y = -1.45, the eyes near y = 0.15.
//
// Two kinds of surface, both symmetric about the face's middle (z = 0) and both parametrised by (u, v), u from -1 (right)
// to 1 (left) and v from 0 to 1; their texture coordinates are (|u|, v), so a sheet holds one half at twice the detail:
//
//   loft   rings round the upright axis, u the angle (u · span · π from the front), v formAlong the stations. A station's
//          height `y` and radius `rad` are a number or K values evenly from the front (0) to the edge of the part
//          (span · π), interpolated smoothly round it; stations are interpolated smoothly formAlong v (each span cut `sub` times).
//   sweep  sections formAlong a spine in the middle plane, v formAlong the stations, u round the section (0 at the `top` side,
//          ±1 at the `bottom`). A station is a pair of points `bottom`/`top` (x, y) and a half-width `w` (`wt` at the top,
//          if it differs), or a tube's centre `at`, radius `r` and side-to-side ratio `rz`. `square` (< 1) squares the
//          section off (a box-like crest); 1 is an ellipse.
//
// Proportions from the surviving helmets (see helmmaps.js for the references): the Pompeii barracks finds in Naples (MANN
// inv. 5672-5674 murmillo, 5649 thraex, 5642 secutor) and the British Museum's murmillo (1946,0514.1, 46 cm high, about
// 3.5 kg); the Louvre's thraex from Pompeii (Br 1108, 38 cm). Where a helmet is 40-46 cm overall on a head of r = 11.5 cm,
// it spans about 4 r from the visor's foot to the crest's top.

const HELM_PI = Math.PI;

// ---- The forms ---------------------------------------------------------------------------------------------------------

// Where the bowl of a brimmed helmet ends and its brim begins, keys every eighth of a turn from the front: over the brow
// in front, falling past the ears at the sides to the nape behind (the brim is the helmet's neck guard).
const BRIM_FOOT = { y: [0.3, 0.12, -0.26, -0.58, -0.7], rad: [1.2, 1.22, 1.25, 1.27, 1.28] };
const formPlus = (keys, add) => keys.map((value, index) => value + (typeof add === 'number' ? add : add[index]));

// The bowl of the brimmed helmets (murmillo, thraex, hoplomachus): stations from its foot to its crown. `lift`: how much
// higher the crown stands (the thraex's is the taller).
const formBowl = (lift = 0) => ({
  kind: 'loft', span: 1, seg: [40, 3], region: 'bowl', look: 'metal', ink: true,
  stations: [
    BRIM_FOOT,
    { y: [0.8, 0.72, 0.56, 0.4, 0.34], rad: [1.18, 1.21, 1.23, 1.25, 1.26] },
    { y: 1.16 + lift * 0.5, rad: [0.96, 1.0, 1.02, 1.03, 1.04] },
    { y: 1.45 + lift, rad: [0.52, 0.56, 0.58, 0.58, 0.58] },
    { y: 1.53 + lift, rad: 0 },
  ],
});

// The brim, from the bowl's foot out to the rolled lip: turned up over the brow at the front (`peak`: how high, `front`:
// how far out it reaches), broad and near level at the sides (`side`), widest and sloping down behind (`back`, `droop`).
const formBrim = ({ peak, front, side, back, droop }) => {
  const out = [front, (front + side) / 2 + 0.05, side, (side + back) / 2 + 0.03, back];
  const fall = [peak, 0.04, -0.08, -droop * 0.7, -droop];
  const at = (share) => ({ y: formPlus(BRIM_FOOT.y, fall.map((value) => value * share)), rad: BRIM_FOOT.rad.map((value, index) => value + (out[index] - value) * share) });
  const outer = at(1);
  return {
    kind: 'loft', span: 1, seg: [48, 2], region: 'brim', look: 'metal', ink: true, double: true, flip: true,
    stations: [{ y: BRIM_FOOT.y, rad: formPlus(BRIM_FOOT.rad, -0.02) }, at(0.5), outer, { y: formPlus(outer.y, 0.07), rad: formPlus(outer.rad, 0.02) }],
  };
};

// The visor: two halves closing over the face from under the brim to below the chin, the foot flared over the throat;
// keys from the middle seam round to the hinges by the ears, where its top edge meets the brim's falling foot.
const formVisor = (top = 0.32) => ({
  kind: 'loft', span: 0.47, seg: [24, 3], region: 'visor', look: 'visor', ink: true, double: true,
  stations: [
    { y: [-1.58, -1.52, -1.38], rad: [1.32, 1.29, 1.22] },
    { y: [-1.3, -1.25, -1.15], rad: [1.2, 1.18, 1.14] },
    { y: [-0.7, -0.7, -0.68], rad: [1.31, 1.27, 1.2] },
    { y: [0.02, -0.04, -0.16], rad: [1.33, 1.3, 1.25] },
    { y: [top, top - 0.12, -0.2], rad: [1.25, 1.25, 1.27] },
  ],
});

// The side feathers in their tubes (thraex and hoplomachus): where the tube stands on the bowl, how many feathers.
const HELM_FEATHERS = { at: [-0.05, 0.86, 1.18], tilt: 0.3 };

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
      brim: formBrim({ peak: 0.32, front: 1.44, side: 1.86, back: 2.02, droop: 0.38 }),
      visor: formVisor(0.34),
      crest: {
        kind: 'sweep', seg: [12, 4], region: 'crest', look: 'metal', ink: true, square: 0.55,
        stations: [
          { bottom: [1.02, 1.0], top: [1.08, 1.12], w: 0.05 },
          { bottom: [0.86, 1.14], top: [1.22, 2.02], w: 0.1, wt: 0.17 },
          { bottom: [0.38, 1.36], top: [0.72, 2.4], w: 0.1, wt: 0.19 },
          { bottom: [-0.22, 1.42], top: [-0.02, 2.48], w: 0.1, wt: 0.19 },
          { bottom: [-0.8, 1.2], top: [-0.78, 2.3], w: 0.1, wt: 0.17 },
          { bottom: [-1.12, 0.78], top: [-1.32, 1.76], w: 0.09, wt: 0.14 },
          { bottom: [-1.2, 0.42], top: [-1.46, 0.98], w: 0.06 },
          { bottom: [-1.24, 0.34], top: [-1.32, 0.44], w: 0.03 },
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
      brim: formBrim({ peak: 0.5, front: 1.4, side: 1.74, back: 1.98, droop: 0.42 }),
      visor: formVisor(0.36),
      crest: {
        kind: 'sweep', seg: [12, 4], region: 'crest', look: 'metal', ink: true, square: 0.7,
        stations: [
          { bottom: [-1.18, 0.5], top: [-1.26, 0.62], w: 0.03 },
          { bottom: [-1.04, 0.86], top: [-1.24, 1.32], w: 0.08, wt: 0.1 },
          { bottom: [-0.5, 1.44], top: [-0.62, 2.02], w: 0.09, wt: 0.11 },
          { bottom: [0.16, 1.62], top: [0.2, 2.2], w: 0.09, wt: 0.11 },
          { bottom: [0.66, 1.46], top: [0.78, 2.14], w: 0.1, wt: 0.12 },
          { bottom: [0.86, 1.3], top: [0.98, 1.98], w: 0.1, wt: 0.12 },
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
      brim: formBrim({ peak: 0.42, front: 1.42, side: 1.78, back: 1.98, droop: 0.4 }),
      visor: formVisor(0.35),
      crest: {
        kind: 'sweep', seg: [8, 2], region: 'crest', look: 'metal', ink: true, square: 0.7,
        stations: [
          { bottom: [1.1, 0.8], top: [1.16, 0.92], w: 0.04 },
          { bottom: [0.92, 1.18], top: [1.06, 1.46], w: 0.08 },
          { bottom: [0.2, 1.55], top: [0.24, 1.86], w: 0.09 },
          { bottom: [-0.6, 1.4], top: [-0.68, 1.74], w: 0.09 },
          { bottom: [-1.1, 0.86], top: [-1.26, 1.14], w: 0.07 },
          { bottom: [-1.2, 0.5], top: [-1.3, 0.6], w: 0.03 },
        ],
      },
      plume: {
        kind: 'sweep', seg: [8, 3], region: null, look: 'hair', ink: false, square: 0.8,
        stations: [
          { at: [1.18, 1.5], r: 0.06, rz: 1 },
          { at: [0.98, 1.98], r: 0.2, rz: 0.6 },
          { at: [0.3, 2.42], r: 0.28, rz: 0.5 },
          { at: [-0.5, 2.36], r: 0.28, rz: 0.5 },
          { at: [-1.26, 1.72], r: 0.24, rz: 0.55 },
          { at: [-1.72, 0.92], r: 0.12, rz: 0.7 },
          { at: [-1.82, 0.5], r: 0.02, rz: 1 },
        ],
      },
    },
  },
  // Secutor (Pompeii MANN 5642): a smooth, closed egg of bronze that wraps the whole head, nothing standing out for a net
  // or a trident to catch: two small round eyeholes (about 3 cm), close together; a low, rounded crest from the brow to the
  // nape, standing only a few centimetres; the foot flaring into a short neck guard behind and at the sides.
  secutor: {
    sheet: 'formSecutor',
    eyes: { y: 0.18, z: 0.29, r: 0.12 },
    parts: {
      shell: {
        kind: 'loft', span: 1, seg: [48, 4], region: 'shell', look: 'metal', ink: true,
        stations: [
          { y: [-1.56, -1.52, -1.44, -1.5, -1.56], rad: [1.3, 1.38, 1.52, 1.72, 1.8] },
          { y: [-1.34, -1.32, -1.26, -1.24, -1.24], rad: [1.2, 1.24, 1.3, 1.37, 1.4] },
          { y: -0.7, rad: [1.28, 1.26, 1.2, 1.22, 1.24] },
          { y: 0.12, rad: [1.4, 1.34, 1.21, 1.25, 1.3] },
          { y: 0.82, rad: [1.24, 1.2, 1.1, 1.13, 1.18] },
          { y: 1.36, rad: [0.82, 0.8, 0.74, 0.76, 0.8] },
          { y: 1.64, rad: 0 },
        ],
      },
      crest: {
        kind: 'sweep', seg: [10, 4], region: 'crest', look: 'metal', ink: true,
        stations: [
          { bottom: [1.2, 0.72], top: [1.28, 0.82], w: 0.03 },
          { bottom: [1.04, 1.06], top: [1.18, 1.3], w: 0.06 },
          { bottom: [0.5, 1.48], top: [0.56, 1.86], w: 0.07 },
          { bottom: [-0.3, 1.54], top: [-0.32, 1.92], w: 0.07 },
          { bottom: [-0.92, 1.22], top: [-1.04, 1.56], w: 0.06 },
          { bottom: [-1.22, 0.6], top: [-1.38, 0.86], w: 0.05 },
          { bottom: [-1.3, 0.1], top: [-1.4, 0.2], w: 0.03 },
        ],
      },
    },
  },
  // Scissor (arbelas; no helmet survives: reliefs show a closed helmet like the secutor's): a rounder closed bowl, a low
  // ridge over the crown, two larger round eye openings with grilles, breathing holes below, a broad neck guard.
  scissor: {
    sheet: 'formScissor',
    eyes: { y: 0.16, z: 0.4, r: 0.2 },
    parts: {
      shell: {
        kind: 'loft', span: 1, seg: [36, 3], region: 'shell', look: 'metal', ink: true,
        stations: [
          { y: [-1.5, -1.48, -1.36, -1.28, -1.3], rad: [1.32, 1.42, 1.66, 1.92, 2.0] },
          { y: [-1.32, -1.3, -1.18, -1.06, -1.06], rad: [1.26, 1.3, 1.36, 1.44, 1.46] },
          { y: -0.5, rad: [1.4, 1.34, 1.28, 1.32, 1.34] },
          { y: 0.3, rad: [1.48, 1.4, 1.3, 1.34, 1.38] },
          { y: 1.0, rad: [1.14, 1.12, 1.08, 1.1, 1.12] },
          { y: 1.5, rad: 0.56 },
          { y: 1.62, rad: 0 },
        ],
      },
      crest: {
        kind: 'sweep', seg: [8, 2], region: 'crest', look: 'metal', ink: true,
        stations: [
          { bottom: [1.3, 0.74], top: [1.36, 0.84], w: 0.03 },
          { bottom: [0.9, 1.3], top: [0.98, 1.48], w: 0.06 },
          { bottom: [0.0, 1.58], top: [0.0, 1.78], w: 0.06 },
          { bottom: [-0.92, 1.28], top: [-1.02, 1.48], w: 0.06 },
          { bottom: [-1.3, 0.5], top: [-1.4, 0.62], w: 0.03 },
        ],
      },
    },
  },
};

/** The sheet regions (u0, v0, u1, v1; v up) the parts lay their coordinates into, by the sheet's kind. */
export const FORM_REGIONS = {
  brimmed: { bowl: [0, 0.6, 1, 1], brim: [0, 0.42, 1, 0.6], visor: [0, 0, 0.46, 0.42], crest: [0.46, 0.14, 1, 0.42], tube: [0.46, 0, 1, 0.14] },
  closed: { shell: [0, 0.3, 1, 1], crest: [0, 0, 1, 0.3] },
};

/** A helmet's regions (its sheet's layout). */
export const formRegions = (style) => (HELM_FORMS[style].parts.shell ? FORM_REGIONS.closed : FORM_REGIONS.brimmed);

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
  disc: { shape: 'disc', y: 0.1, z: 0.43, r: 0.36, pitch: 0.07, hole: 0.023 },
  panel: { shape: 'panel', y: -0.06, z: 0.5, r: 0.4, box: [0.06, -0.56, 1.02, 0.34], round: 0.2, pitch: 0.066, hole: 0.022 },
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
