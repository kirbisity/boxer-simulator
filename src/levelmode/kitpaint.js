// The castle kit's painters: the stone, ground and wall textures, drawn pixel by pixel from noise and Voronoi cells so that no
// two stones are alike and no course is a ruler's line. What made the subway station (props/subway.js) read as real was
// the same few things: big textures with a lot in them (grime at three scales, a few rare marks), tones that wander
// from one block to the next, and edges that catch light; these painters do that for rock and masonry. Each takes
// `(g, size, random)` (a 2D context, its side in px, a seeded generator) and fills the canvas, tiling.
// kittex.js lays them over the castle and breaks what repetition is left in the shader.

/** A small seeded generator (mulberry32). */
export function ktRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ktClamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const ktSmoothstep = (a, b, x) => {
  const t = ktClamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Periodic fractal value noise, `size` by `size`, 0..1. `octaves`: [[cells across the tile, weight]...]; every octave
 * wraps, so the field tiles. (Cached: the same field serves every texture of that size, each reading it from its own offset.)
 */
const ktFields = new Map();
export function ktField(size, seed, octaves) {
  const key = `${size}|${seed}|${octaves.map((o) => o.join(':')).join(',')}`;
  if (ktFields.has(key)) return ktFields.get(key);
  const random = ktRandom(seed);
  const out = new Float32Array(size * size);
  let total = 0;
  const xi0 = new Int32Array(size);
  const xi1 = new Int32Array(size);
  const xs = new Float32Array(size);
  for (const [cells, weight] of octaves) {
    total += weight;
    const lattice = new Float32Array(cells * cells);
    for (let k = 0; k < lattice.length; k += 1) lattice[k] = random();
    for (let x = 0; x < size; x += 1) {
      const fx = (x * cells) / size;
      const ix = Math.floor(fx);
      const tx = fx - ix;
      xi0[x] = ix % cells;
      xi1[x] = (ix + 1) % cells;
      xs[x] = tx * tx * (3 - 2 * tx);
    }
    for (let y = 0; y < size; y += 1) {
      const fy = (y * cells) / size;
      const iy = Math.floor(fy);
      const ty = fy - iy;
      const sy = ty * ty * (3 - 2 * ty);
      const row0 = (iy % cells) * cells;
      const row1 = ((iy + 1) % cells) * cells;
      for (let x = 0; x < size; x += 1) {
        const sx = xs[x];
        const a = lattice[row0 + xi0[x]];
        const b = lattice[row0 + xi1[x]];
        const c = lattice[row1 + xi0[x]];
        const d = lattice[row1 + xi1[x]];
        out[y * size + x] += weight * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
  }
  for (let k = 0; k < out.length; k += 1) out[k] /= total;
  ktFields.set(key, out);
  return out;
}

/** The two fields every painter reads (each from an offset of its own, so they differ): swells (coarse), and grain (fine). */
const ktCoarse = (size) => ktField(size, 901, [[6, 1], [12, 0.6], [24, 0.35]]);
const ktFine = (size) => ktField(size, 903, [[48, 1], [96, 0.6], [192, 0.4]]);

/** A field read at (x, y) shifted by (ox, oy), wrapping (`size` a power of two). */
const ktAt = (field, size, x, y, ox = 0, oy = 0) => field[((y + oy) & (size - 1)) * size + ((x + ox) & (size - 1))];

/** A grey-scale-multiplied colour as CSS. */
export const ktShade = (rgb, k) => `rgb(${Math.max(0, Math.min(255, rgb[0] * k)) | 0},${Math.max(0, Math.min(255, rgb[1] * k)) | 0},${Math.max(0, Math.min(255, rgb[2] * k)) | 0})`;

/** Speckle: noise that gives a surface grain. */
export function ktGrain(g, size, random, count, alpha, light = 255, dark = 0) {
  for (let index = 0; index < count; index += 1) {
    const shade = random() < 0.5 ? dark : light;
    g.fillStyle = `rgba(${shade},${shade},${shade},${random() * alpha})`;
    g.fillRect(random() * size, random() * size, 1 + random() * 2, 1 + random() * 2);
  }
}

/** A soft round stain at (px, py), drawn again over each edge it crosses so that it tiles. */
function ktStain(g, size, px, py, radius, rgb, alpha) {
  for (const ox of [0, size, -size]) {
    for (const oy of [0, size, -size]) {
      const x = px + ox;
      const y = py + oy;
      if (x + radius < 0 || x - radius > size || y + radius < 0 || y - radius > size) continue;
      const gradient = g.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(${rgb},${alpha})`);
      gradient.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gradient;
      g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }
}

// ---- masonry -------------------------------------------------------------------------------------------

/**
 * Courses of dressed or rough blocks. Courses are not all one height and blocks not all one length; each stone has its own
 * tone and warmth (a few are brick-red, a few have fallen out), its own bevel and joint, and weathers (pits, lichen,
 * moss in the joints) by the noise, so that the wall has a hand in it. `rows`: [shortest, tallest] course in px;
 * `lengths` likewise; `px` per metre is up to the tile's size (the kit tiles it over 4 m).
 */
function ktMasonry(g, size, random, { base, rows, lengths, variance, mortar, moss = 0.3, lichen = 0.3, brick = 0.03, voids = 0, bevel = 0.22, joint = [1.5, 4.5], seed = 1 }) {
  const image = g.createImageData(size, size);
  const d = image.data;
  const coarse = ktCoarse(size);
  const fine = ktFine(size);
  // The mortar and the dark fill of a lost stone.
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const k = (y * size + x) * 4;
      const n = 0.6 + 0.8 * fine[y * size + x];
      d[k] = mortar[0] * n;
      d[k + 1] = mortar[1] * n;
      d[k + 2] = mortar[2] * n;
      d[k + 3] = 255;
    }
  }
  const heights = [];
  let sum = 0;
  while (sum < size - rows[0]) {
    const h = rows[0] + random() * (rows[1] - rows[0]);
    heights.push(h);
    sum += h;
  }
  const scale = size / sum;
  let y = 0;
  const stones = [];
  heights.forEach((h0, rowIndex) => {
    const h = h0 * scale;
    let x = -random() * lengths[1];
    while (x < size) {
      const length = lengths[0] + random() * (lengths[1] - lengths[0]) * (random() < 0.2 ? 0.55 : 1);
      const kind = random();
      const lost = kind < voids;
      const red = !lost && kind > 1 - brick;
      const tone = (1 + (random() - 0.5) * variance) * (random() < 0.12 ? 0.8 : 1);
      const warm = (random() - 0.5) * 0.16;
      const colour = red ? [base[0] * 1.12, base[1] * 0.9, base[2] * 0.82] : [base[0] * (1 + warm), base[1] * (1 + warm * 0.3), base[2] * (1 - warm)];
      const gapTop = joint[0] + random() * (joint[1] - joint[0]);
      const gapSide = joint[0] + random() * (joint[1] - joint[0]);
      const offset = Math.floor(random() * size);
      stones.push({ x, y, w: length, h, rowIndex });
      const x0 = Math.round(x);
      const x1 = Math.round(x + length);
      const y0 = Math.round(y);
      const y1 = Math.round(y + h);
      if (!lost) {
        for (let py = y0; py < y1; py += 1) {
          for (let px = x0; px < x1; px += 1) {
            const dl = px - x0 - gapSide;
            const dr = x1 - 1 - px - gapSide;
            const dt = py - y0 - gapTop;
            const db = y1 - 1 - py - gapTop * 0.6;
            const e = Math.min(dl, dr, dt, db);
            if (e < 0) continue;
            const wx = ((px % size) + size) % size;
            const index = (py * size + wx);
            const w = bevel * 22;
            // A lit top and left, a dark foot and right: the stone stands proud of its joint.
            let light = 1;
            if (dt < w) light += (1 - dt / w) * bevel * 1.1;
            if (dl < w) light += (1 - dl / w) * bevel * 0.5;
            if (db < w) light -= (1 - db / w) * bevel * 1.6;
            if (dr < w) light -= (1 - dr / w) * bevel * 0.8;
            // The face: soft blotches of its own and fine grain, and the odd pit.
            const blotch = 0.8 + 0.4 * ktAt(coarse, size, wx, py, offset, offset * 3);
            const grain = 0.8 + 0.4 * ktAt(fine, size, wx, py, offset * 5, offset);
            const pit = ktAt(fine, size, wx, py, offset * 7, offset * 2) > 0.76 ? 0.56 : 1;
            // (The edges of a stone crumble: dark at the joint, coming up to the face over a dozen pixels.)
            const edge = 0.58 + 0.42 * ktSmoothstep(0, 12, e);
            const k = index * 4;
            const f = tone * light * blotch * grain * pit * edge;
            d[k] = colour[0] * f;
            d[k + 1] = colour[1] * f;
            d[k + 2] = colour[2] * f;
          }
        }
      } else {
        // The dark of a lost stone: its bed, in shadow.
        for (let py = y0 + 1; py < y1 - 1; py += 1) {
          for (let px = x0 + 2; px < x1 - 2; px += 1) {
            const wx = ((px % size) + size) % size;
            const k = (py * size + wx) * 4;
            const f = 0.7 + 0.9 * ktAt(fine, size, wx, py, offset, offset) * ktAt(coarse, size, wx, py, offset * 3, offset);
            d[k] = mortar[0] * f * 1.5;
            d[k + 1] = mortar[1] * f * 1.5;
            d[k + 2] = mortar[2] * f * 1.5;
          }
        }
      }
      x += length;
    }
    y += h;
  });
  g.putImageData(image, 0, 0);
  // Lichen: round pale and ochre discs on the faces; moss in the joints and on the tops of the stones.
  const spots = Math.floor(260 * lichen);
  for (let k = 0; k < spots; k += 1) {
    const px = random() * size;
    const py = random() * size;
    const r = 2 + random() * 9;
    const tone = random();
    ktStain(g, size, px, py, r, tone < 0.4 ? '170,160,92' : tone < 0.75 ? '150,150,128' : '110,126,78', 0.18 + random() * 0.32);
  }
  for (const stone of stones) {
    if (random() > moss * 0.9) continue;
    const mx = stone.x + random() * stone.w;
    const my = stone.y + (random() < 0.7 ? 1 : stone.h - 2);
    const r = 6 + random() * 18;
    ktStain(g, size, mx, my, r, `${54 + random() * 20},${72 + random() * 26},${34 + random() * 14}`, 0.35 + random() * 0.45);
  }
  // Chipped corners: a dark notch where a corner has broken away, and the paler stone it laid bare beside it.
  for (const stone of stones) {
    if (random() > 0.4) continue;
    const right = random() < 0.5;
    const cx = right ? stone.x + stone.w - 2 : stone.x + 2;
    const cy = random() < 0.6 ? stone.y + stone.h - 2 : stone.y + 2;
    const r = 3 + random() * 7;
    g.fillStyle = 'rgba(18,16,14,0.6)';
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + (right ? -r : r), cy);
    g.lineTo(cx, cy + (cy > stone.y + stone.h / 2 ? -r : r));
    g.fill();
    g.fillStyle = 'rgba(165,152,132,0.28)';
    g.fillRect(cx + (right ? -r - 3 : r), cy - 1, 3, 2);
  }
  ktGrime(g, size, random, 1);
}

/**
 * Dirt over a finished texture: rain streaks running down below the joints (long, uneven, some doubled), soot-dark blotches broad and soft, and a few
 * pale runs of salt. `strength` 1 for a wall, less for a floor (that is walked on).
 */
function ktGrime(g, size, random, strength = 1) {
  for (let k = 0; k < 90 * strength; k += 1) {
    const px = random() * size;
    const py = random() * size;
    const width = 1 + random() * 3.5;
    const length = 20 + random() * 120;
    const gradient = g.createLinearGradient(0, py, 0, py + length);
    gradient.addColorStop(0, `rgba(10,10,12,${(0.08 + random() * 0.14) * strength})`);
    gradient.addColorStop(1, 'rgba(10,10,12,0)');
    g.fillStyle = gradient;
    g.fillRect(px, py, width, length);
  }
  for (let k = 0; k < 28 * strength; k += 1) ktStain(g, size, random() * size, random() * size, 22 + random() * 50, '16,14,12', (0.07 + random() * 0.12) * strength);
  for (let k = 0; k < 14 * strength; k += 1) {
    const px = random() * size;
    const py = random() * size;
    g.fillStyle = `rgba(196,192,176,${0.07 + random() * 0.1})`;
    g.fillRect(px, py, 1 + random() * 2, 10 + random() * 40);
  }
}

/** Dressed stone: neat courses, tight joints, a few red bricks and the odd lost stone. */
export function ktAshlar(g, size, random) {
  ktMasonry(g, size, random, { base: [130, 122, 110], rows: [34, 62], lengths: [78, 190], variance: 0.34, mortar: [58, 55, 50], moss: 0.18, lichen: 0.4, brick: 0.02, voids: 0, bevel: 0.2, joint: [1.4, 3.6], seed: 1 });
}

/** Ruined walling: ragged courses, many stones lost, thick joints, moss and lichen over all. */
export function ktRuinWall(g, size, random) {
  ktMasonry(g, size, random, { base: [112, 108, 98], rows: [28, 70], lengths: [60, 170], variance: 0.5, mortar: [44, 44, 38], moss: 1, lichen: 0.9, brick: 0.04, voids: 0.04, bevel: 0.28, joint: [2.5, 6], seed: 2 });
}

// ---- Voronoi stones ------------------------------------------------------------------------------------

/**
 * Stones packed as Voronoi cells (a grid of `cellsX` by `cellsY` jittered sites, wrapping, so the tile tiles): each cell is one stone with its own tone,
 * size (an additive weight) and dome; the narrow ground between cells is the joint. Stretching the grid (more cells down than across)
 * makes flat stones; a big jitter makes them irregular.
 */
function ktVoronoi(g, size, random, { cellsX, cellsY, jitter = 0.45, weight = 0.25, base, variance = 0.5, warm = 0.12, mortar, gap = 1.6, soft = 3, dome = 0.5, light = [-0.6, -0.8], grain = 0.14, seed = 1, edgeDark = 0.3 }) {
  const cw = size / cellsX;
  const ch = size / cellsY;
  const sites = [];
  for (let cy = 0; cy < cellsY; cy += 1) {
    for (let cx = 0; cx < cellsX; cx += 1) {
      const sx = (cx + 0.5 + (random() - 0.5) * 2 * jitter) * cw;
      const sy = (cy + 0.5 + (random() - 0.5) * 2 * jitter) * ch;
      const w = (random() - 0.5) * 2 * weight * Math.min(cw, ch);
      const tone = ktClamp(1 + (random() - 0.5) * variance * (random() < 0.15 ? 1.7 : 1), 0.25, 1.9);
      const hue = (random() - 0.5) * warm * 2;
      sites.push({ x: sx, y: sy, w, tone, hue, offset: Math.floor(random() * size) });
    }
  }
  const fine = ktFine(size);
  const coarse = ktCoarse(size);
  const image = g.createImageData(size, size);
  const data = image.data;
  const radius = Math.min(cw, ch) * 0.62;
  for (let y = 0; y < size; y += 1) {
    const cy0 = Math.floor(y / ch);
    for (let x = 0; x < size; x += 1) {
      const cx0 = Math.floor(x / cw);
      let d1 = 1e9;
      let d2 = 1e9;
      let bestSite = null;
      let bdx = 0;
      let bdy = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        const cy = cy0 + oy;
        const wrapY = Math.floor(cy / cellsY) * size;
        const row = ((cy % cellsY) + cellsY) % cellsY;
        for (let ox = -1; ox <= 1; ox += 1) {
          const cx = cx0 + ox;
          const wrapX = Math.floor(cx / cellsX) * size;
          const site = sites[row * cellsX + (((cx % cellsX) + cellsX) % cellsX)];
          const dx = x - (site.x + wrapX);
          const dy = y - (site.y + wrapY);
          const dist = Math.sqrt(dx * dx + dy * dy) - site.w;
          if (dist < d1) {
            d2 = d1;
            d1 = dist;
            bestSite = site;
            bdx = dx;
            bdy = dy;
          } else if (dist < d2) d2 = dist;
        }
      }
      const edge = (d2 - d1) * 0.5;
      const k = (y * size + x) * 4;
      const n = ktAt(fine, size, x, y);
      if (edge < gap) {
        const f = 0.55 + 0.9 * n;
        data[k] = mortar[0] * f;
        data[k + 1] = mortar[1] * f;
        data[k + 2] = mortar[2] * f;
        data[k + 3] = 255;
        continue;
      }
      const site = bestSite;
      const dx = bdx;
      const dy = bdy;
      const lit = ktClamp((dx * light[0] + dy * light[1]) / radius, -1, 1);
      const bowl = ktClamp(1 - (d1 + site.w) / (radius * 1.3), 0, 1);
      const shade = 1 + dome * lit * (0.25 + 0.75 * (1 - bowl)) - edgeDark * (1 - ktSmoothstep(gap, gap + soft * 2.2, edge)) - 0.15 * (1 - bowl);
      const blotch = 0.78 + 0.44 * ktAt(coarse, size, x, y, site.offset, site.offset * 3);
      const grainValue = 1 + (ktAt(fine, size, x, y, site.offset * 5, site.offset) - 0.5) * grain * 3;
      // (A pitted, uneven face: small holes where the fine noise peaks.)
      const pitted = ktAt(fine, size, x, y, site.offset * 7, site.offset * 2) > 0.74 ? 0.55 : 1;
      const f = site.tone * shade * blotch * grainValue * pitted;
      data[k] = base[0] * (1 + site.hue) * f;
      data[k + 1] = base[1] * (1 + site.hue * 0.3) * f;
      data[k + 2] = base[2] * (1 - site.hue) * f;
      data[k + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
}

/** Rubble walling: rough stones of every size, packed with dark mortar, moss along the tops of some. */
export function ktRubble(g, size, random) {
  ktVoronoi(g, size, random, { cellsX: 11, cellsY: 17, jitter: 0.5, weight: 0.45, base: [112, 108, 98], variance: 0.62, warm: 0.14, mortar: [32, 32, 29], gap: 2, soft: 3, dome: 0.55, seed: 3 });
  for (let k = 0; k < 90; k += 1) ktStain(g, size, random() * size, random() * size, 8 + random() * 26, `${58 + random() * 20},${78 + random() * 24},${38 + random() * 12}`, 0.25 + random() * 0.4);
  for (let k = 0; k < 120; k += 1) ktStain(g, size, random() * size, random() * size, 2 + random() * 8, random() < 0.5 ? '170,160,92' : '150,150,130', 0.2 + random() * 0.3);
  ktGrime(g, size, random, 1);
}

/** Cobbled setts: close-packed, irregular, rounded, dark and wet between; a few paler, a few sunk. */
export function ktCobbles(g, size, random) {
  ktVoronoi(g, size, random, { cellsX: 13, cellsY: 13, jitter: 0.42, weight: 0.2, base: [112, 106, 98], variance: 0.7, warm: 0.1, mortar: [24, 23, 22], gap: 2.2, soft: 4, dome: 0.7, seed: 4, edgeDark: 0.4 });
  for (let k = 0; k < 40; k += 1) ktStain(g, size, random() * size, random() * size, 10 + random() * 30, `${50 + random() * 14},${64 + random() * 20},${38 + random() * 10}`, 0.2 + random() * 0.3);
  for (let k = 0; k < 60; k += 1) ktStain(g, size, random() * size, random() * size, 14 + random() * 40, '12,12,14', 0.12 + random() * 0.18);
  ktGrime(g, size, random, 0.5);
}

/** Flagstones: big slabs, close joints, cracked, grout wet and dark, moss in the joints. */
export function ktFlags(g, size, random) {
  ktVoronoi(g, size, random, { cellsX: 4, cellsY: 5, jitter: 0.42, weight: 0.3, base: [104, 104, 106], variance: 0.4, warm: 0.07, mortar: [24, 25, 27], gap: 2.8, soft: 6, dome: 0.22, grain: 0.2, seed: 5, edgeDark: 0.25 });
  g.strokeStyle = 'rgba(8,8,12,0.55)';
  for (let index = 0; index < 26; index += 1) {
    g.lineWidth = 1 + random();
    g.beginPath();
    let x = random() * size;
    let y = random() * size;
    g.moveTo(x, y);
    for (let step = 0; step < 5; step += 1) {
      x += (random() - 0.5) * 50;
      y += (random() - 0.5) * 50;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let k = 0; k < 50; k += 1) ktStain(g, size, random() * size, random() * size, 8 + random() * 24, '58,76,44', 0.2 + random() * 0.3);
  for (let k = 0; k < 40; k += 1) ktStain(g, size, random() * size, random() * size, 20 + random() * 50, '14,14,18', 0.1 + random() * 0.16);
  ktGrime(g, size, random, 0.5);
}

/** Black sea-rock: dark blocks, wide and flat, split by cracks, with faint bedding and ledges that hold a little lichen and grass. */
export function ktRock(g, size, random) {
  ktVoronoi(g, size, random, { cellsX: 5, cellsY: 8, jitter: 0.5, weight: 0.45, base: [66, 66, 72], variance: 0.7, warm: 0.05, mortar: [12, 12, 15], gap: 2.6, soft: 5, dome: 0.5, grain: 0.22, seed: 7, edgeDark: 0.45 });
  // Bedding: a few long faint seams across the blocks, never regular.
  g.strokeStyle = 'rgba(8,8,11,0.5)';
  for (let index = 0; index < 22; index += 1) {
    g.lineWidth = 1 + random() * 1.5;
    g.beginPath();
    let x = random() * size;
    const y = random() * size;
    g.moveTo(x, y);
    for (let step = 0; step < 6; step += 1) {
      x += 30 + random() * 70;
      g.lineTo(x, y + (random() - 0.5) * 14);
    }
    g.stroke();
  }
  g.strokeStyle = 'rgba(130,134,142,0.1)';
  for (let index = 0; index < 40; index += 1) {
    g.lineWidth = 1;
    const x = random() * size;
    const y = random() * size;
    g.beginPath();
    g.moveTo(x, y - 1);
    g.lineTo(x + 20 + random() * 60, y - 1 + (random() - 0.5) * 6);
    g.stroke();
  }
  for (let k = 0; k < 60; k += 1) ktStain(g, size, random() * size, random() * size, 5 + random() * 16, random() < 0.5 ? '96,106,70' : '150,150,120', 0.15 + random() * 0.3);
  ktGrime(g, size, random, 0.7);
}

/** Wind-flattened grass: patches of long and short, dry yellow-green and dark, bare earth and the odd stone; blades fine. */
export function ktGrass(g, size, random) {
  const big = ktField(size, 921, [[3, 1], [6, 0.7], [12, 0.5]]);
  const mid = ktCoarse(size);
  const fine = ktFine(size);
  const image = g.createImageData(size, size);
  const d = image.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const patch = big[i];
      const lush = ktSmoothstep(0.35, 0.7, patch);
      const dry = ktSmoothstep(0.55, 0.85, mid[i]) * (1 - lush * 0.4);
      const bare = ktSmoothstep(0.7, 0.9, big[(i + size * 97 + 53) % (size * size)] * 0.6 + mid[(i + 1301) % (size * size)] * 0.4);
      let r = 50 + 10 * lush + 30 * dry;
      let gr = 58 + 14 * lush + 16 * dry;
      let b = 36 + 3 * lush + 6 * dry;
      r = r * (1 - bare) + 84 * bare;
      gr = gr * (1 - bare) + 70 * bare;
      b = b * (1 - bare) + 52 * bare;
      const f = 0.78 + 0.44 * fine[i] + 0.3 * (mid[i] - 0.5);
      const k = i * 4;
      d[k] = r * f;
      d[k + 1] = gr * f;
      d[k + 2] = b * f;
      d[k + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  for (let index = 0; index < 9000; index += 1) {
    const green = 52 + random() * 56;
    const x = random() * size;
    const y = random() * size;
    g.fillStyle = `rgba(${green * 0.85},${green + 8},${green * 0.55},${0.25 + random() * 0.3})`;
    g.fillRect(x, y, 1, 2 + random() * 6);
  }
  for (let k = 0; k < 40; k += 1) {
    const x = random() * size;
    const y = random() * size;
    const r = 2 + random() * 5;
    g.fillStyle = ktShade([100, 98, 90], 0.6 + random() * 0.6);
    g.beginPath();
    g.ellipse(x, y, r, r * 0.7, random() * 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(x - r * 0.8, y + r * 0.4, r * 1.6, 1.5);
  }
}

/** The packed path: pale gravel and stone over earth, rutted, puddled dark in the hollows. */
export function ktPath(g, size, random) {
  ktVoronoi(g, size, random, { cellsX: 40, cellsY: 40, jitter: 0.5, weight: 0.5, base: [128, 118, 100], variance: 0.7, warm: 0.12, mortar: [70, 62, 50], gap: 1.1, soft: 2, dome: 0.5, grain: 0.18, seed: 6, edgeDark: 0.3 });
  const hollows = ktField(size, 931, [[3, 1], [7, 0.6]]);
  const image = g.getImageData(0, 0, size, size);
  const d = image.data;
  for (let k = 0; k < size * size; k += 1) {
    const dark = ktSmoothstep(0.58, 0.8, hollows[k]);
    const f = 1 - 0.45 * dark;
    d[k * 4] *= f;
    d[k * 4 + 1] *= f;
    d[k * 4 + 2] *= f * 1.04;
  }
  g.putImageData(image, 0, 0);
  for (let index = 0; index < 5; index += 1) {
    const gradient = g.createLinearGradient(0, 0, size, 0);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.5, 'rgba(20,22,26,0.2)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gradient;
    g.fillRect(0, random() * size, size, 8 + random() * 14);
  }
  for (let k = 0; k < 30; k += 1) ktStain(g, size, random() * size, random() * size, 6 + random() * 16, '58,74,40', 0.2 + random() * 0.25);
}

// ---- the macro map -------------------------------------------------------------------------------------

/** Periodic value noise on an `nx` by `ny` lattice (not square), `size` by `size`, 0..1: `ny` small gives streaks. */
function ktStretched(size, seed, nx, ny) {
  const random = ktRandom(seed);
  const lattice = new Float32Array(nx * ny);
  for (let k = 0; k < lattice.length; k += 1) lattice[k] = random();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const fy = (y * ny) / size;
    const iy = Math.floor(fy);
    const ty = fy - iy;
    const sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < size; x += 1) {
      const fx = (x * nx) / size;
      const ix = Math.floor(fx);
      const tx = fx - ix;
      const sx = tx * tx * (3 - 2 * tx);
      const a = lattice[(iy % ny) * nx + (ix % nx)];
      const b = lattice[(iy % ny) * nx + ((ix + 1) % nx)];
      const c = lattice[((iy + 1) % ny) * nx + (ix % nx)];
      const d = lattice[((iy + 1) % ny) * nx + ((ix + 1) % nx)];
      out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

/**
 * The map the shader reads once per pixel to break repetition (kittex.js): four independent fields in world space, 256 by 256 over 16 m.
 * r: a low swell of light and dark. g: where the second reading of a texture takes over (and a drift of warm and cool). b: patches (moss, damp).
 * a: long vertical streaks (rain running down a wall; the texture's v is up on a wall).
 */
export function ktMacroData(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const r = ktField(size, 941, [[2, 1], [4, 0.8], [8, 0.5], [16, 0.25]]);
  const g = ktField(size, 943, [[3, 1], [6, 0.7], [12, 0.4]]);
  const b = ktField(size, 945, [[4, 1], [8, 0.7], [16, 0.5], [32, 0.25]]);
  // Streaks: thin across (many columns), long down (a few cells in 16 m), thresholded to runs of every length.
  const thin = ktStretched(size, 949, 72, 3);
  const thinner = ktStretched(size, 950, 150, 2);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const streak = ktSmoothstep(0.52, 0.85, thin[i] * 0.6 + thinner[i] * 0.4);
      const k = i * 4;
      data[k] = ktClamp(((r[i] - 0.5) * 1.8 + 0.5) * 255, 0, 255);
      data[k + 1] = ktClamp(((g[i] - 0.5) * 2.2 + 0.5) * 255, 0, 255);
      data[k + 2] = ktClamp(((b[i] - 0.5) * 2.4 + 0.5) * 255, 0, 255);
      data[k + 3] = streak * 255;
    }
  }
  return data;
}

// ---- the grit map -------------------------------------------------------------------------------------

/**
 * The map the stone's shader reads, in world space (kittex.js): the coarseness the textures' own pixels (128 to the metre) cannot give, 256 by 256, tiling.
 * r: fine relief for a tile of about a metre: grain, pitting and the short slanting strokes of a chisel (0.5 level; lower is a hollow). g: chips and swells for
 * a tile of about five metres: crumbled edges, a face worn hollow or left proud. b: efflorescence, the white salt a damp wall weeps, in patches. a: grime, broad
 * blotches of soot and rain-dirt that the shader smears down the wall.
 */
export function ktGritData(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const random = ktRandom(977);
  const grain = ktField(size, 961, [[64, 1], [128, 0.8], [256, 0.6]]);
  const pits = ktField(size, 963, [[48, 1], [96, 0.8], [192, 0.5]]);
  const swell = ktField(size, 967, [[8, 1], [16, 0.8], [32, 0.6], [64, 0.35]]);
  const chips = ktField(size, 969, [[12, 1], [24, 0.8], [48, 0.4]]);
  const salt = ktField(size, 971, [[6, 1], [12, 0.7], [24, 0.5], [48, 0.3]]);
  const dirt = ktField(size, 973, [[3, 1], [6, 0.8], [12, 0.6], [24, 0.4]]);
  // The relief of the fine layer: grain, with holes where the pit field peaks, and chisel strokes cut into it.
  const relief = new Float32Array(size * size);
  for (let k = 0; k < relief.length; k += 1) {
    const hole = ktSmoothstep(0.62, 0.78, pits[k]);
    relief[k] = 0.5 + (grain[k] - 0.5) * 0.9 - hole * 0.42;
  }
  for (let stroke = 0; stroke < 900; stroke += 1) {
    let x = random() * size;
    let y = random() * size;
    const angle = (random() < 0.7 ? 0.55 : 0.0) + (random() - 0.5) * 0.5;
    const length = 8 + random() * 16;
    const depth = 0.1 + random() * 0.22;
    for (let step = 0; step < length; step += 1) {
      const taper = Math.sin((Math.PI * step) / length);
      for (let across = -1; across <= 1; across += 1) {
        const px = (Math.floor(x - Math.sin(angle) * across) + size) & (size - 1);
        const py = (Math.floor(y + Math.cos(angle) * across) + size) & (size - 1);
        relief[py * size + px] -= depth * taper * (across === 0 ? 1 : 0.45);
      }
      x += Math.cos(angle);
      y += Math.sin(angle);
    }
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const k = i * 4;
      data[k] = ktClamp(relief[i] * 255, 0, 255);
      // Chips: plateaus and steps where the swell field crosses its thresholds, over a gentle swell.
      const step = ktSmoothstep(0.56, 0.62, chips[i]) * 0.35 - ktSmoothstep(0.38, 0.32, chips[i]) * 0.3;
      data[k + 1] = ktClamp((0.5 + (swell[i] - 0.5) * 0.8 + step) * 255, 0, 255);
      data[k + 2] = ktClamp(ktSmoothstep(0.55, 0.8, salt[i]) * (0.55 + 0.9 * grain[i]) * 255, 0, 255);
      data[k + 3] = ktClamp(((dirt[i] - 0.5) * 2.2 + 0.5) * 255, 0, 255);
    }
  }
  return data;
}
