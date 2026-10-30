import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, buildBody } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld } from '../src/physics.js';

test('a robot has no morale and no blood: never afraid, never runs, never bleeds', () => {
  const swordsman = { ...structuredClone(PRESETS.contender), style: 'katana' };
  const world = createWorld([{ inputs: structuredClone(PRESETS.humanoid), corner: 'red' }, ...[1, 2, 3].map(() => ({ inputs: structuredClone(swordsman), corner: 'blue' }))], { seed: 3 });
  const robot = world.fighters[0];
  assert.ok(robot.body.gear.machine);
  robot.legDamage.l = 1e3;
  robot.bleed = 0.5;
  for (let t = 0; t < 4; t += 0.1) {
    robot.fear = 1;
    advance(world, 0.1, (current, dt) => thinkAll(current, dt));
    assert.ok(!robot.panicked, 'never breaks');
  }
  assert.equal(robot.fear, 0, 'never afraid');
  assert.ok(!(robot.bloodLost > 0), 'no blood lost');
  // A man so wounded does bleed.
  const man = world.fighters[1];
  man.bleed = 0.01;
  advance(world, 0.5);
  assert.ok(man.bloodLost > 0);
});

test('a robot tires: its motors heat under flurries and cool slowly, below a trained man\'s wind', () => {
  const trained = buildBody(PRESETS.light).aerobic;
  for (const robot of ['humanoid', 'combatBot']) assert.ok(buildBody(PRESETS[robot]).aerobic < 0.7 * trained, robot);
  assert.ok(buildBody(PRESETS.combatBot).aerobic < buildBody(PRESETS.humanoid).aerobic, 'the heavier machine tires sooner');
});
