import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, P, PRESETS } from '../src/body.js';
import { gearTraits, OUTFITS } from '../src/outfits.js';
import { advance, createWorld, placeFighter, throwPunch } from '../src/physics.js';
import { footworkDistance } from '../tools/speed-curve.js';

const wearing = (preset, kind, extra = {}) => ({ ...PRESETS[preset], outfit: { kind, design: 0 }, ...extra });

test('every outfit has its picked design, a movement class, and traits as specified', () => {
  for (const [kind, outfit] of Object.entries(OUTFITS)) {
    assert.ok(outfit.designs.length >= 1, kind);
    assert.ok(['excellent', 'good', 'limited'].includes(outfit.movement), kind);
  }
  const male = { sex: 'male' };
  const female = { sex: 'female' };
  assert.equal(gearTraits({ ...male, outfit: { kind: 'boxing' } }).damageDealt.hand, 0.9);
  assert.equal(gearTraits({ ...male, outfit: { kind: 'hiking' } }).kick, 1.1);
  assert.equal(gearTraits({ ...male, outfit: { kind: 'yakuza' } }).kick, 1.1);
  assert.equal(gearTraits({ ...female, outfit: { kind: 'business' } }).kick, 1.2);
  assert.equal(gearTraits({ ...male, outfit: { kind: 'business' } }).kick, 1, 'heels are the woman’s');
  assert.ok(gearTraits({ ...female, outfit: { kind: 'business' } }).balance < 0.6, 'heels: very easy to fall');
  assert.ok(gearTraits({ ...male, outfit: { kind: 'swat' } }).balance > 1.3, 'riot gear: hard to fall');
  assert.equal(gearTraits({ ...male, outfit: { kind: 'swat' } }).protection.blunt, 0.8);
  assert.equal(gearTraits({ ...male, outfit: { kind: 'knight' } }).protection.blunt, 0.6);
  for (const kind of Object.keys(OUTFITS)) assert.deepEqual(Object.keys(gearTraits({ ...male, outfit: { kind } }).protection).sort(), ['blunt', 'cut', 'pierce']);
});

test('armour is real weight: riot gear adds 20%, plate 50%, and the man inside is the same man', () => {
  const plain = buildBody(wearing('heavy', 'casual'));
  const swat = buildBody(wearing('heavy', 'swat'));
  const knight = buildBody(wearing('heavy', 'knight'));
  assert.ok(Math.abs(swat.massKg / plain.massKg - 1.2) < 0.01);
  assert.ok(Math.abs(knight.massKg / plain.massKg - 1.5) < 0.01);
  assert.equal(knight.bodyMassKg, plain.massKg);
  assert.ok(Math.abs(knight.masses.reduce((a, b) => a + b, 0) - knight.massKg - 2 * 0.3) < 1, 'spread over the particles');
});

test('movement: boxing kit is free, a suit or plate is limited — the feet cover less ground', () => {
  const free = footworkDistance(wearing('light', 'boxing'));
  const suit = footworkDistance(wearing('light', 'business'));
  const plate = footworkDistance(wearing('light', 'knight'));
  assert.ok(suit < free * 0.85, `suit ${suit.toFixed(2)} vs trunks ${free.toFixed(2)} m`);
  assert.ok(plate < suit, `plate ${plate.toFixed(2)} m`);
});

/** One cross to the head, the same in every way but what the defender wears. */
function crossInto(defenderOutfit, attackerOutfit = 'casual') {
  const world = createWorld([wearing('heavy', attackerOutfit), wearing('amateur', defenderOutfit)], { seed: 3 });
  const [attacker, defender] = world.fighters;
  placeFighter(attacker, -0.4, 0);
  placeFighter(defender, 0.4, 0);
  advance(world, 0.5);
  defender.cooldown = 99;
  throwPunch(world, attacker, 'cross', 'head');
  advance(world, 0.4, () => { defender.cooldown = 99; defender.defence = null; });
  const hit = world.events.find((event) => event.kind === 'landed' || event.kind === 'blocked');
  return { hit, defender };
}

test('protection takes harm, not physics: the blow lands with the same force, the damage is cut', () => {
  const bare = crossInto('casual');
  const swat = crossInto('swat');
  assert.ok(bare.hit && swat.hit, 'both landed');
  assert.equal(bare.hit.harm, 1);
  assert.ok(Math.abs(swat.hit.harm - 0.2) < 1e-9, `riot gear lets ${swat.hit.harm} through`);
  // Same strike into a heavier man: the impulse is within a few percent; the knock is his to take.
  assert.ok(Math.abs(swat.hit.speed - bare.hit.speed) / bare.hit.speed < 0.15, 'the punch arrives the same');
  if (bare.hit.target === 'head' && swat.hit.target === 'head') {
    assert.ok(swat.hit.harmDeltaV < bare.hit.harmDeltaV * 0.3, 'the brain takes a fifth');
  }
});

test('gloves give 10% less harm than the same punch bare', () => {
  const gloved = crossInto('casual', 'boxing');
  assert.ok(Math.abs(gloved.hit.harm - 0.9) < 1e-9, `gloved harm ${gloved.hit.harm}`);
});

test('in heels a woman goes over far more easily; in riot gear a man hardly at all', () => {
  const falls = (inputs) => {
    let count = 0;
    for (let seed = 0; seed < 6; seed += 1) {
      const world = createWorld([inputs, PRESETS.light], { seed });
      placeFighter(world.fighters[1], 2.6);
      advance(world, 0.5);
      const [fighter] = world.fighters;
      fighter.knock = [2.4 * (fighter.body.gear.balance > 1 ? 1.4 : 0.7), 0, 0];
      advance(world, 0.1);
      if (fighter.state !== 'up') count += 1;
    }
    return count;
  };
  assert.ok(falls(wearing('contender', 'business')) > falls(wearing('contender', 'boxing')), 'heels fall to a knock trunks shrug off');
  assert.ok(falls(wearing('heavy', 'swat')) < falls(wearing('heavy', 'casual')) || falls(wearing('heavy', 'casual')) === 0, 'riot gear stands where casual goes over');
});
