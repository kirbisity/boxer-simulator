// The detail maps' textures and materials (detailmaps.js says what they are and who carries them): each baked tile's WebP images
// (detailmaps-data.js, from tools/blender) decoded once into repeating textures shared by everything that wears the tile, and the
// materials that wear them: an armour's metal (render.js skinParts, oyoroi.js), the castle's stone, timber and paving
// (levelmode/kittex.js), and the places' grounds (ground/painted.js, as its layers). A texture is made at once with a tiny
// picture of the tile's mean (so nothing is ever drawn with an empty map, and no program is compiled twice) and takes the real
// picture when it is decoded, a few milliseconds later. Only the tiles something wears are decoded and sent to the GPU.

/* global THREE */
import { DETAIL_MAP_DATA } from './detailmaps-data.js';
import { DETAIL_MAPS } from './detailmaps.js';

const detailTextureCache = new Map();
/** What the GPU holds of the tiles in use (bytes, RGBA8 with mipmaps), by tile. */
export const DETAIL_MAP_MEMORY = {};

/** A 4 x 4 picture of one colour (0..255 RGBA), the stand-in until the tile is decoded. */
function standIn(rgba) {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 4;
  const g = canvas.getContext('2d');
  g.fillStyle = `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3] / 255})`;
  g.fillRect(0, 0, 4, 4);
  return canvas;
}

/**
 * A baked tile's textures ({ map, normalMap, ormMap (armour only), mean, size, metres, kind }), made once and shared; null when the
 * maps are off or there is no such tile (or no browser: the tests).
 */
export function bakedTileTextures(name) {
  if (!DETAIL_MAPS.on || !DETAIL_MAP_DATA[name] || typeof THREE === 'undefined' || typeof Image === 'undefined' || typeof document === 'undefined') return null;
  let entry = detailTextureCache.get(name);
  if (entry) return entry;
  const data = DETAIL_MAP_DATA[name];
  const mean = data.mean.map((value) => Math.round(value * 255));
  const ground = data.kind === 'ground';
  entry = { kind: data.kind, mean: data.mean, size: data.size, metres: data.metres ?? null };
  const make = (key, rgba, scale = 1) => {
    const texture = new THREE.Texture(standIn(rgba));
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    const image = new Image();
    image.onload = () => {
      texture.image = image;
      texture.needsUpdate = true;
    };
    image.src = `data:image/webp;base64,${data[key]}`;
    DETAIL_MAP_MEMORY[name] = (DETAIL_MAP_MEMORY[name] ?? 0) + Math.round(data.size[0] * data.size[1] * scale * scale * 4 * 4 / 3);
    return texture;
  };
  entry.map = make('albedo', [...mean, ground ? 230 : 0]);
  entry.normalMap = make('normal', [128, 128, 255, ground ? 128 : 0]);
  if (data.orm) entry.ormMap = make('orm', [255, 120, 255, 255], 0.5);
  detailTextureCache.set(name, entry);
  return entry;
}

/** Start decoding the armour's tiles now (the page's start), so they are ready before the first man who wears them. */
export function preloadDetailMaps(names = ['mail', 'lamellae', 'kozane', 'plate']) {
  for (const name of names) bakedTileTextures(name);
}

/**
 * An armour's metal wearing a tile's maps: `material` (a MeshStandardMaterial: the fighter's own steel, render.js; a laced panel,
 * oyoroi.js) takes the base colour (times its colour and vertex colours), the normal map, and roughness, metalness and occlusion
 * from the ORM map (roughness absolute, metalness times `metalness`: lacquer over iron is less of a mirror; `matte`, leather or
 * horn, none). `cords` ([suspension, binding] THREE.Colors): a laced tile's two masks (its albedo's and its normal map's alpha)
 * are drawn in those colours, not the plates'. `repeat` ([u, v]): the tile read that many times over the geometry's own 0..1
 * coordinates (a piece built with plain UVs), in the shader, so the shared textures keep one transform.
 */
export function armourDetailMaterial(material, name, { cords = null, matte = false, metalness = 1, repeat = null } = {}) {
  const entry = bakedTileTextures(name);
  if (!entry) return material;
  Object.assign(material, {
    map: entry.map, normalMap: entry.normalMap, roughnessMap: entry.ormMap, metalnessMap: matte ? null : entry.ormMap,
    aoMap: repeat ? null : entry.ormMap, roughness: 1, metalness: matte ? 0 : metalness,
  });
  if (!cords && !repeat) return material;
  const uniforms = {
    uDetailCordA: { value: (cords?.[0] ?? new THREE.Color(1, 1, 1)).clone() },
    uDetailCordB: { value: (cords?.[1] ?? cords?.[0] ?? new THREE.Color(1, 1, 1)).clone() },
    uDetailRepeat: { value: new THREE.Vector2(...(repeat ?? [1, 1])) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (repeat) shader.vertexShader = `uniform vec2 uDetailRepeat;\n${shader.vertexShader}`.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_UV\n  vUv *= uDetailRepeat;\n#endif');
    if (cords) {
      shader.fragmentShader = `uniform vec3 uDetailCordA;\nuniform vec3 uDetailCordB;\n${shader.fragmentShader}`.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
#if defined( USE_MAP ) && defined( USE_NORMALMAP )
  float detailCordB = texture2D(normalMap, vUv).a;
  diffuseColor.rgb = mix(diffuseColor.rgb, uDetailCordA * texelColor.rgb, texelColor.a);
  diffuseColor.rgb = mix(diffuseColor.rgb, uDetailCordB * texelColor.rgb, detailCordB);
  diffuseColor.a = opacity;
#endif`,
      );
    }
  };
  material.customProgramCacheKey = () => `detail-${cords ? 'cords' : ''}-${repeat ? 'repeat' : ''}`;
  return material;
}

/**
 * The castle's surfaces wearing a ground tile (kittex.js): its colour (its mean kept for the kit's blend; its alpha is the
 * roughness, read by kittex's patch), its normal map, tiling over the tile's own metres (the kit's UVs are in metres). Returns
 * whether it took them (false: the maps are off, or there is no such tile).
 */
export function stoneDetailMaps(material, name) {
  const entry = bakedTileTextures(name);
  if (!entry) return false;
  entry.map.kitMean = entry.mean;
  entry.map.repeat.set(1 / entry.metres, 1 / entry.metres);
  Object.assign(material, { map: entry.map, normalMap: entry.normalMap, roughnessMap: null });
  material.userData.roughInAlpha = true;
  return true;
}

/**
 * A ground tile as a layer of the painted ground (ground/painted.js: { colour: RGB and roughness, normal: RGB and height, mean,
 * bytes, metres }), or null.
 */
export function groundDetailLayer(name) {
  const entry = bakedTileTextures(name);
  if (!entry) return null;
  return { colour: entry.map, normal: entry.normalMap, mean: entry.mean, bytes: DETAIL_MAP_MEMORY[name] ?? 0, metres: entry.metres, baked: name };
}
