// The horse peoples' levels (Mobei, Carrhae, the Catalaunian Plains): their kit and casts, the horse archer's
// way of fighting from the saddle (riding.js skirmish), the counted quiver and the train, and the square.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs, P } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { gothWarrior, hunRider, lateRomanSoldier, parthianRider, republicanLegionary, xiongnuRider } from '../src/cast.js';
import { canRide, mountOf } from '../src/horses.js';
import { MUSTER } from '../src/muster.js';
import { factionOf, FACTIONS, gearTraits, HELMETS, outfitOf } from '../src/outfits.js';
import { advance, createWorld, seededRandom } from '../src/physics.js';
import { leadFor, loose } from '../src/physics/ranged.js';
import { RIDING } from '../src/riding.js';
import { battleOf, SCENARIOS } from '../src/scenarios.js';
import { vec } from '../src/pose.js';

const LEVELS = ['mobei', 'carrhae', 'catalaunian'];
const at = (fighter) => (fighter.mount ? [fighter.mount.at[0], fighter.mount.at[1]] : [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]]);
const apart = (a, b) => Math.hypot(at(a)[0] - at(b)[0], at(a)[1] - at(b)[1]);

test('the new kit: each people\'s, the horse peoples ride, the horse archers carry a counted quiver, the helmets weigh what they weigh', () => {
  const random = seededRandom(3);
  const men = { xiongnu: xiongnuRider(random), hun: hunRider(random), hunNoble: hunRider(random, 'spatha', 'noble'), lateRoman: lateRomanSoldier(random), goth: gothWarrior(random), gothNoble: gothWarrior(random, 'spear', 'noble', { mounted: true }), republicanLegionary: republicanLegionary(random), cataphract: parthianRider(random, 'kontos', 'cataphract'), parthianArcher: parthianRider(random) };
  for (const [kind, man] of Object.entries(men)) assert.equal(man.outfit.kind, kind);
  assert.equal(factionOf(men.xiongnu), 'steppe');
  assert.equal(factionOf(men.hun), 'steppe');
  assert.equal(factionOf(men.lateRoman), 'romans');
  assert.equal(factionOf(men.republicanLegionary), 'romans');
  assert.equal(factionOf(men.goth), 'goths');
  assert.equal(factionOf(men.cataphract), 'parthians');
  assert.ok(FACTIONS.goths && FACTIONS.parthians);
  for (const kind of ['xiongnu', 'hun', 'hunNoble', 'gothNoble', 'cataphract', 'parthianArcher']) assert.ok(canRide(men[kind]), kind);
  for (const kind of ['lateRoman', 'goth', 'republicanLegionary']) assert.ok(!canRide(men[kind]), kind);
  // The cataphract's horse is armoured; the horse archers' are not.
  assert.notEqual(mountOf(men.cataphract).barding, 'bare');
  assert.equal(mountOf(men.parthianArcher).barding, 'bare');
  for (const kind of ['xiongnu', 'hun', 'parthianArcher']) assert.ok(gearTraits(men[kind]).quiver > 20, kind);
  assert.equal(gearTraits(men.lateRoman).quiver, null);
  for (const head of ['montefortino', 'ridgeHelm', 'spangenhelm']) assert.ok(HELMETS[head].mass > 1, head);
  assert.equal(outfitOf(men.republicanLegionary).look.head.kind, 'montefortino');
  // Iron lamellar turns arrows; the Republic's mail does not (Carrhae's arrows went through it).
  assert.ok(gearTraits(normaliseInputs({ outfit: { kind: 'hanSoldier' } })).arrowproof);
  assert.ok(!gearTraits(men.republicanLegionary).arrowproof);
});

test('the three levels: their peoples, no side over the setup screen\'s cap, the history\'s arms', () => {
  for (const key of LEVELS) {
    const level = battleOf(key);
    const sides = level.cast(seededRandom(5));
    for (const corner of ['red', 'blue']) assert.ok(sides[corner].length <= MUSTER.cap, `${key} ${corner}: ${sides[corner].length}`);
    assert.ok(level.armies.red.length && level.armies.blue.length);
    assert.equal(level.scene, key);
  }
  const mobei = SCENARIOS.mobei.cast(seededRandom(1));
  assert.ok(mobei.red.filter((man) => man.style === 'nu').length >= 20, 'Han crossbowmen');
  assert.ok(mobei.red.some((man) => man.mounted), 'Han horse');
  assert.ok(mobei.blue.every((man) => man.mounted && man.outfit.kind === 'xiongnu'), 'the Xiongnu all ride');
  assert.ok(mobei.blue.filter((man) => man.style === 'steppeBow').length > mobei.blue.length * 0.8, 'nearly all horse archers');
  const carrhae = SCENARIOS.carrhae.cast(seededRandom(1));
  assert.ok(carrhae.red.filter((man) => man.outfit.kind === 'republicanLegionary').length >= 40);
  const cataphracts = carrhae.blue.filter((man) => man.outfit.kind === 'cataphract');
  const archers = carrhae.blue.filter((man) => man.outfit.kind === 'parthianArcher');
  assert.ok(cataphracts.length > 0 && cataphracts.length < archers.length / 4, 'a few cataphracts, many more archers');
  assert.ok(carrhae.red.length > carrhae.blue.length, 'the Romans outnumber the Parthians');
  assert.ok(SCENARIOS.carrhae.formation.blue.train, 'the camel train');
  assert.ok(SCENARIOS.carrhae.formation.red.drill.square, 'the square');
  const catalaunian = SCENARIOS.catalaunian.cast(seededRandom(1));
  assert.deepEqual(new Set(catalaunian.red.map(factionOf)), new Set(['romans', 'goths']));
  assert.deepEqual(new Set(catalaunian.blue.map(factionOf)), new Set(['steppe', 'goths']));
  assert.ok(catalaunian.blue.some((man) => man.name === 'Attila'));
});

/** A world of these men on an open floor, red at −x and blue at +x. */
function field(red, blue, { train = null, seed = 2 } = {}) {
  const entries = [...red.map((inputs) => ({ inputs: normaliseInputs(inputs), corner: 'red' })), ...blue.map((inputs) => ({ inputs: normaliseInputs(inputs), corner: 'blue' }))];
  return createWorld(entries, { seed, arena: { halfX: 50, halfZ: 32 }, formation: { red: { front: 6, spacing: 1.2 }, blue: { front: 30, spacing: 5, ...(train ? { train } : {}) } } });
}

test('a horse archer shoots from the saddle as he rides, and does not let men on foot come to him', () => {
  const random = seededRandom(7);
  const w = field([lateRomanSoldier(random, 'spathaOval'), lateRomanSoldier(random, 'spathaOval'), lateRomanSoldier(random, 'spathaOval')], [xiongnuRider(random)]);
  const archer = w.fighters.find((fighter) => fighter.corner === 'blue');
  const romans = w.fighters.filter((fighter) => fighter.corner === 'red');
  let loosed = 0;
  let movingShots = 0;
  let closest = Infinity;
  let cursor = 0;
  for (let t = 0; t < 30 && archer.state === 'up'; t += 0.1) {
    advance(w, 0.1, (world, dt) => thinkAll(world, dt));
    for (; cursor < w.events.length; cursor += 1) {
      if (w.events[cursor].kind !== 'loosed' || w.events[cursor].attacker !== archer.id) continue;
      loosed += 1;
      if (Math.abs(archer.mount.speed) > 3) movingShots += 1;
    }
    if (archer.mount) for (const roman of romans) if (roman.state === 'up') closest = Math.min(closest, apart(archer, roman));
  }
  assert.ok(archer.mount, 'still in the saddle');
  assert.ok(loosed >= 6, `loosed ${loosed}`);
  assert.ok(movingShots >= loosed / 2, `${movingShots} of ${loosed} shots from a moving horse`);
  // The men on foot never get to him (a sword's reach and a horse's length).
  assert.ok(closest > 3, `came within ${closest.toFixed(1)} m`);
});

test('the arrow carries the horse\'s pace, and is aimed ahead of a moving man by his pace against the shooter\'s', () => {
  const random = seededRandom(9);
  const w = field([lateRomanSoldier(random)], [xiongnuRider(random)]);
  const archer = w.fighters.find((fighter) => fighter.corner === 'blue');
  const roman = w.fighters.find((fighter) => fighter.corner === 'red');
  archer.mount.velocity = [0, 0, 8];
  roman.rootVelocity = [0, 0];
  const mark = [roman.x[P.pelvis * 3], 1.2, roman.x[P.pelvis * 3 + 2]];
  const led = leadFor(archer, roman, mark);
  // The man stands; the archer rides across at 8 m/s: aimed behind the mark (−z), by the flight time's worth of the horse's pace.
  assert.ok(led[2] < mark[2] - 0.5, `led ${led[2].toFixed(2)} against ${mark[2].toFixed(2)}`);
  archer.punch = { aim: null };
  loose(w, archer);
  const arrow = w.arrows[w.arrows.length - 1];
  assert.ok(arrow.v[2] > 6, `the arrow's way across: ${arrow.v[2].toFixed(1)} m/s`);
});

test('a counted quiver runs out; with a train on the field he rides back to it for a fresh one', () => {
  const random = seededRandom(11);
  const w = field([lateRomanSoldier(random, 'spathaOval')], [parthianRider(random)], { train: { back: 6 } });
  const archer = w.fighters.find((fighter) => fighter.corner === 'blue');
  assert.ok(w.trains.blue, 'the train is on the field');
  archer.arrows = 1;
  let emptied = false;
  let resupplied = false;
  let cursor = 0;
  for (let t = 0; t < 60 && !resupplied && archer.state === 'up'; t += 0.1) {
    advance(w, 0.1, (world, dt) => thinkAll(world, dt));
    for (; cursor < w.events.length; cursor += 1) {
      if (w.events[cursor].fighter !== archer.id) continue;
      if (w.events[cursor].kind === 'quiverEmpty') emptied = true;
      if (w.events[cursor].kind === 'resupplied') resupplied = true;
    }
  }
  assert.ok(emptied, 'his quiver ran out');
  assert.ok(resupplied, 'and was refilled at the train');
  assert.equal(archer.arrows, archer.body.gear.quiver);
  assert.ok(!archer.weapon.spent && archer.weapon.held);
  assert.ok(Math.hypot(archer.mount.at[0] - w.trains.blue.at[0], archer.mount.at[1] - w.trains.blue.at[1]) < RIDING.archer.resupply.radius + 1);
});

test('Crassus\'s square: drilled as a square, its outer ring the front every way round, its shields a wall, the inner ring\'s a roof', () => {
  const level = battleOf('carrhae');
  const sides = level.cast(seededRandom(1));
  const entries = ['red', 'blue'].flatMap((corner) => sides[corner].map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner })));
  const w = createWorld(entries, { seed: 1, arena: level.arena, formation: level.formation });
  advance(w, 2, (world, dt) => thinkAll(world, dt));
  const formation = w.formations.red;
  assert.ok(formation.drill.square && !formation.drill.advance);
  const legion = w.fighters.filter((fighter) => fighter.formation === 'red' && fighter.state === 'up');
  const outer = legion.filter((fighter) => fighter.inFront);
  assert.ok(outer.length >= 24 && outer.length < legion.length, `${outer.length} of ${legion.length} in the outer ring`);
  // The outer ring is all round: men in front of the middle, behind it and to both sides.
  const middle = legion.reduce((sum, fighter) => vec.add(sum, [at(fighter)[0] / legion.length, 0, at(fighter)[1] / legion.length]), [0, 0, 0]);
  const sides4 = new Set(outer.map((fighter) => { const dx = at(fighter)[0] - middle[0]; const dz = at(fighter)[1] - middle[2]; return Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) : 2 * Math.sign(dz); }));
  assert.equal(sides4.size, 4);
  if (formation.testudo) {
    assert.ok(outer.every((fighter) => fighter.shieldPose === 'wall'));
    assert.ok(legion.filter((fighter) => !fighter.inFront).every((fighter) => fighter.shieldPose === 'roof'));
  }
});
