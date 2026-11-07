import test from 'node:test';
import assert from 'node:assert/strict';
import { OUTFITS } from '../src/outfits.js';

test('the Ming elite coat is heavier-plated than the Japanese armour; its arms and the Ming horseman\'s in solid steel', () => {
  const elite = OUTFITS.mingElite;
  const tosei = OUTFITS.samuraiTosei;
  assert.ok(elite.bulletRating >= tosei.bulletRating, 'proof against a ball at least as the tōsei dō');
  assert.ok(elite.protection.bullet.torso >= tosei.protection.bullet.torso);
  assert.ok(elite.protection.blunt >= tosei.protection.blunt && elite.protection.blunt > OUTFITS.ashigaru.protection.blunt);
  assert.ok(elite.extraMass > tosei.extraMass, 'more iron in it');
  for (const kind of ['mingElite', 'mingIronLamellar']) {
    for (const part of ['UpperArm', 'Forearm']) {
      const guard = OUTFITS[kind].protection.regions[part];
      assert.ok(guard.deflects && guard.pierce > OUTFITS[kind].protection.pierce, `${kind} ${part}: solid steel`);
    }
  }
  // The regulars and the garrison as they were.
  assert.equal(OUTFITS.mingBrigandine.protection.regions.Forearm.pierce, 0.15);
  assert.equal(OUTFITS.mingGarrison.protection.pierce, 0.05);
});
