// The cast: fighters made up on the spot. A team-mate is the side's lead
// again, a little different — build, age, fitness, looks, sometimes the
// other sex — in the same style and outfit; or anyone at all, at random,
// from the characters there are, made different the same way.

import { buildBody, FRAMES, normaliseInputs, PRESETS } from './body.js';
import { defaultHeadgear, familyKinds, headgearOptions, OUTFITS, randomColors, randomDesign } from './outfits.js';
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
  return normaliseInputs(OUTFITS[kind]?.family ? redress(varied, random) : varied);
}

/**
 * The same fighter in another of his armour's designs, among those picked
 * for the game; with `anyKind`, in any armour of the same family (a knight
 * in plate, mail or brigandine). Headgear follows the armour.
 */
export function redress(inputs, random = Math.random, { anyKind = false } = {}) {
  const current = inputs.outfit?.kind;
  const family = OUTFITS[current]?.family;
  if (!family) return inputs;
  const kind = anyKind ? pickOne(familyKinds(family), random) : current;
  const accessories = (inputs.accessories ?? []).filter((item) => headgearOptions(kind).includes(item));
  return { ...inputs, outfit: { ...inputs.outfit, kind, design: randomDesign(kind, random) }, accessories: kind === current ? inputs.accessories : (accessories.length ? accessories : defaultHeadgear(kind)) };
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
const BOXERS = Object.values(PRESETS).filter((preset) => !STYLES[preset.style]?.weapon && !STYLES[preset.style]?.passive && !preset.simple);
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
  // Any armour of his kind's family, in one of its picked designs.
  return normaliseInputs(redress(varyCharacter(PRESETS[pickOne(GLADIATORS, random)], random), random, { anyKind: true }));
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

/** A SWAT officer: armed with a pistol or a baton, in the full kit. */
export function swatOfficer(random = Math.random, style = 'handgun') {
  const base = varyCharacter(style === 'handgun' ? PRESETS.handgun : PRESETS.baton, random);
  return normaliseInputs({ ...base, name: `${pickOne(['Officer', 'Sgt.', 'Cpl.'], random)} ${pickOne(['Reyes', 'Cole', 'Novak', 'Burke', 'Ortiz', 'Hale', 'Kowalski', 'Price', 'Walsh', 'Okafor'], random)}`, style, outfit: { kind: 'swat', design: 0 } });
}

/** A yakuza soldier: bare-backed and tattooed, with a knife, a katana or a pistol. */
export function yakuza(random = Math.random, style = 'knife') {
  const base = varyCharacter(PRESETS.knife, random);
  const name = `${pickOne(['Kenji', 'Takeshi', 'Daisuke', 'Ryota', 'Shin', 'Hiroshi', 'Kazuo', 'Tetsu', 'Goro', 'Masa'], random)} ${pickOne(['Mori', 'Kuroda', 'Ishida', 'Sato', 'Ono', 'Fujita', 'Endo', 'Kanda'], random)}`;
  return normaliseInputs({ ...base, sex: 'male', name, style, outfit: { kind: 'yakuza', design: 0 }, accessories: random() < 0.4 ? ['hat'] : [], look: { ...base.look, facialHair: base.look.facialHair, skinTone: pickOne(['lightTan', 'medium', 'light'], random), hairColor: '#120d0a' } });
}

/** Knights for a sortie: long swords and war hammers, plumed. */
export function knight(random = Math.random, index = 0) {
  return varyCharacter(index % 3 === 2 ? PRESETS.warhammer : PRESETS.knight, random);
}

/**
 * A warrior of one side at Sekigahara: a samurai in ō-yoroi or tōsei gusoku,
 * or an ashigaru (by default, one with a spear or a bow), with any of the
 * side's weapons, lacquered in its colours with its banner on his back.
 */
export function sengokuWarrior(random = Math.random, side, style, rank = style === 'spear' || style === 'bow' ? 'ashigaru' : 'samurai') {
  const ashigaru = rank === 'ashigaru';
  const base = varyCharacter(ashigaru ? PRESETS.spear : PRESETS.samurai, random);
  const kind = ashigaru ? 'ashigaru' : pickOne(['samurai', 'samuraiTosei'], random);
  const name = `${pickOne(['Ii', 'Honda', 'Shimazu', 'Kobayakawa', 'Ōtani', 'Ukita', 'Kuroda', 'Hosokawa', 'Katō', 'Fukushima', 'Konishi', 'Sanada'], random)} ${pickOne(['Naomasa', 'Tadakatsu', 'Yoshihiro', 'Hideaki', 'Yoshitsugu', 'Hideie', 'Nagamasa', 'Tadaoki', 'Kiyomasa', 'Masanori', 'Yukimura', 'Takatora'], random)}`;
  return builtLike({
    ...base, sex: 'male', name, style,
    outfit: { kind, design: randomDesign(kind, random), tint: side.tint, banner: side.banner },
    accessories: kind === 'ashigaru' ? [] : ['crest'],
  }, PERIOD_BUILD.japanese[ashigaru ? 'ashigaru' : 'samurai'], random);
}

/**
 * A Ming soldier: a garrison man in his padded coat and red wrap, a
 * brigandine man in his iron hat, or an elite in the long coat with the
 * chest mirror; built like the side's other men, in one of his armour's designs.
 */
export function mingSoldier(random = Math.random, style = 'spear', rank = 'garrison') {
  const base = varyCharacter(rank === 'elite' ? PRESETS.guandao : rank === 'brigandine' ? PRESETS.swordShield : PRESETS.mingSpear, random);
  const kind = { garrison: 'mingGarrison', brigandine: 'mingBrigandine', elite: 'mingElite' }[rank];
  const name = `${pickOne(['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Zhao', 'Huang', 'Zhou', 'Wu', 'Qi', 'Luo'], random)} ${pickOne(['Da', 'Er', 'San', 'Si', 'Wu', 'Liu', 'Hu', 'Bao', 'Shun', 'Gui', 'Fu', 'Ming'], random)}`;
  const soldier = { ...base, sex: 'male', name, style, outfit: { kind, design: randomDesign(kind, random) }, accessories: [] };
  return builtLike(soldier, PERIOD_BUILD.ming[rank], random);
}

/**
 * Builds of the late sixteenth century, by people and rank: mean height (cm)
 * and weight (kg), and training. Northern Chinese soldiers stood around
 * 166–171 cm; Japanese men of the period around 155–160 cm, lighter.
 * Each man varies by `CAST.height` cm and a few kilograms.
 */
const PERIOD_BUILD = {
  ming: { garrison: { heightCm: 166, weightKg: 64, exercise: 0.6 }, brigandine: { heightCm: 168, weightKg: 67, exercise: 0.68 }, elite: { heightCm: 171, weightKg: 71, exercise: 0.75 } },
  japanese: { ashigaru: { heightCm: 157, weightKg: 55, exercise: 0.6 }, samurai: { heightCm: 160, weightKg: 58, exercise: 0.7 } },
};

/** This man at a period's build: its height and training, give or take, fed to its weight. */
function builtLike(inputs, build, random) {
  const heightCm = Math.round(build.heightCm + jitter(random) * CAST.height * 0.6);
  const weightKg = build.weightKg * (heightCm / build.heightCm) ** 2 * (1 + jitter(random) * 0.06);
  const exercise = Math.min(1, Math.max(0.2, build.exercise + jitter(random) * 0.08));
  return atWeight({ ...inputs, heightCm, exercise }, weightKg);
}

/** A noble knight in full plate, named for his rank and house, with a long sword or a war hammer. */
export function nobleKnight(random = Math.random, style = 'longsword') {
  const base = varyCharacter(style === 'warhammer' ? PRESETS.warhammer : PRESETS.knight, random);
  const title = pickOne(['Sir', 'Sir', 'Lord'], random);
  const house = pickOne(['de Beauchamp', 'de Courtenay', 'de Mowbray', 'Montagu', 'de Vere', 'Fitzalan', 'Percy', 'Neville', 'de Clifford', 'Holland'], random);
  const first = pickOne(['Thomas', 'John', 'William', 'Hugh', 'Robert', 'Richard', 'Ralph', 'Guy', 'Henry', 'Walter'], random);
  return normaliseInputs({ ...base, sex: 'male', name: `${title} ${first} ${house}`, style, outfit: { kind: 'knight', design: randomDesign('knight', random) }, accessories: ['plume'] });
}

/** A foot soldier in whatever armour he has, with a spear, a bow, a long sword or a war hammer. */
export function footSoldier(random = Math.random, style = 'spear') {
  const base = varyCharacter(PRESETS.contender, random);
  const name = `${pickOne(['Will', 'Tom', 'Jack', 'Rob', 'Hal', 'Ned', 'Wat', 'Dick'], random)} ${pickOne(['Archer', 'Baker', 'Cotton', 'Fowler', 'Mason', 'Ward', 'Turner', 'Webb'], random)}`;
  return normaliseInputs({ ...base, sex: 'male', name, style, outfit: { kind: 'footman', design: randomDesign('footman', random) }, accessories: [] });
}
