// The ground finisher (finisher.js): a man helpless on the floor within reach is offered "Finish him"; the attack asked for, or the
// button, kneels the player over him and drives a dagger in as a real stroke. It kills by the simulation, not by a script: plate stops
// a point that is not put in the gap, a hit on the player breaks it off, and nothing here is gated on a stage.

import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, placeFighter, placeOnFloor } from '../src/physics.js';
import { attackLayout, contextAction, directFighter, doAction, newOrders } from '../src/control.js';
import { canFinish, FINISHER, finishTarget, finisherBlade, leastProtected, helplessOnFloor, startFinisher } from '../src/finisher.js';
import { createLevelWorld, levelThink } from '../src/levelmode/level.js';
import { stageThink, updateStage } from '../src/levelmode/stage.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { TESTYARD } from '../src/levelmode/stages/testyard.js';

/**
 * The player (`attacker`, red) and a man of `corner` put on the floor a metre off (state 'down', as a knockdown leaves him), settled.
 * Both are still for the AI; the orders drive the player.
 */
function floored(defender, { attacker = 'light', corner = 'blue', seed = 1, apart = 1, count = 8 } = {}) {
  const world = createWorld([{ inputs: structuredClone(PRESETS[attacker]), corner: 'red' }, { inputs: structuredClone(PRESETS[defender]), corner }], { seed });
  const orders = newOrders();
  const me = world.fighters[0];
  const him = world.fighters[1];
  placeFighter(him, me.root[0] + apart, me.root[1] + 0.1 * (seed % 2));
  const step = (seconds) => advance(world, seconds, (w, dt) => {
    thinkAll(w, dt, new Set([0, 1]));
    directFighter(w, me, orders, dt);
  });
  step(0.3);
  him.state = 'down';
  him.downTimer = count;
  him.knockdowns = 1;
  step(0.8);
  return { world, orders, me, him, step };
}

const events = (world, kind) => world.events.filter((event) => event.kind === kind);

test('offered for a man lying within reach; not for one on his feet, rising, out, far, or while a foe stands on him', () => {
  const { world, me, him } = floored('light');
  assert.equal(helplessOnFloor(him), true);
  assert.equal(finishTarget(world, me), him);
  assert.equal(contextAction(world, me), 'finish', 'the special button reads Finish him');
  // Standing: nothing.
  him.state = 'up';
  assert.equal(finishTarget(world, me), null, 'on his feet');
  assert.notEqual(contextAction(world, me), 'finish');
  // Getting up (any stage of it): no longer helpless.
  him.state = 'rising';
  assert.equal(helplessOnFloor(him), false, 'rising');
  // Out (down for good): the finisher is for the man still in it.
  him.state = 'out';
  assert.equal(finishTarget(world, me), null, 'out');
  // Far.
  him.state = 'down';
  placeFighter(him, me.root[0] + FINISHER.reach + 1.2, me.root[1]);
  assert.equal(finishTarget(world, me), null, 'out of reach');
  placeFighter(him, me.root[0] + 1.2, me.root[1]);
  assert.equal(finishTarget(world, me), him, 'in reach again');
  // A dazed or reeling player cannot kneel to it.
  me.stagger = 0.3;
  assert.equal(canFinish(me), false);
  assert.notEqual(contextAction(world, me), 'finish', 'reeling: not offered');
  me.stagger = 0;
  assert.equal(contextAction(world, me), 'finish');
});

test('a foe on his feet near the player keeps the attack for himself', () => {
  const world = createWorld([{ inputs: structuredClone(PRESETS.light), corner: 'red' }, { inputs: structuredClone(PRESETS.amateur), corner: 'blue' }, { inputs: structuredClone(PRESETS.street), corner: 'blue' }], { seed: 2 });
  const [me, down, standing] = world.fighters;
  placeFighter(down, me.root[0] + 1, me.root[1]);
  placeFighter(standing, me.root[0] + 1.8, me.root[1] + 0.6);
  advance(world, 0.3, (w, dt) => thinkAll(w, dt, new Set([0, 1, 2])));
  down.state = 'down';
  down.downTimer = 8;
  advance(world, 0.6, (w, dt) => thinkAll(w, dt, new Set([0, 1, 2])));
  assert.equal(finishTarget(world, me), null, 'a man on his feet within 2.4 m: not now');
  placeFighter(standing, me.root[0] + 7, me.root[1]);
  assert.equal(finishTarget(world, me), down, 'with him away: offered');
});

test('the attack asked for executes an unarmoured downed man within two seconds: the knife drawn, the blow a real stroke, blood, and the blade put away', () => {
  const { world, orders, me, him, step } = floored('light');
  const before = { weapon: me.weapon?.kind ?? null, style: me.style, mass: me.body.masses[P.rHand] };
  const t0 = world.time;
  // A tap on his man (a move of the style asked for): with a man on the floor within reach, it is the finisher.
  orders.requests.push({ move: attackLayout(me.style)[0].move, zone: 'body', strength: 'quick', at: world.time });
  step(1 / 60);
  assert.ok(me.finisher, 'the attack began the finisher');
  assert.equal(events(world, 'finisher').length, 1);
  assert.equal(before.weapon, null, 'a bare-handed man');
  assert.equal(me.weapon.kind, 'knife', 'the knife from his belt is in his hand');
  let diedAt = null;
  for (let index = 0; index < 150 && diedAt === null; index += 1) {
    step(1 / 60);
    if (him.state === 'out') diedAt = world.time - t0;
  }
  assert.ok(diedAt !== null && diedAt < 2, `he is dead within 2 s (${diedAt})`);
  step(1.2);
  const blows = world.events.filter((event) => event.kind === 'landed' && event.attacker === me.id && event.defender === him.id);
  assert.ok(blows.length >= 1);
  assert.ok(blows.some((event) => event.pierce > 40), `a real point: ${blows.map((event) => event.pierce?.toFixed(0))}`);
  assert.ok(blows.some((event) => /stabbed|run through/.test(event.effects.join())), blows.map((event) => event.effects.join()).join(' | '));
  assert.ok(events(world, 'killed').length === 1 || him.state === 'out');
  assert.ok((him.bleed ?? 0) > 0 && (him.bloodLost ?? 0) > 0, 'with blood');
  assert.equal(me.finisher, null, 'it is over');
  assert.equal(me.weapon?.kind ?? null, before.weapon, 'his own weapon is back in his hand');
  assert.equal(me.style, before.style);
  assert.ok(Math.abs(me.body.masses[P.rHand] - before.mass) < 1e-9, 'its weight back on the hand, the knife\'s off');
});

test('the button does the same; a knight draws his own dagger and takes his sword back after', () => {
  const { world, orders, me, him, step } = floored('light', { attacker: 'knight' });
  assert.equal(me.weapon.kind, 'longsword');
  assert.equal(finisherBlade(me), 'dagger', 'his kit\'s sidearm');
  orders.actions = ['finish'];
  step(0.1);
  assert.equal(me.weapon.kind, 'dagger', 'the dagger in his hand while he does it');
  const heavy = me.body.masses[P.rHand];
  step(2);
  assert.equal(him.state, 'out');
  assert.equal(me.weapon.kind, 'longsword', 'the sword is back');
  assert.ok(me.body.masses[P.rHand] > heavy, 'with its weight');
  assert.equal(me.style, 'longsword');
});

test('through plate it is the gap that kills: the throat aimed, the least guarded place chosen; a blow aimed at the breast does not kill', () => {
  const kills = { gap: 0, breast: 0 };
  const seeds = [1, 2, 3, 4, 5];
  for (const seed of seeds) {
    for (const region of [null, 'breast']) {
      const { world, me, him, step } = floored('knight', { seed });
      assert.equal(leastProtected(him).region, 'throat', 'plate is plate all over: the throat, where the helm meets the gorget');
      assert.ok(startFinisher(world, me, him, { region }));
      step(3);
      const struck = world.events.filter((event) => event.kind === 'landed' && event.attacker === me.id && event.defender === him.id);
      if (him.state === 'out') kills[region ?? 'gap'] += 1;
      if (!region) assert.ok(struck.some((event) => event.effects.includes('into a gap in the armour')), `seed ${seed}: the point went in at a gap`);
      else assert.ok(struck.every((event) => event.target === 'trunk'), 'the breast was struck');
    }
  }
  assert.ok(kills.gap >= seeds.length - 1, `the gap strike kills the man in plate (${kills.gap}/${seeds.length})`);
  assert.equal(kills.breast, 0, 'but a blow at the breastplate does not, in three seconds');
});

test('a hit on the player while he kneels breaks it off: the blade is put away and the man lives', () => {
  const { world, me, him, step } = floored('light');
  assert.ok(startFinisher(world, me, him));
  step(0.45);
  assert.ok(me.finisher, 'underway');
  // Struck: staggered by a blow (the event the sim writes for it).
  world.events.push({ time: world.time, kind: 'landed', attacker: him.id, defender: me.id, punch: 'jab', target: 'head', effects: [] });
  me.stagger = 0.5;
  step(1 / 30);
  assert.equal(me.finisher, null, 'it is given up');
  assert.equal(me.weapon?.kind, PRESETS.light.weapon ?? me.weapon?.kind);
  assert.equal(events(world, 'finisherAborted').length, 1);
  step(2);
  assert.notEqual(him.state, 'out', 'and he is not dead');
});

test('it breaks off if the man stands up or is gone before the blow is away', () => {
  const { world, me, him, step } = floored('light');
  assert.ok(startFinisher(world, me, him));
  step(0.2);
  him.state = 'up';
  step(0.1);
  assert.equal(me.finisher, null);
  assert.ok(events(world, 'finisherAborted').some((event) => /up/.test(event.effects.join())));
});

test('a team-mate or a civilian on the floor is not offered, but the player can choose it; the stroke is the same and it names him', () => {
  for (const corner of ['grey', 'red']) {
    const { world, me, him, step } = floored('amateur', { corner });
    assert.equal(finishTarget(world, me), null, `${corner}: the button does not offer it`);
    assert.notEqual(contextAction(world, me), 'finish');
    assert.equal(finishTarget(world, me, { anyone: true }), him, `${corner}: but he can be chosen`);
    assert.ok(startFinisher(world, me, him), `${corner}: by an explicit call`);
    step(2.5);
    assert.ok(world.events.some((event) => event.kind === 'landed' && event.attacker === me.id && event.defender === him.id), 'the blow lands on him');
  }
  // Locked on, he is the man chosen, so the button offers it.
  const { world, me, him, orders, step } = floored('amateur', { corner: 'grey' });
  orders.lock = him.id;
  step(0.05);
  assert.equal(me.focus, him.id);
  assert.equal(contextAction(world, me), 'finish', 'locked on, he is the man chosen: the button offers it');
});

test('it works in a level (no stage gate): a sentry put down in the test yard is finished, and a civilian struck so is counted against him', () => {
  const world = createLevelWorld(TESTYARD, levelPreset('forger'), { seed: 3 });
  const me = world.fighters[0];
  const sentry = world.fighters.find((fighter) => fighter.spawn?.id === 'sentry1');
  const gardener = world.fighters.find((fighter) => fighter.spawn?.id === 'gardener');
  const orders = newOrders();
  const run = (seconds) => advance(world, seconds, (w, dt) => {
    stageThink(w, dt);
    levelThink(w, dt);
    directFighter(w, me, orders, dt);
  });
  placeOnFloor(me, sentry.x[P.pelvis * 3] - 1, sentry.x[P.pelvis * 3 + 2], 0, 0);
  updateStage(world, true);
  run(0.1);
  sentry.state = 'down';
  sentry.downTimer = 8;
  sentry.knockdowns = 1;
  run(0.8);
  assert.ok(world.stage, 'a stage world');
  assert.equal(contextAction(world, me), 'finish');
  orders.actions = ['finish'];
  run(2.2);
  assert.equal(sentry.state, 'out', 'the sentry is dead');
  assert.equal(me.finisher, null);
  // A civilian put down and finished by choice.
  placeOnFloor(me, gardener.x[P.pelvis * 3] - 1, gardener.x[P.pelvis * 3 + 2], 0, 0);
  run(0.1);
  gardener.state = 'down';
  gardener.downTimer = 8;
  run(0.8);
  assert.ok(startFinisher(world, me, gardener), 'a civilian, by choice');
  run(2.2);
  assert.equal(world.stage.civiliansHarmed, true, 'it counts as harm');
});

test('the AI never finishes anyone: a bout of men knocked about between them leaves no finisher in the log', () => {
  const world = createWorld([{ inputs: structuredClone(PRESETS.heavy), corner: 'red' }, { inputs: structuredClone(PRESETS.contender), corner: 'blue' }], { seed: 9 });
  advance(world, 20, (w, dt) => thinkAll(w, dt));
  assert.equal(events(world, 'finisher').length, 0);
  assert.ok(world.fighters.every((fighter) => !fighter.finisher));
});
