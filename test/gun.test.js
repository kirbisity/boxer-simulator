import test from 'node:test';
import assert from 'node:assert/strict';
import { FRAMES, normaliseInputs, PRESETS } from '../src/body.js';
import { caloriesForWeight } from '../src/physiology.js';
import { AI, thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld, placeFighter, throwPunch, WORLD } from '../src/physics.js';
import { GUN } from '../src/weapons.js';
import { scenarioWorld } from '../src/scenarios.js';

const man = (kg, outfit = null) => {
  const inputs = normaliseInputs({ ...PRESETS.contender, sex: 'male', heightCm: 178, frame: 'medium', exercise: 0.4, outfit: outfit ? { kind: outfit, design: 0 } : null, accessories: [] });
  inputs.calories = caloriesForWeight(inputs, kg, FRAMES.medium.lean);
  return inputs;
};

/** Shots, aimed dead on (no aim error), until a standing man is dead; the regions hit. */
function shotsToKill(zone, target, limit = 12) {
  const spread = GUN.spread;
  const moving = GUN.movingSpread;
  GUN.spread = 0;
  GUN.movingSpread = 0;
  try {
    const world = createWorld([{ ...PRESETS.handgun }, target], { seed: 1 });
    const [gunner, victim] = world.fighters;
    placeFighter(gunner, -2, 0);
    placeFighter(victim, 2, 0);
    victim.handsDown = true;
    advance(world, 0.5);
    for (let shot = 1; shot <= limit; shot += 1) {
      throwPunch(world, gunner, 'shoot', zone);
      advance(world, 0.7);
      victim.stagger = 0;
      if (victim.state === 'out') return { shots: shot, world };
      if (victim.state !== 'up') advance(world, 6);
    }
    return { shots: Infinity, world };
  } finally {
    GUN.spread = spread;
    GUN.movingSpread = moving;
  }
}

test('an 80 kg man: one round to the head kills, two to the body, five to the legs', () => {
  assert.equal(shotsToKill('head', man(80)).shots, 1);
  assert.equal(shotsToKill('body', man(80)).shots, 2);
  assert.equal(shotsToKill('legs', man(80)).shots, 5);
});

test('a heavier man takes more rounds, a lighter one fewer', () => {
  assert.ok(shotsToKill('legs', man(110)).shots > 5);
  assert.ok(shotsToKill('legs', man(60)).shots < 5);
});

test('armour takes its share: a SWAT helmet survives a head shot, its vest most body shots', () => {
  assert.ok(shotsToKill('head', man(80, 'swat')).shots > 1);
  assert.ok(shotsToKill('body', man(80, 'swat')).shots > 12);
  assert.ok(shotsToKill('body', man(80, 'knight')).shots > 2);
  assert.ok(shotsToKill('head', man(80, 'samurai')).shots > 1);
});

test('a round to the body staggers anyone at once', () => {
  const spread = GUN.spread;
  GUN.spread = 0;
  const world = createWorld([{ ...PRESETS.handgun }, man(110)], { seed: 1 });
  const [gunner, victim] = world.fighters;
  placeFighter(gunner, -2, 0);
  placeFighter(victim, 2, 0);
  victim.handsDown = true;
  advance(world, 0.5);
  throwPunch(world, gunner, 'shoot', 'body');
  advance(world, 0.5);
  GUN.spread = spread;
  assert.equal(victim.state, 'up');
  assert.ok(victim.stagger > 0, 'reeling');
});

test('the gun is easily knocked away, and then he fights mixed', () => {
  const world = createWorld([{ ...PRESETS.handgun }, { ...PRESETS.contender }], { seed: 2 });
  const gunner = world.fighters[0];
  assert.equal(gunner.weapon.kind, 'pistol');
  assert.ok(gunner.weapon.spec.grip < 0.2, 'a light grip');
  WORLD.weapons.dropOnFall = 1;
  gunner.knock = [9, 0, 0];
  advance(world, 1 / 60);
  WORLD.weapons.dropOnFall = 0.35;
  assert.equal(gunner.weapon, null);
  // Up again (and not going for the gun), he fights mixed.
  const pickup = AI.pickup.enabled;
  AI.pickup.enabled = false;
  advance(world, 9);
  AI.pickup.enabled = pickup;
  assert.equal(gunner.mixed, 'mix');
});

test('Frye v Takayama: a standing brawl in a mutual clinch, nobody held down', () => {
  const world = scenarioWorld('pride', 3);
  assert.deepEqual(world.fighters.map((fighter) => fighter.style), ['clinchBrawl', 'clinchBrawl']);
  let mutual = 0;
  for (let elapsed = 0; elapsed < 60 && !boutWinner(world); elapsed += 0.1) {
    advance(world, 0.1, (current, dt) => thinkAll(current, dt));
    if (world.fighters.every((fighter) => fighter.clinch)) mutual += 0.1;
    assert.ok(world.fighters.every((fighter) => !fighter.pin), 'no holds');
  }
  assert.ok(mutual > 1, `mutual clinch ${mutual.toFixed(1)} s`);
});
