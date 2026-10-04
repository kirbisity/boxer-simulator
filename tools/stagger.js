// Stagger: armoured fighters reel from heavy blows instead of dropping. Per
// pairing: how bouts end, knockdowns, staggers and how long they last, and
// how much harder a reeling man is hit.
// Usage: node tools/stagger.js [bouts] [seconds] [filter]

import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld } from '../src/physics.js';
import { fighterFor } from './weapons.js';

export const STAGGER_PAIRINGS = [
  ['contender:warhammer', 'contender:katana:knight'],
  ['contender:warhammer', 'contender:katana:samurai'],
  ['contender:warhammer', 'contender:boxing'],
  ['contender:longsword:knight', 'contender:katana:knight'],
  ['heavy:boxing', 'contender:boxing:swat'],
];

export function staggerOutcomes(bouts = 6, seconds = 90, pairings = STAGGER_PAIRINGS) {
  return pairings.map(([red, blue]) => {
    const row = { pairing: `${red} v ${blue}`, winners: { red: 0, blue: 0, none: 0 }, ends: {}, knockdowns: 0, staggers: 0, staggerSeconds: 0, seconds: 0 };
    for (let bout = 0; bout < bouts; bout += 1) {
      const world = createWorld([fighterFor(red), fighterFor(blue)], { seed: 700 + bout });
      let elapsed = 0;
      while (elapsed < seconds && !boutWinner(world)) {
        advance(world, 1, (current, dt) => thinkAll(current, dt));
        elapsed += 1;
      }
      row.seconds += elapsed;
      const winner = boutWinner(world) ?? 'none';
      row.winners[winner] += 1;
      const end = [...world.events].reverse().find((event) => ['knockout', 'killed', 'severed', 'bledOut', 'stopped', 'pinned'].includes(event.kind))?.kind ?? 'distance';
      row.ends[end] = (row.ends[end] ?? 0) + 1;
      row.knockdowns += world.fighters.reduce((sum, fighter) => sum + fighter.knockdowns, 0);
      const staggers = world.events.filter((event) => event.kind === 'staggered');
      row.staggers += staggers.length;
      row.staggerSeconds += staggers.reduce((sum, event) => sum + event.seconds, 0);
    }
    return row;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bouts = Number(process.argv[2] ?? 6);
  const seconds = Number(process.argv[3] ?? 90);
  const filter = process.argv[4];
  const pairings = filter ? STAGGER_PAIRINGS.filter(([red, blue]) => `${red} v ${blue}`.includes(filter)) : STAGGER_PAIRINGS;
  for (const row of staggerOutcomes(bouts, seconds, pairings)) {
    const ends = Object.entries(row.ends).map(([key, count]) => `${key} ${count}`).join(', ');
    console.log(`${row.pairing.padEnd(52)} ${(row.seconds / bouts).toFixed(0).padStart(3)} s | ${ends} | red ${row.winners.red} blue ${row.winners.blue} | knockdowns ${row.knockdowns} | staggers ${row.staggers}${row.staggers ? ` (${(row.staggerSeconds / row.staggers).toFixed(1)} s each)` : ''}`);
  }
}
