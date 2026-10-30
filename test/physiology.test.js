import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, FRAMES } from '../src/body.js';
import { calorieRange, PHYSIOLOGY, settleComposition } from '../src/physiology.js';
import { compareProfiles } from '../tools/physiology.js';

// How far outside a measured range a derived stat may land, as a share of the
// bound it misses (T-scores, which straddle zero, in standard deviations).
const TOLERANCE = 0.12;
const T_SCORE_TOLERANCE = 0.5;
// At 175 cm the BMI floor of 10 holds the anorexic profile at 30.6 kg, not
// the reference 28 kg (BMI 9.1), so its limbs keep a little more girth.
const FLOOR_ARM_TOLERANCE = 0.3;

const BASE = { sex: 'male', heightCm: 180, frame: 'medium', age: 28 };

test('every reference profile settles at its weight and fat, and its stats land on the measured ranges', () => {
  for (const { profile, stats } of compareProfiles()) {
    const floorWeight = PHYSIOLOGY.bmi.min * 1.75 ** 2;
    assert.ok(Math.abs(stats.weight - Math.max(profile.weight, floorWeight)) < 3, `${profile.key} weighs ${stats.weight.toFixed(1)} kg`);
    for (const key of ['rmr', 'arm', 'tScore', 'squat', 'bench', 'grip', 'sprint', 'impact']) {
      const [low, high] = profile[key];
      const value = stats[key];
      if (!Number.isFinite(low) && !Number.isFinite(high)) {
        assert.equal(value, low, `${profile.key} ${key}`);
        continue;
      }
      const share = key === 'arm' && profile.key === 'anorexia' ? FLOOR_ARM_TOLERANCE : TOLERANCE;
      const slack = (bound) => (key === 'tScore' ? T_SCORE_TOLERANCE : Math.abs(bound) * share);
      assert.ok(value >= low - slack(low) && value <= high + slack(high), `${profile.key} ${key} ${value.toFixed(2)}, measured ${low}–${high}`);
    }
  }
});

test('fat is an outcome: more calories, more fat; more exercise, more lean at the same intake', () => {
  const frame = FRAMES.medium.lean;
  const at = (exercise, calories) => settleComposition({ ...BASE, exercise, calories }, frame);
  let previous = null;
  for (const calories of [1500, 2200, 3000, 4000, 6000]) {
    const body = at(0.4, calories);
    if (previous) assert.ok(body.fat > previous.fat && body.weight > previous.weight, `${calories} kcal`);
    previous = body;
  }
  // Fed to match the work, training builds lean; on the same plate it burns fat.
  assert.ok(at(0.8, 5000).lean > at(0, 2600).lean, 'training builds lean');
  assert.ok(at(0.8, 3200).bodyFat < at(0, 3200).bodyFat, 'and burns fat at the same intake');
});

test('the calorie slider spans BMI 10 to 100, and nothing settles outside it', () => {
  for (const sex of ['male', 'female']) {
    const inputs = { ...BASE, sex, exercise: 0.3 };
    const [low, high] = calorieRange(inputs, FRAMES.medium.lean);
    const bmi = (calories) => buildBody({ ...inputs, calories }).composition.bmi;
    assert.ok(Math.abs(bmi(low) - PHYSIOLOGY.bmi.min) < 0.3, `${sex} lowest BMI ${bmi(low).toFixed(1)}`);
    assert.ok(Math.abs(bmi(high) - PHYSIOLOGY.bmi.max) < 2, `${sex} highest BMI ${bmi(high).toFixed(1)}`);
    assert.ok(bmi(low * 0.5) >= PHYSIOLOGY.bmi.min - 0.01 && bmi(high * 2) <= PHYSIOLOGY.bmi.max + 0.01, 'clamped beyond the ends');
  }
});

test('the extremes still build a body the physics can run', () => {
  for (const sex of ['male', 'female']) {
    const inputs = { ...BASE, sex, exercise: 0.3 };
    for (const calories of calorieRange(inputs, FRAMES.medium.lean)) {
      const body = buildBody({ ...inputs, calories });
      assert.ok(body.masses.every((mass) => Number.isFinite(mass) && mass > 0), `${sex} at ${calories} kcal`);
      assert.ok(body.muscleKg > 0 && body.fatKg > 0);
    }
  }
});
