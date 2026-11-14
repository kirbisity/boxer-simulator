import test from 'node:test';
import assert from 'node:assert/strict';
import { HORSES, canRide, mountOf } from '../src/horses.js';
import { mingHorseman, mingSoldier } from '../src/cast.js';
import { seededRandom } from '../src/physics.js';

test('each breed stands and weighs within its sources', () => {
  // [withers m low, high, mass kg low, high]
  const bounds = {
    destrier: [1.42, 1.57, 450, 600], warhorse: [1.42, 1.57, 420, 550], arabian: [1.42, 1.52, 380, 450],
    turkoman: [1.45, 1.6, 400, 450], steppe: [1.22, 1.42, 250, 370], mingBorder: [1.32, 1.4, 320, 400], japanese: [1.25, 1.35, 250, 350],
  };
  for (const [breed, [low, high, light, heavy]] of Object.entries(bounds)) {
    const horse = HORSES[breed];
    assert.ok(horse.withers >= low && horse.withers <= high, `${breed} withers ${horse.withers}`);
    assert.ok(horse.mass >= light && horse.mass <= heavy, `${breed} mass ${horse.mass}`);
  }
  assert.ok(HORSES.mingBorder.withers > HORSES.japanese.withers && HORSES.mingBorder.mass > HORSES.japanese.mass, 'the Ming horse a little bigger than the Japanese');
  assert.ok(HORSES.destrier.accel < HORSES.steppe.accel && HORSES.destrier.lateral < HORSES.steppe.lateral, 'the heaviest the slowest away and widest in a turn');
});

test('the Ming horsemen ride the border horse, and so does a Ming foot soldier put on a horse', () => {
  const random = seededRandom(3);
  assert.equal(mountOf(mingHorseman(random, 'dao')).breed, 'mingBorder');
  assert.equal(mountOf(mingSoldier(random, 'dao', 'elite')).breed, 'mingBorder');
  // A garrison man's kit names no horse: put on one, he rides his own army's (horses.js peopleHorse), not the Han cavalry's.
  const levy = mingSoldier(random, 'spear', 'garrison');
  assert.equal(canRide(levy), true);
  assert.equal(mountOf(levy).breed, 'mingBorder');
});
