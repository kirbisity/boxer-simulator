// The Dunnottar bot's path finder (tools/botnav.js): the way round a wall to a point, through a door, over the terrain as the physics keeps a man off it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain, slabOf, wallOf } from '../src/physics/terrain.js';
import { mechanismsOf, stageTerrain } from '../src/levelmode/stage.js';
import { DUNNOTTAR } from '../src/levelmode/stages/dunnottar.js';
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

test('botnav: where one floor lies over another the goal is on the floor it is told: the torture chamber over the sea-gate chamber, not the way down and round', () => {
  const states = Object.fromEntries(mechanismsOf(DUNNOTTAR).map((mechanism) => [mechanism.id, 'open' in mechanism.states ? 'open' : mechanism.state]));
  const terrain = stageTerrain(DUNNOTTAR, DUNNOTTAR.sections.map((section) => section.id), states);
  // On the stair behind the heavy door, half way up (y 4.2), for a point of the torture chamber (floor 6) which is also a point of the crypt's flooded way (floor 1.4).
  const from = { x: 1.7, z: -32.4, y: 4.2 };
  const up = findPath(terrain, from, [6.6, -26.3], { toY: 6 });
  assert.ok(up, 'a way up and in');
  assert.ok(up.length < 30, `${up.length} cells (about ${(up.length / 2).toFixed(0)} m): the stair's head and a turn`);
  const [x, z] = up.at(-1);
  assert.ok(Math.hypot(x - 6.6, z + 26.3) < 1 && standable(terrain, x, z, 6, 0.5) === 6, 'at the point, on the upper floor');
  const down = findPath(terrain, from, [6.6, -26.3], { toY: 1.4 });
  assert.ok(down && down.length > up.length, 'and the way to the same point on the lower floor is the longer one, down the stair and round');
});
