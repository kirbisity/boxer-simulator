import test from 'node:test';
import assert from 'node:assert/strict';
import { MOVES, moveRange } from '../src/moves.js';
import { createWorld } from '../src/physics.js';
import { WARRIORS } from '../src/roster.js';
import { tap } from '../tools/whip-measure.js';

const by = Object.fromEntries(WARRIORS.map((warrior) => [warrior.key, warrior.inputs]));
const reach = (() => {
  const world = createWorld([{ inputs: structuredClone(by.lorarius), corner: 'red' }, { inputs: structuredClone(by.shaolin), corner: 'blue' }]);
  return moveRange(MOVES.overhand, world.fighters[0].body, world.fighters[0].weapon.spec);
})();

/** Taps at `opponent` doing `what`, from near to the edge of the whip's reach: those thrown with him in reach. */
const taps = (opponent, what, seeds = 6) => {
  const results = [];
  for (let seed = 1; seed <= seeds; seed += 1) {
    for (const move of ['overhand', 'forehand']) {
      const result = tap(opponent, what, seed, 0.9 + (reach - 0.9) * ((seed * 0.618) % 1), move);
      if (result && result.apart <= reach) results.push(result);
    }
  }
  return results;
};

test('a lash thrown at a man within the whip\'s reach lands: standing, moving about or guarding', () => {
  for (const what of ['standing', 'moving', 'guarding']) {
    const results = taps('shaolin', what);
    const landed = results.filter((result) => result.hit).length;
    assert.ok(results.length >= 8 && landed >= 0.95 * results.length, `${what}: ${landed}/${results.length} landed`);
  }
});

test('a lash has a little weight: the struck part flinches and a bare man is shoved a touch; a man braced in plate only flinches', () => {
  const bare = taps('shaolin', 'standing', 4).filter((result) => result.hit);
  const shoves = bare.map((result) => result.dv);
  assert.ok(shoves.some((dv) => dv > 0.01) && Math.max(...shoves) < 0.15, `bare shove ${shoves.map((dv) => dv.toFixed(3))}`);
  assert.ok(bare.every((result) => result.flinch > 0.2 && result.flinch < 4), `bare flinch ${bare.map((result) => result.flinch.toFixed(2))}`);
  const plate = taps('plate', 'standing', 4).filter((result) => result.hit);
  assert.ok(plate.length > 0 && plate.every((result) => result.dv < 0.005 && result.flinch > 0), `plate shove ${plate.map((result) => result.dv.toFixed(3))}`);
});
