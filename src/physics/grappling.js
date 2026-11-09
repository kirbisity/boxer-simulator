// Grappling: the clinch (hands held to the neck, driven, thrown from the
// hold) and holding a man down on the floor.

import { soundVoice } from '../audio/log.js';
import { P } from '../body.js';
import { MOVES, STYLES } from '../moves.js';
import { addDamage, boneShare, dropWeapon, fall, opponentFor, point, protectionAt, throwPunch, TRUNK_PARTICLES, wound } from '../physics.js';
import { riseForces } from './rising.js';
import { vec, yawRotate } from '../pose.js';
import { WORLD } from './config.js';
import { pointThrough } from '../weapons.js';

/**
 * The clinch: each hand is held to the back of the opponent's neck by a
 * constraint shared by inverse mass, so a heavier fighter's head is harder to
 * pull down. A grip pulled too far open lets go.
 */
export function holdClinch(world, fighter) {
  const target = world.fighters[fighter.clinch.target];
  const style = STYLES[fighter.style];
  // A weapon art taken from the hold (`clinch.art`, weaponarts.js): once his hands have hold of him, the throw it was taken for
  // (judo's over the shoulder, else over the hip) or the blow (`then`: the dagger's point put in while the free hand holds him).
  const art = fighter.clinch.art;
  if (art && target.state === 'up' && (fighter.clinch.hands ?? ['l', 'r']).every((side) => fighter.clinch.locked?.[side])) {
    fighter.clinch.art = null;
    if (art.throw) {
      if (style?.shoulderThrow) shoulderThrow(world, fighter, target);
      else throwFromHold(world, fighter, target);
      return;
    }
    if (art.then) throwPunch(world, fighter, art.then, art.zone ?? MOVES[art.then].zones[0]);
  }
  // Holding him, an ape bites (`bite`).
  if (style?.bite && Object.values(fighter.clinch.locked ?? {}).some(Boolean)) {
    fighter.clinch.biteAt ??= world.time + style.bite.first;
    if (world.time >= fighter.clinch.biteAt) {
      fighter.clinch.biteAt = world.time + style.bite.every;
      bite(world, fighter, target, style.bite);
    }
  }
  // Holding him by the collar and the sleeve, a judoka turns in for the throw over his shoulder (`shoulderThrow`).
  const shoulder = style?.shoulderThrow;
  if (shoulder && fighter.clinch.locked?.l && fighter.clinch.locked?.r && fighter.clinch.t > shoulder.after && target.state === 'up' && !target.mount
    && world.random() < shoulder.rate * (world.lastDt / WORLD.substeps)) {
    shoulderThrow(world, fighter, target);
    return;
  }
  if (style?.clinchDrive && fighter.clinch.locked?.l && fighter.clinch.locked?.r) {
    driveClinch(world, fighter, target);
    // Held long enough, a throw (sumo's: `throws`).
    const throws = style.throws;
    if (throws && fighter.clinch.t > throws.after && target.state === 'up' && world.random() < throws.rate * (world.lastDt / WORLD.substeps)) {
      throwFromHold(world, fighter, target);
      return;
    }
  }
  const held = clinchGrip(fighter, target);
  for (const side of fighter.clinch.hands ?? ['l', 'r']) {
    const hand = P[`${side}Hand`];
    const neck = vec.add(point(target.x, held.index), [0, -held.drop * 0.5, 0]);
    const offset = vec.sub(point(fighter.x, hand), neck);
    const distance = vec.length(offset);
    // The hands reach the neck under their own muscles; the grip takes hold
    // only once they get there, so they are never snapped across the gap.
    const locked = fighter.clinch.locked ?? (fighter.clinch.locked = {});
    if (!locked[side]) {
      if (distance < WORLD.clinch.lockDistance * 1.5) locked[side] = true;
      else if (fighter.clinch.t > WORLD.clinch.reachSeconds) {
        fighter.clinch = null;
        return;
      }
      continue;
    }
    if (distance > WORLD.clinch.release) {
      fighter.clinch = null;
      return;
    }
    if (distance <= WORLD.clinch.lockDistance) continue;
    const correction = vec.scale(offset, (distance - WORLD.clinch.lockDistance) / distance);
    const wHand = fighter.invMass[hand];
    const wNeck = target.invMass[held.index];
    const total = wHand + wNeck;
    for (let axis = 0; axis < 3; axis += 1) {
      fighter.x[hand * 3 + axis] -= correction[axis] * (wHand / total);
      target.x[held.index * 3 + axis] += correction[axis] * (wNeck / total);
    }
  }
}

/**
 * Where a clinch's hands take hold of the man (the particle, and how far below it they pull): the back
 * of his neck, pulled down. An animal too small to reach his neck (a style's `bite.low`: the monkeys)
 * takes hold of the highest part of him its hands reach from its shoulders (his neck,
 * his waist or his knee) and hangs on there.
 */
export function clinchGrip(fighter, target) {
  const neck = { index: P.neck, drop: WORLD.clinch.pullDown };
  if (!STYLES[fighter.style]?.bite?.low) return neck;
  const L = fighter.body.lengths;
  const top = point(fighter.x, P.lShoulder)[1] + 0.9 * (L.upperArm + L.forearmToFist);
  // (It hangs on where it holds; it does not drag a man's head down onto its own: a light body pulling a heavy neck down
  // through its hands is pulled up into it instead.)
  for (const index of [P.neck, P.pelvis]) if (point(target.x, index)[1] <= top) return { index, drop: 0 };
  return { index: P.lKnee, drop: 0 };
}

// What a bite can take: the neck and shoulders, the upper arms; a small animal at a man's legs (`bite.low`), his thighs and calves too.
const BITTEN = [['trunk', P.neck], ['lUpperArm', P.lShoulder], ['rUpperArm', P.rShoulder]];
const BITTEN_LOW = [...BITTEN, ['lThigh', P.lKnee], ['rThigh', P.rKnee], ['lShank', P.lFoot], ['rShank', P.rFoot], ['lForearm', P.lHand], ['rForearm', P.rHand]];

/**
 * A bite on a man held close (a style's `bite`: { forceN, depth,
 * pierceShare }): the teeth close on his neck and shoulder or the nearer
 * upper arm, whichever is nearer the mouth. The work the jaw does is its
 * force over the depth the canines go in, part a puncture and part a tear
 * (`pierceShare`), each less what his kit turns of a point and of an edge,
 * a wound as a blade's of that many joules: it bleeds, and reaches the bone
 * of a limb as deep as it goes.
 */
function bite(world, fighter, target, spec) {
  const mouth = point(fighter.x, P.head);
  const parts = spec.low ? BITTEN_LOW : BITTEN;
  const [key, at] = parts.reduce((best, part) => (vec.length(vec.sub(point(target.x, part[1]), mouth)) < vec.length(vec.sub(point(target.x, best[1]), mouth)) ? part : best));
  const energy = spec.forceN * spec.depth * Math.max(0.3, fighter.motorScale ?? 1);
  const covered = protectionAt(target.body.gear, key);
  // A bite torn out (`slash`, m: the monkeys'): the canines go in to their depth (the puncture) and are
  // dragged through him as the head is wrenched back (the tear, the jaw's force over the length of the gash).
  const motor = Math.max(0.3, fighter.motorScale ?? 1);
  // (Teeth through armour only past its puncture: weapons.js pointThrough.)
  const bite = spec.slash ? spec.forceN * spec.depth * motor : energy * spec.pierceShare;
  const pierce = bite * pointThrough(bite, covered.pierce, world.random());
  const cut = (spec.slash ? spec.forceN * spec.slash * motor : energy * (1 - spec.pierceShare)) * (1 - (covered.cut ?? 0));
  // (A bite torn out of a limb, `slash`, is a tear in its flesh: canines of a few cm reach no bone under a man's
  // thigh or arm; it bleeds and it hurts the muscle, it breaks nothing. At the neck it is the throat, as any bite there.)
  const toBone = key === 'trunk' ? () => 1 : spec.slash ? () => 0 : (joules) => boneShare(joules, 1);
  const event = { time: world.time, kind: 'bite', attacker: fighter.id, defender: target.id, punch: 'bite', target: key, cut, pierce, energy, point: point(target.x, at), effects: [] };
  if (pierce > 0.5) {
    wound(target, 'pierce', pierce, key, fighter);
    addDamage(target, key, pierce / 4, false, toBone(pierce));
  }
  if (cut > 0.5) {
    wound(target, 'cut', cut, key, fighter);
    addDamage(target, key, cut / 6, false, toBone(cut));
  }
  const where = key === 'trunk' ? 'neck' : /Thigh/.test(key) ? 'thigh' : /Shank/.test(key) ? 'leg' : /Forearm/.test(key) ? 'hand' : 'arm';
  event.effects.push(pierce + cut > 0.5 ? `bitten in the ${where}` : 'teeth on his armour');
  world.events.push(event);
}

/** Where a pin's hands go on a lying man: his upper chest and his hips, on top of him. */
export function pinPoints(target) {
  const up = (index, radius) => vec.add(point(target.x, index), [0, radius, 0]);
  const chest = vec.lerp(point(target.x, P.pelvis), point(target.x, P.neck), 0.8);
  return [vec.add(chest, [0, target.body.segments.trunk.skinRadius * 0.7, 0]), up(P.pelvis, target.radius[P.pelvis])];
}

/** Kneel over the man down and take hold, if there is room for another pair of hands. */
export function startPin(world, fighter) {
  const target = opponentFor(world, fighter) ?? world.fighters.find((other) => other.corner !== fighter.corner && other.state !== 'out');
  if (!target || fighter.state !== 'up' || fighter.punch || fighter.pin) return false;
  if (target.state !== 'down' && target.state !== 'rising') return false;
  // Up off his knee and standing, he is no longer a man on the floor.
  if (target.rise?.stage === 'stand') return false;
  if (pinnedBy(world, target).length >= WORLD.pin.pinners) return false;
  fighter.pin = { target: target.id, locked: { l: false, r: false } };
  fighter.clinch = null;
  fighter.rush = null;
  world.events.push({ time: world.time, kind: 'pinning', attacker: fighter.id, defender: target.id, effects: [] });
  return true;
}

/** Who has hold of this man now. */
export function pinnedBy(world, target) {
  return world.fighters.filter((fighter) => fighter.pin?.target === target.id && (fighter.pin.locked.l || fighter.pin.locked.r));
}

export function neckLow(fighter) {
  const L = fighter.body.lengths;
  const standing = L.ankle + L.shank + L.thigh + L.trunk;
  return fighter.x[P.neck * 3 + 1] < standing * WORLD.pin.lowNeck;
}

/**
 * The hold, each substep: the hands reach him under their own muscles and
 * take hold once there; held, each hand pulls on its place on him as hard
 * as the pinner's arm can (a stiff spring, capped by the arm's strength),
 * and presses him into the floor with a share of the pinner's weight, the
 * same pull and push coming back on the pinner. A strong enough man can
 * lift through it; no blow, so no harm. Pulled too far apart, it breaks.
 */
export function holdPin(world, fighter, h) {
  const target = world.fighters[fighter.pin.target];
  const spec = WORLD.pin;
  const places = pinPoints(target);
  const held = [P.neck, P.pelvis];
  const pressEach = (spec.weightShare * fighter.body.massKg * WORLD.gravity * h) / 2;
  for (const [index, side] of ['l', 'r'].entries()) {
    const hand = P[`${side}Hand`];
    const offset = vec.sub(point(fighter.x, hand), places[index]);
    const distance = vec.length(offset);
    if (!fighter.pin.locked[side]) {
      if (distance < spec.lockDistance) fighter.pin.locked[side] = true;
      continue;
    }
    if (distance > spec.release) {
      fighter.pin.locked[side] = false;
      continue;
    }
    if (distance > 1e-6) {
      const grip = Math.min(spec.gripStiffness * distance, spec.gripShare * fighter.body.strikeForce[hand]) * h;
      const along = vec.scale(offset, 1 / distance);
      world.pendingImpulses.push({ fighter: target, shares: [[held[index], 1]], direction: along, impulse: grip, holding: true });
      world.pendingImpulses.push({ fighter, shares: [[hand, 1]], direction: vec.scale(along, -1), impulse: grip, holding: true });
    }
    // His weight through the hand: down on the man, up on the arm.
    world.pendingImpulses.push({ fighter: target, shares: [[held[index], 1]], direction: [0, -1, 0], impulse: pressEach, holding: true });
    world.pendingImpulses.push({ fighter, shares: [[hand, 1]], direction: [0, 1, 0], impulse: pressEach, holding: true });
  }
}

/**
 * The clock on a man held down: it runs while someone has hold of him and
 * his trunk is down, waits while he struggles up on his knees under them,
 * restarts once he is free of them or on his feet, and
 * past `seconds` he is beaten. A hold is announced when it starts and when
 * it is broken (no hands on him, or he is back on his feet).
 */
export function countPin(world, fighter, dt) {
  const holders = fighter.state === 'out' || fighter.state === 'up' ? [] : pinnedBy(world, fighter);
  if (!holders.length) {
    if (fighter.heldAnnounced) world.events.push({ time: world.time, kind: 'pinBroken', fighter: fighter.id, effects: ['breaks the hold'] });
    fighter.heldAnnounced = false;
    fighter.pinClock = 0;
    return;
  }
  if (!fighter.heldAnnounced) {
    fighter.heldAnnounced = true;
    world.events.push({ time: world.time, kind: 'held', fighter: fighter.id, attacker: holders[0].id, effects: ['held down'] });
  }
  // His trunk up off the floor, the count waits: it starts again only once
  // he is free of their hands or on his feet (above).
  if (!neckLow(fighter)) return;
  fighter.pinClock = (fighter.pinClock ?? 0) + dt;
  // Held, he does not wait for the count: he tries to get up.
  if (fighter.state === 'down' && fighter.knockdowns < WORLD.knockdownsToStop) fighter.downTimer = Math.min(fighter.downTimer, WORLD.pin.struggleAfter);
  if (fighter.pinClock >= WORLD.pin.seconds) {
    fighter.state = 'out';
    fighter.punch = null;
    fighter.rush = null;
    fighter.clinch = null;
    fighter.heldAnnounced = false;
    dropWeapon(world, fighter, 'dropped');
    world.events.push({ time: world.time, kind: 'pinned', fighter: fighter.id, attacker: holders[0].id, effects: [`held down ${WORLD.pin.seconds} s`] });
    for (const holder of holders) holder.pin = null;
  }
}

/**
 * Gripped and driven: a sumo walks his man back with his legs. The push on
 * the man's trunk is the driver's leg force less the man's own, a share of
 * it each substep; what his legs cannot take puts him off his feet.
 */
export function driveClinch(world, fighter, target) {
  // Holding him, the driver goes with him: the push's reaction goes into the ground through his legs.
  drive(world, fighter, target, yawRotate([1, 0, 0], fighter.yaw), STYLES[fighter.style]?.clinchDriveShare ?? 1, 0);
}

/**
 * A throw from the hold (sumo's nage): the thrower's legs and hips twist
 * the man over a blocking hip — his neck and shoulders pulled down and
 * across, his hips pushed the other way — for `seconds` of the thrower's
 * leg force. Whether he goes over is his own balance's to decide; the
 * thrower is braced.
 */
export function throwFromHold(world, fighter, target) {
  const spec = WORLD.throw;
  const across = yawRotate([0, 0, world.random() < 0.5 ? 1 : -1], fighter.yaw);
  const forward = yawRotate([1, 0, 0], fighter.yaw);
  const impulse = spec.seconds * fighter.body.motorForce[P.pelvis] * Math.max(0.3, fighter.motorScale);
  const top = vec.normalize(vec.add(vec.add(across, vec.scale(forward, 0.3)), [0, -spec.down, 0]));
  world.pendingImpulses.push({ fighter: target, shares: [[P.neck, 1], [P.lShoulder, 0.7], [P.rShoulder, 0.7], [P.head, 0.4]], direction: top, impulse, massShare: WORLD.balance.massShare });
  world.pendingImpulses.push({ fighter: target, shares: [[P.pelvis, 1], [P.lHip, 0.5], [P.rHip, 0.5]], direction: vec.scale(across, -1), impulse: impulse * spec.hipShare, massShare: WORLD.balance.massShare });
  world.pendingImpulses.push({ fighter, shares: TRUNK_PARTICLES.map((index) => [index, 1]), direction: vec.scale(across, -1), impulse: impulse * 0.3, braced: 10 });
  fighter.clinch = null;
  world.events.push({ time: world.time, kind: 'throw', attacker: fighter.id, defender: target.id, impulse, effects: ['thrown'] });
  // (Heard: the heave of the throw.)
  if (world.ear) soundVoice(world, fighter, 'effort', 1);
}

/**
 * What a shoulder throw (judo's seoi nage) would do now (WORLD.shoulderThrow): the thrower turns in under the man and lifts him
 * on his back with his legs, which must bear his own weight and `bear` of the other's; what they can push beyond that, over the
 * `lift` (m) of the hips straightening, and his arms' pull (`pullShare` of their push, over `pull` m) on the collar and sleeve
 * turning him over, is the work that throws him. `lifts` false when his legs cannot take the load (the man is too heavy for him);
 * else `speed` (m/s) the man leaves his back at, from `energy` (J) over the man's mass.
 */
export function shoulderThrowOf(fighter, target) {
  const spec = WORLD.shoulderThrow;
  const strength = Math.max(0.3, fighter.motorScale ?? 1);
  const { arm, leg, weight } = riseForces(fighter, strength);
  const load = target.body.masses.reduce((sum, mass) => sum + mass, 0) * WORLD.gravity;
  const spare = leg.l + leg.r - weight - spec.bear * load;
  if (spare <= 0) return { lifts: false, spare, energy: 0, speed: 0 };
  const energy = spare * spec.lift + (arm.l + arm.r) * spec.pullShare * spec.pull;
  return { lifts: true, spare, energy, speed: Math.sqrt((2 * energy) / (load / WORLD.gravity)) };
}

/**
 * A shoulder throw (shoulderThrowOf): lifted, the man goes over the thrower's hip and shoulder to the side he is pulled, up off
 * his feet at the speed the throw gives him, turning head first (`spin`: the speed over the lever, m) so that he lands on his
 * back and shoulders: the floor does the harm (groundImpact), as any fall's. Too heavy to lift, the throw stalls and the hold is
 * broken; the thrower, bent under him, is off balance for a moment.
 */
export function shoulderThrow(world, fighter, target) {
  const spec = WORLD.shoulderThrow;
  const throwOf = shoulderThrowOf(fighter, target);
  fighter.clinch = null;
  if (!throwOf.lifts) {
    world.events.push({ time: world.time, kind: 'throwFailed', attacker: fighter.id, defender: target.id, effects: ['cannot lift him'] });
    fighter.stagger = Math.max(fighter.stagger ?? 0, spec.stallSeconds);
    return false;
  }
  const side = world.random() < 0.5 ? 1 : -1;
  const across = yawRotate([0, 0, side], fighter.yaw);
  const up = [0, 1, 0];
  const launch = vec.add(vec.scale(across, Math.cos(spec.angle) * throwOf.speed), vec.scale(up, Math.sin(spec.angle) * throwOf.speed));
  // Turning about the thrower's facing, the top going the way he is thrown and down, the feet up and over.
  const axis = [up[1] * across[2] - up[2] * across[1], up[2] * across[0] - up[0] * across[2], up[0] * across[1] - up[1] * across[0]];
  const spin = throwOf.speed / spec.spin;
  fall(world, target, 'thrown over the shoulder');
  const centre = point(target.x, P.pelvis);
  for (let index = 0; index < target.x.length / 3; index += 1) {
    const r = vec.sub(point(target.x, index), centre);
    const turn = [axis[1] * r[2] - axis[2] * r[1], axis[2] * r[0] - axis[0] * r[2], axis[0] * r[1] - axis[1] * r[0]];
    for (let k = 0; k < 3; k += 1) target.v[index * 3 + k] += launch[k] + spin * turn[k];
  }
  target.lastHitBy = fighter.id;
  world.events.push({ time: world.time, kind: 'throw', attacker: fighter.id, defender: target.id, speed: throwOf.speed, energy: throwOf.energy, effects: ['thrown over the shoulder'] });
  if (world.ear) soundVoice(world, fighter, 'effort', 1);
  return true;
}

/**
 * One body driven into another by the legs, for a substep: a share of the
 * driver's leg force onto the other's trunk as momentum. The other's legs
 * absorb it as they absorb any knock (their strength and footing decide
 * whether he goes over). The driver is braced: he means to be going forward.
 */
export function drive(world, fighter, target, direction, share, reaction = 0.5) {
  const h = world.lastDt / WORLD.substeps;
  const net = WORLD.clinch.driveShare * share * fighter.body.motorForce[P.pelvis] * Math.max(0.3, fighter.motorScale);
  if (net <= 0) return;
  const flat = vec.normalize([direction[0], 0, direction[2]]);
  const trunk = TRUNK_PARTICLES.map((index) => [index, 1]);
  world.pendingImpulses.push({ fighter: target, shares: trunk, direction: flat, impulse: net * h, massShare: WORLD.balance.massShare });
  if (reaction > 0) world.pendingImpulses.push({ fighter, shares: trunk, direction: vec.scale(flat, -1), impulse: net * h * reaction, braced: 10 });
}
