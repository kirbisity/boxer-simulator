// Trees (src/env/): planted where the place's stands say and the woods noise allows, each a tapering trunk dividing
// into limbs and a crown of leaf cards on the masses of foliage those limbs carry (config.js ENV_TREES), shaded as
// a mass (lit on the sun's side, dark inside and beneath, glowing at the rim against the sun). The whole tree leans with the gust at its foot and
// its leaves flutter in it (air.js envGust): a front crossing the field is seen to reach the trees and pass.

/* global THREE */

import { ENV, ENV_TREES } from './config.js';
import { ENV_GLSL, envUniforms } from './air.js';
import { envRandom } from './noise.js';
import { envSunPast, envWoodsAt } from './terrain.js';

/**
 * Where a place's trees stand: [{ kind, x, y, z, height, lit }], `lit` the sun reaching the crown past the hills.
 * `footprints` (things standing on the ground) and the flat ground are kept clear.
 */
export function envPlantTrees({ place, height, sun, keepOut, footprints }) {
  const random = envRandom(place.terrain.seed * 977 + 3);
  const trees = [];
  const rides = (place.rides ?? []).map((ride) => ({ ...ride, cos: Math.cos(ride.azimuth), sin: Math.sin(ride.azimuth) }));
  for (const stand of place.trees) {
    const kind = ENV_TREES[stand.kind];
    let planted = 0;
    for (let tries = 0; planted < stand.count && tries < stand.count * 30; tries += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(stand.from * stand.from + random() * (stand.to * stand.to - stand.from * stand.from));
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const chance = random();
      const size = random();
      // (A tree is kept a crown's reach off the level ground; a plant of the ground grows to its edge, and one
      // low enough to be trodden through grows on it as anywhere: ENV.trees.underfoot.)
      const clear = kind.height[1] > 4 ? 4 : 1;
      if (kind.height[1] > ENV.trees.underfoot && Math.abs(x) < keepOut[0] + clear && Math.abs(z) < keepOut[1] + clear) continue;
      // A ride: nothing stands in the lane, whose edge is as ragged as a wood's (by a third of its width).
      if (rides.some((ride) => x * ride.cos + z * ride.sin > 0 && x * ride.cos + z * ride.sin < ride.length && Math.abs(z * ride.cos - x * ride.sin) < ride.width * (0.5 + 0.33 * (size - 0.5)))) continue;
      if (chance > 1 - stand.clump + stand.clump * envWoodsAt(x, z, place.terrain.seed)) continue;
      if (footprints.some((print) => Math.abs(x - print.x) < print.halfX + 2.5 && Math.abs(z - print.z) < print.halfZ + 2.5)) continue;
      const y = height(x, z);
      const tall = kind.height[0] + (kind.height[1] - kind.height[0]) * size;
      trees.push({ kind: stand.kind, x, y, z, height: tall, lit: envSunPast(height, sun, x, y + tall * kind.crown.at, z) });
      planted += 1;
    }
  }
  // Standards: the trees left standing where a ride was cut, a few tall stems with the lane's light between them
  // (a ride's `standards`, of `kind`, pine if left out). From a stream of their own, so no other tree moves.
  const left = envRandom(place.terrain.seed * 977 + 47);
  for (const ride of rides) {
    const kind = ENV_TREES[ride.kind ?? 'pine'];
    for (let standard = 0; standard < (ride.standards ?? 0); standard += 1) {
      const along = left() * ride.length;
      const across = (left() - 0.5) * ride.width;
      const tall = kind.height[0] + (kind.height[1] - kind.height[0]) * (0.5 + 0.5 * left());
      const x = along * ride.cos - across * ride.sin;
      const z = along * ride.sin + across * ride.cos;
      if (Math.abs(x) < keepOut[0] + 4 && Math.abs(z) < keepOut[1] + 4) continue;
      if (footprints.some((print) => Math.abs(x - print.x) < print.halfX + 2.5 && Math.abs(z - print.z) < print.halfZ + 2.5)) continue;
      const y = height(x, z);
      trees.push({ kind: ride.kind ?? 'pine', x, y, z, height: tall, lit: envSunPast(height, sun, x, y + tall * kind.crown.at, z) });
    }
  }
  // What grows among the rocks of an outcrop (from a stream of its own, so a change to a stand of trees far off
  // does not move the plants a view is framed by).
  const among = envRandom(place.terrain.seed * 977 + 31);
  for (const outcrop of place.outcrops ?? []) {
    const kinds = outcrop.kinds ?? ['dock', 'bracken'];
    for (let plant = 0; plant < (outcrop.plants ?? 0); plant += 1) {
      const kind = ENV_TREES[kinds[plant % kinds.length]];
      const angle = among() * Math.PI * 2;
      const radius = Math.sqrt(among()) * outcrop.radius;
      const x = outcrop.at[0] + Math.cos(angle) * radius;
      const z = outcrop.at[1] + Math.sin(angle) * radius;
      const tall = kind.height[0] + (kind.height[1] - kind.height[0]) * among();
      if (Math.abs(x) < keepOut[0] + 1 && Math.abs(z) < keepOut[1] + 1) continue;
      const y = height(x, z);
      trees.push({ kind: kinds[plant % kinds.length], x, y, z, height: tall, lit: envSunPast(height, sun, x, y + tall, z) });
    }
  }
  return trees;
}

/**
 * Where a place's rocks lie: [{ x, y, z, size (m, half its width), form, turn, lit }], from its `rocks` (stands, as
 * trees are planted) and its `outcrops` (each a knot of them at a point).
 */
export function envPlantRocks({ place, height, sun, keepOut, footprints }) {
  const random = envRandom(place.terrain.seed * 1553 + 11);
  // (Stones small enough to step over are laid from a stream of their own, so scattering them moves no boulder a view is framed by.)
  const small = envRandom(place.terrain.seed * 1553 + 57);
  const rocks = [];
  const forms = ENV.rocks.forms.length;
  const lay = (x, z, size) => {
    // (A stone small enough to be stepped over lies on the level ground as anywhere: ENV.rocks.underfoot.)
    if (size > ENV.rocks.underfoot && Math.abs(x) < keepOut[0] + 1 + size && Math.abs(z) < keepOut[1] + 1 + size) return false;
    if (footprints.some((print) => Math.abs(x - print.x) < print.halfX + 1 + size && Math.abs(z - print.z) < print.halfZ + 1 + size)) return false;
    const y = height(x, z);
    rocks.push({ x, y, z, size, form: Math.floor(random() * forms), turn: random() * Math.PI * 2, lit: envSunPast(height, sun, x, y + size, z) });
    return true;
  };
  for (const stand of place.rocks ?? []) {
    let laid = 0;
    const next = stand.size[1] <= ENV.rocks.underfoot ? small : random;
    for (let tries = 0; laid < stand.count && tries < stand.count * 30; tries += 1) {
      const angle = next() * Math.PI * 2;
      const radius = Math.sqrt(stand.from * stand.from + next() * (stand.to * stand.to - stand.from * stand.from));
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const chance = next();
      // Most are small: a few large ones among many a man could sit on.
      const size = stand.size[0] + (stand.size[1] - stand.size[0]) * Math.pow(next(), 2.2);
      if (chance > 1 - stand.clump + stand.clump * envWoodsAt(x + 311, z - 173, place.terrain.seed)) continue;
      if (lay(x, z, size)) laid += 1;
    }
  }
  for (const outcrop of place.outcrops ?? []) {
    const size = outcrop.size ?? [0.4, 1.6];
    for (let rock = 0; rock < (outcrop.rocks ?? 0); rock += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * outcrop.radius;
      lay(outcrop.at[0] + Math.cos(angle) * radius, outcrop.at[1] + Math.sin(angle) * radius, size[0] + (size[1] - size[0]) * Math.pow(random(), 1.5));
    }
  }
  return rocks;
}

/** The shadows rocks lay on the near map: each a band from its foot away from the sun, as a trunk's is (envTreeShadows). */
export function envRockShadows(rocks, sun) {
  const reach = ENV.terrain.mapHalf * 1.2;
  const flat = Math.hypot(sun[0], sun[2]) || 1;
  const slant = Math.min(ENV.shadow.slantMost, 1 / Math.max(0.05, sun[1] / flat));
  const shadows = [];
  for (const rock of rocks) {
    if (Math.abs(rock.x) > reach || Math.abs(rock.z) > reach || rock.lit <= 0) continue;
    const tall = rock.size * ENV.rocks.forms[rock.form].scale[1] * 2 * (1 - ENV.rocks.sink);
    shadows.push({ x: rock.x, z: rock.z, toX: rock.x - (sun[0] / flat) * tall * slant, toZ: rock.z - (sun[2] / flat) * tall * slant, half: rock.size * 0.75, tall });
  }
  return shadows;
}

/**
 * The shadows a place's trees lay on the near map (terrain.js envBuildNearMap): crowns as rounds moved to where the
 * sun puts them, and each trunk below its crown as a band `half` m to each side from its foot to (toX, toZ),
 * `tall` m of trunk casting it.
 */
export function envTreeShadows(trees, sun) {
  const shadows = [];
  const reach = ENV.terrain.mapHalf * 1.2;
  const flat = Math.hypot(sun[0], sun[2]) || 1;
  const slant = Math.min(ENV.shadow.slantMost, 1 / Math.max(0.05, sun[1] / flat));
  for (const tree of trees) {
    if (Math.abs(tree.x) > reach || Math.abs(tree.z) > reach || tree.lit <= 0) continue;
    const kind = ENV_TREES[tree.kind];
    const bare = tree.height * Math.max(0, kind.crown.at - kind.crown.tall * 0.8);
    if (bare > 0.5) shadows.push({ x: tree.x, z: tree.z, toX: tree.x - (sun[0] / flat) * bare * slant, toZ: tree.z - (sun[2] / flat) * bare * slant, half: tree.height * kind.trunk, tall: bare });
    // Three rounds up the crown: a low sun draws them apart along the ground, and each out by `stretch` along
    // (`sunX`, `sunZ`), as a ball's shadow is on flat ground (1 / sin of the sun's height: the ball's width
    // across the light, laid along the ground). Left round they stood apart under a low sun and each shaded a
    // slab of air two metres thick: dark bars across the mist in front of a crown.
    for (const part of [-0.6, 0, 0.6]) {
      const up = tree.height * (kind.crown.at + kind.crown.tall * part);
      shadows.push({
        x: tree.x - (sun[0] / flat) * up * slant,
        z: tree.z - (sun[2] / flat) * up * slant,
        radius: tree.height * kind.crown.wide * (part === 0 ? 1.15 : 0.9),
        depth: ENV.shadow.crown,
        sunX: sun[0] / flat,
        sunZ: sun[2] / flat,
        stretch: Math.hypot(1, slant),
        over: part === 0 ? { x: tree.x, z: tree.z, radius: tree.height * kind.crown.wide * 1.3 } : null,
      });
    }
  }
  return shadows;
}

// ---- the leaf-card picture ------------------------------------------------------------------------------------------

let envLeafTextureMade = null;

/** The leaf cards' atlas (made once): two sprays of broad leaves, two of needles, white with shading, to be tinted. */
// The first tile of each leaf-card drawing in the atlas (a spray, a bough and a twig have two tiles each).
const ENV_LEAF_TILES = { leaf: 0, needle: 2, blade: 4, frond: 5, twig: 6 };

function envLeafTexture() {
  if (envLeafTextureMade) return envLeafTextureMade;
  const { atlas, tile } = ENV.trees;
  const size = atlas * tile;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const random = envRandom(4242);
  for (let cell = 0; cell < atlas * atlas; cell += 1) {
    const cx = (cell % atlas) * tile + tile / 2;
    const cy = Math.floor(cell / atlas) * tile + tile / 2;
    if (cell < 2 || cell === 8) {
      // Broad leaves: a loose spray, the ones drawn last (nearest) lightest.
      const leaves = ENV.trees.leaves;
      for (let leaf = 0; leaf < leaves; leaf += 1) {
        const angle = random() * Math.PI * 2;
        const out = Math.pow(random(), 0.62) * tile * 0.43;
        const shade = Math.round(120 + (leaf / leaves) * 95 + random() * 40);
        g.fillStyle = `rgb(${shade},${shade},${shade})`;
        g.beginPath();
        g.ellipse(cx + Math.cos(angle) * out, cy + Math.sin(angle) * out, tile * (0.03 + random() * 0.02), tile * (0.015 + random() * 0.012), random() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
    } else if (cell === 4 || cell === 5 || cell === 6 || cell === 7) {
      // One leaf at a time, from the middle outward: a blade with a midrib and veins, light along its edge.
      const blade = (angle, from, length, wide, shade) => {
        const ax = Math.cos(angle);
        const ay = Math.sin(angle);
        const x0 = cx + ax * from;
        const y0 = cy + ay * from;
        const x1 = cx + ax * (from + length);
        const y1 = cy + ay * (from + length);
        g.fillStyle = `rgb(${shade},${shade},${shade})`;
        g.beginPath();
        g.moveTo(x0, y0);
        g.quadraticCurveTo(x0 + ax * length * 0.4 - ay * wide, y0 + ay * length * 0.4 + ax * wide, x1, y1);
        g.quadraticCurveTo(x0 + ax * length * 0.4 + ay * wide, y0 + ay * length * 0.4 - ax * wide, x0, y0);
        g.fill();
        const rib = Math.max(60, shade - 55);
        g.strokeStyle = `rgb(${rib},${rib},${rib})`;
        g.lineWidth = Math.max(1, tile * 0.006);
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        for (let vein = 1; vein < 5; vein += 1) {
          const px = x0 + ax * length * vein * 0.18;
          const py = y0 + ay * length * vein * 0.18;
          for (const side of [-1, 1]) {
            g.moveTo(px, py);
            g.lineTo(px + (ax * 0.5 - ay * side * 0.6) * wide * 0.7, py + (ay * 0.5 + ax * side * 0.6) * wide * 0.7);
          }
        }
        g.stroke();
      };
      if (cell === 4) {
        // A rosette of broad blades (dock, butterbur): the lower ones darker, under the upper.
        for (let leaf = 0; leaf < 9; leaf += 1) blade(leaf * 2.39996 + random() * 0.4, tile * 0.02, tile * (0.3 + random() * 0.14), tile * (0.13 + random() * 0.05), Math.round(105 + leaf * 14 + random() * 25));
      } else if (cell === 5) {
        // A fan of fronds (bracken, fern): each a stalk with leaflets in pairs, shorter toward its tip.
        for (let frond = 0; frond < 7; frond += 1) {
          const angle = frond * 2.39996 + random() * 0.5;
          const reach = tile * (0.34 + random() * 0.1);
          const shade = Math.round(110 + frond * 16 + random() * 25);
          for (let pair = 2; pair < 12; pair += 1) {
            const at = (pair / 12) * reach;
            const long = tile * 0.085 * (1.15 - pair / 12);
            for (const side of [-1, 1]) {
              g.save();
              g.translate(cx + Math.cos(angle) * at, cy + Math.sin(angle) * at);
              g.translate(-cx, -cy);
              blade(angle + side * 1.15, 0, long, long * 0.3, shade);
              g.restore();
            }
          }
          g.strokeStyle = `rgb(${shade - 40},${shade - 40},${shade - 40})`;
          g.lineWidth = tile * 0.008;
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach);
          g.stroke();
        }
      } else {
        // A twig seen close: a dozen leaves along three shoots.
        for (let shoot = 0; shoot < 3; shoot += 1) {
          const angle = shoot * 2.1 + random() * 0.8;
          for (let leaf = 0; leaf < 5; leaf += 1) {
            const at = tile * (0.05 + leaf * 0.075);
            g.save();
            g.translate(Math.cos(angle) * at, Math.sin(angle) * at);
            blade(angle + (leaf % 2 ? 1 : -1) * (0.7 + random() * 0.4), 0, tile * (0.13 + random() * 0.05), tile * (0.05 + random() * 0.02), Math.round(125 + leaf * 18 + random() * 35));
            g.restore();
          }
        }
      }
    } else {
      // Needles: a branch lying across the card, boughs leaving it to either side and shorter toward its tip,
      // each bough bearing branchlets and each branchlet its needles: seen close, and from under, a card is
      // a flat spray of a conifer's branch with air between its boughs, and shrunk by distance the same picture
      // is a dark mass. (Japanese cedar and pine carry needles 1 to 10 cm long on branchlets a few tens of cm:
      // on a card 1.5 m across a needle here is 4 cm; approximate.)
      const turn = random() * Math.PI * 2;
      const bend = (random() - 0.5) * 0.5;
      const spray = (x, y, way, long, tone) => {
        const needles = Math.max(3, Math.round(long / (tile * 0.008)));
        for (let needle = 0; needle <= needles; needle += 1) {
          const along = (needle / needles) * long;
          const nx = x + Math.cos(way) * along;
          const ny = y + Math.sin(way) * along;
          const shade = Math.round(tone + random() * 100);
          g.strokeStyle = `rgb(${shade},${shade},${shade})`;
          g.lineWidth = tile * 0.007;
          for (const side of [-1, 1]) {
            const lean = way + side * (0.5 + random() * 0.5);
            const length = tile * (0.018 + random() * 0.014);
            g.beginPath();
            g.moveTo(nx, ny);
            g.lineTo(nx + Math.cos(lean) * length, ny + Math.sin(lean) * length);
            g.stroke();
          }
        }
      };
      for (let bough = 0; bough < 18; bough += 1) {
        // Where the bough leaves the branch, which side, and how far it reaches: longest a third of the way along.
        const share = (bough + random() * 0.6) / 18;
        const stem = (share - 0.5) * tile * 0.84;
        const way = turn + bend * (share - 0.5);
        const bx = cx + Math.cos(way) * stem;
        const by = cy + Math.sin(way) * stem;
        const side = bough % 2 ? 1 : -1;
        const out = way + side * (0.85 + random() * 0.4);
        const reach = tile * (0.36 - 0.26 * Math.abs(share - 0.35)) * (0.75 + random() * 0.4);
        const tone = 100 + random() * 45;
        for (let step = 1; step <= 9; step += 1) {
          const at = (step / 9) * reach;
          const px = bx + Math.cos(out) * at;
          const py = by + Math.sin(out) * at;
          // Kept inside the tile: a spray cut off square at a card's edge shows as a card.
          if (Math.hypot(px - cx, py - cy) > tile * 0.44) break;
          for (const hand of [-1, 1]) spray(px, py, out + hand * (0.7 + random() * 0.4), tile * 0.075 * (1.15 - step / 9) * (0.7 + random() * 0.5), tone);
        }
        spray(bx, by, out, Math.min(reach, tile * 0.3), tone - 10);
      }
      spray(cx - Math.cos(turn) * tile * 0.42, cy - Math.sin(turn) * tile * 0.42, turn, tile * 0.84, 95);
    }
  }
  // A canvas keeps no colour where it is clear, and the smaller mips would fringe dark: give the clear texels the leaves' grey.
  const image = g.getImageData(0, 0, size, size);
  const bytes = new Uint8Array(image.data.length);
  for (let at = 0; at < bytes.length; at += 4) {
    const alpha = image.data[at + 3];
    const solid = alpha > 8;
    bytes[at] = solid ? image.data[at] : 190;
    bytes[at + 1] = solid ? image.data[at + 1] : 190;
    bytes[at + 2] = solid ? image.data[at + 2] : 190;
    bytes[at + 3] = alpha;
  }
  const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  envLeafTextureMade = texture;
  return texture;
}

// ---- shaders ---------------------------------------------------------------------------------------------------------

/** How a tree moves in the wind: the offset (m) of a point `up` m above its foot `base`, on a tree `tall` m high. */
const ENV_GLSL_SWAY = /* glsl */ `
vec3 envSway(vec3 base, float tall, float up) {
  float speed = envGust(base.xz);
  // The trunk bends as a beam does, most at the top; it rocks at its own slow rate about the lean the wind holds it at.
  float phase = dot(base.xz, vec2(0.37, 0.61));
  float rock = 1.0 + 0.4 * sin(uEnvTime * (6.2831853 * 0.31) + phase) ;
  float reach = ${ENV.wind.treeSway.toFixed(4)} * speed * speed * (tall / 10.0) * rock;
  float share = up / max(tall, 0.1);
  vec2 across = vec2(-uEnvWind.y, uEnvWind.x) * sin(uEnvTime * (6.2831853 * 0.23) + phase * 1.7) * 0.3;
  return vec3((uEnvWind.xy + across) * reach * share * share, 0.0).xzy;
}`;

const ENV_GLSL_HAZE_SPLIT = /* glsl */ `
// The haze once a vertex: what is left of a surface's own light, and the air's light added.
void envHazeSplit(vec3 world, out vec3 through_, out vec3 air_) {
  vec3 ray = world - cameraPosition;
  float distance_ = length(ray);
  vec3 depth_ = (uEnvRayleigh.rgb + uEnvHaze.rgb * envHazeColumn(max(cameraPosition.y, 0.0), max(world.y, 0.0))) * distance_;
  through_ = exp(-depth_);
  air_ = envAirlightIn(ray / max(distance_, 1e-3), envAirShare(cameraPosition, ray, depth_.g, 0.5, ${ENV.air.shadeSteps[1]})) * (1.0 - through_);
}`;

const ENV_CROWN_VERTEX = /* glsl */ `
${ENV_GLSL}
${ENV_GLSL_SWAY}
${ENV_GLSL_HAZE_SPLIT}
attribute vec2 aCorner;
// The tree: its foot (x, y, z) and its height.
attribute vec4 aTree;
// The card: where its middle is from the foot (m), and its size (m).
attribute vec4 aCard;
// Which way the crown's surface faces there, and how deep in the crown it is (0 the middle .. 1 the outside).
attribute vec4 aShell;
// Its leaf colour; w: the atlas tile (whole part) and the sun reaching the tree past the hills (fraction).
attribute vec4 aTint;
varying vec2 vUv;
varying vec3 vColour;
varying vec3 vAir;

void main() {
  vec3 base = aTree.xyz;
  float r = fract(sin(dot(aCard.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float speed = envGust(base.xz);
  vec3 middle = base + aCard.xyz + envSway(base, aTree.w, aCard.y);
  // The leaves' own flutter in the moving air.
  middle += vec3(sin(uEnvTime * ${(ENV.wind.flutter[0] * 6.2832).toFixed(2)} + r * 50.0), sin(uEnvTime * ${(ENV.wind.flutter[1] * 6.2832).toFixed(2)} + r * 31.0), cos(uEnvTime * ${(ENV.wind.flutter[0] * 6.2832).toFixed(2)} + r * 17.0))
    * ${ENV.wind.flutterReach.toFixed(4)} * speed * aShell.w;
  vec3 toEye = normalize(cameraPosition - middle);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toEye));
  vec3 up = cross(toEye, right);
  float turn = r * 6.2831853 + sin(uEnvTime * 1.7 + r * 9.0) * 0.02 * speed;
  vec2 corner = vec2(aCorner.x * cos(turn) - aCorner.y * sin(turn), aCorner.x * sin(turn) + aCorner.y * cos(turn));
  vec3 world = middle + (right * corner.x + up * corner.y) * aCard.w * 0.5;

  float tile = floor(aTint.w);
  float sunPast = fract(aTint.w) / 0.99;
  vUv = (vec2(mod(tile, ${ENV.trees.atlas.toFixed(1)}), floor(tile / ${ENV.trees.atlas.toFixed(1)})) + aCorner * 0.5 + 0.5) / ${ENV.trees.atlas.toFixed(1)};

  // The crown is lit as a mass: by the way its surface faces, darker inside and beneath, and through its rim against the sun.
  vec3 normal = normalize(aShell.xyz + vec3(0.0, 0.25, 0.0));
  float depth = aShell.w;
  float facing = max(dot(normal, uEnvSunDir) * 0.7 + 0.3, 0.0);
  vec3 view = normalize(middle - cameraPosition);
  float through = pow(max(dot(view, uEnvSunDir), 0.0), 4.0) * ${ENV.trees.through.toFixed(2)} * depth;
  float open = mix(1.0 - ${ENV.trees.inner.toFixed(2)}, 1.0, depth * depth) * (0.72 + 0.28 * normal.y);
  float sunShare = sunPast * envSunShare(middle);
  vec3 light = uEnvSunColour * (facing * open + through) * sunShare + mix(uEnvBounce, uEnvSkyLight, 0.5 + 0.5 * normal.y) * open;
  vec3 colour = aTint.rgb * (1.0 - 0.15 * uEnvWet.x);
  colour = mix(colour, vec3(0.9, 0.92, 0.96), uEnvWet.y * smoothstep(0.1, 0.7, normal.y) * 0.7);
  vec3 through_;
  envHazeSplit(world, through_, vAir);
  vColour = colour * light * through_;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const ENV_CROWN_FRAGMENT = /* glsl */ `
uniform sampler2D uLeaves;
uniform float uCut;
varying vec2 vUv;
varying vec3 vColour;
varying vec3 vAir;
void main() {
  vec4 leaf = texture2D(uLeaves, vUv);
  // The leaf's edge, a pixel wide, handed to the multisampling as coverage (the material's alphaToCoverage): a
  // crown's outline is leaves, not squares of the picture.
  float cover = clamp((leaf.a - uCut) / max(fwidth(leaf.a), 1e-4) + 0.5, 0.0, 1.0);
  if (cover < 0.02) discard;
  gl_FragColor = vec4(vColour * (leaf.rgb * 1.3) + vAir, cover);
  #include <tonemapping_fragment>
}`;

const ENV_TRUNK_VERTEX = /* glsl */ `
${ENV_GLSL}
${ENV_GLSL_SWAY}
${ENV_GLSL_HAZE_SPLIT}
attribute vec4 aTree;
// A length of wood (the trunk, or a limb): where it starts and ends from the tree's foot (m), w its radius there (m).
attribute vec4 aFrom;
attribute vec4 aTo;
// The bark's colour; w: the sun reaching the tree past the hills.
attribute vec4 aBark;
varying vec3 vColour;
varying vec3 vAir;
void main() {
  float t = position.y;
  // A limb goes out before it goes up; the trunk (which starts in the ground) flares at its foot.
  vec3 along = vec3(mix(aFrom.xz, aTo.xz, pow(t, 0.7)), mix(aFrom.y, aTo.y, t)).xzy;
  float radius = mix(aFrom.w, aTo.w, t) + aFrom.w * 0.5 * pow(1.0 - t, 6.0) * step(aFrom.y, 0.0);
  vec3 world = aTree.xyz + along + vec3(position.x * radius, 0.0, position.z * radius) + envSway(aTree.xyz, aTree.w, along.y);
  vec3 normal = normalize(vec3(position.x, 0.0, position.z));
  // Under its own crown: little sun, the sky's light cut by the leaves above.
  float shade = mix(0.9, 0.4, clamp(along.y / aTree.w * 1.6, 0.0, 1.0));
  // (The crowns sunward of it shade a trunk; its own band on the map is not asked, which it would always stand in.)
  vec3 light = uEnvSunColour * max(dot(normal, uEnvSunDir), 0.0) * aBark.w * envSunShare(world) * envSunward(world).x * shade + mix(uEnvBounce, uEnvSkyLight, 0.5) * shade;
  vec3 through_;
  envHazeSplit(world, through_, vAir);
  vColour = aBark.rgb * (1.0 - 0.3 * uEnvWet.x) * light * through_;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const ENV_TRUNK_FRAGMENT = /* glsl */ `
varying vec3 vColour;
varying vec3 vAir;
void main() {
  gl_FragColor = vec4(vColour + vAir, 1.0);
  #include <tonemapping_fragment>
}`;

// A rock is lit facet by facet: the sun on the faces turned to it (where cloud and the crowns sunward let it
// through), the sky by how much of it a face sees, less at the foot where the grass stands round it.
const ENV_ROCK_VERTEX = /* glsl */ `
${ENV_GLSL}
${ENV_GLSL_HAZE_SPLIT}
// Its colour; w: the sun reaching it past the hills.
attribute vec4 aRock;
// How far up the rock from the ground the point is (0..1).
attribute float aUp;
varying vec3 vLight;
varying vec3 vAir;
varying vec3 vWorld;
varying vec3 vFace;
varying vec3 vTone;
void main() {
  vec3 world = position;
  vec3 face = normalize(normal);
  float foot = mix(${ENV.rocks.foot.toFixed(2)}, 1.0, smoothstep(0.0, 0.5, aUp));
  vec3 light = uEnvSunColour * max(dot(face, uEnvSunDir), 0.0) * aRock.w * envSunShare(world) * envSunward(world).x
    + mix(uEnvBounce, uEnvSkyLight, 0.5 + 0.5 * face.y) * foot;
  vec3 through_;
  envHazeSplit(world, through_, vAir);
  vLight = light * through_;
  vWorld = world;
  vFace = face;
  vTone = aRock.rgb;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const ENV_ROCK_FRAGMENT = /* glsl */ `
${ENV_GLSL}
varying vec3 vLight;
varying vec3 vAir;
varying vec3 vWorld;
varying vec3 vFace;
varying vec3 vTone;
void main() {
  // The stone's grain, read on the level and on the upright as the face lies; lichen in blotches; moss on what
  // faces up. Wet stone is darker, and snow lies on its top.
  float grit = mix(texture2D(uEnvNoise, vec2(vWorld.x + vWorld.z, vWorld.y) * 0.83).a, texture2D(uEnvNoise, vWorld.xz * 0.83).a, abs(vFace.y));
  float blotch = texture2D(uEnvNoise, vWorld.xz * 0.19 + vWorld.y * 0.11).b;
  float damp = texture2D(uEnvNoise, vWorld.xz * 0.31 + 0.4).b;
  vec3 colour = vTone * (0.74 + 0.52 * grit);
  colour = mix(colour, vec3(${envRockHue(ENV.rocks.lichen)}), smoothstep(0.52, 0.66, blotch) * 0.55);
  colour = mix(colour, vec3(${envRockHue(ENV.rocks.moss)}) * (0.8 + 0.4 * grit), smoothstep(0.35, 0.85, vFace.y) * smoothstep(0.42, 0.6, damp) * 0.8);
  colour *= 1.0 - 0.35 * uEnvWet.x;
  colour = mix(colour, vec3(0.9, 0.92, 0.96), uEnvWet.y * smoothstep(0.25, 0.75, vFace.y));
  gl_FragColor = vec4(colour * vLight + vAir, 1.0);
  #include <tonemapping_fragment>
}`;

/** One of the rock forms (config.js ENV.rocks.forms) as positions round its middle, three to a face, of unit size. */
function envRockForm(form, random) {
  const ball = new THREE.IcosahedronGeometry(1, 2);
  const at = ball.attributes.position.array;
  const waves = [0, 1, 2].map(() => [random() * 4 - 2, random() * 4 - 2, random() * 4 - 2, random() * 6.28]);
  const cuts = [];
  for (let cut = 0; cut < form.cuts; cut += 1) {
    const x = random() * 2 - 1;
    const y = random() * 2 - 1;
    const z = random() * 2 - 1;
    const length = Math.hypot(x, y, z) || 1;
    cuts.push([x / length, y / length, z / length, form.keep + random() * 0.25]);
  }
  for (let index = 0; index < at.length; index += 3) {
    let x = at[index];
    let y = at[index + 1];
    let z = at[index + 2];
    let radius = 1;
    for (const wave of waves) radius += form.lump * Math.sin(x * wave[0] + y * wave[1] + z * wave[2] + wave[3]);
    x *= radius;
    y *= radius;
    z *= radius;
    for (const cut of cuts) {
      const over = x * cut[0] + y * cut[1] + z * cut[2] - cut[3];
      if (over > 0) {
        x -= cut[0] * over;
        y -= cut[1] * over;
        z -= cut[2] * over;
      }
    }
    at[index] = x * form.scale[0];
    at[index + 1] = y * form.scale[1];
    at[index + 2] = z * form.scale[2];
  }
  return at;
}

/** A display colour as the three numbers of a GLSL vec3. */
function envRockHue(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((value) => (value / 255).toFixed(3)).join(', ');
}

/**
 * What stands round the floor, as the floor's standing water sees it: for each way round the compass, how high the
 * crowns and the roofs stand over the horizon from the place's centre (a strip ENV.terrain.skyline texels round,
 * the tangent of that height over ENV.terrain.skylineMost in r, from +x toward +z starting at -pi). Each texel is
 * the mean of four sight lines, so a wood with gaps reads as partly open. A sheet of water mirrors the sky only
 * above this line: below it, the wood (terrain.js).
 */
export function envBuildSkyline(trees, footprints) {
  const { skyline, skylineMost } = ENV.terrain;
  const lines = skyline * 4;
  const tangent = new Float32Array(lines);
  const stand = (x, z, halfWide, top) => {
    const distance = Math.hypot(x, z);
    if (distance < 1 || top <= 0) return;
    const reach = Math.atan(halfWide / distance);
    const middle = Math.atan2(z, x);
    const first = Math.ceil(((middle - reach + Math.PI) / (Math.PI * 2)) * lines - 0.5);
    const last = Math.floor(((middle + reach + Math.PI) / (Math.PI * 2)) * lines - 0.5);
    for (let line = first; line <= last; line += 1) {
      const slot = ((line % lines) + lines) % lines;
      tangent[slot] = Math.max(tangent[slot], top / distance);
    }
  };
  for (const tree of trees) {
    const { crown } = ENV_TREES[tree.kind];
    stand(tree.x, tree.z, tree.height * crown.wide, tree.y + tree.height * (crown.at + crown.tall));
  }
  for (const print of footprints) stand(print.x, print.z, Math.max(print.halfX, print.halfZ), print.top ?? 0);
  const data = new Uint8Array(skyline * 4);
  for (let texel = 0; texel < skyline; texel += 1) {
    const mean = (tangent[texel * 4] + tangent[texel * 4 + 1] + tangent[texel * 4 + 2] + tangent[texel * 4 + 3]) / 4;
    data[texel * 4] = Math.round(Math.min(1, mean / skylineMost) * 255);
    data[texel * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, skyline, 1, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** A place's rocks (envPlantRocks) as one mesh, each face flat. */
export function envBuildRocks({ place, rocks, height }) {
  const random = envRandom(place.terrain.seed * 811 + 5);
  const forms = ENV.rocks.forms.map((form) => envRockForm(form, random));
  const total = rocks.reduce((sum, rock) => sum + forms[rock.form].length, 0);
  const position = new Float32Array(total);
  const aRock = new Float32Array((total / 3) * 4);
  const aUp = new Float32Array(total / 3);
  const colour = new THREE.Color();
  let written = 0;
  for (const rock of rocks) {
    const form = forms[rock.form];
    const tall = ENV.rocks.forms[rock.form].scale[1] * rock.size;
    const cos = Math.cos(rock.turn);
    const sin = Math.sin(rock.turn);
    const tone = 0.82 + random() * 0.36;
    colour.set(ENV.rocks.colour);
    for (let index = 0; index < form.length; index += 3) {
      const x = rock.x + (form[index] * cos - form[index + 2] * sin) * rock.size;
      const z = rock.z + (form[index] * sin + form[index + 2] * cos) * rock.size;
      const y = rock.y + tall * (1 - 2 * ENV.rocks.sink) + form[index + 1] * rock.size;
      position[written] = x;
      position[written + 1] = y;
      position[written + 2] = z;
      const vertex = written / 3;
      aRock[vertex * 4] = colour.r * tone;
      aRock[vertex * 4 + 1] = colour.g * tone;
      aRock[vertex * 4 + 2] = colour.b * tone;
      aRock[vertex * 4 + 3] = Math.min(1, Math.max(0, rock.lit));
      aUp[vertex] = Math.min(1, Math.max(0, (y - height(x, z)) / Math.max(0.1, tall * 2 * (1 - ENV.rocks.sink))));
      written += 3;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aRock', new THREE.BufferAttribute(aRock, 4));
  geometry.setAttribute('aUp', new THREE.BufferAttribute(aUp, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ vertexShader: ENV_ROCK_VERTEX, fragmentShader: ENV_ROCK_FRAGMENT, uniforms: envUniforms(), fog: false }));
  mesh.userData.env = 'rocks';
  return mesh;
}

// ---- building --------------------------------------------------------------------------------------------------------

/**
 * The masses of foliage one tree carries, as shares of its height from its foot: [{ x, y, z: the mass's middle,
 * radius, flat: its height beside its width, from: [x, y, z] where the limb that carries it leaves the trunk }].
 * 'round' (a broadleaf): a ring of masses on spreading limbs and one or two on top. 'boughs' (a conifer): a spire of
 * boughs, each a flat fan, longest low down, with gaps between them the sky shows through.
 */
function envCrownMasses(kind, random) {
  const crown = kind.crown;
  const masses = [];
  if (kind.shape === 'boughs') {
    for (let bough = 0; bough < kind.limbs; bough += 1) {
      const u = (bough + 0.2 + 0.6 * random()) / kind.limbs;
      // The golden angle between one bough and the next: no two stand over each other.
      const angle = bough * 2.39996 + random() * 0.8;
      const reach = crown.wide * (0.08 + Math.pow(1 - u, 0.8) * (0.7 + 0.5 * random()));
      const y = crown.at - crown.tall + 2 * crown.tall * u;
      masses.push({ x: Math.cos(angle) * reach, y: y - 0.05 * (1 - u), z: Math.sin(angle) * reach, radius: reach, flat: 0.16, from: [0, y, 0] });
    }
    return masses;
  }
  // A plant of the ground: its leaves in one low mound from the foot.
  if (kind.shape === 'tuft') {
    masses.push({ x: 0, y: crown.at, z: 0, radius: crown.wide * 0.55, flat: crown.tall / crown.wide, from: [0, 0.05, 0] });
    return masses;
  }
  const fork = crown.at - crown.tall * kind.fork;
  for (let limb = 0; limb < kind.limbs; limb += 1) {
    const angle = limb * 2.39996 + random() * 0.9;
    // Low limbs reach furthest out; the ones that go up stay nearer the middle.
    const up = limb < 2 ? 0.55 + 0.3 * random() : random() * 1.1 - 0.5;
    const out = (0.32 + 0.4 * random()) * Math.sqrt(Math.max(0.15, 1 - up * up * 0.9));
    const radius = (0.36 + 0.24 * random()) * (limb < 2 ? 1.15 : 1);
    masses.push({ x: Math.cos(angle) * out * crown.wide, y: crown.at + up * crown.tall * 0.62, z: Math.sin(angle) * out * crown.wide, radius: radius * crown.wide, flat: 0.8, from: [0, fork * (0.8 + 0.3 * random()), 0] });
  }
  return masses;
}

/** A leaf card's place on one of a tree's masses: into `out` [x, y, z from the foot (shares of the height), nx, ny, nz, depth]. */
function envCrownPoint(kind, random, masses, out) {
  const crown = kind.crown;
  const mass = masses[Math.floor(random() * masses.length)];
  if (kind.shape === 'boughs') {
    // Along the bough from the trunk to its tip, fanning wider as it goes, drooping a little.
    const t = 0.15 + 0.85 * Math.sqrt(random());
    const side = (random() - 0.5) * 0.7 * t;
    const length = Math.hypot(mass.x, mass.z) || 1e-3;
    const ax = mass.x / length;
    const az = mass.z / length;
    out[0] = (ax * t - az * side) * length;
    out[1] = mass.from[1] + (mass.y - mass.from[1]) * t * t + (random() - 0.5) * mass.radius * mass.flat;
    out[2] = (az * t + ax * side) * length;
    const lift = 0.9;
    const norm = Math.hypot(1, lift);
    out[3] = ax / norm;
    out[4] = lift / norm;
    out[5] = az / norm;
    out[6] = 0.35 + 0.65 * t;
    return out;
  }
  // On the outside of the mass.
  let nx = random() * 2 - 1;
  let ny = random() * 2 - 1;
  let nz = random() * 2 - 1;
  const length = Math.hypot(nx, ny, nz) || 1;
  nx /= length;
  ny /= length;
  nz /= length;
  const shell = 0.55 + 0.45 * Math.sqrt(random());
  out[0] = mass.x + nx * mass.radius * shell;
  out[1] = mass.y + ny * mass.radius * shell * mass.flat;
  out[2] = mass.z + nz * mass.radius * shell;
  // The surface faces out from the whole crown more than from its own mass: the crown shades as one.
  const px = out[0] / crown.wide;
  const py = (out[1] - crown.at) / crown.tall;
  const pz = out[2] / crown.wide;
  const whole = Math.hypot(px, py, pz) || 1;
  const fx = nx * 0.45 + (px / whole) * 0.55;
  const fy = ny * 0.45 + (py / whole) * 0.55;
  const fz = nz * 0.45 + (pz / whole) * 0.55;
  const facing = Math.hypot(fx, fy, fz) || 1;
  out[3] = fx / facing;
  out[4] = fy / facing;
  out[5] = fz / facing;
  out[6] = Math.min(1, 0.25 + 0.75 * whole) * (0.55 + 0.45 * shell);
  // A plant of the ground has no inside: every leaf of it lies open to the sky, its face up and a little out, the
  // lowest ones under the others. (Shaded as a crown's underside they stood as black cut-outs in lit grass.)
  if (kind.shape === 'tuft') {
    const out_ = Math.hypot(nx * 0.5, 0.85, nz * 0.5);
    out[3] = (nx * 0.5) / out_;
    out[4] = 0.85 / out_;
    out[5] = (nz * 0.5) / out_;
    out[6] = 0.8 + 0.2 * (ny * 0.5 + 0.5);
  }
  return out;
}

/**
 * The trees' meshes: a group of, for each distance band (ENV.trees.bands), one mesh of leaf cards and one of
 * trunks. Each crown mesh's userData.envFull is its card count (shuffled, so a share of them is an even thinning).
 */
export function envBuildTrees({ place, trees }) {
  const group = new THREE.Group();
  group.userData.env = 'trees';
  const random = envRandom(place.terrain.seed * 313 + 1);
  const bands = ENV.trees.bands.map(() => []);
  for (const tree of trees) {
    const out = Math.hypot(tree.x, tree.z);
    const band = ENV.trees.bands.findIndex((entry) => out <= entry.to);
    if (band >= 0) bands[band].push(tree);
  }
  const point = new Array(7);
  const colour = new THREE.Color();
  const other = new THREE.Color();
  bands.forEach((members, order) => {
    if (!members.length) return;
    const band = ENV.trees.bands[order];
    // A plant of the ground has a handful of leaves, not a crown's hundreds (its kind's `cards`, thinned as the band's are).
    const cardsOf = (tree) => (ENV_TREES[tree.kind].cards ? Math.max(2, Math.round((ENV_TREES[tree.kind].cards * band.cards) / ENV.trees.bands[0].cards)) : band.cards);
    const total = members.reduce((sum, tree) => sum + cardsOf(tree), 0);
    const aTree = new Float32Array(total * 4);
    const aCard = new Float32Array(total * 4);
    const aShell = new Float32Array(total * 4);
    const aTint = new Float32Array(total * 4);
    // Fewer cards are larger ones: the crown stays covered.
    const grow = Math.pow(ENV.trees.bands[0].cards / band.cards, 0.42);
    // Cards are written in a shuffled order, so drawing the first share of them thins every tree alike.
    const order_ = new Uint32Array(total);
    for (let index = 0; index < total; index += 1) order_[index] = index;
    for (let index = total - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [order_[index], order_[swap]] = [order_[swap], order_[index]];
    }
    let written = 0;
    for (const tree of members) {
      const kind = ENV_TREES[tree.kind];
      const masses = envCrownMasses(kind, random);
      tree.masses = masses;
      // A tree's own colour between the kind's, and each card a little off it.
      colour.set(kind.leaf[0]).lerp(other.set(kind.leaf[1]), random()).lerp(other.set(kind.leaf[2]), random() * 0.5);
      const picture = ENV_LEAF_TILES[kind.picture];
      const filled = cardsOf(tree);
      for (let card = 0; card < filled; card += 1) {
        envCrownPoint(kind, random, masses, point);
        const at = order_[written] * 4;
        written += 1;
        aTree[at] = tree.x;
        aTree[at + 1] = tree.y;
        aTree[at + 2] = tree.z;
        aTree[at + 3] = tree.height;
        aCard[at] = point[0] * tree.height;
        aCard[at + 1] = point[1] * tree.height;
        aCard[at + 2] = point[2] * tree.height;
        aCard[at + 3] = kind.card * tree.height * (kind.cards ? 1 : grow) * (0.8 + random() * 0.5);
        aShell[at] = point[3];
        aShell[at + 1] = point[4];
        aShell[at + 2] = point[5];
        // A larger card stands for a stretch of the crown's lit surface, not for one spray in its shade.
        aShell[at + 3] = point[6] + (1 - point[6]) * (1 - 1 / grow);
        const vary = 0.85 + random() * 0.3;
        aTint[at] = colour.r * vary;
        aTint[at + 1] = colour.g * vary;
        aTint[at + 2] = colour.b * vary;
        const twig = order === 0 && kind.picture === 'leaf' && point[6] > 0.8 && random() < ENV.trees.twigs;
        aTint[at + 3] = (twig ? ENV_LEAF_TILES.twig : picture) + (kind.cards ? 0 : Math.floor(random() * 2)) + 0.99 * Math.min(1, Math.max(0, tree.lit)) * 0.999;
      }
    }
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    geometry.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute('aTree', new THREE.InstancedBufferAttribute(aTree, 4));
    geometry.setAttribute('aCard', new THREE.InstancedBufferAttribute(aCard, 4));
    geometry.setAttribute('aShell', new THREE.InstancedBufferAttribute(aShell, 4));
    geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(aTint, 4));
    geometry.instanceCount = total;
    const crowns = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      vertexShader: ENV_CROWN_VERTEX,
      fragmentShader: ENV_CROWN_FRAGMENT,
      uniforms: { ...envUniforms(), uLeaves: { value: envLeafTexture() }, uCut: { value: ENV.trees.cut[Math.min(order, ENV.trees.cut.length - 1)] } },
      side: THREE.DoubleSide,
      alphaToCoverage: true,
      extensions: { derivatives: true },
      fog: false,
    }));
    crowns.frustumCulled = false;
    crowns.userData.env = 'crowns';
    crowns.userData.envFull = total;
    crowns.userData.envCard = grow;
    group.add(crowns);
    if (!band.trunk) return;
    const [sides, rings] = band.wood;
    const trunk = new THREE.CylinderGeometry(1, 1, 1, sides, rings, true);
    trunk.translate(0, 0.5, 0);
    const trunks = new THREE.InstancedBufferGeometry();
    trunks.setAttribute('position', trunk.attributes.position);
    trunks.setIndex(trunk.index);
    // The wood of each tree: its trunk, and (near enough to be seen) the limb that carries each mass of its crown.
    const bTree = [];
    const bFrom = [];
    const bTo = [];
    const bBark = [];
    for (const tree of members) {
      const kind = ENV_TREES[tree.kind];
      const tall = tree.height;
      const radius = kind.trunk * tall;
      const conifer = kind.shape === 'boughs';
      colour.set(kind.bark);
      const wood = (from, to) => {
        bTree.push(tree.x, tree.y, tree.z, tall);
        bFrom.push(...from);
        bTo.push(...to);
        bBark.push(colour.r, colour.g, colour.b, tree.lit);
      };
      // A conifer's trunk runs to its tip; a broadleaf's to where its limbs have all left it, or, where the limbs
      // are not drawn, on into the crown they would have carried (which else hangs in the air over a stump).
      const top = conifer ? kind.crown.at + kind.crown.tall * 0.96 : band.limbs ? Math.max(...tree.masses.map((mass) => mass.from[1])) : kind.crown.at + kind.crown.tall * 0.4;
      wood([0, -0.15, 0, radius], [0, top * tall, 0, radius * (conifer ? 0.12 : 0.6)]);
      if (!band.limbs) continue;
      for (const mass of tree.masses) {
        const thick = radius * (conifer ? 0.16 : 0.5);
        wood([mass.from[0] * tall, mass.from[1] * tall, mass.from[2] * tall, thick], [mass.x * tall, mass.y * tall, mass.z * tall, thick * 0.3]);
      }
    }
    trunks.setAttribute('aTree', new THREE.InstancedBufferAttribute(new Float32Array(bTree), 4));
    trunks.setAttribute('aFrom', new THREE.InstancedBufferAttribute(new Float32Array(bFrom), 4));
    trunks.setAttribute('aTo', new THREE.InstancedBufferAttribute(new Float32Array(bTo), 4));
    trunks.setAttribute('aBark', new THREE.InstancedBufferAttribute(new Float32Array(bBark), 4));
    trunks.instanceCount = bTree.length / 4;
    const stems = new THREE.Mesh(trunks, new THREE.ShaderMaterial({
      vertexShader: ENV_TRUNK_VERTEX,
      fragmentShader: ENV_TRUNK_FRAGMENT,
      uniforms: envUniforms(),
      fog: false,
    }));
    stems.frustumCulled = false;
    stems.userData.env = 'trunks';
    group.add(stems);
  });
  return group;
}

/** Draw `share` (0..1) of every crown's cards. */
export function envTreesQuality(group, share) {
  for (const mesh of group.children) {
    if (mesh.userData.envFull) mesh.geometry.instanceCount = Math.max(1, Math.floor(mesh.userData.envFull * share));
  }
}
