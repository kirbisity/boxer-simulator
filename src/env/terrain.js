// The land of an open-air place (src/env/): one height function from the place's description, flat at y = 0 over
// the fighting floor and rising or falling from its edge with no step, drawn as one disc out to the far ranges and
// shaded by the sun it would really get (its own hills' shadows baked, the clouds' moving over it). The near land's
// height, shade and cover are also baked to one texture (the "near map") that the ground shader and the grass read,
// so the grass stands on the ground that is drawn and thins where the ground is worn.

/* global THREE */

import { ENV } from './config.js';
import { envFbm, envValueNoise } from './noise.js';
import { ENV_GLSL, envUniforms } from './air.js';
import { ENV_GLSL_PRESS, ENV_PRESS, envPressUniforms } from './press.js';
import { ENV_LIE, envLieFieldAt, envLieHeight, envLieRoll } from './lie.js';

const envSmooth = (from, to, value) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/**
 * The land's height function for a place: `terrain` (PLACE_ENV's), `keepOut` [halfX, halfZ] the flat ground.
 * Returns (x, z) -> y. Out to keepOut + ENV.terrain.flatMargin only the fought ground (lie.js), on `field` (the
 * physics's own, envLieOf) where given; beyond it the land rises and falls with no slope where it starts.
 */
export function envHeightField(terrain, keepOut, field = null) {
  const margin = ENV.terrain.flatMargin;
  const layers = terrain.layers;
  const fall = terrain.fall ?? null;
  return (x, z) => {
    // The fought ground (lie.js): the near rolls, gentler, through the floor; on the physics's own field where it has one.
    const fought = (field ? envLieFieldAt(field, x, z) : null) ?? envLieHeight(terrain, x, z) - (field?.base ?? 0);
    const outX = Math.max(0, Math.abs(x) - keepOut[0] - margin);
    const outZ = Math.max(0, Math.abs(z) - keepOut[1] - margin);
    const out = Math.hypot(outX, outZ);
    if (out <= 0) return fought;
    let y = fought;
    if (fall) y -= fall.drop * envSmooth(fall.from, fall.to, out);
    for (let index = 0; index < layers.length; index += 1) {
      const layer = layers[index];
      // (A near roll is already there at ENV_LIE.fought of its height: beyond the floor it grows to the whole of it.)
      const share = layer.from === 0 ? Math.max(0, envSmooth(layer.from, layer.full, out) - ENV_LIE.fought) : envSmooth(layer.from, layer.full, out);
      if (share <= 0) continue;
      y += share * envLieRoll(terrain, layer, index, x, z);
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
 *   b: the sun reaching the ground past the hills, 0..1   a: bare, worn earth, 0..1
 * and beside it (the texture's `envCover`, 8 bits) what stands over the ground:
 *   r: the share of the sky a point of the ground sees   g: how much of the sun the crowns over it take
 * `shadows`: [{ x, z, radius, depth, over }] round shadows to lay (tree crowns, already moved to where they fall;
 * `over`: the crown itself, { x, z, radius }, on one of a tree's shadows);
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
  // How the land is used (ENV.grass.mosaic): one rule over the whole map, the fought ground with the rest.
  const ground = place.ground;
  const grass = place.grass;
  const use = ENV.grass;
  const keptShare = Math.min(1, (grass.kept ?? grass.floorHeight ?? grass.height[1]) / ((grass.height[0] + grass.height[1]) / 2));
  const wear = ground.wear ?? 0;
  // The lawns are where the mosaic's noise is lowest: the level under which `grazed` of the land lies, counted.
  const lawnOf = (x, z) => envFbm(x / use.mosaic, z / use.mosaic, 79, 3, false);
  const counted = [];
  for (let at = 0; at < 2048; at += 1) counted.push(lawnOf(((at * 0.618034) % 1) * 2 * mapHalf - mapHalf, ((at * 0.754878) % 1) * 2 * mapHalf - mapHalf));
  counted.sort((a, b) => a - b);
  const grazed = Math.min(1, Math.max(0, grass.grazed ?? 0));
  const lawnUnder = grazed > 0 ? counted[Math.floor(grazed * (counted.length - 1))] : -1;
  const paths = [];
  for (const path of ground.paths ?? []) {
    for (let at = 1; at < path.points.length; at += 1) {
      const [ax, az] = path.points[at - 1];
      const [bx, bz] = path.points[at];
      paths.push({ ax, az, dx: bx - ax, dz: bz - az, long: (bx - ax) * (bx - ax) + (bz - az) * (bz - az) || 1, half: path.width / 2, by: path.by });
    }
  }
  for (let row = 0; row < mapSize; row += 1) {
    const z = (row + 0.5) * texel - mapHalf;
    for (let column = 0; column < mapSize; column += 1) {
      const x = (column + 0.5) * texel - mapHalf;
      const at = (row * mapSize + column) * 4;
      values[at] = height(x, z);
      const ragged = envValueNoise(x / 2.3, z / 2.3, 77);
      const patch = envFbm(x / 5.5, z / 5.5, 78, 3, false);
      // Where people walk: the yards and the paths, their edges ragged and broken by the ground's own patches.
      let trodden = 0;
      for (const yard of ground.worn ?? []) {
        const cos = Math.cos(yard.turn);
        const sin = Math.sin(yard.turn);
        const along = ((x - yard.x) * cos + (z - yard.z) * sin) / yard.rx;
        const across = (-(x - yard.x) * sin + (z - yard.z) * cos) / yard.rz;
        trodden = Math.max(trodden, yard.by * (1 - envSmooth(0.3, 1.3, Math.hypot(along, across) + (ragged - 0.5) * 0.5 * use.ragged + (patch - 0.5) * use.ragged)));
      }
      for (const path of paths) {
        if (Math.abs(x - path.ax - path.dx / 2) > Math.abs(path.dx) / 2 + 4 * path.half || Math.abs(z - path.az - path.dz / 2) > Math.abs(path.dz) / 2 + 4 * path.half) continue;
        const along = Math.min(1, Math.max(0, ((x - path.ax) * path.dx + (z - path.az) * path.dz) / path.long));
        const off = Math.hypot(x - path.ax - path.dx * along, z - path.az - path.dz * along) / path.half;
        trodden = Math.max(trodden, path.by * (1 - envSmooth(0.45, 1.5, off + (ragged - 0.5) * 2 * use.ragged)));
      }
      // The sward: short in the lawns of the mosaic and where it is trodden, at its height in the rank patches.
      const lawn = Math.max(grazed > 0 ? 1 - envSmooth(lawnUnder - 0.025, lawnUnder + 0.025, lawnOf(x, z)) : 0, Math.min(1, trodden * 1.5));
      let tall = (1 - (1 - keptShare) * lawn) * (1 - 0.45 * trodden);
      // Bare earth: in the ground's own patches, more of them the more the land is worn and trodden.
      // (A desert's `wear` runs past 1: over it no patch of the mosaic is left as sward.)
      const bare = Math.max(Math.min(1, wear + trodden), Math.min(1.5, wear));
      const worn = Math.min(1, envSmooth(0.62 - 0.5 * bare, 0.86 - 0.4 * bare, patch) * (0.4 + 0.6 * envSmooth(0, 0.35, bare)));
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
  // What stands over the ground, kept finer than the map (ENV.shadow.coverFine). r: the share of the sky seen from
  // the ground; g: how deep the crowns' shade lies between the ground and the sun; b: the sun past the trunks; a: how
  // high over the ground the line from there to the sun meets the trunk that shades it (of ENV.shadow.reachMost):
  // a point on that line is in the trunk's shade below that height and sunward of the trunk, in the sun, above it.
  const tune = ENV.shadow;
  const fine = mapSize * tune.coverFine;
  const fineTexel = texel / tune.coverFine;
  const cover = new Uint8Array(fine * fine * 4).fill(255);
  for (let at = 3; at < cover.length; at += 4) cover[at] = 0;
  const stampFine = (x, z, halfX, halfZ, soft, write) => {
    const c0 = Math.max(0, Math.floor((x - halfX - soft + mapHalf) / fineTexel));
    const c1 = Math.min(fine - 1, Math.ceil((x + halfX + soft + mapHalf) / fineTexel));
    const r0 = Math.max(0, Math.floor((z - halfZ - soft + mapHalf) / fineTexel));
    const r1 = Math.min(fine - 1, Math.ceil((z + halfZ + soft + mapHalf) / fineTexel));
    for (let row = r0; row <= r1; row += 1) {
      for (let column = c0; column <= c1; column += 1) write((row * fine + column) * 4, (column + 0.5) * fineTexel - mapHalf - x, (row + 0.5) * fineTexel - mapHalf - z);
    }
  };
  for (const shadow of shadows) {
    if (shadow.half) {
      // A trunk's band: each texel loses the share of it the band covers.
      const ax = shadow.toX - shadow.x;
      const az = shadow.toZ - shadow.z;
      const long = ax * ax + az * az || 1;
      stampFine((shadow.x + shadow.toX) / 2, (shadow.z + shadow.toZ) / 2, Math.abs(ax) / 2 + shadow.half, Math.abs(az) / 2 + shadow.half, fineTexel, (at, dx, dz) => {
        const along = Math.min(1, Math.max(0, ((dx + ax / 2) * ax + (dz + az / 2) * az) / long));
        const off = Math.hypot(dx + ax / 2 - ax * along, dz + az / 2 - az * along);
        const covered = Math.min(1, Math.min(2 * shadow.half, fineTexel) / fineTexel) * Math.min(1, Math.max(0, (shadow.half + fineTexel / 2 - off) / fineTexel));
        cover[at + 2] *= 1 - covered;
        cover[at + 3] = Math.max(cover[at + 3], Math.min(255, (255 * along * (shadow.tall ?? 0)) / tune.reachMost));
      });
      continue;
    }
    const stretch = shadow.stretch ?? 1;
    const [sunX, sunZ] = [shadow.sunX ?? 1, shadow.sunZ ?? 0];
    stampFine(shadow.x, shadow.z, shadow.radius * stretch, shadow.radius * stretch, 0, (at, dx, dz) => {
      const inside = 1 - envSmooth(0.45, 1, Math.hypot(dx * sunZ - dz * sunX, (dx * sunX + dz * sunZ) / stretch) / shadow.radius);
      cover[at + 1] *= 1 - shadow.depth * inside;
    });
    const over = shadow.over;
    if (over) stampFine(over.x, over.z, over.radius, over.radius, 0, (at, dx, dz) => {
      cover[at] *= 1 - (1 - tune.underCrown) * (1 - envSmooth(0.3, 1.1, Math.hypot(dx, dz) / over.radius));
    });
  }
  // What stands on the ground: no grass through it, the earth bare at its foot, half the sky hidden beside it.
  for (const print of footprints) {
    const outsideOf = (dx, dz) => Math.hypot(Math.max(0, Math.abs(dx) - print.halfX), Math.max(0, Math.abs(dz) - print.halfZ));
    stamp(print.x, print.z, print.halfX, print.halfZ, 1.2, (at, dx, dz) => {
      const inside = 1 - envSmooth(0, 1.2, outsideOf(dx, dz));
      values[at + 1] *= 1 - inside;
      values[at + 3] = Math.max(values[at + 3], inside * 0.7);
    });
    stampFine(print.x, print.z, print.halfX, print.halfZ, tune.wallReach, (at, dx, dz) => {
      cover[at] = Math.min(cover[at], 255 * (tune.atWall + (1 - tune.atWall) * envSmooth(0, tune.wallReach, outsideOf(dx, dz))));
    });
  }
  const half = new Uint16Array(values.length);
  for (let index = 0; index < values.length; index += 1) half[index] = THREE.DataUtils.toHalfFloat(values[index]);
  const texture = new THREE.DataTexture(half, mapSize, mapSize, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  for (let at = 1; at < cover.length; at += 4) cover[at] = 255 - cover[at];
  const over = new THREE.DataTexture(cover, fine, fine, THREE.RGBAFormat);
  // (With its smaller copies: a sight line's walk reads it spread over a stretch, air.js envAirShare.)
  over.magFilter = THREE.LinearFilter;
  over.minFilter = THREE.LinearMipmapLinearFilter;
  over.generateMipmaps = true;
  over.needsUpdate = true;
  texture.envCover = over;
  return texture;
}

// ---- shared GLSL: the near map and the lighting every env surface uses ------------------------------------------------

/**
 * Reads of the near map, for the ground and the grass: envMap(xz) -> vec4 (see envBuildNearMap), envInMap(xz) -> 0..1,
 * envCover(xz) -> x: the share of the sky seen from the ground there, y: the sun past the crowns over it, which is
 * flecks of sun the size of the gaps in the leaves, sharp in thin shade and few in deep, moving as the gust
 * there moves the crown; envBodies(ground) -> xy: which way and how far grass there is pressed over by what
 * stands or lies on it, z: the share of the sky the bodies over it leave it (ENV.shadow).
 */
export const ENV_GLSL_MAP = /* glsl */ `
uniform vec4 uEnvBodies[${ENV.shadow.bodyCount}];
uniform vec4 uEnvBodiesAt;
vec2 envCover(vec2 xz) {
  vec4 over = envCoverRead(xz / ${(2 * ENV.terrain.mapHalf).toFixed(1)} + 0.5, 0.0);
  if (over.g < 0.004) return vec2(over.r, over.b);
  vec2 p = xz + uEnvWind.xy * envGust(xz) * ${ENV.shadow.dappleSway.toFixed(3)};
  float gaps = texture2D(uEnvNoise, p / ${(ENV.shadow.dapple * 16).toFixed(2)}).g * 0.6 + texture2D(uEnvNoise, p / ${(ENV.shadow.dapple * 5.3).toFixed(2)} + 0.37).a * 0.4;
  // (The boughs' gaps under the leaves': a shaft in the air comes down on a patch of sun, air.js envBoughs.)
  gaps = mix(gaps, envBoughs(xz + uEnvShadeSway), ${ENV.shadow.boughShare.toFixed(2)});
  float least = 0.5 + (over.g - 0.5) * 0.62;
  return vec2(over.r, over.b * (1.0 - min(over.g * 2.5, 1.0) * (1.0 - smoothstep(least - 0.03, least + 0.05, gaps))));
}
vec3 envBodies(vec3 ground) {
  // Most of a field is far from anyone: only ground within their reach counts them over (a blade of grass asks this).
  vec3 from = uEnvBodiesAt.xyz - ground;
  if (dot(from, from) > uEnvBodiesAt.w * uEnvBodiesAt.w) return vec3(0.0, 0.0, 1.0);
  vec3 by = vec3(0.0);
  for (int i = 0; i < ${ENV.shadow.bodyCount}; i++) {
    vec4 body = uEnvBodies[i];
    vec3 to = body.xyz - ground;
    float d2 = dot(to, to) + 1e-4;
    by.z += body.w * body.w * max(to.y, 0.0) / (d2 * sqrt(d2));
    float level = length(to.xz);
    by.xy -= to.xz / max(level, 1e-3) * (1.0 - smoothstep(body.w, body.w + ${ENV.shadow.tread.toFixed(2)}, level)) * (1.0 - smoothstep(0.15, 0.4, to.y));
  }
  by.z = 1.0 - min(by.z * ${ENV.shadow.contact.toFixed(2)}, 0.92);
  return by;
}
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

let envShadowInstalled = false;

/**
 * Teach the renderer's filtered shadow (every material's, by its shader chunk) the sun's width: a light whose
 * shadow radius is negative has the map searched round each point for what stands between it and the light, and
 * the filter made as wide as that is far (ENV.shadow): sharp at a foot, soft from a head. -radius is texels of
 * blur per unit of the map's depth (index.js sets the sun's). Lights with a radius of 0 or more are filtered as
 * before, so nothing changes in a place that does not ask.
 */
export function envInstallShadow() {
  if (envShadowInstalled) return;
  envShadowInstalled = true;
  const tune = ENV.shadow;
  const at = 'vec2 texelSize = vec2( 1.0 ) / shadowMapSize;';
  const search = `${at}
    float envSure = - 1.0;
    if ( shadowRadius < 0.0 ) {
      vec2 envMet = vec2( 0.0 );
      float envTurn = 6.2832 * fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
      for ( int i = 0; i < 8; i ++ ) {
        float envAt = envTurn + float( i ) * 2.4;
        float envDepth = unpackRGBAToDepth( texture2D( shadowMap, shadowCoord.xy + vec2( cos( envAt ), sin( envAt ) ) * texelSize * ${tune.search.toFixed(1)} * sqrt( ( float( i ) + 0.5 ) / 8.0 ) ) );
        if ( envDepth < shadowCoord.z ) envMet += vec2( envDepth, 1.0 );
      }
      shadowRadius = envMet.y > 0.0 ? clamp( ( shadowCoord.z - envMet.x / envMet.y ) * - shadowRadius, ${tune.least.toFixed(2)}, ${tune.most.toFixed(2)} ) : ${tune.least.toFixed(2)};
      // Nothing between the point and the sun anywhere round it, nor at it: lit, and the filter's seventeen looks
      // are not made; everything round it and it shaded: shaded. Only a shadow's edge is filtered, which is a few
      // of a frame's points (most of what a full frame cost in shadow was the filter over lit ground).
      float envHere = step( shadowCoord.z, unpackRGBAToDepth( texture2D( shadowMap, shadowCoord.xy ) ) );
      if ( envMet.y < 0.5 && envHere > 0.5 ) envSure = 1.0;
      else if ( envMet.y > 7.5 && envHere < 0.5 ) envSure = 0.0;
    }`;
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  if (!chunk.includes(at)) console.warn('env: the renderer has no filtered shadow to widen; shadows keep one edge');
  let widened = chunk.replace(at, search);
  // (The filter itself, the first after the search: skipped where the search has settled it.)
  const from = widened.indexOf('shadow = (', widened.indexOf(search));
  const close = ') * ( 1.0 / 17.0 );';
  const to = widened.indexOf(close, from);
  if (chunk.includes(at) && from > 0 && to > 0) widened = `${widened.slice(0, from)}if ( envSure >= 0.0 ) shadow = envSure; else { ${widened.slice(from, to + close.length)} }${widened.slice(to + close.length)}`;
  THREE.ShaderChunk.shadowmap_pars_fragment = widened;
}

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
${ENV_GLSL_PRESS}
uniform vec3 uGrass;
uniform vec3 uDry;
uniform vec3 uSoil;
uniform vec3 uRock;
uniform vec3 uWoodsColour;
uniform vec3 uEnvLoose;
uniform sampler2D uEnvSkyline;
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
  // (Beyond the near map a land that is mostly bare is drawn bare: a desert has no green horizon.)
  float worn = mix(uEnvLoose.z, map.a, inMap);
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
  grass *= 1.0 - ${(1 - ENV.grass.underShade).toFixed(2)} * sqrt(map.g) * inMap * (1.0 - smoothstep(${(ENV.grass.layers[0].tile * 0.45).toFixed(1)}, ${(ENV.grass.layers[1].tile * 0.45).toFixed(1)}, distance));
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
  // Loose dry ground (sand, grit: the place's ground.loose) where it lies bare: it takes a print too, a third as
  // deep as snow's, and the wind lays it in ripples a hand apart across its way, seen only near (ground/painted.js
  // draws an arena's sand the same way).
  float loose = uEnvLoose.x * worn * (1.0 - uEnvWet.x) * step(snow, 0.02);
  float close = 1.0 - smoothstep(5.0, 16.0, distance);
  if (loose * close * uEnvLoose.y > 0.0) {
    vec2 across = normalize(uEnvWind.xy + vec2(1e-4, 0.0));
    float phase = dot(xz, across) * ${(2 * Math.PI / ENV.terrain.ripple).toFixed(2)} + (medium + fine) * 5.0;
    normal = normalize(normal - vec3(across.x, 0.0, across.y) * cos(phase) * uEnvLoose.y * loose * close * (0.5 + medium));
  }
  // Where it has been trodden (press.js): the print's walls turn the light, its packed bed is darker and bluer.
  vec4 print = (snow > 0.02 || loose > 0.0) && near > 0.0 ? envSnowPrint(xz, snow > 0.02 ? uEnvWet.y * ${ENV_PRESS.snow.toFixed(3)} : ${ENV_PRESS.snow.toFixed(3)}) : vec4(0.0);
  normal = normalize(normal - vec3(print.y, 0.0, print.z) * (snow + loose * ${ENV.terrain.loosePrint[0].toFixed(2)}));
  colour *= 1.0 - ${ENV.terrain.loosePrint[1].toFixed(2)} * print.w * loose;
  // The sky a print's bed sees: a trench as wide as a sole, as deep as the print (the view factor of its floor).
  float printSky = mix(1.0, ${(ENV_PRESS.sole / 2).toFixed(3)} / sqrt(${((ENV_PRESS.sole / 2) ** 2).toFixed(5)} + print.x * print.x), snow * step(0.0, print.x));
  colour = mix(colour, vec3(${ENV.terrain.snowColour.join(', ')}) * mix(vec3(1.0), vec3(${ENV_PRESS.packedColour.join(', ')}), print.w), snow);

  // Rain: the earth darkens (more than the grass, which sheds it), and water stands in the worn hollows.
  float wet = uEnvWet.x;
  colour *= 1.0 - wet * (1.0 - ${ENV.terrain.wetDarken.toFixed(2)}) * mix(0.35, 1.0, worn);

  vec2 over = mix(vec2(1.0), envCover(xz), inMap);
  float sunShare = shade * over.y * envSunShare(vWorld) * getShadowMask();
  float facing = max(dot(normal, uEnvSunDir), 0.0);
  vec3 light = uEnvSunColour * facing * sunShare + mix(uEnvBounce, uEnvSkyLight, 0.5 + 0.5 * normal.y) * over.x * printSky * (near > 0.0 ? envBodies(vWorld).z : 1.0);
  colour *= light;

  vec3 view = normalize(vWorld - cameraPosition);
  // Water stands only in the hollows of worn, level ground: dips about a metre across (one smooth noise, a cell
  // 0.9 m), filled up to a level (ENV.terrain.puddles), their shores drawn by the ground's grain.
  float hollow = texture2D(uEnvNoise, xz / 14.0 + vec2(0.71, 0.29)).r + (fine - 0.5) * 0.05;
  float puddle = wet * (1.0 - smoothstep(${(ENV.terrain.puddles - 0.02).toFixed(3)}, ${(ENV.terrain.puddles + 0.02).toFixed(3)}, hollow)) * smoothstep(0.3, 0.6, worn) * near * step(0.97, normal.y);
  float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(-view, normal), 0.0), 5.0);
  // What the water mirrors: the sky over what stands round the floor, and under that line the wood itself.
  vec3 back = reflect(view, normal);
  float line = texture2D(uEnvSkyline, vec2(atan(back.z, back.x) / 6.2832 + 0.5, 0.5)).r * ${ENV.terrain.skylineMost.toFixed(1)};
  float clearSky = smoothstep(line * 0.7, line * 1.1 + 0.02, back.y / max(length(back.xz), 1e-3));
  clearSky = mix(clearSky, 1.0, smoothstep(${ENV.terrain.mirrorNear.toFixed(1)}, ${ENV.terrain.mirrorFar.toFixed(1)}, length(xz)));
  vec3 mirrored = mix(uWoodsColour * uEnvSkyLight * ${ENV.terrain.mirrorWood.toFixed(2)}, envSky(back), clearSky);
  colour = mix(colour, mirrored, clamp(fresnel * (puddle + wet * ${ENV.terrain.wetSheen.toFixed(2)} * (0.3 + 0.7 * worn)), 0.0, 1.0));

  colour = envHazeGrain(colour, cameraPosition, vWorld, envGrain(gl_FragCoord.xy));
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
      ...envPressUniforms(),
      uEnvMap: map,
      uEnvCover: map.cover,
      uEnvSkyline: map.skyline,
      uGrass: { value: new THREE.Color(ground.grass) },
      uDry: { value: new THREE.Color(ground.dry) },
      uSoil: { value: new THREE.Color(ground.soil) },
      uRock: { value: new THREE.Color(ground.rock) },
      uWoodsColour: { value: new THREE.Color(place.woods.colour) },
      uEnvLoose: { value: new THREE.Vector3(ground.loose ?? 0, ground.ripple ?? 0, Math.min(1, Math.max(0, ((ground.wear ?? 0) - 0.5) * 2))) },
    },
    lights: true,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.userData.env = 'terrain';
  return mesh;
}
