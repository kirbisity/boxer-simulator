// Scenarios: set fights in set places. Each is data for the same world, the
// same bodies, physics and AI as the sandbox — only the place, the people
// and what they wear differ.

import { FRAMES, normaliseInputs, PRESETS } from './body.js';
import { caloriesForBodyFat, caloriesForWeight } from './physiology.js';
import { createWorld, seededRandom } from './physics.js';
import { STYLES } from './moves.js';
import { drilledSoldier, europeanSoldier, footSoldier, hospitaller, mexicaWarrior, mingSoldier, nobleKnight, ottomanSoldier, rebel, roninWarrior, sengokuWarrior, swatOfficer, wokouRaider, yakuza } from './cast.js';

// Rome against Han: fifty a side, ten to a rank; a centurion to every
// eighty legionaries (a century), Li Ling among his crossbowmen.
export const LEGION = { perSide: 50, arena: { halfX: 26, halfZ: 12 }, ranks: { spacing: 0.95, rowSpacing: 1.2, perRow: 10 }, romanFront: 14, hanFront: 3, century: 80 };

/** The two armies of Rome against Han, `count` a side. */
export function legionSides(random, count = LEGION.perSide) {
  const red = Array.from({ length: count }, (_, index) => drilledSoldier(index % LEGION.century === 0 ? PRESETS.centurion : PRESETS.legionary, random, index === 0 ? { name: PRESETS.centurion.name } : {}));
  const blue = Array.from({ length: count }, (_, index) => drilledSoldier(PRESETS.hanCrossbow, random, index === Math.floor(LEGION.ranks.perRow / 2) ? { name: PRESETS.hanCrossbow.name } : {}));
  return { red, blue };
}

/**
 * A scenario: where (an arena's floor half-sizes and the scene drawn round
 * it), and who, as ordinary fighter inputs plus what they wear. A body is
 * given by its weight: the calories that settle at it are worked out when
 * the bout is built, as the builder's slider would.
 */

// One side at Sekigahara, thirty strong: a samurai leads; the ashigaru are
// mostly yari, with bows and teppō. Blades and polearms first (the front
// ranks), the bows and guns last.
const SEKIGAHARA_SIDE = {
  samurai: { katana: 3, naginata: 2, spear: 2, bow: 2 },
  ashigaru: { spear: 9, bow: 4, matchlock: 3, katana: 4, naginata: 1 },
};

function sekigaharaSide(random, side) {
  const warriors = [];
  for (const [rank, styles] of Object.entries(SEKIGAHARA_SIDE)) {
    for (const [style, count] of Object.entries(styles)) {
      for (let index = 0; index < count; index += 1) warriors.push(sengokuWarrior(random, side, style, rank));
    }
  }
  const shooter = (warrior) => (STYLES[warrior.style]?.ranged ? 1 : 0);
  return warriors.sort((a, b) => shooter(a) - shooter(b));
}

// Pyongyang, 1593: the Ming army storms the city held by Konishi
// Yukinaga. Twenty a side; the Ming regulars only — brigandine and elite —
// led by an elite with the guandao; gun and bow men behind on both sides.
const PYONGYANG_MING = {
  elite: { guandao: 2, matchlock: 1, threeEyed: 2 },
  brigandine: { swordShield: 6, spear: 5, matchlock: 4 },
};
const PYONGYANG_JAPANESE = {
  samurai: { katana: 3, naginata: 1, spear: 1 },
  ashigaru: { spear: 7, matchlock: 5, bow: 3 },
};

/** Blades and polearms first (the front ranks), bows and guns last. */
function shootersBehind(warriors) {
  const shooter = (warrior) => (STYLES[warrior.style]?.ranged ? 1 : 0);
  return warriors.sort((a, b) => shooter(a) - shooter(b));
}

function pyongyangSides(random) {
  const ming = [];
  for (const [rank, styles] of Object.entries(PYONGYANG_MING)) for (const [style, count] of Object.entries(styles)) for (let index = 0; index < count; index += 1) ming.push(mingSoldier(random, style, rank));
  const japanese = [];
  const west = { tint: { armor: '#1c2030', lace: '#2a4a9a' }, banner: '#1f3f8a' };
  for (const [rank, styles] of Object.entries(PYONGYANG_JAPANESE)) for (const [style, count] of Object.entries(styles)) for (let index = 0; index < count; index += 1) japanese.push(sengokuWarrior(random, west, style, rank));
  const red = shootersBehind(ming);
  const blue = shootersBehind(japanese);
  // Led by the two commanders: Li Rusong for the Ming, Konishi Yukinaga in the city.
  red[0] = { ...red[0], name: 'Li Rusong' };
  blue[0] = { ...blue[0], name: 'Konishi Yukinaga' };
  return { red, blue };
}

/** `count` men from `make(style)`, for each style. */
function company(styles, make) {
  const men = [];
  for (const [style, count] of Object.entries(styles)) for (let index = 0; index < count; index += 1) men.push(make(style));
  return men;
}

// Otumba, 1520: the Spaniards, few and worn from the Noche Triste, with
// their Tlaxcalan allies (warriors armed as the Mexica were), meet the
// Mexica host on the plain. Steel against obsidian and cotton.
const OTUMBA = {
  spanish: { hidalgo: 4, rodelero: 7, arquebusier: 3 },
  tlaxcalan: { macuahuitl: 15, tepoztopilli: 10 },
  mexica: { warrior: { macuahuitl: 18, tepoztopilli: 10, bow: 4 }, elite: { macuahuitl: 5, tepoztopilli: 3 } },
};

// Baxemboy, Formosa, 1661: the VOC's musketeers and pikemen from Fort
// Zeelandia against Koxinga's army: his masked "iron men" in scale, his
// regulars in brigandine, garrison troops, and a few Japanese.
const ZEELANDIA = {
  dutch: { musketeer: 9, pikeman: 6, officer: 3 },
  koxinga: { elite: { guandao: 4, swordShield: 2 }, brigandine: { swordShield: 4, spear: 3, matchlock: 3 }, garrison: { spear: 8, dao: 2, matchlock: 2 }, ronin: { katana: 2 } },
};

// A wokou raid on the Zhejiang coast, 1550s: rōnin and Chinese sea raiders
// against a garrison with a few brigandine regulars (one in five).
// The raiding bands were large and the coast garrisons thin: here the raiders outnumber them.
const WOKOU = {
  // Japanese and Chinese together, as the raids were: Japanese swords,
  // a naginata and bows; the Chinese with dao, spears and matchlocks.
  raiders: { japanese: { katana: 7, naginata: 1, bow: 3 }, chinese: { dao: 6, spear: 5, matchlock: 4 } },
  garrison: { garrison: { spear: 7, dao: 4, matchlock: 1 }, brigandine: { swordShield: 2, spear: 1 } },
};

// Rhodes, 24 September 1522: Süleyman's general assault on the breaches.
// The Knights of St John in plate, their sergeants and gunners, hold the
// Bastion of Aragon against Janissaries, azaps and heavy men in mail-and-plate.
const RHODES = {
  hospitallers: { knight: { longsword: 6, warhammer: 2 }, sergeant: { spear: 4, matchlock: 3 } },
  // The whole army was a hundred thousand, but a breach is narrow: these are the men of one wave who reach the defenders.
  ottomans: { heavy: { maceShield: 2, saberShield: 1 }, janissary: { yatagan: 4, matchlock: 3 }, azap: { spear: 4, steppeBow: 3 } },
};

export const SCENARIOS = {
  // A what-if, not a battle that was: a legion of the early Empire against
  // a Han army of crossbowmen, as Li Ling's five thousand (99 BC) stood
  // against the Xiongnu. Two drilled armies of fifty, in ranks
  // (formation.js): the legion walks up in its lines, the Han hold theirs
  // and shoot, the ranks relieving each other.
  legion: {
    title: 'Rome against Han',
    place: 'A what-if · the 1st century',
    blurb: 'A legion of the early Empire meets a Han army of crossbowmen: fifty legionaries in segmented iron with scutum and gladius, closed up under their shields in the testudo as they walk up into fifty crossbows; the front ranks meet, the rest hold their places.',
    scene: 'plain',
    arena: LEGION.arena,
    camera: { yaw: -0.5, pitch: 0.45, distance: 20, maxDistance: 26 },
    roster: 'Fifty a side: legionaries and Han crossbowmen',
    formation: { red: { ...LEGION.ranks, front: LEGION.romanFront }, blue: { ...LEGION.ranks, front: LEGION.hanFront } },
    cast: (random) => legionSides(random),
    fighters: [],
  },
  rebellion: {
    title: 'Peasant Rebellion',
    place: 'The market square, Maidstone, Kent · June 1381',
    blurb: 'The town has risen. Two lords in plate and three of their foot soldiers ride in to put it down — and meet twenty peasants with spears in the market square.',
    scene: 'town',
    arena: { halfX: 9, halfZ: 7 },
    // Never further out than the house fronts.
    camera: { yaw: -0.55, pitch: 0.42, distance: 10, maxDistance: 10.5 },
    roster: 'Two knights and three foot soldiers · twenty rebels with spears',
    // Knights in a tight line, shoulder to shoulder; the rebels a loose crowd, well across the square.
    formation: { red: { front: 4.5, spacing: 0.85 }, blue: { front: 5, spacing: 1.5, rowSpacing: 1.6, loose: 0.55 } },
    // The whole cast, made fresh for each visit (the rebels differ every time).
    cast: (random) => ({
      red: [nobleKnight(random, 'longsword'), footSoldier(random, 'spear'), nobleKnight(random, 'warhammer'), footSoldier(random, 'bow'), footSoldier(random, 'longsword')],
      blue: Array.from({ length: 20 }, () => rebel(random)),
    }),
    fighters: [],
  },
  sekigahara: {
    title: 'Sekigahara',
    place: 'Sekigahara, Mino · 21 October 1600',
    blurb: 'The battle that ends the Sengoku. Thirty of the East in red against thirty of the West in black and blue: spears, blades and polearms in front, bows and teppō behind.',
    scene: 'sengoku',
    arena: { halfX: 17, halfZ: 11 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 17, maxDistance: 22 },
    roster: 'Thirty a side: samurai and ashigaru',
    // Ten abreast: the blades and polearms in the front ranks, the bows behind.
    formation: { red: { front: 6, spacing: 1.3, rowSpacing: 1.6, perRow: 10, loose: 0.3 }, blue: { front: 6, spacing: 1.3, rowSpacing: 1.6, perRow: 10, loose: 0.3 } },
    cast: (random) => {
      const east = { tint: { armor: '#9a1f18', lace: '#1a1a1d' }, banner: '#b3161b' };
      const west = { tint: { armor: '#1c2030', lace: '#2a4a9a' }, banner: '#1f3f8a' };
      return { red: sekigaharaSide(random, east), blue: sekigaharaSide(random, west) };
    },
    fighters: [],
  },
  pyongyang: {
    title: 'Pyongyang',
    place: 'Pyongyang, Joseon · 8 February 1593',
    blurb: 'The Ming army retakes the city from the Japanese. Twenty Ming regulars — elites in plated brigandine with guandao and guns, brigandine men with sword and shield, spear and gun — against twenty Japanese samurai and ashigaru.',
    scene: 'sengoku',
    arena: { halfX: 14, halfZ: 9 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 15, maxDistance: 19 },
    roster: 'Twenty a side: Ming and Japanese',
    formation: { red: { front: 5, spacing: 1.3, rowSpacing: 1.6, perRow: 8, loose: 0.3 }, blue: { front: 5, spacing: 1.3, rowSpacing: 1.6, perRow: 8, loose: 0.3 } },
    cast: (random) => pyongyangSides(random),
    fighters: [],
  },
  otumba: {
    title: 'Otumba',
    place: 'Otumba, Valley of Mexico · 7 July 1520',
    blurb: 'Days after the Noche Triste, the Spaniards and their Tlaxcalan allies are caught on the open plain by the Mexica host: steel breastplates, espadas and arquebuses against obsidian blades and quilted cotton.',
    scene: 'plain',
    arena: { halfX: 15, halfZ: 10 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 16, maxDistance: 20 },
    roster: 'Fourteen conquistadors and twenty-five Tlaxcalans · forty Mexica',
    formation: { red: { front: 5, spacing: 1.2, rowSpacing: 1.5, perRow: 10, loose: 0.3 }, blue: { front: 5, spacing: 1.2, rowSpacing: 1.6, perRow: 10, loose: 0.5 } },
    cast: (random) => ({
      red: shootersBehind([...company(OTUMBA.spanish, (type) => europeanSoldier(random, type)), ...company(OTUMBA.tlaxcalan, (style) => mexicaWarrior(random, style, 'warrior', { people: 'Tlaxcala', band: 1 }))]),
      blue: shootersBehind([...company(OTUMBA.mexica.elite, (style) => mexicaWarrior(random, style, 'elite')), ...company(OTUMBA.mexica.warrior, (style) => mexicaWarrior(random, style, 'warrior'))]),
    }),
    fighters: [],
  },
  zeelandia: {
    title: 'Fort Zeelandia',
    place: 'Baxemboy, Formosa · 1661',
    blurb: "Koxinga lands to take Fort Zeelandia. The VOC's musketeers and pikemen march out to meet his army on the sand: masked iron men in scale, brigandine regulars, garrison troops and a few Japanese.",
    scene: 'coastFort',
    arena: { halfX: 15, halfZ: 10 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 16, maxDistance: 20 },
    roster: 'Eighteen Dutch · thirty-two of Koxinga\'s army',
    formation: { red: { front: 5, spacing: 1.2, rowSpacing: 1.5, perRow: 9, loose: 0.15 }, blue: { front: 5, spacing: 1.2, rowSpacing: 1.6, perRow: 10, loose: 0.35 } },
    cast: (random) => {
      const army = ZEELANDIA.koxinga;
      // The iron men, every one masked, in scale (the elite's masked scale design).
      const ironMen = company(army.elite, (style) => mingSoldier(random, style, 'elite', { people: 'mingSouth', design: 4 }));
      const regulars = company(army.brigandine, (style) => mingSoldier(random, style, 'brigandine', { people: 'mingSouth' }));
      const garrison = company(army.garrison, (style) => mingSoldier(random, style, 'garrison', { people: 'mingSouth' }));
      return {
        red: shootersBehind(company(ZEELANDIA.dutch, (type) => europeanSoldier(random, type))),
        blue: shootersBehind([...ironMen, ...regulars, ...garrison, ...company(army.ronin, (style) => roninWarrior(random, style))]),
      };
    },
    fighters: [],
  },
  rhodes: {
    title: 'Siege of Rhodes',
    place: 'Bastion of Aragon, Rhodes · 24 September 1522',
    blurb: "Süleyman's general assault on the breaches. The Knights of St John in plate, with their sergeants and gunners, meet the Janissaries with yatagan and gun, the azaps' spears and bows, and heavy men in mail-and-plate.",
    scene: 'coastFort',
    arena: { halfX: 15, halfZ: 10 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 16, maxDistance: 20 },
    roster: 'Fifteen of the Order · a wave of seventeen Ottomans',
    formation: { red: { front: 5, spacing: 1.2, rowSpacing: 1.5, perRow: 8, loose: 0.15 }, blue: { front: 5, spacing: 1.2, rowSpacing: 1.6, perRow: 10, loose: 0.4 } },
    cast: (random) => ({
      red: shootersBehind([...company(RHODES.hospitallers.knight, (style) => hospitaller(random, style, 'knight')), ...company(RHODES.hospitallers.sergeant, (style) => hospitaller(random, style, 'sergeant'))]),
      blue: shootersBehind([...company(RHODES.ottomans.heavy, (style) => ottomanSoldier(random, style, 'heavy')), ...company(RHODES.ottomans.janissary, (style) => ottomanSoldier(random, style, 'janissary')), ...company(RHODES.ottomans.azap, (style) => ottomanSoldier(random, style, 'azap'))]),
    }),
    fighters: [],
  },
  wokou: {
    title: 'Wokou raid',
    place: 'Zhejiang coast · 1554',
    blurb: 'Sea raiders come ashore, Japanese and Chinese together, barefoot, some in pieces of samurai armour: swords, bows, dao, spears and guns, against the coast garrison and the few brigandine regulars among them.',
    scene: 'coastVillage',
    arena: { halfX: 14, halfZ: 9 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 15, maxDistance: 19 },
    roster: 'Twenty-six raiders · fifteen garrison',
    formation: { red: { front: 5, spacing: 1.3, rowSpacing: 1.6, perRow: 8, loose: 0.5 }, blue: { front: 5, spacing: 1.2, rowSpacing: 1.6, perRow: 8, loose: 0.25 } },
    cast: (random) => ({
      red: shootersBehind([...company(WOKOU.raiders.japanese, (style) => wokouRaider(random, style, 'japanese')), ...company(WOKOU.raiders.chinese, (style) => wokouRaider(random, style, 'chinese'))]),
      blue: shootersBehind([...company(WOKOU.garrison.brigandine, (style) => mingSoldier(random, style, 'brigandine', { people: 'mingSouth' })), ...company(WOKOU.garrison.garrison, (style) => mingSoldier(random, style, 'garrison', { people: 'mingSouth' }))]),
    }),
    fighters: [],
  },
  port: {
    title: 'Pier 9',
    place: 'Container port, Yokohama · 2:15 a.m.',
    blurb: 'A raid on a handover between the containers. Four SWAT officers — two pistols, two batons — against six yakuza: four knives, a katana, and one gun.',
    scene: 'port',
    arena: { halfX: 10, halfZ: 6 },
    camera: { yaw: -0.6, pitch: 0.36, distance: 9, maxDistance: 11 },
    roster: 'Four SWAT officers · six yakuza',
    formation: { red: { front: 4.5, spacing: 1.4 }, blue: { front: 4.5, spacing: 1.3, loose: 0.4 } },
    cast: (random) => ({
      red: [swatOfficer(random, 'handgun'), swatOfficer(random, 'baton'), swatOfficer(random, 'baton'), swatOfficer(random, 'handgun')],
      blue: [yakuza(random, 'knife'), yakuza(random, 'katana'), yakuza(random, 'knife'), yakuza(random, 'handgun'), yakuza(random, 'knife'), yakuza(random, 'knife')],
    }),
    fighters: [],
  },
  pride: {
    title: 'Frye vs. Takayama',
    place: 'Saitama Super Arena, Japan · 23 June 2002',
    blurb: 'Two big men, one hand each on the back of the other\'s neck, trading punches face to face until one of them drops.',
    scene: 'stadium',
    arena: { halfX: 3, halfZ: 3 },
    // Stood up again after a knockdown, as the referee would: it ends standing.
    rules: { noPins: true },
    camera: { yaw: -0.35, pitch: 0.14, distance: 4.6 },
    // Bodies given by fat, not weight: the training sets the muscle, and the weight follows.
    fighters: [
      {
        name: 'Don Frye', style: 'clinchBrawl', sex: 'male', heightCm: 185, bodyFat: 0.12, frame: 'large', age: 36, exercise: 0.82,
        outfit: { kind: 'mma', design: 0, colors: { bottom: '#16161a' } }, accessories: [],
        look: { skinTone: 'lightTan', hairStyle: 'buzz', hairColor: '#3a2a1c', facialHair: 'handlebar', eyeColor: 'brown', faceShape: 'seinen' },
      },
      {
        name: 'Yoshihiro Takayama', style: 'clinchBrawl', sex: 'male', heightCm: 196, bodyFat: 0.14, frame: 'large', age: 35, exercise: 0.65,
        outfit: { kind: 'mma', design: 0, colors: { bottom: '#1f2a52' } }, accessories: [],
        look: { skinTone: 'lightTan', hairStyle: 'long', hairColor: '#c9a25e', facialHair: 'none', eyeColor: 'brown', faceShape: 'seinen' },
      },
    ],
  },
  subway: {
    title: 'Last Train',
    place: 'New York subway platform, 1:40 a.m.',
    blurb: 'A shoulder barged on the stairs. No ring, no gloves, no referee — a strip of platform between the pillars and the yellow edge.',
    scene: 'subway',
    // The platform between the stair wall and the edge strip, along the train.
    arena: { halfX: 4.2, halfZ: 1.35 },
    camera: { yaw: -0.25, pitch: 0.14, distance: 5.4 },
    fighters: [
      {
        name: 'Simon', style: 'street', sex: 'male', heightCm: 183, weightKg: 72, frame: 'medium', age: 27, exercise: 0.35,
        outfit: { kind: 'casual', design: 1, colors: { top: '#24324a', bottom: '#2b3550' } }, accessories: ['headset'],
        look: { skinTone: 'lightTan', hairStyle: 'midLong', hairColor: '#120d0a', facialHair: 'none', eyeColor: 'brown' },
      },
      {
        name: 'Dre', style: 'street', sex: 'male', heightCm: 180, weightKg: 75, frame: 'medium', age: 25, exercise: 0.4,
        outfit: { kind: 'casual', design: 2, colors: { top: '#7a2230', bottom: '#26262b' } }, accessories: [],
        look: { skinTone: 'deep', hairStyle: 'dreads', hairColor: '#1a120c', facialHair: 'stubble', eyeColor: 'brown' },
      },
    ],
    // Each side's friends, for a team fight: changes to that side's lead.
    crews: {
      red: [
        { name: 'Tomo', heightCm: 176, weightKg: 68, age: 24, outfit: { kind: 'casual', design: 2, colors: { top: '#1c1c20', bottom: '#2b3550' } }, accessories: [], look: { hairStyle: 'spiky', skinTone: 'lightTan' } },
        { name: 'Jae', heightCm: 185, weightKg: 84, age: 29, exercise: 0.5, outfit: { kind: 'casual', design: 1, colors: { top: '#e4e4e6', bottom: '#26262b' } }, accessories: [], look: { hairStyle: 'fade', skinTone: 'light' } },
      ],
      blue: [
        { name: 'Marco', heightCm: 174, weightKg: 79, age: 30, outfit: { kind: 'casual', design: 1, colors: { top: '#4a5233', bottom: '#2b3550' } }, look: { hairStyle: 'buzz', skinTone: 'tan', facialHair: 'beard' } },
        { name: 'Kofi', heightCm: 188, weightKg: 82, age: 23, exercise: 0.45, outfit: { kind: 'casual', design: 2, colors: { top: '#6b6e74', bottom: '#1c1c20' } }, look: { hairStyle: 'cornrows', skinTone: 'deep' } },
      ],
    },
  },
};

/** Fighter inputs for a scenario: each body fed to its stated weight. */
export function scenarioFighters(scenario) {
  return scenario.fighters.map((entry, index) => {
    const { weightKg, bodyFat, ...rest } = entry;
    const inputs = normaliseInputs(rest);
    const lean = (FRAMES[inputs.frame] ?? FRAMES.medium).lean;
    inputs.calories = Math.round(bodyFat ? caloriesForBodyFat(inputs, bodyFat, lean) : caloriesForWeight(inputs, weightKg, lean));
    return { inputs, corner: index === 0 ? 'red' : 'blue' };
  });
}

/** A crew member: the side's lead, changed as the crew entry says, fed to its weight. */
export function crewFighter(lead, entry) {
  const { weightKg, ...changes } = entry;
  const inputs = normaliseInputs({ ...lead, ...changes, outfit: { ...lead.outfit, ...changes.outfit }, look: { ...lead.look, ...changes.look } });
  inputs.calories = Math.round(caloriesForWeight(inputs, weightKg, (FRAMES[inputs.frame] ?? FRAMES.medium).lean));
  return inputs;
}

/** A world for a scenario: its fighters on its floor. */
export function scenarioWorld(key, seed = 1) {
  const scenario = SCENARIOS[key];
  // A battle's armies are drawn from its cast, at the same seed.
  const fighters = scenario.cast ? Object.entries(scenario.cast(seededRandom(seed))).flatMap(([corner, side]) => side.map((inputs) => ({ inputs, corner }))) : scenarioFighters(scenario);
  return createWorld(fighters, { seed, arena: scenario.arena, rules: scenario.rules, formation: scenario.formation });
}
