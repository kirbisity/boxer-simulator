// Three.js view of the fight world. Reads the simulation; never writes to it.
// Each fighter is one skinned body over a rig that the physics skeleton
// drives, drawn in four layers: skin, muscle, bone and the physics itself.
// The skin is a soft shell: every vertex is a damped spring about its rest
// place, so a punch leaves a dent that springs back at the tissue's speed.

/* global THREE */
import { buildOyoroiBox, buildOyoroiHanging } from './oyoroi.js';
import { buildJoustKit } from './stechzeug.js';
import { P, PARTICLES } from './body.js';
import { buildBodyMesh } from './bodymesh.js';
import { buildLoftBody, TOPS } from './loftbody.js';
import { BODY_STYLE_KEYS, DEFAULT_BODY_STYLE, buildSkinMesh, buildSkinMeshSteps, cachedSkinMesh, readySkinTextures, skinTextureKey, skinTexturesNow, skinTexturesSteps, storeSkinMesh, styleSpec } from './bodystyles.js';
import { bodyCheck } from './skinworker.js';
import { applySkinTextures, skinTextureCache, storeSkinTextures } from './skintex.js';
import { detailMaterial } from './skindetail.js';
import { SKIN_TONES } from './skintones.js';
import { buildSkeleton } from './bones.js';
import { Dangle } from './dangle.js';
import { glovedFists, headgearOptions, outfitOf } from './outfits.js';
import { WEAPONS } from './weapons.js';
import { applyScenery } from './scenery.js';
import { orbitAboveGround } from './watchcam.js';
import { arenaColosseum } from './props/arena.js';
import { harbourPort } from './props/harbour.js';
import { SUBWAY_ARENA, subwayPuddleFilm, subwayStation } from './props/subway.js';
import { coastFarPlaneGuard, coastFort, coastGabions, coastHouses, coastNetRacks, coastPalms, coastPier, coastSampans, coastShip, coastShipMaterials } from './props/coast.js';
import { buildHarness, buildLionPelt, buildRomanKit, buildScaleShirt, netCord } from './arenaview.js';
import { buildBackBox, buildBackPrint, buildBanner, buildFootwear, buildHand, buildHeadgear, buildSwinging, dressFor, handKind, roleColors, steelEnvironment, steelMaterial, tattooColor, buildHeadProp } from './wardrobe.js';
import { buildHead, hairCurtain, hairCurtainSoft } from './face.js';
import { capsules, capsuleEnds, JOINT_SEGMENTS, point, WORLD } from './physics.js';
import { BONE, BONES, bindPoints, boneFrames, coherentFrames, frameMatrix, fromFrame, toFrame } from './rig.js';
import { bakePieces, CROWD_VIEW, crowdBatch, crowdKey, frameAt, simplifyTemplate, stretchedInverses } from './crowdview.js';
import { chooseDraw, crowdLod } from './crowdlod.js';
import { SoftShell } from './soft.js';
import { buildRobotBody } from './robotview.js';
import { disposeObject, outlineFor, surface } from './toon.js';
import { townSquare } from './props/town.js';
import { JIANGNAN_PLAN, jiangnanTown } from './props/jiangnan.js';
import { CAMERA_NEAR } from './depthrange.js';
import { applyLook, captureViewDefaults, drawFrame, resetForLook, resizeLook } from './looks.js';
import { prepareScenery, updateSceneryLod } from './scenerylod.js';
import { ruralFieldRail, ruralMeadowProps, ruralSengokuCamps } from './props/rural.js';
import { plainsCamelTrain, plainsRidge, plainsWagonLaager } from './props/plains.js';
import { buildStormPlace, stormRelease } from './levelmode/storm.js';

const LAYERS = ['skin', 'muscle', 'bone', 'physics'];
const CORNER_COLORS = { red: 0xc8262c, blue: 0x2457c5 };
// Skin tones, lightest to deepest. Light tan is a warm, yellow-leaning
// light skin: a shade under light, nowhere near medium.
// porcelain: a pale, cold-toned complexion (powdered, gothic).
export { SKIN_TONES } from './skintones.js';
/** A look's skin colour: its own (`skinColor`: a gorilla's black skin, a robot's dark joints) or its tone's. */
const skinHex = (look) => (look.skinColor ? new THREE.Color(look.skinColor).getHex() : SKIN_TONES[look.skinTone ?? 'medium']);

// Drawn characters carry slightly large heads; it is what makes them read
// as characters rather than as small-headed mannequins.
const HEAD_SCALE = 1.12;
const HEAD_SEAT = 0.18; // head radii the head sits lower than the physics head
const HEAD_SCALES = new THREE.Vector3(HEAD_SCALE, HEAD_SCALE, HEAD_SCALE);
const v3 = (array) => new THREE.Vector3(array[0], array[1], array[2]);

// ---- Scene -----------------------------------------------------------------

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d14);
  scene.fog = new THREE.Fog(0x0b0d14, 9, 22);
  const camera = new THREE.PerspectiveCamera(40, 1, CAMERA_NEAR, 60);

  const hemi = new THREE.HemisphereLight(0xb8c6e0, 0x3a2e24, 0.62);
  scene.add(hemi);
  const key = new THREE.SpotLight(0xfff2e0, 1.2, 20, 0.62, 0.45, 1.2);
  key.position.set(0.8, 7.5, 1.2);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 3;
  key.shadow.camera.far = 12;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x6f8cff, 0.35);
  rim.position.set(-4, 3, -5);
  scene.add(rim);
  // The sun, for open-air places: off until one is shown.
  const sun = new THREE.DirectionalLight(0xfff0d6, 0);
  sun.position.set(6, 11, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);
  const places = { ring: buildRing(), subway: null, colosseum: null };
  // One reflection map for every piece of steel in the scene.
  const steelEnv = steelEnvironment(renderer);
  const warmers = shaderWarmers();
  scene.add(places.ring, warmers);
  const view = { renderer, scene, camera, warmers, warmFrames: WARM_FRAMES, orbit: { yaw: -0.5, pitch: 0.2, distance: 5.2, target: new THREE.Vector3(0, 1.1, 0) }, places, lights: { key, rim, sun, hemi }, place: 'ring', steelEnv };
  // What a look will be undone to: the renderer and rig as built here, and the steel's map (built decoded from sRGB too when a linear look wants it).
  captureViewDefaults(view, (linear) => steelEnvironment(renderer, { linear }));
  return view;
}

/**
 * Where the fight is: the ring, or a scenario's scene round its arena. The
 * scene is built the first time it is needed; lighting goes with it.
 */
export function setPlace(view, place, arena, weather = null) {
  // A battle map's floor, much wider than the place's own, has the place built for it (scenery.js sceneryFor
  // pushes the backdrop out); the place's own floor and that one are kept side by side, each shown by turns.
  const home = PLACE_ARENAS[place];
  const floor = home && arena && arena.halfX >= home.halfX * WIDE_FLOOR ? arena : null;
  const swapped = swapFloor(view, place, floor);
  view.floor = floor;
  if (!swapped && place === view.place && weather === (view.weather ?? null)) return;
  const builders = { ring: buildRing, subway: buildSubway, colosseum: buildColosseum, meadow: buildMeadow, stadium: buildStadium, town: buildTown, port: buildPort, sengoku: buildSengoku, plain: buildPlain, field: buildField, coastFort: () => buildCoast({ fort: true }), coastVillage: () => buildCoast({ fort: false }), jiangnan: buildJiangnan, mobei: () => buildOpenPlain('mobei', arena), catalaunian: () => buildOpenPlain('catalaunian', arena), carrhae: () => buildOpenPlain('carrhae', arena), stage: buildStageSky, dunnottar: () => buildStormPlace({ buildRain }) };
  if (!view.places[place] && builders[place]) {
    view.places[place] = builders[place](arena);
    // A wet or polished surface reflects the sky (the steel's environment), faintly.
    view.places[place].traverse((object) => {
      const share = object.material?.userData?.reflects;
      if (!share) return;
      object.material.envMap = view.steelEnv;
      object.material.envMapIntensity = share;
    });
    view.scene.add(view.places[place]);
    // A place with weather of its own takes the scene's lights to flash (levelmode/storm.js).
    view.places[place].userData.bind?.(view);
  }
  if (view.place === 'dunnottar' && place !== 'dunnottar') stormRelease(view);
  for (const [key, group] of Object.entries(view.places)) if (group) group.visible = key === place;
  view.place = place;
  // A level's own weather (scenarios.js `weather`): the same place is clear for the sandbox and for other levels.
  view.weather = weather;
  lightPlace(view, place);
  applyScenery(view, place);
  prepareScenery(view);
  applyWeather(view);
}

// A floor this many times the place's own width gets a copy of the place built for it.
const WIDE_FLOOR = 1.5;

/**
 * Show `place` on `floor` (null: its own): the copy built for that floor takes the place's
 * slot, the one it replaces parked under `place@floor` (hidden, with the other places) for
 * the next visit. Returns whether the slot changed.
 */
function swapFloor(view, place, floor) {
  view.floors ??= {};
  const wanted = floor ? `${floor.halfX}x${floor.halfZ}` : 'home';
  const shown = view.floors[place] ?? 'home';
  if (wanted === shown) return false;
  if (view.places[place]) view.places[`${place}@${shown}`] = view.places[place];
  view.places[place] = view.places[`${place}@${wanted}`] ?? null;
  delete view.places[`${place}@${wanted}`];
  view.floors[place] = wanted;
  return true;
}

/**
 * Throw away every place built so far, so the next setPlace builds it anew.
 * The places are painted with Math.random; the looks harness rebuilds them
 * under a seeded generator so that every look is shown the same one.
 */
export function forgetPlaces(view) {
  for (const [key, group] of Object.entries(view.places)) {
    if (!group) continue;
    view.scene.remove(group);
    group.traverse((object) => {
      object.geometry?.dispose?.();
      for (const material of [].concat(object.material ?? [])) material.map?.dispose?.();
    });
    view.places[key] = null;
  }
  view.place = null;
  view.floors = {};
}

/** The place already shown, lit and drawn again: after the look changed. */
export function reapplyPlace(view) {
  lightPlace(view, view.place);
  applyScenery(view, view.place);
  prepareScenery(view);
  applyWeather(view);
}

/** A place's sky, fog and light rig, then the look in force on top of them. */
function lightPlace(view, place) {
  // Whatever a look changed in the view is undone first, so every look starts from the same rig.
  resetForLook(view);
  const own = PLACE_LIGHT[place] ?? PLACE_LIGHT.ring;
  const fog = view.weather?.fog;
  const light = fog ? { ...own, fog } : own;
  view.light = light;
  // How far the camera sees: the place's own reach, or (in mist) just past where the fog is opaque, so nothing hidden in it is drawn.
  view.cameraFar = fog ? fog[1] + WEATHER_FAR_MARGIN : own.far ?? CAMERA_FAR;
  if (view.camera.far !== view.cameraFar) {
    view.camera.far = view.cameraFar;
    view.camera.updateProjectionMatrix();
  }
  view.scene.background = new THREE.Color(light.background);
  view.scene.fog = new THREE.Fog(light.background, light.fog[0], light.fog[1]);
  view.lights.key.color.set(light.key);
  view.lights.key.intensity = light.keyIntensity;
  view.lights.rim.color.set(light.rim);
  view.lights.sun.intensity = light.sun ?? 0;
  view.lights.hemi.intensity = light.hemi ?? 0.62;
  view.lights.key.castShadow = !light.sun;
  warmShaders(view);
  applyLook(view, place);
}

// ---- weather ------------------------------------------------------------------
//
// A level may bring its own weather (scenarios.js `weather`): so far, mist,
// and Pier 9's night sea fog (its own `colour`, and `halos` round the lamps).
// `fog` [near, far] replaces the place's haze; the fog takes the look's horizon
// colour (the photograph's, the sky dome's) paled `pale` (0..1) toward a damp
// grey-white, and the horizon takes it too, so the land and the sky meet in
// it without a band. `sky` (0..1) tones the sky itself toward that
// colour, `mistLine` [from, to] (degrees above the horizon) is where a
// photograph's own land fades into it, and `sun` dims the sun through it.
// The mist also saves work: the camera's far plane comes in to just past
// where the fog is opaque, the photograph's ball below the mist line is not
// drawn, and tree cards wholly beyond the fog are left out.

/** The camera's far plane where a place says nothing else (metres). */
const CAMERA_FAR = 60;
/** How far past the fog's opaque distance the camera still sees: the dome and photograph (radius 40, 30) must stay inside it. */
const WEATHER_FAR_MARGIN = 2;
/** How far a tree can stand from the centre and still be seen from the camera, beyond the fog's reach (the camera stands up to ~25 m out). */
const WEATHER_TREE_REACH = 30;
/** Morning mist's own colour, a damp grey-white: what the horizon is paled toward. */
const WEATHER_MIST_COLOUR = new THREE.Color(0xdde2e2);

function applyWeather(view) {
  const weather = view.weather;
  const group = view.places?.[view.place];
  if (!group) return;
  const mist = weather?.sky ?? 0;
  if (weather?.sun) view.lights.sun.intensity *= weather.sun;
  // Mist pales the horizon (the look's own, already the fog's colour) toward a damp grey-white: the fog, the background and the sky's horizon all take it.
  const fog = view.scene.fog;
  if (weather?.fog && fog) {
    // Night fog has a colour of its own (the lamps' light in it), not the horizon's.
    if (weather.colour !== undefined) fog.color.set(weather.colour);
    else fog.color.lerp(WEATHER_MIST_COLOUR, weather.pale ?? 0.5);
    view.scene.background = fog.color.clone();
  }
  // The look's sky dome, toned toward that horizon.
  const dome = view.lookState?.['probe-lite']?.dome;
  if (dome?.visible && mist) {
    const u = dome.material.uniforms;
    u.uHorizon.value.set(fog.color.r, fog.color.g, fog.color.b);
    u.uZenith.value.lerp(u.uHorizon.value, mist);
    u.uHaze.value.lerp(u.uHorizon.value, mist);
    u.uSunColour.value.multiplyScalar(1 - 0.6 * mist);
  }
  for (const child of group.children) {
    // The classic look's painted sky: let the mist (the background) show through it; it is drawn behind everything, so it blends with nothing else.
    if (child.userData.paintedSky) {
      const material = child.material;
      const misty = mist > 0;
      if (material.transparent !== misty) {
        material.transparent = misty;
        material.needsUpdate = true;
      }
      material.opacity = 1 - 0.8 * mist;
    }
    if (!child.visible) continue;
    // The photograph: toned, its land faded into the mist, and the ball cut off below the mist line.
    if (child.userData.sceneryVariant === 'skyball-photo') {
      const ball = child.children[0];
      const u = ball.material.uniforms;
      if (u.uMist) u.uMist.value = mist;
      if (mist) u.uHorizon.value.copy(fog.color);
      if (mist && weather.mistLine) u.uFade.value.set(weather.mistLine[0] * WEATHER_DEG, weather.mistLine[1] * WEATHER_DEG);
      weatherCutBall(ball, mist && weather.mistLine ? weather.mistLine[0] : null);
    }
    // Tree cards beyond the fog: their instances are sorted near to far, so drawing fewer leaves out the farthest.
    child.traverse((object) => {
      // A lamp's halo, seen only in fog.
      if (object.userData.fogHalo) object.visible = !!weather?.halos;
      const reach = object.userData.treeReach;
      if (!object.isInstancedMesh || !reach) return;
      const limit = weather?.fog ? weather.fog[1] + WEATHER_TREE_REACH : Infinity;
      let count = 0;
      while (count < reach.length && reach[count] < limit) count += 1;
      object.count = count;
    });
  }
}

const WEATHER_DEG = Math.PI / 180;

/** Draw the photograph's ball only down to `elevation` degrees (its rows run from the top down), or all of it. */
function weatherCutBall(ball, elevation) {
  const geometry = ball.geometry;
  if (elevation === null) {
    geometry.setDrawRange(0, Infinity);
    return;
  }
  const index = geometry.index;
  const position = geometry.attributes.position;
  const radius = geometry.parameters.radius;
  const lowest = Math.sin(elevation * WEATHER_DEG) * radius;
  let count = 0;
  for (; count < index.count; count += 3) {
    const top = Math.max(position.getY(index.getX(count)), position.getY(index.getX(count + 1)), position.getY(index.getX(count + 2)));
    if (top < lowest) break;
  }
  geometry.setDrawRange(0, count);
}

// Each place's light: sky or dark hall, fog, the overhead key, the rim,
// and the sun for a place open to the sky. `far` is the camera's reach
// there, where it must see further than CAMERA_FAR.
const PLACE_LIGHT = {
  ring: { background: 0x0b0d14, fog: [9, 22], key: 0xfff2e0, keyIntensity: 1.2, rim: 0x6f8cff },
  // Fluorescent tubes behind yellowed diffusers (about 3200 K): warm, a little green off the old tile; the tunnel beyond is black.
  subway: { background: 0x0d0c08, fog: [10, 26], key: 0xffe4b4, keyIntensity: 0.95, rim: 0xc9c08a, hemi: 0.5 },
  colosseum: { background: 0x9cc4e8, fog: [30, 90], key: 0xfff4e0, keyIntensity: 0.2, rim: 0xbcd4ff, sun: 0.85 },
  meadow: { background: 0xa9cbe6, fog: [25, 70], key: 0xfff4e0, keyIntensity: 0.15, rim: 0xc8e0ff, sun: 0.9 },
  // A bright summer noon, a clear sky with high cloud, haze in the distance.
  town: { background: 0xc4dcf2, fog: [40, 130], key: 0xfff4e0, keyIntensity: 0.1, rim: 0xd6e6ff, sun: 1.15 },
  // Autumn morning on an open battlefield: clear, the sun strong, haze on the hills.
  sengoku: { background: 0xc8dcee, fog: [35, 120], key: 0xfff4e0, keyIntensity: 0.1, rim: 0xd6e6ff, sun: 1.1 },
  // The high plain of the Valley of Mexico: thin bright air, a hard sun.
  plain: { background: 0xbcd8f0, fog: [40, 140], key: 0xfff4e0, keyIntensity: 0.1, rim: 0xd6e6ff, sun: 1.0 },
  // The edge of the Gobi in the late afternoon (Mobei: the fighting ran on to dusk, a wind getting up): a pale dusty sky, a warm low sun, haze early.
  mobei: { background: 0xd6d0bc, fog: [45, 150], key: 0xffe0b4, keyIntensity: 0.14, rim: 0xe8d8c0, sun: 0.95 },
  // Champagne in high summer: a mild clear day, soft haze on the far woods.
  catalaunian: { background: 0xbcd6ee, fog: [45, 150], key: 0xfff4e0, keyIntensity: 0.12, rim: 0xd6e6ff, sun: 1.0 },
  // The plain below Harran in June: a hard white sun near overhead, the sky bleached pale, heat haze thick on the distance.
  carrhae: { background: 0xe2e2da, fog: [40, 130], key: 0xfff8ec, keyIntensity: 0.08, rim: 0xf0ece0, sun: 1.2 },
  // A level-mode stage: open sky and a sea below; the stage's own terrain stands in it (levelmode/terrainview.js).
  stage: { background: 0xbcd8f0, fog: [60, 220], key: 0xfff4e0, keyIntensity: 0.1, rim: 0xd6e6ff, sun: 1.0 },
  // Stage 1, Dunnottar: a storm at dusk over a black sea; a bruised purple-grey haze that thickens with distance (levelmode/storm.js).
  dunnottar: { background: 0x3a3646, fog: [45, 360], far: 720, key: 0x8e8aa8, keyIntensity: 0.05, rim: 0x5c6488, sun: 0.75, hemi: 0.58 },
  // An open field for horsemen: a clear day, the haze far off.
  field: { background: 0xb4d2ee, fog: [45, 140], key: 0xfff4e0, keyIntensity: 0.15, rim: 0xd6e6ff, sun: 1.0 },
  // A tropical shore: bright, hazy over the sea.
  coastFort: { background: 0xc6e0f2, fog: [35, 130], key: 0xfff4e0, keyIntensity: 0.1, rim: 0xd6e6ff, sun: 0.95 },
  coastVillage: { background: 0xc8dcee, fog: [35, 120], key: 0xfff4e0, keyIntensity: 0.1, rim: 0xd6e6ff, sun: 0.95 },
  // A water town south of the Yangtze: soft bright sky, damp air, the wooded hills 50–80 m out in the haze.
  jiangnan: { background: 0xc6d6e0, fog: [30, 110], far: 112, key: 0xfff4e0, keyIntensity: 0.1, rim: 0xd6e6ff, sun: 1.0 },
  // Night on the quay: moonlight from above, faint; the lamps do the rest.
  // Rain on the quay: a little more moonlight and fill than a clear night, so the wet reads.
  port: { background: 0x0b1020, fog: [16, 54], key: 0xa8bcff, keyIntensity: 1.05, rim: 0x6a88d0, hemi: 0.36 },
  // A dark hall, the ring alone under hard white light.
  stadium: { background: 0x040509, fog: [12, 46], key: 0xfff8ee, keyIntensity: 1.75, rim: 0x5a78ff },
};

/** The fighting floor of each sandbox place (half-sizes in x and z). */
export const PLACE_ARENAS = {
  // `ring`: a sport's ring, with its ropes and rules (fear runs lower there: ai.js fearTarget).
  ring: { halfX: WORLD.ringHalf, halfZ: WORLD.ringHalf, ring: true },
  colosseum: { halfX: 6.5, halfZ: 4.4 },
  subway: SUBWAY_ARENA,
  meadow: { halfX: 9, halfZ: 7 },
  stadium: { halfX: WORLD.ringHalf, halfZ: WORLD.ringHalf, ring: true },
  town: { halfX: 9, halfZ: 7 },
  port: { halfX: 10, halfZ: 6 },
  sengoku: { halfX: 11, halfZ: 7 },
  plain: { halfX: 12, halfZ: 8 },
  // Room for horsemen to charge, pass and wheel round (WORLD.mount): 60 by 40 m inside a rail.
  field: { halfX: 30, halfZ: 20 },
  coastFort: { halfX: 12, halfZ: 8 },
  coastVillage: { halfX: 12, halfZ: 8 },
  // The square between the shops and the canal: room for the wokou raid's formations.
  jiangnan: { halfX: 14, halfZ: 9 },
  // The horse-archer battles' plains: the field's room for horsemen to ride round, shoot and wheel (a battle's floor is wider still: scenarios.js).
  mobei: { halfX: 30, halfZ: 20 },
  catalaunian: { halfX: 30, halfZ: 20 },
  carrhae: { halfX: 30, halfZ: 20 },
  // A level-mode stage: the terrain is the floor (the box is only a far limit).
  stage: { halfX: 40, halfZ: 40 },
  dunnottar: { halfX: 40, halfZ: 40 },
};

/** The warmers' programs are built for the lights in force by the first frames drawn after they change; the group is drawn only for these. */
const WARM_FRAMES = 3;

/** Draw the warmers for the next few frames (the lights, the look or the place changed). */
function warmShaders(view) {
  view.warmFrames = WARM_FRAMES;
  if (view.warmers) view.warmers.visible = true;
}

/**
 * Shader programs for things that first appear in the middle of a fight —
 * a severed limb (an unskinned body-coloured piece and its ink outline), the first blood and stains, an arrow's vanes, a shot's streak — compiled before the fight instead of on the frame they appear,
 * where a compile stalls the page. (A gun's smoke and flash, sparks and glints are
 * batches of their own, in the scene from the first frame: see battlefx.js.) Each is one zero-area triangle (no pixels), drawn
 * for a few frames whenever the lights change (`warmShaders`: a new place, a look), so its program is built with the scene's lights and never released.
 */
function shaderWarmers() {
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  const severed = new THREE.Mesh(geometry, surface(0xffffff, { vertexColors: true, roughness: 0.55 }));
  // A V7 skin (skinned, with its four maps; a Lambert look's made a standard one) and its ink: swapped in a few seconds into a fight
  // (pumpSkinBuilds), so its program is compiled before, not on that frame.
  const skinnedGeometry = geometry.clone();
  skinnedGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(12), 4));
  skinnedGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  skinnedGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(6), 2));
  skinnedGeometry.setAttribute('uv2', new THREE.Float32BufferAttribute(new Float32Array(6), 2));
  const warmMaps = { width: 1, height: 1, neutral: 0.88, albedo: new Uint8Array([224, 224, 224, 255]), normal: new Uint8Array([128, 128, 255, 255]), ao: new Uint8Array([255]), rough: new Uint8Array([160]) };
  const skinV7 = new THREE.SkinnedMesh(skinnedGeometry, applySkinTextures(surface(0xffffff, { skinning: true, vertexColors: true, roughness: 0.55 }), warmMaps, { upgrade: true }));
  skinV7.bind(new THREE.Skeleton(BONES.map(() => new THREE.Bone())), new THREE.Matrix4());
  // ...and on the low tier, without its normal and roughness maps (skinForTier).
  const skinV7Low = new THREE.SkinnedMesh(skinnedGeometry, applySkinTextures(surface(0xffffff, { skinning: true, vertexColors: true, roughness: 0.55 }), { ...warmMaps, normal: null, rough: null }, { upgrade: true }));
  skinV7Low.bind(skinV7.skeleton, new THREE.Matrix4());
  // Blood: instanced drops and sparks, and the stains on the floor; an arrow's double-sided vanes.
  const drops = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color: 0x8a0d12 }), 1);
  const stains = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color: 0x5a0a0d, roughness: 0.25, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 }), 1);
  const vane = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xf0ece4, side: THREE.DoubleSide }));
  const tracer = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85, depthWrite: false }));
  // A retiarius's net: cord drawn as lines.
  const cord = new THREE.LineSegments(geometry, netCord());
  for (const instanced of [drops, stains]) instanced.setMatrixAt(0, new THREE.Matrix4());
  group.add(severed, outlineFor(severed), skinV7, outlineFor(skinV7), skinV7Low, drops, stains, vane, tracer, cord);
  group.traverse((object) => {
    object.frustumCulled = false;
    object.userData.shared = true;
  });
  return group;
}

/**
 * A village green under an open sky: trodden grass, a dirt track, thatched
 * cottages and a wattle fence round the edge, haystacks, a few trees, and
 * low hills beyond.
 */
function buildMeadow() {
  const place = new THREE.Group();
  const lit = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, ...options });
  const grass = paintedTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#5f7f3a';
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 14000; index += 1) {
      const shade = Math.random();
      g.fillStyle = `rgba(${60 + shade * 70},${95 + shade * 70},${30 + shade * 35},${0.25 + Math.random() * 0.3})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 4);
    }
    // A worn track across the green.
    g.fillStyle = 'rgba(120,96,62,0.55)';
    g.beginPath();
    g.ellipse(w / 2, h / 2, w * 0.5, h * 0.12, 0.2, 0, Math.PI * 2);
    g.fill();
  }, [3, 3]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), lit(0xffffff, { map: grass }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.scenery = 'ground';
  place.add(ground);
  // Low hills all round.
  for (let index = 0; index < 14; index += 1) {
    const angle = (index / 14) * Math.PI * 2;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(8 + Math.random() * 6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lit(0x6d8a45));
    hill.scale.y = 0.25 + Math.random() * 0.2;
    hill.position.set(Math.cos(angle) * 40, -0.5, Math.sin(angle) * 40);
    hill.userData.scenery = 'hills';
    place.add(hill);
  }
  // Cottages of wattle and daub under thatch, a wattle fence round the green (gapped), and hay ricks: see src/props/rural.js.
  place.add(ruralMeadowProps({
    cottages: [[-13, -9, 0.3], [-6, -12, -0.1], [9, -11, 0.2], [14, 4, 1.4], [-14, 6, -1.2], [4, 12, 3.0]],
    ricks: [[-10, 2], [11, -4], [-3, 10], [6, -9]],
    fence: { count: 64, rx: 11.5, rz: 9.5, gap: (angle) => Math.sin(angle * 3) > 0.85 },
  }));
  // Trees.
  for (const [x, z, size] of [[-18, -2, 1.2], [18, -8, 1], [-8, 16, 1.4], [16, 12, 1.1], [0, -17, 1.3]]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * size, 0.35 * size, 3 * size, 8), lit(0x5a4128));
    trunk.position.set(x, 1.5 * size, z);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(2.2 * size, 12, 10), lit(0x3f6a2a));
    crown.position.set(x, 4 * size, z);
    crown.castShadow = true;
    trunk.userData.scenery = crown.userData.scenery = 'trees';
    place.add(trunk, crown);
  }
  return place;
}

/**
 * The Colosseum, open to the sky: an oval of raked sand, the podium wall
 * round it with its gates and marble balustrade, the stepped stone tiers of
 * the cavea rising behind, empty between games and worn by use, and the
 * arched travertine outer wall above them.
 */
function buildColosseum() {
  const place = new THREE.Group();
  const rx = 10.5;
  const rz = 7;
  const stone = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...options });
  const oval = (geometry) => {
    geometry.scale(rx, 1, rz);
    return geometry;
  };
  // Sand, raked and trodden.
  const sand = paintedTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#c9a675';
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 9000; index += 1) {
      const shade = Math.random();
      g.fillStyle = `rgba(${150 + shade * 80},${120 + shade * 70},${80 + shade * 50},${0.12 + Math.random() * 0.2})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 2);
    }
    g.strokeStyle = 'rgba(140,105,65,0.18)';
    g.lineWidth = 2;
    for (let y = 6; y < h; y += 14) {
      g.beginPath();
      g.moveTo(0, y + Math.random() * 3);
      for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.05) * 2 + Math.random() * 2);
      g.stroke();
    }
  }, [6, 4]);
  const floorGeometry = new THREE.CircleGeometry(1, 72);
  floorGeometry.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(oval(floorGeometry), stone(0xffffff, { map: sand, roughness: 1 }));
  floor.receiveShadow = true;
  floor.userData.scenery = 'ground';
  place.add(floor);
  // The amphitheatre's stone: the podium and its gates, the stepped cavea,
  // the arcaded outer wall and attic, the velarium, and the signs of use:
  // grime, stains, repairs, litter in the stands, a rake by a gate (src/props/arena.js).
  const podiumHeight = 3.2;
  const tiers = 9;
  const colosseum = arenaColosseum({ rx, rz, podiumHeight, tiers, rise: 0.62, step: 0.075, firstTread: podiumHeight + 0.2 });
  place.add(colosseum.group);
  // Ground beyond, under the stands.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), stone(0xb9a07a));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  place.add(ground);
  return place;
}

/** A canvas texture: tiles, a station name, a warning strip. */
function paintedTexture(width, height, paint, repeat = [1, 1]) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 4;
  return texture;
}

/**
 * A New York platform at 1:40 a.m.: grimy concrete, the worn yellow edge
 * strip, the wet track bed open below it (no train in: the edge is a drop), painted I-beam
 * columns and girders, stained tile, caged fluorescent tubes under a low
 * ceiling, water leaking through it (src/props/subway.js). The fight's arena
 * is the strip of platform between the wall and the edge (z from −halfZ to
 * +halfZ). A few warm point lights make the pools of light under the tubes.
 */
function buildSubway(arena) {
  const { group: place, layout } = subwayStation(arena);
  place.add(subwayPuddleFilm(layout));
  place.userData.subwayLayout = layout;
  for (const x of [-4.6, 0, 4.6]) {
    const glow = new THREE.PointLight(0xffe0a6, 0.6, 9, 1.6);
    glow.position.set(x, layout.ceiling - 0.6, layout.fixtures[0].z);
    place.add(glow);
  }
  return place;
}

/**
 * A Sengoku battlefield: trampled grass between two camps, each with its
 * white curtain (jin-maku) bearing a crest and its tall nobori banners in
 * the side's colour; a bamboo palisade, pines and the mountains, under a
 * day sky.
 */
/**
 * The plain below the volcanoes: dry grass, maguey and nopal, the snowy
 * cones of Popocatépetl and Iztaccíhuatl far off.
 */
// ---- Scattered detail: many small things in one draw call each ----------

/** A seeded random for scenery, so a place looks the same every time it is built. */
function scatterRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Copies of one mesh at `spots` ([x, z, scale, turn]) as a single instanced draw; small things cast no shadow. */
function scatter(geometry, material, spots, { y = 0 } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
  const at = new THREE.Object3D();
  spots.forEach(([x, z, scale = 1, turn = 0], index) => {
    at.position.set(x, y * scale, z);
    at.rotation.set(0, turn, 0);
    at.scale.setScalar(scale);
    at.updateMatrix();
    mesh.setMatrixAt(index, at.matrix);
  });
  mesh.receiveShadow = true;
  return mesh;
}

/** `count` spots over a field `half` m across each way, kept off the fighting floor (`keep` half-sizes). */
function fieldSpots(random, count, half, keep, [smallest, largest] = [0.7, 1.3], allowed = () => true) {
  const spots = [];
  while (spots.length < count) {
    const x = (random() * 2 - 1) * half[0];
    const z = (random() * 2 - 1) * half[1];
    if (Math.abs(x) < keep.halfX + 1 && Math.abs(z) < keep.halfZ + 1) continue;
    if (!allowed(x, z)) continue;
    spots.push([x, z, smallest + random() * (largest - smallest), random() * Math.PI * 2]);
  }
  return spots;
}

/** Grass in tufts and stones lying about an open field. */
function fieldLitter(seed, keep, { grass = 0x7a7a3e, stone = 0x8a8478, tufts = 700, stones = 120, half = [40, 32], allowed = () => true } = {}) {
  const random = scatterRandom(seed);
  const tuft = new THREE.ConeGeometry(0.16, 0.38, 5);
  tuft.translate(0, 0.19, 0);
  const rock = new THREE.DodecahedronGeometry(0.28, 0);
  rock.scale(1, 0.55, 0.8);
  rock.translate(0, 0.08, 0);
  return [
    scatter(tuft, new THREE.MeshStandardMaterial({ color: grass, roughness: 1 }), fieldSpots(random, tufts, half, keep, [0.7, 1.3], allowed)),
    scatter(rock, new THREE.MeshStandardMaterial({ color: stone, roughness: 0.95, flatShading: true }), fieldSpots(random, stones, half, keep, [0.5, 1.8], allowed)),
  ];
}

/** An open field for mounted fights: grass, a low rail round the ground, hills far off. */
function buildField(arena = PLACE_ARENAS.field) {
  const place = new THREE.Group();
  const lit = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, ...options });
  place.add(daySky());
  const grass = paintedTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#6a8a40';
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 22000; index += 1) {
      const shade = Math.random();
      g.fillStyle = `rgba(${70 + shade * 70},${100 + shade * 70},${35 + shade * 30},${0.2 + Math.random() * 0.3})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 4);
    }
  }, [8, 8]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), lit(0xffffff, { map: grass }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.scenery = 'ground';
  place.add(ground);
  // Hoof-churned earth down the middle of the ground.
  const track = new THREE.Mesh(new THREE.PlaneGeometry(arena.halfX * 1.7, arena.halfZ * 0.9), lit(0x7a6a48, { transparent: true, opacity: 0.35 }));
  track.rotation.x = -Math.PI / 2;
  track.position.y = 0.004;
  place.add(track);
  // The rail round the ground: post-and-rail, posts every 4 m (src/props/rural.js).
  place.add(ruralFieldRail(arena));
  // Low hills all round, far off.
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(12 + Math.random() * 8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lit(0x6d8a45));
    hill.scale.y = 0.22 + Math.random() * 0.18;
    hill.position.set(Math.cos(angle) * 52, -0.5, Math.sin(angle) * 50);
    hill.userData.scenery = 'hills';
    place.add(hill);
  }
  return place;
}

/** The open sky and a sea for a level-mode stage (the sea's height is set by the stage: levelmode/terrainview.js). */
function buildStageSky() {
  const place = new THREE.Group();
  place.add(daySky());
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x35586b, roughness: 0.35, metalness: 0.1 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -8;
  sea.name = 'stage-sea';
  place.add(sea);
  return place;
}

function buildPlain(arena = PLACE_ARENAS.plain) {
  const place = new THREE.Group();
  // On a floor wider than its own (a battle map's) the ground, hills and plants stand that much further out.
  const outX = Math.max(0, arena.halfX - PLACE_ARENAS.plain.halfX);
  const outZ = Math.max(0, arena.halfZ - PLACE_ARENAS.plain.halfZ);
  const lit = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...options });
  place.add(daySky());
  const field = paintedTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#7a7442';
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 18000; index += 1) {
      const shade = Math.random();
      g.fillStyle = `rgba(${100 + shade * 60},${100 + shade * 50},${50 + shade * 30},${0.2 + Math.random() * 0.3})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 4);
    }
  }, [5, 5]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(130 + 2 * outX, 130 + 2 * outZ), lit(0xffffff, { map: field }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.scenery = 'ground';
  place.add(ground);
  // The volcanoes, snow on their crowns, and a ring of lower hills.
  [[-20, -55, 20, 22], [12, -58, 17, 18]].forEach(([x, z, radius, tall]) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, tall, 14), lit(0x55596a));
    cone.position.set(x, tall / 2 - 1, z);
    const snow = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.32, tall * 0.32, 14), lit(0xf2f4f8));
    snow.position.set(x, tall - 1 - tall * 0.16, z);
    cone.userData.scenery = snow.userData.scenery = 'mountains';
    place.add(cone, snow);
  });
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(9 + Math.random() * 6, 4 + Math.random() * 4, 8), lit(0x5f6448));
    hill.position.set(Math.cos(angle) * (52 + outX), 1.5, Math.sin(angle) * (50 + outZ));
    hill.userData.scenery = 'hills';
    place.add(hill);
  }
  // Maguey (a rosette of spiky leaves) and nopal about the field.
  const agave = lit(0x6a8a6a);
  for (let index = 0; index < 22; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const reach = 17 + Math.random() * 14;
    const plant = new THREE.Group();
    for (let leaf = 0; leaf < 9; leaf += 1) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.09, 1.2, 4), agave);
      const turn = (leaf / 9) * Math.PI * 2;
      blade.position.set(Math.cos(turn) * 0.25, 0.5, Math.sin(turn) * 0.25);
      blade.rotation.set(Math.sin(turn) * 0.6, 0, -Math.cos(turn) * 0.6);
      plant.add(blade);
    }
    plant.position.set(Math.cos(angle) * (reach + outX), 0, Math.sin(angle) * (reach * 0.8 + outZ));
    plant.scale.setScalar(0.8 + Math.random() * 0.8);
    plant.userData.scenery = 'plants';
    place.add(plant);
  }
  // Dry bunch grass and volcanic stones over the plain.
  place.add(...fieldLitter(31, arena, { grass: 0x8a8448, stone: 0x5a524a, tufts: 800, stones: 160, half: [50, 40] }));
  return place;
}

/**
 * The open plains of the horse-archer battles, one builder for the three:
 * each its ground's colour (`ground`: the base and the speckle's channels,
 * low to high, painted in fine strokes), its far hills (`hills`: how many, how
 * high, their colour and how far out, round the floor; flattened domes),
 * what lies about it (`litter`: tufts and stones, render.js fieldLitter) and
 * what stood at its edge (`props`: src/props/plains.js). Like the plain of
 * Mexico, on a battle map's wider floor everything stands that much further out.
 * - mobei: the northern edge of the Gobi, where Wei Qing met the Chanyu (119
 *   BC): short sparse grass on grey-brown gravel, low bare swells and dark far
 *   ridges; his wagon laager behind the Han end of the floor.
 * - catalaunian: the plain of Champagne (451): summer grass gone green-gold,
 *   rolling, a few woods far off; the ridge the armies fought for beyond the far side.
 * - carrhae: the plain south of Carrhae towards Harran in June (53 BC): pale
 *   sand and gravel, camelthorn in low grey-green tufts, a few bare hills far
 *   off; the Parthian camel train behind their end of the floor.
 */
const OPEN_PLAINS = {
  mobei: {
    ground: { base: '#857a5e', speckle: [[95, 150], [88, 132], [64, 100]], strokes: 16000, repeat: [6, 6] },
    hills: { count: 12, radius: [14, 24], height: [0.12, 0.26], colour: 0x6e664e, distance: [58, 54] },
    litter: { grass: 0x8e8a5a, stone: 0x5e5850, tufts: 700, stones: 260 },
    props: (arena) => [plainsWagonLaager(arena)],
  },
  catalaunian: {
    ground: { base: '#7c8a44', speckle: [[100, 165], [110, 165], [40, 75]], strokes: 22000, repeat: [8, 8] },
    hills: { count: 9, radius: [16, 26], height: [0.14, 0.3], colour: 0x6f8444, distance: [62, 60] },
    litter: { grass: 0x9a9a4e, stone: 0x8a8478, tufts: 900, stones: 60 },
    props: (arena) => [plainsRidge(arena)],
  },
  carrhae: {
    ground: { base: '#c2ac84', speckle: [[170, 225], [150, 205], [110, 160]], strokes: 14000, repeat: [5, 5] },
    hills: { count: 7, radius: [12, 20], height: [0.1, 0.2], colour: 0xa8906a, distance: [70, 66] },
    litter: { grass: 0x7e8458, stone: 0x9a8a6e, tufts: 260, stones: 220 },
    props: (arena) => [plainsCamelTrain(arena)],
  },
};

function buildOpenPlain(key, arena = PLACE_ARENAS[key]) {
  const spec = OPEN_PLAINS[key];
  const home = PLACE_ARENAS[key];
  const place = new THREE.Group();
  const outX = Math.max(0, arena.halfX - home.halfX);
  const outZ = Math.max(0, arena.halfZ - home.halfZ);
  const lit = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, ...options });
  place.add(daySky());
  const { base, speckle, strokes, repeat } = spec.ground;
  const texture = paintedTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < strokes; index += 1) {
      const shade = Math.random();
      const [r, gr, b] = speckle.map(([low, high]) => Math.round(low + shade * (high - low)));
      g.fillStyle = `rgba(${r},${gr},${b},${0.2 + Math.random() * 0.3})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 4);
    }
  }, repeat);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150 + 2 * outX, 150 + 2 * outZ), lit(0xffffff, { map: texture }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.scenery = 'ground';
  place.add(ground);
  const hills = spec.hills;
  for (let index = 0; index < hills.count; index += 1) {
    const angle = ((index + 0.5) / hills.count) * Math.PI * 2;
    const radius = hills.radius[0] + Math.random() * (hills.radius[1] - hills.radius[0]);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lit(hills.colour));
    hill.scale.y = hills.height[0] + Math.random() * (hills.height[1] - hills.height[0]);
    hill.position.set(Math.cos(angle) * (hills.distance[0] + outX), -0.5, Math.sin(angle) * (hills.distance[1] + outZ));
    hill.userData.scenery = 'hills';
    place.add(hill);
  }
  place.add(...fieldLitter(key.length * 7 + 3, arena, { ...spec.litter, half: [55 + outX, 45 + outZ] }));
  place.add(...spec.props(arena));
  return place;
}

/**
 * A sandy shore by the sea: the beach, the water to the horizon, and behind
 * the fighting either a fort of red brick with bastions (Zeelandia) or a
 * coastal village of whitewashed houses under grey tile (Zhejiang).
 */
function buildCoast({ fort }) {
  const place = new THREE.Group();
  const lit = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...options });
  place.add(daySky());
  const sandTexture = paintedTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#a8966a';
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 16000; index += 1) {
      const shade = Math.random();
      g.fillStyle = `rgba(${150 + shade * 40},${132 + shade * 40},${92 + shade * 30},${0.25 + Math.random() * 0.3})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, [5, 5]);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(70, 130), lit(0xffffff, { map: sandTexture }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.x = -10;
  sand.receiveShadow = true;
  sand.userData.scenery = 'ground';
  place.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardMaterial({ color: 0x2f6a8a, roughness: 0.25, metalness: 0.1 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(95, -0.05, 0);
  place.add(sea);
  let fortTick = null;
  if (fort) {
    // Fort Zeelandia on its rise: brick curtains and bastions, the gate toward the fight, the Company's flag (src/props/coast.js).
    const zeelandia = coastFort();
    zeelandia.group.position.set(-8, 0, -42);
    place.add(zeelandia.group);
    fortTick = zeelandia.tick;
    // Gabions (earth-filled wicker baskets) thrown up before the fort, and palms along the shore.
    const gabions = Array.from({ length: 14 }, (_, index) => [-20 + index * 1.25, -16 - (index % 2) * 0.5, 1, 0]);
    const random = scatterRandom(83);
    // Palms on the open sand: none inside the fort's walls (x −21…5, z −55…−29).
    const palms = [];
    while (palms.length < 18) {
      const spot = [-38 + random() * 52, (random() < 0.5 ? -1 : 1) * (14 + random() * 40), 0.8 + random() * 0.5, random() * 6];
      if (spot[0] > -21 && spot[0] < 5 && spot[1] > -55 && spot[1] < -29) continue;
      palms.push(spot);
    }
    place.add(...coastGabions(gabions), ...coastPalms(palms));
  } else {
    // A fishing village of the Zhejiang coast: whitewashed houses under grey tile, sampans drawn up, nets drying, a pier.
    const houses = Array.from({ length: 9 }, (_, index) => [-30 + (index % 3) * 8, -30 + Math.floor(index / 3) * 9 + (index % 2) * 2]);
    place.add(...coastHouses(houses));
    place.add(...coastSampans(Array.from({ length: 4 }, (_, index) => [24, -12 + index * 7, 0.3])));
    place.add(...coastNetRacks([[14, -22], [17, -24], [14, 22]]));
    place.add(...coastPier({ x0: 23, x1: 39, z: 24, width: 2.6, deck: 0.75 }));
  }
  // The shore: the wet sand the tide left, the surf breaking along it.
  const shoreX = 25;
  const wetSand = new THREE.Mesh(new THREE.PlaneGeometry(5, 130), lit(0x7c6c4c, { roughness: 0.5 }));
  wetSand.rotation.x = -Math.PI / 2;
  wetSand.position.set(shoreX - 2.4, 0.01, 0);
  wetSand.receiveShadow = true;
  const foamMaterial = new THREE.MeshBasicMaterial({ color: 0xf2f6f4, transparent: true, opacity: 0.55, depthWrite: false });
  const surf = [0, 1].map((line) => {
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(0.6 + line * 0.5, 130), foamMaterial);
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(shoreX + 0.4 + line * 2.2, -0.02 + 0.01 * line, 0);
    return foam;
  });
  place.add(wetSand, ...surf);
  const random = scatterRandom(fort ? 61 : 67);
  const keep = PLACE_ARENAS[fort ? 'coastFort' : 'coastVillage'];
  // Rocks and driftwood along the tide line; tufts of beach grass up the sand.
  const rock = new THREE.DodecahedronGeometry(0.45, 0);
  rock.scale(1, 0.6, 0.85);
  const rocks = Array.from({ length: 40 }, () => [shoreX - 6 + random() * 8, (random() * 2 - 1) * 60, 0.4 + random() * 1.6, random() * 6]);
  const log = new THREE.CylinderGeometry(0.12, 0.16, 2.4, 6);
  log.rotateZ(Math.PI / 2);
  log.translate(0, 0.12, 0);
  const driftwood = Array.from({ length: 14 }, () => [shoreX - 5 + random() * 4, (random() * 2 - 1) * 55, 0.6 + random() * 0.8, random() * Math.PI]);
  place.add(
    scatter(rock, lit(0x6a645a, { flatShading: true }), rocks),
    scatter(log, lit(0x8a7a62), driftwood),
    // Beach grass stays on the dry sand, short of the tide line.
    ...fieldLitter(fort ? 71 : 73, keep, { grass: 0x8a9a4a, stone: 0x9a8e74, tufts: 500, stones: 60, half: [40, 48], allowed: (x) => x < shoreX - 5 }),
  );
  // Ships at anchor, rising and rolling on the swell: Dutch fluyts off the fort, junks off the village. Near enough to
  // stand inside the camera's 60 m reach from the fight; shown whole or not at all, the open sea drawn on beyond that
  // reach to the horizon (coastFarPlaneGuard).
  const ships = [];
  const rig = coastShipMaterials(fort);
  for (const [x, z, masts] of fort ? [[38, -24, 3], [44, 15, 3], [50, -5, 2]] : [[40, -18, 2], [46, 12, 2]]) {
    const ship = coastShip({ dutch: fort, masts, materials: rig });
    ship.position.set(x, 0, z);
    ship.rotation.y = 0.4 + x * 0.01;
    ship.userData.phase = x * 0.13;
    ships.push(ship);
    place.add(ship);
  }
  place.add(...coastFarPlaneGuard(ships));
  place.userData.tick = (time) => {
    for (const ship of ships) {
      ship.position.y = Math.sin(time * 0.7 + ship.userData.phase) * 0.18;
      ship.rotation.z = Math.sin(time * 0.55 + ship.userData.phase) * 0.03;
    }
    surf[0].material.opacity = 0.45 + 0.15 * Math.sin(time * 0.9);
    fortTick?.(time);
  };
  return place;
}

function buildSengoku(arena = PLACE_ARENAS.sengoku) {
  const place = new THREE.Group();
  // On a floor wider than its own (a battle map's) the ground, mountains and pines stand that much further out.
  const outX = Math.max(0, arena.halfX - PLACE_ARENAS.sengoku.halfX);
  const outZ = Math.max(0, arena.halfZ - PLACE_ARENAS.sengoku.halfZ);
  const lit = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...options });
  const shaded = (mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  place.add(daySky());
  // Grass in autumn, trampled to earth across the middle.
  const field = paintedTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#7d8a4a';
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 20000; index += 1) {
      const shade = Math.random();
      g.fillStyle = `rgba(${110 + shade * 70},${120 + shade * 60},${50 + shade * 30},${0.2 + Math.random() * 0.3})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 5);
    }
    for (let index = 0; index < 60; index += 1) {
      g.fillStyle = `rgba(110,88,58,${0.12 + Math.random() * 0.2})`;
      g.beginPath();
      g.ellipse(w * (0.2 + Math.random() * 0.6), h * (0.3 + Math.random() * 0.4), 20 + Math.random() * 90, 10 + Math.random() * 40, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }, [5, 5]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(110 + 2 * outX, 110 + 2 * outZ), lit(0xffffff, { map: field }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.scenery = 'ground';
  place.add(ground);
  // Mountains, far off.
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2 + 0.2;
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(10 + Math.random() * 6, 9 + Math.random() * 7, 7), lit(0x6a7a88));
    mountain.position.set(Math.cos(angle) * (46 + outX), 3, Math.sin(angle) * (44 + outZ));
    mountain.userData.scenery = 'mountains';
    place.add(mountain);
  }
  // Pines about the field.
  const needles = lit(0x2a4430);
  const bark = lit(0x4a3626);
  for (let index = 0; index < 18; index += 1) {
    const angle = (index / 18) * Math.PI * 2 + Math.random() * 0.2;
    const reach = 19 + Math.random() * 9;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 3.2, 6), bark);
    trunk.position.y = 1.6;
    tree.add(trunk);
    for (let tier = 0; tier < 3; tier += 1) {
      const crown = shaded(new THREE.Mesh(new THREE.ConeGeometry(1.8 - tier * 0.45, 1.6, 7), needles));
      crown.position.y = 3 + tier * 1.05;
      tree.add(crown);
    }
    tree.position.set(Math.cos(angle) * (reach + outX), 0, Math.sin(angle) * (reach * 0.8 + outZ));
    tree.scale.setScalar(0.8 + Math.random() * 0.6);
    tree.userData.scenery = 'trees';
    place.add(tree);
  }
  // Each side's camp: the curtain with its crest, and its banners.
  const crestCurtain = (crest) => paintedTexture(512, 128, (g, w, h) => {
    g.fillStyle = '#efeadc';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(30,30,34,0.85)';
    for (const y of [h * 0.08, h * 0.88]) g.fillRect(0, y, w, h * 0.06);
    for (let x = w / 6; x < w; x += w / 3) {
      g.beginPath();
      g.arc(x, h / 2, h * 0.24, 0, Math.PI * 2);
      g.fillStyle = crest;
      g.fill();
      g.fillStyle = '#efeadc';
      g.beginPath();
      g.arc(x, h / 2, h * 0.12, 0, Math.PI * 2);
      g.fill();
    }
  });
  // Nobori: tall narrow banners, the side's colour with a white crest.
  const bannerArt = (colour) => paintedTexture(64, 256, (g, w, h) => {
    g.fillStyle = colour;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#efeadc';
    g.beginPath();
    g.arc(w / 2, h * 0.18, w * 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillRect(w * 0.42, h * 0.32, w * 0.16, h * 0.6);
  });
  // The curtains, the banners on their poles, and a bamboo palisade along both flanks, gapped (src/props/rural.js).
  place.add(ruralSengokuCamps({
    sides: [[-1, '#b3161b'], [1, '#1f3f8a']],
    // (Beyond the floor's ends and flanks, whatever its size: 14.5 and 9.5 m on the place's own.)
    curtainX: arena.halfX + 3.5,
    curtainArt: crestCurtain,
    bannerArt,
    banners: (side) => Array.from({ length: 7 }, (_, index) => [side * (arena.halfX + 1.4 + (index % 2) * 0.8), (index - 3) * (arena.halfZ + 2) / 3]),
    palisadeZ: [-(arena.halfZ + 2.5), arena.halfZ + 2.5],
    curtainLength: 2 * arena.halfZ,
    palisadeSpan: arena.halfX,
  }));
  // Autumn grass in tufts and field stones beyond the trampled ground.
  place.add(...fieldLitter(47, arena, { grass: 0x8a7a3a, stone: 0x86827a, tufts: 900, stones: 140, half: [45, 38] }));
  return place;
}

/** A day sky: a dome painted from deep blue overhead to pale haze at the horizon, with soft high cloud, behind everything and out of the fog. */
function daySky() {
  // The sky: a dome painted from deep blue overhead to pale haze at the
  // horizon, with soft high cloud; drawn behind everything, out of the fog.
  const skyTexture = paintedTexture(1024, 512, (g, w, h) => {
    const gradient = g.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#2e6cc2');
    gradient.addColorStop(0.3, '#4f8fdb');
    gradient.addColorStop(0.44, '#86b6e6');
    gradient.addColorStop(0.5, '#cfe2f3');
    gradient.addColorStop(1, '#dfe9f2');
    g.fillStyle = gradient;
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 18; index += 1) {
      const x = Math.random() * w;
      const y = h * (0.22 + Math.random() * 0.22);
      const size = 25 + Math.random() * 55;
      for (let puff = 0; puff < 9; puff += 1) {
        const glow = g.createRadialGradient(x + (Math.random() - 0.5) * size * 1.6, y + (Math.random() - 0.5) * size * 0.3, 0, x, y, size);
        glow.addColorStop(0, 'rgba(255,255,255,0.22)');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = glow;
        g.fillRect(x - size * 2, y - size, size * 4, size * 2);
      }
    }
  });
  skyTexture.wrapT = THREE.ClampToEdgeWrapping;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(52, 32, 16), new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  // A look that draws its own sky hides this one (looks/kit.js hidePaintedSky).
  sky.userData.paintedSky = true;
  return sky;
}

/**
 * A medieval market square at noon: cobbles, timber-framed houses on every
 * side (jettied upper floors, limewash, steep tiled roofs, chimneys) with
 * streets running off between them, the church tower and spire over the
 * roofs, and the market about the edges — stalls, a well, the cross, the
 * stocks, barrels, crates, a cart, signs and bunting — under a bright sky.
 */
function buildTown() {
  const place = new THREE.Group();
  const lit = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...options });
  const halfX = 12.5;
  const halfZ = 10.5;

  place.add(daySky());

  // Cobbles: rounded setts in grey and brown, worn paler down the middle.
  const cobbles = paintedTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#5c564d';
    g.fillRect(0, 0, w, h);
    for (let row = 0; row < 40; row += 1) {
      for (let column = 0; column < 40; column += 1) {
        const x = (column + (row % 2) * 0.5) * (w / 40) + (Math.random() - 0.5) * 4;
        const y = row * (h / 40) + (Math.random() - 0.5) * 4;
        const tone = 120 + Math.random() * 60;
        g.fillStyle = `rgb(${tone},${tone * 0.95},${tone * 0.86})`;
        g.beginPath();
        g.ellipse(x, y, 10 + Math.random() * 3, 9 + Math.random() * 3, Math.random(), 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.beginPath();
        g.ellipse(x - 3, y - 3, 5, 4, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (let index = 0; index < 300; index += 1) {
      g.fillStyle = `rgba(70,60,45,${Math.random() * 0.25})`;
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 20, 0, Math.PI * 2);
      g.fill();
    }
  }, [6, 6]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), lit(0xffffff, { map: cobbles, roughness: 0.85 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.scenery = 'ground';
  place.add(ground);

  // The houses, the church, the market: built for real in src/props/town.js.
  townSquare(place, { halfX, halfZ });
  return place;
}

/**
 * A water town in Zhejiang in the 1550s (the wokou raid): a square paved with
 * granite slabs between whitewashed shops and a canal, the far bank's houses
 * standing in the water, a humpbacked bridge, willows, wooded hills behind.
 * Built for real in src/props/jiangnan.js; here the sky and the ground.
 */
function buildJiangnan() {
  const place = new THREE.Group();
  place.add(daySky());
  const lit = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...options });
  // Granite slabs in long courses, grey with moss in the joints (the realistic looks paint their own over it).
  const slabs = paintedTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#4a5046';
    g.fillRect(0, 0, w, h);
    const rows = 12;
    for (let row = 0; row < rows; row += 1) {
      let x = Math.random() * -120;
      while (x < w) {
        const length = 140 + Math.random() * 200;
        const tone = 120 + Math.random() * 40;
        g.fillStyle = `rgb(${tone},${tone * 0.99},${tone * 0.94})`;
        g.fillRect(x + 3, row * (h / rows) + 3, length - 6, h / rows - 6);
        x += length;
      }
    }
    for (let index = 0; index < 260; index += 1) {
      g.fillStyle = `rgba(70,96,52,${Math.random() * 0.3})`;
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 16, 0, Math.PI * 2);
      g.fill();
    }
  }, [12, 12]);
  // The town's floor: everything north of the canal's near edge.
  const { near, far } = JIANGNAN_PLAN.canal;
  const depth = near + 60;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, depth), lit(0xffffff, { map: slabs, roughness: 0.85 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = near - depth / 2;
  ground.receiveShadow = true;
  ground.userData.scenery = 'ground';
  place.add(ground);
  // The far bank, behind its houses.
  const bank = new THREE.Mesh(new THREE.PlaneGeometry(150, 50), new THREE.MeshLambertMaterial({ color: 0x5a6a48 }));
  bank.rotation.x = -Math.PI / 2;
  bank.position.set(0, 0.02, far + 25);
  place.add(bank);
  jiangnanTown(place);
  return place;
}

/**
 * A container port at night: wet concrete with painted lines, the quay edge
 * with its bollards over black water, stacks of shipping containers walling
 * the lane, gantry cranes against a starry sky with a moon, and a few
 * sodium lamps throwing dim orange pools.
 */
function buildPort() {
  const place = new THREE.Group();
  const lit = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...options });
  // The night sky: deep blue to black, stars, a moon low over the water.
  const night = paintedTexture(1024, 512, (g, w, h) => {
    const gradient = g.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#02030a');
    gradient.addColorStop(0.42, '#0b1428');
    gradient.addColorStop(0.5, '#1c2640');
    gradient.addColorStop(1, '#05070c');
    g.fillStyle = gradient;
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 700; index += 1) {
      g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
      g.fillRect(Math.random() * w, Math.random() * h * 0.46, Math.random() < 0.1 ? 2 : 1, 1);
    }
    const moon = g.createRadialGradient(w * 0.28, h * 0.3, 0, w * 0.28, h * 0.3, 60);
    moon.addColorStop(0, 'rgba(240,240,225,1)');
    moon.addColorStop(0.18, 'rgba(230,232,220,1)');
    moon.addColorStop(0.24, 'rgba(160,180,220,0.35)');
    moon.addColorStop(1, 'rgba(60,80,130,0)');
    g.fillStyle = moon;
    g.fillRect(w * 0.28 - 60, h * 0.3 - 60, 120, 120);
  });
  night.wrapT = THREE.ClampToEdgeWrapping;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(52, 32, 16), new THREE.MeshBasicMaterial({ map: night, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.userData.paintedSky = true;
  sky.renderOrder = -1;
  place.add(sky);
  // Concrete apron: stained, damp, with the yard's painted lines.
  const concrete = paintedTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#4a4c50';
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 4000; index += 1) {
      const tone = 60 + Math.random() * 40;
      g.fillStyle = `rgba(${tone},${tone},${tone + 4},0.25)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 2 + Math.random() * 6);
    }
    for (let index = 0; index < 30; index += 1) {
      g.fillStyle = `rgba(20,22,26,${0.15 + Math.random() * 0.25})`;
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 70, 10 + Math.random() * 40, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(80,80,90,0.5)';
    g.lineWidth = 2;
    for (let x = 0; x < w; x += 128) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    g.fillStyle = 'rgba(210,180,40,0.55)';
    g.fillRect(0, h * 0.5 - 6, w, 12);
  }, [4, 4]);
  // Wet: the rain leaves the concrete slick, and puddles standing in its low
  // spots smoother still (roughness ×1 dry, ×0.25 in a puddle).
  const puddles = paintedTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 26; index += 1) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const pool = g.createRadialGradient(x, y, 0, x, y, 30 + Math.random() * 60);
      pool.addColorStop(0, 'rgb(64,64,64)');
      pool.addColorStop(0.7, 'rgb(90,90,90)');
      pool.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = pool;
      g.beginPath();
      g.ellipse(x, y, 40 + Math.random() * 80, 20 + Math.random() * 40, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }, [4, 4]);
  const wet = lit(0xffffff, { map: concrete, roughnessMap: puddles, roughness: 0.42, metalness: 0.18 });
  wet.userData.reflects = 0.45;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), wet);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.scenery = 'ground';
  place.add(ground);
  // The quay edge and the water beyond it (+z).
  const edgeZ = 9;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), new THREE.MeshStandardMaterial({ color: 0x050b14, roughness: 0.12, metalness: 0.7 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -1.6, edgeZ + 30);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(0, -1.7, edgeZ + 30);
  place.add(hole, water);
  // Cut the apron at the quay: a concrete face down to the water.
  ground.geometry = new THREE.PlaneGeometry(80, 40 + edgeZ);
  ground.position.z = edgeZ - (40 + edgeZ) / 2;
  // The quay edge, the ship moored along it, the stacks, the cranes, the
  // sodium lamps, drums and pallets (src/props/harbour.js).
  place.add(harbourPort({ edgeZ }).group);
  // Rain over the yard, slanting a little with the wind off the water.
  const rain = buildRain({ halfX: 16, halfZ: 12, height: 14, count: 1600, slant: [0.6, 0, -0.25] });
  place.add(rain);
  place.userData.tick = (time) => rain.userData.tick(time);
  return place;
}

/**
 * Rain: short streaks in a box, one line mesh drawn twice, the two stacked
 * and falling together, wrapped back up as they leave the bottom — a single
 * transform a frame, nothing per drop.
 */
function buildRain({ halfX, halfZ, height, count, speed = 9, length = 0.5, slant = [0, 0, 0] }) {
  const random = scatterRandom(11);
  const positions = new Float32Array(count * 6);
  const along = Math.hypot(slant[0], speed, slant[2]);
  const step = [(slant[0] / along) * length, -(speed / along) * length, (slant[2] / along) * length];
  for (let drop = 0; drop < count; drop += 1) {
    const x = (random() * 2 - 1) * halfX;
    const y = random() * height;
    const z = (random() * 2 - 1) * halfZ;
    positions.set([x, y, z, x + step[0], y + step[1], z + step[2]], drop * 6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: 0xa8bcd8, transparent: true, opacity: 0.32, depthWrite: false });
  const group = new THREE.Group();
  const layers = [new THREE.LineSegments(geometry, material), new THREE.LineSegments(geometry, material)];
  for (const layer of layers) layer.frustumCulled = false;
  group.add(...layers);
  group.userData.tick = (time) => {
    const fallen = (time * speed) % height;
    const drift = ((time * slant[0]) % (2 * halfX)) - halfX;
    layers[0].position.set(drift, -fallen, (time * slant[2]) % halfZ);
    layers[1].position.set(drift, height - fallen, (time * slant[2]) % halfZ);
  };
  return group;
}

/**
 * A big-fight stadium: the ring in the middle of a dark hall, stands of
 * people rising on every side into the dark, and a rig of lamps over the
 * ring throwing hard light down onto the canvas.
 */
function buildStadium() {
  const place = buildRing();
  // The stands: tiers stepping up and back from a dark floor, on four sides.
  const tierMaterial = new THREE.MeshStandardMaterial({ color: 0x14161e, roughness: 0.95 });
  const crowd = [];
  for (let tier = 0; tier < 14; tier += 1) {
    const inner = 7 + tier * 0.9;
    const height = -1.2 + tier * 0.55;
    for (let side = 0; side < 4; side += 1) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(inner * 2, 0.55, 0.9), tierMaterial);
      const angle = (side * Math.PI) / 2;
      step.position.set(Math.cos(angle) * (inner + 0.45), height, Math.sin(angle) * (inner + 0.45));
      step.rotation.y = -angle + Math.PI / 2;
      place.add(step);
      // People along the step, a seat apart.
      for (let seat = -inner + 0.4; seat < inner - 0.4; seat += 0.55) {
        if (Math.random() < 0.12) continue;
        const along = [Math.cos(angle + Math.PI / 2), Math.sin(angle + Math.PI / 2)];
        crowd.push([Math.cos(angle) * (inner + 0.35) + along[0] * seat, height + 0.55, Math.sin(angle) * (inner + 0.35) + along[1] * seat]);
      }
    }
  }
  // One instanced mesh for the whole crowd: shoulders and heads in the dark.
  const person = new THREE.CylinderGeometry(0.17, 0.2, 0.75, 6);
  person.translate(0, 0.38, 0);
  const people = new THREE.InstancedMesh(person, new THREE.MeshStandardMaterial({ roughness: 0.9 }), crowd.length);
  const placing = new THREE.Object3D();
  const shirt = new THREE.Color();
  crowd.forEach((at, index) => {
    placing.position.set(at[0], at[1], at[2]);
    placing.scale.setScalar(0.85 + Math.random() * 0.3);
    placing.updateMatrix();
    people.setMatrixAt(index, placing.matrix);
    people.setColorAt(index, shirt.setHSL(Math.random(), 0.35, 0.12 + Math.random() * 0.16));
  });
  place.add(people);
  // The lighting rig: a square truss over the ring, lamps glowing, and the
  // beams they throw, faint in the haze.
  const truss = new THREE.MeshStandardMaterial({ color: 0x1c1f28, metalness: 0.6, roughness: 0.4 });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff6e6 });
  // Seen only from outside: from inside a beam the camera would be lost in the haze.
  const beam = new THREE.MeshBasicMaterial({ color: 0xfff3dd, transparent: true, opacity: 0.035, depthWrite: false, side: THREE.FrontSide });
  const rigHeight = 8;
  for (let side = 0; side < 4; side += 1) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(8, 0.25, 0.25), truss);
    const angle = (side * Math.PI) / 2;
    bar.position.set(Math.cos(angle) * 4, rigHeight, Math.sin(angle) * 4);
    bar.rotation.y = -angle + Math.PI / 2;
    place.add(bar);
    for (const offset of [-2.6, -0.9, 0.9, 2.6]) {
      const along = [Math.cos(angle + Math.PI / 2), Math.sin(angle + Math.PI / 2)];
      const x = Math.cos(angle) * 4 + along[0] * offset;
      const z = Math.sin(angle) * 4 + along[1] * offset;
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12), lamp);
      glow.position.set(x, rigHeight - 0.2, z);
      place.add(glow);
      // A cone from the lamp to the canvas.
      const length = Math.hypot(x, rigHeight, z);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, length, 16, 1, true), beam);
      cone.position.set(x / 2, rigHeight / 2, z / 2);
      cone.lookAt(0, 0, 0);
      cone.rotateX(-Math.PI / 2);
      place.add(cone);
    }
  }
  return place;
}

function buildRing() {
  const ring = new THREE.Group();
  const half = WORLD.ringHalf + 0.2;
  const canvas = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.6, 0.4, half * 2 + 0.6), new THREE.MeshStandardMaterial({ color: 0x9aa7b8, roughness: 0.92 }));
  canvas.position.y = -0.2;
  canvas.receiveShadow = true;
  ring.add(canvas);
  const logo = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.MeshStandardMaterial({ color: 0x8592a6, roughness: 0.95 }));
  logo.rotation.x = -Math.PI / 2;
  logo.position.y = 0.002;
  logo.receiveShadow = true;
  ring.add(logo);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.7, 1.1, half * 2 + 0.7), new THREE.MeshStandardMaterial({ color: 0x171a24, roughness: 0.8 }));
  skirt.position.y = -0.95;
  ring.add(skirt);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x0e1018, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.5;
  ring.add(floor);

  const corners = [[half, half, 0xd8d8d8], [-half, half, CORNER_COLORS.red], [-half, -half, 0xd8d8d8], [half, -half, CORNER_COLORS.blue]];
  for (const [x, z, color] of corners) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.45, 12), new THREE.MeshStandardMaterial({ color: 0x9ea3ad, metalness: 0.6, roughness: 0.35 }));
    post.position.set(x, 0.72, z);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.05, 0.16), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    pad.position.set(x * 0.985, 0.85, z * 0.985);
    ring.add(post, pad);
  }
  const ropeMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 });
  for (const height of [0.42, 0.82, 1.22]) {
    for (let side = 0; side < 4; side += 1) {
      const [ax, az] = corners[side];
      const [bx, bz] = corners[(side + 1) % 4];
      const length = Math.hypot(bx - ax, bz - az);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, length, 8), ropeMaterial);
      rope.position.set((ax + bx) / 2, height, (az + bz) / 2);
      rope.rotation.z = Math.PI / 2;
      rope.rotation.y = Math.atan2(-(bz - az), bx - ax);
      rope.castShadow = true;
      ring.add(rope);
    }
  }
  return ring;
}

export function resize(view, width, height) {
  view.renderer.setSize(width, height, false);
  view.camera.aspect = width / Math.max(1, height);
  view.camera.updateProjectionMatrix();
  resizeLook(view, width, height);
}

/** The height of the ground at (x, z) in the place shown: the land a scenery part raised (the foothills), else flat. */
export function groundHeightAt(view) {
  const land = view.places?.[view.place]?.children.find((child) => child.visible && child.userData.heightAt);
  return land ? land.userData.heightAt : () => 0;
}

/**
 * The camera on its orbit round the target, the target eased towards `focus` (`ease` of the way each 60th of a second, at `height` m; `dt`
 * the frame's s, so that it is the same at any frame rate). With `ground`, the orbit is first kept above the ground (watchcam.js
 * orbitAboveGround): never under the floor.
 */
export function placeCamera(view, focus, { ease = 0.06, height = 1.1, ground = false, dt = 1 / 60 } = {}) {
  const orbit = view.orbit;
  if (focus) orbit.target.lerp(new THREE.Vector3(focus[0], height, focus[2]), 1 - (1 - ease) ** (dt * 60));
  if (ground) orbitAboveGround(orbit, groundHeightAt(view));
  const { yaw, pitch, distance, target } = orbit;
  view.camera.position.set(
    target.x + Math.cos(pitch) * Math.cos(yaw) * distance,
    target.y + Math.sin(pitch) * distance,
    target.z + Math.cos(pitch) * Math.sin(yaw) * distance,
  );
  view.camera.lookAt(target);
}

// ---- Fighter view ---------------------------------------------------------

const UP = new THREE.Vector3(0, 1, 0);
const tmpB = new THREE.Vector3();
const ARM_BONES = new Set(['lClavicle', 'lUpperArm', 'lForearm', 'rClavicle', 'rUpperArm', 'rForearm'].map((name) => BONE[name]));

/** Kit and skin colours painted onto the body by where each vertex sits in the bind pose. */
function paintBody(mesh, body, look, corner) {
  const { positions, skinIndex, bindPoints } = mesh;
  const skin = new THREE.Color(skinHex(look));
  const shorts = new THREE.Color(corner);
  const band = new THREE.Color(0xf4f4f4);
  const top = new THREE.Color(corner).multiplyScalar(0.7);
  if (mesh.regions) {
    // A lofted body names each garment piece's role; the outfit's design
    // colours it. Bare skin may carry a tattooed body suit.
    const dress = dressFor(body.inputs, corner);
    const byRegion = roleColors(dress, skin);
    const colors = new Float32Array(positions.length);
    mesh.regions.forEach((region, vertex) => {
      let color = byRegion[region] ?? skin;
      if (region === 'skin' && dress.tattoo) {
        const segment = BONE_SEGMENT[BONES[skinIndex[vertex * 4]]];
        color = tattooColor([positions[vertex * 3], positions[vertex * 3 + 1] - bindPoints[P.pelvis][1], positions[vertex * 3 + 2]], segment, skin) ?? skin;
      }
      colors.set([color.r, color.g, color.b], vertex * 3);
      // A style that paints its skin per vertex (flesh-lite, flesh hero) darkens and tints each skin vertex.
      if (region === 'skin' && mesh.tint) for (let axis = 0; axis < 3; axis += 1) colors[vertex * 3 + axis] *= mesh.tint[vertex * 3 + axis];
    });
    mesh.skinMask = mesh.regions.map((region) => region === 'skin');
    // Armour of leather or horn (`armor.matte`) is drawn as the body is, not as metal; its gilt still shines.
    const matte = Boolean(dress.armor?.matte);
    mesh.steelMask = mesh.regions.map((region) => (!matte && (region === 'steel' || region === 'steel2')) || region === 'gold' || region === 'mail' || region === 'mail2');
    return colors;
  }
  const hipY = bindPoints[P.pelvis][1];
  const trunk = body.lengths.trunk;
  const legReach = body.lengths.hipSpan / 2 + body.segments.lThigh.skinRadius * 1.7;
  const colors = new Float32Array(positions.length);
  const skinMask = [];
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    const y = positions[vertex * 3 + 1];
    const z = positions[vertex * 3 + 2];
    const onArm = ARM_BONES.has(skinIndex[vertex * 4]);
    let color = skin;
    if (!onArm && Math.abs(z) < legReach && y > hipY - body.lengths.thigh * 0.42 && y < hipY + trunk * 0.24) {
      color = y > hipY + trunk * 0.17 ? band : shorts;
    }
    if (!onArm && body.inputs.sex === 'female' && y > hipY + trunk * 0.56 && y < hipY + trunk * 0.9) color = top;
    colors.set([color.r, color.g, color.b], vertex * 3);
    skinMask.push(color === skin);
  }
  mesh.skinMask = skinMask;
  return colors;
}

/** Muscle red, paling to tendon near the joints the muscles cross. */
function paintMuscle(mesh) {
  const { positions, bindPoints } = mesh;
  const red = new THREE.Color(0xa3333a);
  const tendon = new THREE.Color(0xe2cdb4);
  const joints = ['lElbow', 'rElbow', 'lKnee', 'rKnee', 'lHand', 'rHand', 'lFoot', 'rFoot'].map((name) => bindPoints[P[name]]);
  const colors = new Float32Array(positions.length);
  const mixed = new THREE.Color();
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    let nearest = Infinity;
    for (const joint of joints) {
      nearest = Math.min(nearest, Math.hypot(positions[vertex * 3] - joint[0], positions[vertex * 3 + 1] - joint[1], positions[vertex * 3 + 2] - joint[2]));
    }
    mixed.copy(red).lerp(tendon, Math.max(0, Math.min(1, (0.07 - nearest) / 0.05)));
    colors.set([mixed.r, mixed.g, mixed.b], vertex * 3);
  }
  return colors;
}

/** A skinned mesh over the rig's bones from a built body mesh. */
function skinnedMesh(built, bones, colors, { indices = built.indices, material = null, share = null } = {}) {
  // A second mesh over the same vertices (the steel) shares the attributes.
  const geometry = new THREE.BufferGeometry();
  if (share) for (const [name, attribute] of Object.entries(share.attributes)) geometry.setAttribute(name, attribute);
  else {
    geometry.setAttribute('position', new THREE.BufferAttribute(built.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(built.normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(built.skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(built.skinWeight, 4));
    // The detail style's coordinates: the bump map's, and the same again for the occlusion map.
    if (built.uvs) {
      geometry.setAttribute('uv', new THREE.BufferAttribute(built.uvs, 2));
      geometry.setAttribute('uv2', new THREE.BufferAttribute(built.uvs, 2));
    }
  }
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const inverses = built.bindFrames.map((frame) => new THREE.Matrix4().fromArray(frameMatrix(frame)).invert());
  const skin = material ?? surface(0xffffff, { skinning: true, vertexColors: true, roughness: 0.55 });
  // The detail style's fine anatomy: the skin's bump and occlusion maps (skindetail.js).
  // A textured style's maps (skintex.js), as far as the look's material takes them (`built.skinMaps`: { textures, upgrade }).
  const dressedSkin = material ? skin : built.skinMaps ? applySkinTextures(skin, built.skinMaps.textures, { upgrade: built.skinMaps.upgrade }) : built.detail ? detailMaterial(skin, built.detail) : skin;
  if (!material && built.skinMaps) {
    dressedSkin.userData.fullMaps = { normalMap: dressedSkin.normalMap, roughnessMap: dressedSkin.roughnessMap, roughness: dressedSkin.roughness };
    skinForTier(dressedSkin);
  }
  const mesh = new THREE.SkinnedMesh(geometry, dressedSkin);
  mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** Ways to build the skin: see bodystyles.js. V7 (a loft wrapped onto the flesh field, with maps) is the default; 'lofted' the old one. */
export const BODY_STYLES = BODY_STYLE_KEYS;
export let BODY_STYLE = DEFAULT_BODY_STYLE;
export function setBodyStyle(style) {
  BODY_STYLE = style;
}

/**
 * `simple`: drawn as a crowd member, whatever his inputs say: one baked
 * body shared with those who look like him (see crowdview.js).
 */
export function buildFighterView(view, fighter, { simple: crowd = false } = {}) {
  if (crowd || fighter.body.inputs.simple) {
    view.crowdTemplates ??= new Map();
    const key = crowdKey(fighter);
    if (!view.crowdTemplates.has(key)) view.crowdTemplates.set(key, bakeCrowdTemplate(view, fighter));
    return crowdView(view, fighter, view.crowdTemplates.get(key));
  }
  return detailedView(view, fighter, false);
}

/** `simple`: low detail, no skeleton, no soft flesh (the first of a crowd template, before baking). */
/** A leader who wears his side's standard (a great sashimono) has it in place of the common banner. */
function leaderDress(dress, fighter) {
  if (!fighter.wornStandard) return dress;
  return { ...dress, banner: fighter.wornStandard.colour, greatBanner: true, bannerLook: WEAPONS[fighter.wornStandard.kind]?.flag ?? null };
}

/** A fighter's look, with any its outfit's design sets over it (`face`: a powdered complexion, hair colour, makeup). */
function lookOf(inputs) {
  const face = outfitOf(inputs).look.face;
  return face ? { ...(inputs.look ?? {}), ...face } : inputs.look ?? {};
}

function detailedView(view, fighter, simple) {
  const body = fighter.body;
  const look = lookOf(body.inputs);
  const corner = CORNER_COLORS[fighter.corner];
  const skinColor = skinHex(look);
  const group = new THREE.Group();
  const layers = Object.fromEntries(LAYERS.map((name) => [name, new THREE.Group()]));
  for (const layer of Object.values(layers)) group.add(layer);

  // The rig: bones whose world matrices are set straight from the physics.
  const bones = BONES.map(() => {
    const bone = new THREE.Bone();
    bone.matrixAutoUpdate = false;
    return bone;
  });
  // The style wanted (V7 by default). A dear one not built yet for a body like his is built in slices over the next frames
  // (pumpSkinBuilds) while he is drawn in the plain loft; then his skin is swapped for it (swapSkin).
  const wanted = simple ? 'lofted' : look.bodyStyle ?? BODY_STYLE;
  const ready = simple ? null : readySkin(body, wanted);
  const later = !simple && !ready && SKIN_BUILD.slicedStyles.includes(wanted) && !SKIN_BUILD.now;
  const bodyStyle = later ? 'lofted' : wanted;
  const built = simple ? buildLoftBody(body, { lowDetail: true }) : ready ?? skinNow(body, bodyStyle);
  const dressLook = dressFor(body.inputs, corner);
  // A machine (`armor.robot`) is drawn in rigid shells over its bones, not a skin: the body mesh is left empty.
  const machine = Boolean(dressLook.armor?.robot);
  // A rigid build (`build.rigid`) has no flesh to jiggle under a blow.
  const rigid = Boolean(body.inputs.build?.rigid);
  // Lacquered lamellar is glossy paint over steel: its colour shows, not only reflections.
  const lacquer = dressLook.armor?.kind === 'lamellar' || dressLook.armor?.kind === 'okegawa' ? { metalness: 0.45, roughness: 0.3 } : {};
  const skin = skinParts(view, fighter, built, bodyStyle, bones, { machine, lacquer, soft: !simple && !rigid });
  const { skinMesh, skinOutline, steelMesh, baseColors, vertexSegment } = skin;
  if (steelMesh) layers.skin.add(steelMesh, skin.steelOutline);
  layers.skin.add(skinMesh, skinOutline);
  const shells = simple || rigid ? [] : [{ key: 'body', shell: skin.shell }];

  const dress = leaderDress(dressFor(body.inputs, corner), fighter);
  // A design may set the hair (a sumo's topknot).
  // A face may be its own colour (Guan Yu's, the red of a ripe jujube).
  const faceColor = look.faceColor ? new THREE.Color(look.faceColor).getHex() : skinColor;
  // A round-two body style's face follows the body (facemorph.js).
  // (Under a closed helm the face is never seen: not morphed, not drawn.)
  const faceHidden = !simple && CLOSED_HELMS.includes(dress.head?.kind);
  const faceLook = { ...(dress.look.hair ? { ...look, hairStyle: dress.look.hair } : look), faceMorph: Boolean(styleSpec(wanted).face) && !faceHidden };
  const headView = buildHead(body, faceLook, faceColor, corner);
  headView.group.matrixAutoUpdate = false;
  if (faceHidden) {
    headView.group.traverse((object) => {
      if (object.isMesh) object.visible = false;
    });
  }
  layers.skin.add(headView.group);
  if (!rigid) shells.push({ key: 'head', shell: headView.shell });

  // Hands and feet ride on the forearm and foot bones: gloves, bare fists,
  // tactical gloves or gauntlets; boots, trainers, heels or sabatons.
  const attachments = [];
  const gloveMaterial = surface(corner, { roughness: 0.32 });
  const hands = handKind(body.inputs, glovedFists(body.inputs));
  const plainSteel = steelMaterial(view.steelEnv, { vertexColors: false, color: roleColors(dress, new THREE.Color(skinColor)).steel, ...lacquer });
  const garmentColors = { ...roleColors(dress, new THREE.Color(skinColor)), accent: dress.feet.accent };
  for (const side of ['l', 'r']) {
    let hand;
    if (hands === 'gloved') {
      hand = new THREE.Group();
      const fist = new THREE.Mesh(new THREE.SphereGeometry(WORLD.gloveRadius * 1.12, 20, 16), gloveMaterial);
      fist.scale.set(1, 1.15, 0.95);
      const thumb = new THREE.Mesh(new THREE.SphereGeometry(WORLD.gloveRadius * 0.42, 10, 8), gloveMaterial);
      thumb.position.set(0.045, -0.01, side === 'l' ? -0.04 : 0.04);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.08, 16), surface(0xf2f2f2));
      cuff.position.y = -0.09;
      for (const piece of [fist, thumb, cuff]) {
        piece.castShadow = true;
        piece.add(outlineFor(piece, 0.004));
      }
      hand.add(fist, thumb, cuff);
      hand.matrixAutoUpdate = false;
    } else hand = buildHand(body, side, hands, skinColor, plainSteel);
    layers.skin.add(hand);
    attachments.push({ object: hand, bone: BONE[`${side}Forearm`], at: P[`${side}Hand`] });
    const shoe = buildFootwear(body, dress.feet.kind, garmentColors, skinColor, plainSteel, dress.feet.heels ?? null);
    layers.skin.add(shoe);
    attachments.push({ object: shoe, bone: BONE[`${side}Foot`], at: P[`${side}Foot`] });
  }

  // Worn things: headgear (which hides the hair it encloses), a headset
  // (it can be knocked off), and what swings: a hood, a tie, sumo strings,
  // a tabard.
  const headgear = buildHeadgear(body, dress.head, garmentColors, plainSteel, corner, { lowDetail: simple });
  if (headgear) {
    headView.group.add(headgear.group);
    if (headgear.hidesHair) headView.hideHair({ beard: headgear.showsBeard });
  }
  const dangles = [];
  // Headgear: worn on the head, and a loose copy for when it is knocked off.
  const allowed = headgearOptions(dress.kind);
  const headProps = (body.inputs.accessories ?? []).filter((kind) => allowed.includes(kind)).map((kind) => {
    const make = () => (kind === 'headset' ? headsetMesh(body) : buildHeadProp(kind, body, dress, garmentColors, plainSteel, corner));
    const worn = make();
    if (!worn) return null;
    headView.group.add(worn);
    return { kind, worn, loose: make() };
  }).filter(Boolean);
  const collar = new THREE.Group();
  collar.matrixAutoUpdate = false;
  layers.skin.add(collar);
  attachments.push({ object: collar, bone: BONE.chest, at: P.neck });
  const hips = new THREE.Group();
  hips.matrixAutoUpdate = false;
  layers.skin.add(hips);
  attachments.push({ object: hips, bone: BONE.pelvis, at: P.pelvis });
  if (dress.top?.kind === 'hoodie') dangles.push(...buildHood(body, collar, dress.top.color));
  dangles.push(...buildSwinging(body, dress, collar, hips, corner));
  // Long hair down the back hangs from the upper back (unless a helmet hides the hair).
  // Soft (chains of links) for a fighter drawn in full; one rigid sheet for a crowd.
  if (!headgear?.hidesHair) for (const curtain of headView.curtains ?? []) dangles.push(...(simple ? [hairCurtain(collar, headView.hairMaterial, body.lengths.headRadius, curtain)] : hairCurtainSoft(collar, headView.hairMaterial, body.lengths.headRadius, curtain)));
  if (dress.armor?.backPrint) collar.add(buildBackPrint(body, dress.armor.backPrint));
  if (dress.armor?.backBox) collar.add(buildBackBox(body, garmentColors));
  if (machine) {
    for (const entry of buildRobotBody(body, dress.armor, view.steelEnv)) {
      layers.skin.add(entry.object);
      attachments.push(entry);
    }
  }
  // The scissor's coat of scales, plate by plate over the painted shirt.
  // Maximus's harness: the straps, buckles, plates and belt over the loft.
  // The ō-yoroi: its box on the chest, its shoulder boards and skirt panels hung to swing (fixed in a crowd).
  if (dress.armor?.kind === 'oyoroi') {
    collar.add(buildOyoroiBox(body, dress.armor));
    dangles.push(...buildOyoroiHanging(body, dress.armor, collar, hips, simple));
  }
  if (dress.armor?.kind === 'maximus') {
    collar.add(buildHarness(body, dress.armor, view.steelEnv, steelMaterial, 'chest'));
    hips.add(buildHarness(body, dress.armor, view.steelEnv, steelMaterial, 'hips'));
  }
  // A jousting harness: the tilting targe on the left breast, the queue behind the lance rest.
  if (dress.armor?.joust) collar.add(buildJoustKit(body, dress.armor, plainSteel, { lowDetail: simple }));
  // Commodus's lion skin: the hide, the knotted forelegs, the tail.
  if (dress.armor?.kind === 'commodus') collar.add(buildLionPelt(body, dress.armor));
  // A legionary's apron of studded strips; a centurion's phalerae as well.
  if (dress.armor?.kind === 'segmentata' || dress.armor?.kind === 'centurion') {
    collar.add(buildRomanKit(body, dress.armor, view.steelEnv, steelMaterial, 'chest'));
    hips.add(buildRomanKit(body, dress.armor, view.steelEnv, steelMaterial, 'hips'));
  }
  if (dress.armor?.kind === 'scissor') {
    collar.add(buildScaleShirt(body, dress.armor.color, view.steelEnv, steelMaterial, 'chest'));
    hips.add(buildScaleShirt(body, dress.armor.color, view.steelEnv, steelMaterial, 'hips'));
  }
  if (dress.banner) {
    const banner = buildBanner(body, dress.banner, dress.greatBanner, dress.bannerLook);
    banner.userData.banner = true;
    collar.add(banner);
  }

  // Bone layer: the anatomical skeleton, moved rigidly with the rig. The skin view draws none (the body carries its own bony
  // landmarks), so the pieces are built when the bone or muscle view is first shown (ensureSkeleton): until then, empty groups.
  const skeleton = BONES.map(() => new THREE.Group());

  const physicsLayer = buildPhysicsLayer(fighter, layers);
  if (simple) thinOut(layers.skin, skinMesh);
  view.scene.add(group);
  const fighterView = {
    fighter, group, layers, bones, built, skinMesh, skinOutline, muscle: null, skeleton, skeletonBuilt: false, attachments, shells,
    baseColors, vertexSegment, damageVersion: -1, headProps, dangles, steelMesh, steelOutline: skin.steelOutline,
    ...physicsLayer, head: headView, layer: 'skin', frames: built.bindFrames, lacquer, rigid, machine, bodyStyle,
  };
  if (later) queueSkin(fighterView, wanted);
  return fighterView;
}

// ---- The skin, built in slices -------------------------------------------------------------------

/**
 * How a dear body style is brought in (the default V7: a loft wrapped onto the flesh field, ~0.15-0.3 s, and its maps, ~0.5-1 s a
 * composition bucket): a fighter whose skin is not ready is drawn at once in the plain loft and queued; each frame `pumpSkinBuilds`
 * works a few milliseconds (`sliceMs`) on the nearest queued body, and when his mesh and maps are done his skin is swapped for it in
 * one frame. A body built once is kept (bodystyles.js cachedSkinMesh): the same man again (a restart, a mirror bout, another of a
 * cast) is ready at once. `farDistance`: built on this thread (no worker), a man farther than this from the camera waits until he comes
 * nearer (no frame time for the unseen); the workers take every body, the nearest first.
 * `now`: build at once instead (tools, design sheets, tests). `workers`: how many skin workers (skinworker.js) build them where they can be
 * had, so the page's thread only swaps the finished skin in (0: none, all on this thread).
 */
export const SKIN_BUILD = { slicedStyles: ['v7'], sliceMs: 5, farDistance: 30, now: false, workers: 2 };
/**
 * A textured skin by the picture's quality tier (levelmode/quality.js: a stage's, 'high' anywhere else): on `low` it keeps its colour
 * and occlusion maps and drops the normal and roughness maps (a cheaper pixel, the anatomy still painted); both programs are compiled
 * beforehand (shaderWarmers), so a change of tier is not a stall.
 */
const skinQuality = { tier: 'high' };
export function setSkinQuality(fighterViews, tier) {
  if (skinQuality.tier === tier) return;
  skinQuality.tier = tier;
  for (const fighterView of fighterViews) if (fighterView.skinMesh) skinForTier(fighterView.skinMesh.material);
}
function skinForTier(material) {
  const full = material.userData.fullMaps;
  if (!full) return;
  const low = skinQuality.tier === 'low';
  const normalMap = low ? null : full.normalMap;
  const roughnessMap = low ? null : full.roughnessMap;
  if (material.normalMap === normalMap && material.roughnessMap === roughnessMap) return;
  Object.assign(material, { normalMap, roughnessMap, roughness: low && full.roughnessMap ? SKIN_LOW_ROUGHNESS : full.roughness, needsUpdate: true });
}
const SKIN_LOW_ROUGHNESS = 0.62;
// The helmets that close over the whole face (wardrobe.js): the head under them is not drawn.
const CLOSED_HELMS = ['greatHelm', 'stechhelm', 'bascinet'];

/** A body's skin in a style if it is built and its maps are made: a fighter's own copy (his dents move its points), else null. */
function readySkin(body, style) {
  const cached = cachedSkinMesh(body, style);
  if (!cached || !readySkinTextures(body, style, cached)) return null;
  return { ...cached, positions: cached.positions.slice() };
}

/** A body's skin in a style, built now (and its maps), kept for the next like him. */
function skinNow(body, style) {
  const built = buildSkinMesh(body, style);
  storeSkinMesh(body, style, built);
  skinTexturesNow(body, style, built);
  return { ...built, positions: built.positions.slice() };
}

/**
 * A built skin made into meshes over the rig's bones: the body (toon, or the style's maps), the steel apart, their ink, the colours
 * painted, which segment each vertex is, and the soft shell that dents it.
 */
function skinParts(view, fighter, built, bodyStyle, bones, { machine, lacquer, soft = true }) {
  const { body } = fighter;
  const look = lookOf(body.inputs);
  const corner = CORNER_COLORS[fighter.corner];
  // The skin's maps (cached per composition bucket, so a second fighter like him costs nothing).
  const spec = styleSpec(bodyStyle).tex;
  const maps = spec && built.uvs ? skinTexturesNow(body, bodyStyle, built) : null;
  if (maps) built.skinMaps = { textures: maps, upgrade: Boolean(spec.upgrade) };
  const baseColors = paintBody(built, body, look, corner);
  // Steel is drawn apart, as metal; everything else is the toon body.
  const steelTriangle = (triangle) => built.steelMask?.[built.indices[triangle * 3]] && built.steelMask[built.indices[triangle * 3 + 1]] && built.steelMask[built.indices[triangle * 3 + 2]];
  const triangles = machine ? 0 : built.indices.length / 3;
  const bodyIndices = [];
  const steelIndices = [];
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const target = steelTriangle(triangle) ? steelIndices : bodyIndices;
    target.push(built.indices[triangle * 3], built.indices[triangle * 3 + 1], built.indices[triangle * 3 + 2]);
  }
  const skinMesh = skinnedMesh(built, bones, baseColors.slice(), { indices: Uint32Array.from(bodyIndices) });
  const steel = steelMaterial(view.steelEnv, { skinning: true, ...lacquer });
  let steelMesh = null;
  let steelOutline = null;
  if (steelIndices.length) {
    steelMesh = skinnedMesh(built, bones, null, { indices: Uint32Array.from(steelIndices), material: steel, share: skinMesh.geometry });
    steelOutline = outlineFor(steelMesh);
  }
  // Which body segment each skin vertex belongs to, by its strongest bone.
  const vertexSegment = Array.from({ length: built.positions.length / 3 }, (_, vertex) => (built.skinMask[vertex] ? BONE_SEGMENT[BONES[built.skinIndex[vertex * 4]]] : null));
  const skinOutline = outlineFor(skinMesh);
  const shell = soft ? new SoftShell(null, null, body.segments.trunk.fleshFirmness, { mesh: skinMesh, recomputeNormals: false, fixed: built.rigid }) : null;
  return { built, baseColors, skinMesh, skinOutline, steelMesh, steelOutline, vertexSegment, shell };
}

// Bodies being built, by the body's key: { body, style, steps, built, phase, views: the fighter views waiting for it }.
const skinBuilds = new Map();
const skinBuildKey = (body, style) => `${style}|${JSON.stringify(body.inputs)}`;

function queueSkin(fighterView, style) {
  const job = skinJob(fighterView.fighter.body, style);
  job.views.add(fighterView);
  fighterView.skinPending = style;
}
function skinJob(body, style) {
  const key = skinBuildKey(body, style);
  let job = skinBuilds.get(key);
  if (!job) {
    job = { body, style, steps: null, built: null, phase: 'mesh', views: new Set(), keep: false };
    skinBuilds.set(key, job);
  }
  return job;
}

/**
 * Bodies that will be drawn soon (the intro's legends, before their chapter comes): their skins built ahead, in the workers, so
 * they are ready when their men are. Nothing is swapped; the body and its maps are kept (cachedSkinMesh) for when they are built.
 */
export function prefetchSkins(bodies, style = BODY_STYLE) {
  if (!SKIN_BUILD.slicedStyles.includes(style)) return 0;
  let queued = 0;
  for (const body of bodies) {
    if (cachedSkinMesh(body, style)) continue;
    skinJob(body, style).keep = true;
    queued += 1;
  }
  return queued;
}

/** How many fighters wait for their skin, and how many bodies are queued. */
export function skinBuildStats() {
  let waiting = 0;
  for (const job of skinBuilds.values()) for (const fighterView of job.views) if (!fighterView.disposed && fighterView.skinPending === job.style) waiting += 1;
  return { waiting, bodies: skinBuilds.size, jobs: [...skinBuilds.values()].map((job) => `${job.style} ${job.phase} ${job.views.size}`), ...skinTimes };
}
// What the slices have cost (ms): the longest frame's share, and the longest swap; how many swaps.
const skinTimes = { longestPump: 0, longestSwap: 0, swaps: 0, longestStep: 0, longestStepIs: '' };
/** One slice of a builder (a generator's next step), timed. */
function stepOf(steps) {
  const started = performance.now();
  const next = steps.next();
  const took = performance.now() - started;
  if (took > skinTimes.longestStep) Object.assign(skinTimes, { longestStep: took, longestStepIs: String(next.done ? 'the last' : next.value) });
  return next;
}

/**
 * Work on the queued skins for about `budgetMs` (Infinity: all of them, now): the body of the waiting man nearest the camera first;
 * a body whose men are all farther than SKIN_BUILD.farDistance waits (unless all are wanted now). Done, each waiting man's skin is
 * swapped. Returns how many were swapped.
 */
export function pumpSkinBuilds(view, budgetMs = SKIN_BUILD.sliceMs) {
  const started = performance.now();
  const all = budgetMs === Infinity;
  let swapped = 0;
  const camera = view.camera.position;
  // The bodies waiting, the nearest man's first (a body no one waits for any more is dropped).
  const order = [];
  for (const [key, job] of skinBuilds) {
    for (const fighterView of job.views) if (fighterView.disposed || fighterView.skinPending !== job.style) job.views.delete(fighterView);
    if (!job.views.size && !job.keep) {
      skinBuilds.delete(key);
      continue;
    }
    // (A body built ahead, no one waiting for it yet: after everyone who is.)
    let nearest = job.views.size ? Infinity : SKIN_BUILD.farDistance * 2;
    for (const fighterView of job.views) {
      const x = fighterView.fighter.x;
      nearest = Math.min(nearest, Math.hypot(x[P.pelvis * 3] - camera.x, x[P.pelvis * 3 + 1] - camera.y, x[P.pelvis * 3 + 2] - camera.z));
    }
    order.push({ key, job, nearest });
  }
  order.sort((a, b) => a.nearest - b.nearest);
  const swap = (key, job) => {
    skinBuilds.delete(key);
    for (const fighterView of job.views) {
      const swapStarted = performance.now();
      if (!swapSkin(view, fighterView, job.style, job.built)) continue;
      swapped += 1;
      skinTimes.swaps += 1;
      skinTimes.longestSwap = Math.max(skinTimes.longestSwap, performance.now() - swapStarted);
    }
  };
  // Ready (built here or by the worker, or by another man's job): swapped, one body a frame (a swap is some milliseconds of its own).
  for (const { key, job } of order) {
    if (job.phase === 'mesh' || job.phase === 'worker') {
      const cached = cachedSkinMesh(job.body, job.style);
      if (cached) Object.assign(job, { built: cached, phase: 'maps', steps: null });
    }
    if (job.phase === 'maps' && readySkinTextures(job.body, job.style, job.built)) job.phase = 'done';
    if (job.phase === 'done' && (all || !swapped)) swap(key, job);
  }
  // The worker takes the rest, nearest first, as many as asked of it (it builds them one after another).
  const workers = all ? null : skinWorkers();
  if (workers) {
    for (const { job, nearest } of order) {
      if (job.phase !== 'mesh' || job.noWorker) continue;
      // To the worker with the least asked of it.
      const worker = workers.reduce((least, next) => (next.load < least.load ? next : least));
      worker.load += 1;
      job.id = (skinWorkerState.next += 1);
      job.phase = 'worker';
      skinWorkerState.asked.set(job.id, { job, worker });
      worker.thread.postMessage({ id: job.id, inputs: job.body.inputs, style: job.style, check: bodyCheck(job.body), known: [...skinTextureCache.map.keys()] });
    }
  }
  // What no worker takes (none could be made, or the body was refused), or everything now (`all`): built here, a slice at a time.
  for (const { key, job, nearest } of order) {
    if (!skinBuilds.has(key) || job.phase === 'done' || (job.phase === 'worker' && !all)) continue;
    if (nearest > SKIN_BUILD.farDistance && !all) continue;
    if (performance.now() - started >= budgetMs) break;
    if (job.phase === 'worker') Object.assign(job, { phase: 'mesh', noWorker: true });
    while (job.phase !== 'done' && performance.now() - started < budgetMs) {
      if (job.phase === 'mesh') {
        job.steps ??= buildSkinMeshSteps(job.body, job.style);
        const next = stepOf(job.steps);
        if (!next.done) continue;
        Object.assign(job, { built: next.value, steps: null, phase: 'maps' });
        storeSkinMesh(job.body, job.style, job.built);
      } else if (readySkinTextures(job.body, job.style, job.built)) job.phase = 'done';
      else {
        job.steps ??= skinTexturesSteps(job.body, job.style, job.built);
        if (stepOf(job.steps).done) Object.assign(job, { steps: null, phase: 'done' });
      }
    }
    if (job.phase === 'done' && (all || !swapped)) swap(key, job);
  }
  if (!all && skinBuilds.size + swapped) skinTimes.longestPump = Math.max(skinTimes.longestPump, performance.now() - started);
  return swapped;
}

/**
 * The skin workers (skinworker.js, SKIN_BUILD.workers of them), made the first time they are wanted: from the page's own copy of
 * the code when the game is one bundled file (a script element `skin-worker-source`, tools/bundle.js), else from the module beside
 * this one. Null where none can be had (SKIN_BUILD.workers 0, or one failed to start): the skins are then built on this thread, a
 * few milliseconds a frame.
 */
const skinWorkerState = { workers: undefined, next: 0, asked: new Map(), failed: false };
function skinWorkers() {
  if (!SKIN_BUILD.workers || skinWorkerState.failed || typeof Worker === 'undefined' || typeof document === 'undefined') return null;
  if (skinWorkerState.workers !== undefined) return skinWorkerState.workers;
  // It cannot be made, or dies: what any was asked is built here instead.
  const fail = () => {
    skinWorkerState.failed = true;
    for (const worker of skinWorkerState.workers ?? []) worker.thread.terminate();
    skinWorkerState.workers = null;
    for (const { job } of skinWorkerState.asked.values()) Object.assign(job, { phase: 'mesh', noWorker: true });
    skinWorkerState.asked.clear();
  };
  const workers = [];
  try {
    const source = document.getElementById('skin-worker-source')?.textContent;
    const main = document.querySelector('script[type="module"][src]')?.src ?? document.baseURI;
    const url = source ? URL.createObjectURL(new Blob([source], { type: 'text/javascript' })) : new URL('skinworker.js', new URL('.', main));
    const count = Math.max(1, Math.min(SKIN_BUILD.workers, (navigator.hardwareConcurrency ?? 2) - 1));
    for (let index = 0; index < count; index += 1) workers.push({ thread: source ? new Worker(url) : new Worker(url, { type: 'module' }), load: 0 });
  } catch {
    skinWorkerState.workers = workers;
    fail();
    return null;
  }
  for (const worker of workers) {
    worker.thread.onerror = fail;
    worker.thread.onmessage = ({ data }) => {
      const asked = skinWorkerState.asked.get(data.id);
      skinWorkerState.asked.delete(data.id);
      worker.load = Math.max(0, worker.load - 1);
      const job = asked?.job;
      if (!job || job.phase !== 'worker') return;
      if (!data.built) {
        // Refused (his body came out otherwise there) or failed: built here.
        Object.assign(job, { phase: 'mesh', noWorker: true });
        return;
      }
      storeSkinMesh(job.body, job.style, data.built);
      if (data.maps) storeSkinTextures(skinTextureKey(job.body, job.style, data.built), data.maps);
      Object.assign(job, { built: data.built, phase: 'maps' });
      skinTimes.workerMs = Math.max(skinTimes.workerMs ?? 0, data.ms);
    };
  }
  skinWorkerState.workers = workers;
  return workers;
}

/**
 * Swap a fighter's skin for the style now ready, in one frame: his bones, head, kit and soft flesh stay; only the body mesh, its
 * steel, ink and colours are new. Not once a part is cut off (the cut lifted triangles out of the skin drawn): he stays as he is.
 */
function swapSkin(view, fighterView, style, made = null) {
  if (fighterView.skinPending !== style) return false;
  fighterView.skinPending = null;
  if (fighterView.disposed || fighterView.severedBones?.size || fighterView.headDetached) return false;
  const built = readySkin(fighterView.fighter.body, style) ?? (made ? { ...made, positions: made.positions.slice() } : null);
  if (!built) return false;
  const old = [fighterView.skinMesh, fighterView.skinOutline, fighterView.steelMesh, fighterView.steelOutline].filter(Boolean);
  const skin = skinParts(view, fighterView.fighter, built, style, fighterView.bones, { machine: fighterView.machine, lacquer: fighterView.lacquer, soft: !fighterView.rigid });
  const { layers } = fighterView;
  for (const mesh of old) layers.skin.remove(mesh);
  const holder = new THREE.Group();
  holder.add(...old);
  disposeObject(holder);
  if (skin.steelMesh) layers.skin.add(skin.steelMesh, skin.steelOutline);
  layers.skin.add(skin.skinMesh, skin.skinOutline);
  Object.assign(fighterView, { built, skinMesh: skin.skinMesh, skinOutline: skin.skinOutline, steelMesh: skin.steelMesh, steelOutline: skin.steelOutline, baseColors: skin.baseColors, vertexSegment: skin.vertexSegment, bodyStyle: style, damageVersion: -1 });
  const entry = fighterView.shells.find((shell) => shell.key === 'body');
  if (entry && skin.shell) entry.shell = skin.shell;
  // As he was drawn: ghosted or not, his ink, his shadow.
  setLayer(fighterView, fighterView.layer);
  return true;
}

/** The physics layer: particles, constraints, motor targets, collision capsules. */
function buildPhysicsLayer(fighter, layers) {
  const particleMaterial = new THREE.MeshBasicMaterial({ color: 0xffd34d });
  const particles = fighter.body.masses.map((mass) => {
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.014 + 0.004 * Math.cbrt(mass), 10, 8), particleMaterial);
    layers.physics.add(sphere);
    return sphere;
  });
  const lineCount = fighter.constraints.length + fighter.body.masses.length;
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
  lines.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lineCount * 6), 3));
  const colors = new Float32Array(lineCount * 6);
  fighter.constraints.forEach((constraint, index) => {
    const color = constraint.compliance === 0 ? [1, 1, 1] : [0.55, 0.6, 0.7];
    colors.set([...color, ...color], index * 6);
  });
  for (let index = fighter.constraints.length; index < lineCount; index += 1) colors.set([0.3, 1, 0.5, 0.3, 1, 0.5], index * 6);
  lines.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  lines.frustumCulled = false;
  layers.physics.add(lines);
  const capsuleMaterial = new THREE.MeshBasicMaterial({ color: 0x46e0ff, wireframe: true, transparent: true, opacity: 0.35 });
  const capsuleMeshes = capsules(fighter).map((capsule) => {
    const isSphere = capsule.a === capsule.b;
    const mesh = new THREE.Mesh(isSphere ? new THREE.SphereGeometry(capsule.radius, 12, 8) : new THREE.CylinderGeometry(capsule.radius, capsule.radius, 1, 12, 1, true), capsuleMaterial);
    layers.physics.add(mesh);
    return { capsule, mesh, isSphere };
  });
  const gloveSpheres = ['l', 'r'].map((side) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(WORLD.gloveRadius, 12, 8), capsuleMaterial);
    layers.physics.add(mesh);
    return { index: P[`${side}Hand`], mesh };
  });
  return { particles, lines, capsuleMeshes, gloveSpheres };
}

/**
 * A crowd template: the first of a look built in detail at the bind pose,
 * and everything he wears baked into his skinned body and steel.
 */
function bakeCrowdTemplate(view, fighter) {
  const full = detailedView(view, fighter, true);
  view.scene.remove(full.group);
  const { built } = full;
  const frames = built.bindFrames;
  const points = built.bindPoints ?? bindPoints(fighter.body);
  // Head props get knocked off: each fighter wears his own, not baked; a
  // banner is drawn with the side's others (an instanced batch).
  for (const prop of full.headProps) prop.worn.parent?.remove(prop.worn);
  full.group.traverse((object) => {
    if (object.userData.banner) object.visible = false;
  });
  const seat = fighter.body.lengths.headRadius * HEAD_SEAT;
  const headFrame = frames[BONE.head];
  full.head.group.matrix.copy(frameAt(headFrame, headFrame.origin.map((value, axis) => value - headFrame.y[axis] * seat))).scale(new THREE.Vector3(HEAD_SCALE, HEAD_SCALE, HEAD_SCALE));
  const pieces = [{ root: full.head.group, bone: BONE.head }];
  for (const { object, bone, at } of full.attachments) {
    object.matrix.copy(frameAt(frames[bone], points[at]));
    pieces.push({ root: object, bone });
  }
  const baked = bakePieces(pieces);
  const own = built.positions.length / 3;
  const added = baked.positions.length / 3;
  const join = (Type, first, second) => {
    const joined = new Type(first.length + second.length);
    joined.set(first);
    joined.set(second, first.length);
    return joined;
  };
  // The baked vertices follow the body's own.
  const after = (indices) => indices.map((index) => index + own);
  const bakedSkinIndex = baked.skinIndex.flatMap((bone) => [bone, 0, 0, 0]);
  const bakedSkinWeight = baked.skinIndex.flatMap(() => [1, 0, 0, 0]);
  const template = {
    attributes: {
      position: new THREE.BufferAttribute(join(Float32Array, built.positions, baked.positions), 3),
      normal: new THREE.BufferAttribute(join(Float32Array, built.normals, baked.normals), 3),
      skinIndex: new THREE.Uint16BufferAttribute(join(Uint16Array, built.skinIndex, bakedSkinIndex), 4),
      skinWeight: new THREE.Float32BufferAttribute(join(Float32Array, built.skinWeight, bakedSkinWeight), 4),
    },
    colors: join(Float32Array, full.baseColors, baked.colors),
    bodyIndex: join(Uint32Array, full.skinMesh.geometry.index.array, after(baked.body)),
    steelIndex: join(Uint32Array, full.steelMesh?.geometry.index.array ?? [], after(baked.steel)),
    // Ink round the body and the big one-sided pieces only (see CROWD_VIEW.outlineTriangles).
    bodyOutlineIndex: join(Uint32Array, full.skinMesh.geometry.index.array, after(baked.outlined.body)),
    steelOutlineIndex: join(Uint32Array, full.steelMesh?.geometry.index.array ?? [], after(baked.outlined.steel)),
    vertexSegment: [...full.vertexSegment, ...new Array(added).fill(null)],
    frames,
    headRadius: fighter.body.lengths.headRadius,
    lacquer: full.lacquer,
    vertices: own + added,
  };
  template.far = farTemplate(template);
  disposeFighterView(view, full);
  return template;
}

/** The template's far body (see simplifyTemplate), as GPU attributes shared by every man who uses it. */
function farTemplate(template) {
  const { position, normal, skinIndex, skinWeight, ...rest } = simplifyTemplate(template);
  // Far, the steel can be drawn as part of the skin's mesh (one draw call fewer a man), dull in place of shining.
  if (!CROWD_VIEW.farSteelApart) {
    const joined = (a, b) => Uint32Array.from([...a, ...b]);
    rest.bodyIndex = joined(rest.bodyIndex, rest.steelIndex);
    rest.bodyOutlineIndex = joined(rest.bodyOutlineIndex, rest.steelOutlineIndex);
    rest.steelIndex = new Uint32Array(0);
    rest.steelOutlineIndex = new Uint32Array(0);
  }
  return {
    attributes: {
      position: new THREE.BufferAttribute(position, 3),
      normal: new THREE.BufferAttribute(normal, 3),
      skinIndex: new THREE.Uint16BufferAttribute(skinIndex, 4),
      skinWeight: new THREE.Float32BufferAttribute(skinWeight, 4),
    },
    lacquer: template.lacquer,
    ...rest,
  };
}

/** A crowd fighter's view: the template's baked body over his own bones. */
function crowdView(view, fighter, template) {
  const body = fighter.body;
  const look = lookOf(body.inputs);
  const corner = CORNER_COLORS[fighter.corner];
  const skinColor = skinHex(look);
  const group = new THREE.Group();
  const layers = Object.fromEntries(LAYERS.map((name) => [name, new THREE.Group()]));
  for (const layer of Object.values(layers)) group.add(layer);
  const bones = BONES.map(() => {
    const bone = new THREE.Bone();
    bone.matrixAutoUpdate = false;
    return bone;
  });
  const frames = boneFrames(bindPoints(body), body);
  const skeleton = new THREE.Skeleton(bones, stretchedInverses(template.frames, frames, body.lengths.headRadius / template.headRadius));
  // His own colours (bruises) and index (a part cut off); the rest is shared.
  const skinMaterial = surface(0xffffff, { skinning: true, vertexColors: true, roughness: 0.55 });
  const steelPaint = steelMaterial(view.steelEnv, { skinning: true, ...template.lacquer });
  // A body of `source` (the template, or its far body) on his skeleton: the skin and the steel, each with its ink.
  const bodyOf = (source) => {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
    geometry.setAttribute('color', new THREE.BufferAttribute(source.colors.slice(), 3));
    geometry.setIndex(new THREE.BufferAttribute(source.bodyIndex.slice(), 1));
    geometry.userData.sharedAttributes = Object.keys(source.attributes);
    const skinned = (meshGeometry, material) => {
      const mesh = new THREE.SkinnedMesh(meshGeometry, material);
      mesh.bind(skeleton, new THREE.Matrix4());
      mesh.frustumCulled = false;
      return mesh;
    };
    const mesh = skinned(geometry, skinMaterial);
    mesh.castShadow = true;
    // The ink has its own index over the same vertices (and loses a cut-off part with the body).
    const inked = (meshGeometry, index) => {
      const outlineGeometry = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(meshGeometry.attributes)) outlineGeometry.setAttribute(name, attribute);
      outlineGeometry.setIndex(new THREE.BufferAttribute(index.slice(), 1));
      outlineGeometry.userData.sharedAttributes = Object.keys(meshGeometry.attributes);
      return outlineFor({ isSkinnedMesh: true, geometry: outlineGeometry, skeleton, bindMatrix: new THREE.Matrix4() });
    };
    const outline = inked(geometry, source.bodyOutlineIndex);
    mesh.userData.ink = outline;
    let steel = null;
    let steelOutline = null;
    if (source.steelIndex.length) {
      const steelGeometry = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(geometry.attributes)) steelGeometry.setAttribute(name, attribute);
      steelGeometry.setIndex(new THREE.BufferAttribute(source.steelIndex.slice(), 1));
      // The colour is his own, but the skin's geometry frees it.
      steelGeometry.userData.sharedAttributes = Object.keys(geometry.attributes);
      steel = skinned(steelGeometry, steelPaint);
      steelOutline = inked(steelGeometry, source.steelOutlineIndex);
      steel.userData.ink = steelOutline;
    }
    return { mesh, outline, steel, steelOutline, baseColors: source.colors, vertexSegment: source.vertexSegment };
  };
  const near = bodyOf(template);
  const { mesh: skinMesh, outline: skinOutline, steel: steelMesh } = near;
  layers.skin.add(skinMesh, skinOutline);
  if (steelMesh) layers.skin.add(steelMesh, near.steelOutline);
  // What is his own: the head props he can lose, and anything painted on cloth.
  const headGroup = new THREE.Group();
  headGroup.matrixAutoUpdate = false;
  layers.skin.add(headGroup);
  const dress = leaderDress(dressFor(body.inputs, corner), fighter);
  const garmentColors = { ...roleColors(dress, new THREE.Color(skinColor)), accent: dress.feet.accent };
  const plainSteel = steelMaterial(view.steelEnv, { vertexColors: false, color: garmentColors.steel, ...template.lacquer });
  const allowed = headgearOptions(dress.kind);
  const headProps = (body.inputs.accessories ?? []).filter((kind) => allowed.includes(kind)).map((kind) => {
    const make = () => (kind === 'headset' ? headsetMesh(body) : buildHeadProp(kind, body, dress, garmentColors, plainSteel, corner));
    const worn = make();
    if (!worn) return null;
    headGroup.add(worn);
    return { kind, worn, loose: make() };
  }).filter(Boolean);
  const attachments = [];
  let banner = null;
  if (dress.armor?.backPrint || dress.banner) {
    const collar = new THREE.Group();
    collar.matrixAutoUpdate = false;
    layers.skin.add(collar);
    attachments.push({ object: collar, bone: BONE.chest, at: P.neck });
    if (dress.armor?.backPrint) collar.add(buildBackPrint(body, dress.armor.backPrint));
    if (dress.banner) {
      // The side's banners are one instanced batch, made at 1.8 m and set
      // to each man's size and back (see buildBanner).
      const batch = crowdBatch(view, `banner:${dress.banner}${dress.greatBanner ? `:great:${dress.bannerLook}` : ''}`, () => buildBanner({ heightM: 1.8, segments: { trunk: { skinRadius: 0 } } }, dress.banner, dress.greatBanner, dress.bannerLook));
      const scale = body.heightM / 1.8;
      const back = -(body.segments.trunk.skinRadius * 0.62 * 1.32 + 0.05);
      const local = new THREE.Matrix4().makeTranslation(back + 0.05 * scale, 0, 0).multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
      banner = { batch, collar, local, matrix: new THREE.Matrix4() };
    }
  }
  // The bone and physics layers of a crowd man are built when one is shown (ensureCrowdLayers): a man is 45 objects more in the scene, each drawn into nothing and each walked every frame.
  const boneGroups = BONES.map(() => new THREE.Group());
  thinOut(layers.skin, skinMesh);
  // The far body, on the same skeleton: shown instead of the near one beyond CROWD_VIEW.lodDistance (see selectCrowdDraw).
  const far = bodyOf(template.far);
  // A small piece of steel has no ink near, and none far.
  if (far.steelOutline && near.steelOutline && !near.steelOutline.parent) {
    far.steel.userData.ink = null;
    far.steelOutline = null;
  }
  far.mesh.visible = false;
  // (A far body may go without ink: only what there is is added.)
  for (const mesh of [far.mesh, far.outline, far.steel, far.steelOutline]) if (mesh) layers.skin.add(mesh);
  for (const mesh of [far.outline, far.steelOutline, far.steel]) if (mesh) mesh.visible = false;
  // He is at the origin, his bones in world coordinates: nothing in him needs a matrix of its own made each frame.
  for (const holder of [group, ...Object.values(layers)]) holder.matrixAutoUpdate = false;
  view.scene.add(group);
  return {
    fighter, group, layers, bones, built: { bindFrames: template.frames }, skinMesh, skinOutline, muscle: null, skeleton: boneGroups, attachments, shells: [], near, far,
    baseColors: template.colors, vertexSegment: template.vertexSegment, damageVersion: -1, headProps, dangles: [], steelMesh,
    head: { group: headGroup, shell: { dent() {} }, update() {}, hideHair() {} }, layer: 'skin', frames, baked: true, banner,
  };
}

// A simple character (a crowd of them) draws its ink outline only round the
// shapes big enough to read at a distance, and casts its shadow from the body
// alone: a rebel's eyelids and finger joints cost as much to draw as his torso.
const SIMPLE_OUTLINE_TRIANGLES = 600;

function thinOut(skinLayer, skinMesh) {
  const triangles = (geometry) => (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
  const drop = [];
  skinLayer.traverse((object) => {
    if (!object.isMesh) return;
    if (object.userData.outline) {
      if (object.parent !== skinMesh && triangles(object.geometry) < SIMPLE_OUTLINE_TRIANGLES) drop.push(object);
      return;
    }
    object.castShadow = object === skinMesh;
  });
  for (const outline of drop) {
    outline.material.dispose();
    outline.parent.remove(outline);
  }
}

/** The muscle layer is built the first time it is shown: it costs a body mesh. */
function ensureMuscle(fighterView) {
  if (fighterView.muscle) return;
  const built = buildBodyMesh(fighterView.fighter.body, 'muscle', 0.016);
  const mesh = skinnedMesh(built, fighterView.bones, paintMuscle(built));
  fighterView.layers.muscle.add(mesh, outlineFor(mesh, 0.003));
  fighterView.muscle = { built, mesh };
}

export function disposeFighterView(view, fighterView) {
  fighterView.disposed = true;
  view.scene.remove(fighterView.group);
  for (const prop of fighterView.headProps ?? []) {
    if (prop.loose.parent) view.scene.remove(prop.loose);
    disposeObject(prop.loose);
  }
  fighterView.group.traverse((object) => {
    // Shared with the crowd: the template's vertices and merged weapons stay for the others.
    if (!object.geometry || object.userData.shared) return;
    for (const name of object.geometry.userData.sharedAttributes ?? []) object.geometry.deleteAttribute(name);
  });
  disposeObject(fighterView.group);
}

/** Free the crowd templates and instanced batches, once no view uses them (between bouts). */
export function clearCrowdTemplates(view) {
  const release = (attributes) => {
    const holder = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(attributes)) holder.setAttribute(name, attribute);
    holder.dispose();
  };
  for (const template of view.crowdTemplates?.values() ?? []) {
    release(template.attributes);
    release(template.far.attributes);
  }
  for (const batch of view.crowdBatches?.values() ?? []) batch.dispose();
  view.crowdTemplates = new Map();
  view.crowdBatches = new Map();
}

function dangleColliders(fighterView, points) {
  const body = fighterView.fighter.body;
  const v = (at) => new THREE.Vector3(...at);
  const head = v(points[P.head]);
  // Whatever is worn over the trunk stands off it: hair rests on that.
  const dress = dressFor(body.inputs, 0);
  const cloth = Math.max(TOPS[dress.top?.kind]?.loose ?? 1, dress.armor ? 1.2 : 1);
  // The trunk is wider than deep; the capsule is sized to its depth, so hair
  // falling from the back of the head lies on the back (the shoulders have
  // their own capsule).
  const trunkRadius = body.segments.trunk.skinRadius * 0.8 * cloth;
  const neck = v(points[P.neck]);
  const pelvis = v(points[P.pelvis]);
  // The trunk capsule stops short of the neck, under the collarbones.
  const top = pelvis.clone().lerp(neck, 0.9);
  return [
    { a: head, b: head, radius: body.lengths.headRadius * HEAD_SCALE * 1.02 },
    { a: pelvis, b: top, radius: trunkRadius, part: 'trunk' },
    { a: v(points[P.lShoulder]), b: v(points[P.rShoulder]), radius: body.segments.lUpperArm.skinRadius * 1.25 * cloth, part: 'shoulders' },
    // The upper arms and the legs: a hung shoulder guard rides on the arm, a
    // skirt panel or a cloak on the legs (the shins too, so a knee raised in a
    // step pushes a long skirt forward instead of coming through it).
    ...['l', 'r'].flatMap((side) => [
      { a: v(points[P[`${side}Shoulder`]]), b: v(points[P[`${side}Elbow`]]), radius: body.segments[`${side}UpperArm`].skinRadius * 1.15 * cloth, part: 'arm' },
      { a: v(points[P[`${side}Hip`]]), b: v(points[P[`${side}Knee`]]), radius: body.segments[`${side}Thigh`].skinRadius * 1.15 * (dress.armor ? 1.1 : 1), part: 'leg' },
      { a: v(points[P[`${side}Knee`]]), b: v(points[P[`${side}Foot`]]), radius: body.segments[`${side}Shank`].skinRadius * 1.3 * (dress.armor ? 1.1 : 1), part: 'leg' },
    ]),
  ];
}

/**
 * Over-ear headphones, in head coordinates: a band over the crown, a cup over
 * each ear. Returned so the view can hide it once it is knocked off, along
 * with a loose copy for the floor.
 */
function headsetMesh(body) {
  const r = body.lengths.headRadius;
  const shell = surface(0x1b1c22, { roughness: 0.35 });
  const accent = surface(0xd6402e, { roughness: 0.4 });
  {
    const set = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.02 * r, 0.06 * r, 8, 28, Math.PI), shell);
    band.rotation.y = Math.PI / 2;
    band.position.y = 0.05 * r;
    set.add(band);
    for (const side of [1, -1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.36 * r, 0.38 * r, 0.2 * r, 20), shell);
      cup.rotation.x = Math.PI / 2;
      cup.position.set(-0.05 * r, -0.05 * r, side * 0.98 * r);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33 * r, 0.04 * r, 6, 20), accent);
      ring.position.set(-0.05 * r, -0.05 * r, side * 1.09 * r);
      set.add(cup, ring);
    }
    for (const piece of set.children) {
      piece.castShadow = true;
      piece.add(outlineFor(piece, 0.003));
    }
    return set;
  }
}

/**
 * A hoodie's hood, bunched behind the neck, and its two drawstrings: each
 * hangs from the collar and swings with the body's movement.
 */
function buildHood(body, collar, colorHex) {
  const scale = body.heightM / 1.8;
  const cloth = surface(new THREE.Color(colorHex).getHex());
  const lining = surface(new THREE.Color(colorHex).multiplyScalar(0.6).getHex());
  const dangles = [];
  // Collar coordinates: x forward, y up the chest, z to the left.
  // Hung from the back of the collar, clear of the hoodie's own shell.
  const backOfNeck = body.segments.trunk.skinRadius * 0.75 + 0.03 * scale;
  const hood = new Dangle(collar, [-backOfNeck, -0.01 * scale, 0], [-0.35, -1, 0], 0.2 * scale, { sag: 0.5, damping: 0.3 });
  const bag = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), cloth);
  bag.scale.set(0.06 * scale, 0.13 * scale, 0.14 * scale);
  bag.position.y = -0.08 * scale;
  bag.rotation.z = Math.PI;
  const inside = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), lining);
  inside.scale.copy(bag.scale);
  inside.position.copy(bag.position);
  inside.position.x += 0.012 * scale;
  inside.rotation.z = Math.PI;
  for (const piece of [bag, inside]) {
    piece.castShadow = true;
    piece.add(outlineFor(piece, 0.003));
    hood.group.add(piece);
  }
  dangles.push(hood);
  const cord = surface(0xf0ece4);
  for (const side of [1, -1]) {
    const string = new Dangle(collar, [0.07 * scale, -0.03 * scale, side * 0.035 * scale], [0.25, -1, side * 0.05], 0.17 * scale, { sag: 0.8, damping: 0.15 });
    const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.004 * scale, 0.004 * scale, 0.17 * scale, 5), cord);
    strand.position.y = -0.085 * scale;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.006 * scale, 0.006 * scale, 0.02 * scale, 6), surface(0x8a8a8a));
    tip.position.y = -0.17 * scale;
    string.group.add(strand, tip);
    dangles.push(string);
  }
  return dangles;
}

/** A crowd man's bone and physics layers, made the first time a layer other than the skin is shown. */
function ensureCrowdLayers(fighterView) {
  if (fighterView.particles) return;
  for (const piece of fighterView.skeleton) fighterView.layers.bone.add(piece);
  Object.assign(fighterView, buildPhysicsLayer(fighterView.fighter, fighterView.layers));
}

/**
 * The anatomical skeleton, built the first time the bone or muscle view shows it (the skin view draws none): its pieces fill the
 * empty group of each rig bone, posed where the rig is now, a severed part's bones left hidden and a broken joint's red.
 */
function ensureSkeleton(fighterView) {
  if (fighterView.skeletonBuilt || fighterView.baked) return;
  fighterView.skeletonBuilt = true;
  buildSkeleton(fighterView.fighter.body, fighterView.built.bindFrames, fighterView.skeleton);
  fighterView.skeleton.forEach((piece, index) => {
    piece.matrix.fromArray(frameMatrix(fighterView.frames[index]));
    piece.matrixWorldNeedsUpdate = true;
    fighterView.layers.bone.add(piece);
  });
  for (const bone of fighterView.severedBones ?? []) fighterView.skeleton[bone].visible = false;
  reddenBrokenBones(fighterView);
}

/** Which layers show: skin; muscle (with bone); bone over a ghost; physics over a ghost. */
export function setLayer(fighterView, layer) {
  fighterView.layer = layer;
  if (fighterView.baked && layer !== 'skin') ensureCrowdLayers(fighterView);
  if (layer === 'muscle') ensureMuscle(fighterView);
  if (layer === 'muscle' || layer === 'bone') ensureSkeleton(fighterView);
  const { layers, skinMesh, skinOutline, head, attachments } = fighterView;
  const ghost = layer === 'physics' ? 0.25 : layer === 'bone' ? 0.12 : 1;
  layers.skin.visible = layer !== 'muscle';
  layers.muscle.visible = layer === 'muscle';
  layers.bone.visible = layer === 'muscle' || layer === 'bone';
  layers.physics.visible = layer === 'physics';
  // Ghosting: the body goes see-through and drops its ink; the head and kit hide.
  for (const mesh of [skinMesh, fighterView.steelMesh].filter(Boolean)) {
    mesh.material.transparent = ghost < 1;
    mesh.material.opacity = ghost;
    mesh.material.depthWrite = ghost === 1;
  }
  skinMesh.castShadow = ghost === 1;
  skinOutline.visible = ghost === 1;
  head.group.visible = ghost === 1;
  for (const { object } of attachments) object.visible = ghost === 1;
}

// ---- Per-frame update -----------------------------------------------------

export function updateFighterView(fighterView, dt, time) {
  // A shed standard lies on the ground now (a loose weapon), not on his back.
  if (fighterView.fighter.wornStandard?.shed && !fighterView.standardShed) {
    fighterView.standardShed = true;
    fighterView.banner = null;
    fighterView.group.traverse((object) => {
      if (object.userData.banner) object.visible = false;
    });
  }
  const fighter = fighterView.fighter;
  // A crowd fighter lying still (out, his body asleep) is drawn as he was:
  // nothing of him has moved since (his hips and head are where they were).
  if (fighterView.baked && fighter.state === 'out') {
    const x = fighter.x;
    const [hip, head] = [P.pelvis * 3, P.head * 3];
    const was = (fighterView.lyingAt ??= [NaN, NaN, NaN, NaN, NaN, NaN]);
    const same = was[0] === x[hip] && was[1] === x[hip + 1] && was[2] === x[hip + 2] && was[3] === x[head] && was[4] === x[head + 1] && was[5] === x[head + 2];
    for (let axis = 0; axis < 3; axis += 1) {
      was[axis] = x[hip + axis];
      was[3 + axis] = x[head + axis];
    }
    if (same) return;
  }
  // A crowd fighter standing posed in the ranks (a proxy) is redrawn every
  // other frame: his pose barely moves, and a big battle has a hundred of him.
  // (Not the frame he comes back from off screen: his last pose is long gone.)
  if (fighterView.baked && fighter.detail === 'proxy' && !fighterView.stale) {
    fighterView.restFrame = !fighterView.restFrame;
    if (fighterView.restFrame) {
      addBanner(fighterView);
      return;
    }
  }
  const points = PARTICLES.map((_, index) => point(fighter.x, index));
  // Left out of the picture for a while (culled): his last pose says nothing about this one, so no turn is held back.
  const frames = coherentFrames(boneFrames(points, fighter.body), fighterView.stale ? null : fighterView.frames);
  fighterView.frames = frames;
  fighterView.stale = false;
  frames.forEach((frame, index) => {
    const matrix = frameMatrix(frame);
    fighterView.bones[index].matrixWorld.fromArray(matrix);
    // The bone pieces are in the scene only once the bone layer is built (a crowd man's with his other layers).
    if (fighterView.baked ? !fighterView.particles : !fighterView.skeletonBuilt) return;
    fighterView.skeleton[index].matrix.fromArray(matrix);
    fighterView.skeleton[index].matrixWorldNeedsUpdate = true;
  });
  // Bones whose part was cut off: what skin is left on them shrinks into the joint.
  for (const index of fighterView.severedBones ?? []) {
    const at = frames[index].origin;
    fighterView.bones[index].matrixWorld.makeScale(1e-4, 1e-4, 1e-4).setPosition(at[0], at[1], at[2]);
  }
  const headFrame = frames[BONE.head];
  // Seated a little down the neck, as drawn heads are. (A crowd man's head is baked: his group holds only what he can lose.)
  const seat = fighter.body.lengths.headRadius * HEAD_SEAT;
  if (!fighterView.headDetached && !(fighterView.baked && !fighterView.headProps.length)) {
    fighterView.head.group.matrix.fromArray(frameMatrix({ ...headFrame, origin: headFrame.origin.map((value, axis) => value - headFrame.y[axis] * seat) })).scale(HEAD_SCALES);
    fighterView.head.group.matrixWorldNeedsUpdate = true;
  }
  for (const { object, bone, at } of fighterView.attachments) {
    object.matrix.fromArray(frameMatrix({ ...frames[bone], origin: points[at] }));
    object.matrixWorldNeedsUpdate = true;
  }
  if (fighter.damageVersion !== fighterView.damageVersion) paintDamage(fighterView);
  // A baked crowd fighter has no flesh, face or cloth of his own to move.
  if (fighterView.baked) {
    addBanner(fighterView);
    if (fighterView.layer === 'physics') updatePhysicsLayer(fighterView);
    return;
  }
  const step = Math.min(dt, 1 / 30);
  for (const entry of fighterView.shells) entry.shell.update(step);
  // What hanging hair and cloth rest on: the head, and the trunk with
  // whatever is worn over it.
  const colliders = dangleColliders(fighterView, points);
  if (!fighterView.headDetached) fighterView.head.update(step, fighter, time, colliders);
  for (const dangle of fighterView.dangles) dangle.update(step, colliders.slice(1));
  if (fighterView.layer === 'physics') updatePhysicsLayer(fighterView);
}

const drawFrustum = new THREE.Frustum();
const drawMatrix = new THREE.Matrix4();
const drawSphere = new THREE.Sphere();

const shadowFrusta = [new THREE.Frustum(), new THREE.Frustum()];

/** The lights that cast a shadow now, each as a frustum of what its shadow map holds: how many (in `shadowFrusta`). */
function shadowCasters(view) {
  let count = 0;
  for (const light of [view.lights.sun, view.lights.key]) {
    if (!light.castShadow || light.intensity <= 0) continue;
    light.updateMatrixWorld();
    light.target.updateMatrixWorld();
    light.shadow.updateMatrices(light);
    const { camera } = light.shadow;
    shadowFrusta[count].setFromProjectionMatrix(drawMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    count += 1;
  }
  return count;
}

/** Whether the sphere meets any of the first `count` shadow frusta. */
function inShadowMap(count) {
  for (let light = 0; light < count; light += 1) if (shadowFrusta[light].intersectsSphere(drawSphere)) return true;
  return false;
}

/**
 * How each baked crowd man is drawn this frame (see crowdlod.js): left out
 * if he is off screen, his far body beyond CROWD_VIEW.lodDistance, no shadow
 * when far or outside the shadow map, ink only near the camera (beyond
 * CROWD_VIEW.inkDistance an outline is a pixel or two, and each costs a draw
 * call, two with its shadow). `safe`: ids of the men always drawn in full
 * (protectedMen). `config`: the distances (CROWD_VIEW, or a stage's: crowdlod.js). Sets `culled` on a view that is not drawn this frame, for
 * the caller to skip his update.
 */
export function selectCrowdDraw(view, fighterViews, safe, config = CROWD_VIEW) {
  const camera = view.camera;
  camera.updateMatrixWorld();
  drawFrustum.setFromProjectionMatrix(drawMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const lit = crowdLod.enabled ? shadowCasters(view) : 0;
  drawSphere.radius = config.cullRadius;
  const inkRange = config.inkDistance * config.inkDistance;
  for (const fighterView of fighterViews) {
    if (!fighterView.baked) continue;
    const fighter = fighterView.fighter;
    // A dormant man of a stage is not drawn at all (main.js).
    if (fighter.dormant) continue;
    const px = fighter.x[P.pelvis * 3];
    const py = fighter.x[P.pelvis * 3 + 1];
    const pz = fighter.x[P.pelvis * 3 + 2];
    const dx = px - camera.position.x;
    const dy = py - camera.position.y;
    const dz = pz - camera.position.z;
    const draw = (fighterView.draw ??= { culled: false, far: false, shadow: true });
    // Another layer (muscle, bone, physics) shows the full body, ghosted: the view is as built.
    if (!crowdLod.enabled || fighterView.layer !== 'skin' || fighterView.severedBones?.size) {
      Object.assign(draw, { culled: false, far: false, shadow: true });
    } else {
      drawSphere.center.set(px, py, pz);
      chooseDraw(draw, {
        distance: Math.sqrt(dx * dx + dy * dy + dz * dz),
        fallen: fighter.state !== 'up',
        safe: safe.has(fighter.id),
        inView: drawFrustum.intersectsSphere(drawSphere),
        inShadow: inShadowMap(lit),
      }, config);
    }
    fighterView.culled = draw.culled;
    fighterView.group.visible = !draw.culled;
    if (draw.culled) continue;
    const ink = dx * dx + dy * dy + dz * dz < inkRange;
    const skinLayer = fighterView.layer === 'skin';
    showBody(fighterView.near, !draw.far, ink, draw.shadow, skinLayer);
    showBody(fighterView.far, draw.far, ink, draw.shadow, skinLayer);
  }
}

/** One of a man's two bodies: shown or not, with its ink and its shadow (the ghosted layers set their own, see setLayer). */
function showBody(body, shown, ink, shadow, skinLayer) {
  for (const mesh of [body.mesh, body.steel]) {
    if (!mesh) continue;
    mesh.visible = shown;
    if (skinLayer && mesh.userData.ink) mesh.userData.ink.visible = shown && ink;
  }
  if (skinLayer) body.mesh.castShadow = shadow;
}

/** A baked crowd fighter's banner, into its side's batch for this frame. */
function addBanner(fighterView) {
  const banner = fighterView.banner;
  if (banner && banner.collar.visible && fighterView.layers.skin.visible) banner.batch.add(banner.matrix.multiplyMatrices(banner.collar.matrix, banner.local));
}

function updatePhysicsLayer(fighterView) {
  const fighter = fighterView.fighter;
  fighterView.particles.forEach((sphere, index) => {
    const p = point(fighter.x, index);
    sphere.position.set(p[0], p[1], p[2]);
  });
  const positions = fighterView.lines.geometry.attributes.position.array;
  let cursor = 0;
  for (const constraint of fighter.constraints) {
    positions.set(point(fighter.x, constraint.i), cursor);
    positions.set(point(fighter.x, constraint.j), cursor + 3);
    cursor += 6;
  }
  // Green: from each particle to where its motor is pulling it.
  for (let index = 0; index < fighter.body.masses.length; index += 1) {
    positions.set(point(fighter.x, index), cursor);
    positions.set(fighter.targets[index] ?? point(fighter.x, index), cursor + 3);
    cursor += 6;
  }
  fighterView.lines.geometry.attributes.position.needsUpdate = true;
  for (const { capsule, mesh, isSphere } of fighterView.capsuleMeshes) {
    const [a, b] = capsuleEnds(fighter, capsule).map(v3);
    if (isSphere) {
      mesh.position.copy(a);
      continue;
    }
    const axis = tmpB.copy(b).sub(a);
    mesh.position.copy(a).addScaledVector(axis, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, axis.clone().normalize());
    mesh.scale.set(1, axis.length(), 1);
  }
  for (const { index, mesh } of fighterView.gloveSpheres) mesh.position.copy(v3(point(fighter.x, index)));
}

// Rig bones to the physics' body segments, for damage.
const BONE_SEGMENT = {
  pelvis: 'trunk', spine: 'trunk', chest: 'trunk', neck: 'head', head: 'head',
  lClavicle: 'trunk', rClavicle: 'trunk', lUpperArm: 'lUpperArm', rUpperArm: 'rUpperArm', lForearm: 'lForearm', rForearm: 'rForearm',
  lThigh: 'lThigh', rThigh: 'rThigh', lShin: 'lShank', rShin: 'rShank', lFoot: 'lShank', rFoot: 'rShank',
};
const JOINT_BONES = {
  lElbow: ['lUpperArm', 'lForearm'], rElbow: ['rUpperArm', 'rForearm'], lKnee: ['lThigh', 'lShin'], rKnee: ['rThigh', 'rShin'],
  lHip: ['lThigh'], rHip: ['rThigh'], neck: ['neck', 'head'],
};
const BRUISE = new THREE.Color(0xa3121c);
const BROKEN = new THREE.Color(0xe01b1b);

/**
 * Skin reddens with each segment's damage; a broken joint turns its limb
 * fully red, on the skin and in the skeleton.
 */
function paintDamage(fighterView) {
  const fighter = fighterView.fighter;
  fighterView.damageVersion = fighter.damageVersion;
  const brokenSegments = new Set([...fighter.broken].flatMap((joint) => JOINT_SEGMENTS[joint]));
  const mixed = new THREE.Color();
  // A crowd man's far body is tinted too, from its own base colours.
  const bodies = [{ mesh: fighterView.skinMesh, base: fighterView.baseColors, segments: fighterView.vertexSegment }];
  if (fighterView.far) bodies.push({ mesh: fighterView.far.mesh, base: fighterView.far.baseColors, segments: fighterView.far.vertexSegment });
  for (const { mesh, base, segments } of bodies) {
    const colors = mesh.geometry.attributes.color;
    segments.forEach((segment, vertex) => {
      if (!segment) return;
      mixed.setRGB(base[vertex * 3], base[vertex * 3 + 1], base[vertex * 3 + 2]);
      if (brokenSegments.has(segment)) mixed.copy(BROKEN);
      else mixed.lerp(BRUISE, Math.min(1, fighter.damage[segment] ?? 0) * 0.85);
      colors.setXYZ(vertex, mixed.r, mixed.g, mixed.b);
    });
    colors.needsUpdate = true;
  }
  if (fighterView.skeletonBuilt) reddenBrokenBones(fighterView);
}

/** A broken joint's bones are red in the skeleton (once it is built: ensureSkeleton). */
function reddenBrokenBones(fighterView) {
  for (const joint of fighterView.fighter.broken) {
    for (const bone of JOINT_BONES[joint]) {
      fighterView.skeleton[BONE[bone]].traverse((object) => {
        if (object.isMesh && !object.userData.outline) object.material = fighterView.brokenBone ?? (fighterView.brokenBone = surface(0xe01b1b));
      });
    }
  }
}

/**
 * Props in the world: a worn one shows on its owner's head; once knocked
 * off, a loose copy flies, tumbles and lies where the physics put it.
 */
export function updateProps(view, fighterViews, world) {
  for (const prop of world.props ?? []) {
    const owner = fighterViews.find((entry) => entry.fighter.id === prop.owner);
    const worn = owner?.headProps?.find((entry) => entry.kind === prop.kind);
    if (!worn) continue;
    worn.worn.visible = prop.attached && owner.layers.skin.visible && !owner.headDetached;
    if (prop.attached) continue;
    if (!worn.loose.parent) {
      worn.loose.scale.setScalar(HEAD_SCALE);
      view.scene.add(worn.loose);
    }
    worn.loose.position.set(...prop.x);
    worn.loose.rotation.set(...prop.turn);
  }
}

/** Show an impact: dent the struck flesh and throw a spray of sweat. */
const SPRAY = { most: 60, geometry: null };

export function showImpact(view, fighterViews, event) {
  const defenderView = fighterViews.find((entry) => entry.fighter.id === event.defender);
  if (!defenderView) return;
  const where = v3(event.point);
  // Rigid shells (`rigid`, no SoftShell) take a blow without a dent: sparks, not sweat.
  if (defenderView.rigid) {
    showSparks(view, where, event);
    return;
  }
  if (event.target === 'head') defenderView.head.shell.dent(where, event.impulse);
  else {
    // Carry the world point back to the bind pose through the struck bone.
    const frames = defenderView.frames;
    let bone = BONE[event.target] ?? BONE.chest;
    if (event.target === 'trunk') {
      const distanceTo = (index) => Math.hypot(...toFrame(frames[index], event.point));
      bone = [BONE.pelvis, BONE.spine, BONE.chest].reduce((best, index) => (distanceTo(index) < distanceTo(best) ? index : best));
    }
    const bind = fromFrame(defenderView.built.bindFrames[bone], toFrame(frames[bone], event.point));
    defenderView.shells.find((entry) => entry.key === 'body')?.shell.dentLocal(v3(bind), event.impulse);
  }
  showSparks(view, where, event, 0xdfe9ff);
}

/** A spray off the struck point: sweat off flesh (pale), sparks off a machine's shells (hot orange). */
function showSparks(view, where, event, color = 0xffb35c) {
  const spray = view.spray ?? (view.spray = []);
  // Every drop is the one sphere, scaled; a melee of a hundred keeps a few at a time.
  const count = Math.min(14, Math.round(event.impulse / 2), SPRAY.most - spray.length);
  SPRAY.geometry ??= new THREE.SphereGeometry(1, 6, 4);
  for (let index = 0; index < count; index += 1) {
    const drop = new THREE.Mesh(SPRAY.geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
    drop.scale.setScalar(0.008 + Math.random() * 0.006);
    drop.position.copy(where);
    const direction = v3(event.normal).multiplyScalar(-1).add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5));
    drop.userData = { velocity: direction.normalize().multiplyScalar(1.5 + Math.random() * event.speed * 0.35), life: 0.6 };
    view.scene.add(drop);
    spray.push(drop);
  }
}

export function updateSpray(view, dt) {
  if (!view.spray) return;
  view.spray = view.spray.filter((drop) => {
    drop.userData.life -= dt;
    drop.userData.velocity.y -= 9.81 * dt;
    drop.position.addScaledVector(drop.userData.velocity, dt);
    drop.material.opacity = Math.max(0, drop.userData.life / 0.6);
    if (drop.userData.life > 0 && drop.position.y > 0) return true;
    view.scene.remove(drop);
    drop.material.dispose();
    return false;
  });
}

export function render(view) {
  // A place that moves (rain, a ship at anchor) moves with the clock.
  view.places?.[view.place]?.userData.tick?.(performance.now() / 1000);
  updateSceneryLod(view);
  drawFrame(view);
  // The warmers have done their work once drawn a few times; seven calls a frame for nothing after that.
  if (view.warmFrames > 0 && (view.warmFrames -= 1) === 0 && view.warmers) view.warmers.visible = false;
}
