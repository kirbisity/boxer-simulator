// What falls and drifts in the air of a place (src/env/): rain, snow, blown dust, leaves, petals, motes in the sun,
// and the litter on the ground that a gust picks up.
// Each kind (config.js ENV.particles) is one instanced mesh filling a box that follows the camera and wraps at its
// faces. Nothing is simulated: where a particle is now is its seed carried by the same wind travel the gusts ride
// (air.js uEnvWindTravel) and by its own fall, so the rain slants and the leaves run with the wind that bends the
// grass, and a drop is at the same place at the same moment of the fight however it is stepped. A kind with a
// `lift` lies on the ground instead and is in the air only while the wind where it lies is strong enough: the gust
// that is seen coming across the grass throws the leaves up as it arrives and lets them down behind it. A share of
// a kind may come only with the gusts (`gusts`): snow thickens as each one crosses, and the snow lying is lifted
// off the ground and off roof ridges by the strong ones. Under what a place says stands over its ground (its
// `cover`: roofs, a vault, a bridge) nothing falls.
//
// The last part of the file is the sunlight through an opening into a dark space (envBuildBeams): the same air,
// seen by the light it scatters where the sun reaches it.

/* global THREE */

import { ENV } from './config.js';
import { ENV_GLSL, envUniforms } from './air.js';
import { ENV_GLSL_MAP } from './terrain.js';
import { envRandom } from './noise.js';

// How each kind is drawn: 'streak' a line along its own velocity, 'dot' a soft round facing the camera, 'flake' a
// small flat thing tumbling. `alpha` its opacity; `glow` true adds its light to the picture (a mote in a sunbeam)
// instead of covering what is behind it; `low` crowds it toward the ground (dust is lifted from it).
const ENV_PARTICLE_DRAWN = {
  rain: { style: 'streak', alpha: 0.42, glow: false, low: false },
  snow: { style: 'streak', alpha: 0.92, glow: false, low: false },
  spindrift: { style: 'dot', alpha: 0.1, glow: false, low: true },
  leaves: { style: 'flake', alpha: 1, glow: false, low: false },
  petals: { style: 'flake', alpha: 1, glow: false, low: false },
  motes: { style: 'dot', alpha: 0.85, glow: true, low: false },
  dust: { style: 'dot', alpha: 0.085, glow: false, low: true },
  litter: { style: 'flake', alpha: 1, glow: false, low: false },
};
const ENV_PARTICLE_STYLES = ['streak', 'dot', 'flake'];

const ENV_PARTICLE_VERTEX = /* glsl */ `
${ENV_GLSL}
${ENV_GLSL_MAP}
// What lies on the ground: the wind (m/s) that stirs it and that has it flying, how high it goes (m), how far it is thrown (m).
uniform vec4 uLift;
// What comes only with the gusts: x the share in the air whatever the wind; y, z the wind at which the rest begin
// to come and are all there (m/s; w 1: as multiples of the mean wind).
uniform vec4 uGusts;
// The box (m).
uniform vec3 uBox;
// x: fall (m/s); y: the share of the wind it rides; z: size (m); w: streak (s).
uniform vec4 uMove;
// x: wander (m); y: opacity; z: world metres a pixel covers at 1 m; w: 1 crowds it toward the ground.
uniform vec4 uDrawn;
uniform vec3 uColours[4];
uniform float uColourCount;
// What stands over the ground: a picture of its top, laid over the place from uRoofBox.xy (m) at uRoofBox.zw
// (1 / m); the top is its texel . uRoofPick + uRoofBase (m).
uniform sampler2D uRoof;
uniform vec4 uRoofBox;
uniform vec4 uRoofPick;
uniform float uRoofBase;
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
  vec3 centre = vec3(cameraPosition.x + uEnvLook.x * uBox.x * 0.3, envMap(cameraPosition.xz).r + uBox.y * 0.5 - 0.4, cameraPosition.z + uEnvLook.y * uBox.z * 0.3);
  vec3 rel = mod(start + travel + stray - centre + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 middle = centre + rel;
  vec3 edge = abs(rel) / uBox * 2.0;
  float fade = (1.0 - smoothstep(0.8, 1.0, max(edge.x, edge.z))) * (1.0 - smoothstep(0.85, 1.0, edge.y));
  vec2 roofAt = (middle.xz - uRoofBox.xy) * uRoofBox.zw;
  float top = roofAt == clamp(roofAt, 0.0, 1.0) ? dot(texture2D(uRoof, roofAt), uRoofPick) + uRoofBase : -1e3;
  if (uDrawn.w > 0.5) {
    // What the wind lifts keeps near what it lay on (the ground, a roof's ridge, a wall's top), rising and settling as it strays.
    middle.y = max(envMap(middle.xz).r, top) + start.y * (0.6 + 0.4 * sin(uEnvTime * (0.3 + 0.4 * r2) + r * 50.0));
    fade = 1.0 - smoothstep(0.8, 1.0, max(edge.x, edge.z));
  } else {
    // Nothing falls through a roof.
    fade *= smoothstep(-0.3, 0.0, middle.y - top);
  }
  float aloft = 1.0;
#if LIFT == 1
  // Lying where the wind has crept it to, until the air there is fast enough for a thing of its weight: then up
  // and downwind with the gust, and down again as it passes.
  rel.xz = mod(start.xz + travel.xz - centre.xz + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5;
  middle.xz = centre.xz + rel.xz;
  aloft = smoothstep(uLift.x, uLift.y, envGust(middle.xz) * (0.7 + 0.6 * r));
  middle.xz += uEnvWind.xy * uLift.w * aloft * (0.4 + r2) + stray.xz * aloft;
  middle.y = envMap(middle.xz).r + 0.02 + uLift.z * aloft * r3 * (1.0 + 0.3 * stray.y);
  edge = abs(rel) / uBox * 2.0;
  fade = (1.0 - smoothstep(0.8, 1.0, max(edge.x, edge.z))) * envInMap(middle.xz);
#endif

  vec3 toEye = cameraPosition - middle;
  float away = length(toEye);
  toEye /= max(away, 1e-3);
  // Nothing is drawn thinner than a pixel and a bit: it is drawn that wide and as much fainter.
  float least = away * uDrawn.z * 1.3;
  float size = max(uMove.z, least);
  float alpha = uDrawn.y * fade * min(1.0, uMove.z / least) * smoothstep(0.25, 0.9, away);
  float local = envGust(middle.xz);
  // The share of it the gusts bring is there only where the wind is that strong: a curtain crossing with the gust.
  float needs = mix(uGusts.y, uGusts.z, clamp((r - uGusts.x) / max(1.0 - uGusts.x, 1e-3), 0.0, 1.0));
  alpha *= r < uGusts.x ? 1.0 : smoothstep(0.85, 1.0, local / mix(1.0, max(uEnvWind.z, 0.05), uGusts.w) / max(needs, 1e-3));
  vec3 world;
  float facing = 1.0;
#if STYLE == 0
  // A drop over the exposure: a line along its velocity, the wind's where it is.
  vec3 velocity = vec3(uEnvWind.x * local * uMove.y, -uMove.x, uEnvWind.y * local * uMove.y);
  vec3 across = normalize(cross(velocity, toEye));
  // (As long as it travels in the exposure, and its own size.)
  world = middle + (velocity * uMove.w + normalize(velocity) * size) * aCorner.y * 0.5 + across * aCorner.x * size * 0.5;
#elif STYLE == 1
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  world = middle + (right * aCorner.x + up * aCorner.y) * size * 0.5;
#else
  // Tumbling about its own axis, faster in faster air.
  float spin = uEnvTime * (1.5 + 3.0 * r2) * (0.5 + 0.2 * local) + r * 50.0;
#if LIFT == 1
  // Flat on the ground at rest, turning over as it rises and falls.
  spin = aloft * (5.0 + 14.0 * r2);
#endif
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
 * group.userData.envKinds[kind]. `map` the near map's uniform (what lies on the ground lies on its ground); `cover`
 * a description's own (config.js: what stands over the ground), or nothing.
 */
export function envBuildParticles(map, cover = null) {
  // The roof picture: the place's own, or its `at` sampled here, or none (one texel far below everything).
  let roof = cover?.texture;
  const pick = [0, 0, 0, 0];
  pick[cover?.channel ?? 0] = cover?.texture ? cover.scale ?? 1 : 1;
  if (!roof) {
    const [across, deep] = cover ? cover.size.map((side) => Math.max(1, Math.round(side / cover.texel))) : [1, 1];
    const tops = new Uint16Array(across * deep * 4);
    for (let at = 0; at < across * deep; at += 1) {
      tops[at * 4] = THREE.DataUtils.toHalfFloat(cover ? cover.at(cover.min[0] + (((at % across) + 0.5) / across) * cover.size[0], cover.min[1] + ((Math.floor(at / across) + 0.5) / deep) * cover.size[1]) : -1e3);
    }
    roof = new THREE.DataTexture(tops, across, deep, THREE.RGBAFormat, THREE.HalfFloatType);
    // (Nearest: a roof's edge is a step, and a point between eave and ground is not half way up.)
    roof.needsUpdate = true;
  }
  const roofUniforms = {
    uRoof: { value: roof },
    uRoofBox: { value: cover ? new THREE.Vector4(cover.min[0], cover.min[1], 1 / cover.size[0], 1 / cover.size[1]) : new THREE.Vector4(0, 0, 1, 1) },
    uRoofPick: { value: new THREE.Vector4(...pick) },
    uRoofBase: { value: cover?.texture ? cover.base ?? 0 : 0 },
  };
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
      defines: { STYLE: ENV_PARTICLE_STYLES.indexOf(drawn.style), GLOW: drawn.glow ? 1 : 0, SOFT: drawn.low ? '0.0' : '0.35', LIFT: spec.lift ? 1 : 0 },
      uniforms: {
        ...envUniforms(),
        uEnvMap: map,
        uEnvCover: map.cover,
        ...roofUniforms,
        uLift: { value: new THREE.Vector4(...(spec.lift ?? [0, 0, 0, 0])) },
        uGusts: { value: new THREE.Vector4(...(spec.gusts ?? [1, 0, 0]), spec.ofMean ? 1 : 0) },
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
  // Where snow lies the wind lifts it.
  if (weather.snow > 0.3) wanted.spindrift ??= { share: weather.snow, colours: [0xffffff] };
  for (const [kind, mesh] of Object.entries(group.userData.envKinds)) {
    const want = wanted[kind];
    mesh.visible = !!want;
    if (!want) continue;
    mesh.userData.envCount = Math.max(1, Math.floor(ENV.particles[kind].count * Math.min(1, want.share) * share));
    mesh.geometry.instanceCount = mesh.userData.envCount;
    const u = mesh.material.uniforms;
    want.colours.slice(0, 4).forEach((colour, index) => u.uColours.value[index].set(colour));
    u.uColourCount.value = Math.min(4, want.colours.length);
  }
}

/** How much of what the weather lets fall is falling now (0..1 of `kind`'s count: a shower passing, index.js envUpdate). */
export function envParticlesFalling(group, kind, share) {
  const mesh = group.userData.envKinds[kind];
  if (mesh?.visible) mesh.geometry.instanceCount = Math.floor(mesh.userData.envCount * Math.min(1, Math.max(0, share)));
}

/** Tell the particles how big a pixel is (world metres at 1 m): `fovY` rad of the camera, `height` px of the picture. */
export function envParticlesPixel(group, fovY, height) {
  const pixel = (2 * Math.tan(fovY / 2)) / Math.max(1, height);
  for (const mesh of group.children) mesh.material.uniforms.uDrawn.value.z = pixel;
}

// ---- sunlight through an opening -------------------------------------------------------------------------------------

const ENV_BEAM_VERTEX = /* glsl */ `
uniform vec3 uAt;
uniform mat3 uEdges;
varying vec3 vWorld;
void main() {
  vWorld = uAt + uEdges * position;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

// The lit air is the opening carried down the sun's ray: a slanted box. A sight line's length inside it is found
// exactly (the box is a unit cube in its own three measures), cut where the light has landed on the floor.
const ENV_BEAM_FRAGMENT = /* glsl */ `
${ENV_GLSL}
uniform vec3 uAt;
// World to the box's own measures: 0..1 along the opening's two edges and down the ray.
uniform mat3 uInto;
// x: the floor the light lands on (m); y: the dust of the air inside, extinction per metre.
uniform vec2 uAir;
varying vec3 vWorld;
void main() {
  vec3 ray = normalize(vWorld - cameraPosition);
  vec3 from = uInto * (cameraPosition - uAt);
  vec3 way = uInto * ray;
  way += step(abs(way), vec3(1e-6)) * 1e-6;
  vec3 a = -from / way;
  vec3 b = (1.0 - from) / way;
  vec3 lo = min(a, b);
  vec3 hi = max(a, b);
  float enter = max(max(lo.x, lo.y), max(lo.z, 0.0));
  float leave = min(min(hi.x, hi.y), hi.z);
  if (ray.y < 0.0) leave = min(leave, (uAir.x - cameraPosition.y) / ray.y);
  if (leave <= enter) discard;
  vec3 mid = cameraPosition + ray * (enter + leave) * 0.5;
  // What the light is seen in: the weather's haze (and what falls: index.js thickens it) and the place's dust,
  // which is never even: it hangs in drifts that move with the air.
  float drifts = 0.6 + 0.8 * texture2D(uEnvNoise, (mid.xz + mid.y * 0.6 - uEnvWindTravel * 0.15) / 11.0).a;
  float lit = 1.0 - exp(-(uEnvRayleigh.w * exp(-max(mid.y, 0.0) * uEnvHaze.w) + uAir.y * drifts) * (leave - enter));
  // Thrown forward: brighter looking up the beam toward the sun, dimmer down it.
  float lobe = min(pow(${(1 + ENV.air.hazeForward ** 2).toFixed(4)} / (${(1 + ENV.air.hazeForward ** 2).toFixed(4)} - ${(2 * ENV.air.hazeForward).toFixed(4)} * dot(ray, uEnvSunDir)), 1.5), ${ENV.beams.most.toFixed(1)});
  vec3 colour = uEnvSunColour * envSunShare(uAt) * ${ENV.beams.side.toFixed(2)} * lobe * lit;
  vec3 gone = exp(-(uEnvRayleigh.rgb + uEnvHaze.rgb * envHazeColumn(max(cameraPosition.y, 0.0), max(mid.y, 0.0))) * enter);
  gl_FragColor = vec4(colour * gone, 1.0);
  #include <tonemapping_fragment>
}`;

/**
 * The beams of a place: one slanted box of lit air per opening the sun passes (config.js `openings`), `sun` the
 * unit way to it. An opening the sun does not pass the way of its a x b makes none.
 */
export function envBuildBeams(openings, sun) {
  const group = new THREE.Group();
  group.userData.env = 'beams';
  const down = new THREE.Vector3(-sun[0], -sun[1], -sun[2]);
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);
  for (const opening of openings) {
    const a = new THREE.Vector3(...opening.a);
    const b = new THREE.Vector3(...opening.b);
    if (a.clone().cross(b).dot(down) <= 0) continue;
    const floor = opening.floor ?? 0;
    // As far as the light goes before all of it has landed.
    const length = Math.min(ENV.beams.reach, (opening.at[1] + Math.max(0, a.y) + Math.max(0, b.y) - floor) / Math.max(sun[1], 0.05));
    const c = down.clone().multiplyScalar(length);
    const edges = new THREE.Matrix3().set(a.x, b.x, c.x, a.y, b.y, c.y, a.z, b.z, c.z);
    const mesh = new THREE.Mesh(box, new THREE.ShaderMaterial({
      vertexShader: ENV_BEAM_VERTEX,
      fragmentShader: ENV_BEAM_FRAGMENT,
      uniforms: {
        ...envUniforms(),
        uAt: { value: new THREE.Vector3(...opening.at) },
        uEdges: { value: edges },
        uInto: { value: edges.clone().invert() },
        uAir: { value: new THREE.Vector2(floor, opening.dust ?? ENV.beams.dust) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }));
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    group.add(mesh);
  }
  return group;
}

let envBeamEye = null;

/**
 * Once a frame, `eye` the camera's place: a beam seen from outside is drawn by its near faces, behind whatever
 * stands before it; with the eye inside it (or within `margin` m of it) there are none, and its far faces draw it.
 */
export function envBeamsLook(group, eye, margin = 0.4) {
  envBeamEye ??= new THREE.Vector3();
  for (const mesh of group.children) {
    const u = mesh.material.uniforms;
    envBeamEye.copy(eye).sub(u.uAt.value).applyMatrix3(u.uInto.value);
    const e = u.uEdges.value.elements;
    const inside = [0, 1, 2].every((axis) => {
      const slack = margin / Math.hypot(e[axis * 3], e[axis * 3 + 1], e[axis * 3 + 2]);
      const at = envBeamEye.getComponent(axis);
      return at > -slack && at < 1 + slack;
    });
    mesh.material.side = inside ? THREE.BackSide : THREE.FrontSide;
    mesh.material.depthTest = !inside;
  }
}
