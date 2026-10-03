import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { think, thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld, point } from '../src/physics.js';
import { fearProfile } from '../tools/fear.js';

const team = (red, blue) => createWorld([
  ...red.map((key) => ({ inputs: { ...PRESETS[key], style: 'boxing' }, corner: 'red' })),
  ...blue.map((key) => ({ inputs: { ...PRESETS[key], style: 'boxing' }, corner: 'blue' })),
], { seed: 4 });

test('a team lines up abreast and each fighter takes the opponent in front of him', () => {
  const world = team(['heavy', 'veteran'], ['light', 'amateur']);
  advance(world, 0.3, (current, dt) => thinkAll(current, dt));
  const [a, b, c, d] = world.fighters;
  assert.ok(Math.abs(point(a.x, P.pelvis)[2] - point(b.x, P.pelvis)[2]) > 0.8, 'team-mates side by side');
  assert.notEqual(a.focus, b.focus, 'team-mates do not both take the same man');
  assert.notEqual(c.focus, d.focus);
});

test('hit by someone else, a fighter turns to him at once', () => {
  const world = team(['heavy', 'veteran'], ['light']);
  advance(world, 0.3, (current, dt) => thinkAll(current, dt));
  const [heavy, veteran, light] = world.fighters;
  light.focus = heavy.id;
  world.events.push({ time: world.time, kind: 'landed', attacker: veteran.id, defender: light.id, punch: 'hook', target: 'trunk', effects: [] });
  think(world, light, 1 / 60);
  assert.equal(light.focus, veteran.id);
});

test('when his man goes down, a fighter moves on to the nearest one still standing', () => {
  const world = team(['heavy'], ['light', 'amateur']);
  advance(world, 0.3, (current, dt) => thinkAll(current, dt));
  const [heavy, light, amateur] = world.fighters;
  heavy.focus = light.id;
  light.state = 'down';
  light.downTimer = 99;
  think(world, heavy, 1 / 60);
  assert.equal(heavy.focus, amateur.id);
});

test('a three-a-side fight runs on the same physics: everyone fights, and it ends when a side is out or time is up', () => {
  const world = team(['heavy', 'veteran', 'amateur'], ['light', 'contender', 'amateur']);
  let elapsed = 0;
  while (elapsed < 120 && !boutWinner(world)) {
    advance(world, 0.5, (current, dt) => thinkAll(current, dt));
    elapsed += 0.5;
  }
  assert.ok(world.fighters.every((fighter) => fighter.stats.thrown > 0), 'all six threw');
  assert.ok(world.fighters.every((fighter) => Array.from(fighter.x).every(Number.isFinite)));
  const switches = world.events.filter((event) => event.kind === 'focus').length;
  assert.ok(switches >= 6, `${switches} changes of focus`);
});

test('fear and confidence: the stronger man presses and covers up less, the weaker keeps away and defends more', () => {
  const pair = ['heavy', 'light'];
  const on = fearProfile(pair, { bouts: 3, seconds: 45 });
  const off = fearProfile(pair, { bouts: 3, seconds: 45, enabled: false });
  const [heavy, light] = [0, 1];
  assert.ok(on[heavy].confidence > 0.3 && on[light].confidence < -0.3, `confidence ${on[heavy].confidence.toFixed(2)} / ${on[light].confidence.toFixed(2)}`);
  assert.ok(on[heavy].advancing > off[heavy].advancing, 'the confident man presses forward more');
  assert.ok(on[heavy].defencesPerMinute < off[heavy].defencesPerMinute, 'and covers up less');
  assert.ok(on[light].advancing < off[light].advancing, 'the afraid man keeps away');
  assert.ok(on[light].defencesPerMinute > off[light].defencesPerMinute, 'and defends more');
});
