// The ear (audio/ear.js, audio/families.js): the distance model with its floor, the air's low-pass, the 10-20 m thinning, the map-wide
// sounds, ranking and stealing of voices, and the direction from the camera (on-screen left is left, behind the camera is behind).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EAR, airCutoff, allocateVoices, behindCutoff, createListener, distanceGain, earDirection, isMapWide, levelAtEar, limitPerTick, placeListener, thinningKeeps } from '../src/audio/ear.js';
import { mergeVoices, soundCandidates } from '../src/audio/families.js';

/** A three.js camera's matrixWorld elements for a camera at `eye` looking along the ground at `yaw` (0: toward -z), level. */
function cameraLooking(yaw, eye = [0, 1.7, 0]) {
  // Its x axis (the screen's right), y (up) and z (back out of the screen), column-major.
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const back = [Math.sin(yaw), 0, Math.cos(yaw)];
  return [...right, 0, 0, 1, 0, 0, ...back, 0, ...eye, 1];
}

test('inverse distance from 1 m: -6 dB a doubling, with a floor inside the circle; the plain inverse past it for a map-wide sound', () => {
  assert.equal(distanceGain(0.3), 1);
  assert.ok(Math.abs(20 * Math.log10(distanceGain(4) / distanceGain(2)) + 6.02) < 0.01);
  assert.equal(distanceGain(18), EAR.floor);
  assert.ok(distanceGain(15) >= EAR.floor && 20 * Math.log10(distanceGain(15)) > -24, 'a fight 15 m off is no quieter than -23 dB');
  assert.ok(Math.abs(distanceGain(300, true) - 1 / 300) < 1e-12);
});

test('the air takes the highs off as the way grows', () => {
  const near = airCutoff(2);
  const edge = airCutoff(20);
  const far = airCutoff(400);
  assert.equal(near, 20000);
  assert.ok(edge < near && far < edge, `${near} > ${edge} > ${far}`);
  assert.ok(far < 4000);
});

test('10-20 m: quiet events thin out, loud ones carry; past 20 m only the map-wide', () => {
  const step = 62;
  const clang = 104;
  for (const d of [3, 9]) assert.ok(thinningKeeps(levelAtEar(step, d), d), `a step at ${d} m is kept`);
  assert.ok(!thinningKeeps(levelAtEar(step, 16), 16), 'a step at 16 m is lost');
  assert.ok(thinningKeeps(levelAtEar(clang, 19), 19), 'a clang at 19 m still plays');
  assert.ok(!thinningKeeps(levelAtEar(clang, 25), 25), 'nothing but the map-wide past the circle');
  assert.ok(thinningKeeps(levelAtEar(150, 300, true), 300, true));
});

test('thunder and gunfire are map-wide; a bow is not', () => {
  assert.ok(isMapWide({ type: 'thunder' }));
  assert.ok(isMapWide({ type: 'shot', kind: 'matchlock' }));
  assert.ok(isMapWide({ type: 'shot', kind: 'cannon' }));
  assert.ok(!isMapWide({ type: 'shot', kind: 'bow' }));
  const listener = placeListener(createListener(), [0, 1.7, 0], cameraLooking(0));
  const events = [
    { type: 'shot', kind: 'matchlock', x: 120, y: 1.5, z: 0 },
    { type: 'clash', speed: 12, a: 'blade', b: 'blade', x: 30, y: 1.2, z: 0 },
    { type: 'step', speed: 1.4, mass: 80, surface: 'stone', armour: 'none', x: 2, y: 0, z: 1 },
    { type: 'step', speed: 1.4, mass: 80, surface: 'grass', armour: 'none', x: 17, y: 0, z: 0 },
  ];
  const heard = soundCandidates(events, listener).map((candidate) => `${candidate.event.type}@${Math.round(candidate.distance)}`).sort();
  assert.deepEqual(heard, ['shot@120', 'step@3']);
});

test('voices: the loudest first, a louder sound takes the quietest voice, a quieter one waits', () => {
  const active = Array.from({ length: 4 }, (_, index) => ({ id: index, atEar: 50 + index }));
  const { start, steal } = allocateVoices(active, [{ atEar: 80 }, { atEar: 51 }, { atEar: 70 }], 4);
  assert.deepEqual(start.map((candidate) => candidate.atEar), [80, 70]);
  assert.deepEqual(steal.map((voice) => voice.id), [0, 1]);
  const roomy = allocateVoices([], [{ atEar: 40 }, { atEar: 90 }], 24);
  assert.deepEqual(roomy.start.map((candidate) => candidate.atEar), [90, 40]);
  assert.equal(roomy.steal.length, 0);
});

test('far steps of one tick are merged into one patter, carrying their summed energy', () => {
  const far = Array.from({ length: 10 }, (_, index) => ({ event: { type: 'step' }, distance: 12 + index * 0.2, atEar: 40 }));
  const near = [{ event: { type: 'step' }, distance: 2, atEar: 55 }];
  const kept = limitPerTick([...far, ...near]);
  assert.equal(kept.length, 2);
  const patter = kept.find((candidate) => candidate.merged);
  assert.equal(patter.merged, 10);
  assert.ok(Math.abs(patter.atEar - 50) < 1e-9, 'ten together are 10 dB louder');
});

test('direction from the camera: on-screen right is right, behind the camera is behind, as the camera turns', () => {
  for (const yaw of [0, 1.1, Math.PI, -2.4]) {
    const camera = cameraLooking(yaw);
    const listener = placeListener(createListener(), [0, 1.7, 0], camera);
    const right = [camera[0], camera[1], camera[2]];
    const forward = [-camera[8], -camera[9], -camera[10]];
    const onRight = earDirection(listener, right[0] * 5, 1.7, right[2] * 5);
    const ahead = earDirection(listener, forward[0] * 5, 1.7, forward[2] * 5);
    const behind = earDirection(listener, -forward[0] * 5, 1.7, -forward[2] * 5);
    const onLeft = earDirection(listener, -right[0] * 5, 1.7, -right[2] * 5);
    assert.ok(Math.abs(onRight.azimuth - Math.PI / 2) < 1e-9, `right at yaw ${yaw}`);
    assert.ok(Math.abs(onLeft.azimuth + Math.PI / 2) < 1e-9, `left at yaw ${yaw}`);
    assert.ok(Math.abs(ahead.azimuth) < 1e-9);
    assert.ok(Math.abs(Math.abs(behind.azimuth) - Math.PI) < 1e-9);
    assert.ok(Math.abs(onRight.distance - 5) < 1e-9);
  }
  // The distance is from the head, not the camera: a camera 6 m behind him does not put a man beside him 6 m off.
  const listener = placeListener(createListener(), [0, 1.7, 0], cameraLooking(0, [0, 3, 6]));
  assert.ok(Math.abs(earDirection(listener, 1, 1.7, 0).distance - 1) < 1e-9);
  // On speakers, behind is duller than in front.
  assert.ok(behindCutoff(Math.PI) < behindCutoff(0) / 3);
  assert.equal(behindCutoff(Math.PI / 2), 20000);
});

test('a blow that wounds is one voice: the stronger of the cry and the grunt', () => {
  const events = [
    { type: 'voice', kind: 'struck', strength: 0.4, who: 3, t: 1 },
    { type: 'voice', kind: 'wound', strength: 0.9, who: 3, t: 1 },
    { type: 'voice', kind: 'effort', strength: 0.5, who: 4, t: 1 },
    { type: 'hit', who: 3, t: 1 },
  ];
  assert.deepEqual(mergeVoices(events).map((event) => `${event.type}:${event.kind ?? ''}`), ['voice:wound', 'voice:effort', 'hit:']);
});

test('the men are heard to cry out only in the recorded voices (the synth\'s never), and never to grunt; a blow on armour is heard', () => {
  const listener = placeListener(createListener(), [0, 1.7, 0], cameraLooking(0));
  const events = [
    { type: 'voice', kind: 'wound', strength: 0.9, who: 3, t: 1, x: 1, y: 1.6, z: 0, size: 1.8, f0: 110 },
    { type: 'voice', kind: 'effort', strength: 0.9, who: 4, t: 1, x: 1, y: 1.6, z: 0, size: 1.8, f0: 110 },
    { type: 'hit', energy: 200, x: 1, y: 1.2, z: 0, t: 1 },
  ];
  const heard = soundCandidates(events, listener);
  assert.deepEqual(heard.map((candidate) => `${candidate.event.type}:${candidate.event.kind ?? ''}`), ['voice:wound', 'hit:']);
  assert.ok(heard[0].family.sampledOnly, 'a cry is played only from its recordings (cries.js rations them in the game)');
});
