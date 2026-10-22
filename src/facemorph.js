// The face follows the body (round two's body styles, bodystyles.js): the
// same make-up that draws the trunk (fat, muscle, how starved, age, sex,
// frame) bends the head and paints it. Starved: the cheeks and temples sink,
// the cheekbones, brow and jaw stand out, the eyes sit deep, the skin is pale
// and shadowed. Heavy: the cheeks fill and round, the jaw softens under jowls
// and a double chin, the eyes narrow over the cheeks, the face reddens.
// Trained men: a squarer jaw and a heavier brow.
//
// Two parts, both made once when the head is built (no cost a frame):
//   morphHeadPoint  a small displacement of the head mesh's points, in the
//                   head's unit space after face.js's own drawn shape (x
//                   forward, y up, z to the left, the radius 1): face.js runs
//                   every point of the skull, the hair and the beard through
//                   it, so hair and beards keep fitting;
//   faceMarks       the shading painted into the face's colour map: hollows
//                   under the cheekbones and round the eyes, the jowl's fold,
//                   the crease of the double chin, red cheeks or a pale face.
// The face rig (face.js `update`) moves only the drawn eyes, brows and mouth
// and the skin's colour, none of which this touches but the eyes' height
// (a fixed scale on the group the blink does not drive). No Three.js.

export const FACE_MORPH = {
  // The most any point moves (of the head's radius), so a morph never breaks the head or reaches through a helmet.
  most: 0.24,
  // The colour map's size (texels round, texels top to bottom) and its "no change" (a share of white, made up in the colour).
  map: [256, 128],
  neutral: 0.88,
};

const fClamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const fSmooth = (low, high, x) => {
  const t = fClamp((x - low) / (high - low));
  return t * t * (3 - 2 * t);
};
const fHump = (x, centre, width) => Math.exp(-(((x - centre) / width) ** 2));

/**
 * The morph's weights, each 0..1, from the body: `gaunt` (starved), `full` (fat in the face), `defined` (lean: bone and muscle
 * show), `square` (a trained man's jaw), `sag` (age). Hardcoded tendencies: a man's jaw squares with training and a large frame,
 * a woman's face carries a little more fat and squares less.
 */
export function faceMorphWeights(body) {
  const female = body.inputs.sex === 'female';
  const fat = body.inputs.bodyFat;
  const bmi = body.bodyMassKg / body.heightM ** 2;
  const exercise = body.inputs.exercise ?? 0;
  const frame = { small: -1, medium: 0, large: 1 }[body.inputs.frame] ?? 0;
  const smi = body.muscleKg / body.heightM ** 2;
  const offset = female ? 0.08 : 0;
  const gaunt = fSmooth(18.5, 14, bmi) * fSmooth(0.16 + offset, 0.06 + offset, fat);
  const full = fSmooth(0.2 + offset, 0.44 + offset, fat) * fSmooth(24, 34, bmi);
  const defined = fSmooth(0.17 + offset, 0.08 + offset, fat) * (1 - 0.6 * gaunt);
  const square = fClamp((female ? 0.25 : 1) * (0.55 * fSmooth(8, 12.5, smi) + 0.35 * exercise + 0.15 * frame)) * (1 - 0.5 * full);
  const sag = fSmooth(40, 75, body.inputs.age ?? 30);
  return { gaunt, full, defined, square, sag, female };
}

/**
 * A point of the head (unit space, after face.js's drawn shape) moved by the morph: [x, y, z]. Bounded by FACE_MORPH.most.
 */
export function morphHeadPoint(x, y, z, w) {
  const side = z >= 0 ? 1 : -1;
  const az = Math.abs(z);
  const { gaunt: g, full: f, defined: d, square: sq, sag } = w;
  let dx = 0;
  let dy = 0;
  let dz = 0;
  const front = fSmooth(0.0, 0.55, x);
  // Cheeks: sunk under the cheekbones when starved, full and round when heavy.
  const cheek = fHump(y, -0.45, 0.17) * fSmooth(0.25, 0.55, az) * front;
  dz += side * cheek * (-0.11 * g - 0.025 * d + 0.16 * f);
  dx += cheek * (-0.045 * g + 0.05 * f);
  // Cheekbones stand out of a thin face.
  const bone = fHump(y, -0.2, 0.09) * fHump(az, 0.68, 0.16) * front;
  dz += side * bone * (0.04 * g + 0.02 * d);
  // Temples sink.
  const temple = fHump(y, 0.15, 0.17) * fSmooth(0.5, 0.75, az) * fSmooth(0.1, 0.5, x);
  dz -= side * temple * 0.07 * g;
  // Deep-set eyes, and the brow over them (heavier on a trained man).
  const socket = fHump(y, -0.07, 0.11) * fHump(az, 0.36, 0.15) * fSmooth(0.5, 0.8, x);
  dx -= socket * 0.045 * g;
  const brow = fHump(y, 0.17, 0.08) * fSmooth(0.6, 0.15, az) * fSmooth(0.5, 0.8, x);
  dx += brow * (0.02 * g + 0.018 * sq * (w.female ? 0.3 : 1));
  // The lower face: rounder and wider with fat; the jaw's corners squarer on a trained man.
  const lower = fSmooth(-0.3, -0.75, y);
  dz += z * lower * (0.16 * f - 0.04 * g);
  const corner = fHump(y, -0.68, 0.14) * fSmooth(0.45, 0.75, az) * fSmooth(-0.4, 0.1, x);
  dz += side * corner * (0.055 * sq + 0.02 * d);
  const chin = fHump(y, -1.02, 0.12) * fSmooth(0.35, 0.05, az) * fSmooth(0.2, 0.7, x);
  dz += z * chin * 0.35 * sq;
  dx += chin * 0.02 * sq;
  // Jowls hang either side of the chin, with fat and age.
  const jowl = fHump(y, -0.78, 0.13) * fHump(az, 0.5, 0.17) * fSmooth(-0.1, 0.4, x);
  dz += side * jowl * (0.09 * f + 0.03 * sag);
  dy -= jowl * (0.07 * f + 0.04 * sag);
  // The double chin: the soft underside of the jaw pushed down and out.
  const under = fSmooth(-0.55, -0.95, y) * fHump(x, 0.15, 0.3) * fSmooth(0.75, 0.25, az);
  dy -= under * 0.2 * f;
  dx += under * 0.07 * f;
  // A heavy man's nape and the back of his jaw (his neck is the body's).
  const nape = fSmooth(-0.25, -0.7, y) * fSmooth(0.1, -0.5, x);
  dz += z * nape * 0.1 * f;
  dx -= nape * 0.06 * f;
  const length = Math.hypot(dx, dy, dz);
  const scale = length > FACE_MORPH.most ? FACE_MORPH.most / length : 1;
  return [x + dx * scale, y + dy * scale, z + dz * scale];
}

/**
 * The face's paint at a point of the head (unit space, after the shape and the morph): multipliers [r, g, b] on the skin colour
 * (1 is no change; the map stores them times FACE_MORPH.neutral).
 */
export function faceMarks(x, y, z, w) {
  const az = Math.abs(z);
  const { gaunt: g, full: f, defined: d, sag } = w;
  const front = fSmooth(0.1, 0.6, x);
  let dark = 0;
  let red = 0;
  // Every face: a little shadow in the eye sockets.
  const socket = fHump(y, -0.08, 0.12) * fHump(az, 0.36, 0.2) * fSmooth(0.45, 0.8, x);
  const ring = socket * (1 - fHump(y, -0.06, 0.05) * fHump(az, 0.36, 0.12));
  dark += ring * (0.05 + 0.3 * g);
  // Starved: hollows under the cheekbones and at the temples.
  dark += 0.16 * g * fHump(y, -0.47, 0.11) * fHump(az, 0.56, 0.1) * front;
  dark += 0.1 * g * fHump(y, 0.14, 0.13) * fSmooth(0.6, 0.85, az) * fSmooth(0.2, 0.55, x);
  // Lean: a shadow under the cheekbone and the jaw's edge.
  dark += 0.1 * d * fHump(y, -0.4, 0.1) * fHump(az, 0.66, 0.12) * front;
  dark += 0.08 * (d + g) * fHump(y, -0.82, 0.07) * fSmooth(0.45, 0.75, az);
  // Heavy: the jowl's fold from the cheek down beside the chin, the crease of the double chin, the folds beside the mouth.
  const jowlLine = Math.abs(az - (0.62 - 0.32 * fClamp((-0.6 - y) / 0.4)));
  dark += 0.16 * (f + 0.4 * sag) * Math.exp(-((jowlLine / 0.07) ** 2)) * fSmooth(-0.55, -0.75, y) * fSmooth(-1.05, -0.92, y) * front;
  dark += 0.22 * f * fHump(y, -1.0 - 0.12 * f, 0.05) * fSmooth(0.55, 0.2, az) * fSmooth(-0.1, 0.3, x) * fSmooth(0.75, 0.45, x);
  const fold = Math.abs(az - (0.17 + 0.09 * fClamp((-0.35 - y) / 0.3)));
  dark += 0.12 * (0.4 * f + sag) * Math.exp(-((fold / 0.025) ** 2)) * fSmooth(-0.3, -0.4, y) * fSmooth(-0.7, -0.6, y) * front;
  // Red cheeks with fat.
  red += 0.1 * f * fHump(y, -0.35, 0.15) * fHump(az, 0.5, 0.18) * front;
  let r = 1 - dark * 0.55 + red * 0.5;
  let gg = 1 - dark * 0.85 - red;
  let b = 1 - dark * 0.8 - red;
  // The starved face pale and grey-blue; the heavy one ruddy.
  r *= 1 - 0.04 * g + 0.03 * f;
  gg *= 1 - 0.01 * g - 0.03 * f;
  b *= 1 + 0.03 * g - 0.04 * f;
  return [r, gg, b];
}

/** A key for a set of weights (to share a face map between heads alike). */
export const faceMorphKey = (w) => ['gaunt', 'full', 'defined', 'square', 'sag'].map((name) => Math.round(w[name] * 20)).join('.') + (w.female ? 'f' : 'm');
