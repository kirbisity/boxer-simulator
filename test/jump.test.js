// The jump (physics/jump.js, physics.js startJump/jumpStance/landJump): the body's numbers, the simulated flight and landing,
// what blocks it, ceilings, ledges and gaps on terrain.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS, normaliseInputs } from '../src/body.js';
import { advance, createWorld, jumpNow, placeOnFloor, startJump } from '../src/physics.js';
import { WORLD } from '../src/physics/config.js';
import { jumpBlocked, jumpLanding, jumpOf, wadeFactor } from '../src/physics/jump.js';
import { ceilingOf, createTerrain, floorAt, slabOf } from '../src/physics/terrain.js';
import { directFighter, newOrders, playerCrawl } from '../src/control.js';
import { dropOff, jumper, measureJump } from '../tools/jump.js';

const build = (preset, change = {}) => {
  const raw = { ...structuredClone(PRESETS[preset]), ...change };
  if (change.bodyFat !== undefined) delete raw.calories;
  return createWorld([{ inputs: normaliseInputs(raw), corner: 'red' }], { seed: 1 }).fighters[0];
};
const height = (fighter, options) => jumpOf(fighter, options).height;

// ---- The body's numbers ----------------------------------------------------------------------------

test('a fit young man jumps 0.45-0.6 m; the unfit, the old, the fat and men in armour much less', () => {
  const leo = height(build('light'));
  assert.ok(leo >= 0.45 && leo <= 0.6, `Leo ${leo.toFixed(2)} m`);
  assert.ok(height(build('contender')) >= 0.45);
  for (const [name, fighter] of [['old (75)', build('light', { age: 75 })], ['obese', build('street', { bodyFat: 0.35 })], ['plate', build('knight')], ['sumo', build('sumo')], ['heavy plate', build('maximilian')]]) {
    const h = height(fighter);
    assert.ok(h < leo * 0.62, `${name} ${h.toFixed(2)} m against Leo's ${leo.toFixed(2)}`);
    assert.ok(h > 0.05, `${name} still gets off the floor`);
  }
});

test('the height and the flight rise with leg strength and fall with mass, age, a hurt leg, the overdraft and water', () => {
  const leo = build('light');
  let last = 0;
  for (const share of [0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
    const now = jumpOf(leo, { legs: { l: share, r: share } });
    assert.ok(now.height > last && now.flight > 0, `legs at ${share}`);
    last = now.height;
  }
  const fresh = jumpOf(leo);
  assert.ok(jumpOf(leo, { legs: { l: 1, r: 0.4 } }).height < fresh.height, 'a hurt leg');
  assert.ok(jumpOf(leo, { legs: { l: 0.75, r: 0.75 } }).height < fresh.height, 'tired legs (the overdraft)');
  assert.ok(jumpOf(leo, { wade: WORLD.jump.wade }).height < fresh.height * 0.5, 'held by water');
  assert.ok(jumpOf(leo, { strength: 0.6 }).height < fresh.height, 'stunned or bleeding');
  for (const age of [24, 45, 60, 75, 90]) {
    const h = height(build('light', { age }));
    assert.ok(age === 24 || h <= last + 1e-9, `age ${age}`);
    last = h;
  }
  let lastFat = Infinity;
  for (const bodyFat of [0.12, 0.2, 0.3, 0.4]) {
    const h = height(build('street', { bodyFat }));
    assert.ok(h < lastFat, `fat ${bodyFat}`);
    lastFat = h;
  }
  assert.ok(height(build('knight')) > height(build('maximilian')), 'more plate, lower');
});

test('no NaN anywhere: legs gone, a starved man, a giant; too weak a jump is no jump', () => {
  for (const fighter of [build('starved'), build('gorilla'), build('combatBot'), build('maximilian')]) {
    for (const legs of [{ l: 0, r: 0 }, { l: 1, r: 0 }, { l: 1, r: 1 }]) {
      const model = jumpOf(fighter, { legs });
      for (const value of [model.v, model.height, model.flight, model.cost, model.force]) assert.ok(Number.isFinite(value), JSON.stringify(model));
      for (const speed of [0, 1, 3, 8, 20]) for (const value of Object.values(jumpLanding(fighter, speed, { legs }))) if (typeof value === 'number') assert.ok(Number.isFinite(value));
    }
    assert.equal(jumpOf(fighter, { legs: { l: 0, r: 0 } }).can, false, 'no legs, no jump');
  }
});

test('the landing: the force asked grows with the speed; soft, then buckling, stumbling, falling, hurt legs, in that order', () => {
  const leo = build('light');
  const knight = build('knight');
  let last = 0;
  let seen = 0;
  for (let speed = 0; speed <= 9; speed += 0.25) {
    const landing = jumpLanding(leo, speed);
    assert.ok(landing.force >= last, 'the force rises with the speed');
    last = landing.force;
    const level = landing.fall ? 3 : landing.stumble ? 2 : landing.buckle ? 1 : 0;
    assert.ok(level >= seen, `${speed} m/s`);
    seen = level;
    // A bruise only past a stumble; a fracture only past his bones' threshold, more likely the harder.
    assert.ok(landing.bruise === 0 || landing.ratio > WORLD.jump.land.bruiseFrom);
    assert.ok(landing.fracture === 0 || landing.ratio > landing.fractureFrom);
  }
  // (The landing he means: the knees, hips and ankles fold into a crouch: `absorb` + `soft`, ~0.5 m for a fit man. It was
  // the knees alone and he stumbled from a metre and fell from a metre and a half; drop jumps of a metre are a training drill.)
  // From his own jump and from a 1 m drop a fit man lands lightly; at 2 m (6.3 m/s) his knees give; a man in plate falls there.
  const drop = (metres) => Math.sqrt(2 * 9.81 * metres);
  assert.equal(jumpLanding(leo, jumpOf(leo).v).buckle, false);
  assert.equal(jumpLanding(leo, drop(1)).buckle, false);
  assert.equal(jumpLanding(leo, drop(2)).buckle, true);
  assert.equal(jumpLanding(leo, drop(2)).fall, false);
  assert.equal(jumpLanding(knight, drop(2)).fall, true);
  // The heavier lands the harder on the same legs-for-his-weight.
  const sumo = build('sumo');
  assert.ok(jumpLanding(sumo, jumpOf(sumo).v).ratio > jumpLanding(leo, jumpOf(leo).v).ratio);
  // The landing's numbers for Leo's own jump, over the soft landing's bend: ~2 body weights, ~1.5 kN.
  const own = jumpLanding(leo, jumpOf(leo).v);
  assert.ok(own.force > 1.6 && own.force < 2.6 && own.kN > 1.2 && own.kN < 1.9, `${own.force.toFixed(2)} BW, ${own.kN.toFixed(2)} kN`);
});

// The drops, by build: (ledge height m + his own jump's rise) -> the landing speed. What no landing may do below, and may above.
const LANDING_BUILDS = [
  // name, build, no fracture up to (m), fracture possible from (m)
  ['light athletic', ['light'], 3.5, 6],
  ['average', ['street'], 3, 6],
  ['heavy', ['heavy'], 3, 6],
  ['obese', ['street', { bodyFat: 0.35 }], 2, 4],
  ['old', ['light', { age: 75 }], 2.5, 4],
  ['plate knight', ['knight'], 2, 4],
  ['starved rebel (T -2.2)', ['starved'], 1.75, 3],
];
for (const [name, [preset, change], safe, breaks] of LANDING_BUILDS) {
  test(`the landing for the ${name}: a plain jump and a 0.9 m hop never hurt; no fracture to ${safe} m; possible by ${breaks} m; graded`, () => {
    const fighter = build(preset, change);
    const rise = jumpOf(fighter).height;
    const at = (metres) => jumpLanding(fighter, Math.sqrt(2 * 9.81 * (metres + rise)));
    assert.equal(at(0).legDamage, 0, 'a plain jump on the level');
    assert.equal(at(0).buckle, false, 'a plain jump on the level is no buckle');
    for (let metres = 0; metres <= safe + 1e-9; metres += 0.25) assert.equal(at(metres).fracture, 0, `${metres} m`);
    assert.ok(at(breaks).fracture > 0, `a fracture is possible from ${breaks} m (ratio ${at(breaks).ratio.toFixed(2)} of ${at(breaks).fractureFrom.toFixed(2)})`);
    let last = 0;
    for (let metres = 0; metres <= 8; metres += 0.5) {
      const landing = at(metres);
      assert.ok(landing.legDamage >= last, 'the harder the landing, the more it hurts');
      assert.ok(landing.bruise <= WORLD.jump.land.bruiseMost, 'a bruise is a bruise');
      last = landing.legDamage;
    }
  });
}

test('simulated drops: a fit man is unhurt to 2.5 m, goes over unbroken at 3 m; nobody dies from 3 m; the Rebel from 1.5 m is unhurt', () => {
  const cases = [['light', {}, 1, 'up'], ['light', {}, 2.5, 'up'], ['light', {}, 3, null], ['knight', {}, 1, 'up'], ['starved', {}, 1.5, 'up'], ['street', { bodyFat: 0.35 }, 2.5, null]];
  for (const [preset, change, metres, state] of cases) {
    const r = dropOff(preset, metres, change);
    assert.ok(r.landed, `${preset} ${metres} m: a jump's landing`);
    assert.notEqual(r.me.state, 'out', `${preset} ${metres} m: not out`);
    assert.equal(r.me.broken.size, 0, `${preset} ${metres} m: nothing broken (${[...r.me.broken]})`);
    if (state) assert.equal(r.me.state, state, `${preset} ${metres} m`);
    assert.ok((r.me.damage.trunk ?? 0) < 0.3, `${preset} ${metres} m: trunk ${(r.me.damage.trunk ?? 0).toFixed(2)}`);
    assert.ok((r.me.bloodLost ?? 0) < 0.01, `${preset} ${metres} m: no bleeding out`);
  }
});

test('a landing bruise heals: his legs back to what they were in some seconds', () => {
  const r = dropOff('light', 2.5, {}, 0.1);
  assert.ok(r.me.legDamage.l > 0, 'jarred');
  advance(r.world, 15);
  assert.ok(r.me.legDamage.l < 1e-9 && !r.me.landBruise, `healed: ${r.me.legDamage.l}`);
});

test('wadeFactor is safe on anyone: 1 out of the water, the wading share in it, or the wading\'s own', () => {
  assert.equal(wadeFactor(null), 1);
  assert.equal(wadeFactor({}), 1);
  assert.equal(wadeFactor({ wading: { gear: {} } }), WORLD.jump.wade);
  assert.equal(wadeFactor({ wading: { jump: 0.3 } }), 0.3);
});

// ---- Simulated ---------------------------------------------------------------------------------------

test('simulated on the flat: the hips rise about what the model says, he is in the air about its flight, and lands on his feet', () => {
  for (const [preset, least] of [['light', 0.4], ['street', 0.3], ['knight', 0.18], ['sumo', 0.13]]) {
    const { world, me } = jumper({ preset });
    const r = measureJump(world, me);
    assert.ok(r.ok && r.land, preset);
    assert.ok(r.rise > least && r.rise <= r.plan.height + 0.03, `${preset}: rose ${r.rise.toFixed(2)} of ${r.plan.height.toFixed(2)}`);
    assert.ok(Math.abs(r.air - r.plan.flight) < 0.15, `${preset}: ${r.air.toFixed(2)} s in the air, ${r.plan.flight.toFixed(2)} planned`);
    assert.equal(me.state, 'up');
    assert.ok(r.stamina > 0 || me.stamina === 1, 'it cost something (or he got it back)');
    for (const value of me.x) assert.ok(Number.isFinite(value));
  }
});

test('a jump costs stamina by the work; in the overdraft he jumps lower', () => {
  const { world, me } = jumper({ preset: 'sumo' });
  const before = me.stamina;
  const plan = jumpNow(world, me);
  startJump(world, me);
  assert.ok(Math.abs(before - me.stamina - plan.cost) < 1e-9, 'drawn at the takeoff');
  assert.ok(jumpOf(build('sumo')).cost > jumpOf(build('light')).cost, 'more mass lifted over less power, more stamina');
  const tired = jumper({ preset: 'light' });
  const fresh = jumpNow(tired.world, tired.me).height;
  tired.me.stamina = WORLD.overdraft.floor * 0.8;
  assert.ok(jumpNow(tired.world, tired.me).height < fresh * 0.9, 'deep in the overdraft');
});

test('no jump while he cannot: crawling, in the air, down, mounted, a broken leg, just landed', () => {
  const { world, me } = jumper({ preset: 'light' });
  assert.equal(jumpNow(world, me).blocked, null);
  startJump(world, me);
  assert.equal(jumpNow(world, me).blocked, 'air');
  assert.equal(startJump(world, me), false, 'not twice');
  for (let index = 0; index < 120 && me.jump; index += 1) advance(world, 1 / 60);
  assert.equal(jumpNow(world, me).blocked, 'recovering', 'his legs getting back after the landing');
  advance(world, 2);
  assert.equal(jumpNow(world, me).blocked, null);
  playerCrawl(world, me, true);
  assert.equal(jumpNow(world, me).blocked, 'crawling');
  assert.equal(startJump(world, me), false);
  playerCrawl(world, me, false);
  advance(world, 4);
  me.broken.add('lKnee');
  assert.equal(jumpNow(world, me).blocked, 'hurt');
  const other = jumper({ preset: 'light' });
  other.me.state = 'down';
  assert.equal(jumpBlocked(other.me, other.world.time), 'down');
  assert.equal(jumpBlocked({ ...other.me, state: 'up', mount: {} }, 0), 'mounted');
});

test('the Jump order (the button, Space) is carried out with the orders, and only once', () => {
  const { world, me } = jumper({ preset: 'light' });
  const orders = newOrders();
  orders.jump = true;
  directFighter(world, me, orders, 1 / 60);
  assert.equal(orders.jump, false);
  assert.ok(me.jump, 'jumping');
});

test('a knocked-off, unjumping fall lands as before: no jump state, the terrain\'s own landing', () => {
  const { world, me } = onTerrain('light', [slabOf([0, 0], [4, 4], 3), slabOf([0, 0], [40, 40], 0)], [0, 3, 0]);
  me.walking = true;
  // Pushed off the edge: never a jump.
  for (let index = 0; index < 300; index += 1) {
    me.goTo = [10, 0, 0];
    me.move = 1;
    advance(world, 1 / 60);
    assert.equal(me.jump ?? null, null);
  }
  assert.equal(world.events.some((event) => event.kind === 'land'), false);
});

// ---- On terrain: ceilings, ledges, gaps ----------------------------------------------------------------------

function onTerrain(preset, solids, at, yaw = 0) {
  const terrain = createTerrain(solids, { sea: -20 });
  const world = createWorld([{ inputs: normaliseInputs(structuredClone(PRESETS[preset])), corner: 'red' }], { seed: 1, arena: { halfX: 500, halfZ: 500, open: true, terrain } });
  const me = world.fighters[0];
  me.player = true;
  placeOnFloor(me, at[0], at[2], at[1], yaw);
  advance(world, 1);
  return { world, me, terrain };
}

/** Walk at a ledge `height` m high (its face at x = 2) and jump `jumpAt` m short of it: whether he ends up standing on it. */
function hop(preset, height, jumpAt, { run = false, gap = 0 } = {}) {
  const far = gap > 0 ? [slabOf([2 + gap + 5, 0], [10, 10], height)] : [slabOf([7, 0], [10, 10], height)];
  const { world, me, terrain } = onTerrain(preset, [slabOf([-10, 0], [24, 10], 0), ...far], [-3, 0, 0]);
  const orders = newOrders();
  let jumped = false;
  for (let t = 0; t < 12; t += 1 / 60) {
    orders.stick = { dir: [1, 0], amount: run ? 1 : 0.8 };
    directFighter(world, me, orders, 1 / 60);
    if (!jumped && me.x[P.pelvis * 3] > 2 - jumpAt) jumped = startJump(world, me);
    advance(world, 1 / 60);
    if (jumped && !me.jump && me.x[P.pelvis * 3] > 3.2 + gap) break;
    if (me.state !== 'up' && jumped) break;
  }
  const feet = ['lFoot', 'rFoot'].map((name) => floorAt(terrain, me.x[P[name] * 3], me.x[P[name] * 3 + 2], me.x[P[name] * 3 + 1] + 0.3));
  return { on: Math.min(...feet) >= height - 0.01 && me.state === 'up', world, me };
}
const reaches = (preset, height, options) => [0.6, 0.8, 0.9, 1.0, 1.1].some((at) => hop(preset, height, at, options).on);

test('a hop onto a ledge: a fit man up to ~0.9 m, a man in plate only a low one; nobody onto 1.1 m', () => {
  assert.ok(reaches('light', 0.5), 'Leo onto 0.5 m');
  assert.ok(reaches('light', 0.8), 'Leo onto 0.8 m');
  assert.ok(!reaches('light', 1.1), 'not 1.1 m');
  assert.ok(reaches('knight', 0.3), 'the knight onto 0.3 m');
  assert.ok(!reaches('knight', 0.8), 'not the knight onto 0.8 m');
  assert.ok(!reaches('sumo', 0.8), 'not the sumo');
});

test('falling short of a ledge he does not scramble onto it: he is back on the floor below', () => {
  const r = hop('light', 1.0, 0.9);
  assert.equal(r.on, false);
  for (let index = 0; index < 600 && r.me.state !== 'up'; index += 1) advance(r.world, 1 / 60);
  assert.ok(r.me.x[P.pelvis * 3 + 1] < 1.3, 'below the ledge');
});

test('a running jump carries him over a gap he could not step across', () => {
  const gap = 1.2;
  const r = hop('light', 0, 0.5, { run: true, gap });
  assert.ok(r.on && r.me.x[P.pelvis * 3] > 2 + gap, `across: x ${r.me.x[P.pelvis * 3].toFixed(2)}`);
  assert.ok(r.me.x[P.pelvis * 3 + 1] > 0.2, 'not down in the gap');
});

test('a ceiling stops the jump: the head comes up against it and he goes no higher', () => {
  const open = onTerrain('light', [slabOf([0, 0], [20, 20], 0)], [0, 0, 0]);
  const head = open.me.x[P.head * 3 + 1];
  const low = onTerrain('light', [slabOf([0, 0], [20, 20], 0), ceilingOf([0, 0], [20, 20], head + open.me.radius[P.head] + 0.15)], [0, 0, 0]);
  const from = low.me.x[P.pelvis * 3 + 1];
  startJump(low.world, low.me);
  let top = from;
  for (let index = 0; index < 120; index += 1) {
    advance(low.world, 1 / 60);
    top = Math.max(top, low.me.x[P.pelvis * 3 + 1]);
  }
  assert.ok(top - from < 0.25, `rose ${(top - from).toFixed(2)} m under a ceiling 0.15 m over his head`);
  assert.ok(low.world.events.some((event) => event.effects?.includes('head against the ceiling')));
  assert.equal(low.me.state, 'up');
});
