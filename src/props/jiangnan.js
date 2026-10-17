// The water town of the wokou raid (buildJiangnan in render.js): a market
// town on the canals of Zhejiang in the 1550s, the kind the raiders came up
// the waterways to plunder. A paved square opens on a canal: whitewashed
// houses under dark grey tile roofs, their ridges turned up at the ends and
// their gables stepped up as horse-head walls (matouqiang, firewalls between
// neighbours); timber shopfronts with their shutter boards taken down; a
// humpbacked stone bridge; the canal's dark green water between granite
// embankments, steps down to it; willows over the water, camphor trees and
// bamboo over the roofs, and wooded hills behind, half lost in the mist.
//
// Drawn the way the market town is (props/town.js): one atlas texture and
// one matte material for nearly everything (the trees and the hills too:
// their cell is plain white and the vertex colour does the rest), one for the
// willow and bamboo leaves, one for the water, and the sun's shadows cast by
// plain blocks inside the front houses. The age is in the textures (lime wash
// streaked black by the rain, mossy tiles, silvered boards) and the vertex
// colour (grime up from the street, damp at the foot of every wall).

/* global THREE */

// ---- small helpers ------------------------------------------------------------------

/** A seeded generator (mulberry32). */
function jiangnanRandom(seed) {
  let state = (seed * 2654435761) >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const jiangnanClamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
const jiangnanSmooth = (a, b, x) => {
  const t = jiangnanClamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const jiangnanGrey = (value, alpha = 1) => {
  const g = Math.round(jiangnanClamp(value) * 255);
  return `rgba(${g},${g},${g},${alpha})`;
};
const JIANGNAN_ONE = [1, 1, 1];

/**
 * Where things stand (metres from the centre of the square). The canal runs
 * along x on the south side (+z): its near embankment is the square's edge,
 * the far bank's houses stand straight up out of the water. The bridge
 * crosses it at x = −6, where the default camera (from +x, −z) looks.
 */
export const JIANGNAN_PLAN = {
  canal: { near: 11.8, far: 18.6, water: -1.25 },
  bridge: { x: -6, width: 3.2 },
  west: -19.5,
  east: 19.5,
  north: -15.5,
  hills: [40, 70],
};

// ---- painting the textures -------------------------------------------------------
//
// A sheet is a colour canvas and a height canvas painted together; the
// height's relief is baked into the colour as light and shade (the sheets
// tile, and so does the relief), as in the market town.

function jiangnanSheet(size, base, seed) {
  const make = (fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = fill;
    context.fillRect(0, 0, size, size);
    return context;
  };
  const random = jiangnanRandom(seed);
  return { size, colour: make(base), height: make(jiangnanGrey(0.5)), random, rr: (a, b) => a + (b - a) * random() };
}

/** Call `draw(x, y)` at (x, y) and at each copy the wrap shows, so a stamp near an edge tiles. */
function jiangnanWrap(size, x, y, reach, draw) {
  for (const ox of [-size, 0, size]) {
    if (x + ox + reach < 0 || x + ox - reach > size) continue;
    for (const oy of [-size, 0, size]) {
      if (y + oy + reach < 0 || y + oy - reach > size) continue;
      draw(x + ox, y + oy);
    }
  }
}

/** Tileable value noise drawn over the sheet (cells across), at `alpha`, with a blend mode. */
function jiangnanCloud(context, size, random, cells, alpha, mode = 'source-over') {
  const small = document.createElement('canvas');
  small.width = small.height = cells + 1;
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
  context.drawImage(small, -step / 2, -step / 2, step * (cells + 1), step * (cells + 1));
  context.restore();
}

/** Bake the height's relief into the colour, lit from the top left; returns the colour canvas. */
function jiangnanFinish(sheet, relief) {
  const { size } = sheet;
  const raw = sheet.height.getImageData(0, 0, size, size).data;
  const height = new Float32Array(size * size);
  for (let index = 0; index < height.length; index += 1) height[index] = raw[index * 4] / 255;
  const image = sheet.colour.getImageData(0, 0, size, size);
  const data = image.data;
  const L = [-0.35, 0.6, 0.72];
  const ll = Math.hypot(...L);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const at = (dx, dy) => height[((y + dy + size) % size) * size + ((x + dx + size) % size)];
      const nx = -(at(1, 0) - at(-1, 0)) * relief;
      const ny = (at(0, 1) - at(0, -1)) * relief;
      const lit = (nx * L[0] + ny * L[1] + L[2]) / Math.hypot(nx, ny, 1) / ll;
      const shade = jiangnanClamp(lit / (L[2] / ll), 0.55, 1.3);
      const index = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) data[index + channel] = Math.min(255, data[index + channel] * shade);
    }
  }
  sheet.colour.putImageData(image, 0, 0);
  return sheet.colour.canvas;
}

const JIANGNAN_PAINTERS = {
  /** Lime wash over render, 2 m a sheet: off-white, mottled, streaked black down from the eaves by the rain, patches flaked back to the grey render. */
  wash: () => {
    const sheet = jiangnanSheet(512, '#ebe8e0', 41);
    const { size, colour, height, random, rr } = sheet;
    jiangnanCloud(colour, size, random, 6, 0.1, 'multiply');
    jiangnanCloud(colour, size, random, 24, 0.06, 'multiply');
    // Rain streaks: thin dark runs, heavier and wider in places.
    for (let index = 0; index < 70; index += 1) {
      const x = rr(0, size);
      const width = rr(2, 12);
      const top = rr(0, size);
      const length = rr(60, 340);
      jiangnanWrap(size, x, top + length / 2, length, (X, Y) => {
        const gradient = colour.createLinearGradient(0, Y - length / 2, 0, Y + length / 2);
        const dark = rr(0.05, 0.2);
        gradient.addColorStop(0, `rgba(58,60,58,${dark})`);
        gradient.addColorStop(1, 'rgba(58,60,58,0)');
        colour.fillStyle = gradient;
        colour.fillRect(X - width / 2 + rr(-1, 1), Y - length / 2, width, length);
      });
    }
    // Damp and mould: soft grey-green blotches.
    for (let index = 0; index < 18; index += 1) {
      const x = rr(0, size);
      const y = rr(0, size);
      const r = rr(20, 70);
      jiangnanWrap(size, x, y, r, (X, Y) => {
        const glow = colour.createRadialGradient(X, Y, 0, X, Y, r);
        glow.addColorStop(0, `rgba(96,104,92,${rr(0.08, 0.2)})`);
        glow.addColorStop(1, 'rgba(96,104,92,0)');
        colour.fillStyle = glow;
        colour.fillRect(X - r, Y - r, r * 2, r * 2);
      });
    }
    // The wash flaked away: the grey render beneath, a little sunk.
    for (let index = 0; index < 9; index += 1) {
      const x = rr(0, size);
      const y = rr(0, size);
      const r = rr(8, 26);
      jiangnanWrap(size, x, y, r * 1.5, (X, Y) => {
        for (const [context, fill] of [[colour, `rgba(${Math.round(rr(150, 170))},${Math.round(rr(150, 166))},${Math.round(rr(140, 152))},0.9)`], [height, jiangnanGrey(0.42)]]) {
          context.fillStyle = fill;
          context.beginPath();
          for (let k = 0; k < 9; k += 1) {
            const a = (k / 9) * Math.PI * 2;
            const reach = r * (0.6 + 0.6 * random());
            context.lineTo(X + Math.cos(a) * reach * 1.4, Y + Math.sin(a) * reach);
          }
          context.closePath();
          context.fill();
        }
      });
    }
    jiangnanCloud(height, size, random, 32, 0.25);
    return jiangnanFinish(sheet, 3);
  },

  /**
   * Chinese roof tiles, 1.5 m a sheet (the canvas top up the roof): channels
   * of concave pan tiles laid down the slope with rows of convex cover tiles
   * over the joints between them, each course's lower edge a little curl;
   * grey-black, with lichen and moss.
   */
  tiles: () => {
    const sheet = jiangnanSheet(512, '#34363a', 43);
    const { size, colour, height, random, rr } = sheet;
    const across = 8;
    const width = size / across;
    const courses = 14;
    const gauge = size / courses;
    for (let k = 0; k < across; k += 1) {
      const x0 = k * width;
      // The pan: low in the middle, dark down its channel.
      const pan = colour.createLinearGradient(x0, 0, x0 + width, 0);
      pan.addColorStop(0, '#4a4c50');
      pan.addColorStop(0.5, '#2c2e31');
      pan.addColorStop(1, '#4a4c50');
      colour.fillStyle = pan;
      colour.fillRect(x0, 0, width, size);
      const panHeight = height.createLinearGradient(x0, 0, x0 + width, 0);
      panHeight.addColorStop(0, jiangnanGrey(0.45));
      panHeight.addColorStop(0.5, jiangnanGrey(0.25));
      panHeight.addColorStop(1, jiangnanGrey(0.45));
      height.fillStyle = panHeight;
      height.fillRect(x0, 0, width, size);
      // The cover tiles over the joint at the pan's edge: a raised round.
      const c0 = x0 - width * 0.22;
      const cw = width * 0.44;
      for (const [context, stops] of [[colour, ['#2a2c2f', '#5c5f63', '#2a2c2f']], [height, [jiangnanGrey(0.5), jiangnanGrey(0.92), jiangnanGrey(0.5)]]]) {
        for (const ox of [0, size]) {
          const round = context.createLinearGradient(c0 + ox, 0, c0 + cw + ox, 0);
          round.addColorStop(0, stops[0]);
          round.addColorStop(0.45, stops[1]);
          round.addColorStop(1, stops[2]);
          context.fillStyle = round;
          context.fillRect(c0 + ox, 0, cw, size);
        }
      }
      // Each course's lower edge: a dark lip where it lies over the next.
      for (let course = 0; course < courses; course += 1) {
        const y = course * gauge + rr(-1.5, 1.5) + (k % 2) * gauge * 0.5;
        colour.fillStyle = 'rgba(16,16,18,0.55)';
        colour.fillRect(x0, y, width, 2.5);
        colour.fillStyle = 'rgba(120,122,124,0.25)';
        colour.fillRect(x0, y - 2, width, 1.5);
        height.fillStyle = jiangnanGrey(0.2, 0.7);
        height.fillRect(x0, y, width, 2);
      }
    }
    // Lichen and moss, most in the channels.
    for (let index = 0; index < 160; index += 1) {
      const x = rr(0, size);
      const y = rr(0, size);
      jiangnanWrap(size, x, y, 6, (X, Y) => {
        colour.fillStyle = random() < 0.5 ? `rgba(150,150,110,${rr(0.2, 0.45)})` : `rgba(70,88,52,${rr(0.25, 0.5)})`;
        colour.beginPath();
        colour.arc(X, Y, rr(1.2, 4.5), 0, Math.PI * 2);
        colour.fill();
      });
    }
    jiangnanCloud(colour, size, random, 5, 0.12, 'multiply');
    return jiangnanFinish(sheet, 6);
  },

  /** Boards stood on end, 1.2 m a sheet: shopfronts and shutters, dark red-brown, silvered and checked by the weather. */
  timber: () => {
    const sheet = jiangnanSheet(512, '#4a3123', 47);
    const { size, colour, height, random, rr } = sheet;
    const boards = 5;
    const width = size / boards;
    for (let k = 0; k < boards; k += 1) {
      const x0 = k * width;
      const tone = rr(0.85, 1.15);
      colour.fillStyle = `rgb(${Math.round(74 * tone)},${Math.round(49 * tone)},${Math.round(34 * tone)})`;
      colour.fillRect(x0, 0, width, size);
      // Grain: wavy lines down the board.
      for (let line = 0; line < 14; line += 1) {
        const x = x0 + rr(3, width - 3);
        const phase = rr(0, 6.3);
        colour.strokeStyle = random() < 0.5 ? 'rgba(30,18,12,0.3)' : 'rgba(120,96,76,0.18)';
        colour.lineWidth = rr(0.6, 1.6);
        colour.beginPath();
        for (let y = -4; y <= size + 4; y += 8) colour.lineTo(x + 2.2 * Math.sin((y / size) * Math.PI * 4 + phase), y);
        colour.stroke();
      }
      // The joint between boards.
      colour.fillStyle = 'rgba(14,8,6,0.8)';
      colour.fillRect(x0, 0, 2.5, size);
      height.fillStyle = jiangnanGrey(0.2);
      height.fillRect(x0, 0, 2.5, size);
    }
    // Weathered grey where the sun and rain reach.
    jiangnanCloud(colour, size, random, 4, 0.18, 'screen');
    jiangnanCloud(height, size, random, 40, 0.2);
    return jiangnanFinish(sheet, 3);
  },

  /** Granite blocks in courses, 1.6 m a sheet: grey, speckled, moss in the joints. */
  stone: () => {
    const sheet = jiangnanSheet(512, '#4c5048', 53);
    const { size, colour, height, random, rr } = sheet;
    const rows = 4;
    const rowHeight = size / rows;
    for (let row = 0; row < rows; row += 1) {
      let x = rr(0, 100);
      const end = x + size;
      while (x < end - 40) {
        const length = Math.min(end - x, rr(150, 300));
        const tone = rr(118, 158);
        const y = row * rowHeight;
        jiangnanWrap(size, x + length / 2, y + rowHeight / 2, length, (X, Y) => {
          colour.fillStyle = `rgb(${Math.round(tone)},${Math.round(tone * 0.99)},${Math.round(tone * 0.94)})`;
          colour.fillRect(X - length / 2 + 2, Y - rowHeight / 2 + 2, length - 4, rowHeight - 4);
          const face = height.createLinearGradient(0, Y - rowHeight / 2, 0, Y + rowHeight / 2);
          face.addColorStop(0, jiangnanGrey(0.62));
          face.addColorStop(0.1, jiangnanGrey(0.8));
          face.addColorStop(0.9, jiangnanGrey(0.78));
          face.addColorStop(1, jiangnanGrey(0.6));
          height.fillStyle = face;
          height.fillRect(X - length / 2 + 2, Y - rowHeight / 2 + 2, length - 4, rowHeight - 4);
        });
        x += length;
      }
    }
    // Speckle, stains, and moss along the joints.
    for (let index = 0; index < 2500; index += 1) {
      colour.fillStyle = random() < 0.5 ? 'rgba(30,30,30,0.25)' : 'rgba(230,228,220,0.2)';
      colour.fillRect(rr(0, size), rr(0, size), 1.5, 1.5);
    }
    for (let index = 0; index < 120; index += 1) {
      const x = rr(0, size);
      const y = Math.round(rr(0, rows)) * rowHeight + rr(-4, 4);
      jiangnanWrap(size, x, y, 12, (X, Y) => {
        colour.fillStyle = `rgba(${Math.round(rr(60, 90))},${Math.round(rr(84, 110))},${Math.round(rr(44, 60))},${rr(0.3, 0.6)})`;
        colour.beginPath();
        colour.ellipse(X, Y, rr(4, 12), rr(2, 5), 0, 0, Math.PI * 2);
        colour.fill();
      });
    }
    jiangnanCloud(colour, size, random, 5, 0.15, 'multiply');
    return jiangnanFinish(sheet, 4);
  },

  /** A lattice window, 1 m a sheet: dark wooden bars in a square-and-diamond pattern over oiled paper. */
  lattice: () => {
    const sheet = jiangnanSheet(512, '#c9bfa6', 59);
    const { size, colour, height, random } = sheet;
    jiangnanCloud(colour, size, random, 6, 0.15, 'multiply');
    const bars = (context, fill, width) => {
      context.strokeStyle = fill;
      context.lineWidth = width;
      context.beginPath();
      const step = size / 8;
      for (let k = 0; k <= 8; k += 1) {
        context.moveTo(k * step, 0);
        context.lineTo(k * step, size);
        context.moveTo(0, k * step);
        context.lineTo(size, k * step);
      }
      // Diamonds in every other square.
      for (let i = 0; i < 8; i += 1) {
        for (let j = 0; j < 8; j += 1) {
          if ((i + j) % 2) continue;
          const cx = (i + 0.5) * step;
          const cy = (j + 0.5) * step;
          context.moveTo(cx, cy - step / 2);
          context.lineTo(cx + step / 2, cy);
          context.lineTo(cx, cy + step / 2);
          context.lineTo(cx - step / 2, cy);
          context.closePath();
        }
      }
      context.stroke();
    };
    bars(colour, '#33241a', 7);
    bars(height, jiangnanGrey(0.85), 7);
    return jiangnanFinish(sheet, 4);
  },

  /** Plain white: trees, hills, lanterns, the dark of openings — the vertex colour is the colour. */
  white: () => jiangnanSheet(64, '#ffffff', 61).colour.canvas,
};

// ---- the atlas and the materials -----------------------------------------------------
//
// One 2048 × 1024 atlas, 4 by 2 cells of 512 px, each sheet painted 480 px
// with a 16 px border of its own wrap: a piece's UVs run on in metres and the
// shader takes them modulo one into its cell (carried per vertex), sampling
// with the unwrapped gradients so the mip level is right across the seams.

const JIANGNAN_CELLS = ['wash', 'tiles', 'timber', 'stone', 'lattice', 'white'];

let jiangnanAtlasTexture = null;
function jiangnanAtlas() {
  if (jiangnanAtlasTexture) return jiangnanAtlasTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const g = canvas.getContext('2d');
  JIANGNAN_CELLS.forEach((name, index) => {
    const sheet = JIANGNAN_PAINTERS[name]();
    const x = (index % 4) * 512;
    const y = Math.floor(index / 4) * 512;
    g.save();
    g.beginPath();
    g.rect(x, y, 512, 512);
    g.clip();
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) g.drawImage(sheet, x + 16 + dx * 480, y + 16 + dy * 480, 480, 480);
    g.restore();
  });
  jiangnanAtlasTexture = new THREE.CanvasTexture(canvas);
  jiangnanAtlasTexture.anisotropy = 8;
  return jiangnanAtlasTexture;
}

/** A cell's corner in the atlas, in cells from the bottom left (canvas row 0 is the top). */
function jiangnanCellOf(name) {
  const index = JIANGNAN_CELLS.indexOf(name);
  return [index % 4, 1 - Math.floor(index / 4)];
}

let jiangnanFabricMaterial = null;
function jiangnanFabric() {
  if (jiangnanFabricMaterial) return jiangnanFabricMaterial;
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, map: jiangnanAtlas(), vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute vec2 atlasCell;\nvarying vec2 vAtlasCell;\n${shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vAtlasCell = atlasCell;')}`;
    shader.fragmentShader = `varying vec2 vAtlasCell;\n${shader.fragmentShader.replace('#include <map_fragment>', `
  vec2 atlasUv = (floor(vAtlasCell + 0.5) * 512.0 + 16.0 + fract(vUv) * 480.0) / vec2(2048.0, 1024.0);
  vec4 texelColor = textureGrad(map, atlasUv, dFdx(vUv) * vec2(480.0 / 2048.0, 480.0 / 1024.0), dFdy(vUv) * vec2(480.0 / 2048.0, 480.0 / 1024.0));
  texelColor = mapTexelToLinear(texelColor);
  diffuseColor *= texelColor;`)}`;
  };
  material.customProgramCacheKey = () => 'jiangnan-atlas';
  jiangnanFabricMaterial = material;
  return material;
}

// ---- merging --------------------------------------------------------------------
//
// A batch gathers pieces for one material, each baked through its matrix
// into the place's space with its UVs (in metres over `tile`, projected on
// the axis the face looks along; 'keep' keeps the geometry's own), vertex
// colour (`colour`, then `shade(c, p, n)` in the place's space) and atlas
// cell. `warp(l)` bends the unit piece before it is placed.

const jiangnanFlats = new WeakMap();
function jiangnanFlat(geometry) {
  let flat = jiangnanFlats.get(geometry);
  if (!flat) {
    flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!flat.attributes.normal) flat.computeVertexNormals();
    jiangnanFlats.set(geometry, flat);
  }
  return flat;
}

function jiangnanBatch() {
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
  const facing = [0, 0, 0];
  return {
    add(geometry, matrix, { size = JIANGNAN_ONE, mapping = 'box', tile = 1, offset = [0, 0], colour: tint = JIANGNAN_ONE, shade = null, cell = [0, 0], warp = null } = {}) {
      const source = jiangnanFlat(geometry);
      const P = source.attributes.position;
      const N = source.attributes.normal;
      const T = source.attributes.uv;
      normalMatrix.getNormalMatrix(matrix);
      const tu = Array.isArray(tile) ? tile[0] : tile;
      const tv = Array.isArray(tile) ? tile[1] : tile;
      for (let index = 0; index < P.count; index += 1) {
        l.fromBufferAttribute(P, index);
        if (warp) warp(l);
        p.copy(l).applyMatrix4(matrix);
        n.fromBufferAttribute(N, index);
        facing[0] = Math.abs(n.x);
        facing[1] = Math.abs(n.y);
        facing[2] = Math.abs(n.z);
        n.applyMatrix3(normalMatrix).normalize();
        position.push(p.x, p.y, p.z);
        normal.push(n.x, n.y, n.z);
        cells.push(cell[0], cell[1]);
        let u;
        let v;
        if (mapping === 'keep' && T) {
          u = T.getX(index) * tu;
          v = T.getY(index) * tv;
        } else {
          local[0] = l.x * size[0];
          local[1] = l.y * size[1];
          local[2] = l.z * size[2];
          const axis = facing[0] >= facing[1] && facing[0] >= facing[2] ? 0 : facing[1] >= facing[2] ? 1 : 2;
          const [a, b] = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];
          u = local[a] / tu;
          v = local[b] / tv;
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

let jiangnanUnitBox = null;
const jiangnanBox = () => (jiangnanUnitBox ??= new THREE.BoxGeometry(1, 1, 1));

/**
 * The builder's kit: a batch per material ('fabric' the atlas, 'leaves' the
 * willow and bamboo cards, 'shadow' the shadow blocks), a current parent
 * transform (a house's place and turn), and ways to put pieces down in it by
 * the name of their surface (an atlas cell, 'leaves' or 'shadow').
 */
function jiangnanKit() {
  const batches = { fabric: jiangnanBatch(), leaves: jiangnanBatch(), shadow: jiangnanBatch() };
  const put = (name, geometry, matrix, options) => {
    if (name === 'leaves' || name === 'shadow') batches[name].add(geometry, matrix, { ...options, mapping: 'keep' });
    else batches.fabric.add(geometry, matrix, { ...options, cell: jiangnanCellOf(name) });
  };
  let parent = new THREE.Matrix4();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const at = new THREE.Vector3();
  const scale = new THREE.Vector3();
  return {
    batches,
    within(local, build) {
      const saved = parent;
      parent = saved.clone().multiply(local);
      build();
      parent = saved;
    },
    /** A matrix: at `position`, turned by Euler `rotation` (order YXZ), scaled. */
    place(position, rotation = [0, 0, 0], size = JIANGNAN_ONE) {
      euler.set(rotation[0], rotation[1], rotation[2], 'YXZ');
      return new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(euler), new THREE.Vector3(...size));
    },
    /** A box `size` big centred at `position`, turned by `options.rotation`. */
    box(name, size, position, options = {}) {
      euler.set(...(options.rotation ?? [0, 0, 0]), 'YXZ');
      quaternion.setFromEuler(euler);
      matrix.compose(at.set(...position), quaternion, scale.set(...size)).premultiply(parent);
      put(name, options.geometry ?? jiangnanBox(), matrix, { size, ...options });
    },
    /** A box on its own axes ex, ey, ez (right-handed), centred at `centre`. */
    oriented(name, centre, ex, ey, ez, size, options = {}) {
      matrix.makeBasis(ex, ey, ez).scale(scale.set(...size)).setPosition(centre).premultiply(parent);
      put(name, options.geometry ?? jiangnanBox(), matrix, { size, ...options });
    },
    /** Any geometry through a local matrix. */
    shape(name, geometry, local, options = {}) {
      matrix.copy(parent).multiply(local);
      put(name, geometry, matrix, options);
    },
  };
}

// ---- weathering -------------------------------------------------------------------

/** A value 0..1 that holds still over half a metre: blotches that do not line up with the pieces. */
function jiangnanHash(p) {
  const h = Math.sin(Math.round(p.x * 2) * 127.1 + Math.round(p.y * 2) * 311.7 + Math.round(p.z * 2) * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

/** The foot of a wall: damp and green-black up to a metre, from the wet ground and the canal. */
function jiangnanDamp(c, p) {
  const k = jiangnanSmooth(-0.2, 1.4, p.y);
  c[0] *= 0.55 + 0.45 * k;
  c[1] *= 0.6 + 0.4 * k;
  c[2] *= 0.52 + 0.48 * k;
}

/** Lime wash: the damp at its foot, and blotches of older, greyer wash. */
function jiangnanWashShade(c, p) {
  jiangnanDamp(c, p);
  const k = 1 - 0.16 * jiangnanHash(p) ** 2;
  c[0] *= k;
  c[1] *= k;
  c[2] *= k * 0.99;
}

// ---- shared geometry ----------------------------------------------------------------

const jiangnanCache = new Map();
function jiangnanShared(key, make) {
  if (!jiangnanCache.has(key)) jiangnanCache.set(key, make());
  return jiangnanCache.get(key);
}

/** A unit triangular prism: the triangle in (z, y), base z −0.5..0.5 at y 0, apex at y 1; x −0.5..0.5. A gable's wall. */
function jiangnanPrism() {
  return jiangnanShared('prism', () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, 0);
    shape.lineTo(0.5, 0);
    shape.lineTo(0, 1);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
    geometry.translate(0, 0, -0.5);
    geometry.rotateY(Math.PI / 2);
    return geometry;
  });
}

// ---- roofs and walls ----------------------------------------------------------------

/**
 * A two-pitch roof over a house `width` wide and `depth` deep (front at
 * z = 0, back at −depth), the ridge along x: two tiled slabs out past the
 * walls by `overhang` at the eaves and `verge` at the gables, the ridge a
 * thick roll of tiles on edge whose ends turn up (the swept ridge ends of the
 * south). `rise` is the ridge above the eaves at `eave`.
 */
function jiangnanRoof(kit, { width, depth, eave, rise, overhang = 0.6, verge = 0.3, thickness = 0.14, tint = JIANGNAN_ONE, proxy = false, random = Math.random }) {
  const half = depth / 2;
  const angle = Math.atan2(rise, half);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const tan = Math.tan(angle);
  const length = (half + overhang) / cos + thickness * tan * 0.5;
  const span = width + verge * 2;
  for (const s of [1, -1]) {
    const up = new THREE.Vector3(0, sin, -s * cos);
    const out = new THREE.Vector3(0, cos, s * sin);
    const ex = new THREE.Vector3(-s, 0, 0);
    const eaveAt = new THREE.Vector3(0, eave - overhang * tan, -half + s * (half + overhang));
    const centre = eaveAt.addScaledVector(up, length / 2).addScaledVector(out, thickness / 2);
    if (proxy) {
      kit.oriented('shadow', centre, ex, out, up, [span, thickness, length]);
      continue;
    }
    kit.oriented('tiles', centre, ex, out, up, [span, thickness, length], { tile: 1.5, colour: tint, offset: [random(), random()] });
    // The eave's edge: a row of drip tiles, a little darker.
    const edge = new THREE.Vector3(0, eave - overhang * tan - 0.02, -half + s * (half + overhang + 0.02));
    kit.box('tiles', [span, 0.1, 0.08], [edge.x, edge.y, edge.z], { colour: tint.map((value) => value * 0.7), tile: 1.5 });
  }
  if (proxy) return;
  // The ridge: tiles stood on edge in a thick roll, capped; the ends sweep up.
  const top = eave + rise + thickness / cos;
  kit.box('tiles', [span + 0.1, 0.34, 0.3], [0, top + 0.08, -half], { colour: tint.map((value) => value * 0.85), tile: [0.4, 1.5] });
  kit.box('wash', [span - 0.2, 0.08, 0.32], [0, top - 0.06, -half], { colour: [0.9, 0.9, 0.88] });
  for (const side of [1, -1]) {
    const x = side * (span / 2 + 0.05);
    kit.box('tiles', [0.5, 0.22, 0.26], [x + side * 0.12, top + 0.22, -half], { rotation: [0, 0, side * 0.45], colour: tint.map((value) => value * 0.8), tile: 0.6 });
    kit.box('tiles', [0.36, 0.14, 0.2], [x + side * 0.38, top + 0.46, -half], { rotation: [0, 0, side * 0.95], colour: tint.map((value) => value * 0.8), tile: 0.6 });
  }
}

/**
 * The horse-head walls at each gable end: the side wall carried up past the
 * roof in steps, each step capped with a little tiled roof whose end lifts
 * like a horse's head. Three steps: the middle over the ridge, the outer two
 * over the slopes, each clear of the roof beneath it.
 */
function jiangnanHorseWalls(kit, { width, depth, eave, rise, tint = JIANGNAN_ONE, jitter = 0 }) {
  const tiers = [
    { from: 0.35 + jitter, to: -depth * 0.3, top: eave + rise * 0.6 + 0.45 },
    { from: -depth * 0.3, to: -depth * 0.7, top: eave + rise + 0.75 },
    { from: -depth * 0.7, to: -depth - 0.35 - jitter, top: eave + rise * 0.6 + 0.45 },
  ];
  for (const side of [1, -1]) {
    const x = side * (width / 2 + 0.02);
    for (const [index, tier] of tiers.entries()) {
      const length = tier.from - tier.to;
      const z = (tier.from + tier.to) / 2;
      kit.box('wash', [0.32, tier.top, length], [x, tier.top / 2, z], { tile: 2, shade: jiangnanWashShade, offset: [index * 0.3, side * 0.2] });
      // The coping: a tiny two-pitch roof of tiles on a dark band.
      kit.box('wash', [0.4, 0.1, length + 0.06], [x, tier.top + 0.02, z], { colour: [0.32, 0.33, 0.34] });
      for (const s of [1, -1]) kit.box('tiles', [0.34, 0.06, length + 0.2], [x + s * 0.12, tier.top + 0.12, z], { rotation: [0, 0, -s * 0.5], colour: tint, tile: 1.5 });
      kit.box('tiles', [0.12, 0.12, length + 0.24], [x, tier.top + 0.2, z], { colour: tint.map((value) => value * 0.8), tile: 1.5 });
      // The horse's head at the step's outer end (toward the front or back): the coping lifted.
      const ends = index === 1 ? [] : [index === 0 ? tier.from : tier.to];
      for (const end of ends) {
        const out = index === 0 ? 1 : -1;
        kit.box('wash', [0.4, 0.34, 0.5], [x, tier.top + 0.12, end - out * 0.15], { colour: [0.32, 0.33, 0.34] });
        kit.box('tiles', [0.3, 0.12, 0.6], [x, tier.top + 0.34, end + out * 0.02], { rotation: [out * 0.45, 0, 0], colour: tint.map((value) => value * 0.8), tile: 0.6 });
      }
    }
  }
}

// ---- the houses -------------------------------------------------------------------

const JIANGNAN_WASHES = [[1, 1, 0.99], [0.97, 0.96, 0.93], [0.93, 0.93, 0.9], [1, 0.98, 0.95], [0.9, 0.9, 0.88]];
const JIANGNAN_TILE_TINTS = [[1, 1, 1], [0.9, 0.9, 0.92], [1.08, 1.06, 1.04], [0.85, 0.86, 0.84]];
const JIANGNAN_WOODS = [[1, 1, 1], [0.85, 0.8, 0.78], [1.12, 1.02, 0.95], [0.75, 0.72, 0.7]];
const JIANGNAN_DARK = [0.06, 0.05, 0.045];
const JIANGNAN_RED = [0.78, 0.13, 0.08];

/** A red paper lantern hung under the eaves, its top and bottom bound in black. */
function jiangnanLantern(kit, x, y, z) {
  const ball = jiangnanShared('lantern', () => new THREE.SphereGeometry(1, 10, 6));
  kit.shape('white', ball, kit.place([x, y, z], [0, 0, 0], [0.2, 0.26, 0.2]), { colour: JIANGNAN_RED, shade: (c, p, n) => {
    const glow = 0.8 + 0.25 * Math.max(0, n.y);
    c[0] *= glow;
    c[1] *= glow;
    c[2] *= glow;
  } });
  kit.box('white', [0.18, 0.05, 0.18], [x, y + 0.26, z], { colour: JIANGNAN_DARK });
  kit.box('white', [0.18, 0.05, 0.18], [x, y - 0.26, z], { colour: JIANGNAN_DARK });
  kit.box('white', [0.02, 0.3, 0.02], [x, y + 0.42, z], { colour: JIANGNAN_DARK });
  kit.box('white', [0.04, 0.16, 0.04], [x, y - 0.36, z], { colour: [0.85, 0.7, 0.2] });
}

/**
 * A house in its own frame: front at z = 0 facing +z, `width` along x
 * centred, `depth` back. One or two storeys of whitewashed walls on a stone
 * plinth, a tiled roof with its ridge along the street, horse-head walls or
 * plain gables at the ends. In front: a shop's timber front with the shutter
 * boards half taken down (`shop`), or a house door in a stone frame; upstairs
 * a timber front of lattice windows, or lattice windows in the wash, under a
 * pent roof of tiles. `water` stands it on a granite footing in the canal;
 * `far` leaves out the small things; `casts` adds its shadow blocks.
 */
function jiangnanHouse(kit, { width: w, depth: d = 7, storeys = 2, seed = 1, shop = false, horse = true, water = false, far = false, casts = false }) {
  const random = jiangnanRandom(seed * 7919 + 13);
  const rr = (a, b) => a + (b - a) * random();
  const pick = (list) => list[Math.floor(random() * list.length)];
  const wash = pick(JIANGNAN_WASHES);
  const tiles = pick(JIANGNAN_TILE_TINTS);
  const wood = pick(JIANGNAN_WOODS);
  const ground = 3.3;
  // A few centimetres' difference between neighbours, so their walls and ridges never lie in one plane.
  const eave = (storeys === 1 ? 3.6 : ground + 2.9) + rr(-0.06, 0.06);
  const rise = d * 0.27;
  const offset = [random(), random()];
  const washShade = (c, p) => {
    jiangnanWashShade(c, p);
  };
  // The walls and their plinth (in the canal, a granite footing down into the water).
  kit.box('wash', [w, eave, d], [0, eave / 2, -d / 2], { colour: wash, tile: 2, offset, shade: washShade });
  if (water) kit.box('stone', [w + 0.06, 2.8, d + 0.06], [0, -1.15, -d / 2], { tile: 1.6, colour: [0.8, 0.82, 0.78], shade: jiangnanDamp, offset });
  kit.box('stone', [w + 0.04, 0.45, d + 0.04], [0, 0.2, -d / 2], { tile: 1.6, colour: [0.82, 0.82, 0.8], offset });
  jiangnanRoof(kit, { width: w, depth: d, eave, rise, verge: horse ? 0.05 : 0.35, overhang: storeys === 1 ? 0.8 : 0.6, tint: tiles, random });
  if (horse) jiangnanHorseWalls(kit, { width: w, depth: d, eave, rise, tint: tiles, jitter: rr(-0.05, 0.05) });
  else for (const side of [1, -1]) kit.box('wash', [0.3, rise, d], [side * (w / 2 - 0.15), eave, -d / 2], { geometry: jiangnanPrism(), colour: wash, tile: 2, shade: washShade });
  if (casts) {
    kit.box('shadow', [w, eave, d], [0, eave / 2, -d / 2]);
    jiangnanRoof(kit, { width: w, depth: d, eave, rise, verge: 0, overhang: 0.4, proxy: true });
  }
  if (far) {
    // Seen only across the canal or over the roofs: a dark window or two.
    for (let k = 0; k < Math.max(1, Math.floor(w / 3)); k += 1) {
      const x = (k + 0.5 - Math.max(1, Math.floor(w / 3)) / 2) * 2.6;
      if (storeys === 2) kit.box('lattice', [1.1, 0.9, 0.05], [x, ground + 1.4, 0.03], { colour: [0.75, 0.72, 0.68] });
      kit.box('white', [0.9, 1.1, 0.04], [x + rr(-0.3, 0.3), 1.5, 0.03], { colour: JIANGNAN_DARK });
    }
    return;
  }
  // The ground storey's front.
  if (shop) {
    // A timber front the width of the shop, the shutters stacked aside: one bay open and dark.
    kit.box('timber', [w - 0.5, ground - 0.25, 0.1], [0, ground / 2 + 0.05, 0.05], { colour: wood, tile: 1.2, offset });
    const openWidth = Math.min(w - 1.2, rr(1.6, 2.6));
    const openAt = rr(-1, 1) * (w - 1.2 - openWidth) / 2;
    kit.box('white', [openWidth, ground - 0.75, 0.04], [openAt, (ground - 0.75) / 2 + 0.25, 0.12], { colour: JIANGNAN_DARK });
    kit.box('stone', [w - 0.4, 0.18, 0.5], [0, 0.09, 0.3], { tile: 1.6, colour: [0.85, 0.85, 0.82] });
    // Shutter boards leaning against the wall beside the opening.
    const board = openAt + (openAt > 0 ? -1 : 1) * (openWidth / 2 + 0.5);
    for (let k = 0; k < 3; k += 1) kit.box('timber', [0.32, ground - 0.9, 0.04], [board + k * 0.08, (ground - 0.9) / 2 + 0.2, 0.28 + k * 0.05], { rotation: [-0.12, 0, 0], colour: wood.map((value) => value * (0.9 + k * 0.05)), tile: 1.2 });
    // The head beam and the posts.
    kit.box('timber', [w - 0.3, 0.22, 0.18], [0, ground - 0.1, 0.1], { colour: wood.map((value) => value * 0.8), tile: 1.2 });
    for (const side of [1, -1]) kit.box('timber', [0.2, ground, 0.18], [side * (w / 2 - 0.25), ground / 2, 0.1], { colour: wood.map((value) => value * 0.8), tile: 1.2 });
    // A signboard hung from the beam, and a pair of red lanterns.
    if (random() < 0.6) kit.box('timber', [0.42, 1.3, 0.05], [-openAt * 0.3 + (random() < 0.5 ? -1 : 1) * (w / 2 - 0.7), ground - 1.0, 0.32], { colour: [0.55, 0.42, 0.36] });
    if (random() < 0.55) for (const side of [1, -1]) jiangnanLantern(kit, side * Math.min(1.6, w / 2 - 0.6), ground - 0.45, storeys === 1 ? 0.55 : 0.5);
  } else {
    // A house door: double leaves of timber in a stone frame, a step before it; a lattice window beside.
    const doorAt = rr(-0.25, 0.25) * w;
    kit.box('stone', [1.7, 2.65, 0.06], [doorAt, 1.32, 0.03], { tile: 1.6, colour: [0.86, 0.86, 0.83] });
    kit.box('timber', [1.3, 2.3, 0.08], [doorAt, 1.15, 0.06], { colour: wood.map((value) => value * 0.75), tile: 1.2 });
    kit.box('stone', [1.9, 0.16, 0.45], [doorAt, 0.08, 0.25], { tile: 1.6 });
    if (w > 4) kit.box('lattice', [1.0, 0.9, 0.06], [doorAt > 0 ? doorAt - 1.7 : doorAt + 1.7, 1.75, 0.04], { colour: [0.8, 0.77, 0.72] });
  }
  if (storeys === 2) {
    // The pent roof between the storeys.
    const pent = 0.85;
    const slope = 0.42;
    kit.box('tiles', [w + 0.1, 0.1, pent / Math.cos(slope)], [0, ground + 0.15, pent / 2], { rotation: [slope, 0, 0], colour: tiles, tile: 1.5, offset });
    kit.box('tiles', [w + 0.1, 0.08, 0.08], [0, ground + 0.15 - (pent / 2) * Math.tan(slope) - 0.02, pent + 0.02], { colour: tiles.map((value) => value * 0.7) });
    if (shop || random() < 0.4) {
      // Upstairs a timber front of lattice windows.
      kit.box('timber', [w - 0.3, 2.4, 0.08], [0, ground + 1.55, 0.04], { colour: wood, tile: 1.2, offset });
      const bays = Math.max(2, Math.round(w / 1.3));
      for (let k = 0; k < bays; k += 1) {
        const x = (k + 0.5 - bays / 2) * ((w - 0.6) / bays);
        kit.box('lattice', [(w - 0.6) / bays - 0.16, 1.1, 0.04], [x, ground + 1.75, 0.09], { colour: [0.85, 0.82, 0.76] });
      }
    } else {
      for (const x of w > 4.2 ? [-w * 0.24, w * 0.24] : [0]) {
        kit.box('timber', [1.3, 1.1, 0.06], [x, ground + 1.6, 0.03], { colour: wood.map((value) => value * 0.7), tile: 1.2 });
        kit.box('lattice', [1.1, 0.9, 0.04], [x, ground + 1.6, 0.07], { colour: [0.85, 0.82, 0.76] });
      }
    }
  }
  // In the canal, steps down from the door to the water.
  if (water && random() < 0.35) {
    for (let k = 0; k < 6; k += 1) kit.box('stone', [1.2, 0.25, 0.7], [rr(-0.2, 0.2) + w * 0.2, -0.1 - k * 0.25, 0.35 + k * 0.0], { tile: 1.6, colour: [0.78, 0.8, 0.76], shade: jiangnanDamp });
  }
}

// ---- the bridge -------------------------------------------------------------------

/**
 * A humpbacked stone bridge of one round arch over the canal, its span along
 * z: the body (an arch cut through a block whose top is the deck's curve),
 * steps up the deck, low parapets of granite slabs, and the arch's voussoirs
 * picked out round the opening.
 */
function jiangnanBridge(kit, { x, width, from, to, water }) {
  const span = to - from;
  const mid = (from + to) / 2;
  const crown = 3.0;
  const archRadius = 2.9;
  const archSpring = water + 0.4;
  // The deck's height along the span (s from −span/2 to span/2): a smooth hump.
  const deck = (s) => crown * Math.cos(((s / (span / 2)) * Math.PI) / 2) ** 0.8;
  const shape = new THREE.Shape();
  const steps = 24;
  shape.moveTo(-span / 2, water - 0.6);
  for (let k = 0; k <= steps; k += 1) {
    const s = -span / 2 + (k / steps) * span;
    shape.lineTo(s, Math.max(0, deck(s)));
  }
  shape.lineTo(span / 2, water - 0.6);
  shape.lineTo(archRadius, water - 0.6);
  shape.lineTo(archRadius, archSpring);
  shape.absarc(0, archSpring, archRadius, 0, Math.PI, false);
  shape.lineTo(-archRadius, water - 0.6);
  shape.closePath();
  const body = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 16 });
  body.translate(0, 0, -width / 2);
  // The shape's x runs along the span (world z), its extrusion across (world x).
  kit.shape('stone', body, kit.place([x, 0, mid], [0, -Math.PI / 2, 0]), { tile: 1.6, colour: [0.86, 0.87, 0.84], shade: jiangnanDamp });
  // Steps up the deck: a granite tread every 0.42 m.
  const treads = Math.floor(span / 0.42);
  for (let k = 0; k < treads; k += 1) {
    const s = -span / 2 + (k + 0.5) * (span / treads);
    const y = Math.max(0, deck(s));
    kit.box('stone', [width - 0.5, 0.12, span / treads + 0.02], [x, y + 0.03, mid + s], { tile: 1.6, colour: [0.92, 0.92, 0.9] });
  }
  // Parapets: slabs following the hump, on short posts.
  const posts = 9;
  for (const side of [1, -1]) {
    let last = null;
    for (let k = 0; k <= posts; k += 1) {
      const s = -span / 2 + 0.4 + (k / posts) * (span - 0.8);
      const y = Math.max(0, deck(s));
      const at = [x + side * (width / 2 - 0.15), y, mid + s];
      kit.box('stone', [0.22, 0.85, 0.22], [at[0], y + 0.42, at[2]], { tile: 1.6 });
      if (last) {
        const dz = at[2] - last[2];
        const dy = at[1] - last[1];
        kit.box('stone', [0.16, 0.5, Math.hypot(dz, dy)], [at[0], (at[1] + last[1]) / 2 + 0.45, (at[2] + last[2]) / 2], { rotation: [-Math.atan2(dy, dz), 0, 0], tile: 1.6, colour: [0.9, 0.9, 0.86] });
      }
      last = at;
    }
  }
  // The voussoirs: a ring of darker stones round the arch on each face.
  const ring = 17;
  for (const side of [1, -1]) {
    for (let k = 0; k < ring; k += 1) {
      const a = ((k + 0.5) / ring) * Math.PI;
      const r = archRadius + 0.22;
      kit.box('stone', [0.08, 0.44, 0.52], [x + side * (width / 2 + 0.02), archSpring + Math.sin(a) * r, mid - Math.cos(a) * r], { rotation: [-(a - Math.PI / 2), 0, 0], tile: 1.6, colour: [0.72, 0.73, 0.7] });
    }
  }
}

// ---- trees -------------------------------------------------------------------------

/** Foliage: the leaf colour darker underneath and inside, a little lighter on top; a little variation. */
function jiangnanLeafShade(centre, radius) {
  return (c, p, n) => {
    const up = (p.y - centre.y) / radius;
    const k = (0.62 + 0.3 * jiangnanSmooth(-1, 1, up)) * (0.85 + 0.25 * Math.max(0, n.y)) * (0.92 + 0.16 * jiangnanHash(p));
    c[0] *= k;
    c[1] *= k;
    c[2] *= k;
  };
}

/** A camphor tree: a short thick trunk, a few limbs, and a great rounded crown of dense clumps. */
function jiangnanCamphor(kit, x, z, { scale = 1, seed = 1 } = {}) {
  const random = jiangnanRandom(seed * 31 + 5);
  const rr = (a, b) => a + (b - a) * random();
  const trunk = jiangnanShared('trunk', () => new THREE.CylinderGeometry(0.7, 1, 1, 7));
  const bark = [0.32, 0.27, 0.22];
  kit.shape('white', trunk, kit.place([x, 1.8 * scale, z], [0, 0, rr(-0.06, 0.06)], [0.45 * scale, 3.6 * scale, 0.45 * scale]), { colour: bark });
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI * 2 + rr(0, 1);
    kit.shape('white', trunk, kit.place([x + Math.cos(a) * 1.0 * scale, 4.1 * scale, z + Math.sin(a) * 1.0 * scale], [0, -a, 0.75], [0.2 * scale, 2.6 * scale, 0.2 * scale]), { colour: bark });
  }
  const clump = jiangnanShared('clump', () => new THREE.IcosahedronGeometry(1, 1));
  const leaf = [0.24 + rr(-0.03, 0.03), 0.36 + rr(-0.03, 0.04), 0.17];
  const centre = new THREE.Vector3(x, 6.4 * scale, z);
  const radius = 3.6 * scale;
  for (let k = 0; k < 9; k += 1) {
    const a = rr(0, Math.PI * 2);
    const out = k === 0 ? 0 : rr(1.2, 2.6) * scale;
    const r = rr(1.7, 2.5) * scale;
    const y = centre.y + (k === 0 ? 1 : rr(-1.2, 1.4) * scale);
    const phase = rr(0, 6);
    kit.shape('white', clump, kit.place([x + Math.cos(a) * out, y, z + Math.sin(a) * out], [0, rr(0, 3), 0], [r, r * 0.82, r]), {
      colour: leaf,
      shade: jiangnanLeafShade(centre, radius),
      warp: (l) => l.multiplyScalar(1 + 0.12 * Math.sin(l.x * 5 + phase) * Math.sin(l.z * 4 + l.y * 3)),
    });
  }
}

/** A clump of bamboo: tall green culms leaning out a little, sprays of narrow leaves on cards near their tops. */
function jiangnanBamboo(kit, x, z, { count = 18, spread = 1.6, seed = 1 } = {}) {
  const random = jiangnanRandom(seed * 53 + 7);
  const rr = (a, b) => a + (b - a) * random();
  const culm = jiangnanShared('culm', () => new THREE.CylinderGeometry(0.75, 1, 1, 5));
  const card = jiangnanShared('card', () => new THREE.PlaneGeometry(1, 1));
  for (let k = 0; k < count; k += 1) {
    const a = rr(0, Math.PI * 2);
    const r = Math.sqrt(random()) * spread;
    const height = rr(6, 9.5);
    const lean = rr(0.02, 0.12);
    const bx = x + Math.cos(a) * r;
    const bz = z + Math.sin(a) * r;
    const green = [0.36 + rr(-0.04, 0.08), 0.5 + rr(-0.05, 0.05), 0.2];
    kit.shape('white', culm, kit.place([bx + Math.cos(a) * lean * height / 2, height / 2, bz + Math.sin(a) * lean * height / 2], [0, -a, lean], [0.05, height, 0.05]), { colour: green });
    for (let leaf = 0; leaf < 4; leaf += 1) {
      const up = rr(0.55, 1);
      const turn = rr(0, Math.PI);
      kit.shape('leaves', card, kit.place([bx + Math.cos(a) * lean * height * up, height * up - 0.3, bz + Math.sin(a) * lean * height * up], [0, turn, 0], [1.4, 1.8, 1]), {
        colour: [0.75 + rr(-0.1, 0.1), 0.85, 0.7],
        tile: [0.5, 1], offset: [0.5, 0],
      });
    }
  }
}

/** A weeping willow on the canal's edge: a leaning trunk, a small crown, and long curtains of hanging shoots on cards. */
function jiangnanWillow(kit, x, z, { lean = [0, 0.15], seed = 1 } = {}) {
  const random = jiangnanRandom(seed * 97 + 3);
  const rr = (a, b) => a + (b - a) * random();
  const trunk = jiangnanShared('trunk', () => new THREE.CylinderGeometry(0.7, 1, 1, 7));
  const card = jiangnanShared('card', () => new THREE.PlaneGeometry(1, 1));
  const top = new THREE.Vector3(x + lean[0] * 4, 4.6, z + lean[1] * 4);
  kit.shape('white', trunk, kit.place([(x + top.x) / 2, 2.3, (z + top.z) / 2], [Math.atan2(lean[1], 1), 0, -Math.atan2(lean[0], 1)], [0.32, 4.7, 0.32]), { colour: [0.3, 0.27, 0.22] });
  const clump = jiangnanShared('clump', () => new THREE.IcosahedronGeometry(1, 1));
  const leaf = [0.5, 0.62, 0.26];
  for (let k = 0; k < 5; k += 1) {
    const a = rr(0, Math.PI * 2);
    kit.shape('white', clump, kit.place([top.x + Math.cos(a) * 0.8, top.y + rr(0.4, 1.6), top.z + Math.sin(a) * 0.8], [0, 0, 0], [0.75, 0.6, 0.75]), { colour: leaf, shade: jiangnanLeafShade(top, 2) });
  }
  // The curtain: cards hanging in two rings from the crown's top, the outer arching further out and down.
  for (let k = 0; k < 34; k += 1) {
    const outer = k % 2;
    const a = (k / 34) * Math.PI * 2 + rr(-0.12, 0.12);
    const r = outer ? rr(1.9, 2.7) : rr(0.9, 1.6);
    const length = outer ? rr(3.4, 4.6) : rr(2.6, 3.6);
    const hang = top.y + (outer ? rr(1.0, 1.6) : rr(1.8, 2.4));
    kit.shape('leaves', card, kit.place([top.x + Math.cos(a) * r, hang - length / 2, top.z + Math.sin(a) * r], [0, -a + Math.PI / 2 + rr(-0.4, 0.4), 0], [rr(0.9, 1.4), length, 1]), {
      colour: [0.95 + rr(-0.08, 0.08), 1, 0.9],
      tile: [0.5, 1],
    });
  }
}

/** The leaves' texture: on the left, willow shoots hanging in strings of slim leaves; on the right, bamboo sprays. Alpha-tested cards. */
let jiangnanLeafTexture = null;
function jiangnanLeaves() {
  if (jiangnanLeafTexture) return jiangnanLeafTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  const random = jiangnanRandom(71);
  const rr = (a, b) => a + (b - a) * random();
  // Willow: shoots from the top edge, swaying a little, leaves along them.
  for (let shoot = 0; shoot < 16; shoot += 1) {
    const x = rr(12, 244);
    const end = rr(300, 510);
    const sway = rr(-12, 12);
    g.strokeStyle = 'rgba(90,100,50,1)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y < end; y += 6) g.lineTo(x + sway * Math.sin((y / end) * Math.PI), y);
    g.stroke();
    for (let y = 4; y < end; y += rr(5, 9)) {
      const at = x + sway * Math.sin((y / end) * Math.PI);
      const side = random() < 0.5 ? -1 : 1;
      g.fillStyle = `hsl(${rr(68, 92)},${rr(35, 55)}%,${rr(26, 46)}%)`;
      g.beginPath();
      g.ellipse(at + side * 4, y + 3, 2.2, 8, side * 0.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Bamboo: sprays of narrow lance leaves fanning down from twigs.
  for (let spray = 0; spray < 22; spray += 1) {
    const x = rr(270, 500);
    const y = rr(20, 470);
    for (let leaf = 0; leaf < 6; leaf += 1) {
      const a = Math.PI / 2 + rr(-1.1, 1.1);
      const length = rr(26, 44);
      g.save();
      g.translate(x, y);
      g.rotate(a - Math.PI / 2);
      g.fillStyle = `hsl(${rr(88, 110)},${rr(30, 48)}%,${rr(20, 34)}%)`;
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(5, length * 0.4, 0, length);
      g.quadraticCurveTo(-5, length * 0.4, 0, 0);
      g.fill();
      g.restore();
    }
  }
  jiangnanLeafTexture = new THREE.CanvasTexture(canvas);
  jiangnanLeafTexture.anisotropy = 4;
  return jiangnanLeafTexture;
}

// ---- the hills ---------------------------------------------------------------------

/**
 * Wooded hills round the town, from `from` to `to` metres out: a ring of
 * land that rises behind the roofs into rounded, tree-covered hills, its top
 * lumpy with canopy, coloured in the dark greens of camphor, pine and bamboo
 * woods. In mist they are soft silhouettes; the fog closes the view past them.
 */
function jiangnanHills(material, { from, to }) {
  const segments = 180;
  const rings = 9;
  const random = jiangnanRandom(301);
  const waves = Array.from({ length: 6 }, (_, k) => ({ f: [2, 3, 5, 7, 11, 17][k], p: random() * 6.28, a: [1, 0.6, 0.45, 0.3, 0.2, 0.12][k] }));
  const ridge = (theta) => waves.reduce((sum, wave) => sum + wave.a * Math.sin(theta * wave.f + wave.p), 0) / 2.7;
  const positions = [];
  const colours = [];
  const colour = new THREE.Color();
  const greens = [new THREE.Color(0x2d4a2a), new THREE.Color(0x355a30), new THREE.Color(0x46683a), new THREE.Color(0x26402a)];
  for (let ring = 0; ring <= rings; ring += 1) {
    const t = ring / rings;
    const radius = from + (to - from) * t;
    for (let segment = 0; segment <= segments; segment += 1) {
      const theta = (segment / segments) * Math.PI * 2;
      const crest = 24 + 9 * ridge(theta);
      // Rising from the town's level to the crest, over the ring.
      const canopy = 0.7 * Math.sin(theta * 61 + ring * 1.7) * Math.sin(theta * 37 + ring);
      const y = -0.5 + crest * jiangnanSmooth(0, 0.85, t) + canopy * jiangnanSmooth(0.1, 0.4, t);
      positions.push(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
      const patch = 0.5 + 0.5 * Math.sin(theta * 13 + ring * 0.7) * Math.sin(theta * 7 + 1.3);
      colour.copy(greens[Math.floor(patch * 3.99)]).multiplyScalar(0.85 + 0.25 * t + 0.1 * canopy);
      colours.push(colour.r, colour.g, colour.b);
    }
  }
  const indices = [];
  const across = segments + 1;
  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = ring * across + segment;
      const b = a + 1;
      const c = a + across;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  const cell = jiangnanCellOf('white');
  geometry.setAttribute('atlasCell', new THREE.Float32BufferAttribute(Array.from({ length: positions.length / 3 }, () => cell).flat(), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'jiangnan-hills';
  mesh.userData.scenery = 'hills';
  return mesh;
}

// ---- the canal ---------------------------------------------------------------------

/** The canal's water: one plane of dark green, glossy enough to take a little of the sky. */
function jiangnanWater({ near, far, water }) {
  const material = new THREE.MeshStandardMaterial({ color: 0x24382c, roughness: 0.18, metalness: 0.05 });
  material.userData.reflects = 0.45;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(160, far - near + 0.4), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, water, (near + far) / 2);
  mesh.receiveShadow = true;
  mesh.name = 'jiangnan-water';
  return mesh;
}

// ---- the town ---------------------------------------------------------------------

/**
 * Build the water town round the square into `place`. Rows of houses close
 * the square on three sides — two-storey shops to the west, single-storey
 * shops to the north and east (where the camera stands, so it looks over
 * them) — each broken by a lane closed by a house across its end; the canal
 * runs along the south side with the bridge over it and the far bank's
 * houses rising out of the water; houses behind fill the roofline; trees
 * over the roofs, willows on the bank, the wooded hills behind.
 */
export function jiangnanTown(place) {
  const kit = jiangnanKit();
  const random = jiangnanRandom(1554);
  const { canal, bridge, west, east, north, hills } = JIANGNAN_PLAN;
  let seed = 0;
  const lean = () => (random() - 0.5) * 0.01;
  const house = (x, z, turn, options) => {
    seed += 1;
    kit.within(kit.place([x, 0, z], [lean(), turn, lean()]), () => jiangnanHouse(kit, { seed, ...options }));
  };
  // Fronts along a line from `from` to `to`, leaving out the `cuts`; widths drawn and stretched to fill each stretch exactly.
  const row = (from, to, cuts, at) => {
    const spans = [];
    let start = from;
    for (const [a, b] of cuts) {
      if (a > start) spans.push([start, a]);
      start = Math.max(start, b);
    }
    if (to > start) spans.push([start, to]);
    for (const [a, b] of spans) {
      if (b - a < 2.5) continue;
      const widths = [];
      let total = 0;
      while (total < b - a - 3) {
        const width = 3.8 + random() * 2.2;
        widths.push(width);
        total += width;
      }
      let along = a;
      for (const raw of widths) {
        const width = (raw * (b - a)) / total;
        at(along + width / 2, width - 0.04);
        along += width;
      }
    }
  };
  const lane = 3;
  // The square's three sides.
  const northLane = 4;
  row(west, east, [[northLane - lane / 2, northLane + lane / 2]], (x, width) => house(x, north, 0, { width, storeys: 1, depth: 7, shop: random() < 0.65, horse: random() < 0.6, casts: true }));
  const westLane = -3;
  row(north, canal.near, [[westLane - lane / 2, westLane + lane / 2]], (z, width) => house(west, z, Math.PI / 2, { width, storeys: 2, depth: 8, shop: random() < 0.75, horse: random() < 0.7, casts: true }));
  const eastLane = 0.5;
  row(north, canal.near, [[eastLane - lane / 2, eastLane + lane / 2]], (z, width) => house(east, z, -Math.PI / 2, { width, storeys: 1, depth: 7, shop: random() < 0.6, horse: random() < 0.6, casts: true }));
  // The houses across the lanes' ends, so no lane looks out on nothing.
  house(northLane, north - 9.5, 0, { width: 7, storeys: 2, depth: 7, far: true });
  house(west - 10.5, westLane, Math.PI / 2, { width: 7, storeys: 2, depth: 7, far: true });
  house(east + 9.5, eastLane, -Math.PI / 2, { width: 7, storeys: 2, depth: 7, far: true });
  // The near bank beyond the square, houses fronting the water; the far bank all along, standing in it.
  row(-75, west - 8, [], (x, width) => house(x, canal.near, 0, { width, storeys: 2, depth: 8, water: true, far: x < -40, horse: random() < 0.7 }));
  row(east + 7, 75, [], (x, width) => house(x, canal.near, 0, { width, storeys: 2, depth: 8, water: true, far: x > 40, horse: random() < 0.7 }));
  const landing = [bridge.x - bridge.width / 2 - 0.4, bridge.x + bridge.width / 2 + 0.4];
  row(-75, 75, [landing], (x, width) => house(x, canal.far, Math.PI, { width, storeys: 2, depth: 8, water: true, far: Math.abs(x) > 32, shop: false, horse: random() < 0.7, casts: Math.abs(x) < 14 }));
  house(bridge.x, canal.far + 10, Math.PI, { width: 7, storeys: 2, depth: 7, far: true });
  // Behind the rows: plainer, taller houses for the roofline.
  const back = (x, z, turn, width) => house(x, z, turn, { width, storeys: 2, depth: 7, far: true, horse: random() < 0.75 });
  row(-32, 32, [[northLane - 3.6, northLane + 3.6]], (x, width) => back(x, north - 8.5, 0, width));
  row(north - 16, canal.near - 8.5, [[westLane - 3.6, westLane + 3.6]], (z, width) => back(west - 9.5, z, Math.PI / 2, width));
  row(north - 16, canal.near - 8.5, [[eastLane - 3.6, eastLane + 3.6]], (z, width) => back(east + 8.5, z, -Math.PI / 2, width));

  // The canal: the embankments of granite, steps down to the water on the square's side.
  const wall = (z, from, to) => kit.box('stone', [to - from, 2.3, 0.6], [(from + to) / 2, -1.12, z], { tile: 1.6, colour: [0.82, 0.84, 0.8], shade: jiangnanDamp });
  wall(canal.near + 0.3, -75, landing[0]);
  wall(canal.near + 0.3, landing[1], 75);
  // The far bank: a narrow ledge before the houses' footings, and the bridge's landing.
  wall(canal.far - 0.3, -75, 75);
  kit.box('stone', [150, 0.14, 0.7], [0, -0.05, canal.near + 0.25], { tile: 1.6, colour: [0.9, 0.9, 0.87] });
  for (const stairX of [6, -15]) {
    for (let k = 0; k < 6; k += 1) kit.box('stone', [2.4, 0.22, 0.42], [stairX, -0.2 - k * 0.22, canal.near + 0.8 + k * 0.32], { tile: 1.6, colour: [0.86, 0.87, 0.83], shade: jiangnanDamp });
  }
  jiangnanBridge(kit, { x: bridge.x, width: bridge.width, from: canal.near - 1.9, to: canal.far + 1.6, water: canal.water });

  // Wine jars stacked by the shops on the west side, baskets and a tub.
  const jar = jiangnanShared('jar', () => new THREE.SphereGeometry(1, 10, 7));
  for (const [x, z, s] of [[west + 1.0, -9.2, 1], [west + 1.0, -8.3, 0.95], [west + 1.7, -8.75, 1.05], [west + 0.95, 4.6, 1], [west + 0.9, 5.5, 0.9], [east - 1.0, -10, 1]]) {
    kit.shape('white', jar, kit.place([x, 0.36 * s, z], [0, 0, 0], [0.34 * s, 0.38 * s, 0.34 * s]), { colour: [0.36, 0.24, 0.16], shade: (c, p, n) => {
      const k = 0.7 + 0.45 * Math.max(0, n.y);
      c[0] *= k;
      c[1] *= k;
      c[2] *= k;
    } });
    kit.box('white', [0.36 * s, 0.1, 0.36 * s], [x, 0.74 * s, z], { colour: [0.6, 0.45, 0.3] });
  }
  const basket = jiangnanShared('basket', () => new THREE.CylinderGeometry(1, 0.8, 1, 9, 1, true));
  for (const [x, z] of [[west + 1.3, -6.9], [east - 0.9, 6.5], [-11, north + 0.9]]) kit.shape('timber', basket, kit.place([x, 0.2, z], [0, 0, 0], [0.32, 0.4, 0.32]), { colour: [1.4, 1.25, 0.9], tile: 0.4 });

  // Trees: camphors and bamboo over the roofs, willows on the bank.
  [[-12, north - 13, 1.1], [15, north - 15, 1], [west - 14, -10, 1.05], [east + 14, 6, 0.95], [-26, canal.far + 14, 1.1], [20, canal.far + 13, 1], [-45, -20, 1.2], [42, -26, 1.1]].forEach(([x, z, scale], k) => jiangnanCamphor(kit, x, z, { scale, seed: k + 1 }));
  [[east + 8, north - 6], [west - 6, canal.near - 15], [9, canal.far + 12], [-36, canal.far + 11]].forEach(([x, z], k) => jiangnanBamboo(kit, x, z, { seed: k + 1 }));
  [[-16, canal.near - 0.6, [0.05, 0.14]], [-0.5, canal.near - 0.6, [-0.04, 0.16]], [10, canal.near - 0.6, [0.03, 0.15]], [17.5, canal.near - 0.5, [-0.05, 0.12]]].forEach(([x, z, lean], k) => jiangnanWillow(kit, x, z, { lean, seed: k + 1 }));

  const group = new THREE.Group();
  group.name = 'jiangnan-props';
  const fabric = kit.batches.fabric.mesh(jiangnanFabric());
  fabric.name = 'jiangnan-fabric';
  fabric.receiveShadow = true;
  group.add(fabric);
  const leaves = kit.batches.leaves.mesh(new THREE.MeshLambertMaterial({ map: jiangnanLeaves(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }));
  leaves.name = 'jiangnan-leaves';
  group.add(leaves);
  const shadow = kit.batches.shadow.mesh(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  shadow.name = 'jiangnan-shadow';
  shadow.castShadow = true;
  group.add(shadow);
  group.add(jiangnanWater(canal));
  group.add(jiangnanHills(jiangnanFabric(), { from: hills[0], to: hills[1] }));
  place.add(group);
  // For the timing harness: the last town built.
  globalThis.__jiangnanLast = group;
}
