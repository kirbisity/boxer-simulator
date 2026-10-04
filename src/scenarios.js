// Scenarios: set fights in set places. Each is data for the same world, the
// same bodies, physics and AI as the sandbox — only the place, the people
// and what they wear differ.

import { FRAMES, normaliseInputs } from './body.js';
import { caloriesForBodyFat, caloriesForWeight } from './physiology.js';
import { createWorld } from './physics.js';
import { footSoldier, nobleKnight, rebel, sengokuWarrior, swatOfficer, yakuza } from './cast.js';

/**
 * A scenario: where (an arena's floor half-sizes and the scene drawn round
 * it), and who, as ordinary fighter inputs plus what they wear. A body is
 * given by its weight: the calories that settle at it are worked out when
 * the bout is built, as the builder's slider would.
 */
// One side at Sekigahara, forty strong: a samurai leads; the ashigaru are
// mostly yari and bows. Blades and polearms first (the front ranks), bows last.
const SEKIGAHARA_SIDE = {
  samurai: { katana: 4, naginata: 3, spear: 3, bow: 2 },
  ashigaru: { spear: 12, bow: 9, katana: 5, naginata: 2 },
};

function sekigaharaSide(random, side) {
  const warriors = [];
  for (const [rank, styles] of Object.entries(SEKIGAHARA_SIDE)) {
    for (const [style, count] of Object.entries(styles)) {
      for (let index = 0; index < count; index += 1) warriors.push(sengokuWarrior(random, side, style, rank));
    }
  }
  const archer = (warrior) => (warrior.style === 'bow' ? 1 : 0);
  return warriors.sort((a, b) => archer(a) - archer(b));
}

export const SCENARIOS = {
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
    blurb: 'The battle that ends the Sengoku. Forty of the East in red against forty of the West in black and blue: spears, blades and polearms in front, bows behind.',
    scene: 'sengoku',
    arena: { halfX: 17, halfZ: 11 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 17, maxDistance: 22 },
    roster: 'Forty a side: samurai and ashigaru',
    // Ten abreast: the blades and polearms in the front ranks, the bows behind.
    formation: { red: { front: 6, spacing: 1.3, rowSpacing: 1.6, perRow: 10, loose: 0.3 }, blue: { front: 6, spacing: 1.3, rowSpacing: 1.6, perRow: 10, loose: 0.3 } },
    cast: (random) => {
      const east = { tint: { armor: '#9a1f18', lace: '#1a1a1d' }, banner: '#b3161b' };
      const west = { tint: { armor: '#1c2030', lace: '#2a4a9a' }, banner: '#1f3f8a' };
      return { red: sekigaharaSide(random, east), blue: sekigaharaSide(random, west) };
    },
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
  return createWorld(scenarioFighters(scenario), { seed, arena: scenario.arena, rules: scenario.rules, formation: scenario.formation });
}
