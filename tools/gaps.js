// How often blades find the gaps in rigid armour (BLADES.gaps), read off whole bouts: for each attacker against each
// armoured man, of the thrusts (and the edges) he lands on a part in rigid armour, the share that went into a gap; the
// gap zones they met (physics gapZoneAt); the bouts' record; and how each lost man died: the blow that ended it, whether
// it went into a gap, and whether it was the first that wounded him (a one-shot kill).
// Usage: node tools/gaps.js [bouts from each corner = 6] [seconds = 120] [workers = 8] [attackers,...] [defenders,...]

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld, protectionAt } from '../src/physics.js';
import { WARRIORS } from '../src/roster.js';
import { BLADES } from '../src/weapons.js';

const byKey = new Map(WARRIORS.map((warrior) => [warrior.key, warrior.inputs]));
// A knight with his rondel dagger in hand: the weapon made to find the gaps.
byKey.set('rondel', { ...byKey.get('plate'), style: 'dagger' });
const ATTACKERS = ['tosei', 'vocPikeman', 'footSpear', 'rondel'];
const DEFENDERS = ['plate', 'mingGuandao', 'sipahi', 'kanabo'];
const GAP = 'into a gap in the armour';

/** One bout of `a` (red) against `b` (blue), or the other way round: what `a` landed on `b`, and how it ended. */
function bout(a, b, seed, seconds, aRed) {
  const red = aRed ? a : b;
  const blue = aRed ? b : a;
  const world = createWorld([{ inputs: structuredClone(byKey.get(red)), corner: 'red' }, { inputs: structuredClone(byKey.get(blue)), corner: 'blue' }], { seed });
  for (let second = 0; second < seconds && !boutWinner(world); second += 1) advance(world, 1, (current, dt) => thinkAll(current, dt));
  const attacker = world.fighters[aRed ? 0 : 1];
  const defender = world.fighters[aRed ? 1 : 0];
  const tally = { thrust: { rigid: 0, gaps: 0 }, swing: { rigid: 0, gaps: 0 }, zones: {} };
  const wounding = { [attacker.id]: 0, [defender.id]: 0 };
  let end = null;
  for (const event of world.events) {
    if (event.kind === 'landed' && event.target && !event.haft) {
      const by = world.fighters[event.attacker];
      const on = world.fighters[event.defender];
      if (by === attacker && on === defender) {
        const covered = protectionAt(defender.body.gear, event.target);
        const rigid = (covered.cut ?? 0) >= (defender.body.gear.gaps?.rigidFrom ?? BLADES.gaps.rigidFrom);
        const mode = event.mode === 'thrust' ? 'thrust' : 'swing';
        if (rigid && event.edgeShare > 0.2) {
          tally[mode].rigid += 1;
          if (event.effects.includes(GAP)) tally[mode].gaps += 1;
          const part = event.target === 'head' ? `head(${defender.body.gear.helmFace})` : event.target === 'trunk' ? 'trunk' : 'limb';
          if (mode === 'thrust') tally.zones[`${part}:${event.gapZone ?? 'solid'}`] = (tally.zones[`${part}:${event.gapZone ?? 'solid'}`] ?? 0) + 1;
        }
      }
      if (on && (event.cut ?? 0) + (event.pierce ?? 0) > 0.5) {
        on.firstWound ??= event;
        wounding[on.id] = (wounding[on.id] ?? 0) + 1;
      }
    }
    if ((event.kind === 'killed' || event.kind === 'knockout') && !end) {
      const fallen = world.fighters[event.fighter];
      const blow = [...world.events].reverse().find((other) => other.kind === 'landed' && other.defender === fallen.id && other.time <= event.time);
      end = { loser: fallen === attacker ? 'a' : 'b', reason: event.effects[0], gap: Boolean(blow?.effects.includes(GAP)), mode: blow?.mode, target: blow?.target, oneShot: Boolean(blow && fallen.firstWound === blow) };
    }
  }
  const winner = boutWinner(world);
  const result = winner ? ((winner === 'red') === aRed ? 'win' : 'loss') : 'draw';
  return { tally, result, end };
}

/** `a` against `b`, `bouts` from each corner: what he landed on rigid armour, the gaps it found, the record and the deaths. */
export function pairing(a, b, bouts, seconds = 120) {
  const out = { a, b, thrust: { rigid: 0, gaps: 0 }, swing: { rigid: 0, gaps: 0 }, zones: {}, record: { win: 0, loss: 0, draw: 0 }, deaths: [] };
  for (let index = 0; index < bouts; index += 1) {
    for (const aRed of [true, false]) {
      const { tally, result, end } = bout(a, b, 900 + index, seconds, aRed);
      for (const mode of ['thrust', 'swing']) for (const key of ['rigid', 'gaps']) out[mode][key] += tally[mode][key];
      for (const [zone, count] of Object.entries(tally.zones)) out.zones[zone] = (out.zones[zone] ?? 0) + count;
      out.record[result] += 1;
      if (end) out.deaths.push(end);
    }
  }
  return out;
}

const share = (part, whole) => (whole ? `${((100 * part) / whole).toFixed(1)}%` : '-');

function report(results) {
  for (const r of results) {
    const lostB = r.deaths.filter((end) => end.loser === 'b');
    console.log(`${r.a} v ${r.b}: ${r.record.win}-${r.record.loss}-${r.record.draw}; thrusts on rigid ${r.thrust.rigid}, into a gap ${r.thrust.gaps} (${share(r.thrust.gaps, r.thrust.rigid)}); edges on rigid ${r.swing.rigid}, gaps ${r.swing.gaps} (${share(r.swing.gaps, r.swing.rigid)})`);
    console.log(`   thrusts by zone ${JSON.stringify(r.zones)}`);
    console.log(`   ${r.b} fell ${lostB.length}: ${lostB.map((end) => `${end.reason} [${end.mode ?? '?'} ${end.target ?? '?'}${end.gap ? ' GAP' : ''}${end.oneShot ? ' ONE-SHOT' : ''}]`).join('; ')}`);
  }
}

const [mode, ...args] = process.argv.slice(2);
const main = import.meta.url === `file://${process.argv[1]}`;
if (main && mode === 'pairs') {
  const { pairs, bouts, seconds } = JSON.parse(args[0]);
  process.send(pairs.map(([a, b]) => pairing(a, b, bouts, seconds)));
} else if (main) {
  const bouts = Number(mode ?? 6);
  const seconds = Number(args[0] ?? 120);
  const workers = Number(args[1] ?? 8);
  const attackers = args[2] ? args[2].split(',') : ATTACKERS;
  const defenders = args[3] ? args[3].split(',') : DEFENDERS;
  const pairs = attackers.flatMap((a) => defenders.filter((b) => b !== a).map((b) => [a, b]));
  const shares = Array.from({ length: Math.min(workers, pairs.length) }, (_, index) => pairs.filter((_, at) => at % workers === index));
  const started = performance.now();
  const results = (await Promise.all(shares.map((own) => new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(import.meta.url), ['pairs', JSON.stringify({ pairs: own, bouts, seconds })]);
    child.on('message', resolve);
    child.on('error', reject);
  })))).flat();
  results.sort((x, y) => pairs.findIndex(([a, b]) => a === x.a && b === x.b) - pairs.findIndex(([a, b]) => a === y.a && b === y.b));
  report(results);
  const all = results.reduce((sum, r) => ({ rigid: sum.rigid + r.thrust.rigid, gaps: sum.gaps + r.thrust.gaps }), { rigid: 0, gaps: 0 });
  const zones = {};
  for (const r of results) for (const [zone, count] of Object.entries(r.zones)) zones[zone] = (zones[zone] ?? 0) + count;
  const parts = {};
  for (const [zone, count] of Object.entries(zones)) {
    const [part, name] = zone.split(':');
    parts[part] ??= { all: 0, zoned: 0 };
    parts[part].all += count;
    if (name !== 'solid') parts[part].zoned += count;
  }
  console.log(`thrusts by part and zone ${JSON.stringify(zones)}`);
  console.log(`share of thrusts on rigid in a zone, by part: ${Object.entries(parts).map(([part, { all, zoned }]) => `${part} ${share(zoned, all)} of ${all}`).join(', ')}`);
  console.log(`all: thrusts on rigid ${all.rigid}, into a gap ${share(all.gaps, all.rigid)}; ${((performance.now() - started) / 1000).toFixed(0)} s`);
}
