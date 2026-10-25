// The far field (audio/farfield.js): men past the ear's circle are counted into 8 sectors round it by the camera, the fighting ones
// apart; the side they are on is the side they are heard from, and more men or nearer men are louder. Over a real battle.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { createListener, placeListener } from '../src/audio/ear.js';
import { FAR_FIELD, countSectors, createSectors, sectorAzimuth, sectorLevels, sectorOf } from '../src/audio/farfield.js';
import { scenarioWorld } from '../src/scenarios.js';

/** A camera looking toward -z (yaw 0) or turned by `yaw`, at the origin. */
const camera = (yaw = 0) => [Math.cos(yaw), 0, -Math.sin(yaw), 0, 0, 1, 0, 0, Math.sin(yaw), 0, Math.cos(yaw), 0, 0, 1.7, 0, 1];
const man = (x, z, extra = {}) => {
  const fighter = { x: new Float64Array(60), state: 'up', contacts: new Set(), punch: null, ...extra };
  fighter.x[P.pelvis * 3] = x;
  fighter.x[P.pelvis * 3 + 2] = z;
  return fighter;
};

test('sectors are the camera\'s: 0 ahead, 2 on the right, 4 behind, 6 on the left', () => {
  assert.equal(sectorOf(0), 0);
  assert.equal(sectorOf(Math.PI / 2), 2);
  assert.equal(sectorOf(Math.PI), 4);
  assert.equal(sectorOf(-Math.PI), 4);
  assert.equal(sectorOf(-Math.PI / 2), 6);
  assert.ok(Math.abs(sectorAzimuth(6) + Math.PI / 2) < 1e-9);
});

test('men past the circle are counted on the side they stand, the fighting ones apart; the near ones are not', () => {
  const listener = placeListener(createListener(), [0, 1.7, 0], camera(0));
  const sectors = createSectors();
  const fighters = [man(40, 0, { punch: {} }), man(42, 3, { punch: {} }), man(45, -2), man(0, -60), man(-30, 0), man(3, 3), man(0, 30, { state: 'out' })];
  countSectors(fighters, listener, sectors);
  assert.deepEqual([...sectors.men], [1, 0, 3, 0, 0, 0, 1, 0]);
  assert.deepEqual([...sectors.fighting], [0, 0, 2, 0, 0, 0, 0, 0]);
  const right = sectorLevels(sectors, 2);
  const left = sectorLevels(sectors, 6);
  assert.ok(right.shout > left.shout, 'three men and a fight on the right are louder than one man on the left');
  assert.ok(Number.isFinite(right.clash) && !Number.isFinite(left.clash), 'only the fighting clash');
  // Turned half round, the same men are on the other side.
  placeListener(listener, [0, 1.7, 0], camera(Math.PI));
  countSectors(fighters, listener, sectors);
  assert.equal(sectors.men[6], 3);
  assert.equal(sectors.men[2], 1);
});

test('a real battle: every man past 20 m counted once, the energy summed as incoherent sources', () => {
  const world = scenarioWorld('legion', 1);
  // (The ear off the end of the field, as a man on the flank hears it.)
  const listener = placeListener(createListener(), [-30, 1.7, 0], camera(0.4));
  const sectors = createSectors();
  countSectors(world.fighters, listener, sectors);
  const far = world.fighters.filter((fighter) => Math.hypot(fighter.x[P.pelvis * 3] + 30, fighter.x[P.pelvis * 3 + 2]) > 20).length;
  assert.equal(sectors.men.reduce((a, b) => a + b, 0), far);
  assert.ok(far > 20);
  // Twice as many men at the same distance are 3 dB louder.
  const one = createSectors();
  const two = createSectors();
  placeListener(listener, [0, 1.7, 0], camera(0.4));
  countSectors([man(50, 0)], listener, one);
  countSectors([man(50, 0), man(50, 0)], listener, two);
  const s = one.men.findIndex((count) => count === 1);
  assert.ok(Math.abs(sectorLevels(two, s).shout - sectorLevels(one, s).shout - 10 * Math.log10(2)) < 1e-9);
  assert.ok(Math.abs(sectorLevels(one, s).shout - (FAR_FIELD.shoutIdle - 20 * Math.log10(50))) < 1e-9);
});
