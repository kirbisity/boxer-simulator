import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { confidence, think, thinkAll } from '../src/ai.js';
import { crowdBout } from '../tools/crowds.js';
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
  // Twelve bouts: fewer flip on chance (holds, injuries and falls end some early).
  const on = fearProfile(pair, { bouts: 12, seconds: 45 });
  const off = fearProfile(pair, { bouts: 12, seconds: 45, enabled: false });
  const [heavy, light] = [0, 1];
  assert.ok(on[heavy].confidence > 0.3 && on[light].confidence < -0.3, `confidence ${on[heavy].confidence.toFixed(2)} / ${on[light].confidence.toFixed(2)}`);
  assert.ok(on[heavy].advancing > off[heavy].advancing, 'the confident man presses forward more');
  assert.ok(on[heavy].defencesPerMinute < off[heavy].defencesPerMinute, 'and covers up less');
  assert.ok(on[light].advancing < off[light].advancing, 'the afraid man keeps away');
  assert.ok(on[light].defencesPerMinute > off[light].defencesPerMinute, 'and defends more');
});

test('uneven sides, up to eight a side: everyone fits the floor, team-mates rarely hit each other, nothing breaks', () => {
  // A rate needs a sample: five short crowd fights of each shape, pooled.
  for (const [red, blue] of [[1, 5], [8, 3]]) {
    const total = { broken: 0, friendly: 0, landed: 0, pops: 0, fighterMinutes: 0 };
    for (const seed of [2, 3, 4, 5, 6]) {
      const tally = crowdBout(red, blue, { seconds: 30, seed });
      for (const key of Object.keys(total)) total[key] += tally[key];
    }
    assert.equal(total.broken, 0, `${red} v ${blue}`);
    assert.ok(total.friendly <= total.landed * 0.05, `${red} v ${blue}: ${total.friendly} of ${total.landed} landed blows on a team-mate`);
    assert.ok(total.pops / total.fighterMinutes < 0.5, `${red} v ${blue}: pops`);
  }
});

test('outnumbered is afraid; outnumbering, bold', () => {
  const world = team(['amateur'], ['amateur', 'amateur', 'amateur']);
  const [alone, ...gang] = world.fighters;
  assert.ok(confidence(alone, gang[0], world) < -0.4, `alone ${confidence(alone, gang[0], world).toFixed(2)}`);
  assert.ok(confidence(gang[0], alone, world) > 0.4, `gang ${confidence(gang[0], alone, world).toFixed(2)}`);
});
