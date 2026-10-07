// The retiarius's net as a soft body: knots joined by cords that pull taut
// but never push (a cord can go slack, not stiff), lead weights on the rim,
// air drag, the bodies it falls over, the sand. Drawn only: whether a man is
// caught is still the physics' (physics/net.js); this is how the net looks
// doing it — hanging from the hand, opening in flight, draping and tangling
// on the man, sliding off him and lying in the sand.

import { P } from './body.js';
import { capsuleEnds, capsules, point } from './physics.js';
import { NET } from './weapons.js';

const GRAVITY = 9.81;

// The net: a coarse square mesh of thick hemp cut round, big holes, a knot
// at every crossing; heavy for its size, so it falls straight and hangs.
export const ROPE_NET = { cells: 10, cord: 0.0065, knot: 0.032, rim: 0.06, drag: 0.5, color: 0x9a7d50 };

// Solver: substeps a second, cord passes a substep, and how the sand and skin hold a cord.
const SOLVER = { rate: 240, maxSubsteps: 12, passes: 6, groundGrip: 0.85, skinGrip: 0.5, tangleReach: 0.02, tangleHold: 0.25, tangleShare: 0.15, settle: 0.02 };
// Drawn bodies are fuller than the physics capsules: how much a net must clear them.
const DRAWN = { head: 1.35, trunk: 1.45, default: 1.2 };
const KNOT_MASS = 1;

/**
 * Weave a net of `design` with radius `radius` (m): a square grid cut round,
 * knots at rest in the horizontal plane about the origin, cords between them,
 * the rim marked.
 */
export function weave(design, radius = NET.radius) {
  const rest = [];
  const rim = [];
  const cords = [];
  const index = new Map();
  const step = (radius * 2) / design.cells;
  for (let row = 0; row <= design.cells; row += 1) {
    for (let column = 0; column <= design.cells; column += 1) {
      const x = -radius + column * step;
      const z = -radius + row * step;
      if (Math.hypot(x, z) > radius + 1e-9) continue;
      index.set(`${row},${column}`, rest.length);
      rest.push([x, z]);
    }
  }
  for (const [key, a] of index) {
    const [row, column] = key.split(',').map(Number);
    const right = index.get(`${row},${column + 1}`);
    const down = index.get(`${row + 1},${column}`);
    if (right !== undefined) cords.push([a, right]);
    if (down !== undefined) cords.push([a, down]);
    // The rim: a knot missing a neighbour on some side.
    const sides = [index.get(`${row},${column - 1}`), right, index.get(`${row - 1},${column}`), down];
    if (sides.some((side) => side === undefined)) rim.push(a);
  }
  return { rest, rim, cords, radius };
}

/** A net's soft body, from its weave: knot positions, last positions, and inverse masses (the rim heavier). */
export function makeCloth(design, radius = NET.radius) {
  const woven = weave(design, radius);
  const count = woven.rest.length;
  const cloth = {
    design, woven, count,
    x: new Float64Array(count * 3), last: new Float64Array(count * 3), inverseMass: new Float64Array(count).fill(1 / KNOT_MASS),
    restLength: new Float64Array(woven.cords.length),
    pinned: null, tangled: null, still: 0,
  };
  // The rim's knots are bound into a heavier edge rope: `rim` kg each against a knot's notional 0.012.
  const rimWeight = Math.max(design.rim / 0.012, 1);
  for (const index of woven.rim) cloth.inverseMass[index] = 1 / (KNOT_MASS * rimWeight);
  woven.cords.forEach(([a, b], cord) => { cloth.restLength[cord] = Math.hypot(woven.rest[a][0] - woven.rest[b][0], woven.rest[a][1] - woven.rest[b][1]); });
  return cloth;
}

/**
 * Lay the cloth out from `centre`: its rest shape gathered by `gather`
 * (1 open, small bunched), tilted to hang (`hang` true: dropped straight
 * down from the centre) or flat, moving at `velocity` with an outward
 * `spread` (m/s at the rim) as a thrown cast net opens.
 */
export function layCloth(cloth, centre, { gather = 1, hang = false, velocity = [0, 0, 0], spread = 0, yaw = 0, dt = 1 / 60 } = {}) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  cloth.woven.rest.forEach(([u, v], index) => {
    const distance = Math.hypot(u, v);
    let offset;
    if (hang) {
      // Hung by its middle: each knot below the hand by its distance out, fanned a little.
      const angle = Math.atan2(v, u);
      offset = [Math.cos(angle) * distance * 0.12, -distance * 0.9, Math.sin(angle) * distance * 0.12];
    } else {
      const along = u * gather;
      const across = v * gather;
      offset = [along * cos - across * sin, -distance * gather * 0.15, along * sin + across * cos];
    }
    const outward = distance > 1e-9 ? [offset[0] / Math.max(1e-6, Math.hypot(offset[0], offset[2])), 0, offset[2] / Math.max(1e-6, Math.hypot(offset[0], offset[2]))] : [0, 0, 0];
    const rimShare = distance / cloth.woven.radius;
    for (let axis = 0; axis < 3; axis += 1) {
      const moving = velocity[axis] + (hang ? 0 : outward[axis] * spread * rimShare);
      cloth.x[index * 3 + axis] = centre[axis] + offset[axis];
      cloth.last[index * 3 + axis] = cloth.x[index * 3 + axis] - moving * dt;
    }
  });
  cloth.still = 0;
}

/** The knot a hand holds the net by: its middle (a grid's knot nearest the centre). */
export function middleKnot(cloth) {
  let best = 0;
  cloth.woven.rest.forEach(([u, v], index) => {
    const [bu, bv] = cloth.woven.rest[best];
    if (u * u + v * v < bu * bu + bv * bv) best = index;
  });
  return best;
}

/**
 * Step the cloth `dt` seconds among `fighters` (their drawn bodies are what
 * it falls on). `pinned`: a knot held at a point; `tangled`: the man it is
 * caught on, whose skin it grips and follows.
 */
export function stepCloth(cloth, dt, fighters) {
  if (dt <= 0) return;
  // A net lying still in the sand stays as it lies.
  if (cloth.still > 1 && !cloth.pinned && !cloth.tangled) return;
  const substeps = Math.min(SOLVER.maxSubsteps, Math.max(1, Math.ceil(dt * SOLVER.rate)));
  const h = dt / substeps;
  const keep = Math.exp(-cloth.design.drag * h);
  const bodies = nearbyBodies(cloth, fighters);
  let fastest = 0;
  for (let substep = 0; substep < substeps; substep += 1) {
    for (let index = 0; index < cloth.count; index += 1) {
      const i = index * 3;
      for (let axis = 0; axis < 3; axis += 1) {
        const moving = (cloth.x[i + axis] - cloth.last[i + axis]) * keep;
        cloth.last[i + axis] = cloth.x[i + axis];
        cloth.x[i + axis] += moving - (axis === 1 ? GRAVITY * h * h : 0);
      }
    }
    for (let pass = 0; pass < SOLVER.passes; pass += 1) {
      pullCords(cloth);
      holdPins(cloth);
    }
    collide(cloth, bodies);
    holdTangles(cloth);
    holdPins(cloth);
    if (substep === substeps - 1) {
      for (let i = 0; i < cloth.count * 3; i += 1) fastest = Math.max(fastest, Math.abs(cloth.x[i] - cloth.last[i]) / h);
    }
  }
  cloth.still = fastest < SOLVER.settle ? cloth.still + dt : 0;
  if (cloth.shed && (cloth.shed.left -= dt) <= 0) cloth.shed = null;
}

/** Cords only pull: a cord longer than its length is drawn back, shared by the knots' inverse masses. */
function pullCords(cloth) {
  const { x, inverseMass, restLength } = cloth;
  const cords = cloth.woven.cords;
  for (let cord = 0; cord < cords.length; cord += 1) {
    const a = cords[cord][0] * 3;
    const b = cords[cord][1] * 3;
    const dx = x[b] - x[a];
    const dy = x[b + 1] - x[a + 1];
    const dz = x[b + 2] - x[a + 2];
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (length <= restLength[cord] || length < 1e-9) continue;
    const wa = inverseMass[a / 3];
    const wb = inverseMass[b / 3];
    const share = (length - restLength[cord]) / length / (wa + wb);
    x[a] += dx * share * wa; x[a + 1] += dy * share * wa; x[a + 2] += dz * share * wa;
    x[b] -= dx * share * wb; x[b + 1] -= dy * share * wb; x[b + 2] -= dz * share * wb;
  }
}

function holdPins(cloth) {
  if (!cloth.pinned) return;
  const { knot, at } = cloth.pinned;
  for (let axis = 0; axis < 3; axis += 1) cloth.x[knot * 3 + axis] = at[axis];
}

/** The drawn capsules of every man near the net (a man far off cannot be touched). */
function nearbyBodies(cloth, fighters) {
  let cx = 0;
  let cz = 0;
  for (let index = 0; index < cloth.count; index += 1) {
    cx += cloth.x[index * 3];
    cz += cloth.x[index * 3 + 2];
  }
  cx /= cloth.count;
  cz /= cloth.count;
  const reach = cloth.woven.radius * 1.6 + 1.2;
  const bodies = [];
  for (const fighter of fighters) {
    if (cloth.shed?.fighter === fighter) continue;
    if (Math.hypot(fighter.x[P.pelvis * 3] - cx, fighter.x[P.pelvis * 3 + 2] - cz) > reach) continue;
    for (const capsule of capsules(fighter)) {
      const [a, b] = capsuleEnds(fighter, capsule);
      bodies.push({ fighter, key: capsule.key, a, b, radius: capsule.radius * (DRAWN[capsule.key] ?? DRAWN.default) + cloth.design.cord + 0.004 });
    }
  }
  return bodies;
}

/** Knots out of skin and sand; the sand holds a knot, skin a little; a caught man's skin catches it. */
function collide(cloth, bodies) {
  const { x, last } = cloth;
  const tangledOn = cloth.tangled?.fighter;
  for (let index = 0; index < cloth.count; index += 1) {
    const i = index * 3;
    for (const body of bodies) {
      const abx = body.b[0] - body.a[0];
      const aby = body.b[1] - body.a[1];
      const abz = body.b[2] - body.a[2];
      const lengthSquared = abx * abx + aby * aby + abz * abz;
      let t = lengthSquared < 1e-12 ? 0 : ((x[i] - body.a[0]) * abx + (x[i + 1] - body.a[1]) * aby + (x[i + 2] - body.a[2]) * abz) / lengthSquared;
      t = Math.max(0, Math.min(1, t));
      const px = body.a[0] + abx * t;
      const py = body.a[1] + aby * t;
      const pz = body.a[2] + abz * t;
      const dx = x[i] - px;
      const dy = x[i + 1] - py;
      const dz = x[i + 2] - pz;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance >= body.radius + (body.fighter === tangledOn ? SOLVER.tangleReach : 0)) continue;
      if (body.fighter === tangledOn && !cloth.tangled.knots.has(index) && cloth.tangled.knots.size < cloth.count * SOLVER.tangleShare) {
        // Caught: this knot is fouled on him where it touched (the first few to touch; the rest drape).
        const normal = distance > 1e-9 ? [dx / distance, dy / distance, dz / distance] : [0, 1, 0];
        cloth.tangled.knots.set(index, { key: body.key, t, normal });
      }
      if (distance >= body.radius) continue;
      const scale = distance > 1e-9 ? body.radius / distance : 0;
      x[i] = px + (scale ? dx * scale : 0);
      x[i + 1] = py + (scale ? dy * scale : body.radius);
      x[i + 2] = pz + (scale ? dz * scale : 0);
      for (let axis = 0; axis < 3; axis += 1) last[i + axis] += (x[i + axis] - last[i + axis]) * SOLVER.skinGrip * 0.5;
    }
    const floor = cloth.design.cord + 0.003;
    if (x[i + 1] < floor) {
      x[i + 1] = floor;
      last[i] += (x[i] - last[i]) * SOLVER.groundGrip;
      last[i + 2] += (x[i + 2] - last[i + 2]) * SOLVER.groundGrip;
      last[i + 1] = Math.min(last[i + 1], floor);
    }
  }
}

/** Fouled knots follow the man they are caught on: drawn toward where they caught on his body. */
function holdTangles(cloth) {
  const tangled = cloth.tangled;
  if (!tangled) return;
  const fighter = tangled.fighter;
  const byKey = fighter.capsuleCache?.byKey;
  if (!byKey) return;
  for (const [index, hold] of tangled.knots) {
    const capsule = byKey[hold.key];
    if (!capsule) continue;
    const [a, b] = capsuleEnds(fighter, capsule);
    const radius = capsule.radius * (DRAWN[hold.key] ?? DRAWN.default) + cloth.design.cord + 0.004;
    for (let axis = 0; axis < 3; axis += 1) {
      const target = a[axis] + (b[axis] - a[axis]) * hold.t + hold.normal[axis] * radius;
      cloth.x[index * 3 + axis] += (target - cloth.x[index * 3 + axis]) * SOLVER.tangleHold;
    }
  }
}

/** Foul the net on `fighter` (the knots touching him catch as they touch), or free it (null). */
export function tangleCloth(cloth, fighter) {
  cloth.tangled = fighter ? { fighter, knots: new Map() } : null;
  cloth.still = 0;
}

/**
 * Carry the whole net toward `aim`: the knots' shared motion eased to arrive
 * there in about `ease` s, their motion relative to each other untouched.
 * Keeps the drawn net with the physics' net (in flight; on a man until it has
 * caught on him).
 */
export function steerCloth(cloth, aim, dt, ease = 0.08) {
  if (dt <= 0) return;
  const mean = [0, 0, 0];
  const moving = [0, 0, 0];
  for (let index = 0; index < cloth.count; index += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      mean[axis] += cloth.x[index * 3 + axis] / cloth.count;
      moving[axis] += (cloth.x[index * 3 + axis] - cloth.last[index * 3 + axis]) / cloth.count;
    }
  }
  const share = Math.min(1, dt / ease);
  for (let axis = 0; axis < 3; axis += 1) {
    // Positions shift by part of the gap; the motion per step follows, so it neither lags nor overshoots.
    const shift = (aim[axis] - mean[axis]) * share;
    for (let index = 0; index < cloth.count; index += 1) {
      cloth.x[index * 3 + axis] += shift;
      cloth.last[index * 3 + axis] += shift;
    }
  }
  cloth.still = 0;
}

/** The mean place of the net's knots. */
export function clothCentre(cloth) {
  const mean = [0, 0, 0];
  for (let index = 0; index < cloth.count; index += 1) for (let axis = 0; axis < 3; axis += 1) mean[axis] += cloth.x[index * 3 + axis] / cloth.count;
  return mean;
}

/**
 * A man throws the net off: it is flung out from him and down, and for
 * `seconds` falls clear of his body instead of resting on his shoulders.
 */
export function shedCloth(cloth, fighter, { fling = 1.4, seconds = 0.5 } = {}) {
  tangleCloth(cloth, null);
  const cx = fighter.x[P.pelvis * 3];
  const cz = fighter.x[P.pelvis * 3 + 2];
  const h = 1 / 60;
  for (let index = 0; index < cloth.count; index += 1) {
    const dx = cloth.x[index * 3] - cx;
    const dz = cloth.x[index * 3 + 2] - cz;
    const away = Math.hypot(dx, dz) || 1;
    cloth.last[index * 3] = cloth.x[index * 3] - (dx / away) * fling * h;
    cloth.last[index * 3 + 2] = cloth.x[index * 3 + 2] - (dz / away) * fling * h;
  }
  cloth.shed = { fighter, left: seconds };
  cloth.still = 0;
}

/** Hold the net by its middle knot at `at` (null lets go). */
export function pinCloth(cloth, at) {
  cloth.pinned = at ? { knot: cloth.pinned?.knot ?? middleKnot(cloth), at } : null;
  if (at) cloth.still = 0;
}

/** The hand a retiarius holds his net in. */
export const holdingHand = (fighter) => point(fighter.x, P.lHand);
