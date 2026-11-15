// The light of an open-air place (src/env/): the sun through the air, the sky that air makes of it, the haze
// between the eye and the land, and the curve a frame without a last pass ends with. One model on the processor
// (envSkyRadiance) is baked to a small table of sky colour by direction; the dome draws the table, the haze
// takes its horizon row for the light scattered into a long sight line, and the fighters' light probe is its
// sum, so sky, haze and ambient light are one thing seen three ways and follow the hour and the weather together.

/* global THREE */

import { ENV } from './config.js';
import { ENV_NOISE_CELLS, envNoiseTexture } from './noise.js';
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
  // What the haze has thrown wide of the sun's beam on its way down (envAirState: the same 1 - g^2 of its depth
  // that dims the sun on the ground) is not lost: it is the haze's own even light, from every side.
  const strewn = tune.sunPower * air.sunShare * air.sun[1] * (1 - Math.exp(-air.hazeDepth * (1 - g * g) * air.sunMass)) * tune.hazeStrewn;
  // (The CIE ratio is of luminance; the lid's colour is a display value, so the ratio goes through the display's power.)
  const lid = Math.pow((1 + 2 * sine) / 3, 1 / 2.2);
  for (let channel = 0; channel < 3; channel += 1) {
    const depthR = tune.rayleighDepth[channel];
    const depth = depthR + air.hazeDepth;
    const scattered = 1 - Math.exp(-depth * mass);
    const reaching = tune.sunPower * air.sunShare * Math.exp(-depth * air.sunMass * share);
    const single = (reaching * (depthR * rayleigh + air.hazeDepth * mie) + strewn * Math.exp(-depthR * air.sunMass * share) * air.hazeDepth) * scattered / depth;
    const many = tune.sunPower * (0.35 + 0.65 * air.sunShare) * Math.exp(-depth * air.sunMass * share) * scattered * tune.multiScatter * (depthR / tune.rayleighDepth[2] + 0.35);
    const clear = envDisplay(single + many);
    const grey = air.overcast[channel] * lid;
    out[channel] = clear + (grey - clear) * air.lid;
  }
  return out;
}

/** The unit way to the sun of a description's `sun` ({ azimuth rad, elevation degrees }): [x, y, z]. */
export function envSunWay(sun) {
  const elevation = sun.elevation * ENV_DEG;
  return [Math.cos(sun.azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(sun.azimuth) * Math.cos(elevation)];
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
  const azimuth = place.sun.azimuth;
  const sun = envSunWay(place.sun);
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
    // The sheet's form, from a field of cumulus to a deck (ENV.clouds.deck): [the share of small lumps, how far in a base is dark,
    // and how many times wider than a cumulus's its edge is].
    form: [[ENV.clouds.ragged, ENV.clouds.deck], [ENV.clouds.baseAt, ENV.clouds.deckBase], [1, ENV.clouds.deckEdge]].map(([value, slab]) => value * (1 + (weather.deck ?? place.clouds.deck ?? 0) * (slab - 1))),
    gloom: weather.gloom,
    // The sky turns from blue with clouds on it to a lid as the last gaps close.
    lid: Math.min(1, Math.max(0, (cover - 0.7) / 0.3)),
    overcast: [0.8, 0.83, 0.88].map((value) => value * ENV.sky.overcast * (1 - 0.55 * weather.gloom)),
    hazeHeight,
    visibility,
    tint: weather.tint ?? null,
  };
  // The sun on the ground: what the air leaves of it, as a display value. Haze throws most of what it scatters
  // forward, into the few degrees round the sun, and that light comes down with the beam and casts the beam's
  // shadows: only what is thrown wide is lost to the sun on the ground, 1 - g^2 of the haze's depth for a lobe
  // of asymmetry g (the delta-Eddington scaling of radiative transfer; approximate, as g itself is). Without it
  // a 15 degree sun through 26 m of mist came down at a fifth of itself and lit nothing: no shadow under a
  // fighter and none from a trunk, under a mist that showed shafts.
  const wide = 1 - tune.hazeForward * tune.hazeForward;
  air.sunColour = [0, 1, 2].map((channel) => tune.sunGain * weather.sun
    * Math.pow(tune.sunPower * Math.exp(-(tune.rayleighDepth[channel] + air.hazeDepth * wide) * air.sunMass), 1 / 2.2));
  // The share of the beam the haze has thrown wide by the time it is down: that light comes from all round.
  air.strewn = 1 - Math.exp(-air.hazeDepth * wide * air.sunMass);
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
  // The ground's own light thrown back up, for the underside of things: by what the place stands on (its
  // ground.albedo; grass and soil where it does not say), whitened by the weather's lying snow.
  const bare = place.ground?.albedo ?? tune.bounce;
  const thrown = bare + (tune.snowBounce - bare) * (weather.snow || 0);
  air.bounce = air.skyLight.map((value, channel) => thrown * (value + air.sunColour[channel] * sun[1]));
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
  // x: how much of the sheet's shape is its small lumps; y: how far inside a cloud its base is wholly dark.
  uEnvCloudForm: { value: null },
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
  // xyz: the middle of those; w: how far from it any of them still presses grass or shades the ground (0: none do).
  uEnvBodiesAt: { value: null },
  // 1 while an open-air place is shown, 0 otherwise: a place's own dressed material (envDress) is then as it was made.
  uEnvOn: { value: 0 },
  // How much of what the weather lets fall is falling at the camera now, 0..1 (a shower passing: index.js envUpdate).
  uEnvFall: { value: 0 },
  // The near map and what stands over it (terrain.js envBuildNearMap), of the place now shown: what draws the land
  // carries its own; these are for what only asks how much sun reaches the air (the sky, a tree, a place's own
  // material). index.js envApply.
  uEnvMap: { value: null },
  uEnvCover: { value: null },
  // Shade in the air (ENV.air.shadeBeam). x: the share of the air's light that shade takes away; y, z: the height
  // over the ground (m) where the place's crowns begin and where a point is over most of them, between which
  // the near map stops telling what shades the air; w: under 0, each sight line is walked for its own shade
  // (the high tier), else the share of the sun on the air before the camera, worked once a frame for all of them.
  uEnvShade: { value: null },
  // How far (m, x and z) the gust over the floor has carried the crowns' shade: the flecks on the ground move by
  // it where they lie (terrain.js envCover), and the shafts in the air with them.
  uEnvShadeSway: { value: null },
  // The camera's exposure this frame (post.js envMeter): what a place's own emissive or added light multiplies
  // itself against so that it sits in the frame as the land does. 1 where no open-air place is shown.
  uEnvExposure: { value: 1 },
  // A place's own sun map (a place that draws itself and casts its own shadows: config.js `sunMap`), read by
  // the air's walk and by whatever falls through the air, so that its walls and roofs shade the mist and the
  // flakes as its crowns would. `uEnvPlaceSunBy`: world to the map's [0, 1] cube (a light's shadow.matrix);
  // `uEnvPlaceSunOn`: x 1 while there is one, y the depth bias.
  uEnvPlaceSun: { value: null },
  uEnvPlaceSunBy: { value: null },
  uEnvPlaceSunOn: { value: null },
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
  u.uEnvCloudForm.value = new THREE.Vector4(ENV.clouds.ragged, ENV.clouds.baseAt, 1, 0);
  u.uEnvCloudDark.value = new THREE.Vector3(0.5, 0.5, 0.5);
  u.uEnvWet.value = new THREE.Vector2(0, 0);
  u.uEnvShade.value = new THREE.Vector4(0, 0, 1, 1);
  u.uEnvShadeSway.value = new THREE.Vector2(0, 0);
  u.uEnvPlaceSunBy.value = new THREE.Matrix4();
  u.uEnvPlaceSunOn.value = new THREE.Vector2(0, 0);
  u.uEnvLook.value = new THREE.Vector2(0, 0);
  u.uEnvBodiesAt.value = new THREE.Vector4(0, 0, 0, 0);
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
  u.uEnvCloudForm.value.set(air.form[0], air.form[1], air.form[2], air.strewn);
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
 *   envAirSun(point)       how much reaches a point in the air: the clouds, and below the crowns what stands sunward
 *   envAirShare(from, ray, depth, grain, steps)   the mean of that along a sight line, each stretch by what it sends the eye
 *   envHazeGrain(colour, from, to, grain)   envHaze with the walk started `grain` of a step in (envGrain(gl_FragCoord.xy))
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
uniform vec4 uEnvCloudForm;
uniform vec3 uEnvCloudLit;
uniform vec3 uEnvCloudDark;
uniform vec2 uEnvWet;
uniform float uEnvDry;
uniform vec2 uEnvLook;
uniform float uEnvOn;
uniform float uEnvFall;
uniform sampler2D uEnvMap;
uniform sampler2D uEnvCover;
uniform vec4 uEnvShade;
uniform vec2 uEnvShadeSway;
uniform float uEnvExposure;
uniform sampler2D uEnvPlaceSun;
uniform mat4 uEnvPlaceSunBy;
uniform vec2 uEnvPlaceSunOn;

vec3 envSky(vec3 dir) {
  vec2 level = normalize(dir.xz + vec2(1e-5, 0.0));
  float across = acos(clamp(dot(level, normalize(uEnvSunDir.xz)), -1.0, 1.0)) / 3.14159265;
  return texture2D(uEnvSky, vec2(across, sqrt(clamp(dir.y, 0.0, 1.0)))).rgb * ${ENV.sky.most.toFixed(1)};
}

// The air's light into a sight line, share of the sun on the air along it (envAirShare). What shade takes is the
// light scattered once: ENV.air.shadeBeam of the level light, and all that the forward lobe adds toward the sun.
vec3 envAirlightIn(vec3 dir, float share) {
  // The horizon row that way, brighter toward the sun itself as the haze throws its light forward (config.js aureole).
  vec3 sun = uEnvSunDir;
  float level = dot(normalize(dir.xz + vec2(1e-5, 0.0)), sun.xz);
  float lobe = pow((${(1 + ENV.air.hazeForward * ENV.air.hazeForward).toFixed(4)} - ${(2 * ENV.air.hazeForward).toFixed(4)} * level) / (${(1 + ENV.air.hazeForward * ENV.air.hazeForward).toFixed(4)} - ${(2 * ENV.air.hazeForward).toFixed(4)} * dot(normalize(dir), sun)), 1.5);
  float fore = ${ENV.air.aureole.toFixed(2)} * max(lobe - 1.0, 0.0);
  float once = (uEnvShade.x + fore) / (1.0 + fore);
  return envSky(vec3(dir.x, 0.0, dir.z)) * (1.0 + ${ENV.air.aureole.toFixed(2)} * (lobe - 1.0)) * (1.0 - once * (1.0 - share));
}

vec3 envAirlight(vec3 dir) {
  return envAirlightIn(dir, 1.0);
}

// The haze's density falls off with height as exp(-y / H); along a straight sight line that integrates exactly.
float envHazeColumn(float fromY, float toY) {
  float a = fromY * uEnvHaze.w;
  float b = toY * uEnvHaze.w;
  float d = b - a;
  return abs(d) < 1e-3 ? exp(-a) : (exp(-a) - exp(-b)) / d;
}

// The sheet's broad masses, 0..1: the noise picture's lumps (750 m to 100 m at the sheet's scale) gathered into
// fields and clear lanes several kilometres across by a second, slower reading of it, turned and at a scale
// with no common measure with the first, so the sky does not come round again every 12 km as the picture does.
// (index.js envCloudBroadAt is the same on the processor.)
float envCloudBroad(vec2 sheet) {
  float lumps = texture2D(uEnvNoise, sheet * 0.125).b;
  float fields = texture2D(uEnvNoise, vec2(0.8 * sheet.x - 0.6 * sheet.y, 0.6 * sheet.x + 0.8 * sheet.y) * 0.0291 + vec2(0.21, 0.63)).r;
  return lumps + (fields - 0.5) * ${ENV.clouds.fields.toFixed(3)};
}

// How far inside a cloud a sheet point is: below 0 clear sky, 0 the cloud's edge, about 0.3 its thick middle.
// The small lumps are read a little aside by the broad masses, which keeps them from repeating in rows too.
float envCloudDepth(vec2 sheet) {
  float broad = envCloudBroad(sheet);
  float fine = texture2D(uEnvNoise, sheet * 0.53 + vec2(0.37, 0.11) + broad * 0.12).a;
  return broad * 0.68 + (0.16 + (fine - 0.5) * uEnvCloudForm.x) - mix(0.74, 0.26, uEnvCloud.x);
}

float envCloud(vec2 sheet) {
  return smoothstep(-0.07 * uEnvCloudForm.z, 0.11 * uEnvCloudForm.z, envCloudDepth(sheet));
}

// The sheet point straight up the sun's ray from a point on the land.
vec2 envCloudOver(vec3 world) {
  vec2 slant = uEnvSunDir.xz / max(uEnvSunDir.y, 0.12);
  return (world.xz + slant * (uEnvCloud.w - world.y)) * uEnvCloud.z - uEnvCloudTravel;
}

float envSunShare(vec3 world) {
  if (uEnvCloud.y <= 0.0) return 1.0;
  vec2 sheet = envCloudOver(world);
  float broad = envCloudBroad(sheet);
  float edge = mix(0.74, 0.26, uEnvCloud.x);
  return 1.0 - uEnvCloud.y * smoothstep(edge - 0.12, edge + 0.16, broad * 0.68 + 0.16);
}

// The same with the cloud's small lumps (the octave the sky draws, envCloudDepth) laid on the broad masses by
// \`fine\` (0..1) and the edge as sharp as the sky draws it: what a sight line toward the sun meets, where a stretch of
// it reads one place of the sheet and the gaps between lumps stand as rays (envAirWalk).
float envSunShareFine(vec3 world, float fine) {
  if (uEnvCloud.y <= 0.0) return 1.0;
  if (fine < 0.01) return envSunShare(world);
  vec2 sheet = envCloudOver(world);
  float broad = envCloudBroad(sheet);
  float lumps = texture2D(uEnvNoise, sheet * 0.53 + vec2(0.37, 0.11) + broad * 0.12).a;
  float depth = broad * 0.68 + 0.16 + (lumps - 0.5) * uEnvCloudForm.x * fine - mix(0.74, 0.26, uEnvCloud.x);
  return 1.0 - uEnvCloud.y * smoothstep(mix(-0.12, -0.07 * uEnvCloudForm.z, fine), mix(0.16, 0.11 * uEnvCloudForm.z, fine), depth);
}

// What stands over the ground (terrain.js envBuildNearMap's cover), read as made (level 0) or as the mean over
// a round 2^level texels across: the texture's own smaller copies. (Before WebGL 2 a shader cannot ask for one.)
vec4 envCoverRead(vec2 at, float level) {
#if __VERSION__ >= 300
  return textureLod(uEnvCover, at, level);
#else
  return texture2D(uEnvCover, at);
#endif
}

// What gets past the crowns (g: how deep their shade lies, terrain.js envBuildNearMap) taken as a whole, the flecks
// of sun in it (terrain.js envCover) not told apart.
float envPastCrowns(float deep) {
  return 1.0 - min(deep * 2.5, 1.0) * smoothstep(0.3, 0.72, 0.5 + (deep - 0.5) * 0.62);
}

// The masses of leaf in a crown and the gaps between its boughs (ENV.shadow.boughs), 0..1 over the ground where
// the crown's shadow falls: the part of the pattern of sun under a crown that the air shows as shafts.
float envBoughs(vec2 xz) {
  return texture2D(uEnvNoise, xz / ${(ENV.shadow.boughs * 16).toFixed(2)} + vec2(0.13, 0.57)).g * 0.65 + texture2D(uEnvNoise, xz / ${(ENV.shadow.boughs * 6.1).toFixed(2)} + vec2(0.71, 0.29)).a * 0.35;
}

// What stands sunward of a point in the air, read off the near map where the point's sun ray comes to the ground:
// the share of the sun past the crowns (x), past the trunks (y) and past the land itself (z). Off the map all is
// open, and over the crowns the map no longer tells (a point there is above the shade it is drawn in).
// (spread: the read is the mean over a round of the cover 2^spread of its texels across; 0 the cover as made.)
vec3 envSunwardOver(vec3 point, float spread) {
  vec2 at = point.xz / ${(2 * ENV.terrain.mapHalf).toFixed(1)} + 0.5;
  vec2 out_ = abs(at - 0.5);
  if (max(out_.x, out_.y) > 0.49) return vec3(1.0);
  vec4 land = texture2D(uEnvMap, at);
  float above = max(point.y - land.r, 0.0);
  float level = length(uEnvSunDir.xz);
  vec2 lean = uEnvSunDir.xz / max(level, 1e-4) * min(${ENV.shadow.slantMost.toFixed(1)}, level / max(uEnvSunDir.y, 1e-3));
  vec2 foot = point.xz - lean * above + uEnvShadeSway;
  vec4 over = envCoverRead(foot / ${(2 * ENV.terrain.mapHalf).toFixed(1)} + 0.5, spread);
  float open = smoothstep(uEnvShade.y, uEnvShade.z, above);
  // (Up among the crowns a point has part of their depth under it and not sunward of it: the share of the
  // depth still over it falls from all at the crowns' foot to none at their tops. Their depth, not their
  // shade: under a low sun a ray has passed several crowns, and half way up them the air is still dark.)
  float deep = over.g * (1.0 - open);
  float crowns = envPastCrowns(deep);
  // Read finer than a bough, the crowns are their boughs: sun down the gaps, shade behind the masses. Read
  // over a round wider than that, the mean of the two (which envPastCrowns is).
  if (deep > 0.004 && spread < ${(Math.log2(ENV.shadow.boughs * ENV.terrain.mapSize * ENV.shadow.coverFine / (2 * ENV.terrain.mapHalf)) + 1).toFixed(2)}) {
    float least = 0.5 + (deep - 0.5) * 0.62;
    float gaps = 1.0 - min(deep * 2.5, 1.0) * (1.0 - smoothstep(least - 0.06, least + 0.08, envBoughs(foot)));
    crowns = mix(gaps, crowns, smoothstep(${(Math.log2(ENV.shadow.boughs * ENV.terrain.mapSize * ENV.shadow.coverFine / (2 * ENV.terrain.mapHalf)) - 1.5).toFixed(2)}, ${(Math.log2(ENV.shadow.boughs * ENV.terrain.mapSize * ENV.shadow.coverFine / (2 * ENV.terrain.mapHalf)) + 1).toFixed(2)}, spread));
  }
  // (A trunk shades the air between it and its band on the ground, not the air sunward of it: terrain.js, the
  // near map's fourth value.)
  float clear = smoothstep(over.a * ${ENV.shadow.reachMost.toFixed(1)}, over.a * ${ENV.shadow.reachMost.toFixed(1)} + ${ENV.shadow.reachSoft.toFixed(2)}, above);
  return vec3(crowns, mix(over.b, 1.0, max(open, clear)), land.b);
}

vec3 envSunward(vec3 point) {
  return envSunwardOver(point, 0.0);
}

// Whether the sun reaches a point past what a place that draws itself has built: its own sun map, where it has
// handed one over (depth packed in four bytes as three.js packs a shadow map; outside the map, in the sun).
float envPlaceSun(vec3 point) {
  if (uEnvPlaceSunOn.x < 0.5) return 1.0;
  vec4 spot = uEnvPlaceSunBy * vec4(point, 1.0);
  spot.xyz /= spot.w;
  if (spot.x < 0.0 || spot.x > 1.0 || spot.y < 0.0 || spot.y > 1.0 || spot.z > 1.0) return 1.0;
  float held = dot(texture2D(uEnvPlaceSun, spot.xy), vec4(1.0 / 16777216.0, 1.0 / 65536.0, 1.0 / 256.0, 1.0)) * (255.0 / 256.0);
  return step(spot.z - uEnvPlaceSunOn.y, held);
}

// The share of the sun on a point in the air seen from eye: the cloud over it and what stands sunward of it.
// Light the haze has thrown wide (uEnvCloudForm.w: its share of the beam, envAirState) comes to the point from
// all round, under the cloud over a wide round and not the cloud over the point, so the cloud is read over a
// point drawn that share of the way to the eye: in clear air each point's own cloud (the rays under a broken
// sky), in mist, where all that is seen stands within a stone's throw, one shade for the view. (Read at the
// point, a cloud's shadow stood in a low sun's mist as a seam, bright air one side and dark the other.)
float envAirSunFine(vec3 point, vec3 eye, float spread, float fine) {
  // (Over the cloud sheet nothing shades it.)
  if (point.y >= uEnvCloud.w) return 1.0;
  vec3 past = envSunwardOver(point, spread);
  return envSunShareFine(mix(point, eye, uEnvCloudForm.w), fine) * past.x * past.y * past.z * envPlaceSun(point);
}

float envAirSunOver(vec3 point, vec3 eye, float spread) {
  return envAirSunFine(point, eye, spread, 0.0);
}

float envAirSun(vec3 point) {
  return envAirSunOver(point, point, 0.0);
}

// The mean share of the sun on the air along a sight line (from from along ray, depth what the haze takes
// over it), each stretch counted by the light it sends the eye: the steps are even in what the haze has taken by
// then, and start grain of a step in, which differs between neighbouring pixels so that a few steps draw the
// edge of a shaft and not as many bands.
float envAirWalk(vec3 from, vec3 ray, float depth, float grain, int steps) {
  float gone = 1.0 - exp(-depth);
  // The haze thins with height, so on a line that climbs out of it most of what it takes is taken low down, near
  // the line's lower end: a share of the depth lies that share of the way along in exp(-y / H), not in distance.
  float low = max(from.y, 0.0) * uEnvHaze.w;
  float high = max(from.y + ray.y, 0.0) * uEnvHaze.w;
  float lowThin = exp(-low);
  float highThin = exp(-high);
  // Where the haze has taken next to nothing its light is next to nothing too and how much of it is in shade
  // cannot be seen: one step there, half of them up to ENV.air.shadeFull, all of them past it.
  int count = gone < ${ENV.air.shadeFrom.toFixed(3)} ? 1 : (gone < ${ENV.air.shadeFull.toFixed(3)} ? (steps + 1) / 2 : steps);
  // A step stands for a stretch of the line, and the shade at one point of it is not the stretch's: a far
  // stretch crosses many shadows, and read at a point it came out all lit or all dark, pixel by pixel, as a
  // grain on everything seen through a wood. The cover is read spread over ENV.air.shadeSpread of the stretch,
  // and the stretch is measured where the cover is read, on the ground along the sun's rays (envSunwardOver):
  // a line looking up the rays stays in one shadow or one shaft however long it is, so toward the sun the
  // read is as fine as the cover and the shafts stand apart, fanning from the sun; across the rays a stretch
  // crosses shadows at its full length. (Measured by the line's own length, shafts seen end on were spread over
  // metres and only a glow was left.) Each step by its own stretch: the near ones are short.
  float level = length(uEnvSunDir.xz);
  vec2 lean = uEnvSunDir.xz / max(level, 1e-4) * min(${ENV.shadow.slantMost.toFixed(1)}, level / max(uEnvSunDir.y, 1e-3));
  float crossed = length(ray.xz - lean * ray.y) / float(count) * ${(ENV.air.shadeSpread * ENV.terrain.mapSize * ENV.shadow.coverFine / (2 * ENV.terrain.mapHalf)).toFixed(4)};
  // The cloud is read where each point's sun ray meets the sheet, and a step's stretch of the line moves that
  // place over the sheet by its run across the sun's rays (seen from the sheet): toward the sun hardly at all, so
  // the cloud's small lumps (one lattice cell of the noise
  // envCloudDepth reads at 0.53 of the sheet: ENV.clouds.scale / (0.53 x 16), 177 m) and the gaps between them stay told apart and draw rays;
  // across the rays a stretch spans many lumps and only the broad masses are left. Light the haze has thrown wide
  // comes from a wide round (uEnvCloudForm.w) and keeps none of them.
  vec2 slant = uEnvSunDir.xz / max(uEnvSunDir.y, 0.12);
  float sheetRun = length(ray.xz - slant * ray.y) / float(count) / ${(ENV.clouds.scale / (0.53 * ENV_NOISE_CELLS)).toFixed(1)};
  float sum = 0.0;
  for (int i = 0; i < ${Math.max(ENV.air.shadeSteps[0], ENV.air.frameSteps)}; i++) {
    if (i >= count) break;
    float u = (float(i) + grain) / float(count);
    float along = depth > 1e-3 ? -log(1.0 - u * gone) / depth : u;
    if (abs(high - low) > 1e-3) along = (-log(max(mix(lowThin, highThin, along), 1e-6)) - low) / (high - low);
    // (The step's stretch of the line: along's rate of change with u, a share 1 / count of it.)
    float stretch = depth > 1e-3 ? gone / (depth * max(1.0 - u * gone, 1e-3)) : 1.0;
    float fine = (1.0 - uEnvCloudForm.w) * clamp(1.0 - sheetRun * stretch, 0.0, 1.0);
    sum += envAirSunFine(from + ray * along, from, log2(max(crossed * stretch, 1.0)), fine);
  }
  return sum / float(count);
}

// (uEnvShade.w: under 0 each sight line is walked here, in the material; otherwise it is the share itself: the
// frame's one share on the lower tiers, and 1 where the frame's own pass walks the lines after the scene is
// drawn and takes the shade's light off the picture, post.js.)
float envAirShare(vec3 from, vec3 ray, float depth, float grain, int steps) {
  if (uEnvShade.w >= 0.0) return uEnvShade.w;
  return envAirWalk(from, ray, depth, grain, steps);
}

float envGrain(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}

vec3 envHazeWalk(vec3 colour, vec3 from, vec3 to, float grain, int steps) {
  vec3 ray = to - from;
  float distance = length(ray);
  vec3 depth = (uEnvRayleigh.rgb + uEnvHaze.rgb * envHazeColumn(max(from.y, 0.0), max(to.y, 0.0))) * distance;
  vec3 through = exp(-depth);
  float share = envAirShare(from, ray, depth.g, grain, steps);
  return colour * through + envAirlightIn(ray / max(distance, 1e-3), share) * (1.0 - through);
}

vec3 envHazeGrain(vec3 colour, vec3 from, vec3 to, float grain) {
  return envHazeWalk(colour, from, to, grain, ${ENV.air.shadeSteps[0]});
}

vec3 envHaze(vec3 colour, vec3 from, vec3 to) {
  return envHazeWalk(colour, from, to, 0.5, ${ENV.air.shadeSteps[1]});
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

// ---- a place's own materials ---------------------------------------------------------------------------------------

/**
 * Put a place's own material (one of the renderer's: basic, Lambert, Phong, standard) in the open air. While an
 * open-air place is shown (uEnvOn) it is hazed as the land is (envHaze, in place of the renderer's fog, which
 * knows one colour and no height); with `wet` or `snow` above 0 it also darkens and shines in the rain and
 * whitens on its upward faces, by those shares of what the weather lays (uEnvWet; not a basic material, which
 * has no normal; a Lambert one by its corners' normals, the others by each pixel's). With the open air off the
 * material is as it was made.
 * What the material's own onBeforeCompile does is kept and runs first: dress a material once, after any such
 * patch. A material marked userData.envOwn does all of this itself and is left alone, as is one the renderer's
 * fog is off for (a sky, a glow) and any other kind (a shader of the place's own, a sprite). Returns the material.
 */
export function envDress(material, { wet = 0, snow = 0 } = {}) {
  if (material.userData.envOwn || material.userData.envDressed || !material.fog) return material;
  if (!(material.isMeshBasicMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial || material.isMeshStandardMaterial)) return material;
  material.userData.envDressed = true;
  const inner = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  const lays = (wet > 0 || snow > 0) && !material.isMeshBasicMaterial;
  const corners = material.isMeshLambertMaterial;
  material.customProgramCacheKey = () => `${key}|env|${lays ? [wet, snow] : ''}`;
  material.onBeforeCompile = (shader, renderer) => {
    inner.call(material, shader, renderer);
    Object.assign(shader.uniforms, envUniforms());
    shader.vertexShader = `varying vec3 vEnvWorld;\nvarying float vEnvUp;\n${shader.vertexShader}`.replace('#include <fog_vertex>', `#include <fog_vertex>
      ${lays && corners ? 'vEnvUp = normalize( ( vec4( transformedNormal, 0.0 ) * viewMatrix ).xyz ).y;' : ''}
      vec4 envAt = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        envAt = instanceMatrix * envAt;
      #endif
      vEnvWorld = ( modelMatrix * envAt ).xyz;`);
    // (The renderer hazes after its tone curve; the open air's haze is light like the rest and goes before it.)
    let fragment = `varying vec3 vEnvWorld;\nvarying float vEnvUp;\n${ENV_GLSL}\n${shader.fragmentShader}`
      .replace('#include <tonemapping_fragment>', 'if ( uEnvOn > 0.5 ) gl_FragColor.rgb = envHazeGrain( gl_FragColor.rgb, cameraPosition, vEnvWorld, envGrain( gl_FragCoord.xy ) );\n#include <tonemapping_fragment>')
      .replace('#include <fog_fragment>', 'if ( uEnvOn < 0.5 ) {\n#include <fog_fragment>\n}');
    // Snow lies on what faces up, first in the lee of the grain (as on the land: terrain.js); under it nothing is wet.
    const after = corners ? '#include <emissivemap_fragment>' : '#include <normal_fragment_maps>';
    if (lays) fragment = fragment.replace(after, `${after}
      if ( uEnvOn > 0.5 ) {
        float envUp = ${corners ? 'vEnvUp' : 'normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz ).y'};
        float envGrain = texture2D( uEnvNoise, vEnvWorld.xz / 2.9 ).a;
        float envSnow = uEnvWet.y * ${snow.toFixed(2)} * smoothstep( 0.25, 0.6, envUp - 0.45 + ( envGrain - 0.5 ) * 0.4 + 0.5 * uEnvWet.y );
        float envWetBy = uEnvWet.x * ${wet.toFixed(2)} * ( 1.0 - envSnow );
        diffuseColor.rgb = mix( diffuseColor.rgb * ( 1.0 - envWetBy * ${(1 - ENV.terrain.wetDarken).toFixed(2)} ), vec3( ${ENV.terrain.snowColour.join(', ')} ), envSnow );
        #ifdef STANDARD
          roughnessFactor = mix( roughnessFactor * ( 1.0 - envWetBy * ${(1 - ENV.terrain.wetRough).toFixed(2)} ), 0.9, envSnow );
        #endif
      }`);
    shader.fragmentShader = fragment;
  };
  material.needsUpdate = true;
  return material;
}

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
