// Head proportions, front view, measured on the meshes (not on pictures): the face's height against its width at the
// cheekbones, and the jaw's width against the cheekbones', for lean, average and fat men and women, on the drawn head and on
// the photo head (rounds 3 and 4). Plain Node: node tools/photofaces/proportions.mjs
//
// The drawn head's construction (face.js deformPoint) is copied here: face.js needs Three.js to load.

import { buildBody, PRESETS } from '../../src/body.js';
import { faceMorphWeights, morphHeadPoint } from '../../src/facemorph.js';
import { buildPhotoHead as currentBuilder } from '../../src/photohead.js';

// An older photohead.js to measure round 3 with (its file path), else the current one for both columns.
const roundThreeBuilder = process.argv[2] ? (await import(process.argv[2])).buildPhotoHead : currentBuilder;

const SKULL = [0.94, 1.06, 0.86];
const ATLAS = { eyeU: 0.0668, earU: 0.258, eyeRow: 0.44, mouthRow: 0.70, chinRow: 0.88, mouthShare: 0.56, chinT: 0.95, hairlineRow: 0.22, hairlineAt: 0.36 };
const SHAPES = {
  shonen: { jawWidth: 0.8, jawAt: 0.5, chinWidth: 0.16, chinLength: 1.0, chinForward: 0.74, faceFront: 0.84, cheek: 0, crown: 1.0 },
  seinen: { jawWidth: 0.88, jawAt: 0.62, chinWidth: 0.32, chinLength: 1.14, chinForward: 0.8, faceFront: 0.86, cheek: 0, crown: 0.97 },
  round3: { jawWidth: 0.92, jawAt: 0.55, chinWidth: 0.46, chinLength: 1.08, chinForward: 0.82, faceFront: 0.92, cheek: 0.03, crown: 1.0 },
  photo: { jawWidth: 0.8, jawAt: 0.56, chinWidth: 0.27, chinLength: 1.12, chinForward: 0.8, faceFront: 1.0, cheek: 0, crown: 1.0 },
  photoFemale: { jawWidth: 0.74, jawAt: 0.52, chinWidth: 0.2, chinLength: 1.06, chinForward: 0.76, faceFront: 1.0, cheek: 0.02, crown: 1.02 },
};
const ease = (t) => t * t * (3 - 2 * t);

function deformPoint(x, y, z, shape) {
  let X;
  let Y;
  let Z;
  if (y < 0) {
    const t = Math.min(1, -y);
    const ring = Math.sqrt(Math.max(1e-6, 1 - y * y));
    const ux = x / ring;
    const uz = z / ring;
    const width = t < shape.jawAt ? 1 + (shape.jawWidth - 1) * (t / shape.jawAt) + shape.cheek * Math.sin((Math.PI * t) / shape.jawAt) : shape.jawWidth + (shape.chinWidth - shape.jawWidth) * ((t - shape.jawAt) / (1 - shape.jawAt));
    const front = 1 + (shape.chinForward - 1) * ease(t);
    const back = 1 - 0.62 * ease(t);
    X = ux * (ux > 0 ? front : back) * Math.min(1, ring * 3 + 0.25);
    Z = uz * width * Math.min(1, ring * 3 + 0.25);
    Y = -t * shape.chinLength;
  } else {
    X = x;
    Y = y * shape.crown;
    Z = z;
  }
  if (X > shape.faceFront) {
    const band = ease(Math.max(0, Math.min(1, (0.6 - Y) / 0.25))) * ease(Math.max(0, Math.min(1, (Y + 0.95) / 0.3)));
    X -= (X - shape.faceFront) * 0.7 * band;
  }
  if (shape.morph) [X, Y, Z] = morphHeadPoint(X, Y, Z, shape.morph);
  return [X * SKULL[0], Y * SKULL[1], Z * SKULL[2]];
}

function photoShape(base, morph) {
  const { full = 0, gaunt = 0, square = 0 } = morph;
  return { ...base, jawWidth: base.jawWidth + 0.15 * full - 0.04 * gaunt + 0.06 * square, chinWidth: base.chinWidth + 0.24 * full + 0.06 * square, cheek: base.cheek + 0.07 * full - 0.03 * gaunt, chinLength: base.chinLength - 0.03 * full };
}

/** Front-view measures of a cloud of points (head radius 1): bizygomatic and bigonial widths, face heights. */
function measure(points, { hairlineY, nasionY }) {
  const front = points.filter((p) => p[0] > 0);
  const widthBetween = (low, high) => 2 * Math.max(...front.filter((p) => p[1] >= low && p[1] <= high).map((p) => Math.abs(p[2])));
  const cheek = widthBetween(-0.3, -0.02);
  const jaw = widthBetween(-0.92, -0.68);
  const menton = Math.min(...front.filter((p) => Math.abs(p[2]) < 0.08 && p[0] > 0.25).map((p) => p[1]));
  return { total: (hairlineY - menton) / cheek, face: (nasionY - menton) / cheek, jawToCheek: jaw / cheek };
}

const sphere = [];
for (let row = 0; row <= 72; row += 1) for (let column = 0; column < 96; column += 1) {
  const polar = (Math.PI * row) / 72;
  const az = (2 * Math.PI * column) / 96 - Math.PI;
  sphere.push([Math.sin(polar) * Math.cos(az), Math.cos(polar), Math.sin(polar) * Math.sin(az)]);
}
const drawnHead = (shape) => sphere.map(([x, y, z]) => deformPoint(x, y, z, shape));
const photoHead = (shape, female, buildPhotoHead = currentBuilder) => {
  const head = buildPhotoHead({ radius: 1, deform: (x, y, z) => deformPoint(x, y, z, { ...shape, morph: null }).map((v, a) => v / SKULL[a]), skull: SKULL, shape, eyeLine: -0.06, atlas: ATLAS, female });
  const points = [];
  for (let i = 0; i < head.positions.length; i += 3) points.push(head.positions.slice(i, i + 3));
  return points;
};

const BUILDS = { lean: { calories: 2200, exercise: 0.95, frame: 'small' }, average: { calories: 3000, exercise: 0.4 }, fat: { calories: 6200, exercise: 0.03, frame: 'large' } };
const rows = [];
for (const [sex, preset] of [['male', 'amateur'], ['female', 'contender']]) {
  for (const [build, extra] of Object.entries(BUILDS)) {
    const body = buildBody({ ...structuredClone(PRESETS[preset]), age: 28, ...extra });
    const morph = faceMorphWeights(body);
    const female = sex === 'female';
    // The hairline and the nasion on the front of the head (the drawn hair's front hairline, the eye line).
    const marks = (shape, photo = false) => ({ hairlineY: photo ? Math.sin((ATLAS.hairlineAt * Math.PI) / 2) * shape.crown * SKULL[1] : Math.cos(1.1) * shape.crown * SKULL[1], nasionY: -0.02 });
    const drawnShape = { ...SHAPES[female ? 'shonen' : 'seinen'], morph };
    const round3 = { ...SHAPES.round3, morph };
    const round4 = { ...photoShape(SHAPES[female ? 'photoFemale' : 'photo'], morph), morph };
    const fmt = (m) => `${m.total.toFixed(2)} / ${m.face.toFixed(2)} / ${m.jawToCheek.toFixed(2)}`;
    rows.push([`${sex} ${build} (fat ${(body.inputs.bodyFat * 100).toFixed(0)}%)`, fmt(measure(drawnHead(drawnShape), marks(drawnShape))), fmt(measure(photoHead(round3, female, roundThreeBuilder), marks(round3, true))), fmt(measure(photoHead(round4, female), marks(round4, true)))]);
  }
}
console.log('face height (hairline-chin) / bizygomatic  ·  (nasion-chin) / bizygomatic  ·  bigonial / bizygomatic');
console.log(['build', 'drawn', 'round 3', 'round 4'].join(' | '));
for (const row of rows) console.log(row.join(' | '));
