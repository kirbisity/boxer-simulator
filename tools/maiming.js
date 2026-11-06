// A limb lost in the thick of a battle (maiming.js), measured: for each kind
// of man (an elite, the middling sort, a levy) and each limb (the hand, the
// forearm, the arm at the shoulder, the leg at the hip, the leg at the knee),
// over many seeds: a small battle of his own kind against his own kind is
// fought until the lines meet (adrenaline and fear as the fight has made
// them), then one man in the thick of it loses the limb (cutOff, with
// the bleeding of the cut itself), and the fight goes on. Of those men:
// - flee: the share who broke at once (panicked or crawled away within
//   FLEE_WITHIN s of it), and of them the share who crawled; of the men who
//   had the time to (cut8: the share cut down in those seconds before they
//   broke, a maimed man in the press being easy to kill, counted apart);
// - fight: of the rest, the median seconds he fought on (until he broke, was
//   cut down, collapsed, or the fight was over: still fighting at the end
//   counts as the time watched), and the share who were still fighting
//   when the blood dropped them;
// - collapse, death: the median seconds from the cut to the blood loss that
//   collapses him (physics.js collapseAt) and that kills him (deathAt), from
//   his bleeding alone (whatever else was done to him), '—' if fewer than half
//   get there; and the share who die of it untreated.
// Usage: node tools/maiming.js [seeds=24] [units=oyoroi,plate,mingBrigSpear,footSpear,ashigaruSpear,peasant] [limbs=wrist,elbow,shoulder,hip,knee]
// (TRY='MAIMING.adrenaline=0.4;AI.panic.rate=0.5' tries values first, as tools/levels.js does)

import { AI, confidence, fearTarget, thinkAll, stillFighting } from '../src/ai.js';
import { BODY, P } from '../src/body.js';
import { advance, collapseAt, createWorld, cutOff, deathAt, inFight, nearestOpponent, seededRandom } from '../src/physics.js';
import { drilledSoldier } from '../src/cast.js';
import { WARRIORS } from '../src/roster.js';
import { BLADES } from '../src/weapons.js';
import { MAIMING, stepVessels } from '../src/maiming.js';

/** Values tried before the run (TRY='MAIMING.adrenaline=0.4;AI.panic.rate=0.5'). */
function tryValues(spec = '') {
  // SHOCK=k: every joint's shock times k (a quick way to scan it).
  if (process.env.SHOCK) for (const joint of Object.keys(MAIMING.shock)) MAIMING.shock[joint] *= Number(process.env.SHOCK);
  const tables = { AI, MAIMING };
  for (const pair of spec.split(';').filter(Boolean)) {
    const [path, value] = pair.split('=');
    const keys = path.split('.');
    let at = tables[keys.shift()];
    while (keys.length > 1) at = at[keys.shift()];
    at[keys[0]] = Number(value);
  }
}

// s: breaking within this long of the cut counts as at once.
const FLEE_WITHIN = 8;
// s: the battle fought before the cut: from the lines meeting, this long (at most BEFORE in all); and the longest watched after it.
const AFTER_CONTACT = 1.5;
const BEFORE = 15;
const WATCH = Number(process.env.WATCH ?? 90);
const SIDE = 5;
const STEP = 0.1;

export const TIERS = { oyoroi: 'elite', plate: 'elite', mingBrigSpear: 'mid', footSpear: 'mid', ashigaruSpear: 'mid', peasant: 'levy', starved: 'levy' };
export const LIMBS = { wrist: 'hand', elbow: 'forearm', shoulder: 'upper arm', hip: 'thigh', knee: 'shank' };

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Seconds from now until his blood lost reaches `share`, from his bleeding alone (null past `most` s). */
function bleedsTo(fighter, share, most = 1800) {
  const ghost = { bleed: fighter.bleed ?? 0, vessels: (fighter.vessels ?? []).map((vessel) => ({ ...vessel })) };
  let lost = fighter.bloodLost ?? 0;
  for (let t = 0; t < most; t += 0.5) {
    if (lost >= share) return t;
    lost += ghost.bleed * 0.5 + stepVessels(ghost, 0.5);
    ghost.bleed *= Math.exp(-0.5 / BLADES.clotSeconds);
  }
  return null;
}

/** One battle at a seed: his kind against his kind, and one man's limb off in the thick of it. What became of him. */
export function maimOnce(unit, joint, seed) {
  const inputs = WARRIORS.find((warrior) => warrior.key === unit).inputs;
  // Each man his unit's, varied in build (height, weight, age, fitness: cast.js drilledSoldier), so each surges as his body does.
  const random = seededRandom(seed * 7919);
  const entries = ['red', 'blue'].flatMap((corner) => Array.from({ length: SIDE }, () => ({ inputs: drilledSoldier(inputs, random), corner })));
  const world = createWorld(entries, { seed, arena: { halfX: 14, halfZ: 9 } });
  const think = (current, dt) => thinkAll(current, dt);
  // Until the lines meet (the first blow landed between them), and a moment more.
  let contact = null;
  for (let t = 0; t < BEFORE && (contact === null || world.time < contact + AFTER_CONTACT); t += STEP) {
    const from = world.events.length;
    advance(world, STEP, think);
    if (contact === null && world.events.slice(from).some((event) => event.kind === 'landed' && world.fighters[event.defender]?.corner !== world.fighters[event.attacker]?.corner)) contact = world.time;
  }
  // The red man nearest an enemy, still fighting.
  const enemies = world.fighters.filter((fighter) => fighter.corner === 'blue' && inFight(fighter));
  const apart = (a, b) => Math.hypot(a.x[P.pelvis * 3] - b.x[P.pelvis * 3], a.x[P.pelvis * 3 + 2] - b.x[P.pelvis * 3 + 2]);
  const candidates = world.fighters.filter((fighter) => fighter.corner === 'red' && stillFighting(fighter) && fighter.state === 'up');
  if (!candidates.length || !enemies.length) return null;
  const nearest = (fighter) => Math.min(...enemies.map((enemy) => apart(fighter, enemy)));
  const man = candidates.sort((a, b) => nearest(a) - nearest(b))[0];
  const foe = enemies.sort((a, b) => apart(man, a) - apart(man, b))[0];
  const side = world.random() < 0.5 ? 'l' : 'r';
  const at = world.time;
  const adrenaline = man.adrenaline ?? 0;
  const weaponBefore = Boolean(man.weapon?.held);
  const fearBefore = man.fear ?? 0;
  cutOff(world, man, { joint, side }, foe, BLADES.sever[joint][0] * BODY.toughness * 1.3);
  const fighting = (fighter) => fighter.state !== 'out' && !fighter.panicked && !fighter.fled && (fighter.groundFight || stillFighting(fighter) || fighter.state !== 'up');
  let stopped = null;
  let broke = null;
  let crawled = false;
  let adrenalineAfter = null;
  let target = null;
  let armed = null;
  let cutDown = null;
  for (let t = 0; t < WATCH; t += STEP) {
    advance(world, STEP, think);
    if (broke === null && (man.panicked || (man.crawling && !man.crawlChosen))) {
      broke = world.time - at;
      crawled = Boolean(man.crawling);
    }
    if (stopped === null && !fighting(man)) stopped = world.time - at;
    if (adrenalineAfter === null && world.time - at >= 1) adrenalineAfter = man.adrenaline ?? 0;
    if (armed === null) armed = weaponBefore && Boolean(man.weapon?.held);
    if (target === null && world.time - at >= 2) {
      const other = nearestOpponent(world, man);
      target = other ? fearTarget(world, man, confidence(man, other, world), other) : 0;
    }
    if (cutDown === null && man.state === 'out' && !world.events.some((event) => event.kind === 'bledOut' && event.fighter === man.id)) cutDown = world.time - at;
    if (stopped !== null && broke !== null) break;
    if (stopped !== null && man.state === 'out') break;
  }
  if (broke !== null && !crawled && man.crawling) crawled = true;
  const collapse = man.bloodLost >= collapseAt() ? world.events.find((event) => event.kind === 'bledOut' && event.fighter === man.id)?.time - at : null;
  const toCollapse = collapse ?? (bleedsTo(man, collapseAt()) === null ? null : world.time - at + bleedsTo(man, collapseAt()));
  const toDeath = bleedsTo(man, deathAt()) === null ? null : world.time - at + bleedsTo(man, deathAt());
  const bledDown = world.events.some((event) => event.kind === 'bledOut' && event.fighter === man.id);
  return { broke, crawled, stopped: stopped ?? WATCH, bledDown, toCollapse, toDeath, adrenaline, adrenalineAfter, target, armed, cutDown, fearBefore, clamped: man.vessels?.some((vessel) => vessel.clamped) ?? false };
}

/** One row of the table: what became of the men of `unit` who lost the limb at `joint`, over their runs. */
export function summarise(unit, joint, runs) {
  // (A man cut down before he broke, within the first seconds, never chose: not counted either way.)
  const cutFirst = (run) => run.cutDown !== null && run.cutDown <= FLEE_WITHIN && (run.broke === null || run.broke > run.cutDown);
  const chose = runs.filter((run) => !cutFirst(run));
  const fled = chose.filter((run) => run.broke !== null && run.broke <= FLEE_WITHIN);
  const stayed = chose.filter((run) => !(run.broke !== null && run.broke <= FLEE_WITHIN));
  const collapses = runs.filter((run) => run.toCollapse !== null);
  const deaths = runs.filter((run) => run.toDeath !== null);
  return {
    unit, tier: TIERS[unit] ?? '?', limb: LIMBS[joint], joint, runs: runs.length,
    flee: fled.length / Math.max(1, chose.length),
    // Of them, those left a weapon in hand by the cut (the off hand lost, a leg), and those it disarmed (the weapon hand).
    fleeArmed: fled.filter((run) => run.armed).length / Math.max(1, chose.filter((run) => run.armed).length),
    fleeDisarmed: fled.filter((run) => !run.armed).length / Math.max(1, chose.filter((run) => !run.armed).length),
    crawl: fled.filter((run) => run.crawled).length / Math.max(1, fled.length),
    fight: median(stayed.map((run) => run.stopped)),
    foughtToCollapse: stayed.filter((run) => run.bledDown && run.broke === null).length / Math.max(1, stayed.length),
    collapse: collapses.length * 2 >= runs.length ? median(runs.map((run) => run.toCollapse ?? Infinity)) : null,
    death: deaths.length * 2 >= runs.length ? median(runs.map((run) => run.toDeath ?? Infinity)) : null,
    dies: deaths.length / Math.max(1, runs.length),
    clamped: runs.filter((run) => run.clamped).length / Math.max(1, runs.length),
    fearBefore: runs.reduce((sum, run) => sum + run.fearBefore, 0) / Math.max(1, runs.length),
    // Cut down (out, not by the blood) before he broke, within FLEE_WITHIN s; and his adrenaline a second after the cut.
    cutDown: runs.filter(cutFirst).length / Math.max(1, runs.length),
    adrenalineAfter: runs.reduce((sum, run) => sum + (run.adrenalineAfter ?? 0), 0) / Math.max(1, runs.length),
    all: runs,
  };
}

/** The runs of one unit and limb over `seeds` seeds from `firstSeed`. */
export function maimRuns(unit, joint, seeds, firstSeed = 1) {
  const runs = [];
  for (let seed = firstSeed; seed < firstSeed + seeds; seed += 1) {
    const run = maimOnce(unit, joint, seed);
    if (run) runs.push(run);
  }
  return runs;
}

/** The table: per unit and limb, over `seeds` battles (in this thread). */
export function maimTable({ seeds = 24, units = Object.keys(TIERS), limbs = Object.keys(LIMBS), firstSeed = 1 } = {}) {
  return units.flatMap((unit) => limbs.map((joint) => summarise(unit, joint, maimRuns(unit, joint, seeds, firstSeed))));
}

/** The same table, the unit-and-limb pairs shared out over `threads` worker threads. */
async function maimTableParallel({ seeds, units, limbs, threads }) {
  const { Worker } = await import('node:worker_threads');
  const jobs = units.flatMap((unit) => limbs.map((joint) => ({ unit, joint })));
  const results = new Array(jobs.length);
  let next = 0;
  const work = () => new Promise((resolve, reject) => {
    const take = () => {
      if (next >= jobs.length) return resolve();
      const index = next++;
      const worker = new Worker(new URL(import.meta.url), { workerData: { ...jobs[index], seeds, tried: process.env.TRY ?? '' } });
      worker.once('message', (runs) => {
        results[index] = summarise(jobs[index].unit, jobs[index].joint, runs);
        worker.terminate();
        take();
      });
      worker.once('error', reject);
    };
    take();
  });
  await Promise.all(Array.from({ length: Math.min(threads, jobs.length) }, work));
  return results;
}

const { isMainThread, parentPort, workerData } = await import('node:worker_threads');
if (!isMainThread && workerData?.unit) {
  tryValues(workerData.tried);
  parentPort.postMessage(maimRuns(workerData.unit, workerData.joint, workerData.seeds));
} else if (import.meta.url === `file://${process.argv[1]}`) {
  tryValues(process.env.TRY);
  const seeds = Number(process.argv[2] ?? 24);
  const units = process.argv[3] ? process.argv[3].split(',') : Object.keys(TIERS);
  const limbs = process.argv[4] ? process.argv[4].split(',') : Object.keys(LIMBS);
  const threads = Number(process.env.THREADS ?? 8);
  const pct = (value) => `${Math.round(value * 100)}%`.padStart(5);
  const sec = (value) => (value === null || value === undefined || !Number.isFinite(value) ? '—' : `${Math.round(value)}`).padStart(6);
  console.log(`${'unit'.padEnd(14)}${'tier'.padEnd(6)}${'limb'.padEnd(11)}   n  flee armd unarm crawl  fight  →coll  collapse  death  dies clamp  fear0  adr1 cut8`);
  const line = (row, name, tier) => console.log(`${name.padEnd(14)}${tier.padEnd(6)}${row.limb.padEnd(11)}${String(row.runs).padStart(4)} ${pct(row.flee)} ${pct(row.fleeArmed)} ${pct(row.fleeDisarmed)} ${pct(row.crawl)} ${sec(row.fight)} ${pct(row.foughtToCollapse)}    ${sec(row.collapse)} ${sec(row.death)} ${pct(row.dies)} ${pct(row.clamped)} ${pct(row.fearBefore)} ${pct(row.adrenalineAfter)} ${pct(row.cutDown)}`);
  const rows = await maimTableParallel({ seeds, units, limbs, threads });
  for (const row of rows) line(row, row.unit, row.tier);
  // By tier: the runs of its units together.
  console.log('');
  for (const tier of [...new Set(units.map((unit) => TIERS[unit] ?? '?'))]) {
    for (const joint of limbs) {
      const runs = rows.filter((row) => row.tier === tier && row.joint === joint).flatMap((row) => row.all);
      line(summarise(`(${tier})`, joint, runs), `all ${tier}`, tier);
    }
  }
}
