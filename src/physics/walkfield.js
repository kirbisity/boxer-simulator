// Walk fields: how far the nearest man of a side would have to walk to reach any spot of a battlefield with works on it
// (physics/fieldworks.js: walls kept out of, gone round by their ends and through their gaps, a ladder's gap among them;
// ditches and banks climbed at the cost their slope makes, FIELDWORKS.climb), worked out once for the whole field from
// the men outward, rather than every man weighing every enemy's way round to him at every think.
//
// The field is a grid over the ground the works change a walk over, and a node just past each end of a wall that is not
// joined to another wall (where a way round goes: a palisade's end, the sides of a gap or a ladder's gap). From every
// man of the side (his hips) it is spread outward as a shortest path (Dijkstra's, from all of them at once): each cell
// holds the shortest walk any of them has to it, and who that is. A man then reads off his own cell how far the nearest
// of them must walk to get at him, and which of them it is. It is rebuilt a few times a second (WALKFIELD.every).
//
// `walkingDistance` (fieldworks.js) stays the exact walk between two given points; the field agrees with it to within a
// cell or so (the grid's paths bend at its centres) and is the better of the two where several walls stand in the way
// (it goes round all of them; walkingDistance round the worst one).

import { P } from '../body.js';
import { inFight } from '../physics.js';
import { climbedDistance, FIELDWORKS, wallsOf, worksOf } from './fieldworks.js';

export const WALKFIELD = {
  // m: a cell's side. A stride and a bit (a man's walking step is ~0.7-0.8 m): fine enough that a cell's error is under a
  // stride, coarse enough that a field over a battle's works is a few thousand cells.
  cell: 1,
  // m: the furthest walk anything reads off a field. The nearest enemy that counts to a man's fear is within AI.standing
  // `sight` (16 m); a gunner reloading asks only of a few metres (moves.js `reloadSafe`, 3-6 m). A walk past it is "beyond".
  reach: 18,
  // s: a field is this old at most. A man at a walk (~1.4 m/s) has gone 0.3 m since, a third of a cell; one running in kit
  // (~4 m/s) under a cell. (Anything that must know to the step, as a gunner with a man close on him, asks walkingDistance.)
  every: 0.2,
  // m/s: how much nearer a man may have come since the field was made, at most: a sprint with a sword (~4.2 m/s,
  // physics/config.js runMode), rounded up.
  sprint: 4.5,
  // m: a wall end's node stands this far past the end, along the wall: as near as a man's stance comes to a wall
  // (FIELDWORKS.wall.root), so the way round goes by where he can stand.
  endOff: FIELDWORKS.wall.root,
  // m: an end's node is joined to the cells (and the other ends) whose centres are within this of it: two cells' diagonal and
  // a bit, so that a gap narrower than a cell (a ladder's, ~1.2 m) is always reached from both sides.
  endLinks: 2.5,
  // m: a wall's end within this of another wall is joined to it (a bend of one line, or a wall built against another):
  // there is no way round there.
  joined: 0.05,
};

// The 16 ways out of a cell: the 8 round it, and the 8 a knight's move off, so a path may run at 0°, 27°, 45° (and so on) to
// the grid; the length of a grid path over open ground is then at most ~3% over the straight line (8 ways: ~8%).
// (A man of the side this many cells off or nearer is asked of directly, his walk straight from where he stands: the grid's
// error is at its worst over a short way, and it is the short ways that decide most: the enemy about to be on him.)
const WALK_NEAR = 2;
const WALK_STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

// The grid of each set of walls a world meets (works.walls, or the set with the stretches a battle has closed: wallsOf), made
// once: its place, its wall ends, and the cost of each step, worked out the first time a field goes that way.
const walkGrids = new WeakMap();

/** The grid for this world's works as they stand (null without walls or ditches). */
function walkGridOf(world, works) {
  const walls = wallsOf(works, world);
  if (walkGrids.has(walls)) return walkGrids.get(walls);
  const grid = makeWalkGrid(world.arena, works, walls);
  walkGrids.set(walls, grid);
  return grid;
}

function makeWalkGrid(arena, works, walls) {
  const spec = WALKFIELD;
  // The ground the works change a walk over: the walls' lines and the ditches' boxes.
  let low = [Infinity, Infinity];
  let high = [-Infinity, -Infinity];
  const take = (x, z) => {
    low = [Math.min(low[0], x), Math.min(low[1], z)];
    high = [Math.max(high[0], x), Math.max(high[1], z)];
  };
  for (const wall of walls) take(...wall.a), take(...wall.b);
  for (const ditch of works.ditches) take(ditch.box.x[0], ditch.box.z[0]), take(ditch.box.x[1], ditch.box.z[1]);
  if (low[0] > high[0]) return null;
  // Answered within `reach` of it (`inner`: further off, no walk of `reach` m or less meets the works, and the straight line
  // is the walk); every man who could walk there within `reach` stands within `reach` more, so the grid goes that far.
  const floor = (axis) => (axis === 0 ? arena.halfX : arena.halfZ) ?? Infinity;
  // (Not past the floor's edge: nobody walks round a wall's end off the field.)
  const clampTo = (value, axis) => Math.max(-floor(axis), Math.min(floor(axis), value));
  const inner = { x: [low[0] - spec.reach, high[0] + spec.reach], z: [low[1] - spec.reach, high[1] + spec.reach] };
  const x0 = clampTo(low[0] - 2 * spec.reach, 0);
  const z0 = clampTo(low[1] - 2 * spec.reach, 1);
  const nx = Math.max(1, Math.ceil((clampTo(high[0] + 2 * spec.reach, 0) - x0) / spec.cell));
  const nz = Math.max(1, Math.ceil((clampTo(high[1] + 2 * spec.reach, 1) - z0) / spec.cell));
  const cells = nx * nz;
  // The ends of the walls not joined to another: a node just past each.
  const ends = [];
  for (const wall of walls) {
    for (const [end, out] of [[wall.a, -1], [wall.b, 1]]) {
      if (walls.some((other) => other !== wall && distanceToWall(other, end) < spec.joined)) continue;
      const node = [end[0] + wall.u[0] * out * spec.endOff, end[1] + wall.u[1] * out * spec.endOff];
      if (Math.abs(node[0]) < floor(0) && Math.abs(node[1]) < floor(1)) ends.push(node);
    }
  }
  const grid = {
    works, walls, x0, z0, nx, nz, cells, inner, ends,
    // The cost of each step out of each cell (WALK_STEPS order; NaN until first asked), and whether a wall is near enough a
    // cell that a step from it must be checked against them.
    steps: new Float32Array(cells * WALK_STEPS.length).fill(NaN),
    walled: new Uint8Array(cells),
    // Each node's own links beyond the grid's steps (an end's to the cells and ends round it, a cell's to the ends near it):
    // [node, cost] pairs.
    links: new Map(),
  };
  for (const wall of walls) {
    const margin = 2 * spec.cell + spec.endLinks;
    const [i0, j0] = walkCellOf(grid, Math.min(wall.a[0], wall.b[0]) - margin, Math.min(wall.a[1], wall.b[1]) - margin, true);
    const [i1, j1] = walkCellOf(grid, Math.max(wall.a[0], wall.b[0]) + margin, Math.max(wall.a[1], wall.b[1]) + margin, true);
    for (let i = i0; i <= i1; i += 1) for (let j = j0; j <= j1; j += 1) grid.walled[i * nz + j] = 1;
  }
  const link = (from, to, cost) => {
    if (!(cost < Infinity)) return;
    if (!grid.links.has(from)) grid.links.set(from, []);
    grid.links.get(from).push(to, cost);
  };
  ends.forEach((end, k) => {
    const node = cells + k;
    const [i0, j0] = walkCellOf(grid, end[0] - spec.endLinks, end[1] - spec.endLinks, true);
    const [i1, j1] = walkCellOf(grid, end[0] + spec.endLinks, end[1] + spec.endLinks, true);
    for (let i = i0; i <= i1; i += 1) {
      for (let j = j0; j <= j1; j += 1) {
        const centre = walkCentre(grid, i * nz + j);
        if (Math.hypot(centre[0] - end[0], centre[1] - end[1]) > spec.endLinks) continue;
        link(node, i * nz + j, walkStepCost(grid, end, centre));
        link(i * nz + j, node, walkStepCost(grid, centre, end));
      }
    }
    ends.forEach((other, m) => {
      if (m !== k && Math.hypot(other[0] - end[0], other[1] - end[1]) <= 2 * spec.endLinks) link(node, cells + m, walkStepCost(grid, end, other));
    });
  });
  return grid;
}

/** The cell (i, j) of (x, z); clamped into the grid if `clamp`, else null outside it. */
function walkCellOf(grid, x, z, clamp = false) {
  let i = Math.floor((x - grid.x0) / WALKFIELD.cell);
  let j = Math.floor((z - grid.z0) / WALKFIELD.cell);
  if (clamp) return [Math.max(0, Math.min(grid.nx - 1, i)), Math.max(0, Math.min(grid.nz - 1, j))];
  return i < 0 || j < 0 || i >= grid.nx || j >= grid.nz ? null : [i, j];
}

/** A node's place: a cell's centre, or a wall end's node. */
function walkCentre(grid, node) {
  if (node >= grid.cells) return grid.ends[node - grid.cells];
  const i = Math.floor(node / grid.nz);
  const j = node - i * grid.nz;
  return [grid.x0 + (i + 0.5) * WALKFIELD.cell, grid.z0 + (j + 0.5) * WALKFIELD.cell];
}

/** How far a wall's line is from a point. */
function distanceToWall(wall, at) {
  const t = Math.max(0, Math.min(wall.length, (at[0] - wall.a[0]) * wall.u[0] + (at[1] - wall.a[1]) * wall.u[1]));
  return Math.hypot(at[0] - (wall.a[0] + wall.u[0] * t), at[1] - (wall.a[1] + wall.u[1] * t));
}

/** Whether the segments p-q and a-b cross (on the floor): fieldworks.js's own test. */
function walkCrosses(p, q, a, b) {
  const side = (u, v, w) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
  return side(p, q, a) * side(p, q, b) < 0 && side(a, b, p) * side(a, b, q) < 0;
}

/** The walk straight from `from` to `to`: through no wall (Infinity if one is in the way), over the ditches as climbed. */
function walkStepCost(grid, from, to) {
  // (No way at all: climbedDistance would read a slope over nothing.)
  if (Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]) < 1e-9) return 0;
  for (const wall of grid.walls) if (walkCrosses(from, to, wall.a, wall.b)) return Infinity;
  return grid.works.ditches.length ? climbedDistance(grid.works, from, to) : Math.hypot(to[0] - from[0], to[1] - from[1]);
}

/** The cost of step `k` out of cell `node` (Infinity off the grid or through a wall), worked out once. */
function gridStepCost(grid, node, k) {
  const at = node * WALK_STEPS.length + k;
  const known = grid.steps[at];
  if (known === known) return known;
  const i = Math.floor(node / grid.nz);
  const j = node - i * grid.nz;
  const [di, dj] = WALK_STEPS[k];
  const ii = i + di;
  const jj = j + dj;
  let cost = Infinity;
  if (ii >= 0 && jj >= 0 && ii < grid.nx && jj < grid.nz) {
    const from = walkCentre(grid, node);
    const to = walkCentre(grid, ii * grid.nz + jj);
    cost = grid.walled[node] || grid.walled[ii * grid.nz + jj] ? walkStepCost(grid, from, to) : grid.works.ditches.length ? climbedDistance(grid.works, from, to) : Math.hypot(to[0] - from[0], to[1] - from[1]);
  }
  grid.steps[at] = cost;
  return cost;
}

// The open set of a field being made (a binary heap of [walk, node], stale entries skipped as they come off), kept between
// fields rather than made anew.
let walkHeapKeys = new Float64Array(1024);
let walkHeapNodes = new Int32Array(1024);
let walkHeapSize = 0;

function walkHeapPush(key, node) {
  if (walkHeapSize === walkHeapKeys.length) {
    const keys = new Float64Array(walkHeapKeys.length * 2);
    const nodes = new Int32Array(walkHeapNodes.length * 2);
    keys.set(walkHeapKeys);
    nodes.set(walkHeapNodes);
    walkHeapKeys = keys;
    walkHeapNodes = nodes;
  }
  let at = walkHeapSize;
  walkHeapSize += 1;
  while (at > 0) {
    const up = (at - 1) >> 1;
    if (walkHeapKeys[up] <= key) break;
    walkHeapKeys[at] = walkHeapKeys[up];
    walkHeapNodes[at] = walkHeapNodes[up];
    at = up;
  }
  walkHeapKeys[at] = key;
  walkHeapNodes[at] = node;
}

/** Takes the least entry off the heap: its node (its walk left in walkHeapTop). */
let walkHeapTop = 0;
function walkHeapPop() {
  const node = walkHeapNodes[0];
  walkHeapTop = walkHeapKeys[0];
  walkHeapSize -= 1;
  const key = walkHeapKeys[walkHeapSize];
  const last = walkHeapNodes[walkHeapSize];
  let at = 0;
  for (;;) {
    let child = 2 * at + 1;
    if (child >= walkHeapSize) break;
    if (child + 1 < walkHeapSize && walkHeapKeys[child + 1] < walkHeapKeys[child]) child += 1;
    if (walkHeapKeys[child] >= key) break;
    walkHeapKeys[at] = walkHeapKeys[child];
    walkHeapNodes[at] = walkHeapNodes[child];
    at = child;
  }
  walkHeapKeys[at] = key;
  walkHeapNodes[at] = last;
  return node;
}

/** Who a side's field is spread from: every man of it still in the fight and in sight (not lying hidden in an ambush). */
const walkSource = (fighter, corner) => fighter.corner === corner && inFight(fighter) && !fighter.hidden;

/** Spread the field of `corner`'s men over the grid: each node's shortest walk from any of them, and whose it is. */
function spreadWalkField(world, grid, field, corner) {
  const spec = WALKFIELD;
  const { dist, who } = field;
  dist.fill(Infinity);
  who.fill(-1);
  walkHeapSize = 0;
  const reach = (node, walk, from) => {
    if (!(walk < dist[node])) return;
    dist[node] = walk;
    who[node] = from;
    walkHeapPush(walk, node);
  };
  // Each man to the cells round his own and the wall ends near him, straight; and kept by his cell, for a man near him to
  // ask of him directly (nearestWalk).
  field.near.clear();
  for (const fighter of world.fighters) {
    if (!walkSource(fighter, corner)) continue;
    const at = [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
    const cell = walkCellOf(grid, at[0], at[1]);
    if (!cell) continue;
    const own = cell[0] * grid.nz + cell[1];
    if (!field.near.has(own)) field.near.set(own, []);
    field.near.get(own).push(fighter.id);
    for (let i = Math.max(0, cell[0] - 1); i <= Math.min(grid.nx - 1, cell[0] + 1); i += 1) {
      for (let j = Math.max(0, cell[1] - 1); j <= Math.min(grid.nz - 1, cell[1] + 1); j += 1) {
        const node = i * grid.nz + j;
        reach(node, walkStepCost(grid, at, walkCentre(grid, node)), fighter.id);
      }
    }
    grid.ends.forEach((end, k) => {
      if (Math.hypot(end[0] - at[0], end[1] - at[1]) <= 2 * spec.endLinks) reach(grid.cells + k, walkStepCost(grid, at, end), fighter.id);
    });
  }
  while (walkHeapSize > 0) {
    const node = walkHeapPop();
    const walk = walkHeapTop;
    if (walk > dist[node]) continue;
    // (Past `reach` nothing is read: it is left there.)
    if (walk > spec.reach) break;
    const from = who[node];
    if (node < grid.cells) {
      for (let k = 0; k < WALK_STEPS.length; k += 1) {
        const cost = gridStepCost(grid, node, k);
        if (cost === Infinity) continue;
        reach(node + WALK_STEPS[k][0] * grid.nz + WALK_STEPS[k][1], walk + cost, from);
      }
    }
    const links = grid.links.get(node);
    if (links) for (let k = 0; k < links.length; k += 2) reach(links[k], walk + links[k + 1], from);
  }
  field.at = world.time;
}

/** This world's field of `corner`'s men on this grid, made again when it is WALKFIELD.every old (or the grid changed). */
function walkFieldOf(world, grid, corner) {
  world.walkFields ??= {};
  let field = world.walkFields[corner];
  if (!field || field.grid !== grid) {
    const nodes = grid.cells + grid.ends.length;
    field = world.walkFields[corner] = { grid, dist: new Float64Array(nodes), who: new Int32Array(nodes), near: new Map(), at: -Infinity };
  }
  if (!(world.time - field.at < WALKFIELD.every && world.time >= field.at)) spreadWalkField(world, grid, field, corner);
  return field;
}

/**
 * How far the nearest man of `corner` must walk to reach (x, z) over the works, and who he is: { walk, who (his id), age (s
 * since the field was made) }, walk Infinity (who -1) past WALKFIELD.reach. Null where the field says nothing: an arena with
 * no walls or ditches, or a spot further than `reach` from all of them (there the straight line is the walk).
 */
export function nearestWalk(world, corner, x, z) {
  const works = worksOf(world.arena);
  if (!works) return null;
  const grid = walkGridOf(world, works);
  if (!grid || x < grid.inner.x[0] || x > grid.inner.x[1] || z < grid.inner.z[0] || z > grid.inner.z[1]) return null;
  const cell = walkCellOf(grid, x, z);
  if (!cell) return null;
  const field = walkFieldOf(world, grid, corner);
  const at = [x, z];
  let best = Infinity;
  let who = -1;
  const offer = (walk, from) => {
    if (walk < best) [best, who] = [walk, from];
  };
  // A man of theirs within a cell or two of him: his walk straight to him, from where he stands now.
  for (let i = Math.max(0, cell[0] - WALK_NEAR); i <= Math.min(grid.nx - 1, cell[0] + WALK_NEAR); i += 1) {
    for (let j = Math.max(0, cell[1] - WALK_NEAR); j <= Math.min(grid.nz - 1, cell[1] + WALK_NEAR); j += 1) {
      const men = field.near.get(i * grid.nz + j);
      if (!men) continue;
      for (const id of men) {
        const other = world.fighters[id];
        if (walkSource(other, corner)) offer(walkStepCost(grid, [other.x[P.pelvis * 3], other.x[P.pelvis * 3 + 2]], at), id);
      }
    }
  }
  // The last stretch to him from a cell round his own, or from a wall end near him: straight, not through a wall, climbed.
  const lastLeg = (walk, from, centre, walled) => {
    // (A climb is never shorter than the straight line: one that cannot win is not climbed.)
    const straight = Math.hypot(x - centre[0], z - centre[1]);
    if (!(walk + straight < best)) return;
    if (walled && grid.walls.some((wall) => walkCrosses(centre, at, wall.a, wall.b))) return;
    offer(walk + (grid.works.ditches.length && straight > 1e-9 ? climbedDistance(grid.works, centre, at) : straight), from);
  };
  for (let i = Math.max(0, cell[0] - 1); i <= Math.min(grid.nx - 1, cell[0] + 1); i += 1) {
    for (let j = Math.max(0, cell[1] - 1); j <= Math.min(grid.nz - 1, cell[1] + 1); j += 1) {
      const node = i * grid.nz + j;
      lastLeg(field.dist[node], field.who[node], walkCentre(grid, node), grid.walled[node]);
    }
  }
  grid.ends.forEach((end, k) => {
    if (Math.hypot(end[0] - x, end[1] - z) <= WALKFIELD.endLinks) lastLeg(field.dist[grid.cells + k], field.who[grid.cells + k], end, true);
  });
  if (best > WALKFIELD.reach) return { walk: Infinity, who: -1, age: world.time - field.at };
  return { walk: best, who, age: world.time - field.at };
}
