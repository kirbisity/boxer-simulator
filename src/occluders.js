// What stands in the camera's way in a place that has no collision world of its own (a battle's town, port, coast fort, the
// sandbox's places): the place's scenery, taken once as a sparse grid of voxels. Each triangle of each solid piece of scenery (a house, a
// wall, a container, a boat, the stands) adds its area to the voxels it passes through; a voxel with enough surface in it is occupied.
// Trees and the like, drawn as instanced copies, are posts instead: one cylinder each. The spring arm (cameraarm.js) sweeps its ball through
// the grid: a hash lookup per sample, nothing is raycast against a mesh and nothing is walked triangle by triangle in a frame.
//
// A place is taken once, when it is first shown, a few milliseconds of each frame until it is done (until then the camera has no scenery
// to avoid, as before), and again only if its scenery is swapped (scenerylod.js, `forget`).
//
// The grid and the sweep are plain arrays and run in Node; only `voxelsOfPlace` reads a THREE scene (a global in the page).

/* global THREE */

export const OCCLUDERS = {
  // m: a voxel's side. Half a metre: a post and a rail do not close the view, a wall and a house do, and the camera stops within half a metre of a wall.
  cell: 0.5,
  // m2 of surface in a voxel for it to count (a rope, a wire, a blade of grass is less; a wall crossing it, two faces of 0.25 m2, more).
  area: 0.06,
  // m: samples along the arm are this far apart (the ball is bigger, so nothing thinner than a voxel is stepped over), then bisected.
  step: 0.2,
  // m: nearer than this to the start of the arm nothing counts (the look point is by the man, and may stand against a wall).
  skip: 0.5,
  // m: a mesh whose top is lower than this is floor (a kerb, a rug, the ground's relief); one wider than `skyWide` is ground or sky.
  floorTop: 0.35,
  skyWide: 90,
  // An instanced mesh (trees, stones) counts only if each copy is taller than this (grass and flowers are not); each copy is a post of this share
  // of its mean width (a tree's crown is open, and its trunk is thin: not its whole width) and `postMax` m at most.
  instanceHigh: 1.5,
  postShare: 0.3,
  postMax: 1.6,
  // The most triangles taken from one place in all (a safety: a place of a million triangles is not taken whole), and how many a slice of work takes between looks at the clock.
  triangles: 1500000,
  slice: 4000,
};

/** The voxel grid: occupied cells by integer key, the coarser cells that hold any of them (to pass empty space in one lookup), and the posts. */
export function createVoxels(spec = OCCLUDERS) {
  const area = new Map();
  const coarse = new Set();
  const posts = new Map();
  const COARSE = 4;
  const POST_CELL = 4;
  const key = (ix, iy, iz) => ((ix + 4096) * 8192 + (iz + 4096)) * 2048 + (iy + 1024);
  const inverse = 1 / spec.cell;
  let occupied = 0;
  let postCount = 0;

  /** Add `amount` m2 of surface at a point. */
  function addAt(x, y, z, amount) {
    const ix = Math.floor(x * inverse);
    const iy = Math.floor(y * inverse);
    const iz = Math.floor(z * inverse);
    const k = key(ix, iy, iz);
    const before = area.get(k) ?? 0;
    const total = before + amount;
    area.set(k, total);
    if (total >= spec.area && before < spec.area) {
      occupied += 1;
      // The coarse cell and its neighbours: a ball at the edge of one still finds the voxel in the next.
      const cx = Math.floor(ix / COARSE);
      const cy = Math.floor(iy / COARSE);
      const cz = Math.floor(iz / COARSE);
      for (let a = -1; a <= 1; a += 1) for (let b = -1; b <= 1; b += 1) for (let c = -1; c <= 1; c += 1) coarse.add(key(cx + a, cy + b, cz + c));
    }
  }

  /** A triangle (nine numbers: three points), its area spread over the voxels it covers. */
  function addTriangle(ax, ay, az, bx, by, bz, cx, cy, cz) {
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const size = Math.hypot(nx, ny, nz) / 2;
    if (size < 1e-9) return;
    const longest2 = Math.max(ux * ux + uy * uy + uz * uz, vx * vx + vy * vy + vz * vz, (cx - bx) ** 2 + (cy - by) ** 2 + (cz - bz) ** 2);
    // Samples 0.6 of a voxel apart over the triangle (no voxel it crosses is missed), each with its share of the area.
    const gap = spec.cell * 0.6;
    const n = longest2 < gap * gap ? 1 : Math.ceil(Math.sqrt(longest2) / gap);
    if (n === 1) {
      addAt((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3, size);
      return;
    }
    const share = size / (n * n);
    // The n*n small triangles of the barycentric grid, each sampled at its centre.
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n - i; j += 1) {
        const s = (i + 1 / 3) / n;
        const t = (j + 1 / 3) / n;
        addAt(ax + ux * s + vx * t, ay + uy * s + vy * t, az + uz * s + vz * t, share);
        if (i + j < n - 1) {
          const s2 = (i + 2 / 3) / n;
          const t2 = (j + 2 / 3) / n;
          addAt(ax + ux * s2 + vx * t2, ay + uy * s2 + vy * t2, az + uz * s2 + vz * t2, share);
        }
      }
    }
  }

  /** A post: a vertical cylinder of `radius` at (x, z) from height `low` to `high`. */
  function addPost(x, z, radius, low, high) {
    const reachOut = radius + 0.7;
    const post = [x, z, radius, low, high];
    postCount += 1;
    for (let ix = Math.floor((x - reachOut) / POST_CELL); ix <= Math.floor((x + reachOut) / POST_CELL); ix += 1) {
      for (let iz = Math.floor((z - reachOut) / POST_CELL); iz <= Math.floor((z + reachOut) / POST_CELL); iz += 1) {
        const k = key(ix, 0, iz);
        const list = posts.get(k);
        if (list) list.push(post);
        else posts.set(k, [post]);
      }
    }
  }

  /** Whether a ball of `radius` at (x, y, z) touches an occupied voxel or a post. */
  function touches(x, y, z, radius) {
    const found = posts.get(key(Math.floor(x / POST_CELL), 0, Math.floor(z / POST_CELL)));
    if (found) {
      for (const [px, pz, pr, low, high] of found) {
        if (y > low - radius && y < high + radius && (x - px) ** 2 + (z - pz) ** 2 < (pr + radius) ** 2) return true;
      }
    }
    const fx = Math.floor(x * inverse);
    const fy = Math.floor(y * inverse);
    const fz = Math.floor(z * inverse);
    if (!coarse.has(key(Math.floor(fx / COARSE), Math.floor(fy / COARSE), Math.floor(fz / COARSE)))) return false;
    const x1 = Math.floor((x + radius) * inverse);
    const y1 = Math.floor((y + radius) * inverse);
    const z1 = Math.floor((z + radius) * inverse);
    const r2 = radius * radius;
    for (let ix = Math.floor((x - radius) * inverse); ix <= x1; ix += 1) {
      const dx = Math.max(ix * spec.cell - x, 0, x - (ix + 1) * spec.cell);
      for (let iy = Math.floor((y - radius) * inverse); iy <= y1; iy += 1) {
        const dy = Math.max(iy * spec.cell - y, 0, y - (iy + 1) * spec.cell);
        for (let iz = Math.floor((z - radius) * inverse); iz <= z1; iz += 1) {
          const dz = Math.max(iz * spec.cell - z, 0, z - (iz + 1) * spec.cell);
          if (dx * dx + dy * dy + dz * dz < r2 && (area.get(key(ix, iy, iz)) ?? 0) >= spec.area) return true;
        }
      }
    }
    return false;
  }

  /** The camera's world (cameraarm.js): how far a ball goes along `dir` from `from` before it touches the scenery (`length` if never). */
  function reach(from, dir, length, radius) {
    let clear = Math.min(spec.skip, length);
    let hit = -1;
    for (let along = clear + spec.step; ; along += spec.step) {
      const s = Math.min(along, length);
      if (touches(from[0] + dir[0] * s, from[1] + dir[1] * s, from[2] + dir[2] * s, radius)) {
        hit = s;
        break;
      }
      clear = s;
      if (s >= length) return length;
    }
    // Between the last clear sample and the one that touched: bisected.
    let high = hit;
    for (let pass = 0; pass < 5; pass += 1) {
      const middle = (clear + high) / 2;
      if (touches(from[0] + dir[0] * middle, from[1] + dir[1] * middle, from[2] + dir[2] * middle, radius)) high = middle;
      else clear = middle;
    }
    return clear;
  }

  return {
    addTriangle, addPost, touches, reach,
    get occupied() { return occupied; },
    get posts() { return postCount; },
  };
}

// ---- The scene ---------------------------------------------------------------

/**
 * Take the voxels of a place (a THREE.Group of scenery): its solid, opaque, static meshes, as they stand. Left out: floor and ground (a mesh
 * whose top is under `floorTop`, or wider than `skyWide`), what is drawn see-through or without depth (glows, smoke, water, the sky), what a
 * mesh's `userData.seeThrough === false` says is no wall (the places' own mark for halos, water, markers: it was the old fade's too), skinned
 * bodies, and the low stuff in instanced batches (grass, flowers). Returns { world, voxels, step(ms), done, meshes, triangles, ms }: `step`
 * does up to `ms` of the work (the whole of it by default), `world` is for the arm (nothing in the way until `done`).
 */
export function voxelsOfPlace(place, spec = OCCLUDERS) {
  const voxels = createVoxels(spec);
  const taking = { world: { reach: voxels.reach }, voxels, done: false, meshes: 0, triangles: 0, ms: 0 };
  place.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const one = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  const size = new THREE.Vector3();
  const point = new THREE.Vector3();

  // The meshes to take, found at once (cheap): { mesh } or { mesh, instanced }.
  const queue = [];
  place.traverse((mesh) => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || !mesh.geometry || !mesh.geometry.attributes.position || mesh.userData.seeThrough === false || mesh.visible === false) return;
    for (let above = mesh.parent; above && above !== place; above = above.parent) if (above.visible === false || above.userData.seeThrough === false) return;
    if ([].concat(mesh.material).some((material) => material.transparent || !material.depthWrite)) return;
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (mesh.isInstancedMesh) {
      if (geometry.boundingBox.max.y - geometry.boundingBox.min.y >= spec.instanceHigh) queue.push(mesh);
      return;
    }
    box.copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    if (box.isEmpty() || box.max.y < spec.floorTop || box.max.x - box.min.x > spec.skyWide || box.max.z - box.min.z > spec.skyWide) return;
    queue.push(mesh);
  });

  /** One mesh's triangles, as a generator that yields every `slice` triangles. */
  function* work(mesh) {
    if (mesh.isInstancedMesh) {
      const geometry = mesh.geometry;
      for (let copy = 0; copy < mesh.count; copy += 1) {
        mesh.getMatrixAt(copy, matrix);
        matrix.premultiply(mesh.matrixWorld);
        one.copy(geometry.boundingBox).applyMatrix4(matrix);
        one.getSize(size);
        if (one.max.y < spec.floorTop) continue;
        const radius = Math.min(spec.postMax, (spec.postShare * (size.x + size.z)) / 2);
        voxels.addPost((one.min.x + one.max.x) / 2, (one.min.z + one.max.z) / 2, radius, one.min.y, one.max.y);
      }
      return;
    }
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const index = geometry.index;
    // The vertices in the world, once.
    const world = new Float32Array(position.count * 3);
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      point.fromBufferAttribute(position, vertex).applyMatrix4(mesh.matrixWorld);
      world[vertex * 3] = point.x;
      world[vertex * 3 + 1] = point.y;
      world[vertex * 3 + 2] = point.z;
    }
    const count = index ? index.count : position.count;
    for (let n = 0; n + 2 < count; n += 3) {
      const a = (index ? index.getX(n) : n) * 3;
      const b = (index ? index.getX(n + 1) : n + 1) * 3;
      const c = (index ? index.getX(n + 2) : n + 2) * 3;
      taking.triangles += 1;
      // (A triangle wholly under `floorTop` is floor.)
      if (Math.max(world[a + 1], world[b + 1], world[c + 1]) < spec.floorTop) continue;
      voxels.addTriangle(world[a], world[a + 1], world[a + 2], world[b], world[b + 1], world[b + 2], world[c], world[c + 1], world[c + 2]);
      if (n % (spec.slice * 3) === 0 && n > 0) yield;
    }
  }

  const jobs = (function* all() {
    for (const mesh of queue) {
      if (taking.triangles > spec.triangles) break;
      taking.meshes += 1;
      yield* work(mesh);
    }
  })();

  taking.step = (ms = Infinity) => {
    if (taking.done) return true;
    const started = performance.now();
    do {
      if (jobs.next().done) {
        taking.done = true;
        break;
      }
    } while (performance.now() - started < ms);
    taking.ms += performance.now() - started;
    return taking.done;
  };
  return taking;
}
