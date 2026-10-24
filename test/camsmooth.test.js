// How smooth the camera is (the measures: tools/camjerk.js): the follow camera (followcam.js) and the arm (cameraarm.js) move by critically
// damped springs, so the same motion comes out at 30, 60 or 144 frames a second, nothing overshoots, the arm's length and its turn have no
// steps but the one that keeps the camera out of a wall, the arm keeps the direction it took, a cut starts it at once where it should be,
// and the player's own drag of the view is his at once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARM, createArm } from '../src/cameraarm.js';
import { createFollowCam, FOLLOW_CAM, spring } from '../src/followcam.js';
import { createTerrain, slabOf, terrainWorld, wallOf } from '../src/physics/terrain.js';

const place = (...solids) => terrainWorld(createTerrain([slabOf([0, 0], [120, 120], 0, { id: 'floor' }), ...solids]));
const wanted = (over = {}) => ({ target: [0, 1.45, 0], yaw: Math.PI / 2, pitch: 0.26, distance: 4.2, ...over });

/**
 * Run `step(dt, t)` (a frame that ends at time t) for `seconds` at `fps`; what it returns (a number, or an object of numbers and arrays of
 * numbers) read every 0.05 s, between the frames on either side (so that 144 fps, whose frames do not fall on the 20ths, compares).
 */
function sampled(fps, seconds, step) {
  const dt = 1 / fps;
  const frames = [[0, null]];
  for (let frame = 1; frame <= Math.round(seconds * fps); frame += 1) frames.push([frame * dt, step(dt, frame * dt)]);
  const mix = (x, y, u) => (typeof x === 'number' ? x + (y - x) * u : Array.isArray(x) ? x.map((v, k) => mix(v, y[k], u)) : Object.fromEntries(Object.keys(x).map((k) => [k, mix(x[k], y[k], u)])));
  const out = [];
  for (let t = 0.1; t <= seconds - dt + 1e-9; t += 0.05) {
    const i = frames.findIndex(([time]) => time >= t - 1e-9);
    const [t0, v0] = frames[i - 1];
    const [t1, v1] = frames[i];
    out.push(v0 === null ? v1 : mix(v0, v1, (t - t0) / (t1 - t0)));
  }
  return out;
}

test('spring: critically damped, exact for any dt (the same path at 30, 60 and 144 frames a second) and never past its goal', () => {
  const run = (fps) => {
    let state = [0, 0];
    return sampled(fps, 2, (dt) => (state = spring(state[0], state[1], 1, 6, dt))[0]);
  };
  const [a, b, c] = [run(30), run(60), run(144)];
  for (let i = 0; i < Math.min(a.length, b.length, c.length); i += 1) {
    assert.ok(Math.abs(a[i] - b[i]) < 0.01 && Math.abs(c[i] - b[i]) < 0.01, `sample ${i}: ${a[i]} ${b[i]} ${c[i]}`);
    assert.ok(b[i] <= 1 + 1e-9, 'no overshoot');
  }
});

test('follow camera: a man walking and turning is followed along the same path at 30, 60 and 144 fps, its look point not lagging him by metres', () => {
  const man = (t) => {
    const x = t < 2 ? t * 4 : 8 + Math.sin((t - 2) * 0.8) * 3;
    const z = t < 2 ? 0 : (1 - Math.cos((t - 2) * 0.8)) * 3;
    return [x, 1, z];
  };
  const run = (fps) => {
    const cam = createFollowCam();
    return sampled(fps, 5, (dt, t) => {
      const me = man(t);
      const ahead = man(t + 0.01);
      const facing = Math.atan2(-(ahead[2] - me[2]), ahead[0] - me[0]);
      const view = cam.update({ me, facing, down: false, foe: null, moving: true, running: true, speed: 4, aspect: 16 / 9 }, t, dt);
      return { view, me };
    });
  };
  const [a, b, c] = [run(30), run(60), run(144)];
  for (let i = 4; i < Math.min(a.length, b.length, c.length); i += 1) {
    for (const other of [a, c]) {
      const d = Math.hypot(...other[i].view.target.map((v, k) => v - b[i].view.target[k]));
      assert.ok(d < 0.1, `sample ${i}: the look point differs by ${d.toFixed(3)} m`);
      assert.ok(Math.abs(other[i].view.yaw - b[i].view.yaw) < 0.02, `sample ${i}: the yaw`);
    }
    // (4 m/s: the old look point was 1.4 m behind a man running; the lead makes most of that up.)
    const lag = Math.hypot(b[i].view.target[0] - b[i].me[0], b[i].view.target[2] - b[i].me[2]);
    assert.ok(lag < FOLLOW_CAM.shoulder + 0.7, `sample ${i}: the look point ${lag.toFixed(2)} m from him`);
  }
});

test('follow camera: the arm\'s subject is his chest where he is, its height without the bob of his stride', () => {
  const cam = createFollowCam();
  let spread = [Infinity, -Infinity];
  for (let frame = 0; frame < 300; frame += 1) {
    const t = frame / 60;
    // A run's bob: 4 cm at 2.8 Hz.
    const view = cam.update({ me: [t * 6, 1 + Math.sin(t * 2.8 * Math.PI * 2) * 0.04, 0], facing: 0, down: false, foe: null, moving: true, running: true, speed: 6, velocity: [6, 0, 0], aspect: 16 / 9 }, t, 1 / 60);
    assert.ok(Math.abs(view.subject[0] - t * 6) < 1e-9, 'where he is on the floor');
    if (frame > 60) spread = [Math.min(spread[0], view.subject[1]), Math.max(spread[1], view.subject[1])];
  }
  assert.ok(spread[1] - spread[0] < 0.04, `the subject's height moves ${(spread[1] - spread[0]).toFixed(3)} m (the bob is 0.08)`);
});

test('follow camera: a hairpin at a sprint swings the view round no faster than its cap', () => {
  const cam = createFollowCam();
  let last = null;
  let fastest = 0;
  for (let frame = 0; frame < 180; frame += 1) {
    const t = frame / 60;
    const view = cam.update({ me: [0, 1, 0], facing: frame < 30 ? 0 : 2.0, down: false, foe: null, moving: true, running: true, speed: 7, aspect: 16 / 9 }, t, 1 / 60);
    if (last !== null) fastest = Math.max(fastest, Math.abs(view.yaw - last) * 60);
    last = view.yaw;
  }
  assert.ok(fastest <= FOLLOW_CAM.turnMost + 1e-6, `${fastest.toFixed(2)} rad/s`);
  assert.ok(fastest > FOLLOW_CAM.turnMost * 0.6, 'and it does turn');
});

test('follow camera: the player\'s drag of the view is his at once (1:1), and a reset lands the view behind him at once', () => {
  const cam = createFollowCam();
  const input = { me: [0, 1, 0], facing: 0, down: false, foe: null, moving: false, aspect: 16 / 9 };
  let view = cam.update(input, 0, 1 / 60);
  const yaw = view.yaw;
  cam.look(0.4, 0.1, 0.01);
  view = cam.update(input, 0.02, 1 / 60);
  assert.ok(Math.abs(view.yaw - (yaw + 0.4)) < 1e-9, 'turned by just what he dragged, this frame');
  cam.reset();
  view = cam.update({ ...input, me: [30, 1, 30], facing: Math.PI / 2 }, 0.03, 1 / 60);
  assert.ok(Math.hypot(view.target[0] - 30, view.target[2] - 30) < FOLLOW_CAM.shoulder + 0.01, 'at once on him after a cut');
});

/** The arm's lengths, sampled every 0.05 s, as a pillar comes between him and the camera (the camera's ball left in the open beyond it). */
function pillarRun(fps) {
  const arm = createArm();
  const open = place();
  const pillar = place(wallOf([0, 2.2], [1.2, 0.4], 0, 6));
  return sampled(fps, 2.5, (dt, t) => arm.solve(wanted(), t < 1 - 1e-9 ? open : pillar, dt).distance);
}

test('arm: a pillar between him and the camera pulls it in by a spring, the same at 30, 60 and 144 fps, with no overshoot and no step but the one across the pillar', () => {
  const [a, b, c] = [pillarRun(30), pillarRun(60), pillarRun(144)];
  // (Sample 18 is the moment the pillar comes, at 1 s: each rate sees it at the end of its own frame. And the camera, sprung in towards him, comes
  // to the pillar's back in a tenth of a second: it is not drawn through it but cut across it, in the frame it touches, which each rate finds
  // at its own frame's end: the samples by that cut are not compared either.)
  const cut = b.findIndex((value, i) => i > 18 && b[i - 1] - value > 0.5);
  for (let i = 0; i < Math.min(a.length, b.length, c.length); i += 1) {
    if (i === 18 || Math.abs(i - cut) <= 1) continue;
    assert.ok(Math.abs(a[i] - b[i]) < 0.25 && Math.abs(c[i] - b[i]) < 0.25, `sample ${i}: ${a[i].toFixed(2)} ${b[i].toFixed(2)} ${c[i].toFixed(2)}`);
  }
  const settled = b.at(-1);
  assert.ok(settled < 2, `in, short of the pillar (${settled.toFixed(2)} m)`);
  // In without overshoot (it only comes in, until the cut, and never nearer than the cut leaves it); at 144 fps no frame steps more than a spring of `blockRate` allows.
  for (let i = 19; i <= cut; i += 1) assert.ok(b[i] <= b[i - 1] + 1e-6, `sample ${i}: in, not out again`);
  assert.ok(b.slice(cut + 1).every((value) => value >= b[cut + 1] - 0.15), 'not much nearer than the cut left it (the arm turning round the pillar)');
  const arm = createArm();
  const lengths = [];
  for (let frame = 0; frame < 216; frame += 1) lengths.push(arm.solve(wanted(), frame < 43 ? place() : place(wallOf([0, 2.2], [1.2, 0.4], 0, 6)), 1 / 144).distance);
  const steps = lengths.slice(1).map((value, i) => Math.abs(value - lengths[i])).sort((x, y) => y - x);
  const most = (ARM.blockRate * 4.2 / Math.E) / 144 + 0.02;
  assert.ok(steps[1] < most, `the biggest step but the cut ${steps[1].toFixed(3)} m a frame (a spring's ${most.toFixed(3)})`);
  assert.ok(steps[0] < 0.4 + 2 * ARM.hardRadius + 0.3, `the cut across the pillar (0.4 m thick) ${steps[0].toFixed(2)} m`);
});

test('arm: the direction it takes is kept: a choice that flickers each frame between two ways is changed at most once in `hold` s', () => {
  // Two low walls close behind him, to either side in turn: either way out to one side is better than straight back, and they swap each frame.
  const left = place(wallOf([0, 1.4], [0.6, 0.4], 0, 8), wallOf([-1.2, 2.6], [0.4, 3], 0, 8));
  const right = place(wallOf([0, 1.4], [0.6, 0.4], 0, 8), wallOf([1.2, 2.6], [0.4, 3], 0, 8));
  const arm = createArm();
  const keys = [];
  for (let frame = 0; frame < 120; frame += 1) {
    arm.solve(wanted(), frame % 2 ? left : right, 1 / 60);
    keys.push(arm.state.key);
  }
  const changes = keys.slice(1).filter((key, i) => key !== keys[i]).length;
  assert.ok(changes <= Math.ceil(2 / ARM.hold) + 1, `${changes} changes of direction in 2 s`);
});

test('arm: a reset (a cut) starts it at once where it should be, not from where it was', () => {
  const arm = createArm();
  const near = place(wallOf([0, 2.5], [60, 0.6], 0, 6));
  for (let frame = 0; frame < 60; frame += 1) arm.solve(wanted(), near, 1 / 60);
  arm.reset();
  const seen = arm.solve(wanted({ target: [40, 1.45, 40] }), near, 1 / 60);
  assert.ok(Math.abs(seen.distance - 4.2) < 1e-6, `out at once in the open (${seen.distance.toFixed(2)})`);
});
