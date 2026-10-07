// Fighting ratings: every character in the roster fights the two reference
// fighters, Maximus (armed: a gladius, no shield) and Tanzong (the Shaolin
// monk with the staff), `bouts` times from each corner. Each character's
// strength s is fitted to both records at once (Bradley-Terry: his odds of
// beating a man of strength r are s/r, so his K/D against him is s/r; a
// draw counts half each way, and half a bout either way is added so no
// record is certain). Maximus is fixed at 100; the monk at 100 over
// Maximus's K/D against him. A score is so proportional to inferred K/D:
// against Maximus it is 100 × that K/D. Maximus resolves the strong, the
// monk the weak. Writes src/ratings.js (generated: do not edit by hand).
// Usage: node tools/ratings.js [bouts per corner = 16] [workers = 10]
//        node tools/ratings.js worker FROM TO BOUTS   (one share of the roster; sends its records)

import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld } from '../src/physics.js';
import { WARRIORS } from '../src/roster.js';

// The references, by roster key; each bout lasts at most this long (s).
export const RATING = { references: { maximus: PRESETS.maximus, monk: PRESETS.staff }, seconds: 120, firstSeed: 900 };

/** One bout: who wins ('red', 'blue' or null for a draw at the bell). */
function bout(red, blue, seed) {
  const world = createWorld([{ inputs: structuredClone(red), corner: 'red' }, { inputs: structuredClone(blue), corner: 'blue' }], { seed });
  for (let second = 0; second < RATING.seconds && !boutWinner(world); second += 1) advance(world, 1, (current, dt) => thinkAll(current, dt));
  return boutWinner(world);
}

/** A character's record against one reference: `bouts` from each corner. */
export function record(inputs, reference, bouts) {
  const tally = { wins: 0, losses: 0, draws: 0 };
  for (let index = 0; index < bouts; index += 1) {
    const seed = RATING.firstSeed + index;
    const asRed = bout(inputs, reference, seed);
    const asBlue = bout(reference, inputs, seed);
    if (asRed === 'red') tally.wins += 1; else if (asRed === 'blue') tally.losses += 1; else tally.draws += 1;
    if (asBlue === 'blue') tally.wins += 1; else if (asBlue === 'red') tally.losses += 1; else tally.draws += 1;
  }
  return tally;
}

/** Inferred K/D from a record: a draw half each way, half a bout either side so no record is 0 or ∞. */
export const kd = ({ wins, losses, draws }) => (wins + draws / 2 + 0.5) / (losses + draws / 2 + 0.5);

/**
 * The strength that best explains these records against references of
 * known strength ([{ record, strength }]): the maximum likelihood under
 * Bradley-Terry, found by bisection on the log (its slope only falls).
 */
export function fitStrength(against) {
  const slope = (x) => against.reduce((sum, { record, strength }) => {
    const won = record.wins + record.draws / 2 + 0.5;
    const lost = record.losses + record.draws / 2 + 0.5;
    const p = 1 / (1 + Math.exp(Math.log(strength) - x));
    return sum + won * (1 - p) - lost * p;
  }, 0);
  let low = -10;
  let high = 20;
  for (let step = 0; step < 80; step += 1) {
    const middle = (low + high) / 2;
    if (slope(middle) > 0) low = middle; else high = middle;
  }
  return Math.exp((low + high) / 2);
}

function records(warrior, bouts) {
  return { key: warrior.key, title: warrior.title, type: `${warrior.inputs.style}|${warrior.inputs.outfit?.kind ?? 'boxing'}`, records: Object.fromEntries(Object.entries(RATING.references).map(([name, reference]) => [name, record(warrior.inputs, reference, bouts)])) };
}

const [mode, ...args] = process.argv.slice(2);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (mode === 'worker') {
    const [from, to, bouts] = args.map(Number);
    process.send(WARRIORS.slice(from, to).map((warrior) => records(warrior, bouts)));
  } else {
    const bouts = Number(mode ?? 16);
    const workers = Number(args[0] ?? 10);
    const share = Math.ceil(WARRIORS.length / workers);
    const started = Date.now();
    const parts = await Promise.all(Array.from({ length: workers }, (_, index) => new Promise((resolve, reject) => {
      const child = fork(fileURLToPath(import.meta.url), ['worker', index * share, Math.min(WARRIORS.length, (index + 1) * share), bouts]);
      child.on('message', resolve);
      child.on('error', reject);
    })));
    // The references' strengths: Maximus 100, the monk by Maximus's record against him.
    const all = parts.flat();
    const maximusRecord = all.find((entry) => entry.key === 'maximus').records.monk;
    const strengths = { maximus: 100, monk: 100 / kd(maximusRecord) };
    const rated = all.map((entry) => {
      const strength = fitStrength(Object.entries(entry.records).map(([name, tally]) => ({ record: tally, strength: strengths[name] })));
      // Whole numbers, but a tenth below 10 (the weak end is told apart there).
      return { ...entry, score: strength < 10 ? Math.round(strength * 10) / 10 : Math.round(strength), kd: Object.fromEntries(Object.entries(entry.records).map(([name, tally]) => [name, Number(kd(tally).toFixed(3))])) };
    });
    const characters = Object.fromEntries(rated.map(({ key, ...rest }) => [key, rest]));
    // A type (style and armour) is rated by its characters' geometric mean.
    const byType = {};
    for (const entry of rated) (byType[entry.type] ??= []).push(entry.score);
    const types = Object.fromEntries(Object.entries(byType).map(([type, scores]) => {
      const mean = Math.exp(scores.reduce((sum, value) => sum + Math.log(value), 0) / scores.length);
      return [type, mean < 10 ? Math.round(mean * 10) / 10 : Math.round(mean)];
    }));
    const header = `// GENERATED by tools/ratings.js (${bouts} bouts from each corner against each reference) — do not edit by hand; re-run the tool.\n// Score = fitted strength (Bradley-Terry) from records against Maximus (100) and Tanzong the staff monk: ∝ inferred K/D.\n`;
    const body = `export const RATINGS = ${JSON.stringify({ references: Object.keys(RATING.references), strengths, bouts, characters, types }, null, 1)};\n`;
    writeFileSync(new URL('../src/ratings.js', import.meta.url), header + body);
    for (const entry of [...rated].sort((a, b) => b.score - a.score)) console.log(`${String(entry.score).padStart(6)}  ${entry.title.padEnd(26)} ${entry.type.padEnd(30)} K/D ${entry.kd.maximus} / ${entry.kd.monk}`);
    console.log(`${rated.length} characters, ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
}
