// The castle's baked shadow: the castle and its land seen once from the sun (a depth map, an orthographic view over the whole headland),
// and the kit's shader (kittex.js) asks that map, per pixel, whether the sun reaches it. Baked, not live: it is drawn when a look is put
// on (the sun's direction is the look's, stagelooks.js) and never again, so it costs one extra frame at a look change and in play a few
// texture fetches only where a surface is lit by the sun. It is independent of three's own shadow maps (the men's, from the scene's
// lights): the castle's meshes cast none of those, so nothing here touches them.
//
// What it darkens is the sun alone (the one directional light on the stone): the sky's own light (the probe, the hemisphere) is left, so a
// wall in its own shadow goes cold and dim and not black. How much of the sun is taken is the look's `bakedShadow` (0..1).
//
// The map holds depth packed into RGBA8 (so no float textures are needed: phones have them unevenly), the light's orthographic view
// fitted tight to what casts. A pixel is compared with the map in three steps that keep it free of acne without much bias: the receiver is
// lifted a texel off along its normal, each sample's depth is corrected for the slope of the surface under it (a surface at a low sun
// angle changes depth fast across a texel), and then a few taps are taken: five to find out whether the pixel is anywhere near an edge,
// and only if it is, sixteen more for a soft one.

/** What the map is made of, and how soft the edge is. `size`: texels along the longer side (2048: a texel is about 12 cm over the headland; 16 MB); `grazingShare`: the share of the shadow kept on a surface a very low sun grazes. */
export const KT_SHADOW = { size: 2048, bias: 0.05, normalOffset: 1.0, softness: 2.4, grazingShare: 0.25 };

/** The uniforms every shadowed kit material shares (made on the first material, when THREE is there). */
export const ktShadow = { uKitShadowMap: { value: null }, uKitShadowMat: { value: null }, uKitShadowAxes: { value: null }, uKitShadowInfo: { value: null }, uKitSunDir: { value: null }, uKitShadowSize: { value: null } };

/** Give the shared uniforms their values (a 1 px white map, an identity, no shadow), once. */
export function ktShadowInit() {
  if (ktShadow.uKitShadowMat.value) return;
  const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  blank.needsUpdate = true;
  ktShadow.uKitShadowMap.value = blank;
  ktShadow.uKitShadowMat.value = new THREE.Matrix4();
  // The map's x and y axes in the world (rows 0, 1), and (strength, texel in metres, depth range in metres, bias in metres).
  ktShadow.uKitShadowAxes.value = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)];
  ktShadow.uKitShadowInfo.value = new THREE.Vector4(0, 0.1, 100, KT_SHADOW.bias);
  ktShadow.uKitSunDir.value = new THREE.Vector3(0, 1, 0);
  ktShadow.uKitShadowSize.value = new THREE.Vector2(1, 1);
}

/** The shader's uniforms and the function that says how much of the sun reaches a point: 1 all of it, down to 1 - strength in shadow. */
export const KT_SHADOW_PARS = `
uniform sampler2D uKitShadowMap;
uniform mat4 uKitShadowMat;
uniform vec3 uKitShadowAxes[2];
uniform vec4 uKitShadowInfo;
uniform vec3 uKitSunDir;
uniform vec2 uKitShadowSize;
`;

/** The function itself: after the packing chunk (it unpacks the map), before the lights. */
export const KT_SHADOW_FUNCTION = `
// How much of the sun's light the point gets (1: all, 1 - strength: none), from the baked map. \`n\`: its surface's normal.
float kitSunShade(vec3 p, vec3 n) {
  float strength = uKitShadowInfo.x;
  if (strength <= 0.0) return 1.0;
  float ndl = dot(n, uKitSunDir);
  if (ndl <= 0.0) return 1.0;
  float texel = uKitShadowInfo.y;
  vec4 s = uKitShadowMat * vec4(p + n * (texel * ${KT_SHADOW.normalOffset.toFixed(2)}), 1.0);
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0) return 1.0;
  // How the surface's depth (0..1 over the map's range) changes for a step of one texel along the map's x and y.
  float c = max(ndl, 0.1);
  vec2 slope = vec2(dot(n, uKitShadowAxes[0]), dot(n, uKitShadowAxes[1])) * (texel / (c * uKitShadowInfo.z));
  float bias = uKitShadowInfo.w / uKitShadowInfo.z;
  vec2 size = uKitShadowSize;
  vec2 home = s.xy * size;
  // One tap, \`at\` texels away from the point: 1 lit, 0 in shadow.
  #define KT_TAP(at) ( unpackRGBAToDepth( texture2D( uKitShadowMap, ( floor( home + (at) ) + 0.5 ) / size ) ) > s.z + dot( ( floor( home + (at) ) + 0.5 ) - home, slope ) - bias ? 1.0 : 0.0 )
  float r = ${KT_SHADOW.softness.toFixed(2)};
  float lit = KT_TAP(vec2(0.0)) + KT_TAP(vec2(-r, -r)) + KT_TAP(vec2(r, -r)) + KT_TAP(vec2(-r, r)) + KT_TAP(vec2(r, r));
  if (lit > 0.5 && lit < 4.5) {
    lit = 0.0;
    for (int i = 0; i < 4; i += 1) {
      for (int j = 0; j < 4; j += 1) {
        lit += KT_TAP(vec2(float(i) - 1.5, float(j) - 1.5) * (r * 0.66));
      }
    }
    lit /= 16.0;
    lit = smoothstep(0.0, 1.0, lit);
  } else {
    lit = lit > 2.5 ? 1.0 : 0.0;
  }
  // A surface a low sun only grazes (the grass in the storm look: ten degrees) shows a texel stretched over metres: a thin rail's shadow there is a streak a
  // texel wide that the taps find or miss by chance, a patch of blocks. The sun gives such a surface little light, so the shadow on it is taken in part only.
  strength *= mix(${KT_SHADOW.grazingShare.toFixed(2)}, 1.0, smoothstep(0.12, 0.45, ndl));
  return 1.0 - strength * (1.0 - lit);
}
`;

/** What was baked, and the target holding it (one: a look changes it, leaving the stage frees it). */
const baked = { target: null, key: '' };

/** No shadow any more (a look without one, or the stage left): the map is let go. */
export function ktShadowRelease() {
  baked.target?.dispose();
  baked.target = null;
  baked.key = '';
  baked.info = null;
  if (ktShadow.uKitShadowInfo.value) ktShadow.uKitShadowInfo.value.x = 0;
}

/**
 * Draw the shadow map: the meshes in `casters`, seen from the sun (`dir`: a unit vector toward it), by `renderer`, into the shared map. `root` is
 * the Object3D they are in (its other things are hidden for the draw). `strength` 0..1 is what the shader takes of the sun in shadow; 0 frees the map
 * instead. Draws nothing if the same sun was baked already (`key`). Returns the milliseconds it took (0 if it did nothing).
 */
export function ktShadowBake(renderer, root, casters, dir, strength, key = '') {
  ktShadowInit();
  const info = ktShadow.uKitShadowInfo.value;
  if (!(strength > 0) || !casters.length) {
    ktShadowRelease();
    return 0;
  }
  const sun = new THREE.Vector3(...dir).normalize();
  const same = baked.target && baked.key === `${key}|${sun.x.toFixed(4)},${sun.y.toFixed(4)},${sun.z.toFixed(4)}`;
  info.x = strength;
  if (same) return 0;
  const started = performance.now();
  root.updateMatrixWorld(true);
  // The headland's box, and the sun's view fitted over it: a point's place across the map and along the light.
  const box = new THREE.Box3();
  for (const mesh of casters) box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  const centre = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2 * radius + 2);
  camera.position.copy(centre).addScaledVector(sun, radius + 1);
  camera.up.set(0, 1, 0);
  camera.lookAt(centre);
  camera.updateMatrixWorld(true);
  const corner = new THREE.Vector3();
  const low = new THREE.Vector3(Infinity, Infinity, Infinity);
  const high = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let k = 0; k < 8; k += 1) {
    corner.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).applyMatrix4(camera.matrixWorldInverse);
    low.min(corner);
    high.max(corner);
  }
  const pad = 1;
  const across = high.x - low.x + 2 * pad;
  const up = high.y - low.y + 2 * pad;
  Object.assign(camera, { left: low.x - pad, right: high.x + pad, bottom: low.y - pad, top: high.y + pad, near: Math.max(0.1, -high.z - pad), far: -low.z + pad });
  camera.updateProjectionMatrix();
  const wide = Math.max(across, up);
  const width = Math.max(2, Math.round((KT_SHADOW.size * across) / wide));
  const height = Math.max(2, Math.round((KT_SHADOW.size * up) / wide));
  if (!baked.target || baked.target.width !== width || baked.target.height !== height) {
    baked.target?.dispose();
    baked.target = new THREE.WebGLRenderTarget(width, height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false, generateMipmaps: false });
    baked.target.texture.generateMipmaps = false;
  }
  // Draw: the casters with the depth material, nothing else, white (the far plane) behind.
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  const kept = [];
  root.traverse((object) => {
    if (!(object.isMesh || object.isLine || object.isPoints || object.isSprite)) return;
    kept.push([object, object.material, object.visible]);
    if (casters.includes(object)) object.material = depth;
    else object.visible = false;
  });
  const clear = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(baked.target);
  renderer.setClearColor(0xffffff, 1);
  renderer.clear(true, true, false);
  renderer.render(root, camera);
  renderer.setRenderTarget(previous);
  renderer.setClearColor(clear, clearAlpha);
  for (const [object, material, visible] of kept) {
    object.material = material;
    object.visible = visible;
  }
  depth.dispose();
  // What the shader needs: world to map (0..1 across, 0..1 along the light), the map's axes, the texel and the depth range in metres.
  const matrix = ktShadow.uKitShadowMat.value;
  matrix.makeTranslation(0.5, 0.5, 0.5).multiply(new THREE.Matrix4().makeScale(0.5, 0.5, 0.5)).multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
  const e = camera.matrixWorld.elements;
  ktShadow.uKitShadowAxes.value[0].set(e[0], e[1], e[2]);
  ktShadow.uKitShadowAxes.value[1].set(e[4], e[5], e[6]);
  info.y = wide / KT_SHADOW.size;
  info.z = camera.far - camera.near;
  info.w = KT_SHADOW.bias;
  ktShadow.uKitSunDir.value.copy(sun);
  ktShadow.uKitShadowSize.value.set(width, height);
  ktShadow.uKitShadowMap.value = baked.target.texture;
  baked.key = `${key}|${sun.x.toFixed(4)},${sun.y.toFixed(4)},${sun.z.toFixed(4)}`;
  baked.info = { width, height, texel: info.y, range: info.z, area: [across, up] };
  return performance.now() - started;
}

/** What was last baked, for the console and the tests: { width, height, texel (m), range (m), area: [across, up] (m) } or null. */
export const ktShadowInfo = () => baked.info ?? null;
