// Last Stand Squad's squad (squad.js): each man priced by his rating out of a budget, the level's own people offered first
// and any other fighter as a mercenary, a squad of a handful of men whichever way it is spent, kept in the browser (or not),
// and its placing before the gate as a level for musterview.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawUp, inZone } from '../src/muster.js';
import { ratingOf, WARRIORS } from '../src/roster.js';
import { LAST_GATE_MODE_KEYS, LAST_GATE_MODES, lastGateDefaultPlaces, lastGateZone } from '../src/lastgate.js';
import { firstSquad, lastStandLevel, readSquad, settleSquad, SQUAD, squadCanAdd, squadCost, squadMen, squadSpent, squadStep, squadUnits, writeSquad } from '../src/squad.js';

test('a man\'s price rises with his rating, on a square-root scale: a champion costs about two common soldiers, not ten', () => {
  const rated = WARRIORS.filter((warrior) => ratingOf(warrior.inputs)).sort((a, b) => ratingOf(a.inputs) - ratingOf(b.inputs));
  for (let k = 1; k < rated.length; k += 1) assert.ok(squadCost(rated[k].inputs) >= squadCost(rated[k - 1].inputs), `${rated[k].key} against ${rated[k - 1].key}`);
  const cost = (key) => squadCost(WARRIORS.find((warrior) => warrior.key === key).inputs);
  assert.ok(cost('starved') >= SQUAD.least);
  assert.ok(cost('odachi') / cost('ashigaruSpear') < 2.5 && cost('odachi') > cost('ashigaruSpear'));
  assert.ok(cost('plate') > cost('footSpear'));
});

test('the men offered: the level\'s own people first, then every other fighter of the roster as a mercenary, on foot, all priced', () => {
  for (const key of LAST_GATE_MODE_KEYS) {
    const spec = LAST_GATE_MODES[key];
    const units = squadUnits(spec.factions);
    const own = units.filter((unit) => unit.own);
    assert.ok(own.length >= 5, `${key}: ${own.length} of its own`);
    // Its own first, in its factions' order.
    const firstOther = units.findIndex((unit) => !unit.own);
    assert.ok(units.slice(0, firstOther).every((unit) => unit.own) && units.slice(firstOther).every((unit) => !unit.own), key);
    assert.ok(units.every((unit) => unit.cost >= SQUAD.least && unit.stars >= 1 && unit.stars <= 5));
    for (const unit of units.slice(0, 6)) {
      const man = unit.make();
      assert.equal(man.mounted, false, 'on foot at the gate');
      assert.equal(man.rosterKey, unit.key);
    }
    assert.ok(units.some((unit) => unit.key === spec.soldier && unit.own), `${key}'s soldier ${spec.soldier}`);
  }
  // The Japanese level offers the Japanese first (the ashigaru, the rōnin, the sōhei, the samurai), the rest after.
  const japanese = squadUnits(LAST_GATE_MODES.samurai.factions);
  for (const key of ['ashigaruSpear', 'ronin', 'sohei', 'oyoroi']) assert.ok(japanese.find((unit) => unit.key === key)?.own, key);
  assert.ok(japanese.find((unit) => unit.key === 'plate') && !japanese.find((unit) => unit.key === 'plate').own, 'a knight as a mercenary');
});

test('the budget: a squad is a handful of men whichever way it is spent; never over the points or the room', () => {
  for (const key of LAST_GATE_MODE_KEYS) {
    const spec = LAST_GATE_MODES[key];
    const units = squadUnits(spec.factions);
    const first = firstSquad(units, spec.soldier);
    const { points, men } = squadSpent(units, first);
    assert.ok(points <= SQUAD.budget, `${key}: ${points} points`);
    // With the hero, four to eight men.
    assert.ok(men + 1 >= 4 && men + 1 <= SQUAD.most + 1, `${key}: ${men + 1} men`);
    assert.equal(squadMen(units, first).length, men);
    // The level's best man: at least two of them fit.
    const dearest = units.filter((unit) => unit.own && !unit.shoots).sort((a, b) => b.cost - a.cost)[0];
    assert.ok(Math.floor(SQUAD.budget / dearest.cost) >= 1, `${key}: ${dearest.key} at ${dearest.cost}`);
  }
  const units = squadUnits(['japanese']);
  // Bought one at a time until it will take no more: then + does nothing, and − takes one back.
  let picks = {};
  const cheap = units.filter((unit) => unit.own).sort((a, b) => a.cost - b.cost)[0];
  for (let k = 0; k < 20; k += 1) picks = squadStep(units, picks, cheap.key, 1);
  const full = squadSpent(units, picks);
  assert.ok(full.men <= SQUAD.most && full.points <= SQUAD.budget);
  assert.equal(squadCanAdd(units, picks, cheap.key), false);
  assert.deepEqual(squadStep(units, picks, cheap.key, 1), picks);
  assert.equal(squadSpent(units, squadStep(units, picks, cheap.key, -1)).men, full.men - 1);
  assert.deepEqual(squadStep(units, {}, cheap.key, -1), {}, 'none to take back');
  // The dearest kind: no more than the points buy.
  const dear = units.filter((unit) => unit.own).sort((a, b) => b.cost - a.cost)[0];
  let rich = {};
  for (let k = 0; k < 20; k += 1) rich = squadStep(units, rich, dear.key, 1);
  assert.equal(rich[dear.key], Math.floor(SQUAD.budget / dear.cost));
  // A kept squad brought inside the rules: unknown kinds dropped, too many cut to what fits.
  const settled = settleSquad(units, { [cheap.key]: 99, nobody: 3, [dear.key]: 'x' });
  assert.ok(!('nobody' in settled) && squadSpent(units, settled).points <= SQUAD.budget && squadSpent(units, settled).men <= SQUAD.most);
});

test('the squad bought is kept for the next visit; storage that throws or holds rubbish keeps nothing and gives the first squad', () => {
  const units = squadUnits(['knights']);
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  assert.deepEqual(readSquad('knight', units, { storage, prefer: 'footSpear' }), firstSquad(units, 'footSpear'));
  const picks = { plate: 1, footSpear: 2 };
  assert.equal(writeSquad('knight', picks, storage), true);
  assert.deepEqual(readSquad('knight', units, { storage }), picks);
  store.set(`${SQUAD.storageKey}/knight`, '{not json');
  assert.deepEqual(readSquad('knight', units, { storage, prefer: 'footSpear' }), firstSquad(units, 'footSpear'));
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(writeSquad('knight', picks, denied), false);
  assert.deepEqual(readSquad('knight', units, { storage: denied, prefer: 'footSpear' }), firstSquad(units, 'footSpear'));
});

test('the placing: the hero first, his men, all on the squad\'s ground before the gate; every formation drawn up there', () => {
  for (const key of LAST_GATE_MODE_KEYS) {
    const spec = LAST_GATE_MODES[key];
    const units = squadUnits(spec.factions);
    const men = squadMen(units, firstSquad(units, spec.soldier));
    const level = lastStandLevel(key, men);
    const cast = level.cast();
    assert.equal(cast.red.length, men.length + 1);
    assert.equal(cast.blue.length, 0);
    assert.equal(cast.red[0].name, spec.hero().name ?? cast.red[0].name);
    assert.deepEqual(level.zones.red, lastGateZone());
    assert.deepEqual(level.places.red, lastGateDefaultPlaces(men.length, Boolean(cast.red[0].mounted)));
    for (const formation of ['level', 'line', 'block', 'wedge', 'skirmish']) {
      const places = drawUp(level, 'red', cast.red, formation);
      assert.equal(places.length, cast.red.length);
      for (const place of places) assert.ok(inZone(level, 'red', place, 1e-6), `${key} ${formation}: ${place}`);
    }
    // "At the gate" is the default places (the foot among them).
    const atGate = drawUp(level, 'red', cast.red, 'level');
    level.places.red.forEach((place, index) => {
      if (index === 0 && cast.red[0].mounted) return;
      assert.ok(Math.hypot(atGate[index][0] - place[0], atGate[index][1] - place[1]) < 1e-6, `${key} man ${index}: ${atGate[index]} for ${place}`);
    });
    // The men tell themselves apart for the map: the hero, and each his roster's kind.
    assert.equal(level.units.red.find((unit) => unit.matches(cast.red[0]))?.id, 'hero');
    for (const man of cast.red.slice(1)) assert.equal(level.units.red.find((unit) => unit.matches(man))?.id, man.rosterKey);
  }
});
