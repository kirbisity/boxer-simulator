// Ageing, 18 to 100: what the years do to muscle, strength, fast fibres,
// bone and joints, by sex, training, and how a body is fed.
//
// Muscle and bone peak around 25–30. From the mid-30s muscle is lost
// (sarcopenia) and strength faster still (dynapenia), some 0.5–1% a year,
// gathering pace after 50 as the anabolic hormones fall; after 70 the fast
// (type II) fibres waste most. Trained, much of it is kept. Bone resorption
// outpaces formation from the mid-30s; at menopause (about 50) a woman loses
// bone fast (2–3% a year for some years). Joints wear: cartilage thins,
// faster with obesity (load without the muscle to steady it) and
// malnourishment (no protein to repair it). Malnourishment ages the whole
// system early; obesity hides lost muscle under fat (sarcopenic obesity).
//
// Strength, relative to peak (the benchmarks the curves pass through):
//   age 30: 100%; 50: sedentary ~87%, trained ~97%; 70: ~65% / ~83%;
//   90: ~32% (sedentary) / ~62% (lifelong exerciser).

/** Points [age, sedentary, trained] for a share of peak, interpolated in age and by training. */
export const AGEING = {
  strength: [[18, 0.88, 0.9], [25, 1, 1], [30, 1, 1], [40, 0.95, 0.99], [50, 0.875, 0.975], [60, 0.77, 0.91], [70, 0.68, 0.86], [80, 0.5, 0.76], [90, 0.33, 0.66], [100, 0.2, 0.52]],
  // Muscle mass falls more slowly than strength (strength is mass and its quality).
  muscle: [[18, 0.92, 0.94], [25, 1, 1], [35, 1, 1], [50, 0.93, 0.98], [70, 0.82, 0.91], [90, 0.68, 0.8], [100, 0.6, 0.74]],
  // Fast-twitch fibres: the speed of a limb.
  fast: [[18, 1, 1], [30, 1, 1], [50, 0.95, 0.98], [70, 0.82, 0.9], [90, 0.6, 0.74], [100, 0.5, 0.66]],
  // Joints: cartilage, synovial fluid; 1 is a young joint.
  joints: [[18, 1, 1], [30, 1, 1], [50, 0.88, 0.92], [70, 0.7, 0.8], [90, 0.5, 0.62], [100, 0.4, 0.54]],
  // Aerobic capacity (VO2max), about 10% a decade from 30, less if trained.
  aerobic: [[18, 1, 1], [30, 1, 1], [50, 0.82, 0.9], [70, 0.64, 0.78], [90, 0.45, 0.62], [100, 0.38, 0.55]],
  // Bone loss (T-score points, SD) by age: men slow and steady; women steady, then fast at menopause.
  bone: {
    male: [[18, 0, 0], [35, 0, 0], [50, -0.35, -0.2], [70, -1.0, -0.65], [90, -1.9, -1.3], [100, -2.3, -1.6]],
    female: [[18, 0, 0], [35, 0, 0], [48, -0.3, -0.2], [57, -1.4, -1.0], [70, -2.0, -1.5], [90, -3.0, -2.3], [100, -3.4, -2.6]],
  },
  // Malnourishment ages the body early: years added at full starvation, and what is lost on top.
  starvedYears: 25,
  starvedStrength: 0.25,
  // Obesity: past `fatFrom` body fat, muscle quality falls (×`fatQuality` per unit of fat over, from 40 on),
  // and the joints wear as if this many years older per unit of fat over.
  fatFrom: 0.3,
  fatQuality: 0.8,
  fatJointYears: 120,
  // Old age stoops the back (a forward lean, rad, by 100 when sedentary), less if trained.
  stoop: { from: 60, at100: 0.35 },
};

/** A curve's value at `age` for training level `exercise` (0 sedentary, 1 trained). */
function ageCurve(points, age, exercise) {
  const t = Math.max(0, Math.min(1, exercise));
  const at = Math.max(points[0][0], Math.min(points[points.length - 1][0], age));
  for (let index = 1; index < points.length; index += 1) {
    const [a0, s0, e0] = points[index - 1];
    const [a1, s1, e1] = points[index];
    if (at <= a1) {
      const u = (at - a0) / (a1 - a0 || 1);
      const sedentary = s0 + (s1 - s0) * u;
      const trained = e0 + (e1 - e0) * u;
      return sedentary + (trained - sedentary) * t;
    }
  }
  const last = points[points.length - 1];
  return last[1] + (last[2] - last[1]) * t;
}

/**
 * What age (with sex, training and feeding) leaves of a young adult's body.
 * `starving` 0..1 (from body fat below the healthy floor), `bodyFat` 0..1.
 * Returns shares of peak (muscle mass, strength, fast fibres, joints,
 * aerobic capacity), the bone T-score change, and the stoop (rad).
 */
export function ageing(inputs, { bodyFat = 0.15, starving = 0 } = {}) {
  const exercise = inputs.exercise ?? 0.5;
  // Starved, the body is older than its years.
  const age = (inputs.age ?? 27) + AGEING.starvedYears * starving;
  const overFat = Math.max(0, bodyFat - AGEING.fatFrom);
  const midlife = Math.max(0, Math.min(1, (age - 40) / 30));
  const muscle = curve(AGEING.muscle, age, exercise);
  const strength = curve(AGEING.strength, age, exercise) * (1 - AGEING.starvedStrength * starving) * (1 - AGEING.fatQuality * overFat * midlife);
  const jointAge = age + AGEING.fatJointYears * overFat;
  const stoop = AGEING.stoop.at100 * Math.max(0, (age - AGEING.stoop.from) / (100 - AGEING.stoop.from)) * (1 - 0.6 * exercise);
  return {
    muscle,
    strength,
    fast: curve(AGEING.fast, age, exercise),
    joints: curve(AGEING.joints, jointAge, exercise),
    aerobic: curve(AGEING.aerobic, age, exercise),
    bone: curve(AGEING.bone[inputs.sex === 'female' ? 'female' : 'male'], age, exercise),
    stoop,
  };
}
