// What puts fighters on the floor: each fall or knockdown with the strike
// that preceded it, and the weights involved.
// Usage: node tools/falls.js [kicker:style] [target:style] [bouts] [seconds]

import { PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld } from '../src/physics.js';

const fighterFor = (spec) => {
  const [preset, style = 'boxing'] = spec.split(':');
  return { ...PRESETS[preset], style };
};

/** Bouts between two fighters; counts of each way down, by who went down. */
export function countFalls(red, blue, bouts = 8, seconds = 90) {
  const tally = { minutes: 0, strikes: {}, downs: {} };
  for (let bout = 0; bout < bouts; bout += 1) {
    const world = createWorld([fighterFor(red), fighterFor(blue)], { seed: 900 + bout });
    let elapsed = 0;
    let lastHit = [null, null];
    while (elapsed < seconds && !boutWinner(world)) {
      advance(world, 0.5, (current, dt) => thinkAll(current, dt));
      elapsed += 0.5;
      for (const event of world.events.splice(0)) {
        if (event.kind === 'landed' || event.kind === 'blocked') {
          lastHit[event.defender] = event.punch;
          tally.strikes[event.punch] = (tally.strikes[event.punch] ?? 0) + 1;
          for (const effect of event.effects) {
            if (effect.startsWith('knockdown') || effect.includes('leg gave')) {
              const key = `${world.fighters[event.defender].corner} ${effect} by ${event.punch}`;
              tally.downs[key] = (tally.downs[key] ?? 0) + 1;
            }
          }
        }
        if (event.kind === 'fell') {
          const key = `${world.fighters[event.fighter].corner} fell (${event.effects[0]}${event.onOneFoot ? ', on one foot' : ''}) after ${lastHit[event.fighter] ?? 'nothing'}`;
          tally.downs[key] = (tally.downs[key] ?? 0) + 1;
        }
      }
    }
    tally.minutes += elapsed / 60;
  }
  return tally;
}

if (process.argv[1]?.endsWith('falls.js')) {
  const [red = 'light:kickboxing', blue = 'heavy:kickboxing', bouts = '8', seconds = '90'] = process.argv.slice(2);
  const tally = countFalls(red, blue, Number(bouts), Number(seconds));
  console.log(`${red} (red) vs ${blue} (blue): ${tally.minutes.toFixed(1)} bout-minutes`);
  console.log('strikes', tally.strikes);
  console.log('downs', tally.downs);
}
