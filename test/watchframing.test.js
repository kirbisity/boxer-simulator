// The watching camera's auto-framing (watchcam.js stepAuto) and the big moments' push-in (drama.js): springs, not steps. A man
// flung out of the group, a man falling dead, the give and take of a pair do not snap or pump the zoom; the same path comes out at
// 30, 60 and 144 frames a second; the arm (cameraarm.js) is not pushed into a wall by a zoom that grows behind it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWatchCam, stepAuto, WATCH_CAM, weightedShare } from '../src/watchcam.js';
import { DRAMA, dramaLens, pushEnvelope } from '../src/drama.js';
import { createArm } from '../src/cameraarm.js';

const orbit = (extra = {}) => ({ yaw: -0.5, pitch: 0.3, distance: 8, target: { x: 0, y: 1.1, z: 0 }, ...extra });
const man = (id, x, z, extra = {}) => ({ id, x, y: 1.5, z, up: true, in: true, gone: false, ...extra });

/** Six men in two lines, `at(t)` moving them; the auto-framing run at `fps` for `seconds`, read every 0.05 s (between frames). */
function run(fps, seconds, at, options = {}) {
  const cam = createWatchCam();
  const view = orbit();
  const dt = 1 / fps;
  const samples = [];
  let last = null;
  for (let frame = 1; frame <= Math.round(seconds * fps); frame += 1) {
    const t = frame * dt;
    stepAuto(cam, view, at(t), dt, options);
    const now = { t, d: view.distance, x: view.target.x, z: view.target.z };
    // (A reading every 0.05 s, read between the frames on either side, so that 144 fps compares.)
    for (let mark = Math.ceil((last?.t ?? 0) / 0.05 + 1e-9) * 0.05; last && mark <= t + 1e-9; mark += 0.05) {
      const u = (mark - last.t) / (t - last.t);
      samples.push({ t: mark, d: last.d + (now.d - last.d) * u, x: last.x + (now.x - last.x) * u, z: last.z + (now.z - last.z) * u });
    }
    last = now;
  }
  return samples;
}

const lines = (t, flung = null) => [
  man(0, -1.2, -1), man(1, -1.2, 0), man(2, -1.2, 1),
  man(3, 1.2, -1), man(4, 1.2, 0), man(5, 1.2, 1),
].map((entry) => (flung && entry.id === flung.id && t >= flung.at - 1e-9 ? { ...entry, x: entry.x + flung.dx } : entry));

/** The largest change of speed (m/s) from one frame to the next of a series of values a frame apart. */
function largestKick(values, dt) {
  let most = 0;
  for (let index = 2; index < values.length; index += 1) {
    const before = (values[index - 1] - values[index - 2]) / dt;
    const after = (values[index] - values[index - 1]) / dt;
    most = Math.max(most, Math.abs(after - before));
  }
  return most;
}

test('weightedShare: the share of a weighted list, read between the values, all of them in a fight of two', () => {
  assert.equal(weightedShare([1, 3], [1, 1], 0.9), 3);
  assert.equal(weightedShare([5], [1], 0.9), 5);
  // Six: 0.9 of the way between the fifth and the sixth.
  assert.ok(Math.abs(weightedShare([1, 2, 3, 4, 5, 6], [1, 1, 1, 1, 1, 1], 0.9) - 5.9) < 1e-9);
  // A man of no weight is not counted.
  assert.equal(weightedShare([1, 2, 30], [1, 1, 0], 1), 2);
});

test('the first frame of a fight is a cut: the camera is on the men and at their framing at once, at rest', () => {
  const cam = createWatchCam();
  const view = orbit({ distance: 30, target: { x: 40, y: 1.1, z: -12 } });
  const men = lines(0);
  const { wanted } = stepAuto(cam, view, men, 1 / 60);
  assert.ok(Math.hypot(view.target.x, view.target.z) < 1e-6, 'on their middle');
  assert.ok(Math.abs(view.distance - wanted) < 1e-6, `${view.distance} ${wanted}`);
  stepAuto(cam, view, men, 1 / 60);
  assert.ok(Math.abs(view.distance - wanted) < 1e-6, 'and stays');
});

test('a man flung 3 m from the group in a frame: the zoom eases out with no step in its speed, and the frame stays with the men', () => {
  const dt = 1 / 60;
  const cam = createWatchCam();
  const view = orbit();
  const distances = [];
  const targets = [];
  for (let frame = 0; frame < 6 * 60; frame += 1) {
    stepAuto(cam, view, lines(frame * dt, { id: 5, at: 2, dx: 3 }), dt);
    distances.push(view.distance);
    targets.push(view.target.x);
  }
  // The flung man asks for more room: it is given, at no more than a few m/s and with no kick in speed (a first-order ease kicked by the whole of its rate).
  assert.ok(distances.at(-1) > distances[100] + 0.5, `drew back: ${distances[100]} to ${distances.at(-1)}`);
  // (Its speed as a share of the distance a second: what the eye reads as the speed of a zoom.)
  const speeds = distances.slice(1).map((value, index) => Math.abs(Math.log(value / distances[index])) / dt);
  assert.ok(Math.max(...speeds) < 0.6, `zoom speed ${Math.max(...speeds)} of the distance a second`);
  // (A first-order ease, as before, kicks the zoom's speed by its rate times the gap at once: some 10 m/s here.)
  assert.ok(largestKick(distances, dt) < 0.5, `zoom kick ${largestKick(distances, dt)} m/s in a frame`);
  assert.ok(largestKick(targets, dt) < 0.2, `look point kick ${largestKick(targets, dt)} m/s in a frame`);
});

test('the give and take of a fight (its extent breathing by 8 per cent) does not pump the zoom', () => {
  const dt = 1 / 60;
  const cam = createWatchCam();
  const view = orbit();
  const distances = [];
  for (let frame = 0; frame < 20 * 60; frame += 1) {
    const breathe = 1 + 0.08 * Math.sin(frame * dt * 2 * Math.PI * 0.7);
    stepAuto(cam, view, lines(0).map((entry) => ({ ...entry, x: entry.x * breathe, z: entry.z * breathe })), dt);
    distances.push(view.distance);
  }
  // After the first breath out, the distance held is the widest: no motion at all.
  const settled = distances.slice(3 * 60);
  assert.ok(Math.max(...settled) - Math.min(...settled) < 0.05, `the zoom moved ${Math.max(...settled) - Math.min(...settled)} m`);
});

test('the zoom draws back faster than it comes in, so the men are not left out of the picture', () => {
  const dt = 1 / 60;
  const timeTo = (from, to) => {
    const cam = createWatchCam();
    const view = orbit();
    stepAuto(cam, view, lines(0).map((entry) => ({ ...entry, x: entry.x * from })), dt);
    const start = view.distance;
    let goal = null;
    for (let frame = 1; frame < 30 * 60; frame += 1) {
      const result = stepAuto(cam, view, lines(0).map((entry) => ({ ...entry, x: entry.x * to })), dt);
      goal ??= result.held;
      if (Math.abs(Math.log(view.distance / goal)) < 0.1 * Math.abs(Math.log(start / goal))) return frame * dt;
    }
    return Infinity;
  };
  const out = timeTo(1, 4);
  const back = timeTo(4, 1);
  assert.ok(out < 2, `out in ${out} s`);
  assert.ok(back > out * 2.5, `in over ${back} s against out in ${out} s`);
});

test('a man killed leaves the framing over a few seconds, not in a frame; a pair\'s last fall stays framed', () => {
  const dt = 1 / 60;
  const cam = createWatchCam();
  const view = orbit();
  const xs = [];
  for (let frame = 0; frame < 8 * 60; frame += 1) {
    const men = lines(0).map((entry) => (entry.id === 5 ? { ...entry, x: 6, in: frame * dt < 1 } : entry));
    stepAuto(cam, view, men, dt);
    xs.push(view.target.x);
  }
  assert.ok(largestKick(xs, dt) < 0.1, `look point kick ${largestKick(xs, dt)} m/s in a frame`);
  const middleOfFive = (-1.2 * 3 + 1.2 * 2) / 5;
  assert.ok(Math.abs(xs.at(-1) - middleOfFive) < 0.05, `on the men still fighting: ${xs.at(-1)}`);
  assert.ok(xs[Math.round(1.5 * 60)] > middleOfFive + 0.3, 'not at once');
  // A duel's knockout: one man left; the fallen man keeps his place in the picture.
  const duel = createWatchCam();
  const pairView = orbit({ distance: 5.2 });
  for (let frame = 0; frame < 6 * 60; frame += 1) stepAuto(duel, pairView, [man(0, -0.8, 0), man(1, 0.8, 0, { in: frame < 60 })], dt, { pair: true });
  assert.ok(Math.abs(pairView.target.x) < 0.01, `still between them: ${pairView.target.x}`);
});

test('a pair is held at the zoom it opened on and drawn back only when one would leave the picture', () => {
  const dt = 1 / 60;
  const cam = createWatchCam();
  const view = orbit({ distance: 5.2 });
  for (let frame = 0; frame < 3 * 60; frame += 1) stepAuto(cam, view, [man(0, -0.7, 0), man(1, 0.7, 0)], dt, { pair: true });
  assert.ok(Math.abs(view.distance - 5.2) < 1e-6, `${view.distance}`);
  // 8 m apart: at 5.2 m a 40 degree lens on a wide screen shows 3.4 m either side; the camera draws back until each man is
  // `pairMargin` inside the edge.
  for (let frame = 0; frame < 4 * 60; frame += 1) stepAuto(cam, view, [man(0, -4, 0), man(1, 4, 0)], dt, { pair: true, lens: { fov: 40, aspect: 16 / 9 } });
  const fits = (4 + WATCH_CAM.auto.pairMargin) / Math.tan(Math.atan(Math.tan((20 * Math.PI) / 180) * (16 / 9)));
  assert.ok(Math.abs(view.distance - fits) < 0.1, `${view.distance} for ${fits}`);
});

test('frame-rate independent: the same zoom and look point at 30, 60 and 144 fps', () => {
  // (Motion as the world gives it, continuous: a man thrown 4 m out over half a second, all walking on at 0.6 m/s, one falling out of the
  // fight at 3 s. A step in the input is met a frame late at any frame rate, which is the input's, not the camera's.)
  const thrown = (t) => {
    const u = Math.max(0, Math.min(1, (t - 1) / 0.5));
    return 4 * u * u * (3 - 2 * u);
  };
  const at = (t) => lines(t).map((entry) => ({ ...entry, x: entry.x + (entry.id === 5 ? thrown(t) : 0), z: entry.z + 0.6 * t, in: !(entry.id === 0 && t > 3 + 1e-9) }));
  const runs = [30, 60, 144].map((fps) => run(fps, 8, at));
  const count = Math.min(...runs.map((samples) => samples.length));
  let zoom = 0;
  let look = 0;
  for (let index = 0; index < count; index += 1) {
    for (const other of [runs[0], runs[2]]) {
      zoom = Math.max(zoom, Math.abs(Math.log(other[index].d / runs[1][index].d)));
      look = Math.max(look, Math.hypot(other[index].x - runs[1][index].x, other[index].z - runs[1][index].z));
    }
  }
  // (The goals are read at the frames and held between them, a sixtieth of a second's lead at 30 fps: under half a per cent of the
  // distance while it draws back fastest, a centimetre or two of the look point. A first-order ease per frame would differ by its rate.)
  assert.ok(zoom < 0.005, `the zoom apart by ${(zoom * 100).toFixed(2)} per cent`);
  assert.ok(look < 0.03, `the look point apart by ${look} m`);
});

test('the push-in rises from nothing and lets go to nothing, with no speed at either end', () => {
  assert.equal(pushEnvelope(0), 0);
  assert.equal(pushEnvelope(1), 0);
  const slope = (u) => (pushEnvelope(u + 1e-4) - pushEnvelope(u)) / 1e-4;
  assert.ok(Math.abs(slope(1e-4)) < 0.01, `start ${slope(1e-4)}`);
  assert.ok(Math.abs(slope(1 - 2e-4)) < 0.01, `end ${slope(1 - 2e-4)}`);
  assert.ok(pushEnvelope(0.5) > 0.95 * DRAMA.pushPeak);
  assert.ok(DRAMA.pushRise + DRAMA.pushFall <= 1);
});

test('a moment taking over from another carries the lens on from where it is, with no jump', () => {
  const drama = {};
  const dt = 1 / 60;
  let previous = null;
  let amountStep = 0;
  let focusStep = 0;
  for (let frame = 0; frame < 4 * 60; frame += 1) {
    const now = frame * dt;
    // The first moment from 0 s, a second one (a man 1.5 m away) taking over at 1 s, from its own start: its push asks for nothing yet.
    const second = now >= 1;
    const u = second ? (now - 1) / 2.8 : now / 1.4;
    const lens = dramaLens(drama, { amount: pushEnvelope(u), focus: second ? [1.5, 1.6, 0] : [0, 1.6, 0] }, now);
    const state = [lens.amount, ...lens.focus];
    if (previous) {
      amountStep = Math.max(amountStep, Math.abs(state[0] - previous[0]));
      focusStep = Math.max(focusStep, Math.hypot(state[1] - previous[1], state[3] - previous[3]));
    }
    previous = state;
  }
  // (The new man is 1.5 m off: the lens goes to him in steps of centimetres, not in one.)
  // (Its own rise is some 0.06 a frame at 60 fps; the jump it replaced was the whole push, some 0.8.)
  assert.ok(amountStep < 0.08, `the amount stepped by ${amountStep} in a frame`);
  assert.ok(focusStep < 0.1, `the point stepped by ${focusStep} m in a frame`);
});

test('the arm held short by a wall is not pushed into it by a wanted distance that keeps growing: no sawtooth', () => {
  // A wall 8 m out along the arm.
  const world = { reach: (from, dir, length, radius) => Math.min(length, 8 - radius) };
  const arm = createArm();
  const lengths = [];
  for (let frame = 0; frame < 4 * 60; frame += 1) {
    const answer = arm.solve({ target: [0, 1.1, 0], yaw: 0, pitch: 0.2, distance: 6 + frame * 0.03 }, world, 1 / 60, { free: true });
    lengths.push(answer.distance);
  }
  const steps = lengths.slice(1).map((value, index) => value - lengths[index]);
  let turns = 0;
  for (let index = 1; index < steps.length; index += 1) if (steps[index] * steps[index - 1] < -1e-10) turns += 1;
  assert.equal(turns, 0, 'the arm\'s length goes one way, then holds');
  assert.ok(Math.max(...lengths) <= 8 - 0.3 + 1e-6, `never in the wall: ${Math.max(...lengths)}`);
  assert.ok(lengths.at(-1) > 7.3, `close to it: ${lengths.at(-1)}`);
});
