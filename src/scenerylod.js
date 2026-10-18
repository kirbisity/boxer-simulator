// Cheaper scenery, without changing what is seen near the fight. Browser only
// (the pure choices are exported for tests).
//
// A place is built as its author wrote it: hundreds of small meshes, and
// instanced scatters (grass, flowers, stones, trees) whose one bounding
// sphere takes in the whole place, so none of it is ever culled. This pass
// runs once a place is built (render.js setPlace) and swaps in a cheaper
// but identical-looking copy:
//   - Instanced scatters are cut into cells with a bounding sphere each, so
//     the camera culls the cells behind it (and the shadow camera those
//     outside its box); small things (tufts, flowers, stones) are also
//     thinned the farther the camera is from a cell, the instances having
//     been shuffled so that drawing fewer leaves an even sprinkle.
//   - Static meshes of one material in one piece of scenery (a plant's
//     blades, a post-and-rail fence, a stall's boards) become one mesh.
// The originals are kept, off the scene, so `setSceneryLod(false)` puts the
// place back exactly as built (a before-and-after in the same page).

/* global THREE */
import { mayBlock, SEE_THROUGH } from './seethrough.js';

export const SCENERY_LOD = {
  // m: the cell an instanced scatter is cut into. A fight and its camera
  // fill a few of these; the rest of a 60 m view is thinned or culled.
  cell: 12,
  // A cell is made at least this big (instances) by merging neighbours: below it the extra draw call costs more than the culling saves.
  cellMinInstances: 160,
  // m: a scatter whose copies are mostly this small (a tuft, a clump of tall grass, a flower, a stone, a leaf) may be thinned; trees, posts and walls never are.
  thinRadius: 2.5,
  // m from the camera to a cell's nearest edge: full density up to `thinFrom`, falling to `thinFloor` of it at `thinTo` and beyond.
  // Grass and stones close to the camera, where the fight is, are exactly as built; far off a tuft is a few pixels and a sparser sprinkle reads the same.
  thinFrom: 16,
  thinTo: 48,
  thinFloor: 0.35,
  // m: a group of meshes is merged only when it is no wider than a see-through piece (seethrough.js pieceMax), so it fades as one thing as before.
  mergeWidth: SEE_THROUGH.pieceMax,
  // m: loose meshes (not in a group) are merged only within one cell this wide, and only the thin or low ones that see-through never fades.
  looseCell: 10,
  // A merged mesh may not grow past this many vertices (a 16-bit index would do, but a big one gains little).
  mergeMaxVertices: 60000,
  // s apart: the two times the place's own clock (rain, a ship at anchor) is read to find out which meshes it moves; those are left alone.
  probeTimes: [0, 1.7, 4.1],
};

// ---- the pure choices ----------------------------------------------------------

/** The share (0..1) of a scatter's copies drawn in a cell `distance` m from the camera. */
export function thinShare(distance, config = SCENERY_LOD) {
  if (distance <= config.thinFrom) return 1;
  if (distance >= config.thinTo) return config.thinFloor;
  const along = (distance - config.thinFrom) / (config.thinTo - config.thinFrom);
  return 1 - along * (1 - config.thinFloor);
}

/**
 * Cell edge (m) for cutting `points` ([x, z]) so that, on average, each
 * occupied cell holds at least `minimum`: `cell`, doubled until it does.
 */
export function cellEdge(points, cell, minimum) {
  let edge = cell;
  for (let tries = 0; tries < 6; tries += 1) {
    const occupied = new Set(points.map(([x, z]) => `${Math.floor(x / edge)},${Math.floor(z / edge)}`));
    if (points.length / occupied.size >= minimum) return edge;
    edge *= 2;
  }
  return edge;
}

/** Indices of `points` grouped by cell of edge `edge`: arrays of indices, in order of first appearance. */
export function clusterByCell(points, edge) {
  const cells = new Map();
  points.forEach(([x, z], index) => {
    const key = `${Math.floor(x / edge)},${Math.floor(z / edge)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(index);
  });
  return [...cells.values()];
}

/** A seeded shuffle (Fisher-Yates), so a place is thinned the same way every time. */
export function shuffled(items, seed = 7) {
  const out = items.slice();
  let state = seed >>> 0;
  for (let index = out.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const other = Math.floor((state / 4294967296) * (index + 1));
    [out[index], out[other]] = [out[other], out[index]];
  }
  return out;
}

// ---- state ---------------------------------------------------------------------

let enabled = true;
/** place group -> { done: WeakSet, undo: [() => void], thinned: [{ mesh, full, centre, radius }], moving: Set | null } */
const states = new WeakMap();

export const sceneryLodOn = () => enabled;

/** Put every place back as built (on = false) or swap the cheaper copies in again (on = true). */
export function setSceneryLod(view, on) {
  enabled = !!on;
  for (const group of Object.values(view.places)) if (group) undoPlace(group);
  if (enabled && view.places?.[view.place]) prepareScenery(view);
  return enabled;
}

function undoPlace(group) {
  const state = states.get(group);
  if (!state) return;
  for (const undo of state.undo.reverse()) undo();
  states.delete(group);
}

/** What a place's swaps came to now (tests, the profiler): { merged, chunked, thinned }. */
export function sceneryLodStats(view) {
  const state = states.get(view.places?.[view.place]);
  return state ? { ...state.counts, thinned: state.thinned.length } : null;
}

// ---- the pass ------------------------------------------------------------------

const EMPTY_KEYS = (object) => Object.keys(object.userData).length === 0;
const hasOwnHook = (object) => Object.prototype.hasOwnProperty.call(object, 'onBeforeRender') || Object.prototype.hasOwnProperty.call(object, 'onAfterRender');

/** Userdata that other code reads off a mesh: such a mesh is left as built. */
const PINNED_KEYS = ['scenery', 'sceneryVariant', 'seeThrough', 'tick', 'heightAt', 'fogHalo', 'paintedSky', 'shared', 'battleFx'];

/**
 * Cheapen the place now shown (setPlace, reapplyPlace): everything visible in it
 * that has not been swapped yet. Cheap to call again.
 */
export function prepareScenery(view) {
  const place = view.places?.[view.place];
  if (!enabled || !place) return;
  let state = states.get(place);
  if (!state) {
    state = { done: new WeakSet(), undo: [], thinned: [], counts: { merged: 0, chunked: 0 }, moving: null };
    states.set(place, state);
    state.moving = movingObjects(place);
  }
  place.updateMatrixWorld(true);
  chunkInstanced(place, state);
  mergeStatic(place, state);
}

/** Objects the place's own clock (`userData.tick`) moves: found by reading it at a few times and seeing whose matrix changed. */
function movingObjects(place) {
  const moving = new Set();
  const ticks = [];
  place.traverse((object) => {
    if (object.userData.tick) ticks.push(object.userData.tick);
  });
  if (!ticks.length) return moving;
  const everything = [];
  place.traverse((object) => everything.push(object));
  const snapshots = SCENERY_LOD.probeTimes.map((time) => {
    for (const tick of ticks) tick(time);
    place.updateMatrixWorld(true);
    return everything.map((object) => object.matrixWorld.elements.slice().concat(object.visible ? 1 : 0));
  });
  everything.forEach((object, index) => {
    if (snapshots.some((snapshot) => snapshot[index].some((value, at) => value !== snapshots[0][index][at]))) moving.add(object);
  });
  // The place goes back to where the first read left it; the next frame's tick moves it on.
  return moving;
}

/** Visit what is visible below `object`, leaving moving things and whatever a visitor says is taken. */
function walk(object, place, state, visitor) {
  for (const child of object.children.slice()) {
    if (!child.visible || state.done.has(child) || state.moving.has(child)) continue;
    if (visitor(child) !== false) walk(child, place, state, visitor);
  }
}

// ---- instanced scatters ---------------------------------------------------------

const shapeRadii = new WeakMap();
/** The radius of one copy's shape. Not `boundingSphere`: a scatter that was cut by hand sets that to take in all its copies. */
function shapeRadius(geometry) {
  if (!shapeRadii.has(geometry)) {
    const bare = new THREE.BufferGeometry();
    bare.setAttribute('position', geometry.attributes.position);
    bare.computeBoundingSphere();
    shapeRadii.set(geometry, bare.boundingSphere.radius);
  }
  return shapeRadii.get(geometry);
}

function chunkInstanced(place, state) {
  const config = SCENERY_LOD;
  const found = [];
  walk(place, place, state, (object) => {
    if (object.isInstancedMesh && !state.done.has(object)) found.push(object);
  });
  for (const mesh of found) {
    state.done.add(mesh);
    if (!chunkable(mesh)) continue;
    const parent = mesh.parent;
    const geometry = mesh.geometry;
    const reach = shapeRadius(geometry);
    const elements = mesh.instanceMatrix.array;
    const matrix = new THREE.Matrix4();
    const points = [];
    const sizes = [];
    for (let index = 0; index < mesh.count; index += 1) {
      matrix.fromArray(elements, index * 16);
      points.push([matrix.elements[12], matrix.elements[14]]);
      sizes.push(matrix.getMaxScaleOnAxis() * reach);
    }
    if (!points.length) continue;
    const small = [...sizes].sort((a, b) => a - b)[sizes.length >> 1] <= config.thinRadius && !mesh.userData.treeReach && !mesh.castShadow;
    const cells = clusterByCell(points, cellEdge(points, config.cell, config.cellMinInstances));
    const group = new THREE.Group();
    group.name = 'scenery-lod-chunks';
    // The cells sit in the original mesh's own space; the group carries its transform, the chunks none.
    mesh.updateMatrix();
    mesh.matrix.decompose(group.position, group.quaternion, group.scale);
    for (const cell of cells) {
      const order = small ? shuffled(cell, cell.length + 11) : cell;
      group.add(chunkOf(mesh, order, points, sizes, small, state));
    }
    group.userData.lodChunks = true;
    state.done.add(group);
    parent.add(group);
    parent.remove(mesh);
    state.undo.push(() => {
      parent.remove(group);
      parent.add(mesh);
      for (const chunk of group.children) chunk.geometry.dispose?.();
    });
    state.counts.chunked += 1;
  }
}

/** Whether a mesh is plain enough to be cut: its own instance data only, no per-instance geometry attributes, nothing else reading it. */
function chunkable(mesh) {
  if (mesh.userData.seeThrough === true || PINNED_KEYS.some((key) => mesh.userData[key] !== undefined && key !== 'seeThrough')) return false;
  if (Array.isArray(mesh.material)) return false;
  if (Object.values(mesh.geometry.attributes).some((attribute) => attribute.isInstancedBufferAttribute)) return false;
  return mesh.count > 0;
}

/** One cell of an instanced mesh as a mesh of its own, with the right bounding sphere. */
function chunkOf(mesh, order, points, sizes, small, state) {
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) geometry.setAttribute(name, attribute);
  geometry.setIndex(mesh.geometry.index);
  const chunk = new THREE.InstancedMesh(geometry, mesh.material, order.length);
  const elements = mesh.instanceMatrix.array;
  const colours = mesh.instanceColor?.array;
  if (colours) chunk.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(order.length * 3), 3);
  const centre = new THREE.Vector3();
  order.forEach((from, to) => {
    chunk.instanceMatrix.array.set(elements.subarray(from * 16, from * 16 + 16), to * 16);
    if (colours) chunk.instanceColor.array.set(colours.subarray(from * 3, from * 3 + 3), to * 3);
    centre.x += points[from][0] / order.length;
    centre.z += points[from][1] / order.length;
    centre.y += elements[from * 16 + 13] / order.length;
  });
  let radius = 0;
  const at = new THREE.Vector3();
  order.forEach((from) => {
    at.set(elements[from * 16 + 12], elements[from * 16 + 13], elements[from * 16 + 14]);
    radius = Math.max(radius, at.distanceTo(centre) + sizes[from]);
  });
  geometry.boundingSphere = new THREE.Sphere(centre.clone(), radius);
  chunk.instanceMatrix.needsUpdate = true;
  if (chunk.instanceColor) chunk.instanceColor.needsUpdate = true;
  chunk.castShadow = mesh.castShadow;
  chunk.receiveShadow = mesh.receiveShadow;
  chunk.renderOrder = mesh.renderOrder;
  chunk.frustumCulled = true;
  chunk.name = mesh.name;
  if (hasOwnHook(mesh)) {
    chunk.onBeforeRender = mesh.onBeforeRender;
    chunk.onAfterRender = mesh.onAfterRender;
  }
  chunk.userData = { ...mesh.userData };
  // Weather leaves the farthest trees out by drawing fewer of a near-to-far list: each cell keeps its own share of it.
  if (mesh.userData.treeReach) chunk.userData.treeReach = order.map((from) => mesh.userData.treeReach[from]);
  chunk.userData.lodChunk = true;
  state.done.add(chunk);
  if (small) state.thinned.push({ mesh: chunk, full: order.length, centre: null, radius, local: centre.clone(), parent: mesh });
  return chunk;
}

/** Once a frame, after the camera is placed: thin the far cells of the small scatters. */
let lodScratch = null;
export function updateSceneryLod(view) {
  if (!enabled) return;
  const place = view.places?.[view.place];
  const state = place && states.get(place);
  if (!state || !state.thinned.length) return;
  lodScratch ??= { camera: new THREE.Vector3(), world: new THREE.Vector3(), identity: new THREE.Matrix4() };
  const { camera, world } = lodScratch;
  camera.copy(view.camera.position);
  for (const entry of state.thinned) {
    const { mesh } = entry;
    if (!entry.centre) {
      // The chunk's centre in the world, once: the scenery stands still.
      mesh.parent?.updateWorldMatrix(true, false);
      entry.centre = entry.local.clone().applyMatrix4(mesh.parent?.matrixWorld ?? lodScratch.identity);
      entry.worldRadius = entry.radius * (mesh.parent?.matrixWorld.getMaxScaleOnAxis() ?? 1);
    }
    world.copy(entry.centre);
    const distance = Math.max(0, world.distanceTo(camera) - entry.worldRadius);
    const count = Math.max(1, Math.ceil(entry.full * thinShare(distance)));
    if (mesh.count !== count) mesh.count = count;
  }
}

// ---- static meshes ----------------------------------------------------------------

/** Meshes of one material in one piece of scenery become one mesh. */
function mergeStatic(place, state) {
  const config = SCENERY_LOD;
  const box = new THREE.Box3();
  const widthOf = (object) => {
    box.makeEmpty();
    object.traverse((mesh) => {
      if (mesh.isMesh && !mesh.isInstancedMesh && mesh.geometry.attributes.position && mesh.visible) box.expandByObject(mesh);
    });
    return box.isEmpty() ? 0 : Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  };
  // Units: the groups under the place that are one piece (narrow enough), and meshes loose in wide groups.
  const units = [];
  const loose = [];
  const sort = (parent) => {
    for (const child of parent.children.slice()) {
      if (!child.visible || state.moving.has(child) || child.userData.lodChunks) continue;
      if (child.isMesh) {
        loose.push(child);
      } else if (child.children.length && !child.isLight && !child.isCamera) {
        if (child.userData.sceneryVariant || child.userData.tick) sort(child);
        else if (widthOf(child) <= config.mergeWidth && !hasMoving(child, state.moving)) units.push(child);
        else sort(child);
      }
    }
  };
  sort(place);
  for (const unit of units) mergeIn(unit, collect(unit, state), state, true);
  // Loose meshes: in cells, and only those see-through would never fade.
  const quiet = loose.filter((mesh) => mergeable(mesh, state) && !blocks(mesh));
  const points = quiet.map((mesh) => {
    const centre = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
    return [centre.x, centre.z];
  });
  for (const cell of clusterByCell(points, config.looseCell)) {
    const members = cell.map((index) => quiet[index]);
    // Their parent is what they are merged under: the group they hang from.
    const byParent = new Map();
    for (const mesh of members) byParent.set(mesh.parent, [...(byParent.get(mesh.parent) ?? []), mesh]);
    for (const [parent, meshes] of byParent) mergeIn(parent, meshes, state, false);
  }
}

function hasMoving(object, moving) {
  if (!moving.size) return false;
  let any = false;
  object.traverse((child) => {
    if (moving.has(child)) any = true;
  });
  return any;
}

/** Whether see-through could ever fade this mesh (a thick, tall-enough scenery piece). */
function blocks(mesh) {
  const box = new THREE.Box3().setFromObject(mesh);
  return mayBlock(box.min.toArray(), box.max.toArray());
}

/** Whether a mesh can be merged with others: a plain, solid, static mesh of one material that nothing else reads. */
function mergeable(mesh, state) {
  if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh || state.done.has(mesh)) return false;
  if (!EMPTY_KEYS(mesh) || hasOwnHook(mesh) || mesh.children.length || mesh.layers.mask !== 1) return false;
  if (!mesh.visible || mesh.customDepthMaterial || mesh.customDistanceMaterial) return false;
  const material = mesh.material;
  if (Array.isArray(material) || material.transparent || !material.depthWrite || material.userData?.reflects) return false;
  const geometry = mesh.geometry;
  if (geometry.morphAttributes?.position || !geometry.attributes.position) return false;
  if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return false;
  for (const attribute of Object.values(geometry.attributes)) {
    if (attribute.isInterleavedBufferAttribute || !(attribute.array instanceof Float32Array)) return false;
  }
  mesh.updateMatrixWorld();
  return mesh.matrixWorld.determinant() > 0;
}

/** The mergeable meshes below a unit, with a visible, still chain up to it. */
function collect(unit, state) {
  const meshes = [];
  const visit = (object) => {
    for (const child of object.children) {
      if (!child.visible || state.moving.has(child)) continue;
      if (child.isMesh) {
        if (mergeable(child, state)) meshes.push(child);
      } else {
        visit(child);
      }
    }
  };
  visit(unit);
  return meshes;
}

const signatureOf = (mesh) => {
  const geometry = mesh.geometry;
  const attributes = Object.keys(geometry.attributes).sort().map((name) => `${name}${geometry.attributes[name].itemSize}${geometry.attributes[name].normalized ? 'n' : ''}`);
  return [mesh.material.uuid, mesh.castShadow, mesh.receiveShadow, mesh.renderOrder, !!geometry.index, ...attributes].join('|');
};

/** Merge `meshes` (all below `unit`) by material and flags into meshes added to `unit`. */
function mergeIn(unit, meshes, state, sealed) {
  const config = SCENERY_LOD;
  const groups = new Map();
  for (const mesh of meshes) {
    const key = signatureOf(mesh);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mesh);
  }
  unit.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(unit.matrixWorld).invert();
  for (const members of groups.values()) {
    let batch = [];
    let vertices = 0;
    const flush = () => {
      if (batch.length >= 2) mergeBatch(unit, batch, inverse, state, sealed);
      batch = [];
      vertices = 0;
    };
    for (const mesh of members) {
      const count = mesh.geometry.attributes.position.count;
      if (vertices + count > config.mergeMaxVertices) flush();
      batch.push(mesh);
      vertices += count;
    }
    flush();
  }
}

function mergeBatch(unit, batch, inverse, state, sealed) {
  const first = batch[0];
  const names = Object.keys(first.geometry.attributes);
  const indexed = !!first.geometry.index;
  const parts = batch.map((mesh) => {
    const geometry = mesh.geometry.clone();
    mesh.updateMatrixWorld();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    return geometry;
  });
  const vertexTotal = parts.reduce((sum, part) => sum + part.attributes.position.count, 0);
  const merged = new THREE.BufferGeometry();
  for (const name of names) {
    const size = first.geometry.attributes[name].itemSize;
    const array = new Float32Array(vertexTotal * size);
    let at = 0;
    for (const part of parts) {
      array.set(part.attributes[name].array, at);
      at += part.attributes[name].array.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(array, size, first.geometry.attributes[name].normalized));
  }
  if (indexed) {
    const total = parts.reduce((sum, part) => sum + part.index.count, 0);
    const index = vertexTotal > 65535 ? new Uint32Array(total) : new Uint16Array(total);
    let at = 0;
    let offset = 0;
    for (const part of parts) {
      for (let item = 0; item < part.index.count; item += 1) index[at + item] = part.index.array[item] + offset;
      at += part.index.count;
      offset += part.attributes.position.count;
    }
    merged.setIndex(new THREE.BufferAttribute(index, 1));
  }
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  const mesh = new THREE.Mesh(merged, first.material);
  mesh.name = 'scenery-lod-merged';
  mesh.castShadow = first.castShadow;
  mesh.receiveShadow = first.receiveShadow;
  mesh.renderOrder = first.renderOrder;
  // Loose, thin things see-through never faded stay unfaded merged; the parts of a piece fade with it as before.
  if (!sealed) mesh.userData.seeThrough = false;
  const removed = batch.map((original) => ({ original, parent: original.parent }));
  for (const { original, parent } of removed) parent.remove(original);
  unit.add(mesh);
  state.done.add(mesh);
  for (const original of batch) state.done.add(original);
  state.undo.push(() => {
    unit.remove(mesh);
    merged.dispose();
    for (const { original, parent } of removed) parent.add(original);
  });
  state.counts.merged += batch.length - 1;
}
