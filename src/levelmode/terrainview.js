// Level mode: a stage's terrain drawn as plain grey boxes, from the same data the
// physics reads (so what is drawn is what is stood on). Stand-in art: the castle
// kit replaces it, still from the stage's data.
//
// createStageView(stage) builds one group per section and one per (gate or ladder, state);
// updateStageView(view, world) shows the ones in force: the active sections, and each
// mechanism in its present state. The group goes into the stage's place in the scene
// (render.js setPlace 'stage'); `view.group.parent` is that place while it is there.

import { createCastleView } from './kit.js';

const COLORS = { slab: 0x8a8f95, ramp: 0x9a9388, stairs: 0xa4a9ae, wall: 0x6c6f78, ceiling: 0x575a62 };
const ALTERNATE = 0xb9bec3;

/** A box of `length` (u) by `width` (v) from height `bottom` to `top`, centred at (x, z), turned by the solid's yaw. */
function solidBox(solid, u, length, bottom, top, color) {
  const geometry = new THREE.BoxGeometry(length, Math.max(0.02, top - bottom), solid.size[1]);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }));
  const yaw = solid.yaw ?? 0;
  // u along the solid's length: (cos yaw, -sin yaw) on the floor.
  mesh.position.set(solid.at[0] + Math.cos(yaw) * u, (top + bottom) / 2, solid.at[1] - Math.sin(yaw) * u);
  mesh.rotation.y = yaw;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A ramp: a wedge of the solid's footprint, its top rising from `from` to `to` along u. */
function solidWedge(solid, bottom, color) {
  const hu = solid.size[0] / 2;
  const hv = solid.size[1] / 2;
  const corners = [[-hu, -hv, solid.from], [hu, -hv, solid.to], [hu, hv, solid.to], [-hu, hv, solid.from]];
  const positions = [];
  const triangle = (a, b, c) => positions.push(...a, ...b, ...c);
  const top = corners.map(([u, v, y]) => [u, y, v]);
  const low = corners.map(([u, v]) => [u, bottom, v]);
  triangle(top[0], top[2], top[1]);
  triangle(top[0], top[3], top[2]);
  for (let side = 0; side < 4; side += 1) {
    const next = (side + 1) % 4;
    triangle(low[side], top[next], low[next]);
    triangle(low[side], top[side], top[next]);
  }
  triangle(low[0], low[1], low[2]);
  triangle(low[0], low[2], low[3]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, side: THREE.DoubleSide }));
  const yaw = solid.yaw ?? 0;
  mesh.position.set(solid.at[0], 0, solid.at[1]);
  mesh.rotation.y = yaw;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** The meshes of one solid. `floorY`: how far down a block with no bottom is drawn. */
function solidMeshes(solid, floorY) {
  const length = solid.size[0];
  const bottom = Number.isFinite(solid.bottom) ? solid.bottom : null;
  if (solid.kind === 'slab') return [solidBox(solid, 0, length, bottom ?? Math.min(floorY, solid.top - 1), solid.top, COLORS.slab)];
  if (solid.kind === 'wall') return [solidBox(solid, 0, length, solid.bottom, solid.top, COLORS.wall)];
  if (solid.kind === 'ceiling') return [solidBox(solid, 0, length, solid.bottom, solid.top ?? solid.bottom + 0.5, COLORS.ceiling)];
  if (solid.kind === 'ramp') return [solidWedge(solid, bottom ?? Math.min(floorY, Math.min(solid.from, solid.to) - 1), COLORS.ramp)];
  // Stairs: each tread a column to its top, in alternating tones so the steps read.
  const meshes = [];
  const depth = length / solid.steps;
  for (let step = 0; step < solid.steps; step += 1) {
    const top = solid.from + (step + 1) * solid.rise;
    meshes.push(solidBox(solid, -length / 2 + (step + 0.5) * depth, depth, bottom ?? Math.min(floorY, solid.from - 1), top, step % 2 ? COLORS.stairs : ALTERNATE));
  }
  return meshes;
}

function solidsGroup(solids, floorY) {
  const group = new THREE.Group();
  for (const solid of solids) group.add(...solidMeshes(solid, floorY));
  return group;
}

/** The drawing of a stage: { group, sections: { id: Group }, mechanisms: [{ id, state, section, group }] }. */
export function createStageView(stage) {
  // A stage with a landform of its own is drawn as a castle (kit.js); the others in plain boxes.
  if (stage.landform) return createCastleView(stage);
  const floorY = Number.isFinite(stage.sea) ? stage.sea : -4;
  const group = new THREE.Group();
  group.name = `stage:${stage.id}`;
  const sections = {};
  const mechanisms = [];
  for (const section of stage.sections) {
    sections[section.id] = solidsGroup(section.terrain ?? [], floorY);
    group.add(sections[section.id]);
    for (const mechanism of [...(section.gates ?? []), ...(section.ladders ?? [])]) {
      for (const [state, solids] of Object.entries(mechanism.states)) {
        const drawn = solidsGroup(solids, floorY);
        mechanisms.push({ id: mechanism.id, state, section: section.id, group: drawn });
        group.add(drawn);
      }
    }
  }
  return { stage, group, sections, mechanisms };
}

/** Show what is in force: the active sections, and each gate or ladder as it stands. */
export function updateStageView(view, world) {
  if (view.update) {
    view.update(world);
    return;
  }
  const run = world.stage;
  for (const [id, group] of Object.entries(view.sections)) group.visible = run.active.includes(id);
  for (const mechanism of view.mechanisms) mechanism.group.visible = run.active.includes(mechanism.section) && run.mechanisms[mechanism.id] === mechanism.state;
}

/** Put a stage's sea at its level, in the place that holds it (render.js buildStageSky). */
export function placeStageSea(place, stage) {
  const sea = place.getObjectByName('stage-sea');
  if (sea) sea.position.y = Number.isFinite(stage.sea) ? stage.sea : -30;
}

/** Let go of a view's geometry and materials. */
export function disposeStageView(view) {
  view.group.parent?.remove(view.group);
  if (view.dispose) {
    view.dispose();
    return;
  }
  view.group.traverse((object) => {
    object.geometry?.dispose();
    object.material?.dispose();
  });
}
