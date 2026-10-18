// Level mode, stages (src/levelmode/stage.js): the data, the active sections, dormancy, gates and ladders.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thinkAll } from '../src/ai.js';
import { P, PRESETS } from '../src/body.js';
import { advance, createWorld, fightTier, hostile, nearestOpponent, opponentFor, placeOnFloor } from '../src/physics.js';
import { activeSections, checkStage, createStageWorld, mechanismsOf, pullLever, regionContains, setMechanism, stageFloor, stageTerrain, stageThink, updateStage } from '../src/levelmode/stage.js';
import { STAGES } from '../src/levelmode/stages.js';
import { TESTYARD } from '../src/levelmode/stages/testyard.js';
import { floorAt, rampOf, rayBlocked, slabOf } from '../src/physics/terrain.js';
import { hipsAt, walk } from './walker.js';

const hero = () => structuredClone(PRESETS.ronin);
/**
 * The test yard as the engine's tests know it: the yard (empty: its practice men are for the awareness tests, its fallen knight and
 * ladder for the player's systems) and the hall, the men of the hall only; no vault.
 */
const QUIET = (() => {
  const stage = structuredClone(TESTYARD);
  stage.sections = stage.sections.filter((section) => section.id !== 'vault');
  for (const section of stage.sections) section.portals = section.portals.filter((portal) => portal.to !== 'vault');
  stage.sections[0].spawns = [];
  stage.sections[0].ladders = [];
  return stage;
})();
const BASE = QUIET;
const yard = () => createStageWorld(QUIET, hero(), { seed: 3 });
const where = (fighter) => Array.from(fighter.x);
const asleep = (world) => world.fighters.filter((fighter) => fighter.dormant).map((fighter) => fighter.spawn.id);

test('the registry holds the test yard, and its data is sound', () => {
  assert.equal(STAGES.testyard, TESTYARD);
  assert.deepEqual(checkStage(TESTYARD), []);
  assert.deepEqual(mechanismsOf(TESTYARD).map((mechanism) => [mechanism.id, mechanism.section, mechanism.state]), [['gate1', 'yard', 'closed'], ['ladder1', 'yard', 'up'], ['gate2', 'vault', 'closed'], ['cell1', 'vault', 'closed']]);
  assert.deepEqual(checkStage(BASE), []);
  assert.deepEqual(mechanismsOf(BASE).map((mechanism) => mechanism.id), ['gate1']);
});

test('the test yard has men to practise on in the yard itself, and a place where followers stop', () => {
  assert.deepEqual(TESTYARD.sections[0].spawns.map((spawn) => [spawn.id, spawn.role]), [['sentry1', 'enemy'], ['sentry2', 'enemy'], ['roamer', 'enemy'], ['gardener', 'civilian'], ['stray', 'prisoner'], ['fallen', 'enemy']]);
  assert.ok(regionContains(TESTYARD.followStopsAt, 12.5, 7, 1.2));
  assert.equal(createStageWorld(TESTYARD, hero(), { seed: 3 }).awake, 7, 'the player and the six of the yard (five to practise on, and a fallen knight)');
});

test('checkStage names what is wrong', () => {
  const broken = structuredClone(TESTYARD);
  broken.sections[1].id = 'yard';
  broken.sections[0].portals[0].to = 'cellar';
  broken.sections[0].levers[0].target = 'drawbridge';
  broken.sections[1].spawns[0].role = 'king';
  broken.sections[1].spawns[1].preset = 'nobody';
  broken.sections[1].spawns[2].post = [1, 2];
  broken.start.section = 'moat';
  const problems = checkStage(broken).join(' | ');
  for (const fragment of ['two sections are called yard', 'portal to cellar', 'works drawbridge', 'role king', 'preset nobody', 'needs a post', 'section moat']) assert.ok(problems.includes(fragment), `${fragment} in ${problems}`);
  assert.throws(() => createStageWorld(broken, hero()), /stage testyard/);
});

test('regions: rectangles (turned), polygons, heights, and unions', () => {
  const rect = { at: [0, 0], size: [4, 2], yaw: Math.PI / 2 };
  // Turned a quarter: 2 along x, 4 along z.
  assert.equal(regionContains(rect, 0.9, 1.9), true);
  assert.equal(regionContains(rect, 1.9, 0.9), false);
  const triangle = { polygon: [[0, 0], [10, 0], [0, 10]] };
  assert.equal(regionContains(triangle, 2, 2), true);
  assert.equal(regionContains(triangle, 8, 8), false);
  const vault = { at: [0, 0], size: [10, 10], y: [-4, 1] };
  assert.equal(regionContains(vault, 1, 1, 0.5), true);
  assert.equal(regionContains(vault, 1, 1, 3), false, 'a courtyard above the vault is not the vault');
  assert.equal(regionContains(vault, 1, 1), true, 'no height given: any');
  assert.equal(regionContains([rect, triangle], 8, 1), true, 'a union');
  assert.equal(regionContains([rect, triangle], 8, 8), false);
  assert.equal(regionContains(undefined, 0, 0), false);
});

test('activeSections: the section he is in, and those whose portal area he stands in', () => {
  assert.deepEqual(activeSections(TESTYARD, [-18, 0, -3]), ['yard']);
  assert.deepEqual(activeSections(TESTYARD, [-18, -3]), ['yard'], 'a floor point has no height');
  assert.deepEqual(activeSections(TESTYARD, [10, 0, 0]), ['yard']);
  assert.deepEqual(activeSections(TESTYARD, [22, 0, 0]), ['yard'], 'the corridor before its portal');
  assert.deepEqual(activeSections(TESTYARD, [26, 0, 0]), ['yard', 'hall'], 'the corridor, in the portal');
  assert.deepEqual(activeSections(TESTYARD, [31, 0, 0]), ['yard', 'hall'], 'the hall, at its mouth');
  assert.deepEqual(activeSections(TESTYARD, [40, 0, 0]), ['hall']);
  assert.deepEqual(activeSections(TESTYARD, [90, 0, 0]), [], 'outside any section');
  assert.deepEqual(activeSections(TESTYARD, [0, 0, 40]), []);
});

test('createStageWorld: the player is fighter 0 (red, walking), the spawns follow in order with their roles as corners', () => {
  const world = yard();
  assert.equal(world.fighters.length, 6);
  assert.deepEqual(world.fighters.map((fighter) => fighter.id), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(world.fighters.map((fighter) => fighter.corner), ['red', 'blue', 'blue', 'blue', 'grey', 'grey']);
  assert.deepEqual(world.fighters.slice(1).map((fighter) => fighter.spawn.id), ['guard1', 'guard2', 'guard3', 'clerk', 'captive']);
  assert.deepEqual(world.fighters.slice(1).map((fighter) => fighter.spawn.role), ['enemy', 'enemy', 'enemy', 'civilian', 'prisoner']);
  assert.equal(world.fighters[0].spawn, undefined);
  assert.equal(world.fighters[0].walking, true);
  assert.equal(world.arena.open, true);
  assert.ok(world.arena.terrain);
  assert.deepEqual(world.stage.active, ['yard']);
  assert.deepEqual(world.stage.mechanisms, { gate1: 'closed' });
  assert.deepEqual(world.standards, {}, 'no standards raised');
  // Everyone on his post, on the floor.
  const [x, z] = [-18, -3];
  assert.ok(Math.hypot(world.fighters[0].root[0] - x, world.fighters[0].root[1] - z) < 1e-9);
  assert.ok(Math.abs(world.fighters[1].root[0] - 44) < 1e-9 && Math.abs(world.fighters[1].root[1] + 3) < 1e-9);
  assert.equal(world.fighters[1].lift, 0);
});

test('the men of sections not active are dormant, and the count awake is kept for the tiers of detail', () => {
  const world = yard();
  assert.deepEqual(asleep(world), ['guard1', 'guard2', 'guard3', 'clerk', 'captive']);
  assert.equal(world.awake, 1);
  assert.equal(fightTier(world), 1);
  assert.equal(world.fighters[1].dormant, true);
  assert.equal(world.fighters[0].dormant, undefined);
});

test('dormant men do not move, think, or take part: the yard goes on without the hall', () => {
  const world = yard();
  const before = world.fighters.slice(1).map(where);
  const clocks = world.fighters.slice(1).map((fighter) => [fighter.stamina, fighter.cooldown, fighter.root.slice()]);
  advance(world, 6, (current, dt) => stageThink(current, dt, thinkAll));
  world.fighters.slice(1).forEach((fighter, index) => {
    assert.deepEqual(where(fighter), before[index], `${fighter.spawn.id} has not moved`);
    assert.deepEqual([fighter.stamina, fighter.cooldown, fighter.root], clocks[index], `${fighter.spawn.id} has not aged`);
  });
  assert.equal(world.fighters[0].state, 'up');
  // Nobody in the yard is anyone's enemy to find: the dormant do not count.
  assert.equal(nearestOpponent(world, world.fighters[0]), null);
  assert.equal(opponentFor(world, world.fighters[0]), null);
  assert.equal(world.fighters[0].punch, null);
});

test('a dormant man is kept as he is: struck and bleeding, he is the same when his section wakes', () => {
  const world = yard();
  const guard = world.fighters[1];
  guard.bloodLost = 0.3;
  guard.damage.head = 0.4;
  const head = guard.x.slice(P.head * 3, P.head * 3 + 3);
  advance(world, 3, (current, dt) => stageThink(current, dt, thinkAll));
  assert.equal(guard.bloodLost, 0.3);
  assert.deepEqual(Array.from(guard.x.slice(P.head * 3, P.head * 3 + 3)), Array.from(head));
  // The player to the portal, the gate open: the hall wakes.
  setMechanism(world, 'gate1', 'open');
  const result = walk(world, world.fighters[0], [[-5, -3], [21, 0], [26, 0]], { seconds: 150, within: 0.5 });
  assert.equal(result.reached, 3);
  assert.deepEqual(world.stage.active, ['yard', 'hall']);
  assert.deepEqual(asleep(world), []);
  assert.equal(world.awake, 6);
  assert.equal(guard.dormant, undefined);
  assert.equal(guard.bloodLost >= 0.3, true);
  assert.equal(guard.damage.head, 0.4);
});

test('the men wake when he enters the portal, fight on, and sleep again as he goes back (where they were left)', () => {
  const world = yard();
  setMechanism(world, 'gate1', 'open');
  const guards = world.fighters.slice(1, 4);
  const start = guards.map(hipsAt);
  const me = world.fighters[0];
  walk(world, me, [[-5, -3], [21, 0], [27, 0]], { seconds: 150, within: 0.5 });
  assert.equal(guards.every((guard) => guard.dormant === undefined), true, 'awake');
  // Awake, they come for him (the fight AI): after a few seconds they have moved.
  advance(world, 5, (current, dt) => stageThink(current, dt, thinkAll));
  const moved = guards.map((guard, index) => Math.hypot(...hipsAt(guard).map((value, axis) => value - start[index][axis])));
  assert.ok(moved.some((distance) => distance > 1), `moved: ${moved.map((distance) => distance.toFixed(2))}`);
  // Out of the hall's reach again: the hall sleeps at once, those who stayed in it where they stood; those who came after him are of the yard now, and awake.
  walk(world, me, [[18, 0], [10, 0]], { seconds: 100, within: 0.5 });
  assert.deepEqual(world.stage.active, ['yard']);
  const hallMen = world.fighters.filter((fighter) => fighter.spawn?.section === 'hall');
  assert.ok(hallMen.length >= 3, 'the clerk, the captive, at least one guard stayed');
  assert.ok(hallMen.every((fighter) => fighter.dormant === true));
  assert.ok(world.fighters.filter((fighter) => fighter.spawn?.section === 'yard').every((fighter) => fighter.dormant === undefined));
  const stopped = hallMen.map(where);
  advance(world, 2, (current, dt) => stageThink(current, dt, thinkAll));
  hallMen.forEach((fighter, index) => assert.deepEqual(where(fighter), stopped[index]));
});

test('the terrain is rebuilt only when the active sections or a mechanism change', () => {
  const world = yard();
  const first = world.arena.terrain;
  advance(world, 1, (current) => updateStage(current));
  assert.equal(world.arena.terrain, first, 'standing still: the same terrain');
  assert.equal(updateStage(world), false);
  world.fighters[0].walking = true;
  walk(world, world.fighters[0], [[-10, -3]], { seconds: 100 });
  assert.equal(world.arena.terrain, first, 'walking about in the yard: the same terrain');
  setMechanism(world, 'gate1', 'open');
  assert.notEqual(world.arena.terrain, first, 'a gate opened: the terrain follows');
  assert.equal(setMechanism(world, 'gate1', 'open'), true);
});

test('the active terrain is the union of the active sections: the hall has no floor while it sleeps', () => {
  const world = yard();
  assert.equal(floorAt(world.arena.terrain, 40, 0, 0.3), -Infinity);
  assert.equal(stageFloor(world, 40, 0, 0), -Infinity);
  assert.equal(floorAt(world.arena.terrain, 0, 0, 0.3), 0);
  const both = stageTerrain(BASE, ['yard', 'hall'], world.stage.mechanisms);
  assert.equal(floorAt(both, 40, 0, 0.3), 0);
  assert.ok(both.solids.length > world.arena.terrain.solids.length);
  assert.equal(world.arena.terrain.sea, -8);
});

test('a gate stops blocking when it opens: a walker is held, and then passes; the lever opens it', () => {
  const world = yard();
  const me = world.fighters[0];
  const held = walk(world, me, [[-5, -3], [20, 0], [28, 0]], { seconds: 150 });
  assert.equal(held.reached, 2, 'held at the gate');
  assert.ok(hipsAt(me)[0] > 21 && hipsAt(me)[0] < 21.9, `at the gate, x ${hipsAt(me)[0].toFixed(2)}`);
  assert.equal(rayBlocked(world.arena.terrain, [18, 0], [26, 0], 1.5), true, 'it blocks sight too');
  const closed = world.arena.terrain.solids.length;
  assert.equal(pullLever(world, 'lever1'), true);
  assert.equal(world.stage.mechanisms.gate1, 'open');
  assert.equal(world.arena.terrain.solids.length, closed - 1, 'its solid is gone');
  assert.equal(rayBlocked(world.arena.terrain, [18, 0], [26, 0], 1.5), false);
  assert.ok(world.events.some((event) => event.kind === 'mechanism' && event.mechanism === 'gate1' && event.state === 'open'));
  const through = walk(world, me, [[28, 0], [34, 0]], { seconds: 100 });
  assert.equal(through.reached, 2);
  // Back to shut: the same solid again.
  assert.equal(setMechanism(world, 'gate1', 'closed'), true);
  assert.equal(setMechanism(world, 'gate1', 'ajar'), false);
  assert.equal(setMechanism(world, 'drawbridge', 'open'), false);
  assert.equal(pullLever(world, 'nothing'), false);
});

test('a ladder kicked down becomes a ramp: the solids of each state are in force as it stands', () => {
  const stage = {
    id: 'ladders', title: 'Ladders', sea: -5,
    start: { section: 'wall', at: [0, 0, 0], facing: 0 },
    sections: [{
      id: 'wall', name: 'The wall', bounds: { at: [0, 0], size: [40, 20] },
      terrain: [slabOf([0, 0], [40, 20], 0), slabOf([8, 0], [6, 10], 2, { bottom: 0 })],
      levers: [{ id: 'kick', at: [5, 0, 0], target: 'ladder1', state: 'down' }],
      ladders: [{ id: 'ladder1', at: [4.5, 0, 0], state: 'up', states: { up: [], down: [rampOf([3, 0], [4, 2], 0, 2)] } }],
      spawns: [], items: [], portals: [],
    }],
  };
  assert.deepEqual(checkStage(stage), []);
  const world = createStageWorld(stage, hero(), { seed: 1 });
  const me = world.fighters[0];
  // Up, a 2 m face: a wall to him.
  const before = walk(world, me, [[7, 0]], { seconds: 15, within: 0.5 });
  assert.equal(before.reached, 0);
  assert.ok(hipsAt(me)[0] < 5.2, `at the foot of it: ${hipsAt(me)[0].toFixed(2)}`);
  assert.equal(floorAt(world.arena.terrain, 3, 0, 5), 0);
  walk(world, me, [[-2, 0]], { seconds: 60, within: 0.5 });
  pullLever(world, 'kick');
  assert.equal(world.stage.mechanisms.ladder1, 'down');
  assert.ok(Math.abs(floorAt(world.arena.terrain, 3, 0, 5) - 1) < 1e-9, 'a ramp now');
  const climb = walk(world, me, [[3, 0], [7, 0]], { seconds: 120, within: 0.5 });
  assert.equal(climb.reached, 2, 'climbed it');
  assert.ok(me.x[P.pelvis * 3 + 1] > 2.7, `on top: hips at ${me.x[P.pelvis * 3 + 1].toFixed(2)}`);
});

test('civilians and prisoners are neutral (corner grey): nobody targets them, and the fight AI does not think for them', () => {
  const world = yard();
  const [player, guard, , , clerk, captive] = world.fighters;
  assert.equal(hostile(player, guard), true);
  assert.equal(hostile(guard, player), true);
  assert.equal(hostile(player, clerk), false);
  assert.equal(hostile(clerk, guard), false);
  assert.equal(hostile(clerk, captive), false);
  // Awake and on the same floor, beside the enemy: he does not choose them.
  for (const fighter of world.fighters) fighter.dormant = undefined;
  assert.notEqual(nearestOpponent(world, guard)?.corner, 'grey');
  assert.equal(nearestOpponent(world, guard), player);
  assert.equal(nearestOpponent(world, clerk), null, 'and they choose nobody');
  const before = [where(clerk), clerk.cooldown];
  advance(world, 2, (current, dt) => thinkAll(current, dt));
  assert.equal(clerk.move, 0);
  assert.equal(clerk.focus, undefined);
  assert.equal(clerk.punch, null);
  assert.deepEqual(before[0].length, where(clerk).length);
});

test('a man walked into another section belongs to it from then on (so his own section sleeping does not freeze him mid-chase)', () => {
  const world = yard();
  setMechanism(world, 'gate1', 'open');
  const me = world.fighters[0];
  walk(world, me, [[-5, -3], [21, 0], [27, 0]], { seconds: 150, within: 0.5 });
  const guard = world.fighters[1];
  assert.equal(guard.spawn.section, 'hall');
  // Carry him into the yard (as a chase would): a few steps and he is of the yard.
  const dx = 10 - guard.x[P.pelvis * 3];
  for (let index = 0; index < guard.x.length; index += 3) {
    guard.x[index] += dx;
    guard.prev[index] += dx;
  }
  guard.root[0] += dx;
  advance(world, 0.5, (current) => updateStage(current));
  assert.equal(guard.spawn.section, 'yard');
  // The player goes on into the hall's far end, past the yard's reach: the guard (of the yard) sleeps with it.
  assert.equal(guard.spawn.home, 'hall', 'where he began is kept');
});

test('weapons lying in a section that goes quiet stay where they lie, and fall on when it wakes', () => {
  const world = yard();
  const me = world.fighters[0];
  // A sword in the air over the yard.
  const piece = { id: 0, kind: 'weapon', weapon: 'katana', owner: 1, x: [0, 3, 0], v: [0, 0, 0], q: [0, 0, 0, 1], spin: [0, 0, 0], radius: 0.02, axis: [0, 1, 0], half: 0.5, resting: false };
  world.debris.push(piece);
  // The player gone to the hall in one step: the yard is quiet.
  placeOnFloor(me, 40, 0, 0, 0);
  assert.equal(updateStage(world), true);
  assert.deepEqual(world.stage.active, ['hall']);
  assert.equal(piece.resting, true);
  advance(world, 2, (current) => updateStage(current));
  assert.deepEqual(piece.x, [0, 3, 0], 'still in the air, where it was');
  // And back: it falls on to the yard's floor.
  placeOnFloor(me, 0, 4, 0, 0);
  assert.equal(updateStage(world), true);
  assert.equal(piece.resting, false);
  advance(world, 2, (current) => updateStage(current));
  assert.ok(piece.x[1] < 0.5, `on the floor: ${piece.x[1]}`);
});

test('a world without a stage is untouched: createWorld with no terrain steps as ever', () => {
  const world = createWorld([{ inputs: structuredClone(PRESETS.heavy), corner: 'red' }, { inputs: structuredClone(PRESETS.light), corner: 'blue' }], { seed: 5 });
  advance(world, 2, (current, dt) => thinkAll(current, dt));
  assert.equal(world.arena.terrain, undefined);
  assert.equal(world.awake, undefined);
  assert.equal(world.fighters[0].dormant, undefined);
  assert.equal(fightTier(world), 1);
  assert.ok(world.fighters.every((fighter) => fighter.x[P.pelvis * 3 + 1] > 0.5));
});

test('the walls of the test yard: a line of sight along the corridor is held by the gate, the maze, and the ledges', () => {
  const world = yard();
  const terrain = world.arena.terrain;
  assert.equal(rayBlocked(terrain, [-5, 0], [15, 0], 1.7), false, 'across the open yard');
  assert.equal(rayBlocked(terrain, [3, -7.5], [12, -7.5], 1.7), true, 'into the maze, through its wall');
  assert.equal(rayBlocked(terrain, [-15, -9], [3, -9], 1.7), true, 'through the ledges');
  assert.equal(rayBlocked(terrain, [-15, -9], [3, -9], 7.5), false, 'over them');
  assert.equal(rayBlocked(terrain, [21, 1.9], [29, 1.9], 1.7), true, 'through the corridor wall');
  assert.equal(rayBlocked(terrain, [20, 0], [30, 0], 1.7), true, 'the gate');
});
