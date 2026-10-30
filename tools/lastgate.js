// The Last Gate, headless: each hero with his men (or alone), the hero fought by the AI (held to his post as his men are),
// until the gate falls or the time runs out; how long it held, the kills, the wave reached and the most men on their feet.
// Usage: node tools/lastgate.js [heroes=samurai,ironPagoda,knight] [companions=5,0] [seconds=600] [seed=1] [--trace]

import { thinkAll } from '../src/ai.js';
import { advance } from '../src/physics.js';
import { createLastGate, LAST_GATE_HERO_KEYS, lastGateClock, lastGateResult, stepLastGate } from '../src/lastgate.js';

/** One run, fought out headless; `trace` logs every 30 s. */
export function lastGateRun(hero, { companions = 5, seconds = 600, seed = 1, trace = false } = {}) {
  const world = createLastGate(hero, { companions, seed });
  const run = world.lastGate;
  let firstBreach = null;
  let heroDown = null;
  let next = 30;
  while (!run.over && run.time < seconds) {
    advance(world, 0.25, (current, dt) => {
      stepLastGate(current, dt);
      thinkAll(current, dt);
    });
    if (firstBreach === null && run.breaches > 0) firstBreach = run.time;
    if (heroDown === null && world.fighters[0].state === 'out') heroDown = run.time;
    if (trace && run.time >= next) {
      next += 30;
      const awake = world.fighters.filter((fighter) => !fighter.dormant && fighter.state !== 'out').length;
      console.log(`  ${lastGateClock(run.time)} wave ${run.wave} breaches ${run.breaches} kills ${run.kills.hero}/${run.kills.total} on their feet ${awake}`);
    }
  }
  return { ...lastGateResult(world), held: run.time, firstBreach, heroDown, peak: run.peak, fighters: world.fighters.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const heroes = (process.argv[2] ?? LAST_GATE_HERO_KEYS.join(',')).split(',');
  const companions = (process.argv[3] ?? '5,0').split(',').map(Number);
  const seconds = Number(process.argv[4] ?? 600);
  const seed = Number(process.argv[5] ?? 1);
  const trace = process.argv.includes('--trace');
  console.log('hero        men  held   how      breach1  hero down  kills hero/all  wave  peak on feet (rebels)  fighters  ms');
  for (const hero of heroes) {
    for (const men of companions) {
      const started = Date.now();
      const row = lastGateRun(hero, { companions: men, seconds, seed, trace });
      const at = (time) => (time === null ? '-' : lastGateClock(time));
      console.log(`${hero.padEnd(11)} ${String(men).padStart(3)}  ${lastGateClock(row.held).padStart(5)}  ${String(row.how ?? 'held').padEnd(8)} ${at(row.firstBreach).padStart(7)}  ${at(row.heroDown).padStart(9)}  ${`${row.kills}/${row.total}`.padStart(14)}  ${String(row.waves).padStart(4)}  ${`${row.peak.awake} (${row.peak.rebels})`.padStart(21)}  ${String(row.fighters).padStart(8)}  ${Date.now() - started}`);
    }
  }
}
