// Running, as a body runs: for every fighter that runs (the player's sprint, an AI man running to his place, after a man
// or away), the speed, the start and the stop, and the stride follow his body. Tuning: WORLD.gait.
//
// - Power: what one leg can push through its foot (the hip extensors, quadriceps and calf: rising.js's leg) over his
//   weight with all he wears, times how fast that leg's muscle can shorten (body.topSpeed at the foot: Hill's top speed,
//   from leg length, fast fibres, the pennation of bulky muscle, age and the joints, and what his armour lets it swing),
//   over a reference: `power` about 1 for a fit young man, less for a heavy, old, fat or starved one.
// - Top speed (a sprint): `top` m/s at power 1, in proportion to it and to the root of his leg length over 0.87 m, times
//   what his kit lets his legs do (gear.foot); a run that is not a sprint (an AI man running) is `runShare` of it,
//   more the better his wind (aerobic). As sound as his weaker leg is, and as fresh (rising.js limbShares).
// - The start and the stop: the stance gathers speed at `accel` × g × power × his kit's acceleration share, less as he
//   nears the speed he wants (to `least` of it); it brakes at `brake` × g × the same. The heavier for his legs, the
//   more ground he needs to stop.
// - The stride (the footwork of a run: physics.js updateFeet): steps at `rate` Hz + `ratePerSpeed` per m/s (about 3 a
//   second at a jog, 4 at a sprint), each foot on the floor as long as it takes his hips to pass over `contact` of his
//   leg length; the swing is the rest of two steps, the next foot away at `overlap` = step time / swing. A man without
//   the power has a shorter flight (he spends longer on each foot). The foot lands `land` of his leg length (+
//   `landPerSpeed` per m/s) ahead of the stance, and rises `lift` (+ `liftPerSpeed` per m/s) shares of his leg length
//   at the middle of the swing, less as he tires.
// - The lean: `lean` rad forward at a run, `leanPerSpeed` more per m/s, and `accelLean` of the angle his acceleration
//   makes with gravity (forward speeding up, back braking: `accelSmooth` s), `tiredLean` more when spent (hunched).
// - A hurt leg: the step off it is quicker and the stride shorter (`limp`): he hobbles.

import { P } from '../body.js';
import { limbShares } from '../physics.js';
import { WORLD } from './config.js';

const REFERENCE_LEG = 0.87;

/** What his body gives a run, fresh and sound: power (1 a fit young man), top speed (m/s), start and stop (m/s²). Cached per body. */
export function gaitBody(body) {
  const spec = WORLD.gait;
  const force = body.muscleForce ?? body.motorForce;
  const weight = body.masses.reduce((sum, mass) => sum + mass, 0) * WORLD.gravity;
  const legForce = (force[P.pelvis] * 0.5 + force[P.lKnee] + force[P.lFoot] * 0.5) / weight;
  const shortening = Math.min(body.topSpeed[P.lFoot], body.topSpeed[P.rFoot]);
  const power = (legForce / spec.forceRef) * (shortening / spec.speedRef);
  const legLength = body.lengths.thigh + body.lengths.shank;
  const gear = body.gear ?? { foot: 1, accel: 1 };
  return {
    power,
    legLength,
    top: spec.top * power * Math.sqrt(legLength / REFERENCE_LEG) * gear.foot,
    accel: spec.accel * WORLD.gravity * power * gear.accel,
    brake: spec.brake * WORLD.gravity * power * gear.accel,
    runShare: Math.max(spec.runShare.least, Math.min(spec.runShare.most, spec.runShare.base + spec.runShare.aerobic * body.aerobic)),
  };
}

/** His body's gait (cached on the fighter for his body). */
export function gaitOf(fighter) {
  let cache = fighter.gaitBody;
  if (!cache || cache.body !== fighter.body) {
    cache = { body: fighter.body, ...gaitBody(fighter.body) };
    fighter.gaitBody = cache;
  }
  return cache;
}

/** How sound and fresh his legs are for a run (0..1): the weaker leg's share (limbShares: damage, fatigue). */
export function runLegs(fighter) {
  const shares = limbShares(fighter);
  return Math.min(shares.leg.l, shares.leg.r);
}

/** The speed (m/s) of his run at full pace: flat out (`sprint`), or a run (an AI man's): as sound and fresh as his legs are. */
export function runSpeed(fighter, sprint) {
  const gait = gaitOf(fighter);
  const legs = runLegs(fighter);
  return gait.top * (sprint ? 1 : gait.runShare) * (WORLD.gait.legFloor + (1 - WORLD.gait.legFloor) * legs);
}

/**
 * The most the stance's speed may change this step (m/s), running: gathering speed (towards `wanted` m/s from `speed`)
 * at his start, less as he nears his top; braking at his brake.
 */
export function runChange(fighter, speed, wanted, dt) {
  const gait = gaitOf(fighter);
  const legs = WORLD.gait.legFloor + (1 - WORLD.gait.legFloor) * runLegs(fighter);
  if (wanted <= speed) return gait.brake * legs * dt;
  const top = Math.max(1e-3, gait.top * legs);
  return gait.accel * legs * Math.max(WORLD.gait.least, 1 - speed / top) * dt;
}

/**
 * The footwork of his run at `speed` m/s (physics.js updateFeet's step spec): seconds (the swing), overlap (the next
 * foot goes at this share of it), lead (the landing, in swing times of travel), threshold and lift.
 */
export function strideOf(fighter, speed) {
  const spec = WORLD.gait;
  const gait = gaitOf(fighter);
  const L = gait.legLength;
  const v = Math.max(spec.slowest, speed);
  const period = 1 / (spec.rate + spec.ratePerSpeed * v);
  // On the floor as long as the hips take to pass over it; a man short of power longer (less flight, a stompier run).
  const contact = Math.min(period * spec.mostContact, (spec.contact * L) / v / Math.min(1, Math.max(spec.leastPower, gait.power)) ** spec.powerContact);
  const seconds = Math.max(period * 1.02, 2 * period - contact);
  const ahead = (spec.land + spec.landPerSpeed * v) * L;
  const tired = 1 - Math.max(0, Math.min(1, fighter.stamina));
  return {
    seconds,
    overlap: period / seconds,
    lead: 1 + ahead / (seconds * v),
    threshold: spec.threshold,
    lift: (spec.lift + spec.liftPerSpeed * v) * L * (1 - spec.tiredLift * tired) * Math.min(1, Math.sqrt(Math.max(spec.leastPower, gait.power))),
  };
}

/**
 * The trunk's lean in his run (rad, forward): a little at a jog, more the faster, much more gathering speed and back
 * braking (his acceleration along his way, smoothed: `fighter.gaitAccel`), hunched when spent.
 */
export function runLean(fighter, dt) {
  const spec = WORLD.gait;
  const speed = Math.hypot(fighter.rootVelocity[0], fighter.rootVelocity[1]);
  const forward = [Math.cos(fighter.yaw), -Math.sin(fighter.yaw)];
  const along = fighter.rootVelocity[0] * forward[0] + fighter.rootVelocity[1] * forward[1];
  const was = fighter.gaitAlong ?? along;
  const accel = dt > 0 ? (along - was) / dt : 0;
  fighter.gaitAlong = along;
  fighter.gaitAccel = (fighter.gaitAccel ?? 0) + (accel - (fighter.gaitAccel ?? 0)) * (1 - Math.exp(-dt / spec.accelSmooth));
  const tired = 1 - Math.max(0, Math.min(1, fighter.stamina));
  const lean = spec.lean + spec.leanPerSpeed * speed + spec.accelLean * Math.atan2(fighter.gaitAccel, WORLD.gravity) + spec.tiredLean * tired;
  return Math.max(spec.leanMost[0], Math.min(spec.leanMost[1], lean));
}

/**
 * A hurt leg in the run: the swing of the other (the time on the hurt one) is cut short and the step is shorter, by how
 * much weaker it is than the sound leg. A share of the step's seconds and of its length.
 */
export function limpOf(fighter, swinging) {
  const shares = limbShares(fighter);
  const stance = swinging === 'l' ? shares.leg.r : shares.leg.l;
  const other = swinging === 'l' ? shares.leg.l : shares.leg.r;
  const short = Math.max(0, Math.min(1, other - stance));
  return { seconds: 1 - WORLD.gait.limp.seconds * short, length: 1 - WORLD.gait.limp.length * short };
}
