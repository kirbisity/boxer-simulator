// Footing on a body (WORLD.bodyFooting): a man's foot or a horse's hoof coming down on a man on the floor, crawling on his
// hands and knees, lying there, or dead.
//
// Under the sole: the part of him it lands on (partUnder), the highest of his parts' rounded tops where it comes down.
//
// The man trodden on (treadOn): the sole brings the mass behind it (a man's leg with WORLD.trod `legDrive` of his weight;
// a hoof its stance's share of the laden horse) down at the speed it falls. A crawler holds that on his hands and knees as
// far as his limbs can bear it (their push, physics/rising.js riseForces, yielding at WORLD.jump.land `eccentric` of it): the
// weight on the sole and the blow's peak (the crash's, over WORLD.crash `contactSeconds`) past that, and he is pressed
// flat. A part with the floor under it (lying there, or pressed down) is caught between the sole and the ground: the
// whole of what comes down on it is stopped there (the mass behind the sole times its speed, and the crash's rebound);
// a crawler's back that holds gives under it as a body does (the crash of the two masses). Either is a blunt crash on
// that part through his armour (physics.js crashHarm: the head's brain strain and knockout, the ribs by the force, the
// limbs' injury), no more and no less than any crash.
//
// The one stepping (footingOn): a body is no floor. The sole meets a rounded part at its height, sloping as far off its
// crest as it lands; the leg drives along its line (hip to sole), and where that is further off the surface's normal than
// the grip (`grip`, a sole's friction on cloth and flesh) holds, the foot slides off down the side, as a block down a
// slope with that friction, from that height to the floor: his hips go on the other way at the slide's level speed. A
// step met higher than the leg reached for checks the hips as a vault does (their speed by the height over the leg's
// length). A crawler's back that holds moves on under the foot: the foot is carried with it, and the stepper's hips are
// left behind by the share of that speed the body's mass has over the two (a light man on a heavy crawler is carried off
// his feet; a heavy one presses a light crawler flat, and stands on a still, low body). What that speed change is against
// what his legs hold (physics.js checkBalance's: WORLD.balance `speed`, by his legs and gear) puts him over, or near it
// (WORLD.stagger `startAt`) makes him stumble (physics/rising.js standWobble); a horse is jolted by its share on that
// leg (physics/mounted.js jolt: its pace checked, and past what its legs take, down).

import { P } from '../body.js';
import { vec } from '../pose.js';
import { WORLD } from './config.js';
import { capsules, capsuleEnds, crashHarm, crashOf, fall, floorUnder, lyingOnFloor } from '../physics.js';
import { riseForces } from './rising.js';

/** A man on the floor: on his hands and knees crawling, or lying there come to rest (one still falling is no footing). */
export function lyingLow(fighter) {
  return (fighter.crawling && fighter.state === 'up') || lyingOnFloor(fighter, 'trunk');
}

/** The mass (kg) of a man that moves as one in a crash (WORLD.balance `massShare` of him). */
function wholeOf(fighter) {
  return WORLD.balance.massShare * fighter.body.massKg;
}

/**
 * The part of a man on the floor that a sole of radius `sole` (m) coming down at (x, z) lands on: of the men in
 * `fighters` (any the `skip` test leaves), the part whose rounded top is highest there, at least WORLD.bodyFooting `least`
 * m off the floor and no higher than `most` of the stepper's `legLength` (`near`: the indices of those to look at, or null for all of them). Null if it comes down on the floor. Returns the man, the part's key, the sole's height off the floor
 * on it, the surface's outward normal there, the contact point, the part's radius, its height off the floor at its
 * underside, and its velocity.
 */
export function partUnder(fighters, near, x, z, sole, skip, legLength = Infinity) {
  const highest = WORLD.bodyFooting.most * legLength;
  const reach = WORLD.bodyReach + sole;
  let best = null;
  const count = near ? near.length : fighters.length;
  for (let k = 0; k < count; k += 1) {
    const fighter = fighters[near ? near[k] : k];
    if (!fighter || fighter.mount || skip?.(fighter)) continue;
    const pelvis = P.pelvis * 3;
    if (Math.abs(fighter.x[pelvis] - x) > reach || Math.abs(fighter.x[pelvis + 2] - z) > reach) continue;
    if (!lyingLow(fighter)) continue;
    for (const capsule of capsules(fighter)) {
      const [a, b] = capsuleEnds(fighter, capsule);
      const ax = b[0] - a[0];
      const az = b[2] - a[2];
      const span = ax * ax + az * az;
      const t = span > 1e-9 ? Math.max(0, Math.min(1, ((x - a[0]) * ax + (z - a[2]) * az) / span)) : 0;
      const axis = [a[0] + ax * t, a[1] + (b[1] - a[1]) * t, a[2] + az * t];
      const radius = capsule.radius * (capsule.key === 'head' ? fighter.body.gear.headBulk ?? 1 : 1);
      const R = radius + sole;
      const off = Math.hypot(x - axis[0], z - axis[2]);
      if (off >= R) continue;
      const floor = floorUnder(fighter.arena, axis[2], axis[0], axis[1]);
      const rise = Math.sqrt(R * R - off * off);
      const height = axis[1] + rise - sole - floor;
      if (height < WORLD.bodyFooting.least || height > highest || (best && height <= best.height)) continue;
      const normal = [(x - axis[0]) / R, rise / R, (z - axis[2]) / R];
      const velocity = vec.scale(vec.add(particleVelocity(fighter, capsule.a), particleVelocity(fighter, capsule.b)), 0.5);
      best = { fighter, key: capsule.key, height, normal, point: vec.add(axis, vec.scale(normal, radius)), radius, bottom: axis[1] - radius - floor, velocity };
    }
  }
  return best;
}

function particleVelocity(fighter, index) {
  return [fighter.v[index * 3], fighter.v[index * 3 + 1], fighter.v[index * 3 + 2]];
}

/** Whether a crawler holds `load` N on him on his hands and knees (his own weight with it): what his limbs push, yielding. */
export function holdsUnder(fighter, load) {
  const forces = riseForces(fighter, Math.max(0, fighter.motorScale ?? 1));
  const support = WORLD.jump.land.eccentric * (forces.arm.l + forces.arm.r + WORLD.rise.kneeShare * (forces.leg.l + forces.leg.r));
  return support >= forces.weight + load;
}

/**
 * A sole of `mass` kg behind it coming down at `speed` m/s on `under` (partUnder), with `weight` N of the stepper's
 * weight on it: a crawler pressed flat if he cannot hold it, and the blunt crash on the part (crashHarm). `source` the
 * man who did it (the stepper, a horse's rider), `hard` how much worse his armoured foot makes it (physics.js crashHardness).
 * Returns { flattened, impulse, harm } (harm: the crash event, or null if it did no harm).
 */
export function treadOn(world, under, { mass, speed, weight, source = null, hard = 1, reason }) {
  const man = under.fighter;
  const whole = wholeOf(man);
  const restitution = WORLD.crash.restitution;
  const held = crashOf(mass, whole, speed).impulse;
  let flattened = false;
  if (man.crawling && man.state === 'up') {
    const peak = ((Math.PI / 2) * held) / WORLD.crash.contactSeconds;
    if (!holdsUnder(man, weight + peak)) {
      fall(world, man, reason);
      flattened = true;
    }
  }
  // Caught between the sole and the floor, it stops all that comes down on it; a back held up gives under it.
  const backed = flattened || under.bottom < WORLD.crash.lying;
  const impulse = backed ? mass * speed * (1 + restitution) : held;
  const harm = speed > 0 ? crashHarm(world, man, under.key, { impulse, mass: whole, closing: impulse / whole, energy: (impulse * impulse) / (2 * whole), point: under.point, normal: [0, -1, 0], source, hard }) : null;
  return { flattened, impulse, harm };
}

/**
 * The footing a sole finds on `under` (partUnder): the speed change (m/s, a level world vector) it gives the stepper's
 * hips (all of him on that leg). `leg` the unit vector from his hip to the sole, `velocity` his own (m/s, world),
 * `legLength` (m), `mass` his (kg), `flattened` whether the body was pressed flat under him (treadOn).
 */
export function footingOn(under, { leg, velocity, legLength, mass, flattened }) {
  const spec = WORLD.bodyFooting;
  // Pressed flat, the body is no higher than its own thickness, and still under him.
  const height = flattened ? Math.min(under.height, 2 * under.radius) : under.height;
  const n = under.normal;
  const knock = [0, 0, 0];
  // The vault: the hips' level speed checked by the height over the leg's length.
  const vault = Math.min(1, height / legLength);
  knock[0] -= velocity[0] * vault;
  knock[2] -= velocity[2] * vault;
  // The leg's line against the surface: past the grip it slides off.
  const into = -vec.dot(leg, n);
  const across = Math.sqrt(Math.max(0, 1 - into * into));
  const tan = into > 1e-6 ? across / into : Infinity;
  let slipped = false;
  if (tan > spec.grip) {
    slipped = true;
    const slide = Math.sqrt(2 * WORLD.gravity * height * Math.max(0, 1 - spec.grip / tan));
    // Along the surface, the way the leg drives: the foot goes that way, his hips the other.
    const along = vec.sub(leg, vec.scale(n, vec.dot(leg, n)));
    const size = vec.length(along);
    if (size > 1e-6) {
      knock[0] -= (slide * along[0]) / size;
      knock[2] -= (slide * along[2]) / size;
    }
  } else if (!flattened) {
    // A body that holds moves on under the foot: he is carried with it by its share of the two masses.
    const share = wholeOf(under.fighter) / (wholeOf(under.fighter) + WORLD.balance.massShare * mass);
    knock[0] += under.velocity[0] * share;
    knock[2] += under.velocity[2] * share;
  }
  return { knock, slipped, height, size: Math.hypot(knock[0], knock[2]) };
}
