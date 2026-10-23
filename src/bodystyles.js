// The ways to build a fighter's skin mesh: one registry, so the renderer, the
// comparison-sheet tool and the tests ask for a style by name and get the same
// mesh. No Three.js here (the renderer turns the mesh into a skinned one), and
// every module this imports is plain numbers too, so every style can be built
// and checked in Node.
//
// 'v7' is the default (DEFAULT_BODY_STYLE); 'lofted' the old default and the baseline. 'smoothed' and 'dense' are the
// anatomy field (bodymesh.js), 'faceted' the loft in flat low poly.
//
// Round one of the body-drawing prototypes (docs: tools/bodysheet.html):
//   sculpt  A: the loft with landmark-driven ring profiles (sculpt.js)
//   flesh   B: the anatomy field, bones and muscles as volumes (fleshbody.js)
//   detail  C: the loft's silhouette with a bump map of the fine anatomy (skindetail.js)
// Round two adds the skin's textures (skintex.js: albedo, normals, occlusion,
// roughness, made once per composition bucket and cached), the fine anatomy as
// rules with edges (skinrules.js), blended joins where the limbs meet the trunk
// (loftbody.js filletParts), and a face that follows the body (facemorph.js):
//   v1  painted loft: A's broad forms and outline on the plain rings, the anatomy only in the albedo and occlusion
//       (what a Lambert skin, the game's probe-lite look, can show): the cheapest
//   v2  mapped loft: the same mesh with all four maps (normals and roughness need a toon or standard skin: a Lambert one is upgraded)
//   v3  B baked onto A: the same cheap mesh, its normals and occlusion baked from the refined flesh field (B's anatomy, A's price)
//   v4  sculpted and mapped: fine rings carrying the outline and most of the rules' height, the maps the rest
//   v5  flesh-lite: the refined field meshed coarsely, painted per vertex (no maps): smooth joins by construction
//   v6  flesh hero: the refined field at full resolution, painted per vertex
//   v7  V5's shape on a loft: a medium-density loft (V2's texture coordinates, skin weights and maps) wrapped onto the refined
//       field's large forms (loftbody.js wrapOnField), so the arms grow out of the trunk as in V5 at a fifth of its triangles
// Every round-two style also morphs the face with the body (the `face` flag; the head is built in face.js).

import { buildBodyMesh } from './bodymesh.js';
import { buildLoftBody, buildLoftBodySteps, runSteps } from './loftbody.js';
import { outfitOf } from './outfits.js';
import { buildFleshBody, fleshAnatomy, fleshField } from './fleshbody.js';
import { buildDetailMap } from './skindetail.js';
import { cachedSkinTextures, compositionKey, runSkinTextures, runSkinTexturesAsync, SKINTEX, skinTextureSteps, storeSkinTextures } from './skintex.js';

const ALL_MAPS = ['albedo', 'normal', 'ao', 'rough'];
/**
 * Each style: `face` (the head follows the body), `tex` (the maps it wants: their source, layers, the mesh's share of the rules'
 * height, and whether a Lambert skin is upgraded to a standard one so the normals show), `label` for the sheets.
 */
export const STYLE_SPECS = {
  lofted: {},
  smoothed: {},
  faceted: {},
  dense: {},
  sculpt: { label: 'A: sculpt' },
  detail: { label: 'C: detail' },
  flesh: { label: 'B: flesh' },
  v1: { face: true, tex: { source: 'rules', layers: ['albedo', 'ao'], share: 0 }, label: 'V1 painted loft' },
  v2: { face: true, tex: { source: 'rules', layers: ALL_MAPS, share: 0, upgrade: true }, label: 'V2 mapped loft' },
  v3: { face: true, tex: { source: 'field', layers: ALL_MAPS, share: 0, upgrade: true }, label: 'V3 B baked onto A' },
  v4: { face: true, tex: { source: 'rules', layers: ALL_MAPS, share: 0.6, upgrade: true }, label: 'V4 sculpted + mapped' },
  v5: { face: true, label: 'V5 flesh-lite, painted' },
  v6: { face: true, label: 'V6 flesh hero, painted' },
  v7: { face: true, tex: { source: 'rules', layers: ALL_MAPS, share: 0, upgrade: true }, label: 'V7 flesh-wrapped loft + V2 maps' },
};
export const BODY_STYLE_KEYS = Object.keys(STYLE_SPECS);
/** The style fighters are drawn in unless a look says otherwise: V7. ('lofted', the plain loft, is the old default and the placeholder while V7 is built.) */
export const DEFAULT_BODY_STYLE = 'v7';

/** What a style does beyond the mesh (see STYLE_SPECS); an unknown style does nothing more (the plain loft's). */
export const styleSpec = (style) => STYLE_SPECS[style] ?? STYLE_SPECS.lofted;

/** The refined flesh field (B's anatomy with round two's corrections) for a body: a signed distance of a bind-pose point. */
export const refinedField = (body) => fleshField(fleshAnatomy(body, { refined: true }));
/** The same field's large forms only (no ribs, spine knobs or ab blocks: the maps draw those): what V7's low-polygon skin is wrapped onto. */
export const coarseField = (body) => fleshField(fleshAnatomy(body, { refined: true, coarse: true }));

// Built skins kept for the next fighter with the same body (a restart, a mirror bout, the same man of a cast): by style and inputs
// (a body is made from its inputs alone), the most recently used last. A fighter takes his own copy of the positions (his dents move them).
const MESHES = new Map();
export const SKIN_MESH_CACHE = { limit: 24, map: MESHES };
const meshKey = (body, style) => `${style}|${JSON.stringify(body.inputs)}`;
/** A body's built skin in a style, if one is kept (shared: copy the positions before moving them). */
export function cachedSkinMesh(body, style) {
  const key = meshKey(body, style);
  const found = MESHES.get(key);
  if (!found) return null;
  MESHES.delete(key);
  MESHES.set(key, found);
  return found;
}
export function storeSkinMesh(body, style, built) {
  MESHES.set(meshKey(body, style), built);
  while (MESHES.size > SKIN_MESH_CACHE.limit) MESHES.delete(MESHES.keys().next().value);
}

/** The skin mesh of a body in a style (an unknown key is the fine field, as before). */
export function buildSkinMesh(body, style) {
  return runSteps(buildSkinMeshSteps(body, style));
}

/**
 * The same as slices of work (a generator: each `yield` a place to hand the thread back, the mesh its return value): V7 yields
 * through its loft and its wrap; every other style is built in one go. Under armour V7 leaves out the skin the armour covers
 * (loftbody.js `hideCovered`) and is not wrapped (the field is not even made).
 */
export function* buildSkinMeshSteps(body, style) {
  if (style === 'v7') {
    const armoured = Boolean(outfitOf(body.inputs).look.armor);
    return yield* buildLoftBodySteps(body, { sculpt: 'rules', rules: { share: 0, density: 'medium' }, hideCovered: true, ...(armoured ? {} : { wrap: coarseField(body) }) });
  }
  switch (style) {
    case 'lofted': return buildLoftBody(body);
    case 'sculpt': return buildLoftBody(body, { sculpt: true });
    case 'flesh': return buildFleshBody(body);
    case 'detail': return { ...buildLoftBody(body, { sculpt: 'mass' }), detail: buildDetailMap(body) };
    case 'faceted': return buildLoftBody(body, { faceted: true });
    case 'smoothed': return buildBodyMesh(body, 'skin', 0.024, 4);
    case 'v1': case 'v2': case 'v3': return buildLoftBody(body, { sculpt: 'rules', rules: { share: 0, fine: false }, fillet: true });
    case 'v4': return buildLoftBody(body, { sculpt: 'rules', rules: { share: STYLE_SPECS.v4.tex.share, fine: true }, fillet: true });
    case 'v5': return buildFleshBody(body, { cell: 0.012, paint: true, refined: true });
    case 'v6': return buildFleshBody(body, { paint: true, refined: true });
    default: return buildBodyMesh(body, 'skin');
  }
}

/** The slices of work that make a style's maps for a built body (see skintex.js). */
function stepsFor(body, style, built) {
  const spec = styleSpec(style).tex;
  return skinTextureSteps(body, { mesh: built, source: spec.source, field: spec.source === 'field' ? refinedField(body) : null, layers: spec.layers, share: spec.share, covered: coverOf(built) });
}

/** A built body's maps made now, not looked up or kept (the skin worker's: it hands them over). */
export function makeSkinTextures(body, style, built) {
  if (!styleSpec(style).tex || !built.uvs) return null;
  return runSteps(stepsFor(body, style, built));
}

/** What a built body leaves out under armour (its maps leave it blank too), or null. */
const coverOf = (built) => (built.hiddenTriangles ? built.covered : null);

/** The cache key of a built body's maps. */
export const skinTextureKey = (body, style, built) => compositionKey(body, style, coverOf(built));

/** A built body's maps if its bucket's are made (or it has none to make: true), without making them. */
export function readySkinTextures(body, style, built) {
  if (!styleSpec(style).tex || !built.uvs) return true;
  return cachedSkinTextures(skinTextureKey(body, style, built));
}

/** The slices of work that make a built body's maps and store them (a generator; its value the maps). */
export function* skinTexturesSteps(body, style, built) {
  const textures = yield* stepsFor(body, style, built);
  storeSkinTextures(skinTextureKey(body, style, built), textures);
  return textures;
}

/**
 * The maps a built body of a textured style wants (null for a style without): from the cache if its composition bucket has been
 * made, else made now, a few milliseconds at a time (`sliceMs`), handing the thread back between slices.
 * @returns { textures, ms, report: { key, cached, bytes } } or null
 */
export async function skinTextures(body, style, built, { sliceMs = SKINTEX.sliceMs } = {}) {
  if (!styleSpec(style).tex || !built.uvs) return null;
  const key = skinTextureKey(body, style, built);
  const cached = cachedSkinTextures(key);
  if (cached) return { textures: cached, ms: 0, report: { key, cached: true, bytes: cached.bytes } };
  const start = performance.now();
  const textures = await runSkinTexturesAsync(stepsFor(body, style, built), sliceMs);
  storeSkinTextures(key, textures);
  return { textures, ms: performance.now() - start, report: { key, cached: false, bytes: textures.bytes } };
}

/** The same, all at once (a fighter built at load, a tool, a test): the maps, or null. */
export function skinTexturesNow(body, style, built) {
  if (!styleSpec(style).tex || !built.uvs) return null;
  const key = skinTextureKey(body, style, built);
  const cached = cachedSkinTextures(key);
  if (cached) return cached;
  const textures = runSkinTextures(stepsFor(body, style, built));
  storeSkinTextures(key, textures);
  return textures;
}
