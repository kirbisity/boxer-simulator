// What the drawing puts in a stage's doorways (for test/dunnottarentrances.test.js): every walk-through opening of the wall runs (not a window or a
// loop), as a box through the wall a little either side of it, and every drawn thing that reaches into that box: a wall, a floor, a ceiling, a vault
// shell, a face or a mass of the decor, and the land (the mainland hillside's and the headland rock's heightfields, as the kit draws them). A doorway
// with something in its box looks shut, or half shut, though a man walks through it (the physics has no such thing there, or it would not be a door).

import { islandHeights, landHole, mainlandHeight, stageBlocks } from '../src/levelmode/landform.js';

/** The doorways: { section, face, centre [x, z], along [ux, uz] (the wall's way), normal, half: [half width, half depth], y: [low, high], label }. */
export function doorways(stage, { margin = 0.25, beyond = 0.8, headroom = 2.4 } = {}) {
  const doors = [];
  for (const section of stage.sections) {
    for (const run of section.decor.filter((decor) => decor.kind === 'run')) {
      const dx = run.b[0] - run.a[0];
      const dz = run.b[1] - run.a[1];
      const length = Math.hypot(dx, dz);
      const along = [dx / length, dz / length];
      for (const opening of run.openings ?? []) {
        if (opening.solid || opening.width < 1.2 || ['slit', 'oillet', 'lancet'].includes(opening.shape)) continue;
        const sill = opening.sill ?? run.y0;
        const centre = [run.a[0] + along[0] * opening.at, run.a[1] + along[1] * opening.at];
        doors.push({
          section: section.id, face: run.face ?? null, centre, along, normal: [-along[1], along[0]], sill,
          half: [opening.width / 2 - margin, run.thick / 2 + beyond], y: [sill + 0.3, Math.min(opening.top - 0.35, sill + headroom)],
          label: `${section.id}${run.face ? ` ${run.face}` : ''} door at ${centre.map((v) => v.toFixed(1))} (sill ${sill.toFixed(2)})`,
        });
      }
    }
  }
  return doors;
}

/** A point in a door's own frame: [across the opening, through it]. */
const local = (door, x, z) => [(x - door.centre[0]) * door.along[0] + (z - door.centre[1]) * door.along[1], (x - door.centre[0]) * door.normal[0] + (z - door.centre[1]) * door.normal[1]];

/** Whether a footprint (a rectangle [cx, cz], [length, width], yaw as the solids have it) overlaps the door's in plan: separating axes. */
function overlapsPlan(door, at, size, yaw, shrink = 0) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // (A solid's local x runs along (cos yaw, -sin yaw), its z along (sin yaw, cos yaw).)
  const axesB = [[c, -s], [s, c]];
  const halfB = [size[0] / 2 - shrink, size[1] / 2 - shrink];
  const axesA = [door.along, door.normal];
  const halfA = door.half;
  const d = [at[0] - door.centre[0], at[1] - door.centre[1]];
  for (const axis of [...axesA, ...axesB]) {
    const ra = halfA[0] * Math.abs(axis[0] * axesA[0][0] + axis[1] * axesA[0][1]) + halfA[1] * Math.abs(axis[0] * axesA[1][0] + axis[1] * axesA[1][1]);
    const rb = halfB[0] * Math.abs(axis[0] * axesB[0][0] + axis[1] * axesB[0][1]) + halfB[1] * Math.abs(axis[0] * axesB[1][0] + axis[1] * axesB[1][1]);
    if (Math.abs(d[0] * axis[0] + d[1] * axis[1]) >= ra + rb) return false;
  }
  return true;
}

/** Whether a triangle (three [x, y, z]) meets the door's box: the triangle in the door's frame against an axis-aligned box (separating axes). */
function triangleInDoor(door, tri) {
  const lo = door.y[0];
  const hi = door.y[1];
  const cy = (lo + hi) / 2;
  const half = [door.half[0], (hi - lo) / 2, door.half[1]];
  const v = tri.map(([x, y, z]) => {
    const [u, w] = local(door, x, z);
    return [u, y - cy, w];
  });
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const edges = [sub(v[1], v[0]), sub(v[2], v[1]), sub(v[0], v[2])];
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1], cross(edges[0], edges[1])];
  for (const e of edges) for (const a of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) axes.push(cross(e, a));
  for (const axis of axes) {
    if (Math.abs(axis[0]) + Math.abs(axis[1]) + Math.abs(axis[2]) < 1e-9) continue;
    const p = v.map((point) => dot(point, axis));
    const r = half[0] * Math.abs(axis[0]) + half[1] * Math.abs(axis[1]) + half[2] * Math.abs(axis[2]);
    if (Math.min(...p) > r || Math.max(...p) < -r) return false;
  }
  return true;
}

/** The triangles of a regular heightfield (rows along z) near a door, as kit.js's kitGridMesh lays them. */
function* gridTriangles(door, { x0, z0, cell, heights, holes = [] }) {
  const reach = Math.hypot(door.half[0], door.half[1]) + cell;
  const k0 = Math.max(0, Math.floor((door.centre[0] - reach - x0) / cell));
  const k1 = Math.min(heights[0].length - 2, Math.ceil((door.centre[0] + reach - x0) / cell));
  const r0 = Math.max(0, Math.floor((door.centre[1] - reach - z0) / cell));
  const r1 = Math.min(heights.length - 2, Math.ceil((door.centre[1] + reach - z0) / cell));
  const vertex = (r, k) => [x0 + k * cell, heights[r][k], z0 + r * cell];
  for (let r = r0; r <= r1; r += 1) {
    for (let k = k0; k <= k1; k += 1) {
      if (landHole(holes, x0 + (k + 0.5) * cell, z0 + (r + 0.5) * cell)) continue;
      yield [vertex(r, k), vertex(r + 1, k), vertex(r + 1, k + 1)];
      yield [vertex(r, k), vertex(r + 1, k + 1), vertex(r, k + 1)];
    }
  }
}

/** The mainland's heightfield as the kit lays it (without its few centimetres of jitter). */
function mainlandGrid(stage, blocks) {
  const { cell, extent } = stage.landform;
  const [x0, x1, z0, z1] = extent;
  const height = mainlandHeight(stage, blocks);
  const heights = [];
  for (let r = 0; r <= Math.ceil((z1 - z0) / cell); r += 1) {
    const row = [];
    for (let k = 0; k <= Math.ceil((x1 - x0) / cell); k += 1) row.push(height(x0 + k * cell, z0 + r * cell));
    heights.push(row);
  }
  return { x0, z0, cell, heights, holes: stage.landform.holes ?? [] };
}

/** A barrel vault of the decor as a few triangles' worth of points: is any of its shell inside the door's box? (Sampled along and across.) */
function vaultInDoor(door, vault) {
  const [ax, az, ay] = vault.a;
  const [bx, bz, by] = vault.b;
  const length = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / (length || 1);
  const uz = (bz - az) / (length || 1);
  for (let s = 0; s <= length + 1e-6; s += 0.25) {
    for (let t = -1; t <= 1 + 1e-6; t += 0.1) {
      const x = ax + ux * s - uz * t * vault.width / 2;
      const z = az + uz * s + ux * t * vault.width / 2;
      const y = ay + (by - ay) * (s / (length || 1)) + vault.crown * Math.sqrt(Math.max(0, 1 - t * t));
      const [u, w] = local(door, x, z);
      if (Math.abs(u) < door.half[0] && Math.abs(w) < door.half[1] && y > door.y[0] && y < door.y[1]) return true;
    }
  }
  return false;
}

/** Everything drawn that reaches into each doorway: [{ door: label, what }]. */
export function blockedDoorways(stage) {
  const blocks = stageBlocks(stage);
  const grids = [['the mainland hillside', mainlandGrid(stage, blocks)], ['the headland rock', islandHeights(stage, blocks, stage.sea)]];
  const found = [];
  for (const door of doorways(stage)) {
    const hit = (what) => found.push({ door: door.label, what });
    for (const section of stage.sections) {
      // (A gate's leaves shut a doorway by design; a prop is a thing in the way, not the building: neither is looked at here.)
      for (const solid of section.terrain) {
        if (['hidden', 'iron', 'ladder'].includes(solid.style) || solid.kind === 'stairs' || solid.kind === 'ramp') continue;
        if (!overlapsPlan(door, solid.at, solid.size, solid.yaw ?? 0, 0.02)) continue;
        const name = `${section.id} ${solid.kind} (${solid.style}) at ${solid.at.map((v) => v.toFixed(1))}`;
        if (solid.kind === 'wall' && solid.top > door.y[0] && solid.bottom < door.y[1]) hit(name);
        // (A floor at the threshold, or a step of a stair at it, is the way in: a floor in the doorway is one well above its sill.)
        if (solid.kind === 'slab' && solid.top > door.sill + 0.5 && solid.top < door.y[1]) hit(`${name}, its top ${solid.top}`);
        if (solid.kind === 'ceiling' && solid.bottom > door.y[0] && solid.bottom < door.y[1]) hit(`${name}, its underside ${solid.bottom}`);
      }
      for (const decor of section.decor) {
        if (decor.kind === 'vault' && vaultInDoor(door, decor)) hit(`${section.id} vault decor from ${decor.a.map((v) => v.toFixed(1))}`);
        if (decor.kind === 'mass') {
          const [x0, x1, z0, z1] = decor.box;
          if (decor.y1 > door.y[0] && decor.y0 < door.y[1] && overlapsPlan(door, [(x0 + x1) / 2, (z0 + z1) / 2], [x1 - x0, z1 - z0], 0)) hit(`${section.id} mass decor`);
        }
        if (decor.kind === 'face') {
          const length = Math.hypot(decor.b[0] - decor.a[0], decor.b[1] - decor.a[1]);
          const at = [(decor.a[0] + decor.b[0]) / 2, (decor.a[1] + decor.b[1]) / 2];
          if (decor.y1 > door.y[0] && decor.y0 < door.y[1] && overlapsPlan(door, at, [length, decor.thick ?? 0.3], Math.atan2(-(decor.b[1] - decor.a[1]), decor.b[0] - decor.a[0]))) hit(`${section.id} face decor`);
        }
      }
    }
    for (const [name, grid] of grids) {
      for (const tri of gridTriangles(door, grid)) {
        if (triangleInDoor(door, tri)) {
          hit(`${name}'s ground at ${tri[0][0].toFixed(1)},${tri[0][2].toFixed(1)} (y ${Math.max(...tri.map((p) => p[1])).toFixed(2)})`);
          break;
        }
      }
    }
  }
  return found;
}
