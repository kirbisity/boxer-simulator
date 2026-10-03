// The cast: fighters made up on the spot. A team-mate is the side's lead
// again, a little different — build, age, fitness, looks, sometimes the
// other sex — in the same style and outfit; or anyone at all, at random,
// from the characters there are, made different the same way.

import { normaliseInputs, PRESETS } from './body.js';
import { randomColors } from './outfits.js';

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
