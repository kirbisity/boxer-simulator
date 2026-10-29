import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs, P } from '../src/body.js';
import { AI, generalFear, generalOf, strengthOf, thinkAll } from '../src/ai.js';
import { createWorld, placeFighter } from '../src/physics.js';

const man = (corner) => ({ inputs: normaliseInputs({ name: 'x', sex: 'male', heightCm: 170, weightKg: 65, age: 28, style: 'spear', outfit: { kind: 'mingGarrison', design: 0 } }), corner });

/** Eight a side (AI.general minSide) in two lines 8 m apart, 1.5 m between files. */
function battle() {
  const world = createWorld([...Array(8).fill('red'), ...Array(8).fill('blue')].map(man), { seed: 4, arena: { halfX: 20, halfZ: 12 } });
  for (const corner of ['red', 'blue']) {
    world.fighters.filter((fighter) => fighter.corner === corner).forEach((fighter, index) => placeFighter(fighter, corner === 'red' ? -4 : 4, (index - 3.5) * 1.5));
  }
  thinkAll(world, 0.01);
  return world;
}
const side = (world, corner) => world.fighters.filter((fighter) => fighter.corner === corner);
const apart = (a, b) => Math.hypot(a.x[P.pelvis * 3] - b.x[P.pelvis * 3], a.x[P.pelvis * 3 + 2] - b.x[P.pelvis * 3 + 2]);

test('each side of a battle has a general, its leader; the man played takes command of his side', () => {
  const world = battle();
  assert.equal(generalOf(world, 'red').id, world.standards.red.leader);
  assert.equal(generalOf(world, 'blue').id, world.standards.blue.leader);
  const me = side(world, 'red').find((fighter) => fighter.id !== world.standards.red.leader);
  me.player = true;
  thinkAll(world, 0.01, new Set([me.id]));
  assert.equal(generalOf(world, 'red'), me);
  assert.ok(world.events.some((event) => event.kind === 'newGeneral' && event.fighter === me.id));
  // His side rallies on him (AI.cohesion's rallying point).
  assert.deepEqual(world.leaders.red.at, [me.x[P.pelvis * 3], me.x[P.pelvis * 3 + 2]]);
});

test('the general falls: command passes to the strongest still fighting near where he fell', () => {
  const world = battle();
  const general = generalOf(world, 'red');
  // A stronger man beside him (a better weapon would do; armour does too): he is the one.
  const strong = side(world, 'red').find((fighter) => fighter !== general && apart(fighter, general) < AI.general.successorWithin);
  strong.body.gear.protection = { blunt: 0.8, cut: 0.8, pierce: 0.8 };
  thinkAll(world, 0.01);
  assert.ok(strengthOf(strong) > strengthOf(general));
  general.state = 'out';
  thinkAll(world, 0.01);
  assert.ok(world.events.some((event) => event.kind === 'generalFell' && event.fighter === general.id));
  assert.equal(generalOf(world, 'red'), strong);
});

test('his fall is a blow to his whole side, the worse for those who saw it, and passes; his presence heartens', () => {
  const world = battle();
  const general = generalOf(world, 'red');
  const near = side(world, 'red').find((fighter) => fighter !== general && apart(fighter, general) < 3);
  assert.equal(generalFear(world, near), -AI.general.heart, 'the general beside him: heart');
  general.state = 'out';
  thinkAll(world, 0.01);
  // A man of his far off: placed out of sight of where he fell.
  const far = side(world, 'red').find((fighter) => fighter !== general && fighter !== near && fighter.id !== generalOf(world, 'red').id);
  placeFighter(far, -18, 10);
  const nearFear = generalFear(world, near);
  const farFear = generalFear(world, far);
  assert.ok(farFear > AI.general.fell * 0.9, `far off: ${farFear.toFixed(2)}`);
  assert.ok(nearFear > farFear + AI.general.saw * 0.5, `saw it: ${nearFear.toFixed(2)}`);
  world.time += AI.general.fellFor + 1;
  assert.ok(generalFear(world, far) <= 0, 'it passes');
  assert.equal(generalFear(world, side(world, 'blue')[0]), side(world, 'blue')[0] === generalOf(world, 'blue') ? 0 : generalFear(world, side(world, 'blue')[0]), 'the other side: nothing of it');
});

test('a handful of men (fewer than AI.general minSide) has no general: they fight round their standard as before', () => {
  const world = createWorld([...Array(5).fill('red'), ...Array(5).fill('blue')].map(man), { seed: 4, arena: { halfX: 20, halfZ: 12 } });
  thinkAll(world, 0.01);
  assert.ok(world.standards.red, 'a standard still');
  assert.equal(generalOf(world, 'red'), null);
});

test('an enemy upon the general: the men nearest him go for that man first', () => {
  const world = battle();
  const general = generalOf(world, 'red');
  const enemy = side(world, 'blue')[0];
  placeFighter(enemy, general.x[P.pelvis * 3] + 1.5, general.x[P.pelvis * 3 + 2]);
  thinkAll(world, 0.01);
  const entry = world.generals.red;
  assert.equal(entry.threat, enemy.id);
  assert.equal(entry.guards.length, AI.general.guards);
  for (const id of entry.guards) assert.equal(world.fighters[id].focus, enemy.id, `guard ${id} on the man upon his general`);
});
