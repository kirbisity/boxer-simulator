// The pressed-ground record (src/env/press.js): bodies mark the ground under their bones, marks heal by the clock with
// no pass over the record, the window carried with the lead forgets what it leaves, and a body on another floor
// does not mark the lead's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENV_PRESS, envPressForget, envPressRecord, envPressSet, envPressStep } from '../src/env/press.js';
import { P } from '../src/body.js';

// A man standing at (x, z), facing +x, his feet planted (ankles at their radius over the floor `y`).
function standing(x, z, y = 0, id = 1) {
  const at = {
    head: [0, 1.65, 0], neck: [0, 1.45, 0], lShoulder: [0, 1.4, 0.2], rShoulder: [0, 1.4, -0.2], lElbow: [0.1, 1.15, 0.25],
    rElbow: [0.1, 1.15, -0.25], lHand: [0.3, 1.2, 0.15], rHand: [0.3, 1.2, -0.15], pelvis: [0, 0.95, 0], lHip: [0, 0.9, 0.1],
    rHip: [0, 0.9, -0.1], lKnee: [0.05, 0.5, 0.11], rKnee: [0.05, 0.5, -0.11], lFoot: [0, 0.045, 0.12], rFoot: [0, 0.045, -0.12],
  };
  const fighter = { id, x: new Float64Array(45), v: new Float64Array(45), radius: new Array(15).fill(0.06), yaw: 0 };
  for (const [name, [px, py, pz]] of Object.entries(at)) {
    fighter.x.set([x + px, y + py, z + pz], P[name] * 3);
  }
  fighter.radius[P.lFoot] = fighter.radius[P.rFoot] = 0.045;
  return fighter;
}

// What the record says at a world point now: [grass pressed 0..1, snow pressed 0..1] (as the shader reads it).
function readAt(x, z) {
  const press = envPressRecord();
  const { size, texel } = ENV_PRESS;
  const wrap = (index) => ((index % size) + size) % size;
  const at = (wrap(Math.floor(z / texel)) * size + wrap(Math.floor(x / texel))) * 4;
  return [0, 1].map((channel) => Math.max(0, Math.min(1, press.bytes[at + channel] / 127 - press.clocks[channel])));
}

test('a standing man presses the grass flat under his soles and nowhere off them', () => {
  envPressSet(true);
  envPressForget();
  const man = standing(3, 2);
  const world = { time: 1, fighters: [man] };
  envPressStep({ world, lead: man });
  const [grass, snow] = readAt(3.05, 2.12);
  assert.ok(grass > 0.95, `under the left sole the grass lies flat (${grass})`);
  assert.ok(snow > 0.8, `and the snow is trodden down (${snow})`);
  const [between, betweenSnow] = readAt(3.05, 2);
  assert.ok(between < 0.2 && betweenSnow === 0, 'between his feet only grass taller than his crotch is held down');
  assert.deepEqual(readAt(5, 2), [0, 0], 'two metres off nothing is pressed');
});

test('marks heal by the clock alone: grass rises at ENV_PRESS.rise once the man has gone', () => {
  envPressForget();
  const man = standing(0, 0);
  const world = { time: 1, fighters: [man] };
  envPressStep({ world, lead: man });
  const before = readAt(0.05, 0.12)[0];
  const bytes = envPressRecord().bytes.slice();
  // He jumps clear (nothing of him under the grass's reach) and five seconds go by.
  for (let at = 1; at < 45; at += 3) man.x[at] += 3;
  for (let step = 1; step <= 50; step += 1) {
    world.time = 1 + step * 0.1;
    envPressStep({ world, lead: man });
  }
  const after = readAt(0.05, 0.12)[0];
  assert.ok(Math.abs(before - after - (5 * ENV_PRESS.rise) / ENV_PRESS.tall) < 0.02, `healed ${before - after} in 5 s`);
  assert.deepEqual(envPressRecord().bytes.slice(0, 64), bytes.slice(0, 64), 'the bytes themselves were not rewritten');
});

test('carried with the lead, the record forgets the ground it leaves and keeps what stays inside it', () => {
  envPressForget();
  const man = standing(0, 0);
  const world = { time: 1, fighters: [man] };
  envPressStep({ world, lead: man });
  assert.ok(readAt(0.05, 0.12)[0] > 0.9);
  const reach = (ENV_PRESS.size * ENV_PRESS.texel) / 2;
  // He walks off along x: at 10 m the print is still inside the record; past its reach it is wiped.
  for (const [to, kept] of [[10, true], [reach + 2, false]]) {
    const step = to - man.x[P.pelvis * 3];
    for (let at = 0; at < 45; at += 3) man.x[at] += step;
    for (let at = 1; at < 45; at += 3) man.x[at] += 3;
    world.time += 0.05;
    envPressStep({ world, lead: man });
    for (let at = 1; at < 45; at += 3) man.x[at] -= 3;
    assert.equal(readAt(0.05, 0.12)[0] > 0.8, kept, `with the lead at ${to} m the first print is ${kept ? 'kept' : 'gone'}`);
  }
});

test('a man 4.5 m over the ground (on a wall walk) does not mark the ground under him', () => {
  envPressForget();
  const lead = standing(0, 0, 0, 1);
  const above = standing(2, 0, 4.5, 2);
  const world = { time: 1, fighters: [lead, above] };
  envPressStep({ world, lead });
  assert.deepEqual(readAt(2.05, 0.12), [0, 0], 'his feet 4.5 m up leave the street unmarked');
  assert.ok(readAt(0.05, 0.12)[0] > 0.9, 'the lead marks his own floor');
});

test('switched off, nothing is written and readers are told the record is not kept', () => {
  envPressSet(false);
  const man = standing(0, 0);
  const press = envPressStep({ world: { time: 1, fighters: [man] }, lead: man });
  assert.equal(press.uniforms.uEnvPressClock.value.w, 0);
  assert.deepEqual(readAt(0.05, 0.12), [0, 0]);
  envPressSet(true);
});
