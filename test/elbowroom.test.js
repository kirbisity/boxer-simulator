import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { AI, thinkAll } from '../src/ai.js';
import { advance, createWorld, placeFighter } from '../src/physics.js';

/** Six men of one side bunched 0.6 m apart, two of the other 12 m off; the median distance (m) from each of the six to his nearest comrade after `seconds`. */
function spreadAfter(seconds) {
  const world = createWorld([
    ...Array.from({ length: 6 }, () => ({ inputs: { ...PRESETS.veteran, style: 'boxing' }, corner: 'red' })),
    ...Array.from({ length: 2 }, () => ({ inputs: { ...PRESETS.veteran, style: 'boxing' }, corner: 'blue' })),
  ], { seed: 3, arena: { halfX: 16, halfZ: 12 } });
  world.fighters.forEach((fighter, index) => {
    if (fighter.corner === 'red') placeFighter(fighter, -6 + (index % 2) * 0.6, (Math.floor(index / 2) - 1) * 0.6);
    else placeFighter(fighter, 6, (index - 6.5) * 2);
  });
  advance(world, seconds, (current, dt) => thinkAll(current, dt));
  const red = world.fighters.filter((fighter) => fighter.corner === 'red');
  const at = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
  const nearest = red.map((fighter) => Math.min(...red.filter((mate) => mate !== fighter).map((mate) => Math.hypot(at(fighter)[0] - at(mate)[0], at(fighter)[1] - at(mate)[1])))).sort((a, b) => a - b);
  return (nearest[2] + nearest[3]) / 2;
}

test('men out of the ranks spread to their elbow room as they go in, where without it they stay bunched', () => {
  const kept = spreadAfter(3);
  const room = AI.elbowRoom.room;
  AI.elbowRoom.room = 0;
  let bunched;
  try {
    bunched = spreadAfter(3);
  } finally {
    AI.elbowRoom.room = room;
  }
  assert.ok(kept > 1.5, `median nearest comrade ${kept.toFixed(2)} m with elbow room`);
  assert.ok(kept > bunched * 1.4, `${kept.toFixed(2)} m against ${bunched.toFixed(2)} m without`);
});
