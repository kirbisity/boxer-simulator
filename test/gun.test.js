import test from 'node:test';
import assert from 'node:assert/strict';
import { FRAMES, normaliseInputs, PRESETS } from '../src/body.js';
import { caloriesForWeight } from '../src/physiology.js';
import { AI, thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld, placeFighter, throwPunch, WORLD } from '../src/physics.js';
import { ARROW, GUN } from '../src/weapons.js';
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

test('engaging, he holds the gun up in both hands; closed on, he drops it and fights; he runs for room', () => {
  const world = createWorld([{ ...PRESETS.handgun }, { ...PRESETS.contender }], { seed: 3, arena: { halfX: 6.5, halfZ: 4.4 } });
  const [gunner, other] = world.fighters;
  placeFighter(gunner, -2.5, 0);
  placeFighter(other, 2.5, 0);
  advance(world, 0.3, (current, dt) => thinkAll(current, dt, new Set([1])));
  assert.equal(gunner.aimAt, other.id, 'gun up on him');
  assert.ok(gunner.intent.lHand, 'the support hand on the gun');
  // Rushing in from too near for a shot: he runs for room at first, and drops the gun once the man is on him.
  placeFighter(other, gunner.root[0] + 2, gunner.root[1]);
  gunner.punch = null;
  gunner.cooldown = 1;
  let ran = false;
  for (let step = 0; step < 30 && gunner.weapon?.held; step += 1) {
    other.rootVelocity = [-3, 0];
    advance(world, 1 / 30, (current, dt) => thinkAll(current, dt, new Set([1])));
    ran ||= gunner.running;
    const way = Math.sign(gunner.root[0] - other.root[0]) || -1;
    placeFighter(other, other.root[0] + way * 0.12, gunner.root[1]);
  }
  assert.ok(ran, 'he ran');
  assert.equal(gunner.weapon, null, 'closed on, he let the gun go');
  assert.equal(gunner.mixed, 'mix');
});

test('recoil: the same kick rocks a light shooter more than a heavy one', () => {
  const kick = (inputs) => {
    const world = createWorld([{ ...PRESETS.handgun, ...inputs }, man(80)], { seed: 1 });
    const [gunner, target] = world.fighters;
    placeFighter(gunner, -2, 0);
    placeFighter(target, 2, 0);
    advance(world, 0.6);
    throwPunch(world, gunner, 'shoot', 'body');
    // The jump in the gun hand's speed over the frame the shot goes off.
    for (let frame = 0; frame < 60; frame += 1) {
      const before = [gunner.v[21], gunner.v[22], gunner.v[23]];
      advance(world, 1 / 120, null, 1 / 120);
      if (world.events.some((event) => event.kind === 'shot')) return Math.hypot(gunner.v[21] - before[0], gunner.v[22] - before[1], gunner.v[23] - before[2]);
    }
    return 0;
  };
  const light = kick({ sex: 'female', heightCm: 160, calories: 2000, exercise: 0.3 });
  const heavy = kick({ heightCm: 192, frame: 'large', calories: 5200, exercise: 0.7 });
  assert.ok(light > heavy * 1.15, `hand kick ${light.toFixed(2)} v ${heavy.toFixed(2)} m/s`);
});

test('sidearms: a disarmed samurai draws his wakizashi, a knight his dagger, once', async () => {
  const { dropWeapon } = await import('../src/physics.js');
  const world = createWorld([{ ...PRESETS.samurai }, { ...PRESETS.knight }], { seed: 1 });
  advance(world, 0.5);
  const [samurai, knight] = world.fighters;
  dropWeapon(world, samurai, 'disarmed');
  dropWeapon(world, knight, 'disarmed');
  assert.equal(samurai.weapon?.kind, 'wakizashi');
  assert.equal(knight.weapon?.kind, 'dagger');
  dropWeapon(world, samurai, 'disarmed');
  assert.equal(samurai.weapon, null, 'only one sidearm');
  assert.equal(samurai.mixed, 'mix');
});

test('arrows fly, wound an unarmoured man, and mostly glance off plate', () => {
  const shoot = (outfit) => {
    const spread = ARROW.spread;
    ARROW.spread = 0;
    const world = createWorld([{ ...PRESETS.bow, outfit: { kind: 'ashigaru', design: 0 } }, man(80, outfit)], { seed: 5 });
    const [archer, target] = world.fighters;
    placeFighter(archer, -3, 0);
    placeFighter(target, 3, 0);
    target.handsDown = true;
    advance(world, 0.5);
    for (let shot = 0; shot < 6; shot += 1) {
      throwPunch(world, archer, 'loose', 'body');
      advance(world, 1.4);
    }
    ARROW.spread = spread;
    const hits = world.events.filter((event) => event.kind === 'arrow');
    return { wounds: hits.filter((event) => !event.bounced).length, glances: hits.filter((event) => event.bounced).length, target };
  };
  const bare = shoot(null);
  assert.ok(bare.wounds >= 2, `${bare.wounds} wounds`);
  const plate = shoot('knight');
  assert.ok(plate.glances > plate.wounds, `plate: ${plate.glances} glanced, ${plate.wounds} through`);
});
