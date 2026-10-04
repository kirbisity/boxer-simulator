// Fear, panic and adrenaline: per pairing, how many break and when, how
// many rally, the time spent broken, and how bouts end.
// Usage: node tools/panic.js [bouts] [seconds]

import { PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld } from '../src/physics.js';
import { fighterFor } from './weapons.js';

export const PANIC_PAIRINGS = [
  ['heavy:boxing', 'light:boxing'],
  ['contender:katana', 'contender:boxing'],
  ['contender:longsword:knight', 'contender:street'],
  ['contender:knife', 'contender:unskilled'],
  ['handgun', 'contender'],
];

const build = (spec) => (PRESETS[spec] ? { ...PRESETS[spec] } : fighterFor(spec));

export function panicOutcomes(bouts = 6, seconds = 90, pairings = PANIC_PAIRINGS) {
  return pairings.map(([red, blue]) => {
    const row = { pairing: `${red} v ${blue}`, panics: [0, 0], rallies: 0, brokenSeconds: 0, firstAt: [], wins: { red: 0, blue: 0, none: 0 } };
    for (let bout = 0; bout < bouts; bout += 1) {
      const world = createWorld([build(red), build(blue)], { seed: 800 + bout, arena: { halfX: 6.5, halfZ: 4.4 } });
      let elapsed = 0;
      while (elapsed < seconds && !boutWinner(world)) {
        advance(world, 0.1, (current, dt) => thinkAll(current, dt));
        elapsed += 0.1;
        if (world.fighters.some((fighter) => fighter.panicked)) row.brokenSeconds += 0.1;
      }
      for (const event of world.events) {
        if (event.kind === 'panic') {
          row.panics[event.fighter] += 1;
          row.firstAt.push(event.time);
        }
        if (event.kind === 'rally') row.rallies += 1;
      }
      row.wins[boutWinner(world) ?? 'none'] += 1;
    }
    return row;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bouts = Number(process.argv[2] ?? 6);
  const seconds = Number(process.argv[3] ?? 90);
  for (const row of panicOutcomes(bouts, seconds)) {
    const first = row.firstAt.length ? `first at ${Math.min(...row.firstAt).toFixed(0)} s` : '';
    console.log(`${row.pairing.padEnd(42)} panics red ${row.panics[0]} blue ${row.panics[1]} | rallies ${row.rallies} | broken ${(row.brokenSeconds / bouts).toFixed(0)} s/bout ${first} | red ${row.wins.red} blue ${row.wins.blue} none ${row.wins.none}`);
  }
}
