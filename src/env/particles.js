// What falls and drifts in the air of a place (src/env/): rain, snow, blown dust, leaves, petals, motes in the sun.
// Each kind (config.js ENV.particles) is one instanced mesh filling a box that follows the camera and wraps at its
// faces. Nothing is simulated: where a particle is now is its seed carried by the same wind travel the gusts ride
// (air.js uEnvWindTravel) and by its own fall, so the rain slants and the leaves run with the wind that bends the
// grass, and a drop is at the same place at the same moment of the fight however it is stepped.

/* global THREE */

import { ENV } from './config.js';
import { ENV_GLSL, envUniforms } from './air.js';
import { envRandom } from './noise.js';

// How each kind is drawn: 'streak' a line along its own velocity, 'dot' a soft round facing the camera, 'flake' a
// small flat thing tumbling. `alpha` its opacity; `glow` true adds its light to the picture (a mote in a sunbeam)
// instead of covering what is behind it; `low` crowds it toward the ground (dust is lifted from it).
const ENV_PARTICLE_DRAWN = {
  rain: { style: 'streak', alpha: 0.42, glow: false, low: false },
  snow: { style: 'dot', alpha: 0.92, glow: false, low: false },
  leaves: { style: 'flake', alpha: 1, glow: false, low: false },
  petals: { style: 'flake', alpha: 1, glow: false, low: false },
  motes: { style: 'dot', alpha: 0.85, glow: true, low: false },
  dust: { style: 'dot', alpha: 0.085, glow: false, low: true },
};
const ENV_PARTICLE_STYLES = ['streak', 'dot', 'flake'];

const ENV_PARTICLE_VERTEX = /* glsl */ `
${ENV_GLSL}
// The box (m).
uniform vec3 uBox;
// x: fall (m/s); y: the share of the wind it rides; z: size (m); w: streak (s).
uniform vec4 uMove;
// x: wander (m); y: opacity; z: world metres a pixel covers at 1 m; w: 1 crowds it toward the ground.
uniform vec4 uDrawn;
uniform vec3 uColours[4];
uniform float uColourCount;
attribute vec2 aCorner;
// x, y, z: where in the box (0..1); w: a random number.
attribute vec4 aSeed;
varying vec2 vUv;
varying vec4 vColour;

void main() {
  float r = aSeed.w;
  float r2 = fract(r * 91.7 + aSeed.x * 13.1);
  float r3 = fract(r * 57.3 + aSeed.z * 29.9);
  vec3 start = vec3(aSeed.x, mix(aSeed.y, aSeed.y * aSeed.y, uDrawn.w), aSeed.z) * uBox;
  // Carried by the wind and its own fall, and straying about that path.
  vec3 travel = vec3(uEnvWindTravel.x * uMove.y, -uMove.x * uEnvTime * (0.8 + 0.4 * r2), uEnvWindTravel.y * uMove.y);
  vec3 stray = vec3(sin(uEnvTime * (0.7 + r) + r * 40.0), 0.4 * sin(uEnvTime * (0.5 + r2) + r2 * 30.0), cos(uEnvTime * (0.6 + r2) + r * 20.0)) * uDrawn.x;
  // The box stands on the ground ahead of the camera; a particle leaving one face comes in at the other.
  vec3 centre = vec3(cameraPosition.x + uEnvLook.x * uBox.x * 0.3, uBox.y * 0.5 - 0.4, cameraPosition.z + uEnvLook.y * uBox.z * 0.3);
  vec3 rel = mod(start + travel + stray - centre + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 middle = centre + rel;
  vec3 edge = abs(rel) / uBox * 2.0;
  float fade = (1.0 - smoothstep(0.8, 1.0, max(edge.x, edge.z))) * (1.0 - smoothstep(0.85, 1.0, edge.y));

  vec3 toEye = cameraPosition - middle;
  float away = length(toEye);
  toEye /= max(away, 1e-3);
  // Nothing is drawn thinner than a pixel and a bit: it is drawn that wide and as much fainter.
  float least = away * uDrawn.z * 1.3;
  float size = max(uMove.z, least);
  float alpha = uDrawn.y * fade * min(1.0, uMove.z / least) * smoothstep(0.25, 0.9, away);
  float local = envGust(middle.xz);
  vec3 world;
  float facing = 1.0;
#if STYLE == 0
  // A drop over the exposure: a line along its velocity, the wind's where it is.
  vec3 velocity = vec3(uEnvWind.x * local * uMove.y, -uMove.x, uEnvWind.y * local * uMove.y);
  vec3 across = normalize(cross(velocity, toEye));
  world = middle + velocity * uMove.w * aCorner.y * 0.5 + across * aCorner.x * size * 0.5;
#elif STYLE == 1
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  world = middle + (right * aCorner.x + up * aCorner.y) * size * 0.5;
#else
  // Tumbling about its own axis, faster in faster air.
  float spin = uEnvTime * (1.5 + 3.0 * r2) * (0.5 + 0.2 * local) + r * 50.0;
  float lie = r3 * 6.2831853;
  vec3 axis = normalize(vec3(cos(lie), 0.35 * (r - 0.5), sin(lie)));
  vec3 flat_ = normalize(cross(axis, vec3(0.0, 1.0, 0.0)));
  vec3 other = flat_ * cos(spin) + cross(axis, flat_) * sin(spin);
  world = middle + (axis * aCorner.x + other * aCorner.y * 0.62) * size * 0.5;
  facing = 0.45 + 0.55 * abs(dot(cross(axis, other), uEnvSunDir));
#endif

  // Its light: the sun where the clouds let it through, and the sky.
  float sunShare = envSunShare(middle);
  vec3 light = uEnvSunColour * sunShare * facing + uEnvSkyLight;
  vec3 colour = uColours[int(min(floor(r3 * uColourCount), 3.0))];
#if GLOW == 1
  // A mote is seen by the sunlight it throws forward: bright toward the sun, nothing in shade.
  float toward = max(dot(-toEye, uEnvSunDir), 0.0);
  float twinkle = 0.55 + 0.45 * sin(uEnvTime * (2.0 + 5.0 * r) + r2 * 60.0);
  colour *= uEnvSunColour * sunShare * (0.12 + 1.6 * pow(toward, 5.0)) * twinkle;
  vec3 gone = exp(-(uEnvRayleigh.rgb + uEnvHaze.rgb * envHazeColumn(max(cameraPosition.y, 0.0), max(middle.y, 0.0))) * away);
  vColour = vec4(colour * gone, alpha);
#else
  vColour = vec4(envHaze(colour * light, cameraPosition, middle), alpha);
#endif
  vUv = aCorner;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const ENV_PARTICLE_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying vec4 vColour;
void main() {
#if STYLE == 0
  float cover = (1.0 - abs(vUv.x)) * (1.0 - vUv.y * vUv.y);
#elif STYLE == 1
  float cover = 1.0 - smoothstep(SOFT, 1.0, length(vUv));
#else
  // A leaf's outline: pointed at both ends.
  if (abs(vUv.y) > 1.0 - vUv.x * vUv.x) discard;
  float cover = 1.0;
#endif
  gl_FragColor = vec4(vColour.rgb, vColour.a * cover);
  #include <tonemapping_fragment>
}`;

/**
 * Every kind's mesh, in one group, none drawn until envParticlesSet says how much of each. A kind's mesh is under
 * group.userData.envKinds[kind].
 */
export function envBuildParticles() {
  const group = new THREE.Group();
  group.userData.env = 'particles';
  group.userData.envKinds = {};
  const random = envRandom(90210);
  for (const [kind, spec] of Object.entries(ENV.particles)) {
    const drawn = ENV_PARTICLE_DRAWN[kind];
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    geometry.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const seeds = new Float32Array(spec.count * 4);
    for (let at = 0; at < seeds.length; at += 1) seeds[at] = random();
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geometry.instanceCount = 0;
    const solid = drawn.style === 'flake';
    const material = new THREE.ShaderMaterial({
      vertexShader: ENV_PARTICLE_VERTEX,
      fragmentShader: ENV_PARTICLE_FRAGMENT,
      defines: { STYLE: ENV_PARTICLE_STYLES.indexOf(drawn.style), GLOW: drawn.glow ? 1 : 0, SOFT: drawn.low ? '0.0' : '0.35' },
      uniforms: {
        ...envUniforms(),
        uBox: { value: new THREE.Vector3(...spec.box) },
        uMove: { value: new THREE.Vector4(spec.fall, spec.ride, spec.size, spec.streak) },
        uDrawn: { value: new THREE.Vector4(spec.wander, drawn.alpha, 0.001, drawn.low ? 1 : 0) },
        uColours: { value: [0, 1, 2, 3].map(() => new THREE.Color(0xffffff)) },
        uColourCount: { value: 1 },
      },
      side: THREE.DoubleSide,
      transparent: !solid,
      depthWrite: solid,
      blending: drawn.glow ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    // After the fight's own see-through things (blood, dust, trails): the air is in front of them as often as behind.
    mesh.renderOrder = 6;
    mesh.userData.env = kind;
    group.userData.envKinds[kind] = mesh;
    group.add(mesh);
  }
  return group;
}

/**
 * What is in the air now: `drift` the place's own ([{ kind, share, colours }], its fair-weather air), `weather` an
 * ENV_WEATHER (what falls from it; rain and snow clear the motes and petals out of the air), `share` the quality
 * tier's share of every count.
 */
export function envParticlesSet(group, drift, weather, share) {
  const wanted = {};
  const falling = weather.fall?.kind ?? null;
  if (falling) wanted[falling] = { share: weather.fall.share, colours: weather.fall.colours ?? (weather.tint ? [weather.tint] : [0xffffff]) };
  for (const entry of drift ?? []) {
    // Wet air carries no dust or pollen, and rain beats petals down; leaves still blow.
    if ((falling === 'rain' || falling === 'snow') && entry.kind !== 'leaves') continue;
    wanted[entry.kind] ??= { share: entry.share, colours: entry.colours };
  }
  for (const [kind, mesh] of Object.entries(group.userData.envKinds)) {
    const want = wanted[kind];
    mesh.visible = !!want;
    if (!want) continue;
    mesh.geometry.instanceCount = Math.max(1, Math.floor(ENV.particles[kind].count * Math.min(1, want.share) * share));
    const u = mesh.material.uniforms;
    want.colours.slice(0, 4).forEach((colour, index) => u.uColours.value[index].set(colour));
    u.uColourCount.value = Math.min(4, want.colours.length);
  }
}

/** Tell the particles how big a pixel is (world metres at 1 m): `fovY` rad of the camera, `height` px of the picture. */
export function envParticlesPixel(group, fovY, height) {
  const pixel = (2 * Math.tan(fovY / 2)) / Math.max(1, height);
  for (const mesh of group.children) mesh.material.uniforms.uDrawn.value.z = pixel;
}
