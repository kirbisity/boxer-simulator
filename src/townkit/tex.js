// The town kit's surfaces: brick, dressed stone, plaster, timber, roof tile, paving, earth and rock, each painted
// per pixel when the page loads (no image is shipped) as a height field with its colour and its roughness, and
// finished into three sheets that tile: the colour, a normal map from the height, and a third sheet holding the
// height (red), the roughness (green, where three.js reads it) and how deep in a joint the pixel lies (blue).
// A place's wet weather reads the height for its puddles (townkit/weather.js).
//
// Every sheet is painted at a real size (`metres`): the makers (townkit/geo.js) lay UVs in metres and divide by it,
// so a brick is a brick's size on every wall. The sizes of bricks, courses and tiles below are typical ones read off
// the reference photographs of a Jiangnan water town and of a Korean fortress gate, not measured from a survey.

/* global THREE */

/**
 * The sheets. `size`: texels a side; `metres`: what one repeat covers; `relief`: the depth (m) the height's 0..1
 * stands for, which with the texel's size sets the normal map's slope. Colours are [r, g, b] 0..1 as displayed
 * (the renderer's output is linear: render.js).
 */
export const TK_TEX = {
  // Jiangnan grey brick (青砖), laid in running bond: about 25 x 5 cm faces with a 1 cm lime joint (thin bricks, as on the
  // archway of the wet-lane reference: some thirty courses to its 1.5 m of pier).
  brick: { size: 512, metres: 1.5, relief: 0.012, courses: 30, perCourse: 6, joint: 0.01, face: [0.47, 0.5, 0.51], mortar: [0.7, 0.7, 0.66] },
  // Dressed granite in level courses (the canal's embankment, the bridge, the gate's base): 40 cm courses, blocks 0.6 to 1.3 m long.
  ashlar: { size: 512, metres: 2.4, relief: 0.03, courses: 6, blocks: [3, 4], joint: 0.012, round: 0.02, face: [0.56, 0.55, 0.52], mortar: [0.3, 0.3, 0.28], pit: 0.35 },
  // A fortress wall's face: roughly squared stones in courses that are not quite level, the joints open and deep (dry-laid
  // with a rubble and earth core, as Joseon town walls were: the Pyongyang gate reference shows the same below the parapet).
  rubble: { size: 512, metres: 3, relief: 0.07, courses: 8, blocks: [5, 8], joint: 0.03, round: 0.06, face: [0.52, 0.5, 0.46], mortar: [0.2, 0.19, 0.17], pit: 0.6 },
  // Flagstones: granite slabs laid across a lane in rows, 0.6 m deep and 0.7 to 1.5 m long, worn smooth, each lying a
  // few millimetres off its neighbours (which is where the rain stands).
  // (`vary`, `warm`: how far one slab's tone and colour stand from the next: a pavement is one quarry's stone, worn alike.)
  flags: { size: 512, metres: 3, relief: 0.022, courses: 5, blocks: [2, 4], joint: 0.014, round: 0.012, face: [0.5, 0.5, 0.49], mortar: [0.24, 0.25, 0.23], pit: 0.2, vary: 0.11, warm: 0.016 },
  // Small setts and river cobbles, a hand or two across (the edges of lanes, the road before the gate).
  cobble: { size: 512, metres: 1.5, relief: 0.03, stones: 14, face: [0.45, 0.45, 0.43], mortar: [0.29, 0.28, 0.26] },
  // Lime plaster, whitewashed and weathered: a house wall above its brick foot.
  plaster: { size: 512, metres: 3, relief: 0.004, face: [0.86, 0.86, 0.83], stain: [0.5, 0.5, 0.47] },
  // Sawn timber, the grain along u: boards 20 cm wide. Painted near neutral so that the makers' vertex colours give
  // the wood its finish (dark tung-oiled fir in Jiangnan; red and green paint on the gate).
  timber: { size: 512, metres: 1.2, relief: 0.006, boards: 6, face: [0.8, 0.76, 0.7] },
  // Roof tiles as rows: half-round cover tiles over the joints of shallow pans, lapped every 20 cm down the slope.
  // `rolls` rows across one repeat; the roof maker's real rolls stand on the painted ones.
  rooftile: { size: 512, metres: 0.84, relief: 0.045, rolls: 4, laps: 4, face: [0.3, 0.31, 0.32], moss: [0.3, 0.35, 0.22] },
  // Bare ground: trodden earth with grit and dead grass.
  earth: { size: 512, metres: 4, relief: 0.03, face: [0.42, 0.37, 0.29], grass: [0.52, 0.47, 0.3] },
  // Living rock: bedded granite, weathered.
  rock: { size: 512, metres: 5, relief: 0.12, face: [0.47, 0.46, 0.44] },
  // Window lattice: thin bars over the dark of the room, cut out by alpha. `bars` a repeat; `bar`: a bar's share of its pitch.
  lattice: { size: 256, metres: 0.48, relief: 0.012, bars: 4, bar: 0.24, face: [0.8, 0.76, 0.7] },
  // Leaves, cut out by alpha, for the cards a tree's crown is made of: `count` leaves a sheet, each `long` by `wide` of the sheet
  // (a broadleaf's in summer; a pine's needles in bundles). Colours typical of camphor and willow, and of red pine in winter.
  // Each sheet is one spray, not a tiling field: the leaves stand thick at its middle and thin out to nothing `spray`
  // of the way to its edge, so a card of it has a ragged leafy outline and no square one. A broadleaf's leaves lie
  // any way; a pine's needles stand in `bundles` fans, each fan's needles spreading from its twig's end.
  foliage: { size: 256, metres: 1, relief: 0.03, count: 150, long: 0.062, wide: 0.03, face: [0.33, 0.45, 0.22], spray: 0.9 },
  needles: { size: 256, metres: 1, relief: 0.02, count: 520, long: 0.085, wide: 0.0055, face: [0.2, 0.3, 0.19], spray: 0.86, bundles: 30 },
  // A tuft of grass or weed, cut out by alpha, for the cards that stand at wall feet and in joints: `count` blades
  // from the sheet's foot, fanning `fan` of its width to each side, each `wide` of the sheet at its base and tapering,
  // bending over as it rises. Painted pale (`face` at the foot, `tip` at the ends): the card's own colour tints it
  // green or dead.
  tuft: { size: 256, metres: 1, relief: 0.02, count: 34, fan: 0.36, wide: 0.02, face: [0.62, 0.6, 0.44], tip: [0.92, 0.9, 0.7] },
};

/** A seeded generator, 0..1 (mulberry32). */
export function tkRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const tkSmooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A hash of two whole numbers and a seed, 0..1. */
export function tkHash(i, j, seed = 0) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise that repeats every `period` cells (so a sheet tiles): 0..1 at (x, y) in cells. */
export function tkNoise(x, y, period, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const wrap = (n) => ((n % period) + period) % period;
  const a = tkHash(wrap(x0), wrap(y0), seed);
  const b = tkHash(wrap(x0 + 1), wrap(y0), seed);
  const c = tkHash(wrap(x0), wrap(y0 + 1), seed);
  const d = tkHash(wrap(x0 + 1), wrap(y0 + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Fractal noise over a repeat (u, v in 0..1): `cells` across at the first octave, each octave twice as fine and half as strong. */
export function tkFbm(u, v, cells, octaves, seed = 0) {
  let sum = 0;
  let weight = 0;
  let amplitude = 1;
  let period = cells;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += amplitude * tkNoise(u * period, v * period, period, seed + octave * 17);
    weight += amplitude;
    amplitude *= 0.5;
    period *= 2;
  }
  return sum / weight;
}

/**
 * Courses of blocks over a repeat: which block (u, v) is in, and how far (0..1 of the repeat, the lesser of across and
 * up) it is from that block's edge. Each course has its own cuts (`blocks` [fewest, most] a course) and, for rough
 * work, its own height (`uneven` 0..1 of the mean course).
 */
function tkxCourses(courses, blocks, seed, uneven = 0) {
  const random = tkRandom(seed);
  const tops = [];
  let at = 0;
  const heights = Array.from({ length: courses }, () => 1 + (random() * 2 - 1) * uneven);
  const total = heights.reduce((sum, height) => sum + height, 0);
  for (const height of heights) tops.push((at += height / total));
  const cuts = tops.map(() => {
    const count = blocks[0] + Math.floor(random() * (blocks[1] - blocks[0] + 1));
    const shift = random();
    // Cuts jittered about even spacing, so no block is a sliver.
    return Array.from({ length: count }, (_, index) => (index + shift + (random() - 0.5) * 0.5) / count).map((cut) => cut % 1).sort((a, b) => a - b);
  });
  return (u, v, out) => {
    let course = 0;
    while (course < courses - 1 && v >= tops[course]) course += 1;
    const low = course ? tops[course - 1] : 0;
    const list = cuts[course];
    let index = list.length - 1;
    for (let k = 0; k < list.length; k += 1) {
      if (u < list[k]) {
        index = k - 1;
        break;
      }
    }
    const from = index < 0 ? list[list.length - 1] - 1 : list[index];
    const to = index + 1 < list.length ? list[index + 1] : list[0] + 1;
    out.id = course * 37 + ((index + list.length) % list.length);
    out.edge = Math.min(u - from, to - u, v - low, tops[course] - v);
    out.along = (u - from) / (to - from);
    out.up = (v - low) / (tops[course] - low);
    return out;
  };
}

/** A sheet's painter: (u, v, pixel) fills pixel.h (0..1), pixel.c ([r, g, b]), pixel.r (roughness) and pixel.j (0 on a face, 1 deep in a joint); `pixel.a` (alpha) where the sheet is cut out. */
const TKX_PAINTERS = {
  brick(spec) {
    const { courses, perCourse, metres } = spec;
    const jointV = (spec.joint / metres) * courses;
    const jointU = (spec.joint / metres) * perCourse;
    return (u, v, pixel) => {
      const row = Math.floor(v * courses);
      const fv = v * courses - row;
      const bu = u * perCourse + (row % 2 ? 0.5 : 0) + tkHash(row, 3, 5) * 0.08;
      const column = ((Math.floor(bu) % perCourse) + perCourse) % perCourse;
      const fu = bu - Math.floor(bu);
      // How far into the brick from the joint's middle, as a share of the joint's width: 0 in the joint, 1 well on the face.
      const inV = Math.min(fv, 1 - fv) / jointV;
      const inU = Math.min(fu, 1 - fu) / jointU;
      const face = tkSmooth(0.45, 1.1, Math.min(inV, inU));
      const tone = tkHash(column, row, 11);
      const grain = tkFbm(u, v, 48, 3, 7);
      const blotch = tkFbm(u, v, 5, 3, 9);
      // A brick's face: its own shade (a few fired darker, a few paler), pitted; the joint lime, greyed with dirt.
      const shade = 0.82 + tone * 0.3 - (tone > 0.9 ? 0.2 : 0) + (grain - 0.5) * 0.22 - (blotch > 0.62 ? 0.12 : 0);
      const warm = tkHash(column, row, 23) > 0.86 ? 0.05 : 0;
      for (let k = 0; k < 3; k += 1) pixel.c[k] = face * spec.face[k] * shade + (1 - face) * spec.mortar[k] * (0.75 + grain * 0.4) + (k === 0 ? warm : k === 2 ? -warm : 0) * face;
      pixel.h = face * (0.72 + tone * 0.2 + (grain - 0.5) * 0.25) + (1 - face) * 0.25;
      pixel.r = 0.8 + (1 - face) * 0.15 + (grain - 0.5) * 0.1;
      pixel.j = 1 - face;
    };
  },

  /** Ashlar, a fortress wall's rubble courses and flagstones: one painter, by the spec's figures. */
  stone(spec, seed, uneven) {
    const lookup = tkxCourses(spec.courses, spec.blocks, seed, uneven);
    const block = { id: 0, edge: 0, along: 0, up: 0 };
    const joint = spec.joint / spec.metres;
    const round = spec.round / spec.metres;
    return (u, v, pixel) => {
      // (Rough work: the joints wander.)
      const wobble = uneven ? (tkFbm(u, v, 9, 2, seed + 3) - 0.5) * uneven * 0.05 : 0;
      lookup((u + wobble + 1) % 1, Math.min(0.9999, Math.max(0, v + wobble * 0.6)), block);
      const face = tkSmooth(joint * 0.4, joint * 0.5 + round, block.edge);
      const tone = tkHash(block.id, 7, seed);
      const tilt = (tkHash(block.id, 9, seed) - 0.5) * (block.along - 0.5) + (tkHash(block.id, 13, seed) - 0.5) * (block.up - 0.5);
      const grain = tkFbm(u, v, 40, 4, seed + 1);
      const mottle = tkFbm(u, v, 7, 3, seed + 2);
      const pits = Math.max(0, tkFbm(u, v, 90, 2, seed + 5) - 0.62) * 2.6 * spec.pit;
      const vary = spec.vary ?? 0.26;
      const shade = 0.97 - vary / 2 + tone * vary + (grain - 0.5) * 0.2 + (mottle - 0.5) * 0.22 - pits * 0.5;
      // Granite's own slight colour: some blocks warmer, some greyer; lichen where the mottle is high on rough work.
      const warm = (tkHash(block.id, 17, seed) - 0.5) * (spec.warm ?? 0.05);
      const lichen = uneven ? tkSmooth(0.66, 0.8, mottle) * 0.35 : 0;
      for (let k = 0; k < 3; k += 1) {
        const stone = spec.face[k] * shade + (k === 0 ? warm : k === 2 ? -warm : 0);
        const grown = stone * (1 - lichen) + [0.62, 0.62, 0.5][k] * lichen;
        pixel.c[k] = face * grown + (1 - face) * spec.mortar[k] * (0.7 + grain * 0.5);
      }
      pixel.h = face * (0.62 + tone * 0.16 + tilt * 0.3 + (grain - 0.5) * 0.12 * (1 + uneven * 4) - pits * 0.3) + (1 - face) * 0.08;
      pixel.r = 0.62 + (1 - face) * 0.3 + (grain - 0.5) * 0.16 + pits;
      pixel.j = 1 - face;
    };
  },

  cobble(spec, seed) {
    const n = spec.stones;
    return (u, v, pixel) => {
      // The nearest and second nearest of the jittered stones round (u, v): a stone's dome falls to the joint between them.
      const gx = u * n;
      const gy = v * n;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      let first = 9;
      let second = 9;
      let id = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const cx = ((ix + dx) % n + n) % n;
          const cy = ((iy + dy) % n + n) % n;
          const px = ix + dx + 0.5 + (tkHash(cx, cy, seed) - 0.5) * 0.8;
          const py = iy + dy + 0.5 + (tkHash(cx, cy, seed + 1) - 0.5) * 0.8;
          // (Stones a little longer than wide, lying every way.)
          const stretch = 0.8 + tkHash(cx, cy, seed + 2) * 0.5;
          const d = Math.hypot((gx - px) * stretch, (gy - py) / stretch);
          if (d < first) {
            second = first;
            first = d;
            id = cx * 31 + cy;
          } else if (d < second) second = d;
        }
      }
      const gap = second - first;
      const face = tkSmooth(0.02, 0.16, gap);
      const dome = face * (0.55 + 0.4 * Math.sqrt(Math.max(0, 1 - first * first * 2.4)));
      const tone = tkHash(id, 5, seed);
      const grain = tkFbm(u, v, 60, 3, seed + 4);
      const shade = 0.88 + tone * 0.2 + (grain - 0.5) * 0.2;
      const warm = (tkHash(id, 9, seed) - 0.5) * 0.03;
      for (let k = 0; k < 3; k += 1) pixel.c[k] = face * (spec.face[k] * shade + (k === 0 ? warm : k === 2 ? -warm : 0)) + (1 - face) * spec.mortar[k] * (0.7 + grain * 0.6);
      pixel.h = dome + (1 - face) * 0.1 * grain;
      pixel.r = 0.6 + (1 - face) * 0.32 + (grain - 0.5) * 0.14;
      pixel.j = 1 - face;
    };
  },

  plaster(spec, seed) {
    return (u, v, pixel) => {
      const broad = tkFbm(u, v, 4, 4, seed);
      const fine = tkFbm(u, v, 70, 3, seed + 1);
      // Hairline cracks: where a ridged noise crosses its middle, and only in the patches another noise allows (a wall is
      // not crazed all over).
      const crack = (1 - tkSmooth(0, 0.004, Math.abs(tkFbm(u, v, 7, 3, seed + 2) - 0.5))) * tkSmooth(0.56, 0.68, tkFbm(u, v, 3, 2, seed + 6));
      // Grey bloom and black mould in blotches, and a trowelled unevenness.
      const stain = tkSmooth(0.5, 0.78, broad) * 0.55 + tkSmooth(0.6, 0.75, tkFbm(u, v, 11, 3, seed + 3)) * 0.25;
      const shade = 0.95 + (fine - 0.5) * 0.1 - crack * 0.22;
      for (let k = 0; k < 3; k += 1) pixel.c[k] = (spec.face[k] * (1 - stain) + spec.stain[k] * stain) * shade;
      pixel.h = 0.5 + (broad - 0.5) * 0.5 + (fine - 0.5) * 0.3 - crack * 0.3;
      pixel.r = 0.86 + (fine - 0.5) * 0.1;
      pixel.j = crack;
    };
  },

  timber(spec, seed) {
    const boards = spec.boards;
    return (u, v, pixel) => {
      const board = Math.floor(v * boards);
      const fv = v * boards - board;
      const gap = 1 - tkSmooth(0.0, 0.035, Math.min(fv, 1 - fv));
      // Grain: long streaks along u, each board's its own; a knot here and there bends them.
      const shift = tkHash(board, 3, seed) * 31;
      const grain = tkFbm((u + shift) % 1, v, 6, 2, seed + board) * 0.6 + tkNoise(u * 8 + shift, v * 160, 160, seed + 7) * 0.4;
      const rings = 0.5 + 0.5 * Math.sin((grain * 9 + fv * 2.2) * Math.PI * 2);
      const check = tkSmooth(0.74, 0.8, tkNoise(u * 5 + shift, v * 220, 220, seed + 9));
      const tone = 0.86 + tkHash(board, 5, seed) * 0.2;
      const shade = tone * (0.8 + rings * 0.2) - check * 0.3 - gap * 0.6;
      for (let k = 0; k < 3; k += 1) pixel.c[k] = spec.face[k] * shade;
      pixel.h = 0.6 + (rings - 0.5) * 0.18 - check * 0.4 - gap * 0.6;
      pixel.r = 0.7 + (rings - 0.5) * 0.12 + gap * 0.2;
      pixel.j = Math.max(gap, check);
    };
  },

  rooftile(spec, seed) {
    const { rolls, laps } = spec;
    return (u, v, pixel) => {
      const fu = u * rolls - Math.floor(u * rolls);
      const row = Math.floor(v * laps);
      const fv = v * laps - row;
      const column = Math.floor(u * rolls);
      // Across a row: the cover tile's half-round over the middle (0.28..0.72 of the pitch), the pan's shallow trough either side.
      const across = Math.abs(fu - 0.5) * 2;
      const roll = across < 0.44 ? Math.sqrt(1 - (across / 0.44) ** 2) : 0;
      const pan = across >= 0.44 ? 0.16 * ((across - 0.44) / 0.56) ** 2 : 0;
      // Down the slope each tile laps the one below: v runs up the slope, so a tile's thick lower edge is at its fv = 0.
      const lap = 1 - fv;
      const lip = 1 - tkSmooth(0, 0.06, fv);
      const tone = tkHash(column * 2 + (roll > 0 ? 1 : 0), row, seed);
      const grain = tkFbm(u, v, 50, 3, seed + 1);
      const grown = tkSmooth(0.55, 0.75, tkFbm(u, v, 6, 3, seed + 2)) * (roll > 0 ? 0.25 : 0.6);
      const shade = 0.8 + tone * 0.32 + (grain - 0.5) * 0.25 - lip * 0.35 - (roll > 0 ? 0 : 0.12);
      for (let k = 0; k < 3; k += 1) pixel.c[k] = (spec.face[k] * (1 - grown) + spec.moss[k] * grown) * shade;
      pixel.h = (roll > 0 ? 0.45 + roll * 0.45 : 0.16 + pan) + lap * 0.1;
      pixel.r = 0.74 + (grain - 0.5) * 0.14 + grown * 0.12;
      pixel.j = lip;
    };
  },

  earth(spec, seed) {
    return (u, v, pixel) => {
      const broad = tkFbm(u, v, 5, 4, seed);
      const fine = tkFbm(u, v, 64, 3, seed + 1);
      const grit = tkSmooth(0.7, 0.78, tkFbm(u, v, 120, 2, seed + 2));
      // Dead grass: fine streaks lying mostly one way, in patches.
      const blade = tkSmooth(0.55, 0.7, tkNoise(u * 40, v * 400, 400, seed + 3)) * tkSmooth(0.42, 0.6, tkFbm(u, v, 6, 3, seed + 4));
      const shade = 0.8 + (broad - 0.5) * 0.4 + (fine - 0.5) * 0.3;
      for (let k = 0; k < 3; k += 1) pixel.c[k] = (spec.face[k] * (1 - blade) + spec.grass[k] * blade) * shade + grit * 0.12;
      pixel.h = 0.4 + (broad - 0.5) * 0.4 + (fine - 0.5) * 0.3 + grit * 0.25 + blade * 0.1;
      pixel.r = 0.92;
      pixel.j = 0;
    };
  },

  rock(spec, seed) {
    return (u, v, pixel) => {
      // Bedding: the beds' lines run nearly along u, broken by joints across them; the faces between are pitted.
      const bed = tkFbm(u, v * 1.0, 3, 3, seed) * 0.2 + v;
      const beds = Math.abs(((bed * 9) % 1) - 0.5) * 2;
      const crack = 1 - tkSmooth(0, 0.1, beds) * tkSmooth(0, 0.03, Math.abs(tkFbm(u, v, 6, 3, seed + 2) - 0.5));
      const broad = tkFbm(u, v, 4, 5, seed + 3);
      const fine = tkFbm(u, v, 80, 3, seed + 4);
      const lichen = tkSmooth(0.62, 0.74, tkFbm(u, v, 9, 3, seed + 5)) * 0.4;
      const shade = 0.78 + (broad - 0.5) * 0.5 + (fine - 0.5) * 0.24 - crack * 0.4;
      for (let k = 0; k < 3; k += 1) pixel.c[k] = (spec.face[k] * (1 - lichen) + [0.6, 0.6, 0.5][k] * lichen) * shade;
      pixel.h = 0.5 + (broad - 0.5) * 0.7 + (fine - 0.5) * 0.12 - crack * 0.35;
      pixel.r = 0.86 + (fine - 0.5) * 0.12;
      pixel.j = crack;
    };
  },

  leaves(spec, seed) {
    const random = tkRandom(seed);
    // Where a spray's leaves stand: thick at the middle, none past `spray` of the half sheet (the square root of a
    // random number spreads points evenly over a disc; a power under that crowds them inward).
    const inSpray = () => {
      const radius = 0.5 * spec.spray * Math.pow(random(), 0.62);
      const turn = random() * Math.PI * 2;
      return [0.5 + Math.cos(turn) * radius, 0.5 + Math.sin(turn) * radius];
    };
    const twigs = spec.bundles ? Array.from({ length: spec.bundles }, () => ({ at: inSpray(), way: random() * Math.PI * 2, tone: 0.75 + 0.5 * random() })) : null;
    const leaves = Array.from({ length: spec.count }, () => {
      const long = spec.long * (0.7 + 0.6 * random());
      if (twigs) {
        // A needle of a fan: from its twig's end, within a third of a turn of the twig's own way.
        const twig = twigs[Math.floor(random() * twigs.length)];
        const angle = twig.way + (random() - 0.5) * 2.1;
        return { x: twig.at[0] + Math.cos(angle) * long * 0.9, y: twig.at[1] + Math.sin(angle) * long * 0.9, cos: Math.cos(angle), sin: Math.sin(angle), long, wide: spec.wide * (0.7 + 0.6 * random()), tone: twig.tone * (0.85 + 0.3 * random()) };
      }
      const angle = random() * Math.PI;
      const [x, y] = spec.spray ? inSpray() : [random(), random()];
      return { x, y, cos: Math.cos(angle), sin: Math.sin(angle), long, wide: spec.wide * (0.7 + 0.6 * random()), tone: 0.7 + 0.6 * random() };
    });
    return (u, v, pixel) => {
      // The leaf this point is deepest inside (leaves overlap; a tiling sheet wraps, a spray does not).
      let depth = 0;
      let tone = 1;
      for (const leaf of leaves) {
        let dx = u - leaf.x;
        let dy = v - leaf.y;
        if (!spec.spray) {
          dx -= Math.round(dx);
          dy -= Math.round(dy);
        }
        const along = (dx * leaf.cos + dy * leaf.sin) / leaf.long;
        const across = (dy * leaf.cos - dx * leaf.sin) / leaf.wide;
        const inside = 1 - along * along - across * across;
        if (inside > depth) {
          depth = inside;
          tone = leaf.tone;
        }
      }
      for (let k = 0; k < 3; k += 1) pixel.c[k] = spec.face[k] * tone * (0.7 + 0.3 * depth);
      pixel.h = depth;
      pixel.r = 0.6;
      pixel.j = 1 - depth;
      pixel.a = depth > 0 ? 1 : 0;
    };
  },

  blades(spec, seed) {
    const random = tkRandom(seed);
    const blades = Array.from({ length: spec.count }, () => {
      const lean = (random() * 2 - 1) * spec.fan;
      return { foot: 0.5 + (random() - 0.5) * 0.14, lean: lean * 0.45, bend: lean * 0.55 + (random() - 0.5) * 0.2, long: 0.35 + 0.62 * Math.pow(random(), 0.7), wide: spec.wide * (0.6 + 0.8 * random()), tone: 0.75 + 0.5 * random() };
    });
    return (u, v, pixel) => {
      let best = null;
      let edge = 1;
      for (const blade of blades) {
        const t = v / blade.long;
        if (t > 1) continue;
        const across = Math.abs(u - (blade.foot + blade.lean * t + blade.bend * t * t)) / (blade.wide * (1 - 0.88 * t));
        if (across < edge) {
          edge = across;
          best = blade;
        }
      }
      pixel.a = best ? 1 : 0;
      const t = best ? v / best.long : 0;
      for (let k = 0; k < 3; k += 1) pixel.c[k] = (spec.face[k] + (spec.tip[k] - spec.face[k]) * t) * (best?.tone ?? 1) * (0.55 + 0.45 * Math.min(1, v * 5));
      pixel.h = best ? 1 - edge : 0;
      pixel.r = 0.75;
      pixel.j = 0;
    };
  },
  lattice(spec) {
    const { bars, bar } = spec;
    return (u, v, pixel) => {
      const fu = u * bars - Math.floor(u * bars);
      const fv = v * bars - Math.floor(v * bars);
      const du = Math.abs(fu - 0.5) * 2;
      const dv = Math.abs(fv - 0.5) * 2;
      // A square grid of bars, each rounded across: the nearer bar's profile.
      const across = Math.min(du, dv) / bar;
      const solid = across < 1;
      const profile = solid ? Math.sqrt(1 - across * across) : 0;
      const grain = tkNoise(u * 6, v * 90, 90, 3);
      for (let k = 0; k < 3; k += 1) pixel.c[k] = spec.face[k] * (0.62 + profile * 0.38) * (0.9 + grain * 0.14);
      pixel.h = profile;
      pixel.r = 0.7;
      pixel.j = 1 - profile;
      pixel.a = solid ? 1 : 0;
    };
  },
};

/** Which painter, seed and unevenness each sheet takes. */
const TKX_SHEETS = {
  brick: ['brick', 3, 0], ashlar: ['stone', 11, 0], rubble: ['stone', 23, 0.55], flags: ['stone', 37, 0.12], cobble: ['cobble', 41, 0],
  plaster: ['plaster', 53, 0], timber: ['timber', 61, 0], rooftile: ['rooftile', 71, 0], earth: ['earth', 83, 0], rock: ['rock', 97, 0], lattice: ['lattice', 0, 0],
  foliage: ['leaves', 101, 0], needles: ['leaves', 103, 0], tuft: ['blades', 107, 0],
};

/**
 * Paint a sheet: `{ size, metres, colour, normal, surface }`, three RGBA byte arrays (row 0 at v = 0). `size`
 * overrides the spec's (the low detail tier paints half size). Plain data: no canvas, no three.js.
 */
export function tkxPaint(name, size = TK_TEX[name].size) {
  const spec = TK_TEX[name];
  const [kind, seed, uneven] = TKX_SHEETS[name];
  const paint = TKX_PAINTERS[kind](spec, seed, uneven);
  const count = size * size;
  const height = new Float32Array(count);
  const colour = new Uint8Array(count * 4);
  const surface = new Uint8Array(count * 4);
  const pixel = { h: 0, c: [0, 0, 0], r: 1, j: 0, a: 1 };
  const byte = (value) => Math.max(0, Math.min(255, Math.round(value * 255)));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const at = y * size + x;
      pixel.a = 1;
      paint((x + 0.5) / size, (y + 0.5) / size, pixel);
      const h = Math.max(0, Math.min(1, pixel.h));
      height[at] = h;
      colour.set([byte(pixel.c[0]), byte(pixel.c[1]), byte(pixel.c[2]), byte(pixel.a)], at * 4);
      surface.set([byte(h), byte(pixel.r), byte(pixel.j), 255], at * 4);
    }
  }
  // The normal map: the height's slope, in metres of relief over metres of sheet, by central differences that wrap.
  const normal = new Uint8Array(count * 4);
  const scale = (spec.relief * size) / (2 * spec.metres);
  for (let y = 0; y < size; y += 1) {
    const up = ((y + 1) % size) * size;
    const down = ((y + size - 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const dx = (height[y * size + ((x + 1) % size)] - height[y * size + ((x + size - 1) % size)]) * scale;
      const dy = (height[up + x] - height[down + x]) * scale;
      const length = Math.hypot(dx, dy, 1);
      normal.set([byte(0.5 - (0.5 * dx) / length), byte(0.5 - (0.5 * dy) / length), byte(0.5 + 0.5 / length), 255], (y * size + x) * 4);
    }
  }
  return { size, metres: spec.metres, colour, normal, surface };
}

/** A painted sheet's three arrays as textures that tile, with mipmaps: `{ map, normalMap, surfaceMap, metres }`. */
export function tkxTextures(name, { size, anisotropy = 8 } = {}) {
  const sheet = tkxPaint(name, size);
  const texture = (data) => {
    const made = new THREE.DataTexture(data, sheet.size, sheet.size, THREE.RGBAFormat);
    made.wrapS = THREE.RepeatWrapping;
    made.wrapT = THREE.RepeatWrapping;
    made.magFilter = THREE.LinearFilter;
    made.minFilter = THREE.LinearMipmapLinearFilter;
    made.generateMipmaps = true;
    made.anisotropy = anisotropy;
    made.needsUpdate = true;
    return made;
  };
  return { map: texture(sheet.colour), normalMap: texture(sheet.normal), surfaceMap: texture(sheet.surface), metres: sheet.metres };
}
