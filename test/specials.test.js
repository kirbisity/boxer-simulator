import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { OUTFITS } from '../src/outfits.js';
import { advance, createWorld, dropWeapon } from '../src/physics.js';
import { bulletProof, RIFLE } from '../src/weapons.js';

test('a fixed build is its given mass, fed or not: the robots and the gorilla', () => {
  assert.equal(Math.round(buildBody(PRESETS.humanoid).massKg), 70);
  assert.equal(Math.round(buildBody(PRESETS.combatBot).massKg), 170);
  assert.equal(Math.round(buildBody({ ...PRESETS.humanoid, calories: 1200 }).massKg), 70, 'no diet moves it');
  const gorilla = buildBody(PRESETS.gorilla);
  assert.equal(Math.round(gorilla.massKg), 200);
  assert.ok(gorilla.reach > buildBody(PRESETS.heavy).reach, 'an ape reaches further than a heavyweight');
  assert.ok(gorilla.strikeForce[7] > 2.5 * buildBody(PRESETS.heavy).strikeForce[7], 'and hits far harder');
  const man = buildBody(PRESETS.street).strikeForce[7];
  assert.ok(gorilla.strikeForce[7] > 4.5 * man && gorilla.strikeForce[7] < 6.5 * man, 'about five times an ordinary man in the arms');
});

test('the robots are rigid: no flesh to give anywhere', () => {
  for (const key of ['humanoid', 'combatBot']) {
    for (const segment of Object.values(buildBody(PRESETS[key]).segments)) assert.equal(segment.fleshFirmness, 1);
  }
});

test('the combat bot fires both forearm guns at once, never disarmed, never reloaded; the AR-15 seldom gets through its plate', () => {
  const world = createWorld([PRESETS.combatBot, PRESETS.combatBot], { seed: 3 });
  const bot = world.fighters[0];
  dropWeapon(world, bot, 'disarmed', [0, 1, 2]);
  assert.equal(bot.weapon.held, true, 'a forearm weapon is not knocked away');
  for (let second = 0; second < 20 && world.fighters[1].state !== 'out'; second += 0.25) advance(world, 0.25, (current, dt) => thinkAll(current, dt));
  const fired = new Set(world.events.filter((event) => event.kind === 'shot' && event.attacker === bot.id).map((event) => event.weapon));
  assert.deepEqual([...fired].sort(), ['armRifle', 'armShotgun'], 'the rifle arm and the shotgun arm both fire');
  assert.equal(bot.weapon.charges === undefined || bot.weapon.charges === Infinity, true, 'never reloaded');
  const plate = OUTFITS.combatBot;
  assert.ok(plate.protection.bullet.torso * bulletProof(plate.bulletRating, RIFLE.energy) >= 0.95);
});
