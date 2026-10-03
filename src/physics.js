// The fight world: each fighter is a particle skeleton held together by XPBD
// distance constraints and joint limits, driven by muscles modelled as
// spring-dampers whose force is capped by the muscle's strength. Mass gives
// every movement inertia; the cap decides how hard a muscle can fight back.
// A landed punch hands its momentum to the struck part, which flies until
// the fighter's muscles, after a reflex delay, catch it.

import { buildBody, P, PARTICLES, SEGMENTS } from './body.js';
import { idleMotion, lifePhases } from './life.js';
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
  reflex: { latency: 0.085, trainedSaving: 0.03, bracedSaving: 0.035, ramp: 0.12, floor: 0.25 },
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
  limitStep: 0.004, // m: most a joint limit may correct in one substep
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
  downSecondsMin: 3,
  downSecondsRange: 4,
  knockdownsToStop: 3,
};

export const PUNCHES = {
  jab: { hand: 'l', path: 'straight', windup: 0, extendUntil: 0.2, duration: 0.34, twist: 0.12, shift: 0.05, cost: 0.012 },
  cross: { hand: 'r', path: 'straight', windup: 0, extendUntil: 0.26, duration: 0.44, twist: -0.85, shift: 0.06, cost: 0.02 },
  hook: { hand: 'l', path: 'hook', windup: 0.09, extendUntil: 0.3, duration: 0.48, twist: 0.45, shift: 0.02, cost: 0.024 },
  uppercut: { hand: 'r', path: 'upper', windup: 0.08, extendUntil: 0.28, duration: 0.46, twist: -0.55, dip: 0.02, cost: 0.024 },
};

const BRACES = [
  ['lShoulder', 'rShoulder', 'braceCompliance'], ['lHip', 'rHip', 'braceCompliance'],
  ['lShoulder', 'lHip', 'braceCompliance'], ['rShoulder', 'rHip', 'braceCompliance'],
  ['lShoulder', 'rHip', 'diagonalCompliance'], ['rShoulder', 'lHip', 'diagonalCompliance'],
  ['neck', 'lHip', 'diagonalCompliance'], ['neck', 'rHip', 'diagonalCompliance'],
];
const BONES = [
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
const STRUCK = ['head', 'trunk', 'lForearm', 'rForearm', 'lUpperArm', 'rUpperArm'];

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
    punch: null, cooldown: 0, guardHigh: 0, slip: 0,
    stats: { thrown: 0, landed: 0, blocked: 0, maxHandSpeed: 0, lastHandSpeed: 0, knockdownsScored: 0 },
    contacts: new Set(),
  };
  for (let index = 0; index < count; index += 1) setPoint(fighter.x, index, toWorld(fighter, rest[index]));
  fighter.prev.set(fighter.x);
  plantFeet(fighter);
  for (const [a, b] of BONES) addConstraint(fighter, a, b, 0);
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
  return { time: 0, fighters, events: [], random, over: false, pendingImpulses: [] };
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

/** Throw a punch at the opponent's head or body. Returns false if the fighter cannot. */
export function throwPunch(world, fighter, type, zone = 'head') {
  const spec = PUNCHES[type];
  const target = nearestOpponent(world, fighter);
  if (!spec || !target || fighter.punch || fighter.state !== 'up' || fighter.stamina < spec.cost) return false;
  const aim = zone === 'head' ? point(target.x, P.head) : vec.lerp(point(target.x, P.pelvis), point(target.x, P.neck), 0.6);
  fighter.punch = { type, spec, zone, t: 0, aim: toLocal(fighter, aim), target: target.id, landed: false, peakSpeed: 0 };
  fighter.stamina = Math.max(0, fighter.stamina - spec.cost / fighter.body.aerobic);
  fighter.stats.thrown += 1;
  return true;
}

function punchHandTarget(fighter) {
  const punch = fighter.punch;
  const spec = punch.spec;
  const aim = punch.aim;
  // Aim through the target, as boxers are taught: the glove decelerates on
  // the opponent, not in the air in front of them.
  const through = vec.add(aim, [WORLD.followThrough, 0, 0]);
  if (punch.t >= spec.extendUntil) return null;
  if (spec.path === 'hook') {
    const side = spec.hand === 'l' ? 1 : -1;
    return punch.t < spec.windup ? vec.add(aim, [-0.2, 0.02, 0.38 * side]) : vec.add(aim, [0.06, 0, -0.2 * side]);
  }
  if (spec.path === 'upper') {
    return punch.t < spec.windup ? vec.add(aim, [-0.18, -0.38, 0]) : vec.add(aim, [0.06, 0.16, 0]);
  }
  return through;
}

function updateIntent(world, fighter, dt) {
  const H = fighter.body.heightM;
  const idle = idleMotion(fighter, world.time);
  const intent = {
    twist: idle.twist, lean: idle.lean, dip: idle.dip,
    headOffset: vec.scale(idle.headOffset, H), guardOffset: idle.guardOffset, guardTight: fighter.guardHigh > 0,
  };
  if (fighter.punch) {
    const punch = fighter.punch;
    punch.t += dt;
    const spec = punch.spec;
    // The kinetic chain: hips and shoulders turn first and have finished
    // turning by the time the glove is halfway there.
    const phase = Math.min(1, punch.t / (spec.extendUntil * WORLD.rotationLead));
    const twistShape = punch.t < spec.extendUntil ? Math.sin(phase * Math.PI * 0.5) : Math.max(0, 1 - (punch.t - spec.extendUntil) / (spec.duration - spec.extendUntil));
    intent.twist += spec.twist * twistShape;
    intent.dip += (spec.dip ?? 0) * twistShape;
    intent.lean += 0.12 * twistShape;
    intent.shift = (spec.shift ?? 0) * twistShape;
    intent[`${spec.hand}Hand`] = punchHandTarget(fighter);
    if (punch.t >= spec.duration) fighter.punch = null;
  }
  if (fighter.slip > 0) {
    intent.headOffset = vec.add(intent.headOffset, [-0.02 * H, -0.05 * H, (fighter.slipSide ?? 1) * 0.07 * H]);
    intent.lean -= 0.05;
  }
  fighter.intent = intent;
  fighter.desired = desiredPose(fighter.body, intent);
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
  const stepping = feet.some((foot) => foot.step);
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
      solveJointLimits(fighter);
    }
    collideFighters(world, h, time);
    for (const fighter of world.fighters) {
      collideGround(fighter, h);
      for (let index = 0; index < fighter.v.length; index += 1) fighter.v[index] = (fighter.x[index] - fighter.prev[index]) / h;
    }
    for (const impulse of world.pendingImpulses) deliverImpulse(impulse);
    world.pendingImpulses = [];
  }
  for (const fighter of world.fighters) trackHandSpeed(fighter);
  world.time += dt;
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
  const wanted = [forward[0] * fighter.move * WORLD.footSpeed * legs, forward[2] * fighter.move * WORLD.footSpeed * legs];
  const change = [wanted[0] - fighter.rootVelocity[0], wanted[1] - fighter.rootVelocity[1]];
  const size = Math.hypot(change[0], change[1]);
  const limit = WORLD.footAcceleration * legs * dt;
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
      const cap = fighter.body.motorForce[index] * scale * fighter.invMass[index];
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
  const capped = size > WORLD.limitStep ? vec.scale(delta, WORLD.limitStep / size) : delta;
  const weights = [fighter.invMass[index], ...others.map((other) => fighter.invMass[other] / others.length)];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  for (let axis = 0; axis < 3; axis += 1) fighter.x[index * 3 + axis] += capped[axis] * (weights[0] / total);
  others.forEach((other, order) => {
    for (let axis = 0; axis < 3; axis += 1) fighter.x[other * 3 + axis] -= capped[axis] * (weights[order + 1] / total);
  });
}

/** Hinges and cones, so a limp body folds the way a body folds. */
function solveJointLimits(fighter) {
  const pelvis = point(fighter.x, P.pelvis);
  const neck = point(fighter.x, P.neck);
  const trunkUp = vec.normalize(vec.sub(neck, pelvis));
  const across = vec.sub(point(fighter.x, P.lHip), point(fighter.x, P.rHip));
  // Local axes are x forward, y up, z left, so forward = up × left. When the
  // hips are edge-on to the trunk there is no forward to bend towards.
  const forwardRaw = vec.cross(trunkUp, across);
  const hingeDefined = vec.length(forwardRaw) > 0.3 * vec.length(across);
  const forward = vec.normalize(forwardRaw);

  for (const side of ['l', 'r']) {
    const hip = point(fighter.x, P[`${side}Hip`]);
    const knee = point(fighter.x, P[`${side}Knee`]);
    const foot = point(fighter.x, P[`${side}Foot`]);
    const axis = vec.normalize(vec.sub(foot, hip));
    const onLine = vec.add(hip, vec.scale(axis, vec.dot(vec.sub(knee, hip), axis)));
    const bend = vec.dot(vec.sub(knee, onLine), forward);
    if (hingeDefined && bend < 0.005) correctJoint(fighter, P[`${side}Knee`], [P[`${side}Hip`], P[`${side}Foot`]], vec.scale(forward, 0.005 - bend));
    foldLimit(fighter, P[`${side}Hip`], P[`${side}Foot`], WORLD.minFold.leg);
    foldLimit(fighter, P[`${side}Shoulder`], P[`${side}Hand`], WORLD.minFold.arm);
  }

  const head = point(fighter.x, P.head);
  const offset = vec.sub(head, neck);
  const length = vec.length(offset);
  const cos = vec.dot(offset, trunkUp) / length;
  if (cos < Math.cos(WORLD.headCone)) {
    const sideways = vec.normalize(vec.sub(offset, vec.scale(trunkUp, vec.dot(offset, trunkUp))));
    const limited = vec.add(vec.scale(trunkUp, Math.cos(WORLD.headCone) * length), vec.scale(sideways, Math.sin(WORLD.headCone) * length));
    correctJoint(fighter, P.head, [P.neck], vec.sub(limited, offset));
  }
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
      for (const side of ['l', 'r']) collideGlove(world, attacker, defender, side, time);
    }
  }
  for (let first = 0; first < fighters.length; first += 1) {
    for (let second = first + 1; second < fighters.length; second += 1) pushApart(fighters[first], fighters[second]);
  }
}

function collideGlove(world, attacker, defender, side, time) {
  const hand = P[`${side}Hand`];
  const glove = point(attacker.x, hand);
  for (const capsule of capsules(defender)) {
    const [a, b] = capsuleEnds(defender, capsule);
    const closest = closestOnSegment(glove, a, b);
    // Back to the share between the two particles, for the shortened trunk.
    closest.t *= capsule.bLength ?? 1;
    const offset = vec.sub(glove, closest.point);
    const distance = vec.length(offset);
    const reach = capsule.radius + WORLD.gloveRadius;
    const contactKey = `${defender.id}:${side}:${capsule.key}`;
    if (distance >= reach) {
      attacker.contacts.delete(contactKey);
      continue;
    }
    const normal = distance > 1e-9 ? vec.scale(offset, 1 / distance) : [0, 1, 0];
    if (!attacker.contacts.has(contactKey)) {
      attacker.contacts.add(contactKey);
      registerImpact(world, attacker, defender, side, capsule, closest, normal, time);
    }
    // Separate the glove from the body, sharing the push by inverse mass.
    const penetration = reach - distance;
    const wGlove = attacker.invMass[hand];
    const wA = defender.invMass[capsule.a] * (1 - closest.t);
    const wB = capsule.a === capsule.b ? 0 : defender.invMass[capsule.b] * closest.t;
    const total = wGlove + wA + wB;
    for (let axis = 0; axis < 3; axis += 1) {
      attacker.x[hand * 3 + axis] += normal[axis] * penetration * (wGlove / total);
      defender.x[capsule.a * 3 + axis] -= normal[axis] * penetration * (wA / total);
      if (wB > 0) defender.x[capsule.b * 3 + axis] -= normal[axis] * penetration * (wB / total);
    }
  }
}

function pushApart(first, second) {
  const pairs = [['trunk', 'trunk'], ['head', 'head'], ['head', 'trunk'], ['trunk', 'head']];
  const firstCapsules = Object.fromEntries(capsules(first).map((capsule) => [capsule.key, capsule]));
  const secondCapsules = Object.fromEntries(capsules(second).map((capsule) => [capsule.key, capsule]));
  for (const [firstKey, secondKey] of pairs) {
    const one = firstCapsules[firstKey];
    const two = secondCapsules[secondKey];
    // Sample the first capsule's axis; enough for upright bodies leaning on each other.
    for (const t of one.a === one.b ? [0] : [0, 0.5, 1]) {
      const pointOne = vec.lerp(...capsuleEnds(first, one), t);
      const closest = closestOnSegment(pointOne, ...capsuleEnds(second, two));
      const offset = vec.sub(pointOne, closest.point);
      const distance = vec.length(offset);
      const reach = one.radius + two.radius;
      if (distance >= reach || distance < 1e-9) continue;
      const push = vec.scale(offset, ((reach - distance) / distance) * 0.5);
      for (const [fighter, index, sign] of [[first, one.a, 1], [first, one.b, 1], [second, two.a, -1], [second, two.b, -1]]) {
        for (let axis = 0; axis < 3; axis += 1) fighter.x[index * 3 + axis] += (push[axis] * sign) / 2;
      }
    }
  }
}

/** Which of the struck fighter's particles take the blow, and in what share. */
function struckParticles(defender, capsule, closest, contactPoint) {
  if (capsule.key === 'head') return [[P.head, 1]];
  if (capsule.key === 'trunk') {
    // A blow to the body moves the trunk near where it landed most.
    return TRUNK_PARTICLES.map((index) => {
      const distance = vec.length(vec.sub(point(defender.x, index), contactPoint));
      return [index, Math.exp(-((distance / 0.22) ** 2))];
    });
  }
  const shoulder = P[`${capsule.key[0]}Shoulder`];
  return [[capsule.a, 1 - closest.t], [capsule.b, closest.t], [shoulder, 0.25]];
}

function registerImpact(world, attacker, defender, side, capsule, closest, normal, time) {
  const punch = attacker.punch;
  if (!punch || punch.spec.hand !== side || punch.landed || punch.t > punch.spec.extendUntil + 0.06) return;
  const hand = P[`${side}Hand`];
  const gloveVelocity = point(attacker.v, hand);
  const struckVelocity = vec.lerp(point(defender.v, capsule.a), point(defender.v, capsule.b), closest.t);
  const closing = -vec.dot(vec.sub(gloveVelocity, struckVelocity), normal);
  if (closing < WORLD.minImpactSpeed) return;
  punch.landed = true;

  const body = defender.body;
  const blocked = capsule.key !== 'head' && capsule.key !== 'trunk';
  const strikeMass = attacker.body.strikeMass[punch.type];
  const struckMass = capsule.key === 'head' ? body.headEffectiveMass
    : capsule.key === 'trunk' ? body.massKg * 0.35
      : body.segments[capsule.key].mass + body.segments.trunk.mass * 0.25;
  // A collision of two effective masses; flesh and glove make it largely
  // inelastic, so the impulse is the reduced mass times the closing speed.
  const reducedMass = (strikeMass * struckMass) / (strikeMass + struckMass);
  const impulse = reducedMass * closing * (1 + WORLD.restitution);
  // Softer (fattier) flesh stretches the contact out and lowers the peak.
  const firmness = body.segments[capsule.key === 'head' ? 'head' : 'trunk'].fleshFirmness;
  const peakForce = ((Math.PI / 2) * impulse) / (WORLD.contactSeconds * (1 + 0.6 * (1 - firmness)));
  const contactPoint = vec.add(closest.point, vec.scale(normal, capsule.radius));
  const event = {
    time: world.time, kind: blocked ? 'blocked' : 'landed', attacker: attacker.id, defender: defender.id,
    punch: punch.type, target: capsule.key, speed: closing, impulse, force: peakForce, headDeltaV: 0, effects: [],
    point: contactPoint, normal,
  };
  if (blocked) {
    attacker.stats.blocked += 1;
    event.headDeltaV = (impulse * 0.12) / body.headEffectiveMass;
  } else {
    attacker.stats.landed += 1;
    if (capsule.key === 'head') {
      // Rotational punches turn the head as well as pushing it, and rotation
      // is what knocks people out (Ommaya; Viano 2005).
      event.headDeltaV = (impulse / body.headEffectiveMass) * WORLD.rotationalFactor[punch.type];
      applyHeadDamage(world, defender, event);
      if (peakForce > body.fracture.face && !defender.injuries.some((injury) => injury.kind === 'face')) {
        defender.injuries.push({ kind: 'face', time: world.time });
        event.effects.push('facial fracture');
      }
    } else {
      defender.stamina = Math.max(0, defender.stamina - (impulse / (body.massKg * 0.6)) / body.aerobic);
      event.effects.push('body: wind taken');
      if (peakForce > body.fracture.rib && !defender.injuries.some((injury) => injury.kind === 'rib')) {
        defender.injuries.push({ kind: 'rib', time: world.time });
        event.effects.push('rib fracture');
      }
    }
  }
  if (peakForce > attacker.body.fracture.hand * (blocked ? 0.8 : 1) && !attacker.injuries.some((injury) => injury.kind === 'hand' && injury.side === side)) {
    attacker.injuries.push({ kind: 'hand', side, time: world.time });
    event.effects.push(`${attacker.body.inputs.name}: broken hand`);
  }

  // Momentum is conserved: the struck part takes the impulse, the punching
  // arm takes it back. Both sides' muscles there are caught off guard for a
  // reflex delay, so the part flies before it is caught.
  const struck = struckParticles(defender, capsule, closest, contactPoint);
  world.pendingImpulses.push({ fighter: defender, shares: struck, direction: vec.scale(normal, -1), impulse });
  world.pendingImpulses.push({ fighter: attacker, shares: [[hand, 1], [P[`${side}Elbow`], 0.7], [P[`${side}Shoulder`], 0.35], [P.neck, 0.15]], direction: normal, impulse });
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
export function deliverImpulse({ fighter, shares, direction, impulse }) {
  let weightedMass = 0;
  for (const [index, share] of shares) weightedMass += share * fighter.body.masses[index];
  if (weightedMass <= 0) return;
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
    defender.state = 'down';
    defender.knockdowns += 1;
    defender.punch = null;
    defender.downTimer = WORLD.downSecondsMin + world.random() * WORLD.downSecondsRange + defender.knockdowns;
    event.effects.push(deltaV > body.chin ? 'knockdown (one clean shot)' : 'knockdown (accumulated)');
    world.fighters[event.attacker].stats.knockdownsScored += 1;
  }
}

function trackHandSpeed(fighter) {
  // Only the punch on its way in: after contact the glove's speed is rebound.
  if (!fighter.punch || fighter.punch.landed || fighter.punch.t > fighter.punch.spec.extendUntil) return;
  const hand = P[`${fighter.punch.spec.hand}Hand`];
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
