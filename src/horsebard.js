// A horse's armour (the bard) as meshes: pure geometry, built by horsemesh.js over the horse it fits and carried by the
// horse's own rigid pieces as the rest of it is (the shaffron on the head, the crinet on the neck, the peytral, flanchards
// and crupper on the body), so each plate rides the bone it lies on.
//
// A piece is shrink-wrapped over the horse: rays from inside it (its plan, below) are cast at the horse's body, the base of
// its neck (in every pose the gait gives the neck) and the dock of its tail; the plate stands the piece's padding off the
// furthest surface met. Below the barrel's widest it no longer follows the body in under the belly but hangs, as a plate
// does from its straps, and flares a little as it falls (which, with hems cut high where the forearm and the gaskin swing,
// keeps it clear of the legs at every pace: test/horsebard.test.js sweeps them).
//
// Two kinds:
// - plate: the 16th-century full bard (the Met's fluted shaffron, https://www.metmuseum.org/art/collection/search/27175,
//   and its armours for man and horse, e.g. Kunz Lochner's of 1548, https://www.metmuseum.org/art/collection/search/35739;
//   the Wallace Collection's Landshut armour for man and horse, A21, c. 1480, its bard 30.07 kg,
//   https://www.wallacecollection.org/art/collection/collection-highlights/equestrian-armour/; the Royal Armouries' engraved
//   'Burgundian bard' given to Henry VIII by Maximilian I, c. 1511-15; the fluted bards of the KHM Vienna's
//   Hofjagd- und Rüstkammer): the shaffron over the whole face with domed, pierced eye guards, ear cups, a rondel on the
//   brow and a plume holder at the poll; the crinet's lames lapping down the crest and upper sides of the neck with mail
//   under the throat; the peytral round the breast to the shoulders with its two bosses and medial ridge; the flanchards
//   under the saddle; the crupper over the hindquarters with its tail guard, split under the tail. Every edge turned and
//   roped with its lining rivets (the `harnessEdge` strip); the field fluted ('Maximilian'), etched in bands, or plain
//   bright, as the rider's harness is.
// - lamellar: the Song and Jin horse armour of the Wujing Zongyao (1044) (面簾 the face, 雞項 the neck, 盪胸 the breast,
//   身甲 the body, 搭後 the rump) as the Jurchen 'iron pagoda' and the steppe guards rode: an iron brow plate and a
//   lamellar face, the whole neck in lamellae, a breast piece, a skirt down the flanks below the belly and over the rump,
//   all of small round-headed lamellae in laced rows (the `lamellae` tile, laced in the rider's colour), bound at the edges
//   in leather with a fringed cloth hem.
// - brigandine: the Later Jin and Qing guard's bard, cut as the lamellar one (the same pieces, the horse fully clad) and
//   made as the rider's coat is: cloth in his coat's colour over small iron plates, studded with their gilt rivet heads in
//   rows (the `brigandine` tile, the rider's own: horseview.js colours it his cloth and his gilt), an iron brow plate
//   over the face, bound in leather with a fringed hem; a red horsehair tassel at the poll (the Qing's 红缨).

import { vec } from './pose.js';

const BD_TAU = Math.PI * 2;
const bdMix = (a, b, t) => a + (b - a) * t;
const bdSmooth = (t) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};
const bdScale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

/** The tiles a bard's pieces wear (detailmaps.js), by kind and finish: the field, the edges, the mail. */
export const BARD_TILES = {
  plate: { fluted: 'fluted', etched: 'etched', plain: 'plate', edge: 'harnessEdge', mail: 'mail' },
  lamellar: { field: 'lamellae', brow: 'munitionPlate' },
  brigandine: { field: 'brigandine', brow: 'munitionPlate' },
  mingFront: { field: 'brigandine', brow: 'munitionPlate' },
};

/**
 * Where each plate piece sits (horse units: the withers' height 1; x forward, y up, z to its left). `hem` the height of
 * its lower edge (high in front of the forearm and behind the gaskin, which swing up to ~0.6 at the gallop), `gap` its
 * padding off the horse, `flare` how much it stands out per unit it hangs.
 */
export const BARD_FIT = {
  plate: {
    peytral: { centre: 0.3, spread: 3.5, top: [0.87, 0.97, 0.92], hem: [0.67, 0.57], gap: 0.024, flare: 0.22 },
    flanchard: { x: [-0.3, 0.17], top: 0.8, hem: 0.58, gap: 0.014, flare: 0.14 },
    crupper: { centre: -0.4, spread: 4.0, hem: [0.66, 0.58], gap: 0.024, flare: 0.24 },
  },
  lamellar: {
    peytral: { centre: 0.3, spread: 3.4, top: [0.87, 0.97, 0.93], hem: [0.66, 0.6], gap: 0.026, flare: 0.22 },
    flanchard: { x: [-0.32, 0.4], top: 0.84, hem: 0.44, gap: 0.03, flare: 0.2 },
    crupper: { centre: -0.4, spread: 4.0, hem: [0.6, 0.46], gap: 0.03, flare: 0.36 },
  },
};
// (The brigandine bard is cut as the lamellar one: the same pieces, down below the belly.)
BARD_FIT.brigandine = BARD_FIT.lamellar;
// (The Ming front bard, horses.js BARDING.mingFront: the face, the neck, and the breast's apron hanging to the forearms;
// `front`: no skirt along the flanks, no crupper.)
BARD_FIT.mingFront = { ...BARD_FIT.lamellar, peytral: { ...BARD_FIT.lamellar.peytral, hem: [0.42, 0.5] }, front: true };

// ---- Casting over the horse ---------------------------------------------------------------------------------------------

/** The triangles of some meshes ({p, i}), each its 9 numbers; `turns` copies the neck's turned about its pivot. */
function bdTriangles(meshes) {
  const out = [];
  for (const { p, i } of meshes) for (let k = 0; k < i.length; k += 1) out.push(p[i[k] * 3], p[i[k] * 3 + 1], p[i[k] * 3 + 2]);
  return Float64Array.from(out);
}

/** A mesh turned about z through `pivot` by `angle` (the neck nodding). */
function bdTurned(mesh, pivot, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const p = mesh.p.slice();
  for (let v = 0; v < p.length; v += 3) {
    const dx = mesh.p[v] - pivot[0];
    const dy = mesh.p[v + 1] - pivot[1];
    p[v] = pivot[0] + dx * cos - dy * sin;
    p[v + 1] = pivot[1] + dx * sin + dy * cos;
  }
  return { p, i: mesh.i };
}

/** The furthest a ray from `o` along unit `d` meets the triangles (Möller–Trumbore), or null. */
function bdCast(tris, o, d) {
  let best = -1;
  for (let b = 0; b < tris.length; b += 9) {
    const e1x = tris[b + 3] - tris[b];
    const e1y = tris[b + 4] - tris[b + 1];
    const e1z = tris[b + 5] - tris[b + 2];
    const e2x = tris[b + 6] - tris[b];
    const e2y = tris[b + 7] - tris[b + 1];
    const e2z = tris[b + 8] - tris[b + 2];
    const px = d[1] * e2z - d[2] * e2y;
    const py = d[2] * e2x - d[0] * e2z;
    const pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const tx = o[0] - tris[b];
    const ty = o[1] - tris[b + 1];
    const tz = o[2] - tris[b + 2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t > 1e-6 && t > best) best = t;
  }
  return best > 0 ? best : null;
}

// ---- Shells with texture coordinates ------------------------------------------------------------------------------------

/**
 * A shell over a grid of points (`cols` + 1 across by `rows` + 1 down, `at(i, j)`), wound outward (away from `inside`),
 * with texture coordinates in a tile's units: u across (metres along the row over the tile's width), v up (metres down the
 * column, negated, over its height). `keep(i, j)` false leaves a cell out. Returns the primitive and its grid.
 */
function bdGridShell(ctx, { cols, rows, at, inside, tile = null, color, keep = null }) {
  const W = ctx.W;
  const [tu, tv] = tile ? ctx.tileSize(tile) : [1, 1];
  const grid = [];
  for (let j = 0; j <= rows; j += 1) for (let i = 0; i <= cols; i += 1) grid.push(at(i, j));
  const point = (i, j) => grid[j * (cols + 1) + i];
  const prim = { p: [], c: [], n: [], i: [], uv: [] };
  const along = new Array((cols + 1) * (rows + 1)).fill(0);
  const down = new Array((cols + 1) * (rows + 1)).fill(0);
  for (let j = 0; j <= rows; j += 1) for (let i = 1; i <= cols; i += 1) along[j * (cols + 1) + i] = along[j * (cols + 1) + i - 1] + vec.length(vec.sub(point(i, j), point(i - 1, j)));
  for (let i = 0; i <= cols; i += 1) for (let j = 1; j <= rows; j += 1) down[j * (cols + 1) + i] = down[(j - 1) * (cols + 1) + i] + vec.length(vec.sub(point(i, j), point(i, j - 1)));
  grid.forEach((p, k) => {
    prim.p.push(...p);
    prim.c.push(...(typeof color === 'function' ? color(k % (cols + 1), Math.floor(k / (cols + 1)), p) : color));
    prim.uv.push((along[k] * W) / tu, (-down[k] * W) / tv);
  });
  // Which way round faces out: the middle cell's normal against the way out from the inside.
  const mi = Math.floor(cols / 2);
  const mj = Math.floor(rows / 2);
  const normal = vec.cross(vec.sub(point(mi + 1, mj), point(mi, mj)), vec.sub(point(mi, mj + 1), point(mi, mj)));
  const outward = vec.sub(point(mi, mj), typeof inside === 'function' ? inside(mi, mj) : inside);
  const flip = vec.dot(normal, outward) < 0;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      if (keep && !keep(i, j)) continue;
      const a = j * (cols + 1) + i;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      if (flip) prim.i.push(a, c, b, b, c, d);
      else prim.i.push(a, b, c, b, d, c);
    }
  }
  ctx.prims.hmSmoothen(prim);
  return { prim, point, normalAt: (i, j) => {
    const k = (j * (cols + 1) + i) * 3;
    return [prim.n[k], prim.n[k + 1], prim.n[k + 2]];
  } };
}

/**
 * A strip along an edge of a shell (its row or column of points `edge`, the next one in `inward`, their outward normals):
 * the turned and roped edge of a plate (the `harnessEdge` tile: v 0 at the edge, 1 inward over `depth` metres), standing
 * `lift` off the plate. Segments where `skip(k)` are left out.
 */
function bdEdgeStrip(ctx, edge, inward, normals, { depth = 0.025, lift = 0.0025, tile = 'harnessEdge', color, skip = null, offset = 0 }) {
  const W = ctx.W;
  const [tu] = ctx.tileSize(tile);
  const prim = { p: [], c: [], n: [], i: [], uv: [] };
  let run = offset;
  edge.forEach((p, k) => {
    if (k > 0) run += vec.length(vec.sub(p, edge[k - 1])) * W;
    const inwardDir = vec.normalize(vec.sub(inward[k], p));
    const n = normals[k];
    const lifted = vec.add(p, vec.scale(n, lift));
    prim.p.push(...lifted, ...vec.add(lifted, vec.scale(inwardDir, depth / W)));
    prim.c.push(...color, ...color);
    prim.n.push(...n, ...n);
    prim.uv.push(run / tu, 0, run / tu, 1);
  });
  for (let k = 0; k < edge.length - 1; k += 1) {
    if (skip && skip(k)) continue;
    const a = k * 2;
    const quad = [a, a + 2, a + 1, a + 1, a + 2, a + 3];
    // Facing as the normals say.
    const e1 = vec.sub(edge[k + 1], edge[k]);
    const e2 = vec.sub(inward[k], edge[k]);
    const facing = vec.dot(vec.cross(e1, e2), normals[k]) > 0;
    prim.i.push(...(facing ? quad : [a, a + 1, a + 2, a + 1, a + 3, a + 2]));
  }
  return prim;
}

/** A dome (a boss, an eye guard): `radius` across, `height` out along `axis` from `centre`; `keep(ring, k)` pierces it. */
function bdDome(ctx, centre, axis, radius, height, { rings = 5, sides = 14, color, keep = null, tile = null }) {
  const n = vec.normalize(axis);
  const probe = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = vec.normalize(vec.cross(probe, n));
  const e2 = vec.cross(n, e1);
  return bdGridShell(ctx, {
    cols: sides,
    rows: rings,
    tile,
    inside: vec.sub(centre, vec.scale(n, radius)),
    color,
    keep: keep ? (k, ring) => keep(ring, k) : null,
    at: (k, ring) => {
      const phi = (ring / rings) * (Math.PI / 2);
      const theta = (k / sides) * BD_TAU;
      const r = radius * Math.sin(phi);
      const up = height * Math.cos(phi);
      return vec.add(centre, vec.add(vec.scale(n, up), vec.add(vec.scale(e1, r * Math.cos(theta)), vec.scale(e2, r * Math.sin(theta)))));
    },
  }).prim;
}

/** A cloth fringe hung below a hem (its points, their outward normals): tongues `length` long, two to a segment. */
function bdFringe(edge, normals, { length = 0.035, color, lift = 0.004, skip = null }) {
  const prim = { p: [], c: [], n: [], i: [] };
  for (let k = 0; k < edge.length - 1; k += 1) {
    if (skip && skip(k)) continue;
    const a = vec.add(edge[k], vec.scale(normals[k], lift));
    const b = vec.add(edge[k + 1], vec.scale(normals[k + 1], lift));
    for (const [s0, s1] of [[0, 0.5], [0.5, 1]]) {
      const p0 = vec.lerp(a, b, s0);
      const p1 = vec.lerp(a, b, s1);
      const tip = vec.add(vec.lerp(p0, p1, 0.5), [0, -length, 0]);
      const base = prim.p.length / 3;
      prim.p.push(...p0, ...p1, ...vec.add(p0, [0, -length * 0.55, 0]), ...vec.add(p1, [0, -length * 0.55, 0]), ...tip);
      for (let v = 0; v < 5; v += 1) {
        prim.c.push(...bdScale3(color, 0.9 + 0.1 * ((k + v) % 2)));
        prim.n.push(...normals[k]);
      }
      // Both faces (the fringe is cloth, seen from either side).
      prim.i.push(base, base + 2, base + 1, base + 1, base + 2, base + 3, base + 2, base + 4, base + 3);
      prim.i.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
    }
  }
  return prim;
}

// ---- The pieces' plans ---------------------------------------------------------------------------------------------------

/**
 * A draped piece: for each column `i` (0..cols) and row `j` (0..rows, top to hem) `ray(i, j)` gives an origin inside
 * the horse, a unit direction and whether the row hangs (below the barrel's widest); the plate lies `gap` beyond the
 * furthest surface the ray meets, and a hanging row no nearer in than the row above it plus its `flare` per unit it fell.
 */
function bdDrape(ctx, { cols, rows, ray, gap, flare }) {
  const grid = [];
  const origins = [];
  for (let i = 0; i <= cols; i += 1) {
    let previous = null;
    let previousOrigin = null;
    for (let j = 0; j <= rows; j += 1) {
      const { o, d, hang } = ray(i, j);
      const hit = ctx.cast(o, d);
      let r = hit === null ? previous ?? 0.15 : hit + gap;
      if (hang && previous !== null) r = Math.max(r, previous + flare * vec.length(vec.sub(o, previousOrigin)));
      grid[j * (cols + 1) + i] = vec.add(o, vec.scale(d, r));
      origins[j * (cols + 1) + i] = o;
      previous = r;
      previousOrigin = o;
    }
  }
  return { at: (i, j) => grid[j * (cols + 1) + i], inside: (i, j) => origins[j * (cols + 1) + i] };
}

/** Rows of a piece that runs round a vertical axis: the top `upper` rows fan up over the back, the rest hang to the hem. */
function bdRoundPlan({ centre, axisY, around, top, hem, upper, rows, lift }) {
  return (i, j, cols) => {
    const phi = around(i / cols);
    const dir = [Math.cos(phi), 0, Math.sin(phi)];
    const share = i / cols;
    if (j < upper) {
      // Rays fanned from over the back down to the level (psi: the elevation).
      const psi = lift(share) * (1 - j / upper);
      return { o: [centre(share), axisY, 0], d: vec.normalize([dir[0] * Math.cos(psi), Math.sin(psi), dir[2] * Math.cos(psi)]), hang: false };
    }
    const y = bdMix(Math.min(axisY, top(share)), hem(share), (j - upper) / (rows - upper));
    return { o: [centre(share), y, 0], d: dir, hang: true };
  };
}

// ---- The bard ---------------------------------------------------------------------------------------------------------------

/**
 * Build a horse's bard into its parts: `ctx` from horsemesh.js buildHorseModel ({ spec, build, low, W, bodyFn, neckFn,
 * headFn, poll, neckPivot, tailRoot, colliders, prims, tileSize, add(part, kind, prim) }), `kind` 'plate', 'lamellar' or 'brigandine'.
 * `add` takes 'metal' (plain steel), 'soft' (leather, cloth, plume) or 'detail:<tile>' (a shell carrying a tile's maps).
 */
export function buildBard(ctx, kind) {
  const { low, bodyFn, neckFn, headFn, prims } = ctx;
  const plate = kind === 'plate';
  const fit = BARD_FIT[kind];
  const style = ctx.spec.style ?? 'plain';
  const laced = plate ? null : BARD_TILES[kind] ?? BARD_TILES.lamellar;
  const field = plate ? BARD_TILES.plate[style] ?? 'plate' : laced.field;
  // (A brigandine's facing is coloured by its material, the rider's cloth: horseview.js bardMaterial; drawn here white.)
  const studded = kind === 'brigandine' || kind === 'mingFront';
  const steel = plate ? [0.97, 0.98, 1] : studded ? [0.96, 0.96, 0.96] : [0.66, 0.67, 0.7];
  const edgeSteel = [0.9, 0.91, 0.94];
  const leather = [0.16, 0.1, 0.07];
  const cloth = ctx.dyed ? bdScale3(ctx.dyed, 0.7) : [0.22, 0.16, 0.12];
  const shade = (base) => (i, j, p) => bdScale3(base, 0.95 + 0.05 * Math.sin(p[0] * 21 + p[1] * 13));
  const detail = (part, tile, prim) => ctx.add(part, `detail:${tile}`, prim);
  const d = low ? 0.5 : 1;
  const count = (n) => Math.max(2, Math.round(n * d));
  // What was built, piece by piece (triangles), and every point of it by the part that carries it (horse units).
  const pieces = {};
  const points = { body: [], neck: [], head: [] };
  let piece = null;
  const put = ctx.add;
  ctx.add = (part, kind, prim) => {
    pieces[piece] = (pieces[piece] ?? 0) + prim.i.length / 3;
    for (let k = 0; k < prim.p.length; k += 1) points[part].push(prim.p[k]);
    put(part, kind, prim);
  };

  // Every neck pose the gait gives (horseview.js: down to ~-0.27 rad at the gallop, up a little at rest).
  const tris = bdTriangles([ctx.colliders.body, ctx.colliders.dock, ...[-0.3, -0.15, 0, 0.06].map((angle) => bdTurned(ctx.colliders.neck, ctx.neckPivot, angle))]);
  ctx.cast = (o, dir) => bdCast(tris, o, dir);

  /** A finished draped shell: the field, its turned edges top and bottom, a fringe below (lamellar). */
  const drapedPiece = (part, { cols, rows, ray, gap, flare, keep = null, edges = ['top', 'hem'], fringe = false, trim = false }) => {
    const plan = bdDrape(ctx, { cols, rows, ray, gap, flare });
    const kept = keep ? (i, j) => keep(i, j, plan.at) : null;
    const shell = bdGridShell(ctx, { cols, rows, at: plan.at, inside: plan.inside, tile: field, color: shade(steel), keep: kept });
    detail(part, field, shell.prim);
    for (const side of edges) {
      const j = side === 'top' ? 0 : rows;
      const jIn = side === 'top' ? 1 : rows - 1;
      const edge = [];
      const inward = [];
      const normals = [];
      for (let i = 0; i <= cols; i += 1) {
        edge.push(plan.at(i, j));
        inward.push(plan.at(i, jIn));
        normals.push(shell.normalAt(i, j));
      }
      const skip = kept ? (i) => !kept(i, side === 'top' ? 0 : rows - 1) : null;
      if (plate) detail(part, BARD_TILES.plate.edge, bdEdgeStrip(ctx, edge, inward, normals, { color: edgeSteel, skip }));
      else if (trim) ctx.add(part, 'soft', bdEdgeStrip(ctx, edge, inward, normals, { depth: 0.035, lift: 0.003, tile: 'harnessEdge', color: leather, skip }));
      if (fringe && side === 'hem' && !low) ctx.add(part, 'soft', bdFringe(edge, normals, { color: cloth, skip }));
    }
    return { plan, shell };
  };

  // ---- Peytral: round the breast from shoulder to shoulder.
  piece = 'peytral';
  const pey = fit.peytral;
  const peyCols = count(plate ? 30 : 26);
  const peyRows = count(12);
  const peyAround = (s) => (s - 0.5) * pey.spread;
  // Its top edge round the base of the neck: low in front of it, up over the points of the shoulders, down again at the wings.
  const peyTop = (s) => {
    const phi = Math.abs(peyAround(s));
    return phi < 0.9 ? bdMix(pey.top[0], pey.top[1], bdSmooth(phi / 0.9)) : bdMix(pey.top[1], pey.top[2], bdSmooth((phi - 0.9) / 0.85));
  };
  // The hem high over the forearms (|phi| under ~60 degrees), lower at the sides behind them.
  const peyHem = (s) => bdMix(pey.hem[0], pey.hem[1], bdSmooth((Math.abs(peyAround(s)) - 0.95) / 0.5));
  const peyRay = (i, j) => {
    const s = i / peyCols;
    const phi = peyAround(s);
    const y = bdMix(peyTop(s), peyHem(s), j / peyRows);
    return { o: [pey.centre, y, 0], d: [Math.cos(phi), 0, Math.sin(phi)], hang: y < 0.8 };
  };
  const peytral = drapedPiece('body', { cols: peyCols, rows: peyRows, ray: peyRay, gap: pey.gap, flare: pey.flare, fringe: !plate, trim: !plate });
  if (plate && !low) {
    // The two bosses over the points of the shoulders, the medial ridge down the breast.
    piece = 'bosses';
    for (const s of [0.5 - 0.18, 0.5 + 0.18]) {
      const i = Math.round(s * peyCols);
      const j = Math.round(peyRows * 0.45);
      const at = peytral.plan.at(i, j);
      const n = peytral.shell.normalAt(i, j);
      ctx.add('body', 'metal', bdDome(ctx, vec.add(at, vec.scale(n, -0.004)), n, 0.068, 0.05, { rings: 6, sides: 16, color: (k, ring) => bdScale3(steel, ring % 2 ? 0.86 : 1) }));
    }
    piece = 'peytral';
    const ridge = [];
    for (let j = 0; j <= peyRows; j += 1) ridge.push(vec.add(peytral.plan.at(peyCols / 2, j), vec.scale(peytral.shell.normalAt(peyCols / 2, j), 0.004)));
    ctx.add('body', 'metal', prims.hmTube(ridge, ridge.map(() => 0.007), { sides: 5, color: edgeSteel }));
  }

  // (A front bard has neither: the flanks and the hindquarters bare.)
  if (!fit.front) {
    // ---- Flanchards (plate) under the saddle; the lamellar body skirt from the breast to the rump, below the belly.
    const fl = fit.flanchard;
    piece = plate ? 'flanchards' : 'skirt';
    const flCols = count(plate ? 9 : 18);
    const flRows = count(plate ? 7 : 12);
    for (const side of [1, -1]) {
      const ray = (i, j) => {
        const x = bdMix(fl.x[1], fl.x[0], i / flCols);
        const y = bdMix(fl.top, fl.hem, j / flRows);
        return { o: [x, y, 0], d: [0, 0, side], hang: y < 0.78 };
      };
      drapedPiece('body', { cols: flCols, rows: flRows, ray, gap: fl.gap, flare: fl.flare, edges: plate ? ['hem'] : ['top', 'hem'], fringe: !plate, trim: !plate });
    }

    // ---- Crupper: over the croup and round the buttocks, split under the tail; a tail guard over the dock.
    const cr = fit.crupper;
    piece = 'crupper';
    const crCols = count(plate ? 32 : 30);
    const crRows = count(14);
    const upper = count(5);
    const crAround = (s) => Math.PI + (s - 0.5) * cr.spread;
    // At its front corners its rays start further forward, so its front edge meets the cantle.
    const crCentre = (s) => cr.centre + 0.14 * bdSmooth((Math.abs(s - 0.5) * 2 - 0.5) / 0.5);
    const crHem = (s) => bdMix(cr.hem[0], cr.hem[1], bdSmooth((Math.abs(s - 0.5) * cr.spread - 0.8) / 0.5));
    const plan = bdRoundPlan({ centre: crCentre, axisY: 0.8, around: crAround, top: () => 0.8, hem: crHem, upper, rows: crRows, lift: (s) => bdMix(1.35, 1.1, Math.abs(s - 0.5) * 2) });
    const tailY = ctx.tailRoot[1];
    const slot = (i, j, at) => {
      // The tail's slot: the middle columns, from the dock down.
      const phi = Math.abs(((i + 0.5) / crCols - 0.5) * cr.spread);
      const y = (at(i, j)[1] + at(i + 1, j + 1)[1]) / 2;
      return !(phi < 0.17 && y < tailY + 0.02);
    };
    drapedPiece('body', { cols: crCols, rows: crRows, ray: (i, j) => plan(i, j, crCols), gap: cr.gap, flare: cr.flare, keep: slot, edges: ['hem'], fringe: !plate, trim: !plate });
    if (plate && !low) {
      // The crupper's ridge along the spine, from behind the cantle to the tail guard.
      const spine = [];
      for (let k = 0; k <= 8; k += 1) {
        const x = bdMix(-0.3, -0.62, k / 8);
        const top = bodyFn(x, Math.PI / 2, 0);
        const hit = ctx.cast([x, top[1] - 0.15, 0], [0, 1, 0]);
        spine.push([x, top[1] - 0.15 + (hit ?? 0.15) + cr.gap + 0.006, 0]);
      }
      ctx.add('body', 'metal', prims.hmTube(spine, spine.map(() => 0.008), { sides: 5, color: edgeSteel }));
    }
  }

  // ---- Crinet (the neck): plate lames down the crest and upper sides with mail under the throat; or lamellae all round.
  const neckSpan = [0.05, 0.96];
  piece = 'crinet';
  if (plate) {
    const lames = count(9);
    for (let k = 0; k < lames; k += 1) {
      const t0 = bdMix(neckSpan[0], neckSpan[1], k / lames);
      const t1 = bdMix(neckSpan[0], neckSpan[1], (k + 1) / lames) + 0.025;
      const cols = count(12);
      const shell = bdGridShell(ctx, {
        cols, rows: 2, tile: field, color: shade(bdScale3(steel, k % 2 ? 0.95 : 1)),
        inside: neckFn((t0 + t1) / 2, Math.PI / 2, -0.04),
        // Each lame's lower edge stands over the head of the next (lapping towards the withers).
        at: (i, j) => neckFn(bdMix(t1, t0, j / 2), bdMix(0.32, Math.PI - 0.32, i / cols), 0.016 + 0.007 * (j / 2)),
      });
      detail('neck', field, shell.prim);
      if (!low) {
        // Each lame's lower edge turned.
        const edge = [];
        const inward = [];
        const normals = [];
        for (let i = 0; i <= cols; i += 1) {
          edge.push(shell.point(i, 2));
          inward.push(shell.point(i, 1));
          normals.push(shell.normalAt(i, 2));
        }
        detail('neck', BARD_TILES.plate.edge, bdEdgeStrip(ctx, edge, inward, normals, { color: edgeSteel, depth: 0.018 }));
      }
    }
    piece = 'mail';
    // Mail under the throat and down the lower sides (Met's bard: mail between the crinet's lames and the throat).
    const mailCols = count(12);
    const mail = bdGridShell(ctx, {
      cols: mailCols, rows: count(8), tile: BARD_TILES.plate.mail, color: [0.8, 0.81, 0.84], inside: neckFn(0.5, -Math.PI / 2, -0.05),
      at: (i, j) => neckFn(bdMix(0.0, 0.92, j / count(8)), bdMix(Math.PI - 0.5, BD_TAU + 0.5, i / mailCols), 0.01),
    });
    detail('neck', BARD_TILES.plate.mail, mail.prim);
  } else {
    const cols = count(18);
    const rows = count(9);
    const shell = bdGridShell(ctx, {
      cols, rows, tile: field, color: shade(steel), inside: (i, j) => neckFn(bdMix(neckSpan[0], neckSpan[1], 1 - j / rows), 0, -0.2),
      at: (i, j) => neckFn(bdMix(neckSpan[1], neckSpan[0], j / rows), -Math.PI / 2 + (i / cols) * BD_TAU, 0.018 + 0.006 * Math.sin((j / rows) * Math.PI)),
    });
    detail('neck', field, shell.prim);
    if (!low) {
      // A leather binding round its edge at the head.
      const edge = [];
      const inward = [];
      const normals = [];
      for (let i = 0; i <= cols; i += 1) {
        edge.push(shell.point(i, 0));
        inward.push(shell.point(i, 1));
        normals.push(shell.normalAt(i, 0));
      }
      ctx.add('neck', 'soft', bdEdgeStrip(ctx, edge, inward, normals, { depth: 0.03, color: leather }));
    }
  }

  // ---- The face: the shaffron (plate), or an iron brow plate over a lamellar face.
  piece = plate ? 'shaffron' : 'face';
  const eyeT = 0.115;
  const eyeA = 0.62;
  const eyeHole = (x, a) => Math.min(Math.hypot((x - eyeT) / 0.04, (a - eyeA) / 0.42), Math.hypot((x - eyeT) / 0.04, (a - (Math.PI - eyeA)) / 0.42)) > 1;
  const faceCols = count(14);
  const faceRows = count(14);
  const faceA = [0.32, Math.PI - 0.32];
  const facePiece = (x0, x1, tile, color, infl) => {
    const rows = Math.max(2, Math.round(faceRows * (x1 - x0) / 0.33));
    const shell = bdGridShell(ctx, {
      cols: faceCols, rows, tile, color, inside: headFn((x0 + x1) / 2, Math.PI / 2, -0.06),
      keep: (i, j) => eyeHole(bdMix(x0, x1, (j + 0.5) / rows), bdMix(faceA[0], faceA[1], (i + 0.5) / faceCols)),
      at: (i, j) => headFn(bdMix(x0, x1, j / rows), bdMix(faceA[0], faceA[1], i / faceCols), infl),
    });
    detail('head', tile, shell.prim);
    return { shell, rows };
  };
  if (plate) {
    const face = facePiece(-0.01, 0.325, field, shade(steel), 0.013);
    if (!low) {
      // Its edges turned: down each cheek and across the muzzle.
      for (const i of [0, faceCols]) {
        const edge = [];
        const inward = [];
        const normals = [];
        for (let j = 0; j <= face.rows; j += 1) {
          edge.push(face.shell.point(i, j));
          inward.push(face.shell.point(i === 0 ? 1 : faceCols - 1, j));
          normals.push(face.shell.normalAt(i, j));
        }
        detail('head', BARD_TILES.plate.edge, bdEdgeStrip(ctx, edge, inward, normals, { color: edgeSteel, depth: 0.02 }));
      }
    }
  } else {
    // The brow plate of iron, the face below it in lamellae.
    facePiece(-0.01, 0.14, laced.brow, [0.5, 0.5, 0.53], 0.016);
    facePiece(0.13, 0.32, field, shade(steel), 0.012);
  }
  if (!low) {
    for (const sign of [1, -1]) {
      piece = 'eyeGuards';
      // The eye guards: domed, pierced in rows of slots (plate); a plain rim (lamellar).
      const eye = headFn(eyeT, sign > 0 ? eyeA : Math.PI - eyeA, 0.012);
      const out = vec.normalize(vec.sub(eye, headFn(eyeT, sign > 0 ? eyeA : Math.PI - eyeA, -0.03)));
      if (plate) {
        ctx.add('head', 'metal', bdDome(ctx, vec.add(eye, vec.scale(out, -0.004)), out, 0.04, 0.03, { rings: 5, sides: 14, color: steel, keep: (ring, k) => !(ring >= 1 && ring <= 3 && k % 2 === 0) }));
      } else {
        ctx.add('head', 'metal', prims.hmRing(eye, out, 0.034, 0.005, { color: [0.5, 0.5, 0.53] }));
      }
      // Ear cups (plate): short tubes round the ears' roots.
      if (plate) {
        piece = 'earCups';
        const base = headFn(0.0, Math.PI / 2, 0.0);
        const root = [base[0] - 0.006, base[1] + 0.012, sign * 0.036];
        ctx.add('head', 'metal', prims.hmTube([root, [root[0] - 0.006, root[1] + 0.03, sign * 0.04], [root[0] - 0.01, root[1] + 0.05, sign * 0.043]], [0.028, 0.027, 0.025], { sides: 8, color: steel, round: false }));
      }
    }
    // The rondel on the brow (with a spike on the lamellar face), and the plume holder at the poll with its plume.
    piece = 'brow';
    const brow = headFn(0.06, Math.PI / 2, 0.014);
    const browOut = vec.normalize(vec.sub(brow, headFn(0.06, Math.PI / 2, -0.03)));
    ctx.add('head', 'metal', bdDome(ctx, brow, browOut, 0.03, 0.012, { rings: 3, sides: 12, color: plate ? edgeSteel : [0.62, 0.5, 0.3] }));
    if (!plate) ctx.add('head', 'metal', prims.hmCone(vec.add(brow, vec.scale(browOut, 0.01)), vec.add(brow, vec.scale(browOut, 0.07)), 0.012, { sides: 6, color: [0.55, 0.55, 0.58] }));
    const poll = headFn(0.012, Math.PI / 2, 0.016);
    const socket = [poll[0] - 0.012, poll[1] + 0.05, 0];
    ctx.add('head', 'metal', prims.hmTube([poll, socket], [0.009, 0.011], { sides: 6, color: edgeSteel }));
    piece = 'plume';
    const plume = { p: [], c: [], n: [], i: [] };
    const feather = plate ? (ctx.dyed ? bdScale3(ctx.dyed, 0.8) : [0.08, 0.07, 0.07]) : studded ? [0.62, 0.06, 0.07] : [0.45, 0.28, 0.14];
    for (let k = 0; k < 5; k += 1) {
      const lean = (k - 2) * 0.28;
      const tip = [socket[0] - 0.09 - 0.03 * Math.abs(k - 2), socket[1] + 0.2 - 0.03 * Math.abs(k - 2), Math.sin(lean) * 0.09];
      const mid = vec.lerp(socket, tip, 0.5);
      const base = plume.p.length / 3;
      const wide = [0, 0, 0.025];
      plume.p.push(...socket, ...vec.add(mid, wide), ...vec.sub(mid, wide), ...tip);
      // (Lit as from its side: a feather is seen from either.)
      const facing = vec.normalize(vec.cross(vec.sub(tip, socket), wide));
      for (let v = 0; v < 4; v += 1) {
        plume.c.push(...bdScale3(feather, 1 - 0.1 * (k % 2)));
        plume.n.push(...facing);
      }
      plume.i.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
    ctx.add('head', 'soft', plume);
  }
  ctx.add = put;
  return { kind, style: plate ? style : null, pieces, points: { body: Float32Array.from(points.body), neck: Float32Array.from(points.neck), head: Float32Array.from(points.head) } };
}
