// Weapons: what is held, how it moves with the hands, and what it does on
// contact. A weapon is a rigid line from the main hand to its tip. Held in
// one hand, a wrist spring turns it towards where the move points it, as fast
// as its moment of inertia allows; held in two, the hands set it: the blade
// runs from the off hand through the main hand and on. Its mass rides on the
// hands, so a heavy blade swings slower under the same muscles.
//
// On contact the physics is the same as any strike (an impulse between two
// effective masses), and the harm splits by kind: blunt (bruising, the head
// shaken), cut (an edge drawn across: wounds, and through a limb at a joint)
// and pierce (a point driven in: wounds, and into the chest or head, death).
// Which a contact is depends on the blade's motion there: a point moving
// along the blade into the target pierces; an edge moving across it cuts.

import { vec } from './pose.js';

export const WEAPONS = {
  // A side-handle-less straight police baton: hard, heavy at the tip.
  baton: {
    label: 'Police baton', hands: 'one', length: 0.58, strikeFrom: 0.12, handle: 0.08, mass: 0.6, balance: 0.24, radius: 0.019,
    harm: { swing: { blunt: 1 }, thrust: { blunt: 1 } },
    contactSeconds: 0.005, rotation: 1.15, wrist: { omega: 62, zeta: 0.6 }, threat: 1.6,
  },
  // Hand-and-a-half: two hands for the big swings, one for the lunge.
  longsword: {
    label: 'Long sword', hands: 'hybrid', length: 0.98, strikeFrom: 0.14, handle: 0.24, spacing: 0.15, mass: 1.45, balance: 0.11, radius: 0.012,
    harm: { swing: { cut: 1, blunt: 0.5 }, thrust: { pierce: 1, cut: 0.15, blunt: 0.15 } },
    contactSeconds: 0.004, rotation: 0.8, wrist: { omega: 17, zeta: 0.8 }, threat: 4,
  },
  // Two hands always: the sharper, shorter blade cuts deeper, stabs less.
  katana: {
    label: 'Katana', hands: 'two', length: 0.8, strikeFrom: 0.12, handle: 0.27, spacing: 0.17, mass: 1.15, balance: 0.12, radius: 0.012,
    harm: { swing: { cut: 1.3, blunt: 0.4 }, thrust: { pierce: 0.7, cut: 0.15, blunt: 0.15 } },
    contactSeconds: 0.004, rotation: 0.8, wrist: { omega: 20, zeta: 0.8 }, threat: 4.5,
  },
  knife: {
    label: 'Knife', hands: 'one', length: 0.21, strikeFrom: 0.05, handle: 0.1, mass: 0.22, balance: 0, radius: 0.01,
    harm: { thrust: { pierce: 0.5, blunt: 0.35 }, swing: { cut: 0.42, blunt: 0.22 } },
    contactSeconds: 0.005, rotation: 0.6, wrist: { omega: 45, zeta: 0.8 }, threat: 2.2,
  },
  // The hoplomachus's hasta: held near its balance in one hand, long ahead
  // of the hand and a good way behind it; made to thrust.
  spear: {
    label: 'Spear', hands: 'one', length: 1.3, strikeFrom: 0.9, handle: 0.6, mass: 1.6, balance: 0.18, radius: 0.016,
    harm: { thrust: { pierce: 1, cut: 0.1, blunt: 0.2 }, swing: { blunt: 0.6 } },
    contactSeconds: 0.005, rotation: 0.5, wrist: { omega: 14, zeta: 0.85 }, threat: 3.5,
  },
  // His backup: a short sword that cuts and stabs.
  gladius: {
    label: 'Gladius', hands: 'one', length: 0.62, strikeFrom: 0.1, handle: 0.13, mass: 0.9, balance: 0.08, radius: 0.012,
    harm: { thrust: { pierce: 0.9, cut: 0.2, blunt: 0.15 }, swing: { cut: 0.8, blunt: 0.4 } },
    contactSeconds: 0.004, rotation: 0.7, wrist: { omega: 26, zeta: 0.8 }, threat: 3,
  },
};

// Shields strapped to the off forearm: a disc of this radius held off the
// arm, facing where the fighter faces. A strike that meets it is stopped
// there; its momentum goes into the arm and the body braced behind it.
export const SHIELDS = {
  // The parma: small, round, convex bronze — far smaller than a hoplon.
  parma: { label: 'Parma', radius: 0.28, mass: 2.4, offset: 0.07, armHarm: 0.15 },
};

// Cutting and piercing, in joules of a contact's collision energy after
// armour. A cut this deep within `zone` of a joint takes the limb off there
// (scaled by the limb's thickness against a typical one); a stab this deep
// into the chest or head is fatal. Wounds bleed: blood lost per second per
// joule, the bleeding easing as it clots, and a man who has lost this share
// of his blood collapses.
export const BLADES = {
  sever: {
    // joint: [J for a typical limb, the segment whose thickness scales it, typical radius m]
    wrist: [40, 'Forearm', 0.035], elbow: [70, 'Forearm', 0.04], shoulder: [125, 'UpperArm', 0.05],
    ankle: [65, 'Shank', 0.045], knee: [110, 'Shank', 0.055], hip: [230, 'Thigh', 0.08], neck: [140, null, 0],
  },
  zone: 0.32, // share of the segment's length from its end that counts as at the joint
  lethalPierce: 45,
  // Edge alignment: a cut needs the edge moving across the blade, not along it.
  cutAlignmentPower: 2,
  // A thrust pierces only with the point: contact this far out along the striking length.
  pointShare: 0.78,
  bleedPerJoule: { cut: 0.00006, pierce: 0.00012 },
  bleedZone: { head: 1.4, trunk: 1.5, limb: 0.7 },
  clotSeconds: 25,
  collapseAt: 0.38,
  // Blood loss weakens: muscles at this share at the point of collapse.
  shockStrength: 0.55,
  // Grip: hard knocks to the weapon arm or the weapon strain the grip by
  // impulse over (this × the hand's strike force); past 1 the weapon goes.
  gripImpulsePerNewton: 0.1,
  gripLeak: 0.5, // per second
  armHitShare: 0.6, // a blow to the forearm or upper arm, against one to the weapon
  // Blades meeting: how much bounce, and the closing speed (m/s) that counts as a clash.
  clashRestitution: 0.25,
  clashSpeed: 1.5,
  // A blade that glances off plate is turned aside: this share of the
  // contact impulse sends the weapon along the plate, away from the cut.
  glanceShare: 0.6,
};

export const WEAPON_KEYS = Object.keys(WEAPONS);

/**
 * Where a segment comes nearest a disc (centre c, unit normal n, radius r):
 * sampled along the segment, which is plenty for a short blade or limb.
 * Returns { distance, point (on the disc), along (0–1 on the segment) }.
 */
export function segmentToDisc(a, b, centre, normal, radius, samples = 10) {
  let best = { distance: Infinity, point: centre, along: 0 };
  for (let index = 0; index <= samples; index += 1) {
    const along = index / samples;
    const p = vec.lerp(a, b, along);
    const offset = vec.sub(p, centre);
    const height = vec.dot(offset, normal);
    const flat = vec.sub(offset, vec.scale(normal, height));
    const out = vec.length(flat);
    const onDisc = out <= radius ? vec.add(centre, flat) : vec.add(centre, vec.scale(flat, radius / out));
    const distance = vec.length(vec.sub(p, onDisc));
    if (distance < best.distance) best = { distance, point: onDisc, along, from: p };
  }
  return best;
}

/** A fighter's weapon, in hand, for a style that carries one. */
export function createWeapon(kind) {
  const spec = WEAPONS[kind];
  if (!spec) return null;
  return {
    kind, spec, main: 'r', off: 'l', held: true, twoHanded: spec.hands !== 'one',
    dir: [1, 0, 0], spin: [0, 0, 0], tip: [0, 0, 0], tipPrev: null, tipVelocity: [0, 0, 0], strain: 0,
  };
}

/** The share of the weapon's mass each hand carries. */
export function handShares(spec) {
  return spec.hands === 'one' ? { main: 1, off: 0 } : { main: 0.6, off: 0.4 };
}

/**
 * The effective mass at `distance` along the blade from the main hand, for
 * the weapon held by an arm whose own effective mass sits at the grip: a
 * free rigid body of the two, struck at that point (1/m = 1/M + d²/I).
 * Near the balance it is nearly the whole system; far out, much less.
 */
export function effectiveMassAt(spec, armMass, distance, armLength = 0.6, along = 0) {
  const total = spec.mass + armMass;
  const centre = (spec.mass * spec.balance) / total;
  const reach = spec.length + spec.handle;
  const ownInertia = (spec.mass * reach * reach) / 12;
  const inertia = ownInertia + spec.mass * (spec.balance - centre) ** 2 + armMass * centre * centre;
  const loose = 1 / (1 / total + (distance - centre) ** 2 / Math.max(1e-4, inertia));
  // A committed blow is struck with the wrist locked: arm and weapon turn
  // as one about the shoulder for the instant of contact.
  const pivoted = (armMass * (armLength * 0.45) ** 2 + ownInertia + spec.mass * (armLength + spec.balance) ** 2) / (armLength + distance) ** 2;
  const turning = Math.max(loose, pivoted);
  // Along the blade (a thrust) the arm and weapon push as one mass; across
  // it (a cut) they must turn. Mixed by how the contact moves.
  return 1 / ((along * along) / total + (1 - along * along) / turning);
}

/**
 * How a contact cuts and pierces, from the blade's motion where it touched:
 * `along` is the share of the closing speed directed along the blade, `at`
 * how far along the striking length (0 hilt, 1 tip). A thrust's point that
 * arrives point-first pierces; any edge moving across the blade cuts.
 */
export function harmMix(spec, mode, along, at) {
  const table = spec.harm[mode] ?? spec.harm.swing ?? { blunt: 1 };
  const mix = { blunt: table.blunt ?? 0, cut: 0, pierce: 0 };
  const across = Math.sqrt(Math.max(0, 1 - along * along));
  if (mode === 'thrust') {
    const pointFirst = at >= BLADES.pointShare && along > 0.5;
    mix.pierce = pointFirst ? (table.pierce ?? 0) * along : 0;
    mix.cut = (table.cut ?? 0) * across ** BLADES.cutAlignmentPower;
    if (!pointFirst) mix.blunt = Math.max(mix.blunt, 0.3);
  } else {
    mix.cut = (table.cut ?? 0) * across ** BLADES.cutAlignmentPower;
    mix.pierce = 0;
  }
  return mix;
}

const addVec = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

/** Spherical blend of two unit vectors. */
export function slerpDir(a, b, t) {
  const cos = Math.max(-1, Math.min(1, vec.dot(a, b)));
  if (cos > 0.9995) return vec.normalize(vec.lerp(a, b, t));
  const angle = Math.acos(cos);
  const sin = Math.sin(angle);
  if (sin < 1e-4) {
    // Opposite: turn through a perpendicular.
    const side = vec.normalize(Math.abs(a[1]) < 0.9 ? vec.cross(a, [0, 1, 0]) : vec.cross(a, [1, 0, 0]));
    return t < 0.5 ? slerpDir(a, side, t * 2) : slerpDir(side, b, t * 2 - 1);
  }
  const wa = Math.sin((1 - t) * angle) / sin;
  const wb = Math.sin(t * angle) / sin;
  return vec.normalize(addVec(scale3(a, wa), scale3(b, wb)));
}

/**
 * The guard a weapon style stands in: where the main hand is (local, in
 * heights) and where the weapon points.
 */
export function guardTargets(style, body) {
  const guard = style.weaponGuard;
  const H = body.heightM;
  return { hand: scale3(guard.hand, H), dir: vec.normalize(guard.dir) };
}

/**
 * Targets for a weapon move at time t: the main hand (local) and the blade's
 * direction. A swing is a curve from the cocked position to the follow-
 * through, bent so that `contactAt` of the blade passes through the aim
 * halfway; the blade turns between the two. A thrust drives the point
 * along the line to the aim and past it.
 */
export function bladeTargets(move, t, aim, body, spec, reachShare = 1) {
  const H = body.heightM;
  const from = { hand: scale3(move.from.hand, H), dir: vec.normalize(move.from.dir) };
  if (move.mode === 'thrust') {
    // Point on the line from the hand to the aim, then driven along it, so
    // the point arrives first; it goes `depth` past the surface it aims at.
    const dir = vec.normalize(vec.sub(aim, from.hand));
    if (t < move.windup) return { hand: from.hand, dir: slerpDir(from.dir, dir, Math.min(1, t / Math.max(1e-3, move.windup))) };
    const u = Math.min(1, (t - move.windup) / (move.extendUntil - move.windup));
    // Accelerating all the way in, as a punch does, not easing to a stop at the skin.
    const end = vec.sub(aim, vec.scale(dir, spec.length * reachShare - (move.depth ?? 0.25)));
    // Fully out by three quarters of the way, then held there for the hand to arrive.
    const out = Math.min(1, u / 0.75);
    return { hand: vec.lerp(from.hand, end, out * out), dir };
  }
  const to = { hand: scale3(move.to.hand, H), dir: vec.normalize(move.to.dir) };
  if (t < move.windup) return from;
  const u = Math.min(1, (t - move.windup) / (move.extendUntil - move.windup));
  const middleDir = move.mid ? vec.normalize(move.mid) : slerpDir(from.dir, to.dir, 0.5);
  const middle = vec.sub(aim, vec.scale(middleDir, spec.length * (move.contactAt ?? 0.7)));
  // A quadratic curve through `middle` at u = ½.
  const control = vec.sub(vec.scale(middle, 2), vec.scale(vec.add(from.hand, to.hand), 0.5));
  const hand = addVec(addVec(scale3(from.hand, (1 - u) ** 2), scale3(control, 2 * u * (1 - u))), scale3(to.hand, u * u));
  return { hand, dir: u < 0.5 ? slerpDir(from.dir, middleDir, u * 2) : slerpDir(middleDir, to.dir, u * 2 - 1) };
}
