// The knights' helmets under study: six closed helmets of the knight's two centuries, each remodelled from a surviving
// piece as measured surfaces (helmforms.js's lofts and sweeps, fitted over the same head), their fine work (rivets, turned
// and roped edges, the sights and breaths, hinges, vervelles, mail) baked in each one's sheet (tools/blender/knighthelms.py
// reads what is here through tools/knighthelms-dump.mjs), the sights, breaths and face openings cut out of the metal by the
// sheet (helmmaps.js helmMaterial `cut`). Plain (no Three.js).
//
// Any helmet kind a knight wears (KNIGHT_HELM_KINDS: the knight's bascinet, the Templar's great helm) is drawn in a design
// when one is asked for: `#knighthelm=1..6` in the address or `boxer.helmStyle({ knight: 3 })` (helmstyle.js), or by a unit
// naming it (`head.design`, a key of KNIGHT_FORMS). Without either it is drawn as before.
//
// Head coordinates as helmforms.js's: x forward, y up, z left, in head radii (r ≈ 11.5 cm drawn), the eyes at y ≈ -0.07,
// the nose's tip at y = -0.5 (x 1.15), the chin near y = -1.33. The pieces, and their measures (cm):
//
//   1 greatHelm    the great helm of Albrecht von Prankh, c. 1330-40 (Kunsthistorisches Museum Vienna, Hofjagd- und
//                  Rüstkammer B 74: 24.2 broad, 31 deep, the helm 5.2 kg): two face plates meeting in a ridge down the
//                  middle, two neck plates, a flat top plate riveted round; the sights two slits under the brow, either
//                  side of the ridge; breaths in the lower face; the cross cut for the chain. Royal Armouries IV.600, English,
//                  mid-14th century, is its kind. It rests on the padded arming cap and the shoulders, standing off the face.
//   2 hounskull    the visored bascinet, Musée de l'Armée H 21, c. 1350-80 (20 broad, 29 high, 3.25 kg): a tall pointed
//                  skull down to the jaw and nape, the "hound's skull" visor drawn out in a snout on pivots at the temples,
//                  its sights flanged, breaths in the snout; the mail aventail hung from vervelles round the skull's edge.
//   3 greatBascinet the great bascinet, British Museum OA.2190, c. 1410-30 (44 high, 24 broad, 26 deep, 3.95 kg): the
//                  skull an egg, drawn down behind over the neck and in front into plates over the throat, so the head
//                  turns inside it; the rounded visor on side hinges, pierced with many holes for sight and breath.
//   4 armet        the Italian armet, Missaglia workshop, Milan c. 1460 (Met 29.158.22: 29.2 high, 21.6 broad, 28.6 deep,
//                  2.75 kg; Met 42.50.2, Lionardo, c. 1440): a close skull with a low comb, the cheek pieces hinged over
//                  the ears and closing at the chin, the visor on pivots with its sight across, and the rondel standing off
//                  the nape on its stem (to guard the cheek pieces' strap).
//   5 sallet       the German sallet with visor and bevor, Adrian Treytz the Elder, Innsbruck c. 1480 (Met 04.3.229: 24.8
//                  high, 37.1 deep with its tail; the visored sallet of the Walters 51.470, c. 1480-90): the skull fluted,
//                  drawn out behind in a long tail, the visor on pivots with its sight; the bevor from the chest to under
//                  the visor.
//   6 closeHelmet  the close helmet, c. 1550 (Met 42.50.47: 29.8 high, 22.2 broad, 33.7 deep, 2.66 kg): the skull with a
//                  tall roped comb, the pointed visor with its sights divided by a bar, the upper bevor with its breaths
//                  in rows, the bevor and the gorget plates at the neck (British Museum 1881,0802.41's breaths, c. 1520).
//
// Each part is a loft or a sweep as in helmforms.js (`seg` its cuts round and along); `region` its rectangle of the
// design's sheet; `look` 'metal', 'mail' (the aventail, both sides drawn) or 'liner' (the dark padded arming cap inside,
// seen through the sights: no sheet). `bake`: what knighthelms.py raises, sinks and cuts on it, in its own measures:
//
//   view 'front'   (|z|, y) on the part's front (x > 0): a sight or breath where the eyes or mouth are, seen face on
//   view 'side'    (x, y) on its sides (|z| > 0.3): a hinge, a seam behind the ear
//   view 'round'   (share of the way round from the face's middle (0) to the back (1) or the part's edge, y)
//   edge 'start' / 'end' / 'side'   along the part's first or last station, or its edge round (a visor's side)

import { formCuts, formFitPart, formGrid, formSeat } from './helmforms.js';
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

/**
 * The padded arming cap and lining inside (dark), seen through the sights and breaths where the head is not drawn: the
 * helmet's own shell a little within itself, at every other station.
 */
function linerOf(part) {
  const stations = part.stations.filter((_, index, all) => index % 2 === 0 || index === all.length - 1);
  const pull = (keys) => (typeof keys === 'number' ? keys * 0.9 : keys.map((value) => value * 0.9));
  return { kind: 'loft', span: 1, seg: [12, 1], region: null, look: 'liner', stations: stations.map(({ y, rad }) => ({ y, rad: pull(rad) })) };
}

/** A low ridge (a comb) standing on a part in the middle plane, from `front` to `back` (x), at most `high` tall. */
function comb(seat, { front, back, high, w = 0.025, seg = [6, 1], region = 'comb', bake = [] }) {
  const feet = Array.from({ length: 7 }, (_, index) => front + ((back - front) * index) / 6);
  const rise = [0.25, 0.7, 0.94, 1, 0.94, 0.7, 0.25];
  return { kind: 'sweep', seg, region, look: 'metal', square: 0.7, seat, bake, stations: feet.map((foot, index) => ({ foot, rise: [0, high * rise[index]], w })) };
}

export const KNIGHT_FORMS = {
  greatHelm: {
    number: 1, label: 'Great helm', period: 'c. 1330–1340', sheet: 'knightGreatHelm', cut: true,
    museum: 'Kunsthistorisches Museum Vienna, HJRK B 74 (helm of Albrecht von Prankh)', link: 'https://www.khm.at/en/object/373606',
    line: 'A flat-topped great helm of riveted plates: two slit sights under the brow either side of a medial ridge, a cross reinforce, breaths in the lower face.',
    standoff: 5.2,
    sight: { y: [-0.13, -0.01], z: [0.07, 0.62] },
    regions: { shell: [0, 0, 1, 1] },
    parts: {
      shell: {
        kind: 'loft', span: 1, seg: [28, 1], region: 'shell', look: 'metal',
        stations: [
          { y: [-1.72, -1.72, -1.7, -1.72, -1.74], rad: [1.16, 1.09, 0.97, 1.12, 1.2] },
          { y: -1.25, rad: [1.25, 1.15, 1.0, 1.15, 1.24] },
          { y: -0.6, rad: [1.31, 1.19, 1.03, 1.17, 1.28] },
          { y: 0.2, rad: [1.32, 1.2, 1.04, 1.18, 1.29] },
          { y: 0.75, rad: [1.27, 1.16, 1.02, 1.16, 1.26] },
          { y: 1.18, rad: [1.2, 1.11, 0.99, 1.13, 1.22] },
          { y: 1.18, rad: [1.2, 1.11, 0.99, 1.13, 1.22] },
          { y: 1.24, rad: [0.8, 0.74, 0.66, 0.75, 0.81] },
          { y: 1.27, rad: 0 },
        ],
        bake: [
          { kind: 'edge', at: 'start', w: 0.06, h: 0.04 },
          // The face plates meet in a ridge down the middle; the cross reinforce over the brow and down the face.
          { kind: 'bead', view: 'front', line: [[0, -1.7], [0, 1.18]], w: 0.05, h: 0.035 },
          { kind: 'band', view: 'front', z: [0, 0.78], y: [0.0, 0.2], h: 0.02 },
          { kind: 'band', view: 'front', z: [0, 0.07], y: [-1.0, 0.2], h: 0.02 },
          { kind: 'rivets', view: 'front', at: [...span(0.12, 0.7, 6).map((z) => [z, 0.1]), ...span(-0.2, -0.9, 4).map((y) => [0.0, y])], r: 0.028, h: 0.02 },
          // The sights: two slits under the brow's edge, the brow plate's lip standing over them.
          { kind: 'slot', view: 'front', z: [0.07, 0.62], y: [-0.13, -0.01], round: 0.02, lip: 0.015, cut: true },
          // The breaths in the lower face plates, and the cross cut for the chain to the breast.
          { kind: 'holes', view: 'front', at: grid(span(0.2, 0.5, 3), span(-0.42, -1.02, 5)), r: 0.032, cut: true },
          { kind: 'cross', view: 'front', at: [0.42, -1.38], arm: 0.09, w: 0.03, cut: true },
          // The seams where the face plates meet the neck plates (behind the ears), riveted; the top plate's rivets round.
          { kind: 'bead', view: 'round', line: [[0.56, -1.7], [0.56, 1.18]], w: 0.02, h: -0.012 },
          { kind: 'rivets', view: 'round', at: span(-1.5, 1.0, 7).map((y) => [0.53, y]), r: 0.03, h: 0.022 },
          { kind: 'rivets', view: 'round', at: span(0.04, 0.96, 12).map((u) => [u, 1.12]), r: 0.03, h: 0.022 },
          { kind: 'step', view: 'round', y: 1.18, w: 0.03, h: 0.025 },
        ],
      },
      liner: true,
    },
  },
  hounskull: {
    number: 2, label: 'Hounskull bascinet', period: 'c. 1350–1400', sheet: 'knightHounskull', cut: true,
    museum: "Musée de l'Armée, Paris, H 21 (visored bascinet)", link: 'https://musee-armee.fr/en/collections/museum-treasures/hounskull-bascinet.html',
    line: 'A tall pointed bascinet with the snouted "pig-faced" visor on pivots at the temples, flanged sights, breaths in the snout and a mail aventail.',
    standoff: 3.5,
    sight: { y: [-0.15, -0.04], z: [0.1, 0.52] },
    regions: { skull: [0, 0.45, 1, 1], visor: [0, 0.2, 0.6, 0.45], aventail: [0, 0, 1, 0.2] },
    parts: {
      skull: {
        kind: 'loft', span: 1, seg: [24, 2], region: 'skull', look: 'metal',
        stations: [
          { y: [-1.32, -1.32, -1.3, -1.22, -1.12], rad: [1.0, 1.04, 0.98, 1.02, 1.06] },
          { y: -0.6, rad: [1.06, 1.13, 1.05, 1.08, 1.14] },
          { y: 0.0, rad: [1.17, 1.07, 0.93, 1.08, 1.19] },
          { y: 0.5, rad: [1.03, 0.95, 0.84, 0.98, 1.09] },
          { y: 0.95, rad: [0.75, 0.69, 0.62, 0.72, 0.82] },
          { y: 1.25, rad: [0.36, 0.33, 0.3, 0.36, 0.42] },
          { y: 1.46, rad: 0 },
        ],
        bake: [
          // The face opening (under the visor), its edge turned.
          { kind: 'cutout', view: 'front', z: [0, 0.62], y: [-1.6, 0.28], round: 0.18, lip: 0.02 },
          { kind: 'edge', at: 'start', w: 0.06, h: 0.035 },
          // The vervelles (staples) round the foot for the aventail's lace, the leather band they pass through.
          { kind: 'staples', view: 'round', at: span(0.2, 0.98, 12).map((u) => [u, 0.0]), w: 0.03, l: 0.07, h: 0.03, above: 0.12 },
          // The visor's pivots at the temples, on plates riveted to the skull.
          { kind: 'boss', view: 'side', at: [0.28, 0.1], r: 0.08, h: 0.035 },
          { kind: 'rivets', view: 'side', at: [[0.28, 0.25], [0.28, -0.05]], r: 0.025, h: 0.018 },
        ],
      },
      visor: {
        kind: 'loft', span: 0.45, seg: [16, 2], region: 'visor', look: 'metal', double: true,
        stations: [
          { y: [-1.42, -1.38, -1.28], rad: [1.12, 1.08, 1.0] },
          { y: [-0.95, -0.95, -0.92], rad: [1.62, 1.36, 1.02] },
          { y: -0.5, rad: [1.98, 1.55, 1.04] },
          { y: -0.1, rad: [1.66, 1.4, 1.04] },
          { y: 0.22, rad: [1.28, 1.2, 1.02] },
          { y: 0.42, rad: [1.12, 1.1, 1.0] },
        ],
        bake: [
          { kind: 'edge', at: 'start', w: 0.05, h: 0.03 },
          { kind: 'edge', at: 'end', w: 0.05, h: 0.03 },
          { kind: 'edge', at: 'side', w: 0.04, h: 0.025 },
          { kind: 'bead', view: 'front', line: [[0, -1.4], [0, 0.4]], w: 0.04, h: 0.03 },
          // The sights: one over each eye, their lips flanged out.
          { kind: 'slot', view: 'front', z: [0.1, 0.52], y: [-0.15, -0.04], round: 0.03, lip: 0.03, cut: true },
          // The breaths in the snout below them.
          { kind: 'holes', view: 'front', at: grid(span(0.12, 0.42, 4), span(-0.55, -1.0, 4)), r: 0.03, cut: true },
          { kind: 'rivets', view: 'side', at: [[0.3, 0.1]], r: 0.05, h: 0.03 },
        ],
      },
      aventail: {
        kind: 'loft', span: 1, seg: [24, 2], region: 'aventail', look: 'mail', double: true,
        stations: [
          { y: [-1.24, -1.24, -1.22, -1.14, -1.04], rad: [0.96, 1.0, 0.95, 0.99, 1.03] },
          { y: -1.7, rad: [1.14, 1.2, 1.26, 1.24, 1.2] },
          { y: [-2.16, -2.16, -2.12, -2.16, -2.2], rad: [1.46, 1.56, 1.68, 1.62, 1.5] },
        ],
        bake: [{ kind: 'mail' }, { kind: 'edge', at: 'start', w: 0.04, h: 0.03, leather: true }],
      },
      liner: true,
    },
  },
  greatBascinet: {
    number: 3, label: 'Great bascinet', period: 'c. 1410–1440', sheet: 'knightGreatBascinet', cut: true,
    museum: 'British Museum OA.2190 (great bascinet)', link: 'https://www.britishmuseum.org/collection/object/H_OA-2190',
    line: 'An egg-shaped skull drawn down over the neck and throat in plates, so the head turns inside it; a rounded visor on side hinges pierced with sights and many breaths.',
    standoff: 3.8,
    sight: { y: [-0.13, -0.03], z: [0.08, 0.5] },
    regions: { shell: [0, 0.35, 1, 1], visor: [0, 0, 0.7, 0.35] },
    parts: {
      shell: {
        kind: 'loft', span: 1, seg: [24, 2], region: 'shell', look: 'metal',
        stations: [
          { y: [-2.05, -2.1, -2.2, -2.3, -2.35], rad: [1.14, 1.22, 1.3, 1.28, 1.22] },
          { y: -1.62, rad: [1.0, 1.05, 1.04, 1.04, 1.02] },
          { y: -1.0, rad: [1.06, 1.13, 1.0, 1.04, 1.1] },
          { y: -0.4, rad: [1.26, 1.17, 1.04, 1.08, 1.17] },
          { y: 0.2, rad: [1.18, 1.08, 0.93, 1.08, 1.2] },
          { y: 0.7, rad: [0.96, 0.9, 0.8, 0.93, 1.03] },
          { y: 1.15, rad: [0.52, 0.5, 0.46, 0.54, 0.6] },
          { y: 1.4, rad: 0 },
        ],
        bake: [
          { kind: 'cutout', view: 'front', z: [0, 0.6], y: [-1.18, 0.3], round: 0.2, lip: 0.025 },
          { kind: 'edge', at: 'start', w: 0.06, h: 0.04 },
          // The plates over the throat and the back of the neck, each riveted to the next.
          { kind: 'step', view: 'round', y: -1.72, w: 0.03, h: 0.025 },
          { kind: 'step', view: 'round', y: -1.95, w: 0.03, h: 0.025 },
          { kind: 'rivets', view: 'round', at: [0.05, 0.2, 0.35, 0.65, 0.8, 0.95].flatMap((u) => [[u, -1.68], [u, -1.91]]), r: 0.028, h: 0.02 },
          // The visor's hinges each side: a plate with its pin, riveted.
          { kind: 'plate', view: 'side', x: [0.12, 0.42], y: [0.0, 0.22], h: 0.018 },
          { kind: 'boss', view: 'side', at: [0.28, 0.11], r: 0.05, h: 0.03 },
          { kind: 'rivets', view: 'side', at: [[0.17, 0.05], [0.37, 0.05], [0.17, 0.17], [0.37, 0.17]], r: 0.022, h: 0.016 },
          { kind: 'rivets', view: 'round', at: span(0.3, 0.98, 8).map((u) => [u, 0.42]), r: 0.025, h: 0.016 },
        ],
      },
      visor: {
        kind: 'loft', span: 0.42, seg: [16, 2], region: 'visor', look: 'metal', double: true,
        stations: [
          { y: [-1.25, -1.2, -1.12], rad: [1.2, 1.12, 1.02] },
          { y: -0.7, rad: [1.42, 1.3, 1.1] },
          { y: -0.2, rad: [1.42, 1.3, 1.08] },
          { y: 0.2, rad: [1.3, 1.2, 1.02] },
          { y: 0.44, rad: [1.16, 1.1, 0.98] },
        ],
        bake: [
          { kind: 'edge', at: 'start', w: 0.05, h: 0.03 },
          { kind: 'edge', at: 'end', w: 0.05, h: 0.03 },
          { kind: 'edge', at: 'side', w: 0.04, h: 0.025 },
          { kind: 'bead', view: 'front', line: [[0, -1.2], [0, 0.42]], w: 0.045, h: 0.03 },
          { kind: 'slot', view: 'front', z: [0.08, 0.5], y: [-0.13, -0.03], round: 0.03, lip: 0.025, cut: true },
          // Many small holes for sight and breath below.
          { kind: 'holes', view: 'front', at: grid(span(0.1, 0.55, 5), span(-0.34, -0.94, 6)), r: 0.024, cut: true },
        ],
      },
      liner: true,
    },
  },
  armet: {
    number: 4, label: 'Italian armet', period: 'c. 1440–1470', sheet: 'knightArmet', cut: true,
    museum: 'The Met 29.158.22 (armet, Missaglia workshop, Milan)', link: 'https://www.metmuseum.org/art/collection/search/23232',
    line: 'A close skull with a low comb, cheek pieces hinged over the ears and closing at the chin, a visor on pivots, and the rondel on its stem at the nape.',
    standoff: 3.5,
    sight: { y: [-0.12, -0.02], z: [0.0, 0.56] },
    regions: { shell: [0, 0.38, 1, 1], visor: [0, 0.1, 0.62, 0.38], rondel: [0.62, 0.1, 1, 0.38], comb: [0, 0, 1, 0.1] },
    parts: {
      shell: {
        kind: 'loft', span: 1, seg: [24, 2], region: 'shell', look: 'metal',
        stations: [
          { y: [-1.55, -1.55, -1.5, -1.45, -1.42], rad: [0.78, 0.76, 0.7, 0.68, 0.7] },
          { y: -1.25, rad: [0.98, 0.96, 0.78, 0.74, 0.72] },
          { y: -0.75, rad: [1.08, 1.11, 1.05, 0.97, 0.86] },
          { y: -0.2, rad: [1.18, 1.11, 0.98, 1.05, 1.16] },
          { y: 0.4, rad: [1.04, 0.97, 0.85, 1.0, 1.12] },
          { y: 0.9, rad: [0.74, 0.68, 0.61, 0.73, 0.8] },
          { y: 1.17, rad: [0.38, 0.35, 0.32, 0.37, 0.41] },
          { y: 1.27, rad: 0 },
        ],
        bake: [
          { kind: 'cutout', view: 'front', z: [0, 0.5], y: [-0.82, 0.3], round: 0.15, lip: 0.02 },
          { kind: 'edge', at: 'start', w: 0.05, h: 0.035 },
          // The cheek pieces' edges: from the hinge over the ear down behind the jaw to the neck, and their meeting at the chin.
          { kind: 'bead', view: 'side', line: [[0.62, 0.3], [0.1, 0.36], [-0.42, 0.22], [-0.6, -0.3], [-0.5, -1.5]], w: 0.025, h: -0.016 },
          { kind: 'bead', view: 'side', line: [[0.1, 0.38], [-0.42, 0.24]], w: 0.03, h: 0.012 },
          { kind: 'bead', view: 'front', line: [[0, -0.84], [0, -1.55]], w: 0.025, h: -0.016 },
          { kind: 'boss', view: 'side', at: [-0.2, 0.33], r: 0.06, h: 0.03 },
          { kind: 'rivets', view: 'side', at: [[0.32, 0.36], [-0.48, -0.2], [-0.55, -0.9]], r: 0.025, h: 0.018 },
          // The visor's pivot at the temple, the strap's turning pin at the chin, the lining's rivets round.
          { kind: 'boss', view: 'side', at: [0.4, 0.08], r: 0.06, h: 0.03 },
          { kind: 'rivets', view: 'front', at: [[0.0, -1.2]], r: 0.045, h: 0.03 },
          { kind: 'rivets', view: 'round', at: span(0.42, 0.98, 6).map((u) => [u, 0.62]), r: 0.024, h: 0.016 },
        ],
      },
      visor: {
        kind: 'loft', span: 0.5, seg: [16, 2], region: 'visor', look: 'metal', double: true,
        stations: [
          { y: [-0.95, -0.9, -0.75], rad: [1.2, 1.12, 1.02] },
          { y: -0.5, rad: [1.42, 1.24, 1.04] },
          { y: -0.15, rad: [1.36, 1.22, 1.02] },
          { y: 0.2, rad: [1.24, 1.14, 0.98] },
          { y: 0.44, rad: [1.1, 1.04, 0.92] },
        ],
        bake: [
          { kind: 'edge', at: 'start', w: 0.05, h: 0.03 },
          { kind: 'edge', at: 'end', w: 0.05, h: 0.03 },
          { kind: 'edge', at: 'side', w: 0.04, h: 0.025 },
          { kind: 'bead', view: 'front', line: [[0, -0.92], [0, 0.42]], w: 0.05, h: 0.035 },
          // The sight across both eyes, its lower lip turned out; breaths on the lower visor.
          { kind: 'slot', view: 'front', z: [0.0, 0.56], y: [-0.12, -0.02], round: 0.025, lip: 0.03, cut: true },
          { kind: 'holes', view: 'front', at: grid(span(0.22, 0.44, 3), span(-0.42, -0.72, 3)), r: 0.026, cut: true },
        ],
      },
      rondel: {
        kind: 'sweep', seg: [14, 1], region: 'rondel', look: 'metal',
        stations: [
          { at: [-0.84, -0.98], r: 0.035, rz: 1 },
          { at: [-1.0, -0.98], r: 0.035, rz: 1 },
          { at: [-1.04, -0.98], r: 0.035, rz: 1 },
          { at: [-1.05, -0.98], r: 0.27, rz: 1 },
          { at: [-1.08, -0.98], r: 0.27, rz: 1 },
          { at: [-1.085, -0.98], r: 0.004, rz: 1 },
        ],
        bake: [{ kind: 'rivets', view: 'side', at: [[-1.08, -0.98]], r: 0.05, h: 0.03 }],
      },
      comb: comb('shell', { front: 0.85, back: -1.0, high: 0.05 }),
      liner: true,
    },
  },
  sallet: (() => {
    const shell = formFitPart({
      kind: 'loft', span: 1, seg: [28, 1], region: 'shell', look: 'metal',
      fit: { foot: [-0.5, -0.55, -0.66, -0.74, -0.76], gap: 0.15, top: 0.24, lift: 0.14, rows: 9 },
      // The tail: out behind, a little at the sides, none before the face.
      flare: [
        { dy: [-0.01, -0.03, -0.08, -0.28, -0.4], out: [0.01, 0.03, 0.08, 0.5, 0.86] },
        { dy: [-0.005, -0.015, -0.04, -0.13, -0.18], out: [0.005, 0.012, 0.03, 0.2, 0.34] },
      ],
      bake: [
        { kind: 'cutout', view: 'front', z: [0, 0.6], y: [-1.2, 0.3], round: 0.16, lip: 0.02 },
        { kind: 'edge', at: 'start', w: 0.06, h: 0.035 },
        // The Gothic flutes, fanning back from the brow over the skull and out along the tail.
        { kind: 'flutes', count: 7, from: 0.25, to: 0.94, h: 0.02 },
        { kind: 'boss', view: 'side', at: [0.32, 0.12], r: 0.065, h: 0.03 },
        { kind: 'rivets', view: 'round', at: span(0.4, 0.98, 6).map((u) => [u, 0.3]), r: 0.026, h: 0.018 },
      ],
    });
    return {
      number: 5, label: 'Sallet with visor and bevor', period: 'c. 1480', sheet: 'knightSallet', cut: true,
      museum: 'The Met 04.3.229 (sallet, Adrian Treytz the Elder, Innsbruck)', link: 'https://www.metmuseum.org/art/collection/search/21984',
      line: 'The German Gothic sallet: a fluted skull drawn out behind in a long tail, a visor on pivots with its sight, and a bevor from the chest to under the visor.',
      standoff: 3.5,
      sight: { y: [-0.11, -0.01], z: [0.0, 0.58] },
      regions: { shell: [0, 0.42, 1, 1], visor: [0, 0.2, 0.62, 0.42], bevor: [0, 0, 0.62, 0.2], comb: [0.62, 0, 1, 0.42] },
      parts: {
        shell,
        visor: {
          kind: 'loft', span: 0.42, seg: [16, 2], region: 'visor', look: 'metal', double: true,
          stations: [
            { y: [-0.62, -0.6, -0.56], rad: [1.32, 1.24, 1.1] },
            { y: -0.25, rad: [1.32, 1.23, 1.08] },
            { y: 0.1, rad: [1.25, 1.16, 1.02] },
            { y: 0.42, rad: [1.12, 1.07, 0.96] },
          ],
          bake: [
            { kind: 'edge', at: 'start', w: 0.05, h: 0.03 },
            { kind: 'edge', at: 'side', w: 0.04, h: 0.025 },
            { kind: 'bead', view: 'front', line: [[0, -0.6], [0, 0.4]], w: 0.04, h: 0.025 },
            // The sight across the eyes, the stop-rib over it.
            { kind: 'slot', view: 'front', z: [0.0, 0.58], y: [-0.11, -0.01], round: 0.025, lip: 0.02, cut: true },
            { kind: 'bead', view: 'front', line: [[0, 0.1], [0.6, 0.06]], w: 0.03, h: 0.025 },
          ],
        },
        bevor: {
          kind: 'loft', span: 0.42, seg: [14, 2], region: 'bevor', look: 'metal', double: true,
          stations: [
            { y: [-1.72, -1.66, -1.52], rad: [1.32, 1.2, 1.0] },
            { y: [-1.38, -1.34, -1.24], rad: [1.13, 1.05, 0.93] },
            { y: [-0.96, -0.94, -0.9], rad: [1.24, 1.13, 0.98] },
            { y: [-0.68, -0.68, -0.68], rad: [1.3, 1.22, 1.08] },
            { y: [-0.5, -0.52, -0.58], rad: [1.25, 1.17, 1.05] },
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
        comb: comb('shell', { front: 0.8, back: -1.05, high: 0.05 }),
        liner: true,
      },
    };
  })(),
  closeHelmet: {
    number: 6, label: 'Close helmet', period: 'c. 1520–1560', sheet: 'knightCloseHelmet', cut: true,
    museum: 'The Met 42.50.47 (close-helmet for the field)', link: 'https://www.metmuseum.org/art/collection/search/26508',
    line: 'The Renaissance close helmet: a tall roped comb, a pointed visor with sights divided by a bar, breaths in rows in the upper bevor, gorget plates at the neck.',
    standoff: 3.5,
    sight: { y: [-0.13, -0.03], z: [0.06, 0.56] },
    regions: { shell: [0, 0.4, 1, 1], visor: [0, 0.2, 0.55, 0.4], bevor: [0, 0, 0.55, 0.2], comb: [0.55, 0, 1, 0.4] },
    parts: {
      shell: {
        kind: 'loft', span: 1, seg: [24, 2], region: 'shell', look: 'metal',
        stations: [
          { y: [-1.78, -1.78, -1.74, -1.76, -1.78], rad: [1.02, 1.04, 0.98, 0.98, 0.98] },
          { y: -1.5, rad: [0.88, 0.86, 0.77, 0.74, 0.76] },
          { y: -1.1, rad: [1.04, 1.0, 0.88, 0.82, 0.72] },
          { y: -0.5, rad: [1.2, 1.13, 1.05, 1.06, 1.02] },
          { y: 0.0, rad: [1.18, 1.04, 0.92, 1.05, 1.18] },
          { y: 0.5, rad: [1.01, 0.93, 0.83, 0.96, 1.08] },
          { y: 0.95, rad: [0.72, 0.66, 0.6, 0.69, 0.77] },
          { y: 1.2, rad: [0.32, 0.3, 0.28, 0.32, 0.35] },
          { y: 1.26, rad: 0 },
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
        kind: 'loft', span: 0.48, seg: [16, 2], region: 'visor', look: 'metal', double: true,
        stations: [
          { y: [-0.42, -0.4, -0.3], rad: [1.36, 1.22, 1.03] },
          { y: -0.15, rad: [1.4, 1.24, 1.03] },
          { y: 0.15, rad: [1.28, 1.16, 1.0] },
          { y: 0.44, rad: [1.1, 1.04, 0.94] },
        ],
        bake: [
          { kind: 'edge', at: 'start', w: 0.05, h: 0.03, roped: true },
          { kind: 'edge', at: 'end', w: 0.05, h: 0.03 },
          { kind: 'edge', at: 'side', w: 0.04, h: 0.025 },
          { kind: 'bead', view: 'front', line: [[0, -0.4], [0, 0.42]], w: 0.05, h: 0.035 },
          // The sights, divided by a bar at the middle.
          { kind: 'slot', view: 'front', z: [0.06, 0.56], y: [-0.13, -0.03], round: 0.025, lip: 0.025, cut: true },
          { kind: 'rivets', view: 'side', at: [[0.3, 0.06]], r: 0.05, h: 0.03 },
        ],
      },
      bevor: {
        kind: 'loft', span: 0.55, seg: [16, 2], region: 'bevor', look: 'metal', double: true,
        stations: [
          { y: [-1.64, -1.62, -1.52], rad: [1.06, 1.03, 0.92] },
          { y: -1.25, rad: [1.12, 1.07, 0.93] },
          { y: -0.8, rad: [1.32, 1.19, 0.99] },
          { y: -0.46, rad: [1.33, 1.2, 1.0] },
          { y: -0.3, rad: [1.28, 1.17, 0.98] },
        ],
        bake: [
          { kind: 'edge', at: 'start', w: 0.05, h: 0.03 },
          { kind: 'edge', at: 'end', w: 0.05, h: 0.03 },
          { kind: 'edge', at: 'side', w: 0.04, h: 0.025 },
          { kind: 'bead', view: 'front', line: [[0, -1.6], [0, -0.32]], w: 0.05, h: 0.03 },
          // The upper bevor over the lower: their lap, and the breaths in rows in the upper.
          { kind: 'step', view: 'round', y: -0.98, w: 0.03, h: 0.025 },
          { kind: 'slots', view: 'front', z: [0.12, 0.46], y: span(-0.5, -0.86, 4), h: 0.035, round: 0.016, cut: true },
          { kind: 'rivets', view: 'side', at: [[0.35, -0.98]], r: 0.04, h: 0.025 },
        ],
      },
      comb: comb('shell', { front: 0.82, back: -1.02, high: 0.34, bake: [{ kind: 'edge', at: 'top', w: 0.03, h: 0.015 }] }),
      liner: true,
    },
  },
};

// The combs seated on their skulls, the linings made inside them, and how high each stands (where a plume goes).
for (const form of Object.values(KNIGHT_FORMS)) {
  formSeat(form);
  if (form.parts.liner === true) form.parts.liner = linerOf(form.parts.shell ?? form.parts.skull);
  form.top = Math.max(...Object.values(form.parts).flatMap((part) => formGrid(part).positions.filter((_, index) => index % 3 === 1)));
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
