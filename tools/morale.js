// How a level's battle breaks: over many seeds, who won and how long it took;
// for each side its men down and fled; when the lines first met (the first
// blow landed between them), how long after that the first man of each side
// broke, and how long from his breaking until half the side had broken, fled
// or fallen; of the men still standing when the first broke, the share who
// broke within DOMINO_SECONDS of him (how far the break ran along the line: a
// domino takes most of them); how many broke and were then cut down; and
// by each man's arms (his style), how many of them went down or fled, and how
// many were down already when the first of his side broke — who fell first,
// the best men or the rest. The way to see whether morale runs as
// history had it in each level.
// Usage: node tools/morale.js [levels=wokou+qiJiguang] [seeds=10] [seconds=180] [firstSeed=1]
// (TRY='AI.standing.sight=16;AI.rout.follow.rate=1.5' tries values first, as tools/levels.js does)

import { normaliseInputs } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld, inFight, seededRandom } from '../src/physics.js';
import { levelOf, tryValues } from './levels.js';

// s: how soon after the first man of a side broke the others' breaking counts as his break running along the line.
const DOMINO_SECONDS = 5;

/** One battle of a level at a seed: winner, length, contact, and each side's breaking. */
export function moraleBattle(key, { seed = 1, seconds = 180, step = 0.1 } = {}) {
  const level = levelOf(key);
  const sides = level.cast(seededRandom(seed));
  const entries = ['red', 'blue'].flatMap((corner) => sides[corner].map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner })));
  const world = createWorld(entries, { seed, arena: level.arena, rules: level.rules, formation: level.formation });
  const broke = new Set();
  const firstBreak = {};
  const halfGone = {};
  const standingAtBreak = {};
  const brokeAt = {};
  const downAtBreak = new Set();
  let contact = null;
  let elapsed = 0;
  while (elapsed < seconds && !boutWinner(world)) {
    const from = world.events.length;
    advance(world, step, (current, dt) => thinkAll(current, dt));
    elapsed += step;
    if (contact === null) {
      const blow = world.events.slice(from).find((event) => event.kind === 'landed' && world.fighters[event.defender]?.corner !== world.fighters[event.attacker]?.corner);
      if (blow) contact = blow.time;
    }
    for (const fighter of world.fighters) {
      if (!fighter.panicked) continue;
      broke.add(fighter.id);
      brokeAt[fighter.id] ??= world.time;
      if (firstBreak[fighter.corner] === undefined) {
        firstBreak[fighter.corner] = world.time;
        standingAtBreak[fighter.corner] = world.fighters.filter((other) => other.corner === fighter.corner && other !== fighter && inFight(other) && !other.panicked).map((other) => other.id);
        for (const other of world.fighters) if (other.corner === fighter.corner && other.state === 'out' && !other.fled) downAtBreak.add(other.id);
      }
    }
    for (const corner of ['red', 'blue']) {
      const men = world.fighters.filter((fighter) => fighter.corner === corner);
      const gone = men.filter((fighter) => !inFight(fighter) || fighter.panicked).length;
      if (halfGone[corner] === undefined && gone * 2 >= men.length) halfGone[corner] = world.time;
    }
  }
  const tally = {};
  for (const corner of ['red', 'blue']) {
    const men = world.fighters.filter((fighter) => fighter.corner === corner);
    const byStyle = {};
    for (const fighter of men) {
      // By the arms he came with (he may have lost them, or taken up others).
      const row = (byStyle[fighter.body.inputs.style] ??= { men: 0, down: 0, fled: 0, downAtBreak: 0 });
      row.men += 1;
      if (downAtBreak.has(fighter.id)) row.downAtBreak += 1;
      if (fighter.fled) row.fled += 1;
      else if (fighter.state === 'out') row.down += 1;
    }
    tally[corner] = {
      men: men.length,
      down: men.filter((fighter) => fighter.state === 'out' && !fighter.fled).length,
      fled: men.filter((fighter) => fighter.fled).length,
      broke: men.filter((fighter) => broke.has(fighter.id)).length,
      firstBreak: firstBreak[corner] ?? null,
      halfGone: halfGone[corner] ?? null,
      // Of those standing when the first broke, the share who broke within DOMINO_SECONDS.
      domino: standingAtBreak[corner]?.length ? standingAtBreak[corner].filter((id) => brokeAt[id] !== undefined && brokeAt[id] - firstBreak[corner] <= DOMINO_SECONDS).length / standingAtBreak[corner].length : null,
      // Broke, then went down: cut down running (or crawling off).
      cutDown: men.filter((fighter) => broke.has(fighter.id) && fighter.state === 'out' && !fighter.fled).length,
      byStyle,
    };
  }
  return { key, seed, seconds: elapsed, contact, winner: boutWinner(world), ...tally };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  tryValues(process.env.TRY);
  const keys = (process.argv[2] ?? 'wokou+qiJiguang').split('+');
  const seeds = Number(process.argv[3] ?? 10);
  const seconds = Number(process.argv[4] ?? 180);
  const firstSeed = Number(process.argv[5] ?? 1);
  const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN);
  const f = (value) => (Number.isFinite(value) ? value.toFixed(1) : '-');
  for (const key of keys) {
    const battles = Array.from({ length: seeds }, (_, index) => moraleBattle(key, { seed: firstSeed + index, seconds }));
    const wins = (corner) => battles.filter((battle) => battle.winner === corner).length;
    console.log(`${key}: ${seeds} seeds, wins red ${wins('red')} blue ${wins('blue')} none ${seeds - wins('red') - wins('blue')}, ${f(mean(battles.map((battle) => battle.seconds)))} s, contact at ${f(mean(battles.filter((battle) => battle.contact !== null).map((battle) => battle.contact)))} s`);
    for (const corner of ['red', 'blue']) {
      const sides = battles.map((battle) => battle[corner]);
      const afterContact = battles.filter((battle) => battle.contact !== null && battle[corner].firstBreak !== null).map((battle) => battle[corner].firstBreak - battle.contact);
      const spread = sides.filter((side) => side.firstBreak !== null && side.halfGone !== null).map((side) => side.halfGone - side.firstBreak);
      const domino = sides.filter((side) => side.domino !== null).map((side) => side.domino * 100);
      const styles = {};
      for (const side of sides) for (const [style, row] of Object.entries(side.byStyle)) for (const field of ['men', 'down', 'fled', 'downAtBreak']) (styles[style] ??= { men: 0, down: 0, fled: 0, downAtBreak: 0 })[field] += row[field] / seeds;
      console.log(`  ${corner.padEnd(4)} ${f(mean(sides.map((side) => side.men)))} men: down ${f(mean(sides.map((side) => side.down)))} fled ${f(mean(sides.map((side) => side.fled)))} broke ${f(mean(sides.map((side) => side.broke)))} (cut down running ${f(mean(sides.map((side) => side.cutDown)))}) | first break ${f(mean(afterContact))} s after contact (${afterContact.length} of ${seeds}), half out or broken ${f(mean(spread))} s after it (${spread.length}), of those still standing, ${f(mean(domino))}% broke within ${DOMINO_SECONDS} s of him`);
      console.log(`       ${Object.entries(styles).map(([style, row]) => `${style} ${f(row.men)}: down ${f(row.down)} (${f(row.downAtBreak)} before the first broke) fled ${f(row.fled)}`).join(' · ')}`);
    }
    if (process.env.EACH) for (const battle of battles) console.log(`  seed ${battle.seed}: ${battle.winner ?? '-'} ${battle.seconds.toFixed(0)} s contact ${f(battle.contact)} · red down ${battle.red.down} fled ${battle.red.fled} first break ${f(battle.red.firstBreak)} domino ${f((battle.red.domino ?? NaN) * 100)}% · blue down ${battle.blue.down} fled ${battle.blue.fled} first break ${f(battle.blue.firstBreak)} domino ${f((battle.blue.domino ?? NaN) * 100)}%`);
  }
}
