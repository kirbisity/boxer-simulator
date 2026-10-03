import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { advance, createWorld, deliverImpulse, hitParticle, placeFighter, point, WORLD } from '../src/physics.js';
import { vec } from '../src/pose.js';

function alone(inputs, seed = 3) {
  const world = createWorld([inputs, PRESETS.light], { seed });
  placeFighter(world.fighters[1], 2.6);
  advance(world, 1);
  return { world, fighter: world.fighters[0] };
}

function momentum(fighter) {
  const total = [0, 0, 0];
  fighter.body.masses.forEach((mass, index) => {
    for (let axis = 0; axis < 3; axis += 1) total[axis] += mass * fighter.v[index * 3 + axis];
  });
  return total;
}

/** Peak head travel relative to the hips after a blow, and when it came back. */
function knockback(inputs, impulse, { muscles = true } = {}) {
  const { world, fighter } = alone(inputs);
  if (!muscles) {
    fighter.state = 'down';
    fighter.downTimer = 99;
  }
  const rest = vec.sub(point(fighter.x, P.head), point(fighter.x, P.pelvis));
  hitParticle(world, fighter, P.head, [-1, 0, 0], impulse);
  let peak = 0;
  let back = null;
  for (let frame = 1; frame <= 90; frame += 1) {
    advance(world, 1 / 120);
    const travel = vec.length(vec.sub(vec.sub(point(fighter.x, P.head), point(fighter.x, P.pelvis)), rest));
    peak = Math.max(peak, travel);
    if (back === null && peak > 0.03 && travel < peak * 0.3) back = frame / 120;
  }
  return { peak, back };
}

test('a blow adds exactly its impulse as momentum, however it is shared out', () => {
  const { fighter } = alone(PRESETS.heavy);
  fighter.v.fill(0);
  deliverImpulse({ fighter, shares: [[P.neck, 1], [P.lShoulder, 0.5], [P.pelvis, 0.2]], direction: [0, 0, 1], impulse: 20 });
  const total = momentum(fighter);
  assert.ok(Math.abs(total[2] - 20) < 1e-9 && Math.abs(total[0]) < 1e-9);
});

test('knockback follows mass and muscle: a heavier, stronger-necked head moves less for the same blow', () => {
  const light = knockback(PRESETS.amateur, 15);
  const heavy = knockback(PRESETS.heavy, 15);
  assert.ok(light.peak > 0.05, `the head is knocked back (${(light.peak * 100).toFixed(1)} cm)`);
  assert.ok(heavy.peak < light.peak, `${(heavy.peak * 100).toFixed(1)} < ${(light.peak * 100).toFixed(1)} cm`);
  assert.ok(knockback(PRESETS.amateur, 30).peak > light.peak * 1.4, 'a harder blow throws it further');
});

test('the muscles catch the head after the reflex delay; without them it does not come back', () => {
  const caught = knockback(PRESETS.heavy, 15);
  assert.ok(caught.back !== null && caught.back > WORLD.reflex.latency, `recovered at ${caught.back} s, after the reflex`);
  const limp = knockback(PRESETS.heavy, 15, { muscles: false });
  assert.ok(limp.peak > caught.peak * 1.3, `a limp neck lets it go further (${(limp.peak * 100).toFixed(0)} vs ${(caught.peak * 100).toFixed(0)} cm)`);
});

test('a knocked-out body folds like a body: knees forward, head within its cone', () => {
  const { world, fighter } = alone(PRESETS.amateur);
  fighter.state = 'down';
  fighter.downTimer = 99;
  hitParticle(world, fighter, P.head, [-1, 0.2, 0.3], 40);
  let worstKnee = Infinity;
  let settledKnee = Infinity;
  let worstHead = 0;
  for (let frame = 0; frame < 240; frame += 1) {
    advance(world, 1 / 60);
    const pelvis = point(fighter.x, P.pelvis);
    const neck = point(fighter.x, P.neck);
    const up = vec.normalize(vec.sub(neck, pelvis));
    const forward = vec.normalize(vec.cross(up, vec.sub(point(fighter.x, P.lHip), point(fighter.x, P.rHip))));
    for (const side of ['l', 'r']) {
      const hip = point(fighter.x, P[`${side}Hip`]);
      const foot = point(fighter.x, P[`${side}Foot`]);
      const axis = vec.normalize(vec.sub(foot, hip));
      const knee = point(fighter.x, P[`${side}Knee`]);
      const onLine = vec.add(hip, vec.scale(axis, vec.dot(vec.sub(knee, hip), axis)));
      const bend = vec.dot(vec.sub(knee, onLine), forward);
      worstKnee = Math.min(worstKnee, bend);
      if (frame >= 180) settledKnee = Math.min(settledKnee, bend);
    }
    const head = vec.normalize(vec.sub(point(fighter.x, P.head), neck));
    worstHead = Math.max(worstHead, Math.acos(Math.max(-1, Math.min(1, vec.dot(head, up)))));
  }
  assert.ok(point(fighter.x, P.head)[1] < 0.5, 'it went down');
  // Landing can force a knee back for a frame; the limit then restores it.
  assert.ok(worstKnee > -0.08, `knees bent backwards at most briefly (${worstKnee.toFixed(3)} m)`);
  assert.ok(settledKnee > -0.005, `and not at all once lying still (${settledKnee.toFixed(3)} m)`);
  assert.ok(worstHead < WORLD.headCone + 0.1, `head stayed within its cone (${worstHead.toFixed(2)} rad)`);
});

test('feet step rather than glide, and the trunk lags a step in and sways past a stop', () => {
  const { world, fighter } = alone(PRESETS.heavy);
  placeFighter(fighter, -2);
  advance(world, 0.5);
  let steps = 0;
  let wasStepping = false;
  let slide = 0;
  // A foot that has just landed is still settling onto its spot; count
  // sliding only once it has been down a moment.
  const plantedFor = { l: 1, r: 1 };
  let lag = 0;
  let sway = 0;
  for (let frame = 0; frame < 150; frame += 1) {
    fighter.move = frame < 60 ? 1 : 0;
    const before = Object.entries(fighter.feet).map(([side, foot]) => (foot.step || plantedFor[side] < 0.12 ? null : point(fighter.x, foot.index)));
    advance(world, 1 / 60);
    Object.entries(fighter.feet).forEach(([side, foot], order) => {
      plantedFor[side] = foot.step ? 0 : plantedFor[side] + 1 / 60;
      if (before[order] && !foot.step) slide += Math.hypot(fighter.x[foot.index * 3] - before[order][0], fighter.x[foot.index * 3 + 2] - before[order][2]);
    });
    const stepping = Object.values(fighter.feet).some((foot) => foot.step);
    if (stepping && !wasStepping) steps += 1;
    wasStepping = stepping;
    const lean = fighter.x[P.head * 3] - fighter.x[P.pelvis * 3] - (fighter.desired[P.head][0] - fighter.desired[P.pelvis][0]);
    if (frame < 60) lag = Math.min(lag, lean);
    else sway = Math.max(sway, lean);
  }
  assert.ok(steps >= 3, `${steps} steps`);
  assert.ok(slide < 0.08, `planted feet barely slide (${(slide * 100).toFixed(1)} cm over 2.5 s)`);
  assert.ok(lag < -0.03 && sway > 0.03, `head lags ${(lag * 100).toFixed(1)} cm, sways ${(sway * 100).toFixed(1)} cm`);
});

test('a fighter at rest is never still: it bounces and sways, and replays the same from a seed', () => {
  const trace = () => {
    const { world, fighter } = alone(PRESETS.heavy, 9);
    const heads = [];
    for (let frame = 0; frame < 300; frame += 1) {
      advance(world, 1 / 60);
      heads.push(point(fighter.x, P.head));
    }
    return heads;
  };
  const heads = trace();
  const range = (axis) => Math.max(...heads.map((head) => head[axis])) - Math.min(...heads.map((head) => head[axis]));
  assert.ok(range(0) > 0.02 && range(1) > 0.01 && range(2) > 0.02, 'the head moves on every axis');
  assert.ok(range(0) < 0.15 && range(2) < 0.15, 'but stays a guard, not a dance');
  assert.deepEqual(trace().at(-1), heads.at(-1));
});
