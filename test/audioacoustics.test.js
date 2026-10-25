// The probed room (audio/acoustics.js) on real terrain: an open battle field is nearly dry, the Dunnottar sewer drain has a long wet
// tail (and flutters between its walls), a room a short one, the Colosseum's ring of walls a little; and the reverb eases across a doorway.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { cameraRoom } from '../src/followcam.js';
import { createTerrain, floorAt, ceilingOf, slabOf, wallOf } from '../src/physics/terrain.js';
import { cameraTerrain } from '../src/levelmode/stage.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { createLevelWorld } from '../src/levelmode/level.js';
import { DUNNOTTAR } from '../src/levelmode/stages/dunnottar.js';
import { scenarioWorld } from '../src/scenarios.js';
import { copyRoom, probeRays, reverbSend, reverbWeights, roomFromProbe, smoothRoom, OPEN_ROOM } from '../src/audio/acoustics.js';

const castle = cameraTerrain(createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed: 1 }));
const headOn = (terrain, x, z, y = 50) => [x, floorAt(terrain, x, z, y) + 1.6, z];
const roomAt = (terrain, room, head) => roomFromProbe(probeRays(terrain, room, head));

/** A closed stone room 5 by 4 m and 3 m high, with a door 1.2 m wide in its east wall, on a floor that runs out into the open. */
function roomWithDoor() {
  return createTerrain([
    slabOf([10, 0], [40, 20], 0),
    wallOf([-2.5, 0], [0.4, 4.4], 0, 3),
    wallOf([0, 2.1], [5.4, 0.4], 0, 3),
    wallOf([0, -2.1], [5.4, 0.4], 0, 3),
    wallOf([2.5, 1.3], [0.4, 1.8], 0, 3),
    wallOf([2.5, -1.3], [0.4, 1.8], 0, 3),
    ceilingOf([0, 0], [5.4, 4.6], 3, { top: 3.4 }),
  ]);
}

test('an open battle field is nearly dry', () => {
  const world = scenarioWorld('sekigahara', 1);
  const fighter = world.fighters[0];
  const head = [fighter.x[P.head * 3], fighter.x[P.head * 3 + 1], fighter.x[P.head * 3 + 2]];
  const room = roomAt(world.arena.terrain ?? null, null, head);
  assert.equal(room.enclosure, 0);
  assert.equal(room.wet, 0);
  assert.equal(reverbSend(room, 15), 0);
});

test('the Dunnottar sewer drain: a long, wet tail, and a flutter between its walls', () => {
  const head = headOn(castle, -48.5, 33, -3);
  const room = roomAt(castle, null, head);
  assert.ok(room.roofed, 'the barrel vault is over him');
  assert.ok(room.enclosure > 0.95, `closed: ${room.enclosure}`);
  assert.ok(room.rt60 > 2.5, `a long tail: RT60 ${room.rt60.toFixed(2)} s`);
  assert.ok(room.wet > 0.9);
  assert.ok(room.flutter.feedback > 0 && room.flutter.delay > 0.01 && room.flutter.delay < 0.04, `flutter ${room.flutter.delay}`);
  assert.ok(reverbSend(room, 8) > 0.9, 'a man 8 m down the drain is heard mostly in its reverb');
});

test('a room gives a short tail (shorter than the drain), and the cliff path in the open less', () => {
  const terrain = roomWithDoor();
  const room = roomAt(terrain, null, [-1, 1.6, 1]);
  const drain = roomAt(castle, null, headOn(castle, -48.5, 33, -3));
  assert.ok(room.enclosure > 0.95);
  assert.ok(room.rt60 < 1.6 && room.rt60 < drain.rt60 / 2, `room ${room.rt60.toFixed(2)} s, drain ${drain.rt60.toFixed(2)} s`);
  assert.ok(room.preDelay < 0.02, 'the walls are near: the first reflection comes at once');
  const cliff = roomAt(castle, null, headOn(castle, -80, -4));
  assert.ok(cliff.wet < 0.4, `the cliff path is open: wet ${cliff.wet.toFixed(2)}`);
});

test('a place with walls and no terrain (the Colosseum) echoes a little, open to the sky', () => {
  const room = roomAt(null, cameraRoom('colosseum'), [0, 1.6, 0]);
  assert.ok(!room.roofed);
  assert.ok(room.wet > 0.2 && room.wet < 0.7, `wet ${room.wet}`);
});

test('the reverb eases through a doorway: no jump from the room to the open', () => {
  const terrain = roomWithDoor();
  const room = copyRoom(roomAt(terrain, null, [-1, 1.6, 0]));
  let target = room;
  let biggestJump = 0;
  let probeClock = 0;
  // Walking out through the door at 1.4 m/s, the audio tick at 30 Hz, the probe at 4 Hz, as the engine runs them.
  for (let tick = 0; tick < 30 * 8; tick += 1) {
    const x = -1 + 1.4 * (tick / 30);
    probeClock -= 1 / 30;
    if (probeClock <= 0) {
      probeClock = 0.25;
      target = roomAt(terrain, null, [x, 1.6, 0]);
    }
    const before = room.rt60;
    smoothRoom(room, target, 1 / 30);
    biggestJump = Math.max(biggestJump, Math.abs(room.rt60 - before));
  }
  assert.ok(room.wet < 0.1, `out in the open at the end: wet ${room.wet}`);
  assert.ok(biggestJump < 0.1, `the most the RT60 moved in one tick: ${biggestJump.toFixed(3)} s`);
});

test('the cached impulses are cross-faded by the RT60, summing to one', () => {
  for (const rt of [0.1, 0.5, 1, 2.2, 4.5, 9]) {
    const weights = reverbWeights(rt);
    assert.ok(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  }
  assert.deepEqual(reverbWeights(0.5), [1, 0, 0]);
  assert.ok(reverbWeights(3)[2] > reverbWeights(3)[0]);
  assert.equal(OPEN_ROOM.wet, 0);
});
