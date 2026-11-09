// A samurai's honour (outfits.js gear.honour, ai.js honourOf): in single combat he does not hang back from, or fear, a man who
// outmatches him; in a battle only AI.panic.honourInBattle of that.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs, PRESETS } from '../src/body.js';
import { AI, confidence, fearTarget, honourOf } from '../src/ai.js';
import { createWorld } from '../src/physics.js';

const duel = (honour) => {
  const samurai = normaliseInputs({ ...PRESETS.samurai, outfit: { ...PRESETS.samurai.outfit, ...(honour === undefined ? {} : { honour }) } });
  return createWorld([{ inputs: samurai, corner: 'red' }, { inputs: normaliseInputs(PRESETS.maximilian), corner: 'blue' }], { seed: 1, arena: { halfX: 8, halfZ: 8 } });
};

test('honour: a samurai in single combat with a knight in full plate is barely less sure of himself, and fears him far less', () => {
  const plain = duel(0);
  const proud = duel();
  const [samurai, knight] = proud.fighters;
  assert.equal(samurai.body.gear.honour, 0.9);
  assert.equal(honourOf(proud, samurai), 0.9, 'all of it, one against one');
  const before = confidence(plain.fighters[0], plain.fighters[1], plain);
  const after = confidence(samurai, knight, proud);
  assert.ok(before < -0.5, `without it he is outmatched (${before.toFixed(2)})`);
  assert.ok(Math.abs(after - before * 0.1) < 1e-9, `with it a tenth of that (${after.toFixed(2)})`);
  const fearBefore = fearTarget(plain, plain.fighters[0], before, plain.fighters[1]);
  const fearAfter = fearTarget(proud, samurai, after, knight);
  assert.ok(fearAfter < fearBefore * 0.3, `fear ${fearAfter.toFixed(3)} against ${fearBefore.toFixed(3)}`);
  assert.equal(honourOf(proud, knight), 0, 'a knight has none of it');
});

test('honour: in a battle only honourInBattle of it', () => {
  const men = Array.from({ length: AI.rout.minSide }, (_, k) => ({ inputs: normaliseInputs(PRESETS.samurai), corner: 'red', at: [k, 0] }));
  const world = createWorld([...men, { inputs: normaliseInputs(PRESETS.knight), corner: 'blue' }], { seed: 1, arena: { halfX: 14, halfZ: 9 } });
  assert.ok(Math.abs(honourOf(world, world.fighters[0]) - 0.9 * AI.panic.honourInBattle) < 1e-9);
});
