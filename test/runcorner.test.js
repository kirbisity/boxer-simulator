// Cornering at a run (physics/gait.js cornering, bankOf, turnRateMost; physics.js leanIntoTurn, moveRoot's turn limit, turnedStep; pose.js bank):
// a turn is a sideways force v × (turn rate) the floor gives through the stance foot, which leans him in by atan(v × turn / g), his whole body
// about the feet, the feet out on the outside of his centre of mass; no more than his grip and his leg hold, and his heading turns no faster
// than that carries his path (a sprint swings wide, a jog turns sharper), so that he never topples.

import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { directFighter, newOrders } from '../src/control.js';
import { advance, createWorld, placeFighter } from '../src/physics.js';
import { cornering } from '../src/physics/gait.js';
import { WORLD } from '../src/physics/config.js';
import { unleaned } from '../src/pose.js';

const DEG = 180 / Math.PI;
const G = WORLD.gravity;
const speedOf = (fighter) => Math.hypot(fighter.rootVelocity[0], fighter.rootVelocity[1]);

/** A man on a wide open floor, a foe far off, standing still. */
function field(key = 'forger') {
  const world = createWorld([{ inputs: structuredClone(PRESETS[key]), corner: 'red' }, { inputs: structuredClone(PRESETS.light), corner: 'blue' }], { seed: 4, arena: { halfX: 120, halfZ: 120 } });
  const [me, him] = world.fighters;
  placeFighter(me, -100, 0);
  placeFighter(him, 100, 100);
  me.yaw = 0;
  const orders = newOrders();
  const step = (seconds, each) => advance(world, seconds, (current, dt) => {
    thinkAll(current, dt, new Set([0, 1]));
    directFighter(current, me, orders, dt);
    each?.(current, dt);
  });
  /** A steady turn: the stick held `rate / 6` rad (the heading's own rate of catching up) round from his heading, every step (rate: + to the right). */
  const curve = (seconds, amount, rate, each) => step(seconds, (current, dt) => {
    const wanted = me.yaw + rate / WORLD.footing.turnRate;
    orders.stick = { dir: [Math.cos(wanted), -Math.sin(wanted)], amount };
    each?.(current, dt);
  });
  /** Run straight on at `amount` of the stick until at pace. */
  const runUp = (amount, seconds = 4) => {
    orders.stick = { dir: [1, 0], amount };
    step(seconds);
  };
  return { world, me, him, orders, step, curve, runUp };
}

/** In his own frame, +x forward, +z left: the particle's place from his hips. */
function lateral(fighter, index) {
  const left = [Math.sin(fighter.yaw), Math.cos(fighter.yaw)];
  return (fighter.x[index * 3] - fighter.x[P.pelvis * 3]) * left[0] + (fighter.x[index * 3 + 2] - fighter.x[P.pelvis * 3 + 2]) * left[1];
}

/** The trunk's roll from upright (rad, + towards his left): from hips to neck, across over up. */
function trunkRoll(fighter) {
  return Math.atan2(lateral(fighter, P.neck), fighter.x[P.neck * 3 + 1] - fighter.x[P.pelvis * 3 + 1]);
}

test('a straight run has no lean, and nor has a walk, standing, or a walking turn', () => {
  const run = field();
  run.runUp(1);
  assert.equal(run.me.runMode, true);
  assert.ok(Math.abs(run.me.bank ?? 0) < 0.01, `straight sprint: bank ${(run.me.bank * DEG).toFixed(2)} deg`);
  assert.ok(Math.abs(trunkRoll(run.me)) < 0.05, `the trunk upright (${(trunkRoll(run.me) * DEG).toFixed(1)} deg)`);
  const walk = field();
  walk.runUp(0.4);
  assert.equal(walk.me.runMode, false);
  walk.curve(2, 0.4, -3);
  assert.ok(Math.abs(walk.me.bank ?? 0) < 1e-6, `a walking turn does not lean (${(walk.me.bank * DEG).toFixed(2)} deg)`);
  assert.ok(Math.abs(trunkRoll(walk.me)) < 0.08, `the walker's trunk upright (${(trunkRoll(walk.me) * DEG).toFixed(1)} deg)`);
  const still = field();
  still.step(1);
  assert.ok(!still.me.bank, 'standing: none');
});

test('he leans towards the inside of the curve, to the left in a left turn and to the right in a right one, the feet out on the outside', () => {
  for (const [rate, sign] of [[-0.8, 1], [0.8, -1]]) {
    const game = field();
    game.runUp(1);
    game.curve(1.5, 1, rate);
    const label = `${rate < 0 ? 'left' : 'right'} turn`;
    assert.ok(sign * game.me.bank > 0.2, `${label}: bank ${(game.me.bank * DEG).toFixed(1)} deg towards the inside`);
    assert.ok(sign * trunkRoll(game.me) > 0.15, `${label}: the trunk leans in (${(trunkRoll(game.me) * DEG).toFixed(1)} deg), pelvis to neck`);
    // The head stays more upright than the trunk (the righting reflex), but goes in with it.
    const headLean = Math.atan2(lateral(game.me, P.head) - lateral(game.me, P.neck), game.me.x[P.head * 3 + 1] - game.me.x[P.neck * 3 + 1]);
    assert.ok(sign * headLean < sign * trunkRoll(game.me) + 0.3 && Math.abs(headLean) < Math.abs(trunkRoll(game.me)) + 0.1, `${label}: the head more upright than the trunk`);
    // The feet, averaged over a stride, are out on the outside of the hips (the centre of mass's floor point): the force through the leg goes through it.
    let outside = 0;
    let frames = 0;
    game.curve(0.6, 1, rate, () => {
      outside += -sign * (lateral(game.me, P.lFoot) + lateral(game.me, P.rFoot)) / 2;
      frames += 1;
    });
    assert.ok(outside / frames > 0.15, `${label}: the feet ${(outside / frames).toFixed(2)} m out on the outside of his hips`);
  }
});

test('the lean is atan(v × turn / g) in a steady curve (after the lag), more the faster and the sharper the turn, and the path follows his facing', () => {
  const rows = [];
  for (const [amount, rate] of [[0.7, 0.5], [0.7, 1.0], [1, 0.5], [1, 0.8]]) {
    const game = field('light');
    game.runUp(amount);
    game.curve(2.5, amount, -rate);
    const { me } = game;
    const speed = speedOf(me);
    const wanted = Math.atan(Math.min(speed * Math.abs(me.turn) / G, cornering(me).tan));
    rows.push({ amount, rate, speed, bank: me.bank, wanted });
    assert.ok(Math.abs(me.bank - wanted) < 0.04, `${amount} at ${rate} rad/s: leans ${(me.bank * DEG).toFixed(1)} deg, atan(v w / g) is ${(wanted * DEG).toFixed(1)} (${speed.toFixed(1)} m/s)`);
    assert.ok(Math.abs(me.turn + rate) < 0.2 || speed * Math.abs(me.turn) / G >= cornering(me).tan * 0.98, `${amount} at ${rate}: turning at the rate asked (${me.turn.toFixed(2)}), or at his most`);
    // His facing is the way he goes (not dragged round sideways): the path's heading within a few degrees of it.
    const path = Math.atan2(-me.rootVelocity[1], me.rootVelocity[0]);
    const off = Math.abs(Math.atan2(Math.sin(path - me.yaw), Math.cos(path - me.yaw)));
    assert.ok(off < 0.12, `${amount} at ${rate}: his facing within ${(off * DEG).toFixed(1)} deg of his way`);
  }
  assert.ok(rows[1].bank > rows[0].bank + 0.05, 'a sharper turn at the same pace leans more');
  assert.ok(rows[2].bank > 0.1 && rows[3].bank > rows[2].bank + 0.05, 'and again at a sprint');
  assert.ok(rows[2].bank > rows[0].bank + 0.05, 'a sprint leans more than a jog through the same turn');
  assert.ok(rows[2].speed > rows[0].speed + 1.5);
});

test('the lean comes after the turn begins, over a short lag, and goes when the turn is done', () => {
  const game = field();
  game.runUp(1);
  const banks = [];
  game.curve(1, 1, -0.8, () => banks.push(game.me.bank));
  assert.ok(Math.abs(banks[2]) < 0.08, `a few frames in he has hardly leaned (${(banks[2] * DEG).toFixed(1)} deg)`);
  assert.ok(banks[20] > banks[2] && banks[20] < banks[59], 'building');
  assert.ok(banks[59] > 0.3, `leaned in by a second (${(banks[59] * DEG).toFixed(1)} deg)`);
  game.orders.stick = { dir: [Math.cos(game.me.yaw), -Math.sin(game.me.yaw)], amount: 1 };
  game.step(1.5);
  assert.ok(Math.abs(game.me.bank) < 0.03, `upright again on the straight (${(game.me.bank * DEG).toFixed(1)} deg)`);
});

test('a hard turn at a sprint does not topple him: the lean stops at what his grip and leg hold, his heading turns no faster than that, and he is on his feet', () => {
  for (const key of ['light', 'forger', 'heavy']) {
    for (const turn of [90, -90, 160, -160]) {
      const game = field(key);
      game.runUp(1);
      const { me } = game;
      const most = cornering(me).tan;
      assert.ok(most < 1 && most > 0.3, `${key}: he can hold a lean of ${(Math.atan(most) * DEG).toFixed(0)} deg at the most`);
      const a = (turn * Math.PI) / 180;
      let worst = 0;
      let rate = 0;
      let fell = false;
      game.orders.stick = { dir: [Math.cos(a), Math.sin(a)], amount: 1 };
      game.step(3, () => {
        worst = Math.max(worst, Math.abs(me.bank));
        rate = Math.max(rate, Math.abs(me.turn) * speedOf(me) / G);
        if (me.state !== 'up') fell = true;
      });
      assert.equal(fell, false, `${key}: ${turn} degrees: on his feet`);
      assert.ok(worst <= Math.atan(most) + 0.02, `${key}: ${turn} degrees: leaned ${(worst * DEG).toFixed(1)} deg, no more than ${(Math.atan(most) * DEG).toFixed(1)}`);
      assert.ok(rate <= most * 1.15, `${key}: ${turn} degrees: a sideways push of ${rate.toFixed(2)} g at the most, his is ${most.toFixed(2)}`);
      assert.ok(worst < 0.7, `${key}: never past 40 degrees`);
      // He has turned (the whole way, the stick being held there).
      const path = Math.atan2(-me.rootVelocity[1], me.rootVelocity[0]);
      assert.ok(Math.abs(Math.atan2(Math.sin(path + a), Math.cos(path + a))) < 0.5, `${key}: ${turn} degrees: round on to the way`);
    }
  }
});

test('a sprint swings wider than a jog on the same bend, and a runner slows for a sharp turn rather than run into it', () => {
  const bend = (amount) => {
    const game = field();
    game.runUp(amount);
    const speeds = [];
    game.curve(2, amount, -2.4, () => speeds.push(speedOf(game.me)));
    const { me } = game;
    const speed = speedOf(me);
    return { before: speeds[0], speed, radius: speed / Math.abs(me.turn), push: speed * Math.abs(me.turn), most: cornering(me).accel };
  };
  const jog = bend(0.7);
  const sprint = bend(1);
  for (const run of [jog, sprint]) assert.ok(run.push <= run.most * 1.1, `the sideways push ${run.push.toFixed(1)} m/s² is no more than his grip's ${run.most.toFixed(1)}`);
  assert.ok(sprint.radius > jog.radius, `a sprint ${sprint.radius.toFixed(1)} m round (${sprint.speed.toFixed(1)} m/s), a jog ${jog.radius.toFixed(1)} m (${jog.speed.toFixed(1)} m/s)`);
  // A right angle: slowed to what his grip takes round it in a stride or two; a gentle bend is run as fast.
  const sharp = field();
  sharp.runUp(1);
  const before = speedOf(sharp.me);
  sharp.orders.stick = { dir: [0, 1], amount: 1 };
  let slowest = Infinity;
  sharp.step(1.5, () => { slowest = Math.min(slowest, speedOf(sharp.me)); });
  assert.ok(slowest < 0.65 * before, `a right angle at a sprint: slowed to ${slowest.toFixed(1)} from ${before.toFixed(1)} m/s`);
  const gentle = field();
  gentle.runUp(1);
  let least = Infinity;
  gentle.curve(2, 1, -0.5, () => { least = Math.min(least, speedOf(gentle.me)); });
  assert.ok(least > 0.97 * before, `a gentle bend at the same pace (${least.toFixed(1)} of ${before.toFixed(1)} m/s)`);
});

test('it holds with nothing in the hands, a sword at the waist, and a spear carried forward', () => {
  for (const key of ['light', 'forger', 'yari']) {
    for (const rate of [-0.9, 0.9]) {
      const game = field(key);
      game.runUp(1);
      const { me } = game;
      const bank = [];
      game.curve(1.5, 1, rate, () => bank.push(me.bank));
      const sign = rate < 0 ? 1 : -1;
      assert.ok(sign * me.bank > 0.25, `${key}: leaning in (${(me.bank * DEG).toFixed(1)} deg)`);
      assert.equal(me.state, 'up', `${key}: on his feet`);
      // The hands go with the lean: still at his sides (a sword) or forward and up (a spear), not through his trunk or flung out.
      const hand = (side) => Math.hypot(me.x[P[`${side}Hand`] * 3] - me.x[P.pelvis * 3], me.x[P[`${side}Hand`] * 3 + 2] - me.x[P.pelvis * 3 + 2]);
      assert.ok(hand('l') < 0.9 && hand('r') < 0.9, `${key}: the hands near him (${hand('l').toFixed(2)}, ${hand('r').toFixed(2)} m)`);
      if (me.weapon?.held) {
        const forward = [Math.cos(me.yaw), -Math.sin(me.yaw)];
        const along = me.weapon.dir[0] * forward[0] + me.weapon.dir[2] * forward[1];
        if (key === 'yari') {
          assert.ok(along > 0.5 && me.weapon.dir[1] > 0.1, `${key}: the point forward and up (${me.weapon.dir.map((value) => value.toFixed(2))})`);
        } else assert.ok(me.weapon.dir[1] < -0.3, `${key}: the blade down along the thigh (${me.weapon.dir.map((value) => value.toFixed(2))})`);
      }
    }
  }
});

test('his arms are laid out upright and leaned once: the pose undone gives the arms of the straight run', () => {
  const game = field();
  game.runUp(1);
  game.curve(1.2, 1, -0.9);
  const { me } = game;
  const level = unleaned(me.body, me.intent.bank, me.desired);
  const neck = level(me.desired[P.neck]);
  const pelvis = level(me.desired[P.pelvis]);
  assert.ok(Math.abs(neck[2] - pelvis[2]) < 0.1 * me.body.heightM * 0.3, `the trunk upright when the lean is undone (${(neck[2] - pelvis[2]).toFixed(2)} m across)`);
  assert.ok(Math.abs(me.intent.bank) > 0.2, 'and it was leaned');
});

test('an AI man running to a place cornering: leans into a turn, on his feet, his heading with his path', () => {
  const game = field();
  const { me, world } = game;
  me.player = false;
  const goals = [[-60, 0], [-60, -40], [-100, -40]];
  let goal = 0;
  let fell = false;
  let most = 0;
  const point = () => [me.x[P.pelvis * 3], me.x[P.pelvis * 3 + 2]];
  advance(world, 6, (current, dt) => {
    thinkAll(current, dt, new Set([1]));
    if (Math.hypot(point()[0] - goals[goal][0], point()[1] - goals[goal][1]) < 6 && goal < goals.length - 1) goal += 1;
    Object.assign(me, { running: true, move: 1, goTo: [goals[goal][0], 0, goals[goal][1]] });
    most = Math.max(most, Math.abs(me.bank ?? 0));
    if (me.state !== 'up') fell = true;
  });
  assert.equal(fell, false, 'he never fell');
  assert.ok(most > 0.1, `he leaned into the corner (${(most * DEG).toFixed(1)} deg)`);
  assert.ok(most < 0.7, 'but not past what holds him');
});

test('a horse leans into a turn as a runner does, the rider with it, and is upright on the straight', () => {
  for (const [heading, sign] of [[1, -1], [-1, 1]]) {
    const world = createWorld([{ inputs: { ...structuredClone(PRESETS.knight), mounted: true }, corner: 'red' }, { inputs: structuredClone(PRESETS.light), corner: 'blue' }], { seed: 1, arena: { halfX: 60, halfZ: 60 } });
    const [rider] = world.fighters;
    const horse = rider.mount;
    let wanted = 0;
    let deepest = 0;
    const ride = (goal, seconds) => {
      for (let t = 0; t < seconds; t += 1 / 60) {
        horse.goal = goal;
        horse.goalAt = world.time + 1;
        advance(world, 1 / 60);
        wanted = Math.max(wanted, Math.atan(Math.abs(horse.speed * horse.yawRate) / G));
        deepest = Math.max(deepest, Math.abs(horse.bank ?? 0));
      }
    };
    ride({ heading: 0, speed: horse.paces.canter }, 3);
    assert.ok(Math.abs(horse.bank ?? 0) < 0.01, 'upright on the straight');
    ride({ heading, speed: horse.paces.canter }, 1);
    assert.ok(wanted > 0.15 && deepest > 0.8 * wanted && deepest <= wanted + 0.01, `leaned ${(deepest * DEG).toFixed(1)} deg at the most, atan(v w / g) at the most ${(wanted * DEG).toFixed(1)}`);
    assert.ok(sign * horse.bank > 0.05, `into the turn (${(horse.bank * DEG).toFixed(1)} deg)`);
    assert.ok(deepest < 0.7, 'no more than its legs hold');
    assert.ok(sign * trunkRoll(rider) > 0.05, `the rider's trunk goes in with it (${(trunkRoll(rider) * DEG).toFixed(1)} deg)`);
    assert.equal(rider.state, 'up');
  }
});
