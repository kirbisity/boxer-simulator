// A true mirror for a level sheet of water (kitwater.js, a look with `mirror`): the scene drawn again from the camera
// reflected in the water's plane, into a picture the water's shader reads where each point of it lies (a planar
// reflection, as three.js's Reflector example makes one). Still water is a mirror: at a glancing look it gives back
// nearly all the light that falls on it (Fresnel), and a puddle on a field shows the men and the trees standing in it.
// The near plane of the reflected camera is set on the water (an oblique projection), so nothing under the surface is
// drawn into it. Drawn once a frame, at `scale` of the screen's size, and only while the water is in view.

/* global THREE */

/**
 * Make `mesh` (a horizontal sheet of water) a mirror: its material's `kwMirror` uniforms (kitwater.js) are fed the
 * reflection and the matrix that finds each point of the water in it. `scale` the picture's size, a share of the screen's.
 */
export function kwtMirror(mesh, { scale = 0.5 } = {}) {
  const uniforms = mesh.material.userData.kwMirror;
  if (!uniforms) return;
  const target = new THREE.WebGLRenderTarget(16, 16, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
  target.texture.generateMipmaps = false;
  uniforms.uKwMirror.value = target.texture;
  const virtual = new THREE.PerspectiveCamera();
  const normal = new THREE.Vector3(0, 1, 0);
  const at = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const rotation = new THREE.Matrix4();
  const plane = new THREE.Plane();
  const clip = new THREE.Vector4();
  const q = new THREE.Vector4();
  const size = new THREE.Vector2();
  const before = mesh.onBeforeRender;
  let drawnFor = -1;
  mesh.onBeforeRender = (renderer, scene, camera, ...rest) => {
    before?.call(mesh, renderer, scene, camera, ...rest);
    // (Once a frame, for the camera the frame is seen from: not for a shadow's camera, nor again for a later pass.)
    if (!camera.isPerspectiveCamera || renderer.info.render.frame === drawnFor) return;
    drawnFor = renderer.info.render.frame;
    mesh.getWorldPosition(at);
    eye.setFromMatrixPosition(camera.matrixWorld);
    if (eye.y <= at.y) return;
    renderer.getDrawingBufferSize(size);
    const width = Math.max(16, Math.round(size.x * scale));
    const height = Math.max(16, Math.round(size.y * scale));
    if (target.width !== width || target.height !== height) target.setSize(width, height);
    // The camera reflected in the plane, looking at the reflection of what it looks at.
    const mirrored = eye.clone().setY(2 * at.y - eye.y);
    rotation.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rotation).add(eye);
    aim.copy(look);
    aim.y = 2 * at.y - look.y;
    virtual.position.copy(mirrored);
    virtual.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
    virtual.lookAt(aim);
    virtual.far = camera.far;
    virtual.updateMatrixWorld();
    virtual.projectionMatrix.copy(camera.projectionMatrix);
    // The near plane laid on the water (Lengyel's oblique clipping), so what is under it is not drawn.
    plane.setFromNormalAndCoplanarPoint(normal, at).applyMatrix4(virtual.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const projection = virtual.projectionMatrix.elements;
    q.set((Math.sign(clip.x) + projection[8]) / projection[0], (Math.sign(clip.y) + projection[9]) / projection[5], -1, (1 + projection[10]) / projection[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    projection[2] = clip.x;
    projection[6] = clip.y;
    projection[10] = clip.z + 1 - 0.003;
    projection[14] = clip.w;
    virtual.projectionMatrixInverse.copy(virtual.projectionMatrix).invert();
    // Each point of the water, world → the reflection's picture (0..1).
    uniforms.uKwMirrorMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(virtual.projectionMatrix).multiply(virtual.matrixWorldInverse);
    const shown = mesh.visible;
    const outTarget = renderer.getRenderTarget();
    const shadows = renderer.shadowMap.autoUpdate;
    mesh.visible = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(target);
    renderer.state.buffers.depth.setMask(true);
    if (renderer.autoClear === false) renderer.clear();
    renderer.render(scene, virtual);
    renderer.setRenderTarget(outTarget);
    renderer.shadowMap.autoUpdate = shadows;
    mesh.visible = shown;
    if (camera.viewport !== undefined) renderer.state.viewport(camera.viewport);
  };
  mesh.userData.kwMirrorTarget = target;
}
