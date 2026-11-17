import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, placeFighter } from '../src/physics.js';
import { placeMounted } from '../src/physics/mounted.js';
import { RIDING } from '../src/riding.js';

/**
 * Eight of red's foot at grips with eight of blue's, four red knights on horses 20 m behind their own line; over the
 * first 9 s (the lines still standing), the rider-steps at a pace (over 3 m/s) with a horse within 1 m of a man of its own.
 */
function rideThroughOwn(seed) {
  const foot = (corner) => ({ inputs: structuredClone(PRESETS.veteran), corner });
  const rider = () => ({ inputs: { ...structuredClone(PRESETS.knight), mounted: true }, corner: 'red' });
  const world = createWorld([...Array.from({ length: 8 }, () => foot('red')), ...Array.from({ length: 4 }, rider), ...Array.from({ length: 8 }, () => foot('blue'))], { seed, arena: { halfX: 40, halfZ: 30 } });
  world.fighters.forEach((fighter, index) => {
    if (index < 8) placeFighter(fighter, -1.5, (index - 3.5) * 2);
    else if (index < 12) placeMounted(fighter, -22, (index - 9.5) * 3, 0);
    else placeFighter(fighter, 1.5, (index - 15.5) * 2);
  });
  const riders = world.fighters.filter((fighter) => fighter.mount);
  const own = world.fighters.filter((fighter) => !fighter.mount && fighter.corner === 'red');
  let through = 0;
  for (let t = 0; t < 9; t += 1 / 60) {
    advance(world, 1 / 60, (current, dt) => thinkAll(current, dt));
    for (const man of riders) {
      if (man.state !== 'up' || !man.mount || Math.abs(man.mount.speed) < 3) continue;
      for (const mate of own) if (mate.state === 'up' && Math.hypot(mate.x[P.pelvis * 3] - man.mount.at[0], mate.x[P.pelvis * 3 + 2] - man.mount.at[1]) < 1) through += 1;
    }
  }
  return through;
}

test('horse behind its own foot rides round the end of them rather than into their backs', () => {
  const round = rideThroughOwn(1) + rideThroughOwn(3);
  const corridor = RIDING.flank.corridor;
  RIDING.flank.corridor = 0;
  let straight;
  try {
    straight = rideThroughOwn(1) + rideThroughOwn(3);
  } finally {
    RIDING.flank.corridor = corridor;
  }
  assert.ok(round < straight / 3, `${round} rider-steps among his own going round, ${straight} riding straight at his man`);
});
