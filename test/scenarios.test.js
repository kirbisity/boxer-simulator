import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, fistsOf, placeFighter, point, throwPunch, WORLD } from '../src/physics.js';
import { SCENARIOS, scenarioWorld } from '../src/scenarios.js';

test('the subway fighters are who the scenario says: height, weight, bare fists, the headset on', () => {
  const world = scenarioWorld('subway');
  const [kenji, dre] = world.fighters;
  assert.equal(kenji.body.inputs.heightCm, 183);
  assert.ok(Math.abs(kenji.body.massKg - 72) < 1.5, `Kenji ${kenji.body.massKg.toFixed(1)} kg`);
  assert.ok(Math.abs(dre.body.massKg - 75) < 1.5, `Dre ${dre.body.massKg.toFixed(1)} kg`);
  assert.equal(fistsOf(kenji.body), WORLD.fists.bare);
  assert.deepEqual(world.props.map((prop) => [prop.kind, prop.owner, prop.attached]), [['headset', 0, true]]);
  assert.deepEqual(world.arena, SCENARIOS.subway.arena);
});

test('the first clean shot to the head knocks the headset off: it flies, lands and lies on the platform', () => {
  const world = scenarioWorld('subway', 3);
  const [kenji, dre] = world.fighters;
  placeFighter(kenji, 0.3, 0);
  placeFighter(dre, -0.3, 0);
  advance(world, 0.5);
  let thrown = 0;
  while (world.props[0].attached && thrown < 40) {
    if (!dre.punch) {
      throwPunch(world, dre, thrown % 2 ? 'hook' : 'cross', 'head');
      thrown += 1;
    }
    advance(world, 1 / 60, () => { kenji.cooldown = 99; });
  }
  const off = world.events.find((event) => event.kind === 'accessory');
  assert.ok(off, 'knocked off');
  const hit = world.events.find((event) => event.kind === 'landed' && event.target === 'head');
  assert.ok(hit && hit.time <= off.time + 1e-9, 'by a shot to the head');
  const prop = world.props[0];
  const launched = Math.hypot(...prop.v);
  assert.ok(launched > 1, `thrown at ${launched.toFixed(1)} m/s`);
  advance(world, 3);
  assert.ok(prop.resting, 'it comes to rest');
  assert.ok(Math.abs(prop.x[1] - WORLD.props.radius) < 1e-6, 'on the floor');
  assert.ok(Math.abs(prop.x[0]) <= world.arena.halfX + 0.31 && Math.abs(prop.x[2]) <= world.arena.halfZ + 0.31, 'on the platform');
});

test('bare fists hit harder at the peak and break hands sooner than gloves', () => {
  // Same impulse, shorter contact: the peak force rises by the ratio of contact times.
  const peakRatio = WORLD.fists.gloved.contactSeconds / WORLD.fists.bare.contactSeconds;
  assert.ok(peakRatio > 1.2 && peakRatio < 1.5, `bare peak ${peakRatio.toFixed(2)}× gloved`);
  assert.ok(WORLD.fists.bare.handFracture < WORLD.fists.gloved.handFracture);
});

test('a subway fight runs to an end on the same physics, inside the platform', () => {
  const world = scenarioWorld('subway', 5);
  let elapsed = 0;
  while (elapsed < 120 && !boutWinner(world)) {
    advance(world, 0.5, (current, dt) => thinkAll(current, dt));
    elapsed += 0.5;
    for (const fighter of world.fighters) {
      const pelvis = point(fighter.x, P.pelvis);
      assert.ok(Math.abs(pelvis[2]) <= world.arena.halfZ + 0.01, `stays on the platform (z ${pelvis[2].toFixed(2)})`);
    }
  }
  assert.ok(world.fighters.every((fighter) => fighter.stats.thrown > 0));
});
