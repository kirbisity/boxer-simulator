import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs, P } from '../src/body.js';
import { canRide, isMounted } from '../src/horses.js';
import { createWorld } from '../src/physics.js';
import { WARRIORS } from '../src/roster.js';
import { inZone, MUSTER, musterLevel, roomFor, unitOf } from '../src/muster.js';
import { changeBattle, CUSTOM_BATTLE, customFactions, customLevel, customSetup, customUnitsOf, firstBattle, readCustomBattle, settleBattle, writeCustomBattle } from '../src/custombattle.js';

const memoryStorage = () => {
  const kept = new Map();
  return { getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => kept.set(key, String(value)), kept };
};
const brokenStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
const men = (unit, count, at = [0, 0]) => Array.from({ length: count }, () => ({ unit, at }));

test('every faction offered has fighters, and each of its units makes a man of itself: on horse only where his people rode', () => {
  const factions = customFactions();
  assert.ok(factions.length >= 10, factions.map((faction) => faction.key).join());
  for (const { key } of factions) {
    const units = customUnitsOf(key);
    assert.ok(units.length, key);
    assert.equal(new Set(units.map((unit) => unit.id)).size, units.length, `${key}: unit ids are unique`);
    for (const unit of units) {
      const man = unit.make();
      assert.equal(unitOf(units, man)?.id, unit.id, `${key}: ${unit.id} is known again`);
      assert.equal(isMounted(man), unit.mounted, `${key}: ${unit.id} rides as it says`);
      if (unit.mounted) assert.ok(canRide(man), `${key}: ${unit.id} rides a horse his kit has`);
    }
  }
  // Every fighter of the roster is offered by his faction.
  for (const warrior of WARRIORS) assert.ok(customUnitsOf(warrior.faction).some((unit) => unit.warrior === warrior.key), warrior.key);
  // The Mexica never saw a horse before the Spaniards: no riders among them.
  assert.ok(customUnitsOf('mexica').every((unit) => !unit.mounted));
});

test('a custom battle is a level on its chosen ground: its floor, its units, the caps, each man where he was put', () => {
  const battle = settleBattle({ map: 'sengoku', factions: { red: 'romans', blue: 'steppe' }, sides: { red: { men: men('legionary', 6, [-8, 1]) }, blue: { men: men('steppeArcher.horse', 4, [9, -2]) } } });
  const level = customLevel(battle);
  assert.equal(level.scene, 'sengoku');
  assert.deepEqual(level.arena, CUSTOM_BATTLE.maps.sengoku.arena);
  assert.deepEqual(level.caps, CUSTOM_BATTLE.caps);
  assert.deepEqual(level.sideNames, { red: 'Rome', blue: 'Steppe' });
  const cast = level.cast();
  assert.equal(cast.red.length, 6);
  assert.equal(cast.blue.length, 4);
  assert.ok(cast.blue.every(isMounted), 'the horse archers ride');
  assert.deepEqual(level.places.red[0], [-8, 1]);
});

test('a custom battle is fought from its setup: every man where he was put, the riders on their horses', () => {
  const battle = settleBattle({ map: 'field', factions: { red: 'knights', blue: 'japanese' }, sides: { red: { men: [...men('plate', 3, [-6, 0]), { unit: 'plate.horse', at: [-12, 8] }] }, blue: { men: men('ashigaruSpear', 4, [7, -3]) } } });
  const setup = customSetup(battle);
  const level = musterLevel(customLevel(setup.battle), setup);
  const cast = level.cast();
  const world = createWorld(['red', 'blue'].flatMap((corner) => cast[corner].map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner }))), { seed: 2, arena: level.arena, formation: level.formation });
  assert.equal(world.fighters.length, 8);
  const rider = world.fighters.find((fighter) => fighter.corner === 'red' && fighter.mount);
  assert.ok(rider, 'the knight on horse rides');
  for (const fighter of world.fighters) {
    const at = [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
    const wanted = fighter.mount ? [-12, 8] : fighter.corner === 'red' ? [-6, 0] : [7, -3];
    assert.ok(Math.hypot(at[0] - wanted[0], at[1] - wanted[1]) < 1.5, `${fighter.corner} at ${at.map((v) => v.toFixed(1))}, put at ${wanted}`);
  }
});

test('a battle is kept inside its bounds: the caps a side and in all, known ground and units, every man on his side\'s ground', () => {
  const big = settleBattle({ map: 'nowhere', factions: { red: 'knights', blue: 'atlantis' }, sides: { red: { men: [...men('plate', 60, [-5, 0]), ...men('ghost', 3)] }, blue: { men: men('oyoroi', 40, [5, 0]) } } });
  assert.equal(big.map, CUSTOM_BATTLE.first.map);
  assert.equal(big.factions.blue, CUSTOM_BATTLE.first.factions.blue);
  assert.ok(big.sides.red.men.length <= CUSTOM_BATTLE.caps.side);
  assert.ok(big.sides.red.men.length + big.sides.blue.men.length <= CUSTOM_BATTLE.caps.total);
  assert.equal(big.sides.red.men.length + big.sides.blue.men.length, CUSTOM_BATTLE.caps.total);
  assert.ok(big.sides.red.men.every((man) => man.unit === 'plate'), 'no unit the faction has not');
  // A man put on the enemy's ground is brought back onto his own.
  const strayed = settleBattle({ map: 'town', factions: { red: 'knights', blue: 'japanese' }, sides: { red: { men: men('plate', 1, [40, 30]) }, blue: { men: men('oyoroi', 1, [-40, 0]) } }, lead: { corner: 'blue', index: 5 } });
  const level = customLevel(strayed);
  assert.ok(inZone(level, 'red', strayed.sides.red.men[0].at));
  assert.ok(inZone(level, 'blue', strayed.sides.blue.men[0].at));
  assert.equal(strayed.lead, null, 'a man played who is not there is nobody');
  // The setup screen's room under the caps: a side's, then both together's.
  assert.equal(roomFor({ caps: CUSTOM_BATTLE.caps }, { red: 50, blue: 0 }, 'red', 5), 2);
  assert.equal(roomFor({ caps: CUSTOM_BATTLE.caps }, { red: 40, blue: 28 }, 'blue', 5), 2);
  assert.equal(roomFor({}, { red: 10, blue: 50 }, 'red', 5), 5, 'a set battle: MUSTER.cap a side, no cap in all');
  assert.equal(roomFor({}, { red: MUSTER.cap, blue: 0 }, 'red', 1), 0);
});

test('the last custom battle is kept in the browser and comes back as it was; a browser that will not keep it, or a garbled memory, starts afresh', () => {
  const storage = memoryStorage();
  assert.deepEqual(readCustomBattle(storage), firstBattle(), 'a first visit');
  const battle = settleBattle({ map: 'cajamarca', factions: { red: 'ottomans', blue: 'chinese' }, sides: { red: { men: men('janissary', 5, [-5, 2]), formation: 'wedge' }, blue: { men: men('mingSpear', 7, [6, -1]), formation: 'hand' } }, lead: { corner: 'blue', index: 2 } });
  assert.ok(writeCustomBattle(battle, storage));
  assert.deepEqual(readCustomBattle(storage), battle);
  storage.setItem(CUSTOM_BATTLE.storageKey, '{not json');
  assert.deepEqual(readCustomBattle(storage), firstBattle());
  assert.equal(writeCustomBattle(battle, brokenStorage), false);
  assert.deepEqual(readCustomBattle(brokenStorage), firstBattle());
  assert.deepEqual(readCustomBattle(null), firstBattle());
});

test('a first visit has men on both sides; a new faction starts its side afresh; new ground draws both sides up on it', () => {
  const first = firstBattle();
  assert.ok(first.sides.red.men.length && first.sides.blue.men.length);
  const changed = changeBattle(first, { factions: { blue: 'gladiators' } });
  assert.deepEqual(changed.sides.red, first.sides.red, 'the side not changed is kept');
  assert.ok(changed.sides.blue.men.every((man) => customUnitsOf('gladiators').some((unit) => unit.id === man.unit)));
  const moved = changeBattle(changed, { map: 'port' });
  const level = customLevel(moved);
  for (const corner of ['red', 'blue']) {
    assert.equal(moved.sides[corner].men.length, changed.sides[corner].men.length);
    assert.ok(moved.sides[corner].men.every((man) => inZone(level, corner, man.at, 1e-9)), `${corner} on the port's floor`);
  }
});
