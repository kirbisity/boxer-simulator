import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, P, PRESETS } from '../src/body.js';
import { FACTIONS, gearTraits, OUTFITS } from '../src/outfits.js';
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
  const business = gearTraits({ ...female, outfit: { kind: 'business' } }).balance;
  assert.ok(business < 0.8 && business > 0.55, 'business heels: easier to fall');
  assert.ok(gearTraits({ ...female, outfit: { kind: 'victorianLady' } }).balance < business, 'the lady\'s higher heels: easier still');
  assert.ok(gearTraits({ ...male, outfit: { kind: 'swat' } }).balance > 1.3, 'riot gear: hard to fall');
  // The vest over the torso; the helmet over the head; riot pads on the limbs.
  assert.equal(gearTraits({ ...male, outfit: { kind: 'swat' } }).protection.regions.head.blunt, 0.6);
  assert.equal(gearTraits({ ...male, outfit: { kind: 'knight' } }).protection.blunt, 0.6);
  // Every outfit says all four; a modern vest also says where it covers (`regions`).
  for (const kind of Object.keys(OUTFITS)) assert.deepEqual(Object.keys(gearTraits({ ...male, outfit: { kind } }).protection).filter((key) => key !== 'regions').sort(), ['blunt', 'bullet', 'cut', 'pierce']);
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
  const covered = { head: 0.6, trunk: 0.5 }[swat.hit.target] ?? 0.55;
  assert.ok(Math.abs(swat.hit.harm - (1 - covered)) < 1e-9, `riot gear lets ${swat.hit.harm} through on the ${swat.hit.target}`);
  // Same strike into a heavier man: the impulse is within a few percent; the knock is his to take.
  assert.ok(Math.abs(swat.hit.speed - bare.hit.speed) / bare.hit.speed < 0.15, 'the punch arrives the same');
  if (bare.hit.target === 'head' && swat.hit.target === 'head') {
    assert.ok(swat.hit.harmDeltaV < bare.hit.harmDeltaV * 0.5, 'the helmet takes more than half');
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

test('headgear comes off by how hard the head is hit: a cap easily, a crest only by a heavy blow', async () => {
  const { createWorld, advance, placeFighter, throwPunch } = await import('../src/physics.js');
  const { PRESETS } = await import('../src/body.js');
  const { HEADGEAR, headgearOptions } = await import('../src/outfits.js');
  assert.ok(HEADGEAR.cap.knock < HEADGEAR.crest.knock);
  assert.ok(headgearOptions('samurai').includes('crest') && !headgearOptions('samurai').includes('headset'), 'a kabuto takes a crest, not a headset');
  assert.ok(headgearOptions('casual').includes('headset'));
  // The same crosses at a cap and at a crest.
  const knocked = (kind, accessory) => {
    const world = createWorld([{ ...PRESETS.heavy, style: 'boxing' }, { ...PRESETS.light, style: 'boxing', outfit: { kind, design: 0 }, accessories: [accessory] }], { seed: 2 });
    placeFighter(world.fighters[0], -0.45, 0);
    placeFighter(world.fighters[1], 0.45, 0);
    let heaviest = 0;
    for (let tries = 0; tries < 6 && world.props[0].attached; tries += 1) {
      throwPunch(world, world.fighters[0], 'cross', 'head');
      advance(world, 0.6);
      for (const event of world.events) if (event.kind === 'landed' && event.target === 'head') heaviest = Math.max(heaviest, event.headDeltaV);
    }
    return { off: !world.props[0].attached, heaviest };
  };
  const cap = knocked('sports', 'cap');
  const crest = knocked('samurai', 'crest');
  assert.ok(cap.off, `cap still on after a ${cap.heaviest.toFixed(2)} m/s blow`);
  assert.equal(crest.off, crest.heaviest >= HEADGEAR.crest.knock, 'the crest goes only to a blow past its threshold');
});

test('a fall shakes headgear off, even a crest', async () => {
  const { createWorld, advance } = await import('../src/physics.js');
  const { PRESETS } = await import('../src/body.js');
  const world = createWorld([
    { ...PRESETS.light, style: 'boxing', outfit: { kind: 'sports', design: 0 }, accessories: ['cap'] },
    { ...PRESETS.light, style: 'boxing', outfit: { kind: 'samurai', design: 0 }, accessories: ['crest'] },
  ], { seed: 2 });
  for (const fighter of world.fighters) fighter.knock = [6, 0, 0];
  advance(world, 0.5);
  assert.equal(world.props.find((prop) => prop.kind === 'cap').attached, false);
  assert.equal(world.props.find((prop) => prop.kind === 'crest').attached, false);
});

test('three samurai, three knight and five gladiator armours, five designs each, each with its own protection', async () => {
  const { familyKinds, randomDesign } = await import('../src/outfits.js');
  const counts = { samurai: 3, knight: 3, gladiator: 5 };
  for (const [family, count] of Object.entries(counts)) {
    const kinds = familyKinds(family);
    assert.equal(kinds.length, count, family);
    const stats = new Set(kinds.map((kind) => JSON.stringify(OUTFITS[kind].protection)));
    assert.equal(stats.size, count, `${family}: each armour protects differently`);
    for (const kind of kinds) {
      assert.equal(OUTFITS[kind].designs.length, 5, kind);
      assert.ok(randomDesign(kind) < 5);
    }
  }
  // Plate is proof against the edge; mail is not; the ashigaru is the lightest samurai.
  assert.ok(OUTFITS.knight.protection.cut > OUTFITS.knightMail.protection.cut);
  assert.ok(OUTFITS.knightMail.protection.pierce < OUTFITS.knight.protection.pierce);
  assert.ok(OUTFITS.ashigaru.extraMass < OUTFITS.samurai.extraMass && OUTFITS.ashigaru.protection.cut < OUTFITS.samurai.protection.cut);
});

test('every outfit names its own faction, and a known one; armour proofed against bullets says how far', () => {
  for (const [kind, outfit] of Object.entries(OUTFITS)) {
    assert.ok(FACTIONS[outfit.faction], `${kind}: ${outfit.faction}`);
    if (outfit.bulletRating !== undefined) assert.ok(outfit.bulletRating > 0, kind);
  }
});
