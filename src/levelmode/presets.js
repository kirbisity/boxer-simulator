// Level Mode's cast (Stage 1, Dunnottar): the operative, the garrison c. 1500, the prisoners, the
// civilians and Lord Vaelen. They live apart from body.js's PRESETS so that nothing which deals
// from it (the roster, Deadliest Warrior, a quick battle, a random character) can ever pick one.
// Same shape as a PRESET; `levelPreset(key)` hands out a normalised copy for the stage to build.
//
// Weapons stand in where the game has no exact piece (all in the one simulation, nothing special-cased):
// - the Forger's arming sword and buckler is the hidden style `armingBuckler` (moves.js);
// - the guard's halberd and the knight's and Vaelen's poleaxe are the `warhammer` style (a two-hander
//   with a long shaft, a hammer face and a spike; Vaelen swings it wide: hammerSide, hammerOverhead);
// - the miner's pick is the same war hammer; the turnkey's club is the baton.
//
// Vaelen's phase 2 (at half health the helm comes off and he moves faster) is runtime logic, for the
// stage: strip `head` from his outfit look and scale his `movement`; nothing here knows about it.

import { normaliseInputs } from '../body.js';

export const LEVEL_PRESETS = {
  // The player: fixed. Athletic and well taught (skill 0.75), quick and quiet in a gambeson.
  forger: {
    name: 'The Forger', style: 'armingBuckler', sex: 'male', heightCm: 179, frame: 'medium', age: 28, exercise: 0.75, calories: 4176, skill: 0.75,
    outfit: { kind: 'forger', design: 0 }, accessories: [],
    look: { skinTone: 'light', hairStyle: 'midLong', hairColor: '#3a2a1c', facialHair: 'stubble', eyeColor: 'grey' },
  },

  // ---- The garrison, c. 1500 -----------------------------------------------------------------
  // Tuned with tools/dunnottar.js (a bot plays the stage; see its header): the fights are a full simulation, where the
  // operative's sword and buckler beat a spear or a poleaxe only about as often as they lose, so the garrison is a hungry,
  // half-drilled one: low `exercise` (calories chosen to keep each man's body mass: weak, not fat) and low `skill`. A fight
  // against a guard is still lost one time in six or seven: that is the sim, not the number. Plate is not beaten by an edge at
  // all (the man-at-arms is for a poleaxe taken from a fallen guard, about even).
  // Tier 1: levy spearmen, little armour, little drill (underfed conscripts, 62 kg: the operative wins nearly every duel with one).
  dunnottarSoldier: {
    name: 'Dunnottar levy', style: 'spear', sex: 'male', heightCm: 168, frame: 'small', age: 27, exercise: 0.06, calories: 1984, skill: 0.04,
    outfit: { kind: 'levy', design: 0 }, accessories: [],
    look: { skinTone: 'light', hairStyle: 'cleanShort', hairColor: '#5a4a3a', facialHair: 'stubble', eyeColor: 'blue' },
  },
  // Tier 2: brigandine, a poleaxe (the halberd's stand-in).
  dunnottarGuard: {
    name: 'Dunnottar guard', style: 'warhammer', sex: 'male', heightCm: 177, frame: 'large', age: 32, exercise: 0.1, calories: 2681, skill: 0.25,
    outfit: { kind: 'footman', design: 0 }, accessories: [],
    look: { skinTone: 'light', hairStyle: 'buzz', hairColor: '#4a3020', facialHair: 'beard', eyeColor: 'brown' },
  },
  dunnottarCrossbow: {
    name: 'Dunnottar crossbowman', style: 'crossbow', sex: 'male', heightCm: 170, frame: 'medium', age: 30, exercise: 0.3, calories: 2737, skill: 0.2,
    outfit: { kind: 'footman', design: 2 }, accessories: [],
    look: { skinTone: 'lightTan', hairStyle: 'cleanShort', hairColor: '#2a1a10', facialHair: 'mustache', eyeColor: 'brown' },
  },
  // His powder is damp: the stage makes him misfire (matchlock misfire and hang-fire chances are level config).
  dunnottarMatchlock: {
    name: 'Dunnottar matchlock', style: 'matchlock', sex: 'male', heightCm: 174, frame: 'medium', age: 34, exercise: 0.3, calories: 2836, skill: 0.2,
    outfit: { kind: 'footman', design: 4 }, accessories: [],
    look: { skinTone: 'light', hairStyle: 'cleanShort', hairColor: '#6b4a2a', facialHair: 'stubble', eyeColor: 'green' },
  },
  // Tier 3: a man-at-arms in the blackened plate, the sword and heater. (A level may swap the style
  // to `longsword` or `warhammer` for a poleaxe man: it is only the style key.)
  dunnottarKnight: {
    name: 'Dunnottar man-at-arms', style: 'templar', sex: 'male', heightCm: 182, frame: 'large', age: 33, exercise: 0.5, calories: 4047, skill: 0.5,
    outfit: { kind: 'knight', design: 2 }, accessories: ['plume'],
    look: { skinTone: 'light', hairStyle: 'buzz', hairColor: '#2a1a10', facialHair: 'beard', eyeColor: 'grey' },
  },
  // Sir Alasdair, who holds the ledge at the front gate: the same full blackened plate, sword and heater as the man-at-arms, but a stiffer, less practised
  // fighter (skill 0.25 for 0.5; the sword does nothing to plate either way: what wins is a thrust that finds a gap, and the comrades drawing his blows).
  // Tuned with tools/dunnottar.js `knights` (120 duels from the gorge brazier, the stage awake, two comrades, the operative's sword and gambeson): at skill 0.5 the
  // operative wins 18 in 120, at 0.35 27, at 0.25 32, at 0.2 43. In a whole run the bot (careful, a death a try) wins about one try in five.
  // No damage multiplier anywhere: armour, weapon and skill, as elsewhere.
  dunnottarPlateKnight: {
    name: 'Dunnottar plate knight', style: 'templar', sex: 'male', heightCm: 182, frame: 'large', age: 33, exercise: 0.5, calories: 4047, skill: 0.25,
    outfit: { kind: 'knight', design: 2 }, accessories: ['plume'],
    look: { skinTone: 'light', hairStyle: 'buzz', hairColor: '#2a1a10', facialHair: 'beard', eyeColor: 'grey' },
  },
  // The jailer of Whigs' Vault: heavy, a club, a ring of keys.
  turnkey: {
    name: 'The Turnkey', style: 'baton', sex: 'male', heightCm: 181, frame: 'large', age: 45, exercise: 0.35, calories: 3941, skill: 0.4,
    outfit: { kind: 'commoner', design: 0, colors: { top: '#4a3a2a', bottom: '#26231f' } }, accessories: [],
    look: { skinTone: 'light', hairStyle: 'bald', hairColor: '#3a2a1c', facialHair: 'beard', eyeColor: 'brown' },
  },

  // ---- Prisoners of the vault (the Forgers free them) --------------------------------------
  // Ragged, underfed, a pick or what came to hand.
  cabyMiner: {
    name: 'Caby miner', style: 'warhammer', sex: 'male', heightCm: 168, frame: 'medium', age: 38, exercise: 0.6, calories: 2884, skill: 0.35,
    outfit: { kind: 'commoner', design: 0, colors: { top: '#7a6f5c', bottom: '#3a332a' } }, accessories: ['headWrap'],
    look: { skinTone: 'light', hairStyle: 'midLong', hairColor: '#2a1a10', facialHair: 'beard', eyeColor: 'brown' },
  },
  cabySoldier: {
    name: 'Caby soldier', style: 'spear', sex: 'male', heightCm: 176, frame: 'medium', age: 29, exercise: 0.5, calories: 2973, skill: 0.5,
    outfit: { kind: 'commoner', design: 0, colors: { top: '#5a2a2a', bottom: '#33302b' } }, accessories: [],
    look: { skinTone: 'tan', hairStyle: 'cleanShort', hairColor: '#1c130c', facialHair: 'stubble', eyeColor: 'hazel' },
  },
  // The Prince of Caby: young, gaunt, nothing in his hands (the style that covers up and gets away).
  cabyPrince: {
    name: 'Prince of Caby', style: 'passive', sex: 'male', heightCm: 172, frame: 'small', age: 17, exercise: 0.05, calories: 1770, skill: 0.1,
    outfit: { kind: 'commoner', design: 0, colors: { top: '#8a8470', bottom: '#4a4538' } }, accessories: [],
    look: { skinTone: 'light', hairStyle: 'midLong', hairColor: '#8a6a3a', facialHair: 'none', eyeColor: 'blue' },
  },

  // A starving rebel with his hay fork, for the levels to come (no stage places him yet): body.js's Starved Rebel (BMI 15, a
  // levy's drill, his rags torn open over the ribs). Tier 1, the levy's; he needs no rule of his own to run: a man that weak
  // is outmatched by nearly anyone (ai.js confidence), and fear and his wounds break him (ai.js `panic`) as they do a levy.
  // A stage that wants a crowd of them deals each from cast.js `starvedRebel` and sets it as the spawn's `inputs`.
  starvedRebel: {
    name: 'Starved rebel', style: 'pitchfork', sex: 'male', heightCm: 170, frame: 'medium', age: 26, exercise: 0.2, calories: 1669, skill: 0.12,
    outfit: { kind: 'rags', design: 0, tear: { seed: 3, amount: 0.85, sleeve: 'l' } }, accessories: [],
    look: { skinTone: 'light', hairStyle: 'midLong', hairColor: '#4a3a2a', facialHair: 'beard', eyeColor: 'grey' },
  },

  // ---- The team: two Forger comrades who start beside the operative -------------------------------------------------
  // Resistance fighters of the same cell, weaker than the operative in every way that counts: a short sword each, plain clothes
  // and no armour at all (not the Forgers' quilted gambeson either: outfits.js `forger` turns a good part of an edge, so it is
  // armour), no helmet, and less drilled (skill 0.5 and 0.4 against his 0.75). Maren is the younger and the quicker, Old Tobin
  // is past fifty. Bodies in range for their frames (calories chosen with physiology.js caloriesForWeight: 62 and 80 kg).
  forgerMaren: {
    name: 'Forger swordswoman', style: 'shortSword', sex: 'female', heightCm: 168, frame: 'medium', age: 26, exercise: 0.55, calories: 2646, skill: 0.5,
    outfit: { kind: 'commoner', design: 0, colors: { top: '#4a4f52', bottom: '#2b2a28' } }, accessories: ['headWrap'],
    look: { skinTone: 'light', hairStyle: 'bun', hairColor: '#2a1a10', facialHair: 'none', eyeColor: 'green' },
  },
  forgerTobin: {
    name: 'Forger swordsman', style: 'shortSword', sex: 'male', heightCm: 172, frame: 'large', age: 52, exercise: 0.4, calories: 3236, skill: 0.4,
    outfit: { kind: 'commoner', design: 0, colors: { top: '#6a6048', bottom: '#33302b' } }, accessories: [],
    look: { skinTone: 'tan', hairStyle: 'buzz', hairColor: '#8d8d8d', facialHair: 'beard', eyeColor: 'brown' },
  },

  // ---- Civilians: they flee or cower, and fight with whatever they can only if cornered ------
  dunnottarServant: {
    name: 'Castle servant', style: 'passive', sex: 'female', heightCm: 160, frame: 'small', age: 34, exercise: 0.3, calories: 1901,
    outfit: { kind: 'commoner', design: 0, colors: { top: '#8c7a5a', bottom: '#4a3a30' } }, accessories: ['headWrap'],
    look: { skinTone: 'light', hairStyle: 'bun', hairColor: '#4a3020', facialHair: 'none', eyeColor: 'brown' },
  },
  dunnottarPriest: {
    name: 'Castle priest', style: 'passive', sex: 'male', heightCm: 174, frame: 'medium', age: 58, exercise: 0.15, calories: 2302,
    outfit: { kind: 'commoner', design: 0, colors: { top: '#1c1c20', bottom: '#1c1c20' } }, accessories: [],
    look: { skinTone: 'light', hairStyle: 'bald', hairColor: '#8d8d8d', facialHair: 'none', eyeColor: 'grey' },
  },

  // ---- The boss -------------------------------------------------------------------------------
  // Lord Vaelen, the Queen's chief jailer: 210 cm, a body of 150 kg (a big man gone soft in the Queen's service:
  // little drilled, `exercise` 0.2, so his strength is a giant's, not a strongman's) in a jousting harness (the
  // Stechzeug and its helm) that weighs what one weighs, ~45 kg (`outfit.extraMass` 0.3 of his body, where the
  // kit's own 0.8 would make it 120 kg), 195 kg in all, with the poleaxe in both hands. Slow in the harness, hard
  // to knock down (`poise`); skill 0.8 of which the helm leaves him three quarters (skillFactor).
  // Tuned (tools/dunnottar.js): a rested operative with the sword and buckler beats him about one time in four.
  vaelen: {
    name: 'Lord Vaelen', style: 'warhammer', sex: 'male', heightCm: 210, frame: 'large', age: 38, exercise: 0.35, calories: 5515, skill: 0.9,
    outfit: { kind: 'tournament', design: 1, extraMass: 0.3, balance: 1.5 }, accessories: [],
    look: { skinTone: 'light', hairStyle: 'buzz', hairColor: '#1c1c20', facialHair: 'beard', eyeColor: 'grey' },
  },
};

/** The ids of the cast, in the order above. */
export const LEVEL_PRESET_KEYS = Object.keys(LEVEL_PRESETS);

/** A character of the stage, completed and safe to change (a copy). */
export function levelPreset(key) {
  const preset = LEVEL_PRESETS[key];
  if (!preset) throw new Error(`no level preset named ${key}`);
  return normaliseInputs(structuredClone(preset));
}
