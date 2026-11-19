// A man's weapons by slot (loadout.js): the first his style's, the second at his belt from what his kit carried, the third at
// his saddle for a man who rides; the second by his first unless he chose; drawn in turn as each is lost (physics.js rearm).

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, normaliseInputs, PRESETS } from '../src/body.js';
import { createWorld, dropWeapon } from '../src/physics.js';
import { carriedAs, drawnStyle, KIT_ARMS, resolveArms, secondOptions, thirdOptions } from '../src/loadout.js';
import { OUTFITS } from '../src/outfits.js';
import { STYLES } from '../src/moves.js';
import { WEAPONS } from '../src/weapons.js';

const second = (preset) => buildBody(normaliseInputs(structuredClone(PRESETS[preset]))).gear.sidearm;

test('the second by the first: the hammer knight a longsword, the kanabo and the odachi samurai a katana, a swordsman his short blade', () => {
  assert.equal(second('warhammer'), 'longsword');
  assert.equal(second('knight'), 'dagger');
  assert.equal(second('kanabo'), 'katana');
  assert.equal(second('odachi'), 'katana');
  assert.equal(second('samurai'), 'wakizashi');
  assert.equal(second('naginata'), 'katana');
  assert.equal(second('longbow'), 'shortSword');
  // The ashigaru his wakizashi alone (the katana a samurai's); the Ming garrison man nothing.
  assert.equal(second('yari'), 'wakizashi');
  assert.ok(!secondOptions(normaliseInputs(structuredClone(PRESETS.yari))).includes('katana'));
  assert.equal(second('mingSpear'), null);
  // The arena's men carry nothing at the belt.
  assert.equal(second('maximus'), null);
});

test('only what the kit carried: every choice a real weapon carried at the belt or the saddle, his first never among them', () => {
  for (const [kind, arms] of Object.entries(KIT_ARMS)) {
    assert.ok(OUTFITS[kind], `${kind} is a kit`);
    for (const weapon of [...arms.second, ...(arms.third ?? [])]) {
      assert.ok(WEAPONS[weapon], `${kind}: ${weapon}`);
      assert.ok(carriedAs(weapon), `${kind}: ${weapon} is carried`);
      assert.ok(drawnStyle(weapon), `${kind}: ${weapon} has a style to fight in`);
    }
  }
  const samurai = normaliseInputs(structuredClone(PRESETS.samurai));
  assert.ok(!secondOptions(samurai).includes('flangedMace'), 'no mace for a samurai');
  assert.ok(!secondOptions(samurai).includes('katana'), 'not his own first again');
  assert.deepEqual(thirdOptions(samurai), [], 'no saddle weapon on foot');
  assert.ok(thirdOptions({ ...normaliseInputs(structuredClone(PRESETS.knight)), mounted: true }).includes('flangedMace'));
  // No style drawn from the belt brings a shield.
  for (const weapon of ['armingSword', 'sayf', 'flangedMace', 'saber']) assert.ok(!STYLES[drawnStyle(weapon)].shield || ['armingSword', 'sayf'].includes(weapon));
});

test('his own choice stands where the kit allows it; none is a choice; a weapon the kit never carried is not', () => {
  const knight = normaliseInputs(structuredClone(PRESETS.warhammer));
  assert.equal(resolveArms({ ...knight, arms: { second: 'dagger' } }).second, 'dagger');
  assert.equal(resolveArms({ ...knight, arms: { second: 'none' } }).second, null);
  assert.equal(resolveArms({ ...knight, arms: { second: 'katana' } }).second, 'longsword');
  assert.equal(resolveArms({ ...knight, mounted: true, arms: { third: 'flangedMace' } }).third, 'flangedMace');
});

test('drawn in turn: the first lost, the second from the belt (no shield with it); in the saddle, the third after it', () => {
  const world = createWorld([structuredClone(PRESETS.warhammer), structuredClone(PRESETS.contender)], { seed: 1 });
  const [knight] = world.fighters;
  dropWeapon(world, knight, 'test');
  assert.equal(knight.weapon?.kind, 'longsword');
  assert.ok(!knight.shield, 'no shield came with the sword');
  dropWeapon(world, knight, 'test');
  assert.ok(knight.weapon?.kind !== 'longsword');
  const riding = createWorld([{ inputs: { ...structuredClone(PRESETS.knight), style: 'lance', mounted: true }, corner: 'red' }, structuredClone(PRESETS.contender)], { seed: 1 });
  const [rider] = riding.fighters;
  assert.equal(rider.body.gear.sidearm, 'longsword');
  assert.equal(rider.body.gear.saddle, 'flangedMace');
  if (rider.mount) {
    dropWeapon(riding, rider, 'test');
    assert.equal(rider.weapon?.kind, 'longsword');
    dropWeapon(riding, rider, 'test');
    assert.equal(rider.weapon?.kind, 'flangedMace', 'the mace from the saddle');
  }
});
