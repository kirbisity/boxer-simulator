// Trailer: Sekigahara (Battle Mode) seeds where an East (red) teppō shoots a West (blue) samurai down. Not part of the game.
//   node tools/trailer-seki-scout.js [seed0=1] [seeds=8] [seconds=60]
import { thinkAll } from '../src/ai.js';
import { advance } from '../src/physics.js';
import { battleOf } from '../src/scenarios.js';
import { createWorld, seededRandom } from '../src/physics.js';

// Every samurai masked (the trailer's): the two unmasked kabuto designs swapped for masked ones (as tools/trailer-capture.js `masked`).
export const MASKED = { samurai: { 0: 3, 2: 4 } };
export const masked = (inputs) => {
  const swap = MASKED[inputs.outfit?.kind]?.[inputs.outfit.design];
  return swap == null ? inputs : { ...inputs, outfit: { ...inputs.outfit, design: swap } };
};

const [seed0 = '1', seeds = '8', seconds = '60'] = process.argv.slice(2);
for (let seed = Number(seed0); seed < Number(seed0) + Number(seeds); seed += 1) {
  const scenario = battleOf('sekigahara');
  const cast = scenario.cast(seededRandom(seed));
  const fighters = Object.entries(cast).flatMap(([corner, side]) => side.map((inputs) => ({ inputs: masked(inputs), corner })));
  const inputs = fighters.map((f) => f.inputs);
  const world = createWorld(fighters, { seed, arena: scenario.arena, rules: scenario.rules, formation: scenario.formation, place: scenario.scene });
  for (let t = 0; t < Number(seconds); t += 0.1) advance(world, 0.1, (c, dt) => thinkAll(c, dt));
  const hits = world.events.filter((e) => e.kind === 'shot' && e.attacker != null && e.defender != null
    && world.fighters[e.attacker].corner === 'red' && world.fighters[e.defender].corner === 'blue'
    && /samurai/.test(inputs[e.defender]?.outfit?.kind ?? ''))
    .map((e) => ({ t: +e.time.toFixed(2), gunner: e.attacker, victim: e.defender, kit: inputs[e.defender].outfit.kind, target: e.target, fx: (e.effects ?? []).join('; ') }));
  console.log(JSON.stringify({ seed, hits }));
}
