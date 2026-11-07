import test from 'node:test';
import assert from 'node:assert/strict';
import { MATCHLOCK, NIAOCHONG, THREE_EYED, WEAPONS } from '../src/weapons.js';
import { mingSoldier, sengokuWarrior } from '../src/cast.js';
import { createWorld, seededRandom } from '../src/physics.js';

test('the Ming bird gun is the teppō\'s bore and ball, made worse; the three-eyed gun short and wild', () => {
  assert.equal(NIAOCHONG.energy, MATCHLOCK.energy);
  assert.equal(NIAOCHONG.reloadSeconds, MATCHLOCK.reloadSeconds);
  assert.ok(NIAOCHONG.spread > MATCHLOCK.spread && NIAOCHONG.misfire > MATCHLOCK.misfire);
  assert.ok(THREE_EYED.energy < MATCHLOCK.energy && THREE_EYED.spread > NIAOCHONG.spread);
  assert.equal(WEAPONS.matchlock.makes.chinese.shot, NIAOCHONG);
});

test('a Ming gunner carries the bird gun, a Japanese the teppō', () => {
  const random = seededRandom(5);
  const side = { tint: '#b3161b', banner: null };
  const world = createWorld([mingSoldier(random, 'matchlock', 'brigandine'), sengokuWarrior(random, side, 'matchlock', 'ashigaru')], { seed: 2 });
  const [ming, japanese] = world.fighters;
  assert.equal(ming.weapon.make, 'chinese');
  assert.equal(ming.weapon.spec.shot, NIAOCHONG);
  assert.equal(japanese.weapon.make, null);
  assert.equal(japanese.weapon.spec.shot, MATCHLOCK);
});
