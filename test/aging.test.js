import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, P, PRESETS } from '../src/body.js';
import { createWorld } from '../src/physics.js';
import { handling } from '../src/handling.js';
import { WEAPONS } from '../src/weapons.js';

/** A body of this age, sex and training at a set body fat (calories found to hold it). */
const bodyAt = (age, { sex = 'male', exercise = 0.5, bodyFat = sex === 'male' ? 0.16 : 0.24 } = {}) => {
  const inputs = { ...structuredClone(PRESETS.contender ?? PRESETS.heavy), sex, age, exercise, bodyFat };
  delete inputs.calories;
  return buildBody(inputs);
};
const strength = (body) => body.strikeForce[P.rHand];

test('strength over a lifetime: peak at 25-30, then the benchmarks, sedentary against trained', () => {
  for (const [exercise, at50, at70, at90] of [[0.1, [0.85, 0.9], [0.6, 0.7], [0.25, 0.4]], [0.9, [0.95, 1.0], [0.8, 0.86], [0.55, 0.7]]]) {
    const peak = strength(bodyAt(30, { exercise }));
    const share = (age) => strength(bodyAt(age, { exercise })) / peak;
    assert.ok(share(18) < 0.95 && share(25) > 0.98, `exercise ${exercise}: still growing at 18 (${share(18).toFixed(2)})`);
    for (const [age, [low, high]] of [[50, at50], [70, at70], [90, at90]]) {
      assert.ok(share(age) > low - 0.02 && share(age) < high + 0.02, `exercise ${exercise}, age ${age}: ${(share(age) * 100).toFixed(0)}% of peak`);
    }
  }
});

test('bone: a woman loses it fast at menopause, a man slowly; starving ages the body early; fat wears the joints', () => {
  const drop = (sex, from, to) => bodyAt(from, { sex }).tScore - bodyAt(to, { sex }).tScore;
  assert.ok(drop('female', 48, 58) > 2 * drop('male', 48, 58), `menopause: woman ${drop('female', 48, 58).toFixed(2)} SD, man ${drop('male', 48, 58).toFixed(2)}`);
  const fed = bodyAt(40, { bodyFat: 0.16 });
  const starved = bodyAt(40, { bodyFat: 0.04 });
  assert.ok(strength(starved) / starved.muscleKg < strength(fed) / fed.muscleKg, 'starved muscle is weaker per kilo');
  assert.ok(bodyAt(50, { bodyFat: 0.42 }).joints < bodyAt(50, { bodyFat: 0.18 }).joints, 'obesity wears the joints');
  assert.ok(bodyAt(85, { exercise: 0.1 }).stoop > bodyAt(40).stoop, 'the old back stoops');
});

test('old age slows the body: the hands and the step', () => {
  const young = bodyAt(28);
  const old = bodyAt(85, { exercise: 0.2 });
  assert.ok(old.topSpeed[P.rHand] < young.topSpeed[P.rHand] * 0.85, 'hands slower');
  assert.ok(old.joints < 0.7, `joints worn (${old.joints.toFixed(2)})`);
});

test('handling a weapon is strength: a frail body cannot wield the kanabo or draw a war bow; a strong one swings it faster', () => {
  const frail = bodyAt(90, { sex: 'female', exercise: 0.1 });
  assert.equal(handling(frail, WEAPONS.kanabo).canHold, false, 'the kanabo is too heavy for her');
  assert.equal(handling(frail, WEAPONS.bow).canHold, false, 'she cannot draw the bow half way');
  assert.ok(handling(frail, WEAPONS.knife).canHold, 'a knife she can hold');
  const strong = buildBody(PRESETS.kanabo);
  const weak = buildBody(PRESETS.revolver);
  assert.ok(handling(strong, WEAPONS.kanabo).speed > 1.1 && handling(weak, WEAPONS.kanabo).speed < 0.8, 'a heavy club: brisk in strong hands, slow in weak');
  assert.ok(Math.abs(handling(strong, WEAPONS.knife).speed - handling(weak, WEAPONS.knife).speed) < 0.1, 'a knife: much the same in any hand');
  // Given the kanabo to wield, she fights without it.
  const world = createWorld([{ inputs: { ...structuredClone(PRESETS.revolver), age: 90, exercise: 0.1, style: 'kanabo' }, corner: 'red' }, { inputs: structuredClone(PRESETS.light), corner: 'blue' }]);
  assert.ok(!world.fighters[0].weapon, 'no weapon in her hands');
  assert.equal(world.fighters[0].cannotWield, 'kanabo');
});

test('a bow too heavy for a man is drawn only part way: the arrow flies slower, and the draw takes longer', () => {
  const weaker = buildBody({ ...structuredClone(PRESETS.revolver), age: 70, exercise: 0.3 });
  const archer = buildBody(PRESETS.bow);
  const partial = handling(weaker, WEAPONS.compositeBow);
  const full = handling(archer, WEAPONS.bow);
  assert.ok(partial.draw < 1 && partial.draw >= 0.5, `she draws the steppe bow ${(partial.draw * 100).toFixed(0)}%`);
  assert.equal(full.draw, 1, 'the archer draws his own bow full');
  assert.ok(partial.drawTime > full.drawTime, 'and slower');
});
