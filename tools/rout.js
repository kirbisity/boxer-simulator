// Routs in the big battles: of each side's men, how many broke (panicked),
// how many crawled away, how many left the field, how many went down for
// good, and how many were still fighting when it ended. History has most
// battles end in a rout, not to the last man.
// Usage: node tools/rout.js [levels=legion,rebellion,wokou] [seconds=150] [seed=1]

import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld, seededRandom } from '../src/physics.js';
import { SCENARIOS } from '../src/scenarios.js';
import { normaliseInputs } from '../src/body.js';

/** One level's battle, fought by the AI on both sides, and what became of each man. */
export function routBattle(key, { seconds = 150, seed = 1 } = {}) {
  const level = SCENARIOS[key];
  const sides = level.cast(seededRandom(seed));
  const entries = ['red', 'blue'].flatMap((corner) => sides[corner].map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner })));
  const world = createWorld(entries, { seed, arena: level.arena, rules: level.rules, formation: level.formation });
  const broke = new Set();
  let elapsed = 0;
  while (elapsed < seconds && !boutWinner(world)) {
    advance(world, 0.1, (current, dt) => thinkAll(current, dt));
    elapsed += 0.1;
    for (const fighter of world.fighters) if (fighter.panicked) broke.add(fighter.id);
  }
  const tally = {};
  for (const corner of ['red', 'blue']) {
    const men = world.fighters.filter((fighter) => fighter.corner === corner);
    tally[corner] = {
      men: men.length,
      broke: men.filter((fighter) => broke.has(fighter.id)).length,
      crawled: men.filter((fighter) => fighter.crawling).length,
      fled: men.filter((fighter) => fighter.fled).length,
      down: men.filter((fighter) => fighter.state === 'out' && !fighter.fled).length,
      fighting: men.filter((fighter) => fighter.state !== 'out' && !fighter.crawling && !fighter.panicked && !fighter.fled).length,
    };
  }
  return { key, seconds: Math.round(elapsed), winner: boutWinner(world), ...tally };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const keys = (process.argv[2] ?? 'legion,rebellion,wokou').split(',');
  const seconds = Number(process.argv[3] ?? 150);
  const seed = Number(process.argv[4] ?? 1);
  for (const key of keys) {
    const row = routBattle(key, { seconds, seed });
    const side = (s) => `${s.men} men: broke ${s.broke}, crawled ${s.crawled}, fled ${s.fled}, down ${s.down}, fighting ${s.fighting}`;
    console.log(`${key.padEnd(10)} ${String(row.seconds).padStart(3)} s  winner ${row.winner ?? '-'}  | red ${side(row.red)} | blue ${side(row.blue)}`);
  }
}
