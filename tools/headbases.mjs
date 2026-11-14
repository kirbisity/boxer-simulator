// The head model's lattices, a group of faces at a time: src/headgrid-data.js (headlattice.js builds the photo faces' heads
// from it).
//
//   node tools/headbases.mjs <work>/grid-male.json <work>/grid-female.json
//
// Each grid-<sex>.json is one sculpted head laid out on the photo atlas (tools/blender/head/grid.py: README.md there). For
// each group (faceregions.js HEAD_BASE_GROUPS) that head is moved in two steps:
//
//   1. the group's tendencies that no survey measures (the height of its nose's bridge, its brow, sockets, lids, lips' and
//      chin's fullness, its jaw) as the drawn head has them (faceregions.js SHAPE_GROUPS; headlattice.js shapeLattice);
//   2. its landmarks to the group's published measures (MEASURES below), the surface between them following smoothly (a
//      warp of space through the landmarks: the smoothest there is in the sense of least bending).
//
// What step 2 sets is left out of step 1 (the nose's and cheekbones' width, the skull's breadth, the face's length), and the
// fighter's own departure from his group is added by the game as step 1 adds it.

import { readFileSync, writeFileSync } from 'node:fs';
import { HEAD_BASE_GROUPS, groupShape } from '../src/faceregions.js';
import { HEAD_LATTICE, mirrorLattice, mirrorShares, shapeLattice, solveLinear } from '../src/headlattice.js';
import { applyRegionToModel } from '../src/photohead.js';
import { PHOTO_ATLAS } from '../src/photoface.js';

// face.js SKULL (read from its text: face.js needs a browser's Three.js to load).
const SKULL = /const SKULL = \[([^\]]+)\]/.exec(readFileSync(new URL('../src/face.js', import.meta.url), 'utf8'))[1].split(',').map(Number);

// Millimetres, [men, women].
//   length, breadth, zy (bizygomatic), mentonSellion: ANSUR II (2012; the public tables), by its own race column: White,
//   Black, and by its ethnicity column the East Asian (Chinese, Japanese, Korean, Vietnamese; 75 men, 45 women) and West Asian
//   (Arab, Iranian, Turkish, Lebanese...; 16 men, 8 women: a small sample) soldiers. One survey, one protocol: what is used
//   for the groups' sizes against each other.
//   al (nose, wing to wing), en (inner eye corners), ex (outer), ch (mouth corners), nSn (nasion to the nose's foot), snGn
//   (the nose's foot to the chin's underside), snSto (to the lips' line), lsSto, stoLi (the upper and the lower lip's red),
//   trN (hairline to nasion): Farkas's norms and their like, as reproduced in open reviews (North American White and African
//   American: Virdi et al. 2019, PMC6384287; Chinese and Turkish: Al-Sebaei 2015, PMC4369102; the Chinese outer eye corners and
//   lips' length: Jayaratne et al. 2013, PMC3730197). A measure nobody published for a group is left out here (HEADS.borrowed).
//   The Turkish outer eye corners are its inner ones and twice its eye's length (30.6, 29.8).
const MEASURES = {
  northEurope: { length: [199.9, 188.8], breadth: [154.0, 147.1], zy: [141.9, 132.3], mentonSellion: [122.3, 112.4], al: [34.9, 31.4], en: [33.3, 31.8], ex: [91.2, 87.8], ch: [54.5, 50.2], nSn: [54.8, 50.6], snGn: [72.6, 64.3], snSto: [22.3, 20.1], lsSto: [7.8, 8.7], stoLi: [9.3, 9.4], trN: [67.1, 63.0] },
  westAsia: { length: [196.8, 189.6], breadth: [153.8, 147.4], zy: [141.4, 132.6], mentonSellion: [124.4, 117.4], al: [36.8, 32.9], en: [32.8, 31.7], ex: [94.0, 91.3], nSn: [58.1, 55.2], snGn: [65.9, 59.1], trN: [61.9, 60.7] },
  eastAsia: { length: [192.8, 183.5], breadth: [159.1, 152.7], zy: [147.4, 140.4], mentonSellion: [122.4, 112.4], al: [39.2, 37.2], en: [37.9, 36.5], ex: [93.0, 88.4], ch: [52.2, 49.8], nSn: [53.5, 51.7], snGn: [72.7, 66.4], trN: [67.1, 64.1] },
  westAfrica: { length: [201.1, 193.2], breadth: [154.6, 148.0], zy: [143.6, 134.9], mentonSellion: [124.2, 114.0], al: [44.1, 40.1], en: [35.8, 34.4], ex: [96.8, 92.9], ch: [54.6, 53.6], nSn: [51.9, 48.8], snGn: [78.9, 71.5], snSto: [26.1, 24.5], lsSto: [13.6, 13.3], stoLi: [13.8, 13.2], trN: [72.0, 67.1] },
};
const HEADS = {
  // The group whose face's height is taken as published (the others' against it by ANSUR's menton to sellion: the studies
  // place nasion and the chin's underside a little differently, so their sums are not one scale).
  reference: 'northEurope',
  // All of ANSUR II's men's and women's head length (mm) is the head's glabella to occiput (head radii: the game's head is
  // 2.06 radii long, tools/blender/head/frame.py).
  length: [199.5, 189.8],
  radii: 2.06,
  // The measures a group may lack, and the measure of its own each is scaled by from the reference group's.
  borrowed: { snSto: 'snGn', lsSto: 'snGn', stoLi: 'snGn', ch: 'zy' },
  // The hair's ground: directions sampled (polar, round), as grid.py's table.
  table: [64, 96],
  // Stored as integers of this many to a head radius.
  scale: 10000,
};

const SEXES = ['male', 'female'];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const times = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const size = (a) => Math.hypot(a[0], a[1], a[2]);
const along = (from, to) => times(sub(to, from), 1 / (size(sub(to, from)) || 1));

/** The lattice read as a surface: the point at [share round, row] between its points. `points`: [rows][columns] of the whole lattice. */
function surfaceAt(points, dus, rows, du, row) {
  const place = (list, value) => {
    let index = 0;
    while (index < list.length - 2 && list[index + 1] <= value) index += 1;
    return [index, Math.min(1, Math.max(0, (value - list[index]) / (list[index + 1] - list[index])))];
  };
  const [c, fc] = place(dus, du);
  const [r, fr] = place(rows, row);
  return [0, 1, 2].map((axis) => (points[r][c][axis] * (1 - fc) + points[r][c + 1][axis] * fc) * (1 - fr) + (points[r + 1][c][axis] * (1 - fc) + points[r + 1][c + 1][axis] * fc) * fr);
}

/**
 * The head's landmarks on a lattice (head radii; the side ones on the +z side): the atlas's places read off it, and the ones
 * the atlas does not mark found by their definitions (nasion: the profile's deepest point between the brow and the eyes;
 * zygion and euryon: the widest point of the cheekbones' arch and of the cranium; opisthocranion: the back's furthest point).
 */
function landmarks(points, dus, rows, atlas) {
  const middle = (dus.length - 1) / 2;
  const marks = {};
  for (const [name, row] of Object.entries(atlas.midline)) marks[name] = surfaceAt(points, dus, rows, 0, row);
  for (const [name, [du, row]] of Object.entries(atlas.side)) marks[name] = surfaceAt(points, dus, rows, du, row);
  const best = (list, score) => list.reduce((kept, p) => (score(p) > score(kept) ? p : kept));
  const profile = points.map((row) => row[middle]);
  marks.nasion = best(profile.filter((_, row) => rows[row] > atlas.midline.brow && rows[row] < atlas.midline.eye + 0.02), (p) => -p[0]);
  marks.vertex = profile[0];
  marks.bottom = profile[rows.length - 1];
  marks.opisthocranion = best(points.map((row) => row[dus.length - 1]), (p) => -p[0]);
  const all = points.flat();
  marks.zygion = best(all.filter((p) => p[0] > 0.2 && p[0] < 0.65 && p[1] > -0.4 && p[1] < 0), (p) => p[2]);
  marks.euryon = best(all.filter((p) => p[1] > 0.25), (p) => p[2]);
  return marks;
}

/** The measures of a lattice (mm), as MEASURES names them. */
function measured(marks, mm) {
  const m = marks;
  return {
    length: (m.brow[0] - m.opisthocranion[0]) * mm, breadth: 2 * m.euryon[2] * mm, zy: 2 * m.zygion[2] * mm,
    al: 2 * m.noseWing[2] * mm, en: 2 * m.innerCorner[2] * mm, ex: 2 * m.outerCorner[2] * mm, ch: 2 * m.mouthCorner[2] * mm,
    nSn: size(sub(m.noseFoot, m.nasion)) * mm, snGn: size(sub(m.chin, m.noseFoot)) * mm, snSto: size(sub(m.mouth, m.noseFoot)) * mm,
    lsSto: size(sub(m.mouth, m.lipTop)) * mm, stoLi: size(sub(m.lowerLip, m.mouth)) * mm, trN: size(sub(m.hairline, m.nasion)) * mm,
  };
}

/**
 * Where a group's measures put the landmarks: { name: [x, y, z] } for those that move or are held (the rest follow the warp).
 * `m`: the lattice's landmarks; `want`: the group's measures for this sex (head radii); `faceScale`: its face's height over
 * its own nSn + snGn (HEADS.reference).
 *
 * Nasion is held. The face's heights are chords along the model's own profile (nasion to the nose's foot, on to the chin's
 * underside), so its profile's slant is kept. The widths are distances across (z), the landmark's height following the
 * profile's. The head's length is taken up at the back, so the brow's and nose's profile is the face's own.
 */
function landmarkTargets(m, want, faceScale) {
  const k = faceScale;
  const to = { nasion: m.nasion, vertex: m.vertex };
  to.noseFoot = add(m.nasion, times(along(m.nasion, m.noseFoot), want.nSn * k));
  to.chin = add(to.noseFoot, times(along(m.noseFoot, m.chin), want.snGn * k));
  to.hairline = add(m.nasion, times(along(m.nasion, m.hairline), want.trN * k));
  const moved = (name) => sub(to[name], m[name]);
  /** A landmark between two others moves as they do, by its height between them. */
  const between = (name, above, below) => {
    const share = (m[name][1] - m[above][1]) / (m[below][1] - m[above][1]);
    return add(m[name], add(times(moved(above), 1 - share), times(moved(below), share)));
  };
  to.mouth = add(to.noseFoot, times(along(m.noseFoot, m.mouth), want.snSto * k));
  to.lipTop = add(to.mouth, times(along(m.mouth, m.lipTop), want.lsSto * k));
  to.lowerLip = add(to.mouth, times(along(m.mouth, m.lowerLip), want.stoLi * k));
  for (const name of ['lipFold', 'chinFront']) to[name] = between(name, 'lowerLip', 'chin');
  to.tip = between('tip', 'nasion', 'noseFoot');
  to.brow = between('brow', 'nasion', 'hairline');
  to.bottom = add(m.bottom, moved('chin'));
  to.opisthocranion = [m.brow[0] - want.length, m.opisthocranion[1], 0];
  const across = (name, width, follows) => {
    const p = follows ? follows() : m[name];
    return [p[0], p[1], width ? width / 2 : m[name][2]];
  };
  to.innerCorner = across('innerCorner', want.en);
  to.outerCorner = across('outerCorner', want.ex);
  to.zygion = across('zygion', want.zy);
  to.euryon = across('euryon', want.breadth);
  to.noseWing = across('noseWing', want.al, () => between('noseWing', 'nasion', 'noseFoot'));
  to.mouthCorner = across('mouthCorner', want.ch, () => add(m.mouthCorner, moved('mouth')));
  return to;
}

/**
 * The warp of space that takes each of `from` to its `to` and bends least between them (a radial basis of the distance
 * itself, the biharmonic kernel in space, with a linear part): a function of a point. Side landmarks (z > 0) are mirrored.
 */
function landmarkWarp(from, to) {
  const centres = [];
  const moves = [];
  for (const name of Object.keys(to)) {
    for (const side of from[name][2] > 1e-6 ? [1, -1] : [1]) {
      centres.push([from[name][0], from[name][1], side * from[name][2]]);
      moves.push([to[name][0] - from[name][0], to[name][1] - from[name][1], side * (to[name][2] - from[name][2])]);
    }
  }
  const count = centres.length;
  const system = centres.map((a) => [...centres.map((b) => size(sub(a, b))), 1, ...a]);
  for (let axis = -1; axis < 3; axis += 1) system.push([...centres.map((c) => (axis < 0 ? 1 : c[axis])), 0, 0, 0, 0]);
  const solved = solveLinear(system, [...moves, [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  return (p) => {
    const out = [0, 1, 2].map((axis) => p[axis] + solved[count][axis] + solved[count + 1][axis] * p[0] + solved[count + 2][axis] * p[1] + solved[count + 3][axis] * p[2]);
    for (let index = 0; index < count; index += 1) {
      const distance = size(sub(p, centres[index]));
      for (let axis = 0; axis < 3; axis += 1) out[axis] += solved[index][axis] * distance;
    }
    return out;
  };
}

/** The hair's ground for a moved head: for each of the table's directions, how far the moved surface is (head radii). */
function movedTable(table, move) {
  const [polars, azimuths] = HEADS.table;
  const source = (d) => {
    const row = Math.min(polars - 1e-6, (Math.acos(Math.max(-1, Math.min(1, d[1]))) / Math.PI) * polars);
    const column = (((Math.atan2(d[2], d[0]) + Math.PI) / (2 * Math.PI)) * azimuths) % azimuths;
    const [r, c] = [Math.floor(row), Math.floor(column) % azimuths];
    const [fr, fc] = [row - r, column - Math.floor(column)];
    const radius = (table[r][c] * (1 - fc) + table[r][(c + 1) % azimuths] * fc) * (1 - fr) + (table[r + 1][c] * (1 - fc) + table[r + 1][(c + 1) % azimuths] * fc) * fr;
    return times(d, radius);
  };
  const out = [];
  for (let row = 0; row <= polars; row += 1) {
    for (let column = 0; column < azimuths; column += 1) {
      const [polar, azimuth] = [(row / polars) * Math.PI, (column / azimuths) * 2 * Math.PI - Math.PI];
      const wanted = [Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth)];
      // The direction of the unmoved head whose point lands in the wanted one: found by stepping (the move is small).
      let from = wanted;
      let landed = move(source(from));
      for (let step = 0; step < 12; step += 1) {
        const reached = times(landed, 1 / size(landed));
        const next = add(from, sub(wanted, reached));
        from = times(next, 1 / size(next));
        landed = move(source(from));
      }
      out.push(size(landed));
    }
  }
  return out;
}

const packed = (values, Type) => Buffer.from(Type.from(values, (value) => Math.round(value * HEADS.scale)).buffer).toString('base64');

function main() {
  const data = { skull: SKULL, scale: HEADS.scale, polars: HEADS.table[0], azimuths: HEADS.table[1] };
  SEXES.forEach((sex, sexIndex) => {
    const grid = JSON.parse(readFileSync(process.argv[2 + sexIndex], 'utf8'));
    const mm = HEADS.length[sexIndex] / HEADS.radii;
    const dus = mirrorShares(grid.columns);
    const rows = grid.rows;
    const stride = dus.length;
    const atlas = grid.atlas;
    const whole = mirrorLattice(grid.nodes);
    const inRows = (flat) => rows.map((_, row) => flat.slice(row * stride, row * stride + stride));
    const start = measured(landmarks(whole, dus, rows, atlas), mm);
    console.log(sex, 'model', Object.entries(start).map(([name, value]) => `${name} ${value.toFixed(1)}`).join(' '));
    const bases = {};
    for (const group of HEAD_BASE_GROUPS) {
      const keys = groupShape(group);
      const reference = MEASURES[HEADS.reference];
      const want = Object.fromEntries(Object.entries(MEASURES[group]).map(([name, pair]) => [name, pair[sexIndex] / mm]));
      // What nobody published for the group: the reference group's, in the group's own proportion (the lips' heights by its
      // lower face's, its mouth's width by its cheekbones').
      for (const [name, by] of Object.entries(HEADS.borrowed)) want[name] ??= (reference[name][sexIndex] / mm) * (MEASURES[group][by][sexIndex] / reference[by][sexIndex]);
      // The face's height: the reference group's own, by the mean over the sexes of this group's menton to sellion against
      // its; split by the group's own proportions.
      const longer = (MEASURES[group].mentonSellion[0] / reference.mentonSellion[0] + MEASURES[group].mentonSellion[1] / reference.mentonSellion[1]) / 2;
      const faceScale = ((reference.nSn[sexIndex] + reference.snGn[sexIndex]) * longer) / (MEASURES[group].nSn[sexIndex] + MEASURES[group].snGn[sexIndex]);
      // Step 1: the unmeasured tendencies (the measured ones' keys left out: the cheekbones' are their breadth, zy, and
      // the drawn head's cheekbone is a ridge a centimetre tall, a line across the sculpt's cheek).
      const skullKeys = { ...keys, cephalic: 0, faceLength: 0, cheekbone: 0 };
      const faceKeys = { ...Object.fromEntries(Object.entries(keys).map(([name, value]) => [name, value * HEAD_LATTICE.contrast])), noseWidth: 0, cheekWidth: 0, cheekbone: 0 };
      const toUnit = (p) => [p[0] / SKULL[0], p[1] / SKULL[1], p[2] / SKULL[2]];
      const fromUnit = (p) => [p[0] * SKULL[0], p[1] * SKULL[1], p[2] * SKULL[2]];
      const shaped = inRows(shapeLattice(whole.flat().map(toUnit), dus, rows, PHOTO_ATLAS, skullKeys, faceKeys).map(fromUnit));
      // Step 2: the landmarks to the group's measures.
      const marks = landmarks(shaped, dus, rows, atlas);
      const warp = landmarkWarp(marks, landmarkTargets(marks, want, faceScale));
      const moved = shaped.map((row) => row.map(warp));
      const half = moved.map((row) => row.slice((stride - 1) / 2).map((p, column, kept) => [p[0], p[1], column === 0 || column === kept.length - 1 ? 0 : p[2]]));
      for (const row of [0, rows.length - 1]) half[row] = half[row].map(() => [0, half[row][0][1], 0]);
      const table = movedTable(grid.table, (p) => warp(fromUnit(applyRegionToModel(toUnit(p), skullKeys))));
      bases[group] = { keys, nodes: packed(half.flat(2), Int16Array), table: packed(table, Uint16Array) };
      const got = measured(landmarks(mirrorLattice(half), dus, rows, atlas), mm);
      console.log(' ', group.padEnd(12), Object.entries(got).map(([name, value]) => `${name} ${value.toFixed(1)}${MEASURES[group][name] ? `/${(MEASURES[group][name][sexIndex] * (['nSn', 'snGn', 'snSto', 'lsSto', 'stoLi', 'trN'].includes(name) ? faceScale : 1)).toFixed(1)}` : ''}`).join(' '));
    }
    data[sex] = { dus: grid.columns, rows, bases };
  });
  const lines = ['// Generated by tools/headbases.mjs (tools/blender/head/README.md); do not edit by hand.',
    '// The head model\'s lattices (headlattice.js): for each sex its shares round (`dus`) and rows down the photo atlas, and for each',
    '// group its shape keys (faceregions.js), its half lattice\'s points (`nodes`: rows by shares by x, y, z, 16-bit integers of',
    '// `scale` to a head radius) and its hair\'s ground (`table`: `polars` + 1 by `azimuths` distances from the centre, likewise).',
    'export const HEAD_GRID_DATA = {',
    `  skull: ${JSON.stringify(data.skull)}, scale: ${data.scale}, polars: ${data.polars}, azimuths: ${data.azimuths},`];
  for (const sex of SEXES) {
    lines.push(`  ${sex}: {`, `    dus: ${JSON.stringify(data[sex].dus.map((value) => Number(value.toFixed(5))))},`, `    rows: ${JSON.stringify(data[sex].rows.map((value) => Number(value.toFixed(5))))},`, '    bases: {');
    for (const [group, base] of Object.entries(data[sex].bases)) lines.push(`      ${group}: { keys: ${JSON.stringify(base.keys)}, nodes: '${base.nodes}', table: '${base.table}' },`);
    lines.push('    },', '  },');
  }
  lines.push('};', '');
  const file = new URL('../src/headgrid-data.js', import.meta.url);
  writeFileSync(file, lines.join('\n'));
  console.log('src/headgrid-data.js', lines.join('\n').length, 'bytes');
}

main();
