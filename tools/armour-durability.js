// How many hits a man in each armour takes from each kind of pre-modern weapon before he is out (dead, knocked cold, or
// collapsed from the blood he has lost): fought, not read off the figures (tools/armour-benchmark.js reads them).
// The same man fights (a contender's body, in his trunks, his style's AI: its strokes, its footwork, stepping in to strike
// as he would in a bout) against the same man (a contender's body in the armour, style passive, his hands behind his back and
// nothing thinking for him: no guard, no parry, no step away). Every blow that lands counts, on the trunk, the head or an arm,
// whether it went in or the armour turned it (`glanced`: nothing of the edge or the point went in, or it glanced off plate or
// the helmet). Down but not out, he gets up as a man does and the fight goes on; the blood keeps running. Past `limit` hits
// (or `seconds` s) he is reported as `limit` (survived). Each armour against each weapon over `seeds` seeds; the median.
// Usage: node tools/armour-durability.js [out.json] [seeds=3] [workers=10]
//        node tools/armour-durability.js --one <kind> <design> <weapon> [seed]   (one run, printed)

import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld } from '../src/physics.js';
import { armourRows } from './armour-benchmark.js';

// The weapons: each a style, fought with its own strokes (the AI's choice among them, as in any bout).
export const WEAPONS = {
  sword: { label: 'Sword cut', style: 'katana', typical: 'katana: cuts and the thrust' },
  thrust: { label: 'Spear thrust', style: 'spear', typical: 'long spear: thrusts, jabs, the sweep' },
  polearm: { label: 'Glaive', style: 'guandao', typical: 'guandao: cuts, sweeps, the thrust' },
  mace: { label: 'Mace', style: 'mace', typical: 'flanged mace' },
  hammer: { label: 'War hammer', style: 'warhammer', typical: 'war hammer: face, beak and spike' },
  club: { label: 'Great club', style: 'kanabo', typical: 'kanabo, two-handed iron-studded club' },
};
export const SPEC = { limit: 40, seconds: 240, look: 0.5 };

/** One run: hits landed until he is out (or `limit`), how many of them glanced, and how it ended. */
export function hitsToOut(kind, design, weapon, seed) {
  const arms = WEAPONS[weapon];
  const world = createWorld([
    { inputs: { ...structuredClone(PRESETS.contender), style: arms.style }, corner: 'red' },
    { inputs: { ...structuredClone(PRESETS.contender), style: 'passive', outfit: { kind, design }, accessories: [] }, corner: 'blue' },
  ], { seed, arena: { halfX: 20, halfZ: 20 } });
  const [striker, man] = world.fighters;
  // No guard: his hands clasped behind his back (physics.js handsDown 'behind'), and nothing thinks for him (no parry, no step
  // away: he is left out of the thinking, as a man played is). A blow at his body still finds the upper arm hanging beside it
  // as often as the trunk (counted: a hit is a hit).
  man.handsDown = 'behind';
  const unthinking = new Set([man.id]);
  let hits = 0;
  let glanced = 0;
  let cursor = 0;
  for (let time = 0; time < SPEC.seconds && hits < SPEC.limit && man.state !== 'out'; time += SPEC.look) {
    advance(world, SPEC.look, (current, dt) => thinkAll(current, dt, unthinking));
    for (; cursor < world.events.length; cursor += 1) {
      const event = world.events[cursor];
      // (An arm in the way is 'blocked' by the physics; unguarded, it is a hit on the arm and what guards it.)
      const onArm = event.kind === 'blocked' && /Arm|Forearm/.test(event.target ?? '');
      if ((event.kind !== 'landed' && !onArm) || event.attacker !== striker.id || event.defender !== man.id) continue;
      hits += 1;
      // Turned: nothing of the edge or the point went in (an edged or pointed weapon), or the physics' own glance off plate or helmet.
      if ((event.edgeShare > 0.2 && !(event.cut > 0) && !(event.pierce > 0)) || event.effects.some((effect) => /glanced off/.test(effect))) glanced += 1;
    }
  }
  return { hits: man.state === 'out' ? hits : Math.max(hits, SPEC.limit), out: man.state === 'out', glanced };
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** One armour against every weapon over `seeds` seeds. */
function armourDurability(row, seeds) {
  const result = { key: row.key, weapons: {} };
  for (const weapon of Object.keys(WEAPONS)) {
    const runs = Array.from({ length: seeds }, (_, seed) => hitsToOut(row.kind, Number(row.key.split(':')[1]), weapon, seed + 1));
    result.weapons[weapon] = { hits: median(runs.map((run) => run.hits)), glanced: median(runs.map((run) => run.glanced)), survived: runs.filter((run) => !run.out).length };
  }
  return result;
}

if (!isMainThread) {
  for (const row of workerData.rows) parentPort.postMessage(armourDurability(row, workerData.seeds));
} else if (process.argv[2] === '--one') {
  const [, , , kind, design, weapon, seed = '1'] = process.argv;
  console.log(JSON.stringify(hitsToOut(kind, Number(design), weapon, Number(seed))));
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const [out, seeds = '3', workers = String(Math.max(1, cpus().length - 2))] = process.argv.slice(2);
  const rows = armourRows();
  const results = [];
  const started = Date.now();
  const lanes = Array.from({ length: Number(workers) }, (_, lane) => rows.filter((_, index) => index % Number(workers) === lane));
  await Promise.all(lanes.map((lane) => new Promise((done, fail) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { rows: lane, seeds: Number(seeds) } });
    worker.on('message', (result) => {
      results.push(result);
      if (results.length % 10 === 0) console.log(`${results.length}/${rows.length} armours, ${((Date.now() - started) / 60000).toFixed(1)} min`);
    });
    worker.on('error', fail);
    worker.on('exit', done);
  })));
  if (out) writeFileSync(out, JSON.stringify({ spec: SPEC, weapons: WEAPONS, rows: results }, null, 1));
  console.log(`${results.length} armours in ${((Date.now() - started) / 60000).toFixed(1)} min`);
}
