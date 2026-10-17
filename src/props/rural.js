// Rural props: the buildings and furniture of the open-country places. The
// meadow's thatched cottages, hay ricks, hurdles and split-rail fence; the
// field's post-and-rail round the riding ground; and at Sekigahara the
// castle keep on its hill, the bamboo palisade, each side's camp curtain and
// its banners. Called from the place builders in render.js.
//
// Surfaces are generated canvas textures, painted once per page: a colour
// and a height field drawn together, the normal map taken from the height's
// slope. Geometry carries uv in metres, scaled per texture, so a texture
// tiles at its real size whatever it is on. Every place's props are merged
// per material (a handful of draw calls), and vertex colours carry what
// differs between instances (one cottage's limewash creamier, one rick's hay
// fresher) and the weathering (moss on a roof's north slope, the dirty skirt
// of a rick, a post's damp foot).

/* global THREE */

// ---- tools ---------------------------------------------------------------------------

/** A seeded random, 0..1. */
function ruralRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ruralHash(text) {
  let seed = 2166136261;
  for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return seed >>> 0;
}

const ruralLerp = (a, b, t) => a + (b - a) * t;
const ruralClamp = (value, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, value));

// Painted once per page and shared by every build of a place (a texture
// disposed with a place is uploaded again on its next use).
const ruralTextureCache = new Map();

/**
 * A colour texture and its normal map, painted on canvas. `paint(sheet)`
 * draws on sheet.colour and, for relief, on sheet.bump (mid grey is flat,
 * lighter stands proud). `sheet.wrap(x0, y0, x1, y1, draw)` calls
 * draw(ox, oy) for every offset copy a shape near an edge needs, so the
 * sheet tiles. `tileV: false` for a sheet that is painted once top to
 * bottom (the limewashed wall, its damp at the foot).
 */
function ruralPainted(key, width, height, { relief = 3, tileV = true } = {}, paint) {
  if (ruralTextureCache.has(key)) return ruralTextureCache.get(key);
  const context = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.lineCap = 'round';
    g.lineJoin = 'round';
    return g;
  };
  const colour = context();
  const bump = context();
  bump.fillStyle = 'rgb(128,128,128)';
  bump.fillRect(0, 0, width, height);
  const random = ruralRandom(ruralHash(key));
  const wrap = (x0, y0, x1, y1, draw) => {
    for (const ox of [-width, 0, width]) {
      if (x1 + ox < 0 || x0 + ox > width) continue;
      for (const oy of tileV ? [-height, 0, height] : [0]) {
        if (y1 + oy < 0 || y0 + oy > height) continue;
        draw(ox, oy);
      }
    }
  };
  const grey = (value, alpha = 1) => {
    const g = Math.round(ruralClamp(value) * 255);
    return `rgba(${g},${g},${g},${alpha})`;
  };
  const rr = (a, b) => a + (b - a) * random();
  paint({ colour, bump, width, height, random, rr, wrap, grey });
  // The normal map: the height's slope across and along. Canvas rows run
  // down while v runs up, hence the sign on the second component.
  const heights = bump.getImageData(0, 0, width, height).data;
  const normalContext = context();
  const out = normalContext.createImageData(width, height);
  const at = (x, y) => {
    const xx = (x + width) % width;
    const yy = tileV ? (y + height) % height : Math.min(height - 1, Math.max(0, y));
    return heights[(yy * width + xx) * 4] / 255;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = -(at(x + 1, y) - at(x - 1, y)) * relief;
      const ny = (at(x, y + 1) - at(x, y - 1)) * relief;
      const length = Math.sqrt(nx * nx + ny * ny + 1);
      const index = (y * width + x) * 4;
      out.data[index] = (nx / length * 0.5 + 0.5) * 255;
      out.data[index + 1] = (ny / length * 0.5 + 0.5) * 255;
      out.data[index + 2] = (1 / length * 0.5 + 0.5) * 255;
      out.data[index + 3] = 255;
    }
  }
  normalContext.putImageData(out, 0, 0);
  const texture = (canvas) => {
    const made = new THREE.CanvasTexture(canvas);
    made.wrapS = THREE.RepeatWrapping;
    made.wrapT = tileV ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    made.anisotropy = 8;
    return made;
  };
  const pair = { map: texture(colour.canvas), normalMap: texture(normalContext.canvas) };
  ruralTextureCache.set(key, pair);
  return pair;
}

/** A standard material over one painted pair, coloured per vertex. */
function ruralMaterial(pair, { roughness = 0.92, normal = 1, ...options } = {}) {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff, map: pair.map, normalMap: pair.normalMap, normalScale: new THREE.Vector2(normal, normal),
    vertexColors: true, roughness, metalness: 0, ...options,
  });
}

/** Several geometries as one: non-indexed, with position, normal, uv and colour (white where a part has none); uv scaled by `uvScale` (1 / the texture's tile in metres). */
function ruralMerge(parts, uvScale = 1) {
  const flat = parts.map((part) => {
    const geometry = part.index ? part.toNonIndexed() : part;
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    return geometry;
  });
  const count = flat.reduce((sum, geometry) => sum + geometry.attributes.position.count, 0);
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const colour = new Float32Array(count * 3).fill(1);
  let offset = 0;
  for (const geometry of flat) {
    const { attributes } = geometry;
    const n = attributes.position.count;
    position.set(attributes.position.array, offset * 3);
    normal.set(attributes.normal.array, offset * 3);
    if (attributes.uv) for (let index = 0; index < n * 2; index += 1) uv[offset * 2 + index] = attributes.uv.array[index] * uvScale;
    if (attributes.color) colour.set(attributes.color.array, offset * 3);
    offset += n;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  merged.computeBoundingSphere();
  return merged;
}

/** One mesh of merged parts; it casts and takes shadows unless told not to. */
function ruralMesh(parts, material, uvScale = 1, { cast = true } = {}) {
  const mesh = new THREE.Mesh(ruralMerge(parts, uvScale), material);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

/** Colour a geometry per vertex: `paint(x, y, z, nx, ny, nz)` returns [r, g, b] (or one [r, g, b] for all). */
function ruralTint(geometry, paint) {
  const { position, normal } = geometry.attributes;
  const colour = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const rgb = typeof paint === 'function'
      ? paint(position.getX(index), position.getY(index), position.getZ(index), normal.getX(index), normal.getY(index), normal.getZ(index))
      : paint;
    colour[index * 3] = rgb[0];
    colour[index * 3 + 1] = rgb[1];
    colour[index * 3 + 2] = rgb[2];
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  return geometry;
}

/** Uv in metres projected on the box faces: u along the longer of each face's two sides (a beam's grain runs along it). */
function ruralBoxUv(geometry) {
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox.getSize(size);
  const extent = [size.x, size.y, size.z];
  const { position, normal } = geometry.attributes;
  const uv = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    const p = [position.getX(index), position.getY(index), position.getZ(index)];
    const n = [Math.abs(normal.getX(index)), Math.abs(normal.getY(index)), Math.abs(normal.getZ(index))];
    const axis = n[0] > n[1] && n[0] > n[2] ? 0 : n[1] > n[2] ? 1 : 2;
    const [o0, o1] = [0, 1, 2].filter((other) => other !== axis);
    const [a, b] = extent[o0] >= extent[o1] ? [o0, o1] : [o1, o0];
    uv[index * 2] = p[a];
    uv[index * 2 + 1] = p[b];
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/** Move a geometry into place: position, turn about y, then tilts. */
function ruralAt(geometry, x, y, z, turn = 0, tiltX = 0, tiltZ = 0) {
  const turned = new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, turn, tiltZ, 'YXZ'));
  return geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), turned, new THREE.Vector3(1, 1, 1)));
}

/** A box sx by sy by sz centred at (x, y, z), turned about y, with box uv. */
function ruralBox(sx, sy, sz, x = 0, y = 0, z = 0, turn = 0, tiltX = 0, tiltZ = 0) {
  return ruralAt(ruralBoxUv(new THREE.BoxGeometry(sx, sy, sz)), x, y, z, turn, tiltX, tiltZ);
}

/** A square-sectioned stick from a to b (a beam, a spar, a strap), w across and h deep, rolled about its length by `roll`. */
function ruralStick(a, b, w, h = w, roll = 0) {
  const length = a.distanceTo(b);
  const geometry = ruralBoxUv(new THREE.BoxGeometry(length, h, w));
  geometry.rotateX(roll);
  const direction = new THREE.Vector3().subVectors(b, a).normalize();
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction)));
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return geometry;
}

/** A round rod from a to b: u once round (for bamboo, whose texture wraps), v in metres along it. */
function ruralRod(a, b, radius, sides = 6, roll = 0, radiusB = radius) {
  const length = a.distanceTo(b);
  const geometry = new THREE.CylinderGeometry(radiusB, radius, length, sides, 1);
  const uv = geometry.attributes.uv;
  for (let index = 0; index < uv.count; index += 1) uv.setY(index, uv.getY(index) * length);
  geometry.rotateY(roll);
  geometry.translate(0, length / 2, 0);
  const direction = new THREE.Vector3().subVectors(b, a).normalize();
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)));
  geometry.translate(a.x, a.y, a.z);
  return geometry;
}

/** A flat quad a b c d, counter-clockwise seen from its front; uv in metres from a along a→b and a→d. */
function ruralQuad(a, b, c, d) {
  const eu = new THREE.Vector3().subVectors(b, a);
  const ev = new THREE.Vector3().subVectors(d, a);
  const normal = new THREE.Vector3().crossVectors(eu, ev).normalize();
  eu.normalize();
  ev.sub(eu.clone().multiplyScalar(ev.dot(eu))).normalize();
  const corners = [a, b, c, a, c, d];
  const position = [];
  const normals = [];
  const uv = [];
  for (const corner of corners) {
    position.push(corner.x, corner.y, corner.z);
    normals.push(normal.x, normal.y, normal.z);
    const offset = new THREE.Vector3().subVectors(corner, a);
    uv.push(offset.dot(eu), offset.dot(ev));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

/** A flat polygon (points in its plane, as Vector3) facing `facing`, uv from `project(point)` → [u, v]. */
function ruralPolygon(points, facing, project) {
  const flat = points.map((point) => new THREE.Vector2(...project(point)));
  const triangles = THREE.ShapeUtils.triangulateShape(flat, []);
  const position = [];
  const uv = [];
  for (const triangle of triangles) {
    const [a, b, c] = triangle.map((index) => points[index]);
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const order = normal.dot(facing) >= 0 ? triangle : [triangle[0], triangle[2], triangle[1]];
    for (const index of order) {
      position.push(points[index].x, points[index].y, points[index].z);
      uv.push(flat[index].x, flat[index].y);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  const normals = [];
  for (let index = 0; index < position.length / 3; index += 1) normals.push(facing.x, facing.y, facing.z);
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

/**
 * A grid surface: `point(i, j)` gives [x, y, z, u, v] for i = 0..cols,
 * j = 0..rows; triangles wound so the normal at the probe vertex (i, j)
 * agrees with `facing` there.
 */
function ruralGrid(cols, rows, point, probe = null) {
  const position = [];
  const uv = [];
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= cols; i += 1) {
      const [x, y, z, u, v] = point(i, j);
      position.push(x, y, z);
      uv.push(u, v);
    }
  }
  const index = [];
  const at = (i, j) => j * (cols + 1) + i;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) index.push(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i, j + 1));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  if (probe) {
    const [i, j, facing] = probe;
    const n = geometry.attributes.normal;
    const k = at(i, j);
    if (n.getX(k) * facing.x + n.getY(k) * facing.y + n.getZ(k) * facing.z < 0) {
      for (let t = 0; t < index.length; t += 3) [index[t + 1], index[t + 2]] = [index[t + 2], index[t + 1]];
      geometry.setIndex(index);
      geometry.computeVertexNormals();
    }
  }
  return geometry;
}

/** Copies of `geometries` moved by a matrix. */
const ruralMoved = (geometries, matrix) => geometries.map((geometry) => geometry.applyMatrix4(matrix));

const ruralV = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- textures ------------------------------------------------------------------------

/**
 * Straw: long-straw thatch combed down the slope, laid in courses (each a
 * band of stems whose butts end in a small step), the same stems serving
 * for a hay rick, a ridge and a rope. Pale: vertex colour darkens it to old
 * grey-brown thatch or leaves it as fresh gold hay. One tile is 1 m.
 */
function ruralStraw() {
  return ruralPainted('rural:straw', 512, 512, { relief: 4 }, ({ colour, bump, width, height, random, rr, wrap, grey }) => {
    colour.fillStyle = '#8c7856';
    colour.fillRect(0, 0, width, height);
    bump.fillStyle = grey(0.38);
    bump.fillRect(0, 0, width, height);
    // Courses: 4 to the metre, each lit from above and shadowed at its butt ends.
    for (let course = 0; course < 4; course += 1) {
      const y0 = course * 128;
      const gradient = colour.createLinearGradient(0, y0, 0, y0 + 128);
      gradient.addColorStop(0, 'rgba(255,240,200,0.05)');
      gradient.addColorStop(0.85, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, 'rgba(40,28,10,0.18)');
      colour.fillStyle = gradient;
      colour.fillRect(0, y0, width, 128);
    }
    // Stems: thin, nearly straight, running down the sheet.
    for (let index = 0; index < 9000; index += 1) {
      const x = rr(0, width);
      const y = rr(0, height);
      const length = rr(30, 130);
      const lean = rr(-0.12, 0.12);
      const x1 = x + Math.sin(lean) * length;
      const y1 = y + Math.cos(lean) * length;
      const shade = random();
      const r = Math.round(135 + shade * 95);
      const g = Math.round(115 + shade * 85);
      const b = Math.round(72 + shade * 62);
      const lineWidth = rr(0.8, 2.4);
      wrap(Math.min(x, x1) - 3, y - 3, Math.max(x, x1) + 3, y1 + 3, (ox, oy) => {
        colour.strokeStyle = `rgba(${r},${g},${b},${rr(0.35, 0.8)})`;
        colour.lineWidth = lineWidth;
        colour.beginPath();
        colour.moveTo(x + ox, y + oy);
        colour.lineTo(x1 + ox, y1 + oy);
        colour.stroke();
        bump.strokeStyle = grey(0.5 + shade * 0.4, 0.7);
        bump.lineWidth = lineWidth;
        bump.beginPath();
        bump.moveTo(x + ox, y + oy);
        bump.lineTo(x1 + ox, y1 + oy);
        bump.stroke();
      });
    }
    // The step at each course's butt ends.
    for (let course = 0; course < 4; course += 1) {
      const y = course * 128 + 124;
      for (let x = 0; x < width; x += 3) {
        const drop = rr(-6, 6);
        bump.fillStyle = grey(0.2, 0.5);
        bump.fillRect(x, y + drop, 3, 5);
        colour.fillStyle = 'rgba(35,24,10,0.22)';
        colour.fillRect(x, y + drop, 3, 4);
      }
    }
  });
}

/**
 * Limewash over wattle and daub, 2 m wide by 4 m high, painted once top to
 * bottom (v is height above the ground / 4): soft lumps of the daub under
 * the wash, hairline cracks, patches where the wash has flaked to the brown
 * daub, and rising damp, green-grey, above the plinth (0.45 m).
 */
function ruralLimewash() {
  return ruralPainted('rural:limewash', 512, 1024, { relief: 3, tileV: false }, ({ colour, bump, width, height, random, rr, wrap, grey }) => {
    colour.fillStyle = '#e9e4d6';
    colour.fillRect(0, 0, width, height);
    const yOf = (metres) => height * (1 - metres / 4);
    for (let index = 0; index < 500; index += 1) {
      const x = rr(0, width);
      const y = rr(0, height);
      const radius = rr(10, 50);
      wrap(x - radius, y - radius, x + radius, y + radius, (ox) => {
        const tone = random();
        colour.fillStyle = `rgba(${200 + tone * 40},${190 + tone * 40},${170 + tone * 40},0.12)`;
        colour.beginPath();
        colour.arc(x + ox, y, radius, 0, Math.PI * 2);
        colour.fill();
        const gradient = bump.createRadialGradient(x + ox, y, 0, x + ox, y, radius);
        gradient.addColorStop(0, grey(0.5 + tone * 0.25, 0.5));
        gradient.addColorStop(1, grey(0.5, 0));
        bump.fillStyle = gradient;
        bump.beginPath();
        bump.arc(x + ox, y, radius, 0, Math.PI * 2);
        bump.fill();
      });
    }
    // Wash flaked to the daub: brown patches, sunk.
    for (let index = 0; index < 7; index += 1) {
      const x = rr(0, width);
      const y = rr(yOf(3.2), yOf(0.7));
      const rx = rr(8, 26);
      const ry = rr(4, 10);
      wrap(x - rx, y - ry, x + rx, y + ry, (ox) => {
        colour.fillStyle = 'rgba(160,138,104,0.55)';
        colour.beginPath();
        colour.ellipse(x + ox, y, rx, ry, rr(-0.4, 0.4), 0, Math.PI * 2);
        colour.fill();
        bump.fillStyle = grey(0.3, 0.8);
        bump.beginPath();
        bump.ellipse(x + ox, y, rx, ry, 0, 0, Math.PI * 2);
        bump.fill();
      });
    }
    // Hairline cracks.
    for (let index = 0; index < 6; index += 1) {
      let x = rr(0, width);
      let y = rr(0, height);
      colour.strokeStyle = 'rgba(90,80,64,0.3)';
      bump.strokeStyle = grey(0.2);
      colour.lineWidth = bump.lineWidth = 1;
      for (let step = 0; step < 6; step += 1) {
        const nx = x + rr(-14, 14);
        const ny = y + rr(4, 18);
        for (const context of [colour, bump]) {
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(nx, ny);
          context.stroke();
        }
        x = nx;
        y = ny;
      }
    }
    // Rising damp and rain splash above the plinth: green-grey fading up to 1.1 m.
    const damp = colour.createLinearGradient(0, yOf(1.15), 0, yOf(0.45));
    damp.addColorStop(0, 'rgba(110,112,80,0)');
    damp.addColorStop(0.6, 'rgba(110,112,80,0.28)');
    damp.addColorStop(1, 'rgba(80,78,52,0.55)');
    colour.fillStyle = damp;
    colour.fillRect(0, yOf(1.15), width, yOf(0) - yOf(1.15));
    for (let index = 0; index < 900; index += 1) {
      const x = rr(0, width);
      const y = yOf(0.45) - Math.pow(random(), 2) * 90;
      colour.fillStyle = `rgba(70,66,44,${rr(0.1, 0.35)})`;
      colour.fillRect(x, y, rr(1, 3), rr(1, 4));
    }
    // Runs of grime down from the eaves.
    for (let index = 0; index < 40; index += 1) {
      const x = rr(0, width);
      const length = rr(30, 160);
      const gradient = colour.createLinearGradient(0, yOf(2.45), 0, yOf(2.45) + length);
      gradient.addColorStop(0, 'rgba(110,98,76,0.25)');
      gradient.addColorStop(1, 'rgba(110,98,76,0)');
      colour.fillStyle = gradient;
      colour.fillRect(x, yOf(2.45), rr(2, 6), length);
    }
  });
}

/**
 * Weathered oak: silver-grey brown, the grain running along u, with checks
 * (splits along the grain), the odd knot and darker end-grain blotches.
 * One tile is 1 m.
 */
function ruralOak() {
  return ruralPainted('rural:oak', 512, 512, { relief: 5 }, ({ colour, bump, width, height, random, rr, wrap, grey }) => {
    colour.fillStyle = '#8a7d6c';
    colour.fillRect(0, 0, width, height);
    // Grain: long wavy lines along the sheet.
    for (let index = 0; index < 420; index += 1) {
      const y = rr(0, height);
      const tone = random();
      const amplitude = rr(1, 5);
      const period = rr(80, 260);
      const phase = rr(0, Math.PI * 2);
      const lineWidth = rr(0.6, 2.6);
      wrap(0, y - 8, width, y + 8, (ox, oy) => {
        colour.strokeStyle = tone > 0.5 ? `rgba(70,58,46,${rr(0.15, 0.5)})` : `rgba(180,170,155,${rr(0.1, 0.35)})`;
        colour.lineWidth = lineWidth;
        bump.strokeStyle = grey(tone > 0.5 ? 0.38 : 0.58, 0.6);
        bump.lineWidth = lineWidth;
        for (const context of [colour, bump]) {
          context.beginPath();
          for (let x = 0; x <= width; x += 8) {
            const yy = y + oy + Math.sin((x / period) * Math.PI * 2 + phase) * amplitude;
            if (x === 0) context.moveTo(x, yy);
            else context.lineTo(x, yy);
          }
          context.stroke();
        }
      });
    }
    // Checks: dark splits along the grain, sunk deep.
    for (let index = 0; index < 22; index += 1) {
      const x = rr(0, width);
      const y = rr(0, height);
      const length = rr(40, 220);
      wrap(x, y - 3, x + length, y + 3, (ox, oy) => {
        colour.strokeStyle = 'rgba(30,24,18,0.75)';
        bump.strokeStyle = grey(0.05);
        colour.lineWidth = bump.lineWidth = rr(1, 2.5);
        for (const context of [colour, bump]) {
          context.beginPath();
          context.moveTo(x + ox, y + oy);
          context.quadraticCurveTo(x + ox + length / 2, y + oy + rr(-3, 3), x + ox + length, y + oy + rr(-2, 2));
          context.stroke();
        }
      });
    }
    // Knots.
    for (let index = 0; index < 5; index += 1) {
      const x = rr(0, width);
      const y = rr(0, height);
      wrap(x - 16, y - 10, x + 16, y + 10, (ox, oy) => {
        for (let ring = 4; ring >= 1; ring -= 1) {
          colour.fillStyle = `rgba(${60 + ring * 12},${48 + ring * 10},${36 + ring * 8},0.8)`;
          colour.beginPath();
          colour.ellipse(x + ox, y + oy, ring * 4, ring * 2.4, 0, 0, Math.PI * 2);
          colour.fill();
        }
        bump.fillStyle = grey(0.32);
        bump.beginPath();
        bump.ellipse(x + ox, y + oy, 10, 6, 0, 0, Math.PI * 2);
        bump.fill();
      });
    }
  });
}

/** Stones in a wall: rows of irregular stones with joints between them. */
function ruralPaintStones({ colour, bump, width, height, random, rr, wrap, grey }, { rows, widths, gap, joint, palette, speckle = 3000, angular = false }) {
  colour.fillStyle = joint;
  colour.fillRect(0, 0, width, height);
  bump.fillStyle = grey(0.18);
  bump.fillRect(0, 0, width, height);
  let y = 0;
  while (y < height - 1) {
    let rowHeight = rr(rows[0], rows[1]);
    if (height - (y + rowHeight) < rows[0]) rowHeight = height - y;
    const start = rr(0, widths[1]);
    let x = start;
    while (x < start + width) {
      const stoneWidth = Math.min(rr(widths[0], widths[1]), start + width - x);
      if (stoneWidth < widths[0] * 0.4) break;
      const base = palette[Math.floor(random() * palette.length)];
      const tone = rr(-18, 18);
      const fill = `rgb(${base[0] + tone},${base[1] + tone},${base[2] + tone})`;
      // A stone: its rectangle with corners pulled in at random, rounded.
      const inset = () => (angular ? rr(gap * 0.5, gap * 6) : rr(gap * 0.5, gap * 2.2));
      const corners = [
        [x + inset(), y + inset()], [x + stoneWidth - inset(), y + inset()],
        [x + stoneWidth - inset(), y + rowHeight - inset()], [x + inset(), y + rowHeight - inset()],
      ];
      const chips = corners.map(() => (random() < 0.4 ? rr(0.05, 0.2) : 0.01));
      const cx = x + stoneWidth / 2;
      const cy = y + rowHeight / 2;
      wrap(x, y, x + stoneWidth, y + rowHeight, (ox, oy) => {
        const path = (context) => {
          context.beginPath();
          if (angular) {
            // A dressed stone: straight faces, a corner knocked off here and there.
            corners.forEach(([px, py], index) => {
              const [nx, ny] = corners[(index + 1) % 4];
              const cut = chips[index];
              const ax = px + (nx - px) * cut;
              const ay = py + (ny - py) * cut;
              if (index === 0) context.moveTo(px + (corners[3][0] - px) * chips[3] + ox, py + (corners[3][1] - py) * chips[3] + oy);
              context.lineTo(px + ox, py + oy);
              context.lineTo(ax + ox, ay + oy);
            });
            context.closePath();
            return;
          }
          corners.forEach(([px, py], index) => {
            const [nx, ny] = corners[(index + 1) % 4];
            const mx = (px + nx) / 2 + ox;
            const my = (py + ny) / 2 + oy;
            if (index === 0) context.moveTo((corners[3][0] + px) / 2 + ox, (corners[3][1] + py) / 2 + oy);
            context.quadraticCurveTo(px + ox, py + oy, mx, my);
          });
          context.closePath();
        };
        path(colour);
        colour.fillStyle = fill;
        colour.fill();
        path(bump);
        const radius = Math.max(stoneWidth, rowHeight) * 0.6;
        const gradient = bump.createRadialGradient(cx + ox + rr(-5, 5), cy + oy + rr(-5, 5), 0, cx + ox, cy + oy, radius);
        gradient.addColorStop(0, grey(rr(0.78, 0.92)));
        gradient.addColorStop(1, grey(0.5));
        bump.fillStyle = gradient;
        bump.fill();
        // Light from above on the stone's top edge, shade under it.
        path(colour);
        const shade = colour.createLinearGradient(0, y + oy, 0, y + rowHeight + oy);
        shade.addColorStop(0, 'rgba(255,255,240,0.12)');
        shade.addColorStop(0.7, 'rgba(0,0,0,0)');
        shade.addColorStop(1, 'rgba(0,0,0,0.22)');
        colour.fillStyle = shade;
        colour.fill();
      });
      x += stoneWidth;
    }
    y += rowHeight;
  }
  // Speckle and pitting in the stone's face.
  for (let index = 0; index < speckle; index += 1) {
    const x = rr(0, width);
    const yy = rr(0, height);
    const light = random() > 0.5;
    colour.fillStyle = light ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.14)';
    colour.fillRect(x, yy, rr(1, 3), rr(1, 3));
    if (!light) {
      bump.fillStyle = grey(0.35, 0.5);
      bump.fillRect(x, yy, 2, 2);
    }
  }
}

/** Rubble stone for a cottage's plinth and its chimney: local limestone and flint in rough courses. One tile is 1.5 m. */
function ruralRubble() {
  return ruralPainted('rural:rubble', 512, 512, { relief: 4 }, (sheet) => {
    ruralPaintStones(sheet, {
      rows: [30, 64], widths: [56, 150], gap: 2.5, joint: '#a49c8a',
      palette: [[150, 140, 120], [128, 120, 104], [168, 158, 136], [110, 104, 96], [140, 124, 96], [96, 92, 90]],
    });
    // Lichen.
    for (let index = 0; index < 140; index += 1) {
      const x = sheet.rr(0, 512);
      const y = sheet.rr(0, 512);
      sheet.colour.fillStyle = `rgba(${sheet.rr(140, 190)},${sheet.rr(150, 180)},${sheet.rr(90, 120)},0.25)`;
      sheet.colour.beginPath();
      sheet.colour.arc(x, y, sheet.rr(2, 8), 0, Math.PI * 2);
      sheet.colour.fill();
    }
  });
}

/**
 * A hazel hurdle, one 1 m by 1 m panel: upright sails 1/6 m apart and rods
 * woven between them, each row passing in front of one sail and behind the
 * next, the rows alternating; a twisted binding along the top.
 */
function ruralWattle() {
  return ruralPainted('rural:wattle', 512, 512, { relief: 5, tileV: false }, ({ colour, bump, width, height, random, rr, grey }) => {
    colour.fillStyle = '#2a2219';
    colour.fillRect(0, 0, width, height);
    bump.fillStyle = grey(0.1);
    bump.fillRect(0, 0, width, height);
    const sails = 6;
    const spacing = width / sails;
    const rowHeight = 15;
    const rows = Math.floor((height - 30) / rowHeight);
    const sail = (x, y0, y1) => {
      colour.fillStyle = '#6e5c47';
      colour.fillRect(x - 7, y0, 14, y1 - y0);
      colour.fillStyle = 'rgba(160,140,110,0.4)';
      colour.fillRect(x - 3, y0, 3, y1 - y0);
      const gradient = bump.createLinearGradient(x - 7, 0, x + 7, 0);
      gradient.addColorStop(0, grey(0.45));
      gradient.addColorStop(0.5, grey(0.75));
      gradient.addColorStop(1, grey(0.45));
      bump.fillStyle = gradient;
      bump.fillRect(x - 7, y0, 14, y1 - y0);
    };
    for (let index = 0; index < sails; index += 1) sail((index + 0.5) * spacing, 0, height);
    for (let row = 0; row < rows; row += 1) {
      const y = 30 + row * rowHeight + rowHeight / 2;
      const tone = random();
      const fill = `rgb(${Math.round(105 + tone * 50)},${Math.round(88 + tone * 40)},${Math.round(64 + tone * 30)})`;
      const lineWidth = rr(10, 13);
      // The rod bows out between the sails it passes in front of.
      colour.strokeStyle = fill;
      colour.lineWidth = lineWidth;
      colour.beginPath();
      bump.strokeStyle = grey(0.7);
      bump.lineWidth = lineWidth;
      bump.beginPath();
      for (let x = 0; x <= width; x += 4) {
        const yy = y + Math.sin((x / spacing) * Math.PI + row * Math.PI) * 1.5;
        for (const context of [colour, bump]) {
          if (x === 0) context.moveTo(x, yy);
          else context.lineTo(x, yy);
        }
      }
      colour.stroke();
      bump.stroke();
      colour.strokeStyle = 'rgba(200,180,150,0.35)';
      colour.lineWidth = 2;
      colour.beginPath();
      colour.moveTo(0, y - 3);
      colour.lineTo(width, y - 3);
      colour.stroke();
      bump.strokeStyle = grey(0.85, 0.6);
      bump.lineWidth = 3;
      bump.beginPath();
      bump.moveTo(0, y - 1);
      bump.lineTo(width, y - 1);
      bump.stroke();
      // Where the sail passes in front of this row, it is drawn over the rod.
      for (let index = 0; index < sails; index += 1) {
        if ((index + row) % 2 === 0) sail((index + 0.5) * spacing, y - rowHeight / 2, y + rowHeight / 2);
      }
    }
    // The twisted binding along the top: rods wound diagonally.
    for (let x = -20; x < width + 20; x += 9) {
      colour.strokeStyle = `rgb(${Math.round(rr(95, 140))},${Math.round(rr(80, 110))},${Math.round(rr(58, 80))})`;
      colour.lineWidth = 8;
      bump.strokeStyle = grey(0.8);
      bump.lineWidth = 8;
      for (const context of [colour, bump]) {
        context.beginPath();
        context.moveTo(x, 2);
        context.lineTo(x + 14, 28);
        context.stroke();
      }
    }
  });
}

/**
 * Bamboo, once round the cane (u) by 0.6 m along it (v): fine fibres along
 * the cane, and a node in the middle, a ridge with its darker sheath scar.
 * Dried canes, pale straw to olive; vertex colour varies them.
 */
function ruralBamboo() {
  return ruralPainted('rural:bamboo', 128, 512, { relief: 4 }, ({ colour, bump, width, height, random, rr, grey }) => {
    colour.fillStyle = '#c4b47c';
    colour.fillRect(0, 0, width, height);
    for (let index = 0; index < 400; index += 1) {
      const x = rr(0, width);
      const tone = random();
      colour.fillStyle = tone > 0.5 ? `rgba(120,110,60,${rr(0.1, 0.35)})` : `rgba(230,220,170,${rr(0.1, 0.3)})`;
      colour.fillRect(x, 0, rr(0.6, 2), height);
    }
    // Patches of green left in the cane, and dark spotting.
    for (let index = 0; index < 30; index += 1) {
      colour.fillStyle = `rgba(110,130,60,${rr(0.08, 0.2)})`;
      colour.fillRect(rr(0, width), rr(0, height), rr(10, 60), rr(40, 200));
      colour.fillStyle = 'rgba(60,50,30,0.25)';
      colour.fillRect(rr(0, width), rr(0, height), rr(1, 3), rr(2, 6));
    }
    const node = height / 2;
    colour.fillStyle = 'rgba(90,70,40,0.75)';
    colour.fillRect(0, node - 2, width, 4);
    colour.fillStyle = 'rgba(240,230,190,0.5)';
    colour.fillRect(0, node + 2, width, 5);
    const sheath = colour.createLinearGradient(0, node + 6, 0, node + 40);
    sheath.addColorStop(0, 'rgba(110,90,50,0.35)');
    sheath.addColorStop(1, 'rgba(110,90,50,0)');
    colour.fillStyle = sheath;
    colour.fillRect(0, node + 6, width, 34);
    const ridge = bump.createLinearGradient(0, node - 10, 0, node + 10);
    ridge.addColorStop(0, grey(0.5));
    ridge.addColorStop(0.4, grey(0.95));
    ridge.addColorStop(0.5, grey(0.3));
    ridge.addColorStop(0.65, grey(0.8));
    ridge.addColorStop(1, grey(0.5));
    bump.fillStyle = ridge;
    bump.fillRect(0, node - 10, width, 20);
  });
}

/** Leaded lights: small diamond panes of greenish glass in lead cames. One tile is 0.3 m. */
function ruralLeaded() {
  return ruralPainted('rural:leaded', 128, 128, { relief: 3 }, ({ colour, bump, width, height, rr, grey }) => {
    colour.fillStyle = '#39443f';
    colour.fillRect(0, 0, width, height);
    for (let index = 0; index < 40; index += 1) {
      colour.fillStyle = `rgba(${rr(70, 140)},${rr(90, 150)},${rr(90, 140)},0.25)`;
      colour.fillRect(rr(0, width), rr(0, height), rr(8, 30), rr(8, 30));
    }
    colour.strokeStyle = '#2a2a2c';
    colour.lineWidth = 3;
    bump.strokeStyle = grey(0.9);
    bump.lineWidth = 3;
    for (let k = -2; k <= 2; k += 1) {
      for (const context of [colour, bump]) {
        context.beginPath();
        context.moveTo(k * width / 2, 0);
        context.lineTo(k * width / 2 + width, height);
        context.moveTo(k * width / 2 + width, 0);
        context.lineTo(k * width / 2, height);
        context.stroke();
      }
    }
  });
}

// ---- the meadow --------------------------------------------------------------------

/**
 * A long-straw thatched roof over a cottage, ridge along x: one slab of
 * thatch `thickness` deep, wound round its ridge, its eaves rounded off in
 * a bullnose and its ends (the verges) thinned and rounded where they
 * overhang the gables; lumpy, as thatch is. Its underside rests on the wall
 * tops at ±halfSpan, `wallTop` high. Returns the slab and the outer apex height.
 */
function ruralThatchSlab({ halfLength, halfSpan, wallTop, pitch, overhang, verge, thickness, seed }) {
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  const ridgeY = wallTop + halfSpan * Math.tan(pitch);
  const eaveRun = (halfSpan + overhang) / c;
  // The profile, right half (z ≥ 0) from the outer apex round the eave to the inner apex: [z, y, outer].
  const half = (T) => {
    const points = [];
    const inner = [eaveRun * c, ridgeY - eaveRun * s];
    const outer = [inner[0] + s * T, inner[1] + c * T];
    for (let k = 0; k <= 6; k += 1) points.push([ruralLerp(0, outer[0], k / 6), ruralLerp(ridgeY + T / c, outer[1], k / 6), 1]);
    const cz = inner[0] + s * T / 2;
    const cy = inner[1] + c * T / 2;
    for (let k = 1; k <= 5; k += 1) {
      const angle = (Math.PI * k) / 6;
      points.push([cz + (T / 2) * (Math.cos(angle) * s + Math.sin(angle) * c), cy + (T / 2) * (Math.cos(angle) * c - Math.sin(angle) * s), 0.5]);
    }
    for (let k = 0; k <= 3; k += 1) points.push([ruralLerp(inner[0], 0, k / 3), ruralLerp(inner[1], ridgeY, k / 3), 0]);
    return points;
  };
  const loop = (T) => {
    const right = half(T);
    const left = right.slice(1, -1).reverse().map(([z, y, outer]) => [-z, y, outer]);
    return [...right, ...left, right[0]];
  };
  const X = halfLength + verge;
  const rings = [[-X, 0.42], [-X + 0.07, 0.8], [-X + 0.2, 0.97]];
  const inside = Math.ceil((2 * X - 0.4) / 0.35);
  for (let k = 1; k < inside; k += 1) rings.push([-X + 0.2 + ((2 * X - 0.4) * k) / inside, 1]);
  rings.push([X - 0.2, 0.97], [X - 0.07, 0.8], [X, 0.42]);
  const random = ruralRandom(seed);
  const phase = [random() * 10, random() * 10, random() * 10];
  const lump = (x, v) => 0.03 * (Math.sin(x * 2.3 + v * 1.9 + phase[0]) * Math.sin(x * 1.1 - v * 2.7 + phase[1]) + 0.5 * Math.sin(x * 6.1 + v * 4.3 + phase[2]));
  const profiles = rings.map(([, f]) => loop(thickness * f));
  const lengths = profiles[0].map((point, index, all) => (index === 0 ? 0 : Math.hypot(point[0] - all[index - 1][0], point[1] - all[index - 1][1])));
  for (let index = 1; index < lengths.length; index += 1) lengths[index] += lengths[index - 1];
  const count = profiles[0].length - 1;
  const slab = ruralGrid(count, rings.length - 1, (i, j) => {
    const [x, f] = rings[j];
    const [z, y, outer] = profiles[j][i];
    const bump = f < 0.5 ? 0 : outer * lump(x, lengths[i]) * f;
    const nz = z === 0 ? 0 : Math.sign(z) * s;
    // The verge droops a little where it overhangs the gable.
    const droop = f < 1 ? (1 - f) * 0.08 : 0;
    return [x, y + bump * c - droop, z + bump * nz, x, lengths[i]];
  }, [Math.floor(count / 4), Math.floor(rings.length / 2), ruralV(0, 1, 0)]);
  // The thinned ends of the slab, closed.
  const cap = (j, facing) => ruralPolygon(profiles[j].slice(0, -1).map(([z, y]) => ruralV(rings[j][0], y - (1 - rings[j][1]) * 0.08, z)), facing, (point) => [point.z, point.y]);
  return { parts: [slab, cap(0, ruralV(-1, 0, 0)), cap(rings.length - 1, ruralV(1, 0, 0))], apex: ridgeY + thickness / c, ridgeY, eaveRun };
}

/**
 * The block-cut ridge over the apex: a raised band of fresh straw
 * `lift` thick, its lower edge cut in scallops, pinned down with hazel
 * liggers along it and crossed spars between them.
 */
function ruralThatchRidge({ halfLength, pitch, apex, lift = 0.1 }) {
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  const X = halfLength - 0.05;
  const edge = (x) => 0.5 + 0.11 * Math.abs(Math.sin((Math.PI * x) / 0.42));
  const columns = Math.ceil((2 * X) / 0.05);
  const across = [-1.0001, -1, -0.8, -0.6, -0.4, -0.2, -0.07, 0, 0.07, 0.2, 0.4, 0.6, 0.8, 1, 1.0001];
  const surface = (x, a, raised) => {
    const d = Math.abs(a) * edge(x);
    const side = Math.sign(a);
    const blend = Math.min(1, Math.abs(a) * 6);
    const nz = side * s * blend;
    const ny = c * blend + (1 - blend);
    const length = Math.hypot(nz, ny);
    const taper = ruralClamp((X - Math.abs(x)) / 0.25);
    const up = raised * lift * taper + (Math.abs(a) < 0.1 ? 0.04 * taper : 0);
    return [x, apex - d * s + (up * ny) / length, side * d * c + (up * nz) / length];
  };
  const band = ruralGrid(columns, across.length - 1, (i, j) => {
    const x = -X + (2 * X * i) / columns;
    const a = across[j];
    const [px, py, pz] = surface(x, Math.max(-1, Math.min(1, a)), Math.abs(a) > 1 ? 0 : 1);
    return [px, py, pz, x, a * edge(x)];
  }, [Math.floor(columns / 2), 7, ruralV(0, 1, 0)]);
  const sticks = [];
  for (const side of [-1, 1]) {
    const at = (x, d) => {
      const [px, py, pz] = surface(x, side * d / 0.55, 1);
      return ruralV(px, py + 0.012, pz);
    };
    for (const d of [0.16, 0.42]) sticks.push(ruralStick(at(-X + 0.1, d), at(X - 0.1, d), 0.022, 0.022));
    for (let x = -X + 0.2; x < X - 0.3; x += 0.26) {
      sticks.push(ruralStick(at(x, 0.16), at(x + 0.26, 0.42), 0.016, 0.016));
      sticks.push(ruralStick(at(x + 0.26, 0.16), at(x, 0.42), 0.016, 0.016));
    }
  }
  return { band, sticks };
}

const RURAL_COTTAGE = { halfLength: 2.2, halfSpan: 1.5, plinth: 0.45, wallTop: 2.45, pitch: (50 * Math.PI) / 180, overhang: 0.45, verge: 0.3, thickness: 0.42 };

/**
 * One cottage of the green, in its own frame (door on +z): a rubble plinth,
 * limewashed wattle-and-daub walls, framed in oak on some, small casement
 * windows set deep in the wall with sills and plank shutters, a ledged plank
 * door over a stone step, a long-straw thatched roof with a block-cut ridge,
 * and a stone chimney stack through the ridge. Pushes its parts onto `parts`.
 */
function ruralCottage(parts, { framed, seed, gableWindow }) {
  const { halfLength: hw, halfSpan: hd, plinth, wallTop, pitch, overhang, verge, thickness } = RURAL_COTTAGE;
  const slope = Math.tan(pitch);
  const random = ruralRandom(seed);
  const ridgeInner = wallTop + hd * slope;
  const depth = 0.2;
  const door = { x: 0, width: 0.92, bottom: 0.15, top: 1.92 };
  const faces = [
    // [turn, offset, half width, openings: windows [x, sill, width, height, shutters]]
    { turn: 0, at: hd, half: hw, windows: [[-1.4, 1.0, 0.62, 0.62, true], [1.4, 1.0, 0.62, 0.62, true]], door },
    { turn: Math.PI, at: hd, half: hw, windows: [[-0.9, 1.0, 0.62, 0.62, false], [0.95, 1.05, 0.5, 0.55, false]] },
    { turn: Math.PI / 2, at: hw, half: hd, windows: gableWindow ? [[0, 2.7, 0.46, 0.48, false]] : [], gable: true },
    { turn: -Math.PI / 2, at: hw, half: hd, windows: [], gable: true },
  ];
  for (const face of faces) {
    const local = { daub: [], timber: [], glass: [], stone: [] };
    // The wall: its outline (the gable up under the thatch, the door cut down to the step) and its window holes.
    const outline = face.gable
      ? [[-face.half, plinth], [face.half, plinth], [face.half, wallTop], [0, ridgeInner - 0.04], [-face.half, wallTop]]
      : face.door
        ? [[-face.half, plinth], [door.x - door.width / 2, plinth], [door.x - door.width / 2, door.top], [door.x + door.width / 2, door.top], [door.x + door.width / 2, plinth], [face.half, plinth], [face.half, wallTop], [-face.half, wallTop]]
        : [[-face.half, plinth], [face.half, plinth], [face.half, wallTop], [-face.half, wallTop]];
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const [x, sill, width, height] of face.windows) {
      shape.holes.push(new THREE.Path([new THREE.Vector2(x - width / 2, sill), new THREE.Vector2(x - width / 2, sill + height), new THREE.Vector2(x + width / 2, sill + height), new THREE.Vector2(x + width / 2, sill)]));
    }
    local.daub.push(new THREE.ShapeGeometry(shape));
    const openings = face.windows.map(([x, sill, width, height]) => [x - width / 2, sill, x + width / 2, sill + height]);
    if (face.door) openings.push([door.x - door.width / 2, door.bottom, door.x + door.width / 2, door.top]);
    // Each opening's reveal: the wall's thickness, limewashed.
    openings.forEach(([x0, y0, x1, y1], index) => {
      const isDoor = face.door && index === openings.length - 1;
      local.daub.push(
        ruralQuad(ruralV(x0, y0, -depth), ruralV(x0, y0, 0), ruralV(x0, y1, 0), ruralV(x0, y1, -depth)),
        ruralQuad(ruralV(x1, y0, 0), ruralV(x1, y0, -depth), ruralV(x1, y1, -depth), ruralV(x1, y1, 0)),
        ruralQuad(ruralV(x0, y1, 0), ruralV(x1, y1, 0), ruralV(x1, y1, -depth), ruralV(x0, y1, -depth)),
      );
      if (!isDoor) local.daub.push(ruralQuad(ruralV(x0, y0, -depth), ruralV(x1, y0, -depth), ruralV(x1, y0, 0), ruralV(x0, y0, 0)));
    });
    for (const [x, sill, width, height, shutters] of face.windows) {
      const x0 = x - width / 2;
      const x1 = x + width / 2;
      const y1 = sill + height;
      // The casement: leaded lights in an oak frame with a mullion, set back in the reveal.
      local.glass.push(ruralQuad(ruralV(x0, sill, -depth + 0.04), ruralV(x1, sill, -depth + 0.04), ruralV(x1, y1, -depth + 0.04), ruralV(x0, y1, -depth + 0.04)));
      const z = -depth + 0.07;
      local.timber.push(
        ruralBox(width, 0.05, 0.06, x, sill + 0.025, z), ruralBox(width, 0.05, 0.06, x, y1 - 0.025, z),
        ruralBox(0.05, height, 0.06, x0 + 0.025, sill + height / 2, z), ruralBox(0.05, height, 0.06, x1 - 0.025, sill + height / 2, z),
        ruralBox(0.045, height, 0.06, x, sill + height / 2, z),
      );
      // An oak sill sloped to throw the rain clear, and a lintel over the opening.
      local.timber.push(ruralBox(width + 0.18, 0.06, 0.3, x, sill - 0.03, -0.06, 0, 0.12));
      if (!framed) local.timber.push(ruralBox(width + 0.36, 0.13, 0.08, x, y1 + 0.075, 0.01));
      if (shutters) {
        // Ledged plank shutters, folded back flat against the wall: three boards and two ledges each.
        for (const side of [-1, 1]) {
          const leaf = width / 2 + 0.02;
          const near = side < 0 ? x0 - 0.09 : x1 + 0.09;
          const centre = near + (side * leaf) / 2;
          for (let board = 0; board < 3; board += 1) {
            const bx = near + side * (leaf * (board + 0.5)) / 3;
            local.timber.push(ruralBox(leaf / 3 - 0.008, height + 0.04, 0.025, bx, sill + height / 2, 0.05 + random() * 0.006));
          }
          for (const ly of [sill + 0.12, y1 - 0.12]) local.timber.push(ruralBox(leaf - 0.04, 0.07, 0.02, centre, ly, 0.072));
        }
      }
    }
    if (face.door) {
      // A ledged door of four boards with iron strap hinges and a ring, behind an oak frame, over a stone step.
      const boards = 4;
      const width = door.width - 0.04;
      for (let board = 0; board < boards; board += 1) {
        const bx = door.x - width / 2 + (width * (board + 0.5)) / boards;
        const plank = new THREE.BoxGeometry(width / boards - 0.012, door.top - door.bottom - 0.02, 0.045);
        // The grain runs up the board: its uv turned.
        const uvs = ruralBoxUv(plank).attributes.uv;
        for (let index = 0; index < uvs.count; index += 1) uvs.setXY(index, uvs.getY(index), uvs.getX(index) + board * 0.31);
        local.timber.push(ruralAt(plank, bx, (door.top + door.bottom) / 2, -depth + 0.05 + random() * 0.006));
      }
      const iron = [];
      for (const hy of [door.bottom + 0.3, door.top - 0.3]) iron.push(ruralBox(width * 0.7, 0.045, 0.012, door.x - width * 0.15, hy, -depth + 0.08));
      iron.push(ruralAt(new THREE.TorusGeometry(0.045, 0.008, 4, 10), door.x + width * 0.32, 1.0, -depth + 0.085));
      for (const piece of iron) local.timber.push(ruralTint(piece, [0.16, 0.15, 0.15]));
      local.timber.push(
        ruralBox(0.09, door.top - door.bottom + 0.09, 0.1, door.x - door.width / 2 - 0.045, (door.top + door.bottom + 0.09) / 2, 0.0),
        ruralBox(0.09, door.top - door.bottom + 0.09, 0.1, door.x + door.width / 2 + 0.045, (door.top + door.bottom + 0.09) / 2, 0.0),
        ruralBox(door.width + 0.3, 0.12, 0.1, door.x, door.top + 0.06, 0.0),
      );
      local.stone.push(ruralBox(door.width + 0.3, door.bottom, 0.5, door.x, door.bottom / 2, 0.02));
    }
    if (framed) {
      // Oak framing, proud of the daub: sill beam, mid rail and wall plate between posts, the posts at each opening's sides, and braces.
      const posts = new Set([-face.half + 0.09, face.half - 0.09]);
      for (const [x0, , x1] of openings) {
        posts.add(x0 - 0.07);
        posts.add(x1 + 0.07);
      }
      if (face.gable) posts.add(0);
      const xs = [...posts].sort((a, b) => a - b);
      const blocked = (xa, xb, y) => openings.some(([x0, y0, x1, y1]) => xb > x0 && xa < x1 && y > y0 - 0.1 && y < y1 + 0.1);
      for (const x of xs) {
        const clear = openings.filter(([x0, , x1]) => x > x0 && x < x1);
        if (clear.length) continue;
        const atDoor = face.door && Math.abs(Math.abs(x - door.x) - (door.width / 2 + 0.07)) < 0.01;
        const bottom = atDoor ? door.bottom : plinth;
        local.timber.push(ruralBox(0.15, wallTop - bottom, 0.08, x, (wallTop + bottom) / 2, 0.012));
      }
      for (const y of [plinth + 0.07, 1.78, wallTop - 0.07]) {
        for (let k = 0; k < xs.length - 1; k += 1) {
          const xa = xs[k] + 0.075;
          const xb = xs[k + 1] - 0.075;
          if (xb - xa < 0.05 || blocked(xa, xb, y)) continue;
          local.timber.push(ruralBox(xb - xa, 0.14, 0.08, (xa + xb) / 2, y, 0.012));
        }
      }
      // Corner braces, from the post up to the plate.
      for (const side of [-1, 1]) {
        const xPost = side * (face.half - 0.09);
        const xTop = side * (face.half - 0.75);
        if (blocked(Math.min(xPost, xTop), Math.max(xPost, xTop), 2.1)) continue;
        local.timber.push(ruralStick(ruralV(xPost - side * 0.07, 1.86, 0.012), ruralV(xTop, wallTop - 0.14, 0.012), 0.08, 0.12));
      }
      if (face.gable) {
        // The gable's tie beam, king post and raking struts.
        const kingTop = ridgeInner - 0.35;
        if (!face.windows.length) local.timber.push(ruralBox(0.15, kingTop - wallTop, 0.08, 0, (kingTop + wallTop) / 2, 0.012));
        for (const side of [-1, 1]) local.timber.push(ruralStick(ruralV(side * (face.half - 0.35), wallTop + 0.08, 0.012), ruralV(side * 0.1, ridgeInner - 0.6, 0.012), 0.08, 0.12));
      }
    } else if (face.gable) {
      // The unframed gable still shows its tie beam.
      local.timber.push(ruralBox(face.half * 2 + 0.1, 0.16, 0.08, 0, wallTop - 0.05, 0.012));
    }
    const matrix = new THREE.Matrix4().makeRotationY(face.turn).multiply(new THREE.Matrix4().makeTranslation(0, 0, face.at));
    for (const [kind, list] of Object.entries(local)) parts[kind].push(...ruralMoved(list, matrix));
  }
  // The plinth: rubble, a little proud of the wall, cut for the door.
  const proud = 0.06;
  const band = 0.32;
  parts.stone.push(
    ruralBox(hw + proud - door.width / 2 - 0.15, plinth, band, -(hw + proud + door.width / 2 + 0.15) / 2, plinth / 2, hd + proud - band / 2),
    ruralBox(hw + proud - door.width / 2 - 0.15, plinth, band, (hw + proud + door.width / 2 + 0.15) / 2, plinth / 2, hd + proud - band / 2),
    ruralBox(2 * (hw + proud), plinth, band, 0, plinth / 2, -(hd + proud - band / 2)),
    ruralBox(band, plinth, 2 * hd, hw + proud - band / 2, plinth / 2, 0),
    ruralBox(band, plinth, 2 * hd, -(hw + proud - band / 2), plinth / 2, 0),
  );
  if (framed) {
    for (const x of [-hw, hw]) for (const z of [-hd, hd]) parts.timber.push(ruralBox(0.17, wallTop - plinth, 0.17, x, (wallTop + plinth) / 2, z));
  }
  // The thatch, its ridge and the liggers that pin it.
  const roof = ruralThatchSlab({ halfLength: hw, halfSpan: hd, wallTop, pitch, overhang, verge, thickness, seed: seed + 7 });
  parts.thatch.push(...roof.parts);
  const ridge = ruralThatchRidge({ halfLength: hw + verge, pitch, apex: roof.apex });
  parts.ridge.push(ridge.band);
  for (const stick of ridge.sticks) parts.timber.push(ruralTint(stick, [1.25, 1.15, 0.95]));
  // The chimney stack through the ridge near one gable, with its cap and a pot.
  const stackX = hw - 0.65;
  const stackTop = roof.apex + 0.95;
  parts.stone.push(ruralBox(0.62, stackTop - (ridgeInner - 0.9), 0.56, stackX, (stackTop + ridgeInner - 0.9) / 2, 0));
  parts.stone.push(ruralBox(0.74, 0.08, 0.68, stackX, stackTop + 0.04, 0));
  parts.stone.push(ruralTint(ruralAt(new THREE.CylinderGeometry(0.1, 0.12, 0.34, 8), stackX, stackTop + 0.25, 0), [1.15, 0.72, 0.5]));
}

/** A rick's surface radius at angle θ and height y, before its lean. */
function ruralRickRadius(profileRadius, angle, y, phase) {
  return profileRadius * (1 + 0.045 * Math.sin(3 * angle + phase) + 0.03 * Math.sin(5 * angle + y * 2.1 + phase * 2) + 0.02 * Math.sin(9 * angle - y * 3 + phase));
}

/**
 * A round hay rick: a stack of hay a little wider at the top so the rain
 * drips clear, with a loose skirt where it meets the ground, under a
 * conical thatched cap with a topknot, held down by ropes over the cap
 * weighted with stones, and a rope round it. Slightly sagging and out of
 * true, as a rick settles.
 */
function ruralRick(parts, { x, z, size, seed }) {
  const random = ruralRandom(seed);
  const phase = random() * 6;
  const lean = (random() - 0.5) * 0.08;
  const leanTurn = random() * Math.PI * 2;
  const profile = [[1.2, 0], [1.08, 0.1], [1.0, 0.22], [1.05, 0.55], [1.11, 0.9], [1.13, 1.15], [1.28, 1.1], [1.31, 1.18], [1.05, 1.48], [0.75, 1.8], [0.42, 2.08], [0.14, 2.3], [0.0, 2.36]];
  const arc = [0];
  for (let index = 1; index < profile.length; index += 1) arc.push(arc[index - 1] + Math.hypot(profile[index][0] - profile[index - 1][0], profile[index][1] - profile[index - 1][1]));
  const sides = 28;
  const around = Math.round(2 * Math.PI * 1.05);
  const place = (radius, angle, y) => {
    const r = ruralRickRadius(radius, angle, y, phase) * size;
    const yy = y * size;
    const shove = lean * yy;
    return [x + Math.cos(angle) * r + Math.cos(leanTurn) * shove, yy - 0.04 * yy * yy * (radius > 1.15 ? 1 : 0), z + Math.sin(angle) * r * 0.95 + Math.sin(leanTurn) * shove];
  };
  const body = ruralGrid(sides, profile.length - 1, (i, j) => {
    const angle = (i / sides) * Math.PI * 2;
    const [radius, y] = profile[j];
    return [...place(radius, angle, y), (i / sides) * around, arc[j]];
  }, [0, 3, ruralV(1, 0, 0)]);
  const fresh = 0.9 + random() * 0.12;
  ruralTint(body, (px, py) => {
    const y = py / size;
    if (y < 0.28) return [0.62 * fresh, 0.55 * fresh, 0.4 * fresh];
    if (y < 1.1) return [1.02 * fresh, 0.95 * fresh, 0.74 * fresh];
    return [0.8 * fresh, 0.74 * fresh, 0.6 * fresh];
  });
  parts.thatch.push(body);
  // The topknot: a twist of straw bound at the apex.
  parts.thatch.push(ruralTint(ruralAt(new THREE.CylinderGeometry(0.03, 0.09, 0.26, 8), ...place(0, 0, 2.36).map((value, index) => value + (index === 1 ? 0.1 : 0))), [0.8, 0.72, 0.55]));
  // Ropes over the cap, from the apex down to below the eave, each weighted with a stone, and a rope round the cap.
  const rope = [0.62, 0.52, 0.38];
  const ropes = 6;
  for (let k = 0; k < ropes; k += 1) {
    const angle = (k / ropes) * Math.PI * 2 + phase;
    const points = [];
    for (let j = profile.length - 1; j >= 7; j -= 1) {
      const [radius, y] = profile[j];
      const [px, py, pz] = place(radius + 0.035, angle, y + 0.03);
      points.push(ruralV(px, py, pz));
    }
    const last = points[points.length - 1];
    const hang = ruralV(last.x, last.y - 0.42 * size, last.z);
    points.push(hang);
    for (let index = 0; index < points.length - 1; index += 1) parts.thatch.push(ruralTint(ruralRod(points[index], points[index + 1], 0.017, 4), rope));
    parts.stone.push(ruralTint(ruralAt(new THREE.DodecahedronGeometry(0.11 * size, 0), hang.x, hang.y - 0.08, hang.z, random() * 3, random(), random()), [0.95, 0.92, 0.88]));
  }
  const belt = [];
  for (let k = 0; k <= 24; k += 1) {
    const [px, py, pz] = place(0.92 + 0.04, (k / 24) * Math.PI * 2, 1.62);
    belt.push(ruralV(px, py, pz));
  }
  for (let index = 0; index < belt.length - 1; index += 1) parts.thatch.push(ruralTint(ruralRod(belt[index], belt[index + 1], 0.017, 4), rope));
}

/**
 * The village green's fence round the ellipse of stakes: woven hazel
 * hurdles between round stakes along most of it, a run of split-rail on
 * cleft oak posts for the rest, gapped where the paths come in.
 */
function ruralGreenFence(parts, { count, rx, rz, gap }) {
  const random = ruralRandom(311);
  const spot = (index) => {
    const angle = (index / count) * Math.PI * 2;
    return ruralV(Math.cos(angle) * rx, 0, Math.sin(angle) * rz);
  };
  const kept = (index) => !gap((((index % count) + count) % count / count) * Math.PI * 2);
  // Runs of kept stakes, numbered round from a gap.
  const start = [...Array(count).keys()].find((index) => !kept(index));
  let run = -1;
  const kindOf = new Map();
  for (let step = 1; step <= count; step += 1) {
    const index = (start + step) % count;
    if (!kept(index)) continue;
    if (!kept(index - 1)) run += 1;
    kindOf.set(index, run % 3 === 1 ? 'rail' : 'hurdle');
  }
  for (let index = 0; index < count; index += 1) {
    if (!kept(index)) continue;
    const here = spot(index);
    const next = (index + 1) % count;
    const kind = kindOf.get(index);
    const lean = (random() - 0.5) * 0.05;
    if (kind === 'rail' || (kept(index - 1) && kindOf.get((index - 1 + count) % count) === 'rail')) {
      // A cleft oak post.
      parts.timber.push(ruralTint(ruralBox(0.13, 1.15, 0.1, here.x, 0.56, here.z, random() * Math.PI, lean, lean), [0.92, 0.88, 0.84]));
    } else {
      // A round hazel stake, tapering.
      parts.timber.push(ruralTint(ruralRod(ruralV(here.x, -0.05, here.z), ruralV(here.x + lean, 1.22, here.z - lean), 0.042, 6, random() * 6, 0.032), [0.75, 0.68, 0.6]));
    }
    if (!kept(next)) continue;
    const there = spot(next);
    const along = new THREE.Vector3().subVectors(there, here);
    const length = along.length();
    const turn = -Math.atan2(along.z, along.x);
    if (kind === 'hurdle') {
      // A hurdle, its uv the panel's own square metre so its binding is along the top.
      const panel = new THREE.BoxGeometry(length - 0.04, 1.0, 0.045);
      panel.translate(0, 0.5, 0);
      const shift = random();
      const { uv, position: corner, normal: facing } = panel.attributes;
      for (let k = 0; k < uv.count; k += 1) uv.setXY(k, corner.getX(k) + shift, Math.abs(facing.getY(k)) > 0.5 ? 0.99 : corner.getY(k));
      ruralAt(panel, (here.x + there.x) / 2, 0.05 + random() * 0.04, (here.z + there.z) / 2, turn, 0, (random() - 0.5) * 0.04);
      parts.wattle.push(ruralTint(panel, [0.85 + random() * 0.2, 0.85 + random() * 0.15, 0.85 + random() * 0.1]));
    } else {
      // Two split rails, rough three-sided, run through mortises in the posts.
      for (const height of [0.42, 0.9]) {
        const a = ruralV(here.x - (along.x / length) * 0.08, height + (random() - 0.5) * 0.04, here.z - (along.z / length) * 0.08);
        const b = ruralV(there.x + (along.x / length) * 0.08, height + (random() - 0.5) * 0.04, there.z + (along.z / length) * 0.08);
        parts.timber.push(ruralTint(ruralRod(a, b, 0.065, 3, random() * 6, 0.055), [0.95, 0.9, 0.85]));
      }
    }
  }
}

/**
 * The village green's buildings and furniture: its cottages (at [x, z,
 * turn]), hay ricks (at [x, z]) and the fence round the ellipse of stakes.
 * Returns a group to add to the place.
 */
export function ruralMeadowProps({ cottages, ricks, fence }) {
  const parts = { daub: [], stone: [], timber: [], glass: [], thatch: [], ridge: [], wattle: [] };
  cottages.forEach(([x, z, turn], index) => {
    const own = { daub: [], stone: [], timber: [], glass: [], thatch: [], ridge: [] };
    ruralCottage(own, { framed: index % 2 === 0, seed: 101 + index * 17, gableWindow: index % 3 !== 1 });
    const matrix = new THREE.Matrix4().makeTranslation(x, 0, z).multiply(new THREE.Matrix4().makeRotationY(turn));
    // Each cottage its own: limewash white, cream or pale ochre; thatch of its own age; oak silvered, or tarred black on one.
    const wash = [[1, 1, 1], [1.0, 0.95, 0.84], [1.0, 0.9, 0.76], [0.98, 0.97, 0.94]][index % 4];
    const age = 0.82 + (index * 0.37 % 1) * 0.2;
    const oak = index === 2 ? [0.35, 0.33, 0.32] : [1, 0.97, 0.93];
    const north = (nz) => (nz < -0.3 ? 1 : 0);
    for (const geometry of ruralMoved(own.daub, matrix)) parts.daub.push(ruralTint(geometry, (px, py, pz, nx, ny, nz) => wash.map((value, k) => value * (north(nz) ? [0.93, 0.95, 0.9][k] : 1))));
    for (const geometry of ruralMoved(own.stone, matrix)) {
      if (!geometry.attributes.color) ruralTint(geometry, (px, py) => [0.95 - (py < 0.15 ? 0.15 : 0), 0.93 - (py < 0.15 ? 0.15 : 0), 0.9 - (py < 0.15 ? 0.18 : 0)]);
      parts.stone.push(geometry);
    }
    for (const geometry of ruralMoved(own.timber, matrix)) {
      if (!geometry.attributes.color) ruralTint(geometry, oak);
      parts.timber.push(geometry);
    }
    parts.glass.push(...ruralMoved(own.glass, matrix));
    // Thatch: grey-brown with age, darker and mossy towards the eaves and on the north slope.
    const thatchTint = (px, py, pz, nx, ny, nz) => {
      const low = ruralClamp((3.2 - py) / 1.4);
      const moss = ruralClamp(-nz * 1.6 - 0.3) * (0.5 + 0.5 * Math.sin(px * 1.7 + pz * 2.3 + index));
      return [
        age * (0.68 - 0.12 * low - 0.2 * moss),
        age * (0.61 - 0.1 * low - 0.08 * moss),
        age * (0.55 - 0.1 * low - 0.16 * moss),
      ];
    };
    for (const geometry of ruralMoved(own.thatch, matrix)) parts.thatch.push(ruralTint(geometry, thatchTint));
    for (const geometry of ruralMoved(own.ridge, matrix)) parts.thatch.push(ruralTint(geometry, [0.86, 0.79, 0.64]));
  });
  ricks.forEach(([x, z], index) => ruralRick(parts, { x, z, size: 0.95 + (index % 3) * 0.06, seed: 401 + index * 31 }));
  ruralGreenFence(parts, fence);
  const group = new THREE.Group();
  group.add(
    ruralMesh(parts.daub, ruralMaterial(ruralLimewash(), { roughness: 0.95 }), 0.5),
    ruralMesh(parts.stone, ruralMaterial(ruralRubble()), 1 / 1.5),
    ruralMesh(parts.timber, ruralMaterial(ruralOak(), { roughness: 0.85 }), 1),
    ruralMesh(parts.glass, ruralMaterial(ruralLeaded(), { roughness: 0.3, metalness: 0.2 }), 1 / 0.3, { cast: false }),
    ruralMesh(parts.thatch, ruralMaterial(ruralStraw(), { roughness: 1, normal: 1.2 }), 1),
    ruralMesh(parts.wattle, ruralMaterial(ruralWattle(), { roughness: 0.95, normal: 1.3 }), 1),
  );
  // The limewash is painted 2 m across and 4 m up from the ground: its v is height / 4.
  const daub = group.children[0].geometry.attributes;
  for (let index = 0; index < daub.uv.count; index += 1) daub.uv.setY(index, daub.position.getY(index) / 4);
  return group;
}

// ---- the field ---------------------------------------------------------------------

/**
 * Post-and-rail round the riding ground: squared oak posts every 4 m (as
 * the rail was), their tops cut on the slant to shed the rain, each leaning
 * its own way, and two sawn rails between, weathered silver-grey with the
 * damp darkening each post's foot and lichen on the tops.
 */
export function ruralFieldRail({ halfX, halfZ, spacing = 4, top = 0.9 }) {
  const random = ruralRandom(907);
  const timber = [];
  const sides = [[2 * halfX, 0, -halfZ, 0], [2 * halfX, 0, halfZ, 0], [2 * halfZ, -halfX, 0, Math.PI / 2], [2 * halfZ, halfX, 0, Math.PI / 2]];
  const done = new Set();
  for (const [length, cx, cz, turn] of sides) {
    const posts = [];
    for (let at = -length / 2; at <= length / 2 + 1e-6; at += spacing) posts.push(ruralV(cx + (turn ? 0 : at), 0, cz + (turn ? at : 0)));
    for (const post of posts) {
      const key = `${post.x.toFixed(2)},${post.z.toFixed(2)}`;
      if (done.has(key)) continue;
      done.add(key);
      const geometry = new THREE.BoxGeometry(0.15, 1.2, 0.13, 1, 4, 1);
      // The top cut on the slant.
      const position = geometry.attributes.position;
      for (let index = 0; index < position.count; index += 1) if (position.getY(index) > 0.59) position.setY(index, 0.6 + position.getX(index) * 0.5);
      geometry.computeVertexNormals();
      ruralBoxUv(geometry);
      ruralAt(geometry, post.x, 0.55, post.z, turn + (random() < 0.5 ? 0 : Math.PI) + (random() - 0.5) * 0.15, (random() - 0.5) * 0.04, (random() - 0.5) * 0.04);
      const grey = 0.85 + random() * 0.25;
      timber.push(ruralTint(geometry, (px, py) => {
        const damp = ruralClamp((0.35 - py) / 0.35);
        const lichen = py > 1.05 ? 1 : 0;
        return [grey * (1 - 0.45 * damp) * (1 - 0.1 * lichen), grey * (1 - 0.4 * damp) * (1 + 0.05 * lichen), grey * (1 - 0.45 * damp) * (1 - 0.15 * lichen)];
      }));
    }
    for (let k = 0; k < posts.length - 1; k += 1) {
      for (const height of [top - 0.43, top]) {
        const a = posts[k].clone();
        const b = posts[k + 1].clone();
        a.y = height + (random() - 0.5) * 0.03;
        b.y = height + (random() - 0.5) * 0.03;
        // Through the post's mortise to a little beyond it; sagging a touch in the middle.
        const along = new THREE.Vector3().subVectors(b, a).normalize().multiplyScalar(0.05);
        a.sub(along);
        b.add(along);
        const mid = a.clone().lerp(b, 0.5);
        mid.y -= 0.02 + random() * 0.02;
        const grey = 0.9 + random() * 0.2;
        const roll = (random() - 0.5) * 0.2;
        for (const [p, q] of [[a, mid], [mid, b]]) timber.push(ruralTint(ruralStick(p, q, 0.075, 0.1, roll), [grey, grey * 0.98, grey * 0.95]));
      }
    }
  }
  return ruralMesh(timber, ruralMaterial(ruralOak(), { roughness: 0.88 }), 1);
}

// ---- Sekigahara --------------------------------------------------------------------

/**
 * Ishigaki: the castle's base of big roughly dressed granite stones fitted
 * dry, wedge stones between. One tile is 3 m.
 */
function ruralIshigaki() {
  return ruralPainted('rural:ishigaki', 512, 512, { relief: 5 }, (sheet) => {
    ruralPaintStones(sheet, {
      rows: [36, 120], widths: [46, 210], gap: 1.5, joint: '#34322e', angular: true,
      palette: [[150, 146, 138], [122, 118, 112], [172, 166, 156], [104, 100, 96], [146, 134, 116], [132, 126, 110], [90, 88, 84]], speckle: 6000,
    });
    // Rain streaks and dark lichen down the face.
    for (let index = 0; index < 60; index += 1) {
      const x = sheet.rr(0, 512);
      const y = sheet.rr(0, 512);
      const length = sheet.rr(40, 200);
      sheet.wrap(x - 4, y, x + 4, y + length, (ox, oy) => {
        const gradient = sheet.colour.createLinearGradient(0, y + oy, 0, y + oy + length);
        gradient.addColorStop(0, 'rgba(50,50,44,0.3)');
        gradient.addColorStop(1, 'rgba(50,50,44,0)');
        sheet.colour.fillStyle = gradient;
        sheet.colour.fillRect(x + ox, y + oy, sheet.rr(2, 8), length);
      });
    }
  });
}

/**
 * Hongawarabuki: a roof of fired grey tiles, rows of round cover tiles
 * running down the slope over the flat pan tiles between them, the courses
 * stepping every 0.3 m. One tile of the texture is 0.6 m by 0.6 m: two rows, two courses.
 */
function ruralRoofTiles() {
  return ruralPainted('rural:kawara', 256, 256, { relief: 6 }, ({ colour, bump, width, height, rr, grey }) => {
    colour.fillStyle = '#4c5257';
    colour.fillRect(0, 0, width, height);
    const row = width / 2;
    for (let k = 0; k < 2; k += 1) {
      const centre = k * row + row / 2;
      // The pan tiles: a shallow trough between the cover rows.
      const pan = bump.createLinearGradient(centre - row / 2, 0, centre + row / 2, 0);
      pan.addColorStop(0, grey(0.45));
      pan.addColorStop(0.5, grey(0.3));
      pan.addColorStop(1, grey(0.45));
      bump.fillStyle = pan;
      bump.fillRect(centre - row / 2, 0, row, height);
    }
    for (let k = 0; k <= 2; k += 1) {
      const x = k * row;
      // The round cover tiles, proud, lit along their crown.
      const cover = bump.createLinearGradient(x - 18, 0, x + 18, 0);
      cover.addColorStop(0, grey(0.45));
      cover.addColorStop(0.5, grey(1));
      cover.addColorStop(1, grey(0.45));
      bump.fillStyle = cover;
      bump.fillRect(x - 18, 0, 36, height);
      const shade = colour.createLinearGradient(x - 18, 0, x + 18, 0);
      shade.addColorStop(0, 'rgba(20,22,26,0.7)');
      shade.addColorStop(0.35, 'rgba(110,116,122,0.6)');
      shade.addColorStop(0.65, 'rgba(80,86,92,0.4)');
      shade.addColorStop(1, 'rgba(20,22,26,0.7)');
      colour.fillStyle = shade;
      colour.fillRect(x - 18, 0, 36, height);
    }
    // Courses: each tile's lower end laps over the next, a step and a shadow line.
    for (let course = 0; course < 2; course += 1) {
      const y = course * (height / 2) + height / 2 - 4;
      colour.fillStyle = 'rgba(15,16,18,0.6)';
      colour.fillRect(0, y, width, 4);
      bump.fillStyle = grey(0.15);
      bump.fillRect(0, y, width, 4);
    }
    for (let index = 0; index < 900; index += 1) {
      colour.fillStyle = `rgba(${rr(0, 1) > 0.5 ? '200,205,210' : '10,10,12'},${rr(0.04, 0.12)})`;
      colour.fillRect(rr(0, width), rr(0, height), rr(1, 4), rr(1, 4));
    }
  });
}

/**
 * A storey of the keep, one bay (2.4 m) wide by one storey high (v 0 at
 * its floor, 1 under the eaves): black-stained boards below (shitami-
 * itabari: clapboards with battens over them), white lime plaster above,
 * and a barred window in each bay, with grime streaked down from its sill.
 */
function ruralKeepWall() {
  return ruralPainted('rural:keepwall', 512, 512, { relief: 4 }, ({ colour, bump, width, height, rr, grey }) => {
    const boardsTop = height * 0.6;
    colour.fillStyle = '#eceae2';
    colour.fillRect(0, 0, width, boardsTop);
    for (let index = 0; index < 200; index += 1) {
      colour.fillStyle = `rgba(${rr(180, 230)},${rr(178, 225)},${rr(170, 215)},0.1)`;
      colour.beginPath();
      colour.arc(rr(0, width), rr(0, boardsTop), rr(6, 30), 0, Math.PI * 2);
      colour.fill();
    }
    // The boards: horizontal, each lapping the one below, with battens across them.
    colour.fillStyle = '#26241f';
    colour.fillRect(0, boardsTop, width, height - boardsTop);
    for (let y = boardsTop + 6; y < height; y += 22) {
      colour.fillStyle = 'rgba(0,0,0,0.6)';
      colour.fillRect(0, y + 18, width, 4);
      colour.fillStyle = `rgba(120,110,95,${rr(0.05, 0.15)})`;
      colour.fillRect(0, y, width, 8);
      const lap = bump.createLinearGradient(0, y, 0, y + 22);
      lap.addColorStop(0, grey(0.4));
      lap.addColorStop(0.9, grey(0.62));
      lap.addColorStop(1, grey(0.3));
      bump.fillStyle = lap;
      bump.fillRect(0, y, width, 22);
    }
    for (let k = 0; k < 3; k += 1) {
      const x = (k + 0.5) * (width / 3);
      colour.fillStyle = '#1c1b18';
      colour.fillRect(x - 6, boardsTop, 12, height - boardsTop);
      bump.fillStyle = grey(0.85);
      bump.fillRect(x - 6, boardsTop, 12, height - boardsTop);
    }
    // A moulding at the top of the boards.
    colour.fillStyle = '#1c1b18';
    colour.fillRect(0, boardsTop - 6, width, 10);
    bump.fillStyle = grey(0.85);
    bump.fillRect(0, boardsTop - 6, width, 10);
    // The window: a black frame, sunk, with five plastered bars.
    const x0 = width * 0.37;
    const x1 = width * 0.63;
    const y0 = height * 0.2;
    const y1 = height * 0.48;
    for (let index = 0; index < 14; index += 1) {
      const x = rr(x0, x1);
      const length = rr(20, 90);
      const streak = colour.createLinearGradient(0, y1, 0, y1 + length);
      streak.addColorStop(0, 'rgba(70,64,52,0.3)');
      streak.addColorStop(1, 'rgba(70,64,52,0)');
      colour.fillStyle = streak;
      colour.fillRect(x, y1, rr(2, 6), Math.min(length, boardsTop - y1 - 6));
    }
    colour.fillStyle = '#1a1917';
    colour.fillRect(x0 - 8, y0 - 8, x1 - x0 + 16, y1 - y0 + 16);
    bump.fillStyle = grey(0.7);
    bump.fillRect(x0 - 8, y0 - 8, x1 - x0 + 16, y1 - y0 + 16);
    colour.fillStyle = '#0d0d0e';
    colour.fillRect(x0, y0, x1 - x0, y1 - y0);
    bump.fillStyle = grey(0.1);
    bump.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (let k = 1; k <= 5; k += 1) {
      const x = x0 + ((x1 - x0) * k) / 6;
      colour.fillStyle = '#c9c6bc';
      colour.fillRect(x - 4, y0, 8, y1 - y0);
      bump.fillStyle = grey(0.55);
      bump.fillRect(x - 4, y0, 8, y1 - y0);
    }
  });
}

/**
 * A tiled roof skirt round a storey of the keep: it runs from the inner
 * rectangle [hwI, hdI] at yI (against the storey above) down and out to the
 * eaves [hwO, hdO] at yO, sagging a little in the middle of its slope (the
 * concave Japanese roof) and its eave line sweeping up towards each corner
 * (sori), `lift` at the tip. It has a soffit under it and a fascia at the
 * eave, `thick` deep. Each side's uv runs along the eave and down the slope in metres.
 */
function ruralSkirt({ hwI, hdI, yI, hwO, hdO, yO, lift = 0.35, sag = 0.12, thick = 0.22, gable = false }) {
  const parts = [];
  const cornersI = [[hwI, hdI], [-hwI, hdI], [-hwI, -hdI], [hwI, -hdI]];
  const cornersO = [[hwO, hdO], [-hwO, hdO], [-hwO, -hdO], [hwO, -hdO]];
  const along = 16;
  const down = 6;
  for (let side = 0; side < 4; side += 1) {
    const [i0, i1] = [cornersI[side], cornersI[(side + 1) % 4]];
    const [o0, o1] = [cornersO[side], cornersO[(side + 1) % 4]];
    const edge = Math.hypot(o1[0] - o0[0], o1[1] - o0[1]);
    const run = Math.hypot((i0[0] + i1[0]) / 2 - (o0[0] + o1[0]) / 2, (i0[1] + i1[1]) / 2 - (o0[1] + o1[1]) / 2);
    const slopeLength = Math.hypot(run, yI - yO);
    const point = (s, r, under) => {
      const ix = ruralLerp(i0[0], i1[0], s);
      const iz = ruralLerp(i0[1], i1[1], s);
      const ox = ruralLerp(o0[0], o1[0], s);
      const oz = ruralLerp(o0[1], o1[1], s);
      const corner = Math.pow(Math.abs(2 * s - 1), 4);
      const y = ruralLerp(yI, yO, r) - sag * Math.sin(Math.PI * r) + lift * r * r * corner - (under ? thick * (0.4 + 0.6 * r) : 0);
      return [ruralLerp(ix, ox, r), y, ruralLerp(iz, oz, r)];
    };
    const outward = ruralV((o0[0] + o1[0]) / 2, 0, (o0[1] + o1[1]) / 2).normalize();
    // Top: the tiles.
    parts.push(['tiles', ruralGrid(along, down, (i, j) => [...point(i / along, j / down, false), (i / along) * edge, slopeLength * (1 - j / down)], [along / 2, down, ruralV(outward.x, 1, outward.z)])]);
    // Underneath: the soffit, its rafters showing as the tile's courses would (it is in shadow).
    parts.push(['soffit', ruralGrid(along, down, (i, j) => [...point(i / along, j / down, true), (i / along) * edge, slopeLength * (j / down)], [along / 2, down, ruralV(0, -1, 0)])]);
    // The fascia: a band along the eave joining the two.
    parts.push(['fascia', ruralGrid(along, 1, (i, j) => [...point(i / along, 1, j === 0), (i / along) * edge, j * thick], [along / 2, 0, outward])]);
  }
  if (gable) {
    // The top roof's gables (irimoya): from the inner rectangle's long sides up to the ridge, gable boards at the ends, white gable faces.
    const ridgeY = yI + hdI * 0.95;
    const over = 0.14;
    for (const side of [-1, 1]) {
      const run = Math.hypot(hdI, ridgeY - yI);
      parts.push(['tiles', ruralGrid(8, 3, (i, j) => {
        const x = -hwI - over + ((2 * (hwI + over)) * i) / 8;
        const r = j / 3;
        return [x, ruralLerp(yI, ridgeY, r) - 0.05 * Math.sin(Math.PI * r), side * hdI * (1 + 0.05) * (1 - r), x + hwI, run * (1 - r)];
      }, [4, 1, ruralV(0, 1, side)])]);
      parts.push(['soffit', ruralGrid(8, 1, (i, j) => {
        const x = -hwI - over + ((2 * (hwI + over)) * i) / 8;
        return [x, ruralLerp(yI, ridgeY, j) - 0.12, side * hdI * (1 - j), x, j];
      }, [4, 0, ruralV(0, -1, 0)])]);
    }
    for (const end of [-1, 1]) {
      const x = end * (hwI - 0.04);
      parts.push(['plaster', ruralPolygon([ruralV(x, yI - 0.3, -hdI), ruralV(x, yI - 0.3, hdI), ruralV(x, ridgeY - 0.05, 0)], ruralV(end, 0, 0), (p) => [p.z, p.y])]);
      // Bargeboards along the gable's two rakes, and the gegyo hanging board at the apex.
      for (const side of [-1, 1]) parts.push(['trim', ruralStick(ruralV(end * (hwI + over), yI - 0.02, side * hdI * 1.06), ruralV(end * (hwI + over), ridgeY + 0.06, 0), 0.07, 0.2)]);
      parts.push(['trim', ruralBox(0.06, 0.35, 0.4, end * (hwI + over + 0.01), ridgeY - 0.2, 0)]);
    }
    // The ridge, its end tiles (onigawara) and a pair of shachi.
    parts.push(['trim', ruralBox(2 * (hwI + over) + 0.1, 0.24, 0.26, 0, ridgeY + 0.1, 0)]);
    for (const end of [-1, 1]) {
      parts.push(['trim', ruralBox(0.14, 0.42, 0.36, end * (hwI + over + 0.08), ridgeY + 0.2, 0)]);
      parts.push(...ruralShachi(end * (hwI + over - 0.05), ridgeY + 0.22, end));
    }
  }
  return parts;
}

/** A shachi: the gilded tiger-headed carp that stands on each end of a keep's ridge, tail up, as a charm against fire. */
function ruralShachi(x, y, end) {
  const parts = [];
  // The body arched head-down on the ridge, the tail flung up and outward, the fins.
  const body = new THREE.SphereGeometry(0.12, 8, 6);
  body.scale(1, 2.1, 0.7);
  parts.push(['gold', ruralAt(body, x - end * 0.03, y + 0.24, 0, 0, 0, end * 0.3)]);
  const tail = new THREE.ConeGeometry(0.07, 0.3, 6);
  parts.push(['gold', ruralAt(tail, x + end * 0.07, y + 0.55, 0, 0, 0, end * 0.7)]);
  const fin = new THREE.ConeGeometry(0.13, 0.05, 4);
  fin.rotateX(Math.PI / 2);
  parts.push(['gold', ruralAt(fin, x + end * 0.17, y + 0.7, 0, 0, 0, end * 0.7)]);
  parts.push(['gold', ruralAt(new THREE.SphereGeometry(0.09, 8, 6), x - end * 0.08, y + 0.06, 0)]);
  return parts;
}

/**
 * The castle on its hill north of the field: a tenshu (keep) of three
 * roofs over its ishigaki, the battered base of fitted stones that curves
 * up steeper towards its top, a low plastered wall with a tiled coping
 * round the base's top; storeys of white plaster over black boards with
 * barred windows; at each storey a tiled roof skirt sweeping up at its
 * corners, gabled dormers (chidori-hafu) on the lower two, the top roof
 * hipped and gabled (irimoya) with a shachi at each end of its ridge.
 */
export function ruralCastle({ hillColour }) {
  const castle = new THREE.Group();
  const parts = { stone: [], tiles: [], soffit: [], fascia: [], wall: [], plaster: [], trim: [], gold: [] };
  // The hill, as before, now lumpy and patchy.
  const hill = new THREE.SphereGeometry(9, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const position = hill.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const y = position.getY(index);
    const wobble = 1 + 0.05 * Math.sin(x * 0.9 + z * 0.4) + 0.04 * Math.sin(z * 1.3 - x * 0.7);
    position.setXYZ(index, x * wobble, y * 0.45, z * wobble);
  }
  hill.computeVertexNormals();
  ruralTint(hill, (x, y, z) => {
    const patch = 0.92 + 0.1 * Math.sin(x * 1.7 + z * 0.9) * Math.sin(z * 1.1 - x * 0.6);
    return [patch, patch * (1 + 0.04 * Math.sin(x)), patch * 0.95];
  });
  const hillMesh = new THREE.Mesh(hill, new THREE.MeshStandardMaterial({ color: hillColour, roughness: 0.95, vertexColors: true }));
  hillMesh.receiveShadow = true;
  castle.add(hillMesh);
  const S = 0.8;
  // The ishigaki: its sides curve from a gentle batter at the foot to nearly upright at the top.
  const base = { hwB: 6.2, hdB: 5.4, hwT: 4.9, hdT: 4.1, y0: 2.0, y1: 7.0 };
  const curve = (t) => 1 - Math.pow(t, 0.6);
  for (let side = 0; side < 4; side += 1) {
    const corner = (k, t) => {
      const sx = [1, -1, -1, 1][(side + k) % 4];
      const sz = [1, 1, -1, -1][(side + k) % 4];
      const f = curve(t);
      return [sx * ruralLerp(base.hwT, base.hwB, f), ruralLerp(base.y0, base.y1, t), sz * ruralLerp(base.hdT, base.hdB, f)];
    };
    const outward = [ruralV(0, 0, 1), ruralV(-1, 0, 0), ruralV(0, 0, -1), ruralV(1, 0, 0)][side];
    const edge = side % 2 === 0 ? 2 * base.hwB : 2 * base.hdB;
    parts.stone.push(ruralGrid(1, 8, (i, j) => {
      const t = j / 8;
      return [...corner(i, t), i * edge, t * 5.4];
    }, [0, 4, outward]));
  }
  parts.stone.push(ruralBox(2 * base.hwT, 0.1, 2 * base.hdT, 0, base.y1 - 0.05, 0));
  // The low wall round the top of the base, with its tiled coping.
  for (const [length, x, z, turn] of [[2 * base.hwT, 0, base.hdT - 0.15, 0], [2 * base.hwT, 0, -base.hdT + 0.15, 0], [2 * base.hdT - 0.3, base.hwT - 0.15, 0, Math.PI / 2], [2 * base.hdT - 0.3, -base.hwT + 0.15, 0, Math.PI / 2]]) {
    parts.plaster.push(ruralBox(length, 0.6, 0.22, x, base.y1 + 0.3, z, turn));
    parts.tiles.push(ruralBox(length + 0.1, 0.1, 0.46, x, base.y1 + 0.65, z, turn));
    parts.trim.push(ruralBox(length + 0.1, 0.08, 0.1, x, base.y1 + 0.73, z, turn));
  }
  const storeys = [
    { hw: 4.1, hd: 3.3, y0: 7.0, height: 2.4 },
    { hw: 3.3, hd: 2.6, y0: 9.4, height: 2.0 },
    { hw: 2.4, hd: 1.9, y0: 11.4, height: 1.8 },
  ];
  storeys.forEach((storey, level) => {
    const { hw, hd, y0, height } = storey;
    // The walls: one bay of the painted wall to every 2.4 m or so, so the windows fall evenly.
    for (let side = 0; side < 4; side += 1) {
      const half = side % 2 === 0 ? hw : hd;
      const bays = Math.max(1, Math.round((2 * half) / 2.4));
      const geometry = ruralQuad(ruralV(-half, y0, 0), ruralV(half, y0, 0), ruralV(half, y0 + height, 0), ruralV(-half, y0 + height, 0));
      const uv = geometry.attributes.uv;
      for (let index = 0; index < uv.count; index += 1) uv.setXY(index, (uv.getX(index) / (2 * half)) * bays, uv.getY(index) / height);
      const turn = [0, Math.PI / 2, Math.PI, -Math.PI / 2][side];
      geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(turn).multiply(new THREE.Matrix4().makeTranslation(0, 0, side % 2 === 0 ? hd : hw)));
      parts.wall.push(geometry);
    }
    const next = storeys[level + 1];
    const top = !next;
    const yTop = y0 + height;
    const skirt = top
      ? ruralSkirt({ hwI: hw * 0.72, hdI: hd * 0.42, yI: yTop + 0.75, hwO: hw + 0.95, hdO: hd + 0.95, yO: yTop - 0.3, lift: 0.3, gable: true })
      : ruralSkirt({ hwI: next.hw, hdI: next.hd, yI: yTop + 0.55, hwO: hw + 0.95, hdO: hd + 0.95, yO: yTop - 0.3, lift: 0.35 });
    for (const [kind, geometry] of skirt) parts[kind].push(geometry);
    if (level < 2) {
      // Chidori-hafu: triangular gabled dormers on the skirt, on the long faces below, the short faces above.
      const faces = level === 0 ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
      for (const [fx, fz] of faces) {
        const reachO = fx ? hw + 0.95 : hd + 0.95;
        const reachI = fx ? next.hw : next.hd;
        const r = 0.55;
        const front = ruralLerp(reachI, reachO, r);
        const yFront = ruralLerp(yTop + 0.55, yTop - 0.3, r) - 0.12 * Math.sin(Math.PI * r);
        const width = level === 0 ? 2.6 : 2.0;
        const rise = width * 0.42;
        const back = reachI - 0.2;
        const turn = Math.atan2(fx, fz);
        const local = [];
        local.push(['plaster', ruralPolygon([ruralV(-width / 2, 0, 0), ruralV(width / 2, 0, 0), ruralV(0, rise, 0)], ruralV(0, 0, 1), (p) => [p.x, p.y])]);
        const deep = front - back + 0.3;
        for (const side of [-1, 1]) {
          const slope = Math.hypot(width / 2 + 0.15, rise + 0.15);
          local.push(['tiles', ruralGrid(4, 2, (i, j) => {
            const z = 0.25 - (deep * i) / 4;
            const t = j / 2;
            return [side * ruralLerp(width / 2 + 0.2, 0, t), ruralLerp(-0.1, rise + 0.12, t), z, z, slope * (1 - t)];
          }, [2, 1, ruralV(side, 1, 0)])]);
          local.push(['trim', ruralStick(ruralV(side * (width / 2 + 0.22), -0.12, 0.27), ruralV(0, rise + 0.14, 0.27), 0.06, 0.16)]);
        }
        local.push(['trim', ruralBox(0.12, 0.14, deep, 0, rise + 0.16, 0.25 - deep / 2)]);
        local.push(['trim', ruralBox(0.06, 0.3, 0.32, 0, rise - 0.12, 0.28)]);
        const matrix = new THREE.Matrix4().makeRotationY(turn).multiply(new THREE.Matrix4().makeTranslation(0, yFront, front));
        for (const [kind, geometry] of local) parts[kind].push(geometry.applyMatrix4(matrix));
      }
    }
  });
  const tiled = new THREE.MeshStandardMaterial({ color: 0xffffff, ...ruralRoofTilesMaps(), roughness: 0.6, metalness: 0.1, vertexColors: true });
  const plain = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, vertexColors: true, ...options });
  const group = new THREE.Group();
  const scaled = (list) => list.map((geometry) => geometry.scale(S, S, S));
  // The plaster of the gables and the base's wall takes the keep wall's white band.
  const plasterUv = (geometry) => {
    const uv = geometry.attributes.uv;
    for (let index = 0; index < uv.count; index += 1) uv.setXY(index, 0.1 + (index % 3) * 0.02, 0.85);
    return geometry;
  };
  // The eaves are plastered white under the tiles (as at Himeji), the soffit in its own shade.
  parts.wall.push(...parts.plaster.map(plasterUv), ...parts.soffit.map((geometry) => ruralTint(plasterUv(geometry), [0.82, 0.8, 0.77])), ...parts.fascia.map(plasterUv));
  group.add(
    ruralMesh(scaled(parts.stone), ruralMaterial(ruralIshigaki(), { roughness: 0.95, normal: 1.2 }), 1 / 3),
    ruralMesh(scaled(parts.tiles), tiled, 1 / 0.6),
    ruralMesh(scaled(parts.trim.map((geometry) => ruralTint(geometry, [0.7, 0.72, 0.75]))), tiled, 1 / 0.6),
    ruralMesh(scaled(parts.wall), ruralMaterial(ruralKeepWall(), { roughness: 0.9 }), 1),
    ruralMesh(scaled(parts.gold), plain(0xd8aa48, { roughness: 0.35, metalness: 0.55, emissive: 0x2a1a00 }), 1),
  );
  castle.add(group);
  return castle;
}

function ruralRoofTilesMaps() {
  const pair = ruralRoofTiles();
  return { map: pair.map, normalMap: pair.normalMap, normalScale: new THREE.Vector2(1.2, 1.2) };
}

/**
 * The bamboo palisade along a flank (z), gapped round x = 0: canes lashed
 * between pairs of horizontal rails with black palm-fibre cord, their tops
 * cut on the slant (outward) as a battlefield fence's were. Pushes onto `bamboo`.
 */
function ruralPalisade(bamboo, { z, from, to, gap, random }) {
  const outward = Math.sign(z) || 1;
  const cord = [0.12, 0.1, 0.08];
  const runs = [[from, -gap], [gap, to]];
  for (const [x0, x1] of runs) {
    const canes = [];
    for (let x = x0; x <= x1 + 1e-6; x += 0.32) canes.push(x);
    for (const x of canes) {
      const radius = 0.04 + random() * 0.015;
      const height = 1.6 + random() * 0.3;
      const cane = ruralRod(ruralV(0, -0.05, 0), ruralV(0, height, 0), radius, 7, random() * 6);
      // The top cut on the slant, the long side to the outside.
      const position = cane.attributes.position;
      for (let index = 0; index < position.count; index += 1) if (position.getY(index) > height - 1e-3) position.setY(index, height + position.getZ(index) * outward * 1.2);
      cane.computeVertexNormals();
      const uv = cane.attributes.uv;
      const shift = random();
      for (let index = 0; index < uv.count; index += 1) uv.setY(index, uv.getY(index) / 0.6 + shift);
      ruralAt(cane, x + (random() - 0.5) * 0.04, 0, z, 0, (random() - 0.5) * 0.04, (random() - 0.5) * 0.04);
      const tone = 0.85 + random() * 0.25;
      bamboo.push(ruralTint(cane, [tone, tone * (0.95 + random() * 0.08), tone * 0.9]));
    }
    // Rails: split bamboo either side of the canes, in lengths overlapping as cut.
    for (const height of [0.45, 1.25]) {
      for (const side of [-1, 1]) {
        for (let start = x0 - 0.15; start < x1; start += 3.6) {
          const end = Math.min(x1 + 0.15, start + 3.9);
          const rail = ruralRod(ruralV(start, height + (random() - 0.5) * 0.02, z + side * 0.07), ruralV(end, height + (random() - 0.5) * 0.02, z + side * 0.07), 0.028, 6, 0);
          const uv = rail.attributes.uv;
          for (let index = 0; index < uv.count; index += 1) uv.setY(index, uv.getY(index) / 0.6);
          bamboo.push(ruralTint(rail, [0.9, 0.85, 0.7]));
        }
      }
      // The lashing at each crossing on the outer face: a cross of black cord.
      for (const x of canes) {
        for (const turn of [Math.PI / 4, -Math.PI / 4]) {
          bamboo.push(ruralTint(ruralBox(0.1, 0.022, 0.02, x, height, z + outward * 0.095, 0, 0, turn), cord));
        }
        bamboo.push(ruralTint(ruralBox(0.03, 0.075, 0.17, x, height, z), cord));
      }
    }
  }
}

/**
 * A jinmaku, a camp curtain: hemp cloth in five widths sewn along their
 * length, hung from a rope stretched between bamboo poles so it sags
 * between them, falling in soft folds and bellying a little. Its crest
 * art is the texture given (u along it, v up it, as the plane it replaces).
 */
function ruralCurtain(art, { length, height, centreY, poles }) {
  const columns = Math.ceil(length / 0.12);
  const rows = 8;
  const top = centreY + height / 2;
  const sagAt = (x) => {
    const span = length / (poles.length - 1);
    const t = ((x + length / 2) % span) / span;
    return 0.09 * Math.sin(Math.PI * t);
  };
  const cloth = ruralGrid(columns, rows, (i, j) => {
    const x = -length / 2 + (length * i) / columns;
    const v = j / rows;
    const fall = 1 - v;
    const y = top - sagAt(x) - height * fall + 0.03 * Math.sin(x * 1.7) * fall;
    const fold = 0.045 * Math.sin((2 * Math.PI * x) / 0.85 + 0.8 * Math.sin(x * 0.37)) * (0.35 + 0.65 * fall);
    const belly = 0.05 * Math.sin(Math.PI * (((x + length / 2) % (length / (poles.length - 1))) / (length / (poles.length - 1)))) * Math.sin(Math.PI * Math.min(1, fall * 1.2));
    return [x, y, fold + belly, i / columns, v];
  }, [columns / 2, rows / 2, ruralV(0, 0, 1)]);
  const material = new THREE.MeshStandardMaterial({ map: ruralCurtainArt(art), normalMap: ruralCurtainSeams(), normalScale: new THREE.Vector2(1, 1), side: THREE.DoubleSide, roughness: 0.95 });
  const mesh = new THREE.Mesh(cloth, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// The crest art redrawn larger with the cloth's five widths and their seams, and the grime of the camp along the hem.
function ruralCurtainArt(art) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.drawImage(art.image, 0, 0, 1024, 256);
  const random = ruralRandom(17);
  for (let k = 1; k < 5; k += 1) {
    const y = (256 * k) / 5;
    g.fillStyle = 'rgba(60,50,40,0.18)';
    g.fillRect(0, y - 1, 1024, 2);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(0, y + 1, 1024, 1);
  }
  for (let index = 0; index < 3000; index += 1) {
    g.fillStyle = random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    g.fillRect(random() * 1024, random() * 256, 1 + random() * 6, 1);
  }
  const hem = g.createLinearGradient(0, 200, 0, 256);
  hem.addColorStop(0, 'rgba(110,90,60,0)');
  hem.addColorStop(1, 'rgba(110,90,60,0.35)');
  g.fillStyle = hem;
  g.fillRect(0, 200, 1024, 56);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  return texture;
}

function ruralCurtainSeams() {
  return ruralPainted('rural:seams', 64, 256, { relief: 6 }, ({ bump, width, height, grey }) => {
    for (let k = 1; k < 5; k += 1) {
      const y = (height * k) / 5;
      const ridge = bump.createLinearGradient(0, y - 4, 0, y + 4);
      ridge.addColorStop(0, grey(0.5));
      ridge.addColorStop(0.5, grey(0.85));
      ridge.addColorStop(1, grey(0.5));
      bump.fillStyle = ridge;
      bump.fillRect(0, y - 4, width, 8);
    }
  }).normalMap;
}

/**
 * A nobori: a tall narrow banner on an L-shaped bamboo frame, the cloth
 * hung from the crossbar at the top and laced to the pole down one side
 * with loops, its free edge falling in folds. In the banner's own frame:
 * pole up y at the origin, cloth out along −x. Returns [cloth, bamboo parts].
 */
function ruralNobori({ poleHeight = 5.2, width = 0.75, length = 3, top = 4.85, seed }) {
  const random = ruralRandom(seed);
  const phase = random() * 6;
  const columns = 6;
  const rows = 16;
  const cloth = ruralGrid(columns, rows, (i, j) => {
    const across = i / columns;
    const down = 1 - j / rows;
    const x = -0.05 - across * width;
    const free = across;
    const z = 0.05 * Math.sin(down * 8 + across * 3 + phase) * free + 0.07 * Math.sin(down * 2.5 + phase) * free * down + 0.025 * Math.sin(across * 9 + down * 3);
    return [x + 0.02 * Math.sin(down * 5 + phase) * free, top - down * length - 0.02 * free * down, z, 1 - across, j / rows];
  }, [columns / 2, rows / 2, ruralV(0, 0, 1)]);
  const bamboo = [];
  const pole = ruralRod(ruralV(0, 0, 0), ruralV(0, poleHeight, 0), 0.04, 7, random() * 6, 0.03);
  const crossbar = ruralRod(ruralV(0.02, top + 0.03, 0), ruralV(-width - 0.1, top + 0.03, 0), 0.02, 6);
  for (const rod of [pole, crossbar]) {
    const uv = rod.attributes.uv;
    for (let index = 0; index < uv.count; index += 1) uv.setY(index, uv.getY(index) / 0.6);
    bamboo.push(ruralTint(rod, [0.8, 0.72, 0.55]));
  }
  // The loops (chichi) lacing the cloth to the pole and the crossbar, of the banner's own cloth.
  const loops = [];
  for (let k = 0; k < 7; k += 1) loops.push(ruralBox(0.1, 0.05, 0.09, -0.04, top - 0.12 - k * (length / 7), 0));
  for (let k = 0; k < 3; k += 1) loops.push(ruralBox(0.05, 0.09, 0.06, -0.2 - k * 0.25, top + 0.02, 0));
  for (const loop of loops) {
    const uv = loop.attributes.uv;
    for (let index = 0; index < uv.count; index += 1) uv.setXY(index, 0.93, 0.5);
  }
  return [ruralMerge([cloth, ...loops]), bamboo];
}

/**
 * Each side's camp at Sekigahara: its curtain at x = side·curtainX (poles
 * along it), its banners at `banners` ([x, z] each), the palisades along
 * both flanks; `curtainArt(colour)` and `bannerArt(colour)` paint the
 * crests as before. Returns a group.
 */
export function ruralSengokuCamps({ sides, curtainX, curtainArt, bannerArt, palisadeZ, banners }) {
  const group = new THREE.Group();
  const random = ruralRandom(77);
  const bamboo = [];
  for (const [side, colour] of sides) {
    // The curtain, turned as the plane it replaces (its length along z).
    const poles = [-7, -3.5, 0, 3.5, 7];
    const curtain = ruralCurtain(curtainArt(colour), { length: 14, height: 1.8, centreY: 1.3, poles });
    curtain.position.set(side * curtainX, 0, 0);
    curtain.rotation.y = Math.PI / 2;
    group.add(curtain);
    for (const z of poles) {
      const pole = ruralRod(ruralV(side * curtainX + side * 0.05, -0.1, z), ruralV(side * curtainX + side * 0.05, 2.45, z), 0.045, 7, random() * 6, 0.035);
      const uv = pole.attributes.uv;
      for (let index = 0; index < uv.count; index += 1) uv.setY(index, uv.getY(index) / 0.6);
      bamboo.push(ruralTint(pole, [0.8, 0.72, 0.55]));
    }
    // The rope the curtain hangs from, sagging between the poles.
    for (let k = 0; k < poles.length - 1; k += 1) {
      const steps = 6;
      for (let s = 0; s < steps; s += 1) {
        const at = (t) => ruralV(side * curtainX, 2.24 - 0.09 * Math.sin(Math.PI * t), ruralLerp(poles[k], poles[k + 1], t));
        bamboo.push(ruralTint(ruralRod(at(s / steps), at((s + 1) / steps), 0.012, 4), [0.6, 0.5, 0.38]));
      }
    }
    // The banners.
    const art = bannerArt(colour);
    const cloths = [];
    banners(side).forEach(([x, z], index) => {
      const [cloth, sticks] = ruralNobori({ seed: 900 + index * 13 + (side > 0 ? 100 : 0) });
      const matrix = new THREE.Matrix4().makeTranslation(x, 0, z).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2 + side * 0.25));
      cloths.push(cloth.applyMatrix4(matrix));
      bamboo.push(...ruralMoved(sticks, matrix));
    });
    const flags = new THREE.Mesh(ruralMerge(cloths), new THREE.MeshStandardMaterial({ map: art, side: THREE.DoubleSide, roughness: 0.9 }));
    flags.castShadow = true;
    flags.receiveShadow = true;
    group.add(flags);
  }
  for (const z of palisadeZ) ruralPalisade(bamboo, { z, from: -11, to: 11, gap: 1.6, random });
  group.add(ruralMesh(bamboo, ruralMaterial(ruralBamboo(), { roughness: 0.7 }), 1));
  return group;
}
