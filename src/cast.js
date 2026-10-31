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
  // A skill of his own stays his; otherwise it is his kit's (normaliseInputs), whatever kit he is put in.
  if (inputs.skill === undefined) delete varied.skill;
  // Someone like a hero is not the hero.
  delete varied.hero;
  const kind = varied.outfit?.kind;
  if (kind) varied.outfit = { ...varied.outfit, colors: randomColors(kind, random) };
  const dressed = normaliseInputs(OUTFITS[kind]?.family || OUTFITS[kind]?.picked ? redress(varied, random) : varied);
  if (inputs.skill === undefined) delete dressed.skill;
  return dressed;
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

// The characters dealt at random: all but those kept for their own places (`undealt`: the starved rebel).
const DEALT = Object.values(PRESETS).filter((preset) => !preset.undealt);

/** Anyone at all: one of the characters, made a little different. */
export function randomCharacter(random = Math.random) {
  return varyCharacter(pickOne(DEALT, random), random);
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
export const GLADIATORS = ['thraex', 'hoplomachus', 'murmillo', 'retiarius', 'scissor', 'secutor', 'maximus', 'commodus', 'knight', 'warhammer', 'samurai', 'naginata', 'yari'];

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
 * A rebel peasant: a commoner with a pitchfork, anyone from a boy to a greybeard,
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

// The starved rebels: a peasant's name and byname; their builds (BMI, and how hard they still work: `exercise`), the share of
// them with rag-wrapped feet (design 1) or a head wrap, and which sleeve is gone ('both' and 'none' the rarer).
const STARVED = {
  first: ['Wat', 'Hob', 'Jack', 'Tom', 'Will', 'Hal', 'Ned', 'Dick', 'Piers', 'Roger', 'Simkin', 'Gib', 'Jankin', 'Hodge', 'Col', 'Adam'],
  by: ['Thatcher', 'Reaper', 'Ploughman', 'Shepherd', 'Hayward', 'Gleaner', 'Carter', 'Thresher', 'Ditcher', 'Lean', 'Crust', 'Hollow'],
  bmi: [14, 15.5],
  exercise: [0.1, 0.3],
  height: [160, 175],
  age: [18, 60],
  skill: [0.05, 0.2],
  wrappedFeet: 0.4,
  headWrap: 0.25,
  sleeve: ['l', 'r', 'l', 'r', 'both', 'none'],
  tear: [0.6, 1],
  skinTone: ['light', 'light', 'lightTan', 'medium'],
  hairColor: ['#120d0a', '#2a1a10', '#4a3a2a', '#6b4a2a', '#8a6a3a'],
  greyHair: ['#8d8d8d', '#a8a49c'],
  hair: ['midLong', 'midLong', 'long', 'cleanShort'],
  facialHair: ['beard', 'beard', 'stubble', 'longBeard', 'mustache'],
};

/**
 * A starving rebel (built on the Starved Rebel, PRESETS.starved): anyone from a lad of eighteen to a greybeard of sixty,
 * 160–175 cm, starved to a BMI of 14–15.5 (fed the calories that settle there), with next to no drill; in his own rags: the
 * shirt's faded colour, how much of it is torn away and which sleeve is gone, bare or rag-wrapped feet; long unkempt hair
 * (grey with the years, or gone), a beard or a few days' growth.
 */
export function starvedRebel(random = Math.random) {
  const base = normaliseInputs(structuredClone(PRESETS.starved));
  const span = ([low, high]) => low + random() * (high - low);
  const age = Math.round(span(STARVED.age));
  const heightCm = Math.round(span(STARVED.height));
  const bmi = span(STARVED.bmi);
  const grey = random() < (age - 40) / 25;
  const man = normaliseInputs({
    ...base,
    name: `${pickOne(STARVED.first, random)} ${pickOne(STARVED.by, random)}`,
    age, heightCm,
    exercise: Math.round(span(STARVED.exercise) * 100) / 100,
    skill: Math.round(span(STARVED.skill) * 100) / 100,
    outfit: {
      kind: 'rags', design: random() < STARVED.wrappedFeet ? 1 : 0, colors: randomColors('rags', random),
      tear: { seed: Math.floor(random() * 1000), amount: Math.round(span(STARVED.tear) * 100) / 100, sleeve: pickOne(STARVED.sleeve, random) },
    },
    accessories: random() < STARVED.headWrap ? ['headWrap'] : [],
    look: {
      ...base.look,
      skinTone: pickOne(STARVED.skinTone, random),
      hairColor: pickOne(grey ? STARVED.greyHair : STARVED.hairColor, random),
      hairStyle: age > 40 && random() < 0.25 ? 'bald' : pickOne(STARVED.hair, random),
      facialHair: pickOne(STARVED.facialHair, random),
      eyeColor: pickOne(CAST.looks.eyeColor, random),
    },
  });
  man.calories = Math.round(caloriesForWeight(man, bmi * (heightCm / 100) ** 2, (FRAMES[man.frame] ?? FRAMES.medium).lean));
  return man;
}

/** A SWAT officer: armed with a pistol or a baton, in the full kit. */
export function swatOfficer(random = Math.random, style = 'handgun') {
  const base = varyCharacter(style === 'handgun' ? PRESETS.handgun : PRESETS.baton, random);
  return normaliseInputs({ ...base, name: `${pickOne(['Officer', 'Sgt.', 'Cpl.'], random)} ${pickOne(['Reyes', 'Cole', 'Novak', 'Burke', 'Ortiz', 'Hale', 'Kowalski', 'Price', 'Walsh', 'Okafor'], random)}`, style, outfit: { kind: 'swat', design: 0 } });
}

/**
 * A modern infantry rifleman: the M4 (the AR-15 family), the combat uniform, helmet and plate carrier in one of its
 * camouflages, and the one frag grenade his kit carries (outfits.js infantry `throwable`).
 */
export function infantrySoldier(random = Math.random) {
  const base = varyCharacter(PRESETS.infantry, random);
  const name = `${pickOne(['Pvt.', 'PFC', 'Spc.', 'Cpl.', 'Sgt.'], random)} ${pickOne(['Herrera', 'Miller', 'Johnson', 'Nguyen', 'Davis', 'Garcia', 'Wright', 'Kim', 'Thompson', 'Jackson', 'Lopez', 'Carter'], random)}`;
  return normaliseInputs({ ...base, name, style: 'rifle', outfit: { kind: 'infantry', design: randomDesign('infantry', random) } });
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
  // A Japanese spear is a yari.
  if (style === 'spear') style = 'yari';
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

/**
 * A masterless samurai (katana, naginata) in odd pieces of armour; light on
 * his feet, he comes on at a run (`charging`). A swordsman among them fights
 * with both his swords (`RONIN_TWO_SWORDS` of them: nitō), as Musashi taught.
 */
export function roninWarrior(random = Math.random, style = 'ronin') {
  const base = varyCharacter(PRESETS.samurai, random, { sex: 'male' });
  const name = `${pickOne(['Miyamoto', 'Sasaki', 'Ito', 'Okada', 'Mori', 'Kato', 'Abe', 'Ueda'], random)} ${pickOne(['Jubei', 'Kojiro', 'Gonbei', 'Sakon', 'Hanzo', 'Tadashi', 'Isamu', 'Genji'], random)}`;
  const soldier = { ...base, sex: 'male', name, style, outfit: { kind: 'ronin', design: randomDesign('ronin', random) }, accessories: ['kasa'], charging: RONIN_CHARGING };
  const built = builtLike(soldier, PERIOD_BUILD.japanese.ronin, random);
  return style === 'ronin' && random() < RONIN_TWO_SWORDS ? { ...built, style: 'nito' } : built;
}

// What a sea raider has on (shares, summing to 1): many nothing but a robe
// or a loincloth; many a piece of armour taken in earlier raids; some the
// whole of it (the big bands of the 1550s were well equipped from plunder).
const WOKOU_KIT = { none: 0.45, piece: 0.36, ashigaru: 0.11, samurai: 0.08 };

// Raiders come on at a run and throw themselves in: the charge sooner, and more eagerly (AI `charging`).
const RAIDER_CHARGING = 2;
// A rōnin closes faster still: lean, fit (PERIOD_BUILD), lightly armoured, he goes in at a run and throws himself on.
const RONIN_CHARGING = 2.5;
// The share of rōnin swordsmen who fight with two swords: Niten Ichi-ryū was
// one school among many (and the katana in one hand wants a strong arm), so a
// third, not all.
const RONIN_TWO_SWORDS = 1 / 3;

/**
 * A samurai gone raiding (the wokou level's band): a man of the class in his
 * own armour and with his own swords (sengokuWarrior), under no lord's colours
 * (`side`: no tint, no banner), who comes on at a run as the raiders do.
 */
export function wokouSamurai(random = Math.random, style = 'katana', side = { tint: null, banner: null }) {
  return { ...sengokuWarrior(random, side, style, 'samurai'), charging: RAIDER_CHARGING };
}

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
  const soldier = { ...base, sex: 'male', name, style, outfit: { kind, design: randomDesign(kind, random) }, accessories: [], charging: RAIDER_CHARGING };
  return builtLike(soldier, japanese ? PERIOD_BUILD.japanese.raider : PERIOD_BUILD.mingSouth.raider, random);
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
  // Sea raiders: short, thick men of the boats and the oar, heavy for their height.
  mingSouth: { garrison: { heightCm: 163, weightKg: 59, exercise: 0.55 }, brigandine: { heightCm: 165, weightKg: 62, exercise: 0.65 }, elite: { heightCm: 170, weightKg: 70, exercise: 0.8 }, raider: { heightCm: 160, weightKg: 64, exercise: 0.66 } },
  // Qi Jiguang's army (1559 on): not the weisuo's hereditary men but Yiwu
  // miners and hill farmers he recruited himself, after seeing the Yiwu men
  // fight the silver-mine feud of 1558. He chose them for it (the Jixiao
  // xinshu wants countrymen, strong and plain, and turns away the quick-
  // talking men of the towns), fed and paid them, and drilled them daily
  // with weapon and shield: a few kilograms heavier than the coast's other
  // regulars (mingSouth brigandine, 165 cm 62 kg), of the same height, and
  // harder worked (`exercise`). And trained: `skill` (body.js; their kit,
  // the brigandine's, is 0.35, a regular's) half again, a man who has struck
  // and parried at the post every day for a year, short of the 0.45 of a
  // professional elite. His guards are his household men, as Koxinga's elite.
  qi: { brigandine: { heightCm: 165, weightKg: 65, exercise: 0.8, skill: 0.5 }, elite: { heightCm: 170, weightKg: 70, exercise: 0.8, skill: 0.55 } },
  // The weisuo garrisons of the Zhejiang coast in the 1550s, as the raids found them: hereditary soldier households, unpaid, their men
  // worked as servants by their officers, the able-bodied long run off. What was left to muster was a mixed lot, drawn by `mix`
  // ([share, what differs from the rest of the build]): the household soldiers, grown men in their twenties and thirties, lean and
  // little drilled; the old, men in their late forties and fifties and past sixty, stooped, their wind and their joints half gone,
  // kept on the rolls for their fathers' sake; and the thin, underfed boys and young men, small, light and hardly exercised (a
  // bad year's hunger takes strength and wind, body.js: a body below its healthy weight is older than its years), taught
  // nothing (`skill`, the levy's). Half again the usual spread of height and weight (`spread`). The few regulars among them are as Koxinga's (mingSouth).
  mingCoast: {
    garrison: {
      heightCm: 162, weightKg: 54, exercise: 0.45, spread: 1.5,
      mix: [
        [0.4, { ages: [[1, 22, 40]] }],
        [0.3, { ages: [[1, 47, 66]], exercise: 0.35 }],
        [0.3, { ages: [[1, 16, 30]], heightCm: 156, weightKg: 45, exercise: 0.3, skill: 0.15 }],
      ],
    },
    brigandine: { heightCm: 165, weightKg: 62, exercise: 0.65 },
  },
  japanese: { ashigaru: { heightCm: 157, weightKg: 55, exercise: 0.6 }, samurai: { heightCm: 160, weightKg: 58, exercise: 0.7 }, ronin: { heightCm: 158, weightKg: 60, exercise: 0.92 }, raider: { heightCm: 155, weightKg: 60, exercise: 0.72 } },
  // Castilian men of the early 1500s about 165 cm; the Mexica a few
  // centimetres shorter, lean, trained for war from youth in the telpochcalli.
  // The men who crossed to the Indies were picked and hardened (veterans of
  // Italy, hidalgos raised to arms): a little above the Castilian mean, and strong.
  spanish: { soldier: { heightCm: 168, weightKg: 70, exercise: 0.76 }, officer: { heightCm: 170, weightKg: 73, exercise: 0.78 } },
  mexica: { warrior: { heightCm: 160, weightKg: 58, exercise: 0.72 }, elite: { heightCm: 162, weightKg: 60, exercise: 0.82 } },
  // Andean men of the Inca period: from highland skeletons about 157–160 cm,
  // short and stocky, broad and deep in the chest (bodies made at 2,700 m and
  // more), heavy for their height. The commons (hatun runa) carried, built and
  // walked the roads under the mit'a; the litter's bearers (the Lucanas) were
  // picked for it. The lords of the Inca's lineage ate better and were trained
  // to arms in their youth (the warachikuy): a little taller and fitter.
  inca: { commoner: { heightCm: 157, weightKg: 62, exercise: 0.7 }, noble: { heightCm: 160, weightKg: 65, exercise: 0.74 } },
  // The Hospitaller knights at Rhodes, nobles of France, Spain, Italy and England, fed and trained
  // from boyhood; their sergeants and gunners. Ottoman soldiers of the 1500s
  // about 165–168 cm; the Janissaries picked young (the devşirme) for build.
  hospitaller: { knight: { heightCm: 170, weightKg: 71, exercise: 0.75 }, sergeant: { heightCm: 167, weightKg: 66, exercise: 0.65 } },
  ottoman: { azap: { heightCm: 165, weightKg: 60, exercise: 0.6 }, janissary: { heightCm: 169, weightKg: 65, exercise: 0.8 }, heavy: { heightCm: 168, weightKg: 67, exercise: 0.75 } },
  // Medieval Mongol and Oirat men, from skeletons about 163–167 cm, lean and hard.
  // Steppe men: short and squat, heavy for their height (riders' bodies, fed on meat and milk).
  steppe: { light: { heightCm: 164, weightKg: 84, exercise: 0.7 }, medium: { heightCm: 165, weightKg: 89, exercise: 0.66 }, heavy: { heightCm: 167, weightKg: 95, exercise: 0.62 } },
  // Dutch soldiers of the 1660s, among Europe's taller men then.
  dutch: { soldier: { heightCm: 168, weightKg: 65, exercise: 0.6 }, officer: { heightCm: 170, weightKg: 68, exercise: 0.6 } },
};

// ---- The Inca at Cajamarca (scenarios.js cajamarca) ----

// Quechua names, given and second: the sky, the beasts, the stone.
const INCA_NAMES = [
  ['Waman', 'Kusi', 'Titu', 'Amaru', 'Rumi', 'Wayna', 'Sinchi', 'Kuntur', 'Puma', 'Illapa', 'Atoq', 'Wari'],
  ['Yupanki', 'Kapaq', 'Rimachi', 'Paukar', 'Sullka', 'Tupaq', 'Maywa', 'Chalco', 'Quispe', 'Mayta', 'Wallpa', 'Rawa'],
];

/**
 * A man of Atahualpa's retinue: one of the commons (`commoner`: bearer,
 * sweeper, attendant, guard, in the uncu) or a lord of the Inca's lineage
 * (`noble`: the tocapu band and the gold earspools), most of them unarmed
 * (`unskilled`: he fights, if he must, with his hands), some with the champi;
 * hair cropped short, no beard to speak of. `design`: one of the kit's.
 */
export function incaMan(random = Math.random, style = 'unskilled', rank = 'commoner', { design = null } = {}) {
  const kind = rank === 'noble' ? 'incaNoble' : 'incaUncu';
  const base = varyCharacter(PRESETS.contender, random, { sex: 'male' });
  const name = `${pickOne(INCA_NAMES[0], random)} ${pickOne(INCA_NAMES[1], random)}`;
  const man = { ...base, sex: 'male', name, style, outfit: { kind, design: design ?? randomDesign(kind, random) }, accessories: [], look: { ...base.look, skinTone: pickOne(['tan', 'medium', 'tan'], random), hairStyle: 'cleanShort', hairColor: '#120d0a', facialHair: 'none' } };
  return builtLike(man, PERIOD_BUILD.inca[rank], random);
}

// Atahualpa as the Spaniards saw him in 1532 (Xerez, Pedro Pizarro): about
// thirty, well made and somewhat stout, grave; in the royal tocapu and the
// mascapaicha (the incaNoble kit's Sapa Inca design). He leads his people
// (`leads`): they keep round him, and his fall is theirs.
const ATAHUALPA = { age: 30, heightCm: 165, weightKg: 72, design: 4 };

/** Atahualpa, the Sapa Inca: unarmed among his lords. */
export function atahualpa(random = Math.random) {
  const man = incaMan(random, 'unskilled', 'noble', { design: ATAHUALPA.design });
  return atWeight({ ...man, name: 'Atahualpa', age: ATAHUALPA.age, heightCm: ATAHUALPA.heightCm, leads: true }, ATAHUALPA.weightKg);
}

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

/** A steppe warrior of the 1400s: an archer in his deel, a man in leather lamellar (a heavier man in the same). */
export function steppeWarrior(random = Math.random, style = 'steppeBow', rank = 'light') {
  const kind = { light: 'steppeLight', medium: 'steppeMedium', heavy: 'steppeMedium' }[rank];
  const base = varyCharacter(rank === 'heavy' ? PRESETS.maceShield : rank === 'medium' ? PRESETS.saberShield : PRESETS.steppeBow, random, { sex: 'male' });
  const name = pickOne(['Batu', 'Bayar', 'Ganbold', 'Temür', 'Toghon', 'Bolad', 'Arslan', 'Esen', 'Sübe', 'Khasar', 'Jochi', 'Mönke'], random);
  return builtLike({ ...base, sex: 'male', name, style, outfit: { kind, design: randomDesign(kind, random) }, accessories: [] }, PERIOD_BUILD.steppe[rank], random);
}

/** This man at a period's build: its height and training, give or take, fed to its weight. */
function builtLike(inputs, kind, random) {
  // A build that gives a `mix` is of several kinds of man: one is drawn first (a build without one draws nothing, so every other army is cast as before).
  const build = kind.mix ? { ...kind, ...pickByShare(kind.mix, random) } : kind;
  const spread = build.spread ?? 1;
  const heightCm = Math.round(build.heightCm + jitter(random) * CAST.height * 0.6 * spread);
  const weightKg = build.weightKg * (heightCm / build.heightCm) ** 2 * (1 + jitter(random) * 0.06 * spread);
  const exercise = Math.min(1, Math.max(0.2, build.exercise + jitter(random) * 0.08));
  // (Drawn only for a build that gives ages, after the rest, so every other army is cast as before.)
  const age = build.ages ? ageFrom(build.ages, random) : inputs.age;
  // A build that gives a `skill` trains its men past their kit's (Qi Jiguang's): drawn from nothing, so the rest are cast as before.
  const skill = build.skill ?? inputs.skill;
  return atWeight({ ...inputs, heightCm, exercise, age, ...(skill === undefined ? {} : { skill }) }, weightKg);
}

/** One of [share, value] pairs, by its share. */
function pickByShare(pairs, random) {
  let roll = random() * pairs.reduce((sum, [share]) => sum + share, 0);
  for (const [share, value] of pairs) {
    if (roll < share) return value;
    roll -= share;
  }
  return pairs[pairs.length - 1][1];
}

/** An age (whole years) from `ages`, [share, from, to] bands. */
function ageFrom(ages, random) {
  let roll = random() * ages.reduce((sum, [share]) => sum + share, 0);
  for (const [share, from, to] of ages) {
    if (roll < share) return Math.round(from + random() * (to - from));
    roll -= share;
  }
  const [, from, to] = ages[ages.length - 1];
  return Math.round(from + random() * (to - from));
}

// ---- Horsemen: the wings of the battle maps (scenarios.js `wings`) ----

/**
 * A mounted samurai of one side at Sekigahara (a samurai in ō-yoroi or tōsei
 * gusoku on his Japanese horse: the ashigaru went on foot), with the yari, the
 * katana or the yumi, in the side's colours.
 */
export function samuraiHorseman(random = Math.random, side, style = 'yari') {
  return { ...sengokuWarrior(random, side, style, 'samurai'), mounted: true };
}

/**
 * A horseman of the Ming army (Li Rusong's Liaodong horse): northern heavy cavalry
 * in iron lamellar to the knees on a steppe horse, with the dao, a spear or a
 * three-eyed gun (sanyanchong), built like the army's elite.
 */
export function mingHorseman(random = Math.random, style = 'dao') {
  const kind = 'mingIronLamellar';
  const base = varyCharacter(PRESETS.guandao, random, { sex: 'male' });
  const name = `${pickOne(['Li', 'Zhang', 'Wang', 'Zhu', 'Ma', 'Sun', 'Qian', 'Xu', 'Tang', 'Gao', 'Shen', 'Yu'], random)} ${pickOne(['Biao', 'Yong', 'Zhen', 'Hu', 'Fei', 'Cheng', 'Guo', 'Kai', 'Lei', 'Meng', 'Tai', 'Wei'], random)}`;
  const soldier = { ...base, sex: 'male', name, style, outfit: { kind, design: randomDesign(kind, random) }, accessories: [], mounted: true };
  return builtLike(soldier, PERIOD_BUILD.ming.elite, random);
}

/**
 * A Spanish horseman of Cortés's cavalry in 1520 (a jinete or a caballero in
 * breastplate and morion on an Andalusian horse): with the lance, as the horse
 * charged at Otumba (1520) and burst out on the square at Cajamarca (1532), or the espada.
 */
export function conquistadorHorseman(random = Math.random, style = 'lance') {
  return { ...europeanSoldier(random, 'hidalgo'), style, mounted: true };
}

/**
 * A trooper of a Roman auxiliary cavalry wing (ala), the early Empire's: a Gaul,
 * Thracian or Batavian, in mail on a riding horse of his own, with the spatha (a
 * long sword) or the cavalry spear (hasta).
 */
export function romanHorseman(random = Math.random, style = 'longsword') {
  const base = drilledSoldier(PRESETS.legionary, random);
  const name = `${pickOne(['Gaius', 'Lucius', 'Quintus', 'Marcus', 'Titus', 'Aulus'], random)} ${pickOne(['Julius Vindex', 'Flavius Sabinus', 'Ulpius Atto', 'Claudius Bato', 'Valerius Dacus', 'Aelius Verax'], random)}`;
  return normaliseInputs({ ...base, name, style, outfit: { kind: 'romanAuxiliary', design: randomDesign('romanAuxiliary', random) }, accessories: [], mounted: true });
}

/**
 * A Han horseman of the frontier army: iron lamellar, on a Ferghana-bred horse,
 * with the dao, the long spear or (the horse archer) the composite bow.
 */
export function hanHorseman(random = Math.random, style = 'dao') {
  const base = drilledSoldier(PRESETS.hanCrossbow, random);
  const name = `${pickOne(['Li', 'Zhao', 'Han', 'Gongsun', 'Lu', 'Cheng', 'Su', 'Wei'], random)} ${pickOne(['Guang', 'Qing', 'Chong', 'Ping', 'Gan', 'Jian', 'Bo', 'Xiang'], random)}`;
  return normaliseInputs({ ...base, name, style, outfit: { kind: 'hanCavalry', design: 0 }, accessories: [], mounted: true });
}

/** A noble knight in full plate, named for his rank and house, with a long sword or a war hammer. */
export function nobleKnight(random = Math.random, style = 'longsword') {
  const base = varyCharacter(style === 'warhammer' ? PRESETS.warhammer : PRESETS.knight, random, { sex: 'male' });
  const title = pickOne(['Sir', 'Sir', 'Lord'], random);
  const house = pickOne(['de Beauchamp', 'de Courtenay', 'de Mowbray', 'Montagu', 'de Vere', 'Fitzalan', 'Percy', 'Neville', 'de Clifford', 'Holland'], random);
  const first = pickOne(['Thomas', 'John', 'William', 'Hugh', 'Robert', 'Richard', 'Ralph', 'Guy', 'Henry', 'Walter'], random);
  return normaliseInputs({ ...base, sex: 'male', name: `${title} ${first} ${house}`, style, outfit: { kind: 'knight', design: randomDesign('knight', random) }, accessories: ['plume'] });
}

/** A noble knight arriving mounted: on his destrier, in plate barding. */
export function mountedKnight(random = Math.random, style = 'longsword') {
  return { ...nobleKnight(random, style), mounted: true };
}

/** A foot soldier in whatever armour he has, with a spear, a bow, a long sword or a war hammer. */
export function footSoldier(random = Math.random, style = 'spear') {
  const base = varyCharacter(PRESETS.contender, random, { sex: 'male' });
  const name = `${pickOne(['Will', 'Tom', 'Jack', 'Rob', 'Hal', 'Ned', 'Wat', 'Dick'], random)} ${pickOne(['Archer', 'Baker', 'Cotton', 'Fowler', 'Mason', 'Ward', 'Turner', 'Webb'], random)}`;
  return normaliseInputs({ ...base, sex: 'male', name, style, outfit: { kind: 'footman', design: randomDesign('footman', random) }, accessories: [] });
}

// ---- Late antiquity and the horse peoples (Battle Mode: Mobei, 119 BC; Carrhae, 53 BC; the Catalaunian Plains, 451) ----

/**
 * Builds of the men of these battles, by people and rank, as builtLike takes
 * them (mean height cm, weight kg, training). From the graves: Xiongnu men of
 * the Egiin Gol and Duurlig Nars cemeteries ~165 cm; Hunnic-period men of the
 * Carpathian basin ~166–168; Romans of the Republic ~165–168 (Herculaneum's,
 * a century on, ~169); late Roman soldiers and the Goths of the 5th century
 * taller (Germanic row-grave men ~170–174); Parthian-period Iranians ~167. Riders
 * from boyhood, the nomads lean and hard; the nobles and the cataphracts fed
 * better and trained more.
 */
const ANCIENT_BUILD = {
  xiongnu: { rider: { heightCm: 165, weightKg: 62, exercise: 0.76 } },
  hun: { rider: { heightCm: 166, weightKg: 63, exercise: 0.76 }, noble: { heightCm: 168, weightKg: 67, exercise: 0.8 } },
  lateRoman: { soldier: { heightCm: 169, weightKg: 66, exercise: 0.72 } },
  goth: { warrior: { heightCm: 172, weightKg: 68, exercise: 0.66 }, noble: { heightCm: 174, weightKg: 72, exercise: 0.76 } },
  parthian: { archer: { heightCm: 167, weightKg: 63, exercise: 0.74 }, cataphract: { heightCm: 170, weightKg: 70, exercise: 0.8 } },
};

// The legionary of the Republic: the Empire's legionary (PRESETS.legionary), shorter by the century and a half, in Crassus's kit.
const REPUBLICAN_LEGIONARY = { ...PRESETS.legionary, name: 'Publius Octavius', heightCm: 167, calories: 3950, outfit: { kind: 'republicanLegionary', design: 0 } };

/** A man of one of these peoples: `base` varied, a name from `names` (or a first name and a second), in his kit, at his people's build, his looks drawn from `look`'s choices. */
function ancientMan(random, base, names, kind, style, build, { mounted = false, look = {} } = {}) {
  const man = varyCharacter(base, random, { sex: 'male' });
  const name = Array.isArray(names[0]) ? `${pickOne(names[0], random)} ${pickOne(names[1], random)}` : pickOne(names, random);
  const drawn = Object.fromEntries(Object.entries(look).map(([key, choices]) => [key, pickOne(choices, random)]));
  const inputs = { ...man, sex: 'male', name, style, outfit: { kind, design: randomDesign(kind, random) }, accessories: [], look: { ...man.look, ...drawn } };
  return { ...builtLike(inputs, build, random), ...(mounted ? { mounted: true } : {}) };
}

// Black hair, long or bound up, a nomad's sun- and wind-darkened skin.
const NOMAD_LOOK = { skinTone: ['lightTan', 'medium', 'tan'], hairColor: ['#120d0a', '#1a120c'], hairStyle: ['long', 'midLong', 'bun'], facialHair: ['none', 'mustache', 'stubble'] };

/** A Xiongnu horse archer (the composite bow), or a horseman with the spear: every man of them rode. */
export function xiongnuRider(random = Math.random, style = 'steppeBow') {
  // Names the Han histories give (Sima Qian, Ban Gu): chanyus, kings and their men.
  const names = ['Yizhixie', 'Hunye', 'Xiutu', 'Zhaoxin', 'Bizhi', 'Tuqi', 'Huyan', 'Lan', 'Xubu', 'Qiulin', 'Gulu', 'Hanxie', 'Wuwei', 'Juqu'];
  return ancientMan(random, PRESETS.steppeBow, names, 'xiongnu', style, ANCIENT_BUILD.xiongnu.rider, { mounted: true, look: NOMAD_LOOK });
}

/** A Hun of Attila's army: a horse archer (`rider`), or one of his nobles (`noble`: mail, spangenhelm) with the bow or the sword. */
export function hunRider(random = Math.random, style = 'steppeBow', rank = 'rider') {
  const names = ['Bleda', 'Ellac', 'Dengizich', 'Ernak', 'Edeko', 'Onegesius', 'Berik', 'Eskam', 'Kursik', 'Basik', 'Atakam', 'Uldin', 'Charaton', 'Oebarsius'];
  return ancientMan(random, PRESETS.steppeBow, names, rank === 'noble' ? 'hunNoble' : 'hun', style, ANCIENT_BUILD.hun[rank], { mounted: true, look: NOMAD_LOOK });
}

/** A soldier of Aetius's late Roman field army: spear or spatha, and the oval shield. */
export function lateRomanSoldier(random = Math.random, style = 'spearOval') {
  const names = [['Flavius', 'Aurelius', 'Valerius', 'Julius', 'Claudius'], ['Maximus', 'Severus', 'Victor', 'Ursus', 'Dagalaifus', 'Bonitus', 'Sabinianus', 'Gaudentius', 'Iovinus', 'Merobaudes']];
  return ancientMan(random, PRESETS.legionary, names, 'lateRoman', style, ANCIENT_BUILD.lateRoman.soldier, { look: { skinTone: ['light', 'lightTan', 'medium'], hairStyle: ['buzz', 'cleanShort', 'midLong'], facialHair: ['none', 'stubble', 'beard'] } });
}

/** A Goth: a warrior with spear or spatha and the round shield, or a noble (mail, spangenhelm), on foot or `mounted`. */
export function gothWarrior(random = Math.random, style = 'spearRound', rank = 'warrior', { mounted = false } = {}) {
  const names = ['Thorismund', 'Theoderic', 'Frideric', 'Euric', 'Athaulf', 'Wallia', 'Sigeric', 'Fritigern', 'Athanaric', 'Wittigis', 'Gunthamund', 'Hildebrand', 'Wulfila', 'Sigismer'];
  return ancientMan(random, PRESETS.contender, names, rank === 'noble' ? 'gothNoble' : 'goth', style, ANCIENT_BUILD.goth[rank], { mounted, look: { skinTone: ['light', 'light', 'lightTan'], hairColor: ['#6b4a2a', '#c9a25e', '#2a1a10', '#8a3a1c'], hairStyle: ['long', 'midLong', 'long'], facialHair: ['beard', 'mustache', 'beard', 'stubble'] } });
}

/** A legionary of Crassus's army (53 BC): drilled, one look to the unit (drilledSoldier). */
export function republicanLegionary(random = Math.random, { name = null } = {}) {
  const roman = `${pickOne(['Gaius', 'Lucius', 'Marcus', 'Publius', 'Quintus', 'Titus', 'Gnaeus', 'Sextus'], random)} ${pickOne(['Octavius', 'Petronius', 'Vargunteius', 'Censorinus', 'Ignatius', 'Cassius', 'Megabacchus', 'Coponius', 'Egnatius', 'Roscius'], random)}`;
  return drilledSoldier(REPUBLICAN_LEGIONARY, random, { name: name ?? roman });
}

/**
 * A Gallic horseman of Publius Crassus's thousand (Caesar's Gauls, lent for
 * the war: Plutarch, Crassus 17, 25): mail and a riding horse of his own, the
 * long sword or the spear; the kit of the later auxiliary alae, which were
 * raised from such men.
 */
export function gallicHorseman(random = Math.random, style = 'spear') {
  const name = `${pickOne(['Vercassivellaunus', 'Litaviccus', 'Commius', 'Dumnorix', 'Cingetorix', 'Epasnactus', 'Andecombogius', 'Viridomarus', 'Eporedorix', 'Cotuatus'], random)}`;
  return { ...romanHorseman(random, style), name };
}

/** A Parthian of Surena's army: a horse archer (`archer`), or a cataphract with the kontos (`cataphract`). */
export function parthianRider(random = Math.random, style = 'steppeBow', rank = 'archer') {
  const names = ['Silaces', 'Arsaces', 'Pacorus', 'Mithridates', 'Vardanes', 'Gotarzes', 'Phraates', 'Orodes', 'Vologases', 'Artabanus', 'Osaces', 'Sinnaces', 'Abdagases', 'Monaeses'];
  return ancientMan(random, PRESETS.steppeBow, names, rank === 'cataphract' ? 'cataphract' : 'parthianArcher', style, ANCIENT_BUILD.parthian[rank], { mounted: true, look: { skinTone: ['lightTan', 'medium', 'tan'], hairColor: ['#120d0a', '#2a1a10'], hairStyle: ['midLong', 'long'], facialHair: ['beard', 'beard', 'mustache'] } });
}

// ---- Agincourt and Cerignola: the battles of the bow and the ditch ----

// Builds of the men of those battles (PERIOD_BUILD, joined here). English archers of the fifteenth
// century, from the Mary Rose's bowmen and the Towton grave: ~171 cm, heavy-boned and strong in the
// shoulders from a boyhood at the butts; the men-at-arms of either side, fed and trained to arms, about
// the same. The Swiss and the Landsknechts of 1500 a little shorter, hardened by years of campaigning.
// The Gascon and Picard foot of the French host, smaller men of the commons.
Object.assign(PERIOD_BUILD, {
  english: { archer: { heightCm: 171, weightKg: 70, exercise: 0.86 }, manAtArms: { heightCm: 172, weightKg: 74, exercise: 0.8 } },
  french: { knight: { heightCm: 171, weightKg: 73, exercise: 0.78 }, foot: { heightCm: 167, weightKg: 64, exercise: 0.62 } },
  swiss: { pike: { heightCm: 168, weightKg: 67, exercise: 0.8 } },
  landsknecht: { pike: { heightCm: 168, weightKg: 67, exercise: 0.74 } },
});

/**
 * An English or Welsh archer of 1415: the war bow (longbow), the padded jack in one of its liveries, a
 * falchion at his belt.
 */
export function englishArcher(random = Math.random, style = 'longbow') {
  const base = varyCharacter(PRESETS.contender, random, { sex: 'male' });
  const welsh = random() < 0.3;
  const name = welsh
    ? `${pickOne(['Dafydd', 'Hywel', 'Ieuan', 'Gruffydd', 'Rhys', 'Madog', 'Owain', 'Llywelyn'], random)} ap ${pickOne(['Llywelyn', 'Gwilym', 'Rhys', 'Ieuan', 'Hywel', 'Madog'], random)}`
    : `${pickOne(['John', 'William', 'Thomas', 'Richard', 'Robert', 'Walter', 'Hugh', 'Roger', 'Nicholas', 'Simon'], random)} ${pickOne(['Fletcher', 'Bowyer', 'Archer', 'Hayward', 'Wode', 'Lyttle', 'Smyth', 'Carter', 'Baker', 'Gamage'], random)}`;
  const soldier = { ...base, sex: 'male', name, style, outfit: { kind: 'archer', design: randomDesign('archer', random) }, accessories: [], look: { ...base.look, skinTone: pickOne(['light', 'light', 'lightTan'], random), facialHair: pickOne(['none', 'stubble', 'beard', 'mustache'], random) } };
  return builtLike(soldier, PERIOD_BUILD.english.archer, random);
}

/** One of King Henry's men-at-arms, on foot in plate as the English fought at Agincourt, with a long sword or a war hammer. */
export function englishManAtArms(random = Math.random, style = 'longsword') {
  return builtLike(nobleKnight(random, style), PERIOD_BUILD.english.manAtArms, random);
}

/**
 * A French man-at-arms of 1415 or a gendarme of 1503 (`mounted`): a noble in full plate with the bascinet, on
 * foot with a long sword or a war hammer (the lances cut down for fighting on foot), or on his destrier in its
 * steel bard, with the lance.
 */
export function frenchKnight(random = Math.random, style = 'longsword', { mounted = false } = {}) {
  const knight = nobleKnight(random, style);
  const name = `${pickOne(['Messire', 'Messire', 'Sire'], random)} ${pickOne(['Jean', 'Guillaume', 'Charles', 'Louis', 'Pierre', 'Jacques', 'Robert', 'Antoine', 'Philippe', 'Raoul'], random)} ${pickOne(['de Croÿ', "d'Albret", 'de Rambures', 'de Bournonville', 'de Montmorency', 'de Bacqueville', 'de Hangest', "d'Aumont", 'de Lannoy', 'de Saveuse'], random)}`;
  const built = builtLike({ ...knight, name }, PERIOD_BUILD.french.knight, random);
  return mounted ? { ...built, mounted: true } : built;
}

/**
 * A pikeman of 1503: Swiss (`swiss`, the French king's hired columns) or a Landsknecht (`landsknecht`,
 * Gonzalo's Germans): the pike, little armour (a breastplate in the front ranks, a brigandine or a mail
 * shirt, a kettle hat: the foot soldier's kit), the short sword for the press.
 */
export function pikeman(random = Math.random, people = 'swiss', style = 'pike') {
  const base = varyCharacter(PRESETS.contender, random, { sex: 'male' });
  const name = people === 'swiss'
    ? `${pickOne(['Hans', 'Ueli', 'Heini', 'Rudolf', 'Jörg', 'Kaspar', 'Peter', 'Werner'], random)} ${pickOne(['von Uri', 'Zurbriggen', 'Ammann', 'Kälin', 'Stauffacher', 'Imhof', 'Schwarzmurer', 'Winkelried'], random)}`
    : `${pickOne(['Hans', 'Jakob', 'Lienhard', 'Wolf', 'Michel', 'Konrad', 'Sebastian', 'Ulrich'], random)} ${pickOne(['Schertlin', 'Frundsberg', 'Weber', 'Kessler', 'Gruber', 'Bauer', 'Vogt', 'Raidt'], random)}`;
  const soldier = { ...base, sex: 'male', name, style, outfit: { kind: 'footman', design: randomDesign('footman', random) }, accessories: [], look: { ...base.look, skinTone: pickOne(['light', 'lightTan'], random), facialHair: pickOne(['beard', 'mustache', 'stubble', 'beard'], random) } };
  return builtLike(soldier, PERIOD_BUILD[people].pike, random);
}

/** A French foot soldier of 1503 (the Gascon crossbowmen): in what armour he has, with the crossbow or a spear. */
export function frenchFoot(random = Math.random, style = 'crossbow') {
  const base = footSoldier(random, style);
  const name = `${pickOne(['Arnaud', 'Bernard', 'Guilhem', 'Peyre', 'Ramon', 'Bertrand', 'Sans', 'Joan'], random)} ${pickOne(['de Lescun', 'Barrère', 'Lafitte', 'Cazaux', 'Labat', 'Pujol', 'Darrigrand', 'Lacoste'], random)}`;
  return builtLike({ ...base, name }, PERIOD_BUILD.french.foot, random);
}
