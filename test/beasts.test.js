// PROOF OF CONCEPT (beasts, round 1): the monkeys and the robot dogs of src/beasts.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BEAST_PRESETS } from '../src/beasts.js';
import { buildBody, P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, perform } from '../src/physics.js';
import { bringDown, placeMounted } from '../src/physics/mounted.js';

const close = { formation: { red: { front: 0.3 }, blue: { front: 0.3 } } };

test('the primates are the size and weight given, a chimpanzee about twice a man in the arms and a macaque far weaker', () => {
  const man = buildBody(PRESETS.street).strikeForce[P.rHand];
  const [macaque, baboon, chimp] = ['macaque', 'baboon', 'chimp'].map((key) => buildBody(BEAST_PRESETS[key]));
  assert.deepEqual([macaque, baboon, chimp].map((body) => Math.round(body.massKg)), [9, 30, 55]);
  assert.ok(macaque.heightM < 0.65 && chimp.heightM === 1.2);
  assert.ok(chimp.strikeForce[P.rHand] > 1.8 * man && chimp.strikeForce[P.rHand] < 2.6 * man, 'a chimpanzee ~2x a man');
  assert.ok(macaque.strikeForce[P.rHand] < man, 'a macaque less than a man');
  // A small brain takes a harder jolt (Holbourn, Ommaya): the smaller, the more.
  assert.ok(macaque.chin > baboon.chin && baboon.chin > chimp.chin);
});

test('a monkey too small to reach his neck takes hold of his leg and bites it: torn flesh, no bone broken', () => {
  const world = createWorld([BEAST_PRESETS.macaque, PRESETS.street], { seed: 4, ...close });
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
  const world = createWorld([BEAST_PRESETS.dogSpot, PRESETS.street], { seed: 2, arena: { halfX: 15, halfZ: 15 } });
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
  const world = createWorld([BEAST_PRESETS.dogVision60, PRESETS.street], { seed: 700, arena: { halfX: 15, halfZ: 15 } });
  const [core] = world.fighters;
  assert.equal(core.weapon?.kind, 'turretRifle');
  for (let second = 0; second < 8 && world.fighters[1].state !== 'out'; second += 0.5) advance(world, 0.5, (current, dt) => thinkAll(current, dt));
  assert.ok(world.events.some((event) => event.kind === 'shot' && event.attacker === core.id), 'it fires');
});
