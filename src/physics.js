// The fight world: each fighter is a particle skeleton held together by XPBD
// distance constraints, driven by force-limited motors that chase a desired
// pose. Punches are hand targets; the muscle's force limit decides how fast
// the glove gets there, and the masses decide what a landed punch does.

import { buildBody, P, PARTICLES, SEGMENTS } from './body.js';
import { desiredPose, restPose, vec, yawRotate } from './pose.js';

export const WORLD = {
  gravity: 9.81,
  substeps: 8,
  // Half the inside of a 20 ft ring (6.1 m), less a margin for the ropes.
  ringHalf: 2.85,
  gloveRadius: 0.065,
  // Motors drive velocity towards the target at this rate (1/s), capped by
  // the muscle's force; high, so the force cap — the body — sets the speed.
  motorGain: { hand: 70, elbow: 40, head: 20, default: 30 },
  // Per-second velocity damping: joints and tissue lose energy; a limp body
  // less so, which is why it falls rather than sinks.
  damping: { up: 2.5, down: 0.7 },
  groundFriction: 14,
  braceCompliance: 5e-4, // m/N: torso cross-braces give a little so the trunk can twist
  diagonalCompliance: 3e-3,
  // An impact's contact lasts about this long through a 10–12 oz glove;
  // peak force ≈ (π/2)·impulse / contact time for a half-sine pulse.
  contactSeconds: 0.011,
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
// head knocked sideways is pulled back by the neck, not by the world.
const ANCHOR = {
  head: 'neck', neck: 'pelvis', lShoulder: 'pelvis', rShoulder: 'pelvis', lHip: 'pelvis', rHip: 'pelvis',
  lElbow: 'lShoulder', rElbow: 'rShoulder', lHand: 'lShoulder', rHand: 'rShoulder', lKnee: 'pelvis', rKnee: 'pelvis',
  pelvis: null, lFoot: null, rFoot: null,
};
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

export function createFighter(inputs, { id, corner, x, facing }) {
  const body = buildBody(inputs);
  const rest = restPose(body);
  const count = PARTICLES.length;
  const fighter = {
    id, corner, body,
    x: new Float64Array(count * 3), v: new Float64Array(count * 3), prev: new Float64Array(count * 3),
    invMass: body.masses.map((mass) => 1 / mass),
    radius: PARTICLES.map((name) => (name === 'head' ? body.lengths.headRadius : name.endsWith('Hand') ? WORLD.gloveRadius : name.endsWith('Foot') ? 0.05 : 0.04)),
    constraints: [],
    root: [x, 0], yaw: facing, move: 0,
    intent: {}, desired: rest, targets: rest.map((point) => [...point]),
    state: 'up', motorScale: 1, stun: 0, downTimer: 0,
    stamina: 1, concussion: 0, knockdowns: 0, injuries: [],
    punch: null, cooldown: 0, guardHigh: 0, slip: 0,
    stats: { thrown: 0, landed: 0, blocked: 0, maxHandSpeed: 0, lastHandSpeed: 0, knockdownsScored: 0 },
    contacts: new Set(),
  };
  for (let index = 0; index < count; index += 1) setPoint(fighter.x, index, toWorld(fighter, rest[index]));
  fighter.prev.set(fighter.x);
  for (const [a, b] of BONES) addConstraint(fighter, a, b, 0);
  for (const [a, b, key] of BRACES) addConstraint(fighter, a, b, WORLD[key]);
  return fighter;
}

function addConstraint(fighter, a, b, compliance) {
  const i = P[a];
  const j = P[b];
  const rest = vec.length(vec.sub(fighter.desired[i], fighter.desired[j]));
  fighter.constraints.push({ i, j, rest, compliance });
}

export function createWorld(fighterInputs, { seed = 1 } = {}) {
  const sides = fighterInputs.map((entry, index) => ({ inputs: entry.inputs ?? entry, corner: entry.corner ?? (index % 2 === 0 ? 'red' : 'blue') }));
  const fighters = sides.map((side, index) => {
    const onRed = side.corner === 'red';
    const sameCorner = sides.slice(0, index).filter((other) => other.corner === side.corner).length;
    const x = (onRed ? -1 : 1) * (1.1 + sameCorner * 0.5);
    return createFighter(side.inputs, { id: index, corner: side.corner, x, facing: onRed ? 0 : Math.PI });
  });
  for (const [index, fighter] of fighters.entries()) fighter.root[1] = (index % 3 - 1) * 0.6 * (fighters.length > 2 ? 1 : 0);
  return { time: 0, fighters, events: [], random: seededRandom(seed), over: false };
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

function updateIntent(fighter, dt) {
  const intent = { twist: 0, headOffset: [0, 0, 0], guardTight: fighter.guardHigh > 0 };
  if (fighter.punch) {
    const punch = fighter.punch;
    punch.t += dt;
    const spec = punch.spec;
    // The kinetic chain: hips and shoulders turn first and have finished
    // turning by the time the glove is halfway there.
    const phase = Math.min(1, punch.t / (spec.extendUntil * WORLD.rotationLead));
    const twistShape = punch.t < spec.extendUntil ? Math.sin(phase * Math.PI * 0.5) : Math.max(0, 1 - (punch.t - spec.extendUntil) / (spec.duration - spec.extendUntil));
    intent.twist = spec.twist * twistShape;
    intent.dip = (spec.dip ?? 0) * twistShape;
    intent.lean = 0.12 * twistShape;
    intent.shift = (spec.shift ?? 0) * twistShape;
    intent[`${spec.hand}Hand`] = punchHandTarget(fighter);
    if (punch.t >= spec.duration) fighter.punch = null;
  }
  if (fighter.slip > 0) {
    const H = fighter.body.heightM;
    intent.headOffset = [-0.02 * H, -0.05 * H, (fighter.slipSide ?? 1) * 0.07 * H];
    intent.lean = (intent.lean ?? 0) - 0.05;
  }
  fighter.intent = intent;
  fighter.desired = desiredPose(fighter.body, intent);
}

// ---- Stepping -------------------------------------------------------------

/** Advance the world by `dt` seconds (one outer step, several substeps). */
export function step(world, dt) {
  for (const fighter of world.fighters) {
    faceOpponent(world, fighter, dt);
    updateTimers(world, fighter, dt);
    updateIntent(fighter, dt);
  }
  const h = dt / WORLD.substeps;
  for (let substep = 0; substep < WORLD.substeps; substep += 1) {
    for (const fighter of world.fighters) integrate(fighter, h);
    for (const fighter of world.fighters) solveConstraints(fighter, h);
    collideFighters(world, h);
    for (const fighter of world.fighters) {
      collideGround(fighter, h);
      for (let index = 0; index < fighter.v.length; index += 1) fighter.v[index] = (fighter.x[index] - fighter.prev[index]) / h;
    }
    for (const impulse of world.pendingImpulses ?? []) applyImpulse(impulse);
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

function faceOpponent(world, fighter, dt) {
  const opponent = nearestOpponent(world, fighter);
  if (fighter.state !== 'up') return;
  if (opponent) {
    const from = point(fighter.x, P.pelvis);
    const to = point(opponent.x, P.pelvis);
    const desiredYaw = Math.atan2(-(to[2] - from[2]), to[0] - from[0]);
    let turn = desiredYaw - fighter.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    fighter.yaw += turn * Math.min(1, dt * 6);
  }
  // Footwork moves the stance; a shove moves the stance too, because the
  // root follows the pelvis that was actually pushed.
  const forward = yawRotate([1, 0, 0], fighter.yaw);
  const speed = 1.2 * Math.min(1.3, fighter.body.motorForce[P.pelvis] / (fighter.body.massKg * 9.81 * 3));
  fighter.root[0] += forward[0] * fighter.move * speed * dt;
  fighter.root[1] += forward[2] * fighter.move * speed * dt;
  const pelvis = point(fighter.x, P.pelvis);
  const rootPelvis = toWorld(fighter, fighter.desired[P.pelvis]);
  const follow = Math.min(1, dt * 3);
  fighter.root[0] += (pelvis[0] - rootPelvis[0]) * follow;
  fighter.root[1] += (pelvis[2] - rootPelvis[2]) * follow;
  const limit = WORLD.ringHalf - 0.3;
  fighter.root[0] = Math.max(-limit, Math.min(limit, fighter.root[0]));
  fighter.root[1] = Math.max(-limit, Math.min(limit, fighter.root[1]));
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
      }
    }
  } else if (fighter.state === 'rising') {
    fighter.motorScale = Math.min(1, fighter.motorScale + dt / WORLD.getUpSeconds);
    if (fighter.motorScale >= 1) fighter.state = 'up';
  } else if (fighter.state === 'up') {
    fighter.motorScale = fighter.stun > 0 ? 0.45 : 1;
  }
}

function integrate(fighter, h) {
  const fatigue = 0.55 + 0.45 * fighter.stamina;
  const damping = Math.exp(-h * (fighter.state === 'up' || fighter.state === 'rising' ? WORLD.damping.up : WORLD.damping.down));
  for (let index = 0; index < PARTICLES.length; index += 1) {
    const name = PARTICLES[index];
    const base = index * 3;
    fighter.v[base + 1] -= WORLD.gravity * h;
    const anchorName = ANCHOR[name];
    const desired = fighter.desired[index];
    const target = anchorName === null
      ? toWorld(fighter, desired)
      : vec.add(point(fighter.x, P[anchorName]), yawRotate(vec.sub(desired, fighter.desired[P[anchorName]]), fighter.yaw));
    fighter.targets[index] = target;
    const scale = fighter.motorScale * (name.endsWith('Hand') || name.endsWith('Elbow') ? fatigue * handHealth(fighter, name) : 1);
    if (scale > 0) {
      const gain = WORLD.motorGain[name.endsWith('Hand') ? 'hand' : name.endsWith('Elbow') ? 'elbow' : name === 'head' ? 'head' : 'default'];
      const maxDelta = (fighter.body.motorForce[index] * scale * fighter.invMass[index]) * h;
      const delta = [];
      for (let axis = 0; axis < 3; axis += 1) {
        // Gravity is part of what the motor fights, so it aims for the target
        // velocity after gravity has already pulled this substep.
        delta.push((target[axis] - fighter.x[base + axis]) * gain - fighter.v[base + axis]);
      }
      const size = vec.length(delta);
      const limit = size > maxDelta ? maxDelta / size : 1;
      for (let axis = 0; axis < 3; axis += 1) fighter.v[base + axis] += delta[axis] * limit;
    }
    for (let axis = 0; axis < 3; axis += 1) {
      fighter.v[base + axis] *= damping;
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
    const a = point(fighter.x, i);
    const b = point(fighter.x, j);
    const offset = vec.sub(a, b);
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

/** Capsules a glove can hit or a body can lean on: [segment name, a, b, radius]. */
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

function collideFighters(world, h) {
  const fighters = world.fighters;
  for (const attacker of fighters) {
    for (const defender of fighters) {
      if (attacker === defender) continue;
      for (const side of ['l', 'r']) collideGlove(world, attacker, defender, side, h);
    }
  }
  for (let first = 0; first < fighters.length; first += 1) {
    for (let second = first + 1; second < fighters.length; second += 1) pushApart(fighters[first], fighters[second]);
  }
}

function collideGlove(world, attacker, defender, side, h) {
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
      registerImpact(world, attacker, defender, side, capsule, closest, normal, h);
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

function registerImpact(world, attacker, defender, side, capsule, closest, normal, h) {
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
  const impulse = reducedMass * closing * 1.1;
  // Softer (fattier) flesh stretches the contact out and lowers the peak.
  const firmness = body.segments[capsule.key === 'head' ? 'head' : 'trunk'].fleshFirmness;
  const peakForce = ((Math.PI / 2) * impulse) / (WORLD.contactSeconds * (1 + 0.6 * (1 - firmness)));
  const event = {
    time: world.time, kind: blocked ? 'blocked' : 'landed', attacker: attacker.id, defender: defender.id,
    punch: punch.type, target: capsule.key, speed: closing, impulse, force: peakForce, headDeltaV: 0, effects: [],
    point: vec.add(closest.point, vec.scale(normal, capsule.radius)), normal,
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
  // The struck part moves with the momentum it was given: the head snaps.
  world.pendingImpulses = world.pendingImpulses ?? [];
  world.pendingImpulses.push({ fighter: defender, indices: capsule.a === capsule.b ? [capsule.a] : [capsule.a, capsule.b], weights: capsule.a === capsule.b ? [1] : [1 - closest.t, closest.t], direction: vec.scale(normal, -1), impulse });
  world.pendingImpulses.push({ fighter: attacker, indices: [hand], weights: [1], direction: normal, impulse: impulse * 0.35 });
  world.events.push(event);
}

function applyImpulse({ fighter, indices, weights, direction, impulse }) {
  indices.forEach((index, order) => {
    const deltaV = (impulse * weights[order]) * fighter.invMass[index];
    for (let axis = 0; axis < 3; axis += 1) fighter.v[index * 3 + axis] += direction[axis] * deltaV;
  });
}

function applyHeadDamage(world, defender, event) {
  const body = defender.body;
  const deltaV = event.headDeltaV;
  // Brain strain grows faster than linearly with head speed change; small
  // touches add almost nothing, hard shots add a lot.
  defender.concussion += Math.max(0, deltaV - 1.2) ** 2;
  defender.stun = Math.max(defender.stun, 0.12 * deltaV);
  const capacity = WORLD.concussionCapacity * body.chin * (defender.knockdowns + 1);
  if (defender.state === 'up' && (deltaV > body.chin || defender.concussion > capacity)) {
    defender.state = 'down';
    defender.knockdowns += 1;
    defender.punch = null;
    defender.downTimer = WORLD.downSecondsMin + world.random() * WORLD.downSecondsRange + defender.knockdowns;
    event.effects.push(deltaV > body.chin ? 'knockdown (one clean shot)' : 'knockdown (accumulated)');
    const attacker = world.fighters[event.attacker];
    attacker.stats.knockdownsScored += 1;
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

/** True when one corner has no fighter left standing a chance. */
export function boutWinner(world) {
  const alive = (corner) => world.fighters.some((fighter) => fighter.corner === corner && fighter.state !== 'out');
  if (!alive('red')) return 'blue';
  if (!alive('blue')) return 'red';
  return null;
}
