// The detail maps' textures and materials (detailmaps.js says what they are and who carries them): each baked tile's WebP images
// (detailmaps-data.js, from tools/blender) decoded once into repeating textures, and the materials that wear them: an armour's
// metal (render.js skinParts: the mail and the lamellae drawn apart from the rest of the steel) and the castle's stone
// (levelmode/kittex.js). A texture is handed to a material only once its picture is decoded (a few milliseconds after the page
// starts: `preloadDetailMaps`), so nothing is ever drawn with an empty normal map.

/* global THREE */
import { DETAIL_MAP_DATA } from './detailmaps-data.js';
import { DETAIL_MAPS } from './detailmaps.js';

const detailTextureCache = new Map();

/** A baked tile's textures ({ map, normalMap, ormMap, mean, size, ready, waiting }), made once; null when the maps are off. */
export function bakedTileTextures(name) {
  if (!DETAIL_MAPS.on || !DETAIL_MAP_DATA[name] || typeof THREE === 'undefined' || typeof Image === 'undefined') return null;
  let entry = detailTextureCache.get(name);
  if (entry) return entry;
  const data = DETAIL_MAP_DATA[name];
  entry = { mean: data.mean, size: data.size, ready: false, waiting: [] };
  let pending = 3;
  const make = (key) => {
    const image = new Image();
    const texture = new THREE.Texture(image);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    image.onload = () => {
      texture.needsUpdate = true;
      pending -= 1;
      if (pending) return;
      entry.ready = true;
      for (const then of entry.waiting.splice(0)) then(entry);
    };
    image.src = `data:image/webp;base64,${data[key]}`;
    return texture;
  };
  Object.assign(entry, { map: make('albedo'), normalMap: make('normal'), ormMap: make('orm') });
  detailTextureCache.set(name, entry);
  return entry;
}

/**
 * Start decoding the armour's tiles now (the page's start), so they are ready before the first man who wears them. The castle's
 * (2048² each, some 60 MB of GPU memory apiece with their mipmaps) are decoded only when a stage makes its materials: until then
 * they take no memory, and for the few frames until they are decoded the stone wears its own painted texture.
 */
export function preloadDetailMaps(names = ['mail', 'lamellae']) {
  for (const name of names) bakedTileTextures(name);
}

/** Do `then(entry)` once a tile's pictures are decoded (now, if they are). */
function whenDetailReady(entry, then) {
  if (entry.ready) then(entry);
  else entry.waiting.push(then);
}

/**
 * An armour's metal wearing a tile's maps: `material` (the fighter's own steel material, render.js) takes the base colour (times
 * the kit's vertex colours), the normal map, and roughness, metalness and occlusion from the ORM map (absolute: its factors set to
 * 1). `lace` (a THREE.Color): the tile's albedo alpha is where the lacing is, drawn in that colour, not the steel's. `matte`: not
 * metal (leather, horn): the metalness map is not read.
 */
export function armourDetailMaterial(material, name, { lace = null, matte = false } = {}) {
  const entry = bakedTileTextures(name);
  if (!entry) return material;
  whenDetailReady(entry, () => {
    Object.assign(material, { map: entry.map, normalMap: entry.normalMap, roughnessMap: entry.ormMap, metalnessMap: matte ? null : entry.ormMap, aoMap: entry.ormMap, roughness: 1, metalness: matte ? 0 : 1 });
    material.needsUpdate = true;
  });
  if (lace) {
    const uniform = { value: lace.clone() };
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uDetailLace = uniform;
      shader.fragmentShader = `uniform vec3 uDetailLace;\n${shader.fragmentShader}`.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n#ifdef USE_MAP\n  diffuseColor.rgb = mix(diffuseColor.rgb, uDetailLace * texelColor.rgb, texelColor.a);\n  diffuseColor.a = opacity;\n#endif',
      );
    };
    material.customProgramCacheKey = () => 'detail-lace';
  }
  return material;
}

/**
 * The castle's stone wearing a tile's maps (kittex.js): the base colour (its mean kept for the kit's blend), the normal map, the
 * roughness from the ORM map's green. Returns whether it took them (false: the maps are off, or there is no such tile).
 */
export function stoneDetailMaps(material, name) {
  const entry = bakedTileTextures(name);
  if (!entry) return false;
  entry.map.kitMean = entry.mean;
  whenDetailReady(entry, () => {
    const repeat = material.map ? material.map.repeat.clone() : null;
    Object.assign(material, { map: entry.map, normalMap: entry.normalMap, roughnessMap: entry.ormMap });
    if (repeat) entry.map.repeat.copy(repeat);
    material.needsUpdate = true;
  });
  return true;
}
