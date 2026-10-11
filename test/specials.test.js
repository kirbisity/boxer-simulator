import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, dropWeapon } from '../src/physics.js';

test('a fixed build is its given mass, fed or not: the robots and the gorilla', () => {
  assert.equal(Math.round(buildBody(PRESETS.humanoid).massKg), 70);
  assert.equal(Math.round(buildBody(PRESETS.combatBot).massKg), 170);
  assert.equal(Math.round(buildBody({ ...PRESETS.humanoid, calories: 1200 }).massKg), 70, 'no diet moves it');
  const gorilla = buildBody(PRESETS.gorilla);
  assert.equal(Math.round(gorilla.massKg), 170);
  assert.ok(gorilla.reach > buildBody(PRESETS.heavy).reach, 'an ape reaches further than a heavyweight');
  assert.ok(gorilla.strikeForce[7] > 2.5 * buildBody(PRESETS.heavy).strikeForce[7], 'and hits far harder');
});

test('the combat bot fights with its forearms: never disarmed, the arm to suit the range', () => {
  const world = createWorld([PRESETS.combatBot, PRESETS.knight], { seed: 3 });
  const bot = world.fighters[0];
  dropWeapon(world, bot, 'disarmed', [0, 1, 2]);
  assert.equal(bot.weapon.held, true, 'a forearm weapon is not knocked away');
  const used = new Set();
  for (let second = 0; second < 20 && world.fighters[1].state !== 'out'; second += 0.25) {
    advance(world, 0.25, (current, dt) => thinkAll(current, dt));
    used.add(bot.weapon.kind);
  }
  assert.ok(used.has('armShotgun'), 'the shotgun arm, closer in');
  assert.equal(bot.weapon.charges === undefined || bot.weapon.charges === Infinity, true, 'never reloaded');
});
