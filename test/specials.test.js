import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { STYLES } from '../src/moves.js';
import { gearTraits, OUTFITS } from '../src/outfits.js';
import { advance, createWorld, dropWeapon, perform } from '../src/physics.js';
import { bulletProof, RIFLE } from '../src/weapons.js';

test('a fixed build is its given mass, fed or not: the robots and the gorilla', () => {
  assert.equal(Math.round(buildBody(PRESETS.humanoid).massKg), 70);
  assert.equal(Math.round(buildBody(PRESETS.combatBot).massKg), 170);
  assert.equal(Math.round(buildBody({ ...PRESETS.humanoid, calories: 1200 }).massKg), 70, 'no diet moves it');
  const gorilla = buildBody(PRESETS.gorilla);
  assert.equal(Math.round(gorilla.massKg), 230);
  assert.equal(gorilla.heightM, 1.8);
  assert.ok(gorilla.reach > buildBody(PRESETS.heavy).reach, 'an ape reaches further than a heavyweight');
  assert.ok(gorilla.strikeForce[7] > 2.5 * buildBody(PRESETS.heavy).strikeForce[7], 'and hits far harder');
  const man = buildBody(PRESETS.street).strikeForce[7];
  assert.ok(gorilla.strikeForce[7] > 5 * man && gorilla.strikeForce[7] < 7 * man, 'about six times an ordinary man in the arms');
  const bot = buildBody(PRESETS.combatBot).strikeForce[7];
  assert.ok(bot > 1.5 * buildBody(PRESETS.heavy).strikeForce[7], "the combat bot's actuators: past a heavyweight's arms");
});

test('the robots are rigid: no flesh to give anywhere', () => {
  for (const key of ['humanoid', 'combatBot']) {
    for (const segment of Object.values(buildBody(PRESETS[key]).segments)) assert.equal(segment.fleshFirmness, 1);
  }
});

test('the robots turn blows as plate does: edges skid off, curved shells glance; the bot proof against an edge', () => {
  const humanoid = gearTraits(PRESETS.humanoid);
  const bot = gearTraits(PRESETS.combatBot);
  for (const gear of [humanoid, bot]) {
    assert.ok(gear.deflects, 'an edge glances off');
    assert.ok(gear.breastplate > 0 && gear.helmet.curve > 0, 'a curved chest and head shell');
  }
  assert.ok(bot.cutProof && !humanoid.cutProof, "no gap for an edge in the bot's plate; the humanoid's joints are bare");
  assert.ok(humanoid.protection.blunt < bot.protection.blunt && humanoid.helmet.mass < bot.helmet.mass, 'thin aluminium under steel');
});

test('the gorilla fights as an ape: clubs, swipes, grabs, charges; no boxing', () => {
  const style = STYLES.gorilla;
  for (const move of ['clubR', 'swipeL', 'collarTie', 'clinch', 'rush']) assert.ok(style.attacks[move] > 0, move);
  for (const punch of ['jab', 'cross', 'hook', 'uppercut']) assert.equal(style.attacks[punch], undefined, punch);
});

test('the gorilla bites a man it holds: as hard as its jaw, less what his armour turns', () => {
  const bitten = (other) => {
    const world = createWorld([PRESETS.gorilla, other], { seed: 5, formation: { red: { front: 0.4 }, blue: { front: 0.4 } } });
    assert.ok(perform(world, world.fighters[0], 'collarTie'), 'grabs him by the neck');
    advance(world, 2.5, () => {});
    return world.events.filter((event) => event.kind === 'bite');
  };
  const bare = bitten(PRESETS.heavy);
  const plate = bitten(PRESETS.knight);
  assert.ok(bare.length > 0 && plate.length > 0, 'it bites');
  const joules = (bites) => bites.reduce((sum, bite) => sum + bite.cut + bite.pierce, 0) / bites.length;
  assert.ok(joules(bare) > 30, 'into a bare man');
  assert.ok(joules(plate) < joules(bare) / 5, 'little through plate');
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

test('against several men the combat bot aims each arm at its own man', () => {
  const world = createWorld([{ inputs: PRESETS.combatBot, corner: 'red' }, ...['rifle', 'shotgun', 'handgun'].map((key) => ({ inputs: PRESETS[key], corner: 'blue' }))], { seed: 1000, arena: { halfX: 10, halfZ: 10 } });
  for (let second = 0; second < 3; second += 0.25) advance(world, 0.25, (current, dt) => thinkAll(current, dt));
  const shots = world.events.filter((event) => event.kind === 'shot' && event.attacker === 0);
  const apart = shots.some((shell) => shell.weapon === 'armShotgun' && shots.some((round) => round.weapon === 'armRifle' && Math.abs(round.time - shell.time) < 0.5 && round.aimedAt !== shell.aimedAt));
  assert.ok(apart, 'the shotgun arm on one man while the rifle is on another');
});
