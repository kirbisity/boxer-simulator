// The detail maps' textures and materials (detailmaps.js says what they are and who carries them): each baked tile's WebP images
// (detailmaps-data.js, from tools/blender) decoded once into repeating textures shared by everything that wears the tile, and the
// materials that wear them: an armour's metal (render.js skinParts, oyoroi.js), the castle's stone, timber and paving
// (levelmode/kittex.js), the places' grounds (ground/painted.js, as its layers), and every outfit's cloth and organics (the
// cloth atlas, clothmaps-data.js: a fighter's garments, render.js skinParts; his hat and shoes, wardrobe.js). A texture is made at once with a tiny
// picture of the tile's mean (so nothing is ever drawn with an empty map, and no program is compiled twice) and takes the real
// picture when it is decoded, a few milliseconds later. Only the tiles something wears are decoded and sent to the GPU.

/* global THREE */
import { DETAIL_MAP_DATA } from './detailmaps-data.js';
import { CLOTH_BAND, DETAIL_ARMOUR, DETAIL_MAPS, clothFamilyOf, tileSize } from './detailmaps.js';
import { CLOTH_MAP_DATA } from './clothmaps-data.js';

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
 * A geometry's metres per unit of its own texture coordinates, round (u) and up (v): each triangle's stretch, weighted by its
 * area (so a sphere's, a lathe's, a shape's or a box's coordinates all come out in metres alike). At most `most` triangles read.
 */
export function uvMetres(geometry, most = 4000) {
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const index = geometry.index;
  const count = index ? index.count / 3 : position.count / 3;
  const step = Math.max(1, Math.floor(count / most));
  const corner = (triangle, k) => (index ? index.getX(triangle * 3 + k) : triangle * 3 + k);
  let u = 0;
  let v = 0;
  let total = 0;
  for (let triangle = 0; triangle < count; triangle += step) {
    const [a, b, c] = [0, 1, 2].map((k) => corner(triangle, k));
    const at = (vertex) => [position.getX(vertex), position.getY(vertex), position.getZ(vertex)];
    const [pa, pb, pc] = [at(a), at(b), at(c)];
    const e1 = [0, 1, 2].map((axis) => pb[axis] - pa[axis]);
    const e2 = [0, 1, 2].map((axis) => pc[axis] - pa[axis]);
    const d1 = [uv.getX(b) - uv.getX(a), uv.getY(b) - uv.getY(a)];
    const d2 = [uv.getX(c) - uv.getX(a), uv.getY(c) - uv.getY(a)];
    const det = d1[0] * d2[1] - d2[0] * d1[1];
    if (Math.abs(det) < 1e-12) continue;
    const tu = e1.map((value, axis) => (value * d2[1] - e2[axis] * d1[1]) / det);
    const tv = e1.map((value, axis) => (e2[axis] * d1[0] - value * d2[0]) / det);
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const area = Math.hypot(...cross) / 2;
    u += Math.hypot(...tu) * area;
    v += Math.hypot(...tv) * area;
    total += area;
  }
  return total > 0 ? [u / total, v / total] : [0, 0];
}

/**
 * A built piece (a helmet, a machine's shells) wearing an armour tile at its real size: every mesh under `root` of metal
 * (metalness 0.3 or more), or with `moulded` every opaque one, or only those of the materials in `only`, has its material
 * copied once per size with the tile's maps repeated over its own texture coordinates (uvMetres) to the tile's metres
 * (detailmaps.js tileSize). Meshes that already wear a normal map, see-through ones and unlit ones are left as they are. The
 * textures are the shared ones; only the materials (a repeat each) are new. `part`: only the meshes marked `userData.helmPart`
 * so (a helmet's aventail). `rows`: a laced tile's rows of plates over each mesh's height (a tier of the aventail: one row),
 * not its real height. `cords`: a laced tile's masks drawn in those colours (armourDetailMaterial).
 */
export function wearTile(root, name, { moulded = false, only = null, part = null, rows = null, cords = null } = {}) {
  if (!bakedTileTextures(name)) return;
  const [round, up] = tileSize(name);
  const made = new Map();
  root.traverse((object) => {
    const material = object.material;
    if (!object.isMesh || object.userData.outline || Array.isArray(material) || !material || !object.geometry?.attributes?.uv) return;
    if (part && object.userData.helmPart !== part) return;
    if (material.normalMap || material.userData?.clothProp || material.transparent || material.isMeshBasicMaterial || material.isShaderMaterial || material.side === THREE.BackSide) return;
    if (only ? !only.has(material) : !moulded && !((material.metalness ?? 0) >= 0.3)) return;
    const [mu, mv] = uvMetres(object.geometry);
    if (!(mu > 0 && mv > 0)) return;
    const scale = Math.cbrt(Math.abs(object.scale.x * object.scale.y * object.scale.z)) || 1;
    const upward = rows ? rows / (DETAIL_ARMOUR[name]?.rows ?? 1) : Math.max(0.25, (mv * scale) / up);
    const repeat = [Math.max(1, Math.round((mu * scale) / round)), upward];
    const key = `${material.uuid}|${repeat[0]}|${repeat[1].toFixed(2)}`;
    if (!made.has(key)) made.set(key, armourDetailMaterial(material.clone(), name, { repeat, cords, metalness: material.metalness ?? 1 }));
    object.material = made.get(key);
  });
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

// ---- Cloth ------------------------------------------------------------------------------------------------------------------

let clothAtlas = null;

/**
 * The cloth atlas (clothmaps-data.js: every textile and organic tile in one RGBA picture, detailmaps.js CLOTH_FAMILIES), one
 * texture for every fighter: a stand-in of flat cloth until it is decoded. Null when the maps are off (or no browser).
 */
export function clothAtlasTexture() {
  if (!DETAIL_MAPS.on || typeof THREE === 'undefined' || typeof Image === 'undefined' || typeof document === 'undefined') return null;
  if (clothAtlas) return clothAtlas;
  const [width, height] = CLOTH_MAP_DATA.size;
  clothAtlas = new THREE.Texture(standIn([128, 128, 224, 217]));
  // The shader wraps each cell itself (its padding takes the mipmaps' spread); the atlas is not repeated.
  clothAtlas.wrapS = THREE.ClampToEdgeWrapping;
  clothAtlas.wrapT = THREE.ClampToEdgeWrapping;
  clothAtlas.anisotropy = 8;
  clothAtlas.needsUpdate = true;
  const image = new Image();
  image.onload = () => {
    clothAtlas.image = image;
    clothAtlas.needsUpdate = true;
  };
  image.src = `data:image/webp;base64,${CLOTH_MAP_DATA.atlas}`;
  DETAIL_MAP_MEMORY.cloth = Math.round((width * height * 4 * 4) / 3);
  return clothAtlas;
}

// How far the detail is drawn: past this mipmap level of a cell (its tile then a few dozen pixels across the screen) the relief
// fades to the cell's mean, so the coarse levels, where the cells' paddings run out, are never read for relief.
// (From the level at which a cell's padding is one pixel: log2 of the padding.)
const CLOTH_FADE = [Math.log2(CLOTH_MAP_DATA.pad), Math.log2(CLOTH_MAP_DATA.pad) + 1.5];

/**
 * A fighter's cloth wearing the atlas: `material` (the look's own skin material, MeshStandard, Toon or Phong, vertex-coloured)
 * takes each face's tile by the cell its texture coordinates name (detailmaps.js clothUvAt): the relief as its normals, the
 * fibre's shade (over the cell's mean, so the outfit's colour is kept on average) times its colour, and the roughness. A tile
 * is read with the gradients of the unwrapped coordinates, so the wrap at a tile's edge is seamless; far off the relief fades
 * to the cell's mean. Returns the material (unchanged where the maps are off or the material cannot take a normal map).
 */
export function clothDetailMaterial(material) {
  const atlas = clothAtlasTexture();
  if (!atlas || !(material.isMeshStandardMaterial || material.isMeshToonMaterial || material.isMeshPhongMaterial)) return material;
  const { grid, cell, pad, means } = CLOTH_MAP_DATA;
  const cells = grid * grid;
  const meanValues = Array.from({ length: cells }, (_, index) => new THREE.Vector2(...(means[index] ?? [0.9, 0.6])));
  material.normalMap = atlas;
  if (material.isMeshStandardMaterial) material.roughness = 1;
  const inner = (cell - 2 * pad) / cell;
  const f = (value) => value.toFixed(6);
  const uniforms = { uClothMeans: { value: meanValues } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `uniform vec2 uClothMeans[${cells}];\nvarying vec2 vClothMean;\n${shader.vertexShader}`.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
  vec2 clothBandV = floor(uv / ${f(CLOTH_BAND)});
  int clothIndex = int(clamp(-clothBandV.x - 1.0 + ${f(grid)} * clothBandV.y, 0.0, ${f(cells - 1)}));
  vClothMean = uClothMeans[clothIndex];`,
    );
    shader.fragmentShader = `varying vec2 vClothMean;\n${shader.fragmentShader}`
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  vec2 clothBand = floor(vUv / ${f(CLOTH_BAND)});
  vec2 clothAt = (vec2(-clothBand.x - 1.0, clothBand.y) + ${f(pad / cell)} + fract(vUv) * ${f(inner)}) / ${f(grid)};
  vec2 clothDx = dFdx(vUv) * ${f(inner / grid)};
  vec2 clothDy = dFdy(vUv) * ${f(inner / grid)};
#if __VERSION__ >= 300
  vec4 clothTexel = textureGrad(normalMap, clothAt, clothDx, clothDy);
#else
  vec4 clothTexel = texture2D(normalMap, clothAt);
#endif
  float clothLevel = log2(max(max(length(dFdx(vUv)), length(dFdy(vUv))) * ${f(cell - 2 * pad)}, 1e-6));
  float clothNear = 1.0 - smoothstep(${f(CLOTH_FADE[0])}, ${f(CLOTH_FADE[1])}, clothLevel);
  diffuseColor.rgb *= mix(1.0, clothTexel.b / max(vClothMean.x, 0.05), clothNear);`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(vClothMean.y, clothTexel.a, clothNear);')
      .replace(
        '#include <normal_fragment_maps>',
        `vec3 clothN = vec3((clothTexel.xy * 2.0 - 1.0) * normalScale * clothNear, 0.0);
  clothN.z = sqrt(max(0.0, 1.0 - dot(clothN.xy, clothN.xy)));
  normal = perturbNormal2Arb(-vViewPosition, normal, clothN, faceDirection);`,
      );
  };
  material.customProgramCacheKey = () => 'cloth-atlas';
  material.needsUpdate = true;
  return material;
}

/**
 * A rigid piece worn (a hat, a shoe: wardrobe.js) wearing a material's tile of the cloth atlas without texture coordinates of
 * its own: projected three ways over the piece in its own metres (its mesh's scale taken in, so a stretched sphere of a shoe
 * reads in true size), the three blended by the surface's facing; the relief as normals, the shade and the roughness as on a
 * body's cloth (clothDetailMaterial). `material`: a CLOTH_MATERIALS key; none, or the maps off: the material as it was. A
 * material is fitted once (it may be shared by several meshes of the piece).
 */
export function clothPropMaterial(target, material) {
  const spec = clothFamilyOf(material);
  const atlas = spec ? clothAtlasTexture() : null;
  // (A piece already wearing a tile, a metal one or this, is left as it is.)
  if (!atlas || !target || target.userData?.clothProp || target.normalMap || target.onBeforeCompile?.toString().includes('uDetail') || !(target.isMeshStandardMaterial || target.isMeshToonMaterial || target.isMeshPhongMaterial || target.isMeshLambertMaterial)) return target;
  const { grid, cell, pad, means } = CLOTH_MAP_DATA;
  const inner = (cell - 2 * pad) / cell;
  const f = (value) => value.toFixed(6);
  const uniforms = {
    uClothAtlas: { value: atlas },
    uClothCell: { value: new THREE.Vector2(spec.cell % grid, Math.floor(spec.cell / grid)) },
    uClothMean: { value: new THREE.Vector2(...(means[spec.cell] ?? [0.9, 0.6])) },
    uClothTile: { value: spec.metres * spec.scale },
  };
  target.userData.clothProp = material;
  if (target.isMeshStandardMaterial) target.roughness = 1;
  const normals = !target.isMeshLambertMaterial;
  target.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `uniform float uClothTile;\nvarying vec3 vClothP;\nvarying vec3 vClothN;\nvarying vec3 vClothAx0;\nvarying vec3 vClothAx1;\nvarying vec3 vClothAx2;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
  vec3 clothScale = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
  vClothP = position * clothScale / uClothTile;
  vClothN = normalize(normal / clothScale);
  vClothAx0 = normalize(mat3(modelViewMatrix) * vec3(1.0, 0.0, 0.0));
  vClothAx1 = normalize(mat3(modelViewMatrix) * vec3(0.0, 1.0, 0.0));
  vClothAx2 = normalize(mat3(modelViewMatrix) * vec3(0.0, 0.0, 1.0));`,
    );
    shader.fragmentShader = `uniform sampler2D uClothAtlas;
uniform vec2 uClothCell;
uniform vec2 uClothMean;
varying vec3 vClothP;
varying vec3 vClothN;
varying vec3 vClothAx0;
varying vec3 vClothAx1;
varying vec3 vClothAx2;
vec4 clothRead(vec2 p) {
  vec2 at = (uClothCell + ${f(pad / cell)} + fract(p) * ${f(inner)}) / ${f(grid)};
#if __VERSION__ >= 300
  return textureGrad(uClothAtlas, at, dFdx(p) * ${f(inner / grid)}, dFdy(p) * ${f(inner / grid)});
#else
  return texture2D(uClothAtlas, at);
#endif
}
${shader.fragmentShader}`
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  vec3 clothW = pow(abs(normalize(vClothN)), vec3(4.0));
  clothW /= max(clothW.x + clothW.y + clothW.z, 1e-4);
  vec4 clothX = clothRead(vClothP.zy);
  vec4 clothY = clothRead(vClothP.xz);
  vec4 clothZ = clothRead(vClothP.xy);
  float clothLevel = log2(max(max(length(dFdx(vClothP)), length(dFdy(vClothP))) * ${f(cell - 2 * pad)}, 1e-6));
  float clothNear = 1.0 - smoothstep(${f(CLOTH_FADE[0])}, ${f(CLOTH_FADE[1])}, clothLevel);
  vec4 clothTexel = clothX * clothW.x + clothY * clothW.y + clothZ * clothW.z;
  diffuseColor.rgb *= mix(1.0, clothTexel.b / max(uClothMean.x, 0.05), clothNear);`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(uClothMean.y, clothTexel.a, clothNear);')
      .replace(
        '#include <normal_fragment_maps>',
        normals
          ? `#include <normal_fragment_maps>
  {
    vec2 nx = (clothX.xy * 2.0 - 1.0) * clothNear;
    vec2 ny = (clothY.xy * 2.0 - 1.0) * clothNear;
    vec2 nz = (clothZ.xy * 2.0 - 1.0) * clothNear;
    vec3 bent = (vClothAx2 * nx.x + vClothAx1 * nx.y) * clothW.x + (vClothAx0 * ny.x + vClothAx2 * ny.y) * clothW.y + (vClothAx0 * nz.x + vClothAx1 * nz.y) * clothW.z;
    normal = normalize(normal + bent);
  }`
          : '#include <normal_fragment_maps>',
      );
  };
  target.customProgramCacheKey = () => `cloth-prop-${normals}`;
  target.needsUpdate = true;
  return target;
}
