// The player's stamina overdraft, measured (src/physics/overdraft.js, WORLD.overdraft). A player who keeps swinging: the seconds from
// a full breath to empty, to the floor and the faint, how long he lies and how long to get up and to get his wind back above
// empty; and the force his blows deal at 1, 0, -0.5 and -1 against a man standing still.
// Usage: node tools/overdraft.js [preset] [style-moves, comma separated]

import { PRESETS } from '../src/body.js';
import { advance, createWorld, placeFighter, throwPunch } from '../src/physics.js';
import { WORLD } from '../src/physics/config.js';
import { fatigueScale } from '../src/physics/overdraft.js';

const [presetName = 'heavy', movesArg = 'jab,cross,hook,cross'] = process.argv.slice(2);
const moves = movesArg.split(',');
const duel = (seed, dummy = 'sumo') => createWorld([{ inputs: structuredClone(PRESETS[presetName]), corner: 'red' }, { inputs: structuredClone(PRESETS[dummy]), corner: 'blue' }], { seed });

/** Swing without a pause at the air in front of him until the faint, then lie, rise and get his wind back. */
function swingUntilFaint(seed) {
  const world = duel(seed);
  const me = world.fighters[0];
  me.player = true;
  let thrown = 0;
  const marks = {};
  const step = 1 / 60;
  for (let t = 0; t < 1200 && !marks.wokeAt; t += step) {
    if (me.state === 'up' && !me.punch) {
      const here = [me.x[0] + 1, 1.5, me.x[2]];
      if (throwPunch(world, me, moves[thrown % moves.length], 'head', { at: here })) thrown += 1;
    }
    advance(world, step);
    if (marks.zeroAt === undefined && me.stamina <= 0) marks.zeroAt = world.time;
    if (marks.faintAt === undefined && me.fainted) marks.faintAt = world.time;
    if (marks.faintAt !== undefined && marks.upAt === undefined && me.state === 'up') marks.upAt = world.time;
    if (marks.faintAt !== undefined) marks.wokeAt = me.state === 'up' ? world.time : undefined;
  }
  marks.thrown = thrown;
  // Rest: how long until he is above empty again.
  const woke = me.stamina;
  let rest = 0;
  while (me.stamina < 0 && rest < 300) {
    advance(world, 0.25);
    rest += 0.25;
  }
  return { ...marks, woke, rest, restState: me.state };
}

/** The peak force (N) of the first blow of `move` landed on a man standing still, with the player at `stamina`. */
function forceAt(stamina, move, seed) {
  const world = duel(seed);
  const [me, him] = world.fighters;
  me.player = true;
  me.faintGrace = 99;
  me.stamina = stamina;
  placeFighter(me, -0.55);
  placeFighter(him, 0.55);
  advance(world, 0.3);
  me.stamina = stamina;
  throwPunch(world, me, move, 'body');
  let force = null;
  for (let t = 0; t < 1.2 && force === null; t += 1 / 60) {
    advance(world, 1 / 60);
    const hit = world.events.find((event) => event.attacker === me.id && event.force !== undefined && (event.kind === 'landed' || event.kind === 'blocked'));
    if (hit) force = hit;
  }
  return { force: force?.force ?? null, impulse: force?.impulse, closing: force?.speed, speed: me.stats.maxHandSpeed };
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const swing = [1, 2, 3].map(swingUntilFaint);
console.log(`${presetName}: swinging without a pause (${moves.join(' ')}), aerobic ${PRESETS[presetName] && duel(1).fighters[0].body.aerobic.toFixed(2)}`);
for (const [index, run] of swing.entries()) {
  console.log(`  seed ${index + 1}: empty at ${run.zeroAt?.toFixed(1)} s, faint at ${run.faintAt?.toFixed(1)} s (${(run.faintAt - run.zeroAt).toFixed(1)} s in debt), up and standing ${(run.upAt - run.faintAt).toFixed(1)} s later, woke at ${run.woke.toFixed(2)}, above empty again ${run.rest.toFixed(1)} s after; ${run.thrown} blows`);
}
console.log('force of the first blow landed on a man standing still (N), and the hand speed (m/s):');
for (const move of ['jab', 'cross']) {
  const rows = [1, 0, -0.5, -1].map((stamina) => {
    const runs = [1, 2, 3, 4, 5, 6].map((seed) => forceAt(stamina, move, seed)).filter((run) => run.force !== null);
    return { stamina, count: runs.length, force: mean(runs.map((run) => run.force)), impulse: mean(runs.map((run) => run.impulse)), speed: mean(runs.map((run) => run.speed)) };
  });
  for (const row of rows) console.log(`  ${move} at ${row.stamina}: muscles x${fatigueScale(row.stamina).toFixed(2)}, hand ${row.speed.toFixed(1)} m/s (${(row.speed / rows[0].speed * 100).toFixed(0)}%), energy ~${((row.speed / rows[0].speed) ** 2 * 100).toFixed(0)}%, impulse ${row.impulse.toFixed(0)} Ns (${(row.impulse / rows[0].impulse * 100).toFixed(0)}%), peak force ${row.force.toFixed(0)} N (${(row.force / rows[0].force * 100).toFixed(0)}%) [${row.count} landed]`);
}
console.log(`config: floor ${WORLD.overdraft.floor}, forceAtFloor ${WORLD.overdraft.forceAtFloor}, recoveryShare ${WORLD.overdraft.recoveryShare}`);
