import { BODIES, boutGlitches } from '../tools/glitches.js';
import { test } from 'node:test';
import { fallSweep } from '../tools/falls-quality.js';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, deliverImpulse, hitParticle, placeFighter, point, WORLD } from '../src/physics.js';
import { twoBoneIK, vec } from '../src/pose.js';

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
  // Lying still, a knee may rest a little past straight, as real knees do
  // (5–10° of hyperextension), never more.
  const restingAngle = (2 * Math.asin(Math.min(1, -Math.min(0, settledKnee) / fighter.body.lengths.shank)) * 180) / Math.PI;
  assert.ok(restingAngle <= 10, `and within 10° of straight once lying still (${restingAngle.toFixed(1)}°)`);
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

test('a blow hands over more momentum than the cushioned damage figure: a sharper knockback', () => {
  const world = createWorld([PRESETS.heavy, PRESETS.amateur], { seed: 11 });
  let hit = null;
  for (let second = 0; second < 60 && !hit; second += 1) {
    advance(world, 1, (current, dt) => thinkAll(current, dt));
    hit = world.events.find((event) => event.kind === 'landed');
  }
  assert.ok(hit, 'a blow landed');
  assert.ok(hit.transferred > hit.impulse * 1.3, `${hit.transferred.toFixed(1)} N·s pushed vs ${hit.impulse.toFixed(1)} N·s of damage`);
});

/** Hold the left knee bent backwards by `angle`, foot planted, for `seconds`. */
function holdKneeBackwards(angle, seconds) {
  const { world, fighter } = alone(PRESETS.amateur);
  fighter.state = 'down';
  fighter.downTimer = 99;
  const L = fighter.body.lengths;
  const forward = vec.normalize(vec.cross(vec.normalize(vec.sub(point(fighter.x, P.neck), point(fighter.x, P.pelvis))), vec.sub(point(fighter.x, P.lHip), point(fighter.x, P.rHip))));
  const hip = point(fighter.x, P.lHip);
  const down = vec.normalize(vec.sub(point(fighter.x, P.lFoot), hip));
  const reach = Math.sqrt(L.thigh ** 2 + L.shank ** 2 - 2 * L.thigh * L.shank * Math.cos(Math.PI - angle));
  const foot = vec.add(hip, vec.scale(down, reach));
  const knee = twoBoneIK(hip, foot, L.thigh, L.shank, vec.scale(forward, -1));
  // Something heavy forces it there and keeps it there.
  for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
    for (const array of [fighter.x, fighter.prev]) {
      array.set(hip, P.lHip * 3);
      array.set(knee, P.lKnee * 3);
      array.set(foot, P.lFoot * 3);
    }
    advance(world, 1 / 60);
  }
  advance(world, 0.3);
  return { world, fighter };
}

test('a joint forced well past its range and held there breaks: the limb goes limp and stays that way', () => {
  const { world, fighter } = holdKneeBackwards(2.6, 0.8);
  assert.ok(fighter.broken.has('lKnee'), 'the knee gave');
  assert.ok(fighter.limp.has(P.lFoot), 'the shin hangs');
  assert.ok(world.events.some((event) => event.kind === 'broken' && event.joint === 'lKnee'));
  assert.equal(fighter.damage.lShank, 1, 'shown as fully hurt');
  assert.ok(fighter.knockdowns >= WORLD.knockdownsToStop, 'a broken knee ends the fight');
});

test('a single jolt past the range, gone the next instant, does not break it', () => {
  const { fighter } = holdKneeBackwards(2.6, 1 / 60);
  assert.equal(fighter.broken.has('lKnee'), false);
});

test('a slow, steady pull bends a joint but never breaks it', () => {
  const { world, fighter } = alone(PRESETS.amateur);
  for (let frame = 0; frame < 120; frame += 1) {
    fighter.v[P.lKnee * 3] -= 0.05;
    advance(world, 1 / 60);
  }
  assert.equal(fighter.broken.size, 0);
});

test('damage builds per body part with each blow and stops at seriously hurt', () => {
  const world = createWorld([PRESETS.heavy, PRESETS.amateur], { seed: 11 });
  advance(world, 90, (current, dt) => thinkAll(current, dt));
  const damage = world.fighters[1].damage;
  assert.ok(Object.keys(damage).length > 0 && Object.values(damage).every((value) => value > 0 && value <= 1));
  assert.ok((damage.head ?? 0) + (damage.trunk ?? 0) > 0.3, 'what was hit most shows most');
});

test('a knocked-out body falls as a clean ragdoll: no twisting skin, no rattling, at rest within seconds, limbs outside the trunk', () => {
  const { flips, jitter, unsettled, settle, folded } = fallSweep();
  assert.ok(flips < 3, `${flips.toFixed(1)} rig flips a fall`);
  assert.ok(jitter < 2, `jitter ${jitter.toFixed(2)} m/s² a frame while lying`);
  assert.equal(unsettled, 0, 'every fall comes to rest');
  assert.ok(settle < 3, `at rest after ${settle.toFixed(1)} s`);
  assert.ok(folded < 5, `${folded.toFixed(1)} frames with a limb inside the trunk`);
});

test('mixed styles and weights fight without visible glitches: no teleporting parts, no flipping skin', () => {
  const pairs = [['light', 'muayThai', 'heavy', 'boxing'], ['wasted', 'kickboxing', 'obese', 'muayThai'], ['contender', 'boxing', 'heavy', 'muayThai']];
  const total = { pops: 0, flips: 0, broken: 0, minutes: 0 };
  for (const [a, styleA, b, styleB] of pairs) {
    const tally = boutGlitches({ ...BODIES[a](), style: styleA }, { ...BODIES[b](), style: styleB }, 30);
    for (const key of Object.keys(total)) total[key] += tally[key];
  }
  assert.equal(total.broken, 0);
  assert.ok(total.pops / total.minutes < 1, `${(total.pops / total.minutes).toFixed(2)} pops a minute`);
  assert.ok(total.flips / total.minutes < 3, `${(total.flips / total.minutes).toFixed(2)} flips a minute`);
});
