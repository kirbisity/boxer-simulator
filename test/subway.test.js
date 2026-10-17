import test from 'node:test';
import assert from 'node:assert/strict';
import { SUBWAY_CAR, SUBWAY_LEAKS, SUBWAY_RING_LIFE, subwayDrip, subwayLayout } from '../src/props/subway.js';
import { SCENARIOS } from '../src/scenarios.js';

const arena = SCENARIOS.subway.arena;

test('the subway car is an R160 at real scale: floor level with the platform, taller than a man by far', () => {
  const layout = subwayLayout(arena);
  assert.equal(layout.railTop + SUBWAY_CAR.floor, 0, 'the car floor is level with the platform');
  assert.ok(SUBWAY_CAR.width >= 2.9 && SUBWAY_CAR.width <= 3.1);
  assert.ok(SUBWAY_CAR.height >= 3.6 && SUBWAY_CAR.height <= 3.8);
  assert.ok(SUBWAY_CAR.length >= 18 && SUBWAY_CAR.length <= 23);
  // The car's side stands a hand's breadth off the platform edge, clear of the fighting floor.
  assert.ok(layout.trackZ - SUBWAY_CAR.width / 2 > layout.edgeZ);
  assert.ok(layout.edgeZ > arena.halfZ && layout.wallZ < -arena.halfZ);
  // Its roof clears the ceiling girders.
  assert.ok(layout.railTop + SUBWAY_CAR.height < layout.ceiling - 0.3);
});

test('a leak drips: the drop falls from the ceiling to the floor, rings on landing, then waits for the next', () => {
  const leak = { period: 2, phase: 0 };
  const fall = 3.75;
  assert.equal(subwayDrip(leak, 0, fall).dropY, fall);
  const falling = Math.sqrt((2 * fall) / 9.8);
  const mid = subwayDrip(leak, falling / 2, fall);
  assert.ok(mid.dropY > 0 && mid.dropY < fall && mid.speed > 0);
  const landed = subwayDrip(leak, falling + 0.1, fall);
  assert.equal(landed.dropY, null);
  assert.ok(Math.abs(landed.ringAge - 0.1) < 1e-9);
  assert.equal(subwayDrip(leak, falling + SUBWAY_RING_LIFE + 0.1, fall).ringAge, null);
  const a = subwayDrip(leak, 0.3, fall);
  const b = subwayDrip(leak, 2.3, fall);
  assert.ok(Math.abs(a.dropY - b.dropY) < 1e-9, 'it drips every period');
});

test('some leaks drip onto the fighting floor (so a fight goes through water), the rest onto the platform or the track', () => {
  const layout = subwayLayout(arena);
  const onFloor = layout.leaks.filter((leak) => leak.floor === 0 && Math.abs(leak.x) <= arena.halfX && Math.abs(leak.z) <= arena.halfZ);
  assert.ok(onFloor.length >= 2);
  for (const leak of layout.leaks) if (leak.floor === 0) assert.ok(leak.z - leak.rz > layout.wallZ && leak.z + leak.rz < layout.edgeZ);
  assert.equal(layout.leaks.length, SUBWAY_LEAKS.length);
});
