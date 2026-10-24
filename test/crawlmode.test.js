// The player's crawl as a mode (control.js toggleCrawl, crawlReady; physics.js startCrawl keep, the blow from his knees;
// finisher.js; ai.js; levelmode awareness and interactions), and the horse under a locked-on rider (control.js rideStick).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thinkAll } from '../src/ai.js';
import { P, PRESETS, normaliseInputs } from '../src/body.js';
import { CONTROL, crawlReady, directFighter, newOrders, toggleCrawl } from '../src/control.js';
import { helplessOnFloor } from '../src/finisher.js';
import { advance, crawlingAway, createWorld, inFight, placeFighter, placeOnFloor, startCrawl, throwPunch, WORLD } from '../src/physics.js';
import { slabOf, stairsOf } from '../src/physics/terrain.js';
import { AWARE, mindState } from '../src/levelmode/awareness.js';
import { interactions } from '../src/levelmode/interact.js';
import { createStageWorld, stageThink } from '../src/levelmode/stage.js';
import { TESTYARD } from '../src/levelmode/stages/testyard.js';
import { createLevelWorld } from '../src/levelmode/level.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { turnRate, STICK_GAITS } from '../tools/horse-turn.js';

const duel = (red = 'light', blue = 'yari', seed = 3) => {
  const world = createWorld([{ inputs: normaliseInputs(structuredClone(PRESETS[red])), corner: 'red' }, { inputs: normaliseInputs(structuredClone(PRESETS[blue])), corner: 'blue' }], { seed });
  placeFighter(world.fighters[1], 6, 0);
  world.fighters[0].player = true;
  advance(world, 0.5);
  return world;
};

/** Seconds from asking to stand (the Crawl button) until he is on his feet. */
function standUpSeconds(preset) {
  const world = duel(preset);
  const me = world.fighters[0];
  const orders = newOrders();
  assert.equal(toggleCrawl(world, me, orders), true);
  advance(world, 1);
  assert.equal(toggleCrawl(world, me, orders), true, `${preset} gets up`);
  assert.equal(me.state, 'rising', 'the staged rise');
  let seconds = 0;
  while (me.state !== 'up' && seconds < 15) {
    advance(world, 1 / 60);
    seconds += 1 / 60;
  }
  assert.equal(me.state, 'up');
  assert.equal(me.crawling, false);
  return seconds;
}

test('Crawl toggles him down onto his knees and up again; he keeps his weapon, stays in the fight, is no one\'s helpless prey', () => {
  const world = duel('samurai');
  const me = world.fighters[0];
  const orders = newOrders();
  assert.ok(me.weapon?.held);
  assert.equal(crawlReady(world, me, orders), true);
  assert.equal(toggleCrawl(world, me, orders), true);
  assert.ok(me.crawling && me.crawlChosen);
  assert.ok(me.weapon?.held, 'his sword still in his hand');
  assert.equal(inFight(me), true);
  assert.equal(crawlingAway(me), false);
  assert.equal(helplessOnFloor(me), false, 'not a man to finish');
  assert.equal(me.knockdowns ?? 0, 0, 'no knockdown counted');
  assert.equal(world.events.filter((event) => event.kind === 'knockdown' || event.kind === 'fell').length, 0);
  // The man crawling away of the old rules is still helpless, and left alone.
  const other = world.fighters[1];
  startCrawl(world, other, 'crawls away');
  assert.equal(crawlingAway(other), true);
  assert.equal(helplessOnFloor(other), true);
  assert.equal(toggleCrawl(world, me, orders), true);
  for (let index = 0; index < 600 && me.state !== 'up'; index += 1) advance(world, 1 / 60);
  assert.equal(me.state, 'up');
  assert.equal(me.crawling, false);
  assert.ok(me.x.every(Number.isFinite));
});

test('not while locked on: Crawl is refused (and greyed); locking on while crawling stands him up', () => {
  const world = duel();
  const me = world.fighters[0];
  const orders = newOrders();
  orders.lock = 1;
  assert.equal(crawlReady(world, me, orders), false);
  assert.equal(toggleCrawl(world, me, orders), false);
  assert.ok(!me.crawling);
  orders.lock = null;
  toggleCrawl(world, me, orders);
  assert.equal(crawlReady(world, me, orders), true, 'lit while he crawls: a press stands him');
  orders.lock = 1;
  directFighter(world, me, orders, 1 / 60);
  assert.equal(me.crawling, false);
  assert.equal(me.state, 'rising', 'he gets up to fight');
});

test('getting up off his knees takes the longer the weaker he is for his weight', () => {
  const light = standUpSeconds('light');
  const sumo = standUpSeconds('sumo');
  const plate = standUpSeconds('maximilian');
  assert.ok(light < sumo && light < plate, `Leo ${light.toFixed(2)} s, the sumo ${sumo.toFixed(2)} s, Maximilian ${plate.toFixed(2)} s`);
});

test('the crawl ends when he is put down, and he does not crawl or jump on horseback', () => {
  const world = duel();
  const me = world.fighters[0];
  toggleCrawl(world, me, newOrders());
  me.state = 'down';
  assert.equal(crawlReady(world, me, newOrders()), false);
  const mounted = createWorld([{ inputs: { ...structuredClone(PRESETS.knight), mounted: true }, corner: 'red' }, { inputs: structuredClone(PRESETS.yari), corner: 'blue' }], { seed: 1, arena: { halfX: 30, halfZ: 20 } });
  assert.equal(toggleCrawl(mounted, mounted.fighters[0], newOrders()), false);
});

test('a blow from his knees: only of the hand, low, and weak (WORLD.crawl.strike of the mass behind it)', () => {
  const world = duel('samurai', 'yari');
  const me = world.fighters[0];
  placeFighter(world.fighters[1], 1.2, 0);
  toggleCrawl(world, me, newOrders());
  advance(world, 0.5);
  const kick = throwPunch(world, me, 'roundhouse', 'body');
  assert.equal(kick, false, 'no kick from his knees');
  const cut = throwPunch(world, me, 'jab', 'head') || throwPunch(world, me, 'kesagiri', 'head') || throwPunch(world, me, 'shomen', 'head');
  assert.equal(cut, true, 'a blow of the hand');
  assert.equal(me.punch.weak, WORLD.crawl.strike);
  assert.equal(me.punch.zone, 'legs', 'aimed low');
  // A man crawling away of the old rules strikes nothing.
  const other = duel('samurai', 'yari');
  startCrawl(other, other.fighters[0], 'crawls away');
  other.fighters[0].crawlChosen = false;
  assert.equal(throwPunch(other, other.fighters[0], 'jab', 'head'), false);
});

test('the AI still fights a man crawling by choice (not one crawling away)', async () => {
  const world = duel('light', 'yari');
  const me = world.fighters[0];
  const foe = world.fighters[1];
  toggleCrawl(world, me, newOrders());
  for (let index = 0; index < 120; index += 1) advance(world, 1 / 60, (current, dt) => thinkAll(current, dt, new Set([0])));
  assert.equal(foe.focus, me.id, 'he is still the man to fight');
});

// ---- Level mode ----------------------------------------------------------------------------------------

const field = (spawns, extra = []) => ({
  id: 'field', title: 'Field', sea: -8, start: { section: 'a', at: [0, 0, 0], facing: 0 },
  sections: [{ id: 'a', name: 'A', bounds: [{ at: [0, 0], size: [200, 200] }], terrain: [slabOf([0, 0], [200, 200], 0, { id: 'floor' }), ...extra], portals: [], spawns, items: [], levers: [], gates: [], ladders: [] }],
});
const guard = (id, x, z, facing) => ({ id, preset: 'knight', role: 'enemy', tier: 1, post: [x, 0, z], facing });
const stageRun = (world, seconds) => advance(world, seconds, (current, dt) => stageThink(current, dt, (inner, step) => thinkAll(inner, step, new Set([0]))));

test('in a stage, a guard not yet aware of him sees a crawling player only within AWARE.crawlSight of his usual range', () => {
  const distance = AWARE.radius * 0.7;
  const standing = createStageWorld(field([guard('g', distance, 0, Math.PI)]), structuredClone(PRESETS.light), { seed: 7 });
  stageRun(standing, 2);
  const guardOf = (world) => world.fighters.find((fighter) => fighter.spawn?.id === 'g');
  assert.equal(mindState(standing, guardOf(standing).id), 'aggro', 'standing, he is seen');
  const crawling = createStageWorld(field([guard('g', distance, 0, Math.PI)]), structuredClone(PRESETS.light), { seed: 7 });
  crawling.fighters[0].player = true;
  toggleCrawl(crawling, crawling.fighters[0], newOrders());
  stageRun(crawling, 2);
  assert.notEqual(mindState(crawling, guardOf(crawling).id), 'aggro', 'crawling, at 0.7 of the range, he is not');
  assert.ok(AWARE.crawlSight < 0.7);
});

test('on his knees at a stair he gets up to climb it; on the flat he crawls on', () => {
  const stairs = stairsOf([4, 0], [3, 2], 10, 0, 0.2);
  const world = createStageWorld(field([], [stairs]), structuredClone(PRESETS.light), { seed: 7 });
  const me = world.fighters[0];
  me.player = true;
  placeOnFloor(me, 0, 0, 0, 0);
  const orders = newOrders();
  toggleCrawl(world, me, orders);
  let stood = false;
  for (let index = 0; index < 60 * 12 && !stood; index += 1) {
    orders.stick = { dir: [1, 0], amount: 0.8 };
    directFighter(world, me, orders, 1 / 60);
    stageRun(world, 1 / 60);
    if (!me.crawling) stood = true;
    if (index === 60) assert.ok(me.crawling, 'still crawling on the flat');
  }
  assert.ok(stood, 'up at the stair');
  assert.ok(me.x[P.pelvis * 3] < 3.2, 'before he is on it');
});

test('on his knees only what lies on the floor is offered: not a lever', () => {
  const world = createLevelWorld(TESTYARD, levelPreset('forger'), { seed: 3 });
  const me = world.fighters[0];
  me.player = true;
  placeOnFloor(me, 18.5, -1.2, 0, Math.PI / 2);
  advance(world, 0.3);
  const standing = interactions(world).map((entry) => entry.kind);
  assert.ok(standing.includes('lever'), `standing by the lever: ${standing}`);
  toggleCrawl(world, me, newOrders());
  assert.ok(!interactions(world).some((entry) => entry.kind === 'lever'), 'on his knees, no lever');
});

// ---- The horse under a locked-on rider -------------------------------------------------------------------

test('on horseback the stick turns the horse as fast locked on as not: at its own rate, round in the same time', () => {
  for (const gait of Object.keys(STICK_GAITS)) {
    const free = turnRate(false, gait, { seconds: 3 });
    const locked = turnRate(true, gait, { seconds: 3 });
    assert.ok(Math.abs(free.peak - locked.peak) < 3, `${gait}: ${free.peak.toFixed(1)} and ${locked.peak.toFixed(1)} deg/s`);
    assert.ok(locked.round !== null && Math.abs(free.round - locked.round) < 0.1, `${gait}: round in ${free.round} and ${locked.round} s`);
    assert.ok(locked.peak > 45, `${gait}: ${locked.peak.toFixed(1)} deg/s`);
  }
});

test('locked on, the stick pulled back turns the horse about (it did rein back, never turning); the old way is kept behind a switch', () => {
  const now = turnRate(true, 'canter', { seconds: 4, about: true });
  assert.ok(now.round !== null && now.round < 3.5, `round about in ${now.round} s`);
  assert.ok(now.least < now.speed, 'it slows into the turn');
  assert.ok(now.least > 0, 'and does not back');
  CONTROL.ride.reins = false;
  try {
    const before = turnRate(true, 'canter', { seconds: 4, about: true });
    assert.equal(before.round, null);
    assert.ok(before.least < 0, 'it backed');
  } finally {
    CONTROL.ride.reins = true;
  }
});

test('the stick past the run threshold gallops the player\'s horse', () => {
  const gallop = turnRate(false, 'gallop');
  const canter = turnRate(false, 'canter');
  assert.ok(gallop.speed > canter.speed * 1.5, `${gallop.speed.toFixed(1)} against ${canter.speed.toFixed(1)} m/s`);
});
