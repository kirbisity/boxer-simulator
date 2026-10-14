// Seeing through the scenery. When a wall, a house, a tree or the stands
// come between the camera and the men it is looking at, they are faded
// (drawn see-through) until they no longer stand in the way, rather than
// the picture showing a wall. A few times a second, lines from the camera
// to points on each man watched (head, chest, hips, feet) are tested
// against the place's scenery: first against each piece's box, then
// against its triangles. A piece in the way fades out over a moment and
// back once it has been clear for a while, so nothing flickers as a man
// steps along behind a post.
//
// A piece is the largest group under the place that is still a single
// thing (a house, a tree, a gate: no wider than `pieceMax`), so a house
// fades whole, not wall by wall; anything bigger (the Colosseum's ring of
// stands) fades by its own meshes. The floor, the sky and what is drawn
// see-through already are never faded. A faded mesh draws with its own
// copy of its material (made the first time, kept), so the other meshes
// that share the material are left as they are, and it gets its own
// material back once it is solid again.
//
// The geometry here is plain arrays and runs in Node; only the scene part
// uses THREE (a global in the page).

/* global THREE */

export const SEE_THROUGH = {
  // s between tests of what is in the way (the fade itself runs every frame).
  every: 0.12,
  // Opacity of a piece in the way.
  faded: 0.22,
  // s to fade out, and back in.
  fadeOut: 0.18,
  fadeIn: 0.35,
  // s a piece stays faded after it was last in the way (a man passing a post does not make it blink).
  linger: 0.5,
  // m: what lies this close to the point watched is beside him, not in front of him.
  besideMan: 0.35,
  // m: a piece is a single thing (faded whole) up to this wide; a bigger group fades by its meshes.
  pieceMax: 14,
  // m: a mesh this low is floor (or a kerb, a rug), never in the way.
  floorTop: 0.25,
  // m: a mesh wider than this is ground or sky, never in the way.
  skyWide: 80,
  // m: a piece whose box comes this near the camera fades, in the way of the man or not.
  byCamera: 0.5,
  // m: a mesh thinner than this both ways (a rope, a pole, a bar) hides too little to fade.
  thick: 0.3,
};

/**
 * Where along the segment from `from` to `to` it first meets the box
 * (`min`, `max`, grown by `margin` m), as a share of the way (0..1); null if
 * it misses. Slab test.
 */
export function segmentBoxEntry(from, to, min, max, margin = 0) {
  let enter = 0;
  let leave = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const start = from[axis];
    const along = to[axis] - start;
    const low = min[axis] - margin;
    const high = max[axis] + margin;
    if (Math.abs(along) < 1e-9) {
      if (start < low || start > high) return null;
      continue;
    }
    let near = (low - start) / along;
    let far = (high - start) / along;
    if (near > far) [near, far] = [far, near];
    enter = Math.max(enter, near);
    leave = Math.min(leave, far);
    if (enter > leave) return null;
  }
  return enter;
}

/**
 * Whether a mesh's box is scenery that may stand in the way: not floor, not
 * ground or sky, and not so thin (a rope, a pole, a bar) that it hides
 * little: at least two of its sides `thick` m or more.
 */
export function mayBlock(min, max, spec = SEE_THROUGH) {
  if (!isScenery(min, max, spec)) return false;
  return [0, 1, 2].filter((axis) => max[axis] - min[axis] >= spec.thick).length >= 2;
}

/** Whether a mesh's box is scenery at all (not the floor, the ground or the sky). */
export function isScenery(min, max, spec = SEE_THROUGH) {
  return max[1] >= spec.floorTop && max[0] - min[0] <= spec.skyWide && max[2] - min[2] <= spec.skyWide;
}

/**
 * One frame of a piece's fade. `fade` { opacity, until } (until: the clock
 * time it may come back); `blocking`: it was found in the way at this
 * test (undefined between tests); returns the new opacity.
 */
export function fadeStep(fade, blocking, clock, dt, spec = SEE_THROUGH) {
  if (blocking) fade.until = clock + spec.linger;
  const goal = clock < (fade.until ?? -Infinity) ? spec.faded : 1;
  const seconds = goal < fade.opacity ? spec.fadeOut : spec.fadeIn;
  const step = ((1 - spec.faded) * dt) / seconds;
  fade.opacity = goal < fade.opacity ? Math.max(goal, fade.opacity - step) : Math.min(goal, fade.opacity + step);
  return fade.opacity;
}

// ---- The scene ---------------------------------------------------------------

/** A mesh's box in the world, over all its copies if it is instanced (three's own box ignores them). */
function meshBox(mesh) {
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = new THREE.Box3();
  if (!mesh.isInstancedMesh) return box.copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
  const matrix = new THREE.Matrix4();
  const one = new THREE.Box3();
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, matrix);
    box.union(one.copy(geometry.boundingBox).applyMatrix4(matrix.premultiply(mesh.matrixWorld)));
  }
  return box;
}

/** The pieces of a place that may stand in the way: { object, meshes, min, max }. Built once per place. */
function piecesOf(place, spec) {
  place.updateMatrixWorld(true);
  const boxes = new Map();
  place.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry || mesh.userData.seeThrough === false) return;
    const materials = [].concat(mesh.material);
    // What is drawn see-through already (glows, smoke, the sky) is left alone.
    if (materials.some((material) => material.transparent || !material.depthWrite)) return;
    const box = meshBox(mesh);
    if (box.isEmpty() || !isScenery(box.min.toArray(), box.max.toArray(), spec)) return;
    boxes.set(mesh, box);
  });
  // How wide a group is, over the meshes in it that may block.
  const widths = new Map();
  const wide = (group) => {
    if (!widths.has(group)) {
      const box = new THREE.Box3();
      group.traverse((mesh) => {
        if (boxes.has(mesh)) box.union(boxes.get(mesh));
      });
      widths.set(group, box.isEmpty() ? Infinity : Math.max(box.max.x - box.min.x, box.max.z - box.min.z));
    }
    return widths.get(group);
  };
  const byObject = new Map();
  for (const mesh of boxes.keys()) {
    // The piece: the highest group above it that is still one thing.
    let object = mesh;
    for (let above = mesh.parent; above && above !== place; above = above.parent) {
      if (wide(above) <= spec.pieceMax) object = above;
    }
    if (!byObject.has(object)) byObject.set(object, []);
    byObject.get(object).push(mesh);
  }
  const pieces = [];
  for (const [object, meshes] of byObject) {
    // A thin thing (a post, a rail) fades with the stall it belongs to, but alone is never in the way.
    if (!meshes.some((mesh) => mayBlock(boxes.get(mesh).min.toArray(), boxes.get(mesh).max.toArray(), spec))) continue;
    const bounds = new THREE.Box3();
    for (const mesh of meshes) bounds.union(boxes.get(mesh));
    const single = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) <= spec.pieceMax;
    pieces.push({ object, meshes, single, min: bounds.min.toArray(), max: bounds.max.toArray(), fade: { opacity: 1, until: -Infinity }, faded: false });
  }
  return pieces;
}

/**
 * See-through scenery for a view (render.js createScene). `update(view,
 * points, dt)` once a frame, after the camera is placed: `points` are the
 * [x, y, z] the camera must see (empty: nothing is faded).
 */
export function createSeeThrough(spec = SEE_THROUGH) {
  const byPlace = new Map();
  const raycaster = new THREE.Raycaster();
  const from = new THREE.Vector3();
  const towards = new THREE.Vector3();
  const hits = [];
  let clock = 0;
  let nextTest = 0;
  let active = [];
  let lastPlace = null;

  /** Draw a piece at `opacity`: its meshes on their own copies of their materials, or back on their own. */
  function show(piece, opacity) {
    const solid = opacity >= 0.999;
    if (solid && !piece.faded) return;
    for (const mesh of piece.meshes) {
      const own = mesh.userData.seeThroughOwn ?? (mesh.userData.seeThroughOwn = mesh.material);
      if (solid) {
        mesh.material = own;
        continue;
      }
      if (!mesh.userData.seeThroughCopy) {
        const copy = (material) => {
          const faded = material.clone();
          // A clone drops these; without them the copy would draw (and compile) as another shader.
          faded.onBeforeCompile = material.onBeforeCompile;
          faded.customProgramCacheKey = material.customProgramCacheKey;
          faded.transparent = true;
          faded.depthWrite = false;
          faded.userData = { ...material.userData, seeThroughOpacity: material.opacity };
          return faded;
        };
        mesh.userData.seeThroughCopy = Array.isArray(own) ? own.map(copy) : copy(own);
      }
      const faded = mesh.userData.seeThroughCopy;
      for (const material of [].concat(faded)) material.opacity = material.userData.seeThroughOpacity * opacity;
      mesh.material = faded;
    }
    piece.faded = !solid;
  }

  /** Every piece solid again (a design sheet, another place). */
  function restore(pieces) {
    for (const piece of pieces ?? []) {
      piece.fade.opacity = 1;
      piece.fade.until = -Infinity;
      show(piece, 1);
    }
  }

  /** Which pieces lie between the camera and any of the points. */
  function blockers(pieces, camera, points) {
    const found = new Set();
    from.copy(camera.position);
    const eye = from.toArray();
    for (const target of points) {
      const length = Math.hypot(target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]);
      const reach = length - spec.besideMan;
      if (reach <= 0) continue;
      const end = [eye[0] + ((target[0] - eye[0]) * reach) / length, eye[1] + ((target[1] - eye[1]) * reach) / length, eye[2] + ((target[2] - eye[2]) * reach) / length];
      towards.set(target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]).divideScalar(length);
      raycaster.set(from, towards);
      raycaster.near = 0;
      raycaster.far = reach;
      for (const piece of pieces) {
        if (found.has(piece)) continue;
        // Right by the camera (it stands in a stall, under the eaves), it fills the picture whether or not it covers the man.
        // (Only a single thing: the camera stands inside the box of the Colosseum's ring of stands all the time.)
        if (piece.single && segmentBoxEntry(eye, eye, piece.min, piece.max, spec.byCamera) !== null) {
          found.add(piece);
          continue;
        }
        if (segmentBoxEntry(eye, end, piece.min, piece.max) === null) continue;
        for (const mesh of piece.meshes) {
          hits.length = 0;
          // The mesh's own material decides which faces it has (a wall drawn from inside only is not in the way from outside).
          const drawn = mesh.material;
          mesh.material = mesh.userData.seeThroughOwn ?? drawn;
          mesh.raycast(raycaster, hits);
          mesh.material = drawn;
          if (hits.length) {
            found.add(piece);
            break;
          }
        }
      }
    }
    return found;
  }

  function update(view, points, dt) {
    if (!api.enabled) points = [];
    const place = view.places?.[view.place] ?? null;
    if (place !== lastPlace) {
      restore(byPlace.get(lastPlace));
      lastPlace = place;
    }
    if (!place) return;
    if (!byPlace.has(place)) byPlace.set(place, piecesOf(place, spec));
    const pieces = byPlace.get(place);
    if (!points.length) {
      if (active.length) restore(pieces);
      active = [];
      return;
    }
    clock += dt;
    let found = null;
    if (clock >= nextTest) {
      nextTest = clock + spec.every;
      view.camera.updateMatrixWorld();
      found = blockers(pieces, view.camera, points);
    }
    // Only pieces found in the way, or still fading, need a step.
    const stepping = new Set(active);
    if (found) for (const piece of found) stepping.add(piece);
    active = [];
    for (const piece of stepping) {
      const opacity = fadeStep(piece.fade, found ? found.has(piece) : undefined, clock, dt, spec);
      show(piece, opacity);
      if (opacity < 1) active.push(piece);
    }
  }

  /** Test now, at the next update (a new camera, a test hook). */
  const refresh = () => {
    nextTest = clock;
  };

  /** What is faded now, for tests: [{ name, opacity }]. */
  const faded = () => active.map((piece) => ({ name: piece.object.name || piece.object.type, opacity: piece.fade.opacity, box: [piece.min, piece.max] }));

  // enabled: false draws every piece solid (a before-and-after, a test).
  const api = { update, refresh, faded, enabled: true };
  return api;
}
