import test from 'node:test';
import assert from 'node:assert/strict';
import { tkLayBake } from '../src/townkit/lay.js';

// One wall 6 m high along x = 0 (z -10..10), a sun 30 degrees up in the east (+x): its shadow runs 10.4 m west.
const wall = () => {
  const p = [0, 0, -10, 0, 6, -10, 0, 6, 10, 0, 0, -10, 0, 6, 10, 0, 0, 10];
  return [{ level: 'all', material: 'brick', position: new Float32Array(p), normal: new Float32Array(Array.from({ length: 6 }, () => [-1, 0, 0]).flat()) }];
};
const sun = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0];
const bake = (withSun) => tkLayBake({ batches: wall(), box: { x: [-20, 20], z: [-15, 15] }, ground: () => 0, texel: 0.3, ...(withSun ? { sun } : null) });

test('the sun sheet: lit ground on the sun side of a wall, shade behind it, lit face seen from across the way', () => {
  const lay = bake(true);
  assert.ok(lay.c, 'a sun gives sheet C');
  assert.ok(lay.at(8, 0).litGround > 0.9, 'open ground in the sun');
  assert.ok(lay.at(-4, 0).litGround < 0.1, 'ground in the wall\'s shadow');
  assert.ok(lay.at(-16, 0).litGround > 0.5, 'past the shadow\'s length the ground is lit again');
  assert.ok(lay.at(1, 0).litWall > 0.3, 'beside the wall\'s sunlit face');
  assert.ok(lay.at(-4, 0).shade > 3 && lay.at(-4, 0).shade < 6, 'the air comes out of the wall\'s shade a few metres up');
});

test('no sun, no sun sheet', () => {
  const lay = bake(false);
  assert.equal(lay.c, null);
  assert.equal(lay.at(8, 0).litGround, 0);
});
