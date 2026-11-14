// Trees (src/env/): planted where the place's stands say and the woods noise allows, each a tapering trunk and a
// crown of leaf cards filling the kind's envelope (config.js ENV_TREES), shaded as a mass (lit on the sun's side,
// dark inside and beneath, glowing at the rim against the sun). The whole tree leans with the gust at its foot and
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
      if (Math.abs(x) < keepOut[0] + 4 && Math.abs(z) < keepOut[1] + 4) continue;
      if (chance > 1 - stand.clump + stand.clump * envWoodsAt(x, z, place.terrain.seed)) continue;
      if (footprints.some((print) => Math.abs(x - print.x) < print.halfX + 2.5 && Math.abs(z - print.z) < print.halfZ + 2.5)) continue;
      const y = height(x, z);
      const tall = kind.height[0] + (kind.height[1] - kind.height[0]) * size;
      trees.push({ kind: stand.kind, x, y, z, height: tall, lit: envSunPast(height, sun, x, y + tall * kind.crown.at, z) });
      planted += 1;
    }
  }
  return trees;
}

/** The round shadows a place's trees lay on the near map (terrain.js envBuildNearMap): crowns, moved to where the sun puts them. */
export function envTreeShadows(trees, sun) {
  const shadows = [];
  const reach = ENV.terrain.mapHalf * 1.2;
  const slant = Math.min(8, 1 / Math.max(0.05, sun[1] / Math.hypot(sun[0], sun[2])));
  const flat = Math.hypot(sun[0], sun[2]) || 1;
  for (const tree of trees) {
    if (Math.abs(tree.x) > reach || Math.abs(tree.z) > reach || tree.lit <= 0) continue;
    const kind = ENV_TREES[tree.kind];
    // Three rounds up the crown: a low sun draws them out into the long shadow it casts.
    for (const part of [-0.6, 0, 0.6]) {
      const up = tree.height * (kind.crown.at + kind.crown.tall * part);
      shadows.push({
        x: tree.x - (sun[0] / flat) * up * slant,
        z: tree.z - (sun[2] / flat) * up * slant,
        radius: tree.height * kind.crown.wide * (part === 0 ? 1.15 : 0.9),
        depth: 0.34,
      });
    }
  }
  return shadows;
}

// ---- the leaf-card picture ------------------------------------------------------------------------------------------

let envLeafTextureMade = null;

/** The leaf cards' atlas (made once): two sprays of broad leaves, two of needles, white with shading, to be tinted. */
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
    if (cell < 2) {
      // Broad leaves: a loose spray, the ones drawn last (nearest) lightest.
      for (let leaf = 0; leaf < 46; leaf += 1) {
        const angle = random() * Math.PI * 2;
        const out = Math.sqrt(random()) * tile * 0.4;
        const shade = Math.round(150 + (leaf / 46) * 70 + random() * 35);
        g.fillStyle = `rgb(${shade},${shade},${shade})`;
        g.beginPath();
        g.ellipse(cx + Math.cos(angle) * out, cy + Math.sin(angle) * out, tile * (0.05 + random() * 0.035), tile * (0.028 + random() * 0.02), random() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      // Needles: boughs fanning from the middle, each a spine with strokes along it.
      for (let bough = 0; bough < 9; bough += 1) {
        const angle = (bough / 9) * Math.PI * 2 + random() * 0.5;
        const reach = tile * (0.3 + random() * 0.14);
        for (let step = 2; step < 14; step += 1) {
          const at = (step / 14) * reach;
          const px = cx + Math.cos(angle) * at;
          const py = cy + Math.sin(angle) * at;
          const shade = Math.round(140 + random() * 100);
          g.strokeStyle = `rgb(${shade},${shade},${shade})`;
          g.lineWidth = tile * 0.035;
          for (const side of [-1, 1]) {
            g.beginPath();
            g.moveTo(px, py);
            g.lineTo(px + Math.cos(angle + side * 1.0) * tile * 0.085, py + Math.sin(angle + side * 1.0) * tile * 0.085);
            g.stroke();
          }
        }
      }
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
  through_ = exp(-(uEnvRayleigh.rgb + uEnvRayleigh.a * envHazeColumn(max(cameraPosition.y, 0.0), max(world.y, 0.0))) * distance_);
  air_ = envAirlight(ray / max(distance_, 1e-3)) * (1.0 - through_);
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
  if (leaf.a < uCut) discard;
  gl_FragColor = vec4(vColour * (leaf.rgb * 1.3) + vAir, 1.0);
  #include <tonemapping_fragment>
}`;

const ENV_TRUNK_VERTEX = /* glsl */ `
${ENV_GLSL}
${ENV_GLSL_SWAY}
${ENV_GLSL_HAZE_SPLIT}
attribute vec4 aTree;
// x: the trunk's radius at the foot (m); y: how high it runs (m); z: the sun past the hills; w: unused.
attribute vec4 aTrunk;
attribute vec3 aBark;
varying vec3 vColour;
varying vec3 vAir;
void main() {
  float up = position.y * aTrunk.y;
  // A flare at the foot, a taper to the crown.
  float radius = aTrunk.x * (1.0 - 0.55 * position.y + 0.5 * pow(1.0 - position.y, 6.0));
  vec3 world = aTree.xyz + vec3(position.x * radius, up - 0.15, position.z * radius) + envSway(aTree.xyz, aTree.w, up);
  vec3 normal = normalize(vec3(position.x, 0.0, position.z));
  // Under its own crown: little sun, the sky's light cut by the leaves above.
  float shade = mix(0.9, 0.45, position.y);
  vec3 light = uEnvSunColour * max(dot(normal, uEnvSunDir), 0.0) * aTrunk.z * envSunShare(world) * shade + mix(uEnvBounce, uEnvSkyLight, 0.5) * shade;
  vec3 through_;
  envHazeSplit(world, through_, vAir);
  vColour = aBark * (1.0 - 0.3 * uEnvWet.x) * light * through_;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const ENV_TRUNK_FRAGMENT = /* glsl */ `
varying vec3 vColour;
varying vec3 vAir;
void main() {
  gl_FragColor = vec4(vColour + vAir, 1.0);
  #include <tonemapping_fragment>
}`;

// ---- building --------------------------------------------------------------------------------------------------------

/** A point in a kind's crown envelope: into `out` [x, y, z from the foot (shares of the height), nx, ny, nz, depth]. */
function envCrownPoint(kind, random, blobs, out) {
  const crown = kind.crown;
  if (kind.shape === 'cone') {
    const u = Math.pow(random(), 0.8);
    const angle = random() * Math.PI * 2;
    // Tiers of boughs: the spire is stepped, wider at each whorl.
    const whorl = 0.72 + 0.28 * Math.abs(Math.sin(u * Math.PI * 5));
    const depth = 0.5 + 0.5 * Math.sqrt(random());
    const radius = crown.wide * Math.pow(1 - u, 0.85) * whorl * depth;
    out[0] = Math.cos(angle) * radius;
    out[1] = crown.at - crown.tall + 2 * crown.tall * u;
    out[2] = Math.sin(angle) * radius;
    const lift = 0.35 + 0.5 * u;
    const length = Math.hypot(1, lift);
    out[3] = Math.cos(angle) / length;
    out[4] = lift / length;
    out[5] = Math.sin(angle) / length;
    out[6] = depth;
    return out;
  }
  // Round: a few overlapping masses of foliage, the cards on their outsides.
  const blob = blobs[Math.floor(random() * blobs.length)];
  let nx = random() * 2 - 1;
  let ny = random() * 2 - 1;
  let nz = random() * 2 - 1;
  const length = Math.hypot(nx, ny, nz) || 1;
  nx /= length;
  ny /= length;
  nz /= length;
  const shell = 0.6 + 0.4 * Math.sqrt(random());
  const px = blob[0] + nx * blob[3] * shell;
  const py = blob[1] + ny * blob[3] * shell * 0.85;
  const pz = blob[2] + nz * blob[3] * shell;
  out[0] = px * crown.wide;
  out[1] = crown.at + py * crown.tall;
  out[2] = pz * crown.wide;
  // The surface faces out from the whole crown more than from its own mass: the crown shades as one.
  const whole = Math.hypot(px, py, pz) || 1;
  const fx = nx * 0.4 + (px / whole) * 0.6;
  const fy = ny * 0.4 + (py / whole) * 0.6;
  const fz = nz * 0.4 + (pz / whole) * 0.6;
  const facing = Math.hypot(fx, fy, fz) || 1;
  out[3] = fx / facing;
  out[4] = fy / facing;
  out[5] = fz / facing;
  out[6] = Math.min(1, whole);
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
    const total = members.length * band.cards;
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
      const blobs = [[0, 0, 0, 0.72]];
      for (let blob = 0; blob < 5; blob += 1) {
        const angle = random() * Math.PI * 2;
        const lift = random() * 1.3 - 0.45;
        blobs.push([Math.cos(angle) * 0.52, lift * 0.55, Math.sin(angle) * 0.52, 0.42 + random() * 0.2]);
      }
      // A tree's own colour between the kind's, and each card a little off it.
      colour.set(kind.leaf[0]).lerp(other.set(kind.leaf[1]), random()).lerp(other.set(kind.leaf[2]), random() * 0.5);
      const picture = kind.picture === 'needle' ? 2 : 0;
      for (let card = 0; card < band.cards; card += 1) {
        envCrownPoint(kind, random, blobs, point);
        const at = order_[written] * 4;
        written += 1;
        aTree[at] = tree.x;
        aTree[at + 1] = tree.y;
        aTree[at + 2] = tree.z;
        aTree[at + 3] = tree.height;
        aCard[at] = point[0] * tree.height;
        aCard[at + 1] = point[1] * tree.height;
        aCard[at + 2] = point[2] * tree.height;
        aCard[at + 3] = kind.card * tree.height * grow * (0.8 + random() * 0.5);
        aShell[at] = point[3];
        aShell[at + 1] = point[4];
        aShell[at + 2] = point[5];
        aShell[at + 3] = point[6];
        const vary = 0.85 + random() * 0.3;
        aTint[at] = colour.r * vary;
        aTint[at + 1] = colour.g * vary;
        aTint[at + 2] = colour.b * vary;
        aTint[at + 3] = picture + Math.floor(random() * 2) + 0.99 * Math.min(1, Math.max(0, tree.lit)) * 0.999;
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
      uniforms: { ...envUniforms(), uLeaves: { value: envLeafTexture() }, uCut: { value: order === 0 ? 0.5 : 0.38 } },
      side: THREE.DoubleSide,
      fog: false,
    }));
    crowns.frustumCulled = false;
    crowns.userData.env = 'crowns';
    crowns.userData.envFull = total;
    crowns.userData.envCard = grow;
    group.add(crowns);
    if (!band.trunk) return;
    const sides = order === 0 ? 8 : 5;
    const trunk = new THREE.CylinderGeometry(1, 1, 1, sides, 4, true);
    trunk.translate(0, 0.5, 0);
    const trunks = new THREE.InstancedBufferGeometry();
    trunks.setAttribute('position', trunk.attributes.position);
    trunks.setIndex(trunk.index);
    const bTree = new Float32Array(members.length * 4);
    const bTrunk = new Float32Array(members.length * 4);
    const bBark = new Float32Array(members.length * 3);
    members.forEach((tree, index) => {
      const kind = ENV_TREES[tree.kind];
      bTree.set([tree.x, tree.y, tree.z, tree.height], index * 4);
      bTrunk.set([kind.trunk * tree.height, tree.height * (kind.shape === 'cone' ? kind.crown.at + kind.crown.tall * 0.8 : kind.crown.at), tree.lit, 0], index * 4);
      colour.set(kind.bark);
      bBark.set([colour.r, colour.g, colour.b], index * 3);
    });
    trunks.setAttribute('aTree', new THREE.InstancedBufferAttribute(bTree, 4));
    trunks.setAttribute('aTrunk', new THREE.InstancedBufferAttribute(bTrunk, 4));
    trunks.setAttribute('aBark', new THREE.InstancedBufferAttribute(bBark, 3));
    trunks.instanceCount = members.length;
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
