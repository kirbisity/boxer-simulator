// The open air, put together (src/env/): a place that has a description (config.js PLACE_ENV) is drawn from it in the
// realistic look, as one scenery variant ('open-air', listed in scenery.js) that replaces the place's painted
// hills, photograph, card trees and painted ground with the sky, land, grass, trees and drifting air of the other
// env modules, and takes over the light rig, the haze and the wind while it is shown.
//
//   envWanted(view, place)     whether the place is drawn this way now
//   envBuild / envApply        the variant's two halves (scenery.js calls them: build once a place, apply at every
//                              change of light, look or weather)
//   envLeave(view)             hand the scene back (scenery.js, before anything else is applied)
//   envUpdate(view, world)     once a frame: the time, the wind's travel, the cloud over the fighters' sun
//   envSetWeather(view, name)  put a weather on (ENV_WEATHER's names; null: the place's own)
//   envSetEnabled(view, on)    off: every place as it was before this system
//   envAdapt(view, ms, mode)   once a frame: step the env's quality tier to what the device can draw
//
// What a level brings is honoured: a level's own mist (scenarios.js `weather.fog`) becomes the env's mist at the
// same thickness, and a dusk or night scene (`dim`, `colour`, `halos`) is left to the look that already draws it.

/* global THREE */

import { ENV, ENV_WEATHER, PLACE_ENV } from './config.js';
import { envAirState, envAirToUniforms, envInstallTone, envSkyAt, envUniforms } from './air.js';
import { envNoiseAt } from './noise.js';
import { envBuildSky } from './sky.js';
import { envBuildNearMap, envBuildTerrain, envHeightField, envSunPast } from './terrain.js';
import { envBuildGrass, envGrassQuality } from './grass.js';
import { envBuildTrees, envPlantTrees, envTreeShadows, envTreesQuality } from './trees.js';
import { envBuildParticles, envParticlesPixel, envParticlesSet } from './particles.js';
import { activeLook } from '../looks.js';
import { hidePaintedSky, setRenderer } from '../looks/kit.js';
import { probeLiteProject } from '../looks/probe-lite.js';
import { PLACE_ARENAS, reapplyPlace } from '../render.js';
import { placeWind, setWindOver } from '../wind.js';

// What is chosen for the whole page: `enabled` (false: no place is drawn this way), `weather` a forced ENV_WEATHER
// name or null, `tier` the quality tier in force, and the tier controller's running figures.
const envChosen = { enabled: true, weather: null, tier: 'high', smoothed: 0, slow: 0, fast: 0, wait: 0, sinceUp: Infinity, started: false };

/** The weather on a place now: a { name, ...ENV_WEATHER entry }, or null where the open air stands aside. */
function envWeatherOf(view, place) {
  const own = PLACE_ENV[place];
  if (envChosen.weather) return { name: envChosen.weather, ...ENV_WEATHER[envChosen.weather] };
  const level = view.weatherBrought ? view.weather : null;
  if (level) {
    // Dusk, night and lamp-lit fog are another light altogether: the look draws them as it did.
    if (level.dim !== undefined || level.colour !== undefined || level.halos) return null;
    if (level.fog) {
      // The level's fog was linear from fog[0] to fog[1] m, half gone midway; the haze here is exponential, and is as
      // thick at that midpoint when its visibility is midway x ln 50 / ln 2 (Koschmieder's 2 % against one half).
      const midway = (level.fog[0] + level.fog[1]) / 2;
      return { name: 'mist', ...ENV_WEATHER.mist, visibility: (midway * ENV.air.koschmieder) / Math.LN2, sun: level.sun ?? ENV_WEATHER.mist.sun };
    }
  }
  return { name: own.weather, ...ENV_WEATHER[own.weather] };
}

/** Whether `place` is drawn as open air now: it has a description, the look is the realistic one, the weather is one this draws. */
export function envWanted(view, place) {
  return !!PLACE_ENV[place] && envChosen.enabled && activeLook().id === 'probe-lite' && envWeatherOf(view, place) !== null;
}

/**
 * What stands on the ground of a place and is kept (fences, houses, banners' poles, camp gear): [{ x, z, halfX,
 * halfZ }], so no grass grows through it and no tree is planted on it. Read off the place as built: meshes that
 * reach the ground, stand at least ENV.terrain.standTall high and are no wider than ENV.terrain.standWide.
 */
function envFootprints(group) {
  const prints = [];
  const box = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  const { standTall, standWide } = ENV.terrain;
  const note = () => {
    if (box.isEmpty() || box.min.y > 0.5 || box.max.y < standTall) return;
    const halfX = (box.max.x - box.min.x) / 2;
    const halfZ = (box.max.z - box.min.z) / 2;
    if (halfX > standWide || halfZ > standWide) return;
    prints.push({ x: (box.max.x + box.min.x) / 2, z: (box.max.z + box.min.z) / 2, halfX, halfZ });
  };
  group.updateMatrixWorld(true);
  const visit = (object) => {
    const tags = object.userData;
    if (tags.sceneryVariant || tags.groundStyle || tags.paintedSky || tags.env || tags.scenery) return;
    if (object.isMesh && object.geometry && object.visible) {
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      if (object.isInstancedMesh) {
        // (A scatter of thousands is litter, not furniture.)
        for (let index = 0; index < Math.min(object.count, 400); index += 1) {
          object.getMatrixAt(index, matrix);
          box.copy(object.geometry.boundingBox).applyMatrix4(matrix.premultiply(object.matrixWorld));
          note();
        }
      } else {
        box.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
        note();
      }
    }
    for (const child of object.children) visit(child);
  };
  visit(group);
  return prints;
}

/** The variant's group for a place: sky, land, grass, trees and the air's drift, built once from its description. */
export function envBuild({ place, view, spec }) {
  const own = PLACE_ENV[place];
  const arena = view.floor ?? PLACE_ARENAS[place];
  // The level ground: the scenery's own, and never less than the floor fought on (a battle's is wider than the place's).
  const keepOut = [Math.max(spec.keepOut[0], arena.halfX + 2), Math.max(spec.keepOut[1], arena.halfZ + 2)];
  const sun = envAirState(own, ENV_WEATHER.clear).sun;
  const height = envHeightField(own.terrain, keepOut);
  const footprints = envFootprints(view.places[place]);
  const trees = envPlantTrees({ place: own, height, sun, keepOut, footprints });
  const map = { value: envBuildNearMap({ place: own, height, sun, keepOut, floor: [arena.halfX, arena.halfZ], shadows: envTreeShadows(trees, sun), footprints }) };
  const group = new THREE.Group();
  const parts = {
    sky: envBuildSky(),
    terrain: envBuildTerrain({ place: own, height, sun, map }),
    grass: envBuildGrass({ place: own, map }),
    trees: envBuildTrees({ place: own, trees }),
    particles: envBuildParticles(),
  };
  group.add(parts.sky, parts.terrain, parts.grass, parts.trees, parts.particles);
  group.userData.env = 'open-air';
  group.userData.envParts = parts;
  group.userData.envHeight = height;
  return group;
}

/** Draw the tier in force: what share of the blades, the leaf cards and the drift, and whether clouds shade the land. */
function envApplyTier(state) {
  const quality = ENV.quality[envChosen.tier];
  const parts = state.group.userData.envParts;
  envGrassQuality(parts.grass, quality.grass, quality.far);
  envTreesQuality(parts.trees, quality.cards);
  envParticlesSet(parts.particles, PLACE_ENV[state.place].drift, state.weather, quality.particles);
  envAirToUniforms(state.air, state.weather, quality);
}

/** Take the scene over for the place: the light, the haze, the far plane, the wind, the weather's share of everything. */
export function envApply({ place, view, group }) {
  const own = PLACE_ENV[place];
  const weather = envWeatherOf(view, place);
  const air = envAirState(own, weather);
  const lights = view.lights;
  const st = view.lookState?.['probe-lite'];

  // The frame ends in the shoulder curve, here only (looks.js resets the renderer when the place is lit again).
  envInstallTone();
  setRenderer(view, { toneMapping: THREE.CustomToneMapping, toneMappingExposure: ENV.tone.exposure });

  // One sky: the look's dome and the painted ones stand down, and the fighters' ambient light is this sky's.
  if (st?.dome) st.dome.visible = false;
  hidePaintedSky(view);
  if (st?.probe) view.scene.remove(st.probe);
  const probe = view.env?.probe ?? new THREE.LightProbe();
  probeLiteProject(probe.sh, (x, y, z, out) => envSkyAt(air, x, y, z, out));
  probe.intensity = 1;
  view.scene.add(probe);

  // The sun on the fighters and what stands on the floor: the colour the land is lit with, cut by what the hills
  // take of it at the floor's middle (and, each frame, by the cloud over it: envUpdate).
  const peak = Math.max(air.sunColour[0], air.sunColour[1], air.sunColour[2], 1e-3);
  lights.sun.visible = true;
  lights.sun.color.setRGB(air.sunColour[0] / peak, air.sunColour[1] / peak, air.sunColour[2] / peak);
  const sunPower = peak * envSunPast(group.userData.envHeight, air.sun, 0, 1, 0);
  lights.sun.intensity = sunPower;
  lights.sun.position.set(air.sun[0], air.sun[1], air.sun[2]).multiplyScalar(14);
  lights.sun.target.position.set(0, 0, 0);

  // What is not drawn by an env shader (fighters, props) is hazed by the renderer's fog: exponential-squared is the
  // one it has, set to agree with the haze at ENV.air.fogMatch m, about the far side of a floor.
  const horizon = new THREE.Color(air.horizon[0], air.horizon[1], air.horizon[2]);
  view.scene.background = horizon;
  view.scene.fog = new THREE.FogExp2(horizon.getHex(), Math.sqrt(air.extinction / ENV.air.fogMatch));
  view.cameraFar = ENV.terrain.reach * 1.25;
  view.camera.far = view.cameraFar;
  view.camera.updateProjectionMatrix();

  // One wind for everything: the place's (or the level's), as the weather drives it, put in force for the cloth
  // and the flames too (wind.js setWindOver), its gusts the same field the grass shows (envGustAt).
  setWindOver(null);
  const base = placeWind(place, view.weatherBrought ? view.weather : null);
  const wind = { x: base.x, z: base.z, speed: base.speed * weather.wind, gust: Math.min(1, base.gust + weather.gust) };
  wind.swell = (time) => envGustAt(wind, time, 0, 0);
  setWindOver(place, wind);
  view.clothWindBase = null;
  view.windBase = null;

  view.env = { on: true, place, group, air, weather, wind, probe, sunPower };
  if (!envChosen.started) {
    // A phone or a tablet starts a tier down; the controller raises it if the frames allow.
    envChosen.started = true;
    if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) envChosen.tier = ENV.adapt.touchStart;
  }
  envApplyTier(view.env);
  envUpdate(view, null);
}

/** Hand the scene back: called before any scenery is applied; the light rig, fog and renderer are reset by the place's own lighting. */
export function envLeave(view) {
  if (!view.env?.on) return;
  view.env.on = false;
  view.scene.remove(view.env.probe);
  setWindOver(null);
  view.clothWindBase = null;
  view.windBase = null;
}

/** The gust pattern at a point of the ground and a moment (air.js envGust, on the processor): the local speed over the mean. */
function envGustAt(wind, time, x, z) {
  const tune = ENV.wind;
  const px = x - wind.x * wind.speed * time;
  const pz = z - wind.z * wind.speed * time;
  const along = px * wind.x + pz * wind.z;
  const across = (-px * wind.z + pz * wind.x) / tune.across;
  const front = envNoiseAt(along / (tune.long * 16), across / (tune.long * 16), 0);
  const paw = envNoiseAt(along / (tune.short * 16) + 0.31, across / (tune.short * 16) + 0.67, 1);
  return Math.max(0, 1 + tune.depth * wind.gust * ((front * 0.65 + paw * 0.35) - 0.5) * 2);
}

/** How much of the sun the clouds leave at the floor's middle (air.js envSunShare, on the processor). */
function envCloudShareAt(air, travelX, travelZ, strength) {
  if (strength <= 0) return 1;
  const slant = (ENV.clouds.height / ENV.clouds.scale) / Math.max(air.sun[1], 0.12);
  const broad = envNoiseAt((air.sun[0] * slant - travelX) * 0.125, (air.sun[2] * slant - travelZ) * 0.125, 2);
  const edge = 0.74 + (0.26 - 0.74) * air.cover;
  const t = Math.min(1, Math.max(0, (broad * 0.68 + 0.16 - (edge - 0.12)) / 0.28));
  return 1 - strength * t * t * (3 - 2 * t);
}

let envLookWay = null;

/** Once a frame, before drawing: the time, how far the air and the clouds have travelled, and the cloud over the fighters' sun. */
export function envUpdate(view, world) {
  const state = view.env;
  if (!state?.on || state.place !== view.place) return;
  const u = envUniforms();
  // The fight's own clock, so the air stands still when the fight does; with no fight on, the page's.
  const time = world ? world.time : performance.now() / 1000;
  const wind = state.wind;
  u.uEnvTime.value = time;
  u.uEnvWind.value.set(wind.x, wind.z, wind.speed, wind.gust);
  u.uEnvWindTravel.value.set(wind.x * wind.speed * time, wind.z * wind.speed * time);
  const aloft = (wind.speed * ENV.clouds.aloft * time) / ENV.clouds.scale;
  u.uEnvCloudTravel.value.set(wind.x * aloft, wind.z * aloft);
  envLookWay ??= new THREE.Vector3();
  view.camera.getWorldDirection(envLookWay);
  u.uEnvLook.value.set(envLookWay.x, envLookWay.z);
  view.lights.sun.intensity = state.sunPower * envCloudShareAt(state.air, wind.x * aloft, wind.z * aloft, u.uEnvCloud.value.y);
  envParticlesPixel(state.group.userData.envParts.particles, (view.camera.fov * Math.PI) / 180, view.renderer.domElement.height);
}

/** Put a weather on (a name in ENV_WEATHER), or with null go back to each place's own. Returns the name in force, or null. */
export function envSetWeather(view, name) {
  if (name !== null && !ENV_WEATHER[name]) {
    console.warn(`no weather ${name}; the weathers are ${Object.keys(ENV_WEATHER).join(', ')}`);
    return envChosen.weather;
  }
  envChosen.weather = name;
  if (view?.place) reapplyPlace(view);
  return name;
}

/** Every place as it was before this system (false), or drawn as open air where it has a description (true). */
export function envSetEnabled(view, on) {
  envChosen.enabled = !!on;
  if (view?.place) reapplyPlace(view);
  return envChosen.enabled;
}

/** What is in force, for the console and for tests: { on, place, weather, tier, weathers, wind }. */
export function envInfo(view) {
  const state = view?.env;
  return {
    enabled: envChosen.enabled,
    on: !!state?.on,
    place: state?.on ? state.place : null,
    weather: state?.on ? state.weather.name : envChosen.weather,
    forced: envChosen.weather,
    tier: envChosen.tier,
    weathers: Object.keys(ENV_WEATHER),
    wind: state?.on ? { x: state.wind.x, z: state.wind.z, speed: state.wind.speed, gust: state.wind.gust } : null,
  };
}

/** Set the tier (a name in ENV.quality) and draw it. */
export function envSetTier(view, tier) {
  if (!ENV.quality[tier] || tier === envChosen.tier) return envChosen.tier;
  envChosen.tier = tier;
  if (view?.env?.on) envApplyTier(view.env);
  return tier;
}

/**
 * Once a frame: keep the env's quality tier at what the device draws in time. `ms` the frame's interval, `mode` the
 * quality setting ('auto', or 'high' / 'low' pinning the tier). In auto the tier steps down after frames have run
 * long for ENV.adapt.slowSeconds and up again after they have run short for `fastSeconds`; a step up that had to
 * be taken back doubles the wait before the next.
 */
export function envAdapt(view, ms, mode) {
  if (!view.env?.on) return;
  const tune = ENV.adapt;
  if (mode === 'high' || mode === 'low') {
    envSetTier(view, mode);
    return;
  }
  // A stall (a tab switched away, a place being built) says nothing about the device.
  if (!(ms > 0) || ms > tune.stallMs) return;
  envChosen.smoothed = envChosen.smoothed ? envChosen.smoothed + (ms - envChosen.smoothed) * tune.smoothing : ms;
  const tiers = tune.tiers;
  const at = tiers.indexOf(envChosen.tier);
  const seconds = ms / 1000;
  envChosen.slow = envChosen.smoothed > tune.slowMs ? envChosen.slow + seconds : 0;
  envChosen.fast = envChosen.smoothed < tune.fastMs ? envChosen.fast + seconds : 0;
  if (envChosen.slow > tune.slowSeconds && at < tiers.length - 1) {
    // Stepping down soon after a step up: that step was too much, wait longer before trying it again.
    if (envChosen.wait > 0 && envChosen.sinceUp < tune.fastSeconds) envChosen.wait *= 2;
    envSetTier(view, tiers[at + 1]);
    envChosen.slow = 0;
    envChosen.fast = 0;
  } else if (envChosen.fast > Math.max(tune.fastSeconds, envChosen.wait) && at > 0) {
    envSetTier(view, tiers[at - 1]);
    envChosen.wait = Math.max(envChosen.wait, tune.fastSeconds);
    envChosen.sinceUp = 0;
    envChosen.slow = 0;
    envChosen.fast = 0;
  }
  envChosen.sinceUp += seconds;
}
