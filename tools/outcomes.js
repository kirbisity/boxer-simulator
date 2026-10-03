// How bouts end across a mix of styles and weights: knockouts, stoppages,
// knockdowns, broken joints, heavy attacks and strategy changes per bout.
// Usage: node tools/outcomes.js [bouts per pairing] [seconds]

import { PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld } from '../src/physics.js';

export const PAIRINGS = [
  ['heavy:boxing', 'light:boxing'], ['heavy:boxing', 'light:kickboxing'], ['light:muayThai', 'heavy:muayThai'],
  ['contender:muayThai', 'amateur:boxing'], ['veteran:kickboxing', 'contender:boxing'], ['heavy:muayThai', 'heavy:kickboxing'],
];

const fighterFor = (spec) => {
  const [preset, style] = spec.split(':');
  return { ...PRESETS[preset], style };
};

export function boutOutcomes(bouts = 4, seconds = 180, pairings = PAIRINGS) {
  const tally = { bouts: 0, knockouts: 0, stoppages: 0, distance: 0, knockdowns: 0, broken: 0, heavy: 0, heavyLanded: 0, strategies: 0, minutes: 0 };
  for (const [red, blue] of pairings) {
    for (let bout = 0; bout < bouts; bout += 1) {
      const world = createWorld([fighterFor(red), fighterFor(blue)], { seed: 300 + bout });
      let elapsed = 0;
      while (elapsed < seconds && !boutWinner(world)) {
        advance(world, 1, (current, dt) => thinkAll(current, dt));
        elapsed += 1;
      }
      tally.bouts += 1;
      tally.minutes += elapsed / 60;
      const kinds = world.events.map((event) => event.kind);
      if (kinds.includes('knockout')) tally.knockouts += 1;
      else if (boutWinner(world)) tally.stoppages += 1;
      else tally.distance += 1;
      tally.knockdowns += world.events.filter((event) => event.effects?.some((effect) => effect.startsWith('knockdown'))).length;
      tally.broken += kinds.filter((kind) => kind === 'broken').length;
      tally.heavy += kinds.filter((kind) => kind === 'heavy').length;
      tally.strategies += kinds.filter((kind) => kind === 'strategy').length;
    }
  }
  return tally;
}

if (process.argv[1]?.endsWith('outcomes.js')) {
  const [bouts = '4', seconds = '180'] = process.argv.slice(2);
  const tally = boutOutcomes(Number(bouts), Number(seconds));
  console.log(`${tally.bouts} bouts, ${tally.minutes.toFixed(0)} minutes`);
  console.log(`ended: knockout ${tally.knockouts}, stoppage ${tally.stoppages}, distance ${tally.distance}`);
  console.log(`per bout: knockdowns ${(tally.knockdowns / tally.bouts).toFixed(2)}, broken joints ${(tally.broken / tally.bouts).toFixed(2)}, heavy attacks ${(tally.heavy / tally.bouts).toFixed(1)}, plan changes ${(tally.strategies / tally.bouts).toFixed(1)}`);
}
