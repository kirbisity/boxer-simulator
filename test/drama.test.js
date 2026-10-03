import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAMA, startMoment, timeScale } from '../src/drama.js';

test('slow motion slides in and out: no cut from full speed to the slowest', () => {
  const drama = { active: null, icons: [] };
  startMoment(drama, { kind: 'knockout', fighter: 0, particle: 0 }, 0);
  const spec = DRAMA.knockout;
  assert.ok(timeScale(drama, 0) > 0.99, 'starts at full speed');
  assert.ok(Math.abs(timeScale(drama, DRAMA.easeIn) - spec.slowest) < 1e-9, 'slowest once eased in');
  // At 60 frames a second, no frame changes the speed by more than a fifth.
  let previous = timeScale(drama, 0);
  for (let frame = 1; frame * (1 / 60) < spec.seconds; frame += 1) {
    const scale = timeScale(drama, frame / 60);
    assert.ok(Math.abs(scale - previous) < 0.2, `frame ${frame}: ${previous.toFixed(2)} → ${scale.toFixed(2)}`);
    previous = scale;
  }
});
