// The lie of a kit place, baked once when it is built: a map from above of what stands where, worked out on the
// processor from the place's own triangles (townkit/geo.js batches) and its ground, and read by every kit material
// (townkit/weather.js) so that the weather and the dirt know where they are.
//
// Two sheets, one texel for each `texel` m of ground (no file: nothing is added to the page but this code):
//
//   A  red    the share of the sky a point on the ground sees (1 in the open; low under eaves, in a gate's passage,
//             under a bridge, in the angle of two walls): the shade that does not move with the sun;
//      green  how low the ground lies against what is round it (water stands in the low places, under open sky);
//      blue   wear: where feet and wheels go (the place's `ways`);
//      alpha  how the wind lays the snow: over 0.5 piled (against the windward foot of what stands), under it thin
//             (in the lee, scoured);
//   B  red    the top of the highest thing over the point (m, as a share of the sheet's range): what is under it is
//             under cover, and nothing falls or lies there;
//      green  the ground's own height (the same measure): a wall's foot is where the wall meets it;
//      blue   how near a wall's foot is (1 at it, 0 by `TK_LAY.wall.near` m): dirt, damp and weeds gather there;
//      alpha  spare (1).
//
// The sky's share is found by looking: from each point of the ground, rays in a few directions and at a few
// heights are walked outward over the map, stopped by walls (upright faces that rise from the ground) and by cover
// (what hangs over the ground: taken as `thick` m deep under its top).

import { tkFbm, tkHash } from './tex.js';

/** How the lie is measured. Lengths in metres. */
export const TK_LAY = {
  // A texel's side at each tier. 0.15 m: an eave's shade and a puddle's edge are a hand's width soft; the low tier's
  // sheets have a quarter of the texels.
  texel: { high: 0.15, low: 0.3 },
  // What stands this far over the ground is cover (a kerb or a step is not).
  cover: 0.5,
  // A wall: an upright face (its normal's y under `upright`) rising at least `rise` from within `foot` of the ground.
  // Dirt gathers within `near` of its foot.
  wall: { upright: 0.35, rise: 0.4, foot: 1.0, near: 2.0 },
  // The sky's share: worked out every `every` texels and spread between; `ways` directions (turned a little at each
  // point, so the pattern does not show) at these heights above the horizon (degrees), each weighing what a level
  // surface takes from its band of sky (sin^2 of the band's edges at 24.5 and 48 degrees); walked outward at these
  // distances (m). A roof is `thick` deep. Twelve metres is as far as a house's height throws its shade of the sky.
  sky: { every: 2, ways: 8, lifts: [14, 35, 62], weights: [0.172, 0.38, 0.448], steps: [0.25, 0.55, 0.95, 1.5, 2.3, 3.4, 5, 7.5, 11], thick: 0.35 },
  // The low places: settlement of laid ground (a slow unevenness `settle` m across, and a finer one), the real dips
  // of a ground with relief (against its mean over `dip` m; `dipGain` per m), and the worn middle of a way.
  hollow: { settle: 7, fine: 1.6, spread: 1.9, dip: 3, dipGain: 2.2, wear: 0.22 },
  // Snow in the wind: it piles within `windward` m of the windward foot of what stands at least `stands` high, and
  // is thin for `lee` m behind it.
  drift: { windward: 3.5, lee: 7, stands: 0.8 },
  // Materials that are not built things: left out of the map.
  skip: ['water', 'ice', 'foliage', 'needles', 'lattice', 'bark', 'tuft', 'scrap', 'icicle', 'cloth'],
};

const layClamp = (value) => Math.max(0, Math.min(1, value));
const laySmooth = (a, b, x) => {
  const t = layClamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Bake the lie of a place. `batches`: every builder's batches (geo.js), level 'all' and 'far' are read; `box`:
 * { x: [from, to], z: [from, to] }; `ground(x, z)`: the ground's height; `ways`: [{ line: [[x, z], ...], half, kind:
 * 'foot' | 'cart', strength }] where feet and wheels go; `wind`: [x, z] the way the wind blows; `texel`: m.
 * Returns { a, b: Uint8Array (RGBA), width, height, min: [x, z], size: [w, d], base, range, texel, ms, at(x, z) }.
 */
export function tkLayBake({ batches, box, ground, ways = [], wind = [1, 0], texel = TK_LAY.texel.high, seed = 1, skip = TK_LAY.skip }) {
  const started = typeof performance !== 'undefined' ? performance.now() : 0;
  const min = [box.x[0], box.z[0]];
  const size = [box.x[1] - box.x[0], box.z[1] - box.z[0]];
  const width = Math.max(4, Math.round(size[0] / texel));
  const height = Math.max(4, Math.round(size[1] / texel));
  const [tx, tz] = [size[0] / width, size[1] / height];
  const count = width * height;
  const groundAt = new Float32Array(count);
  const top = new Float32Array(count);
  const wallHigh = new Float32Array(count).fill(-1e6);
  const wallLow = new Float32Array(count).fill(1e6);
  for (let j = 0; j < height; j += 1) {
    const z = min[1] + (j + 0.5) * tz;
    for (let i = 0; i < width; i += 1) groundAt[j * width + i] = ground(min[0] + (i + 0.5) * tx, z);
  }
  top.set(groundAt);

  // What is built, from above: each triangle's own height at the texels it covers; an upright one is a line.
  const left = new Set(skip);
  const raise = (i, j, y) => {
    if (i < 0 || j < 0 || i >= width || j >= height) return;
    const at = j * width + i;
    if (y > top[at]) top[at] = y;
  };
  for (const batch of batches) {
    if (batch.level === 'near' || left.has(batch.material)) continue;
    const { position: p, normal } = batch;
    for (let k = 0; k + 8 < p.length; k += 9) {
      const ax = (p[k] - min[0]) / tx, az = (p[k + 2] - min[1]) / tz, ay = p[k + 1];
      const bx = (p[k + 3] - min[0]) / tx, bz = (p[k + 5] - min[1]) / tz, by = p[k + 4];
      const cx = (p[k + 6] - min[0]) / tx, cz = (p[k + 8] - min[1]) / tz, cy = p[k + 7];
      const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const i1 = Math.min(width - 1, Math.floor(Math.max(ax, bx, cx)));
      const j0 = Math.max(0, Math.floor(Math.min(az, bz, cz)));
      const j1 = Math.min(height - 1, Math.floor(Math.max(az, bz, cz)));
      if (i1 < i0 || j1 < j0) continue;
      const ny = Math.abs((normal[k + 1] + normal[k + 4] + normal[k + 7]) / 3);
      if (ny < TK_LAY.wall.upright) {
        // Upright: walked along its longest side on the map, as a wall from its lowest to its highest point.
        const high = Math.max(ay, by, cy);
        const low = Math.min(ay, by, cy);
        const ends = [[ax, az, bx, bz], [bx, bz, cx, cz], [cx, cz, ax, az]].sort((s, t) => Math.hypot(t[2] - t[0], t[3] - t[1]) - Math.hypot(s[2] - s[0], s[3] - s[1]))[0];
        const steps = Math.max(1, Math.ceil(Math.hypot(ends[2] - ends[0], ends[3] - ends[1]) * 2));
        for (let s = 0; s <= steps; s += 1) {
          const i = Math.floor(ends[0] + ((ends[2] - ends[0]) * s) / steps);
          const j = Math.floor(ends[1] + ((ends[3] - ends[1]) * s) / steps);
          if (i < 0 || j < 0 || i >= width || j >= height) continue;
          const at = j * width + i;
          if (high > wallHigh[at]) wallHigh[at] = high;
          if (low < wallLow[at]) wallLow[at] = low;
          if (high > top[at]) top[at] = high;
        }
        continue;
      }
      const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
      raise(Math.floor((ax + bx + cx) / 3), Math.floor((az + bz + cz) / 3), (ay + by + cy) / 3);
      if (Math.abs(area) < 1e-9) continue;
      for (let j = j0; j <= j1; j += 1) {
        for (let i = i0; i <= i1; i += 1) {
          const [x, z] = [i + 0.5, j + 0.5];
          const u = ((bx - x) * (cz - z) - (cx - x) * (bz - z)) / area;
          const v = ((cx - x) * (az - z) - (ax - x) * (cz - z)) / area;
          const w = 1 - u - v;
          if (u < -0.02 || v < -0.02 || w < -0.02) continue;
          const y = u * ay + v * by + w * cy;
          const at = j * width + i;
          if (y > top[at]) top[at] = y;
        }
      }
    }
  }

  // What each texel is: 1 cover (something over the ground), 2 a wall rising from it.
  const kind = new Uint8Array(count);
  for (let at = 0; at < count; at += 1) {
    const g = groundAt[at];
    if (wallHigh[at] - g > TK_LAY.wall.rise && wallLow[at] - g < TK_LAY.wall.foot) kind[at] = 2;
    else if (top[at] - g > TK_LAY.cover) kind[at] = 1;
  }

  // Blocks of 16 texels that have anything standing in or beside them (within the sky's reach): the open ground
  // beyond them is passed over.
  const cell = 16;
  const [bw, bh] = [Math.ceil(width / cell), Math.ceil(height / cell)];
  const built = new Uint8Array(bw * bh);
  for (let j = 0; j < height; j += 1) for (let i = 0; i < width; i += 1) if (kind[j * width + i]) built[(j >> 4) * bw + (i >> 4)] = 1;
  const reach = Math.ceil(TK_LAY.sky.steps[TK_LAY.sky.steps.length - 1] / (cell * Math.min(tx, tz)));
  const busy = new Uint8Array(bw * bh);
  for (let j = 0; j < bh; j += 1) {
    for (let i = 0; i < bw; i += 1) {
      if (!built[j * bw + i]) continue;
      for (let dj = -reach; dj <= reach; dj += 1) for (let di = -reach; di <= reach; di += 1) if (i + di >= 0 && j + dj >= 0 && i + di < bw && j + dj < bh) busy[(j + dj) * bw + i + di] = 1;
    }
  }

  // The sky's share, every few texels.
  const { every, ways: wayCount, lifts, weights, steps, thick } = TK_LAY.sky;
  const [sw, sh] = [Math.ceil(width / every), Math.ceil(height / every)];
  const sky = new Float32Array(sw * sh).fill(1);
  const tans = lifts.map((lift) => Math.tan((lift * Math.PI) / 180));
  for (let j = 0; j < sh; j += 1) {
    for (let i = 0; i < sw; i += 1) {
      const [pi, pj] = [Math.min(width - 1, i * every), Math.min(height - 1, j * every)];
      if (!busy[(pj >> 4) * bw + (pi >> 4)]) continue;
      const here = pj * width + pi;
      // (A point inside a wall's own thickness sees what the ground just outside it does: left for the spread below.)
      const y0 = groundAt[here] + 0.05;
      const turn = tkHash(i, j, seed) * Math.PI * 2;
      let seen = 0;
      for (let way = 0; way < wayCount; way += 1) {
        const angle = turn + (way * Math.PI * 2) / wayCount;
        const [dx, dz] = [Math.cos(angle) / tx, Math.sin(angle) / tz];
        for (let lift = 0; lift < tans.length; lift += 1) {
          let open = 1;
          let before = y0;
          for (let s = 0; s < steps.length; s += 1) {
            const d = steps[s];
            const [qi, qj] = [Math.floor(pi + 0.5 + dx * d), Math.floor(pj + 0.5 + dz * d)];
            if (qi < 0 || qj < 0 || qi >= width || qj >= height) break;
            const at = qj * width + qi;
            const ray = y0 + d * tans[lift];
            const what = kind[at];
            if (what === 2 && at !== here ? ray < wallHigh[at] : what === 1 && ray > top[at] - thick && before < top[at]) {
              open = 0;
              break;
            }
            before = ray;
          }
          seen += open * weights[lift];
        }
      }
      sky[j * sw + i] = seen / wayCount;
    }
  }
  // Spread once (a 3 x 3 mean): the turned directions leave a grain.
  const spread = new Float32Array(sw * sh);
  for (let j = 0; j < sh; j += 1) {
    for (let i = 0; i < sw; i += 1) {
      let sum = 0;
      let total = 0;
      for (let dj = -1; dj <= 1; dj += 1) {
        for (let di = -1; di <= 1; di += 1) {
          const [qi, qj] = [i + di, j + dj];
          if (qi < 0 || qj < 0 || qi >= sw || qj >= sh) continue;
          const weight = (di ? 1 : 2) * (dj ? 1 : 2);
          sum += sky[qj * sw + qi] * weight;
          total += weight;
        }
      }
      spread[j * sw + i] = sum / total;
    }
  }

  // How near a wall's foot: a two-pass distance over the map (3-4 chamfer), in texels.
  const far = 1e6;
  const dist = new Float32Array(count);
  for (let at = 0; at < count; at += 1) dist[at] = kind[at] === 2 ? 0 : far;
  const [straight, slant] = [1, Math.SQRT2];
  for (let j = 0; j < height; j += 1) {
    for (let i = 0; i < width; i += 1) {
      const at = j * width + i;
      let d = dist[at];
      if (i > 0) d = Math.min(d, dist[at - 1] + straight);
      if (j > 0) {
        d = Math.min(d, dist[at - width] + straight);
        if (i > 0) d = Math.min(d, dist[at - width - 1] + slant);
        if (i < width - 1) d = Math.min(d, dist[at - width + 1] + slant);
      }
      dist[at] = d;
    }
  }
  for (let j = height - 1; j >= 0; j -= 1) {
    for (let i = width - 1; i >= 0; i -= 1) {
      const at = j * width + i;
      let d = dist[at];
      if (i < width - 1) d = Math.min(d, dist[at + 1] + straight);
      if (j < height - 1) {
        d = Math.min(d, dist[at + width] + straight);
        if (i < width - 1) d = Math.min(d, dist[at + width + 1] + slant);
        if (i > 0) d = Math.min(d, dist[at + width - 1] + slant);
      }
      dist[at] = d;
    }
  }

  // Wear: each way's line, worn most along its middle (feet) or in two ruts (wheels, 1.4 m apart: a cart's gauge, approximate).
  const wear = new Float32Array(count);
  for (const way of ways) {
    const strength = way.strength ?? 1;
    for (let k = 0; k + 1 < way.line.length; k += 1) {
      const [a, b] = [way.line[k], way.line[k + 1]];
      const pad = way.half + 0.5;
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - pad - min[0]) / tx));
      const i1 = Math.min(width - 1, Math.ceil((Math.max(a[0], b[0]) + pad - min[0]) / tx));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - pad - min[1]) / tz));
      const j1 = Math.min(height - 1, Math.ceil((Math.max(a[1], b[1]) + pad - min[1]) / tz));
      const [ex, ez] = [b[0] - a[0], b[1] - a[1]];
      const length2 = ex * ex + ez * ez || 1;
      for (let j = j0; j <= j1; j += 1) {
        const z = min[1] + (j + 0.5) * tz;
        for (let i = i0; i <= i1; i += 1) {
          const x = min[0] + (i + 0.5) * tx;
          const along = layClamp(((x - a[0]) * ex + (z - a[1]) * ez) / length2);
          const off = Math.hypot(x - a[0] - ex * along, z - a[1] - ez * along);
          let worn = 1 - laySmooth(way.half * 0.35, way.half, off);
          if (way.kind === 'cart') worn = Math.max(worn * 0.55, 1 - laySmooth(0.12, 0.34, Math.abs(off - 0.7)));
          const at = j * width + i;
          if (worn * strength > wear[at]) wear[at] = worn * strength;
        }
      }
    }
  }

  // The two sheets.
  let [base, most] = [1e6, -1e6];
  for (let at = 0; at < count; at += 1) {
    if (groundAt[at] < base) base = groundAt[at];
    if (top[at] > most) most = top[at];
  }
  base = Math.floor(base) - 1;
  const range = Math.max(8, Math.ceil(most + 1 - base));
  const a = new Uint8Array(count * 4);
  const b = new Uint8Array(count * 4);
  const windLength = Math.hypot(wind[0], wind[1]) || 1;
  const [wx, wz] = [wind[0] / windLength / tx, wind[1] / windLength / tz];
  const stride = Math.max(tx, tz) * 1.5;
  const { hollow: low, drift } = TK_LAY;
  const dipCells = Math.max(1, Math.round(low.dip / tx));
  const skyAt = (i, j) => {
    const [u, v] = [Math.min(sw - 1.001, i / every), Math.min(sh - 1.001, j / every)];
    const [i0, j0] = [Math.floor(u), Math.floor(v)];
    const [fu, fv] = [u - i0, v - j0];
    const [i1, j1] = [Math.min(sw - 1, i0 + 1), Math.min(sh - 1, j0 + 1)];
    return (spread[j0 * sw + i0] * (1 - fu) + spread[j0 * sw + i1] * fu) * (1 - fv) + (spread[j1 * sw + i0] * (1 - fu) + spread[j1 * sw + i1] * fu) * fv;
  };
  const stands = (i, j, g) => {
    if (i < 0 || j < 0 || i >= width || j >= height) return 0;
    const at = j * width + i;
    return kind[at] ? top[at] - g : 0;
  };
  for (let j = 0; j < height; j += 1) {
    const z = min[1] + (j + 0.5) * tz;
    for (let i = 0; i < width; i += 1) {
      const at = j * width + i;
      const x = min[0] + (i + 0.5) * tx;
      const g = groundAt[at];
      const under = kind[at] === 1 ? 1 : 0;
      const isBusy = busy[(j >> 4) * bw + (i >> 4)];
      // Low places: under open sky only.
      let dip = 0;
      if (dipCells > 0) {
        const around = (groundAt[j * width + Math.max(0, i - dipCells)] + groundAt[j * width + Math.min(width - 1, i + dipCells)] + groundAt[Math.max(0, j - dipCells) * width + i] + groundAt[Math.min(height - 1, j + dipCells) * width + i]) / 4;
        dip = (around - g) * low.dipGain;
      }
      // (The slow noise keeps to the middle of its range: spread, so that a tenth of laid ground is low enough to hold water.)
      const settle = layClamp((tkFbm(x / (low.settle * 64) + 0.31, z / (low.settle * 64) + 0.57, 64, 2, seed + 3) - 0.5) * low.spread + 0.5) * 0.72 + tkFbm(x / (low.fine * 256) + 0.11, z / (low.fine * 256) + 0.43, 256, 1, seed + 5) * 0.16;
      const hollow = layClamp(settle + dip + low.wear * wear[at]) * (1 - under);
      // The wind's snow: look downwind for something to pile against, upwind for something to shelter behind.
      let lay = 0.5;
      if (isBusy && !kind[at]) {
        let pile = 0;
        let lee = 0;
        for (let d = stride; d <= drift.windward; d += stride) {
          const tall = stands(Math.floor(i + 0.5 + wx * d), Math.floor(j + 0.5 + wz * d), g);
          if (tall > drift.stands) {
            pile = 1 - d / drift.windward;
            break;
          }
        }
        for (let d = stride; d <= drift.lee; d += stride) {
          const tall = stands(Math.floor(i + 0.5 - wx * d), Math.floor(j + 0.5 - wz * d), g);
          if (tall > drift.stands) {
            lee = (1 - d / drift.lee) * Math.min(1, tall / 3);
            break;
          }
        }
        lay = layClamp(0.5 + 0.5 * pile - 0.45 * lee * (1 - pile));
      }
      a[at * 4] = Math.round(255 * layClamp(isBusy ? skyAt(i, j) : 1));
      a[at * 4 + 1] = Math.round(255 * hollow);
      a[at * 4 + 2] = Math.round(255 * layClamp(wear[at]));
      a[at * 4 + 3] = Math.round(255 * lay);
      b[at * 4] = Math.round(255 * layClamp((top[at] - base) / range));
      b[at * 4 + 1] = Math.round(255 * layClamp((g - base) / range));
      b[at * 4 + 2] = Math.round(255 * layClamp(1 - (dist[at] * Math.min(tx, tz)) / TK_LAY.wall.near));
      b[at * 4 + 3] = 255;
    }
  }

  const lay = { a, b, width, height, min, size, base, range, texel, ms: (typeof performance !== 'undefined' ? performance.now() : 0) - started };
  /** What the map says at (x, z): { top, ground, sky, hollow, wear, drift, wall } (the nearest texel's; outside it, open level ground). */
  lay.at = (x, z) => {
    const i = Math.floor((x - min[0]) / tx);
    const j = Math.floor((z - min[1]) / tz);
    if (i < 0 || j < 0 || i >= width || j >= height) return { top: ground(x, z), ground: ground(x, z), sky: 1, hollow: 0, wear: 0, drift: 0.5, wall: 0, kind: 0 };
    const at = j * width + i;
    return { top: top[at], ground: groundAt[at], sky: a[at * 4] / 255, hollow: a[at * 4 + 1] / 255, wear: a[at * 4 + 2] / 255, drift: a[at * 4 + 3] / 255, wall: b[at * 4 + 2] / 255, kind: kind[at] };
  };
  return lay;
}

/** The two sheets as textures (drawn smooth, held at their edges). */
export function tkLayTextures(lay) {
  const make = (data) => {
    const texture = new THREE.DataTexture(data, lay.width, lay.height, THREE.RGBAFormat);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  };
  return { a: make(lay.a), b: make(lay.b) };
}
