// The matchlock, measured two ways.
//   shots — one aimed shot at a man standing 6 m off, many times, for each
//           armour: where it hits, how hard, and how often one shot drops
//           him (down or out within 2 s). The pistol alongside, as a check
//           that its numbers do not move.
//   duels — the teppō gunner and the arquebusier against each faction's
//           lead: who wins, shots, hits, misfires, reloads, and how long
//           until the sidearm comes out.
// Usage: node tools/matchlock.js [shots|duels|all] [count]

import { normaliseInputs, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld, placeFighter, throwPunch } from '../src/physics.js';

const ARMOURS = [
  ['none', null], ['ashigaru', { kind: 'ashigaru', design: 0 }], ['ō-yoroi', { kind: 'samurai', design: 0 }], ['tōsei', { kind: 'samuraiTosei', design: 0 }],
  ['foot soldier', { kind: 'footman', design: 0 }], ['mail', { kind: 'knightMail', design: 0 }], ['plate', { kind: 'knight', design: 0 }], ['SWAT', { kind: 'swat', design: 0 }],
];

const ARQUEBUSIER = { ...PRESETS.contender, name: 'Hans Brenner', sex: 'male', style: 'matchlock', outfit: { kind: 'footman', design: 1 }, accessories: [] };

/** One shot from `shooter` (a preset) with `move`, at a man in `outfit`, `count` times. */
export function shotTable(shooter, move, count = 40) {
  return ARMOURS.map(([label, outfit]) => {
    const row = { label, shots: 0, hits: { head: 0, torso: 0, limb: 0 }, harm: { head: 0, torso: 0, limb: 0 }, dropped: 0, broken: 0 };
    for (let trial = 0; trial < count; trial += 1) {
      const target = normaliseInputs({ ...structuredClone(PRESETS.contender), sex: 'male', heightCm: 176, style: 'unskilled', outfit, accessories: [] });
      const world = createWorld([{ inputs: structuredClone(shooter), corner: 'red' }, { inputs: target, corner: 'blue' }], { seed: 2000 + trial, arena: { halfX: 10, halfZ: 6 } });
      placeFighter(world.fighters[0], -3, 0);
      placeFighter(world.fighters[1], 3, 0);
      advance(world, 0.5);
      throwPunch(world, world.fighters[0], move, 'body');
      advance(world, 2.5);
      const shot = world.events.find((event) => event.kind === 'shot');
      if (!shot) continue;
      row.shots += 1;
      if (shot.region) {
        row.hits[shot.region] += 1;
        row.harm[shot.region] += shot.harm;
      }
      if (world.fighters[1].state !== 'up') row.dropped += 1;
      if (world.events.some((event) => event.kind === 'broken')) row.broken += 1;
    }
    return row;
  });
}

const OPPONENTS = ['knight', 'samurai', 'hoplomachus', 'heavy', 'street', 'handgun'];

/** The two gunners against each faction's lead, `bouts` each, up to `seconds`. */
export function duelTable(bouts = 12, seconds = 60) {
  const rows = [];
  for (const [label, gunner] of [['teppō', PRESETS.matchlock], ['arquebus', ARQUEBUSIER]]) {
    for (const opponent of OPPONENTS) {
      const row = { pairing: `${label} v ${opponent}`, wins: { red: 0, blue: 0, none: 0 }, shots: 0, hits: 0, misfires: 0, reloads: 0, drawn: 0, drawnAt: 0, firstShotDrops: 0, seconds: 0 };
      for (let bout = 0; bout < bouts; bout += 1) {
        const world = createWorld([{ inputs: structuredClone(gunner), corner: 'red' }, { inputs: structuredClone(PRESETS[opponent]), corner: 'blue' }], { seed: 3100 + bout, arena: { halfX: 6.5, halfZ: 4.4 } });
        let elapsed = 0;
        while (elapsed < seconds && !boutWinner(world)) {
          advance(world, 0.1, (current, dt) => thinkAll(current, dt));
          elapsed += 0.1;
        }
        row.seconds += elapsed;
        row.wins[boutWinner(world) ?? 'none'] += 1;
        const mine = world.events.filter((event) => event.attacker === 0 || event.fighter === 0);
        const shots = mine.filter((event) => event.kind === 'shot');
        row.shots += shots.length;
        row.hits += shots.filter((event) => event.region).length;
        row.misfires += mine.filter((event) => event.kind === 'misfire').length;
        row.reloads += mine.filter((event) => event.kind === 'reloaded').length;
        const drew = mine.find((event) => event.kind === 'drew');
        if (drew) {
          row.drawn += 1;
          row.drawnAt += drew.time;
        }
        const first = shots[0];
        if (first?.region && world.events.some((event) => event.time >= first.time && event.time < first.time + 2 && ['knockout', 'killed', 'broken'].includes(event.kind) && (event.fighter === 1 || event.defender === 1))) row.firstShotDrops += 1;
      }
      rows.push(row);
    }
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] ?? 'all';
  const count = Number(process.argv[3] ?? (mode === 'duels' ? 12 : 40));
  if (mode === 'shots' || mode === 'all') {
    for (const [title, shooter, move] of [['MATCHLOCK', PRESETS.matchlock, 'fireLong'], ['PISTOL', PRESETS.handgun, 'shoot']]) {
      console.log(`${title}: one shot at 6 m, ${count} trials per armour`);
      for (const row of shotTable(shooter, move, count)) {
        const hit = row.hits.head + row.hits.torso + row.hits.limb;
        const mean = (region) => (row.hits[region] ? (row.harm[region] / row.hits[region]).toFixed(2) : '  - ');
        console.log(`  ${row.label.padEnd(13)} hit ${String(Math.round((hit / Math.max(1, row.shots)) * 100)).padStart(3)}% | harm head ${mean('head')} torso ${mean('torso')} limb ${mean('limb')} | dropped ${String(Math.round((row.dropped / Math.max(1, row.shots)) * 100)).padStart(3)}% | bone broken ${row.broken}`);
      }
    }
  }
  if (mode === 'duels' || mode === 'all') {
    const bouts = mode === 'all' ? 12 : count;
    console.log(`DUELS: ${bouts} bouts each, 60 s`);
    for (const row of duelTable(bouts)) {
      console.log(`  ${row.pairing.padEnd(24)} gunner ${row.wins.red} – ${row.wins.blue} (${row.wins.none} unfinished) | shots ${(row.shots / bouts).toFixed(1)}/bout, hit ${row.shots ? Math.round((row.hits / row.shots) * 100) : 0}%, misfires ${row.misfires}, reloads ${row.reloads} | first hit drops ${row.firstShotDrops} | sidearm in ${row.drawn} bouts, at ${row.drawn ? (row.drawnAt / row.drawn).toFixed(1) : '-'} s`);
    }
  }
}
