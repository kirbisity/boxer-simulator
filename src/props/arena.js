// The Colosseum's stone, built as the Flavian amphitheatre was: the podium
// wall round the sand faced in marble with its inscribed balustrade and the
// gates through it, the stepped cavea with its stairways and vomitoria, and
// the travertine outer wall of three arcaded storeys (Tuscan, Ionic and
// Corinthian half-columns) under the attic, its corbels and the velarium
// masts, with the awning drawn over part of the bowl.
//
// Also the small kit the port uses (src/props/harbour.js): a seeded
// generator, surfaces painted on canvas (a colour sheet and a height sheet,
// finished into an albedo and a normal map that tile), and a builder that
// merges many pieces into one geometry per material, with UVs projected in
// metres and colours per vertex for weathering, optionally bent round a path.

/* global THREE */

// ---- the kit -----------------------------------------------------------------------

/** A seeded generator, 0..1 (mulberry32): the stone looks the same every time it is built. */
export function arenaRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const arenaSmooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const arenaGrey = (value, alpha = 1) => {
  const g = Math.round(Math.max(0, Math.min(1, value)) * 255);
  return `rgba(${g},${g},${g},${alpha})`;
};

/**
 * A painting sheet: a colour canvas and a height canvas of `size`², drawn
 * together. `wrap` draws a stamp at each wrapped copy it reaches, so the
 * sheet tiles.
 */
export function arenaSheet(size, base, baseHeight = 0.5, seed = 1) {
  const make = () => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas.getContext('2d', { willReadFrequently: true });
  };
  const colour = make();
  colour.fillStyle = base;
  colour.fillRect(0, 0, size, size);
  const height = make();
  height.fillStyle = arenaGrey(baseHeight);
  height.fillRect(0, 0, size, size);
  const random = arenaRandom(seed);
  const rr = (a, b) => a + (b - a) * random();
  const wrap = (x, y, reach, draw) => {
    for (const ox of [-size, 0, size]) {
      if (x + ox + reach < 0 || x + ox - reach > size) continue;
      for (const oy of [-size, 0, size]) {
        if (y + oy + reach < 0 || y + oy - reach > size) continue;
        draw(x + ox, y + oy);
      }
    }
  };
  /** A filled rectangle on both sheets (either style may be null). */
  const rect = (x, y, w, h, fill, lift, alpha = 1) => wrap(x + w / 2, y + h / 2, Math.max(w, h), (X, Y) => {
    if (fill) {
      colour.fillStyle = fill;
      colour.fillRect(X - w / 2, Y - h / 2, w, h);
    }
    if (lift !== null && lift !== undefined) {
      height.fillStyle = arenaGrey(lift, alpha);
      height.fillRect(X - w / 2, Y - h / 2, w, h);
    }
  });
  const blob = (x, y, rx, ry, turn, fill, lift, alpha = 1) => wrap(x, y, Math.max(rx, ry), (X, Y) => {
    for (const [context, style] of [[colour, fill], [height, lift === null || lift === undefined ? null : arenaGrey(lift, alpha)]]) {
      if (!style) continue;
      context.fillStyle = style;
      context.beginPath();
      context.ellipse(X, Y, Math.max(0.1, rx), Math.max(0.1, ry), turn, 0, Math.PI * 2);
      context.fill();
    }
  });
  /** A polyline on both sheets. */
  const line = (points, width, stroke, lift, alpha = 1) => {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const reach = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + width;
    wrap(cx, cy, reach, (X, Y) => {
      for (const [context, style] of [[colour, stroke], [height, lift === null || lift === undefined ? null : arenaGrey(lift, alpha)]]) {
        if (!style) continue;
        context.strokeStyle = style;
        context.lineWidth = width;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        points.forEach(([px, py], index) => (index ? context.lineTo(px - cx + X, py - cy + Y) : context.moveTo(px - cx + X, py - cy + Y)));
        context.stroke();
      }
    });
  };
  return { size, colour, height, random, rr, wrap, rect, blob, line };
}

function arenaDataTexture(data, size) {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Finish a sheet into { map, normalMap }: the canvas's top row is the
 * texture's top (v = 1), the height's slope over `relief` gives the normal
 * (bigger: deeper relief), blurred `blur` times first so edges round off.
 */
export function arenaFinish(sheet, { relief = 4, blur = 1 } = {}) {
  const { size } = sheet;
  const count = size * size;
  const rgb = sheet.colour.getImageData(0, 0, size, size).data;
  const raw = sheet.height.getImageData(0, 0, size, size).data;
  let height = new Float32Array(count);
  for (let index = 0; index < count; index += 1) height[index] = raw[index * 4] / 255;
  for (let pass = 0; pass < blur; pass += 1) {
    const next = new Float32Array(count);
    for (let y = 0; y < size; y += 1) {
      const up = ((y - 1 + size) % size) * size;
      const row = y * size;
      const down = ((y + 1) % size) * size;
      for (let x = 0; x < size; x += 1) {
        const left = (x - 1 + size) % size;
        const right = (x + 1) % size;
        next[row + x] = (height[row + x] * 4 + height[up + x] + height[down + x] + height[row + left] + height[row + right]) / 8;
      }
    }
    height = next;
  }
  const colour = new Uint8Array(count * 4);
  const normal = new Uint8Array(count * 4);
  for (let row = 0; row < size; row += 1) {
    const cy = size - 1 - row;
    const above = ((cy - 1 + size) % size) * size;
    const below = ((cy + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const source = cy * size + x;
      const dx = height[cy * size + ((x + 1) % size)] - height[cy * size + ((x - 1 + size) % size)];
      const dy = height[above + x] - height[below + x];
      const nx = -dx * 0.5 * relief;
      const ny = -dy * 0.5 * relief;
      const length = Math.sqrt(nx * nx + ny * ny + 1);
      const at = (row * size + x) * 4;
      normal[at] = (nx / length * 0.5 + 0.5) * 255;
      normal[at + 1] = (ny / length * 0.5 + 0.5) * 255;
      normal[at + 2] = (1 / length * 0.5 + 0.5) * 255;
      normal[at + 3] = 255;
      colour[at] = rgb[source * 4];
      colour[at + 1] = rgb[source * 4 + 1];
      colour[at + 2] = rgb[source * 4 + 2];
      colour[at + 3] = 255;
    }
  }
  return { map: arenaDataTexture(colour, size), normalMap: arenaDataTexture(normal, size) };
}

// Painted once a page: the textures cost a few hundred milliseconds, and a
// place is rebuilt on every stage of the looks harness. (Disposing a texture
// only frees its GPU copy; it uploads again when drawn.)
const ARENA_PAINTED = new Map();
export function arenaPainted(name, paint) {
  if (!ARENA_PAINTED.has(name)) ARENA_PAINTED.set(name, paint());
  return ARENA_PAINTED.get(name);
}

const ARENA_WHITE = [1, 1, 1];

/**
 * Many pieces merged into one geometry. `add(geometry, matrix, options)`
 * places a geometry (its author space: x along, y up, z out), projects UVs
 * in metres (`tile`: metres a repeat, a number or [u, v]; `offset` in
 * repeats) from each triangle's own facing, colours each vertex (`colour`:
 * [r, g, b] or a function of the author position and normal), then bends it
 * by `warp` (a path's: x becomes the distance along it, z the offset out
 * from it). Triangles are turned to face along their normals, so a mirrored
 * matrix is harmless; `flip` turns a piece inside out (a vault seen from below).
 */
export function arenaBuilder() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const colours = [];
  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const n = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const face = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const identity = new THREE.Matrix4();
  const builder = {
    add(geometry, matrix = identity, { colour = ARENA_WHITE, tile = 1, offset = [0, 0], warp = null, uv = 'box', flip = false } = {}) {
      const flat = geometry.index ? geometry.toNonIndexed() : geometry;
      if (!flat.attributes.normal) flat.computeVertexNormals();
      const position = flat.attributes.position;
      const normal = flat.attributes.normal;
      const source = flat.attributes.uv;
      const [tu, tv] = Array.isArray(tile) ? tile : [tile, tile];
      normalMatrix.getNormalMatrix(matrix);
      const uv3 = [[0, 0], [0, 0], [0, 0]];
      const rgb3 = [null, null, null];
      for (let start = 0; start + 2 < position.count; start += 3) {
        for (let k = 0; k < 3; k += 1) {
          p[k].fromBufferAttribute(position, start + k).applyMatrix4(matrix);
          n[k].fromBufferAttribute(normal, start + k).applyMatrix3(normalMatrix).normalize();
          if (flip) n[k].negate();
        }
        e1.subVectors(p[1], p[0]);
        e2.subVectors(p[2], p[0]);
        face.crossVectors(e1, e2);
        const ax = Math.abs(face.x);
        const ay = Math.abs(face.y);
        const az = Math.abs(face.z);
        for (let k = 0; k < 3; k += 1) {
          let u;
          let v;
          if (uv === 'keep') {
            u = source.getX(start + k);
            v = source.getY(start + k);
          } else if (ay >= ax && ay >= az) {
            u = p[k].x;
            v = p[k].z;
          } else if (ax >= az) {
            u = p[k].z;
            v = p[k].y;
          } else {
            u = p[k].x;
            v = p[k].y;
          }
          uv3[k][0] = u / tu + offset[0];
          uv3[k][1] = v / tv + offset[1];
          rgb3[k] = typeof colour === 'function' ? colour(p[k], n[k]) : colour;
        }
        if (warp) for (let k = 0; k < 3; k += 1) warp(p[k], n[k]);
        // Face the triangle the way its normals say.
        e1.subVectors(p[1], p[0]);
        e2.subVectors(p[2], p[0]);
        face.crossVectors(e1, e2);
        const order = face.dot(e1.copy(n[0]).add(n[1]).add(n[2])) < 0 ? [0, 2, 1] : [0, 1, 2];
        for (const k of order) {
          positions.push(p[k].x, p[k].y, p[k].z);
          normals.push(n[k].x, n[k].y, n[k].z);
          uvs.push(uv3[k][0], uv3[k][1]);
          colours.push(rgb3[k][0], rgb3[k][1], rgb3[k][2]);
        }
      }
      if (flat !== geometry) flat.dispose();
      geometry.dispose();
      return builder;
    },
    get triangles() {
      return positions.length / 9;
    },
    geometry() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
      geometry.computeBoundingSphere();
      return geometry;
    },
    /** The merged mesh (null when nothing was added), casting and taking shadows. */
    mesh(material, { cast = true } = {}) {
      if (!positions.length) return null;
      const mesh = new THREE.Mesh(builder.geometry(), material);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      return mesh;
    },
  };
  return builder;
}

/** A matrix from a place, Euler turns (x, y, z) and scale. */
export function arenaAt(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

/**
 * A profile (a list of [across, up] points in the shape's plane) run along
 * x from `from` for `length`: a moulding, a cornice, a coping. Its across
 * becomes z (out), its up y. Cut into steps of `stepLength`, so a path can bend it.
 */
export function arenaRun(builder, profile, { from = 0, length, y = 0, stepLength = 0.4, ...options }) {
  const shape = new THREE.Shape(profile.map(([across, up]) => new THREE.Vector2(across, up)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, steps: Math.max(1, Math.ceil(length / stepLength)), bevelEnabled: false });
  // Shape x → z, shape y → y, extrusion z → −x (a turn, not a mirror), then slid along to start at `from`.
  const matrix = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(from + length, y, 0);
  builder.add(geometry, matrix, options);
}

/**
 * An ellipse (half-axes a along x, b along z) as a path to bend pieces
 * round: author x is the distance along it (running clockwise seen from
 * above, so author space stays right-handed), z the offset outward.
 */
export function arenaEllipsePath(a, b, samples = 4096) {
  const cumulative = new Float64Array(samples + 1);
  let px = a;
  let pz = 0;
  for (let index = 1; index <= samples; index += 1) {
    const t = (index / samples) * Math.PI * 2;
    const x = a * Math.cos(t);
    const z = b * Math.sin(t);
    cumulative[index] = cumulative[index - 1] + Math.hypot(x - px, z - pz);
    px = x;
    pz = z;
  }
  const length = cumulative[samples];
  const wrap = (u) => ((u % length) + length) % length;
  const angleAtDistance = (s) => {
    let lo = 0;
    let hi = samples;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] <= s) lo = mid;
      else hi = mid;
    }
    const f = (s - cumulative[lo]) / (cumulative[hi] - cumulative[lo] || 1);
    return ((lo + f) / samples) * Math.PI * 2;
  };
  const angleOf = (u) => angleAtDistance(wrap(length - wrap(u)));
  /** The distance along the path to the point at parametric angle t. */
  const uOf = (t) => {
    const f = ((((t % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * samples;
    const index = Math.min(samples - 1, Math.floor(f));
    return wrap(length - (cumulative[index] + (cumulative[index + 1] - cumulative[index]) * (f - index)));
  };
  const warp = (point, normal) => {
    const t = angleOf(point.x);
    const c = Math.cos(t);
    const s = Math.sin(t);
    let tx = a * s;
    let tz = -b * c;
    const tl = Math.hypot(tx, tz);
    tx /= tl;
    tz /= tl;
    let nx = b * c;
    let nz = a * s;
    const nl = Math.hypot(nx, nz);
    nx /= nl;
    nz /= nl;
    const w = point.z;
    point.set(a * c + nx * w, point.y, b * s + nz * w);
    const along = normal.x;
    const out = normal.z;
    normal.set(tx * along + nx * out, normal.y, tz * along + nz * out);
  };
  return { a, b, length, angleOf, uOf, warp };
}

/** A curve t → [x, z]: the ellipse (a, b) scaled by s. */
export const arenaScaled = (a, b, s) => (t) => [s * a * Math.cos(t), s * b * Math.sin(t)];
/** A curve t → [x, z]: the ellipse (a, b) moved out along its normal by w. */
export const arenaOffset = (a, b, w) => (t) => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  const nx = b * c;
  const nz = a * s;
  const l = Math.hypot(nx, nz);
  return [a * c + (nx / l) * w, b * s + (nz / l) * w];
};

/**
 * A surface swept round between curves: `profile` is a list of [curve, y]
 * points (curve: t → [x, z]); each neighbouring pair makes one band from t0
 * to t1. Facing: a band whose profile runs up or outward faces inward or up
 * (the cavea's risers and treads); run it the other way to face it the other way.
 */
export function arenaSweep(builder, profile, { t0 = 0, t1 = Math.PI * 2, steps = 256, tile = 2, colour, offset } = {}) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const columns = [];
  const distance = profile.map(() => 0);
  const previous = profile.map(() => null);
  for (let index = 0; index <= steps; index += 1) {
    const t = t0 + ((t1 - t0) * index) / steps;
    const points = profile.map(([curve, y], k) => {
      const [x, z] = curve(t);
      if (previous[k]) distance[k] += Math.hypot(x - previous[k][0], z - previous[k][1]);
      previous[k] = [x, z];
      return [x, y, z];
    });
    const ahead = profile.map(([curve]) => curve(t + 1e-4));
    const bands = [];
    let v = 0;
    for (let k = 0; k + 1 < points.length; k += 1) {
      const [ax, ay, az] = points[k];
      const [bx, by, bz] = points[k + 1];
      const tx = ahead[k][0] - ax + ahead[k + 1][0] - bx;
      const tz = ahead[k][1] - az + ahead[k + 1][1] - bz;
      const qx = bx - ax;
      const qy = by - ay;
      const qz = bz - az;
      const nx = -tz * qy;
      const ny = tz * qx - tx * qz;
      const nz = tx * qy;
      const l = Math.hypot(nx, ny, nz) || 1;
      const across = Math.hypot(qx, qy, qz);
      bands.push({ a: points[k], b: points[k + 1], n: [nx / l, ny / l, nz / l], ua: distance[k], ub: distance[k + 1], va: v, vb: v + across });
      v += across;
    }
    columns.push(bands);
  }
  for (let index = 0; index < steps; index += 1) {
    columns[index].forEach((band, k) => {
      const next = columns[index + 1][k];
      const corners = [[band.a, band.n, band.ua, band.va], [band.b, band.n, band.ub, band.vb], [next.b, next.n, next.ub, next.vb], [next.a, next.n, next.ua, next.va]];
      for (const triangle of [[0, 1, 2], [0, 2, 3]]) {
        for (const corner of triangle) {
          const [point, normal, u, v] = corners[corner];
          positions.push(...point);
          normals.push(...normal);
          uvs.push(u, v);
        }
      }
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  builder.add(geometry, undefined, { uv: 'keep', tile, colour, offset });
}

/** A block between two curves, from t0 to t1 and y0 to y1: a step, a cheek wall. Its front faces inward. */
export function arenaBlock(builder, inner, outer, y0, y1, t0, t1, options = {}) {
  arenaSweep(builder, [[inner, y0], [inner, y1], [outer, y1], [outer, y0]], { t0, t1, steps: Math.max(1, Math.ceil((t1 - t0) / 0.02)), ...options });
  // The two ends.
  for (const [t, sign] of [[t0, -1], [t1, 1]]) {
    const [ix, iz] = inner(t);
    const [ox, oz] = outer(t);
    const [ax, az] = inner(t + 1e-4);
    let tx = (ax - ix) * sign;
    let tz = (az - iz) * sign;
    const l = Math.hypot(tx, tz);
    tx /= l;
    tz /= l;
    const corners = [[ix, y0, iz], [ix, y1, iz], [ox, y1, oz], [ox, y0, oz]];
    const positions = [];
    for (const k of [0, 1, 2, 0, 2, 3]) positions.push(...corners[k]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 2, 3, 4, 5].flatMap(() => [tx, 0, tz]), 3));
    builder.add(geometry, undefined, { tile: options.tile ?? 2, colour: options.colour });
  }
}

/** A material that takes the builder's vertex colours over its painted maps. */
export function arenaMaterial(maps, { roughness = 0.9, metalness = 0, side = THREE.FrontSide, normalScale = 1, ...rest } = {}) {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness, metalness, side, ...rest });
  if (maps?.map) material.map = maps.map;
  if (maps?.normalMap) {
    material.normalMap = maps.normalMap;
    material.normalScale = new THREE.Vector2(normalScale, normalScale);
  }
  return material;
}

// ---- the Colosseum's surfaces ----------------------------------------------------

/**
 * Travertine, 2 m a repeat: courses 0.4 m high of blocks 0.7–1.5 m long,
 * each its own tone; the stone's bedding pores, joints worn back, chipped
 * arrises, faint vertical rain streaks.
 */
function arenaTravertine() {
  return arenaPainted('travertine', () => {
    const s = arenaSheet(512, '#cbb894', 0.62, 71);
    const { rr } = s;
    const course = 512 / 5;
    for (let row = 0; row < 5; row += 1) {
      const y = row * course;
      let x = rr(0, 200);
      const end = x + 512;
      while (x < end) {
        const length = Math.min(end - x, rr(180, 380));
        const light = rr(60, 74);
        s.rect(x, y, length, course, `hsl(${rr(36, 44)},${rr(22, 34)}%,${light}%)`, 0.6 + rr(-0.04, 0.05));
        // The face, dressed but not polished: a gentle swell and tool marks.
        for (let mark = 0; mark < 14; mark += 1) s.blob(x + rr(10, length - 10), y + rr(8, course - 8), rr(8, 30), rr(4, 12), rr(-0.3, 0.3), `hsla(${rr(30, 45)},${rr(15, 30)}%,${rr(50, 75)}%,0.18)`, rr(0.55, 0.7), 0.4);
        // Joints, a little open and dark.
        s.rect(x - 1.5, y, 3, course, 'rgba(92,78,58,0.75)', 0.22);
        // Chipped arrises at the corners.
        for (let chip = 0; chip < 3; chip += 1) {
          const cx = x + (chip % 2 ? length - rr(2, 10) : rr(2, 10));
          const cy = y + (chip < 2 ? rr(2, 8) : course - rr(2, 8));
          s.blob(cx, cy, rr(3, 9), rr(2, 6), rr(0, 3), 'rgba(140,120,90,0.6)', 0.35);
        }
        x += length;
      }
      s.rect(0, y - 1.5, 512, 3, 'rgba(92,78,58,0.8)', 0.2);
    }
    // Travertine's pores: small cavities drawn out along the bedding.
    for (let index = 0; index < 2600; index += 1) {
      const w = rr(1.5, 9);
      s.blob(rr(0, 512), rr(0, 512), w, rr(0.6, 1.8), rr(-0.08, 0.08), `rgba(${Math.round(rr(90, 130))},${Math.round(rr(78, 105))},${Math.round(rr(55, 75))},${rr(0.35, 0.7)})`, 0.3, 0.8);
    }
    for (let index = 0; index < 60; index += 1) {
      const x = rr(0, 512);
      const y = rr(0, 512);
      s.line([[x, y], [x + rr(-3, 3), y + rr(30, 120)]], rr(3, 10), 'rgba(70,64,58,0.07)', null);
    }
    return arenaFinish(s, { relief: 5, blur: 1 });
  });
}

/** Marble revetment, 2.4 m a repeat: slabs 1.2 by 0.8 m, white with grey veins, fine joints. */
function arenaMarble() {
  return arenaPainted('marble', () => {
    const s = arenaSheet(512, '#e4dfd5', 0.6, 23);
    const { rr } = s;
    const slabW = 512 / 2;
    const slabH = 512 / 3;
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        const x = col * slabW + (row % 2) * slabW * 0.5;
        const tone = rr(84, 92);
        s.rect(x, row * slabH, slabW, slabH, `hsl(${rr(30, 45)},${rr(8, 16)}%,${tone}%)`, 0.6);
        // Each slab's veins run one way: it was sawn from one block.
        const turn = rr(-0.6, 0.6);
        for (let vein = 0; vein < 5; vein += 1) {
          let vx = x + rr(0, slabW);
          let vy = row * slabH + rr(0, slabH);
          const points = [[vx, vy]];
          for (let step = 0; step < 14; step += 1) {
            vx += Math.cos(turn) * rr(4, 14);
            vy += Math.sin(turn) * rr(4, 14) + rr(-6, 6);
            points.push([vx, vy]);
          }
          s.line(points, rr(0.6, 2.4), `rgba(${Math.round(rr(110, 140))},${Math.round(rr(108, 130))},${Math.round(rr(105, 125))},${rr(0.15, 0.45)})`, null);
        }
        s.rect(x - 1, row * slabH, 2, slabH, 'rgba(120,110,95,0.55)', 0.3);
      }
      s.rect(0, row * slabH - 1, 512, 2, 'rgba(120,110,95,0.55)', 0.3);
    }
    for (let index = 0; index < 500; index += 1) s.blob(rr(0, 512), rr(0, 512), rr(1, 4), rr(1, 3), 0, `rgba(150,135,110,${rr(0.05, 0.18)})`, null);
    return arenaFinish(s, { relief: 3, blur: 1 });
  });
}

/**
 * The podium's balustrade, 4.8 m by 0.9 m a repeat: three panels framed
 * in a raised moulding, each cut with a line in square capitals — the
 * seats kept for the senators, the knights and named men — the letters
 * picked out in red.
 */
function arenaInscription() {
  return arenaPainted('inscription', () => {
    const size = 1024;
    const s = arenaSheet(size, '#e2ddd2', 0.6, 9);
    const { rr } = s;
    const vScale = size / 0.9;
    // Plinth band and coping band of the parapet.
    s.rect(0, size - 0.12 * vScale, size, 0.12 * vScale, '#d6d0c4', 0.75);
    s.rect(0, size - 0.125 * vScale, size, 4, 'rgba(110,100,85,0.6)', 0.35);
    s.rect(0, 0, size, 0.1 * vScale, '#d9d3c7', 0.75);
    s.rect(0, 0.1 * vScale - 2, size, 4, 'rgba(110,100,85,0.6)', 0.35);
    const lines = ['SENATORIBVS · LOC · XXIII', 'EQVITIBVS · ROMANIS', 'C · CAELIO · RVFO · V · C', 'LOCA · ASSIGNATA · CVNEI · IV', 'ARVALIBVS · FRATRIBVS', 'T · FLAVIO · AVG · LIB'];
    const panelW = size / 3;
    for (let panel = 0; panel < 3; panel += 1) {
      const x0 = panel * panelW + 18;
      const y0 = 0.16 * vScale;
      const w = panelW - 36;
      const h = 0.56 * vScale;
      // The frame: a raised moulding, a shadowed inner step.
      s.rect(x0, y0, w, h, null, 0.8);
      s.rect(x0 + 10, y0 + 10, w - 20, h - 20, `hsl(40,12%,${rr(84, 89)}%)`, 0.55);
      s.line([[x0 + 10, y0 + 10], [x0 + w - 10, y0 + 10], [x0 + w - 10, y0 + h - 10], [x0 + 10, y0 + h - 10], [x0 + 10, y0 + 10]], 3, 'rgba(120,110,95,0.6)', 0.4);
      // Two lines of capitals, carved and painted red.
      const c = s.colour;
      const hc = s.height;
      for (const [index, text] of [lines[panel * 2], lines[panel * 2 + 1]].entries()) {
        const ty = y0 + h * (0.42 + index * 0.34);
        for (const [context, style] of [[c, 'rgba(128,40,30,0.85)'], [hc, arenaGrey(0.25)]]) {
          context.font = `bold ${Math.round(h * 0.24)}px "Times New Roman", serif`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillStyle = style;
          context.save();
          context.translate(x0 + w / 2, ty);
          const fit = Math.min(1, (w - 50) / context.measureText(text).width);
          context.scale(fit, 1);
          context.fillText(text, 0, 0);
          context.restore();
        }
      }
      for (let index = 0; index < 120; index += 1) s.blob(x0 + rr(0, w), y0 + rr(0, h), rr(1, 5), rr(1, 3), 0, `rgba(130,115,90,${rr(0.04, 0.14)})`, null);
    }
    return arenaFinish(s, { relief: 4, blur: 1 });
  });
}

/** Oak boards, 1.2 m a repeat: vertical planks 0.15 m wide with gaps, grain and knots, weathered grey-brown. */
export function arenaWood() {
  return arenaPainted('wood', () => {
    const s = arenaSheet(512, '#5d4632', 0.6, 5);
    const { rr } = s;
    const plank = 512 / 8;
    for (let index = 0; index < 8; index += 1) {
      const x = index * plank;
      s.rect(x, 0, plank, 512, `hsl(${rr(24, 32)},${rr(22, 34)}%,${rr(22, 32)}%)`, 0.6 + rr(-0.03, 0.03));
      for (let grain = 0; grain < 22; grain += 1) {
        let gx = x + rr(3, plank - 3);
        const points = [];
        for (let y = -20; y <= 532; y += 16) {
          gx += rr(-1.2, 1.2);
          points.push([gx, y]);
        }
        s.line(points, rr(0.6, 1.6), `rgba(${rr(0, 1) < 0.5 ? '30,20,12' : '120,95,70'},${rr(0.15, 0.4)})`, rr(0.5, 0.62), 0.6);
      }
      for (let knot = 0; knot < 1; knot += 1) s.blob(x + rr(15, plank - 15), rr(0, 512), rr(3, 6), rr(5, 9), 0, 'rgba(40,26,16,0.8)', 0.45);
      s.rect(x - 2, 0, 4, 512, 'rgba(18,12,8,0.95)', 0.15);
    }
    return arenaFinish(s, { relief: 4, blur: 1 });
  });
}

/** Linen sailcloth for the awning, 2 m a repeat: the weave, and the seams of its sewn widths. */
function arenaLinen() {
  return arenaPainted('linen', () => {
    const s = arenaSheet(256, '#ece2c8', 0.5, 3);
    const { rr } = s;
    for (let index = 0; index < 1600; index += 1) s.rect(rr(0, 256), rr(0, 256), rr(2, 8), 1, `rgba(${rr(0, 1) < 0.5 ? '255,250,235' : '150,135,105'},${rr(0.08, 0.2)})`, null);
    for (let seam = 0; seam < 4; seam += 1) s.rect(seam * 64, 0, 3, 256, 'rgba(140,120,90,0.35)', 0.7);
    for (let index = 0; index < 20; index += 1) s.blob(rr(0, 256), rr(0, 256), rr(10, 40), rr(10, 30), 0, `rgba(120,100,70,${rr(0.03, 0.08)})`, null);
    return arenaFinish(s, { relief: 2, blur: 1 });
  });
}

// ---- the Colosseum -----------------------------------------------------------------

// The outer wall: 40 bays round the ellipse (the real building has 80 at
// twice the size; this one is about a third of its height), three arcaded
// storeys of 4.18 m and the attic above. Each arch 1.5 m wide springing at
// 2.5 m: the real proportion of opening to pier.
const ARENA_BAYS = 40;
const ARENA_STOREY = 4.18;
const ARENA_ARCH = 0.75;
const ARENA_IMPOST = 2.5;
const ARENA_ENTABLATURE = 3.66;
const ARENA_ATTIC = [ARENA_STOREY * 3, 16.0];

/**
 * The amphitheatre round an elliptical arena (half-axes rx, rz): the podium
 * wall (podiumHeight) and its eight gates, `tiers` treads rising `rise` and
 * stepping back `step` (a share of the ellipse) from firstTread, and the
 * outer wall. Returns the group and `blocksSeat(tier, angle)`: true where a
 * vomitorium stands, so no spectator is put inside it.
 */
export function arenaColosseum({ rx, rz, podiumHeight, tiers, rise, step, firstTread }) {
  const group = new THREE.Group();
  const random = arenaRandom(1906);
  const travertine = arenaBuilder();
  const marble = arenaBuilder();
  const inscribed = arenaBuilder();
  const iron = arenaBuilder();
  const wood = arenaBuilder();
  const linen = arenaBuilder();
  const scaled = (s) => arenaScaled(rx, rz, s);
  const treadIn = (tier) => 1.04 + tier * step;
  const treadY = (tier) => firstTread + tier * rise;
  const lastOut = treadIn(tiers - 1) + step;
  const topTread = treadY(tiers - 1);
  const outerScale = lastOut + 0.08;
  const A = rx * outerScale;
  const B = rz * outerScale;
  const outer = arenaEllipsePath(A, B);
  const off = (w) => arenaOffset(A, B, w);
  const bay = outer.length / ARENA_BAYS;
  const tone = (value, [r, g, b] = [1, 1, 1]) => [value * r, value * g, value * b];
  // Weathering on the outer wall: dirt splashed up the foot, black crust
  // where the rain never washes (under the cornices), each bay its own tone.
  const weathered = (shade, base = 1) => (p, n) => {
    const foot = 0.74 + 0.26 * arenaSmooth(0, 1.4, p.y);
    const sheltered = n.y < -0.5 ? 0.78 : 1;
    const deep = p.z < -0.45 ? 0.62 : 1;
    const v = base * shade * foot * sheltered * deep;
    return [v, v * 0.985, v * 0.96];
  };

  // ---- The outer wall ----
  const halfColumn = (radiusTop, radiusBottom, height) => new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 12, 1, true, -Math.PI / 2, Math.PI);
  for (let index = 0; index < ARENA_BAYS; index += 1) {
    const u = (index + 0.5) * bay;
    const pier = index * bay;
    const shade = 0.9 + random() * 0.14 - (random() < 0.2 ? 0.12 : 0);
    const colour = weathered(shade);
    for (let storey = 0; storey < 3; storey += 1) {
      const floor = storey * ARENA_STOREY;
      const depth = storey === 2 ? 0.4 : 0.55;
      const sill = storey === 0 ? 0 : 0.45;
      const top = floor + ARENA_ENTABLATURE;
      const spring = floor + ARENA_IMPOST;
      // The wall of the bay: a pier each side, the arch between.
      const half = bay / 2;
      const shape = new THREE.Shape();
      shape.moveTo(-half, floor);
      shape.lineTo(-ARENA_ARCH, floor);
      shape.lineTo(-ARENA_ARCH, spring);
      shape.absarc(0, spring, ARENA_ARCH, Math.PI, 0, true);
      shape.lineTo(ARENA_ARCH, floor);
      shape.lineTo(half, floor);
      shape.lineTo(half, top);
      for (let k = 1; k < 6; k += 1) shape.lineTo(half - (bay * k) / 6, top);
      shape.lineTo(-half, top);
      travertine.add(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 }), arenaAt(u, 0, -depth), { warp: outer.warp, tile: 2, colour });
      // Storeys two and three: a parapet across the foot of each arch.
      if (sill) travertine.add(new THREE.BoxGeometry(ARENA_ARCH * 2, sill, depth * 0.6, 3, 1, 1), arenaAt(u, floor + sill / 2, -depth * 0.35), { warp: outer.warp, tile: 2, colour });
      // The archivolt round the arch, its keystone, the impost mouldings it springs from.
      const ring = new THREE.Shape();
      ring.absarc(0, 0, ARENA_ARCH + 0.16, 0, Math.PI, false);
      ring.absarc(0, 0, ARENA_ARCH, Math.PI, 0, true);
      travertine.add(new THREE.ExtrudeGeometry(ring, { depth: 0.05, bevelEnabled: false, curveSegments: 12 }), arenaAt(u, spring, 0), { warp: outer.warp, tile: 2, colour });
      travertine.add(new THREE.BoxGeometry(0.17, 0.24, 0.09), arenaAt(u, spring + ARENA_ARCH + 0.06, 0.045), { warp: outer.warp, tile: 2, colour });
      travertine.add(new THREE.BoxGeometry(bay - ARENA_ARCH * 2 + 0.24, 0.1, 0.06), arenaAt(pier, spring - 0.05, 0.03), { warp: outer.warp, tile: 2, colour });
      // The engaged half-column on the pier: Tuscan below, Ionic, then Corinthian.
      const base = floor + sill;
      if (sill) travertine.add(new THREE.BoxGeometry(0.58, sill, 0.32), arenaAt(pier, floor + sill / 2, 0.06), { warp: outer.warp, tile: 2, colour });
      travertine.add(new THREE.BoxGeometry(0.54, 0.08, 0.3), arenaAt(pier, base + 0.04, 0.05), { warp: outer.warp, tile: 2, colour });
      travertine.add(halfColumn(0.24, 0.26, 0.08), arenaAt(pier, base + 0.12, 0), { warp: outer.warp, tile: 2, colour });
      const capital = [0.2, 0.2, 0.34][storey];
      const shaftFrom = base + 0.16;
      const shaftTo = top - capital;
      travertine.add(halfColumn(0.19, 0.21, shaftTo - shaftFrom), arenaAt(pier, (shaftFrom + shaftTo) / 2, 0), { warp: outer.warp, tile: 2, colour });
      if (storey === 0) {
        travertine.add(halfColumn(0.26, 0.19, 0.12), arenaAt(pier, shaftTo + 0.06, 0), { warp: outer.warp, tile: 2, colour });
        travertine.add(new THREE.BoxGeometry(0.56, 0.08, 0.3), arenaAt(pier, top - 0.04, 0.12), { warp: outer.warp, tile: 2, colour });
      } else if (storey === 1) {
        travertine.add(halfColumn(0.23, 0.19, 0.1), arenaAt(pier, shaftTo + 0.05, 0), { warp: outer.warp, tile: 2, colour });
        // The volutes: a scroll rolled across the face of the capital.
        travertine.add(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 10), arenaAt(pier, shaftTo + 0.1, 0.17, 0, 0, Math.PI / 2), { warp: outer.warp, tile: 2, colour });
        travertine.add(new THREE.BoxGeometry(0.56, 0.05, 0.3), arenaAt(pier, top - 0.025, 0.12), { warp: outer.warp, tile: 2, colour });
      } else {
        // The bell of acanthus, flaring to a thin abacus.
        travertine.add(halfColumn(0.27, 0.19, 0.26), arenaAt(pier, shaftTo + 0.13, 0), { warp: outer.warp, tile: 2, colour });
        travertine.add(halfColumn(0.23, 0.2, 0.12), arenaAt(pier, shaftTo + 0.07, 0.02), { warp: outer.warp, tile: 2, colour: (p, n) => tone(0.92, colour(p, n)) });
        travertine.add(new THREE.BoxGeometry(0.62, 0.07, 0.34), arenaAt(pier, top - 0.035, 0.12), { warp: outer.warp, tile: 2, colour });
      }
    }
    // The attic: a solid wall with a small window in every other bay,
    // Corinthian pilasters, and three corbels a bay for the velarium masts.
    const [attic0, attic1] = ARENA_ATTIC;
    const half = bay / 2;
    const skin = new THREE.Shape();
    skin.moveTo(-half, attic0);
    for (let k = 1; k < 6; k += 1) skin.lineTo(-half + (bay * k) / 6, attic0);
    skin.lineTo(half, attic0);
    skin.lineTo(half, attic1);
    for (let k = 1; k < 6; k += 1) skin.lineTo(half - (bay * k) / 6, attic1);
    skin.lineTo(-half, attic1);
    const window = index % 2 === 0;
    if (window) {
      const hole = new THREE.Path();
      hole.moveTo(-0.26, attic0 + 0.9);
      hole.lineTo(-0.26, attic0 + 1.75);
      hole.lineTo(0.26, attic0 + 1.75);
      hole.lineTo(0.26, attic0 + 0.9);
      skin.holes.push(hole);
      travertine.add(new THREE.PlaneGeometry(0.52, 0.85), arenaAt(u, attic0 + 1.325, -0.195), { warp: outer.warp, colour: [0.12, 0.11, 0.1] });
    }
    travertine.add(new THREE.ExtrudeGeometry(skin, { depth: 0.2, bevelEnabled: false }), arenaAt(u, 0, -0.2), { warp: outer.warp, tile: 2, colour });
    travertine.add(new THREE.BoxGeometry(bay, attic1 - attic0, 0.25, 6, 1, 1), arenaAt(u, (attic0 + attic1) / 2, -0.325), { warp: outer.warp, tile: 2, colour });
    travertine.add(new THREE.BoxGeometry(0.4, 0.12, 0.16), arenaAt(pier, attic0 + 0.06, 0.08), { warp: outer.warp, tile: 2, colour });
    travertine.add(new THREE.BoxGeometry(0.34, attic1 - attic0 - 0.34, 0.11), arenaAt(pier, (attic0 + attic1) / 2 - 0.05, 0.055), { warp: outer.warp, tile: 2, colour });
    travertine.add(new THREE.BoxGeometry(0.46, 0.22, 0.15), arenaAt(pier, attic1 - 0.13, 0.075), { warp: outer.warp, tile: 2, colour });
    for (let k = 1; k <= 3; k += 1) {
      const at = pier + (bay * k) / 4;
      travertine.add(new THREE.BoxGeometry(0.15, 0.22, 0.2), arenaAt(at, 15.0, 0.1), { warp: outer.warp, tile: 2, colour });
      // A mast stands on each corbel, up through a hole in the cornice.
      wood.add(new THREE.CylinderGeometry(0.06, 0.075, 4.3, 7), arenaAt(at, 15.11 + 2.15, 0.12), { warp: outer.warp, tile: 1.2, colour: tone(0.8 + random() * 0.25) });
    }
  }
  // Mouldings run all the way round: the stepped platform at the foot, each storey's entablature, the attic's cornice.
  const wallShade = weathered(0.98);
  arenaRun(travertine, [[-0.1, 0], [0.9, 0], [0.9, 0.14], [0.45, 0.14], [0.45, 0.28], [-0.1, 0.28]], { length: outer.length, y: 0, warp: outer.warp, tile: 2, colour: wallShade });
  for (let storey = 0; storey < 3; storey += 1) {
    arenaRun(travertine, [[-0.12, 0], [0.26, 0], [0.26, 0.17], [0.22, 0.17], [0.22, 0.34], [0.27, 0.34], [0.39, 0.45], [0.39, 0.52], [-0.12, 0.52]], { length: outer.length, y: storey * ARENA_STOREY + ARENA_ENTABLATURE, warp: outer.warp, tile: 2, colour: wallShade });
  }
  arenaRun(travertine, [[-0.45, 0], [0.12, 0], [0.12, 0.12], [0.3, 0.3], [0.3, 0.42], [-0.45, 0.42]], { length: outer.length, y: ARENA_ATTIC[1], warp: outer.warp, tile: 2, colour: wallShade });
  // Behind the arcades: the ambulatories, their inner walls and vaults, in shade.
  const gloom = (value) => (p) => {
    const v = value * (0.8 + 0.2 * arenaSmooth(0, 2, p.y % ARENA_STOREY));
    return [v, v * 0.97, v * 0.92];
  };
  const steps = 320;
  arenaSweep(travertine, [[scaled(1.55), 3.95], [scaled(1.55), 0]], { steps, colour: gloom(0.42) });
  arenaSweep(travertine, [[off(-0.55), 3.95], [scaled(1.55), 3.95]], { steps, colour: gloom(0.3) });
  arenaSweep(travertine, [[scaled(1.55), 0.02], [off(-0.4), 0.02]], { steps, colour: gloom(0.5) });
  // Storey two's inner wall stands under the top tread's front edge, the highest it can without rising through the seats.
  const upper = treadIn(tiers - 1);
  arenaSweep(travertine, [[scaled(upper), ARENA_STOREY], [off(-0.55), ARENA_STOREY]], { steps, colour: gloom(0.5) });
  arenaSweep(travertine, [[scaled(upper), topTread - 0.25], [scaled(upper), ARENA_STOREY]], { steps, colour: gloom(0.42) });
  arenaSweep(travertine, [[off(-0.55), topTread - 0.25], [scaled(upper), topTread - 0.25]], { steps, colour: gloom(0.3) });
  // The walk round the top of the cavea, and the wall behind it up to the attic's top.
  const backWall = lastOut + 0.01;
  arenaSweep(travertine, [[scaled(lastOut), topTread], [off(-0.4), topTread]], { steps, colour: tone(0.8) });
  arenaSweep(travertine, [[scaled(backWall), ARENA_STOREY * 3], [scaled(backWall), topTread]], { steps, colour: gloom(0.5) });
  arenaSweep(travertine, [[off(-0.4), ARENA_STOREY * 3], [scaled(backWall), ARENA_STOREY * 3]], { steps, colour: gloom(0.35) });
  const capTop = ARENA_ATTIC[1] + 0.42;
  arenaSweep(travertine, [[scaled(backWall), topTread], [scaled(backWall), capTop]], { steps, colour: (p) => tone(0.8 + 0.12 * arenaSmooth(topTread, topTread + 3, p.y)) });
  arenaSweep(travertine, [[scaled(backWall), capTop], [off(-0.45), capTop]], { steps, colour: tone(0.85) });
  // Doorways from the top walk into the building, one a bay, and a string course along the wall.
  for (let index = 0; index < ARENA_BAYS; index += 1) {
    const t = outer.angleOf((index + 0.5) * bay);
    const dt = 0.45 / Math.hypot(A * Math.sin(t), B * Math.cos(t));
    arenaSweep(travertine, [[scaled(backWall - 0.003), topTread], [scaled(backWall - 0.003), topTread + 1.9]], { t0: t - dt, t1: t + dt, steps: 3, colour: tone(0.13) });
  }
  arenaBlock(travertine, scaled(backWall - 0.008), scaled(backWall), ARENA_STOREY * 3 - 0.1, ARENA_STOREY * 3 + 0.12, 0, Math.PI * 2, { colour: tone(0.78) });

  // ---- The cavea: stepped treads with a rounded nosing, aisles of half-steps, vomitoria ----
  const sector = (p) => {
    const angle = Math.atan2(p.z / rz, p.x / rx);
    const k = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 16);
    return 0.93 + ((k * 7919) % 13) / 13 * 0.1;
  };
  for (let tier = 0; tier < tiers; tier += 1) {
    const s0 = treadIn(tier);
    const s1 = s0 + step;
    const y = treadY(tier);
    // The senators' tiers nearest the sand in finer, paler stone.
    const base = tier < 2 ? 0.98 : 0.86 - (tier % 2) * 0.03;
    const colour = (p, n) => {
      const v = base * sector(p) * (n.y > 0.5 ? 1 : 0.86);
      return [v, v * 0.98, v * 0.94];
    };
    const profile = tier === 0 ? [[scaled(s0), y], [scaled(s1), y]] : [[scaled(s0), y - rise], [scaled(s0), y - 0.05], [scaled(s0 + 0.004), y], [scaled(s1), y]];
    arenaSweep(travertine, profile, { steps: 360, colour });
  }
  // Sixteen stairways: a half-step on the back of every tread.
  for (let aisle = 0; aisle < 16; aisle += 1) {
    const t = (aisle * Math.PI) / 8;
    for (let tier = 0; tier < tiers - 1; tier += 1) {
      const s0 = treadIn(tier);
      const dt = 0.24 / (s0 * Math.hypot(rx * Math.sin(t), rz * Math.cos(t)));
      arenaBlock(travertine, scaled(s0 + step * 0.5), scaled(s0 + step), treadY(tier), treadY(tier) + rise / 2, t - dt, t + dt, { colour: (p, n) => tone(n.y > 0.5 ? 0.95 : 0.8) });
    }
  }
  // Eight vomitoria, the mouths the crowd came in by, between the stairways halfway up.
  const vomitoria = [];
  const vomTier = 4;
  for (let index = 0; index < 8; index += 1) {
    const t = ((index * 2 + 1) * Math.PI) / 8 + Math.PI / 16;
    const s0 = treadIn(vomTier);
    const s1 = treadIn(vomTier + 1) + 0.03;
    const y0 = treadY(vomTier);
    const y1 = treadY(vomTier + 1) + 0.55;
    const metre = s0 * Math.hypot(rx * Math.sin(t), rz * Math.cos(t));
    const open = 0.5 / metre;
    const cheek = 0.22 / metre;
    const colour = (p, n) => tone(n.y > 0.5 ? 0.9 : 0.78);
    arenaBlock(travertine, scaled(s0), scaled(s1), y0, y1, t - open - cheek, t - open, { colour });
    arenaBlock(travertine, scaled(s0), scaled(s1), y0, y1, t + open, t + open + cheek, { colour });
    arenaBlock(travertine, scaled(s0), scaled(s1), y0 + 1.05, y1, t - open, t + open, { colour });
    const back = treadIn(vomTier + 1);
    arenaBlock(travertine, scaled(back - 0.004), scaled(back - 0.001), y0, y0 + 1.05, t - open, t + open, { colour: tone(0.1) });
    vomitoria.push({ t, reach: (0.5 + 0.22 + 0.35) / metre });
  }

  // ---- The podium: marble-faced wall, plinth and cornice, the inscribed balustrade, the gates ----
  const inner = arenaEllipsePath(rx, rz);
  const gates = [0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, (Math.PI * 3) / 4, (-Math.PI * 3) / 4].map((angle) => {
    const big = Math.abs(Math.sin(angle)) < 0.1;
    const width = big ? 2.2 : 1.3;
    return { u: inner.uOf(angle), big, width, height: big ? 2.6 : 2.0, span: width + 1.2 };
  }).sort((a, b) => a.u - b.u);
  const podiumFace = (p) => {
    const v = 0.88 * (0.76 + 0.24 * arenaSmooth(0, 1.4, p.y));
    return [v, v * 0.99, v * 0.97];
  };
  const wallDepth = 0.6;
  gates.forEach((gate, index) => {
    const next = gates[(index + 1) % gates.length];
    const from = gate.u + gate.span / 2;
    const to = next.u - next.span / 2 + (index === gates.length - 1 ? inner.length : 0);
    const length = to - from;
    marble.add(new THREE.BoxGeometry(length, podiumHeight, wallDepth, Math.ceil(length / 0.35), 1, 1), arenaAt(from + length / 2, podiumHeight / 2, wallDepth / 2), { warp: inner.warp, tile: 2.4, colour: podiumFace, offset: [random(), 0] });
    // The gate: an arch through the wall, a travertine surround, the passage behind.
    const { u, width, height, big } = gate;
    const radius = width / 2;
    const spring = height - radius;
    const half = gate.span / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-half, 0);
    shape.lineTo(-radius, 0);
    shape.lineTo(-radius, spring);
    shape.absarc(0, spring, radius, Math.PI, 0, true);
    shape.lineTo(radius, 0);
    shape.lineTo(half, 0);
    shape.lineTo(half, podiumHeight);
    for (let k = 1; k < 6; k += 1) shape.lineTo(half - (gate.span * k) / 6, podiumHeight);
    shape.lineTo(-half, podiumHeight);
    travertine.add(new THREE.ExtrudeGeometry(shape, { depth: wallDepth, bevelEnabled: false, curveSegments: 12 }), arenaAt(u, 0, 0), { warp: inner.warp, tile: 2, colour: weathered(0.95) });
    const ring = new THREE.Shape();
    ring.absarc(0, 0, radius + 0.2, 0, Math.PI, false);
    ring.absarc(0, 0, radius, Math.PI, 0, true);
    travertine.add(new THREE.ExtrudeGeometry(ring, { depth: 0.06, bevelEnabled: false, curveSegments: 14 }), arenaAt(u, spring, 0, 0, Math.PI), { warp: inner.warp, tile: 2, colour: weathered(1.02) });
    travertine.add(new THREE.BoxGeometry(0.2, 0.3, 0.1), arenaAt(u, height + 0.1, -0.05), { warp: inner.warp, tile: 2, colour: weathered(1.04) });
    for (const side of [-1, 1]) {
      travertine.add(new THREE.BoxGeometry(0.2, spring, 0.06), arenaAt(u + side * (radius + 0.1), spring / 2, -0.03), { warp: inner.warp, tile: 2, colour: weathered(1.02) });
      travertine.add(new THREE.BoxGeometry(0.28, 0.1, 0.1), arenaAt(u + side * (radius + 0.1), spring - 0.05, -0.05), { warp: inner.warp, tile: 2, colour: weathered(1.04) });
    }
    // The passage: walls, a barrel vault and a floor, darker the deeper in.
    const passage = 2.6;
    const dark = (p) => {
      const v = 0.5 * (1 - 0.8 * arenaSmooth(wallDepth, wallDepth + passage, p.z));
      return [v, v * 0.95, v * 0.88];
    };
    for (const side of [-1, 1]) travertine.add(new THREE.PlaneGeometry(passage, spring, 4, 1), arenaAt(u + side * radius, spring / 2, wallDepth + passage / 2, 0, -side * Math.PI / 2), { warp: inner.warp, tile: 2, colour: dark });
    travertine.add(new THREE.CylinderGeometry(radius, radius, passage, 14, 4, true, -Math.PI / 2, Math.PI), arenaAt(u, spring, wallDepth + passage / 2, -Math.PI / 2, 0, 0), { warp: inner.warp, tile: 2, colour: dark, flip: true });
    travertine.add(new THREE.PlaneGeometry(width, passage + wallDepth, 2, 4), arenaAt(u, 0.01, (wallDepth + passage) / 2, -Math.PI / 2), { warp: inner.warp, tile: 2, colour: (p) => tone(0.6 * (1 - 0.8 * arenaSmooth(0, wallDepth + passage, p.z)), [1, 0.9, 0.75]) });
    travertine.add(new THREE.PlaneGeometry(width, height), arenaAt(u, height / 2, wallDepth + passage, 0, Math.PI), { warp: inner.warp, colour: [0.04, 0.035, 0.03] });
    if (big) {
      // The great gates: an iron grille, round bars and three flat bars across, set in the reveal.
      const crownAt = (x) => spring + Math.sqrt(Math.max(0, radius * radius - x * x)) - 0.03;
      for (let x = -radius + 0.09; x < radius - 0.05; x += 0.16) {
        const h = crownAt(Math.abs(x) + 0.02);
        iron.add(new THREE.CylinderGeometry(0.022, 0.022, h, 6), arenaAt(u + x, h / 2, 0.32), { warp: inner.warp, colour: tone(0.75 + random() * 0.4, [1, 0.88, 0.75]) });
      }
      for (const y of [0.3, 0.95, 1.6]) iron.add(new THREE.BoxGeometry(2 * Math.sqrt(radius * radius - Math.max(0, y - spring) ** 2) - 0.04, 0.06, 0.03, 4, 1, 1), arenaAt(u, y, 0.29), { warp: inner.warp, colour: tone(0.8, [1, 0.85, 0.7]) });
    } else {
      // The lesser gates: double doors of boards, iron-strapped and studded.
      for (const side of [-1, 1]) {
        const leaf = new THREE.Shape();
        leaf.moveTo(0, 0);
        leaf.lineTo(radius - 0.02, 0);
        leaf.lineTo(radius - 0.02, spring);
        leaf.absarc(0, spring, radius - 0.02, 0, Math.PI / 2, false);
        leaf.lineTo(0, 0);
        wood.add(new THREE.ExtrudeGeometry(leaf, { depth: 0.07, bevelEnabled: false, curveSegments: 8 }), arenaAt(u, 0, 0.36, 0, 0, 0, side, 1, 1), { warp: inner.warp, tile: 1.2, colour: tone(0.9) });
        for (const y of [0.3, spring * 0.5 + 0.15, spring - 0.05]) iron.add(new THREE.BoxGeometry(radius - 0.12, 0.07, 0.015), arenaAt(u + side * (radius / 2), y, 0.352), { warp: inner.warp, colour: tone(0.55) });
        iron.add(new THREE.TorusGeometry(0.06, 0.012, 5, 12), arenaAt(u + side * 0.12, 1.0, 0.345), { warp: inner.warp, colour: tone(0.6) });
      }
    }
  });
  // Plinth and cornice along the whole podium (gates included: they cut through the cornice's band below it).
  const lip = (from, length, profile, y, builder, colour) => arenaRun(builder, profile, { from, length, y, warp: inner.warp, tile: 2, colour });
  gates.forEach((gate, index) => {
    const next = gates[(index + 1) % gates.length];
    const from = gate.u + gate.width / 2 + 0.2;
    const to = next.u - next.width / 2 - 0.2 + (index === gates.length - 1 ? inner.length : 0);
    lip(from, to - from, [[0.05, 0], [-0.12, 0], [-0.12, 0.26], [-0.05, 0.34], [0.05, 0.34]], 0, travertine, weathered(0.8));
  });
  lip(0, inner.length, [[0.05, 0], [-0.04, 0], [-0.04, 0.07], [-0.15, 0.18], [-0.15, 0.25], [0.05, 0.25]], podiumHeight - 0.25, marble, tone(0.95));
  // The balustrade on the podium's edge, the inscribed face toward the sand, a rounded coping, the marble deck behind.
  const parapetTop = podiumHeight + 0.85;
  inscribed.add(new THREE.BoxGeometry(inner.length, 0.85, 0.2, 360, 1, 1), arenaAt(inner.length / 2, podiumHeight + 0.425, 0.12), { warp: inner.warp, tile: [-4.8, 0.9], offset: [0, -podiumHeight / 0.9], colour: tone(0.97) });
  arenaRun(marble, [[0.0, 0], [0.26, 0], [0.26, 0.05], [0.22, 0.1], [0.04, 0.1], [0.0, 0.05]], { length: inner.length, y: parapetTop, warp: inner.warp, tile: 2.4, colour: tone(0.98) });
  arenaSweep(marble, [[arenaOffset(rx, rz, 0.2), podiumHeight + 0.2], [scaled(treadIn(0)), podiumHeight + 0.2]], { steps: 320, tile: 2.4, colour: tone(0.9) });

  // ---- The velarium: the awning drawn over the side away from the sun, on ropes from the masts ----
  const mastTop = 19.3;
  const sail = { t0: 2.45, t1: 4.35 };
  const sailProfile = [];
  for (let k = 0; k <= 6; k += 1) {
    const f = k / 6;
    const from = off(-0.1);
    const to = scaled(1.3);
    const curve = (t) => {
      const [ax, az] = from(t);
      const [bx, bz] = to(t);
      return [ax + (bx - ax) * f, az + (bz - az) * f];
    };
    sailProfile.push([curve, mastTop - 0.4 - (mastTop - 0.4 - 15.6) * f - 0.7 * Math.sin(Math.PI * f)]);
  }
  arenaSweep(linen, sailProfile.slice().reverse(), { ...sail, steps: 120, tile: 2, colour: (p) => {
    // Alternate widths dyed and plain, as the paintings show it.
    const angle = Math.atan2(p.z / rz, p.x / rx);
    const stripe = Math.floor(angle * 12) % 2 === 0;
    return stripe ? [0.98, 0.95, 0.88] : [0.86, 0.62, 0.42];
  } });
  const ropes = [];
  for (let index = 0; index < ARENA_BAYS * 3; index += 1) {
    const u = (index + 0.5) * (bay / 3);
    const t = outer.angleOf(u);
    const [mx, mz] = off(0.12)(t);
    const [ix, iz] = scaled(1.3)(t);
    const covered = (t > sail.t0 && t < sail.t1) || (t + Math.PI * 2 > sail.t0 && t + Math.PI * 2 < sail.t1);
    if (covered && index % 2 === 0) ropes.push(mx, mastTop, mz, ix, 15.5, iz);
  }

  const materials = {
    travertine: arenaMaterial(arenaTravertine(), { roughness: 0.92 }),
    marble: arenaMaterial(arenaMarble(), { roughness: 0.5 }),
    inscribed: arenaMaterial(arenaInscription(), { roughness: 0.55 }),
    iron: arenaMaterial(null, { color: 0x3a332c, roughness: 0.6, metalness: 0.55 }),
    wood: arenaMaterial(arenaWood(), { roughness: 0.85 }),
    linen: arenaMaterial(arenaLinen(), { roughness: 0.95, side: THREE.DoubleSide }),
  };
  for (const [builder, material] of [[travertine, materials.travertine], [marble, materials.marble], [inscribed, materials.inscribed], [iron, materials.iron], [wood, materials.wood], [linen, materials.linen]]) {
    const mesh = builder.mesh(material);
    if (mesh) group.add(mesh);
  }
  if (ropes.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(ropes, 3));
    group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x6a5a44 })));
  }
  const blocksSeat = (tier, angle) => {
    if (tier !== vomTier && tier !== vomTier + 1) return false;
    const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return vomitoria.some(({ t, reach }) => Math.abs(((a - t + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < reach);
  };
  return { group, blocksSeat, triangles: [travertine, marble, inscribed, iron, wood, linen].reduce((sum, b) => sum + b.triangles, 0) };
}
