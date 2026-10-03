import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, fighterFile, P, PRESETS, SEGMENTS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, placeFighter, point, throwPunch, WORLD } from '../src/physics.js';
import { vec } from '../src/pose.js';

function shadowPeak(inputs, type) {
  const world = createWorld([inputs, PRESETS.light], { seed: 1 });
  // Far away, so nothing stops the glove.
  placeFighter(world.fighters[1], 2.6);
  advance(world, 1);
  const fighter = world.fighters[0];
  assert.ok(throwPunch(world, fighter, type), 'the punch was thrown');
  let peak = 0;
  for (let frame = 0; frame < 30; frame += 1) {
    advance(world, 1 / 60);
    peak = Math.max(peak, fighter.punch?.peakSpeed ?? 0);
  }
  return peak;
}

test('the body follows its inputs: training builds muscle and force, height builds reach, age takes both', () => {
  const base = { sex: 'male', heightCm: 180, frame: 'medium', age: 27, training: 0.5, bodyFat: 0.16 };
  const trained = buildBody({ ...base, training: 1 });
  const untrained = buildBody({ ...base, training: 0 });
  assert.ok(trained.muscleKg > untrained.muscleKg * 1.15);
  assert.ok(trained.motorForce[P.rHand] > untrained.motorForce[P.rHand]);
  assert.ok(buildBody({ ...base, heightCm: 195 }).reach > buildBody({ ...base, heightCm: 170 }).reach + 0.05);
  const old = buildBody({ ...base, age: 55 });
  const young = buildBody(base);
  assert.ok(old.muscleQuality < young.muscleQuality && old.chin < young.chin && old.boneDensity < young.boneDensity);
  const fat = buildBody({ ...base, bodyFat: 0.35 });
  assert.ok(fat.fatKg > young.fatKg * 2 && fat.segments.trunk.fleshFirmness < young.segments.trunk.fleshFirmness);
  assert.ok(buildBody({ ...base, frame: 'large' }).boneKg > buildBody({ ...base, frame: 'small' }).boneKg);
});

test('every body part has bone inside muscle inside skin, and the particles carry the whole mass', () => {
  for (const preset of Object.values(PRESETS)) {
    const body = buildBody(preset);
    for (const key of Object.keys(SEGMENTS)) {
      const segment = body.segments[key];
      assert.ok(segment.boneRadius < segment.muscleRadius && segment.muscleRadius <= segment.skinRadius, `${preset.name} ${key}`);
    }
    const total = body.masses.reduce((sum, mass) => sum + mass, 0);
    assert.ok(Math.abs(total - (body.massKg + 0.68)) < 0.01, 'body plus two gloves');
  }
});

test('a fighter stands: no drift, no collapse, bones keep their length', () => {
  const world = createWorld([PRESETS.heavy, PRESETS.amateur], { seed: 3 });
  advance(world, 5);
  for (const fighter of world.fighters) {
    assert.ok(fighter.x.every(Number.isFinite));
    const head = point(fighter.x, P.head);
    assert.ok(head[1] > fighter.body.heightM * 0.8, `head stays up (${head[1].toFixed(2)} m)`);
    for (const constraint of fighter.constraints.filter((entry) => entry.compliance === 0)) {
      const length = vec.length(vec.sub(point(fighter.x, constraint.i), point(fighter.x, constraint.j)));
      assert.ok(Math.abs(length - constraint.rest) / constraint.rest < 0.02);
    }
  }
});

test('hand speed comes from the body: a trained heavyweight is faster than an untrained man, in the measured range', () => {
  const heavy = shadowPeak(PRESETS.heavy, 'cross');
  const amateur = shadowPeak(PRESETS.amateur, 'cross');
  assert.ok(heavy > amateur * 1.15, `${heavy.toFixed(1)} vs ${amateur.toFixed(1)} m/s`);
  assert.ok(amateur > 5 && heavy < 13, 'within what boxers and novices reach');
});

test('the speed does not depend on the substep count', () => {
  const at = (substeps) => {
    const saved = WORLD.substeps;
    WORLD.substeps = substeps;
    const peak = shadowPeak(PRESETS.heavy, 'jab');
    WORLD.substeps = saved;
    return peak;
  };
  const coarse = at(6);
  const fine = at(16);
  assert.ok(Math.abs(coarse - fine) / fine < 0.12, `${coarse.toFixed(2)} vs ${fine.toFixed(2)}`);
});

test('a landed head shot snaps the head, and enough of them put a fighter down as a ragdoll', () => {
  const world = createWorld([PRESETS.heavy, PRESETS.amateur], { seed: 11 });
  let headShot = null;
  let knockdown = null;
  for (let second = 0; second < 240 && !knockdown; second += 1) {
    advance(world, 1, (current, dt) => thinkAll(current, dt));
    headShot ??= world.events.find((event) => event.kind === 'landed' && event.target === 'head');
    knockdown = world.events.find((event) => event.effects?.some((effect) => effect.startsWith('knockdown')));
  }
  assert.ok(headShot, 'a head shot landed');
  assert.ok(headShot.headDeltaV > 0 && headShot.impulse > 0 && headShot.force > 0);
  assert.ok(knockdown, 'the heavyweight dropped the amateur within four minutes');
  const down = world.fighters[knockdown.defender];
  advance(world, 1.5);
  assert.ok(point(down.x, P.head)[1] < 0.7, 'and the body fell');
});

test('the same seed replays the same bout', () => {
  const run = () => {
    const world = createWorld([PRESETS.light, PRESETS.veteran], { seed: 5 });
    advance(world, 20, (current, dt) => thinkAll(current, dt));
    return world.events.map((event) => `${event.time.toFixed(4)}:${event.kind}:${event.target}`).join('|');
  };
  assert.equal(run(), run());
});

test('a fighter file carries its inputs and rebuilds the same body', () => {
  const file = JSON.parse(JSON.stringify(fighterFile(PRESETS.contender)));
  assert.equal(file.schemaVersion, 1);
  assert.deepEqual(buildBody(file.inputs).masses, buildBody(PRESETS.contender).masses);
});
