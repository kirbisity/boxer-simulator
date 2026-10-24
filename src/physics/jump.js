// A jump, as a body jumps, and the landing after it. Tuning and what each number is set against: WORLD.jump.
//
// - The takeoff: both legs push `force` × one leg's force over his weight with all he wears (gait.js's leg), as sound and fresh as
//   his legs are and as strong as he is now; the hips rise `push` × his leg length while they push. The force gives a speed
//   (vF² = 2 × (N - 1) × g × push); his legs cannot extend faster than their muscle shortens (body.topSpeed at the foot: fast
//   fibres, age, the joints, what his armour lets them swing), `speed` × that (vS); worn joints (age) spring less (×
//   WORLD.jointFootwork + the rest × body.joints, as his footwork); the takeoff speed is the slower of the two,
//   blended (1/v² = 1/vF² + 1/vS²). Held in water (`wadeFactor`), less again. Height v²/2g, flight 2v/g on the level.
//   So the mass (fat, armour, gear) weighs against the force, age and fat against the speed, a hurt leg and the overdraft (his
//   legs' share) against both.
// - The landing: falling at `speed`, the legs stop him over their bend (`land.absorb` × leg length, less in plate). The force that
//   takes (in body weights: speed²/2g·bend + 1, more on the knees the heavier he is) over what they give (`eccentric` × the force
//   they push with) is the landing's ratio: soft, buckling, a stumble, a fall, hurt legs.
// Pure: the simulation (physics.js) does the jumping and lands him; tools/jump.js tables it by build.

import { P } from '../body.js';
import { WORLD } from './config.js';

const G = 9.81;

/** What his body gives a jump, fresh and sound (cached per body): one leg's force over his weight, the shortening speed, leg length, mass. */
export function jumpBody(body) {
  const force = body.muscleForce ?? body.motorForce;
  const massKg = body.masses.reduce((sum, mass) => sum + mass, 0);
  const weight = massKg * G;
  const legForce = (force[P.pelvis] * 0.5 + force[P.lKnee] + force[P.lFoot] * 0.5) / weight;
  const shortening = Math.min(body.topSpeed[P.lFoot], body.topSpeed[P.rFoot]);
  const legLength = body.lengths.thigh + body.lengths.shank;
  // Worn joints spring less (aging.js), as they step less sharply (WORLD.jointFootwork).
  const joints = WORLD.jointFootwork + (1 - WORLD.jointFootwork) * (body.joints ?? 1);
  return { legForce, shortening, legLength, massKg, joints, foot: body.gear?.foot ?? 1 };
}

/** His body's jump (cached on the fighter for his body). */
export function jumpBodyOf(fighter) {
  let cache = fighter.jumpBody;
  if (!cache || cache.body !== fighter.body) {
    cache = { body: fighter.body, ...jumpBody(fighter.body) };
    fighter.jumpBody = cache;
  }
  return cache;
}

/**
 * How much the water he stands in holds his legs (1: none). Level mode's wading (levelmode/level.js wadeGear) marks a man held
 * by it (`fighter.wading`); a wading that carries its own `jump` share (deeper or thicker water) gives that, else WORLD.jump.wade.
 */
export function wadeFactor(fighter) {
  const wading = fighter?.wading;
  if (!wading) return 1;
  return typeof wading.jump === 'number' ? wading.jump : WORLD.jump.wade;
}

/**
 * The jump he can make now. `legs`: each leg's share ({ l, r }, 0..1: damage, fatigue, the overdraft: physics.js limbShares);
 * `strength`: his muscles' share now (motorScale: stunned, hurt, bleeding), `wade` (wadeFactor). Returns the takeoff speed
 * (m/s), height (m), flight (s, on the level), the force (body weights), the push (m) and its stamina cost.
 */
export function jumpOf(fighter, { legs = { l: 1, r: 1 }, strength = 1, wade = wadeFactor(fighter) } = {}) {
  const spec = WORLD.jump;
  const body = jumpBodyOf(fighter);
  const share = Math.max(0, (legs.l + legs.r) / 2) * Math.max(0, Math.min(1, strength)) * body.joints;
  const force = 2 * spec.force * body.legForce * share;
  const push = spec.push * body.legLength;
  const forceSpeed = Math.sqrt(Math.max(0, 2 * (force - 1) * G * push));
  const legSpeed = spec.speed * body.shortening * Math.sqrt(Math.max(0, share));
  const v = forceSpeed > 0 && legSpeed > 0 ? (wade * forceSpeed * legSpeed) / Math.hypot(forceSpeed, legSpeed) : 0;
  const height = (v * v) / (2 * G);
  const work = body.massKg * G * (height + push);
  const cost = (spec.cost * work) / spec.workRef / Math.max(0.2, fighter.body.aerobic ?? 1);
  return { v, height, flight: (2 * v) / G, force, push, cost, can: height >= spec.least };
}

/**
 * Landing on his feet at `speed` m/s (downwards), with his legs as they are (`legs`, `strength` as jumpOf). The force the landing
 * asks of his legs (body weights, and kN), what they can give, their ratio, and what comes of it: the dip (m), buckle, stumble,
 * fall, the leg damage each leg takes, the stamina, and how long (s) until he can jump again.
 */
export function jumpLanding(fighter, speed, { legs = { l: 1, r: 1 }, strength = 1 } = {}) {
  const spec = WORLD.jump.land;
  const body = jumpBodyOf(fighter);
  const share = Math.max(0.05, (legs.l + legs.r) / 2) * Math.max(0.05, Math.min(1, strength)) * body.joints;
  const bend = spec.absorb * body.legLength * (spec.plate + (1 - spec.plate) * Math.min(1, body.foot));
  const v = Math.max(0, speed);
  const asked = (v * v) / (2 * G * bend) + 1;
  const given = 2 * WORLD.jump.force * spec.eccentric * body.legForce * share;
  const ratio = (asked / given) * (body.massKg / spec.massRef) ** spec.massExp;
  const over = Math.max(0, ratio - spec.buckle);
  return {
    speed: v,
    force: asked,
    kN: (asked * body.massKg * G) / 1000,
    ratio,
    dip: Math.min(spec.dipMost, 0.35 + 0.25 * Math.min(ratio, 2.6)) * bend,
    seconds: spec.seconds + spec.perRatio * Math.min(ratio, 3),
    buckle: ratio > spec.buckle,
    stumble: ratio > spec.stumble,
    fall: ratio > spec.fall,
    // (Past a drop's safe speed the fall's own rules hurt him too, on terrain: physics.js landOnFeet; this is the legs' share below it.)
    legDamage: ratio > spec.hurtFrom ? spec.legs * (ratio - spec.hurtFrom) * Math.min(v, WORLD.terrain.fall.safe) : 0,
    stamina: spec.cost * Math.min(over, 3),
    recover: (WORLD.jump.recover.base + WORLD.jump.recover.perRatio * Math.min(ratio, 3)) / Math.max(0.3, share),
  };
}

/** Why he cannot jump now (a word), or null. Not on his feet, crawling, in the air, mounted, held, at work with his hands, reeling. */
export function jumpBlocked(fighter, time) {
  if (!fighter || fighter.state !== 'up') return 'down';
  if (fighter.jump) return 'air';
  if (fighter.air) return 'air';
  if (fighter.crawling) return 'crawling';
  if (fighter.mount) return 'mounted';
  if (fighter.netted || fighter.pain || fighter.clinch || fighter.pin || fighter.pickup || fighter.finisher || fighter.kneel || fighter.tending) return 'busy';
  if (fighter.punch) return 'busy';
  if (fighter.stagger > 0 || fighter.dazed > 0) return 'reeling';
  if (time < (fighter.jumpReadyAt ?? -Infinity)) return 'recovering';
  return null;
}
