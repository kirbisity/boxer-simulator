// The town kit's shade in the air: the shadow of what a place has built, standing in the haze and in what falls.
//
// WORKAROUND, to be removed when the open air's walk of each sight line (env/air.js envAirShare) can ask a place's
// own sun map (shared/env-requests.md R10). The open air shades its haze by the clouds and by what its near map
// says stands over the ground (crowns, trunks, the land). A place that draws itself has walls, roofs and a gate
// vault there instead, which that map does not hold, so their shadows did not stand in the air: the lee of a wall
// in a snow shower was as bright with lit flakes' haze as the open field, and a lane between eaves as its square.
// Everything here but the sheets themselves is the open air's own: its haze, its clouds, its sun.
//
// How: the open air's haze adds to every pixel the light the air between it and the eye throws toward the eye,
// less the share shade takes of it (envAirlightIn) where its own walk found shade. So the air in front of the eye
// is cut into `slabs` sheets across the view, each standing for the air between two distances, and each takes
// back from its own slab what shade takes, where the slab is in the place's own shade (the kit's baked sun map,
// levelmode/kitshadow.js) and the open air counted it lit. The sheets are drawn at their slabs' far sides and
// tested against the scene's depth, so a slab counts only where all of it is air; each pixel reads its slab at
// its own depth in it (the open air's own screen pattern, envGrain), which turns the sheets' steps into grain.
// The frame is drawn in light's own measure with room under zero (env/post.js's half-float sheets), so what is
// taken is added as a negative, before the open air's own pass takes off what its walk found (which may be in the
// materials or once a pixel after the scene: view.env.airWalk 'lines' or 'frame'; the count is the same either
// way); where sight lines are not walked ('none', below the open air's high tier) nothing is drawn.
//
// The second set of sheets, the rays, does the same for the cloud (also R10). The open air counts the cloud's
// shade on its haze from the sheet's broad masses only (envSunShare), which is right for the land's light and too
// soft to draw a ray: the sun's light comes down through each small gap as its own lit column in the haze and in
// the snowfall, and toward the sun the eye looks along those columns, which is the fan of rays under a broken sky.
// So these sheets, set far wider apart and reaching to the cloud's base, take or give back the difference between
// the cloud as the sky draws it over each point's sun ray (envCloud, lumps and all) and that broad count. They
// add nothing of their own: where the two agree, away from the sun where a sight line crosses many columns and
// their mean is the broad count, nothing shows.

import { ENV_GLSL, envUniforms } from '../env/air.js';
import { ktShadow, ktShadowInit, KT_SHADOW_PARS } from '../levelmode/kitshadow.js';

/**
 * Tuning for the shade in the air.
 *  - `slabs` sheets between `from` and `to` m from the eye, each (`to` / `from`) ^ (1 / `slabs`) times as far as
 *    the last (1.62 for 12: thin where a wall or an eave shades the air close by, thick toward the place's far
 *    side; `to` is about the kit's sun map's reach). The count is the cost: every sheet covers the screen (all
 *    the sheets together, the rays' included, measured at about 0.2 to 1.9 ms a frame at 1600 x 900 in a headless
 *    browser, the two places and four views; the spread is the measurement's own noise).
 *  - `least`: a slab whose light could change by less than this is not worked. In the scene's own light before
 *    the exposure (a sunlit snowfield is a few hundredths there), so far under anything the picture shows.
 *  - `most`: no more than this share of what shade may take is taken, so that a pixel never goes under black
 *    where the sheets and the walk disagree a little (their grains differ).
 *  - `bias`: the baked sun map's depth is read this many metres toward the sun, so the air against a lit wall is
 *    not taken for shaded.
 *  - `rays`: the cloud's sheets. `slabs` between `from` and `to` m (each 1.72 times as far as the last for 8:
 *    `to` is about as far as a sight line 10 degrees up runs under a cloud base at 1.5 km), each read at `reads`
 *    depths, a grain apart from pixel to pixel; fewer drew the rays as a speckle. `sunward`: drawn only where the
 *    sight line is within this cosine of the sun's own way round the compass (0.3: about 70 degrees either
 *    side), since across the sun a sight line crosses the columns and nothing would show for the work. `gain`:
 *    1 is the open air's own figure for what shade takes of a slab's light, and at 1 the rays were there only in
 *    a difference of two frames (about 5 of 255). 6 is by eye, not derived: at 3 the sunward sky was a glow with
 *    no shafts in it, at 6 a band of light comes down from each gap under Pyongyang's broken snow cloud. What the true figure misses is most likely the forward scatter of the falling
 *    snow and of the haze near the sun's own direction, which the open air's haze counts once for the whole sky.
 */
export const TK_BEAMS = {
  slabs: 12, from: 1.2, to: 400, least: 0.00002, most: 0.9, bias: 0.25,
  rays: { slabs: 8, from: 120, to: 9000, reads: 3, sunward: 0.3, gain: 6 },
};

const TK_BEAMS_VERTEX = `
attribute vec3 aSlab;
uniform vec3 uBeam;
uniform vec3 uRays;
varying vec3 vRay;
varying vec3 vSpan;
void main() {
  // (aSlab.z: the sheet's number, the rays' sheets counted from 100.)
  float rays = step(99.5, aSlab.z);
  float near = mix(uBeam.x * pow(uBeam.y, aSlab.z), uRays.x * pow(uRays.y, aSlab.z - 100.0), rays);
  vSpan = vec3(near, near * mix(uBeam.y, uRays.y, rays), rays);
  // (A point of the view one metre before the eye, and the same in the world: the ray per metre of depth.)
  vec3 before = vec3(aSlab.x / projectionMatrix[0][0], aSlab.y / projectionMatrix[1][1], -1.0);
  vRay = (vec4(before, 0.0) * viewMatrix).xyz;
  // (A slab that ends past the camera's far side is drawn just inside it: only the sky is so far.)
  float far = projectionMatrix[3][2] / (projectionMatrix[2][2] + 1.0);
  gl_Position = projectionMatrix * vec4(before * min(vSpan.y, far * 0.98), 1.0);
}
`;

const TK_BEAMS_FRAGMENT = `
#include <packing>
${ENV_GLSL}
${KT_SHADOW_PARS}
varying vec3 vRay;
varying vec3 vSpan;
// What the place has built leaves of the sun at a point of the air: 1 lit, 0 in its shade, 1 off its map.
float tkBeamOpen(vec3 p) {
  if (uKitShadowInfo.x <= 0.0) return 1.0;
  vec4 s = uKitShadowMat * vec4(p + uKitSunDir * ${TK_BEAMS.bias.toFixed(2)}, 1.0);
  if (s.x <= 0.0 || s.x >= 1.0 || s.y <= 0.0 || s.y >= 1.0 || s.z >= 1.0) return 1.0;
  return step(s.z, unpackRGBAToDepth(texture2D(uKitShadowMap, s.xy)));
}
vec3 tkBeamThrough(float depth) {
  return exp(-(uEnvRayleigh.rgb + uEnvHaze.rgb * envHazeColumn(max(cameraPosition.y, 0.0), max(cameraPosition.y + vRay.y * depth, 0.0))) * depth * length(vRay));
}
void main() {
  vec3 way = normalize(vRay);
  // What shade may take of the slab's light: the open air's own figure.
  vec3 most = (envAirlightIn(way, 1.0) - envAirlightIn(way, 0.0)) * (tkBeamThrough(vSpan.x) - tkBeamThrough(vSpan.y));
  if (max(most.r, max(most.g, most.b)) < ${TK_BEAMS.least.toFixed(6)}) discard;
  float grain = envGrain(gl_FragCoord.xy);
  float change = 0.0;
  if (vSpan.z > 0.5) {
    // The rays: the cloud as the sky draws it over the point's sun ray, against the broad count the haze was lit by.
    if (uEnvCloud.y <= 0.0 || dot(normalize(way.xz + vec2(1e-5, 0.0)), normalize(uEnvSunDir.xz)) < ${TK_BEAMS.rays.sunward.toFixed(2)}) discard;
    float edge = mix(0.74, 0.26, uEnvCloud.x);
    float counted = 0.0;
    for (int i = 0; i < ${TK_BEAMS.rays.reads}; i++) {
      vec3 p = cameraPosition + vRay * mix(vSpan.x, vSpan.y, fract(grain + float(i) / ${TK_BEAMS.rays.reads.toFixed(1)} + vSpan.x * 0.618));
      // (Nothing shades the air over the cloud; the last fifth under its base fades, or the base draws a line.)
      float under = 1.0 - smoothstep(0.8 * uEnvCloud.w, uEnvCloud.w, p.y);
      vec2 sheet = envCloudOver(p);
      float broad = envCloudBroad(sheet);
      float fine = texture2D(uEnvNoise, sheet * 0.53 + vec2(0.37, 0.11) + broad * 0.12).a;
      float cloud = smoothstep(-0.07 * uEnvCloudForm.z, 0.11 * uEnvCloudForm.z, broad * 0.68 + (0.16 + (fine - 0.5) * uEnvCloudForm.x) - edge);
      float soft = smoothstep(edge - 0.12, edge + 0.16, broad * 0.68 + 0.16);
      counted += 1.0 - uEnvCloud.y * soft;
      change += (soft - cloud) * under;
    }
    // (No more is taken than the broad count left lit.)
    change = max(change * uEnvCloud.y * ${(TK_BEAMS.rays.gain / TK_BEAMS.rays.reads).toFixed(3)}, -counted * ${(1 / TK_BEAMS.rays.reads).toFixed(4)});
  } else {
    vec3 p = cameraPosition + vRay * mix(vSpan.x, vSpan.y, grain);
    if (tkBeamOpen(p) > 0.5) discard;
    change = -envAirSun(p);
  }
  gl_FragColor = vec4(most * (change * ${TK_BEAMS.most.toFixed(2)}), 0.0);
}
`;

/** The sheets: one mesh, to be shown only in the open air. */
export function tkBeams() {
  ktShadowInit();
  const { slabs, from, to, rays } = TK_BEAMS;
  const slab = [];
  const index = [];
  // (Nothing here writes depth, and what is added does not depend on the order.)
  const sheet = (k) => {
    const first = slab.length / 3;
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) slab.push(x, y, k);
    index.push(first, first + 1, first + 2, first, first + 2, first + 3);
  };
  for (let k = 0; k < slabs; k += 1) sheet(k);
  for (let k = 0; k < rays.slabs; k += 1) sheet(100 + k);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(slab.length), 3));
  geometry.setAttribute('aSlab', new THREE.BufferAttribute(new Float32Array(slab), 3));
  geometry.setIndex(index);
  const material = new THREE.ShaderMaterial({
    vertexShader: TK_BEAMS_VERTEX,
    fragmentShader: TK_BEAMS_FRAGMENT,
    uniforms: { ...envUniforms(), ...ktShadow, uBeam: { value: new THREE.Vector3(from, (to / from) ** (1 / slabs), slabs) }, uRays: { value: new THREE.Vector3(rays.from, (rays.to / rays.from) ** (1 / rays.slabs), rays.slabs) } },
    // (Added to the picture as it stands, what is taken as a negative.)
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    transparent: true, depthWrite: false, fog: false,
  });
  material.userData.envOwn = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'townkit:air:beams';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 6;
  mesh.userData.tkAir = true;
  // (Shown only where the open air walks its sight lines: stir.js.)
  mesh.userData.tkWalked = true;
  mesh.visible = false;
  return mesh;
}
