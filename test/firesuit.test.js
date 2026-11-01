// The fireproof suits (outfits.js proximity, fireEntry; physics/flame.js FLAME.suit): their budget against the flamethrower's
// fire, what they let through, a burst survived and a soaking not, and the kit itself (selectable, its look's materials).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { CLOTH_FAMILIES, clothFamilyOf, clothMaterialOf, metalClothCell } from '../src/detailmaps.js';
import { gearTraits, MOVEMENT, OUTFITS, outfitOf, PICKABLE_OUTFIT_KEYS } from '../src/outfits.js';
import { createWorld, placeFighter, sightAngle, step, WORLD } from '../src/physics.js';
import { FLAME, flamePulse, stepFlame, suitBudget, suitThrough, withTanks } from '../src/physics/flame.js';
import { ratingOf, WARRIORS } from '../src/roster.js';

/** A man of the firefighter's build in this kit (an unsuited one in the patrol uniform), standing still. */
const manIn = (kind) => ({ ...structuredClone(PRESETS.firefighter), style: 'passive', outfit: { kind, design: 0 } });

/** The flamethrower 6 m off holds his valve open at him for `seconds`; then `total` s go by. */
function douse(kind, seconds, total = 70) {
  const world = createWorld([
    { inputs: withTanks({ ...structuredClone(PRESETS.rifle), style: 'flamethrower' }), corner: 'red' },
    { inputs: manIn(kind), corner: 'blue' },
  ], { seed: 3, arena: { halfX: 20, halfZ: 20 } });
  const [shooter, man] = world.fighters;
  placeFighter(shooter, -3, 0);
  placeFighter(man, 3, 0);
  shooter.aimAt = man.id;
  let out = null;
  for (let t = 0; t < total; t += 1 / 60) {
    if (t < seconds) flamePulse(world, shooter, shooter.weapon);
    step(world, 1 / 60);
    if (man.state === 'out' && out === null) out = t;
  }
  return { man, out };
}

/** A man in this kit with `fuel` kg of burning gel on him, the fire stepped alone (no fall, no AI) for `seconds`: what got through, by time. */
function burnFor(kind, fuel, seconds) {
  const world = createWorld([{ inputs: manIn(kind) }], { seed: 1, arena: { halfX: 20, halfZ: 20 } });
  const [man] = world.fighters;
  world.flame = { blobs: [], free: [], patches: [], valves: new Map() };
  man.burning = { fuel, clothes: 0, heat: 0, through: 1, part: 'trunk', reacted: true, rolling: false, running: false, rollClock: 0, cryClock: 0, side: 1, since: 0 };
  const through = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    stepFlame(world, 1 / 60);
    through.push([t, man.burning?.through ?? 0, man.burning?.heat ?? 0]);
  }
  return { man, through };
}

test('a suit\'s budget is its TPP rating: at the test\'s 84 kW/m², half radiant, the skin burns at TPP / 2 s', () => {
  for (const kind of ['proximity', 'fireEntry']) {
    const suit = OUTFITS[kind].fireproof;
    const seconds = suitBudget(suit) / (84 * (1 - suit.reflect * 0.5));
    assert.ok(Math.abs(seconds - suit.tpp / 2) < 0.5, `${kind}: ${seconds.toFixed(1)} s for TPP ${suit.tpp}`);
  }
  // NFPA 1971's proximity floor is TPP 35 (17.5 s); the film turns >90% of the radiant heat.
  assert.ok(OUTFITS.proximity.fireproof.tpp >= 35 && OUTFITS.proximity.fireproof.reflect >= 0.9);
  assert.ok(OUTFITS.fireEntry.fireproof.tpp > OUTFITS.proximity.fireproof.tpp);
  // Through: the leak while the budget lasts, all of it once it is spent and the suit burnt through.
  const suit = OUTFITS.proximity.fireproof;
  assert.equal(suitThrough(suit, 0.5), suit.leak);
  assert.equal(suitThrough(suit, 1), suit.leak);
  assert.ok(suitThrough(suit, 1 + suit.breach / 2) > 0.4 && suitThrough(suit, 1 + suit.breach / 2) < 0.6);
  assert.equal(suitThrough(suit, 1 + suit.breach), 1);
});

test('in the flamethrower\'s fire the suit keeps the heat off while its budget lasts (proximity ~10-20 s, fire-entry ~25-45 s), then lets it through', () => {
  const whenThrough = (kind) => {
    const { through } = burnFor(kind, 3, 80);
    const kept = through.filter(([, share, heat]) => heat > 0.9 && share <= OUTFITS[kind].fireproof.leak + 1e-9).length / 60;
    const all = through.find(([, share]) => share >= 1)?.[0];
    return { kept, all };
  };
  const proximity = whenThrough('proximity');
  const entry = whenThrough('fireEntry');
  assert.ok(proximity.kept > 10 && proximity.kept < 20, `proximity keeps it off ${proximity.kept.toFixed(1)} s`);
  assert.ok(entry.kept > 25 && entry.kept < 45, `fire-entry keeps it off ${entry.kept.toFixed(1)} s`);
  assert.ok(proximity.all > proximity.kept && proximity.all < proximity.kept + 15, `all through at ${proximity.all?.toFixed(1)} s`);
  // Unsuited, all of it from the first moment.
  assert.equal(burnFor('police', 3, 1).through.at(-1)[1], 1);
  // While the suit holds, nothing of it chars: the burns are only the leak's.
  const early = burnFor('proximity', 3, 8).man;
  assert.ok((early.trauma?.trunk ?? 0) < 0.05, `trunk ${early.trauma?.trunk}`);
});

test('a short burst of the flamethrower: the unsuited man burns to death, the man in a proximity suit lives (the gel burns off the foil)', () => {
  const bare = douse('police', 0.2);
  const suited = douse('proximity', 0.2);
  assert.ok(bare.out !== null && bare.out < 30, `unsuited out at ${bare.out}`);
  assert.equal(suited.out, null, 'suited: still up');
  assert.ok((suited.man.trauma?.trunk ?? 0) < 0.1, `suited trunk ${suited.man.trauma?.trunk}`);
  assert.ok(!(suited.man.burning?.fuel > FLAME.man.stuckFrom), 'the gel burnt off');
  assert.ok(suited.man.suitSpent < 1, 'the suit not burnt through');
});

test('a soaking still kills him: the gel he cannot shake off outlasts the suit, the fire-entry suit later than the proximity one', () => {
  const bare = douse('police', 2, 90);
  const proximity = douse('proximity', 2, 90);
  const entry = douse('fireEntry', 2, 90);
  assert.ok(bare.out !== null && proximity.out !== null && entry.out !== null, `out at ${bare.out}, ${proximity.out}, ${entry.out}`);
  assert.ok(proximity.out > bare.out + 10, `proximity ${proximity.out?.toFixed(1)} s against ${bare.out?.toFixed(1)} s`);
  assert.ok(entry.out > proximity.out + 10, `fire-entry ${entry.out?.toFixed(1)} s`);
});

test('the suit\'s shell does not catch from a burning patch: the flames lick it only while he stands in them', () => {
  const world = createWorld([{ inputs: manIn('proximity') }, { inputs: manIn('police') }], { seed: 1, arena: { halfX: 20, halfZ: 20 } });
  const [suited, bare] = world.fighters;
  placeFighter(suited, 0, 0);
  placeFighter(bare, 6, 0);
  world.flame = { blobs: [], free: [], patches: [{ x: [0, 0, 0], fuel: 0.4, age: 0, wet: false, seed: 0 }, { x: [6, 0, 0], fuel: 0.4, age: 0, wet: false, seed: 0 }], valves: new Map() };
  stepFlame(world, 1 / 60);
  assert.ok(suited.burning && suited.burning.clothes <= 0.1, `suited: ${suited.burning?.clothes}`);
  assert.ok(bare.burning.clothes > FLAME.man.clothes - 0.1, `unsuited: ${bare.burning.clothes}`);
});

test('the suits are kit: selectable, cloth to a blade, heavy and slow, the hood\'s visor narrowing his sight; a firefighter in the roster', () => {
  for (const kind of ['proximity', 'fireEntry']) {
    assert.ok(PICKABLE_OUTFIT_KEYS.includes(kind), `${kind} pickable`);
    const gear = gearTraits(manIn(kind));
    assert.deepEqual(gear.fireproof, OUTFITS[kind].fireproof);
    assert.ok(gear.protection.cut <= 0.45 && gear.protection.pierce <= 0.25 && gear.protection.blunt <= 0.3, `${kind}: cloth to a blade`);
    assert.ok(gear.extraMass > 0.15 && gear.extraMass < 0.35, `${kind}: ${gear.extraMass}`);
    assert.ok(gear.sight < WORLD.blindsideAngle);
    const man = createWorld([{ inputs: manIn(kind) }]).fighters[0];
    assert.equal(sightAngle(man), OUTFITS[kind].sight);
    assert.ok(man.body.gearKg > 14 && man.body.gearKg < 30, `${kind}: ${man.body.gearKg.toFixed(1)} kg`);
  }
  assert.equal(OUTFITS.proximity.movement, 'limited');
  assert.ok(MOVEMENT[OUTFITS.fireEntry.movement].foot < MOVEMENT.limited.foot);
  // Any fighter can wear it: a knight's build in a proximity suit.
  const knight = createWorld([{ inputs: { ...structuredClone(PRESETS.knight), outfit: { kind: 'proximity', design: 0 } } }]).fighters[0];
  assert.ok(knight.body.gear.fireproof);
  const firefighter = WARRIORS.find((warrior) => warrior.key === 'firefighter');
  assert.ok(firefighter && ratingOf(firefighter.inputs) > 0, 'rated');
  assert.equal(outfitOf(firefighter.inputs).kind, 'proximity');
});

test('aluminized cloth: a metal family of the atlas, quilted on the fire-entry suit, on the coat, trousers, boots and hood', () => {
  assert.ok(CLOTH_FAMILIES.aluminized.metal && CLOTH_FAMILIES.aluminizedQuilt.metal);
  assert.ok(metalClothCell(CLOTH_FAMILIES.aluminized.cell) && !metalClothCell(CLOTH_FAMILIES.plain.cell));
  const of = (kind, role) => clothMaterialOf(outfitOf({ outfit: { kind, design: 0 } }).look, role, { faction: 'law', outfit: kind });
  for (const role of ['top', 'trim', 'kit', 'boot']) {
    assert.equal(clothFamilyOf(of('proximity', role)).family, 'aluminized', `proximity ${role}`);
    assert.equal(clothFamilyOf(of('fireEntry', role)).family, 'aluminizedQuilt', `fire-entry ${role}`);
  }
});
