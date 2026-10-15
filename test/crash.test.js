import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { advance, createWorld, crashBetween, crashHarm, crashHardness, crashMass, crashOf, fighterParty, perform, placeFighter, point, WORLD } from '../src/physics.js';
import { vec } from '../src/pose.js';
import { crashOnce } from '../tools/crash.js';

const pair = (a, b, seed = 1) => createWorld([PRESETS[a], PRESETS[b]], { seed });
const median = (values) => [...values].sort((x, y) => x - y)[Math.floor((values.length - 1) / 2)];

test('a crash is two effective masses at a closing speed: equal and opposite impulses, the lighter takes the bigger speed change, the energy is half the reduced mass times the speed squared', () => {
  const light = crashOf(60, 120, 4);
  assert.ok(Math.abs(light.reduced - 40) < 1e-9);
  assert.ok(Math.abs(light.impulse - 40 * 4 * (1 + WORLD.crash.restitution)) < 1e-9);
  assert.ok(Math.abs(light.energy - 0.5 * 40 * 16) < 1e-9);
  // The speed change each part takes is the same impulse over its own mass.
  assert.ok(light.impulse / 60 > light.impulse / 120, 'the lighter is thrown the more');
  // A part brings what is braced behind it standing, and all of the body as far as the body goes into the contact; lying, the ground is behind it.
  assert.equal(crashMass(30, 60, 0, 4), 30);
  assert.equal(crashMass(30, 60, 4, 4), 60);
  assert.equal(crashMass(30, 60, 2, 4), 45);
  assert.equal(crashMass(30, 60, 0, 4, true), 60);
});

test('a heavier, faster body hurts more and is hurt less: a 230 kg gorilla\'s charge against a boxer\'s', () => {
  const world = pair('gorilla', 'amateur');
  const [gorilla, boxer] = world.fighters;
  const toward = [1, 0, 0];
  // Both going into the contact at once, the gorilla's whole weight behind his chest, the boxer standing.
  const gorillaParty = { ...fighterParty(gorilla, 'trunk'), velocity: [3, 0, 0] };
  const standing = fighterParty(boxer, 'trunk');
  const crash = crashBetween(gorillaParty, standing, toward, 3);
  assert.ok(crash.massFirst > 3 * crash.massSecond, `${crash.massFirst.toFixed(0)} kg v ${crash.massSecond.toFixed(0)} kg`);
  // Equal and opposite; the standing man's part is the one that takes the speed.
  assert.ok(crash.impulse / crash.massSecond > 4 * (crash.impulse / crash.massFirst));
  // A boxer into a boxer at the same speed is a fraction of it.
  const [a, b] = pair('amateur', 'amateur').fighters;
  const equal = crashBetween({ ...fighterParty(a, 'trunk'), velocity: [3, 0, 0] }, fighterParty(b, 'trunk'), toward, 3);
  assert.ok(crash.energy > 1.2 * equal.energy && crash.impulse > 1.2 * equal.impulse, `${crash.energy.toFixed(0)} J v ${equal.energy.toFixed(0)} J`);
  // And in the engine: his charge hurts the man it lands on more than a boxer's, and the man it lands on is the one hurt the more.
  const hit = median([0, 1, 2].map((seed) => crashOnce('gorilla', 'amateur', 'rush', 700 + seed).targetTrauma));
  const tackle = median([0, 1, 2].map((seed) => crashOnce('amateur', 'amateur', 'rush', 700 + seed).targetTrauma));
  assert.ok(hit > 1.5 * tackle, `gorilla ${hit.toFixed(2)} v amateur ${tackle.toFixed(2)}`);
});

test('armour takes a share of a crash as it does of a blow, hard armour is worse for what runs into it, and a shove short of the tolerance harms nothing', () => {
  const harmed = (key, hard = 1, closing = 6) => {
    const world = pair(key, 'amateur');
    const victim = world.fighters[0];
    crashHarm(world, victim, 'trunk', { impulse: 300, mass: 40, closing, energy: 900, point: [0, 1, 0], normal: [1, 0, 0], hard });
    return victim.trauma?.trunk ?? 0;
  };
  const bare = harmed('street');
  const plate = harmed('knight');
  assert.ok(bare > 0.5 && plate < 0.6 * bare, `bare ${bare.toFixed(2)}, plate ${plate.toFixed(2)}`);
  assert.ok(harmed('street', crashHardness(0.55)) > 1.2 * bare, 'against hard armour');
  assert.equal(harmed('street', 1, WORLD.crash.tolerance * 0.9), 0, 'a shove');
});

test('a crash to the head shakes the brain and a crash to the chest breaks ribs: the same impulse, by where it lands', () => {
  const land = (key) => {
    const world = pair('amateur', 'amateur');
    const victim = world.fighters[0];
    const mass = key === 'head' ? victim.body.headEffectiveMass : victim.body.massKg * 0.35;
    const event = crashHarm(world, victim, key, { impulse: 150, mass, closing: 4, energy: 300, point: [0, 1, 0], normal: [1, 0, 0] });
    return { victim, event };
  };
  const head = land('head');
  const chest = land('trunk');
  assert.ok(head.event.headDeltaV > 4 && head.victim.concussion > 3, `head Δv ${head.event.headDeltaV.toFixed(1)}`);
  assert.notEqual(head.victim.state, 'up', 'a head struck at that speed puts a man down');
  assert.equal(chest.event.headDeltaV, 0);
  assert.ok(chest.victim.injuries.some((injury) => injury.kind === 'rib'), 'ribs broke');
  assert.ok(chest.victim.trauma.trunk > 0.3 && chest.victim.damage.trunk > 0.3);
  assert.ok(!head.victim.injuries.some((injury) => injury.kind === 'rib'));
});

test('a man running into a man standing is a crash too: both are hurt, the standing man the more, and the charge that drives him over hurts more than a run into him', () => {
  const run = crashOnce('heavy', 'amateur', 'run', 700);
  assert.ok(run.onTarget && run.onCharger, 'both took it');
  assert.ok(run.onTarget.energy > 0 && run.onTarget.force > 0);
  assert.ok(run.targetTrauma > run.chargerTrauma, `${run.targetTrauma.toFixed(2)} v ${run.chargerTrauma.toFixed(2)}`);
  const rush = crashOnce('heavy', 'amateur', 'rush', 700);
  const walk = run;
  assert.ok(rush.onTarget.impulse > walk.onTarget.impulse, 'the faster the harder: a charge lands at more than a run');
});

test('a horse into a man is the same crash: his trunk takes the horse\'s speed over his own mass, ribs break, a plate harness takes its share', () => {
  const into = (key) => {
    const world = createWorld([{ inputs: { ...structuredClone(PRESETS.knight), mounted: true }, corner: 'red' }, { inputs: { ...structuredClone(PRESETS[key]), style: 'unskilled' }, corner: 'blue' }], { seed: 4000, arena: { halfX: 30, halfZ: 20 } });
    const [knight, man] = world.fighters;
    placeFighter(man, 12, 0);
    const [horse] = world.horses;
    for (let t = 0; t < 6; t += 1 / 60) {
      horse.goal = { heading: 0, speed: horse.paces.gallop };
      horse.goalAt = world.time + 1;
      knight.cooldown = 1;
      advance(world, 1 / 60, () => { man.move = 0; });
    }
    return { world, man, event: world.events.find((e) => e.kind === 'crash' && e.defender === man.id && e.target === 'trunk') };
  };
  const bare = into('street');
  const plate = into('knight');
  const e = bare.event;
  assert.ok(e && e.speed > 8, `closing ${e?.speed}`);
  // The reduced mass between the horse and a standing man's chest: a few tens of kg, not the horse's and not nothing.
  const reduced = e.impulse / (e.speed * (1 + WORLD.crash.restitution));
  assert.ok(reduced > 20 && reduced < 50, `${reduced.toFixed(0)} kg`);
  assert.ok(Math.abs(e.energy / (0.5 * reduced * e.speed * e.speed) - 1) < 0.01, 'energy is half the reduced mass times the speed squared');
  assert.ok(e.force > 4000 && bare.man.injuries.some((injury) => injury.kind === 'rib'), `${(e.force / 1000).toFixed(1)} kN, ribs broke`);
  assert.ok(bare.man.trauma.trunk > 1.2 && plate.man.trauma.trunk < 0.6 * bare.man.trauma.trunk, `bare ${bare.man.trauma.trunk.toFixed(2)}, plate ${plate.man.trauma.trunk.toFixed(2)}`);
  // He lands, and the fall hurts him too (his head on the ground).
  assert.ok(bare.world.events.some((event) => event.kind === 'impact' && event.fighter === bare.man.id) || bare.man.trauma.trunk > 1.5, 'and the landing');
});

test('a charge into a shield is stopped by the board: the shield arm and the man braced behind it take the blow and the momentum, not the man behind', () => {
  const world = createWorld([PRESETS.gorilla, PRESETS.hoplomachus], { seed: 700 });
  const [gorilla, bearer] = world.fighters;
  placeFighter(gorilla, -2);
  placeFighter(bearer, 0);
  advance(world, 0.6);
  const before = point(bearer.x, P.pelvis)[0];
  const arm = bearer.damage.lForearm ?? 0;
  assert.ok(bearer.shield, 'he holds a shield');
  assert.ok(perform(world, gorilla, 'rush'), 'he charges');
  for (let frame = 0; frame < 150; frame += 1) {
    bearer.move = 0;
    advance(world, 1 / 60);
  }
  const collision = world.events.find((event) => event.kind === 'collision');
  assert.ok(collision && collision.target === 'shield', 'it landed on the shield');
  assert.ok((bearer.damage.lForearm ?? 0) > arm, 'the shield arm took it');
  assert.ok(world.events.some((event) => event.kind === 'crash' && event.defender === bearer.id), 'and he shared it');
  assert.ok(point(bearer.x, P.pelvis)[0] - before > 0.05 || bearer.state !== 'up', 'and was driven back');
  assert.ok(vec.length(vec.sub(point(gorilla.x, P.pelvis), point(bearer.x, P.pelvis))) > 0.3, 'the gorilla did not go through the board into him');
});

test('two horses head-on take the crash\'s energy through their barding, the lighter horse the more; a brush takes almost none', () => {
  const meet = (blue, offset = 0) => {
    const world = createWorld([{ inputs: { ...structuredClone(PRESETS.knight), mounted: true }, corner: 'red' }, { inputs: { ...structuredClone(PRESETS[blue]), mounted: true }, corner: 'blue' }], { seed: 4000, arena: { halfX: 30, halfZ: 20 } });
    const [a, b] = world.horses;
    const at = [12, -offset];
    placeFighter(world.fighters[1], at[0], at[1]);
    b.at = at;
    b.yaw = Math.PI;
    world.fighters[1].yaw = b.yaw;
    for (let t = 0; t < 4; t += 1 / 60) {
      a.goal = { heading: 0, speed: a.paces.gallop };
      b.goal = { heading: Math.PI, speed: b.paces.gallop };
      for (const horse of world.horses) horse.goalAt = world.time + 1;
      for (const fighter of world.fighters) fighter.cooldown = 1;
      advance(world, 1 / 60);
    }
    return world.horses.map((horse) => horse.trauma);
  };
  const [destrier, steppe] = meet('kheshig');
  assert.ok(destrier > 100 && steppe > 100, `${destrier.toFixed(0)} J and ${steppe.toFixed(0)} J`);
  // The steppe horse is the lighter (and in lighter barding): it takes the more.
  assert.ok(steppe > 1.5 * destrier, `${steppe.toFixed(0)} J v ${destrier.toFixed(0)} J`);
  const [first, second] = meet('knight', 0.65);
  assert.ok(first < 0.3 * destrier && second < 0.3 * destrier, `brushing ${first.toFixed(0)} J and ${second.toFixed(0)} J`);
});
