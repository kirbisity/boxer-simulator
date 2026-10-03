// Headless bouts: the same physics and AI as the page, no rendering.
// Usage: node tools/bout.js [redPreset] [bluePreset] [bouts] [seconds]

import { PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld } from '../src/physics.js';

const [red = 'heavy', blue = 'light', boutsArg = '10', secondsArg = '180'] = process.argv.slice(2);
const bouts = Number(boutsArg);
const seconds = Number(secondsArg);

const totals = { red: { wins: 0, kd: 0 }, blue: { wins: 0, kd: 0 }, draws: 0 };
const speeds = { red: {}, blue: {} };
const impacts = [];
const stamina = { red: [], blue: [] };
let thrown = 0;
let landed = 0;
const started = performance.now();
for (let bout = 0; bout < bouts; bout += 1) {
  const world = createWorld([PRESETS[red], PRESETS[blue]], { seed: 1000 + bout });
  let elapsed = 0;
  while (elapsed < seconds && !boutWinner(world)) {
    advance(world, 1, (current, dt) => thinkAll(current, dt));
    elapsed += 1;
    for (const fighter of world.fighters) (stamina[fighter.corner][Math.min(5, Math.floor(elapsed / 30))] ??= []).push(fighter.stamina);
  }
  const winner = boutWinner(world);
  if (winner) totals[winner].wins += 1;
  else totals.draws += 1;
  for (const fighter of world.fighters) {
    totals[fighter.corner].kd += fighter.stats.knockdownsScored;
    thrown += fighter.stats.thrown;
    landed += fighter.stats.landed;
  }
  for (const event of world.events) {
    if (event.kind !== 'landed' && event.kind !== 'blocked') continue;
    const corner = world.fighters[event.attacker].corner;
    (speeds[corner][event.punch] ??= []).push(event.speed);
    impacts.push(event);
  }
}
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const fmt = (value, digits = 1) => value.toFixed(digits);
console.log(`${red} (red) vs ${blue} (blue), ${bouts} bouts of up to ${seconds}s, ${fmt((performance.now() - started) / 1000)}s wall`);
console.log(`wins red ${totals.red.wins}  blue ${totals.blue.wins}  draws ${totals.draws}; knockdowns scored red ${totals.red.kd} blue ${totals.blue.kd}`);
console.log(`punches thrown ${thrown}, landed ${landed} (${fmt((100 * landed) / Math.max(1, thrown))}%)`);
for (const corner of ['red', 'blue']) {
  const parts = Object.entries(speeds[corner]).map(([punch, values]) => `${punch} ${fmt(mean(values))} m/s`);
  console.log(`  ${corner} impact speeds: ${parts.join(', ')}`);
}
const head = impacts.filter((event) => event.target === 'head');
const sorted = head.map((event) => event.headDeltaV).sort((a, b) => a - b);
const quantile = (q) => sorted[Math.floor(q * (sorted.length - 1))] ?? 0;
console.log(`head shots ${head.length}: head Δv median ${fmt(quantile(0.5), 2)} p90 ${fmt(quantile(0.9), 2)} max ${fmt(quantile(1), 2)} m/s; force median ${fmt(mean(head.map((event) => event.force)), 0)} N`);
const effects = {};
for (const event of impacts) for (const effect of event.effects) effects[effect] = (effects[effect] ?? 0) + 1;
console.log('effects', effects);
const byTarget = {};
for (const event of impacts) byTarget[`${event.kind}:${event.target}`] = (byTarget[`${event.kind}:${event.target}`] ?? 0) + 1;
console.log('by target', byTarget);
const forces = impacts.map((event) => event.force).sort((a, b) => a - b);
console.log(`force p50 ${fmt(forces[Math.floor(forces.length / 2)] ?? 0, 0)} p90 ${fmt(forces[Math.floor(forces.length * 0.9)] ?? 0, 0)} max ${fmt(forces.at(-1) ?? 0, 0)} N`);
const landedHead = {};
for (const event of impacts) if (event.kind === 'landed' && event.target === 'head') (landedHead[event.punch] ??= []).push(event.speed);
console.log('landed head speed', Object.fromEntries(Object.entries(landedHead).map(([punch, values]) => [punch, `${fmt(mean(values))} m/s ×${values.length}`])));
for (const corner of ['red', 'blue']) console.log(`stamina by 30 s (${corner}):`, stamina[corner].map((values) => fmt(mean(values), 2)).join(' '));
