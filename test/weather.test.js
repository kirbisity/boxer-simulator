import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, WEATHER_MIST } from '../src/scenarios.js';
import { JIANGNAN_PLAN } from '../src/props/jiangnan.js';

test('the misty levels are the wokou raid, the rebellion, Sekigahara and Pier 9 (sea fog); Pyongyang, in the same place as Sekigahara, is clear', () => {
  const misty = Object.entries(SCENARIOS).filter(([, scenario]) => scenario.weather?.fog).map(([id]) => id).sort();
  assert.deepEqual(misty, ['port', 'rebellion', 'sekigahara', 'wokou']);
  // Pier 9's fog is a night fog: dim and warm (the sodium light in it), and the lamps glow.
  const sea = SCENARIOS.port.weather;
  const [r, g, b] = [(sea.colour >> 16) & 255, (sea.colour >> 8) & 255, sea.colour & 255];
  assert.ok(r >= g && g >= b && r < 80, 'dim warm grey');
  assert.equal(sea.halos, true);
  assert.equal(SCENARIOS.pyongyang.scene, SCENARIOS.sekigahara.scene);
  assert.equal(SCENARIOS.pyongyang.weather, undefined);
});

test('the mist is light and its far edge leaves the sky inside the camera\'s reach', () => {
  for (const [id, [near, far]] of Object.entries(WEATHER_MIST)) {
    assert.ok(near >= 0 && near < far, `${id}: near ${near} before far ${far}`);
    // The camera's far plane comes in to just past the fog's far edge: the sky dome (radius 40) and the photograph (30) must stay inside it.
    assert.ok(far >= 45, `${id}: fog far ${far} m`);
    // Light: the far edge of the level's own fighting floor is at most half fogged from its centre.
    const arena = SCENARIOS[id].arena;
    const edge = Math.hypot(arena.halfX, arena.halfZ);
    assert.ok((edge - near) / (far - near) <= 0.5, `${id}: ${(((edge - near) / (far - near)) * 100).toFixed(0)}% at the floor's corner`);
  }
});

test('the wokou raid is fought in the water town, its floor clear of the houses, the canal and the bridge', () => {
  const wokou = SCENARIOS.wokou;
  assert.equal(wokou.scene, 'jiangnan');
  const { halfX, halfZ } = wokou.arena;
  const { canal, west, east, north } = JIANGNAN_PLAN;
  assert.ok(-halfX > west + 1 && halfX < east - 1, 'between the west and east rows');
  assert.ok(-halfZ > north + 1, 'short of the north row');
  assert.ok(halfZ < canal.near - 1, 'short of the canal');
  // The bridge's foot on the square's side (src/props/jiangnan.js: it starts 1.9 m short of the canal).
  assert.ok(canal.near - 1.9 > halfZ, 'short of the bridge');
});
