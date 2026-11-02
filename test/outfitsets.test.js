import test from 'node:test';
import assert from 'node:assert/strict';
import { FACTION_KEYS, gearTraits, OUTFIT_KEYS, outfitOf, outfitSets, OUTFITS, pickableSets, PICKABLE_OUTFIT_KEYS, setCard } from '../src/outfits.js';
import { OUTFIT_BLURBS, OUTFIT_SETS } from '../src/outfitsets.js';

test('every design of an outfit belongs to exactly one of its sets', () => {
  for (const kind of Object.keys(OUTFIT_SETS)) {
    assert.ok(OUTFITS[kind], `${kind} is an outfit`);
    const listed = OUTFIT_SETS[kind].flatMap((set) => set.designs).sort((a, b) => a - b);
    assert.deepEqual(listed, OUTFITS[kind].designs.map((_, index) => index), kind);
  }
});

test('every set the builders offer has a name and a description', () => {
  for (const kind of PICKABLE_OUTFIT_KEYS) {
    for (const set of outfitSets(kind)) {
      assert.ok(set.name, `${kind}/${set.key} name`);
      assert.ok(set.blurb, `${kind}/${set.key} description`);
    }
  }
  for (const kind of Object.keys(OUTFIT_BLURBS)) assert.ok(OUTFIT_KEYS.includes(kind), `${kind} is an outfit`);
});

test('the sets of one outfit differ in their stats, and in their names', () => {
  for (const kind of Object.keys(OUTFIT_SETS)) {
    const cards = outfitSets(kind).map((set) => setCard(kind, set.key));
    const stats = cards.map((card) => JSON.stringify([card.kg, card.torso, card.head, card.arm, card.helmetKg, card.face, card.movement]));
    assert.equal(new Set(stats).size, cards.length, `${kind}: two sets with the same stats`);
    assert.equal(new Set(cards.map((card) => card.name)).size, cards.length, `${kind}: two sets with the same name`);
  }
});

test('a fighter wears his design\'s set: a close helmet guards the head better than a sallet, and weighs more', () => {
  const sallet = gearTraits({ outfit: { kind: 'knight', design: 0 } });
  const close = gearTraits({ outfit: { kind: 'knight', design: 3 } });
  assert.equal(outfitOf({ outfit: { kind: 'knight', design: 3 } }).set, 'closeHelmet');
  assert.ok(close.protection.regions.head.blunt > sallet.protection.regions.head.blunt);
  assert.ok(close.extraMass > sallet.extraMass);
  assert.ok(close.helmet.mass > sallet.helmet.mass);
  // The trunk is the same harness.
  assert.equal(close.protection.pierce, sallet.protection.pierce);
});

test('cosmetic finishes of a set share its stats', () => {
  assert.deepEqual(gearTraits({ outfit: { kind: 'knight', design: 0 } }).protection, gearTraits({ outfit: { kind: 'knight', design: 2 } }).protection);
  assert.deepEqual(gearTraits({ outfit: { kind: 'hoplomachus', design: 0 } }).protection, gearTraits({ outfit: { kind: 'hoplomachus', design: 4 } }).protection);
});

test('the builders\' sets come grouped by faction, in the factions\' order', () => {
  const order = pickableSets().map((set) => FACTION_KEYS.indexOf(set.faction));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(pickableSets().length > PICKABLE_OUTFIT_KEYS.length);
});

test('Saladin wears the sipahi\'s pointed turban helmet', () => {
  for (const design of OUTFITS.saladin.designs) assert.deepEqual([design.head.kind, design.head.design], [OUTFITS.ottomanHeavy.designs[0].head.kind, 'turban']);
});
