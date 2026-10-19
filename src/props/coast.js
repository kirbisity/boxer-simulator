// The coast's buildings and props: Fort Zeelandia (the Dutch East India
// Company's brick star fort on Taiwan, 1630s–1662) with its gabions and palms,
// and a Ming fishing village on the Zhejiang coast with its sampans, pier and
// net racks; the ships at anchor off both.
//
// Everything is built at load, nothing downloaded. Surfaces are painted per
// pixel into small tiling textures (albedo, and a height field turned into a
// normal map) sized in real units, so a brick is a brick's size wherever it
// is. The weathering that cannot tile (damp at the foot of a wall, rain
// streaks, salt) is baked into vertex colours over walls cut into a coarse
// grid. Static pieces are merged per material, so a whole village is a
// handful of draws.

/* global THREE */

// ---- noise -------------------------------------------------------------------------

/** A seeded generator (mulberry32). */
function coastRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A repeatable 0..1 from integer cells. */
function coastHash(x, y = 0) {
  let h = (Math.imul(Math.floor(x) | 0, 374761393) + Math.imul(Math.floor(y) | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** Smooth value noise in 0..1, for vertex weathering. */
function coastNoise(x, y = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = coastHash(xi, yi);
  const b = coastHash(xi + 1, yi);
  const c = coastHash(xi, yi + 1);
  const d = coastHash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** A tiling field of value noise over a `size`² texture, `cells` across at the coarsest of `octaves`; 0..1. */
function coastField(size, cells, random, octaves = 3) {
  const field = new Float32Array(size * size);
  let amplitude = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    const count = cells << octave;
    const grid = Float32Array.from({ length: count * count }, () => random());
    const step = size / count;
    for (let y = 0; y < size; y += 1) {
      const gy = y / step;
      const y0 = Math.floor(gy);
      const fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy);
      const row0 = (y0 % count) * count;
      const row1 = ((y0 + 1) % count) * count;
      for (let x = 0; x < size; x += 1) {
        const gx = x / step;
        const x0 = Math.floor(gx);
        const fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const x1 = (x0 + 1) % count;
        const top = grid[row0 + x0] + (grid[row0 + x1] - grid[row0 + x0]) * sx;
        const bottom = grid[row1 + x0] + (grid[row1 + x1] - grid[row1 + x0]) * sx;
        field[y * size + x] += (top + (bottom - top) * sy) * amplitude;
      }
    }
    total += amplitude;
    amplitude *= 0.5;
  }
  for (let index = 0; index < field.length; index += 1) field[index] /= total;
  return field;
}

const coastClamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const coastMix = (a, b, t) => a + (b - a) * t;

// ---- painted surfaces --------------------------------------------------------------

const COAST_SURFACES = new Map();

/**
 * A tiling surface painted per pixel: `paint(x, y)` returns [r, g, b, height]
 * (height 0..1; an alpha as a fifth value for cut-outs). `relief` scales the
 * normal map built from the height (0: no normal map). Cached by name for the
 * page's life: the fort is rebuilt each visit, its bricks are not repainted.
 */
function coastSurface(name, size, relief, setup) {
  if (COAST_SURFACES.has(name)) return COAST_SURFACES.get(name);
  const [width, height] = Array.isArray(size) ? size : [size, size];
  const paint = setup(coastRandom(name.split('').reduce((sum, char) => Math.imul(sum ^ char.charCodeAt(0), 16777619), 2166136261)), width, height);
  const albedo = document.createElement('canvas');
  albedo.width = width;
  albedo.height = height;
  const context = albedo.getContext('2d');
  const image = context.createImageData(width, height);
  const heights = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, h, a = 255] = paint(x, y);
      const at = (y * width + x) * 4;
      image.data[at] = r;
      image.data[at + 1] = g;
      image.data[at + 2] = b;
      image.data[at + 3] = a;
      heights[y * width + x] = h;
    }
  }
  context.putImageData(image, 0, 0);
  const surface = { map: coastCanvasTexture(albedo), normalMap: relief ? coastCanvasTexture(coastNormalCanvas(heights, width, height, relief)) : null };
  COAST_SURFACES.set(name, surface);
  return surface;
}

/** A normal map from a tiling height field (Sobel-free central differences; OpenGL green up, canvas row 0 at the top). */
function coastNormalCanvas(heights, width, height, relief) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  const at = (x, y) => heights[((y + height) % height) * width + ((x + width) % width)];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const du = (at(x + 1, y) - at(x - 1, y)) * relief;
      const dv = (at(x, y - 1) - at(x, y + 1)) * relief;
      const length = Math.hypot(du, dv, 1);
      const index = (y * width + x) * 4;
      image.data[index] = (-du / length * 0.5 + 0.5) * 255;
      image.data[index + 1] = (-dv / length * 0.5 + 0.5) * 255;
      image.data[index + 2] = (1 / length * 0.5 + 0.5) * 255;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function coastCanvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** A material on a painted surface; vertex colours carry the weathering. */
function coastMaterial(surface, { roughness = 0.9, metalness = 0, normalScale = 1, side = THREE.FrontSide, alphaTest = 0, transparent = false, colour = 0xffffff } = {}) {
  const material = new THREE.MeshStandardMaterial({ color: colour, map: surface?.map ?? null, roughness, metalness, vertexColors: true, side, alphaTest, transparent, depthWrite: !transparent });
  if (surface?.normalMap) {
    material.normalMap = surface.normalMap;
    material.normalScale = new THREE.Vector2(normalScale, normalScale);
  }
  return material;
}

const coastByte = (value) => coastClamp(value, 0, 255);

/**
 * Brick in Dutch cross bond: header and stretcher courses alternating, every
 * other stretcher course shifted half a brick. 512 px is one metre: courses
 * of 62.5 mm (the small Dutch "IJsselsteen" with its joint), stretchers 250 mm.
 */
function coastBrickSurface(name, tones, mortar) {
  return coastSurface(name, 512, 5, (random) => {
    const fine = coastField(512, 64, random, 2);
    const mottle = coastField(512, 4, random, 3);
    const colours = new Map();
    const brickColour = (course, index) => {
      const key = course * 64 + index;
      if (!colours.has(key)) {
        const pick = random();
        let tone = tones[Math.floor(random() * tones.length)];
        if (pick < 0.04) tone = tone.map((c) => c * 0.7); // an over-fired clinker
        else if (pick < 0.09) tone = tone.map((c, at) => c * (at === 0 ? 1.12 : 1.18)); // a pale under-fired one
        const jitter = 0.92 + random() * 0.16;
        colours.set(key, tone.map((c) => c * jitter));
      }
      return colours.get(key);
    };
    return (x, y) => {
      const course = Math.floor(y / 32);
      const yIn = y % 32;
      const header = course % 2 === 0;
      const unit = header ? 64 : 128;
      const offset = header ? 32 : (course % 4 === 1 ? 0 : 64);
      const shifted = (x - offset + 512) % 512;
      const index = Math.floor(shifted / unit);
      const xIn = shifted % unit;
      const n = fine[y * 512 + x];
      const m = mottle[y * 512 + x];
      if (xIn < 4 || yIn < 4) {
        const shade = 0.85 + n * 0.25;
        return [mortar[0] * shade, mortar[1] * shade, mortar[2] * shade, 0.2 + n * 0.12];
      }
      const edge = Math.min(xIn - 4, unit - 1 - xIn, yIn - 4, 31 - yIn);
      const arris = edge < 3 ? 0.86 + edge * 0.045 : 1;
      const chip = edge < 4 && n > 0.78 ? 0.7 : 1; // a knocked arris
      const tone = brickColour(course, index);
      const shade = arris * (0.86 + n * 0.22) * (0.92 + m * 0.16) * (chip < 1 ? 0.88 : 1);
      return [coastByte(tone[0] * shade), coastByte(tone[1] * shade), coastByte(tone[2] * shade), (0.72 + Math.min(edge, 3) * 0.06 + n * 0.08) * chip];
    };
  });
}

/** Dressed sandstone in courses of 300 mm blocks 600 mm long: the cordon, the gate, sills. 512 px is 1.2 m. */
function coastStoneSurface() {
  return coastSurface('coast-stone', 512, 4, (random) => {
    const fine = coastField(512, 96, random, 2);
    const mottle = coastField(512, 6, random, 3);
    return (x, y) => {
      const course = Math.floor(y / 128);
      const shifted = (x + (course % 2) * 128) % 512;
      const index = Math.floor(shifted / 256);
      const xIn = shifted % 256;
      const yIn = y % 128;
      const n = fine[y * 512 + x];
      const m = mottle[y * 512 + x];
      if (xIn < 3 || yIn < 3) return [150, 140, 120, 0.2];
      const edge = Math.min(xIn - 3, 255 - xIn, yIn - 3, 127 - yIn);
      const tone = 0.9 + coastHash(course, index) * 0.16;
      const shade = tone * (0.86 + n * 0.22) * (0.88 + m * 0.2) * (edge < 4 ? 0.9 : 1);
      return [coastByte(204 * shade), coastByte(190 * shade), coastByte(160 * shade), 0.7 + Math.min(edge, 5) * 0.04 + n * 0.1];
    };
  });
}

/** Lime whitewash over brick: soft mottling, trowel unevenness, and here and there a patch fallen away to the grey brick. 512 px is 2 m. */
function coastWhitewashSurface() {
  return coastSurface('coast-whitewash', 512, 3, (random) => {
    const fine = coastField(512, 128, random, 2);
    const mottle = coastField(512, 6, random, 4);
    const patches = coastField(512, 5, random, 3);
    return (x, y) => {
      const n = fine[y * 512 + x];
      const m = mottle[y * 512 + x];
      const p = patches[y * 512 + x];
      if (p > 0.8) {
        // Bare grey brick where the lime has spalled: courses 53 mm, stretchers 240 mm (Ming brick).
        const course = Math.floor(y / 14);
        const xIn = (x + (course % 2) * 31) % 62;
        const joint = xIn < 2 || y % 14 < 2;
        const shade = joint ? 0.75 : 0.85 + n * 0.25;
        return [150 * shade, 148 * shade, 142 * shade, joint ? 0.05 : 0.2];
      }
      const rim = p > 0.77 ? 0.93 : 1; // the broken edge of the plaster, a little dirty
      const shade = (0.93 + n * 0.07) * (0.94 + m * 0.08) * rim;
      return [coastByte(236 * shade), coastByte(232 * shade), coastByte(221 * shade), 0.55 + n * 0.06 + m * 0.12];
    };
  });
}

/**
 * Chinese grey roll tiles (板瓦 pans laid concave up, 筒瓦 half-round covers
 * over their joints) in rows down the slope; 512 px is 0.88 m, four rows of
 * 220 mm across and eight courses of 110 mm down. Lichen and soot.
 */
function coastRollTileSurface() {
  return coastSurface('coast-rolltile', 512, 7, (random) => {
    const fine = coastField(512, 128, random, 2);
    const mottle = coastField(512, 4, random, 3);
    return (x, y) => {
      const column = Math.floor(x / 128);
      const across = (x % 128) - 64; // −64..63; the cover row at the middle
      const course = Math.floor(((y + column * 23) % 512) / 64);
      const down = ((y + column * 23) % 512) % 64; // 0 at a tile's upper end, 63 at its lower lip
      const n = fine[y * 512 + x];
      const m = mottle[y * 512 + x];
      const cover = Math.abs(across) < 34;
      const tile = coastHash(column * 13 + (cover ? 7 : 0), course);
      let h;
      let tone;
      if (cover) {
        h = 0.5 + 0.45 * Math.sqrt(1 - (across / 34) ** 2);
        tone = 104 + tile * 22;
      } else {
        const side = (Math.abs(across) - 34) / 30;
        h = 0.12 + 0.18 * (1 - side) ** 2 + 0.1 * side;
        tone = 84 + tile * 18;
      }
      h += (down / 64) * 0.08; // each tile thickens toward the lip that laps the one below
      const lip = down > 58 ? 0.62 : 1;
      const lichen = m > 0.66 && n > 0.55 ? 1 : 0;
      const shade = (0.86 + n * 0.22) * lip;
      if (lichen) return [150, 150, 128, h + 0.02];
      return [coastByte(tone * shade), coastByte((tone + 2) * shade), coastByte((tone + 6) * shade), h];
    };
  });
}

/** Dutch red pantiles, S-profile, 250 mm across and courses of 250 mm; 512 px is one metre. */
function coastPantileSurface() {
  return coastSurface('coast-pantile', 512, 7, (random) => {
    const fine = coastField(512, 96, random, 2);
    const mottle = coastField(512, 4, random, 3);
    return (x, y) => {
      const column = Math.floor(x / 128);
      const across = (x % 128) / 128;
      const course = Math.floor(((y + (column % 2) * 9) % 512) / 128);
      const down = ((y + (column % 2) * 9) % 512) % 128;
      const n = fine[y * 512 + x];
      const m = mottle[y * 512 + x];
      const s = Math.sin(across * Math.PI * 2);
      const h = 0.45 + 0.35 * s + (down / 128) * 0.12;
      const tile = coastHash(column * 5, course);
      const lip = down > 120 ? 0.6 : 1;
      const shade = (0.84 + n * 0.22) * (0.9 + m * 0.18) * lip * (0.92 + 0.12 * s) * (0.88 + tile * 0.22);
      return [coastByte(178 * shade), coastByte(86 * shade), coastByte(54 * shade), h];
    };
  });
}

/** Weathered timber, grain running up the canvas; 256 px is one metre. */
function coastWoodSurface() {
  return coastSurface('coast-wood', 256, 3, (random) => {
    const grain = coastField(256, 8, random, 3);
    const fine = coastField(256, 64, random, 2);
    return (x, y) => {
      const wobble = grain[y * 256 + x] * 18;
      const ring = 0.5 + 0.5 * Math.sin((x + wobble) * 0.9);
      const n = fine[y * 256 + x];
      const t = ring * 0.6 + n * 0.4;
      return [coastMix(92, 146, t), coastMix(72, 120, t), coastMix(52, 92, t), 0.4 + ring * 0.25 + n * 0.2];
    };
  });
}

/** Planking: strakes 250 mm wide running along u, butt joints staggered, tar in the seams; 512 px is 2 m. */
function coastPlankSurface() {
  return coastSurface('coast-plank', 512, 4, (random) => {
    const grain = coastField(512, 6, random, 3);
    const fine = coastField(512, 128, random, 2);
    return (x, y) => {
      const strake = Math.floor(y / 64);
      const yIn = y % 64;
      const butt = (x + strake * 197) % 512;
      const n = fine[y * 512 + x];
      if (yIn < 3 || butt < 3) return [40, 32, 26, 0.1];
      const wobble = grain[y * 512 + x] * 12;
      const ring = 0.5 + 0.5 * Math.sin((y + wobble) * 1.3);
      const tone = 0.85 + coastHash(strake, Math.floor((x + strake * 197) / 512)) * 0.3;
      const t = (ring * 0.5 + n * 0.5) * tone;
      return [coastMix(80, 150, t), coastMix(64, 126, t), coastMix(48, 100, t), 0.6 + ring * 0.2 + n * 0.15];
    };
  });
}

/**
 * Wicker: willow rods woven over and under upright stakes, three stakes to the
 * tile; 256 px is 0.86 m around and 0.5 m up (twenty rods).
 */
function coastWickerSurface() {
  return coastSurface('coast-wicker', 256, 6, (random) => {
    const fine = coastField(256, 64, random, 2);
    return (x, y) => {
      const rowHeight = 256 / 20;
      const row = Math.floor(y / rowHeight);
      const yIn = (y % rowHeight) / rowHeight;
      const span = 256 / 3;
      const bay = Math.floor(x / span);
      const xIn = (x % span) / span;
      const n = fine[y * 256 + x];
      const stake = Math.abs(xIn - 0.5) < 0.055;
      const over = (bay + row) % 2 === 0;
      // A rod rises over one stake and dips behind the next: its height swings along the bay.
      const swing = over ? Math.sin(xIn * Math.PI) : 1 - Math.sin(xIn * Math.PI);
      const round = Math.sin(yIn * Math.PI);
      if (stake && !over) {
        return [96 + n * 30, 78 + n * 24, 52 + n * 16, 0.75];
      }
      const rod = coastHash(row, bay);
      const shade = (0.55 + 0.45 * round) * (0.7 + swing * 0.35) * (0.85 + rod * 0.3) * (0.85 + n * 0.25);
      return [coastByte(158 * shade), coastByte(128 * shade), coastByte(84 * shade), 0.3 + round * 0.35 + swing * 0.3];
    };
  });
}

/** Rammed earth with pebbles and a few blades of grass; 256 px is one metre. */
function coastEarthSurface() {
  return coastSurface('coast-earth', 256, 4, (random) => {
    const fine = coastField(256, 64, random, 2);
    const clods = coastField(256, 12, random, 3);
    const stones = coastField(256, 40, random, 1);
    return (x, y) => {
      const n = fine[y * 256 + x];
      const c = clods[y * 256 + x];
      const s = stones[y * 256 + x];
      if (s > 0.82) return [140 + n * 30, 128 + n * 26, 108 + n * 20, 0.8 + s * 0.2];
      if (n > 0.8 && c > 0.55) return [96, 112, 58, 0.6];
      const shade = 0.75 + c * 0.35 + n * 0.15;
      return [coastByte(112 * shade), coastByte(88 * shade), coastByte(62 * shade), 0.3 + c * 0.4 + n * 0.1];
    };
  });
}

/** A coconut palm's trunk: grey bark ringed by old leaf scars every 100 mm; u along the trunk, 256 px is 0.6 m. */
function coastTrunkSurface() {
  return coastSurface('coast-trunk', 256, 6, (random) => {
    const fine = coastField(256, 64, random, 2);
    const streaks = coastField(256, 16, random, 2);
    return (x, y) => {
      const ring = (x % (256 / 6)) / (256 / 6);
      const n = fine[y * 256 + x];
      const s = streaks[((y * 3) % 256) * 256 + Math.floor(x / 4)];
      const scar = ring < 0.12;
      const swell = Math.sin(ring * Math.PI);
      const shade = (scar ? 0.55 : 0.82 + swell * 0.2) * (0.85 + n * 0.25) * (0.9 + s * 0.15);
      return [coastByte(150 * shade), coastByte(136 * shade), coastByte(114 * shade), scar ? 0.15 : 0.45 + swell * 0.35 + n * 0.1];
    };
  });
}

/** Bamboo matting, a twill of split strips; for the sampans' awnings and the junks' sails. 256 px is 0.8 m. */
function coastMatSurface() {
  return coastSurface('coast-mat', 256, 4, (random) => {
    const fine = coastField(256, 64, random, 2);
    const stain = coastField(256, 4, random, 3);
    return (x, y) => {
      const cx = Math.floor(x / 8);
      const cy = Math.floor(y / 8);
      const horizontal = (cx + cy) % 4 < 2;
      const along = horizontal ? (y % 8) / 8 : (x % 8) / 8;
      const round = Math.sin(along * Math.PI);
      const n = fine[y * 256 + x];
      const strip = coastHash(horizontal ? cy : cx + 400, 3);
      const shade = (0.6 + 0.4 * round) * (0.85 + strip * 0.25) * (0.85 + n * 0.2) * (0.75 + stain[y * 256 + x] * 0.35);
      return [coastByte(168 * shade), coastByte(134 * shade), coastByte(86 * shade), 0.3 + round * 0.5];
    };
  });
}

/** Sailcloth: hemp canvas in cloths 600 mm wide, seamed, dirtier toward the foot. 256 px is 2.4 m. */
function coastSailSurface() {
  return coastSurface('coast-sail', 256, 2, (random) => {
    const fine = coastField(256, 64, random, 2);
    const stain = coastField(256, 4, random, 3);
    return (x, y) => {
      const seam = x % 64 < 2 || x % 64 === 5;
      const n = fine[y * 256 + x];
      const dirt = (y / 256) * 0.12 + stain[y * 256 + x] * 0.12;
      const shade = (seam ? 0.82 : 1) * (0.94 + n * 0.08) * (1 - dirt);
      return [coastByte(226 * shade), coastByte(214 * shade), coastByte(186 * shade), seam ? 0.7 : 0.5];
    };
  });
}

/** A fishing net, tanned brown, 50 mm diamond mesh; cut out by alpha. 256 px is 0.5 m. */
function coastNetSurface() {
  return coastSurface('coast-net', 256, 0, () => (x, y) => {
    const a = (x + y) % 26;
    const b = (x - y + 2600) % 26;
    const twine = Math.min(a, 26 - a) < 2 || Math.min(b, 26 - b) < 2;
    const knot = Math.min(a, 26 - a) < 2.6 && Math.min(b, 26 - b) < 2.6;
    if (!twine && !knot) return [70, 52, 34, 0, 0];
    return [78, 58, 38, 1, 255];
  });
}

/**
 * A lattice window of the south: a timber frame and a grid of slender bars,
 * paper pasted behind, a few panes torn dark.
 */
function coastLatticeSurface() {
  return coastSurface('coast-lattice', 128, 5, (random) => {
    const fine = coastField(128, 32, random, 2);
    return (x, y) => {
      const n = fine[y * 128 + x];
      const frame = x < 9 || x > 118 || y < 9 || y > 118;
      if (frame) return [78 + n * 20, 56 + n * 14, 40 + n * 10, 1];
      const lx = (x - 9) % 18;
      const ly = (y - 9) % 18;
      // The bars: a square grid, with a short bar across the middle of every other pane (the "step-step-high" fret).
      const pane = [Math.floor((x - 9) / 18), Math.floor((y - 9) / 18)];
      const fret = (pane[0] + pane[1]) % 2 === 0 && Math.abs(ly - 9) < 2 && lx > 4 && lx < 14;
      if (lx < 3 || ly < 3 || fret) return [92 + n * 24, 66 + n * 16, 46 + n * 12, 0.85];
      if (coastHash(pane[0], pane[1] + 17) > 0.95) return [40, 34, 30, 0.1];
      const shade = 0.88 + n * 0.14;
      return [coastByte(226 * shade), coastByte(212 * shade), coastByte(178 * shade), 0.35];
    };
  });
}

/** A Dutch cross window: white frame, leaded glass above the transom, green shutters below. */
function coastDutchWindowSurface() {
  return coastSurface('coast-dutchwindow', [128, 192], 4, (random) => {
    const fine = coastField(128, 32, random, 2);
    return (x, y) => {
      const n = fine[(y % 128) * 128 + x];
      const frame = x < 8 || x > 119 || y < 8 || y > 183 || Math.abs(x - 64) < 4 || Math.abs(y - 84) < 4;
      if (frame) return [coastByte(222 + n * 20), coastByte(218 + n * 20), coastByte(204 + n * 18), 1];
      if (y < 84) {
        const lead = x % 12 < 1.5 || y % 14 < 1.5;
        if (lead) return [46, 48, 48, 0.7];
        const glint = Math.max(0, 1 - Math.abs((x + y * 0.6) % 90 - 30) / 30) * 50;
        return [coastByte(52 + glint), coastByte(66 + glint), coastByte(70 + glint), 0.45];
      }
      const board = (x % 28) < 2;
      const shade = (board ? 0.7 : 1) * (0.85 + n * 0.2);
      return [coastByte(46 * shade), coastByte(86 * shade), coastByte(60 * shade), board ? 0.4 : 0.6];
    };
  });
}

/** A Chinese house door: two leaves of vertical boards, faded red-brown lacquer, iron ring knockers. */
function coastDoorSurface() {
  return coastSurface('coast-door', [128, 256], 4, (random) => {
    const fine = coastField(128, 32, random, 2);
    const wear = coastField(128, 4, random, 3);
    return (x, y) => {
      const n = fine[(y % 128) * 128 + x];
      const w = wear[(y % 128) * 128 + x];
      const seam = x % 32 < 2 || Math.abs(x - 64) < 2;
      const knocker = Math.abs(Math.hypot(x - (x < 64 ? 54 : 74), y - 120) - 6) < 1.6;
      if (knocker) return [40, 38, 36, 0.95];
      const bare = coastClamp((y / 256) * 0.6 + w * 0.5 - 0.25); // lacquer worn off low down and by hands
      const shade = (seam ? 0.55 : 0.85 + n * 0.25);
      return [coastByte(coastMix(122, 128, bare) * shade), coastByte(coastMix(58, 104, bare) * shade), coastByte(coastMix(44, 82, bare) * shade), seam ? 0.2 : 0.6 + n * 0.1];
    };
  });
}

/** The fort's gate leaves: oak boards 200 mm wide, iron straps and nail heads; 256 px is 2.4 m. */
function coastGateSurface() {
  return coastSurface('coast-gate', 256, 5, (random) => {
    const fine = coastField(256, 64, random, 2);
    return (x, y) => {
      const n = fine[y * 256 + x];
      const seam = x % 21 < 2;
      const strap = [60, 150, 230].some((at) => Math.abs(y - at) < 6);
      if (strap) {
        const stud = x % 21 > 8 && x % 21 < 13 && Math.abs(y % 90 - 60) < 3;
        return [44 + n * 12, 40 + n * 10, 38 + n * 10, stud ? 1 : 0.85];
      }
      const shade = seam ? 0.5 : 0.8 + n * 0.3;
      return [coastByte(96 * shade), coastByte(72 * shade), coastByte(50 * shade), seam ? 0.2 : 0.55];
    };
  });
}

/** A coconut frond for a card: a midrib up the middle, leaflets swept toward the tip, cut out by alpha. Tip at the top. */
function coastFrondSurface() {
  if (COAST_SURFACES.has('coast-frond')) return COAST_SURFACES.get('coast-frond');
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  const random = coastRandom(4111);
  const centre = 64;
  for (let t = 0.03; t < 0.985; t += 0.011) {
    const y = 512 * (1 - t);
    // Leaflets longest a third of the way out, short at the base and the tip.
    const reach = 60 * Math.sin(Math.PI * Math.min(1, t * 1.25)) ** 0.6 * (0.85 + random() * 0.2);
    for (const side of [-1, 1]) {
      const tipX = centre + side * reach;
      const tipY = y - reach * (0.55 + random() * 0.2);
      const green = 70 + random() * 40;
      g.fillStyle = `rgb(${Math.round(green * 0.62 + (t > 0.85 ? 30 : 0))},${Math.round(green + 20)},${Math.round(green * 0.42)})`;
      g.beginPath();
      g.moveTo(centre, y - 2.5);
      g.quadraticCurveTo(centre + side * reach * 0.5, y - reach * 0.2 - 3, tipX, tipY);
      g.quadraticCurveTo(centre + side * reach * 0.5, y - reach * 0.2 + 3, centre, y + 2.5);
      g.fill();
    }
  }
  g.strokeStyle = '#a89a5a';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(centre, 512);
  g.lineTo(centre, 6);
  g.stroke();
  const surface = { map: coastCanvasTexture(canvas), normalMap: null };
  surface.map.wrapS = surface.map.wrapT = THREE.ClampToEdgeWrapping;
  COAST_SURFACES.set('coast-frond', surface);
  return surface;
}

/** The VOC's flag: the Prince's flag (orange, white, blue) with the Company's monogram on the white. */
function coastFlagSurface() {
  if (COAST_SURFACES.has('coast-flag')) return COAST_SURFACES.get('coast-flag');
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#d8701e';
  g.fillRect(0, 0, 384, 86);
  g.fillStyle = '#ece6d6';
  g.fillRect(0, 86, 384, 86);
  g.fillStyle = '#2a4a86';
  g.fillRect(0, 172, 384, 84);
  // The monogram: a V with the O and C hung on its arms.
  g.strokeStyle = '#1c1a1a';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(160, 96);
  g.lineTo(192, 162);
  g.lineTo(224, 96);
  g.stroke();
  g.lineWidth = 5;
  g.beginPath();
  g.arc(170, 122, 14, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(214, 122, 14, 0.7, Math.PI * 2 - 0.7);
  g.stroke();
  // Wear: the fly end greyed by sun and salt.
  const fade = g.createLinearGradient(0, 0, 384, 0);
  fade.addColorStop(0, 'rgba(255,255,255,0)');
  fade.addColorStop(1, 'rgba(120,110,100,0.25)');
  g.fillStyle = fade;
  g.fillRect(0, 0, 384, 256);
  const surface = { map: coastCanvasTexture(canvas), normalMap: null };
  surface.map.wrapS = surface.map.wrapT = THREE.ClampToEdgeWrapping;
  COAST_SURFACES.set('coast-flag', surface);
  return surface;
}

// ---- building geometry ---------------------------------------------------------------

/** A transform: translate, then rotate (Euler YXZ), then scale. */
function coastMatrix(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  matrix.scale(new THREE.Vector3(sx, sy, sz));
  matrix.setPosition(x, y, z);
  return matrix;
}

/**
 * A growing pile of triangles for one material: positions, normals, UVs and
 * vertex colours. UVs are either the geometry's own (scaled) or projected
 * from position in metres onto the face's own plane (`tile` metres to the
 * texture), u along the face level, v up it, so bricks run level on any wall
 * and tiles run down any roof. `colour(x, y, z, normal)` returns a multiplier
 * per vertex: the weathering.
 */
function coastBatch() {
  const position = [];
  const normal = [];
  const uv = [];
  const colour = [];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const face = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const bitangent = new THREE.Vector3();

  function project(point, n, o) {
    const tile = o.tile ?? 1;
    const [du, dv] = o.uvOffset ?? [0, 0];
    if (Math.abs(n.y) > 0.97) return [point.x / tile + du, -point.z / tile * Math.sign(n.y) + dv];
    tangent.set(n.z, 0, -n.x).normalize();
    bitangent.crossVectors(n, tangent);
    return [point.dot(tangent) / tile + du, point.dot(bitangent) / tile + dv];
  }

  function shade(point, n, o) {
    const tint = o.tint ?? [1, 1, 1];
    if (!o.colour) return tint;
    const c = o.colour(point.x, point.y, point.z, n);
    return [tint[0] * c[0], tint[1] * c[1], tint[2] * c[2]];
  }

  /** One triangle; `normals` and `uvs` optional (flat normal, projected UVs otherwise). */
  function triangle(p0, p1, p2, o = {}, normals = null, uvs = null) {
    e1.subVectors(p1, p0);
    e2.subVectors(p2, p0);
    face.crossVectors(e1, e2).normalize();
    [p0, p1, p2].forEach((point, index) => {
      position.push(point.x, point.y, point.z);
      const n = normals ? normals[index] : face;
      normal.push(n.x, n.y, n.z);
      const [u, v] = uvs ? uvs[index] : project(point, face, o);
      uv.push(u, v);
      const c = shade(point, face, o);
      colour.push(c[0], c[1], c[2]);
    });
  }

  /** A triangle turned to face `toward` (a direction). */
  function facing(p0, p1, p2, toward, o) {
    e1.subVectors(p1, p0);
    e2.subVectors(p2, p0);
    face.crossVectors(e1, e2);
    if (face.dot(toward) < 0) triangle(p0, p2, p1, o);
    else triangle(p0, p1, p2, o);
  }

  /** A quad cut into `columns` × rows, rows at the fractions `rows` (0..1) from the bottom edge (a→b) to the top (d→c). */
  function grid(a, b, c, d, columns, rows, o) {
    const point = (s, t) => {
      const bottom = a.clone().lerp(b, s);
      const top = d.clone().lerp(c, s);
      return bottom.lerp(top, t);
    };
    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < rows.length - 1; row += 1) {
        const s0 = column / columns;
        const s1 = (column + 1) / columns;
        const p00 = point(s0, rows[row]);
        const p10 = point(s1, rows[row]);
        const p11 = point(s1, rows[row + 1]);
        const p01 = point(s0, rows[row + 1]);
        triangle(p00, p10, p11, o);
        triangle(p00, p11, p01, o);
      }
    }
  }

  /** Every triangle of a three geometry, moved by `o.matrix`; its own normals if `o.smooth`, its own UVs (× `o.uvScale`) unless `o.project`. */
  function add(geometry, o = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (o.matrix) g.applyMatrix4(o.matrix);
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const t = g.attributes.uv;
    const [su, sv] = o.uvScale ?? [1, 1];
    const [du, dv] = o.uvOffset ?? [0, 0];
    for (let index = 0; index < p.count; index += 3) {
      const points = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, index + k));
      const normals = o.smooth && n ? [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(n, index + k)) : null;
      const uvs = !o.project && t ? [0, 1, 2].map((k) => [t.getX(index + k) * su + du, t.getY(index + k) * sv + dv]) : null;
      triangle(points[0], points[1], points[2], o, normals, uvs);
    }
    g.dispose();
  }

  /** A box, `size` [w, h, d], by `matrix`. */
  function box(size, matrix, o = {}) {
    add(new THREE.BoxGeometry(...size), { project: true, ...o, matrix });
  }

  function geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colour, 3));
    g.computeBoundingSphere();
    return g;
  }

  function mesh(material) {
    const built = new THREE.Mesh(geometry(), material);
    built.receiveShadow = true;
    return built;
  }

  return { triangle, facing, grid, add, box, geometry, mesh };
}

/** A convex polygon ([x, z] points) in the order whose edges' outward side is (−dz, dx). */
function coastOutward(polygon) {
  const cx = polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length;
  const cz = polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length;
  const [a, b] = polygon;
  const out = -(b[1] - a[1]) * ((a[0] + b[0]) / 2 - cx) + (b[0] - a[0]) * ((a[1] + b[1]) / 2 - cz);
  return out >= 0 ? polygon : [...polygon].reverse();
}

/** A convex polygon (in coastOutward order) pushed out by `distance`, corners mitred. */
function coastOffset(polygon, distance) {
  const count = polygon.length;
  const normalOf = (i) => {
    const a = polygon[i];
    const b = polygon[(i + 1) % count];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
  };
  return polygon.map((point, i) => {
    const n1 = normalOf((i - 1 + count) % count);
    const n2 = normalOf(i);
    const k = distance / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [point[0] + (n1[0] + n2[0]) * k, point[1] + (n1[1] + n2[1]) * k];
  });
}

/**
 * A battered (sloped) wall round a convex polygon, from `y0` up `height`:
 * the foot pushed out by `batter`, the faces cut into columns about
 * `spacing` m wide and rows at the heights `rows` (fractions) so the vertex
 * weathering has somewhere to live. Caps top and bottom on request.
 * Returns the polygon in coastOutward order (the top's outline).
 */
function coastBattered(batch, polygon, { y0 = 0, height, batter = 0, spacing = 0.6, rows = [0, 0.5, 1], top = true, bottom = false, skip = [] }, o) {
  const ring = coastOutward(polygon);
  const foot = coastOffset(ring, batter);
  const count = ring.length;
  for (let i = 0; i < count; i += 1) {
    if (skip.includes(i)) continue;
    const j = (i + 1) % count;
    const a = new THREE.Vector3(foot[i][0], y0, foot[i][1]);
    const b = new THREE.Vector3(foot[j][0], y0, foot[j][1]);
    const c = new THREE.Vector3(ring[j][0], y0 + height, ring[j][1]);
    const d = new THREE.Vector3(ring[i][0], y0 + height, ring[i][1]);
    const columns = Math.max(1, Math.round(a.distanceTo(b) / spacing));
    // Wound so the face looks out: (b − a) × up points out for coastOutward order... checked by facing below.
    const out = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x);
    const probe = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
    if (probe.dot(out) >= 0) batch.grid(a, b, c, d, columns, rows, o);
    else batch.grid(b, a, d, c, columns, rows, o);
  }
  const cap = (points, y, toward) => {
    const centre = new THREE.Vector3(points.reduce((s, p) => s + p[0], 0) / count, y, points.reduce((s, p) => s + p[1], 0) / count);
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count;
      batch.facing(centre, new THREE.Vector3(points[i][0], y, points[i][1]), new THREE.Vector3(points[j][0], y, points[j][1]), toward, o);
    }
  };
  if (top) cap(ring, y0 + height, new THREE.Vector3(0, 1, 0));
  if (bottom) cap(foot, y0, new THREE.Vector3(0, -1, 0));
  return ring;
}

/**
 * A straight run of wall `thickness` deep and `height` high on the inner side
 * of the line a→b (a polygon edge in coastOutward order), with gaps: `solid`
 * lists the [from, to] fractions of the run that are built.
 */
function coastRun(batch, a, b, { y, height, thickness, solid = [[0, 1]] }, o) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  const inward = [dz / length, -dx / length];
  const angle = Math.atan2(-dz, dx);
  for (const [from, to] of solid) {
    const span = (to - from) * length;
    if (span < 0.05) continue;
    const middle = (from + to) / 2;
    const x = a[0] + dx * middle + inward[0] * thickness / 2;
    const z = a[1] + dz * middle + inward[1] * thickness / 2;
    batch.box([span, height, thickness], coastMatrix(x, y + height / 2, z, angle), o);
  }
}

/**
 * A pitched roof, ridge along x, by `matrix`: `length` along the ridge,
 * `span` the walls' width, the wall plate at `plate`, `rise` from the plate
 * to the ridge, eaves `overhang` beyond the walls and `verge` beyond the
 * gables; `sag` dips each slope in the middle (the Chinese concave roof) and
 * `lift` raises the eaves and ridge toward the gable ends. The tiles go in
 * `tiles`; the thickness's underside (boards and rafters) in `under`.
 * Returns the ridge line, x → point.
 */
function coastRoof(tiles, under, { length, span, plate, rise, overhang, verge, sag = 0, lift = 0, thickness = 0.14, rows = 6, columns = 6 }, tileStyle, underStyle, matrix) {
  const half = length / 2 + verge;
  const run = span / 2 + overhang;
  const slope = rise / (span / 2);
  const surface = (x, side, t) => {
    // t: 0 at the ridge, 1 at the eave.
    const along = Math.abs(x) / half;
    const y = plate + rise - slope * run * t - sag * Math.sin(Math.PI * t) + lift * along ** 2.2 * (0.4 + 0.6 * t);
    return new THREE.Vector3(x, y, side * run * t).applyMatrix4(matrix);
  };
  const up = new THREE.Vector3(0, 1, 0);
  const downward = new THREE.Vector3(0, -1, 0);
  const drop = new THREE.Vector3(0, -thickness, 0);
  for (const side of [-1, 1]) {
    const out = new THREE.Vector3(0, 0, side).transformDirection(matrix);
    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < rows; row += 1) {
        const x0 = -half + (2 * half * column) / columns;
        const x1 = -half + (2 * half * (column + 1)) / columns;
        const quad = [surface(x0, side, row / rows), surface(x1, side, row / rows), surface(x1, side, (row + 1) / rows), surface(x0, side, (row + 1) / rows)];
        tiles.facing(quad[0], quad[1], quad[2], up, tileStyle);
        tiles.facing(quad[0], quad[2], quad[3], up, tileStyle);
        const low = quad.map((p) => p.clone().add(drop));
        under.facing(low[0], low[1], low[2], downward, underStyle);
        under.facing(low[0], low[2], low[3], downward, underStyle);
        // The eave: the tiles' lips seen end on.
        if (row === rows - 1) {
          tiles.facing(quad[3], quad[2], low[2], out, tileStyle);
          tiles.facing(quad[3], low[2], low[3], out, tileStyle);
        }
        // The verge at each gable.
        if (column === 0 || column === columns - 1) {
          const end = column === 0 ? -1 : 1;
          const verge = new THREE.Vector3(end, 0, 0).transformDirection(matrix);
          const [a, b, la, lb] = end < 0 ? [quad[0], quad[3], low[0], low[3]] : [quad[1], quad[2], low[1], low[2]];
          tiles.facing(a, b, lb, verge, tileStyle);
          tiles.facing(a, lb, la, verge, tileStyle);
        }
      }
    }
  }
  return (x) => surface(x, 1, 0);
}

/** A gable wall's triangle above the plate, at local x = `x` (its sign the side it faces), cut into strips for the weathering. */
function coastGable(batch, x, span, plate, rise, o, matrix) {
  const at = (z, y) => new THREE.Vector3(x, y, z).applyMatrix4(matrix);
  const out = new THREE.Vector3(Math.sign(x), 0, 0).transformDirection(matrix);
  const height = (z) => plate + rise * (1 - Math.abs(z) / (span / 2));
  const strips = 6;
  for (let k = 0; k < strips; k += 1) {
    const z0 = -span / 2 + (span * k) / strips;
    const z1 = -span / 2 + (span * (k + 1)) / strips;
    batch.facing(at(z0, plate), at(z1, plate), at(z1, height(z1)), out, o);
    batch.facing(at(z0, plate), at(z1, height(z1)), at(z0, height(z0)), out, o);
  }
}

// ---- weathering --------------------------------------------------------------------

/**
 * Sea-air brick: rising damp dark and green at the foot, a band of salt
 * bloom just above it, rain streaks down from the cordon, and broad patches
 * of tone. Terrepleins and wall tops a little dustier.
 */
function coastBrickWeather(x, y, z, n) {
  if (n.y > 0.7) {
    const dust = 0.9 + coastNoise(x * 0.4, z * 0.4) * 0.15;
    return [dust * 1.02, dust, dust * 0.95];
  }
  const along = x * 0.83 + z * 1.07;
  const macro = 0.9 + 0.18 * coastNoise(along * 0.13, y * 0.3);
  const damp = coastClamp((1.6 + 0.8 * coastNoise(along * 0.5, 3.1) - y) / 1.6) ** 0.8;
  const salt = Math.exp(-(((y - 1.5 - 0.5 * coastNoise(along * 0.7, 5)) / 0.35) ** 2)) * coastNoise(along * 1.3, 7);
  const streak = coastNoise(along * 1.6, 11.3) ** 2.2 * coastClamp(y / 3.5) ** 0.6 * 1.6;
  const wet = 1 - 0.6 * damp;
  return [
    macro * wet * (1 - 0.42 * streak) + salt * 0.32,
    macro * (1 - 0.52 * damp) * (1 - 0.4 * streak) + salt * 0.32,
    macro * (1 - 0.56 * damp) * (1 - 0.32 * streak) + salt * 0.3,
  ];
}

/** Whitewash in a wet climate: black mould streaks down from the eaves, the foot splashed dirty, darker in the eaves' shadow; one house's walls a touch warmer than the next. */
function coastWashWeather(seed, eaves, sills = []) {
  return (x, y, z, n) => {
    const along = x * 0.9 + z * 1.1 + seed * 13.7;
    const streak = coastNoise(along * 1.7, seed) ** 2.5 * coastClamp((y - 0.6) / (eaves - 0.6)) ** 0.7 * 1.3;
    const splash = coastClamp(1 - (y - 0.55) / 0.6) * (0.6 + 0.4 * coastNoise(along * 2.3, 2));
    const shadow = coastClamp((y - (eaves - 0.5)) / 0.5) * 0.28;
    let under = 0;
    for (const sill of sills) {
      if (Math.abs(n.x * (z - sill.z) - n.z * (x - sill.x)) < sill.half && y < sill.y && y > sill.y - 1.4 && (x - sill.x) * n.x + (z - sill.z) * n.z > -0.05) {
        under = Math.max(under, 0.3 * (1 - (sill.y - y) / 1.4));
      }
    }
    const dirt = 1 - 0.42 * streak - 0.3 * splash - shadow - under;
    return [dirt * (0.98 - 0.03 * streak), dirt * (1 - 0.01 * streak), dirt * (0.97 + 0.02 * streak)];
  };
}

/** Timber by the sea: darker and green-black where it stands wet. */
function coastWoodWeather(waterline = 0.25) {
  return (x, y, z) => {
    const wet = coastClamp((waterline - y) / 0.6);
    const tone = 0.9 + coastNoise(x * 3.1 + z * 2.3, y * 0.7) * 0.2;
    return [tone * (1 - 0.5 * wet), tone * (1 - 0.42 * wet), tone * (1 - 0.48 * wet)];
  };
}

// ---- Fort Zeelandia ------------------------------------------------------------------

/** The fort's numbers: a square of curtains 18 m on a side, bastions at the corners, walls battered 1 in 10. */
const COAST_FORT = { half: 9, curtain: 5.4, bastion: 5.8, batter: 0.55, parapet: 1.0, parapetDepth: 0.9 };

/** A bastion's outline at the corner (sx, sz) of the square: gorge in the fort, flanks out along the curtains, faces to the salient point on the diagonal. */
function coastBastionOutline(sx, sz) {
  const h = COAST_FORT.half;
  return [[sx * (h - 3.5), sz * (h - 3.5)], [sx * (h - 3.5), sz * (h + 2.5)], [sx * (h + 4.5), sz * (h + 4.5)], [sx * (h + 2.5), sz * (h - 3.5)]];
}

/** The fraction of the run a→b that lies outside the curtains' square (sampled; the edges are straight so it is one interval). */
function coastOutsideCore(a, b) {
  const h = COAST_FORT.half + 0.02;
  let from = null;
  let to = null;
  for (let step = 0; step <= 60; step += 1) {
    const t = step / 60;
    const x = coastMix(a[0], b[0], t);
    const z = coastMix(a[1], b[1], t);
    if (Math.abs(x) > h || Math.abs(z) > h) {
      if (from === null) from = t;
      to = t;
    }
  }
  return from === null ? null : [from, to];
}

/** A cannon of the 1650s: a cast-iron barrel turned on a lathe profile (cascabel, reinforce rings, muzzle swell), on a wooden truck carriage. Breech at the origin, muzzle along +x. */
function coastCannon(iron, wood, matrix) {
  const profile = [[0, -0.16], [0.06, -0.15], [0.07, -0.1], [0.04, -0.06], [0.19, -0.02], [0.21, 0.03], [0.2, 0.1], [0.19, 0.55], [0.215, 0.58], [0.2, 0.62], [0.18, 1.05], [0.195, 1.08], [0.172, 1.12], [0.145, 2.25], [0.175, 2.33], [0.18, 2.42], [0.1, 2.44], [0.09, 2.3], [0, 2.3]];
  const barrel = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 14);
  const pose = new THREE.Matrix4().makeRotationZ(-Math.PI / 2);
  iron.add(barrel, { matrix: matrix.clone().multiply(coastMatrix(0, 0.62, 0)).multiply(pose), smooth: true });
  const trunnion = new THREE.CylinderGeometry(0.06, 0.06, 0.56, 8);
  iron.add(trunnion, { matrix: matrix.clone().multiply(coastMatrix(1.0, 0.6, 0, 0, Math.PI / 2)), smooth: true });
  // The carriage: two cheeks stepped down to the rear, axle-trees, four solid wheels.
  for (const side of [-1, 1]) {
    wood.box([1.35, 0.42, 0.1], matrix.clone().multiply(coastMatrix(0.75, 0.38, side * 0.25)), { tile: 1 });
    for (const along of [0.3, 1.25]) {
      wood.add(new THREE.CylinderGeometry(0.21, 0.21, 0.09, 12), { matrix: matrix.clone().multiply(coastMatrix(along, 0.21, side * 0.36, 0, Math.PI / 2)), project: true, tile: 0.6 });
    }
  }
  for (const along of [0.3, 1.25]) wood.box([0.14, 0.12, 0.8], matrix.clone().multiply(coastMatrix(along, 0.22, 0)), { tile: 1 });
  wood.box([0.5, 0.1, 0.42], matrix.clone().multiply(coastMatrix(0.2, 0.5, 0)), { tile: 1 }); // the quoin under the breech
}

/**
 * Fort Zeelandia: the brick curtains and four arrowhead bastions on a sandy
 * rise, walls battered and banded by a stone cordon, a parapet with
 * embrasures and a gun in each, the gate with its stone arch, the
 * governor's house with stepped gables on the terreplein, and the
 * Company's flag. Built about the fort's centre; returns { group, tick }.
 */
export function coastFort() {
  const group = new THREE.Group();
  const brick = coastBatch();
  const stone = coastBatch();
  const wood = coastBatch();
  const iron = coastBatch();
  const roof = coastBatch();
  const windows = coastBatch();
  const gateLeaves = coastBatch();
  const { half, curtain, bastion, batter, parapet, parapetDepth } = COAST_FORT;
  const brickStyle = { tile: 1, colour: coastBrickWeather };
  const stoneStyle = { tile: 1.2, colour: (x, y, z, n) => coastBrickWeather(x, y, z, n).map((c) => 0.35 + c * 0.65) };
  const rowsOf = (height) => [0, 0.3, 0.7, 1.2, 1.8, 2.7, 3.8, height - 0.4, height].filter((y, i, all) => y <= height && (i === 0 || y > all[i - 1])).map((y) => y / height);

  // The curtains' square, its terreplein paved in brick.
  const core = coastBattered(brick, [[-half, -half], [half, -half], [half, half], [-half, half]], { height: curtain, batter, spacing: 0.6, rows: rowsOf(curtain) }, brickStyle);
  // The cordon: a band of sandstone round the wall's head, where the parapet stands back from the battered face.
  const cordon = (ring, top) => coastBattered(stone, coastOffset(ring, 0.1), { y0: top - 0.34, height: 0.24, spacing: 3, rows: [0, 1], top: true, bottom: true }, stoneStyle);
  cordon(core, curtain);
  // The curtains' parapets, between the bastions' flanks.
  for (let i = 0; i < 4; i += 1) {
    coastRun(brick, core[i], core[(i + 1) % 4], { y: curtain, height: parapet, thickness: parapetDepth, solid: [[3.5 / 18, 14.5 / 18]] }, brickStyle);
  }
  // The bastions.
  const guns = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const ring = coastBattered(brick, coastBastionOutline(sx, sz), { height: bastion, batter, spacing: 0.6, rows: rowsOf(bastion) }, brickStyle);
    cordon(ring, bastion);
    for (let i = 0; i < 4; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % 4];
      const outside = coastOutsideCore(a, b);
      if (!outside) continue;
      const [from, to] = outside;
      const face = from < 0.02 && to > 0.98;
      if (face) {
        // A face: an embrasure in the middle, a gun run up to it.
        coastRun(brick, a, b, { y: bastion, height: parapet, thickness: parapetDepth, solid: [[0, 0.45], [0.55, 1]] }, brickStyle);
        guns.push({ a, b });
      } else {
        coastRun(brick, a, b, { y: bastion, height: parapet, thickness: parapetDepth, solid: [[Math.max(0, from - 0.05), Math.min(1, to + 0.05)]] }, brickStyle);
      }
    }
  }
  for (const { a, b } of guns) {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    const out = [-dz / length, dx / length];
    const muzzle = [(a[0] + b[0]) / 2 + out[0] * 0.1, (a[1] + b[1]) / 2 + out[1] * 0.1];
    const breech = [muzzle[0] - out[0] * 2.45, muzzle[1] - out[1] * 2.45];
    coastCannon(iron, wood, coastMatrix(breech[0], bastion, breech[1], Math.atan2(-out[1], out[0])));
  }

  // The gate in the landward curtain: a sandstone frontispiece with a round arch, pilasters and a cornice, standing proud of
  // the battered wall so the arch has a deep reveal; oak leaves within.
  const gateBack = half + 0.3;
  const gateFront = gateBack + 1.0;
  const surround = new THREE.Shape();
  surround.moveTo(-1.9, 0);
  surround.lineTo(1.9, 0);
  surround.lineTo(1.9, 4.4);
  surround.lineTo(-1.9, 4.4);
  surround.lineTo(-1.9, 0);
  const opening = new THREE.Path();
  opening.moveTo(-1.1, 0);
  opening.lineTo(-1.1, 2.4);
  opening.absarc(0, 2.4, 1.1, Math.PI, 0, true);
  opening.lineTo(1.1, 0);
  opening.lineTo(-1.1, 0);
  surround.holes.push(opening);
  stone.add(new THREE.ExtrudeGeometry(surround, { depth: gateFront - gateBack, bevelEnabled: false, curveSegments: 12 }), { matrix: coastMatrix(0, 0, gateBack), project: true, ...stoneStyle });
  stone.box([4.5, 0.3, 1.25], coastMatrix(0, 4.55, gateFront - 0.5), stoneStyle); // the cornice
  stone.box([2.0, 0.85, 0.3], coastMatrix(0, 5.1, half + 0.25), stoneStyle); // the tablet over it, where the Company's arms were cut
  for (const side of [-1, 1]) stone.box([0.45, 4.3, 0.25], coastMatrix(side * 1.6, 2.15, gateFront + 0.1), stoneStyle); // pilasters
  gateLeaves.add(new THREE.ShapeGeometry(new THREE.Shape(opening.getPoints(16)), 12), { matrix: coastMatrix(0, 0, gateBack + 0.3), project: true, tile: 2.4, uvOffset: [0.5, 0] });
  stone.box([2.4, 0.12, 1.4], coastMatrix(0, 0.06, gateFront - 0.2), stoneStyle); // the threshold

  // The governor's house on the terreplein: brick, a steep pantiled roof between crow-stepped gables, cross windows.
  const house = { x: 0, z: -3, length: 9, span: 4.6, walls: 3.2, rise: 2.7 };
  const houseMatrix = coastMatrix(house.x, curtain, house.z);
  const houseOutline = [[-house.length / 2, -house.span / 2], [house.length / 2, -house.span / 2], [house.length / 2, house.span / 2], [-house.length / 2, house.span / 2]].map(([x, z]) => [x + house.x, z + house.z]);
  coastBattered(brick, houseOutline, { y0: curtain, height: house.walls, spacing: 0.6, rows: [0, 0.4, 0.8, 1], top: false }, { tile: 1, colour: (x, y, z, n) => coastBrickWeather(x, y - curtain + 1.2, z, n) });
  coastRoof(roof, wood, { length: house.length, span: house.span, plate: house.walls, rise: house.rise, overhang: 0.35, verge: -0.05, thickness: 0.12, rows: 4, columns: 4 }, { tile: 1, colour: (x, y, z) => [0.85 + coastNoise(x * 0.7, z) * 0.25, 0.9, 0.9] }, { tile: 1, tint: [0.5, 0.45, 0.4] }, houseMatrix);
  for (const end of [-1, 1]) {
    // Crow steps: the gable wall carried up past the roof in five steps, each with a stone cap.
    const x = house.x + end * (house.length / 2 - 0.2);
    for (let step = 0; step < 5; step += 1) {
      const width = house.span * (1 - step / 5) + 0.1;
      const bottom = curtain + house.walls + (house.rise * step) / 5 - 0.1;
      const height = house.rise / 5 + (step === 4 ? 0.45 : 0.35);
      brick.box([0.42, height, width], coastMatrix(x, bottom + height / 2, house.z), brickStyle);
      if (step === 4) stone.box([0.5, 0.08, 0.74], coastMatrix(x, bottom + height + 0.04, house.z), stoneStyle);
      else for (const side of [-1, 1]) stone.box([0.5, 0.08, 0.5], coastMatrix(x, bottom + height + 0.04, house.z + side * (width / 2 - 0.25)), stoneStyle);
    }
  }
  brick.box([0.7, 1.6, 0.9], coastMatrix(house.x + 2.2, curtain + house.walls + house.rise - 0.2, house.z - 0.9), brickStyle); // a chimney
  const front = house.z + house.span / 2 + 0.02;
  for (const x of [-3.3, -1.7, 1.7, 3.3]) {
    windows.add(new THREE.PlaneGeometry(0.9, 1.35), { matrix: coastMatrix(x, curtain + 1.75, front + 0.01) });
    stone.box([1.1, 0.1, 0.18], coastMatrix(x, curtain + 1.03, front + 0.06), stoneStyle);
    stone.box([1.1, 0.14, 0.12], coastMatrix(x, curtain + 2.5, front + 0.04), stoneStyle);
    for (const side of [-1, 1]) wood.box([0.42, 1.35, 0.04], coastMatrix(x + side * 0.68, curtain + 1.75, front + 0.03), { tile: 1, tint: [0.45, 0.75, 0.5] }); // shutters folded back, Company green
  }
  gateLeaves.add(new THREE.PlaneGeometry(1.1, 2.1), { matrix: coastMatrix(0, curtain + 1.05, front + 0.01), uvScale: [0.46, 0.88] });
  stone.box([1.5, 0.2, 0.15], coastMatrix(0, curtain + 2.2, front + 0.05), stoneStyle);

  // The flagstaff before the house, the Company's flag on it.
  const staff = { x: 0, z: 3.2, height: 9 };
  wood.add(new THREE.CylinderGeometry(0.07, 0.13, staff.height, 8), { matrix: coastMatrix(staff.x, curtain + staff.height / 2, staff.z), uvScale: [1, 6], tint: [0.7, 0.62, 0.55] });
  wood.add(new THREE.SphereGeometry(0.16, 10, 6), { matrix: coastMatrix(staff.x, curtain + staff.height + 0.1, staff.z), smooth: true, tint: [1.6, 1.3, 0.5] });
  stone.box([0.8, 0.4, 0.8], coastMatrix(staff.x, curtain + 0.2, staff.z), stoneStyle);
  const flagGeometry = new THREE.PlaneGeometry(3, 2, 18, 9);
  flagGeometry.translate(1.5, 0, 0);
  const rest = Float32Array.from(flagGeometry.attributes.position.array);
  const flag = new THREE.Mesh(flagGeometry, new THREE.MeshStandardMaterial({ map: coastFlagSurface().map, side: THREE.DoubleSide, roughness: 0.85 }));
  flag.position.set(staff.x + 0.05, curtain + staff.height - 1.05, staff.z);
  flag.rotation.y = -0.6; // streaming off the sea breeze

  const brickSurface = coastBrickSurface('coast-brick', [[152, 70, 48], [140, 62, 44], [166, 84, 56], [128, 58, 46], [172, 96, 64]], [184, 176, 158]);
  group.add(
    brick.mesh(coastMaterial(brickSurface, { roughness: 0.92, normalScale: 1 })),
    stone.mesh(coastMaterial(coastStoneSurface(), { roughness: 0.85 })),
    wood.mesh(coastMaterial(coastWoodSurface(), { roughness: 0.85 })),
    iron.mesh(coastMaterial(null, { roughness: 0.55, metalness: 0.4, colour: 0x2e2e30 })),
    roof.mesh(coastMaterial(coastPantileSurface(), { roughness: 0.8 })),
    windows.mesh(coastMaterial(coastDutchWindowSurface(), { roughness: 0.5 })),
    gateLeaves.mesh(coastMaterial(coastGateSurface(), { roughness: 0.85, side: THREE.DoubleSide })),
    flag,
  );

  const tick = (time) => {
    const position = flagGeometry.attributes.position;
    for (let index = 0; index < position.count; index += 1) {
      const x = rest[index * 3];
      const y = rest[index * 3 + 1];
      const free = x / 3;
      // A travelling wave out from the hoist, growing toward the fly; the fly sags a little.
      const wave = Math.sin(x * 2.1 - time * 5.2 + y * 0.35) * 0.22 + Math.sin(x * 4.3 - time * 8.1) * 0.06;
      position.setZ(index, wave * free ** 0.8);
      position.setY(index, y - 0.12 * free * free + Math.sin(x * 1.7 - time * 5.2) * 0.04 * free);
      position.setX(index, x - Math.abs(wave) * 0.12 * free);
    }
    position.needsUpdate = true;
    flagGeometry.computeVertexNormals();
  };
  tick(0);
  return { group, tick };
}

// ---- the fort's shore: gabions and palms ----------------------------------------------

/** Gabions: wicker baskets of willow woven round stakes and rammed full of earth; one instanced draw for the wicker, one for the earth. `spots` as render.js's scatter. */
export function coastGabions(spots) {
  const wicker = coastBatch();
  const earth = coastBatch();
  wicker.add(new THREE.CylinderGeometry(0.55, 0.57, 1.1, 18, 1, true), { matrix: coastMatrix(0, 0.55, 0), smooth: true, uvScale: [4, 2.2] });
  wicker.add(new THREE.CylinderGeometry(0.53, 0.55, 1.1, 18, 1, true), { matrix: coastMatrix(0, 0.55, 0, 0, 0, 0, -1, 1, -1), smooth: false, uvScale: [4, 2.2], tint: [0.6, 0.55, 0.5] });
  wicker.add(new THREE.TorusGeometry(0.55, 0.04, 5, 24), { matrix: coastMatrix(0, 1.1, 0, 0, Math.PI / 2), smooth: true, uvScale: [6, 1] });
  for (let stake = 0; stake < 12; stake += 1) {
    const angle = (stake / 12) * Math.PI * 2;
    wicker.add(new THREE.CylinderGeometry(0.018, 0.025, 0.22, 5), { matrix: coastMatrix(Math.cos(angle) * 0.555, 1.15, Math.sin(angle) * 0.555, 0, 0, (stake % 3) * 0.08 - 0.08), smooth: true, uvScale: [0.2, 0.4], tint: [0.8, 0.75, 0.7] });
  }
  earth.add(new THREE.SphereGeometry(0.54, 18, 4, 0, Math.PI * 2, 0, Math.PI / 2), { matrix: coastMatrix(0, 1.02, 0, 0, 0, 0, 1, 0.28, 1), smooth: true, uvScale: [3, 1] });
  const random = coastRandom(907);
  const place = (mesh) => {
    const at = new THREE.Object3D();
    const tone = new THREE.Color();
    spots.forEach(([x, z, scale = 1], index) => {
      at.position.set(x, 0, z);
      at.rotation.set((random() - 0.5) * 0.05, index * 2.1, (random() - 0.5) * 0.05);
      at.scale.set(scale * (0.95 + random() * 0.1), scale * (0.9 + random() * 0.15), scale * (0.95 + random() * 0.1));
      at.updateMatrix();
      mesh.setMatrixAt(index, at.matrix);
      const shade = 0.85 + random() * 0.25;
      mesh.setColorAt(index, tone.setRGB(shade, shade * (0.96 + random() * 0.06), shade * (0.9 + random() * 0.08)));
    });
    mesh.receiveShadow = true;
    return mesh;
  };
  return [
    place(new THREE.InstancedMesh(wicker.geometry(), coastMaterial(coastWickerSurface(), { roughness: 0.95, normalScale: 1.4 }), spots.length)),
    place(new THREE.InstancedMesh(earth.geometry(), coastMaterial(coastEarthSurface(), { roughness: 1 }), spots.length)),
  ];
}

/**
 * Coconut palms: each trunk a tapering tube up a leaning, curving line with a
 * swollen bole and the leaf-scar rings, a crown of arching fronds (cards cut
 * out by the leaflets' alpha, folded along the midrib), older fronds lower
 * and yellower, and a bunch of nuts. Three draws for
 * all of them. `spots` [x, z, scale, turn]: the crown stands at 6 × scale.
 */
export function coastPalms(spots) {
  const trunks = coastBatch();
  const fronds = coastBatch();
  const nuts = coastBatch();
  const up = new THREE.Vector3(0, 1, 0);
  spots.forEach(([x, z, scale, turn], palm) => {
    const random = coastRandom(1201 + palm * 37);
    const height = 6 * scale;
    const lean = (0.5 + random() * 1.4) * scale;
    const toward = new THREE.Vector3(Math.cos(turn), 0, Math.sin(turn));
    const base = new THREE.Vector3(x, 0, z);
    const at = (along, rise) => base.clone().addScaledVector(toward, lean * along).setY(height * rise);
    const curve = new THREE.CubicBezierCurve3(at(0, 0), at(0.6, 0.25), at(0.95, 0.62), at(1.05, 1));
    const segments = 14;
    const sides = 8;
    const radius = 0.15 * scale;
    const trunk = new THREE.TubeGeometry(curve, segments, radius, sides, false);
    const position = trunk.attributes.position;
    for (let ring = 0; ring <= segments; ring += 1) {
      const t = ring / segments;
      const centre = curve.getPointAt(t);
      const taper = 0.85 + 0.75 * (1 - t) ** 6 + 0.08 * (1 - t);
      for (let side = 0; side <= sides; side += 1) {
        const index = ring * (sides + 1) + side;
        const point = new THREE.Vector3().fromBufferAttribute(position, index).sub(centre).multiplyScalar(taper).add(centre);
        position.setXYZ(index, point.x, point.y, point.z);
      }
    }
    trunk.computeVertexNormals();
    const length = curve.getLength();
    trunks.add(trunk, { smooth: true, uvScale: [length / 0.6, 1], uvOffset: [random(), random()], tint: [0.9 + random() * 0.15, 0.9 + random() * 0.1, 0.9] });
    // The crown's base: the old leaf bases bunched where the fronds spring.
    const top = curve.getPointAt(1);
    trunks.add(new THREE.SphereGeometry(radius * 1.6, 8, 5), { matrix: coastMatrix(top.x, top.y - 0.1 * scale, top.z, 0, 0, 0, 1, 1.4, 1), smooth: true, uvScale: [2, 1], tint: [0.75, 0.7, 0.5] });
    const crown = 16;
    for (let leaf = 0; leaf < crown; leaf += 1) {
      const age = random();
      const angle = turn + (leaf / crown) * Math.PI * 2 + (random() - 0.5) * 0.4;
      const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const across = new THREE.Vector3().crossVectors(up, out);
      const reach = (3.1 + random() * 0.9) * scale;
      const width = 0.85 * scale;
      const start = 0.8 - age * 0.8;
      const droop = 0.9 + age * 0.9;
      const steps = 8;
      const spine = [top.clone()];
      for (let step = 1; step <= steps; step += 1) {
        const t = (step - 0.5) / steps;
        const pitch = start - droop * t ** 1.4;
        spine.push(spine[step - 1].clone().addScaledVector(out, Math.cos(pitch) * reach / steps).addScaledVector(up, Math.sin(pitch) * reach / steps));
      }
      const tint = [1 + age * 0.3, 1 - age * 0.05, 0.85 - age * 0.1];
      const style = { tint };
      for (let step = 0; step < steps; step += 1) {
        const row = [step, step + 1].map((k) => {
          const t = k / steps;
          const fold = width * 0.32; // leaflets hang in a V from the midrib
          return [-1, 0, 1].map((s) => spine[k].clone().addScaledVector(across, s * width).addScaledVector(up, -Math.abs(s) * fold).toArray()).map((p, column) => ({ p: new THREE.Vector3(...p), uv: [column / 2, t] }));
        });
        for (let column = 0; column < 2; column += 1) {
          const a = row[0][column];
          const b = row[0][column + 1];
          const c = row[1][column + 1];
          const d = row[1][column];
          fronds.triangle(a.p, b.p, c.p, style, null, [a.uv, b.uv, c.uv]);
          fronds.triangle(a.p, c.p, d.p, style, null, [a.uv, c.uv, d.uv]);
        }
      }
    }
    for (let nut = 0; nut < 5; nut += 1) {
      const angle = random() * Math.PI * 2;
      const tone = 0.7 + random() * 0.5;
      nuts.add(new THREE.IcosahedronGeometry(0.12 * scale, 1), {
        matrix: coastMatrix(top.x + Math.cos(angle) * 0.2 * scale, top.y - (0.25 + random() * 0.15) * scale, top.z + Math.sin(angle) * 0.2 * scale, 0, 0, 0, 1, 1.15, 1),
        smooth: true,
        tint: random() < 0.6 ? [0.42 * tone, 0.5 * tone, 0.2 * tone] : [0.5 * tone, 0.36 * tone, 0.2 * tone],
      });
    }
  });
  const trunkMesh = trunks.mesh(coastMaterial(coastTrunkSurface(), { roughness: 0.95, normalScale: 1.2 }));
  const frondMesh = fronds.mesh(coastMaterial(coastFrondSurface(), { roughness: 0.75, side: THREE.DoubleSide, alphaTest: 0.5 }));
  const nutMesh = nuts.mesh(coastMaterial(null, { roughness: 0.7 }));
  for (const mesh of [trunkMesh, frondMesh, nutMesh]) mesh.castShadow = true;
  return [trunkMesh, frondMesh, nutMesh];
}

// ---- the fishing village ----------------------------------------------------------------

/** One set of batches for the whole village's houses, a draw each. */
function coastVillageBatches() {
  return { wash: coastBatch(), plinth: coastBatch(), tiles: coastBatch(), wood: coastBatch(), stone: coastBatch(), lattice: coastBatch(), door: coastBatch() };
}

/**
 * A house of the Zhejiang coast: whitewashed brick on a plinth of grey
 * brick, gable ends, a shallow concave roof of grey roll tiles lifting at
 * the ends to a raised ridge with upswept tips, deep eaves on rafters, a
 * board door between lattice windows. Ridge along x, door to +z; the
 * footprint 5 × 4 m about (x, z).
 */
function coastHouse(b, x, z, seed) {
  const random = coastRandom(5003 + seed * 101);
  const L = 5;
  const D = 4;
  const plinth = 0.55;
  const eaves = 3.0;
  const rise = 1.05;
  const matrix = coastMatrix(x, 0, z);
  const outline = [[x - L / 2, z - D / 2], [x + L / 2, z - D / 2], [x + L / 2, z + D / 2], [x - L / 2, z + D / 2]];
  const doorAt = random() < 0.5 ? 0 : (random() < 0.5 ? -1.15 : 1.15);
  const front = doorAt === 0 ? [-1.45, 1.45] : [-Math.sign(doorAt) * 1.1];
  const back = [random() < 0.5 ? 0.9 : -0.9];
  const sills = [
    ...front.map((wx) => ({ x: x + wx, z: z + D / 2, y: 1.3, half: 0.5 })),
    ...back.map((wx) => ({ x: x + wx, z: z - D / 2, y: 1.3, half: 0.5 })),
  ];
  const warm = random();
  const tint = [0.97 + warm * 0.04, 0.96 + warm * 0.02, 0.93 - warm * 0.03];
  const washStyle = { tile: 2, tint, colour: coastWashWeather(seed + 1, eaves, sills), uvOffset: [random(), random()] };
  const plinthStyle = { tile: 1, colour: (px, py, pz) => { const d = 0.7 + 0.3 * coastClamp(py / 0.5) + coastNoise(px * 1.3 + pz, py) * 0.12; return [d, d, d * 1.02]; }, uvOffset: [random(), 0] };
  const stoneStyle = { tile: 1.2, tint: [0.78, 0.8, 0.82], uvOffset: [random(), random()] };
  const woodStyle = { tile: 1, tint: [0.62, 0.55, 0.5], colour: coastWoodWeather(0.2) };

  coastBattered(b.plinth, coastOffset(coastOutward(outline), 0.05), { height: plinth, batter: 0.03, spacing: 0.5, rows: [0, 0.4, 1], top: true }, plinthStyle);
  coastBattered(b.wash, outline, { y0: plinth, height: eaves - plinth, spacing: 0.25, rows: [0, 0.12, 0.3, 0.5, 0.7, 0.86, 1], top: false }, washStyle);
  for (const end of [-1, 1]) coastGable(b.wash, end * L / 2, D, eaves, rise, washStyle, matrix);
  const ridge = coastRoof(b.tiles, b.wood, { length: L, span: D, plate: eaves, rise, overhang: 0.6, verge: 0.4, sag: 0.13, lift: 0.2, thickness: 0.16, rows: 6, columns: 6 },
    { tile: 0.88, tint: [0.92 + random() * 0.14, 0.95 + random() * 0.1, 1], uvOffset: [random(), random()], colour: (px, py, pz) => { const m = 0.85 + coastNoise(px * 1.1 + seed, pz * 1.1) * 0.3; return [m, m, m]; } },
    { tile: 1, tint: [0.42, 0.36, 0.32] }, matrix);
  // The ridge: tiles laid on edge in mortar, a rounded crest, tips swept up past the gables.
  const half = L / 2 + 0.4;
  const crest = [];
  for (let k = 0; k <= 12; k += 1) {
    const s = -1 - 0.06 + (k / 12) * 2.12;
    const end = coastClamp((Math.abs(s) - 0.8) / 0.32);
    const point = ridge(Math.max(-half, Math.min(half, s * half)));
    crest.push(new THREE.Vector3(x + s * half, point.y + 0.12 + end * end * 0.2, z));
  }
  const crestCurve = new THREE.CatmullRomCurve3(crest);
  b.tiles.add(new THREE.TubeGeometry(crestCurve, 24, 0.13, 8, false), { smooth: true, uvScale: [10, 1], tint: [0.8, 0.82, 0.86] });
  for (const tip of [crest[0], crest[crest.length - 1]]) b.tiles.add(new THREE.SphereGeometry(0.13, 8, 5), { matrix: coastMatrix(tip.x, tip.y, tip.z), smooth: true, tint: [0.8, 0.82, 0.86] });
  b.wash.box([L + 0.5, 0.2, 0.3], coastMatrix(x, ridge(0).y + 0.02, z), { tile: 2, tint: [0.8, 0.8, 0.8] }); // the mortar bed under the crest

  // Windows: a timber frame round a lattice backed with paper, a stone sill.
  const windowAt = (wx, face) => {
    const wz = z + face * (D / 2);
    const turn = face > 0 ? 0 : Math.PI;
    const at = (dx, y, dz) => coastMatrix(x + wx + (face > 0 ? dx : -dx), y, wz + face * dz, turn);
    b.lattice.add(new THREE.PlaneGeometry(0.85, 0.8), { matrix: at(0, 1.75, 0.03) });
    b.wood.box([1.05, 0.09, 0.16], at(0, 2.2, 0.06), woodStyle);
    b.wood.box([1.05, 0.09, 0.16], at(0, 1.3, 0.06), woodStyle);
    for (const side of [-1, 1]) b.wood.box([0.09, 0.82, 0.16], at(side * 0.475, 1.75, 0.06), woodStyle);
    b.stone.box([1.15, 0.07, 0.22], at(0, 1.22, 0.09), stoneStyle);
  };
  front.forEach((wx) => windowAt(wx, 1));
  back.forEach((wx) => windowAt(wx, -1));
  // The door: two board leaves in a timber frame under a stone lintel, a granite step before it.
  const doorZ = z + D / 2;
  b.door.add(new THREE.PlaneGeometry(1.05, 2.0), { matrix: coastMatrix(x + doorAt, 0.2 + 1.0, doorZ + 0.1) });
  for (const side of [-1, 1]) b.wood.box([0.12, 2.15, 0.22], coastMatrix(x + doorAt + side * 0.585, 1.075, doorZ + 0.08), woodStyle);
  b.stone.box([1.6, 0.2, 0.3], coastMatrix(x + doorAt, 2.3, doorZ + 0.09), stoneStyle);
  b.stone.box([1.5, 0.2, 0.55], coastMatrix(x + doorAt, 0.1, doorZ + 0.3), stoneStyle);
  // New Year's couplets, faded red paper pasted either side of the door.
  for (const side of [-1, 1]) b.wood.box([0.22, 1.4, 0.02], coastMatrix(x + doorAt + side * 0.82, 1.45, doorZ + 0.01), { tint: [1.5, 0.45, 0.35], tile: 4 });
}

/** The village's houses at `spots` ([x, z]); returns the meshes, one per material. */
export function coastHouses(spots) {
  const b = coastVillageBatches();
  spots.forEach(([x, z], index) => coastHouse(b, x, z, index));
  const greyBrick = coastBrickSurface('coast-greybrick', [[112, 114, 116], [100, 102, 106], [124, 124, 122], [92, 96, 100]], [168, 166, 158]);
  return [
    b.wash.mesh(coastMaterial(coastWhitewashSurface(), { roughness: 0.95 })),
    b.plinth.mesh(coastMaterial(greyBrick, { roughness: 0.92 })),
    b.tiles.mesh(coastMaterial(coastRollTileSurface(), { roughness: 0.85, normalScale: 1.2 })),
    b.wood.mesh(coastMaterial(coastWoodSurface(), { roughness: 0.88 })),
    b.stone.mesh(coastMaterial(coastStoneSurface(), { roughness: 0.85 })),
    b.lattice.mesh(coastMaterial(coastLatticeSurface(), { roughness: 0.85 })),
    b.door.mesh(coastMaterial(coastDoorSurface(), { roughness: 0.8 })),
  ];
}

// ---- boats -----------------------------------------------------------------------------

/**
 * A planked hull lofted through stations: `section` gives one side's
 * cross-section from the keel to the gunwale as [out, up] fractions of the
 * half-beam and the depth; the beam narrows to `ends` [stern, bow] (fractions)
 * at the transoms, the sheer rises toward each end, the bottom rockers up.
 * Bow toward +x. A smooth indexed geometry with UVs in metres (u along, v
 * round the girth) for the plank texture.
 */
function coastHullGeometry({ length, beam, depth, keel = 0, section, ends, sheer, rocker = 0, stations = 16, deckDrop = null }) {
  const positions = [];
  const uvs = [];
  const index = [];
  const ring = [...section.slice(1).reverse().map(([o, u]) => [-o, u]), ...section];
  const width = ring.length;
  const frame = (t) => {
    const e = 2 * t - 1;
    const end = e < 0 ? ends[0] : ends[1];
    const breadth = (beam / 2) * (end + (1 - end) * Math.sin(Math.PI * t) ** 0.55);
    const bottom = keel + rocker * e ** 4;
    const top = keel + depth + (e < 0 ? sheer[0] : sheer[1]) * Math.abs(e) ** 2.2;
    return { x: e * (length / 2), breadth, bottom, top };
  };
  for (let i = 0; i <= stations; i += 1) {
    const f = frame(i / stations);
    let girth = 0;
    let last = null;
    ring.forEach(([o, u]) => {
      const point = [f.x, f.bottom + u * (f.top - f.bottom), o * f.breadth];
      if (last) girth += Math.hypot(point[1] - last[1], point[2] - last[2]);
      last = point;
      positions.push(...point);
      uvs.push(f.x / 2, girth / 2);
    });
  }
  for (let i = 0; i < stations; i += 1) {
    for (let j = 0; j < width - 1; j += 1) {
      const a = i * width + j;
      const b = (i + 1) * width + j;
      index.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  // The transoms: each end closed flat.
  for (const [i, flip] of [[0, true], [stations, false]]) {
    const f = frame(i / stations);
    const centre = positions.length / 3;
    positions.push(f.x, (f.bottom + f.top) / 2, 0);
    uvs.push(0, 0);
    for (let j = 0; j < width - 1; j += 1) {
      const a = i * width + j;
      if (flip) index.push(centre, a + 1, a);
      else index.push(centre, a, a + 1);
    }
  }
  // A deck below the gunwale, following the sheer.
  if (deckDrop !== null) {
    const start = positions.length / 3;
    for (let i = 0; i <= stations; i += 1) {
      const f = frame(i / stations);
      const [o] = section[section.length - 2];
      for (const side of [-1, 1]) {
        positions.push(f.x, f.top - deckDrop, side * o * f.breadth * 0.98);
        uvs.push(f.x / 2, side * 0.5);
      }
    }
    for (let i = 0; i < stations; i += 1) {
      const a = start + i * 2;
      index.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** The village's boats' batches: planked hulls, matting, timber. */
function coastBoatBatches() {
  return { hull: coastBatch(), mat: coastBatch(), wood: coastBatch() };
}

/**
 * A sampan drawn up on the beach: a flat-bottomed planked hull with square
 * ends rising fore and aft, floorboards and thwarts, a barrel awning of
 * bamboo matting amidships, a sculling oar; `rigged`, a mast with a
 * battened mat lugsail instead of the awning. Bow along +x before `turn`.
 */
function coastSampan(b, x, z, turn, seed, rigged) {
  const random = coastRandom(7001 + seed * 17);
  const matrix = coastMatrix(x, 0, z, turn);
  const hull = coastHullGeometry({
    length: 6, beam: 1.7, depth: 0.62, section: [[0, 0], [0.5, 0], [0.82, 0.1], [0.96, 0.55], [1, 1]],
    ends: [0.48, 0.36], sheer: [0.55, 0.4], rocker: 0.06, stations: 14,
  });
  const tar = 0.55 + random() * 0.2;
  b.hull.add(hull, {
    matrix, smooth: true, uvOffset: [random(), 0],
    colour: (px, py) => (py > 0.5 ? [1.05, 0.98, 0.9] : [tar, tar * 0.9, tar * 0.8]),
  });
  const at = (dx, y, dz, ry = 0) => matrix.clone().multiply(coastMatrix(dx, y, dz, ry));
  const woodStyle = { tile: 1, tint: [0.75, 0.66, 0.56] };
  b.wood.box([4.6, 0.04, 1.05], at(0, 0.1, 0), woodStyle); // floorboards
  for (const along of [-1.6, 0.2, 1.6]) b.wood.box([0.22, 0.05, 1.55], at(along, 0.5, 0), woodStyle); // thwarts
  b.wood.add(new THREE.CylinderGeometry(0.03, 0.04, 4.2, 6), { matrix: at(-1.4, 0.68, 0.45, 0).multiply(coastMatrix(0, 0, 0, 0, 0, Math.PI / 2 - 0.08)), uvScale: [0.2, 4], ...woodStyle }); // the yuloh, shipped
  if (!rigged) {
    const awning = new THREE.CylinderGeometry(0.72, 0.72, 1.9, 12, 1, true, 0, Math.PI);
    b.mat.add(awning, { matrix: at(-0.3, 0.55, 0).multiply(coastMatrix(0, 0, 0, 0, 0, Math.PI / 2)), smooth: true, uvScale: [2.4, 2.2], uvOffset: [random(), random()] });
    for (const along of [-1.2, -0.3, 0.6]) b.wood.add(new THREE.TorusGeometry(0.73, 0.025, 4, 12, Math.PI), { matrix: at(along, 0.55, 0, Math.PI / 2), smooth: true, ...woodStyle });
    return;
  }
  // The mast and its lugsail: matting stiffened by bamboo battens, the yard peaked up abaft the mast.
  b.wood.add(new THREE.CylinderGeometry(0.045, 0.07, 4.6, 7), { matrix: at(1.1, 2.3, 0), uvScale: [0.3, 4], ...woodStyle });
  const sail = (s, t) => {
    const foot = [-1.5, 0.9];
    const head = [-1.1, 1.25];
    const aft = coastMix(foot[0], head[0], t) - 0.35 * Math.sin(Math.PI * t);
    const fore = coastMix(foot[1], head[1], t);
    return new THREE.Vector3(1.1 + coastMix(aft, fore, s), 1.0 + t * 3.1, 0.18 * Math.sin(Math.PI * s) * (0.6 + 0.4 * t)).applyMatrix4(matrix);
  };
  const battens = 6;
  for (let row = 0; row < battens; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const p = [sail(column / 3, row / battens), sail((column + 1) / 3, row / battens), sail((column + 1) / 3, (row + 1) / battens), sail(column / 3, (row + 1) / battens)];
      b.mat.triangle(p[0], p[1], p[2], { tile: 0.8 });
      b.mat.triangle(p[0], p[2], p[3], { tile: 0.8 });
    }
  }
  for (let row = 0; row <= battens; row += 1) {
    const a = sail(0, row / battens);
    const c = sail(1, row / battens);
    const middle = a.clone().add(c).multiplyScalar(0.5);
    const along = c.clone().sub(a);
    const batten = new THREE.CylinderGeometry(0.025, 0.025, along.length() + 0.15, 5);
    batten.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.normalize())));
    batten.translate(middle.x, middle.y, middle.z + 0.03);
    b.wood.add(batten, { uvScale: [0.2, 3], tint: [0.95, 0.85, 0.6] });
  }
}

/** The village's sampans at `spots` ([x, z, turn]); the first and third rigged, the others under their awnings. */
export function coastSampans(spots) {
  const b = coastBoatBatches();
  spots.forEach(([x, z, turn], index) => coastSampan(b, x, z, turn, index, index % 2 === 0));
  const hull = b.hull.mesh(coastMaterial(coastPlankSurface(), { roughness: 0.85, side: THREE.DoubleSide }));
  return [
    hull,
    b.mat.mesh(coastMaterial(coastMatSurface(), { roughness: 0.95, side: THREE.DoubleSide })),
    b.wood.mesh(coastMaterial(coastWoodSurface(), { roughness: 0.85 })),
  ];
}

/**
 * The pier: a deck of planks on two stringers and cross-caps, carried on
 * pairs of timber piles driven every two metres, braced, the tall ones
 * standing up through the deck as mooring posts; stone steps at the land
 * end. `x0`→`x1` along x at `z`, the deck `width` wide, its top at `deck`.
 */
export function coastPier({ x0, x1, z, width, deck }) {
  const wood = coastBatch();
  const planks = coastBatch();
  const stone = coastBatch();
  const length = x1 - x0;
  const middle = (x0 + x1) / 2;
  const wet = coastWoodWeather(0.35);
  const pile = { tile: 1, colour: wet };
  planks.box([length, 0.08, width], coastMatrix(middle, deck - 0.04, z), { tile: 2, colour: (x, y, zz) => { const m = 0.8 + coastNoise(x * 0.5, zz) * 0.3; return [m, m * 0.97, m * 0.93]; } });
  for (const side of [-1, 1]) wood.box([length, 0.2, 0.16], coastMatrix(middle, deck - 0.18, z + side * (width / 2 - 0.25)), pile);
  for (let x = x0 + 0.4; x <= x1 - 0.2; x += 2) {
    const post = Math.round((x - x0) / 2) % 3 === 0;
    for (const side of [-1, 1]) {
      const top = post ? deck + 0.55 : deck - 0.1;
      const height = top + 1.6;
      wood.add(new THREE.CylinderGeometry(0.12, 0.14, height, 8), { matrix: coastMatrix(x, top - height / 2, z + side * (width / 2 + 0.05)), uvScale: [0.6, height], uvOffset: [x, 0], colour: wet });
    }
    wood.box([0.18, 0.18, width + 0.4], coastMatrix(x, deck - 0.36, z), pile);
    // A cross brace in alternate bays, below the deck.
    if (Math.round((x - x0) / 2) % 2 === 1) {
      const brace = Math.atan2(1.2, width);
      wood.box([0.1, 0.12, Math.hypot(width, 1.2)], coastMatrix(x, deck - 1.0, z, 0, brace), pile);
    }
  }
  stone.box([1.2, 0.5, width + 0.4], coastMatrix(x0 - 0.5, 0.25, z), { tile: 1.2, tint: [0.75, 0.76, 0.78] });
  stone.box([0.7, 0.25, width + 0.2], coastMatrix(x0 - 1.4, 0.125, z), { tile: 1.2, tint: [0.75, 0.76, 0.78] });
  return [
    wood.mesh(coastMaterial(coastWoodSurface(), { roughness: 0.9 })),
    planks.mesh(coastMaterial(coastPlankSurface(), { roughness: 0.9 })),
    stone.mesh(coastMaterial(coastStoneSurface(), { roughness: 0.85 })),
  ];
}

/** Racks of nets hung to dry: two posts and a pole across, the tanned net draped over it both sides with cork floats along its foot. `spots` [x, z]. */
export function coastNetRacks(spots) {
  const wood = coastBatch();
  const net = coastBatch();
  spots.forEach(([x, z], rack) => {
    const random = coastRandom(8101 + rack * 13);
    const woodStyle = { tile: 1, tint: [0.7, 0.62, 0.55], colour: coastWoodWeather(0.1) };
    for (const end of [-1.6, 1.6]) wood.add(new THREE.CylinderGeometry(0.06, 0.08, 2.3, 6), { matrix: coastMatrix(x, 1.15, z + end, 0, 0, (random() - 0.5) * 0.06), uvScale: [0.3, 2.3], ...woodStyle });
    wood.add(new THREE.CylinderGeometry(0.045, 0.05, 3.7, 6), { matrix: coastMatrix(x, 2.08, z, 0, Math.PI / 2), uvScale: [0.3, 3.7], ...woodStyle });
    for (const side of [-1, 1]) {
      const columns = 10;
      const rows = 6;
      const foot = Array.from({ length: columns + 1 }, () => 0.35 + random() * 0.35);
      const point = (c, r) => {
        const s = c / columns;
        const t = r / rows;
        const sag = Math.sin(Math.PI * s) * 0.12;
        const bottom = foot[c];
        return new THREE.Vector3(x + side * (0.03 + t * 0.35 + Math.sin(Math.PI * t) * 0.08), 2.06 - t * (2.06 - bottom) - sag * t, z - 1.5 + s * 3.0);
      };
      for (let c = 0; c < columns; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          net.triangle(point(c, r), point(c + 1, r), point(c + 1, r + 1), { tile: 0.5 });
          net.triangle(point(c, r), point(c + 1, r + 1), point(c, r + 1), { tile: 0.5 });
        }
      }
      for (let c = 0; c <= columns; c += 2) {
        const at = point(c, rows);
        wood.box([0.07, 0.1, 0.16], coastMatrix(at.x, at.y + 0.04, at.z), { tile: 1, tint: [0.95, 0.8, 0.6] });
      }
    }
  });
  return [
    wood.mesh(coastMaterial(coastWoodSurface(), { roughness: 0.9 })),
    net.mesh(coastMaterial(coastNetSurface(), { roughness: 1, side: THREE.DoubleSide, alphaTest: 0.04, transparent: true })),
  ];
}

// ---- ships at anchor -----------------------------------------------------------------

/** The ships' materials, one set shared by a place's ships. */
export function coastShipMaterials(dutch) {
  return {
    hull: coastMaterial(coastPlankSurface(), { roughness: 0.85, side: THREE.DoubleSide }),
    wood: coastMaterial(coastWoodSurface(), { roughness: 0.85 }),
    sail: coastMaterial(dutch ? coastSailSurface() : coastMatSurface(), { roughness: 0.95, side: THREE.DoubleSide }),
    rigging: new THREE.LineBasicMaterial({ color: 0x2a2018 }),
  };
}

/**
 * A ship riding at anchor, bow along +x: a Dutch fluyt (`dutch`: a deep
 * round-sided hull with tumblehome and a high narrow stern, square-rigged,
 * the courses furled on their yards and the topsails loosed to dry) or a
 * Fujian-style junk (a flat transom bow, high stern, battened mat sails).
 * Hull, spars, sails, rigging: four draws (`materials` from coastShipMaterials). Its waterline at y = 0.
 */
export function coastShip({ dutch, masts, materials }) {
  const group = new THREE.Group();
  const hull = coastBatch();
  const wood = coastBatch();
  const sails = coastBatch();
  const lines = [];
  const spec = dutch
    ? { length: 14, beam: 4.2, depth: 4.0, keel: -1.7, section: [[0, 0], [0.35, 0.02], [0.8, 0.18], [1, 0.5], [0.97, 0.75], [0.84, 1]], ends: [0.55, 0.1], sheer: [2.3, 1.1], rocker: 0.6, stations: 18, deckDrop: 0.7 }
    : { length: 13, beam: 4, depth: 3.5, keel: -1.5, section: [[0, 0], [0.5, 0.02], [0.9, 0.25], [1, 0.6], [1, 1]], ends: [0.6, 0.48], sheer: [2.6, 1.3], rocker: 0.5, stations: 18, deckDrop: 0.6 };
  const top = spec.keel + spec.depth;
  // Paint in bands below the sheer line (which rises toward the ends): a Dutch hull tarred below a black wale and
  // ochre upperworks; a junk's oiled brown with a red and white band under the rail.
  const sheerAt = (x) => {
    const e = coastClamp(x / (spec.length / 2), -1, 1);
    return top + (e < 0 ? spec.sheer[0] : spec.sheer[1]) * Math.abs(e) ** 2.2;
  };
  const paint = (x, y) => {
    const below = sheerAt(x) - y;
    if (dutch) return below < 0.55 ? [1.0, 0.82, 0.52] : below < 0.85 ? [0.3, 0.27, 0.25] : [0.55, 0.45, 0.38];
    return below < 0.3 ? [0.95, 0.42, 0.32] : below < 0.45 ? [1.1, 1.05, 0.95] : [0.62, 0.52, 0.44];
  };
  hull.add(coastHullGeometry(spec), { smooth: true, colour: paint });
  if (dutch) {
    // The stern's great cabin and taffrail, carved and painted.
    hull.box([2.4, 1.6, 2.6], coastMatrix(-5.4, top + 1.6, 0), { tile: 2, tint: [0.9, 0.7, 0.45] });
    hull.box([0.3, 2.4, 2.4], coastMatrix(-6.55, top + 1.9, 0), { tile: 2, tint: [0.75, 0.55, 0.4] });
  } else {
    hull.box([3.0, 1.1, 3.0], coastMatrix(-4.6, top + 1.4, 0), { tile: 2, tint: [0.8, 0.55, 0.42] });
  }
  const stations = dutch ? [[4.2, 14], [0.2, 17], [-3.8, 11]].slice(0, masts === 2 ? 2 : 3) : [[3.6, 10], [-0.4, 13]];
  if (dutch && masts === 2) stations[1] = [-1.8, 16];
  stations.forEach(([along, height], mast) => {
    const foot = top - 0.6;
    const rake = dutch ? 0 : (mast === 0 ? 0.08 : -0.03);
    const head = new THREE.Vector3(along + Math.sin(rake) * height, foot + height, 0);
    const pole = new THREE.CylinderGeometry(0.12, 0.22, height, 8);
    wood.add(pole, { matrix: coastMatrix(along + Math.sin(rake) * height / 2, foot + height / 2, 0, 0, 0, -rake), uvScale: [0.5, height], tint: [0.7, 0.6, 0.5] });
    // Shrouds from the masthead down to the chains at either side.
    for (const side of [-1, 1]) {
      for (const offset of [-0.7, 0, 0.7]) lines.push(new THREE.Vector3(along + Math.sin(rake) * height * 0.75, foot + height * 0.75, 0), new THREE.Vector3(along + offset, top + 0.05, side * spec.beam * 0.42));
    }
    if (dutch) {
      const yard = height * 0.62;
      // The course furled on its yard; above it the topsail loosed, hanging in a soft belly.
      for (const [y, span, furled] of [[0.55, yard, true], [0.88, yard * 0.72, false]]) {
        const level = foot + height * y;
        wood.add(new THREE.CylinderGeometry(0.08, 0.08, span, 6), { matrix: coastMatrix(along, level, 0, 0, Math.PI / 2), uvScale: [0.3, span], tint: [0.6, 0.5, 0.42] });
        if (furled) {
          sails.add(new THREE.CylinderGeometry(0.24, 0.24, span * 0.92, 8), { matrix: coastMatrix(along + 0.05, level - 0.12, 0, 0, Math.PI / 2, 0, 1, 1, 1), smooth: true, uvScale: [1, 4] });
          continue;
        }
        const below = foot + height * 0.57;
        const point = (s, t) => new THREE.Vector3(along + 0.55 * Math.sin(Math.PI * s) * Math.sin(Math.PI * t * 0.9) + 0.08, coastMix(level, below, t), (s - 0.5) * coastMix(span * 0.95, span * 1.05, t));
        for (let c = 0; c < 4; c += 1) {
          for (let r = 0; r < 4; r += 1) {
            const p = [point(c / 4, r / 4), point((c + 1) / 4, r / 4), point((c + 1) / 4, (r + 1) / 4), point(c / 4, (r + 1) / 4)];
            const uv = [[c / 4, 1 - r / 4], [(c + 1) / 4, 1 - r / 4], [(c + 1) / 4, 1 - (r + 1) / 4], [c / 4, 1 - (r + 1) / 4]].map(([u, v]) => [u * span / 2.4, v * 2.4]);
            sails.triangle(p[0], p[1], p[2], {}, null, [uv[0], uv[1], uv[2]]);
            sails.triangle(p[0], p[2], p[3], {}, null, [uv[0], uv[2], uv[3]]);
          }
        }
      }
    } else {
      // A battened lugsail of matting, its yard peaked, set fore-and-aft and bellied a little to leeward.
      const width = height * 0.5;
      const point = (s, t) => {
        const aft = -width * (0.75 + 0.15 * Math.sin(Math.PI * t));
        const fore = width * 0.22;
        return new THREE.Vector3(along + Math.sin(rake) * (height * (0.15 + t * 0.8)) + coastMix(aft, fore, s), foot + height * (0.15 + t * 0.8), 0.35 * Math.sin(Math.PI * s));
      };
      const battens = 7;
      for (let r = 0; r < battens; r += 1) {
        for (let c = 0; c < 3; c += 1) {
          const p = [point(c / 3, r / battens), point((c + 1) / 3, r / battens), point((c + 1) / 3, (r + 1) / battens), point(c / 3, (r + 1) / battens)];
          sails.triangle(p[0], p[1], p[2], { tile: 1.6 });
          sails.triangle(p[0], p[2], p[3], { tile: 1.6 });
        }
      }
      for (let r = 0; r <= battens; r += 1) lines.push(point(0, r / battens), point(1, r / battens));
    }
  });
  // Stays fore and aft, and the bowsprit.
  const heads = stations.map(([along, height]) => new THREE.Vector3(along, top - 0.6 + height * 0.97, 0));
  const bow = new THREE.Vector3(spec.length / 2 + (dutch ? 3.2 : 0.8), top + spec.sheer[1] + (dutch ? 1.0 : 0), 0);
  if (dutch) wood.add(new THREE.CylinderGeometry(0.07, 0.14, 4.5, 6), { matrix: coastMatrix(spec.length / 2 + 1.0, top + spec.sheer[1] + 0.3, 0, 0, 0, -Math.PI / 2 + 0.25), uvScale: [0.3, 4], tint: [0.7, 0.6, 0.5] });
  lines.push(heads[0], bow);
  for (let k = 0; k < heads.length - 1; k += 1) lines.push(heads[k + 1], heads[k].clone().setY(heads[k].y - 3));
  lines.push(heads[heads.length - 1], new THREE.Vector3(-spec.length / 2, top + spec.sheer[0], 0));
  const rigging = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), materials.rigging);
  group.add(hull.mesh(materials.hull), wood.mesh(materials.wood), sails.mesh(materials.sail), rigging);
  return group;
}

/**
 * The open sea out to the horizon. The open-air camera draws only to 60 m
 * when no generated land is shown (the coast has none), so the sea stops
 * there and the sky shows below the horizon, and a ship at anchor seems to
 * float in it. A band of distant water, from the true horizon down, kept
 * centred on the eye and drawn first behind everything (like the sky):
 * pale where the sea meets the haze, darker nearer. Seaward only (where the
 * view's x runs on into the sea, −1.9…1.9 rad round from +x).
 */
function coastHorizonBand() {
  const rows = [[0, 0xbcd4e4], [-0.012, 0x9dbfd6], [-0.04, 0x6e9cba], [-0.12, 0x4f86a8], [-0.6, 0x3f7a9c]];
  const columns = 36;
  const positions = [];
  const colours = [];
  const index = [];
  const colour = new THREE.Color();
  for (const [elevation, hex] of rows) {
    colour.set(hex);
    for (let column = 0; column <= columns; column += 1) {
      const azimuth = -1.9 + (3.8 * column) / columns;
      positions.push(Math.cos(azimuth) * Math.cos(elevation) * 50, Math.sin(elevation) * 50, Math.sin(azimuth) * Math.cos(elevation) * 50);
      colours.push(colour.r, colour.g, colour.b);
    }
  }
  for (let row = 0; row < rows.length - 1; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(index);
  const band = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  band.frustumCulled = false;
  band.renderOrder = -998; // after the sky (−1000), before anything real
  return band;
}

/**
 * The sea's far reach for a camera that draws to 60 m: the horizon band
 * (above), and the ships shown whole or not at all, since a ship standing
 * across the far plane is cut into fragments hanging in the sky. A marker
 * that draws nothing, drawn first, moves the band to the eye and checks the
 * corners of each ship's box against the far plane (a frame late for the
 * ships, unseen at sea's distance). Returns [marker, band].
 */
export function coastFarPlaneGuard(ships) {
  const marker = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  marker.frustumCulled = false;
  marker.renderOrder = -999;
  const band = coastHorizonBand();
  const boxes = ships.map((ship) => {
    ship.updateMatrixWorld(true);
    const box = new THREE.Box3();
    ship.traverse((object) => {
      if (!object.geometry) return;
      object.geometry.computeBoundingBox();
      box.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrix));
    });
    return box;
  });
  const corner = new THREE.Vector3();
  const eye = new THREE.Vector3();
  marker.onBeforeRender = (renderer, scene, camera) => {
    if (!camera.isPerspectiveCamera) return;
    eye.setFromMatrixPosition(camera.matrixWorld);
    band.position.copy(eye);
    band.updateMatrixWorld();
    ships.forEach((ship, index) => {
      const { min, max } = boxes[index];
      let deepest = 0;
      for (let k = 0; k < 8; k += 1) {
        corner.set(k & 1 ? max.x : min.x, k & 2 ? max.y : min.y, k & 4 ? max.z : min.z);
        ship.localToWorld(corner).applyMatrix4(camera.matrixWorldInverse);
        deepest = Math.max(deepest, -corner.z);
      }
      // (With a margin both ways: a ship at the far plane's edge, with the camera swaying, took turns being shown and hidden, frame after frame.)
      ship.visible = deepest < camera.far * (ship.visible ? 0.995 : 0.985);
    });
  };
  return [marker, band];
}
