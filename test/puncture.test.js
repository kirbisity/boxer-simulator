// A point against armour (weapons.js PUNCTURE, pointThrough): stopped outright short of the armour's puncture, which grows with
// the armour's `pierce` and the point's width; past it, going in steeply. The cases it was set against.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OUTFITS } from '../src/outfits.js';
import { ARROW, pointThrough, pointWidthOf, PUNCTURE, punctureOf, WEAPONS } from '../src/weapons.js';

const MAIL = 0.65;
const PLATE = OUTFITS.knight.protection.pierce;
const JOUST = OUTFITS.tournament.protection.pierce;
const BRIGANDINE = OUTFITS.mingBrigandine.protection.pierce;
// The strike's draw at either end of the spread: the hardest place on the armour, and the weakest.
const hardest = 1;
const weakest = 0;

test('puncture: nothing through below it, all of it through bare skin, and steeply more past it', () => {
  assert.equal(pointThrough(100, 0), 1, 'bare: all of it');
  const proof = punctureOf(MAIL);
  assert.equal(pointThrough(proof * 0.95, MAIL), 0, 'just short: nothing');
  const just = pointThrough(proof * 1.1, MAIL);
  const well = pointThrough(proof * 2, MAIL);
  assert.ok(just > 0 && just < 0.1 && well > 0.35, `${just.toFixed(2)} just past, ${well.toFixed(2)} at twice it`);
  assert.ok(well < 1 - PUNCTURE.after * MAIL + 1e-9, 'the hole and the padding still hold some');
});

test('puncture: a wider point needs the more, in proportion (a bodkin goes where a sword\'s point stops)', () => {
  assert.ok(Math.abs(punctureOf(PLATE, 0.03) / punctureOf(PLATE, 0.01) - 3) < 1e-9);
  assert.ok(pointWidthOf(WEAPONS.katana) > 2 * PUNCTURE.width, 'a sword\'s point over twice a bodkin\'s');
  assert.ok(pointWidthOf(WEAPONS.spear) > pointWidthOf(WEAPONS.lance), 'a leaf spear head broader than a lance\'s');
});

test('arrows: a war arrow stands in mail, a crossbow\'s bolt goes through it; neither through lamellar, a brigandine or plate', () => {
  assert.ok(pointThrough(ARROW.joules, MAIL, hardest) === 0 && pointThrough(ARROW.joules, MAIL, weakest) < 0.3, 'a war arrow: stopped, or shallow');
  assert.ok(pointThrough(170, MAIL) > 0.3, 'a crossbow bolt goes in');
  assert.equal(pointThrough(ARROW.joules, OUTFITS.hanSoldier.protection.pierce, weakest), 0, 'a war arrow on iron lamellar');
  assert.equal(pointThrough(130, PLATE, weakest), 0, 'a heavy war arrow on plate');
  // (A brigandine, 0.85, proof against a cut and a war arrow, not a charge: a heavy one finds its weakest plates now and then.)
  assert.equal(pointThrough(ARROW.joules, BRIGANDINE, weakest), 0, 'a war arrow on a brigandine');
  assert.equal(pointThrough(130, BRIGANDINE, 0.5), 0, 'a heavy war arrow on a brigandine, as a rule');
  assert.ok(pointThrough(ARROW.joules, OUTFITS.archer.protection.pierce) > 0.4, 'through a padded coat');
});

test('hand thrusts: a spear on foot stops on a brigandine and plate; the hardest sword lunge on plate', () => {
  for (const pierce of [BRIGANDINE, PLATE]) assert.equal(pointThrough(150, pierce, weakest, pointWidthOf(WEAPONS.spear)), 0);
  // (At the plate's middling place: at its weakest, rarely, it goes in.)
  assert.equal(pointThrough(600, PLATE, 0.5, pointWidthOf(WEAPONS.katana)), 0);
});

test('the couched lance: at the full gallop met square it goes through a harness; a slower charge does not; a jousting harness stops it', () => {
  const width = pointWidthOf(WEAPONS.lance);
  assert.ok(pointThrough(1000, PLATE, 0.5, width) > 0.15, 'the full gallop');
  assert.equal(pointThrough(500, PLATE, weakest, width), 0, 'a slower charge');
  assert.equal(pointThrough(1000, JOUST, 0.5, width), 0, 'the jousting harness');
});
