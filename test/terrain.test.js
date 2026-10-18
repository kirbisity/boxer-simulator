// Static scenery in the physics (src/physics/terrain.js): the queries, and a body walking, climbing and falling on it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { advance, createWorld, floorUnder, legShare, placeOnFloor } from '../src/physics.js';
import { WORLD } from '../src/physics/config.js';
import { awayFromEdges, ceilingAt, ceilingOf, createTerrain, floorAt, pushOut, rampOf, rayBlocked, slabOf, stairsOf, wallLine, wallOf, windingStairs, windingTread } from '../src/physics/terrain.js';
import { createStageWorld, updateStage } from '../src/levelmode/stage.js';
import { TESTYARD } from '../src/levelmode/stages/testyard.js';
import { footErrors, hipsAt, walk } from './walker.js';

const near = (actual, expected, tolerance = 1e-9, message = '') => assert.ok(Math.abs(actual - expected) <= tolerance, `${message} ${actual} is not ${expected}`);

// ---- The queries -------------------------------------------------------------------

test('floorAt: a slab is its top inside its footprint and nothing outside', () => {
  const terrain = createTerrain([slabOf([10, 5], [4, 2], 1.5)]);
  near(floorAt(terrain, 10, 5), 1.5);
  near(floorAt(terrain, 11.9, 5.9), 1.5);
  assert.equal(floorAt(terrain, 12.1, 5), -Infinity);
  assert.equal(floorAt(terrain, 10, 6.1), -Infinity);
});

test('floorAt: a slab turned by yaw is turned as a fighter is (yaw 0 along +x, positive toward -z)', () => {
  const terrain = createTerrain([slabOf([0, 0], [6, 1], 2, { yaw: Math.PI / 2 })]);
  // Turned a quarter: the long way runs along z now.
  near(floorAt(terrain, 0, 2.9), 2);
  assert.equal(floorAt(terrain, 2.9, 0), -Infinity);
  const diagonal = createTerrain([slabOf([0, 0], [6, 1], 2, { yaw: Math.PI / 4 })]);
  // +45 degrees: toward +x and -z.
  near(floorAt(diagonal, 2, -2), 2);
  assert.equal(floorAt(diagonal, 2, 2), -Infinity);
});

test('floorAt: a ramp rises evenly from its low end to its high', () => {
  const terrain = createTerrain([rampOf([0, 0], [4, 2], 0, 1)]);
  near(floorAt(terrain, -2, 0), 0, 1e-9);
  near(floorAt(terrain, 0, 0), 0.5);
  near(floorAt(terrain, 1, 0.9), 0.75);
  near(floorAt(terrain, 2, 0), 1);
  const down = createTerrain([rampOf([0, 0], [4, 2], 1, 0)]);
  near(floorAt(down, -1, 0), 0.75);
});

test('floorAt: a flight is discrete treads, the first at from + rise, the last at from + steps * rise', () => {
  const terrain = createTerrain([stairsOf([0, 0], [3, 1], 10, 2, 0.2)]);
  for (let step = 0; step < 10; step += 1) near(floorAt(terrain, -1.5 + (step + 0.5) * 0.3, 0), 2 + (step + 1) * 0.2, 1e-9, `tread ${step}`);
  // Level across a tread, a step at its edge.
  near(floorAt(terrain, -1.5 + 0.05, 0), 2.2);
  near(floorAt(terrain, -1.5 + 0.25, 0), 2.2);
  near(floorAt(terrain, -1.5 + 0.35, 0), 2.4);
});

test('floorAt: winding stairs climb round their centre, a tread each', () => {
  const spec = { at: [5, 5], inner: 0.5, outer: 2, start: 0, turn: Math.PI, steps: 12, from: 0, rise: 0.2 };
  const terrain = createTerrain(windingStairs(spec));
  for (let step = 0; step < 12; step += 1) {
    const [x, z] = windingTread(spec, step);
    near(floorAt(terrain, x, z), (step + 1) * 0.2, 1e-9, `tread ${step}`);
  }
  assert.equal(floorAt(terrain, 5, 5), -Infinity);
});

test('floorAt: the highest top at or just under the height asked: a stair over a vault', () => {
  const terrain = createTerrain([slabOf([0, 0], [10, 10], 0), slabOf([0, 0], [4, 4], 3, { bottom: 2.5 })]);
  near(floorAt(terrain, 0, 0, 0.1), 0, 1e-9, 'standing in the vault');
  near(floorAt(terrain, 0, 0, 3.05), 3, 1e-9, 'standing on the stair');
  near(floorAt(terrain, 0, 0, 2.4), 0, 1e-9, 'a head just under it');
  near(floorAt(terrain, 0, 0), 3, 1e-9, 'no height: the highest');
  near(floorAt(terrain, 0, 0, 2.9, 0.15), 3, 1e-9, 'a tolerance of a stride');
});

test('floorAt: walls and ceilings are not floors', () => {
  const terrain = createTerrain([wallOf([0, 0], [2, 2], 0, 3), ceilingOf([0, 0], [2, 2], 2.5)]);
  assert.equal(floorAt(terrain, 0, 0), -Infinity);
});

test('floorAt: the grid agrees with trying every solid, over many points', () => {
  const solids = [
    slabOf([0, 0], [30, 30], 0),
    stairsOf([4, 4], [3, 2], 8, 0, 0.2, { yaw: 0.6 }),
    rampOf([-6, 3], [5, 2], 0, 1.5, { yaw: -1.1 }),
    slabOf([-5, -6], [6, 4], 2.4, { yaw: 2.2, bottom: 1 }),
    ...windingStairs({ at: [8, -7], inner: 0.4, outer: 1.8, steps: 16, rise: 0.15, turn: Math.PI * 1.5 }),
  ];
  const grid = createTerrain(solids);
  let seed = 12345;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let sample = 0; sample < 400; sample += 1) {
    const x = (random() - 0.5) * 36;
    const z = (random() - 0.5) * 36;
    const y = random() * 4;
    // Each solid alone: the highest top among them at or below y.
    let best = -Infinity;
    for (const solid of solids) best = Math.max(best, floorAt(createTerrain([solid]), x, z, y));
    assert.equal(floorAt(grid, x, z, y), best, `at ${x.toFixed(2)}, ${z.toFixed(2)}, ${y.toFixed(2)}`);
  }
});

test('pushOut: a wall stops a sphere and says which way it was pushed', () => {
  const terrain = createTerrain([wallOf([0, 0], [4, 0.4], 0, 2)]);
  // A part 0.5 m up, 0.2 m radius, 0.1 m from the face: pushed out to touch it.
  const at = [0.5, 0.3];
  assert.equal(pushOut(terrain, at, 0.2, 0.3, 0.7), true);
  near(at[1], 0.2 + 0.2, 1e-9);
  near(at[0], 0.5, 1e-9);
  assert.deepEqual([terrain.normal[0], terrain.normal[1]], [0, 1].map((v) => v));
  // Over the top of it, or clear of it, nothing.
  assert.equal(pushOut(terrain, [0.5, 0.3], 0.2, 2.1, 2.5), false);
  assert.equal(pushOut(terrain, [0.5, 0.9], 0.2, 0.3, 0.7), false);
  // From the other side, the other way.
  const behind = [0, -0.3];
  assert.equal(pushOut(terrain, behind, 0.2, 0.3, 0.7), true);
  near(behind[1], -0.4, 1e-9);
  near(terrain.normal[1], -1);
});

test('pushOut: a wall turned by yaw pushes along its own normal', () => {
  const terrain = createTerrain([wallOf([0, 0], [6, 0.4], 0, 2, { yaw: Math.PI / 4 })]);
  const at = [0.2, 0.2];
  // The wall's v axis (its thickness) is (sin yaw, cos yaw) = (0.707, 0.707): the point is 0.28 m along it, the face 0.2.
  assert.equal(pushOut(terrain, at, 0.2, 0.3, 0.7), true);
  near(Math.hypot(at[0], at[1]), 0.2 + 0.2, 1e-9);
  near(terrain.normal[0], Math.SQRT1_2, 1e-9);
});

test('pushOut: a rise within a stride is stepped onto; a taller face is a ledge, and a man under it is pushed out', () => {
  const kerb = createTerrain([slabOf([0, 0], [4, 4], 0.25)]);
  assert.equal(pushOut(kerb, [2.05, 0], 0.1, 0.05, 0.25), false, 'a kerb: the part is lifted by the floor, not pushed');
  const ledge = createTerrain([slabOf([0, 0], [4, 4], 1, { bottom: 0 })]);
  const at = [2.05, 0];
  assert.equal(pushOut(ledge, at, 0.1, 0.05, 0.25), true, 'a ledge: pushed away from its face');
  near(at[0], 2.1, 1e-9);
  const under = [1.5, 0];
  assert.equal(pushOut(ledge, under, 0.1, 0.05, 0.25), true, 'inside it');
  assert.ok(Math.abs(under[0]) > 2 || Math.abs(under[1]) > 2, 'out through a face');
  // Standing on top of it, nothing.
  assert.equal(pushOut(ledge, [1.9, 0], 0.1, 1.0, 1.2), false);
});

test('pushOut: inside a flight, under a tread, a part goes back down the riser, not out through the side', () => {
  const terrain = createTerrain([stairsOf([0, 0], [3, 2], 10, 0, 0.2)]);
  // 0.15 m into tread 5 (top 1.2), a foot 0.3 m above the floor: the riser is 0.15 m behind it, the side 0.9 m.
  const at = [-1.5 + 5 * 0.3 + 0.15, 0.1];
  assert.equal(pushOut(terrain, at, 0.05, 0.3, 0.4), true);
  assert.ok(at[0] < -1.5 + 5 * 0.3, `back off the riser: ${at[0]}`);
  near(at[1], 0.1, 1e-9);
});

test('ceilingAt: the underside of the lowest ceiling above', () => {
  const terrain = createTerrain([ceilingOf([0, 0], [4, 4], 3), ceilingOf([0, 0], [2, 2], 5)]);
  near(ceilingAt(terrain, 0, 0, 1), 3);
  near(ceilingAt(terrain, 0, 0, 3.5), 5);
  assert.equal(ceilingAt(terrain, 0, 0, 6), Infinity);
  assert.equal(ceilingAt(terrain, 9, 9, 1), Infinity);
});

test('rayBlocked: walls block a line of sight at their height, and only there', () => {
  const terrain = createTerrain([wallLine([0, -5], [0, 5], 0.4, 0, 2), wallOf([10, 0], [0.4, 10], 0, 0.5)]);
  assert.equal(rayBlocked(terrain, [-3, 0], [3, 0], 1.5), true, 'through the tall wall');
  assert.equal(rayBlocked(terrain, [-3, 0], [3, 0], 2.5), false, 'over it');
  assert.equal(rayBlocked(terrain, [-3, 8], [3, 8], 1.5), false, 'round the end of it');
  assert.equal(rayBlocked(terrain, [8, 0], [12, 0], 1.5), false, 'over a low wall at eye height');
  assert.equal(rayBlocked(terrain, [8, 0], [12, 0], 0.3), true, 'through it at the knee');
  assert.equal(rayBlocked(terrain, [-3, 0], [-1, 0], 1.5), false, 'short of it');
  // A slope of sight: eye 1.5 at one end, 3 at the other, passing the wall at 2.25.
  assert.equal(rayBlocked(terrain, [-3, 0], [3, 0], 1.5, 3), false);
  assert.equal(rayBlocked(terrain, [-3, 0], [3, 0], 3, 1.5), false);
});

test('rayBlocked: a ledge in the way blocks the line below its top', () => {
  const terrain = createTerrain([slabOf([0, 0], [20, 20], 0), slabOf([5, 0], [2, 4], 3, { bottom: 0 })]);
  assert.equal(rayBlocked(terrain, [0, 0], [10, 0], 1.7), true);
  assert.equal(rayBlocked(terrain, [0, 0], [10, 0], 3.5), false);
  assert.equal(rayBlocked(terrain, [0, 6], [10, 6], 1.7), false);
});

test('awayFromEdges: a foot aimed at a tread edge is moved onto one tread', () => {
  const terrain = createTerrain([stairsOf([0, 0], [3, 2], 10, 0, 0.2)]);
  const edge = [-1.5 + 0.3 + 0.01, 0];
  const before = floorAt(terrain, edge[0], edge[1], 3);
  const moved = awayFromEdges(terrain, [...edge], 3);
  near(floorAt(terrain, moved[0], moved[1], 3), before, 1e-9, 'the same tread');
  assert.ok(Math.abs(floorAt(terrain, moved[0] - 0.05, moved[1], 3) - before) < 0.01 && Math.abs(floorAt(terrain, moved[0] + 0.05, moved[1], 3) - before) < 0.01, 'clear of the edges');
  // In the middle of a tread: not moved.
  const middle = awayFromEdges(terrain, [-1.5 + 0.45, 0], 3);
  near(middle[0], -1.5 + 0.45);
});

test('an arena without terrain keeps the old floor (floorUnder)', () => {
  near(floorUnder({ halfX: 3, halfZ: 3 }, 1, 0, 0), 0);
  const terrain = createTerrain([slabOf([0, 0], [4, 4], 1.5)]);
  near(floorUnder({ terrain }, 0, 0, 1.6), 1.5);
  near(floorUnder({ terrain: createTerrain([], { sea: -7 }) }, 0, 0, 0), -7, 1e-9, 'the sea where there is no floor');
});

// ---- A body on it --------------------------------------------------------------------

/** A world of one fighter on this terrain, standing at (x, z) on `floor`, walking. */
function lone(terrain, name, { x, z = 0, floor = 0, seed = 1, facing = 0 } = {}) {
  const arena = { halfX: 5000, halfZ: 5000, open: true, terrain };
  const world = createWorld([{ inputs: structuredClone(PRESETS[name]), corner: 'red' }], { seed, arena });
  const fighter = world.fighters[0];
  placeOnFloor(fighter, x, z, floor, facing);
  fighter.walking = true;
  return { world, fighter };
}

/** Walk the planted, settled feet's errors (m above the tread top; the ankle's height taken off) through a route; returns the numbers. */
function climb(world, fighter, route) {
  const errors = [];
  let lowestHips = Infinity;
  const result = walk(world, fighter, route, {
    seconds: 120,
    each: (current, walker) => {
      const measured = footErrors(walker, current.arena.terrain);
      for (const side of ['l', 'r']) {
        const foot = walker.feet[side];
        foot.settled = measured[side] === null ? 0 : (foot.settled ?? 0) + 1;
        // Planted for 8 steps (0.13 s): settled.
        if (foot.settled >= 8) errors.push(measured[side]);
      }
      const hips = walker.x[P.pelvis * 3 + 1];
      lowestHips = Math.min(lowestHips, hips - floorAt(current.arena.terrain, walker.x[P.pelvis * 3], walker.x[P.pelvis * 3 + 2], hips));
    },
  });
  errors.sort((a, b) => a - b);
  const quantile = (share) => errors[Math.floor(share * (errors.length - 1))];
  return { result, errors, within: errors.filter((e) => Math.abs(e) <= 0.03).length / errors.length, p5: quantile(0.05), p95: quantile(0.95), lowestHips };
}

const FLIGHT = [[-20, -9], [-17.5, -9], [-12.5, -9], [-10, -9], [-7, -9], [-3.5, -9], [-0.5, -9], [-3.5, -9], [-7, -9], [-10, -9], [-12.5, -9], [-17.5, -9], [-20, -9]];
const SPIRAL = Array.from({ length: 24 }, (_, step) => windingTread({ at: [-12, 4], inner: 0.6, outer: 2.4, start: -Math.PI / 2, turn: Math.PI * 1.5, steps: 24 }, step, 1.55));
const WINDING = [[-12, 0.5], ...SPIRAL, [-16.4, 4.42], ...[...SPIRAL].reverse(), [-12, 0.5]];

for (const [name, route, label] of [['ronin', FLIGHT, 'the straight flights, up to 6 m and down'], ['ronin', WINDING, 'the winding stair, up and down'], ['heavy', FLIGHT, 'the straight flights (a big man)'], ['light', WINDING, 'the winding stair (a small man)']]) {
  test(`a walker climbs and descends ${label}: feet on the treads, never below the floor, never stuck`, () => {
    const world = createStageWorld(TESTYARD, structuredClone(PRESETS[name]), { seed: 3 });
    const fighter = world.fighters[0];
    const { result, errors, within, p5, p95, lowestHips } = climb(world, fighter, route);
    assert.equal(result.reached, route.length, `stuck at ${result.stuckAt}`);
    assert.equal(fighter.state, 'up');
    assert.deepEqual(world.events.filter((event) => ['broken', 'killed', 'fell', 'impact'].includes(event.kind)).map((event) => event.kind), [], 'no falls on the way');
    assert.ok(errors.length > 100, 'many feet measured');
    // Planted feet sit on the tread (the ankle's own height above it), within 3 cm for the most part; the odd one trailing a step is further.
    assert.ok(within >= (name === 'ronin' ? 0.9 : 0.7), `${(within * 100).toFixed(0)}% of planted feet within 3 cm`);
    assert.ok(p95 <= (name === 'ronin' ? 0.04 : 0.065), `95th percentile ${p95.toFixed(3)} m above the tread`);
    assert.ok(p5 >= -0.03, `never sunk into it (${p5.toFixed(3)})`);
    assert.ok(lowestHips > 0.3, `his hips never nearer the floor than ${lowestHips.toFixed(2)} m (standing: about 0.9)`);
  });
}

test('a body ends a climb up on the ledge, and back on the ground', () => {
  const world = createStageWorld(TESTYARD, structuredClone(PRESETS.ronin), { seed: 3 });
  const fighter = world.fighters[0];
  walk(world, fighter, FLIGHT.slice(0, 7), { seconds: 90 });
  // On the 6 m ledge: his hips about a metre over it.
  near(fighter.x[P.pelvis * 3 + 1], 6 + 0.9, 0.2);
  walk(world, fighter, FLIGHT.slice(7), { seconds: 90 });
  near(fighter.x[P.pelvis * 3 + 1], 0.9, 0.2);
});

test('a kerb of 0.25 m is stepped over; one of 0.6 m is a ledge that stops a walker', () => {
  for (const [rise, passes] of [[0.25, true], [0.6, false]]) {
    const terrain = createTerrain([slabOf([0, 0], [60, 20], 0), slabOf([10, 0], [8, 8], rise, { bottom: 0 })]);
    const { world, fighter } = lone(terrain, 'ronin', { x: 0 });
    const result = walk(world, fighter, [[10, 0]], { seconds: 25, within: 0.5 });
    if (passes) {
      assert.equal(result.reached, 1);
      assert.ok(fighter.x[P.pelvis * 3 + 1] > rise + 0.75, `up on the kerb: hips at ${fighter.x[P.pelvis * 3 + 1].toFixed(2)}`);
    } else {
      assert.equal(result.reached, 0, 'stopped at the face');
      assert.ok(hipsAt(fighter)[0] < 5.75, `${hipsAt(fighter)[0]} is short of the ledge at x 6`);
      assert.equal(fighter.state, 'up');
    }
  }
});

test('walls stop a walker: the maze wall holds him, and he does not pass through it', () => {
  const world = createStageWorld(TESTYARD, structuredClone(PRESETS.ronin), { seed: 3 });
  const fighter = world.fighters[0];
  // Through the open west side of the maze, then east along z -7.5 into the wall at x 9.
  walk(world, fighter, [[-2, -4.5], [4, -4.5], [4, -7.5]], { seconds: 60 });
  const result = walk(world, fighter, [[13, -7.5]], { seconds: 30 });
  assert.equal(result.reached, 0, 'did not get through');
  const [x] = hipsAt(fighter);
  assert.ok(x < 8.65 && x > 7.5, `against the wall at x 9 (0.2 thick), his hips ${x.toFixed(2)}`);
  // None of him is in the wall.
  for (let part = 0; part < 15; part += 1) assert.ok(fighter.x[part * 3] < 8.85, `part ${part} at ${fighter.x[part * 3].toFixed(2)}`);
  assert.equal(fighter.state, 'up');
});

test('the wall of the corridor and its low roof hold a tall man', () => {
  const world = createStageWorld(TESTYARD, structuredClone(PRESETS.heavy), { seed: 3 });
  const fighter = world.fighters[0];
  world.stage.mechanisms.gate1 = 'open';
  walk(world, fighter, [[16, 0], [26, 0]], { seconds: 60, think: () => {} });
  // Pushed sideways into the corridor's wall: held at 2.0 m.
  const result = walk(world, fighter, [[26, 9]], { seconds: 8 });
  assert.equal(result.reached, 0);
  assert.ok(Math.abs(hipsAt(fighter)[1]) < 1.95, `held off the wall, at ${hipsAt(fighter)[1].toFixed(2)}`);
  let highest = 0;
  for (let part = 0; part < 15; part += 1) highest = Math.max(highest, fighter.x[part * 3 + 1] + fighter.radius[part]);
  assert.ok(highest < 3.21, `his head under the roof (${highest.toFixed(2)})`);
});

// ---- Falls ---------------------------------------------------------------------------------

/** How a fall of `height` m goes for each of some bodies: walked off a ledge, or dropped limp. */
function falls(height, how) {
  const results = [];
  for (const name of ['heavy', 'light', 'muayThai', 'police']) {
    for (const seed of [1, 2]) {
      const terrain = createTerrain([slabOf([0, 0], [80, 40], 0), slabOf([-20, 0], [40, 40], height, { bottom: 0 })], { sea: -30 });
      const { world, fighter } = lone(terrain, name, { x: how === 'walk' ? -2 : 5, floor: how === 'walk' ? height : 0, seed });
      if (how === 'drop') {
        for (let index = 1; index < fighter.x.length; index += 3) {
          fighter.x[index] += height;
          fighter.prev[index] += height;
        }
        fighter.state = 'down';
        fighter.motorScale = 0;
        fighter.downTimer = 99;
      }
      for (let step = 0; step < 60 * 7; step += 1) {
        if (how === 'walk') {
          fighter.goTo = [fighter.x[P.pelvis * 3] + 3, 0, fighter.x[P.pelvis * 3 + 2]];
          fighter.move = 1;
        }
        advance(world, 1 / 60);
      }
      const dead = fighter.state === 'out';
      results.push({ name, seed, dead, legs: legShare(fighter), broken: [...fighter.broken], trunk: fighter.trauma?.trunk ?? 0, up: fighter.state === 'up' });
    }
  }
  return results;
}
const share = (results, test) => results.filter(test).length / results.length;

test('falls: a metre costs nothing, three hurt and can break a leg, six mostly kill, ten kill (walked off a ledge)', () => {
  const one = falls(1, 'walk');
  assert.equal(share(one, (r) => r.up && r.legs < 0.1 && r.broken.length === 0 && r.trunk < 0.1), 1, JSON.stringify(one));
  const three = falls(3, 'walk');
  assert.ok(share(three, (r) => r.legs > 0.1 || r.trunk > 0.1) >= 0.75, `hurt: ${JSON.stringify(three)}`);
  assert.ok(share(three, (r) => r.broken.some((joint) => joint.endsWith('Knee'))) > 0, 'a leg breaks in some');
  assert.ok(share(three, (r) => r.broken.some((joint) => joint.endsWith('Knee'))) <= 0.5, 'but not in most');
  assert.ok(share(three, (r) => r.dead) <= 0.25, 'three metres rarely kills');
  const six = falls(6, 'walk');
  assert.ok(share(six, (r) => r.dead) >= 0.6, `six metres usually kills: ${JSON.stringify(six)}`);
  const ten = falls(10, 'walk');
  assert.ok(share(ten, (r) => r.dead) >= 0.85, `ten metres kills: ${JSON.stringify(ten)}`);
});

test('falls: dropped limp, the same bands', () => {
  const one = falls(1, 'drop');
  assert.ok(share(one, (r) => r.dead || r.broken.length > 0) === 0, 'a metre: nothing broken');
  const three = falls(3, 'drop');
  assert.ok(share(three, (r) => r.dead) === 0 && share(three, (r) => r.legs > 0.05 || r.trunk > 0.1) >= 0.75, `three metres hurts: ${JSON.stringify(three)}`);
  const six = falls(6, 'drop');
  assert.ok(share(six, (r) => r.dead) >= 0.6, `six metres usually kills: ${JSON.stringify(six)}`);
  const ten = falls(10, 'drop');
  assert.ok(share(ten, (r) => r.dead) >= 0.85, `ten metres kills: ${JSON.stringify(ten)}`);
});

test('the sea: a man who goes off the cliff is lost to it, with an event that says so', () => {
  const world = createStageWorld(TESTYARD, structuredClone(PRESETS.ronin), { seed: 3 });
  const fighter = world.fighters[0];
  // South along x -2 (clear of the tower and the ledges) to the edge of the yard at z 11, and on.
  walk(world, fighter, [[-2, 0], [-2, 8]], { seconds: 40 });
  assert.equal(fighter.state, 'up');
  advance(world, 8, (current) => {
    updateStage(current);
    fighter.goTo = [-2, 0, 30];
    fighter.move = 1;
  });
  assert.equal(fighter.state, 'out');
  const event = world.events.find((entry) => entry.kind === 'drowned');
  assert.ok(event, world.events.map((entry) => entry.kind).join());
  assert.equal(event.fighter, 0);
  assert.deepEqual(event.effects, ['lost to the sea']);
  assert.ok(fighter.x[P.pelvis * 3 + 1] < TESTYARD.sea);
});

test('the sea: a terrain with none loses nobody', () => {
  const { world, fighter } = lone(createTerrain([slabOf([0, 0], [20, 20], 0)]), 'ronin', { x: 0 });
  advance(world, 8, () => {
    fighter.goTo = [40, 0, 0];
    fighter.move = 1;
  });
  assert.equal(world.events.some((entry) => entry.kind === 'drowned'), false, 'no sea, no drowning');
});

test('WORLD.terrain is the one place the tuning lives', () => {
  for (const key of ['cell', 'margin', 'stepUp', 'stepDown', 'bodyRadius', 'bodyHeight', 'liftRate', 'sag', 'fall']) assert.ok(WORLD.terrain[key] !== undefined, key);
  for (const key of ['safe', 'legs', 'bodyFrom', 'body', 'stumble', 'ankleFrom', 'ankleTo', 'compress', 'compressFrom']) assert.ok(WORLD.terrain.fall[key] !== undefined, key);
});
