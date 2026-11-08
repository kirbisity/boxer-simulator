// The sandbox's camera feel panel (src/camtuner.js): its dials are FOLLOW_CAM's own, set within their ranges, and copied out as
// only those changed; and the follow camera's walking view no longer turns ahead of a sidestep or a turn (followcam.js FOLLOW_CAM).

import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCameraDials, CAMERA_DEFAULTS, CAMERA_DIALS, cameraDialValues } from '../src/camtuner.js';
import { createFollowCam, FOLLOW_CAM } from '../src/followcam.js';

const copy = () => structuredClone(FOLLOW_CAM);

test('camera dials: every one is a number in FOLLOW_CAM, its default inside its range', () => {
  for (const dial of CAMERA_DIALS) {
    const value = CAMERA_DEFAULTS[dial.path];
    assert.equal(typeof value, 'number', dial.path);
    assert.ok(value >= dial.min && value <= dial.max, `${dial.path} ${value} in [${dial.min}, ${dial.max}]`);
  }
});

test('camera dials: set within range, unknown paths ignored, and only the changed ones copied', () => {
  const spec = copy();
  applyCameraDials({ facingSeconds: 1.2, 'run.rate': 99, nonsense: 3 }, spec);
  assert.equal(spec.facingSeconds, 1.2);
  assert.equal(spec.run.rate, CAMERA_DIALS.find((dial) => dial.path === 'run.rate').max);
  assert.deepEqual(Object.keys(cameraDialValues(true, spec)).sort(), ['facingSeconds', 'run.rate']);
});

test('follow camera: walking, a sidestep of 60 degrees turns the view less than 6 degrees in 2 s', () => {
  const cam = createFollowCam();
  const dt = 1 / 60;
  let x = 0;
  let z = 0;
  let heading = 0;
  let start = null;
  let most = 0;
  for (let frame = 0; frame <= 180; frame += 1) {
    const t = frame * dt;
    const want = t >= 1 ? Math.PI / 3 : 0;
    heading += Math.max(-dt * 1.7, Math.min(dt * 1.7, want - heading));
    x += Math.cos(heading) * 1.4 * dt;
    z -= Math.sin(heading) * 1.4 * dt;
    const view = cam.update({ me: [x, 1, z], facing: 0, down: false, foe: null, moving: true, running: false, speed: 1.4, velocity: [Math.cos(heading) * 1.4, 0, -Math.sin(heading) * 1.4], aspect: 16 / 9, intent: [Math.cos(want), -Math.sin(want)] }, t, dt);
    if (frame === 60) start = view.yaw;
    if (start !== null) most = Math.max(most, Math.abs(view.yaw - start));
  }
  assert.ok(most < (6 * Math.PI) / 180, `${((most * 180) / Math.PI).toFixed(1)} degrees`);
});
