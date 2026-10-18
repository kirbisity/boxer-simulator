// A crowd fighter drawn cheaply. Everything he wears (head, hands, boots,
// helmet, cloth) is baked into his skinned body at the bind pose, each piece
// riding one bone, so he is drawn as one body and one steel mesh (and their
// ink) instead of sixty meshes. Fighters who look alike share one baked
// body (a template): its vertices are built once, and each fighter's own
// build is met by stretching the template's bones to his lengths.

import { BONE, BONES, frameMatrix } from './rig.js';

export const CROWD_VIEW = {
  // Builds this close (cm of height, BMI points) share a template: the bones
  // stretch to each man's lengths, so the difference shows only in girth.
  heightStep: 6,
  bmiStep: 3,
  // A material this metallic is steel, drawn with the steel.
  steelMetalness: 0.3,
  // Only pieces this big (triangles), seen from one side, keep their ink: a
  // small or two-sided piece's outline shows through what lies over it.
  outlineTriangles: 600,
  // Crowd fighters further than this (m) from the camera are drawn without ink.
  inkDistance: 16,
  // Copies an instanced batch starts with room for (it doubles when full).
  batchCapacity: 64,
  // Beyond this (m) a man is drawn with his far body, a fifth of the
  // triangles: at 12 m he is a hundred pixels tall and the lost detail is
  // finer than that. Kept far until 1.5 m inside it (`lodMargin`), so a man
  // standing on the line does not flicker between the two.
  lodDistance: 12,
  lodMargin: 1.5,
  // A man down or out is seen as a shape on the ground and rarely looked at:
  // his far body is used from this near.
  fallenLodDistance: 6,
  // Men beyond this (m) from the camera cast no shadow (one mesh drawn twice
  // for a smudge on the ground); nor do men outside the shadow camera's box.
  shadowDistance: 20,
  fallenShadowDistance: 7,
  // Every man within this of the player (m) is drawn in full, with his
  // shadow, whatever the distance: the men he is fighting (see protectedMen).
  protectRadius: 3,
  // A man is drawn if a sphere this big (m) round his pelvis meets the
  // camera's view: it covers his longest weapon held out (a lance, 3.5 m) and
  // the length his shadow is thrown, so he does not blink out as he leaves
  // the screen with his spear (or his shadow) still in it.
  cullRadius: 4.5,
  // The far body is the near one with its vertices merged in cells this big
  // (m): 10 cm is a few pixels at 12 m, and leaves a man of about three
  // thousand triangles (a fifth of the near body's) whose limbs still bend
  // at the joints.
  farCell: 0.1,
  // Vertices only merge if their colours are within this step of each other
  // (0..1 per channel), so a belt, a sleeve and a face keep their own colours.
  farColorStep: 0.12,
  // 6: only vertices facing the same way (to the nearest of the six axes) merge,
  // so a cloth baked twice (front and back) or a thin blade does not fold
  // into one flat sheet; 1: any facing (half the vertices, but black patches
  // on a helmet's brim). Bare skin, a closed surface, merges at any facing.
  farFacings: 6,
  // Far, steel keeps its own mesh and its shine (a draw call a man more).
  farSteelApart: true,
  // The head's cells are this fraction of the others: a helmet or a face is
  // what tells one man from another, in a few hundred triangles.
  farHeadCell: 0.6,
};

/**
 * The template a crowd fighter shares: everything that changes how he is
 * drawn, his build rounded to the template steps.
 */
export function crowdKey(fighter) {
  const inputs = fighter.body.inputs;
  const { name, heightCm, age, exercise, calories, stats, frame, style, ...look } = inputs;
  const height = Math.round(heightCm / CROWD_VIEW.heightStep);
  const bmi = Math.round(fighter.body.composition.bmi / CROWD_VIEW.bmiStep);
  return JSON.stringify([fighter.corner, height, bmi, frame, look]);
}

/**
 * Bake visible meshes into skinned vertices. `pieces` are {root, bone}: each
 * root already placed at the bind pose. Ink outlines, skinned meshes,
 * textured and see-through pieces are left alone (returned as `kept`).
 * @returns {{ positions, normals, colors, skinIndex, body: number[], steel: number[], outlined: { body, steel }, baked: Mesh[] }}
 */
export function bakePieces(pieces) {
  const out = { positions: [], normals: [], colors: [], skinIndex: [], body: [], steel: [], outlined: { body: [], steel: [] }, baked: [] };
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const color = new THREE.Color();
  for (const { root, bone } of pieces) {
    root.updateMatrixWorld(true);
    root.traverseVisible((mesh) => {
      if (!bakeable(mesh)) return;
      const material = mesh.material;
      out.baked.push(mesh);
      const geometry = mesh.geometry.attributes.normal ? mesh.geometry : mesh.geometry.clone();
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      const positions = geometry.attributes.position;
      const normals = geometry.attributes.normal;
      const vertexColors = material.vertexColors && geometry.attributes.color;
      normalMatrix.getNormalMatrix(mesh.matrixWorld);
      const mirrored = mesh.matrixWorld.determinant() < 0;
      const steel = (material.metalness ?? 0) > CROWD_VIEW.steelMetalness;
      const indices = geometry.index ? geometry.index.array : Array.from({ length: positions.count }, (_, index) => index);
      const inked = material.side !== THREE.DoubleSide && indices.length / 3 >= CROWD_VIEW.outlineTriangles;
      const targets = [steel ? out.steel : out.body];
      if (inked) targets.push(steel ? out.outlined.steel : out.outlined.body);
      // A cloth seen from both sides is baked twice, the back facing out.
      const sides = material.side === THREE.DoubleSide ? [1, -1] : [1];
      for (const facing of sides) {
        const base = out.positions.length / 3;
        for (let index = 0; index < positions.count; index += 1) {
          vertex.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
          normal.fromBufferAttribute(normals, index).applyMatrix3(normalMatrix).normalize().multiplyScalar(facing);
          if (vertexColors) color.fromBufferAttribute(geometry.attributes.color, index).multiply(material.color);
          else color.copy(material.color);
          out.positions.push(vertex.x, vertex.y, vertex.z);
          out.normals.push(normal.x, normal.y, normal.z);
          out.colors.push(color.r, color.g, color.b);
          out.skinIndex.push(bone);
        }
        const flip = mirrored !== (facing < 0);
        for (let corner = 0; corner + 2 < indices.length; corner += 3) {
          const [a, b, c] = [indices[corner], indices[corner + 1], indices[corner + 2]];
          for (const target of targets) {
            if (flip) target.push(base + a, base + c, base + b);
            else target.push(base + a, base + b, base + c);
          }
        }
      }
    });
  }
  return out;
}

/**
 * A coarser copy of a template by vertex clustering: vertices in the same
 * cell (`cell` m) with the same strongest bone, colour and facing become one
 * (position, normal, colour and skin weights averaged), and triangles that
 * fall in on themselves or repeat are dropped. Its bones are the template's,
 * so the same skeleton poses both. Plain arrays out (see farTemplate in render.js).
 */
export function simplifyTemplate(template, { cell = CROWD_VIEW.farCell, colorStep = CROWD_VIEW.farColorStep, facings = CROWD_VIEW.farFacings } = {}) {
  const position = template.attributes.position.array;
  const normal = template.attributes.normal.array;
  const skinIndex = template.attributes.skinIndex.array;
  const skinWeight = template.attributes.skinWeight.array;
  const colors = template.colors;
  const count = position.length / 3;
  const clusterOf = new Uint32Array(count);
  const keys = new Map();
  // Per cluster: its first vertex (whose bones it keeps) and the number it merged.
  const first = [];
  const members = [];
  const colorLevels = Math.ceil(1 / colorStep);
  for (let vertex = 0; vertex < count; vertex += 1) {
    const [nx, ny, nz] = [normal[vertex * 3], normal[vertex * 3 + 1], normal[vertex * 3 + 2]];
    const [ax, ay, az] = [Math.abs(nx), Math.abs(ny), Math.abs(nz)];
    const facing = facings < 6 || template.vertexSegment[vertex] ? 0 : ax >= ay && ax >= az ? (nx > 0 ? 0 : 1) : ay >= az ? (ny > 0 ? 2 : 3) : nz > 0 ? 4 : 5;
    // One number for the cell, strongest bone, colour class and facing.
    let key = 0;
    // A head has smaller cells: a helmet or a face is read from afar, and is a few hundred triangles in a small space.
    const size = skinIndex[vertex * 4] === BONE.head ? cell * CROWD_VIEW.farHeadCell : cell;
    for (let axis = 0; axis < 3; axis += 1) key = key * 256 + Math.min(255, Math.max(0, Math.floor(position[vertex * 3 + axis] / size) + 128));
    key = key * 32 + skinIndex[vertex * 4];
    for (let axis = 0; axis < 3; axis += 1) key = key * colorLevels + Math.min(colorLevels - 1, Math.floor(colors[vertex * 3 + axis] / colorStep));
    key = key * 8 + facing;
    let cluster = keys.get(key);
    if (cluster === undefined) {
      cluster = first.length;
      keys.set(key, cluster);
      first.push(vertex);
      members.push(0);
    }
    clusterOf[vertex] = cluster;
    members[cluster] += 1;
  }
  const total = first.length;
  const out = {
    position: new Float32Array(total * 3),
    normal: new Float32Array(total * 3),
    skinIndex: new Uint16Array(total * 4),
    skinWeight: new Float32Array(total * 4),
    colors: new Float32Array(total * 3),
    vertexSegment: new Array(total).fill(null),
  };
  for (let cluster = 0; cluster < total; cluster += 1) {
    for (let slot = 0; slot < 4; slot += 1) out.skinIndex[cluster * 4 + slot] = skinIndex[first[cluster] * 4 + slot];
  }
  for (let vertex = 0; vertex < count; vertex += 1) {
    const cluster = clusterOf[vertex];
    for (let axis = 0; axis < 3; axis += 1) {
      out.position[cluster * 3 + axis] += position[vertex * 3 + axis] / members[cluster];
      out.normal[cluster * 3 + axis] += normal[vertex * 3 + axis];
      out.colors[cluster * 3 + axis] += colors[vertex * 3 + axis] / members[cluster];
    }
    // His weights go to the bones the cluster keeps (those of its first vertex).
    for (let slot = 0; slot < 4; slot += 1) {
      const weight = skinWeight[vertex * 4 + slot];
      if (weight <= 0) continue;
      for (let kept = 0; kept < 4; kept += 1) {
        if (out.skinIndex[cluster * 4 + kept] === skinIndex[vertex * 4 + slot]) {
          out.skinWeight[cluster * 4 + kept] += weight;
          break;
        }
      }
    }
    out.vertexSegment[cluster] ??= template.vertexSegment[vertex];
  }
  for (let cluster = 0; cluster < total; cluster += 1) {
    const length = Math.hypot(out.normal[cluster * 3], out.normal[cluster * 3 + 1], out.normal[cluster * 3 + 2]) || 1;
    let sum = 0;
    for (let slot = 0; slot < 4; slot += 1) sum += out.skinWeight[cluster * 4 + slot];
    for (let axis = 0; axis < 3; axis += 1) out.normal[cluster * 3 + axis] /= length;
    for (let slot = 0; slot < 4; slot += 1) out.skinWeight[cluster * 4 + slot] = sum > 0 ? out.skinWeight[cluster * 4 + slot] / sum : slot === 0 ? 1 : 0;
  }
  const remap = (indices) => {
    const seen = new Set();
    const kept = [];
    const base = total + 1;
    for (let corner = 0; corner + 2 < indices.length; corner += 3) {
      const [a, b, c] = [clusterOf[indices[corner]], clusterOf[indices[corner + 1]], clusterOf[indices[corner + 2]]];
      if (a === b || b === c || a === c) continue;
      // The same triangle, whichever corner it starts from.
      const [x, y, z] = a < b && a < c ? [a, b, c] : b < c ? [b, c, a] : [c, a, b];
      const id = (x * base + y) * base + z;
      if (seen.has(id)) continue;
      seen.add(id);
      kept.push(a, b, c);
    }
    return Uint32Array.from(kept);
  };
  return {
    position: out.position,
    normal: out.normal,
    skinIndex: out.skinIndex,
    skinWeight: out.skinWeight,
    colors: out.colors,
    bodyIndex: remap(template.bodyIndex),
    steelIndex: remap(template.steelIndex),
    bodyOutlineIndex: remap(template.bodyOutlineIndex),
    steelOutlineIndex: remap(template.steelOutlineIndex),
    vertexSegment: out.vertexSegment,
    vertices: total,
  };
}

/** A plain, solid, untextured mesh: one that can be baked. */
export function bakeable(mesh) {
  if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.userData.outline || Array.isArray(mesh.material)) return false;
  return !(mesh.material.map || mesh.material.transparent || mesh.material.wireframe);
}

/** The world matrix of a frame placed at `origin` (default its own), as a Matrix4. */
export function frameAt(frame, origin = frame.origin) {
  return new THREE.Matrix4().fromArray(frameMatrix({ ...frame, origin }));
}

/**
 * Bone inverses that fit a template's body to another build: each bone of
 * the template stretched along its length to his, the head scaled whole.
 */
export function stretchedInverses(templateFrames, ownFrames, headScale) {
  const length = (frame) => (frame.end ? Math.hypot(...frame.end.map((value, axis) => value - frame.origin[axis])) : 0);
  return BONES.map((_, bone) => {
    const inverse = new THREE.Matrix4().fromArray(frameMatrix(templateFrames[bone])).invert();
    const from = length(templateFrames[bone]);
    const along = from > 1e-6 ? length(ownFrames[bone]) / from : 1;
    const scale = bone === BONE.head ? new THREE.Matrix4().makeScale(headScale, headScale, headScale) : new THREE.Matrix4().makeScale(1, along, 1);
    return scale.multiply(inverse);
  });
}

/**
 * Many copies of one rigid piece (a weapon, a shield, a banner) carried by
 * a crowd, drawn as one instanced mesh per material. Each frame: `begin`,
 * an `add` for each copy shown, `end`.
 */
export class CrowdBatch {
  constructor(scene, source, capacity = CROWD_VIEW.batchCapacity) {
    this.scene = scene;
    this.capacity = capacity;
    this.count = 0;
    // A source with parts that move on their own (a bow's string) keeps those per fighter.
    this.live = Boolean(source.userData.bow);
    this.parts = [];
    source.updateMatrixWorld(true);
    const toSource = new THREE.Matrix4().copy(source.matrixWorld).invert();
    const meshes = [];
    source.traverseVisible((mesh) => {
      if (mesh.isMesh && !mesh.userData.outline) meshes.push(mesh);
    });
    for (const mesh of meshes) {
      const geometry = mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toSource, mesh.matrixWorld));
      this.parts.push({ geometry, material: mesh.material, castShadow: mesh.castShadow, instanced: null });
    }
    this.allocate();
  }

  allocate() {
    for (const part of this.parts) {
      const old = part.instanced;
      part.instanced = new THREE.InstancedMesh(part.geometry, part.material, this.capacity);
      // Grown in the middle of a frame: the copies already placed carry over (else they draw at the origin for a frame).
      if (old) {
        part.instanced.instanceMatrix.array.set(old.instanceMatrix.array);
        this.scene.remove(old);
        old.dispose?.();
      }
      part.instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      part.instanced.castShadow = part.castShadow;
      // The copies are all over the field: never culled as one.
      part.instanced.frustumCulled = false;
      part.instanced.count = 0;
      this.scene.add(part.instanced);
    }
  }

  begin() {
    this.count = 0;
  }

  add(matrix) {
    if (this.count === this.capacity) {
      this.capacity *= 2;
      this.allocate();
    }
    for (const part of this.parts) part.instanced.setMatrixAt(this.count, matrix);
    this.count += 1;
  }

  end() {
    for (const part of this.parts) {
      part.instanced.count = this.count;
      part.instanced.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const part of this.parts) {
      this.scene.remove(part.instanced);
      part.instanced.dispose?.();
      part.geometry.dispose();
    }
  }
}

/** Start and finish a frame of every crowd batch in a view. */
export function beginCrowdBatches(view) {
  for (const batch of view.crowdBatches?.values() ?? []) batch.begin();
}

export function endCrowdBatches(view) {
  for (const batch of view.crowdBatches?.values() ?? []) batch.end();
}

/** The view's batch for `key`, made from `build()` the first time. */
export function crowdBatch(view, key, build) {
  view.crowdBatches ??= new Map();
  if (!view.crowdBatches.has(key)) view.crowdBatches.set(key, new CrowdBatch(view.scene, build()));
  return view.crowdBatches.get(key);
}
