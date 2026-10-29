import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs } from '../src/body.js';
import { AI, outnumberedFear, thinkAll } from '../src/ai.js';
import { BATTLE_END, judgeBattle } from '../src/battleend.js';
import { createWorld, placeFighter } from '../src/physics.js';

const man = (corner) => ({ inputs: normaliseInputs({ name: 'x', sex: 'male', heightCm: 170, weightKg: 65, age: 28, style: 'spear', outfit: { kind: 'mingGarrison', design: 0 } }), corner });

/** `red` men against `blue`, in two lines facing each other. */
function battle(red, blue) {
  const world = createWorld([...Array(red).fill('red'), ...Array(blue).fill('blue')].map(man), { seed: 3, arena: { halfX: 20, halfZ: 12 } });
  for (const corner of ['red', 'blue']) {
    world.fighters.filter((fighter) => fighter.corner === corner).forEach((fighter, index) => placeFighter(fighter, corner === 'red' ? -3 : 3, index - 3));
  }
  return world;
}
const side = (world, corner) => world.fighters.filter((fighter) => fighter.corner === corner);

test('a battle is decided once a side has nobody still fighting for a couple of seconds, not at its last man', () => {
  const world = battle(6, 6);
  assert.equal(judgeBattle(world), null, 'both sides fighting: undecided');
  // Every blue broken and running (on their feet, in the battle still: the old rule would wait for each).
  for (const fighter of side(world, 'blue')) fighter.panicked = true;
  assert.equal(judgeBattle(world), null, 'just broken: not yet');
  world.time += BATTLE_END.holdFor + 0.1;
  const verdict = judgeBattle(world);
  assert.equal(verdict?.winner, 'red');
  assert.equal(verdict.how, 'collapsed');
  // Decided is kept: a runner who rallies does not undo it.
  for (const fighter of side(world, 'blue')) fighter.panicked = false;
  assert.equal(judgeBattle(world).winner, 'red');
});

test('a remnant outnumbered three to one is beaten; a rally inside the hold resets it', () => {
  const world = battle(7, 7);
  const blues = side(world, 'blue');
  // One blue of seven still fighting (≤ 15%), against seven: decided after the hold.
  for (const fighter of blues.slice(1)) fighter.state = 'out';
  judgeBattle(world);
  world.time += 1;
  // A second man gets up (two of seven: past the remnant): the clock starts again.
  blues[1].state = 'up';
  assert.equal(judgeBattle(world), null);
  blues[1].state = 'out';
  judgeBattle(world);
  world.time += BATTLE_END.holdFor - 0.5;
  assert.equal(judgeBattle(world), null, 'the hold counts from the last collapse');
  world.time += 1;
  assert.equal(judgeBattle(world)?.winner, 'red');
});

test('at the time limit the stronger side holds the field; near even, a draw', () => {
  const even = battle(5, 5);
  even.time = BATTLE_END.timeLimit;
  assert.deepEqual([judgeBattle(even).winner, judgeBattle(even).how], [null, 'time']);
  const uneven = battle(5, 5);
  side(uneven, 'red')[0].state = 'out';
  side(uneven, 'red')[1].panicked = true;
  uneven.time = BATTLE_END.timeLimit;
  assert.equal(judgeBattle(uneven).winner, 'blue');
});

test('a duel and a small fight end only with their last man, as before', () => {
  const duel = createWorld([man('red'), man('blue')], { seed: 1 });
  duel.fighters[1].panicked = true;
  duel.time = BATTLE_END.timeLimit + 10;
  assert.equal(judgeBattle(duel), null, 'a man broken in a duel is still in it; no time limit');
  duel.fighters[1].state = 'out';
  assert.equal(judgeBattle(duel).winner, 'red');
});

test('heavily outnumbered on the field, every man of the side is afraid; at even odds nobody', () => {
  const world = battle(6, 6);
  thinkAll(world, 0.01);
  const [me] = side(world, 'red');
  assert.equal(outnumberedFear(world, me), 0, 'even: nothing');
  // Four of red out: two against six, three to one.
  for (const fighter of side(world, 'red').slice(2)) fighter.state = 'out';
  thinkAll(world, 0.01);
  const three = outnumberedFear(world, me);
  assert.ok(Math.abs(three - AI.outnumbered.fear) < 0.05, `three to one: ${three.toFixed(2)}`);
  assert.equal(outnumberedFear(world, side(world, 'blue')[0]), 0, 'the side that outnumbers feels nothing of it');
  // One against six: worse again.
  side(world, 'red')[1].state = 'out';
  thinkAll(world, 0.01);
  assert.ok(outnumberedFear(world, me) > three + 0.15, `six to one: ${outnumberedFear(world, me).toFixed(2)}`);
});

test('a side whose assault is spent is beaten, though more than a remnant still stands', () => {
  const world = battle(10, 10);
  const blues = side(world, 'blue');
  // Sized up as they came to the field (what each side came with).
  thinkAll(world, 0.01);
  // Two of ten standing: past the remnant (15%), but a fifth of its strength against all of red's.
  for (const fighter of blues.slice(2)) fighter.state = 'out';
  judgeBattle(world);
  world.time += BATTLE_END.holdFor + 0.1;
  assert.deepEqual([judgeBattle(world)?.winner, judgeBattle(world)?.how], ['red', 'collapsed']);
  // Three of ten standing is still a fight.
  const fighting = battle(10, 10);
  thinkAll(fighting, 0.01);
  for (const fighter of side(fighting, 'blue').slice(3)) fighter.state = 'out';
  judgeBattle(fighting);
  fighting.time += BATTLE_END.holdFor + 0.1;
  assert.equal(judgeBattle(fighting), null);
});

test('one broken man running is chased by the few near him, not by the whole army', () => {
  const world = battle(8, 6);
  const blues = side(world, 'blue');
  for (const fighter of blues.slice(1)) fighter.state = 'out';
  blues[0].panicked = true;
  for (let step = 0; step < 5; step += 1) thinkAll(world, 0.01);
  const after = side(world, 'red').filter((fighter) => fighter.focus === blues[0].id).length;
  assert.ok(after >= 1 && after <= AI.pursuit.chasers, `${after} chase him`);
  // Rallied, he is a man to fight again: anyone near may go for him.
  blues[0].panicked = false;
  for (let step = 0; step < 5; step += 1) thinkAll(world, 0.01);
  assert.ok(side(world, 'red').filter((fighter) => fighter.focus === blues[0].id).length > AI.pursuit.chasers);
});
