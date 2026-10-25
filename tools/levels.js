// A level's battle, fought headless by the AI on both sides over many seeds,
// and what it comes to on average: for each side its men, how many were
// killed (cut, stabbed, shot or bled to death), how many lay down (dead, knocked cold or unable to go on), how many broke at some
// point, how many fled the field, how many were still standing at the end;
// who won, and how long it took. The way to see whether a level comes out as
// history had it, and what a change to the AI does to every battle.
// Usage: node tools/levels.js [levels=wokou+qiJiguang] [seeds=12] [seconds=180] [firstSeed=1]
// (levels separated by +: `wokou+qiJiguang:morale,tactics`; EACH=1 prints each battle too)

import { normaliseInputs } from '../src/body.js';
import { AI, thinkAll } from '../src/ai.js';
import { DRILL } from '../src/formation.js';
import { advance, boutWinner, createWorld, inFight, seededRandom } from '../src/physics.js';
import { battleOf, qiJiguangLevel } from '../src/scenarios.js';

/**
 * A level by its key; `qiJiguang:<levers>` is Qi Jiguang's with only those of
 * its levers (morale, tactics, weapons; comma-separated, or `none`): what each did.
 */
export function levelOf(key) {
  const [name, levers] = key.split(':');
  if (name !== 'qiJiguang' || levers === undefined) return battleOf(key);
  const on = new Set(levers.split(','));
  return qiJiguangLevel({ morale: on.has('morale'), tactics: on.has('tactics'), weapons: on.has('weapons') });
}

/** One battle of a level at a seed: each side's tally, the winner and the length (s). */
export function levelBattle(key, { seed = 1, seconds = 180, step = 0.1 } = {}) {
  const level = levelOf(key);
  const sides = level.cast(seededRandom(seed));
  const entries = ['red', 'blue'].flatMap((corner) => sides[corner].map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner })));
  const world = createWorld(entries, { seed, arena: level.arena, rules: level.rules, formation: level.formation });
  const broke = new Set();
  let elapsed = 0;
  while (elapsed < seconds && !boutWinner(world)) {
    advance(world, step, (current, dt) => thinkAll(current, dt));
    elapsed += step;
    for (const fighter of world.fighters) if (fighter.panicked) broke.add(fighter.id);
  }
  const killed = new Set(world.events.filter((event) => event.kind === 'killed' || event.kind === 'bledOut').map((event) => event.fighter));
  const tally = {};
  for (const corner of ['red', 'blue']) {
    const men = world.fighters.filter((fighter) => fighter.corner === corner);
    tally[corner] = {
      men: men.length,
      killed: men.filter((fighter) => killed.has(fighter.id)).length,
      down: men.filter((fighter) => fighter.state === 'out' && !fighter.fled).length,
      broke: men.filter((fighter) => broke.has(fighter.id)).length,
      fled: men.filter((fighter) => fighter.fled).length,
      standing: men.filter((fighter) => inFight(fighter) && !fighter.panicked).length,
    };
  }
  return { key, seed, seconds: elapsed, winner: boutWinner(world), ...tally };
}

/** A level over `seeds` seeds from `firstSeed`: the battles, and each side's average. */
export function levelOutcomes(key, { seeds = 12, firstSeed = 1, seconds = 180 } = {}) {
  const battles = Array.from({ length: seeds }, (_, index) => levelBattle(key, { seed: firstSeed + index, seconds }));
  const mean = (pick) => battles.reduce((sum, battle) => sum + pick(battle), 0) / battles.length;
  const side = (corner) => Object.fromEntries(['men', 'killed', 'down', 'broke', 'fled', 'standing'].map((field) => [field, mean((battle) => battle[corner][field])]));
  const wins = { red: battles.filter((battle) => battle.winner === 'red').length, blue: battles.filter((battle) => battle.winner === 'blue').length };
  return { key, seeds, wins, seconds: mean((battle) => battle.seconds), red: side('red'), blue: side('blue'), battles };
}

/**
 * Values tried for a run (env TRY: `AI.morale.formed=0.1;DRILL.retireAt=6`): set on the
 * AI's and the drill's tables before the battles, to see what a change would do.
 */
export function tryValues(spec = '') {
  const tables = { AI, DRILL };
  for (const pair of spec.split(';').filter(Boolean)) {
    const [path, value] = pair.split('=');
    const keys = path.split('.');
    let at = tables[keys.shift()];
    while (keys.length > 1) at = at[keys.shift()];
    at[keys[0]] = Number(value);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  tryValues(process.env.TRY);
  const keys = (process.argv[2] ?? 'wokou+qiJiguang').split('+');
  const seeds = Number(process.argv[3] ?? 12);
  const seconds = Number(process.argv[4] ?? 180);
  const firstSeed = Number(process.argv[5] ?? 1);
  const figure = (value) => value.toFixed(1).padStart(5);
  const side = (s) => `${figure(s.men)} men: killed ${figure(s.killed)} down ${figure(s.down)} broke ${figure(s.broke)} fled ${figure(s.fled)} standing ${figure(s.standing)}`;
  for (const key of keys) {
    const row = levelOutcomes(key, { seeds, firstSeed, seconds });
    console.log(`${key.padEnd(10)} ${seeds} seeds ${figure(row.seconds)} s  wins red ${row.wins.red} blue ${row.wins.blue} | red ${side(row.red)} | blue ${side(row.blue)}`);
    if (process.env.EACH) for (const battle of row.battles) console.log(`  seed ${battle.seed}: ${battle.winner ?? '-'} ${battle.seconds.toFixed(0)} s  red down ${battle.red.down} fled ${battle.red.fled} killed ${battle.red.killed} · blue down ${battle.blue.down} fled ${battle.blue.fled} killed ${battle.blue.killed}`);
  }
}
