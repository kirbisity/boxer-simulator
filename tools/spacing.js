// Spacing: how close each fighter stands to the other, against how far the
// other's attacks reach. For each side: the mean distance, the share of the
// time spent inside the other's reach, surges a minute and attacks a surge;
// and the cadence: share of the time spent working (not moving), and the
// share of attacks thrown in bursts (within 0.35 s of the one before).
// Usage: node tools/spacing.js [bouts] [seconds]

import { thinkAll } from '../src/ai.js';
import { P } from '../src/body.js';
import { advance, boutWinner, createWorld, point, reachOf } from '../src/physics.js';
import { fighterFor } from './weapons.js';

export const SPACING_PAIRINGS = [
  ['contender:boxing', 'contender:boxing'],
  ['contender:muayThai', 'contender:kickboxing'],
  ['contender:boxing', 'contender:longsword'],
  ['contender:street', 'contender:katana'],
  ['contender:boxing', 'contender:knife'],
  ['contender:street', 'contender:baton'],
  ['contender:katana', 'contender:hoplomachus:hoplomachus'],
];

export function spacing(red, blue, bouts = 3, seconds = 60) {
  const sides = [0, 1].map(() => ({ distance: 0, inside: 0, samples: 0, thrown: 0, surges: 0, minutes: 0, working: 0, burst: 0, attacks: 0, temperaments: [] }));
  for (let bout = 0; bout < bouts; bout += 1) {
    const world = createWorld([fighterFor(red), fighterFor(blue)], { seed: 700 + bout });
    let elapsed = 0;
    const lastStart = [null, null];
    const seen = [null, null];
    while (elapsed < seconds && !boutWinner(world)) {
      advance(world, 0.05, (current, dt) => thinkAll(current, dt));
      elapsed += 0.05;
      world.fighters.forEach((fighter, index) => {
        if (fighter.punch && fighter.punch !== seen[index]) {
          seen[index] = fighter.punch;
          sides[index].attacks += 1;
          if (lastStart[index] !== null && world.time - lastStart[index] < 0.35 + fighter.punch.spec.duration) sides[index].burst += 1;
          lastStart[index] = world.time;
        }
      });
      const [a, b] = world.fighters;
      if (a.state !== 'up' || b.state !== 'up') continue;
      const apart = Math.hypot(...[0, 2].map((axis) => point(a.x, P.pelvis)[axis] - point(b.x, P.pelvis)[axis]));
      world.fighters.forEach((fighter, index) => {
        const other = world.fighters[1 - index];
        const side = sides[index];
        side.distance += apart;
        side.samples += 1;
        if (fighter.aiCadence?.name === 'work') side.working += 1;
        // Inside the other's reach: where his attacks land.
        if (apart < reachOf(other) + fighter.body.lengths.headRadius) side.inside += 1;
      });
    }
    world.fighters.forEach((fighter, index) => {
      sides[index].thrown += fighter.stats.thrown;
      sides[index].surges += world.events.filter((event) => event.kind === 'surge' && event.fighter === fighter.id).length;
      sides[index].minutes += elapsed / 60;
      if (fighter.temperament) sides[index].temperaments.push(fighter.temperament);
    });
  }
  return sides.map((side) => ({
    distance: side.distance / Math.max(1, side.samples),
    inside: side.inside / Math.max(1, side.samples),
    attacksPerMinute: side.thrown / side.minutes,
    surgesPerMinute: side.surges / side.minutes,
    attacksPerSurge: side.surges ? side.thrown / side.surges : 0,
    working: side.working / Math.max(1, side.samples),
    bursty: side.burst / Math.max(1, side.attacks),
    temperaments: side.temperaments,
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bouts = Number(process.argv[2] ?? 3);
  const seconds = Number(process.argv[3] ?? 60);
  for (const [red, blue] of SPACING_PAIRINGS) {
    const rows = spacing(red, blue, bouts, seconds);
    const show = (name, row) => `${name.padEnd(36)} ${row.distance.toFixed(2)} m, ${(row.inside * 100).toFixed(0).padStart(3)}% inside, ${row.attacksPerMinute.toFixed(0).padStart(3)} att/min, ${row.surgesPerMinute.toFixed(1)} surges/min, working ${(row.working * 100).toFixed(0)}%, in bursts ${(row.bursty * 100).toFixed(0)}%`;
    console.log(show(red, rows[0]));
    console.log(show(`  v ${blue}`, rows[1]));
  }
}
