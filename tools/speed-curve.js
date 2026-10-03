// Peak strike speeds across weight classes: realistic bodies from flyweight
// to super-heavyweight (heavier fighters are a little taller and a lot
// broader). Usage: node tools/speed-curve.js [move ...]

import { buildBody } from '../src/body.js';
import { MOVES } from '../src/moves.js';
import { advance, createWorld, placeFighter, throwPunch } from '../src/physics.js';

export const WEIGHT_CLASSES = [
  { label: 'fly', heightCm: 163, frame: 'small', bodyFat: 0.09 },
  { label: 'feather', heightCm: 168, frame: 'small', bodyFat: 0.1 },
  { label: 'light', heightCm: 173, frame: 'medium', bodyFat: 0.1 },
  { label: 'welter', heightCm: 177, frame: 'medium', bodyFat: 0.11 },
  { label: 'middle', heightCm: 181, frame: 'medium', bodyFat: 0.13 },
  { label: 'light-heavy', heightCm: 185, frame: 'large', bodyFat: 0.14 },
  { label: 'cruiser', heightCm: 189, frame: 'large', bodyFat: 0.17 },
  { label: 'heavy', heightCm: 193, frame: 'large', bodyFat: 0.21 },
  { label: 'super-heavy', heightCm: 197, frame: 'large', bodyFat: 0.26 },
];

/** Peak speed of the striking limb for one move, thrown into the air. */
export function peakSpeed(inputs, move) {
  const world = createWorld([inputs, inputs], { seed: 1 });
  // Close-range strikes are thrown from close range; the rest into the air.
  const close = MOVES[move]?.reach === 'close' && !MOVES[move].limb.endsWith('Hand');
  placeFighter(world.fighters[0], close ? -0.35 : world.fighters[0].root[0]);
  placeFighter(world.fighters[1], close ? 0.35 : 2.6);
  advance(world, 1);
  const fighter = world.fighters[0];
  throwPunch(world, fighter, move);
  let peak = 0;
  for (let frame = 0; frame < 60; frame += 1) {
    advance(world, 1 / 120);
    peak = Math.max(peak, fighter.punch?.peakSpeed ?? 0);
  }
  return { peak, mass: fighter.body.massKg };
}

export function speedCurve(move, extra = {}) {
  return WEIGHT_CLASSES.map((entry) => ({ ...entry, ...peakSpeed({ sex: 'male', age: 26, exercise: 0.65, ...entry, ...extra }, move) }));
}

if (process.argv[1]?.endsWith('speed-curve.js')) {
  for (const move of process.argv.slice(2).length ? process.argv.slice(2) : ['jab', 'cross']) {
    console.log(move.padEnd(10), speedCurve(move).map((row) => `${row.label} ${row.mass.toFixed(0)}kg ${row.peak.toFixed(2)}`).join(' | '));
  }
}

/** Same height, from thin to bulky: muscle varies, the skeleton does not. */
export const BUILDS = [
  { label: 'thin', training: 0, bodyFat: 0.08 },
  { label: 'slim', training: 0.3, bodyFat: 0.09 },
  { label: 'athletic', training: 0.65, bodyFat: 0.1 },
  { label: 'muscular', training: 1, bodyFat: 0.11 },
  { label: 'bulky', training: 1, bodyFat: 0.11, frame: 'large', heightCm: 178 },
];

export function buildCurve(move) {
  return BUILDS.map((entry) => ({ ...entry, ...peakSpeed({ sex: 'male', age: 26, heightCm: 178, frame: 'medium', ...entry, training: entry.training }, move) }));
}

/** Same frame and training, from lean to carrying a lot of fat. */
export const FAT_LEVELS = [0.1, 0.16, 0.22, 0.28, 0.35];

export function fatCurve(move) {
  return FAT_LEVELS.map((bodyFat) => ({ label: `${Math.round(bodyFat * 100)}%`, ...peakSpeed({ sex: 'male', age: 26, heightCm: 180, frame: 'medium', training: 0.6, bodyFat }, move) }));
}

/** Footwork: metres covered in the first half second of a step in from standstill. */
export function footworkDistance(inputs) {
  const world = createWorld([inputs, inputs], { seed: 1 });
  placeFighter(world.fighters[0], -2.2);
  placeFighter(world.fighters[1], 2.6);
  advance(world, 0.5);
  const fighter = world.fighters[0];
  const start = fighter.root[0];
  fighter.move = 1;
  advance(world, 0.5);
  return fighter.root[0] - start;
}
