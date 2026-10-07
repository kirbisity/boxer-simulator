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
// Usage: node tools/ratings.js [bouts per corner = 16] [workers = 10] [cross bouts = 8] [random opponents each = 4]
//        node tools/ratings.js worker FROM TO BOUTS   (one share of the roster; sends its records)

import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld, seededRandom } from '../src/physics.js';
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

/**
 * Every strength at once from all the bouts (Bradley-Terry by Hunter's MM
 * steps): `games` [{ a, b, record }] of a's record against b. Half a bout
 * either way is added to each pairing; `anchor` is held at `at`.
 */
export function fitAll(games, anchor, at = 100, steps = 2000) {
  const names = [...new Set(games.flatMap((game) => [game.a, game.b]))];
  const strength = Object.fromEntries(names.map((name) => [name, 1]));
  const won = Object.fromEntries(names.map((name) => [name, 0]));
  for (const { a, b, record } of games) {
    won[a] += record.wins + record.draws / 2 + 0.5;
    won[b] += record.losses + record.draws / 2 + 0.5;
  }
  for (let step = 0; step < steps; step += 1) {
    const sums = Object.fromEntries(names.map((name) => [name, 0]));
    for (const { a, b, record } of games) {
      const bouts = record.wins + record.losses + record.draws + 1;
      const share = bouts / (strength[a] + strength[b]);
      sums[a] += share;
      sums[b] += share;
    }
    for (const name of names) strength[name] = won[name] / sums[name];
    const scale = at / strength[anchor];
    for (const name of names) strength[name] *= scale;
  }
  return strength;
}

/** Fork `workers` children, each given a share of `jobs` (with `mode`); gather what they send back. */
async function inParallel(mode, jobs, bouts, workers) {
  const share = Math.ceil(jobs.length / workers);
  const parts = await Promise.all(Array.from({ length: workers }, (_, index) => new Promise((resolve, reject) => {
    const slice = jobs.slice(index * share, (index + 1) * share);
    if (!slice.length) return resolve([]);
    const child = fork(fileURLToPath(import.meta.url), [mode, JSON.stringify(slice), bouts]);
    child.on('message', resolve);
    child.on('error', reject);
  })));
  return parts.flat();
}

const rounded = (value) => (value < 10 ? Math.round(value * 10) / 10 : Math.round(value));

const [mode, ...args] = process.argv.slice(2);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const byKey = Object.fromEntries(WARRIORS.map((warrior) => [warrior.key, warrior]));
  if (mode === 'references') {
    // A share of the roster against the references.
    const [keys, bouts] = [JSON.parse(args[0]), Number(args[1])];
    process.send(keys.map((key) => records(byKey[key], bouts)));
  } else if (mode === 'pairs') {
    // A share of the cross pairs: each [a, b], a's record against b.
    const [pairs, bouts] = [JSON.parse(args[0]), Number(args[1])];
    process.send(pairs.map(([a, b]) => ({ a, b, record: record(byKey[a].inputs, byKey[b].inputs, bouts) })));
  } else {
    const bouts = Number(mode ?? 16);
    const workers = Number(args[0] ?? 10);
    const crossBouts = Number(args[1] ?? Math.max(4, bouts / 2));
    const randomOpponents = Number(args[2] ?? 4);
    const started = Date.now();
    // First, everyone against the two references.
    const first = await inParallel('references', WARRIORS.map((warrior) => warrior.key), bouts, workers);
    const referenceKey = { maximus: 'maximus', monk: 'shaolin' };
    const games = first.flatMap((entry) => Object.entries(entry.records).map(([name, tally]) => ({ a: entry.key, b: referenceKey[name], record: tally })))
      // A reference against himself is no evidence.
      .filter((game) => game.a !== game.b);
    const provisional = fitAll(games, 'maximus');
    // Then each against the two rated nearest him (on the log scale): neighbours checked directly, not only through the references.
    const order = Object.keys(provisional).sort((a, b) => provisional[a] - provisional[b]);
    const pairs = new Map();
    order.forEach((key, index) => {
      const near = order.filter((other) => other !== key).sort((x, y) => Math.abs(Math.log(provisional[x] / provisional[key])) - Math.abs(Math.log(provisional[y] / provisional[key]))).slice(0, 2);
      for (const other of near) {
        const pair = [key, other].sort();
        pairs.set(pair.join('|'), pair);
      }
    });
    // And each against a few drawn at random from the whole roster (seeded): the far apart compared directly too.
    const draw = seededRandom(RATING.firstSeed);
    const keys = WARRIORS.map((warrior) => warrior.key);
    for (const key of keys) {
      let added = 0;
      for (let tries = 0; added < randomOpponents && tries < 50; tries += 1) {
        const other = keys[Math.floor(draw() * keys.length)];
        const pair = [key, other].sort();
        if (other === key || pairs.has(pair.join('|'))) continue;
        pairs.set(pair.join('|'), pair);
        added += 1;
      }
    }
    const cross = await inParallel('pairs', [...pairs.values()], crossBouts, workers);
    const strength = fitAll([...games, ...cross], 'maximus');
    const rated = first.map((entry) => ({
      ...entry,
      score: rounded(strength[entry.key]),
      provisional: rounded(provisional[entry.key]),
      kd: Object.fromEntries(Object.entries(entry.records).map(([name, tally]) => [name, Number(kd(tally).toFixed(3))])),
    }));
    const characters = Object.fromEntries(rated.map(({ key, ...rest }) => [key, rest]));
    // A type (style and armour) is rated by its characters' geometric mean.
    const byType = {};
    for (const entry of rated) (byType[entry.type] ??= []).push(strength[entry.key]);
    const types = Object.fromEntries(Object.entries(byType).map(([type, values]) => [type, rounded(Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length))]));
    const crossRecords = cross.map(({ a, b, record: tally }) => ({ a, b, ...tally }));
    const header = `// GENERATED by tools/ratings.js (${bouts} bouts a corner against each reference, ${crossBouts} against each of two nearest-rated and ${randomOpponents} drawn at random) — do not edit by hand; re-run the tool.\n// Score = strength fitted to all those bouts at once (Bradley-Terry), Maximus held at 100: ∝ inferred K/D.\n`;
    const body = `export const RATINGS = ${JSON.stringify({ references: Object.keys(RATING.references), bouts, crossBouts, characters, types, cross: crossRecords }, null, 1)};\n`;
    writeFileSync(new URL('../src/ratings.js', import.meta.url), header + body);
    for (const entry of [...rated].sort((a, b) => strength[b.key] - strength[a.key])) console.log(`${String(entry.score).padStart(6)}  (was ${String(entry.provisional).padStart(5)})  ${entry.title.padEnd(26)} ${entry.type.padEnd(30)} K/D ${entry.kd.maximus} / ${entry.kd.monk}`);
    // How well the scores predict the cross bouts: each pairing's observed K/D against the scores' ratio.
    const misses = cross.map(({ a, b, record: tally }) => Math.abs(Math.log(kd(tally) / (strength[a] / strength[b]))));
    const median = [...misses].sort((x, y) => x - y)[Math.floor(misses.length / 2)];
    const within2 = misses.filter((miss) => miss < Math.log(2)).length;
    console.log(`${rated.length} characters, ${pairs.size} cross pairs (nearest and random); scores predict a cross pairing's K/D within ×2 in ${within2} of ${misses.length}, median miss ×${Math.exp(median).toFixed(2)}; ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
}
