// A big battle of drilled troops: Rome against Han, n a side, in ranks.
// How fast the simulation runs (ms of work per simulated second, in
// windows), how many bodies are in full physics, coarse or posed, how far
// the ranks hold, and how the battle goes.
// Usage: node tools/legion.js [perSide=100] [seconds=60] [seed=1]

import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld, seededRandom } from '../src/physics.js';
import { legionSides, SCENARIOS } from '../src/scenarios.js';
import { P } from '../src/body.js';
import { aheadOfSlot, slotAt } from '../src/formation.js';

/** The Rome against Han level's armies, `count` a side, laid out as the level lays them. */
export function legionBattle(count, { seed = 1 } = {}) {
  const level = SCENARIOS.legion;
  const sides = legionSides(seededRandom(seed), count);
  const entries = [...sides.red.map((inputs) => ({ inputs, corner: 'red' })), ...sides.blue.map((inputs) => ({ inputs, corner: 'blue' }))];
  return createWorld(entries, { seed, arena: level.arena, formation: level.formation });
}

/** Run it: a line per `window` simulated seconds. */
export function runBattle(world, { seconds = 60, window = 5, log = console.log } = {}) {
  const rows = [];
  let elapsed = 0;
  while (elapsed < seconds && !boutWinner(world)) {
    const started = performance.now();
    const counts = { full: 0, coarse: 0, proxy: 0 };
    let steps = 0;
    for (let t = 0; t < window && !boutWinner(world); t += 1 / 60) {
      advance(world, 1 / 60, (current, dt) => thinkAll(current, dt));
      for (const fighter of world.fighters) counts[fighter.detail ?? 'full'] += 1;
      steps += 1;
    }
    const wall = performance.now() - started;
    elapsed += steps / 60;
    const standing = (corner) => world.fighters.filter((fighter) => fighter.corner === corner && fighter.state !== 'out').length;
    // How far the deepest man of each side has gone past his own side's front.
    const fronts = { red: Math.max(...world.fighters.filter((f) => f.corner === 'red' && f.state === 'up').map((f) => f.x[P.pelvis * 3])), blue: Math.min(...world.fighters.filter((f) => f.corner === 'blue' && f.state === 'up').map((f) => f.x[P.pelvis * 3])) };
    const row = {
      t: Math.round(elapsed),
      msPerSimSecond: Math.round(wall / (steps / 60)),
      full: Math.round(counts.full / steps), coarse: Math.round(counts.coarse / steps), proxy: Math.round(counts.proxy / steps),
      red: standing('red'), blue: standing('blue'),
      redFront: fronts.red.toFixed(1), blueFront: fronts.blue.toFixed(1),
      bolts: world.arrows.filter((arrow) => arrow.bolt).length,
      // Men out of place: more than 2 m from their slots, and the most out ahead of one.
      astray: {}, deepest: {},
    };
    for (const corner of ['red', 'blue']) {
      const formation = world.formations?.[corner];
      if (!formation) continue;
      const men = world.fighters.filter((f) => f.corner === corner && f.state === 'up' && f.slot);
      row.astray[corner] = men.filter((f) => { const slot = slotAt(formation, f.slot); return Math.hypot(f.x[P.pelvis * 3] - slot[0], f.x[P.pelvis * 3 + 2] - slot[1]) > 2; }).length;
      row.deepest[corner] = Math.max(...men.map((f) => aheadOfSlot(f, formation))).toFixed(1);
    }
    rows.push(row);
    log(JSON.stringify(row));
  }
  return { rows, winner: boutWinner(world) };
}

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  const count = Number(process.argv[2] ?? 100);
  const seconds = Number(process.argv[3] ?? 60);
  const seed = Number(process.argv[4] ?? 1);
  const result = runBattle(legionBattle(count, { seed }), { seconds });
  console.log('winner', result.winner);
}
