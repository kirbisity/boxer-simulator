import test from 'node:test';
import assert from 'node:assert/strict';
import { thinkAll } from '../src/ai.js';
import { PRESETS } from '../src/body.js';
import { advance, boutWinner, createWorld, pinnedBy } from '../src/physics.js';
import { holdTrial } from '../tools/pins.js';

test('the last man down is held down, and held long enough, he is beaten without a blow', () => {
  const trial = holdTrial('heavy', 'light', 6);
  assert.ok(trial.holds > 0, 'he was held');
  assert.ok(trial.pinned > 0, 'and some holds lasted');
  assert.equal(trial.blowsWhileHeld, 0, 'nobody hits a held man');
});

test('a hold is a contest of weight and strength: a light man cannot keep a heavy one down', () => {
  const lightOnHeavy = holdTrial('light', 'heavy', 6);
  const heavyOnLight = holdTrial('heavy', 'light', 6);
  assert.ok(lightOnHeavy.escaped > heavyOnLight.escaped, `${lightOnHeavy.escaped} vs ${heavyOnLight.escaped} escapes`);
  assert.ok(lightOnHeavy.pinned <= heavyOnLight.pinned);
});

test('in a team fight only the last man of a side is held down, by at most two', () => {
  const world = createWorld([
    { inputs: { ...PRESETS.heavy, style: 'boxing' }, corner: 'red' }, { inputs: { ...PRESETS.contender, style: 'boxing' }, corner: 'red' }, { inputs: { ...PRESETS.veteran, style: 'boxing' }, corner: 'red' },
    { inputs: { ...PRESETS.light, style: 'boxing' }, corner: 'blue' }, { inputs: { ...PRESETS.amateur, style: 'boxing' }, corner: 'blue' },
  ], { seed: 4 });
  let most = 0;
  let heldWhileMates = false;
  for (let second = 0; second < 90 && !boutWinner(world); second += 0.25) {
    advance(world, 0.25, (current, dt) => thinkAll(current, dt));
    for (const fighter of world.fighters) {
      const holders = pinnedBy(world, fighter).length;
      most = Math.max(most, holders);
      const mates = world.fighters.filter((other) => other.corner === fighter.corner && other.state !== 'out').length;
      if (holders && mates > 1) heldWhileMates = true;
    }
  }
  assert.ok(most <= 2, `${most} holding one man`);
  assert.ok(!heldWhileMates, 'a man with team-mates still standing is not held down');
});

test('sumo pushes men off their feet: a heavy sumo drives a lighter man over, open hands harm little', () => {
  let falls = 0;
  let palmHarm = 0;
  let palms = 0;
  for (let seed = 950; seed < 954; seed += 1) {
    const world = createWorld([{ ...PRESETS.heavy, style: 'sumo' }, { ...PRESETS.light, style: 'kickboxing' }], { seed });
    for (let second = 0; second < 90 && !boutWinner(world); second += 0.5) advance(world, 0.5, (current, dt) => thinkAll(current, dt));
    falls += world.events.filter((event) => event.kind === 'fell' && event.fighter === 1).length;
    for (const event of world.events.filter((entry) => entry.kind === 'landed' && /tsuppari|oshi/.test(entry.punch ?? ''))) {
      palms += 1;
      palmHarm += event.harm;
    }
  }
  assert.ok(falls >= 3, `${falls} times off his feet`);
  assert.ok(palms > 0 && palmHarm / palms < 0.5, 'open hands push more than they hurt');
});

test('a mixed fighter switches between the unarmed styles, never to a weapon', () => {
  // Bouts end fast now: pool a few.
  const seen = new Set();
  for (let seed = 3; seed < 7; seed += 1) {
    const world = createWorld([{ ...PRESETS.contender, style: 'mix' }, { ...PRESETS.heavy, style: 'mix' }], { seed });
    for (let second = 0; second < 60 && !boutWinner(world); second += 0.5) {
      advance(world, 0.5, (current, dt) => thinkAll(current, dt));
      for (const fighter of world.fighters) if (fighter.state === 'up') seen.add(fighter.style);
    }
    assert.ok(world.fighters.every((fighter) => !fighter.weapon));
  }
  assert.ok(seen.size >= 3, `styles seen: ${[...seen]}`);
  for (const style of seen) assert.ok(['boxing', 'kickboxing', 'muayThai', 'sumo'].includes(style), style);
});
