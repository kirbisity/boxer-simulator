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
