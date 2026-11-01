// The knights' helmets: three closed helmets of the knight's two centuries, each remodelled from a surviving piece and its
// kind's other survivors, photographed from the front, side, three-quarter and back, as measured surfaces (helmforms.js's
// lofts and sweeps, fitted over the same head), their fine work (rivets, turned and roped edges, the sights and breaths,
// hinges, vervelles, mail) baked in each one's sheet (tools/blender/knighthelms.py reads what is here through
// tools/knighthelms-dump.mjs), the sights, breaths and face openings cut out of the metal by the sheet (helmmaps.js
// helmMaterial `cut`). Plain (no Three.js).
//
// The knight's harnesses each name theirs (outfits.js `head.design`: the hounskull bascinet with the early Italian and the
// russeted harness, the sallet and bevor with the Gothic, the close helmet with the fluted harness of the 1510s-20s);
// `#knighthelm=2|5|6` or `boxer.helmStyle({ knight: 5 })` (helmstyle.js) draws every knight's bascinet and great helm in
// one for comparison, `#knighthelm=now` all as before. The Templars (c. 1180-1300) keep their great helm: these are later.
//
// Head coordinates as helmforms.js's: x forward, y up, z left, in head radii (r ≈ 11.5 cm drawn), the eyes at y ≈ -0.07,
// the nose's tip at y = -0.5 (x 1.15), the chin near y = -1.33. Real helmets are not balls: each section here is a plan
// (`plan`: its reach before and behind, its half-breadth, how square it is before and behind, and a prow where the face
// plates or a visor meet in a ridge down the middle), and a pointed skull leans back (`lean`: its apex over the back of the
// head, as the bascinets' are). The pieces, and their measures (cm):
//
//   2 hounskull    the visored bascinet, Musée de l'Armée H 21, c. 1350-80 (20 broad, 29 high, 3.25 kg; Met 29.158.29 and
//                  29.156.65, KHM A 24): a tall skull rising to a point over the back of the head, its back falling
//                  straight to the nape, its front sloping long from the apex to the brow, down to the jaw at the sides;
//                  the "hound's skull" visor drawn out in a long conical snout pointed at the mouth, the sights in the band
//                  above it, breaths in the snout, pivots at the temples; the mail aventail hung from vervelles.
//   5 sallet       the German sallet, Adrian Treytz the Elder, Innsbruck c. 1480 (Met 04.3.229: 24.8 high, 29.2 broad, 37.1
//                  deep with its tail; the Walters 51.470, c. 1480-90), and its bevor: two pieces. The sallet raised in one
//                  over the head and face to the nose, a keel over the crown, its sides belling out, the long tail sweeping
//                  back and down, the vue one long narrow slit (about 1.2 cm) cut across the face nearly from ear to ear
//                  under a stop-rib, the lining band's great rivets round it; the bevor strapped on below, a scoop from the
//                  chest over the chin to under the sallet's front edge, which laps over it.
//   6 closeHelmet  the close helmet, c. 1550 (Met 42.50.47: 29.8 high, 22.2 broad, 33.7 deep, 2.66 kg): a round skull under a
//                  tall comb; over the face two plates, the visor drawn forward in a beak at the mouth with its sight one
//                  long narrow slit along its top, pivoted at the temple, and under its edge the bevor (upper and lower,
//                  the breaths in the upper) on its own pivot; the gorget plates at the neck.
//
// Each part is a loft or a sweep as in helmforms.js (`seg` its cuts round and along); `region` its rectangle of the
// design's sheet; `look` 'metal', 'mail' (the aventail, both sides drawn) or 'liner' (the dark padded arming cap inside,
// seen through the sights: no sheet). `bake`: what knighthelms.py raises, sinks and cuts on it, in its own measures:
//
//   view 'front'   (|z|, y) on the part's front (x > 0): a sight or breath where the eyes or mouth are, seen face on
//   view 'side'    (x, y) on its sides (|z| > 0.3): a hinge, a seam behind the ear
//   view 'round'   (share of the way round from the face's middle (0) to the back (1) or the part's edge, y)
//   edge 'start' / 'end' / 'side'   along the part's first or last station, or its edge round (a visor's side)
//   vue            a sight slit cut across the middle of the face, `to` that share of the way round each side, `y` its height
//   shade          the shadow on a piece where another laps over it, above `line` ((|z|, y) seen face on)

import { formCuts, formFitPart, formGrid, formPoint, formSeat } from './helmforms.js';
import { HELM_MAP_DATA } from './helmmaps-data.js';
import { KNIGHT_HELM_MAP_DATA } from './knighthelms-data.js';

// The sheets join the helmets' others (helmmaps.js draws from HELM_MAP_DATA).
Object.assign(HELM_MAP_DATA, KNIGHT_HELM_MAP_DATA);

/** The helmet kinds knights wear today (wardrobe.js), each drawn in a design when one is asked for. */
export const KNIGHT_HELM_KINDS = ['bascinet', 'greatHelm'];

/** A grid of points (a, b) for breaths or rivets: every `as` across, every `bs` up. */
const grid = (as, bs) => as.flatMap((a) => bs.map((b) => [a, b]));
/** n values evenly from a to b. */
const span = (a, b, n) => Array.from({ length: n }, (_, index) => (n === 1 ? a : a + ((b - a) * index) / (n - 1)));

/** How far (x) a design's skull leans back at height y: `lean` [[y, dx], ...], straight between, held past the ends. */
export function leanAt(lean, y) {
  if (!lean?.length) return 0;
  if (y <= lean[0][0]) return lean[0][1];
  for (let index = 1; index < lean.length; index += 1) {
    const [y0, d0] = lean[index - 1];
    const [y1, d1] = lean[index];
    if (y <= y1) return d0 + ((d1 - d0) * (y - y0)) / (y1 - y0);
  }
  return lean.at(-1)[1];
}

/**
 * A section's radii, keys evenly from the face's middle round `turn` of the half-turn (1: to the back; a visor's less): a
 * superellipse reaching `front` before, `back` behind and `side` to each side, `nf` and `nb` how square it is before and
 * behind (2 an ellipse, more a box), and a `prow` standing out from the middle of the front, falling straight away over
 * `prowWidth` (rad) each side (two plates meeting in a ridge; a visor's beak).
 */
function plan({ front, side, back = front, nf = 2.4, nb = 2, prow = 0, prowWidth = 0.7 }, turn = 1) {
  const count = turn === 1 ? 17 : 9;
  return Array.from({ length: count }, (_, index) => {
    const angle = (Math.PI * turn * index) / (count - 1);
    const across = Math.cos(angle);
    const [reach, square] = across >= 0 ? [front, nf] : [back, nb];
    const radius = 1 / ((Math.abs(across) / reach) ** square + (Math.sin(angle) / side) ** square) ** (1 / square);
    return radius + prow * Math.max(0, 1 - angle / prowWidth);
  });
}

/** A station of a design's loft at height y (a number, or keys round), its plan given where it stands after the lean. */
const station = (lean, turn = 1) => (y, front, side, back, more = {}) => {
  const shift = leanAt(lean, typeof y === 'number' ? y : y.reduce((a, b) => a + b, 0) / y.length);
  return { y, rad: plan({ front: front - shift, side, back: (back ?? front) + shift, ...more }, turn) };
};

/** A design's part's point at (u, v): the part's own (helmforms.js formPoint), leaned back by the design's `lean`. */
export function knightPoint(form, part, u, v) {
  const point = formPoint(part, u, v);
  point[0] += leanAt(form.lean, point[1]);
  return point;
}

/** A design's part's mesh as plain arrays (helmforms.js formGrid), leaned back by the design's `lean`. */
export function knightGrid(form, part) {
  const built = formGrid(part);
  const { positions } = built;
  for (let index = 0; index < positions.length; index += 3) positions[index] += leanAt(form.lean, positions[index + 1]);
  return built;
}

/**
 * The padded arming cap and lining inside (dark), seen through the sights and breaths where the head is not drawn: the
 * helmet's own shell a little within itself, at every other station.
 */
function linerOf(part) {
  const lowest = (station) => (typeof station.y === 'number' ? station.y : Math.min(...station.y));
  const stations = part.stations.filter((station) => lowest(station) > -1.45);
  const pull = (keys) => (typeof keys === 'number' ? keys * 0.9 : keys.map((value) => value * 0.9));
  return { kind: 'loft', span: 1, seg: [8, 1], region: null, look: 'liner', stations: stations.map(({ y, rad }) => ({ y, rad: pull(rad) })) };
}

/** A ridge (a comb) standing on a part in the middle plane, from `front` to `back` (x), arched to at most `high` tall. */
function comb(seat, { front, back, high, w = 0.025, seg = [6, 1], region = 'comb', rise = [0.25, 0.7, 0.94, 1, 0.94, 0.7, 0.25], bake = [] }) {
  const feet = rise.map((_, index) => front + ((back - front) * index) / (rise.length - 1));
  return { kind: 'sweep', seg, region, look: 'metal', square: 0.7, seat, bake, stations: feet.map((foot, index) => ({ foot, rise: [0, high * rise[index]], w })) };
}

// The skull that rises to a point over the back of the head.
const HOUNSKULL_LEAN = [[0.4, 0], [0.7, -0.13], [1.0, -0.26], [1.3, -0.45], [1.48, -0.64], [1.62, -0.76]];

export const KNIGHT_FORMS = {
  hounskull: (() => {
    const at = station(HOUNSKULL_LEAN);
    const visor = station(null, 0.45);
    return {
      number: 2, label: 'Hounskull bascinet', period: 'c. 1350–1400', sheet: 'knightHounskull', cut: true,
      museum: "Musée de l'Armée, Paris, H 21 (visored bascinet)", link: 'https://musee-armee.fr/en/collections/museum-treasures/hounskull-bascinet.html',
      line: 'A tall bascinet rising to a point over the back of the head, the long conical "pig-faced" visor pointed at the mouth on pivots at the temples, its sights in the band above the snout, and a mail aventail.',
      standoff: 3.5,
      lean: HOUNSKULL_LEAN,
      sight: { y: [-0.16, -0.05], z: [0.1, 0.5] },
      regions: { skull: [0, 0.45, 1, 1], visor: [0, 0.2, 0.6, 0.45], aventail: [0, 0, 1, 0.2] },
      parts: {
        skull: {
          kind: 'loft', span: 1, seg: [22, 2], region: 'skull', look: 'metal',
          stations: [
            at([-1.35, -1.35, -1.3, -1.22, -1.14], 1.02, 0.97, 1.06),
            at(-0.6, 1.1, 1.09, 1.12),
            at(0.0, 1.17, 0.93, 1.21),
            // The front sloping long to the apex over the back of the head, the back falling nearly straight.
            at(0.5, 1.02, 0.86, 1.17),
            at(0.75, 0.88, 0.75, 1.16),
            at(1.0, 0.64, 0.58, 1.12),
            at(1.3, 0.2, 0.34, 1.08),
            at(1.48, -0.3, 0.16, 0.97),
            { y: 1.62, rad: 0 },
          ],
          bake: [
            // The face opening (under the visor), its edge turned.
            { kind: 'cutout', view: 'front', z: [0, 0.62], y: [-1.6, 0.28], round: 0.18, lip: 0.02 },
            { kind: 'edge', at: 'start', w: 0.06, h: 0.035 },
            // The vervelles (staples) round the foot for the aventail's lace.
            { kind: 'staples', view: 'round', at: span(0.2, 0.98, 12).map((u) => [u, 0.0]), w: 0.03, l: 0.07, h: 0.03, above: 0.12 },
            // The visor's pivots at the temples, on plates riveted to the skull.
            { kind: 'boss', view: 'side', at: [0.28, 0.1], r: 0.08, h: 0.035 },
            { kind: 'rivets', view: 'side', at: [[0.28, 0.25], [0.28, -0.05]], r: 0.025, h: 0.018 },
          ],
        },
        visor: {
          kind: 'loft', span: 0.45, seg: [14, 1], region: 'visor', look: 'metal', double: true,
          stations: [
            visor([-1.36, -1.34, -1.26], 1.08, 1.0, null, { prow: 0.1, prowWidth: 0.9 }),
            visor(-1.04, 1.22, 1.04, null, { prow: 0.12, prowWidth: 0.9 }),
            // The snout's point, at the mouth: straight cone lines from the chin and from the sights to it.
            visor(-0.62, 1.22, 1.07, null, { prow: 0.84, prowWidth: 0.62 }),
            visor(-0.3, 1.26, 1.06, null, { prow: 0.14, prowWidth: 0.9 }),
            // The band of the sights above the snout, sloping back up to the brow on the line of the skull's front.
            visor(-0.1, 1.26, 1.0, null, { prow: 0.1, prowWidth: 0.9 }),
            visor(0.14, 1.18, 0.97, null, { prow: 0.07 }),
            visor(0.4, 1.06, 0.92, null, { prow: 0.02 }),
          ],
          bake: [
            { kind: 'edge', at: 'start', w: 0.05, h: 0.03 },
            { kind: 'edge', at: 'end', w: 0.05, h: 0.03 },
            { kind: 'edge', at: 'side', w: 0.04, h: 0.025 },
            { kind: 'bead', view: 'front', line: [[0, -1.4], [0, 0.38]], w: 0.04, h: 0.03 },
            // The sights: one over each eye, their lips flanged out.
            { kind: 'slot', view: 'front', z: [0.1, 0.5], y: [-0.16, -0.05], round: 0.03, lip: 0.03, cut: true },
            // The breaths in the snout below them.
            { kind: 'holes', view: 'front', at: grid(span(0.1, 0.36, 3), span(-0.68, -1.08, 4)), r: 0.028, cut: true },
            { kind: 'rivets', view: 'side', at: [[0.3, 0.1]], r: 0.05, h: 0.03 },
          ],
        },
        aventail: {
          kind: 'loft', span: 1, seg: [20, 2], region: 'aventail', look: 'mail', double: true,
          stations: [
            { y: [-1.24, -1.24, -1.22, -1.14, -1.06], rad: plan({ front: 0.98, side: 0.94, back: 1.02 }) },
            { y: -1.7, rad: plan({ front: 1.14, side: 1.22, back: 1.2 }) },
            { y: [-2.16, -2.16, -2.12, -2.16, -2.2], rad: plan({ front: 1.46, side: 1.66, back: 1.5 }) },
          ],
          bake: [{ kind: 'mail' }, { kind: 'edge', at: 'start', w: 0.04, h: 0.03, leather: true }],
        },
        liner: true,
      },
    };
  })(),
  sallet: (() => {
    // One piece: the skull raised over the whole head down over the face to the nose, the vue (the sight) a long narrow
    // slit cut across it nearly from ear to ear; out behind in the long tail. The fitted skull's foot is at the eyes before
    // and its flare carries it down past the nose (clear of it), below the ears at the sides, and out in the tail behind.
    const shell = formFitPart({
      kind: 'loft', span: 1, seg: [20, 2], region: 'shell', look: 'metal',
      fit: { foot: [-0.1, -0.2, -0.5, -0.42, -0.3], gap: 0.15, top: 0.2, lift: 0.1, rows: 6 },
      flare: [
        { dy: [-0.68, -0.6, -0.28, -0.43, -0.7], out: [0.26, 0.22, 0.12, 0.5, 0.86] },
        { dy: [-0.4, -0.35, -0.16, -0.3, -0.55], out: [0.15, 0.13, 0.06, 0.3, 0.56] },
        { dy: [-0.12, -0.11, -0.06, -0.15, -0.3], out: [0.04, 0.04, 0.02, 0.12, 0.24] },
      ],
      bake: [
        { kind: 'edge', at: 'start', w: 0.06, h: 0.04 },
        // The vue: one long narrow slit across the face at the eyes, nearly ear to ear, its lower lip turned out; the
        // stop-rib raised over it.
        { kind: 'vue', y: [-0.12, -0.02], to: 0.4, round: 0.02, lip: 0.025 },
        { kind: 'bead', view: 'round', line: [[0, 0.06], [0.42, 0.04]], w: 0.03, h: 0.025 },
        { kind: 'bead', view: 'front', line: [[0, 0.06], [0, 1.2]], w: 0.03, h: 0.018 },
        // The lining band's great rivets in a row round the skull at the vue's height (Met 04.3.229), and the bevor's
        // strap-staple at the back of the neck.
        { kind: 'rivets', view: 'round', at: [0.45, 0.55, 0.66, 0.78, 0.9, 0.99].map((u) => [u, -0.02]), r: 0.045, h: 0.035 },
        { kind: 'rivets', view: 'round', at: [[0.43, -0.07]], r: 0.04, h: 0.03 },
      ],
    });
    const lower = station(null, 0.42);
    return {
      number: 5, label: 'Sallet and bevor', period: 'c. 1480', sheet: 'knightSallet', cut: true,
      museum: 'The Met 04.3.229 (sallet, Adrian Treytz the Elder, Innsbruck)', link: 'https://www.metmuseum.org/art/collection/search/21984',
      line: 'Two pieces: the German sallet, raised in one over the head and face with its vue cut as one long narrow slit nearly ear to ear, drawn out behind in a long tail; and under its front edge the separate bevor, strapped on, from the chest up over the chin.',
      standoff: 3.5,
      // The sight: one slit across the face (a share of the way round each side), its height.
      sight: { y: [-0.12, -0.02], to: 0.4 },
      pieces: [['shell', 'comb'], ['bevor']],
      regions: { shell: [0, 0.4, 1, 1], bevor: [0, 0, 0.62, 0.4], comb: [0.62, 0, 1, 0.4] },
      parts: {
        shell,
        // The bevor, a piece of its own: a scoop of plate from the upper chest to under the sallet's front edge, its edges
        // turned, a ridge down its middle, its strap riveted each side; under the sallet's edge it lies in shadow.
        bevor: {
          kind: 'loft', span: 0.42, seg: [14, 1], region: 'bevor', look: 'metal', double: true,
          stations: [
            lower([-1.72, -1.66, -1.52], 1.26, 1.0, null, { prow: 0.08 }),
            lower([-1.38, -1.34, -1.24], 1.06, 0.93, null, { prow: 0.07 }),
            lower([-0.96, -0.94, -0.9], 1.14, 0.99, null, { prow: 0.1 }),
            lower([-0.66, -0.68, -0.72], 1.2, 1.08, null, { prow: 0.1 }),
            lower([-0.4, -0.44, -0.56], 1.17, 1.03, null, { prow: 0.07 }),
          ],
          bake: [
            { kind: 'edge', at: 'start', w: 0.05, h: 0.035 },
            { kind: 'edge', at: 'end', w: 0.05, h: 0.035 },
            { kind: 'edge', at: 'side', w: 0.045, h: 0.03 },
            { kind: 'bead', view: 'front', line: [[0, -1.7], [0, -0.42]], w: 0.05, h: 0.03 },
            { kind: 'flutes', count: 3, from: 0.05, to: 0.95, h: 0.014 },
            { kind: 'shade', line: [[0, -0.78], [0.6, -0.72], [0.95, -0.72]], w: 0.05 },
            { kind: 'plate', view: 'side', x: [0.38, 0.62], y: [-1.02, -0.9], h: 0.015 },
            { kind: 'rivets', view: 'side', at: [[0.44, -0.96], [0.56, -0.96]], r: 0.03, h: 0.022 },
          ],
        },
        comb: comb('shell', { front: 0.82, back: -1.0, high: 0.1, w: 0.035 }),
        liner: true,
      },
    };
  })(),
  closeHelmet: (() => {
    const at = station(null);
    const visor = station(null, 0.48);
    const bevor = station(null, 0.55);
    return {
      number: 6, label: 'Close helmet', period: 'c. 1520–1560', sheet: 'knightCloseHelmet', cut: true,
      museum: 'The Met 42.50.47 (close-helmet for the field)', link: 'https://www.metmuseum.org/art/collection/search/26508',
      line: 'Two plates over the face: the visor, drawn forward in a beak at the mouth with its sight one long narrow slit along its top, pivoted at the temple; under it the bevor with its breaths, the visor\'s edge standing over it; a round skull under a tall comb, gorget plates at the neck.',
      standoff: 3.5,
      sight: { y: [-0.11, -0.02], to: 0.72 },
      pieces: [['shell', 'comb', 'visor'], ['bevor']],
      regions: { shell: [0, 0.4, 1, 1], visor: [0, 0.2, 0.55, 0.4], bevor: [0, 0, 0.55, 0.2], comb: [0.55, 0, 1, 0.4] },
      parts: {
        shell: {
          kind: 'loft', span: 1, seg: [24, 2], region: 'shell', look: 'metal',
          stations: [
            at([-1.8, -1.8, -1.76, -1.78, -1.8], 1.02, 1.0, 1.0),
            at(-1.52, 0.88, 0.78, 0.76),
            at(-1.1, 1.04, 0.9, 0.74),
            at(-0.5, 1.2, 1.02, 1.04, { nf: 2.8 }),
            at(0.0, 1.18, 0.93, 1.21),
            at(0.5, 1.02, 0.85, 1.09),
            at(0.95, 0.73, 0.62, 0.79),
            at(1.2, 0.33, 0.29, 0.37),
            { y: 1.27, rad: 0 },
          ],
          bake: [
            { kind: 'cutout', view: 'front', z: [0, 0.5], y: [-1.4, 0.32], round: 0.16, lip: 0.02 },
            { kind: 'edge', at: 'start', w: 0.05, h: 0.035, roped: true },
            // The gorget plates at the neck, riveted, and the skull's foot over them.
            { kind: 'step', view: 'round', y: -1.62, w: 0.03, h: 0.025 },
            { kind: 'step', view: 'round', y: -1.46, w: 0.03, h: 0.025 },
            { kind: 'rivets', view: 'round', at: [0.3, 0.7, 0.98].flatMap((u) => [[u, -1.58], [u, -1.42]]), r: 0.025, h: 0.018 },
            { kind: 'boss', view: 'side', at: [0.3, 0.06], r: 0.065, h: 0.032 },
            { kind: 'rivets', view: 'round', at: span(0.4, 0.98, 7).map((u) => [u, 0.5]), r: 0.022, h: 0.016 },
          ],
        },
        visor: {
          kind: 'loft', span: 0.48, seg: [16, 1], region: 'visor', look: 'metal', double: true,
          stations: [
            // The beak at the mouth, its lower edge standing out over the upper bevor.
            visor([-0.44, -0.4, -0.3], 1.26, 1.14, null, { prow: 0.5, prowWidth: 0.6 }),
            visor(-0.26, 1.28, 1.13, null, { prow: 0.38, prowWidth: 0.6 }),
            visor(0.02, 1.25, 0.98, null, { prow: 0.18, prowWidth: 0.65 }),
            visor(0.22, 1.18, 0.96, null, { prow: 0.08 }),
            visor(0.44, 1.08, 0.9, null, { prow: 0.02 }),
          ],
          bake: [
            { kind: 'edge', at: 'start', w: 0.05, h: 0.03, roped: true },
            { kind: 'edge', at: 'end', w: 0.05, h: 0.03 },
            { kind: 'edge', at: 'side', w: 0.04, h: 0.025 },
            { kind: 'bead', view: 'front', line: [[0, -0.42], [0, 0.42]], w: 0.05, h: 0.035 },
            // The sight: one long narrow slit along the visor's top, its lower lip turned out.
            { kind: 'vue', y: [-0.11, -0.02], to: 0.72, round: 0.02, lip: 0.025 },
            // The visor's own pivot at the temple, its lifting peg on the right.
            { kind: 'boss', view: 'side', at: [0.3, 0.06], r: 0.075, h: 0.035 },
            { kind: 'rivets', view: 'side', at: [[0.62, -0.32]], r: 0.04, h: 0.035 },
          ],
        },
        bevor: {
          kind: 'loft', span: 0.55, seg: [16, 1], region: 'bevor', look: 'metal', double: true,
          stations: [
            bevor([-1.64, -1.62, -1.52], 1.04, 0.88, null, { prow: 0.06 }),
            bevor(-1.25, 1.08, 0.88, null, { prow: 0.1 }),
            // The lower bevor's top, the upper bevor lapping over it.
            bevor(-0.98, 1.18, 0.99, null, { prow: 0.24, prowWidth: 0.65 }),
            bevor(-0.66, 1.2, 1.07, null, { prow: 0.36, prowWidth: 0.6 }),
            // Its top tucked well inside the visor's beak: the visor's edge stands over it in a step.
            bevor(-0.46, 1.16, 1.05, null, { prow: 0.3, prowWidth: 0.6 }),
            bevor(-0.32, 1.12, 1.03, null, { prow: 0.22, prowWidth: 0.6 }),
          ],
          bake: [
            { kind: 'edge', at: 'start', w: 0.05, h: 0.03 },
            { kind: 'edge', at: 'end', w: 0.05, h: 0.03 },
            { kind: 'edge', at: 'side', w: 0.04, h: 0.025 },
            { kind: 'bead', view: 'front', line: [[0, -1.6], [0, -0.34]], w: 0.05, h: 0.03 },
            { kind: 'step', view: 'round', y: -0.98, w: 0.03, h: 0.025 },
            // The breaths in the upper bevor, a cluster of round holes each side (Met 42.50.47).
            { kind: 'holes', view: 'front', at: grid(span(0.2, 0.42, 3), span(-0.56, -0.84, 3)), r: 0.028, cut: true },
            // Its own pivot behind the visor's, and the shadow under the visor's edge.
            { kind: 'boss', view: 'side', at: [0.08, -0.2], r: 0.06, h: 0.03 },
            { kind: 'rivets', view: 'side', at: [[0.35, -0.98]], r: 0.04, h: 0.025 },
            { kind: 'shade', line: [[0, -0.44], [0.5, -0.42], [0.95, -0.32]], w: 0.06 },
          ],
        },
        comb: comb('shell', {
          front: 0.84, back: -1.04, high: 0.44, w: 0.04, seg: [6, 1], rise: [0.18, 0.62, 0.88, 1, 1, 0.92, 0.7, 0.28],
          bake: [{ kind: 'edge', at: 'top', w: 0.03, h: 0.015 }],
        }),
        liner: true,
      },
    };
  })(),
};

// The combs seated on their skulls, the linings made inside them, and how high each stands (where a plume goes).
for (const form of Object.values(KNIGHT_FORMS)) {
  formSeat(form);
  if (form.parts.liner === true) form.parts.liner = linerOf(form.parts.shell ?? form.parts.skull);
  form.top = Math.max(...Object.values(form.parts).flatMap((part) => knightGrid(form, part).positions.filter((_, index) => index % 3 === 1)));
}

/** The designs in the order they are offered (`#knighthelm=1..6`). */
export const KNIGHT_HELM_CHOICES = Object.fromEntries(Object.entries(KNIGHT_FORMS).map(([name, form]) => [String(form.number), name]));

/**
 * The design a knight's helmet kind is drawn in: the one asked for (`choice`: '2', '5' or '6', every knight in it), none
 * for `now` (drawn as before), else the unit's own (`design`, a key of KNIGHT_FORMS); null (drawn as before) for another
 * kind or a unit with none (the Templar's great helm).
 */
export function knightFormOf(kind, choice, design) {
  if (!KNIGHT_HELM_KINDS.includes(kind) || choice === 'now') return null;
  const name = KNIGHT_HELM_CHOICES[choice] ?? design;
  return KNIGHT_FORMS[name] ?? null;
}

/** Triangles a design is drawn with (before outlines). */
export function knightTriangles(name) {
  return Object.values(KNIGHT_FORMS[name].parts).reduce((sum, part) => {
    const [nu, nv] = formCuts(part);
    return sum + nu * nv * 2;
  }, 0);
}
