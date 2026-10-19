// The castle's pieces, added to a batch: two that overlap on one plane are lifted apart, ones that do not are not troubled, and nothing is moved by more than
// the largest lift. (A stand-in for THREE: with no matrix, only a vector is touched.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FaceRegistry, KIT_SEPARATION, kitLiftMost } from '../src/depthrange.js';

class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    Object.assign(this, { x, y, z });
  }

  set(x, y, z) {
    Object.assign(this, { x, y, z });
    return this;
  }

  addScaledVector(v, s) {
    return this.set(this.x + v.x * s, this.y + v.y * s, this.z + v.z * s);
  }
}

/** A flat quad facing up (two triangles) over x0..x1, z0..z1 at height y, as a geometry the batch reads. */
function floor(x0, x1, z0, z1, y) {
  const p = [x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z1, x1, y, z0, x0, y, z0];
  const attribute = (values, size) => ({ getX: (i) => values[i * size], getY: (i) => values[i * size + 1], getZ: (i) => values[i * size + 2], count: values.length / size });
  return { index: null, attributes: { position: attribute(p, 3), normal: attribute(new Array(18).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3), uv: attribute(new Array(12).fill(0), 2) } };
}

/** The heights the batch gave the vertices of everything added, per piece (the first vertex's y). */
const heights = (batch) => [...batch.buckets.values()].flatMap((bucket) => {
  const list = [];
  for (let k = 0; k < bucket.position.length; k += 18) list.push(bucket.position[k + 1]);
  return list;
});

async function kitBatch(faces) {
  globalThis.THREE = { Vector3, Matrix3: class {} };
  const { KitBatch } = await import('../src/levelmode/kitgeo.js');
  return new KitBatch({ flags: {}, cobble: {} }, 1, faces);
}

test('two floors on one plane are lifted apart, a floor elsewhere is not, and nothing rises more than the most', async () => {
  const kept = globalThis.THREE;
  try {
    const batch = await kitBatch(new FaceRegistry());
    batch.add('flags', floor(0, 4, 0, 4, 12.18));
    batch.add('cobble', floor(1, 3, 1, 3, 12.18));
    batch.add('flags', floor(10, 14, 0, 4, 12.18));
    batch.add('flags', floor(2, 5, 2, 5, 12.18));
    const [a, b, far, c] = heights(batch).map((y) => y - 12.18);
    assert.ok(Math.abs(a - b) >= KIT_SEPARATION - 1e-9, 'the cobbles laid over the flags stand apart from them');
    assert.ok(Math.abs(c - a) >= KIT_SEPARATION - 1e-9 && Math.abs(c - b) >= KIT_SEPARATION - 1e-9, 'and a third over both');
    for (const lift of [a, b, far, c]) assert.ok(lift >= -1e-9 && lift <= kitLiftMost() + 1e-9, `lift ${lift}`);
    assert.equal(batch.triangles, 8);
  } finally {
    globalThis.THREE = kept;
  }
});

test('a batch without a registry still lifts its pieces by the build order, neighbours apart', async () => {
  const kept = globalThis.THREE;
  try {
    const batch = await kitBatch(null);
    for (let k = 0; k < 5; k += 1) batch.add('flags', floor(0, 4, 0, 4, 5));
    const lifts = heights(batch).map((y) => y - 5);
    for (let k = 0; k + 1 < lifts.length; k += 1) assert.ok(Math.abs(lifts[k] - lifts[k + 1]) >= KIT_SEPARATION);
  } finally {
    globalThis.THREE = kept;
  }
});
