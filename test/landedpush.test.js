import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld } from '../src/physics.js';

/** A kanabo against an unguarded man in iron lamellar, 20 s, over `seeds` fights: every part's meeting with the floor (m/s). */
function floorImpacts(seeds) {
  const speeds = [];
  for (let seed = 1; seed <= seeds; seed += 1) {
    const world = createWorld([
      { inputs: { ...structuredClone(PRESETS.contender), style: 'kanabo' }, corner: 'red' },
      { inputs: { ...structuredClone(PRESETS.contender), style: 'passive', outfit: { kind: 'hanSoldier', design: 0 }, accessories: [] }, corner: 'blue' },
    ], { seed, arena: { halfX: 20, halfZ: 20 }, rules: { noPins: true } });
    const man = world.fighters[1];
    const unthinking = new Set([man.id]);
    for (let time = 0; time < 20 && man.state !== 'out'; time += 0.1) advance(world, 0.1, (current, dt) => thinkAll(current, dt, unthinking));
    for (const event of world.events) if (event.kind === 'impact' && event.fighter === man.id) speeds.push(event.speed);
  }
  return speeds;
}

test('a club carried on into a man after its blow is kept out of him, not struck into him again each substep: he falls at a fall\'s speed', () => {
  // (It drove a man a kanabo had dropped into the floor at 10-17 m/s, his forearm first: "hand broken in the fall".)
  const speeds = floorImpacts(12);
  assert.ok(speeds.length > 0, 'he goes down');
  assert.ok(Math.max(...speeds) < 8, `fastest meeting with the floor ${Math.max(...speeds).toFixed(1)} m/s`);
});
