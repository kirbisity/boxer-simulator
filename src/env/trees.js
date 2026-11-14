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
    } else {
      // Needles: boughs fanning from the middle, each a spine with strokes along it.
      for (let bough = 0; bough < 13; bough += 1) {
        const angle = (bough / 13) * Math.PI * 2 + random() * 0.5;
        const from = tile * random() * 0.12;
        const reach = tile * (0.26 + random() * 0.18);
        for (let step = 1; step < 20; step += 1) {
          const at = from + (step / 20) * (reach - from);
          const px = cx + Math.cos(angle) * at;
          const py = cy + Math.sin(angle) * at;
          const shade = Math.round(115 + random() * 125);
          g.strokeStyle = `rgb(${shade},${shade},${shade})`;
          g.lineWidth = tile * 0.014;
          for (const side of [-1, 1]) {
            g.beginPath();
            g.moveTo(px, py);
            g.lineTo(px + Math.cos(angle + side * 0.9) * tile * 0.07, py + Math.sin(angle + side * 0.9) * tile * 0.07);
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
  through_ = exp(-(uEnvRayleigh.rgb + uEnvHaze.rgb * envHazeColumn(max(cameraPosition.y, 0.0), max(world.y, 0.0))) * distance_);
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
  vec3 light = uEnvSunColour * max(dot(normal, uEnvSunDir), 0.0) * aBark.w * envSunShare(world) * shade + mix(uEnvBounce, uEnvSkyLight, 0.5) * shade;
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
      const masses = envCrownMasses(kind, random);
      tree.masses = masses;
      // A tree's own colour between the kind's, and each card a little off it.
      colour.set(kind.leaf[0]).lerp(other.set(kind.leaf[1]), random()).lerp(other.set(kind.leaf[2]), random() * 0.5);
      const picture = kind.picture === 'needle' ? 2 : 0;
      for (let card = 0; card < band.cards; card += 1) {
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
      // A conifer's trunk runs to its tip; a broadleaf's to where its limbs have all left it.
      const top = conifer ? kind.crown.at + kind.crown.tall * 0.96 : Math.max(...tree.masses.map((mass) => mass.from[1]));
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
