// Grass (src/env/): rings of instanced blades that follow the camera over the land, standing on the near map's
// ground (terrain.js), as tall as the map lets them be, coloured as the ground under them is, and bent by the
// wind where each one stands (air.js envGust), so a gust is seen to come across the field and pass.

/* global THREE */

import { ENV } from './config.js';
import { ENV_GLSL, envUniforms } from './air.js';
import { ENV_GLSL_MAP, ENV_GLSL_SHADOW_FRAGMENT, ENV_GLSL_SHADOW_VERTEX, envShadowUniforms } from './terrain.js';
import { envRandom } from './noise.js';
import { ENV_GLSL_PRESS, ENV_PRESS, envPressUniforms } from './press.js';

const ENV_GRASS_VERTEX = /* glsl */ `
${ENV_GLSL_SHADOW_VERTEX}
${ENV_GLSL}
${ENV_GLSL_MAP}
${ENV_GLSL_PRESS}
// x: the tile's width (m); y: a blade's width at the root (m); z: how tall beside the place's grass; w: the radius inside which the ring is left to the finer one (m).
uniform vec4 uLayer;
// x, y: the least and most a blade stands (m); z: the share of tufts in flower; w: how much the blade turns to face the camera.
uniform vec4 uBlades;
// The root's share of the tip's brightness.
uniform float uRoot;
uniform vec3 uGrass;
uniform vec3 uDry;
uniform vec3 uFlowerA;
uniform vec3 uFlowerB;
// x: side (-1, 1; 0 at the tip); y: how far up the blade (0..1).
attribute vec2 aBlade;
// x, z: where in the tile; z, w: two random numbers.
attribute vec4 aRoot;
varying vec3 vLit;
varying vec3 vBase;

void main() {
  float tile = uLayer.x;
  // The tile is laid out ahead of the camera, and wraps round that point.
  vec2 centre = cameraPosition.xz + uEnvLook * tile * 0.3;
  vec2 xz = aRoot.xy + tile * floor((centre - aRoot.xy) / tile + 0.5);
  float out_ = length(xz - centre);
  float fade = (1.0 - smoothstep(0.36 * tile, 0.5 * tile, out_)) * smoothstep(uLayer.w * 0.7, uLayer.w, length(xz - cameraPosition.xz));
  vec4 map = envMap(xz);
  fade *= envInMap(xz);
  // Only what the camera sees is worked (the perception rule): a blade whose round (from its root to the tallest
  // a blade of this ring stands, laid over by as much) lies wholly outside the view, or that has faded to
  // nothing, is put off the picture before anything else is asked of it. A ring's tile stands all round the
  // eye, and about two thirds of its blades are out of a 50 degree view; blades are laid down cell by cell
  // (envBuildGrass), so neighbours in the draw stand together and are passed over together.
  {
    float reach = uBlades.y * uLayer.z * ${(1 + ENV.grass.rank.taller).toFixed(2)} + uLayer.y;
    vec4 clip = projectionMatrix * viewMatrix * vec4(xz.x, map.r + reach * 0.5, xz.y, 1.0);
    float sideX = reach * (abs(projectionMatrix[0][0]) + 1.0);
    float sideY = reach * (abs(projectionMatrix[1][1]) + 1.0);
    if (fade <= 0.0 || clip.x - clip.w > sideX || -clip.x - clip.w > sideX || clip.y - clip.w > sideY || -clip.y - clip.w > sideY || clip.w < -reach) {
      vLit = vec3(0.0);
      vBase = vec3(0.0);
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
  }

  float r1 = aRoot.z;
  float r2 = aRoot.w;
  float r3 = fract(r1 * 37.7 + r2 * 11.3);
  float snow = uEnvWet.y;
  // Rank tussocks: where the noise says so the grass stands taller and darker, a few metres of it together.
  float rank = smoothstep(${(1 - ENV.grass.rank.share).toFixed(2)}, ${(1.08 - ENV.grass.rank.share).toFixed(2)}, texture2D(uEnvNoise, xz / ${(ENV.grass.rank.size * 16).toFixed(1)} + 0.21).b * 0.7 + texture2D(uEnvNoise, xz / ${(ENV.grass.rank.size * 5).toFixed(1)}).g * 0.3);
  float tall = mix(uBlades.x, uBlades.y, r1) * map.g * uLayer.z * fade * (1.0 - 0.45 * snow) * (1.0 + ${ENV.grass.rank.taller.toFixed(2)} * rank);
  float t = aBlade.y;

  // The wind where this blade stands: the drag on a stem goes as the square of the air's speed.
  float speed = envGust(xz);
  float push = speed * speed / ${(ENV.wind.grassFlat * ENV.wind.grassFlat).toFixed(1)};
  float bend = push / sqrt(1.0 + push * push);
  // Its own shiver in the moving air.
  float shiver = sin(uEnvTime * (3.1 + 2.7 * r3) + r2 * 40.0) * 0.07 * min(speed * 0.35, 1.6);
  float turn = r2 * 6.2831853;
  vec2 rest = vec2(cos(turn), sin(turn)) * ${ENV.grass.lean.toFixed(2)} * (0.4 + r3);
  // What stands on it presses it over, away from the foot (where the pressed-ground record is not kept).
  vec3 bodies = envBodies(vec3(xz.x, map.r, xz.y));
  vec2 lean = rest + uEnvWind.xy * (bend * (0.75 + 0.5 * r3) + shiver) + bodies.xy * 1.2 * (1.0 - uEnvPressClock.w);
  float over = min(length(lean), 0.96);
  // What has passed over it (press.js): the blade is laid over until its tip is under the height the body left
  // clear, the way the record says it was pushed. A blade is caught wherever its own length lay under the body,
  // so it reads the record halfway along its standing lean (a tall blade leaning over a trodden lane goes down
  // with it), and a little off that, so a trail's edge is ragged as the blades are.
  vec4 pressed = envPress(xz + lean * tall * 0.5 + (vec2(r2, r3) - 0.5) * ${(ENV_PRESS.texel * 1.5).toFixed(3)});
  float laid = pressed.x < tall ? sqrt(max(1.0 - (pressed.x * pressed.x) / max(tall * tall, 1e-6), 0.0)) : 0.0;
  // How far it was laid past where it stood: a laid blade lies on top of the sward, out of its neighbours' shade.
  float trod = max(laid - over, 0.0);
  if (laid > over) {
    lean = length(pressed.zw) > 0.05 ? normalize(pressed.zw) + 0.35 * normalize(lean + vec2(1e-4, 0.0)) : lean;
    over = min(laid, 0.995);
  }
  lean = lean / max(length(lean), 1e-4) * over;

  // The blade is an arc of its own length: its tip comes down as it goes over.
  vec3 world = vec3(xz.x, map.r - 0.03, xz.y);
  world.xz += lean * tall * t * t;
  world.y += tall * t * mix(1.0, sqrt(1.0 - over * over), t);
  // Its width: across the lean, turned part way to the camera so a tuft does not vanish edge-on.
  vec2 toEye = normalize(cameraPosition.xz - xz + vec2(1e-4, 0.0));
  vec2 side = vec2(-sin(turn * 1.7), cos(turn * 1.7));
  side = normalize(mix(side, vec2(-toEye.y, toEye.x) * sign(dot(side, vec2(-toEye.y, toEye.x)) + 1e-4), uBlades.w));
  float width = uLayer.y * (1.0 - t * t) * (0.6 + 0.8 * r3);
  world.xz += side * aBlade.x * width * 0.5 * step(0.012, tall);

  // Colour: green to straw in broad patches and blade by blade, the root in its neighbours' shade.
  float dry = clamp(envDryAt(xz) + (r1 - 0.5) * 0.5, 0.0, 1.0);
  vec3 colour = mix(uGrass, uDry, dry * (1.0 - 0.5 * rank)) * (0.82 + 0.36 * r2) * (1.0 - ${ENV.grass.rank.darker.toFixed(2)} * rank);
  colour *= mix(mix(uRoot, 1.0, trod), 1.08, t);
  float flower = step(1.0 - uBlades.z, r3) * smoothstep(0.7, 0.9, t);
  colour = mix(colour, mix(uFlowerA, uFlowerB, step(0.5, r1)), flower);
  colour = mix(colour, vec3(0.92, 0.94, 0.97), snow * smoothstep(0.25, 0.8, t) * 0.85);
  colour *= 1.0 - 0.18 * uEnvWet.x;

  // Light: the field's surface leans with the blades; against the sun the leaf glows; a bent blade shows its gloss to the sky.
  // (A blade laid flat by a body lies in the ground's plane: its face turns up to the sky and the sun.)
  vec3 normal = normalize(vec3(-lean.x * 0.8 * (1.0 - trod), 1.0, -lean.y * 0.8 * (1.0 - trod)));
  vec3 view = normalize(world - cameraPosition);
  float facing = 0.35 + 0.65 * max(dot(normal, uEnvSunDir), 0.0);
  float through = pow(max(dot(view, uEnvSunDir), 0.0), 3.0) * ${ENV.grass.through.toFixed(2)} * t;
  vec2 cover = envCover(xz);
  float sunShare = map.b * cover.y * envSunShare(world);
  vec3 sunLight = uEnvSunColour * (facing + through) * sunShare;
  vec3 skyLight = (mix(uEnvBounce, uEnvSkyLight, 0.55 + 0.45 * t) + uEnvSkyLight * ${ENV.grass.sheen.toFixed(2)} * over * t) * cover.x * bodies.z;

  // The haze, worked here once a vertex: the lit part and the rest, so the fragment only applies the shadow. The
  // shade on the air before a blade is read at one point of its sight line, a different one for each blade (the
  // grain is the blade's own), so a sward takes the mean among its blades as a pixel of the land does among its steps.
  // Far off, where the blades are few and large and each would show as a fleck, all read the middle of the line.
  vec3 ray = world - cameraPosition;
  float distance_ = length(ray);
  vec3 depth_ = (uEnvRayleigh.rgb + uEnvHaze.rgb * envHazeColumn(max(cameraPosition.y, 0.0), max(world.y, 0.0))) * distance_;
  vec3 through_ = exp(-depth_);
  vLit = colour * sunLight * through_;
  // Wet, the blades' film mirrors the sky over them (ENV.terrain.wetFilm), as much as the sky is open to them.
  float film = uEnvWet.x * ${(ENV.terrain.wetFilm * ENV.terrain.wetMirror).toFixed(4)} * cover.x * bodies.z;
  vBase = mix(colour * skyLight, uEnvSkyLight, film) * through_ + envAirlightIn(ray / max(distance_, 1e-3), envAirShare(cameraPosition, ray, depth_.g, mix(fract(sin(dot(xz, vec2(12.9898, 78.233))) * 43758.5453), 0.5, smoothstep(${ENV.grass.shadeOwn[0].toFixed(1)}, ${ENV.grass.shadeOwn[1].toFixed(1)}, distance_)), ${ENV.air.shadeSteps[2]})) * (1.0 - through_);

  envShadowCoords(world, vec3(0.0, 1.0, 0.0));
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  // A blade with no height is not drawn.
  if (tall < 0.012) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const ENV_GRASS_FRAGMENT = /* glsl */ `
${ENV_GLSL_SHADOW_FRAGMENT}
varying vec3 vLit;
varying vec3 vBase;
void main() {
  gl_FragColor = vec4(vLit * getShadowMask() + vBase, 1.0);
  #include <tonemapping_fragment>
}`;

/**
 * Order a ring's roots ([x, z, r1, r2] per blade) so that blades drawn together stand together: in
 * ENV.grass.cells[1] runs, each the whole tile at an even sprinkle (a tier draws a share of the count from the
 * front, envGrassQuality, and a share that is a whole number of runs is still even over the tile), and within a
 * run by the cell of a ENV.grass.cells[0]-square grid the blade falls in, the cells taken in rows.
 */
function envGrassCells(roots, tile) {
  const [cells, runs] = ENV.grass.cells;
  const count = roots.length / 4;
  const order = Array.from({ length: count }, (_, at) => at);
  const cellOf = (at) => Math.min(cells - 1, Math.floor((roots[at * 4 + 1] / tile) * cells)) * cells + Math.min(cells - 1, Math.floor((roots[at * 4] / tile) * cells));
  const keys = new Int32Array(count);
  for (let at = 0; at < count; at += 1) keys[at] = Math.floor((at / count) * runs) * cells * cells + cellOf(at);
  order.sort((a, b) => keys[a] - keys[b] || a - b);
  const copy = roots.slice();
  order.forEach((from, to) => roots.set(copy.subarray(from * 4, from * 4 + 4), to * 4));
}

/** One blade: `segments` quads tapering to a point. */
function envBladeGeometry(segments) {
  const blade = [];
  const index = [];
  for (let row = 0; row < segments; row += 1) blade.push(-1, row / segments, 1, row / segments);
  blade.push(0, 1);
  for (let row = 0; row < segments - 1; row += 1) {
    const a = row * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const last = (segments - 1) * 2;
  index.push(last, last + 1, last + 2);
  return { blade: new Float32Array(blade), index };
}

/**
 * The grass of a place: a group of one mesh a ring (ENV.grass.layers). `place` the description; `map` the near
 * map's uniform. Each mesh's userData.envFull is its whole count, for the quality tiers to draw a share of.
 */
export function envBuildGrass({ place, map }) {
  const group = new THREE.Group();
  const random = envRandom(place.terrain.seed * 131 + 7);
  const grass = place.grass;
  const flowers = grass.flowerColours ?? [];
  ENV.grass.layers.forEach((layer, order) => {
    const { blade, index } = envBladeGeometry(layer.segments);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('aBlade', new THREE.BufferAttribute(blade, 2));
    // (three wants a `position` to count the vertices by.)
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((blade.length / 2) * 3), 3));
    geometry.setIndex(index);
    const roots = new Float32Array(layer.count * 4);
    for (let at = 0; at < roots.length; at += 4) {
      roots[at] = random() * layer.tile;
      roots[at + 1] = random() * layer.tile;
      roots[at + 2] = random();
      roots[at + 3] = random();
    }
    // Laid down cell by cell, so blades drawn together stand together and the vertex stage passes over a cell
    // out of view as a whole (envGrassCells).
    envGrassCells(roots, layer.tile);
    geometry.setAttribute('aRoot', new THREE.InstancedBufferAttribute(roots, 4));
    geometry.instanceCount = layer.count;
    const inner = order === 0 ? 0 : ENV.grass.layers[order - 1].tile * 0.4;
    const material = new THREE.ShaderMaterial({
      vertexShader: ENV_GRASS_VERTEX,
      fragmentShader: ENV_GRASS_FRAGMENT,
      uniforms: {
        ...envShadowUniforms(),
        ...envUniforms(),
        ...envPressUniforms(),
        uEnvMap: map,
        uEnvCover: map.cover,
        uLayer: { value: new THREE.Vector4(layer.tile, layer.width, layer.tall, inner) },
        uBlades: { value: new THREE.Vector4(grass.height[0], grass.height[1], order === 0 ? 0 : grass.flowers, Math.min(0.85, 0.35 + 0.25 * order)) },
        uRoot: { value: layer.root },
        uGrass: { value: new THREE.Color(place.ground.grass) },
        uDry: { value: new THREE.Color(place.ground.dry) },
        uFlowerA: { value: new THREE.Color(flowers[0] ?? 0xffffff) },
        uFlowerB: { value: new THREE.Color(flowers[1] ?? flowers[0] ?? 0xffffff) },
      },
      side: THREE.DoubleSide,
      lights: true,
      fog: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.userData.env = 'grass';
    mesh.userData.envFull = layer.count;
    mesh.userData.envWidth = layer.width;
    mesh.userData.envRing = order;
    group.add(mesh);
  });
  group.userData.env = 'grass';
  return group;
}

/** Draw `share` (0..1) of the two nearest rings' blades and `far` of the others', each widened to cover the same ground. */
export function envGrassQuality(group, share, far) {
  for (const mesh of group.children) {
    const part = mesh.userData.envRing < 2 ? share : far;
    mesh.geometry.instanceCount = Math.max(1, Math.floor(mesh.userData.envFull * part));
    mesh.material.uniforms.uLayer.value.y = mesh.userData.envWidth / Math.sqrt(part);
  }
}
