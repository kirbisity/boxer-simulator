// Physiology: what a person's eating and training make of them. Body fat is
// not chosen; it is what daily calories and exercise settle into.
//
// The composition is simulated week by week from a healthy baseline: energy
// in (calories) against energy out (resting metabolism, everyday activity,
// exercise), with each kilogram stored or lost split between lean and fat
// along the Forbes curve, until it settles. Exercise sets where the curve
// sits (how much lean a body carries at a given fat). From the settled body
// come the stats players see — metabolism, arm size, bone density, strength,
// sprint, impact tolerance — each a curve calibrated against measured
// profiles (REFERENCE_PROFILES), which the tests hold it to.

export const PHYSIOLOGY = {
  // Resting metabolism (kcal/day) = lean·a + fat·b + c, fitted to the
  // reference profiles; it also lands on the starving profile's ~700.
  rmrPerLeanKg: 30.26,
  rmrPerFatKg: 0.26,
  rmrBase: -114,
  // Digestion on top of resting metabolism, and everyday moving about,
  // which costs by the kilogram carried: ~1.35× RMR at a normal weight,
  // and what keeps a 300 kg body's upkeep above 4,500 kcal.
  dailyActivityFactor: 1.2,
  everydayKcalPerKg: 3.5,
  // Exercise: hours a week at each exercise level (0 sedentary … 1 elite),
  // and its cost, ~8 kcal per kg of body weight per hour (mixed training).
  hoursAtFull: 25,
  hoursCurve: 1.3,
  exerciseKcalPerKgHour: 8,
  // Stored energy per kilogram (Hall 2008).
  leanKcalPerKg: 1800,
  fatKcalPerKg: 9400,
  // The Forbes curve: lean = baseline lean + C·ln(fat / baseline fat).
  forbesC: 10.4,
  // Baseline fat (kg at 1.75 m) where the baseline lean is measured.
  baselineFatKg: { male: 14.4, female: 13.2 },
  // Fat-free mass index (kg/m²) at baseline fat, by exercise level: 19.6
  // sedentary, ~21.4 recreationally active, ~25 a full-time fighter, 30.7
  // at the top (an elite bodybuilder's 87 kg lean at 8%).
  ffmi: { male: [19.6, 5.8, 5.3], female: [14.1, 4.2, 3.8] },
  // Floors: what is left at the end of starvation (skeleton, organs, the
  // last muscle), as a share of sedentary baseline lean; and essential fat.
  minimumLeanShare: 0.36,
  essentialFatKg: { male: 0.6, female: 2 },
  bmi: { min: 10, max: 100 },
  weeksSimulated: 780, // fifteen years: enough for any diet to settle
  // Bone density as a T-score: loading from exercise and from carried mass
  // raises it; starvation (fat below the essential-plus margin) strips it.
  bone: { exercise: 3, weight: 1.4, starvation: 2.1, female: -0.25, referenceBmi: { male: 26.1, female: 19.6 }, lowFat: { male: 0.08, female: 0.17 } },
};

/** Exercise hours a week for an exercise level. */
export function exerciseHours(level) {
  return PHYSIOLOGY.hoursAtFull * Math.max(0, level) ** PHYSIOLOGY.hoursCurve;
}

/** Baseline lean mass (kg) at baseline fat, for this height, sex, frame and exercise. */
export function baselineLean(inputs, frameLean = 1) {
  const [base, linear, steep] = PHYSIOLOGY.ffmi[inputs.sex] ?? PHYSIOLOGY.ffmi.male;
  const level = Math.max(0, Math.min(1, inputs.exercise));
  const height = inputs.heightCm / 100;
  const ageing = Math.max(0, inputs.age - 30) * 0.003;
  return (base + linear * level + steep * level ** 5) * height * height * frameLean * (1 - ageing);
}

function scaledBaselineFat(inputs) {
  const height = inputs.heightCm / 100;
  return PHYSIOLOGY.baselineFatKg[inputs.sex] * (height / 1.75) ** 2;
}

/** Lean mass that goes with a given fat mass on this body's Forbes curve. */
function leanForFat(inputs, fat, frameLean) {
  const baseline = baselineLean(inputs, frameLean);
  const sedentary = baselineLean({ ...inputs, exercise: 0 }, frameLean);
  const lean = baseline + PHYSIOLOGY.forbesC * (inputs.heightCm / 175) ** 2 * Math.log(fat / scaledBaselineFat(inputs));
  return Math.max(sedentary * PHYSIOLOGY.minimumLeanShare, lean);
}

/** Split stored energy (kcal above zero) into lean and fat along the curve. */
function compositionForEnergy(inputs, energy, frameLean) {
  const minFat = PHYSIOLOGY.essentialFatKg[inputs.sex];
  const stored = (fat) => PHYSIOLOGY.leanKcalPerKg * leanForFat(inputs, fat, frameLean) + PHYSIOLOGY.fatKcalPerKg * fat;
  let low = minFat;
  let high = 400;
  // With the fat spent, starvation burns protein: lean goes on falling
  // until the BMI floor stops it.
  if (energy <= stored(low)) return { lean: Math.max(1, (energy - PHYSIOLOGY.fatKcalPerKg * low) / PHYSIOLOGY.leanKcalPerKg), fat: low };
  for (let step = 0; step < 60; step += 1) {
    const middle = (low + high) / 2;
    if (stored(middle) < energy) low = middle;
    else high = middle;
  }
  return { lean: leanForFat(inputs, low, frameLean), fat: low };
}

/** Resting metabolic rate, kcal/day. */
export function restingMetabolism(lean, fat) {
  return Math.max(400, PHYSIOLOGY.rmrPerLeanKg * lean + PHYSIOLOGY.rmrPerFatKg * fat + PHYSIOLOGY.rmrBase);
}

/** Total daily energy expenditure, kcal/day. */
export function dailyExpenditure(inputs, lean, fat) {
  const weight = lean + fat;
  const exercise = (exerciseHours(inputs.exercise) * PHYSIOLOGY.exerciseKcalPerKgHour * weight) / 7;
  return restingMetabolism(lean, fat) * PHYSIOLOGY.dailyActivityFactor + PHYSIOLOGY.everydayKcalPerKg * weight + exercise;
}

/**
 * Simulate the body that daily `calories` and `exercise` settle into.
 * @returns {{ lean, fat, weight, bodyFat, bmi, rmr, tdee, weeks, capped }}
 */
export function settleComposition(inputs, frameLean = 1) {
  const height = inputs.heightCm / 100;
  const bounds = [PHYSIOLOGY.bmi.min * height * height, PHYSIOLOGY.bmi.max * height * height];
  let { lean, fat } = { lean: baselineLean(inputs, frameLean), fat: scaledBaselineFat(inputs) };
  let energy = PHYSIOLOGY.leanKcalPerKg * lean + PHYSIOLOGY.fatKcalPerKg * fat;
  let weeks = 0;
  let capped = null;
  for (let week = 0; week < PHYSIOLOGY.weeksSimulated; week += 1) {
    const balance = inputs.calories - dailyExpenditure(inputs, lean, fat);
    energy = Math.max(0, energy + balance * 7);
    ({ lean, fat } = compositionForEnergy(inputs, energy, frameLean));
    // Weight is held to BMI 10–100: beyond that is not a body to fight in.
    const weight = lean + fat;
    if (weight < bounds[0] || weight > bounds[1]) {
      const target = Math.min(bounds[1], Math.max(bounds[0], weight));
      capped = weight < bounds[0] ? 'min' : 'max';
      ({ lean, fat } = scaleToWeight(inputs, target, frameLean));
      energy = PHYSIOLOGY.leanKcalPerKg * lean + PHYSIOLOGY.fatKcalPerKg * fat;
    }
    if (Math.abs(balance) > 15) weeks = week + 1;
  }
  const weight = lean + fat;
  return { lean, fat, weight, bodyFat: fat / weight, bmi: weight / (height * height), rmr: restingMetabolism(lean, fat), tdee: dailyExpenditure(inputs, lean, fat), weeks, capped };
}

function scaleToWeight(inputs, weight, frameLean) {
  let low = PHYSIOLOGY.essentialFatKg[inputs.sex];
  if (leanForFat(inputs, low, frameLean) + low >= weight) return { lean: weight - low, fat: low };
  let high = 400;
  for (let step = 0; step < 60; step += 1) {
    const middle = (low + high) / 2;
    if (leanForFat(inputs, middle, frameLean) + middle < weight) low = middle;
    else high = middle;
  }
  return { lean: leanForFat(inputs, low, frameLean), fat: low };
}

/** The daily calories at which this body settles at a given weight: for slider bounds and presets. */
export function caloriesForWeight(inputs, weight, frameLean = 1) {
  const { lean, fat } = scaleToWeight(inputs, weight, frameLean);
  return dailyExpenditure(inputs, lean, fat);
}

/** Calories that settle at a given body-fat share. */
export function caloriesForBodyFat(inputs, bodyFat, frameLean = 1) {
  let low = 0.5;
  let high = 400;
  for (let step = 0; step < 60; step += 1) {
    const fat = (low + high) / 2;
    if (fat / (leanForFat(inputs, fat, frameLean) + fat) < bodyFat) low = fat;
    else high = fat;
  }
  return dailyExpenditure(inputs, leanForFat(inputs, low, frameLean), low);
}

/** The calorie range that spans BMI 10 to 100 for this body. */
export function calorieRange(inputs, frameLean = 1) {
  const height = inputs.heightCm / 100;
  return [caloriesForWeight(inputs, PHYSIOLOGY.bmi.min * height * height, frameLean), caloriesForWeight(inputs, PHYSIOLOGY.bmi.max * height * height, frameLean)];
}

/** Bone mineral density as a T-score (0 = young adult mean). */
export function boneTScore(inputs, weight, bodyFat) {
  const bone = PHYSIOLOGY.bone;
  const height = inputs.heightCm / 100;
  const referenceWeight = bone.referenceBmi[inputs.sex] * height * height;
  const starvation = bone.starvation * Math.max(0, (bone.lowFat[inputs.sex] - bodyFat) / 0.06);
  const ageing = Math.max(0, inputs.age - 35) * (inputs.sex === 'female' ? 0.03 : 0.015);
  return (inputs.sex === 'female' ? bone.female : 0) + bone.exercise * (inputs.exercise - 0.3) + bone.weight * Math.log(weight / referenceWeight) - starvation - ageing;
}

// ---- Measured references, standardised to 175 cm ----------------------------

/**
 * Six profiles across the human range, with their measured ranges. The
 * tests settle a body for each (inputs found from its weight and body fat)
 * and hold the derived stats to these ranges.
 */
export const REFERENCE_PROFILES = [
  { key: 'bodybuilder', label: 'Elite bodybuilder', sex: 'male', frame: 'medium', weight: 95, bodyFat: 0.08, rmr: [2400, 2700], arm: [43, 47], tScore: [1.5, 2.5], squat: [220, 260], bench: [160, 190], grip: [65, 75], sprint: [4.2, 4.5], impact: [450, 550] },
  { key: 'boxer', label: 'Professional boxer', sex: 'male', frame: 'medium', weight: 75, bodyFat: 0.1, rmr: [1850, 2100], arm: [34, 38], tScore: [1, 2], squat: [140, 170], bench: [100, 120], grip: [52, 62], sprint: [3.9, 4.1], impact: [400, 500] },
  { key: 'sumo', label: 'Sumo / open heavyweight', sex: 'male', frame: 'large', weight: 160, bodyFat: 0.28, rmr: [3200, 3600], arm: [50, 60], tScore: [2, 3], squat: [280, 350], bench: [180, 220], grip: [70, 85], sprint: [5, 5.5], impact: [700, 900] },
  { key: 'male', label: 'Healthy male', sex: 'male', frame: 'medium', weight: 80, bodyFat: 0.18, rmr: [1650, 1800], arm: [30, 34], tScore: [-0.5, 0.5], squat: [100, 120], bench: [75, 90], grip: [45, 52], sprint: [4.5, 4.8], impact: [250, 350] },
  { key: 'female', label: 'Healthy female', sex: 'female', frame: 'medium', weight: 60, bodyFat: 0.22, rmr: [1300, 1450], arm: [24, 28], tScore: [-0.5, 0], squat: [60, 80], bench: [40, 55], grip: [28, 35], sprint: [4.9, 5.4], impact: [180, 250] },
  // Unable to squat body weight (squat below 0) or lift an empty 20 kg bar.
  { key: 'anorexia', label: 'Extreme anorexia', sex: 'male', frame: 'small', weight: 28, bodyFat: 0.02, rmr: [600, 800], arm: [8, 13], tScore: [-4.5, -3], squat: [-Infinity, 0], bench: [-Infinity, 20], grip: [1, 3], sprint: [Infinity, Infinity], impact: [0, 30] },
];

// ---- Derived stats ------------------------------------------------------------

export const STATS = {
  // Strength: stat + what the lift carries = k · muscle^exponent ·
  // (base + exercise) · sex factor (upper-body lifts), times starvation's
  // weakness. Muscle is whole-body skeletal muscle (what grip and lifts
  // track best); constants fitted to REFERENCE_PROFILES (tools/physiology.js).
  squat: { k: 1.68, exponent: 1.1, base: 2.1, carried: 0.85 },
  bench: { k: 5.327, exponent: 0.75, base: 0.9, carried: 4 },
  grip: { k: 3.024, exponent: 0.5, base: 2.5, carried: 0 },
  femaleUpperBody: 0.82,
  // Starvation saps contractile force far beyond the muscle lost:
  // electrolytes, glycogen, fibre damage.
  starvationWeakness: 12,
  // Sprint: horizontal force from the legs (N per kg^2/3 of leg muscle);
  // top speed from leg length, cut by carried mass beyond a reference.
  sprintForcePerMuscle: 120,
  sprintTopSpeedPerMetre: 12,
  sprintMassPenalty: 0.6,
  sprintTrained: 0.45, // top speed × (0.75 + this × exercise): trained stride and fibres
  femaleSprint: 0.76, // force per kg of leg muscle, women to men
  // Blunt impact tolerance (J): muscle armour and fat padding over the
  // trunk, scaled by bone density and how well the body braces.
  impactPerArmour: 44.9, impactExponent: 0.5, impactBone: 0.13, impactBracing: 0.7,
  armShape: 1.15, // mid-arm girth over the arm's mean girth: the biceps belly
};

/** How starved the body is: 0 above the essential-fat margin, ~1 at essential fat. */
export function starvation(inputs, bodyFat) {
  return Math.max(0, (PHYSIOLOGY.bone.lowFat[inputs.sex] - bodyFat) / 0.06);
}

/**
 * The stat sheet for a built body: what a lab would measure.
 * @param body  from buildBody
 */
export function deriveStats(body) {
  const { inputs, segments, fatKg, tScore, composition } = body;
  // The man, not his armour.
  const massKg = body.bodyMassKg ?? body.massKg;
  const exercise = inputs.exercise;
  const recruitment = 0.55 + 0.55 * exercise;
  const starving = starvation(inputs, composition.bodyFat);
  const weakness = 1 / (1 + STATS.starvationWeakness * starving * starving);
  const muscle = (keys) => keys.reduce((sum, key) => sum + segments[key].tissue.muscle, 0);
  const legs = muscle(['lThigh', 'rThigh', 'lShank', 'rShank']);
  const arms = muscle(['lUpperArm', 'rUpperArm', 'lForearm', 'rForearm']);
  const trunk = segments.trunk.tissue.muscle;
  const lift = (spec, upperBody) => spec.k * body.muscleKg ** spec.exponent * (spec.base + exercise) * (upperBody && inputs.sex === 'female' ? STATS.femaleUpperBody : 1) * weakness;
  const squat = lift(STATS.squat, false) - STATS.squat.carried * massKg;
  const bench = lift(STATS.bench, true) - STATS.bench.carried;
  const grip = lift(STATS.grip, true);
  const legLength = body.lengths.thigh + body.lengths.shank;
  const referenceMass = 75 * (body.heightM / 1.75) ** 2;
  const topSpeed = STATS.sprintTopSpeedPerMetre * legLength * (0.75 + STATS.sprintTrained * exercise) * Math.min(1.1, (referenceMass / massKg) ** STATS.sprintMassPenalty);
  const sprint = sprintTime(STATS.sprintForcePerMuscle * legs ** (2 / 3) * recruitment * weakness * (inputs.sex === 'female' ? STATS.femaleSprint : 1), topSpeed, massKg);
  const armour = trunk + 0.9 * fatKg * Math.min(1, segments.trunk.tissue.fat / Math.max(1, fatKg) * 1.7) + 0.4 * arms;
  const impact = STATS.impactPerArmour * armour ** STATS.impactExponent * Math.max(0.1, 1 + STATS.impactBone * tScore) * (1 + STATS.impactBracing * exercise) * weakness ** 0.5;
  const upperArm = segments.lUpperArm;
  return {
    weight: massKg, bodyFat: composition.bodyFat, lean: composition.lean, fat: fatKg, bmi: composition.bmi,
    rmr: composition.rmr, tdee: composition.tdee, tScore,
    arm: 2 * Math.PI * upperArm.skinRadius * STATS.armShape * 100,
    squat, bench, grip, sprint, impact, starving,
  };
}

/**
 * 30 m from a standing start under a linear force–velocity profile
 * (Samozino): force falls from its maximum to nothing at top speed. A body
 * whose legs cannot push its own weight cannot run at all.
 */
export function sprintTime(maxForce, topSpeed, mass) {
  if (maxForce < mass * 9.81 * 0.3) return Infinity;
  let distance = 0;
  let speed = 0;
  let time = 0;
  const dt = 0.005;
  while (distance < 30 && time < 60) {
    const accel = (maxForce / mass) * (1 - speed / topSpeed);
    speed += accel * dt;
    distance += speed * dt;
    time += dt;
  }
  return time;
}

/** Inputs that settle at a profile's weight and body fat: exercise from its lean, calories from its expenditure. */
export function inputsForProfile(profile, heightCm = 175, frameLean = 1) {
  const base = { sex: profile.sex, heightCm, frame: profile.frame, age: 27 };
  const fat = profile.weight * profile.bodyFat;
  const lean = profile.weight - fat;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 50; step += 1) {
    const exercise = (low + high) / 2;
    if (leanForFat({ ...base, exercise }, fat, frameLean) < lean) low = exercise;
    else high = exercise;
  }
  const exercise = (low + high) / 2;
  return { ...base, exercise, calories: Math.round(dailyExpenditure({ ...base, exercise }, lean, fat)) };
}
