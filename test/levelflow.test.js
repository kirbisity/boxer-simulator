// Level mode, the flow around the stage (Phase C1): the banner that never comes, the ending's start (boss out, the doors behind the altar,
// the guide, the back room found empty and the horde let go: the rest of the plot twist is test/dunnottartwist.test.js), the freed who stay
// out of the boss fight, the markers, the man the marker is over, restart from a rest.
// (The prince's scene that was here, his cowering into the cell's corner, is gone with him: the back room is a privy with nobody in it.)

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
import { bannerWinner, createLevelWorld, drainUi, endingBusy, endingHold, endingOf, endingRelease, endingWatched, guideOf, killBoss, levelBusy, levelOpponent, levelThink, restartFromRest, restAtPoint } from '../src/levelmode/level.js';
import { ENDING_WAIT, TWIST } from '../src/levelmode/ending.js';
import { freePrisoner, mindState } from '../src/levelmode/awareness.js';
import { markerCandidates } from '../src/levelmode/markers.js';
import { holdPlayer } from '../src/levelmode/items.js';
import { hipsAt, walk } from './walker.js';

const L = DUNNOTTAR.sections.find((section) => section.id === 'chapel').spawns[0].post[1];
// The back room directly behind the chancel doors: inside it (a stride past the doors), and far from it (in the nave).
const HOLE = DUNNOTTAR.ending.hole.at;
const INSIDE = [-36.4, L, HOLE[2]];
const FAR = [-20, L, HOLE[2]];
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

/** A Dunnottar of only the chapel's people: the boss, the two prisoners, Noname and the ending's held crowds (no garrison to join a fight). */
function bare() {
  const stage = structuredClone(DUNNOTTAR);
  for (const section of stage.sections) section.spawns = section.spawns.filter((spawn) => spawn.hold || ['vaelen', 'miner', 'captive', 'noname'].includes(spawn.id));
  return stage;
}
const standAt = (world, x, y, z, yaw) => {
  placeOnFloor(world.fighters[0], x, z, y, yaw);
  updateStage(world, true);
  run(world, 0.1);
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

test('level flow: Dunnottar names its ending (the door, Noname, the held crowds are in it), and checkStage knows when they are not', () => {
  assert.deepEqual(checkStage(DUNNOTTAR), []);
  const broken = structuredClone(DUNNOTTAR);
  broken.ending.door = 'nodoor';
  broken.ending.noname = 'nobody';
  broken.ending.horde = 'nocrowd';
  const problems = checkStage(broken);
  for (const word of ['nodoor', 'nobody', 'nocrowd']) assert.ok(problems.some((problem) => problem.includes(word)), word);
});

/** The boss struck down, and the world's own wait for the cutscene (no screen: the tests') run out: the door is open. */
const fell = (world) => {
  assert.ok(killBoss(world));
  run(world, ENDING_WAIT.headless + 0.3);
};

test('level flow: the boss out begins the cutscene and then opens the inner door; the boss on his feet leaves it shut', () => {
  const world = createLevelWorld(bare(), levelPreset('forger'), { seed: 5 });
  standAt(world, -4, L, -37, Math.PI);
  assert.equal(world.stage.mechanisms.innerdoor, 'closed');
  run(world, 0.5);
  assert.equal(endingOf(world).phase, 'locked');
  assert.equal(world.stage.mechanisms.innerdoor, 'closed');
  assert.ok(killBoss(world));
  run(world, 0.2);
  // The cutscene is the screen's to play: the door waits for it.
  assert.equal(endingOf(world).phase, 'felled');
  assert.equal(world.stage.mechanisms.innerdoor, 'closed');
  assert.ok(drainUi(world).some((message) => message.type === 'bossDown'), 'the screen is told to begin the cutscene');
  // A world with no screen opens it itself.
  run(world, ENDING_WAIT.headless);
  assert.equal(endingOf(world).phase, 'open');
  assert.equal(world.stage.mechanisms.innerdoor, 'open');
  const messages = drainUi(world);
  assert.ok(messages.some((message) => message.type === 'doorsOpen'));
  assert.ok(messages.some((message) => message.type === 'toast'));
  assert.ok(!messages.some((message) => message.type === 'horde'), 'not yet: the player is not in the back room');
  assert.equal(killBoss(world), false, 'he is already down');
});

test('level flow: a screen that plays the cutscene holds the player and opens the door when it is through, not before', () => {
  const world = createLevelWorld(bare(), levelPreset('forger'), { seed: 5 });
  standAt(world, -4, L, -37, Math.PI);
  assert.ok(killBoss(world));
  run(world, 0.2);
  endingWatched(world);
  endingHold(world, true);
  assert.ok(endingBusy(world) && levelBusy(world), 'held while the cutscene plays');
  // However long the world runs (the slow motion), the door waits for the screen.
  run(world, ENDING_WAIT.headless * 3);
  assert.equal(endingOf(world).phase, 'felled');
  assert.equal(world.stage.mechanisms.innerdoor, 'closed');
  assert.equal(guideOf(world), null, 'no guide before the door is open');
  assert.ok(endingRelease(world));
  assert.equal(endingOf(world).phase, 'open');
  assert.equal(world.stage.mechanisms.innerdoor, 'open');
  assert.equal(levelBusy(world), false, 'the player is free again');
  assert.equal(endingRelease(world), false, 'the door opens once');
  // The guide runs from the door to the privy's hole, read from the stage's own data, the glow over the door.
  const guide = guideOf(world);
  assert.ok(guide);
  // (The door is where the stage's own `innerdoor` gate stands, wherever the chapel is put.)
  const gate = DUNNOTTAR.sections.flatMap((section) => section.gates).find((each) => each.id === 'innerdoor');
  const leaf = gate.states.closed.find((solid) => solid.at).at;
  assert.ok(Math.abs(guide.from[0] - leaf[0]) < 0.5 && Math.abs(guide.from[2] - leaf[1]) < 0.5, `the door is ${guide.from}`);
  assert.deepEqual(guide.beacon, guide.from);
  assert.deepEqual(guide.to, HOLE);
});

test('level flow: walking into the back room shows the words and lets the horde go into the chapel; the guide goes over the hole', () => {
  const world = createLevelWorld(bare(), levelPreset('forger'), { seed: 5 });
  standAt(world, -4, L, -37, Math.PI);
  fell(world);
  drainUi(world);
  const horde = world.fighters.filter((fighter) => fighter.spawn?.id.startsWith('horde'));
  assert.equal(horde.length, 36);
  assert.ok(horde.every((fighter) => fighter.dormant && fighter.spawn.held === 'horde'), 'held out of the world while the chapel is awake');
  // Far from the room (in the chapel, the door open): nothing yet.
  standAt(world, ...FAR, Math.PI);
  run(world, 0.5);
  assert.equal(endingOf(world).phase, 'open');
  // In it: the words, and the crowd.
  standAt(world, ...INSIDE, Math.PI);
  run(world, 0.3);
  assert.equal(endingOf(world).phase, 'horde');
  assert.equal(levelBusy(world), false, 'he is free to run for it');
  const messages = drainUi(world);
  assert.ok(messages.some((message) => message.type === 'line' && message.text === TWIST.words.empty), 'Prince Caby is not here');
  assert.ok(messages.some((message) => message.type === 'horde'));
  assert.deepEqual(guideOf(world).beacon, HOLE, 'the glow over the hole now');
  // A row at a time: none in the first moment, all of them within a few seconds, every one sent at him.
  assert.ok(horde.every((fighter) => fighter.dormant), 'not at once');
  const counts = [];
  for (let second = 0; second < 6; second += 1) {
    run(world, 1);
    counts.push(horde.filter((fighter) => !fighter.dormant).length);
  }
  assert.ok(counts[0] > 0 && counts[0] < 36 && counts.at(-1) === 36, `released in bursts: ${counts}`);
  assert.ok(counts.every((count, at) => at === 0 || count >= counts[at - 1]));
  assert.ok(horde.every((fighter) => ['charge', 'aggro'].includes(mindState(world, fighter.id))), 'every one hunts him');
  assert.ok(horde.every((fighter) => fighter.spawn.section === 'chapel' || fighter.spawn.section === 'cell'));
  run(world, 0.3);
  assert.equal(endingOf(world).phase, 'horde', 'the room is not begun twice');
});

test('level flow: restart from a rest is for a run that reached one; a horde half played goes back to the door open and the crowd held', () => {
  const world = createLevelWorld(bare(), levelPreset('forger'), { seed: 5 });
  assert.equal(restartFromRest(world), false, 'no rest reached: the stage is begun over by the screen');
  standAt(world, -4, L, -37, Math.PI);
  restAtPoint(world, { id: 'test', at: [4.6, L, -36], name: 'Test' });
  fell(world);
  run(world, 0.2);
  standAt(world, ...INSIDE, Math.PI);
  run(world, 3);
  assert.equal(endingOf(world).phase, 'horde');
  assert.ok(restartFromRest(world));
  assert.equal(endingOf(world).phase, 'open');
  assert.equal(world.stage.mechanisms.innerdoor, 'open', 'what he opened stays open');
  assert.equal(levelBusy(world), false);
  assert.ok(hips(world.fighters[0])[0] > 0, 'he wakes at the rest');
  const horde = world.fighters.filter((fighter) => fighter.spawn?.id.startsWith('horde'));
  assert.ok(horde.every((fighter) => fighter.spawn.held === 'horde' && fighter.dormant), 'the crowd is held again');
  assert.equal(man(world, 'vaelen').state, 'out', 'the boss stays dead');
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
