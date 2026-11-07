import test from 'node:test';
import assert from 'node:assert/strict';
import { gearTraits, layeredProtection, UNDER_ARMOUR } from '../src/outfits.js';
import { bannerman } from '../src/cast.js';
import { protectionAt, seededRandom } from '../src/physics.js';
import { gapUnder } from '../src/physics/gaps.js';

const mail = UNDER_ARMOUR.mail;

test('a layer under a coat stops what its material stops of what the coat lets through, only where it lies', () => {
  const coat = { blunt: 0.7, cut: 0.9, pierce: 0.7, bullet: { head: 0.4, torso: 0.5, limb: 0.1 } };
  const both = layeredProtection(coat, mail);
  assert.ok(Math.abs(both.regions.torso.pierce - (1 - 0.3 * (1 - mail.guard.pierce))) < 1e-9);
  assert.ok(Math.abs(both.regions.UpperArm.cut - (1 - 0.1 * (1 - mail.guard.cut))) < 1e-9);
  assert.ok(Math.abs(both.bullet.torso - (1 - 0.5 * (1 - mail.bullet))) < 1e-9);
  // The head and the forearms are not under the shirt.
  assert.equal(both.regions.head, undefined);
  assert.equal(both.regions.Forearm, undefined);
  assert.equal(layeredProtection(coat, null), coat);
});

test('the front-rank banner men and the Bayara wear mail under the coat; the archers do not', () => {
  const random = seededRandom(7);
  const spear = gearTraits(bannerman(random, 'spear'));
  const archer = gearTraits(bannerman(random, 'manchuBow'));
  const bayara = gearTraits(bannerman(random, 'dao', 'bayara'));
  assert.equal(spear.under, mail);
  assert.equal(archer.under, null);
  assert.equal(bayara.under, mail);
  assert.ok(Math.abs(spear.extraMass - archer.extraMass - mail.extraMass) < 1e-9, 'the shirt weighs');
  assert.ok(protectionAt(spear, 'trunk').pierce > protectionAt(archer, 'trunk').pierce);
  assert.equal(protectionAt(spear, 'head').pierce, protectionAt(archer, 'head').pierce);
  // A point that parts the coat's lacing, or finds the armpit, meets the rings under it; the archer's, his quilting.
  assert.deepEqual(gapUnder(spear, 'armpit', protectionAt(spear, 'trunk')), mail.guard);
  assert.ok(gapUnder(archer, 'lacing', protectionAt(archer, 'trunk')).pierce < mail.guard.pierce);
  assert.deepEqual(gapUnder(bayara, 'lacing', protectionAt(bayara, 'trunk')), mail.guard);
});
