// The battles fought from behind fieldworks (Agincourt, Cerignola, Qi Jiguang's trench), fought headless over
// seeds, and what the works and the ground did: who won and when; each side's men down and fled; how
// many of the attackers went down before they ever reached the defenders' line (the stakes, the ditch,
// the palisade); how fast the attackers' foot crossed the soft ground against the firm, how often men
// fell and how many smothered; and what became of the horses (stopped at a wall or a ditch, run onto
// stakes, shot, brought down).
// Usage: node tools/fieldworks.js [levels=agincourt+cerignola+qiJiguang] [seeds=8] [seconds=180] [firstSeed=1]
// (EACH=1 prints each battle.)

import { normaliseInputs, P } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld, inFight, seededRandom } from '../src/physics.js';
import { battleOf } from '../src/scenarios.js';
import { softAt, worksOf } from '../src/physics/fieldworks.js';

/** The x of the defenders' works the attackers must reach (the stakes' points, the ditch's lip, the fence). */
function lineOf(works) {
  const xs = [];
  for (const stake of works.stakes) xs.push(stake.tip[0]);
  for (const wall of works.walls) if (wall.kind === 'palisade') xs.push(wall.a[0], wall.b[0]);
  for (const ditch of works.ditches) xs.push(ditch.from[0] + ditch.left[0] * ditch.profile[0][0]);
  return xs.length ? Math.min(...xs) : Infinity;
}

/** One battle: the tally. */
export function worksBattle(key, { seed = 1, seconds = 180, step = 0.1 } = {}) {
  const level = battleOf(key);
  const sides = level.cast(seededRandom(seed));
  const entries = ['red', 'blue'].flatMap((corner) => sides[corner].map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner })));
  const world = createWorld(entries, { seed, arena: level.arena, rules: level.rules, formation: level.formation });
  const works = worksOf(level.arena);
  const line = lineOf(works);
  const reached = new Set();
  const speed = { soft: [0, 0], firm: [0, 0] };
  let elapsed = 0;
  while (elapsed < seconds && !boutWinner(world)) {
    advance(world, step, (current, dt) => thinkAll(current, dt));
    elapsed += step;
    for (const fighter of world.fighters) {
      if (fighter.corner !== 'red') continue;
      const x = fighter.mount ? fighter.mount.at[0] : fighter.x[P.pelvis * 3];
      if (x >= line - 0.6) reached.add(fighter.id);
      // The foot coming on (toward +x, on their feet, not yet at the line): their pace on soft ground and on firm.
      if (!fighter.mount && fighter.state === 'up' && x < line - 1 && fighter.rootVelocity[0] > 0.05) {
        const soft = softAt(works, fighter.root[0], fighter.root[1]) ? speed.soft : speed.firm;
        soft[0] += fighter.rootVelocity[0];
        soft[1] += 1;
      }
    }
  }
  const tally = {};
  for (const corner of ['red', 'blue']) {
    const men = world.fighters.filter((fighter) => fighter.corner === corner);
    tally[corner] = {
      men: men.length,
      down: men.filter((fighter) => fighter.state === 'out' && !fighter.fled).length,
      fled: men.filter((fighter) => fighter.fled).length,
      standing: men.filter((fighter) => inFight(fighter) && !fighter.panicked).length,
      fell: world.events.filter((event) => event.kind === 'fell' && world.fighters[event.fighter]?.corner === corner).length,
      smothered: world.events.filter((event) => event.kind === 'smothered' && world.fighters[event.fighter]?.corner === corner).length,
    };
  }
  const attackers = world.fighters.filter((fighter) => fighter.corner === 'red');
  const horses = world.horses.filter((horse) => horse.corner === 'red');
  const horseEvents = (test) => new Set(world.events.filter((event) => event.horse !== undefined && world.horses[event.horse]?.corner === 'red' && test(event)).map((event) => event.horse)).size;
  return {
    key, seed, seconds: elapsed, winner: boutWinner(world), ...tally,
    downShort: attackers.filter((fighter) => fighter.state === 'out' && !reached.has(fighter.id)).length,
    reached: reached.size,
    pace: { soft: speed.soft[1] ? speed.soft[0] / speed.soft[1] : null, firm: speed.firm[1] ? speed.firm[0] / speed.firm[1] : null },
    horses: {
      count: horses.length,
      stopped: horseEvents((event) => event.kind === 'horseStopped'),
      staked: horseEvents((event) => event.kind === 'horseHit' && event.weapon === 'stake'),
      shot: horseEvents((event) => event.kind === 'horseHit' && (event.weapon === 'arrow' || event.weapon === 'ball')),
      down: horses.filter((horse) => horse.state !== 'up').length,
      reached: horses.filter((horse) => reached.has(horse.rider)).length,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const keys = (process.argv[2] ?? 'agincourt+cerignola+qiJiguang').split('+');
  const seeds = Number(process.argv[3] ?? 8);
  const seconds = Number(process.argv[4] ?? 180);
  const firstSeed = Number(process.argv[5] ?? 1);
  const f = (value) => (value === null ? '  -  ' : value.toFixed(1).padStart(5));
  for (const key of keys) {
    const battles = Array.from({ length: seeds }, (_, index) => worksBattle(key, { seed: firstSeed + index, seconds }));
    const mean = (pick) => battles.reduce((sum, battle) => sum + (pick(battle) ?? 0), 0) / battles.length;
    const wins = { red: battles.filter((b) => b.winner === 'red').length, blue: battles.filter((b) => b.winner === 'blue').length };
    const side = (corner) => `down ${f(mean((b) => b[corner].down))} fled ${f(mean((b) => b[corner].fled))} standing ${f(mean((b) => b[corner].standing))} falls ${f(mean((b) => b[corner].fell))} smothered ${f(mean((b) => b[corner].smothered))}`;
    console.log(`${key} ${seeds} seeds ${f(mean((b) => b.seconds))} s  wins red ${wins.red} blue ${wins.blue} undecided ${seeds - wins.red - wins.blue}`);
    console.log(`  attackers: ${side('red')}; down short of the line ${f(mean((b) => b.downShort))}, reached it ${f(mean((b) => b.reached))}`);
    console.log(`  defenders: ${side('blue')}`);
    console.log(`  foot pace (m/s toward the line): soft ${f(mean((b) => b.pace.soft))} firm ${f(mean((b) => b.pace.firm))}`);
    console.log(`  horses ${f(mean((b) => b.horses.count))}: stopped ${f(mean((b) => b.horses.stopped))} on stakes ${f(mean((b) => b.horses.staked))} shot ${f(mean((b) => b.horses.shot))} down ${f(mean((b) => b.horses.down))} riders at the line ${f(mean((b) => b.horses.reached))}`);
    if (process.env.EACH) for (const b of battles) console.log(`   seed ${b.seed}: ${b.winner ?? '-'} ${b.seconds.toFixed(0)} s red down ${b.red.down} fled ${b.red.fled} short ${b.downShort} · blue down ${b.blue.down} fled ${b.blue.fled} · horses down ${b.horses.down}/${b.horses.count}`);
  }
}
