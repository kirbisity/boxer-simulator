// The cast: fighters made up on the spot. A team-mate is the side's lead
// again, a little different — build, age, fitness, looks, sometimes the
// other sex — in the same style and outfit; or anyone at all, at random,
// from the characters there are, made different the same way.

import { buildBody, FRAMES, normaliseInputs, PRESETS } from './body.js';
import { randomColors } from './outfits.js';
import { caloriesForWeight } from './physiology.js';
import { STYLES } from './moves.js';

export const CAST = {
  // How much a variation strays: height (cm), daily calories (share), age
  // (years), fitness (share), and how often the sex is the other.
  height: 7, calories: 0.12, age: 6, exercise: 0.12, otherSex: 0.4,
  // A woman of the same build is about this much shorter.
  sexHeight: 12,
  looks: {
    skinTone: ['light', 'lightTan', 'medium', 'tan', 'deep'],
    hairColor: ['#120d0a', '#2a1a10', '#6b4a2a', '#c9a25e', '#8a3a1c'],
    eyeColor: ['brown', 'hazel', 'blue', 'green', 'grey'],
    hair: { male: ['spiky', 'cleanShort', 'fade', 'buzz', 'cornrows', 'midLong', 'dreads', 'bald'], female: ['bun', 'ponytail', 'midLong', 'long', 'cleanShort'] },
    facialHair: ['none', 'none', 'stubble', 'mustache', 'beard'],
  },
  names: {
    male: ['Aldo', 'Bram', 'Cass', 'Dario', 'Emil', 'Felix', 'Goran', 'Hugo', 'Ivo', 'Jonas', 'Kenta', 'Luca', 'Mateo', 'Niko', 'Omar', 'Pavel', 'Rafe', 'Silas', 'Tariq', 'Ugo'],
    female: ['Ada', 'Bea', 'Cleo', 'Dana', 'Eva', 'Freya', 'Gia', 'Hana', 'Ines', 'Jade', 'Kira', 'Lena', 'Mila', 'Nora', 'Orla', 'Pia', 'Rosa', 'Sana', 'Tess', 'Vera'],
  },
};

const pickOne = (list, random) => list[Math.floor(random() * list.length)];
const jitter = (random) => random() * 2 - 1;

/**
 * Someone like this fighter: same style, outfit and headgear; a slightly
 * different body and face, sometimes the other sex; fresh outfit colours.
 */
export function varyCharacter(inputs, random = Math.random) {
  const base = normaliseInputs(structuredClone(inputs));
  const sex = random() < CAST.otherSex ? (base.sex === 'female' ? 'male' : 'female') : base.sex;
  const sexShift = sex === base.sex ? 0 : sex === 'female' ? -CAST.sexHeight : CAST.sexHeight;
  const looks = CAST.looks;
  const varied = {
    ...base,
    sex,
    name: pickOne(CAST.names[sex], random),
    heightCm: Math.round(Math.min(205, Math.max(150, base.heightCm + sexShift + jitter(random) * CAST.height))),
    calories: Math.round(base.calories * (1 + jitter(random) * CAST.calories) * (sex === base.sex ? 1 : sex === 'female' ? 0.85 : 1.15)),
    age: Math.round(Math.min(55, Math.max(18, base.age + jitter(random) * CAST.age))),
    exercise: Math.min(1, Math.max(0.05, base.exercise + jitter(random) * CAST.exercise)),
    look: {
      ...base.look,
      skinTone: pickOne(looks.skinTone, random),
      hairColor: pickOne(looks.hairColor, random),
      eyeColor: pickOne(looks.eyeColor, random),
      hairStyle: pickOne(looks.hair[sex], random),
      facialHair: sex === 'female' ? 'none' : pickOne(looks.facialHair, random),
    },
  };
  const kind = varied.outfit?.kind;
  if (kind) varied.outfit = { ...varied.outfit, colors: randomColors(kind, random) };
  return normaliseInputs(varied);
}

/** Anyone at all: one of the characters, made a little different. */
export function randomCharacter(random = Math.random) {
  return varyCharacter(pickOne(Object.values(PRESETS), random), random);
}

/** A fighter's own weight (kg), without his kit. */
export function weightOf(inputs) {
  const body = buildBody(normaliseInputs(structuredClone(inputs)));
  return body.bodyMassKg ?? body.massKg;
}

/** Fed to a weight: the calories that settle him there. */
function atWeight(inputs, kg) {
  const fed = normaliseInputs(structuredClone(inputs));
  fed.calories = Math.round(caloriesForWeight(fed, kg, (FRAMES[fed.frame] ?? FRAMES.medium).lean));
  return normaliseInputs(fed);
}

// The prize fight's men: anyone unarmed, gloved, fighting mixed.
const BOXERS = Object.values(PRESETS).filter((preset) => !STYLES[preset.style]?.weapon && !preset.simple);
// The arena's: gladiators, knights, samurai and their kin.
export const GLADIATORS = ['hoplomachus', 'knight', 'warhammer', 'samurai', 'naginata', 'spear'];

/**
 * A boxer for a prize fight: in trunks and gloves, fighting mixed, and —
 * given a weight — in the same class (within `spread` kg).
 */
export function randomBoxer(random = Math.random, { weightKg = null, spread = 2.5 } = {}) {
  const base = varyCharacter(pickOne(BOXERS, random), random);
  const boxer = normaliseInputs({ ...base, style: 'mix', outfit: { kind: 'boxing', design: 0 }, accessories: [], gloves: undefined });
  return weightKg ? atWeight(boxer, weightKg + jitter(random) * spread) : boxer;
}

/** A fighter for the arena: a gladiator, a knight, a samurai, a spearman — any weight. */
export function randomGladiator(random = Math.random) {
  const base = varyCharacter(PRESETS[pickOne(GLADIATORS, random)], random);
  // Samurai come in their five liveries.
  if (base.outfit?.kind === 'samurai') base.outfit = { ...base.outfit, design: Math.floor(random() * 5) };
  return base;
}

/**
 * A rebel peasant: a commoner with a spear, anyone from a boy to a greybeard,
 * thin or stout. Drawn simply (`simple`): no skeleton or muscle beneath, the
 * same body and physics as anyone.
 */
export function rebel(random = Math.random) {
  const base = varyCharacter(PRESETS.spear, random);
  const stout = 0.75 + random() * 0.6;
  return normaliseInputs({
    ...base,
    name: `${base.name} the ${pickOne(['Miller', 'Smith', 'Thatcher', 'Carter', 'Cooper', 'Tanner', 'Fletcher', 'Reeve'], random)}`,
    age: Math.round(16 + random() * 40),
    heightCm: Math.round(base.heightCm + jitter(random) * 6),
    calories: Math.round(base.calories * stout),
    exercise: 0.25 + random() * 0.4,
    accessories: random() < 0.6 ? ['headWrap'] : [],
    simple: true,
  });
}

/** Knights for a sortie: long swords and war hammers, plumed. */
export function knight(random = Math.random, index = 0) {
  return varyCharacter(index % 3 === 2 ? PRESETS.warhammer : PRESETS.knight, random);
}
