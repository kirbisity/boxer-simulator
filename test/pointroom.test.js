// A long weapon's room for the AI (ai.js AI.pointRoom): a spearman whose man stands inside the spearhead (moves.js pointRoomOf)
// gives ground before he thrusts, so the point, not the haft, meets him; with his man already at the point he does not.

import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { AI, thinkAll } from '../src/ai.js';
import { pointRoomOf } from '../src/moves.js';
import { advance, createWorld, placeFighter } from '../src/physics.js';

/** An AI spearman and a dao man standing still (played, no orders), `gap` m beyond where the spearhead begins (negative: inside it). */
function standoff(gap) {
  const world = createWorld([{ inputs: structuredClone(PRESETS.mingSpear), corner: 'red' }, { inputs: structuredClone(PRESETS.mingDao), corner: 'blue' }], { seed: 3 });
  const [spearman, man] = world.fighters;
  const distance = pointRoomOf(spearman, man) + gap;
  placeFighter(spearman, -distance / 2);
  placeFighter(man, distance / 2);
  return { world, spearman, man };
}
const apart = (a, b) => Math.hypot(a.x[P.pelvis * 3] - b.x[P.pelvis * 3], a.x[P.pelvis * 3 + 2] - b.x[P.pelvis * 3 + 2]);

/** Step until the spearman begins a blow with the spear's head (or `seconds` pass): the gap to the spearhead's line then. */
function firstThrust({ world, spearman, man }, seconds) {
  for (let step = 0; step < seconds * 60; step += 1) {
    advance(world, 1 / 60, (current, dt) => thinkAll(current, dt, new Set([man.id])));
    if (spearman.punch) return { gap: apart(spearman, man) - pointRoomOf(spearman, man), punch: spearman.punch, at: world.time };
  }
  return null;
}

test('a spearman with his man inside the spearhead gives ground before he thrusts', () => {
  const game = standoff(-0.6);
  const before = apart(game.spearman, game.man);
  const thrust = firstThrust(game, AI.pointRoom.patience - 0.2);
  assert.ok(apart(game.spearman, game.man) > before + 0.3, `he backed off: ${before.toFixed(2)} m to ${apart(game.spearman, game.man).toFixed(2)} m`);
  if (thrust) assert.ok(thrust.gap >= 0, `a thrust only once his man is out at the point (begun ${thrust.gap.toFixed(2)} m from its line)`);
});

test('a spearman with his man at the point thrusts without first giving ground', () => {
  const game = standoff(0.3);
  let roomMade = false;
  let thrust = null;
  for (let step = 0; step < 3 * 60 && !thrust; step += 1) {
    advance(game.world, 1 / 60, (current, dt) => thinkAll(current, dt, new Set([game.man.id])));
    roomMade ||= Boolean(game.spearman.aiRoom);
    if (game.spearman.punch) thrust = game.spearman.punch;
  }
  assert.ok(thrust, 'he thrust');
  assert.equal(roomMade, false, 'without stepping back to make room first');
  assert.equal(thrust.planted, true, 'and so near the point it is made planted: no lunge to carry the point past him');
});
