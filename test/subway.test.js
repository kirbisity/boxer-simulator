import test from 'node:test';
import assert from 'node:assert/strict';
import { SUBWAY_CAR, SUBWAY_LEAKS, SUBWAY_RING_LIFE, subwayDrip, subwayLayout } from '../src/props/subway.js';
import { SCENARIOS, scenarioWorld } from '../src/scenarios.js';
import { P } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, deliverImpulse, floorUnder, placeFighter, point } from '../src/physics.js';

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

// ---- the edge: no train in, the track bed below ------------------------------------------

/** Fighter 0 stood at z on the platform, the other well off, then shoved hard toward ±z; 4 s on. */
function shoved(z, direction) {
  const world = scenarioWorld('subway', 3);
  const [fighter, other] = world.fighters;
  placeFighter(other, -3.5, 0);
  placeFighter(fighter, 0, z);
  advance(world, 0.5);
  const shares = [[P.pelvis, 0.3], [P.neck, 0.3], [P.lShoulder, 0.2], [P.rShoulder, 0.2]];
  deliverImpulse({ fighter, shares, direction: [0, 0, direction], impulse: 260 });
  let lowest = Infinity;
  for (let frame = 0; frame < 240; frame += 1) {
    advance(world, 1 / 60);
    lowest = Math.min(lowest, point(fighter.x, P.pelvis)[1]);
  }
  return { world, fighter, lowest };
}

test('the platform edge is a drop: a man shoved over it falls onto the track bed and is out of the bout', () => {
  const drop = arena.drop;
  const layout = subwayLayout(arena);
  assert.equal(drop.at, layout.edgeZ, 'the drop is at the platform edge');
  assert.ok(drop.floor < layout.railTop + 0.05 && drop.floor > layout.railTop - 0.25, 'the lower floor is the track bed');
  assert.ok(drop.to <= layout.farZ, 'the far wall stops him');
  assert.equal(floorUnder(arena, 0), 0);
  assert.equal(floorUnder(arena, drop.at + 0.5), drop.floor);
  const { world, fighter, lowest } = shoved(1.0, 1);
  assert.ok(point(fighter.x, P.pelvis)[2] > drop.at, 'he went over the edge');
  assert.ok(lowest < -0.8, `his hips fell below the platform (to ${lowest.toFixed(2)} m)`);
  assert.equal(fighter.state, 'out');
  assert.ok(world.events.some((event) => event.fighter === fighter.id && event.effects?.includes('fell onto the tracks')));
  assert.equal(boutWinner(world), world.fighters[1].corner);
});

test('the wall side is still a wall: a man shoved into it meets it and stays on the platform', () => {
  const { fighter, lowest } = shoved(-1.0, -1);
  for (let index = 0; index < fighter.x.length / 3; index += 1) assert.ok(fighter.x[index * 3 + 2] >= -arena.halfZ - 1e-6, 'no part through the wall');
  assert.ok(lowest > 0, 'never below the platform');
});

test('left alone, fighters keep off the edge: a bout on the platform stays on it', () => {
  const world = scenarioWorld('subway', 5);
  for (let frame = 0; frame < 60 * 30 && !world.over; frame += 1) {
    thinkAll(world, 1 / 60);
    advance(world, 1 / 60);
  }
  for (const fighter of world.fighters) if (fighter.state !== 'out') assert.ok(point(fighter.x, P.pelvis)[1] > 0, 'still on the platform');
  assert.ok(!world.events.some((event) => event.effects?.includes('fell onto the tracks')), 'nobody walked off');
});
