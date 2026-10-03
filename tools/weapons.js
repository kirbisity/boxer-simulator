// Weapon bouts: how they end (cut off, stabbed dead, bled out, knocked out,
// stopped, or still going), and what happened on the way — cuts, stabs,
// severed parts, disarms, blades meeting, blades turned by plate.
// Usage: node tools/weapons.js [bouts per pairing] [seconds] [pairing filter]

import { PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld } from '../src/physics.js';

// red vs blue: preset:style[:outfit]
export const WEAPON_PAIRINGS = [
  ['contender:katana', 'contender:katana'],
  ['contender:longsword', 'contender:katana'],
  ['contender:longsword', 'heavy:boxing'],
  ['contender:knife', 'contender:boxing'],
  ['contender:knife', 'contender:knife'],
  ['contender:baton', 'contender:street'],
  ['heavy:baton', 'contender:baton'],
  ['contender:katana', 'contender:katana:knight'],
  ['contender:longsword', 'contender:boxing:swat'],
  ['contender:katana', 'contender:katana:samurai'],
  ['contender:hoplomachus:hoplomachus', 'contender:longsword'],
  ['contender:hoplomachus:hoplomachus', 'contender:hoplomachus:hoplomachus'],
  ['contender:warhammer', 'contender:katana:knight'],
  ['contender:warhammer', 'contender:boxing'],
  ['contender:naginata', 'contender:katana'],
  ['contender:naginata', 'contender:boxing'],
  ['contender:spear', 'contender:boxing'],
  ['contender:spear', 'contender:longsword'],
];

export const fighterFor = (spec) => {
  const [preset, style, outfit] = spec.split(':');
  return { ...PRESETS[preset], style, ...(outfit ? { outfit: { kind: outfit, design: 0 } } : {}) };
};

const ENDS = ['severed', 'killed', 'bledOut', 'knockout', 'stopped'];

export function weaponOutcomes(bouts = 4, seconds = 120, pairings = WEAPON_PAIRINGS) {
  const rows = [];
  for (const [red, blue] of pairings) {
    const row = { pairing: `${red} v ${blue}`, bouts: 0, seconds: 0, ends: Object.fromEntries([...ENDS, 'distance'].map((key) => [key, 0])), winners: { red: 0, blue: 0 }, cuts: 0, stabs: 0, severed: 0, disarmed: 0, clashes: 0, glances: 0, shield: 0 };
    for (let bout = 0; bout < bouts; bout += 1) {
      const world = createWorld([fighterFor(red), fighterFor(blue)], { seed: 500 + bout });
      let elapsed = 0;
      while (elapsed < seconds && !boutWinner(world)) {
        advance(world, 1, (current, dt) => thinkAll(current, dt));
        elapsed += 1;
      }
      // Let the last moment finish (a cut piece lands, a man falls).
      const winner = boutWinner(world);
      row.bouts += 1;
      row.seconds += elapsed;
      const kinds = world.events.map((event) => event.kind);
      const end = ENDS.find((kind) => kinds.includes(kind)) ?? (winner ? 'stopped' : 'distance');
      row.ends[end] += 1;
      if (winner) row.winners[winner] += 1;
      const weaponHits = world.events.filter((event) => event.weapon && (event.kind === 'landed' || event.kind === 'blocked'));
      row.cuts += weaponHits.filter((event) => event.cut > 0.5).length;
      row.stabs += weaponHits.filter((event) => event.pierce > 0.5).length;
      row.severed += kinds.filter((kind) => kind === 'severed').length;
      row.disarmed += world.events.filter((event) => event.kind === 'disarmed' && event.effects[0].includes('knocked away')).length;
      row.clashes += kinds.filter((kind) => kind === 'clash').length;
      row.glances += kinds.filter((kind) => kind === 'glance').length;
      row.shield += world.events.filter((event) => event.target === 'shield').length;
    }
    rows.push(row);
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bouts = Number(process.argv[2] ?? 3);
  const seconds = Number(process.argv[3] ?? 120);
  const filter = process.argv[4];
  const pairings = filter ? WEAPON_PAIRINGS.filter(([red, blue]) => `${red} v ${blue}`.includes(filter)) : WEAPON_PAIRINGS;
  for (const row of weaponOutcomes(bouts, seconds, pairings)) {
    const ends = Object.entries(row.ends).filter(([, count]) => count).map(([key, count]) => `${key} ${count}`).join(', ');
    console.log(`${row.pairing.padEnd(62)} ${(row.seconds / row.bouts).toFixed(0).padStart(4)} s | ${ends} | red ${row.winners.red} blue ${row.winners.blue} | cuts ${row.cuts} stabs ${row.stabs} severed ${row.severed} disarmed ${row.disarmed} clashes ${row.clashes} glances ${row.glances} shield ${row.shield}`);
  }
}
