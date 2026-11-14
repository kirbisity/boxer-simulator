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
// A place that draws itself (a town, a walled city) joins from its own module, without a line here:
//   envRegisterPlace(name, description)   describe it (config.js: `own: true` and what differs from ENV_PLACE_PLAIN)
//   envRegisterWeather(name, over, values)  a weather of its own, laid over one of ENV_WEATHER's
//   envPlaceWeather(view, place, name)    the weather on that place from now on
// and reads back, each frame, view.env (on, air, weather, wind, falling: 0..1 of the weather's fall coming down at
// the camera now, wet: 0..1 the ground's wetness now) and the shared uniforms (air.js ENV_UNIFORMS).
//
// What a level brings is honoured: a level's own mist (scenarios.js `weather.fog`) becomes the env's mist at the
// same thickness, and a dusk or night scene (`dim`, `colour`, `halos`) is left to the look that already draws it.

/* global THREE */

import { ENV, ENV_PLACE_PLAIN, ENV_WEATHER, PLACE_ENV } from './config.js';
import { envAirState, envAirToUniforms, envInstallTone, envSkyAt, envSunWay, envUniforms } from './air.js';
import { envNoiseAt } from './noise.js';
import { envBuildSky } from './sky.js';
import { envBuildNearMap, envBuildTerrain, envHeightField, envInstallShadow, envSunPast } from './terrain.js';
import { envBuildGrass, envGrassQuality } from './grass.js';
import { envBuildTrees, envPlantTrees, envTreeShadows, envTreesQuality } from './trees.js';
import { envBeamsLook, envBuildBeams, envBuildParticles, envParticlesFalling, envParticlesPixel, envParticlesSet } from './particles.js';
import { envMeter, envPostDraw, envToneOf } from './post.js';
import { activeLook } from '../looks.js';
import { hidePaintedSky, setRenderer } from '../looks/kit.js';
import { probeLiteProject } from '../looks/probe-lite.js';
import { PLACE_ARENAS, reapplyPlace } from '../render.js';
import { placeWind, setWindOver } from '../wind.js';
import { PHOTO_FACES, setPhotoFill } from '../photoface.js';

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
 * Describe a place to the open air at run time: `description` laid over ENV_PLACE_PLAIN (config.js lists what a
 * place that draws itself may say). From then on scenery.js joins it and leaves it as it does the others.
 */
export function envRegisterPlace(name, description) {
  PLACE_ENV[name] = { ...ENV_PLACE_PLAIN, ...description };
  return PLACE_ENV[name];
}

/** A weather of a place's own: `values` laid over the ENV_WEATHER entry `over` (a town's damp morning over 'mist'). */
export function envRegisterWeather(name, over, values) {
  ENV_WEATHER[name] = { ...ENV_WEATHER[over], ...values };
  return ENV_WEATHER[name];
}

/** Put a weather on one place from now on (a battle's own day), and show it if the place is shown. Returns the name, or null if either is unknown. */
export function envPlaceWeather(view, place, name) {
  if (!PLACE_ENV[place] || !ENV_WEATHER[name]) return null;
  PLACE_ENV[place].weather = name;
  if (view?.place === place) reapplyPlace(view);
  return name;
}

/** Whether `place` draws itself and only joins the open air (no land, grass or trees are made for it, nothing of it hidden). */
export const envOwnDrawn = (place) => !!PLACE_ENV[place]?.own;

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
  const group = new THREE.Group();
  group.userData.env = 'open-air';
  envFill(group, place, view, spec);
  return group;
}

/** Make a place's open air into `group` from its description as it is now (again, if the place is described again: envApply). */
function envFill(group, place, view, spec) {
  const own = PLACE_ENV[place];
  const arena = view.floor ?? PLACE_ARENAS[place];
  const sun = envSunWay(own.sun);
  group.userData.envMap?.dispose();
  group.userData.envMap?.envCover?.dispose();
  group.traverse((object) => {
    object.geometry?.dispose();
    object.material?.dispose();
  });
  group.clear();
  group.userData.envOf = own;
  if (own.own) {
    // A place that draws itself: the sky, what falls and drifts over its own ground and under its own roofs, and
    // the sun through its openings.
    const height = own.height ?? (() => 0);
    const map = { value: envBuildNearMap({ place: own, height, sun, keepOut: [0, 0], floor: [arena.halfX, arena.halfZ], shadows: [], footprints: [] }) };
    map.cover = { value: map.value.envCover };
    const parts = { sky: envBuildSky(), particles: envBuildParticles(map, own.cover), beams: envBuildBeams(own.openings ?? [], sun) };
    group.add(parts.sky, parts.particles, parts.beams);
    group.userData.envParts = parts;
    group.userData.envHeight = height;
    group.userData.envMap = map.value;
    return;
  }
  // The level ground: the scenery's own, and never less than the floor fought on (a battle's is wider than the place's).
  const keepOut = [Math.max(spec.keepOut[0], arena.halfX + 2), Math.max(spec.keepOut[1], arena.halfZ + 2)];
  const height = envHeightField(own.terrain, keepOut);
  const footprints = envFootprints(view.places[place]);
  const trees = envPlantTrees({ place: own, height, sun, keepOut, footprints });
  const map = { value: envBuildNearMap({ place: own, height, sun, keepOut, floor: [arena.halfX, arena.halfZ], shadows: envTreeShadows(trees, sun), footprints }) };
  map.cover = { value: map.value.envCover };
  const parts = {
    sky: envBuildSky(),
    terrain: envBuildTerrain({ place: own, height, sun, map }),
    grass: envBuildGrass({ place: own, map }),
    trees: envBuildTrees({ place: own, trees }),
    particles: envBuildParticles(map, own.cover),
    beams: envBuildBeams(own.openings ?? [], sun),
  };
  group.add(parts.sky, parts.terrain, parts.grass, parts.trees, parts.particles, parts.beams);
  group.userData.envParts = parts;
  group.userData.envHeight = height;
  group.userData.envMap = map.value;
}

/** Draw the tier in force: what share of the blades, the leaf cards and the drift, and whether clouds shade the land. */
function envApplyTier(state) {
  const quality = ENV.quality[envChosen.tier];
  const parts = state.group.userData.envParts;
  if (parts.grass) envGrassQuality(parts.grass, quality.grass, quality.far);
  if (parts.trees) envTreesQuality(parts.trees, quality.cards);
  envParticlesSet(parts.particles, PLACE_ENV[state.place].drift, state.weather, quality.particles);
  envAirToUniforms(state.air, state.weather, quality, PLACE_ENV[state.place]);
}

/** Take the scene over for the place: the light, the haze, the far plane, the wind, the weather's share of everything. */
export function envApply({ place, view, spec, group }) {
  const own = PLACE_ENV[place];
  // (A place described again since this was made, by envRegisterPlace, is made again.)
  if (group.userData.envOf !== own) envFill(group, place, view, spec);
  const weather = envWeatherOf(view, place);
  const air = envAirState(own, weather);
  const lights = view.lights;
  const st = view.lookState?.['probe-lite'];

  // The frame ends as a camera's does (post.js), here only (looks.js resets the renderer when the place is lit again).
  const tone = envToneOf(air, weather);
  envInstallTone();
  envInstallShadow();
  setRenderer(view, { toneMapping: THREE.CustomToneMapping });
  view.drawOver = envDraw;
  // The faces' fill, for this light (config.js faceFill): the place's own comes back when it is left.
  const fill = view.env?.on ? view.env.fill : PHOTO_FACES.fill;
  setPhotoFill(ENV.tone.faceFill, view.scene);

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
  if (own.own) {
    // A place that draws itself keeps the shadow box where it put it (or has it carried: envUpdate); the sun
    // stands the description's way from whatever it is aimed at.
    const target = lights.sun.target.position;
    const stand = lights.sun.position.distanceTo(target) || 14;
    lights.sun.position.set(air.sun[0], air.sun[1], air.sun[2]).multiplyScalar(stand).add(target);
  } else {
    lights.sun.position.set(air.sun[0], air.sun[1], air.sun[2]).multiplyScalar(14);
    lights.sun.target.position.set(0, 0, 0);
  }
  // The sun's shadow as the look made it, to hand back: its edge (envUpdate sets the sun's width each frame) and its box.
  const shadow = lights.sun.shadow;
  const radius = view.env?.on ? view.env.radius : shadow.radius;
  const box = view.env?.on ? view.env.box : ['left', 'right', 'top', 'bottom', 'near', 'far'].map((side) => shadow.camera[side]);

  // What is not drawn by an env shader (fighters, props) is hazed by the renderer's fog: exponential-squared is the
  // one it has, set to agree with the haze at ENV.air.fogMatch m, about the far side of a floor.
  const horizon = new THREE.Color(air.horizon[0], air.horizon[1], air.horizon[2]);
  view.scene.background = horizon;
  view.scene.fog = new THREE.FogExp2(horizon.getHex(), Math.sqrt(air.extinction / ENV.air.fogMatch));
  // (A place that draws itself knows how far it reaches; the sky needs no far plane: it is drawn at the camera.)
  if (!own.own || own.far) {
    view.cameraFar = own.far ?? ENV.terrain.reach * 1.25;
    view.camera.far = view.cameraFar;
    view.camera.updateProjectionMatrix();
  }

  // One wind for everything: the place's (or the level's), as the weather drives it, put in force for the cloth
  // and the flames too (wind.js setWindOver), its gusts the same field the grass shows (envGustAt).
  setWindOver(null);
  const reach = own.wind ? Math.hypot(...own.wind.toward) || 1 : 1;
  const base = own.wind ? { x: own.wind.toward[0] / reach, z: own.wind.toward[1] / reach, speed: own.wind.speed, gust: own.wind.gust } : placeWind(place, view.weatherBrought ? view.weather : null);
  const wind = { x: base.x, z: base.z, speed: base.speed * weather.wind, gust: Math.min(1, base.gust + weather.gust) };
  wind.swell = (time) => envGustAt(wind, time, 0, 0);
  setWindOver(place, wind);
  view.clothWindBase = null;
  view.windBase = null;

  // (The ground stays as wet as it was through a change of light or tier under the same weather.)
  const wet = view.env?.place === place && view.env.weather.name === weather.name ? view.env.wet : undefined;
  view.env = { on: true, place, group, air, weather, wind, probe, sunPower, tone, shafts: 0, radius, box, fill, wet, falling: 0, time: undefined };
  envUniforms().uEnvOn.value = 1;
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
  view.drawOver = null;
  envUniforms().uEnvOn.value = 0;
  const shadow = view.lights.sun.shadow;
  shadow.radius = view.env.radius;
  ['left', 'right', 'top', 'bottom', 'near', 'far'].forEach((side, at) => { shadow.camera[side] = view.env.box[at]; });
  shadow.camera.updateProjectionMatrix();
  setPhotoFill(view.env.fill, view.scene);
  view.scene.remove(view.env.probe);
  setWindOver(null);
  view.clothWindBase = null;
  view.windBase = null;
}

/** The view's frame (looks.js drawFrame asks): through the camera's last passes where the tier has them and the device can. */
function envDraw(view) {
  const state = view.env;
  if (!state?.on) return false;
  const level = ENV.quality[envChosen.tier].post;
  envMeter(state.tone, state.air, envLookWay.x, envLookWay.z);
  if (level > 0 && envPostDraw(view, state.tone, level, state.shafts)) return true;
  view.renderer.toneMappingExposure = state.tone.exposure;
  return false;
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

/**
 * How far inside the cloud a sheet point is (air.js envCloudDepth, on the processor): below 0 a gap. Without
 * `grain` the broad masses alone, the fine grain at its mean (what shades a whole floor at once).
 */
function envCloudDepthAt(air, sheetX, sheetZ, grain = false) {
  const fine = grain ? envNoiseAt(sheetX * 0.53 + 0.37, sheetZ * 0.53 + 0.11, 3) : 0.5;
  return envNoiseAt(sheetX * 0.125, sheetZ * 0.125, 2) * 0.68 + fine * 0.32 - (0.74 + (0.26 - 0.74) * air.cover);
}

const envEase = (from, to, value) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/** How much of the sun the clouds leave at the floor's middle (air.js envSunShare, on the processor). */
function envCloudShareAt(air, travelX, travelZ, strength) {
  if (strength <= 0) return 1;
  const slant = (ENV.clouds.height / ENV.clouds.scale) / Math.max(air.sun[1], 0.12);
  return 1 - strength * envEase(-0.12, 0.16, envCloudDepthAt(air, air.sun[0] * slant - travelX, air.sun[2] * slant - travelZ));
}

/**
 * Carry the sun's shadow box with the camera (a description's `shadowBox`): `half` m each way round the ground
 * ahead of the camera, `depth` m from the sun's stand to it, moved a whole texel at a time along the light's own
 * right and up so a shadow's edge does not crawl as the camera moves.
 */
function envCarryShadow(view, state, box) {
  const sun = view.lights.sun;
  const camera = sun.shadow.camera;
  const [sx, sy, sz] = state.air.sun;
  if (camera.right !== box.half || camera.far !== box.depth * 1.5) {
    camera.left = camera.bottom = -box.half;
    camera.right = camera.top = box.half;
    camera.near = box.depth * 0.5;
    camera.far = box.depth * 1.5;
    camera.updateProjectionMatrix();
  }
  const eye = view.camera.position;
  const fx = eye.x + envLookWay.x * box.half * 0.6;
  const fz = eye.z + envLookWay.z * box.half * 0.6;
  const fy = state.group.userData.envHeight(fx, fz);
  // The light's right (level, across the sun's way) and up, as the shadow camera has them.
  const level = Math.hypot(sx, sz) || 1;
  const rx = sz / level;
  const rz = -sx / level;
  const ux = sy * rz;
  const uy = sz * rx - sx * rz;
  const uz = -sy * rx;
  const texel = (2 * box.half) / sun.shadow.mapSize.x;
  const right = fx * rx + fz * rz;
  const up = fx * ux + fy * uy + fz * uz;
  const dr = Math.round(right / texel) * texel - right;
  const du = Math.round(up / texel) * texel - up;
  sun.target.position.set(fx + rx * dr + ux * du, fy + uy * du, fz + rz * dr + uz * du);
  sun.position.set(sx, sy, sz).multiplyScalar(box.depth).add(sun.target.position);
  sun.target.updateMatrixWorld();
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
  const own = PLACE_ENV[state.place];
  const parts = state.group.userData.envParts;
  const eye = view.camera.position;

  // A shower: what falls comes out of thick cloud only, so it comes and goes as the sheet crosses overhead (the
  // same sheet the sky shows and the land is shaded by), the air thickens in it, and the ground wets fast and
  // dries slowly behind it (config.js `fall.under`, ENV.terrain.wetIn).
  const fall = state.weather.fall;
  let falling = fall ? 1 : 0;
  let thick = 1;
  if (fall?.under) {
    const cloud = envCloudDepthAt(state.air, eye.x / ENV.clouds.scale - wind.x * aloft, eye.z / ENV.clouds.scale - wind.z * aloft, true);
    const share = envEase(fall.under[0], fall.under[1], cloud);
    falling = fall.least + (1 - fall.least) * share;
    thick = 1 + (state.air.visibility / fall.thick - 1) * share;
    envParticlesFalling(parts.particles, fall.kind, falling);
  }
  const wetTo = state.weather.wet * (fall?.under && falling < 0.3 ? ENV.terrain.dryTo : 1);
  const passed = Math.max(0, time - (state.time ?? time));
  state.time = time;
  state.wet = state.wet === undefined ? wetTo : state.wet + (wetTo - state.wet) * (1 - Math.exp(-passed / (wetTo > state.wet ? ENV.terrain.wetIn : ENV.terrain.dryOut)));
  state.falling = falling;
  u.uEnvWet.value.x = state.wet;
  u.uEnvFall.value = falling;
  const extinction = state.air.extinction * thick;
  u.uEnvHaze.value.set(extinction * state.air.hazeHue[0], extinction * state.air.hazeHue[1], extinction * state.air.hazeHue[2], u.uEnvHaze.value.w);
  u.uEnvRayleigh.value.w = extinction;
  view.scene.fog.density = Math.sqrt(extinction / ENV.air.fogMatch);
  // The shafts: the share of light the air scatters toward the eye over the depth of a view (what falls is part
  // of that air), of the sun there is.
  state.shafts = ENV.post.shafts * state.weather.sun * (1 - Math.exp(-extinction * ENV.post.shaftPath));

  // The sun's shadow: its box carried where the place asks, and its width in the edge (terrain.js
  // envInstallShadow): texels of blur per unit of the map's depth, of the box as it is now.
  if (own.shadowBox) envCarryShadow(view, state, own.shadowBox);
  const shadow = view.lights.sun.shadow;
  shadow.radius = -((shadow.camera.far - shadow.camera.near) * ENV.shadow.sunWidth * ENV.shadow.soften) / ((shadow.camera.right - shadow.camera.left) / shadow.mapSize.x);
  if (parts.beams) envBeamsLook(parts.beams, eye);
  // What stands on the ground, for the shade at its feet and the grass under them: the fighters nearest the camera.
  const bodies = u.uEnvBodies.value;
  const [foot, hips] = ENV.shadow.bodies;
  let filled = 0;
  if (world?.fighters) {
    const near = world.fighters.filter((fighter) => fighter?.x?.length >= 45).map((fighter) => ({ x: fighter.x, far: Math.hypot(fighter.x[24] - eye.x, fighter.x[26] - eye.z) })).sort((a, b) => a.far - b.far);
    for (const { x } of near.slice(0, bodies.length / 3)) {
      // (body.js: the hips are particle 8, the feet 13 and 14.)
      bodies[filled++].set(x[39], x[40], x[41], foot);
      bodies[filled++].set(x[42], x[43], x[44], foot);
      bodies[filled++].set(x[24], x[25], x[26], hips);
    }
  }
  // Their middle and their reach: past `bodyReach` m from the farthest of them the shade is under a hundredth.
  const middle = u.uEnvBodiesAt.value.set(0, 0, 0, 0);
  for (let at = 0; at < filled; at += 1) middle.set(middle.x + bodies[at].x / filled, middle.y + bodies[at].y / filled, middle.z + bodies[at].z / filled, 0);
  for (let at = 0; at < filled; at += 1) middle.w = Math.max(middle.w, Math.hypot(bodies[at].x - middle.x, bodies[at].y - middle.y, bodies[at].z - middle.z) + ENV.shadow.bodyReach);
  for (; filled < bodies.length; filled += 1) bodies[filled].w = 0;
  envParticlesPixel(parts.particles, (view.camera.fov * Math.PI) / 180, view.renderer.domElement.height);
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
    falling: state?.on ? state.falling : 0,
    wet: state?.on ? state.wet : 0,
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
