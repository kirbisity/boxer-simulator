// The player's run mode (control.js runStep, physics.js runPose): a real running gait, held on the stick
// or the keys (there is no run lock), and the player turning only to a man near him. Generic: Battle Mode and Level Mode alike.

import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { CONTROL, directFighter, keyStick, newOrders } from '../src/control.js';
import { advance, createWorld, placeFighter, placeOnFloor } from '../src/physics.js';
import { runSpeed } from '../src/physics/gait.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { TESTYARD } from '../src/levelmode/stages/testyard.js';
import { stageThink, updateStage } from '../src/levelmode/stage.js';
import { createLevelWorld, levelThink } from '../src/levelmode/level.js';

const AHEAD = { ahead: [1, 0], right: [0, 1] };
const hips = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
const turnBetween = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** A duel with red played and blue standing still, `distance` m apart (Battle Mode: no stage). */
function duel(distance, red = PRESETS.heavy) {
  const world = createWorld([{ inputs: structuredClone(red), corner: 'red' }, { inputs: structuredClone(PRESETS.light), corner: 'blue' }], { seed: 4 });
  const orders = newOrders();
  placeFighter(world.fighters[0], -distance / 2);
  placeFighter(world.fighters[1], distance / 2);
  const step = (seconds) => advance(world, seconds, (current, dt) => {
    thinkAll(current, dt, new Set([0, 1]));
    directFighter(current, current.fighters[0], orders, dt);
  });
  return { world, orders, me: world.fighters[0], him: world.fighters[1], step };
}

/** The test yard (Level Mode) with the player on open flat ground, nobody awake near; a preset for the player's body. */
function yard(preset = 'forger') {
  const world = createLevelWorld(TESTYARD, levelPreset(preset), { seed: 3 });
  const me = world.fighters[0];
  placeOnFloor(me, -19, -2, 0, 0);
  updateStage(world, true);
  const orders = newOrders();
  const step = (seconds) => advance(world, seconds, (current, dt) => {
    stageThink(current, dt);
    levelThink(current, dt);
    directFighter(current, me, orders, dt);
  });
  return { world, orders, me, step };
}

/** Metres a second over `seconds` after a start of `start` s. */
function speedOver(game, seconds = 1.5, start = 0.8) {
  game.step(start);
  const from = hips(game.me);
  game.step(seconds);
  const to = hips(game.me);
  return Math.hypot(to[0] - from[0], to[1] - from[1]) / seconds;
}

test('facing: a man far off is not squared up to; one near is; one locked on always is', () => {
  const far = duel(9);
  far.me.yaw = Math.PI / 2;
  far.step(1);
  assert.ok(turnBetween(far.me.yaw, Math.PI / 2) < 0.05, 'standing, he keeps his heading with his man 9 m away');
  const near = duel(3.5);
  near.me.yaw = Math.PI / 2;
  near.step(1.2);
  assert.ok(turnBetween(near.me.yaw, 0) < 0.2, 'with his man 3.5 m away he turns to him');
  // Locked on, wherever the man is.
  const locked = duel(9);
  locked.me.yaw = Math.PI / 2;
  locked.orders.lock = 1;
  locked.step(1.2);
  assert.ok(turnBetween(locked.me.yaw, 0) < 0.2, 'locked on, he faces his man across the ring');
});

test('facing: running with the man far off, he faces the way he runs, not the man', () => {
  const game = duel(9);
  // Run across the ring (+z), the man to the side (+x).
  game.orders.keyStick = keyStick(new Set(['d']), AHEAD, true);
  game.step(0.9);
  assert.equal(game.me.runMode, true);
  const heading = Math.atan2(-1, 0);
  assert.ok(turnBetween(game.me.yaw, heading) < 0.25, `facing the run, not the man (yaw ${game.me.yaw.toFixed(2)})`);
  // The same run, locked on: he keeps facing the man, as before.
  const locked = duel(9);
  locked.orders.lock = 1;
  locked.orders.keyStick = keyStick(new Set(['d']), AHEAD, true);
  locked.step(0.9);
  assert.ok(turnBetween(locked.me.yaw, 0) < 0.3, 'locked on, running round him, he still faces him');
});

test('facing: in a level, only a man aware of him counts as near', () => {
  const game = yard();
  const sentry = game.world.fighters.find((fighter) => fighter.spawn?.id === 'sentry1');
  // The sentry stands 3 m off with his back turned and has not noticed him: the player does not turn to him.
  placeOnFloor(sentry, -16, 3, 0, 0);
  placeOnFloor(game.me, -19, 3, 0, Math.PI / 2);
  game.me.rootVelocity = [0, 0];
  game.world.stage.aware.minds[sentry.id].state = 'idle';
  game.step(0.6);
  game.world.stage.aware.minds[sentry.id].state = 'idle';
  assert.ok(turnBetween(game.me.yaw, Math.PI / 2) < 0.3, 'an unaware man 3 m off is not faced');
  // Once he has seen him, he is.
  game.world.stage.aware.minds[sentry.id].state = 'aggro';
  game.step(1);
  const toward = Math.atan2(-(hips(sentry)[1] - hips(game.me)[1]), hips(sentry)[0] - hips(game.me)[0]);
  assert.ok(turnBetween(game.me.yaw, toward) < 0.35, 'an aware man 3 m off is');
});

test('run mode: a real gait, as fast as his body runs (physics/gait.js), for the forger and a man in plate', () => {
  const rows = [];
  for (const key of ['forger', 'dunnottarKnight']) {
    const walking = yard(key);
    walking.orders.keyStick = keyStick(new Set(['w']), AHEAD, false);
    const combat = speedOver(walking);
    const running = yard(key);
    running.orders.keyStick = keyStick(new Set(['w']), AHEAD, true);
    // (Up to speed first: a sprint takes a second or two to gather.)
    const sprint = speedOver(running, 1.5, 2.5);
    rows.push({ key, combat, sprint });
    assert.equal(running.me.runMode, true);
    assert.equal(running.me.state, 'up', `${key} stays on his feet at a run`);
    // Flat out: his body's sprint, well beyond the guard's footwork and an AI man's run.
    const top = runSpeed(running.me, true);
    assert.ok(Math.abs(sprint / top - 1) < 0.12, `${key}: ${sprint.toFixed(2)} m/s against his body's ${top.toFixed(2)}`);
    assert.ok(sprint > combat * 3, `${key}: ${sprint.toFixed(2)} m/s run against ${combat.toFixed(2)} m/s in the guard stance`);
    assert.ok(sprint > runSpeed(running.me, false) * 1.3, `${key}: noticeably quicker than the AI's run`);
  }
  assert.ok(rows[0].sprint > 5 && rows[0].sprint < 8.5, `the forger sprints at a man's pace (${rows[0].sprint.toFixed(2)} m/s)`);
  assert.ok(rows[1].sprint < rows[0].sprint * 0.75, 'a man in plate is slower than one in a gambeson');
});

test('run mode: no guard, the weapon carried low, the trunk leaned; back in the guard on stopping', () => {
  const game = yard();
  const hand = () => game.me.x[P[`${game.me.weapon.main}Hand`] * 3 + 1];
  game.step(0.5);
  const ready = hand();
  const lean = () => (game.me.x[P.neck * 3] - game.me.x[P.pelvis * 3]) * Math.cos(game.me.yaw) - (game.me.x[P.neck * 3 + 2] - game.me.x[P.pelvis * 3 + 2]) * Math.sin(game.me.yaw);
  const upright = lean();
  game.orders.keyStick = keyStick(new Set(['w']), AHEAD, true);
  game.orders.guard = false;
  game.step(1.2);
  assert.equal(game.me.runMode, true);
  assert.ok(game.me.runPose > 0.9, 'the run pose is in');
  assert.equal(game.me.defence, null, 'nothing guarded while running');
  assert.ok(hand() < ready - 0.05, `the weapon hand carried low (${hand().toFixed(2)} against ${ready.toFixed(2)} ready)`);
  assert.ok(game.me.weapon.dir[1] < 0.2, 'a short blade hangs, not held up');
  assert.ok(lean() > upright + 0.04, `the trunk leans into the run (${lean().toFixed(2)} m of neck over the hips against ${upright.toFixed(2)})`);
  // Asking for the guard stops the run and puts the guard up.
  game.orders.guard = true;
  game.step(0.5);
  assert.equal(game.me.runMode, false);
  assert.ok(game.me.defence, 'the guard comes up');
  game.orders.guard = false;
  game.orders.keyStick = null;
  game.step(1.2);
  assert.equal(game.me.runPose, 0, 'the pose is the guard again');
  assert.ok(hand() > ready - 0.04, 'the weapon back in the guard');
});

test('run mode costs breath, modestly, and a winded man runs no more until he has some back', () => {
  const game = yard();
  game.orders.keyStick = keyStick(new Set(['w']), AHEAD, true);
  game.step(3);
  const used = 1 - game.me.stamina;
  assert.ok(used > 0.005 && used < 0.1, `three seconds of running takes a little stamina (${used.toFixed(3)})`);
  game.me.stamina = 0.01;
  game.step(0.2);
  assert.equal(game.me.runMode, false, 'winded: no run');
  assert.ok(game.me.move > 0, 'he still walks on');
  game.me.stamina = 0.3;
  game.step(0.2);
  assert.equal(game.me.runMode, true, 'with some breath back, he runs again');
});

test('drag only: the stick held at a run keeps him running, and letting go stops him (there is no lock)', () => {
  const game = yard();
  game.orders.stick = { dir: [1, 0], amount: 1 };
  game.step(1.5);
  assert.equal(game.me.runMode, true, 'running while the stick is held out');
  assert.equal(game.orders.runLock, undefined, 'no run lock in the orders');
  game.orders.stick = null;
  game.step(0.2);
  assert.equal(game.me.runMode, false, 'finger lifted: no run');
  const from = hips(game.me);
  game.step(1.5);
  const to = hips(game.me);
  // (He brakes as his legs can (physics/gait.js): a few strides from a sprint, not dead in his tracks.)
  assert.ok(to[0] - from[0] < 3, `and he comes to rest (${(to[0] - from[0]).toFixed(2)} m in 1.5 s)`);
  assert.ok(Math.hypot(...game.me.rootVelocity) < 0.3, 'standing');
});

test('drag only: the stick steers the run, wherever it is put down; Shift on the keys alike', () => {
  const game = yard();
  // (On the open flat east of the yard's stairs: a man running up a stair is held to the pace of the climb, and +z from the west end is its winding stair.)
  placeOnFloor(game.me, 0, -4, 0, 0);
  updateStage(game.world, true);
  game.orders.stick = { dir: [1, 0], amount: 1 };
  game.step(1.2);
  game.orders.stick = { dir: [0, 1], amount: 1 };
  game.step(1.2);
  assert.equal(game.me.runMode, true);
  assert.ok(game.me.rootVelocity[1] > 2, 'running along +z with the stick put that way');
  const keys = yard();
  keys.orders.keyStick = keyStick(new Set(['w']), AHEAD, true);
  keys.step(1);
  assert.equal(keys.me.runMode, true, 'Shift and W run');
  keys.orders.keyStick = keyStick(new Set(['w']), AHEAD, false);
  keys.step(0.1);
  assert.equal(keys.me.runMode, false, 'Shift let go: a walk');
});

test('drag only: the guard, an attack or a blow stop a run held on the stick; an attack holds it off until the stick is eased back', () => {
  const running = () => {
    const game = yard();
    game.orders.stick = { dir: [1, 0], amount: 1 };
    game.step(1);
    assert.ok(game.me.runMode, 'running');
    return game;
  };
  const guard = running();
  guard.orders.guard = true;
  guard.step(0.1);
  assert.equal(guard.me.runMode, false, 'the guard: no run');
  const attack = running();
  const thrown = attack.me.stats.thrown;
  attack.orders.requests.push({ at: attack.world.time, line: 'mid', strength: 'quick' });
  attack.step(0.15);
  assert.equal(attack.me.runMode, false, 'an attack: no run');
  assert.ok(attack.me.stats.thrown > thrown || attack.me.punch, 'and it is thrown');
  attack.step(0.5);
  assert.equal(attack.me.runMode, false, 'and the stick must be eased off before he runs again');
  attack.orders.stick = { dir: [1, 0], amount: 0.5 };
  attack.step(0.1);
  attack.orders.stick = { dir: [1, 0], amount: 1 };
  attack.step(0.3);
  assert.equal(attack.me.runMode, true, 'eased off and pushed out again: a run');
  const hit = running();
  hit.me.stagger = 0.4;
  hit.step(0.1);
  assert.equal(hit.me.runMode, false, 'reeling from a blow: no run');
});

test('Battle Mode: the AI is untouched by it; a fighter nobody plays never has the player-only flags', () => {
  const world = createWorld([{ inputs: structuredClone(PRESETS.heavy), corner: 'red' }, { inputs: structuredClone(PRESETS.light), corner: 'blue' }], { seed: 2 });
  advance(world, 3, (current, dt) => thinkAll(current, dt));
  for (const fighter of world.fighters) {
    assert.equal(fighter.runMode, undefined);
    assert.equal(fighter.faceFoe, undefined);
    assert.equal(fighter.runPose, undefined);
  }
});
