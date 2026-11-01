// Pressing the fight (ai.js AI.press): every AI fighter, against the player or another AI, closes, initiates, meets a man
// who walks into his range, and strikes into a blow coming back; behaviour only. Measured with the player bot
// (tools/playerbot.js): a man at the pad who walks straight in and taps a blow every few tenths of a second.
// - pressing, the AI throws more and starts more of the exchanges than the old pace did, at least half of them;
// - and it strikes first sooner;
// - nothing of his body or kit is touched: the same fighter, pressing or not, has the same reach, mass and weapon.

import test from 'node:test';
import assert from 'node:assert/strict';
import { AI } from '../src/ai.js';
import { measure } from '../tools/playerbot.js';
import { createWorld, reachOf } from '../src/physics.js';
import { WARRIORS } from '../src/roster.js';

const PAIRS = [['maximus', 'legionary'], ['centurion', 'esen']];

/** The masher's bouts with AI.press on or off. */
function mashed(on) {
  const was = AI.press.on;
  AI.press.on = on;
  try {
    return measure('masher', { seeds: 2, seconds: 30, matchups: PAIRS });
  } finally {
    AI.press.on = was;
  }
}

test('pressing, the AI attacks more, starts at least half the exchanges, and strikes first sooner', () => {
  const old = mashed(false);
  const now = mashed(true);
  assert.ok(now.aiAttacksPerMinute > old.aiAttacksPerMinute * 1.3, `attacks/min ${old.aiAttacksPerMinute.toFixed(1)} -> ${now.aiAttacksPerMinute.toFixed(1)}`);
  assert.ok(now.aiStartShare >= 0.5 && now.aiStartShare > old.aiStartShare, `starts ${old.aiStartShare.toFixed(2)} -> ${now.aiStartShare.toFixed(2)}`);
  assert.ok(now.firstAttack <= old.firstAttack, `first attack ${old.firstAttack.toFixed(2)} -> ${now.firstAttack.toFixed(2)} s`);
});

test('pressing is behaviour only: his body, reach and weapon are the same', () => {
  const inputs = structuredClone(WARRIORS.find((warrior) => warrior.key === 'legionary').inputs);
  const shape = () => {
    const [fighter] = createWorld([{ inputs: structuredClone(inputs), corner: 'red' }, { inputs: structuredClone(inputs), corner: 'blue' }], { seed: 1 }).fighters;
    return { reach: reachOf(fighter), mass: fighter.body.mass, weapon: fighter.weapon?.spec?.mass, aerobic: fighter.body.aerobic };
  };
  const was = AI.press.on;
  AI.press.on = false;
  const off = shape();
  AI.press.on = true;
  const on = shape();
  AI.press.on = was;
  assert.deepEqual(on, off);
});
