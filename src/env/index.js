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

import { ENV, ENV_PLACE_PLAIN, ENV_TREES, ENV_WEATHER, PLACE_ENV } from './config.js';
import { envAirState, envAirToUniforms, envInstallTone, envSkyAt, envSunWay, envUniforms } from './air.js';
import { envNoiseAt } from './noise.js';
import { envBuildSky } from './sky.js';
import { envBuildNearMap, envBuildTerrain, envHeightField, envInstallShadow, envSunPast } from './terrain.js';
import { envBuildGrass, envGrassQuality } from './grass.js';
import { envBuildRocks, envBuildSkyline, envBuildTrees, envPlantRocks, envPlantTrees, envRockShadows, envTreeShadows, envTreesQuality } from './trees.js';
import { envBeamsLook, envBuildBeams, envBuildParticles, envParticlesFalling, envParticlesPixel, envParticlesSet } from './particles.js';
import { envMeter, envPostAble, envPostDraw, envToneOf } from './post.js';
import { envPressForget, envPressStep } from './press.js';
import { envLieOf } from './lie.js';
import { activeLook } from '../looks.js';
import { hidePaintedSky, replaceEnvironment, setRenderer } from '../looks/kit.js';
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
  // (The place's own weather, as it is on this place: config.js `weatherHere`.)
  return { name: own.weather, ...ENV_WEATHER[own.weather], ...(own.weatherHere ?? {}) };
}

/**
 * The place as it stands under a weather. Its description is its own day: the sun, the cloud and the air that go
 * with its own weather. Under any weather but that one (`other.than`), picked by name or brought by a battle, a
 * place whose own day is a mood (an evening, a dawn) stands as `other` says instead, so that a snow shower or
 * a mist looks like itself there and not like the evening with snow in it (config.js). One made object a place,
 * so that the land is made again only when the day changes (envApply).
 */
const envPlacesOther = new WeakMap();
function envPlaceIn(place, weather) {
  const own = PLACE_ENV[place];
  if (!own?.other || !weather || weather.name === own.other.than) return own;
  if (!envPlacesOther.has(own)) envPlacesOther.set(own, { ...own, ...own.other });
  return envPlacesOther.get(own);
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
    prints.push({ x: (box.max.x + box.min.x) / 2, z: (box.max.z + box.min.z) / 2, halfX, halfZ, top: box.max.y });
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
  envFill(group, place, view, spec, envPlaceIn(place, envWeatherOf(view, place)));
  return group;
}

/** Make a place's open air into `group` from its description as it is now (again, if the place is described again: envApply). */
function envFill(group, place, view, spec, own) {
  const arena = view.floor ?? PLACE_ARENAS[place];
  const sun = envSunWay(own.sun);
  group.userData.envMap?.dispose();
  group.userData.envMap?.envCover?.dispose();
  group.userData.envMap?.envSkyline?.dispose();
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
    group.userData.envCrowns = [0, 1];
    return;
  }
  // The level ground: the scenery's own, and never less than the floor fought on (a battle's is wider than the place's).
  const keepOut = [Math.max(spec.keepOut[0], arena.halfX + 2), Math.max(spec.keepOut[1], arena.halfZ + 2)];
  // (The fought ground on the physics's own field, lie.js: the same triangles the fighters stand on.)
  const height = envHeightField(own.terrain, keepOut, envLieOf(place, arena));
  const footprints = envFootprints(view.places[place]);
  const trees = envPlantTrees({ place: own, height, sun, keepOut, footprints });
  const rocks = envPlantRocks({ place: own, height, sun, keepOut, footprints });
  const map = { value: envBuildNearMap({ place: own, height, sun, keepOut, floor: [arena.halfX, arena.halfZ], shadows: envTreeShadows(trees, sun).concat(envRockShadows(rocks, sun)), footprints }) };
  map.cover = { value: map.value.envCover };
  map.value.envSkyline = envBuildSkyline(trees, footprints);
  map.skyline = { value: map.value.envSkyline };
  const parts = {
    sky: envBuildSky(),
    terrain: envBuildTerrain({ place: own, height, sun, map }),
    grass: envBuildGrass({ place: own, map }),
    trees: envBuildTrees({ place: own, trees }),
    rocks: envBuildRocks({ place: own, rocks, height }),
    particles: envBuildParticles(map, own.cover),
    beams: envBuildBeams(own.openings ?? [], sun),
  };
  group.add(parts.sky, parts.terrain, parts.grass, parts.trees, parts.rocks, parts.particles, parts.beams);
  group.userData.envParts = parts;
  group.userData.envHeight = height;
  // (The land the camera is kept above: render.js groundHeightAt reads a place's child that carries `heightAt`.)
  group.userData.heightAt = height;
  group.userData.envMap = map.value;
  // Where the near crowns begin and where a point is over most of them (m over the ground): between the two the
  // near map stops telling what shades the air (air.js envSunward). A quarter of them begin below the first.
  const near = trees.filter((tree) => tree.height > 4 && Math.abs(tree.x) < ENV.terrain.mapHalf && Math.abs(tree.z) < ENV.terrain.mapHalf);
  const part = (share, of) => (near.length ? near.map(of).sort((a, b) => a - b)[Math.floor(share * (near.length - 1))] : 0);
  group.userData.envCrowns = [part(0.25, (tree) => tree.height * (ENV_TREES[tree.kind].crown.at - ENV_TREES[tree.kind].crown.tall)), 1 + part(0.5, (tree) => tree.height * (ENV_TREES[tree.kind].crown.at + ENV_TREES[tree.kind].crown.tall))];
}

/** Draw the tier in force: what share of the blades, the leaf cards and the drift, and whether clouds shade the land. */
function envApplyTier(state) {
  const quality = ENV.quality[envChosen.tier];
  const parts = state.group.userData.envParts;
  if (parts.grass) envGrassQuality(parts.grass, quality.grass, quality.far);
  if (parts.trees) envTreesQuality(parts.trees, quality.cards);
  envParticlesSet(parts.particles, state.own.drift, state.weather, quality.particles);
  envAirToUniforms(state.air, state.weather, quality, state.own);
  // Shade in the air: the place's near map for what asks it, and whether each sight line is walked (envUpdate
  // gives the frame its one share where they are not).
  const u = envUniforms();
  const [from, to] = state.group.userData.envCrowns;
  u.uEnvMap.value = state.group.userData.envMap;
  u.uEnvCover.value = state.group.userData.envMap.envCover;
  u.uEnvShade.value.set(ENV.air.shadeBeam, from, to, quality.airShade ? -1 : state.airShare ?? 1);
}

/** Take the scene over for the place: the light, the haze, the far plane, the wind, the weather's share of everything. */
export function envApply({ place, view, spec, group }) {
  const weather = envWeatherOf(view, place);
  const own = envPlaceIn(place, weather);
  envPressForget();
  // (A place described again since this was made, by envRegisterPlace, is made again; so is one whose day has
  // changed with the weather: the sun's place is in the shadows laid on its land.)
  if (group.userData.envOf !== own) envFill(group, place, view, spec, own);
  const air = envAirState(own, weather);
  const lights = view.lights;
  const st = view.lookState?.['probe-lite'];

  // The frame ends as a camera's does (post.js), here only (looks.js resets the renderer when the place is lit again).
  const tone = envToneOf(air, weather, own);
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
  // (Among walls the floor sees less than all of it, and so does who stands there: the share the meter is told
  // of, config.js `meter.sky`. With the whole sky on them and the camera opened for three quarters of it, skin
  // in the valley's clearing stood a third of a stop over the land round it and washed out.)
  probe.intensity = own.meter?.sky ?? 1;
  view.scene.add(probe);
  // What metal mirrors: this sky over the horizon and this land under it (envSteelSky), where it had mirrored a
  // painted studio sky, white overhead and grey underfoot, that took no account of the place, its cloud, its
  // ground or the camera's exposure; the shared map goes back when the place is left.
  envSteelSwap(view, air, own.meter?.sky ?? 1, view.envSteelShare ?? 1);

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
  view.env = { on: true, place, own, group, air, weather, wind, probe, sunPower, tone, shafts: 0, radius, box, fill, wet, falling: 0, time: undefined };
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
  if (view.envSteelOurs) {
    // (Where the look has been put back already (looks.js resetForLook, before the next place's scenery) it has
    // taken its own map back from every material; otherwise the map the open air found goes back.)
    if (view.steelEnv === view.envSteelOurs) replaceEnvironment(view, view.envSteelWas);
    view.envSteelOurs.dispose();
    view.envSteelOurs = null;
  }
  envPressForget();
  envUniforms().uEnvOn.value = 0;
  envUniforms().uEnvExposure.value = 1;
  envUniforms().uEnvPlaceSun.value = null;
  envUniforms().uEnvPlaceSunOn.value.x = 0;
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

/**
 * The map metal mirrors under an air state (an equirectangular picture made into the renderer's prefiltered
 * environment, as steelEnvironment in wardrobe.js makes the painted one): the sky the place's light probe is
 * made of (air.js envSkyAt) over the horizon, its broken cloud laid in by the share of the sky it covers (a
 * rough plate's reflection is spread over tens of degrees: the cloud's mean, not its masses), and the land
 * under the horizon, lit as the land is and as dark as its ground. `open`: the share of the sky the floor sees
 * (a place's meter.sky); what hides the rest (crowns, walls) stands round the floor, low, as dark as the land. `share`: what the cloud
 * leaves of the sun on the land round the fight. ENV.steel says the size.
 */
function envSteelSwap(view, air, open, share) {
  const steel = envSteelSky(view.renderer, air, open, share);
  if (!view.envSteelOurs) view.envSteelWas = view.steelEnv;
  const before = view.envSteelOurs;
  replaceEnvironment(view, steel);
  before?.dispose();
  view.envSteelOurs = steel;
  view.envSteelShare = share;
}

function envSteelSky(renderer, air, open, share) {
  const [width, height] = ENV.steel.size;
  const half = new Uint16Array(width * height * 4);
  const colour = [0, 0, 0];
  const ground = [0, 0, 0];
  const cloud = [0, 1, 2].map((channel) => air.cloudDark[channel] * (1 - ENV.steel.cloudLit) + air.cloudLit[channel] * ENV.steel.cloudLit);
  const covered = air.cover * (1 - air.lid);
  const edge = Math.sqrt(Math.max(0, 1 - open));
  // (The land is lit by the sky and by what the cloud leaves of the sun: `share`, the cloud over the fight.)
  const landLit = [0, 1, 2].map((channel) => {
    const whole = air.skyLight[channel] + air.sunColour[channel] * air.sun[1];
    return whole > 1e-6 ? (air.skyLight[channel] + air.sunColour[channel] * air.sun[1] * share) / whole : 1;
  });
  for (let row = 0; row < height; row += 1) {
    // (three's equirectangular reflection: v = asin(y) / pi + 1/2, u = atan(z, x) / (2 pi) + 1/2.)
    const y = Math.sin(((row + 0.5) / height - 0.5) * Math.PI);
    const level = Math.sqrt(1 - y * y);
    for (let column = 0; column < width; column += 1) {
      const turn = ((column + 0.5) / width - 0.5) * 2 * Math.PI;
      const x = Math.cos(turn) * level;
      const z = Math.sin(turn) * level;
      envSkyAt(air, x, y, z, colour);
      if (y < 0) {
        const down = Math.min(1, -y * 3);
        for (let channel = 0; channel < 3; channel += 1) colour[channel] *= 1 + (landLit[channel] - 1) * down;
      }
      if (y > 0) {
        // (What hides the sky stands round the floor, low: a ring of crowns or walls up to the height that leaves
        // `open` of the sky's light on a level card, sin^2 of its edge's elevation = 1 - open, over which the sky
        // is clear: so metal turned to the side mirrors the wood or the wall, and turned up, the sky.)
        const seen = envEase(edge - 0.05, edge + 0.05, y);
        envSkyAt(air, x, -1, z, ground);
        for (let channel = 0; channel < 3; channel += 1) ground[channel] *= landLit[channel];
        for (let channel = 0; channel < 3; channel += 1) {
          const sky = colour[channel] + (cloud[channel] - colour[channel]) * covered;
          colour[channel] = ground[channel] + (sky - ground[channel]) * seen;
        }
      }
      const at = (row * width + column) * 4;
      for (let channel = 0; channel < 3; channel += 1) half[at + channel] = THREE.DataUtils.toHalfFloat(colour[channel]);
      half[at + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }
  const texture = new THREE.DataTexture(half, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromEquirectangular(texture);
  generator.dispose();
  texture.dispose();
  return target.texture;
}

/** The view's frame (looks.js drawFrame asks): through the camera's last passes where the tier has them and the device can. */
function envDraw(view) {
  const state = view.env;
  if (!state?.on) return false;
  const level = ENV.quality[envChosen.tier].post;
  envUniforms().uEnvExposure.value = envMeter(state.tone, state.air, envLookWay.x, envLookWay.z);
  if (level > 0 && envPostDraw(view, state.tone, level, state.shafts, state.airWalk === 'frame')) return true;
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

/** The cloud sheet's broad masses (air.js envCloudBroad, on the processor). */
function envCloudBroadAt(sheetX, sheetZ) {
  const fields = envNoiseAt((0.8 * sheetX - 0.6 * sheetZ) * 0.0291 + 0.21, (0.6 * sheetX + 0.8 * sheetZ) * 0.0291 + 0.63, 0);
  return envNoiseAt(sheetX * 0.125, sheetZ * 0.125, 2) + (fields - 0.5) * ENV.clouds.fields;
}

/**
 * How far inside the cloud a sheet point is (air.js envCloudDepth, on the processor): below 0 a gap. Without
 * `grain` the broad masses alone, the fine grain at its mean (what shades a whole floor at once).
 */
function envCloudDepthAt(air, sheetX, sheetZ, grain = false) {
  const broad = envCloudBroadAt(sheetX, sheetZ);
  const fine = grain ? 0.5 + (envNoiseAt(sheetX * 0.53 + 0.37 + broad * 0.12, sheetZ * 0.53 + 0.11 + broad * 0.12, 3) - 0.5) * (air.form[0] / 0.32) : 0.5;
  return broad * 0.68 + fine * 0.32 - (0.74 + (0.26 - 0.74) * air.cover);
}

const envEase = (from, to, value) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/** How much of the sun the clouds leave at a point (the floor's middle if none is given; air.js envSunShare, on the processor). */
function envCloudShareAt(air, travelX, travelZ, strength, x = 0, y = 0, z = 0) {
  if (strength <= 0) return 1;
  const slant = (ENV.clouds.height - y) / Math.max(air.sun[1], 0.12);
  return 1 - strength * envEase(-0.12, 0.16, envCloudDepthAt(air, (x + air.sun[0] * slant) / ENV.clouds.scale - travelX, (z + air.sun[2] * slant) / ENV.clouds.scale - travelZ));
}

/**
 * The share of the sun on the air before the camera (air.js envAirShare, on the processor): the mean along the
 * first ENV.tone.view m of the way it looks, each stretch by the light it sends the eye. The meter counts the
 * air's light by it, the fighters' fog is coloured by it, and below the high tier it is the whole frame's share.
 */
function envAirShareAt(state, eye, look, travelX, travelZ, strength, extinction) {
  const { mapHalf } = ENV.terrain;
  const air = state.air;
  const cover = state.group.userData.envMap.envCover.image;
  const height = state.group.userData.envHeight;
  const [from, to] = state.group.userData.envCrowns;
  const flat = Math.hypot(air.sun[0], air.sun[2]) || 1;
  const lean = Math.min(ENV.shadow.slantMost, flat / Math.max(air.sun[1], 1e-3)) / flat;
  const depth = extinction * ENV.tone.view;
  const gone = 1 - Math.exp(-depth);
  const steps = ENV.air.shadeSteps[0];
  let sum = 0;
  for (let step = 0; step < steps; step += 1) {
    const u = (step + 0.5) / steps;
    const along = (depth > 1e-3 ? -Math.log(1 - u * gone) / depth : u) * ENV.tone.view;
    const x = eye.x + look.x * along;
    const z = eye.z + look.z * along;
    // (The cloud over a point drawn toward the eye by the share of the light the haze has thrown wide: air.js envAirSunOver.)
    const back = air.strewn ?? 0;
    let share = envCloudShareAt(air, travelX, travelZ, strength, x + (eye.x - x) * back, eye.y + look.y * along * (1 - back), z + (eye.z - z) * back);
    if (Math.abs(x) < mapHalf * 0.98 && Math.abs(z) < mapHalf * 0.98) {
      const above = Math.max(0, eye.y + look.y * along - height(x, z));
      const column = Math.min(cover.width - 1, Math.max(0, Math.floor(((x - air.sun[0] * lean * above) / (2 * mapHalf) + 0.5) * cover.width)));
      const row = Math.min(cover.height - 1, Math.max(0, Math.floor(((z - air.sun[2] * lean * above) / (2 * mapHalf) + 0.5) * cover.height)));
      const at = (row * cover.width + column) * 4;
      const deep = cover.data[at + 1] / 255;
      const past = (1 - Math.min(deep * 2.5, 1) * envEase(0.3, 0.72, 0.5 + (deep - 0.5) * 0.62)) * (cover.data[at + 2] / 255);
      share *= past + (1 - past) * envEase(from, to, above);
    }
    sum += share;
  }
  return sum / steps;
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

/**
 * Once a frame, before drawing: the time, how far the air and the clouds have travelled, and the cloud over the
 * fighters' sun; `lead` the body the pressed-ground record follows (the player; null: the one nearest the camera).
 */
export function envUpdate(view, world, lead = null) {
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
  const sway = wind.speed * envGustAt(wind, time, 0, 0) * ENV.shadow.dappleSway;
  u.uEnvShadeSway.value.set(wind.x * sway, wind.z * sway);
  envLookWay ??= new THREE.Vector3();
  view.camera.getWorldDirection(envLookWay);
  u.uEnvLook.value.set(envLookWay.x, envLookWay.z);
  const cloudOnFight = envCloudShareAt(state.air, wind.x * aloft, wind.z * aloft, u.uEnvCloud.value.y);
  view.lights.sun.intensity = state.sunPower * cloudOnFight;
  // The ground metal mirrors lies in the same cloud's shade: made again when that has moved on (ENV.steel.again).
  if (Math.abs(cloudOnFight - (view.envSteelShare ?? cloudOnFight)) > ENV.steel.again) envSteelSwap(view, state.air, state.own.meter?.sky ?? 1, cloudOnFight);
  const own = state.own;
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
  // Shade in the air before the camera: the light of the fog on what the renderer hazes (fighters, props), the
  // meter's count of the air's light, and the frame's one share where sight lines are not walked.
  const airShare = envAirShareAt(state, eye, envLookWay, wind.x * aloft, wind.z * aloft, u.uEnvCloud.value.y, extinction);
  state.airShare = state.tone.airShare = airShare;
  // (Where each line is walked: in the frame's own pass where it can be drawn through passes, which then takes
  // the shade's light off everything, the fighters' fog with the rest, post.js; else in the materials.)
  const tier = ENV.quality[envChosen.tier];
  state.airWalk = !tier.airShade ? 'none' : tier.post > 0 && envPostAble(view.renderer) ? 'frame' : 'lines';
  u.uEnvShade.value.w = state.airWalk === 'frame' ? 1 : state.airWalk === 'lines' ? -1 : airShare;
  // A place's own sun map, where it has one drawn by now (a light's map is made at its first frame; `texture`
  // may be a function to ask each frame).
  const sunMap = state.own?.sunMap;
  const sunDrawn = sunMap ? (typeof sunMap.texture === 'function' ? sunMap.texture() : sunMap.texture) : null;
  u.uEnvPlaceSun.value = sunDrawn ?? null;
  if (sunDrawn) u.uEnvPlaceSunBy.value.copy(sunMap.matrix);
  u.uEnvPlaceSunOn.value.set(sunDrawn ? 1 : 0, sunMap?.bias ?? 0.002);
  const fogLight = state.airWalk === 'frame' ? 1 : 1 - ENV.air.shadeBeam * (1 - airShare);
  view.scene.fog.color.setRGB(state.air.horizon[0] * fogLight, state.air.horizon[1] * fogLight, state.air.horizon[2] * fogLight);
  // The shafts: the share of light the air scatters toward the eye over the depth of a view (what falls is part
  // of that air), of the sun there is.
  state.shafts = ENV.quality[envChosen.tier].airShade ? 0 : ENV.post.shafts * state.weather.sun * (1 - Math.exp(-extinction * ENV.post.shaftPath));

  // The sun's shadow: its box carried where the place asks, and its width in the edge (terrain.js
  // envInstallShadow): texels of blur per unit of the map's depth, of the box as it is now.
  if (own.shadowBox) envCarryShadow(view, state, own.shadowBox);
  const shadow = view.lights.sun.shadow;
  shadow.radius = -((shadow.camera.far - shadow.camera.near) * ENV.shadow.sunWidth * ENV.shadow.soften) / ((shadow.camera.right - shadow.camera.left) / shadow.mapSize.x);
  if (parts.beams) envBeamsLook(parts.beams, eye);
  // What stands on the ground, for the shade at its feet and the grass under them: the fighters nearest the camera.
  const bodies = u.uEnvBodies.value;
  const [foot, hips, chest, head] = ENV.shadow.bodies;
  let filled = 0;
  if (world?.fighters) {
    const near = world.fighters.filter((fighter) => fighter?.x?.length >= 45).map((fighter) => ({ x: fighter.x, far: Math.hypot(fighter.x[24] - eye.x, fighter.x[26] - eye.z) })).sort((a, b) => a.far - b.far);
    for (const { x } of near.slice(0, bodies.length / 5)) {
      // (body.js: the head is particle 0, the neck 1, the hips 8, the feet 13 and 14.)
      bodies[filled++].set(x[39], x[40], x[41], foot);
      bodies[filled++].set(x[42], x[43], x[44], foot);
      bodies[filled++].set(x[24], x[25], x[26], hips);
      bodies[filled++].set(x[3], x[4], x[5], chest);
      bodies[filled++].set(x[0], x[1], x[2], head);
    }
  }
  // Their middle and their reach: past `bodyReach` m from the farthest of them the shade is under a hundredth.
  const middle = u.uEnvBodiesAt.value.set(0, 0, 0, 0);
  for (let at = 0; at < filled; at += 1) middle.set(middle.x + bodies[at].x / filled, middle.y + bodies[at].y / filled, middle.z + bodies[at].z / filled, 0);
  for (let at = 0; at < filled; at += 1) middle.w = Math.max(middle.w, Math.hypot(bodies[at].x - middle.x, bodies[at].y - middle.y, bodies[at].z - middle.z) + ENV.shadow.bodyReach);
  for (; filled < bodies.length; filled += 1) bodies[filled].w = 0;
  // What the bodies near the lead press into the grass and the snow (press.js).
  envPressStep({ world, lead, eye, tier: envChosen.tier, snowing: fall?.kind === 'snow' ? falling : 0 });
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
