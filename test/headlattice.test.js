// The head model (headlattice.js, headgrid-data.js): its solver and mix, the lattices as read from the data, and the head built
// on them for each sex: whole, symmetric, its texture coordinates the atlas's, its features where the atlas puts them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLatticeHead, headLattice, headMix, latticeIndices, mirrorLattice, mirrorShares, simplexWeights, solveLinear } from '../src/headlattice.js';
import { HEAD_GRID_DATA } from '../src/headgrid-data.js';

// The drawn head's skull proportions and the photo atlas's marks, as face.js and photoface.js hand them in (both modules need
// three.js, so the figures are repeated here; the last test checks them against the source).
const SKULL = [0.94, 1.06, 0.86];
const ATLAS = { eyeU: 0.0668, earU: 0.258, eyeRow: 0.44, mouthRow: 0.70, chinRow: 0.88, mouthShare: 0.56, chinT: 0.95, hairlineRow: 0.22, hairlineAt: 0.36, eyeHalf: [0.027, 0.013] };
const build = (female, extra = {}) => buildLatticeHead({ data: HEAD_GRID_DATA, radius: 1, skull: SKULL, shape: {}, atlas: ATLAS, female, ...extra });

test('the solver solves, and the mix of bases nearest a target has shares none below zero summing to one', () => {
  const [[x], [y]] = solveLinear([[2, 1], [1, 3]], [[5], [10]]);
  assert.ok(Math.abs(x - 1) < 1e-9 && Math.abs(y - 3) < 1e-9);
  const bases = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const exact = simplexWeights([0.2, 0.3, 0.5], bases);
  exact.forEach((share, index) => assert.ok(Math.abs(share - [0.2, 0.3, 0.5][index]) < 1e-6));
  const outside = simplexWeights([2, -1, 0], bases);
  assert.ok(outside.every((share) => share >= 0));
  assert.ok(Math.abs(outside.reduce((sum, share) => sum + share, 0) - 1) < 1e-9);
});

test('a half lattice mirrors into a whole one about the face\'s middle, and its cells are two triangles each', () => {
  const half = [[[1, 0, 0], [0, 0, 1]], [[1, -1, 0], [0, -1, 1]]];
  const whole = mirrorLattice(half);
  assert.deepEqual(whole[0], [[0, 0, -1], [1, 0, 0], [0, 0, 1]]);
  assert.deepEqual(mirrorShares([0, 0.25, 0.5]), [-0.5, -0.25, 0, 0.25, 0.5]);
  assert.equal(latticeIndices(3, 4).length, 2 * 3 * 6);
});

test('each sex\'s lattices are read whole from the data: the same rows and shares round for every group, every point finite', () => {
  for (const sex of ['male', 'female']) {
    const lattice = headLattice(HEAD_GRID_DATA, sex);
    assert.ok(lattice.bases.length >= 2, `${sex}: groups`);
    for (const base of lattice.bases) {
      assert.equal(base.half.length, lattice.rows.length);
      for (const row of base.half) {
        assert.equal(row.length, lattice.dus.length);
        for (const point of row) assert.ok(point.every(Number.isFinite));
      }
    }
    // A fighter of no particular shape is a mix of them that sums to one.
    const { shares } = headMix(lattice, {});
    assert.ok(Math.abs(shares.reduce((sum, share) => sum + share, 0) - 1) < 1e-9);
  }
});

test('the head built on the model is whole and symmetric, its texture coordinates the atlas\'s, its eyes and mouth where the atlas puts them', () => {
  for (const female of [false, true]) {
    const head = build(female);
    const count = head.positions.length / 3;
    assert.equal(head.uvs.length / 2, count);
    assert.ok(head.positions.every(Number.isFinite) && Array.from(head.normals).every(Number.isFinite));
    assert.ok(head.indices.every((index) => index < count));
    assert.ok(head.uvs.every((value) => value >= 0 && value <= 1));
    // Mirror pairs: the same row and the share round negated, at the same height and depth, across negated.
    const byUv = new Map();
    for (let vertex = 0; vertex < count; vertex += 1) byUv.set(`${head.uvs[vertex * 2].toFixed(5)}|${head.uvs[vertex * 2 + 1].toFixed(5)}`, vertex);
    let pairs = 0;
    for (let vertex = 0; vertex < count; vertex += 1) {
      const twin = byUv.get(`${(1 - head.uvs[vertex * 2]).toFixed(5)}|${head.uvs[vertex * 2 + 1].toFixed(5)}`);
      if (twin === undefined) continue;
      pairs += 1;
      const [a, b] = [vertex, twin].map((index) => head.positions.slice(index * 3, index * 3 + 3));
      assert.ok(Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[2] + b[2]) < 1e-6);
    }
    assert.ok(pairs > count * 0.9, 'nearly every point has its mirror');
    // The face looks along +x: the point at the eye's place on the atlas stands in front, above the one at the mouth's.
    const nearest = (u, row) => {
      let best = 0;
      let least = Infinity;
      for (let vertex = 0; vertex < count; vertex += 1) {
        const d = (head.uvs[vertex * 2] - u) ** 2 + (1 - head.uvs[vertex * 2 + 1] - row) ** 2;
        if (d < least) [best, least] = [vertex, d];
      }
      return head.positions.slice(best * 3, best * 3 + 3);
    };
    const eye = nearest(0.5 + ATLAS.eyeU, ATLAS.eyeRow);
    const mouth = nearest(0.5, ATLAS.mouthRow);
    const back = nearest(0, 0.45);
    assert.ok(eye[0] > 0.5 && mouth[0] > 0.5 && back[0] < -0.5, 'face forward, back of the head behind');
    assert.ok(eye[1] > mouth[1], 'eyes above the mouth');
    assert.ok(eye[2] > 0, 'the atlas\'s right of the middle is the head\'s +z side');
    assert.ok(Math.abs(head.mouthY - mouth[1] * 1) < 0.05, 'the lip line where the mouth is');
  }
});

test('a fighter\'s own proportions move the model: a wider face is wider, the same inputs give the same head', () => {
  const plain = build(false);
  const wide = build(false, { jitter: { width: 0.06 } });
  const breadth = (head) => Math.max(...head.positions.filter((_, index) => index % 3 === 2));
  assert.ok(breadth(wide) > breadth(plain));
  assert.deepEqual(build(false).positions, plain.positions);
  // A crowd's head: every second point each way, far fewer of them.
  assert.ok(build(false, { coarse: true }).positions.length < plain.positions.length / 3);
});

test('the skull proportions and atlas marks repeated here are the source\'s', async () => {
  const { readFileSync } = await import('node:fs');
  const face = readFileSync(new URL('../src/face.js', import.meta.url), 'utf8');
  assert.ok(face.includes(`const SKULL = [${SKULL.join(', ')}];`));
  const photo = readFileSync(new URL('../src/photoface.js', import.meta.url), 'utf8');
  const atlas = photo.match(/export const PHOTO_ATLAS = (\{[^}]*\});/)[1];
  assert.deepEqual(Function(`return ${atlas}`)(), ATLAS);
});
