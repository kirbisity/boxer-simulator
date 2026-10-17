// Physical sky, image-based lighting, forward rendering.
//
// Open-air places get an analytic sky (a small Preetham-style shader, no
// download): the sun's elevation, the turbidity and the haze set a blue
// zenith, a pale hazy horizon, a warm glow round an HDR sun disc, and a
// ground below. That sky is drawn once into a half-float cube and prefiltered
// by PMREMGenerator (once per place, kept), and the result lights everything:
// scene.environment (soft sky light and shadow fill for skin and cloth) and
// the steel's reflection map (blue overhead, bright horizon, darker ground,
// the sun's glint). The visible background is the same shader on a dome that
// is pinned to the camera (it has no radius, so the pale disc of the painted
// dome against the far plane cannot appear). The sun light follows the sky's
// sun; the fog is the sky's horizon colour, so distance fades into the haze.
// Halls, the quay and the stadium have no sky: a dark studio environment of a
// few bright softboxes and lamps is baked into the cube instead, so metal
// shows crisp panel reflections there too.
// ACES tone mapping and sRGB output through the linear pipeline; MeshStandard
// everywhere; skin and cloth get a little wrapped diffuse with a warm
// terminator (a cheap stand-in for subsurface); no outlines.

/* global THREE */
import { defineLook, hidePaintedSky, linearColour, OUTPUT_ENCODING, own, replaceEnvironment, setRenderer, stateOf, TONE_MAPPING } from './kit.js';

const PHYSICAL_SKY_ID = 'physical-sky';

/**
 * The tunables. A sky preset: sun `elevation` and `azimuth` (degrees; azimuth
 * is the direction the sun is in on the ground plane, 0 along +x, 90 along
 * +z), `turbidity` (haze, 2 clear to 10 murky), `rayleigh` (blue strength),
 * `mie` (haze glow), `miePower` (g of the forward scattering), `exposure` of the
 * sky radiance, `sun` (the directional light's intensity), `ground` (linear
 * radiance of the ground below the horizon), `fog` (display colour at distance),
 * `toneExposure` (renderer exposure).
 */
const PHYSICAL_SKY_DAY = {
  base: { elevation: 46, azimuth: 34, turbidity: 3, rayleigh: 1.2, mie: 0.004, miePower: 0.8, exposure: 1.2, sun: 2.0, sunColour: 0xfff1dc, ground: [0.2, 0.19, 0.16], fog: 0xbcd0e6, toneExposure: 0.55 },
  colosseum: { elevation: 52, azimuth: 40, ground: [0.26, 0.21, 0.15] },
  meadow: { elevation: 50, ground: [0.1, 0.16, 0.07] },
  town: { elevation: 62, turbidity: 3.5 },
  sengoku: { elevation: 40, azimuth: 20, turbidity: 3, sunColour: 0xffe2c0, ground: [0.17, 0.14, 0.08] },
  plain: { elevation: 66, turbidity: 2.2, ground: [0.27, 0.21, 0.14] },
  field: { elevation: 38, azimuth: 30, turbidity: 3, ground: [0.14, 0.15, 0.08] },
  coastFort: { elevation: 54, turbidity: 4, ground: [0.2, 0.19, 0.15] },
  coastVillage: { elevation: 54, turbidity: 4, ground: [0.2, 0.19, 0.15] },
};

/** A studio: floor and ceiling radiance, and lamps `[direction x, y, z, width, height, [r, g, b] radiance]`. */
const PHYSICAL_SKY_ROOMS = {
  ring: { floor: [0.015, 0.016, 0.02], ceiling: [0.05, 0.05, 0.06], lamps: [[0, 1, 0.15, 7, 5, [26, 24, 21]], [-1, 0.35, 0.2, 2, 6, [5, 6, 9]], [0.9, 0.3, -0.7, 2, 5, [8, 6.5, 5]], [0.2, 0.2, -1, 8, 1.2, [3, 3.5, 5]]], expose: 0.9 },
  subway: { floor: [0.01, 0.014, 0.011], ceiling: [0.03, 0.04, 0.034], lamps: [[0, 1, 0, 14, 0.8, [14, 17, 13]], [0.5, 0.95, 0.5, 14, 0.8, [10, 13, 9]], [-1, 0.2, 0, 1.5, 4, [2, 3, 3]]], expose: 1 },
  stadium: { floor: [0.008, 0.008, 0.01], ceiling: [0.015, 0.016, 0.02], lamps: [[0.3, 1, 0.3, 3, 3, [60, 58, 52]], [-0.4, 1, 0.3, 3, 3, [50, 50, 48]], [0.1, 1, -0.5, 3, 3, [50, 48, 45]], [-1, 0.3, 0, 2, 6, [3, 4, 8]]], expose: 0.8 },
  port: { floor: [0.004, 0.006, 0.01], ceiling: [0.012, 0.02, 0.045], lamps: [[-0.3, 0.8, -0.6, 1.2, 1.2, [14, 18, 30]], [1, 0.25, 0.4, 1, 1, [24, 14, 6]], [0.1, 0.3, 1, 1, 1, [22, 13, 6]], [-1, 0.3, 0.5, 1, 1, [20, 12, 6]]], expose: 1 },
};

const PHYSICAL_SKY_SKY_VERTEX = `
varying vec3 vSkyDirection;
void main() {
  vSkyDirection = position;
  vec4 clip = projectionMatrix * ( viewMatrix * vec4( position, 0.0 ) );
  gl_Position = vec4( clip.xy, clip.w, clip.w );
}`;

const PHYSICAL_SKY_SKY_FRAGMENT = `
uniform vec3 uSunDirection;
uniform vec3 uBetaR;
uniform vec3 uBetaM;
uniform float uSunE;
uniform float uSunFade;
uniform float uMieG;
uniform float uExposure;
uniform vec3 uGround;
uniform vec3 uSunTint;
uniform float uSunLuminance;
uniform float uSunSize;
uniform float uGlow;
varying vec3 vSkyDirection;
void main() {
  vec3 direction = normalize( vSkyDirection );
  float cosTheta = dot( direction, uSunDirection );
  float zenith = acos( clamp( max( direction.y, 0.012 ), 0.0, 1.0 ) );
  float inverse = 1.0 / ( cos( zenith ) + 0.15 * pow( 93.885 - degrees( zenith ), -1.253 ) );
  vec3 extinction = exp( -( uBetaR * ( 8.4e3 * inverse ) + uBetaM * ( 1.25e3 * inverse ) ) );
  float rayleighPhase = 0.05968310366 * ( 1.0 + pow( cosTheta * 0.5 + 0.5, 2.0 ) );
  float g2 = uMieG * uMieG;
  float miePhase = 0.07957747155 * ( ( 1.0 - g2 ) / pow( 1.0 - 2.0 * uMieG * cosTheta + g2, 1.5 ) );
  vec3 scatter = uSunE * ( ( uBetaR * rayleighPhase + uBetaM * miePhase ) / ( uBetaR + uBetaM ) );
  vec3 inscatter = pow( scatter * ( 1.0 - extinction ), vec3( 1.5 ) );
  inscatter *= mix( vec3( 1.0 ), pow( scatter * extinction, vec3( 0.5 ) ), clamp( pow( 1.0 - uSunDirection.y, 5.0 ), 0.0, 1.0 ) );
  vec3 display = ( inscatter + vec3( 0.1 ) * extinction ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
  display = pow( display, vec3( 1.0 / ( 1.2 + 1.2 * uSunFade ) ) );
  vec3 sky = pow( display, vec3( 2.2 ) ) * uExposure;
  // The sun: a disc of high radiance, a tight and a wide glow, all tinted by the air in between.
  float away = 1.0 - cosTheta;
  float disc = 1.0 - smoothstep( uSunSize * 0.7, uSunSize * 1.3, away );
  float glow = exp( -away * 90.0 ) * 0.5 + exp( -away * 700.0 ) * 3.0;
  sky += uSunTint * extinction * ( disc * uSunLuminance + glow * uGlow );
  // Below the horizon: the ground, hazed to the horizon's own colour where they meet.
  float below = smoothstep( -0.02, -0.5, direction.y );
  sky = mix( sky, uGround, below );
  gl_FragColor = vec4( sky, 1.0 );
  #include <tonemapping_fragment>
  #include <encodings_fragment>
}`;

const PHYSICAL_SKY_STUDIO_VERTEX = `
varying vec3 vStudioDirection;
void main() {
  vStudioDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

const PHYSICAL_SKY_STUDIO_FRAGMENT = `
uniform vec3 uFloor;
uniform vec3 uCeiling;
varying vec3 vStudioDirection;
void main() {
  float up = normalize( vStudioDirection ).y;
  vec3 wall = mix( uFloor, uCeiling, smoothstep( -0.6, 0.9, up ) );
  // a faint band at the horizon, where the far wall catches light
  wall += ( uCeiling + uFloor ) * 0.8 * exp( -25.0 * up * up );
  gl_FragColor = vec4( wall, 1.0 );
  #include <encodings_fragment>
}`;

const physicalSkyDegrees = Math.PI / 180;

function physicalSkySpec(place) {
  const tuned = globalThis.__physicalSkyTune;
  return { ...PHYSICAL_SKY_DAY.base, ...(PHYSICAL_SKY_DAY[place] ?? {}), ...(tuned?.all ?? {}), ...(tuned?.[place] ?? {}) };
}

function physicalSkyUniforms(spec, { sunLuminance, sunSize, glow }) {
  const sun = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - spec.elevation * physicalSkyDegrees, 0);
  const azimuth = spec.azimuth * physicalSkyDegrees;
  const horizontal = Math.hypot(sun.x, sun.z);
  sun.set(Math.cos(azimuth) * horizontal, sun.y, Math.sin(azimuth) * horizontal);
  const wavelengths = [680e-9, 550e-9, 450e-9];
  const rayleighTotal = wavelengths.map((lambda) => (8 * Math.PI ** 3 * (1.0003 ** 2 - 1) ** 2 * (6 + 3 * 0.035)) / (3 * 2.545e25 * lambda ** 4 * (6 - 7 * 0.035)));
  const mieConst = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
  const mieTotal = mieConst.map((value) => 0.434 * (0.2 * spec.turbidity * 1e-17) * value);
  const sunE = 1000 * Math.max(0, 1 - Math.exp(-((1.6110731556870734 - Math.acos(sun.y)) / 1.5)));
  return {
    uSunDirection: { value: sun },
    uBetaR: { value: new THREE.Vector3(...rayleighTotal).multiplyScalar(spec.rayleigh) },
    uBetaM: { value: new THREE.Vector3(...mieTotal).multiplyScalar(spec.mie) },
    uSunE: { value: sunE },
    uSunFade: { value: 1 - Math.min(1, Math.max(0, 1 - Math.exp(sun.y * (400000 / 450000)))) },
    uMieG: { value: spec.miePower },
    uExposure: { value: spec.exposure },
    uGround: { value: new THREE.Vector3(...spec.ground) },
    uSunTint: { value: linearColour(spec.sunColour) },
    uSunLuminance: { value: sunLuminance },
    uSunSize: { value: sunSize },
    uGlow: { value: glow },
  };
}

function physicalSkyMaterial(spec, quality) {
  return new THREE.ShaderMaterial({
    uniforms: physicalSkyUniforms(spec, quality),
    vertexShader: PHYSICAL_SKY_SKY_VERTEX,
    fragmentShader: PHYSICAL_SKY_SKY_FRAGMENT,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
  });
}

// What the dome shows (a hard disc and its glow) and what the steel and the skin see of it (a softer, much larger and dimmer spot: the sun light does the glint).
const PHYSICAL_SKY_SEEN = { sunLuminance: 4000, sunSize: 3.2e-5, glow: 1 };
const PHYSICAL_SKY_PROBED = { sunLuminance: 60, sunSize: 6e-4, glow: 0.6 };

function physicalSkyDome(material) {
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), material);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  return dome;
}

function physicalSkyRoomScene(room) {
  const scene = new THREE.Scene();
  const walls = new THREE.Mesh(
    new THREE.SphereGeometry(40, 24, 12),
    new THREE.ShaderMaterial({ uniforms: { uFloor: { value: new THREE.Vector3(...room.floor) }, uCeiling: { value: new THREE.Vector3(...room.ceiling) } }, vertexShader: PHYSICAL_SKY_STUDIO_VERTEX, fragmentShader: PHYSICAL_SKY_STUDIO_FRAGMENT, side: THREE.BackSide }),
  );
  scene.add(walls);
  for (const [x, y, z, width, height, radiance] of room.lamps) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ color: new THREE.Color(...radiance), side: THREE.DoubleSide }));
    const direction = new THREE.Vector3(x, y, z).normalize();
    panel.position.copy(direction).multiplyScalar(14);
    panel.lookAt(0, 0, 0);
    scene.add(panel);
  }
  return scene;
}

function physicalSkyRelease(scene) {
  scene.traverse((object) => {
    object.geometry?.dispose?.();
    for (const material of [].concat(object.material ?? [])) material.dispose?.();
  });
}

/** The prefiltered environment of a place, built once and kept for the life of the look in the view. */
function physicalSkyEnvironment(view, place) {
  const state = stateOf(view, PHYSICAL_SKY_ID);
  const environments = state.environments ?? (state.environments = {});
  const open = place in PHYSICAL_SKY_DAY;
  const key = (open ? place : PHYSICAL_SKY_ROOMS[place] ? place : 'ring') + (globalThis.__physicalSkyTune ? JSON.stringify(globalThis.__physicalSkyTune) : '');
  if (environments[key]) return environments[key];
  const generator = new THREE.PMREMGenerator(view.renderer);
  let source;
  if (open) {
    source = new THREE.Scene();
    source.add(physicalSkyDome(physicalSkyMaterial(physicalSkySpec(place), PHYSICAL_SKY_PROBED)));
  } else source = physicalSkyRoomScene(PHYSICAL_SKY_ROOMS[PHYSICAL_SKY_ROOMS[place] ? place : 'ring']);
  const target = generator.fromScene(source, 0, 0.1, 100);
  generator.dispose();
  physicalSkyRelease(source);
  environments[key] = target;
  return target;
}

// A little wrapped diffuse with a warm, saturated terminator, standing in for the light that skin scatters round the edge of a shadow.
const PHYSICAL_SKY_DIRECT_DIFFUSE = 'reflectedLight.directDiffuse += irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );';
const PHYSICAL_SKY_WRAPPED_DIFFUSE = `{
  float wrapped = saturate( ( dot( geometry.normal, directLight.direction ) + 0.3 ) / 1.3 );
  vec3 lit = vec3( dotNL ) + ( wrapped - dotNL ) * vec3( 1.18, 0.62, 0.46 );
  reflectedLight.directDiffuse += directLight.color * lit * material.diffuseColor;
}`;

function physicalSkySubsurface(shader) {
  const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
  if (!chunk.includes(PHYSICAL_SKY_DIRECT_DIFFUSE)) return;
  shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', chunk.replace(PHYSICAL_SKY_DIRECT_DIFFUSE, PHYSICAL_SKY_WRAPPED_DIFFUSE));
}

function physicalSkySurface(color, { skinning, vertexColors, roughness, opacity }) {
  const material = new THREE.MeshStandardMaterial({ color, skinning, vertexColors, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, roughness: Math.max(roughness, 0.5), metalness: 0 });
  material.onBeforeCompile = physicalSkySubsurface;
  material.customProgramCacheKey = () => 'physicalSkyWrapped';
  return material;
}

function physicalSkySteel(envMap, options) {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, metalness: 0.95, roughness: 0.22, envMap, envMapIntensity: 1.25, ...options });
}

function physicalSkyApply(view, place) {
  const state = stateOf(view, PHYSICAL_SKY_ID);
  const open = place in PHYSICAL_SKY_DAY;
  const spec = open ? physicalSkySpec(place) : null;
  const room = open ? null : PHYSICAL_SKY_ROOMS[place] ?? PHYSICAL_SKY_ROOMS.ring;
  const environment = physicalSkyEnvironment(view, place);
  view.scene.environment = environment.texture;
  replaceEnvironment(view, environment.texture);
  setRenderer(view, { toneMapping: TONE_MAPPING.aces, outputEncoding: OUTPUT_ENCODING.srgb, toneMappingExposure: spec?.toneExposure ?? room.expose });

  if (!state.dome) state.dome = own(view, physicalSkyDome(physicalSkyMaterial(physicalSkySpec('colosseum'), PHYSICAL_SKY_SEEN)));
  state.dome.visible = open;
  if (!open) return;

  view.places[place]?.traverse((object) => { if (object.userData.paintedSky) object.visible = false; });
  state.dome.material.dispose();
  state.dome.material = physicalSkyMaterial(spec, PHYSICAL_SKY_SEEN);
  const sky = state.dome.material.uniforms;
  const fogColour = new THREE.Color(spec.fog);
  view.scene.background = fogColour;
  const fog = view.scene.fog;
  fog.color.copy(fogColour);
  const { sun, key, rim, hemi } = view.lights;
  sun.color.copy(linearColour(spec.sunColour));
  sun.intensity = spec.sun;
  sun.position.copy(sky.uSunDirection.value).multiplyScalar(14);
  sun.shadow.normalBias = 0.02;
  key.intensity = 0;
  rim.intensity = 0;
  hemi.intensity = 0;
}

export const PHYSICAL_SKY_LOOK = defineLook({
  id: PHYSICAL_SKY_ID,
  label: 'Physical sky',
  blurb: 'An analytic sky baked into a prefiltered environment lights skin, cloth and steel; matching sun, haze and ACES tone mapping. Studio panels indoors. About the cost of soft shading; no outlines.',
  style: 'soft',
  linear: true,
  outlines: false,
  renderer: { toneMapping: TONE_MAPPING.aces, toneMappingExposure: 0.9, outputEncoding: OUTPUT_ENCODING.srgb },
  surface: physicalSkySurface,
  steel: physicalSkySteel,
  apply: physicalSkyApply,
  dispose(view) {
    const state = stateOf(view, PHYSICAL_SKY_ID);
    for (const target of Object.values(state.environments ?? {})) target.dispose();
    state.environments = {};
    state.dome = null;
  },
});
