// The castle kit: the stage's own data (its solids, its wall runs and vaults and props) drawn as a castle, so that what
// is drawn is what is stood on. `createCastleView(stage)` gives the same view object as the grey-box terrainview did
// ({ stage, group, sections, mechanisms }) with an `update(world, camera)` that terrainview.updateStageView calls each frame.
//
// What is drawn, and when:
//  - the land: the mainland hillside with the fenced switchback cut into it, and the headland: a ragged black rock
//    (a heightfield that stands under every floor and flight and falls from their edges in cliffs to the sea), with surf
//    at its foot; always.
//  - for each section, its detail (walls with their arches, windows and oillets, stair flights, vaults, props, gates,
//    items): while the section is active, or next to an active one with the way between them in the camera's view (a
//    portal leads to it); otherwise its silhouette, the same solids as plain blocks, which is all that is seen of it from
//    far off or from behind a wall. A section outside the camera's frustum is not drawn or animated at all.
//  - what moves: gates and ladders with their state, flames, ravens, drips, light shafts, the markers on things to take.
// Every mesh is a merged batch per material per chunk of ground, with frustum culling on.

import { P } from '../body.js';
import { ceilingAt, pushOut } from '../physics/terrain.js';
import { KitBatch, kgAddGrid, kgBox, kgCylinder, kgExtrude, kgFlight, kgFloor, kgLump, kgOpening, kgPlace, kgShape, kgTube, kgVault } from './kitgeo.js';
import { kpBuild } from './kitprops.js';
import { stormFollow, stormTorch } from './storm.js';
import { ktShadowBake, ktShadowRelease } from './kitshadow.js';
import { skyDirection } from './stagesky.js';
import { ktDispose, ktMaterials, ktRandom, ktWeather } from './kittex.js';

const KIT_SLAB_TOP = { grass: 'grass', path: 'path', rock: 'rock', flags: 'flags', cobble: 'cobble', boards: 'boards', stone: 'ashlar' };
const KIT_WALL = { ashlar: 'ashlar', rubble: 'rubble', ruin: 'ruin', rock: 'rock', tower: 'ashlar', parapet: 'ashlar' };

// ---- the wall runs -------------------------------------------------------------------------------

/** The top edge of a run `length` long, as points from the far end back to the start, at height y1. */
function kitTopEdge(length, y1, style, crenel, random, floor) {
  const points = [];
  if (crenel) {
    // Merlons 1.0 long, 0.7 apart, 0.95 high.
    const period = 1.7;
    const count = Math.max(1, Math.round(length / period));
    const step = length / count;
    for (let k = count - 1; k >= 0; k -= 1) {
      const s = k * step;
      points.push([s + step, y1 - 0.95], [s + step * 0.58, y1 - 0.95], [s + step * 0.58, y1], [s, y1], [s, y1 - 0.95]);
    }
    points.push([0, y1 - 0.95]);
    return points;
  }
  if (style === 'ruin') {
    const count = Math.max(2, Math.round(length / 0.9));
    const heights = [];
    for (let k = 0; k <= count; k += 1) {
      const noise = random();
      const bite = noise < 0.3 ? 0.2 + random() * 1.8 : random() * 0.5;
      heights.push(Math.max(floor, y1 - bite));
    }
    for (let k = count; k >= 0; k -= 1) points.push([(length * k) / count, heights[k]]);
    return points;
  }
  return [[length, y1], [0, y1]];
}

/** A wall run (stage decor) with its openings: front and back faces with holes, the reveals, the top edge. Rubble and ruin walls are rougher. */
function kitRun(batch, run, hull, sea) {
  const [ax, az] = run.a;
  const dx = run.b[0] - ax;
  const dz = run.b[1] - az;
  const length = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz, dx);
  const material = KIT_WALL[run.style] ?? 'ashlar';
  const random = ktRandom(Math.floor(Math.abs(ax * 37 + az * 91 + length * 13)) + 5);
  const holes = [];
  let highest = run.y0 + 1.5;
  for (const o of run.openings ?? []) {
    const sill = Math.max(run.y0 + 0.05, o.sill ?? run.y0);
    holes.push(kgOpening(o.at, o.width, sill, o.top, o.shape));
    highest = Math.max(highest, o.top + 0.35);
  }
  const outer = [[0, run.y0], [length, run.y0], ...kitTopEdge(length, run.y1, run.style, run.crenel, random, highest)];
  const shape = kgShape(outer, holes);
  const matrix = kgPlace(ax, 0, az, yaw);
  kgExtrude(batch, material, material, shape, run.thick, matrix, { aoFrom: run.y0 + 1.0, aoSpan: 3.2 });
  // The oillets: a dark collar through the wall to each loop.
  for (const o of run.openings ?? []) {
    if (o.shape !== 'oillet') continue;
    const s = o.at;
    const cx = ax + (dx / length) * s;
    const cz = az + (dz / length) * s;
    const middle = ((o.sill ?? run.y0) + o.top) / 2;
    kgCylinder(batch, 'black', cx, middle - o.width * 0.5, cz, o.width * 0.55, o.width * 0.55, run.thick * 0.98, { sides: 10, tiltX: 0, tiltZ: 0, tint: 0.6 });
  }
  // A plinth of rock down to the sea for a run that stands over a drop.
  if (hull) {
    const cx = ax + dx / 2;
    const cz = az + dz / 2;
    kgBox(batch, 'rock', cx, (sea + run.y0 + 0.4) / 2, cz, length - 0.2, run.y0 + 0.4 - sea, run.thick - 0.25, yaw, { faces: ['sides', 'ends'], tint: 0.8, aoFrom: sea, aoSpan: 6 });
  }
}

// ---- cliffs ----------------------------------------------------------------------------------------

/**
 * Sheer rock down from the exposed edges of a rectangle (x0..x1, z0..z1) whose top is `top`: panels of a jittered grid,
 * bulging a little outward below the lip. `edges`: which sides ('n' z0, 's' z1, 'w' x0, 'e' x1) and which stretches
 * of each are exposed (as [from, to] along it).
 */
function kitCurtain(batch, material, rect, top, sea, spans, seed, stopTop = null) {
  const [x0, x1, z0, z1] = rect;
  const random = ktRandom(seed);
  const side = {
    n: { origin: (s) => [s, z0], along: [1, 0], out: [0, -1], range: [x0, x1] },
    s: { origin: (s) => [s, z1], along: [1, 0], out: [0, 1], range: [x0, x1] },
    w: { origin: (s) => [x0, s], along: [0, 1], out: [-1, 0], range: [z0, z1] },
    e: { origin: (s) => [x1, s], along: [0, 1], out: [1, 0], range: [z0, z1] },
  };
  for (const [name, list] of Object.entries(spans)) {
    const edge = side[name];
    for (const [from, to] of list) {
      const columns = Math.max(1, Math.ceil((to - from) / 1.6));
      const rows = Math.max(2, Math.ceil((top - sea) / 2.6));
      const grid = [];
      const bulge = [];
      for (let r = 0; r <= rows; r += 1) {
        const row = [];
        for (let c = 0; c <= columns; c += 1) {
          const s = from + ((to - from) * c) / columns;
          const y = top - ((top - sea + 1) * r) / rows;
          const push = r === 0 ? 0 : 0.15 + random() * 0.9;
          const [bx, bz] = edge.origin(s);
          // Ragged ledges: every other row sticks out a little more.
          const out = push * (r % 2 ? 1.2 : 0.7);
          row.push({ p: [bx + edge.out[0] * out, y - (r === 0 ? 0 : random() * 0.5), bz + edge.out[1] * out], n: [edge.out[0] * 0.85, 0.35, edge.out[1] * 0.85], uv: [s, y] });
        }
        grid.push(row);
        bulge.push(row);
      }
      kgAddGrid(batch, material, grid, { tint: 0.95, aoFrom: sea, aoSpan: 16, aoMin: 0.5 });
    }
  }
  void stopTop;
}

/** Whether a point (x, z) is covered by anything of the rects in `blocks` that reaches up to `top` (so a cliff edge there is not exposed). */
function kitCovered(blocks, x, z, top, skip) {
  for (const b of blocks) {
    if (b === skip) continue;
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    if (b.wall ? b.y0 <= top + 0.1 && b.y1 >= top - 1.0 : b.top >= top - 0.6) return true;
  }
  return false;
}

/** The axis-aligned footprints of a stage's solids, with their heights. */
function kitBlocks(stage) {
  const blocks = [];
  for (const section of stage.sections) {
    const mechanical = [...(section.gates ?? []), ...(section.ladders ?? [])];
    const solids = [...(section.terrain ?? []), ...mechanical.flatMap((m) => m.states[m.state] ?? [])];
    for (const s of solids) {
      if (s.kind === 'ceiling') continue;
      const yaw = s.yaw ?? 0;
      const hu = s.size[0] / 2;
      const hv = s.size[1] / 2;
      const ex = Math.abs(Math.cos(yaw)) * hu + Math.abs(Math.sin(yaw)) * hv;
      const ez = Math.abs(Math.sin(yaw)) * hu + Math.abs(Math.cos(yaw)) * hv;
      const wall = s.kind === 'wall';
      blocks.push({
        solid: s, section: section.id, wall, x0: s.at[0] - ex, x1: s.at[0] + ex, z0: s.at[1] - ez, z1: s.at[1] + ez,
        top: s.kind === 'slab' ? s.top : s.kind === 'ramp' ? Math.max(s.from, s.to) : s.kind === 'stairs' ? s.from + s.steps * s.rise : s.top,
        y0: s.bottom ?? -Infinity, y1: s.top ?? 0,
      });
    }
  }
  return blocks;
}

/** The exposed stretches of each side of a block, as { n: [[from, to]...], ... } along the side. */
function kitExposed(blocks, block, top) {
  const spans = { n: [], s: [], w: [], e: [] };
  const step = 1.0;
  const probe = 0.45;
  const run = (name, from, to, at) => {
    let start = null;
    for (let s = from; s <= to + 1e-6; s += step) {
      const [x, z] = at(s);
      const exposed = !kitCovered(blocks, x, z, top, block);
      if (exposed && start === null) start = s;
      if ((!exposed || s + step > to + 1e-6) && start !== null) {
        const end = exposed ? to : s;
        if (end - start > 0.4) spans[name].push([start, end]);
        start = null;
      }
    }
  };
  run('n', block.x0, block.x1, (s) => [s, block.z0 - probe]);
  run('s', block.x0, block.x1, (s) => [s, block.z1 + probe]);
  run('w', block.z0, block.z1, (s) => [block.x0 - probe, s]);
  run('e', block.z0, block.z1, (s) => [block.x1 + probe, s]);
  return spans;
}

// ---- the mainland ----------------------------------------------------------------------------------

/** Distance from (x, z) to a block's footprint (0 inside). */
const kitDistance = (b, x, z) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));

/** Whether a point is inside a polygon. */
function kitInside(polygon, x, z) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** The distance from a point to the polygon's edge. */
function kitEdgeDistance(polygon, x, z) {
  let best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [ax, az] = polygon[j];
    const [bx, bz] = polygon[i];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

const kitSmooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A heightfield (`heights[row][column]`, rows along z from z0, columns along x from x0, `cell` m apart) as triangles: grass where it is gentle and high, rock where it is steep or low. */
function kitGridMesh(batch, x0, z0, cell, heights, sea, steep = 0.62) {
  const rows = heights.length - 1;
  const columns = heights[0].length - 1;
  const tris = { grass: { p: [], n: [], u: [], c: [] }, rock: { p: [], n: [], u: [], c: [] } };
  // Each vertex remembers its place in the grid, for the smooth normal of the ground (the slope of the heightfield there).
  const vertex = (r, k) => [x0 + k * cell, heights[r][k], z0 + r * cell, r, k];
  const at = (r, k) => heights[Math.max(0, Math.min(rows, r))][Math.max(0, Math.min(columns, k))];
  const smooth = (v) => {
    const sx = (at(v[3], v[4] - 1) - at(v[3], v[4] + 1)) / (2 * cell);
    const sz = (at(v[3] - 1, v[4]) - at(v[3] + 1, v[4])) / (2 * cell);
    const length = Math.hypot(sx, 1, sz);
    return [sx / length, 1 / length, sz / length];
  };
  const emit = (p, q, s) => {
    const ux = q[0] - p[0];
    const uy = q[1] - p[1];
    const uz = q[2] - p[2];
    const vx = s[0] - p[0];
    const vy = s[1] - p[1];
    const vz = s[2] - p[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    let order = [p, q, s];
    if (ny < 0) {
      order = [p, s, q];
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    // The line between grass and rock wanders (a noise on the slope that decides), so the cliff top is not a staircase of cells.
    const wander = 0.09 * kitNoise((p[0] + q[0] + s[0]) * 0.11, (p[2] + q[2] + s[2]) * 0.11);
    const bucket = ny < steep + wander || order.every((v) => v[1] < sea + 1.5) ? tris.rock : tris.grass;
    for (const v of order) {
      bucket.p.push(v[0], v[1], v[2]);
      // Grass lies in smooth slopes (no facets of a grid); rock keeps half its facets, so a cliff is still broken.
      const sm = smooth(v);
      const keep = bucket === tris.rock ? 0.5 : 0.1;
      const sx = sm[0] + (nx - sm[0]) * keep;
      const sy = sm[1] + (ny - sm[1]) * keep;
      const sz = sm[2] + (nz - sm[2]) * keep;
      const sl = Math.hypot(sx, sy, sz) || 1;
      bucket.n.push(sx / sl, sy / sl, sz / sl);
      // Steep faces take their texture sideways (a plan view of a cliff is a smear).
      if (bucket === tris.rock && ny < 0.62) bucket.u.push(v[0] * Math.abs(nz) + v[2] * Math.abs(nx), v[1]);
      else bucket.u.push(v[0], v[2]);
      const low = Math.max(0, Math.min(1, (v[1] - sea) / 8));
      let tone = 0.62 + 0.38 * low;
      // Ground that is not one colour: swells of light and dark over tens of metres, patches of bare earth and of rank green, a darker skirt where it steepens.
      const swell = kitNoise(v[0] * 0.045 + 11, v[2] * 0.045) * 0.5 + kitNoise(v[0] * 0.13, v[2] * 0.13 + 5) * 0.3;
      const patch = kitNoise(v[0] * 0.3 + 3, v[2] * 0.3 + 9);
      tone *= 1 + swell * 0.28 - (1 - ny) * 0.3;
      if (bucket === tris.grass) bucket.c.push(tone * (1 + patch * 0.16 + 0.04), tone * (1 - Math.max(0, patch) * 0.12), tone * (0.95 - patch * 0.2));
      else bucket.c.push(tone, tone, tone * 0.97);
    }
  };
  for (let r = 0; r < rows; r += 1) {
    for (let k = 0; k < columns; k += 1) {
      const p00 = vertex(r, k);
      const p10 = vertex(r, k + 1);
      const p01 = vertex(r + 1, k);
      const p11 = vertex(r + 1, k + 1);
      if (p00[1] <= sea - 5 && p10[1] <= sea - 5 && p01[1] <= sea - 5 && p11[1] <= sea - 5) continue;
      emit(p00, p01, p11);
      emit(p00, p11, p10);
    }
  }
  for (const [name, bucket] of Object.entries(tris)) batch.raw(name, bucket.p, bucket.n, bucket.u, bucket.c);
}

/** A cheap smooth noise of (x, z), about -1 to 1. */
function kitNoise(x, z) {
  const hash = (i, j) => {
    const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;
  };
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz) * (1 - sx) + hash(ix + 1, iz) * sx;
  const b = hash(ix, iz + 1) * (1 - sx) + hash(ix + 1, iz + 1) * sx;
  return a * (1 - sz) + b * sz;
}

/**
 * The rock of the headland: a heightfield that stands a little under every floor and roof of the castle and falls away from
 * their edges in cliffs, ragged and steep, down to the sea; grass on its flat top where it shows. Returns the waterline cells for the surf.
 */
function kitIsland(batch, stage, blocks, sea) {
  const sources = [];
  // Open floors (the shelf, the ledge, the court) hold the rock under them: it never rises above one.
  const caps = blocks.filter((b) => b.solid.kind === 'slab' && (b.solid.land || b.solid.walk)).map((b) => ({ x0: b.x0 - 0.2, x1: b.x1 + 0.2, z0: b.z0 - 0.2, z1: b.z1 + 0.2, top: b.top - 0.35 }));
  // Doorways at the foot of the rock, where the cliff must not stand in front of them: [x0, x1, z0, z1, top].
  for (const [x0, x1, z0, z1, top] of stage.landform.clear ?? []) caps.push({ x0, x1, z0, z1, top });
  // The rock stands a little under every floor, and under every flight along its slope: never in a room, never in a doorway.
  for (const b of blocks) {
    if (b.wall || !(b.solid.at[0] >= -7 || b.solid.at[1] < -34)) continue;
    if (['ladder', 'hidden'].includes(b.solid.style)) continue;
    sources.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, top: b.top - 0.35, solid: b.solid });
  }
  /** The height of a source at the nearest point of its footprint: level for a floor, along the slope for a flight. */
  const topAt = (src, x, z) => {
    const s = src.solid;
    if (s.kind !== 'stairs' && s.kind !== 'ramp') return src.top;
    const px = Math.max(src.x0, Math.min(src.x1, x));
    const pz = Math.max(src.z0, Math.min(src.z1, z));
    const yaw = s.yaw ?? 0;
    const u = Math.max(0, Math.min(1, (((px - s.at[0]) * Math.cos(yaw) - (pz - s.at[1]) * Math.sin(yaw)) / s.size[0]) + 0.5));
    const from = s.from;
    const to = s.kind === 'ramp' ? s.to : s.from + s.steps * s.rise;
    return from + (to - from) * u - 0.35;
  };
  const cell = 2;
  const x0 = -22;
  const z0 = -72;
  const columns = 54;
  const rows = 72;
  const fall = 3.1;
  const heights = [];
  const waterline = [];
  for (let r = 0; r <= rows; r += 1) {
    const row = [];
    for (let k = 0; k <= columns; k += 1) {
      // The vertices are knocked about so the cliffs do not run on the grid.
      const x = x0 + k * cell + kitNoise(k * 0.9 + 3, r * 0.9) * 0.55;
      const z = z0 + r * cell + kitNoise(k * 0.9, r * 0.9 + 7) * 0.55;
      let best = -Infinity;
      let reach = 0;
      for (const src of sources) {
        const d = Math.hypot(Math.max(src.x0 - x, 0, x - src.x1), Math.max(src.z0 - z, 0, z - src.z1));
        const h = topAt(src, x, z) - fall * d;
        if (h > best) {
          best = h;
          reach = d;
        }
      }
      // Ledges and gullies in the face, more the further out; the foot of it breaks into stacks.
      const rough = (kitNoise(x * 0.35, z * 0.35) * 1.6 + kitNoise(x * 0.9 + 9, z * 0.9) * 0.6) * Math.min(reach, 5) * 0.55;
      let h = best + rough;
      for (const cap of caps) if (x > cap.x0 && x < cap.x1 && z > cap.z0 && z < cap.z1) h = Math.min(h, cap.top);
      row.push(Math.max(h, sea - 6));
    }
    heights.push(row);
  }
  kitGridMesh(batch, x0, z0, cell, heights, sea);
  for (let r = 0; r < rows; r += 1) {
    for (let k = 0; k < columns; k += 1) {
      const lo = Math.min(heights[r][k], heights[r][k + 1], heights[r + 1][k], heights[r + 1][k + 1]);
      const hi = Math.max(heights[r][k], heights[r][k + 1], heights[r + 1][k], heights[r + 1][k + 1]);
      if (lo < sea + 0.3 && hi > sea - 0.5) waterline.push([x0 + (k + 0.5) * cell, z0 + (r + 0.5) * cell]);
    }
  }
  return waterline;
}

/**
 * The mainland as a heightfield: the plane of the hillside, steep where it ends, with the paths cut in (a path's
 * height at its footprint, blending out to the hill over a few metres). Grass where it is gentle, rock where it is not.
 */
function kitMainland(batch, stage, blocks, terrain, sea) {
  const form = stage.landform;
  const { mainland, cell, extent } = form;
  const [x0, x1, z0, z1] = extent;
  const [a, bx, c, d] = mainland.plane;
  const sources = blocks.filter((b) => !b.wall && b.solid.style && ['path', 'cobble'].includes(b.solid.style) || (b.solid.style === 'rock' && b.solid.land && b.top < 2));
  const random = ktRandom(77);
  const columns = Math.ceil((x1 - x0) / cell);
  const rows = Math.ceil((z1 - z0) / cell);
  const height = (x, z) => {
    let h = Math.min(mainland.cap, a + bx * x + c * (z - d));
    if (!kitInside(mainland.polygon, x, z)) h -= 3.2 * kitEdgeDistance(mainland.polygon, x, z);
    let near = null;
    let nearD = Infinity;
    for (const b of sources) {
      const dist = kitDistance(b, x, z);
      if (dist < nearD) {
        nearD = dist;
        near = b;
      }
    }
    if (near && nearD < 7) {
      const px = Math.max(near.x0, Math.min(near.x1, x));
      const pz = Math.max(near.z0, Math.min(near.z1, z));
      let py = -Infinity;
      for (const s of near.solid.kind === 'slab' ? [near.solid] : []) py = s.top;
      if (py === -Infinity) {
        const u = near.solid.kind === 'stairs' || near.solid.kind === 'ramp' ? (() => {
          const yaw = near.solid.yaw ?? 0;
          const lx = (px - near.solid.at[0]) * Math.cos(yaw) - (pz - near.solid.at[1]) * Math.sin(yaw);
          return (lx + near.solid.size[0] / 2) / near.solid.size[0];
        })() : 0;
        const s = near.solid;
        py = s.kind === 'ramp' ? s.from + (s.to - s.from) * u : s.from + s.steps * s.rise * u;
      }
      const w = kitSmooth(1.4, 7, nearD);
      h = py - 0.05 + (h - (py - 0.05)) * w;
    }
    return Math.max(h, sea - 6);
  };
  const heights = [];
  for (let r = 0; r <= rows; r += 1) {
    const row = [];
    for (let k = 0; k <= columns; k += 1) {
      const x = x0 + k * cell;
      const z = z0 + r * cell;
      row.push(height(x, z) + (random() - 0.5) * 0.18);
    }
    heights.push(row);
  }
  // (The cut banks beside the paths are grass: only a real cliff is rock.)
  kitGridMesh(batch, x0, z0, cell, heights, sea, 0.42);
  void terrain;
}

// ---- one section, drawn ---------------------------------------------------------------------------

/** The rectangles of a slab that are not under an earlier slab at the same height (so no two floors share a pixel). */
function kitUncovered(rect, taken) {
  let pieces = [rect];
  for (const t of taken) {
    const next = [];
    for (const [x0, x1, z0, z1] of pieces) {
      if (t[1] <= x0 || t[0] >= x1 || t[3] <= z0 || t[2] >= z1) {
        next.push([x0, x1, z0, z1]);
        continue;
      }
      if (t[0] > x0) next.push([x0, t[0], z0, z1]);
      if (t[1] < x1) next.push([t[1], x1, z0, z1]);
      const mx0 = Math.max(x0, t[0]);
      const mx1 = Math.min(x1, t[1]);
      if (t[2] > z0) next.push([mx0, mx1, z0, t[2]]);
      if (t[3] < z1) next.push([mx0, mx1, t[3], z1]);
    }
    pieces = next;
  }
  return pieces.filter(([x0, x1, z0, z1]) => x1 - x0 > 0.02 && z1 - z0 > 0.02);
}

/** A parapet: a low wall with merlons along its length. */
function kitParapet(batch, solid) {
  const [cx, cz] = solid.at;
  const yaw = solid.yaw ?? 0;
  const length = solid.size[0];
  const thick = solid.size[1];
  const lo = solid.bottom;
  const hi = solid.top;
  kgBox(batch, 'ashlar', cx, (lo + hi - 0.5) / 2, cz, length, hi - lo - 0.5, thick, yaw, { aoFrom: lo, aoSpan: 2 });
  const count = Math.max(1, Math.round(length / 1.5));
  const step = length / count;
  for (let k = 0; k < count; k += 1) {
    const s = -length / 2 + step * (k + 0.5);
    kgBox(batch, 'ashlar', cx + Math.cos(yaw) * s, hi - 0.25, cz - Math.sin(yaw) * s, step * 0.62, 0.5, thick, yaw, { tint: 1.05 });
  }
}

/**
 * The solids of a section as blocks and floors. Detail: only those that are drawn as themselves (`skin` not false). Silhouette: all
 * (a wall run is its pieces), and plainer.
 */
function kitSolids(batch, section, { silhouette = false } = {}) {
  const tops = new Map();
  for (const solid of section.terrain) {
    if (!silhouette && solid.skin === false) continue;
    if (['iron', 'ladder', 'fence', 'hidden'].includes(solid.style)) continue;
    const [cx, cz] = solid.at;
    const yaw = solid.yaw ?? 0;
    const length = solid.size[0];
    const width = solid.size[1];
    if (solid.kind === 'slab') {
      if (Math.abs(Math.sin(yaw)) > 1e-6 && Math.abs(Math.cos(yaw)) > 1e-6) {
        kgBox(batch, 'ashlar', cx, solid.top - 0.17, cz, length, 0.34, width, yaw, { aoFrom: solid.top - 1, aoSpan: 1 });
        continue;
      }
      const rotated = Math.abs(Math.sin(yaw)) > 0.5;
      const hx = (rotated ? width : length) / 2;
      const hz = (rotated ? length : width) / 2;
      const key = Math.round(solid.top * 100);
      const taken = tops.get(key) ?? [];
      const material = KIT_SLAB_TOP[solid.style] ?? 'flags';
      for (const [x0, x1, z0, z1] of kitUncovered([cx - hx, cx + hx, cz - hz, cz + hz], taken)) kgFloor(batch, material, x0, x1, z0, z1, solid.top);
      taken.push([cx - hx, cx + hx, cz - hz, cz + hz]);
      tops.set(key, taken);
    } else if (solid.kind === 'wall') {
      if (solid.style === 'parapet') {
        kitParapet(batch, solid);
      } else if (solid.style === 'newel') {
        kgCylinder(batch, 'ashlar', cx, solid.bottom, cz, 0.62, 0.66, solid.top - solid.bottom, { sides: 12, aoFrom: solid.bottom, aoSpan: 3 });
      } else {
        const material = KIT_WALL[solid.style] ?? 'ashlar';
        kgBox(batch, material, cx, (solid.bottom + solid.top) / 2, cz, length, solid.top - solid.bottom, width, yaw, { aoFrom: solid.bottom + 0.5, aoSpan: 3 });
      }
    } else if (solid.kind === 'ramp' || solid.kind === 'stairs') {
      const steps = solid.style === 'path' ? ['path', 'rock'] : solid.style === 'cobble' ? ['cobble', 'rubble'] : ['ashlar', 'ashlar'];
      kgFlight(batch, steps[0], steps[1], solid, { base: Number.isFinite(solid.bottom) ? solid.bottom : null, options: { aoFrom: null } });
    } else if (solid.kind === 'ceiling') {
      // The roof of a room or passage: its top, in rough stone.
      kgBox(batch, 'rubble', cx, (solid.bottom + solid.top) / 2 + 0.1, cz, length, solid.top - solid.bottom, width, yaw, { faces: ['top', 'ends', 'sides'], tint: 0.9 });
    }
  }
}

/** Rails and posts along a fence's points; an old fence, some posts leaning, some rails gone. */
function kitFence(batch, fence, seed) {
  const random = ktRandom(seed);
  for (let i = 0; i + 1 < fence.points.length; i += 1) {
    const [x0, z0, y0] = fence.points[i];
    const [x1, z1, y1] = fence.points[i + 1];
    const length = Math.hypot(x1 - x0, z1 - z0);
    const bays = Math.max(1, Math.round(length / 1.6));
    for (let k = 0; k <= bays; k += 1) {
      const t = k / bays;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      const y = y0 + (y1 - y0) * t;
      const lean = [(random() - 0.5) * 0.08, (random() - 0.5) * 0.08];
      kgCylinder(batch, 'wood', x, y - 0.2, z, 0.06, 0.08, fence.height + 0.25, { sides: 5, tiltX: lean[0], tiltZ: lean[1], aoFrom: y - 0.2, aoSpan: 1 });
      if (k === bays) continue;
      const t2 = (k + 1) / bays;
      const xn = x0 + (x1 - x0) * t2;
      const zn = z0 + (z1 - z0) * t2;
      const yn = y0 + (y1 - y0) * t2;
      for (const rail of [0.5, 1.0]) {
        if (random() < 0.06) continue;
        kgTube(batch, 'wood', [[x, y + rail, z], [xn, yn + rail - (random() < 0.1 ? 0.18 : 0), zn]], 0.045, { segments: 1, sides: 4, tint: 0.95 });
      }
    }
  }
}

/** Bars (a grating or a cell front): uprights every 0.2 m and three cross-bars. */
function kitBars(batch, a, b, y0, y1) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz, dx);
  const count = Math.round(length / 0.2);
  for (let k = 0; k <= count; k += 1) {
    const t = k / count;
    kgBox(batch, 'iron', a[0] + dx * t, (y0 + y1) / 2, a[1] + dz * t, 0.05, y1 - y0, 0.05, yaw);
  }
  for (const h of [0.15, 0.55, 0.92]) kgBox(batch, 'iron', a[0] + dx / 2, y0 + (y1 - y0) * h, a[1] + dz / 2, length, 0.06, 0.06, yaw);
}

/** The upper block of the tower house: windows in rows, a corbelled top. */
function kitMass(batch, mass) {
  const [x0, x1, z0, z1] = mass.box;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const h = mass.y1 - mass.y0;
  kgBox(batch, 'ashlar', cx, mass.y0 + h / 2, cz, x1 - x0, h, z1 - z0, 0, { aoFrom: mass.y0, aoSpan: 5, tint: 0.95 });
  kgBox(batch, 'ashlar', cx, mass.y1 + 0.3, cz, x1 - x0 + 0.9, 0.6, z1 - z0 + 0.9, 0, { tint: 1.05 });
  kgBox(batch, 'ashlar', cx, mass.y1 + 1.1, cz, x1 - x0 + 0.5, 1.0, z1 - z0 + 0.5, 0, { tint: 1.0 });
  const rows = mass.windows ?? 2;
  for (let r = 0; r < rows; r += 1) {
    const y = mass.y0 + ((r + 0.5) * h) / rows;
    for (const t of [0.2, 0.5, 0.8]) {
      for (const [face, px, pz, w, d] of [['N', x0 + (x1 - x0) * t, z0 - 0.02, 0.5, 0.05], ['S', x0 + (x1 - x0) * t, z1 + 0.02, 0.5, 0.05], ['E', x1 + 0.02, z0 + (z1 - z0) * t, 0.05, 0.5], ['W', x0 - 0.02, z0 + (z1 - z0) * t, 0.05, 0.5]]) {
        void face;
        kgBox(batch, 'black', px, y, pz, w, 1.1, d, 0, { tint: 0.8 });
      }
    }
  }
}

/** The winding stair's rope and its posts. */
function kitSpiral(batch, spiral) {
  const sweep = spiral.turn / spiral.steps;
  const radius = spiral.outer - 0.3;
  const points = [];
  for (let k = 0; k < spiral.steps; k += 1) {
    const angle = spiral.start + sweep * (k + 0.5);
    const x = spiral.at[0] + Math.cos(angle) * radius;
    const z = spiral.at[1] + Math.sin(angle) * radius;
    const y = spiral.from + (k + 1) * spiral.rise + 1.0;
    points.push([x, y, z]);
    if (k % 5 === 0) kgCylinder(batch, 'iron', x, y - 1.0, z, 0.025, 0.03, 1.0, { sides: 4 });
  }
  kgTube(batch, 'cloth', points, 0.035, { segments: points.length * 2, sides: 5, tint: [1.1, 1, 0.8] });
  // The newel's own rope on the inside: a second, lower rail.
  const inner = [];
  for (let k = 0; k < spiral.steps; k += 2) {
    const angle = spiral.start + sweep * (k + 0.5);
    inner.push([spiral.at[0] + Math.cos(angle) * 0.85, spiral.from + (k + 1) * spiral.rise + 0.9, spiral.at[1] + Math.sin(angle) * 0.85]);
  }
  kgTube(batch, 'iron', inner, 0.02, { segments: inner.length * 2, sides: 4 });
}

/** The detail of a section: its solids as masonry, its decor, its props. Returns { group, dyn }. */
function kitSection(section, mats, seed) {
  const batch = new KitBatch(mats, seed);
  const dyn = { flames: [], lights: [], ravens: [], drips: [], puddles: [], shafts: [] };
  kitSolids(batch, section);
  const cellar = section.id === 'vault' || section.id === 'cell';
  let fences = 0;
  for (const decor of section.decor ?? []) {
    switch (decor.kind) {
      case 'run': kitRun(batch, decor, false, 0); break;
      case 'vault': {
        const timber = decor.style === 'timber';
        kgVault(batch, timber ? 'boards' : cellar ? 'rubble' : 'ashlar', decor.a, decor.b, decor.width, decor.crown, { ribs: decor.ribs ?? (cellar ? 4.1 : 0), ribMaterial: timber ? 'wood' : 'ashlar', tint: cellar ? 0.8 : 0.9 });
        break;
      }
      case 'fence': kitFence(batch, decor, seed * 31 + (fences += 1)); break;
      case 'paving':
        for (const [x0, x1, z0, z1] of decor.rects) kgFloor(batch, 'cobble', x0, x1, z0, z1, decor.y + 0.03);
        break;
      case 'bars': kitBars(batch, decor.a, decor.b, decor.y0, decor.y1); break;
      case 'mass': kitMass(batch, decor); break;
      case 'spiral': kitSpiral(batch, decor); break;
      case 'prop': kpBuild(decor, { batch, dyn }); break;
      default: break;
    }
  }
  const group = new THREE.Group();
  group.name = `detail:${section.id}`;
  batch.build(group, { name: section.id });
  return { group, dyn, triangles: batch.triangles };
}

/** The silhouette of a section: its solids as plain blocks. */
function kitSilhouette(section, mats, seed) {
  const batch = new KitBatch(mats, seed);
  kitSolids(batch, section, { silhouette: true });
  const group = new THREE.Group();
  group.name = `silhouette:${section.id}`;
  batch.build(group, { name: `${section.id}-far` });
  return { group, triangles: batch.triangles };
}

// ---- the land, always -----------------------------------------------------------------------------------

/** Whether a slab's edges are cliffs to draw: the headland's slabs, not the mainland's paths (which lie on the hillside). */
function kitIsCliff(block, form) {
  const s = block.solid;
  if (s.kind !== 'slab') return false;
  // The headland's own cliffs are the island's (kitIsland); the wall walk's face is masonry; the gorge shelf is a ledge on the mainland.
  if (s.walk) return true;
  return Boolean(s.land) && s.style === 'rock' && s.at[0] < -7 && s.at[1] > -34;
}

/** A soft white noise strip for the surf. */
function kitFoamTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const random = ktRandom(5);
  g.clearRect(0, 0, size, size);
  for (let k = 0; k < 260; k += 1) {
    const x = random() * size;
    const y = random() * size;
    const r = 3 + random() * 11;
    const gradient = g.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `rgba(235,240,245,${0.35 + random() * 0.4})`);
    gradient.addColorStop(1, 'rgba(235,240,245,0)');
    g.fillStyle = gradient;
    for (const ox of [0, size, -size]) for (const oy of [0, size, -size]) g.fillRect(x - r + ox, y - r + oy, r * 2, r * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** The land: the mainland hillside, the cliffs of the headland slabs, the rock under the gatehouse and its tunnel, and the surf at their feet. */
function kitLand(stage, mats, blocks, foam) {
  const sea = stage.sea;
  const batch = new KitBatch(mats, 99);
  const form = stage.landform;
  kitMainland(batch, stage, blocks, null, sea);
  const strips = [];
  let seed = 100;
  for (const block of blocks) {
    if (!kitIsCliff(block, form)) continue;
    const s = block.solid;
    const spans = kitExposed(blocks, block, s.top);
    const rect = [block.x0, block.x1, block.z0, block.z1];
    if (s.walk) {
      // The wall's own face down to the level of the court, then the rock under it.
      const stop = Math.min(s.top - 1, 11.2);
      for (const [name, list] of Object.entries(spans)) {
        for (const [from, to] of list) {
          const a = name === 'n' ? [from, rect[2]] : name === 's' ? [from, rect[3]] : name === 'w' ? [rect[0], from] : [rect[1], from];
          const b = name === 'n' ? [to, rect[2]] : name === 's' ? [to, rect[3]] : name === 'w' ? [rect[0], to] : [rect[1], to];
          const out = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[name];
          const dx = b[0] - a[0];
          const dz = b[1] - a[1];
          const length = Math.hypot(dx, dz);
          kgBox(batch, 'ashlar', (a[0] + b[0]) / 2 + out[0] * 0.05, (s.top + stop) / 2, (a[1] + b[1]) / 2 + out[1] * 0.05, length, s.top - stop, 0.1, Math.atan2(-dz, dx), { faces: ['sides'], aoFrom: stop, aoSpan: 6 });
        }
      }
      void stop;
    } else {
      kitCurtain(batch, 'rock', rect, s.top, sea, spans, (seed += 1));
    }
    if (!s.walk) for (const [name, list] of Object.entries(spans)) for (const [from, to] of list) strips.push({ name, from, to, rect });
  }
  const waterline = kitIsland(batch, stage, blocks, sea);
  const group = new THREE.Group();
  group.name = 'land';
  batch.build(group, { name: 'land' });
  // Surf: a ragged white skirt round the foot of every cliff, drifting.
  const surf = [];
  const uv = [];
  const addStrip = (ax, az, bx, bz, ox, oz, reach) => {
    const y = sea + 0.06;
    const length = Math.hypot(bx - ax, bz - az);
    surf.push(ax, y, az, bx, y, bz, bx + ox * reach, y, bz + oz * reach, ax, y, az, bx + ox * reach, y, bz + oz * reach, ax + ox * reach, y, az + oz * reach);
    uv.push(0, 0, length / 3, 0, length / 3, 1, 0, 0, length / 3, 1, 0, 1);
  };
  const OUT = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
  for (const { name, from, to, rect } of strips) {
    const o = OUT[name];
    const a = name === 'n' ? [from, rect[2]] : name === 's' ? [from, rect[3]] : name === 'w' ? [rect[0], from] : [rect[1], from];
    const b = name === 'n' ? [to, rect[2]] : name === 's' ? [to, rect[3]] : name === 'w' ? [rect[0], to] : [rect[1], to];
    addStrip(a[0] + o[0] * 0.6, a[1] + o[1] * 0.6, b[0] + o[0] * 0.6, b[1] + o[1] * 0.6, o[0], o[1], 4.5);
  }
  for (const [wx, wz] of waterline) {
    const y = sea + 0.07;
    const r = 1.7;
    surf.push(wx - r, y, wz + r, wx + r, y, wz + r, wx + r, y, wz - r, wx - r, y, wz + r, wx + r, y, wz - r, wx - r, y, wz - r);
    uv.push(wx / 3, wz / 3 + 1, wx / 3 + 1, wz / 3 + 1, wx / 3 + 1, wz / 3, wx / 3, wz / 3 + 1, wx / 3 + 1, wz / 3, wx / 3, wz / 3);
  }
  if (surf.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(surf, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(surf.map((v, k) => (k % 3 === 1 ? 1 : 0)), 3));
    const mesh = new THREE.Mesh(geometry, foam);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}

// ---- what moves ---------------------------------------------------------------------------------------

/** A teardrop of flame, additive: the map of a flame card. */
function kitFlameTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(32, 92, 2, 32, 88, 54);
  gradient.addColorStop(0, 'rgba(255,248,210,1)');
  gradient.addColorStop(0.25, 'rgba(255,190,80,0.9)');
  gradient.addColorStop(0.6, 'rgba(230,90,20,0.45)');
  gradient.addColorStop(1, 'rgba(120,30,0,0)');
  g.fillStyle = gradient;
  g.beginPath();
  g.moveTo(32, 4);
  g.bezierCurveTo(60, 50, 62, 90, 32, 124);
  g.bezierCurveTo(2, 90, 4, 50, 32, 4);
  g.fill();
  return new THREE.CanvasTexture(canvas);
}

/** A soft round glow: a sprite's map. */
function kitGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/** A tall soft beam: the map of a light shaft's card (bright at the top, gone at the foot). */
function kitShaftTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const gradient = g.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, 'rgba(200,215,235,0.55)');
  gradient.addColorStop(1, 'rgba(200,215,235,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 32, 128);
  const across = g.createLinearGradient(0, 0, 32, 0);
  across.addColorStop(0, 'rgba(0,0,0,1)');
  across.addColorStop(0.5, 'rgba(0,0,0,0)');
  across.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = across;
  g.fillRect(0, 0, 32, 128);
  return new THREE.CanvasTexture(canvas);
}

/** A raven, perched: a body, a tail, a head and beak. Returns { group, head }. */
function kitRaven(mats, size) {
  const group = new THREE.Group();
  const body = new KitBatch(mats, 3);
  kgLump(body, 'raven', 0, 0.2, 0, 0.17, 0.14, 0.26, { seed: 3, detail: 1, jitter: 0 });
  kgBox(body, 'raven', 0, 0.2, -0.3, 0.1, 0.03, 0.32, 0.0, { jitter: 0 });
  kgBox(body, 'raven', 0.17, 0.24, 0, 0.03, 0.12, 0.34, 0.0, { jitter: 0 });
  kgBox(body, 'raven', -0.17, 0.24, 0, 0.03, 0.12, 0.34, 0.0, { jitter: 0 });
  kgBox(body, 'iron', 0.04, 0.05, 0.02, 0.02, 0.1, 0.02, 0, { jitter: 0 });
  kgBox(body, 'iron', -0.04, 0.05, 0.02, 0.02, 0.1, 0.02, 0, { jitter: 0 });
  body.build(group, { name: 'raven' });
  const head = new THREE.Group();
  head.position.set(0, 0.34, 0.2);
  const headBatch = new KitBatch(mats, 4);
  kgLump(headBatch, 'raven', 0, 0, 0.04, 0.075, 0.075, 0.09, { seed: 4, detail: 1, jitter: 0 });
  kgBox(headBatch, 'black', 0, -0.01, 0.15, 0.04, 0.045, 0.14, 0, { jitter: 0 });
  headBatch.build(head, { name: 'raven-head' });
  group.add(head);
  group.scale.setScalar(size);
  return { group, head };
}

/** The dynamic parts of a section: flame cards, ravens, drips, puddles, light shafts. Returns an object the kit updates each frame. */
function kitDynamics(dyn, mats, textures) {
  const group = new THREE.Group();
  const parts = { flames: null, ravens: [], drips: null, dripState: [], puddles: [], shafts: [] };
  if (dyn.flames.length) {
    const card = new THREE.PlaneGeometry(0.55, 1, 1, 1);
    card.translate(0, 0.5, 0);
    const second = card.clone().rotateY(Math.PI / 2);
    const merge = (a, b) => {
      const g = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        const array = new Float32Array(a.attributes[name].array.length + b.attributes[name].array.length);
        array.set(a.attributes[name].array, 0);
        array.set(b.attributes[name].array, a.attributes[name].array.length);
        g.setAttribute(name, new THREE.BufferAttribute(array, a.attributes[name].itemSize));
      }
      const indices = [...a.index.array, ...[...b.index.array].map((i) => i + a.attributes.position.count)];
      g.setIndex(indices);
      return g;
    };
    const geometry = merge(card, second);
    const material = mats.flame.clone();
    material.map = textures.flame;
    material.side = THREE.DoubleSide;
    parts.flames = new THREE.InstancedMesh(geometry, material, dyn.flames.length);
    parts.flames.frustumCulled = false;
    parts.flames.renderOrder = 3;
    group.add(parts.flames);
  }
  for (const r of dyn.ravens) {
    const raven = kitRaven(mats, r.size);
    raven.group.position.set(r.at[0], r.at[1], r.at[2]);
    raven.group.rotation.y = r.yaw;
    raven.seed = r.seed;
    raven.base = r.yaw;
    group.add(raven.group);
    parts.ravens.push(raven);
  }
  if (dyn.drips.length) {
    parts.drips = new THREE.InstancedMesh(new THREE.SphereGeometry(0.025, 5, 4), new THREE.MeshBasicMaterial({ color: 0xaac0d8, transparent: true, opacity: 0.7, depthWrite: false }), dyn.drips.length);
    parts.drips.frustumCulled = false;
    group.add(parts.drips);
    parts.dripState = dyn.drips.map((d, k) => ({ ...d, phase: k * 0.37 }));
  }
  for (const p of dyn.puddles) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(p.radius, 18), mats.water);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(p.at[0], p.at[1], p.at[2]);
    mesh.scale.set(1, 0.7 + (p.seed % 5) * 0.08, 1);
    mesh.rotation.z = p.seed;
    mesh.renderOrder = 1;
    group.add(mesh);
    parts.puddles.push(mesh);
  }
  for (const s of dyn.shafts) {
    const material = new THREE.MeshBasicMaterial({ map: textures.shaft, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.6, fog: false });
    const height = 4.4;
    for (const turn of [0, Math.PI / 2]) {
      const card = new THREE.Mesh(new THREE.PlaneGeometry(s.size[0] * 1.1, height), material);
      card.position.set(s.at[0], s.at[1] - height / 2 - 0.05, s.at[2]);
      card.rotation.y = s.yaw + turn;
      card.renderOrder = 4;
      group.add(card);
      parts.shafts.push(card);
    }
    const patch = new THREE.Mesh(new THREE.CircleGeometry(s.size[0] * 0.75, 14), new THREE.MeshBasicMaterial({ map: textures.glow, color: 0xaebbd0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.4, fog: false }));
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(s.at[0], s.at[1] - height - 0.05, s.at[2]);
    group.add(patch);
  }
  return { group, parts };
}

const KIT_TMP = new THREE.Object3D();

/** Move a section's dynamic parts to time `t` (s): flames flicker, ravens turn their heads, drips fall. */
function kitAnimate(parts, dyn, t) {
  if (parts.flames) {
    for (let k = 0; k < dyn.flames.length; k += 1) {
      const f = dyn.flames[k];
      const flicker = 0.85 + 0.2 * Math.sin(t * 11 + k * 3.1) + 0.1 * Math.sin(t * 23 + k);
      KIT_TMP.position.set(f.at[0], f.at[1], f.at[2]);
      KIT_TMP.rotation.set(0, t * 0.7 + k, 0);
      KIT_TMP.scale.set(f.size * (0.9 + 0.12 * Math.sin(t * 17 + k)), f.size * 1.6 * flicker, f.size * (0.9 + 0.12 * Math.cos(t * 13 + k)));
      KIT_TMP.updateMatrix();
      parts.flames.setMatrixAt(k, KIT_TMP.matrix);
    }
    parts.flames.instanceMatrix.needsUpdate = true;
  }
  for (const raven of parts.ravens) {
    const slow = t * 0.45 + raven.seed;
    // Still, still, then a quick look to one side, a preen, still.
    const phase = slow % 6;
    let turn = 0;
    if (phase > 1.5 && phase < 2.6) turn = Math.sin((phase - 1.5) * 2.9) * 0.9;
    if (phase > 3.8 && phase < 4.6) turn = -Math.sin((phase - 3.8) * 3.9) * 0.7;
    raven.head.rotation.y = turn;
    raven.head.rotation.x = phase > 4.8 && phase < 5.4 ? 0.5 * Math.sin((phase - 4.8) * 5.2) : 0;
    raven.group.position.y += 0;
    raven.group.rotation.z = Math.sin(t * 0.8 + raven.seed) * 0.015;
  }
  if (parts.drips) {
    parts.dripState.forEach((d, k) => {
      const cycle = (t * 0.55 + d.phase) % 1;
      const fall = cycle * cycle * d.fall;
      KIT_TMP.position.set(d.at[0], d.at[1] - fall, d.at[2]);
      KIT_TMP.scale.set(1, cycle > 0.02 && cycle < 0.97 ? 1.6 : 0.001, 1);
      KIT_TMP.rotation.set(0, 0, 0);
      KIT_TMP.updateMatrix();
      parts.drips.setMatrixAt(k, KIT_TMP.matrix);
    });
    parts.drips.instanceMatrix.needsUpdate = true;
  }
}

// ---- gates and the ladder -------------------------------------------------------------------------------

/** The object of a gate or ladder: its leaf or bars or rungs, built to move. `open()` gives it an openness 0..1. */
function kitMechanism(section, mech, mats) {
  const look = mech.look ?? {};
  const group = new THREE.Group();
  group.name = `mechanism:${mech.id}`;
  const batch = new KitBatch(mats, 41);
  const closed = mech.states.closed?.[0] ?? mech.states.up?.[0];
  let apply = () => {};
  if (look.kind === 'door' || look.kind === 'bars') {
    const solid = closed;
    const alongU = solid.size[0] >= solid.size[1];
    const width = alongU ? solid.size[0] : solid.size[1];
    const yaw = (solid.yaw ?? 0) + (alongU ? 0 : -Math.PI / 2);
    const height = solid.top - solid.bottom;
    if (look.kind === 'door') {
      // Planks on a frame of iron straps, hinged at one end.
      kgBox(batch, 'wood', width / 2, height / 2, 0, width - 0.14, height - 0.1, 0.16, 0, { aoFrom: -1, jitter: 0.1 });
      for (const h of [0.2, 0.5, 0.8]) kgBox(batch, 'iron', width / 2, height * h, 0.1, width - 0.2, 0.12, 0.04, 0, { jitter: 0 });
      kgBox(batch, 'iron', width - 0.35, height * 0.5, 0.11, 0.1, 0.1, 0.04, 0, { jitter: 0 });
      group.position.set(solid.at[0] - Math.cos(yaw) * width / 2, solid.bottom, solid.at[1] + Math.sin(yaw) * width / 2);
      const base = yaw;
      apply = (open) => { group.rotation.y = base + open * 1.75; };
    } else {
      const count = Math.round(width / 0.22);
      for (let k = 0; k <= count; k += 1) kgBox(batch, 'iron', -width / 2 + (width * k) / count, height / 2, 0, 0.05, height, 0.05, 0, { jitter: 0 });
      for (const h of [0.1, 0.5, 0.88]) kgBox(batch, 'iron', 0, height * h, 0, width, 0.07, 0.07, 0, { jitter: 0 });
      group.position.set(solid.at[0], solid.bottom, solid.at[1]);
      group.rotation.y = yaw;
      apply = (open) => { group.position.y = solid.bottom + open * (height * 0.93); };
    }
  } else if (look.kind === 'ladder') {
    // Two rails and a rung every 0.3 m, hung from the top of the climb; hauled up it stands against the parapet.
    const top = look.top;
    const foot = look.foot;
    const dz = foot[2] - top[2];
    const dy = foot[1] - top[1];
    const length = Math.hypot(dz, dy);
    const down = Math.atan2(dy, dz);
    const half = look.width / 2;
    for (const side of [-1, 1]) kgBox(batch, 'wood', side * half, 0, length / 2, 0.08, 0.1, length, 0, { faces: ['top', 'sides', 'ends'], jitter: 0.1 });
    for (let s = 0.4; s < length; s += 0.34) kgBox(batch, 'wood', 0, 0.02, s, look.width, 0.06, 0.06, 0, { jitter: 0.1 });
    group.position.set(top[0], top[1], top[2]);
    // (The ladder is built along +z from its top; tilted down about the x axis by the climb's slope, up by a quarter turn and more when hauled.)
    apply = (open) => {
      // open = 1: hanging down; open = 0: standing up against the parapet.
      group.rotation.x = -down * open - 1.3 * (1 - open);
    };
  }
  batch.build(group, { name: mech.id });
  return { id: mech.id, section: section.id, group, apply, open: -1, look };
}

// ---- markers on things to take --------------------------------------------------------------------------

const KIT_MARK_COLOR = { bandage: 0xe8e4d4, tonic: 0x66d6b0, note: 0xe8d9a8, key: 0xe0b850 };

/** A small thing standing for an item: a roll, a flask, a sheet, a key; and a glint over it. */
function kitMarker(item, textures) {
  const group = new THREE.Group();
  const color = KIT_MARK_COLOR[item.kind] ?? 0xffffff;
  const material = new THREE.MeshBasicMaterial({ color, fog: true });
  let mesh;
  if (item.kind === 'bandage') mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 10), material);
  else if (item.kind === 'tonic') mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.2, 8), material);
  else if (item.kind === 'key') mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.05), material);
  else mesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.2), material);
  mesh.position.y = 0.12;
  group.add(mesh);
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8, fog: false }));
  glint.scale.setScalar(0.7);
  glint.position.y = 0.3;
  glint.renderOrder = 5;
  group.add(glint);
  group.position.set(item.at[0], item.at[1] + (item.lift ?? 0), item.at[2]);
  return { item, group, mesh, glint };
}

// ---- the view ---------------------------------------------------------------------------------------

/** A set of the sections near the active ones: those a portal of an active section leads to, and those with a portal to an active one. */
function kitNeighbours(stage, active) {
  const near = new Set(active);
  for (const section of stage.sections) {
    for (const portal of section.portals ?? []) {
      if (active.has(section.id)) near.add(portal.to);
      if (active.has(portal.to)) near.add(section.id);
    }
  }
  return near;
}

/** Margin (m) round a section's region in the visibility tests: its walls, towers and the rock under it reach past the ground it covers. */
const KIT_SEEN_MARGIN = 8;

/** The boxes (THREE.Box3, a margin round each, floor to sky) of a region: one entry, or a list of them. */
function kitRegionBoxes(region, sea) {
  const entries = Array.isArray(region) && !Array.isArray(region[0]) ? region : [region];
  return entries.filter(Boolean).map(({ at, size }) => new THREE.Box3(
    new THREE.Vector3(at[0] - size[0] / 2 - KIT_SEEN_MARGIN, (Number.isFinite(sea) ? sea : -30) - 4, at[1] - size[1] / 2 - KIT_SEEN_MARGIN),
    new THREE.Vector3(at[0] + size[0] / 2 + KIT_SEEN_MARGIN, 80, at[1] + size[1] / 2 + KIT_SEEN_MARGIN),
  ));
}

/**
 * The castle of a stage with a `landform`: its land, its sections' detail and silhouettes, its gates, its things to take.
 * Returns the stage view (terrainview.js's shape, with `update(world)` and the rest): { stage, group, sections, mechanisms, update, setEnvironment, dispose, stats }.
 */
export function createCastleView(stage) {
  const mats = ktMaterials();
  const foam = new THREE.MeshBasicMaterial({ map: kitFoamTexture(), transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
  foam.map.repeat.set(1, 1);
  const textures = { flame: kitFlameTexture(), glow: kitGlowTexture(), shaft: kitShaftTexture() };
  const group = new THREE.Group();
  group.name = `stage:${stage.id}`;
  const blocks = kitBlocks(stage);
  const land = kitLand(stage, mats, blocks, foam);
  group.add(land);
  const sections = {};
  const parts = {};
  const mechanisms = [];
  const markers = [];
  const lights = [];
  const stats = { land: 0, sections: {} };
  let seed = 7;
  for (const section of stage.sections) {
    seed += 13;
    const detail = kitSection(section, mats, seed);
    const far = kitSilhouette(section, mats, seed + 1);
    const dynamic = kitDynamics(detail.dyn, mats, textures);
    detail.group.add(dynamic.group);
    const holder = new THREE.Group();
    holder.name = `section:${section.id}`;
    holder.add(detail.group, far.group);
    // Things in it that open, and things to take.
    const moving = [];
    for (const mech of [...(section.gates ?? []), ...(section.ladders ?? [])]) {
      const made = kitMechanism(section, mech, mats);
      detail.group.add(made.group);
      moving.push(made);
      mechanisms.push(made);
    }
    const marks = [];
    for (const item of section.items ?? []) {
      const marker = kitMarker(item, textures);
      detail.group.add(marker.group);
      marks.push(marker);
      markers.push(marker);
    }
    for (const l of detail.dyn.lights) lights.push({ ...l, section: section.id });
    sections[section.id] = holder;
    parts[section.id] = { detail, far, dynamic, moving, marks };
    stats.sections[section.id] = { detail: detail.triangles, far: far.triangles };
    group.add(holder);
  }
  // Where each section lies, and the ways between them (a portal's area is where its two sections meet), for what the camera can see.
  const boxes = Object.fromEntries(stage.sections.map((section) => [section.id, kitRegionBoxes(section.bounds, stage.sea)]));
  const links = stage.sections.flatMap((section) => (section.portals ?? []).map((portal) => ({ a: section.id, b: portal.to, boxes: kitRegionBoxes(portal.area, stage.sea) })));
  const camera = { frustum: new THREE.Frustum(), matrix: new THREE.Matrix4(), set: false };
  // A few real lights, moved to the nearest of the flames and torches. Every lit surface of the picture pays for each light in the scene, lit or
  // not (a third of the graphics card's time out in the rain, where no torch is near), so the four are in the scene only while a torch lights
  // something (all together: two shaders to keep, with the lights and without, `view.warm` builds them both before they are wanted).
  const pool = [];
  for (let k = 0; k < 4; k += 1) {
    const light = new THREE.PointLight(0xffa050, 0, 12, 2);
    light.name = `kit-light-${k}`;
    light.userData.torch = true;
    light.visible = false;
    group.add(light);
    pool.push(light);
  }
  const state = { time: 0, last: null, lightClock: 0, near: new Set(), lit: [], shelter: 1, reflect: {} };
  const view = { stage, group, sections, mechanisms: [], mats, stats };

  /** Show what is in force: detail near the player, silhouettes elsewhere; gates and ladders as they stand; the flames. */
  view.update = (world, eye = null) => {
    const run = world.stage;
    const now = performance.now() / 1000;
    const dt = state.last === null ? 0 : Math.min(0.1, now - state.last);
    state.last = now;
    state.time += dt;
    const active = new Set(run.active);
    const near = kitNeighbours(stage, active);
    const me = world.fighters[0];
    const px = me.x[P.pelvis * 3];
    const py = me.x[P.pelvis * 3 + 1];
    const pz = me.x[P.pelvis * 3 + 2];
    // The weather follows him, and the rain stops under a roof.
    const indoors = world.arena.terrain ? ceilingAt(world.arena.terrain, px, pz, py) < py + 7 : false;
    stormFollow(px, py, pz, indoors);
    // Under a roof the sky is not what the wet stone shows: its reflections fade (and come back in the open).
    state.shelter += ((indoors ? 0.1 : 1) - state.shelter) * Math.min(1, dt * 4);
    for (const [name, base] of Object.entries(state.reflect)) mats[name].envMapIntensity = base * state.shelter;
    ktWeather.uKitPoolSky.value = state.shelter;
    // What the camera can see (when it is given): a section outside its frustum is not drawn or animated at all; one beside
    // the sections the man is in is drawn in detail only if the way between them is in view (else its silhouette, which is
    // what is behind a wall); the frustum culling of the meshes does the rest.
    camera.set = false;
    if (eye) {
      eye.updateMatrixWorld();
      camera.frustum.setFromProjectionMatrix(camera.matrix.multiplyMatrices(eye.projectionMatrix, eye.matrixWorldInverse));
      camera.set = true;
    }
    const sees = (list) => !camera.set || list.some((box) => camera.frustum.intersectsBox(box));
    const seenThrough = (id) => links.some((link) => ((link.a === id && active.has(link.b)) || (link.b === id && active.has(link.a))) && sees(link.boxes));
    for (const section of stage.sections) {
      const entry = parts[section.id];
      const inView = sees(boxes[section.id]);
      const shown = near.has(section.id);
      const detailed = shown && inView && (active.has(section.id) || seenThrough(section.id));
      entry.detail.group.visible = detailed;
      entry.far.group.visible = !detailed && inView;
      if (!shown) continue;
      // (Gates and ladders keep their motion whether or not they are seen, so that one shut behind him is shut when he turns round.)
      for (const moving of entry.moving) {
        const target = ['open', 'down'].includes(run.mechanisms[moving.id]) ? 1 : 0;
        if (moving.open < 0) moving.open = target;
        else moving.open += Math.max(-1, Math.min(1, (target - moving.open) * Math.min(1, dt * 2.6)));
        moving.apply(moving.open);
      }
      if (!detailed) continue;
      kitAnimate(entry.dynamic.parts, entry.detail.dyn, state.time);
      const taken = run.level?.taken;
      for (const mark of entry.marks) {
        const gone = taken?.has(mark.item.id);
        mark.group.visible = !gone;
        if (gone) continue;
        mark.mesh.rotation.y = state.time * 1.4;
        mark.group.position.y = mark.item.at[1] + (mark.item.lift ?? 0) + Math.sin(state.time * 2 + mark.item.at[0]) * 0.03;
        mark.glint.material.opacity = 0.55 + 0.35 * Math.sin(state.time * 3.1 + mark.item.at[2]);
      }
    }
    // The lights: the four nearest of the lit things in the sections shown, a few times a second.
    state.lightClock -= dt;
    if (state.lightClock <= 0) {
      state.lightClock = 0.2;
      const candidates = [];
      for (const l of lights) {
        if (!near.has(l.section)) continue;
        const d = Math.hypot(l.at[0] - px, l.at[2] - pz);
        if (d < l.range * 2.2) candidates.push({ l, d });
      }
      candidates.sort((a, b) => a.d - b.d);
      state.lit = candidates.slice(0, pool.length).map((c) => c.l);
    }
    pool.forEach((light, k) => {
      light.visible = state.lit.length > 0;
      const l = state.lit[k];
      if (!l) {
        light.intensity = 0;
        return;
      }
      light.position.set(l.at[0], l.at[1], l.at[2]);
      light.color.setHex(l.color);
      light.distance = l.range;
      light.intensity = l.power * (0.9 + 0.12 * Math.sin(state.time * 13 + k * 2) + 0.06 * Math.sin(state.time * 31 + k)) * 2.2 * stormTorch();
    });
    foam.map.offset.set(state.time * 0.02, state.time * 0.05);
    foam.opacity = 0.3 + 0.1 * Math.sin(state.time * 0.9);
  };

  /**
   * Draw the castle once, every piece of it, with the torches' lights on and again with them off, by `draw()`, so that every shader
   * the picture will want is built now, in the frame the stage opens, and not in the middle of a fight as a man walks up to his first torch.
   * (Once only; the picture of these two frames is the one drawn after them.)
   */
  view.warm = (draw) => {
    if (state.warmed) return;
    state.warmed = true;
    const kept = [];
    group.traverse((object) => {
      if (object.isMesh || object.isLine || object.isPoints) kept.push([object, object.frustumCulled, object.visible]);
    });
    const holders = Object.values(parts).flatMap((entry) => [entry.detail.group, entry.far.group]).map((holder) => [holder, holder.visible]);
    const lamps = pool.map((light) => light.visible);
    for (const [object] of kept) object.frustumCulled = false;
    for (const [holder] of holders) holder.visible = true;
    for (const on of [true, false]) {
      for (const light of pool) light.visible = on;
      draw();
    }
    for (const [object, culled, visible] of kept) Object.assign(object, { frustumCulled: culled, visible });
    for (const [holder, visible] of holders) holder.visible = visible;
    pool.forEach((light, k) => {
      light.visible = lamps[k];
    });
  };

  /** Give the wet stone and the puddles a reflection: `env` is a cube or equirect environment map. */
  view.setEnvironment = (env, { stone = 0.22, water = 1.2 } = {}) => {
    for (const [name, material] of Object.entries(mats)) {
      if (['ashlar', 'ruin', 'rubble', 'rock', 'cobble', 'flags', 'path', 'iron'].includes(name)) {
        material.envMap = env;
        material.envMapIntensity = name === 'cobble' || name === 'flags' ? stone * 1.8 : name === 'iron' ? 0.8 : stone;
        state.reflect[name] = material.envMapIntensity;
        material.needsUpdate = true;
      }
    }
    mats.water.envMap = env;
    mats.water.envMapIntensity = water;
    mats.water.needsUpdate = true;
  };

  /**
   * Bake the castle's shadow for a look (levelmode/kitshadow.js): the land and every section's detail, seen once from the look's sun, into a map the kit's shaders
   * read. `look.bakedShadow` (0..1) is how much of the sun the shadow takes; 0 (or none) frees the map. Costs one draw of the castle, at a look's change; none in play.
   * Returns the milliseconds it took.
   */
  view.bakeShadow = (renderer, look) => {
    const strength = look.bakedShadow ?? 0;
    if (!state.casters) {
      // What casts: the opaque kit meshes of the land and of each section's detail, but not the gates (they move), the things to take, the flames and ravens.
      const opaque = new Set(['ashlar', 'ruin', 'rubble', 'rock', 'cobble', 'flags', 'grass', 'path', 'boards', 'wood', 'iron', 'bone', 'cloth', 'straw', 'black'].map((name) => mats[name]));
      const skip = new Set();
      for (const entry of Object.values(parts)) {
        for (const owner of [...entry.moving, ...entry.marks, entry.dynamic]) owner.group.traverse((object) => skip.add(object));
      }
      state.casters = [];
      for (const root of [land, ...Object.values(parts).map((entry) => entry.detail.group)]) {
        root.traverse((object) => {
          if (object.isMesh && opaque.has(object.material) && !skip.has(object)) state.casters.push(object);
        });
      }
    }
    // (Every section's detail is drawn for it, whether or not it is near the player now.)
    const holders = Object.values(parts).flatMap((entry) => [entry.detail.group, entry.far.group]).map((holder) => [holder, holder.visible]);
    for (const entry of Object.values(parts)) {
      entry.detail.group.visible = true;
      entry.far.group.visible = false;
    }
    state.shadowMs = ktShadowBake(renderer, group, state.casters, skyDirection(look.sun.az, look.sun.el), strength, stage.id);
    for (const [holder, visible] of holders) holder.visible = visible;
    return state.shadowMs;
  };

  view.dispose = () => {
    ktShadowRelease();
    group.traverse((object) => {
      object.geometry?.dispose();
    });
    ktDispose(mats);
    foam.map.dispose();
    foam.dispose();
    for (const texture of Object.values(textures)) texture.dispose();
  };
  return view;
}

/**
 * Where the follow camera may stand in a stage: `room(x, z, y)` is true if a ball of its size there is clear of the walls,
 * the slabs and the ceilings of the terrain now in force (`terrain()` gives it, for it changes as sections swap).
 */
export function stageCameraRoom(terrain) {
  const at = [0, 0];
  return (x, z, y) => {
    const t = terrain();
    if (!t) return true;
    at[0] = x;
    at[1] = z;
    if (pushOut(t, at, 0.32, y - 0.3, y + 0.3, 0.2) && Math.hypot(at[0] - x, at[1] - z) > 0.03) return false;
    return !(t.ceilings && ceilingAt(t, x, z, y - 0.35) < y + 0.3);
  };
}
