// The town kit's light in the air: the sun's shafts and the shade's bands, by depth.
//
// WORKAROUND, to be removed when the open air's own shafts know depth (shared/env-requests.md R10): its shafts are
// drawn on the finished picture (post.js: bright sky smeared along the lines from the sun's place on the screen),
// which cannot show a wall's shadow lying through falling snow, a beam down a lane between eaves, or a cloud's
// shadow standing in the haze. Everything here but the sheets themselves is the open air's own: its haze, its
// clouds' shade, its sun.
//
// How: the open air's haze (env/air.js envHaze) adds to every pixel the light the air between it and the eye throws
// toward the eye, as if the sun reached all of that air. Where it does not (under a cloud: envSunShare; behind
// what the place has built: the kit's baked sun map, levelmode/kitshadow.js) the sun's share of that light was
// never there. So the air in front of the eye is cut into `slabs` sheets across the view, each standing for the
// air between two distances, and each takes back from the picture the sun's share of its own slab's light where
// the slab is in shade. The sheets are drawn at their slabs' far sides and tested against the scene's depth, so a
// slab counts only where all of it is air; each pixel reads its slab at its own depth in it (a fixed screen
// pattern), which turns the sheets' steps into grain. Lit air is left as the haze drew it: a shaft is what is not
// taken back.

import { ENV_GLSL, envUniforms } from '../env/air.js';
import { ktShadow, ktShadowInit, KT_SHADOW_PARS } from '../levelmode/kitshadow.js';

/**
 * Tuning for the light in the air.
 *  - `slabs` sheets between `from` and `to` m from the eye, each `to / from` ^ (1 / slabs) times as far as the last
 *    (1.7 for 14: thin where the place's own walls and eaves shade the air, thick where a cloud's shadow a
 *    kilometre off does). The count is the cost: every sheet covers the screen. By measurement, below.
 *  - `direct`: the share of the air's light along a level look away from the sun that comes straight from the sun
 *    and not from the sky and the ground. In clear air with the sun well up, once-scattered sunlight is about half
 *    to two thirds of the horizon's light, approximate; under broken cloud the sky's own share is larger. 0.5.
 *    Toward the sun the open air's forward glow (its aureole) is all the sun's, and is counted whole.
 *  - `most`: no more than this share of a slab's light is ever taken, so that a pixel never goes under black where
 *    the sheets and the picture disagree a little (a dark cloud's base low on the sky).
 *  - `bias`: the baked sun map's depth is read this many metres toward the sun, so the air against a lit wall is
 *    not taken for shaded.
 */
export const TK_BEAMS = { slabs: 14, from: 1.4, to: 2400, direct: 0.5, most: 0.85, bias: 0.25 };

const TK_BEAMS_VERTEX = `
attribute vec3 aSlab;
uniform vec3 uBeam;
varying vec3 vRay;
varying vec2 vSpan;
void main() {
  float near = uBeam.x * pow(uBeam.y, aSlab.z);
  vSpan = vec2(near, near * uBeam.y);
  // (A point of the view one metre before the eye, and the same in the world: the ray per metre of depth.)
  vec3 before = vec3(aSlab.x / projectionMatrix[0][0], aSlab.y / projectionMatrix[1][1], -1.0);
  vRay = (vec4(before, 0.0) * viewMatrix).xyz;
  gl_Position = projectionMatrix * vec4(before * vSpan.y, 1.0);
}
`;

const TK_BEAMS_FRAGMENT = `
#include <packing>
${ENV_GLSL}
${KT_SHADOW_PARS}
varying vec3 vRay;
varying vec2 vSpan;
// The share of the sun that reaches a point of the air: the clouds' shade, and what the place has built.
float tkBeamLit(vec3 p) {
  float lit = envSunShare(p);
  if (uKitShadowInfo.x > 0.0) {
    vec4 s = uKitShadowMat * vec4(p + uKitSunDir * ${TK_BEAMS.bias.toFixed(2)}, 1.0);
    if (s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0 && s.z < 1.0) lit *= step(s.z, unpackRGBAToDepth(texture2D(uKitShadowMap, s.xy)));
  }
  return lit;
}
vec3 tkBeamThrough(float depth) {
  return exp(-(uEnvRayleigh.rgb + uEnvHaze.rgb * envHazeColumn(max(cameraPosition.y, 0.0), max(cameraPosition.y + vRay.y * depth, 0.0))) * depth * length(vRay));
}
void main() {
  float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec3 p = cameraPosition + vRay * mix(vSpan.x, vSpan.y, grain);
  float shade = 1.0 - tkBeamLit(p);
  if (shade < 0.004) discard;
  vec3 way = normalize(vRay);
  // The slab's own light as the haze drew it, and the sun's share of it: all of the forward glow, part of the rest.
  vec3 air = envAirlight(way);
  vec3 level = envSky(vec3(way.x, 0.0, way.z));
  float whole = dot(air, vec3(0.3333));
  float sun = (${TK_BEAMS.direct.toFixed(2)} * min(dot(level, vec3(0.3333)), whole) + max(whole - dot(level, vec3(0.3333)), 0.0)) / max(whole, 1e-4);
  // (Over the horizon what is behind the air is mostly sky, which may be darker than the haze's own light that way.)
  if (way.y > 0.0) air = min(air, envSky(way));
  gl_FragColor = vec4(air * (tkBeamThrough(vSpan.x) - tkBeamThrough(vSpan.y)) * (sun * ${TK_BEAMS.most.toFixed(2)} * shade), 0.0);
}
`;

/** The sheets: one mesh, to be shown only in the open air. */
export function tkBeams() {
  ktShadowInit();
  const { slabs, from, to } = TK_BEAMS;
  const slab = [];
  const index = [];
  // (Farthest first: nothing here writes depth, and what is taken back does not depend on the order.)
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
    // (Taken from the picture: what is there less this.)
    blending: THREE.CustomBlending, blendEquation: THREE.ReverseSubtractEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
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
