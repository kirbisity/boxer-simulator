// Fighting ratings against a panel. Every rating is a Bradley-Terry strength
// fitted to all the bouts at once (his odds of beating a man of strength r are
// s/r; a draw half each way, half a bout either way added), Maximus held at 100,
// so a score is proportional to inferred K/D. Which bouts are fought:
//   1. The panel: a few men spread over the range of strengths (the two
//      references, Maximus and the monk, and those nearest given quantiles of
//      the last table), each against each, to place them well.
//   2. Everyone against every man on the panel.
//   3. Everyone against the men nearest him by the strength so fitted: the
//      panel places a man roughly; a near match says how far he really is
//      (and places those weaker or stronger than the whole panel).
//   4. Spot checks: pairs drawn at random, predicted before they are fought,
//      to say how well the ratings hold.
// Every pairing is fought adaptively: two bouts at a time (each man from each
// corner), stopped once it is settled (RATING.settle), else at most its cap.
// Writes src/ratings.js (generated: do not edit by hand).
// Usage: node tools/ratings.js [max bouts a pairing = 6] [workers = 10] [spot checks = 12]
//        node tools/ratings.js groups               (print the groups, fight nothing)
//        node tools/ratings.js pairs JSON MAX   (a worker: one share of the pairings; sends their records)
import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PRESETS } from '../src/body.js';
import { hurtShare, thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld, seededRandom } from '../src/physics.js';
import { WARRIORS } from '../src/roster.js';
import { factionOf } from '../src/outfits.js';
import { STYLES } from '../src/moves.js';

// The references, by roster key; each bout lasts at most this long (s).
export const RATING = {
  references: { maximus: PRESETS.maximus, monk: PRESETS.staff }, seconds: 120, firstSeed: 900,
  // A pairing is settled after at least `minBouts` once one side has won `share` of them (draws half), else fought to its cap.
  settle: { minBouts: 4, share: 0.85 },
  // The panel besides the references: the men nearest these quantiles of the last table's scores. Five spread over the
  // range (a 100-fold one, a macaque to a bayara) put a near match within about ×2-3 of every man, where a pairing says most.
  panelQuantiles: [0.1, 0.3, 0.5, 0.7, 0.9],
  // The panel's own pairings are fought to this many bouts: every rating hangs on where the panel sits.
  panelBouts: 12,
  // Then each man against this many nearest by fitted strength (not already met).
  nearest: 2,
  // A bout's score (0..1, to the first man): `health` of it from how much of each was left at the end (half and half: his health
  // left less the other's, a man out having none), the rest from who won (a win 1, a draw a half). A win at full health is 1;
  // a win barely alive ~0.75; a draw the healthier ahead.
  health: 0.5,
};

/**
 * The era a man fights in, by his kit (else his faction): `ancient` (Rome, the arena, Han), `medieval` (to the 1400s),
 * `earlyModern` (the 1500s-1600s: pike and shot, the Ming and the banners, the Sengoku, the conquest of Mexico),
 * `modern` (the 1800s on: police, soldiers, the ring and the street, machines) and `beasts`.
 */
export const ERAS = {
  byFaction: { gladiators: 'ancient', romans: 'ancient', knights: 'medieval', steppe: 'medieval', ottomans: 'earlyModern', manchu: 'earlyModern', mexica: 'earlyModern', japanese: 'earlyModern', chinese: 'earlyModern', law: 'modern', street: 'modern', ring: 'modern', machines: 'modern', primates: 'beasts' },
  byKit: {
    hanSoldier: 'ancient', guanYu: 'ancient',
    ironPagoda: 'medieval', wuxia: 'medieval', oyoroi: 'medieval', samurai: 'medieval', sohei: 'medieval', saladin: 'medieval', gaziAlp: 'medieval',
    tournament: 'earlyModern', conquistadorPlate: 'earlyModern', conquistadorQuilted: 'earlyModern',
    kungfu: 'modern',
  },
  // A medieval foot soldier with a gun is pike and shot.
  byWeapon: { matchlock: 'earlyModern' },
};

/** Weapon families: like weapons, rated together first. A style with no weapon fights bare-handed. */
export const WEAPON_FAMILIES = {
  spear: ['longSpear', 'spear', 'yari', 'tepoztopilli', 'trident', 'pitchfork', 'lance'],
  polearm: ['guandao', 'qinglong', 'naginata'],
  blade: ['longsword', 'armingSword', 'katana', 'odachi', 'espada', 'gladius', 'sica', 'saber', 'sayf', 'dao', 'yatagan', 'jian', 'rapier', 'macuahuitl', 'knife'],
  blunt: ['warhammer', 'flangedMace', 'kanabo', 'langya', 'clava', 'baton', 'bat', 'staff', 'whip'],
  bow: ['bow', 'yumi', 'compositeBow', 'manchuBow'],
  crossbow: ['crossbow', 'nu'],
  gun: ['matchlock', 'threeEyed', 'rifle', 'armRifle', 'shotgun', 'pistol', 'adams', 'turretRifle', 'flamethrower'],
};

/** A warrior's place in the tiers: era, range ('ranged' or 'close'), weapon family, faction. */
export function tierOf(warrior) {
  const style = STYLES[warrior.inputs.style] ?? {};
  const weapon = style.weapon ?? null;
  const family = Object.keys(WEAPON_FAMILIES).find((name) => WEAPON_FAMILIES[name].includes(weapon)) ?? (weapon ? 'other' : 'bare');
  const faction = factionOf(warrior.inputs) ?? 'none';
  const kit = warrior.inputs.outfit?.kind;
  const era = ERAS.byWeapon[weapon] ?? ERAS.byKit[kit] ?? ERAS.byFaction[faction] ?? 'modern';
  return { era, range: style.ranged ? 'ranged' : 'close', family, faction };
}

/** Group keys by a function of their tier: { name: [keys] }. */
export function groupBy(keys, tiers, nameOf) {
  const groups = {};
  for (const key of keys) (groups[nameOf(tiers[key])] ??= []).push(key);
  return groups;
}

/** One bout: who wins ('red', 'blue' or null for a draw at the bell), and red's score (boutScore). */
function bout(red, blue, seed) {
  const world = createWorld([{ inputs: structuredClone(red), corner: 'red' }, { inputs: structuredClone(blue), corner: 'blue' }], { seed });
  for (let second = 0; second < RATING.seconds && !boutWinner(world); second += 1) advance(world, 1, (current, dt) => thinkAll(current, dt));
  const winner = boutWinner(world);
  const left = (fighter) => (fighter.state === 'out' ? 0 : 1 - hurtShare(fighter));
  return { winner, score: boutScore(winner === 'red' ? 1 : winner === 'blue' ? 0 : 0.5, left(world.fighters[0]), left(world.fighters[1])) };
}

/** A bout's score to the first man (RATING.health): the result (1, a half, 0) and the health each had left (0..1). */
export function boutScore(result, mine, theirs) {
  return (1 - RATING.health) * result + RATING.health * (0.5 + 0.5 * (mine - theirs));
}

/** Add one pair of bouts (a as red, then as blue) to a's tally: wins, losses, draws and the summed score. */
function tallyPair(tally, asRed, asBlue) {
  if (asRed.winner === 'red') tally.wins += 1; else if (asRed.winner === 'blue') tally.losses += 1; else tally.draws += 1;
  if (asBlue.winner === 'blue') tally.wins += 1; else if (asBlue.winner === 'red') tally.losses += 1; else tally.draws += 1;
  tally.score += asRed.score + (1 - asBlue.score);
}

/** A record's score: its summed bout scores (an older record without one: its wins and half its draws). */
export const scoreOf = (record) => record.score ?? record.wins + record.draws / 2;
/** How many bouts a record holds. */
const boutsOf = (record) => record.wins + record.losses + record.draws;

/** A character's record against one reference: `bouts` from each corner. */
export function record(inputs, reference, bouts) {
  const tally = { wins: 0, losses: 0, draws: 0, score: 0 };
  for (let index = 0; index < bouts; index += 1) {
    const seed = RATING.firstSeed + index;
    tallyPair(tally, bout(inputs, reference, seed), bout(reference, inputs, seed));
  }
  return tally;
}

/** A pairing fought until it is settled (RATING.settle) or `most` bouts: a's record against b. */
export function settledRecord(a, b, most) {
  const tally = { wins: 0, losses: 0, draws: 0, score: 0 };
  for (let index = 0; boutsOf(tally) < most; index += 1) {
    const seed = RATING.firstSeed + index;
    tallyPair(tally, bout(a, b, seed), bout(b, a, seed));
    const fought = boutsOf(tally);
    const share = tally.score / fought;
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
    const won = scoreOf(record) + 0.5;
    const lost = boutsOf(record) - scoreOf(record) + 0.5;
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
    won[a] += scoreOf(record) + 0.5;
    won[b] += boutsOf(record) - scoreOf(record) + 0.5;
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
  if (mode === 'groups') {
    const tiers = Object.fromEntries(WARRIORS.map((warrior) => [warrior.key, tierOf(warrior)]));
    const groups = groupBy(WARRIORS.map((warrior) => warrior.key), tiers, (t) => `${t.era}|${t.range}|${t.family}`);
    for (const [name, members] of Object.entries(groups).sort()) console.log(`${name.padEnd(28)} ${members.map((key) => byKey[key].title).join(', ')}`);
  } else if (mode === 'pairs') {
    // A share of the pairings: each [a, b], a's record against b, fought until settled.
    const [pairs, most] = [JSON.parse(args[0]), Number(args[1])];
    process.send(pairs.map(([a, b]) => ({ a, b, record: settledRecord(inputsOf(a), inputsOf(b), most) })));
  } else {
    const most = Number(mode ?? 6);
    const workers = Number(args[0] ?? 10);
    const spotChecks = Number(args[1] ?? 12);
    const started = Date.now();
    const games = [];
    let bouts = 0;
    const fought = new Set();
    const keyOf = (a, b) => [a, b].sort().join('|');
    const fight = async (label, pairs, cap = most) => {
      const fresh = pairs.filter(([a, b]) => a !== b && !fought.has(keyOf(a, b)));
      for (const [a, b] of fresh) fought.add(keyOf(a, b));
      const results = await inParallel('pairs', fresh, cap, workers);
      const count = results.reduce((sum, { record: tally }) => sum + tally.wins + tally.losses + tally.draws, 0);
      bouts += count;
      console.log(`${label}: ${results.length} pairings, ${count} bouts (${(count / Math.max(1, results.length)).toFixed(1)} each), ${((Date.now() - started) / 1000).toFixed(0)} s`);
      return results;
    };
    const keys = WARRIORS.map((warrior) => warrior.key);
    const factionOfKey = Object.fromEntries(WARRIORS.map((warrior) => [warrior.key, factionOf(warrior.inputs) ?? 'none']));
    // 1. The panel: the references, and the men nearest the quantiles of the last table (a man new to the roster has none).
    const { RATINGS: last } = await import('../src/ratings.js');
    const lastScores = keys.filter((key) => last.characters[key]).map((key) => [key, last.characters[key].score]).sort((x, y) => x[1] - y[1]);
    const panel = [...new Set([...Object.values(referenceKey), ...RATING.panelQuantiles.map((quantile) => lastScores[Math.round(quantile * (lastScores.length - 1))][0])])];
    console.log(`panel: ${panel.map((key) => byKey[key].title).join(', ')}`);
    const panelPairs = [];
    for (let i = 0; i < panel.length; i += 1) for (let j = i + 1; j < panel.length; j += 1) panelPairs.push([panel[i], panel[j]]);
    games.push(...await fight('1. the panel, each against each', panelPairs, RATING.panelBouts));
    // 2. Everyone against the panel.
    games.push(...await fight('2. everyone against the panel', keys.filter((key) => !panel.includes(key)).flatMap((key) => panel.map((member) => [key, member]))));
    let strength = fitAll(games, 'maximus');
    // 3. Everyone against the nearest by that fit.
    const nearestTo = (key) => keys.filter((other) => other !== key && !fought.has(keyOf(key, other))).sort((x, y) => Math.abs(Math.log(strength[x] / strength[key])) - Math.abs(Math.log(strength[y] / strength[key]))).slice(0, RATING.nearest);
    games.push(...await fight('3. everyone against the nearest', keys.flatMap((key) => nearestTo(key).map((other) => [key, other]))));
    strength = fitAll(games, 'maximus');
    const provisional = { ...strength };
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
          if (b === key && a === reference) out[name] = { wins: tally.losses, losses: tally.wins, draws: tally.draws, score: boutsOf(tally) - scoreOf(tally) };
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
    const header = `// GENERATED by tools/ratings.js (everyone against a panel of ${panel.length} (${panel.join(', ')}), then the ${RATING.nearest} nearest by strength; ${spots.length} spot checks; each pairing fought until settled, at most ${most} bouts; ${bouts} bouts in all) — do not edit by hand; re-run the tool.\n// Score = strength fitted to all those bouts at once (Bradley-Terry), Maximus held at 100: ∝ inferred K/D.\n`;
    const body = `export const RATINGS = ${JSON.stringify({ references: Object.keys(RATING.references), bouts: most, totalBouts: bouts, characters, types, cross: crossRecords }, null, 1)};\n`;
    writeFileSync(new URL('../src/ratings.js', import.meta.url), header + body);
    for (const entry of [...rated].sort((a, b) => strength[b.key] - strength[a.key])) console.log(`${String(entry.score).padStart(6)}  (before spot checks ${String(entry.provisional).padStart(5)})  ${entry.title.padEnd(26)} ${entry.faction.padEnd(11)} ${entry.type}`);
    const median = [...misses].sort((x, y) => x - y)[Math.floor(misses.length / 2)] ?? 0;
    const within2 = misses.filter((miss) => miss < Math.log(2)).length;
    console.log(`${rated.length} characters, ${fought.size} pairings, ${bouts} bouts, ${((Date.now() - started) / 1000).toFixed(0)} s. Spot checks (predicted before they were fought): the stronger by rating won or drew level in ${rightWay} of ${checks.length}; K/D within ×2 in ${within2} of ${checks.length}, median miss ×${Math.exp(median).toFixed(2)}`);
  }
}
