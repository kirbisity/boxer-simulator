// Level mode, the flow around the stage (Phase C1): the banner that never comes, the ending (boss out, the inner door, the
// prince's scene), the freed who stay out of the boss fight, the markers, the man the marker is over, restart from a rest.

import test from 'node:test';
import assert from 'node:assert/strict';
import { thinkAll } from '../src/ai.js';
import { P } from '../src/body.js';
import { advance, createWorld, knockOut, placeOnFloor } from '../src/physics.js';
import { PRESETS } from '../src/body.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { DUNNOTTAR } from '../src/levelmode/stages/dunnottar.js';
import { TESTYARD } from '../src/levelmode/stages/testyard.js';
import { checkStage, setMechanism, updateStage } from '../src/levelmode/stage.js';
import { bannerWinner, createLevelWorld, drainUi, endingBusy, endingDone, endingOf, killBoss, levelBusy, levelOpponent, levelThink, princeOf, restartFromRest, restAtPoint } from '../src/levelmode/level.js';
import { cowerFor, freePrisoner, mindState } from '../src/levelmode/awareness.js';
import { markerCandidates } from '../src/levelmode/markers.js';
import { holdPlayer } from '../src/levelmode/items.js';
import { hipsAt, walk } from './walker.js';

const L = DUNNOTTAR.sections.find((section) => section.id === 'chapel').spawns[0].post[1];
// The prince is in the cell directly behind the chancel doors: near him (inside the doors), and far from him (in the nave).
const PRINCE = DUNNOTTAR.sections.find((section) => section.id === 'cell').spawns.find((spawn) => spawn.id === 'prince').post;
const NEAR = [PRINCE[0] + 2.8, L, PRINCE[2]];
const FAR = [-20, L, PRINCE[2]];
const man = (world, id) => world.fighters.find((fighter) => fighter.spawn?.id === id);
const hips = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];

/** The page's step for a stage: the stage keeps up, the level thinks, the fight AI thinks for the rest, the player is held when busy. */
function thinking(world, dt) {
  updateStage(world);
  levelThink(world, dt);
  thinkAll(world, dt, new Set([0]));
  if (levelBusy(world)) holdPlayer(world.fighters[0]);
}
const run = (world, seconds) => advance(world, seconds, thinking);

/** A Dunnottar of only the chapel's people: the boss, the prince, the two prisoners (no garrison to join a fight). */
function bare() {
  const stage = structuredClone(DUNNOTTAR);
  for (const section of stage.sections) section.spawns = section.spawns.filter((spawn) => ['vaelen', 'prince', 'miner', 'captive'].includes(spawn.id));
  return stage;
}
const standAt = (world, x, y, z, yaw) => {
  placeOnFloor(world.fighters[0], x, z, y, yaw);
  updateStage(world, true);
  run(world, 0.1);
};

/** Walk up to the cell's doors first (the cell wakes as he comes: its prince has had his look round before the scene is begun, as in play, not in the same step as the cell wakes). */
const enterCell = (world) => {
  standAt(world, -31.5, L, PRINCE[2], Math.PI);
  run(world, 0.8);
};

// ---- No banner in a stage -----------------------------------------------------------------------------------

test('level flow: no bout banner in a stage, however many enemies are out or however alone the player stands', () => {
  const world = createLevelWorld(TESTYARD, levelPreset('forger'), { seed: 3 });
  for (const fighter of world.fighters.slice(1)) if (fighter.corner === 'blue') knockOut(world, fighter, { time: world.time, effects: [] }, 'is struck down', 'killed');
  assert.equal(world.fighters.filter((fighter) => fighter.corner === 'blue' && fighter.state !== 'out').length, 0);
  assert.equal(bannerWinner(world), null, 'every enemy dead: still no winner');
  // A battle is as it was: a lone man on a side wins.
  const duel = createWorld([{ inputs: structuredClone(PRESETS.knight), corner: 'red' }, { inputs: structuredClone(PRESETS.light), corner: 'blue' }], { seed: 2 });
  knockOut(duel, duel.fighters[1], { time: 0, effects: [] }, 'is struck down', 'killed');
  assert.equal(bannerWinner(duel), 'red');
});

// ---- The ending ----------------------------------------------------------------------------------------------

test('level flow: Dunnottar names its ending (the door and the prince are in it), and checkStage knows when they are not', () => {
  assert.deepEqual(checkStage(DUNNOTTAR), []);
  const broken = structuredClone(DUNNOTTAR);
  broken.ending.door = 'nodoor';
  assert.ok(checkStage(broken).some((problem) => problem.includes('nodoor')));
});

test('level flow: the boss out opens the inner door and tells the screen; the boss on his feet leaves it shut', () => {
  const world = createLevelWorld(bare(), levelPreset('forger'), { seed: 5 });
  standAt(world, -4, L, -37, Math.PI);
  assert.equal(world.stage.mechanisms.innerdoor, 'closed');
  run(world, 0.5);
  assert.equal(endingOf(world).phase, 'locked');
  assert.equal(world.stage.mechanisms.innerdoor, 'closed');
  assert.ok(killBoss(world));
  run(world, 0.2);
  assert.equal(endingOf(world).phase, 'open');
  assert.equal(world.stage.mechanisms.innerdoor, 'open');
  const messages = drainUi(world);
  assert.ok(messages.some((message) => message.type === 'bossDown'));
  assert.ok(!messages.some((message) => message.type === 'ending'), 'not yet: the player is not at the prince');
  assert.equal(killBoss(world), false, 'he is already down');
});

test('level flow: the player near the prince begins the scene: held, the prince cowers and shuffles into the corner, the cards are asked for', () => {
  const world = createLevelWorld(bare(), levelPreset('forger'), { seed: 5 });
  standAt(world, -4, L, -37, Math.PI);
  killBoss(world);
  run(world, 0.2);
  drainUi(world);
  // Far from the prince (in the chapel, the door open): nothing yet.
  standAt(world, ...FAR, Math.PI);
  run(world, 0.5);
  assert.equal(endingOf(world).phase, 'open');
  // Near: the scene.
  enterCell(world);
  standAt(world, ...NEAR, Math.PI);
  run(world, 0.3);
  assert.equal(endingOf(world).phase, 'scene');
  assert.ok(endingBusy(world) && levelBusy(world), 'the player is held where he stands');
  assert.ok(drainUi(world).some((message) => message.type === 'ending'));
  const prince = princeOf(world);
  const player = world.fighters[0];
  const from = hips(prince);
  const apart = Math.hypot(...hips(player).map((value, index) => value - from[index]));
  const at = hips(player);
  run(world, 9);
  assert.equal(mindState(world, prince.id), 'cower');
  assert.ok(prince.crawling, 'on his knees');
  const corner = DUNNOTTAR.ending.corner;
  const now = hips(prince);
  assert.ok(Math.hypot(now[0] - corner[0], now[1] - corner[1]) < Math.hypot(from[0] - corner[0], from[1] - corner[1]) - 1, 'he has gone toward the corner');
  assert.ok(Math.hypot(now[0] - at[0], now[1] - at[1]) > apart, 'away from the player');
  // The player did not walk: he was held.
  assert.ok(Math.hypot(hips(player)[0] - at[0], hips(player)[1] - at[1]) < 0.5);
  assert.equal(world.stage.civiliansHarmed, false);
  endingDone(world);
  assert.equal(endingOf(world).phase, 'done');
  run(world, 0.2);
  assert.ok(!drainUi(world).some((message) => message.type === 'ending'), 'the scene is not begun twice');
});

test('level flow: a scripted cower is not calmed, and a man who is not there cannot be told to', () => {
  const world = createLevelWorld(bare(), levelPreset('forger'), { seed: 5 });
  enterCell(world);
  standAt(world, ...NEAR, Math.PI);
  assert.equal(cowerFor(world, 'nobody', { corner: [0, 0] }), false);
  assert.ok(cowerFor(world, 'prince', { corner: DUNNOTTAR.ending.corner, near: 5 }));
  run(world, 20);
  assert.equal(mindState(world, princeOf(world).id), 'cower', 'the calm of a quiet fight never comes to him');
});

test('level flow: restart from a rest is for a run that reached one; a scene half played goes back to the door open', () => {
  const world = createLevelWorld(bare(), levelPreset('forger'), { seed: 5 });
  assert.equal(restartFromRest(world), false, 'no rest reached: the stage is begun over by the screen');
  standAt(world, -4, L, -37, Math.PI);
  restAtPoint(world, { id: 'test', at: [4.6, L, -36], name: 'Test' });
  killBoss(world);
  run(world, 0.2);
  enterCell(world);
  standAt(world, ...NEAR, Math.PI);
  run(world, 0.3);
  assert.equal(endingOf(world).phase, 'scene');
  assert.ok(restartFromRest(world));
  assert.equal(endingOf(world).phase, 'open');
  assert.equal(world.stage.mechanisms.innerdoor, 'open', 'what he opened stays open');
  assert.equal(levelBusy(world), false);
  assert.ok(hips(world.fighters[0])[0] > 0, 'he wakes at the rest');
});

// ---- The freed and the boss -------------------------------------------------------------------------------------

test('level flow: the freed stop at the chapel gate and the boss fight is one to one', () => {
  const world = createLevelWorld(bare(), levelPreset('forger'), { seed: 9 });
  const me = world.fighters[0];
  standAt(world, 12, L, -36, Math.PI);
  // The two freed, on the wall walk behind him (as followers come along the route).
  for (const [id, behind] of [['miner', 3], ['captive', 4.5]]) {
    assert.ok(freePrisoner(world, id));
    placeOnFloor(man(world, id), 12 + behind, -36, L, Math.PI);
    man(world, id).spawn.section = 'tower';
  }
  updateStage(world, true);
  setMechanism(world, 'chapelgate', 'open');
  const walked = walk(world, me, [[0, -36], [-6, -37.5], [-9, -38]], { within: 0.6, seconds: 40, think: (w, dt) => { levelThink(w, dt); thinkAll(w, dt, new Set([0])); } });
  assert.equal(walked.reached, 3, `walked in: ${JSON.stringify(walked)}`);
  const boss = man(world, 'vaelen');
  const states = [];
  for (let second = 0; second < 8; second += 1) {
    me.move = 0;
    run(world, 1);
    states.push(['miner', 'captive'].map((id) => mindState(world, man(world, id).id)));
  }
  const region = DUNNOTTAR.followStopsAt;
  for (const id of ['miner', 'captive']) {
    const [x] = hipsAt(man(world, id));
    assert.ok(x > -2.4, `${id} stays at the gate (x ${x.toFixed(2)})`);
    assert.ok(Math.abs(hipsAt(man(world, id))[1] - region.at[1]) < region.size[1], `${id} on the gate's line ${JSON.stringify(hipsAt(man(world, id)))} ${states.at(-1)}`);
    assert.equal(man(world, id).corner, 'red', 'still a friend');
  }
  assert.ok(states.every((pair) => pair.every((state) => state === 'stayed')), `they stand: ${JSON.stringify(states)}`);
  assert.ok(boss.state === 'up' || boss.state === 'down' || boss.state === 'out');
  // Nobody of theirs may target the boss.
  for (const id of ['miner', 'captive']) assert.equal(man(world, id).mayTarget(boss), false);
});

// ---- Markers and the man the marker is over -------------------------------------------------------------------------

test('level flow: markers stand over the levers, gates and rest in reach and go when used', () => {
  const world = createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed: 4 });
  const gate = DUNNOTTAR.sections.find((section) => section.id === 'gate').gates.find((each) => each.id === 'cliffgate');
  standAt(world, gate.at[0] + 3, gate.at[1], gate.at[2], Math.PI);
  const near = markerCandidates(world, hips(world.fighters[0]));
  assert.ok(near.some((entry) => entry.kind === 'work' && entry.at === gate.at), 'the gate to open');
  setMechanism(world, 'cliffgate', 'open');
  assert.ok(!markerCandidates(world, hips(world.fighters[0])).some((entry) => entry.at === gate.at), 'gone once open');
  const rest = DUNNOTTAR.sections.find((section) => section.id === 'cliff').rest;
  standAt(world, rest.at[0] + 2, rest.at[1], rest.at[2], 0);
  assert.ok(markerCandidates(world, hips(world.fighters[0])).some((entry) => entry.kind === 'rest'));
  assert.deepEqual(markerCandidates(world, [1000, 1000]), [], 'nothing far off');
});

test('level flow: a stage\'s marker is over a man near or aware of the player, not the nearest of the garrison', () => {
  const world = createLevelWorld(TESTYARD, levelPreset('forger'), { seed: 3 });
  const me = world.fighters[0];
  const foes = world.fighters.filter((fighter) => fighter.corner === 'blue' && !fighter.dormant);
  assert.ok(foes.length);
  // Far and unaware: none.
  const [far] = foes;
  placeOnFloor(far, hips(me)[0] + 30, hips(me)[1], 0, 0);
  for (const other of foes) if (other !== far) other.dormant = true;
  assert.equal(levelOpponent(world, me), null);
  // Close: he is the man (an unaware man close by can be locked on).
  placeOnFloor(far, hips(me)[0] + 4, hips(me)[1], 0, 0);
  assert.equal(levelOpponent(world, me), far);
});
