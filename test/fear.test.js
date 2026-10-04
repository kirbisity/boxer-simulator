import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { adrenalineGain, AI, confidence, thinkAll } from '../src/ai.js';
import { advance, createWorld, WORLD } from '../src/physics.js';

test('a passive fighter never strikes back, and keeps away', () => {
  const world = createWorld([{ ...PRESETS.passive }, { ...PRESETS.contender, style: 'boxing' }], { seed: 4, arena: { halfX: 6.5, halfZ: 4.4 } });
  let apart = 0;
  for (let second = 0; second < 20; second += 0.1) {
    advance(world, 0.1, (current, dt) => thinkAll(current, dt));
    const [a, b] = world.fighters;
    apart += Math.hypot(a.x[24] - b.x[24], a.x[26] - b.x[26]) / 200;
  }
  assert.equal(world.fighters[0].stats.thrown, 0);
  assert.equal(world.fighters[0].style, 'passive', 'chosen passive, he stays so');
  assert.ok(apart > 1.2, `kept ${apart.toFixed(2)} m away on average`);
});

test('armour is courage: the same man is bolder in plate than in a suit', () => {
  const world = createWorld([{ ...PRESETS.contender, style: 'longsword', outfit: { kind: 'knight', design: 0 } }, { ...PRESETS.contender, style: 'longsword', outfit: { kind: 'casual', design: 0 } }, { ...PRESETS.contender, style: 'longsword' }]);
  const [knight, plain, opponent] = world.fighters;
  assert.ok(confidence(knight, opponent) > confidence(plain, opponent) + 0.2);
});

test('adrenaline surges more in a young big man than in an older, smaller woman', () => {
  const world = createWorld([{ ...PRESETS.heavy, age: 24 }, { ...PRESETS.amateur, sex: 'female', heightCm: 160, age: 55 }]);
  assert.ok(adrenalineGain(world.fighters[0]) > adrenalineGain(world.fighters[1]) * 1.4);
});

test('broken by fear he throws his weapon down; with adrenaline up he does not break', () => {
  const run = (adrenaline) => {
    const world = createWorld([{ ...PRESETS.contender, style: 'katana' }, { ...PRESETS.heavy, style: 'longsword' }], { seed: 2 });
    const man = world.fighters[0];
    man.concussion = 1e9;
    man.fear = 1;
    for (let second = 0; second < 8 && !man.panicked; second += 0.1) {
      man.adrenaline = adrenaline;
      advance(world, 0.1, (current, dt) => thinkAll(current, dt, new Set([1])));
    }
    return man;
  };
  const broken = run(0);
  assert.ok(broken.panicked, 'he breaks');
  assert.equal(broken.weapon, null, 'and drops the katana');
  assert.ok(!run(1).panicked, 'adrenaline holds him');
});

test('a body out for longer than the limit is left where it lies, unsimulated', () => {
  const world = createWorld([{ ...PRESETS.contender }, { ...PRESETS.contender }]);
  const body = world.fighters[1];
  body.state = 'out';
  body.motorScale = 0;
  advance(world, WORLD.goneSeconds + 1);
  const before = Array.from(body.x);
  body.v.fill(5);
  advance(world, 1);
  assert.deepEqual(Array.from(body.x), before);
  assert.ok(AI.panic.breakAt < 1);
});
