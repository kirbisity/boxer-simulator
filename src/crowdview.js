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
  // Copies an instanced batch starts with room for (it doubles when full).
  batchCapacity: 64,
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
      if (part.instanced) this.scene.remove(part.instanced);
      part.instanced = new THREE.InstancedMesh(part.geometry, part.material, this.capacity);
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
