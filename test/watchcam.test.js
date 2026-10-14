import test from 'node:test';
import assert from 'node:assert/strict';
import { createTapper, createWatchCam, focusOn, frameAll, frameDistance, pickMan, stepFree, stepReframe, WATCH_CAM, zoomBy, zoomLimits } from '../src/watchcam.js';

const orbit = (extra = {}) => ({ yaw: 0, pitch: 0.2, distance: 5.2, target: { x: 0, y: 1.1, z: 0 }, ...extra });
const man = (id, x, z, extra = {}) => ({ id, x, y: 1.5, z, up: true, gone: false, ...extra });

test('a zoom takes the camera and stays: nothing in the auto framing pulls it back', () => {
  const cam = createWatchCam();
  const view = orbit({ distance: 30 });
  assert.equal(cam.mode, 'auto');
  assert.ok(zoomBy(cam, view, 0.1, 20));
  assert.equal(cam.mode, 'free');
  assert.ok(view.distance < 3.1);
  const men = [man(0, 0, 0), man(1, 10, 0), man(2, -10, 4)];
  for (let frame = 0; frame < 300; frame += 1) stepFree(cam, view, men, 1 / 60);
  assert.ok(view.distance < 3.1, 'the distance is the viewer\'s');
});

test('zoom runs from one man\'s head and shoulders out to the whole field, a big field being seen whole', () => {
  const small = zoomLimits(1);
  assert.equal(small.min, WATCH_CAM.minDistance);
  assert.ok(small.min < 1.2, 'close enough for a close-up');
  assert.equal(small.max, WATCH_CAM.maxDistance);
  const crowd = zoomLimits(30);
  assert.ok(crowd.max >= frameDistance(30), 'the whole army fits');
  const cam = createWatchCam();
  const view = orbit();
  zoomBy(cam, view, 0.001, 1);
  assert.equal(view.distance, WATCH_CAM.minDistance);
  zoomBy(cam, view, 1000, 1);
  assert.equal(view.distance, WATCH_CAM.maxDistance);
  // At the limit, more of the same changes nothing and does not take the camera.
  const fresh = createWatchCam();
  assert.equal(zoomBy(fresh, orbit({ distance: WATCH_CAM.minDistance }), 0.5, 1), false);
  assert.equal(fresh.mode, 'auto');
});

test('a man taken as the focus is followed; the camera keeps up with a rider at a gallop without lagging behind', () => {
  const cam = createWatchCam();
  const view = orbit({ distance: 1.6 });
  focusOn(cam, 1);
  const men = [man(0, 5, 5), man(1, 0, 0)];
  let lag = 0;
  for (let frame = 0; frame < 600; frame += 1) {
    men[1].x += 12 / 60;
    stepFree(cam, view, men, 1 / 60);
    if (frame > 60) lag = Math.max(lag, Math.hypot(men[1].x - view.target.x, men[1].z - view.target.z));
  }
  assert.ok(lag < 0.5, `lag ${lag}`);
  assert.ok(Math.abs(view.target.y - (1.5 + WATCH_CAM.above - (WATCH_CAM.above + WATCH_CAM.below) * (0.5 / 3.9))) < 0.05, 'looking at his chest and shoulders');
  assert.equal(view.distance, 1.6);
});

test('the camera settles on a man knocked sideways rather than snapping to him', () => {
  const cam = createWatchCam();
  const view = orbit({ distance: 2 });
  focusOn(cam, 0);
  const men = [man(0, 0, 0)];
  for (let frame = 0; frame < 120; frame += 1) stepFree(cam, view, men, 1 / 60);
  men[0].x = 1;
  stepFree(cam, view, men, 1 / 60);
  assert.ok(view.target.x > 0.2 && view.target.x < 1, 'damped');
  for (let frame = 0; frame < 120; frame += 1) stepFree(cam, view, men, 1 / 60);
  assert.ok(Math.abs(view.target.x - 1) < 0.01);
});

test('a focused man who is left lying gives way to the nearest man still fighting; with nobody left it holds', () => {
  const cam = createWatchCam();
  const view = orbit({ distance: 2 });
  focusOn(cam, 0);
  const men = [man(0, 0, 0), man(1, 3, 0), man(2, 9, 0)];
  stepFree(cam, view, men, 1 / 60);
  assert.equal(cam.focus, 0);
  // Out but not yet gone: still followed.
  men[0].up = false;
  stepFree(cam, view, men, 1 / 60);
  assert.equal(cam.focus, 0);
  men[0].gone = true;
  stepFree(cam, view, men, 1 / 60);
  assert.equal(cam.focus, 1);
  men[1].gone = true;
  men[2].gone = true;
  const at = { ...view.target };
  stepFree(cam, view, men, 1 / 60);
  assert.deepEqual(view.target, at);
});

test('zoomed in on no one, the camera follows the men near where it looks, not the far side of the field', () => {
  const cam = createWatchCam();
  const view = orbit({ distance: 3, target: { x: 0, y: 1.1, z: 0 } });
  cam.mode = 'free';
  const men = [man(0, 1, 0), man(1, -1, 0), man(2, 20, 0)];
  for (let frame = 0; frame < 120; frame += 1) {
    men[0].z += 0.01;
    men[1].z += 0.01;
    stepFree(cam, view, men, 1 / 60);
  }
  assert.ok(Math.abs(view.target.x) < 0.2, `${view.target.x}`);
  assert.ok(view.target.z > 0.5, 'went along with them');
});

test('Frame all gives the auto framing back and draws a pair\'s zoomed-in distance out to it', () => {
  const cam = createWatchCam();
  const view = orbit({ distance: 1.2 });
  focusOn(cam, 0);
  frameAll(cam);
  assert.equal(cam.mode, 'auto');
  assert.equal(cam.focus, null);
  for (let frame = 0; frame < 600; frame += 1) stepReframe(cam, view, 1, 1 / 60);
  assert.ok(Math.abs(view.distance - frameDistance(1)) < frameDistance(1) * 0.03, `${view.distance}`);
  assert.equal(cam.reframing, false);
});

test('a tap picks the man it is on: the nearer of two overlapping, none in the open', () => {
  const stick = (id, x, top, depth) => ({ id, depth, points: [[x, top], [x, top + 60], [x - 10, top + 120], [x + 10, top + 120]] });
  const shapes = [stick(0, 100, 100, 9), stick(1, 300, 120, 7)];
  assert.equal(pickMan(shapes, 102, 150), 0);
  assert.equal(pickMan(shapes, 300, 200), 1);
  assert.equal(pickMan(shapes, 200, 150), null);
  // Two men one behind the other: the one in front.
  assert.equal(pickMan([stick(0, 100, 100, 9), stick(1, 104, 100, 5)], 102, 150), 1);
});

test('a tap is told from a drag, and two taps close together are a double tap', () => {
  const tapper = createTapper();
  tapper.press(100, 100, 0);
  tapper.move(130, 100);
  assert.equal(tapper.release(130, 100, 100), null, 'a drag');
  tapper.press(100, 100, 1000);
  assert.equal(tapper.release(101, 100, 1100).kind, 'tap');
  tapper.press(102, 101, 1200);
  assert.equal(tapper.release(102, 101, 1260).kind, 'double');
  // A press held long is not a tap; a second finger cancels.
  tapper.press(100, 100, 5000);
  assert.equal(tapper.release(100, 100, 5900), null);
  tapper.press(100, 100, 6000);
  tapper.cancel();
  assert.equal(tapper.release(100, 100, 6050), null);
});
