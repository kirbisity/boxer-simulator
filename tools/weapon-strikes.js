// One weapon move thrown at a standing, unresisting man from a set distance:
// how fast the blade arrives, with how much effective mass and energy, and
// what it does (cut, pierce, severed, killed). Calibrates the weapon moves.
// Usage: node tools/weapon-strikes.js [style] [move] [zone]

import { PRESETS } from '../src/body.js';
import { MOVES, STYLES } from '../src/moves.js';
import { advance, createWorld, placeFighter, reachOf, throwPunch } from '../src/physics.js';

export function strikeAt(style, move, zone, distance, { defender = 'contender', outfit = null, defenderStyle = 'boxing', seed = 1 } = {}) {
  const world = createWorld([{ ...PRESETS.contender, style }, { ...PRESETS[defender], style: defenderStyle, ...(outfit ? { outfit: { kind: outfit, design: 0 } } : {}) }], { seed });
  const [attacker, target] = world.fighters;
  placeFighter(attacker, -distance / 2, 0);
  placeFighter(target, distance / 2, 0);
  advance(world, 0.8);
  world.events.length = 0;
  throwPunch(world, attacker, move, zone);
  advance(world, MOVES[move].duration + 0.2);
  const hit = world.events.find((event) => event.attacker === attacker.id && (event.kind === 'landed' || event.kind === 'blocked'));
  return { hit, events: world.events, reach: reachOf(attacker), world };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const style = process.argv[2] ?? 'katana';
  const moves = process.argv[3] ? [process.argv[3]] : Object.keys(STYLES[style].attacks).filter((name) => MOVES[name].path === 'blade');
  for (const move of moves) {
    for (const zone of process.argv[4] ? [process.argv[4]] : MOVES[move].zones) {
      for (const distance of [1.2, 1.5, 1.8, 2.1]) {
        const { hit, events, reach } = strikeAt(style, move, zone, distance);
        const ends = events.filter((event) => ['severed', 'killed'].includes(event.kind)).map((event) => event.kind).join(',');
        console.log(`${move.padEnd(14)} ${zone.padEnd(5)} d ${distance.toFixed(1)} (reach ${reach.toFixed(2)}) ` + (hit ? `${hit.target.padEnd(9)} v ${hit.speed.toFixed(1).padStart(5)} m ${(hit.strikeMass ?? 0).toFixed(2)} E ${(hit.energy ?? 0).toFixed(0).padStart(4)} cut ${(hit.cut ?? 0).toFixed(0).padStart(4)} pierce ${(hit.pierce ?? 0).toFixed(0).padStart(4)} along ${(hit.along ?? 0).toFixed(2)} ${ends}` : 'miss'));
      }
    }
  }
}
