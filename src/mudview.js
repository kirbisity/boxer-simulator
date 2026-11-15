// A battle's mud drawn as ground, not as a flat sheet (worksview.js, a works' soft place with `surface` 'mud'): soaked
// plough-clay heaved into furrows and churned by feet and hooves, its surface torn into clods and smeared ridges,
// wet through and glossy, the rain standing in its hollows. Two scales:
//   - the shape, in the mesh itself: furrows, the churn and the pits trodden in it, worked out where each vertex
//     stands (world metres, so no two stretches of the field are the same); the field's standing water (its works'
//     `water`, drawn flat at its level by kitwater.js) shows only where the mud lies under it: pools in the hollows;
//   - the texture of the surface, in tiled maps made once: a height of clods, cracks and grain (a periodic noise, so
//     the tile has no seam), turned into a normal map, a roughness (wet and glossy, a little duller on the tops
//     drying first) and a colour (dark wet clay, the tops a shade paler, the hollows darker).
// The physics is the soft ground's own (fieldworks.js): a foot sinks from the field's level whatever is drawn.

/* global THREE */

export const MUD_VIEW = {
  // The mesh's cell (m): fine enough for a furrow's shape and a pool's shore, coarse enough for a whole field.
  cell: 0.2,
  // The shape (m): plough furrows `furrow.every` apart across the field, `furrow.height` from trough to crest; the churn
  // of feet and hooves, `churn.height` over patches `churn.size` across; pits trodden in it, `pits` per m², `pit.depth`
  // deep and `pit.size` across. The standing water's level is its works' `water` over the field's own: the shape is set
  // about it so the water stands in a third or so of the ground, in the furrows and the trodden hollows.
  furrow: { every: 0.85, height: 0.035, wander: 2.5 },
  churn: { height: 0.1, size: 1.7 },
  pit: { depth: 0.05, size: 0.35, per: 0.6 },
  // Raised by this much over the field's level (m): the water (4 cm over it) then lies in the lower third.
  lift: 0.06,
  // The tiled maps: `pixels` square over `tile` m; the normal map's strength.
  pixels: 512,
  tile: 1.6,
  bump: 7,
  // Wet clay (sRGB): the hollows' colour, the tops', the grain's spread.
  colour: { low: [46, 38, 30], high: [86, 72, 56], grain: 0.18 },
  // Wet: glossy, a little duller on the tops as they drain.
  roughness: { low: 0.18, high: 0.5 },
  // How much of the sky the wet surface gives back (render.js's `reflects`: the share of the steel's environment).
  reflects: 0.55,
};

// ---- Noise: a value noise over integer lattices, periodic in `period` cells when one is given ----

function mudHash(i, j, seed) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function mudNoise(x, y, seed, period = 0) {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const wrap = (n) => (period ? ((n % period) + period) % period : n);
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = mudHash(wrap(i), wrap(j), seed);
  const b = mudHash(wrap(i + 1), wrap(j), seed);
  const c = mudHash(wrap(i), wrap(j + 1), seed);
  const d = mudHash(wrap(i + 1), wrap(j + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal noise of `octaves`, each twice as fine; periodic over `period` cells of the first when given. 0..1. */
function mudFbm(x, y, seed, octaves, period = 0) {
  let sum = 0;
  let weight = 0.5;
  let total = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    const scale = 2 ** octave;
    sum += weight * mudNoise(x * scale, y * scale, seed + octave * 17, period * scale);
    total += weight;
    weight *= 0.5;
  }
  return sum / total;
}

// ---- The shape ----

/** The mud's surface over the field's level at (x, z) (m), before the lift: furrows, churn, pits. */
export function mudShape(x, z) {
  const { furrow, churn, pit } = MUD_VIEW;
  // Furrows run along the field (x), wandering, broken and mostly trodden out: thousands crossed it.
  const wander = (mudFbm(x / 9, z / 9, 5, 2) - 0.5) * furrow.wander;
  const ridge = 0.5 + 0.5 * Math.cos(((z + wander) / furrow.every) * Math.PI * 2);
  const churned = mudFbm(x / churn.size, z / churn.size, 11, 4);
  const broken = mudFbm(x / 3.5, z / 3.5, 13, 2);
  const trodden = Math.min(1, Math.max(0, (churned - 0.3) * 2 + (broken - 0.5)));
  let y = furrow.height * (ridge - 0.5) * (1 - 0.85 * trodden) + churn.height * (churned - 0.5) * 1.6;
  // Pits: a foot or a hoof pressed in, in cells of pit.size, one in so many.
  const cx = Math.floor(x / pit.size);
  const cz = Math.floor(z / pit.size);
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      const i = cx + dx;
      const j = cz + dz;
      if (mudHash(i, j, 23) > pit.per * pit.size * pit.size * (0.5 + trodden)) continue;
      const px = (i + mudHash(i, j, 29)) * pit.size;
      const pz = (j + mudHash(i, j, 31)) * pit.size;
      const r = Math.hypot((x - px) / 1.3, z - pz) / (pit.size * 0.45);
      if (r < 1) y -= pit.depth * (1 - r * r) ** 2;
    }
  }
  return y;
}

/** A mesh of the soft place's mud (`area` its rectangle) at `over` m over the field's level, shaped and mapped. */
export function mudSurface(area, over, maps) {
  const { cell, lift } = MUD_VIEW;
  const width = area.x[1] - area.x[0];
  const depth = area.z[1] - area.z[0];
  const nx = Math.max(2, Math.round(width / cell));
  const nz = Math.max(2, Math.round(depth / cell));
  const geometry = new THREE.PlaneGeometry(width, depth, nx, nz);
  geometry.rotateX(-Math.PI / 2);
  const centre = [(area.x[0] + area.x[1]) / 2, (area.z[0] + area.z[1]) / 2];
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index) + centre[0];
    const z = position.getZ(index) + centre[1];
    // (Down to the field's level at the rim, where the mud meets the ground round it.)
    const inside = Math.min(x - area.x[0], area.x[1] - x, z - area.z[0], area.z[1] - z);
    const rim = Math.min(1, Math.max(0, inside / 0.6));
    position.setY(index, over + rim * (lift + mudShape(x, z)));
    // The maps tile in world metres.
    uv.setXY(index, x / MUD_VIEW.tile, z / MUD_VIEW.tile);
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: maps.colour, normalMap: maps.normal, roughnessMap: maps.roughness, roughness: 1, metalness: 0,
    normalScale: new THREE.Vector2(1, 1),
  });
  material.userData.reflects = MUD_VIEW.reflects;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(centre[0], 0, centre[1]);
  mesh.receiveShadow = true;
  mesh.name = 'mud';
  return mesh;
}

// ---- The tiled maps ----

/** The surface's height in the tile at (u, v) in 0..1: clods torn apart by cracks, smeared ridges, grain. 0..1. */
function mudTileHeight(u, v) {
  // Clods: the clay torn and pressed into plates, each a flat face ending in a steep torn edge (the noise stepped
  // into terraces), the coordinates warped so no edge runs straight and no two tiles of it read alike.
  const warpU = u + (mudFbm(u * 3, v * 3, 43, 2, 3) - 0.5) * 0.18;
  const warpV = v + (mudFbm(u * 3, v * 3, 47, 2, 3) - 0.5) * 0.18;
  const lump = mudFbm(warpU * 4, warpV * 4, 41, 4, 4);
  const steps = lump * 4;
  const terraced = (Math.floor(steps) + Math.min(1, Math.max(0, (steps - Math.floor(steps) - 0.7) / 0.3)) ** 2) / 4;
  // Cracks between them: the valleys of a ridged noise, narrow and dark.
  const ridged = 1 - Math.abs(mudFbm(u * 9, v * 9, 53, 2, 9) - 0.5) * 2;
  const crack = Math.max(0, (ridged - 0.86) / 0.14);
  // Smears: where a sole slid, streaks drawn along one way.
  const smear = mudFbm(u * 3, v * 14, 61, 2, 3);
  // Grain: the clay's own roughness and the grit in it.
  const grain = mudFbm(u * 48, v * 48, 67, 3, 48);
  return Math.min(1, Math.max(0, 0.62 * terraced + 0.12 * smear + 0.16 * grain + 0.1 * lump - 0.2 * crack));
}

/** The mud's tiled maps (colour, normal, roughness), made once and shared by every soft place drawn. */
let mudMapsMade = null;
export function mudMaps() {
  if (mudMapsMade) return mudMapsMade;
  const { pixels, bump, colour, roughness } = MUD_VIEW;
  const heights = new Float32Array(pixels * pixels);
  for (let row = 0; row < pixels; row += 1) for (let column = 0; column < pixels; column += 1) heights[row * pixels + column] = mudTileHeight(column / pixels, row / pixels);
  const at = (column, row) => heights[(((row % pixels) + pixels) % pixels) * pixels + (((column % pixels) + pixels) % pixels)];
  const canvas = (draw) => {
    const element = document.createElement('canvas');
    element.width = element.height = pixels;
    const context = element.getContext('2d');
    const image = context.createImageData(pixels, pixels);
    draw(image.data);
    context.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(element);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    return texture;
  };
  const normal = canvas((data) => {
    for (let row = 0; row < pixels; row += 1) {
      for (let column = 0; column < pixels; column += 1) {
        // (Sobel: the slope across and down the tile.)
        const dx = (at(column + 1, row - 1) + 2 * at(column + 1, row) + at(column + 1, row + 1)) - (at(column - 1, row - 1) + 2 * at(column - 1, row) + at(column - 1, row + 1));
        const dy = (at(column - 1, row + 1) + 2 * at(column, row + 1) + at(column + 1, row + 1)) - (at(column - 1, row - 1) + 2 * at(column, row - 1) + at(column + 1, row - 1));
        const nx = -dx * bump;
        const ny = dy * bump;
        const length = Math.hypot(nx, ny, 1);
        const p = (row * pixels + column) * 4;
        data[p] = (nx / length * 0.5 + 0.5) * 255;
        data[p + 1] = (ny / length * 0.5 + 0.5) * 255;
        data[p + 2] = (1 / length * 0.5 + 0.5) * 255;
        data[p + 3] = 255;
      }
    }
  });
  const rough = canvas((data) => {
    for (let index = 0; index < pixels * pixels; index += 1) {
      const value = (roughness.low + (roughness.high - roughness.low) * heights[index] ** 1.5) * 255;
      data.set([value, value, value, 255], index * 4);
    }
  });
  const tint = canvas((data) => {
    for (let index = 0; index < pixels * pixels; index += 1) {
      const h = heights[index];
      const grit = 1 + (mudHash(index, 7, 71) - 0.5) * colour.grain;
      for (let channel = 0; channel < 3; channel += 1) data[index * 4 + channel] = Math.min(255, (colour.low[channel] + (colour.high[channel] - colour.low[channel]) * h) * grit);
      data[index * 4 + 3] = 255;
    }
  });
  mudMapsMade = { colour: tint, normal, roughness: rough };
  return mudMapsMade;
}
