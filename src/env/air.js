// The light of an open-air place (src/env/): the sun through the air, the sky that air makes of it, the haze
// between the eye and the land, and the curve a frame without a last pass ends with. One model on the processor
// (envSkyRadiance) is baked to a small table of sky colour by direction; the dome draws the table, the haze
// takes its horizon row for the light scattered into a long sight line, and the fighters' light probe is its
// sum, so sky, haze and ambient light are one thing seen three ways and follow the hour and the weather together.

/* global THREE */

import { ENV } from './config.js';
import { envNoiseTexture } from './noise.js';
import { ENV_GLSL_FILM, envToneOf } from './post.js';

const ENV_DEG = Math.PI / 180;

/** Relative air mass toward `sine` of elevation (1 overhead, about 38 at the horizon). */
export function envAirMass(sine) {
  const [a, b, c] = ENV.air.airMass;
  const zenith = Math.acos(Math.min(1, Math.max(0, sine))) / ENV_DEG;
  return 1 / (Math.max(0, sine) + a * Math.pow(b - zenith, -c));
}

const envDisplay = (radiance) => Math.pow(1 - Math.exp(-ENV.air.skyExposure * Math.max(0, radiance)), 1 / ENV.air.skyGamma);

/**
 * The sky's colour (display values) toward the unit direction (x, y, z), into `out`. `air`: an envAirState.
 * Clear sky: sunlight scattered once into the sight line by the air (Rayleigh) and the haze (Mie), each by its
 * own phase function, through as much air as the line crosses, plus a share scattered more than once. Under
 * cloud the same blends toward the CIE overcast sky, three times as bright overhead as at the horizon.
 */
export function envSkyRadiance(air, x, y, z, out) {
  const tune = ENV.air;
  const sine = Math.max(0, y);
  const mass = envAirMass(sine);
  const cosine = Math.min(1, Math.max(-1, x * air.sun[0] + y * air.sun[1] + z * air.sun[2]));
  const rayleigh = 0.75 * (1 + cosine * cosine);
  const g = tune.hazeForward;
  const mie = (1 - g * g) / Math.pow(1 + g * g - 2 * g * cosine, 1.5);
  const share = tune.skyPathShare[0] + (tune.skyPathShare[1] - tune.skyPathShare[0]) * sine;
  // (The CIE ratio is of luminance; the lid's colour is a display value, so the ratio goes through the display's power.)
  const lid = Math.pow((1 + 2 * sine) / 3, 1 / 2.2);
  for (let channel = 0; channel < 3; channel += 1) {
    const depthR = tune.rayleighDepth[channel];
    const depth = depthR + air.hazeDepth;
    const scattered = 1 - Math.exp(-depth * mass);
    const reaching = tune.sunPower * air.sunShare * Math.exp(-depth * air.sunMass * share);
    const single = reaching * scattered * (depthR * rayleigh + air.hazeDepth * mie) / depth;
    const many = tune.sunPower * (0.35 + 0.65 * air.sunShare) * Math.exp(-depth * air.sunMass * share) * scattered * tune.multiScatter * (depthR / tune.rayleighDepth[2] + 0.35);
    const clear = envDisplay(single + many);
    const grey = air.overcast[channel] * lid;
    out[channel] = clear + (grey - clear) * air.lid;
  }
  return out;
}

/**
 * Everything the light needs, from a place's description and the weather on it:
 * { sun: unit direction to the sun, sunMass, sunShare, sunColour: the sun's light on the ground (display),
 *   hazeDepth, lid: 0..1 how far the sky is a grey lid, overcast: its colour, cover, gloom,
 *   extinction: [r, g, b] of the haze per metre at the ground, rayleigh: [r, g, b] per metre, hazeHeight,
 *   table: Uint8Array of the sky (ENV.sky.across x ENV.sky.up x 4), skyLight, bounce, horizon: [r, g, b] }.
 */
export function envAirState(place, weather) {
  const tune = ENV.air;
  const elevation = place.sun.elevation * ENV_DEG;
  const azimuth = place.sun.azimuth;
  const sun = [Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation)];
  const cover = weather.cover ?? place.clouds.cover;
  const visibility = weather.visibility ?? place.air.visibility;
  const hazeHeight = weather.hazeHeight ?? place.air.hazeHeight;
  const air = {
    sun,
    sunMass: envAirMass(sun[1]),
    sunShare: weather.sun,
    // The haze looked straight up through: its extinction at the ground times the height it thins over, so the
    // air that hides the hills is the air that whitens the sky and reddens and dims the sun.
    hazeDepth: (tune.koschmieder / visibility) * hazeHeight,
    cover,
    gloom: weather.gloom,
    // The sky turns from blue with clouds on it to a lid as the last gaps close.
    lid: Math.min(1, Math.max(0, (cover - 0.7) / 0.3)),
    overcast: [0.8, 0.83, 0.88].map((value) => value * ENV.sky.overcast * (1 - 0.55 * weather.gloom)),
    hazeHeight,
    visibility,
    tint: weather.tint ?? null,
  };
  // The sun on the ground: what the air leaves of it, as a display value.
  air.sunColour = [0, 1, 2].map((channel) => tune.sunGain * weather.sun
    * Math.pow(tune.sunPower * Math.exp(-(tune.rayleighDepth[channel] + air.hazeDepth) * air.sunMass), 1 / 2.2));
  air.extinction = tune.koschmieder / air.visibility;
  // Fine haze dims blue more than red (extinction ~ wavelength ^ -fine); droplets dim all alike.
  air.hazeHue = tune.wavelengths.map((nm) => Math.pow(tune.wavelengths[1] / nm, weather.fine));
  air.rayleigh = tune.rayleighPerMetre.slice();
  // The table, and from it the light of the whole sky on level ground and the horizon's mean colour.
  const { across, up } = ENV.sky;
  const table = new Uint8Array(across * up * 4);
  const rgb = [0, 0, 0];
  const skyLight = [0, 0, 0];
  const horizon = [0, 0, 0];
  let weight = 0;
  const tintColour = air.tint === null ? null : new THREE.Color(air.tint);
  for (let row = 0; row < up; row += 1) {
    const v = row / (up - 1);
    const sine = v * v;
    const cosine = Math.sqrt(1 - sine * sine);
    for (let column = 0; column < across; column += 1) {
      const turn = (column / (across - 1)) * Math.PI + azimuth;
      envSkyRadiance(air, Math.cos(turn) * cosine, sine, Math.sin(turn) * cosine, rgb);
      // Dust in the air colours the low sky its own colour.
      if (tintColour) {
        const low = 0.75 * Math.exp(-sine * 6);
        rgb[0] += (tintColour.r * (0.5 + 0.5 * rgb[0]) - rgb[0]) * low;
        rgb[1] += (tintColour.g * (0.5 + 0.5 * rgb[1]) - rgb[1]) * low;
        rgb[2] += (tintColour.b * (0.5 + 0.5 * rgb[2]) - rgb[2]) * low;
      }
      const at = (row * across + column) * 4;
      for (let channel = 0; channel < 3; channel += 1) table[at + channel] = Math.round(Math.min(1, rgb[channel] / ENV.sky.most) * 255);
      table[at + 3] = 255;
      // Irradiance on level ground: radiance x sin(elevation) over the hemisphere. Rows are even in sqrt(sine), so
      // a row stands for a band of solid angle 2 v dv wide in sine; the 2 pi of azimuth cancels in the mean.
      const band = sine * v;
      for (let channel = 0; channel < 3; channel += 1) skyLight[channel] += Math.min(ENV.sky.most, rgb[channel]) * band;
      weight += band;
      if (row === 0) for (let channel = 0; channel < 3; channel += 1) horizon[channel] += Math.min(ENV.sky.most, rgb[channel]) / across;
    }
  }
  air.table = table;
  // Broken cloud between the ground and the sky greys and dims the sky's light a little.
  const clouded = 1 - 0.25 * cover * (0.4 + weather.gloom);
  air.skyLight = skyLight.map((value) => Math.min(1, (value / weight) * clouded * tune.skyFill));
  air.horizon = horizon;
  // The ground's own light thrown back up, for the underside of things.
  air.bounce = air.skyLight.map((value, channel) => tune.bounce * (value + air.sunColour[channel] * sun[1]));
  // A cloud in the sun and a cloud's shaded base.
  air.cloudLit = air.sunColour.map((value, channel) => Math.min(tune.cloudMost, 0.72 * value / Math.max(0.05, weather.sun) * Math.max(weather.sun, 0.45) + 0.42 * air.skyLight[channel]));
  // A cloud's base: lit by the sky round it and the land under it, greyer than either.
  const skyMean = (air.skyLight[0] + air.skyLight[1] + air.skyLight[2]) / 3;
  air.cloudDark = air.skyLight.map((value) => (0.55 * skyMean + 0.45 * value) * tune.cloudBase * (1.15 - 0.8 * weather.gloom));
  // Under a lid there is no sky round the cloud to be darker than: its base is the sky, and what lights the
  // ground. Its thick and thin parts differ by `lidGrain` either way.
  for (let channel = 0; channel < 3; channel += 1) {
    air.cloudLit[channel] += (air.overcast[channel] * (1 + tune.lidGrain) - air.cloudLit[channel]) * air.lid;
    air.cloudDark[channel] += (air.overcast[channel] * (1 - tune.lidGrain) - air.cloudDark[channel]) * air.lid;
  }
  return air;
}

/** The table read on the processor, as the shaders read it, with the ground below the horizon (for the light probe). */
export function envSkyAt(air, x, y, z, out) {
  if (y < 0) {
    // Below the horizon is the land: lit by the sky and the sun, about as dark as grass.
    const down = Math.min(1, -y * 3);
    envSkyAt(air, x, 0, z, out);
    for (let channel = 0; channel < 3; channel += 1) out[channel] += (air.bounce[channel] * 1.6 - out[channel]) * down;
    return out;
  }
  const { across, up } = ENV.sky;
  const flat = Math.hypot(x, z) || 1;
  const cosine = Math.min(1, Math.max(-1, (x * air.sun[0] + z * air.sun[2]) / (flat * Math.hypot(air.sun[0], air.sun[2]))));
  const column = Math.round((Math.acos(cosine) / Math.PI) * (across - 1));
  const row = Math.round(Math.sqrt(Math.min(1, y)) * (up - 1));
  const at = (row * across + column) * 4;
  for (let channel = 0; channel < 3; channel += 1) out[channel] = air.table[at + channel] / 255 * ENV.sky.most;
  return out;
}

// ---- what every env shader shares ----------------------------------------------------------------------------------

let envSkyTextureMade = null;

/** The sky table as a texture (one, rewritten when the air changes). */
export function envSkyTexture(air) {
  const { across, up } = ENV.sky;
  if (!envSkyTextureMade) {
    envSkyTextureMade = new THREE.DataTexture(new Uint8Array(across * up * 4), across, up, THREE.RGBAFormat);
    envSkyTextureMade.magFilter = envSkyTextureMade.minFilter = THREE.LinearFilter;
    envSkyTextureMade.generateMipmaps = false;
  }
  if (air) {
    envSkyTextureMade.image.data.set(air.table);
    envSkyTextureMade.needsUpdate = true;
  }
  return envSkyTextureMade;
}

/** One set of uniforms for every env material: the same objects, so one write a frame reaches them all. */
export const ENV_UNIFORMS = {
  uEnvTime: { value: 0 },
  uEnvNoise: { value: null },
  uEnvSky: { value: null },
  uEnvSunDir: { value: null },
  uEnvSunColour: { value: null },
  uEnvSkyLight: { value: null },
  uEnvBounce: { value: null },
  // xyz: the haze's own extinction per metre for red, green, blue at the ground; w: 1 / haze height.
  uEnvHaze: { value: null },
  // xyz: the air's own (Rayleigh: it does not thin over the heights the game sees); w: the haze's for green light.
  uEnvRayleigh: { value: null },
  // x, z: the wind's unit way; z: its speed now (m/s); w: gustiness 0..1.
  uEnvWind: { value: null },
  // How far the air has travelled (m, x and z): the gust pattern rides it.
  uEnvWindTravel: { value: null },
  // x: cover 0..1; y: shadow strength on the land; z: 1 / the sheet's scale (1/m); w: the sheet's height (m).
  uEnvCloud: { value: null },
  uEnvCloudTravel: { value: null },
  uEnvCloudLit: { value: null },
  uEnvCloudDark: { value: null },
  // x: wet 0..1; y: snow lying 0..1.
  uEnvWet: { value: null },
  // The share of the place's grass gone to straw, 0..1.
  uEnvDry: { value: 0 },
  // The way the camera looks, level (x, z; unit, or zero looking straight down): what follows the camera is laid out ahead of it.
  uEnvLook: { value: null },
  // What stands on the ground nearest the camera, as spheres: xyz a centre, w its radius (0: none). index.js envUpdate.
  uEnvBodies: { value: [] },
};

/** Fill the uniforms' values in (the first use needs THREE). */
export function envUniforms() {
  const u = ENV_UNIFORMS;
  if (u.uEnvSunDir.value) return u;
  u.uEnvNoise.value = envNoiseTexture();
  u.uEnvSky.value = envSkyTexture(null);
  u.uEnvSunDir.value = new THREE.Vector3(0, 1, 0);
  u.uEnvSunColour.value = new THREE.Vector3(1, 1, 1);
  u.uEnvSkyLight.value = new THREE.Vector3(0.5, 0.6, 0.7);
  u.uEnvBounce.value = new THREE.Vector3(0.1, 0.1, 0.1);
  u.uEnvHaze.value = new THREE.Vector4(0, 0, 0, 1);
  u.uEnvRayleigh.value = new THREE.Vector4(0, 0, 0, 0);
  u.uEnvWind.value = new THREE.Vector4(1, 0, 0, 0);
  u.uEnvWindTravel.value = new THREE.Vector2(0, 0);
  u.uEnvCloud.value = new THREE.Vector4(0, 0, 1 / ENV.clouds.scale, ENV.clouds.height);
  u.uEnvCloudTravel.value = new THREE.Vector2(0, 0);
  u.uEnvCloudLit.value = new THREE.Vector3(1, 1, 1);
  u.uEnvCloudDark.value = new THREE.Vector3(0.5, 0.5, 0.5);
  u.uEnvWet.value = new THREE.Vector2(0, 0);
  u.uEnvLook.value = new THREE.Vector2(0, 0);
  for (let at = 0; at < ENV.shadow.bodyCount; at += 1) u.uEnvBodies.value.push(new THREE.Vector4(0, 0, 0, 0));
  return u;
}

/** Write an air state into the shared uniforms. */
export function envAirToUniforms(air, weather, quality, place) {
  const u = envUniforms();
  envSkyTexture(air);
  u.uEnvSunDir.value.fromArray(air.sun);
  u.uEnvSunColour.value.fromArray(air.sunColour);
  u.uEnvSkyLight.value.fromArray(air.skyLight);
  u.uEnvBounce.value.fromArray(air.bounce);
  u.uEnvHaze.value.set(air.extinction * air.hazeHue[0], air.extinction * air.hazeHue[1], air.extinction * air.hazeHue[2], 1 / air.hazeHeight);
  u.uEnvRayleigh.value.set(air.rayleigh[0], air.rayleigh[1], air.rayleigh[2], air.extinction);
  u.uEnvCloud.value.set(air.cover, quality.cloudShadow ? ENV.clouds.shadow * (1 - air.lid) : 0, 1 / ENV.clouds.scale, ENV.clouds.height);
  u.uEnvCloudLit.value.fromArray(air.cloudLit);
  u.uEnvCloudDark.value.fromArray(air.cloudDark);
  u.uEnvWet.value.set(weather.wet, weather.snow);
  u.uEnvDry.value = place.grass.dry;
}

/**
 * GLSL every env shader starts with (vertex and fragment): the shared uniforms and
 *   envSky(dir)            the sky's colour toward a unit direction (the table)
 *   envAirlight(dir)       the light the air scatters into a long level sight line that way (its horizon row)
 *   envHaze(colour, from, to)   `colour` at world point `to` seen from `from` through the haze
 *   envCloud(xz)           the cloud sheet's cover 0..1 over sheet point xz (sheet units); envCloudDepth(xz) how thick
 *   envSunShare(world)     how much of the sun reaches a point on the land under the clouds, 0..1
 *   envGust(xz)            the wind's local speed at a point on the ground (m/s), the gusts riding the air's travel
 */
export const ENV_GLSL = /* glsl */ `
uniform float uEnvTime;
uniform sampler2D uEnvNoise;
uniform sampler2D uEnvSky;
uniform vec3 uEnvSunDir;
uniform vec3 uEnvSunColour;
uniform vec3 uEnvSkyLight;
uniform vec3 uEnvBounce;
uniform vec4 uEnvHaze;
uniform vec4 uEnvRayleigh;
uniform vec4 uEnvWind;
uniform vec2 uEnvWindTravel;
uniform vec4 uEnvCloud;
uniform vec2 uEnvCloudTravel;
uniform vec3 uEnvCloudLit;
uniform vec3 uEnvCloudDark;
uniform vec2 uEnvWet;
uniform float uEnvDry;
uniform vec2 uEnvLook;

vec3 envSky(vec3 dir) {
  vec2 level = normalize(dir.xz + vec2(1e-5, 0.0));
  float across = acos(clamp(dot(level, normalize(uEnvSunDir.xz)), -1.0, 1.0)) / 3.14159265;
  return texture2D(uEnvSky, vec2(across, sqrt(clamp(dir.y, 0.0, 1.0)))).rgb * ${ENV.sky.most.toFixed(1)};
}

vec3 envAirlight(vec3 dir) {
  return envSky(vec3(dir.x, 0.0, dir.z));
}

// The haze's density falls off with height as exp(-y / H); along a straight sight line that integrates exactly.
float envHazeColumn(float fromY, float toY) {
  float a = fromY * uEnvHaze.w;
  float b = toY * uEnvHaze.w;
  float d = b - a;
  return abs(d) < 1e-3 ? exp(-a) : (exp(-a) - exp(-b)) / d;
}

vec3 envHaze(vec3 colour, vec3 from, vec3 to) {
  vec3 ray = to - from;
  float distance = length(ray);
  vec3 depth = (uEnvRayleigh.rgb + uEnvHaze.rgb * envHazeColumn(max(from.y, 0.0), max(to.y, 0.0))) * distance;
  vec3 through = exp(-depth);
  return colour * through + envAirlight(ray / max(distance, 1e-3)) * (1.0 - through);
}

// How far inside a cloud a sheet point is: below 0 clear sky, 0 the cloud's edge, about 0.3 its thick middle.
float envCloudDepth(vec2 sheet) {
  float broad = texture2D(uEnvNoise, sheet * 0.125).b;
  float fine = texture2D(uEnvNoise, sheet * 0.53 + vec2(0.37, 0.11)).a;
  return broad * 0.68 + fine * 0.32 - mix(0.74, 0.26, uEnvCloud.x);
}

float envCloud(vec2 sheet) {
  return smoothstep(-0.07, 0.11, envCloudDepth(sheet));
}

// The sheet point straight up the sun's ray from a point on the land.
vec2 envCloudOver(vec3 world) {
  vec2 slant = uEnvSunDir.xz / max(uEnvSunDir.y, 0.12);
  return (world.xz + slant * (uEnvCloud.w - world.y)) * uEnvCloud.z - uEnvCloudTravel;
}

float envSunShare(vec3 world) {
  if (uEnvCloud.y <= 0.0) return 1.0;
  vec2 sheet = envCloudOver(world);
  float broad = texture2D(uEnvNoise, sheet * 0.125).b;
  float edge = mix(0.74, 0.26, uEnvCloud.x);
  return 1.0 - uEnvCloud.y * smoothstep(edge - 0.12, edge + 0.16, broad * 0.68 + 0.16);
}

float envGust(vec2 xz) {
  vec2 way = uEnvWind.xy;
  vec2 p = xz - uEnvWindTravel;
  // Along the wind and across it; a front is wider than it is deep.
  vec2 q = vec2(dot(p, way), dot(p, vec2(-way.y, way.x)) / ${ENV.wind.across.toFixed(2)});
  float front = texture2D(uEnvNoise, q / (${ENV.wind.long.toFixed(1)} * 16.0)).r;
  float paw = texture2D(uEnvNoise, q / (${ENV.wind.short.toFixed(1)} * 16.0) + vec2(0.31, 0.67)).g;
  float pattern = front * 0.65 + paw * 0.35;
  return uEnvWind.z * max(0.0, 1.0 + ${ENV.wind.depth.toFixed(2)} * uEnvWind.w * (pattern - 0.5) * 2.0);
}
`;

// ---- the curve, where the frame has no last pass ---------------------------------------------------------------------

let envToneInstalled = false;

/**
 * Give the renderer's spare tone-mapping slot (THREE.CustomToneMapping, which nothing else uses) the frame's curve
 * (post.js ENV_GLSL_FILM) at the default grade, the renderer's exposure the camera's. A negative exposure leaves
 * the light sums as they are: the frame is then drawn to a target and bent by the last pass (post.js envPostDraw).
 */
export function envInstallTone() {
  if (envToneInstalled) return;
  envToneInstalled = true;
  const tone = envToneOf({ sunColour: [1, 1, 1], sun: [0, 1, 0], skyLight: [0, 0, 0], extinction: 0 }, {});
  const curve = `${ENV_GLSL_FILM}
  vec3 CustomToneMapping( vec3 color ) {
    if ( toneMappingExposure < 0.0 ) return color;
    return envFilm( pow( max( color, 0.0 ), vec3( 2.2 ) ) * toneMappingExposure, vec4( 1.0, ${tone.contrast.toFixed(3)}, ${tone.sigma.toFixed(4)}, ${tone.gain.toFixed(4)} ), vec2( ${tone.saturation.toFixed(3)}, ${tone.warmth.toFixed(3)} ) );
  }`;
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  const replaced = chunk.replace(/vec3 CustomToneMapping\s*\(\s*vec3 color\s*\)\s*\{[^}]*\}/, curve);
  if (replaced === chunk) console.warn('env: the renderer has no CustomToneMapping to replace; the picture will be flat');
  THREE.ShaderChunk.tonemapping_pars_fragment = replaced;
}
