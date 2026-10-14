import test from 'node:test';
import assert from 'node:assert/strict';
import { fadeStep, mayBlock, SEE_THROUGH, segmentBoxEntry } from '../src/seethrough.js';

test('a wall between the camera and the man is in the way; one beside or beyond him is not', () => {
  const camera = [0, 2, 8];
  const man = [0, 1, 0];
  const wall = { min: [-2, 0, 3], max: [2, 3, 3.4] };
  assert.ok(segmentBoxEntry(camera, man, wall.min, wall.max) !== null, 'in front');
  assert.equal(segmentBoxEntry(camera, man, [3, 0, 3], [5, 3, 3.4]), null, 'off to the side');
  assert.equal(segmentBoxEntry(camera, man, [-2, 0, -3.4], [2, 3, -3]), null, 'behind him');
  assert.equal(segmentBoxEntry(camera, man, [-2, 2.6, 3], [2, 3, 3.4]), null, 'above the line');
  // Where it is met: a share of the way.
  const share = segmentBoxEntry(camera, man, wall.min, wall.max);
  assert.ok(Math.abs(share - (8 - 3.4) / 8) < 1e-9, `${share}`);
  // A line along an axis (no change in y) inside the slab, and outside it.
  assert.ok(segmentBoxEntry([0, 1, 8], [0, 1, 0], wall.min, wall.max) !== null);
  assert.equal(segmentBoxEntry([0, 4, 8], [0, 4, 0], wall.min, wall.max), null);
});

test('floor, ground, sky and ropes never count as in the way', () => {
  assert.equal(mayBlock([-6, -0.1, -4], [6, 0.02, 4]), false, 'the floor');
  assert.equal(mayBlock([-60, -1, -60], [60, 60, 60]), false, 'the sky dome');
  assert.equal(mayBlock([-3, 0.9, -0.02], [3, 0.94, 0.02]), false, 'a rope');
  assert.equal(mayBlock([0, 0, 0], [0.1, 1.5, 0.1]), false, 'a thin post');
  assert.equal(mayBlock([-2, 0, 3], [2, 3, 3.1]), true, 'a wall');
  assert.equal(mayBlock([0, 0, 0], [0.4, 3, 0.4]), true, 'a trunk');
});

test('a piece in the way fades out, lingers, and comes back smoothly, with no frame jumping', () => {
  const spec = SEE_THROUGH;
  const fade = { opacity: 1, until: -Infinity };
  const dt = 1 / 60;
  let clock = 0;
  let previous = 1;
  const largest = (1 - spec.faded) * dt / Math.min(spec.fadeOut, spec.fadeIn) + 1e-9;
  // In the way for a second (found at every test), then clear.
  const trace = [];
  for (let frame = 0; frame < 180; frame += 1) {
    clock += dt;
    const testing = frame % 7 === 0;
    const opacity = fadeStep(fade, testing ? clock < 1 : undefined, clock, dt, spec);
    assert.ok(Math.abs(opacity - previous) <= largest, `frame ${frame}: ${previous} → ${opacity}`);
    previous = opacity;
    trace.push(opacity);
  }
  assert.ok(Math.abs(trace[Math.round(0.5 / dt)] - spec.faded) < 1e-9, 'faded while in the way');
  // Still faded just after it cleared (linger), solid again a while later.
  assert.ok(trace[Math.round((1 + spec.linger * 0.6) / dt)] < 0.5, 'lingers');
  assert.equal(trace[trace.length - 1], 1, 'solid again');
});

test('a piece found in the way only between tests does not flicker', () => {
  const fade = { opacity: 1, until: -Infinity };
  const dt = 1 / 60;
  let clock = 0;
  let lowest = 1;
  let highestAfter = 0;
  // Found at every other test (a man stepping in and out from behind a post).
  for (let frame = 0; frame < 240; frame += 1) {
    clock += dt;
    const test = Math.floor(clock / SEE_THROUGH.every);
    const testing = Math.floor((clock - dt) / SEE_THROUGH.every) !== test;
    const opacity = fadeStep(fade, testing ? test % 2 === 0 : undefined, clock, dt);
    lowest = Math.min(lowest, opacity);
    if (clock > 1) highestAfter = Math.max(highestAfter, opacity);
  }
  assert.equal(lowest, SEE_THROUGH.faded);
  assert.equal(highestAfter, SEE_THROUGH.faded, 'held faded between sightings');
});
