// Character → body model: bone, muscle and fat per body part, and the
// physical quantities the simulation runs on (particle masses, motor forces,
// collision radii). Every coefficient is a dial with its source beside it.

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
  // Fat-free mass index (kg/m²): ~19 untrained men, ~15.5 women; trained
  // natural athletes reach ~24–25 and ~19–20 (Kouri et al. 1995).
  ffmiBase: { male: 19, female: 15.5 },
  ffmiTrainedGain: { male: 5.5, female: 4.5 },
  skeletalMuscleShareOfLean: 0.52,
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
  referenceBulk: { arm: 3.1, leg: 9.5 },
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
  training: 0.6, bodyFat: 0.16, style: 'boxing',
  look: { skinTone: 'medium', hairStyle: 'cleanShort', hairColor: '#20160f', facialHair: 'none', eyeColor: 'brown' },
};

// `look` is appearance only; nothing in the simulation reads it.
export const PRESETS = {
  heavy: {
    name: 'Marcus "The Wall"', style: 'boxing', sex: 'male', heightCm: 193, frame: 'large', age: 29, training: 0.85, bodyFat: 0.17,
    look: { skinTone: 'deep', hairStyle: 'cornrows', hairColor: '#120d0a', facialHair: 'beard', eyeColor: 'brown' },
  },
  light: {
    name: 'Leo Quickhands', style: 'kickboxing', sex: 'male', heightCm: 172, frame: 'small', age: 24, training: 0.9, bodyFat: 0.1,
    look: { skinTone: 'light', hairStyle: 'spiky', hairColor: '#6b4a2a', facialHair: 'none', eyeColor: 'blue' },
  },
  amateur: {
    name: 'Dave from Accounts', style: 'boxing', sex: 'male', heightCm: 180, frame: 'medium', age: 34, training: 0.1, bodyFat: 0.28,
    look: { skinTone: 'light', hairStyle: 'cleanShort', hairColor: '#a37a45', facialHair: 'stubble', eyeColor: 'green' },
  },
  veteran: {
    name: 'Old Sal', style: 'boxing', sex: 'male', heightCm: 182, frame: 'medium', age: 48, training: 0.7, bodyFat: 0.2,
    look: { skinTone: 'tan', hairStyle: 'buzz', hairColor: '#8d8d8d', facialHair: 'mustache', eyeColor: 'grey' },
  },
  contender: {
    name: 'Ana Ruiz', style: 'muayThai', sex: 'female', heightCm: 170, frame: 'medium', age: 26, training: 0.9, bodyFat: 0.17,
    look: { skinTone: 'medium', hairStyle: 'bun', hairColor: '#2a1a10', facialHair: 'none', eyeColor: 'hazel' },
  },
};

const segmentKind = (key) => key.replace(/^[lr](?=[A-Z])/, '').replace(/^./, (c) => c.toLowerCase());
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Build the full body model from a character's inputs. */
export function buildBody(rawInputs) {
  const inputs = { ...DEFAULT_INPUTS, ...rawInputs };
  const heightM = inputs.heightCm / 100;
  const frame = FRAMES[inputs.frame] ?? FRAMES.medium;
  const yearsAging = Math.max(0, inputs.age - BODY.agingFrom);

  const ffmi = (BODY.ffmiBase[inputs.sex] + BODY.ffmiTrainedGain[inputs.sex] * inputs.training) * frame.lean;
  const leanKg = ffmi * heightM * heightM * (1 - BODY.muscleLossPerYear * yearsAging * 0.5);
  const muscleKg = leanKg * BODY.skeletalMuscleShareOfLean * (1 - BODY.muscleLossPerYear * yearsAging);
  const boneKg = BODY.referenceBoneKg[inputs.sex] * (heightM / BODY.referenceHeightM) ** 3 * frame.bone;
  const otherKg = leanKg - muscleKg - boneKg;
  const fatKg = (leanKg * inputs.bodyFat) / (1 - inputs.bodyFat);
  const massKg = leanKg + fatKg;
  const boneDensity = frame.bone * (1 - BODY.boneLossPerYear[inputs.sex] * Math.max(0, inputs.age - 35)) * (0.92 + 0.12 * inputs.training);
  const muscleQuality = 1 - BODY.qualityLossPerYear * yearsAging;

  const lengths = {};
  for (const [key, fraction] of Object.entries(LENGTH)) lengths[key] = fraction * heightM;
  lengths.hipSpan *= frame.width;
  lengths.shoulderSpan *= frame.width * (inputs.sex === 'female' ? 0.92 : 1) * (1 + 0.06 * inputs.training);

  const segments = {};
  for (const key of Object.keys(SEGMENTS)) {
    const kind = segmentKind(key);
    const tissue = {
      muscle: muscleKg * SHARE.muscle[kind],
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

  const masses = particleMasses(segments, massKg);
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
  // A motor must at least hold its own particle up, or the fighter sags.
  for (let index = 0; index < motorForce.length; index += 1) motorForce[index] = Math.max(motorForce[index], masses[index] * 9.81 * 2.2);

  const armKg = (side) => segments[`${side}UpperArm`].mass + segments[`${side}Forearm`].mass + BODY.gloveKg;
  const technique = 0.75 + 0.25 * inputs.training;
  const aerobic = clamp(0.45 + 0.6 * inputs.training - 1.2 * Math.max(0, inputs.bodyFat - 0.15) - 0.008 * yearsAging, 0.15, 1.1);

  return {
    inputs, heightM, massKg, leanKg, muscleKg, boneKg, fatKg, ffmi, boneDensity, muscleQuality, neckIndex,
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
    chin: 3.1 * (0.8 + 0.25 * neckIndex) * (1 - 0.004 * yearsAging),
    fracture: {
      face: BODY.fractureN.face * boneDensity,
      hand: BODY.fractureN.hand * boneDensity,
      rib: BODY.fractureN.rib * boneDensity,
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
  return { schemaVersion: 1, kind: 'boxer-simulator/fighter', inputs: { ...DEFAULT_INPUTS, ...inputs } };
}
