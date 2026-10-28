import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs, P } from '../src/body.js';
import { createWorld, seededRandom } from '../src/physics.js';
import { factionOf } from '../src/outfits.js';
import { ARMIES, battleOf, SCENARIOS } from '../src/scenarios.js';
import { countUnits, drawUp, formationsOf, inZone, leadOf, MUSTER, musterLevel, unitOf, unitsOf, zoneOf } from '../src/muster.js';

const BATTLES = Object.keys(SCENARIOS).filter((key) => SCENARIOS[key].cast);
const spot = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
const worldOf = (level, cast, seed = 3) => createWorld(['red', 'blue'].flatMap((corner) => cast[corner].map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner }))), { seed, arena: level.arena, rules: level.rules, formation: level.formation });
// The guns (not a bow or a crossbow): none before the fifteenth century.
const GUNS = ['matchlock', 'threeEyed', 'handgun', 'revolver', 'rifle', 'shotgun'];
const gun = (style) => GUNS.includes(style);

test('every battle names its sides\' armies, and every man of its own cast is one of their units', () => {
  for (const key of BATTLES) {
    const level = battleOf(key);
    for (const corner of ['red', 'blue']) {
      assert.ok(level.armies?.[corner]?.length, `${key} ${corner} has armies`);
      for (const army of level.armies[corner]) assert.ok(ARMIES[army], `${key}: ${army}`);
      const units = unitsOf(level, corner);
      for (const inputs of level.cast(seededRandom(4))[corner]) assert.ok(unitOf(units, inputs), `${key} ${corner}: ${inputs.name} (${inputs.outfit.kind}, ${inputs.style}${inputs.mounted ? ', mounted' : ''}) is of no unit`);
    }
  }
});

test('a side\'s units are of its own people and period: the factions its level\'s men are, no gun before guns, no horse where there was none', () => {
  for (const key of BATTLES) {
    const level = battleOf(key);
    for (const corner of ['red', 'blue']) {
      const own = new Set(level.cast(seededRandom(5))[corner].map(factionOf));
      for (const unit of unitsOf(level, corner)) {
        const man = unit.make(seededRandom(6));
        assert.ok(own.has(factionOf(man)), `${key} ${corner}: ${unit.label} is ${factionOf(man)}, the level's are ${[...own]}`);
        // Each unit makes the man it says.
        assert.equal(unitOf(unitsOf(level, corner), man)?.id, unit.id, `${key} ${corner}: ${unit.id} makes one of its own`);
      }
    }
  }
  // Rome against Han and Maidstone, 1381: no guns. The Mexica and their allies: no horse.
  for (const key of ['legion', 'rebellion']) for (const corner of ['red', 'blue']) for (const unit of unitsOf(battleOf(key), corner)) assert.ok(!gun(unit.style), `${key}: ${unit.label}`);
  for (const unit of unitsOf(battleOf('otumba'), 'blue')) assert.ok(!unit.mounted, unit.label);
  assert.ok(!unitsOf(battleOf('otumba'), 'red').some((unit) => unit.army === 'tlaxcala' && unit.mounted));
  // The Romans have no musketeer, the Dutch no Roman.
  assert.ok(!unitsOf(battleOf('legion'), 'red').some((unit) => unit.style === 'matchlock'));
  assert.ok(unitsOf(battleOf('zeelandia'), 'red').every((unit) => unit.army === 'dutch'));
  // Beside the level's own kinds, the others of the same people: the garrison with Pyongyang's Ming regulars.
  assert.ok(unitsOf(battleOf('pyongyang'), 'red').some((unit) => unit.rank === 'garrison'));
});

test('the counts of each unit in a level\'s own side add up to its men', () => {
  const level = battleOf('wokou');
  const cast = level.cast(seededRandom(2));
  const counts = countUnits(unitsOf(level, 'blue'), cast.blue);
  assert.equal(counts['coast.garrison.spear'], 8);
  assert.equal(counts['coast.brigandine.swordShield'], 1);
  assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), cast.blue.length);
  assert.equal(counts.other, undefined);
});

test('every formation draws a side up inside its own zone, the riders on its flanks', () => {
  for (const key of BATTLES) {
    const level = battleOf(key);
    const cast = level.cast(seededRandom(7));
    for (const corner of ['red', 'blue']) {
      for (const { key: shape } of formationsOf()) {
        const places = drawUp(level, corner, cast[corner], shape);
        assert.equal(places.length, cast[corner].length);
        for (const place of places) assert.ok(inZone(level, corner, place), `${key} ${corner} ${shape}: ${place}`);
      }
    }
  }
  // The level's own order is where createWorld puts them, give or take the crowd's scatter.
  for (const key of ['wokou', 'qiJiguang', 'nagashino', 'zeelandia']) {
    const level = battleOf(key);
    const cast = level.cast(seededRandom(8));
    const world = worldOf(level, cast);
    for (const corner of ['red', 'blue']) {
      const places = drawUp(level, corner, cast[corner], 'level');
      const men = world.fighters.filter((fighter) => fighter.corner === corner);
      const slack = 2 * (level.formation[corner].loose ?? 0) + 0.05;
      men.forEach((fighter, index) => {
        if (fighter.mount) return;
        const [x, z] = spot(fighter);
        assert.ok(Math.abs(x - places[index][0]) < slack && Math.abs(z - places[index][1]) < slack, `${key} ${corner} #${index}: drawn up at ${places[index].map((v) => v.toFixed(2))}, stands at ${x.toFixed(2)}, ${z.toFixed(2)}`);
      });
    }
  }
});

test('a side set up by hand comes into the world as it was set: its men, each where he was put, the man to play', () => {
  const level = battleOf('pyongyang');
  const own = level.cast(seededRandom(9));
  const units = unitsOf(level, 'blue');
  const pick = (id) => units.find((unit) => unit.id === id);
  // Blue: six samurai with katana, four ashigaru gunners and two mounted samurai, placed by hand.
  const random = seededRandom(10);
  const men = [...Array.from({ length: 6 }, () => pick('west.samurai.katana').make(random)), ...Array.from({ length: 4 }, () => pick('west.ashigaru.matchlock').make(random)), ...Array.from({ length: 2 }, () => pick('west.horse.yari').make(random))];
  const zone = zoneOf(level, 'blue');
  const places = men.map((_, index) => [zone.x[0] + 1 + (index % 4) * 1.5, -4 + Math.floor(index / 4) * 3]);
  const setup = { cast: { red: own.red, blue: men }, places: { red: null, blue: places } };
  const mustered = musterLevel(level, setup);
  // The red side is the level's own: its order untouched.
  assert.equal(mustered.formation.red, level.formation.red);
  const world = worldOf(mustered, mustered.cast(), 4);
  const blue = world.fighters.filter((fighter) => fighter.corner === 'blue');
  assert.equal(blue.length, 12);
  assert.equal(world.fighters.filter((fighter) => fighter.corner === 'red').length, own.red.length);
  assert.deepEqual(countUnits(units, blue.map((fighter) => fighter.body.inputs)), { 'west.samurai.katana': 6, 'west.ashigaru.matchlock': 4, 'west.horse.yari': 2 });
  blue.forEach((fighter, index) => {
    const at = fighter.mount ? fighter.mount.at : spot(fighter);
    assert.ok(Math.hypot(at[0] - places[index][0], at[1] - places[index][1]) < 2 * MUSTER.loose + 0.3, `${fighter.body.inputs.name} at ${at.map((v) => v.toFixed(2))}, put at ${places[index]}`);
    assert.ok(inZone(level, 'blue', at, 0.3), 'inside the zone');
  });
  // Its riders wait where they were put, held as a wing is.
  for (const fighter of blue.filter((man) => man.mount)) assert.equal(fighter.wing?.held, true);
  // The man chosen to play: the eighth of blue's.
  assert.equal(leadOf(world.fighters, 'blue', 7).body.inputs.name, men[7].name);
  assert.equal(leadOf(world.fighters, 'red', 0), world.fighters.find((fighter) => fighter.corner === 'red'));
});

test('Qi Jiguang\'s squads set up by hand keep their drill and discipline', () => {
  const level = battleOf('qiJiguang');
  const cast = level.cast(seededRandom(11));
  const places = drawUp(level, 'blue', cast.blue, 'line');
  const mustered = musterLevel(level, { cast, places: { blue: places } });
  assert.equal(mustered.formation.blue.drill, level.formation.blue.drill);
  assert.equal(mustered.formation.blue.discipline, level.formation.blue.discipline);
  const world = worldOf(mustered, mustered.cast(), 5);
  assert.ok(world.formations.blue, 'the squads form up');
  assert.equal(world.discipline.blue, level.formation.blue.discipline);
});

test('the default way in is as it was: the same cast at the same seed, its own formation', () => {
  for (const key of BATTLES) {
    const level = battleOf(key);
    assert.deepEqual(level.cast(seededRandom(12)), battleOf(key).cast(seededRandom(12)), key);
    // Kept unchanged when set up with nothing placed by hand.
    const cast = level.cast(seededRandom(12));
    const kept = musterLevel(level, { cast, places: {} });
    assert.deepEqual(kept.formation, level.formation, key);
    assert.deepEqual(kept.cast(), cast, key);
  }
});

test('the cap on a side is the biggest battle\'s', () => {
  const biggest = Math.max(...BATTLES.flatMap((key) => Object.values(battleOf(key).cast(seededRandom(1))).map((side) => side.length)));
  assert.equal(MUSTER.cap, biggest);
});
