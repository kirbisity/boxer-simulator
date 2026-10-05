// Shading styles. 'toon' is cel shading with ink outlines: flat tones read
// as drawn rather than as almost-real skin, which is what keeps stylised
// faces out of the uncanny valley. 'soft' is the plain lit look, kept so the
// two can be compared.

/* global THREE */

export const STYLE = {
  current: 'toon',
  // Three tones: shadow, mid, light. Wide mid band, as in cel animation;
  // the light band stops short of 1 so pale skin under the key light does
  // not burn out to white.
  toonSteps: [0.48, 0.72, 0.86],
  outlineWidth: 0.0045, // m
  outlineColor: 0x1a1216,
  // Faces in cel animation are barely shaded: two close tones.
  faceSteps: [0.7, 0.86],
};

const gradients = new Map();
function gradientMap(steps = STYLE.toonSteps) {
  const key = steps.join(',');
  if (gradients.has(key)) return gradients.get(key);
  const data = new Uint8Array(steps.length * 3);
  steps.forEach((value, index) => data.set([value * 255, value * 255, value * 255], index * 3));
  const gradient = new THREE.DataTexture(data, steps.length, 1, THREE.RGBFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  gradients.set(key, gradient);
  return gradient;
}

/** A surface material in the current style. */
export function surface(color, { skinning = false, vertexColors = false, roughness = 0.6, opacity = 1, steps = STYLE.toonSteps } = {}) {
  const common = { color, skinning, vertexColors, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 };
  if (STYLE.current === 'toon') return new THREE.MeshToonMaterial({ ...common, gradientMap: gradientMap(steps) });
  return new THREE.MeshStandardMaterial({ ...common, roughness, metalness: 0 });
}

/**
 * An ink outline: the same mesh drawn again, back faces only, pushed out
 * along its normals (the "inverted hull"). Works on skinned meshes because
 * the push happens before skinning.
 */
export function outlineFor(mesh, width = STYLE.outlineWidth) {
  const material = new THREE.MeshBasicMaterial({ color: STYLE.outlineColor, side: THREE.BackSide, skinning: !!mesh.isSkinnedMesh });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = vec3( position ) + normalize( normal ) * ${width.toFixed(5)};`);
  };
  // three caches programs by onBeforeCompile's source text, which is the same
  // for every width: key the program by the width, or all widths share the first.
  material.customProgramCacheKey = () => `outline-${width.toFixed(5)}`;
  const outline = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(mesh.geometry, material) : new THREE.Mesh(mesh.geometry, material);
  if (mesh.isSkinnedMesh) outline.bind(mesh.skeleton, mesh.bindMatrix);
  outline.userData.outline = true;
  outline.frustumCulled = false;
  return outline;
}

/**
 * Free what an object and its children hold on the GPU: geometries,
 * materials, and textures drawn for them (a banner's canvas). Anything
 * marked `userData.shared` (a crowd template, a merged weapon) is left.
 */
export function disposeObject(root) {
  root.traverse((object) => {
    if (object.userData.shared) return;
    object.geometry?.dispose?.();
    for (const material of [].concat(object.material ?? [])) {
      if (material.map?.isCanvasTexture) material.map.dispose();
      material.dispose();
    }
  });
}
