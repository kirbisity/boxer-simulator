// The body-size progression the body-style comparison sheets draw (tools/bodysheet.html):
// the same height from starved to very obese, each found by choosing the
// exercise level that lands a target BMI at a target body fat, then stored as
// the inputs a player could set (sex, height, frame, age, exercise, calories).

import { buildBody } from '../src/body.js';

export const SHEET_HEIGHT_CM = { male: 180, female: 168 };
// A grown adult in his prime: age neither thins nor softens the build.
const SHEET_AGE = 28;
// The game's plain fight trunks (and, for a woman, its sports top), bare fists and feet: nothing else on the body.
const SHEET_OUTFIT = { kind: 'mma', design: 0 };

// [key, label, target BMI, target body fat, frame]. Women carry more essential fat, so theirs sit higher.
const TARGETS = {
  male: [
    ['starved', 'Starved', 14, 0.04, 'medium'],
    ['thin', 'Thin', 18, 0.1, 'medium'],
    ['average', 'Average, soft', 23, 0.17, 'medium'],
    ['athletic', 'Athletic, lean', 23, 0.11, 'medium'],
    ['bodybuilder', 'Bodybuilder', 29, 0.08, 'medium'],
    ['overweight', 'Overweight', 29, 0.27, 'medium'],
    ['obese', 'Obese', 38, 0.38, 'medium'],
    ['veryObese', 'Very obese', 48, 0.46, 'medium'],
  ],
  female: [
    ['starved', 'Starved', 14, 0.08, 'medium'],
    ['thin', 'Thin', 18, 0.2, 'medium'],
    ['average', 'Average', 22, 0.27, 'medium'],
    ['athletic', 'Athletic', 21.5, 0.18, 'medium'],
    ['overweight', 'Overweight', 28, 0.36, 'medium'],
    ['obese', 'Obese', 36, 0.44, 'medium'],
  ],
};

const bmiOf = (body) => body.massKg / body.heightM ** 2;

/** The exercise level (0..1) at which a body of this fat share reaches the target BMI. */
function exerciseFor(base, bmi, bodyFat) {
  let low = 0;
  let high = 1;
  for (let step = 0; step < 30; step += 1) {
    const mid = (low + high) / 2;
    if (bmiOf(buildBody({ ...base, exercise: mid, bodyFat })) < bmi) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** The progression for one sex: [{ key, label, inputs, bmi, bodyFat, muscleKg }], read back from the built body. */
export function progression(sex) {
  return TARGETS[sex].map(([key, label, bmi, bodyFat, frame]) => {
    const base = { sex, heightCm: SHEET_HEIGHT_CM[sex], frame, age: SHEET_AGE };
    const exercise = Math.round(exerciseFor(base, bmi, bodyFat) * 100) / 100;
    const solved = buildBody({ ...base, exercise, bodyFat });
    const inputs = { ...base, exercise, calories: solved.inputs.calories, outfit: SHEET_OUTFIT };
    const body = buildBody(inputs);
    return { key, label, inputs, bmi: bmiOf(body), bodyFat: body.inputs.bodyFat, muscleKg: body.muscleKg };
  });
}
