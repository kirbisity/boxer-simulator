// Looks: whole ways of drawing the game, switchable at runtime. A look
// decides, per place, the renderer settings, the sky, the fog, the light rig,
// the environment the steel reflects, the materials of skin, cloth and metal,
// whether ink outlines are drawn, and the frame itself (a post-processing
// chain). The registry below lists them; each is one file in src/looks/, the
// kit they import is src/looks/kit.js, and the type is `Look` there.
// Two remain: 'probe-lite', the realistic look the game is committed to and
// a first visit starts in, and 'toon', the classic cartoon look and the safe
// fallback: it has no hooks, so with it chosen nothing in this file changes
// a pixel or costs a millisecond. (Four other looks were tried and removed in
// October 2026: physical-sky, hdr-post, quality-physical and photo-hdri.)
//
// ---- Comparing looks (shoot and measure) ------------------------------------
//
//   python3 tools/serve.py 8941                     (one terminal; never 8934)
//   open  http://127.0.0.1:8941/index.html?shoot&look=<id>
//
// then, in the page (the Chrome javascript_tool, top-level await works):
//
//   await __looks.stage('colosseum')                the scene, seeded and frozen at a stated moment
//   await __looks.capture('colosseum-<id>')         1280x720 PNG into shots/ (git-ignored, written by tools/serve.py)
//   await __looks.stats(120)                        CPU and GPU-wait ms of a frame, draw calls, triangles, textures
//   await __looks.set('toon')                       another look in the same page; stage() again before capturing
//   await __looks.shoot('field-cavalry')            stage + capture, named <scene>-<look>
//   __looks.list(), __looks.scenes(), __looks.tune({ yaw, pitch, distance, fov, height })
//   __looks.colourCheck()                           an unlit swatch must read back as its own hex (see the trap below)
//
// The scenes: colosseum, field-cavalry, ring-portrait, sengoku-army (see
// COMPARE_SCENES in looksbench.js). Each is seeded, runs a fixed number of
// exact steps, and is frozen under a fixed camera, so every look is shown the
// same picture. Two page loads of the same look give byte-identical PNGs.
//
// ---- The colour trap (r128) --------------------------------------------------
//
// In three r128 colour is NOT managed. A hex like 0x5f7f3a is used as it
// stands in the shader, as if it were linear light, and the canvas is written
// as it stands (outputEncoding LinearEncoding): the whole game is authored in
// display (sRGB) values and shows them unchanged, with lighting done on those
// values. The moment a look sets renderer.outputEncoding = sRGBEncoding (which
// any physically-minded look wants, and tone mapping wants), the canvas gets
// a linear-to-sRGB curve on the end and everything that was authored in sRGB
// is brightened and washed out ("milky"). To get a correct picture, EVERYTHING
// authored must be decoded to linear going in:
//   - material colours (color, emissive): Color.convertSRGBToLinear();
//   - canvas textures (the painted places, banners): texture.encoding = sRGBEncoding,
//     which makes three decode them in the shader (and needs material.needsUpdate);
//   - vertex colours (skin, kit and steel are painted onto the bodies) and the
//     instanced crowd's colours: decoded in the vertex shader (kit.js patches
//     the color_vertex chunk);
//   - light colours and the fog colour (fog is mixed in linear light and then encoded);
//   - environment maps built from a painted canvas: tag the canvas texture
//     sRGBEncoding before PMREMGenerator.fromEquirectangular;
//   - NOT the scene.background colour: it is cleared to the canvas raw, so give it as authored.
// A look opts in with `linear: true`: this file then sweeps the scene graph
// (kit.sweepMaterials) when the look is applied and again before drawing
// whenever something was added (and every LINEAR_SWEEP_FRAMES frames), keeping
// the authored values so toon can be restored exactly; it also decodes the
// light and fog colours after the default rig is set, and gives the steel a
// decoded copy of the default environment. `kit.linearColour(hex)` is the one
// conversion for anything a look builds itself, and `kit.assignColour` for a
// colour changed after the build (face.js does it for a bruise). A look that
// stays authored-in-sRGB (outputEncoding left linear) must NOT set `linear`.
// __looks.colourCheck() draws an unlit swatch through the current look and
// compares it with its hex: it is the test that a pipeline is right.
//
// ---- Other r128 traps found while building this -------------------------------
//
// - renderer.toneMapping (and shadowMap.type) changed after materials have
//   compiled does nothing to them until material.needsUpdate = true. A new
//   outputEncoding or scene.environment does recompile by itself. kit.setRenderer
//   knows; assigning renderer.toneMapping directly does not.
// - scene.environment reaches only MeshStandardMaterial and MeshPhysicalMaterial
//   (`material.isMeshStandardMaterial`). MeshToon, Lambert, Phong and Basic ignore
//   it; they need material.envMap, and MeshToon has no envMap at all.
// - Rendering into a render target (an EffectComposer's) does not apply
//   renderer.outputEncoding (it uses the target texture's encoding, linear by
//   default) but DOES apply renderer.toneMapping to every material with
//   toneMapped true: set toneMapping to none while a composer draws the scene and
//   tone-map once in its last pass, or the image is tone-mapped twice.
// - Skinned meshes work unchanged through a composer; each fighter's bones are
//   a texture the renderer uploads per skinned mesh (inverted-hull outlines
//   share the skeleton), so draw calls and bone textures, not the composer, are
//   what crowds cost.
// - A canvas read back (toDataURL) must be read in the same task as the render
//   (the buffer is not preserved); a composer's last pass writes the canvas, so
//   the same holds.
// - Scene fog is replaced by setPlace on every place change, and r128 compares
//   the fog by identity: every material recompiles then (as it always has).
//
// ---- Adding a look ----------------------------------------------------------
//
// Edit only src/looks/<id>.js (it exists already as a placeholder, with its
// export name, and is already registered, bundled and in the selector): give
// it hooks, remove `placeholder`. Prefix every top-level name in it with the
// look (the bundle is one scope; test/looks.test.js and tools/bundle.js refuse
// duplicates). Optional three examples go in `scripts` (urls under
// kit.EXAMPLES_URL, dependencies first): they load once, only when the look is
// chosen, and if one fails to load the game falls back to toon with a console
// warning. Look at ARCHITECTURE.md (Looks) for the life cycle.

import { TOON_LOOK } from './looks/toon.js';
import { PROBE_LITE_LOOK } from './looks/probe-lite.js';
import { loadScripts, releaseOwned, replaceEnvironment, scriptsLoaded, setRenderer, sweepMaterials } from './looks/kit.js';

/** The looks, in the order of the selector. */
export const LOOKS = [PROBE_LITE_LOOK, TOON_LOOK];
/** The safe look: what a look that cannot be set up falls back to. */
export const DEFAULT_LOOK_ID = TOON_LOOK.id;
/** The game's official look, the one a first visit starts in (the cheap realistic one: probe-lite). */
export const OFFICIAL_LOOK_ID = PROBE_LITE_LOOK.id;
const STORAGE_KEY = 'gladiator.look';
// A linear look re-checks the whole scene this often (frames), besides whenever the scene gained a child: what is built inside an existing group is only found this way.
const LINEAR_SWEEP_FRAMES = 30;

let lookInForce = TOON_LOOK;

/** The look in force. */
export const activeLook = () => lookInForce;
export const lookById = (id) => LOOKS.find((look) => look.id === id) ?? null;
/** The registry as plain data, for the selector and the harness. */
export const lookList = () => LOOKS.map(({ id, label, blurb, style, scripts, linear, placeholder }) => ({ id, label, blurb, style, scripts: [...scripts], linear, placeholder: Boolean(placeholder) }));

// ---- Which look: the URL, the memory ----------------------------------------

/** The look named by ?look=<id> in a query string, or null. */
export function lookIdFromSearch(search) {
  return new URLSearchParams(search).get('look');
}

/** The look chosen last time, if it still exists (localStorage may be absent or blocked: then none). */
export function rememberedLookId() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    // A look chosen before it was removed: start in the official look, not the fallback.
    return lookById(id) ? id : null;
  } catch {
    return null;
  }
}

export function rememberLook(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Private window or blocked storage: the choice is simply not kept.
  }
}

// ---- Choosing a look --------------------------------------------------------

/** Put a look in force. Its scripts must be loaded and its views prepared (see loadLook); everything is rebuilt and re-applied by the caller. */
export function activateLook(look) {
  lookInForce = look;
  return look;
}

/**
 * Choose a look at once if it needs nothing to be loaded or built (no
 * scripts, no `prepare`): true if done. For the first scene, which is made
 * under the look chosen at the start.
 */
export function activateLookNow(id) {
  const look = lookById(id);
  if (!look || look.scripts.length || look.prepare) return false;
  activateLook(look);
  return true;
}

/**
 * Get a look ready without choosing it: its scripts loaded, then `prepare`
 * run once for each of `views`. Resolves with the look, or null (after a
 * console warning) if something failed: the caller stays with what it had.
 */
export async function loadLook(id, views = []) {
  const look = lookById(id);
  if (!look) {
    console.warn(`Unknown look '${id}'; the looks are ${LOOKS.map((entry) => entry.id).join(', ')}. Falling back to '${DEFAULT_LOOK_ID}'.`);
    return null;
  }
  try {
    if (!scriptsLoaded(look.scripts)) await loadScripts(look.scripts);
    for (const view of views) {
      const prepared = view.lookPrepared ?? (view.lookPrepared = new Set());
      if (prepared.has(look.id)) continue;
      await look.prepare?.(view);
      prepared.add(look.id);
    }
    return look;
  } catch (error) {
    console.warn(`Look '${id}' could not be set up (${error.message}); falling back to '${DEFAULT_LOOK_ID}'.`);
    return null;
  }
}

/**
 * Load a look and put it in force; if it cannot be, the default (toon) is.
 * Returns the look now in force. The caller re-applies the place and
 * rebuilds the views (main.js switchLook).
 */
export async function setLook(id, views = []) {
  return activateLook((await loadLook(id, views)) ?? TOON_LOOK);
}

// ---- A view and its look ----------------------------------------------------

const lightDefaults = (light) => ({
  color: light.color.clone(),
  groundColor: light.groundColor?.clone(),
  intensity: light.intensity,
  position: light.position.clone(),
  distance: light.distance,
  angle: light.angle,
  penumbra: light.penumbra,
  decay: light.decay,
  castShadow: light.castShadow,
  shadow: light.shadow && {
    mapSize: light.shadow.mapSize.x,
    bias: light.shadow.bias,
    normalBias: light.shadow.normalBias,
    radius: light.shadow.radius,
    camera: ['left', 'right', 'top', 'bottom', 'near', 'far', 'fov'].filter((key) => key in light.shadow.camera).map((key) => [key, light.shadow.camera[key]]),
  },
});

/**
 * Remember how a freshly built view is set (the renderer, the lights, the
 * steel's environment), so that leaving a look puts it all back. Called by
 * createScene once; `makeSteelEnvironment(linear)` builds the steel's
 * reflection map, authored or decoded from sRGB.
 */
export function captureViewDefaults(view, makeSteelEnvironment) {
  const { renderer } = view;
  view.defaults = {
    renderer: {
      toneMapping: renderer.toneMapping,
      toneMappingExposure: renderer.toneMappingExposure,
      outputEncoding: renderer.outputEncoding,
      shadowMapType: renderer.shadowMap.type,
      pixelRatio: renderer.getPixelRatio(),
    },
    lights: Object.fromEntries(Object.entries(view.lights).map(([name, light]) => [name, lightDefaults(light)])),
    environment: view.scene.environment,
  };
  view.steelEnvironments = { authored: view.steelEnv, decoded: null, make: makeSteelEnvironment };
}

function restoreLight(light, saved) {
  light.color.copy(saved.color);
  light.groundColor?.copy(saved.groundColor);
  light.intensity = saved.intensity;
  light.position.copy(saved.position);
  for (const key of ['distance', 'angle', 'penumbra', 'decay']) if (saved[key] !== undefined) light[key] = saved[key];
  light.castShadow = saved.castShadow;
  if (!saved.shadow) return;
  const { shadow } = light;
  if (shadow.mapSize.x !== saved.shadow.mapSize) {
    shadow.mapSize.set(saved.shadow.mapSize, saved.shadow.mapSize);
    shadow.map?.dispose();
    shadow.map = null;
  }
  Object.assign(shadow, { bias: saved.shadow.bias, normalBias: saved.shadow.normalBias, radius: saved.shadow.radius });
  for (const [key, value] of saved.shadow.camera) shadow.camera[key] = value;
  shadow.camera.updateProjectionMatrix();
}

/**
 * Before a place's light is set: if a look other than toon has touched the
 * view, undo it (leave the old look: its dispose hook and what it owned; the
 * renderer, lights, environment and painted skies as they were built). With
 * toon throughout this returns at once and changes nothing.
 */
export function resetForLook(view) {
  if (view.look && view.look !== lookInForce) {
    view.look.dispose?.(view);
    releaseOwned(view);
    view.look = null;
    view.lookDirty = true;
  }
  if (!view.lookDirty) return;
  const saved = view.defaults;
  setRenderer(view, saved.renderer);
  for (const [name, light] of Object.entries(view.lights)) restoreLight(light, saved.lights[name]);
  view.scene.environment = saved.environment;
  replaceEnvironment(view, view.steelEnvironments.authored);
  for (const place of Object.values(view.places)) place?.traverse((object) => { if (object.userData.paintedSky) object.visible = true; });
  view.lookDirty = false;
}

/**
 * After a place's default light is set: apply the look in force. Renderer
 * settings first, then (for a linear look) the colour decoding of everything
 * authored, then the look's own `apply`, which has the last word.
 */
export function applyLook(view, place) {
  const look = lookInForce;
  view.look = look;
  if (view.linearApplied && !look.linear) {
    sweepMaterials(view.scene, false);
    view.linearApplied = false;
  }
  if (look === TOON_LOOK) return;
  view.lookDirty = true;
  if (look.renderer) setRenderer(view, look.renderer);
  if (look.linear) {
    sweepMaterials(view.scene, true);
    view.linearApplied = true;
    // The default rig is set in authored sRGB values; fog and lights are used as linear light.
    for (const light of Object.values(view.lights)) {
      light.color.convertSRGBToLinear();
      light.groundColor?.convertSRGBToLinear();
    }
    view.scene.fog?.color.convertSRGBToLinear();
    const environments = view.steelEnvironments;
    environments.decoded ??= environments.make(true);
    replaceEnvironment(view, environments.decoded);
  }
  look.apply?.(view, place);
}

/** The frame of a view: the look's own (a composer), or the plain render. Keeps a linear look's late-built materials decoded. */
export function drawFrame(view) {
  const look = view.look;
  if (!look) {
    view.renderer.render(view.scene, view.camera);
    return;
  }
  if (look.linear) keepLinear(view);
  if (look.renderFrame) look.renderFrame(view);
  else view.renderer.render(view.scene, view.camera);
}

function keepLinear(view) {
  const swept = view.linearSweep ?? (view.linearSweep = { children: -1, frame: 0 });
  swept.frame += 1;
  if (view.scene.children.length === swept.children && swept.frame % LINEAR_SWEEP_FRAMES !== 0) return;
  swept.children = view.scene.children.length;
  sweepMaterials(view.scene, true);
}

/** After the renderer's size changed. */
export function resizeLook(view, width, height) {
  view.look?.resize?.(view, width, height);
}

/**
 * A view drawn plainly (the small portrait renderer): the look's static
 * renderer settings, decoded colours and steel environment, no hooks, no
 * composer. Idempotent: call it before building what the view shows (the
 * steel takes the environment then) and again before drawing.
 */
export function flattenView(view) {
  const look = lookInForce;
  // Nothing to do (the usual case: toon) unless the view was bent to a look before.
  const plain = !look.renderer && !look.linear;
  if (plain && !view.flattened) return;
  view.flattened = !plain;
  setRenderer(view, look.renderer ?? view.defaults.renderer);
  for (const [name, light] of Object.entries(view.lights)) {
    restoreLight(light, view.defaults.lights[name]);
    if (look.linear) {
      light.color.convertSRGBToLinear();
      light.groundColor?.convertSRGBToLinear();
    }
  }
  const environments = view.steelEnvironments;
  if (look.linear) environments.decoded ??= environments.make(true);
  replaceEnvironment(view, look.linear ? environments.decoded : environments.authored);
  sweepMaterials(view.scene, Boolean(look.linear));
}
