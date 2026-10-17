import test from 'node:test';
import assert from 'node:assert/strict';
import { auditTargets, UI_CHECK } from '../src/uicheck.js';
import { forgetTutorial, markTutorialDone, TUTORIAL, tutorialDone, tutorialWanted } from '../src/tutorial.js';

const viewport = { width: 400, height: 800 };
const target = (rect, extra = {}) => ({ name: 'b', rect, hit: true, ...extra });

test('button check: a finger-sized, uncovered button inside the window passes', () => {
  const [result] = auditTargets([target({ left: 10, top: 10, width: 120, height: UI_CHECK.minSize })], viewport);
  assert.deepEqual(result.problems, []);
});

test('button check: too small, outside the window, and covered are each reported', () => {
  const [small, outside, covered] = auditTargets([
    target({ left: 10, top: 10, width: 120, height: 30 }),
    target({ left: 380, top: 10, width: 60, height: 60 }),
    target({ left: 10, top: 700, width: 80, height: 60 }, { hit: false, cover: 'div.touch-surface' }),
  ], viewport);
  assert.match(small.problems.join(), /small 120×30/);
  assert.deepEqual(outside.problems, ['outside the window']);
  assert.deepEqual(covered.problems, ['covered by div.touch-surface']);
});

test('button check: a named exception may be small, but not covered', () => {
  const [result] = auditTargets([target({ left: 0, top: 0, width: 20, height: 20 }, { small: true, hit: false })], viewport);
  assert.deepEqual(result.problems, ['covered']);
});

/** A localStorage stand-in; `broken` throws on every call, as a blocked one does. */
const storage = (broken = false) => {
  const kept = new Map();
  const guard = () => {
    if (broken) throw new Error('blocked');
  };
  return {
    getItem: (key) => (guard(), kept.get(key) ?? null),
    setItem: (key, value) => (guard(), kept.set(key, String(value))),
  };
};

test('tutorial: wanted on a first visit, not once been through, nor for an automated browser', () => {
  forgetTutorial();
  const kept = storage();
  assert.equal(tutorialWanted(kept, {}), true);
  assert.equal(tutorialWanted(kept, { webdriver: true }), false);
  markTutorialDone(kept);
  assert.equal(kept.getItem(TUTORIAL.storageKey), '1');
  assert.equal(tutorialDone(kept), true);
  // A new page load with the same storage: still remembered.
  forgetTutorial();
  assert.equal(tutorialWanted(kept, {}), false);
});

test('tutorial: blocked storage is remembered for the page only, and never throws', () => {
  forgetTutorial();
  const blocked = storage(true);
  assert.equal(tutorialWanted(blocked, {}), true);
  markTutorialDone(blocked);
  assert.equal(tutorialDone(blocked), true);
  forgetTutorial();
  assert.equal(tutorialDone(blocked), false);
  assert.equal(tutorialDone(undefined), false);
});
