// Level mode, the team: the operative starts Dunnottar with two weak Forger comrades beside him (a short sword each, no armour) who follow
// him, fight beside him and hold at the chapel gate. A rest records who is alive; a death brings back exactly those (the ones who fell
// since the rest), and one who fell before the rest is lost for good. What the screen is told about them (team.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { thinkAll } from '../src/ai.js';
import { P } from '../src/body.js';
import { advance, knockOut, placeOnFloor } from '../src/physics.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { DN_Y, DUNNOTTAR, DUNNOTTAR_ROUTE, dunnottarWithTeam } from '../src/levelmode/stages/dunnottar.js';
import { setMechanism, updateStage } from '../src/levelmode/stage.js';
import { createLevelWorld, drainUi, levelThink, respawnPlayer, restAtPoint } from '../src/levelmode/level.js';
import { freePrisoner, mindState } from '../src/levelmode/awareness.js';
import { TEAM, comradesOf, teamAlive, teamStatus } from '../src/levelmode/team.js';
import { holdPlayer } from '../src/levelmode/items.js';
import { directFighter, newOrders, swingAt } from '../src/control.js';
import { finishTarget } from '../src/finisher.js';
import { levelBusy } from '../src/levelmode/level.js';
import { hipsAt, walk } from './walker.js';

const NAMES = ['Maren', 'Old Tobin'];
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

const dunnottar = (seed = 3) => createLevelWorld(dunnottarWithTeam(), levelPreset('forger'), { seed });
const fall = (world, fighter) => knockOut(world, fighter, { time: world.time, effects: [] }, 'is struck down', 'killed');

test('team: Dunnottar starts the operative with two named Forger comrades on his side, following, a short sword each', () => {
  const world = dunnottar();
  const comrades = comradesOf(world);
  assert.deepEqual(comrades.map((fighter) => fighter.body.inputs.name), NAMES);
  assert.ok(comrades.every((fighter) => fighter.corner === 'red' && fighter.spawn.role === 'ally'), 'the player\'s corner');
  assert.deepEqual(comrades.map((fighter) => mindState(world, fighter.id)), ['follow', 'follow']);
  assert.deepEqual(comrades.map((fighter) => fighter.style), ['shortSword', 'shortSword']);
  assert.deepEqual(comrades.map((fighter) => fighter.weapon?.kind), ['shortSword', 'shortSword'], 'the short sword in the hand');
  // Beside him on the cliff path's start, and not asleep (the cliff is his section).
  for (const fighter of comrades) {
    assert.ok(apartFrom(world, fighter) < 5, `${fighter.body.inputs.name} is ${apartFrom(world, fighter).toFixed(1)} m off`);
    assert.ok(!fighter.dormant);
    assert.ok(Math.abs(fighter.lift - DN_Y.start) < 0.2, 'on the plateau');
  }
  // Weak: drilled less than the operative (and no more than the garrison's best), in plain clothes with nothing on that turns a blow.
  const operative = world.fighters[0];
  for (const fighter of comrades) {
    assert.ok(fighter.body.inputs.skill > 0.3 && fighter.body.inputs.skill < operative.body.inputs.skill - 0.2, `${fighter.body.inputs.name} is less drilled`);
    assert.equal(fighter.body.inputs.outfit.kind, 'commoner', 'plain clothes, not the Forgers\' gambeson');
    const { blunt, cut, pierce, bullet } = fighter.body.gear.protection;
    assert.deepEqual([blunt, cut, pierce, bullet.head, bullet.torso, bullet.limb], [0, 0, 0, 0, 0, 0], 'no armour at all');
    assert.equal(fighter.body.gear.helmet.mass, 0, 'no helmet');
    assert.ok(!fighter.body.gear.breastplate, 'no breastplate');
  }
  assert.ok(operative.body.gear.protection.cut > 0.3, 'the operative has his gambeson');
  // The prisoners freed later join them.
  assert.equal(comradesOf(world).length, 2);
  freePrisoner(world, 'miner');
  assert.equal(comradesOf(world).length, 3);
});

test('team: what the screen is shown (name, health, state, who is near enough for a pip over his head)', () => {
  const world = dunnottar();
  run(world, 0.5);
  const team = teamStatus(world);
  assert.deepEqual(team.map((entry) => entry.name), NAMES);
  assert.ok(team.every((entry) => entry.alive && entry.fraction > 0.95 && entry.state === 'follow' && entry.near));
  assert.equal(teamAlive(world).length, 2);
  // Hurt, he shows less health; far off, he has no pip but is still in the panel; fallen, he is in the panel struck out.
  const maren = man(world, 'maren');
  maren.bleed = 3;
  maren.bloodLost = 1;
  assert.ok(teamStatus(world)[0].fraction < 1);
  placeOnFloor(maren, -114 + TEAM.markerRange + 6, -4, DN_Y.start, 0);
  assert.equal(teamStatus(world)[0].near, false);
  fall(world, man(world, 'tobin'));
  const after = teamStatus(world);
  assert.equal(after[1].alive, false);
  assert.equal(after[1].state, 'fallen');
  assert.equal(after[1].fraction, 0);
  assert.equal(teamAlive(world).length, 1);
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

test('team: a rest records who is alive; a death brings back exactly those, and one who fell before the rest is lost for good', () => {
  const world = dunnottar();
  const rest = DUNNOTTAR.sections.find((section) => section.rest).rest;
  const maren = man(world, 'maren');
  const tobin = man(world, 'tobin');
  const me = world.fighters[0];
  run(world, 0.3);
  // Before any rest the start is the checkpoint, with both on the roster: Tobin falls, then the operative does, and both wake.
  assert.deepEqual(world.stage.level.checkpoint.comrades, ['maren', 'tobin']);
  fall(world, tobin);
  run(world, 0.3);
  assert.equal(tobin.state, 'out');
  fall(world, me);
  run(world, 0.3);
  const said = drainUi(world);
  assert.ok(said.some((message) => message.type === 'death'));
  assert.deepEqual(toasts(said).filter((text) => /fallen/.test(text)), ['Old Tobin has fallen']);
  // (The screen's death card calls this behind the dark.)
  assert.ok(respawnPlayer(world));
  run(world, 0.5);
  assert.equal(me.state, 'up', 'he wakes');
  assert.equal(tobin.state, 'up', 'Tobin fell since the checkpoint: he is back');
  assert.ok(apartFrom(world, tobin) < 6, 'beside him');
  assert.deepEqual(teamStatus(world).map((entry) => entry.alive), [true, true]);
  // Hurt and left behind: Maren is far off; the rest brings her, whole, beside the player, and records both.
  maren.bloodLost = 1.5;
  placeOnFloor(maren, -80, -4.2, DN_Y.start - 1, 0);
  assert.ok(restAtPoint(world, rest));
  run(world, 0.5);
  assert.equal(maren.state, 'up');
  assert.ok(!(maren.bloodLost > 0), 'whole again');
  assert.ok(apartFrom(world, maren) < 6, 'beside him');
  assert.deepEqual(world.stage.level.checkpoint.comrades, ['maren', 'tobin']);
  // Now Maren falls, and the operative falls after her: waking, both are back; the toast for her is said again if she falls again.
  drainUi(world);
  fall(world, maren);
  run(world, 0.3);
  fall(world, me);
  run(world, 0.3);
  assert.ok(respawnPlayer(world));
  run(world, 0.5);
  assert.equal(maren.state, 'up', 'a comrade who fell since the rest comes back');
  assert.equal(tobin.state, 'up');
  assert.ok(apartFrom(world, maren) < 6 && apartFrom(world, tobin) < 6, 'both beside him');
  assert.deepEqual(toasts(drainUi(world)).filter((text) => /fallen/.test(text)), ['Maren has fallen']);
  fall(world, maren);
  run(world, 0.3);
  assert.deepEqual(toasts(drainUi(world)).filter((text) => /fallen/.test(text)), ['Maren has fallen'], 'said again, for she was brought back and fell again');
  // Maren is dead when the next rest is reached: she is lost for good, through the rest and through every death after.
  assert.ok(restAtPoint(world, rest));
  run(world, 0.5);
  assert.equal(maren.state, 'out', 'a rest does not raise the fallen');
  assert.deepEqual(world.stage.level.checkpoint.comrades, ['tobin'], 'the roster is the living');
  fall(world, me);
  run(world, 0.3);
  assert.ok(respawnPlayer(world));
  run(world, 0.5);
  assert.equal(maren.state, 'out', 'lost for good');
  assert.equal(tobin.state, 'up');
  assert.deepEqual(teamStatus(world).map((entry) => entry.alive), [false, true]);
});

test('team: a prisoner freed after the rest is not on its roster, but lives on beside him; one who falls after being freed is not brought back by a death', () => {
  const world = dunnottar();
  const me = world.fighters[0];
  run(world, 0.3);
  freePrisoner(world, 'miner');
  const miner = man(world, 'miner');
  assert.deepEqual(world.stage.level.checkpoint.comrades, ['maren', 'tobin'], 'freed after the checkpoint was made');
  fall(world, miner);
  fall(world, me);
  run(world, 0.3);
  assert.ok(respawnPlayer(world));
  run(world, 0.5);
  assert.equal(miner.state, 'out', 'not on the roster, so he stays down');
  assert.equal(man(world, 'maren').state, 'up');
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
    assert.deepEqual(teamStatus(world).map((entry) => entry.alive), [true, true], `${leg.name}: nobody lost`);
    assert.ok(comradesOf(world).every((fighter) => !fighter.dormant && apartFrom(world, fighter) < 25), `${leg.name}: they are with him`);
  }
});

// ---- Friendly fire: the player can strike anyone (control.js), and a comrade is anyone ----------------------------------------

test('team: a comrade the player strikes stays loyal (does not fight back, keeps following), says so, and is not offered the finisher', () => {
  // (The seed is the swing's: whether one oberhau lands depends on the world's draws, which the stage's cast changes; 7 since the drawbridge's guard.)
  const world = dunnottar(7);
  garrisonAsleep(world);
  const me = world.fighters[0];
  const maren = man(world, 'maren');
  run(world, 0.5);
  placeOnFloor(maren, hipsAt(me)[0] + 1.0, hipsAt(me)[1], DN_Y.start, Math.PI);
  const orders = newOrders();
  drainUi(world);
  // (She keeps her place in front of him while the blow is thrown: a comrade is quick on her feet, and the question is the blow.)
  let stays = true;
  const step = (seconds) => advance(world, seconds, (current, dt) => {
    updateStage(current);
    garrisonAsleep(current);
    levelThink(current, dt);
    thinkAll(current, dt, new Set([0]));
    if (stays) placeOnFloor(maren, hipsAt(me)[0] + 1.0, hipsAt(me)[1], DN_Y.start, Math.PI);
    directFighter(current, me, orders, dt);
  });
  step(0.2);
  assert.ok(swingAt(world, me, orders, 'oberhau', 'head'));
  step(1.2);
  const hits = world.events.filter((event) => event.kind === 'landed' && event.attacker === 0 && event.defender === maren.id);
  assert.ok(hits.length > 0, 'the blow lands on a team-mate');
  assert.deepEqual(toasts(drainUi(world)), ['Maren: "Watch it!"']);
  stays = false;
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
  const tobin = man(world, 'tobin');
  const aware = world.stage.aware;
  aware.struckAlly = { id: tobin.id, time: world.time };
  run(world, 0.1);
  aware.struckAlly = { id: tobin.id, time: world.time + 0.01 };
  run(world, 0.1);
  assert.deepEqual(toasts(drainUi(world)), ['Old Tobin: "Watch it!"']);
  fall(world, tobin);
  run(world, 0.3);
  assert.deepEqual(toasts(drainUi(world)), ['Old Tobin has fallen']);
});
