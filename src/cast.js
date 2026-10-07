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
export function varyCharacter(inputs, random = Math.random, { sex: wanted = null } = {}) {
  const base = normaliseInputs(structuredClone(inputs));
  // `sex`: a body built as this sex from the start (an army's men), so its
  // height, weight, hair and beard follow from it rather than being overridden after.
  const sex = wanted ?? (random() < CAST.otherSex ? (base.sex === 'female' ? 'male' : 'female') : base.sex);
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
  return normaliseInputs(OUTFITS[kind]?.family || OUTFITS[kind]?.picked ? redress(varied, random) : varied);
}

/**
 * A drilled soldier of a regular army: the preset's man, varied in build
 * only (height, weight, age, fitness), his kit and looks those of his unit.
 * One look to a unit keeps a big army to a few crowd templates (bodies are
 * shared by look and rounded build), so it draws cheaply.
 */
export function drilledSoldier(preset, random = Math.random, { name = null } = {}) {
  const base = normaliseInputs(structuredClone(preset));
  return normaliseInputs({
    ...base,
    name: name ?? pickOne(CAST.names[base.sex], random),
    heightCm: Math.round(Math.min(200, Math.max(150, base.heightCm + jitter(random) * CAST.height))),
    calories: Math.round(base.calories * (1 + jitter(random) * CAST.calories)),
    age: Math.round(Math.min(45, Math.max(18, base.age + jitter(random) * CAST.age))),
    exercise: Math.min(1, Math.max(0.05, base.exercise + jitter(random) * CAST.exercise)),
  });
}

/**
 * The same fighter in another of his armour's designs, among those picked
 * for the game; with `anyKind`, in any armour of the same family (a knight
 * in plate, mail or brigandine). Headgear follows the armour.
 */
export function redress(inputs, random = Math.random, { anyKind = false } = {}) {
  const current = inputs.outfit?.kind;
  const family = OUTFITS[current]?.family;
  if (!family && !OUTFITS[current]?.picked) return inputs;
  // A character's own design (Kojima's oni armour) is his: not swapped for another.
  if (OUTFITS[current]?.designs[inputs.outfit?.design]?.special) return inputs;
  const kind = anyKind && family ? pickOne(familyKinds(family), random) : current;
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
export const GLADIATORS = ['thraex', 'hoplomachus', 'murmillo', 'retiarius', 'scissor', 'secutor', 'maximus', 'commodus', 'knight', 'warhammer', 'samurai', 'naginata', 'spear'];

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
export function randomGladiator(random = Math.random, key = pickOne(GLADIATORS, random)) {
  // Any armour of his kind's family, in one of its picked designs; a gladiator keeps his own kind's (it goes with his arms).
  const gladiator = OUTFITS[PRESETS[key].outfit?.kind]?.family === 'gladiator';
  return normaliseInputs(redress(varyCharacter(PRESETS[key], random), random, { anyKind: !gladiator }));
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
  const base = varyCharacter(PRESETS.knife, random, { sex: 'male' });
  const name = `${pickOne(['Kenji', 'Takeshi', 'Daisuke', 'Ryota', 'Shin', 'Hiroshi', 'Kazuo', 'Tetsu', 'Goro', 'Masa'], random)} ${pickOne(['Mori', 'Kuroda', 'Ishida', 'Sato', 'Ono', 'Fujita', 'Endo', 'Kanda'], random)}`;
  return normaliseInputs({ ...base, sex: 'male', name, style, outfit: { kind: 'yakuza', design: 0 }, accessories: random() < 0.4 ? ['hat'] : [], look: { ...base.look, skinTone: pickOne(['lightTan', 'medium', 'light'], random), hairColor: '#120d0a' } });
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
  const base = varyCharacter(ashigaru ? PRESETS.spear : PRESETS.samurai, random, { sex: 'male' });
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
export function mingSoldier(random = Math.random, style = 'spear', rank = 'garrison', { people = 'ming', design = null } = {}) {
  const base = varyCharacter(rank === 'elite' ? PRESETS.guandao : rank === 'brigandine' ? PRESETS.swordShield : PRESETS.mingSpear, random, { sex: 'male' });
  const kind = { garrison: 'mingGarrison', brigandine: 'mingBrigandine', elite: 'mingElite' }[rank];
  const name = `${pickOne(['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Zhao', 'Huang', 'Zhou', 'Wu', 'Qi', 'Luo'], random)} ${pickOne(['Da', 'Er', 'San', 'Si', 'Wu', 'Liu', 'Hu', 'Bao', 'Shun', 'Gui', 'Fu', 'Ming'], random)}`;
  const soldier = { ...base, sex: 'male', name, style, outfit: { kind, design: design ?? randomDesign(kind, random) }, accessories: [] };
  return builtLike(soldier, PERIOD_BUILD[people][rank], random);
}

/**
 * A Spanish conquistador of the 1510s–20s (or, `dutch`, a VOC soldier of
 * the 1660s in the same kit): a hidalgo in breastplate with the espada, a
 * rodelero with sword and buckler in quilted cotton, an arquebusier; the
 * Dutch a musketeer in a buff coat or a pikeman in breastplate and pot.
 */
export function europeanSoldier(random = Math.random, type = 'rodelero') {
  const kit = {
    hidalgo: ['conquistadorPlate', 'espada', [0, 1, 2, 4], 'spanish'],
    rodelero: ['conquistadorQuilted', 'espadaRodela', [0, 1, 2, 4], 'spanish'],
    arquebusier: ['conquistadorQuilted', 'matchlock', [0, 1, 2, 4], 'spanish'],
    pikeman: ['conquistadorPlate', 'spear', [3], 'dutch'],
    musketeer: ['conquistadorQuilted', 'matchlock', [3], 'dutch'],
    officer: ['conquistadorPlate', 'espada', [3], 'dutch'],
  }[type];
  const [kind, style, designs, people] = kit;
  const names = people === 'dutch'
    ? [['Jan', 'Pieter', 'Hendrik', 'Willem', 'Cornelis', 'Thomas', 'Jacob', 'Dirk'], ['Pedel', 'Coyett', 'de Vries', 'Jansen', 'van Dam', 'Bakker', 'Visser', 'de Graaf']]
    : [['Pedro', 'Gonzalo', 'Juan', 'Diego', 'Alonso', 'Andrés', 'Francisco', 'Hernán', 'Rodrigo', 'Martín'], ['de Alvarado', 'de Sandoval', 'de Olid', 'Díaz', 'de Ordaz', 'de Ávila', 'de Tapia', 'Velázquez', 'de Lugo', 'Núñez']];
  const base = varyCharacter(PRESETS.contender, random, { sex: 'male' });
  const soldier = { ...base, sex: 'male', name: `${pickOne(names[0], random)} ${pickOne(names[1], random)}`, style, outfit: { kind, design: pickOne(designs, random) }, accessories: [], look: { ...base.look, skinTone: pickOne(['light', 'lightTan'], random), facialHair: pickOne(['beard', 'mustache', 'stubble'], random) } };
  return builtLike(soldier, PERIOD_BUILD[people][type === 'hidalgo' || type === 'officer' ? 'officer' : 'soldier'], random);
}

/** A Mexica warrior (macuahuitl, tepoztopilli, bow), or one of the jaguar and eagle orders (`elite`). */
export function mexicaWarrior(random = Math.random, style = 'macuahuitl', rank = 'warrior', { people = null, band = null } = {}) {
  const kind = rank === 'elite' ? 'mexicaElite' : 'mexicaWarrior';
  const base = varyCharacter(PRESETS.contender, random, { sex: 'male' });
  // `people`: a city of his own (Tlaxcala, the Spaniards' ally), shown by his band's colour (`band`, a design).
  const city = people ? `of ${people}` : pickOne(['of Tlatelolco', 'of Tenochtitlan', 'of Texcoco', 'of Tlacopan', 'of Coyoacan'], random);
  const name = `${pickOne(['Cuauhtli', 'Ocelotl', 'Mazatl', 'Tochtli', 'Yaotl', 'Tecuani', 'Huitzil', 'Matlal', 'Coaxoch', 'Tenoch'], random)} ${city}`;
  const soldier = { ...base, sex: 'male', name, style, outfit: { kind, design: band ?? randomDesign(kind, random) }, accessories: [], look: { ...base.look, skinTone: pickOne(['tan', 'medium'], random), hairStyle: 'midLong', hairColor: '#120d0a', facialHair: 'none' } };
  return builtLike(soldier, PERIOD_BUILD.mexica[rank], random);
}

/** A masterless samurai (katana, naginata), unarmoured. */
export function roninWarrior(random = Math.random, style = 'katana') {
  const base = varyCharacter(PRESETS.samurai, random, { sex: 'male' });
  const name = `${pickOne(['Miyamoto', 'Sasaki', 'Ito', 'Okada', 'Mori', 'Kato', 'Abe', 'Ueda'], random)} ${pickOne(['Jubei', 'Kojiro', 'Gonbei', 'Sakon', 'Hanzo', 'Tadashi', 'Isamu', 'Genji'], random)}`;
  const soldier = { ...base, sex: 'male', name, style, outfit: { kind: 'ronin', design: randomDesign('ronin', random) }, accessories: [] };
  return builtLike(soldier, PERIOD_BUILD.japanese.ronin, random);
}

// What a sea raider has on (shares, summing to 1): most nothing but a robe
// or a loincloth; some a piece of samurai armour; a few the whole of it.
const WOKOU_KIT = { none: 0.62, piece: 0.26, ashigaru: 0.07, samurai: 0.05 };

/**
 * A sea raider of the 1550s (wokou): Chinese (dao, spear, matchlock) or
 * Japanese (katana, naginata, bow), `people`. Most go barefoot in a robe or
 * a loincloth; some in a captured dō-maru; a few in full armour.
 */
export function wokouRaider(random = Math.random, style = 'dao', people = 'chinese') {
  const japanese = people === 'japanese';
  const base = varyCharacter(japanese ? PRESETS.samurai : PRESETS.mingDao, random, { sex: 'male' });
  const name = japanese
    ? `${pickOne(['Miyamoto', 'Sasaki', 'Ito', 'Okada', 'Mori', 'Kato', 'Abe', 'Ueda'], random)} ${pickOne(['Jubei', 'Kojiro', 'Gonbei', 'Sakon', 'Hanzo', 'Tadashi', 'Isamu', 'Genji'], random)}`
    : `${pickOne(['Xu', 'Wang', 'Lin', 'Chen', 'Huang', 'Ye', 'Mao', 'Hong'], random)} ${pickOne(['Hai', 'Zhi', 'Dong', 'Ma', 'San', 'Bao', 'Lang', 'Shan'], random)}`;
  const roll = random();
  const kind = roll < WOKOU_KIT.none ? 'wokou' : roll < WOKOU_KIT.none + WOKOU_KIT.piece ? 'wokouArmoured' : roll < 1 - WOKOU_KIT.samurai ? 'ashigaru' : 'samurai';
  const soldier = { ...base, sex: 'male', name, style, outfit: { kind, design: randomDesign(kind, random) }, accessories: [] };
  return builtLike(soldier, japanese ? PERIOD_BUILD.japanese.ronin : PERIOD_BUILD.mingSouth.raider, random);
}

/**
 * Builds of the late sixteenth century, by people and rank: mean height (cm)
 * and weight (kg), and training. Northern Chinese soldiers stood around
 * 166–171 cm; Japanese men of the period around 155–160 cm, lighter.
 * Each man varies by `CAST.height` cm and a few kilograms.
 */
const PERIOD_BUILD = {
  ming: { garrison: { heightCm: 166, weightKg: 64, exercise: 0.6 }, brigandine: { heightCm: 168, weightKg: 67, exercise: 0.68 }, elite: { heightCm: 171, weightKg: 71, exercise: 0.75 } },
  // Southern Chinese (Zhejiang, Fujian) stood a little shorter than northern
  // men. Koxinga picked his "iron men" by strength (they had to lift a stone
  // lion): his elite is the big men of his army.
  mingSouth: { garrison: { heightCm: 163, weightKg: 59, exercise: 0.55 }, brigandine: { heightCm: 165, weightKg: 62, exercise: 0.65 }, elite: { heightCm: 170, weightKg: 70, exercise: 0.8 }, raider: { heightCm: 163, weightKg: 58, exercise: 0.6 } },
  japanese: { ashigaru: { heightCm: 157, weightKg: 55, exercise: 0.6 }, samurai: { heightCm: 160, weightKg: 58, exercise: 0.7 }, ronin: { heightCm: 158, weightKg: 56, exercise: 0.75 } },
  // Castilian men of the early 1500s about 165 cm; the Mexica a few
  // centimetres shorter, lean, trained for war from youth in the telpochcalli.
  spanish: { soldier: { heightCm: 165, weightKg: 63, exercise: 0.7 }, officer: { heightCm: 167, weightKg: 66, exercise: 0.72 } },
  mexica: { warrior: { heightCm: 160, weightKg: 58, exercise: 0.72 }, elite: { heightCm: 162, weightKg: 60, exercise: 0.82 } },
  // The Hospitaller knights at Rhodes, nobles of France, Spain, Italy and England, fed and trained
  // from boyhood; their sergeants and gunners. Ottoman soldiers of the 1500s
  // about 165–168 cm; the Janissaries picked young (the devşirme) for build.
  hospitaller: { knight: { heightCm: 170, weightKg: 71, exercise: 0.75 }, sergeant: { heightCm: 167, weightKg: 66, exercise: 0.65 } },
  ottoman: { azap: { heightCm: 165, weightKg: 60, exercise: 0.6 }, janissary: { heightCm: 169, weightKg: 65, exercise: 0.8 }, heavy: { heightCm: 168, weightKg: 67, exercise: 0.75 } },
  // Medieval Mongol and Oirat men, from skeletons about 163–167 cm, lean and hard.
  steppe: { light: { heightCm: 164, weightKg: 60, exercise: 0.75 }, medium: { heightCm: 165, weightKg: 62, exercise: 0.75 }, heavy: { heightCm: 167, weightKg: 66, exercise: 0.78 } },
  // Dutch soldiers of the 1660s, among Europe's taller men then.
  dutch: { soldier: { heightCm: 168, weightKg: 65, exercise: 0.6 }, officer: { heightCm: 170, weightKg: 68, exercise: 0.6 } },
};

/** A knight of St John (in plate, sword or hammer) or one of the Order's sergeants (in mail, spear or gun). */
export function hospitaller(random = Math.random, style = 'longsword', rank = 'knight') {
  const knightly = rank === 'knight';
  const base = varyCharacter(knightly ? (style === 'warhammer' ? PRESETS.warhammer : PRESETS.knight) : PRESETS.contender, random, { sex: 'male' });
  const name = `${knightly ? 'Fra' : pickOne(['Sergeant', 'Brother'], random)} ${pickOne(['Jean', 'Gabriele', 'Antoine', 'Juan', 'Thomas', 'Pierre', 'Andrea', 'Nicholas', 'Diego', 'Louis'], random)} ${pickOne(['de Lorgue', 'Tadini', 'de Bidoux', 'de Barbaran', 'Docwra', 'de Grolée', 'Martinengo', 'Hussey', 'de Toledo', 'de Morel'], random)}`;
  const kind = knightly ? 'knight' : 'footman';
  const soldier = { ...base, sex: 'male', name, style, outfit: { kind, design: knightly ? randomDesign(kind, random) : style === 'matchlock' ? 1 : 0 }, accessories: knightly ? ['plume'] : [] };
  return builtLike(soldier, PERIOD_BUILD.hospitaller[rank], random);
}

/** An Ottoman soldier: an azap, a Janissary or a heavy man in mail-and-plate. */
export function ottomanSoldier(random = Math.random, style = 'yatagan', rank = 'janissary') {
  const kind = { azap: 'azap', janissary: 'janissary', heavy: 'ottomanHeavy' }[rank];
  const base = varyCharacter(rank === 'heavy' ? PRESETS.sipahi : rank === 'azap' ? PRESETS.azap : PRESETS.yatagan, random, { sex: 'male' });
  const name = `${pickOne(['Mehmed', 'Ahmed', 'Mustafa', 'Hasan', 'Hüseyin', 'Ali', 'Yusuf', 'İbrahim', 'Süleyman', 'Osman', 'Davud', 'İskender'], random)} ${rank === 'janissary' ? pickOne(['Ağa', 'Çavuş', 'Bölükbaşı', ''], random) : ''}`.trim();
  return builtLike({ ...base, sex: 'male', name, style, outfit: { kind, design: randomDesign(kind, random) }, accessories: [] }, PERIOD_BUILD.ottoman[rank], random);
}

/** A steppe warrior of the 1400s: an archer in his deel, a man in leather lamellar, an iron-clad lancer. */
export function steppeWarrior(random = Math.random, style = 'steppeBow', rank = 'light') {
  const kind = { light: 'steppeLight', medium: 'steppeMedium', heavy: 'steppeHeavy' }[rank];
  const base = varyCharacter(rank === 'heavy' ? PRESETS.maceShield : rank === 'medium' ? PRESETS.saberShield : PRESETS.steppeBow, random, { sex: 'male' });
  const name = pickOne(['Batu', 'Bayar', 'Ganbold', 'Temür', 'Toghon', 'Bolad', 'Arslan', 'Esen', 'Sübe', 'Khasar', 'Jochi', 'Mönke'], random);
  return builtLike({ ...base, sex: 'male', name, style, outfit: { kind, design: randomDesign(kind, random) }, accessories: [] }, PERIOD_BUILD.steppe[rank], random);
}

/** This man at a period's build: its height and training, give or take, fed to its weight. */
function builtLike(inputs, build, random) {
  const heightCm = Math.round(build.heightCm + jitter(random) * CAST.height * 0.6);
  const weightKg = build.weightKg * (heightCm / build.heightCm) ** 2 * (1 + jitter(random) * 0.06);
  const exercise = Math.min(1, Math.max(0.2, build.exercise + jitter(random) * 0.08));
  return atWeight({ ...inputs, heightCm, exercise }, weightKg);
}

/** A noble knight in full plate, named for his rank and house, with a long sword or a war hammer. */
export function nobleKnight(random = Math.random, style = 'longsword') {
  const base = varyCharacter(style === 'warhammer' ? PRESETS.warhammer : PRESETS.knight, random, { sex: 'male' });
  const title = pickOne(['Sir', 'Sir', 'Lord'], random);
  const house = pickOne(['de Beauchamp', 'de Courtenay', 'de Mowbray', 'Montagu', 'de Vere', 'Fitzalan', 'Percy', 'Neville', 'de Clifford', 'Holland'], random);
  const first = pickOne(['Thomas', 'John', 'William', 'Hugh', 'Robert', 'Richard', 'Ralph', 'Guy', 'Henry', 'Walter'], random);
  return normaliseInputs({ ...base, sex: 'male', name: `${title} ${first} ${house}`, style, outfit: { kind: 'knight', design: randomDesign('knight', random) }, accessories: ['plume'] });
}

/** A foot soldier in whatever armour he has, with a spear, a bow, a long sword or a war hammer. */
export function footSoldier(random = Math.random, style = 'spear') {
  const base = varyCharacter(PRESETS.contender, random, { sex: 'male' });
  const name = `${pickOne(['Will', 'Tom', 'Jack', 'Rob', 'Hal', 'Ned', 'Wat', 'Dick'], random)} ${pickOne(['Archer', 'Baker', 'Cotton', 'Fowler', 'Mason', 'Ward', 'Turner', 'Webb'], random)}`;
  return normaliseInputs({ ...base, sex: 'male', name, style, outfit: { kind: 'footman', design: randomDesign('footman', random) }, accessories: [] });
}
