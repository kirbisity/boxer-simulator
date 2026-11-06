import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, normaliseInputs } from '../src/body.js';
import { AI, thinkAll } from '../src/ai.js';
import { advance, createWorld, cutOff, placeFighter } from '../src/physics.js';

/** A man of `preset` beside a comrade whose arm is cut off by a foe: how long (s) he flinches. */
function flinchOf(preset, extra = {}) {
  const man = (key, corner) => ({ inputs: normaliseInputs({ ...structuredClone(PRESETS[key]), ...extra }), corner });
  const world = createWorld([man(preset, 'red'), man(preset, 'red'), man('knight', 'blue')], { seed: 2, arena: { halfX: 20, halfZ: 20 } });
  const [watcher, victim, foe] = world.fighters;
  placeFighter(watcher, 0, 1.2);
  placeFighter(victim, 0, 0);
  placeFighter(foe, 1.6, 0);
  advance(world, 0.2);
  cutOff(world, victim, { joint: 'shoulder', side: 'r' }, foe);
  advance(world, 0.05, (current, dt) => thinkAll(current, dt));
  return Math.max(0, (watcher.recoilUntil ?? 0) - world.time);
}

test('a comrade cut down beside him: the levy flinches longest, the trained less, the relentless not at all', () => {
  const levy = flinchOf('spear');
  const elite = flinchOf('samurai');
  assert.ok(levy > 1, `the levy (Hob Miller): ${levy.toFixed(2)} s`);
  assert.ok(levy <= AI.recoil.seconds, 'no longer than the most');
  assert.ok(elite < levy, `the samurai less: ${elite.toFixed(2)} s against ${levy.toFixed(2)}`);
  assert.equal(flinchOf('spear', { relentless: true }), 0, 'a relentless man does not flinch');
});

test('flinching, he steps back with his guard up and throws nothing, then fights on', () => {
  const world = createWorld([{ inputs: normaliseInputs(structuredClone(PRESETS.spear)), corner: 'red' }, { inputs: normaliseInputs(structuredClone(PRESETS.knight)), corner: 'blue' }], { seed: 3, arena: { halfX: 20, halfZ: 20 } });
  const [man, foe] = world.fighters;
  placeFighter(man, 0, 0);
  placeFighter(foe, 2, 0);
  advance(world, 0.2);
  man.recoilUntil = world.time + 1;
  advance(world, 0.5, (current, dt) => thinkAll(current, dt));
  assert.equal(man.punch, null, 'no blow while he flinches');
  assert.ok(man.move < 0, 'giving ground');
  advance(world, 1, (current, dt) => thinkAll(current, dt));
  assert.ok(world.time > man.recoilUntil, 'the spell is over');
});
