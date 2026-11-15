// The town kit's assembly: what the makers (townkit/geo.js) laid, cut into blocks of ground and made into meshes
// whose fine detail is drawn only near the camera; the sky over a place too wide for the arena's own dome; the rain;
// and the place's keeping each frame (the sun following the camera so the fighters' shadows fall wherever they go,
// the buildings' own shadow baked once, the mirror the puddles show taken once).

import { ktShadow, ktShadowBake, ktShadowInfo, ktShadowInit } from '../levelmode/kitshadow.js';
import { placeWind } from '../wind.js';
import { tkgBuilder } from './geo.js';
import { TK_LAY, tkLayBake, tkLayTextures } from './lay.js';
import { tkMaterials, tkSetAir, tkSetLay, tkSetWeather, tkWeather } from './weather.js';

/** Tuning for the assembly. */
export const TK_PLACE = {
  // The side of a block of ground (m): pieces are gathered by block so that three culls what is behind the camera, and
  // the fine detail of a block (tile rolls, rafters, lattice frames) is drawn only within `near` m of the camera's
  // focus. 24 m is about four house fronts; 46 m is where a tile roll is under a pixel at the usual view.
  block: 24, near: 46,
  // The low tier (a phone, a slow integrated GPU): no fine detail at any distance, sheets at half size, no cube mirror.
  low: { near: 0, size: 256, mirror: false, rain: 0.5 },
  // The sun's own shadow camera while a kit place is shown: its half width round the camera's focus (m) and how far off
  // it stands. The arena's is 9 m round the origin; here the fighters may be anywhere.
  // `openShadow`: how much of the sun the baked shadow takes in the open air, all of it: there the sky's light is the
  // lit probe and the lie map's share, not a flat fill the shadow has to leave room for (a place's own `shadow`
  // share is for the flat light of the open air off).
  sun: { half: 16, distance: 60, openShadow: 1 },
  // The baked sun map handed to the open air (its `sunMap`: env/air.js envPlaceSun), so that its own walk of each
  // sight line finds the shade of walls, roofs and the gate's vault standing in the haze. `bias` m: how far past
  // the map's depth a point of air must be to count as behind what cast it; a quarter metre, as the kit's own
  // sheets in the air once read it (the kit's own, retired): air has no surface to speckle, so only the map's texel
  // (about 0.1 to 0.2 m over a place) matters.
  airMap: { bias: 0.25 },
  // The cube mirror's side (px) and the rain's streaks: how many, the box they fall in round the camera (m), their length and speed.
  mirror: 128, rain: { count: 2600, box: [34, 16, 34], length: 0.55, speed: 13 },
};

/**
 * The open air's doors (env/index.js), put here by townkit/air.js where the page has the open air: `place(key,
 * description)` describes a place to it, `weather(view, key, name)` puts one of its weathers on the place, and
 * `newWeather(name, over, values)` makes a weather of the place's own. All null where there is no open air (the
 * tests' node, the custom page): a kit place is then drawn by the kit alone, as it is with the open air switched off.
 */
export const TK_AIR = { place: null, weather: null, newWeather: null };

// The quality tier now ('high' | 'low'): the page's own measure of the machine (adaptres.js, told through tkSetTier) once it
// has one; until then a guess from the pointer (a touch screen is taken for a phone).
let tkTierNow = null;

/** The tier a kit place is built and kept at. */
export const tkTier = () => tkTierNow ?? (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'low' : 'high');

/** Tell the kit the tier (main.js, from the frame-rate controller): on 'low' no fine detail is shown from then on. */
export function tkSetTier(tier) {
  tkTierNow = tier === 'low' ? 'low' : 'high';
}

/** Builders by block of ground: `at(x, z)` is the builder for whatever stands at world (x, z). */
export function tkBlocks(cell = TK_PLACE.block) {
  const blocks = new Map();
  return {
    cell,
    /** `plain`: for a thing no walker comes near: its fine detail is never made. */
    at(x, z, plain = false) {
      const key = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
      if (!blocks.has(key)) blocks.set(key, tkgBuilder());
      const builder = blocks.get(key);
      return plain ? { ...builder, at: (level, work) => (level === 'near' ? undefined : builder.at(level, work)) } : builder;
    },
    /** One builder for things too large to belong to a block (the ground, far hills): never level-of-detail switched. */
    wide: tkgBuilder(),
    all: () => [...blocks.values()],
  };
}

function tkGeometry(batch) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(batch.position), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(batch.normal), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(batch.uv), 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(batch.colour), 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The meshes of a place: `blocks` (tkBlocks) made into a group. `tier` 'low' leaves the fine detail out. Returns the
 * group; `group.userData.detail(focus)` shows each block's fine detail or its stand-in by its distance from `focus`
 * (a THREE.Vector3), and `group.userData.casters` are the meshes that throw the baked shadow.
 */
export function tkMeshes(blocks, materials, { tier = 'high' } = {}) {
  const group = new THREE.Group();
  const switched = [];
  const casters = [];
  const near = tier === 'low' ? 0 : TK_PLACE.near;
  const add = (builder, wide) => {
    for (const batch of builder.batches()) {
      if (!batch.position.length || (batch.level === 'near' && !near)) continue;
      const mesh = new THREE.Mesh(tkGeometry(batch), materials.get(batch.material));
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.name = `townkit:${batch.material}:${batch.level}`;
      group.add(mesh);
      if (batch.level === 'all' && !wide && batch.material !== 'water') casters.push(mesh);
      if (batch.level !== 'all') {
        mesh.visible = batch.level === 'far';
        switched.push({ mesh, level: batch.level, centre: mesh.geometry.boundingSphere.center, radius: mesh.geometry.boundingSphere.radius });
      }
    }
  };
  for (const builder of blocks.all()) add(builder, false);
  add(blocks.wide, true);
  group.userData.casters = casters;
  group.userData.detail = (focus) => {
    const fine = near > 0 && tkTier() !== 'low';
    for (const entry of switched) {
      const close = fine && entry.centre.distanceTo(focus) - entry.radius < near;
      entry.mesh.visible = entry.level === 'near' ? close : !close;
    }
  };
  group.userData.triangles = () => {
    let count = 0;
    for (const mesh of group.children) if (mesh.visible && mesh.geometry) count += mesh.geometry.attributes.position.count / 3;
    return count;
  };
  return group;
}

/** The unit vector toward a sun at `azimuth` (rad: 0 toward +x, a quarter turn toward +z) and `elevation` (degrees over the horizon): the open air's own measure (env/air.js envSunWay). */
export const tkSunWay = (azimuth, elevation) => {
  const lift = (elevation * Math.PI) / 180;
  return [Math.cos(azimuth) * Math.cos(lift), Math.sin(lift), Math.sin(azimuth) * Math.cos(lift)];
};

/**
 * The lie of a place (lay.js), baked from everything `blocks` holds, at the tier's texel: `options` as tkLayBake's
 * (box, ground, ways, wind, seed). Returns { lay, textures } for tkKeep.
 */
export function tkLayOf(blocks, tier, options) {
  const batches = [...blocks.all(), blocks.wide].flatMap((builder) => builder.batches());
  const lay = tkLayBake({ batches, texel: tier === 'low' ? TK_LAY.texel.low : TK_LAY.texel.high, ...options });
  return { lay, textures: tkLayTextures(lay) };
}

/**
 * The sky: a dome that goes with the camera, painted in the shader from the horizon's colour to the zenith's with cloud
 * drifting across it (`cloud` 0..1: how much of it is covered; 1 is an overcast with no blue). Out of the fog; behind all.
 */
export function tkSky({ horizon, zenith, cloud = 0.6, cloudColour = 0xf2f2ee, radius = 900, sun = [0.4, 0.6, 0.3], glow = 0.25 }) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uHorizon: { value: new THREE.Color(horizon) }, uZenith: { value: new THREE.Color(zenith) }, uCloud: { value: new THREE.Color(cloudColour) },
      uCover: { value: cloud }, uTime: tkWeather.uTkTime, uSun: { value: new THREE.Vector3(...sun).normalize() }, uGlow: { value: glow },
    },
    vertexShader: 'varying vec3 vDir;\nvoid main() {\n  vDir = position;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}',
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uCloud; uniform float uCover; uniform float uTime; uniform vec3 uSun; uniform float uGlow;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i += 1) { v += a * n(p); p = p * 2.03 + 11.0; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir);
        float up = clamp(d.y, 0.0, 1.0);
        vec3 sky = mix(uHorizon, uZenith, pow(up, 0.55));
        // The cloud deck: a flat layer seen in perspective, thinning to haze at the horizon.
        vec2 p = d.xz / (d.y + 0.18) * 1.6 + vec2(uTime * 0.004, uTime * 0.002);
        float c = smoothstep(1.0 - uCover * 1.05, 1.35 - uCover * 0.75, fbm(p) + 0.25 * fbm(p * 3.1 + 5.0));
        float shade = 0.72 + 0.28 * fbm(p * 1.7 + 3.0);
        sky = mix(sky, uCloud * shade, c * smoothstep(0.0, 0.22, up));
        sky += uGlow * pow(max(dot(d, uSun), 0.0), 6.0) * vec3(1.0, 0.95, 0.85);
        gl_FragColor = vec4(mix(uHorizon, sky, smoothstep(-0.02, 0.1, d.y)), 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  dome.name = 'townkit:sky';
  return dome;
}

/** Rain: streaks falling in a box that goes with the camera, wrapped in the shader (one draw, no work per frame); shown by uTkRain. */
export function tkRain({ count = TK_PLACE.rain.count, slant = [0.12, 0.05] } = {}) {
  const { box, length, speed } = TK_PLACE.rain;
  const position = new Float32Array(count * 6);
  const end = new Float32Array(count * 2);
  let seed = 9;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < count; k += 1) {
    const at = [random() * box[0], random() * box[1], random() * box[2]];
    position.set([...at, ...at], k * 6);
    end[k * 2 + 1] = 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('end', new THREE.BufferAttribute(end, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: tkWeather.uTkTime, uRain: tkWeather.uTkRain, uBox: { value: new THREE.Vector3(...box) }, uEye: { value: new THREE.Vector3() }, uSlant: { value: new THREE.Vector2(...slant) } },
    vertexShader: `
      attribute float end; uniform float uTime; uniform vec3 uBox; uniform vec3 uEye; uniform vec2 uSlant; varying float vFade;
      void main() {
        vec3 p = position;
        p.y -= uTime * ${speed.toFixed(1)} * (0.85 + 0.3 * fract(position.x * 7.3));
        p.xz += uSlant * p.y;
        // Wrapped into the box round the eye.
        p = mod(p - uEye + uBox * 0.5, uBox) - uBox * 0.5 + uEye;
        p.y += end * ${length.toFixed(2)};
        p.xz += uSlant * end * ${length.toFixed(2)};
        vFade = 1.0 - smoothstep(uBox.x * 0.3, uBox.x * 0.5, length(p.xz - uEye.xz));
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: 'uniform float uRain; varying float vFade;\nvoid main() {\n  gl_FragColor = vec4(0.82, 0.86, 0.9, 0.34 * uRain * vFade);\n}',
    transparent: true, depthWrite: false, fog: false,
  });
  const rain = new THREE.LineSegments(geometry, material);
  rain.frustumCulled = false;
  rain.name = 'townkit:rain';
  rain.userData.eye = material.uniforms.uEye.value;
  return rain;
}

/**
 * A kit place's keeping. `root`: the place's group; `meshes`: tkMeshes's group in it; `sun`: the unit vector toward the sun;
 * `shadow`: how much of the sun the baked shadow takes (0..1); `weather`: () => the weather wanted now (tkSetWeather's
 * argument, and `fog` [near, far] for the haze), asked each frame, so whatever drives it (the story's view, a hook, a weather system) is followed;
 * `lay`: the place's lie (tkLayOf) and `north` the way north lies on its ground [x, z]; `stir`: (time, wind) => void,
 * the place's own moving things (townkit/stir.js), called each frame with the one wind; `air`: how the place joins
 * the open air: { description: what env/config.js lets a place that draws itself say (sun, air, clouds, far, height,
 * openings), weathers: { the kit's weather name: the open air's }, first: the kit's name when nothing says, own:
 * { name: [the open air's weather it is laid over, what differs] } }.
 *
 * In the open air (env/: the place is joined to it by townkit/air.js, and `view.env` says so) the sky, what falls
 * and the haze are the open air's: the kit's own dome, streaks and mist stand aside, the weather's wet, rain and
 * snow are read from the open air's state (`pools`: how much water stands on a soaked ground), the baked shadow is
 * thrown the way its sun stands, and the mirror is taken with its sky in it, in light's own measure.
 * Sets `root.userData.bind`, `.tick` and `.leave` (render.js calls them).
 */
export function tkKeep(root, meshes, { sun, shadow = 0.8, sky = null, rain = null, weather = () => null, mirrorAt = [0, 1.6, 0], key = 'townkit', tier = 'high', lay = null, north = [0, -1], pools = 0.8, stir = null, air = null }) {
  const state = { view: null, saved: null, mirror: null, mirrored: null, checked: 0, baked: null, aired: null };
  const dir = new THREE.Vector3(...sun).normalize();
  if (air && TK_AIR.place) {
    // The place described to the open air: itself drawn (`own`), the sun's shadow box carried with the camera as the
    // kit carries its own, and what stands over the ground read from the lie's sheet (lay.js: B's red is the top's
    // height), so that nothing falls through a roof and blown snow starts from the roofs' and the wall's tops.
    for (const [name, [over, values]] of Object.entries(air.own ?? {})) TK_AIR.newWeather(name, over, values);
    state.aired = air.weathers[air.first];
    TK_AIR.place(key, {
      own: true,
      shadowBox: { half: TK_PLACE.sun.half, depth: TK_PLACE.sun.distance },
      // (The map is baked on the first frame and its matrix filled in place; its depth runs over the bake's range in metres.)
      sunMap: { get matrix() { ktShadowInit(); return ktShadow.uKitShadowMat.value; }, texture: () => ktShadow.uKitShadowMap.value, get bias() { return TK_PLACE.airMap.bias / (ktShadowInfo()?.range ?? 1e6); } },
      ...air.description,
      weather: state.aired,
      ...(lay ? { cover: { texture: lay.textures.b, min: lay.lay.min, size: lay.lay.size, scale: lay.lay.range, base: lay.lay.base, channel: 0 } } : null),
    });
  }
  // (The sky dome is a painted one to the looks: the open air hides it while it draws its own, and the look shows it again after.)
  if (sky) sky.userData.paintedSky = true;
  const focus = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  root.userData.bind = (view) => {
    state.view = view;
  };
  const takeSun = (view) => {
    const light = view.lights.sun;
    const camera = light.shadow.camera;
    if (!state.saved) {
      state.saved = { position: light.position.clone(), target: light.target.position.clone(), box: [camera.left, camera.right, camera.top, camera.bottom, camera.near, camera.far] };
      const { half, distance } = TK_PLACE.sun;
      Object.assign(camera, { left: -half, right: half, top: half, bottom: -half, near: distance - 30, far: distance + 30 });
      camera.updateProjectionMatrix();
    }
    // The box goes with the camera's focus a whole texel of the shadow's map at a time, along the light's own
    // right and up, so a shadow's edge does not crawl as the camera moves.
    const level = Math.hypot(dir.x, dir.z) || 1;
    const right = [dir.z / level, 0, -dir.x / level];
    const up = [dir.y * right[2], dir.z * right[0] - dir.x * right[2], -dir.y * right[0]];
    const texel = (2 * TK_PLACE.sun.half) / light.shadow.mapSize.x;
    const along = focus.x * right[0] + focus.z * right[2];
    const over = focus.x * up[0] + focus.y * up[1] + focus.z * up[2];
    const [da, db] = [Math.round(along / texel) * texel - along, Math.round(over / texel) * texel - over];
    light.target.position.set(focus.x + right[0] * da + up[0] * db, focus.y + up[1] * db, focus.z + right[2] * da + up[2] * db);
    light.position.copy(light.target.position).addScaledVector(dir, TK_PLACE.sun.distance);
    light.target.updateMatrixWorld();
  };
  const takeMirror = (view, open) => {
    state.mirrored = open ? `air:${view.env.weather.name}` : 'own';
    tkWeather.uTkEnvOn.value = 0;
    if (tier === 'low') return;
    // In the open air the mirror holds light itself (the sky's bright parts well over 1), so it needs a target that can.
    const float = open && view.renderer.capabilities.isWebGL2 && !!view.renderer.extensions.get('EXT_color_buffer_float');
    if (open && !float) return;
    // The place alone (and its lights, and the open air's sky), seen all round from a man's height where the fight is: what the puddles show.
    if (state.mirror && state.mirror.userData.float !== float) {
      state.mirror.dispose();
      state.mirror = null;
    }
    if (!state.mirror) {
      state.mirror = new THREE.WebGLCubeRenderTarget(TK_PLACE.mirror, float
        ? { format: THREE.RGBAFormat, type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }
        : { format: THREE.RGBFormat, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
      state.mirror.userData = { float };
    }
    const camera = new THREE.CubeCamera(0.3, 600, state.mirror);
    camera.position.set(...mirrorAt);
    const hidden = [];
    for (const child of view.scene.children) {
      if (child !== root && !child.isLight && child.visible) {
        hidden.push(child);
        child.visible = false;
      }
    }
    // (What falls and drifts, and the shafts, are not in a puddle's picture: they are drawn for the eye's own place.)
    root.traverse((object) => {
      if (object.visible && (object === rain || object.userData.tkAir || ['particles', 'beams'].includes(object.userData.env))) {
        hidden.push(object);
        object.visible = false;
      }
    });
    const exposure = view.renderer.toneMappingExposure;
    // (The open air's camera curve passes light through untouched at an exposure under 0: env/air.js envInstallTone.)
    if (open) view.renderer.toneMappingExposure = -1;
    camera.update(view.renderer, view.scene);
    view.renderer.toneMappingExposure = exposure;
    for (const object of hidden) object.visible = true;
    tkWeather.uTkEnv.value = state.mirror.texture;
    tkWeather.uTkEnvOn.value = 1;
  };
  root.userData.tick = (time) => {
    const view = state.view;
    if (!view) return;
    const wanted = weather(view);
    // The day's weather by the kit's name (the story's draw, a hook) is put on the place in the open air's terms.
    const named = air?.weathers[wanted?.name ?? air.first];
    if (named && TK_AIR.weather && state.aired !== named) {
      state.aired = named;
      // (After this frame: the change dresses the whole place again, and this clock is also read from inside that
      // dressing, by the scenery's sorting of what moves.)
      Promise.resolve().then(() => TK_AIR.weather(view, key, named));
    }
    const open = !!view.env?.on && view.env.place === key;
    // One clock: in the open air its own (the fight's, which stands still when the fight does: the gusts its
    // noise sends and the things the kit moves in them keep step); alone, the page's.
    tkWeather.uTkTime.value = (open ? view.env.time ?? time : time) % 3600;
    if (lay) tkSetLay(lay.lay, lay.textures, north);
    const wind = open ? view.env.wind : placeWind(key);
    tkSetAir(open, [wind.x, wind.z, wind.speed]);
    if (open) {
      // One weather: the open air's. Its ground's wetness now, what is falling now, the snow it leaves lying.
      const air = view.env.weather;
      const wet = view.env.wet ?? air.wet ?? 0;
      tkSetWeather({ wet, pool: pools * wet * wet, snow: air.snow ?? 0, rain: air.fall?.kind === 'rain' ? view.env.falling ?? 1 : 0, mist: [0, 0, 0.5] });
      // (The camera's exposure, for what is held under the glare: weather.js TK_WEATHER.glare.)
      tkWeather.uTkAir.value.w = view.env.tone?.exposure ?? 1;
      const way = view.env.air.sun;
      if (Math.abs(way[0] - dir.x) + Math.abs(way[1] - dir.y) + Math.abs(way[2] - dir.z) > 1e-3) dir.set(way[0], way[1], way[2]);
    } else {
      tkWeather.uTkAir.value.w = 1;
      if (wanted) tkSetWeather(wanted);
      // (The haze's reach is the weather's too: `fog` [near, far] on the scene's own fog.)
      if (wanted?.fog && view.scene.fog?.isFog) {
        view.scene.fog.near = wanted.fog[0];
        view.scene.fog.far = wanted.fog[1];
      }
    }
    const camera = view.camera;
    // The camera's focus: the point on the ground it looks at, no further than the fine detail reaches.
    camera.getWorldDirection(ahead);
    const reach = Math.min(30, ahead.y < -0.05 ? camera.position.y / -ahead.y : 30);
    focus.copy(camera.position).addScaledVector(ahead, reach);
    meshes.userData.detail(focus);
    if (sky) sky.position.copy(camera.position);
    if (rain) {
      rain.visible = !open && tkWeather.uTkRain.value > 0.01;
      rain.userData.eye.copy(camera.position);
    }
    // (In the open air the sun's box is carried by it: the description's `shadowBox`.)
    if (!open) takeSun(view);
    stir?.(time, wind, view, open);
    // The baked shadow is one map shared with the castle stage: taken again if another place's bake replaced it
    // (looked for every 64 frames) or the sun has moved (the bake knows the sun it was thrown from).
    const taken = open ? TK_PLACE.sun.openShadow : shadow;
    if (ktShadow.uKitShadowInfo.value?.x !== taken || state.checked !== view.renderer.info.render.frame >> 6 || state.baked !== dir.x + dir.z) {
      state.checked = view.renderer.info.render.frame >> 6;
      state.baked = dir.x + dir.z;
      ktShadowBake(view.renderer, root, meshes.userData.casters, [dir.x, dir.y, dir.z], taken, key);
    }
    if (state.mirrored !== (open ? `air:${view.env.weather.name}` : 'own')) takeMirror(view, open);
    else if (state.mirror && tkWeather.uTkEnv.value !== state.mirror.texture && (open ? state.mirror.userData.float : true) && tier !== 'low') {
      tkWeather.uTkEnv.value = state.mirror.texture;
      tkWeather.uTkEnvOn.value = 1;
    }
  };
  root.userData.leave = (view) => {
    tkSetLay(null);
    tkSetAir(false);
    if (!state.saved) return;
    // (The open air, joined after the kit had put its own box on, noted that box as the one to hand back: it is
    // given the look's.)
    if (view.env?.on && view.env.place === key) view.env.box = [state.saved.box[0], state.saved.box[1], state.saved.box[2], state.saved.box[3], state.saved.box[4], state.saved.box[5]];
    const light = view.lights.sun;
    light.position.copy(state.saved.position);
    light.target.position.copy(state.saved.target);
    light.target.updateMatrixWorld();
    const [left, right, top, bottom, near, far] = state.saved.box;
    Object.assign(light.shadow.camera, { left, right, top, bottom, near, far });
    light.shadow.camera.updateProjectionMatrix();
    state.saved = null;
    tkWeather.uTkEnvOn.value = 0;
  };
  // (scenerylod.js merges a place's still meshes and chunks its instances: this place is already in blocks. Call tkKeep last.)
  for (const child of root.children) child.userData.lodChunks = true;
  return state;
}

/** The kit's materials at a quality tier ('low' halves the sheets). */
export const tkMaterialsFor = (tier, options = {}) => tkMaterials({ size: tier === 'low' ? TK_PLACE.low.size : 512, ...options });
