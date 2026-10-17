// Ground styles: living (proof of concept). See src/scenery.js (GROUND) for the contract.
//
// The place's own painted ground stays; on top of it go geometry and life:
// instanced grass that sways in the wind (a vertex shader on a shared clock),
// flowers, stones half sunk, a gentle micro-relief outside the fighting floor
// (the place's own material on a ring of land), decals for mud, prints and
// stains, and water that moves (rain rings on puddles, ripples on a pond, a
// glossy film at the tide line) and catches the lamps. The fighting floor
// stays flat at y = 0: inside it nothing stands taller than a short tuft.

/* global THREE */
import { BLOOD_DYE_GLSL, bloodDyeShader } from '../blooddye.js';

/** The one dial: 1 is the full look, 0.5 halves every scatter (grass, flowers, stones, leaves). */
const LIVING_DENSITY = 1;
const LIVING_SHORE_X = 25;

// ---- noise, sampling ---------------------------------------------------------

function livingHash(x, z, seed) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in −1…1. */
function livingNoise(x, z, seed = 0) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = livingHash(xi, zi, seed);
  const b = livingHash(xi + 1, zi, seed);
  const c = livingHash(xi, zi + 1, seed);
  const d = livingHash(xi + 1, zi + 1, seed);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

function livingFbm(x, z, seed = 0, octaves = 3) {
  let sum = 0;
  let amplitude = 0.5;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += livingNoise(x, z, seed + octave * 17) * amplitude;
    norm += amplitude;
    x *= 2.03;
    z *= 2.03;
    amplitude *= 0.5;
  }
  return sum / norm;
}

const livingSmooth = (edge0, edge1, value) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** How far (x, z) lies outside the fighting floor (negative inside). */
const livingOutside = (arena, x, z) => Math.max(Math.abs(x) - arena.halfX, Math.abs(z) - arena.halfZ);

/**
 * Points over a box, kept with probability density(x, z) (0…1); `perSquareMetre` at density 1, scaled by the dial.
 * Returns [{ x, z, keep }] where keep is the density at the point.
 */
function livingSample(rng, { box: [x0, z0, x1, z1], perSquareMetre, density }) {
  const tries = Math.round((x1 - x0) * (z1 - z0) * perSquareMetre * LIVING_DENSITY);
  const points = [];
  for (let index = 0; index < tries; index += 1) {
    const x = x0 + rng() * (x1 - x0);
    const z = z0 + rng() * (z1 - z0);
    const keep = density(x, z);
    if (keep > 0 && rng() < keep) points.push({ x, z, keep });
  }
  return points;
}

// ---- the shared clock and the materials --------------------------------------

const livingClock = { value: 0 };
const LIVING_WHITE = new THREE.Color(1, 1, 1);
function livingTick() {
  livingClock.value = performance.now() / 1000;
}

/**
 * Lambert, vertex colours, instanced, swaying: the tip of each instance
 * (local y = 1) pushed downwind by gusts that roll across the ground.
 * Both faces lit as the front (grass has no dark underside).
 */
function livingSwayMaterial({ sway = 0.25, wind = [0.8, 0.6], side = THREE.DoubleSide } = {}) {
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side });
  const swayUniform = { value: sway };
  const windUniform = { value: new THREE.Vector2(...wind).normalize() };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.livingTime = livingClock;
    shader.uniforms.livingSway = swayUniform;
    shader.uniforms.livingWindDir = windUniform;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float livingTime;\nuniform float livingSway;\nuniform vec2 livingWindDir;\nvoid main() {')
      .replace('#include <project_vertex>', `
vec4 mvPosition = vec4( transformed, 1.0 );
vec2 livingRoot = vec2( 0.0 );
float livingTall = 1.0;
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  livingRoot = instanceMatrix[ 3 ].xz;
  livingTall = length( instanceMatrix[ 1 ].xyz );
#endif
float livingRise = clamp( transformed.y, 0.0, 1.0 );
float livingGust = sin( livingTime * 1.5 - dot( livingRoot, livingWindDir ) * 0.32 ) * 0.5 + 0.5;
livingGust *= 0.6 + 0.4 * sin( livingTime * 0.37 + livingRoot.x * 0.05 );
float livingFlick = sin( livingTime * 4.7 + livingRoot.x * 3.1 + livingRoot.y * 2.3 + transformed.x * 9.0 ) * 0.22;
vec2 livingPush = livingWindDir * ( livingGust + livingFlick ) * livingSway * livingRise * livingRise * livingTall;
mvPosition.xz += livingPush;
mvPosition.y -= dot( livingPush, livingPush ) * 0.6 / max( livingTall, 0.01 );
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`);
    shader.fragmentShader = shader.fragmentShader
      .replace('( gl_FrontFacing ) ? vLightFront : vLightBack', 'vLightFront')
      .replace('( gl_FrontFacing ) ? vIndirectFront : vIndirectBack', 'vIndirectFront');
  };
  material.customProgramCacheKey = () => 'living-sway';
  return material;
}

/** Faceted, still things (stones, leaves, shells): Lambert with instance colours. */
const livingSolid = (options = {}) => new THREE.MeshLambertMaterial({ color: 0xffffff, ...options });

const LIVING_WATER_LAMPS = 6;

/**
 * Standing water: very smooth MeshStandard on the look's sky cube, its
 * normal made in the shader from world position and time: rain rings
 * (`rain` 1), wind ripples (`wave`), an oil film inside a circle, and a
 * glint of each lamp (streaked, as on wet ground) added after the lighting.
 */
function livingWaterMaterial({ color = 0x14181a, roughness = 0.05, metalness = 0.05, rain = 0, wave = 1, lamps = [], lampColour = 0xffa24a, lampGain = 0, oil = [0, 0, 0], alphaMap = null, opacity = 1, envMap = null, envMapIntensity = 1 } = {}) {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness, envMap, envMapIntensity, transparent: !!alphaMap || opacity < 1, opacity, alphaMap, depthWrite: !alphaMap, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const lampList = Array.from({ length: LIVING_WATER_LAMPS }, (_, index) => (lamps[index] ? lamps[index].clone() : new THREE.Vector3(0, -1000, 0)));
  const uniforms = {
    livingRain: { value: rain },
    livingWave: { value: wave },
    livingLamps: { value: lampList },
    livingLampColour: { value: new THREE.Color(lampColour) },
    livingLampGain: { value: lampGain },
    livingOil: { value: new THREE.Vector3(...oil) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { livingTime: livingClock });
    bloodDyeShader(shader);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vLivingWorld;\nvoid main() {')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLivingWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `
varying vec3 vLivingWorld;
uniform float livingTime;
uniform float livingRain;
uniform float livingWave;
uniform vec3 livingLamps[ ${LIVING_WATER_LAMPS} ];
uniform vec3 livingLampColour;
uniform float livingLampGain;
uniform vec3 livingOil;
${BLOOD_DYE_GLSL}
float livingHash1( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
vec2 livingRing( vec2 p, float cell, float seed ) {
  vec2 q = p / cell;
  vec2 id = floor( q );
  vec2 f = q - id;
  float phase = fract( livingTime * 0.9 + livingHash1( id + seed ) );
  vec2 centre = vec2( 0.3 + 0.4 * livingHash1( id + seed + 3.1 ), 0.3 + 0.4 * livingHash1( id + seed + 7.7 ) );
  vec2 dv = f - centre;
  float d = length( dv ) + 1e-4;
  float u = d - phase * 0.42;
  float fade = ( 1.0 - phase ) * ( 1.0 - phase );
  float slope = 42.0 * cos( 42.0 * u ) * exp( -u * u * 260.0 ) * fade;
  return dv / d * slope * 0.0045;
}
void main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float livingBlood = bloodDyeAt( vLivingWorld.xz );
diffuseColor.rgb = mix( diffuseColor.rgb, bloodDyeColour, livingBlood );`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
vec2 livingP = vLivingWorld.xz;
vec2 livingGrad = vec2( 0.0 );
livingGrad += livingWave * 0.030 * cos( dot( livingP, vec2( 6.1, 2.3 ) ) + livingTime * 1.9 ) * vec2( 6.1, 2.3 ) / 6.5;
livingGrad += livingWave * 0.022 * cos( dot( livingP, vec2( -3.7, 7.9 ) ) + livingTime * 2.6 ) * vec2( -3.7, 7.9 ) / 8.7;
livingGrad += livingWave * 0.012 * cos( dot( livingP, vec2( 15.3, -11.1 ) ) + livingTime * 4.1 ) * vec2( 15.3, -11.1 ) / 18.9;
if ( livingRain > 0.0 ) {
  livingGrad += livingRain * livingRing( livingP, 0.55, 0.0 );
  livingGrad += livingRain * livingRing( livingP + vec2( 0.27, 0.19 ), 0.55, 11.0 );
  livingGrad += livingRain * livingRing( livingP + vec2( 0.11, 0.41 ), 0.4, 23.0 );
}
vec3 livingNormal = normalize( vec3( -livingGrad.x, 1.0, -livingGrad.y ) );
normal = normalize( ( viewMatrix * vec4( livingNormal, 0.0 ) ).xyz );`)
      .replace('#include <tonemapping_fragment>', `
vec3 livingLook = normalize( vLivingWorld - cameraPosition );
vec3 livingRefl = reflect( livingLook, livingNormal );
vec3 livingSide = normalize( cross( livingLook, vec3( 0.0, 1.0, 0.0 ) ) + 1e-5 );
vec3 livingGlint = vec3( 0.0 );
for ( int i = 0; i < ${LIVING_WATER_LAMPS}; i ++ ) {
  vec3 toLamp = normalize( livingLamps[ i ] - vLivingWorld );
  vec3 miss = livingRefl - toLamp;
  float across = dot( miss, livingSide );
  float along = length( miss - livingSide * across );
  livingGlint += livingLampColour * ( exp( -across * across * 5000.0 - along * along * 260.0 ) * 2.6 + exp( -across * across * 400.0 - along * along * 14.0 ) * 0.3 + exp( -across * across * 40.0 - along * along * 4.0 ) * 0.05 );
}
gl_FragColor.rgb += livingGlint * livingLampGain;
gl_FragColor.rgb *= mix( vec3( 1.0 ), bloodDyeFilter, livingBlood );
if ( livingOil.z > 0.0 ) {
  float livingFilm = 1.0 - smoothstep( livingOil.z * 0.4, livingOil.z, length( vLivingWorld.xz - livingOil.xy ) );
  float livingBand = sin( vLivingWorld.x * 3.1 + vLivingWorld.z * 2.3 + sin( vLivingWorld.z * 4.7 ) * 1.5 ) * 0.5 + 0.5;
  vec3 livingRainbow = 0.5 + 0.5 * cos( 6.2832 * ( livingBand + vec3( 0.0, 0.33, 0.67 ) ) );
  gl_FragColor.rgb += livingRainbow * livingFilm * 0.09;
}
#include <tonemapping_fragment>`);
  };
  material.customProgramCacheKey = () => 'living-water';
  material.userData.livingWater = true;
  return material;
}

// ---- geometry ----------------------------------------------------------------

/**
 * A clump of curved, tapered blades, unit tall (local y 0…1 is how far up the
 * blade, which the sway reads), coloured dark at the root to light at the tip.
 */
function livingClumpGeometry({ blades = 6, levels = 3, spread = 0.12, width = 0.07, lean = 0.35, tip = [1.12, 1.1, 0.82], root = [0.42, 0.48, 0.36], seed = 1, fixed = null } = {}) {
  let state = seed * 9301 + 49297;
  const rng = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
  const positions = [];
  const normals = [];
  const colours = [];
  const index = [];
  for (let blade = 0; blade < blades; blade += 1) {
    const at = rng() * Math.PI * 2;
    const reach = Math.sqrt(rng()) * spread;
    const ox = Math.cos(at) * reach;
    const oz = Math.sin(at) * reach;
    const tall = fixed ?? 0.6 + 0.4 * rng();
    const heading = at + (rng() - 0.5) * 1.2;
    const hx = Math.cos(heading);
    const hz = Math.sin(heading);
    const bend = lean * (0.4 + rng());
    const sx = -hz;
    const sz = hx;
    const halfWidth = width * (0.7 + 0.6 * rng()) * 0.5;
    const first = positions.length / 3;
    const facing = new THREE.Vector3(hx * 0.35, 1, hz * 0.35).normalize();
    for (let level = 0; level <= levels; level += 1) {
      const t = level / levels;
      const out = bend * t * t * tall;
      const y = tall * t * (1 - 0.25 * bend * t);
      const cx = ox + hx * out;
      const cz = oz + hz * out;
      const w = level === levels ? 0 : halfWidth * Math.pow(1 - t, 0.6);
      const colour = root.map((value, channel) => value + (tip[channel] - value) * Math.pow(t, 0.8));
      if (level === levels) {
        positions.push(cx, y, cz);
        normals.push(facing.x, facing.y, facing.z);
        colours.push(...colour);
      } else {
        positions.push(cx - sx * w, y, cz - sz * w, cx + sx * w, y, cz + sz * w);
        normals.push(facing.x, facing.y, facing.z, facing.x, facing.y, facing.z);
        colours.push(...colour, ...colour);
      }
    }
    for (let level = 0; level < levels - 1; level += 1) {
      const a = first + level * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const last = first + (levels - 1) * 2;
    index.push(last, last + 1, last + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(index);
  return geometry;
}

/** A flower head: a star of petals round a centre at local y = 1 (on a unit stem), facing up. */
function livingHeadGeometry({ petals = 8, radius = 0.12, centre = [1, 0.8, 0.2], rim = [1, 1, 1] } = {}) {
  const positions = [0, 1.01, 0];
  const colours = [...centre];
  for (let point = 0; point < petals * 2; point += 1) {
    const angle = (point / (petals * 2)) * Math.PI * 2;
    const r = point % 2 ? radius * 0.45 : radius;
    positions.push(Math.cos(angle) * r, 1 - (point % 2 ? 0 : 0.03), Math.sin(angle) * r);
    colours.push(...(point % 2 ? centre.map((value, channel) => (value + rim[channel]) / 2) : rim));
  }
  const index = [];
  for (let point = 0; point < petals * 2; point += 1) index.push(0, 1 + ((point + 1) % (petals * 2)), 1 + point);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(positions.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(index);
  return geometry;
}

/** A thin stem, unit tall, a little bowed. */
function livingStemGeometry() {
  return livingClumpGeometry({ blades: 1, levels: 2, spread: 0, width: 0.035, lean: 0, fixed: 1, tip: [0.4, 0.62, 0.25], root: [0.3, 0.45, 0.2], seed: 3 });
}

/** A lumpy faceted stone, radius about 1, centred on the origin. */
function livingRockGeometry(seed = 1, detail = 0) {
  const geometry = new THREE.IcosahedronGeometry(1, detail).toNonIndexed();
  const position = geometry.attributes.position;
  const bumps = new Map();
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    if (!bumps.has(key)) bumps.set(key, 0.78 + 0.4 * livingHash(Math.round(x * 100), Math.round(z * 100 + y * 37), seed));
    const bump = bumps.get(key);
    position.setXYZ(index, x * bump, y * bump, z * bump);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A sett: a rounded-rectangle footprint (unit half-size) domed to a flattish top at y = 1, its foot just below y = 0. */
function livingSettGeometry(points = 12) {
  const outline = [];
  for (let point = 0; point < points; point += 1) {
    const angle = (point / points) * Math.PI * 2 + Math.PI / points;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    // A superellipse: squarish with round corners.
    outline.push([Math.sign(c) * Math.pow(Math.abs(c), 0.45), Math.sign(s) * Math.pow(Math.abs(s), 0.45)]);
  }
  const positions = [0, 1, 0];
  for (const [x, z] of outline) positions.push(x * 0.72, 0.82, z * 0.72);
  for (const [x, z] of outline) positions.push(x, -0.1, z);
  const index = [];
  for (let point = 0; point < points; point += 1) {
    const next = (point + 1) % points;
    index.push(0, 1 + next, 1 + point);
    const a = 1 + point;
    const b = 1 + next;
    const c = 1 + points + point;
    const d = 1 + points + next;
    index.push(a, b, c, b, d, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** A flat quad (a leaf, a straw), unit long along x, lying in the xz plane. */
function livingFlatGeometry(shape = 'leaf') {
  const geometry = new THREE.BufferGeometry();
  const positions = shape === 'leaf'
    ? [-0.5, 0, 0, 0, 0.012, -0.32, 0.5, 0, 0, 0, 0.012, 0.32]
    : [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0.5, 0.5, 0, 1, 0.5, 0.5, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

/**
 * Many copies of one geometry, split into angular sectors round the centre
 * so the camera culls those behind it. items: { x, y, z, sx, sy, sz, ry, rx, rz, colour }.
 */
function livingInstanced(geometry, material, items, { sectors = 1, receive = true, cast = false } = {}) {
  const group = new THREE.Group();
  if (!items.length) return group;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const buckets = Array.from({ length: sectors }, () => []);
  for (const item of items) {
    const sector = sectors === 1 ? 0 : Math.min(sectors - 1, Math.floor(((Math.atan2(item.z, item.x) + Math.PI) / (Math.PI * 2)) * sectors));
    buckets[sector].push(item);
  }
  const at = new THREE.Object3D();
  at.rotation.order = 'YXZ';
  for (const bucket of buckets) {
    if (!bucket.length) continue;
    const shared = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) shared.setAttribute(name, attribute);
    shared.setIndex(geometry.index);
    const mesh = new THREE.InstancedMesh(shared, material, bucket.length);
    const centre = new THREE.Vector3();
    for (const item of bucket) centre.add(new THREE.Vector3(item.x, item.y, item.z));
    centre.divideScalar(bucket.length);
    let radius = 0;
    bucket.forEach((item, index) => {
      at.position.set(item.x, item.y, item.z);
      at.rotation.set(item.rx ?? 0, item.ry ?? 0, item.rz ?? 0);
      at.scale.set(item.sx, item.sy ?? item.sx, item.sz ?? item.sx);
      at.updateMatrix();
      mesh.setMatrixAt(index, at.matrix);
      // Every copy gets a colour (white if none): r128 keeps one program per material, which must always find instanceColor.
      mesh.setColorAt(index, item.colour ?? LIVING_WHITE);
      const reach = centre.distanceTo(at.position) + geometry.boundingSphere.radius * Math.max(item.sx, item.sy ?? item.sx, item.sz ?? item.sx) * 1.5;
      radius = Math.max(radius, reach);
    });
    shared.boundingSphere = new THREE.Sphere(centre, radius);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = receive;
    mesh.castShadow = cast;
    mesh.onBeforeRender = livingTick;
    group.add(mesh);
  }
  return group;
}

/** A decal over a box of ground, painted on a canvas: paint(g, w, h, px) where px(x, z) → [cx, cy]. */
function livingCanvas({ cx = 0, cz = 0, width, depth, pixels }) {
  const canvas = document.createElement('canvas');
  canvas.width = pixels;
  canvas.height = Math.round((pixels * depth) / width);
  const px = (x, z) => [((x - (cx - width / 2)) / width) * canvas.width, ((z - (cz - depth / 2)) / depth) * canvas.height];
  return { canvas, g: canvas.getContext('2d'), px, scale: canvas.width / width, bounds: { x0: cx - width / 2, z0: cz - depth / 2, width, depth } };
}

/** Paint a decal from a function of world (x, z) → [r, g, b, alpha 0…1], at `pixels` across, smoothed up to the decal's size. */
function livingPaintNoise(decal, pixels, colourAt) {
  const { canvas, bounds } = decal;
  const small = document.createElement('canvas');
  small.width = pixels;
  small.height = Math.max(1, Math.round((pixels * canvas.height) / canvas.width));
  const g = small.getContext('2d');
  const image = g.createImageData(small.width, small.height);
  const data = image.data;
  for (let row = 0; row < small.height; row += 1) {
    const z = bounds.z0 + ((row + 0.5) / small.height) * bounds.depth;
    for (let column = 0; column < small.width; column += 1) {
      const x = bounds.x0 + ((column + 0.5) / small.width) * bounds.width;
      const [r, gr, b, a] = colourAt(x, z);
      const index = (row * small.width + column) * 4;
      data[index] = r;
      data[index + 1] = gr;
      data[index + 2] = b;
      data[index + 3] = Math.max(0, Math.min(1, a)) * 255;
    }
  }
  g.putImageData(image, 0, 0);
  decal.g.imageSmoothingEnabled = true;
  decal.g.drawImage(small, 0, 0, canvas.width, canvas.height);
}

function livingDecal({ cx = 0, cz = 0, width, depth, canvas, y = 0.003, normalCanvas = null, normalScale = 1, standard = false, roughness = 1 }) {
  const map = new THREE.CanvasTexture(canvas);
  map.anisotropy = 4;
  const options = { map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  let material;
  if (standard || normalCanvas) {
    material = new THREE.MeshStandardMaterial({ ...options, roughness, metalness: 0 });
    if (normalCanvas) {
      material.normalMap = new THREE.CanvasTexture(normalCanvas);
      material.normalMap.anisotropy = 4;
      material.normalScale.set(normalScale, normalScale);
    }
  } else {
    material = new THREE.MeshLambertMaterial(options);
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(cx, y, cz);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}

/** A tangent-space normal map from a grey height canvas (bright = high). */
function livingNormalCanvas(heightCanvas, strength = 2) {
  const { width, height } = heightCanvas;
  const source = heightCanvas.getContext('2d').getImageData(0, 0, width, height).data;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const g = out.getContext('2d');
  const image = g.createImageData(width, height);
  const data = image.data;
  const at = (x, y) => source[(((y + height) % height) * width + ((x + width) % width)) * 4] / 255;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const length = Math.hypot(dx, dy, 1);
      const index = (y * width + x) * 4;
      data[index] = (-dx / length * 0.5 + 0.5) * 255;
      data[index + 1] = (dy / length * 0.5 + 0.5) * 255;
      data[index + 2] = (1 / length * 0.5 + 0.5) * 255;
      data[index + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  return out;
}

/** A soft round alpha (white centre to black rim) for puddles and films. */
function livingRadialAlpha(size = 128, inner = 0.55) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(inner, '#f0f0f0');
  gradient.addColorStop(1, '#000000');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/** Merged flat blobs (puddles, a pond): noisy outlines, uv radial for a soft alpha. spots: [{ x, z, rx, rz, turn }]. */
function livingBlobGeometry(spots, y, seed = 1) {
  const positions = [];
  const uvs = [];
  const index = [];
  const sides = 28;
  spots.forEach((spot, number) => {
    const first = positions.length / 3;
    positions.push(spot.x, y, spot.z);
    uvs.push(0.5, 0.5);
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      const wobble = livingBlobWobble(angle, number, seed);
      const lx = Math.cos(angle) * spot.rx * wobble;
      const lz = Math.sin(angle) * spot.rz * wobble;
      const turn = spot.turn ?? 0;
      positions.push(spot.x + lx * Math.cos(turn) - lz * Math.sin(turn), y, spot.z + lx * Math.sin(turn) + lz * Math.cos(turn));
      uvs.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5);
      index.push(first, first + 1 + ((side + 1) % sides), first + 1 + side);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

/** The wobble of blob `number`'s rim at `angle` (livingBlobGeometry's outline). */
const livingBlobWobble = (angle, number, seed) => 1 + 0.22 * livingNoise(Math.cos(angle) * 1.6 + number * 7, Math.sin(angle) * 1.6, seed) + 0.08 * livingNoise(Math.cos(angle) * 4 + number * 3, Math.sin(angle) * 4, seed + 1);

/**
 * Where blob water lies, for the blood: (x, z) -> { wet, reach } or null.
 * wet follows the blobs' own outline and their radial alpha (solid to
 * `inner`, fading to the rim); reach is how far a cloud can spread in it.
 */
function livingWaterAt(spots, seed, inner, reachOf = (spot) => 0.55 * Math.sqrt(spot.rx * spot.rz)) {
  return (x, z) => {
    let best = null;
    spots.forEach((spot, number) => {
      const turn = spot.turn ?? 0;
      const dx = x - spot.x;
      const dz = z - spot.z;
      const u = (dx * Math.cos(turn) + dz * Math.sin(turn)) / spot.rx;
      const v = (-dx * Math.sin(turn) + dz * Math.cos(turn)) / spot.rz;
      const out = Math.hypot(u, v);
      if (out > 1.4) return;
      const d = out / livingBlobWobble(Math.atan2(v, u), number, seed);
      const wet = 1 - livingSmooth(inner, 1, d);
      if (wet > 0 && (!best || wet > best.wet)) best = { wet, reach: reachOf(spot) };
    });
    return best;
  };
}

// ---- the land: foothills, micro-relief ----------------------------------------

/** The land under (x, z): the flat ground, the scenery's foothills where they rise, the relief at the margins. */
function livingLand(view, place) {
  const group = view.places?.[place];
  const hills = group?.children.find((child) => child.userData.sceneryVariant === 'foothills' && child.visible);
  const foot = hills?.userData.heightAt ?? null;
  const land = {
    foot,
    relief: null,
    at(x, z) {
      let y = 0;
      if (foot) y = Math.max(y, foot(x, z) - 0.03);
      if (land.relief) y = Math.max(y, land.relief(x, z));
      return y;
    },
  };
  return land;
}

/** UV of the place's own ground at (x, z), for a mesh to wear the same texture seamlessly. */
const livingUvPoint = new THREE.Vector3();
const livingInverses = new WeakMap();
function livingGroundUv(ground, x, z) {
  if (!livingInverses.has(ground)) livingInverses.set(ground, new THREE.Matrix4().copy(ground.matrix).invert());
  const local = livingUvPoint.set(x, 0, z).applyMatrix4(livingInverses.get(ground));
  const parameters = ground.geometry.parameters ?? {};
  if (parameters.width) return [local.x / parameters.width + 0.5, local.y / parameters.height + 0.5];
  return [x / 20, -z / 20];
}

/**
 * A gentle relief ring from the arena edge outwards, wearing the place's own
 * ground material (and its UVs, so it meets the flat ground without a seam):
 * 0 at the edge (dipping just under the flat ground), rising to ±amplitude a
 * few metres out, fading under the foothills by `reach`.
 */
function livingRelief({ land, arena, grounds, reach = 12, amplitude = 0.22, step = 0.4, seed = 5, keep = () => true, shape = null }) {
  const ground = grounds[0];
  if (!ground) return null;
  ground.updateMatrix();
  const height = (x, z) => {
    if (!keep(x, z)) return -1;
    const outside = livingOutside(arena, x, z);
    const grow = livingSmooth(0.3, 3.2, outside) * (1 - livingSmooth(reach - 4, reach, outside));
    const lumps = shape ? shape(x, z) : 0.7 * livingFbm(x / 4.5, z / 4.5, seed, 3) + 0.3 * livingFbm(x / 1.2, z / 1.2, seed + 50, 2);
    const foot = land.foot ? Math.max(0, land.foot(x, z) - 0.03) : 0;
    return foot + grow * (amplitude * lumps + amplitude * 0.35) - 0.06 * (1 - grow);
  };
  land.relief = height;
  const x0 = -arena.halfX - reach;
  const z0 = -arena.halfZ - reach;
  const columns = Math.ceil((2 * (arena.halfX + reach)) / step);
  const rows = Math.ceil((2 * (arena.halfZ + reach)) / step);
  const positions = [];
  const uvs = [];
  const colours = [];
  const shown = [];
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const x = x0 + column * step;
      const z = z0 + row * step;
      const y = height(x, z);
      positions.push(x, y, z);
      uvs.push(...livingGroundUv(ground, x, z));
      const floor = land.foot ? Math.max(0, land.foot(x, z) - 0.03) : 0;
      const proud = y - floor;
      shown.push(proud > -0.005);
      const outside = livingOutside(arena, x, z);
      const grow = livingSmooth(0.3, 3.2, outside);
      const tone = 1 + grow * (0.6 * proud + 0.06 * livingFbm(x / 7, z / 7, seed + 9, 2));
      colours.push(tone, tone, tone * 0.98);
    }
  }
  const index = [];
  const at = (row, column) => row * (columns + 1) + column;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = at(row, column);
      const b = at(row, column + 1);
      const c = at(row + 1, column);
      const d = at(row + 1, column + 1);
      if (!(shown[a] || shown[b] || shown[c] || shown[d])) continue;
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const material = ground.material.clone();
  material.vertexColors = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

// ---- grass, flowers, stones ---------------------------------------------------

const livingColour = (hex, jitter = 0.1, rng = Math.random) => new THREE.Color(hex).multiplyScalar(1 - jitter + rng() * jitter * 2);

/**
 * Grass round the fighting floor: short and sparse inside it (≤ 8 cm), dense
 * in a band outside the edge, thinning out to `far` metres from the centre;
 * near clumps finely made, far ones coarser and bigger.
 */
function livingGrass({ land, arena, rng, palette, near = 8, band = 9, far = 40, tall = [0.16, 0.38], inside = 0.5, sway = 0.22, keep = () => true, seed = 11, flatten = null, insideKeep = () => 1 }) {
  const group = new THREE.Group();
  const nearGeometry = livingClumpGeometry({ blades: 8, levels: 3, spread: 0.11, width: 0.035, seed });
  const farGeometry = livingClumpGeometry({ blades: 5, levels: 2, spread: 0.16, width: 0.06, seed: seed + 1 });
  const material = livingSwayMaterial({ sway });
  const reach = far + Math.max(arena.halfX, arena.halfZ);
  const tint = (x, z) => {
    const patch = livingFbm(x / 9, z / 9, seed + 3, 3) * 0.5 + 0.5;
    const pick = palette[Math.min(palette.length - 1, Math.floor(patch * palette.length))];
    return livingColour(pick, 0.12, rng);
  };
  const nearItems = [];
  const farItems = [];
  const lowItems = [];
  const points = livingSample(rng, {
    box: [-reach, -reach, reach, reach],
    perSquareMetre: near,
    density: (x, z) => {
      if (!keep(x, z)) return 0;
      const outside = livingOutside(arena, x, z);
      if (outside < 0) return Math.min(1, (inside / near) * insideKeep(x, z) + 0.35 * livingSmooth(-1.6, 0, outside) * insideKeep(x, z));
      const radius = Math.hypot(x, z);
      if (radius > reach) return 0;
      const patchy = 0.55 + 0.45 * livingSmooth(-0.3, 0.3, livingFbm(x / 5, z / 5, seed + 7, 2));
      const fade = outside < band ? livingSmooth(0, 0.8, outside) : Math.exp(-(outside - band) / 7) * 0.9;
      return Math.min(1, fade * patchy * (1 - livingSmooth(reach - 8, reach, radius)));
    },
  });
  for (const { x, z } of points) {
    const outside = livingOutside(arena, x, z);
    const y = land.at(x, z) - 0.01;
    const colour = tint(x, z);
    if (outside < 0) {
      const lying = flatten?.(x, z);
      if (lying) {
        lowItems.push({ x, y: y + 0.005, z, sx: 0.14 + rng() * 0.12, ry: rng() * Math.PI * 2, colour: colour.multiplyScalar(0.8) });
      } else {
        const size = 0.035 + rng() * 0.045;
        nearItems.push({ x, y, z, sx: 0.5 + rng() * 0.5, sy: size, ry: rng() * Math.PI * 2, colour });
      }
      continue;
    }
    if (flatten?.(x, z)) {
      lowItems.push({ x, y: y + 0.005, z, sx: 0.2 + rng() * 0.18, ry: rng() * Math.PI * 2, colour: colour.multiplyScalar(0.8) });
      continue;
    }
    const growth = livingSmooth(0, 1.6, outside);
    const height = (tall[0] + rng() * (tall[1] - tall[0])) * (0.35 + 0.65 * growth);
    if (outside < band + 2) {
      nearItems.push({ x, y, z, sx: 0.7 + rng() * 0.6 + height, sy: height, ry: rng() * Math.PI * 2, colour });
    } else {
      const bigger = 1 + Math.min(1.6, (outside - band) / 10);
      farItems.push({ x, y, z, sx: (1 + rng() * 0.6) * bigger, sy: height * (0.9 + 0.3 * bigger), ry: rng() * Math.PI * 2, colour });
    }
  }
  group.add(livingInstanced(nearGeometry, material, nearItems, { sectors: 8 }));
  group.add(livingInstanced(farGeometry, material, farItems, { sectors: 8 }));
  if (lowItems.length) {
    // Trodden flat: the clump laid over one way, lit as the ground is.
    const lying = livingClumpGeometry({ blades: 9, levels: 3, spread: 0.14, width: 0.04, lean: 0.25, seed: seed + 2, root: [0.5, 0.48, 0.36], tip: [1.05, 0.98, 0.72] });
    lying.rotateX(1.4);
    const normals = lying.attributes.normal;
    for (let index = 0; index < normals.count; index += 1) normals.setXYZ(index, 0, 1, 0);
    group.add(livingInstanced(lying, livingSwayMaterial({ sway: 0.03 }), lowItems, { sectors: 4 }));
  }
  group.userData.count = nearItems.length + farItems.length + lowItems.length;
  return group;
}

/** Wild flowers in drifts: buttercups, clover, daisies; stems and heads share the sway. */
function livingFlowers({ land, arena, rng, count = 1800, from = 0.8, to = 18, kinds = null, seed = 21, keep = () => true, insideKeep = () => 1 }) {
  const group = new THREE.Group();
  const types = kinds ?? [
    { colour: 0xffd21a, centre: [1, 0.85, 0.25], rim: [1, 1, 1], petals: 5, radius: 0.12, share: 0.45, tall: [0.2, 0.42] },
    { colour: 0xffffff, centre: [1, 0.82, 0.15], rim: [1, 1, 1], petals: 10, radius: 0.13, share: 0.3, tall: [0.07, 0.16] },
    { colour: 0xe8a8c8, centre: [0.85, 0.55, 0.7], rim: [1, 1, 1], petals: 7, radius: 0.09, share: 0.25, tall: [0.07, 0.14] },
  ];
  const stems = [];
  const reach = to + Math.max(arena.halfX, arena.halfZ);
  const points = livingSample(rng, {
    box: [-reach, -reach, reach, reach],
    perSquareMetre: count / (4 * reach * reach),
    density: (x, z) => {
      const outside = livingOutside(arena, x, z);
      if (outside < from || outside > to || !keep(x, z)) return 0;
      if (outside < 0 && insideKeep(x, z) < 0.5) return 0;
      return livingSmooth(-0.12, 0.25, livingFbm(x / 3.5, z / 3.5, seed, 2));
    },
  });
  const byType = types.map(() => []);
  for (const { x, z } of points) {
    const roll = livingFbm(x / 6, z / 6, seed + 5, 2) * 0.5 + 0.5 + (rng() - 0.5) * 0.3;
    let type = 0;
    let sum = 0;
    for (; type < types.length - 1; type += 1) {
      sum += types[type].share;
      if (roll < sum) break;
    }
    const spec = types[type];
    let tall = spec.tall[0] + rng() * (spec.tall[1] - spec.tall[0]);
    if (livingOutside(arena, x, z) < 0) tall = Math.min(tall, 0.075);
    const item = { x, y: land.at(x, z) - 0.005, z, sx: tall, ry: rng() * 6.28, rx: (rng() - 0.5) * 0.25, colour: livingColour(spec.colour, 0.06, rng) };
    byType[type].push(item);
    stems.push({ ...item, colour: null });
  }
  const material = livingSwayMaterial({ sway: 0.3 });
  types.forEach((spec, type) => group.add(livingInstanced(livingHeadGeometry(spec), material, byType[type], { sectors: 4 })));
  group.add(livingInstanced(livingStemGeometry(), material, stems, { sectors: 4 }));
  return group;
}

/** Stones half sunk and pebbles: none taller than `insideTop` inside the floor. */
function livingStones({ land, arena, rng, count = 260, pebbles = 900, from = 0.6, to = 25, palette = [0x8a8478, 0x77726a, 0x9a9488], size = [0.06, 0.32], insideTop = 0.015, keep = () => true, seed = 31 }) {
  const items = [];
  const reach = to + Math.max(arena.halfX, arena.halfZ);
  const place = (x, z, radius) => {
    const outside = livingOutside(arena, x, z);
    const squash = 0.45 + rng() * 0.25;
    let sink = 0.45;
    if (outside < 0.2) {
      radius = Math.min(radius, 0.04);
      sink = Math.max(sink, 1 - insideTop / (radius * squash));
    }
    items.push({ x, y: land.at(x, z) - radius * squash * sink, z, sx: radius, sy: radius * squash, sz: radius * (0.7 + rng() * 0.3), ry: rng() * 6.28, rx: (rng() - 0.5) * 0.3, colour: livingColour(palette[Math.floor(rng() * palette.length)], 0.12, rng) });
  };
  for (const { x, z } of livingSample(rng, { box: [-reach, -reach, reach, reach], perSquareMetre: count / (4 * reach * reach), density: (x, z) => (livingOutside(arena, x, z) > from && keep(x, z) && Math.hypot(x, z) < reach ? 1 : 0) })) {
    place(x, z, size[0] + Math.pow(rng(), 2.5) * (size[1] - size[0]));
  }
  const pebbleReach = Math.max(arena.halfX, arena.halfZ) + 10;
  for (const { x, z } of livingSample(rng, { box: [-pebbleReach, -pebbleReach, pebbleReach, pebbleReach], perSquareMetre: pebbles / (4 * pebbleReach * pebbleReach), density: (x, z) => (keep(x, z) ? 1 : 0) })) {
    place(x, z, 0.012 + rng() * 0.03);
  }
  const material = livingSolid();
  return livingInstanced(livingRockGeometry(seed), material, items, { sectors: 4 });
}

/** Leaves (or straw) lying flat: kinds [{ colour, length, width, count, shape }] over the given sampler. */
function livingLitter({ land, rng, items: specs, box, density }) {
  const group = new THREE.Group();
  for (const spec of specs) {
    const items = livingSample(rng, { box, perSquareMetre: spec.count / ((box[2] - box[0]) * (box[3] - box[1])), density }).map(({ x, z }) => ({
      x,
      y: land.at(x, z) + (spec.lift ?? 0.004) + rng() * 0.003,
      z,
      sx: spec.length * (0.7 + rng() * 0.6),
      sy: 1,
      sz: spec.width * (0.7 + rng() * 0.6),
      ry: rng() * 6.28,
      rx: (rng() - 0.5) * 0.25,
      rz: (rng() - 0.5) * 0.25,
      colour: livingColour(spec.palette[Math.floor(rng() * spec.palette.length)], 0.12, rng),
    }));
    group.add(livingInstanced(livingFlatGeometry(spec.shape ?? 'leaf'), livingSolid({ side: THREE.DoubleSide }), items, { sectors: 4 }));
  }
  return group;
}

// ---- decal painters ----------------------------------------------------------

function livingBlot(g, x, y, rx, ry, colour, turn = 0) {
  g.fillStyle = colour;
  g.beginPath();
  g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), turn, 0, Math.PI * 2);
  g.fill();
}

/** A hoof print (a horseshoe U) at canvas (x, y), heading `turn`, `size` pixels. */
function livingHoof(g, x, y, size, turn, colour) {
  g.save();
  g.translate(x, y);
  g.rotate(turn);
  g.strokeStyle = colour;
  g.lineWidth = Math.max(1, size * 0.28);
  g.beginPath();
  g.arc(0, 0, size * 0.5, Math.PI * 0.15, Math.PI * 1.85);
  g.stroke();
  g.fillStyle = colour.replace(/[\d.]+\)$/, '0.25)');
  g.beginPath();
  g.arc(0, 0, size * 0.45, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** A footprint (heel and forefoot) at canvas (x, y), heading `turn`, `length` pixels. */
function livingFoot(g, x, y, length, turn, colour, left) {
  g.save();
  g.translate(x, y);
  g.rotate(turn);
  g.fillStyle = colour;
  const side = left ? -1 : 1;
  g.beginPath();
  g.ellipse(-length * 0.3, side * length * 0.02, length * 0.17, length * 0.14, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(length * 0.15, side * length * 0.05, length * 0.3, length * 0.19, side * 0.12, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** A walk of footprints from (x, z) along `heading` (world metres), `steps` steps. */
function livingTrail(decal, rng, { x, z, heading, steps, colour, stride = 0.7, wander = 0.25, foot = 0.27 }) {
  let at = [x, z];
  let turn = heading;
  for (let step = 0; step < steps; step += 1) {
    turn += (rng() - 0.5) * wander;
    at = [at[0] + Math.cos(turn) * stride * 0.5, at[1] + Math.sin(turn) * stride * 0.5];
    const left = step % 2 === 0;
    const offset = (left ? -1 : 1) * 0.09;
    const [cx, cy] = decal.px(at[0] - Math.sin(turn) * offset, at[1] + Math.cos(turn) * offset);
    livingFoot(decal.g, cx, cy, foot * decal.scale, turn, colour, left);
  }
}

// ---- the places --------------------------------------------------------------

const LIVING_GREENS = {
  meadow: [0x5f8a34, 0x6e9a3c, 0x7c9e40, 0x5a7e30, 0x86a648],
  field: [0x5f8838, 0x6c943e, 0x7a9a44, 0x58803a, 0x8aa250],
  sengoku: [0x8e8a42, 0x9a8a48, 0x7e8442, 0xa89458, 0x6f7a3c],
};

/** Grass places: meadow, field, sengoku. */
function livingGrassPlace({ place, view, arena, grounds, rng, kind }) {
  const group = new THREE.Group();
  const land = livingLand(view, place);
  const trampled = kind === 'trampled';
  const relief = livingRelief({ land, arena, grounds, reach: place === 'field' ? 16 : 12, amplitude: trampled ? 0.16 : 0.2, seed: place.length * 13 });
  if (relief) group.add(relief);
  const pond = place === 'meadow' ? { x: -1.5, z: -16.5, rx: 3.4, rz: 2.2 } : null;
  const offPond = (x, z) => !pond || ((x - pond.x) / (pond.rx + 0.3)) ** 2 + ((z - pond.z) / (pond.rz + 0.3)) ** 2 > 1;
  const offCastle = (x, z) => place !== 'sengoku' || Math.hypot(x + 6, z + 40) > 11;
  // Mud where the armies trod (sengoku), a churned strip (field): a decal, and grass lying flat in it.
  const mudLevel = (x, z) => livingFbm(x / 3.2, z / 3.2, 77, 4) + 0.3 * livingSmooth(4, 0, livingOutside(arena, x, z)) - 0.05;
  const mudAt = trampled ? (x, z) => mudLevel(x, z) > 0.2 : null;
  const keep = (x, z) => offPond(x, z) && offCastle(x, z);
  // Short grass on the fighting floor only off the worn ground: the meadow's track (painted, an ellipse turned 0.2), the field's churned strip, the sengoku mud.
  const insideKeep = (x, z) => {
    if (place === 'meadow') {
      const along = x * Math.cos(0.2) + z * Math.sin(0.2);
      const across = -x * Math.sin(0.2) + z * Math.cos(0.2);
      return livingSmooth(1, 1.5, (along / 13.3) ** 2 + (across / 3.2) ** 2);
    }
    if (place === 'field') return Math.abs(z) > arena.halfZ * 0.55 + 1 ? 1 : 0.05;
    return mudAt?.(x, z) ? 0.1 : 1;
  };
  group.add(livingGrass({
    land,
    arena,
    rng,
    palette: LIVING_GREENS[place],
    near: place === 'field' ? 6 : 8,
    band: place === 'field' ? 7 : 9,
    far: place === 'field' ? 32 : 40,
    tall: trampled ? [0.14, 0.34] : [0.16, 0.4],
    inside: trampled ? 0.6 : 5,
    insideKeep,
    keep,
    seed: 11 + place.length,
    flatten: trampled ? (x, z) => livingFbm(x / 2.2, z / 2.2, 91, 2) > 0.05 && livingOutside(arena, x, z) < 6 : null,
  }));
  if (place === 'meadow') group.add(livingFlowers({ land, arena, rng, count: 6000, from: -2.5, to: 20, keep, insideKeep }));
  if (place === 'field') {
    group.add(livingFlowers({
      land, arena, rng, count: 1200, from: 0.5, to: 18, keep,
      kinds: [
        { colour: 0xffd21a, centre: [1, 0.85, 0.25], rim: [1, 1, 1], petals: 5, radius: 0.12, share: 0.6, tall: [0.12, 0.26] },
        { colour: 0xffffff, centre: [1, 0.82, 0.15], rim: [1, 1, 1], petals: 10, radius: 0.13, share: 0.4, tall: [0.06, 0.12] },
      ],
    }));
  }
  group.add(livingStones({ land, arena, rng, count: place === 'field' ? 220 : 160, pebbles: place === 'field' ? 1400 : 700, keep, seed: 31 + place.length }));

  // Decals: mud and prints, painted from noise so their edges are ragged, prints scattered where the mud is.
  if (place === 'field') {
    const width = arena.halfX * 1.9;
    const depth = arena.halfZ * 1.2;
    const decal = livingCanvas({ width, depth, pixels: 2048 });
    const strip = (x, z) => 1 - livingSmooth(arena.halfZ * 0.3, arena.halfZ * 0.55, Math.abs(z + 1.2 * livingNoise(x / 9, 0, 5))) * (1 - livingSmooth(arena.halfX * 0.75, arena.halfX * 0.92, Math.abs(x)));
    const mud = (x, z) => strip(x, z) * (0.55 + livingFbm(x / 2.2, z / 2.2, 71, 4)) - livingSmooth(arena.halfX * 0.8, arena.halfX * 0.95, Math.abs(x));
    livingPaintNoise(decal, 400, (x, z) => {
      const m = mud(x, z);
      const wet = livingFbm(x / 1.1, z / 1.1, 73, 2);
      const a = livingSmooth(0.05, 0.45, m) * (0.55 + 0.25 * wet);
      return [96 - 26 * wet, 72 - 18 * wet, 46 - 10 * wet, a];
    });
    for (let index = 0; index < 1300 * LIVING_DENSITY; index += 1) {
      const x = (rng() - 0.5) * width;
      const z = (rng() - 0.5) * depth;
      if (mud(x, z) < 0.15 + rng() * 0.2) continue;
      const [cx, cy] = decal.px(x, z);
      livingHoof(decal.g, cx, cy, (0.11 + rng() * 0.03) * decal.scale, (rng() < 0.7 ? 0 : Math.PI) + Math.PI / 2 + (rng() - 0.5) * 0.7, `rgba(40,28,16,${0.08 + rng() * 0.14})`);
    }
    group.add(livingDecal({ width, depth, canvas: decal.canvas, y: 0.006 }));
  } else {
    const reach = 2 * (Math.max(arena.halfX, arena.halfZ) + 6);
    const decal = livingCanvas({ width: reach, depth: reach, pixels: 2048 });
    if (trampled) {
      livingPaintNoise(decal, 400, (x, z) => {
        const m = mudLevel(x, z);
        const wet = livingFbm(x / 0.9, z / 0.9, 79, 2);
        return [84 - 26 * wet, 64 - 18 * wet, 42 - 10 * wet, livingSmooth(0.1, 0.4, m) * (0.6 + 0.3 * wet)];
      });
      for (let index = 0; index < 34; index += 1) {
        livingTrail(decal, rng, { x: (rng() - 0.5) * reach * 0.7, z: (rng() - 0.5) * reach * 0.7, heading: rng() * 6.28, steps: 8 + rng() * 14, colour: `rgba(44,32,20,${0.08 + rng() * 0.1})`, foot: 0.26 });
      }
      for (let index = 0; index < 1400 * LIVING_DENSITY; index += 1) {
        const x = (rng() - 0.5) * reach;
        const z = (rng() - 0.5) * reach;
        if (mudLevel(x, z) < 0.2) continue;
        const [cx, cy] = decal.px(x, z);
        livingHoof(decal.g, cx, cy, 0.12 * decal.scale, rng() * 6.28, `rgba(36,26,16,${0.1 + rng() * 0.16})`);
      }
    } else {
      // The green: worn earth showing through round the edge of the floor where the onlookers stand, darker damp hollows.
      livingPaintNoise(decal, 400, (x, z) => {
        const edge = livingSmooth(3, 0.5, Math.abs(livingOutside(arena, x, z) - 0.6));
        const worn = livingFbm(x / 1.6, z / 1.6, 83, 3) + 0.25 * edge;
        const damp = livingFbm(x / 5, z / 5, 85, 2);
        return [112 - 30 * damp, 92 - 22 * damp, 58 - 12 * damp, livingSmooth(0.15, 0.5, worn) * 0.45 + livingSmooth(0.2, 0.5, damp) * 0.12];
      });
    }
    group.add(livingDecal({ width: reach, depth: reach, canvas: decal.canvas, y: 0.004 }));
  }

  if (trampled) {
    // Fallen leaves blown off the pines, in every autumn colour; broken arrows; a fallen banner.
    const reach = Math.max(arena.halfX, arena.halfZ) + 22;
    group.add(livingLitter({
      land, rng,
      box: [-reach, -reach, reach, reach],
      density: (x, z) => (offCastle(x, z) ? 0.35 + 0.65 * livingSmooth(-0.2, 0.4, livingFbm(x / 4, z / 4, 61, 2)) : 0),
      items: [
        { count: 5200 * Math.min(1, LIVING_DENSITY * 2), length: 0.1, width: 0.075, palette: [0xe0642a, 0xf09a30, 0xf0c040, 0xb84a22, 0xc08a3a, 0xd85a2a, 0xa8a040] },
      ],
    }));
    group.add(livingArrows({ land, arena, rng }));
  }
  if (pond) group.add(livingPond({ land, view, rng, pond }));
  group.userData.land = land;
  return group;
}

/** Arrows stuck in the field after the volleys, some snapped; outside the fighting floor. */
function livingArrows({ land, arena, rng }) {
  const group = new THREE.Group();
  const shaft = new THREE.CylinderGeometry(0.006, 0.006, 1, 4, 1, true);
  shaft.translate(0, 0.5, 0);
  const vane = new THREE.PlaneGeometry(0.035, 0.12);
  vane.translate(0.018, 0.92, 0);
  const shafts = [];
  const vanes = [];
  for (let index = 0; index < 18; index += 1) {
    let x;
    let z;
    do {
      x = (rng() - 0.5) * 2 * (arena.halfX + 9);
      z = (rng() - 0.5) * 2 * (arena.halfZ + 9);
    } while (livingOutside(arena, x, z) < 0.8);
    const broken = rng() < 0.4;
    const length = broken ? 0.25 + rng() * 0.2 : 0.55 + rng() * 0.25;
    const lean = 0.35 + rng() * 0.5;
    const heading = -0.5 + (rng() - 0.5) * 0.6;
    const item = { x, y: land.at(x, z) - 0.05, z, sx: 1, sy: length, sz: 1, ry: heading, rx: 0, rz: lean };
    shafts.push(item);
    if (!broken) for (const turn of [0, 2.1, 4.2]) vanes.push({ ...item, sy: length, ry: heading, rx: 0, rz: lean, turn });
  }
  const wood = livingSolid({ color: 0x8a6a3a });
  group.add(livingInstanced(shaft, wood, shafts));
  // Vanes: three round each shaft (yaw about the shaft is applied by rotating the vane geometry per copy).
  const fletch = livingSolid({ color: 0xe8e2d0, side: THREE.DoubleSide });
  for (const [turn, colour] of [[0, 0xe8e2d0], [2.1, 0x2a2a2a], [4.2, 0xe8e2d0]]) {
    const one = vane.clone();
    one.rotateY(turn);
    group.add(livingInstanced(one, colour === 0xe8e2d0 ? fletch : livingSolid({ color: colour, side: THREE.DoubleSide }), vanes.filter((item) => item.turn === turn)));
  }
  // A fallen sashimono banner, its pole snapped.
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 1.4, 4, 8), new THREE.MeshLambertMaterial({ color: 0x2a3a6a, side: THREE.DoubleSide }));
  const crumple = banner.geometry.attributes.position;
  for (let index = 0; index < crumple.count; index += 1) crumple.setZ(index, 0.03 * Math.sin(crumple.getY(index) * 9 + crumple.getX(index) * 7) + 0.015);
  banner.geometry.computeVertexNormals();
  banner.rotation.set(-Math.PI / 2, 0, 0.7);
  const bx = -arena.halfX - 2.2;
  const bz = -1.5;
  banner.position.set(bx, land.at(bx, bz) + 0.01, bz);
  banner.receiveShadow = true;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.7, 5), livingSolid({ color: 0x3a2a1a }));
  pole.rotation.set(0, 0, Math.PI / 2);
  pole.rotation.y = -0.87;
  pole.position.set(bx + 0.22, land.at(bx, bz) + 0.02, bz + 0.1);
  group.add(banner, pole);
  return group;
}

/** A pond at the meadow's edge: reflective, rippling water, a muddy bank, reeds and bulrushes, lily pads. */
function livingPond({ land, view, rng, pond }) {
  const group = new THREE.Group();
  const water = new THREE.Mesh(
    livingBlobGeometry([{ x: pond.x, z: pond.z, rx: pond.rx, rz: pond.rz, turn: 0.3 }], 0.03, 4),
    livingWaterMaterial({ color: 0x1c2a22, roughness: 0.06, metalness: 0.08, wave: 0.7, envMap: view.steelEnv, alphaMap: livingRadialAlpha(128, 0.82) }),
  );
  water.onBeforeRender = livingTick;
  group.userData.waters = [water.material];
  group.userData.bloodDyeWater = [livingWaterAt([{ ...pond, turn: 0.3 }], 4, 0.82, () => 1.2)];
  // The bank: dark wet earth round the water, a little raised.
  const bank = new THREE.Mesh(livingBlobGeometry([{ x: pond.x, z: pond.z, rx: pond.rx * 1.3, rz: pond.rz * 1.35, turn: 0.3 }], 0.012, 9), new THREE.MeshLambertMaterial({ color: 0x4a3c26, transparent: true, alphaMap: livingRadialAlpha(128, 0.7), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  bank.receiveShadow = true;
  group.add(bank, water);
  // Reeds round most of the bank, thickest on the far side; bulrush heads on some.
  const reeds = [];
  const heads = [];
  for (let index = 0; index < 90 * LIVING_DENSITY; index += 1) {
    const angle = rng() * Math.PI * 2;
    if (Math.sin(angle + 1) > 0.6 && rng() < 0.8) continue;
    const reach = 0.85 + rng() * 0.3;
    const x = pond.x + Math.cos(angle) * pond.rx * reach;
    const z = pond.z + Math.sin(angle) * pond.rz * reach;
    const tall = 0.8 + rng() * 0.8;
    reeds.push({ x, y: 0, z, sx: 0.9 + rng() * 0.5, sy: tall, ry: rng() * 6.28, colour: livingColour(rng() < 0.3 ? 0x8a9a4a : 0x5a7a32, 0.1, rng) });
    if (rng() < 0.4) heads.push({ x: x + 0.02, y: tall * 0.82, z, sx: 1, sy: 1, ry: 0, colour: livingColour(0x5a3a1e, 0.1, rng) });
  }
  const reedGeometry = livingClumpGeometry({ blades: 7, levels: 3, spread: 0.14, width: 0.035, lean: 0.12, tip: [1.15, 1.1, 0.8], root: [0.5, 0.55, 0.4], seed: 77 });
  group.add(livingInstanced(reedGeometry, livingSwayMaterial({ sway: 0.1 }), reeds, { sectors: 1 }));
  const bulrush = new THREE.CylinderGeometry(0.018, 0.018, 0.13, 6);
  group.add(livingInstanced(bulrush, livingSolid(), heads));
  // Lily pads on the water.
  const pads = [];
  for (let index = 0; index < 14; index += 1) {
    const angle = rng() * 6.28;
    const reach = Math.sqrt(rng()) * 0.7;
    pads.push({ x: pond.x + Math.cos(angle) * pond.rx * reach, y: 0.036, z: pond.z + Math.sin(angle) * pond.rz * reach, sx: 0.12 + rng() * 0.12, ry: rng() * 6.28, colour: livingColour(0x4a7a2e, 0.12, rng) });
  }
  const pad = new THREE.CircleGeometry(1, 10, 0.3, Math.PI * 2 - 0.3);
  pad.rotateX(-Math.PI / 2);
  group.add(livingInstanced(pad, livingSolid({ side: THREE.DoubleSide }), pads));
  return group;
}

/** The plain of Mexico: bunch grass tussocks, volcanic grit and stones, dusty bare patches. */
function livingDryPlace({ place, view, arena, grounds, rng }) {
  const group = new THREE.Group();
  const land = livingLand(view, place);
  const relief = livingRelief({ land, arena, grounds, reach: 13, amplitude: 0.14, seed: 41 });
  if (relief) group.add(relief);
  // Tussocks: tall arching clumps of straw-coloured blades with a green heart.
  const tussock = livingClumpGeometry({ blades: 14, levels: 3, spread: 0.12, width: 0.04, lean: 0.75, root: [0.55, 0.6, 0.4], tip: [1.2, 1.1, 0.8], seed: 51 });
  const items = [];
  const reach = Math.max(arena.halfX, arena.halfZ) + 40;
  for (const { x, z } of livingSample(rng, {
    box: [-reach, -reach, reach, reach],
    perSquareMetre: 0.9,
    density: (x, z) => {
      const outside = livingOutside(arena, x, z);
      if (outside < 0.6) return 0;
      const patch = livingSmooth(-0.25, 0.35, livingFbm(x / 6, z / 6, 43, 3));
      return patch * (outside < 8 ? 1 : Math.exp(-(outside - 8) / 9));
    },
  })) {
    const outside = livingOutside(arena, x, z);
    const tall = (0.28 + rng() * 0.4) * (0.5 + 0.5 * livingSmooth(0.5, 2.5, outside)) * (1 + Math.min(0.8, outside / 25));
    items.push({ x, y: land.at(x, z) - 0.02, z, sx: tall * (1.4 + rng() * 0.8), sy: tall, ry: rng() * 6.28, colour: livingColour([0xb0a060, 0xa89458, 0x9a9a5a, 0xc0ac70][Math.floor(rng() * 4)], 0.1, rng) });
  }
  group.add(livingInstanced(tussock, livingSwayMaterial({ sway: 0.14 }), items, { sectors: 8 }));
  group.add(livingStones({ land, arena, rng, count: 700, pebbles: 2600, to: 28, palette: [0x3a3634, 0x4a4240, 0x6a3a2c, 0x7a4632, 0x5a5550], size: [0.03, 0.22], seed: 47 }));
  // Dust: pale bare patches, darker grit speckle, a cart track.
  const width = 2 * (Math.max(arena.halfX, arena.halfZ) + 10);
  const decal = livingCanvas({ width, depth: width, pixels: 2048 });
  const { g, px, scale } = decal;
  livingPaintNoise(decal, 400, (x, z) => {
    const bare = livingFbm(x / 3.5, z / 3.5, 45, 4);
    const fine = livingFbm(x / 0.6, z / 0.6, 47, 2);
    return [172 + 20 * fine, 152 + 16 * fine, 110 + 10 * fine, livingSmooth(0.0, 0.35, bare) * (0.38 + 0.12 * fine)];
  });
  // Volcanic grit: dark basalt and red tezontle crumbs.
  for (let index = 0; index < 9000 * LIVING_DENSITY; index += 1) {
    const [cx, cy] = px((rng() - 0.5) * width, (rng() - 0.5) * width);
    g.fillStyle = rng() < 0.65 ? `rgba(48,42,40,${0.15 + rng() * 0.2})` : `rgba(116,64,44,${0.15 + rng() * 0.2})`;
    g.fillRect(cx, cy, 0.8 + rng() * 0.8, 0.8 + rng() * 0.8);
  }
  for (const side of [-0.7, 0.7]) {
    g.strokeStyle = 'rgba(120,100,70,0.22)';
    g.lineWidth = 0.18 * scale;
    g.beginPath();
    for (let x = -width / 2; x <= width / 2; x += 1) {
      const [cx, cy] = px(x, side + 6 + Math.sin(x * 0.07) * 2);
      if (x === -width / 2) g.moveTo(cx, cy);
      else g.lineTo(cx, cy);
    }
    g.stroke();
  }
  for (let index = 0; index < 8; index += 1) livingTrail(decal, rng, { x: (rng() - 0.5) * width * 0.4, z: (rng() - 0.5) * width * 0.4, heading: rng() * 6.28, steps: 10 + rng() * 10, colour: 'rgba(80,66,46,0.3)', foot: 0.25 });
  group.add(livingDecal({ width, depth: width, canvas: decal.canvas, y: 0.004 }));
  group.userData.land = land;
  return group;
}

/** The Colosseum: raked sand (rake lines and prints in relief), mounds at the wall foot, a dropped rudis. */
function livingArenaSand({ arena, grounds, rng }) {
  const group = new THREE.Group();
  const rx = 10.5;
  const rz = 7;
  const width = 2 * rx;
  const depth = 2 * rz;
  const relief = livingCanvas({ width, depth, pixels: 1280 });
  const colour = livingCanvas({ width, depth, pixels: 1280 });
  const { g, px, scale } = relief;
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, relief.canvas.width, relief.canvas.height);
  // Rake lines: concentric round the wall, combed straight across the middle; broken up where the fighting was.
  const disturbed = (x, z) => Math.max(0, 1 - Math.hypot(x / (arena.halfX * 0.9), z / (arena.halfZ * 0.9))) + 0.3 * livingFbm(x / 2, z / 2, 5, 2);
  for (let ring = 0.64; ring < 0.99; ring += 0.0075) {
    g.strokeStyle = 'rgba(80,80,80,0.4)';
    g.lineWidth = 0.014 * scale;
    g.beginPath();
    for (let step = 0; step <= 240; step += 1) {
      const angle = (step / 240) * Math.PI * 2;
      const wobble = 1 + 0.004 * Math.sin(angle * 9 + ring * 40);
      const [cx, cy] = px(Math.cos(angle) * rx * ring * wobble, Math.sin(angle) * rz * ring * wobble);
      if (step === 0) g.moveTo(cx, cy);
      else g.lineTo(cx, cy);
    }
    g.stroke();
  }
  // Combed passes across the middle: a rake head of six tines, each pass wandering a little.
  for (let pass = -rz * 0.66; pass < rz * 0.66; pass += 0.36) {
    const phase = rng() * 6.28;
    const drift = (rng() - 0.5) * 0.06;
    for (let tine = 0; tine < 6; tine += 1) {
      const z0 = pass + tine * 0.055;
      g.strokeStyle = `rgba(80,80,80,${0.28 + rng() * 0.12})`;
      g.lineWidth = 0.014 * scale;
      let drawing = false;
      g.beginPath();
      for (let x = -rx * 0.66; x < rx * 0.66; x += 0.12) {
        const z = z0 + Math.sin(x * 0.35 + phase) * 0.08 + drift * x;
        const keep = disturbed(x, z) < 0.5 + 0.15 * livingNoise(x * 3, z * 3, 9);
        const [cx, cy] = px(x, z);
        if (keep && !drawing) g.moveTo(cx, cy);
        else if (keep) g.lineTo(cx, cy);
        drawing = keep;
      }
      g.stroke();
    }
  }
  // Scuffs and prints where they fought: dark hollows with bright pushed-up rims.
  for (let index = 0; index < 160; index += 1) {
    const x = (rng() - 0.5) * arena.halfX * 2.2;
    const z = (rng() - 0.5) * arena.halfZ * 2.2;
    const [cx, cy] = px(x, z);
    const turn = rng() * 6.28;
    livingBlot(g, cx, cy, (0.25 + rng() * 0.4) * scale, (0.08 + rng() * 0.12) * scale, 'rgba(160,160,160,0.35)', turn);
    livingBlot(g, cx, cy, (0.2 + rng() * 0.3) * scale, (0.06 + rng() * 0.08) * scale, 'rgba(90,90,90,0.45)', turn);
  }
  for (let index = 0; index < 22; index += 1) {
    livingTrail(relief, rng, { x: (rng() - 0.5) * rx * 1.4, z: (rng() - 0.5) * rz * 1.4, heading: rng() * 6.28, steps: 6 + rng() * 14, colour: 'rgba(60,60,60,0.7)', wander: 0.6, foot: 0.25 });
  }
  const normals = livingNormalCanvas(relief.canvas, 3.5);
  // The colour layer: darker in the hollows, lighter on the ridges, a few dark stains.
  const source = g.getImageData(0, 0, relief.canvas.width, relief.canvas.height).data;
  const tint = colour.g.createImageData(relief.canvas.width, relief.canvas.height);
  for (let index = 0; index < source.length; index += 4) {
    const h = (source[index] - 128) / 128;
    if (h < 0) {
      tint.data[index] = 120;
      tint.data[index + 1] = 88;
      tint.data[index + 2] = 56;
      tint.data[index + 3] = Math.min(255, -h * 170);
    } else {
      tint.data[index] = 236;
      tint.data[index + 1] = 206;
      tint.data[index + 2] = 160;
      tint.data[index + 3] = Math.min(255, h * 200 + 40);
    }
  }
  colour.g.putImageData(tint, 0, 0);
  for (let index = 0; index < 7; index += 1) {
    const [cx, cy] = colour.px((rng() - 0.5) * rx * 1.3, (rng() - 0.5) * rz * 1.3);
    for (let blot = 0; blot < 6; blot += 1) livingBlot(colour.g, cx + (rng() - 0.5) * 0.4 * scale, cy + (rng() - 0.5) * 0.4 * scale, (0.08 + rng() * 0.2) * scale, (0.06 + rng() * 0.14) * scale, `rgba(${80 + rng() * 20},${40 + rng() * 10},${28},${0.2 + rng() * 0.2})`, rng() * 3);
  }
  // Clip to the oval.
  colour.g.globalCompositeOperation = 'destination-in';
  colour.g.beginPath();
  colour.g.ellipse(colour.canvas.width / 2, colour.canvas.height / 2, colour.canvas.width / 2 - 2, colour.canvas.height / 2 - 2, 0, 0, Math.PI * 2);
  colour.g.fill();
  group.add(livingDecal({ width, depth, canvas: colour.canvas, normalCanvas: normals, normalScale: 0.75, y: 0.004 }));
  // Sand drifted against the podium wall.
  const floor = grounds[0];
  const mounds = [];
  for (let index = 0; index < 110 * Math.max(0.5, LIVING_DENSITY); index += 1) {
    const angle = rng() * Math.PI * 2;
    const reach = 0.95 + rng() * 0.04;
    mounds.push({ x: Math.cos(angle) * rx * reach, y: -0.03, z: Math.sin(angle) * rz * reach, sx: 0.6 + rng() * 1.2, sy: 0.05 + rng() * 0.09, sz: 0.25 + rng() * 0.35, ry: -Math.atan2(Math.sin(angle) * rx, Math.cos(angle) * rz) + Math.PI / 2 + (rng() - 0.5) * 0.3 });
  }
  const mound = new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const sandMaterial = floor ? floor.material.clone() : livingSolid({ color: 0xc9a675 });
  if (sandMaterial.color) sandMaterial.color.multiplyScalar(0.86);
  group.add(livingInstanced(mound, sandMaterial, mounds, { sectors: 4 }));
  // Grit: small stones the rakes missed (flat to the sand inside the floor).
  group.add(livingStones({ land: { at: () => 0 }, arena, rng, count: 0, pebbles: 350, palette: [0xb09a7a, 0x8a7a64, 0xd0c0a0], seed: 57, keep: (x, z) => (x / rx) ** 2 + (z / rz) ** 2 < 0.9 }));
  // A wooden rudis dropped at the wall foot.
  const rudis = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.05), livingSolid({ color: 0x8a6a42 }));
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.12, 6), livingSolid({ color: 0x4a3420 }));
  grip.rotation.z = Math.PI / 2;
  grip.position.x = -0.31;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.09), livingSolid({ color: 0x5a4028 }));
  guard.position.x = -0.25;
  rudis.add(blade, grip, guard);
  rudis.position.set(-rx * 0.82, 0.015, rz * 0.35);
  rudis.rotation.y = 0.8;
  for (const part of rudis.children) {
    part.castShadow = true;
    part.receiveShadow = true;
  }
  group.add(rudis);
  return group;
}

/** The town square: real cobbles (≤ 1 cm proud on the fighting floor), mud in the joints, straw, puddles. */
function livingCobbles({ view, arena, rng }) {
  const group = new THREE.Group();
  const halfX = 12.3;
  const halfZ = 10.3;
  // Mud in the joints over the whole square.
  const decal = livingCanvas({ width: 2 * halfX, depth: 2 * halfZ, pixels: 1024 });
  const { g, px, scale } = decal;
  g.fillStyle = 'rgba(56,46,34,0.62)';
  g.fillRect(0, 0, decal.canvas.width, decal.canvas.height);
  for (let index = 0; index < 900; index += 1) {
    const [cx, cy] = px((rng() - 0.5) * 2 * halfX, (rng() - 0.5) * 2 * halfZ);
    livingBlot(g, cx, cy, (0.2 + rng() * 0.8) * scale, (0.2 + rng() * 0.6) * scale, `rgba(${40 + rng() * 30},${32 + rng() * 22},${22 + rng() * 14},${0.1 + rng() * 0.25})`, rng() * 3);
  }
  group.add(livingDecal({ width: 2 * halfX, depth: 2 * halfZ, canvas: decal.canvas, y: 0.002 }));
  // The setts: rows of rounded stones, each a low dome; worn paler down the middle.
  const stone = livingSettGeometry();
  const items = [];
  const across = 0.23;
  const along = 0.2;
  const full = LIVING_DENSITY >= 1;
  for (let row = 0, z = -halfZ + along / 2; z < halfZ; row += 1, z += along) {
    for (let x = -halfX + (row % 2) * across * 0.5; x < halfX; x += across) {
      const sx = x + (rng() - 0.5) * 0.03;
      const sz = z + (rng() - 0.5) * 0.025;
      const outside = livingOutside(arena, sx, sz);
      if (outside < 0.15 && !full) continue;
      const proud = outside < 0.15 ? 0.009 : 0.014 + 0.022 * livingSmooth(0.15, 1.8, outside) * (0.8 + 0.4 * rng());
      const base = -0.006;
      const wear = livingSmooth(9, 3, Math.hypot(sx, sz * 1.2));
      const tone = 0.3 + rng() * 0.16 + wear * 0.06;
      const warm = rng();
      items.push({
        x: sx,
        y: base,
        z: sz,
        sx: across * (0.42 + rng() * 0.06),
        sy: proud - base,
        sz: along * (0.42 + rng() * 0.06),
        ry: (rng() - 0.5) * 0.25,
        colour: new THREE.Color(tone * (1 + warm * 0.12), tone * (0.98 + warm * 0.02), tone * (0.92 - warm * 0.08)),
      });
    }
  }
  group.add(livingInstanced(stone, livingSolid(), items, { sectors: 8 }));
  // Straw blown about the square, thicker toward the edges and the stalls.
  const land = { at: (x, z) => (livingOutside(arena, x, z) < 0.15 ? 0.008 : 0.025) };
  group.add(livingLitter({
    land, rng,
    box: [-halfX, -halfZ, halfX, halfZ],
    density: (x, z) => 0.2 + 0.8 * livingSmooth(-1, 3, livingOutside(arena, x, z)) * livingSmooth(-0.2, 0.3, livingFbm(x / 3, z / 3, 8, 2)),
    items: [{ count: 2600, length: 0.12, width: 0.006, shape: 'straw', lift: 0.002, palette: [0xd8c070, 0xc8a858, 0xe0cc88, 0xb09048] }],
  }));
  // Puddles in the low spots off the fighting floor: the stones stand out of them.
  const spots = [];
  while (spots.length < 7) {
    const x = (rng() - 0.5) * 2 * (halfX - 1);
    const z = (rng() - 0.5) * 2 * (halfZ - 1);
    if (livingOutside(arena, x, z) < 0.6) continue;
    spots.push({ x, z, rx: 0.35 + rng() * 0.6, rz: 0.25 + rng() * 0.4, turn: rng() * 3 });
  }
  const water = new THREE.Mesh(livingBlobGeometry(spots, 0.02, 3), livingWaterMaterial({ color: 0x3a3a36, roughness: 0.04, wave: 0.25, envMap: view.steelEnv, alphaMap: livingRadialAlpha(128, 0.6) }));
  water.onBeforeRender = livingTick;
  group.add(water);
  group.userData.waters = [water.material];
  group.userData.bloodDyeWater = [livingWaterAt(spots, 3, 0.6)];
  return group;
}

/** The shore: wind-rippled sand at the margins, a glossy film at the tide line, shells, seaweed, driftwood, footprints. */
function livingBeach({ place, view, arena, grounds, rng }) {
  const group = new THREE.Group();
  const land = livingLand(view, place);
  const shore = LIVING_SHORE_X;
  // Ripples: a normal map on the relief that wears the sand.
  const ripples = livingCanvas({ width: 1, depth: 1, pixels: 512 });
  const rippleImage = ripples.g.createImageData(512, 512);
  for (let y = 0; y < 512; y += 1) {
    for (let x = 0; x < 512; x += 1) {
      const wave = Math.sin((x / 512) * Math.PI * 2 * 90 + Math.sin((y / 512) * Math.PI * 2 * 3) * 2.2 + Math.sin((y / 512) * Math.PI * 2 * 11) * 0.5);
      const v = 128 + 70 * Math.sign(wave) * Math.pow(Math.abs(wave), 0.6);
      const index = (y * 512 + x) * 4;
      rippleImage.data[index] = rippleImage.data[index + 1] = rippleImage.data[index + 2] = v;
      rippleImage.data[index + 3] = 255;
    }
  }
  ripples.g.putImageData(rippleImage, 0, 0);
  const rippleNormals = new THREE.CanvasTexture(livingNormalCanvas(ripples.canvas, 1.2));
  rippleNormals.wrapS = rippleNormals.wrapT = THREE.RepeatWrapping;
  const relief = livingRelief({
    land, arena, grounds, reach: 16, amplitude: 0.18, step: 0.4, seed: 63,
    keep: (x, z) => x < shore - 4.5 && x > -44 && Math.abs(z) < 64,
    shape: (x, z) => 0.6 * livingFbm(x / 6, z / 3, 63, 3) + 0.4 * Math.sin(x * 0.9 + livingFbm(x / 5, z / 5, 64, 2) * 3) * 0.5,
  });
  if (relief) {
    relief.material.normalMap = rippleNormals;
    relief.material.normalScale = new THREE.Vector2(0.8, 0.8);
    group.add(relief);
  }
  // Footprints and darker damp sand, as a decal.
  const width = 2 * (arena.halfX + 14);
  const depth = 2 * (arena.halfZ + 14);
  const cx = Math.min(0, shore - width / 2);
  const decal = livingCanvas({ cx, width, depth, pixels: 2048 });
  livingPaintNoise(decal, 400, (x, z) => {
    const tone = livingFbm(x / 4, z / 4, 65, 3);
    const fine = livingFbm(x / 0.7, z / 0.7, 66, 2);
    const t = livingSmooth(-0.35, 0.35, tone);
    return [150 + 72 * t, 122 + 74 * t, 80 + 60 * t, 0.12 + Math.abs(tone) * 0.25 + fine * 0.04];
  });
  // Prints in dry sand are soft hollows: a dim pit, a bright rim kicked up behind.
  for (let index = 0; index < 18; index += 1) {
    const start = { x: cx + (rng() - 0.5) * width * 0.8, z: (rng() - 0.5) * depth * 0.8, heading: rng() * 6.28, steps: 8 + rng() * 18 };
    const seed = rng() * 1e6;
    let replay = seed;
    const again = () => {
      replay = (replay * 9301 + 49297) % 233280;
      return replay / 233280;
    };
    livingTrail(decal, again, { ...start, colour: 'rgba(236,216,170,0.3)', foot: 0.3, wander: 0.35 });
    replay = seed;
    livingTrail(decal, again, { ...start, colour: `rgba(112,90,58,${0.3 + rng() * 0.15})`, foot: 0.25, wander: 0.35 });
  }
  // The wet band darkens toward the tide line.
  const [wetStart] = decal.px(shore - 7, 0);
  const [wetEnd] = decal.px(shore, 0);
  const wetness = decal.g.createLinearGradient(wetStart, 0, wetEnd, 0);
  wetness.addColorStop(0, 'rgba(100,84,56,0)');
  wetness.addColorStop(1, 'rgba(100,84,56,0.5)');
  decal.g.fillStyle = wetness;
  decal.g.fillRect(wetStart, 0, wetEnd - wetStart, decal.canvas.height);
  group.add(livingDecal({ cx, width, depth, canvas: decal.canvas, y: 0.004 }));
  // The glossy film the last wave left, its edge breathing with the swell.
  const filmAlpha = livingCanvas({ width: 1, depth: 1, pixels: 256 });
  const film = filmAlpha.g.createLinearGradient(0, 0, 256, 0);
  film.addColorStop(0, '#000000');
  film.addColorStop(0.35, '#555555');
  film.addColorStop(1, '#e0e0e0');
  filmAlpha.g.fillStyle = film;
  filmAlpha.g.fillRect(0, 0, 256, 256);
  const filmTexture = new THREE.CanvasTexture(filmAlpha.canvas);
  const filmMaterial = livingWaterMaterial({ color: 0x5a4c34, roughness: 0.06, metalness: 0.05, wave: 0.35, envMap: view.steelEnv, alphaMap: filmTexture, opacity: 0.85 });
  const filmMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 130), filmMaterial);
  filmMesh.rotation.x = -Math.PI / 2;
  filmMesh.position.set(shore - 1.7, 0.016, 0);
  filmMesh.onBeforeRender = () => {
    livingTick();
    filmMesh.position.x = shore - 1.7 + Math.sin(livingClock.value * 0.9) * 0.35;
  };
  group.add(filmMesh);
  group.userData.waters = [filmMaterial];
  // Shells and pebbles thickest along the wrack line, a few across the sand.
  const shell = new THREE.SphereGeometry(1, 7, 3, 0, Math.PI, 0, Math.PI / 2);
  const shells = [];
  for (const { x, z } of livingSample(rng, { box: [-30, -40, shore, 40], perSquareMetre: 0.6, density: (x) => 0.12 + 0.88 * livingSmooth(shore - 9, shore - 3, x) * (1 - livingSmooth(shore - 0.5, shore, x)) })) {
    const size = 0.012 + rng() * 0.022;
    shells.push({ x, y: land.at(x, z) - 0.002, z, sx: size, sy: size * 0.5, sz: size * 1.1, ry: rng() * 6.28, rx: (rng() - 0.5) * 0.6, colour: livingColour([0xf0e8dc, 0xe8c8b8, 0xd8c0a0, 0xf4f0ea, 0xb0a090][Math.floor(rng() * 5)], 0.06, rng) });
  }
  group.add(livingInstanced(shell, livingSolid({ side: THREE.DoubleSide }), shells, { sectors: 4 }));
  // Seaweed in strands along the tide line.
  const strand = new THREE.BufferGeometry();
  const strandPositions = [];
  const strandIndex = [];
  for (let step = 0; step <= 8; step += 1) {
    const t = step / 8;
    const x = t - 0.5;
    const z = Math.sin(t * 9) * 0.08;
    const w = 0.03 * (1 - t * 0.5);
    strandPositions.push(x, 0, z - w, x, 0, z + w);
    if (step < 8) strandIndex.push(step * 2, step * 2 + 1, step * 2 + 2, step * 2 + 1, step * 2 + 3, step * 2 + 2);
  }
  strand.setAttribute('position', new THREE.Float32BufferAttribute(strandPositions, 3));
  strand.setAttribute('normal', new THREE.Float32BufferAttribute(strandPositions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  strand.setIndex(strandIndex);
  const weed = [];
  for (let index = 0; index < 420 * LIVING_DENSITY; index += 1) {
    const x = shore - 4.2 + Math.pow(rng(), 0.6) * 3.2 * (rng() < 0.5 ? 1 : 0.6);
    const z = (rng() - 0.5) * 120;
    weed.push({ x, y: 0.014, z, sx: 0.3 + rng() * 0.6, sy: 1, sz: 0.6 + rng() * 0.8, ry: rng() * 6.28, colour: livingColour([0x3a3a1e, 0x4a4220, 0x2a3018, 0x5a4a28][Math.floor(rng() * 4)], 0.1, rng) });
  }
  group.add(livingInstanced(strand, livingSolid({ side: THREE.DoubleSide }), weed, { sectors: 2 }));
  // More driftwood, bleached, and a few branches with a fork.
  const log = new THREE.CylinderGeometry(0.05, 0.08, 1, 6, 1);
  log.rotateZ(Math.PI / 2);
  const logs = [];
  for (let index = 0; index < 30; index += 1) {
    const x = shore - 8 + rng() * 6;
    const z = (rng() - 0.5) * 70;
    if (livingOutside(arena, x, z) < 1) continue;
    logs.push({ x, y: land.at(x, z) + 0.03, z, sx: 0.5 + rng() * 1.6, sy: 0.6 + rng() * 0.8, sz: 0.6 + rng() * 0.8, ry: rng() * 6.28, colour: livingColour(0xa89a86, 0.12, rng) });
  }
  group.add(livingInstanced(log, livingSolid(), logs, { cast: true }));
  group.add(livingStones({ land, arena, rng, count: 50, pebbles: 400, from: 1, to: 14, palette: [0x9a8e74, 0x7a7266, 0xb0a48c], size: [0.04, 0.2], seed: 69, keep: (x) => x < shore - 1 && x > -44 }));
  group.userData.land = land;
  return group;
}

/** The quay at night in the rain: puddles that ring with drops and streak with the sodium lamps, an oil sheen in one. */
function livingWetConcrete({ view, arena, grounds, rng }) {
  const group = new THREE.Group();
  const place = grounds[0]?.parent;
  const lamps = [];
  place?.traverse((object) => {
    if (object.isPointLight) lamps.push(object.position.clone());
  });
  // Sort the lamps nearest the fight first: only the first few glint.
  lamps.sort((a, b) => a.length() - b.length());
  const spots = [];
  let tries = 0;
  while (spots.length < Math.round(34 * Math.max(0.5, LIVING_DENSITY)) && tries < 800) {
    tries += 1;
    const x = (rng() - 0.5) * 2 * (arena.halfX + 9);
    const z = -arena.halfZ - 10 + rng() * (arena.halfZ + 10 + 8.2);
    const big = livingOutside(arena, x, z) > 0 ? 1.1 : 0.9;
    const spot = { x, z, rx: (0.6 + Math.pow(rng(), 1.5) * 2.2) * big, rz: (0.45 + Math.pow(rng(), 1.5) * 1.3) * big, turn: rng() * 3 };
    if (spot.z + spot.rz > 8.6) continue;
    if (spots.some((other) => Math.hypot(other.x - x, other.z - z) < (other.rx + spot.rx) * 0.8)) continue;
    spots.push(spot);
  }
  const oil = spots.find((spot) => spot.rx > 1) ?? spots[0];
  const material = livingWaterMaterial({
    color: 0x8a9098, roughness: 0.05, metalness: 0.65, rain: 1, wave: 0.15, envMapIntensity: 1.3,
    lamps: lamps.slice(0, LIVING_WATER_LAMPS), lampColour: 0xffa24a, lampGain: 1.4,
    oil: oil ? [oil.x, oil.z, oil.rx * 0.9] : [0, 0, 0],
    envMap: view.steelEnv, alphaMap: livingRadialAlpha(128, 0.78),
  });
  const water = new THREE.Mesh(livingBlobGeometry(spots, 0.005, 6), material);
  water.onBeforeRender = livingTick;
  water.receiveShadow = true;
  group.add(water);
  // Darker wet rims round each puddle and dark oil stains on the apron.
  const width = 2 * (arena.halfX + 12);
  const depth = 30;
  const cz = -arena.halfZ - 10 + depth / 2;
  const decal = livingCanvas({ cz, width, depth, pixels: 2048 });
  for (const spot of spots) {
    const [cx, cy] = decal.px(spot.x, spot.z);
    livingBlot(decal.g, cx, cy, spot.rx * 1.25 * decal.scale, spot.rz * 1.25 * decal.scale, 'rgba(14,16,20,0.12)', spot.turn);
  }
  for (let index = 0; index < 40; index += 1) {
    const [cx, cy] = decal.px((rng() - 0.5) * width, cz + (rng() - 0.5) * depth);
    livingBlot(decal.g, cx, cy, (0.1 + rng() * 0.5) * decal.scale, (0.08 + rng() * 0.35) * decal.scale, `rgba(10,10,12,${0.15 + rng() * 0.25})`, rng() * 3);
  }
  // Tyre tracks of the straddle carriers.
  for (const lane of [-3.5, 4.5]) {
    for (const side of [-0.9, 0.9]) {
      decal.g.strokeStyle = 'rgba(18,18,22,0.22)';
      decal.g.lineWidth = 0.3 * decal.scale;
      decal.g.beginPath();
      const [ax, ay] = decal.px(-width / 2, lane + side);
      const [bx, by] = decal.px(width / 2, lane + side + 0.6);
      decal.g.moveTo(ax, ay);
      decal.g.lineTo(bx, by);
      decal.g.stroke();
    }
  }
  group.add(livingDecal({ cz, width, depth, canvas: decal.canvas, y: 0.003 }));
  group.userData.waters = [material];
  group.userData.bloodDyeWater = [livingWaterAt(spots, 6, 0.78)];
  // The yard seen from the puddles (containers, lamps, cranes): a cube rendered once, for the puddles to mirror.
  group.userData.mirror = { at: new THREE.Vector3(0, 0.15, 0), materials: [material] };
  return group;
}

/** Render the place (not the fighters) once into a cube from just above the ground, for standing water to mirror. */
function livingMirror(view, group) {
  const mirror = group.userData.mirror;
  const place = group.parent;
  if (!mirror || !place || !view.renderer) return;
  if (!mirror.target) {
    mirror.target = new THREE.WebGLCubeRenderTarget(256, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const camera = new THREE.CubeCamera(0.1, 200, mirror.target);
    camera.position.copy(mirror.at);
    const stage = new THREE.Scene();
    stage.background = view.scene.background;
    stage.fog = view.scene.fog;
    const fill = new THREE.HemisphereLight(0x8090c0, 0x202020, 0.6);
    stage.add(fill);
    const parent = place.parent;
    const wasVisible = place.visible;
    group.visible = false;
    place.visible = true;
    stage.add(place);
    camera.update(view.renderer, stage);
    parent?.add(place);
    place.visible = wasVisible;
    group.visible = true;
  }
  for (const material of mirror.materials) {
    if (material.envMap !== mirror.target.texture) {
      material.envMap = mirror.target.texture;
      material.needsUpdate = true;
    }
  }
}

// ---- the style ---------------------------------------------------------------

function livingBuild(context) {
  const started = performance.now();
  const { kind } = context;
  let group;
  if (kind === 'grass' || kind === 'trampled') group = livingGrassPlace(context);
  else if (kind === 'dry') group = livingDryPlace(context);
  else if (kind === 'arena-sand') group = livingArenaSand(context);
  else if (kind === 'cobbles') group = livingCobbles(context);
  else if (kind === 'beach') group = livingBeach(context);
  else if (kind === 'wet-concrete') group = livingWetConcrete(context);
  else group = new THREE.Group();
  group.userData.buildMs = performance.now() - started;
  group.userData.waters ??= [];
  group.userData.bloodDyeWater ??= [];
  group.traverse((object) => {
    if (object.userData.waters && object !== group) group.userData.waters.push(...object.userData.waters);
    if (object.userData.bloodDyeWater && object !== group) group.userData.bloodDyeWater.push(...object.userData.bloodDyeWater);
  });
  return group;
}

export const LIVING_GROUND = [
  {
    id: 'ground-living',
    label: 'Living ground',
    blurb: 'The painted ground kept, with geometry and life on top: swaying instanced grass, flowers, half-sunk stones, a gentle relief off the fighting floor, real cobbles, rippled sand, and water that moves and catches the light.',
    hidesGround: false,
    build: livingBuild,
    apply({ view, group }) {
      const mirrored = new Set(group.userData.mirror?.materials ?? []);
      livingMirror(view, group);
      for (const material of new Set(group.userData.waters)) {
        if (mirrored.has(material)) continue;
        if (material.envMap !== view.steelEnv) {
          material.envMap = view.steelEnv;
          material.needsUpdate = true;
        }
      }
    },
  },
];
