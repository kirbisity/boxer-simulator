// Bows cast by their build (weapons.js bowCast), drawn by a man's pull (handling.js drawShares), crossbows spanned by it
// (handling.js crossbowSpan) at the crossbow's own power, and an arrow's knock by its momentum (physics/ranged.js arrowHit).

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, normaliseInputs, P, PRESETS } from '../src/body.js';
import { createWorld, placeFighter } from '../src/physics.js';
import { crossbowSpan, drawShares, handling, HANDLING } from '../src/handling.js';
import { arrowHit, firstHit, loose } from '../src/physics/ranged.js';
import { ARROW, ARROW_MOMENTUM, bowCast, CROSSBOW, NU, WEAPONS } from '../src/weapons.js';

const BOWS = ['bow', 'compositeBow', 'chineseBow', 'yumi', 'manchuBow', 'longbow'];
const LIGHT_ARROW = 0.065;

test('a bow stores fullness × draw weight × power stroke, and gives the arrow its share by the arrow against the limbs\' virtual mass', () => {
  for (const key of BOWS) {
    const spec = WEAPONS[key];
    const cast = bowCast(spec);
    const { drawLength, brace, fullness, kept, virtualKg, arrowKg } = spec.cast;
    assert.ok(Math.abs(cast.stored - fullness * spec.drawN * (drawLength - brace)) < 1e-9, key);
    assert.ok(Math.abs(cast.efficiency - (kept * arrowKg) / (arrowKg + virtualKg)) < 1e-9, key);
    assert.ok(Math.abs(0.5 * cast.kg * cast.speed ** 2 - cast.joules) < 1e-6, `${key}: v = √(2E/m)`);
    // Every war bow's arrow in the 40-60 m/s (130-200 fps) and 60-150 J the bows are credited with.
    assert.ok(cast.speed > 40 && cast.speed < 61 && cast.joules > 55 && cast.joules < 150, `${key}: ${cast.joules.toFixed(0)} J at ${cast.speed.toFixed(1)} m/s`);
  }
});

test('the longbow against the replica tests (The Great Warbow): a 150 lbf bow\'s 57.8 g arrow at 62 m/s, a 144 lbf bow\'s 102 g at 47 m/s', () => {
  const at = (lbf) => ({ ...WEAPONS.longbow, drawN: lbf * 4.448 });
  const light = bowCast(at(150), 1, 0.0578);
  const heavy = bowCast(at(144), 1, 0.102);
  assert.ok(Math.abs(light.speed - 62.25) / 62.25 < 0.06, `${light.speed.toFixed(1)} m/s`);
  assert.ok(Math.abs(heavy.speed - 47.23) / 47.23 < 0.06, `${heavy.speed.toFixed(1)} m/s`);
});

test('the heavy-eared Manchu bow wastes much of itself on a light arrow, so it took a heavy one; the light steppe bow wastes little', () => {
  const manchu = WEAPONS.manchuBow;
  const steppe = WEAPONS.compositeBow;
  const own = bowCast(manchu);
  const light = bowCast(manchu, 1, LIGHT_ARROW);
  assert.ok(light.efficiency < 0.8 * own.efficiency && light.efficiency < 0.55, `${(light.efficiency * 100).toFixed(0)}% against ${(own.efficiency * 100).toFixed(0)}%`);
  assert.ok(light.joules < 0.8 * own.joules);
  assert.ok(bowCast(steppe, 1, LIGHT_ARROW).efficiency > 0.75, 'the steppe bow gives a 65 g arrow most of what it stores');
  // Slower and heavier than the steppe bow's, the Manchu arrow carries more, and twice the momentum of a war arrow nearly.
  assert.ok(own.speed < bowCast(steppe).speed && own.joules > bowCast(steppe).joules);
  assert.ok(own.kg * own.speed > 1.6 * ARROW_MOMENTUM);
  // The Ming bow between the steppe bow and the Manchu bow that grew out of it.
  const ming = bowCast(WEAPONS.chineseBow);
  assert.ok(ming.speed < bowCast(steppe).speed && ming.speed > own.speed && ming.kg > steppe.cast.arrowKg && ming.kg < manchu.cast.arrowKg);
});

test('a man draws a bow until its force meets his pull: the energy by the draw curve (the force share squared for a linear draw)', () => {
  const linear = { drawN: 400, cast: { fullness: 0.5 } };
  const half = drawShares(linear, 200);
  assert.ok(Math.abs(half.draw - 0.5) < 1e-9 && Math.abs(half.drawEnergy - 0.25) < 1e-9);
  assert.deepEqual(drawShares(linear, 500), { draw: 1, drawEnergy: 1 });
  // A fuller (reflexed) bow comes up to its weight sooner: the same pull short of it draws it less far.
  const full = drawShares({ drawN: 400, cast: { fullness: 0.6 } }, 300);
  const straight = drawShares(linear, 300);
  assert.ok(full.draw < straight.draw && full.drawEnergy < straight.drawEnergy);
});

test('a strong man draws the longbow full and gets all of it; a weak levy draws it part way, slower, and his arrow is the weaker', () => {
  const archer = buildBody(PRESETS.longbow);
  const levy = buildBody({ sex: 'male', heightCm: 172, frame: 'medium', age: 26, exercise: 0.3, calories: 2770, style: 'bow' });
  const strong = handling(archer, WEAPONS.longbow);
  const weak = handling(levy, WEAPONS.longbow);
  assert.equal(strong.drawEnergy, 1);
  assert.ok(weak.drawEnergy < 0.9 && weak.draw >= HANDLING.minDraw && weak.drawTime > strong.drawTime, `${(weak.drawEnergy * 100).toFixed(0)}% of its energy`);
  // In the world: the same bow loosed by each, the arrows' energies as their draws.
  const world = createWorld([{ inputs: normaliseInputs({ ...structuredClone(PRESETS.longbow), style: 'longbow' }), corner: 'red' }, { inputs: normaliseInputs({ sex: 'male', heightCm: 172, frame: 'medium', age: 26, exercise: 0.3, calories: 2770, style: 'longbow' }), corner: 'blue' }], { seed: 3 });
  const energies = world.fighters.map((fighter) => {
    fighter.punch = {};
    loose(world, fighter);
    return world.arrows.at(-1);
  });
  const [mine, his] = energies;
  assert.ok(Math.abs(mine.energy * ARROW.joules - bowCast(WEAPONS.longbow).joules) < 0.5, `${(mine.energy * ARROW.joules).toFixed(1)} J`);
  assert.ok(Math.abs(his.energy / mine.energy - weak.drawEnergy) < 0.01 && his.speed < mine.speed);
});

test('a crossbow shoots at its full power whoever spans it; his strength sets only whether he can and how long it takes', () => {
  const strong = { ...structuredClone(PRESETS.crossbow), style: 'crossbow' };
  const weak = { ...structuredClone(PRESETS.crossbow), exercise: 0.3, style: 'crossbow' };
  const world = createWorld([{ inputs: normaliseInputs(strong), corner: 'red' }, { inputs: normaliseInputs(weak), corner: 'blue' }], { seed: 4 });
  const [a, b] = world.fighters;
  assert.ok(a.weapon && b.weapon, 'both hold it');
  const bolts = world.fighters.map((fighter) => {
    fighter.punch = {};
    loose(world, fighter, fighter.weapon.spec.shot);
    return world.arrows.at(-1);
  });
  assert.equal(bolts[0].speed, CROSSBOW.speed);
  assert.equal(bolts[1].speed, CROSSBOW.speed);
  assert.equal(bolts[0].energy, CROSSBOW.energy);
  assert.equal(bolts[1].energy, CROSSBOW.energy);
  assert.ok(b.weapon.handling.reloadSeconds > a.weapon.handling.reloadSeconds, `${b.weapon.handling.reloadSeconds.toFixed(1)} s against ${a.weapon.handling.reloadSeconds.toFixed(1)} s`);
  // Spanning has a floor: the strongest man still works the lever its length.
  assert.ok(crossbowSpan(CROSSBOW, 1e6).reloadSeconds >= CROSSBOW.reloadSeconds * (1 - CROSSBOW.span.share * (1 - HANDLING.spanQuickest)) - 1e-9);
  // One who cannot bring the draw to the nut cannot use it at all.
  const starved = handling(buildBody(PRESETS.starved), WEAPONS.crossbow);
  assert.equal(starved.canSpan, false);
  assert.equal(starved.canHold, false);
  assert.ok(handling(buildBody(PRESETS.mingCrossbow), WEAPONS.nu).canSpan, 'the Ming crossbowman spans his nu');
  assert.equal(NU.span.by, 'waist');
});

test('an arrow knocks a man by its momentum: a heavy Manchu arrow harder than a light steppe one; a bolt harder still', () => {
  const world = createWorld([{ inputs: normaliseInputs({ ...structuredClone(PRESETS.bannerBow) }), corner: 'red' }, { inputs: normaliseInputs({ ...structuredClone(PRESETS.unskilled) }), corner: 'blue' }], { seed: 5 });
  const [shooter, victim] = world.fighters;
  placeFighter(victim, 0, 0);
  const chest = [victim.x[P.neck * 3], (victim.x[P.neck * 3 + 1] + victim.x[P.pelvis * 3 + 1]) / 2, victim.x[P.neck * 3 + 2]];
  const knock = (momentum) => {
    world.pendingImpulses = [];
    const hit = firstHit(world, shooter, [chest[0] + 3, chest[1], chest[2]], [chest[0] - 3, chest[1], chest[2]]);
    arrowHit(world, shooter, hit, [-1, 0, 0], 0.01, 0, momentum);
    return world.pendingImpulses.find((impulse) => impulse.fighter === victim).impulse;
  };
  const momentumOf = (cast) => cast.kg * cast.speed;
  const manchu = knock(momentumOf(bowCast(WEAPONS.manchuBow)));
  const steppe = knock(momentumOf(bowCast(WEAPONS.compositeBow)));
  assert.ok(Math.abs(knock(ARROW_MOMENTUM) - ARROW.impulse) < 1e-9, 'the reference war arrow knocks with ARROW.impulse');
  assert.ok(manchu > 1.5 * steppe, `${manchu.toFixed(2)} against ${steppe.toFixed(2)} N·s`);
  const bolt = knock((2 * CROSSBOW.energy * ARROW.joules) / CROSSBOW.speed);
  assert.ok(bolt > manchu);
});
