// The head of a photo face on the head model (headgrid-data.js; tools/blender/head, tools/headbases.mjs): a real head's shape
// in place of the drawn head's (photohead.js buildPhotoHead), with its own nose, lips, lids and brow.
//
// The model is a lattice of points laid out on the photo atlas: a point for each [share round from the face's middle, row down
// from the crown], closer together over the face. Its eyes, nose, mouth and chin are at the atlas's places for them, so a
// point's place in the lattice is its texture coordinate and the photo's features lie on the model's.
//
// There is a lattice for each of a few groups of faces (faceregions.js HEAD_BASE_GROUPS), a sex at a time: the same points,
// moved to that group's published measures. A fighter's head is the mix of them nearest his own shape (his region's
// tendencies and his own departures: photoface.js), and what the mix leaves of his shape is added as the drawn head adds it
// (photohead.js applyRegionToModel, faceStructure), as a change on the model.
//
// Plain arrays in and out (no Three.js; the data is handed in), so it runs in Node: the tool that makes the data uses it too.

import { FACE_MORPH, faceMarks, morphHeadPoint } from './facemorph.js';
import { PHOTO_HEAD, applyRegionToModel, faceStructure, headSmooth, photoLandmarks } from './photohead.js';

export const HEAD_LATTICE = {
  // The region's and the fighter's own departures (noseBridge, brow, socket, lidFold, lips, chin, cheekbone) are raised on
  // the model at their written size (the drawn head's were raised half as large again, PHOTO_HEAD.model.contrast: its flat
  // face needed it; the model's groups already differ by their measures).
  contrast: 1,
  // The face's structure is a change on the model only this far round from the face's middle (share of the way round), as on
  // the drawn head.
  faceSpan: 0.2,
  // A fighter's own proportions (photoface.js jitter: his eyes' and mouth's height, his face's width) move the model's points,
  // the photo with them: the eyes' and the mouth's surroundings this far up and down (rows), the face's width this far round
  // (radians, as the drawn head's).
  jitter: { rows: 0.05, round: 0.9 },
  // What is left of a fighter's nose width over his bases' is a stretch sideways about the wings, not the drawn head's wider
  // ridge (on the model that raises a second nose beside the first): `perKey` of the breadth a unit of the key, the bases'
  // own (the men's alar breadths 35.1, 36.9, 39.0 and 43.6 mm at keys -0.4, 0, 0.3 and 0.9, tools/headbases.mjs: 6.5 mm a
  // unit over 37 mm), fading `round` (share of the way round) and `rows` from the wings.
  nose: { perKey: 0.18, round: 0.07, rows: 0.035 },
  // A crowd's head: every `coarse`-th point each way.
  coarse: 2,
  // The ears' texture coordinates are the nearest point's, of those this far round (share) and down (rows): the sides.
  earBand: { round: [0.15, 0.4], rows: [0.3, 0.8] },
};

/** The solution of A x = B by elimination with pivoting; `B` is a list of right-hand rows (one per row of A), as is the result. */
export function solveLinear(A, B) {
  const size = A.length;
  const a = A.map((row, index) => [...row, ...B[index]]);
  const width = a[0].length;
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    [a[column], a[pivot]] = [a[pivot], a[column]];
    const lead = a[column][column] || 1e-12;
    for (let row = column + 1; row < size; row += 1) {
      const factor = a[row][column] / lead;
      if (factor === 0) continue;
      for (let at = column; at < width; at += 1) a[row][at] -= factor * a[column][at];
    }
  }
  const x = a.map(() => new Array(width - size).fill(0));
  for (let row = size - 1; row >= 0; row -= 1) {
    for (let right = 0; right < width - size; right += 1) {
      let sum = a[row][size + right];
      for (let column = row + 1; column < size; column += 1) sum -= a[row][column] * x[column][right];
      x[row][right] = sum / (a[row][row] || 1e-12);
    }
  }
  return x;
}

/**
 * The mix of `vectors` nearest `target` (least squares), its shares none below zero and summing to one: every set of the
 * vectors is tried with the rest left out, and the nearest whose shares are all positive is kept.
 */
export function simplexWeights(target, vectors) {
  const count = vectors.length;
  const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
  let best = null;
  for (let mask = 1; mask < 1 << count; mask += 1) {
    const members = [];
    for (let index = 0; index < count; index += 1) if (mask & (1 << index)) members.push(index);
    // (Least squares with the shares' sum held at one: the normal equations with a multiplier.)
    const system = members.map((a) => [...members.map((b) => dot(vectors[a], vectors[b]) + (a === b ? 1e-9 : 0)), 1]);
    system.push([...members.map(() => 1), 0]);
    const solved = solveLinear(system, [...members.map((a) => [dot(vectors[a], target)]), [1]]);
    const shares = new Array(count).fill(0);
    members.forEach((member, index) => { shares[member] = solved[index][0]; });
    if (shares.some((share) => share < -1e-9)) continue;
    const miss = target.reduce((sum, value, axis) => sum + (value - shares.reduce((mixed, share, index) => mixed + share * vectors[index][axis], 0)) ** 2, 0);
    if (!best || miss < best.miss) best = { shares: shares.map((share) => Math.max(0, share)), miss };
  }
  return best.shares;
}

/** A half lattice's points [rows][columns] (the face's middle to the back, z ≥ 0) as the whole one's: rows of 2·columns − 1 points, the back's seam at both ends. */
export function mirrorLattice(half) {
  return half.map((row) => [...row.slice(1).reverse().map((p) => [p[0], p[1], -p[2]]), ...row.map((p) => [p[0], p[1], p[2]])]);
}

/** The whole lattice's shares round for a half's. */
export const mirrorShares = (dus) => [...dus.slice(1).reverse().map((du) => -du), ...dus];

/** The lattice's triangles: two for each cell. */
export function latticeIndices(rowCount, stride) {
  const indices = [];
  for (let row = 0; row < rowCount - 1; row += 1) {
    for (let column = 0; column < stride - 1; column += 1) {
      const a = row * stride + column;
      const b = a + stride;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  return indices;
}

/**
 * Each lattice point's normal: its triangles' normals summed by their area, the seam's two columns and each pole's row made
 * one (tools/blender/head/grid.py lattice_normals is the same, for the normal map baked over it). `points`: [x, y, z] row by
 * row.
 */
export function gridNormals(points, rowCount, stride) {
  const normals = new Float32Array(points.length * 3);
  const add = (vertex, n) => { for (let axis = 0; axis < 3; axis += 1) normals[vertex * 3 + axis] += n[axis]; };
  const cross = (o, p, q) => {
    const e1 = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
    const e2 = [q[0] - o[0], q[1] - o[1], q[2] - o[2]];
    return [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  };
  for (let row = 0; row < rowCount - 1; row += 1) {
    for (let column = 0; column < stride - 1; column += 1) {
      const a = row * stride + column;
      const b = a + stride;
      const first = cross(points[a], points[a + 1], points[b]);
      const second = cross(points[b], points[a + 1], points[b + 1]);
      add(a, first); add(a + 1, first); add(b, first);
      add(b, second); add(a + 1, second); add(b + 1, second);
    }
  }
  for (let row = 0; row < rowCount; row += 1) {
    const [left, right] = [row * stride, row * stride + stride - 1];
    for (let axis = 0; axis < 3; axis += 1) {
      const sum = normals[left * 3 + axis] + normals[right * 3 + axis];
      normals[left * 3 + axis] = sum;
      normals[right * 3 + axis] = sum;
    }
  }
  for (const row of [0, rowCount - 1]) {
    const sum = [0, 0, 0];
    for (let column = 0; column < stride; column += 1) for (let axis = 0; axis < 3; axis += 1) sum[axis] += normals[(row * stride + column) * 3 + axis];
    for (let column = 0; column < stride; column += 1) for (let axis = 0; axis < 3; axis += 1) normals[(row * stride + column) * 3 + axis] = sum[axis];
  }
  for (let vertex = 0; vertex < points.length; vertex += 1) {
    const length = Math.hypot(normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2]) || 1;
    for (let axis = 0; axis < 3; axis += 1) normals[vertex * 3 + axis] /= length;
  }
  return normals;
}

/**
 * Each lattice point's tangent for the normal map (three.js `tangent`: x, y, z and the bitangent's sign): the way round the
 * head (the map's u), squared to the point's normal; -1, the bitangent cross(normal, tangent) turned to point up the head
 * (the map's v). A frame that varies smoothly over the lattice, where one built from each triangle's own texture
 * coordinates (three.js with no tangents) changes from one long triangle of the nose's side to the next. grid.py
 * lattice_frames is the same, for the map baked in it. `normals`: gridNormals's.
 */
export function gridTangents(points, normals, rowCount, stride) {
  const tangents = new Float32Array(points.length * 4);
  const round = (row, column) => {
    // (The seam's two columns are one place: the neighbours either side of it.)
    const [before, after] = column === 0 || column === stride - 1 ? [stride - 2, 1] : [column - 1, column + 1];
    const [p, q] = [points[row * stride + before], points[row * stride + after]];
    return [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  };
  for (let row = 0; row < rowCount; row += 1) {
    // (A pole's row is one point: the row next to it tells which way is round.)
    const from = Math.min(rowCount - 2, Math.max(1, row));
    for (let column = 0; column < stride; column += 1) {
      const vertex = row * stride + column;
      const n = [normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2]];
      const t = round(from, column);
      const along = t[0] * n[0] + t[1] * n[1] + t[2] * n[2];
      for (let axis = 0; axis < 3; axis += 1) t[axis] -= along * n[axis];
      const length = Math.hypot(t[0], t[1], t[2]);
      // (Nothing left of it, at a pole: any direction square to the normal.)
      const flat = length < 1e-9 ? [n[2], 0, -n[0]] : t;
      const size = Math.hypot(flat[0], flat[1], flat[2]) || 1;
      tangents.set([flat[0] / size, flat[1] / size, flat[2] / size, -1], vertex * 4);
    }
  }
  return tangents;
}

/**
 * A shape's departures as a change on the lattice (unit space: the skull's scale taken out): `skullKeys` move it as the drawn
 * head's skull, jaw and cheekbones' breadth are moved (applyRegionToModel), `faceKeys` raise the nose, brow, sockets, lids,
 * cheekbones, lips and chin out from the head's centre by what they add to no region's face (faceStructure). `points`: the whole
 * lattice's, row by row; `dus`, `rows`: each column's share round and each row's place down.
 */
export function shapeLattice(points, dus, rows, atlas, skullKeys, faceKeys) {
  const moved = points.map((p) => applyRegionToModel(p, skullKeys));
  if (!Object.values(faceKeys).some((value) => Math.abs(value) > 1e-6)) return moved;
  const stride = dus.length;
  const marks = photoLandmarks(atlas);
  return moved.map((p, vertex) => {
    const du = dus[vertex % stride];
    if (Math.abs(du) >= HEAD_LATTICE.faceSpan) return p;
    const row = rows[Math.floor(vertex / stride)];
    const change = (faceStructure(du, row, marks, faceKeys).height - faceStructure(du, row, marks, {}).height) * headSmooth(-0.2, 0.3, p[0]);
    // (Along the point's own ray from the head's centre, the lattice's lay: no point crosses its neighbour. Along the
    // lattice's normals a lower bridge would draw the nose's two sides, which face apart, in to a blade.)
    const reach = Math.hypot(p[0], p[1], p[2]) || 1;
    return p.map((value) => value * (1 + change / reach));
  });
}

const latticeBytes = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
const HEAD_LATTICES = new WeakMap();

/**
 * A sex's lattices, read once from the data: { dus, rows, names, keyNames, bases: [{ keys, half: [rows][columns][x, y, z] (head
 * radii), table: the hair's ground (distances from the centre, `polars` + 1 by `azimuths`) }] }.
 */
export function headLattice(data, sex) {
  if (!HEAD_LATTICES.has(data)) HEAD_LATTICES.set(data, {});
  const read = HEAD_LATTICES.get(data);
  if (read[sex]) return read[sex];
  const { dus, rows, bases } = data[sex];
  const names = Object.keys(bases);
  const keyNames = Object.keys(bases[names[0]].keys);
  read[sex] = {
    dus, rows, names, keyNames,
    bases: names.map((name) => {
      const coords = new Int16Array(latticeBytes(bases[name].nodes).buffer);
      const half = rows.map((_, row) => dus.map((__, column) => [0, 1, 2].map((axis) => coords[(row * dus.length + column) * 3 + axis] / data.scale)));
      const table = Float32Array.from(new Uint16Array(latticeBytes(bases[name].table).buffer), (value) => value / data.scale);
      return { keys: bases[name].keys, half, table };
    }),
  };
  return read[sex];
}

/** A ground table's surface in direction (x, y, z) (any length), head radii: its distance along it, read between the table's samples. */
export function tablePoint(table, polars, azimuths, x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  const row = Math.min(polars - 1e-6, (Math.acos(Math.max(-1, Math.min(1, y / length))) / Math.PI) * polars);
  const column = (((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * azimuths) % azimuths;
  const r0 = Math.floor(row);
  const c0 = Math.floor(column) % azimuths;
  const c1 = (c0 + 1) % azimuths;
  const fr = row - r0;
  const fc = column - Math.floor(column);
  const at = (r, c) => table[r * azimuths + c];
  const radius = (at(r0, c0) * (1 - fc) + at(r0, c1) * fc) * (1 - fr) + (at(r0 + 1, c0) * (1 - fc) + at(r0 + 1, c1) * fc) * fr;
  return [(x / length) * radius, (y / length) * radius, (z / length) * radius];
}

/** The fighter's shares of the lattices (by name) and what they leave of his shape: { shares, residual }. */
export function headMix(lattice, region) {
  const target = lattice.keyNames.map((key) => region[key] ?? 0);
  const shares = simplexWeights(target, lattice.bases.map((base) => lattice.keyNames.map((key) => base.keys[key] ?? 0)));
  const residual = {};
  lattice.keyNames.forEach((key, index) => {
    residual[key] = target[index] - shares.reduce((sum, share, base) => sum + share * (lattice.bases[base].keys[key] ?? 0), 0);
  });
  return { shares, residual };
}

/**
 * The head's mesh on the model: what buildPhotoHead gives ({ positions, normals, uvs, colors, indices, uvAt, point, most,
 * mouthY, earZ }, the head's local space, radius applied). `data`: HEAD_GRID_DATA; `skull`: face.js SKULL; `shape`: the drawn
 * shape (its `morph` only); `atlas`: PHOTO_ATLAS; `region`: the fighter's shape; `jitter`: his proportions; `coarse`: a crowd's.
 */
export function buildLatticeHead({ data, radius, skull, shape, atlas, region = {}, jitter = {}, coarse = false, female = false }) {
  const lattice = headLattice(data, female ? 'female' : 'male');
  const { shares, residual } = headMix(lattice, region);
  const step = coarse ? HEAD_LATTICE.coarse : 1;
  const thinned = (count) => {
    const kept = [];
    for (let index = 0; index < count - 1; index += step) kept.push(index);
    kept.push(count - 1);
    return kept;
  };
  const keptRows = thinned(lattice.rows.length);
  const keptColumns = thinned(lattice.dus.length);
  const rows = keptRows.map((row) => lattice.rows[row]);
  const dus = mirrorShares(keptColumns.map((column) => lattice.dus[column]));
  const stride = dus.length;
  const half = keptRows.map((row) => keptColumns.map((column) => [0, 1, 2].map((axis) => shares.reduce((sum, share, base) => sum + share * lattice.bases[base].half[row][column][axis], 0))));
  const unit = mirrorLattice(half).flat().map((p) => [p[0] / skull[0], p[1] / skull[1], p[2] / skull[2]]);
  // (The breadths are not heights: the nose's is the stretch below, the cheekbones' applyRegionToModel's, as in the bases.)
  const faceKeys = { ...Object.fromEntries(Object.entries(residual).map(([key, value]) => [key, value * HEAD_LATTICE.contrast])), noseWidth: 0, cheekWidth: 0, cheekbone: 0 };
  const shaped = shapeLattice(unit, dus, rows, atlas, residual, faceKeys);
  // His own proportions: the eyes' and the mouth's surroundings a little up or down by the face's own height per row there,
  // the face a little wider or narrower.
  const marks = photoLandmarks(atlas);
  const middle = (dus.length - 1) / 2;
  const nearestRow = (wanted) => rows.reduce((best, row, index) => (Math.abs(row - wanted) < Math.abs(rows[best] - wanted) ? index : best), 0);
  const [eyeRow, mouthRow] = [nearestRow(marks.eyeRow), nearestRow(marks.mouthRow)];
  const perRow = (shaped[eyeRow * stride + middle][1] - shaped[mouthRow * stride + middle][1]) / (rows[mouthRow] - rows[eyeRow]);
  const j = HEAD_LATTICE.jitter;
  const own = shaped.map((p, vertex) => {
    const du = dus[vertex % stride];
    const row = rows[Math.floor(vertex / stride)];
    const front = headSmooth(-0.2, 0.3, p[0]);
    const lift = (jitter.eyeRow ?? 0) * Math.exp(-(((row - marks.eyeRow) / j.rows) ** 2)) + (jitter.mouthRow ?? 0) * Math.exp(-(((row - marks.mouthRow) / j.rows) ** 2));
    const widen = (jitter.width ?? 0) * Math.exp(-(((du * 2 * Math.PI) / j.round) ** 2));
    const nose = HEAD_LATTICE.nose.perKey * (residual.noseWidth ?? 0) * Math.exp(-((du / HEAD_LATTICE.nose.round) ** 2) - ((row - marks.noseRow) / HEAD_LATTICE.nose.rows) ** 2);
    return [p[0], p[1] + perRow * lift * front, p[2] * (1 + widen + nose * front)];
  });
  const morph = shape.morph;
  const morphed = (p) => {
    if (!morph) return p;
    const m = morphHeadPoint(p[0], p[1], p[2], morph);
    return p.map((value, axis) => value + (m[axis] - value) * PHOTO_HEAD.morphGain);
  };
  const finalUnit = own.map(morphed);
  const final = finalUnit.map((p) => [p[0] * skull[0] * radius, p[1] * skull[1] * radius, p[2] * skull[2] * radius]);
  const uvs = [];
  const colors = [];
  finalUnit.forEach((p, vertex) => {
    const du = dus[vertex % stride];
    const row = rows[Math.floor(vertex / stride)];
    uvs.push(0.5 + du, 1 - row);
    // Per vertex: the body's marks (hollows, jowls, red cheeks: facemorph.js) and the face's shadow (sockets, under the nose).
    const paint = morph ? faceMarks(p[0], p[1], p[2], morph) : [1, 1, 1];
    const shade = Math.abs(du) < HEAD_LATTICE.faceSpan ? faceStructure(du, row, marks, {}).shade * headSmooth(-0.2, 0.3, p[0]) : 0;
    colors.push(...paint.map((value) => Math.min(1, value * (1 - shade))));
  });
  // The hair's and the beard's ground: the lattices' own, mixed as they are, with what is left of his shape and the morph.
  const table = new Float32Array(lattice.bases[0].table.length);
  shares.forEach((share, base) => { if (share > 0) lattice.bases[base].table.forEach((value, index) => { table[index] += share * value; }); });
  const ground = (x, y, z) => {
    const p = tablePoint(table, data.polars, data.azimuths, x, y, z);
    return applyRegionToModel([p[0] / skull[0], p[1] / skull[1], p[2] / skull[2]], residual);
  };
  const band = HEAD_LATTICE.earBand;
  const sides = [];
  final.forEach((p, vertex) => {
    const du = Math.abs(dus[vertex % stride]);
    const row = rows[Math.floor(vertex / stride)];
    if (du >= band.round[0] && du <= band.round[1] && row >= band.rows[0] && row <= band.rows[1]) sides.push(vertex);
  });
  const normals = gridNormals(final, rows.length, stride);
  return {
    positions: final.flat(),
    normals,
    tangents: gridTangents(final, normals, rows.length, stride),
    uvs,
    colors,
    indices: latticeIndices(rows.length, stride),
    /** Texture coordinates for a point near the head (an ear), in the head's local space: the nearest point's of its sides. */
    uvAt: (x, y, z) => {
      let nearest = sides[0];
      let least = Infinity;
      for (const vertex of sides) {
        const p = final[vertex];
        const distance = (p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2;
        if (distance < least) [nearest, least] = [vertex, distance];
      }
      return [uvs[nearest * 2], uvs[nearest * 2 + 1]];
    },
    /** The head's surface in a direction (unit space, skull scale applied, no radius): for hair and beards to sit on. */
    point: (x, y, z) => {
      const p = morphed(ground(x, y, z));
      return [p[0] * skull[0], p[1] * skull[1], p[2] * skull[2]];
    },
    most: FACE_MORPH.most,
    // The lip line's height (head radii, skull scale applied) and the side of the head where the ears sit (z, unit space).
    mouthY: finalUnit[mouthRow * stride + middle][1] * skull[1],
    earZ: Math.abs(ground(-0.06, -0.08, 1)[2]),
    shares: Object.fromEntries(lattice.names.map((name, index) => [name, shares[index]])),
  };
}
