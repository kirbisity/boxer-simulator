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
    bottom: source.bottom ?? -Infinity, top: 0, lo: 0, hi: 0, steps: 1, rise: 0, ex: 0, ez: 0, stamp: 0,
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
