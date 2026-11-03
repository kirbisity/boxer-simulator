// The Chinese soldiers' helmets as data: the Ming rank and file's four helmets (the brigandine man's `mingHat` in a design),
// the Western Han lamellar hood (`hanHelm`), and the horsehair tassels and feathers they carry, which swing. Plain (no
// Three.js): chinahelmview.js draws them; the tests read the same surfaces.
//
// Head coordinates as in helmforms.js: x forward, y up, z left, in head radii, the head's centre at the origin. A shell is a
// surface round the upright axis: at azimuth θ (0 the face, +π/2 the left) and height y its distance from the axis is the
// design's outline `profile` (a scale of its foot ellipse, `ellipse` [half-length, half-breadth]) but never less than the
// head (helmforms.js headRadiusAt) and a lining's room (`gap`) — fitted over the head, longer than broad. Its texture runs
// once round (u = 0.5 at the face, the seam behind, increasing to the wearer's right) and up (v by the length of the face's meridian), the brim's at the
// bottom of the sheet (v < BRIM_V).
//
// References (the user's four photographs of reconstructed and surviving Ming soldiers' helmets, and):
//   The painted iron helmet from the tomb of Zhu Zhanji (朱瞻垍, d. 1441), Prince Zhuang of Liang (梁庄王墓, Zhongxiang, Hubei,
//     excavated 2001; Hubei Provincial Museum): 18 cm high, 26 x 23.8 cm across, a frame of twelve iron strips covered in hemp
//     cloth lacquered red, 勇 written in gold on the front: https://artsandculture.google.com/asset/painted-iron-helmet/gQGA1QyaBheFyg
//   The Ming arsenals' helmets in the Da Ming Huidian and the Huangming Jingshi Wenbian: 朱红油贴金勇字直檐铁盔 (vermilion,
//     gilt 勇, straight-brimmed iron helmets), 水磨盔 / 明盔 (bright polished iron, general from the Zhengtong reign on), the
//     四明 / 六叶盔 of four or six riveted plates, the 一块铁 raised in one piece (Bing Lu): https://m.163.com/dy/article/HBA7CI8T0523WLD9.html
//   The Wanli emperor's six-plate helmet from the Dingling, and the Mu family's iron helmet from Yunnan (same article); the
//     soldiers of 出警入跸图 and 平番得胜图 in brimmed bowls with tassels.
//   Wu Bei Yao Lue's rank-and-file iron helmets: https://greatmingmilitary.blogspot.com/2015/02/plate-armour-of-ming-dynasty.html
//   The Western Han lamellar helmet (兜鍪) of the King of Qi's tomb at Linzi (Zibo), vertical iron lamellae laced in rows, a
//     cheek-and-neck hood in one; and the user's two photographs of its reconstruction (padded cloth rim, pheasant feathers).

import { headRadiusAt } from './helmforms.js';

const CHINA_TAU = Math.PI * 2;

/** The share of the sheet (v) the brim takes, at the bottom; the shell runs from SHELL_V up. */
export const BRIM_V = 0.08;
export const SHELL_V = 0.1;

/**
 * The finishes: the metal's colour, metalness and roughness (and what is drawn on it). `steel` the bright polished iron
 * (水磨, 明盔); `dark` blackened (the cloud-scroll helmet); `iron` the plain issue iron; `red` the vermilion lacquer with
 * 勇 in gold (the arsenals' 朱红油贴金勇字盔).
 */
export const CHINA_FINISHES = {
  steel: { label: 'Raw steel', colour: '#c3c8cf', metalness: 0.95, roughness: 0.3 },
  dark: { label: 'Blackened steel', colour: '#3c3e42', accent: '#b4b9c0', metalness: 0.7, roughness: 0.42 },
  iron: { label: 'Plain iron', colour: '#6c6862', metalness: 0.6, roughness: 0.6 },
  red: { label: 'Vermilion lacquer, 勇 in gold', colour: '#b51f1a', metalness: 0.08, roughness: 0.42, glyph: '#ecd28c' },
  hanIron: { label: 'Dark iron, red lacing', colour: '#8a837a', accent: '#a09a90', metalness: 0.5, roughness: 0.45, lace: '#a1282a' },
  // The banners' helmets (QING_HELMS): the rank and file's iron (or leather) bowl lacquered black, its band and
  // visor gilt (`accent`); the Bayara's polished steel under gilt openwork (`gilt` the tube's and the finial's).
  blackLacquer: { label: 'Black lacquer, gilt band', colour: '#17171b', accent: '#c9a24a', metalness: 0.15, roughness: 0.32 },
  giltSteel: { label: 'Polished steel, gilt openwork', colour: '#c3c8cf', accent: '#d2aa4c', metalness: 0.95, roughness: 0.3 },
  gilt: { label: 'Gilt', colour: '#c9a24a', metalness: 0.9, roughness: 0.32 },
};

// A bell: near upright sides above the brim, round shoulders, drawn in to a small flat top (y, scale of the foot ellipse).
const CHINA_BELL = [[0.16, 1], [0.4, 1.02], [0.75, 1.0], [1.05, 0.91], [1.3, 0.77], [1.5, 0.6], [1.66, 0.43], [1.79, 0.26], [1.86, 0.12]];

/**
 * The Ming rank and file's helmets. Each: its name and period, references, its finish, its foot (y of the brim's seat)
 * and its `profile` [y, scale], the foot `ellipse`, a `brim` (`reach` out, `fall` at the edge, `lip` turned down), the plates
 * it is riveted of (`plates`: seams drawn in the sheet; `strips`: raised riveted strips over them), a `band` round the foot,
 * a cloud scroll on each plate (`scroll`), the glyph (`glyph`), a `finial` (a knob or a tube) and what it carries (`plume`).
 */
export const MING_HELMS = {
  cloudBell: {
    label: 'Cloud-scroll bell helmet', zh: '云纹钵胄', period: 'Ming, 16th c.', finish: 'dark',
    note: 'A bell of eight riveted plates, cloud scrolls cut on each, a polished band and a wide flat brim (笠形盔); after the user\'s photo 1 and the Dingling and Mu family plate helmets.',
    profile: CHINA_BELL, ellipse: [1.17, 0.97], gap: 0.13,
    brim: { reach: 0.56, fall: 0.07, lip: 0.035 },
    plates: 8, scroll: true, band: true, rivets: true,
    finial: { kind: 'knob', r: 0.1 },
  },
  rivetedTube: {
    label: 'Riveted six-plate helmet', zh: '六叶明盔', period: 'Ming, late 16th c.', finish: 'steel',
    note: 'Bright polished iron (水磨明盔) of six plates under riveted strips, a riveted band, a narrow brim, a tall tube with a black horsehair plume; after the user\'s photo 2 and Bing Lu\'s 六叶盔.',
    profile: [[0.12, 1], [0.35, 1.02], [0.7, 0.99], [1.0, 0.89], [1.24, 0.73], [1.42, 0.53], [1.55, 0.33], [1.62, 0.13]],
    ellipse: [1.13, 0.94], gap: 0.13,
    brim: { reach: 0.12, fall: 0.03, lip: 0.02 },
    plates: 6, strips: true, band: true, rivets: true,
    finial: { kind: 'tube', r: 0.1, h: 0.52 },
    plume: 'blackPlume',
  },
  plainPoint: {
    label: 'One-piece pointed iron helmet', zh: '一块铁', period: 'Ming, 15th-16th c.', finish: 'iron',
    note: 'Raised from one piece of iron to a blunt point, a moderate brim sloping down all round, nothing on it; after the user\'s photo 3 (a surviving helmet) and Bing Lu\'s 一块铁.',
    profile: [[0.14, 1], [0.38, 0.99], [0.7, 0.93], [1.0, 0.8], [1.3, 0.62], [1.56, 0.42], [1.78, 0.22], [1.9, 0.09], [1.95, 0.02]],
    ellipse: [1.16, 0.96], gap: 0.13,
    brim: { reach: 0.36, fall: 0.15, lip: 0.03 },
    plates: 0,
  },
  yongBell: {
    label: 'Vermilion 勇 helmet', zh: '朱红油贴金勇字直檐盔', period: 'Ming, 15th-16th c.', finish: 'red',
    note: 'A smooth bell lacquered vermilion, 勇 ("brave") in gold on the front, a straight wide brim, a short red tube with the red horsehair tuft, red chin cords; the arsenals\' 朱红油贴金勇字直檐铁盔, the Prince of Liang\'s helmet, the user\'s photo 4.',
    profile: CHINA_BELL, ellipse: [1.17, 0.97], gap: 0.13,
    brim: { reach: 0.6, fall: 0.05, lip: 0.03 },
    plates: 0, glyph: '勇',
    finial: { kind: 'tube', r: 0.075, h: 0.4 },
    plume: 'redTuft', cords: true,
  },
};

/**
 * The Western Han lamellar hood: a tall narrow egg of vertical iron lamellae laced in red in rows, coming down over the
 * cheeks and the neck in one, the face opening framed by a padded cloth rim dipping to a point between the brows; a small
 * flat top disc edged in red, a thin tube and pheasant tail feathers. `edge`: the hood's lower edge, [share of π round from
 * the face, y]; `lamellae` how many round; `laceRows` the heights of the lacing rows.
 */
export const HAN_HOOD = {
  label: 'Western Han lamellar hood', zh: '兜鍪', period: 'Western Han, 2nd c. BC', finish: 'hanIron',
  note: 'Vertical iron lamellae laced in red, a hood over the cheeks and neck, a padded rim framing the face, pheasant feathers; after the King of Qi\'s helmet from Linzi and the user\'s two photographs of its reconstruction.',
  profile: [[-1.22, 1.05], [-0.9, 1.0], [-0.5, 0.97], [0, 0.98], [0.4, 0.98], [0.8, 0.92], [1.15, 0.78], [1.45, 0.58], [1.66, 0.4], [1.76, 0.3]],
  ellipse: [1.12, 0.9], gap: 0.12,
  edge: [[0, 0.04], [0.05, 0.12], [0.1, 0.22], [0.17, 0.2], [0.23, 0.08], [0.27, -0.25], [0.3, -0.85], [0.34, -1.05], [0.5, -1.12], [1, -1.2]],
  lamellae: 34, laceRows: [-0.98, -0.6, -0.22, 0.32, 0.86, 1.32],
  top: { r: 0.32 },
  finial: { kind: 'tube', r: 0.04, h: 0.55 },
  plume: 'pheasant', rim: { r: 0.075, colour: '#e3d8bf' },
};

// The banner helmet's bowl: narrow, drawn in from the band in an ogee to a tall sharp point, as the Ottoman chichak is
// (wardrobe.js CHICHAK), the gilt spire standing on the point.
const QING_CONE = [[0.12, 1], [0.4, 0.97], [0.7, 0.87], [1.0, 0.7], [1.3, 0.51], [1.6, 0.33], [1.9, 0.18], [2.2, 0.07], [2.42, 0.015]];

/**
 * The Eight Banners' helmets (the Later Jin's of the 1610s-30s, and the Qing's after): a conical bowl drawn up to a point and a
 * tall spire (盔管) that carries the plume, standing in a tiered gilt finial; a flat peak (眉庇) standing straight out over the
 * brow, the brim round the rest no more than the band's lip; the hood of studded cloth (the coat's own) hanging from it over
 * the ears and the neck, and the collar round the throat (QING_HOOD; chinahelmview.js buildQingHood). Drawn as the Ming
 * helmets are (MING_HELMS' fields; `finial.finish` the finial's own finish), and:
 * - `finial.tiers`: the gilt stack round the point the spire stands in, from the bowl up ([foot y, top y, radius at the
 *   foot, at the top, kind]: a `drum` of openwork, a stepped `ring`, a narrow `neck`, the lotus `cup` flaring up, its rim
 *   cut in petals); `finial.rings`: raised rings up the spire (shares of its height), a knob on its top.
 * - `peak`: the plate over the brow (head radii: how far it stands out, how wide, how thick; a second plate stepped under
 *   it, `step` of its reach back and `drop` down; its `finish`, its edge's `edge`).
 * - `glyphBand`: the band round the foot a row of raised gilt characters (the Lantsa letters of the Qing helmets) between
 *   gilt fillets, `rise` tall, `count` round; in place of the plain band.
 * - `swags`: gilt masks round the bowl (`count`, at `y` up it) with festoons of beads hanging `drop` between them and a
 *   pendant under each, as the imperial helmets have.
 * The rank and file's lacquered black with a black horsehair plume, the band and peak gilt (the user's photographs of the
 * eight banners' armours); the Bayara's polished steel, the band of gilt characters and the swags, a gilt spire and a
 * hanging sable tassel (the user's photographs of a Qing guard's armour and of the gilt helmets at the Met and Sotheby's).
 */
const QING_TIERS = [[1.66, 2.0, 0.33, 0.27, 'drum'], [2.0, 2.06, 0.3, 0.29, 'ring'], [2.06, 2.2, 0.16, 0.12, 'neck'], [2.2, 2.44, 0.08, 0.23, 'cup']];
export const QING_HELMS = {
  bannerBowl: {
    label: 'Banner helmet', zh: '八旗盔', period: 'Later Jin and Qing, 17th c.', finish: 'blackLacquer',
    note: 'A cone lacquered black rising to a point, a tiered gilt finial and a tall gilt spire with a black horsehair plume, a gilt band and a flat gilt peak over the brow; after the user\'s photographs of the eight banners\' armours.',
    profile: QING_CONE,
    ellipse: [1.08, 0.9], gap: 0.11,
    brim: { reach: 0.035, fall: 0.0, lip: 0.018 },
    plates: 0, band: true,
    finial: { kind: 'tube', r: 0.04, h: 0.7, finish: 'gilt', tiers: QING_TIERS, rings: [0.35, 0.92] },
    peak: { reach: 0.36, width: 0.78, thick: 0.035, step: 0.3, drop: 0.045, finish: 'gilt', edge: 'gilt' },
    plume: 'qingPlume',
  },
  bayaraBowl: {
    label: 'Bayara helmet', zh: '护军盔', period: 'Later Jin and Qing, 17th c.', finish: 'giltSteel',
    note: 'A cone of polished steel in four plates, gilt masks and festoons round it, a band of gilt characters at its foot, a tiered gilt finial and spire with a hanging sable tassel, a flat steel peak edged in gilt; after the user\'s photographs of a Qing guard\'s armour and the gilt helmets at the Met and Sotheby\'s.',
    profile: QING_CONE,
    ellipse: [1.08, 0.9], gap: 0.11,
    brim: { reach: 0.035, fall: 0.0, lip: 0.018 },
    plates: 4, rivets: true,
    glyphBand: { rise: 0.34, count: 20 },
    swags: { count: 8, y: 1.3, drop: 0.36 },
    finial: { kind: 'tube', r: 0.045, h: 0.65, finish: 'gilt', tiers: QING_TIERS, rings: [0.3, 0.9] },
    peak: { reach: 0.38, width: 0.8, thick: 0.035, step: 0.3, drop: 0.045, finish: 'giltSteel', edge: 'gilt' },
    plume: 'qingSable',
  },
};

/**
 * The banners' hood (the user's photographs of the Qing helmets at the Met and Sotheby's): padded cloth, the coat's own,
 * studded in rows as the coat is and bound at every edge in its binding, hung inside the bowl's rim from `top`. Two narrow
 * flaps over the ears hang straight down to the jaw (`flaps`: from, to round from the face, shares of π; their `hem`), an
 * ear hole in each (`ear`: its height, radius, and where round, a share of π); a flap over the back of the neck (`back`:
 * from, its hem); the face open between them. Below, the collar (护项) round the throat and the neck, standing a little off
 * it about its `centre` (x, head radii), its top dipping under the chin (`top`: y at the front, at the back), its foot
 * (`hem`) flaring out onto the shoulders, closed at the front (its split `open` wide each side, shares of π) by frog
 * buttons (`frogs`: their heights). The sheets round an ellipse [front, side]: `ellipse` at their top, `flare` at their
 * hem (the collar's its own). The studs (`studs`): rows `pitch` apart down and round (as close as the coat's rivet heads),
 * clear of the binding by `margin`, `size` their radius; the binding `binding` wide.
 */
export const QING_HOOD = {
  top: 0.2,
  ellipse: [1.03, 0.87], flare: [1.08, 0.98],
  flaps: { from: 0.3, to: 0.64, hem: -1.28 },
  back: { from: 0.67, hem: -1.32 },
  ear: { y: -0.22, r: 0.11, at: 0.5 },
  collar: { centre: -0.08, top: [-1.36, -1.0], hem: -1.92, ellipse: [0.96, 0.74], flare: [1.3, 1.24], open: 0.02 },
  frogs: [-1.47, -1.63, -1.79],
  studs: { pitch: 0.21, margin: 0.13, size: 0.05 },
  binding: 0.085,
};

/**
 * The hood's sheets (QING_HOOD): each a band round the head's axis, `phi` [from, to] round from the face (rad; the left
 * side +z), its top and hem (y) as functions of φ, its ellipse [front, side] at the top and at the hem, its `centre` (x),
 * its `kind` (flap, back, collar).
 */
export function qingHoodSheets(hood = QING_HOOD) {
  const flat = (y) => () => y;
  const sheet = (phi, top, hem, ellipse, flare, centre = 0, kind = 'flap') => ({ phi, top, hem, ellipse, flare, centre, kind });
  const { flaps, back, collar } = hood;
  // The collar's top dips under the chin: lowest at the front, highest behind.
  const collarTop = (phi) => collar.top[1] + (collar.top[0] - collar.top[1]) * Math.max(0, Math.cos(phi)) ** 2;
  return [
    sheet([flaps.from * Math.PI, flaps.to * Math.PI], flat(hood.top), flat(flaps.hem), hood.ellipse, hood.flare),
    sheet([-flaps.to * Math.PI, -flaps.from * Math.PI], flat(hood.top), flat(flaps.hem), hood.ellipse, hood.flare),
    sheet([back.from * Math.PI, (2 - back.from) * Math.PI], flat(hood.top), flat(back.hem), hood.ellipse, hood.flare, 0, 'back'),
    sheet([collar.open * Math.PI, (2 - collar.open) * Math.PI], collarTop, flat(collar.hem), collar.ellipse, collar.flare, collar.centre, 'collar'),
  ];
}

/** A point on a hood sheet (head radii): `phi` round, `s` down it (0 its top, 1 its hem), `out` beyond its surface. */
export function qingHoodPoint(sheet, phi, s, out = 0) {
  const top = sheet.top(phi);
  const y = top + (sheet.hem(phi) - top) * s;
  const a = sheet.ellipse[0] + (sheet.flare[0] - sheet.ellipse[0]) * s + out;
  const b = sheet.ellipse[1] + (sheet.flare[1] - sheet.ellipse[1]) * s + out;
  return [sheet.centre + a * Math.cos(phi), y, b * Math.sin(phi)];
}

/**
 * The hood's studs (head radii): on every sheet in rows `pitch` apart down it and round it (each row offset half a stud
 * from the last, as the coat's are), clear of the binding by `margin`, of the bowl's rim and of the ear holes.
 */
export function qingHoodStuds(hood = QING_HOOD) {
  const { pitch, margin } = hood.studs;
  const studs = [];
  for (const sheet of qingHoodSheets(hood)) {
    const [from, to] = sheet.phi;
    const middle = (from + to) / 2;
    const tall = Math.abs(sheet.hem(middle) - sheet.top(middle));
    // The flaps' tops are inside the bowl: their studs start below its rim (y 0).
    const start = sheet.kind === 'collar' ? margin / tall : (hood.top + 0.04) / tall;
    const rows = Math.floor((tall * (1 - start) - margin) / pitch) + 1;
    for (let row = 0; row < rows; row += 1) {
      const s = start + (row * pitch) / tall;
      const a = sheet.ellipse[0] + (sheet.flare[0] - sheet.ellipse[0]) * s;
      const b = sheet.ellipse[1] + (sheet.flare[1] - sheet.ellipse[1]) * s;
      // Radians to a stud's pitch here (by the ellipse's mean radius), so the studs are as far apart round as down.
      const step = pitch / ((a + b) / 2);
      const inset = margin / ((a + b) / 2);
      const span = to - from - 2 * inset;
      const columns = Math.max(1, Math.floor(span / step) + 1);
      const shift = row % 2 && columns > 1 ? step / 2 : 0;
      const offset = (span - (columns - 1) * step) / 2;
      for (let column = 0; column < columns - (shift ? 1 : 0); column += 1) {
        const phi = from + inset + offset + shift + column * step;
        // Clear of the ear holes.
        if (sheet.kind === 'flap') {
          const { ear } = hood;
          const y = sheet.top(phi) + (sheet.hem(phi) - sheet.top(phi)) * s;
          if (Math.abs(Math.abs(phi) - ear.at * Math.PI) * ((a + b) / 2) < ear.r + 0.07 && Math.abs(y - ear.y) < ear.r + 0.07) continue;
        }
        studs.push(qingHoodPoint(sheet, phi, s, 0.012));
      }
    }
  }
  return studs;
}

/** Which design the Ming brigandine man's hat is in: by its outfit design's `helm` (outfits.js), with its finish. */
export const MING_HELM_ORDER = ['cloudBell', 'rivetedTube', 'plainPoint', 'yongBell'];

/**
 * The tassels and plumes (head radii, from where they are bound): `count` strands, `length`, `width` at the root (tapering
 * to `tip` of it), leaving at `rise` (rad above level, a range) and `spread` out from the binding, bending down by `droop`
 * (rad over the length), leaning back by `lean`; `colour` and its `vary`. The swing: `stiffness` (1/s²), `damping` (1/s),
 * how much the tassel hangs to the world's down rather than its rest (`hang`), the most it turns (`reach`, rad). `fan`: a
 * plume's strands all to one side (behind), over this many radians, not all round.
 */
export const TASSELS = {
  hongying: { count: 120, length: 0.8, width: 0.06, tip: 0.55, rise: [-1.25, -0.75], spread: 0.05, droop: 0.5, lean: 0, colour: '#c0161c', vary: 0.18, stiffness: 70, damping: 4.2, hang: 0.6, reach: 0.75 },
  redTuft: { count: 64, length: 0.62, width: 0.08, tip: 0.35, rise: [1.05, 1.55], spread: 0.05, droop: 0.9, lean: 0, colour: '#d01a1e', vary: 0.15, stiffness: 140, damping: 6, hang: 0.15, reach: 0.6 },
  blackPlume: { count: 70, length: 1.15, width: 0.05, tip: 0.4, rise: [1.25, 1.5], spread: 0.03, droop: 3.6, lean: 0, fan: 1.6, colour: '#151414', vary: 0.25, stiffness: 55, damping: 3.5, hang: 0.45, reach: 0.9 },
  // The banner helmet's plume: a tall bundle of black horsehair standing up from the tube's mouth, falling a little at the tips.
  qingPlume: { count: 80, length: 1.2, width: 0.05, tip: 0.5, rise: [1.4, 1.57], spread: 0.02, droop: 0.7, lean: 0, colour: '#121214', vary: 0.2, stiffness: 120, damping: 5, hang: 0.12, reach: 0.5 },
  // The Bayara's: a sable tassel hanging from the gilt tube, dark, a few red strands in it.
  qingSable: { count: 90, length: 0.7, width: 0.07, tip: 0.5, rise: [-1.3, -0.8], spread: 0.06, droop: 0.4, lean: 0, colour: '#1c1e28', vary: 0.3, stiffness: 70, damping: 4.2, hang: 0.6, reach: 0.7 },
  pheasant: { count: 3, length: 2.3, width: 0.16, tip: 0.25, rise: [1.28, 1.42], spread: 0.02, droop: 0.35, lean: -0.35, colour: '#8a6a44', vary: 0.1, feather: true, stiffness: 120, damping: 2.5, hang: 0.1, reach: 0.5 },
};

/**
 * Where the older helmets (wardrobe.js) carry the red tassel (hongying): bound at `top` on the spike (`spike`: its foot and
 * point, head radii up), falling `length`, kept out of the helmet's `hull` ([y, radius] up the axis) as it swings.
 */
export const HONGYING_MOUNTS = {
  mingHelm: { top: 2.78, length: 0.85, spike: [2.6, 3.3], hull: [[1.62, 0.7], [1.92, 0.43], [2.08, 0.24], [2.62, 0.19], [2.8, 0.1]] },
  steppeHelm: { top: 2.98, length: 0.62, spike: [2.43, 3.13], hull: [[2.2, 0.16], [2.5, 0.08], [3.1, 0.06]] },
  mingHat: { top: 2.2, length: 0.7, spike: [1.35, 2.35], hull: [[1.2, 0.95], [1.4, 0.75], [1.6, 0.5], [1.8, 0.2], [2.3, 0.08]] },
};

// ---- Surfaces --------------------------------------------------------------------------------------------------------------

/** A smooth curve through points [x, f]: f at x (Catmull-Rom, clamped at the ends). */
export function chinaCurveAt(points, x) {
  if (x <= points[0][0]) return points[0][1];
  if (x >= points.at(-1)[0]) return points.at(-1)[1];
  let i = 1;
  while (points[i][0] < x) i += 1;
  const [x1, p1] = points[i - 1];
  const [x2, p2] = points[i];
  const p0 = points[Math.max(0, i - 2)][1];
  const p3 = points[Math.min(points.length - 1, i + 1)][1];
  const t = (x - x1) / (x2 - x1);
  const m1 = ((p2 - p0) / 2) * 1;
  const m2 = ((p3 - p1) / 2) * 1;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2;
}

/** A piecewise-linear table's value at x. */
function chinaLinearAt(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i += 1) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points.at(-1)[1];
}

/** The foot ellipse's radius at azimuth θ. */
const chinaEllipseAt = ([a, b], theta) => 1 / Math.hypot(Math.cos(theta) / a, Math.sin(theta) / b);
/** A smooth maximum (no crease where the shell meets the head's fit). */
const chinaSoftMax = (a, b, k = 0.06) => (a + b + Math.sqrt((a - b) * (a - b) + k * k)) / 2;

/** The shell's distance from the upright axis at azimuth θ and height y. */
export function shellRadius(design, theta, y) {
  const shape = chinaCurveAt(design.profile, y) * chinaEllipseAt(design.ellipse, theta);
  const top = design.profile.at(-1)[0];
  // Over the crown the head's fit fades (the head ends at y 1.09); the shape alone above.
  const head = y < 1.15 ? headRadiusAt(theta, y) + design.gap : 0;
  return y > top ? 0 : chinaSoftMax(shape, head);
}

/** The shell's lower edge at azimuth θ: its foot, or the hood's edge (HAN_HOOD.edge). */
export const shellEdge = (design, theta) => (design.edge ? chinaLinearAt(design.edge, Math.abs(Math.atan2(Math.sin(theta), Math.cos(theta))) / Math.PI) : design.profile[0][0]);

/** The sheet's v for a height (the face's meridian's length from the lowest edge up, SHELL_V to 1). */
export function shellV(design) {
  const low = Math.min(...(design.edge ?? [[0, design.profile[0][0]]]).map(([, y]) => y));
  const top = design.profile.at(-1)[0];
  const steps = 64;
  const table = [[low, 0]];
  let length = 0;
  let last = [shellRadius(design, Math.PI / 2, low), low];
  for (let i = 1; i <= steps; i += 1) {
    const y = low + ((top - low) * i) / steps;
    const point = [shellRadius(design, Math.PI / 2, y), y];
    length += Math.hypot(point[0] - last[0], point[1] - last[1]);
    table.push([y, length]);
    last = point;
  }
  const total = length;
  return { low, top, length: total, at: (y) => SHELL_V + (1 - SHELL_V) * (chinaLinearAt(table, y) / total) };
}

/** Azimuths round (from -π behind, through the face at 0, to π), the edge table's corners among them. */
function chinaColumns(design, count) {
  const set = new Set(Array.from({ length: count + 1 }, (_, i) => -Math.PI + (CHINA_TAU * i) / count));
  for (const [share] of design.edge ?? []) for (const sign of [1, -1]) if (share > 0 && share < 1) set.add(sign * share * Math.PI);
  return [...set].sort((a, b) => a - b);
}

/**
 * The shell as a grid: positions (head radii), uvs, indices, and its rows and columns, `rows` rings from its edge to its top
 * at each azimuth (a hood's edge differs round), `cols` round. Its top ring stays open (a finial or a disc closes it).
 */
export function shellGrid(design, { rows = 22, cols = 48 } = {}) {
  const thetas = chinaColumns(design, cols);
  const { top, at } = shellV(design);
  const positions = [];
  const uvs = [];
  const indices = [];
  for (const theta of thetas) {
    const edge = shellEdge(design, theta);
    for (let row = 0; row <= rows; row += 1) {
      // Rows closer near the top (the curve turns there).
      const t = row / rows;
      const y = edge + (top - edge) * t * (1 + 0.35 * (1 - t));
      const radius = shellRadius(design, theta, Math.min(y, top - 1e-4));
      positions.push(radius * Math.cos(theta), y, radius * Math.sin(theta));
      // u runs round to the right as the face is seen (the glyph reads the right way round).
      uvs.push(0.5 - theta / CHINA_TAU, at(y));
    }
  }
  const stride = rows + 1;
  for (let c = 0; c < thetas.length - 1; c += 1) {
    for (let row = 0; row < rows; row += 1) {
      const a = c * stride + row;
      const b = (c + 1) * stride + row;
      // Wound to face out.
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  return { positions, uvs, indices, rows, cols: thetas.length, thetas };
}

/** The brim: from the shell's foot out (`reach`) and down (`fall`) to its edge, the edge turned down (`lip`). */
export function brimGrid(design, { cols = 48 } = {}) {
  const { reach, fall, lip } = design.brim;
  const foot = design.profile[0][0];
  const thetas = chinaColumns(design, cols);
  const rings = [[-0.03, 0, 0], [0.5 * reach, -0.35 * fall, 0.35], [reach, -fall, 0.85], [reach - 0.012, -fall - lip, 1]];
  const positions = [];
  const uvs = [];
  const indices = [];
  for (const theta of thetas) {
    const base = shellRadius(design, theta, foot);
    for (const [out, down, v] of rings) {
      const radius = base + out;
      positions.push(radius * Math.cos(theta), foot + down, radius * Math.sin(theta));
      uvs.push(0.5 - theta / CHINA_TAU, v * BRIM_V);
    }
  }
  const stride = rings.length;
  for (let c = 0; c < thetas.length - 1; c += 1) {
    for (let k = 0; k < stride - 1; k += 1) {
      const a = c * stride + k;
      const b = (c + 1) * stride + k;
      // Wound to face up.
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions, uvs, indices };
}

/** The hood's lower edge as a closed path (for its padded rim), a little out from the shell. */
export function rimPath(design, count = 96) {
  return Array.from({ length: count }, (_, i) => {
    const theta = -Math.PI + (CHINA_TAU * i) / count;
    const y = shellEdge(design, theta);
    const radius = shellRadius(design, theta, y) + 0.02;
    return [radius * Math.cos(theta), y, radius * Math.sin(theta)];
  });
}

/** Where a design's tassel or plume is bound (head radii): the finial's top, or the shell's top. */
export function finialTop(design) {
  const top = design.profile.at(-1)[0];
  return top + (design.finial?.kind === 'tube' ? design.finial.h : design.finial?.kind === 'knob' ? design.finial.r * 1.6 : 0);
}

// ---- Tassels -----------------------------------------------------------------------------------------------------------------

/** A small deterministic random (the same tassel each time). */
function chinaSeeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * A tassel's strands as ribbons (head radii, from its binding at the origin): positions, uvs (u across, v along), per-vertex
 * `weight` (how much the swing moves it: none at the root, all at the tip), a shade per vertex, and indices. `rest`: the
 * direction it hangs at rest (its tips' mean), unit.
 */
export function tasselStrands(spec, seed = 7) {
  const random = chinaSeeded(seed);
  const segments = spec.feather ? 8 : 5;
  const positions = [];
  const uvs = [];
  const weights = [];
  const shades = [];
  const indices = [];
  const tipSum = [0, 0, 0];
  for (let strand = 0; strand < spec.count; strand += 1) {
    const azimuth = spec.feather ? Math.PI + (strand - (spec.count - 1) / 2) * 0.28 : spec.fan ? Math.PI + (random() - 0.5) * spec.fan : (CHINA_TAU * (strand + random() * 0.6)) / spec.count;
    const rise = spec.rise[0] + (spec.rise[1] - spec.rise[0]) * random();
    const length = spec.length * (0.82 + 0.3 * random());
    const shade = 1 - spec.vary * random();
    // Its plane: out along the azimuth (leaning back by `lean`), up.
    const out = [Math.cos(azimuth), 0, Math.sin(azimuth)];
    const side = [-Math.sin(azimuth), 0, Math.cos(azimuth)];
    let point = [out[0] * spec.spread, 0, out[2] * spec.spread];
    let angle = rise;
    const step = length / segments;
    const base = positions.length / 3;
    for (let k = 0; k <= segments; k += 1) {
      const t = k / segments;
      const half = (spec.width / 2) * (1 - (1 - spec.tip) * t) * (spec.feather ? Math.sin(Math.min(1, 0.15 + t * 1.2) * Math.PI * 0.5) : 1);
      const lean = [spec.lean * t * t * length, 0];
      positions.push(point[0] + side[0] * half + lean[0], point[1], point[2] + side[2] * half, point[0] - side[0] * half + lean[0], point[1], point[2] - side[2] * half);
      uvs.push(0, t, 1, t);
      const weight = Math.pow(t, 1.3);
      weights.push(weight, weight);
      shades.push(shade, shade);
      if (k === segments) {
        tipSum[0] += point[0] + lean[0];
        tipSum[1] += point[1];
        tipSum[2] += point[2];
      }
      // On along its curve: out and up at first, bending down.
      point = [point[0] + out[0] * Math.cos(angle) * step, point[1] + Math.sin(angle) * step, point[2] + out[2] * Math.cos(angle) * step];
      angle -= (spec.droop / segments) * (0.6 + 0.8 * t);
    }
    for (let k = 0; k < segments; k += 1) {
      const a = base + k * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const norm = Math.hypot(...tipSum) || 1;
  return { positions, uvs, weights, shades, indices, rest: tipSum.map((value) => value / norm) };
}

// ---- The swing ---------------------------------------------------------------------------------------------------------------

/** The swing's integration: substeps no longer than this (s); a man's speed of a blow to the head thrown into it (m/s). */
export const SWING = { maxStep: 1 / 120, hitSpeed: 1.6 };

/**
 * A tassel's swing, a weight on a rod of `length` (m) from its binding (`pivot`, world): drawn towards its target direction
 * by `stiffness`, its motion relative to the binding damped by `damping`; the binding's moving (the head's running,
 * turning, ducking, a blow) leaves it behind. `state` { tip, velocity, pivot } (world, m; null to start at rest).
 * Returns the state; the tassel's direction is (tip - pivot) / length.
 */
export function swingStep(state, { pivot, target, length, stiffness, damping }, dt) {
  if (!state) return { tip: pivot.map((value, axis) => value + target[axis] * length), velocity: [0, 0, 0], pivot: [...pivot] };
  if (!(dt > 0)) return state;
  const steps = Math.max(1, Math.ceil(dt / SWING.maxStep));
  const h = dt / steps;
  const from = state.pivot;
  const pivotVelocity = pivot.map((value, axis) => (value - from[axis]) / dt);
  const { tip, velocity } = state;
  for (let step = 1; step <= steps; step += 1) {
    const share = step / steps;
    const at = from.map((value, axis) => value + (pivot[axis] - value) * share);
    for (let axis = 0; axis < 3; axis += 1) {
      const goal = at[axis] + target[axis] * length;
      const accel = stiffness * (goal - tip[axis]) - damping * (velocity[axis] - pivotVelocity[axis]);
      velocity[axis] += accel * h;
      tip[axis] += velocity[axis] * h;
    }
    // Held at its length from the binding; no speed along the rod but the binding's.
    const off = tip.map((value, axis) => value - at[axis]);
    const distance = Math.hypot(...off) || 1;
    const unit = off.map((value) => value / distance);
    for (let axis = 0; axis < 3; axis += 1) tip[axis] = at[axis] + unit[axis] * length;
    const along = velocity.reduce((sum, value, axis) => sum + (value - pivotVelocity[axis]) * unit[axis], 0);
    for (let axis = 0; axis < 3; axis += 1) velocity[axis] -= along * unit[axis];
  }
  state.pivot = [...pivot];
  return state;
}
