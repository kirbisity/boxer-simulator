// Fighting ratings, by stack ranking. Every rating is a Bradley-Terry
// strength fitted to all the bouts at once (his odds of beating a man of
// strength r are s/r; a draw half each way, half a bout either way added),
// Maximus held at 100, so a score is proportional to inferred K/D. Which
// bouts are fought is chosen to tell the most for the fewest:
//   1. Seed: everyone against Maximus (and the weak against the Shaolin
//      monk too), for a first order.
//   2. Within each faction, a ladder: each against the nearest two or
//      three of his own faction by that order.
//   3. Across factions, targeted comparisons: each faction's top, middle
//      and bottom against the nearest-rated men of other factions (where a
//      merge of the factions' rankings would compare them).
//   4. Spot checks: pairs drawn at random, fitted without them first to
//      say how well the ratings predict a fight they never saw; then in.
// Every pairing is fought adaptively: two bouts at a time (each man from
// each corner), stopped once it is settled (RATING.settle), else at most
// its cap. Writes src/ratings.js (generated: do not edit by hand).
// Usage: node tools/ratings.js [max bouts a pairing = 16] [workers = 10] [spot checks = 30]
//        node tools/ratings.js pairs JSON MAX   (a worker: one share of the pairings; sends their records)

import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld, seededRandom } from '../src/physics.js';
import { WARRIORS } from '../src/roster.js';
import { factionOf } from '../src/outfits.js';

// The references, by roster key; each bout lasts at most this long (s).
export const RATING = {
  references: { maximus: PRESETS.maximus, monk: PRESETS.staff }, seconds: 120, firstSeed: 900,
  // A pairing is settled after at least `minBouts` once one side has won `share` of them (draws half), else fought to its cap.
  settle: { minBouts: 6, share: 0.85 },
  // The seed's second reference for the weak: those Maximus beats at least this share of the time.
  monkBelow: 0.25,
  // Each man's ladder within his faction, and how many of other factions each of his faction's top, middle and bottom meet.
  ladder: 3, across: 2,
};

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

/** A pairing fought until it is settled (RATING.settle) or `most` bouts: a's record against b. */
export function settledRecord(a, b, most) {
  const tally = { wins: 0, losses: 0, draws: 0 };
  for (let index = 0; tally.wins + tally.losses + tally.draws < most; index += 1) {
    const seed = RATING.firstSeed + index;
    const asRed = bout(a, b, seed);
    const asBlue = bout(b, a, seed);
    if (asRed === 'red') tally.wins += 1; else if (asRed === 'blue') tally.losses += 1; else tally.draws += 1;
    if (asBlue === 'blue') tally.wins += 1; else if (asBlue === 'red') tally.losses += 1; else tally.draws += 1;
    const fought = tally.wins + tally.losses + tally.draws;
    const share = (tally.wins + tally.draws / 2) / fought;
    if (fought >= RATING.settle.minBouts && (share >= RATING.settle.share || share <= 1 - RATING.settle.share)) break;
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
  // The references by roster key, and their inputs.
  const referenceKey = { maximus: 'maximus', monk: 'shaolin' };
  const inputsOf = (key) => byKey[key]?.inputs ?? RATING.references[Object.keys(referenceKey).find((name) => referenceKey[name] === key)];
  if (mode === 'pairs') {
    // A share of the pairings: each [a, b], a's record against b, fought until settled.
    const [pairs, most] = [JSON.parse(args[0]), Number(args[1])];
    process.send(pairs.map(([a, b]) => ({ a, b, record: settledRecord(inputsOf(a), inputsOf(b), most) })));
  } else {
    const most = Number(mode ?? 16);
    const workers = Number(args[0] ?? 10);
    const spotChecks = Number(args[1] ?? 30);
    const started = Date.now();
    const games = [];
    let bouts = 0;
    const fought = new Set();
    const keyOf = (a, b) => [a, b].sort().join('|');
    const fight = async (label, pairs) => {
      const fresh = pairs.filter(([a, b]) => a !== b && !fought.has(keyOf(a, b)));
      for (const [a, b] of fresh) fought.add(keyOf(a, b));
      const results = await inParallel('pairs', fresh, most, workers);
      const count = results.reduce((sum, { record: tally }) => sum + tally.wins + tally.losses + tally.draws, 0);
      bouts += count;
      console.log(`${label}: ${results.length} pairings, ${count} bouts (${(count / Math.max(1, results.length)).toFixed(1)} each), ${((Date.now() - started) / 1000).toFixed(0)} s`);
      return results;
    };
    const keys = WARRIORS.map((warrior) => warrior.key);
    const factionOfKey = Object.fromEntries(WARRIORS.map((warrior) => [warrior.key, factionOf(warrior.inputs) ?? 'none']));
    // 1. Seed: everyone against Maximus; the weak against the monk as well.
    const seed = await fight('seed: v Maximus', keys.map((key) => [key, 'maximus']));
    games.push(...seed);
    const weak = seed.filter(({ record: tally }) => (tally.wins + tally.draws / 2) / (tally.wins + tally.losses + tally.draws) < RATING.monkBelow).map(({ a }) => a);
    games.push(...await fight('seed: the weak v the monk', weak.map((key) => [key, 'shaolin'])));
    let strength = fitAll(games, 'maximus');
    const provisional = { ...strength };
    const nearest = (key, pool, count) => pool.filter((other) => other !== key).sort((x, y) => Math.abs(Math.log(strength[x] / strength[key])) - Math.abs(Math.log(strength[y] / strength[key]))).slice(0, count);
    // 2. Within each faction, a ladder.
    const factions = {};
    for (const key of keys) (factions[factionOfKey[key]] ??= []).push(key);
    const ladder = [];
    for (const members of Object.values(factions)) for (const key of members) for (const other of nearest(key, members, RATING.ladder)) ladder.push([key, other]);
    games.push(...await fight('within factions (ladders)', ladder));
    strength = fitAll(games, 'maximus');
    // 3. Across factions: each faction's top, middle and bottom against the nearest of the others.
    const across = [];
    for (const [faction, members] of Object.entries(factions)) {
      const ranked = [...members].sort((a, b) => strength[b] - strength[a]);
      const marks = [...new Set([ranked[0], ranked[Math.floor(ranked.length / 2)], ranked.at(-1)])];
      const others = keys.filter((key) => factionOfKey[key] !== faction);
      for (const key of marks) for (const other of nearest(key, others, RATING.across)) across.push([key, other]);
    }
    games.push(...await fight('across factions (targeted)', across));
    strength = fitAll(games, 'maximus');
    // 4. Spot checks: random pairs, predicted from the rest before they are fought.
    const draw = seededRandom(RATING.firstSeed);
    const spots = [];
    for (let tries = 0; spots.length < spotChecks && tries < spotChecks * 20; tries += 1) {
      const a = keys[Math.floor(draw() * keys.length)];
      const b = keys[Math.floor(draw() * keys.length)];
      if (a === b || fought.has(keyOf(a, b)) || spots.some((pair) => keyOf(...pair) === keyOf(a, b))) continue;
      spots.push([a, b]);
    }
    const before = { ...strength };
    const checks = await fight('spot checks', spots);
    const misses = checks.map(({ a, b, record: tally }) => Math.abs(Math.log(kd(tally) / (before[a] / before[b]))));
    const rightWay = checks.filter(({ a, b, record: tally }) => (kd(tally) > 1) === (before[a] > before[b]) || Math.abs(Math.log(kd(tally))) < 0.2).length;
    games.push(...checks);
    strength = fitAll(games, 'maximus');
    // The record against each reference where fought, for the table.
    const recordsOf = (key) => {
      const out = {};
      for (const { a, b, record: tally } of games) {
        for (const [name, reference] of Object.entries(referenceKey)) {
          if (a === key && b === reference) out[name] = tally;
          if (b === key && a === reference) out[name] = { wins: tally.losses, losses: tally.wins, draws: tally.draws };
        }
      }
      return out;
    };
    const rated = WARRIORS.map((warrior) => {
      const recordsAgainst = recordsOf(warrior.key);
      return {
        key: warrior.key, title: warrior.title, faction: factionOfKey[warrior.key],
        type: `${warrior.inputs.style}|${warrior.inputs.outfit?.kind ?? 'boxing'}`,
        records: recordsAgainst,
        score: rounded(strength[warrior.key]),
        provisional: rounded(provisional[warrior.key]),
        kd: Object.fromEntries(Object.entries(recordsAgainst).map(([name, tally]) => [name, Number(kd(tally).toFixed(3))])),
      };
    });
    const characters = Object.fromEntries(rated.map(({ key, ...rest }) => [key, rest]));
    // A type (style and armour) is rated by its characters' geometric mean.
    const byType = {};
    for (const entry of rated) (byType[entry.type] ??= []).push(strength[entry.key]);
    const types = Object.fromEntries(Object.entries(byType).map(([type, values]) => [type, rounded(Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length))]));
    const crossRecords = games.filter(({ a, b }) => !Object.values(referenceKey).includes(b) || !keys.includes(a)).map(({ a, b, record: tally }) => ({ a, b, ...tally }));
    const header = `// GENERATED by tools/ratings.js (stack ranking: a seed against Maximus and the monk, ladders within each faction, targeted comparisons across them, ${spots.length} spot checks; each pairing fought until settled, at most ${most} bouts; ${bouts} bouts in all) — do not edit by hand; re-run the tool.\n// Score = strength fitted to all those bouts at once (Bradley-Terry), Maximus held at 100: ∝ inferred K/D.\n`;
    const body = `export const RATINGS = ${JSON.stringify({ references: Object.keys(RATING.references), bouts: most, totalBouts: bouts, characters, types, cross: crossRecords }, null, 1)};\n`;
    writeFileSync(new URL('../src/ratings.js', import.meta.url), header + body);
    for (const entry of [...rated].sort((a, b) => strength[b.key] - strength[a.key])) console.log(`${String(entry.score).padStart(6)}  (seed ${String(entry.provisional).padStart(5)})  ${entry.title.padEnd(26)} ${entry.faction.padEnd(11)} ${entry.type}`);
    const median = [...misses].sort((x, y) => x - y)[Math.floor(misses.length / 2)] ?? 0;
    const within2 = misses.filter((miss) => miss < Math.log(2)).length;
    console.log(`${rated.length} characters, ${fought.size} pairings, ${bouts} bouts, ${((Date.now() - started) / 1000).toFixed(0)} s. Spot checks (predicted before they were fought): the stronger by rating won or drew level in ${rightWay} of ${checks.length}; K/D within ×2 in ${within2} of ${checks.length}, median miss ×${Math.exp(median).toFixed(2)}`);
  }
}
