// The small primates (macaque, chacma baboon, chimpanzee) and the robot dogs (Go2, Spot, Vision 60): real units, in
// the roster's Apes & Monkeys and Machines.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, perform } from '../src/physics.js';
import { bringDown, placeMounted } from '../src/physics/mounted.js';
import { FACTION_KEYS, FACTIONS, OUTFITS, PICKABLE_OUTFIT_KEYS } from '../src/outfits.js';
import { STYLE_KEYS } from '../src/moves.js';
import { WARRIORS } from '../src/roster.js';
import { randomBoxer, randomCharacter } from '../src/cast.js';
import { boltedOn, isMounted } from '../src/horses.js';
import { machineFxFor } from '../src/machinefx.js';
import { RATINGS } from '../src/ratings.js';

const close = { formation: { red: { front: 0.3 }, blue: { front: 0.3 } } };

test('the primates are the size and weight given, a chimpanzee about twice a man in the arms and a macaque far weaker', () => {
  const man = buildBody(PRESETS.street).strikeForce[P.rHand];
  const [macaque, baboon, chimp] = ['macaque', 'baboon', 'chimp'].map((key) => buildBody(PRESETS[key]));
  assert.deepEqual([macaque, baboon, chimp].map((body) => Math.round(body.massKg)), [9, 30, 55]);
  assert.ok(macaque.heightM < 0.65 && chimp.heightM === 1.2);
  assert.ok(chimp.strikeForce[P.rHand] > 1.8 * man && chimp.strikeForce[P.rHand] < 2.6 * man, 'a chimpanzee ~2x a man');
  assert.ok(macaque.strikeForce[P.rHand] < man, 'a macaque less than a man');
  // A small brain takes a harder jolt (Holbourn, Ommaya): the smaller, the more.
  assert.ok(macaque.chin > baboon.chin && baboon.chin > chimp.chin);
});

test('a monkey too small to reach his neck takes hold of his leg and bites it: torn flesh, no bone broken', () => {
  const world = createWorld([PRESETS.macaque, PRESETS.street], { seed: 4, ...close });
  const [monkey, man] = world.fighters;
  // At his legs (a charge's end), it grabs.
  for (let index = 0; index < monkey.x.length; index += 3) monkey.x[index] += man.x[P.pelvis * 3] - monkey.x[P.pelvis * 3] - 0.25;
  monkey.prev.set(monkey.x);
  monkey.root[0] = monkey.x[P.pelvis * 3];
  assert.ok(perform(world, monkey, 'clinch'), 'takes hold');
  advance(world, 3, () => {});
  const bites = world.events.filter((event) => event.kind === 'bite');
  assert.ok(bites.length >= 2, `bites (${bites.length})`);
  assert.ok(bites.every((bite) => !/neck|arm/.test(bite.effects[0])), 'below his trunk: his leg or hand');
  assert.ok(!man.broken.size, 'no bone broken');
});

test('a robot dog is ridden by what it carries: bolted on, never thrown, out when the robot goes down', () => {
  const world = createWorld([PRESETS.dogSpot, PRESETS.street], { seed: 2, arena: { halfX: 15, halfZ: 15 } });
  const [core] = world.fighters;
  const robot = core.mount;
  assert.equal(robot.breed, 'spot');
  assert.ok(robot.spec.robot && robot.shape.legs.every((leg) => leg.bend === -1), 'its knees bend back');
  // Trotting, it steps faster than a horse would at that speed, and its body is held level.
  placeMounted(core, 0, 0, 0);
  robot.goal = { heading: 0, speed: 1.6 };
  robot.goalAt = Infinity;
  advance(world, 2, () => {});
  assert.ok(robot.speed > 1.4, `trots (${robot.speed.toFixed(2)} m/s)`);
  assert.equal(robot.bob, 0);
  // A hard knock does not throw it off.
  core.knock = [20, 0, 0];
  advance(world, 0.2, () => {});
  assert.equal(core.mount, robot, 'still bolted on');
  bringDown(world, robot, 'killed by the blows');
  advance(world, 0.2, () => {});
  assert.equal(core.state, 'out');
  assert.ok(world.events.some((event) => event.kind === 'disabled'));
});

test('the Vision 60 keeps off and shoots; its turret carries the 6.5 Creedmoor', () => {
  const world = createWorld([PRESETS.dogVision60, PRESETS.street], { seed: 700, arena: { halfX: 15, halfZ: 15 } });
  const [core] = world.fighters;
  assert.equal(core.weapon?.kind, 'turretRifle');
  for (let second = 0; second < 8 && world.fighters[1].state !== 'out'; second += 0.5) advance(world, 0.5, (current, dt) => thinkAll(current, dt));
  assert.ok(world.events.some((event) => event.kind === 'shot' && event.attacker === core.id), 'it fires');
});

const PRIMATES = ['macaque', 'baboon', 'chimp'];
const DOGS = ['dogGo2', 'dogSpot', 'dogVision60'];

test('the beasts\' faction is split in two: the apes and monkeys, and the machines (the exoskeleton soldier with them)', () => {
  assert.ok(!FACTIONS.specials && FACTION_KEYS.includes('primates') && FACTION_KEYS.includes('machines'));
  const of = (faction) => WARRIORS.filter((warrior) => warrior.faction === faction).map((warrior) => warrior.key).sort();
  assert.deepEqual(of('primates'), ['baboon', 'chimp', 'gorilla', 'macaque']);
  assert.deepEqual(of('machines'), ['combatBot', 'dogGo2', 'dogSpot', 'dogVision60', 'exoArmoured', 'humanoid', 'miniHumanoid']);
  for (const faction of ['primates', 'machines']) assert.equal(WARRIORS.filter((warrior) => warrior.faction === faction && warrior.flagship).length, 1, `${faction}: one flagship`);
  for (const key of [...PRIMATES, ...DOGS]) assert.ok(RATINGS.characters[key]?.score > 0, `${key} rated`);
});

test('the six are real: presets in the builder, the primates\' styles pickable, the dogs chosen as characters (not worn), none in a prize fight', () => {
  for (const key of PRIMATES) {
    assert.ok(STYLE_KEYS.includes(PRESETS[key].style), `${key}'s style offered`);
    assert.ok(!PRESETS[key].undealt);
  }
  assert.ok(PICKABLE_OUTFIT_KEYS.includes('monkeyFur'));
  for (const key of DOGS) {
    assert.ok(PRESETS[key].undealt, 'a mount is not dealt at random');
    assert.ok(!PICKABLE_OUTFIT_KEYS.includes(PRESETS[key].outfit.kind), 'a chassis is not an outfit to put a man in');
    assert.ok(OUTFITS[PRESETS[key].outfit.kind].machine);
  }
  for (const key of [...PRIMATES, ...DOGS]) assert.ok(PRESETS[key].noPrize, `${key}: no weight class`);
  let seed = 11;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let round = 0; round < 60; round += 1) {
    assert.ok(!['monkeyFur', 'go2Dog', 'spotDog', 'vision60Dog'].includes(randomBoxer(random).outfit?.kind), 'no beast in trunks');
    assert.ok(!boltedOn(randomCharacter(random)), 'no robot dog dealt');
  }
});

test('a robot dog always rides, whatever its `mounted` says; it is a machine (sparks, the short); the primates are not', () => {
  for (const key of DOGS) {
    const inputs = { ...PRESETS[key], mounted: false };
    assert.ok(boltedOn(inputs) && isMounted(inputs));
    const world = createWorld([{ inputs: structuredClone(inputs), corner: 'red' }, { inputs: structuredClone(PRESETS.street), corner: 'blue' }], { seed: 1 });
    const [core] = world.fighters;
    assert.ok(core.mount?.spec.robot, `${key} on its robot`);
    assert.equal(machineFxFor({ kind: 'disabled' }, core), 'death', 'the robot down shorts out');
  }
  const world = createWorld([{ inputs: structuredClone(PRESETS.chimp), corner: 'red' }, { inputs: structuredClone(PRESETS.street), corner: 'blue' }], { seed: 1 });
  assert.ok(!world.fighters[0].body.gear.machine && !world.fighters[0].mount);
});
