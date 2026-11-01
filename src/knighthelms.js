// The knights' helmets under study: six closed helmets of the knight's two centuries, each remodelled from a surviving
// piece and its kind's other survivors, photographed from the front, side, three-quarter and back, as measured surfaces
// (helmforms.js's lofts and sweeps, fitted over the same head), their fine work (rivets, turned and roped edges, the sights
// and breaths, hinges, vervelles, mail) baked in each one's sheet (tools/blender/knighthelms.py reads what is here through
// tools/knighthelms-dump.mjs), the sights, breaths and face openings cut out of the metal by the sheet (helmmaps.js
// helmMaterial `cut`). Plain (no Three.js).
//
// Any helmet kind a knight wears (KNIGHT_HELM_KINDS: the knight's bascinet, the Templar's great helm) is drawn in a design
// when one is asked for: `#knighthelm=1..6` in the address or `boxer.helmStyle({ knight: 3 })` (helmstyle.js), or by a unit
// naming it (`head.design`, a key of KNIGHT_FORMS). Without either it is drawn as before.
//
// Head coordinates as helmforms.js's: x forward, y up, z left, in head radii (r ≈ 11.5 cm drawn), the eyes at y ≈ -0.07,
// the nose's tip at y = -0.5 (x 1.15), the chin near y = -1.33. Real helmets are not balls: each section here is a plan
// (`plan`: its reach before and behind, its half-breadth, how square it is before and behind, and a prow where the face
// plates or a visor meet in a ridge down the middle), and a pointed skull leans back (`lean`: its apex over the back of the
// head, as the bascinets' are). The pieces, and their measures (cm):
//
//   1 greatHelm    the great helm of Albrecht von Prankh, c. 1330-40 (Kunsthistorisches Museum Vienna, Hofjagd- und
//                  Rüstkammer B 74: 24.2 broad, 31 deep, the helm 5.2 kg; the Dargen helm, Deutsches Historisches Museum):
//                  a flat-sided can, its back flat, its face two plates meeting in a ridge down the middle (a shallow
//                  prow), the brow plate standing proud of the lower face plate with the sight slits in the step between,
//                  a flat top plate riveted round; breaths in the lower face; the cross cut for the chain. It rests on the
//                  padded arming cap and the shoulders, standing off the face.
//   2 hounskull    the visored bascinet, Musée de l'Armée H 21, c. 1350-80 (20 broad, 29 high, 3.25 kg; Met 29.158.29 and
//                  29.156.65, KHM A 24): a tall skull rising to a point over the back of the head, its back falling
//                  straight to the nape, its front sloping long from the apex to the brow, down to the jaw at the sides;
//                  the "hound's skull" visor drawn out in a long conical snout pointed at the mouth, the sights in the band
//                  above it, breaths in the snout, pivots at the temples; the mail aventail hung from vervelles.
//   3 greatBascinet the great bascinet, British Museum OA.2190, c. 1410-30 (44 high, 24 broad, 26 deep, 3.95 kg; Met
//                  04.3.247): the skull pointed and leaning back, drawn down behind over the neck and flaring out over the
//                  back, in front plates over the chin and throat to a point at the chest, so the head turns inside it;
//                  the globular visor on side hinges, a blunt snout pierced with many holes, the sights above.
//   4 armet        the Italian armet, Missaglia workshop, Milan c. 1460 (Met 29.158.22: 29.2 high, 21.6 broad, 28.6 deep,
//                  2.75 kg; Met 42.50.2, Lionardo, c. 1440): a round skull with a low keel, the brow reinforce over it, the
//                  cheek pieces hinged over the ears, full at the jaw and closing at the chin, the neck drawn in close; the
//                  visor pointed down its middle with its sight across; the rondel on its stem at the nape.
//   5 sallet       the German sallet with visor and bevor, Adrian Treytz the Elder, Innsbruck c. 1480 (Met 04.3.229: 24.8
//                  high, 37.1 deep with its tail; the visored sallet of the Walters 51.470, c. 1480-90): a low skull rising
//                  to a keel, its sides belling out below, drawn out behind in a long tail sweeping back and down; the
//                  visor on pivots with its sight and stop-rib; the bevor from the chest to under the visor.
//   6 closeHelmet  the close helmet, c. 1550 (Met 42.50.47: 29.8 high, 22.2 broad, 33.7 deep, 2.66 kg): a round skull under
//                  a tall roped comb, the visor drawn forward in a beak at the mouth with its sights at its top, the upper
//                  bevor under it with its breaths, the bevor and the gorget plates at the neck.
//
// Each part is a loft or a sweep as in helmforms.js (`seg` its cuts round and along); `region` its rectangle of the
// design's sheet; `look` 'metal', 'mail' (the aventail, both sides drawn) or 'liner' (the dark padded arming cap inside,
// seen through the sights: no sheet). `bake`: what knighthelms.py raises, sinks and cuts on it, in its own measures:
//
//   view 'front'   (|z|, y) on the part's front (x > 0): a sight or breath where the eyes or mouth are, seen face on
//   view 'side'    (x, y) on its sides (|z| > 0.3): a hinge, a seam behind the ear
//   view 'round'   (share of the way round from the face's middle (0) to the back (1) or the part's edge, y)
//   edge 'start' / 'end' / 'side'   along the part's first or last station, or its edge round (a visor's side)

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

// The skulls that rise to a point over the back of the head.
const HOUNSKULL_LEAN = [[0.4, 0], [0.7, -0.13], [1.0, -0.26], [1.3, -0.45], [1.48, -0.64], [1.62, -0.76]];
const GREAT_BASCINET_LEAN = [[0.5, 0], [1.0, -0.1], [1.32, -0.2], [1.56, -0.28]];

export const KNIGHT_FORMS = {
  greatHelm: (() => {
    const at = station(null);
    // Boxy behind and at the sides, the face's two plates meeting in a shallow prow.
    const can = { nf: 2.6, nb: 2.8, prowWidth: 0.75 };
    return {
      number: 1, label: 'Great helm', period: 'c. 1330–1340', sheet: 'knightGreatHelm', cut: true,
      museum: 'Kunsthistorisches Museum Vienna, HJRK B 74 (helm of Albrecht von Prankh)', link: 'https://www.khm.at/en/object/373606',
      line: 'A flat-topped, flat-sided great helm of riveted plates: the face two plates meeting in a ridge, the brow plate proud of the lower face with the two sight slits in the step, breaths below.',
      standoff: 5.2,
      sight: { y: [-0.13, -0.01], z: [0.07, 0.62] },
      regions: { shell: [0, 0, 1, 1] },
      parts: {
        shell: {
          kind: 'loft', span: 1, seg: [22, 1], region: 'shell', look: 'metal',
          stations: [
            at([-1.78, -1.78, -1.74, -1.72, -1.72], 1.1, 1.0, 1.2, { ...can, prow: 0.08 }),
            at(-1.25, 1.19, 1.02, 1.21, { ...can, prow: 0.12 }),
            at(-0.55, 1.22, 1.03, 1.22, { ...can, prow: 0.13 }),
            // The lower face plate's top edge, back under the brow plate: the sights in the step between.
            at(-0.13, 1.18, 1.03, 1.22, { ...can, prow: 0.1 }),
            at(0.0, 1.24, 1.04, 1.23, { ...can, prow: 0.1 }),
            // The upper plates drawn in a little to the top plate (the top narrower than the foot).
            at(0.6, 1.18, 0.99, 1.21, { ...can, prow: 0.08 }),
            at(1.12, 1.08, 0.9, 1.14, { ...can, prow: 0.05 }),
            at(1.12, 1.08, 0.9, 1.14, { ...can, prow: 0.05 }),
            at(1.2, 0.96, 0.78, 1.0, { ...can, prow: 0.03 }),
            { y: 1.25, rad: 0 },
          ],
          bake: [
            { kind: 'edge', at: 'start', w: 0.06, h: 0.04 },
            // The face plates meet in a ridge down the middle; the brow plate's edge over the sights.
            { kind: 'bead', view: 'front', line: [[0, -1.76], [0, -0.14]], w: 0.05, h: 0.03 },
            { kind: 'bead', view: 'front', line: [[0, 0.02], [0, 1.12]], w: 0.05, h: 0.03 },
            { kind: 'step', view: 'round', y: 0.0, w: 0.025, h: 0.02 },
            { kind: 'rivets', view: 'front', at: [...span(0.1, 0.72, 6).map((z) => [z, 0.07]), ...span(-0.3, -1.6, 5).map((y) => [0.09, y])], r: 0.028, h: 0.02 },
            // The sights: two slits in the step under the brow plate.
            { kind: 'slot', view: 'front', z: [0.07, 0.62], y: [-0.13, -0.01], round: 0.02, lip: 0.012, cut: true },
            // The breaths in the lower face plates, and the cross cut for the chain to the breast.
            { kind: 'holes', view: 'front', at: grid(span(0.22, 0.52, 3), span(-0.42, -1.02, 5)), r: 0.03, cut: true },
            { kind: 'cross', view: 'front', at: [0.42, -1.4], arm: 0.09, w: 0.03, cut: true },
            // The seams where the face plates meet the neck plates (behind the ears), riveted; the top plate's rivets round.
            { kind: 'bead', view: 'round', line: [[0.56, -1.74], [0.56, 1.12]], w: 0.02, h: -0.012 },
            { kind: 'rivets', view: 'round', at: span(-1.5, 0.95, 7).map((y) => [0.53, y]), r: 0.03, h: 0.022 },
            { kind: 'rivets', view: 'round', at: span(0.04, 0.96, 12).map((u) => [u, 1.07]), r: 0.03, h: 0.022 },
            { kind: 'step', view: 'round', y: 1.12, w: 0.03, h: 0.025 },
          ],
        },
        liner: true,
      },
    };
  })(),
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
  greatBascinet: (() => {
    const at = station(GREAT_BASCINET_LEAN);
    const visor = station(null, 0.42);
    return {
      number: 3, label: 'Great bascinet', period: 'c. 1410–1440', sheet: 'knightGreatBascinet', cut: true,
      museum: 'British Museum OA.2190 (great bascinet)', link: 'https://www.britishmuseum.org/collection/object/H_OA-2190',
      line: 'A pointed skull drawn down over the neck, flaring over the back and coming to a point over the chest in plates, so the head turns inside it; a globular visor on side hinges with a blunt snout full of breaths.',
      standoff: 3.8,
      lean: GREAT_BASCINET_LEAN,
      sight: { y: [-0.13, -0.03], z: [0.08, 0.48] },
      regions: { shell: [0, 0.35, 1, 1], visor: [0, 0, 0.7, 0.35] },
      parts: {
        shell: {
          kind: 'loft', span: 1, seg: [24, 2], region: 'shell', look: 'metal',
          stations: [
            // Flaring over the shoulders behind, to a point over the chest before.
            at([-2.26, -2.18, -2.08, -2.22, -2.36], 1.2, 1.08, 1.5, { prow: 0.26, prowWidth: 0.9 }),
            at(-1.78, 1.2, 0.98, 1.02, { prow: 0.2, prowWidth: 0.9 }),
            at(-1.3, 1.16, 0.94, 0.97, { prow: 0.14 }),
            at(-0.7, 1.18, 1.07, 1.06),
            at(0.0, 1.18, 0.93, 1.2),
            at(0.55, 1.03, 0.86, 1.17),
            at(1.0, 0.72, 0.64, 1.02),
            at(1.32, 0.34, 0.32, 0.7),
            { y: 1.56, rad: 0 },
          ],
          bake: [
            { kind: 'cutout', view: 'front', z: [0, 0.58], y: [-0.8, 0.3], round: 0.2, lip: 0.025 },
            { kind: 'edge', at: 'start', w: 0.06, h: 0.04 },
            // The plates over the throat and the back of the neck, each riveted to the next; the brow reinforce.
            { kind: 'step', view: 'round', y: -1.5, w: 0.03, h: 0.025 },
            { kind: 'step', view: 'round', y: -1.86, w: 0.03, h: 0.025 },
            { kind: 'rivets', view: 'round', at: [0.05, 0.2, 0.35, 0.65, 0.8, 0.95].flatMap((u) => [[u, -1.46], [u, -1.82]]), r: 0.028, h: 0.02 },
            { kind: 'band', view: 'front', z: [0, 0.7], y: [0.3, 0.5], h: 0.02 },
            // The visor's hinges each side: a plate with its pin, riveted.
            { kind: 'plate', view: 'side', x: [0.12, 0.42], y: [0.0, 0.22], h: 0.018 },
            { kind: 'boss', view: 'side', at: [0.28, 0.11], r: 0.05, h: 0.03 },
            { kind: 'rivets', view: 'side', at: [[0.17, 0.05], [0.37, 0.05], [0.17, 0.17], [0.37, 0.17]], r: 0.022, h: 0.016 },
            { kind: 'rivets', view: 'round', at: span(0.3, 0.98, 8).map((u) => [u, 0.42]), r: 0.025, h: 0.016 },
          ],
        },
        visor: {
          kind: 'loft', span: 0.42, seg: [16, 1], region: 'visor', look: 'metal', double: true,
          stations: [
            visor([-0.96, -0.92, -0.84], 1.18, 1.0, null, { prow: 0.1 }),
            visor(-0.72, 1.3, 1.06, null, { prow: 0.24, prowWidth: 1.1 }),
            // The blunt snout.
            visor(-0.45, 1.34, 1.07, null, { prow: 0.28, prowWidth: 1.1 }),
            visor(-0.15, 1.3, 1.03, null, { prow: 0.14, prowWidth: 1.0 }),
            visor(0.15, 1.2, 0.97, null, { prow: 0.05 }),
            visor(0.42, 1.1, 0.92, null, { prow: 0.02 }),
          ],
          bake: [
            { kind: 'edge', at: 'start', w: 0.05, h: 0.03 },
            { kind: 'edge', at: 'end', w: 0.05, h: 0.03 },
            { kind: 'edge', at: 'side', w: 0.04, h: 0.025 },
            { kind: 'bead', view: 'front', line: [[0, -0.94], [0, 0.4]], w: 0.045, h: 0.03 },
            { kind: 'slot', view: 'front', z: [0.08, 0.48], y: [-0.13, -0.03], round: 0.03, lip: 0.025, cut: true },
            // Many small holes for sight and breath in the snout.
            { kind: 'holes', view: 'front', at: grid(span(0.08, 0.46, 5), span(-0.3, -0.78, 5)), r: 0.026, cut: true },
          ],
        },
        liner: true,
      },
    };
  })(),
  armet: (() => {
    const at = station(null);
    const visor = station(null, 0.44);
    return {
      number: 4, label: 'Italian armet', period: 'c. 1440–1470', sheet: 'knightArmet', cut: true,
      museum: 'The Met 29.158.22 (armet, Missaglia workshop, Milan)', link: 'https://www.metmuseum.org/art/collection/search/23232',
      line: 'A round skull with a low keel and the brow reinforce, cheek pieces hinged over the ears, full at the jaw and closing at the chin, a visor pointed down its middle, and the rondel on its stem at the nape.',
      standoff: 3.5,
      sight: { y: [-0.12, -0.02], z: [0.0, 0.54] },
      regions: { shell: [0, 0.38, 1, 1], visor: [0, 0.12, 0.55, 0.38], rondel: [0.55, 0.12, 0.8, 0.38], brow: [0.8, 0.12, 1, 0.38], comb: [0, 0, 1, 0.12] },
      parts: {
        shell: {
          kind: 'loft', span: 1, seg: [24, 2], region: 'shell', look: 'metal',
          stations: [
            // The neck drawn in close, a little flange at the foot.
            at([-1.52, -1.52, -1.48, -1.4, -1.36], 1.02, 0.8, 0.76),
            at(-1.34, 1.1, 0.86, 0.66, { prow: 0.04 }),
            // The cheek pieces full at the jaw (the helmet's widest), closing at the chin; the neck drawn in behind.
            at(-0.95, 1.12, 1.0, 0.74, { prow: 0.04, nf: 2.8 }),
            at(-0.3, 1.16, 1.01, 1.12, { nf: 2.8 }),
            at(0.3, 1.08, 0.88, 1.16),
            at(0.8, 0.82, 0.66, 0.96),
            at(1.1, 0.5, 0.36, 0.62, { nf: 2 }),
            { y: 1.27, rad: 0 },
          ],
          bake: [
            { kind: 'cutout', view: 'front', z: [0, 0.5], y: [-0.84, 0.3], round: 0.15, lip: 0.02 },
            { kind: 'edge', at: 'start', w: 0.05, h: 0.035 },
            // The cheek pieces' edges: from the hinge over the ear down behind the jaw to the neck, and their meeting at the chin.
            { kind: 'bead', view: 'side', line: [[0.62, 0.3], [0.1, 0.36], [-0.42, 0.22], [-0.6, -0.3], [-0.5, -1.5]], w: 0.025, h: -0.016 },
            { kind: 'bead', view: 'side', line: [[0.1, 0.38], [-0.42, 0.24]], w: 0.03, h: 0.012 },
            { kind: 'bead', view: 'front', line: [[0, -0.86], [0, -1.58]], w: 0.025, h: -0.016 },
            { kind: 'boss', view: 'side', at: [-0.2, 0.33], r: 0.06, h: 0.03 },
            { kind: 'rivets', view: 'side', at: [[0.32, 0.36], [-0.48, -0.2], [-0.55, -0.9]], r: 0.025, h: 0.018 },
            // The visor's pivot at the temple, the strap's turning pin at the chin, the lining's rivets round the foot.
            { kind: 'boss', view: 'side', at: [0.4, 0.08], r: 0.06, h: 0.03 },
            { kind: 'rivets', view: 'front', at: [[0.0, -1.2]], r: 0.045, h: 0.03 },
            { kind: 'rivets', view: 'round', at: span(0.1, 0.98, 10).map((u) => [u, -1.44]), r: 0.022, h: 0.016 },
          ],
        },
        // The reinforce over the brow, a plate riveted over the skull's front, its upper edge peaked in the middle.
        brow: {
          kind: 'loft', span: 0.42, seg: [16, 1], region: 'brow', look: 'metal', double: true,
          stations: [
            { y: 0.24, rad: plan({ front: 1.14, side: 0.95 }, 0.42) },
            { y: [0.7, 0.6, 0.42], rad: plan({ front: 0.96, side: 0.86 }, 0.42) },
          ],
          bake: [
            { kind: 'edge', at: 'start', w: 0.04, h: 0.025 },
            { kind: 'edge', at: 'end', w: 0.04, h: 0.025 },
            { kind: 'rivets', view: 'front', at: [[0.2, 0.36], [0.55, 0.32]], r: 0.026, h: 0.018 },
          ],
        },
        visor: {
          kind: 'loft', span: 0.44, seg: [16, 1], region: 'visor', look: 'metal', double: true,
          stations: [
            // A wedge: its ridge running forward down the middle to the beak at its foot, the lower edge rising back.
            visor([-0.9, -0.8, -0.56], 1.15, 1.08, null, { prow: 0.24, prowWidth: 0.62, nf: 2 }),
            visor(-0.62, 1.18, 1.09, null, { prow: 0.2, prowWidth: 0.62, nf: 2 }),
            visor(-0.3, 1.2, 1.07, null, { prow: 0.12, prowWidth: 0.7, nf: 2 }),
            visor(0.0, 1.17, 0.97, null, { prow: 0.07 }),
            visor(0.24, 1.12, 0.93, null, { prow: 0.03 }),
          ],
          bake: [
            { kind: 'edge', at: 'start', w: 0.05, h: 0.03 },
            { kind: 'edge', at: 'end', w: 0.05, h: 0.03 },
            { kind: 'edge', at: 'side', w: 0.04, h: 0.025 },
            { kind: 'bead', view: 'front', line: [[0, -0.94], [0, 0.22]], w: 0.05, h: 0.035 },
            // The sight across both eyes, its lower lip turned out; breaths on the lower visor.
            { kind: 'slot', view: 'front', z: [0.0, 0.54], y: [-0.12, -0.02], round: 0.025, lip: 0.03, cut: true },
            { kind: 'holes', view: 'front', at: grid(span(0.2, 0.4, 3), span(-0.42, -0.72, 3)), r: 0.026, cut: true },
          ],
        },
        rondel: {
          kind: 'sweep', seg: [14, 1], region: 'rondel', look: 'metal',
          stations: [
            { at: [-0.7, -1.02], r: 0.035, rz: 1 },
            { at: [-0.92, -1.02], r: 0.035, rz: 1 },
            { at: [-0.96, -1.02], r: 0.035, rz: 1 },
            { at: [-0.97, -1.02], r: 0.3, rz: 1 },
            { at: [-1.0, -1.02], r: 0.3, rz: 1 },
            { at: [-1.005, -1.02], r: 0.004, rz: 1 },
          ],
          bake: [{ kind: 'rivets', view: 'side', at: [[-1.0, -1.02]], r: 0.05, h: 0.03 }],
        },
        comb: comb('shell', { front: 0.8, back: -1.0, high: 0.11, w: 0.035 }),
        liner: true,
      },
    };
  })(),
  sallet: (() => {
    const shell = formFitPart({
      kind: 'loft', span: 1, seg: [20, 2], region: 'shell', look: 'metal',
      fit: { foot: [-0.5, -0.52, -0.56, -0.42, -0.3], gap: 0.15, top: 0.2, lift: 0.1, rows: 6 },
      // The tail: out behind in a long sweep back and down (the lower edge one straight line from the visor to its point),
      // the sides belling out, none before the face.
      flare: [
        { dy: [-0.02, -0.12, -0.3, -0.6, -0.74], out: [0.01, 0.08, 0.22, 0.6, 0.9] },
        { dy: [-0.015, -0.09, -0.22, -0.44, -0.55], out: [0.006, 0.04, 0.12, 0.36, 0.56] },
        { dy: [-0.01, -0.05, -0.12, -0.24, -0.3], out: [0.003, 0.015, 0.05, 0.14, 0.24] },
      ],
      bake: [
        { kind: 'cutout', view: 'front', z: [0, 0.6], y: [-1.2, 0.3], round: 0.16, lip: 0.02 },
        { kind: 'edge', at: 'start', w: 0.06, h: 0.035 },
        { kind: 'boss', view: 'side', at: [0.32, 0.12], r: 0.065, h: 0.03 },
        // The lining band's rivets round the skull above the tail.
        { kind: 'rivets', view: 'round', at: span(0.3, 0.98, 8).map((u) => [u, 0.18]), r: 0.03, h: 0.022 },
      ],
    });
    const visor = station(null, 0.42);
    return {
      number: 5, label: 'Sallet with visor and bevor', period: 'c. 1480', sheet: 'knightSallet', cut: true,
      museum: 'The Met 04.3.229 (sallet, Adrian Treytz the Elder, Innsbruck)', link: 'https://www.metmuseum.org/art/collection/search/21984',
      line: 'The German sallet: a low skull rising to a keel, its sides belling out, drawn out behind in a long tail; a visor on pivots with its sight; the bevor from the chest to under the visor.',
      standoff: 3.5,
      sight: { y: [-0.11, -0.01], z: [0.0, 0.56] },
      regions: { shell: [0, 0.42, 1, 1], visor: [0, 0.2, 0.62, 0.42], bevor: [0, 0, 0.62, 0.2], comb: [0.62, 0, 1, 0.42] },
      parts: {
        shell,
        visor: {
          kind: 'loft', span: 0.42, seg: [16, 1], region: 'visor', look: 'metal', double: true,
          stations: [
            visor([-0.6, -0.58, -0.52], 1.24, 1.07, null, { prow: 0.08 }),
            visor(-0.3, 1.25, 1.06, null, { prow: 0.08 }),
            visor(0.05, 1.21, 0.98, null, { prow: 0.05 }),
            visor(0.24, 1.15, 0.95, null, { prow: 0.03 }),
            visor(0.42, 1.07, 0.9, null, { prow: 0.02 }),
          ],
          bake: [
            { kind: 'edge', at: 'start', w: 0.05, h: 0.03 },
            { kind: 'edge', at: 'side', w: 0.04, h: 0.025 },
            { kind: 'bead', view: 'front', line: [[0, -0.6], [0, 0.4]], w: 0.04, h: 0.025 },
            // The sight across the eyes, the stop-rib over it.
            { kind: 'slot', view: 'front', z: [0.0, 0.56], y: [-0.11, -0.01], round: 0.025, lip: 0.02, cut: true },
            { kind: 'bead', view: 'front', line: [[0, 0.1], [0.6, 0.06]], w: 0.03, h: 0.025 },
          ],
        },
        bevor: {
          kind: 'loft', span: 0.42, seg: [14, 1], region: 'bevor', look: 'metal', double: true,
          stations: [
            visor([-1.72, -1.66, -1.52], 1.26, 1.0, null, { prow: 0.08 }),
            visor([-1.38, -1.34, -1.24], 1.06, 0.93, null, { prow: 0.07 }),
            visor([-0.96, -0.94, -0.9], 1.14, 0.99, null, { prow: 0.1 }),
            visor([-0.68, -0.68, -0.68], 1.2, 1.09, null, { prow: 0.1 }),
            visor([-0.5, -0.52, -0.58], 1.2, 1.07, null, { prow: 0.09 }),
          ],
          bake: [
            { kind: 'edge', at: 'start', w: 0.05, h: 0.03 },
            { kind: 'edge', at: 'end', w: 0.05, h: 0.03 },
            { kind: 'edge', at: 'side', w: 0.04, h: 0.025 },
            { kind: 'bead', view: 'front', line: [[0, -1.7], [0, -0.52]], w: 0.05, h: 0.03 },
            { kind: 'flutes', count: 3, from: 0.05, to: 0.95, h: 0.014 },
            { kind: 'rivets', view: 'side', at: [[0.5, -0.8], [0.5, -1.1]], r: 0.03, h: 0.02 },
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
      line: 'The Renaissance close helmet: a round skull under a tall roped comb, the visor drawn forward in a beak at the mouth with its sights at its top, the upper bevor with its breaths, gorget plates at the neck.',
      standoff: 3.5,
      sight: { y: [-0.13, -0.03], z: [0.06, 0.54] },
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
            visor([-0.44, -0.4, -0.3], 1.26, 1.1, null, { prow: 0.5, prowWidth: 0.6 }),
            visor(-0.26, 1.28, 1.1, null, { prow: 0.38, prowWidth: 0.6 }),
            visor(0.02, 1.25, 0.98, null, { prow: 0.18, prowWidth: 0.65 }),
            visor(0.22, 1.18, 0.96, null, { prow: 0.08 }),
            visor(0.44, 1.08, 0.9, null, { prow: 0.02 }),
          ],
          bake: [
            { kind: 'edge', at: 'start', w: 0.05, h: 0.03, roped: true },
            { kind: 'edge', at: 'end', w: 0.05, h: 0.03 },
            { kind: 'edge', at: 'side', w: 0.04, h: 0.025 },
            { kind: 'bead', view: 'front', line: [[0, -0.42], [0, 0.42]], w: 0.05, h: 0.035 },
            // The sights, divided by a bar at the middle.
            { kind: 'slot', view: 'front', z: [0.06, 0.54], y: [-0.13, -0.03], round: 0.025, lip: 0.025, cut: true },
            { kind: 'rivets', view: 'side', at: [[0.3, 0.06]], r: 0.05, h: 0.03 },
          ],
        },
        bevor: {
          kind: 'loft', span: 0.55, seg: [16, 1], region: 'bevor', look: 'metal', double: true,
          stations: [
            bevor([-1.64, -1.62, -1.52], 1.04, 0.88, null, { prow: 0.06 }),
            bevor(-1.25, 1.08, 0.88, null, { prow: 0.1 }),
            // The lower bevor's top, the upper bevor lapping over it.
            bevor(-0.98, 1.18, 0.99, null, { prow: 0.24, prowWidth: 0.65 }),
            bevor(-0.66, 1.24, 1.08, null, { prow: 0.4, prowWidth: 0.6 }),
            // Its top tucked inside the visor's beak.
            bevor(-0.46, 1.22, 1.07, null, { prow: 0.36, prowWidth: 0.6 }),
            bevor(-0.32, 1.18, 1.05, null, { prow: 0.28, prowWidth: 0.6 }),
          ],
          bake: [
            { kind: 'edge', at: 'start', w: 0.05, h: 0.03 },
            { kind: 'edge', at: 'end', w: 0.05, h: 0.03 },
            { kind: 'edge', at: 'side', w: 0.04, h: 0.025 },
            { kind: 'bead', view: 'front', line: [[0, -1.6], [0, -0.34]], w: 0.05, h: 0.03 },
            { kind: 'step', view: 'round', y: -0.98, w: 0.03, h: 0.025 },
            // The breaths in the upper bevor, a cluster of round holes each side (Met 42.50.47).
            { kind: 'holes', view: 'front', at: grid(span(0.2, 0.42, 3), span(-0.56, -0.84, 3)), r: 0.028, cut: true },
            { kind: 'rivets', view: 'side', at: [[0.35, -0.98]], r: 0.04, h: 0.025 },
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
 * The design a knight's helmet kind is drawn in: the unit's own (`design`, a key of KNIGHT_FORMS), else the one asked for
 * (`choice`, '1'..'6'); null (drawn as before) for another kind or none asked.
 */
export function knightFormOf(kind, choice, design) {
  if (!KNIGHT_HELM_KINDS.includes(kind)) return null;
  const name = KNIGHT_FORMS[design] ? design : KNIGHT_HELM_CHOICES[choice];
  return name ? KNIGHT_FORMS[name] : null;
}

/** Triangles a design is drawn with (before outlines). */
export function knightTriangles(name) {
  return Object.values(KNIGHT_FORMS[name].parts).reduce((sum, part) => {
    const [nu, nv] = formCuts(part);
    return sum + nu * nv * 2;
  }, 0);
}
