import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs, P, PRESETS } from '../src/body.js';
import { advance, createWorld, placeFighter, point } from '../src/physics.js';
import { loadStop, MAGAZINE_CHANGE, reloadKind, reloadProps, TUBE_LOAD } from '../src/physics/ranged.js';
import { RIFLE, SHOTGUN, WEAPONS } from '../src/weapons.js';

test('each gun is loaded its own way: a magazine changed, a tube fed, a barrel rammed, a crossbow spanned, a cylinder charged', () => {
  const kinds = Object.fromEntries(Object.entries(WEAPONS).filter(([, spec]) => spec.shot).map(([kind, spec]) => [kind, reloadKind(spec.shot)]));
  assert.equal(kinds.rifle, 'magazine');
  assert.equal(kinds.shotgun, 'tube');
  assert.equal(kinds.matchlock, 'muzzle');
  assert.equal(kinds.threeEyed, 'muzzle');
  assert.equal(kinds.crossbow, 'span');
  assert.equal(kinds.nu, 'span');
  assert.equal(kinds.adams, 'cylinder');
  assert.equal(reloadKind(undefined), null, 'no shot, nothing to load');
});

/** A gunner of `style`, his gun emptied and being loaded, nobody thinking, `seconds` into it. */
function loading(style, seconds) {
  const inputs = normaliseInputs({ ...structuredClone(PRESETS.contender), sex: 'male', style, accessories: [] });
  const world = createWorld([{ inputs, corner: 'red' }, { inputs: normaliseInputs(structuredClone(PRESETS.contender)), corner: 'blue' }], { seed: 2, arena: { halfX: 14, halfZ: 6 } });
  placeFighter(world.fighters[0], -10, 0);
  placeFighter(world.fighters[1], 10, 0);
  advance(world, 0.5);
  const gunner = world.fighters[0];
  gunner.weapon.loaded = false;
  gunner.weapon.charges = 0;
  gunner.weapon.reloaded = 0;
  gunner.reloading = true;
  advance(world, seconds);
  return gunner;
}

test('a magazine change keeps the AR-15 level before the chest (no ramrod, the gun not stood up), done in its couple of seconds; a shotgun is fed low, muzzle up; a matchlock stands upright', () => {
  const rifle = loading('rifle', 1);
  assert.ok(rifle.weapon.dir[1] < 0.1, `the rifle's muzzle forward, a little down (${rifle.weapon.dir[1].toFixed(2)})`);
  // The support hand leaves the handguard for the pouch and comes back: far from the handguard at the pouch, on it again at the end.
  const handguard = MAGAZINE_CHANGE.stops[0].gun[0];
  const offGuard = (seconds) => {
    const gunner = loading('rifle', seconds);
    const main = point(gunner.x, P[`${gunner.weapon.main}Hand`]);
    const guard = main.map((v, axis) => v + gunner.weapon.dir[axis] * handguard);
    return Math.hypot(...point(gunner.x, P[`${gunner.weapon.off}Hand`]).map((v, axis) => v - guard[axis]));
  };
  const atPouch = offGuard(MAGAZINE_CHANGE.take * RIFLE.reloadSeconds);
  const back = offGuard(RIFLE.reloadSeconds * 0.98);
  assert.ok(atPouch > 0.2 && back < atPouch / 2, `off to the pouch (${atPouch.toFixed(2)} m from the handguard), back on it (${back.toFixed(2)} m)`);
  const shotgun = loading('shotgun', 1);
  assert.ok(shotgun.weapon.dir[1] > 0.15 && shotgun.weapon.dir[1] < 0.8, `the shotgun's muzzle up and forward (${shotgun.weapon.dir[1].toFixed(2)})`);
  const matchlock = loading('matchlock', 1);
  assert.ok(matchlock.weapon.dir[1] > 0.85, 'the matchlock upright for the rod');
  const done = loading('rifle', RIFLE.reloadSeconds + 0.3);
  assert.equal(done.weapon.loaded, true, 'a fresh magazine in, in its reload time');
  assert.equal(done.weapon.charges, RIFLE.rounds);
});

test('the magazine change: the empty drops, the support hand goes to the chest pouch and back to the well, a fresh one in it between', () => {
  const H = 1.8;
  const hand = MAGAZINE_CHANGE.hand.map((v) => v * H);
  const dir = MAGAZINE_CHANGE.dir;
  const atPouch = loadStop(MAGAZINE_CHANGE, MAGAZINE_CHANGE.take, hand, dir, 1, H);
  const pouch = MAGAZINE_CHANGE.pouch.map((v) => v * H);
  assert.ok(Math.hypot(...atPouch.map((v, i) => v - pouch[i])) < 1e-9, 'at the pouch as it takes the fresh one');
  const rightPouch = loadStop(MAGAZINE_CHANGE, MAGAZINE_CHANGE.take, hand, dir, -1, H);
  assert.ok(rightPouch[2] < 0 && atPouch[2] > 0, 'the pouch is on the support hand\'s side');
  const seated = loadStop(MAGAZINE_CHANGE, MAGAZINE_CHANGE.seat, hand, dir, 1, H);
  assert.ok(seated[1] < hand[1], 'the well is under the gun');
  const weapon = { spec: WEAPONS.rifle, loaded: false, reloaded: 0 };
  const fighter = { reloading: true };
  const at = (share) => reloadProps(fighter, { ...weapon, reloaded: share * RIFLE.reloadSeconds });
  assert.deepEqual([at(0).onGun, at(0).inHand, at(0).dropAge], [true, false, null], 'at first, the empty still in');
  assert.deepEqual([at(0.2).onGun, at(0.2).inHand], [false, false], 'dropped; the hand on its way to the pouch');
  assert.ok(at(0.2).dropAge > 0);
  assert.deepEqual([at(0.5).onGun, at(0.5).inHand], [false, true], 'the fresh one in the hand');
  assert.deepEqual([at(0.9).onGun, at(0.9).inHand], [true, false], 'seated');
  assert.equal(reloadProps({ reloading: false }, weapon), null, 'not reloading, nothing to draw');
  assert.equal(reloadProps(fighter, { spec: WEAPONS.matchlock, loaded: false, reloaded: 1 }), null, 'a matchlock has no magazine');
  // A shotgun: a shell in the hand from the belt to the port, for each round.
  const perShell = SHOTGUN.reloadSeconds / SHOTGUN.rounds;
  const shell = (share) => reloadProps(fighter, { spec: WEAPONS.shotgun, loaded: false, reloaded: 2 * perShell + share * perShell });
  assert.equal(shell(0.2).inHand, true);
  assert.equal(shell(TUBE_LOAD.pushed + 0.1).inHand, false, 'pushed into the tube');
});
