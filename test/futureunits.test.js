// The proofs of concept for two future units: the mini humanoid (Unitree's G1) and the powered exoskeleton (Sarcos's
// Guardian XO). Their numbers come from their bodies and kits, nothing else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS, buildBody } from '../src/body.js';
import { OUTFITS, PICKABLE_OUTFIT_KEYS } from '../src/outfits.js';
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

test('the exoskeleton is a soldier in a frame: his own body, the frame\'s mass and motors on top', () => {
  const man = buildBody({ ...PRESETS.exoOpen, outfit: { kind: 'casual', design: 1 } });
  const kits = { exoOpen: 100, exoArmoured: 135, exoEnclosed: 175 };
  for (const [key, frameKg] of Object.entries(kits)) {
    const exo = buildBody(PRESETS[key]);
    assert.equal(exo.heightM, 1.8);
    assert.ok(Math.abs(exo.bodyMassKg - man.bodyMassKg) < 1e-9, 'the man inside is unchanged');
    assert.ok(Math.abs(exo.bodyMassKg - 83) < 2, `operator ${exo.bodyMassKg.toFixed(1)} kg`);
    assert.ok(Math.abs(exo.gearKg - frameKg * exo.bodyMassKg / 83) < 1e-6, `${key}: frame ${exo.gearKg.toFixed(1)} kg`);
    assert.ok(!exo.gear.machine, 'a man inside: he fears and bleeds');
    // One set of motors in every cover: the same force, more mass to move the more armour is bolted on.
    assert.ok(Math.abs(exo.motorForce[P.lKnee] - 2.4 * man.motorForce[P.lKnee]) < 1e-6);
    assert.ok(Math.abs(exo.strikeForce[P.rHand] - 4 * man.strikeForce[P.rHand]) < 1e-6);
    assert.ok(exo.limbKg.rArm > 2 * man.limbKg.rArm, 'the frame\'s steel arm is behind his blows');
    assert.ok(exo.topSpeed[P.rHand] < man.topSpeed[P.rHand], 'rate-limited joints: slower limbs than the man alone');
  }
  const open = buildBody(PRESETS.exoOpen);
  const enclosed = buildBody(PRESETS.exoEnclosed);
  assert.ok(forcePerKg(enclosed, 'lKnee') < forcePerKg(open, 'lKnee'), 'armour costs agility, never adds force');
  assert.ok(enclosed.gear.protection.cut > open.gear.protection.cut);
  assert.equal(open.gear.protection.regions.head.cut, 0, 'the open frame leaves his head bare');
});

test('the proofs of concept stay out of the pickers and the random deal, and build into a world', () => {
  for (const kind of ['miniHumanoid', 'exoOpen', 'exoArmoured', 'exoEnclosed']) {
    assert.ok(OUTFITS[kind].levelOnly);
    assert.ok(!PICKABLE_OUTFIT_KEYS.includes(kind));
    assert.ok(PRESETS[kind].undealt);
  }
  const world = createWorld([{ inputs: structuredClone(PRESETS.miniHumanoid), corner: 'red' }, { inputs: structuredClone(PRESETS.exoEnclosed), corner: 'blue' }], { seed: 1 });
  assert.equal(world.fighters.length, 2);
});
