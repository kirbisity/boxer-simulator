// The skin's fine anatomy as rules, for round two's textured body styles
// (bodystyles.js v1..v6): for each loft part, at a place along it and an
// angle round it, how high the skin stands over the broad form (metres:
// the abdominal blocks, the ribs, the collarbones, the scapulae, the
// muscles' separations, the joints' knobs, the folds of fat) and what it
// looks like there (`marks`: a crease's darkness, a vein, a stretch mark, a
// flush). The texture maker (skintex.js) turns the height into a normal map
// and cavity shading, the marks into colour; a style that wants some of it
// in the mesh as well bends the loft by `rulesShape`.
//
// Round one's sculpt rules (sculpt.js) drew the ribs and abs as waves round
// the whole trunk, which read as ripples on a tube. Here each feature is a
// shape with edges where the anatomy has them: the rectus as three rows of
// domed blocks either side of a linea alba, with the long lower segment
// below the navel; each rib a band with its groove above it, only between
// the costal arch and the armpit, never over the breastbone or the belly;
// the pectoral's lower edge a shelf, the serratus a row of fingers. The
// silhouette's own features (the starved belly sunk under the ribs, the
// cage's arch) are in `silhouetteOffset`, for the mesh.
//
// Coordinates are the loft's: a trunk's u runs 0 at the hip joint to 1 at
// the base of the neck, a limb's t 0 at its root to 1 at its far joint; the
// angle is 0 at the front, the loft's own (see sculpt.js). No Three.js.

import { sculptTraits } from './sculpt.js';

// Where the landmarks are (u up the trunk: 0 the hip joint, 1 the base of the neck), measured on an emaciated reference figure
// (fractions of standing height: the jugular notch and collarbones 0.81, the xiphoid 0.69, the lowest rib margin 0.64, the waist
// 0.60, the iliac crest 0.58, the crotch 0.49) and carried to this rig's trunk (hip joint at 0.53 of the height, neck at 0.80).
export const LANDMARKS = { clavicle: 0.98, notch: 1.0, xiphoid: 0.59, archSide: 0.41, waist: 0.26, navel: 0.26, crest: 0.185, asis: 0.075, pecEdge: 0.665, nipple: 0.7, scapulaTop: 0.93, scapulaLow: 0.62, ribTop: 0.95 };

export const RULES = {
  // Ribs: spacing (u), how much lower a rib's front end is than its back (u), and how many show.
  ribSpacing: 0.041,
  ribDroop: 0.12,
  // The costal arch: its height at the breastbone (the xiphoid) and at the side.
  archFront: 0.59,
  archSide: 0.41,
  // The rectus: its column's inner and outer edge (angle from the front) and its rows (u, lowest first).
  absInner: 0.04,
  absOuter: 0.4,
  absRows: [[0.0, 0.25], [0.265, 0.37], [0.38, 0.48], [0.49, 0.585]],
  // The pectoral's lower edge (u at the breastbone) and how much it rises towards the armpit.
  pecEdge: 0.665,
  pecRise: 0.05,
  // Most a rule stands out or in (m).
  most: 0.016,
};

const rClamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const rSmooth = (low, high, x) => {
  const t = rClamp((x - low) / (high - low));
  return t * t * (3 - 2 * t);
};
const rHump = (x, centre, width) => Math.exp(-(((x - centre) / width) ** 2));
/** A soft plateau: 1 between `low` and `high`, falling to 0 over `edge` outside them. */
const rBand = (x, low, high, edge) => rSmooth(low - edge, low, x) * (1 - rSmooth(high, high + edge, x));
const fromFront = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
/** Signed distance from (x, y) to the triangle a, b, c (negative inside). */
function triangleDistance(x, y, a, b, c) {
  const edge = Math.min(rSegmentDistance(x, y, a[0], a[1], b[0], b[1]), rSegmentDistance(x, y, b[0], b[1], c[0], c[1]), rSegmentDistance(x, y, c[0], c[1], a[0], a[1]));
  const side = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const s1 = side(a, b);
  const s2 = side(b, c);
  const s3 = side(c, a);
  const inside = (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
  return inside ? -edge : edge;
}

/** Distance (in the same units) from (x, y) to the segment a..b. */
function rSegmentDistance(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = rClamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1e-9));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/**
 * A smooth curve through [u, value] stops (monotone cubic: it never overshoots a stop), held flat past the ends. The loft's own
 * profiles ease from stop to stop instead, flat at each: a band round the part at every stop.
 */
export function rulesProfile(stops) {
  const count = stops.length;
  const slopes = stops.map((stop, index) => {
    if (index === 0 || index === count - 1) return 0;
    const [u0, v0] = stops[index - 1];
    const [u1, v1] = stop;
    const [u2, v2] = stops[index + 1];
    const left = (v1 - v0) / (u1 - u0 || 1e-9);
    const right = (v2 - v1) / (u2 - u1 || 1e-9);
    if (left * right <= 0) return 0;
    // Weighted harmonic mean of the two sides (Fritsch-Butland): monotone.
    const w1 = 2 * (u2 - u1) + (u1 - u0);
    const w2 = (u2 - u1) + 2 * (u1 - u0);
    return (w1 + w2) / (w1 / left + w2 / right);
  });
  return (u) => {
    if (u <= stops[0][0]) return stops[0][1];
    for (let index = 1; index < count; index += 1) {
      const [u0, v0] = stops[index - 1];
      const [u1, v1] = stops[index];
      if (u > u1) continue;
      const span = u1 - u0 || 1e-9;
      const t = (u - u0) / span;
      const t2 = t * t;
      const t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * v0 + (t3 - 2 * t2 + t) * span * slopes[index - 1] + (-2 * t3 + 3 * t2) * v1 + (t3 - t2) * span * slopes[index];
    }
    return stops[count - 1][1];
  };
}

/**
 * What the body shows, from its make-up (sculpt.js traits): shares between 0 and 1.
 * `defined` muscle edges through the skin, `ribs` the ribs, `abs` the blocks, `bony` bone everywhere, `heavy` fat's folds,
 * `veins` an arm's veins, `stretch` stretch marks, `cellulite` the dimpling of a fat thigh.
 */
export function rulesTraits(body) {
  const traits = sculptTraits(body);
  const { female, developed: dev } = traits;
  const { fat, lean } = traits.trunk;
  const bony = traits.trunk.bony * (1 - 0.85 * rClamp(dev));
  const defined = rSmooth(0.02, 0.007, fat);
  const heavy = rSmooth(0.03, 0.08, fat);
  const age = body.inputs.age ?? 30;
  return {
    traits,
    female,
    dev,
    bony,
    rawBony: traits.trunk.bony,
    lean,
    fat,
    heavy,
    veryHeavy: rSmooth(0.07, 0.12, fat),
    defined,
    abs: rClamp(rSmooth(0.05, 0.45, dev) * defined + 0.35 * lean ** 2 * (1 - bony) * defined) * (female ? 0.6 : 1),
    // Ribs show through a starved or thin trunk, not a lean trained one (its lats and serratus cover them).
    ribs: lean ** 1.6 * rSmooth(0.22, 0.85, bony) * (female ? 0.85 : 1),
    veins: (female ? 0.4 : 1) * rClamp(traits.arm.lean ** 1.5 * (0.25 + 0.75 * rSmooth(0.1, 0.7, dev))),
    stretch: rSmooth(0.05, 0.11, fat) + 0.5 * rSmooth(0.7, 1.05, dev) * (female ? 0 : 1),
    cellulite: rSmooth(female ? 0.03 : 0.05, female ? 0.08 : 0.1, traits.thigh.fat),
    exercise: body.inputs.exercise,
    sag: rSmooth(40, 75, age),
  };
}

// ---- Trunk ---------------------------------------------------------------------------

/** The costal arch's height at an angle from the front (it climbs from the side up to the breastbone). */
const archAt = (fa) => RULES.archSide + (RULES.archFront - RULES.archSide) * (1 - rSmooth(0, 1.35, fa)) ** 0.8;

/** One rib: the band's profile at a share `x` (0..1) of the way from one rib's lower edge to the next: raised, then the groove above it. */
function ribProfile(x) {
  if (x < 0.58) return Math.sin((Math.PI * x) / 0.58) ** 0.75;
  return -0.45 * Math.sin((Math.PI * (x - 0.58)) / 0.42);
}

/**
 * The trunk's fine height (m) and marks at (u, angle): see the header.
 * @returns { h, crease, vein, stretch, flush }
 */
export function trunkRule(R, u, angle) {
  const signed = fromFront(angle);
  const fa = Math.abs(signed);
  const back = Math.PI - fa;
  let h = 0;
  let crease = 0;
  let stretch = 0;
  const { female, dev, bony, lean, heavy, defined } = R;

  // ---- The rectus: blocks either side of the linea alba.
  if (R.abs > 0.01) {
    const outer = RULES.absOuter - 0.03 * (1 - dev);
    // The muscle's belly: the whole column a little raised, soft at its edges.
    h += 0.002 * R.abs * rBand(fa, 0.02, outer - 0.02, 0.05) * rBand(u, 0.0, 0.59, 0.04);
    const across = rClamp((fa - 0.008) / (outer - 0.008));
    if (across > 0 && across < 1) {
      // Each block a cushion: round across and along, so the grooves between them (the linea alba, the tendinous bands) are soft valleys.
      const domeAcross = Math.sin(Math.PI * across) ** 0.55;
      let along = 0;
      RULES.absRows.forEach(([low, high], row) => {
        const share = (u - low) / (high - low);
        if (share <= 0 || share >= 1) return;
        // The long lower segment is flatter, under its fat.
        along = Math.max(along, Math.sin(Math.PI * share) ** 0.6 * (row === 0 ? 0.25 : 1));
      });
      h += 0.0042 * R.abs * domeAcross * along;
    }
    // The linea semilunaris: the column's outer edge, a shallow groove, and the obliques' swell beyond it.
    h -= 0.0018 * R.abs * rHump(fa, RULES.absOuter + 0.04, 0.035) * rBand(u, 0.0, 0.58, 0.05);
  }
  // Obliques over the hip, and the groove of the inguinal line (the V) from the hip's front spine to the pubis.
  if (lean > 0.05) {
    const v = rSegmentDistance(fa, u * 4, 1.02, 0.1 * 4, 0.24, -0.075 * 4);
    h -= 0.0045 * lean * (0.3 + 0.7 * dev) * defined * Math.exp(-((v / 0.09) ** 2));
    h += 0.003 * lean * dev * defined * rHump(fa, 1.1, 0.25) * rHump(u, 0.17, 0.06);
  }

  // ---- Ribs: bands between the arch and the armpit, sloping down to the front; none over the breastbone.
  if (R.ribs > 0.02) {
    // A rib runs down and out from the spine to the side, on down to the front, and its cartilage rises again to the breastbone.
    const droop = 0.15 * rSmooth(Math.PI - 0.1, Math.PI / 2, fa) + 0.045 * rSmooth(Math.PI / 2, 0.7, fa) - 0.06 * rSmooth(0.75, 0.2, fa);
    const w = (u + droop) / RULES.ribSpacing;
    const profile = ribProfile(w - Math.floor(w));
    const arch = fa < 1.9 ? archAt(fa) : RULES.archSide - 0.12 * rSmooth(1.9, 2.6, fa);
    const front = Math.cos(angle) > -0.2;
    const window = rSmooth(arch - 0.005, arch + 0.035, u)
      * (1 - rSmooth(front ? 0.9 : 0.86, front ? 0.97 : 0.93, u))
      * rSmooth(0.14, 0.3, fa)
      // The erectors either side of the spine cover the ribs there, and a trained man's lats the rest of the back.
      * rSmooth(0.22, 0.42, back)
      * (1 - 0.85 * rClamp(dev) * rSmooth(1.4, 2.0, fa))
      // The scapula lies over the upper ribs at the back, the pectoral over them in front (unless there is no pectoral to speak of).
      * (1 - 0.8 * rHump(back, 0.7, 0.45) * rHump(u, 0.78, 0.12))
      * (1 - (0.4 + 0.6 * dev) * (female ? 0.9 : 0.6) * rHump(u, 0.77, 0.09) * rHump(fa, 0.6, 0.45));
    h += 0.004 * R.ribs * window * profile;
  }
  // The costal arch: a ridge where the cage ends, the soft belly a little sunk below it.
  if (lean > 0.1) {
    const arch = archAt(fa);
    const near = 1 - rSmooth(1.5, 1.9, fa);
    h += (0.0016 + 0.003 * bony) * lean * rHump(u, arch, 0.016) * near;
    h -= 0.0025 * bony * (1 - rSmooth(arch - 0.05, arch - 0.005, u)) * rSmooth(0.14, 0.22, u) * near;
  }
  // The breastbone: a faint flat ridge in the bony, the pit at its foot (the xiphoid) and the notch at its head.
  h += 0.0015 * bony * rHump(fa, 0, 0.07) * rBand(u, 0.6, 0.97, 0.03);
  h -= 0.0025 * lean * rHump(fa, 0, 0.09) * rHump(u, RULES.archFront + 0.02, 0.02);
  h -= (0.002 + 0.006 * bony) * lean * rHump(fa, 0, 0.12) * rHump(u, 1.0, 0.025);

  // ---- Collarbones: the shaft climbing to the shoulder, hollows above and below it.
  {
    const shows = lean ** 1.2 * (0.35 + 0.65 * bony) * (1 - 0.6 * heavy);
    if (shows > 0.02 && Math.cos(angle) > -0.15) {
      const along = rClamp((fa - 0.14) / 1.3);
      const centre = 0.975 + 0.025 * along;
      const span = rSmooth(0.08, 0.2, fa) * (1 - rSmooth(1.35, 1.6, fa));
      h += (0.002 + 0.0045 * shows) * span * rHump(u, centre, 0.016);
      h -= (0.001 + 0.004 * bony) * shows * span * rHump(u, centre + 0.042, 0.02);
      h -= 0.0025 * bony * span * rHump(u, centre - 0.04, 0.022);
    }
  }

  // ---- The pectoral: its lower edge a shelf with a shadow under it, its lateral edge folding into the armpit, the groove down the middle.
  if (!female && dev > 0.05) {
    const amount = dev * (0.35 + 0.65 * defined) * (1 - 0.5 * heavy);
    const edge = RULES.pecEdge + RULES.pecRise * rSmooth(0.15, 1.15, fa);
    const across = rSmooth(0.05, 0.12, fa) * (1 - rSmooth(1.05, 1.3, fa));
    h += 0.0045 * amount * across * rSmooth(edge - 0.01, edge + 0.035, u) * (1 - rSmooth(0.9, 0.97, u));
    h -= 0.0035 * amount * across * rHump(u, edge - 0.012, 0.012);
    crease += 0.5 * amount * across * rHump(u, edge - 0.012, 0.01) * defined;
    h -= 0.0025 * amount * rHump(fa, 0, 0.045) * rBand(u, 0.62, 0.95, 0.03);
  }
  // Serratus: fingers along the side of a lean, trained cage, slanting down to the front.
  if (dev > 0.1 && lean > 0.2) {
    const amount = dev * lean * defined;
    for (const centre of [0.54, 0.585, 0.63]) {
      h += 0.0028 * amount * rHump(u - centre + 0.06 * (fa - 1.1), 0, 0.011) * rHump(fa, 1.12, 0.16);
    }
  }
  // A woman's bust: the fold under it.
  if (female) {
    const below = rHump(fa, 0.55, 0.4) * rHump(u, 0.63 - 0.03 * rClamp(R.fat / 0.06), 0.022);
    crease += (0.35 + 0.5 * rSmooth(0.01, 0.05, R.fat)) * below;
    h -= 0.002 * below;
  } else if (heavy > 0.2) {
    // A heavy man's chest: the fold under it.
    const below = rHump(fa, 0.6, 0.45) * rHump(u, 0.64, 0.024) * heavy;
    crease += 0.4 * below;
    h -= 0.003 * below;
  }

  // ---- The back.
  if (Math.cos(angle) < 0.15) {
    // The groove of the spine between the erectors (trained), the knobs of the spine (bony).
    const along = rBand(u, 0.06, 0.9, 0.05);
    h -= (0.0015 + 0.004 * dev * lean) * along * rHump(back, 0, 0.055);
    h += 0.0035 * lean * dev * defined * rHump(back, 0.2, 0.085) * rBand(u, 0.04, 0.45, 0.08);
    const knob = Math.max(0, Math.cos((u / 0.034) * Math.PI * 2)) ** 2;
    h += 0.0032 * bony * lean * along * knob * rHump(back, 0, 0.05);
    // The scapula: its medial edge and lower point a ridge with a shadow inside it, its spine a ridge to the shoulder; winged when starved.
    // (In a plane of the angle from the spine and three times u, so a triangle there is the blade's shape on the back.)
    const plate = triangleDistance(back, u * 3, [0.36, 0.93 * 3], [0.5, 0.62 * 3], [1.1, 0.9 * 3]);
    const spine = rSegmentDistance(back, u * 3, 0.38, 0.89 * 3, 1.05, 0.96 * 3);
    const blade = (0.001 + 0.007 * bony + 0.0015 * dev) * lean;
    h += blade * rSmooth(0.12, -0.12, plate);
    // The shadow along its medial edge and under its lower point (a starved man's wing), soft.
    h -= (0.25 + 0.5 * bony) * blade * rHump(plate, 0.13, 0.09) * rSmooth(0.9, 0.45, back);
    h += 0.6 * blade * Math.exp(-((spine / 0.06) ** 2));
    // Trained: the lats' edge, the trapezius's lower edge: broad, faint.
    const latEdge = rSegmentDistance(fa, u * 3, 1.7, 0.35 * 3, 2.55, 0.62 * 3);
    h -= 0.0014 * dev * defined * Math.exp(-((latEdge / 0.12) ** 2));
    const trapEdge = rSegmentDistance(back, u * 3, 0.0, 0.45 * 3, 0.45, 0.88 * 3);
    h -= 0.0012 * dev * defined * Math.exp(-((trapEdge / 0.11) ** 2));
    // The dimples over the sacrum.
    h -= 0.0025 * lean * rHump(back, 0.33, 0.07) * rHump(u, 0.07, 0.025);
    // Rolls across the back of a heavy one.
    if (heavy > 0.1) {
      for (const at of [0.37, 0.5]) {
        const fold = rHump(u, at, 0.012) * rSmooth(1.4, 2.2, fa);
        h -= 0.004 * heavy * fold;
        crease += 0.45 * heavy * fold;
      }
    }
  }

  // ---- Fat: the navel, the fold under the belly, the flank's fold, stretch marks.
  {
    const navel = rHump(fa, 0, 0.055) * rHump(u, 0.26, 0.013 + 0.008 * heavy);
    h -= (0.0025 + 0.006 * heavy) * navel;
    crease += (0.4 + 0.5 * heavy) * navel;
    if (heavy > 0.05) {
      const apron = rHump(u, 0.07 - 0.04 * R.veryHeavy, 0.024) * (1 - rSmooth(1.4, 1.9, fa));
      crease += heavy * apron;
      h -= 0.004 * heavy * apron;
      const flank = rHump(u, 0.31, 0.013) * rHump(fa, 1.45, 0.5);
      crease += 0.5 * heavy * flank;
      h -= 0.002 * heavy * flank;
    }
    if (R.stretch > 0.02) {
      // Marks across the belly's sides and the flanks (a bodybuilder's run from the chest to the shoulder).
      const lines = Math.max(0, Math.sin((u * 40 + 0.6 * Math.sin(fa * 7)) * Math.PI * 2) - 0.7) / 0.3;
      const where = rHump(fa, 1.05, 0.35) * rBand(u, 0.1, 0.4, 0.06) * rSmooth(0.05, 0.11, R.fat) + (female ? 0 : rSmooth(0.7, 1.05, dev) * rHump(fa, 1.15, 0.2) * rHump(u, 0.8, 0.04));
      stretch += rClamp(R.stretch) * lines * where;
    }
  }
  // The armpit's hollow at the top of the side.
  crease += 0.6 * rHump(fa, 1.62, 0.22) * rHump(u, 0.86, 0.04);
  return { h: rClamp(h, -RULES.most, RULES.most), crease: rClamp(crease), vein: 0, stretch: rClamp(stretch), flush: 0 };
}

/**
 * The large features that change the outline (m out from the broad form): the starved belly sunk under the arch of the ribs, the
 * cage standing out over it, the collarbones and the shoulder blades. The mesh carries these; the maps the rest.
 */
export function trunkSilhouette(R, u, angle) {
  const fa = Math.abs(fromFront(angle));
  const back = Math.PI - fa;
  const { bony, lean, heavy } = R;
  let out = 0;
  if (bony > 0.05) {
    const arch = archAt(fa);
    const below = 1 - rSmooth(arch - 0.07, arch + 0.005, u);
    out -= 0.026 * bony * below * rSmooth(0.1, 0.2, u) * (1 - rSmooth(0.9, 1.55, fa)) * (1 - heavy);
    out += 0.005 * bony * rHump(u, arch + 0.01, 0.025) * (1 - rSmooth(0.2, 1.6, fa));
    // The cage itself: the starved chest is a barrel of bone, the waist pinched under it.
    out -= 0.01 * bony * rHump(u, 0.27, 0.07) * rSmooth(0.9, 1.5, fa) * (1 - rSmooth(2.2, 2.8, fa));
  }
  if (lean > 0.1) {
    // Collarbones and the shoulder blades, which stand out of a thin back.
    const along = rClamp((fa - 0.14) / 1.3);
    out += 0.004 * lean * (0.3 + 0.7 * bony) * rSmooth(0.1, 0.25, fa) * (1 - rSmooth(1.35, 1.6, fa)) * rHump(u, 0.975 + 0.025 * along, 0.02) * (Math.cos(angle) > -0.15 ? 1 : 0);
    out += (0.002 + 0.008 * bony) * lean * rHump(back, 0.62, 0.3) * rHump(u, 0.78, 0.1);
  }
  return out;
}

// ---- Neck ----------------------------------------------------------------------------------

/** The neck's (t: -0.05 at the root to 0.6 at the head): the cords, the Adam's apple, the bands of the thin and the folds of the heavy. */
export function neckRule(R, t, angle) {
  const fa = Math.abs(fromFront(angle));
  const { female, bony, lean, heavy } = R;
  const cords = lean * (0.3 + 0.7 * bony) + 0.3 * R.dev;
  let h = 0;
  let crease = 0;
  // The sternocleidomastoids, from behind the ear down to the notch, a hollow between them at the root.
  h += 0.004 * cords * rHump(fa, 0.6 + 0.35 * rClamp(t / 0.6), 0.2) * rBand(t, -0.02, 0.55, 0.08);
  h -= 0.003 * cords * rHump(fa, 0, 0.2) * rHump(t, 0.02, 0.07);
  h -= 0.0025 * bony * rHump(fa, 1.15, 0.2) * rBand(t, 0.0, 0.4, 0.08);
  if (!female) h += 0.0035 * lean * rHump(fa, 0, 0.13) * rHump(t, 0.32, 0.06);
  // Folds across the front and the nape of a heavy neck.
  if (heavy > 0.1) {
    for (const at of [0.22, 0.42]) {
      const fold = rHump(t, at, 0.022);
      h -= 0.003 * heavy * fold;
      crease += 0.55 * heavy * fold;
    }
  }
  return { h: rClamp(h, -RULES.most, RULES.most), crease: rClamp(crease), vein: 0, stretch: 0, flush: 0 };
}

// ---- Limbs ---------------------------------------------------------------------------------------

/** A wandering vein's closeness (0..1) at (t, angle), over `bases` (angles at which veins run), within a window along the part. */
function veinAt(t, signed, bases, outer, radius, window, seed) {
  let strongest = 0;
  bases.forEach((base, index) => {
    const centre = base * outer + 0.28 * Math.sin(4.7 * t + index * 1.9 + seed) + 0.12 * Math.sin(12.1 * t + index * 2.3);
    let delta = signed - centre;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const across = (delta * radius) / 0.0022;
    strongest = Math.max(strongest, Math.exp(-across * across));
  });
  // A branch: a shorter vein joining at a slant.
  return strongest * window;
}

/**
 * A limb part's fine height and marks: `kind` upper, fore, thigh or shin; `side` 'l' or 'r'.
 * `outer` follows sculpt.js: +1 where the ring's width axis points away from the body.
 */
export function limbRule(R, kind, side, t, angle) {
  const signed = fromFront(angle);
  const fa = Math.abs(signed);
  const outer = side === 'l' ? 1 : -1;
  const out = Math.sin(angle) * outer;
  const part = R.traits[{ upper: 'arm', fore: 'fore', thigh: 'thigh', shin: 'shank' }[kind]];
  const { bony, lean } = part;
  const muscle = R.dev * lean;
  const defined = rSmooth(0.016, 0.005, part.fat);
  let h = 0;
  let crease = 0;
  let vein = 0;
  let flush = 0;
  let stretch = 0;
  if (kind === 'upper') {
    // The deltoid's lower edge: a V pointing down the outside of the arm to its insertion.
    const insertion = 0.42 - 0.18 * rClamp(Math.abs(Math.abs(signed) - Math.PI / 2) / 1.3);
    h -= 0.003 * muscle * defined * rHump(t, insertion, 0.035) * rSmooth(-0.6, 0.2, out);
    h += 0.0025 * muscle * defined * rSmooth(insertion + 0.02, insertion - 0.08, t) * rSmooth(-0.4, 0.3, out);
    // Biceps in front, triceps behind, the groove between them inside and out; the triceps' horseshoe.
    h -= 0.0028 * muscle * defined * rHump(fa, Math.PI / 2, 0.16) * rBand(t, 0.35, 0.85, 0.12);
    h += 0.002 * muscle * defined * rHump(fa, 0, 0.5) * rHump(t, 0.6, 0.15);
    h -= 0.002 * muscle * defined * rHump(Math.PI - fa, 0, 0.35) * rHump(t, 0.7, 0.05);
    // Elbow: the point behind, its wrinkles in the bony, the crease in front.
    h += (0.001 + 0.004 * bony) * rHump(t, 0.98, 0.04) * rHump(Math.PI - fa, 0, 0.6);
    const wrinkles = Math.max(0, Math.sin(t * 160)) * rHump(t, 0.97, 0.03) * rHump(Math.PI - fa, 0, 0.5);
    h -= 0.0006 * (0.4 + bony) * wrinkles;
    crease += 0.35 * wrinkles * (0.4 + bony) + 0.55 * rHump(t, 0.985, 0.02) * rHump(fa, 0, 0.6);
    flush += rHump(t, 0.99, 0.05) * rHump(Math.PI - fa, 0, 0.7);
    // The armpit.
    crease += 0.55 * rSmooth(0.12, -0.08, t) * rSmooth(-0.1, -0.7, out);
    // Veins: the cephalic outside the biceps, the basilic inside, on a lean, muscled arm.
    if (R.veins > 0.02) vein = R.veins * veinAt(t, signed, [0.45, -0.75], outer, 0.04, rBand(t, 0.3, 0.95, 0.12), 1.3);
    // Fat's stretch marks inside the upper arm; a bodybuilder's over the front of the shoulder.
    stretch += rClamp(R.stretch) * Math.max(0, Math.sin((t * 34 + fa * 0.8) * Math.PI * 2) - 0.75) / 0.25 * rSmooth(-0.2, -0.8, out) * rBand(t, 0.15, 0.6, 0.1) * rSmooth(0.03, 0.06, part.fat);
  } else if (kind === 'fore') {
    // The brachioradialis's swell high on the outer front, the groove between the flexors and the extensors.
    h += 0.003 * muscle * defined * rHump(signed * outer, 0.6, 0.45) * rHump(t, 0.2, 0.13);
    h -= 0.0022 * muscle * defined * rHump(fa, Math.PI / 2 + 0.2, 0.15) * rBand(t, 0.1, 0.65, 0.1);
    // Wrist: the bone's knob outside, tendons and creases inside.
    h += (0.001 + 0.004 * bony) * rHump(t, 0.95, 0.04) * rHump(signed * outer, Math.PI * 0.6, 0.4);
    crease += 0.4 * rHump(t, 0.93, 0.012) * rHump(fa, 0, 0.6) + 0.3 * rHump(t, 0.02, 0.03) * rHump(fa, 0, 0.6);
    flush += 0.5 * rHump(t, 0.02, 0.06) * rHump(Math.PI - fa, 0, 0.7);
    if (R.veins > 0.02) {
      vein = R.veins * Math.max(
        veinAt(t, signed, [0.3, -0.5, 1.4], outer, 0.032, rBand(t, 0.08, 0.92, 0.08), 2.1),
        0.8 * veinAt(t, signed, [2.6, -2.4], outer, 0.032, rBand(t, 0.4, 0.95, 0.1), 4.2),
      );
    }
  } else if (kind === 'thigh') {
    // The quadriceps: the outer sweep, the rectus down the front, the teardrop above the knee inside; the groove of the IT band.
    h += 0.0035 * muscle * defined * rHump(signed * outer, 0.95, 0.38) * rHump(t, 0.5, 0.22);
    h += 0.0025 * muscle * defined * rHump(signed * outer, 0.05, 0.28) * rHump(t, 0.42, 0.22);
    h += 0.004 * muscle * defined * rHump(signed * outer, -0.75, 0.3) * rHump(t, 0.82, 0.08);
    h -= 0.0025 * muscle * defined * (rHump(signed * outer, 0.5, 0.06) * rBand(t, 0.2, 0.75, 0.12) + rHump(signed * outer, -0.35, 0.06) * rBand(t, 0.35, 0.8, 0.1));
    h -= 0.002 * muscle * defined * rHump(signed * outer, Math.PI / 2 + 0.15, 0.1) * rBand(t, 0.15, 0.8, 0.1);
    // The knee: the kneecap's outline, its tendon, the pads either side; the fold behind it.
    const cap = Math.hypot((t - 0.985) / 0.045, signed / 0.42);
    h += (0.0015 + 0.003 * bony) * rSmooth(1.25, 0.7, cap);
    h -= (0.0004 + 0.0012 * bony) * rHump(cap, 1.25, 0.32);
    crease += 0.55 * rHump(t, 1.0, 0.025) * rHump(Math.PI - fa, 0, 0.6);
    flush += 0.35 * rSmooth(1.4, 0.5, cap);
    // The buttock's fold behind, at the top of the thigh; the groin inside.
    crease += (0.45 + 0.4 * R.heavy) * rHump(t, 0.03, 0.03) * rHump(Math.PI - fa, 0, 0.75);
    crease += 0.5 * rSmooth(0.1, -0.08, t) * rSmooth(-0.1, -0.7, out);
    // Dimpling of fat.
    if (R.cellulite > 0.02) h -= 0.0009 * R.cellulite * dimples(t * 26, angle * 5.3) * rBand(t, 0.0, 0.7, 0.15) * rSmooth(-0.2, -0.9, Math.cos(angle) * 1 + out * 0.3);
    stretch += rClamp(R.stretch) * Math.max(0, Math.sin((t * 30 + fa) * Math.PI * 2) - 0.75) / 0.25 * rSmooth(-0.3, -0.8, out) * rBand(t, 0.05, 0.45, 0.1) * rSmooth(0.04, 0.07, part.fat);
  } else {
    // The calf's two heads (the inner lower), the line between them, the shin's crest, the Achilles and the ankle's knobs.
    h += 0.0035 * muscle * defined * (rHump(signed * outer, Math.PI - 0.5, 0.35) * rHump(t, 0.28, 0.1) + rHump(signed * outer, -(Math.PI - 0.55), 0.35) * rHump(t, 0.33, 0.11));
    h -= 0.002 * muscle * defined * rHump(Math.PI - fa, 0, 0.12) * rBand(t, 0.15, 0.45, 0.08);
    h += (0.001 + 0.003 * bony) * rHump(signed, 0, 0.16) * rBand(t, 0.1, 0.85, 0.1);
    h += 0.003 * rHump(t, 0.93, 0.035) * rHump(fa, Math.PI / 2, 0.4) * (0.5 + 0.5 * lean);
    h -= 0.002 * lean * rHump(t, 0.8, 0.12) * rHump(Math.PI - fa, 0.45, 0.2);
    flush += 0.4 * rHump(t, 0.0, 0.05) * rHump(fa, 0, 0.8) + 0.3 * rHump(t, 0.95, 0.04);
  }
  return { h: rClamp(h, -RULES.most, RULES.most), crease: rClamp(crease), vein: rClamp(vein), stretch: rClamp(stretch), flush: rClamp(flush) };
}

/** Soft dimples (0..1) on a grid of jittered cells: the orange peel of fat over a thigh or a buttock. */
function dimples(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let best = 9;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const cx = ix + dx;
      const cy = iy + dy;
      const jx = cx + rHash(cx, cy, 3);
      const jy = cy + rHash(cx, cy, 5);
      best = Math.min(best, Math.hypot(x - jx, y - jy));
    }
  }
  return rSmooth(0.55, 0.1, best);
}

function rHash(x, y, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The rule for a tile of the atlas (skindetail.js DETAIL_TILES): (t, angle) => { h, crease, vein, stretch, flush }. */
export function ruleForTile(R, tile) {
  if (tile.span === 'trunk') return (t, angle) => trunkRule(R, t, angle);
  if (tile.span === 'neck') return (t, angle) => neckRule(R, t, angle);
  return (t, angle) => limbRule(R, tile.kind, tile.side, t, angle);
}

/**
 * A loft part's shape from the rules (sculpt.js's hook: (ring, angle) => multiplier of the ring's radius), for a style that puts
 * `share` of the fine height (and all the silhouette) in the mesh. `part`: 'trunk', 'neck', or a limb kind with its side.
 */
export function rulesShape(R, part, side, share, base = null, covers = null) {
  const radius = (ring, angle) => Math.hypot(Math.cos(angle) * ring.depth, Math.sin(angle) * ring.width) || 1e-6;
  const fine = part === 'trunk' ? (t, a) => trunkRule(R, t, a).h : part === 'neck' ? (t, a) => neckRule(R, t, a).h : (t, a) => limbRule(R, part, side, t, a).h;
  const outline = part === 'trunk' ? (t, a) => trunkSilhouette(R, t, a) : () => 0;
  // The trunk's apron (below u -0.06) is left to the broad form.
  const reach = part === 'trunk' ? (t) => rSmooth(-0.125, -0.06, t) : () => 1;
  return (ring, angle) => {
    const own = base ? base(ring, angle) : 1;
    const cover = covers ? covers(ring.t) : 1;
    const offset = (outline(ring.t, angle) + share * fine(ring.t, angle)) * reach(ring.t) * cover;
    return Math.min(1.45, Math.max(0.55, own + offset / radius(ring, angle)));
  };
}
