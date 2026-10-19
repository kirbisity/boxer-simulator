// Depth precision and the flicker it prevents: the camera's near plane, the lifts that keep two faces off one plane, the floor offsets,
// and the torch lights that must not pop.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_NEAR, DEPTH_BITS, KIT_FLOOR_OFFSET, KIT_LIFT, depthStep, kitLift, kitLiftMost, resolvedUpTo } from '../src/depthrange.js';
import { TORCH_POOL, lampShare, newLamps, pickLit, stepLamps, torchFlicker } from '../src/levelmode/torchpool.js';

test('the camera sees from 20 cm: far enough from the 5 cm that crawled the stone, nearer than any wall the follow camera allows', () => {
  assert.ok(CAMERA_NEAR >= 0.2);
  // The follow camera keeps a ball of 0.32 m clear of the walls (kit.js stageCameraRoom): the near plane's corners (fov 40, 16:9) must lie inside it.
  const half = Math.tan((40 / 2) * (Math.PI / 180)) * CAMERA_NEAR;
  const corner = Math.hypot(CAMERA_NEAR, half, half * (16 / 9));
  assert.ok(corner < 0.32, `the near plane's corner is ${corner.toFixed(3)} m out`);
  // The watching camera never comes nearer to a man than 1.1 m.
  assert.ok(CAMERA_NEAR < 1.1 / 4);
});

test('the depth buffer: a step grows with the square of the distance and falls with the near plane', () => {
  assert.equal(DEPTH_BITS, 24);
  assert.ok(depthStep(100, 0.05) > 3.99 * depthStep(100, 0.2), 'a near plane four times out is four times finer');
  assert.ok(Math.abs(depthStep(60) / depthStep(30) - 4) < 1e-9);
  // Faces a millimetre apart: told apart out to ...
  assert.ok(resolvedUpTo(0.001, 0.05) < 30, 'at 5 cm only the near 30 m');
  assert.ok(resolvedUpTo(0.001, CAMERA_NEAR) > 55, 'at 20 cm beyond 55 m');
  assert.ok(Math.abs(depthStep(resolvedUpTo(0.001)) - 0.001) < 1e-9);
});

test('the kit lifts: neighbouring pieces differ, the most is under the decals 2 cm, and a stride visits every level', () => {
  const lifts = Array.from({ length: 200 }, (_, n) => kitLift(n));
  for (let n = 0; n + 1 < lifts.length; n += 1) assert.ok(Math.abs(lifts[n] - lifts[n + 1]) >= KIT_LIFT.step * 2 - 1e-12, `pieces ${n} and ${n + 1}`);
  for (let n = 0; n + KIT_LIFT.levels - 1 < lifts.length; n += 1) {
    const window = new Set(lifts.slice(n, n + KIT_LIFT.levels).map((lift) => Math.round(lift / KIT_LIFT.step)));
    assert.equal(window.size, KIT_LIFT.levels, `pieces ${n}..${n + KIT_LIFT.levels - 1} each have a level of their own`);
  }
  assert.ok(kitLiftMost() < 0.004);
  assert.equal(Math.max(...lifts), kitLiftMost());
  assert.equal(kitLift(0), 0);
  // Resolved at 30 m with the camera's near plane: one lift step is more than a depth step there.
  assert.ok(KIT_LIFT.step > depthStep(30, CAMERA_NEAR));
});

test('the floors win a tie with what is under them: negative offsets, the dressing over the earth', () => {
  for (const name of ['path', 'flags', 'cobble', 'boards']) {
    assert.ok(KIT_FLOOR_OFFSET[name].factor < 0 && KIT_FLOOR_OFFSET[name].units < 0, `${name} is offset toward the camera`);
  }
  assert.equal(KIT_FLOOR_OFFSET.grass.units, 0, 'the earth is not');
  // The dressing laid over another dressing is the stronger.
  assert.ok(KIT_FLOOR_OFFSET.cobble.units < KIT_FLOOR_OFFSET.flags.units);
  assert.ok(KIT_FLOOR_OFFSET.boards.units < KIT_FLOOR_OFFSET.cobble.units);
  assert.ok(KIT_FLOOR_OFFSET.path.units < KIT_FLOOR_OFFSET.grass.units);
});

test('the torch lights keep their torches and fade, so the stone never jumps', () => {
  const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
  // A rival only a little nearer does not take a lit torch's light.
  const lit = [a, b, c, d];
  const picked = pickLit([{ l: a, d: 5 }, { l: b, d: 6 }, { l: c, d: 7 }, { l: d, d: 8 }, { l: e, d: 7.5 }], lit, 4);
  assert.ok(picked.includes(d) && !picked.includes(e), 'a fifth torch nearer than the fourth by under the margin waits');
  // ... but one much nearer does.
  const taken = pickLit([{ l: a, d: 5 }, { l: b, d: 6 }, { l: c, d: 7 }, { l: d, d: 12 }, { l: e, d: 7.5 }], lit, 4);
  assert.ok(taken.includes(e) && !taken.includes(d));

  // The lamps: a torch that leaves fades out over fadeSeconds, in steps, never from full to none in one.
  const lamps = newLamps(4);
  stepLamps(lamps, [a, b, c, d], 0.02);
  const home = lamps.map((lamp) => lamp.l);
  for (let k = 0; k < 40; k += 1) stepLamps(lamps, [a, b, c, d], 0.02);
  assert.deepEqual(lamps.map((lamp) => lamp.l), home, 'a lamp stays on its torch');
  assert.ok(lamps.every((lamp) => lamp.fade === 1));
  let previous = 1;
  let newcomer = null;
  let frames = 0;
  while (frames < 200) {
    stepLamps(lamps, [a, b, c, e], 0.02);
    frames += 1;
    const gone = lamps[home.indexOf(d)];
    if (gone.l === d) {
      assert.ok(previous - gone.fade <= 0.02 / TORCH_POOL.fadeSeconds + 1e-9, 'it fades by steps, not at once');
      previous = gone.fade;
    }
    newcomer = lamps.find((lamp) => lamp.l === e);
    if (newcomer && newcomer.fade === 1) break;
  }
  assert.ok(newcomer && newcomer.fade === 1, 'the newcomer is lit at last');
  assert.ok(frames * 0.02 <= TORCH_POOL.fadeSeconds * 2 + 0.1, 'in under a second');
  assert.equal(lamps.indexOf(newcomer), home.indexOf(d), 'it has the lamp the other left');
  // Eased, from 0 to 1.
  assert.equal(lampShare({ fade: 0 }), 0);
  assert.equal(lampShare({ fade: 1 }), 1);
  assert.equal(lampShare({ fade: 0.5 }), 0.5);
});

test('a torch wavers by 8 per cent at most, smoothly', () => {
  let low = Infinity;
  let high = -Infinity;
  let jump = 0;
  let last = torchFlicker(0, 1);
  for (let t = 0.001; t < 60; t += 1 / 60) {
    const now = torchFlicker(t, 1);
    low = Math.min(low, now);
    high = Math.max(high, now);
    jump = Math.max(jump, Math.abs(now - last));
    last = now;
  }
  assert.ok(high <= 1.0001 && low >= 0.83, `${low.toFixed(3)}..${high.toFixed(3)}`);
  // (Before: +-18 % at 5 Hz, up to 5.7 per cent between two frames.)
  assert.ok(jump < 0.02, `no frame changes it by ${(jump * 100).toFixed(2)} per cent`);
});
