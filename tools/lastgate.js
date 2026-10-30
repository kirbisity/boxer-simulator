// The Last Gate, headless: each mode's hero with his men (or alone), the hero fought by the AI (held to his post as his men
// are), until the gate falls or the time runs out; how long it held, the kills (the hero's by the minute: the escalation),
// the breaches' times, the wave reached and the most men on their feet; with several seeds, the median held of each row.
// Usage: node tools/lastgate.js [modes=samurai,knight,mongol,police] [companions=5,0] [seconds=600] [seeds=1] [--trace]
// (`seeds` a number, or a list: 3 runs seeds 1–3; 4,7 runs those two.)

import { thinkAll } from '../src/ai.js';
import { advance } from '../src/physics.js';
import { createLastGate, LAST_GATE_MODE_KEYS, lastGateClock, lastGateResult, stepLastGate } from '../src/lastgate.js';

/** One run, fought out headless; `trace` logs every 30 s. */
export function lastGateRun(mode, { companions = 5, seconds = 600, seed = 1, trace = false } = {}) {
  const world = createLastGate(mode, { companions, seed });
  const run = world.lastGate;
  const hero = world.fighters[0];
  const breaches = [];
  const minutes = [];
  let heroDown = null;
  let next = 30;
  while (!run.over && run.time < seconds) {
    advance(world, 0.25, (current, dt) => {
      stepLastGate(current, dt);
      thinkAll(current, dt);
    });
    while (breaches.length < run.breaches) breaches.push(run.time);
    if (heroDown === null && hero.state === 'out') heroDown = run.time;
    if (run.time >= (minutes.length + 1) * 60) minutes.push(run.kills.hero);
    if (trace && run.time >= next) {
      next += 30;
      const awake = world.fighters.filter((fighter) => !fighter.dormant && fighter.state !== 'out').length;
      console.log(`  ${lastGateClock(run.time)} wave ${run.wave} breaches ${run.breaches} kills ${run.kills.hero}/${run.kills.total} on their feet ${awake} hero ${hero.state} ${hero.weapon?.kind ?? 'hands'} ${hero.mount ? 'mounted' : ''}`);
    }
  }
  return { ...lastGateResult(world), held: run.time, breachTimes: breaches, heroDown, minutes, peak: run.peak, fighters: world.fighters.length, weapon: hero.weapon?.kind ?? 'hands' };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(middle)] : (sorted[middle - 1] + sorted[middle]) / 2;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const modes = (args[0] ?? LAST_GATE_MODE_KEYS.join(',')).split(',');
  const companions = (args[1] ?? '5,0').split(',').map(Number);
  const seconds = Number(args[2] ?? 600);
  const seedArg = args[3] ?? '1';
  const seeds = seedArg.includes(',') ? seedArg.split(',').map(Number) : Array.from({ length: Number(seedArg) }, (_, index) => index + 1);
  const trace = process.argv.includes('--trace');
  console.log('mode        men seed  held   how      breaches                         hero down  kills hero/all  hero by minute     wave  peak (foes)  ends with  ms');
  for (const mode of modes) {
    for (const men of companions) {
      const held = [];
      for (const seed of seeds) {
        const started = Date.now();
        const row = lastGateRun(mode, { companions: men, seconds, seed, trace });
        held.push(row.held);
        const at = (time) => (time === null ? '-' : lastGateClock(time));
        console.log(`${mode.padEnd(11)} ${String(men).padStart(3)} ${String(seed).padStart(4)}  ${lastGateClock(row.held).padStart(5)}  ${String(row.how ?? 'held').padEnd(8)} ${row.breachTimes.map(at).join(' ').padEnd(32)} ${at(row.heroDown).padStart(9)}  ${`${row.kills}/${row.total}`.padStart(14)}  ${row.minutes.join(',').padEnd(17)} ${String(row.waves).padStart(4)}  ${`${row.peak.awake} (${row.peak.rebels})`.padStart(11)}  ${row.weapon.padEnd(10)} ${Date.now() - started}`);
      }
      if (seeds.length > 1) console.log(`${mode.padEnd(11)} ${String(men).padStart(3)}  median held ${lastGateClock(median(held))}`);
    }
  }
}
