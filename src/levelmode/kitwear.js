// The castle's wear and dirt: what makes a wall read as old and lived in, not plain stone (the way the subway station's tile reads
// with its soot, rust and seepage: props/subway.js). Painted once into a small atlas of marks (water streaks, rust, soot, algae,
// a damp band, replaced stones, cracks, missing stones, droppings, moss, weeds), and laid as decals on the faces of the stage's wall
// runs from the same data the walls are drawn from: streaks running down from sills, gun loops and crenels, soot over doorways and
// torches, a dark damp band at the foot, patches, cracks and holes along the length. Cheap: a decal is one quad in the section's
// batch (a few hundred to a section, one draw call per chunk), alpha-blended over the stone with the castle's own fog and cut-away.

import { ktRandom } from './kitpaint.js';

const CELL = 128;
/** The atlas cells, in order (4 by 4). */
export const KW = {
  water: 0, rust: 1, soot: 2, algae: 3, damp: 4, patchLight: 5, patchDark: 6, crack: 7, hole: 8, droppings: 9, moss: 10, weeds: 11, blot: 12, sootStreak: 13, salt: 14, scorch: 15,
};

/** Paint the atlas: cell k at ((k % 4) * 128, floor(k / 4) * 128). */
export function kwPaint(g, random = ktRandom(404)) {
  const cell = (k) => [(k % 4) * CELL, Math.floor(k / 4) * CELL];
  const streaks = (k, color, count, widthRange, alpha) => {
    const [ox, oy] = cell(k);
    for (let n = 0; n < count; n += 1) {
      const x = ox + 10 + random() * (CELL - 20);
      const w = widthRange[0] + random() * (widthRange[1] - widthRange[0]);
      const length = CELL * (0.55 + random() * 0.45);
      const gradient = g.createLinearGradient(0, oy, 0, oy + length);
      gradient.addColorStop(0, `rgba(${color},${alpha * (0.6 + random() * 0.4)})`);
      gradient.addColorStop(0.7, `rgba(${color},${alpha * 0.45})`);
      gradient.addColorStop(1, `rgba(${color},0)`);
      g.fillStyle = gradient;
      // A streak wanders and thins as it runs.
      g.beginPath();
      let drift = 0;
      const points = [];
      for (let y = 0; y <= length; y += 8) {
        drift += (random() - 0.5) * 3;
        points.push([x + drift, oy + y, w * (1 - 0.5 * (y / length)) * (0.8 + random() * 0.4)]);
      }
      g.moveTo(points[0][0] - points[0][2] / 2, points[0][1]);
      for (const [px, py, pw] of points) g.lineTo(px - pw / 2, py);
      for (let k2 = points.length - 1; k2 >= 0; k2 -= 1) g.lineTo(points[k2][0] + points[k2][2] / 2, points[k2][1]);
      g.fill();
    }
  };
  streaks(KW.water, '14,20,30', 7, [4, 13], 0.5);
  streaks(KW.rust, '112,54,22', 6, [3, 11], 0.58);
  streaks(KW.algae, '44,74,30', 6, [5, 16], 0.5);
  streaks(KW.sootStreak, '6,6,8', 4, [4, 9], 0.4);
  streaks(KW.salt, '200,198,184', 6, [3, 9], 0.32);
  // Soot: a plume from the foot of the cell, tall and ragged.
  {
    const [ox, oy] = cell(KW.soot);
    for (let n = 0; n < 26; n += 1) {
      const r = 14 + random() * 26;
      const x = ox + CELL / 2 + (random() - 0.5) * 34 * (1 - n / 34);
      const y = oy + CELL - 8 - random() * CELL * 0.8 * (n / 26);
      const gradient = g.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, 'rgba(4,4,6,0.22)');
      gradient.addColorStop(1, 'rgba(4,4,6,0)');
      g.fillStyle = gradient;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  // Damp band: dark at the foot, a ragged top.
  {
    const [ox, oy] = cell(KW.damp);
    let edge = 0.45;
    for (let x = 0; x < CELL; x += 2) {
      edge = Math.max(0.15, Math.min(0.8, edge + (random() - 0.5) * 0.12));
      const top = CELL * (1 - edge);
      const gradient = g.createLinearGradient(0, oy + top, 0, oy + CELL);
      gradient.addColorStop(0, 'rgba(8,12,16,0)');
      gradient.addColorStop(0.35, 'rgba(8,12,16,0.5)');
      gradient.addColorStop(1, 'rgba(6,8,10,0.78)');
      g.fillStyle = gradient;
      g.fillRect(ox + x, oy + top, 2, CELL - top);
    }
  }
  // Patches of replaced stones: a lighter (or a bluer) block of courses with its own mortar and a ragged edge.
  const patch = (k, base, spread) => {
    const [ox, oy] = cell(k);
    const inset = 14;
    const rows = 4;
    const rowHeight = (CELL - inset * 2) / rows;
    for (let r = 0; r < rows; r += 1) {
      let x = inset + random() * 16 - 8;
      const jaggedLeft = random() * 10;
      while (x < CELL - inset) {
        const w = 22 + random() * 26;
        const tone = 0.85 + random() * 0.3;
        g.fillStyle = `rgba(${base.map((c) => Math.min(255, c * tone * spread) | 0).join(',')},0.95)`;
        const x0 = Math.max(inset + jaggedLeft * (r % 2), x);
        const x1 = Math.min(CELL - inset - random() * 8, x + w - 2);
        if (x1 > x0) g.fillRect(ox + x0, oy + inset + r * rowHeight + 1, x1 - x0, rowHeight - 2);
        x += w;
      }
    }
    // The edge: a little worn and dirty.
    g.fillStyle = 'rgba(0,0,0,0.14)';
    g.fillRect(ox + inset, oy + inset, CELL - inset * 2, 3);
    g.fillRect(ox + inset, oy + CELL - inset - 3, CELL - inset * 2, 3);
  };
  patch(KW.patchLight, [168, 150, 124], 1);
  patch(KW.patchDark, [84, 90, 100], 1);
  // A crack: a jagged dark line with a branch or two.
  {
    const [ox, oy] = cell(KW.crack);
    g.strokeStyle = 'rgba(6,6,8,0.92)';
    g.lineCap = 'round';
    const run = (x, y, width, depth) => {
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(ox + x, oy + y);
      let cx = x;
      let cy = y;
      for (let n = 0; n < depth; n += 1) {
        cx += (random() - 0.5) * 22;
        cy += 10 + random() * 9;
        g.lineTo(ox + Math.max(4, Math.min(CELL - 4, cx)), oy + Math.min(CELL - 4, cy));
        if (random() < 0.18 && width > 1.5) run(cx, cy, width * 0.5, 3 + Math.floor(random() * 3));
      }
      g.stroke();
    };
    run(CELL / 2 + (random() - 0.5) * 30, 4, 3.2, 11);
  }
  // A missing stone: a dark socket, its lower lip catching light, its top in shadow.
  {
    const [ox, oy] = cell(KW.hole);
    const w = 62;
    const h = 38;
    const x = ox + (CELL - w) / 2;
    const y = oy + (CELL - h) / 2;
    g.fillStyle = 'rgba(5,5,7,0.96)';
    g.beginPath();
    g.roundRect(x, y, w, h, 4);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(x - 3, y - 4, w + 6, 6);
    g.fillStyle = 'rgba(176,164,140,0.55)';
    g.fillRect(x + 2, y + h, w - 4, 3);
    // Fallen chips.
    for (let n = 0; n < 4; n += 1) {
      g.fillStyle = 'rgba(120,112,98,0.7)';
      g.fillRect(x + random() * w, y + h + 5 + random() * 8, 3 + random() * 5, 2 + random() * 3);
    }
  }
  // Droppings: white blots on a ledge with a streak running down.
  {
    const [ox, oy] = cell(KW.droppings);
    for (let n = 0; n < 5; n += 1) {
      const x = ox + 20 + random() * (CELL - 40);
      const y = oy + 8 + random() * 26;
      g.fillStyle = 'rgba(222,218,204,0.85)';
      g.beginPath();
      g.ellipse(x, y, 4 + random() * 6, 3 + random() * 3, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(214,210,196,0.5)';
      g.fillRect(x - 1, y, 2.2, 14 + random() * 42);
    }
  }
  // Moss: soft green blotches.
  {
    const [ox, oy] = cell(KW.moss);
    for (let n = 0; n < 30; n += 1) {
      const x = ox + CELL / 2 + (random() - 0.5) * 80;
      const y = oy + CELL / 2 + (random() - 0.5) * 70;
      const r = 8 + random() * 16;
      const gradient = g.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, `rgba(${46 + random() * 18},${74 + random() * 22},${26 + random() * 12},0.55)`);
      gradient.addColorStop(1, 'rgba(46,74,26,0)');
      g.fillStyle = gradient;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  // Weeds in the joints: blades from the foot of the cell.
  {
    const [ox, oy] = cell(KW.weeds);
    for (let n = 0; n < 34; n += 1) {
      const x = ox + 14 + random() * (CELL - 28);
      const h = 26 + random() * 70;
      const lean = (random() - 0.5) * 34;
      g.strokeStyle = `rgba(${52 + random() * 40},${76 + random() * 44},${26 + random() * 20},0.96)`;
      g.lineWidth = 1.6 + random() * 1.6;
      g.beginPath();
      g.moveTo(x, oy + CELL - 2);
      g.quadraticCurveTo(x + lean * 0.3, oy + CELL - h * 0.55, x + lean, oy + CELL - h);
      g.stroke();
    }
  }
  // A dark wet blot, for a floor.
  {
    const [ox, oy] = cell(KW.blot);
    for (let n = 0; n < 12; n += 1) {
      const x = ox + CELL / 2 + (random() - 0.5) * 50;
      const y = oy + CELL / 2 + (random() - 0.5) * 50;
      const r = 14 + random() * 26;
      const gradient = g.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, 'rgba(6,8,12,0.3)');
      gradient.addColorStop(1, 'rgba(6,8,12,0)');
      g.fillStyle = gradient;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  // Scorch: a burnt patch with ash.
  {
    const [ox, oy] = cell(KW.scorch);
    for (let n = 0; n < 16; n += 1) {
      const x = ox + CELL / 2 + (random() - 0.5) * 60;
      const y = oy + CELL / 2 + (random() - 0.5) * 60;
      const r = 12 + random() * 22;
      const gradient = g.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, 'rgba(3,3,4,0.5)');
      gradient.addColorStop(1, 'rgba(3,3,4,0)');
      g.fillStyle = gradient;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
}

/** The atlas as a texture (a canvas the page makes). */
export function kwTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = CELL * 4;
  kwPaint(canvas.getContext('2d'));
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

// ---- laying the decals ---------------------------------------------------------------------------------

/** The levels of the stage, for finding the floor a wall stands on from the foot of its run (the run's `floor`, when it says). */
const kwFloorOf = (run, levels) => {
  if (Number.isFinite(run.floor)) return run.floor;
  let best = run.y0 + 1;
  let bestGap = Infinity;
  for (const level of levels) {
    const gap = level - run.y0;
    if (gap >= -0.2 && gap <= 1.4 && gap < bestGap) {
      best = level;
      bestGap = gap;
    }
  }
  return best;
};

/** A decal quad of atlas cell `cell` with its bottom-left corner at `p`, `u` along the wall (unit), up the wall, `w` by `h`, as raw triangles. */
function kwQuad(batch, cell, p, u, up, w, h, normal, tint = 1) {
  const c0 = (cell % 4) / 4;
  const r0 = Math.floor(cell / 4) / 4;
  const inset = 0.004;
  const [u0, u1] = [c0 + inset, c0 + 0.25 - inset];
  // (The canvas's y runs down: the top of the cell is v = 1 - r0.)
  const [v0, v1] = [1 - r0 - 0.25 + inset, 1 - r0 - inset];
  const a = [p[0], p[1], p[2]];
  const b = [p[0] + u[0] * w, p[1], p[2] + u[1] * w];
  const c = [b[0], b[1] + h * up, b[2]];
  const d = [a[0], a[1] + h * up, a[2]];
  const position = [...a, ...b, ...c, ...a, ...c, ...d];
  const norm = [normal[0], 0, normal[1]];
  const normals = [...norm, ...norm, ...norm, ...norm, ...norm, ...norm];
  const uv = [u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1];
  const t = Array.isArray(tint) ? tint : [tint, tint, tint];
  const color = [];
  for (let k = 0; k < 6; k += 1) color.push(...t);
  batch.raw('wear', position, normals, uv, color);
}

/**
 * Lay a section's decals: from its wall runs (and the torches on them). `levels`: the stage's floor levels. A decal is 2 cm off the face.
 * (Runs a few metres long only: a bit of wall with no length gets nothing.)
 */
export function kwDecorate(batch, section, levels) {
  const runs = (section.decor ?? []).filter((d) => d.kind === 'run' && !d.round);
  const torches = (section.decor ?? []).filter((d) => d.kind === 'prop' && d.what === 'torch');
  let index = 0;
  for (const run of runs) {
    index += 1;
    const [ax, az] = run.a;
    const dx = run.b[0] - ax;
    const dz = run.b[1] - az;
    const length = Math.hypot(dx, dz);
    if (length < 2.5) continue;
    const ux = dx / length;
    const uz = dz / length;
    const floor = kwFloorOf(run, levels);
    const top = run.y1 - (run.style === 'ruin' ? 1.6 : 0.2);
    if (top - floor < 1.6) continue;
    const random = ktRandom(Math.floor(Math.abs(ax * 53 + az * 97 + length * 31)) + index * 7 + 11);
    const openings = [...(run.openings ?? [])].sort((p, q) => p.at - q.at);
    const door = (o) => (o.sill ?? run.y0) <= floor + 0.45;
    const inOpening = (s, pad = 0.35) => openings.some((o) => s > o.at - o.width / 2 - pad && s < o.at + o.width / 2 + pad);
    const faces = [-1, 1];
    for (const side of faces) {
      // The face: its outward normal (to the left of the way along for +1), and a point on it at distance s along.
      const nx = -uz * side;
      const nz = ux * side;
      const off = run.thick / 2 + 0.02;
      const at = (s, y) => [ax + ux * s + nx * off, y, az + uz * s + nz * off];
      const normal = [nx, nz];
      // Which way the quad's width runs so that it faces out: the along-wall vector, whichever way it reads from this side (decals are double-sided; the texture only has to be upright).
      const u = [ux, uz];
      const put = (cell, s0, y0, w, h, tint = 1) => kwQuad(batch, cell, at(s0, y0), u, 1, w, h, normal, tint);
      // The damp band at the foot, in the stretches between doorways.
      let cursor = 0;
      const stretches = [];
      for (const o of openings.filter(door)) {
        stretches.push([cursor, o.at - o.width / 2]);
        cursor = o.at + o.width / 2;
      }
      stretches.push([cursor, length]);
      for (const [s0, s1] of stretches) {
        for (let s = s0; s < s1 - 0.3; s += 3.2) {
          const w = Math.min(3.2, s1 - s);
          put(KW.damp, s, floor, w, 0.8 + random() * 0.6, 0.9 + random() * 0.2);
        }
      }
      // Under the sills of windows and gun loops: water, rust or algae running down; soot over a loop.
      for (const o of openings) {
        if (door(o)) {
          // Over a doorway: the soot of a hundred torches, and the damp stain where the arch weeps.
          const crown = o.top + 0.05;
          if (crown + 0.9 < top && random() < 0.8) put(KW.soot, o.at - o.width * 0.6, crown, o.width * 1.2, 1.5 + random(), 0.9);
          continue;
        }
        const sill = o.sill ?? run.y0;
        const drop = Math.min(sill - floor - 0.1, 1.4 + random() * 2.2);
        if (drop > 0.5) {
          const cell = o.shape === 'oillet' ? KW.sootStreak : [KW.water, KW.rust, KW.algae, KW.water, KW.salt][Math.floor(random() * 5)];
          put(cell, o.at - o.width * 0.5 - 0.15, sill - drop, o.width + 0.3, drop, 1);
        }
        if (o.shape === 'oillet' || o.shape === 'slit') put(KW.soot, o.at - 0.6, (o.top ?? sill) - 0.1, 1.2, 1.1, 0.8);
      }
      // Under the crenels: dark drips from the top.
      if (run.crenel) {
        for (let s = 1.2 + random() * 1.5; s < length - 1; s += 3.4 + random() * 2.5) {
          if (!inOpening(s, 0.1)) put([KW.water, KW.algae, KW.rust][Math.floor(random() * 3)], s, run.y1 - 3.3, 1.2, 2.3, 0.95);
        }
      }
      // Torches on this face: soot above each.
      for (const torch of torches) {
        const rel = [torch.at[0] - ax, torch.at[2] - az];
        const s = rel[0] * ux + rel[1] * uz;
        const across = rel[0] * nx + rel[1] * nz;
        if (s < 0 || s > length || Math.abs(across) > run.thick / 2 + 0.7 || across * 1 < -run.thick / 2 - 0.15) continue;
        put(KW.soot, s - 0.55, torch.at[1] + 0.35, 1.1, 1.7, 1);
      }
      // Along the length: patches, cracks, missing stones, moss, droppings, weeds.
      const count = Math.max(1, Math.round(length / 4.5));
      for (let n = 0; n < count; n += 1) {
        const s = 0.6 + random() * (length - 1.8);
        if (inOpening(s, 0.6)) continue;
        const y = floor + 0.7 + random() * Math.max(0.4, top - floor - 1.9);
        const pick = random();
        if (pick < 0.2) put(KW.patchLight, s, y, 1.0 + random() * 0.9, 0.8 + random() * 0.6);
        else if (pick < 0.32) put(KW.patchDark, s, y, 0.9 + random() * 0.8, 0.7 + random() * 0.5);
        else if (pick < 0.52) put(KW.crack, s, y - 0.4, 0.9 + random() * 0.5, 1.4 + random() * 1.4);
        else if (pick < 0.68) put(KW.hole, s, y, 0.6 + random() * 0.4, 0.5 + random() * 0.3);
        else if (pick < 0.84) put(KW.moss, s, y - 0.3, 1.0 + random() * 0.8, 1.0 + random() * 0.6);
        else put(KW.droppings, s, Math.min(top - 1.5, y + 0.6), 0.7 + random() * 0.5, 1.2 + random() * 0.8);
      }
      // The old drain's filth (`section.filth`, 0..1): green-black streaks down from the vault, mould and moss low, a salt crust, a slime line where the sewage stood.
      if (section.filth) {
        for (let s = 0.3 + random(); s < length - 0.6; s += 0.9 + random() * 1.3 / section.filth) {
          if (inOpening(s, 0.2)) continue;
          const pick = random();
          if (pick < 0.42) put(KW.algae, s, Math.max(floor + 0.4, top - 2.8 - random() * 0.6), 0.8 + random() * 0.8, 2.4 + random() * 0.8, 0.7 + random() * 0.3);
          else if (pick < 0.64) put(KW.moss, s, floor + 0.15 + random() * 1.2, 0.9 + random() * 0.9, 0.9 + random() * 0.6, 0.8);
          else if (pick < 0.8) put(KW.salt, s, floor + 0.2, 0.8 + random() * 0.6, 1.2 + random() * 0.9, 1);
          else put(KW.water, s, Math.max(floor + 0.4, top - 3), 0.8, 2.6, 0.8);
        }
        for (const [s0, s1] of stretches) {
          for (let s = s0; s < s1 - 0.3; s += 2.8) put(KW.damp, s, floor + 0.35, Math.min(2.8, s1 - s), 0.55, 0.7);
        }
      }
      // Weeds at the foot, in the joints.
      for (let n = 0; n < Math.round(length / 2.8); n += 1) {
        const s = random() * (length - 0.6);
        if (inOpening(s, 0.4)) continue;
        put(KW.weeds, s, floor - 0.02, 0.5 + random() * 0.5, 0.35 + random() * 0.4, 0.9 + random() * 0.3);
      }
    }
  }
}
