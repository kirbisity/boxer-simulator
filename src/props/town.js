// The market town's buildings and things (buildTown in render.js): a
// late-medieval square closed in on every side by jettied half-timbered
// houses, its streets turning out of sight, plainer houses and the church
// tower and spire over the roofs, and a little market: two stalls, barrels,
// the well and the market cross.
//
// Real geometry where the silhouette shows it (jetties, timbers proud of the
// infill, recessed windows, roofs with thickness, eaves and verges, chimneys
// and dormers), and the age in the surface: generated textures (lime render
// patched, spalled and rain-streaked; silvered, checked oak; clay tiles with
// moss and new replacements; slates; ashlar; brick; planks with the paint
// flaking) with their relief baked into the colour, and vertex colour (grime
// up from the street, stains under the sills and soot over the openings,
// soot round the stacks, roofs sagging between their gables, houses a
// little out of true). It is drawn cheaply: one atlas texture and one matte
// material for nearly everything, one for glass and one for iron and
// gilding, and the sun's shadows cast by plain blocks inside the front
// houses rather than by all their pieces.

/* global THREE */

// ---- small helpers ------------------------------------------------------------------

/** A seeded generator (mulberry32). */
function townRandom(seed) {
  let state = (seed * 2654435761) >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const townClamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
const townSmooth = (a, b, x) => {
  const t = townClamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const townGrey = (value, alpha = 1) => {
  const g = Math.round(townClamp(value) * 255);
  return `rgba(${g},${g},${g},${alpha})`;
};
const townRgb = (rgb, alpha = 1) => `rgba(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])},${alpha})`;

const TOWN_ONE = [1, 1, 1];
const TOWN_ZERO = [0, 0, 0];

// ---- painting the textures -------------------------------------------------------
//
// A sheet is two square canvases painted together: the colour and a height
// field (grey, 0.5 = the surface). `townFinish` bakes the height into the
// colour as light and shade (the sheets tile, and so does the relief).

function townSheet(size, base, seed) {
  const make = (fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = fill;
    context.fillRect(0, 0, size, size);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    return context;
  };
  const random = townRandom(seed);
  return { size, colour: make(base), height: make(townGrey(0.5)), random, rr: (a, b) => a + (b - a) * random() };
}

/** Call `draw(x, y)` at (x, y) and at each copy the wrap shows, so a stamp near an edge tiles. */
function townWrap(size, x, y, reach, draw) {
  for (const ox of [-size, 0, size]) {
    if (x + ox + reach < 0 || x + ox - reach > size) continue;
    for (const oy of [-size, 0, size]) {
      if (y + oy + reach < 0 || y + oy - reach > size) continue;
      draw(x + ox, y + oy);
    }
  }
}

/** Tileable value noise: a (cells+1)² grey image, its last row and column the first again, drawn up so that it repeats exactly across the sheet. */
function townCloud(context, size, random, cells, alpha, mode = 'source-over') {
  const small = document.createElement('canvas');
  small.width = cells + 1;
  small.height = cells + 1;
  const g = small.getContext('2d');
  const image = g.createImageData(cells + 1, cells + 1);
  const values = Array.from({ length: cells * cells }, () => random() * 255);
  for (let y = 0; y <= cells; y += 1) {
    for (let x = 0; x <= cells; x += 1) {
      const value = values[(y % cells) * cells + (x % cells)];
      const at = (y * (cells + 1) + x) * 4;
      image.data[at] = image.data[at + 1] = image.data[at + 2] = value;
      image.data[at + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  const step = size / cells;
  context.save();
  context.globalAlpha = alpha;
  context.globalCompositeOperation = mode;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(small, -step / 2, -step / 2, step * (cells + 1), step * (cells + 1));
  context.restore();
}

/** A wavy line right across the sheet at `y` (it tiles: the wave has whole periods), on the colour and/or the height. */
function townGrainLine(sheet, y, amplitude, periods, phase, width, fill, height) {
  const { size } = sheet;
  for (const [context, style] of [[sheet.colour, fill], [sheet.height, height]]) {
    if (!style) continue;
    context.strokeStyle = style;
    context.lineWidth = width;
    for (const oy of [-size, 0, size]) {
      context.beginPath();
      for (let x = 0; x <= size; x += 4) {
        const yy = y + oy + amplitude * Math.sin((x / size) * Math.PI * 2 * periods + phase) + amplitude * 0.4 * Math.sin((x / size) * Math.PI * 2 * (periods * 3 + 1) + phase * 2);
        if (x === 0) context.moveTo(x, yy);
        else context.lineTo(x, yy);
      }
      context.stroke();
    }
  }
}

/**
 * Bake the height field's relief into the colour, lit from above and a
 * little to the left (no normal map: the texture carries its own shading),
 * and return the colour canvas. `relief` is how steep the height reads.
 */
function townFinish(sheet, relief) {
  const { size } = sheet;
  const raw = sheet.height.getImageData(0, 0, size, size).data;
  const height = new Float32Array(size * size);
  for (let index = 0; index < height.length; index += 1) height[index] = raw[index * 4] / 255;
  const image = sheet.colour.getImageData(0, 0, size, size);
  const data = image.data;
  // The light in the texture's own frame: x right, y up the canvas, z out of it.
  const L = [-0.35, 0.6, 0.72];
  const ll = Math.hypot(...L);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const at = (dx, dy) => height[((y + dy + size) % size) * size + ((x + dx + size) % size)];
      const dx = (at(1, 0) + at(1, 1) + at(1, -1) - at(-1, 0) - at(-1, 1) - at(-1, -1)) / 3;
      const dy = (at(0, 1) + at(1, 1) + at(-1, 1) - at(0, -1) - at(1, -1) - at(-1, -1)) / 3;
      const nx = -dx * relief;
      const ny = dy * relief;
      const length = Math.hypot(nx, ny, 1);
      const lit = (nx * L[0] + ny * L[1] + L[2]) / length / ll;
      const shade = townClamp(lit / (L[2] / ll), 0.55, 1.3);
      const index = (y * size + x) * 4;
      data[index] = Math.min(255, data[index] * shade);
      data[index + 1] = Math.min(255, data[index + 1] * shade);
      data[index + 2] = Math.min(255, data[index + 2] * shade);
    }
  }
  sheet.colour.putImageData(image, 0, 0);
  return sheet.colour.canvas;
}

/** Rows of overlapping tiles or slates, the canvas top up the roof: each course's tails lie on the course below. */
function townPaintCourses(sheet, { courses, across, round, tone, jitter = 0, lichen = 0 }) {
  const { size, colour, height, random, rr } = sheet;
  const gauge = size / courses;
  const width = size / across;
  const drawRow = (row, shift) => {
    const top = row * gauge + shift;
    const offset = (row % 2) * width * 0.5;
    let x = offset;
    const widths = [];
    for (let k = 0; k < across; k += 1) widths.push(width * (1 + (random() - 0.5) * jitter));
    const total = widths.reduce((sum, value) => sum + value, 0);
    for (const raw of widths) {
      const w = raw * size / total;
      const tail = top + gauge * rr(1.05, 1.18);
      const rgb = tone(random);
      townWrap(size, x + w / 2, top + gauge / 2, w + gauge, (cx) => {
        const left = cx - w / 2 + 1.2;
        const right = cx + w / 2 - 1.2;
        const r = Math.min((right - left) / 2, gauge) * round;
        const path = (context, down = 0) => {
          context.beginPath();
          context.moveTo(left, top - gauge * 0.6);
          context.lineTo(right, top - gauge * 0.6);
          context.lineTo(right, tail - r + down);
          if (r > 0.5) context.ellipse((left + right) / 2, tail - r + down, (right - left) / 2, r, 0, 0, Math.PI);
          else context.lineTo(left, tail + down);
          context.closePath();
        };
        // The shadow the tail throws on the course below.
        colour.fillStyle = 'rgba(20,14,10,0.45)';
        path(colour, 2.5);
        colour.fill();
        colour.fillStyle = townRgb(rgb);
        path(colour);
        colour.fill();
        // Each tile darker toward its tail where the rain runs, lichen on some.
        const shade = colour.createLinearGradient(0, top, 0, tail);
        shade.addColorStop(0, 'rgba(255,240,220,0.08)');
        shade.addColorStop(1, 'rgba(30,20,10,0.22)');
        colour.fillStyle = shade;
        path(colour);
        colour.fill();
        const slope = height.createLinearGradient(0, top - gauge * 0.6, 0, tail);
        slope.addColorStop(0, townGrey(0.25));
        slope.addColorStop(1, townGrey(0.78));
        height.fillStyle = 'rgba(0,0,0,0.6)';
        path(height, 2.5);
        height.fill();
        height.fillStyle = slope;
        path(height);
        height.fill();
      });
      if (random() < lichen) {
        for (let spot = 0; spot < 3; spot += 1) {
          const sx = x + rr(0, w);
          const sy = top + rr(0.2, 0.9) * gauge;
          townWrap(size, sx, sy, 8, (X, Y) => {
            colour.fillStyle = random() < 0.5 ? 'rgba(196,190,130,0.55)' : 'rgba(90,100,60,0.5)';
            colour.beginPath();
            colour.arc(X, Y, rr(1.5, 4.5), 0, Math.PI * 2);
            colour.fill();
          });
        }
      }
      x += w;
    }
  };
  for (let row = courses - 1; row >= 0; row -= 1) drawRow(row, 0);
  // The bottom course again, a whole sheet up: its tails lie on the top course of the next repeat.
  drawRow(courses - 1, -size);
}

const TOWN_PAINTERS = {
  /** Lime render: off-white (the vertex colour gives each house its wash), trowelled, flecked, a few hairline cracks. */
  plaster: () => {
    const sheet = townSheet(512, '#ece6da', 11);
    const { size, colour, height, random, rr } = sheet;
    townCloud(colour, size, random, 4, 0.22, 'overlay');
    townCloud(colour, size, random, 16, 0.16, 'overlay');
    townCloud(colour, size, random, 64, 0.1, 'overlay');
    townCloud(height, size, random, 8, 0.5);
    townCloud(height, size, random, 48, 0.15);
    for (let index = 0; index < 220; index += 1) {
      const x = rr(0, size);
      const y = rr(0, size);
      const rx = rr(10, 40);
      const ry = rx * rr(0.3, 0.7);
      const turn = rr(0, Math.PI);
      const light = random() < 0.5;
      townWrap(size, x, y, rx, (X, Y) => {
        colour.fillStyle = light ? 'rgba(255,255,250,0.05)' : 'rgba(110,95,70,0.04)';
        colour.beginPath();
        colour.ellipse(X, Y, rx, ry, turn, 0, Math.PI * 2);
        colour.fill();
        height.fillStyle = townGrey(light ? 0.62 : 0.4, 0.18);
        height.beginPath();
        height.ellipse(X, Y, rx, ry, turn, 0, Math.PI * 2);
        height.fill();
      });
    }
    for (let index = 0; index < 1800; index += 1) {
      const x = rr(0, size);
      const y = rr(0, size);
      const r = rr(0.6, 1.6);
      colour.fillStyle = `rgba(${90 + rr(0, 60)},${80 + rr(0, 50)},${60 + rr(0, 40)},${rr(0.15, 0.4)})`;
      colour.fillRect(x, y, r, r);
      height.fillStyle = townGrey(rr(0.35, 0.6), 0.4);
      height.fillRect(x, y, r * 1.4, r * 1.4);
    }
    for (let crack = 0; crack < 7; crack += 1) {
      let x = rr(0, size);
      let y = rr(0, size);
      let angle = rr(0, Math.PI * 2);
      const points = [[x, y]];
      for (let step = 0; step < 14; step += 1) {
        angle += rr(-0.6, 0.6);
        x += Math.cos(angle) * 6;
        y += Math.sin(angle) * 6;
        points.push([x, y]);
      }
      for (const [context, style, width] of [[colour, 'rgba(90,78,60,0.35)', 1], [height, townGrey(0.2, 0.8), 1.6]]) {
        context.strokeStyle = style;
        context.lineWidth = width;
        context.beginPath();
        points.forEach(([px, py], k) => (k ? context.lineTo(px, py) : context.moveTo(px, py)));
        context.stroke();
      }
    }
    // Old repairs: patches of newer render, a shade off the wash, their edges hard.
    for (let patch = 0; patch < 6; patch += 1) {
      const x = rr(0, size);
      const y = rr(0, size);
      const points = [];
      const reach = rr(26, 70);
      for (let k = 0; k < 9; k += 1) {
        const angle = (k / 9) * Math.PI * 2;
        const r = reach * rr(0.6, 1.1);
        points.push([Math.cos(angle) * r, Math.sin(angle) * r * rr(0.6, 0.9)]);
      }
      const light = random() < 0.6;
      townWrap(size, x, y, reach * 1.2, (X, Y) => {
        for (const [context, style] of [[colour, light ? 'rgba(252,248,238,0.5)' : 'rgba(150,132,104,0.35)'], [height, townGrey(light ? 0.6 : 0.45, 0.6)]]) {
          context.fillStyle = style;
          context.beginPath();
          points.forEach(([px, py], k) => (k ? context.lineTo(X + px, Y + py) : context.moveTo(X + px, Y + py)));
          context.closePath();
          context.fill();
        }
        colour.strokeStyle = 'rgba(80,68,50,0.25)';
        colour.lineWidth = 1.2;
        colour.stroke();
      });
    }
    // Spalls: the render fallen away, the daub and laths behind, a dark lip round them.
    for (let spall = 0; spall < 1; spall += 1) {
      const x = rr(0, size);
      const y = rr(0, size);
      const rx = rr(22, 44);
      const ry = rx * rr(0.5, 0.8);
      townWrap(size, x, y, rx + 4, (X, Y) => {
        colour.fillStyle = 'rgba(90,80,66,0.4)';
        colour.beginPath();
        colour.ellipse(X, Y, rx + 2.5, ry + 2.5, 0, 0, Math.PI * 2);
        colour.fill();
        colour.fillStyle = 'rgb(170,152,126)';
        colour.beginPath();
        colour.ellipse(X, Y, rx, ry, 0, 0, Math.PI * 2);
        colour.fill();
        colour.strokeStyle = 'rgba(110,92,70,0.6)';
        colour.lineWidth = 2;
        for (let lath = Y - ry; lath < Y + ry; lath += 6) {
          const half = rx * Math.sqrt(Math.max(0, 1 - ((lath - Y) / ry) ** 2));
          colour.beginPath();
          colour.moveTo(X - half, lath);
          colour.lineTo(X + half, lath);
          colour.stroke();
        }
        height.fillStyle = townGrey(0.2);
        height.beginPath();
        height.ellipse(X, Y, rx, ry, 0, 0, Math.PI * 2);
        height.fill();
      });
    }
    // Rain runs: faint streaks down from wherever water sheds.
    for (let streak = 0; streak < 26; streak += 1) {
      const x = rr(0, size);
      const y = rr(0, size);
      const length = rr(40, 180);
      const width = rr(3, 12);
      townWrap(size, x, y + length / 2, length, (X, Y) => {
        const run = colour.createLinearGradient(0, Y - length / 2, 0, Y + length / 2);
        run.addColorStop(0, `rgba(86,78,62,${rr(0.12, 0.3)})`);
        run.addColorStop(1, 'rgba(90,82,66,0)');
        colour.fillStyle = run;
        colour.fillRect(X - width / 2, Y - length / 2, width, length);
      });
    }
    return townFinish(sheet, 1.4);
  },
  /** Oak, grain along u: a light grey-brown the vertex colour darkens to each house's timber (oiled, tarred, ox-blood, silvered); checks, knots. */
  oak: () => {
    const sheet = townSheet(512, '#a5917a', 23);
    const { size, colour, height, random, rr } = sheet;
    townCloud(colour, size, random, 6, 0.25, 'overlay');
    for (let line = 0; line < 170; line += 1) {
      const dark = random() < 0.7;
      townGrainLine(sheet, rr(0, size), rr(1, 7), 1 + Math.floor(rr(0, 3)), rr(0, 6.28), rr(0.6, 2.6), dark ? `rgba(60,42,28,${rr(0.1, 0.35)})` : `rgba(220,200,170,${rr(0.05, 0.15)})`, townGrey(dark ? 0.42 : 0.56, 0.5));
    }
    for (let check = 0; check < 14; check += 1) {
      const x = rr(0, size);
      const y = rr(0, size);
      const length = rr(60, 260);
      const tilt = rr(-0.03, 0.03);
      townWrap(size, x + length / 2, y, length, (X, Y) => {
        for (const [context, style, width] of [[colour, 'rgba(25,16,10,0.6)', 1.6], [height, townGrey(0.08), 2.6]]) {
          context.strokeStyle = style;
          context.lineWidth = width;
          context.beginPath();
          context.moveTo(X - length / 2, Y);
          context.quadraticCurveTo(X, Y + length * tilt * 3, X + length / 2, Y + length * tilt);
          context.stroke();
        }
      });
    }
    for (let knot = 0; knot < 4; knot += 1) {
      const x = rr(0, size);
      const y = rr(0, size);
      townWrap(size, x, y, 16, (X, Y) => {
        for (let ring = 3; ring >= 0; ring -= 1) {
          colour.fillStyle = `rgba(${50 + ring * 15},${35 + ring * 10},${22 + ring * 8},0.5)`;
          colour.beginPath();
          colour.ellipse(X, Y, 5 + ring * 3.5, 3 + ring * 1.8, 0, 0, Math.PI * 2);
          colour.fill();
        }
        height.fillStyle = townGrey(0.35, 0.7);
        height.beginPath();
        height.ellipse(X, Y, 6, 4, 0, 0, Math.PI * 2);
        height.fill();
      });
    }
    // Weathered silver-grey where the sun and rain have had it.
    townCloud(colour, size, random, 5, 0.18, 'screen');
    return townFinish(sheet, 4);
  },
  /** Clay plain tiles (beaver tails), six courses to the metre and a half, each its own fired colour, lichen. */
  tiles: () => {
    const sheet = townSheet(512, '#5a3324', 37);
    townPaintCourses(sheet, {
      courses: 7,
      across: 6,
      round: 0.55,
      lichen: 0.25,
      tone: (random) => {
        // One in twelve a newer replacement, still bright from the kiln.
        if (random() < 0.08) return [196 + random() * 30, 92 + random() * 20, 56 + random() * 12];
        const k = random();
        const burn = 0.68 + random() * 0.36;
        return [(170 + k * 40) * burn, (84 + k * 28 + random() * 18) * burn, (58 + k * 18) * burn];
      },
    });
    const { size, colour, random, rr } = sheet;
    townCloud(colour, size, random, 4, 0.3, 'overlay');
    // Moss in cushions where the courses overlap, and a grey bloom of lichen.
    for (let clump = 0; clump < 40; clump += 1) {
      const x = rr(0, size);
      const y = rr(0, size);
      const r = rr(4, 14);
      townWrap(size, x, y, r * 2, (X, Y) => {
        colour.fillStyle = random() < 0.65 ? `rgba(${rr(70, 100)},${rr(92, 120)},${rr(40, 56)},0.7)` : 'rgba(190,186,160,0.5)';
        colour.beginPath();
        colour.ellipse(X, Y, r * 1.6, r * 0.7, 0, 0, Math.PI * 2);
        colour.fill();
      });
    }
    townCloud(colour, size, random, 8, 0.25, 'multiply');
    return townFinish(sheet, 5);
  },
  /** Slates: dark blue-grey, random widths, square tails. */
  slate: () => {
    const sheet = townSheet(512, '#22252a', 41);
    townPaintCourses(sheet, {
      courses: 9,
      across: 6,
      round: 0,
      jitter: 0.6,
      lichen: 0.08,
      tone: (random) => {
        const k = 70 + random() * 38;
        return [k * 0.92, k * 0.97, k * 1.06];
      },
    });
    townCloud(sheet.colour, sheet.size, sheet.random, 8, 0.2, 'overlay');
    return townFinish(sheet, 4);
  },
  /** The spire's fish-scale slates. */
  scales: () => {
    const sheet = townSheet(512, '#1e2126', 43);
    townPaintCourses(sheet, {
      courses: 10,
      across: 8,
      round: 1,
      lichen: 0.04,
      tone: (random) => {
        const k = 72 + random() * 34;
        return [k * 0.9, k * 0.97, k * 1.08];
      },
    });
    townCloud(sheet.colour, sheet.size, sheet.random, 6, 0.25, 'overlay');
    return townFinish(sheet, 4);
  },
  /** Coursed ashlar: limestone blocks of varying length, recessed mortar joints, tooled faces. */
  ashlar: () => {
    const sheet = townSheet(512, '#8f8a80', 53);
    const { size, colour, height, random, rr } = sheet;
    const courses = 6;
    const course = size / courses;
    for (let row = 0; row < courses; row += 1) {
      const top = row * course;
      let x = rr(0, size);
      const end = x + size;
      while (x < end - 4) {
        let length = course * rr(1.3, 2.8);
        if (end - x - length < course * 1.1) length = end - x;
        const tone = rr(0.85, 1.12);
        const hue = rr(-6, 6);
        const rgb = [196 * tone + hue, 188 * tone + hue * 0.5, 170 * tone - hue * 0.3];
        townWrap(size, x + length / 2, top + course / 2, length, (cx, cy) => {
          const left = cx - length / 2 + 2.5;
          const top2 = cy - course / 2 + 2.5;
          colour.fillStyle = townRgb(rgb);
          colour.fillRect(left, top2, length - 5, course - 5);
          // Arrises a little rounded and darker; the face slightly proud in the middle.
          colour.strokeStyle = 'rgba(70,64,55,0.25)';
          colour.lineWidth = 2;
          colour.strokeRect(left + 1, top2 + 1, length - 7, course - 7);
          const face = height.createLinearGradient(0, top2, 0, top2 + course - 5);
          face.addColorStop(0, townGrey(0.62));
          face.addColorStop(0.5, townGrey(0.7));
          face.addColorStop(1, townGrey(0.6));
          height.fillStyle = face;
          height.fillRect(left, top2, length - 5, course - 5);
        });
        x += length;
      }
    }
    for (let index = 0; index < 4000; index += 1) {
      const x = rr(0, size);
      const y = rr(0, size);
      colour.fillStyle = random() < 0.5 ? `rgba(60,55,48,${rr(0.05, 0.25)})` : `rgba(240,235,220,${rr(0.05, 0.2)})`;
      colour.fillRect(x, y, 1.5, 1.5);
      height.fillStyle = townGrey(rr(0.45, 0.75), 0.5);
      height.fillRect(x, y, 2, 2);
    }
    townCloud(colour, size, random, 6, 0.3, 'overlay');
    townCloud(colour, size, random, 24, 0.15, 'overlay');
    return townFinish(sheet, 5);
  },
  /** Hand-made brick in lime mortar, for the chimneys. */
  brick: () => {
    const sheet = townSheet(256, '#a39a8a', 59);
    const { size, colour, height, random, rr } = sheet;
    const courses = 10;
    const course = size / courses;
    const across = 4;
    const length = size / across;
    for (let row = 0; row < courses; row += 1) {
      for (let k = 0; k < across; k += 1) {
        const x = k * length + (row % 2) * length / 2;
        const rgb = [rr(120, 165), rr(55, 75), rr(40, 55)];
        townWrap(size, x + length / 2, row * course, length, (cx, cy) => {
          colour.fillStyle = townRgb(rgb);
          colour.fillRect(cx - length / 2 + 1.5, cy + 1.5, length - 3, course - 3);
          height.fillStyle = townGrey(0.66);
          height.fillRect(cx - length / 2 + 1.5, cy + 1.5, length - 3, course - 3);
        });
      }
    }
    townCloud(colour, size, random, 8, 0.25, 'overlay');
    return townFinish(sheet, 4);
  },
  /** Sawn boards, along u: seams, grain, nail heads; a light wood the vertex colour stains or paints. */
  planks: () => {
    const sheet = townSheet(512, '#b09a7e', 61);
    const { size, colour, height, random, rr } = sheet;
    const boards = 6;
    const board = size / boards;
    for (let k = 0; k < boards; k += 1) {
      colour.fillStyle = `rgba(${rr(150, 200)},${rr(125, 165)},${rr(95, 125)},0.9)`;
      colour.fillRect(0, k * board, size, board);
    }
    for (let line = 0; line < 160; line += 1) {
      townGrainLine(sheet, rr(0, size), rr(0.5, 4), 1 + Math.floor(rr(0, 2)), rr(0, 6.28), rr(0.6, 2), `rgba(70,50,32,${rr(0.08, 0.3)})`, townGrey(0.45, 0.4));
    }
    for (let k = 0; k < boards; k += 1) {
      const y = k * board;
      colour.fillStyle = 'rgba(30,20,12,0.85)';
      colour.fillRect(0, y - 1.5, size, 3);
      height.fillStyle = townGrey(0.1);
      height.fillRect(0, y - 2, size, 4);
      for (const x of [rr(20, 60), rr(280, 320)]) {
        for (const dy of [0.3, 0.7]) {
          colour.fillStyle = 'rgba(40,35,32,0.9)';
          colour.beginPath();
          colour.arc(x, y + board * dy, 2.4, 0, Math.PI * 2);
          colour.fill();
          height.fillStyle = townGrey(0.8);
          height.beginPath();
          height.arc(x, y + board * dy, 2.4, 0, Math.PI * 2);
          height.fill();
        }
      }
    }
    townCloud(colour, size, random, 6, 0.2, 'overlay');
    // Paint flaking off: ragged pale patches of bare, greyed wood, longest along the grain.
    for (let flake = 0; flake < 50; flake += 1) {
      const x = rr(0, size);
      const y = rr(0, size);
      const length = rr(6, 40);
      townWrap(size, x, y, length, (X, Y) => {
        colour.fillStyle = `rgba(${rr(215, 235)},${rr(208, 225)},${rr(195, 210)},${rr(0.35, 0.7)})`;
        colour.beginPath();
        colour.moveTo(X - length / 2, Y);
        for (let k = 1; k <= 6; k += 1) colour.lineTo(X - length / 2 + (k / 6) * length, Y - rr(1, 5));
        for (let k = 6; k >= 0; k -= 1) colour.lineTo(X - length / 2 + (k / 6) * length, Y + rr(1, 5));
        colour.closePath();
        colour.fill();
      });
    }
    return townFinish(sheet, 4);
  },
  /** Leaded lights: diamond quarries of green-tinged crown glass in lead cames. */
  glass: () => {
    const sheet = townSheet(256, '#1d2629', 67);
    const { size, colour, height, random, rr } = sheet;
    const step = size / 8;
    for (let a = 0; a <= 8; a += 1) {
      for (let b = 0; b <= 8; b += 1) {
        if ((a + b) % 2 === 0) continue;
        const k = rr(0.7, 1.25);
        const rgb = [42 * k, 56 * k, 56 * k];
        townWrap(size, a * step, b * step, step, (cx, cy) => {
          colour.fillStyle = townRgb(rgb);
          colour.beginPath();
          colour.moveTo(cx - step, cy);
          colour.lineTo(cx, cy - step);
          colour.lineTo(cx + step, cy);
          colour.lineTo(cx, cy + step);
          colour.closePath();
          colour.fill();
          // The ripple of old glass.
          colour.fillStyle = `rgba(200,220,215,${rr(0.03, 0.12)})`;
          colour.beginPath();
          colour.ellipse(cx + rr(-8, 8), cy + rr(-8, 8), rr(4, 12), rr(2, 5), rr(0, 3), 0, Math.PI * 2);
          colour.fill();
          const dome = height.createRadialGradient(cx, cy, 0, cx, cy, step);
          dome.addColorStop(0, townGrey(0.55));
          dome.addColorStop(1, townGrey(0.4));
          height.fillStyle = dome;
          height.beginPath();
          height.moveTo(cx - step, cy);
          height.lineTo(cx, cy - step);
          height.lineTo(cx + step, cy);
          height.lineTo(cx, cy + step);
          height.closePath();
          height.fill();
        });
      }
    }
    // The cames as two families of diagonals through the quarries' corners.
    for (const [context, style, width] of [[colour, '#3a3a3c', 3.2], [height, townGrey(0.95), 4]]) {
      context.strokeStyle = style;
      context.lineWidth = width;
      for (let k = -4; k <= 8; k += 1) {
        context.beginPath();
        context.moveTo(k * 2 * step, 0);
        context.lineTo(k * 2 * step + size, size);
        context.stroke();
        context.beginPath();
        context.moveTo(k * 2 * step, 0);
        context.lineTo(k * 2 * step - size, size);
        context.stroke();
      }
    }
    return townFinish(sheet, 6);
  },
  /** A barrel's sixteen staves round u, the grain up v, dark seams. */
  staves: () => {
    const sheet = townSheet(256, '#9a7a56', 71);
    const { size, colour, height, random, rr } = sheet;
    const staves = 16;
    const width = size / staves;
    for (let k = 0; k < staves; k += 1) {
      const tone = rr(0.74, 1.1);
      colour.fillStyle = `rgb(${150 * tone},${112 * tone},${76 * tone})`;
      colour.fillRect(k * width, 0, width, size);
      const bulge = height.createLinearGradient(k * width, 0, (k + 1) * width, 0);
      bulge.addColorStop(0, townGrey(0.35));
      bulge.addColorStop(0.5, townGrey(0.62));
      bulge.addColorStop(1, townGrey(0.35));
      height.fillStyle = bulge;
      height.fillRect(k * width, 0, width, size);
      for (let line = 0; line < 9; line += 1) {
        const x = k * width + rr(1, width - 1);
        colour.strokeStyle = `rgba(60,40,25,${rr(0.2, 0.5)})`;
        colour.lineWidth = rr(0.5, 1.4);
        colour.beginPath();
        colour.moveTo(x, 0);
        colour.bezierCurveTo(x + rr(-2, 2), size * 0.3, x + rr(-2, 2), size * 0.7, x, size);
        colour.stroke();
      }
      colour.fillStyle = 'rgba(25,16,10,0.9)';
      colour.fillRect(k * width - 1.3, 0, 2.6, size);
      height.fillStyle = townGrey(0.1);
      height.fillRect(k * width - 1.3, 0, 2.6, size);
    }
    townCloud(colour, size, random, 4, 0.3, 'overlay');
    return townFinish(sheet, 3);
  },
  /** Willow wicker: stakes up v, weavers round u, over and under. */
  wicker: () => {
    const sheet = townSheet(256, '#3d2c1a', 73);
    const { size, colour, height, rr } = sheet;
    const stakes = 16;
    const rows = 20;
    const sw = size / stakes;
    const rh = size / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let k = 0; k < stakes; k += 1) {
        const over = (row + k) % 2 === 0;
        const x = k * sw + sw / 2;
        const y = row * rh + rh / 2;
        const tone = rr(0.85, 1.1) * (over ? 1 : 0.75);
        colour.fillStyle = townRgb([175 * tone, 140 * tone, 90 * tone]);
        colour.beginPath();
        colour.ellipse(x, y, sw * 0.55, rh * 0.42, 0, 0, Math.PI * 2);
        colour.fill();
        height.fillStyle = townGrey(over ? 0.8 : 0.5);
        height.beginPath();
        height.ellipse(x, y, sw * 0.55, rh * 0.42, 0, 0, Math.PI * 2);
        height.fill();
      }
    }
    return townFinish(sheet, 4);
  },
  /** Awning canvas, four colourways one above another (each stall takes a quarter of v), striped along u, the weave and the soiling. */
  cloth: () => {
    const sheet = townSheet(256, '#e8dfc8', 79);
    const { size, colour, height, random } = sheet;
    const ways = [['#a8322a', '#ece2c8'], ['#2c4f7a', '#ece2c8'], ['#3d6a36', '#e4d5a8'], ['#7a3468', '#ece2c8']];
    const band = size / ways.length;
    ways.forEach(([a, b], k) => {
      for (let x = 0; x < size; x += 32) {
        colour.fillStyle = (x / 32) % 2 ? b : a;
        colour.fillRect(x, k * band, 32, band);
      }
    });
    for (let y = 0; y < size; y += 2) {
      colour.fillStyle = 'rgba(0,0,0,0.05)';
      colour.fillRect(0, y, size, 1);
      height.fillStyle = townGrey(0.4, 0.5);
      height.fillRect(0, y, size, 1);
    }
    for (let x = 0; x < size; x += 2) {
      colour.fillStyle = 'rgba(255,255,255,0.04)';
      colour.fillRect(x, 0, 1, size);
    }
    townCloud(colour, size, random, 8, 0.25, 'multiply');
    return townFinish(sheet, 2);
  },
  /** Plain white with a little grain, for things the vertex colour paints whole (produce, a hatch). */
  white: () => {
    const sheet = townSheet(128, '#f4f2ee', 97);
    townCloud(sheet.colour, sheet.size, sheet.random, 8, 0.12, 'multiply');
    return sheet.colour.canvas;
  },
};

/** The church clock's painted dial: blue, a gilt chapter ring, hour marks. */
function townDialTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#7e786c';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#1f3a66';
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#c9a24a';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(128, 128, 104, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.arc(128, 128, 82, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#d8b45a';
  for (let hour = 0; hour < 12; hour += 1) {
    g.save();
    g.translate(128, 128);
    g.rotate((hour / 12) * Math.PI * 2);
    g.fillRect(-4, -100, 8, hour % 3 === 0 ? 22 : 14);
    g.restore();
  }
  g.beginPath();
  g.arc(128, 128, 10, 0, Math.PI * 2);
  g.fill();
  return canvas;
}

// ---- the atlas and the materials -----------------------------------------------------
//
// Every textured surface of the town draws from one 2048² atlas of tiling
// sheets, 4 by 4 cells of 512 px: each sheet painted 480 px square with a
// 16 px border of its own wrap round it. A piece's UVs run on in metres as if
// its sheet tiled on its own; the shader takes them modulo one into its cell
// (the cell travels with each vertex) and samples with the gradients of the
// unwrapped UVs, so the mip level is right across the seams. So the walls,
// timber, roofs, stone, brick, doors, barrels and awnings are all one
// material and one draw, tinted per piece by vertex colour.

const TOWN_ATLAS_CELLS = ['plaster', 'oak', 'ashlar', 'brick', 'planks', 'tiles', 'slate', 'scales', 'staves', 'wicker', 'cloth', 'dial', 'white'];
TOWN_PAINTERS.dial = townDialTexture;

let townAtlasTexture = null;
/** The atlas, painted the first time the town is built and kept for the page. */
function townAtlas() {
  if (townAtlasTexture) return townAtlasTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2048;
  const g = canvas.getContext('2d');
  g.imageSmoothingQuality = 'high';
  TOWN_ATLAS_CELLS.forEach((name, index) => {
    const sheet = TOWN_PAINTERS[name]();
    const x = (index % 4) * 512;
    const y = Math.floor(index / 4) * 512;
    g.save();
    g.beginPath();
    g.rect(x, y, 512, 512);
    g.clip();
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) g.drawImage(sheet, x + 16 + dx * 480, y + 16 + dy * 480, 480, 480);
    g.restore();
  });
  townAtlasTexture = new THREE.CanvasTexture(canvas);
  townAtlasTexture.anisotropy = 8;
  return townAtlasTexture;
}

/** Each cell's corner in the atlas, in cells from the bottom left (the texture is flipped: canvas row 0 is the top). */
function townCellOf(name) {
  const index = TOWN_ATLAS_CELLS.indexOf(name);
  return [index % 4, 3 - Math.floor(index / 4)];
}

/** Sample `map` through the atlas cell each vertex carries, the UVs taken modulo one. */
function townAtlasShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute vec2 atlasCell;\nvarying vec2 vAtlasCell;\n${shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vAtlasCell = atlasCell;')}`;
    shader.fragmentShader = `varying vec2 vAtlasCell;\n${shader.fragmentShader.replace('#include <map_fragment>', `
  vec2 atlasUv = (floor(vAtlasCell + 0.5) * 512.0 + 16.0 + fract(vUv) * 480.0) / 2048.0;
  vec4 texelColor = textureGrad(map, atlasUv, dFdx(vUv) * (480.0 / 2048.0), dFdy(vUv) * (480.0 / 2048.0));
  texelColor = mapTexelToLinear(texelColor);
  diffuseColor *= texelColor;`)}`;
  };
  material.customProgramCacheKey = () => 'town-atlas';
  return material;
}

/**
 * Where each surface draws: its material, and for the atlas its cell.
 * 'fabric' is matte (Lambert: lit per vertex, which on the town's flat
 * faces under the sun comes to the same, at a fraction of the cost), 'glass'
 * the leaded lights and the dark of every opening, 'metal' the ironwork and
 * gilding, 'shadow' the plain blocks the front houses cast their shadows
 * with (never seen).
 */
const TOWN_SLOTS = {
  glass: { material: 'glass' },
  paint: { material: 'glass', flat: true },
  water: { material: 'glass', flat: true },
  iron: { material: 'metal' },
  gilt: { material: 'metal' },
  shadow: { material: 'shadow' },
  produce: { material: 'fabric', cell: townCellOf('white') },
};
for (const name of TOWN_ATLAS_CELLS) TOWN_SLOTS[name] = { material: 'fabric', cell: townCellOf(name) };

let townGlassTexture = null;
function townMakeMaterial(name) {
  if (name === 'fabric') return townAtlasShader(new THREE.MeshLambertMaterial({ color: 0xffffff, map: townAtlas(), vertexColors: true }));
  if (name === 'glass') {
    if (!townGlassTexture) {
      townGlassTexture = new THREE.CanvasTexture(TOWN_PAINTERS.glass());
      townGlassTexture.wrapS = townGlassTexture.wrapT = THREE.RepeatWrapping;
      townGlassTexture.anisotropy = 4;
    }
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, map: townGlassTexture, roughness: 0.25, metalness: 0, vertexColors: true });
    material.userData.reflects = 0.6;
    return material;
  }
  if (name === 'metal') {
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.6, vertexColors: true });
    material.userData.reflects = 0.8;
    return material;
  }
  // The shadow blocks: drawn into the sun's shadow map, never to the screen.
  return new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
}

// ---- merging --------------------------------------------------------------------
//
// A batch gathers pieces for one material, each baked through its matrix
// into the place's space with its own UVs, vertex colour and atlas cell. UVs:
//   'keep'  the geometry's own, times `tile` (a repeat count, or [u, v]);
//   'box'   from the piece's own (scaled) coordinates, projected on the axis
//           its face looks along, in metres over `tile` (metres per repeat);
//           with `grain` the u runs along the piece's longest side (timber);
//   'world' the same in the place's coordinates (render running on from
//           one panel to the next).
// `warp(l)` may bend the piece's unit coordinates before they are placed (a
// sagging roof).

const townFlats = new WeakMap();
function townFlat(geometry) {
  let flat = townFlats.get(geometry);
  if (!flat) {
    flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!flat.attributes.normal) flat.computeVertexNormals();
    if (!flat.attributes.uv) flat.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(flat.attributes.position.count * 2), 2));
    townFlats.set(geometry, flat);
  }
  return flat;
}

function townBatch() {
  const position = [];
  const normal = [];
  const uv = [];
  const colour = [];
  const cells = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const l = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const c = [1, 1, 1];
  const local = [0, 0, 0];
  const localNormal = [0, 0, 0];
  const world = [0, 0, 0];
  const worldNormal = [0, 0, 0];
  return {
    position,
    add(geometry, matrix, { size = TOWN_ONE, mapping = 'box', tile = 1, offset = TOWN_ZERO, colour: tint = TOWN_ONE, shade = null, grain = false, cell = TOWN_ZERO, flat = false, warp = null } = {}) {
      const source = townFlat(geometry);
      const P = source.attributes.position;
      const N = source.attributes.normal;
      const T = source.attributes.uv;
      normalMatrix.getNormalMatrix(matrix);
      const tu = Array.isArray(tile) ? tile[0] : tile;
      const tv = Array.isArray(tile) ? tile[1] : tile;
      const long = size[0] >= size[1] && size[0] >= size[2] ? 0 : size[1] >= size[2] ? 1 : 2;
      for (let index = 0; index < P.count; index += 1) {
        l.fromBufferAttribute(P, index);
        if (warp) warp(l);
        p.copy(l).applyMatrix4(matrix);
        n.fromBufferAttribute(N, index);
        localNormal[0] = n.x;
        localNormal[1] = n.y;
        localNormal[2] = n.z;
        n.applyMatrix3(normalMatrix).normalize();
        position.push(p.x, p.y, p.z);
        normal.push(n.x, n.y, n.z);
        cells.push(cell[0], cell[1]);
        let u;
        let v;
        if (flat) {
          // A dark opening: one texel of the glass, the vertex colour does the rest.
          u = 0.06;
          v = 0.5;
        } else if (mapping === 'keep') {
          u = T.getX(index) * tu;
          v = T.getY(index) * tv;
        } else {
          let from;
          let facing;
          if (mapping === 'world') {
            world[0] = p.x;
            world[1] = p.y;
            world[2] = p.z;
            worldNormal[0] = n.x;
            worldNormal[1] = n.y;
            worldNormal[2] = n.z;
            from = world;
            facing = worldNormal;
          } else {
            local[0] = l.x * size[0];
            local[1] = l.y * size[1];
            local[2] = l.z * size[2];
            from = local;
            facing = localNormal;
          }
          const ax = Math.abs(facing[0]);
          const ay = Math.abs(facing[1]);
          const az = Math.abs(facing[2]);
          const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
          let a;
          let b;
          if (grain && axis !== long) {
            a = long;
            b = 3 - axis - long;
          } else if (axis === 0) {
            a = 2;
            b = 1;
          } else if (axis === 1) {
            a = 0;
            b = 2;
          } else {
            a = 0;
            b = 1;
          }
          u = from[a] / tu;
          v = from[b] / tv;
        }
        uv.push(u + offset[0], v + offset[1]);
        c[0] = tint[0];
        c[1] = tint[1];
        c[2] = tint[2];
        if (shade) shade(c, p, n);
        colour.push(c[0], c[1], c[2]);
      }
    },
    mesh(material) {
      if (!position.length) return null;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colour, 3));
      geometry.setAttribute('atlasCell', new THREE.Float32BufferAttribute(cells, 2));
      geometry.computeBoundingSphere();
      return new THREE.Mesh(geometry, material);
    },
  };
}

let townUnitBox = null;
const townBox = () => (townUnitBox ??= new THREE.BoxGeometry(1, 1, 1));

/**
 * The builder's kit: a batch per material, a current parent transform (a
 * house's place and turn), and ways to put pieces down in it, each by the
 * name of its surface (a TOWN_SLOTS key).
 */
function townKit() {
  const batches = {};
  for (const name of ['fabric', 'glass', 'metal', 'shadow']) batches[name] = townBatch();
  const put = (name, geometry, matrix, options) => {
    const slot = TOWN_SLOTS[name];
    batches[slot.material].add(geometry, matrix, { ...options, cell: slot.cell ?? TOWN_ZERO, flat: slot.flat ?? false });
  };
  let parent = new THREE.Matrix4();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const at = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const X = new THREE.Vector3(1, 0, 0);
  const direction = new THREE.Vector3();
  const kit = {
    batches,
    /** Run `build` with `local` (a Matrix4) applied inside the current parent. */
    within(local, build) {
      const saved = parent;
      parent = saved.clone().multiply(local);
      build();
      parent = saved;
    },
    /** A matrix: at (x, y, z), turned by Euler [x, y, z] (order YXZ), scaled. */
    place(position, rotation = TOWN_ZERO, size = TOWN_ONE) {
      euler.set(rotation[0], rotation[1], rotation[2], 'YXZ');
      quaternion.setFromEuler(euler);
      return new THREE.Matrix4().compose(new THREE.Vector3(...position), quaternion.clone(), new THREE.Vector3(...size));
    },
    /** A box `size` big centred `position`, turned by `options.rotation`. */
    box(name, size, position, options = {}) {
      euler.set(...(options.rotation ?? TOWN_ZERO), 'YXZ');
      quaternion.setFromEuler(euler);
      matrix.compose(at.set(...position), quaternion, scale.set(...size)).premultiply(parent);
      put(name, townBox(), matrix, { size, ...options });
    },
    /** A squared timber (or any box) from point a to point b, `width` by `depth` across. */
    beam(name, a, b, width, depth, options = {}) {
      direction.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const length = direction.length();
      direction.normalize();
      quaternion.setFromUnitVectors(X, direction);
      const size = [length, width, depth];
      matrix.compose(at.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), quaternion, scale.set(...size)).premultiply(parent);
      put(name, townBox(), matrix, { size, grain: true, ...options });
    },
    /** A box on its own axes: ex, ey, ez (Vector3s, right-handed), centred at `centre`; `geometry` in place of the unit box (a subdivided one, to warp). */
    oriented(name, centre, ex, ey, ez, size, options = {}, geometry = townBox()) {
      matrix.makeBasis(ex, ey, ez).scale(scale.set(...size)).setPosition(centre).premultiply(parent);
      put(name, geometry, matrix, { size, ...options });
    },
    /** Where a point of the current frame lies in the place. */
    toWorld(point) {
      return new THREE.Vector3(...point).applyMatrix4(parent);
    },
    /** Any geometry through a local matrix (or none). */
    shape(name, geometry, local = null, options = {}) {
      matrix.copy(parent);
      if (local) matrix.multiply(local);
      put(name, geometry, matrix, options);
    },
    /** The merged meshes, one per material that got anything: they take the sun's shadows, and only the shadow blocks cast them. */
    meshes() {
      const out = [];
      for (const [name, batch] of Object.entries(batches)) {
        const mesh = batch.mesh(townMakeMaterial(name));
        if (!mesh) continue;
        mesh.name = `town-${name}`;
        mesh.castShadow = name === 'shadow';
        mesh.receiveShadow = name !== 'shadow';
        out.push(mesh);
      }
      return out;
    },
  };
  return kit;
}

// ---- weathering -------------------------------------------------------------------

/** Dirt splashed up the foot of a wall: darker and browner below a metre. */
function townGrime(c, p) {
  const k = townSmooth(-0.1, 1.7, p.y);
  c[0] *= 0.5 + 0.5 * k;
  c[1] *= 0.46 + 0.54 * k;
  c[2] *= 0.4 + 0.6 * k;
}

/** Roofs: moss and lichen on the slopes that face north (−z), out of the sun. */
function townMoss(c, p, n) {
  const north = townSmooth(0.1, 0.6, -n.z);
  c[0] *= 1 - 0.12 * north;
  c[1] *= 1 - 0.04 * north;
  c[2] *= 1 - 0.2 * north;
}

/** A shade that does both, after a tint. */
const townStone = (c, p, n) => {
  townGrime(c, p);
  townMoss(c, p, n);
};

/** A value 0..1 that holds still over half a metre of the place: for blotches that do not line up with the pieces. */
function townHash(p) {
  const x = Math.round(p.x * 2);
  const y = Math.round(p.y * 2);
  const z = Math.round(p.z * 2);
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

/** Render: the grime at its foot, and blotches of damp and old limewash over it. */
function townRender(c, p) {
  townGrime(c, p);
  const k = 1 - 0.24 * townHash(p) ** 2;
  c[0] *= k;
  c[1] *= k;
  c[2] *= k * 0.98;
}

// ---- shared geometry ----------------------------------------------------------------

const townGeometryCache = new Map();
/** A geometry made once per page and shared by every piece that uses it. */
function townShared(key, make) {
  if (!townGeometryCache.has(key)) townGeometryCache.set(key, make());
  return townGeometryCache.get(key);
}

/** A `sides`-sided pyramid, a face to +z, flat-shaded, its UVs in metres on each face (so slates keep their size up a spire). */
function townPyramid(sides, radius, height) {
  const position = [];
  const normal = [];
  const uv = [];
  const side = 2 * radius * Math.sin(Math.PI / sides);
  const apothem = radius * Math.cos(Math.PI / sides);
  const slant = Math.hypot(height, apothem);
  const start = Math.PI / 2 - Math.PI / sides;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let k = 0; k < sides; k += 1) {
    const a0 = start + (k / sides) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / sides;
    const p0 = [radius * Math.cos(a1), 0, radius * Math.sin(a1)];
    const p1 = [radius * Math.cos(a0), 0, radius * Math.sin(a0)];
    const apex = [0, height, 0];
    a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    b.set(apex[0] - p0[0], apex[1] - p0[1], apex[2] - p0[2]);
    n.crossVectors(a, b).normalize();
    const mid = (a0 + a1) / 2;
    // Wound counter-clockwise seen from outside, whichever way round the corners came.
    if (n.x * Math.cos(mid) + n.z * Math.sin(mid) < 0) {
      n.negate();
      position.push(...p1, ...p0, ...apex);
    } else {
      position.push(...p0, ...p1, ...apex);
    }
    for (let corner = 0; corner < 3; corner += 1) normal.push(n.x, n.y, n.z);
    uv.push(-side / 2, 0, side / 2, 0, 0, slant);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

/** A gable's triangle of wall, `width` across and `rise` high, run back `length` along −z from z = 0 (the attic's volume). */
function townGablePrism(width, rise, length) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  geometry.translate(0, 0, -length);
  return geometry;
}


/**
 * A pitched roof over a rectangle, the ridge along local z: two slabs
 * `thickness` thick lying on the gables' raking edges, the eaves
 * `overhang` out past the walls and the verges `verge` past the gables, a
 * ridge of half-round tiles, rafter feet under the eaves and bargeboards
 * under the verges. `eave` is the wall top, `rise` the ridge above it.
 * `sag` (metres) bows the ridge and the slabs down in the middle, as an old
 * roof's do; `shade` weathers the slabs (moss, soot). With material
 * 'shadow' it is only the two slabs, for the shadow blocks.
 */
function townRoof(kit, { width, eave, rise, front, back, overhang = 0.35, verge = 0.3, thickness = 0.12, material = 'tiles', colour = TOWN_ONE, timber = TOWN_ONE, rafters = true, barge = true, tile = 1.2, random = Math.random, sag = 0, shade = townMoss }) {
  const half = width / 2;
  const angle = Math.atan2(rise, half);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const tan = Math.tan(angle);
  const z0 = back - verge * 0.6;
  const z1 = front + verge;
  const length = (half + overhang) / cos + thickness * tan * 0.5 + 0.02;
  const wood = { colour: timber, tile: 1.2, grain: true };
  const proxy = material === 'shadow';
  const slab = sag > 0 && !proxy ? townShared('slab', () => new THREE.BoxGeometry(1, 1, 1, 8, 1, 3)) : townBox();
  // The slab's unit coordinates: x along the ridge, y out of the roof, z up the slope to the ridge.
  const bow = (l) => {
    l.y -= (sag * (1 - 4 * l.x * l.x) * (0.35 + 0.65 * (l.z + 0.5))) / thickness;
  };
  for (const s of [1, -1]) {
    const up = new THREE.Vector3(-s * cos, sin, 0);
    const out = new THREE.Vector3(s * sin, cos, 0);
    const along = new THREE.Vector3(0, 0, s);
    const eaveAt = new THREE.Vector3(s * (half + overhang), eave - overhang * tan, (z0 + z1) / 2);
    const centre = eaveAt.clone().addScaledVector(up, length / 2).addScaledVector(out, thickness / 2);
    if (proxy) {
      kit.oriented('shadow', centre, along, out, up, [z1 - z0, thickness, length]);
      continue;
    }
    kit.oriented(material, centre, along, out, up, [z1 - z0, thickness, length], { tile, colour, shade, offset: [random(), random()], warp: sag > 0 ? bow : null }, slab);
    // A point under the slabs, `across` out from the ridge line and `drop` below their underside.
    const under = (across, drop = 0) => [s * across - out.x * drop, eave + rise - across * tan - out.y * drop];
    if (rafters) {
      for (let z = back + 0.3; z < front - 0.1; z += 0.6) {
        const [ax, ay] = under(half - 0.1, 0.06);
        const [bx, by] = under(half + overhang - 0.03, 0.06);
        kit.beam('oak', [ax, ay, z], [bx, by, z], 0.1, 0.08, wood);
      }
    }
    if (barge) {
      for (const z of [z1 - 0.025, z0 + 0.025]) {
        const [ax, ay] = under(half + overhang, 0.1);
        const [bx, by] = under(0, 0.1);
        kit.beam('oak', [ax, ay, z], [bx, by, z], 0.22, 0.045, wood);
      }
    }
  }
  if (proxy) return { angle, tan };
  // The ridge: half-round ridge tiles bedded along the top, bowed with the slabs.
  const ridge = townShared('ridge', () => new THREE.CylinderGeometry(1, 1, 1, 8, 6));
  const r = Math.max(0.05, thickness * 0.8);
  // The cylinder's y runs along the ridge; its z, turned, points down.
  const bowRidge = (l) => {
    l.z += (sag * (1 - 4 * l.y * l.y)) / (r * 0.75);
  };
  kit.shape(material, ridge, kit.place([0, eave + rise + thickness / cos - r * 0.35, (z0 + z1) / 2], [Math.PI / 2, 0, 0], [r, z1 - z0 + 0.04, r * 0.75]), { mapping: 'keep', tile: [2, (z1 - z0) * 0.45], colour: colour.map((value) => value * 0.8), warp: sag > 0 ? bowRidge : null });
  return { angle, tan };
}

// ---- the houses -------------------------------------------------------------------

/** Lime washes: white, ochres, a pink, a grey, a blue-grey (the render's own colour times these). */
const TOWN_WASHES = [[1, 0.97, 0.9], [0.98, 0.88, 0.64], [0.98, 0.84, 0.76], [0.9, 0.88, 0.82], [1, 0.98, 0.93], [0.93, 0.78, 0.56], [0.84, 0.89, 0.92], [0.95, 0.92, 0.82], [0.9, 0.72, 0.62]];
/** The framing: oiled oak, dark oak, ox-blood red, silvered, tarred black. */
const TOWN_TIMBERS = [[0.48, 0.34, 0.24], [0.34, 0.25, 0.19], [0.6, 0.26, 0.18], [0.7, 0.63, 0.55], [0.24, 0.21, 0.19]];
const TOWN_TILE_TINTS = [[1, 1, 1], [0.86, 0.78, 0.72], [0.96, 0.88, 0.82], [0.76, 0.64, 0.58], [1, 0.92, 0.84]];
/** Doors, boards and signs: oiled, dark green, red, blue-grey, brown. */
const TOWN_DOORS = [[0.5, 0.36, 0.24], [0.32, 0.42, 0.34], [0.58, 0.24, 0.17], [0.32, 0.38, 0.48], [0.42, 0.3, 0.2]];

/**
 * One half-timbered house, its front to the square (+z), in the kit's
 * current frame: a stone plinth, a ground storey of 3 m with its door and
 * perhaps a shop window with stall board and flaps, upper storeys of 2.5 m
 * jettied out on joist ends and knee braces, the oak frame proud of the
 * lime-rendered infill, leaded windows set back with sills, and the tiled
 * (or slated) roof with a chimney and maybe a dormer: its gable to the
 * square (the collar, king post and windows framed in it), or `broadside`,
 * its eaves to the square and the ridge along the front. `far` leaves out
 * what only shows close to (the shop, the joist ends, the sides' framing).
 * `casts` adds the plain blocks it casts its shadow with.
 *
 * Old and used: the render stained by the sills and sooted over the
 * openings, grimed up from the street, blotched; the timber silvering; the
 * roof sagging between its gables, sooted round the stack, mossed.
 */
function townHouse(kit, { width: w, storeys, depth: d = 6, seed, far = false, ground: S0 = 3, storey: S = 2.5, broadside = false, casts = false }) {
  const random = townRandom(seed * 97 + 5);
  const rr = (a, b) => a + (b - a) * random();
  const pick = (list) => list[Math.floor(random() * list.length)];
  const mix = (a, b, k) => a.map((value, index) => value + (b[index] - value) * k);
  const wash = pick(TOWN_WASHES);
  const timber = mix(pick(TOWN_TIMBERS), [0.6, 0.58, 0.54], rr(0, 0.4));
  const slate = random() < 0.22;
  const roofTint = slate ? [rr(0.9, 1), rr(0.9, 1), rr(0.95, 1)] : pick(TOWN_TILE_TINTS);
  const doorTint = pick(TOWN_DOORS);
  const pattern = pick(['braces', 'cross', 'studs', 'cross']);
  const nb = Math.max(3, Math.min(6, Math.round(w / 1.05)));
  const bw = w / nb;
  const plinth = 0.4;
  const H = S0 + S * (storeys - 1);
  const R = 0.62 * w + 0.6;
  // Each upper storey oversails the one below: 40 cm over the ground storey, 20 more for a third.
  const fzOf = (level) => (level === 0 ? d / 2 - 0.4 : d / 2 + (level >= 2 ? 0.2 : 0));
  const bottomOf = (level) => (level === 0 ? plinth : S0 + S * (level - 1));
  const topOf = (level) => S0 + S * level;
  const plaster = { mapping: 'world', tile: 3.2, colour: wash, shade: townRender };
  const timberBox = (size, at, extra = {}) => {
    const tint = timber.map((value) => value * rr(0.86, 1.08));
    kit.box('oak', size, at, { colour: tint, shade: townGrime, grain: true, tile: 1.2, offset: [random(), random()], ...extra });
  };
  const timberBeam = (a, b, width, depth) => kit.beam('oak', a, b, width, depth, { colour: timber.map((value) => value * rr(0.86, 1.08)), shade: townGrime, tile: 1.2, offset: [random(), random()] });
  /** A panel of render; `stain` darkens its top (rain off the sill above), `soot` its foot (smoke out of the opening below). */
  const panel = (x0, x1, y0, y1, fz, { stain = 0, soot = 0 } = {}) => {
    if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return;
    const mid = (y0 + y1) / 2;
    const shade = stain || soot ? (c, p) => {
      townRender(c, p);
      const k = p.y > mid ? 1 - stain : 1 - soot;
      c[0] *= k;
      c[1] *= k;
      c[2] *= k * 0.96;
    } : townRender;
    kit.box('plaster', [x1 - x0, y1 - y0, 0.1], [(x0 + x1) / 2, mid, fz - 0.05], { ...plaster, shade });
  };
  const glazing = (x0, x1, y0, y1, z) => {
    kit.box('glass', [x1 - x0 + 0.02, y1 - y0 + 0.02, 0.02], [(x0 + x1) / 2, (y0 + y1) / 2, z], { tile: 0.42, offset: [random(), random()], colour: TOWN_ONE.map(() => rr(0.75, 1.05)) });
  };

  kit.box('ashlar', [w + 0.04, plinth, d - 0.4 + 0.04], [0, plinth / 2, -0.2], { mapping: 'world', tile: 2.2, colour: [0.86, 0.84, 0.8], shade: townStone });

  for (let level = 0; level < storeys; level += 1) {
    const fz = fzOf(level);
    const y0 = bottomOf(level);
    const y1 = topOf(level);
    const jetty = level < storeys - 1 && fzOf(level + 1) > fz + 0.01;
    const plateTop = jetty ? y1 - 0.17 : y1;
    const fullHeight = plateTop - y0;
    // The wall behind the infill: render all round, its front 10 cm back from the infill's face.
    const coreDepth = fz - 0.1 + d / 2;
    kit.box('plaster', [w, y1 - y0, coreDepth], [0, (y0 + y1) / 2, -d / 2 + coreDepth / 2], plaster);
    if (casts) kit.box('shadow', [w - 0.12, y1 - (level === 0 ? 0 : y0), coreDepth - 0.1], [0, (y1 + (level === 0 ? 0 : y0)) / 2, -d / 2 + coreDepth / 2]);
    // Sill beam and wall plate, a moulding under the bressumer of a jettied storey.
    timberBox([w + 0.02, 0.2, 0.16], [0, y0 + 0.1, fz - 0.02]);
    timberBox([w + 0.02, 0.2, 0.16], [0, plateTop - 0.1, fz - 0.02]);
    if (level > 0) timberBox([w + 0.04, 0.05, 0.05], [0, y0 - 0.02, fz + 0.04]);
    // Posts: the corners square and proud of both faces, the rest at the bay lines.
    for (let index = 0; index <= nb; index += 1) {
      if (index === 0 || index === nb) {
        const x = (index === 0 ? -1 : 1) * (w / 2 - 0.1);
        timberBox([0.24, fullHeight, 0.24], [x, y0 + fullHeight / 2, fz - 0.07]);
      } else {
        timberBox([0.18, fullHeight, 0.15], [-w / 2 + index * bw, y0 + fullHeight / 2, fz - 0.025]);
      }
    }
    const ya = level === 0 ? y0 + 0.85 : y0 + 0.9;
    const yb = level === 0 ? y0 + 2.05 : Math.min(y0 + 1.95, plateTop - 0.32);
    // What each bay holds: the door, a shop, windows, the end bays braced.
    const kinds = [];
    const doorBay = level === 0 ? (nb >= 3 ? 1 + Math.floor(random() * (nb - 2)) : 0) : -1;
    let shopBay = -1;
    if (level === 0 && !far && random() < 0.7) shopBay = doorBay === 1 ? (nb > 3 ? 2 : 0) : 1;
    for (let bay = 0; bay < nb; bay += 1) {
      const end = bay === 0 || bay === nb - 1;
      if (bay === doorBay) kinds.push('door');
      else if (bay === shopBay) kinds.push('shop');
      else if (end && pattern !== 'studs' && (level > 0 || nb > 3)) kinds.push('brace');
      else kinds.push('window');
    }
    kinds.forEach((kind, bay) => {
      const x0 = -w / 2 + bay * bw + (bay === 0 ? 0.22 : 0.09);
      const x1 = -w / 2 + (bay + 1) * bw - (bay === nb - 1 ? 0.22 : 0.09);
      const cx = (x0 + x1) / 2;
      const low = y0 + 0.2;
      const high = plateTop - 0.2;
      const rail = (y) => timberBox([x1 - x0 + 0.04, 0.13, 0.14], [cx, y, fz - 0.03]);
      if (kind === 'window') {
        panel(x0, x1, low, ya - 0.13, fz, { stain: rr(0.15, 0.35) });
        rail(ya - 0.065);
        rail(yb + 0.065);
        panel(x0, x1, yb + 0.13, high, fz, { soot: rr(0.05, 0.22) });
        glazing(x0, x1, ya, yb, fz - 0.09);
        if (x1 - x0 > 0.55) timberBox([0.06, yb - ya, 0.06], [cx, (ya + yb) / 2, fz - 0.065]);
        timberBox([x1 - x0, 0.05, 0.06], [cx, ya + (yb - ya) * 0.64, fz - 0.065]);
        timberBox([x1 - x0 + 0.12, 0.05, 0.16], [cx, ya + 0.02, fz + 0.04]);
        if (pattern === 'cross' && ya - 0.13 - low > 0.3) {
          // A St Andrew's cross in the panel under the window.
          timberBeam([x0, low, fz - 0.035], [x1, ya - 0.13, fz - 0.035], 0.11, 0.13);
          timberBeam([x0, ya - 0.13, fz - 0.035], [x1, low, fz - 0.035], 0.11, 0.13);
        } else if (pattern === 'studs') {
          timberBox([0.12, ya - 0.13 - low, 0.13], [cx, (low + ya - 0.13) / 2, fz - 0.035]);
        }
      } else if (kind === 'brace') {
        panel(x0, x1, low, high, fz);
        rail(ya - 0.065);
        // The wind brace rises from the corner toward the middle of the front.
        const leftHalf = bay < nb / 2;
        const outer = leftHalf ? x0 : x1;
        const inner = leftHalf ? x1 : x0;
        timberBeam([outer, low, fz - 0.035], [inner, high, fz - 0.035], 0.14, 0.13);
      } else if (kind === 'door') {
        const dw = Math.min(x1 - x0 - 0.2, 1.05);
        const top = yb + 0.25;
        for (const side of [-1, 1]) timberBox([0.14, top - y0, 0.17], [cx + side * (dw / 2 + 0.07), (y0 + top) / 2, fz - 0.015]);
        timberBox([dw + 0.34, 0.17, 0.17], [cx, top + 0.085, fz - 0.015]);
        panel(x0, cx - dw / 2 - 0.14, low, high, fz);
        panel(cx + dw / 2 + 0.14, x1, low, high, fz);
        panel(x0, x1, top + 0.17, high, fz, { soot: rr(0.2, 0.4) });
        // The door: boards up and down, set back, on strap hinges; a worn step before it.
        kit.box('planks', [dw, top - y0, 0.05], [cx, (y0 + top) / 2, fz - 0.075], { colour: doorTint, shade: townGrime, grain: true, tile: 1.4, offset: [random(), 0] });
        for (const y of [y0 + 0.35, top - 0.35]) kit.box('iron', [dw * 0.7, 0.045, 0.015], [cx - dw * 0.15, y, fz - 0.045], { colour: [0.2, 0.19, 0.18] });
        kit.box('ashlar', [dw + 0.4, 0.16, 0.38], [cx, 0.08, fz + 0.19], { mapping: 'world', tile: 2.2, colour: [0.74, 0.72, 0.68], shade: townGrime });
      } else if (kind === 'shop') {
        const sill = y0 + 0.55;
        kit.box('planks', [x1 - x0, sill - low, 0.06], [cx, (low + sill) / 2, fz - 0.04], { colour: doorTint, shade: townGrime, grain: true, tile: 1.4 });
        timberBox([x1 - x0 + 0.04, 0.12, 0.16], [cx, sill + 0.06, fz - 0.02]);
        rail(yb + 0.065);
        panel(x0, x1, yb + 0.13, high, fz, { soot: rr(0.15, 0.35) });
        kit.box('paint', [x1 - x0, yb - sill, 0.02], [cx, (sill + yb) / 2, fz - 0.09], { colour: [0.11, 0.085, 0.065] });
        // The counter flap let down on its struts, the top flap propped up as a little pentice.
        kit.box('planks', [x1 - x0 - 0.04, 0.05, 0.5], [cx, sill + 0.1, fz + 0.27], { colour: doorTint, grain: true, tile: 1.4 });
        for (const x of [x0 + 0.1, x1 - 0.1]) timberBeam([x, sill - 0.35, fz + 0.01], [x, sill + 0.07, fz + 0.45], 0.05, 0.05);
        kit.box('planks', [x1 - x0 - 0.04, 0.04, 0.6], [cx, yb + 0.03 + 0.3 * Math.sin(0.55), fz + 0.03 + 0.3 * Math.cos(0.55)], { colour: doorTint, grain: true, tile: 1.4, rotation: [-0.55, 0, 0] });
      }
    });
    if (jetty) {
      // Joist ends carrying the storey above (close to only), and knee braces at the posts.
      const reach = fzOf(level + 1);
      if (!far) for (let x = -w / 2 + 0.2; x <= w / 2 - 0.15; x += 0.42) timberBox([0.13, 0.17, reach - fz + 0.14], [x, plateTop + 0.085, (fz - 0.1 + reach + 0.04) / 2]);
      else timberBox([w, 0.17, reach - fz + 0.1], [0, plateTop + 0.085, (fz - 0.1 + reach + 0.04) / 2], { colour: timber.map((value) => value * 0.6) });
      for (let index = 0; index <= nb; index += far ? nb : 2) {
        const x = index === 0 ? -w / 2 + 0.1 : index === nb ? w / 2 - 0.1 : -w / 2 + index * bw;
        timberBeam([x, plateTop - 0.8, fz + 0.02], [x, plateTop - 0.04, reach - 0.04], 0.12, 0.12);
      }
    }
    if (!far) {
      // Sides and back: rails at sill and plate, back corner posts, a brace each side.
      for (const side of [-1, 1]) {
        for (const y of [y0 + 0.1, plateTop - 0.1]) timberBox([0.1, 0.2, coreDepth], [side * w / 2, y, -d / 2 + coreDepth / 2]);
        timberBox([0.24, fullHeight, 0.24], [side * (w / 2 - 0.1), y0 + fullHeight / 2, -d / 2 + 0.1]);
        timberBeam([side * w / 2, y0 + 0.2, -d / 2 + 0.25], [side * w / 2, plateTop - 0.2, -d / 2 + 0.25 + fullHeight * 0.7], 0.13, 0.1);
      }
    }
    if (level === 0 && !far && seed % 2 === 0) {
      // A hanging sign on a wrought bracket.
      const x = w * 0.3;
      const y = S0 - 0.45;
      kit.beam('iron', [x, y, fz], [x, y, fz + 0.95], 0.03, 0.03, { colour: [0.16, 0.15, 0.14] });
      kit.beam('iron', [x, y - 0.45, fz], [x, y, fz + 0.6], 0.025, 0.025, { colour: [0.16, 0.15, 0.14] });
      kit.box('planks', [0.05, 0.5, 0.66], [x, y - 0.36, fz + 0.6], { colour: pick(TOWN_DOORS), grain: true, tile: 1 });
    }
  }

  const fzTop = fzOf(storeys - 1);
  const roofKind = slate ? 'slate' : 'tiles';
  const sag = rr(0.05, 0.16);
  // The stack: through the slope away from any dormer, or on the ridge of a broadside roof.
  const hasChimney = random() < 0.85;
  const side = random() < 0.5 ? 1 : -1;
  const chimney = broadside ? [side * w * 0.28, (fzTop - d / 2) / 2 + rr(-0.3, 0.3)] : [side * w * 0.2, -d * 0.2 + rr(-0.4, 0.4)];
  const chimneyAt = kit.toWorld([chimney[0], 0, chimney[1]]);
  /** The roof weathered: moss to the north, soot round the stack, blotches. */
  const roofShade = (c, p, n) => {
    townMoss(c, p, n);
    let k = 1 - 0.2 * townHash(p);
    if (hasChimney) k *= 0.5 + 0.5 * townSmooth(0.3, 1.8, Math.hypot(p.x - chimneyAt.x, p.z - chimneyAt.z));
    c[0] *= k;
    c[1] *= k;
    c[2] *= k;
  };
  const roofOptions = { material: roofKind, colour: roofTint, timber, tile: slate ? 1.1 : 1.3, random, sag, shade: roofShade };
  const dormer = (wd, hd, tan) => {
    const back = hd / tan + 0.2;
    kit.box('plaster', [wd, hd, back], [0, hd / 2, -back / 2], plaster);
    for (const s of [-1, 1]) timberBox([0.1, hd, 0.12], [s * (wd / 2 - 0.05), hd / 2, -0.04]);
    timberBox([wd + 0.06, 0.1, 0.14], [0, 0.05, -0.03]);
    timberBox([wd + 0.06, 0.1, 0.14], [0, hd - 0.05, -0.03]);
    glazing(-wd / 2 + 0.1, wd / 2 - 0.1, 0.1, hd - 0.1, -0.07);
    kit.shape('plaster', townGablePrism(wd, 0.45, back), kit.place([0, hd, -0.02]), plaster);
    townRoof(kit, { ...roofOptions, width: wd, eave: hd, rise: 0.45, front: -0.02, back: -back, overhang: 0.12, verge: 0.18, thickness: 0.07, rafters: false, sag: 0, shade: townMoss });
  };

  let top = H + R;
  if (broadside) {
    // The ridge along the front: the roof built a quarter turned, its gables at the sides.
    const span = fzTop + d / 2;
    const mid = (fzTop - d / 2) / 2;
    const rise = 0.42 * span + 0.6;
    top = H + rise;
    let tan = 1;
    kit.within(kit.place([0, 0, mid], [0, Math.PI / 2, 0]), () => {
      kit.shape('plaster', townGablePrism(span, rise, w), kit.place([0, H, w / 2]), plaster);
      ({ tan } = townRoof(kit, { ...roofOptions, width: span, eave: H, rise, front: w / 2, back: -w / 2, rafters: !far }));
      if (casts) {
        townRoof(kit, { width: span, eave: H, rise, front: w / 2, back: -w / 2, material: 'shadow', thickness: 0.06 });
        kit.shape('shadow', townGablePrism(span - 0.12, rise - 0.08, w - 0.12), kit.place([0, H, w / 2 - 0.06]));
      }
    });
    // A dormer or two in the front slope.
    const count = w > 4.4 && random() < 0.5 ? 2 : random() < 0.6 ? 1 : 0;
    for (let k = 0; k < count; k += 1) {
      const ax = (span / 2) * 0.48;
      const x = count === 2 ? (k ? 1 : -1) * w * 0.24 : rr(-w * 0.15, w * 0.15);
      kit.within(kit.place([x, H + rise - ax * tan, mid + ax]), () => dormer(0.85, 0.9, tan));
    }
  } else {
    // The gable: the attic's triangle of wall, framed, with its windows and a loft hatch.
    kit.shape('plaster', townGablePrism(w, R, fzTop - 0.04 + d / 2), kit.place([0, H, fzTop - 0.04]), plaster);
    if (casts) kit.shape('shadow', townGablePrism(w - 0.12, R - 0.1, fzTop - 0.1 + d / 2), kit.place([0, H, fzTop - 0.1]));
    const gz = fzTop - 0.01;
    const collar = H + R * 0.45;
    timberBox([w * 0.55 - 0.05, 0.16, 0.1], [0, collar, gz]);
    timberBox([0.16, R * 0.55 - 0.15, 0.1], [0, collar + (R * 0.55 - 0.15) / 2, gz]);
    for (const s of [-1, 1]) {
      timberBeam([s * (w / 2 - 0.08), H, gz], [0, H + R - 0.1, gz], 0.18, 0.1);
      timberBeam([s * w * 0.38, H + 0.05, gz], [s * 0.1, collar, gz], 0.13, 0.09);
    }
    const gableWindows = w > 3.7 && !far ? [-w * 0.2, w * 0.2] : [0];
    for (const x of gableWindows) {
      const ww = 0.5;
      const wy0 = H + 0.3;
      const wy1 = Math.min(collar - 0.1, H + 1.05);
      glazing(x - ww / 2, x + ww / 2, wy0, wy1, gz - 0.025);
      for (const s of [-1, 1]) timberBox([0.1, wy1 - wy0 + 0.1, 0.1], [x + s * (ww / 2 + 0.05), (wy0 + wy1) / 2, gz]);
      timberBox([ww + 0.25, 0.06, 0.15], [x, wy0 - 0.02, gz + 0.04]);
    }
    // With two windows the king post runs down to the plate; with one it stands on the collar over it.
    if (gableWindows.length > 1) timberBox([0.16, collar - H, 0.1], [0, (H + collar) / 2, gz]);
    kit.box('paint', [0.22, 0.34, 0.02], [0, collar + 0.45, gz - 0.02], { colour: [0.06, 0.05, 0.04] });
    const roof = townRoof(kit, { ...roofOptions, width: w, eave: H, rise: R, front: fzTop, back: -d / 2, rafters: !far });
    if (casts) townRoof(kit, { width: w, eave: H, rise: R, front: fzTop, back: -d / 2, material: 'shadow', thickness: 0.06 });
    if (!far && w >= 3.6 && random() < 0.5) {
      const ax = (w / 2) * 0.5;
      kit.within(kit.place([-side * ax, H + R - ax * roof.tan, -d * 0.05], [0, -side * Math.PI / 2, 0]), () => dormer(0.9, 0.95, roof.tan));
    }
  }
  if (hasChimney) {
    // A brick stack, its oversailing cap black with soot, a pot or two.
    const [cx, cz] = chimney;
    const stackTop = top + rr(0.45, 0.85);
    const brick = { tile: 0.8, colour: [0.9, 0.84, 0.8], offset: [random(), random()] };
    const sooty = (c, p) => {
      const k = 1 - 0.55 * townSmooth(stackTop - 1.2, stackTop, p.y);
      c[0] *= k;
      c[1] *= k;
      c[2] *= k;
    };
    kit.box('brick', [0.5, stackTop - H, 0.62], [cx, (H + stackTop) / 2, cz], { ...brick, shade: sooty });
    kit.box('brick', [0.64, 0.12, 0.76], [cx, stackTop - 0.18, cz], { ...brick, colour: [0.32, 0.29, 0.27] });
    kit.box('brick', [0.6, 0.08, 0.72], [cx, stackTop + 0.02, cz], { ...brick, colour: [0.16, 0.15, 0.14] });
    const pot = townShared('pot', () => new THREE.CylinderGeometry(0.07, 0.09, 0.3, 6, 1));
    kit.shape('tiles', pot, kit.place([cx, stackTop + 0.2, cz + (random() < 0.5 ? 0.12 : -0.12)]), { mapping: 'keep', tile: [1, 0.3], colour: [0.5, 0.4, 0.36] });
  }
}

/**
 * A house further off, behind the front rows, for its roofline: a rendered
 * box with a sill band and a plate at each floor, corner posts, dark
 * windows, a sagging tiled roof (gable or eaves to the front), a stack. Seen
 * only over and between the nearer roofs and down the streets.
 */
function townBackdrop(kit, { width: w, depth: d, storeys, seed, broadside }) {
  const random = townRandom(seed * 131 + 17);
  const rr = (a, b) => a + (b - a) * random();
  const pick = (list) => list[Math.floor(random() * list.length)];
  const wash = pick(TOWN_WASHES);
  const timber = pick(TOWN_TIMBERS);
  const slate = random() < 0.25;
  const roofTint = slate ? [0.95, 0.95, 1] : pick(TOWN_TILE_TINTS);
  const H = 3 + 2.6 * (storeys - 1);
  const plaster = { mapping: 'world', tile: 3.2, colour: wash, shade: townRender };
  kit.box('plaster', [w, H, d], [0, H / 2, 0], plaster);
  const wood = { colour: timber, shade: townGrime, grain: true, tile: 1.2 };
  for (let level = 0; level < storeys; level += 1) {
    const y0 = level === 0 ? 0 : 3 + 2.6 * (level - 1);
    kit.box('oak', [w + 0.04, 0.2, 0.06], [0, y0 + 0.1, d / 2 + 0.02], wood);
    const windows = Math.max(1, Math.round(w / 1.7));
    for (let k = 0; k < windows; k += 1) {
      if (level === 0 && k === Math.floor(windows / 2)) {
        kit.box('planks', [0.9, 2.0, 0.04], [-w / 2 + ((k + 0.5) * w) / windows, 1.0, d / 2 + 0.01], { colour: pick(TOWN_DOORS), grain: true, tile: 1.4 });
        continue;
      }
      const x = -w / 2 + ((k + 0.5) * w) / windows;
      const y = y0 + (level === 0 ? 1.0 : 0.85);
      kit.box('glass', [0.7, 1.0, 0.04], [x, y + 0.5, d / 2 + 0.01], { tile: 0.42, offset: [random(), random()], colour: [0.8, 0.8, 0.8] });
      kit.box('oak', [0.86, 0.06, 0.1], [x, y, d / 2 + 0.04], wood);
    }
  }
  for (const s of [-1, 1]) kit.box('oak', [0.2, H, 0.08], [s * (w / 2 - 0.08), H / 2, d / 2 + 0.02], wood);
  const sag = rr(0.06, 0.18);
  const roof = { material: slate ? 'slate' : 'tiles', colour: roofTint, timber, tile: slate ? 1.1 : 1.3, random, sag, rafters: false, shade: (c, p, n) => {
    townMoss(c, p, n);
    const k = 1 - 0.22 * townHash(p);
    c[0] *= k;
    c[1] *= k;
    c[2] *= k;
  } };
  let top;
  if (broadside) {
    const rise = 0.45 * d + 0.4;
    top = H + rise;
    kit.within(kit.place([0, 0, 0], [0, Math.PI / 2, 0]), () => {
      kit.shape('plaster', townGablePrism(d, rise, w), kit.place([0, H, w / 2]), plaster);
      townRoof(kit, { ...roof, width: d, eave: H, rise, front: w / 2, back: -w / 2, barge: false });
    });
  } else {
    const rise = 0.62 * w + 0.6;
    top = H + rise;
    kit.shape('plaster', townGablePrism(w, rise, d), kit.place([0, H, d / 2]), plaster);
    townRoof(kit, { ...roof, width: w, eave: H, rise, front: d / 2, back: -d / 2 });
  }
  if (random() < 0.8) {
    const cx = rr(-w * 0.3, w * 0.3);
    const stackTop = top + rr(0.3, 0.8);
    kit.box('brick', [0.5, stackTop - H, 0.6], [cx, (H + stackTop) / 2, rr(-d * 0.25, 0)], { tile: 0.8, colour: [0.8, 0.74, 0.7] });
  }
}

// ---- the church -------------------------------------------------------------------

/** A lancet window in a stone wall (its face at z = 0, out along +z): leaded glass, jambs, the pointed head, a sloped sill, a mullion. */
function townLancet(kit, { width, sill, spring, stone, depth = 0.24 }) {
  const half = width / 2;
  const apex = spring + half * 1.75;
  const shape = new THREE.Shape();
  shape.moveTo(-half, sill);
  shape.lineTo(half, sill);
  shape.lineTo(half, spring);
  shape.quadraticCurveTo(half, spring + half * 1.15, 0, apex);
  shape.quadraticCurveTo(-half, spring + half * 1.15, -half, spring);
  shape.closePath();
  kit.shape('glass', new THREE.ShapeGeometry(shape, 6), kit.place([0, 0, 0.012]), { mapping: 'keep', tile: 1 / 0.4, colour: [0.9, 0.95, 1] });
  for (const side of [-1, 1]) {
    kit.box('ashlar', [0.22, spring - sill, depth], [side * (half + 0.11), (sill + spring) / 2, depth / 2], stone);
    kit.beam('ashlar', [side * (half + 0.11), spring - 0.05, depth / 2], [side * (half * 0.62 + 0.1), spring + (apex - spring) * 0.62, depth / 2], 0.24, depth, stone);
    kit.beam('ashlar', [side * (half * 0.62 + 0.1), spring + (apex - spring) * 0.62, depth / 2], [0, apex + 0.14, depth / 2], 0.24, depth, stone);
  }
  kit.box('ashlar', [width + 0.55, 0.14, depth + 0.12], [0, sill - 0.07, (depth + 0.12) / 2], { ...stone, rotation: [0.15, 0, 0] });
  kit.box('ashlar', [0.09, apex - sill - 0.25, 0.12], [0, (sill + apex - 0.25) / 2, 0.06], stone);
}

/** A rooster weathervane's silhouette, about a metre long, facing +x. */
function townCockerel() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.45, 0.05);
  shape.quadraticCurveTo(-0.6, 0.45, -0.38, 0.72);
  shape.quadraticCurveTo(-0.34, 0.48, -0.2, 0.36);
  shape.quadraticCurveTo(0.0, 0.42, 0.18, 0.42);
  shape.lineTo(0.22, 0.6);
  shape.lineTo(0.2, 0.68);
  shape.lineTo(0.25, 0.76);
  shape.lineTo(0.28, 0.68);
  shape.lineTo(0.32, 0.75);
  shape.lineTo(0.34, 0.65);
  shape.lineTo(0.44, 0.6);
  shape.lineTo(0.34, 0.56);
  shape.lineTo(0.33, 0.47);
  shape.quadraticCurveTo(0.3, 0.24, 0.12, 0.15);
  shape.lineTo(0.1, 0.0);
  shape.lineTo(0.06, 0.0);
  shape.lineTo(0.05, 0.12);
  shape.quadraticCurveTo(-0.2, 0.1, -0.45, 0.05);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false, curveSegments: 6 });
  geometry.translate(0, 0, -0.015);
  return geometry;
}

/**
 * The parish church over the north roofs: an ashlar nave with buttresses
 * and lancets under a slate roof, and at its west end (toward the square,
 * +z) the tower: plinth, string courses, quoins, the west door, a clock,
 * the belfry's paired louvred openings, a corbel table and battlements with
 * corner pinnacles, and the octagonal spire in fish-scale slate with its
 * lucarnes, gilt ball, cross-arms and weathercock.
 */
function townChurch(kit, random) {
  const stone = { mapping: 'world', tile: 2.2, colour: [0.92, 0.89, 0.83], shade: townStone };
  const pale = { ...stone, colour: [1, 0.97, 0.91] };
  const tz = 9;
  // The nave.
  kit.box('ashlar', [7.6, 0.7, 16.6], [0, 0.35, 0], stone);
  kit.box('ashlar', [7, 9, 16], [0, 4.5, 0], stone);
  for (const s of [-1, 1]) {
    for (const z of [-7.8, -4, 0, 4]) {
      kit.box('ashlar', [0.7, 5.6, 0.8], [s * 3.85, 2.8, z], stone);
      kit.box('ashlar', [0.46, 2.7, 0.7], [s * 3.73, 6.95, z], stone);
      kit.box('ashlar', [0.82, 0.16, 0.9], [s * 3.86, 5.62, z], { ...pale, rotation: [0, 0, -s * 0.55] });
      kit.box('ashlar', [0.6, 0.14, 0.8], [s * 3.76, 8.3, z], { ...pale, rotation: [0, 0, -s * 0.6] });
    }
    for (const z of [-6, -2, 2]) kit.within(kit.place([s * 3.5, 0, z], [0, s * Math.PI / 2, 0]), () => townLancet(kit, { width: 1.1, sill: 2.4, spring: 6.4, stone: pale }));
  }
  kit.box('ashlar', [7.2, 0.25, 16.2], [0, 9.0, 0], pale);
  kit.shape('ashlar', townGablePrism(7, 5.5, 14.5), kit.place([0, 9, 6.5]), stone);
  townRoof(kit, { width: 7, eave: 9, rise: 5.5, front: 6.5, back: -7.75, overhang: 0.35, verge: 0, thickness: 0.15, material: 'slate', colour: [0.95, 0.96, 1], timber: [0.35, 0.27, 0.2], barge: false, tile: 1.1, random, sag: 0.1 });
  // The east gable's coped parapet and its cross.
  for (const s of [-1, 1]) kit.beam('ashlar', [s * 3.75, 9.15, -8], [0, 14.95, -8], 0.42, 0.55, pale);
  kit.box('ashlar', [0.14, 1.0, 0.14], [0, 15.4, -8], pale);
  kit.box('ashlar', [0.6, 0.14, 0.14], [0, 15.55, -8], pale);

  // The tower.
  kit.box('ashlar', [5.7, 1.0, 5.7], [0, 0.5, tz], stone);
  kit.box('ashlar', [5.4, 0.3, 5.4], [0, 1.1, tz], pale);
  kit.box('ashlar', [5, 20, 5], [0, 10, tz], stone);
  for (const y of [7.2, 13.9]) kit.box('ashlar', [5.26, 0.22, 5.26], [0, y, tz], pale);
  // Quoins: long and short stones by turns up each corner, a shade lighter and a little proud.
  let course = 0;
  for (let y = 1.45; y < 19.3; y += 0.42) {
    course += 1;
    if (Math.abs(y - 7.2) < 0.3 || Math.abs(y - 13.9) < 0.3) continue;
    const long = course % 2 === 0;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const lx = ((sx * sz > 0) === long ? 0.72 : 0.42) + 0.03;
        const lz = ((sx * sz > 0) === long ? 0.42 : 0.72) + 0.03;
        kit.box('ashlar', [lx, 0.38, lz], [sx * (2.53 - lx / 2), y, tz + sz * (2.53 - lz / 2)], { tile: 2.2, colour: [1, 0.98, 0.92], shade: townStone, offset: [random(), random()] });
      }
    }
  }
  const faces = [[0, [0, 0, tz + 2.5]], [Math.PI / 2, [2.5, 0, tz]], [Math.PI, [0, 0, tz - 2.5]], [-Math.PI / 2, [-2.5, 0, tz]]];
  faces.forEach(([turn, at], face) => {
    kit.within(kit.place(at, [0, turn, 0]), () => {
      // The belfry: two tall openings, louvre boards against the weather, a shaft between.
      for (const x0 of [-0.7, 0.7]) {
        kit.box('paint', [0.84, 3.4, 0.02], [x0, 16.85, 0.01], { colour: [0.05, 0.045, 0.04] });
        for (const side of [-1, 1]) kit.box('ashlar', [0.16, 2.85, 0.3], [x0 + side * 0.5, 16.6, 0.13], pale);
        kit.beam('ashlar', [x0 - 0.5, 17.95, 0.13], [x0, 18.6, 0.13], 0.2, 0.3, pale);
        kit.beam('ashlar', [x0 + 0.5, 17.95, 0.13], [x0, 18.6, 0.13], 0.2, 0.3, pale);
        kit.box('ashlar', [1.2, 0.12, 0.38], [x0, 15.12, 0.17], { ...pale, rotation: [0.2, 0, 0] });
        for (let k = 0; k < 7; k += 1) kit.box('oak', [0.84, 0.035, 0.28], [x0, 15.45 + k * 0.38, 0.1], { colour: [0.5, 0.46, 0.42], rotation: [0.7, 0, 0], grain: true });
      }
      // Corbel table, parapet, merlons, coping.
      for (let x = -2.3; x <= 2.31; x += 0.46) kit.box('ashlar', [0.2, 0.28, 0.24], [x, 19.55, 0.1], pale);
      kit.box('ashlar', [5.4, 0.8, 0.36], [0, 20.1, 0.0], stone);
      kit.box('ashlar', [5.46, 0.08, 0.44], [0, 20.53, 0.0], pale);
      for (let k = 0; k < 5; k += 1) kit.box('ashlar', [0.55, 0.62, 0.36], [-2.05 + k * 1.025, 20.88, 0.0], stone);
      if (face === 0) {
        // The west door: a pointed arch of two orders, a boarded door; a step; above, a lancet and the clock.
        for (const side of [-1, 1]) {
          kit.box('ashlar', [0.32, 2.9, 0.45], [side * 1.0, 1.45, 0.32], pale);
          kit.box('ashlar', [0.22, 2.9, 0.3], [side * 0.8, 1.45, 0.47], pale);
          kit.beam('ashlar', [side * 1.05, 2.85, 0.4], [0, 3.95, 0.4], 0.32, 0.5, pale);
          kit.beam('ashlar', [side * 0.8, 2.85, 0.5], [0, 3.65, 0.5], 0.22, 0.3, pale);
        }
        kit.box('planks', [1.4, 3.1, 0.06], [0, 1.55, 0.37], { colour: [0.42, 0.28, 0.18], grain: true, tile: 1.6 });
        kit.box('ashlar', [1.6, 0.9, 0.02], [0, 3.3, 0.36], { colour: [0.62, 0.6, 0.56], shade: townStone });
        for (const y of [0.6, 1.6, 2.6]) kit.box('iron', [1.1, 0.05, 0.015], [-0.1, y, 0.41], { colour: [0.18, 0.17, 0.16] });
        kit.box('ashlar', [2.8, 0.16, 0.7], [0, 0.08, 0.7], stone);
        townLancet(kit, { width: 0.5, sill: 8.0, spring: 9.3, stone: pale, depth: 0.18 });
        kit.shape('dial', townShared('dial', () => new THREE.CircleGeometry(0.85, 32)), kit.place([0, 11.4, 0.05]), { mapping: 'keep' });
        kit.shape('ashlar', townShared('dialRing', () => new THREE.TorusGeometry(0.9, 0.08, 6, 32)), kit.place([0, 11.4, 0.04]), { mapping: 'keep', tile: [6, 1], colour: [1, 0.97, 0.9] });
        for (const [angle, length, width] of [[Math.PI / 3, 0.45, 0.08], [-Math.PI * 0.15, 0.68, 0.05]]) {
          kit.box('gilt', [width, length, 0.02], [-Math.sin(angle) * length / 2, 11.4 + Math.cos(angle) * length / 2, 0.08], { colour: [0.85, 0.66, 0.3], rotation: [0, 0, angle] });
        }
      } else {
        townLancet(kit, { width: 0.45, sill: 9.0, spring: 10.4, stone: pale, depth: 0.18 });
      }
    });
  });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      kit.box('ashlar', [0.55, 1.0, 0.55], [sx * 2.45, 20.95, tz + sz * 2.45], stone);
      kit.shape('ashlar', townShared('pinnacle', () => townPyramid(4, 0.42, 1.5)), kit.place([sx * 2.45, 21.45, tz + sz * 2.45], [0, Math.PI / 4, 0]), { mapping: 'keep', tile: 1 / 2.2, colour: [0.84, 0.81, 0.76], shade: townMoss });
    }
  }
  // The spire, its leaded foot, the lucarnes on the cardinal faces, and the top.
  const foot = 20.3;
  const tall = 13.5;
  const radius = 2.3;
  kit.shape('scales', townShared('spire', () => townPyramid(8, radius, tall)), kit.place([0, foot, tz]), { mapping: 'keep', tile: 1 / 1.6, colour: [0.92, 0.96, 1], shade: townMoss });
  kit.shape('iron', townShared('spireFoot', () => new THREE.CylinderGeometry(radius * 1.03, radius * 1.06, 0.22, 8, 1)), kit.place([0, foot + 0.05, tz], [0, Math.PI / 8, 0]), { colour: [0.5, 0.52, 0.55] });
  const lucarneY = 23.1;
  const apothemAt = radius * Math.cos(Math.PI / 8) * (1 - (lucarneY - foot) / tall);
  for (const turn of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    kit.within(kit.place([0, lucarneY, tz], [0, turn, 0]), () => {
      const front = apothemAt + 0.25;
      kit.box('scales', [0.6, 0.85, 0.9], [0, 0.42, front - 0.45], { tile: 0.9, colour: [0.92, 0.96, 1] });
      kit.box('paint', [0.3, 0.5, 0.02], [0, 0.4, front + 0.005], { colour: [0.05, 0.045, 0.04] });
      kit.shape('scales', townGablePrism(0.6, 0.4, 0.9), kit.place([0, 0.85, front]), { tile: 0.9, colour: [0.92, 0.96, 1] });
      townRoof(kit, { width: 0.6, eave: 0.85, rise: 0.4, front, back: front - 0.9, overhang: 0.06, verge: 0.08, thickness: 0.05, material: 'scales', colour: [0.92, 0.96, 1], rafters: false, barge: false, tile: 0.9, random });
    });
  }
  const top = foot + tall;
  const ball = townShared('ball', () => new THREE.SphereGeometry(1, 12, 8));
  const gilt = [0.88, 0.68, 0.3];
  const iron = [0.2, 0.19, 0.18];
  kit.shape('gilt', ball, kit.place([0, top - 0.05, tz], TOWN_ZERO, [0.17, 0.17, 0.17]), { colour: gilt });
  kit.shape('iron', townShared('rod', () => new THREE.CylinderGeometry(0.03, 0.035, 1, 6, 1)), kit.place([0, top + 0.9, tz], TOWN_ZERO, [1, 1.9, 1]), { colour: iron });
  kit.box('iron', [0.9, 0.03, 0.03], [0, top + 0.6, tz], { colour: iron });
  kit.box('iron', [0.03, 0.03, 0.9], [0, top + 0.6, tz], { colour: iron });
  kit.shape('gilt', ball, kit.place([0, top + 1.25, tz], TOWN_ZERO, [0.09, 0.09, 0.09]), { colour: gilt });
  kit.shape('gilt', townShared('cockerel', townCockerel), kit.place([0, top + 1.32, tz], [0, 0.7, 0], [0.95, 0.95, 0.95]), { mapping: 'keep', colour: gilt });
}

// ---- the market -------------------------------------------------------------------
//
// Only what reads as real at a few metres: two stalls under striped
// awnings with their baskets, a cluster of barrels by a door, the well and
// the market cross. (The stocks, the cart, the bunting, the sacks and the
// loose crates went: they read as toys.)

/** Produce at its real size (radius in metres), the colours it comes in, its shape as a scaled ball. */
const TOWN_PRODUCE = {
  apple: { r: 0.042, scale: [1, 0.9, 1], colours: [[0.72, 0.14, 0.09], [0.78, 0.32, 0.1], [0.62, 0.1, 0.08], [0.8, 0.62, 0.2]] },
  pear: { r: 0.04, scale: [1, 1.35, 1], colours: [[0.62, 0.66, 0.22], [0.7, 0.68, 0.3]] },
  loaf: { r: 0.11, scale: [1.5, 0.62, 0.95], colours: [[0.6, 0.38, 0.17], [0.55, 0.33, 0.15]] },
  roll: { r: 0.05, scale: [1, 0.7, 1], colours: [[0.76, 0.52, 0.26], [0.7, 0.46, 0.22]] },
  cabbage: { r: 0.085, scale: [1, 0.9, 1], colours: [[0.42, 0.6, 0.26], [0.5, 0.66, 0.32], [0.36, 0.52, 0.24]] },
  onion: { r: 0.038, scale: [1, 0.85, 1], colours: [[0.68, 0.42, 0.18], [0.74, 0.5, 0.24], [0.55, 0.25, 0.3]] },
  turnip: { r: 0.05, scale: [1, 0.9, 1], colours: [[0.9, 0.85, 0.78], [0.75, 0.5, 0.62]] },
};

/** A heaped basketful in a circle of `radius` resting at `at`: two layers, the top one smaller, so it domes. */
function townHeap(kit, at, radius, kind, random) {
  const spec = TOWN_PRODUCE[kind];
  const ball = townShared('fruit', () => new THREE.IcosahedronGeometry(1, 0));
  let reach = radius - spec.r * 0.9;
  for (let layer = 0; layer < 2 && reach > -0.001; layer += 1) {
    const y = at[1] + spec.r * spec.scale[1] * (0.85 + layer * 1.45);
    const count = Math.max(1, Math.floor(((reach + spec.r) / spec.r) ** 2 * 0.5));
    for (let k = 0; k < count; k += 1) {
      const angle = random() * Math.PI * 2;
      const away = Math.sqrt(random()) * Math.max(0, reach);
      const base = spec.colours[Math.floor(random() * spec.colours.length)];
      const jitter = 0.9 + random() * 0.18;
      const size = spec.r * (0.88 + random() * 0.24);
      kit.shape('produce', ball, kit.place([at[0] + Math.cos(angle) * away, y + random() * spec.r * 0.25, at[2] + Math.sin(angle) * away], [random() * 6, random() * 6, random() * 6], spec.scale.map((value) => value * size)), { mapping: 'keep', colour: base.map((value) => value * jitter) });
    }
    reach -= spec.r * 2;
  }
}

/** A willow basket, open, a rolled rim (its floor at y = 0). */
function townBasketGeometry() {
  const points = [[0.001, 0.0], [0.15, 0.0], [0.2, 0.07], [0.225, 0.15], [0.24, 0.165], [0.212, 0.165], [0.19, 0.08], [0.14, 0.03], [0.001, 0.03]];
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 10);
}

/** A sheet seen from both sides: the same triangles again, wound the other way, facing back. */
function townTwoSided(geometry) {
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  const P = flat.attributes.position.array;
  const N = flat.attributes.normal.array;
  const T = flat.attributes.uv.array;
  const position = [...P];
  const normal = [...N];
  const uv = [...T];
  for (let t = 0; t < P.length / 9; t += 1) {
    for (const corner of [0, 2, 1]) {
      const i = t * 3 + corner;
      position.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      normal.push(-N[i * 3], -N[i * 3 + 1], -N[i * 3 + 2]);
      uv.push(T[i * 2], T[i * 2 + 1]);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

/** The awning over a stall: canvas sagging between its rails, run out past the front rail, and a scalloped valance along its front edge. */
function townAwning(kit, band, { left, right, backZ, backY, frontZ, frontY, overhang }) {
  const columns = 10;
  const rows = 6;
  const run = frontZ - backZ + overhang;
  const atFront = (frontZ - backZ) / run;
  const slope = (frontY - backY) / (frontZ - backZ);
  const point = (s, t) => {
    const z = backZ + t * run;
    let y = backY + slope * (z - backZ) + 0.07;
    if (t <= atFront) y -= 0.1 * Math.sin(Math.PI * s) * Math.sin((Math.PI * t) / atFront) + 0.02 * Math.sin(Math.PI * s);
    else {
      const k = (t - atFront) / (1 - atFront);
      y -= 0.02 * Math.sin(Math.PI * s) + 0.13 * k * k;
    }
    return [left + s * (right - left), y, z];
  };
  // The canvas's top band is the top of v; the bands sit inside the cell (v within 0..1).
  const v0 = (3 - band) * 0.25 + 0.03;
  const position = [];
  const uv = [];
  const index = [];
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const p = point(column / columns, row / rows);
      position.push(...p);
      uv.push(p[0] / 1.6, v0 + (row / rows) * 0.19);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const sheet = new THREE.BufferGeometry();
  sheet.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  sheet.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  sheet.setIndex(index);
  // Soiled toward the back where the rain stands, a little faded.
  const soil = (c, p) => {
    const k = 0.8 + 0.2 * townSmooth(backZ, frontZ, p.z);
    c[0] *= k;
    c[1] *= k;
    c[2] *= k * 0.95;
  };
  kit.shape('cloth', townTwoSided(sheet), null, { mapping: 'keep', colour: [0.92, 0.9, 0.86], shade: soil });
  // The valance: seven scallops hanging from the front edge.
  const lobes = 7;
  const across = lobes * 4;
  const hang = [];
  const hangUv = [];
  const hangIndex = [];
  for (let column = 0; column <= across; column += 1) {
    const s = column / across;
    const top = point(s, 1);
    const drop = 0.1 + 0.08 * Math.sin(Math.PI * ((s * lobes) % 1));
    hang.push(...top, top[0], top[1] - drop, top[2] + 0.01);
    hangUv.push(top[0] / 1.6, v0 + 0.2, top[0] / 1.6, v0 + 0.16);
    if (column < across) {
      const a = column * 2;
      hangIndex.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  const valance = new THREE.BufferGeometry();
  valance.setAttribute('position', new THREE.Float32BufferAttribute(hang, 3));
  valance.setAttribute('uv', new THREE.Float32BufferAttribute(hangUv, 2));
  valance.setIndex(hangIndex);
  kit.shape('cloth', townTwoSided(valance), null, { mapping: 'keep', colour: [0.9, 0.88, 0.84] });
}

/**
 * A market stall (its customers at +z): a boarded table on trestles, four
 * posts carrying rails, the striped awning (`band` picks its colourway) and
 * the goods heaped in baskets.
 */
function townStall(kit, band, goods, random) {
  const top = 0.86;
  const boards = { colour: [0.66, 0.54, 0.42], shade: townGrime, grain: true, tile: 1.5 };
  const oak = { colour: [0.46, 0.38, 0.3], shade: townGrime, tile: 1.2 };
  kit.box('planks', [2.4, 0.05, 1.0], [0, top, 0], { ...boards, offset: [random(), random()] });
  kit.box('planks', [2.4, 0.38, 0.03], [0, top - 0.24, 0.49], boards);
  for (const x of [-0.95, 0.95]) {
    for (const s of [-1, 1]) kit.beam('oak', [x, 0, s * 0.42], [x, top - 0.03, s * 0.14], 0.06, 0.05, oak);
    kit.beam('oak', [x, top - 0.055, -0.46], [x, top - 0.055, 0.46], 0.07, 0.06, oak);
  }
  const frontY = 2.1;
  const backY = 2.45;
  const frontZ = 0.62;
  const backZ = -0.56;
  for (const x of [-1.24, 1.24]) {
    kit.box('oak', [0.07, frontY, 0.07], [x, frontY / 2, frontZ], { ...oak, grain: true });
    kit.box('oak', [0.07, backY, 0.07], [x, backY / 2, backZ], { ...oak, grain: true });
  }
  kit.beam('oak', [-1.32, frontY, frontZ], [1.32, frontY, frontZ], 0.06, 0.06, oak);
  kit.beam('oak', [-1.32, backY, backZ], [1.32, backY, backZ], 0.06, 0.06, oak);
  townAwning(kit, band, { left: -1.4, right: 1.4, backZ: backZ - 0.06, backY, frontZ, frontY, overhang: 0.34 });
  const basket = townShared('basket', townBasketGeometry);
  [-0.82, -0.28, 0.28, 0.82].forEach((x, k) => {
    kit.shape('wicker', basket, kit.place([x, top + 0.025, 0.04], [0, random() * 3, 0]), { mapping: 'keep', tile: [4, 1.5], colour: [0.9, 0.84, 0.78] });
    townHeap(kit, [x, top + 0.04, 0.04], 0.2, goods[k % goods.length], random);
  });
}

/** A barrel's staves: bellied, 0.9 m tall, 0.34 m at the bilge (its foot at y = 0). */
function townBarrelGeometry() {
  const points = [];
  for (let j = 0; j <= 6; j += 1) points.push(new THREE.Vector2(0.29 + 0.05 * Math.sin((Math.PI * j) / 6), (j / 6) * 0.9));
  return new THREE.LatheGeometry(points, 14);
}

/** A coopered barrel: staves, its head, the iron hoops. In the kit's frame, standing at the origin. */
function townBarrelHere(kit, tint) {
  const radiusAt = (y) => 0.29 + 0.05 * Math.sin((Math.PI * y) / 0.9);
  kit.shape('staves', townShared('barrel', townBarrelGeometry), null, { mapping: 'keep', colour: tint, shade: townGrime });
  const head = townShared('barrelHead', () => new THREE.CircleGeometry(0.285, 14));
  kit.shape('staves', head, kit.place([0, 0.875, 0], [-Math.PI / 2, 0, 0]), { mapping: 'keep', colour: tint.map((value) => value * 0.8) });
  kit.shape('staves', head, kit.place([0, 0.025, 0], [Math.PI / 2, 0, 0]), { mapping: 'keep', colour: tint.map((value) => value * 0.7) });
  [0.07, 0.24, 0.66, 0.83].forEach((y, k) => {
    const hoop = townShared(`hoop${k}`, () => {
      const r = radiusAt(y);
      return new THREE.LatheGeometry([new THREE.Vector2(r + 0.003, y - 0.024), new THREE.Vector2(r + 0.009, y), new THREE.Vector2(r + 0.003, y + 0.024)], 14);
    });
    kit.shape('iron', hoop, null, { mapping: 'keep', colour: [0.2, 0.17, 0.15] });
  });
}

function townBarrel(kit, at, { turn = 0, lying = false, tint }) {
  if (lying) kit.within(kit.place([at[0], 0.34, at[2]], [0, turn, Math.PI / 2]), () => kit.within(kit.place([0, -0.45, 0]), () => townBarrelHere(kit, tint)));
  else kit.within(kit.place([at[0], 0, at[2]], [0, turn, 0]), () => townBarrelHere(kit, tint));
}

/** The well: an ashlar drum with a worn coping, dark water, oak posts and a windlass under a little tiled roof. */
function townWell(kit, random) {
  const stone = { mapping: 'keep', colour: [0.78, 0.76, 0.72], shade: townStone };
  kit.shape('ashlar', townShared('wellDrum', () => new THREE.CylinderGeometry(0.98, 1.02, 0.86, 16, 1, true)), kit.place([0, 0.43, 0]), { ...stone, tile: [2.8, 0.4] });
  const coping = townShared('wellCoping', () => new THREE.LatheGeometry([[1.0, 0.84], [1.07, 0.87], [1.07, 0.99], [0.76, 0.99], [0.76, 0.86], [0.78, 0.45]].map(([r, y]) => new THREE.Vector2(r, y)), 16));
  kit.shape('ashlar', coping, null, { ...stone, tile: [6, 1], colour: [0.84, 0.82, 0.78] });
  kit.shape('water', townShared('wellWater', () => new THREE.CircleGeometry(0.78, 16)), kit.place([0, 0.52, 0], [-Math.PI / 2, 0, 0]), { colour: [0.06, 0.08, 0.09] });
  const oak = { colour: [0.42, 0.34, 0.27], shade: townGrime, tile: 1.2 };
  for (const x of [-0.9, 0.9]) kit.box('oak', [0.14, 2.38, 0.14], [x, 1.19, 0], { ...oak, grain: true });
  kit.shape('oak', townShared('windlass', () => new THREE.CylinderGeometry(0.08, 0.08, 1.66, 8, 1)), kit.place([0, 1.45, 0], [0, 0, Math.PI / 2]), { mapping: 'keep', tile: [1, 2], colour: oak.colour });
  for (const z of [-0.8, 0.8]) kit.beam('oak', [-1.0, 2.33, z], [1.0, 2.33, z], 0.08, 0.08, oak);
  kit.within(kit.place([0, 0, 0], [0, Math.PI / 2, 0]), () => townRoof(kit, { width: 1.6, eave: 2.38, rise: 0.75, front: 0.95, back: -0.95, overhang: 0.2, verge: 0.12, thickness: 0.06, material: 'tiles', colour: [0.85, 0.8, 0.76], timber: oak.colour, rafters: false, tile: 1.3, random }));
}

/** The market cross: three steps worn hollow, a socket stone, an octagonal shaft, its head. */
function townMarketCross(kit) {
  const stone = { mapping: 'world', tile: 2.2, colour: [0.78, 0.76, 0.72], shade: townStone };
  const pale = { ...stone, colour: [0.84, 0.82, 0.78] };
  kit.box('ashlar', [2.4, 0.3, 2.4], [0, 0.15, 0], stone);
  kit.box('ashlar', [1.75, 0.3, 1.75], [0, 0.45, 0], stone);
  kit.box('ashlar', [1.1, 0.3, 1.1], [0, 0.75, 0], stone);
  kit.box('ashlar', [0.66, 0.5, 0.66], [0, 1.15, 0], pale);
  kit.shape('ashlar', townShared('crossShaft', () => new THREE.CylinderGeometry(0.12, 0.16, 2.7, 8, 1)), kit.place([0, 2.75, 0], [0, Math.PI / 8, 0]), { mapping: 'keep', tile: [1, 1.2], colour: pale.colour, shade: townStone });
  kit.box('ashlar', [0.36, 0.18, 0.36], [0, 4.17, 0], pale);
  kit.box('ashlar', [0.16, 0.75, 0.14], [0, 4.6, 0], pale);
  kit.box('ashlar', [0.75, 0.16, 0.14], [0, 4.66, 0], pale);
}

// ---- the square -------------------------------------------------------------------

/**
 * Build the town round a square `halfX` by `halfZ` (the cobbles' edge) into
 * `place`. Four rows of houses face the square, each broken by one narrow
 * street; every street turns a few metres down, closed by a house set
 * across its end, so no view out of the square runs on to open ground. A
 * ring of plainer houses behind the rows fills the roofline between and
 * over the nearer gables; the church tower rises over the north side.
 */
export function townSquare(place, { halfX, halfZ }) {
  const kit = townKit();
  const random = townRandom(1471);
  let seed = 0;
  const lean = () => [(random() - 0.5) * 0.02, (random() - 0.5) * 0.024];
  /** A house at (x, z) turned `turn`, a little out of true. */
  const house = (x, z, turn, options) => {
    seed += 1;
    const [forward, sideways] = lean();
    kit.within(kit.place([x, 0, z], [forward, turn, sideways]), () => townHouse(kit, { seed, ...options }));
  };
  // A row of fronts along one side, from `from` to `to` along it: widths drawn and then stretched to fill exactly.
  const row = (from, to, at, { casts = true } = {}) => {
    const widths = [];
    let total = 0;
    while (total < to - from - 3.2) {
      const width = 3.4 + random() * 1.6;
      widths.push(width);
      total += width;
    }
    const k = (to - from) / total;
    let along = from;
    for (const raw of widths) {
      const width = raw * k;
      const roll = random();
      const storeys = roll < 0.45 ? 3 : 2;
      at(along + width / 2, { width: width - 0.04, storeys, broadside: width > 4.2 && random() < 0.45, casts });
      along += width;
    }
  };
  const street = 3.4;
  const fz = halfZ + 3;
  const fx = halfX + 3;
  // The streets: north at x = 2, south at x = −4, west at z = −1, east at z = 3.
  const N = 2;
  const Sx = -4;
  const W = -1;
  const E = 3;
  row(-21, N - street / 2, (x, options) => house(x, -fz, 0, options));
  row(N + street / 2, 21, (x, options) => house(x, -fz, 0, options));
  row(-21, Sx - street / 2, (x, options) => house(x, fz, Math.PI, options));
  row(Sx + street / 2, 21, (x, options) => house(x, fz, Math.PI, options));
  row(-halfZ + 0.2, W - street / 2, (z, options) => house(-fx, z, Math.PI / 2, options));
  row(W + street / 2, halfZ - 0.2, (z, options) => house(-fx, z, Math.PI / 2, options));
  row(-halfZ + 0.2, E - street / 2, (z, options) => house(fx, z, -Math.PI / 2, options));
  row(E + street / 2, halfZ - 0.2, (z, options) => house(fx, z, -Math.PI / 2, options));

  // Down each street, a house across its end, set off to one side so the street turns.
  const across = 9.5;
  const shift = 1.2;
  const endWidth = 7;
  const ends = { N: N + shift, S: Sx - shift, W: W - shift, E: E + shift };
  const end = { width: endWidth, storeys: 3, far: true, broadside: true };
  house(ends.N, -fz - across, 0, end);
  house(ends.S, fz + across, Math.PI, end);
  house(-fx - across, ends.W, Math.PI / 2, end);
  house(fx + across, ends.E, -Math.PI / 2, end);

  // Behind the rows: plainer, taller houses for the roofline, filling each side right up to the street ends and the church tower.
  const church = [-4, -halfZ - 22];
  let back = 0;
  const backdrop = (x, z, turn, width) => {
    back += 1;
    const [forward, sideways] = lean();
    kit.within(kit.place([x, 0, z], [forward, turn, sideways]), () => townBackdrop(kit, { width, depth: 7, storeys: random() < 0.6 ? 4 : 3, seed: back, broadside: random() < 0.6 }));
  };
  /** Houses along `from`..`to`, leaving out the `cuts` (intervals), each free stretch filled exactly. */
  const ring = (from, to, cuts, at) => {
    const spans = [];
    let start = from;
    for (const [a, b] of cuts) {
      if (a > start) spans.push([start, a]);
      start = Math.max(start, b);
    }
    if (to > start) spans.push([start, to]);
    for (const [a, b] of spans) {
      if (b - a < 2.5) continue;
      const count = Math.max(1, Math.round((b - a) / 5.6));
      const width = (b - a) / count;
      for (let k = 0; k < count; k += 1) at(a + (k + 0.5) * width, width - 0.05);
    }
  };
  const half = endWidth / 2;
  const reach = 7.5;
  ring(-30, 30, [[church[0] - 3.1, church[0] + 3.1], [ends.N - half, ends.N + half]], (x, width) => backdrop(x, -fz - reach, 0, width));
  ring(-30, 30, [[ends.S - half, ends.S + half]], (x, width) => backdrop(x, fz + reach, Math.PI, width));
  ring(-fz - 4, fz + 4, [[ends.W - half, ends.W + half]], (z, width) => backdrop(-fx - reach, z, Math.PI / 2, width));
  ring(-fz - 4, fz + 4, [[ends.E - half, ends.E + half]], (z, width) => backdrop(fx + reach, z, -Math.PI / 2, width));
  kit.within(kit.place([church[0], 0, church[1]]), () => townChurch(kit, random));

  // The market about the edges of the square, clear of the fighting floor.
  const stall = (x, z, turn, band, goods) => kit.within(kit.place([x, 0, z], [0, turn, 0]), () => townStall(kit, band, goods, random));
  stall(-7, -halfZ + 1.1, 0, 0, ['apple', 'pear', 'apple', 'onion']);
  stall(7.5, halfZ - 1.1, Math.PI, 2, ['cabbage', 'onion', 'turnip', 'loaf']);
  kit.within(kit.place([-halfX + 1.8, 0, halfZ - 1.9]), () => townWell(kit, random));
  kit.within(kit.place([halfX - 1.7, 0, -halfZ + 1.9]), () => townMarketCross(kit));
  const barrelTints = [[0.92, 0.86, 0.8], [0.78, 0.72, 0.66], [0.86, 0.78, 0.7]];
  [[-halfX + 0.6, -4.3], [-halfX + 0.75, -3.55], [-halfX + 1.35, -4.0]].forEach(([x, z], k) => townBarrel(kit, [x, 0, z], { turn: k * 1.3, tint: barrelTints[k] }));
  townBarrel(kit, [-halfX + 0.9, 0, -5.2], { turn: 0.2, lying: true, tint: barrelTints[1] });

  const group = new THREE.Group();
  group.name = 'town-props';
  for (const mesh of kit.meshes()) group.add(mesh);
  place.add(group);
  // For the timing harness: the last town built (hide it to weigh what it costs).
  globalThis.__townLast = group;
}
