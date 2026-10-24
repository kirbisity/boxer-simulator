// The player can strike anyone: a civilian, a prisoner, a team-mate, a man lying, or the air (control.js attackMark / swingAt,
// physics.js manNear / nearestAnyone). Blue never targets grey or a friend (hostile()); only what the player throws does.

import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, hostile, manNear, nearestAnyone, opponentFor, placeFighter, placeOnFloor, point } from '../src/physics.js';
import { attackAt, attackLayout, attackMark, CONTROL, contextAction, directFighter, lockCandidate, newOrders, swingAt } from '../src/control.js';
import { createLevelWorld } from '../src/levelmode/level.js';
import { stageThink, updateStage } from '../src/levelmode/stage.js';
import { levelThink } from '../src/levelmode/level.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { TESTYARD } from '../src/levelmode/stages/testyard.js';

/** A knight (a long reach) as the player, red; one other man a metre off, of the corner given. */
function pair(corner, { seed = 4, apart = 1, other = 'amateur' } = {}) {
  const world = createWorld([{ inputs: structuredClone(PRESETS.knight), corner: 'red' }, { inputs: structuredClone(PRESETS[other]), corner }], { seed });
  const orders = newOrders();
  const me = world.fighters[0];
  const him = world.fighters[1];
  placeFighter(him, me.root[0] + apart, me.root[1]);
  const step = (seconds) => advance(world, seconds, (w, dt) => {
    thinkAll(w, dt, new Set([0, 1]));
    directFighter(w, me, orders, dt);
  });
  step(0.3);
  return { world, orders, me, him, step };
}

/** The blows the player landed on a man. */
const landed = (world, defender) => world.events.filter((event) => event.kind === 'landed' && event.attacker === 0 && event.defender === defender.id);

test('a swing thrown at a civilian, a prisoner or a team-mate lands on him, by a key and by the body tap, with the attacker and the defender named', () => {
  for (const corner of ['grey', 'red']) {
    // By the key (swingAt, the keys of main.js): thrown at whoever stands there.
    const keyed = pair(corner);
    assert.equal(hostile(keyed.him, keyed.me), false, `${corner}: not an enemy`);
    assert.equal(opponentFor(keyed.world, keyed.me), null, `${corner}: no enemy for the sim to pick`);
    assert.ok(swingAt(keyed.world, keyed.me, keyed.orders, 'oberhau', 'head'), `${corner}: the blow is thrown`);
    keyed.step(0.8);
    assert.ok(landed(keyed.world, keyed.him).length > 0, `${corner}: a key's swing lands on him`);
    // By the body tap / pad (a request for a move of his style).
    const tapped = pair(corner);
    const move = attackLayout(tapped.me.style)[0].move;
    tapped.orders.requests.push({ move, zone: 'head', strength: 'quick', at: tapped.world.time });
    tapped.step(0.9);
    assert.ok(landed(tapped.world, tapped.him).length > 0, `${corner}: a tapped blow lands on him`);
  }
});

test('the blows are real: a swing at a civilian hurts him (blood or a knock), and he is the only man it names as defender', () => {
  const { world, me, him, orders, step } = pair('grey');
  swingAt(world, me, orders, 'oberhau', 'head');
  step(0.8);
  const hits = landed(world, him);
  assert.ok(hits.length > 0);
  assert.ok(hits.every((event) => event.attacker === me.id && event.defender === him.id));
  assert.ok(hits.some((event) => (event.cut ?? 0) + (event.pierce ?? 0) + (event.harm ?? 0) > 0), 'it carries harm, as any blow');
});

test('a swing with nobody there still plays: into the air before him, by a key and by a tap', () => {
  const alone = createWorld([{ inputs: structuredClone(PRESETS.knight), corner: 'red' }, { inputs: structuredClone(PRESETS.light), corner: 'blue' }], { seed: 4 });
  const me = alone.fighters[0];
  placeFighter(alone.fighters[1], me.root[0] + 14, me.root[1]);
  const orders = newOrders();
  advance(alone, 0.3, (w, dt) => directFighter(w, me, orders, dt));
  // His only enemy is 14 m off: the blow goes anyway.
  assert.ok(swingAt(alone, me, orders, 'oberhau', 'head'), 'a key swings at the air');
  assert.ok(me.punch, 'and the stroke is on');
  advance(alone, 1, (w, dt) => directFighter(w, me, orders, dt));
  orders.requests.push({ move: attackLayout(me.style)[0].move, zone: 'body', strength: 'quick', at: alone.time });
  advance(alone, 0.2, (w, dt) => directFighter(w, me, orders, dt));
  assert.ok(me.punch, 'a tap swings at the air too');
  // No one in the world at all but him.
  const lone = createWorld([{ inputs: structuredClone(PRESETS.knight), corner: 'red' }], { seed: 4 });
  const solo = lone.fighters[0];
  const soloOrders = newOrders();
  advance(lone, 0.3, (w, dt) => directFighter(w, solo, soloOrders, dt));
  soloOrders.requests.push({ line: 'mid', strength: 'quick', at: lone.time });
  advance(lone, 0.15, (w, dt) => directFighter(w, solo, soloOrders, dt));
  assert.ok(solo.punch || solo.stats.thrown > 0, 'a line asked for with no one in the world is still thrown');
});

test('who a blow goes at: an enemy near owns it; with none engaged, whoever stands nearest; a far enemy does not', () => {
  const { world, me, him, orders } = pair('grey');
  const enemy = world.fighters.length;
  assert.equal(attackMark(world, me, orders, null), him, 'nobody hostile: the civilian beside him');
  assert.equal(nearestAnyone(world, me, CONTROL.anyoneWithin), him);
  assert.equal(manNear(world, me, point(him.x, P.head), 0.7), him, 'a swing at a place finds the civilian standing there');
  // Add an enemy 3 m off: he owns the blow while engaged (within foeEngaged).
  const withFoe = createWorld([{ inputs: structuredClone(PRESETS.knight), corner: 'red' }, { inputs: structuredClone(PRESETS.amateur), corner: 'grey' }, { inputs: structuredClone(PRESETS.light), corner: 'blue' }], { seed: 4 });
  const [a, civilian, foe] = withFoe.fighters;
  placeFighter(civilian, a.root[0] + 1, a.root[1]);
  placeFighter(foe, a.root[0] + 3, a.root[1]);
  assert.equal(attackMark(withFoe, a, newOrders(), opponentFor(withFoe, a)), foe, 'a foe within 4 m owns the blow');
  placeFighter(foe, a.root[0] + 9, a.root[1]);
  assert.equal(attackMark(withFoe, a, newOrders(), opponentFor(withFoe, a)), civilian, 'a far foe does not: the man beside him');
  assert.ok(enemy > 0);
});

test('lock-on takes a civilian or a team-mate when no enemy is near, and the blows then go at him', () => {
  for (const corner of ['grey', 'red']) {
    const { world, me, him, orders, step } = pair(corner, { apart: 1.1 });
    assert.equal(lockCandidate(world, me, null), him, `${corner}: Lock takes the man beside him`);
    orders.lock = him.id;
    step(0.2);
    assert.equal(orders.lock, him.id, 'the lock holds (he is in the fight)');
    assert.equal(me.focus, him.id);
    assert.equal(opponentFor(world, me), him, 'he is the man he fights');
    const move = attackLayout(me.style)[0].move;
    orders.requests.push({ move, zone: 'body', strength: 'quick', at: world.time });
    step(0.9);
    assert.ok(landed(world, him).length > 0, `${corner}: and a tapped blow lands on the locked man`);
  }
  // An enemy is the lock before a bystander.
  const world = createWorld([{ inputs: structuredClone(PRESETS.knight), corner: 'red' }, { inputs: structuredClone(PRESETS.amateur), corner: 'grey' }, { inputs: structuredClone(PRESETS.light), corner: 'blue' }], { seed: 4 });
  const [a, civilian, foe] = world.fighters;
  placeFighter(civilian, a.root[0] + 1, a.root[1]);
  assert.equal(lockCandidate(world, a, opponentFor(world, a)), foe, 'the enemy the sim picks is taken first');
});

test('the AI never strikes a civilian or a friend: blue leaves grey alone, whatever the player does', () => {
  const world = createWorld([{ inputs: structuredClone(PRESETS.knight), corner: 'red' }, { inputs: structuredClone(PRESETS.amateur), corner: 'grey' }, { inputs: structuredClone(PRESETS.light), corner: 'blue' }], { seed: 4 });
  const [, civilian, foe] = world.fighters;
  placeFighter(civilian, world.fighters[0].root[0] + 0.9, world.fighters[0].root[1]);
  const fought = new Set();
  advance(world, 5, (w, dt) => {
    thinkAll(w, dt, new Set([0]));
    fought.add(opponentFor(w, foe)?.id);
  });
  assert.ok(!fought.has(civilian.id), 'blue never goes for him');
  // (Blue runs in past him at red: a blow can find him only once the run-in has shoved him into its way, never before.)
  const shoved = world.events.find((event) => event.kind === 'bump' && [event.attacker, event.defender].includes(civilian.id))?.time ?? Infinity;
  assert.equal(world.events.filter((event) => event.kind === 'landed' && event.attacker === foe.id && event.defender === civilian.id && event.time < shoved).length, 0, 'blue never struck him');
  assert.equal(opponentFor(world, foe)?.corner, 'red', 'blue picks red');
});

test('a civilian or a prisoner in a level is struck like any man: the gardener and the stray prisoner', () => {
  for (const [id, name] of [['gardener', 'a civilian'], ['stray', 'a prisoner']]) {
    const world = createLevelWorld(TESTYARD, levelPreset('forger'), { seed: 3 });
    const me = world.fighters[0];
    const victim = world.fighters.find((fighter) => fighter.spawn?.id === id);
    assert.equal(victim.corner, 'grey');
    // Beside him, facing him.
    placeOnFloor(me, victim.x[P.pelvis * 3] - 1, victim.x[P.pelvis * 3 + 2], 0, 0);
    updateStage(world, true);
    const orders = newOrders();
    const run = (seconds) => advance(world, seconds, (w, dt) => {
      stageThink(w, dt);
      levelThink(w, dt);
      directFighter(w, me, orders, dt);
    });
    run(0.05);
    placeOnFloor(me, victim.x[P.pelvis * 3] - 1, victim.x[P.pelvis * 3 + 2], 0, 0);
    me.rootVelocity = [0, 0];
    victim.rootVelocity = [0, 0];
    const move = attackLayout(me.style)[0].move;
    orders.requests.push({ move, zone: 'body', strength: 'quick', at: world.time });
    run(0.7);
    const hits = landed(world, victim);
    assert.ok(hits.length > 0, `${name} is hit by the player's blow`);
    assert.ok(hits.every((event) => event.attacker === 0));
    if (id === 'gardener') assert.equal(world.stage.civiliansHarmed, true, 'and it is counted against him');
  }
});

test('the special button is untouched by a bystander: no finisher, no pickup, for a man who is not on the floor', () => {
  const { world, me } = pair('grey');
  assert.notEqual(contextAction(world, me), 'finish', 'a man on his feet is not finished');
  assert.ok(attackAt(me.style, 0, 0), 'the pad is as before');
});
