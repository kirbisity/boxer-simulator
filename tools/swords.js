// Sword fighters against fists and against each other: how bouts end, who wins,
// how often a hand is cut off on the blade, blocks, clashes and spacing.
import { thinkAll } from '../src/ai.js';
import { P } from '../src/body.js';
import { advance, boutWinner, createWorld, point, reachOf } from '../src/physics.js';
import { fighterFor } from './weapons.js';
const PAIRS = [['contender:longsword', 'contender:boxing'], ['contender:katana', 'heavy:boxing'], ['contender:katana', 'contender:street'], ['contender:longsword', 'contender:katana'], ['contender:katana', 'contender:katana']];
for (const [red, blue] of PAIRS) {
  const t = { bouts: 0, red: 0, blue: 0, seconds: 0, bladeCuts: 0, handsOff: 0, clashes: 0, blocks: 0, swordAttacks: 0, minutes: 0, gap: 0, samples: 0 };
  for (let seed = 0; seed < 6; seed++) {
    const world = createWorld([fighterFor(red), fighterFor(blue)], { seed: 1200 + seed });
    let e = 0;
    while (e < 90 && !boutWinner(world)) {
      advance(world, 0.1, (c, dt) => thinkAll(c, dt)); e += 0.1;
      const [a, b] = world.fighters;
      if (a.state === 'up' && b.state === 'up') { t.gap += Math.hypot(a.x[24] - b.x[24], a.x[26] - b.x[26]); t.samples += 1; }
    }
    const w = boutWinner(world); t.bouts++; t.seconds += e; t.minutes += e / 60; if (w) t[w]++;
    t.bladeCuts += world.events.filter((ev) => ev.kind === 'bladeBlock').length;
    t.handsOff += world.events.filter((ev) => ev.kind === 'severed' && ev.joint === 'wrist').length;
    t.clashes += world.events.filter((ev) => ev.kind === 'clash').length;
    t.swordAttacks += world.fighters[0].stats.thrown;
  }
  console.log(`${red} v ${blue}`.padEnd(42), `${(t.seconds / t.bouts).toFixed(0)}s red ${t.red} blue ${t.blue} | gap ${(t.gap / t.samples).toFixed(2)} m | sword att/min ${(t.swordAttacks / t.minutes).toFixed(0)} | blade blocks cutting ${t.bladeCuts} hands off ${t.handsOff} clashes ${t.clashes}`);
}
