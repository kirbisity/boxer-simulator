// The fight world: each fighter is a particle skeleton held together by XPBD
// distance constraints and joint limits, driven by muscles modelled as
// spring-dampers whose force is capped by the muscle's strength. Mass gives
// every movement inertia; the cap decides how hard a muscle can fight back.
// A landed punch hands its momentum to the struck part, which flies until
// the fighter's muscles, after a reflex delay, catch it.

import { BODY, buildBody, P, PARTICLES, SEGMENTS } from './body.js';
import { idleMotion, lifePhases } from './life.js';
import { DEFENCES, MOVES, STYLES, strikeTargets } from './moves.js';
import { desiredPose, restPose, twoBoneIK, vec, yawRotate } from './pose.js';

export const WORLD = {
  gravity: 9.81,
  substeps: 8,
  // Half the inside of a 20 ft ring (6.1 m), less a margin for the ropes.
  ringHalf: 2.85,
  gloveRadius: 0.065,
  // Each muscle group is a spring-damper towards its target: natural
  // frequency ω (rad/s) and damping ratio ζ. Below ζ = 1 a part overshoots a
  // little and settles, which is what inertia looks like; the force cap from
  // the muscle bounds it, so a heavy, weak part lags and a light, strong one
  // snaps. Hands are stiff so the cap, not the spring, sets punch speed.
  motor: {
    hand: { omega: 60, zeta: 0.6 },
    elbow: { omega: 34, zeta: 0.75 },
    head: { omega: 12, zeta: 0.4 },
    trunk: { omega: 13, zeta: 0.5 },
    pelvis: { omega: 12, zeta: 0.5 },
    knee: { omega: 22, zeta: 0.7 },
    foot: { omega: 36, zeta: 0.9 },
  },
  // Muscles react to a blow after a reflex delay (~60–90 ms for a startle
  // response; less when braced), then ramp back to full force. Until then
  // only passive tone holds (the floor): the share of force a relaxed
  // muscle and its tendons still give.
  reflex: { latency: 0.095, trainedSaving: 0.03, bracedSaving: 0.035, ramp: 0.14, floor: 0.12 },
  // Per-second velocity damping: joints and tissue lose energy; a limp body
  // less so, which is why it falls rather than sinks.
  damping: { up: 0.8, down: 0.5 },
  groundFriction: 14,
  braceCompliance: 5e-4, // m/N: torso braces give a little so the trunk can twist
  diagonalCompliance: 3e-3,
  // Joint limits for the ragdoll: knees bend only forward; the head stays
  // within this angle of the trunk's axis; elbows and knees cannot fold flat.
  headCone: 1.2,
  minFold: { arm: 0.13, leg: 0.16 },
  // Held firmly: up to this far corrected per substep (more is stable now
  // that corrections are shared by mass).
  limitStep: 0.006, // m
  limitStepLimp: 0.006, // m: firmer corrections inject speed of their own
  joint: {
    hipCone: 2.4, // rad from straight down: room for a head kick, not the splits
    // Forced this far past its range in an instant, a joint breaks.
    breakAngle: 0.8, // rad past the limit
    // The neck is braced by the whole shoulder girdle: it takes far more.
    breakAngles: { neck: 1.5 },
    straightAllowance: 0.01, // m a hinge may pass straight before it is held
    // ...held there: rad·s of strain past the break angle before it gives,
    // and how fast strain leaks away (per s) once the joint is back in range.
    strainToBreak: 0.05,
    strainLeak: 6,
  },
  // Footwork: a planted foot stays put until the stance has drifted this far
  // from it, then steps; one foot at a time.
  step: { threshold: 0.11, seconds: 0.17, lift: 0.05, lead: 0.5 },
  // Footwork speed and how quickly it can change (m/s, m/s²), for a body
  // whose leg drive is typical (legStrengthTypical × its weight); stronger
  // or weaker legs scale both.
  // Boxers move explosively (push-offs of ~8 m/s²), so the trunk visibly
  // lags a step in and sways past the stance when it stops.
  footSpeed: 1.2,
  footAcceleration: 8,
  legStrengthTypical: 0.8,
  // An impact's contact lasts about this long through a 10–12 oz glove;
  // peak force ≈ (π/2)·impulse / contact time for a half-sine pulse.
  contactSeconds: 0.011,
  restitution: 0.1,
  // How much momentum a blow hands to what it hits, as a restitution: higher
  // than the damage figure above, because the glove and flesh cushion the
  // tissue's strain more than they cushion the push. Raised for a sharper,
  // more visible knockback; damage still uses the cushioned figure.
  transferRestitution: 0.6,
  rotationLead: 0.45,
  // Stamina regained per second at rest, times aerobic fitness: a fit boxer
  // holds most of it through a round; an unfit one empties in about a minute.
  staminaRecovery: 0.07,
  // Accumulated brain strain (Σ(Δv − 1.2)²) a fighter absorbs, per unit of
  // chin, before going down; each knockdown raises the next threshold, since
  // the count is against the total.
  concussionCapacity: 4,
  rotationalFactor: { jab: 0.85, cross: 1, hook: 1.35, uppercut: 1.25 },
  followThrough: 0.2, // m beyond the target the glove is aimed at
  minImpactSpeed: 2.0,
  getUpSeconds: 1.6,
  // Balance: pushed past these, a fighter goes over rather than stepping.
  // Speed of the hips (m/s) and their distance outside the feet, as a share
  // of leg length; both scale with how strong the legs are.
  // The knock speed scales with the transfer above, so the limit does too.
  balance: { speed: 2.1, reach: 0.8, fallSeconds: 1.4, absorbPerSecond: 5 },
  // Charging: top speed as a multiple of footwork speed, and how much of the
  // trunk's mass meets the other body in a collision.
  rush: { speedFactor: 2.6, trunkShare: 0.7, minClosing: 0.8 },
  // The clinch: hands locked behind the neck; it breaks when the defender's
  // strength wins or the time runs out.
  clinch: { lockDistance: 0.14, range: 0.95, pullDown: 0.08 },
  // Leg kicks add up: past this damage (in kicks' impulse, N·s, per kg of
  // leg) the leg gives way.
  legCapacity: 9,
  // Speed change (m/s, summed over blows) a segment takes before it is
  // seriously hurt and shows fully red: a face about a dozen hard shots,
  // a trunk two dozen body shots, a forearm a lot of blocking.
  damageCapacity: { head: 26, trunk: 16, Forearm: 30, UpperArm: 30, Thigh: 12, Shank: 12 },
  blockedDamageShare: 0.35,
  downSecondsMin: 3,
  downSecondsRange: 4,
  knockdownsToStop: 3,
};

// Every attack and its data live in moves.js; the old name stays for callers.
export const PUNCHES = MOVES;

const BRACES = [
  ['lShoulder', 'rShoulder', 'braceCompliance'], ['lHip', 'rHip', 'braceCompliance'],
  ['lShoulder', 'lHip', 'braceCompliance'], ['rShoulder', 'rHip', 'braceCompliance'],
  ['lShoulder', 'rHip', 'diagonalCompliance'], ['rShoulder', 'lHip', 'diagonalCompliance'],
  ['neck', 'lHip', 'diagonalCompliance'], ['neck', 'rHip', 'diagonalCompliance'],
];
const BONE_LINKS = [
  ['neck', 'head'], ['neck', 'lShoulder'], ['neck', 'rShoulder'], ['lShoulder', 'lElbow'], ['rShoulder', 'rElbow'],
  ['lElbow', 'lHand'], ['rElbow', 'rHand'], ['pelvis', 'neck'], ['pelvis', 'lHip'], ['pelvis', 'rHip'],
  ['lHip', 'lKnee'], ['rHip', 'rKnee'], ['lKnee', 'lFoot'], ['rKnee', 'rFoot'],
];
// Each motor chases its target relative to an anchor's actual position, so a
// head knocked sideways is pulled back by the neck, not by the world. Knees
// are placed by IK between the actual hip and the foot's target instead.
const ANCHOR = {
  head: 'neck', neck: 'pelvis', lShoulder: 'pelvis', rShoulder: 'pelvis', lHip: 'pelvis', rHip: 'pelvis',
  lElbow: 'lShoulder', rElbow: 'rShoulder', lHand: 'lShoulder', rHand: 'rShoulder', lKnee: null, rKnee: null,
  pelvis: null, lFoot: null, rFoot: null,
};
const MOTOR_GROUP = {
  head: 'head', neck: 'trunk', lShoulder: 'trunk', rShoulder: 'trunk', lHip: 'trunk', rHip: 'trunk',
  lElbow: 'elbow', rElbow: 'elbow', lHand: 'hand', rHand: 'hand', lKnee: 'knee', rKnee: 'knee',
  pelvis: 'pelvis', lFoot: 'foot', rFoot: 'foot',
};
const TRUNK_PARTICLES = ['pelvis', 'lHip', 'rHip', 'neck', 'lShoulder', 'rShoulder'].map((name) => P[name]);
const STRUCK = ['head', 'trunk', 'lForearm', 'rForearm', 'lUpperArm', 'rUpperArm', 'lThigh', 'rThigh', 'lShank', 'rShank'];
const BLOCKING = new Set(['lForearm', 'rForearm', 'lUpperArm', 'rUpperArm']);
// The chain each striking limb pulls on, and how much each link shares the recoil.
const RECOIL = {
  Hand: [['Hand', 1], ['Elbow', 0.7], ['Shoulder', 0.35]],
  Elbow: [['Elbow', 1], ['Shoulder', 0.5]],
  Knee: [['Knee', 1], ['Hip', 0.6]],
  Foot: [['Foot', 1], ['Knee', 0.7], ['Hip', 0.35]],
};

/** Small deterministic generator so a seed replays a bout exactly. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Contact radius of each particle: the flesh around it, so a body lies on the canvas at its real thickness. */
function particleRadii(body) {
  const segments = body.segments;
  return PARTICLES.map((name) => {
    const side = name[0];
    if (name === 'head') return body.lengths.headRadius;
    if (name === 'neck') return segments.trunk.skinRadius * 0.45;
    if (name === 'pelvis') return segments.trunk.skinRadius * 0.7;
    if (name.endsWith('Shoulder')) return segments[`${side}UpperArm`].skinRadius * 1.2;
    if (name.endsWith('Elbow')) return segments[`${side}Forearm`].skinRadius;
    if (name.endsWith('Hand')) return WORLD.gloveRadius;
    if (name.endsWith('Hip')) return segments[`${side}Thigh`].skinRadius;
    if (name.endsWith('Knee')) return segments[`${side}Shank`].skinRadius;
    return 0.045;
  });
}

export function createFighter(inputs, { id, corner, x, facing, random }) {
  const body = buildBody(inputs);
  const rest = restPose(body);
  const count = PARTICLES.length;
  const fighter = {
    id, corner, body,
    x: new Float64Array(count * 3), v: new Float64Array(count * 3), prev: new Float64Array(count * 3),
    invMass: body.masses.map((mass) => 1 / mass),
    radius: particleRadii(body),
    constraints: [],
    root: [x, 0], rootVelocity: [0, 0], yaw: facing, move: 0,
    intent: {}, desired: rest, targets: rest.map((point) => [...point]),
    feet: null,
    hitAt: new Float64Array(count).fill(-1e9),
    life: lifePhases(random),
    state: 'up', motorScale: 1, stun: 0, downTimer: 0,
    stamina: 1, concussion: 0, knockdowns: 0, injuries: [],
    style: STYLES[inputs.style] ? inputs.style : 'boxing',
    punch: null, cooldown: 0, guardHigh: 0, slip: 0, defence: null, rush: null, clinch: null,
    legDamage: { l: 0, r: 0 },
    // Damage per body segment (0 fresh, 1 seriously hurt), for the record
    // and for the view; broken joints and the particles they leave limp.
    damage: {}, damageVersion: 0, broken: new Set(), limp: new Set(),
    // Velocity blows and collisions have put into the trunk, which the legs
    // must absorb; what topples a fighter is this, not their own movement.
    knock: [0, 0, 0],
    stats: { thrown: 0, landed: 0, blocked: 0, maxHandSpeed: 0, lastHandSpeed: 0, knockdownsScored: 0 },
    contacts: new Set(),
  };
  for (let index = 0; index < count; index += 1) setPoint(fighter.x, index, toWorld(fighter, rest[index]));
  fighter.prev.set(fighter.x);
  plantFeet(fighter);
  for (const [a, b] of BONE_LINKS) addConstraint(fighter, a, b, 0);
  for (const [a, b, key] of BRACES) addConstraint(fighter, a, b, WORLD[key]);
  return fighter;
}

/** Move a fighter bodily to stand with its root at (x, z), feet replanted. */
export function placeFighter(fighter, x, z = fighter.root[1]) {
  const dx = x - fighter.root[0];
  const dz = z - fighter.root[1];
  fighter.root = [x, z];
  for (let index = 0; index < fighter.x.length; index += 3) {
    for (const array of [fighter.x, fighter.prev]) {
      array[index] += dx;
      array[index + 2] += dz;
    }
  }
  plantFeet(fighter);
}

function addConstraint(fighter, a, b, compliance) {
  const i = P[a];
  const j = P[b];
  const rest = vec.length(vec.sub(fighter.desired[i], fighter.desired[j]));
  fighter.constraints.push({ i, j, rest, compliance });
}

export function createWorld(fighterInputs, { seed = 1 } = {}) {
  const random = seededRandom(seed);
  const sides = fighterInputs.map((entry, index) => ({ inputs: entry.inputs ?? entry, corner: entry.corner ?? (index % 2 === 0 ? 'red' : 'blue') }));
  const fighters = sides.map((side, index) => {
    const onRed = side.corner === 'red';
    const sameCorner = sides.slice(0, index).filter((other) => other.corner === side.corner).length;
    const x = (onRed ? -1 : 1) * (1.1 + sameCorner * 0.5);
    return createFighter(side.inputs, { id: index, corner: side.corner, x, facing: onRed ? 0 : Math.PI, random });
  });
  return { time: 0, fighters, events: [], random, over: false, pendingImpulses: [], lastDt: 1 / 60 };
}

// ---- Frames -------------------------------------------------------------

export function point(array, index) {
  return [array[index * 3], array[index * 3 + 1], array[index * 3 + 2]];
}
function setPoint(array, index, value) {
  array[index * 3] = value[0];
  array[index * 3 + 1] = value[1];
  array[index * 3 + 2] = value[2];
}
export function toWorld(fighter, local) {
  const turned = yawRotate(local, fighter.yaw);
  return [fighter.root[0] + turned[0], turned[1], fighter.root[1] + turned[2]];
}
export function toLocal(fighter, world) {
  return yawRotate([world[0] - fighter.root[0], world[1], world[2] - fighter.root[1]], -fighter.yaw);
}

export function nearestOpponent(world, fighter) {
  let best = null;
  let bestDistance = Infinity;
  for (const other of world.fighters) {
    if (other.corner === fighter.corner || other.state === 'out') continue;
    const distance = vec.length(vec.sub(point(other.x, P.pelvis), point(fighter.x, P.pelvis)));
    if (distance < bestDistance) {
      best = other;
      bestDistance = distance;
    }
  }
  return best;
}

// ---- Commands -----------------------------------------------------------

/** Where on the target a strike aims: the head, the body, or the lead thigh. */
function aimPoint(target, zone) {
  if (zone === 'head') return point(target.x, P.head);
  if (zone === 'legs') return vec.lerp(point(target.x, P.lHip), point(target.x, P.lKnee), 0.55);
  return vec.lerp(point(target.x, P.pelvis), point(target.x, P.neck), 0.6);
}

/**
 * Throw a strike (any attack in MOVES) at the opponent. The zone defaults to
 * the move's first. Returns false if the fighter cannot throw it now.
 */
export function throwPunch(world, fighter, type, zone = null) {
  const spec = MOVES[type];
  if (spec?.kind === 'rush' || spec?.kind === 'clinch') return perform(world, fighter, type);
  const target = nearestOpponent(world, fighter);
  if (!spec || spec.kind !== 'strike' || !target || fighter.punch || fighter.state !== 'up' || fighter.stamina < spec.cost) return false;
  const aimZone = spec.zones.includes(zone) ? zone : spec.zones[0];
  fighter.punch = { type, spec, zone: aimZone, t: 0, aim: toLocal(fighter, aimPoint(target, aimZone)), target: target.id, landed: false, peakSpeed: 0, limb: P[spec.limb] };
  fighter.stamina = Math.max(0, fighter.stamina - spec.cost / fighter.body.aerobic);
  fighter.stats.thrown += 1;
  return true;
}

/** Start a whole-body move (rush, clinch) or a defence. */
export function perform(world, fighter, name) {
  if (fighter.state !== 'up') return false;
  if (DEFENCES[name]) {
    fighter.defence = { name, t: 0, seconds: DEFENCES[name].seconds, side: world.random() < 0.5 ? 1 : -1 };
    if (name === 'guard') fighter.guardHigh = DEFENCES.guard.seconds;
    if (name === 'slip') {
      fighter.slip = DEFENCES.slip.seconds;
      fighter.slipSide = fighter.defence.side;
    }
    return true;
  }
  const spec = MOVES[name];
  const target = nearestOpponent(world, fighter);
  if (!spec || !target || fighter.punch || fighter.rush || fighter.stamina < spec.cost) return false;
  if (spec.kind === 'rush') {
    fighter.rush = { t: 0, duration: spec.duration, hit: false };
  } else if (spec.kind === 'clinch') {
    const distance = vec.length(vec.sub(point(target.x, P.neck), point(fighter.x, P.neck)));
    if (distance > fighter.body.reach * WORLD.clinch.range) return false;
    // Who holds on longer is a contest of grip and arm strength.
    const grip = (who) => who.body.strikeForce[P.lHand] + who.body.strikeForce[P.rHand];
    const share = grip(fighter) / (grip(fighter) + grip(target));
    fighter.clinch = { target: target.id, t: 0, duration: spec.duration * (0.5 + share) };
    world.events.push({ time: world.time, kind: 'clinch', attacker: fighter.id, defender: target.id, effects: [] });
  } else return false;
  fighter.stamina = Math.max(0, fighter.stamina - spec.cost / fighter.body.aerobic);
  return true;
}

function updateIntent(world, fighter, dt) {
  const H = fighter.body.heightM;
  const style = STYLES[fighter.style];
  const idle = idleMotion(fighter, world.time);
  const intent = {
    stance: style.stance,
    twist: idle.twist, lean: idle.lean, dip: idle.dip, shift: idle.shift,
    headOffset: vec.scale(idle.headOffset, H), guardOffset: idle.guardOffset, guardTight: fighter.guardHigh > 0,
  };
  if (fighter.punch) {
    const punch = fighter.punch;
    punch.t += dt;
    const spec = punch.spec;
    // The kinetic chain: hips and shoulders turn first and have finished
    // turning by the time the strike is halfway there.
    const phase = Math.min(1, punch.t / (spec.extendUntil * WORLD.rotationLead));
    const shape = punch.t < spec.extendUntil ? Math.sin(phase * Math.PI * 0.5) : Math.max(0, 1 - (punch.t - spec.extendUntil) / (spec.duration - spec.extendUntil));
    intent.twist += spec.twist * shape;
    intent.dip += (spec.dip ?? 0) * shape;
    intent.lean += (spec.lean ?? 0.12) * shape;
    intent.shift += (spec.shift ?? 0) * shape;
    if (punch.t < spec.extendUntil) Object.assign(intent, strikeTargets(spec, punch.t, punch.aim, fighter.body, WORLD.followThrough));
    else if (spec.limb.endsWith('Foot') || spec.limb.endsWith('Knee')) {
      // Recovering a kick: the leg comes back down under the hip.
      const s = spec.limb[0];
      const local = toLocal(fighter, point(fighter.x, P[`${s}Foot`]));
      intent[`${s}Foot`] = vec.lerp(local, [0.05 * H * (s === 'l' ? 1 : -1), fighter.body.lengths.ankle, 0.06 * H * (s === 'l' ? 1 : -1)], Math.min(1, (punch.t - spec.extendUntil) / (spec.duration - spec.extendUntil)));
    }
    if (punch.t >= spec.duration) fighter.punch = null;
  }
  applyDefence(fighter, intent, dt);
  if (fighter.rush) {
    // Charging: head down, shoulder first, hands up.
    intent.lean += 0.28;
    intent.dip += 0.04;
    intent.twist += 0.35;
    intent.guardTight = true;
  }
  if (fighter.clinch) {
    const target = world.fighters[fighter.clinch.target];
    // Both hands behind the opponent's neck, pulling it down.
    const neck = vec.add(point(target.x, P.neck), [0, -WORLD.clinch.pullDown, 0]);
    for (const [side, sign] of [['l', 1], ['r', -1]]) intent[`${side}Hand`] = vec.add(toLocal(fighter, neck), [0.05, 0.04, sign * 0.07]);
    intent.lean += 0.08;
  }
  if (fighter.handsDown) {
    // Hands at the sides, for portraits and design sheets.
    for (const [side, sign] of [['l', 1], ['r', -1]]) intent[`${side}Hand`] = [0.03 * H, 0.47 * H, sign * 0.2 * H];
  }
  if (fighter.slip > 0) {
    intent.headOffset = vec.add(intent.headOffset, [-0.02 * H, -0.05 * H, (fighter.slipSide ?? 1) * 0.07 * H]);
    intent.lean -= 0.05;
  }
  fighter.intent = intent;
  fighter.desired = desiredPose(fighter.body, intent);
}

/** A defence's posture over its few tenths of a second. */
function applyDefence(fighter, intent, dt) {
  const defence = fighter.defence;
  if (!defence) return;
  defence.t += dt;
  const H = fighter.body.heightM;
  const u = Math.min(1, defence.t / defence.seconds);
  const arc = Math.sin(Math.PI * u);
  if (defence.name === 'roll') {
    // Down under the punch and across: a U through the hips and knees.
    intent.dip += 0.07 * arc;
    intent.headOffset = vec.add(intent.headOffset, [0, -0.04 * H * arc, defence.side * 0.08 * H * Math.cos(Math.PI * u)]);
  } else if (defence.name === 'parry' && !fighter.punch) {
    // The lead hand slaps across the line of the incoming punch.
    intent.lHand = vec.add(desiredPose(fighter.body, { stance: intent.stance })[P.lHand], [0.06 * H * arc, -0.02 * H, -0.1 * H * arc]);
  } else if (defence.name === 'leanBack') {
    intent.lean -= 0.35 * arc;
    intent.shift -= 0.04 * arc;
  } else if (defence.name === 'check' && !fighter.punch) {
    intent.check = arc > 0.2;
  } else if (defence.name === 'stepBack') {
    fighter.move = -1;
  }
  if (defence.t >= defence.seconds) {
    if (defence.name === 'stepBack') fighter.move = 0;
    fighter.defence = null;
  }
}

// ---- Footwork -------------------------------------------------------------

function plantFeet(fighter) {
  fighter.feet = {};
  for (const side of ['l', 'r']) {
    const index = P[`${side}Foot`];
    fighter.feet[side] = { index, planted: point(fighter.x, index), step: null };
  }
}

/** Feet stay planted while the stance drifts, then step to catch up, one at a time. */
function updateFeet(fighter, dt) {
  if (fighter.state !== 'up' && fighter.state !== 'rising') {
    plantFeet(fighter);
    return;
  }
  const spec = WORLD.step;
  const feet = Object.values(fighter.feet);
  for (const [side, foot] of Object.entries(fighter.feet)) {
    // A kicking, kneeing or checking leg is off the floor; when it comes
    // down it is planted where it lands.
    const lifted = !!(fighter.intent[`${side}Foot`] || fighter.intent[`${side}Knee`] || (fighter.intent.check && side === 'l'));
    if (foot.lifted && !lifted) foot.planted = [fighter.x[foot.index * 3], fighter.desired[foot.index][1], fighter.x[foot.index * 3 + 2]];
    foot.lifted = lifted;
    if (lifted) foot.step = null;
  }
  const stepping = feet.some((foot) => foot.step || foot.lifted);
  let worst = null;
  let worstDrift = spec.threshold;
  for (const foot of feet) {
    const desired = toWorld(fighter, fighter.desired[foot.index]);
    foot.desired = desired;
    const drift = Math.hypot(desired[0] - foot.planted[0], desired[2] - foot.planted[2]);
    if (!foot.step && drift > worstDrift) {
      worst = foot;
      worstDrift = drift;
    }
  }
  if (worst && !stepping) {
    // Step to where the stance will be, not where it is: lead the motion.
    const lead = spec.lead * spec.seconds;
    const to = [worst.desired[0] + fighter.rootVelocity[0] * lead, worst.desired[1], worst.desired[2] + fighter.rootVelocity[1] * lead];
    worst.step = { from: [...worst.planted], to, t: 0 };
  }
  for (const foot of feet) {
    if (!foot.step) continue;
    foot.step.t += dt / spec.seconds;
    if (foot.step.t >= 1) {
      foot.planted = foot.step.to;
      foot.step = null;
    }
  }
}

function footTarget(fighter, foot) {
  if (foot.lifted) return toWorld(fighter, fighter.desired[foot.index]);
  if (!foot.step) return [foot.planted[0], fighter.desired[foot.index][1], foot.planted[2]];
  const t = foot.step.t;
  const ease = t * t * (3 - 2 * t);
  const along = vec.lerp(foot.step.from, foot.step.to, ease);
  return [along[0], fighter.desired[foot.index][1] + WORLD.step.lift * Math.sin(Math.PI * t), along[2]];
}

// ---- Stepping -------------------------------------------------------------

/** Advance the world by `dt` seconds (one outer step, several substeps). */
export function step(world, dt) {
  for (const fighter of world.fighters) {
    moveRoot(world, fighter, dt);
    updateTimers(world, fighter, dt);
    updateIntent(world, fighter, dt);
    updateFeet(fighter, dt);
  }
  const h = dt / WORLD.substeps;
  for (let substep = 0; substep < WORLD.substeps; substep += 1) {
    const time = world.time + substep * h;
    for (const fighter of world.fighters) integrate(fighter, h, time);
    for (const fighter of world.fighters) {
      solveConstraints(fighter, h);
      solveJointLimits(world, fighter);
    }
    for (const fighter of world.fighters) if (fighter.clinch) holdClinch(world, fighter);
    collideFighters(world, h, time);
    for (const fighter of world.fighters) {
      collideGround(fighter, h);
      for (let index = 0; index < fighter.v.length; index += 1) fighter.v[index] = (fighter.x[index] - fighter.prev[index]) / h;
    }
    for (const impulse of world.pendingImpulses) deliverImpulse(impulse);
    world.pendingImpulses = [];
  }
  for (const fighter of world.fighters) {
    trackHandSpeed(fighter);
    checkBalance(world, fighter);
  }
  world.time += dt;
  world.lastDt = dt;
}

/**
 * The clinch: each hand is held to the back of the opponent's neck by a
 * constraint shared by inverse mass, so a heavier fighter's head is harder to
 * pull down. A grip pulled too far open lets go.
 */
function holdClinch(world, fighter) {
  const target = world.fighters[fighter.clinch.target];
  for (const side of ['l', 'r']) {
    const hand = P[`${side}Hand`];
    const neck = vec.add(point(target.x, P.neck), [0, -WORLD.clinch.pullDown * 0.5, 0]);
    const offset = vec.sub(point(fighter.x, hand), neck);
    const distance = vec.length(offset);
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

/**
 * Balance. A fighter whose hips are knocked moving faster than they meant to
 * move, or are carried too far outside the feet, goes over: down, not
 * counted, and up again after a moment. Strong legs hold more.
 */
function checkBalance(world, fighter) {
  if (fighter.state !== 'up' || fighter.handsDown) return;
  const legRatio = fighter.body.motorForce[P.pelvis] / (fighter.body.massKg * WORLD.gravity);
  const legs = Math.max(0.5, Math.min(1.3, legRatio / WORLD.legStrengthTypical)) * (1 - 0.5 * Math.min(1, (fighter.legDamage.l + fighter.legDamage.r) / (2 * WORLD.legCapacity)));
  const knock = Math.hypot(fighter.knock[0], fighter.knock[2]);
  // The legs soak the knock up over a few tenths of a second, stepping.
  const decay = Math.exp(-WORLD.balance.absorbPerSecond * world.lastDt);
  fighter.knock = fighter.knock.map((value) => value * decay);
  // Carried outside a two-footed base counts too (one foot up is a kick).
  const planted = Object.values(fighter.feet).every((foot) => !foot.lifted);
  const pelvis = point(fighter.x, P.pelvis);
  const feet = vec.lerp(point(fighter.x, P.lFoot), point(fighter.x, P.rFoot), 0.5);
  const outside = planted ? Math.hypot(pelvis[0] - feet[0], pelvis[2] - feet[2]) : 0;
  const legLength = fighter.body.lengths.thigh + fighter.body.lengths.shank;
  if (knock > WORLD.balance.speed * legs || outside > WORLD.balance.reach * legLength * legs) {
    fighter.knock = [0, 0, 0];
    fighter.state = 'down';
    fighter.punch = null;
    fighter.rush = null;
    fighter.clinch = null;
    fighter.downTimer = WORLD.balance.fallSeconds;
    world.events.push({ time: world.time, kind: 'fell', fighter: fighter.id, effects: [knock > WORLD.balance.speed * legs ? 'knocked off balance' : 'overreached'] });
  }
}

/** Advance by any number of seconds at the fixed step: the manual test hook. */
export function advance(world, seconds, think = null, stepSeconds = 1 / 60) {
  let left = seconds;
  while (left > 1e-9) {
    const dt = Math.min(stepSeconds, left);
    if (think) think(world, dt);
    step(world, dt);
    left -= dt;
  }
}

function moveRoot(world, fighter, dt) {
  const opponent = nearestOpponent(world, fighter);
  if (fighter.state !== 'up') {
    fighter.rootVelocity = [0, 0];
    return;
  }
  if (opponent) {
    const from = point(fighter.x, P.pelvis);
    const to = point(opponent.x, P.pelvis);
    const desiredYaw = Math.atan2(-(to[2] - from[2]), to[0] - from[0]);
    let turn = desiredYaw - fighter.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    fighter.yaw += turn * Math.min(1, dt * 6);
  }
  // Footwork has inertia: the stance accelerates and brakes at what the legs
  // can push, rather than starting and stopping dead.
  const legRatio = fighter.body.motorForce[P.pelvis] / (fighter.body.massKg * WORLD.gravity);
  const legs = Math.max(0.5, Math.min(1.3, legRatio / WORLD.legStrengthTypical));
  const forward = yawRotate([1, 0, 0], fighter.yaw);
  let drive = fighter.move;
  if (fighter.rush) {
    // A charge: flat out at the opponent, at what the legs can reach.
    fighter.rush.t += dt;
    drive = WORLD.rush.speedFactor;
    if (fighter.rush.t >= fighter.rush.duration) fighter.rush = null;
  }
  const wanted = [forward[0] * drive * WORLD.footSpeed * legs, forward[2] * drive * WORLD.footSpeed * legs];
  const change = [wanted[0] - fighter.rootVelocity[0], wanted[1] - fighter.rootVelocity[1]];
  const size = Math.hypot(change[0], change[1]);
  const limit = WORLD.footAcceleration * legs * (fighter.rush ? 1.6 : 1) * dt;
  const scale = size > limit ? limit / size : 1;
  fighter.rootVelocity[0] += change[0] * scale;
  fighter.rootVelocity[1] += change[1] * scale;
  fighter.root[0] += fighter.rootVelocity[0] * dt;
  fighter.root[1] += fighter.rootVelocity[1] * dt;
  // A shove moves the stance too: the root drifts to where the pelvis was pushed.
  const pelvis = point(fighter.x, P.pelvis);
  const rootPelvis = toWorld(fighter, fighter.desired[P.pelvis]);
  const follow = Math.min(1, dt * 2.5);
  fighter.root[0] += (pelvis[0] - rootPelvis[0]) * follow;
  fighter.root[1] += (pelvis[2] - rootPelvis[2]) * follow;
  const edge = WORLD.ringHalf - 0.3;
  fighter.root[0] = Math.max(-edge, Math.min(edge, fighter.root[0]));
  fighter.root[1] = Math.max(-edge, Math.min(edge, fighter.root[1]));
}

function updateTimers(world, fighter, dt) {
  fighter.cooldown = Math.max(0, fighter.cooldown - dt);
  fighter.guardHigh = Math.max(0, fighter.guardHigh - dt);
  fighter.slip = Math.max(0, fighter.slip - dt);
  fighter.stun = Math.max(0, fighter.stun - dt);
  if (fighter.clinch) {
    fighter.clinch.t += dt;
    const target = world.fighters[fighter.clinch.target];
    if (fighter.clinch.t >= fighter.clinch.duration || fighter.state !== 'up' || target.state !== 'up') fighter.clinch = null;
  }
  if (!fighter.punch) fighter.stamina = Math.min(1, fighter.stamina + WORLD.staminaRecovery * fighter.body.aerobic * dt);
  if (fighter.state === 'down') {
    fighter.motorScale = 0.04;
    fighter.downTimer -= dt;
    if (fighter.downTimer <= 0) {
      if (fighter.knockdowns >= WORLD.knockdownsToStop) {
        fighter.state = 'out';
        world.events.push({ time: world.time, kind: 'stopped', fighter: fighter.id });
      } else {
        fighter.state = 'rising';
        const pelvis = point(fighter.x, P.pelvis);
        fighter.root = [pelvis[0], pelvis[2]];
        plantFeet(fighter);
      }
    }
  } else if (fighter.state === 'rising') {
    fighter.motorScale = Math.min(1, fighter.motorScale + dt / WORLD.getUpSeconds);
    if (fighter.motorScale >= 1) fighter.state = 'up';
  } else if (fighter.state === 'up') {
    fighter.motorScale = fighter.stun > 0 ? 0.55 : 1;
  }
}

/** Share of a muscle's force available `elapsed` seconds after its part was hit. */
function reflexShare(fighter, elapsed) {
  const reflex = WORLD.reflex;
  const braced = fighter.guardHigh > 0 || fighter.slip > 0;
  const latency = reflex.latency - reflex.trainedSaving * fighter.body.inputs.training - (braced ? reflex.bracedSaving : 0);
  if (elapsed < latency) return reflex.floor;
  if (elapsed < latency + reflex.ramp) return reflex.floor + (1 - reflex.floor) * ((elapsed - latency) / reflex.ramp);
  return 1;
}

function motorTarget(fighter, index) {
  const name = PARTICLES[index];
  const desired = fighter.desired[index];
  if (name.endsWith('Foot')) return { target: footTarget(fighter, fighter.feet[name[0]]), velocity: [0, 0, 0] };
  if (name.endsWith('Knee')) {
    const side = name[0];
    if (fighter.feet[side].lifted) return { target: toWorld(fighter, desired), velocity: point(fighter.v, P[`${side}Hip`]) };
    const hip = point(fighter.x, P[`${side}Hip`]);
    const foot = footTarget(fighter, fighter.feet[side]);
    const pole = yawRotate([1, 0, side === 'l' ? 0.35 : -0.35], fighter.yaw);
    const L = fighter.body.lengths;
    return { target: twoBoneIK(hip, foot, L.thigh, L.shank, pole), velocity: point(fighter.v, P[`${side}Hip`]) };
  }
  const anchorName = ANCHOR[name];
  if (anchorName === null) return { target: toWorld(fighter, desired), velocity: [fighter.rootVelocity[0], 0, fighter.rootVelocity[1]] };
  const anchor = P[anchorName];
  const offset = yawRotate(vec.sub(desired, fighter.desired[anchor]), fighter.yaw);
  return { target: vec.add(point(fighter.x, anchor), offset), velocity: point(fighter.v, anchor) };
}

function integrate(fighter, h, time) {
  const fatigue = 0.55 + 0.45 * fighter.stamina;
  const alive = fighter.state === 'up' || fighter.state === 'rising';
  const damping = Math.exp(-h * (alive ? WORLD.damping.up : WORLD.damping.down));
  for (let index = 0; index < PARTICLES.length; index += 1) {
    const name = PARTICLES[index];
    const base = index * 3;
    const { target, velocity } = motorTarget(fighter, index);
    fighter.targets[index] = target;
    let acceleration = [0, -WORLD.gravity, 0];
    const arm = name.endsWith('Hand') || name.endsWith('Elbow');
    const scale = fighter.motorScale * (arm ? fatigue * handHealth(fighter, name) : 1) * reflexShare(fighter, time - fighter.hitAt[index]);
    if (scale > 0.01) {
      const { omega, zeta } = WORLD.motor[MOTOR_GROUP[name]];
      const want = [];
      for (let axis = 0; axis < 3; axis += 1) {
        // Spring towards the target, damper towards its velocity, and hold
        // the part up against gravity — all within the muscle's force.
        want.push(omega * omega * (target[axis] - fighter.x[base + axis]) + 2 * zeta * omega * (velocity[axis] - fighter.v[base + axis]) + (axis === 1 ? WORLD.gravity : 0));
      }
      const size = vec.length(want);
      let cap = motorForceNow(fighter, index, name) * scale * fighter.invMass[index];
      const top = fighter.body.topSpeed[index];
      if (top < Infinity && size > 0) {
        // Hill: the faster the limb already moves the way it is being driven,
        // the less force its muscle has left to give.
        const along = ((fighter.v[base] - velocity[0]) * want[0] + (fighter.v[base + 1] - velocity[1]) * want[1] + (fighter.v[base + 2] - velocity[2]) * want[2]) / size;
        if (along > 0) cap *= Math.max(0.02, (1 - along / top) / (1 + along / (BODY.hillCurvature * top)));
      }
      const limit = size > cap ? cap / size : 1;
      acceleration = vec.add(acceleration, vec.scale(want, limit));
    }
    for (let axis = 0; axis < 3; axis += 1) {
      fighter.v[base + axis] = (fighter.v[base + axis] + acceleration[axis] * h) * damping;
      fighter.prev[base + axis] = fighter.x[base + axis];
      fighter.x[base + axis] += fighter.v[base + axis] * h;
    }
  }
}

/**
 * The force a particle's muscles can apply now: a striking or lifted limb
 * uses the force that drives strikes; damaged legs lose some of theirs.
 */
function motorForceNow(fighter, index, name) {
  if (fighter.limp.has(index)) return 0;
  const body = fighter.body;
  let force = body.motorForce[index];
  const punch = fighter.punch;
  const side = name[0];
  const legPart = name.endsWith('Foot') || name.endsWith('Knee');
  if (punch && (punch.limb === index || (legPart && punch.spec.limb.startsWith(side) && punch.spec.limb.match(/Foot|Knee/)))) force = Math.max(force, body.strikeForce[index]);
  else if (legPart && fighter.feet[side].lifted) force = body.strikeForce[index];
  if (legPart || name === 'pelvis') {
    const damage = name === 'pelvis' ? (fighter.legDamage.l + fighter.legDamage.r) / 2 : fighter.legDamage[side];
    force *= 1 - 0.6 * Math.min(1, damage / WORLD.legCapacity);
  }
  return force;
}

function handHealth(fighter, name) {
  const side = name[0];
  return fighter.injuries.some((injury) => injury.kind === 'hand' && injury.side === side) ? 0.6 : 1;
}

function solveConstraints(fighter, h) {
  for (const constraint of fighter.constraints) {
    const { i, j, rest, compliance } = constraint;
    const offset = vec.sub(point(fighter.x, i), point(fighter.x, j));
    const distance = vec.length(offset) || 1e-9;
    const error = distance - rest;
    const weight = fighter.invMass[i] + fighter.invMass[j] + compliance / (h * h);
    const lambda = -error / weight;
    const normal = vec.scale(offset, 1 / distance);
    for (let axis = 0; axis < 3; axis += 1) {
      fighter.x[i * 3 + axis] += normal[axis] * lambda * fighter.invMass[i];
      fighter.x[j * 3 + axis] -= normal[axis] * lambda * fighter.invMass[j];
    }
  }
}

/**
 * Correct a joint by moving `index` by `delta` and the bones it hangs from
 * the opposite way, shared by inverse mass so momentum is kept. The step is
 * capped: a limit that yanks a particle far in one substep turns into a
 * velocity on the next and pumps energy into a resting body.
 */
function correctJoint(fighter, index, others, delta) {
  const size = vec.length(delta);
  if (size < 1e-9) return;
  // A limp body has no kick to protect: its limits hold as firmly as
  // ligaments do. Upright, they give a little, so a locked-out limb
  // is not snapped back.
  const step = fighter.state === 'up' ? WORLD.limitStep : WORLD.limitStepLimp;
  const capped = size > step ? vec.scale(delta, step / size) : delta;
  const weights = [fighter.invMass[index], ...others.map((other) => fighter.invMass[other] / others.length)];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  for (let axis = 0; axis < 3; axis += 1) fighter.x[index * 3 + axis] += capped[axis] * (weights[0] / total);
  others.forEach((other, order) => {
    for (let axis = 0; axis < 3; axis += 1) fighter.x[other * 3 + axis] -= capped[axis] * (weights[order + 1] / total);
  });
}

/**
 * Hinges and cones, so a body folds the way a body folds. A joint forced well
 * past its range breaks: from then on it has no limit and its limb no muscle.
 */
function solveJointLimits(world, fighter) {
  const pelvis = point(fighter.x, P.pelvis);
  const neck = point(fighter.x, P.neck);
  const trunkUp = vec.normalize(vec.sub(neck, pelvis));
  const across = vec.sub(point(fighter.x, P.lHip), point(fighter.x, P.rHip));
  const leftward = vec.normalize(vec.sub(point(fighter.x, P.lShoulder), point(fighter.x, P.rShoulder)));
  // Local axes are x forward, y up, z left, so forward = up × left. When the
  // hips are edge-on to the trunk there is no forward to bend towards.
  const forwardRaw = vec.cross(trunkUp, across);
  const hingeDefined = vec.length(forwardRaw) > 0.3 * vec.length(across);
  const forward = vec.normalize(forwardRaw);
  const L = fighter.body.lengths;

  for (const side of ['l', 'r']) {
    const sign = side === 'l' ? 1 : -1;
    // Knees bend only forward.
    if (hingeDefined) hinge(world, fighter, `${side}Knee`, P[`${side}Hip`], P[`${side}Knee`], P[`${side}Foot`], forward, L.shank);
    // Elbows bend only towards their natural side: down, back and out from
    // the shoulder–hand line, as the guard holds them.
    const elbowSide = vec.normalize(vec.add(vec.add(vec.scale(forward, -0.4), vec.scale(trunkUp, -1)), vec.scale(leftward, 0.5 * sign)));
    if (hingeDefined) hinge(world, fighter, `${side}Elbow`, P[`${side}Shoulder`], P[`${side}Elbow`], P[`${side}Hand`], elbowSide, L.forearmToFist);
    // Hips: the thigh swings within a cone about straight down.
    coneLimit(world, fighter, `${side}Hip`, P[`${side}Hip`], P[`${side}Knee`], vec.scale(trunkUp, -1), WORLD.joint.hipCone);
    foldLimit(fighter, P[`${side}Hip`], P[`${side}Foot`], WORLD.minFold.leg);
    foldLimit(fighter, P[`${side}Shoulder`], P[`${side}Hand`], WORLD.minFold.arm);
  }
  coneLimit(world, fighter, 'neck', P.neck, P.head, trunkUp, WORLD.headCone);
}

/**
 * A hinge: the middle joint may not cross the root–end line to the wrong
 * side. `bendSide` is the side it bends to; `lever` the outer bone's length.
 */
function hinge(world, fighter, joint, root, middle, end, bendSide, lever) {
  if (fighter.broken.has(joint)) return;
  const a = point(fighter.x, root);
  const b = point(fighter.x, middle);
  const c = point(fighter.x, end);
  const axis = vec.normalize(vec.sub(c, a));
  const onLine = vec.add(a, vec.scale(axis, vec.dot(vec.sub(b, a), axis)));
  const bend = vec.dot(vec.sub(b, onLine), bendSide);
  // Straight is within range (a kick or a punch locks out); only bending
  // past straight, the wrong way, is held back.
  const tolerance = -WORLD.joint.straightAllowance;
  if (bend >= tolerance) return;
  // The joint bends by about twice the angle its offset makes over one bone.
  const overAngle = 2 * Math.asin(Math.min(1, (tolerance - bend) / lever));
  if (strain(world, fighter, joint, overAngle)) return;
  correctJoint(fighter, middle, [root, end], vec.scale(bendSide, tolerance - bend));
}

/** A cone: the tip stays within `limit` radians of `axis` about the pivot. */
function coneLimit(world, fighter, joint, pivot, tip, axis, limit) {
  if (fighter.broken.has(joint)) return;
  const origin = point(fighter.x, pivot);
  const offset = vec.sub(point(fighter.x, tip), origin);
  const length = vec.length(offset);
  if (length < 1e-9) return;
  const angle = Math.acos(Math.max(-1, Math.min(1, vec.dot(offset, axis) / length)));
  if (angle <= limit) return;
  if (strain(world, fighter, joint, angle - limit)) return;
  const sideways = vec.normalize(vec.sub(offset, vec.scale(axis, vec.dot(offset, axis))));
  const limited = vec.add(vec.scale(axis, Math.cos(limit) * length), vec.scale(sideways, Math.sin(limit) * length));
  correctJoint(fighter, tip, [pivot], vec.sub(limited, offset));
}

/** How far past its range a joint can be wrenched before it gives. */
function breakAngleFor(joint) {
  return WORLD.joint.breakAngles[joint] ?? WORLD.joint.breakAngle;
}

/**
 * Strain: angle held past the breaking point, times how long, leaking away.
 * A joint gives under a sustained overload, not a single substep's spike
 * (which the limit's own correction can produce). Returns true if it broke.
 */
function strain(world, fighter, joint, overAngle) {
  if (fighter.state === 'rising') return false;
  const h = world.lastDt / WORLD.substeps;
  const strains = fighter.strain ?? (fighter.strain = {});
  const past = Math.max(0, overAngle - breakAngleFor(joint));
  strains[joint] = (strains[joint] ?? 0) * Math.exp(-WORLD.joint.strainLeak * h) + past * h;
  if (strains[joint] <= WORLD.joint.strainToBreak) return false;
  breakJoint(world, fighter, joint);
  return true;
}

// What hangs off each joint: the particles whose muscles die with it.
const LIMP_BELOW = {
  lElbow: ['lHand'], rElbow: ['rHand'],
  lKnee: ['lFoot'], rKnee: ['rFoot'],
  lHip: ['lKnee', 'lFoot'], rHip: ['rKnee', 'rFoot'],
  neck: ['head'],
};

/** A joint gives: no more limit, no more muscle below it; a leg or neck ends the fight. */
function breakJoint(world, fighter, joint) {
  fighter.broken.add(joint);
  for (const name of LIMP_BELOW[joint]) fighter.limp.add(P[name]);
  fighter.damage[JOINT_SEGMENTS[joint][0]] = Math.max(fighter.damage[JOINT_SEGMENTS[joint][0]] ?? 0, 1);
  const ending = !joint.endsWith('Elbow');
  const event = { time: world.time, kind: 'broken', fighter: fighter.id, joint, effects: [`${jointName(joint)} broken${ending ? ' — cannot continue' : ''}`] };
  world.events.push(event);
  fighter.damageVersion += 1;
  if (ending) {
    fighter.state = 'down';
    fighter.punch = null;
    fighter.rush = null;
    fighter.clinch = null;
    fighter.knockdowns = Math.max(fighter.knockdowns, WORLD.knockdownsToStop);
    fighter.downTimer = Math.min(fighter.downTimer || Infinity, 2);
  }
}

export const JOINT_SEGMENTS = {
  lElbow: ['lForearm', 'lUpperArm'], rElbow: ['rForearm', 'rUpperArm'],
  lKnee: ['lShank', 'lThigh'], rKnee: ['rShank', 'rThigh'],
  lHip: ['lThigh'], rHip: ['rThigh'], neck: ['head'],
};

function jointName(joint) {
  const side = joint[0] === 'l' ? 'left ' : joint[0] === 'r' ? 'right ' : '';
  return side + joint.replace(/^[lr](?=[A-Z])/, '').toLowerCase();
}

function foldLimit(fighter, rootIndex, endIndex, minimum) {
  const offset = vec.sub(point(fighter.x, endIndex), point(fighter.x, rootIndex));
  const distance = vec.length(offset);
  if (distance >= minimum || distance < 1e-9) return;
  correctJoint(fighter, endIndex, [rootIndex], vec.scale(offset, (minimum - distance) / distance));
}

function collideGround(fighter, h) {
  const friction = Math.exp(-WORLD.groundFriction * h);
  for (let index = 0; index < PARTICLES.length; index += 1) {
    const base = index * 3;
    const floor = fighter.radius[index];
    if (fighter.x[base + 1] < floor) {
      fighter.x[base + 1] = floor;
      // Flesh on canvas does not bounce: the push out of the floor must not
      // turn into upward speed, or a falling body springs back up.
      fighter.prev[base + 1] = Math.max(fighter.prev[base + 1], floor);
      fighter.x[base] = fighter.prev[base] + (fighter.x[base] - fighter.prev[base]) * friction;
      fighter.x[base + 2] = fighter.prev[base + 2] + (fighter.x[base + 2] - fighter.prev[base + 2]) * friction;
    }
    for (const axis of [0, 2]) {
      const limit = WORLD.ringHalf;
      if (fighter.x[base + axis] > limit) fighter.x[base + axis] = limit;
      if (fighter.x[base + axis] < -limit) fighter.x[base + axis] = -limit;
    }
  }
}

// ---- Contact --------------------------------------------------------------

/** Capsules a glove can hit or a body can lean on. */
export function capsules(fighter) {
  const segments = fighter.body.segments;
  return STRUCK.map((key) => {
    if (key === 'head') return { key, a: P.head, b: P.head, radius: fighter.body.lengths.headRadius };
    const segment = SEGMENTS[key];
    if (key === 'trunk') {
      // The chest is wider than it is deep; a round capsule as wide as the
      // chest would stick out in front of the face. Use the depth, and stop
      // the top cap at the collarbones so it cannot cover the chin.
      const radius = segments.trunk.skinRadius * 0.78;
      return { key, a: P[segment.from], b: P[segment.to], radius, bLength: 1 - (radius * 0.9) / segments.trunk.length };
    }
    return { key, a: P[segment.from], b: P[segment.to], radius: segments[key].skinRadius };
  });
}

/** World end points of a capsule (the trunk's top end sits below the neck). */
export function capsuleEnds(fighter, capsule) {
  const a = point(fighter.x, capsule.a);
  const b = point(fighter.x, capsule.b);
  return [a, capsule.bLength ? vec.lerp(a, b, capsule.bLength) : b];
}

function closestOnSegment(p, a, b) {
  const ab = vec.sub(b, a);
  const lengthSquared = vec.dot(ab, ab);
  const t = lengthSquared < 1e-12 ? 0 : Math.max(0, Math.min(1, vec.dot(vec.sub(p, a), ab) / lengthSquared));
  return { t, point: vec.add(a, vec.scale(ab, t)) };
}

function collideFighters(world, h, time) {
  const fighters = world.fighters;
  for (const attacker of fighters) {
    for (const defender of fighters) {
      if (attacker === defender) continue;
      for (const striker of strikers(attacker)) collideStriker(world, attacker, defender, striker, time);
    }
  }
  for (let first = 0; first < fighters.length; first += 1) {
    for (let second = first + 1; second < fighters.length; second += 1) pushApart(world, fighters[first], fighters[second]);
  }
}

/**
 * What of the attacker can hit: both gloves always (they block and push),
 * and the limb of a strike in flight — an elbow or knee as a ball, a kick as
 * the shin from knee to foot.
 */
function strikers(fighter) {
  const list = ['l', 'r'].map((side) => ({ key: `${side}Hand`, a: P[`${side}Hand`], b: P[`${side}Hand`], radius: WORLD.gloveRadius, side }));
  const punch = fighter.punch;
  if (!punch || punch.t > punch.spec.extendUntil + 0.06) return list;
  const limb = punch.spec.limb;
  const side = limb[0];
  if (limb.endsWith('Elbow')) list.push({ key: limb, a: P[limb], b: P[limb], radius: 0.05, side });
  else if (limb.endsWith('Knee')) list.push({ key: limb, a: P[limb], b: P[limb], radius: 0.07, side });
  else if (limb.endsWith('Foot')) list.push({ key: limb, a: P[`${side}Knee`], b: P[limb], radius: 0.05, side, shin: true });
  return list;
}

/** Closest points between two segments: parameters s on the first, t on the second. */
function closestBetween(p1, q1, p2, q2) {
  const d1 = vec.sub(q1, p1);
  const d2 = vec.sub(q2, p2);
  const r = vec.sub(p1, p2);
  const a = vec.dot(d1, d1);
  const e = vec.dot(d2, d2);
  const f = vec.dot(d2, r);
  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  let s;
  let t;
  if (a < 1e-12 && e < 1e-12) {
    s = 0;
    t = 0;
  } else if (a < 1e-12) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = vec.dot(d1, r);
    if (e < 1e-12) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = vec.dot(d1, d2);
      const denominator = a * e - b * b;
      s = denominator > 1e-12 ? clamp01((b * f - c * e) / denominator) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  return { s, t, onFirst: vec.add(p1, vec.scale(d1, s)), onSecond: vec.add(p2, vec.scale(d2, t)) };
}

function collideStriker(world, attacker, defender, striker, time) {
  const sa = point(attacker.x, striker.a);
  const sb = point(attacker.x, striker.b);
  for (const capsule of capsules(defender)) {
    // Kicks hit legs and bodies; gloves only collide above the waist.
    if (!striker.shin && capsule.key.match(/Thigh|Shank/) && !(attacker.punch?.spec.limb === striker.key)) continue;
    const [a, b] = capsuleEnds(defender, capsule);
    const closest = closestBetween(sa, sb, a, b);
    closest.t *= capsule.bLength ?? 1;
    const offset = vec.sub(closest.onFirst, closest.onSecond);
    const distance = vec.length(offset);
    const reach = capsule.radius + striker.radius;
    const contactKey = `${defender.id}:${striker.key}:${capsule.key}`;
    if (distance >= reach) {
      attacker.contacts.delete(contactKey);
      continue;
    }
    const normal = distance > 1e-9 ? vec.scale(offset, 1 / distance) : [0, 1, 0];
    if (!attacker.contacts.has(contactKey)) {
      attacker.contacts.add(contactKey);
      registerImpact(world, attacker, defender, striker, closest, capsule, normal, time);
    }
    // Separate them, sharing the push by inverse mass.
    const penetration = reach - distance;
    const shares = [
      [attacker, striker.a, striker.a === striker.b ? 1 : 1 - closest.s, 1],
      [attacker, striker.b, striker.a === striker.b ? 0 : closest.s, 1],
      [defender, capsule.a, capsule.a === capsule.b ? 1 : 1 - closest.t, -1],
      [defender, capsule.b, capsule.a === capsule.b ? 0 : closest.t, -1],
    ].filter(([, , share]) => share > 0);
    const total = shares.reduce((sum, [fighter, index, share]) => sum + fighter.invMass[index] * share, 0);
    for (const [fighter, index, share, sign] of shares) {
      const amount = (penetration * fighter.invMass[index] * share) / total;
      for (let axis = 0; axis < 3; axis += 1) fighter.x[index * 3 + axis] += sign * normal[axis] * amount;
    }
  }
}

/**
 * Bodies meet: trunks and heads cannot overlap. The push is shared by
 * inverse mass, so a heavy fighter moves a light one; and a charge that
 * arrives fast hands its momentum over in a collision.
 */
function pushApart(world, first, second) {
  const pairs = [['trunk', 'trunk'], ['head', 'head'], ['head', 'trunk'], ['trunk', 'head']];
  const firstCapsules = Object.fromEntries(capsules(first).map((capsule) => [capsule.key, capsule]));
  const secondCapsules = Object.fromEntries(capsules(second).map((capsule) => [capsule.key, capsule]));
  for (const [firstKey, secondKey] of pairs) {
    const one = firstCapsules[firstKey];
    const two = secondCapsules[secondKey];
    const [a1, b1] = capsuleEnds(first, one);
    const [a2, b2] = capsuleEnds(second, two);
    const closest = closestBetween(a1, b1, a2, b2);
    const offset = vec.sub(closest.onFirst, closest.onSecond);
    const distance = vec.length(offset);
    const reach = one.radius + two.radius;
    if (distance >= reach || distance < 1e-9) continue;
    const normal = vec.scale(offset, 1 / distance);
    if (firstKey === 'trunk' && secondKey === 'trunk') collideBodies(world, first, second, normal);
    const shares = [
      [first, one.a, one.a === one.b ? 1 : 1 - closest.s, 1], [first, one.b, one.a === one.b ? 0 : closest.s, 1],
      [second, two.a, two.a === two.b ? 1 : 1 - closest.t, -1], [second, two.b, two.a === two.b ? 0 : closest.t, -1],
    ].filter(([, , share]) => share > 0);
    const total = shares.reduce((sum, [fighter, index, share]) => sum + fighter.invMass[index] * share, 0);
    for (const [fighter, index, share, sign] of shares) {
      const amount = ((reach - distance) * fighter.invMass[index] * share) / total;
      for (let axis = 0; axis < 3; axis += 1) fighter.x[index * 3 + axis] += sign * normal[axis] * amount;
    }
  }
}

/** A charge landing: the trunks exchange momentum as two effective masses would. */
function collideBodies(world, first, second, normal) {
  const charger = first.rush && !first.rush.hit ? first : second.rush && !second.rush.hit ? second : null;
  if (!charger) return;
  const velocity = (fighter) => vec.scale(TRUNK_PARTICLES.reduce((sum, index) => vec.add(sum, vec.scale(point(fighter.v, index), fighter.body.masses[index])), [0, 0, 0]), 1 / TRUNK_PARTICLES.reduce((sum, index) => sum + fighter.body.masses[index], 0));
  // Normal points from second to first; closing speed is how fast they meet.
  const closing = vec.dot(vec.sub(velocity(second), velocity(first)), normal);
  if (closing < WORLD.rush.minClosing) return;
  charger.rush.hit = true;
  charger.rush.t = Math.max(charger.rush.t, charger.rush.duration - 0.15);
  const m1 = first.body.massKg * WORLD.rush.trunkShare;
  const m2 = second.body.massKg * WORLD.rush.trunkShare;
  const impulse = ((m1 * m2) / (m1 + m2)) * closing * (1 + WORLD.transferRestitution);
  const everywhere = TRUNK_PARTICLES.map((index) => [index, 1]);
  // The charger meant to be moving: the impulse that only cancels his own
  // run is braking, not a knock. Only what goes beyond it can topple him.
  const runSpeed = (fighter, towards) => Math.max(0, vec.dot(velocity(fighter), towards));
  const braced = (fighter, direction) => (fighter === charger ? runSpeed(fighter, vec.scale(direction, -1)) : 0);
  world.pendingImpulses.push({ fighter: first, shares: everywhere, direction: normal, impulse, braced: braced(first, normal) });
  world.pendingImpulses.push({ fighter: second, shares: everywhere, direction: vec.scale(normal, -1), impulse, braced: braced(second, vec.scale(normal, -1)) });
  const struck = charger === first ? second : first;
  struck.stamina = Math.max(0, struck.stamina - impulse / (struck.body.massKg * 2) / struck.body.aerobic);
  world.events.push({ time: world.time, kind: 'collision', attacker: charger.id, defender: struck.id, punch: 'rush', target: 'trunk', speed: closing, impulse, force: 0, headDeltaV: 0, effects: [], point: point(struck.x, P.neck), normal });
}

/** Which of the struck fighter's particles take the blow, and in what share. */
function struckParticles(defender, capsule, closest, contactPoint, push) {
  if (capsule.key === 'head') return [[P.head, 1]];
  if (capsule.key === 'trunk') {
    // A push moves the whole trunk; a strike, the trunk near where it landed.
    return TRUNK_PARTICLES.map((index) => {
      const distance = vec.length(vec.sub(point(defender.x, index), contactPoint));
      return [index, push ? 1 : Math.exp(-((distance / 0.22) ** 2))];
    });
  }
  const side = capsule.key[0];
  if (capsule.key.match(/Thigh|Shank/)) return [[capsule.a, 1 - closest.t], [capsule.b, closest.t], [P[`${side}Hip`], 0.25]];
  // A guard is braced against the head and shoulders: a blocked strike is
  // taken by the arm and the trunk behind it, not the forearm alone.
  return [[capsule.a, 1 - closest.t], [capsule.b, closest.t], [P[`${side}Shoulder`], 0.8], [P.neck, 0.5], [P.pelvis, 0.3]];
}

function registerImpact(world, attacker, defender, striker, closest, capsule, normal, time) {
  const punch = attacker.punch;
  if (!punch || punch.spec.limb !== striker.key || punch.landed || punch.t > punch.spec.extendUntil + 0.06) return;
  const spec = punch.spec;
  const strikeVelocity = vec.lerp(point(attacker.v, striker.a), point(attacker.v, striker.b), closest.s);
  const struckVelocity = vec.lerp(point(defender.v, capsule.a), point(defender.v, capsule.b), closest.t);
  const closing = -vec.dot(vec.sub(strikeVelocity, struckVelocity), normal);
  if (closing < WORLD.minImpactSpeed) return;
  punch.landed = true;

  const body = defender.body;
  const side = striker.side;
  const onLeg = /Thigh|Shank/.test(capsule.key);
  const checked = onLeg && defender.intent.check && capsule.key[0] === 'l';
  const blocked = BLOCKING.has(capsule.key) || checked;
  const technique = attacker.body.technique;
  const limbs = attacker.body.limbKg;
  const strikeMass = ((spec.mass.arm ?? 0) * limbs[`${side}Arm`] + (spec.mass.leg ?? 0) * limbs[`${side}Leg`] + (spec.mass.body ?? 0) * attacker.body.massKg) * technique;
  const struckMass = capsule.key === 'head' ? body.headEffectiveMass
    : capsule.key === 'trunk' ? body.massKg * 0.35
      : onLeg ? body.segments[capsule.key].mass + body.massKg * (capsule.key.includes('Thigh') ? 0.12 : 0.06)
        : body.segments[capsule.key].mass + body.segments.trunk.mass * 0.25;
  // A collision of two effective masses; flesh and padding make it largely
  // inelastic, so the impulse is the reduced mass times the closing speed.
  const reducedMass = (strikeMass * struckMass) / (strikeMass + struckMass);
  const impulse = reducedMass * closing * (1 + WORLD.restitution);
  const firmness = body.segments[capsule.key === 'head' ? 'head' : capsule.key === 'trunk' ? 'trunk' : capsule.key].fleshFirmness;
  const peakForce = ((Math.PI / 2) * impulse) / (WORLD.contactSeconds * (1 + 0.6 * (1 - firmness)));
  const contactPoint = vec.add(closest.onSecond, vec.scale(normal, capsule.radius));
  const event = {
    time: world.time, kind: blocked ? 'blocked' : 'landed', attacker: attacker.id, defender: defender.id,
    punch: punch.type, target: capsule.key, speed: closing, impulse, force: peakForce, headDeltaV: 0, effects: [],
    point: contactPoint, normal,
  };
  if (checked) event.effects.push('checked');
  addDamage(defender, capsule.key, impulse / struckMass, blocked);
  if (blocked) {
    attacker.stats.blocked += 1;
    event.headDeltaV = BLOCKING.has(capsule.key) ? (impulse * 0.12) / body.headEffectiveMass : 0;
    // Kicking into a checked shin hurts the kicker's shin.
    if (checked) attacker.legDamage[side] += (impulse * 0.5) / limbs[`${side}Leg`];
  } else {
    attacker.stats.landed += 1;
    if (capsule.key === 'head') {
      // Rotational strikes turn the head as well as pushing it, and rotation
      // is what knocks people out (Ommaya; Viano 2005).
      event.headDeltaV = (impulse / body.headEffectiveMass) * spec.rotation;
      applyHeadDamage(world, defender, event);
      if (spec.cuts && peakForce > 1800) {
        defender.cuts = (defender.cuts ?? 0) + 1;
        event.effects.push('cut opened');
      }
      if (peakForce > body.fracture.face && !defender.injuries.some((injury) => injury.kind === 'face')) {
        defender.injuries.push({ kind: 'face', time: world.time });
        event.effects.push('facial fracture');
      }
    } else if (capsule.key === 'trunk') {
      defender.stamina = Math.max(0, defender.stamina - (impulse / (body.massKg * 0.6)) / body.aerobic);
      event.effects.push(spec.push ? 'pushed back' : 'body: wind taken');
      if (peakForce > body.fracture.rib && !defender.injuries.some((injury) => injury.kind === 'rib')) {
        defender.injuries.push({ kind: 'rib', time: world.time });
        event.effects.push('rib fracture');
      }
    } else if (onLeg) {
      const legSide = capsule.key[0];
      defender.legDamage[legSide] += impulse / limbs[`${legSide}Leg`] * (body.limbKg[`${legSide}Leg`] / limbs[`${legSide}Leg`]);
      event.effects.push('leg kicked');
      if (defender.legDamage[legSide] > WORLD.legCapacity && defender.state === 'up') {
        knockDown(world, defender, event, 'knockdown (leg gave way)');
      }
    }
  }
  if (spec.limb.endsWith('Hand') && peakForce > attacker.body.fracture.hand * (blocked ? 0.8 : 1) && !attacker.injuries.some((injury) => injury.kind === 'hand' && injury.side === side)) {
    attacker.injuries.push({ kind: 'hand', side, time: world.time });
    event.effects.push(`${attacker.body.inputs.name}: broken hand`);
  }

  // Momentum is conserved: the struck part takes the impulse, the striking
  // limb takes it back. Both sides' muscles there are caught off guard for a
  // reflex delay, so the part flies before it is caught.
  const struck = struckParticles(defender, capsule, closest, contactPoint, spec.push);
  const transferred = (impulse * (1 + WORLD.transferRestitution)) / (1 + WORLD.restitution);
  event.transferred = transferred;
  world.pendingImpulses.push({ fighter: defender, shares: struck, direction: vec.scale(normal, -1), impulse: transferred });
  const limbKind = spec.limb.slice(1);
  world.pendingImpulses.push({ fighter: attacker, shares: RECOIL[limbKind].map(([part, share]) => [P[`${side}${part}`], share]), direction: normal, impulse: transferred });
  for (const [index, share] of struck) if (share > 0.2) defender.hitAt[index] = time;
  if (capsule.key === 'head') defender.hitAt[P.neck] = time;
  world.events.push(event);
}

/** Strike one particle of a fighter as a landed blow would: impulse, then a reflex delay. */
export function hitParticle(world, fighter, index, direction, impulse) {
  deliverImpulse({ fighter, shares: [[index, 1]], direction: vec.normalize(direction), impulse });
  fighter.hitAt[index] = world.time;
}

/**
 * Give `impulse` (N·s) along `direction` to a set of particles, weighted by
 * share: each moves with the same velocity change scaled by its share, and
 * the momentum added sums to exactly the impulse.
 */
export function deliverImpulse({ fighter, shares, direction, impulse, braced = 0 }) {
  let weightedMass = 0;
  for (const [index, share] of shares) weightedMass += share * fighter.body.masses[index];
  if (weightedMass <= 0) return;
  // The trunk's share of the push, as a velocity of the whole body.
  const trunkShare = shares.filter(([index]) => TRUNK_PARTICLES.includes(index)).reduce((sum, [index, share]) => sum + share * fighter.body.masses[index], 0);
  if (trunkShare > 0) {
    const bodyDeltaV = Math.max(0, (impulse * (trunkShare / weightedMass)) / (fighter.body.massKg * 0.7) - braced);
    for (let axis = 0; axis < 3; axis += 1) fighter.knock[axis] += direction[axis] * bodyDeltaV;
  }
  for (const [index, share] of shares) {
    const deltaV = (impulse * share) / weightedMass;
    for (let axis = 0; axis < 3; axis += 1) fighter.v[index * 3 + axis] += direction[axis] * deltaV;
  }
}

function applyHeadDamage(world, defender, event) {
  const body = defender.body;
  const deltaV = event.headDeltaV;
  // Brain strain grows faster than linearly with head speed change; small
  // touches add almost nothing, hard shots add a lot.
  defender.concussion += Math.max(0, deltaV - 1.2) ** 2;
  defender.stun = Math.max(defender.stun, 0.25 * deltaV);
  const capacity = WORLD.concussionCapacity * body.chin * (defender.knockdowns + 1);
  if (defender.state === 'up' && (deltaV > body.chin || defender.concussion > capacity)) {
    knockDown(world, defender, event, deltaV > body.chin ? 'knockdown (one clean shot)' : 'knockdown (accumulated)');
  }
}

/**
 * Damage to a body segment, 0 to 1: the speed each blow gave it, summed
 * against what that tissue takes before it is seriously hurt. Blocked blows
 * count for a little. The view reddens a segment as this rises.
 */
function addDamage(fighter, key, deltaV, blocked) {
  const capacity = WORLD.damageCapacity[key.replace(/^[lr](?=[A-Z])/, '')] ?? 20;
  const share = (deltaV * (blocked ? WORLD.blockedDamageShare : 1)) / capacity;
  fighter.damage[key] = Math.min(1, (fighter.damage[key] ?? 0) + share);
  fighter.damageVersion += 1;
}

/** Down, counted: the muscles let go and the count begins. */
function knockDown(world, defender, event, reason) {
  defender.state = 'down';
  defender.knockdowns += 1;
  defender.punch = null;
  defender.rush = null;
  defender.clinch = null;
  defender.downTimer = WORLD.downSecondsMin + world.random() * WORLD.downSecondsRange + defender.knockdowns;
  event.effects.push(reason);
  world.fighters[event.attacker].stats.knockdownsScored += 1;
}

function trackHandSpeed(fighter) {
  // Only the punch on its way in: after contact the glove's speed is rebound.
  if (!fighter.punch || fighter.punch.landed || fighter.punch.t > fighter.punch.spec.extendUntil) return;
  const hand = fighter.punch.limb;
  const speed = vec.length(point(fighter.v, hand));
  fighter.punch.peakSpeed = Math.max(fighter.punch.peakSpeed, speed);
  fighter.stats.lastHandSpeed = fighter.punch.peakSpeed;
  fighter.stats.maxHandSpeed = Math.max(fighter.stats.maxHandSpeed, speed);
}

/** The winning corner once the other has no fighter able to continue. */
export function boutWinner(world) {
  const alive = (corner) => world.fighters.some((fighter) => fighter.corner === corner && fighter.state !== 'out');
  if (!alive('red')) return 'blue';
  if (!alive('blue')) return 'red';
  return null;
}
