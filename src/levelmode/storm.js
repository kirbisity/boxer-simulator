// The weather of Stage 1: a sea under a sky, rain that follows the player and stops under a roof, and (in the looks that have it)
// lightning every several seconds (seeded, so a run has its own storm but the same each time): a bolt over the water and a flash on
// the whole scene. How it looks is a *look* (stagelooks.js: a bruised storm, a break in the cloud, a sea fog, a night squall, a grey
// day, a dusk): its sky is painted (stagesky.js), its light, fog, sea, rain and strikes are set from it here, and it can be changed
// while the stage runs (`stormSetLook`). The grading is baked into the colours, so there is no full-screen pass; the one thing added to
// the page is a cheap vignette (boxer.css, body[data-place="dunnottar"]).
//
// render.js builds the place with `buildStormPlace({ buildRain })` and calls the place's `tick(time)` each frame; the
// castle kit (kit.js) tells it where the player is (`stormFollow`), so that the rain falls round him and the sea and sky
// stay put round the stage.

import { ktPatch, ktRandom, ktWeather } from './kittex.js';
import { DEFAULT_STAGE_LOOK, STAGE_LOOKS, stageLookOf } from './stagelooks.js';
import { hexToRgb, skyDirection, stageShaftCanvas, stagePoolCanvas, stageSkyCanvas } from './stagesky.js';

/** Where the weather is centred: round the stage, and the rain and bolts round the player. */
const STORM = {
  centre: [-30, 0, 0],
  skyRadius: 560,
  seaSize: 1800,
  // A strike: the bolt is on for `boltSeconds` (a crack, a dip, a second crack); the light it throws decays by `flashSeconds`. The gap between strikes is the look's.
  flashSeconds: 0.34,
  boltSeconds: 0.2,
  // Where the shaft of light (a look's `shaft`) lands: the middle of the castle.
  target: [14, 14, -6],
  rain: { halfX: 15, halfZ: 15, height: 18, count: 2200, speed: 15, length: 0.8, slant: [3.2, 0, -1.4] },
};

let FLASH_WHITE = null;

const stormState = {
  follow: [-100, 14, 0],
  indoors: false,
  place: null,
  view: null,
  random: ktRandom(1500),
  nextStrike: 9,
  strike: null,
  base: null,
  environments: new Map(),
  skies: new Map(),
  look: DEFAULT_STAGE_LOOK,
  dirty: true,
  fog: null,
  still: false,
  torch: 1,
  time: 0,
  // The share of the look's rain that is drawn (quality.js): 1 on a machine that keeps up, less on one that does not.
  rainShare: 1,
  rainDirty: false,
};

/** Tell the weather where the player is (and whether he is under a roof). */
export function stormFollow(x, y, z, indoors = false) {
  stormState.follow[0] = x;
  stormState.follow[1] = y;
  stormState.follow[2] = z;
  stormState.indoors = indoors;
}

/** How far the fog reaches now (m): its far end, where nothing is seen. */
export const stormFogFar = () => stormState.fog?.far ?? Infinity;

/** Draw this share (0..1) of the look's rain (a quality tier's, levelmode/quality.js). */
export function stormRain(share) {
  if (share === stormState.rainShare) return;
  stormState.rainShare = share;
  stormState.rainDirty = true;
}

/** Start a run of the storm over: a new seed (the stage's), strikes from the beginning. */
export function stormReset(seed = 1500) {
  stormState.random = ktRandom(seed);
  stormState.nextStrike = stormGap(9);
  stormState.strike = null;
}

/** When the next strike is, `first` s from now if the look has strikes at all, else never; and never in a still picture. */
function stormGap(first) {
  const strikes = stageLookOf(stormState.look).lightning;
  return strikes && !stormState.still ? stormState.time + first : Infinity;
}

/** The look the stage is in now (its name). */
export const stormLook = () => stormState.look;

/** How bright the torches burn in this look (kit.js multiplies its lights by it). */
export const stormTorch = () => stormState.torch;

/**
 * Put the stage in another look (a key of STAGE_LOOKS; an unknown name is the default's); the weather follows at the next frame. `still`: no strikes
 * (for a picture that is the same each time). Returns the look's name.
 */
export function stormSetLook(name, { still } = {}) {
  if (still !== undefined) stormState.still = still;
  if (name !== undefined) stormState.look = STAGE_LOOKS[name] ? name : DEFAULT_STAGE_LOOK;
  stormState.dirty = true;
  stormState.nextStrike = stormGap(stormState.random() * 8 + 5);
  return stormState.look;
}

// ---- the sky ---------------------------------------------------------------------------------------

/** The painted sky of a look, as a texture (made once). */
function stormSkyTexture(name) {
  let texture = stormState.skies.get(name);
  if (!texture) {
    texture = new THREE.CanvasTexture(stageSkyCanvas(stageLookOf(name).sky));
    stormState.skies.set(name, texture);
  }
  return texture;
}

/** A wave normal map: many waves of random direction and size (whole numbers of them to the tile, so it tiles), turned into normals. */
function stormWaveTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const image = g.createImageData(size, size);
  const random = ktRandom(808);
  const waves = [];
  for (let k = 0; k < 16; k += 1) {
    const kx = Math.round((random() - 0.5) * 18);
    const ky = Math.round((random() - 0.5) * 18);
    if (!kx && !ky) continue;
    waves.push({ kx, ky, phase: random() * Math.PI * 2, amplitude: 1 / Math.hypot(kx, ky) });
  }
  const height = (x, y) => {
    let h = 0;
    for (const w of waves) h += Math.sin(((x * w.kx + y * w.ky) / size) * Math.PI * 2 + w.phase) * w.amplitude;
    return h;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = -(height(x + 1, y) - height(x - 1, y)) * 2.2;
      const ny = -(height(x, y + 1) - height(x, y - 1)) * 2.2;
      const length = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      image.data[i] = ((nx / length) * 0.5 + 0.5) * 255;
      image.data[i + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      image.data[i + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** The environment the wet stone, the puddles and the sea reflect: the look's sky, prefiltered (once per renderer and look). */
export function stormEnvironment(renderer, name = stormState.look) {
  const cached = stormState.environments.get(name);
  if (cached?.renderer === renderer) return cached.texture;
  const texture = new THREE.CanvasTexture(stageSkyCanvas(stageLookOf(name).sky, 512, 256));
  texture.mapping = THREE.EquirectangularReflectionMapping;
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromEquirectangular(texture);
  generator.dispose();
  texture.dispose();
  stormState.environments.set(name, { renderer, texture: target.texture });
  return target.texture;
}

// ---- lightning -----------------------------------------------------------------------------------

/**
 * A bolt: a thin, jagged line from the cloud to the sea in front of the player, with a few thin branches. Two meshes of flat ribbons that
 * face along the line of sight: a white core a couple of pixels wide and a faint wide glow round it (widths scale with the distance, so the
 * line is as fine near as far). Returns the group (`userData.at`: where it lands; `userData.bearing`: which way from the player).
 */
function stormBolt(random, from, coreMaterial, glowMaterial, facing) {
  // Over the water in front of him, within a third of a turn either side of where he looks.
  const bearing = facing + (random() - 0.5) * 2.2;
  const distance = 150 + random() * 120;
  const x = from[0] + Math.cos(bearing) * distance;
  const z = from[2] + Math.sin(bearing) * distance;
  // Across the line of sight: the ribbon's width runs along this.
  const side = [-Math.sin(bearing), Math.cos(bearing)];
  const top = 190;
  const bottom = -9;
  const segments = 30;
  const points = [];
  let sway = 0;
  for (let k = 0; k <= segments; k += 1) {
    const y = top + ((bottom - top) * k) / segments;
    // Short kinks all the way down, and now and then a hard jink.
    sway += (random() - 0.5) * (random() < 0.18 ? 26 : 9);
    points.push([sway, y]);
  }
  const strips = [{ points, width: 1 }];
  const branches = 3 + Math.floor(random() * 2);
  for (let b = 0; b < branches; b += 1) {
    const start = 4 + Math.floor(random() * 18);
    const branch = [points[start]];
    let s = points[start][0];
    const direction = random() < 0.5 ? -1 : 1;
    const length = 4 + Math.floor(random() * 5);
    for (let k = 1; k < length; k += 1) {
      s += direction * (2 + random() * 8) + (random() - 0.5) * 5;
      branch.push([s, points[start][1] - k * (5 + random() * 6)]);
    }
    strips.push({ points: branch, width: 0.5 });
  }
  const build = (half, material, order) => {
    const position = [];
    for (const strip of strips) {
      const w = half * strip.width;
      for (let k = 0; k + 1 < strip.points.length; k += 1) {
        const [s0, y0] = strip.points[k];
        const [s1, y1] = strip.points[k + 1];
        const p = (s, y, dw) => [x + side[0] * (s + dw), y, z + side[1] * (s + dw)];
        const a = p(s0, y0, -w);
        const b = p(s0, y0, w);
        const c = p(s1, y1, w);
        const d = p(s1, y1, -w);
        position.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    return mesh;
  };
  // (About 1.4 pixels at 643 lines high for the core, 6 for the glow.)
  const group = new THREE.Group();
  group.add(build(distance * 0.0065, glowMaterial, 12), build(distance * 0.0014, coreMaterial, 13));
  group.userData.at = [x, z];
  group.userData.bearing = bearing;
  return group;
}

/** Free a bolt's geometry. */
function stormDisposeBolt(bolt) {
  for (const mesh of bolt.children) mesh.geometry.dispose();
}

/** The flash's brightness at `age` s into a strike: a crack, a dip, a second crack, a fast fade. */
function stormFlash(age) {
  if (age < 0 || age > STORM.flashSeconds) return 0;
  if (age < 0.05) return 1;
  if (age < 0.09) return 0.3;
  if (age < 0.15) return 0.85;
  return 0.55 * (1 - (age - 0.15) / (STORM.flashSeconds - 0.15)) ** 1.6;
}

/** The bolt's own brightness at `age`: on for the two cracks, dim between, gone by `boltSeconds`. */
function stormBoltLight(age) {
  if (age < 0 || age > STORM.boltSeconds) return 0;
  if (age < 0.05) return 1;
  if (age < 0.09) return 0.35;
  if (age < 0.15) return 1;
  return 0.5 * (1 - (age - 0.15) / (STORM.boltSeconds - 0.15));
}

// ---- the shaft of light ----------------------------------------------------------------------------

/** The shaft: two crossed soft cards from high in the sky, down along the sun's rays onto the castle (it widens as it falls), and a pool of light on the sea toward the sun. */
function stormShaft() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(2 * 6 * 3), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
  const map = new THREE.CanvasTexture(stageShaftCanvas());
  const material = new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  // (A card the camera is near is faded out, or the beam would be a set of bars across the picture.)
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying float shaftDistance;\n${shader.vertexShader}`.replace('#include <project_vertex>', '#include <project_vertex>\n  shaftDistance = length(mvPosition.xyz);');
    shader.fragmentShader = `varying float shaftDistance;\n${shader.fragmentShader}`.replace('#include <tonemapping_fragment>', 'gl_FragColor.a *= smoothstep(25.0, 110.0, shaftDistance);\n#include <tonemapping_fragment>');
  };
  material.customProgramCacheKey = () => 'storm-shaft';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(stagePoolCanvas()), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.renderOrder = 2;
  pool.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh, pool);
  group.visible = false;
  group.userData = { mesh, pool };
  return group;
}

/** Aim the shaft along the look's sun: from the castle up toward it, wide at the foot. */
function stormAimShaft(group, look) {
  const shaft = look.shaft;
  group.visible = Boolean(shaft);
  if (!shaft) return;
  const { mesh, pool } = group.userData;
  const d = skyDirection(look.sun.az, look.sun.el);
  const to = STORM.target;
  const high = [to[0] + d[0] * 460, to[1] + d[1] * 460, to[2] + d[2] * 460];
  const low = [to[0] - d[0] * 25, to[1] - d[1] * 25, to[2] - d[2] * 25];
  const axis = [high[0] - low[0], high[1] - low[1], high[2] - low[2]];
  const length = Math.hypot(...axis);
  const a = axis.map((v) => v / length);
  // Two widths across: one sideways to the axis and level, one at right angles to it.
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  let w1 = cross(a, [0, 1, 0]);
  const l1 = Math.hypot(...w1) || 1;
  w1 = w1.map((v) => v / l1);
  const w2 = cross(a, w1);
  const position = [];
  for (const w of [w1, w2]) {
    const wide = shaft.width;
    const at = (end, k) => [end[0] + w[0] * wide * k, end[1] + w[1] * wide * k, end[2] + w[2] * wide * k];
    // (The cards' v runs 0 at the sky end to 1 at the foot: the map is bright at its top and gone at its foot, so the light fades as it lands.)
    const a0 = at(high, -0.35);
    const b0 = at(high, 0.35);
    const b1 = at(low, 0.9);
    const a1 = at(low, -0.9);
    position.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
  }
  mesh.geometry.attributes.position.array.set(position);
  mesh.geometry.attributes.position.needsUpdate = true;
  mesh.material.color.setRGB(shaft.colour[0] / 255, shaft.colour[1] / 255, shaft.colour[2] / 255);
  pool.material.color.setRGB(shaft.colour[0] / 255, shaft.colour[1] / 255, shaft.colour[2] / 255);
  // The pool of light on the sea out toward the sun, long across the line of sight.
  const reach = 240;
  pool.position.set(STORM.centre[0] + Math.cos((look.sun.az * Math.PI) / 180) * reach, -8.7, STORM.centre[2] + Math.sin((look.sun.az * Math.PI) / 180) * reach);
  pool.scale.set(shaft.width * 3.2, shaft.width * 1.6, 1);
  pool.rotation.z = -((look.sun.az * Math.PI) / 180) + Math.PI / 2;
}

// ---- the place ----------------------------------------------------------------------------------------

/** The scene's probe light (the realistic look's ambient), with what it was baked as kept, so a look can tint it and the next place can have it back. */
function stormProbe(scene) {
  const probe = scene.children.find((child) => child.isLightProbe) ?? null;
  if (probe && !probe.userData.kitBase) probe.userData.kitBase = { sh: probe.sh.coefficients.map((c) => c.clone()), intensity: probe.intensity };
  return probe;
}

/**
 * The storm's place group: sky, sea, rain, and the bolt. `buildRain` is render.js's (injected, as it is private to it).
 * `place.userData.tick(time)` moves it; `place.userData.bind(view)` gives it the scene's lights to flash.
 */
export function buildStormPlace({ buildRain }) {
  const place = new THREE.Group();
  place.name = 'storm';
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(STORM.skyRadius, 32, 16),
    new THREE.MeshBasicMaterial({ map: stormSkyTexture(stormState.look), side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.position.set(...STORM.centre);
  sky.renderOrder = -1;
  place.add(sky);
  // The sea: heaving normals scrolled over a dark glossy plane.
  const waves = stormWaveTexture();
  waves.repeat.set(70, 70);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(STORM.seaSize, STORM.seaSize),
    new THREE.MeshStandardMaterial({ color: 0x17202c, roughness: 0.42, metalness: 0.3, normalMap: waves, normalScale: new THREE.Vector2(0.55, 0.55), envMapIntensity: 1.1 }),
  );
  // (The mist lies on it: its fog thickens toward the water. The waves are read twice, at two scales, so that the pattern does not repeat in the glitter, and
  // flatten with distance, so that the far water is a smooth sheen and not a grid of sparkles.)
  ktPatch(sea.material);
  const seaPatch = sea.material.onBeforeCompile;
  sea.material.onBeforeCompile = (shader, renderer) => {
    seaPatch(shader, renderer);
    // Past the fog's far end the water is the fog's colour and nothing else: it is not shaded (the sea is the dearest pixel of the picture, and out toward the horizon most of it).
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'void main() {\n#ifdef USE_FOG\n  if (fogDepth > fogFar) {\n    gl_FragColor = vec4(fogColor, 1.0);\n    return;\n  }\n#endif');
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 mapN = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0;',
      `vec3 mapN = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0;
  vec3 mapN2 = texture2D( normalMap, vUv * 0.41 + vec2( 0.29, 0.63 ) ).xyz * 2.0 - 1.0;
  mapN.xy = ( mapN.xy + mapN2.xy * 0.9 ) * ( 1.0 - 0.85 * smoothstep( 50.0, 320.0, length( vViewPosition ) ) );`,
    );
  };
  const seaKey = sea.material.customProgramCacheKey;
  sea.material.customProgramCacheKey = () => `${seaKey()}-sea`;
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(STORM.centre[0], -9, STORM.centre[2]);
  sea.name = 'stage-sea';
  // Drawn after the castle and the land (which hide a good part of it): the sea is the most expensive pixel of the picture, and one the depth test can refuse is not shaded.
  sea.renderOrder = 1;
  place.add(sea);
  // Rain, which comes down round the player.
  const rain = buildRain(STORM.rain);
  place.add(rain);
  const shaft = stormShaft();
  place.add(shaft);
  // The bolt: a white-hot core and a faint blue glow, both added to what is behind them.
  const boltCore = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const boltGlow = new THREE.MeshBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  place.userData.storm = { sea, rain, waves, boltCore, boltGlow, shaft };

  /** The rain's streaks drawn: the look's share of them, times the quality tier's. */
  const applyRain = (look) => {
    stormState.rainDirty = false;
    const drops = Math.max(2, Math.round(STORM.rain.count * look.rain.share * stormState.rainShare)) * 2;
    for (const layer of rain.children) layer.geometry.setDrawRange(0, drops);
  };

  /** Put the scene in the look: sky, fog, the lights, the sea, the rain. Run when the look changes, and when the scene's fog is made anew (a look of the game, a place). */
  const applyLook = (view) => {
    const look = stageLookOf(stormState.look);
    const { scene, lights } = view;
    stormState.dirty = false;
    stormState.fog = scene.fog;
    sky.material.map = stormSkyTexture(stormState.look);
    const fogColour = new THREE.Color(look.fog.colour);
    if (scene.fog) {
      scene.fog.color.copy(fogColour);
      scene.fog.near = look.fog.near;
      scene.fog.far = look.fog.far;
    }
    scene.background = fogColour.clone();
    ktWeather.uKitFog.value.set(look.fog.mist.density, look.fog.mist.base, look.fog.mist.falloff, 0);
    ktWeather.uKitWet.value = look.wet;
    ktWeather.uKitPools.value = look.pools ?? 0;
    stormState.torch = look.torch;
    // The light: the one sun (direction, colour, strength), the sky's ambient (the probe the realistic look lights with, or the hemisphere), all times the exposure.
    const [sx, sy, sz] = skyDirection(look.sun.az, look.sun.el);
    lights.sun.color.setRGB(...look.sun.colour);
    lights.sun.intensity = look.sun.intensity * look.exposure;
    lights.sun.position.set(sx * 30, sy * 30, sz * 30);
    lights.sun.target.position.set(0, 0, 0);
    lights.sun.castShadow = false;
    lights.hemi.color.setHex(look.hemi.sky);
    lights.hemi.groundColor.setHex(look.hemi.ground);
    lights.hemi.intensity = look.hemi.intensity * look.exposure;
    const probe = stormProbe(scene);
    if (probe) {
      const base = probe.userData.kitBase;
      probe.sh.coefficients.forEach((c, k) => c.copy(base.sh[k]).multiply(new THREE.Vector3(...look.ambient.tint)));
      probe.intensity = base.intensity * look.ambient.gain * look.exposure;
    }
    stormState.base = null;
    // The sea.
    const material = sea.material;
    material.color.setHex(look.sea.colour);
    material.roughness = look.sea.roughness;
    material.metalness = look.sea.metalness;
    material.normalScale.set(look.sea.normal, look.sea.normal);
    material.envMap = stormEnvironment(view.renderer);
    material.envMapIntensity = look.sea.reflect;
    // The rain.
    rain.children[0].material.opacity = look.rain.opacity;
    applyRain(look);
    shaft.userData.base = look.shaft?.opacity ?? 0;
    stormAimShaft(shaft, look);
  };

  place.userData.bind = (view) => {
    stormState.view = view;
    stormState.place = place;
    stormState.base = null;
    stormReset();
    stormState.dirty = true;
    place.userData.storm.env = stormEnvironment(view.renderer);
    sea.material.envMap = place.userData.storm.env;
    sea.material.needsUpdate = true;
  };
  place.userData.tick = (time) => {
    stormState.time = time;
    const look = stageLookOf(stormState.look);
    waves.offset.set((time * 0.006 * look.sea.scroll) % 1, (time * 0.011 * look.sea.scroll) % 1);
    const [fx, fy, fz] = stormState.follow;
    // The rain falls round him, stops under a roof, and runs on the same clock as the weather.
    if (stormState.rainDirty) applyRain(look);
    rain.visible = !stormState.indoors && look.rain.opacity > 0;
    rain.userData.tick(time);
    rain.position.set(fx, fy - 4, fz);
    shaft.userData.mesh.material.opacity = shaft.userData.base * (0.8 + 0.2 * Math.sin(time * 0.6) + 0.06 * Math.sin(time * 2.3));
    shaft.userData.pool.material.opacity = shaft.userData.base * 1.6 * (0.8 + 0.2 * Math.sin(time * 0.8 + 1));
    // (A bolt that no strike owns, left when a run began over mid-strike, is taken down.)
    for (const child of [...place.children]) {
      if (child.userData.at && child !== stormState.strike?.bolt) {
        place.remove(child);
        stormDisposeBolt(child);
      }
    }
    const view = stormState.view;
    if (!view) return;
    const scene = view.scene;
    if (stormState.dirty || scene.fog !== stormState.fog) applyLook(view);
    // Strikes, from the stage's seed.
    if (!stormState.strike && time > stormState.nextStrike) {
      const heading = new THREE.Vector3();
      view.camera.getWorldDirection(heading);
      const bolt = stormBolt(stormState.random, stormState.follow, boltCore, boltGlow, Math.atan2(heading.z, heading.x));
      place.add(bolt);
      stormState.strike = { start: time, bolt };
      const gap = stageLookOf(stormState.look).lightning?.gap ?? [9, 22];
      stormState.nextStrike = stormState.still || !stageLookOf(stormState.look).lightning ? Infinity : time + gap[0] + stormState.random() * (gap[1] - gap[0]);
    }
    const strike = stormState.strike;
    let flash = 0;
    if (strike) {
      if (stormState.hold) strike.start = time - 0.02;
      const age = time - strike.start;
      flash = stormFlash(age);
      const lit = stormBoltLight(age);
      boltCore.opacity = lit;
      boltGlow.opacity = lit * 0.2;
      strike.bolt.visible = lit > 0;
      if (age > STORM.flashSeconds) {
        place.remove(strike.bolt);
        stormDisposeBolt(strike.bolt);
        stormState.strike = null;
        flash = 0;
      }
    }
    // The flash on the whole scene, for the few tenths of a second it lasts (nothing here runs when there is no strike): the ground, the castle and the men are lit
    // by a hard cold light from the bolt's side (the sun is turned to it), the sky light and the probe rise, and the sky, the fog and the background lift toward a cold white
    // (as much as the look's strikes are hard).
    if (flash > 0 || stormState.flashed) {
      FLASH_WHITE ??= new THREE.Color(0xb9c4e4);
      const lights = view.lights;
      if (!stormState.base) {
        stormState.probe = stormProbe(scene);
        stormState.base = { hemi: lights.hemi.intensity, sun: lights.sun.intensity, key: lights.key.intensity, probe: stormState.probe?.intensity ?? 0, fog: scene.fog?.color.clone(), background: scene.background, sunColour: lights.sun.color.clone(), sunAt: lights.sun.position.clone() };
      }
      const base = stormState.base;
      const dim = (stormState.indoors ? 0.3 : 1) * (look.lightning?.strength ?? 1);
      lights.hemi.intensity = base.hemi + flash * 2.5 * dim;
      lights.sun.intensity = base.sun + flash * 2.8 * dim;
      lights.key.intensity = base.key + flash * 1.4 * dim;
      if (stormState.probe) stormState.probe.intensity = base.probe + flash * 2.2 * dim;
      if (flash > 0) {
        const bearing = strike?.bolt.userData.bearing ?? 0;
        lights.sun.position.set(Math.cos(bearing) * 25, 16, Math.sin(bearing) * 25);
        lights.sun.color.setHex(0xdfe8ff);
      } else {
        lights.sun.position.copy(base.sunAt);
        lights.sun.color.copy(base.sunColour);
      }
      sky.material.color.setScalar(1 + flash * 1.6 * dim);
      const lift = Math.min(1, flash * 0.55 * dim);
      if (scene.fog && base.fog) scene.fog.color.copy(base.fog).lerp(FLASH_WHITE, lift);
      if (base.background?.isColor) scene.background = flash > 0 ? base.background.clone().lerp(FLASH_WHITE, lift) : base.background;
      stormState.flashed = flash > 0;
      if (!stormState.flashed) stormState.base = null;
    }
  };
  return place;
}

/** Leaving the storm: the lights it tinted go back to what the next place sets (the intensities are set by the place; the colours here). */
export function stormRelease(view) {
  const { hemi, sun } = view.lights;
  const saved = view.defaults?.lights;
  if (saved) {
    hemi.color.copy(saved.hemi.color);
    hemi.groundColor.copy(saved.hemi.groundColor);
    sun.color.copy(saved.sun.color);
    sun.castShadow = saved.sun.castShadow;
  }
  // The probe, as it was baked.
  const probe = view.scene.children.find((child) => child.isLightProbe);
  const base = probe?.userData.kitBase;
  if (base) {
    probe.sh.coefficients.forEach((c, k) => c.copy(base.sh[k]));
    probe.intensity = base.intensity;
  }
  stormState.view = null;
  stormState.base = null;
  stormState.dirty = true;
}

/** Bring the next strike to now (for the weather's test, and a look at one). */
export function stormStrikeNow(hold = false) {
  // (`null` lets go of a held strike without making another.)
  if (hold !== null) stormState.nextStrike = 0;
  stormState.hold = Boolean(hold);
}

/** What the weather is doing, for the tests and the console: the look, whether it is held still, when the next strike is and whether one is on. */
export const stormInfo = () => ({ look: stormState.look, still: stormState.still, nextStrike: stormState.nextStrike, striking: Boolean(stormState.strike), time: stormState.time });
