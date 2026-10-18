import test from 'node:test';
import assert from 'node:assert/strict';
import { ADAPTIVE_RESOLUTION as CONFIG, newAdaptiveState, ratioSteps, stepAdaptive } from '../src/adaptres.js';

const run = (state, seconds, ms, { fighters = 100, work = 8 } = {}) => {
  let level = state.level;
  for (let time = 0; time < seconds; time += ms / 1000) level = stepAdaptive(state, { ms, fighters, levels: 3, work });
  return level;
};

test('the steps are descending, never under the floor, and a low full ratio has fewer', () => {
  assert.deepEqual(ratioSteps(2), [2, 1.5, 1.25]);
  assert.deepEqual(ratioSteps(1.5), [1.5, 1.125, 1]);
  assert.deepEqual(ratioSteps(1), [1]);
  for (const full of [3, 2, 1.75, 1.25, 1]) {
    const ratios = ratioSteps(full);
    assert.ok(ratios.every((ratio) => ratio >= CONFIG.floor && ratio <= full), `${full}: ${ratios}`);
    assert.deepEqual(ratios, [...ratios].sort((a, b) => b - a));
  }
});

test('a fight of eight or fewer is never adapted, and a battle that shrinks to it is put back at once', () => {
  const state = newAdaptiveState();
  assert.equal(run(state, 30, 40, { fighters: CONFIG.fewestFighters - 1 }), 0, 'slow, but a duel');
  assert.equal(run(state, 20, 40), 2, 'slow in a battle: down to the last step');
  assert.equal(stepAdaptive(state, { ms: 40, fighters: 8, levels: 3, work: 8 }), 0, 'eight men left');
  assert.equal(state.level, 0);
});

test('slow frames step down one at a time, with time between, and stop at the last step', () => {
  const state = newAdaptiveState();
  const levels = [];
  for (let frame = 0; frame < 60 * 12; frame += 1) {
    levels.push(stepAdaptive(state, { ms: 30, fighters: 100, levels: 3, work: 8 }));
  }
  assert.equal(levels[0], 0);
  assert.equal(levels.at(-1), 2, 'the last step, not past it');
  assert.ok(levels.indexOf(1) > 30, 'a second or so of slowness first, not the first slow frame');
  assert.ok(levels.indexOf(2) - levels.indexOf(1) > 30, 'one step at a time');
});

test('a hitch is not slowness', () => {
  const state = newAdaptiveState();
  for (let frame = 0; frame < 600; frame += 1) {
    const ms = frame % 60 === 30 ? 120 : 16.7;
    stepAdaptive(state, { ms, fighters: 100, levels: 3, work: 8 });
  }
  assert.equal(state.level, 0, 'one 120 ms frame a second, the rest on time');
});

test('a stall (the tab in the background) is ignored altogether', () => {
  const state = newAdaptiveState();
  for (let frame = 0; frame < 200; frame += 1) stepAdaptive(state, { ms: 3000, fighters: 100, levels: 3, work: 8 });
  assert.equal(state.level, 0);
});

test('slow because the processor is busy is not a reason to spoil the picture', () => {
  const state = newAdaptiveState();
  assert.equal(run(state, 20, 33, { work: 30 }), 0, 'the page worked for 30 of the 33 ms');
  assert.equal(run(state, 20, 33, { work: 12 }), 2, 'it waited for the graphics card for 21 of them');
});

test('the frames coming easily again step back up, only after a long wait', () => {
  const state = newAdaptiveState();
  run(state, 10, 40);
  assert.equal(state.level, 2);
  assert.equal(run(state, CONFIG.fastSeconds - 1, 16.6, { work: 6 }), 2, 'not yet');
  assert.equal(run(state, 4, 16.6, { work: 6 }), 1, 'one step up');
  assert.equal(run(state, CONFIG.fastSeconds + 2, 16.6, { work: 6 }), 0, 'and the next');
});

test('a step up that failed makes the next try wait longer', () => {
  const state = newAdaptiveState();
  run(state, 10, 40);
  run(state, CONFIG.fastSeconds + 1, 16.6, { work: 6 });
  assert.equal(state.level, 1, 'tried one step up');
  run(state, 4, 40);
  assert.equal(state.level, 2, 'too slow again: back down');
  assert.equal(state.fastNeeded, CONFIG.fastSeconds * CONFIG.retryFactor, 'wait twice as long next time');
  for (let again = 0; again < 8; again += 1) {
    run(state, state.fastNeeded + 1, 16.6, { work: 6 });
    run(state, 4, 40);
  }
  assert.equal(state.fastNeeded, CONFIG.fastSecondsMost, 'never more than the most');
});

test('the dead band between fast and slow holds the step', () => {
  const state = newAdaptiveState();
  run(state, 10, 40);
  assert.equal(run(state, 60, 19, { work: 6 }), 2, '19 ms is neither slow nor easy');
});
