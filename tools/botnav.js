// A small path finder for the Dunnottar bot (tools/dunnottar.js): the way round a wall to a point, over the terrain as the physics keeps a man
// off it (physics/terrain.js `pushOut`, with the body's radius and a margin), on a grid. The bot walks the route in straight lines, and a fight
// (or a looting) can leave it on the wrong side of a ruin's wall, with the door ten metres off: this finds the door.

import { floorAt, pushOut } from '../src/physics/terrain.js';
import { WORLD } from '../src/physics/config.js';

const SPEC = WORLD.terrain;
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * The floor under a point if a man at floor height `y` can stand there (no wall or high block within `radius`, a floor no more than a
 * stride below and no higher than a step), else `null`.
 */
export function standable(terrain, x, z, y, radius) {
  const floor = floorAt(terrain, x, z, y + SPEC.stepUp);
  if (!Number.isFinite(floor) || floor < y - SPEC.stepUp) return null;
  const low = floor + SPEC.sag;
  return pushOut(terrain, [x, z], radius, low, low + SPEC.bodyHeight, SPEC.stepUp, low) ? null : floor;
}

/**
 * A path over the terrain from `from` ({ x, z, y }) to near `to` ([x, z]): [[x, z, floor], ...] from the first step to the last (the goal point
 * itself when it can be stood on, else the nearest cell to it), or `null` if there is none within `reach` m of either. `options.toY`: the
 * floor the goal is on, where floors lie over one another (the vault over the crypt: a point of the cellar is a point of the crypt too): the
 * goal is only reached on that floor (within two metres), and a cell is a different cell on each floor (a stair's foot is not its head).
 */
export function findPath(terrain, from, to, options = {}) {
  // (With a margin first; then as close as the body itself: he may stand against a table.)
  return search(terrain, from, to, { ...options, radius: SPEC.bodyRadius + 0.15 }) ?? search(terrain, from, to, { ...options, radius: SPEC.bodyRadius + 0.02 });
}

function search(terrain, from, to, { cell = 0.5, radius, reach = 16, maxNodes = 40000, toY }) {
  // (A cell on each floor, with the floors told apart by the metre and a half when the goal says which it is on.)
  const layer = (y) => (toY === undefined ? 0 : Math.round(y / 1.5));
  const key = (ix, iz, y) => (ix * 100003 + iz) * 64 + layer(y) + 32;
  const cx = (ix) => ix * cell;
  const ix0 = Math.round(from.x / cell);
  const iz0 = Math.round(from.z / cell);
  const near = (ix, iz) => Math.hypot(cx(ix) - to[0], cx(iz) - to[1]);
  const box = { x0: Math.min(from.x, to[0]) - reach, x1: Math.max(from.x, to[0]) + reach, z0: Math.min(from.z, to[1]) - reach, z1: Math.max(from.z, to[1]) + reach };
  const nodes = new Map();
  const open = [];
  const push = (node) => {
    open.push(node);
    let i = open.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (open[parent].f <= open[i].f) break;
      [open[parent], open[i]] = [open[i], open[parent]];
      i = parent;
    }
  };
  const pop = () => {
    const top = open[0];
    const last = open.pop();
    if (open.length) {
      open[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < open.length && open[l].f < open[m].f) m = l;
        if (r < open.length && open[r].f < open[m].f) m = r;
        if (m === i) break;
        [open[m], open[i]] = [open[i], open[m]];
        i = m;
      }
    }
    return top;
  };
  const start = { ix: ix0, iz: iz0, y: from.y, g: 0, f: near(ix0, iz0), parent: null, closed: false };
  nodes.set(key(ix0, iz0, from.y), start);
  push(start);
  let best = start;
  let count = 0;
  while (open.length && count < maxNodes) {
    const node = pop();
    if (node.closed) continue;
    node.closed = true;
    count += 1;
    const d = near(node.ix, node.iz);
    const here = toY === undefined || Math.abs(node.y - toY) < 2;
    if (here && d < near(best.ix, best.iz)) best = node;
    if (here && d <= cell * 1.1) {
      best = node;
      break;
    }
    const ok = new Map();
    const free = (ix, iz) => {
      const k = ix * 100003 + iz;
      if (ok.has(k)) return ok.get(k);
      const x = cx(ix);
      const z = cx(iz);
      const floor = x < box.x0 || x > box.x1 || z < box.z0 || z > box.z1 ? null : standable(terrain, x, z, node.y, radius);
      ok.set(k, floor);
      return floor;
    };
    for (const [dx, dz] of STEPS) {
      const ix = node.ix + dx;
      const iz = node.iz + dz;
      const floor = free(ix, iz);
      if (floor === null) continue;
      if (dx && dz && (free(node.ix + dx, node.iz) === null || free(node.ix, node.iz + dz) === null)) continue;
      const k = key(ix, iz, floor);
      const g = node.g + (dx && dz ? 1.414 : 1) * cell;
      const old = nodes.get(k);
      if (old && old.g <= g) continue;
      const next = { ix, iz, y: floor, g, f: g + near(ix, iz), parent: node, closed: false };
      nodes.set(k, next);
      push(next);
    }
  }
  // (Near enough, or the nearest it came: a goal on a wall's far side with no way round is no path.)
  if (near(best.ix, best.iz) > 3) return null;
  const path = [];
  for (let node = best; node; node = node.parent) path.push([cx(node.ix), cx(node.iz), node.y]);
  path.reverse();
  path.shift();
  return path;
}
