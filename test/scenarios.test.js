import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, fistsOf, placeFighter, point, throwPunch, WORLD } from '../src/physics.js';
import { battleOf, SCENARIOS, scenarioWorld, SPREAD } from '../src/scenarios.js';

test('the subway fighters are who the scenario says: height, weight, bare fists, the headset on', () => {
  const world = scenarioWorld('subway');
  const [simon, dre] = world.fighters;
  assert.equal(simon.body.inputs.heightCm, 183);
  assert.ok(Math.abs(simon.body.massKg - 72) < 1.5, `Simon ${simon.body.massKg.toFixed(1)} kg`);
  assert.ok(Math.abs(dre.body.massKg - 75) < 1.5, `Dre ${dre.body.massKg.toFixed(1)} kg`);
  assert.equal(fistsOf(simon.body), WORLD.fists.bare);
  assert.deepEqual(world.props.map((prop) => [prop.kind, prop.owner, prop.attached]), [['headset', 0, true]]);
  assert.deepEqual(world.arena, SCENARIOS.subway.arena);
});

test('the first clean shot to the head knocks the headset off: it flies, lands and lies on the platform', () => {
  // (Seed 1: since the skill tiers Dre is a civilian, 0.1, his cross wanders more, and at seed 3 it knocked Simon down and
  // sent the headset over the edge strip onto the tracks; past the edge is a fair place for it, not the one looked for here.)
  const world = scenarioWorld('subway', 1);
  const [simon, dre] = world.fighters;
  placeFighter(simon, 0.3, 0);
  placeFighter(dre, -0.3, 0);
  advance(world, 0.5);
  let thrown = 0;
  while (world.props[0].attached && thrown < 40) {
    if (!dre.punch) {
      throwPunch(world, dre, thrown % 2 ? 'hook' : 'cross', 'head');
      thrown += 1;
    }
    advance(world, 1 / 60, () => { simon.cooldown = 99; });
  }
  const off = world.events.find((event) => event.kind === 'accessory');
  assert.ok(off, 'knocked off');
  const hit = world.events.find((event) => event.kind === 'landed' && event.target === 'head');
  assert.ok(hit && hit.time <= off.time + 1e-9, 'by a shot to the head');
  const prop = world.props[0];
  const launched = Math.hypot(...prop.v);
  assert.ok(launched > 1, `thrown at ${launched.toFixed(1)} m/s`);
  advance(world, 3);
  assert.ok(prop.resting, 'it comes to rest');
  assert.ok(Math.abs(prop.x[1] - WORLD.props.radius) < 1e-6, 'on the floor');
  assert.ok(Math.abs(prop.x[0]) <= world.arena.halfX + 0.31 && Math.abs(prop.x[2]) <= world.arena.halfZ + 0.31, 'on the platform');
});

test('bare fists hit harder at the peak and break hands sooner than gloves', () => {
  // Same impulse, shorter contact: the peak force rises by the ratio of contact times.
  const peakRatio = WORLD.fists.gloved.contactSeconds / WORLD.fists.bare.contactSeconds;
  assert.ok(peakRatio > 1.2 && peakRatio < 1.5, `bare peak ${peakRatio.toFixed(2)}× gloved`);
  assert.ok(WORLD.fists.bare.handFracture < WORLD.fists.gloved.handFracture);
});

test('a subway fight runs to an end on the same physics, inside the platform', () => {
  const world = scenarioWorld('subway', 5);
  let elapsed = 0;
  while (elapsed < 120 && !boutWinner(world)) {
    advance(world, 0.5, (current, dt) => thinkAll(current, dt));
    elapsed += 0.5;
    for (const fighter of world.fighters) {
      const pelvis = point(fighter.x, P.pelvis);
      assert.ok(Math.abs(pelvis[2]) <= world.arena.halfZ + 0.01, `stays on the platform (z ${pelvis[2].toFixed(2)})`);
    }
  }
  assert.ok(world.fighters.every((fighter) => fighter.stats.thrown > 0));
});

test('the battles start further apart than the levels\' own lines: the gap half as wide again, the floor longer by as much, inside the place', () => {
  // The gap before: the level's own fronts, with its wings' (the foot line the battle is fought on).
  const ownGap = (key) => {
    const level = SCENARIOS[key];
    const front = (corner) => level.wings?.formation?.[corner]?.front ?? level.formation[corner].front;
    return front('red') + front('blue');
  };
  // (An ambush, Cajamarca's, is laid where it was laid: not drawn apart. Its own test is in test/cajamarca.test.js.)
  for (const key of Object.keys(SCENARIOS).filter((name) => SCENARIOS[name].cast && !SCENARIOS[name].formation.red.ambush)) {
    const played = battleOf(key);
    const gap = played.formation.red.front + played.formation.blue.front;
    const factor = SCENARIOS[key].spread ?? SPREAD.factor;
    assert.ok(Math.abs(gap - Math.max(ownGap(key) * factor, SPREAD.least)) < 1e-9, `${key}: ${ownGap(key)} m to ${gap} m`);
    assert.ok(gap >= SPREAD.least, key);
    // The floor is longer, never past the place's fixed scenery; no narrower.
    const own = SCENARIOS[key].wings?.arena ?? SCENARIOS[key].arena;
    assert.ok(played.arena.halfX >= own.halfX, key);
    assert.ok(played.arena.halfX <= (SPREAD.room[played.scene]?.halfX ?? Infinity), key);
    assert.equal(played.arena.halfZ, own.halfZ, key);
    // Every man starts on the floor, both armies on their own halves.
    const world = scenarioWorld(key, 2);
    for (const fighter of world.fighters) {
      const [x, z] = [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
      const who = `${key}: ${fighter.body.inputs.name}`;
      assert.ok(Math.abs(x) < played.arena.halfX && Math.abs(z) < played.arena.halfZ, `${who} on the floor`);
      assert.ok((fighter.corner === 'red' ? -x : x) > played.formation[fighter.corner].front - 1, `${who} behind his line`);
    }
  }
  // The two wokou levels: 16 m between the lines become 24.
  assert.equal(battleOf('wokou').formation.red.front + battleOf('wokou').formation.blue.front, 24);
  // Qi Jiguang's squads keep their shape (each man's place in the layout), only further back.
  assert.deepEqual(battleOf('qiJiguang').formation.blue.layout, SCENARIOS.qiJiguang.formation.blue.layout);
});
