// The castle kit's geometry: pieces appended to a batch (one merged mesh per material per chunk of ground), so that
// a whole section is a handful of draw calls. Positions are world metres; UVs are in metres too (kittex.js tiles
// its textures over so many); a vertex colour carries the tint and a little ambient occlusion (darker toward the
// foot of a wall). Nothing here touches the DOM; THREE is the page's.

import { ktRandom } from './kittex.js';

/** Chunk size (m) of the ground the merged meshes are cut into, so that frustum culling has something to cull. */
const KG_CHUNK = 36;

const kgClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Triangles waiting to become meshes, by material and chunk. */
export class KitBatch {
  constructor(materials, seed = 1) {
    this.materials = materials;
    this.buckets = new Map();
    this.random = ktRandom(seed);
    this.triangles = 0;
  }

  bucket(material, x, z) {
    const key = `${material}|${Math.floor(x / KG_CHUNK)}|${Math.floor(z / KG_CHUNK)}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (!this.materials[material]) throw new Error(`kit: no material ${material}`);
      bucket = { material, position: [], normal: [], uv: [], color: [] };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  /**
   * Append a geometry (indexed or not) under a matrix. `tint`: a grey multiplier or [r, g, b]; `aoFrom`: the height
   * of the foot of the piece, below which the surface darkens (up to `aoSpan` m above it it lightens to full);
   * `uvShift`: a random phase to the texture (on by default, so neighbouring walls do not repeat).
   */
  add(material, geometry, matrix = null, { tint = 1, aoFrom = null, aoSpan = 2.6, aoMin = 0.55, jitter = 0.06, shift: shifted = true } = {}) {
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    const index = geometry.index;
    const count = index ? index.count : position.count;
    const [tr, tg, tb] = Array.isArray(tint) ? tint : [tint, tint, tint];
    const shift = shifted ? this.random() : 0;
    const phase = this.random();
    const bucket = (() => {
      const first = index ? index.getX(0) : 0;
      const v = new THREE.Vector3(position.getX(first), position.getY(first), position.getZ(first));
      if (matrix) v.applyMatrix4(matrix);
      return this.bucket(material, v.x, v.z);
    })();
    const normalMatrix = matrix ? new THREE.Matrix3().getNormalMatrix(matrix) : null;
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    const variation = 1 + (phase - 0.5) * 2 * jitter;
    for (let k = 0; k < count; k += 1) {
      const i = index ? index.getX(k) : k;
      v.set(position.getX(i), position.getY(i), position.getZ(i));
      if (matrix) v.applyMatrix4(matrix);
      bucket.position.push(v.x, v.y, v.z);
      n.set(normal.getX(i), normal.getY(i), normal.getZ(i));
      if (normalMatrix) n.applyMatrix3(normalMatrix).normalize();
      bucket.normal.push(n.x, n.y, n.z);
      bucket.uv.push(uv ? uv.getX(i) + shift * 3 : 0, uv ? uv.getY(i) + shift * 5 : 0);
      const ao = aoFrom === null ? 1 : aoMin + (1 - aoMin) * kgClamp((v.y - aoFrom) / aoSpan, 0, 1);
      bucket.color.push(tr * ao * variation, tg * ao * variation, tb * ao * variation);
    }
    this.triangles += count / 3;
  }

  /** Append triangles already as flat arrays (positions, normals, uvs, colours). */
  raw(material, position, normal, uv, color) {
    if (!position.length) return;
    const bucket = this.bucket(material, position[0], position[2]);
    for (let k = 0; k < position.length; k += 1) bucket.position.push(position[k]);
    for (let k = 0; k < normal.length; k += 1) bucket.normal.push(normal[k]);
    for (let k = 0; k < uv.length; k += 1) bucket.uv.push(uv[k]);
    for (let k = 0; k < color.length; k += 1) bucket.color.push(color[k]);
    this.triangles += position.length / 9;
  }

  /** One mesh per material per chunk, into `group`. Returns the meshes. */
  build(group, { name = 'kit', cast = false } = {}) {
    const meshes = [];
    for (const bucket of this.buckets.values()) {
      if (!bucket.position.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.position, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normal, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uv, 2));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(bucket.color, 3));
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      const mesh = new THREE.Mesh(geometry, this.materials[bucket.material]);
      mesh.name = `${name}:${bucket.material}`;
      mesh.castShadow = cast;
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      meshes.push(mesh);
    }
    this.buckets.clear();
    return meshes;
  }
}

// ---- matrices --------------------------------------------------------------------------------------

/** A matrix: turned `yaw` about y (the fighter's own sense: yaw 0 along +x, positive toward -z), then moved to (x, y, z). */
export function kgPlace(x, y, z, yaw = 0) {
  const matrix = new THREE.Matrix4().makeRotationY(yaw);
  matrix.setPosition(x, y, z);
  return matrix;
}

// ---- boxes -----------------------------------------------------------------------------------------

/**
 * A box with UVs in metres. Centre (cx, cy, cz), size (w along the turned x, h up, d along the turned z), turned `yaw`.
 * `faces`: which to draw: 'top', 'bottom', 'ends', 'sides' (the long faces); default all but the bottom.
 */
export function kgBox(batch, material, cx, cy, cz, w, h, d, yaw = 0, { faces = ['top', 'ends', 'sides'], ...options } = {}) {
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;
  const position = [];
  const normal = [];
  const uv = [];
  const face = (corners, nrm, us, vs) => {
    for (const k of [0, 1, 2, 0, 2, 3]) {
      position.push(...corners[k]);
      normal.push(...nrm);
      uv.push(us[k], vs[k]);
    }
  };
  if (faces.includes('sides')) {
    face([[-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]], [0, 0, 1], [0, w, w, 0], [cy - hh, cy - hh, cy + hh, cy + hh]);
    face([[hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd]], [0, 0, -1], [0, w, w, 0], [cy - hh, cy - hh, cy + hh, cy + hh]);
  }
  if (faces.includes('ends')) {
    face([[hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd]], [1, 0, 0], [0, d, d, 0], [cy - hh, cy - hh, cy + hh, cy + hh]);
    face([[-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd]], [-1, 0, 0], [0, d, d, 0], [cy - hh, cy - hh, cy + hh, cy + hh]);
  }
  if (faces.includes('top')) face([[-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd], [-hw, hh, -hd]], [0, 1, 0], [0, w, w, 0], [0, 0, d, d]);
  if (faces.includes('bottom')) face([[-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]], [0, -1, 0], [0, w, w, 0], [0, 0, d, d]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const matrix = new THREE.Matrix4().makeRotationY(yaw);
  matrix.setPosition(cx, cy, cz);
  batch.add(material, geometry, matrix, options);
  geometry.dispose();
}

/** A quad from four corners (anticlockwise seen from the side it faces), UVs in metres from the corners' spans. */
export function kgQuad(batch, material, a, b, c, d, options = {}) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ad = new THREE.Vector3().subVectors(d, a);
  const nrm = new THREE.Vector3().crossVectors(ab, ad).normalize();
  const geometry = new THREE.BufferGeometry();
  const corners = [a, b, c, d];
  const position = [];
  const normal = [];
  const uv = [];
  const u = [0, ab.length(), ab.length(), 0];
  const v = [0, 0, ad.length(), ad.length()];
  for (const k of [0, 1, 2, 0, 2, 3]) {
    position.push(corners[k].x, corners[k].y, corners[k].z);
    normal.push(nrm.x, nrm.y, nrm.z);
    uv.push(u[k], v[k]);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  batch.add(material, geometry, null, options);
  geometry.dispose();
}

/** A horizontal rectangle (x0..x1, z0..z1) at height y facing up, UVs in world metres (so neighbours tile together). */
export function kgFloor(batch, material, x0, x1, z0, z1, y, options = {}) {
  const geometry = new THREE.BufferGeometry();
  const position = [x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z1, x1, y, z0, x0, y, z0];
  const uv = [x0, z1, x1, z1, x1, z0, x0, z1, x1, z0, x0, z0];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  batch.add(material, geometry, null, { jitter: 0.04, shift: false, ...options });
  geometry.dispose();
}

// ---- extruded shapes -------------------------------------------------------------------------------

/** A wall face from a polygon in (s, y) (s along the wall), with holes (arrays of points), as a Shape. */
export function kgShape(points, holes = []) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  return shape;
}

/**
 * Extrude a shape (in a local x-y plane) `depth` along z, and put it in the batch under `matrix`. The caps (the
 * faces on the shape's plane: a wall's two faces) take `material`, the sides (the reveals of its holes, its top
 * and ends) take `sideMaterial`.
 */
export function kgExtrude(batch, material, sideMaterial, shape, depth, matrix, options = {}, only = null) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 });
  geometry.translate(0, 0, -depth / 2);
  const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: geometry.attributes.position.count, materialIndex: 0 }];
  for (const group of groups) {
    if (only === 'caps' && group.materialIndex !== 0) continue;
    const part = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const source = geometry.attributes[name];
      const size = source.itemSize;
      part.setAttribute(name, new THREE.Float32BufferAttribute(source.array.slice(group.start * size, (group.start + group.count) * size), size));
    }
    batch.add(group.materialIndex === 0 ? material : sideMaterial, part, matrix, options);
    part.dispose();
  }
  geometry.dispose();
}

/** The outline of an arched opening in a wall, centred at `center` along the wall: sill y0, the crown at `top`; `shape`: round | pointed | lancet | square | slit | oillet. */
export function kgOpening(center, width, y0, top, shape) {
  const half = width / 2;
  if (shape === 'square' || shape === 'slit') return [[center - half, y0], [center + half, y0], [center + half, top], [center - half, top]];
  if (shape === 'oillet') {
    const middle = (y0 + top) / 2;
    return Array.from({ length: 14 }, (_, k) => [center + Math.cos((k / 14) * Math.PI * 2) * half, middle + Math.sin((k / 14) * Math.PI * 2) * half]);
  }
  const rise = shape === 'round' ? half : shape === 'pointed' ? half * 1.35 : half * 2.2;
  const spring = Math.max(y0 + 0.2, top - rise);
  const arch = top - spring;
  const points = [[center - half, y0], [center + half, y0], [center + half, spring]];
  const steps = 10;
  if (shape === 'round' || arch <= half) {
    // A round (or, if it is squat, an elliptical) arch.
    for (let k = 1; k < steps; k += 1) {
      const angle = (k / steps) * Math.PI;
      points.push([center + Math.cos(angle) * half, spring + Math.sin(angle) * arch]);
    }
  } else {
    // Two arcs meeting in a point: the right arc's centre is `c` to the left of the middle, on the springing line.
    const c = (arch * arch - half * half) / (2 * half);
    const radius = half + c;
    const apex = Math.acos(c / radius);
    for (let k = 1; k < steps; k += 1) {
      const angle = (k / steps) * apex;
      points.push([center - c + Math.cos(angle) * radius, spring + Math.sin(angle) * radius]);
    }
    points.push([center, top]);
    for (let k = steps - 1; k >= 1; k -= 1) {
      const angle = (k / steps) * apex;
      points.push([center + c - Math.cos(angle) * radius, spring + Math.sin(angle) * radius]);
    }
  }
  points.push([center - half, spring]);
  return points;
}

// ---- sweeps ----------------------------------------------------------------------------------------

/**
 * A grid of vertices as triangles, each wound to face the way its normals point.
 * `grid[r][c] = { p: [x, y, z], n: [x, y, z], uv: [u, v] }`.
 */
function kgGrid(grid) {
  const position = [];
  const normal = [];
  const uv = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const push = (p, q, r) => {
    a.set(...p.p);
    b.set(...q.p);
    c.set(...r.p);
    const cross = b.clone().sub(a).cross(c.clone().sub(a));
    const facing = cross.x * (p.n[0] + q.n[0] + r.n[0]) + cross.y * (p.n[1] + q.n[1] + r.n[1]) + cross.z * (p.n[2] + q.n[2] + r.n[2]);
    const order = facing >= 0 ? [p, q, r] : [p, r, q];
    for (const v of order) {
      position.push(...v.p);
      normal.push(...v.n);
      uv.push(...v.uv);
    }
  };
  for (let r = 0; r + 1 < grid.length; r += 1) {
    for (let k = 0; k + 1 < grid[r].length; k += 1) {
      push(grid[r][k], grid[r + 1][k], grid[r + 1][k + 1]);
      push(grid[r][k], grid[r + 1][k + 1], grid[r][k + 1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

/** Append a grid built by `kgGrid` and let go of it. */
export function kgAddGrid(batch, material, grid, options = {}) {
  const geometry = kgGrid(grid);
  batch.add(material, geometry, null, options);
  geometry.dispose();
}

/**
 * A barrel vault's underside from `a` to `b` ([x, z, springing height] each), `width` across, rising `crown` over the
 * springing (a semi-ellipse), with transverse ribs every `ribs` m. Seen from below.
 */
export function kgVault(batch, material, a, b, width, crown, { ribs = 0, ribMaterial = material, tint = 1, ribWidth = 0.5, ribDrop = 0.16 } = {}) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  const ux = dx / length;
  const uz = dz / length;
  const lx = -uz;
  const lz = ux;
  const half = width / 2;
  const columns = 12;
  const surface = (s, t, drop) => {
    const spring = a[2] + (b[2] - a[2]) * (s / length);
    return [a[0] + ux * s + lx * t * half, spring + crown * Math.sqrt(Math.max(0, 1 - t * t)) - drop, a[1] + uz * s + lz * t * half];
  };
  const sweep = (s0, s1, drop, mat) => {
    const stations = Math.max(1, Math.ceil((s1 - s0) / 1.2));
    const grid = [];
    for (let i = 0; i <= stations; i += 1) {
      const s = s0 + ((s1 - s0) * i) / stations;
      const row = [];
      let arc = 0;
      let previous = null;
      for (let j = 0; j <= columns; j += 1) {
        const t = -1 + (2 * j) / columns;
        const point = surface(s, t, drop);
        if (previous) arc += Math.hypot(point[0] - previous[0], point[1] - previous[1], point[2] - previous[2]);
        previous = point;
        // The inward (downward) normal, perpendicular to the arc in the cross-section.
        const root = Math.sqrt(Math.max(0.0025, 1 - t * t));
        const nl = (-crown * t) / root;
        const nu = -half;
        const norm = Math.hypot(nl, nu);
        row.push({ p: point, n: [(lx * nl) / norm, nu / norm, (lz * nl) / norm], uv: [s, arc] });
      }
      grid.push(row);
    }
    kgAddGrid(batch, mat, grid, { tint, aoFrom: null });
  };
  sweep(0, length, 0, material);
  if (ribs > 0) {
    for (let s = ribs / 2; s < length - ribWidth / 2; s += ribs) sweep(s - ribWidth / 2, s + ribWidth / 2, ribDrop, ribMaterial);
    sweep(0, ribWidth, ribDrop, ribMaterial);
    sweep(length - ribWidth, length, ribDrop, ribMaterial);
  }
}

/** A flight of steps (or a ramp) as an extruded profile: treads and risers in `material`, the two flanks in `flank`. */
export function kgFlight(batch, material, flank, solid, { base = null, options = {} } = {}) {
  const [cx, cz] = solid.at;
  const [length, width] = solid.size;
  const hu = length / 2;
  const points = [];
  if (solid.kind === 'ramp') {
    const low = base ?? Math.min(solid.from, solid.to) - 0.6;
    points.push([-hu, low], [hu, low], [hu, solid.to], [-hu, solid.from]);
    // The top is drawn on its own, its texture laid in world metres (an extruded slope smears it).
    const yaw = solid.yaw ?? 0;
    const hv = width / 2;
    const corner = (u, v, y) => new THREE.Vector3(cx + u * Math.cos(yaw) + v * Math.sin(yaw), y, cz - u * Math.sin(yaw) + v * Math.cos(yaw));
    const a = corner(-hu, -hv, solid.from);
    const b = corner(hu, -hv, solid.to);
    const c = corner(hu, hv, solid.to);
    const d = corner(-hu, hv, solid.from);
    const geometry = new THREE.BufferGeometry();
    const position = [];
    const normal = [];
    const uv = [];
    const up = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
    const order = up.y > 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    const nrm = up.clone().normalize().multiplyScalar(up.y > 0 ? 1 : -1);
    for (const v of order) {
      position.push(v.x, v.y, v.z);
      normal.push(nrm.x, nrm.y, nrm.z);
      uv.push(v.x, v.z);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    batch.add(material, geometry, null, options);
    geometry.dispose();
    kgExtrude(batch, flank, material, kgShape(points), width, kgPlace(cx, 0, cz, yaw), options, 'caps');
    return;
  } else {
    const low = base ?? solid.from - 0.6;
    const tread = length / solid.steps;
    points.push([-hu, low], [hu, low], [hu, solid.from + solid.steps * solid.rise]);
    for (let step = solid.steps - 1; step >= 0; step -= 1) {
      points.push([-hu + step * tread, solid.from + (step + 1) * solid.rise]);
      if (step > 0) points.push([-hu + step * tread, solid.from + step * solid.rise]);
    }
  }
  // The shape's x is the flight's u (the way up), its extrusion across it.
  kgExtrude(batch, flank, material, kgShape(points), width, kgPlace(cx, 0, cz, solid.yaw ?? 0), options);
  // The lip of each tread: a pale worn nosing, so that a flight reads as steps (the dark gap under it) and not as a slope of stone.
  const yaw = solid.yaw ?? 0;
  const tread = length / solid.steps;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  for (let step = 0; step < solid.steps; step += 1) {
    const u = -hu + step * tread + 0.06;
    kgBox(batch, 'ashlar', cx + u * c, solid.from + (step + 1) * solid.rise + 0.012, cz - u * s, 0.13, 0.03, width - 0.02, yaw, { faces: ['top', 'ends'], tint: 1.45, jitter: 0.1, shift: false });
  }
}

/** A tube along points [x, y, z] (rope, rail, chain). */
export function kgTube(batch, material, points, radius, { segments = 24, sides = 5, ...options } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const geometry = new THREE.TubeGeometry(curve, segments, radius, sides, false);
  batch.add(material, geometry, null, options);
  geometry.dispose();
}

/** A cylinder (a post, a barrel, a pillar) standing with its base at (x, y, z); `tiltX`/`tiltZ` lean it. */
export function kgCylinder(batch, material, x, y, z, radiusTop, radiusBottom, height, { sides = 8, tiltX = 0, tiltZ = 0, ...options } = {}) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, sides, 1, false);
  geometry.translate(0, height / 2, 0);
  const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tiltX, 0, tiltZ));
  matrix.setPosition(x, y, z);
  // CylinderGeometry's uv runs 0..1: in metres for the texture.
  const uv = geometry.attributes.uv;
  for (let k = 0; k < uv.count; k += 1) uv.setXY(k, uv.getX(k) * Math.PI * (radiusTop + radiusBottom), uv.getY(k) * height);
  batch.add(material, geometry, matrix, options);
  geometry.dispose();
}

/** A rough lump (a rock, a heap of rubble) from an icosahedron, stretched and roughened. */
export function kgLump(batch, material, x, y, z, rx, ry, rz, { seed = 1, detail = 1, ...options } = {}) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const random = ktRandom(seed);
  const position = geometry.attributes.position;
  const jitter = new Map();
  for (let k = 0; k < position.count; k += 1) {
    const key = `${position.getX(k).toFixed(3)},${position.getY(k).toFixed(3)},${position.getZ(k).toFixed(3)}`;
    if (!jitter.has(key)) jitter.set(key, 0.82 + random() * 0.36);
    const f = jitter.get(key);
    position.setXYZ(k, position.getX(k) * f, position.getY(k) * f, position.getZ(k) * f);
  }
  geometry.computeVertexNormals();
  const uv = geometry.attributes.uv;
  for (let k = 0; k < uv.count; k += 1) uv.setXY(k, uv.getX(k) * rx * 3, uv.getY(k) * ry * 3);
  const matrix = new THREE.Matrix4().makeScale(rx, ry, rz);
  matrix.setPosition(x, y, z);
  batch.add(material, geometry, matrix, options);
  geometry.dispose();
}

/** A smooth 3D value noise (about -1..1) from a hashed lattice, for the shape of a rock. */
function kgNoise3(x, y, z, seed) {
  const hash = (i, j, k) => {
    const v = Math.sin(i * 127.1 + j * 311.7 + k * 74.7 + seed * 19.19) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;
  };
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const mix = (a, b, t) => a + (b - a) * t;
  return mix(
    mix(mix(hash(ix, iy, iz), hash(ix + 1, iy, iz), sx), mix(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), sx), sy),
    mix(mix(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), sx), mix(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), sx), sy),
    sz,
  );
}

/**
 * A boulder or a crag: an icosphere pushed about by noise at three scales (big swells, ledges, grain) and flattened toward the foot, smooth-shaded over
 * its facets (so it reads as stone and not as a gem), its texture laid by the way each face points (plan on the tops, along the sides on the flanks).
 * Centre (x, y, z), radii (rx, ry, rz): `y` is the centre. `tint`, `aoFrom`, `aoSpan` as every piece's.
 */
export function kgRock(batch, material, x, y, z, rx, ry, rz, { seed = 1, detail = 2, ...options } = {}) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const position = geometry.attributes.position;
  const count = position.count;
  const dir = [];
  const shaped = [];
  const radiusAt = (dx, dy, dz) => {
    // Swells, ledges (a ridge noise, sharp where it folds) and grain; the underside is drawn in.
    const swell = kgNoise3(dx * 1.3 + 3, dy * 1.3, dz * 1.3, seed) * 0.26;
    const ridge = (1 - Math.abs(kgNoise3(dx * 2.7, dy * 2.7 + 5, dz * 2.7, seed + 1))) * 0.2 - 0.1;
    const grain = kgNoise3(dx * 6.3, dy * 6.3, dz * 6.3 + 9, seed + 2) * 0.05;
    const flat = dy < -0.2 ? 0.85 : 1;
    return (1 + swell + ridge + grain) * flat;
  };
  for (let k = 0; k < count; k += 1) {
    const dx = position.getX(k);
    const dy = position.getY(k);
    const dz = position.getZ(k);
    const f = radiusAt(dx, dy, dz);
    dir.push([dx, dy, dz]);
    shaped.push([dx * f * rx, dy * f * ry, dz * f * rz]);
  }
  const normal = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  for (let tri = 0; tri < count; tri += 3) {
    const a = shaped[tri];
    const b = shaped[tri + 1];
    const c = shaped[tri + 2];
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let fx = uy * vz - uz * vy;
    let fy = uz * vx - ux * vz;
    let fz = ux * vy - uy * vx;
    const length = Math.hypot(fx, fy, fz) || 1;
    fx /= length;
    fy /= length;
    fz /= length;
    for (let j = 0; j < 3; j += 1) {
      const d = dir[tri + j];
      // The smooth normal of an ellipsoid there, half-mixed with the face's.
      let sx = d[0] / rx;
      let sy = d[1] / ry;
      let sz = d[2] / rz;
      const sl = Math.hypot(sx, sy, sz) || 1;
      sx = sx / sl + fx * 0.8;
      sy = sy / sl + fy * 0.8;
      sz = sz / sl + fz * 0.8;
      const nl = Math.hypot(sx, sy, sz) || 1;
      normal[(tri + j) * 3] = sx / nl;
      normal[(tri + j) * 3 + 1] = sy / nl;
      normal[(tri + j) * 3 + 2] = sz / nl;
      const p = shaped[tri + j];
      const top = Math.abs(fy) > Math.max(Math.abs(fx), Math.abs(fz));
      uv[(tri + j) * 2] = top ? p[0] : Math.abs(fx) > Math.abs(fz) ? p[2] : p[0];
      uv[(tri + j) * 2 + 1] = top ? p[2] : p[1];
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(shaped.flat(), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const matrix = new THREE.Matrix4().makeTranslation(x, y, z);
  batch.add(material, out, matrix, options);
  geometry.dispose();
  out.dispose();
}
