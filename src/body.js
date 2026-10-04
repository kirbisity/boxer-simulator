// Character → body model: bone, muscle and fat per body part, and the
// physical quantities the simulation runs on (particle masses, motor forces,
// collision radii). Every coefficient is a dial with its source beside it.

import { boneTScore, caloriesForBodyFat, settleComposition, starvation } from './physiology.js';
import { gearTraits } from './outfits.js';

export const PARTICLES = [
  'head', 'neck', 'lShoulder', 'rShoulder', 'lElbow', 'rElbow', 'lHand', 'rHand',
  'pelvis', 'lHip', 'rHip', 'lKnee', 'rKnee', 'lFoot', 'rFoot',
];
export const P = Object.fromEntries(PARTICLES.map((name, index) => [name, index]));

// Segments carry the tissue; each spans two particles (the head sits on one).
export const SEGMENTS = {
  head: { from: 'neck', to: 'head' },
  trunk: { from: 'pelvis', to: 'neck' },
  lUpperArm: { from: 'lShoulder', to: 'lElbow' },
  rUpperArm: { from: 'rShoulder', to: 'rElbow' },
  lForearm: { from: 'lElbow', to: 'lHand' },
  rForearm: { from: 'rElbow', to: 'rHand' },
  lThigh: { from: 'lHip', to: 'lKnee' },
  rThigh: { from: 'rHip', to: 'rKnee' },
  lShank: { from: 'lKnee', to: 'lFoot' },
  rShank: { from: 'rKnee', to: 'rFoot' },
};

// Share of each tissue carried by each segment. Muscle and bone follow the
// Dempster segment fractions (Winter, Biomechanics of Human Movement); fat
// sits mostly on the trunk and thighs; "other" (organs, skin, blood) mostly
// in the trunk and head. Hands and feet are folded into forearm and shank.
const SHARE = {
  muscle: { head: 0.03, trunk: 0.44, upperArm: 0.032, forearm: 0.024, thigh: 0.13, shank: 0.073 },
  bone: { head: 0.16, trunk: 0.34, upperArm: 0.035, forearm: 0.03, thigh: 0.1, shank: 0.085 },
  fat: { head: 0.02, trunk: 0.57, upperArm: 0.035, forearm: 0.015, thigh: 0.11, shank: 0.04 },
  other: { head: 0.12, trunk: 0.74, upperArm: 0.02, forearm: 0.015, thigh: 0.025, shank: 0.015 },
};
const DENSITY = { muscle: 1060, bone: 1850, fat: 900, other: 1050 };

// Lengths as fractions of standing height (Drillis & Contini 1966).
const LENGTH = {
  ankle: 0.039, shank: 0.246, thigh: 0.245, trunk: 0.27, neckToHead: 0.115,
  upperArm: 0.186, forearmToFist: 0.19, hipSpan: 0.1, shoulderSpan: 0.2, headRadius: 0.055,
};

export const FRAMES = {
  small: { lean: 0.94, bone: 0.88, width: 0.94 },
  medium: { lean: 1, bone: 1, width: 1 },
  large: { lean: 1.07, bone: 1.12, width: 1.07 },
};

export const BODY = {
  // How much harm everyone takes before it tells — chin, brain strain,
  // fractures, worn-out tissue, cuts through, blood lost — as a share of the
  // figures below. Lower means fists and weapons alike end fights sooner;
  // nothing in the physics (masses, forces, impulses, knockback) changes.
  toughness: 0.55,
  // Lean mass that is not skeleton or skeletal muscle: organs, skin, blood.
  // A share of lean (so it shrinks in starvation) plus a little per kg of
  // fat (a bigger body needs bigger organs). Leaves ~32 kg of muscle in a
  // healthy 80 kg man and ~11 kg in a 28 kg starving one.
  organShareOfLean: 0.33,
  armHypertrophy: 0.6, // arm muscle share multiplies by 1 + this × exercise^2.5
  limbWasting: 4, // limb muscle share divides by 1 + this × starvation
  organPerFatKg: 0.08,
  // The skeleton is sized by the frame, not by the muscle on it: ~11 kg for a
  // 1.75 m man of medium frame, scaling with height cubed. A thin fighter
  // carries the same bones as a muscular one of the same height, with less
  // muscle to move them: dead weight, so slower limbs.
  referenceBoneKg: { male: 11, female: 8.6 },
  referenceHeightM: 1.75,
  // Muscle is lost at ~0.5%/yr after thirty and fast fibres faster, so force
  // per kilogram falls too (Janssen 2000; Lexell 1995).
  muscleLossPerYear: 0.005,
  qualityLossPerYear: 0.007,
  boneLossPerYear: { male: 0.004, female: 0.008 },
  agingFrom: 30,
  // Peak motor force per kilogram of muscle that drives the particle. Set so
  // a trained heavyweight's straight right reaches ~9–10 m/s and an untrained
  // man's ~6–7 m/s, the ranges reported for boxers and novices.
  forcePerMuscleKg: { arm: 130, trunk: 26, leg: 30, neck: 900 },
  // Muscle force grows with its cross-section, so with mass to the 2/3: a
  // heavier limb's muscle does not keep up with the mass it must move. The
  // reference sizes are where the per-kilogram figures above hold exactly.
  allometryExponent: 2 / 3,
  referenceMuscleKg: { arm: 2.4, leg: 9, trunk: 14 },
  // Hill's force–velocity law: a muscle's force falls as it shortens faster,
  // to nothing at its top speed. That speed scales with fibre length, so with
  // limb length (m/s per metre of limb); trained fast fibres add to it. Short
  // limbs top out sooner — why very small fighters are not the fastest.
  topSpeedPerMetre: { arm: 42, leg: 36 },
  // Bulkier muscle is more pennate (fibres at a steeper angle): more force,
  // slower shortening (Kawakami et al. 1993). Bulk is muscle kg per metre of
  // limb; below the reference it costs nothing, above it the cost grows with
  // the square of the excess, as fibre angles steepen.
  referenceBulk: { arm: 3.5, leg: 9.5 },
  pennationCost: 14,
  hillCurvature: 1.0,
  kickForcePerMuscleKg: 95,
  neuralDriveBase: 0.55,
  neuralDriveTrained: 0.55,
  gloveKg: 0.34,
  // Bone fracture forces through a glove and hand wraps for a reference bone
  // density. Bare-bone cadaver figures (zygoma/orbit ~3–4 kN, metacarpals
  // ~2.5–3.5 kN) are raised for padding, so a fracture is a rare event in a
  // bout, as it is in the sport.
  fractureN: { face: 5200, hand: 5600, rib: 4800 },
};

/** Default inputs, also the shape of a fighter file's `inputs`. */
export const DEFAULT_INPUTS = {
  name: 'Fighter', sex: 'male', heightCm: 180, frame: 'medium', age: 27,
  exercise: 0.4, calories: 2800, style: 'boxing',
  look: { skinTone: 'medium', hairStyle: 'cleanShort', hairColor: '#20160f', facialHair: 'none', eyeColor: 'brown' },
};

// `look` is appearance only; nothing in the simulation reads it.
export const PRESETS = {
  heavy: {
    name: 'Marcus "The Wall"', style: 'boxing', sex: 'male', heightCm: 193, frame: 'large', age: 29, exercise: 0.65, calories: 5740,
    look: { skinTone: 'deep', hairStyle: 'cornrows', hairColor: '#120d0a', facialHair: 'beard', eyeColor: 'brown' },
  },
  light: {
    name: 'Leo Quickhands', style: 'kickboxing', sex: 'male', heightCm: 172, frame: 'small', age: 24, exercise: 0.81, calories: 4160,
    look: { skinTone: 'light', hairStyle: 'spiky', hairColor: '#6b4a2a', facialHair: 'none', eyeColor: 'blue' },
  },
  amateur: {
    name: 'Dave from Accounts', style: 'boxing', sex: 'male', heightCm: 180, frame: 'medium', age: 34, exercise: 0.1, calories: 2900,
    look: { skinTone: 'light', hairStyle: 'cleanShort', hairColor: '#a37a45', facialHair: 'stubble', eyeColor: 'green' },
  },
  veteran: {
    name: 'Old Sal', style: 'boxing', sex: 'male', heightCm: 182, frame: 'medium', age: 48, exercise: 0.48, calories: 3800,
    look: { skinTone: 'tan', hairStyle: 'buzz', hairColor: '#8d8d8d', facialHair: 'mustache', eyeColor: 'grey' },
  },
  contender: {
    name: 'Ana Ruiz', style: 'muayThai', sex: 'female', heightCm: 170, frame: 'medium', age: 26, exercise: 0.88, calories: 3810,
    look: { skinTone: 'medium', hairStyle: 'bun', hairColor: '#2a1a10', facialHair: 'none', eyeColor: 'hazel' },
  },
  // A character for every other style, dressed for it.
  street: {
    name: 'Vinnie Russo', style: 'street', sex: 'male', heightCm: 178, frame: 'medium', age: 31, exercise: 0.3, calories: 3100,
    outfit: { kind: 'casual', design: 0 },
    look: { skinTone: 'light', hairStyle: 'fade', hairColor: '#2a1a10', facialHair: 'stubble', eyeColor: 'brown' },
  },
  sumo: {
    name: 'Takanohana', style: 'sumo', sex: 'male', heightCm: 185, frame: 'large', age: 27, exercise: 0.7, calories: 7400,
    outfit: { kind: 'sumo', design: 0 },
    look: { skinTone: 'lightTan', hairStyle: 'topknot', hairColor: '#120d0a', facialHair: 'none', eyeColor: 'brown' },
  },
  mix: {
    name: 'Kai Moana', style: 'mix', sex: 'male', heightCm: 180, frame: 'medium', age: 26, exercise: 0.8, calories: 4000,
    outfit: { kind: 'sports', design: 0 },
    look: { skinTone: 'tan', hairStyle: 'spiky', hairColor: '#120d0a', facialHair: 'none', eyeColor: 'brown' },
  },
  unskilled: {
    name: 'Wat Tyler', style: 'unskilled', sex: 'male', heightCm: 172, frame: 'medium', age: 35, exercise: 0.25, calories: 2900,
    outfit: { kind: 'commoner', design: 0 }, accessories: ['headWrap'],
    look: { skinTone: 'light', hairStyle: 'midLong', hairColor: '#6b4a2a', facialHair: 'beard', eyeColor: 'green' },
  },
  // A clinch brawler: big, heavy-handed, an MMA veteran who grabs and swings.
  clinchBrawl: {
    name: 'Hank Doyle', style: 'clinchBrawl', sex: 'male', heightCm: 186, frame: 'large', age: 33, exercise: 0.7, calories: 5100,
    outfit: { kind: 'mma', design: 0 },
    look: { skinTone: 'light', hairStyle: 'buzz', hairColor: '#4a3020', facialHair: 'handlebar', eyeColor: 'grey' },
  },
  // Armed SWAT: an 80 kg officer with a service pistol, in the full kit.
  handgun: {
    name: 'Sgt. Dana Cole', style: 'handgun', sex: 'male', heightCm: 180, frame: 'medium', age: 34, exercise: 0.55, calories: 3720,
    outfit: { kind: 'swat', design: 0 },
    look: { skinTone: 'light', hairStyle: 'fade', hairColor: '#2a1a10', facialHair: 'stubble', eyeColor: 'blue' },
  },
  baton: {
    name: 'Officer Reyes', style: 'baton', sex: 'male', heightCm: 182, frame: 'medium', age: 33, exercise: 0.6, calories: 3600,
    outfit: { kind: 'swat', design: 0 },
    look: { skinTone: 'tan', hairStyle: 'buzz', hairColor: '#120d0a', facialHair: 'mustache', eyeColor: 'brown' },
  },
  knight: {
    name: 'Sir Edric', style: 'longsword', sex: 'male', heightCm: 183, frame: 'large', age: 30, exercise: 0.75, calories: 4200,
    outfit: { kind: 'knight', design: 0 }, accessories: ['plume'],
    look: { skinTone: 'light', hairStyle: 'midLong', hairColor: '#c9a25e', facialHair: 'beard', eyeColor: 'blue' },
  },
  samurai: {
    name: 'Takeda Shingen', style: 'katana', sex: 'male', heightCm: 172, frame: 'medium', age: 34, exercise: 0.8, calories: 3600,
    outfit: { kind: 'samurai', design: 1 }, accessories: ['crest'],
    look: { skinTone: 'lightTan', hairStyle: 'topknot', hairColor: '#120d0a', facialHair: 'mustache', eyeColor: 'brown' },
  },
  knife: {
    name: 'Ryo Kanda', style: 'knife', sex: 'male', heightCm: 175, frame: 'small', age: 29, exercise: 0.55, calories: 3100,
    outfit: { kind: 'yakuza', design: 0 }, accessories: ['hat'],
    look: { skinTone: 'lightTan', hairStyle: 'cleanShort', hairColor: '#120d0a', facialHair: 'none', eyeColor: 'brown' },
  },
  warhammer: {
    name: 'Gunnar Holt', style: 'warhammer', sex: 'male', heightCm: 190, frame: 'large', age: 36, exercise: 0.7, calories: 4800,
    outfit: { kind: 'knight', design: 0 }, accessories: ['plume'],
    look: { skinTone: 'light', hairStyle: 'long', hairColor: '#8a3a1c', facialHair: 'beard', eyeColor: 'grey' },
  },
  naginata: {
    name: 'Tomoe Gozen', style: 'naginata', sex: 'female', heightCm: 165, frame: 'medium', age: 27, exercise: 0.85, calories: 3200,
    outfit: { kind: 'samurai', design: 3 }, accessories: ['crest'],
    look: { skinTone: 'lightTan', hairStyle: 'long', hairColor: '#120d0a', facialHair: 'none', eyeColor: 'brown' },
  },
  spear: {
    name: 'Hob Miller', style: 'spear', sex: 'male', heightCm: 176, frame: 'medium', age: 30, exercise: 0.5, calories: 3200,
    outfit: { kind: 'commoner', design: 0 }, accessories: ['headWrap'],
    look: { skinTone: 'tan', hairStyle: 'cleanShort', hairColor: '#2a1a10', facialHair: 'stubble', eyeColor: 'hazel' },
  },
  // A gladiator armed as a Greek hoplite: spear, parma, a gladius in reserve.
  hoplomachus: {
    name: 'Priscus', style: 'hoplomachus', sex: 'male', heightCm: 178, frame: 'medium', age: 28, exercise: 0.8, calories: 3900,
    outfit: { kind: 'hoplomachus', design: 0 },
    look: { skinTone: 'tan', hairStyle: 'buzz', hairColor: '#1c130c', facialHair: 'beard', eyeColor: 'brown' },
  },
};

const segmentKind = (key) => key.replace(/^[lr](?=[A-Z])/, '').replace(/^./, (c) => c.toLowerCase());
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * The player's inputs, completed: daily calories and exercise level are what
 * a player sets. Older fighter files set training and body fat instead; they
 * are read as an exercise level and the calories that settle at that fat.
 */
export function normaliseInputs(rawInputs) {
  const inputs = { ...DEFAULT_INPUTS, ...rawInputs, look: { ...DEFAULT_INPUTS.look, ...rawInputs?.look } };
  if (rawInputs?.exercise === undefined) inputs.exercise = rawInputs?.training ?? DEFAULT_INPUTS.exercise;
  if (rawInputs?.calories === undefined) {
    const frame = FRAMES[inputs.frame] ?? FRAMES.medium;
    inputs.calories = Math.round(caloriesForBodyFat(inputs, rawInputs?.bodyFat ?? 0.16, frame.lean));
  }
  // Street clothes from before outfits: the casual outfit, in their colours.
  if (rawInputs?.clothing && !rawInputs.outfit) {
    const { top, topColor, bottomColor } = rawInputs.clothing;
    inputs.outfit = { kind: 'casual', design: top === 'hoodie' ? 2 : 1, colors: { top: topColor, bottom: bottomColor } };
  }
  delete inputs.clothing;
  delete inputs.training;
  delete inputs.bodyFat;
  return inputs;
}

/** Build the full body model from a character's inputs. */
export function buildBody(rawInputs) {
  const inputs = normaliseInputs(rawInputs);
  const heightM = inputs.heightCm / 100;
  const frame = FRAMES[inputs.frame] ?? FRAMES.medium;
  const yearsAging = Math.max(0, inputs.age - BODY.agingFrom);

  // What eating and exercise settle into: lean and fat are outcomes.
  const composition = settleComposition(inputs, frame.lean);
  const leanKg = composition.lean;
  const fatKg = composition.fat;
  const massKg = leanKg + fatKg;
  // Downstream reads training (skill, recruitment) and body fat from inputs.
  inputs.training = inputs.exercise;
  inputs.bodyFat = composition.bodyFat;
  const tScore = boneTScore(inputs, massKg, composition.bodyFat);
  // Bone: the frame's skeleton, denser or more porous by its T-score
  // (each SD is ~10% of bone mineral).
  // A T-score is in standard deviations of mineral density, about 10% each;
  // mineral is half the skeleton's mass, so its weight moves half as much.
  const boneDensity = Math.max(0.35, 1 + 0.1 * tScore) * frame.bone;
  const boneKg = BODY.referenceBoneKg[inputs.sex] * (heightM / BODY.referenceHeightM) ** 3 * Math.max(0.6, 1 + 0.05 * tScore) * frame.bone;
  const otherKg = BODY.organShareOfLean * leanKg + BODY.organPerFatKg * fatKg;
  const muscleKg = Math.max(0.05 * leanKg, leanKg - boneKg - otherKg);
  const ffmi = leanKg / (heightM * heightM);
  const muscleQuality = 1 - BODY.qualityLossPerYear * yearsAging;

  const lengths = {};
  for (const [key, fraction] of Object.entries(LENGTH)) lengths[key] = fraction * heightM;
  lengths.hipSpan *= frame.width;
  lengths.shoulderSpan *= frame.width * (inputs.sex === 'female' ? 0.92 : 1) * (1 + 0.06 * inputs.training);

  // Training grows the arms (and shoulders) disproportionately; starvation
  // strips the limbs before the trunk. Shares are renormalised to sum to the
  // body's muscle.
  const starving = starvation(inputs, composition.bodyFat);
  const muscleShares = { ...SHARE.muscle };
  for (const kind of ['upperArm', 'forearm']) muscleShares[kind] *= 1 + BODY.armHypertrophy * inputs.exercise ** 2.5;
  for (const kind of ['upperArm', 'forearm', 'thigh', 'shank']) muscleShares[kind] /= 1 + BODY.limbWasting * starving;
  const shareTotal = muscleShares.head + muscleShares.trunk + 2 * (muscleShares.upperArm + muscleShares.forearm + muscleShares.thigh + muscleShares.shank);
  for (const kind of Object.keys(muscleShares)) muscleShares[kind] /= shareTotal;
  const segments = {};
  for (const key of Object.keys(SEGMENTS)) {
    const kind = segmentKind(key);
    const tissue = {
      muscle: muscleKg * muscleShares[kind],
      bone: boneKg * SHARE.bone[kind],
      fat: fatKg * SHARE.fat[kind],
      other: otherKg * SHARE.other[kind],
    };
    const length = kind === 'head' ? lengths.neckToHead : kind === 'trunk' ? lengths.trunk : lengths[kind === 'forearm' ? 'forearmToFist' : kind];
    const volume = (tissueKey) => tissue[tissueKey] / DENSITY[tissueKey];
    const radiusFor = (litres) => Math.sqrt(litres / (Math.PI * length));
    segments[key] = {
      kind, length, tissue,
      mass: tissue.muscle + tissue.bone + tissue.fat + tissue.other,
      // Concentric layers: bone inside, muscle (with organs) around it, fat outside.
      boneRadius: radiusFor(volume('bone')),
      muscleRadius: radiusFor(volume('bone') + volume('muscle') + volume('other')),
      skinRadius: radiusFor(volume('bone') + volume('muscle') + volume('other') + volume('fat')),
      // Fat makes flesh softer and thicker; muscle makes it firmer.
      fleshFirmness: clamp(tissue.muscle / (tissue.muscle + tissue.fat * 1.6 + 1e-6), 0.2, 1),
    };
  }
  const arm = (side) => segments[`${side}UpperArm`].tissue.muscle + segments[`${side}Forearm`].tissue.muscle;
  const leg = (side) => segments[`${side}Thigh`].tissue.muscle + segments[`${side}Shank`].tissue.muscle;
  const trunkMuscle = segments.trunk.tissue.muscle;
  const headMass = segments.head.mass;
  // Neck muscle is what couples the head to the body when it is hit.
  const neckIndex = clamp((ffmi - 15) / 9, 0, 1.4) * muscleQuality;

  // What he wears weighs: armour is spread over the body like its own mass,
  // so it is moved by the same muscles and knocked back with the same body.
  const gear = gearTraits(inputs);
  const gearKg = massKg * gear.extraMass;
  const masses = particleMasses(segments, massKg).map((mass) => mass * (1 + gear.extraMass));
  const force = BODY.forcePerMuscleKg;
  const motorForce = new Array(PARTICLES.length).fill(0);
  // Trained punchers recruit more of their muscle, faster: the larger part of
  // the elite–novice gap in hand speed is skill, not size.
  const neuralDrive = BODY.neuralDriveBase + BODY.neuralDriveTrained * inputs.training;
  const allometric = (muscle, reference) => reference * (muscle / reference) ** BODY.allometryExponent;
  const strikeForce = new Array(PARTICLES.length).fill(0);
  const topSpeed = new Array(PARTICLES.length).fill(Infinity);
  const fastFibres = (0.72 + 0.38 * inputs.training) * muscleQuality;
  const legLength = lengths.thigh + lengths.shank;
  // The trunk turns the shoulders into a punch: the same cross-section law.
  const trunkForce = allometric(trunkMuscle, BODY.referenceMuscleKg.trunk) * force.trunk * muscleQuality;
  for (const side of ['l', 'r']) {
    const armForce = allometric(arm(side), BODY.referenceMuscleKg.arm) * force.arm * muscleQuality * neuralDrive;
    motorForce[P[`${side}Hand`]] = armForce;
    motorForce[P[`${side}Elbow`]] = armForce * 0.6;
    strikeForce[P[`${side}Hand`]] = armForce;
    strikeForce[P[`${side}Elbow`]] = armForce;
    const kickForce = allometric(leg(side), BODY.referenceMuscleKg.leg) * BODY.kickForcePerMuscleKg * muscleQuality * neuralDrive;
    strikeForce[P[`${side}Foot`]] = kickForce;
    strikeForce[P[`${side}Knee`]] = kickForce * 0.9;
    const armLength = lengths.upperArm + lengths.forearmToFist;
    const armBulk = arm(side) / armLength / BODY.referenceBulk.arm;
    const legBulk = leg(side) / legLength / BODY.referenceBulk.leg;
    const pennation = (bulk) => 1 / (1 + BODY.pennationCost * Math.max(0, bulk - 1) ** 2);
    topSpeed[P[`${side}Hand`]] = BODY.topSpeedPerMetre.arm * armLength * fastFibres * pennation(armBulk);
    topSpeed[P[`${side}Elbow`]] = topSpeed[P[`${side}Hand`]] * 0.85;
    topSpeed[P[`${side}Foot`]] = BODY.topSpeedPerMetre.leg * legLength * fastFibres * pennation(legBulk);
    topSpeed[P[`${side}Knee`]] = topSpeed[P[`${side}Foot`]] * 0.6;
    motorForce[P[`${side}Shoulder`]] = trunkForce;
    motorForce[P[`${side}Hip`]] = trunkForce;
    motorForce[P[`${side}Knee`]] = allometric(leg(side), BODY.referenceMuscleKg.leg) * force.leg * muscleQuality;
    motorForce[P[`${side}Foot`]] = allometric(leg(side), BODY.referenceMuscleKg.leg) * force.leg * 2 * muscleQuality;
  }
  motorForce[P.neck] = trunkForce;
  motorForce[P.pelvis] = allometric(leg('l') + leg('r'), BODY.referenceMuscleKg.leg * 2) * force.leg * 1.5 * muscleQuality;
  motorForce[P.head] = segments.head.tissue.muscle * force.neck * (0.5 + neckIndex);
  // Armour and tight tailoring keep the limbs from swinging as fast.
  for (let index = 0; index < topSpeed.length; index += 1) topSpeed[index] *= gear.swing;
  // A motor must at least hold its own particle up, or the fighter sags.
  for (let index = 0; index < motorForce.length; index += 1) motorForce[index] = Math.max(motorForce[index], masses[index] * 9.81 * 2.2);

  const armKg = (side) => segments[`${side}UpperArm`].mass + segments[`${side}Forearm`].mass + BODY.gloveKg;
  const technique = 0.75 + 0.25 * inputs.training;
  const aerobic = clamp(0.45 + 0.6 * inputs.training - 1.2 * Math.max(0, inputs.bodyFat - 0.15) - 0.008 * yearsAging, 0.15, 1.1);

  return {
    inputs, heightM, massKg: massKg + gearKg, bodyMassKg: massKg, gearKg, gear, leanKg, muscleKg, boneKg, fatKg, ffmi, boneDensity, muscleQuality, neckIndex, composition, tScore,
    lengths, segments, masses, motorForce, strikeForce, topSpeed, aerobic,
    limbKg: {
      lArm: segments.lUpperArm.mass + segments.lForearm.mass + BODY.gloveKg,
      rArm: segments.rUpperArm.mass + segments.rForearm.mass + BODY.gloveKg,
      lLeg: segments.lThigh.mass + segments.lShank.mass,
      rLeg: segments.rThigh.mass + segments.rShank.mass,
    },
    technique,
    reach: lengths.upperArm + lengths.forearmToFist,
    headMass,
    // Effective head mass at impact: a strong neck braces the head to the
    // trunk, and a trained fighter tucks the chin and tenses it in time.
    headEffectiveMass: headMass * (1 + 0.9 * neckIndex) * (0.75 + 0.35 * inputs.training),
    // Effective striking mass by punch: arm mass, plus trunk mass brought in by
    // rotation, scaled by technique. Lands near Walilko et al. (2005)'s 2.9 kg
    // mean for Olympic boxers' straight punches.
    strikeMass: {
      jab: (armKg('l') * 0.55) * technique,
      cross: (armKg('r') * 0.6 + massKg * 0.012) * technique,
      hook: (armKg('l') * 0.6 + massKg * 0.01) * technique,
      uppercut: (armKg('r') * 0.6 + massKg * 0.01) * technique,
    },
    // Head speed change that drops this fighter, ~3–4.5 m/s ("chin").
    chin: 3.1 * (0.8 + 0.25 * neckIndex) * (1 - 0.004 * yearsAging) * BODY.toughness,
    // A man's own hand breaking on a punch is the attacker's risk, not his health: it stays.
    fracture: {
      face: BODY.fractureN.face * boneDensity * BODY.toughness,
      hand: BODY.fractureN.hand * boneDensity,
      rib: BODY.fractureN.rib * boneDensity * BODY.toughness,
    },
  };
}

function particleMasses(segments, massKg) {
  const masses = new Array(PARTICLES.length).fill(0);
  const trunk = segments.trunk.mass;
  masses[P.head] = segments.head.mass;
  masses[P.neck] = trunk * 0.1;
  masses[P.pelvis] = trunk * 0.36;
  for (const side of ['l', 'r']) {
    const upper = segments[`${side}UpperArm`].mass;
    const fore = segments[`${side}Forearm`].mass;
    const thigh = segments[`${side}Thigh`].mass;
    const shank = segments[`${side}Shank`].mass;
    masses[P[`${side}Shoulder`]] = trunk * 0.12 + upper / 2;
    masses[P[`${side}Elbow`]] = upper / 2 + fore / 2;
    masses[P[`${side}Hand`]] = fore / 2 + BODY.gloveKg;
    masses[P[`${side}Hip`]] = trunk * 0.15 + thigh / 2;
    masses[P[`${side}Knee`]] = thigh / 2 + shank / 2;
    masses[P[`${side}Foot`]] = shank / 2;
  }
  const total = masses.reduce((sum, mass) => sum + mass, 0);
  // Rounding in the tissue shares; keep the body's total mass exact.
  return masses.map((mass) => (mass * (massKg + 2 * BODY.gloveKg)) / total);
}

/** A shareable fighter file: inputs and a version; the body is rebuilt from them. */
export function fighterFile(inputs) {
  return { schemaVersion: 2, kind: 'gladiator/fighter', inputs: normaliseInputs(inputs) };
}
