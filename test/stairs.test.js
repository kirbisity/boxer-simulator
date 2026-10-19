// Running and walking stairs (physics.js: climbShare, leashShare, groundStance, landOnFeet): a healthy man who walks, runs
// (the AI's gait) or sprints (the player's run mode) up or down any flight of Dunnottar or the test yard does not fall,
// is not hurt and is never in the air; a shove or a blow on a flight still puts him down, but as a stumble and a slide,
// not a lethal tumble. The flights are read from the stage data (tools/stairs.js stairsOfStage), not written out here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { advance, deliverImpulse, legShare, placeOnFloor, TRUNK_PARTICLES } from '../src/physics.js';
import { createTerrain, floorAt, pushOut, slabOf, stairsOf, wallOf } from '../src/physics/terrain.js';
import { updateStage } from '../src/levelmode/stage.js';
import { DUNNOTTAR } from '../src/levelmode/stages/dunnottar.js';
import { TESTYARD } from '../src/levelmode/stages/testyard.js';
import { climbStair, lone, stairsOfStage } from '../tools/stairs.js';

const DUNNOTTAR_STAIRS = stairsOfStage(DUNNOTTAR);
const YARD_STAIRS = stairsOfStage(TESTYARD);

/** What went wrong on a trek, if anything (a healthy man going up or down: nothing). */
const trouble = (log) => (log.ok ? null : JSON.stringify({ done: log.done, reached: log.reached, air: log.air, events: log.events, states: log.stateChanges, legs: log.legs, trunk: log.trunk, broken: log.broken }));

test('stairs: the stage data has the flights this test walks (straight flights and the winding stair)', () => {
  assert.ok(DUNNOTTAR_STAIRS.length >= 8, `${DUNNOTTAR_STAIRS.length} stairs in Dunnottar`);
  assert.ok(DUNNOTTAR_STAIRS.some((stair) => stair.winding && stair.steps >= 80), 'the winding stair of the round tower');
  assert.ok(DUNNOTTAR_STAIRS.some((stair) => stair.steps >= 36), 'a long straight flight');
  assert.ok(YARD_STAIRS.length >= 3, 'the test yard has two flights and a winding stair');
});

for (const gait of ['walk', 'run', 'sprint']) {
  test(`stairs: the forger ${gait}s up and down every flight of Dunnottar: no fall, no injury, never in the air`, () => {
    const bad = [];
    for (const stair of DUNNOTTAR_STAIRS) {
      for (const dir of ['up', 'down']) {
        const problem = trouble(climbStair(DUNNOTTAR, stair, 'forger', 1, dir, gait));
        if (problem) bad.push(`${stair.name} ${dir}: ${problem}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  test(`stairs: a heavy man and a light one ${gait} up and down the long flights and the winding stair (${gait})`, () => {
    const long = DUNNOTTAR_STAIRS.filter((stair) => stair.winding || stair.steps >= 36 || stair.name.startsWith('gate/') || stair.name.startsWith('vault/flight#8'));
    const bad = [];
    for (const body of ['heavy', 'light']) {
      for (const stair of long) {
        for (const dir of ['up', 'down']) {
          const problem = trouble(climbStair(DUNNOTTAR, stair, body, 3, dir, gait));
          if (problem) bad.push(`${body} ${stair.name} ${dir}: ${problem}`);
        }
      }
    }
    assert.deepEqual(bad, []);
  });

  test(`stairs: the test yard's flights and winding stair, up and down (${gait})`, () => {
    const bad = [];
    for (const stair of YARD_STAIRS) {
      for (const body of ['forger', 'light']) {
        for (const dir of ['up', 'down']) {
          const problem = trouble(climbStair(TESTYARD, stair, body, 1, dir, gait));
          if (problem) bad.push(`${body} ${stair.name} ${dir}: ${problem}`);
        }
      }
    }
    assert.deepEqual(bad, []);
  });
}

test('stairs: a man in heavy gear (plate, a samurai) walks and runs the winding stair and a long flight', () => {
  const spiral = DUNNOTTAR_STAIRS.find((stair) => stair.winding);
  const flight = DUNNOTTAR_STAIRS.find((stair) => stair.name.startsWith('gate/'));
  const bad = [];
  for (const body of ['maximilian', 'ronin', 'knight']) {
    for (const [stair, dir, gait] of [[spiral, 'down', 'walk'], [spiral, 'up', 'run'], [flight, 'up', 'run'], [flight, 'down', 'run']]) {
      const problem = trouble(climbStair(DUNNOTTAR, stair, body, 1, dir, gait));
      if (problem) bad.push(`${body} ${stair.name} ${dir} ${gait}: ${problem}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('stairs: running a flight is slower than running on the flat (a man climbs only as fast as his feet), and walking is not held', () => {
  const stair = DUNNOTTAR_STAIRS.find((candidate) => candidate.name.startsWith('gate/'));
  const speedOf = (gait) => {
    const log = climbStair(DUNNOTTAR, stair, 'forger', 1, 'up', gait);
    assert.ok(log.ok, trouble(log));
    return log.world.time;
  };
  const walking = speedOf('walk');
  const running = speedOf('run');
  assert.ok(running < walking, `the same flight takes ${running.toFixed(1)} s run and ${walking.toFixed(1)} s walked`);
  // Held to the climb rate, though: not the flat-ground speed (2.76 m/s for him) up a flight rising 0.5 m in every metre.
  const length = Math.hypot(stair.route[2][0] - stair.route[1][0], stair.route[2][1] - stair.route[1][1]);
  assert.ok(length / (running - 1) < 2.4, `${(length / running).toFixed(2)} m/s up the flight`);
});

/**
 * A man standing on the middle of a flight is struck along it (`along`: +1 up the flight, -1 down it) with `impulse` N s
 * across his trunk, and left to fall for 8 s. Returns how it went for him.
 */
function struckOnAFlight(bodyName, impulse, along, seed = 1) {
  const stair = DUNNOTTAR_STAIRS.find((candidate) => candidate.name.startsWith('vault/'));
  const [from, to] = [stair.route[1], stair.route[2]];
  const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const direction = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
  const yaw = Math.atan2(-direction[1], direction[0]);
  const { world, me } = lone(DUNNOTTAR, bodyName, seed, mid, (stair.floor + stair.top) / 2, yaw);
  placeOnFloor(me, mid[0], mid[1], floorAt(world.arena.terrain, mid[0], mid[1], stair.top), yaw);
  me.walking = true;
  for (let step = 0; step < 60; step += 1) advance(world, 1 / 60, (current) => updateStage(current));
  const start = [me.x[P.pelvis * 3], me.x[P.pelvis * 3 + 2]];
  deliverImpulse({ fighter: me, shares: TRUNK_PARTICLES.map((index) => [index, 1]), direction: [direction[0] * along, 0, direction[1] * along], impulse });
  me.hitAt[P.neck] = world.time;
  for (let step = 0; step < 60 * 8; step += 1) advance(world, 1 / 60, (current) => updateStage(current));
  const slid = ((me.x[P.pelvis * 3] - start[0]) * direction[0] + (me.x[P.pelvis * 3 + 2] - start[1]) * direction[1]) * along;
  return { fell: world.events.some((event) => event.kind === 'fell' && event.fighter === me.id), out: me.state === 'out', trunk: me.trauma?.trunk ?? 0, legs: legShare(me), broken: [...me.broken], slid };
}

test('stairs: a shove on a flight still puts a man down, and a blow down it sends him sliding: but he lives', () => {
  for (const body of ['forger', 'heavy', 'light']) {
    const back = struckOnAFlight(body, 400, -1);
    assert.ok(back.fell, `${body}: a hard blow down the flight puts him down`);
    assert.ok(back.slid > 1.5, `${body}: and he goes down some steps of it (${back.slid.toFixed(1)} m)`);
    assert.ok(!back.out && back.trunk < 1.2 && back.broken.length === 0, `${body}: a tumble down a few treads is not lethal: ${JSON.stringify(back)}`);
    const forward = struckOnAFlight(body, 400, 1);
    assert.ok(forward.fell, `${body}: a blow up the flight puts him down`);
    assert.ok(!forward.out && forward.trunk < 1.2 && forward.legs < 0.5 && forward.broken.length === 0, `${body}: a fall onto the steps is a bruise: ${JSON.stringify(forward)}`);
    // A light shove he takes on his feet or sits down from.
    const nudge = struckOnAFlight(body, 100, -1);
    assert.ok(!nudge.out && nudge.trunk < 0.3, `${body}: ${JSON.stringify(nudge)}`);
  }
});

test('stairs: falling forward onto the steps, whichever way he lands, kills nobody and breaks no leg', () => {
  const bad = [];
  for (const body of ['forger', 'light']) {
    for (const impulse of [120, 250, 400]) {
      for (const seed of [1, 2, 3, 4]) {
        const result = struckOnAFlight(body, impulse, 1, seed);
        if (result.out || result.trunk > 1.2 || result.broken.length > 0 || result.legs > 0.5) bad.push(`${body} ${impulse} seed ${seed}: ${JSON.stringify(result)}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('stairs: a stumble down a few treads is a sit-down and a slide, not a landing', () => {
  const stumble = struckOnAFlight('forger', 250, -1);
  assert.ok(stumble.fell && stumble.slid > 1 && stumble.slid < 4, `${stumble.slid.toFixed(1)} m down the flight`);
  assert.ok(!stumble.out && stumble.trunk < 0.5 && stumble.legs < 0.1 && stumble.broken.length === 0, JSON.stringify(stumble));
});

test('terrain: a wall below the floor his higher foot stands on does not stop him (wallLow), a ledge face still does', () => {
  const terrain = createTerrain([slabOf([0, 0], [20, 20], 0), wallOf([5, 0], [1, 6], -1, 0.2)]);
  const at = [4.8, 0];
  // Standing on the ground: the low wall is a face of 0.2 m, a kerb his foot clears.
  assert.equal(pushOut(terrain, at, 0.3, 0.05, 1.75, 0.45, 0.05), true);
  const lead = [4.8, 0];
  // His lowest point at 0.05, but his lead foot stands on a floor at 0.3: the wall (top 0.2) is under it.
  assert.equal(pushOut(terrain, lead, 0.3, 0.05, 1.75, 0.45, 0.36), false);
  const flight = createTerrain([stairsOf([0, 0], [4, 2], 4, 0, 0.2)]);
  const bottom = [-1.6, 0];
  assert.equal(pushOut(flight, bottom, 0.3, 0.05, 1.75, 0.45, 0.36), false, 'a flight of 0.2 m risers is climbed, not a wall');
});
