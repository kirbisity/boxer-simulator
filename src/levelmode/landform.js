// The land of a stage with a `landform` (Stage 1's mainland hillside), as a height function: what kit.js draws as the ground, and what
// the stage's scenery must stand on (test/dunnottarground.test.js asks every prop, crag and cairn on the mainland to sit on it).
// No THREE here: node's tests read it as the kit does.

/** The axis-aligned footprints of a stage's solids (gates and ladders in their present state), with their heights. Ceilings are left out. */
export function stageBlocks(stage) {
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

/** Whether a cell of the mainland's mesh, by its middle (x, z), is left out: `landform.holes`, [x0, x1, z0, z1] each (a cave under the hill). */
export const landHole = (holes, x, z) => holes.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1);

/** Distance from (x, z) to a block's footprint (0 inside). */
export const landDistance = (b, x, z) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));

/** Whether a point is inside a polygon. */
export function landInside(polygon, x, z) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** The distance from a point to the polygon's edge. */
export function landEdgeDistance(polygon, x, z) {
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

export const landSmooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Whether a block shapes the hillside: the paths and their stairs (cut into it), the low rock floors (the shelf), and the grass floors laid
 * on the mainland itself (the plateau where the way begins: the hill rises to meet it, so it is not a table standing proud of the slope).
 */
function shapesLand(b, polygon) {
  if (b.wall) return false;
  const s = b.solid;
  const x = (b.x0 + b.x1) / 2;
  const z = (b.z0 + b.z1) / 2;
  const inside = landInside(polygon, x, z);
  // (Only what lies on the mainland or at its edge: a cobbled stair inside the castle is not a path on the hill. It used to be, and the
  // hillside rose in the gatehouse's stair tunnel and through the cellar's doors.)
  if (!inside && landEdgeDistance(polygon, x, z) > 7) return false;
  if (['path', 'cobble'].includes(s.style)) return true;
  if (s.land && s.style === 'rock' && b.top < 2) return true;
  return Boolean(s.land) && s.style === 'grass' && inside;
}

/**
 * The mainland's height function (x, z) => y: the plane of the hillside (capped), falling away outside its polygon, drawn to the height of
 * every path, stair and floor laid on it within a few metres (a path's height at its footprint, blending out to the hill), and cut down in
 * the `carve` boxes. `blocks` are stageBlocks(stage). The kit draws this (with a few centimetres of jitter); the scenery stands on it.
 */
export function mainlandHeight(stage, blocks = stageBlocks(stage)) {
  const form = stage.landform;
  const { mainland } = form;
  const sea = stage.sea;
  const [a, bx, c, d] = mainland.plane;
  const sources = blocks.filter((b) => shapesLand(b, mainland.polygon));
  return (x, z) => {
    let h = Math.min(mainland.cap, a + bx * x + c * (z - d));
    if (!landInside(mainland.polygon, x, z)) h -= 3.2 * landEdgeDistance(mainland.polygon, x, z);
    let near = null;
    let nearD = Infinity;
    for (const b of sources) {
      const dist = landDistance(b, x, z);
      if (dist < nearD) {
        nearD = dist;
        near = b;
      }
    }
    if (near && nearD < 7) {
      const s = near.solid;
      const px = Math.max(near.x0, Math.min(near.x1, x));
      const pz = Math.max(near.z0, Math.min(near.z1, z));
      let py;
      if (s.kind === 'slab') py = s.top;
      else {
        const yaw = s.yaw ?? 0;
        const lx = (px - s.at[0]) * Math.cos(yaw) - (pz - s.at[1]) * Math.sin(yaw);
        const u = (lx + s.size[0] / 2) / s.size[0];
        py = s.kind === 'ramp' ? s.from + (s.to - s.from) * u : s.from + s.steps * s.rise * u;
      }
      const w = landSmooth(1.4, 7, nearD);
      h = py - 0.05 + (h - (py - 0.05)) * w;
    }
    // Boxes where the hillside is cut away to a height (the sea cave's stair and landing under the shelf's edge, the ravine): [x0, x1, z0, z1, top].
    for (const [cx0, cx1, cz0, cz1, top] of form.carve ?? []) if (x >= cx0 && x <= cx1 && z >= cz0 && z <= cz1) h = Math.min(h, top);
    return Math.max(h, sea - 6);
  };
}

/** A cheap smooth noise of (x, z), about -1 to 1. */
export function landNoise(x, z) {
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
 * The rock of the headland as a heightfield (kit.js draws it): it stands a little under every floor and roof of the castle and falls away from
 * their edges in cliffs, ragged and steep, down to the sea; held down under the open floors and in the `clear` boxes of the landform (doorways
 * at its foot). Returns { x0, z0, cell, heights } (heights[row][column], rows along z, the mesh's vertices on the regular grid).
 */
export function islandHeights(stage, blocks, sea) {
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
  for (let r = 0; r <= rows; r += 1) {
    const row = [];
    for (let k = 0; k <= columns; k += 1) {
      // The vertices are knocked about so the cliffs do not run on the grid.
      const x = x0 + k * cell + landNoise(k * 0.9 + 3, r * 0.9) * 0.55;
      const z = z0 + r * cell + landNoise(k * 0.9, r * 0.9 + 7) * 0.55;
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
      const rough = (landNoise(x * 0.35, z * 0.35) * 1.6 + landNoise(x * 0.9 + 9, z * 0.9) * 0.6) * Math.min(reach, 5) * 0.55;
      let h = best + rough;
      for (const cap of caps) if (x > cap.x0 && x < cap.x1 && z > cap.z0 && z < cap.z1) h = Math.min(h, cap.top);
      row.push(Math.max(h, sea - 6));
    }
    heights.push(row);
  }
  return { x0, z0, cell, heights };
}
