// Level Mode's cast: measure each (height, body and kit weight, skill), then duel each against the
// Forger and Vaelen against the Forger, headless, so a broken kit or style shows as a throw or a draw.
// Usage: node tools/levelpresets.js [bouts=3] [seconds=60]

import { buildBody } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld } from '../src/physics.js';
import { LEVEL_PRESETS, levelPreset } from '../src/levelmode/presets.js';

const [boutsArg = '3', secondsArg = '60'] = process.argv.slice(2);
const bouts = Number(boutsArg);
const seconds = Number(secondsArg);

for (const key of Object.keys(LEVEL_PRESETS)) {
  const inputs = levelPreset(key);
  const body = buildBody(inputs);
  console.log(`${key.padEnd(20)} ${String(inputs.heightCm).padStart(4)} cm  body ${body.bodyMassKg?.toFixed(1).padStart(6)} kg  total ${body.massKg.toFixed(1).padStart(6)} kg  skill ${inputs.skill}  ${inputs.style}`);
}

console.log('');
for (const key of Object.keys(LEVEL_PRESETS).filter((name) => name !== 'forger')) {
  const tally = { forger: 0, other: 0, draw: 0 };
  let ko = 0;
  for (let bout = 0; bout < bouts; bout += 1) {
    const world = createWorld([{ ...levelPreset('forger') }, { ...levelPreset(key) }], { seed: 500 + bout });
    for (let step = 0; step < seconds && !boutWinner(world); step += 1) advance(world, 1, (current, dt) => thinkAll(current, dt));
    const winner = boutWinner(world);
    tally[winner === 'red' ? 'forger' : winner === 'blue' ? 'other' : 'draw'] += 1;
    ko += world.fighters.filter((fighter) => fighter.stats.knockdownsScored > 0).length;
  }
  console.log(`forger vs ${key.padEnd(20)} forger ${tally.forger}  them ${tally.other}  draws ${tally.draw}  (${bouts} x ${seconds}s)`);
}
