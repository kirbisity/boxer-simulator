// The kit every look file imports: constants that need no THREE at import
// time (so the registry loads in Node for the tests), `defineLook`, the lazy
// script loader, and the helpers that bend a view to a look (renderer
// settings, environments, skies, owned resources) and that carry the
// colour-encoding fix (see "The colour trap" at the top of looks.js).
//
// A look file imports from here and from nowhere else in src/, so the
// bundle can put the kit and the look files before looks.js, which imports
// them. Every top-level name in a look file must be unique among all
// modules (the bundle puts them in one scope): prefix them with the look.

/* global THREE */

/** THREE's numeric constants, by name, so a look can be described before THREE is there. */
export const TONE_MAPPING = { none: 0, linear: 1, reinhard: 2, cineon: 3, aces: 4 };
export const OUTPUT_ENCODING = { linear: 3000, srgb: 3001 };
export const SHADOW_MAP = { basic: 0, pcf: 1, pcfSoft: 2, variance: 3 };
/** Where the optional three r128 example scripts (EffectComposer, Sky, ...) come from; the artifact's CSP allows jsdelivr. */
export const EXAMPLES_URL = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js';
// A script that has not loaded in this long has failed (the look falls back to toon).
const SCRIPT_TIMEOUT_MS = 15000;

// ---- Defining a look --------------------------------------------------------

/**
 * @typedef {Object} Look
 * @property {string} id            Unique, lower-case, dashes: the ?look= value and the file name.
 * @property {string} label         Shown in the Look selector.
 * @property {string} blurb         One sentence: what this look is and what it costs.
 * @property {'toon'|'soft'} style  What surface() builds when the look has no `surface` hook: 'toon' is MeshToon cel steps, 'soft' is MeshStandard.
 * @property {string[]} scripts     Urls of non-module scripts to lazy-load, in dependency order (usually `${EXAMPLES_URL}/...`). Toon loads nothing.
 * @property {object} [renderer]   Static renderer settings (as setRenderer takes: toneMapping, toneMappingExposure, outputEncoding, shadowMapType, pixelRatio), set whenever the look is applied, also to the small portrait renderer; `apply` may vary them per place.
 * @property {boolean} [placeholder]  True while the look is only its registry entry (the soft style and a TODO): the real file removes it.
 * @property {boolean} linear      Opt in to the linear workflow (see looks.js): authored hex colours, light and fog colours and canvas textures are decoded from sRGB, for use with outputEncoding sRGB. Off for toon.
 * @property {boolean|number} outlines  true: ink outlines as drawn today; false: none (no hull meshes at all); a number: a multiplier on every outline's width.
 * @property {(view) => Promise<void>} [prepare]  Once per view (scene), after the scripts have loaded: build what is expensive and reusable (an environment, a composer). Throwing falls back to toon.
 * @property {(view, place: string) => void} [apply]  Each time the place or the look changes, after the default rig for the place has been set (view.light is the place's PLACE_LIGHT entry): renderer, scene.environment, sky, fog, lights.
 * @property {(color: number, options: object) => (THREE.Material|null|undefined)} [surface]  Skin and cloth: return a material, or nothing for the style's default.
 * @property {(envMap: THREE.Texture, options: object) => (THREE.Material|null|undefined)} [steel]  Metal, likewise.
 * @property {(view) => void} [renderFrame]  The whole frame, in place of renderer.render (an EffectComposer). Must draw to the canvas.
 * @property {(view, width: number, height: number) => void} [resize]  After the renderer has been resized (resize the composer's targets).
 * @property {(view) => void} [dispose]  This look is being left: free what prepare/apply made that kit.own() did not know of. Renderer, lights and painted skies are restored by the plumbing.
 */

/** A look with the defaults filled in; anything not given is a no-op (a hook left out is the identity). */
export function defineLook(spec) {
  if (!/^[a-z][a-z0-9-]*$/.test(spec.id ?? '')) throw new Error(`a look's id is lower-case words with dashes, not ${JSON.stringify(spec.id)}`);
  return { style: 'soft', scripts: [], linear: false, outlines: true, ...spec };
}

/** How many times wider than drawn a look's outlines are: 1 as today, 0 for none. */
export function outlineScale(look) {
  if (look.outlines === false) return 0;
  return typeof look.outlines === 'number' ? look.outlines : 1;
}

// ---- Lazy scripts -----------------------------------------------------------

const scriptLoads = new Map();

function loadOneScript(url) {
  if (scriptLoads.has(url)) return scriptLoads.get(url);
  const promise = new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = url;
    const timer = setTimeout(() => fail(new Error(`${url} did not load in ${SCRIPT_TIMEOUT_MS / 1000} s`)), SCRIPT_TIMEOUT_MS);
    function fail(error) {
      clearTimeout(timer);
      tag.remove();
      // A failure is not remembered: asked for again, it is tried again.
      scriptLoads.delete(url);
      reject(error);
    }
    tag.onload = () => {
      clearTimeout(timer);
      resolve(url);
    };
    tag.onerror = () => fail(new Error(`${url} could not be loaded`));
    document.head.append(tag);
  });
  scriptLoads.set(url, promise);
  return promise;
}

/** Whether every one of these scripts has finished loading. */
export const scriptsLoaded = (urls) => urls.every((url) => loadedScripts.has(url));
const loadedScripts = new Set();

/**
 * Load non-module scripts, each once per page, one after another in the
 * order given (the examples depend on each other: CopyShader before
 * ShaderPass before EffectComposer). Resolves when all have run; rejects
 * with the first failure.
 */
export async function loadScripts(urls) {
  for (const url of urls) {
    await loadOneScript(url);
    loadedScripts.add(url);
  }
}

// ---- Colour: the linear workflow ---------------------------------------------

/** A linear-light THREE.Color from an authored sRGB hex (or colour string). The one conversion to use for anything a look builds itself. */
export function linearColour(authored) {
  return new THREE.Color(authored).convertSRGBToLinear();
}

const COLOUR_SLOTS = ['color', 'emissive', 'specular'];
const TEXTURE_SLOTS = ['map', 'emissiveMap'];
// Vertex colours (and an instanced mesh's per-instance colours) are authored in sRGB too; decode them in the vertex shader, where they are still plain attributes.
const DECODE_VERTEX_COLOUR = `
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
  vColor.rgb = mix( pow( vColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), vColor.rgb * 0.0773993808, vec3( lessThanEqual( vColor.rgb, vec3( 0.04045 ) ) ) );
#endif`;

function patchVertexColours(material) {
  if (material.onBeforeCompile.decodesVertexColours) return;
  const previous = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey();
  const patched = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>${DECODE_VERTEX_COLOUR}`);
  };
  patched.decodesVertexColours = true;
  patched.previous = previous;
  material.onBeforeCompile = patched;
  // three caches programs by the source text of onBeforeCompile (the same for every patched material): key them apart from the unpatched.
  material.customProgramCacheKey = () => `${baseKey}|srgbVertexColour`;
  material.needsUpdate = true;
}

/**
 * Make one material linear-workflow: its colours decoded from sRGB (the
 * originals kept, so toon can be restored exactly), its maps tagged
 * sRGBEncoding (three decodes them in the shader), and its vertex colours
 * decoded in the vertex shader. Safe to call again and on a clone.
 */
export function linearise(material, object = null) {
  if (!material.userData.linearised) {
    const originals = {};
    for (const slot of COLOUR_SLOTS) {
      if (!material[slot]?.isColor) continue;
      originals[slot] = material[slot].toArray();
      material[slot].convertSRGBToLinear();
    }
    material.userData.srgbOriginals = originals;
    material.userData.linearised = true;
  }
  for (const slot of TEXTURE_SLOTS) {
    const texture = material[slot];
    if (texture && texture.encoding !== THREE.sRGBEncoding) {
      texture.encoding = THREE.sRGBEncoding;
      material.needsUpdate = true;
    }
  }
  if (material.vertexColors || object?.instanceColor) patchVertexColours(material);
}

/** Undo `linearise`: the authored colours back exactly, maps linear again, the vertex shader as it was. */
export function unlinearise(material) {
  if (material.userData.linearised) {
    for (const [slot, rgb] of Object.entries(material.userData.srgbOriginals ?? {})) material[slot]?.fromArray(rgb);
    material.userData.linearised = false;
  }
  for (const slot of TEXTURE_SLOTS) {
    const texture = material[slot];
    if (texture && texture.encoding === THREE.sRGBEncoding) {
      texture.encoding = THREE.LinearEncoding;
      material.needsUpdate = true;
    }
  }
  if (material.onBeforeCompile.decodesVertexColours) {
    material.onBeforeCompile = material.onBeforeCompile.previous ?? THREE.Material.prototype.onBeforeCompile;
    delete material.customProgramCacheKey;
    material.needsUpdate = true;
  }
}

/**
 * Walk a scene graph and make every material linear-workflow (`linear`) or
 * authored again. A material already so is skipped quickly, so a later sweep
 * costs a traversal and little more.
 */
export function sweepMaterials(root, linear) {
  root.traverse((object) => {
    const materials = object.material;
    if (!materials) return;
    for (const material of Array.isArray(materials) ? materials : [materials]) {
      if (linear) linearise(material, object);
      else if (material.userData.linearised || material.onBeforeCompile.decodesVertexColours) unlinearise(material);
    }
  });
}

/** Write an authored sRGB colour into a material's slot, decoded if the material is linear-workflow (for a colour set after the build: a bruise). */
export function assignColour(material, slot, authored) {
  material[slot].copy(authored);
  if (material.userData.linearised) material[slot].convertSRGBToLinear();
}

// ---- Bending a view to a look -----------------------------------------------

/** A look's own scratch space on a view (a composer, a sky, a probe): `stateOf(view, 'probe-lite').dome`. Kept for the life of the view; free it in `dispose`. */
export function stateOf(view, lookId) {
  return ((view.lookState ??= {})[lookId] ??= {});
}

/** Every material in a view's scene, once each. */
function eachMaterial(view, visit) {
  const seen = new Set();
  view.scene.traverse((object) => {
    for (const material of [].concat(object.material ?? [])) {
      if (seen.has(material)) continue;
      seen.add(material);
      visit(material);
    }
  });
}

/**
 * Renderer settings: any of toneMapping, toneMappingExposure,
 * outputEncoding, shadowMapType, pixelRatio. Changing the shadow filter or
 * the tone mapping recompiles every material, so it is done only when it
 * differs. (r128 recompiles on its own for a new outputEncoding or
 * scene.environment, but NOT for a new toneMapping or shadow type: a
 * material already compiled keeps the old one until `needsUpdate`.)
 */
export function setRenderer(view, settings) {
  const renderer = view.renderer;
  if (settings.toneMapping !== undefined && renderer.toneMapping !== settings.toneMapping) {
    renderer.toneMapping = settings.toneMapping;
    eachMaterial(view, (material) => { material.needsUpdate = true; });
  }
  if (settings.toneMappingExposure !== undefined) renderer.toneMappingExposure = settings.toneMappingExposure;
  if (settings.outputEncoding !== undefined) renderer.outputEncoding = settings.outputEncoding;
  if (settings.shadowMapType !== undefined && renderer.shadowMap.type !== settings.shadowMapType) {
    renderer.shadowMap.type = settings.shadowMapType;
    eachMaterial(view, (material) => { material.needsUpdate = true; });
  }
  if (settings.pixelRatio !== undefined && renderer.getPixelRatio() !== settings.pixelRatio) {
    renderer.setPixelRatio(settings.pixelRatio);
    const size = renderer.getSize(new THREE.Vector2());
    view.look?.resize?.(view, size.x, size.y);
  }
}

/** Every painted sky dome in the view's places (tagged `userData.paintedSky` where daySky() and the night sky build them). */
export function paintedSkies(view) {
  const skies = [];
  for (const place of Object.values(view.places)) place?.traverse((object) => { if (object.userData.paintedSky) skies.push(object); });
  return skies;
}

/** Hide the painted domes (a look that draws its own sky). They come back by themselves when the look is left. */
export function hidePaintedSky(view) {
  for (const sky of paintedSkies(view)) sky.visible = false;
}

/**
 * Swap the steel's reflection map for `texture` everywhere it is used
 * (steel materials and the wet places that reflect the sky), and keep it as
 * `view.steelEnv`. The old map is not disposed: the plumbing keeps the
 * default one to restore.
 */
export function replaceEnvironment(view, texture) {
  const old = view.steelEnv;
  view.steelEnv = texture;
  eachMaterial(view, (material) => {
    if (material.envMap === old) material.envMap = texture;
  });
}

/**
 * Keep a thing for the look: an Object3D is added to the scene and removed
 * on leaving the look; anything with dispose() (a texture, a render target,
 * a composer's pass) is disposed on leaving. Returns it.
 */
export function own(view, thing) {
  const owned = view.lookOwned ?? (view.lookOwned = []);
  if (thing.isObject3D) view.scene.add(thing);
  owned.push(thing);
  return thing;
}

/** Free what `own` kept, and what the look's `dispose` hook did not. */
export function releaseOwned(view) {
  for (const thing of view.lookOwned ?? []) {
    if (thing.isObject3D) {
      view.scene.remove(thing);
      thing.traverse((object) => {
        object.geometry?.dispose?.();
        for (const material of [].concat(object.material ?? [])) {
          for (const key of ['map', 'emissiveMap']) material[key]?.dispose?.();
          material.dispose?.();
        }
      });
    } else thing.dispose?.();
  }
  view.lookOwned = [];
}

/** Resize a shadow-casting light's map (it is rebuilt at the next frame). */
export function setShadowMapSize(light, size) {
  if (light.shadow.mapSize.x === size) return;
  light.shadow.mapSize.set(size, size);
  light.shadow.map?.dispose();
  light.shadow.map = null;
}
