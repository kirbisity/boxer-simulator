// Wading: the water holds a man's legs by how deep it is over his feet and how tall he is, and the sludge holds them more. The table (ankle none, shin 0.9, knee
// 0.75, thigh 0.55, waist 0.4, chest 0.3), the cesspit slower than water, a short man slower than a tall one, nothing on the dry floor or in ankle-deep water, what
// it does to the run, the rise, the punch and the stamina, the gear given back, and determinism.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { advance, deliverImpulse, placeOnFloor } from '../src/physics.js';
import { runSpeed } from '../src/physics/gait.js';
import { createLevelWorld, levelThink, wadeGear } from '../src/levelmode/level.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { LEVEL_CONFIG } from '../src/levelmode/config.js';
import { updateStage } from '../src/levelmode/stage.js';
import { stageWaters, wadeDrag, waterViscosity } from '../src/levelmode/water.js';
import { DUNNOTTAR } from '../src/levelmode/stages/dunnottar.js';
import { DN_CESSPOOL } from '../src/levelmode/stages/dunnottar-sewer.js';

const WATER = { id: 'w', shape: 'rect', at: [0, 0, 0], size: [10, 10], bed: -2, murk: 'clear' };
const SLUDGE = { ...WATER, murk: 'sludge' };
const PIT = { ...WATER, murk: 'sludge', viscosity: 2 };
const TABLE = [[0.1, 1], [0.15, 1], [0.3, 0.9], [0.5, 0.75], [0.8, 0.55], [1.0, 0.4], [1.3, 0.3], [2.0, 0.3]];
const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) < tolerance;

/** A run with the player in the cesspool hall (the sewer awake), everybody else asleep. */
function pit(seed = 4) {
  const w = createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed });
  const me = w.fighters[0];
  placeOnFloor(me, DN_CESSPOOL.at[0] - DN_CESSPOOL.hall + 0.4, DN_CESSPOOL.at[2], DN_CESSPOOL.rim, 0);
  updateStage(w, true);
  for (const fighter of w.fighters) if (fighter !== me) fighter.dormant = true;
  return w;
}
const intoPit = (me) => placeOnFloor(me, DN_CESSPOOL.at[0] - 2, DN_CESSPOOL.at[2] + 2, DN_CESSPOOL.floor, 0);
const onRim = (me) => placeOnFloor(me, DN_CESSPOOL.at[0] - DN_CESSPOOL.hall + 0.4, DN_CESSPOOL.at[2], DN_CESSPOOL.rim, 0);

test('wade: the share of footwork left by the depth over the feet of a 1.75 m man is the table (water), eased between its rows', () => {
  for (const [depth, share] of TABLE) {
    const drag = wadeDrag(WATER, depth, 1.75);
    assert.ok(near(drag.foot, share), `${depth} m: ${drag.foot}`);
    assert.ok(near(drag.act, 1), 'plain water does not slow a punch');
  }
  // Between rows: halfway from the shin to the knee.
  assert.ok(near(wadeDrag(WATER, 0.4, 1.75).foot, 0.825));
  // Never faster for deeper water, and the acceleration follows the footwork.
  let before = 1;
  for (let depth = 0; depth <= 2; depth += 0.02) {
    const drag = wadeDrag(WATER, depth, 1.75);
    assert.ok(drag.foot <= before + 1e-12, `${depth} m`);
    assert.ok(drag.accel <= drag.foot + 1e-12 && drag.accel > 0);
    before = drag.foot;
  }
  // Wading at the waist goes at about half a walk or less.
  assert.ok(wadeDrag(WATER, 1.0, 1.75).foot <= 0.5);
});

test('wade: ankle-deep water and the dry floor hold no one, in water or sludge', () => {
  for (const water of [WATER, SLUDGE, PIT]) {
    for (const depth of [0, 0.05, 0.1, 0.15]) {
      const drag = wadeDrag(water, depth, 1.75);
      assert.equal(drag.foot, 1, `${water.murk} ${water.viscosity ?? ''} ${depth} m`);
      assert.equal(drag.accel, 1);
      assert.equal(drag.act, 1);
    }
  }
});

test('wade: the same depth holds a short man more than a tall one (the share of his leg under it)', () => {
  for (const depth of [0.3, 0.5, 0.8, 1.0]) {
    const short = wadeDrag(WATER, depth, 1.55).foot;
    const tall = wadeDrag(WATER, depth, 2.0).foot;
    assert.ok(short < wadeDrag(WATER, depth, 1.75).foot && wadeDrag(WATER, depth, 1.75).foot < tall, `${depth} m: ${short} < 1.75 < ${tall}`);
  }
  // Knee-deep for a tall man, thigh-deep for a short one: the table row of the same share of his height.
  assert.ok(near(wadeDrag(WATER, 0.5 * (1.5 / 1.75), 1.5).foot, 0.75));
});

test('wade: sludge is thicker than water and the cesspool\'s is the thickest; it takes hold from the ankle up and the water\'s own viscosity wins over its murk', () => {
  assert.equal(waterViscosity(WATER), 1);
  assert.equal(waterViscosity(SLUDGE), 1.6);
  assert.equal(waterViscosity(PIT), 2);
  for (const depth of [0.3, 0.49, 0.8, 1.0]) {
    const plain = wadeDrag(WATER, depth, 1.75);
    const sewage = wadeDrag(SLUDGE, depth, 1.75);
    const sump = wadeDrag(PIT, depth, 1.75);
    assert.ok(sump.foot < sewage.foot && sewage.foot < plain.foot, `${depth} m`);
    assert.ok(sump.act < sewage.act && sewage.act < 1, 'and it slows punches, dodges and turning, only a little');
    assert.ok(sump.act > 0.7);
  }
  // At the knee (the cesspool's 0.49 m) the sump takes a further x0.6 or so on top of the water's 0.75.
  const knee = wadeDrag(PIT, 0.5, 1.75).foot / wadeDrag(WATER, 0.5, 1.75).foot;
  assert.ok(knee > 0.55 && knee < 0.65, `the extra ${knee}`);
  // The thickness comes on with the depth: nothing at the ankle.
  assert.ok(near(wadeDrag(PIT, 0.15, 1.75).foot, 1));
  assert.ok(wadeDrag(PIT, 0.25, 1.75).foot / wadeDrag(WATER, 0.25, 1.75).foot > knee);
});

test('wade: the stage\'s waters carry their thickness (the crypt\'s plain, the cistern\'s sewage, the cesspool\'s sump) and the crypt\'s is a shin\'s hold', () => {
  const waters = Object.fromEntries(stageWaters(DUNNOTTAR).map((water) => [water.id, water]));
  assert.equal(waterViscosity(waters.cryptflood), 1);
  assert.equal(waterViscosity(waters.cryptway), 1);
  assert.equal(waterViscosity(waters.cistern), 1.6);
  assert.equal(waterViscosity(waters.cesspool), 2);
  const crypt = wadeDrag(waters.cryptflood, waters.cryptflood.at[1] - waters.cryptflood.bed, 1.75).foot;
  assert.ok(crypt > 0.9 && crypt < 1, `the crypt's 0.28 m: ${crypt}`);
  const sump = wadeDrag(waters.cesspool, waters.cesspool.at[1] - waters.cesspool.bed, 1.75).foot;
  assert.ok(sump > 0.4 && sump < 0.5, `the pit: ${sump}`);
});

test('wade: a man in the pit is held by its depth over his feet and let go on the rim; the gear is given back as it was', () => {
  const w = pit();
  const me = w.fighters[0];
  const { foot, accel } = me.body.gear;
  wadeGear(w);
  assert.ok(!me.wading && me.body.gear.foot === foot, 'dry on the rim');
  intoPit(me);
  wadeGear(w);
  const held = me.wading.drag;
  assert.ok(held.foot > 0.4 && held.foot < 0.5);
  assert.ok(near(me.body.gear.foot, foot * held.foot) && near(me.body.gear.accel, accel * held.accel));
  wadeGear(w);
  assert.ok(near(me.body.gear.foot, foot * held.foot), 'not held twice over');
  // Up on the rim: let go.
  onRim(me);
  wadeGear(w);
  assert.equal(me.body.gear.foot, foot);
  assert.equal(me.body.gear.accel, accel);
  assert.equal(me.wading, null);
  // A man who wades in it (`wader`) is not held at all.
  intoPit(me);
  me.body.inputs.wader = true;
  wadeGear(w);
  assert.ok(!me.wading);
});

test('wade: a short man in the pit is slower than a tall one, and a dormant man is not held', () => {
  const w = pit();
  const me = w.fighters[0];
  const other = w.fighters.find((fighter) => fighter !== me && !fighter.player);
  intoPit(me);
  placeOnFloor(other, DN_CESSPOOL.at[0] - 2, DN_CESSPOOL.at[2] - 2, DN_CESSPOOL.floor, 0);
  other.dormant = true;
  wadeGear(w);
  assert.ok(!other.wading, 'asleep');
  other.dormant = false;
  const heights = [me.body.heightM, other.body.heightM];
  wadeGear(w);
  assert.ok(me.wading && other.wading, 'every man in the water is held, enemy or comrade or the player');
  const [a, b] = me.body.heightM < other.body.heightM ? [me, other] : [other, me];
  if (heights[0] !== heights[1]) assert.ok(a.wading.drag.foot < b.wading.drag.foot, 'the shorter man is slower');
});

test('wade: a gear changed by another hand while he wades (the boss\'s second phase) is the new base, and is given back whole', () => {
  const w = pit();
  const me = w.fighters[0];
  intoPit(me);
  wadeGear(w);
  const held = me.wading.drag;
  me.body.gear.foot = 0.8;
  me.body.gear.accel = 0.7;
  wadeGear(w);
  assert.ok(near(me.body.gear.foot, 0.8 * held.foot) && near(me.body.gear.accel, 0.7 * held.accel));
  onRim(me);
  wadeGear(w);
  assert.equal(me.body.gear.foot, 0.8);
  assert.equal(me.body.gear.accel, 0.7);
});

test('wade: a sprint is slower in the sump than on the rim (the gait is worked out again as the gear changes) and a man in it has the sump\'s pace for punches and turns', () => {
  const w = pit(2);
  const me = w.fighters[0];
  const think = (world, dt) => levelThink(world, dt);
  onRim(me);
  advance(w, 0.5, think);
  const dry = runSpeed(me, true);
  intoPit(me);
  advance(w, 0.5, think);
  const wet = runSpeed(me, true);
  assert.ok(wet < dry * 0.6 && wet > dry * 0.3, `a sprint ${dry.toFixed(2)} m/s on the rim, ${wet.toFixed(2)} in the pit`);
  onRim(me);
  advance(w, 0.5, think);
  assert.ok(near(runSpeed(me, true), dry, 1e-9), 'back out, back to his own');
  // The strokes, dodges and turns run on this share of the clock (physics.js).
  intoPit(me);
  advance(w, 0.3, think);
  assert.ok(me.wading.act < 1 && me.wading.act > 0.7);
});

test('wade: getting up takes longer in the sump (the staged rise divides by his footwork)', () => {
  const rise = (where) => {
    const w = pit(3);
    const me = w.fighters[0];
    const think = (world, dt) => levelThink(world, dt);
    (where === 'pit' ? intoPit : onRim)(me);
    advance(w, 0.5, think);
    const shove = me.body.masses.reduce((sum, mass) => sum + mass, 0) * 3.5;
    deliverImpulse({ fighter: me, shares: [[P.neck, 1], [P.lShoulder, 0.5], [P.rShoulder, 0.5], [P.pelvis, 0.3]], direction: [Math.cos(7.2), 0.1, Math.sin(7.2)], impulse: shove });
    let fell = false;
    let started = null;
    for (let t = 0; t < 40; t += 1 / 60) {
      advance(w, 1 / 60, think);
      if (me.state === 'down') fell = true;
      if (me.state === 'rising') started ??= t;
      if (fell && me.state === 'up' && started !== null) return t - started;
    }
    return Infinity;
  };
  const dry = rise('rim');
  const wet = rise('pit');
  assert.ok(Number.isFinite(dry) && Number.isFinite(wet));
  assert.ok(wet > dry * 1.3, `${dry.toFixed(1)} s on the rim, ${wet.toFixed(1)} s in the pit`);
});

test('wade: wading tires a man a little while he moves, and not while he stands; the stamina never goes below empty for it', () => {
  const w = pit();
  const me = w.fighters[0];
  intoPit(me);
  me.stamina = 0.8;
  me.rootVelocity = [0, 0];
  wadeGear(w, 1);
  assert.equal(me.stamina, 0.8, 'standing');
  me.rootVelocity = [1.2, 0];
  wadeGear(w, 1);
  const lost = 0.8 - me.stamina;
  assert.ok(lost > 0.005 && lost < 0.03, `a second of wading in the pit costs ${lost}`);
  me.stamina = 0.001;
  wadeGear(w, 1);
  assert.equal(me.stamina, 0);
  assert.ok(LEVEL_CONFIG.wade.tire.cost <= 0.05, 'a little');
});

test('wade: it is deterministic (two runs of the same wade are the same)', () => {
  const walk = () => {
    const w = pit(5);
    const me = w.fighters[0];
    const log = [];
    const think = (world, dt) => levelThink(world, dt);
    intoPit(me);
    me.move = 1;
    for (let k = 0; k < 120; k += 1) {
      advance(w, 1 / 60, think);
      if (k % 20 === 0) log.push([me.root[0], me.root[1], me.body.gear.foot, me.stamina].join(','));
    }
    return log.join('|');
  };
  assert.equal(walk(), walk());
});
