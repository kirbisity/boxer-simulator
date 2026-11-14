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
// taken is added as a negative; where sight lines are not walked (below the open air's high tier) nothing is
// drawn. (The rays of a low sun through the cloud's gaps were tried here too, as a second correction past the
// place's edge, and taken out: against the open air's own soft count of the cloud they only lifted the sky's
// dark patches. They are the sky's to draw: R10.)

import { ENV_GLSL, envUniforms } from '../env/air.js';
import { ktShadow, ktShadowInit, KT_SHADOW_PARS } from '../levelmode/kitshadow.js';

/**
 * Tuning for the shade in the air.
 *  - `slabs` sheets between `from` and `to` m from the eye, each (`to` / `from`) ^ (1 / `slabs`) times as far as
 *    the last (1.62 for 12: thin where a wall or an eave shades the air close by, thick toward the place's far
 *    side; `to` is about the kit's sun map's reach). The count is the cost: every sheet covers the screen (the
 *    measured frame cost is in the round's notes).
 *  - `least`: a slab whose light could change by less than this is not worked. In the scene's own light before
 *    the exposure (a sunlit snowfield is a few hundredths there), so far under anything the picture shows.
 *  - `most`: no more than this share of what shade may take is taken, so that a pixel never goes under black
 *    where the sheets and the walk disagree a little (their grains differ).
 *  - `bias`: the baked sun map's depth is read this many metres toward the sun, so the air against a lit wall is
 *    not taken for shaded.
 */
export const TK_BEAMS = { slabs: 12, from: 1.2, to: 400, least: 0.00002, most: 0.9, bias: 0.25 };

const TK_BEAMS_VERTEX = `
attribute vec3 aSlab;
uniform vec3 uBeam;
uniform vec4 uEnvShade;
varying vec3 vRay;
varying vec3 vSpan;
void main() {
  float near = uBeam.x * pow(uBeam.y, aSlab.z);
  vSpan = vec3(near, near * uBeam.y, 0.0);
  // (A point of the view one metre before the eye, and the same in the world: the ray per metre of depth.)
  vec3 before = vec3(aSlab.x / projectionMatrix[0][0], aSlab.y / projectionMatrix[1][1], -1.0);
  vRay = (vec4(before, 0.0) * viewMatrix).xyz;
  // (A slab that ends past the camera's far side is drawn just inside it: only the sky is so far.)
  float far = projectionMatrix[3][2] / (projectionMatrix[2][2] + 1.0);
  gl_Position = projectionMatrix * vec4(before * min(vSpan.y, far * 0.98), 1.0);
  // (Where sight lines are not walked there is nothing to put right.)
  if (uEnvShade.w >= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
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
  vec3 p = cameraPosition + vRay * mix(vSpan.x, vSpan.y, envGrain(gl_FragCoord.xy));
  if (tkBeamOpen(p) > 0.5) discard;
  float change = -envAirSun(p);
  gl_FragColor = vec4(most * (change * ${TK_BEAMS.most.toFixed(2)}), 0.0);
}
`;

/** The sheets: one mesh, to be shown only in the open air. */
export function tkBeams() {
  ktShadowInit();
  const { slabs, from, to } = TK_BEAMS;
  const slab = [];
  const index = [];
  // (Farthest first: nothing here writes depth, and what is added does not depend on the order.)
  for (let k = slabs - 1; k >= 0; k -= 1) {
    const first = slab.length / 3;
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) slab.push(x, y, k);
    index.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(slab.length), 3));
  geometry.setAttribute('aSlab', new THREE.BufferAttribute(new Float32Array(slab), 3));
  geometry.setIndex(index);
  const material = new THREE.ShaderMaterial({
    vertexShader: TK_BEAMS_VERTEX,
    fragmentShader: TK_BEAMS_FRAGMENT,
    uniforms: { ...envUniforms(), ...ktShadow, uBeam: { value: new THREE.Vector3(from, (to / from) ** (1 / slabs), slabs) } },
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
  mesh.visible = false;
  return mesh;
}
