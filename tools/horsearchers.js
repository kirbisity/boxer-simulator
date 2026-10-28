// The horse archers of a level, over a few seeds: who won and when, each
// side's men down and fled; and what the horse archers did — arrows loosed
// from the saddle, how many struck a man (and how many of those went in, not
// glancing off armour or a shield), how many of them were caught and struck in
// hand-to-hand (a blade, a spear, a fist), how many went down, quivers emptied
// and refilled at a train. The way to see whether a horse archer skirmishes as
// he should (shoots, keeps away, is seldom caught) and how a battle of them
// comes out against the history.
// Usage: node tools/horsearchers.js [levels=mobei+carrhae+catalaunian] [seeds=8] [seconds=240] [firstSeed=1]
// (EACH=1 prints each battle; TRY as tools/levels.js)

import { normaliseInputs } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { STYLES } from '../src/moves.js';
import { advance, boutWinner, createWorld, seededRandom } from '../src/physics.js';
import { levelOf, tryValues } from './levels.js';

/** A horse archer: a rider whose style shoots a bow. */
const horseArcher = (fighter) => Boolean(fighter.mount) && Boolean(STYLES[fighter.body.inputs.style]?.ranged) && WEAPON_BOWS.has(STYLES[fighter.body.inputs.style].weapon);
const WEAPON_BOWS = new Set(['bow', 'compositeBow', 'yumi']);

/** One battle: the outcome and the horse archers' tally. */
export function archerBattle(key, { seed = 1, seconds = 240, step = 0.1 } = {}) {
  const level = levelOf(key);
  const sides = level.cast(seededRandom(seed));
  const entries = ['red', 'blue'].flatMap((corner) => sides[corner].map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner })));
  const world = createWorld(entries, { seed, arena: level.arena, rules: level.rules, formation: level.formation });
  const archers = new Set(world.fighters.filter(horseArcher).map((fighter) => fighter.id));
  let elapsed = 0;
  let cursor = 0;
  const shooting = { red: { loosed: 0, struck: 0, wounding: 0 }, blue: { loosed: 0, struck: 0, wounding: 0 } };
  const tally = { archers: archers.size, loosed: 0, struck: 0, wounding: 0, caught: new Set(), meleeBlows: 0, emptied: 0, resupplied: 0, nearest: [] };
  while (elapsed < seconds && !boutWinner(world)) {
    advance(world, step, (current, dt) => thinkAll(current, dt));
    elapsed += step;
    for (; cursor < world.events.length; cursor += 1) {
      const event = world.events[cursor];
      const by = world.fighters[event.attacker]?.corner;
      if (event.kind === 'loosed') shooting[by].loosed += 1;
      if (event.kind === 'arrow' && world.fighters[event.defender]?.corner !== by) {
        shooting[by].struck += 1;
        if (event.harm > 0) shooting[by].wounding += 1;
      }
      if (event.kind === 'loosed' && archers.has(event.attacker)) tally.loosed += 1;
      if (event.kind === 'arrow' && archers.has(event.attacker)) {
        tally.struck += 1;
        if (event.harm > 0) tally.wounding += 1;
      }
      if (event.kind === 'landed' && archers.has(event.defender) && world.fighters[event.attacker]?.corner !== world.fighters[event.defender].corner) {
        tally.caught.add(event.defender);
        tally.meleeBlows += 1;
      }
      if (event.kind === 'quiverEmpty' && archers.has(event.fighter)) tally.emptied += 1;
      if (event.kind === 'resupplied' && archers.has(event.fighter)) tally.resupplied += 1;
    }
  }
  const side = (corner) => {
    const men = world.fighters.filter((fighter) => fighter.corner === corner);
    return { ...shooting[corner], men: men.length, down: men.filter((fighter) => fighter.state === 'out' && !fighter.fled).length, fled: men.filter((fighter) => fighter.fled).length };
  };
  const archersDown = world.fighters.filter((fighter) => archers.has(fighter.id) && fighter.state === 'out').length;
  return { key, seed, seconds: elapsed, winner: boutWinner(world), red: side('red'), blue: side('blue'), archers: { ...tally, caught: tally.caught.size, down: archersDown } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  tryValues(process.env.TRY);
  const keys = (process.argv[2] ?? 'mobei+carrhae+catalaunian').split('+');
  const seeds = Number(process.argv[3] ?? 8);
  const seconds = Number(process.argv[4] ?? 240);
  const firstSeed = Number(process.argv[5] ?? 1);
  const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN);
  const f = (value) => (Number.isFinite(value) ? value.toFixed(1) : '-');
  for (const key of keys) {
    const battles = Array.from({ length: seeds }, (_, index) => archerBattle(key, { seed: firstSeed + index, seconds }));
    const wins = (corner) => battles.filter((battle) => battle.winner === corner).length;
    console.log(`${key}: ${seeds} seeds, wins red ${wins('red')} blue ${wins('blue')} undecided ${seeds - wins('red') - wins('blue')}, ${f(mean(battles.map((battle) => battle.seconds)))} s`);
    for (const corner of ['red', 'blue']) console.log(`  ${corner.padEnd(4)} ${f(mean(battles.map((battle) => battle[corner].men)))} men: down ${f(mean(battles.map((battle) => battle[corner].down)))} fled ${f(mean(battles.map((battle) => battle[corner].fled)))} · shot ${f(mean(battles.map((battle) => battle[corner].loosed)))}, struck ${f(mean(battles.map((battle) => battle[corner].struck)))} (went in ${f(mean(battles.map((battle) => battle[corner].wounding)))})`);
    const a = (field) => f(mean(battles.map((battle) => battle.archers[field])));
    console.log(`  horse archers ${a('archers')}: loosed ${a('loosed')}, struck a man ${a('struck')} (went in ${a('wounding')}), caught in hand-to-hand ${a('caught')} (${a('meleeBlows')} blows), down ${a('down')}, quivers emptied ${a('emptied')}, refilled ${a('resupplied')}`);
    if (process.env.EACH) for (const battle of battles) console.log(`  seed ${battle.seed}: ${battle.winner ?? '-'} ${battle.seconds.toFixed(0)} s · red down ${battle.red.down} fled ${battle.red.fled} · blue down ${battle.blue.down} fled ${battle.blue.fled} · archers loosed ${battle.archers.loosed} struck ${battle.archers.struck} caught ${battle.archers.caught} down ${battle.archers.down}`);
  }
}
