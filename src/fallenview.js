// The fallen of a battle, still, in the walk after it (main.js enterStoryRoam): every body posed once as the battle left him,
// then baked where he lies and merged with the rest by material, so a field of the dead costs a few draw calls in all rather
// than about seven a body (skin, steel, their ink, what he wore on his head, and each again for the shadow).
//
// Baking repeats on the processor what three's skinning does on the card (linear blending, as the crowd's bodies are drawn:
// render.js crowdView): each corner by the weighted sum of its bones' matrices, its normal by the same matrix, and an ink
// outline's corner pushed out along the unit normal by the outline's width before it is skinned (toon.js outlineFor). The
// merged meshes are drawn with copies of the bodies' own materials, unskinned, so they are lit, inked and shadowed as the
// bodies were; being their own, they can be dressed for the open air (`dress`) without touching any later battle's men.

const KEPT = ['position', 'normal', 'color', 'uv'];
// (r128's attributes read a component by name only.)
const READ = ['getX', 'getY', 'getZ', 'getW'];
const component = (attribute, index, k) => attribute[READ[k]](index);

/** One body's skinned corners: positions and normals as drawn, and each corner's push for an outline, in the mesh's space. */
function skinnedCorners(mesh) {
  const { geometry, skeleton, bindMatrix, bindMatrixInverse } = mesh;
  skeleton.update();
  const bones = skeleton.boneMatrices;
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const index = geometry.attributes.skinIndex;
  const weight = geometry.attributes.skinWeight;
  const count = position.count;
  const out = { position: new Float32Array(count * 3), normal: new Float32Array(count * 3), push: new Float32Array(count * 3) };
  const blend = new THREE.Matrix4();
  const bone = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const turn = new THREE.Vector3();
  const unit = new THREE.Vector3();
  for (let corner = 0; corner < count; corner += 1) {
    blend.elements.fill(0);
    for (let k = 0; k < 4; k += 1) {
      const w = component(weight, corner, k);
      if (!w) continue;
      bone.fromArray(bones, component(index, corner, k) * 16);
      for (let e = 0; e < 16; e += 1) blend.elements[e] += w * bone.elements[e];
    }
    blend.premultiply(bindMatrixInverse).multiply(bindMatrix);
    point.fromBufferAttribute(position, corner).applyMatrix4(blend);
    out.position.set([point.x, point.y, point.z], corner * 3);
    if (normal) {
      unit.fromBufferAttribute(normal, corner).normalize();
      turn.copy(unit).transformDirection(blend);
      out.normal.set([turn.x, turn.y, turn.z], corner * 3);
      // (Not renormalised: a bone stretched to his length stretches the push as the card's skinning does.)
      turn.copy(unit).applyMatrix3(new THREE.Matrix3().setFromMatrix4(blend));
      out.push.set([turn.x, turn.y, turn.z], corner * 3);
    }
  }
  return out;
}

/** A mesh as drawn now, in world space: its used corners only, with the attributes kept (KEPT) and its own index. */
function bakedPiece(mesh, skinnedOf) {
  const geometry = mesh.geometry;
  const material = mesh.material;
  const source = geometry.index ? geometry.index.array : Array.from({ length: geometry.attributes.position.count }, (_, i) => i);
  const remap = new Map();
  const index = new Uint32Array(source.length);
  for (let i = 0; i < source.length; i += 1) {
    let to = remap.get(source[i]);
    if (to === undefined) {
      to = remap.size;
      remap.set(source[i], to);
    }
    index[i] = to;
  }
  const used = [...remap.keys()];
  const skinned = mesh.isSkinnedMesh ? skinnedOf(mesh) : null;
  const width = mesh.userData.outline ? material.userData.outlineWidth ?? 0 : 0;
  const world = mesh.matrixWorld;
  const turnWorld = new THREE.Matrix3().getNormalMatrix(world);
  const attributes = {};
  const point = new THREE.Vector3();
  const facing = new THREE.Vector3();
  for (const name of KEPT) {
    const from = geometry.attributes[name];
    if (!from) continue;
    const size = from.itemSize;
    const array = new Float32Array(used.length * size);
    used.forEach((corner, i) => {
      if (name === 'position') {
        if (skinned) {
          point.fromArray(skinned.position, corner * 3);
          if (width) point.addScaledVector(facing.fromArray(skinned.push, corner * 3), width);
        } else {
          point.fromBufferAttribute(from, corner);
          if (width && geometry.attributes.normal) point.addScaledVector(facing.fromBufferAttribute(geometry.attributes.normal, corner).normalize(), width);
        }
        point.applyMatrix4(world);
        array.set([point.x, point.y, point.z], i * 3);
      } else if (name === 'normal') {
        if (skinned) facing.fromArray(skinned.normal, corner * 3);
        else facing.fromBufferAttribute(from, corner);
        facing.applyMatrix3(turnWorld).normalize();
        array.set([facing.x, facing.y, facing.z], i * 3);
      } else {
        for (let c = 0; c < size; c += 1) array[i * size + c] = component(from, corner, c);
      }
    });
    attributes[name] = { array, size };
  }
  return { attributes, index, count: used.length };
}

/** What makes two materials draw alike: those that do are merged into one mesh. */
function signature(mesh, extra) {
  const m = mesh.material;
  const hex = (colour) => (colour ? colour.getHexString() : '-');
  return [m.type, m.side, m.vertexColors, hex(m.color), hex(m.emissive), m.roughness, m.metalness, m.envMap?.uuid, m.map?.uuid, m.normalMap?.uuid, m.gradientMap?.uuid, m.transparent, m.opacity,
    m.depthWrite, m.userData.outlineWidth ?? '', mesh.userData.outline ? 'ink' : '', m.customProgramCacheKey?.() ?? '', mesh.castShadow, mesh.receiveShadow, extra].join('|');
}

/** The material a merged mesh draws with: the body's own, unskinned (as a cut-off piece is: toon.js unskinnedCopy), its patches kept. */
function stillMaterial(mesh) {
  const original = mesh.material;
  const copy = original.clone();
  copy.skinning = false;
  if (original.onBeforeCompile) copy.onBeforeCompile = original.onBeforeCompile;
  if (original.customProgramCacheKey) copy.customProgramCacheKey = original.customProgramCacheKey;
  // An outline is placed already (pushed out when baked): drawn as it is, back faces only.
  if (mesh.userData.outline) {
    copy.onBeforeCompile = () => {};
    copy.customProgramCacheKey = () => 'outline-baked';
  }
  copy.needsUpdate = true;
  return copy;
}

/**
 * Merge `bodies` ([{ view: a fighter view posed where he lies, share: anything that must keep his materials apart, as the
 * `dress` options for them }]) into one group of still meshes added to `scene`. `dress(material, share)` may change a merged
 * material (the open air's envDress). The fighter views are left as they are (the caller disposes them).
 * Returns { group, draws, triangles, dispose }.
 */
export function mergeFallen(scene, bodies, { dress = null } = {}) {
  const groups = new Map();
  for (const { view, share = null } of bodies) {
    view.group.updateMatrixWorld(true);
    const skinnedMemo = new Map();
    const skinnedOf = (mesh) => {
      const key = mesh.geometry.attributes.position;
      if (!skinnedMemo.has(key)) skinnedMemo.set(key, skinnedCorners(mesh));
      return skinnedMemo.get(key);
    };
    view.group.traverseVisible((mesh) => {
      if (!mesh.isMesh || mesh.isInstancedMesh || Array.isArray(mesh.material) || mesh.material.visible === false) return;
      const key = signature(mesh, share === null ? '' : JSON.stringify(share));
      if (!groups.has(key)) groups.set(key, { mesh, share, pieces: [] });
      groups.get(key).pieces.push(bakedPiece(mesh, skinnedOf));
    });
  }
  const group = new THREE.Group();
  let triangles = 0;
  for (const { mesh, share, pieces } of groups.values()) {
    const names = KEPT.filter((name) => pieces.every((piece) => piece.attributes[name]));
    const corners = pieces.reduce((sum, piece) => sum + piece.count, 0);
    const indices = pieces.reduce((sum, piece) => sum + piece.index.length, 0);
    const geometry = new THREE.BufferGeometry();
    for (const name of names) {
      const size = pieces[0].attributes[name].size;
      const array = new Float32Array(corners * size);
      let at = 0;
      for (const piece of pieces) {
        array.set(piece.attributes[name].array, at * size);
        at += piece.count;
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
    }
    const index = new Uint32Array(indices);
    let base = 0;
    let at = 0;
    for (const piece of pieces) {
      for (let i = 0; i < piece.index.length; i += 1) index[at + i] = piece.index[i] + base;
      at += piece.index.length;
      base += piece.count;
    }
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.computeBoundingSphere();
    let material = stillMaterial(mesh);
    if (dress && !mesh.userData.outline) material = dress(material, share) ?? material;
    const merged = new THREE.Mesh(geometry, material);
    merged.castShadow = mesh.castShadow;
    merged.receiveShadow = mesh.receiveShadow;
    merged.renderOrder = mesh.renderOrder;
    if (mesh.userData.outline) merged.userData.outline = true;
    group.add(merged);
    triangles += indices / 3;
  }
  scene.add(group);
  return {
    group, draws: group.children.length, triangles,
    dispose() {
      scene.remove(group);
      for (const merged of group.children) {
        merged.geometry.dispose();
        merged.material.dispose();
      }
    },
  };
}
