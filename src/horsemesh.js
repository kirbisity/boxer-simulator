// A horse's body as meshes: pure geometry (arrays, no three.js), built once
// per breed, barding, coat and level of detail and reused by every horse that
// looks the same (src/horseview.js turns it into three.js meshes and moves it).
//
// Drawn in units of the horse's height at the withers (W = 1; x forward, y up,
// z to its left, the origin on the ground under its middle), scaled to metres
// at the end. The body is a few lofts (rings of ellipses along a line): the
// barrel with its chest, withers, dip of the back, croup and rump; the neck
// from a crest line and a throat line; the head along its own axis; each leg
// in segments that bend at the knee (or hock), the fetlock and the hoof.
// Muscle on the shoulder and haunch, the tack, and the barding are built over
// the same surfaces (`bodyFn`, `neckFn`, `headFn` give a point at any place
// and angle, inflated by a thickness), so a plate lies on the horse that
// wears it. What moves (mane, tail, the cloth trapper) is described here
// (where it is hung, its colour, its triangles) and run by the view.

import { vec } from './pose.js';

const TAU = Math.PI * 2;
const hmClamp = (value, low, high) => Math.max(low, Math.min(high, value));
const hmMix = (a, b, t) => a + (b - a) * t;
const hmSmooth = (t) => t * t * (3 - 2 * t);
const hmLerp3 = (a, b, t) => [hmMix(a[0], b[0], t), hmMix(a[1], b[1], t), hmMix(a[2], b[2], t)];
const hmScale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

/** A repeatable random stream from a seed. */
export function horseRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth curve through the rows of a table [x, ...values], at x (cubic Hermite, finite-difference tangents). */
function hmCurve(table, x) {
  const n = table.length;
  if (x <= table[0][0]) return table[0].slice(1);
  if (x >= table[n - 1][0]) return table[n - 1].slice(1);
  let i = 0;
  while (x > table[i + 1][0]) i += 1;
  const a = table[i];
  const b = table[i + 1];
  const p = table[Math.max(0, i - 1)];
  const q = table[Math.min(n - 1, i + 2)];
  const h = b[0] - a[0];
  const t = (x - a[0]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const out = [];
  for (let k = 1; k < a.length; k += 1) {
    const m0 = ((b[k] - p[k]) / (b[0] - p[0] || 1)) * h;
    const m1 = ((q[k] - a[k]) / (q[0] - a[0] || 1)) * h;
    out.push((2 * t3 - 3 * t2 + 1) * a[k] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * b[k] + (t3 - t2) * m1);
  }
  return out;
}

// ---- Looks of the breeds --------------------------------------------------------

/**
 * How each breed differs in the drawing (shapes in units of its withers):
 * `bulk` of the body and limbs, `deep` the chest's depth added, `neck`
 * (bulk, arch of the crest), `head` (length, dish of the face: negative is a
 * Roman nose, size), `feather` the hair on the fetlocks, `mane` (length,
 * upright share), `tail` (length, carriage of the dock: the angles each
 * segment lies at, below the horizontal, rad), `saddle` its style.
 */
export const HORSE_BUILD = {
  destrier: { bulk: 1.2, deep: 0.03, back: 1, neck: { bulk: 1.3, arch: 0.03 }, head: { length: 1.04, dish: -0.012, size: 1.1 }, legs: 1.22, feather: 1, mane: { length: 0.24, upright: 0.1 }, tail: { length: 0.52, carriage: [0.7, 1.15, 1.4, 1.5, 1.55], lift: 0.5 }, saddle: 'war', headAngle: 0.74 },
  warhorse: { bulk: 1.02, deep: 0.01, back: 1, neck: { bulk: 1.02, arch: 0.04 }, head: { length: 1, dish: 0, size: 1 }, legs: 1, feather: 0.3, mane: { length: 0.22, upright: 0.08 }, tail: { length: 0.5, carriage: [0.6, 1.05, 1.35, 1.5, 1.55], lift: 0.7 }, saddle: 'war', headAngle: 0.78 },
  arabian: { bulk: 0.9, deep: 0, back: 0.93, neck: { bulk: 0.88, arch: 0.07 }, head: { length: 0.92, dish: 0.014, size: 0.9 }, legs: 0.86, feather: 0, mane: { length: 0.27, upright: 0.04 }, tail: { length: 0.5, carriage: [-0.55, -0.15, 0.3, 0.75, 1.1], lift: 1 }, saddle: 'light', headAngle: 0.95 },
  steppe: { bulk: 1.08, deep: 0.012, back: 0.97, neck: { bulk: 1.1, arch: -0.01 }, head: { length: 1.05, dish: -0.004, size: 1.08 }, legs: 1.06, feather: 0.2, mane: { length: 0.2, upright: 0.4 }, tail: { length: 0.58, carriage: [0.55, 1, 1.3, 1.45, 1.55], lift: 0.6 }, saddle: 'steppe', headAngle: 0.62 },
  japanese: { bulk: 1.1, deep: 0.014, back: 0.96, neck: { bulk: 1.08, arch: 0 }, head: { length: 1.04, dish: 0, size: 1.08 }, legs: 1.08, feather: 0.1, mane: { length: 0.2, upright: 0.3 }, tail: { length: 0.5, carriage: [0.6, 1.05, 1.35, 1.5, 1.55], lift: 0.6 }, saddle: 'kura', headAngle: 0.66 },
};

/** Saddles: the height of pommel and cantle above the seat, the length and the half-width of the tree, the flap's drop. */
const HM_SADDLES = {
  war: { pommel: 0.085, cantle: 0.115, length: 0.34, width: 0.085, flap: 1.1, leather: [0.33, 0.2, 0.12], trim: [0.55, 0.43, 0.2] },
  light: { pommel: 0.06, cantle: 0.07, length: 0.3, width: 0.08, flap: 0.9, leather: [0.42, 0.26, 0.14], trim: [0.6, 0.5, 0.25] },
  steppe: { pommel: 0.075, cantle: 0.085, length: 0.3, width: 0.078, flap: 0.8, leather: [0.3, 0.2, 0.12], trim: [0.5, 0.4, 0.2] },
  kura: { pommel: 0.12, cantle: 0.12, length: 0.34, width: 0.09, flap: 0.9, leather: [0.1, 0.07, 0.07], trim: [0.72, 0.58, 0.2] },
};

// ---- Coats ----------------------------------------------------------------------

const HM_WHITE = [0.93, 0.91, 0.86];
const HM_DARK = [0.075, 0.055, 0.05];

function hmHex(hex) {
  const value = typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex;
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/**
 * A horse's coat from the colour of its hide (bay, chestnut, grey, black or
 * dun by that colour) and its seed: dark points on a bay, a dorsal stripe
 * and bars on a dun, dapples on a grey, and its white markings (a star,
 * stripe or blaze on the face, a sock or stocking on a leg), which a black
 * or dun horse seldom has.
 */
export function horseCoat(hex, seed) {
  const body = hmHex(hex);
  const [r, g, b] = body;
  const lum = 0.3 * r + 0.59 * g + 0.11 * b;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  const ratio = g / Math.max(r, 1e-3);
  const type = lum < 0.165 ? 'black' : spread < 0.09 ? 'grey' : ratio > 0.74 ? 'dun' : ratio < 0.66 && lum > 0.2 ? 'chestnut' : lum < 0.3 ? 'bay' : 'chestnut';
  const random = horseRandom(seed * 2654435761 + 12345);
  const plain = type === 'black' || type === 'dun';
  const face = random();
  const blaze = plain && face < 0.7 ? 0 : face < 0.35 ? 0 : face < 0.6 ? 1 : face < 0.82 ? 2 : 3;
  const socks = [0, 1, 2, 3].map(() => {
    const roll = random();
    return type === 'grey' ? 0 : roll < (plain ? 0.85 : 0.68) ? 0 : roll < (plain ? 0.95 : 0.88) ? 2 : 3;
  });
  const flaxen = type === 'chestnut' && random() < 0.35;
  let points = body;
  let mane = body;
  if (type === 'bay' || type === 'dun') points = HM_DARK;
  if (type === 'black') points = hmScale3(body, 0.8);
  if (type === 'grey') points = hmScale3(body, 0.72);
  mane = type === 'chestnut' ? (flaxen ? hmLerp3(body, [0.82, 0.68, 0.42], 0.75) : hmScale3(body, 0.82)) : type === 'grey' ? hmScale3(body, 0.88) : points;
  return {
    type, body, points, mane, belly: hmLerp3(body, [0.82, 0.76, 0.66], type === 'black' ? 0.06 : 0.18),
    muzzle: type === 'grey' ? [0.28, 0.25, 0.25] : [0.17, 0.13, 0.12], hoof: type === 'grey' || socks.some(Boolean) ? [0.2, 0.17, 0.15] : [0.13, 0.11, 0.1],
    blaze, socks, dapple: type === 'grey' ? 0.07 : 0.015, stripe: type === 'dun', bars: type === 'dun',
  };
}

// ---- Mesh primitives -------------------------------------------------------------

/** A growing mesh: positions, colours, triangles (and normals when flat or smoothed). */
function hmAcc() {
  return { p: [], c: [], n: [], i: [] };
}

function hmAppend(acc, prim) {
  const base = acc.p.length / 3;
  for (let k = 0; k < prim.p.length; k += 1) acc.p.push(prim.p[k]);
  for (let k = 0; k < prim.c.length; k += 1) acc.c.push(prim.c[k]);
  for (let k = 0; k < prim.n.length; k += 1) acc.n.push(prim.n[k]);
  for (let k = 0; k < prim.i.length; k += 1) acc.i.push(prim.i[k] + base);
}

/** Smooth normals for a primitive: each triangle's normal summed into its vertices, vertices at one place sharing. */
function hmSmoothen(prim) {
  const count = prim.p.length / 3;
  const sums = new Float64Array(count * 3);
  for (let t = 0; t < prim.i.length; t += 3) {
    const [a, b, c] = [prim.i[t], prim.i[t + 1], prim.i[t + 2]];
    const e1 = [prim.p[b * 3] - prim.p[a * 3], prim.p[b * 3 + 1] - prim.p[a * 3 + 1], prim.p[b * 3 + 2] - prim.p[a * 3 + 2]];
    const e2 = [prim.p[c * 3] - prim.p[a * 3], prim.p[c * 3 + 1] - prim.p[a * 3 + 1], prim.p[c * 3 + 2] - prim.p[a * 3 + 2]];
    const n = vec.cross(e1, e2);
    for (const v of [a, b, c]) for (let k = 0; k < 3; k += 1) sums[v * 3 + k] += n[k];
  }
  const keyOf = (v) => `${Math.round(prim.p[v * 3] * 2e4)},${Math.round(prim.p[v * 3 + 1] * 2e4)},${Math.round(prim.p[v * 3 + 2] * 2e4)}`;
  const welded = new Map();
  for (let v = 0; v < count; v += 1) {
    const key = keyOf(v);
    const sum = welded.get(key) ?? [0, 0, 0];
    for (let k = 0; k < 3; k += 1) sum[k] += sums[v * 3 + k];
    welded.set(key, sum);
  }
  prim.n = new Array(count * 3);
  for (let v = 0; v < count; v += 1) {
    const sum = vec.normalize(welded.get(keyOf(v)));
    prim.n[v * 3] = sum[0];
    prim.n[v * 3 + 1] = sum[1];
    prim.n[v * 3 + 2] = sum[2];
  }
  return prim;
}

/** Flat normals: every triangle its own vertices and its own normal. */
function hmFlatten(prim) {
  const out = { p: [], c: [], n: [], i: [] };
  for (let t = 0; t < prim.i.length; t += 3) {
    const ids = [prim.i[t], prim.i[t + 1], prim.i[t + 2]];
    const pts = ids.map((v) => [prim.p[v * 3], prim.p[v * 3 + 1], prim.p[v * 3 + 2]]);
    const n = vec.normalize(vec.cross(vec.sub(pts[1], pts[0]), vec.sub(pts[2], pts[0])));
    ids.forEach((v, k) => {
      out.i.push(out.p.length / 3);
      out.p.push(...pts[k]);
      out.c.push(prim.c[v * 3], prim.c[v * 3 + 1], prim.c[v * 3 + 2]);
      out.n.push(...n);
    });
  }
  return out;
}

const hmColorAt = (color, t, a, p) => (typeof color === 'function' ? color(t, a, p) : color);

/**
 * A loft: rings of ellipses along a line. A station has a centre `c`, the
 * direction `u` its ring's upper reach points (extent `top`, and `bot`
 * below), a side direction `s` (half-width `hw`). `color(t, a, point)`
 * paints it (t the station's share along, a the angle round).
 */
function hmLoft(stations, { sides = 12, color = [0.5, 0.5, 0.5], upper = 2.4, lower = 2 } = {}) {
  const prim = { p: [], c: [], n: [], i: [] };
  const last = stations.length - 1;
  const first = stations[0];
  const end = stations[last];
  const tangent = vec.sub(end.c, first.c);
  const flip = vec.dot(vec.cross(first.u, first.s ?? [0, 0, 1]), tangent) < 0;
  stations.forEach((st, index) => {
    const side = st.s ?? [0, 0, 1];
    for (let k = 0; k < sides; k += 1) {
      const a = (k / sides) * TAU;
      const sin = Math.sin(a);
      const cos = Math.cos(a);
      const power = sin >= 0 ? upper : lower;
      const reach = Math.sign(sin) * Math.abs(sin) ** (2 / power) * (sin >= 0 ? st.top : st.bot);
      const across = Math.sign(cos) * Math.abs(cos) ** (2 / power) * st.hw;
      const point = [st.c[0] + st.u[0] * reach + side[0] * across, st.c[1] + st.u[1] * reach + side[1] * across, st.c[2] + st.u[2] * reach + side[2] * across];
      prim.p.push(...point);
      prim.c.push(...hmColorAt(color, index / last, a, point));
    }
  });
  for (let index = 0; index < last; index += 1) {
    for (let k = 0; k < sides; k += 1) {
      const a = index * sides + k;
      const b = index * sides + ((k + 1) % sides);
      const c = (index + 1) * sides + k;
      const d = (index + 1) * sides + ((k + 1) % sides);
      if (flip) prim.i.push(a, b, c, b, d, c);
      else prim.i.push(a, c, b, b, c, d);
    }
  }
  return hmSmoothen(prim);
}

/** Close a run of stations with a rounded end of `length` (two rings and a point). */
function hmRounded(stations, { startLength = 0, endLength = 0 }) {
  const out = stations.slice();
  const shrink = (st, factor) => ({ ...st, top: st.top * factor, bot: st.bot * factor, hw: st.hw * factor });
  if (startLength > 0) {
    const [a, b] = out;
    const away = vec.normalize(vec.sub(a.c, b.c));
    out.unshift(shrink({ ...a, c: vec.add(a.c, vec.scale(away, startLength)) }, 0), shrink({ ...a, c: vec.add(a.c, vec.scale(away, startLength * 0.5)) }, 0.87));
  }
  if (endLength > 0) {
    const a = out[out.length - 1];
    const b = out[out.length - 2];
    const away = vec.normalize(vec.sub(a.c, b.c));
    out.push(shrink({ ...a, c: vec.add(a.c, vec.scale(away, endLength * 0.5)) }, 0.87), shrink({ ...a, c: vec.add(a.c, vec.scale(away, endLength)) }, 0));
  }
  return out;
}

/** An ellipsoid (radii rx along its axis tilted `tilt` about z, ry, rz) as a loft. */
function hmBlob(center, [rx, ry, rz], { tilt = 0, rings = 6, sides = 9, color } = {}) {
  const axis = [Math.cos(tilt), Math.sin(tilt), 0];
  const up = [-Math.sin(tilt), Math.cos(tilt), 0];
  const stations = [];
  for (let k = 0; k <= rings; k += 1) {
    const phi = (k / rings) * Math.PI;
    const size = Math.sin(phi);
    stations.push({ c: vec.add(center, vec.scale(axis, rx * Math.cos(phi))), u: up, s: [0, 0, 1], top: ry * size, bot: ry * size, hw: rz * size });
  }
  return hmLoft(stations, { sides, color, upper: 2, lower: 2 });
}

/** A loft along a line in the xy plane: `path` points [x, y], `sections` [top, bot, hw] at each. */
function hmPathLoft(path, sections, options = {}) {
  const stations = path.map((point, index) => {
    const before = path[Math.max(0, index - 1)];
    const after = path[Math.min(path.length - 1, index + 1)];
    const tangent = vec.normalize([after[0] - before[0], after[1] - before[1], 0]);
    return { c: [point[0], point[1], point[2] ?? 0], u: [-tangent[1], tangent[0], 0], s: [0, 0, 1], top: sections[index][0], bot: sections[index][1], hw: sections[index][2] };
  });
  return hmLoft(options.round ? hmRounded(stations, options.round) : stations, options);
}

/**
 * A patch on a surface `fn(t, a, thickness)` (t along, a round): a shell of
 * plate lying `infl` off it, over t0..t1 and a0..a1, with a rolled lip of
 * `lip` along its edges; `keep(t, a)` false cuts a hole.
 */
function hmShell(fn, { t = [0, 1], a = [0, 1], nt = 8, na = 8, infl = 0.01, lip = 0, color = [0.7, 0.7, 0.75], edge: edgeColor = null, keep = null, reverse = false }) {
  const prim = { p: [], c: [], n: [], i: [] };
  const stride = na + 1;
  const flipSign = (reverse ? -1 : 1) * Math.sign((t[1] - t[0]) * (a[1] - a[0]) || 1);
  for (let i = 0; i <= nt; i += 1) {
    for (let j = 0; j <= na; j += 1) {
      const tt = hmMix(t[0], t[1], i / nt);
      const aa = hmMix(a[0], a[1], j / na);
      const edge = i === 0 || j === 0 || i === nt || j === na;
      const thickness = (typeof infl === 'function' ? infl(tt, aa) : infl) + (edge ? lip : 0);
      const point = fn(tt, aa, thickness);
      prim.p.push(...point);
      prim.c.push(...(edge && edgeColor ? edgeColor : hmColorAt(color, tt, aa, point)));
    }
  }
  for (let i = 0; i < nt; i += 1) {
    for (let j = 0; j < na; j += 1) {
      if (keep && !keep(hmMix(t[0], t[1], (i + 0.5) / nt), hmMix(a[0], a[1], (j + 0.5) / na))) continue;
      const q = [i * stride + j, i * stride + j + 1, (i + 1) * stride + j, (i + 1) * stride + j + 1];
      if (flipSign > 0) prim.i.push(q[0], q[2], q[1], q[1], q[2], q[3]);
      else prim.i.push(q[0], q[1], q[2], q[1], q[3], q[2]);
    }
  }
  return hmSmoothen(prim);
}

/**
 * A strap along a path on a surface: points (t, a), the band `width` wide
 * across t (`across: 't'`) or round a (`'a'`, width in metres over the
 * surface's local radius `radius`), lying `infl` off it.
 */
function hmStrap(fn, path, { width = 0.02, across = 't', infl = 0.006, color = [0.15, 0.1, 0.07], radius = 0.12 }) {
  const prim = { p: [], c: [], n: [], i: [] };
  path.forEach(([t, a], index) => {
    const half = width / 2;
    const [tl, al, tr, ar] = across === 't' ? [t - half, a, t + half, a] : [t, a - half / radius, t, a + half / radius];
    prim.p.push(...fn(tl, al, infl), ...fn(tr, ar, infl));
    prim.c.push(...hmColorAt(color, t, a), ...hmColorAt(color, t, a));
    if (index > 0) {
      const k = (index - 1) * 2;
      prim.i.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  });
  // Wound either way round: which side faces out depends on the path's direction; make both faces.
  const both = { ...prim, i: [...prim.i, ...prim.i.map((v, k, all) => all[k - (k % 3) + (2 - (k % 3))])] };
  return hmSmoothen(both);
}

/** A tube along a 3D polyline with radii. */
function hmTube(points, radii, { sides = 6, color = [0.2, 0.2, 0.2], round = true } = {}) {
  const stations = points.map((c, index) => {
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 1)];
    const tangent = vec.normalize(vec.sub(after, before));
    const probe = Math.abs(tangent[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = vec.normalize(vec.cross(probe, tangent));
    const s = vec.cross(tangent, u);
    return { c, u: vec.cross(s, tangent), s, top: radii[index], bot: radii[index], hw: radii[index] };
  });
  return hmLoft(round ? hmRounded(stations, { startLength: radii[0], endLength: radii[radii.length - 1] }) : stations, { sides, color, upper: 2, lower: 2 });
}

/** A small torus (ring) as a tube round a circle in a plane with normal n. */
function hmRing(center, normal, radius, thickness, { sides = 5, segments = 10, color = [0.5, 0.5, 0.52] } = {}) {
  const probe = Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = vec.normalize(vec.cross(probe, normal));
  const e2 = vec.cross(normal, e1);
  const points = [];
  for (let k = 0; k < segments; k += 1) {
    const a = (k / segments) * TAU;
    points.push(vec.add(center, vec.add(vec.scale(e1, Math.cos(a) * radius), vec.scale(e2, Math.sin(a) * radius))));
  }
  const prim = { p: [], c: [], n: [], i: [] };
  for (let k = 0; k < segments; k += 1) {
    const here = points[k];
    const radial = vec.normalize(vec.sub(here, center));
    for (let s = 0; s < sides; s += 1) {
      const a = (s / sides) * TAU;
      const offset = vec.add(vec.scale(radial, Math.cos(a) * thickness), vec.scale(normal, Math.sin(a) * thickness));
      prim.p.push(...vec.add(here, offset));
      prim.c.push(...color);
    }
  }
  for (let k = 0; k < segments; k += 1) {
    for (let s = 0; s < sides; s += 1) {
      const a = k * sides + s;
      const b = k * sides + ((s + 1) % sides);
      const c = ((k + 1) % segments) * sides + s;
      const d = ((k + 1) % segments) * sides + ((s + 1) % sides);
      prim.i.push(a, c, b, b, c, d);
    }
  }
  return hmSmoothen(prim);
}

/** A cone: base centre, a tip, base radius. */
function hmCone(base, tip, radius, { sides = 6, color = [0.6, 0.6, 0.65] } = {}) {
  return hmTube([base, vec.lerp(base, tip, 0.5), tip], [radius, radius * 0.5, 0.0005], { sides, color, round: false });
}

/** A flat plate (four corners, wound as given), flat shaded. */
function hmQuad(a, b, c, d, color) {
  return { p: [...a, ...b, ...c, ...d], c: [...color, ...color, ...color, ...color], n: [], i: [0, 1, 2, 1, 3, 2, 0, 2, 1, 1, 2, 3] };
}

/**
 * Overlapping plates on a surface (lamellae, scales or the lames of a bard):
 * `rows` stepped from a0 to a1 (`axis: 'a'`, each row's plates across t) or
 * from t0 to t1 (`axis: 't'`, each row's plates round a), each row standing
 * `tilt` further off the surface than the row above it and reaching `over`
 * over the next; laced between with `lace`.
 */
function hmPlates(fn, { t, a, rows, cols, axis = 'a', infl = 0.012, tilt = 0.008, over = 0.35, gap = 0.12, color, lace = [0.45, 0.1, 0.09], keep = null }) {
  const out = { p: [], c: [], n: [], i: [] };
  const [rowRange, colRange] = axis === 'a' ? [a, t] : [t, a];
  const at = (row, col, thick) => (axis === 'a' ? fn(col, row, thick) : fn(row, col, thick));
  // The lacing under the plates: a dark shell.
  hmAppend(out, hmShell(fn, { t, a, nt: axis === 'a' ? cols : rows, na: axis === 'a' ? rows : cols, infl: infl - 0.003, color: lace, keep }));
  for (let row = 0; row < rows; row += 1) {
    const r0 = hmMix(rowRange[0], rowRange[1], row / rows);
    const r1 = hmMix(rowRange[0], rowRange[1], (row + 1) / rows);
    const r1b = r1 + (r1 - r0) * over;
    for (let col = 0; col < cols; col += 1) {
      const c0 = hmMix(colRange[0], colRange[1], (col + gap / 2) / cols);
      const c1 = hmMix(colRange[0], colRange[1], (col + 1 - gap / 2) / cols);
      const cm = (c0 + c1) / 2;
      if (keep) {
        const centre = axis === 'a' ? [cm, (r0 + r1) / 2] : [(r0 + r1) / 2, cm];
        if (!keep(centre[0], centre[1])) continue;
      }
      const shade = 0.88 + 0.12 * (((row * 7 + col * 13) % 5) / 4);
      const base = typeof color === 'function' ? color(row, col) : color;
      const tone = hmScale3(base, shade);
      const topThick = infl + tilt * (row / rows);
      const lowThick = infl + tilt * ((row + 1) / rows) + tilt * 0.8;
      const w = (c1 - c0) * 0.18;
      const hex = [at(r0, c0 + w, topThick), at(r0, c1 - w, topThick), at(r1b, c1, lowThick), at(r1b, c0, lowThick), at((r0 + r1b) / 2, c0, hmMix(topThick, lowThick, 0.5)), at((r0 + r1b) / 2, c1, hmMix(topThick, lowThick, 0.5))];
      // top edge (rounded by the narrowed corners), the sides, the foot.
      const [tl, tr, br, bl, ml, mr] = hex;
      const plate = { p: [...tl, ...tr, ...mr, ...br, ...bl, ...ml], c: [], n: [], i: [0, 1, 2, 0, 2, 5, 5, 2, 3, 5, 3, 4] };
      for (let k = 0; k < 6; k += 1) plate.c.push(...tone);
      // Wound outward whichever way the surface runs.
      const normal = vec.cross(vec.sub(tr, tl), vec.sub(bl, tl));
      const outward = vec.sub(hex[1], at((r0 + r1b) / 2, cm, 0));
      if (vec.dot(normal, outward) < 0) plate.i = plate.i.map((v, k, all) => all[k - (k % 3) + (2 - (k % 3))]);
      hmAppend(out, hmFlatten(plate));
    }
  }
  return { ...out, preset: true };
}

// ---- Surfaces ---------------------------------------------------------------------

/** The barrel as a table by x: [x, top, bottom, half-width], bent by the breed. */
function hmBodyTable(build) {
  const base = [
    [-0.67, 0.86, 0.84, 0],
    [-0.64, 0.9, 0.8, 0.035],
    [-0.58, 0.945, 0.72, 0.095],
    [-0.5, 0.985, 0.66, 0.14],
    [-0.4, 0.99, 0.62, 0.163],
    [-0.28, 0.965, 0.59, 0.165],
    [-0.16, 0.94, 0.56, 0.162],
    [-0.04, 0.93, 0.535, 0.166],
    [0.08, 0.95, 0.51, 0.172],
    [0.18, 0.98, 0.5, 0.168],
    [0.28, 1.005, 0.515, 0.152],
    [0.36, 0.99, 0.54, 0.138],
    [0.43, 0.94, 0.58, 0.115],
    [0.49, 0.865, 0.64, 0.078],
    [0.525, 0.8, 0.71, 0.04],
    [0.545, 0.76, 0.75, 0],
  ];
  return base.map(([x, top, bottom, hw]) => {
    const deeper = build.deep * (x > -0.3 && x < 0.4 ? 1 : 0.3);
    return [x < 0.28 ? 0.28 + (x - 0.28) * build.back : x, (top + bottom) / 2 - deeper / 2, (top - bottom) / 2 + deeper / 2, hw * build.bulk];
  });
}

/** The surface of the barrel at x, angle a (0 the left side, π/2 the top), thickened by `d`. */
function hmBodyFn(build) {
  const table = hmBodyTable(build);
  return (x, a, d = 0) => {
    const [mid, depth, hw] = hmCurve(table, x);
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    const power = sin >= 0 ? 2.6 : 2.15;
    return [x, mid + Math.sign(sin) * Math.abs(sin) ** (2 / power) * (depth + d), Math.sign(cos) * Math.abs(cos) ** (2 / power) * (hw + d)];
  };
}

/** The back's height at x. */
const hmBackAt = (build, x) => hmBodyFn(build)(x, Math.PI / 2)[1];

/** The neck as a table by t: [t, crest x, crest y, throat x, throat y, half-width]. */
function hmNeckTable(build) {
  const arch = build.neck.arch;
  const bulk = build.neck.bulk;
  return [
    [0, 0.22, 0.985, 0.45, 0.7, 0.1 * bulk],
    [0.2, 0.33, 1.065 + arch * 0.4, 0.51, 0.79, 0.09 * bulk],
    [0.45, 0.445, 1.14 + arch, 0.575, 0.9 + arch * 0.1, 0.077 * bulk],
    [0.75, 0.55, 1.19 + arch * 0.9, 0.635, 1.0, 0.063 * bulk],
    [1, 0.62, 1.2 + arch * 0.6, 0.675, 1.065, 0.056 * bulk],
  ];
}

function hmNeckFn(build) {
  const table = hmNeckTable(build);
  return (t, a, d = 0) => {
    const [cx, cy, tx, ty, hw] = hmCurve(table, t);
    const mid = [(cx + tx) / 2, (cy + ty) / 2];
    const up = [cx - tx, cy - ty];
    const reach = Math.hypot(up[0], up[1]) / 2;
    const u = [up[0] / (reach * 2), up[1] / (reach * 2)];
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    const power = sin >= 0 ? 2.5 : 2.1;
    const along = Math.sign(sin) * Math.abs(sin) ** (2 / power) * (reach + d);
    return [mid[0] + u[0] * along, mid[1] + u[1] * along, Math.sign(cos) * Math.abs(cos) ** (2 / power) * (hw + d)];
  };
}

/** The head: its profile along its axis [x, top, bottom, half-width], in the head's own frame (x along the face, y up). */
function hmHeadTable(build) {
  const { length, dish, size } = build.head;
  const table = [
    [0, 0.078, 0.07, 0.058],
    [0.04, 0.088, 0.09, 0.07],
    [0.09, 0.082, 0.105, 0.077],
    [0.15, 0.067, 0.095, 0.07],
    [0.2, 0.052 + dish * 0.2, 0.062, 0.055],
    [0.25, 0.043 + dish, 0.052, 0.046],
    [0.3, 0.04 + dish * 1.5, 0.05, 0.043],
    [0.335, 0.037 + dish * 1.8, 0.047, 0.041],
    [0.355, 0.028, 0.038, 0.034],
    [0.368, 0, 0.01, 0.014],
  ];
  return table.map(([x, top, bot, hw]) => [x * length, top * size, bot * size, hw * size * (build.head.dish > 0.01 ? 0.92 : 1)]);
}

function hmHeadFn(build, poll) {
  const table = hmHeadTable(build);
  const angle = build.headAngle;
  const along = [Math.cos(angle), -Math.sin(angle), 0];
  const up = [Math.sin(angle), Math.cos(angle), 0];
  return (x, a, d = 0) => {
    const [top, bot, hw] = hmCurve(table, x);
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    const power = sin >= 0 ? 2.5 : 2.2;
    const lift = Math.sign(sin) * Math.abs(sin) ** (2 / power) * ((sin >= 0 ? top : bot) + d);
    const side = Math.sign(cos) * Math.abs(cos) ** (2 / power) * (hw + d);
    return [poll[0] + along[0] * x + up[0] * lift, poll[1] + along[1] * x + up[1] * lift, side];
  };
}

// ---- The model -----------------------------------------------------------------------

const HM_STEEL = [0.96, 0.97, 1];
const HM_STEEL2 = [0.72, 0.74, 0.8];
const HM_GOLD = [0.8, 0.62, 0.22];
const HM_EDGE = [0.38, 0.4, 0.46];
const HM_LAMELLA = [0.5, 0.52, 0.56];
const HM_LACE = [0.5, 0.1, 0.09];
const HM_HORN = [0.72, 0.66, 0.58];

/** A primitive with every point moved by `fn`. */
function hmMove(prim, fn) {
  const out = { ...prim, p: [], n: prim.n.slice() };
  for (let v = 0; v < prim.p.length; v += 3) out.p.push(...fn([prim.p[v], prim.p[v + 1], prim.p[v + 2]]));
  return out;
}

/** Round a number list to Float32Array for the view. */
function hmFinish(acc, origin, scale) {
  const count = acc.p.length / 3;
  if (!count) return null;
  const positions = new Float32Array(acc.p.length);
  for (let v = 0; v < count; v += 1) {
    positions[v * 3] = (acc.p[v * 3] - origin[0]) * scale;
    positions[v * 3 + 1] = (acc.p[v * 3 + 1] - origin[1]) * scale;
    positions[v * 3 + 2] = (acc.p[v * 3 + 2] - origin[2]) * scale;
  }
  return { positions, normals: new Float32Array(acc.n), colors: new Float32Array(acc.c), indices: count > 65000 ? new Uint32Array(acc.i) : new Uint16Array(acc.i), triangles: acc.i.length / 3 };
}

/**
 * Everything a horse is drawn from, as parts (each {soft, metal} geometry:
 * `soft` toon-shaded hide, hair and leather, `metal` steel and iron) with
 * the pivots and the dynamic pieces' descriptions. Pure data; cache by
 * `horseModelKey`.
 *
 * @param spec { breed, barding, coat (hex), seed, caparison, detail: 'full' | 'low', withers (m), corner }
 */
export function buildHorseModel(spec) {
  const build = HORSE_BUILD[spec.breed] ?? HORSE_BUILD.warhorse;
  const low = spec.detail === 'low';
  const W = spec.withers ?? 1.5;
  const coat = horseCoat(spec.coat ?? '#5a3a22', spec.seed ?? 1);
  const random = horseRandom((spec.seed ?? 1) * 31 + 7);
  const sides = low ? 7 : 12;
  const bodyFn = hmBodyFn(build);
  const neckFn = hmNeckFn(build);
  const poll = [0.635, 1.14 + build.neck.arch * 0.5, 0];
  const headFn = hmHeadFn(build, poll);
  const noise = (p) => Math.sin(p[0] * 61 + p[1] * 23) * Math.sin(p[1] * 47 - p[2] * 31) * Math.sin(p[2] * 53 + p[0] * 19);

  // ---- Colours
  const hide = (p, belly = 0) => {
    let base = coat.body;
    if (belly > 0) base = hmLerp3(base, coat.belly, belly);
    const dapple = coat.dapple * noise(p);
    return [base[0] + dapple, base[1] + dapple, base[2] + dapple];
  };
  const bodyColor = (t, a, p) => {
    const down = Math.max(0, -Math.sin(a));
    let color = hide(p, hmSmooth(hmClamp(down * 1.4 - 0.3, 0, 1)));
    // A dun's dorsal stripe.
    if (coat.stripe && Math.sin(a) > 0.93) color = hmLerp3(color, coat.points, 0.85);
    return color;
  };

  const parts = {};
  const accs = {};
  const acc = (name, kind) => (accs[`${name}.${kind}`] ??= hmAcc());
  const add = (name, kind, prim, flat = false) => {
    const target = acc(name, kind);
    hmAppend(target, flat && !prim.preset ? hmFlatten(prim) : prim);
  };
  const body = (kind, prim, flat) => add('body', kind, prim, flat);

  // ---- The barrel and its muscle
  const bodyStations = [];
  const xs = low ? [-0.66, -0.58, -0.42, -0.2, 0, 0.18, 0.34, 0.46, 0.53, 0.545] : [-0.67, -0.64, -0.6, -0.54, -0.46, -0.38, -0.3, -0.22, -0.14, -0.06, 0.02, 0.1, 0.18, 0.26, 0.34, 0.41, 0.47, 0.51, 0.535, 0.545];
  for (const x of xs) {
    const [mid, depth, hw] = hmCurve(hmBodyTable(build), x);
    bodyStations.push({ c: [x, mid, 0], u: [0, 1, 0], s: [0, 0, 1], top: depth, bot: depth, hw });
  }
  // top and bottom differ (the table's top/bottom are folded into mid and depth); the ring is symmetric about mid.
  body('soft', hmLoft(bodyStations, { sides: low ? 10 : 18, color: bodyColor, upper: 2.6, lower: 2.15 }));
  const musclePrims = [];
  for (const side of [1, -1]) {
    // Shoulder, forearm top, the chest's muscle, the haunch with its stifle, the buttock.
    musclePrims.push(hmBlob([0.31, 0.73, side * 0.125], [0.17 * build.bulk, 0.13, 0.042 * build.bulk], { tilt: -1.15, rings: 6, sides: 9, color: (t, a, p) => hide(p) }));
    musclePrims.push(hmBlob([0.4, 0.64, side * 0.075], [0.09, 0.075, 0.05 * build.bulk], { tilt: -0.5, rings: 5, sides: 8, color: (t, a, p) => hide(p) }));
    musclePrims.push(hmBlob([-0.4, 0.73, side * 0.125], [0.2 * build.bulk, 0.12, 0.052 * build.bulk], { tilt: -1.3, rings: 6, sides: 9, color: (t, a, p) => hide(p) }));
    musclePrims.push(hmBlob([-0.5, 0.85, side * 0.095], [0.13, 0.085, 0.065 * build.bulk], { tilt: -0.4, rings: 5, sides: 8, color: (t, a, p) => hide(p) }));
    musclePrims.push(hmBlob([-0.27, 0.64, side * 0.14], [0.085, 0.07, 0.04], { tilt: 0.3, rings: 4, sides: 7, color: (t, a, p) => hide(p) }));
  }
  const muscles = low ? musclePrims.slice(0, 4) : musclePrims;
  for (const prim of muscles) body('soft', prim);

  // ---- The tail's dock (the hair is dynamic)
  const carriage = build.tail.carriage;
  const dockStart = bodyFn(-0.6, Math.PI / 2, -0.03);
  const dockLift = carriage[0] < 0 ? 0.075 : 0;
  const dockPath = [[dockStart[0], dockStart[1] - 0.005], [dockStart[0] - 0.04, dockStart[1] + dockLift * 0.6], [dockStart[0] - 0.075, dockStart[1] + dockLift - 0.012]];
  body('soft', hmPathLoft(dockPath, [[0.038, 0.038, 0.034], [0.03, 0.03, 0.028], [0.026, 0.026, 0.024]], { sides: 6, round: { endLength: 0.02 }, color: coat.mane }));
  const tailRoot = [dockPath[2][0] - 0.005, dockPath[2][1], 0];
  // The hair of the tail: dynamic (the view) unless it is a crowd's horse, which has it fixed.
  const tailRest = (lift = 0) => {
    const points = [tailRoot];
    const segment = build.tail.length / 5;
    for (let k = 0; k < 5; k += 1) {
      const angle = carriage[k] * (1 - 0.8 * lift * build.tail.lift) - 0.1 * lift * build.tail.lift;
      const last = points[points.length - 1];
      points.push([last[0] - Math.cos(angle) * segment, last[1] - Math.sin(angle) * segment, 0]);
    }
    return points;
  };
  if (low) {
    const chain = tailRest(0);
    for (let strand = -1; strand <= 1; strand += 1) {
      const prim = hmAcc();
      for (let k = 0; k < 5; k += 1) {
        const a = chain[k];
        const b = chain[k + 1];
        const w = 0.03 * (1 - k * 0.12);
        const dir = vec.normalize(vec.sub(b, a));
        const perp = [-dir[1] * w, dir[0] * w, 0];
        const tone = hmScale3(coat.mane, 1 - 0.06 * k);
        hmAppend(prim, hmFlatten({ p: [a[0] - perp[0], a[1] - perp[1], strand * 0.02, a[0] + perp[0], a[1] + perp[1], strand * 0.02, b[0] - perp[0] * 0.9, b[1] - perp[1] * 0.9, strand * 0.03, b[0] + perp[0] * 0.9, b[1] + perp[1] * 0.9, strand * 0.03], c: [...tone, ...tone, ...tone, ...tone], n: [], i: [0, 1, 2, 1, 3, 2, 0, 2, 1, 1, 2, 3] }));
      }
      body('soft', { ...prim, preset: true });
    }
  }

  // ---- The neck
  const neckPivot = [0.34, 0.9, 0];
  const neckStations = [];
  const neckSteps = low ? 5 : 10;
  for (let k = 0; k <= neckSteps; k += 1) {
    const t = k / neckSteps;
    const [cx, cy, tx, ty, hw] = hmCurve(hmNeckTable(build), t);
    const up = vec.normalize([cx - tx, cy - ty, 0]);
    neckStations.push({ c: [(cx + tx) / 2, (cy + ty) / 2, 0], u: up, s: [0, 0, 1], top: Math.hypot(cx - tx, cy - ty) / 2, bot: Math.hypot(cx - tx, cy - ty) / 2, hw });
  }
  const neckColor = (t, a, p) => {
    const color = hide(p, hmSmooth(hmClamp(-Math.sin(a) * 1.2 - 0.4, 0, 1)));
    return coat.stripe && Math.sin(a) > 0.93 ? hmLerp3(color, coat.points, 0.85) : color;
  };
  const addNeck = (kind, prim) => add('neck', kind, prim);
  addNeck('soft', hmLoft(hmRounded(neckStations, { startLength: 0 }), { sides: low ? 8 : 14, color: neckColor, upper: 2.5, lower: 2.1 }));

  // ---- The head
  const headStations = [];
  const headSteps = low ? 6 : 12;
  const headTable = hmHeadTable(build);
  const headLength = headTable[headTable.length - 1][0];
  const headAngle = build.headAngle;
  const along = [Math.cos(headAngle), -Math.sin(headAngle), 0];
  const upAxis = [Math.sin(headAngle), Math.cos(headAngle), 0];
  for (let k = 0; k <= headSteps; k += 1) {
    const x = (k / headSteps) * headLength;
    const [top, bot, hw] = hmCurve(headTable, x);
    const mid = (top - bot) / 2;
    headStations.push({ c: vec.add(poll, vec.add(vec.scale(along, x), vec.scale(upAxis, mid))), u: upAxis, s: [0, 0, 1], top: (top + bot) / 2, bot: (top + bot) / 2, hw });
  }
  const headColor = (x, a, p) => {
    const t = x * headLength;
    let color = hide(p);
    const top = Math.sin(a);
    const across = Math.abs(p[2]);
    if (coat.blaze) {
      const width = [0, 0.012, 0.014, 0.03][coat.blaze];
      const [from, to] = [[0, 0], [0.045, 0.1], [0.035, 0.3], [0.03, 0.4]][coat.blaze];
      if (t > from && t < to && top > 0.6 && across < width * (1 + 0.5 * Math.sin(t * 30))) color = HM_WHITE;
    }
    if (t > 0.285) color = hmLerp3(color, coat.blaze >= 3 ? [0.8, 0.6, 0.58] : coat.muzzle, hmSmooth(hmClamp((t - 0.285) / 0.05, 0, 1)));
    if (coat.type === 'bay' || coat.type === 'dun') color = hmLerp3(color, coat.points, hmSmooth(hmClamp((t - 0.12) / 0.2, 0, 1)) * 0.4);
    // The throat and jaw a shade lighter.
    if (top < -0.3) color = hmLerp3(color, coat.belly, 0.4);
    return color;
  };
  const headLoft = hmLoft(hmRounded(headStations, { endLength: 0.012 }), { sides: low ? 8 : 14, color: headColor, upper: 2.6, lower: 2.2 });
  add('head', 'soft', headLoft);
  const headMarks = [];
  if (!low) {
    // Eyes (dark with a highlight), nostrils, the corner of the mouth.
    for (const side of [1, -1]) {
      const eye = headFn(0.115, 0.62, 0.003);
      const eyeAt = [eye[0], eye[1], side * eye[2]];
      headMarks.push(hmBlob(eyeAt, [0.017, 0.019, 0.011], { tilt: 0, rings: 4, sides: 8, color: [0.03, 0.02, 0.02] }));
      headMarks.push(hmBlob([eyeAt[0] + 0.007, eyeAt[1] + 0.007, side * (eye[2] + 0.006)], [0.006, 0.006, 0.004], { rings: 3, sides: 5, color: [0.95, 0.95, 0.95] }));
      const nostril = headFn(0.345, 0.05, 0);
      headMarks.push(hmBlob([nostril[0], nostril[1] + 0.008, side * (nostril[2] + 0.002)], [0.018, 0.009, 0.007], { tilt: -0.4, rings: 4, sides: 7, color: [0.05, 0.035, 0.035] }));
      // The brow and the cheek's rise over the eye, a hint of the bone.
      headMarks.push(hmBlob([eyeAt[0] - 0.004, eyeAt[1] + 0.024, side * (eye[2] - 0.001)], [0.025, 0.009, 0.012], { rings: 3, sides: 7, color: (t, a, p) => hide(p) }));
    }
    const mouth = [];
    for (let k = 0; k < 6; k += 1) {
      const x = 0.355 - k * 0.022;
      mouth.push([x, -0.115 + k * 0.004]);
    }
    for (const side of [1, -1]) {
      const strap = hmStrap((x, a, d) => {
        const p = headFn(x, a, d);
        return [p[0], p[1], side * p[2]];
      }, mouth.map(([x]) => [x, -0.1]), { width: 0.004, across: 'a', infl: 0.001, color: [0.1, 0.06, 0.06], radius: 0.05 });
      headMarks.push(strap);
    }
    // Forelock: a tuft falling between the ears over the face.
    const lock = hmAcc();
    for (let k = 0; k < 5; k += 1) {
      const from = headFn(0.02 + k * 0.004, Math.PI / 2 + (k - 2) * 0.28, 0.003);
      const to = [from[0] + 0.02, from[1] - 0.055 - 0.01 * (k % 2), from[2] * 1.2];
      hmAppend(lock, hmFlatten({ p: [from[0], from[1], from[2] - 0.011, from[0], from[1], from[2] + 0.011, to[0], to[1], to[2]], c: [...coat.mane, ...coat.mane, ...hmScale3(coat.mane, 0.8)], n: [], i: [0, 1, 2, 0, 2, 1] }));
    }
    headMarks.push({ ...lock, preset: true });
  }
  for (const prim of headMarks) add('head', 'soft', prim);

  // ---- Ears
  const earShape = (flip) => {
    const stations = [];
    const sections = [[0.0, 0.0, 0.0], [0.016, 0.014, 0.014], [0.017, 0.013, 0.015], [0.013, 0.009, 0.011], [0.007, 0.005, 0.006], [0.0, 0.0, 0.0]];
    const heights = [-0.004, 0.008, 0.03, 0.055, 0.078, 0.088];
    sections.forEach(([top, bot, hw], k) => stations.push({ c: [heights[k] * 0.1, heights[k], 0], u: [1, 0, 0], s: [0, 0, flip], top, bot, hw }));
    return hmLoft(stations, { sides: 6, color: (t, a, p) => (t > 0.9 || (p[0] > 0.004 && t > 0.4 && Math.abs(a - 0) < 0.8) ? coat.points : hide(p)), upper: 2, lower: 2 });
  };
  acc('ear', 'soft');
  add('ear', 'soft', earShape(1));
  if (low) {
    // A crowd's horse: the ears fixed into the head.
    const base = headFn(0.0, Math.PI / 2, -0.012);
    for (const side of [1, -1]) {
      const ear = hmMove(earShape(side), (q) => {
        const lean = -0.2;
        const x = q[0] * Math.cos(lean) - q[1] * Math.sin(lean);
        const y = q[0] * Math.sin(lean) + q[1] * Math.cos(lean);
        return [base[0] + x, base[1] + y, side * (0.034 + 0.4 * y * 0.1) + q[2] * 1];
      });
      add('head', 'soft', ear);
    }
    accs['ear.soft'] = hmAcc();
  }

  // ---- Mane: its tufts are dynamic (view); a standing ridge on the crest is drawn in the neck
  const crest = [];
  const tufts = low ? 5 : 17;
  for (let k = 0; k < tufts; k += 1) {
    const t = 0.06 + (0.9 * k) / (tufts - 1);
    const p = neckFn(t, Math.PI / 2, 0.004);
    crest.push({ base: [p[0] - neckPivot[0], p[1] - neckPivot[1], 0], t, hw: hmCurve(hmNeckTable(build), t)[4], depth: (() => { const row = hmCurve(hmNeckTable(build), t); return Math.hypot(row[0] - row[2], row[1] - row[3]) / 2; })() });
  }
  const maneSide = random() < 0.5 ? 1 : -1;
  const mane = {
    side: maneSide, length: build.mane.length, upright: build.mane.upright, count: tufts,
    tufts: crest.map((c, k) => ({ ...c, length: (0.75 + 0.55 * random()) * build.mane.length * (k === 0 ? 0.6 : 1), width: 0.075 + 0.025 * random(), phase: k * 0.7 + random() })),
    color: coat.mane,
  };
  // A short standing ridge down the crest (an upright, roached look) merged into the neck.
  {
    const ridge = hmAcc();
    for (let k = 0; k < (low ? 8 : 20); k += 1) {
      const t = 0.04 + (0.94 * k) / ((low ? 8 : 20) - 1);
      const p = neckFn(t, Math.PI / 2, 0.0);
      const q = neckFn(t, Math.PI / 2, 0.0 + 0.032 + build.mane.upright * 0.03);
      const lean = [0.01 + 0.005 * (k % 2), 0, 0];
      hmAppend(ridge, hmFlatten({ p: [p[0], p[1], -0.012, p[0], p[1], 0.012, q[0] + lean[0] - 0.018, q[1], q[2] - 0.008 * (k % 3), q[0] + lean[0] + 0.018, q[1], q[2] + 0.008 * (k % 2)], c: [...coat.mane, ...coat.mane, ...hmScale3(coat.mane, 0.8), ...hmScale3(coat.mane, 0.8)], n: [], i: [0, 1, 2, 1, 3, 2, 0, 2, 1, 1, 2, 3] }));
    }
    addNeck('soft', { ...ridge, preset: true });
  }

  // ---- Legs
  const LEG = { upper: 0.33, cannon: 0.26, pastern: 0.115, hoof: 0.045 };
  const legTable = (fore) => ({
    upper: fore
      ? [[0, 0.078, 0.078, 0.066], [0.1, 0.072, 0.078, 0.064], [0.4, 0.052, 0.062, 0.05], [0.75, 0.035, 0.04, 0.036], [0.92, 0.042, 0.036, 0.042], [1, 0.034, 0.032, 0.038]]
      : [[0, 0.078, 0.09, 0.068], [0.15, 0.06, 0.088, 0.058], [0.45, 0.044, 0.065, 0.044], [0.8, 0.036, 0.05, 0.036], [0.93, 0.044, 0.068, 0.04], [1, 0.034, 0.045, 0.034]],
    cannon: fore
      ? [[0, 0.036, 0.034, 0.04], [0.12, 0.026, 0.031, 0.022], [0.78, 0.025, 0.03, 0.021], [0.95, 0.033, 0.04, 0.034], [1, 0.03, 0.036, 0.03]]
      : [[0, 0.04, 0.042, 0.036], [0.15, 0.028, 0.034, 0.024], [0.8, 0.026, 0.03, 0.022], [0.95, 0.034, 0.04, 0.034], [1, 0.03, 0.036, 0.03]],
    pastern: [[0, 0.036, 0.042, 0.036], [0.25, 0.029, 0.034, 0.03], [0.6, 0.026, 0.028, 0.027], [1, 0.03, 0.028, 0.032]],
    hoof: [[0, 0.034, 0.03, 0.033], [0.15, 0.038, 0.032, 0.036], [1, 0.05, 0.038, 0.044]],
  });
  const legColor = (seg, sockHeight, fore) => (t, a, p) => {
    const global = { upper: t * 0.44, cannon: 0.44 + t * 0.35, pastern: 0.79 + t * 0.15, hoof: 0.94 + t * 0.06 }[seg];
    let color = hide(p);
    if (coat.type !== 'chestnut') color = hmLerp3(color, coat.points, hmSmooth(hmClamp((global - 0.3) / 0.2, 0, 1)) * (coat.type === 'grey' ? 0.5 : 1));
    if (coat.bars && seg !== 'hoof' && global > 0.15 && global < 0.5 && Math.floor(global * 40) % 2 === 0) color = hmLerp3(color, coat.points, 0.45);
    if (sockHeight && global > (sockHeight === 3 ? 0.58 : 0.82)) color = HM_WHITE;
    if (seg === 'hoof') color = sockHeight ? HM_HORN : hmLerp3(coat.hoof, hmScale3(coat.hoof, 1.4), t);
    return color;
  };
  const legSections = (rows, scale) => rows.map(([t, front, back, hw]) => ({ t, top: front * scale, bot: back * scale, hw: hw * scale }));
  const makeSegment = (rows, length, color, scale, { startCap = 0, endCap = 0, sidesCount = low ? 6 : 8 } = {}) => {
    const stations = legSections(rows, scale).map((row) => ({ c: [0, row.t * length, 0], u: [1, 0, 0], s: [0, 0, -1], top: row.top, bot: row.bot, hw: row.hw }));
    return hmLoft(hmRounded(stations, { startLength: startCap, endLength: endCap }), { sides: sidesCount, color, upper: 2.1, lower: 2.1 });
  };
  HORSE_LEGS_KEYS.forEach((key, index) => {
    const fore = key.endsWith('Fore');
    const table = legTable(fore);
    const scale = build.legs * (fore ? 1 : 1.04);
    const sock = coat.socks[index];
    const segments = {
      upper: makeSegment(table.upper, LEG.upper, legColor('upper', sock, fore), scale * (low ? 1.05 : 1), { endCap: 0.025 }),
      cannon: makeSegment(table.cannon, LEG.cannon, legColor('cannon', sock, fore), scale, { startCap: 0.02, endCap: 0.02 }),
      pastern: makeSegment(table.pastern, LEG.pastern, legColor('pastern', sock, fore), scale, { startCap: 0.02 }),
      hoof: makeSegment(table.hoof, LEG.hoof, legColor('hoof', sock, fore), scale, { endCap: 0.0 }),
    };
    // Feathering on a heavy horse: hair falling behind the fetlock.
    if (!low && build.feather > 0.05) {
      const hair = hmAcc();
      const strands = Math.round(5 + 4 * build.feather);
      for (let s = 0; s < strands; s += 1) {
        const a = (s / (strands - 1) - 0.5) * 2.4;
        const root = [-0.03 - 0.008 * Math.cos(a), 0.01, 0.03 * Math.sin(a)];
        const tip = [root[0] - 0.012, root[1] + 0.07 * build.feather + 0.01 * (s % 2) + 0.04, root[2] * 1.4];
        const tone = sock ? HM_WHITE : coat.points;
        // pastern frame: y runs from the fetlock to the coronet; the hair falls the other way and hangs from the fetlock.
        hmAppend(hair, hmFlatten({ p: [root[0], 0.0, root[2] - 0.009, root[0], 0.0, root[2] + 0.009, tip[0], tip[1], tip[2]], c: [...tone, ...tone, ...hmScale3(tone, 0.8)], n: [], i: [0, 1, 2, 0, 2, 1] }));
      }
      segments.pastern = (() => {
        const merged = hmAcc();
        hmAppend(merged, segments.pastern);
        hmAppend(merged, { ...hair, preset: true });
        return { ...merged, preset: true };
      })();
    }
    if (low) {
      // A crowd's horse: the lower leg one straight piece (cannon, pastern and hoof stacked, a little shortened to the same reach).
      const merged = hmAcc();
      let drop = 0;
      for (const name of ['cannon', 'pastern', 'hoof']) {
        const shift = drop;
        hmAppend(merged, hmMove(segments[name], (q) => [q[0], q[1] * 0.88 + shift * 0.88, q[2]]));
        drop += LEG[name];
      }
      delete segments.pastern;
      delete segments.hoof;
      segments.cannon = { ...merged, preset: true };
    }
    for (const [segName, prim] of Object.entries(segments)) hmAppend(acc(`leg.${key}.${segName}`, 'soft'), prim);
  });

  // ---- Tack
  const sd = HM_SADDLES[build.saddle];
  const seatX = -0.08;
  const leather = sd.leather;
  const dyed = spec.corner === 'blue' ? [0.14, 0.25, 0.48] : [0.6, 0.12, 0.13];
  const saddleStations = [];
  const pommelX = seatX + sd.length / 2 - 0.03;
  const cantleX = seatX - sd.length / 2 + 0.03;
  const bump = (x) => sd.pommel * Math.exp(-(((x - pommelX) / 0.06) ** 2)) + sd.cantle * Math.exp(-(((x - cantleX) / 0.065) ** 2));
  const saddleSteps = low ? 8 : 16;
  for (let k = 0; k <= saddleSteps; k += 1) {
    const x = seatX - sd.length / 2 + (sd.length * k) / saddleSteps;
    const back = hmBackAt(build, x);
    const seat = back + 0.045;
    const hwHere = sd.width + 0.025 * Math.exp(-(((x - pommelX) / 0.06) ** 2)) + 0.03 * Math.exp(-(((x - cantleX) / 0.06) ** 2));
    const topY = seat + bump(x);
    const botY = back - 0.012;
    saddleStations.push({ c: [x, (topY + botY) / 2, 0], u: [0, 1, 0], s: [0, 0, 1], top: (topY - botY) / 2, bot: (topY - botY) / 2, hw: hwHere });
  }
  const saddleColor = (t, a, p) => (p[1] > bodyTopAt(p[0]) + 0.075 && p[2] !== 0 ? sd.trim : leather);
  function bodyTopAt(x) {
    return hmBackAt(build, x);
  }
  // The saddle's tree flattened into a seat: a loft flattened on top by a low top power.
  body('soft', hmLoft(hmRounded(saddleStations, { startLength: 0.012, endLength: 0.012 }), { sides: low ? 6 : 10, color: (t, a, p) => (bump(p[0]) > 0.04 && Math.sin(a) > 0.4 ? hmLerp3(leather, sd.trim, 0.5) : leather), upper: 4, lower: 2.2 }));
  const clothShade = (t, a, p) => (a < 0.35 || a > Math.PI - 0.35 ? hmScale3(dyed, 1.25) : dyed);
  // Saddle cloth and flaps over the barrel's sides.
  for (const side of [1, -1]) {
    const fnSide = (x, a, d) => {
      const p = bodyFn(x, side > 0 ? a : Math.PI - a, d);
      return p;
    };
    body('soft', hmShell(fnSide, { t: [seatX - 0.25, seatX + 0.24], a: [1.2, 0.28], nt: low ? 4 : 8, na: low ? 3 : 5, infl: 0.006, lip: 0.003, color: clothShade }));
    body('soft', hmShell(fnSide, { t: [seatX - sd.length / 2 + 0.01, seatX + sd.length / 2 - 0.01], a: [1.1, 0.55 - 0.3 * sd.flap + 0.2], nt: low ? 3 : 6, na: low ? 2 : 4, infl: 0.014, lip: 0.003, color: leather }));
  }
  if (!low) {
    // Girth, breast collar, crupper and their straps.
    const strap = [0.1, 0.07, 0.05];
    const girthX = 0.09;
    const girthPath = [];
    for (let k = 0; k <= 22; k += 1) girthPath.push([girthX, 0.95 - (k / 22) * (Math.PI + 1.9)]);
    body('soft', hmStrap(bodyFn, girthPath, { width: 0.035, across: 't', infl: 0.007, color: strap }));
    const collar = [];
    for (let k = 0; k <= 8; k += 1) collar.push([0.3 + (0.235 * k) / 8, 0.1]);
    for (let k = 8; k >= 0; k -= 1) collar.push([0.3 + (0.235 * k) / 8, Math.PI - 0.1]);
    body('soft', hmStrap(bodyFn, collar, { width: 0.025, across: 'a', infl: 0.008, color: strap, radius: 0.14 }));
    for (const side of [1, -1]) {
      const rise = [];
      for (let k = 0; k <= 8; k += 1) rise.push([0.3 - 0.02 * k / 8 - 0.04 * (k / 8) ** 2, side > 0 ? 0.1 + (k / 8) * 1.2 : Math.PI - 0.1 - (k / 8) * 1.2]);
      body('soft', hmStrap(bodyFn, rise, { width: 0.016, across: 't', infl: 0.008, color: strap }));
    }
    const crupper = [];
    for (let k = 0; k <= 12; k += 1) crupper.push([cantleX - 0.03 - (k / 12) * (0.6 + cantleX - 0.03 + 0.02) * 0.55, Math.PI / 2]);
    body('soft', hmStrap(bodyFn, crupper, { width: 0.018, across: 'a', infl: 0.006, color: strap, radius: 0.15 }));
    for (const side of [1, -1]) {
      const hip = [];
      for (let k = 0; k <= 8; k += 1) hip.push([-0.5 - 0.02 * k / 8, side > 0 ? 1.3 - (k / 8) * 1.0 : Math.PI - 1.3 + (k / 8) * 1.0]);
      body('soft', hmStrap(bodyFn, hip, { width: 0.012, across: 't', infl: 0.007, color: strap }));
    }
    // Bridle: browband, noseband, cheekpieces, throatlatch, with a bit and its rings.
    const bridle = [0.08, 0.055, 0.04];
    const head = (kind, prim) => add('head', kind, prim);
    const brow = [];
    for (let k = 0; k <= 10; k += 1) brow.push([0.05, 0.25 + (k / 10) * (Math.PI - 0.5)]);
    head('soft', hmStrap(headFn, brow, { width: 0.014, across: 't', infl: 0.004, color: bridle }));
    const nose = [];
    for (let k = 0; k <= 14; k += 1) nose.push([0.225, (k / 14) * TAU]);
    head('soft', hmStrap(headFn, nose, { width: 0.018, across: 't', infl: 0.004, color: bridle }));
    const throat = [];
    for (let k = 0; k <= 12; k += 1) throat.push([0.035, 0.15 - (k / 12) * (Math.PI + 0.3)]);
    head('soft', hmStrap(headFn, throat, { width: 0.012, across: 't', infl: 0.004, color: bridle }));
    for (const side of [1, -1]) {
      const mirror = (x, a, d) => {
        const p = headFn(x, side > 0 ? a : Math.PI - a, d);
        return p;
      };
      const cheek = [];
      for (let k = 0; k <= 8; k += 1) cheek.push([0.06 + 0.2 * (k / 8), 0.55 - 0.6 * (k / 8)]);
      head('soft', hmStrap(mirror, cheek, { width: 0.012, across: 'a', infl: 0.004, color: bridle, radius: 0.06 }));
      const stay = [];
      for (let k = 0; k <= 6; k += 1) stay.push([0.05 - 0.05 * (k / 6), 0.55 + 0.35 * (k / 6)]);
      head('soft', hmStrap(mirror, stay, { width: 0.012, across: 'a', infl: 0.004, color: bridle, radius: 0.06 }));
      const corner = mirror(0.265, -0.05, 0.012);
      head('metal', hmRing(corner, [0, 0, side], 0.016, 0.0035, { color: [0.45, 0.46, 0.5] }));
    }
  }
  const bitAt = headFn(0.265, -0.05, 0.012);

  // ---- Barding
  const plate = spec.barding === 'plate';
  const lamellar = spec.barding === 'lamellar';
  const metal = (name, prim) => add(name, 'metal', prim);
  if (plate || lamellar) {
    const steelColor = (shade = 1) => (t, a, p) => hmScale3(HM_STEEL, shade * (0.94 + 0.06 * Math.sin(p[0] * 18 + p[1] * 9)));
    const mirrored = (fn, side) => (x, a, d) => fn(x, side > 0 ? a : Math.PI - a, d);
    const rivets = (fn, t, a, count, name, color = HM_GOLD) => {
      for (let k = 0; k < count; k += 1) {
        const p = fn(hmMix(t[0], t[1], (k + 0.5) / count), a, 0.012);
        const q = fn(hmMix(t[0], t[1], (k + 0.5) / count), a, 0.017);
        metal(name, hmCone(p, q, 0.006, { sides: 4, color }));
      }
    };
    // Chanfron: a plate over the face from the poll to the nose, eye holes with a rim, a spike, ear guards.
    const faceRange = [0.01, 0.34];
    const eyeT = 0.115;
    const eyeA = 0.62;
    // Holes for the eyes (a rim is added round each).
    const faceKeep = (x, a) => Math.min(Math.hypot((x - eyeT) / 0.042, (a - eyeA) / 0.5), Math.hypot((x - eyeT) / 0.042, (a - (Math.PI - eyeA)) / 0.5)) > 1;
    const face = (x, a, d) => headFn(x, a, d);
    metal('head', hmShell(face, { t: faceRange, a: [0.5, Math.PI - 0.5], nt: low ? 5 : 12, na: low ? 4 : 10, infl: 0.012, lip: 0.005, edge: HM_EDGE, color: lamellar ? HM_LAMELLA : steelColor(), keep: low ? null : faceKeep }));
    if (!low) {
      for (const sign of [1, -1]) {
        const eyeP = headFn(eyeT, sign > 0 ? eyeA : Math.PI - eyeA, 0.016);
        const toward = vec.normalize(vec.sub(eyeP, headFn(eyeT, sign > 0 ? eyeA : Math.PI - eyeA, -0.02)));
        metal('head', hmRing(eyeP, toward, 0.03, 0.0045, { color: plate ? HM_STEEL2 : HM_GOLD }));
      }
      // Spike on the brow, a ridge down the nose, ear cups.
      const brow = headFn(0.045, Math.PI / 2, 0.012);
      const browOut = headFn(0.045, Math.PI / 2, 0.05);
      metal('head', hmCone(brow, [browOut[0] + 0.02 + 0.03 * 0, browOut[1] + 0.07, 0], 0.014, { sides: 6, color: HM_STEEL2 }));
      const ridge = [];
      for (let k = 0; k <= 10; k += 1) ridge.push([0.075 + (0.255 * k) / 10, Math.PI / 2]);
      metal('head', hmStrap(headFn, ridge, { width: 0.014, across: 'a', infl: 0.018, color: HM_STEEL2, radius: 0.05 }));
      for (const sign of [1, -1]) {
        const base = headFn(0.0, Math.PI / 2, 0.01);
        metal('head', hmCone([base[0] - 0.005, base[1] + 0.02, sign * 0.036], [base[0] - 0.012, base[1] + 0.085, sign * 0.04], 0.026, { sides: 6, color: plate ? HM_STEEL2 : HM_LAMELLA }));
      }
    }
    // Crinet: the neck covered in lames (plate) or laced rows (lamellar).
    const neckSpan = [0.07, 0.97];
    const crinetA = [0.1, Math.PI - 0.1];
    if (plate) {
      const lames = low ? 3 : 8;
      for (let k = 0; k < lames; k += 1) {
        const t0 = hmMix(neckSpan[0], neckSpan[1], k / lames);
        const t1 = hmMix(neckSpan[0], neckSpan[1], (k + 1) / lames + 0.02);
        metal('neck', hmShell(neckFn, { t: [t0, t1], a: [0.15, Math.PI - 0.15], nt: 2, na: low ? 4 : 8, infl: (t, a) => 0.012 + 0.008 * ((t - t0) / (t1 - t0)), lip: 0.003, edge: HM_EDGE, color: k % 2 ? steelColor(0.92) : steelColor() }));
      }
      if (!low) for (const sign of [1, -1]) rivets((x, a, d) => neckFn(x, sign > 0 ? a : Math.PI - a, d), neckSpan, 0.2, 'neck', 5);
    } else {
      metal('neck', low ? hmShell(neckFn, { t: neckSpan, a: crinetA, nt: 4, na: 6, infl: 0.012, color: HM_LAMELLA }) : hmPlates(neckFn, { t: neckSpan, a: crinetA, rows: 11, cols: 11, axis: 't', infl: 0.012, tilt: 0.008, over: 0.4, color: HM_LAMELLA }));
    }
    // Peytral, flanchards and crupper.
    const chest = { t: [0.27, 0.515], a: [Math.PI - 0.5, TAU + 0.5] };
    const rump = { t: [-0.6, -0.32], a: [-0.5, Math.PI + 0.5] };
    if (plate) {
      metal('body', hmShell(bodyFn, { ...chest, nt: low ? 4 : 10, na: low ? 6 : 16, infl: 0.014, lip: 0.005, edge: HM_EDGE, color: steelColor() }));
      metal('body', hmShell(bodyFn, { ...rump, nt: low ? 4 : 10, na: low ? 6 : 16, infl: 0.014, lip: 0.005, edge: HM_EDGE, color: steelColor() }));
      for (const sign of [1, -1]) {
        const fn = mirrored(bodyFn, sign);
        metal('body', hmShell(fn, { t: [-0.3, 0.02], a: [0.1, -0.85], nt: low ? 3 : 8, na: low ? 3 : 6, infl: 0.016, lip: 0.005, edge: HM_EDGE, color: steelColor(0.96) }));
        if (!low) {
          rivets(fn, [-0.28, 0.0], -0.05, 6, 'body');
          rivets((x, a, d) => bodyFn(x, sign > 0 ? a : Math.PI - a, d), [0.3, 0.5], 0.4, 4, 'body');
        }
      }
      if (!low) {
        // The peytral's rolled keel down the chest and the crupper's ridge along the spine.
        const keel = [];
        for (let k = 0; k <= 8; k += 1) keel.push([0.3 + (0.24 * k) / 8, TAU * 0.75]);
        metal('body', hmStrap(bodyFn, keel, { width: 0.022, across: 'a', infl: 0.024, color: HM_STEEL2, radius: 0.12 }));
        const spine = [];
        for (let k = 0; k <= 8; k += 1) spine.push([-0.58 + (0.24 * k) / 8, Math.PI / 2]);
        metal('body', hmStrap(bodyFn, spine, { width: 0.022, across: 'a', infl: 0.024, color: HM_STEEL2, radius: 0.12 }));
      }
    } else {
      // Lamellar over the chest, body and rump (open on the back for the saddle), skirts of laced plates to the knees.
      const rowsA = low ? 3 : 8;
      for (const sign of [1, -1]) {
        const fn = mirrored(bodyFn, sign);
        if (low) {
          metal('body', hmShell(fn, { t: [-0.55, 0.5], a: [1.2, -0.9], nt: 8, na: 4, infl: 0.014, lip: 0.003, color: (t, a) => (Math.floor((a + 2) * 6) % 2 ? HM_LAMELLA : hmScale3(HM_LAMELLA, 0.8)) }));
        } else {
          metal('body', hmPlates(fn, { t: [-0.56, 0.5], a: [1.2, -0.9], rows: rowsA + 2, cols: 40, axis: 'a', infl: 0.014, tilt: 0.01, over: 0.35, color: HM_LAMELLA, keep: (x, a) => !(a > 0.55 && x > seatX - 0.2 && x < seatX + 0.2) }));
          metal('body', hmPlates(fn, { t: [-0.56, 0.5], a: [-0.9, -1.55], rows: 4, cols: 40, axis: 'a', infl: 0.03, tilt: 0.04, over: 0.45, color: hmScale3(HM_LAMELLA, 0.92) }));
        }
      }
      metal('body', hmShell(bodyFn, { t: [0.36, 0.52], a: [Math.PI - 0.6, TAU + 0.6], nt: low ? 3 : 6, na: low ? 5 : 14, infl: 0.017, lip: 0.003, color: (t, a) => (Math.floor(t * 40) % 2 ? HM_LAMELLA : hmScale3(HM_LAMELLA, 0.82)) }));
    }
  }

  // ---- The trapper: a cloth skirt hung in columns from the barrel's top (the view hangs it)
  let trapper = null;
  if (spec.caparison && !low) {
    const columns = 9;
    const links = 4;
    const hung = [];
    for (const side of [1, -1]) {
      for (let i = 0; i < columns; i += 1) {
        const x = hmMix(-0.5, 0.27, i / (columns - 1));
        const pivot = bodyFn(x, side > 0 ? 0.62 : Math.PI - 0.62, 0.014);
        const drop = (0.5 - 0.06 * Math.abs(i / (columns - 1) - 0.4)) * (i % 2 ? 0.94 : 1);
        const rest = [];
        for (let j = 1; j <= links; j += 1) rest.push([x - 0.012 * j * (x < -0.2 ? 1 : 0), pivot[1] - (drop * j) / links, side * (Math.abs(pivot[2]) + 0.02 + 0.018 * j)]);
        hung.push({ side, pivot, rest });
      }
    }
    const rows = links + 1;
    const colors = [];
    const indices = [];
    [1, -1].forEach((side, sideIndex) => {
      for (let i = 0; i < columns; i += 1) {
        for (let r = 0; r < rows; r += 1) {
          const tone = r === rows - 1 ? HM_GOLD : r === rows - 2 ? hmLerp3(dyed, HM_GOLD, 0.35) : hmScale3(dyed, 0.92 + 0.08 * (i % 2));
          colors.push(...tone);
        }
      }
      const base = sideIndex * columns * rows;
      for (let i = 0; i < columns - 1; i += 1) {
        for (let r = 0; r < rows - 1; r += 1) {
          const a = base + i * rows + r;
          const b = base + (i + 1) * rows + r;
          indices.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
    });
    trapper = { columns, links, hung: hung.map((h) => ({ side: h.side, pivot: hmScale3(h.pivot, W), rest: h.rest.map((q) => hmScale3(q, W)) })), colors: new Float32Array(colors), indices: new Uint16Array(indices), vertices: columns * rows * 2 };
  }

  // ---- Assemble the parts from the accumulators
  const finishPart = (name, origin, scale = W) => {
    const soft = accs[`${name}.soft`] && accs[`${name}.soft`].p.length ? hmFinish(accs[`${name}.soft`], origin, scale) : null;
    const hard = accs[`${name}.metal`] && accs[`${name}.metal`].p.length ? hmFinish(accs[`${name}.metal`], origin, scale) : null;
    return { soft, metal: hard };
  };
  const earSide = [Math.sin(headAngle) * 0, 0];
  void earSide;
  const earBase = headFn(0.0, Math.PI / 2, -0.012);
  parts.body = finishPart('body', [0, 0, 0]);
  parts.neck = finishPart('neck', neckPivot);
  parts.head = finishPart('head', poll);
  parts.ear = finishPart('ear', [0, 0, 0]);
  parts.legs = {};
  for (const key of HORSE_LEGS_KEYS) {
    parts.legs[key] = {};
    for (const segName of ['upper', 'cannon', 'pastern', 'hoof']) parts.legs[key][segName] = finishPart(`leg.${key}.${segName}`, [0, 0, 0]);
  }

  // ---- Low detail: merge the neck and head into the body (still); legs keep their segments.
  const rig = {
    withers: W, neckPivot: hmScale3(neckPivot, W), poll: hmScale3(vec.sub(poll, neckPivot), W), earBase: hmScale3(vec.sub(earBase, poll), W), earSpread: 0.034 * W,
    headAngle, tailRoot: hmScale3(tailRoot, W), tailLength: build.tail.length * W, tailCarriage: carriage, tailLift: build.tail.lift,
    bit: hmScale3(vec.sub(bitAt, poll), W), saddle: { x: seatX * W, top: (hmBackAt(build, seatX) + 0.045) * W, bar: [(seatX + 0.02) * W, (hmBackAt(build, seatX) - 0.015) * W, 0.115 * W], pommel: [pommelX * W, (hmBackAt(build, pommelX) + 0.045 + sd.pommel) * W], cantle: [cantleX * W, (hmBackAt(build, cantleX) + 0.045 + sd.cantle) * W] },
    hind: HORSE_LEGS_KEYS.map((key) => key), lengths: { upper: LEG.upper * W, cannon: LEG.cannon * W, pastern: LEG.pastern * W, hoof: LEG.hoof * W },
    mane: { ...mane, tufts: mane.tufts.map((t) => ({ ...t, base: hmScale3(t.base, W), length: t.length * W, width: t.width * W, hw: t.hw * W, depth: t.depth * W })), count: mane.count },
    coat, dyed, trapper, low,
    // The bridle's reins start at the bit, the stirrup leathers at the saddle's bars.
    stirrupDrop: 0.4 * W,
  };

  let triangles = 0;
  // Draw calls the view makes besides these: the mane and tail hair (full detail), the trapper, two stirrups of two pieces, the reins.
  let pieces = low ? 1 : 2 + (trapper ? 1 : 0) + 4 + 1;
  if (trapper) triangles += trapper.indices.length / 3;
  if (!low) triangles += 11 * 4 + 7 * 10 + 2 * 20;
  const countGeometry = (g) => {
    if (!g) return;
    triangles += g.triangles;
    pieces += 1;
  };
  for (const key of ['body', 'neck', 'head', 'ear']) {
    countGeometry(parts[key].soft);
    countGeometry(parts[key].metal);
  }
  for (const key of HORSE_LEGS_KEYS) for (const segName of Object.keys(parts.legs[key])) {
    countGeometry(parts.legs[key][segName].soft);
  }
  return { key: horseModelKey(spec), spec, build, parts, rig, triangles, pieces, low };
}

const HORSE_LEGS_KEYS = ['lFore', 'rFore', 'lHind', 'rHind'];

/** What a model depends on (cache key). */
export function horseModelKey(spec) {
  return [spec.breed, spec.barding, spec.coat, spec.seed, spec.caparison ? 'c' : '-', spec.detail ?? 'full', spec.corner ?? '-'].join('|');
}
