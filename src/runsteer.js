// The player's run, steered along walls: when he runs (run mode) in a world with terrain, a few feelers
// (physics/terrain.js feelers) read the way ahead, and the heading he is given is bent along the wall that
// stands in his way at a glancing angle, round the corner of a wall's end, and with the curve of a winding
// stair's outer wall, so that a run beside geometry glides rather than hits and sticks; and round a man standing in
// his way (a comrade, a sleeper: at a sprint, 6-8 m/s, a man run into is a crash that hurts). It is the player's
// intent only (control.js steer): the physics, and every man the AI plays, are untouched. No DOM, no THREE.

import { WORLD } from './physics/config.js';
import { feelers, floorAt } from './physics/terrain.js';

export const RUN_STEER = {
  // The feelers: a fan of rays at these angles (rad) either side of the heading, each felt `reach` m (at least; and `lookAhead` s of
  // his speed, plus a stride, so that a sprint at 4.4 m/s feels 2 m ahead).
  fan: [0.35, 0.7, 1.1],
  reach: 1.4,
  lookAhead: 0.55,
  // A wall within `wallWithin` m dead ahead (at least; `lookAhead` s of his speed) bends the heading along it, more as it nears (full at
  // `touch` m, when the body is on it).
  wallWithin: 1.2,
  fullAt: 0.35,
  // Head-on: the heading within `headOn` rad of straight into the wall's normal is not bent (he just stops against it); past `glancing`
  // rad the bend is full; between, it grows smoothly. (20 degrees off straight on, and 55.)
  headOn: 0.35,
  glancing: 0.95,
  // The bend leans out from the wall by this much (a share of the way along it), so that he glides a hand's breadth off it.
  clearance: 0.5,
  // The side feelers: a wall within `sideWithin` m at an angle pushes the heading away by up to `sideGain` rad (the corner of a wall
  // that the centre ray has missed, a pillar going by).
  sideWithin: 0.75,
  sideGain: 0.5,
  // A bend that would run him off a drop the straight way does not is not made: the floor `edgeAhead` m ahead is `edgeDrop` m or
  // more below the floor under him (stairs are 0.2 m a step). (control.js dropsAhead.)
  edgeAhead: 1.6,
  edgeDrop: 0.9,
  // On a stair (or a ramp): the floor rises across `stairSpan` m by at least `stairRise` per m, and he pushes up it or down it within
  // `stairFull` rad of its line, fading to nothing at `stairFrom` rad: the heading is bent to follow the line of the stair
  // (the uphill way of the floor, or its opposite), which on a winding stair keeps turning with it.
  stairSpan: 0.5,
  stairRise: 0.09,
  stairFull: 0.7,
  stairFrom: 1.15,
  // A man on his feet (not the runner) ahead within the feelers' distance (`lookAhead` s of his speed, at least `wallWithin`) and
  // within `manClear` m of the line he runs bends the heading away from him (to the side he already stands off it), by up to
  // `manGain` rad, more the nearer the line and the nearer the man.
  // One within `manBlock` m of the line he cannot be passed at a sprint: the run is held to `passSpeed` m/s, or what would reach him in
  // `passSeconds` (state.speedCap), so that he goes by with a brush, not a crash.
  manClear: 0.8,
  manGain: 0.9,
  manBlock: 0.55,
  passSpeed: 3.5,
  passSeconds: 0.6,
  // The bend may not exceed this (rad), and follows what is wanted at `rate` per second (so it eases in and out, and does not flicker).
  maxBend: 1.35,
  rate: 14,
};

const wrapSteer = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const smoothStep = (x) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
const rotateWay = (way, angle) => [way[0] * Math.cos(angle) - way[1] * Math.sin(angle), way[0] * Math.sin(angle) + way[1] * Math.cos(angle)];

/**
 * The bend (rad, signed: positive turns from +x toward +z) the feelers ask of a heading `way`: { bend, engaged, glide, front }.
 * `engaged` (0..1) is how much a wall ahead holds him now (how glancing, how near) and `glide` the heading straight along that wall.
 */
export function wantedBend(felt, way, spec = RUN_STEER, within = spec.wallWithin) {
  const centre = felt.find((feeler) => feeler.angle === 0);
  let bend = 0;
  let strength = 0;
  let engaged = 0;
  let glide = null;
  if (centre.normal && centre.free < within) {
    const [nx, nz] = centre.normal;
    const into = -(way[0] * nx + way[1] * nz);
    const aim = Math.acos(Math.max(-1, Math.min(1, into)));
    strength = smoothStep((aim - spec.headOn) / (spec.glancing - spec.headOn));
    const near = smoothStep((within - centre.free) / (within * (1 - spec.fullAt)));
    // Along the wall the way he was going, leaning out a little: the heading he would glide at.
    let tx = way[0] + nx * into;
    let tz = way[1] + nz * into;
    const length = Math.hypot(tx, tz);
    if (length > 1e-6) {
      tx /= length;
      tz /= length;
      const lean = Math.atan2(tz + nz * spec.clearance, tx + nx * spec.clearance);
      bend = wrapSteer(lean - Math.atan2(way[1], way[0])) * strength * near;
      engaged = strength * near;
      glide = [tx, tz];
    }
  }
  // A wall at the side, close: away from it.
  for (const feeler of felt) {
    if (feeler.angle === 0 || feeler.edge || feeler.free >= spec.sideWithin || !feeler.normal) continue;
    bend -= Math.sign(feeler.angle) * (1 - feeler.free / spec.sideWithin) * spec.sideGain;
  }
  return { bend: Math.max(-spec.maxBend, Math.min(spec.maxBend, bend)), engaged, glide, front: centre.free };
}

/**
 * The bend (rad) that takes a heading `way` round the men on their feet in it, within `within` m ahead of `from` ([x, z]):
 * away from each (to the side of the line he already stands off it), more the nearer the line and the nearer he is; and how far
 * ahead the nearest man right on the line is (`blocked`, m; Infinity if none). { bend, blocked }.
 */
export function menBend(world, fighter, from, way, within, spec = RUN_STEER) {
  let bend = 0;
  let blocked = Infinity;
  for (const other of world.fighters ?? []) {
    if (other === fighter || other.dormant || other.mount || (other.state !== 'up' && other.state !== 'rising')) continue;
    const dx = other.root[0] - from[0];
    const dz = other.root[1] - from[1];
    const along = dx * way[0] + dz * way[1];
    if (along <= 0 || along > within) continue;
    const across = -dx * way[1] + dz * way[0];
    if (Math.abs(across) >= spec.manClear) continue;
    if (Math.abs(across) < spec.manBlock) blocked = Math.min(blocked, along);
    // (Positive bend turns from +x toward +z, to the left of the way; a man to the left is passed on the right.)
    const side = across >= 0 ? -1 : 1;
    bend += side * spec.manGain * (1 - Math.abs(across) / spec.manClear) * (1 - along / (within + 0.5));
  }
  return { bend, blocked };
}

/** The uphill way of the floor under him, a unit [x, z], and how steep (rise per m); null on the flat, or where a ledge's face is. */
export function stairLine(terrain, fighter, spec = RUN_STEER) {
  const world = WORLD.terrain;
  const y = (fighter.lift ?? 0) + world.stepUp + world.slopeHeadroom;
  const [x, z] = fighter.root;
  const d = spec.stairSpan;
  const gx = floorAt(terrain, x + d, z, y) - floorAt(terrain, x - d, z, y);
  const gz = floorAt(terrain, x, z + d, y) - floorAt(terrain, x, z - d, y);
  // (No floor one side, or a face of a ledge's height: not a stair.)
  if (!Number.isFinite(gx) || !Number.isFinite(gz) || Math.abs(gx) > world.slopeMost || Math.abs(gz) > world.slopeMost) return null;
  const steep = Math.hypot(gx, gz) / (2 * d);
  if (steep < spec.stairRise) return null;
  return { way: [gx / (2 * d * steep), gz / (2 * d * steep)], steep };
}

/** The bend (rad) that turns a heading `way` towards the line of the stair he is on, if he pushes along it. */
export function stairBend(line, way, spec = RUN_STEER) {
  if (!line) return 0;
  const up = way[0] * line.way[0] + way[1] * line.way[1] >= 0;
  const target = up ? line.way : [-line.way[0], -line.way[1]];
  const off = wrapSteer(Math.atan2(target[1], target[0]) - Math.atan2(way[1], way[0]));
  const share = smoothStep((spec.stairFrom - Math.abs(off)) / (spec.stairFrom - spec.stairFull));
  return off * share;
}

/**
 * Steer a run: `way` is the floor way [x, z] (unit) the player's stick asks for; the heading he is to be given is
 * returned, bent along a wall in the way. `state` ({ bend }) is kept between steps (`orders.runSteer`): `bend` the smoothed bend;
 * `speedCap` (m/s, or null) the most his run may go now, with a man in his way (control.js holds the pace to it).
 * `drops(dir)` says whether a heading would take him off an edge (control.js dropsAhead): such a bend is not made. A world with no
 * terrain, or a man in the air, is not steered.
 */
export function runSteer(world, fighter, state, way, dt, { drops = () => false, spec = RUN_STEER } = {}) {
  const terrain = world.arena?.terrain;
  if (!terrain || fighter.air || !fighter.root) {
    state.bend = 0;
    state.speedCap = null;
    return way;
  }
  // On a stair, first along its line; then the walls are felt from there.
  const along = stairBend(stairLine(terrain, fighter, spec), way, spec);
  const ahead = along ? rotateWay(way, along) : way;
  const fan = [0, ...spec.fan, ...spec.fan.map((angle) => -angle)];
  const speed = Math.hypot(fighter.rootVelocity[0], fighter.rootVelocity[1]);
  const within = Math.max(spec.wallWithin, speed * spec.lookAhead);
  const felt = feelers(terrain, fighter.root, ahead, fighter.lift ?? 0, fan, { reach: Math.max(spec.reach, within + 0.3) });
  const { bend: wallBend } = wantedBend(felt, ahead, spec, within);
  const men = menBend(world, fighter, fighter.root, ahead, within, spec);
  // A man right in his way: no faster than he can go by him with a brush.
  state.speedCap = Number.isFinite(men.blocked) ? Math.max(spec.passSpeed, men.blocked / spec.passSeconds) : null;
  const wanted = Math.max(-spec.maxBend, Math.min(spec.maxBend, along + wallBend + men.bend));
  state.bend += (wanted - state.bend) * (1 - Math.exp(-spec.rate * dt));
  const bent = rotateWay(way, state.bend);
  if (Math.abs(state.bend) < 1e-3) {
    state.bend = 0;
    return way;
  }
  // Never to an edge: a bend that would run him off a drop the straight way does not is not made.
  if (drops(bent) && !drops(way)) {
    state.bend = 0;
    return way;
  }
  return bent;
}
