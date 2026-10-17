// Battle effects drawn cheaply in a few shared batches: a gun's smoke, its
// muzzle flash and the flicker it throws on what is near, sparks off steel
// and the glint of the sun off a blade.
//
// Smoke: black powder burns to about half its weight in solid salts (potassium
// carbonate, sulphate, sulphide) blown out as a dense white-grey cloud. It
// bursts from the muzzle at many metres a second, is stopped by the air within
// a metre or two, then billows, swells, rises a little (it is warm) and drifts
// with the breeze, thinning over ten seconds or so; the priming in the pan
// gives a smaller puff of its own at the lock. Each cloud is a handful of soft
// camera-facing sprites cut from one painted puff texture, all of them in one
// instanced draw, lit as the scene is lit (the sky's ambient and the sun, or
// the night's dim light, and the flash itself for its moment) and fogged.
// Smokeless powder (a modern pistol or rifle) leaves only a faint wisp.
//
// Glow: everything that gives light rather than takes it (flashes, spark
// streaks, blade glints) is one additive instanced draw, rebuilt each frame.

/* global THREE */

export const BATTLE_FX = {
  // Live smoke sprites, all shots together: a volley of thirty matchlocks is ~250.
  maxPuffs: 420,
  // Live glow sprites: sparks, flashes and glints together.
  maxGlows: 640,
  // A light breeze (m/s, x and z): the cloud drifts off at a slow walk.
  wind: [0.35, 0.12],
  // Warm smoke rises, slowly (m/s), and loses it as it cools.
  rise: 0.14,
  // A cloud goes on spreading as it mixes with the air (m of size per s).
  spread: 0.06,
  // How fast the air stops a puff's own motion (1/s): a muzzle blast of ~8 m/s is spent within ~1.5 m.
  drag: 4.5,
  // Black powder smoke: off-white, a little warm (display values).
  smokeAlbedo: [0.86, 0.85, 0.82],
  // The muzzle flash: how long it shows (s; 2-3 frames at 60 fps), and its light's peak and fall (s).
  flashSeconds: 0.045,
  lightPeak: 3.6,
  lightSeconds: 0.03,
  lightRange: 9,
  flashColour: [1, 0.62, 0.22],
  // Sparks off steel: the share of their life they glow white-hot, and how long a streak each draws (s of travel).
  sparkStreakSeconds: 0.022,
  // A sun glint: how tight the mirror line must be (the half-vector's share along the blade: ~6 degrees, the
  // spread of the sun's image in steel polished to roughness ~0.2), and its size per metre away (glare is a size in the eye).
  glintSharpness: 0.1,
  glintSize: 0.07,
  // The bevels: how far round from the flat the blade's faces turn (tan of the angle).
  glintBevel: 0.55,
  // At most this many glints a frame (a crowd's blades).
  maxGlints: 120,
};

// Which guns burn black powder (the rest are modern, smokeless).
export const BLACK_POWDER = new Set(['matchlock', 'threeEyed', 'adams']);

/**
 * The puffs of one shot, as plain numbers (from: the muzzle; dir: the
 * barrel, unit; up: unit; powder: black powder or not; long: a long gun).
 * Each: where it starts, its velocity, its size from and to (m), how fast it
 * grows (s), its peak opacity, its life (s). `random` is Math.random or a
 * seeded stand-in.
 */
export function battleFxShotPuffs({ from, dir, powder, long, pan }, random = Math.random) {
  const puffs = [];
  const add = (at, velocity, size0, size1, grow, alpha, life) => puffs.push({ at, velocity, size0, size1, grow, alpha, life });
  const jitter = (scale) => [(random() - 0.5) * scale, (random() - 0.5) * scale, (random() - 0.5) * scale];
  if (!powder) {
    // Smokeless: a faint grey wisp at the muzzle, gone in a second or two.
    for (let index = 0; index < 2; index += 1) {
      const speed = 1 + random() * 2;
      const j = jitter(0.6);
      add([...from], [dir[0] * speed + j[0], dir[1] * speed + j[1], dir[2] * speed + j[2]], 0.05, 0.3 + random() * 0.15, 0.5, 0.16, 1.2 + random() * 0.8);
    }
    return puffs;
  }
  const scale = long ? 1 : 0.6;
  // The muzzle cloud: thrown forward fast and stopped by the air, the fastest
  // the furthest; the slow ones hang at the muzzle. A few metres of cloud.
  const count = long ? 10 : 5;
  for (let index = 0; index < count; index += 1) {
    const share = index / (count - 1);
    const speed = (0.4 + share * 6 + random() * 1.5) * scale;
    const j = jitter(1.2 * scale);
    add([...from], [dir[0] * speed + j[0], dir[1] * speed + j[1] + 0.15, dir[2] * speed + j[2]],
      (0.12 + random() * 0.08) * scale, (0.8 + share * 0.5 + random() * 0.6) * scale, 0.5 + random() * 0.6, 0.6 + random() * 0.2, (8 + random() * 6) * (long ? 1 : 0.7));
  }
  // The pan: a small puff up and to the side at the lock.
  if (pan) {
    const j = jitter(0.3);
    add([...pan], [j[0], 0.25 + random() * 0.15, j[2]], 0.05, 0.3 + random() * 0.12, 0.6, 0.45, 4 + random() * 2);
  }
  return puffs;
}

/**
 * One step of a puff (plain numbers, mutated): its own motion dies away into
 * the breeze, it rises, and it ages. Returns its size and opacity now, or
 * null once it has thinned away.
 */
export function battleFxStepPuff(puff, dt, spec = BATTLE_FX) {
  puff.age = (puff.age ?? 0) + dt;
  if (puff.age >= puff.life) return null;
  const keep = Math.exp(-spec.drag * dt);
  const share = puff.age / puff.life;
  // Warm at first, it rises; cooling, it floats on the breeze.
  const rise = spec.rise * (1 - share);
  const target = [spec.wind[0], rise, spec.wind[1]];
  for (let axis = 0; axis < 3; axis += 1) {
    puff.velocity[axis] = target[axis] + (puff.velocity[axis] - target[axis]) * keep;
    puff.at[axis] += puff.velocity[axis] * dt;
  }
  // Billowing out at once, then spreading slowly on as it mixes with the air.
  const size = puff.size0 + (puff.size1 - puff.size0) * (1 - Math.exp(-puff.age / puff.grow)) + spec.spread * puff.age;
  // In within a few hundredths of a second, then thinning as it spreads.
  const opacity = puff.alpha * Math.min(1, puff.age / 0.04) * (1 - share) ** 1.2;
  return { size, opacity };
}

/**
 * Where on a blade the sun's mirror glint falls and how strong it is.
 * The blade runs from `base` to `tip` (world, arrays); `flat` is the normal
 * of its flats, `edge` the way its edge faces (unit); `light` the unit
 * direction to the sun (or the point a lamp is at, `lamp` true); `eye` the
 * camera. A face mirrors the sun into the eye where the half-way vector
 * between the two is one of its normals: square to the blade's length, and
 * within its bevels' turn of the flat. Returns { at, strength } or null.
 */
export function battleFxGlint(base, tip, flat, edge, light, eye, spec = BATTLE_FX, lamp = false) {
  const along = [tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]];
  const length = Math.hypot(...along);
  if (length < 1e-4) return null;
  for (let axis = 0; axis < 3; axis += 1) along[axis] /= length;
  const half = (point) => {
    const view = [eye[0] - point[0], eye[1] - point[1], eye[2] - point[2]];
    const viewLength = Math.hypot(...view) || 1;
    const sun = lamp ? [light[0] - point[0], light[1] - point[1], light[2] - point[2]] : light;
    const sunLength = Math.hypot(...sun) || 1;
    const h = [view[0] / viewLength + sun[0] / sunLength, view[1] / viewLength + sun[1] / sunLength, view[2] / viewLength + sun[2] / sunLength];
    const hLength = Math.hypot(...h) || 1;
    return [h[0] / hLength, h[1] / hLength, h[2] / hLength];
  };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const h0 = half(base);
  const h1 = half(tip);
  const g0 = dot(h0, along);
  const g1 = dot(h1, along);
  // The mirror line crosses the blade where the half vector turns square to it; else the nearer end.
  let share;
  if ((g0 <= 0 && g1 >= 0) || (g0 >= 0 && g1 <= 0)) share = Math.abs(g0 - g1) < 1e-9 ? 0.5 : g0 / (g0 - g1);
  else share = Math.abs(g0) < Math.abs(g1) ? 0 : 1;
  // Not right at the very tip or the shoulder: the light catches the face.
  share = Math.min(0.92, Math.max(0.06, share));
  const at = [base[0] + (tip[0] - base[0]) * share, base[1] + (tip[1] - base[1]) * share, base[2] + (tip[2] - base[2]) * share];
  const h = half(at);
  const off = dot(h, along);
  const onFlat = Math.abs(dot(h, flat));
  const onEdge = Math.abs(dot(h, edge));
  if (onFlat < 1e-3) return null;
  // Beyond the bevels' turn, no face of the blade looks that way.
  const turn = onEdge / onFlat;
  const bevel = turn < spec.glintBevel ? 1 : Math.exp(-(((turn - spec.glintBevel) / 0.15) ** 2));
  const strength = Math.exp(-((off / spec.glintSharpness) ** 2)) * bevel;
  if (strength < 0.04) return null;
  return { at, strength };
}

// ---- drawing (needs THREE) ------------------------------------------------------

const BATTLE_FX_SMOKE_VERTEX = `
attribute vec4 aPuff;
uniform vec3 uFlashPos;
uniform vec3 uFlashColour;
uniform vec3 uLampPos;
uniform vec3 uLampColour;
uniform float uLampRange;
varying vec2 vUv;
varying vec2 vCorner;
varying float vAlpha;
varying vec3 vGlow;
#include <fog_pars_vertex>
void main() {
  vec3 centre = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
  float size = length(instanceMatrix[0].xyz);
  vec4 mvPosition = viewMatrix * vec4(centre, 1.0);
  float c = cos(aPuff.y);
  float s = sin(aPuff.y);
  vec2 corner = position.xy;
  mvPosition.xy += vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y) * size;
  gl_Position = projectionMatrix * mvPosition;
  vec2 cell = vec2(mod(aPuff.z, 2.0), floor(aPuff.z / 2.0)) * 0.5;
  vUv = cell + (vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y) * 0.96 + 0.5) * 0.5;
  vCorner = corner * 2.0;
  vAlpha = aPuff.x;
  vec3 toFlash = uFlashPos - centre;
  vGlow = uFlashColour / (1.0 + dot(toFlash, toFlash) * 5.0);
  // The nearest lamp (a street light at night), fading out to its range as the scene's lights do.
  float lampFall = uLampRange > 0.0 ? clamp(1.0 - distance(uLampPos, centre) / uLampRange, 0.0, 1.0) : 0.0;
  vGlow += uLampColour * lampFall * lampFall;
  #include <fog_vertex>
}`;

const BATTLE_FX_SMOKE_FRAGMENT = `
uniform sampler2D uMap;
uniform vec3 uAmbient;
uniform vec3 uSunColour;
uniform vec3 uSunDir;
uniform vec3 uAlbedo;
varying vec2 vUv;
varying vec2 vCorner;
varying float vAlpha;
varying vec3 vGlow;
#include <fog_pars_fragment>
void main() {
  vec4 tex = texture2D(uMap, vUv);
  float alpha = tex.a * vAlpha;
  if (alpha < 0.003) discard;
  // Each puff lit as a soft ball: its normal from where on the sprite this
  // is, wrapped so the far side is not black (light goes through smoke).
  float r2 = min(1.0, dot(vCorner, vCorner));
  vec3 n = normalize(vec3(vCorner * 0.85, sqrt(1.0 - r2) + 0.3));
  float wrap = max(0.0, (dot(n, uSunDir) + 0.5) / 1.5);
  vec3 light = uAmbient * (0.8 + 0.2 * n.y) + uSunColour * wrap;
  // The painted density: thicker parts a little darker inside.
  vec3 colour = uAlbedo * light * mix(0.78, 1.04, tex.r) + vGlow * uAlbedo;
  gl_FragColor = vec4(colour, alpha);
  #include <fog_fragment>
}`;

const BATTLE_FX_GLOW_VERTEX = `
attribute vec4 aGlow;
attribute vec3 aTail;
varying vec2 vUv;
varying vec3 vColour;
varying float vShape;
void main() {
  vec3 centre = instanceMatrix[3].xyz;
  float size = length(instanceMatrix[0].xyz);
  vec4 head = viewMatrix * vec4(centre, 1.0);
  vec4 mvPosition = head;
  vec2 axis = vec2(0.0);
  float stretched = 0.0;
  if (dot(aTail, aTail) > 1e-10) {
    vec4 tail = viewMatrix * vec4(centre + aTail, 1.0);
    axis = tail.xy - head.xy;
    stretched = length(axis);
    mvPosition = mix(head, tail, position.y + 0.5);
  }
  if (stretched > 1e-5) {
    vec2 along = axis / stretched;
    // Turned so the quad keeps its winding (a mirrored one would be culled).
    vec2 side = vec2(along.y, -along.x);
    mvPosition.xy += side * position.x * size + along * position.y * size;
  } else {
    mvPosition.xy += position.xy * size;
  }
  gl_Position = projectionMatrix * mvPosition;
  vUv = position.xy * 2.0;
  vColour = aGlow.rgb;
  vShape = aGlow.a;
}`;

const BATTLE_FX_GLOW_FRAGMENT = `
varying vec2 vUv;
varying vec3 vColour;
varying float vShape;
void main() {
  float r2 = dot(vUv, vUv);
  vec3 colour;
  if (vShape < 0.5) {
    // A flash: a white-hot core in an orange-yellow flame.
    float flame = exp(-r2 * 4.0) * (1.0 - smoothstep(0.7, 1.0, r2));
    float core = exp(-r2 * 22.0);
    colour = vColour * flame + vec3(1.0, 0.95, 0.85) * core * min(1.0, length(vColour));
  } else if (vShape < 1.5) {
    // A glint: a bright point, four thin rays and a faint halo.
    float core = exp(-r2 * 60.0);
    float ax = abs(vUv.x);
    float ay = abs(vUv.y);
    float rays = exp(-ax * 70.0) * (1.0 - min(1.0, ay)) + exp(-ay * 70.0) * (1.0 - min(1.0, ax));
    float halo = exp(-r2 * 7.0) * 0.25 * (1.0 - smoothstep(0.6, 1.0, r2));
    colour = vColour * (rays * 0.7 + halo) + vec3(1.0) * core * min(1.0, length(vColour));
  } else {
    // A spark's streak: hottest down its middle, fading at both ends.
    float across = exp(-vUv.x * vUv.x * 5.0) * (1.0 - smoothstep(0.55, 1.0, abs(vUv.y)));
    colour = vColour * across + vec3(1.0, 0.95, 0.8) * across * across * 0.6 * min(1.0, length(vColour));
  }
  gl_FragColor = vec4(colour, 1.0);
}`;

/** The painted puffs: a 2 x 2 atlas of four soft lumpy clouds; red is how dense each part is. */
function battleFxPuffTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  // Seeded so every page paints the same puffs.
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let cell = 0; cell < 4; cell += 1) {
    const cx = (cell % 2) * 128 + 64;
    const cy = Math.floor(cell / 2) * 128 + 64;
    // Many soft lumps clumped round the middle: a billow, not a disc.
    for (let lump = 0; lump < 26; lump += 1) {
      const angle = random() * Math.PI * 2;
      const reach = Math.sqrt(random()) * 30;
      const x = cx + Math.cos(angle) * reach;
      const y = cy + Math.sin(angle) * reach;
      const radius = 14 + random() * 20 * (1 - reach / 45);
      const shade = Math.round(150 + random() * 105);
      const blob = g.createRadialGradient(x, y, 0, x, y, radius);
      blob.addColorStop(0, `rgba(${shade},${shade},${shade},${0.45 + random() * 0.25})`);
      blob.addColorStop(0.6, `rgba(${shade},${shade},${shade},${0.2 + random() * 0.1})`);
      blob.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
      g.fillStyle = blob;
      g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }
  // Each cell's edge clear, so the sprite's square never shows.
  const pixels = g.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = ((x % 128) - 63.5) / 64;
      const dy = ((y % 128) - 63.5) / 64;
      const r = Math.sqrt(dx * dx + dy * dy);
      const keep = Math.max(0, Math.min(1, (0.98 - r) / 0.3));
      const index = (y * size + x) * 4 + 3;
      pixels.data[index] = Math.min(255, pixels.data[index] * keep * 1.25);
    }
  }
  g.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

function battleFxInstanced(geometry, material, count, attributes) {
  for (const [name, width] of attributes) {
    const attribute = new THREE.InstancedBufferAttribute(new Float32Array(count * width), width);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, attribute);
  }
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  // Kept out of every scene-wide pass (see-through, look sweeps): it is drawn, not a thing.
  mesh.userData.shared = true;
  mesh.userData.battleFx = true;
  return mesh;
}

/**
 * The view's effects, built on its first frame (so their programs, and the
 * scene's one extra light, are compiled before any fight): the smoke batch,
 * the glow batch and the flash's light.
 */
export function battleFxOf(view) {
  if (view.battleFx) return view.battleFx;
  const smokeMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uMap: { value: null },
      uAmbient: { value: new THREE.Color(0.6, 0.6, 0.6) },
      uSunColour: { value: new THREE.Color(0, 0, 0) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uAlbedo: { value: new THREE.Color().fromArray(BATTLE_FX.smokeAlbedo) },
      uFlashPos: { value: new THREE.Vector3() },
      uFlashColour: { value: new THREE.Color(0, 0, 0) },
      uLampPos: { value: new THREE.Vector3() },
      uLampColour: { value: new THREE.Color(0, 0, 0) },
      uLampRange: { value: 0 },
    }]),
    vertexShader: BATTLE_FX_SMOKE_VERTEX,
    fragmentShader: BATTLE_FX_SMOKE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  smokeMaterial.uniforms.uMap.value = battleFxPuffTexture();
  const smoke = battleFxInstanced(new THREE.PlaneGeometry(1, 1), smokeMaterial, BATTLE_FX.maxPuffs, [['aPuff', 4]]);
  smoke.renderOrder = 5;
  const glowMaterial = new THREE.ShaderMaterial({
    vertexShader: BATTLE_FX_GLOW_VERTEX,
    fragmentShader: BATTLE_FX_GLOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = battleFxInstanced(new THREE.PlaneGeometry(1, 1), glowMaterial, BATTLE_FX.maxGlows, [['aGlow', 4], ['aTail', 3]]);
  glow.renderOrder = 6;
  // One light for every gun: moved to the latest shot, dark between shots
  // (kept in the scene at nothing, so the lit programs never change).
  const light = new THREE.PointLight(new THREE.Color().fromArray(BATTLE_FX.flashColour), 0, BATTLE_FX.lightRange, 2);
  light.userData.battleFx = true;
  view.scene.add(smoke, glow, light);
  view.battleFx = { smoke, glow, light, puffs: [], flashes: [], glints: [], lightAge: Infinity, primary: null, scratch: new THREE.Vector3() };
  return view.battleFx;
}

/** A new bout: the air clears. */
export function battleFxClear(view) {
  const fx = view.battleFx;
  if (!fx) return;
  fx.puffs = [];
  fx.flashes = [];
  fx.glints = [];
  fx.lightAge = Infinity;
  fx.light.intensity = 0;
  fx.smoke.count = 0;
  fx.glow.count = 0;
}

/**
 * A gun goes off at `from` along `dir` (arrays): the flash, the light, the
 * smoke. `powder`: black powder; `long`: a long gun; `pan`: where the
 * priming flashes (black powder), or null.
 */
export function battleFxShot(view, { from, dir, powder, long, pan }) {
  const fx = battleFxOf(view);
  // The flame: a round white-hot core and a tongue of fire out along the barrel; bigger and redder from black powder.
  const big = powder ? (long ? 1 : 0.7) : 0.55;
  const colour = BATTLE_FX.flashColour;
  fx.flashes.push({ at: [...from], size: 0.32 * big, colour: colour.map((c) => c * 2.2), tail: [0, 0, 0], age: 0, seconds: BATTLE_FX.flashSeconds });
  fx.flashes.push({ at: [...from], size: 0.22 * big, colour: colour.map((c) => c * 1.7), tail: dir.map((d) => d * 0.55 * big), age: 0, seconds: BATTLE_FX.flashSeconds * 0.8 });
  if (pan) fx.flashes.push({ at: [...pan], size: 0.09, colour: colour.map((c) => c * 1.8), tail: [0, 0.06, 0], age: 0, seconds: BATTLE_FX.flashSeconds * 1.4 });
  fx.light.position.set(from[0], from[1], from[2]);
  fx.lightAge = 0;
  fx.lightPeak = BATTLE_FX.lightPeak * (powder ? 1 : 0.7);
  for (const puff of battleFxShotPuffs({ from, dir, powder, long, pan })) {
    // Full: the oldest gives way.
    if (fx.puffs.length >= BATTLE_FX.maxPuffs) fx.puffs.shift();
    puff.spin = Math.random() * Math.PI * 2;
    puff.spinRate = (Math.random() - 0.5) * 0.4;
    puff.cell = Math.floor(Math.random() * 4);
    fx.puffs.push(puff);
  }
}

/** A brief flash of light where steel struck steel. */
export function battleFxSpark(view, at, size = 0.14) {
  const fx = battleFxOf(view);
  fx.flashes.push({ at: [...at], size, colour: [1.6, 1.3, 0.8], tail: [0, 0, 0], age: 0, seconds: 0.05 });
}

/** A glint to draw this frame (world point, strength 0..1, colour of the light, size m). */
export function battleFxAddGlint(view, at, strength, colour, size) {
  const fx = view.battleFx;
  if (!fx || fx.glints.length >= BATTLE_FX.maxGlints) return;
  fx.glints.push({ at, strength, colour, size });
}

/** The scene's brightest light, for glints: { light, lamp } or null. */
export function battleFxPrimary(view) {
  return view.battleFx?.primary ?? null;
}

const battleFxScratch = { up: null, side: null, irradiance: null, direction: null };

/**
 * The lamps of the place (point lights within it: street lights, torches),
 * found once a place; the one nearest the smoke lights it.
 */
function battleFxNearestLamp(view, fx, uniforms) {
  if (fx.lampsFor !== view.place) {
    fx.lampsFor = view.place;
    fx.lamps = [];
    view.scene.traverseVisible((object) => {
      if (object.isPointLight && !object.userData.battleFx && object.distance > 0) fx.lamps.push(object);
    });
  }
  uniforms.uLampRange.value = 0;
  uniforms.uLampColour.value.setRGB(0, 0, 0);
  const latest = fx.puffs[fx.puffs.length - 1];
  if (!latest || !fx.lamps.length) return;
  let nearest = null;
  let best = Infinity;
  const at = battleFxScratch.irradiance.fromArray(latest.at);
  for (const lamp of fx.lamps) {
    const distance = lamp.getWorldPosition(battleFxScratch.direction).distanceTo(at);
    if (lamp.visible && lamp.intensity > 0 && distance < lamp.distance && distance < best) {
      best = distance;
      nearest = lamp;
    }
  }
  if (!nearest) return;
  nearest.getWorldPosition(uniforms.uLampPos.value);
  uniforms.uLampColour.value.copy(nearest.color).multiplyScalar(nearest.intensity * 0.6);
  uniforms.uLampRange.value = nearest.distance;
}

/** How the scene lights a puff: an ambient from the sky (probe, hemisphere, ambient) and its brightest direct light. */
function battleFxLighting(view, fx) {
  if (!battleFxScratch.up) {
    battleFxScratch.up = new THREE.Vector3(0, 1, 0);
    battleFxScratch.side = new THREE.Vector3(0.7, 0, 0.7).normalize();
    battleFxScratch.irradiance = new THREE.Vector3();
    battleFxScratch.direction = new THREE.Vector3();
  }
  const ambient = [0, 0, 0];
  let primary = null;
  let best = 0;
  const others = [];
  for (const light of view.scene.children) {
    if (!light.isLight || !light.visible || light.intensity <= 0 || light.userData.battleFx) continue;
    if (light.isLightProbe) {
      // The probe's irradiance, as a Lambert surface takes it (divided by pi), half from above, half from the side.
      const up = light.sh.getIrradianceAt(battleFxScratch.up, battleFxScratch.irradiance).toArray();
      const side = light.sh.getIrradianceAt(battleFxScratch.side, battleFxScratch.irradiance).toArray();
      for (let c = 0; c < 3; c += 1) ambient[c] += ((up[c] + side[c]) / 2 / Math.PI) * light.intensity;
    } else if (light.isHemisphereLight) {
      const sky = light.color.toArray();
      const ground = light.groundColor.toArray();
      for (let c = 0; c < 3; c += 1) ambient[c] += (sky[c] * 0.65 + ground[c] * 0.35) * light.intensity;
    } else if (light.isAmbientLight) {
      const colour = light.color.toArray();
      for (let c = 0; c < 3; c += 1) ambient[c] += colour[c] * light.intensity;
    } else if (light.isDirectionalLight || light.isSpotLight) {
      const strength = light.intensity * (light.color.r + light.color.g + light.color.b);
      if (strength > best) {
        if (primary) others.push(primary);
        primary = light;
        best = strength;
      } else others.push(light);
    }
  }
  // The lesser direct lights only lift the shade.
  for (const light of others) {
    const colour = light.color.toArray();
    for (let c = 0; c < 3; c += 1) ambient[c] += colour[c] * light.intensity * 0.35;
  }
  const uniforms = fx.smoke.material.uniforms;
  uniforms.uAmbient.value.fromArray(ambient);
  battleFxNearestLamp(view, fx, uniforms);
  fx.primary = primary;
  if (primary) {
    const direction = battleFxScratch.direction.copy(primary.position).sub(primary.target.position).normalize();
    uniforms.uSunColour.value.copy(primary.color).multiplyScalar(primary.intensity * (primary.isSpotLight ? 0.6 : 1));
    uniforms.uSunDir.value.copy(direction).transformDirection(view.camera.matrixWorldInverse);
  } else uniforms.uSunColour.value.setRGB(0, 0, 0);
}

/**
 * Move the smoke on, age the flashes and the light, and fill both batches
 * for this frame: the puffs, then the flashes, the sparks (from `sparks`:
 * { position, velocity, life, lifeAtStart }) and the glints asked for.
 */
export function battleFxUpdate(view, dt, sparks = []) {
  const fx = battleFxOf(view);
  battleFxLighting(view, fx);
  // The light: up at once, gone in a few hundredths of a second.
  fx.lightAge += dt;
  const flicker = fx.lightAge < 0.2 ? Math.exp(-fx.lightAge / BATTLE_FX.lightSeconds) : 0;
  fx.light.intensity = (fx.lightPeak ?? BATTLE_FX.lightPeak) * flicker;
  const uniforms = fx.smoke.material.uniforms;
  uniforms.uFlashPos.value.copy(fx.light.position);
  uniforms.uFlashColour.value.copy(fx.light.color).multiplyScalar(fx.light.intensity * 0.5);
  // The smoke.
  const smoke = fx.smoke;
  const matrices = smoke.instanceMatrix.array;
  const puffData = smoke.geometry.attributes.aPuff.array;
  let drawn = 0;
  fx.puffs = fx.puffs.filter((puff) => {
    const now = battleFxStepPuff(puff, dt);
    if (!now) return false;
    puff.spin += puff.spinRate * dt;
    const base = drawn * 16;
    matrices[base] = now.size;
    matrices[base + 1] = 0;
    matrices[base + 2] = 0;
    matrices[base + 5] = now.size;
    matrices[base + 10] = now.size;
    matrices[base + 12] = puff.at[0];
    matrices[base + 13] = puff.at[1];
    matrices[base + 14] = puff.at[2];
    matrices[base + 15] = 1;
    puffData[drawn * 4] = now.opacity;
    puffData[drawn * 4 + 1] = puff.spin;
    puffData[drawn * 4 + 2] = puff.cell;
    puffData[drawn * 4 + 3] = 0;
    drawn += 1;
    return true;
  });
  smoke.count = drawn;
  smoke.instanceMatrix.needsUpdate = true;
  smoke.geometry.attributes.aPuff.needsUpdate = true;
  // The glow: flashes, sparks, glints.
  const glow = fx.glow;
  const glowMatrices = glow.instanceMatrix.array;
  const glowData = glow.geometry.attributes.aGlow.array;
  const tails = glow.geometry.attributes.aTail.array;
  let lit = 0;
  const put = (at, size, colour, shape, tail) => {
    if (lit >= BATTLE_FX.maxGlows) return;
    const base = lit * 16;
    glowMatrices[base] = size;
    glowMatrices[base + 5] = size;
    glowMatrices[base + 10] = size;
    glowMatrices[base + 12] = at[0];
    glowMatrices[base + 13] = at[1];
    glowMatrices[base + 14] = at[2];
    glowMatrices[base + 15] = 1;
    glowData[lit * 4] = colour[0];
    glowData[lit * 4 + 1] = colour[1];
    glowData[lit * 4 + 2] = colour[2];
    glowData[lit * 4 + 3] = shape;
    tails[lit * 3] = tail ? tail[0] : 0;
    tails[lit * 3 + 1] = tail ? tail[1] : 0;
    tails[lit * 3 + 2] = tail ? tail[2] : 0;
    lit += 1;
  };
  fx.flashes = fx.flashes.filter((flash) => {
    flash.age += dt;
    // Drawn on the frame it went off even when the clock is stopped.
    if (flash.age > flash.seconds) return false;
    const fade = 1 - flash.age / flash.seconds;
    const swell = 1 + (flash.age / flash.seconds) * 0.6;
    put(flash.at, flash.size * swell, flash.colour.map((c) => c * fade), 0, flash.tail);
    return true;
  });
  const streak = [0, 0, 0];
  const colour = [0, 0, 0];
  for (const spark of sparks) {
    // White-yellow hot, cooling to orange and dull red as it flies.
    const heat = Math.max(0, Math.min(1, spark.life / (spark.lifeAtStart ?? 0.4)));
    colour[0] = 1.5 + heat * 0.9;
    colour[1] = 0.45 + heat * 1.3;
    colour[2] = 0.08 + heat * 0.7;
    const hot = 0.35 + heat * 0.65;
    for (let c = 0; c < 3; c += 1) colour[c] *= hot;
    streak[0] = -spark.velocity.x * BATTLE_FX.sparkStreakSeconds;
    streak[1] = -spark.velocity.y * BATTLE_FX.sparkStreakSeconds;
    streak[2] = -spark.velocity.z * BATTLE_FX.sparkStreakSeconds;
    put(spark.position.toArray(), spark.width ?? 0.007, colour, 2, streak);
  }
  for (const glint of fx.glints) put(glint.at, glint.size, glint.colour.map((c) => c * glint.strength), 1, null);
  // How many were drawn (tests, tuning).
  fx.glintsDrawn = fx.glints.length;
  fx.glints = [];
  glow.count = lit;
  glow.instanceMatrix.needsUpdate = true;
  glow.geometry.attributes.aGlow.needsUpdate = true;
  glow.geometry.attributes.aTail.needsUpdate = true;
}
