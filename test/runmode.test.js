// The player's run mode (control.js runStep, physics.js runPose): a real running gait, locked on with a held
// stick or the keys, and the player turning only to a man near him. Generic: Battle Mode and Level Mode alike.

import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { askRunLock, CONTROL, directFighter, keyStick, newOrders } from '../src/control.js';
import { advance, createWorld, placeFighter, placeOnFloor } from '../src/physics.js';
import { WORLD } from '../src/physics/config.js';
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

/** Metres a second over `seconds` after a short start. */
function speedOver(game, seconds = 1.5) {
  game.step(0.8);
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

test('run mode: a real gait, quicker than the guard by the configured factor, for the forger and a man in plate', () => {
  const rows = [];
  for (const key of ['forger', 'dunnottarKnight']) {
    const walking = yard(key);
    walking.orders.keyStick = keyStick(new Set(['w']), AHEAD, false);
    const combat = speedOver(walking);
    const running = yard(key);
    running.orders.keyStick = keyStick(new Set(['w']), AHEAD, true);
    const sprint = speedOver(running);
    rows.push({ key, combat, sprint });
    assert.equal(running.me.runMode, true);
    assert.equal(running.me.state, 'up', `${key} stays on his feet at a run`);
    // The ratio is the config's: the legs and the gear scale both alike.
    assert.ok(Math.abs(sprint / combat / WORLD.runMode.speedFactor - 1) < 0.2, `${key}: ${sprint.toFixed(2)} m/s run against ${combat.toFixed(2)} m/s in the guard stance`);
    assert.ok(sprint > combat * WORLD.run.speedFactor * 1.3, `${key}: noticeably quicker than the AI's run`);
  }
  assert.ok(rows[0].sprint > 3.5 && rows[0].sprint < 7, `the forger sprints at a man's pace (${rows[0].sprint.toFixed(2)} m/s)`);
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
  assert.ok(used > 0.05 && used < 0.4, `three seconds of running takes some stamina (${used.toFixed(2)})`);
  game.me.stamina = 0.01;
  game.step(0.2);
  assert.equal(game.me.runMode, false, 'winded: no run');
  assert.ok(game.me.move > 0, 'he still walks on');
  game.me.stamina = 0.3;
  game.step(0.2);
  assert.equal(game.me.runMode, true, 'with some breath back, he runs again');
});

test('run lock: the stick held at a run for a moment locks it; the finger lifts and he runs on', () => {
  const game = yard();
  game.orders.stick = { dir: [1, 0], amount: 1 };
  game.step(CONTROL.run.lockHold * 0.6);
  assert.equal(game.orders.runLock, null, 'not yet: a dash is not a lock');
  game.step(CONTROL.run.lockHold * 0.6 + 0.1);
  assert.ok(game.orders.runLock, 'held long enough: locked');
  game.orders.stick = null;
  const from = hips(game.me);
  game.step(1.5);
  const to = hips(game.me);
  assert.ok(to[0] - from[0] > 3.5, `he ran on with no finger on the stick (${(to[0] - from[0]).toFixed(1)} m in 1.5 s)`);
  assert.equal(game.me.runMode, true);
  assert.ok(game.orders.runLock, 'still locked');
});

test('run lock: steered by the stick smoothly, wherever it is put down', () => {
  const game = yard();
  game.orders.stick = { dir: [1, 0], amount: 1 };
  game.step(1.2);
  game.orders.stick = null;
  game.step(0.3);
  // A drag to the side steers him round (+z), over a moment and not at once.
  game.orders.stick = { dir: [0, 1], amount: 0.6 };
  game.step(0.1);
  const turned = game.orders.runLock.dir;
  assert.ok(turned[1] > 0 && turned[1] < 0.9, `the heading begins to turn, not snaps (${turned.map((value) => value.toFixed(2))})`);
  game.step(0.8);
  assert.ok(game.orders.runLock.dir[1] > 0.99, 'and reaches the stick');
  game.orders.stick = null;
  game.step(0.6);
  const velocity = game.me.rootVelocity;
  assert.ok(velocity[1] > 2, 'running along +z after the stick is let go again');
  assert.ok(game.orders.runLock, 'steering does not end the lock');
});

test('run lock: pulling back, the guard, an attack, a lock on a man or a tap end it', () => {
  const lockIn = () => {
    const game = yard();
    game.orders.stick = { dir: [1, 0], amount: 1 };
    game.step(1);
    game.orders.stick = null;
    game.step(0.2);
    assert.ok(game.orders.runLock && game.me.runMode, 'locked and running');
    return game;
  };
  const back = lockIn();
  back.orders.stick = { dir: [-1, 0], amount: 0.8 };
  back.step(0.1);
  assert.equal(back.orders.runLock, null, 'pulled back: ended');
  const guard = lockIn();
  guard.orders.guard = true;
  guard.step(0.1);
  assert.equal(guard.orders.runLock, null, 'the guard: ended');
  assert.equal(guard.me.runMode, false);
  const attack = lockIn();
  const thrown = attack.me.stats.thrown;
  attack.orders.requests.push({ at: attack.world.time, line: 'mid', strength: 'quick' });
  attack.step(0.15);
  assert.equal(attack.orders.runLock, null, 'an attack: ended');
  assert.ok(attack.me.stats.thrown > thrown || attack.me.punch, 'and it is thrown');
  const lockOn = lockIn();
  lockOn.orders.lock = 2;
  lockOn.step(0.1);
  assert.equal(lockOn.orders.runLock, null, 'locking on a man: ended');
  const hit = lockIn();
  hit.me.stagger = 0.4;
  hit.step(0.1);
  assert.equal(hit.orders.runLock, null, 'reeling from a blow: ended');
});

test('run lock: never carries him off a ledge or into the sea; the lock ends short of the edge', () => {
  const game = yard();
  placeOnFloor(game.me, -19, 3, 0, -Math.PI / 2);
  game.orders.stick = { dir: [0, 1], amount: 1 };
  game.step(1);
  game.orders.stick = null;
  game.step(3);
  assert.equal(game.orders.runLock, null, 'the lock let go at the cliff');
  assert.equal(game.me.state, 'up');
  assert.ok(game.me.x[P.pelvis * 3 + 1] > 0.5, 'still on the ground, not falling into the sea');
  assert.ok(hips(game.me)[1] < 11, `he stopped on the ground (z ${hips(game.me)[1].toFixed(1)}; the yard ends at 11)`);
});

test('run lock on the keyboard: asked for (Shift+R, a double tap on forward), kept with the keys let go, ended by back', () => {
  const game = yard();
  game.orders.keyStick = keyStick(new Set(['w']), AHEAD, false);
  game.step(0.3);
  askRunLock(game.orders);
  game.step(0.1);
  assert.ok(game.orders.runLock, 'toggled on');
  game.orders.keyStick = null;
  game.step(1);
  assert.equal(game.me.runMode, true, 'running with no key held');
  // A key to the side steers.
  game.orders.keyStick = keyStick(new Set(['d']), AHEAD, false);
  game.step(1);
  assert.ok(game.orders.runLock.dir[1] > 0.9, 'D turned him');
  game.orders.keyStick = keyStick(new Set(['a']), AHEAD, false);
  game.step(0.1);
  assert.equal(game.orders.runLock, null, 'a key back against his heading ends it');
  // Toggled off by the same key.
  const again = yard();
  askRunLock(again.orders, true);
  again.step(0.2);
  assert.ok(again.orders.runLock, 'asked on with nothing held: he runs the way he faces');
  askRunLock(again.orders);
  again.step(0.1);
  assert.equal(again.orders.runLock, null, 'toggled off');
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
