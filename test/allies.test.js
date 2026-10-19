// Level mode, the team: the operative starts Dunnottar with three Forger comrades beside him who follow him, fight beside him, hold at
// the chapel gate and, once they fall, stay fallen through every rest and every death. What the screen is told about them (team.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { thinkAll } from '../src/ai.js';
import { P } from '../src/body.js';
import { advance, knockOut, placeOnFloor } from '../src/physics.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { DN_Y, DUNNOTTAR, DUNNOTTAR_ROUTE } from '../src/levelmode/stages/dunnottar.js';
import { setMechanism, updateStage } from '../src/levelmode/stage.js';
import { createLevelWorld, drainUi, levelThink, respawnPlayer, restAtPoint } from '../src/levelmode/level.js';
import { freePrisoner, mindState } from '../src/levelmode/awareness.js';
import { TEAM, comradesOf, teamAlive, teamStatus } from '../src/levelmode/team.js';
import { holdPlayer } from '../src/levelmode/items.js';
import { directFighter, newOrders, swingAt } from '../src/control.js';
import { finishTarget } from '../src/finisher.js';
import { levelBusy } from '../src/levelmode/level.js';
import { hipsAt, walk } from './walker.js';

const NAMES = ['Brann', 'Maren', 'Old Tobin'];
const man = (world, id) => world.fighters.find((fighter) => fighter.spawn?.id === id);
const apartFrom = (world, fighter) => {
  const [mx, mz] = hipsAt(world.fighters[0]);
  const [fx, fz] = hipsAt(fighter);
  return Math.hypot(mx - fx, mz - fz);
};
const toasts = (messages) => messages.filter((message) => message.type === 'toast').map((message) => message.text);

/** The page's step in a stage: the stage keeps up, the level thinks, the fight AI thinks for the rest, the player is held when busy. */
function thinking(world, dt) {
  updateStage(world);
  levelThink(world, dt);
  thinkAll(world, dt, new Set([0]));
  if (levelBusy(world)) holdPlayer(world.fighters[0]);
}
const run = (world, seconds) => advance(world, seconds, thinking);
/** The garrison asleep, the comrades awake: they are the question. */
const garrisonAsleep = (world) => { for (const fighter of world.fighters) if (fighter.spawn && fighter.spawn.role !== 'ally') fighter.dormant = true; };

const dunnottar = (seed = 3) => createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed });
const fall = (world, fighter) => knockOut(world, fighter, { time: world.time, effects: [] }, 'is struck down', 'killed');

test('team: Dunnottar starts the operative with three named Forger comrades on his side, following, one weapon each', () => {
  const world = dunnottar();
  const comrades = comradesOf(world);
  assert.deepEqual(comrades.map((fighter) => fighter.body.inputs.name), NAMES);
  assert.ok(comrades.every((fighter) => fighter.corner === 'red' && fighter.spawn.role === 'ally'), 'the player\'s corner');
  assert.deepEqual(comrades.map((fighter) => mindState(world, fighter.id)), ['follow', 'follow', 'follow']);
  assert.equal(new Set(comrades.map((fighter) => fighter.style)).size, 3, 'three different weapons');
  assert.deepEqual(comrades.map((fighter) => fighter.style), ['bow', 'spear', 'warhammer']);
  // Beside him on the cliff path's start, and not asleep (the cliff is his section).
  for (const fighter of comrades) {
    assert.ok(apartFrom(world, fighter) < 5, `${fighter.body.inputs.name} is ${apartFrom(world, fighter).toFixed(1)} m off`);
    assert.ok(!fighter.dormant);
    assert.ok(Math.abs(fighter.lift - DN_Y.start) < 0.2, 'on the plateau');
  }
  // Mid-skilled resistance fighters: more than the garrison's levy, less than the operative.
  for (const fighter of comrades) assert.ok(fighter.body.inputs.skill > 0.4 && fighter.body.inputs.skill < 0.75);
  // The prisoners freed later join them.
  assert.equal(comradesOf(world).length, 3);
  freePrisoner(world, 'miner');
  assert.equal(comradesOf(world).length, 4);
});

test('team: what the screen is shown (name, health, state, who is near enough for a pip over his head)', () => {
  const world = dunnottar();
  run(world, 0.5);
  const team = teamStatus(world);
  assert.deepEqual(team.map((entry) => entry.name), NAMES);
  assert.ok(team.every((entry) => entry.alive && entry.fraction > 0.95 && entry.state === 'follow' && entry.near));
  assert.equal(teamAlive(world).length, 3);
  // Hurt, he shows less health; far off, he has no pip but is still in the panel; fallen, he is in the panel struck out.
  const brann = man(world, 'brann');
  brann.bleed = 3;
  brann.bloodLost = 1;
  assert.ok(teamStatus(world)[0].fraction < 1);
  placeOnFloor(brann, -114 + TEAM.markerRange + 6, -4, DN_Y.start, 0);
  assert.equal(teamStatus(world)[0].near, false);
  fall(world, man(world, 'tobin'));
  const after = teamStatus(world);
  assert.equal(after[2].alive, false);
  assert.equal(after[2].state, 'fallen');
  assert.equal(after[2].fraction, 0);
  assert.equal(teamAlive(world).length, 2);
});

test('team: a comrade who falls is said so once, in a toast', () => {
  const world = dunnottar();
  run(world, 0.3);
  drainUi(world);
  fall(world, man(world, 'maren'));
  run(world, 0.3);
  assert.deepEqual(toasts(drainUi(world)), ['Maren has fallen']);
  run(world, 2);
  assert.deepEqual(toasts(drainUi(world)), [], 'not said again');
});

test('team: the fallen stay fallen through a rest and through the operative\'s death; the living are gathered beside him each time', () => {
  const world = dunnottar();
  const rest = DUNNOTTAR.sections.find((section) => section.rest).rest;
  const tobin = man(world, 'tobin');
  run(world, 0.3);
  fall(world, tobin);
  run(world, 0.3);
  assert.equal(tobin.state, 'out');
  // Hurt and left behind: Brann is far off; the rest brings him, whole, beside the player.
  const brann = man(world, 'brann');
  brann.bloodLost = 1.5;
  placeOnFloor(brann, -80, -4.2, DN_Y.start - 1, 0);
  assert.ok(restAtPoint(world, rest));
  run(world, 0.5);
  assert.equal(tobin.state, 'out', 'a rest does not raise the fallen');
  assert.equal(brann.state, 'up');
  assert.ok(!(brann.bloodLost > 0), 'whole again');
  for (const id of ['brann', 'maren']) assert.ok(apartFrom(world, man(world, id)) < 6, `${id} beside him`);
  assert.deepEqual(teamStatus(world).map((entry) => entry.alive), [true, true, false]);
  // Now he dies; Maren dies too (while he lies dead); then he wakes.
  const me = world.fighters[0];
  fall(world, man(world, 'maren'));
  fall(world, me);
  run(world, 0.3);
  const said = drainUi(world);
  assert.ok(said.some((message) => message.type === 'death'));
  assert.deepEqual(toasts(said).filter((text) => /fallen/.test(text)), ['Old Tobin has fallen', 'Maren has fallen']);
  // (The screen's death card calls this behind the dark.)
  assert.ok(respawnPlayer(world));
  assert.equal(world.fighters[0].state, 'up', 'he wakes');
  run(world, 0.5);
  assert.equal(tobin.state, 'out', 'a death does not raise the fallen');
  assert.equal(man(world, 'maren').state, 'out', 'nor Maren, who fell while he was dead');
  assert.equal(brann.state, 'up');
  assert.ok(apartFrom(world, brann) < 6, 'the one who lives is beside him');
  assert.deepEqual(teamStatus(world).map((entry) => entry.alive), [true, false, false]);
  // And the fallen are not said again, however many rests and deaths go by.
  assert.deepEqual(toasts(drainUi(world)).filter((text) => /fallen/.test(text)), []);
});

test('team: they hold at the chapel gate, and the player is told so once', () => {
  const world = dunnottar();
  garrisonAsleep(world);
  setMechanism(world, 'chapelgate', 'open');
  const me = world.fighters[0];
  // On the wall walk behind him, the way the route comes to the gate; he walks on through.
  placeOnFloor(me, 24, -36, DN_Y.ladderRoom, Math.PI);
  updateStage(world, true);
  garrisonAsleep(world);
  comradesOf(world).forEach((fighter, index) => placeOnFloor(fighter, 30 + index * 1.3, -36, DN_Y.ladderRoom, Math.PI));
  drainUi(world);
  const through = [[20, -36], [10, -36], [5, -36], [0, -36], [-6, -36]];
  const result = walk(world, me, through, { seconds: 60, think: (current, dt) => { garrisonAsleep(current); levelThink(current, dt); thinkAll(current, dt, new Set([0])); } });
  assert.equal(result.reached, through.length);
  run(world, 3);
  const states = comradesOf(world).map((fighter) => mindState(world, fighter.id));
  assert.ok(states.some((state) => state === 'stayed'), `at the gate: ${states}`);
  assert.deepEqual(toasts(drainUi(world)), ['Your comrades hold the gate']);
  run(world, 5);
  assert.deepEqual(toasts(drainUi(world)), []);
});

test('team: walking the cliff path, the gorge and the ledge, the stair and the quad, none of them is lost to the sea or left asleep behind', () => {
  const world = dunnottar(3);
  const me = world.fighters[0];
  const quiet = (current, dt) => { garrisonAsleep(current); levelThink(current, dt); thinkAll(current, dt, new Set([0])); };
  for (const leg of DUNNOTTAR_ROUTE.slice(0, 5)) {
    for (const id of leg.open ?? []) setMechanism(world, id, 'open');
    const result = walk(world, me, leg.points, { seconds: 260, think: quiet });
    assert.equal(result.reached, leg.points.length, leg.name);
    assert.deepEqual(teamStatus(world).map((entry) => entry.alive), [true, true, true], `${leg.name}: nobody lost`);
    assert.ok(comradesOf(world).every((fighter) => !fighter.dormant && apartFrom(world, fighter) < 25), `${leg.name}: they are with him`);
  }
});

// ---- Friendly fire: the player can strike anyone (control.js), and a comrade is anyone ----------------------------------------

test('team: a comrade the player strikes stays loyal (does not fight back, keeps following), says so, and is not offered the finisher', () => {
  const world = dunnottar(6);
  garrisonAsleep(world);
  const me = world.fighters[0];
  const maren = man(world, 'maren');
  run(world, 0.5);
  placeOnFloor(maren, hipsAt(me)[0] + 1.0, hipsAt(me)[1], DN_Y.start, Math.PI);
  const orders = newOrders();
  drainUi(world);
  const step = (seconds) => advance(world, seconds, (current, dt) => {
    updateStage(current);
    garrisonAsleep(current);
    levelThink(current, dt);
    thinkAll(current, dt, new Set([0]));
    directFighter(current, me, orders, dt);
  });
  step(0.2);
  assert.ok(swingAt(world, me, orders, 'oberhau', 'head'));
  step(1.2);
  const hits = world.events.filter((event) => event.kind === 'landed' && event.attacker === 0 && event.defender === maren.id);
  assert.ok(hits.length > 0, 'the blow lands on a team-mate');
  assert.deepEqual(toasts(drainUi(world)), ['Maren: "Watch it!"']);
  // She does not turn on him: nothing of hers is aimed at him, and she is not in a fight.
  assert.ok(!world.events.some((event) => event.attacker === maren.id && event.defender === 0), 'she struck no one');
  step(3);
  assert.equal(mindState(world, maren.id), 'follow', 'she goes on following');
  // Down, a comrade is not a man the finisher is offered for (only an enemy, or a man he has locked on).
  placeOnFloor(maren, hipsAt(me)[0] + 1.0, hipsAt(me)[1], DN_Y.start, Math.PI);
  maren.state = 'down';
  assert.equal(finishTarget(world, me), null);
});

test('team: a flurry of blows on a comrade is one complaint, and one he does not survive is a fall, said once', () => {
  const world = dunnottar(6);
  run(world, 0.3);
  drainUi(world);
  const brann = man(world, 'brann');
  const aware = world.stage.aware;
  aware.struckAlly = { id: brann.id, time: world.time };
  run(world, 0.1);
  aware.struckAlly = { id: brann.id, time: world.time + 0.01 };
  run(world, 0.1);
  assert.deepEqual(toasts(drainUi(world)), ['Brann: "Watch it!"']);
  fall(world, brann);
  run(world, 0.3);
  assert.deepEqual(toasts(drainUi(world)), ['Brann has fallen']);
});
