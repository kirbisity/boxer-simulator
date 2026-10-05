// Grappling: the clinch (hands held to the neck, driven, thrown from the
// hold) and holding a man down on the floor.

import { P } from '../body.js';
import { STYLES } from '../moves.js';
import { dropWeapon, opponentFor, point, TRUNK_PARTICLES } from '../physics.js';
import { vec, yawRotate } from '../pose.js';
import { WORLD } from './config.js';

/**
 * The clinch: each hand is held to the back of the opponent's neck by a
 * constraint shared by inverse mass, so a heavier fighter's head is harder to
 * pull down. A grip pulled too far open lets go.
 */
export function holdClinch(world, fighter) {
  const target = world.fighters[fighter.clinch.target];
  const style = STYLES[fighter.style];
  if (style?.clinchDrive && fighter.clinch.locked?.l && fighter.clinch.locked?.r) {
    driveClinch(world, fighter, target);
    // Held long enough, a throw (sumo's: `throws`).
    const throws = style.throws;
    if (throws && fighter.clinch.t > throws.after && target.state === 'up' && world.random() < throws.rate * (world.lastDt / WORLD.substeps)) {
      throwFromHold(world, fighter, target);
      return;
    }
  }
  for (const side of fighter.clinch.hands ?? ['l', 'r']) {
    const hand = P[`${side}Hand`];
    const neck = vec.add(point(target.x, P.neck), [0, -WORLD.clinch.pullDown * 0.5, 0]);
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
    if (distance > 0.55) {
      fighter.clinch = null;
      return;
    }
    if (distance <= WORLD.clinch.lockDistance) continue;
    const correction = vec.scale(offset, (distance - WORLD.clinch.lockDistance) / distance);
    const wHand = fighter.invMass[hand];
    const wNeck = target.invMass[P.neck];
    const total = wHand + wNeck;
    for (let axis = 0; axis < 3; axis += 1) {
      fighter.x[hand * 3 + axis] -= correction[axis] * (wHand / total);
      target.x[P.neck * 3 + axis] += correction[axis] * (wNeck / total);
    }
  }
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
 * his trunk is down, restarts if he gets up off the floor under them, and
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
  if (!neckLow(fighter)) {
    fighter.pinClock = 0;
    return;
  }
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
