// The looks harness: stage the same still-life under every look, save it as a
// PNG and measure what drawing it costs, so the looks can be compared fairly.
// Browser only. The recipe (server, URL, calls) is at the top of looks.js.
//
// Why a harness and not just a screenshot of the running game:
// - the fights must be the same for every look: scenes are seeded and run for
//   a stated number of exact steps (not by the clock, which would give each
//   look a different moment), then frozen;
// - the textures of the places are painted with Math.random, so each stage()
//   seeds it (and `?shoot` in the URL seeds it from the first line of the
//   page, for what is built at load); __looks.unseed() gives the page its own back;
// - the camera is fixed per scene (the 'sheet' mode of the page holds its own
//   framing and hides the HUD).

/* global THREE */
import { activeLook, LOOKS } from './looks.js';
import { defineLook, loadScripts, sweepMaterials } from './looks/kit.js';
import { activeGround, activeScenery, applyScenery, GROUND_STYLES, SCENERY_VARIANTS, setGround, setScenery } from './scenery.js';

/** A small seeded generator (mulberry32): the same sequence from the same seed. */
function seededGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const NATIVE_RANDOM = Math.random;
// With ?shoot in the URL Math.random is seeded from the first line of the page, so even what is
// built at load (the ring) is the same for every look; stage() seeds it again either way.
if (typeof location !== 'undefined' && /[?&]shoot\b/.test(location.search)) Math.random = seededGenerator(20240601);

/**
 * The comparison scenes. Every one is a fixed seed, fixed fighters, `frames`
 * exact steps of 1/60 s from the start of the bout, then frozen; the camera
 * looks at `focus` (a `fighter` index, the `centre` of all, or a point `at` [x, z], at `height` m)
 * from `yaw`, `pitch` (rad) and `distance` (m) with `fov` (degrees).
 */
export const COMPARE_SCENES = {
  colosseum: {
    about: 'Two gladiators in armour in the Colosseum, close in: metal, the open sky, the sun and its shadows.',
    place: 'colosseum',
    seed: 11,
    frames: 90,
    red: [{ preset: 'secutor' }],
    blue: [{ preset: 'murmillo' }],
    distance: 2.3,
    // From the side, the sun (from +x, +z) across the fighters; walled in as it is, the sky is a sliver above the stands.
    camera: { focus: { fighter: 0, height: 1.75 }, yaw: 1.3, pitch: 0.03, distance: 3.2, fov: 50 },
  },
  'field-cavalry': {
    about: 'Knights in plate barding against steppe horsemen, mid-charge on the open field: horizon, sky across the top third.',
    place: 'field',
    seed: 5,
    frames: 100,
    red: [{ preset: 'knight', mounted: true }, { preset: 'warhammer', mounted: true }, { preset: 'templar', mounted: true }],
    blue: [{ preset: 'steppeBow', mounted: true }, { preset: 'saber', mounted: true }, { preset: 'maceShield', mounted: true }],
    camera: { focus: { at: [0, 0], height: 1.7 }, yaw: 1.2, pitch: 0.06, distance: 14.5, fov: 42 },
  },
  'sky-hero': {
    about: 'One knight in plate barding on the open field, shot low against the sky: metal, sun, sky and horizon haze.',
    place: 'field',
    seed: 5,
    frames: 100,
    red: [{ preset: 'knight', mounted: true }],
    blue: [{ preset: 'steppeBow', mounted: true }],
    camera: { focus: { fighter: 0, height: 1.9 }, yaw: 1.0, pitch: -0.02, distance: 4.6, fov: 42 },
  },
  'ring-portrait': {
    about: 'Two boxers in the indoor ring, a tight shot of one face and torso: skin.',
    place: 'ring',
    seed: 3,
    frames: 60,
    red: [{ preset: 'contender' }],
    blue: [{ preset: 'heavy' }],
    distance: 2.0,
    camera: { focus: { fighter: 0, height: 1.5 }, yaw: 1.05, pitch: 0.04, distance: 1.9, fov: 32 },
  },
  'ring-wide': {
    about: 'Two boxers in the indoor ring, the whole canvas in shot: how well the stage is lit.',
    place: 'ring',
    seed: 3,
    frames: 60,
    red: [{ preset: 'contender' }],
    blue: [{ preset: 'heavy' }],
    camera: { focus: { centre: true, height: 1.0 }, yaw: 0.8, pitch: 0.28, distance: 7.5, fov: 42 },
  },
  'stadium-wide': {
    about: 'Two boxers in the stadium ring under the truss, stands behind: how well the stage is lit.',
    place: 'stadium',
    seed: 3,
    frames: 60,
    red: [{ preset: 'contender' }],
    blue: [{ preset: 'heavy' }],
    camera: { focus: { centre: true, height: 1.0 }, yaw: 0.8, pitch: 0.28, distance: 8.5, fov: 42 },
  },
  'meadow-vista': {
    about: 'Two fighters in the meadow, a low camera looking out at the hills, mountains and trees beyond: the scenery.',
    place: 'meadow',
    seed: 4,
    frames: 40,
    red: [{ preset: 'contender' }],
    blue: [{ preset: 'heavy' }],
    camera: { focus: { centre: true, height: 1.6 }, yaw: 1.4, pitch: 0.05, distance: 9, fov: 50 },
  },
  'field-vista': {
    about: 'Two fighters in the field, a low camera looking out at the hills, mountains and trees beyond: the scenery.',
    place: 'field',
    seed: 4,
    frames: 40,
    red: [{ preset: 'contender' }],
    blue: [{ preset: 'heavy' }],
    camera: { focus: { centre: true, height: 1.6 }, yaw: 1.57, pitch: 0.05, distance: 9, fov: 50 },
  },
  'plain-vista': {
    about: 'Two fighters in the plain, a low camera looking out at the hills, mountains and trees beyond: the scenery.',
    place: 'plain',
    seed: 4,
    frames: 40,
    red: [{ preset: 'contender' }],
    blue: [{ preset: 'heavy' }],
    camera: { focus: { centre: true, height: 1.6 }, yaw: 1.6, pitch: 0.05, distance: 9, fov: 50 },
  },
  'sengoku-vista': {
    about: 'Two fighters in the sengoku, a low camera looking out at the hills, mountains and trees beyond: the scenery.',
    place: 'sengoku',
    seed: 4,
    frames: 40,
    red: [{ preset: 'contender' }],
    blue: [{ preset: 'heavy' }],
    camera: { focus: { centre: true, height: 1.6 }, yaw: 1.7, pitch: 0.05, distance: 9, fov: 50 },
  },
  // The subway level at the platform: the open track beside the fighters, the leaks and the light.
  'subway-platform': {
    about: 'The subway level: two fighters on the platform, the open track at the edge, the camera along the platform.',
    place: 'subway',
    level: 'subway',
    seed: 6,
    frames: 40,
    camera: { focus: { centre: true, height: 1.3 }, yaw: -0.25, pitch: 0.14, distance: 5.4, fov: 50 },
  },
  'subway-edge': {
    about: 'The subway level from over the track bed, looking back at the platform edge: the strip, the face, the drop.',
    place: 'subway',
    level: 'subway',
    seed: 6,
    frames: 40,
    camera: { focus: { centre: true, height: 0.6 }, yaw: 1.7, pitch: 0.25, distance: 5.5, fov: 50 },
  },
  // Pier 9 as its level frames it: the yard at night, the sodium lamps, the puddles (and the level's sea fog).
  'pier9-wide': {
    about: 'Pier 9 (the port level) as its camera frames it: the raid in the yard at night under the sodium lamps.',
    place: 'port',
    level: 'port',
    seed: 9,
    frames: 60,
    camera: { focus: { centre: true, height: 1.0 }, yaw: -0.6, pitch: 0.36, distance: 11, fov: 45 },
  },
  'meadow-pond': {
    about: 'The meadow pond close up from the bank: the water, its rim, its reflections.',
    place: 'meadow',
    seed: 6,
    frames: 20,
    red: [{ preset: 'contender' }],
    blue: [{ preset: 'heavy' }],
    camera: { focus: { at: [-1.5, -16.5], height: 0.2 }, yaw: 1.66, pitch: 0.4, distance: 7, fov: 50 },
  },
  'sengoku-army': {
    about: 'Sekigahara in daylight, sixty fighters in formation: a wide shot for load (many fighters, crowd batching).',
    place: 'sengoku',
    level: 'sekigahara',
    seed: 21,
    frames: 120,
    camera: { focus: { centre: true, height: 1.0 }, yaw: -0.5, pitch: 0.34, distance: 26, fov: 40 },
  },
  'fx-night': {
    about: 'A teppō man and a knight at the port at night, side on: the gun smoke and muzzle flash in the dark (fire one with boxer.fx.shot).',
    place: 'port',
    seed: 6,
    frames: 30,
    red: [{ preset: 'matchlock' }],
    blue: [{ preset: 'knight' }],
    distance: 3.2,
    camera: { focus: { centre: true, height: 1.4 }, yaw: 1.6, pitch: 0.06, distance: 4.5, fov: 50 },
  },
  'fx-day': {
    about: 'Two knights with long swords in the field in the sun, close in: steel blades, their glint, the sparks when they meet.',
    place: 'field',
    seed: 8,
    frames: 70,
    red: [{ preset: 'knight' }],
    blue: [{ preset: 'knight' }],
    distance: 2.2,
    camera: { focus: { centre: true, height: 1.4 }, yaw: 1.3, pitch: 0.05, distance: 3.2, fov: 45 },
  },
  // The misty levels (scenarios.js `weather`) as their own cameras frame them.
  'wokou-square': {
    about: 'The wokou raid in the water town, in the morning mist: the square, the canal and the bridge, as the level frames it.',
    place: 'jiangnan',
    level: 'wokou',
    seed: 15,
    frames: 90,
    camera: { focus: { centre: true, height: 1.0 }, yaw: -0.5, pitch: 0.42, distance: 15, fov: 40 },
  },
  'wokou-bridge': {
    about: 'The water town from low down on the square, looking across the canal at the bridge and the far bank: the place itself.',
    place: 'jiangnan',
    level: 'wokou',
    seed: 15,
    frames: 30,
    camera: { focus: { centre: true, height: 1.6 }, yaw: -1.9, pitch: 0.08, distance: 9, fov: 55 },
  },
  'rebellion-square': {
    about: 'The peasant rebellion in the market town, in the morning mist, as the level frames it.',
    place: 'town',
    level: 'rebellion',
    seed: 11,
    frames: 90,
    camera: { focus: { centre: true, height: 1.0 }, yaw: -0.55, pitch: 0.42, distance: 10, fov: 40 },
  },
  'pyongyang-wide': {
    about: 'Pyongyang: the same place as Sekigahara, clear (no mist), as the level frames it.',
    place: 'sengoku',
    level: 'pyongyang',
    seed: 21,
    frames: 120,
    camera: { focus: { centre: true, height: 1.0 }, yaw: -0.5, pitch: 0.34, distance: 22, fov: 40 },
  },
};

// Close shots of the ground at each open-air place: two fighters, the camera
// at head height a few metres off, looking down past them at the ground.
for (const [place, yaw] of [['meadow', 0.9], ['field', 0.9], ['plain', 0.9], ['sengoku', 0.9], ['colosseum', 0.6], ['town', 0.9], ['coastFort', 2.6], ['coastVillage', 2.6], ['jiangnan', 0.9], ['port', 1.2], ['subway', -0.4]]) {
  COMPARE_SCENES[`ground-${place}`] = {
    about: `Two fighters at the ${place}, a close shot looking down at the ground round their feet: the ground.`,
    place,
    seed: 6,
    frames: 40,
    red: [{ preset: 'contender' }],
    blue: [{ preset: 'heavy' }],
    camera: { focus: { centre: true, height: 0.6 }, yaw, pitch: 0.38, distance: 5.5, fov: 50 },
  };
}

/** The value at fraction `share` (0..1) of an ascending list. */
const percentile = (sorted, share) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const round = (value, places = 3) => Math.round(value * 10 ** places) / 10 ** places;
const summarise = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { avg: round(mean(values)), p50: round(percentile(sorted, 0.5)), p95: round(percentile(sorted, 0.95)), p99: round(percentile(sorted, 0.99)), max: round(sorted[sorted.length - 1]) };
};

/**
 * Install `window.__looks`. `context` is what main.js lends it: the page's
 * state, scene and verbs (see the call in main.js), and `looks`, the registry.
 */
export function installLooksBench(context) {
  const { state, scene, looks } = context;
  let staged = null;

  const hideMenus = () => document.querySelectorAll('.screen, .wizard, #banner, #side-pick').forEach((element) => { element.hidden = true; });

  function aimCamera(spec) {
    const world = state.world;
    const { focus } = spec.camera;
    let at;
    if (focus.at) {
      at = [focus.at[0], 0, focus.at[1]];
    } else if (focus.centre) {
      at = [0, 0, 0];
      for (const fighter of world.fighters) {
        at[0] += fighter.x[24] / world.fighters.length;
        at[2] += fighter.x[26] / world.fighters.length;
      }
    } else {
      const fighter = world.fighters[focus.fighter];
      at = [fighter.x[24], 0, fighter.x[26]];
    }
    scene.orbit.target.set(at[0], focus.height, at[2]);
    Object.assign(scene.orbit, { yaw: spec.camera.yaw, pitch: spec.camera.pitch, distance: spec.camera.distance });
    scene.camera.fov = spec.camera.fov;
    scene.camera.updateProjectionMatrix();
  }

  /** Build a comparison scene, run it to its stated moment and freeze it. */
  async function stage(sceneId) {
    const spec = COMPARE_SCENES[sceneId];
    if (!spec) throw new Error(`no scene ${sceneId}; the scenes are ${Object.keys(COMPARE_SCENES).join(', ')}`);
    Math.random = seededGenerator(spec.seed * 7919);
    // The first visit's intro fades out and then opens the home menu, over a fight of its own: wait it out.
    if (context.introPlaying()) {
      context.skipIntro();
      for (let waited = 0; context.introPlaying() && waited < 5000; waited += 50) await new Promise((resolve) => setTimeout(resolve, 50));
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    hideMenus();
    state.paused = false;
    state.speed = 1;
    state.layer = 'skin';
    // What a place paints with Math.random (the crowd's colours, the grass) is built now, under this seed.
    context.forgetPlaces();
    if (spec.level) {
      context.setGame('level', { text: 'Again', run: () => {} });
      state.seed = spec.seed;
      context.chooseLevel(spec.level);
    } else {
      context.setGame('sandbox');
      context.fight(spec.red, spec.blue, { seed: spec.seed, distance: spec.distance ?? null, place: spec.place });
    }
    context.finishBuilding();
    hideMenus();
    context.exactFrames(spec.frames, 1 / 60);
    state.paused = true;
    document.body.classList.add('sheet');
    aimCamera(spec);
    for (let pass = 0; pass < 3; pass += 1) context.draw(0);
    staged = { sceneId, spec };
    return { scene: sceneId, look: looks.current(), simTime: round(state.world.time, 4), fighters: state.world.fighters.length, about: spec.about };
  }

  /** Render the staged scene at a fixed size and save it as shots/<name>.png through tools/serve.py. */
  async function capture(name, { width = 1280, height = 720, save = true } = {}) {
    const renderer = scene.renderer;
    const previousRatio = renderer.getPixelRatio();
    renderer.setPixelRatio(1);
    context.resize(width, height);
    context.render();
    const dataUrl = renderer.domElement.toDataURL('image/png');
    renderer.setPixelRatio(previousRatio);
    context.fit();
    context.render();
    if (!save) return { name, bytes: dataUrl.length, dataUrl };
    const answer = await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: dataUrl });
    return { name, saved: answer.ok, detail: await answer.text(), look: looks.current(), size: [width, height] };
  }

  /**
   * What drawing the staged scene costs, over `frames` frames of the fight
   * going on (so skinning, soft bodies and crowd batching are in it). Per
   * frame: the simulation and the views' update (`updateMs`, CPU), then the
   * look's frame drawn and gl.finish() waited on (`renderMs`: CPU submit plus
   * the wait for the GPU). `gpuMs` is the driver's own timer query where the
   * browser offers one. Run at `width` x `height` (1280x720) at pixel ratio 1, as capture() does.
   */
  async function stats(frames = 120, { warmup = 10, width = 1280, height = 720 } = {}) {
    if (!staged) throw new Error('stage() a scene first');
    const { sceneId } = staged;
    const renderer = scene.renderer;
    const gl = renderer.getContext();
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const pending = [];
    const pixel = new Uint8Array(4);
    const gpuTimes = [];
    const drain = (all) => {
      while (pending.length && (all || gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE))) {
        const query = pending.shift();
        if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) gpuTimes.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
      }
    };
    // The same size for every look and every machine, not the window's.
    const previousRatio = renderer.getPixelRatio();
    renderer.setPixelRatio(1);
    context.resize(width, height);
    state.paused = false;
    const renderTimes = [];
    const submitTimes = [];
    const updateTimes = [];
    const wholeTimes = [];
    let info = null;
    const autoReset = renderer.info.autoReset;
    renderer.info.autoReset = false;
    for (let frame = 0; frame < warmup + frames; frame += 1) {
      const started = performance.now();
      context.exactFrames(1, 1 / 60);
      const updated = performance.now();
      renderer.info.reset();
      const query = timer ? gl.createQuery() : null;
      if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      context.render();
      const submitted = performance.now();
      if (query) {
        gl.endQuery(timer.TIME_ELAPSED_EXT);
        pending.push(query);
      }
      // gl.finish() alone does not wait for the GPU in Chrome (the commands are in another process); reading a pixel does.
      gl.finish();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const finished = performance.now();
      if (frame >= warmup) {
        updateTimes.push(updated - started);
        submitTimes.push(submitted - updated);
        renderTimes.push(finished - updated);
        wholeTimes.push(finished - started);
        info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, points: renderer.info.render.points, lines: renderer.info.render.lines };
      }
      if (timer) drain(false);
    }
    if (timer) drain(true);
    renderer.info.autoReset = autoReset;
    renderer.setPixelRatio(previousRatio);
    context.fit();
    const memory = renderer.info.memory;
    const result = {
      scene: sceneId,
      look: looks.current(),
      frames,
      canvas: [renderer.domElement.width, renderer.domElement.height],
      pixelRatio: renderer.getPixelRatio(),
      updateMs: summarise(updateTimes),
      renderMs: summarise(renderTimes),
      submitMs: summarise(submitTimes),
      frameMs: summarise(wholeTimes),
      // Many browsers answer the timer query with zeros: then there is no figure.
      gpuMs: gpuTimes.some((time) => time > 0) ? summarise(gpuTimes) : null,
      drawCalls: info.calls,
      triangles: info.triangles,
      textures: memory.textures,
      geometries: memory.geometries,
      programs: renderer.info.programs?.length ?? null,
      renderer: gl.getParameter(gl.RENDERER),
    };
    // The fight has moved on: put the still back.
    await stage(sceneId);
    return result;
  }

  /**
   * The test of a look's colour pipeline: three unlit swatches of one
   * authored colour (as a material colour, as a canvas texture, as a vertex
   * colour) drawn through the renderer as the look has set it, with tone
   * mapping off for them, read back from the canvas. Each must come back as
   * the authored hex, within a few levels; a milky or dark swatch means a
   * piece of the sRGB decoding is missing (see "The colour trap", looks.js).
   */
  function colourCheck(hex = 0x5f7f3a) {
    const renderer = scene.renderer;
    const authored = new THREE.Color(hex);
    const canvas = Object.assign(document.createElement('canvas'), { width: 4, height: 4 });
    const paint = canvas.getContext('2d');
    paint.fillStyle = `#${hex.toString(16).padStart(6, '0')}`;
    paint.fillRect(0, 0, 4, 4);
    const quad = (x, material, colours) => {
      const geometry = new THREE.PlaneGeometry(1.6, 1.6);
      if (colours) geometry.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: 4 }, () => [authored.r, authored.g, authored.b]).flat(), 3));
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.x = x;
      return mesh;
    };
    const basic = (options) => new THREE.MeshBasicMaterial({ toneMapped: false, ...options });
    const swatches = [
      ['colour', quad(-2, basic({ color: hex }))],
      ['texture', quad(0, basic({ map: new THREE.CanvasTexture(canvas) }))],
      ['vertex', quad(2, basic({ vertexColors: true }), true)],
    ];
    const swatchScene = new THREE.Scene();
    swatchScene.add(...swatches.map(([, mesh]) => mesh));
    sweepMaterials(swatchScene, Boolean(activeLook().linear));
    const camera = new THREE.OrthographicCamera(-3, 3, 1, -1, 0.1, 10);
    camera.position.z = 5;
    renderer.setRenderTarget(null);
    renderer.render(swatchScene, camera);
    const gl = renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const wanted = [authored.r, authored.g, authored.b].map((value) => Math.round(value * 255));
    const results = swatches.map(([kind, mesh]) => {
      const pixel = new Uint8Array(4);
      gl.readPixels(Math.floor(((mesh.position.x + 3) / 6) * width), Math.floor(height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const got = [pixel[0], pixel[1], pixel[2]];
      return { kind, wanted, got, ok: got.every((value, index) => Math.abs(value - wanted[index]) <= 3) };
    });
    for (const [, mesh] of swatches) {
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
    }
    context.render();
    return { look: looks.current(), ok: results.every((result) => result.ok), results };
  }

  window.__looks = {
    list: () => looks.list(),
    current: () => looks.current(),
    set: (id) => looks.set(id),
    scenes: () => Object.fromEntries(Object.entries(COMPARE_SCENES).map(([id, spec]) => [id, spec.about])),
    stage,
    capture,
    stats,
    /** The ground style (src/scenery.js GROUND): with an id, switch to it in the place shown now; without, list them. */
    ground: (id) => {
      if (id === undefined) return { current: activeGround(), styles: GROUND_STYLES.map((style) => style.id) };
      const chosen = setGround(id);
      applyScenery(scene, scene.place);
      context.draw(0);
      return chosen;
    },
    /** The scenery variant (src/scenery.js): with an id, switch to it in the place shown now; without, list them. */
    scenery: (id) => {
      if (id === undefined) return { current: activeScenery(), variants: SCENERY_VARIANTS.map((variant) => variant.id) };
      const chosen = setScenery(id);
      applyScenery(scene, scene.place);
      context.draw(0);
      return chosen;
    },
    colourCheck,
    /** stage + capture, named <scene>-<look> unless a name is given. */
    shoot: async (sceneId, name = `${sceneId}-${looks.current()}`, options = {}) => {
      await stage(sceneId);
      return capture(name, options);
    },
    /** Restore the page's own Math.random (the shots no longer repeat). */
    /** Move a scene's camera now (yaw, pitch, distance, fov, and focus.height); to find a framing, then write it into COMPARE_SCENES. */
    tune: (patch) => {
      if (!staged) throw new Error('stage() a scene first');
      const { height, ...rest } = patch;
      Object.assign(staged.spec.camera, rest);
      if (height !== undefined) staged.spec.camera.focus.height = height;
      aimCamera(staged.spec);
      context.draw(0);
      return staged.spec.camera;
    },
    unseed: () => { Math.random = NATIVE_RANDOM; },
    /**
     * Try a look from the console without a file: `__looks.register({ id, label, blurb, style, scripts, prepare, apply, ... })`
     * adds it to the registry and the selector (until the page is reloaded), then `await __looks.set(id)`.
     */
    register: (spec) => {
      const look = defineLook({ label: spec.id, blurb: 'Registered from the console.', ...spec });
      LOOKS.push(look);
      document.querySelector('#look')?.append(Object.assign(new Option(look.label, look.id), { title: look.blurb }));
      return look.id;
    },
    /** Load non-module scripts as a look's `scripts` would (once each, in order). */
    loadScripts,
  };
}
