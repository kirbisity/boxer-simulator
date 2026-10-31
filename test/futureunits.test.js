// Two machine-age units: the mini humanoid (Unitree's G1, bare) and the powered exoskeleton (Sarcos's Guardian XO,
// armoured). Their numbers come from their bodies and kits, nothing else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS, buildBody } from '../src/body.js';
import { OUTFITS, PICKABLE_OUTFIT_KEYS } from '../src/outfits.js';
import { randomBoxer } from '../src/cast.js';
import { machineFxFor } from '../src/machinefx.js';
import { WARRIORS } from '../src/roster.js';
import { createWorld } from '../src/physics.js';

const forcePerKg = (body, joint) => body.motorForce[P[joint]] / body.massKg;

test('the mini humanoid is the G1: 1.32 m and 35 kg, rigid, quicker per kilogram than the H-1 and softer-hitting', () => {
  const g1 = buildBody(PRESETS.miniHumanoid);
  const h1 = buildBody(PRESETS.humanoid);
  assert.equal(g1.heightM, 1.32);
  assert.equal(g1.massKg, 35);
  assert.equal(g1.fatKg, 0);
  assert.ok(g1.inputs.build.rigid);
  assert.ok(g1.gear.machine);
  // Its knee pushes ~0.65 of a man's (the G1's ~90-120 N·m on a 0.73-length leg against a man's ~250): ~150 N against the H-1's ~230.
  const knee = g1.motorForce[P.lKnee] / h1.motorForce[P.lKnee];
  assert.ok(knee > 0.55 && knee < 0.75, `knee ${knee.toFixed(2)} of the H-1's`);
  assert.ok(forcePerKg(g1, 'lKnee') > 1.2 * forcePerKg(h1, 'lKnee'), 'more force per kilogram: quick to start and to rise');
  assert.ok(g1.strikeForce[P.lHand] < 0.6 * h1.strikeForce[P.lHand], 'small arm motors: a soft punch');
  assert.ok(g1.limbKg.lArm < 0.5 * h1.limbKg.lArm, 'little mass behind the arm');
});

test('the exoskeleton is a soldier in the armoured frame: his own body, the frame\'s mass and motors on top', () => {
  const man = buildBody({ ...PRESETS.exoArmoured, outfit: { kind: 'casual', design: 1 } });
  const exo = buildBody(PRESETS.exoArmoured);
  assert.equal(exo.heightM, 1.8);
  assert.ok(Math.abs(exo.bodyMassKg - man.bodyMassKg) < 1e-9, 'the man inside is unchanged');
  assert.ok(Math.abs(exo.bodyMassKg - 83) < 2, `operator ${exo.bodyMassKg.toFixed(1)} kg`);
  assert.ok(Math.abs(exo.gearKg - 135 * exo.bodyMassKg / 83) < 1e-6, `frame ${exo.gearKg.toFixed(1)} kg`);
  assert.ok(!exo.gear.machine, 'a man inside: he fears and bleeds');
  assert.ok(Math.abs(exo.motorForce[P.lKnee] - 2.4 * man.motorForce[P.lKnee]) < 1e-6);
  assert.ok(Math.abs(exo.strikeForce[P.rHand] - 4 * man.strikeForce[P.rHand]) < 1e-6);
  assert.ok(exo.limbKg.rArm > 2 * man.limbKg.rArm, 'the frame\'s steel arm is behind his blows');
  assert.ok(exo.topSpeed[P.rHand] < man.topSpeed[P.rHand], 'rate-limited joints: slower limbs than the man alone');
  assert.ok(exo.gear.protection.cut > man.gear.protection.cut);
});

test('the chosen two are real units: in the pickers, the roster\'s Beasts & Machines, dealt; only the G1 kept out of the prize fight', () => {
  for (const kind of ['miniHumanoid', 'exoArmoured']) {
    assert.ok(!OUTFITS[kind].levelOnly);
    assert.ok(PICKABLE_OUTFIT_KEYS.includes(kind));
    assert.ok(!PRESETS[kind].undealt);
    const entry = WARRIORS.find((warrior) => warrior.key === kind);
    assert.ok(entry, `${kind} in the roster`);
    assert.equal(entry.faction, 'specials');
    assert.equal(OUTFITS[kind].designs.length, 1, 'one look: the one chosen');
  }
  for (const gone of ['exoOpen', 'exoEnclosed']) assert.ok(!OUTFITS[gone] && !PRESETS[gone]);
  assert.ok(PRESETS.miniHumanoid.noPrize);
  let seed = 3;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let round = 0; round < 40; round += 1) assert.ok(randomBoxer(random).heightCm >= 150, 'no G1 in trunks');
  const world = createWorld([{ inputs: structuredClone(PRESETS.miniHumanoid), corner: 'red' }, { inputs: structuredClone(PRESETS.exoArmoured), corner: 'blue' }], { seed: 1 });
  assert.equal(world.fighters.length, 2);
});

test('the G1 is a robot to the electrics (sparks, the short, no blood); the exo\'s man is not, but his frame\'s cut limb shorts out', () => {
  const world = createWorld([{ inputs: structuredClone(PRESETS.miniHumanoid), corner: 'red' }, { inputs: structuredClone(PRESETS.exoArmoured), corner: 'blue' }], { seed: 1 });
  const [g1, exo] = world.fighters;
  assert.equal(machineFxFor({ kind: 'killed' }, g1), 'death');
  assert.equal(machineFxFor({ kind: 'severed' }, g1), 'stump');
  assert.equal(machineFxFor({ kind: 'killed' }, exo), null, 'a man dies, he does not short out');
  assert.equal(machineFxFor({ kind: 'severed' }, exo), 'stump', 'the frame\'s cables cut with his limb');
});
