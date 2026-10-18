import test from 'node:test';
import assert from 'node:assert/strict';
import { cellEdge, clusterByCell, SCENERY_LOD as CONFIG, shuffled, thinShare } from '../src/scenerylod.js';

test('a scatter is whole near the camera and thins to its floor, smoothly, far off', () => {
  assert.equal(thinShare(0), 1);
  assert.equal(thinShare(CONFIG.thinFrom), 1);
  assert.equal(thinShare(CONFIG.thinTo), CONFIG.thinFloor);
  assert.equal(thinShare(1000), CONFIG.thinFloor);
  let share = 1;
  for (let distance = 0; distance <= 80; distance += 1) {
    const now = thinShare(distance);
    assert.ok(now <= share + 1e-12, 'never denser farther out');
    assert.ok(now >= CONFIG.thinFloor && now <= 1);
    share = now;
  }
});

test('cells are cut so that none is nearly empty, and every point is in exactly one', () => {
  const points = Array.from({ length: 400 }, (_, index) => [(index * 37) % 100, (index * 91) % 100]);
  const edge = cellEdge(points, 12, 160);
  assert.ok(edge >= 12 && edge <= 12 * 2 ** 6);
  const cells = clusterByCell(points, edge);
  assert.equal(cells.flat().length, 400);
  assert.equal(new Set(cells.flat()).size, 400);
  assert.ok(400 / cells.length >= 160 || edge >= 12 * 2 ** 6, 'at least the minimum a cell, on average');
  // A small scatter is one cell.
  assert.equal(clusterByCell(points.slice(0, 20), cellEdge(points.slice(0, 20), 12, 160)).length, 1);
});

test('the shuffle is a permutation, the same every time for one seed, and different for another', () => {
  const items = Array.from({ length: 50 }, (_, index) => index);
  const once = shuffled(items, 3);
  assert.deepEqual([...once].sort((a, b) => a - b), items);
  assert.deepEqual(shuffled(items, 3), once);
  assert.notDeepEqual(shuffled(items, 4), once);
  assert.deepEqual(items, Array.from({ length: 50 }, (_, index) => index), 'the original is untouched');
});
