// Mounted fighting, the AI's half: how a man on a horse fights (charges:
// at his man at the gallop, a blow in passing, past, wheel round, again)
// and how a man on foot meets one (a long spear braced at the horse; anyone
// else out of its way, striking as it passes). What a blow does is the
// physics' (physics/mounted.js): the horse's speed is in the blade's.

import { P } from './body.js';
import { MOVES, STYLES, moveRange } from './moves.js';
import { aimPoint, bladeFor, dropWeapon, point, throwPunch, toLocal, WORLD } from './physics.js';
import { leanedShoulder, steerInside, turnRadius } from './physics/mounted.js';
import { vec, yawRotate } from './pose.js';

/**
 * The tunables of riding to fight.
 * - leadMost: s at most a rider leads his man (rides at where he will be).
 * - lookAhead: s ahead a rider (or a man on foot) reckons where the two of
 *   them will be when a blow he begins now lands.
 * - contactAt: the share of a swing's extension (from its windup to its
 *   full extent) at which it lands, for that reckoning (the blade is late to
 *   the mark the hand sends it to, by the wrist's turning: measured, a swing
 *   lands at its full extent); a thrust lands where its point is out (the
 *   move's `extendShare`).
 * - reachShare: of his reach from the shoulder (arm and weapon) he lets a blow go at. * - couchAhead: s before the point would meet him that the lance is couched (its carry does the rest).
 * - rest: s after a blow before the next.
 * - passing: closing faster than this (m/s), a cut waits until it would
 *   land no more than `early` s before the two are nearest (abreast); a
 *   point, driven along the line he rides at the man, goes while the man is
 *   within `cone` rad of it.
 * - archer: a horse archer (skirmish) rides round the body of men his man stands
 *   in (his side's men on foot within `body` m of him) at a canter, `standoff` m
 *   off its edge (each man's own, within `spread` of the noise's aim), the body on
 *   his left (the bow side), turning in by `inward` rad per radius off his ring (a
 *   gun from the saddle rides round its man, `gunRadius` m off); from further than
 *   `approach` rings off he rides in on a line that will pass his man on his left.
 *   He looses at a man within `range` m (Mongol and Parthian practice: aimed shots
 *   inside fifty or sixty metres; the floor is smaller) who is within his bow arm's
 *   sweep: on the bow side as far round as his shoulders turn off the horse's line
 *   (WORLD.mount.twist) and `arc.left` further with the arm, on the off side only
 *   `arc.right` off the horse's line; never past a friend within `friend` m of the
 *   line, nor past the mark within `beyond` m (a miss flies on). He never lets heavier men come to him: an enemy rider within `wary.horse` m
 *   closing faster than `closing` m/s, or a man on foot within `wary.foot` m, and he
 *   gallops away from them (the ground's edge, within `wall` m, pushing him back
 *   along it), for `away` s at least and until they are `clear` m further off; then he
 *   wheels and comes back to shoot. His quiver counted (a kit's `quiver`) and empty,
 *   with his side's train on the field, he rides back to it and is given a fresh
 *   one there (`resupply`: within `radius` m of it, `seconds` s to take it).
 * - melee: two riders within `within` m closing slower than `closing` m/s
 *   fight beside each other: he rides to his man's side, at his pace and
 *   up to `closeIn` m/s more per m he is off it (`slowest` at least while he is
 *   a metre or more from his place: arrived, he may stand, turning on the spot). Two
 *   riders slower than `still` m/s each stand and let the other come, by a draw of
 *   `standing` (a chance) every `reroll` s.
 * - brace: a man on foot with a weapon this long (m) or more stands to a
 *   charging horse with it; `charging`: a horse closing faster than this
 *   (m/s) within `within` m is a charge.
 * - dodge: a man on foot without one gets off the horse's line (running).
 * - noise: the small differences each pass is drawn with, once at the start of
 *   each charge (so two riders who would do the same thing do not): the aim line
 *   `aim` m to either side of the one he would ride, a pause before he commits
 *   of up to `pause` s (the charges of a line start a little apart), his pace
 *   `pace` slower at most (a share), the side he turns to when his man is behind
 *   him (a bias of `wheel` rad on his turn).
 * - wheel: turning more than `from` rad towards a point, he slows to a pace
 *   whose turning circle is `room` of the distance to it (a horse that cannot
 *   turn inside the circle of a man standing in it would ride round him for
 *   ever), no slower than `slowest` m/s (a step).
 * - patience: after `passes` passes, or `seconds` s, without a blow landing
 *   (on a man or his horse) a rider stops riding past and rides in beside his
 *   man at a pace that lets him strike (as two riders who are together do).
 * - assist: the player's charge (chargeAt): after the pass he rides on `through` m past his man before he wheels,
 *   and it is over once he faces him again within `face` rad (reined in there); with his man down or gone, once his
 *   horse is slower than `halted` m/s. Tapped while he steers himself, the blow alone is readied, for `ready` s.
 * - lane: friends' horses are steered clear of: a friend that will pass within
 *   `gap` m of him inside `look` s (at the speeds they have now) is ridden away
 *   from (`push` of the turn), and one ahead in his lane is not ridden up
 *   to (he eases to its pace); so are men of his own side on foot, standing
 *   within `footGap` m of his line ahead.
 */
export const RIDING = {
  lookAhead: 1.6,
  leadMost: 2,
  contactAt: 1,
  reachShare: 0.8,
  couchAhead: 0.9,
  rest: 0.35,
  passing: 3, early: 0.06, cone: 0.8,
  archer: {
    gunRadius: 11, inward: 0.6,
    standoff: 30, spread: 0.5, body: 12, approach: 1.6, range: 60,
    wary: { horse: 20, foot: 8 }, closing: 1.5, clear: 8, away: 2.5, wall: 10, crowd: 8, crowdPush: 0.8,
    arc: { left: 0.35, right: 0.5 },
    friend: 2.2, beyond: 15,
    resupply: { radius: 3, seconds: 6 },
  },
  melee: { within: 4, closing: 4, slowest: 1.5, closeIn: 1.5, still: 2, standing: 0.5, reroll: 3 },
  brace: { length: 1.8 },
  charging: 3, within: 14,
  noise: { aim: 0.3, pause: 0.6, pace: 0.1, wheel: 0.3 },
  wheel: { room: 0.45, from: 0.3, slowest: 0.5 },
  patience: { passes: 3, seconds: 25 },
  lane: { gap: 2.6, look: 1.6, push: 1.8, footGap: 1.6 },
  assist: { through: 8, face: 0.45, halted: 0.5, ready: 4 },
};

const aheadOf = (yaw) => yawRotate([1, 0, 0], yaw);
const leftwardOf = (yaw) => yawRotate([0, 0, 1], yaw);
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

/**
 * The small differences of one pass, drawn at the start of it (the only
 * randomness of a rider's approach, so a seed gives the same fight): which side he
 * turns to, how far off his line he rides, how soon he commits, how hard he rides.
 */
function drawPass(world, ride, now) {
  const random = world.random;
  const noise = RIDING.noise;
  ride.plan = { aim: (random() * 2 - 1) * noise.aim, side: random() < 0.5 ? -1 : 1, pace: 1 - random() * noise.pace };
  ride.holdUntil = now + random() * noise.pause;
}

/** Whether a rider has landed a blow (or struck his man's horse) since he last looked; keeps count of passes and time without one. */
function keepPatience(world, fighter, ride) {
  const made = fighter.stats.landed + fighter.stats.blocked + fighter.stats.struckHorse;
  if (ride.made === undefined || made !== ride.made) {
    ride.made = made;
    ride.since = world.time;
    ride.passes = 0;
  }
  return ride.passes >= RIDING.patience.passes || world.time - ride.since > RIDING.patience.seconds;
}

/**
 * A heading and pace turned clear of his side's other horses: each friend whose
 * path, carried on as it goes now, will pass within `lane.gap` of his own inside
 * `lane.look` s pushes him across (away from it; to the side he turns to if it is
 * dead ahead) and, if it is ahead in his lane, holds him to its pace.
 */
function keepLane(world, fighter, heading, speed) {
  const horse = fighter.mount;
  const lane = RIDING.lane;
  const wanted = aheadOf(heading);
  const left = leftwardOf(heading);
  const mine = horse.velocity ?? [0, 0, 0];
  let across = 0;
  let pace = speed;
  for (const other of world.horses) {
    if (other === horse || other.corner !== horse.corner) continue;
    const theirs = other.velocity ?? [0, 0, 0];
    const gap = [other.at[0] - horse.at[0], other.at[1] - horse.at[1]];
    const relative = [theirs[0] - mine[0], theirs[2] - mine[2]];
    const closing = relative[0] * relative[0] + relative[1] * relative[1];
    const when = closing > 1e-6 ? Math.max(0, Math.min(lane.look, -(gap[0] * relative[0] + gap[1] * relative[1]) / closing)) : 0;
    const there = [gap[0] + relative[0] * when, gap[1] + relative[1] * when];
    const apart = Math.hypot(there[0], there[1]);
    if (apart >= lane.gap) continue;
    // Which side of his way it will be: pushed to the other. Dead ahead, the side he has drawn for this pass.
    const sideways = there[0] * left[0] + there[1] * left[2];
    const urgency = (1 - apart / lane.gap) * (1 - 0.5 * when / lane.look);
    const sign = Math.abs(sideways) < 0.3 ? fighter.ride?.plan?.side ?? 1 : -Math.sign(sideways);
    across += sign * urgency;
    // Ahead of him in his lane (not beside): no faster than it goes.
    const ahead = gap[0] * wanted[0] + gap[1] * wanted[2];
    if (ahead > 0 && Math.abs(sideways) < lane.gap * 0.5) pace = Math.min(pace, Math.max(horse.paces.walk, Math.hypot(theirs[0], theirs[2]) + 0.5 * Math.max(0, ahead - 2.4)));
  }
  // Men of his own side on foot (a rider unhorsed, the foot of his line) are steered round as well, as they stand.
  for (const man of world.fighters) {
    if (man.mount || man.corner !== horse.corner || man.state === 'out') continue;
    const at = point(man.x, P.pelvis);
    const gap = [at[0] - horse.at[0], at[2] - horse.at[1]];
    const ahead = gap[0] * wanted[0] + gap[1] * wanted[2];
    const sideways = gap[0] * left[0] + gap[1] * left[2];
    if (ahead < 0 || ahead > lane.look * Math.max(4, Math.abs(horse.speed)) || Math.abs(sideways) >= lane.footGap) continue;
    const sign = Math.abs(sideways) < 0.3 ? fighter.ride?.plan?.side ?? 1 : -Math.sign(sideways);
    across += sign * (1 - Math.abs(sideways) / lane.footGap) * Math.max(0, 1 - ahead / (lane.look * Math.max(4, Math.abs(horse.speed))));
  }
  if (across === 0) return { heading, speed: pace };
  const push = Math.max(-1, Math.min(1, across)) * lane.push;
  const turned = [wanted[0] + left[0] * push, wanted[2] + left[2] * push];
  return { heading: headingOf(turned[0], turned[1]), speed: pace };
}

/** The pace to turn at, slowed until his turning circle fits inside the room he has to his man. */
function wheelPace(horse, distance) {
  const room = distance * RIDING.wheel.room;
  let pace = WORLD.mount.turnSpeed;
  while (pace > RIDING.wheel.slowest && turnRadius(horse, pace) > room) pace = Math.max(RIDING.wheel.slowest, pace * 0.85);
  return pace;
}

/** From the shoulder, how far a move reaches: the arm and, with a weapon, the weapon. */
function reachFromShoulder(fighter, spec) {
  const L = fighter.body.lengths;
  const arm = L.upperArm + L.forearmToFist;
  const blade = spec.path === 'blade' ? bladeFor(fighter, spec) : null;
  if (spec.reach === 'weapon' && blade?.held) return arm + (blade.spec.reach ?? blade.spec.length * (spec.mode === 'thrust' ? 0.95 : 0.9));
  return arm;
}

/** When a move begun now lands (s), or one `from` s into it has left to land: its windup and part of its extension, at his pace with the weapon. */
export function contactTime(fighter, spec, from = 0) {
  const blade = spec.path === 'blade' ? bladeFor(fighter, spec) : null;
  const pace = blade?.held ? (blade.handling?.speed ?? 1) : 1;
  const heavy = blade?.held ? Math.max(1, Math.sqrt(blade.spec.mass / WORLD.weapons.heavyFrom)) : 1;
  const at = spec.windup + (spec.mode === 'thrust' ? spec.extendShare ?? 0.75 : RIDING.contactAt) * (spec.extendUntil - spec.windup);
  return (Math.max(0, spec.windup - from) * heavy + Math.max(0, at - Math.max(from, spec.windup))) / pace;
}

/**
 * A blow from the saddle steered on while it is in the air: aimed (in his own
 * frame, which the horse carries) at where his man will be when the blade
 * gets there, reckoned from where he is now and the time it has left. The
 * first reckoning, at the throw, is out by what the man did since, and by
 * the hand's and the wrist's lag; this one closes in as the blow does.
 */
export function steerBlow(fighter, opponent) {
  const punch = fighter.punch;
  const spec = punch?.spec;
  if (!spec || spec.path !== 'blade' || spec.couched || punch.at || punch.target !== opponent.id || punch.load > 0) return;
  const left = contactTime(fighter, spec, punch.t);
  // (Past the moment the aim is passed through, it is left as it was.)
  if (left <= 0) return;
  const ahead = vec.scale(vec.sub(groundVelocity(opponent), groundVelocity(fighter)), left);
  punch.aim = toLocal(fighter, vec.add(vec.add(aimPoint(opponent, punch.zone), ahead), punch.miss ?? [0, 0, 0]));
}

/**
 * A blow that will land as the two of them pass: for each move of his
 * style, where his shoulder and his mark will be when it lands (both
 * carried on as they go now), and whether it reaches then, in front of or
 * beside him (not behind). Thrown, it is aimed at where the mark will be.
 * `markOf(target)` is the point aimed at. A rider draws his move for the
 * pass by his style's weights and makes it when its moment comes (a point
 * while his man is still ahead, a cut as they pass abreast).
 */
function strikeInPassing(world, fighter, target, attacks, markOf, zoneOf, forward) {
  if (fighter.punch || fighter.cooldown > 0) return false;
  const usable = {};
  const choices = {};
  const aims = {};
  const mine = groundVelocity(fighter);
  const theirs = groundVelocity(target);
  const ride = fighter.mount ? fighter.ride : null;
  for (const [name, weight] of Object.entries(attacks)) {
    const spec = MOVES[name];
    if (!spec || spec.kind !== 'strike' || spec.with || spec.path === 'aim') continue;
    const blade = spec.path === 'blade' ? bladeFor(fighter, spec) : null;
    if (spec.reach === 'weapon' && !blade?.held) continue;
    if (spec.limb.endsWith('Foot') || spec.limb.endsWith('Knee')) continue;
    const t = contactTime(fighter, spec);
    if (t > RIDING.lookAhead) continue;
    usable[name] = weight;
    const mark = vec.add(markOf(target), vec.scale(theirs, t));
    // (From the saddle, from where his shoulder goes leaning out to the mark: physics/mounted.js saddleReach.)
    const sitting = point(fighter.x, P[`${spec.limb[0]}Shoulder`]);
    const leaning = fighter.mount && spec.path === 'blade' && !spec.couched;
    const shoulder = vec.add(leaning ? leanedShoulder(fighter, sitting, vec.sub(mark, vec.scale(mine, t))) : sitting, vec.scale(mine, t));
    const gap = vec.sub(mark, shoulder);
    const reach = reachFromShoulder(fighter, spec) * RIDING.reachShare;
    if (vec.length(gap) > reach) continue;
    // Passing fast, the blow is timed to land as they pass nearest (abreast), not at the first moment it could reach.
    const relative = vec.sub(theirs, mine);
    const pace = vec.length(relative);
    if (pace > RIDING.passing) {
      if (spec.mode === 'thrust') {
        // A point is driven along the line he rides at his man (that is where the horse's speed is in it): it
        // lands while the man is still ahead, no more than `cone` off that line, not across it at the pass.
        if (vec.dot(vec.normalize(gap), vec.scale(relative, -1 / pace)) < Math.cos(RIDING.cone)) continue;
      } else {
        const now = vec.sub(markOf(target), point(fighter.x, P[`${spec.limb[0]}Shoulder`]));
        const nearest = -vec.dot(now, relative) / (pace * pace);
        if (nearest > t + RIDING.early) continue;
      }
    }
    const flat = vec.normalize([gap[0], 0, gap[2]]);
    if (forward && vec.dot(flat, forward) < -0.2) continue;
    choices[name] = weight;
    aims[name] = mark;
  }
  let move;
  if (ride) {
    // His move for the pass, drawn by his style's weights (not whichever comes into its moment first), made when its moment comes.
    ride.pick ??= weightedPick(usable, world.random);
    // Close and slow (a mêlée, not a pass): a move that cannot be made from here is not waited for; he draws again from those that can.
    if (choices[ride.pick] === undefined && vec.length(vec.sub(theirs, mine)) <= RIDING.passing && Object.keys(choices).length) ride.pick = weightedPick(choices, world.random);
    move = choices[ride.pick] === undefined ? null : ride.pick;
  } else move = weightedPick(choices, world.random);
  if (!move) return false;
  const spec = MOVES[move];
  if (!throwPunch(world, fighter, move, zoneOf(spec))) return false;
  if (ride) ride.pick = null;
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

/** From the shoulder, the furthest any strike of his style reaches (0.7 m at least). */
function styleReach(fighter, style) {
  return Math.max(...Object.keys(style.attacks).map((name) => (MOVES[name]?.kind === 'strike' ? reachFromShoulder(fighter, MOVES[name]) : 0)), 0.7);
}

/**
 * How far to one side of his man (m) a rider rides his line: beside a man on foot, near enough that his body is well
 * within the reach from the shoulder (above him: WORLD.mount.passReach of it), and no nearer than `pass`; a rider,
 * `passMounted`; with a couched lance, `passLance`.
 */
function passWidth(fighter, opponent, style, lance) {
  if (lance) return WORLD.mount.passLance;
  if (opponent.mount) return WORLD.mount.passMounted;
  const drop = point(fighter.x, P.rShoulder)[1] - aimPoint(opponent, markZone(opponent))[1];
  const beside = Math.sqrt(Math.max(0, (styleReach(fighter, style) * WORLD.mount.passReach) ** 2 - drop * drop)) + fighter.body.lengths.shoulderSpan / 2;
  return Math.max(WORLD.mount.pass, beside);
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
  const along = distance > 1e-6 ? [to[0] / distance, 0, to[2] / distance] : aheadOf(horse.yaw);
  const forward = aheadOf(horse.yaw);
  // (The way he rides is turned clear of his friends' horses, and from the arena's edge.)
  // Turning towards a point `room` m off, he is slowed to a pace his turning circle fits inside (a horse that rides round and round a point it cannot turn inside never gets there).
  const setGoal = (heading, speed, room = Infinity) => {
    let off = heading - horse.yaw;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    if (Math.abs(off) > RIDING.wheel.from) speed = Math.min(speed, wheelPace(horse, room));
    const clear = keepLane(world, fighter, heading, speed);
    horse.goal = { heading: steerInside(world, horse, clear.heading), speed: clear.speed };
  };
  // A man down (or getting up) is let be: walk on, round him.
  if (opponent.state !== 'up') {
    setGoal(headingOf(-along[2], along[0]) , horse.paces.walk);
    return true;
  }
  // A bow (a gun) from the saddle: the horse archer's way of fighting (skirmish).
  const gun = style.ranged && fighter.weapon?.held && !fighter.weapon.spent ? style.ranged : null;
  if (gun && fighter.weapon.spec.bow) {
    skirmish(world, fighter, opponent, gun, distance, along, setGoal);
    return true;
  }
  if (gun) {
    // A gun (the three-eyed gun): round him at a canter, his man on the bow side, shooting as on foot.
    gunfight(world, fighter, opponent, distance, gun, dt);
    const spec = RIDING.archer;
    fighter.ride ??= { phase: 'charge' };
    if (!fighter.ride.plan) drawPass(world, fighter.ride, world.time);
    // On the left: the heading a quarter turn clockwise of the way to him, turned in or out to keep the ring (his own, a little different each).
    const radius = spec.gunRadius * (1 + fighter.ride.plan.aim);
    const off = Math.max(-1, Math.min(1, (distance - radius) / radius));
    setGoal(headingOf(along[0], along[2]) - Math.PI / 2 + spec.inward * off, horse.paces.canter);
    return true;
  }
  // Out of arrows, with his side's train on the field (a level's `train`: the camels with fresh sheaves): back to it for more.
  if (style.ranged && fighter.weapon?.held && fighter.weapon.spec.bow && world.trains?.[fighter.corner]) {
    resupply(world, fighter, setGoal, dt);
    return true;
  }
  if (style.ranged && fighter.weapon?.held) dropWeapon(world, fighter, 'dropped');
  fighter.ride ??= { phase: 'charge' };
  const ride = fighter.ride;
  if (!ride.plan) drawPass(world, ride, world.time);
  const lance = style.couchedCharge && fighter.weapon?.held && fighter.weapon.kind === style.weapon ? style.couchedCharge : null;
  const ahead = vec.dot(along, forward);
  const impatient = keepPatience(world, fighter, ride);
  // To one side of him, his weapon side (the right): pass to his left.
  const reach = styleReach(fighter, style);
  const pass = passWidth(fighter, opponent, style, lance);
  const leftOfLine = [-along[2], 0, along[0]];
  // Two riders close and going the same way: a mêlée, not a pass — he keeps beside his man (his
  // man on his weapon side) at his pace and fights there, as long as they stay together. So does a
  // rider who has ridden past his man and not struck him, three times or for long enough: he rides in beside him.
  const together = !lance && ((opponent.mount && distance < RIDING.melee.within && vec.length(vec.sub(theirs, groundVelocity(fighter))) < RIDING.melee.closing) || impatient);
  if (together) {
    const alongside = vec.add(target, vec.scale(leftOfLine, pass));
    const aim = [alongside[0] - me[0], alongside[2] - me[2]];
    const gap = Math.hypot(aim[0], aim[1]);
    // His man in reach of his blade from where he is: he stops and turns on the spot to put him on his weapon side (a horse that
    // must keep walking circles a metre across round a man standing in them never gets within reach). Two riders slowly
    // chasing places beside one another ride round and round: each takes it in turns (drawn, every few seconds) to stand and
    // let the other come.
    const shoulder = point(fighter.x, P.rShoulder);
    const mark = aimPoint(opponent, markZone(opponent));
    if (opponent.mount && world.time >= (ride.rollAt ?? 0)) {
      ride.stand = world.random() < RIDING.melee.standing;
      ride.rollAt = world.time + RIDING.melee.reroll;
    }
    const stand = opponent.mount && ride.stand && vec.length(theirs) < RIDING.melee.still;
    if (stand || Math.hypot(mark[0] - shoulder[0], mark[1] - shoulder[1], mark[2] - shoulder[2]) <= reach * RIDING.reachShare) setGoal(Math.atan2(-along[0], -along[2]), 0);
    else setGoal(gap > 0.3 ? headingOf(aim[0], aim[1]) : opponent.mount?.yaw ?? horse.yaw, Math.max(RIDING.melee.slowest * Math.min(1, gap), Math.min(horse.paces.canter, vec.length(theirs) + RIDING.melee.closeIn * gap)), gap);
    ride.phase = 'charge';
  } else if (ride.phase === 'charge') {
    // Each charge on a line of its own, a little off the one he would ride, and a little less than flat out.
    const passAt = vec.add(target, vec.scale(leftOfLine, pass + ride.plan.aim * (lance ? 0.3 : 1)));
    const aim = [passAt[0] - me[0], passAt[2] - me[2]];
    // Close in, the line is held (no swerve at the last moment).
    const heading = distance > 3 ? headingOf(aim[0], aim[1]) : horse.goal.heading;
    setGoal(heading, world.time < ride.holdUntil ? 0 : horse.paces.gallop * ride.plan.pace);
    if (ahead < -0.1 || distance < 1) {
      ride.phase = 'past';
      ride.pick = null;
      ride.passes += 1;
    }
  } else if (ride.phase === 'past') {
    // Ridden past: on, straight, until there is room to turn.
    setGoal(horse.yaw, horse.paces.gallop);
    // (Or sooner, with the arena's edge coming.)
    if (distance > WORLD.mount.wheelAt || horse.goal.heading !== horse.yaw) {
      ride.phase = 'wheel';
      drawPass(world, ride, world.time);
    }
  } else {
    // Wheeling round (to the side he has drawn if his man is behind him): slowed to a pace his turning circle fits the room he has,
    // then the charge again once his man is ahead (and he has made up his mind).
    const turning = Math.atan2(-along[2], along[0]) - ride.plan.side * (ahead < 0 ? RIDING.noise.wheel : 0);
    setGoal(turning, WORLD.mount.turnSpeed, distance);
    if (ahead > Math.cos(0.45) && world.time >= ride.holdUntil) ride.phase = 'charge';
  }
  if (fighter.punch) steerBlow(fighter, opponent);
  if (fighter.punch || fighter.cooldown > 0) return true;
  if (lance) {
    if (ride.phase === 'charge') couchLance(world, fighter, opponent, lance);
    return true;
  }
  // A blow in passing: at a man on foot, his head or body from above; at a rider, his body.
  const zone = markZone(opponent);
  strikeInPassing(world, fighter, opponent, style.attacks, (who) => aimPoint(who, zone), (spec) => (spec.zones.includes(zone) ? zone : spec.zones[0]), forward);
  return true;
}

/** The way from one floor point to another as a heading, and how far. */
function bearing(from, to) {
  return { heading: headingOf(to[0] - from[0], to[2] - from[2]), distance: Math.hypot(to[0] - from[0], to[2] - from[2]) };
}

/** Where a man stands on the floor (his horse's place, if he rides). */
function standingAt(fighter) {
  return fighter.mount ? [fighter.mount.at[0], 0, fighter.mount.at[1]] : point(fighter.x, P.pelvis);
}

/**
 * The enemies a horse archer will not let come to him: riders within
 * `wary.horse` m closing on him faster than `closing` m/s (or near enough that
 * they need not), men on foot within `wary.foot` m. Returns them, each with its
 * distance and the way from it to him, nearest first.
 */
function threatsTo(world, fighter, spec) {
  const me = standingAt(fighter);
  const mine = groundVelocity(fighter);
  const threats = [];
  for (const other of world.fighters) {
    if (other.corner === fighter.corner || other.state !== 'up' || other.fled || other.panicked) continue;
    const at = standingAt(other);
    const away = [me[0] - at[0], 0, me[2] - at[2]];
    const distance = Math.hypot(away[0], away[2]) || 1e-6;
    const unit = vec.scale(away, 1 / distance);
    if (other.mount) {
      if (other.mount.state !== 'up' || distance > spec.wary.horse) continue;
      const closing = vec.dot(vec.sub(groundVelocity(other), mine), unit);
      if (closing < spec.closing && distance > spec.wary.horse * 0.4) continue;
    } else if (distance > spec.wary.foot) continue;
    threats.push({ other, distance, unit });
  }
  return threats.sort((a, b) => a.distance - b.distance);
}

/**
 * Away from them: each pushes him straight off it, the nearer the harder; the
 * floor's edge within `wall` m pushes him back inside, so he runs along it
 * rather than into the corner; a horse of his own side within `crowd` m pushes him
 * off it (up to `crowdPush` of the threats' push), so he does not turn about into
 * the rank behind him. A heading.
 */
function awayFrom(world, fighter, threats, spec) {
  const me = standingAt(fighter);
  let push = [0, 0];
  for (const threat of threats) {
    const weight = 1 / Math.max(1, threat.distance);
    push = [push[0] + threat.unit[0] * weight, push[1] + threat.unit[2] * weight];
  }
  const scale = Math.hypot(push[0], push[1]) || 1;
  push = [push[0] / scale, push[1] / scale];
  // His own side's horses near him are ridden round, not into (turning about at the gallop into the rank behind him).
  const horse = fighter.mount;
  for (const other of world.horses) {
    if (other === horse || other.corner !== horse.corner || other.state !== 'up') continue;
    const gap = [me[0] - other.at[0], me[2] - other.at[1]];
    const apart = Math.hypot(gap[0], gap[1]);
    if (apart > spec.crowd || apart < 1e-6) continue;
    const weight = (1 - apart / spec.crowd) * spec.crowdPush;
    push = [push[0] + (gap[0] / apart) * weight, push[1] + (gap[1] / apart) * weight];
  }
  const arena = world.arena;
  const wall = (offset, half) => Math.max(0, (Math.abs(offset) - (half - spec.wall)) / spec.wall) * -Math.sign(offset);
  push = [push[0] + wall(me[0], arena.halfX), push[1] + wall(me[2], arena.halfZ)];
  return headingOf(push[0], push[1]);
}

/** Off the horse's line (rad, + to his left, the bow side) the way to a point lies. */
function offTheLine(fighter, at) {
  const from = standingAt(fighter);
  let off = headingOf(at[0] - from[0], at[2] - from[2]) - fighter.mount.yaw;
  off = Math.atan2(Math.sin(off), Math.cos(off));
  return off;
}

/** No friend of his within `friend` m of the arrow's line, short of the mark or `beyond` m past it. */
function clearShot(world, fighter, target, spec) {
  const from = point(fighter.x, P.pelvis);
  const to = point(target.x, P.pelvis);
  const line = [to[0] - from[0], 0, to[2] - from[2]];
  const length = Math.hypot(line[0], line[2]) || 1e-6;
  const unit = vec.scale(line, 1 / length);
  return !world.fighters.some((mate) => {
    if (mate === fighter || mate.corner !== fighter.corner || mate.state === 'out') return false;
    const at = standingAt(mate);
    const offset = [at[0] - from[0], 0, at[2] - from[2]];
    const along = vec.dot(offset, unit);
    // (Short of the mark, or beyond it within `beyond` m: an arrow that misses flies on.)
    return along > 0 && along < length + spec.beyond && Math.hypot(offset[0] - unit[0] * along, offset[2] - unit[2] * along) < spec.friend;
  });
}

/**
 * The body of men a man stands in, as a horse archer rides round it: the
 * middle of his side's men on foot within `body` m of him (or of him alone, a
 * rider or a man on his own), and how far its furthest man stands from that
 * middle (m).
 */
function bodyOf(world, man, spec) {
  const at = standingAt(man);
  if (man.mount) return { at, radius: 0 };
  const near = world.fighters.filter((other) => other.corner === man.corner && !other.mount && other.state !== 'out' && !other.fled && Math.hypot(other.x[P.pelvis * 3] - at[0], other.x[P.pelvis * 3 + 2] - at[2]) < spec.body);
  const middle = near.reduce((sum, other) => [sum[0] + other.x[P.pelvis * 3] / near.length, 0, sum[2] + other.x[P.pelvis * 3 + 2] / near.length], [0, 0, 0]);
  const radius = Math.max(0, ...near.map((other) => Math.hypot(other.x[P.pelvis * 3] - middle[0], other.x[P.pelvis * 3 + 2] - middle[2])));
  return { at: middle, radius };
}

/**
 * The horse archer: he rides round his man at a canter and shoots, never
 * lets heavier men come to him, and wheels back once they are left behind
 * (RIDING.archer). The arrow is aimed where the man will be against the
 * horse's own way (physics/ranged.js leadFor), loosed in the stride's
 * stillness (SADDLE_SPREAD), and carried at the horse's speed.
 */
function skirmish(world, fighter, opponent, gun, distance, along, setGoal) {
  const spec = RIDING.archer;
  const horse = fighter.mount;
  fighter.ride ??= { phase: 'charge' };
  const ride = fighter.ride;
  if (!ride.plan) drawPass(world, ride, world.time);
  const threats = threatsTo(world, fighter, spec);
  const nearest = threats[0]?.distance ?? Infinity;
  if (threats.length) {
    ride.away = true;
    ride.awayUntil = world.time + spec.away;
  } else if (ride.away && world.time >= ride.awayUntil && !threatsTo(world, fighter, { ...spec, wary: { horse: spec.wary.horse + spec.clear, foot: spec.wary.foot + spec.clear } }).length) ride.away = false;
  if (ride.away) {
    // Off at the gallop, away from what is coming (the last way he had, once it is behind him and he has not yet the room to turn).
    if (threats.length) ride.awayHeading = awayFrom(world, fighter, threats, spec);
    setGoal(ride.awayHeading ?? horse.yaw, horse.paces.gallop);
  } else {
    // His ring round the body of men his man stands in (all of his side's riders round the same body go round it
    // together, the same way, none crossing another's ring), `standoff` m off its edge (his own distance, a little
    // different each), the body on his left: from far off, in on a line that will pass it there; on the ring, a
    // quarter turn clockwise of the way to its middle, turned in or out to keep it.
    const body = bodyOf(world, opponent, spec);
    const radius = (body.radius + spec.standoff) * (1 + ride.plan.aim * spec.spread);
    const to = [body.at[0] - horse.at[0], body.at[2] - horse.at[1]];
    const apart = Math.hypot(to[0], to[1]) || 1e-6;
    const toward = headingOf(to[0], to[1]);
    if (apart > radius * spec.approach) setGoal(toward - Math.asin(Math.min(1, radius / apart)), horse.paces.canter);
    else {
      const off = Math.max(-1, Math.min(1, (apart - radius) / radius));
      setGoal(toward - Math.PI / 2 + spec.inward * off, horse.paces.canter);
    }
  }
  // The shot: any man in range within the sweep of his bow arm; his own man first, else whoever is nearest of those he can.
  fighter.aimAt = undefined;
  if (fighter.punch || fighter.cooldown > 0) return;
  const reachable = (other) => {
    if (other.corner === fighter.corner || other.state !== 'up' || other.fled) return false;
    const mark = aimPoint(other, 'body');
    const from = point(fighter.x, P.pelvis);
    if (Math.hypot(mark[0] - from[0], mark[2] - from[2]) > spec.range) return false;
    const off = offTheLine(fighter, mark);
    return off <= WORLD.mount.twist + spec.arc.left && off >= -spec.arc.right && clearShot(world, fighter, other, spec);
  };
  let target = reachable(opponent) ? opponent : null;
  if (!target) {
    let best = Infinity;
    for (const other of world.fighters) {
      if (other === opponent || !reachable(other)) continue;
      const apart = bearing(standingAt(fighter), standingAt(other)).distance;
      if (apart < best) {
        best = apart;
        target = other;
      }
    }
  }
  if (!target) return;
  const zone = world.random() < gun.headShare ? 'head' : 'body';
  // (Turned to his mark for the shot: the punch's target is who it is aimed at.)
  if (target !== opponent) fighter.focus = target.id;
  if (throwPunch(world, fighter, gun.move ?? 'loose', zone)) {
    fighter.punch.quick = true;
    fighter.cooldown = gun.between[0] + world.random() * gun.between[1];
    ride.shotAt = world.time;
    ride.nearest = nearest;
  }
}

/**
 * Out of arrows, back to his side's train (world.trains: where the level puts
 * it, behind its own end of the field) for a fresh quiver: there, slowed to a
 * stand, it takes him `resupply.seconds` s. Still kept clear of anyone coming at
 * him on the way.
 */
function resupply(world, fighter, setGoal, dt) {
  const spec = RIDING.archer;
  const horse = fighter.mount;
  const train = world.trains[fighter.corner];
  const there = bearing(standingAt(fighter), [train.at[0], 0, train.at[1]]);
  const threats = threatsTo(world, fighter, spec);
  if (threats.length && there.distance > spec.resupply.radius) {
    setGoal(awayFrom(world, fighter, threats, spec), horse.paces.gallop);
    return;
  }
  if (there.distance > spec.resupply.radius) {
    fighter.refilling = 0;
    setGoal(there.heading, there.distance > 12 ? horse.paces.gallop : horse.paces.trot);
    return;
  }
  setGoal(horse.yaw, 0);
  fighter.refilling = (fighter.refilling ?? 0) + dt;
  if (fighter.refilling < spec.resupply.seconds) return;
  fighter.refilling = 0;
  fighter.arrows = fighter.body.gear.quiver;
  fighter.weapon.spent = false;
  world.events.push({ time: world.time, kind: 'resupplied', fighter: fighter.id, effects: ['a fresh quiver from the train'] });
}

/** The lance couched when the point is about to meet him: its carry and drive do the rest (MOVES couched). True if it was. */
function couchLance(world, fighter, opponent, lance) {
  const spec = MOVES[lance.move];
  const mine = groundVelocity(fighter);
  const theirs = groundVelocity(opponent);
  const t = RIDING.couchAhead;
  const shoulder = vec.add(point(fighter.x, P.rShoulder), vec.scale(mine, t));
  const mark = vec.add(aimPoint(opponent, 'body'), vec.scale(theirs, t));
  if (vec.length(vec.sub(mark, shoulder)) > reachFromShoulder(fighter, spec) || !throwPunch(world, fighter, lance.move, 'body')) return false;
  fighter.cooldown = RIDING.rest;
  return true;
}

/**
 * The player's charge (control.js chargeOrder: the attack tapped at a man while he rides): the rider's part of the
 * charge as the riding AI rides it, at the one man. Phases (`charge.phase`):
 * - 'charge': at him at the gallop, on the line that passes him on the weapon side (passWidth, as ride()), and the
 *   blow when its moment comes (blowInPassing), leaning out to him as far as the blade needs (physics/mounted.js
 *   saddleReach). Ridden past him (or the blow made beside him at a walk), on to:
 * - 'past': on through, easing to a canter, until he is `assist.through` m behind;
 * - 'wheel': round to face him again, slowed to a pace whose turning circle fits (wheelPace). Facing him within
 *   `assist.face` rad, he is reined in and the charge is over.
 * A man down, out or gone: reined in where he is, and over once the horse stands (`assist.halted` m/s).
 * Tapped while the player is steering (`charge.reins` false), the horse stays his: only the blow is readied, made
 * when its moment comes as he rides past the man (asked for too late for it, with the man abreast or past, it is made
 * at once all the same), and given up after `assist.ready` s without one.
 * Sets the horse's goal (with the reins); returns whether the charge goes on (false: done, and `charge.end` says how
 * it ended: 'wheeled', 'beside', 'halted', 'struck', 'late' or 'lapsed').
 */
export function chargeAt(world, fighter, charge) {
  const horse = fighter.mount;
  const spec = RIDING.assist;
  const opponent = world.fighters[charge.target];
  if (fighter.punch && opponent) steerBlow(fighter, opponent);
  const style = STYLES[fighter.style] ?? STYLES.mix;
  const lance = style.couchedCharge && fighter.weapon?.held && fighter.weapon.kind === style.weapon ? style.couchedCharge : null;
  if (!charge.reins) {
    // Only the blow: made as he passes, steered on to him while it goes; over once it is, or given up.
    if (!charge.struck && opponent?.state === 'up' && world.time - charge.at <= spec.ready) {
      blowInPassing(world, fighter, charge, opponent, style, lance);
      // Asked for too late for its moment (he will be abreast before a blow begun now could land): made at once all the same, at him.
      const to = vec.sub(point(opponent.x, P.pelvis), point(fighter.x, P.pelvis));
      const asked = MOVES[charge.move];
      const late = vec.dot(to, aheadOf(fighter.mount.yaw)) < Math.abs(fighter.mount.speed) * (asked?.kind === 'strike' ? contactTime(fighter, asked) : 0);
      if (!charge.struck && !fighter.punch && fighter.cooldown <= 0 && late) {
        charge.struck = throwPunch(world, fighter, charge.move, charge.zone);
        charge.late = charge.struck;
      }
    }
    if (fighter.punch && charge.struck) return true;
    charge.end = charge.struck ? (charge.late ? 'late' : 'struck') : 'lapsed';
    return !charge.struck && opponent?.state === 'up' && world.time - charge.at <= spec.ready;
  }
  horse.goalAt = world.time;
  fighter.goTo = null;
  fighter.move = 0;
  fighter.strafe = 0;
  if (!opponent || opponent.state !== 'up') {
    charge.phase = 'halt';
    horse.goal = { heading: horse.yaw, speed: 0 };
    if (fighter.punch || Math.abs(horse.speed) > spec.halted) return true;
    charge.end = 'halted';
    return false;
  }
  const me = [horse.at[0], 0, horse.at[1]];
  const now = opponent.mount ? [opponent.mount.at[0], 0, opponent.mount.at[1]] : point(opponent.x, P.pelvis);
  const theirs = groundVelocity(opponent);
  const lead = Math.min(RIDING.leadMost, Math.hypot(now[0] - me[0], now[2] - me[2]) / Math.max(4, Math.abs(horse.speed)));
  const target = vec.add(now, vec.scale(theirs, lead));
  const to = [target[0] - me[0], 0, target[2] - me[2]];
  const distance = Math.hypot(to[0], to[2]);
  const along = distance > 1e-6 ? [to[0] / distance, 0, to[2] / distance] : aheadOf(horse.yaw);
  const forward = aheadOf(horse.yaw);
  const ahead = vec.dot(along, forward);
  const toward = headingOf(along[0], along[2]);
  const setGoal = (heading, speed, room = Infinity) => {
    let off = heading - horse.yaw;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    if (Math.abs(off) > RIDING.wheel.from) speed = Math.min(speed, wheelPace(horse, room));
    const clear = keepLane(world, fighter, heading, speed);
    horse.goal = { heading: steerInside(world, horse, clear.heading), speed: clear.speed };
  };
  if (charge.phase === 'charge') {
    // His near side, on his weapon side, at the room the riding AI gives a pass (ride()).
    const passAt = vec.add(target, vec.scale([-along[2], 0, along[0]], passWidth(fighter, opponent, style, lance)));
    // (Close in, the line is held: no swerve at the last moment.)
    setGoal(distance > 3 ? headingOf(passAt[0] - me[0], passAt[2] - me[2]) : horse.goal.heading, horse.paces.gallop);
    if (!charge.struck) blowInPassing(world, fighter, charge, opponent, style, lance);
    if (ahead < -0.1 || distance < 1) charge.phase = 'past';
    // The blow made beside him at a walk (he was there already): nothing to ride through, it is over once it is.
    else if (charge.struck && !fighter.punch && Math.abs(horse.speed) < RIDING.passing) {
      horse.goal = { heading: horse.yaw, speed: 0 };
      charge.end = 'beside';
      return false;
    }
  } else if (charge.phase === 'past') {
    setGoal(horse.yaw, horse.paces.canter);
    if (distance > spec.through || horse.goal.heading !== horse.yaw) charge.phase = 'wheel';
  } else {
    setGoal(toward, WORLD.mount.turnSpeed, distance);
    if (ahead > Math.cos(spec.face) && !fighter.punch) {
      horse.goal = { heading: toward, speed: 0 };
      charge.end = 'wheeled';
      return false;
    }
  }
  return true;
}

/**
 * The blow of a charge, when its moment comes: a couched lance as the point is about to meet him (couchLance); else
 * the blow of his style the pass gives (strikeInPassing draws it by the style's weights, as the riding AI's: the move
 * tapped is not kept, the moment decides), at the place on the man the player asked for (a man on foot, his head,
 * unless the body was asked). Marks the charge struck once it is thrown.
 */
function blowInPassing(world, fighter, charge, opponent, style, lance) {
  if (fighter.punch || fighter.cooldown > 0) return;
  if (lance) charge.struck = couchLance(world, fighter, opponent, lance);
  else {
    const zone = ['head', 'body'].includes(charge.zone) ? charge.zone : markZone(opponent);
    const zoneOf = (made) => (made.zones.includes(zone) ? zone : made.zones[0]);
    charge.struck = strikeInPassing(world, fighter, opponent, style.attacks, (who) => aimPoint(who, zone), zoneOf, aheadOf(fighter.mount.yaw));
  }
  if (charge.struck) charge.struckAt = world.time;
}

/** A wing of horse held on the flank: the horse stands where it is, facing as it was set (formation.js releases it). */
export function holdWing(fighter, now) {
  const horse = fighter.mount;
  horse.goalAt = now;
  horse.goal = { heading: horse.yaw, speed: 0 };
  fighter.goTo = null;
  fighter.move = 0;
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
    const facing = aheadOf(fighter.yaw);
    const left = leftwardOf(fighter.yaw);
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
