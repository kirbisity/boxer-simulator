// Running polish (the player's run mode): a gentler drain of breath, sprinting past men who have not noticed him, a camera that comes
// round behind the way he runs, steering along walls and winding stairs, and the pose of a sprint turn.
// (control.js, levelmode/awareness.js, followcam.js, runsteer.js, physics.js runTurnPose / turnedStep.)

import test from 'node:test';
import assert from 'node:assert/strict';
import { thinkAll } from '../src/ai.js';
import { P, PRESETS } from '../src/body.js';
import { askRunLock, CONTROL, directFighter, newOrders } from '../src/control.js';
import { behindYaw, createFollowCam, FOLLOW_CAM, runFollowGoal, runFollowRate } from '../src/followcam.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { AWARE, mindState, sprintUnseen } from '../src/levelmode/awareness.js';
import { createLevelWorld, levelThink } from '../src/levelmode/level.js';
import { createStageWorld, stageThink, updateStage } from '../src/levelmode/stage.js';
import { DUNNOTTAR } from '../src/levelmode/stages/dunnottar.js';
import { TESTYARD } from '../src/levelmode/stages/testyard.js';
import { advance, placeOnFloor, toLocal } from '../src/physics.js';
import { WORLD } from '../src/physics/config.js';
import { createTerrain, feelers, slabOf, wallOf } from '../src/physics/terrain.js';
import { runSteer, RUN_STEER, stairBend, wantedBend } from '../src/runsteer.js';
import { lone, stairsOfStage } from '../tools/stairs.js';

const hips = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];

// ---- The test yard, a player on open ground ----------------------------------------------------------------------

/** The yard (Level Mode) with only the player awake, standing at `at` facing `yaw`; `keys` sets the orders' key stick each step. */
function yard(body = 'forger', at = [0, 0], yaw = 0) {
  const world = createLevelWorld(TESTYARD, levelPreset(body), { seed: 3 });
  const me = world.fighters[0];
  world.fighters.slice(1).forEach((fighter) => { fighter.dormant = true; });
  placeOnFloor(me, at[0], at[1], 0, yaw);
  updateStage(world, true);
  const orders = newOrders();
  const step = (seconds, each = null) => {
    for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
      advance(world, 1 / 60, (current, dt) => {
        stageThink(current, dt);
        levelThink(current, dt);
        directFighter(current, me, orders, dt);
      });
      each?.();
    }
  };
  return { world, me, orders, step };
}

// ---- 1. Stamina -------------------------------------------------------------------------------------------------

test('stamina: running costs at least five times less than it did, and a run across a courtyard never winds him', () => {
  assert.ok(CONTROL.run.staminaPerSecond <= 0.12 / 5, `the gross cost ${CONTROL.run.staminaPerSecond} a second (it was 0.12)`);
  for (const body of ['forger', 'dunnottarKnight']) {
    const game = yard(body, [0, 2]);
    let winded = false;
    let heading = 0;
    // Round a circle of 5 m radius on the open flat, 20 s.
    game.step(20, () => {
      heading += (0.85 / 60);
      game.orders.keyStick = { dir: [Math.cos(heading), Math.sin(heading)], amount: 1 };
      winded ||= game.orders.winded;
    });
    assert.equal(winded, false, `${body}: not winded in 20 s of running`);
    assert.equal(game.me.runMode, true, `${body}: still running`);
    assert.ok(game.me.stamina > 0.6, `${body}: ${game.me.stamina.toFixed(2)} of his breath left after 20 s`);
  }
});

test('stamina: a drain that matters over minutes: a man in plate who sprints for two minutes is winded, and recovers in seconds', () => {
  const game = yard('dunnottarKnight', [0, 2]);
  let heading = 0;
  let windedAt = null;
  game.step(150, () => {
    heading += 0.85 / 60;
    game.orders.keyStick = { dir: [Math.cos(heading), Math.sin(heading)], amount: 1 };
    if (game.orders.winded && windedAt === null) windedAt = game.world.time;
  });
  assert.ok(windedAt !== null && windedAt > 45 && windedAt < 150, `winded after ${windedAt?.toFixed(0)} s`);
  game.orders.keyStick = null;
  game.step(8);
  assert.equal(game.orders.winded, false, 'a few seconds standing and he has his wind back');
});

// ---- 2. Sprinting past ----------------------------------------------------------------------------------------------

function field({ spawns = [], player = [0, 0], facing = 0 } = {}) {
  const section = { id: 'a', name: 'A', bounds: [{ at: [0, 0], size: [200, 200] }], terrain: [slabOf([0, 0], [200, 200], 0, { id: 'floor' })], portals: [], spawns, items: [], levers: [], gates: [], ladders: [] };
  return { id: 'field', title: 'Field', sea: -8, start: { section: 'a', at: [player[0], 0, player[1]], facing }, sections: [section] };
}
const guard = (id, x, z, facing) => ({ id, preset: 'knight', role: 'enemy', tier: 1, post: [x, 0, z], facing });
const think = (current, dt) => thinkAll(current, dt, new Set([0]));

/** A field with the player at the origin and these guards; `sprint(on)` says whether he is in run mode in the steps after. */
function lane(spawns) {
  const world = createStageWorld(field({ spawns }), structuredClone(PRESETS.knight), { seed: 7 });
  const game = { world, sprinting: false };
  game.run = (seconds) => advance(world, seconds, (current, dt) => {
    current.fighters[0].runMode = game.sprinting;
    stageThink(current, dt, think);
  });
  game.man = (id) => world.fighters.find((fighter) => fighter.spawn?.id === id);
  game.state = (id) => mindState(world, game.man(id).id);
  return game;
}

test('sprint: a guard facing the runner in the open does not turn aggro while he is in run mode; the same man walking is seen', () => {
  const sprinting = lane([guard('g', 12, 0, Math.PI)]);
  sprinting.sprinting = true;
  sprinting.run(4);
  assert.equal(sprinting.state('g'), 'idle', 'a sprinter in plain sight at 12 m goes unnoticed');
  const walking = lane([guard('g', 12, 0, Math.PI)]);
  walking.run(2);
  assert.equal(walking.state('g'), 'aggro', 'walking, he is seen');
  assert.equal(AWARE.sprintUnseen, true);
});

test('sprint: nor does a sprinter wake a guard by bumping him, and a clash of arms near an idle guard does not send him to look', () => {
  const game = lane([guard('g', 2, 0, 0), guard('h', 20, 20, 0)]);
  game.sprinting = true;
  game.run(0.5);
  game.world.events.push({ kind: 'bump', attacker: game.man('g').id, defender: 0, time: game.world.time });
  game.world.events.push({ kind: 'landed', attacker: 1, defender: game.man('h').id });
  game.run(1);
  assert.equal(game.state('g'), 'idle', 'bumped by a sprinter, unmoved');
  const walking = lane([guard('g', 2, 0, 0)]);
  walking.run(0.5);
  walking.world.events.push({ kind: 'bump', attacker: walking.man('g').id, defender: 0, time: walking.world.time });
  walking.run(0.5);
  assert.equal(walking.state('g'), 'aggro', 'the same bump walking is felt');
});

test('sprint: a blow that lands on an unaware man still alarms him, and men already aggro keep fighting as the runner passes', () => {
  const game = lane([guard('g', 8, 0, 0), guard('h', 12, 3, Math.PI)]);
  game.run(2.5);
  assert.equal(game.state('h'), 'aggro', 'h saw him walking');
  game.sprinting = true;
  game.run(0.6);
  game.world.events.push({ kind: 'landed', attacker: 0, defender: game.man('g').id });
  game.run(0.5);
  assert.equal(game.state('g'), 'aggro', 'a hit man knows');
  // Aggro men keep their hold on him: h goes on hunting for as long as he sprints, and comes for him.
  const near = (id) => Math.hypot(...hips(game.man(id)).map((value, axis) => value - hips(game.world.fighters[0])[axis]));
  const before = near('h');
  game.run(3);
  assert.equal(game.state('h'), 'aggro', 'already aggro: he stays so');
  assert.ok(near('h') < before || near('h') < 3, 'and keeps coming at the sprinter');
});

test('sprint: a man searching keeps searching and does not turn aggro on a sprinter; a short grace after the run ends, then he is seen', () => {
  const game = lane([guard('g', 10, 0, Math.PI)]);
  const mind = game.world.stage.aware.minds[game.man('g').id];
  mind.state = 'search';
  mind.lastSeen = { x: 10, z: 0, y: 0 };
  mind.since = game.world.time;
  game.sprinting = true;
  game.run(1.5);
  assert.notEqual(game.state('g'), 'aggro', 'searching, he looks straight at a sprinter and sees nothing');
  // Out of run mode: for the grace it still holds.
  game.sprinting = false;
  const stopped = game.world.time;
  let aggroAt = null;
  for (let frame = 0; frame < 60 * 3 && aggroAt === null; frame += 1) {
    game.run(1 / 60);
    if (game.state('g') === 'aggro') aggroAt = game.world.time - stopped;
  }
  assert.ok(aggroAt !== null, 'then he sees him');
  assert.ok(aggroAt > AWARE.sprintGrace - 0.05, `not before the grace of ${AWARE.sprintGrace} s (${aggroAt.toFixed(2)} s)`);
  assert.ok(aggroAt < AWARE.sprintGrace + AWARE.every + 0.2, `and soon after it (${aggroAt.toFixed(2)} s)`);
  assert.equal(sprintUnseen(game.world), false);
});

test('sprint: AWARE.sprintUnseen false is the old rule (a sprinter is seen)', () => {
  const game = lane([guard('g', 12, 0, Math.PI)]);
  game.world.stage.aware.config.sprintUnseen = false;
  game.sprinting = true;
  game.run(2);
  assert.equal(game.state('g'), 'aggro');
});

// ---- 3. The camera --------------------------------------------------------------------------------------------------

/** A follow camera settled behind a man facing `facing`; steps it `seconds` with him running at `speed` facing `to`. */
function chase(facing, to, seconds, { running = true, speed = 4.2, start = 0 } = {}) {
  const cam = createFollowCam();
  const input = (yaw) => ({ me: [0, 1, 0], facing: yaw, down: false, foe: null, moving: true, running, speed, aspect: 16 / 9 });
  let now = start;
  cam.update(input(facing), now, 1 / 60);
  const log = [];
  for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
    now += 1 / 60;
    log.push(cam.update(input(to), now, 1 / 60).yaw);
  }
  return { cam, log, now };
}
const turnOff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

test('camera: a turn in run mode brings the view round behind the new heading, quicker the faster he runs', () => {
  const quarter = Math.PI / 2;
  const running = chase(0, quarter, 1.6);
  assert.ok(turnOff(running.log.at(-1), behindYaw(quarter)) < 0.08, `settled behind the new heading (${turnOff(running.log.at(-1), behindYaw(quarter)).toFixed(3)} rad off)`);
  const walking = chase(0, quarter, 1.2, { running: false });
  assert.ok(turnOff(walking.log.at(-1), behindYaw(quarter)) > 0.5, 'the same turn walking leaves the view well behind (the lazy follow)');
  const slow = chase(0, quarter, 0.5, { speed: 1 });
  const fast = chase(0, quarter, 0.5, { speed: 6 });
  assert.ok(turnOff(fast.log.at(-1), behindYaw(quarter)) < turnOff(slow.log.at(-1), behindYaw(quarter)) - 0.1, 'faster, it follows faster');
  assert.ok(runFollowRate(6) > runFollowRate(1));
  // No snapping: critically damped, so it never overshoots.
  const overshoot = running.log.some((yaw) => turnOff(yaw, behindYaw(0)) > turnOff(behindYaw(quarter), behindYaw(0)) + 0.01);
  assert.equal(overshoot, false);
  // Even a small bend of the heading is followed (there is no dead band).
  const small = chase(0, 0.15, 1.2);
  assert.ok(turnOff(small.log.at(-1), behindYaw(0.15)) < 0.03, 'a 9 degree bend is followed');
});

test('camera: a man running at the camera does not swing it round', () => {
  assert.equal(runFollowGoal(behindYaw(0), Math.PI), behindYaw(0));
  const toward = chase(0, Math.PI, 2);
  assert.ok(turnOff(toward.log.at(-1), behindYaw(0)) < 0.02, `the view stays (${turnOff(toward.log.at(-1), behindYaw(0)).toFixed(3)} rad)`);
  // A heading near the side is followed all the way; one nearly towards it hardly.
  assert.ok(turnOff(runFollowGoal(behindYaw(0), 1.4), behindYaw(1.4)) < 1e-6);
  assert.ok(turnOff(runFollowGoal(behindYaw(0), 2.9), behindYaw(0)) < 0.15);
});

test('camera: the player\'s own look pauses the follow for the run pause, then it resumes', () => {
  const pause = FOLLOW_CAM.run.pause;
  const { cam, now } = chase(0, 0.9, 0.2);
  cam.look(1.2, 0.1, now);
  const looked = cam.state.yaw;
  const input = { me: [0, 1, 0], facing: 0.9, down: false, foe: null, moving: true, running: true, speed: 4.2, aspect: 16 / 9 };
  let time = now;
  for (let frame = 0; frame < Math.round((pause - 0.1) * 60); frame += 1) {
    time += 1 / 60;
    cam.update(input, time, 1 / 60);
  }
  assert.ok(turnOff(cam.state.yaw, looked) < 1e-6, 'held where he put it for the pause');
  for (let frame = 0; frame < 3 * 60; frame += 1) {
    time += 1 / 60;
    cam.update(input, time, 1 / 60);
  }
  assert.ok(turnOff(cam.state.yaw, behindYaw(0.9)) < 0.1, `then back behind him (${turnOff(cam.state.yaw, behindYaw(0.9)).toFixed(2)} rad off)`);
  // Walking, the old three-second hold is unchanged.
  const walk = chase(0, 0.9, 0.2, { running: false });
  walk.cam.look(1.2, 0, walk.now);
  const held = walk.cam.state.yaw;
  let later = walk.now;
  for (let frame = 0; frame < 2 * 60; frame += 1) {
    later += 1 / 60;
    walk.cam.update({ ...input, running: false }, later, 1 / 60);
  }
  assert.ok(turnOff(walk.cam.state.yaw, held) < 1e-6, 'the walking hold lasts');
});

test('camera: locked on a man, the run does not move the view (the lock frames both men)', () => {
  const cam = createFollowCam();
  const input = { me: [0, 1, 0], facing: 0, down: false, foe: [4, 1, 0], moving: false, running: true, speed: 4, aspect: 16 / 9 };
  cam.update(input, 0, 1 / 60);
  const yaw = cam.state.yaw;
  for (let frame = 0; frame < 120; frame += 1) cam.update({ ...input, facing: 1.2 }, frame / 60, 1 / 60);
  assert.ok(turnOff(cam.state.yaw, yaw) < 0.05);
});

// ---- 4. Steering along walls ---------------------------------------------------------------------------------------------

test('feelers: free distance per angle by the physics\' own test, the wall\'s normal, and a drop felt as an edge', () => {
  const terrain = createTerrain([slabOf([0, 0], [20, 20], 0), wallOf([5, 0], [0.4, 10], 0, 3)]);
  const [ahead, side, away, ledge] = feelers(terrain, [2, 0], [1, 0], 0, [0, Math.PI / 2, Math.PI, 0], { reach: 4 });
  assert.ok(ahead.free > 2.2 && ahead.free < 2.7, `a wall 2.8 m off less the body\'s radius (${ahead.free.toFixed(2)} m)`);
  assert.ok(ahead.normal[0] < -0.9, 'pushing back at him');
  assert.equal(side.free, 4, 'clear to the side');
  assert.equal(side.normal, null);
  assert.equal(away.free, 4);
  assert.equal(ledge.edge, false);
  const edge = createTerrain([slabOf([0, 0], [10, 10], 0)]);
  const [drop] = feelers(edge, [3, 0], [1, 0], 0, [0], { reach: 4 });
  assert.equal(drop.edge, true);
  assert.ok(drop.free > 1.4 && drop.free < 2.1, `the edge at 5 m (${drop.free.toFixed(2)} m)`);
});

/** A runner in the test yard's maze side: the wall z = -3 (x 6..17); `dir` the key stick's way; returns the path. */
function runAtWall(degrees, { lock = false, seconds = 5 } = {}) {
  const game = yard('forger', [7, -1]);
  const angle = (-degrees * Math.PI) / 180;
  const dir = [Math.cos(angle), Math.sin(angle)];
  const path = [];
  game.orders.keyStick = { dir, amount: 1 };
  if (lock) askRunLock(game.orders, true);
  const began = game.world.time;
  game.step(seconds, () => path.push([...hips(game.me), Math.hypot(...game.me.rootVelocity), game.world.time - began]));
  return { ...game, path };
}

test('wall steer: a runner aimed at a wall at 20 degrees slides along it at speed, clear of it, and on past the corner', () => {
  const run = runAtWall(20);
  const along = run.path.filter(([x]) => x > 9.5 && x < 17);
  assert.ok(along.length > 60, 'he travelled the wall');
  assert.ok(Math.min(...along.map((row) => row[2])) > 3.9, `at a sprint all the way along (${Math.min(...along.map((row) => row[2])).toFixed(2)} m/s at the slowest)`);
  assert.ok(Math.min(...along.map((row) => row[1])) > -2.42, `without touching the wall (nearest ${Math.min(...along.map((row) => row[1])).toFixed(2)}, the wall at -3, a body 0.3 + its half thickness 0.2)`);
  assert.ok(run.path.at(-1)[0] > 20, `ends past its end (x ${run.path.at(-1)[0].toFixed(1)})`);
});

test('wall steer: the locked run does the same, and goes on along the wall rather than aiming into it again', () => {
  const run = runAtWall(20, { lock: true, seconds: 3.2 });
  const along = run.path.filter(([x]) => x > 9.5 && x < 17);
  assert.ok(along.length > 40);
  assert.ok(Math.min(...along.map((row) => row[2])) > 3.9);
  assert.ok(Math.min(...along.map((row) => row[1])) > -2.42);
  assert.ok(run.path.at(-1)[0] > 17.5, 'past the end of the wall');
});

test('wall steer: straight into a wall he stops against it, and does not jitter there', () => {
  const run = runAtWall(90, { seconds: 4 });
  const settled = run.path.filter((row) => row[3] > 2.5);
  const xs = settled.map((row) => row[0]);
  const zs = settled.map((row) => row[1]);
  assert.ok(Math.max(...settled.map((row) => row[2])) < 0.15, 'at rest');
  assert.ok(Math.max(...xs) - Math.min(...xs) < 0.05 && Math.max(...zs) - Math.min(...zs) < 0.05, `still (${(Math.max(...xs) - Math.min(...xs)).toFixed(3)} by ${(Math.max(...zs) - Math.min(...zs)).toFixed(3)} m)`);
  assert.ok(Math.abs(settled[0][0] - 7) < 0.8, 'and not shunted along the wall');
});

test('wall steer: the bend fades to nothing as the stick points straight into the wall, and is full at a glance', () => {
  const terrain = createTerrain([slabOf([0, 0], [40, 40], 0), wallOf([0, 0], [20, 0.4], 0, 3)]);
  const bendAt = (degrees) => {
    const angle = (degrees * Math.PI) / 180;
    // (Heading up at the wall from the south, z < 0, `degrees` off its face.)
    const way = [Math.cos(angle), Math.sin(angle)];
    const felt = feelers(terrain, [0, -1.2], way, 0, [0, ...RUN_STEER.fan, ...RUN_STEER.fan.map((a) => -a)], { reach: 3 });
    return Math.abs(wantedBend(felt, way, RUN_STEER, 2.4).bend);
  };
  assert.ok(bendAt(90) < 0.05, `head on: ${bendAt(90).toFixed(3)} rad`);
  assert.ok(bendAt(80) < bendAt(40), 'less as he comes in nearer to the normal');
  assert.ok(bendAt(25) > 0.1, `glancing: ${bendAt(25).toFixed(2)} rad`);
});

test('wall steer: a bend that would run him off an edge is not made', () => {
  const terrain = createTerrain([slabOf([-5, -5], [20, 10], 0), wallOf([0, 0], [20, 0.4], 0, 3)]);
  const fighter = { root: [4.2, -1.6], lift: 0, rootVelocity: [3, 3], air: false };
  const world = { arena: { terrain } };
  const way = [Math.cos(1.1), Math.sin(1.1)];
  const free = runSteer(world, { ...fighter }, { bend: 0 }, way, 1 / 60, { drops: () => false });
  assert.ok(free[0] > way[0], 'on the flat he is bent along the wall');
  const state = { bend: -0.3 };
  const held = runSteer(world, { ...fighter }, state, way, 1 / 60, { drops: (dir) => dir[0] > way[0] + 1e-9 });
  assert.deepEqual(held, way, 'but not towards the drop');
  assert.equal(state.bend, 0);
});

test('wall steer: off in a world with no terrain, and for a man in the air', () => {
  const way = [1, 0];
  assert.deepEqual(runSteer({ arena: {} }, { root: [0, 0], rootVelocity: [0, 0] }, { bend: 0.4 }, way, 1 / 60), way);
  const terrain = createTerrain([slabOf([0, 0], [20, 20], 0), wallOf([1, 0], [0.4, 10], 0, 3)]);
  assert.deepEqual(runSteer({ arena: { terrain } }, { root: [0, 0], rootVelocity: [0, 0], lift: 0, air: true }, { bend: 0 }, way, 1 / 60), way);
});

test('stair steer: pushing along a stair bends the heading to its line; across it, not', () => {
  const along = { way: [0, 1], steep: 0.3 };
  const up = stairBend(along, [0.5, 0.87]);
  assert.ok(up > 0.3 && up < 0.6, `pushing up and a little to the side of the stair\'s line: turned back to it (${up.toFixed(2)} rad)`);
  assert.ok(Math.abs(stairBend(along, [1, 0])) < 1e-6, 'straight across the stair: left alone');
  const down = stairBend(along, [0.3, -0.95]);
  assert.ok(down !== 0 && Math.sign(down) === Math.sign(Math.atan2(-1, 0) - Math.atan2(-0.95, 0.3)), 'pushing down, it bends towards down the stair');
  assert.equal(stairBend(null, [1, 0]), 0);
});

// ---- The winding stair of Dunnottar's tower -----------------------------------------------------------------------------

const SPIRAL = stairsOfStage(DUNNOTTAR).find((stair) => stair.winding);

/**
 * The player runs the winding stair with a steady push "ahead": the camera behind him, so the stick is the way he faces
 * (`follow`), or a locked run. Returns { reached (s), ok, stuck (s) }.
 */
function runSpiral(dir, { lock = false, steer = true, seconds = 45 } = {}) {
  const route = dir === 'up' ? SPIRAL.route : [...SPIRAL.route].reverse();
  const yaw = Math.atan2(-(route[1][1] - route[0][1]), route[1][0] - route[0][0]);
  const { world, me } = lone(DUNNOTTAR, 'forger', 1, route[0], dir === 'up' ? SPIRAL.floor : SPIRAL.top, yaw);
  const orders = newOrders();
  if (!steer) orders.runSteer = { get bend() { return 0; }, set bend(value) {} };
  const goalLift = dir === 'up' ? SPIRAL.top : SPIRAL.floor;
  let stuck = 0;
  let last = [...me.root];
  for (let frame = 0; frame < seconds * 60; frame += 1) {
    if (lock) {
      if (frame === 0) askRunLock(orders, true);
    } else orders.keyStick = { dir: [Math.cos(me.yaw), -Math.sin(me.yaw)], amount: 1 };
    advance(world, 1 / 60, (current, dt) => {
      updateStage(current);
      directFighter(current, me, orders, dt);
    });
    if (frame % 60 === 59) {
      if (Math.hypot(me.root[0] - last[0], me.root[1] - last[1]) < 0.5) stuck += 1;
      last = [...me.root];
    }
    if (Math.abs((me.lift ?? 0) - goalLift) < (dir === 'up' ? 0.4 : 0.5)) return { reached: world.time, ok: me.state === 'up', stuck, me };
  }
  return { reached: null, ok: false, stuck, me };
}

test('winding stair: a steady push up the tower stair carries him to the top without sticking at the wall', () => {
  assert.ok(SPIRAL, 'the stage has the winding stair');
  const up = runSpiral('up');
  assert.ok(up.reached !== null, `reached the top (stuck ${up.stuck} s)`);
  assert.ok(up.ok && up.stuck <= 1, `on his feet, never held at the wall (stuck ${up.stuck} s)`);
  assert.ok(up.reached < 30, `in ${up.reached.toFixed(0)} s: 85 treads of a 4 m/s sprint`);
});

test('winding stair: and down it, and by a locked run both ways', () => {
  const down = runSpiral('down');
  assert.ok(down.reached !== null && down.ok && down.stuck <= 1, `down: ${down.reached}`);
  const lockedUp = runSpiral('up', { lock: true });
  assert.ok(lockedUp.reached !== null && lockedUp.ok, `a locked run reaches the top (${lockedUp.reached})`);
  const lockedDown = runSpiral('down', { lock: true });
  assert.ok(lockedDown.reached !== null && lockedDown.ok, `and the bottom (${lockedDown.reached})`);
});

test('winding stair: without the steering the same push is held at the wall (the steer is what does it)', () => {
  const up = runSpiral('up', { steer: false, seconds: 25 });
  assert.equal(up.reached, null);
});

// ---- 5. The pose of a sprint turn ------------------------------------------------------------------------------------

/** The player running +x then turning to `degrees` (positive: towards +z); returns what the pose did. */
function sprintTurn(degrees, { off = false } = {}) {
  const saved = { ...WORLD.runMode.turn };
  if (off) Object.assign(WORLD.runMode.turn, { bank: 0, lead: 0, hipLag: 0, gap: 0, inner: 0, wide: 0, outer: 0 });
  try {
    const game = yard('forger', [-10, 0]);
    const out = { crossed: 0, closest: Infinity, rollAtTurn: 0 };
    const angle = (degrees * Math.PI) / 180;
    for (let frame = 0; frame < 4 * 60; frame += 1) {
      game.orders.keyStick = { dir: frame < 90 ? [1, 0] : [Math.cos(angle), Math.sin(angle)], amount: 1 };
      game.step(1 / 60);
      const velocity = game.me.rootVelocity;
      const speed = Math.hypot(velocity[0], velocity[1]);
      if (speed < 1) continue;
      const left = [-velocity[1] / speed, velocity[0] / speed];
      const lateral = (index) => (game.me.x[index * 3] - game.me.x[P.pelvis * 3]) * left[0] + (game.me.x[index * 3 + 2] - game.me.x[P.pelvis * 3 + 2]) * left[1];
      const gap = lateral(P.lFoot) - lateral(P.rFoot);
      if (gap < 0) out.crossed += 1;
      out.closest = Math.min(out.closest, gap);
      {
        const neck = toLocal(game.me, [game.me.x[P.neck * 3], game.me.x[P.neck * 3 + 1], game.me.x[P.neck * 3 + 2]]);
        const pelvis = toLocal(game.me, [game.me.x[P.pelvis * 3], game.me.x[P.pelvis * 3 + 1], game.me.x[P.pelvis * 3 + 2]]);
        const roll = Math.atan2(neck[2] - pelvis[2], neck[1] - pelvis[1]);
        if (Math.abs(roll) > Math.abs(out.rollAtTurn)) out.rollAtTurn = roll;
      }
    }
    return out;
  } finally {
    Object.assign(WORLD.runMode.turn, saved);
  }
}

test('sprint turn: the trunk banks into the turn, either way, and not in a straight run', () => {
  const left = sprintTurn(90);
  const right = sprintTurn(-90);
  // (Local +z is his left: a turn towards +z from +x is a turn to his left, the lean towards +z.)
  assert.ok(left.rollAtTurn > 0.12, `leaning left into a left turn (${left.rollAtTurn.toFixed(2)} rad)`);
  assert.ok(right.rollAtTurn < -0.12, `and right into a right one (${right.rollAtTurn.toFixed(2)} rad)`);
  const old = sprintTurn(90, { off: true });
  assert.ok(left.rollAtTurn > old.rollAtTurn + 0.06, `more than the old pose did (${old.rollAtTurn.toFixed(2)} rad)`);
  assert.ok(Math.abs(left.rollAtTurn) <= 0.5, 'but not toppling');
  const straight = yard('forger', [-10, 0]);
  straight.orders.keyStick = { dir: [1, 0], amount: 1 };
  straight.step(2);
  assert.ok(Math.abs(straight.me.turn) < 0.3, `no turn in a straight run (${straight.me.turn.toFixed(2)} rad/s)`);
});

test('sprint turn: the feet land to their own side of the line of travel, never crossing, in turns of 45, 90 and 160 degrees', () => {
  for (const degrees of [45, -45, 90, -90, 160, -160]) {
    const turn = sprintTurn(degrees);
    assert.equal(turn.crossed, 0, `${degrees} degrees: the feet crossed on ${turn.crossed} frames (closest ${turn.closest.toFixed(3)} m)`);
    assert.ok(turn.closest > 0.005, `${degrees} degrees: the closest the feet came ${turn.closest.toFixed(3)} m apart across the line`);
  }
  // A shallow turn crossed them before.
  const was = sprintTurn(45, { off: true });
  assert.ok(was.crossed > 0, 'the old footwork crossed his feet in a 45 degree turn');
});

test('sprint turn: AI fighters and Battle Mode men have none of it', () => {
  const game = yard('forger', [-10, 0]);
  game.step(1);
  assert.equal(game.world.fighters[1].turn, undefined);
  assert.equal(game.world.fighters[1].yawWas, undefined);
});
