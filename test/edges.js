// A flood fill over a terrain for the level-mode tests: every place a man can stand, reached from a start by steps of
// a half metre, and the places where a step lands on nothing (an edge he could walk off). Not a test file (no .test).

import { WORLD } from '../src/physics/config.js';
import { floorAt, pushOut } from '../src/physics/terrain.js';

const STEP = 0.5;
const key = (ix, iz, level) => `${ix},${iz},${Math.round(level * 20)}`;

/**
 * Flood from `start` ([x, y, z], y the floor): returns { standing: count, edges: [{ at: [x, z], floor, toward: [dx, dz] }] },
 * the edges being where a step off lands on no floor (or one more than reachDown below) with nothing in the way.
 */
export function floodFill(terrain, start, { limit = 400000, radius = WORLD.terrain.bodyRadius, bounds = null } = {}) {
  const spec = WORLD.terrain;
  const seen = new Map();
  const edges = new Map();
  const queue = [[Math.round(start[0] / STEP), Math.round(start[2] / STEP), start[1]]];
  seen.set(key(queue[0][0], queue[0][1], start[1]), true);
  const at = [0, 0];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let head = 0;
  while (head < queue.length && queue.length < limit) {
    const [ix, iz, floor] = queue[head];
    head += 1;
    for (const [dx, dz] of dirs) {
      const nx = (ix + dx) * STEP;
      const nz = (iz + dz) * STEP;
      if (bounds && (nx < bounds[0] || nx > bounds[1] || nz < bounds[2] || nz > bounds[3])) continue;
      const next = floorAt(terrain, nx, nz, floor + spec.stepUp);
      at[0] = nx;
      at[1] = nz;
      const lowest = Number.isFinite(next) ? next : floor;
      // Is a man at the new place pushed out of something (a wall, a face too tall to step on)?
      const moved = pushOut(terrain, at, radius, lowest, lowest + spec.bodyHeight, spec.stepUp);
      if (moved && Math.hypot(at[0] - nx, at[1] - nz) > 0.04) continue;
      if (!Number.isFinite(next) || floor - next > spec.reachDown + 1e-6) {
        const cell = `${Math.round(nx)},${Math.round(nz)},${Math.round(floor)}`;
        if (!edges.has(cell)) edges.set(cell, { at: [nx, nz], floor, toward: [dx, dz] });
        continue;
      }
      const id = key(ix + dx, iz + dz, next);
      if (seen.has(id)) continue;
      seen.set(id, true);
      queue.push([ix + dx, iz + dz, next]);
    }
  }
  return { standing: seen.size, edges: [...edges.values()], truncated: queue.length >= limit };
}
