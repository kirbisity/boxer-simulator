// The handgun in a fight: how bouts end, shots fired and where they hit,
// how often the gun is knocked away, and time spent fighting hand to hand.
// Usage: node tools/gun.js [bouts] [seconds] [filter]

import { PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld, WORLD } from '../src/physics.js';

// The floors (as render.js has them; that module needs a browser).
const PLACE_ARENAS_DATA = { ring: { halfX: WORLD.ringHalf, halfZ: WORLD.ringHalf }, colosseum: { halfX: 6.5, halfZ: 4.4 } };

export const GUN_PAIRINGS = [
  ['handgun', 'contender', 'ring'],
  ['handgun', 'contender', 'colosseum'],
  ['handgun', 'knight', 'colosseum'],
  ['handgun', 'baton', 'colosseum'],
  ['handgun', 'knife', 'colosseum'],
  ['handgun', 'handgun', 'colosseum'],
];

export function gunOutcomes(bouts = 6, seconds = 60, pairings = GUN_PAIRINGS) {
  return pairings.map(([red, blue, place]) => {
    const row = { pairing: `${red} v ${blue} (${place})`, wins: { red: 0, blue: 0, none: 0 }, ends: {}, shots: 0, hits: { head: 0, torso: 0, limb: 0, shield: 0 }, disarmed: 0, close: 0, seconds: 0 };
    for (let bout = 0; bout < bouts; bout += 1) {
      const world = createWorld([{ ...PRESETS[red] }, { ...PRESETS[blue] }], { seed: 900 + bout, arena: PLACE_ARENAS_DATA[place] });
      let elapsed = 0;
      while (elapsed < seconds && !boutWinner(world)) {
        advance(world, 0.1, (current, dt) => thinkAll(current, dt));
        elapsed += 0.1;
        const [a, b] = world.fighters;
        if (a.weapon?.held && Math.hypot(a.x[24] - b.x[24], a.x[26] - b.x[26]) < 1.3) row.close += 0.1;
      }
      row.seconds += elapsed;
      row.wins[boutWinner(world) ?? 'none'] += 1;
      const end = [...world.events].reverse().find((event) => ['knockout', 'killed', 'severed', 'bledOut', 'stopped', 'pinned'].includes(event.kind))?.kind ?? 'distance';
      row.ends[end] = (row.ends[end] ?? 0) + 1;
      for (const event of world.events) {
        if (event.kind === 'shot' && event.attacker === 0) {
          row.shots += 1;
          if (event.region) row.hits[event.region] += 1;
          else if (event.target === 'shield') row.hits.shield += 1;
        }
        if (event.kind === 'disarmed' && event.fighter === 0) row.disarmed += 1;
      }
    }
    return row;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bouts = Number(process.argv[2] ?? 6);
  const seconds = Number(process.argv[3] ?? 60);
  const filter = process.argv[4];
  const pairings = filter ? GUN_PAIRINGS.filter((row) => row.join(' ').includes(filter)) : GUN_PAIRINGS;
  for (const row of gunOutcomes(bouts, seconds, pairings)) {
    const hit = row.hits.head + row.hits.torso + row.hits.limb;
    const ends = Object.entries(row.ends).map(([key, count]) => `${key} ${count}`).join(', ');
    console.log(`${row.pairing.padEnd(36)} ${(row.seconds / bouts).toFixed(0).padStart(3)} s | ${ends} | red ${row.wins.red} blue ${row.wins.blue} | shots ${row.shots} hit ${row.shots ? Math.round((hit / row.shots) * 100) : 0}% (head ${row.hits.head} torso ${row.hits.torso} limb ${row.hits.limb} shield ${row.hits.shield}) | gun lost ${row.disarmed} | close ${(row.close / bouts).toFixed(0)} s`);
  }
}
