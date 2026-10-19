// The Dunnottar bot's path finder (tools/botnav.js): the way round a wall to a point, through a door, over the terrain as the physics keeps a man off it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain, slabOf, wallOf } from '../src/physics/terrain.js';
import { findPath, standable } from '../tools/botnav.js';

/** A flat floor with a wall along z = 0 from x = -10 to 10, a door in it at x 2..4. */
const yard = () => createTerrain([
  slabOf([0, 0], [60, 60], 0, { bottom: -5 }),
  wallOf([-4, 0], [12, 0.4], -1, 3),
  wallOf([7, 0], [6, 0.4], -1, 3),
]);

test('botnav: a point behind a wall is reached by the door, a point in the open by a straight line', () => {
  const terrain = yard();
  const round = findPath(terrain, { x: -2, z: -3, y: 0 }, [-2, 3]);
  assert.ok(round, 'a way round');
  assert.ok(round.some(([x, z]) => Math.abs(z) < 0.5 && x > 1.5 && x < 4.5), 'through the door');
  const straight = findPath(terrain, { x: -2, z: -3, y: 0 }, [-8, -9]);
  assert.ok(straight.length <= 16, `${straight.length} cells for 8 m`);
});

test('botnav: no way into a closed room, and a spot in a wall cannot be stood on', () => {
  const terrain = createTerrain([slabOf([0, 0], [60, 60], 0, { bottom: -5 }), wallOf([0, 4], [8, 0.4], -1, 3), wallOf([0, -4], [8, 0.4], -1, 3), wallOf([4, 0], [0.4, 8], -1, 3), wallOf([-4, 0], [0.4, 8], -1, 3)]);
  assert.equal(findPath(terrain, { x: 10, z: 10, y: 0 }, [0, 0]), null);
  assert.equal(standable(terrain, 4, 0, 0, 0.45), null);
  assert.equal(standable(terrain, 10, 10, 0, 0.45), 0);
});
