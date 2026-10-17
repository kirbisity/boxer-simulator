// The quality-physical look: the high-quality tier. Physically-based
// materials (MeshPhysicalMaterial: lacquer under a clearcoat, polished steel
// with a worn roughness, cloth and skin with a sheen), an analytic sky of
// our own baked once to a PMREM (HDR sun) that both lights and is reflected,
// ACES tone mapping, big soft shadows. No outlines.

import { defineLook, own, OUTPUT_ENCODING, replaceEnvironment, setRenderer, setShadowMapSize, SHADOW_MAP, stateOf, TONE_MAPPING, hidePaintedSky } from './kit.js';

/* global THREE */

const QUALITY_PHYSICAL_ID = 'quality-physical';

/** Tunables. */
export const QUALITY_PHYSICAL_TUNE = {
  exposure: 0.95,
  sunBoost: 2.7,
  hemi: 0.12,
  keyBoost: 1.6,
  envIntensity: 1.0,
  sunShadowSize: 4096,
  keyShadowSize: 2048,
};

// How each place is lit: mode 'sky' (daylight), 'night' or 'room' (an interior).
const QUALITY_PHYSICAL_PLACES = {
  ring: { mode: 'room', tint: [1.0, 0.97, 0.92], exposure: 1.0 },
  stadium: { mode: 'room', tint: [1.0, 0.98, 0.95], exposure: 1.0 },
  subway: { mode: 'room', tint: [0.85, 1.0, 0.9], exposure: 1.1 },
  port: { mode: 'night', tint: [0.6, 0.7, 1.0], exposure: 1.1 },
};

const QUALITY_PHYSICAL_SKY_FRAGMENT = `
uniform vec3 uSun;
uniform float uSunPower;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uTint;
uniform float uMode;
varying vec3 vDir;

float qpBox(vec3 d, vec3 c, vec2 extent) {
  vec3 up = abs(c.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 u = normalize(cross(up, c));
  vec3 v = cross(c, u);
  float f = dot(d, c);
  if (f < 0.2) return 0.0;
  vec2 p = vec2(dot(d, u), dot(d, v)) / f;
  vec2 e = smoothstep(extent, extent * 0.6, abs(p));
  return e.x * e.y;
}

vec3 qpSky(vec3 d) {
  float h = d.y;
  float up = clamp(h, 0.0, 1.0);
  vec3 sky = mix(uHorizon, uZenith, pow(up, 0.42));
  float mu = max(dot(d, uSun), 0.0);
  // aerial haze and Mie forward scattering, warm toward the sun, thicker low down
  vec3 warm = vec3(1.0, 0.78, 0.55);
  sky += warm * (pow(mu, 6.0) * 0.18 + pow(mu, 40.0) * 0.55) * (1.0 - 0.6 * up) * uSunPower * 0.35;
  sky += warm * pow(mu, 900.0) * 28.0 * uSunPower;
  sky *= 1.0 + 0.6 * pow(mu, 3.0) * (1.0 - up) * uSunPower * 0.3;
  vec3 ground = uGround * (0.55 + 0.45 * smoothstep(-0.8, 0.0, h));
  ground = mix(uHorizon * 0.7, ground, smoothstep(0.0, -0.18, h));
  return h >= 0.0 ? sky : ground;
}

vec3 qpRoom(vec3 d) {
  float h = d.y;
  vec3 wall = mix(vec3(0.05, 0.055, 0.065), vec3(0.16, 0.17, 0.19), smoothstep(-0.2, 0.7, h));
  vec3 floorC = vec3(0.03, 0.03, 0.035) + vec3(0.04) * smoothstep(-0.2, -0.9, h);
  vec3 c = h > 0.0 ? wall : mix(wall * 0.5, floorC, smoothstep(0.0, -0.4, h));
  c += uTint * qpBox(d, vec3(0.0, 1.0, 0.0), vec2(0.7, 0.5)) * 14.0;
  c += uTint * qpBox(d, normalize(vec3(0.85, 0.35, 0.3)), vec2(0.25, 0.7)) * 6.0;
  c += uTint * qpBox(d, normalize(vec3(-0.8, 0.3, -0.5)), vec2(0.22, 0.6)) * 4.0;
  c += uTint * qpBox(d, normalize(vec3(-0.2, 0.25, 0.95)), vec2(0.5, 0.2)) * 3.0;
  return c;
}

vec3 qpNight(vec3 d) {
  float h = d.y;
  vec3 c = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
  float mu = max(dot(d, uSun), 0.0);
  c += uTint * (pow(mu, 30.0) * 0.5 + pow(mu, 2200.0) * 40.0);
  return h < 0.0 ? mix(c, uGround, smoothstep(0.0, -0.2, h)) : c;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 c = uMode < 0.5 ? qpSky(d) : (uMode < 1.5 ? qpNight(d) : qpRoom(d));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
}`;

const QUALITY_PHYSICAL_SKY_VERTEX = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

function qualityPhysicalSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: new THREE.Vector3(0.4, 0.7, 0.4).normalize() },
      uSunPower: { value: 1 },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uMode: { value: 0 },
    },
    vertexShader: QUALITY_PHYSICAL_SKY_VERTEX,
    fragmentShader: QUALITY_PHYSICAL_SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
}

const qualityPhysicalLin = (r, g, b) => new THREE.Color(r, g, b);

function qualityPhysicalSetSky(material, mode, sunDir, tint) {
  const u = material.uniforms;
  u.uSun.value.copy(sunDir);
  u.uTint.value.setRGB(...tint);
  if (mode === 'night') {
    u.uMode.value = 1;
    u.uZenith.value.copy(qualityPhysicalLin(0.004, 0.008, 0.03));
    u.uHorizon.value.copy(qualityPhysicalLin(0.02, 0.035, 0.075));
    u.uGround.value.copy(qualityPhysicalLin(0.008, 0.012, 0.02));
    u.uSunPower.value = 0.4;
  } else if (mode === 'room') {
    u.uMode.value = 2;
  } else {
    u.uMode.value = 0;
    u.uZenith.value.copy(qualityPhysicalLin(0.045, 0.13, 0.42));
    u.uHorizon.value.copy(qualityPhysicalLin(0.52, 0.66, 0.84));
    u.uGround.value.copy(qualityPhysicalLin(0.16, 0.14, 0.11));
    u.uSunPower.value = 1;
  }
}

/** Bake the sky (or room) to a PMREM once; the cache is per mode and sun direction. */
function qualityPhysicalEnvironment(view, state, mode, sunDir, tint) {
  const key = `${mode}|${sunDir.x.toFixed(2)},${sunDir.y.toFixed(2)},${sunDir.z.toFixed(2)}`;
  if (state.envs[key]) return state.envs[key];
  const scene = new THREE.Scene();
  const material = qualityPhysicalSkyMaterial();
  material.depthTest = true;
  material.vertexShader = 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
  material.toneMapped = false;
  qualityPhysicalSetSky(material, mode, sunDir, tint);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(20, 48, 24), material);
  scene.add(dome);
  state.generator ??= new THREE.PMREMGenerator(view.renderer);
  // The sky is baked without tone mapping or encoding, as radiance.
  const target = state.generator.fromScene(scene, 0, 0.1, 50);
  scene.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  state.envs[key] = target;
  return target;
}

const QUALITY_PHYSICAL_ROUGHNESS = `
  float qpN = sin(vQpLocal.y * 160.0 + 3.0 * sin(vQpLocal.x * 37.0 + vQpLocal.z * 23.0)) * 0.5
            + sin(vQpLocal.x * 410.0 + vQpLocal.z * 330.0) * 0.25
            + sin(vQpLocal.y * 23.0 + vQpLocal.x * 41.0) * 0.5;
  roughnessFactor = clamp(roughnessFactor * (1.0 + 0.32 * qpN), 0.05, 1.0);
`;

function qualityPhysicalWornMetal(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vQpLocal;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvQpLocal = transformed;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vQpLocal;').replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${QUALITY_PHYSICAL_ROUGHNESS}`);
  };
  material.customProgramCacheKey = () => 'quality-physical-worn';
}

export const QUALITY_PHYSICAL_LOOK = defineLook({
  id: QUALITY_PHYSICAL_ID,
  label: 'Quality physical',
  blurb: 'Physical materials (clearcoat lacquer, worn steel, sheen cloth), an analytic HDR sky baked to a PMREM, ACES, big soft shadows.',
  style: 'soft',
  linear: true,
  outlines: false,
  renderer: { toneMapping: TONE_MAPPING.aces, toneMappingExposure: QUALITY_PHYSICAL_TUNE.exposure, outputEncoding: OUTPUT_ENCODING.srgb, shadowMapType: SHADOW_MAP.pcfSoft },

  apply(view, place) {
    const state = stateOf(view, QUALITY_PHYSICAL_ID);
    state.envs ??= {};
    const t = QUALITY_PHYSICAL_TUNE;
    const setting = QUALITY_PHYSICAL_PLACES[place] ?? { mode: 'sky', tint: [1, 1, 1], exposure: 1 };
    const { sun, key, rim, hemi } = view.lights;
    const sunDir = sun.position.clone().normalize();
    if (setting.mode !== 'sky') sunDir.set(-0.3, 0.8, 0.5).normalize();
    const env = qualityPhysicalEnvironment(view, state, setting.mode, sunDir, setting.tint);
    view.scene.environment = env.texture;
    replaceEnvironment(view, env.texture);
    setRenderer(view, { toneMappingExposure: t.exposure * setting.exposure });

    // The sky dome, drawn at the far plane and following the camera.
    if (!state.sky) {
      state.sky = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), qualityPhysicalSkyMaterial());
      state.sky.renderOrder = -2;
      state.sky.frustumCulled = false;
      state.sky.onBeforeRender = (renderer, scene, camera) => state.sky.position.copy(camera.position);
      own(view, state.sky);
    }
    hidePaintedSky(view);
    qualityPhysicalSetSky(state.sky.material, setting.mode, sunDir, setting.tint);
    state.sky.visible = setting.mode !== 'room';

    // Fog is the horizon haze: the same colour as the sky meets the ground.
    if (setting.mode === 'sky') view.scene.fog.color.copy(state.sky.material.uniforms.uHorizon.value);
    else if (setting.mode === 'night') view.scene.fog.color.setRGB(0.03, 0.05, 0.1);

    hemi.intensity *= t.hemi;
    key.intensity *= t.keyBoost;
    sun.intensity *= t.sunBoost;
    rim.intensity *= 0.6;
    setShadowMapSize(sun, t.sunShadowSize);
    setShadowMapSize(key, t.keyShadowSize);
    sun.shadow.normalBias = 0.02;
    key.shadow.normalBias = 0.02;
  },

  dispose(view) {
    const state = stateOf(view, QUALITY_PHYSICAL_ID);
    for (const target of Object.values(state.envs ?? {})) target.dispose();
    state.generator?.dispose();
    state.envs = {};
    state.generator = null;
    state.sky = null;
  },

  steel(envMap, options) {
    const lacquer = options.metalness !== undefined && options.metalness < 0.8;
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      metalness: 0.93,
      roughness: 0.3,
      envMap,
      envMapIntensity: QUALITY_PHYSICAL_TUNE.envIntensity,
      clearcoat: lacquer ? 0.9 : 0,
      clearcoatRoughness: 0.06,
      ...options,
    });
    if (lacquer) material.clearcoat = 0.9;
    qualityPhysicalWornMetal(material);
    return material;
  },

  surface(color, { skinning, vertexColors, roughness, opacity }) {
    const material = new THREE.MeshPhysicalMaterial({ color, skinning, vertexColors, roughness, metalness: 0, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    if (roughness <= 0.62) {
      // Skin and tight cloth: a warm sheen standing in for scattering at the terminator, and a thin film of oil or sweat.
      material.sheen = new THREE.Color(0.2, 0.07, 0.045);
      material.clearcoat = 0.12;
      material.clearcoatRoughness = 0.35;
    } else {
      material.sheen = new THREE.Color(0.1, 0.1, 0.1);
    }
    return material;
  },
});
