// Mounted fighting, the AI's half: how a man on a horse fights (charges:
// at his man at the gallop, a blow in passing, past, wheel round, again)
// and how a man on foot meets one (a long spear braced at the horse; anyone
// else out of its way, striking as it passes). What a blow does is the
// physics' (physics/mounted.js): the horse's speed is in the blade's.

import { P } from './body.js';
import { MOVES, moveRange } from './moves.js';
import { aimPoint, bladeFor, dropWeapon, point, throwPunch, toLocal, WORLD } from './physics.js';
import { steerInside } from './physics/mounted.js';
import { vec, yawRotate } from './pose.js';

/**
 * The tunables of riding to fight.
 * - leadMost: s at most a rider leads his man (rides at where he will be).
 * - lookAhead: s ahead a rider (or a man on foot) reckons where the two of
 *   them will be when a blow he begins now lands.
 * - contactAt: the share of a move's extension (from its windup to its
 *   full extent) at which it lands, for that reckoning.
 * - reachShare: of his reach from the shoulder (arm and weapon) he lets a blow go at.
 * - couchAhead: s before the point would meet him that the lance is couched (its carry does the rest).
 * - rest: s after a blow before the next.
 * - passing: closing faster than this (m/s), a blow waits until it would
 *   land no more than `early` s before the two are nearest (abreast).
 * - archer: a mounted archer rides round his man at a canter, `radius` m
 *   off, his man on his left (the bow side), turning in by `inward` rad per
 *   radius off his ring.
 * - melee: two riders within `within` m closing slower than `closing` m/s
 *   fight beside each other: he rides to his man's side, at his pace and
 *   up to `closeIn` m/s more per m he is off it (`slowest` at least).
 * - brace: a man on foot with a weapon this long (m) or more stands to a
 *   charging horse with it; `charging`: a horse closing faster than this
 *   (m/s) within `within` m is a charge.
 * - dodge: a man on foot without one gets off the horse's line (running).
 */
export const RIDING = {
  lookAhead: 1.6,
  leadMost: 2,
  contactAt: 1,
  reachShare: 0.8,
  couchAhead: 0.9,
  rest: 0.35,
  passing: 3, early: 0.06,
  archer: { radius: 11, inward: 0.6 },
  melee: { within: 4, closing: 4, slowest: 1.5, closeIn: 1.5 },
  brace: { length: 1.8 },
  charging: 3, within: 14,
};

const forwardOf = (yaw) => yawRotate([1, 0, 0], yaw);
const leftOf = (yaw) => yawRotate([0, 0, 1], yaw);
const headingOf = (x, z) => Math.atan2(-z, x);

function weightedPick(weights, random) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  let roll = random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return entries[0]?.[0] ?? null;
}

/** How fast a man moves over the ground (m/s): his horse's, or his own steps. */
function groundVelocity(fighter) {
  if (fighter.mount) return fighter.mount.velocity ?? [0, 0, 0];
  return [fighter.rootVelocity[0], 0, fighter.rootVelocity[1]];
}

/** From the shoulder, how far a move reaches: the arm and, with a weapon, the weapon. */
function reachFromShoulder(fighter, spec) {
  const L = fighter.body.lengths;
  const arm = L.upperArm + L.forearmToFist;
  const blade = spec.path === 'blade' ? bladeFor(fighter, spec) : null;
  if (spec.reach === 'weapon' && blade?.held) return arm + (blade.spec.reach ?? blade.spec.length * (spec.mode === 'thrust' ? 0.95 : 0.9));
  return arm;
}

/** When a move begun now lands (s): its windup and part of its extension, at his pace with the weapon. */
function contactTime(fighter, spec) {
  const blade = spec.path === 'blade' ? bladeFor(fighter, spec) : null;
  const pace = blade?.held ? (blade.handling?.speed ?? 1) : 1;
  const heavy = blade?.held ? Math.max(1, Math.sqrt(blade.spec.mass / WORLD.weapons.heavyFrom)) : 1;
  return (spec.windup * heavy + RIDING.contactAt * (spec.extendUntil - spec.windup)) / pace;
}

/**
 * A blow that will land as the two of them pass: for each move of his
 * style, where his shoulder and his mark will be when it lands (both
 * carried on as they go now), and whether it reaches then, in front of or
 * beside him (not behind). Thrown, it is aimed at where the mark will be.
 * `markOf(target)` is the point aimed at.
 */
function strikeInPassing(world, fighter, target, attacks, markOf, zoneOf, forward) {
  if (fighter.punch || fighter.cooldown > 0) return false;
  const choices = {};
  const aims = {};
  const mine = groundVelocity(fighter);
  const theirs = groundVelocity(target);
  for (const [name, weight] of Object.entries(attacks)) {
    const spec = MOVES[name];
    if (!spec || spec.kind !== 'strike' || spec.with || spec.path === 'aim') continue;
    const blade = spec.path === 'blade' ? bladeFor(fighter, spec) : null;
    if (spec.reach === 'weapon' && !blade?.held) continue;
    if (spec.limb.endsWith('Foot') || spec.limb.endsWith('Knee')) continue;
    const t = contactTime(fighter, spec);
    if (t > RIDING.lookAhead) continue;
    const shoulder = vec.add(point(fighter.x, P[`${spec.limb[0]}Shoulder`]), vec.scale(mine, t));
    const mark = vec.add(markOf(target), vec.scale(theirs, t));
    const gap = vec.sub(mark, shoulder);
    const reach = reachFromShoulder(fighter, spec) * RIDING.reachShare;
    if (vec.length(gap) > reach) continue;
    // Passing fast, the blow is timed to land as they pass nearest (abreast), not at the first moment it could reach.
    const relative = vec.sub(theirs, mine);
    const pace = vec.length(relative);
    if (pace > RIDING.passing) {
      const now = vec.sub(markOf(target), point(fighter.x, P[`${spec.limb[0]}Shoulder`]));
      const nearest = -vec.dot(now, relative) / (pace * pace);
      if (nearest > t + RIDING.early) continue;
    }
    const flat = vec.normalize([gap[0], 0, gap[2]]);
    if (forward && vec.dot(flat, forward) < -0.2) continue;
    choices[name] = weight;
    aims[name] = mark;
  }
  const move = weightedPick(choices, world.random);
  if (!move) return false;
  const spec = MOVES[move];
  if (!throwPunch(world, fighter, move, zoneOf(spec))) return false;
  const miss = fighter.punch.miss ?? [0, 0, 0];
  if (fighter.mount) {
    // From the saddle: aimed where the mark will be relative to him when it lands, in his own frame,
    // which the horse carries straight on (his shoulders held as they are on the horse's line):
    // his arm makes the blow as on foot, and the horse brings him to it.
    const t = contactTime(fighter, spec);
    fighter.punch.aim = toLocal(fighter, vec.add(vec.sub(aims[move], vec.scale(mine, t)), miss));
    fighter.punch.rideOffset = fighter.yaw - fighter.mount.yaw;
  } else {
    // Aimed where the mark will be, in the world (the aim follows as he moves), off it as his hand would be.
    fighter.punch.at = vec.add(aims[move], miss);
  }
  fighter.cooldown = RIDING.rest;
  return true;
}

/** What a rider strikes at: a man on foot below him, his head and shoulders (what is in reach from the saddle); a rider, his body. */
function markZone(opponent) {
  return opponent.mount ? 'body' : 'head';
}

/**
 * A rider's turn (in place of the AI's footwork and blows on foot).
 * `gunfight` is the AI's shooting (a mounted archer shoots as on foot,
 * riding round his man). Always handles the turn.
 */
export function ride(world, fighter, opponent, style, dt, { gunfight }) {
  const horse = fighter.mount;
  horse.goalAt = world.time;
  fighter.goTo = null;
  const me = [horse.at[0], 0, horse.at[1]];
  // Where he will be when I get there (as he goes now), not where he is.
  const now = opponent.mount ? [opponent.mount.at[0], 0, opponent.mount.at[1]] : point(opponent.x, P.pelvis);
  const theirs = groundVelocity(opponent);
  const lead = Math.min(RIDING.leadMost, Math.hypot(now[0] - me[0], now[2] - me[2]) / Math.max(4, Math.abs(horse.speed)));
  const target = vec.add(now, vec.scale(theirs, lead));
  const to = [target[0] - me[0], 0, target[2] - me[2]];
  const distance = Math.hypot(to[0], to[2]);
  const along = distance > 1e-6 ? [to[0] / distance, 0, to[2] / distance] : forwardOf(horse.yaw);
  const forward = forwardOf(horse.yaw);
  const setGoal = (heading, speed) => {
    horse.goal = { heading: steerInside(world, horse, heading), speed };
  };
  // A man down (or getting up) is let be: walk on, round him.
  if (opponent.state !== 'up') {
    setGoal(headingOf(-along[2], along[0]) , horse.paces.walk);
    return true;
  }
  // A bow: round him at a canter, his man on the bow side, shooting as on foot.
  const gun = style.ranged && fighter.weapon?.held && !fighter.weapon.spent ? style.ranged : null;
  if (gun) {
    gunfight(world, fighter, opponent, distance, gun, dt);
    const spec = RIDING.archer;
    // On the left: the heading a quarter turn clockwise of the way to him, turned in or out to keep the ring.
    const off = Math.max(-1, Math.min(1, (distance - spec.radius) / spec.radius));
    setGoal(headingOf(along[0], along[2]) - Math.PI / 2 + spec.inward * off, horse.paces.canter);
    return true;
  }
  if (style.ranged && fighter.weapon?.held) dropWeapon(world, fighter, 'dropped');
  fighter.ride ??= { phase: 'charge' };
  const ride = fighter.ride;
  const lance = style.couchedCharge && fighter.weapon?.held && fighter.weapon.kind === style.weapon ? style.couchedCharge : null;
  const ahead = vec.dot(along, forward);
  // Two riders close and going the same way: a mêlée, not a pass — he keeps beside his man (his
  // man on his weapon side) at his pace and fights there, as long as they stay together.
  const together = opponent.mount && distance < RIDING.melee.within && vec.length(vec.sub(theirs, groundVelocity(fighter))) < RIDING.melee.closing;
  if (together && !lance) {
    const leftOfLine = [-along[2], 0, along[0]];
    const beside = vec.add(target, vec.scale(leftOfLine, WORLD.mount.passMounted));
    const aim = [beside[0] - me[0], beside[2] - me[2]];
    const gap = Math.hypot(aim[0], aim[1]);
    setGoal(gap > 0.3 ? headingOf(aim[0], aim[1]) : opponent.mount.yaw, Math.max(RIDING.melee.slowest, Math.min(horse.paces.canter, vec.length(theirs) + RIDING.melee.closeIn * gap)));
    ride.phase = 'charge';
  } else if (ride.phase === 'charge') {
    // To one side of him, his weapon side (the right): pass to his left.
    const reach = Math.max(...Object.keys(style.attacks).map((name) => (MOVES[name]?.kind === 'strike' ? reachFromShoulder(fighter, MOVES[name]) : 0)), 0.7);
    // Beside a man on foot, near enough that his body is well within the reach from the shoulder (above him).
    const drop = point(fighter.x, P.rShoulder)[1] - aimPoint(opponent, markZone(opponent))[1];
    const beside = Math.sqrt(Math.max(0, (reach * WORLD.mount.passReach) ** 2 - drop * drop)) + fighter.body.lengths.shoulderSpan / 2;
    const pass = lance ? WORLD.mount.passLance : opponent.mount ? WORLD.mount.passMounted : Math.max(WORLD.mount.pass, beside);
    const leftOfLine = [-along[2], 0, along[0]];
    const passAt = vec.add(target, vec.scale(leftOfLine, pass));
    const aim = [passAt[0] - me[0], passAt[2] - me[2]];
    // Close in, the line is held (no swerve at the last moment).
    const heading = distance > 3 ? headingOf(aim[0], aim[1]) : horse.goal.heading;
    setGoal(heading, horse.paces.gallop);
    if (ahead < -0.1 || distance < 1) ride.phase = 'past';
  } else if (ride.phase === 'past') {
    // Ridden past: on, straight, until there is room to turn.
    setGoal(horse.yaw, horse.paces.gallop);
    // (Or sooner, with the arena's edge coming.)
    if (distance > WORLD.mount.wheelAt || horse.goal.heading !== horse.yaw) ride.phase = 'wheel';
  } else {
    // Wheeling round: slowed to turn, then the charge again once his man is ahead.
    setGoal(headingOf(along[0], along[2]), WORLD.mount.turnSpeed);
    if (ahead > Math.cos(0.45)) ride.phase = 'charge';
  }
  if (fighter.punch || fighter.cooldown > 0) return true;
  if (lance) {
    // The lance couched when the point is about to meet him: its carry and drive do the rest (MOVES couched).
    const spec = MOVES[lance.move];
    const mine = groundVelocity(fighter);
    const theirs = groundVelocity(opponent);
    const t = RIDING.couchAhead;
    const shoulder = vec.add(point(fighter.x, P.rShoulder), vec.scale(mine, t));
    const mark = vec.add(aimPoint(opponent, 'body'), vec.scale(theirs, t));
    if (ride.phase === 'charge' && vec.length(vec.sub(mark, shoulder)) <= reachFromShoulder(fighter, spec)) {
      if (throwPunch(world, fighter, lance.move, 'body')) fighter.cooldown = RIDING.rest;
    }
    return true;
  }
  // A blow in passing: at a man on foot, his head or body from above; at a rider, his body.
  const zone = markZone(opponent);
  strikeInPassing(world, fighter, opponent, style.attacks, (who) => aimPoint(who, zone), (spec) => (spec.zones.includes(zone) ? zone : spec.zones[0]), forward);
  return true;
}

/**
 * A man on foot against a rider: a long weapon is braced and thrust at the
 * horse's chest as it comes (it comes first: reach decides); anyone else
 * gets off its line, at a run, and strikes at what passes in reach (the
 * horse, or the rider's body). When the horse is not coming at him he goes
 * after the rider. Always handles the turn.
 */
export function standToRider(world, fighter, opponent, style, dt) {
  const horse = opponent.mount;
  const me = point(fighter.x, P.pelvis);
  const chest = aimPoint(opponent, 'horse');
  const toMe = [me[0] - chest[0], 0, me[2] - chest[2]];
  const distance = Math.hypot(toMe[0], toMe[2]);
  const towardMe = distance > 1e-6 ? [toMe[0] / distance, 0, toMe[2] / distance] : [1, 0, 0];
  const velocity = horse.velocity ?? [0, 0, 0];
  const closing = vec.dot(vec.sub(velocity, groundVelocity(fighter)), towardMe);
  const charging = closing > RIDING.charging && distance < RIDING.within;
  const long = fighter.weapon?.held && !fighter.weapon.spec.ranged && fighter.weapon.spec.length >= RIDING.brace.length;
  fighter.running = false;
  fighter.goTo = null;
  if (charging && long) {
    // Braced: he stands to it and lets it come onto the point.
    fighter.move = 0;
    fighter.strafe = 0;
  } else if (charging) {
    // Off its line: the way he is already to one side of it, at a run.
    const line = vec.normalize([velocity[0], 0, velocity[2]]);
    let side = vec.sub(toMe, vec.scale(line, vec.dot(toMe, line)));
    if (vec.length(side) < 0.2) side = [-line[2], 0, line[0]];
    side = vec.normalize(side);
    const facing = forwardOf(fighter.yaw);
    const left = leftOf(fighter.yaw);
    fighter.move = Math.max(-1, Math.min(1, vec.dot(side, facing)));
    fighter.strafe = Math.max(-1, Math.min(1, vec.dot(side, left) * 2));
    fighter.running = true;
  } else {
    // It is not coming: go to the rider, his near side.
    const rider = point(opponent.x, P.pelvis);
    const gap = Math.hypot(rider[0] - me[0], rider[2] - me[2]);
    const reach = Math.max(...Object.keys(style.attacks).map((name) => (MOVES[name]?.kind === 'strike' ? moveRange(MOVES[name], fighter.body, fighter.weapon?.held ? fighter.weapon.spec : null) : 0)), fighter.body.reach);
    fighter.move = gap > reach * 0.8 ? 1 : gap < reach * 0.4 ? -0.5 : 0;
    fighter.strafe = 0;
  }
  // The blow: at whichever comes first in reach, the horse's chest or the rider.
  const markOf = (who) => {
    const rider = aimPoint(who, 'body');
    const horseChest = aimPoint(who, 'horse');
    const shoulder = point(fighter.x, P.rShoulder);
    return long || vec.length(vec.sub(horseChest, shoulder)) < vec.length(vec.sub(rider, shoulder)) ? horseChest : rider;
  };
  const attacks = long && charging ? Object.fromEntries(Object.entries(style.attacks).filter(([name]) => MOVES[name]?.mode === 'thrust')) : style.attacks;
  strikeInPassing(world, fighter, opponent, Object.keys(attacks).length ? attacks : style.attacks, markOf, (spec) => (spec.zones.includes('body') ? 'body' : spec.zones[0]), null);
  return true;
}
