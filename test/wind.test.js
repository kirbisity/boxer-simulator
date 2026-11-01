// The air the fire burns in (wind.js) and how the flames and smoke take it (flameview.js, battlefx.js): flames lean with the wind
// less the speed of what burns, not at all in calm places, the same at any frame rate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { battleFxStepPuff } from '../src/battlefx.js';
import { FLAME_VIEW, flameViewAirPast, flameViewBuoyant } from '../src/flameview.js';
import { DUNNOTTAR } from '../src/levelmode/stages/dunnottar.js';
import { STAGE_LOOKS } from '../src/levelmode/stagelooks.js';
import { PLACE_WIND, WIND, flameAxis, flameTilt, placeWind, windNow, windShelter } from '../src/wind.js';

const tiltOf = (axis) => Math.atan2(Math.hypot(axis[0], axis[2]), axis[1]);

test('a flame leans the way of the wind less the speed of what burns', () => {
  const axis = [0, 0, 0];
  // A man running +x in still air: his flames stream back, -x, well over.
  flameAxis(axis, -6, 0, FLAME_VIEW.air.man, 0.3, 0);
  assert.ok(axis[0] < -0.6 && Math.abs(axis[2]) < 0.3 && axis[1] > 0.2, `running: ${axis}`);
  // Standing in a wind blowing +z: the flames lean +z.
  flameAxis(axis, 0, 5, FLAME_VIEW.air.man, 0.3, 0);
  assert.ok(axis[2] > 0.6 && Math.abs(axis[0]) < 0.3, `standing in wind: ${axis}`);
  // Running +x at 5 m/s down a +x wind of 5 m/s: the air is still about him, the flames stand up.
  flameAxis(axis, 5 - 5, 0, FLAME_VIEW.air.man, 0.3, 0);
  assert.ok(tiltOf(axis) < 0.3, `running with the wind: ${axis}`);
  // The faster the air past it, the further over; never past the most; a big pool fire is stiffer than a man's flames.
  assert.ok(flameTilt(2, 1.6) < flameTilt(4, 1.6) && flameTilt(4, 1.6) < flameTilt(8, 1.6));
  assert.ok(flameTilt(100, 1.6) <= WIND.most + 1e-9);
  const pool = flameViewBuoyant(1500, 1.4);
  assert.ok(pool > 2.5 && pool < 4, `pool's buoyant velocity ${pool}`);
  assert.ok(flameTilt(8, pool) < flameTilt(8, FLAME_VIEW.air.man));
  // A man's flames at a run (6 m/s) lean 50-70 degrees, as in footage of men running alight.
  const run = (flameTilt(6, FLAME_VIEW.air.man) * 180) / Math.PI;
  assert.ok(run > 50 && run < 70, `${run}`);
});

test('the air past a running man follows his speed, at any frame rate, and stands still while paused', () => {
  const wind = { x: 0, z: 0, speed: 0 };
  const run = (fps) => {
    const view = {};
    const key = {};
    let x = 0;
    let state = flameViewAirPast(view, key, x, 0, 1, wind, 0);
    const dt = 1 / fps;
    for (let t = 0; t < 0.3 - 1e-9; t += dt) {
      x += 6 * dt;
      state = flameViewAirPast(view, key, x, 0, 1, wind, dt);
    }
    return { state, view, key, x };
  };
  const slow = run(30);
  const fast = run(144);
  // 0.3 s is two of the follow's time constants: most of the way to -6.
  assert.ok(slow.state.airX < -4.5 && slow.state.airX > -6, `${slow.state.airX}`);
  assert.ok(Math.abs(slow.state.airX - fast.state.airX) < 0.05, `30 fps ${slow.state.airX} vs 144 fps ${fast.state.airX}`);
  // Paused (no time of the fight passes): nothing changes.
  const before = slow.state.airX;
  flameViewAirPast(slow.view, slow.key, slow.x, 0, 1, wind, 0);
  assert.equal(slow.state.airX, before);
  // The gusts are the fight's time's alone: the same moment the same wind, however it was reached.
  const base = placeWind('dunnottar', null, 'squallLine');
  const a = windNow(base, 12.5);
  const b = windNow(base, 12.5, { x: 9, z: 9, speed: 9 });
  assert.deepEqual(a, b);
  // And they do gust: the strength over a minute swings well round its mean, the way turns a little.
  let least = Infinity;
  let most = 0;
  let turn = 0;
  for (let t = 0; t < 60; t += 0.25) {
    const now = windNow(base, t);
    least = Math.min(least, now.speed);
    most = Math.max(most, now.speed);
    turn = Math.max(turn, Math.abs(Math.atan2(now.z, now.x) - Math.atan2(base.z, base.x)));
  }
  assert.ok(least < base.speed * 0.7 && most > base.speed * 1.3, `${least}..${most} of ${base.speed}`);
  assert.ok(turn > 0.05 && turn < 0.6, `${turn}`);
});

test('calm places and rooms have next to no lean; the storm leans every fire', () => {
  const axis = [0, 0, 0];
  for (const place of ['ring', 'stadium']) {
    const wind = windNow(placeWind(place), 7);
    assert.equal(wind.speed, 0, place);
    // Only the flame's own small shake.
    flameAxis(axis, wind.x, wind.z, FLAME_VIEW.air.man, 0.4, 7);
    assert.ok(tiltOf(axis) < WIND.shake.still * 1.6, `${place}: ${tiltOf(axis)}`);
  }
  // Dunnottar in its hardest look: in the open, the wind; in the vault and the sewer (under a roof), a draught.
  const world = { stage: { def: DUNNOTTAR }, arena: {} };
  assert.equal(windShelter(world, 31.2, 7, -20.9), WIND.indoors.share, 'vault');
  assert.equal(windShelter(world, -46.2, -4, 50.2), WIND.indoors.share, 'sewer');
  assert.equal(windShelter(world, -44, 1, 41.5), 1, 'cliff path');
  const squall = placeWind('dunnottar', null, 'squall');
  const pool = flameViewBuoyant(1500, 1.4);
  let indoorMost = 0;
  let outdoorSum = 0;
  let samples = 0;
  for (let t = 0; t < 30; t += 0.5) {
    const wind = windNow(squall, t);
    indoorMost = Math.max(indoorMost, flameTilt(wind.speed * WIND.indoors.share, pool));
    outdoorSum += flameTilt(wind.speed, pool);
    samples += 1;
  }
  assert.ok(indoorMost < 0.1, `a pool in the vault leans ${indoorMost} rad`);
  // (Through its lulls too: on the whole well over.)
  assert.ok(outdoorSum / samples > 0.6, `a pool in the open squall leans ${outdoorSum / samples} rad on the whole`);
  // Every look has its wind; a misty morning without one is near calm; the sea fog has its breeze.
  for (const [name, look] of Object.entries(STAGE_LOOKS)) assert.ok(look.wind?.speed >= 0 && look.wind.gust >= 0 && look.wind.gust <= 1, name);
  assert.ok(placeWind('sengoku', { fog: [12, 120] }).speed <= WIND.mistMost);
  assert.ok(placeWind('port', { fog: [8, 45], wind: { speed: 2.5, gust: 0.2 } }).speed === 2.5);
  for (const [place, wind] of Object.entries(PLACE_WIND)) assert.ok(wind.speed >= 0 && wind.speed < 15, place);
});

test('smoke goes with the wind, spreads faster in it, and stays in a room', () => {
  const puff = (shelter) => ({ at: [0, 1, 0], velocity: [0, 1.5, 0], size0: 0.35, size1: 2, grow: 1.6, alpha: 0.5, life: 6, rise: 1.5, shelter });
  const windy = puff(1);
  const still = puff(1);
  const room = puff(WIND.indoors.share);
  let windyNow;
  let stillNow;
  for (let step = 0; step < 240; step += 1) {
    windyNow = battleFxStepPuff(windy, 1 / 60, undefined, [8, 0]);
    stillNow = battleFxStepPuff(still, 1 / 60, undefined, [0, 0]);
    battleFxStepPuff(room, 1 / 60, undefined, [8, 0]);
  }
  assert.ok(windy.at[0] > 20, `${windy.at[0]}`);
  assert.ok(Math.abs(still.at[0]) < 1e-9);
  assert.ok(room.at[0] < 1.5, `${room.at[0]}`);
  assert.ok(windyNow.size > stillNow.size * 1.2, `${windyNow.size} vs ${stillNow.size}`);
});
