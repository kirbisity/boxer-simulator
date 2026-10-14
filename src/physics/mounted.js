// On horseback. A horse is a rigid body moved as a whole (no particles): it
// gets away, pulls up and turns no harder than its legs allow (HORSES,
// laden by its rider and its armour), its legs cycle with its gait, and its
// parts are capsules a weapon can strike (harm through its barding, as an
// outfit's protection keeps it off a man), that bleed, break and bring it
// down. Its rider is the fighter as on foot from the waist up: his hips,
// knees and feet sit where the saddle and stirrups put them, carried at the
// horse's speed, so his hands and weapon move with the horse and a blow
// from the saddle closes at the horse's speed and his arm's together. A blow
// on him knocks his trunk as on foot; past what the seat holds he is thrown
// and falls as any man, from the saddle's height at the horse's speed, gets
// up and fights on foot. A horse that falls throws him too.

import { BODY, P } from '../body.js';
import { BARDING, HORSES, HORSE_LOAD, mountOf } from '../horses.js';
import { vec, yawRotate, twoBoneIK } from '../pose.js';
import { BLADES, harmMix } from '../weapons.js';
import { bladeStrike, closestBetween, deliverImpulse, handVelocityOf, heldBlades, point, shakenLoose, strainGrip, strikeLiveUntil, strokeOf, TRUNK_PARTICLES } from '../physics.js';
import { WORLD } from './config.js';

/**
 * A horse's shape in units of its height at the withers (x forward, y up,
 * z to its left; the origin on the ground under its middle): the barrel in
 * two (chest, body), neck, head, and the legs from where they leave the
 * body (`root`) to the hoof. `mass` is each part's share of the horse,
 * `part` the barding's name for it. The rider's seat is on the back just
 * behind the middle.
 */
export const HORSE_SHAPE = {
  parts: [
    { key: 'chest', part: 'chest', a: [0.02, 0.75, 0], b: [0.36, 0.77, 0], radius: 0.2, mass: 0.33 },
    { key: 'body', part: 'body', a: [-0.42, 0.77, 0], b: [0.02, 0.75, 0], radius: 0.21, mass: 0.37 },
    { key: 'neck', part: 'neck', a: [0.36, 0.84, 0], b: [0.6, 1.08, 0], radius: 0.11, mass: 0.07 },
    { key: 'head', part: 'head', a: [0.62, 1.12, 0], b: [0.84, 0.92, 0], radius: 0.075, mass: 0.04 },
  ],
  legs: [
    { key: 'lFore', fore: true, root: [0.3, 0.66, 0.1], mass: 0.0475 },
    { key: 'rFore', fore: true, root: [0.3, 0.66, -0.1], mass: 0.0475 },
    { key: 'lHind', fore: false, root: [-0.36, 0.7, 0.1], mass: 0.0475 },
    { key: 'rHind', fore: false, root: [-0.36, 0.7, -0.1], mass: 0.0475 },
  ],
  legRadius: 0.035,
  // Upper and lower leg (forearm and cannon; gaskin and cannon), of the withers.
  upperLeg: 0.33, lowerLeg: 0.37,
  seat: [-0.08, 0.99, 0],
};

// The gaits: by speed (m/s, up to), strides a second, the share of a stride
// each hoof is on the ground, and when in the stride each leg comes down.
const GAITS = [
  { name: 'stand', upTo: 0.3, hz: 0, duty: 1, phase: { lFore: 0, rFore: 0, lHind: 0, rHind: 0 } },
  { name: 'walk', upTo: 2.4, hz: 0.95, duty: 0.62, phase: { lHind: 0, lFore: 0.25, rHind: 0.5, rFore: 0.75 } },
  { name: 'trot', upTo: 4.6, hz: 1.35, duty: 0.45, phase: { lFore: 0, rHind: 0, rFore: 0.5, lHind: 0.5 } },
  { name: 'canter', upTo: 7.5, hz: 1.7, duty: 0.4, phase: { lHind: 0, rHind: 0.3, lFore: 0.3, rFore: 0.6 } },
  { name: 'gallop', upTo: Infinity, hz: 2.2, duty: 0.3, phase: { lHind: 0, rHind: 0.12, lFore: 0.5, rFore: 0.62 } },
];

/** The gait at a speed. */
export function gaitAt(speed) {
  const pace = Math.abs(speed);
  return GAITS.find((gait) => pace <= gait.upTo);
}

/** A rider's horse, for createWorld: under him, facing his way. */
export function createHorse(fighter, id, random) {
  const kit = mountOf(fighter.body.inputs);
  const breed = HORSES[kit.breed];
  const barding = BARDING[kit.barding];
  const coat = breed.coats[Math.floor(random() * breed.coats.length)];
  // His load: the man, what he wears and carries, and the horse's armour.
  const riderKg = fighter.body.masses.reduce((sum, mass) => sum + mass, 0) + (fighter.weapon?.spec.mass ?? 0);
  const load = riderKg + barding.mass;
  const over = Math.max(0, load / breed.mass - HORSE_LOAD.easy);
  const pace = Math.max(HORSE_LOAD.least, 1 - HORSE_LOAD.slows * over);
  const horse = {
    id, corner: fighter.corner, rider: fighter.id, breed: kit.breed, barding: kit.barding, coat,
    spec: breed, withers: breed.withers, mass: breed.mass + barding.mass, load,
    // Its paces laden, and how hard it gets away (its own weight to its weight laden).
    paces: { gallop: breed.gallop * pace, canter: breed.canter * pace, trot: breed.trot, walk: breed.walk },
    accel: breed.accel * breed.mass / (breed.mass + load) * (1 + HORSE_LOAD.easy),
    at: [fighter.root[0], fighter.root[1]], yaw: fighter.yaw, speed: 0, yawRate: 0,
    goal: { heading: fighter.yaw, speed: 0 }, goalAt: -Infinity,
    stride: 0, state: 'up', fall: 0, roll: 0, bleed: 0, bloodLost: 0, trauma: 0, wounds: {},
    capsules: [], legs: {},
  };
  fighter.mount = horse;
  poseHorse(horse);
  seatRider(fighter, 1 / 60, true);
  return horse;
}

/** The horse's paces as speeds it can hold (m/s): gallop, canter, trot, walk. */
export function pacesOf(horse) {
  return horse.paces;
}

/** The tightest turn (m radius) it can make at a speed: what its legs can lean into, or round on the spot. */
export function turnRadius(horse, speed) {
  const rate = turnRateAt(horse, speed);
  return Math.abs(speed) / Math.max(rate, 1e-6);
}

function turnRateAt(horse, speed) {
  return Math.min(horse.spec.spin, horse.spec.lateral / Math.max(Math.abs(speed), 0.1));
}

const forwardOf = (yaw) => yawRotate([1, 0, 0], yaw);
const leftOf = (yaw) => yawRotate([0, 0, 1], yaw);

/** A point given in the horse's own frame (m), in the world, as it stands (or lies). */
export function horsePoint(horse, local) {
  let [x, y, z] = local;
  if (horse.roll) {
    // Falling over onto its side about the barrel's line.
    const pivot = 0.76 * horse.withers;
    const cos = Math.cos(horse.roll);
    const sin = Math.sin(horse.roll);
    const dy = y - pivot;
    y = pivot + dy * cos - z * sin - horse.fall * (pivot - 0.21 * horse.withers);
    z = dy * sin + z * cos;
  }
  const f = forwardOf(horse.yaw);
  const l = leftOf(horse.yaw);
  return [horse.at[0] + f[0] * x + l[0] * z, y + (horse.bob ?? 0), horse.at[1] + f[2] * x + l[2] * z];
}

/** The horse's velocity at a point of it (its run and its turning). */
export function horseVelocityAt(horse, at) {
  const f = forwardOf(horse.yaw);
  const r = [at[0] - horse.at[0], 0, at[2] - horse.at[1]];
  // ω about the vertical: v = ω × r.
  return [f[0] * horse.speed + horse.yawRate * r[2], 0, f[2] * horse.speed - horse.yawRate * r[0]];
}

/**
 * Where its parts are now: the capsules a blow can meet, and each leg's
 * root, knee and hoof by its gait (drawn the same).
 */
export function poseHorse(horse) {
  const W = horse.withers;
  const scale = (p) => [p[0] * W, p[1] * W, p[2] * W];
  const gait = gaitAt(horse.speed);
  const stride = gait.hz > 0 ? Math.min(0.7 * W, Math.abs(horse.speed) / gait.hz) : 0;
  const capsules = horse.capsules;
  capsules.length = 0;
  for (const part of HORSE_SHAPE.parts) capsules.push({ key: part.key, part: part.part, a: horsePoint(horse, scale(part.a)), b: horsePoint(horse, scale(part.b)), radius: part.radius * W, mass: part.mass });
  // The body rises and falls a little with the stride.
  horse.bob = gait.hz > 0 && horse.state === 'up' ? Math.abs(Math.sin(horse.stride * Math.PI * 2)) * 0.012 * Math.min(1, Math.abs(horse.speed) / 6) * W : 0;
  for (const leg of HORSE_SHAPE.legs) {
    const root = scale(leg.root);
    let hoof;
    if (horse.state !== 'up') {
      // Down: the legs stiff, out from the body.
      hoof = [root[0] + (leg.fore ? 0.15 : -0.15) * W, 0.05 * W, root[2]];
    } else {
      const u = (((horse.stride + gait.phase[leg.key]) % 1) + 1) % 1;
      const reach = Math.sign(horse.speed || 1) * stride / 2;
      let along;
      let lift = 0;
      if (u < gait.duty) along = reach * (1 - 2 * (u / gait.duty));
      else {
        const s = (u - gait.duty) / (1 - gait.duty);
        along = -reach + 2 * reach * s;
        lift = Math.sin(Math.PI * s) * Math.min(0.22, 0.05 + 0.02 * Math.abs(horse.speed)) * W;
      }
      hoof = [root[0] + along, 0.03 * W + lift, root[2]];
    }
    // The knee bends forward on a foreleg, the hock back on a hind leg.
    const knee = twoBoneIK(root, hoof, HORSE_SHAPE.upperLeg * W, HORSE_SHAPE.lowerLeg * W, [leg.fore ? 1 : -1, 0, 0]);
    const world = { root: horsePoint(horse, root), knee: horsePoint(horse, knee), hoof: horsePoint(horse, hoof) };
    horse.legs[leg.key] = world;
    capsules.push({ key: leg.key, part: 'legs', a: world.root, b: world.hoof, radius: HORSE_SHAPE.legRadius * W * 1.4, mass: leg.mass });
  }
}

/**
 * One substep of the horse: towards its goal (a heading and a speed) no
 * faster than it can get away, pull up or turn at its speed; within the
 * arena (a barrier stops it); its legs on through their stride. A horse
 * falling slides to a stop and rolls onto its side.
 */
export function stepHorse(world, horse, h) {
  if (horse.state === 'falling' || horse.state === 'down') {
    horse.speed *= Math.exp(-h * 2.5);
    horse.yawRate = 0;
    if (horse.state === 'falling') {
      horse.fall = Math.min(1, horse.fall + h / 0.9);
      horse.roll = horse.side * (Math.PI / 2) * horse.fall * horse.fall;
      if (horse.fall >= 1) horse.state = 'down';
    }
  } else {
    const goal = horse.goal;
    const top = horse.paces.gallop * (horse.lame ? 0.3 : 1) * (1 - 0.5 * Math.min(1, horse.bloodLost / collapseShare()));
    const wanted = Math.max(-1, Math.min(top, goal.speed));
    const change = wanted - horse.speed;
    // Pulling up is harder than getting away (a horse sits back on its hocks).
    const most = horse.accel * (change < 0 ? 1.4 : 1) * h;
    horse.speed += Math.max(-most, Math.min(most, change));
    let turn = goal.heading - horse.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    const rate = turnRateAt(horse, horse.speed);
    horse.yawRate = Math.max(-rate, Math.min(rate, turn * 4));
    horse.yaw += horse.yawRate * h;
  }
  const f = forwardOf(horse.yaw);
  horse.at[0] += f[0] * horse.speed * h;
  horse.at[1] += f[2] * horse.speed * h;
  const arena = world.arena;
  const margin = 0.9 * horse.withers;
  const clamped = [Math.max(-(arena.halfX - margin), Math.min(arena.halfX - margin, horse.at[0])), Math.max(-(arena.halfZ - margin), Math.min(arena.halfZ - margin, horse.at[1]))];
  if (clamped[0] !== horse.at[0] || clamped[1] !== horse.at[1]) {
    // Into the barrier: it pulls up there.
    horse.at = clamped;
    horse.speed *= Math.exp(-h * 6);
  }
  const gait = gaitAt(horse.speed);
  horse.stride = (horse.stride + gait.hz * h) % 1;
  horse.velocity = [f[0] * horse.speed, 0, f[2] * horse.speed];
  poseHorse(horse);
}

/** The share of its blood lost that drops a horse (as a man's). */
function collapseShare() {
  return BLADES.collapseAt * BODY.toughness;
}

// The parts of a rider held in the saddle.
const SEATED = ['pelvis', 'lHip', 'rHip', 'lKnee', 'rKnee', 'lFoot', 'rFoot'].map((name) => P[name]);
export const SEATED_PARTICLES = new Set(SEATED);

/**
 * Where the saddle and stirrups hold the rider's hips, knees and feet now:
 * his hip joints over the seat, the thighs down and forward round the
 * horse's barrel, the feet in the stirrups below the knee.
 */
function seatPoints(fighter, horse) {
  const W = horse.withers;
  const L = fighter.body.lengths;
  const seat = vec.add(horsePoint(horse, [HORSE_SHAPE.seat[0] * W, HORSE_SHAPE.seat[1] * W, 0]), [0, WORLD.mount.seatHeight, 0]);
  const f = forwardOf(horse.yaw);
  const l = leftOf(horse.yaw);
  const points = {};
  points[P.pelvis] = seat;
  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    const hip = vec.add(seat, vec.scale(l, sign * L.hipSpan / 2));
    const out = 0.62 * Math.min(1.2, W / 1.5);
    const thigh = vec.normalize([f[0] * 0.32 + l[0] * sign * out, -0.72, f[2] * 0.32 + l[2] * sign * out]);
    const knee = vec.add(hip, vec.scale(thigh, L.thigh));
    const shank = vec.normalize([-f[0] * 0.1 + l[0] * sign * 0.1, -0.98, -f[2] * 0.1 + l[2] * sign * 0.1]);
    points[P[`${side}Hip`]] = hip;
    points[P[`${side}Knee`]] = knee;
    points[P[`${side}Foot`]] = vec.add(knee, vec.scale(shank, L.shank));
  }
  return points;
}

/**
 * Hold the rider in the saddle for this substep: his seated parts where the
 * saddle puts them, moving at the horse's speed; his stance's root and
 * height follow, so everything above is driven from there as on foot.
 */
export function seatRider(fighter, h, settle = false) {
  const horse = fighter.mount;
  const points = seatPoints(fighter, horse);
  const velocity = horseVelocityAt(horse, points[P.pelvis]);
  for (const index of SEATED) {
    const at = points[index];
    for (let axis = 0; axis < 3; axis += 1) {
      fighter.x[index * 3 + axis] = at[axis];
      fighter.v[index * 3 + axis] = velocity[axis];
      fighter.prev[index * 3 + axis] = at[axis] - velocity[axis] * h;
    }
  }
  fighter.carrier = velocity;
  fighter.rootVelocity = [velocity[0], velocity[2]];
  // His stance stands where his hips sit: the root under the pelvis as his pose has it, lifted to the saddle.
  const pelvis = fighter.desired[P.pelvis];
  const offset = yawRotate(pelvis, fighter.yaw);
  fighter.root = [points[P.pelvis][0] - offset[0], points[P.pelvis][2] - offset[2]];
  fighter.lift = points[P.pelvis][1] - pelvis[1];
  if (settle) {
    // Placed in the saddle at the start: everything else carried up with him.
    for (let index = 0; index < fighter.x.length / 3; index += 1) {
      if (SEATED_PARTICLES.has(index)) continue;
      const local = fighter.desired[index];
      const turned = yawRotate(local, fighter.yaw);
      const at = [fighter.root[0] + turned[0], local[1] + fighter.lift, fighter.root[1] + turned[2]];
      for (let axis = 0; axis < 3; axis += 1) {
        fighter.x[index * 3 + axis] = at[axis];
        fighter.prev[index * 3 + axis] = at[axis];
        fighter.v[index * 3 + axis] = 0;
      }
    }
  }
}

/**
 * The rider's facing: his man (or where he strikes), as far as his shoulders
 * turn off his horse's line (WORLD.mount.twist); the horse turns him the rest.
 */
export function riderFacing(fighter, at, dt) {
  const horse = fighter.mount;
  let want = horse.yaw;
  if (at) {
    const from = point(fighter.x, P.pelvis);
    const toward = Math.atan2(-(at[2] - from[2]), at[0] - from[0]);
    let off = toward - horse.yaw;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    want = horse.yaw + Math.max(-WORLD.mount.twist, Math.min(WORLD.mount.twist, off));
  }
  if (fighter.punch?.spec.holdHeading && fighter.punch.t >= fighter.punch.spec.windup) want = horse.yaw + Math.max(-WORLD.mount.twist, Math.min(WORLD.mount.twist, Math.atan2(Math.sin(fighter.yaw - horse.yaw), Math.cos(fighter.yaw - horse.yaw))));
  // A blow from the saddle is made in his frame on the horse: his shoulders held as they were on its line.
  if (fighter.punch?.rideOffset !== undefined) want = horse.yaw + fighter.punch.rideOffset;
  let turn = want - fighter.yaw;
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  fighter.yaw += turn * Math.min(1, dt * WORLD.footing.turnRate);
  // Never further round than his shoulders go off the horse's line (the horse may have turned under him).
  let off = fighter.yaw - horse.yaw;
  off = Math.atan2(Math.sin(off), Math.cos(off));
  if (Math.abs(off) > WORLD.mount.twist) fighter.yaw = horse.yaw + Math.sign(off) * WORLD.mount.twist;
}

/**
 * The horse's goal from the rider's footwork, when nothing has set it this
 * step (the player's stick, or an AI made for foot): the way he would
 * step, at a canter (a gallop running); backing, a slow step back.
 */
export function goalFromFootwork(world, fighter, dt) {
  const horse = fighter.mount;
  if (horse.goalAt >= world.time - dt * 0.5) return;
  const forward = forwardOf(fighter.yaw);
  const left = leftOf(fighter.yaw);
  const move = fighter.move ?? 0;
  const strafe = fighter.strafe ?? 0;
  const want = [forward[0] * move + left[0] * strafe, forward[2] * move + left[2] * strafe];
  const size = Math.hypot(want[0], want[1]);
  if (size < 0.15) {
    horse.goal = { heading: horse.yaw, speed: 0 };
    return;
  }
  const heading = Math.atan2(-want[1], want[0]);
  let off = heading - horse.yaw;
  off = Math.atan2(Math.sin(off), Math.cos(off));
  // Straight back from where it faces: it steps back rather than turning about.
  if (Math.abs(off) > 2.4 && move < 0 && !fighter.running) {
    horse.goal = { heading: horse.yaw, speed: -1 };
    return;
  }
  horse.goal = { heading, speed: Math.min(1, size) * (fighter.running ? horse.paces.gallop : horse.paces.canter) };
}

/**
 * The seat: a knock on his trunk (as on foot; the saddle couples the horse
 * to him, deliverImpulse) past what a war saddle holds throws him; so does
 * anything that puts him down or out, and his horse falling.
 */
export function keepSeat(world, fighter) {
  const horse = fighter.mount;
  const knock = Math.hypot(fighter.knock[0], fighter.knock[2]);
  fighter.knock = fighter.knock.map((value) => value * Math.exp(-WORLD.balance.absorbPerSecond * world.lastDt));
  if (fighter.state !== 'up') return unhorse(world, fighter, fighter.state === 'out' ? 'slumps from the saddle' : 'falls from the saddle', false);
  if (horse.state !== 'up') return unhorse(world, fighter, 'thrown as his horse goes down', true);
  if (knock > WORLD.mount.seat.speed * fighter.body.gear.balance) return unhorse(world, fighter, `knocked from the saddle (${knock.toFixed(1)} m/s)`, true);
}

/** The share of the horse's mass a blow on its rider must move with him (the seat). */
export function seatMass(fighter) {
  return fighter.body.massKg + WORLD.mount.seat.horseShare * fighter.mount.mass;
}

/**
 * Off the horse: from here he is a man on foot, falling from the saddle
 * with the horse's speed in him (his particles keep it). `thrown`: down, as
 * a fall (not counted as a knockdown). The horse runs off a while.
 */
export function unhorse(world, fighter, reason, thrown) {
  const horse = fighter.mount;
  if (!horse) return;
  fighter.mount = null;
  fighter.carrier = null;
  fighter.lift = 0;
  horse.rider = null;
  horse.boltUntil = world.time + WORLD.mount.horse.boltSeconds;
  fighter.root = [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
  fighter.rootVelocity = [0, 0];
  fighter.ride = null;
  if (thrown && fighter.state === 'up') {
    fighter.state = 'down';
    fighter.knock = [0, 0, 0];
    shakenLoose(world, fighter);
    fighter.punch = null;
    fighter.rush = null;
    fighter.clinch = null;
    fighter.downTimer = WORLD.balance.fallSeconds;
  }
  world.events.push({ time: world.time, kind: 'unhorsed', fighter: fighter.id, horse: horse.id, effects: [reason] });
}

/** A riderless horse: off at a canter away from the nearest man for a while, then it stands. */
export function loseHorse(world, horse) {
  if (horse.state !== 'up') return;
  if (world.time > (horse.boltUntil ?? -1)) {
    horse.goal = { heading: horse.yaw, speed: 0 };
    return;
  }
  let nearest = null;
  let best = Infinity;
  for (const fighter of world.fighters) {
    const d = Math.hypot(fighter.x[P.pelvis * 3] - horse.at[0], fighter.x[P.pelvis * 3 + 2] - horse.at[1]);
    if (d < best) {
      best = d;
      nearest = fighter;
    }
  }
  const away = nearest ? Math.atan2(-(horse.at[1] - nearest.x[P.pelvis * 3 + 2]), horse.at[0] - nearest.x[P.pelvis * 3]) : horse.yaw;
  horse.goal = { heading: steerInside(world, horse, away), speed: horse.paces.canter };
}

/** A heading turned back towards the middle when it would run the horse into the arena's edge. */
export function steerInside(world, horse, heading, edge = WORLD.mount.edge) {
  const ahead = forwardOf(heading);
  const look = Math.max(4, Math.abs(horse.speed) * 1.2);
  const x = horse.at[0] + ahead[0] * look;
  const z = horse.at[1] + ahead[2] * look;
  const { halfX, halfZ } = world.arena;
  if (Math.abs(x) < halfX - edge && Math.abs(z) < halfZ - edge) return heading;
  return Math.atan2(horse.at[1] * 0.3, -horse.at[0]);
}

// ---- Blows on the horse ---------------------------------------------------

/**
 * Each blade in a stroke against each horse of the other side: where it
 * meets one of the horse's parts, a blow on it, its harm through the
 * barding (as an outfit's protection), the same physics as a blow on a man:
 * the blade's velocity against the horse's at that point, the effective
 * mass behind the blade against the part's.
 */
export function strikeHorses(world, time) {
  const horses = world.horses;
  if (!horses?.length) return;
  for (const attacker of world.fighters) {
    if (attacker.state !== 'up' || !attacker.punch) continue;
    for (const weapon of heldBlades(attacker)) {
      if (weapon.spec.rope) continue;
      const punch = strokeOf(attacker, weapon);
      if (!punch || punch.load > 0 || punch.t < punch.spec.windup || punch.t > strikeLiveUntil(punch.spec)) continue;
      punch.hits ??= new Set();
      if (punch.stopped || (punch.landed && !punch.spec.sweep)) continue;
      const hand = point(attacker.x, P[`${weapon.main}Hand`]);
      const from = vec.add(hand, vec.scale(weapon.dir, weapon.spec.strikeFrom));
      for (const horse of horses) {
        if (horse === attacker.mount || horse.corner === attacker.corner || horse.state === 'down' || punch.hits.has(`horse${horse.id}`)) continue;
        if (Math.hypot(weapon.tip[0] - horse.at[0], weapon.tip[2] - horse.at[1]) > 2.2 * horse.withers) continue;
        let best = null;
        for (const capsule of horse.capsules) {
          const closest = closestBetween(from, weapon.tip, capsule.a, capsule.b);
          const gap = vec.length(vec.sub(closest.onFirst, closest.onSecond)) - weapon.spec.radius - capsule.radius;
          if (gap < 0 && (!best || gap < best.gap)) best = { capsule, closest, gap };
        }
        if (best && hitHorse(world, attacker, weapon, punch, horse, best.capsule, best.closest)) break;
      }
    }
  }
}

function hitHorse(world, attacker, weapon, punch, horse, capsule, closest) {
  const wspec = weapon.spec;
  const spec = punch.spec;
  const main = P[`${weapon.main}Hand`];
  const distance = wspec.strikeFrom + closest.s * (wspec.length - wspec.strikeFrom);
  const bladeVelocity = vec.lerp(handVelocityOf(attacker, main), weapon.tipVelocity, distance / wspec.length);
  const struckVelocity = horseVelocityAt(horse, closest.onSecond);
  const relative = vec.sub(bladeVelocity, struckVelocity);
  const away = vec.sub(closest.onFirst, closest.onSecond);
  const normal = vec.length(away) > 1e-6 ? vec.normalize(away) : vec.normalize(vec.scale(relative, -1));
  const closing = -vec.dot(relative, normal);
  if (closing < WORLD.minImpactSpeed) return false;
  punch.hits.add(`horse${horse.id}`);
  punch.landed = true;
  const { strikeMass, along } = bladeStrike(attacker, weapon, punch, relative, distance);
  const struckMass = horse.mass * capsule.mass;
  const reducedMass = (strikeMass * struckMass) / (strikeMass + struckMass);
  const impulse = reducedMass * closing * (1 + WORLD.restitution);
  const energy = 0.5 * reducedMass * closing * closing;
  const mix = harmMix(wspec, spec.mode, along, closest.s);
  const drawn = 1 + WORLD.skill.draw * 2 * ((attacker.body.skill ?? 0.5) - 0.5);
  mix.cut *= drawn;
  mix.pierce *= drawn;
  const protection = BARDING[horse.barding].parts[capsule.part];
  const sharp = weapon.edge ?? 1;
  const blunt = energy * mix.blunt * (1 - (protection.blunt ?? 0) * (1 - (wspec.crush ?? 0)));
  const cut = energy * mix.cut * (1 - (protection.cut ?? 0)) * sharp;
  const pierce = energy * mix.pierce * (1 - (protection.pierce ?? 0)) * sharp;
  const glanced = Boolean(protection.deflects) && mix.cut + mix.pierce > 0.2;
  const contactPoint = vec.add(closest.onSecond, vec.scale(normal, capsule.radius));
  const event = {
    time: world.time, kind: 'horseHit', attacker: attacker.id, horse: horse.id, rider: horse.rider ?? undefined, weapon: weapon.kind, punch: punch.type, target: capsule.key,
    speed: closing, impulse, energy, harm: blunt, cut, pierce, point: contactPoint, normal, effects: [],
  };
  if (glanced) {
    event.effects.push('glanced off the barding');
    world.events.push({ time: world.time, kind: 'glance', fighter: -1, point: contactPoint, normal });
  }
  harmHorse(world, horse, capsule, { blunt, cut, pierce }, event, attacker);
  // The blade is jarred by what it met, and the arm takes the blow back.
  strainGrip(world, attacker, impulse * (glanced ? 0.3 : 0.15), [0, 0, 0], weapon);
  const recoil = [[main, 1], [P[`${weapon.main}Elbow`], 0.7], [P[`${weapon.main}Shoulder`], 0.35]];
  world.pendingImpulses.push({ fighter: attacker, shares: recoil, direction: normal, impulse: impulse * (1 + WORLD.weaponTransferRestitution.edge) / (1 + WORLD.restitution) });
  world.events.push(event);
  return true;
}

/**
 * Harm to a horse: an edge or a point bleeds it (its blood is ~8% of its
 * weight, so the same wound is a smaller share than a man's), a point in
 * its chest or neck past the lethal depth opens the heart or the great
 * vessels (down in `heartSeconds`), a leg cut or broken cripples it, a heavy
 * blow to the head drops it, and blunt harm summed on its body kills it.
 */
export function harmHorse(world, horse, capsule, { blunt, cut, pierce }, event, attacker = null) {
  const spec = WORLD.mount.horse;
  const share = spec.manBlood / horse.mass;
  const zone = capsule.part === 'legs' ? 'limb' : capsule.part === 'head' ? 'head' : 'trunk';
  const bleed = (cut * BLADES.bleedPerJoule.cut + pierce * BLADES.bleedPerJoule.pierce) * BLADES.bleedZone[zone] * share;
  horse.bleed += bleed;
  horse.wounds[capsule.key] = (horse.wounds[capsule.key] ?? 0) + cut + pierce + blunt;
  if (attacker) horse.lastHitBy = attacker.id;
  if (cut > 1) event.effects.push(cut > 60 ? 'a deep cut' : 'cut');
  if (pierce > 1) event.effects.push(pierce > 40 ? 'run through' : 'stabbed');
  if ((capsule.part === 'chest' || capsule.part === 'neck') && pierce > BLADES.lethalPierce * BODY.toughness * Math.sqrt(horse.mass / spec.manBlood)) {
    const left = Math.max(0, collapseShare() - horse.bloodLost);
    horse.bleed += left / (BLADES.clotSeconds * (1 - Math.exp(-spec.heartSeconds / BLADES.clotSeconds)));
    event.effects.push('through the heart');
  }
  if (capsule.part === 'legs' && blunt + cut > spec.legBreak) {
    horse.lame = true;
    event.effects.push('its leg broken');
    bringDown(world, horse, 'goes down on a broken leg');
  }
  if (capsule.part === 'head' && blunt > spec.headStun) {
    event.effects.push('stunned');
    bringDown(world, horse, 'drops from a blow to the head');
  }
  horse.trauma += blunt;
  if (horse.trauma > spec.trunkFatal * BODY.toughness) bringDown(world, horse, 'killed by the blows');
}

/** The horse's timers each step: it bleeds, and down it goes past what it can lose. */
export function horseTimers(world, horse, dt) {
  if (horse.bleed > 0) {
    horse.bloodLost += horse.bleed * dt;
    horse.bleed *= Math.exp(-dt / BLADES.clotSeconds);
    if (horse.bloodLost >= collapseShare()) bringDown(world, horse, 'bled out');
  }
}

/** Down it goes (once): over onto a side, and its rider thrown (keepSeat). */
export function bringDown(world, horse, reason) {
  if (horse.state !== 'up') return;
  horse.state = 'falling';
  horse.fall = 0;
  horse.side = world.random() < 0.5 ? 1 : -1;
  horse.dead = !horse.lame || reason !== 'goes down on a broken leg';
  world.events.push({ time: world.time, kind: 'horseDown', horse: horse.id, rider: horse.rider ?? undefined, attacker: horse.lastHitBy, effects: [reason] });
}

// ---- The horse's body against men and horses -------------------------------

/**
 * A horse's barrel, neck and head against a man on foot: it pushes him out
 * of its way, and at speed the contact is a blow (the man's mass against
 * the horse's, the closing speed) that knocks him as any collision does.
 * Horses against horses push apart and share their momentum along the
 * contact. Once a substep.
 */
export function collideHorses(world, h) {
  const horses = world.horses;
  if (!horses?.length) return;
  for (const horse of horses) {
    if (horse.state === 'down') continue;
    for (const fighter of world.fighters) {
      if (fighter.mount || fighter.state === 'out' && fighter.outFor > 20) continue;
      const pelvis = point(fighter.x, P.pelvis);
      if (Math.hypot(pelvis[0] - horse.at[0], pelvis[2] - horse.at[1]) > 1.6 * horse.withers) continue;
      const neck = point(fighter.x, P.neck);
      const radius = fighter.body.segments.trunk.skinRadius;
      for (const capsule of horse.capsules) {
        if (capsule.part === 'legs') continue;
        const closest = closestBetween(pelvis, neck, capsule.a, capsule.b);
        const offset = vec.sub(closest.onFirst, closest.onSecond);
        const flat = [offset[0], 0, offset[2]];
        const gap = vec.length(offset) - radius - capsule.radius;
        if (gap >= 0) continue;
        const normal = vec.length(flat) > 1e-6 ? vec.normalize(flat) : vec.normalize([forwardOf(horse.yaw)[2], 0, -forwardOf(horse.yaw)[0]]);
        // Out of its way (moved, not pushed: the previous positions go too).
        const depth = -gap;
        for (let index = 0; index < fighter.x.length / 3; index += 1) {
          fighter.x[index * 3] += normal[0] * depth;
          fighter.x[index * 3 + 2] += normal[2] * depth;
          fighter.prev[index * 3] += normal[0] * depth;
          fighter.prev[index * 3 + 2] += normal[2] * depth;
        }
        fighter.root[0] += normal[0] * depth;
        fighter.root[1] += normal[2] * depth;
        const horseVelocity = horseVelocityAt(horse, closest.onSecond);
        const manVelocity = point(fighter.v, P.pelvis);
        const closing = vec.dot(vec.sub(horseVelocity, manVelocity), normal);
        if (closing > WORLD.mount.trample.from) {
          const man = fighter.body.massKg;
          const reduced = (man * horse.mass) / (man + horse.mass);
          const impulse = reduced * closing * (1 + WORLD.mount.trample.restitution);
          deliverImpulse({ fighter, shares: TRUNK_PARTICLES.map((index) => [index, 1]), direction: normal, impulse });
          horse.speed -= (impulse / horse.mass) * Math.max(0, vec.dot(forwardOf(horse.yaw), normal));
          if (!fighter.trampledAt || world.time - fighter.trampledAt > 0.5) {
            fighter.trampledAt = world.time;
            world.events.push({ time: world.time, kind: 'trampled', fighter: fighter.id, horse: horse.id, attacker: horse.rider ?? undefined, speed: closing, impulse, effects: [`ridden down at ${closing.toFixed(1)} m/s`] });
          }
        }
        break;
      }
    }
  }
  for (let a = 0; a < horses.length; a += 1) {
    for (let b = a + 1; b < horses.length; b += 1) {
      const first = horses[a];
      const second = horses[b];
      if (first.state === 'down' || second.state === 'down') continue;
      if (Math.hypot(first.at[0] - second.at[0], first.at[1] - second.at[1]) > 1.6 * (first.withers + second.withers)) continue;
      for (const one of first.capsules.slice(0, 2)) {
        for (const two of second.capsules.slice(0, 2)) {
          const closest = closestBetween(one.a, one.b, two.a, two.b);
          const offset = vec.sub(closest.onFirst, closest.onSecond);
          const gap = vec.length(offset) - one.radius - two.radius;
          if (gap >= 0) continue;
          const normal = vec.normalize([offset[0], 0, offset[2]]);
          const total = first.mass + second.mass;
          first.at[0] += normal[0] * -gap * (second.mass / total);
          first.at[1] += normal[2] * -gap * (second.mass / total);
          second.at[0] -= normal[0] * -gap * (first.mass / total);
          second.at[1] -= normal[2] * -gap * (first.mass / total);
          // The speeds along the contact pooled (an inelastic meeting).
          const closing = vec.dot(vec.sub(second.velocity ?? [0, 0, 0], first.velocity ?? [0, 0, 0]), normal);
          if (closing > 0) {
            const impulse = (first.mass * second.mass) / total * closing;
            first.speed += (impulse / first.mass) * vec.dot(forwardOf(first.yaw), normal);
            second.speed -= (impulse / second.mass) * vec.dot(forwardOf(second.yaw), normal);
          }
        }
      }
    }
  }
}
