// Static scenery in the physics: the floors, stairs, ramps, walls and ceilings
// of a level, and the sea below it. An arena that carries `terrain` (made here
// by createTerrain) stands on these instead of the flat floor at y = 0; an arena
// without it never comes here, and fights are as they were.
//
// Everything is in world metres, y up. A solid is plain data, so a stage file
// can be written, saved and checked as JSON. Every solid has a footprint: a
// rectangle on the floor, `size` = [length, width] about the centre `at` = [x, z],
// turned by `yaw` exactly as a fighter is (yaw 0: the length along +x; a positive
// yaw turns it toward -z). The length is the solid's "u" axis, the width its "v".
//
//   slab      { kind: 'slab', at, size, yaw, top, bottom }
//                 Flat floor at height `top`. `bottom` is where it stops being solid
//                 (default -Infinity: a block down to the void, as ground and ledges
//                 are). A slab over open space (a bridge, an upper floor) gives a
//                 `bottom`, and men walk under it.
//   ramp      { kind: 'ramp', at, size, yaw, from, to, bottom }
//                 Floor rising evenly along u, from height `from` at the -u end to `to`
//                 at the +u end (either may be the higher).
//   stairs    { kind: 'stairs', at, size, yaw, steps, from, rise, bottom }
//                 A flight of `steps` treads along u, each `rise` high: the first tread
//                 (at the -u end) has its top at `from + rise`, the last at
//                 `from + steps * rise`; `from` is the floor at the foot of the flight.
//                 The treads are discrete (a foot plants on a tread, not on a slope).
//   wall      { kind: 'wall', at, size: [length, thickness], yaw, bottom, top }
//                 A box that blocks. Never stood on (put a slab on top for a wall walk).
//   ceiling   { kind: 'ceiling', at, size, yaw, bottom, top }
//                 Only the underside at `bottom` stops a body going up (`top`, default
//                 bottom + 0.5, is for line of sight). Nobody stands on it.
//
// Any solid may carry an `id` (a string; several may share one, e.g. the pieces
// of one gate) so a stage can switch it in and out (levelmode/stage.js).
//
// How the physics sees them:
//  - floorAt: the highest walkable top at or just under a point, so a stair over
//    a vault is found from the stair and the vault floor from below it.
//  - A slab, ramp or flight is also an obstacle to anything whose lowest point is
//    more than `stepUp` below its top there: a face taller than a stride is a
//    ledge, and a man standing under it is pushed out sideways (pushOut).
//  - Walls block anything whose height range overlaps theirs.
//  - rayBlocked: a line of sight, for the AI, along the floor at an eye height.
//
// Queries use a uniform grid (WORLD.terrain.cell) so they cost a few solids,
// not all of them. Build a terrain once per change; it is read-only after.

import { WORLD } from './config.js';

const SHAPES = new Set(['slab', 'ramp', 'stairs', 'wall', 'ceiling']);

/** m: a wall no taller than this is low: no higher than a man's waist, the camera looks over it. */
const LOW_WALL = 1.3;

/** The key of a grid cell. */
const cellKey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

/** A solid compiled for the queries: every one has this one shape. */
function compile(source) {
  const shape = source.kind;
  if (!SHAPES.has(shape)) throw new Error(`terrain: unknown solid kind "${shape}"`);
  const { at, size } = source;
  if (!Array.isArray(at) || at.length !== 2 || !Array.isArray(size) || size.length !== 2 || !at.concat(size).every(Number.isFinite)) throw new Error(`terrain: ${shape} ${source.id ?? ''} needs at: [x, z] and size: [length, width]`);
  const yaw = source.yaw ?? 0;
  const part = {
    id: source.id ?? null, shape, cx: at[0], cz: at[1], hu: size[0] / 2, hv: size[1] / 2, cos: Math.cos(yaw), sin: Math.sin(yaw),
    bottom: source.bottom ?? -Infinity, top: 0, lo: 0, hi: 0, steps: 1, rise: 0, ex: 0, ez: 0, stamp: 0, low: false, rail: false,
  };
  const need = (...names) => {
    for (const name of names) if (!Number.isFinite(source[name])) throw new Error(`terrain: ${shape} ${source.id ?? ''} needs a number for "${name}"`);
  };
  if (shape === 'slab') {
    need('top');
    part.top = part.lo = part.hi = source.top;
  } else if (shape === 'ramp') {
    need('from', 'to');
    part.lo = source.from;
    part.hi = source.to;
    part.top = Math.max(part.lo, part.hi);
  } else if (shape === 'stairs') {
    need('steps', 'from', 'rise');
    part.steps = Math.max(1, Math.round(source.steps));
    part.rise = source.rise;
    part.lo = source.from;
    part.hi = source.from + part.steps * source.rise;
    part.top = Math.max(part.lo, part.hi);
  } else if (shape === 'wall') {
    need('bottom', 'top');
    part.top = source.top;
    // A fence (posts and rails: a body cannot pass it, the eye sees through it) is nothing to the camera; a low wall (a parapet's) is gone over with a hand's breadth, not the ball's whole radius (partReach).
    part.rail = source.style === 'fence';
    part.low = source.top - source.bottom <= LOW_WALL;
  } else {
    need('bottom');
    part.top = source.top ?? source.bottom + 0.5;
  }
  part.ex = Math.abs(part.cos) * part.hu + Math.abs(part.sin) * part.hv;
  part.ez = Math.abs(part.sin) * part.hu + Math.abs(part.cos) * part.hv;
  return part;
}

/** The top of a floor part at local u (clamped into the part): constant, sloped, or the tread's. */
function topAt(part, u) {
  if (part.shape === 'slab') return part.top;
  const share = part.hu > 0 ? Math.max(0, Math.min(1, (u + part.hu) / (2 * part.hu))) : 0;
  if (part.shape === 'ramp') return part.lo + (part.hi - part.lo) * share;
  // Stairs: tread index, the last tread taking the far edge.
  const tread = Math.min(part.steps - 1, Math.floor(share * part.steps));
  return part.lo + (tread + 1) * part.rise;
}

/**
 * Compile solids into a terrain: `{ solids, sea, cell, grid }`.
 * `sea`: the height below which a body is lost (default none).
 */
export function createTerrain(solids, { sea = -Infinity } = {}) {
  const cell = WORLD.terrain.cell;
  const margin = WORLD.terrain.margin;
  const grid = new Map();
  const parts = solids.map(compile);
  for (const part of parts) {
    const x0 = Math.floor((part.cx - part.ex - margin) / cell);
    const x1 = Math.floor((part.cx + part.ex + margin) / cell);
    const z0 = Math.floor((part.cz - part.ez - margin) / cell);
    const z1 = Math.floor((part.cz + part.ez + margin) / cell);
    for (let ix = x0; ix <= x1; ix += 1) {
      for (let iz = z0; iz <= z1; iz += 1) {
        const key = cellKey(ix, iz);
        const list = grid.get(key);
        if (list) list.push(part);
        else grid.set(key, [part]);
      }
    }
  }
  return { solids: parts, sea, cell, grid, stamp: 0, normal: [0, 0], ceilings: parts.some((part) => part.shape === 'ceiling') };
}

const NO_SOLIDS = [];
const cellOf = (terrain, x, z) => terrain.grid.get(cellKey(Math.floor(x / terrain.cell), Math.floor(z / terrain.cell))) ?? NO_SOLIDS;

/**
 * The height of the floor at (x, z): the highest walkable top at or below
 * `y + tolerance` (so a stair over a vault gives the stair to a man on it and
 * the vault's floor to one under it). -Infinity where there is none (the void).
 */
export function floorAt(terrain, x, z, y = Infinity, tolerance = 0.02) {
  const list = cellOf(terrain, x, z);
  const limit = y + tolerance;
  let best = -Infinity;
  for (let index = 0; index < list.length; index += 1) {
    const part = list[index];
    if (part.shape === 'wall' || part.shape === 'ceiling') continue;
    const dx = x - part.cx;
    const dz = z - part.cz;
    const u = dx * part.cos - dz * part.sin;
    if (u > part.hu || u < -part.hu) continue;
    const v = dx * part.sin + dz * part.cos;
    if (v > part.hv || v < -part.hv) continue;
    const top = topAt(part, u);
    if (top <= limit && top > best) best = top;
  }
  return best;
}

/**
 * A place to put a foot: (x, z) moved `margin` m (at most) from any edge of the floor it stands on
 * (a tread's edge, a ledge's), so that it rests on one floor and not astride two. `at` = [x, z] is
 * changed in place; `y` is as for floorAt. Where the floor is the same all round, nothing moves.
 */
export function awayFromEdges(terrain, at, y, margin = 0.05, tolerance = 0.02) {
  const here = floorAt(terrain, at[0], at[1], y, tolerance);
  if (here === -Infinity) return at;
  let dx = 0;
  let dz = 0;
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const other = floorAt(terrain, at[0] + sx * margin, at[1] + sz * margin, y, tolerance);
    // A different floor that way (a tread higher or lower, not the slope of a ramp): step off from it.
    if (Math.abs(other - here) > 0.04 || other === -Infinity) {
      dx -= sx;
      dz -= sz;
    }
  }
  at[0] += dx * margin;
  at[1] += dz * margin;
  return at;
}

/**
 * The underside of the lowest ceiling above `y` at (x, z): Infinity if none.
 * (Only 'ceiling' solids; a slab with a `bottom` is felt as a box by pushOut.)
 */
export function ceilingAt(terrain, x, z, y) {
  const list = cellOf(terrain, x, z);
  let best = Infinity;
  for (let index = 0; index < list.length; index += 1) {
    const part = list[index];
    if (part.shape !== 'ceiling' || part.bottom < y || part.bottom >= best) continue;
    const dx = x - part.cx;
    const dz = z - part.cz;
    const u = dx * part.cos - dz * part.sin;
    const v = dx * part.sin + dz * part.cos;
    if (u <= part.hu && u >= -part.hu && v <= part.hv && v >= -part.hv) best = part.bottom;
  }
  return best;
}

/**
 * Push a sphere out of what blocks it sideways. `at` = [x, z] is moved in place;
 * the sphere has `radius` and spans heights `low` to `high` (a part: y ∓ radius;
 * a standing man: his feet to his head). Returns true if it moved; the way it was
 * last pushed (a unit [nx, nz], away from the solid) is then in `terrain.normal`,
 * for taking the speed into the wall away.
 *
 * What blocks: a wall whose height range overlaps; a slab, ramp or flight whose
 * top (where the sphere is) is more than `stepUp` above `low`, and whose
 * `bottom` is below `high`. A rise within `stepUp` is not a wall: it is stepped onto
 * (floorAt lifts the part). `wallLow` (default `low`): the height a wall's top is measured from, for a man whose higher foot stands above
 * his lowest point.
 */
export function pushOut(terrain, at, radius, low, high, stepUp = WORLD.terrain.stepUp, wallLow = low) {
  let pushed = false;
  for (let pass = 0; pass < 3; pass += 1) {
    const list = cellOf(terrain, at[0], at[1]);
    let moved = false;
    for (let index = 0; index < list.length; index += 1) {
      const part = list[index];
      if (part.shape === 'ceiling' || high <= part.bottom) continue;
      if (part.shape === 'wall' && wallLow >= part.top) continue;
      const dx = at[0] - part.cx;
      const dz = at[1] - part.cz;
      const u = dx * part.cos - dz * part.sin;
      const v = dx * part.sin + dz * part.cos;
      const cu = u > part.hu ? part.hu : u < -part.hu ? -part.hu : u;
      const cv = v > part.hv ? part.hv : v < -part.hv ? -part.hv : v;
      const du = u - cu;
      const dv = v - cv;
      const distance2 = du * du + dv * dv;
      if (distance2 >= radius * radius) continue;
      if (part.shape !== 'wall' && low >= topAt(part, cu) - stepUp) continue;
      let nu;
      let nv;
      let push;
      if (distance2 > 1e-12) {
        const distance = Math.sqrt(distance2);
        nu = du / distance;
        nv = dv / distance;
        push = radius - distance;
      } else if (part.shape === 'stairs' && (u + part.hu) % ((2 * part.hu) / part.steps) < part.hv - Math.abs(v)) {
        // Inside a flight, under a tread's top: back down the riser it has come up against (not out through the side of the flight).
        nu = -1;
        nv = 0;
        push = ((u + part.hu) % ((2 * part.hu) / part.steps)) + radius;
      } else if (part.hu - Math.abs(u) < part.hv - Math.abs(v)) {
        // The centre is inside: out through the nearer face.
        nu = u < 0 ? -1 : 1;
        nv = 0;
        push = part.hu - Math.abs(u) + radius;
      } else {
        nu = 0;
        nv = v < 0 ? -1 : 1;
        push = part.hv - Math.abs(v) + radius;
      }
      const nx = nu * part.cos + nv * part.sin;
      const nz = -nu * part.sin + nv * part.cos;
      at[0] += nx * push;
      at[1] += nz * push;
      terrain.normal[0] = nx;
      terrain.normal[1] = nz;
      moved = true;
      pushed = true;
    }
    if (!moved) break;
  }
  return pushed;
}

/**
 * Feelers: how far a man whose centre is at `at` ([x, z]) and whose feet are at `lift` (m, as `fighter.lift`) could walk along each of
 * `angles` (rad, turned from `heading`, a floor way [x, z]; positive turns from +x toward +z), up to `reach` m, felt every `step` m with
 * the very test the physics keeps him out of solids with (pushOut: his body radius and height, the faces his foot may step onto).
 * For each angle: `{ angle, free, normal, edge }`: `free` the distance felt clear (`reach` if all of it was), `normal` the way the
 * thing in the way pushes ([nx, nz], away from it; null if nothing), `edge` true if the stretch ended instead at a drop of `drop` m or
 * more (a ledge, the head of a stair, the sea). Used to steer the player's run along walls (runsteer.js); costs a few dozen pushOuts.
 */
export function feelers(terrain, at, heading, lift, angles, { reach = 1.4, step = 0.15, drop = WORLD.terrain.stepUp * 2, wallLow = lift + WORLD.terrain.sag } = {}) {
  const spec = WORLD.terrain;
  const low = lift + spec.sag;
  const high = low + spec.bodyHeight;
  const here = floorAt(terrain, at[0], at[1], lift + spec.stepUp + spec.slopeHeadroom);
  const turn = Math.atan2(heading[1], heading[0]);
  const probe = [0, 0];
  return angles.map((angle) => {
    const ux = Math.cos(turn + angle);
    const uz = Math.sin(turn + angle);
    let free = reach;
    let normal = null;
    let edge = false;
    for (let d = step; d <= reach + 1e-9; d += step) {
      probe[0] = at[0] + ux * d;
      probe[1] = at[1] + uz * d;
      if (pushOut(terrain, probe, spec.bodyRadius, low, high, spec.stepUp, wallLow)) {
        free = d - step * 0.5;
        normal = [terrain.normal[0], terrain.normal[1]];
        break;
      }
      const floor = floorAt(terrain, at[0] + ux * d, at[1] + uz * d, lift + spec.stepUp + spec.slopeHeadroom);
      if (here - floor >= drop) {
        free = d - step * 0.5;
        edge = true;
        break;
      }
    }
    return { angle, free, normal, edge };
  });
}

/**
 * Whether a straight line over the floor from `a` to `b` (each [x, z]) is
 * blocked, for a line of sight at `height` m (an eye; `heightB` at b, if it
 * differs). Blocked by a wall whose height range the line crosses, and by a
 * slab, ramp or flight standing higher than the line there (a ledge in the way).
 * `seeThrough`: a Set of solid ids the line passes (the drawing's sight, levelmode/visibility.js: a gate of bars is stood behind, not seen behind).
 */
export function rayBlocked(terrain, a, b, height = 1.5, heightB = height, seeThrough = null) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const stepLength = terrain.cell * 0.5;
  const count = Math.max(1, Math.ceil(length / stepLength));
  const stamp = (terrain.stamp += 1);
  for (let sample = 0; sample <= count; sample += 1) {
    const share = sample / count;
    const list = cellOf(terrain, a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share);
    for (let index = 0; index < list.length; index += 1) {
      const part = list[index];
      if (part.stamp === stamp) continue;
      part.stamp = stamp;
      if (part.shape !== 'ceiling' && !(seeThrough && part.id !== null && seeThrough.has(part.id)) && segmentHits(part, a, b, height, heightB)) return true;
    }
  }
  return false;
}

/** A segment against one solid: the stretch of it inside the footprint, and whether the line is at the solid's height there. */
function segmentHits(part, a, b, heightA, heightB) {
  const ax = a[0] - part.cx;
  const az = a[1] - part.cz;
  const bx = b[0] - part.cx;
  const bz = b[1] - part.cz;
  const u0 = ax * part.cos - az * part.sin;
  const v0 = ax * part.sin + az * part.cos;
  const u1 = bx * part.cos - bz * part.sin;
  const v1 = bx * part.sin + bz * part.cos;
  // Clip the segment to the rectangle (slab method).
  let enter = 0;
  let leave = 1;
  for (const [from, to, half] of [[u0, u1, part.hu], [v0, v1, part.hv]]) {
    const delta = to - from;
    if (Math.abs(delta) < 1e-12) {
      if (from > half || from < -half) return false;
      continue;
    }
    let near = (-half - from) / delta;
    let far = (half - from) / delta;
    if (near > far) [near, far] = [far, near];
    enter = Math.max(enter, near);
    leave = Math.min(leave, far);
    if (enter > leave) return false;
  }
  const lineLow = Math.min(heightA + (heightB - heightA) * enter, heightA + (heightB - heightA) * leave);
  const lineHigh = Math.max(heightA + (heightB - heightA) * enter, heightA + (heightB - heightA) * leave);
  if (lineLow >= part.top && part.shape === 'wall') return false;
  if (lineHigh <= part.bottom) return false;
  if (part.shape === 'wall') return true;
  // A floor part: the line must be below its top at one end or other of the stretch inside it.
  const topIn = topAt(part, u0 + (u1 - u0) * enter);
  const topOut = topAt(part, u0 + (u1 - u0) * leave);
  return lineLow < Math.max(topIn, topOut);
}

// ---- A ball swept through the solids: the camera's spring arm (cameraarm.js) ---------------------------------------

/** How far (m) a point is from a part's box along the axis it is furthest out on (a ramp's or a flight's top: where it is under the point): 0 inside it. */
function distanceToPart(part, x, y, z) {
  const dx = x - part.cx;
  const dz = z - part.cz;
  const u = dx * part.cos - dz * part.sin;
  const v = dx * part.sin + dz * part.cos;
  const gapU = Math.max(0, Math.abs(u) - part.hu);
  const gapV = Math.max(0, Math.abs(v) - part.hv);
  const top = part.shape === 'stairs' || part.shape === 'ramp' ? topAt(part, u) : part.top;
  const gapY = y > top ? y - top : y < part.bottom ? part.bottom - y : 0;
  return Math.max(gapU, gapV, gapY);
}

/**
 * How far along `dir` (a unit [x, y, z]) from `from` a ball of `radius` m travels before it touches a part, at most `length` (`length`
 * if it never does). A part the ball already touches at the start blocks only as far as the gap there allows (its radius shrinks to the
 * gap), so a start beside a wall is not stopped by the wall, and one inside a part does not see it.
 */
function partReach(part, from, dir, length, radius) {
  const gap = distanceToPart(part, from[0], from[1], from[2]);
  if (gap <= 1e-6) return length;
  // (The box grown by r must not hold the start: r is at most the gap on the axis the start is furthest out on.)
  const r = Math.min(radius, gap - 1e-4);
  const dx = from[0] - part.cx;
  const dz = from[2] - part.cz;
  const u0 = dx * part.cos - dz * part.sin;
  const v0 = dx * part.sin + dz * part.cos;
  const du = dir[0] * part.cos - dir[2] * part.sin;
  const dv = dir[0] * part.sin + dir[2] * part.cos;
  const low = part.bottom - r;
  // (Over a low wall the ball's centre needs only a hand's breadth: it looks over a rail, not through it.)
  const high = part.top + (part.low ? Math.min(r, 0.12) : r);
  // The ray against the box grown by r: the slab method on u, v and height.
  let enter = 0;
  let leave = length;
  for (const [start, along, lo, hi] of [[u0, du, -part.hu - r, part.hu + r], [v0, dv, -part.hv - r, part.hv + r], [from[1], dir[1], low, high]]) {
    if (Math.abs(along) < 1e-9) {
      if (start < lo || start > hi) return length;
      continue;
    }
    let near = (lo - start) / along;
    let far = (hi - start) / along;
    if (near > far) [near, far] = [far, near];
    enter = Math.max(enter, near);
    leave = Math.min(leave, far);
    if (enter > leave) return length;
  }
  if (part.shape !== 'stairs' && part.shape !== 'ramp') return enter;
  // A ramp or a flight: its top is not the box's top; walk the stretch inside the box in short steps.
  for (let s = enter; s <= leave + 1e-9; s += 0.1) {
    const u = u0 + du * s;
    const clamped = u > part.hu ? part.hu : u < -part.hu ? -part.hu : u;
    const y = from[1] + dir[1] * s;
    if (y - r < topAt(part, clamped) && y + r > part.bottom) return Math.max(0, s - 0.1);
  }
  return length;
}

/**
 * How far a ball of `radius` m, set going from `from` ([x, y, z]) along `dir` (a unit [x, y, z]), travels through the open before it
 * touches a wall, a ceiling or a floor of the terrain: `length` if the way is clear. A cheap broad phase (the grid's cells along the
 * line, a few solids each), so that it can be asked many times a frame: the camera's spring arm (cameraarm.js) is its user.
 */
export function sweepReach(terrain, from, dir, length, radius = 0.3) {
  // A fifth of a cell between samples: with the grid's margin round each solid, that finds every solid within `radius` (up to 0.55 m) of the line.
  const step = terrain.cell * 0.2;
  const count = Math.max(1, Math.ceil(length / step));
  const stamp = (terrain.stamp += 1);
  let reach = length;
  for (let sample = 0; sample <= count; sample += 1) {
    const along = (sample / count) * length;
    // (Past the nearest hit nothing can be nearer.)
    if (along - radius > reach) break;
    const list = cellOf(terrain, from[0] + dir[0] * along, from[2] + dir[2] * along);
    for (let index = 0; index < list.length; index += 1) {
      const part = list[index];
      if (part.stamp === stamp) continue;
      part.stamp = stamp;
      if (part.rail) continue;
      const hit = partReach(part, from, dir, reach, radius);
      if (hit < reach) reach = hit;
    }
  }
  return reach;
}

/**
 * The solid (a wall, a ceiling, a floor block, a flight) a point is inside, or within `grow` m of the inside of; null in the open. A
 * fence is none (it is the camera's to pass). For asking where a camera stands, in tests and tools.
 */
export function solidAt(terrain, x, y, z, grow = 0) {
  const list = cellOf(terrain, x, z);
  for (let index = 0; index < list.length; index += 1) {
    const part = list[index];
    if (part.rail) continue;
    const dx = x - part.cx;
    const dz = z - part.cz;
    const u = dx * part.cos - dz * part.sin;
    const v = dx * part.sin + dz * part.cos;
    if (Math.abs(u) > part.hu + grow || Math.abs(v) > part.hv + grow) continue;
    const top = part.shape === 'stairs' || part.shape === 'ramp' ? topAt(part, u) : part.top;
    if (y < top + grow && y > part.bottom - grow) return part;
  }
  return null;
}

/**
 * `point` ([x, y, z]) moved sideways out of any wall or step it is inside or within `radius` of (a copy): where the camera's arm starts
 * from, so that a man against a wall, whose look point over his shoulder is in it, still has a way out.
 */
export function clearOfSolids(terrain, point, radius = 0.3) {
  const at = [point[0], point[2]];
  pushOut(terrain, at, radius, point[1] - 0.3, point[1] + 0.3, 0.2);
  return [at[0], point[1], at[1]];
}

/**
 * The terrain as the camera's arm (cameraarm.js) sees the world: the ball swept through its solids, the look point moved out of the ones it
 * stands in, and whether a ball at a point is clear of them all.
 */
export const terrainWorld = (terrain) => ({
  reach: (from, dir, length, radius) => sweepReach(terrain, from, dir, length, radius),
  pivot: (point, radius) => clearOfSolids(terrain, point, radius),
  free: (point, radius) => !solidAt(terrain, point[0], point[1], point[2], radius),
});

// ---- Builders: the same data a stage file writes by hand ---------------------------

/** A flat floor or block. */
export const slabOf = (at, size, top, { yaw = 0, bottom, id } = {}) => ({ kind: 'slab', at, size, yaw, top, bottom, id });

/** A ramp rising along its length from `from` to `to`. */
export const rampOf = (at, size, from, to, { yaw = 0, bottom, id } = {}) => ({ kind: 'ramp', at, size, yaw, from, to, bottom, id });

/** A straight flight of `steps` treads of `rise` each, up from the floor at `from`. */
export const stairsOf = (at, size, steps, from, rise, { yaw = 0, bottom, id } = {}) => ({ kind: 'stairs', at, size, yaw, steps, from, rise, bottom, id });

/** A wall box of `length` by `thickness`. */
export const wallOf = (at, size, bottom, top, { yaw = 0, id } = {}) => ({ kind: 'wall', at, size, yaw, bottom, top, id });

/** A ceiling slab: its underside at `bottom`. */
export const ceilingOf = (at, size, bottom, { yaw = 0, top, id } = {}) => ({ kind: 'ceiling', at, size, yaw, bottom, top, id });

/** A straight wall from point `a` to point `b` ([x, z] each), `thickness` thick, its ends squared off. */
export function wallLine(a, b, thickness, bottom, top, { id } = {}) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const yaw = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
  return wallOf([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], [length + thickness, thickness], bottom, top, { yaw, id });
}

/**
 * A winding stair: `steps` treads round the point `at`, between the radii
 * `inner` and `outer`, from polar angle `start` through `turn` radians (a
 * positive turn runs from +x toward +z), each tread `rise` higher, the first with
 * its top at `from + rise`. Position = at + radius * (cos angle, sin angle).
 * Returns the treads, as slabs. (Give the stair a newel with a wall of your own.)
 */
export function windingStairs({ at, inner, outer, start = 0, turn = Math.PI * 2, steps, from = 0, rise, bottom, id }) {
  const treads = [];
  const sweep = turn / steps;
  const length = outer - inner;
  const width = Math.abs(sweep) * outer * 1.02;
  for (let step = 0; step < steps; step += 1) {
    const angle = start + sweep * (step + 0.5);
    const radius = (inner + outer) / 2;
    treads.push(slabOf([at[0] + Math.cos(angle) * radius, at[1] + Math.sin(angle) * radius], [length, width], from + (step + 1) * rise, { yaw: -angle, bottom, id }));
  }
  return treads;
}

/** Where a winding stair's tread `step` (0-based) has its middle, [x, z], for a walker to aim at. */
export function windingTread({ at, inner, outer, start = 0, turn = Math.PI * 2, steps }, step, radius = (inner + outer) / 2) {
  const angle = start + (turn / steps) * (step + 0.5);
  return [at[0] + Math.cos(angle) * radius, at[1] + Math.sin(angle) * radius];
}
