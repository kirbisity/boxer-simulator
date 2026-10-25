// The synth families' mapping from the physics (audio/sfx/*): a harder material is brighter and rings longer, more energy is louder,
// a heavier body is lower; the voice follows the body's size; the ambience follows the place; the music only at its moments.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gainOfLevel, levelFromEnergy } from '../src/audio/synth.js';
import { impactParams } from '../src/audio/sfx/impact.js';
import { clashParams } from '../src/audio/sfx/clash.js';
import { woundParams } from '../src/audio/sfx/wound.js';
import { swingParams } from '../src/audio/sfx/swing.js';
import { stepParams } from '../src/audio/sfx/step.js';
import { fallParams } from '../src/audio/sfx/fall.js';
import { breathParams, voiceOfBody, voiceParams } from '../src/audio/sfx/voice.js';
import { horseParams } from '../src/audio/sfx/horse.js';
import { shotParams, whizzParams } from '../src/audio/sfx/ranged.js';
import { thunderParams } from '../src/audio/sfx/world.js';
import { ambienceTargets } from '../src/audio/ambience.js';
import { musicMoment } from '../src/audio/music.js';
import { exertionOf } from '../src/audio/engine.js';

test('the level of a sound follows the energy it radiates: ten times the energy is 10 dB', () => {
  assert.ok(Math.abs(levelFromEnergy(100, 1e-3, 0.5) - levelFromEnergy(10, 1e-3, 0.5) - 10) < 1e-9);
  assert.ok(gainOfLevel(100) === 1 && gainOfLevel(80) < gainOfLevel(90));
});

test('a harder covering is brighter and rings longer; flesh thumps, plate rings', () => {
  const blow = { energy: 120, striker: 'blunt', part: 'trunk' };
  const flesh = impactParams({ ...blow, covering: 'flesh' });
  const padded = impactParams({ ...blow, covering: 'padded' });
  const mail = impactParams({ ...blow, covering: 'mail' });
  const plate = impactParams({ ...blow, covering: 'plate' });
  assert.ok(plate.brightness > mail.brightness && mail.brightness > padded.brightness, `${plate.brightness} > ${mail.brightness} > ${padded.brightness}`);
  assert.ok(plate.decay > mail.decay && mail.decay > flesh.decay && flesh.decay > padded.decay - 0.02);
  assert.ok(plate.modes && plate.modes[0].decay >= 0.3 && plate.modes[0].decay <= 1, 'plate rings 0.3-1 s');
  assert.ok(plate.level > flesh.level && padded.level < flesh.level, 'plate is loud, a gambeson muffles');
  // The modes are inharmonic (a shell's, not a string's).
  const ratio = plate.modes[1].f / plate.modes[0].f;
  assert.ok(Math.abs(ratio - Math.round(ratio)) > 0.2);
  assert.ok(clashParams({ speed: 10, a: 'blade', b: 'blade' }).brightness > clashParams({ speed: 10, a: 'blade', b: 'haft' }).brightness);
  assert.ok(clashParams({ speed: 10, a: 'blade', b: 'blade' }).modes[0].decay > clashParams({ speed: 10, a: 'blunt', b: 'blunt' }).modes[0].decay);
});

test('more energy is louder (and a little brighter), in every family', () => {
  const soft = impactParams({ energy: 10, covering: 'flesh', striker: 'fist' });
  const hard = impactParams({ energy: 400, covering: 'flesh', striker: 'fist' });
  assert.ok(hard.level > soft.level + 10 && hard.brightness > soft.brightness);
  assert.ok(clashParams({ speed: 20, a: 'blade', b: 'blade' }).level > clashParams({ speed: 5, a: 'blade', b: 'blade' }).level);
  assert.ok(woundParams({ kind: 'cut', severity: 0.9 }).level > woundParams({ kind: 'cut', severity: 0.1 }).level);
  // Aeroacoustic: twice the speed is 18 dB.
  assert.ok(Math.abs(swingParams({ speed: 30 }).level - swingParams({ speed: 15 }).level - 60 * Math.log10(2)) < 1e-9);
  assert.ok(swingParams({ speed: 30 }).centre > swingParams({ speed: 15 }).centre);
  assert.ok(stepParams({ speed: 6, surface: 'stone' }).level > stepParams({ speed: 1, surface: 'stone' }).level);
  assert.ok(fallParams({ mass: 80, speed: 5 }).level > fallParams({ mass: 80, speed: 2 }).level);
  assert.ok(stepParams({ speed: 3, surface: 'water', depth: 0.8 }).splash > stepParams({ speed: 3, surface: 'water', depth: 0.1 }).splash);
  assert.ok(stepParams({ speed: 3, surface: 'stone' }).level > stepParams({ speed: 3, surface: 'earth' }).level, 'stone is louder underfoot than earth');
});

test('a heavier body is lower: its steps, its fall, its voice', () => {
  assert.ok(stepParams({ mass: 120, surface: 'stone' }).thud < stepParams({ mass: 60, surface: 'stone' }).thud);
  assert.ok(fallParams({ mass: 120, speed: 3 }).thud < fallParams({ mass: 60, speed: 3 }).thud);
  assert.ok(stepParams({ mass: 120, surface: 'stone' }).level > stepParams({ mass: 60, surface: 'stone' }).level);
  assert.ok(impactParams({ energy: 50, part: 'trunk' }).thump < impactParams({ energy: 50, part: 'lForearm' }).thump);
  const big = voiceOfBody(1.95, 110);
  const small = voiceOfBody(1.55, 55);
  assert.ok(big.f0 < small.f0 && big.scale < small.scale);
  assert.ok(Math.abs(voiceOfBody(1.78, 80).f0 - 110) < 1e-9);
  assert.ok(horseParams({ kind: 'hoof', surface: 'stone', mass: 700 }).clop < horseParams({ kind: 'hoof', surface: 'stone', mass: 400 }).clop);
});

test('the voice: a cry rises and is loud, death falls; breathing quickens and loudens with exertion', () => {
  const cry = voiceParams({ kind: 'wound', strength: 1, size: 1.8 });
  const grunt = voiceParams({ kind: 'effort', strength: 0.5, size: 1.8 });
  const death = voiceParams({ kind: 'death', strength: 0.5, size: 1.8 });
  assert.ok(Math.max(...cry.contour.map(([, f]) => f)) > 2, 'a cry is driven up past an octave');
  assert.ok(cry.level > grunt.level + 10 && cry.seconds > grunt.seconds);
  assert.ok(death.contour[death.contour.length - 1][1] < death.contour[0][1]);
  assert.ok(breathParams(1).rate > breathParams(0).rate * 2 && breathParams(1).level > breathParams(0).level + 20);
  assert.ok(exertionOf({ stamina: 1 }) === 0 && exertionOf({ stamina: 0 }) === 1 && exertionOf({ stamina: -0.3 }) > 1);
});

test('guns are far louder than bows; an arrow past the ear falls in pitch; near thunder cracks, far thunder only rumbles longer', () => {
  assert.ok(shotParams({ kind: 'matchlock' }).level > shotParams({ kind: 'bow' }).level + 50);
  assert.ok(whizzParams(60, 1).drop > 1);
  const near = thunderParams({ distance: 200 });
  const far = thunderParams({ distance: 3000 });
  assert.ok(near.crack > 0.5 && far.crack === 0 && far.seconds > near.seconds);
});

test('the ambience follows the place: surf on the cliffs, a crowd in the arena, birds in a fair field, the outside muffled indoors', () => {
  const cliff = ambienceTargets({ place: 'dunnottar', rain: 0.8, ear: [0, 14, 0], sea: 0, room: { enclosure: 0.3, roofed: false } });
  const drain = ambienceTargets({ place: 'dunnottar', rain: 0.8, ear: [0, -3, 0], sea: 0, room: { enclosure: 1, roofed: true } });
  assert.ok(Number.isFinite(cliff.surf) && Number.isFinite(cliff.rain) && cliff.muffle === 0);
  assert.ok(drain.muffle === 1 && drain.rain === -Infinity && Number.isFinite(drain.roof) && drain.wind < cliff.wind - 15);
  assert.ok(Number.isFinite(ambienceTargets({ place: 'colosseum' }).crowd));
  assert.ok(ambienceTargets({ place: 'field' }).birds > 0 && ambienceTargets({ place: 'field', rain: 0.5 }).birds === 0);
  assert.equal(ambienceTargets({ place: 'sengoku' }).surf, -Infinity);
});

test('music only at its moments', () => {
  assert.equal(musicMoment({ menu: true, game: 'home', worldId: 1, worldAge: 3 }).moment, 'menu');
  assert.equal(musicMoment({ game: 'level', worldId: 2, worldAge: 5 }).moment, 'opening');
  assert.equal(musicMoment({ game: 'level', worldId: 2, worldAge: 90 }).moment, null);
  assert.equal(musicMoment({ game: 'quick', worldId: 3, worldAge: 5 }).moment, null);
  assert.equal(musicMoment({ game: 'level', boss: true, worldId: 2, worldAge: 300 }).moment, 'boss');
  assert.equal(musicMoment({ game: 'level', boss: true, outcome: 'defeat', worldId: 2, worldAge: 300 }).moment, 'defeat');
});
