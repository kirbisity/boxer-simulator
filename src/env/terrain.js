// The land of an open-air place (src/env/): one height function from the place's description, flat at y = 0 over
// the fighting floor and rising or falling from its edge with no step, drawn as one disc out to the far ranges and
// shaded by the sun it would really get (its own hills' shadows baked, the clouds' moving over it). The near land's
// height, shade and cover are also baked to one texture (the "near map") that the ground shader and the grass read,
// so the grass stands on the ground that is drawn and thins where the ground is worn.

/* global THREE */

import { ENV } from './config.js';
import { envFbm, envValueNoise } from './noise.js';
import { ENV_GLSL, envUniforms } from './air.js';

const envSmooth = (from, to, value) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/**
 * The land's height function for a place: `terrain` (PLACE_ENV's), `keepOut` [halfX, halfZ] the flat ground.
 * Returns (x, z) -> y. Zero, with zero slope, out to keepOut + ENV.terrain.flatMargin.
 */
export function envHeightField(terrain, keepOut) {
  const margin = ENV.terrain.flatMargin;
  const seed = terrain.seed;
  const layers = terrain.layers;
  const fall = terrain.fall ?? null;
  return (x, z) => {
    const outX = Math.max(0, Math.abs(x) - keepOut[0] - margin);
    const outZ = Math.max(0, Math.abs(z) - keepOut[1] - margin);
    const out = Math.hypot(outX, outZ);
    if (out <= 0) return 0;
    let y = 0;
    if (fall) y -= fall.drop * envSmooth(fall.from, fall.to, out);
    for (let index = 0; index < layers.length; index += 1) {
      const layer = layers[index];
      const share = envSmooth(layer.from, layer.full, out);
      if (share <= 0) continue;
      const octaves = layer.length > 200 ? 5 : 3;
      if (layer.shape === 'ridge') y += layer.height * share * envFbm(x / layer.length, z / layer.length, seed + index * 7, octaves, true);
      else y += layer.height * share * (envFbm(x / layer.length, z / layer.length, seed + index * 7, octaves, false) - 0.5) * 2;
    }
    return y;
  };
}

/** Where woods stand, 0..1 at a point: broad stands with gaps, the same for the trees planted and the land's colour. */
export function envWoodsAt(x, z, seed) {
  const broad = envFbm(x / 420, z / 420, seed + 900, 3, false);
  const fine = envValueNoise(x / 60, z / 60, seed + 901);
  return envSmooth(0.44, 0.6, broad * 0.8 + fine * 0.2);
}

/**
 * How much of the sun reaches (x, y, z) past the land itself, 0..1: a ray toward the sun walked in growing steps;
 * the nearest miss, as a share of the distance walked, is the penumbra.
 */
export function envSunPast(height, sun, x, y, z) {
  const { shadowSteps, shadowReach, shadowSoft } = ENV.terrain;
  const flat = Math.hypot(sun[0], sun[2]);
  if (flat < 1e-3) return 1;
  const rise = sun[1] / flat;
  let lit = 1;
  // Steps grow by a constant ratio from 4 m to the reach.
  const ratio = Math.pow(shadowReach / 4, 1 / (shadowSteps - 1));
  let walked = 4;
  for (let step = 0; step < shadowSteps; step += 1) {
    const clear = y + walked * rise - height(x + (sun[0] / flat) * walked, z + (sun[2] / flat) * walked);
    lit = Math.min(lit, 0.5 + clear / (shadowSoft * walked));
    if (lit <= 0) return 0;
    walked *= ratio;
  }
  return Math.min(1, Math.max(0, lit));
}

/**
 * The near map: a square texture over the middle of the place, ENV.terrain.mapHalf m each way.
 *   r: the land's height (m)   g: how tall grass may grow, 0..1 of the place's tallest
 *   b: the sun reaching the ground past hills, trees and buildings, 0..1   a: bare, worn earth, 0..1
 * `shadows`: [{ x, z, radius }] round shadows to lay (tree crowns, already moved to where they fall);
 * `footprints`: [{ x, z, halfX, halfZ }] things standing on the ground that grass does not grow through.
 */
export function envBuildNearMap({ place, height, sun, keepOut, floor, shadows, footprints }) {
  const { mapHalf, mapSize } = ENV.terrain;
  const texel = (2 * mapHalf) / mapSize;
  const values = new Float32Array(mapSize * mapSize * 4);
  // The land's own shadow, on a coarse grid (it is soft and the walk is the dear part), then spread.
  const coarse = mapSize / 8;
  const shade = new Float32Array(coarse * coarse);
  for (let row = 0; row < coarse; row += 1) {
    for (let column = 0; column < coarse; column += 1) {
      const x = ((column + 0.5) / coarse) * 2 * mapHalf - mapHalf;
      const z = ((row + 0.5) / coarse) * 2 * mapHalf - mapHalf;
      shade[row * coarse + column] = envSunPast(height, sun, x, height(x, z) + 0.3, z);
    }
  }
  const shadeAt = (u, v) => {
    const x = Math.min(coarse - 1.001, Math.max(0, u * coarse - 0.5));
    const z = Math.min(coarse - 1.001, Math.max(0, v * coarse - 0.5));
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const fx = x - x0;
    const fz = z - z0;
    const a = shade[z0 * coarse + x0];
    const b = shade[z0 * coarse + x0 + 1];
    const c = shade[(z0 + 1) * coarse + x0];
    const d = shade[(z0 + 1) * coarse + x0 + 1];
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
  };
  const ground = place.ground;
  const grass = place.grass;
  const floorShare = grass.floorHeight / grass.height[1];
  for (let row = 0; row < mapSize; row += 1) {
    const z = (row + 0.5) * texel - mapHalf;
    for (let column = 0; column < mapSize; column += 1) {
      const x = (column + 0.5) * texel - mapHalf;
      const at = (row * mapSize + column) * 4;
      values[at] = height(x, z);
      // The floor is grazed and trodden short; beyond its edge the grass comes up to its height over a few metres.
      const outside = Math.hypot(Math.max(0, Math.abs(x) - floor[0]), Math.max(0, Math.abs(z) - floor[1]));
      const ragged = envValueNoise(x / 2.3, z / 2.3, 77);
      const wild = envSmooth(0.4, 3.6, outside + (ragged - 0.5) * 2.2);
      let tall = floorShare + (1 - floorShare) * wild;
      // Worn earth: the floor's own wear in patches, and the description's tracks.
      const patch = envFbm(x / 5.5, z / 5.5, 78, 3, false);
      let worn = (1 - wild) * envSmooth(0.62 - 0.5 * ground.floor, 0.86 - 0.4 * ground.floor, patch);
      for (const track of ground.worn ?? []) {
        const cos = Math.cos(track.turn);
        const sin = Math.sin(track.turn);
        const along = ((x - track.x) * cos + (z - track.z) * sin) / track.rx;
        const across = (-(x - track.x) * sin + (z - track.z) * cos) / track.rz;
        const inside = 1 - envSmooth(0.55, 1.15, Math.hypot(along, across) + (ragged - 0.5) * 0.5);
        worn = Math.max(worn, inside * track.by * (0.55 + 0.9 * patch));
      }
      worn = Math.min(1, worn);
      tall *= 1 - 0.85 * worn;
      values[at + 1] = tall;
      values[at + 2] = shadeAt((column + 0.5) / mapSize, (row + 0.5) / mapSize);
      values[at + 3] = worn;
    }
  }
  const stamp = (x, z, halfX, halfZ, soft, write) => {
    const c0 = Math.max(0, Math.floor((x - halfX - soft + mapHalf) / texel));
    const c1 = Math.min(mapSize - 1, Math.ceil((x + halfX + soft + mapHalf) / texel));
    const r0 = Math.max(0, Math.floor((z - halfZ - soft + mapHalf) / texel));
    const r1 = Math.min(mapSize - 1, Math.ceil((z + halfZ + soft + mapHalf) / texel));
    for (let row = r0; row <= r1; row += 1) {
      for (let column = c0; column <= c1; column += 1) {
        const px = (column + 0.5) * texel - mapHalf;
        const pz = (row + 0.5) * texel - mapHalf;
        write((row * mapSize + column) * 4, px - x, pz - z);
      }
    }
  };
  // Crowns and roofs between the ground and the sun.
  for (const shadow of shadows) {
    stamp(shadow.x, shadow.z, shadow.radius, shadow.radius, 0, (at, dx, dz) => {
      const inside = 1 - envSmooth(0.45, 1, Math.hypot(dx, dz) / shadow.radius);
      values[at + 2] *= 1 - shadow.depth * inside;
    });
  }
  // What stands on the ground: no grass through it, the earth bare at its foot.
  for (const print of footprints) {
    stamp(print.x, print.z, print.halfX, print.halfZ, 1.2, (at, dx, dz) => {
      const outside = Math.hypot(Math.max(0, Math.abs(dx) - print.halfX), Math.max(0, Math.abs(dz) - print.halfZ));
      const inside = 1 - envSmooth(0, 1.2, outside);
      values[at + 1] *= 1 - inside;
      values[at + 3] = Math.max(values[at + 3], inside * 0.7);
    });
  }
  const half = new Uint16Array(values.length);
  for (let index = 0; index < values.length; index += 1) half[index] = THREE.DataUtils.toHalfFloat(values[index]);
  const texture = new THREE.DataTexture(half, mapSize, mapSize, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

// ---- shared GLSL: the near map and the lighting every env surface uses ------------------------------------------------

/** Reads of the near map, for the ground and the grass: envMap(xz) -> vec4 (see envBuildNearMap), envInMap(xz) -> 0..1. */
export const ENV_GLSL_MAP = /* glsl */ `
uniform sampler2D uEnvMap;
vec4 envMap(vec2 xz) {
  return texture2D(uEnvMap, xz / ${(2 * ENV.terrain.mapHalf).toFixed(1)} + 0.5);
}
float envInMap(vec2 xz) {
  vec2 edge = abs(xz) / ${ENV.terrain.mapHalf.toFixed(1)};
  return 1.0 - smoothstep(0.86, 0.98, max(edge.x, edge.y));
}
// Where grass has gone to straw, 0..1: broad patches, the same for the blades and the ground under them; the
// place's share of straw (uEnvDry) is how much of the noise counts as a patch.
float envDryAt(vec2 xz) {
  float broad = texture2D(uEnvNoise, xz / 620.0).b;
  float fine = texture2D(uEnvNoise, xz / 61.0 + vec2(0.13, 0.57)).a;
  return smoothstep(-0.2, 0.2, broad * 0.6 + fine * 0.4 - 0.75 + 0.5 * uEnvDry);
}`;

/** The renderer's own shadow map, read from an env shader. Vertex: declare, then call with a world position and normal. */
export const ENV_GLSL_SHADOW_VERTEX = /* glsl */ `
#include <common>
#include <shadowmap_pars_vertex>
void envShadowCoords(vec3 world, vec3 worldNormal) {
  vec4 worldPosition = vec4(world, 1.0);
  vec3 transformedNormal = normalize(mat3(viewMatrix) * worldNormal);
  #include <shadowmap_vertex>
}`;
export const ENV_GLSL_SHADOW_FRAGMENT = /* glsl */ `
#include <common>
#include <packing>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>`;

/** The uniforms a material needs for that (with `lights: true`), beside its own. */
export const envShadowUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.lights);

const ENV_TERRAIN_VERTEX = /* glsl */ `
${ENV_GLSL_SHADOW_VERTEX}
attribute float aShade;
attribute float aWoods;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vShade;
varying float vWoods;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normal;
  vShade = aShade;
  vWoods = aWoods;
  envShadowCoords(world.xyz, normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const ENV_TERRAIN_FRAGMENT = /* glsl */ `
${ENV_GLSL_SHADOW_FRAGMENT}
${ENV_GLSL}
${ENV_GLSL_MAP}
uniform vec3 uGrass;
uniform vec3 uDry;
uniform vec3 uSoil;
uniform vec3 uRock;
uniform vec3 uWoodsColour;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vShade;
varying float vWoods;

void main() {
  vec3 normal = normalize(vNormal);
  vec2 xz = vWorld.xz;
  float distance = length(vWorld - cameraPosition);
  float inMap = envInMap(xz);
  vec4 map = envMap(xz);
  float worn = map.a * inMap;
  float shade = mix(vShade, map.b, inMap);

  // The grain of the ground at three sizes; the finest fades before it would shimmer.
  float coarse = texture2D(uEnvNoise, xz / 190.0).a;
  float medium = texture2D(uEnvNoise, xz / 23.0 + vec2(0.4, 0.2)).b;
  float fine = texture2D(uEnvNoise, xz / 2.9).a;
  float near = 1.0 - smoothstep(20.0, 90.0, distance);

  // Grass as it looks from above: its tips' colour, a little shaded by its own depth.
  vec3 grass = mix(uGrass, uDry, envDryAt(xz)) * (0.78 + 0.3 * medium);
  grass *= mix(1.0, 0.82 + 0.36 * fine, near);
  // Under blades that are drawn the ground is in their shade; beyond them it is the grass's own colour.
  grass *= 1.0 - ${(1 - ENV.grass.underShade).toFixed(2)} * sqrt(map.g) * inMap * (1.0 - smoothstep(${(ENV.grass.layers[ENV.grass.layers.length - 1].tile * 0.12).toFixed(1)}, ${(ENV.grass.layers[ENV.grass.layers.length - 1].tile * 0.3).toFixed(1)}, distance));
  vec3 soil = uSoil * (0.72 + 0.5 * mix(medium, fine, 0.5 * near));
  vec3 colour = mix(grass, soil, worn);

  // Woods on the far land: a darker, rougher cover, thinning uphill onto rock.
  float woods = smoothstep(0.35, 0.65, vWoods + (medium - 0.5) * 0.5) * (1.0 - inMap);
  colour = mix(colour, uWoodsColour * (0.7 + 0.6 * medium), woods);

  // Rock where the ground is too steep to hold soil.
  float slope = sqrt(max(1.0 - normal.y * normal.y, 0.0)) / max(normal.y, 0.05);
  float rock = smoothstep(${ENV.terrain.rockFrom.toFixed(2)}, ${ENV.terrain.rockTo.toFixed(2)}, slope + (coarse - 0.5) * 0.3);
  colour = mix(colour, uRock * (0.7 + 0.55 * medium), rock);

  // Snow lies on what is level, first in the lee of the grain.
  float snow = uEnvWet.y * smoothstep(0.25, 0.6, normal.y - 0.45 + (fine - 0.5) * 0.4 * near + 0.5 * uEnvWet.y) * (1.0 - 0.35 * woods);
  colour = mix(colour, vec3(0.9, 0.92, 0.96), snow);

  // Rain: the earth darkens (more than the grass, which sheds it), and water stands in the worn hollows.
  float wet = uEnvWet.x;
  colour *= 1.0 - wet * (1.0 - ${ENV.terrain.wetDarken.toFixed(2)}) * mix(0.35, 1.0, worn);

  float sunShare = shade * envSunShare(vWorld) * getShadowMask();
  float facing = max(dot(normal, uEnvSunDir), 0.0);
  vec3 light = uEnvSunColour * facing * sunShare + mix(uEnvBounce, uEnvSkyLight, 0.5 + 0.5 * normal.y);
  colour *= light;

  vec3 view = normalize(vWorld - cameraPosition);
  float puddle = wet * smoothstep(0.42, 0.6, worn * 0.5 + fine * 0.5 + 0.12 * medium) * near * step(0.97, normal.y);
  float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(-view, normal), 0.0), 5.0);
  vec3 mirrored = envSky(reflect(view, normal));
  colour = mix(colour, mirrored, clamp(fresnel * (puddle + wet * ${ENV.terrain.wetSheen.toFixed(2)} * (0.3 + 0.7 * worn)), 0.0, 1.0));

  colour = envHaze(colour, cameraPosition, vWorld);
  gl_FragColor = vec4(colour, 1.0);
  #include <tonemapping_fragment>
}`;

/**
 * The land's mesh. `height` (x, z) -> y; `sun` the unit direction to it; `place` the description; `map` the near
 * map's uniform ({ value: texture }). The disc's rings grow by a constant ratio; each vertex carries the land's own
 * slope as its normal, the baked sun past the hills, and how wooded it is.
 */
export function envBuildTerrain({ place, height, sun, map }) {
  const { rings, sectors, inner, reach } = ENV.terrain;
  const ratio = Math.pow(reach / inner, 1 / (rings - 1));
  const count = 1 + rings * sectors;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const shade = new Float32Array(count);
  const woods = new Float32Array(count);
  normal[1] = 1;
  shade[0] = 1;
  const seed = place.terrain.seed;
  const woodsFrom = place.trees.length ? Math.min(...place.trees.map((stand) => stand.from)) : Infinity;
  let radius = inner;
  for (let ring = 0; ring < rings; ring += 1) {
    // The slope is measured over about a quad's width, so the shading is as smooth as the mesh.
    const reachOut = Math.max(0.5, radius * 0.03);
    for (let sector = 0; sector < sectors; sector += 1) {
      // Alternate rings are turned half a sector: the triangles are near equilateral and show no spokes.
      const angle = ((sector + (ring % 2) * 0.5) / sectors) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = height(x, z);
      const at = 1 + ring * sectors + sector;
      position[at * 3] = x;
      position[at * 3 + 1] = y;
      position[at * 3 + 2] = z;
      const dx = (height(x + reachOut, z) - height(x - reachOut, z)) / (2 * reachOut);
      const dz = (height(x, z + reachOut) - height(x, z - reachOut)) / (2 * reachOut);
      const length = Math.hypot(dx, 1, dz);
      normal[at * 3] = -dx / length;
      normal[at * 3 + 1] = 1 / length;
      normal[at * 3 + 2] = -dz / length;
      shade[at] = envSunPast(height, sun, x, y + 0.3, z);
      woods[at] = radius > woodsFrom ? place.woods.cover * envWoodsAt(x, z, seed) * envSmooth(woodsFrom, woodsFrom * 2.5, radius) : 0;
    }
    radius *= ratio;
  }
  const index = new Uint32Array(sectors * 3 + (rings - 1) * sectors * 6);
  let at = 0;
  for (let sector = 0; sector < sectors; sector += 1) {
    index[at++] = 0;
    index[at++] = 1 + ((sector + 1) % sectors);
    index[at++] = 1 + sector;
  }
  for (let ring = 0; ring < rings - 1; ring += 1) {
    for (let sector = 0; sector < sectors; sector += 1) {
      const next = (sector + 1) % sectors;
      const a = 1 + ring * sectors + sector;
      const b = 1 + ring * sectors + next;
      const c = 1 + (ring + 1) * sectors + sector;
      const d = 1 + (ring + 1) * sectors + next;
      // The outer ring is turned half a sector one way or the other; the diagonal follows it.
      if (ring % 2 === 0) {
        index[at++] = a; index[at++] = b; index[at++] = c;
        index[at++] = b; index[at++] = d; index[at++] = c;
      } else {
        index[at++] = a; index[at++] = d; index[at++] = c;
        index[at++] = a; index[at++] = b; index[at++] = d;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
  geometry.setAttribute('aWoods', new THREE.BufferAttribute(woods, 1));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingSphere();
  const ground = place.ground;
  const material = new THREE.ShaderMaterial({
    vertexShader: ENV_TERRAIN_VERTEX,
    fragmentShader: ENV_TERRAIN_FRAGMENT,
    uniforms: {
      ...envShadowUniforms(),
      ...envUniforms(),
      uEnvMap: map,
      uGrass: { value: new THREE.Color(ground.grass) },
      uDry: { value: new THREE.Color(ground.dry) },
      uSoil: { value: new THREE.Color(ground.soil) },
      uRock: { value: new THREE.Color(ground.rock) },
      uWoodsColour: { value: new THREE.Color(place.woods.colour) },
    },
    lights: true,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.userData.env = 'terrain';
  return mesh;
}
