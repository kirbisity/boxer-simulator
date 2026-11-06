// Last Stand Squad, headless: each level's hero with a squad (the builder's first squad: the level's soldier, as many as
// the budget buys; or `n` of the level's own men, the old default), the hero fought by the AI (held to his place as his men
// are), until he falls or the time runs out; how long the squad lasted, how it ended, the waves cleared (and when each was),
// the kills (the hero's, the rest of the squad's, all), the squad's men still up at the end and the most foes on their feet.
// With several seeds, the medians of each row.
// Usage: node tools/lastgate.js [modes=samurai,knight,mongol,police] [squads=first,5] [seconds=600] [seeds=1] [--trace]
// (`squads`: `first`, the builder's first squad; a number, that many of the level's own men. `seeds` a number, or a list:
// 3 runs seeds 1–3; 4,7 runs those two.)

import { thinkAll } from '../src/ai.js';
import { advance } from '../src/physics.js';
import { createLastGate, LAST_GATE_MODE_KEYS, LAST_GATE_MODES, lastGateClock, lastGateResult, stepLastGate } from '../src/lastgate.js';
import { firstSquad, squadMen, squadUnits } from '../src/squad.js';

/** A level's squad for a run: the builder's first squad (`first`), or `n` of the level's own men (null: createLastGate's companions). */
export function lastGateSquad(mode, squad) {
  if (squad !== 'first') return null;
  const spec = LAST_GATE_MODES[mode];
  const units = squadUnits(spec.factions);
  return squadMen(units, firstSquad(units, spec.soldier));
}

/** One run, fought out headless; `trace` logs every 30 s. */
export function lastGateRun(mode, { squad = 'first', seconds = 600, seed = 1, trace = false } = {}) {
  const men = lastGateSquad(mode, squad);
  const world = createLastGate(mode, men ? { men, seed } : { companions: Number(squad), seed });
  const run = world.lastGate;
  const hero = world.fighters[0];
  const clearedAt = [];
  let next = 30;
  while (!run.over && run.time < seconds) {
    advance(world, 0.25, (current, dt) => {
      stepLastGate(current, dt);
      thinkAll(current, dt);
    });
    while (clearedAt.length < run.cleared) clearedAt.push(run.time);
    if (trace && run.time >= next) {
      next += 30;
      const foes = world.fighters.filter((fighter) => fighter.corner === 'blue' && !fighter.dormant && fighter.state !== 'out').length;
      console.log(`  ${lastGateClock(run.time)} wave ${run.wave} (${run.phase}, ${run.spawned} come) kills ${run.kills.hero}/${run.kills.total} foes up ${foes} hero ${hero.state} ${hero.weapon?.kind ?? 'hands'}`);
    }
  }
  const up = world.fighters.filter((fighter) => fighter.corner === 'red' && fighter.state !== 'out').length;
  return { ...lastGateResult(world), held: run.time, clearedAt, up, peak: run.peak, weapon: hero.weapon?.kind ?? 'hands' };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(middle)] : (sorted[middle - 1] + sorted[middle]) / 2;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const modes = (args[0] ?? LAST_GATE_MODE_KEYS.join(',')).split(',');
  const squads = (args[1] ?? 'first,5').split(',');
  const seconds = Number(args[2] ?? 600);
  const seedArg = args[3] ?? '1';
  const seeds = seedArg.includes(',') ? seedArg.split(',').map(Number) : Array.from({ length: Number(seedArg) }, (_, index) => index + 1);
  const trace = process.argv.includes('--trace');
  console.log('level     squad seed  lasted  how      waves  wave cleared at                          kills hero/squad/all  up  peak (foes)  ends with   ms');
  for (const mode of modes) {
    for (const squad of squads) {
      const rows = [];
      for (const seed of seeds) {
        const started = Date.now();
        const row = lastGateRun(mode, { squad, seconds, seed, trace });
        rows.push(row);
        const kills = `${row.heroKills}/${row.squadKills}/${row.kills}`;
        console.log(`${mode.padEnd(9)} ${`${squad}(${row.squad})`.padStart(6)} ${String(seed).padStart(4)}  ${lastGateClock(row.held).padStart(6)}  ${String(row.how ?? 'held').padEnd(8)} ${String(row.waves).padStart(5)}  ${String(row.wave).padStart(4)} ${row.clearedAt.map(lastGateClock).join(' ').padEnd(40)} ${kills.padStart(20)}  ${String(row.up).padStart(2)}  ${`${row.peak.awake} (${row.peak.rebels})`.padStart(11)}  ${row.weapon.padEnd(11)} ${Date.now() - started}`);
      }
      if (seeds.length > 1) console.log(`${mode.padEnd(9)} ${squad.padStart(6)}  median lasted ${lastGateClock(median(rows.map((row) => row.held)))}, ${median(rows.map((row) => row.waves))} waves, ${median(rows.map((row) => row.kills))} kills (${median(rows.map((row) => row.heroKills))} the hero's)`);
    }
  }
}
