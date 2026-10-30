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

import { shieldCovering, soundEvent, soundHit } from '../audio/log.js';
import { surfaceAt } from '../audio/surface.js';
import { BODY, P } from '../body.js';
import { BARDING, HORSES, HORSE_LOAD, mountOf } from '../horses.js';
import { tiltToward, vec, yawRotate, twoBoneIK } from '../pose.js';
import { BLADES, bleedRate, bleedToLose, contactShare, harmMix, shieldContact } from '../weapons.js';
import { bladeFor, bladeStrike, closestBetween, crashBetween, dropWeapon, crashHardness, crashHarm, crashOf, fall, fighterParty, groundBrace, handVelocityOf, heldBlades, point, poiseOf, shakenLoose, shieldDisc, shieldHarm, shieldParty, shattersOn, stagger, strainGrip, strikeLiveUntil, strokeOf, wholeVelocity } from '../physics.js';
import { WORLD } from './config.js';
import { horseBalks, horseFounders, horseMire, horseOnWorks } from './fieldworks.js';

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
    at: [fighter.root[0], fighter.root[1]], yaw: fighter.yaw, speed: 0, yawRate: 0, shove: [0, 0], shock: 0,
    goal: { heading: fighter.yaw, speed: 0 }, goalAt: -Infinity,
    stride: 0, state: 'up', fall: 0, roll: 0, bleed: 0, bloodLost: 0, trauma: 0, wounds: {},
    capsules: [], legs: {},
  };
  fighter.mount = horse;
  poseHorse(horse);
  seatRider(fighter, 1 / 60, true);
  return horse;
}

/** A rider and his horse set down together at (x, z) facing `yaw` (a mode's or a picture's own placing): the horse standing, he in the saddle. */
export function placeMounted(fighter, x, z, yaw) {
  const horse = fighter.mount;
  if (!horse) return;
  Object.assign(horse, { at: [x, z], yaw, speed: 0, yawRate: 0, shove: [0, 0], goal: { heading: yaw, speed: 0 } });
  fighter.yaw = yaw;
  poseHorse(horse);
  seatRider(fighter, 1 / 60, true);
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

/**
 * A point given in the horse's own frame (m), in the world, as it stands (or lies):
 * rocked about its barrel (the stride's sway, or falling over onto its side), pitched
 * nose up or down about the middle of its barrel (the stride's rocking), and raised by
 * the stride's bob. The drawn horse (horseview.js) turns its body and group the same way.
 */
export function horsePoint(horse, local) {
  let [x, y, z] = local;
  const roll = (horse.roll ?? 0) + (horse.rock ?? 0);
  if (roll) {
    // Falling over onto its side about the barrel's line.
    const pivot = 0.76 * horse.withers;
    const cos = Math.cos(roll);
    const sin = Math.sin(roll);
    const dy = y - pivot;
    y = pivot + dy * cos - z * sin - (horse.fall ?? 0) * (pivot - 0.21 * horse.withers);
    z = dy * sin + z * cos;
  }
  if (horse.pitch) {
    const cos = Math.cos(horse.pitch);
    const sin = Math.sin(horse.pitch);
    const dy = y - 0.76 * horse.withers;
    [x, y] = [x * cos - dy * sin, 0.76 * horse.withers + x * sin + dy * cos];
  }
  if (horse.bank) {
    // Leaning into a turn: all of it, hooves on the ground, about its forward line there (positive to its left).
    const cos = Math.cos(horse.bank);
    const sin = Math.sin(horse.bank);
    [y, z] = [y * cos - z * sin, y * sin + z * cos];
  }
  const f = forwardOf(horse.yaw);
  const l = leftOf(horse.yaw);
  // (Sunk into soft ground, fieldworks.js horseMire: its hooves on the firm layer under the mud.)
  return [horse.at[0] + f[0] * x + l[0] * z, y + (horse.bob ?? 0) - (horse.sunk ?? 0), horse.at[1] + f[2] * x + l[2] * z];
}

/** How much of each gait a speed is in (they blend over `motion.blend` m/s at the changes: the motion has no jump). */
function gaitWeights(speed) {
  const blend = WORLD.mount.motion.blend;
  let lower = -Infinity;
  const weights = [];
  for (const gait of GAITS) {
    const rise = lower === -Infinity ? 1 : Math.max(0, Math.min(1, (speed - (lower - blend)) / (2 * blend)));
    const fall = gait.upTo === Infinity ? 1 : Math.max(0, Math.min(1, (gait.upTo + blend - speed) / (2 * blend)));
    weights.push([gait.name, Math.min(rise, fall)]);
    lower = gait.upTo;
  }
  return weights;
}

/**
 * How the body of a horse moves with its stride (WORLD.mount.motion): its rise and
 * fall, its pitch and its rock, the sum of the gaits it is in, each a cosine of the
 * stride phase (the one phase its legs and the drawn horse go by).
 */
export function horseMotion(horse) {
  const motion = { bob: 0, pitch: 0, rock: 0 };
  if (horse.state !== 'up') return motion;
  const speed = Math.abs(horse.speed);
  const gate = Math.min(1, speed / 0.8);
  if (gate <= 0) return motion;
  const table = WORLD.mount.motion;
  const cycle = horse.stride;
  for (const [name, weight] of gaitWeights(speed)) {
    if (weight <= 0) continue;
    const spec = table[name];
    motion.bob += weight * spec.bob[0] * Math.cos(Math.PI * 2 * spec.bob[1] * (cycle - spec.bob[2]));
    motion.pitch += weight * spec.pitch[0] * Math.cos(Math.PI * 2 * (cycle - spec.pitch[1]));
    motion.rock += weight * spec.rock[0] * Math.cos(Math.PI * 2 * spec.rock[1] * (cycle - spec.rock[2]));
  }
  motion.bob *= gate * horse.withers;
  motion.pitch *= gate;
  motion.rock *= gate;
  return motion;
}

/** The horse's velocity at a point of it (its run and its turning). */
export function horseVelocityAt(horse, at) {
  const f = forwardOf(horse.yaw);
  const r = [at[0] - horse.at[0], 0, at[2] - horse.at[1]];
  // ω about the vertical: v = ω × r.
  return [f[0] * horse.speed + horse.yawRate * r[2] + horse.shove[0], 0, f[2] * horse.speed - horse.yawRate * r[0] + horse.shove[1]];
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
  // The body rises and falls, pitches and rocks with the stride.
  const motion = horseMotion(horse);
  horse.bob = motion.bob;
  horse.pitch = motion.pitch;
  horse.rock = motion.rock;
  const capsules = horse.capsules;
  capsules.length = 0;
  for (const part of HORSE_SHAPE.parts) capsules.push({ key: part.key, part: part.part, a: horsePoint(horse, scale(part.a)), b: horsePoint(horse, scale(part.b)), radius: part.radius * W, mass: part.mass });
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
    // (A hoof on the ground stays there as the body rises over it and pitches: the leg is longer or shorter.)
    if (horse.state === 'up') hoof[1] -= horse.bob + horse.pitch * hoof[0];
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
    horse.bank = 0;
    if (horse.state === 'falling') {
      horse.fall = Math.min(1, horse.fall + h / 0.9);
      horse.roll = horse.side * (Math.PI / 2) * horse.fall * horse.fall;
      if (horse.fall >= 1) horse.state = 'down';
    }
  } else {
    const goal = horse.goal;
    // In soft ground it sinks by its weight on its hooves, and its legs are held there (fieldworks.js horseMire).
    const mire = world.arena.works ? horseMire(world, horse) : null;
    horse.sunk = mire?.sunk ?? 0;
    const top = (mire?.pace ?? 1) * horse.paces.gallop * (horse.lame ? 0.3 : 1) * (1 - 0.5 * Math.min(1, horse.bloodLost / collapseShare())) * (1 - WORLD.mount.stamina.slows * (horse.tire ?? 0));
    // It will not run onto stakes, a fence or a ditch before it (fieldworks.js horseBalks): it pulls up as hard as it can; too close to stop, it runs into them slower.
    const balk = mire ? horseBalks(world, horse) : Infinity;
    const wanted = Math.max(-1, Math.min(top, balk, goal.speed));
    const change = wanted - horse.speed;
    // Pulling up is harder than getting away (a horse sits back on its hocks).
    const most = horse.accel * (change < 0 ? 1.4 : 1) * h;
    const before = horse.speed;
    horse.speed += Math.max(-most, Math.min(most, change));
    // (Its pace changing, as the rider's trunk feels it: smoothed over a tenth of a second.)
    horse.acceleration = (horse.acceleration ?? 0) + ((horse.speed - before) / h - (horse.acceleration ?? 0)) * Math.min(1, h * 10);
    // A gallop tires it, a canter or slower rests it.
    const stamina = WORLD.mount.stamina;
    const effort = Math.max(0, Math.min(1, (Math.abs(horse.speed) / horse.paces.gallop - stamina.easy) / (1 - stamina.easy)));
    horse.tire = Math.max(0, Math.min(1, (horse.tire ?? 0) + h * (effort / stamina.gallopSeconds - (1 - effort) / stamina.restSeconds)));
    let turn = goal.heading - horse.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    const rate = turnRateAt(horse, horse.speed);
    horse.yawRate = Math.max(-rate, Math.min(rate, turn * 4));
    horse.yaw += horse.yawRate * h;
    // It leans into the turn, as a runner does (gait.js bankOf): the push through its legs is v × yaw rate, positive to the right.
    const leanWanted = -Math.sign(horse.yawRate) * Math.atan(Math.abs(horse.speed * horse.yawRate) / WORLD.gravity);
    horse.bank = (horse.bank ?? 0) + (leanWanted - (horse.bank ?? 0)) * Math.min(1, h / WORLD.mount.motion.bankLag);
    // Driven faster than a walk through mud that holds its legs, it founders now and then (fieldworks.js horseFounders): down it goes, its rider thrown.
    const founders = horseFounders(horse, horse.sunk);
    if (founders > 0 && world.random() < 1 - Math.exp(-founders * h)) bringDown(world, horse, 'founders in the mud');
  }
  const f = forwardOf(horse.yaw);
  const before = [horse.at[0], horse.at[1]];
  horse.at[0] += (f[0] * horse.speed + horse.shove[0]) * h;
  horse.at[1] += (f[2] * horse.speed + horse.shove[1]) * h;
  // Fieldworks: a wall or a ditch's lip stops it, a stake's point goes into it (fieldworks.js).
  if (world.arena.works) horseOnWorks(world, horse, before, HORSE_HURT);
  // What a crash shoved it sideways by dies away as its legs find the ground.
  const settle = Math.exp(-h * WORLD.mount.crash.shoveDecay);
  horse.shove[0] *= settle;
  horse.shove[1] *= settle;
  horse.shock *= Math.exp(-h / WORLD.mount.crash.shockSeconds);
  const arena = world.arena;
  const margin = 0.9 * horse.withers;
  const clamped = [Math.max(-(arena.halfX - margin), Math.min(arena.halfX - margin, horse.at[0])), Math.max(-(arena.halfZ - margin), Math.min(arena.halfZ - margin, horse.at[1]))];
  if (clamped[0] !== horse.at[0] || clamped[1] !== horse.at[1]) {
    // Into the barrier: it pulls up there.
    horse.at = clamped;
    horse.speed *= Math.exp(-h * 6);
  }
  const gait = gaitAt(horse.speed);
  const stride = horse.stride;
  horse.stride = (horse.stride + gait.hz * h) % 1;
  horse.velocity = [f[0] * horse.speed + horse.shove[0], 0, f[2] * horse.speed + horse.shove[1]];
  poseHorse(horse);
  if (world.ear && horse.state === 'up' && gait.hz > 0) hoofBeats(world, horse, gait, stride);
  const rider = horse.rider === null ? null : world.fighters[horse.rider];
  if (rider?.mount === horse) absorbMotion(rider, horse, h);
}

/**
 * Heard: each hoof that came down this substep, where it is: a leg's stance begins as its phase in the stride passes 0 (poseHorse),
 * so a walk is four beats, a trot two, a canter three and a gallop four, as the gait's table times them.
 */
function hoofBeats(world, horse, gait, before) {
  for (const leg of HORSE_SHAPE.legs) {
    const phase = gait.phase[leg.key];
    if ((horse.stride + phase) % 1 >= (before + phase) % 1) continue;
    const hoof = horse.legs[leg.key].hoof;
    soundEvent(world, 'horse', { at: hoof, kind: 'hoof', gait: gait.name, speed: Math.abs(horse.speed), surface: surfaceAt(world, hoof[0], hoof[1], hoof[2]), mass: ladenMass(world, horse), horse: horse.id, leg: leg.key });
  }
}

/** A horse's cry (a neigh in pain, as it goes down), from its head. */
function horseCry(world, horse, kind) {
  const head = horse.capsules.find((capsule) => capsule.key === 'head')?.b ?? [horse.at[0], horse.withers, horse.at[1]];
  soundEvent(world, 'horse', { at: head, kind, gait: gaitAt(horse.speed).name, speed: Math.abs(horse.speed), surface: surfaceAt(world, horse.at[0], 0, horse.at[1]), mass: ladenMass(world, horse), horse: horse.id });
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
  const seat = seatOf(horse);
  const f = forwardOf(horse.yaw);
  const l = leftOf(horse.yaw);
  const points = {};
  // His hips and thighs are at the saddle; his pelvis is carried at the height his lower back lets it (absorbMotion).
  points[P.pelvis] = fighter.seated ? [seat[0], fighter.seated.y, seat[2]] : seat;
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

/** Where the saddle's seat is now (m), with the horse's body rising, pitching and rocking under it. */
function seatOf(horse) {
  const W = horse.withers;
  return vec.add(horsePoint(horse, [HORSE_SHAPE.seat[0] * W, HORSE_SHAPE.seat[1] * W, 0]), [0, WORLD.mount.seatHeight, 0]);
}

/**
 * The rider takes up the horse's motion, once a substep (a damped spring, WORLD.mount.motion
 * `seatSpring`): the height his trunk is carried at follows the saddle's rise and fall with a
 * lag, his lower back absorbing what his hips are given (his hips and thighs are held to the
 * saddle: seatRider). A spring of a natural frequency below the stride's bounce lets a trot's
 * jolt through reduced and late, and follows a walk's sway nearly exactly.
 */
function absorbMotion(fighter, horse, h) {
  const spec = WORLD.mount.motion.seatSpring;
  const seat = seatOf(horse)[1];
  const carry = (fighter.seated ??= { y: seat, v: 0, lean: 0, leanV: 0 });
  const omega = Math.PI * 2 * spec.hz;
  carry.v += (omega * omega * (seat - carry.y) - 2 * spec.damping * omega * carry.v) * h;
  carry.y += carry.v * h;
}

/**
 * How the rider's trunk sits on the moving horse, once a step: leaned forward by the gait
 * (the faster, the further), rocked back and forth by the horse's pitch (a canter's
 * three-beat rock, a gallop's surge) and thrown back as it gets away, followed with a lag by a
 * spring (WORLD.mount.motion `lean`); and leaned a little across with the horse's rock.
 * Returns { lean, roll } in rad for his pose.
 */
export function ridingLean(fighter, dt) {
  const horse = fighter.mount;
  const spec = WORLD.mount.motion.lean;
  const carry = (fighter.seated ??= { y: seatOf(horse)[1], v: 0, lean: 0, leanV: 0 });
  const speed = Math.abs(horse.speed);
  let gait = 0;
  for (const [name, weight] of gaitWeights(speed)) gait += weight * (spec[name] ?? 0);
  // (Making a blow, he holds his trunk to the gait's lean: the rocking does not carry his weapon off its mark.)
  const rock = fighter.punch ? 0 : 1;
  const target = horse.state === 'up' ? gait - rock * (spec.follow * (horse.pitch ?? 0) + spec.surge * (horse.acceleration ?? 0)) : 0;
  const omega = Math.PI * 2 * spec.hz;
  // (Sub-stepped: the spring is stiff for a 60 Hz step.)
  const steps = Math.max(1, Math.ceil(dt / 0.004));
  for (let k = 0; k < steps; k += 1) {
    carry.leanV += (omega * omega * (target - carry.lean) - 2 * spec.damping * omega * carry.leanV) * (dt / steps);
    carry.lean += carry.leanV * (dt / steps);
  }
  // (His trunk goes in with the horse's lean into a turn: his seat is on the leaned horse and he sits to its line.)
  return { lean: carry.lean, roll: -0.6 * (horse.rock ?? 0) + (horse.bank ?? 0) };
}

/**
 * Leaning out of the saddle to his man (WORLD.mount.reach), once a step: through a blow with a blade, his trunk is
 * tipped over about his hips toward the mark of the blow (its `aim`, in his frame, steered on while it is in the air)
 * as far as brings it within the distance the stroke is made at, and no further than `most`; between blows, and once the
 * blade has gone through, he comes back up. The lean is the pose's (pose.js `reachOut`): the muscles take his trunk
 * there as they take it anywhere, and the stroke goes from where his shoulder then is (physics.js strokeTargets).
 * Returns { tilt, toward, shift } (rad; a way on the floor in his frame; how far his weapon shoulder went, m in his
 * frame) while he leans, else null.
 */
export function saddleReach(fighter, dt) {
  const spec = WORLD.mount.reach;
  const carry = (fighter.seated ??= { y: seatOf(fighter.mount)[1], v: 0, lean: 0, leanV: 0 });
  const reach = (carry.reach ??= { tilt: 0, v: 0, toward: [1, 0, 0], shift: [0, 0, 0], side: 'r' });
  const wanted = reachWanted(fighter, reach);
  const target = wanted ?? 0;
  const omega = Math.PI * 2 * (target > reach.tilt ? spec.inHz : spec.outHz);
  // (Sub-stepped, as the gait's lean.)
  const steps = Math.max(1, Math.ceil(dt / 0.004));
  for (let k = 0; k < steps; k += 1) {
    reach.v += (omega * omega * (target - reach.tilt) - 2 * spec.damping * omega * reach.v) * (dt / steps);
    reach.tilt += reach.v * (dt / steps);
  }
  reach.tilt = Math.max(0, Math.min(spec.most, reach.tilt));
  if (reach.tilt < 1e-3) {
    reach.shift = [0, 0, 0];
    return null;
  }
  const pelvis = fighter.desired[P.pelvis];
  const shoulder = vec.sub(uprightShoulder(fighter, reach), pelvis);
  reach.shift = vec.sub(tiltToward(shoulder, reach.toward, reach.tilt), shoulder);
  return reach;
}

/**
 * Where a rider's shoulder (a point in the world, `shoulder`) goes leaned out of the saddle as far as he leans
 * (WORLD.mount.reach `most`) toward a mark in the world: what his reckoning of a blow's reach goes by (riding.js).
 */
export function leanedShoulder(fighter, shoulder, mark) {
  const pelvis = point(fighter.x, P.pelvis);
  const flat = [mark[0] - pelvis[0], 0, mark[2] - pelvis[2]];
  const out = Math.hypot(flat[0], flat[2]);
  if (out < 1e-3) return shoulder;
  return vec.add(pelvis, tiltToward(vec.sub(shoulder, pelvis), [flat[0] / out, 0, flat[2] / out], WORLD.mount.reach.most));
}

/** His weapon shoulder as it would be sitting up (his frame): where his pose has it, the lean taken back out. */
function uprightShoulder(fighter, reach) {
  const pelvis = fighter.desired[P.pelvis];
  const leaned = vec.sub(fighter.desired[P[`${reach.side}Shoulder`]], pelvis);
  const posed = fighter.intent?.reachOut;
  return posed ? vec.add(pelvis, tiltToward(leaned, posed.toward, -posed.tilt)) : vec.add(pelvis, leaned);
}

/**
 * The distance (m) from his shoulder at which a blow with a blade is made, as on foot: the arm `easy` out, and beyond it
 * the blade's contact share of its length (a cut), or its length less the depth it goes in (a thrust).
 */
function strokeDistance(fighter, spec, blade) {
  const L = fighter.body.lengths;
  const arm = WORLD.mount.reach.easy * (L.upperArm + L.forearmToFist);
  return spec.mode === 'thrust' ? arm + blade.spec.length - (spec.depth ?? 0.25) : arm + blade.spec.length * contactShare(spec, blade.spec);
}

/** How far over (rad) the blow in hand wants him: none without a blade blow going, or with a mark already within the stroke's distance. */
function reachWanted(fighter, reach) {
  const punch = fighter.punch;
  const spec = punch?.spec;
  if (!spec || spec.path !== 'blade' || spec.couched || punch.load > 0 || punch.t > spec.extendUntil) return null;
  const blade = bladeFor(fighter, spec);
  if (!blade?.held) return null;
  const pelvis = fighter.desired[P.pelvis];
  const flat = [punch.aim[0] - pelvis[0], 0, punch.aim[2] - pelvis[2]];
  const out = Math.hypot(flat[0], flat[2]);
  if (out < 1e-3) return null;
  reach.side = blade.main;
  reach.toward = [flat[0] / out, 0, flat[2] / out];
  const lean = WORLD.mount.reach;
  const easy = strokeDistance(fighter, spec, blade);
  const shoulder = vec.sub(uprightShoulder(fighter, reach), pelvis);
  // The least lean that brings the mark within the stroke's distance of his shoulder: tried in `steps` from upright to `most`.
  for (let k = 0; k <= lean.steps; k += 1) {
    const tilt = (lean.most * k) / lean.steps;
    if (vec.length(vec.sub(punch.aim, vec.add(pelvis, tiltToward(shoulder, reach.toward, tilt)))) <= easy) return tilt;
  }
  return lean.most;
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
  const decay = Math.exp(-WORLD.balance.absorbPerSecond * world.lastDt);
  fighter.knock = fighter.knock.map((value) => value * decay);
  // (The speed his horse lost to a crash, as he still has it: he is flung with it if he goes.)
  const lost = fighter.joltLost ?? [0, 0, 0];
  fighter.joltLost = lost.map((value) => value * decay);
  const seat = WORLD.mount.seat;
  // (What his knees held of the speed his horse lost goes with it, not with him.)
  const flung = lost.map((value) => value * (1 - seat.grip));
  if (fighter.state !== 'up') return unhorse(world, fighter, fighter.state === 'out' ? 'slumps from the saddle' : 'falls from the saddle', false, flung);
  if (horse.state !== 'up') {
    // A horse going down slowly lets him step clear: carried down with it, not flung.
    if (Math.abs(horse.speed) < seat.kickFree) return unhorse(world, fighter, 'comes off as his horse goes down', true, flung, seat.carried);
    return unhorse(world, fighter, 'thrown as his horse goes down', true, flung);
  }
  // (Leaning out of the saddle to strike, his weight is off the horse's line: the seat holds that much less.)
  const leaning = (fighter.seated?.reach?.tilt ?? 0) / WORLD.mount.reach.most;
  if (knock > seat.speed * fighter.body.gear.balance * (1 - WORLD.mount.reach.seat * leaning)) return unhorse(world, fighter, `knocked from the saddle (${knock.toFixed(1)} m/s)`, true, flung);
}

/**
 * The mass (kg) behind a blow from the saddle, on top of the arm: the rider's
 * body and a share of the horse's, as rigidly as the weapon is coupled to
 * them along the line the target presses back (WORLD.mount.coupling). The
 * form is the move's grip and mode (a couched lance, a spear thrust held
 * under the arm, a swung or one-handed point or cut), the line the blow's
 * velocity relative to what it meets, against the horse's own line.
 */
export function mountedBehind(fighter, spec, relative) {
  const coupling = WORLD.mount.coupling;
  const form = spec.couched ? 'couched' : `${spec.grip === 'two' ? 'two' : 'one'}${spec.mode === 'thrust' ? 'Thrust' : 'Swing'}`;
  const speed = vec.length(relative);
  const ahead = speed > 1e-6 ? Math.abs(vec.dot(relative, forwardOf(fighter.mount.yaw))) / speed : 1;
  const share = (spec.coupling ?? coupling.forms[form]) * (coupling.across + (1 - coupling.across) * ahead);
  return share * (fighter.body.massKg + coupling.horse * fighter.mount.mass);
}

/** The share of the horse's mass a blow on its rider must move with him (the seat). */
export function seatMass(fighter) {
  return fighter.body.massKg + WORLD.mount.seat.horseShare * fighter.mount.mass;
}

/**
 * Off the horse: from here he is a man on foot, falling from the saddle
 * with the horse's speed in him (his particles keep it, or `carried` of it). `thrown`: down, as
 * a fall (not counted as a knockdown). The horse runs off a while.
 */
export function unhorse(world, fighter, reason, thrown, lost = null, carried = 1) {
  const horse = fighter.mount;
  if (!horse) return;
  // He leaves with `carried` of the horse's speed (a slow fall: he comes off at half of it).
  if (carried < 1) {
    for (let index = 0; index < fighter.x.length / 3; index += 1) {
      for (const axis of [0, 2]) {
        fighter.v[index * 3 + axis] *= carried;
        fighter.prev[index * 3 + axis] = fighter.x[index * 3 + axis] - fighter.v[index * 3 + axis] * world.lastDt;
      }
    }
  }
  // He leaves the saddle at the speed the crash took from his horse, not the horse's new one.
  if (lost) {
    for (let index = 0; index < fighter.x.length / 3; index += 1) {
      for (const axis of [0, 2]) fighter.v[index * 3 + axis] += lost[axis];
    }
    fighter.joltLost = [0, 0, 0];
  }
  fighter.mount = null;
  fighter.seated = null;
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

/**
 * A heading turned back towards the middle when it would run the horse into the arena's edge: the floor's, or the
 * arena's own field for riders where walls close it in (`ride`: { x: [from, to], z: [from, to] }, m, and its own `edge`;
 * The Last Gate's field before its wall).
 */
export function steerInside(world, horse, heading, edge = WORLD.mount.edge) {
  const ahead = forwardOf(heading);
  const look = Math.max(4, Math.abs(horse.speed) * 1.2);
  const x = horse.at[0] + ahead[0] * look;
  const z = horse.at[1] + ahead[2] * look;
  const { halfX, halfZ, ride } = world.arena;
  edge = ride?.edge ?? edge;
  const [x0, x1] = ride?.x ?? [-halfX, halfX];
  const [z0, z1] = ride?.z ?? [-halfZ, halfZ];
  if (x > x0 + edge && x < x1 - edge && z > z0 + edge && z < z1 - edge) return heading;
  return Math.atan2((horse.at[1] - (z0 + z1) / 2) * 0.3, (x0 + x1) / 2 - horse.at[0]);
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
  attacker.stats.struckHorse += 1;
  const bladed = bladeStrike(attacker, weapon, punch, relative, distance);
  const along = bladed.along;
  // A long point set against the horse's charge, its butt to the ground and the man standing behind it: his weight is behind the point.
  const brace = WORLD.mount.brace;
  const set = !attacker.mount && spec.mode === 'thrust' && wspec.length >= brace.length && Math.hypot(...attacker.rootVelocity) < brace.still;
  const strikeMass = bladed.strikeMass + (set ? brace.share * attacker.body.massKg : 0);
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
    speed: closing, impulse, energy, strikeMass, harm: blunt, cut, pierce, point: contactPoint, normal, effects: [],
  };
  if (glanced) {
    event.effects.push('glanced off the barding');
    world.events.push({ time: world.time, kind: 'glance', fighter: -1, point: contactPoint, normal });
  }
  harmHorse(world, horse, capsule, { blunt, cut, pierce }, event, attacker);
  // The blow pushes the horse back, by its momentum over the laden horse's mass.
  event.pushed = jolt(world, horse, vec.scale(normal, -impulse / ladenMass(world, horse)), 'brought down by the blows');
  // The blade is jarred by what it met, and the arm takes the blow back; a lance (`shatters`) breaks on heavy barding, else is kept.
  const shattered = shattersOn(weapon, spec.mode, protection, energy);
  if (shattered) event.effects.push(`the ${wspec.label.toLowerCase()} shattered`);
  else if (!wspec.shatters) strainGrip(world, attacker, impulse * (glanced ? 0.3 : 0.15), [0, 0, 0], weapon);
  const recoil = [[main, 1], [P[`${weapon.main}Elbow`], 0.7], [P[`${weapon.main}Shoulder`], 0.35]];
  world.pendingImpulses.push({ fighter: attacker, shares: recoil, direction: normal, impulse: impulse * (1 + WORLD.weaponTransferRestitution.edge) / (1 + WORLD.restitution) });
  world.events.push(event);
  if (shattered) dropWeapon(world, attacker, 'shattered');
  // Heard: the blow on the horse (on its barding, or its hide), and an edge or a point in it makes it scream.
  if (world.ear) {
    const striker = mix.cut + mix.pierce <= mix.blunt ? 'blunt' : mix.pierce > mix.cut ? 'point' : 'blade';
    soundEvent(world, 'hit', { at: contactPoint, energy, impulse, striker, covering: (protection.blunt ?? 0) > 0 ? horse.barding : 'flesh', part: capsule.key, braced: false, who: -1, by: attacker.id, horse: horse.id });
    if (cut + pierce > 0.5) horseCry(world, horse, 'neigh');
  }
  return true;
}

/**
 * Harm to a horse: a deep edge or point bleeds it (as a man's wound, BLADES.bleed;
 * its blood is ~8% of its weight, so the same wound is a smaller share than a man's), a point in
 * its chest or neck past the lethal depth opens the heart or the great
 * vessels (down in `heartSeconds`), a leg cut or broken cripples it, a heavy
 * blow to the head drops it, and blunt harm summed on its body kills it.
 */
export function harmHorse(world, horse, capsule, { blunt, cut, pierce }, event, attacker = null) {
  const spec = WORLD.mount.horse;
  const share = spec.manBlood / horse.mass;
  const zone = capsule.part === 'legs' ? 'limb' : capsule.part === 'head' ? 'head' : 'trunk';
  const bleed = (bleedRate('cut', cut, zone) + bleedRate('pierce', pierce, zone)) * share;
  horse.bleed += bleed;
  horse.wounds[capsule.key] = (horse.wounds[capsule.key] ?? 0) + cut + pierce + blunt;
  if (attacker) horse.lastHitBy = attacker.id;
  if (cut > 1) event.effects.push(cut > 60 ? 'a deep cut' : 'cut');
  if (pierce > 1) event.effects.push(pierce > 40 ? 'run through' : 'stabbed');
  if ((capsule.part === 'chest' || capsule.part === 'neck') && pierce > BLADES.lethalPierce * BODY.toughness * Math.sqrt(horse.mass / spec.manBlood)) {
    horse.bleed += bleedToLose(collapseShare() - horse.bloodLost, spec.heartSeconds);
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

// What the fieldworks do to a horse, by this module's own means (fieldworks.js cannot import them: it is imported here).
const HORSE_HURT = { jolt: (...args) => jolt(...args), harm: (...args) => harmHorse(...args) };

/** Down it goes (once): over onto a side, and its rider thrown (keepSeat). */
export function bringDown(world, horse, reason) {
  if (horse.state !== 'up') return;
  horse.state = 'falling';
  horse.fall = 0;
  horse.side = world.random() < 0.5 ? 1 : -1;
  // (A horse that founders in the mud is down floundering, not dead: it lies there as one on a broken leg does.)
  horse.dead = reason !== 'founders in the mud' && (!horse.lame || reason !== 'goes down on a broken leg');
  world.events.push({ time: world.time, kind: 'horseDown', horse: horse.id, rider: horse.rider ?? undefined, attacker: horse.lastHitBy, effects: [reason] });
  if (world.ear) horseCry(world, horse, 'neigh');
}


// ---- The horse's body against men and horses -------------------------------
//
// A horse is 300-600 kg, its rider and his kit another 80-150, and at a
// gallop (10-12 m/s) it carries 5-8 kN·s. What it runs into is an exchange of
// momentum between that laden mass and the mass it meets, nothing more:
// the impulse is the reduced mass times the closing speed (and a little for
// the rebound), the one gets it and the other has its opposite. A lone man
// of 80 kg has a tenth of the horse's mass: he takes ~1.1 times the horse's
// own speed and it loses a tenth of its own; a dense block of men moves
// less and the horse more; another horse of the same weight head-on takes
// the whole of its speed away.

/** A horse and what sits on it (kg): the mass a collision has to move. */
export function ladenMass(world, horse) {
  const rider = horse.rider === null ? null : world.fighters[horse.rider];
  return horse.mass + (rider?.mount === horse ? wholeManKg(rider) : 0);
}

/** All of a man (kg): his body, his kit and what he holds. */
function wholeManKg(fighter) {
  return fighter.body.masses.reduce((sum, kg) => sum + kg, 0);
}

/**
 * What a horse's part brings to a crash (physics.js crashBetween): its own mass
 * and, as far as the horse is going into the contact, the whole laden horse
 * (itself and its rider through the saddle).
 */
function horseParty(world, horse, capsule) {
  return { local: horse.mass * capsule.mass, whole: WORLD.balance.massShare * ladenMass(world, horse), velocity: horse.velocity ?? [0, 0, 0], supported: false };
}

/** Whether this pair's contact is a new meeting (one every `crash.cooldown` s: a horse pressing on a man is one crash, not one every substep). */
function meeting(world, key) {
  world.bumps ??= new Map();
  if (world.time - (world.bumps.get(key) ?? -Infinity) < WORLD.crash.cooldown) return false;
  world.bumps.set(key, world.time);
  return true;
}

/** The blunt harm (J) a crash does a horse's part: the energy it took up, a share of it, through its barding and as hard as the other's armour is. */
function horseCrashHarm(horse, capsule, energy, hard) {
  const barding = BARDING[horse.barding].parts[capsule.part];
  return energy * WORLD.crash.horse * (1 - (barding.blunt ?? 0)) * hard;
}

const LEG_PARTICLES = new Set([P.lKnee, P.rKnee, P.lFoot, P.rFoot]);

/** How a shove at the chest is shared among a man's particles: the knees and feet follow slower (`legs`), so he is tipped over backwards. */
function ragdollShares() {
  return Object.values(P).map((index) => [index, LEG_PARTICLES.has(index) ? WORLD.mount.trample.legs : 1]);
}

/**
 * A horse's speed changed by `delta` (m/s, a world vector) by what it struck:
 * along its line that is its pace, across it a shove (its own velocity, dying
 * away as its legs find the ground). Its rider goes on at the speed he had,
 * and the saddle has to take it (keepSeat). Past what a horse's legs can take
 * (WORLD.mount.crash) it goes down. Returns the size of the jolt (m/s): along
 * its line, and `lateral` of what came across.
 */
export function jolt(world, horse, delta, reason = 'brought down by the crash') {
  const spec = WORLD.mount.crash;
  const ahead = forwardOf(horse.yaw);
  const left = leftOf(horse.yaw);
  const along = vec.dot(delta, ahead);
  const across = vec.dot(delta, left);
  horse.speed += along;
  horse.shove[0] += left[0] * across;
  horse.shove[1] += left[2] * across;
  // Each knock adds to the shock its legs are taking, which fades in `shockSeconds`: a pile of men is a blow spread over a few frames.
  const size = Math.abs(along) + spec.lateral * Math.abs(across);
  horse.shock += size;
  const rider = horse.rider === null ? null : world.fighters[horse.rider];
  if (rider?.mount === horse) {
    rider.knock = rider.knock.map((value, axis) => value - delta[axis]);
    rider.joltLost = (rider.joltLost ?? [0, 0, 0]).map((value, axis) => value - delta[axis]);
  }
  if (horse.state === 'up' && horse.shock > spec.fall) bringDown(world, horse, reason);
  return size;
}

/**
 * The men standing close together with these (hips within `link` m, in
 * close order: a shield wall's frontage, a pike block's files): the block
 * a horse has to move.
 */
function packedWith(world, men) {
  const spec = WORLD.mount.trample;
  const block = new Set(men);
  const queue = [...men];
  while (queue.length && block.size < spec.most) {
    const one = point(queue.pop().x, P.pelvis);
    for (const other of world.fighters) {
      if (block.has(other) || other.mount || other.state !== 'up') continue;
      const at = point(other.x, P.pelvis);
      if (Math.hypot(at[0] - one[0], at[2] - one[2]) >= spec.link) continue;
      block.add(other);
      queue.push(other);
    }
  }
  return [...block];
}

/**
 * Horses against men on foot and against each other, once a substep. A
 * horse's barrel, neck and head against a man: see rideDown. Horses
 * against horses: see horsesMeet.
 */
export function collideHorses(world, h) {
  const horses = world.horses;
  if (!horses?.length) return;
  for (const horse of horses) {
    if (horse.state === 'down') continue;
    rideDown(world, horse);
    trodOn(world, horse);
  }
  for (let a = 0; a < horses.length; a += 1) {
    for (let b = a + 1; b < horses.length; b += 1) {
      if (horses[a].state !== 'down' && horses[b].state !== 'down') horsesMeet(world, horses[a], horses[b]);
    }
  }
}

/** A man of the horse's own side in its way: eased out of it (he steps aside, the lighter further), no blow, no harm. */
function yieldTo(horse, man, pelvis, neck, radius) {
  let deepest = null;
  for (const capsule of horse.capsules) {
    if (capsule.part === 'legs') continue;
    const closest = closestBetween(pelvis, neck, capsule.a, capsule.b);
    const offset = vec.sub(closest.onFirst, closest.onSecond);
    const gap = vec.length(offset) - radius - capsule.radius;
    if (gap >= 0 || (deepest && gap >= deepest.gap)) continue;
    const flat = [offset[0], 0, offset[2]];
    deepest = { gap, normal: vec.length(flat) > 1e-6 ? vec.normalize(flat) : [-forwardOf(horse.yaw)[2], 0, forwardOf(horse.yaw)[0]] };
  }
  if (!deepest) return;
  for (let index = 0; index < man.x.length / 3; index += 1) {
    for (const axis of [0, 2]) {
      man.x[index * 3 + axis] += deepest.normal[axis] * -deepest.gap;
      man.prev[index * 3 + axis] += deepest.normal[axis] * -deepest.gap;
    }
  }
  man.root[0] += deepest.normal[0] * -deepest.gap;
  man.root[1] += deepest.normal[2] * -deepest.gap;
}

/**
 * A horse (with its rider) running into men on foot. The men it touches,
 * and those standing in close order with them, are one block: its mass and
 * its velocity. Closing faster than `crash.from` the horse and the block
 * exchange momentum (the impulse reduced mass × closing × (1 + restitution),
 * the horse's speed changed by its share, the men's by theirs), and each man
 * is flung as a ragdoll: the impulse goes to every part of him through the
 * engine's pending impulses (shared, the knees and feet less), so he flies
 * with his own weight, is put down if his speed change is past what his
 * poise lets him take (`trample.fell`, raised for armour) or reels if near
 * it. Each man the horse touches is hurt by it as any two bodies meeting are
 * (physics.js crashHarm: the horse's part and the horse behind it, with its rider,
 * against his chest, or the shield arm on his shield), and the horse by the same.
 * The horse takes blunt harm from what it hit (through its barding) and,
 * if its own speed change is too much, goes down. Short of a blow the man
 * is only moved out of the way.
 */
function rideDown(world, horse) {
  const spec = WORLD.mount.trample;
  const touched = [];
  for (const fighter of world.fighters) {
    if (fighter.mount || (fighter.state === 'out' && fighter.outFor > 20)) continue;
    const pelvis = point(fighter.x, P.pelvis);
    if (Math.hypot(pelvis[0] - horse.at[0], pelvis[2] - horse.at[1]) > 1.6 * horse.withers) continue;
    const neck = point(fighter.x, P.neck);
    const radius = fighter.body.segments.trunk.skinRadius;
    // A man of its own side is not ridden down: he gives way (a horse and a man that yield to one another, as friendly horses do).
    if (fighter.corner === horse.corner) {
      yieldTo(horse, fighter, pelvis, neck, radius);
      continue;
    }
    let best = null;
    // His body: the trunk (hips to neck) and the breadth of his shoulders (joint to joint, the deltoid over them),
    // so a horse's chest that takes a man on the shoulder is not let through beside his spine.
    const shoulders = [point(fighter.x, P.lShoulder), point(fighter.x, P.rShoulder), fighter.body.segments.lUpperArm.skinRadius];
    for (const capsule of horse.capsules) {
      if (capsule.part === 'legs') continue;
      for (const [from, to, thick] of [[pelvis, neck, radius], shoulders]) {
        const closest = closestBetween(from, to, capsule.a, capsule.b);
        const offset = vec.sub(closest.onFirst, closest.onSecond);
        const gap = vec.length(offset) - thick - capsule.radius;
        if (gap >= 0 || (best && gap >= best.gap)) continue;
        const flat = [offset[0], 0, offset[2]];
        const normal = vec.length(flat) > 1e-6 ? vec.normalize(flat) : vec.normalize([forwardOf(horse.yaw)[2], 0, -forwardOf(horse.yaw)[0]]);
        best = { fighter, capsule, gap, normal, at: closest.onSecond };
      }
    }
    // A shield held in front of him is what the horse meets first.
    if (fighter.shield && fighter.state !== 'out') {
      const disc = shieldDisc(fighter);
      for (const capsule of horse.capsules) {
        if (capsule.part === 'legs') continue;
        const hit = shieldContact(capsule.a, capsule.b, disc, capsule.radius);
        if (!hit || (best && -hit.depth >= best.gap)) continue;
        const flat = [-hit.away[0], 0, -hit.away[2]];
        if (vec.length(flat) < 1e-6) continue;
        best = { fighter, capsule, gap: -hit.depth, normal: vec.normalize(flat), at: hit.point, shield: { disc, offCentre: vec.length(vec.sub(hit.point, disc.centre)) / disc.radius } };
      }
    }
    if (best) touched.push(best);
  }
  if (!touched.length) return;
  const touching = new Set(touched.map((entry) => entry.fighter));
  const block = packedWith(world, [...touching]);
  const weight = (fighter) => (touching.has(fighter) ? 1 : spec.behind);
  // The block as one body: what it weighs to the horse, and how fast it moves.
  const mass = block.reduce((sum, man) => sum + weight(man) * wholeManKg(man), 0);
  const moving = vec.scale(block.reduce((sum, man) => vec.add(sum, vec.scale(wholeVelocity(man), weight(man) * wholeManKg(man))), [0, 0, 0]), 1 / mass);
  const direction = vec.normalize(touched.reduce((sum, entry) => vec.add(sum, vec.scale(entry.normal, -entry.gap)), [0, 0, 0]));
  const deepest = touched.reduce((one, entry) => (entry.gap < one.gap ? entry : one));
  const laden = ladenMass(world, horse);
  // Out of its way: the deeper they overlap, the more of it each gives (the lighter moves further).
  const depth = -deepest.gap;
  const horseShare = mass / (laden + mass);
  horse.at[0] -= direction[0] * depth * horseShare;
  horse.at[1] -= direction[2] * depth * horseShare;
  for (const man of block) {
    const move = touching.has(man) ? depth * (1 - horseShare) : 0;
    if (move === 0) continue;
    for (let index = 0; index < man.x.length / 3; index += 1) {
      for (const axis of [0, 2]) {
        man.x[index * 3 + axis] += direction[axis] * move;
        man.prev[index * 3 + axis] += direction[axis] * move;
      }
    }
    man.root[0] += direction[0] * move;
    man.root[1] += direction[2] * move;
  }
  const closing = vec.dot(vec.sub(horseVelocityAt(horse, deepest.at), moving), direction);
  if (closing <= WORLD.crash.from) return;
  const { impulse } = crashOf(laden, mass, closing);
  const rider = horse.rider === null ? null : world.fighters[horse.rider];
  // The harm is the general crash's (physics.js crashBetween), done before they are put over: each man it
  // touches takes it in his trunk, as the part of the horse that met him takes it (its barrel, neck or
  // head, and the horse behind it, with its rider through the saddle).
  const crash = { time: world.time, kind: 'horseCrash', horse: horse.id, rider: horse.rider ?? undefined, speed: closing, impulse, energy: 0, block: block.length, target: deepest.capsule.key, effects: [] };
  for (const entry of touched) {
    const man = entry.fighter;
    const closingMan = vec.dot(vec.sub(horseVelocityAt(horse, entry.at), wholeVelocity(man)), direction);
    if (closingMan <= WORLD.crash.from || !meeting(world, `horse${horse.id}:${man.id}`)) continue;
    const hard = crashHardness(BARDING[horse.barding].parts[entry.capsule.part].blunt);
    if (entry.shield) {
      // On his shield: the arm and what is braced behind it take it.
      const met = crashBetween(horseParty(world, horse, entry.capsule), shieldParty(man), direction, closingMan);
      // (Heard: the horse's weight on his shield.)
      if (world.ear) soundHit(world, man, rider, 'shield', entry.at, { energy: met.energy, impulse: met.impulse, striker: 'body', covering: shieldCovering(man.shield) });
      shieldHarm(world, man, { crash: met, closing: closingMan, at: entry.at, normal: vec.scale(direction, -1), offCentre: entry.shield.offCentre, source: rider });
      const blunt = horseCrashHarm(horse, entry.capsule, met.energy, crashHardness(0.5));
      crash.energy += blunt;
      harmHorse(world, horse, entry.capsule, { blunt, cut: 0, pierce: 0 }, crash);
      continue;
    }
    const met = crashBetween(horseParty(world, horse, entry.capsule), fighterParty(man, 'trunk'), direction, closingMan);
    // (Heard: the horse's chest into him.)
    if (world.ear) soundHit(world, man, rider, 'trunk', entry.at, { energy: met.energy, impulse: met.impulse, striker: 'body', deltaV: met.impulse / met.massSecond });
    crashHarm(world, man, 'trunk', { impulse: met.impulse, mass: met.massSecond, closing: closingMan, energy: met.energy, point: entry.at, normal: direction, source: rider, hard });
    const blunt = horseCrashHarm(horse, entry.capsule, met.energy, crashHardness(man.body.gear.protection.blunt));
    crash.energy += blunt;
    harmHorse(world, horse, entry.capsule, { blunt, cut: 0, pierce: 0 }, crash);
  }
  for (const man of block) {
    const share = weight(man);
    const dv = (impulse * share) / mass;
    world.pendingImpulses.push({ fighter: man, shares: ragdollShares(), direction, impulse: dv * wholeManKg(man), braced: Infinity });
    if (man.state === 'out') continue;
    const effects = [`ridden down at ${closing.toFixed(1)} m/s`];
    // Put over by what he cannot take, or reeling from near it.
    const limit = spec.fell * (1 + spec.poiseGain * (poiseOf(man) - 1)) * man.body.gear.balance;
    const event = { time: world.time, kind: 'trampled', fighter: man.id, horse: horse.id, attacker: rider?.id, speed: closing, impulse: dv * wholeManKg(man), dv, block: block.length, effects };
    if (man.state === 'up') {
      // What his feet hold against the ground while the horse shoves him (physics.js groundBrace: more front-on, on a set shield) is no fling.
      const set = Boolean(man.shield) && (man.defence?.name === 'shieldBlock' || man.shieldPose === 'wall');
      const flung = Math.max(0, dv - groundBrace(man, direction, set));
      man.knock = [0, 0, 0];
      if (flung > limit) {
        effects.push(`knocked down, flung at ${dv.toFixed(1)} m/s`);
        fall(world, man, 'ridden down by a horse');
        event.fell = true;
      } else if (flung > limit * WORLD.stagger.startAt && stagger(world, man, flung / limit, event, true)) effects.push('reels');
    }
    if (!man.trampledAt || world.time - man.trampledAt > 0.5) {
      man.trampledAt = world.time;
      world.events.push(event);
    }
  }
  const size = jolt(world, horse, vec.scale(direction, -impulse / laden), 'goes down in a heap of the men it rode into');
  crash.dv = size;
  if (size > WORLD.mount.crash.fall * 0.4) {
    crash.effects.push(`its pace broken by ${size.toFixed(1)} m/s`);
    world.events.push(crash);
  }
}

/**
 * A hoof coming down on a man on the ground (a man knocked down in front of
 * a horse, or lying in its way): the horse's weight on that foot for the
 * length of a stride's stance (`hooves.stance` of its laden weight for
 * `hooves.seconds`) is an impulse on his trunk, taken as a crash with the ground behind him
 * through his armour, once a stride per hoof (`hooves.every`).
 */
function trodOn(world, horse) {
  const spec = WORLD.mount.hooves;
  const weight = ladenMass(world, horse) * WORLD.gravity;
  for (const fighter of world.fighters) {
    // (Its own side's men lying there it steps over.)
    if (fighter.mount || fighter.state === 'up' || fighter.corner === horse.corner || (fighter.state === 'out' && fighter.outFor > 20)) continue;
    const pelvis = point(fighter.x, P.pelvis);
    if (Math.hypot(pelvis[0] - horse.at[0], pelvis[2] - horse.at[1]) > 1.6 * horse.withers) continue;
    const neck = point(fighter.x, P.neck);
    const reach = fighter.body.segments.trunk.skinRadius + HORSE_SHAPE.legRadius * horse.withers;
    for (const leg of HORSE_SHAPE.legs) {
      const hoof = horse.legs[leg.key]?.hoof;
      // Down on the ground, in the stance (a hoof in the air touches nothing).
      if (!hoof || hoof[1] > spec.height * horse.withers) continue;
      const closest = closestBetween(hoof, hoof, pelvis, neck);
      if (vec.length(vec.sub(closest.onFirst, closest.onSecond)) > reach) continue;
      fighter.hoofed ??= {};
      const key = `${horse.id}:${leg.key}`;
      if (world.time - (fighter.hoofed[key] ?? -Infinity) < spec.every) continue;
      fighter.hoofed[key] = world.time;
      const impulse = weight * spec.stance * spec.seconds;
      // A crash with the ground behind him: the impulse on his trunk with the whole of him braced behind it.
      const lying = fighterParty(fighter, 'trunk').whole;
      // (Heard: a hoof on a man lying there.)
      if (world.ear) soundHit(world, fighter, horse.rider === null ? null : world.fighters[horse.rider], 'trunk', hoof, { energy: (impulse * impulse) / (2 * lying), impulse, striker: 'blunt', deltaV: impulse / lying });
      crashHarm(world, fighter, 'trunk', { impulse, mass: lying, closing: impulse / lying, energy: (impulse * impulse) / (2 * lying), point: hoof, normal: [0, 1, 0], source: horse.rider === null ? null : world.fighters[horse.rider] });
      world.pendingImpulses.push({ fighter, shares: [[P.pelvis, 1], [P.neck, 1]], direction: [0, -1, 0], impulse, braced: Infinity });
      if (!fighter.trampledAt || world.time - fighter.trampledAt > 0.5) {
        fighter.trampledAt = world.time;
        world.events.push({ time: world.time, kind: 'trampled', fighter: fighter.id, horse: horse.id, attacker: horse.rider ?? undefined, speed: Math.abs(horse.speed), impulse, effects: ['trodden by a hoof'] });
      }
    }
  }
}

/**
 * Two horses meeting: where their barrels, necks and heads overlap they are
 * eased apart (the lighter further) and, if closing, exchange momentum by
 * their laden masses along the contact (each with its rider), the impulse
 * reduced mass × closing × (1 + restitution). Each is jolted by its own
 * share (jolt: its pace along its line, a shove across it, its rider
 * flung forward, down if past what its legs take: head-on is worst, a
 * glancing pass mostly a shove) and hurt by the energy of the crash (the general crash, physics.js).
 */
function horsesMeet(world, first, second) {
  if (Math.hypot(first.at[0] - second.at[0], first.at[1] - second.at[1]) > 1.6 * (first.withers + second.withers)) return;
  let deepest = null;
  for (const one of first.capsules) {
    if (one.part === 'legs') continue;
    for (const two of second.capsules) {
      if (two.part === 'legs') continue;
      const closest = closestBetween(one.a, one.b, two.a, two.b);
      const offset = vec.sub(closest.onFirst, closest.onSecond);
      const gap = vec.length(offset) - one.radius - two.radius;
      if (gap >= 0 || (deepest && gap >= deepest.gap)) continue;
      deepest = { one, two, gap, offset, at: vec.lerp(closest.onFirst, closest.onSecond, 0.5) };
    }
  }
  if (!deepest) return;
  const flat = [-deepest.offset[0], 0, -deepest.offset[2]];
  // From the first to the second.
  const normal = vec.length(flat) > 1e-6 ? vec.normalize(flat) : vec.normalize([second.at[0] - first.at[0], 0, second.at[1] - first.at[1]]);
  const a = ladenMass(world, first);
  const b = ladenMass(world, second);
  const depth = -deepest.gap;
  first.at[0] -= normal[0] * depth * (b / (a + b));
  first.at[1] -= normal[2] * depth * (b / (a + b));
  second.at[0] += normal[0] * depth * (a / (a + b));
  second.at[1] += normal[2] * depth * (a / (a + b));
  const closing = vec.dot(vec.sub(horseVelocityAt(first, deepest.at), horseVelocityAt(second, deepest.at)), normal);
  if (closing <= 0.1) return;
  // Horses of one side brushing or crowding each other (closing slower than `crash.alliedFrom`): eased apart and their
  // paces evened out, as two bodies that yield (no restitution), their riders carried: no knock, no shock, no harm.
  if (first.corner === second.corner && closing < WORLD.mount.crash.alliedFrom) {
    const push = (a * b) / (a + b) * closing;
    first.shove[0] -= (normal[0] * push) / a;
    first.shove[1] -= (normal[2] * push) / a;
    second.shove[0] += (normal[0] * push) / b;
    second.shove[1] += (normal[2] * push) / b;
    return;
  }
  const { impulse } = crashOf(a, b, closing);
  const sizes = [jolt(world, first, vec.scale(normal, -impulse / a)), jolt(world, second, vec.scale(normal, impulse / b))];
  // The crash of the parts that met (a chest, a neck, a head, and the horse behind it as far as it is going in): blunt harm to each, through its barding.
  if (!meeting(world, `horses${Math.min(first.id, second.id)}:${Math.max(first.id, second.id)}`)) return;
  const met =crashBetween(horseParty(world, first, deepest.one), horseParty(world, second, deepest.two), normal, closing);
  [[first, deepest.one, sizes[0], second], [second, deepest.two, sizes[1], first]].forEach(([horse, capsule, size, other]) => {
    const blunt = horseCrashHarm(horse, capsule, met.energy, crashHardness(BARDING[other.barding].parts[other === first ? deepest.one.part : deepest.two.part].blunt));
    const crash = { time: world.time, kind: 'horseCrash', horse: horse.id, rider: horse.rider ?? undefined, other: other.id, speed: closing, impulse, energy: blunt, dv: size, target: capsule.key, effects: [`horses collide at ${closing.toFixed(1)} m/s`] };
    harmHorse(world, horse, capsule, { blunt, cut: 0, pierce: 0 }, crash);
    world.events.push(crash);
  });
}
