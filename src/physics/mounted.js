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
import { BARDING, bardingAt, breedOf, HORSE_LOAD, mountOf } from '../horses.js';
import { DOG_JUMP } from '../robotdogs.js';
import { tiltToward, vec, yawRotate, twoBoneIK } from '../pose.js';
import { BLADES, bleedRate, bleedToLose, contactShare, harmMix, shieldContact } from '../weapons.js';
import { knockOut, bladeFor, bladeStrike, closestBetween, crashBetween, dropWeapon, crashHardness, crashHarm, crashOf, fall, fighterParty, placeFighter, groundBrace, handVelocityOf, heldBlades, point, poiseOf, shakenLoose, shieldDisc, shieldHarm, shieldParty, shattersOn, stagger, strainGrip, strikeLiveUntil, strokeOf, wholeVelocity } from '../physics.js';
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

/**
 * A mount's own gait at its speed (a robot dog's are its own: robotdogs.js), and its strides a second. A robot's foot sweeps
 * back under it at the ground's speed while it is down (`duty` of a stride): past its longest sweep (`strideMost`) its legs
 * step faster, not further.
 */
function mountGait(horse) {
  const pace = Math.abs(horse.speed);
  return (horse.gaits ?? GAITS).find((gait) => pace <= gait.upTo);
}
function mountStrideRate(horse, gait) {
  return horse.spec?.robot && gait.hz > 0 ? Math.max(gait.hz, (Math.abs(horse.speed) * gait.duty) / (horse.shape.strideMost * horse.withers)) : gait.hz;
}

/** A rider's horse, for createWorld: under him, facing his way. */
export function createHorse(fighter, id, random) {
  const kit = mountOf(fighter.body.inputs);
  const breed = breedOf(kit.breed);
  const barding = BARDING[kit.barding];
  const coat = breed.coats[Math.floor(random() * breed.coats.length)];
  // His load: the man, what he wears and carries, and the horse's armour.
  const riderKg = fighter.body.masses.reduce((sum, mass) => sum + mass, 0) + (fighter.weapon?.spec.mass ?? 0);
  const load = riderKg + barding.mass;
  const over = Math.max(0, load / breed.mass - HORSE_LOAD.easy);
  const pace = Math.max(HORSE_LOAD.least, 1 - HORSE_LOAD.slows * over);
  const horse = {
    id, corner: fighter.corner, rider: fighter.id, breed: kit.breed, barding: kit.barding, finish: kit.finish, coat,
    spec: breed, withers: breed.withers, mass: breed.mass + barding.mass, load,
    // Its paces laden, and how hard it gets away (its own weight to its weight laden).
    paces: { gallop: breed.gallop * pace, canter: breed.canter * pace, trot: breed.trot, walk: breed.walk },
    accel: breed.accel * breed.mass / (breed.mass + load) * (1 + HORSE_LOAD.easy),
    at: [fighter.root[0], fighter.root[1]], yaw: fighter.yaw, speed: 0, yawRate: 0, shove: [0, 0], shock: 0,
    goal: { heading: fighter.yaw, speed: 0 }, goalAt: -Infinity,
    stride: 0, state: 'up', fall: 0, roll: 0, bleed: 0, bloodLost: 0, trauma: 0, wounds: {},
    capsules: [], legs: {},
    // Its shape and gaits (a robot dog's are its own: robotdogs.js).
    shape: breed.shape ?? HORSE_SHAPE, gaits: breed.gaits ?? GAITS,
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
  // (In a jump, `lift`: the body over where it stands, below it in the crouch: physics/mounted.js mountJump.)
  return [horse.at[0] + f[0] * x + l[0] * z, y + (horse.bob ?? 0) + (horse.lift ?? 0) - (horse.sunk ?? 0), horse.at[1] + f[2] * x + l[2] * z];
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
  // (A robot's controller holds its body level: robotdogs.js `level`.)
  if (horse.state !== 'up' || horse.spec?.level) return motion;
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
  const shape = horse.shape ?? HORSE_SHAPE;
  const gait = mountGait(horse);
  const rate = mountStrideRate(horse, gait);
  // (A robot's foot is down `duty` of the stride, sweeping back at the ground's speed: robotdogs.js.)
  const sweep = horse.spec?.robot ? Math.abs(horse.speed) * gait.duty : Math.abs(horse.speed);
  const stride = rate > 0 ? Math.min((shape.strideMost ?? 0.7) * W, sweep / rate) : 0;
  // The body rises and falls, pitches and rocks with the stride; and rocks on its legs from a push (a robot's recoil: `kick`).
  const motion = horseMotion(horse);
  horse.bob = motion.bob;
  horse.pitch = motion.pitch + (horse.kick?.pitch ?? 0);
  horse.rock = motion.rock + (horse.kick?.roll ?? 0);
  const capsules = horse.capsules;
  capsules.length = 0;
  for (const part of shape.parts) capsules.push({ key: part.key, part: part.part, a: horsePoint(horse, scale(part.a)), b: horsePoint(horse, scale(part.b)), radius: part.radius * W, mass: part.mass });
  const flying = horse.air?.phase === 'flight';
  for (const leg of shape.legs) {
    const root = scale(leg.root);
    let hoof;
    if (horse.severed?.has(leg.key)) {
      // Cut off at the hip: nothing below it (the piece lies where it fell: its debris).
      const at = horsePoint(horse, root);
      horse.legs[leg.key] = { root: at, knee: at, hoof: at, severed: true };
      continue;
    }
    if (flying) {
      // In the air: the feet tucked up under it.
      hoof = [root[0] + (leg.fore ? 0.04 : -0.04) * W, 0.03 * W + DOG_JUMP.tuck * (shape.upperLeg + shape.lowerLeg) * W, root[2]];
    } else if (horse.state !== 'up') {
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
    // (A hoof on the ground stays there as the body rises over it, pitches, and crouches or lands from a jump: the leg is longer or shorter.)
    if (horse.state === 'up' && !flying) hoof[1] -= horse.bob + horse.pitch * hoof[0] + (horse.lift ?? 0);
    // The knee bends forward on a foreleg, the hock back on a hind leg.
    const knee = twoBoneIK(root, hoof, shape.upperLeg * W, shape.lowerLeg * W, [leg.bend ?? (leg.fore ? 1 : -1), 0, 0]);
    const world = { root: horsePoint(horse, root), knee: horsePoint(horse, knee), hoof: horsePoint(horse, hoof) };
    horse.legs[leg.key] = world;
    capsules.push({ key: leg.key, part: 'legs', a: world.root, b: world.hoof, radius: shape.legRadius * W * 1.4, mass: leg.mass });
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
    // (Brought down in the air: it falls the rest of the way.)
    if (horse.air) stepMountJump(world, horse, h);
    horse.speed *= Math.exp(-h * 2.5);
    horse.yawRate = 0;
    horse.bank = 0;
    if (horse.state === 'falling') {
      horse.fall = Math.min(1, horse.fall + h / 0.9);
      horse.roll = horse.side * (Math.PI / 2) * horse.fall * horse.fall;
      if (horse.fall >= 1) horse.state = 'down';
    }
  } else if (horse.air && horse.air.phase !== 'land') {
    // Gathering for a jump, pushing off, or in the air: no steering (mountJump).
    stepMountJump(world, horse, h);
  } else {
    if (horse.air) stepMountJump(world, horse, h);
    const goal = horse.goal;
    // In soft ground it sinks by its weight on its hooves, and its legs are held there (fieldworks.js horseMire).
    const mire = world.arena.works ? horseMire(world, horse) : null;
    horse.sunk = mire?.sunk ?? 0;
    const top = (mire?.pace ?? 1) * horse.paces.gallop * (horse.lame ? 0.3 : 1) * (1 - 0.5 * Math.min(1, horse.bloodLost / collapseShare())) * (1 - WORLD.mount.stamina.slows * (horse.tire ?? 0));
    // It will not run onto stakes, a fence or a ditch before it (fieldworks.js horseBalks): it pulls up as hard as it can; too close to stop, it runs into them slower.
    // (What a robot could jump, short of its jump's height, it does not pull up for: it jumps it: riding.js robotJumps.)
    if (mire && horse.spec?.legs) horse.clearance = 0.85 * (mountJumpOf(world, horse)?.height ?? 0);
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
    // (A robot runs on its battery, hours of it: robotdogs.js `battery`.)
    if (!horse.spec?.robot) horse.tire = Math.max(0, Math.min(1, (horse.tire ?? 0) + h * (effort / stamina.gallopSeconds - (1 - effort) / stamina.restSeconds)));
    let turn = goal.heading - horse.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    const rate = turnRateAt(horse, horse.speed);
    const twist = horse.spec?.yawAccel;
    if (twist) {
      // A robot (robotdogs.js `yawAccel`): its yaw rate changes only as fast as its feet can twist its body round, and it
      // brakes the turn in time to stop on its heading (the fastest turn its feet allow); near it, it eases on.
      const want = Math.sign(turn) * Math.min(rate, Math.sqrt(2 * twist * Math.abs(turn)), 2 * Math.sqrt(twist) * Math.abs(turn));
      horse.yawRate += Math.max(-twist * h, Math.min(twist * h, want - horse.yawRate));
    } else horse.yawRate = Math.max(-rate, Math.min(rate, turn * 4));
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
  // What a crash shoved it sideways by dies away as its legs find the ground (in the air, it keeps it).
  const settle = horse.air && horse.air.phase !== 'land' ? 1 : Math.exp(-h * WORLD.mount.crash.shoveDecay);
  horse.shove[0] *= settle;
  horse.shove[1] *= settle;
  // A robot rocked on its legs (a recoil's `kick`): its controller springs it back level (robotdogs.js `stance`).
  if (horse.kick) {
    const stance = horse.spec.stance ?? { hz: 3, zeta: 0.6 };
    const omega = Math.PI * 2 * stance.hz;
    const kick = horse.kick;
    kick.pitchV += (-omega * omega * kick.pitch - 2 * stance.zeta * omega * kick.pitchV) * h;
    kick.pitch += kick.pitchV * h;
    kick.rollV += (-omega * omega * kick.roll - 2 * stance.zeta * omega * kick.rollV) * h;
    kick.roll += kick.rollV * h;
  }
  horse.shock *= Math.exp(-h / WORLD.mount.crash.shockSeconds);
  const arena = world.arena;
  const margin = 0.9 * horse.withers;
  const clamped = [Math.max(-(arena.halfX - margin), Math.min(arena.halfX - margin, horse.at[0])), Math.max(-(arena.halfZ - margin), Math.min(arena.halfZ - margin, horse.at[1]))];
  if (clamped[0] !== horse.at[0] || clamped[1] !== horse.at[1]) {
    // Into the barrier: it pulls up there.
    horse.at = clamped;
    horse.speed *= Math.exp(-h * 6);
  }
  const gait = mountGait(horse);
  const stride = horse.stride;
  horse.stride = (horse.stride + mountStrideRate(horse, gait) * h) % 1;
  horse.velocity = [f[0] * horse.speed + horse.shove[0], 0, f[2] * horse.speed + horse.shove[1]];
  poseHorse(horse);
  if (world.ear && horse.state === 'up' && gait.hz > 0 && !horse.spec?.robot) hoofBeats(world, horse, gait, stride);
  const rider = horse.rider === null ? null : world.fighters[horse.rider];
  if (rider?.mount === horse) absorbMotion(rider, horse, h);
}

// ---- A robot's jump --------------------------------------------------------
//
// A robot dog jumps as a body does (physics/jump.js, a man's): all four legs push it off through their stroke
// (robotdogs.js DOG_JUMP `stroke` of their length), with a force its knee motors give (`legs.knee` N·m through the thigh,
// at the middle of the stroke the knee's lever sin 45° of it) over all it weighs laden, no faster than its knees straighten
// (`legs.speed` rad/s through the same lever); the takeoff is the slower of the two, blended (1/v² = 1/vF² + 1/vS²). It
// crouches, pushes off along the way it means (up, a leap, aside), flies as anything thrown does (no steering in the air),
// and lands on its legs over the same stroke, the harder the faster it comes down.

/** What a robot's legs give a jump now (null: it has no legs for one): the takeoff speed (m/s), the stroke (m), the push (body weights), its height and reach (m). */
export function mountJumpOf(world, horse) {
  const legs = horse.spec?.legs;
  if (!legs) return null;
  const W = horse.withers;
  const thigh = horse.shape.upperLeg * W;
  const stroke = DOG_JUMP.stroke * (horse.shape.upperLeg + horse.shape.lowerLeg) * W;
  const mass = ladenMass(world, horse);
  const lever = thigh * Math.SQRT1_2;
  const sound = horse.shape.legs.filter((leg) => !horse.severed?.has(leg.key)).length;
  const push = (sound * legs.knee) / lever / (mass * WORLD.gravity);
  const forceSpeed = Math.sqrt(Math.max(0, 2 * (push - 1) * WORLD.gravity * stroke));
  const legSpeed = legs.speed * lever;
  const v = forceSpeed > 0 ? (forceSpeed * legSpeed) / Math.hypot(forceSpeed, legSpeed) : 0;
  return { v, stroke, push, height: stroke / 2 + (v * v) / (2 * WORLD.gravity), reach: stroke + (v * v) / WORLD.gravity };
}

/**
 * How far ahead (m) a robot running at its pace must start a jump to be off the ground and rising over something there:
 * the ground it covers crouching and pushing off, and a little more to be up.
 */
export function mountJumpLead(world, horse) {
  const model = mountJumpOf(world, horse);
  if (!model || model.v <= 0) return 0;
  return Math.abs(horse.speed) * (DOG_JUMP.crouch + (2 * model.stroke) / model.v + 0.06) + 0.1;
}

/** Why a robot cannot jump now (a word), or null. */
export function mountJumpBlocked(world, horse) {
  if (!horse?.spec?.legs) return 'no legs for it';
  if (horse.state !== 'up') return 'down';
  if (horse.air) return 'air';
  if (world.time < (horse.jumpReadyAt ?? -Infinity)) return 'recovering';
  if (horse.lame) return 'hurt';
  return null;
}

/**
 * A robot dog jumps (its rider, or the man playing it, asks): `kind` 'up', 'leap' or 'aside' (DOG_JUMP.angle: how steeply
 * it pushes off), along `heading` (rad, the world's; its own way if left out), on top of how it is going. False if it cannot.
 */
export function mountJump(world, horse, { kind = 'up', heading = horse.yaw } = {}) {
  if (mountJumpBlocked(world, horse)) return false;
  const model = mountJumpOf(world, horse);
  if (!model || model.v <= 0) return false;
  const angle = DOG_JUMP.angle[kind] ?? DOG_JUMP.angle.up;
  horse.air = { phase: 'crouch', t: 0, kind, heading, model, vy: model.v * Math.sin(angle), along: model.v * Math.cos(angle), from: [...horse.at], top: 0 };
  return true;
}

/** Each substep of a jump: the crouch, the push off (the body rising through the stroke), the flight, the landing. */
function stepMountJump(world, horse, h) {
  const jump = horse.air;
  const half = jump.model.stroke / 2;
  jump.t += h;
  // (Brought down before it was off: it was never off.)
  if (horse.state !== 'up' && (jump.phase === 'crouch' || jump.phase === 'push')) {
    jump.phase = 'flight';
    jump.vy = 0;
  }
  if (jump.phase === 'crouch') {
    const share = Math.min(1, jump.t / DOG_JUMP.crouch);
    horse.lift = -half * share * share * (3 - 2 * share);
    if (jump.t >= DOG_JUMP.crouch) Object.assign(jump, { phase: 'push', t: 0 });
    return;
  }
  if (jump.phase === 'push') {
    // Through the stroke at an even push, from the crouch to the legs straight: off at the takeoff speed.
    const pushSeconds = (2 * jump.model.stroke) / jump.model.v;
    const share = Math.min(1, jump.t / pushSeconds);
    horse.lift = -half + jump.model.stroke * share * share;
    if (share >= 1) {
      // Off: up, and along the way it meant at the push's speed that way, or its run's if that is faster (its feet on the
      // ground, its legs cannot push it on faster than they straighten: a running jump keeps its run, and rises).
      const forward = forwardOf(horse.yaw);
      const velocity = [forward[0] * horse.speed + horse.shove[0], forward[2] * horse.speed + horse.shove[1]];
      const way = [Math.cos(jump.heading), -Math.sin(jump.heading)];
      const already = velocity[0] * way[0] + velocity[1] * way[1];
      const added = Math.max(0, jump.along - already);
      velocity[0] += way[0] * added;
      velocity[1] += way[1] * added;
      horse.speed = velocity[0] * forward[0] + velocity[1] * forward[2];
      horse.shove = [velocity[0] - forward[0] * horse.speed, velocity[1] - forward[2] * horse.speed];
      Object.assign(jump, { phase: 'flight', t: 0, from: [...horse.at] });
      world.events.push({ time: world.time, kind: 'jump', horse: horse.id, rider: horse.rider ?? undefined, jumpKind: jump.kind, height: jump.model.height, effects: [`jumps (${jump.kind})`] });
    }
    return;
  }
  if (jump.phase === 'flight') {
    jump.vy -= WORLD.gravity * h;
    horse.lift += jump.vy * h;
    jump.top = Math.max(jump.top, horse.lift);
    // Its feet (the legs straight under it) meet the ground.
    if (horse.lift <= half && jump.vy < 0) {
      const impact = -jump.vy;
      // Its legs stop it over their stroke: the force that takes, in body weights, against what they push with.
      const asked = (impact * impact) / (2 * WORLD.gravity * jump.model.stroke) + 1;
      const ratio = asked / Math.max(1, jump.model.push);
      Object.assign(jump, { phase: 'land', t: 0, impact, ratio, dip: half * Math.min(1.6, 0.3 + ratio), start: horse.lift });
      world.events.push({ time: world.time, kind: 'touchdown', horse: horse.id, rider: horse.rider ?? undefined, speed: impact, ratio, distance: Math.hypot(horse.at[0] - jump.from[0], horse.at[1] - jump.from[1]), height: jump.top, effects: [ratio > 1 ? 'lands hard' : 'lands'] });
      if (horse.state !== 'up') {
        horse.lift = 0;
        horse.air = null;
      }
    }
    return;
  }
  // Landed: down through the dip as its legs take it, and up again to stand (`land` s).
  const share = Math.min(1, jump.t / DOG_JUMP.land);
  const down = Math.min(1, share * 3);
  const up = Math.max(0, (share - 1 / 3) * 1.5);
  horse.lift = share < 1 / 3 ? jump.start + (-jump.dip - jump.start) * down * (2 - down) : -jump.dip * (1 - up * up * (3 - 2 * up));
  if (share >= 1) {
    horse.lift = 0;
    horse.air = null;
    horse.jumpReadyAt = world.time + DOG_JUMP.recover;
  }
}

// ---- A turret on a robot's back ---------------------------------------------
//
// What a robot carries mounted (a weapon's `turret`: the Vision 60's SPUR) is laid by its pan and tilt motors, not swung by a
// wrist: each a servo that drives its axis toward the line to the mark at a rate proportional to how far off it is
// (`servo` /s), no faster than its motors slew (`slew` rad/s) and changing rate no faster than they accelerate it (`accel`
// rad/s²), between its stops (`pan` either way of the robot's line, `tilt` [down, up]). Its angles are its own, measured on
// the robot's back, so they never wrap: the line to the mark is turned into them each substep, the robot's turning and its
// rocking taken out. The gun rides on its cradle with a little give (`mount`: Hz, damping), where the recoil throws it (the
// muzzle climbs: the bore is `bore` m above the trunnion, the gun and cradle `inertia` kg·m² about it) and it rings down;
// the same kick goes on through the mount into the robot (turretRecoil). The rider's gun hand (the receiver) is held where
// the gun is: its arm is not what aims it.

/** The turret's trunnion (world), over the robot's seat. */
function turretPivot(fighter, weapon) {
  const horse = fighter.mount;
  const seat = (horse.shape ?? HORSE_SHAPE).seat;
  return horsePoint(horse, [seat[0] * horse.withers, seat[1] * horse.withers + weapon.spec.turret.height, 0]);
}

/** A direction in the robot's frame (x ahead, y up, z its left), in the world: turned, pitched and rocked with it. */
function robotDirection(horse, local) {
  const origin = horsePoint(horse, [0, 0.76 * horse.withers, 0]);
  return vec.sub(horsePoint(horse, [local[0], 0.76 * horse.withers + local[1], local[2]]), origin);
}

/** The barrel's line at a pan and tilt (rad, the robot's frame) in the world. */
export function turretLine(horse, pan, tilt) {
  return vec.normalize(robotDirection(horse, [Math.cos(tilt) * Math.cos(pan), Math.sin(tilt), -Math.cos(tilt) * Math.sin(pan)]));
}

/**
 * Each substep: lay the turret toward `mark` (a world point; null: level, ahead), its gun on its cradle, and hold the
 * rider's gun hand to the receiver. Sets the weapon's line (`dir`), its turning (`spin`), its tip and the tip's speed.
 */
export function stepTurret(fighter, weapon, mark, h) {
  const horse = fighter.mount;
  const spec = weapon.spec.turret;
  const turret = (weapon.turret ??= { pan: 0, tilt: spec.rest, panV: 0, tiltV: 0, climb: 0, climbV: 0, swing: 0, swingV: 0, rate: 0, panWanted: 0, tiltWanted: spec.rest, panLead: 0, tiltLead: 0, seen: false });
  const pivot = turretPivot(fighter, weapon);
  // (Down, its motors are dead: it stays as it was.)
  const live = fighter.state === 'up' && horse.state === 'up';
  // The line to the mark, in the robot's frame (none: level, ahead).
  let panWanted = 0;
  let tiltWanted = spec.rest;
  if (mark && live) {
    const want = vec.normalize(vec.sub(mark, pivot));
    const ahead = vec.normalize(robotDirection(horse, [1, 0, 0]));
    const up = vec.normalize(robotDirection(horse, [0, 1, 0]));
    const left = vec.normalize(robotDirection(horse, [0, 0, 1]));
    const local = [vec.dot(want, ahead), vec.dot(want, up), vec.dot(want, left)];
    panWanted = Math.atan2(-local[2], local[0]);
    tiltWanted = Math.asin(Math.max(-1, Math.min(1, local[1])));
  }
  // How fast that line is moving across the robot (its own turning and rocking, the mark's going): the servo leads by it
  // (a stabilised mount's rate loop), so it holds a moving line without lagging behind it; smoothed over `lead` s, and
  // nothing when the mark is new, or behind a stop.
  const leadShare = Math.min(1, h / spec.lead);
  const seen = mark && live && turret.seen;
  const panMoving = seen ? Math.atan2(Math.sin(panWanted - turret.panWanted), Math.cos(panWanted - turret.panWanted)) / h : 0;
  const tiltMoving = seen ? (tiltWanted - turret.tiltWanted) / h : 0;
  turret.panLead = seen ? turret.panLead + (panMoving - turret.panLead) * leadShare : 0;
  turret.tiltLead = seen ? turret.tiltLead + (tiltMoving - turret.tiltLead) * leadShare : 0;
  turret.panWanted = panWanted;
  turret.tiltWanted = tiltWanted;
  turret.seen = Boolean(mark && live);
  const lay = (angle, rate, target, lead, low, high) => {
    const goal = Math.max(low, Math.min(high, target));
    const leading = goal === target ? lead : 0;
    const wanted = live ? Math.max(-spec.slew, Math.min(spec.slew, leading + (goal - angle) * spec.servo)) : 0;
    let next = rate + Math.max(-spec.accel * h, Math.min(spec.accel * h, wanted - rate));
    let at = angle + next * h;
    if (at < low || at > high) {
      at = Math.max(low, Math.min(high, at));
      next = 0;
    }
    return [at, next];
  };
  [turret.pan, turret.panV] = lay(turret.pan, turret.panV, panWanted, turret.panLead, -spec.pan, spec.pan);
  [turret.tilt, turret.tiltV] = lay(turret.tilt, turret.tiltV, tiltWanted, turret.tiltLead, spec.tilt[0], spec.tilt[1]);
  // The gun's give on its cradle, ringing down.
  const omega = Math.PI * 2 * spec.mount.hz;
  const damping = 2 * spec.mount.zeta * omega;
  turret.climbV += (-omega * omega * turret.climb - damping * turret.climbV) * h;
  turret.climb += turret.climbV * h;
  turret.swingV += (-omega * omega * turret.swing - damping * turret.swingV) * h;
  turret.swing += turret.swingV * h;
  const dir = turretLine(horse, turret.pan + turret.swing, turret.tilt + turret.climb);
  const up = vec.normalize(robotDirection(horse, [0, 1, 0]));
  const across = vec.cross(dir, up);
  const acrossUnit = vec.length(across) > 1e-6 ? vec.normalize(across) : [0, 0, 1];
  // Its turning: the robot's own about the vertical, the pan's about the robot's up, the tilt's across the barrel.
  weapon.spin = vec.add(vec.scale([0, 1, 0], horse.yawRate ?? 0), vec.add(vec.scale(up, turret.panV + turret.swingV), vec.scale(acrossUnit, turret.tiltV + turret.climbV)));
  turret.rate = Math.hypot(turret.panV + turret.swingV, turret.tiltV + turret.climbV);
  turret.pivot = pivot;
  weapon.dir = dir;
  // The receiver over the trunnion: the rider's gun hand held to it, carried at the robot's speed there.
  const main = P[`${weapon.main}Hand`];
  const receiver = vec.add(pivot, vec.scale(dir, spec.grip));
  turret.receiver = receiver;
  const velocity = horseVelocityAt(horse, receiver);
  for (let axis = 0; axis < 3; axis += 1) {
    fighter.x[main * 3 + axis] = receiver[axis];
    fighter.v[main * 3 + axis] = velocity[axis];
    fighter.prev[main * 3 + axis] = receiver[axis] - velocity[axis] * h;
  }
  weapon.tip = vec.add(receiver, vec.scale(dir, weapon.spec.length));
  weapon.tipVelocity = vec.add(velocity, vec.cross(weapon.spin, vec.scale(dir, weapon.spec.length)));
}

/**
 * Whether the turret lies on `mark` (a world point) as its sight sees it (on the receiver), within `within` rad (its
 * `lay`): its fire control looses then, and not before (not while the last kick still rings in it).
 */
export function turretLaid(weapon, mark, within = weapon.spec.turret.lay) {
  const turret = weapon.turret;
  if (!turret?.receiver || !mark) return true;
  const toMark = vec.normalize(vec.sub(mark, turret.receiver));
  return vec.dot(toMark, weapon.dir) >= Math.cos(within);
}

/**
 * A round fired from the turret: its recoil (N·s: the bullet's momentum and its powder gas's, the shot's `recoil`) back
 * along the barrel. On the cradle it climbs the muzzle (the bore above the trunnion: an angular impulse of recoil × bore on
 * the gun's inertia); through the mount it pushes the robot back (on its laden mass) and tips it on its legs (the bore that
 * high over its feet), forward and back or side to side as the gun points; its legs spring it back level (stepHorse).
 */
export function turretRecoil(world, fighter, weapon, impulse) {
  const horse = fighter.mount;
  const spec = weapon.spec.turret;
  const turret = weapon.turret;
  if (!horse || !turret) return;
  turret.climbV += (impulse * spec.bore) / spec.inertia;
  const mass = ladenMass(world, horse);
  const barrel = weapon.dir;
  const flat = Math.hypot(barrel[0], barrel[2]) || 1;
  horse.shove[0] -= (barrel[0] / flat) * ((impulse * flat) / mass);
  horse.shove[1] -= (barrel[2] / flat) * ((impulse * flat) / mass);
  // Rocked on its legs: standing, it tips about its feet (on the ground: the bore's height above them the lever), its body
  // a box of its length, breadth and depth carried at its hips' height (the parallel axes: its own inertia, and its mass
  // that high).
  const W = horse.withers;
  const shape = horse.shape ?? HORSE_SHAPE;
  const length = 2 * shape.parts[0].b[0] * W;
  const breadth = 2 * Math.abs(shape.legs[0].root[2]) * W;
  const depth = 2 * shape.parts[0].radius * W;
  const middle = shape.parts[0].a[1] * W;
  const lever = Math.max(0, (turret.pivot?.[1] ?? middle) + spec.bore - (horse.lift ?? 0));
  const kick = (horse.kick ??= { pitch: 0, pitchV: 0, roll: 0, rollV: 0 });
  kick.pitchV += (lever * impulse * flat * Math.cos(turret.pan)) / (mass * ((length * length + depth * depth) / 12 + middle * middle));
  kick.rollV += (lever * impulse * flat * Math.sin(turret.pan)) / (mass * ((breadth * breadth + depth * depth) / 12 + middle * middle));
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
  if (horse.spec?.robot) return;
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
  // (Bolted on, a robot's load is carried exactly with its back, through a jump too.)
  points[P.pelvis] = fighter.seated && !fighter.body.gear.bolted ? [seat[0], fighter.seated.y, seat[2]] : seat;
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
  const seat = (horse.shape ?? HORSE_SHAPE).seat;
  return vec.add(horsePoint(horse, [seat[0] * W, seat[1] * W, 0]), [0, horse.spec?.robot ? 0 : WORLD.mount.seatHeight, 0]);
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
  // Bolted to its mount (a robot dog's turret or arm: an outfit's `bolted`): never thrown; the robot down, it is out.
  if (fighter.body.gear.bolted) {
    if (horse.state !== 'up' && fighter.state !== 'out') knockOut(world, fighter, { time: world.time, kind: 'disabled', attacker: horse.lastHitBy ?? fighter.id, effects: [] }, 'the robot is down', 'disabled');
    return;
  }
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

/** Whether he can get down from his horse now: in the saddle, up, and the horse at a walk or slower (WORLD.mount.dismount). */
export function dismountReady(fighter) {
  const horse = fighter.mount;
  return Boolean(horse && fighter.state === 'up' && horse.state === 'up' && !horse.air && Math.abs(horse.speed) <= WORLD.mount.dismount.speed);
}

/** He gets down from his horse of his own will, onto his feet beside it on the side away from his weapon hand; the horse stands. */
export function dismount(world, fighter) {
  if (!dismountReady(fighter)) return false;
  const horse = fighter.mount;
  const side = yawRotate([0, 0, 1], horse.yaw);
  const at = [horse.at[0] + side[0] * WORLD.mount.dismount.beside, horse.at[1] + side[2] * WORLD.mount.dismount.beside];
  unhorse(world, fighter, 'gets down from his horse', false);
  // (Not bolting: a horse its rider got down from stands where it is.)
  horse.boltUntil = world.time;
  horse.goal = { heading: horse.yaw, speed: 0 };
  placeFighter(fighter, at[0], at[1]);
  fighter.yaw = horse.yaw;
  return true;
}

/** The riderless horse standing within reach of a man on his feet (WORLD.mount.dismount.reach), nearest first; null if none. */
export function horseToMount(world, fighter) {
  if (fighter.mount || fighter.state !== 'up' || fighter.crawling || fighter.punch || fighter.clinch) return null;
  const at = point(fighter.x, P.pelvis);
  let best = null;
  let bestDistance = WORLD.mount.dismount.reach;
  for (const horse of world.horses ?? []) {
    if (horse.state !== 'up' || horse.rider !== null || Math.abs(horse.speed) > WORLD.mount.dismount.speed || horse.air) continue;
    const distance = Math.hypot(horse.at[0] - at[0], horse.at[1] - at[2]);
    if (distance < bestDistance) {
      best = horse;
      bestDistance = distance;
    }
  }
  return best;
}

/** Up into the saddle of a riderless horse beside him (horseToMount): it is his now, whoever rode it. */
export function mountHorse(world, fighter, horse = horseToMount(world, fighter)) {
  if (!horse || horseToMount(world, fighter) !== horse) return false;
  horse.rider = fighter.id;
  horse.corner = fighter.corner;
  horse.goal = { heading: horse.yaw, speed: 0 };
  horse.boltUntil = -1;
  fighter.mount = horse;
  fighter.yaw = horse.yaw;
  fighter.running = false;
  fighter.runMode = false;
  seatRider(fighter, 1 / 60, true);
  world.events.push({ time: world.time, kind: 'mounted', fighter: fighter.id, horse: horse.id, effects: ['swings up into the saddle'] });
  return true;
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
  // (Where the blow lands: below a part's armour, the bare horse: horses.js bardingAt.)
  const landsAt = vec.add(closest.onSecond, vec.scale(normal, capsule.radius));
  const protection = bardingAt(horse.barding, capsule.part, landsAt[1] + (horse.sunk ?? 0), horse.withers);
  const sharp = weapon.edge ?? 1;
  const blunt = energy * mix.blunt * (1 - (protection.blunt ?? 0) * (1 - (wspec.crush ?? 0)));
  const cut = energy * mix.cut * (1 - (protection.cut ?? 0)) * sharp;
  const pierce = energy * mix.pierce * (1 - (protection.pierce ?? 0)) * sharp;
  const glanced = Boolean(protection.deflects) && mix.cut + mix.pierce > 0.2;
  const contactPoint = landsAt;
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
  // (A robot dog: its own limits, and no blood: robotdogs.js `harm`, `machine`.)
  const spec = { ...WORLD.mount.horse, ...horse.spec?.harm };
  const share = horse.spec?.machine ? 0 : spec.manBlood / horse.mass;
  const zone = capsule.part === 'legs' ? 'limb' : capsule.part === 'head' ? 'head' : 'trunk';
  const bleed = (bleedRate('cut', cut, zone) + bleedRate('pierce', pierce, zone)) * share;
  horse.bleed += bleed;
  horse.wounds[capsule.key] = (horse.wounds[capsule.key] ?? 0) + cut + pierce + blunt;
  if (attacker) horse.lastHitBy = attacker.id;
  if (cut > 1) event.effects.push(cut > 60 ? 'a deep cut' : 'cut');
  if (pierce > 1) event.effects.push(pierce > 40 ? 'run through' : 'stabbed');
  if (!horse.spec?.machine && (capsule.part === 'chest' || capsule.part === 'neck') && pierce > BLADES.lethalPierce * BODY.toughness * Math.sqrt(horse.mass / spec.manBlood)) {
    horse.bleed += bleedToLose(collapseShare() - horse.bloodLost, spec.heartSeconds);
    event.effects.push('through the heart');
  }
  // A robot's leg link cut right through (robotdogs.js `legSever`): off at the hip; it shorts out, and down it goes.
  if (capsule.part === 'legs' && spec.legSever && cut > spec.legSever && !horse.severed?.has(capsule.key)) {
    severMountLeg(world, horse, capsule.key, event, attacker);
    return;
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

/**
 * A robot's leg cut off at the hip by `event`'s blow: no capsule there now, the piece (its two links) thrown off as debris
 * (`dogLeg`), a 'legSevered' event (at the hip: where its stump shorts out, machinefx.js); on three legs it goes down.
 */
function severMountLeg(world, horse, key, event, attacker) {
  const leg = horse.legs[key];
  horse.severed ??= new Set();
  horse.severed.add(key);
  horse.lame = true;
  const W = horse.withers;
  const shape = horse.shape ?? HORSE_SHAPE;
  const length = (shape.upperLeg + shape.lowerLeg) * W * 0.9;
  const axis = vec.length(vec.sub(leg.hoof, leg.root)) > 1e-4 ? vec.normalize(vec.sub(leg.hoof, leg.root)) : [0, -1, 0];
  const centre = vec.add(leg.root, vec.scale(axis, length / 2));
  const carried = horseVelocityAt(horse, centre);
  const random = world.random;
  const away = event?.normal ? vec.scale(event.normal, -1.2) : [0, 0, 0];
  const debris = {
    id: world.debris.length, kind: 'dogLeg', horse: horse.id, breed: horse.breed, leg: key, owner: horse.rider ?? -1, x: centre, v: vec.add(vec.add(carried, away), [0, 1.2, 0]),
    q: [0, 0, 0, 1], spin: [random() * 6 - 3, random() * 4 - 2, random() * 6 - 3], radius: shape.legRadius * W * 1.2, axis, half: length / 2, resting: false,
  };
  world.debris.push(debris);
  (horse.severedDebris ??= {})[key] = debris.id;
  event?.effects?.push('its leg cut off');
  world.events.push({ time: world.time, kind: 'legSevered', horse: horse.id, rider: horse.rider ?? undefined, fighter: horse.rider ?? undefined, attacker: attacker?.id, leg: key, point: [...leg.root], debris: debris.id, effects: ['a leg cut off'] });
  poseHorse(horse);
  bringDown(world, horse, 'goes down on three legs');
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

/** A man's thighs and shins as capsules [from, to, radius, key] (what a robot dog meets of him). */
function manLegSegments(fighter) {
  return ['l', 'r'].flatMap((side) => [
    [point(fighter.x, P[`${side}Hip`]), point(fighter.x, P[`${side}Knee`]), fighter.body.segments[`${side}Thigh`].skinRadius, `${side}Thigh`],
    [point(fighter.x, P[`${side}Knee`]), point(fighter.x, P[`${side}Foot`]), fighter.body.segments[`${side}Shank`].skinRadius, `${side}Shank`],
  ]);
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
    // (A robot dog runs into his legs: its body is below his trunk.)
    const parts = [[pelvis, neck, radius, 'trunk'], [...shoulders, 'trunk'], ...(horse.spec?.robot ? manLegSegments(fighter) : [])];
    for (const capsule of horse.capsules) {
      if (capsule.part === 'legs') continue;
      for (const [from, to, thick, key] of parts) {
        const closest = closestBetween(from, to, capsule.a, capsule.b);
        const offset = vec.sub(closest.onFirst, closest.onSecond);
        const gap = vec.length(offset) - thick - capsule.radius;
        if (gap >= 0 || (best && gap >= best.gap)) continue;
        const flat = [offset[0], 0, offset[2]];
        const normal = vec.length(flat) > 1e-6 ? vec.normalize(flat) : vec.normalize([forwardOf(horse.yaw)[2], 0, -forwardOf(horse.yaw)[0]]);
        best = { fighter, capsule, gap, normal, at: closest.onSecond, key };
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
    crashHarm(world, man, entry.key ?? 'trunk', { impulse: met.impulse, mass: met.massSecond, closing: closingMan, energy: met.energy, point: entry.at, normal: direction, source: rider, hard });
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
    for (const leg of (horse.shape ?? HORSE_SHAPE).legs) {
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
