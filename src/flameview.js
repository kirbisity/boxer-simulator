// The flamethrower's fire drawn (physics/flame.js is what burns), from footage and stills of the M2 and of thickened-fuel (napalm)
// streams: the fuel leaves the nozzle as a dark rod, lit by the igniter a little past it, and rolls out into a thick, turbulent
// rope of orange-yellow fire that swells and lifts as it goes, black smoke boiling off its top; where it lands it splashes into
// pools that go on burning for many seconds, tall lapping flames over each and black smoke rising; a man struck burns with flames
// licking up off him.
//
// Each flame is one camera-facing quad of a batch of its own (one draw): its shader eats into it with a noise painted once on a
// canvas, scrolled up over the fight's time so the fire rolls and laps, and colours it by its temperature (white-yellow at the
// core, orange, dark red at the edges and tip, dark soot past that), drawn premultiplied: the fire adds its light, the soot at its
// cooled edges darkens what is behind it. A lump of the stream is a ball, stretched along its flight; a patch's flames and a man's
// are tongues, from a base up into a tip. Smoke (normal blending, lit by the scene) is the shots' smoke batch, sooty.
//
// The light: the fires near each other summed into a few clusters, and the brightest given real lights (warm, flickering): the
// first the flash's light (battlefx.js), the next ones lights of the fire's own, made only while a flamethrower is in the fight
// (each costs every lit pixel). The tanks on the carrier's back are three plain meshes, placed each frame.

/* global THREE */

import { P } from './body.js';
import { yawRotate } from './pose.js';
import { battleFxAddPuff, battleFxFireLight, battleFxInstanced, battleFxSceneLight } from './battlefx.js';
import { FLAME, patchReach } from './physics/flame.js';

export const FLAME_VIEW = {
  // At most this many flames a frame (the batch's size), by the picture's quality tier; how bright each kind is drawn.
  most: { high: 900, medium: 600, low: 360 },
  bright: { stream: 0.8, billow: 0.6, pool: 0.65, man: 0.7 },
  // The stream: the rod of fuel unlit for `dark` s of its flight (the igniter lights it ~0.8 m out), its width then (m); the fire
  // round each lump from `size` m, swelling by `swell` m over `swellSeconds`; lifted `lift` m a second² of flight (it is hot air);
  // stretched `streak` s along its flight; as hot as `hot` leaving and `cool` at the end of its flight. Every `billowEvery`th lump
  // past `billowFrom` s rolls a cooler, sootier billow `billow` times as big round it.
  dark: 0.035, rod: 0.04, size: 0.07, swell: 1.05, swellSeconds: 1.3, lift: 0.22, streak: 0.045, hot: 0.9, cool: 0.45,
  billowEvery: 2, billowFrom: 0.25, billow: 1.7,
  // A patch: its flames' height by the fire's power (Heskestad: L = 0.235 Q^0.4 - 1.02 D, m, Q in kW, D its width), at most
  // `tallest` m; tongues `tongues[0]` at a trickle of fuel to `tongues[1]` at its strength, each `width` of its width.
  tallest: 1.8, tongues: [2, 4], width: 0.9,
  // A man alight: tongues off each part as high as `manFlame` m at full heat, `manWidth` m across.
  manFlame: 0.75, manWidth: 0.34,
  // The light: each fire's power (a share of the brightest stream's) puts a light of that intensity, out to `range` m; fires within
  // `merge` m are one; a light at most `most` bright, all of them together `total`; at most `own` lights of the fire's own (by tier)
  // after the flash's; warm (`colour`), flickering by `flicker`. The eye takes it in against the place's light (battleFxSceneLight):
  // `seen` over the root of that, between `seenLeast` (bright day) and `seenMost` (a dark night).
  light: { stream: 6, patch: 1.5, man: 2, most: 6.5, total: 10, range: 12, rangeLeast: 7, merge: 3, own: { high: 2, medium: 2, low: 0 }, colour: [1, 0.52, 0.2], flicker: 0.22, lift: 0.6, seen: 0.75, seenLeast: 0.6, seenMost: 1.3 },
  // Smoke, puffs a second: a patch (at its strength), a man (at full heat), a lump of the stream past `streamFrom` s; each puff's
  // life (s), rise (m/s), size (m, from and to) and opacity; `low` of them on a low tier.
  smoke: { patch: 3, man: 3.5, stream: 0.7, streamFrom: 0.3, life: 5, rise: 1.5, from: 0.35, to: 2.1, alpha: 0.55, low: 0.5 },
};

/** A flicker 0..1 from a seed and the time: a few sines, cheap and never in step. */
const flameViewFlicker = (seed, time) => 0.5 + 0.25 * Math.sin(time * 13.1 + seed * 31.7) + 0.25 * Math.sin(time * 7.3 + seed * 17.9);

const FLAME_VIEW_VERTEX = `
attribute vec4 aFire;
attribute vec3 aTail;
varying vec2 vUv;
varying vec4 vFire;
void main() {
  vec3 centre = instanceMatrix[3].xyz;
  float size = length(instanceMatrix[0].xyz);
  vec4 head = viewMatrix * vec4(centre, 1.0);
  vec4 mvPosition = head;
  vec2 axis = vec2(0.0, 1.0);
  float stretched = 0.0;
  if (dot(aTail, aTail) > 1e-10) {
    vec4 tail = viewMatrix * vec4(centre + aTail, 1.0);
    stretched = length(tail.xy - head.xy);
    if (stretched > 1e-5) axis = (tail.xy - head.xy) / stretched;
    mvPosition = mix(head, tail, position.y + 0.5);
  }
  vec2 side = vec2(axis.y, -axis.x);
  mvPosition.xy += side * position.x * size + axis * position.y * size;
  gl_Position = projectionMatrix * mvPosition;
  // Across -1..1; base (-1) to tip (1); a ball's tip is its far end along its flight.
  vUv = vec2(position.x * 2.0, position.y * 2.0);
  vFire = aFire;
}`;

const FLAME_VIEW_FRAGMENT = `
uniform sampler2D uNoise;
uniform float uTime;
varying vec2 vUv;
varying vec4 vFire;
// Hot to cold: white-yellow, yellow, orange, dark red (display values: past 1 blooms).
vec3 fireRamp(float t) {
  vec3 red = vec3(0.45, 0.05, 0.0);
  vec3 orange = vec3(1.7, 0.55, 0.07);
  vec3 yellow = vec3(2.3, 1.45, 0.35);
  vec3 white = vec3(2.6, 2.3, 1.5);
  if (t < 0.45) return mix(red * t / 0.45 * 1.5, orange, smoothstep(0.15, 0.45, t));
  if (t < 0.85) return mix(orange, yellow, (t - 0.45) / 0.4);
  return mix(yellow, white, min(1.0, (t - 0.85) / 0.15));
}
void main() {
  float temperature = vFire.x;
  float bright = vFire.y;
  float seed = vFire.z;
  float tongue = vFire.w;
  float h = vUv.y * 0.5 + 0.5;
  // Two reads of the noise scrolling up, the finer faster: the fire rolls up through the shape.
  vec2 q = vec2(vUv.x * 0.32 + seed * 7.13, h * (0.55 + 0.25 * tongue) - uTime * (0.55 + 0.6 * tongue) + seed * 3.7);
  float coarse = texture2D(uNoise, q).r;
  float fine = texture2D(uNoise, q * 2.7 + vec2(0.31, -uTime * 0.8)).g;
  float n = coarse * 0.65 + fine * 0.35;
  float body;
  if (tongue > 0.5) {
    // A tongue: broad at the base, narrowing and wavering to the tip, its sides eaten by the noise more the higher it goes.
    // (Its foot rounded and soft: it stands in the burning fuel, not on a line.)
    float sway = (coarse - 0.5) * 1.2 * h;
    float width = mix(0.9, 0.1, pow(h, 0.7)) * mix(0.75, 1.0, smoothstep(0.0, 0.2, h));
    float across = abs(vUv.x + sway) / width;
    body = (1.0 - across * across) * smoothstep(0.0, 0.3, h) * (1.0 - smoothstep(0.6, 1.0, h)) + (n - 0.5) * (0.7 + 0.9 * h);
  } else {
    // A ball of burning fuel: round, its edge torn by the noise.
    body = 1.0 - length(vUv) + (n - 0.5) * 0.85;
  }
  // Nothing reaches the quad's edge.
  vec2 edge = smoothstep(vec2(0.65), vec2(1.0), abs(vUv));
  body = min(body, 1.0 - max(edge.x, edge.y) * 1.2);
  float density = clamp(body * 1.8, 0.0, 1.0);
  if (density < 0.01) discard;
  // Hotter in the thick of it, cooler at the edges and up the tip.
  float t = temperature * (0.35 + 0.65 * density) * (1.0 - 0.6 * h * tongue) + (fine - 0.5) * 0.14;
  float glow = smoothstep(0.06, 0.32, t);
  vec3 colour = fireRamp(clamp(t, 0.0, 1.0)) * glow * bright * density;
  // Thick fire is near opaque: what is behind shows little through it, and flames over flames keep their colour rather than
  // summing to white. Soot where it has cooled: dark, in front of what is behind.
  float cover = density * (glow * 0.6 + (1.0 - glow) * 0.8);
  gl_FragColor = vec4(colour, cover);
}`;

/** A tiling noise (fractal value noise, two different fields in red and green), painted once. */
function flameViewNoiseTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const image = g.createImageData(size, size);
  let seed = 11;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const field = () => {
    const out = new Float32Array(size * size);
    let total = 0;
    for (const [cells, weight] of [[4, 0.5], [8, 0.25], [16, 0.15], [32, 0.1]]) {
      const lattice = Array.from({ length: cells * cells }, random);
      const at = (x, y) => lattice[(y % cells) * cells + (x % cells)];
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const fx = (x / size) * cells;
          const fy = (y / size) * cells;
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          const sx = (fx - x0) * (fx - x0) * (3 - 2 * (fx - x0));
          const sy = (fy - y0) * (fy - y0) * (3 - 2 * (fy - y0));
          const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
          const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
          out[y * size + x] += (top + (bottom - top) * sy) * weight;
        }
      }
      total += weight;
    }
    return out.map((value) => value / total);
  };
  const red = field();
  const green = field();
  for (let index = 0; index < size * size; index += 1) {
    // Stretched about the middle so the shapes have edges.
    image.data[index * 4] = Math.max(0, Math.min(255, (red[index] - 0.5) * 1.8 * 255 + 128));
    image.data[index * 4 + 1] = Math.max(0, Math.min(255, (green[index] - 0.5) * 1.8 * 255 + 128));
    image.data[index * 4 + 2] = 0;
    image.data[index * 4 + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** The fire batch of a view, made when first wanted. */
function flameViewBatch(view) {
  if (view.flameBatch) return view.flameBatch;
  const material = new THREE.ShaderMaterial({
    uniforms: { uNoise: { value: flameViewNoiseTexture() }, uTime: { value: 0 } },
    vertexShader: FLAME_VIEW_VERTEX,
    fragmentShader: FLAME_VIEW_FRAGMENT,
    transparent: true,
    depthWrite: false,
    // Premultiplied: the fire adds, its soot covers.
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = battleFxInstanced(new THREE.PlaneGeometry(1, 1), material, FLAME_VIEW.most.high, [['aFire', 4], ['aTail', 3]]);
  mesh.renderOrder = 6;
  view.scene.add(mesh);
  view.flameBatch = { mesh, count: 0, most: FLAME_VIEW.most.high };
  return view.flameBatch;
}

/** One flame into the batch: at a point (its base, or its middle), `size` m across, a tail (m, world: its length and way), hot 0..1, bright, seed, a tongue or a ball. */
function flameViewPut(batch, x, y, z, size, tailX, tailY, tailZ, temperature, bright, seed, tongue) {
  if (batch.count >= batch.most) return;
  const index = batch.count;
  batch.count += 1;
  const matrix = batch.mesh.instanceMatrix.array;
  const base = index * 16;
  matrix[base] = size;
  matrix[base + 5] = size;
  matrix[base + 10] = size;
  matrix[base + 12] = x;
  matrix[base + 13] = y;
  matrix[base + 14] = z;
  matrix[base + 15] = 1;
  const fire = batch.mesh.geometry.attributes.aFire.array;
  fire[index * 4] = temperature;
  fire[index * 4 + 1] = bright;
  fire[index * 4 + 2] = seed;
  fire[index * 4 + 3] = tongue ? 1 : 0;
  const tail = batch.mesh.geometry.attributes.aTail.array;
  tail[index * 3] = tailX;
  tail[index * 3 + 1] = tailY;
  tail[index * 3 + 2] = tailZ;
}

// The fires that light this frame, as clusters (a fixed pool: nothing allocated a frame).
const FLAME_VIEW_GLOWS = Array.from({ length: 48 }, () => ({ x: 0, y: 0, z: 0, power: 0 }));
let flameViewGlowCount = 0;

/** A fire's light, merged into a near one already counted. */
function flameViewGlow(x, y, z, power) {
  if (power <= 0.01) return;
  const merge = FLAME_VIEW.light.merge;
  for (let index = 0; index < flameViewGlowCount; index += 1) {
    const glow = FLAME_VIEW_GLOWS[index];
    const dx = glow.x - x;
    const dz = glow.z - z;
    if (dx * dx + dz * dz < merge * merge) {
      const share = power / (glow.power + power);
      glow.x += (x - glow.x) * share;
      glow.y += (y - glow.y) * share;
      glow.z += (z - glow.z) * share;
      glow.power += power;
      return;
    }
  }
  if (flameViewGlowCount >= FLAME_VIEW_GLOWS.length) return;
  const glow = FLAME_VIEW_GLOWS[flameViewGlowCount];
  flameViewGlowCount += 1;
  glow.x = x;
  glow.y = y;
  glow.z = z;
  glow.power = power;
}

/** The fire's own lights, `count` of them (made, or taken out of the scene, as the fight wants them). */
function flameViewLights(view, count) {
  const lights = (view.flameLights ??= []);
  while (lights.length < count) {
    const light = new THREE.PointLight(new THREE.Color().fromArray(FLAME_VIEW.light.colour), 0, FLAME_VIEW.light.range, 2);
    light.userData.battleFx = true;
    view.scene.add(light);
    lights.push(light);
  }
  while (lights.length > count) view.scene.remove(lights.pop());
  return lights;
}

/** Sooty smoke off a fire at `at`, `rate` puffs a second over `dt` s of the fight (none while it is paused). */
function flameViewSmoke(view, x, y, z, rate, dt, size = 1) {
  const spec = FLAME_VIEW.smoke;
  if (Math.random() >= rate * dt) return;
  const jitter = () => (Math.random() - 0.5) * 0.5;
  battleFxAddPuff(view, {
    at: [x + jitter(), y + 0.4, z + jitter()], velocity: [jitter(), spec.rise, jitter()],
    size0: spec.from * size, size1: spec.to * size * (0.8 + Math.random() * 0.5), grow: 1.6, alpha: spec.alpha, life: spec.life * (0.8 + Math.random() * 0.4), rise: spec.rise, soot: 1,
  });
}

/** The height of a pool fire's flames (m): Heskestad's, from its power (kW) and its width (m). */
export function poolFlameHeight(kilowatts, width) {
  return Math.max(0.3, Math.min(FLAME_VIEW.tallest, 0.235 * kilowatts ** 0.4 - 1.02 * width));
}

/**
 * The fire this frame: the jets, the patches, the men alight, the pilots, their smoke and their light; the tanks on the carriers'
 * backs. `tier`: the picture's quality ('high', 'medium', 'low').
 */
export function updateFlames(view, world, tier = 'high') {
  const carriers = placeFlameTanks(view, world);
  const flame = world.flame;
  const lit = flame || world.fighters.some((fighter) => fighter.burning) || (world.horses ?? []).some((horse) => horse.burning);
  // The fire's own lights while a flamethrower is in the fight (made at its start: the lit programs change once, not at the first burst).
  const lights = flameViewLights(view, carriers || lit ? FLAME_VIEW.light.own[tier] ?? FLAME_VIEW.light.own.high : 0);
  if (!lit && !view.flameBatch) return;
  const batch = flameViewBatch(view);
  batch.count = 0;
  batch.most = FLAME_VIEW.most[tier] ?? FLAME_VIEW.most.high;
  const time = world.time;
  batch.mesh.material.uniforms.uTime.value = time;
  // The fight's own time since the last frame: smoke goes up at the fight's pace.
  const dt = Math.max(0, Math.min(0.1, time - (view.flameTime ?? time)));
  view.flameTime = time;
  const smoke = FLAME_VIEW.smoke;
  const smokeShare = tier === 'low' ? smoke.low : 1;
  const light = FLAME_VIEW.light;
  flameViewGlowCount = 0;
  // The men alight first (the flames are capped: a man on fire is never the one left out).
  const spots = FLAME_VIEW_SPOTS;
  for (const fighter of world.fighters) {
    const burning = fighter.burning;
    if (!burning || fighter.dormant) continue;
    const heat = burning.heat;
    const x = fighter.x;
    for (let spot = 0; spot < spots.length; spot += 1) {
      const lick = flameViewFlicker(fighter.id * 7 + spot, time);
      if (lick > 0.3 + 0.7 * heat + 0.15) continue;
      const a = spots[spot][0] * 3;
      const b = spots[spot][1] * 3;
      const share = spots[spot][2];
      const height = FLAME_VIEW.manFlame * (0.35 + 0.65 * heat) * (0.75 + 0.5 * lick);
      flameViewPut(batch, x[a] + (x[b] - x[a]) * share, x[a + 1] + (x[b + 1] - x[a + 1]) * share - 0.05, x[a + 2] + (x[b + 2] - x[a + 2]) * share,
        FLAME_VIEW.manWidth * (0.6 + 0.4 * heat), 0, height, 0, 0.55 + 0.4 * heat, FLAME_VIEW.bright.man, fighter.id * 0.37 + spot * 0.13, true);
    }
    const neck = P.neck * 3;
    flameViewSmoke(view, x[neck], x[neck + 1], x[neck + 2], smoke.man * heat * smokeShare, dt);
    flameViewGlow(x[P.pelvis * 3], x[P.pelvis * 3 + 1] + 0.4, x[P.pelvis * 3 + 2], light.man * heat);
  }
  // A horse or a robot dog alight: tongues along its body's capsules (its legs too), as hot as it burns.
  for (const horse of world.horses ?? []) {
    const heat = horse.burning?.heat ?? 0;
    if (heat <= 0.01) continue;
    for (let spot = 0; spot < horse.capsules.length; spot += 1) {
      const capsule = horse.capsules[spot];
      const lick = flameViewFlicker(horse.id * 11 + spot, time);
      if (lick > 0.45 + 0.7 * heat) continue;
      flameViewPut(batch, (capsule.a[0] + capsule.b[0]) / 2, (capsule.a[1] + capsule.b[1]) / 2, (capsule.a[2] + capsule.b[2]) / 2,
        FLAME_VIEW.manWidth * (0.6 + 0.4 * heat), 0, FLAME_VIEW.manFlame * (0.35 + 0.65 * heat) * (0.75 + 0.5 * lick), 0, 0.55 + 0.4 * heat, FLAME_VIEW.bright.man, horse.id * 0.41 + spot * 0.17, true);
    }
    flameViewSmoke(view, horse.at[0], horse.withers, horse.at[1], smoke.man * heat * smokeShare, dt);
    flameViewGlow(horse.at[0], horse.withers + 0.3, horse.at[1], light.man * heat);
  }
  if (flame) {
    // The stream: the rod, the fire round each lump, the billows, the smoke off its top; its light where most of it burns.
    let streamX = 0;
    let streamY = 0;
    let streamZ = 0;
    let streamCount = 0;
    for (const blob of flame.blobs) {
      const age = blob.age;
      const seed = (blob.viewSeed ??= Math.random());
      const fade = 1 - Math.max(0, (age - FLAME.life * 0.6) / (FLAME.life * 0.4));
      const sx = -blob.v[0] * FLAME_VIEW.streak;
      const sy = -blob.v[1] * FLAME_VIEW.streak;
      const sz = -blob.v[2] * FLAME_VIEW.streak;
      if (age < FLAME_VIEW.dark) {
        // The fuel's rod, not yet alight: a dull orange thread lit by the igniter.
        flameViewPut(batch, blob.x[0], blob.x[1], blob.x[2], FLAME_VIEW.rod, sx, sy, sz, 0.3, 0.6, seed, false);
        continue;
      }
      const grown = Math.min(1, (age - FLAME_VIEW.dark) / FLAME_VIEW.swellSeconds) ** 0.75;
      const size = FLAME_VIEW.size + FLAME_VIEW.swell * grown;
      const lift = FLAME_VIEW.lift * age * age;
      const hot = FLAME_VIEW.hot + (FLAME_VIEW.cool - FLAME_VIEW.hot) * Math.min(1, age / 2);
      flameViewPut(batch, blob.x[0], blob.x[1] + lift, blob.x[2], size, sx, sy, sz, hot, FLAME_VIEW.bright.stream * fade, seed, false);
      if (age > FLAME_VIEW.billowFrom && Math.floor(seed * 1000) % FLAME_VIEW.billowEvery === 0) {
        const roll = flameViewFlicker(seed * 50, time);
        flameViewPut(batch, blob.x[0], blob.x[1] + lift + size * 0.35 * roll, blob.x[2], size * FLAME_VIEW.billow * (0.8 + 0.4 * roll), 0, size * 0.5, 0, hot * 0.62, FLAME_VIEW.bright.billow * fade, seed + 0.5, false);
      }
      if (age > smoke.streamFrom) flameViewSmoke(view, blob.x[0], blob.x[1] + lift + size * 0.5, blob.x[2], smoke.stream * smokeShare, dt, 0.8 + grown * 0.6);
      if (age > 0.15) {
        streamX += blob.x[0];
        streamY += blob.x[1];
        streamZ += blob.x[2];
        streamCount += 1;
      }
    }
    if (streamCount) flameViewGlow(streamX / streamCount, streamY / streamCount + 0.3, streamZ / streamCount, light.stream * (0.55 + 0.45 * Math.min(1, streamCount / 25)));
    // The pools: tongues as tall as the pool's fire, lapping; its smoke and light.
    const [fewest, most] = FLAME_VIEW.tongues;
    for (const patch of flame.patches) {
      const strength = Math.min(1, patch.fuel / 0.08);
      const reach = patchReach(patch);
      const kilowatts = FLAME.patch.burn * (patch.wet ? FLAME.patch.wet : 1) * FLAME.machine.fuelHeat * 1e-3 * strength;
      const tall = poolFlameHeight(kilowatts, reach * 2) * Math.min(1, 0.4 + strength);
      const tongues = Math.round(fewest + (most - fewest) * strength);
      for (let tongue = 0; tongue < tongues; tongue += 1) {
        const seed = patch.seed * 10 + tongue;
        const lick = flameViewFlicker(seed, time);
        const angle = seed * 2.4;
        const out = reach * 0.55 * (tongue / tongues);
        const height = tall * (0.55 + 0.6 * lick) * (tongue === 0 ? 1 : 0.75);
        flameViewPut(batch, patch.x[0] + Math.cos(angle) * out, patch.x[1] - 0.12 * height, patch.x[2] + Math.sin(angle) * out,
          reach * 2 * FLAME_VIEW.width * (0.75 + 0.35 * lick), 0, height * 1.12, 0, 0.5 + 0.25 * strength, FLAME_VIEW.bright.pool, patch.seed + tongue * 0.29, true);
      }
      flameViewSmoke(view, patch.x[0], patch.x[1] + tall * 0.6, patch.x[2], smoke.patch * strength * smokeShare, dt, 0.7 + 0.5 * strength);
      flameViewGlow(patch.x[0], patch.x[1] + light.lift, patch.x[2], light.patch * (0.35 + 0.65 * strength));
    }
    // The pilot flame at the nozzle of each wand held.
    for (const [id, valve] of flame.valves) {
      const fighter = world.fighters[id];
      if (!fighter?.weapon?.held || !fighter.weapon.spec.shot?.flame || valve.open) continue;
      const weapon = fighter.weapon;
      const hand = P[`${weapon.main}Hand`] * 3;
      const reach = weapon.spec.muzzle[0];
      flameViewPut(batch, fighter.x[hand] + weapon.dir[0] * reach, fighter.x[hand + 1] + weapon.dir[1] * reach, fighter.x[hand + 2] + weapon.dir[2] * reach,
        0.07, 0, 0.06 + 0.03 * flameViewFlicker(id, time), 0, 0.85, 0.8, id * 0.7, true);
    }
  }
  flameViewFinish(batch);
  flameViewLight(view, lights, time);
}

// A man's flames: from one particle toward another, this share of the way (his trunk twice, his arms, legs and head).
const FLAME_VIEW_SPOTS = [[P.pelvis, P.neck, 0.3], [P.pelvis, P.neck, 0.7], [P.lShoulder, P.lElbow, 0.4], [P.rShoulder, P.rElbow, 0.4], [P.lHip, P.lKnee, 0.4], [P.rHip, P.rKnee, 0.4], [P.lKnee, P.lFoot, 0.4], [P.rKnee, P.rFoot, 0.4], [P.neck, P.head, 0.5]];

function flameViewFinish(batch) {
  const mesh = batch.mesh;
  mesh.count = batch.count;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.geometry.attributes.aFire.needsUpdate = true;
  mesh.geometry.attributes.aTail.needsUpdate = true;
}

/** The brightest clusters of fire lit: the first by the flash's light, the next by the fire's own; each flickering, warm. */
function flameViewLight(view, lights, time) {
  const spec = FLAME_VIEW.light;
  // The brightest first (a few at most: a selection, not a sort of them all).
  for (let rank = 0; rank <= lights.length && rank < flameViewGlowCount; rank += 1) {
    let best = rank;
    for (let index = rank + 1; index < flameViewGlowCount; index += 1) if (FLAME_VIEW_GLOWS[index].power > FLAME_VIEW_GLOWS[best].power) best = index;
    const swap = FLAME_VIEW_GLOWS[rank];
    FLAME_VIEW_GLOWS[rank] = FLAME_VIEW_GLOWS[best];
    FLAME_VIEW_GLOWS[best] = swap;
  }
  const flickerOf = (rank) => 1 - spec.flicker + spec.flicker * 2 * (0.6 * flameViewFlicker(rank * 3.3, time * 1.4) + 0.4 * Math.random());
  const rangeOf = (power) => spec.rangeLeast + (spec.range - spec.rangeLeast) * Math.min(1, power / spec.stream);
  // Each light as bright as its fires, to `most`; all of them together, to `total`.
  const shown = Math.min(flameViewGlowCount, lights.length + 1);
  const place = battleFxSceneLight(view) ?? 0.5;
  const seen = Math.max(spec.seenLeast, Math.min(spec.seenMost, spec.seen / Math.sqrt(Math.max(0.01, place))));
  let sum = 0;
  for (let rank = 0; rank < shown; rank += 1) sum += Math.min(spec.most, FLAME_VIEW_GLOWS[rank].power);
  const scale = (sum > spec.total ? spec.total / sum : 1) * seen;
  const powerOf = (rank) => Math.min(spec.most, FLAME_VIEW_GLOWS[rank].power) * scale;
  if (shown) {
    const glow = FLAME_VIEW_GLOWS[0];
    battleFxFireLight(view, [glow.x, glow.y, glow.z], powerOf(0) * flickerOf(0), rangeOf(powerOf(0)), spec.colour);
  }
  for (let index = 0; index < lights.length; index += 1) {
    const light = lights[index];
    if (index + 1 >= shown) {
      light.intensity = 0;
      continue;
    }
    const glow = FLAME_VIEW_GLOWS[index + 1];
    const power = powerOf(index + 1);
    light.position.set(glow.x, glow.y, glow.z);
    light.intensity = power * flickerOf(index + 1);
    light.distance = rangeOf(power);
  }
}

/** The full tanks on each flamethrower man's back (his kit's: `inputs.style`), placed on his trunk this frame. Whether any is carried. */
export function placeFlameTanks(view, world) {
  const tanks = (view.flameTanks ??= new Map());
  for (const [fighter, group] of tanks) {
    if (world.fighters[fighter.id] === fighter) continue;
    view.scene.remove(group);
    tanks.delete(fighter);
  }
  let carried = false;
  for (const fighter of world.fighters) {
    if (fighter.body.inputs?.style !== 'flamethrower' || fighter.dormant) continue;
    carried = true;
    let group = tanks.get(fighter);
    if (!group) {
      group = flameTankMeshes();
      tanks.set(fighter, group);
      view.scene.add(group);
    }
    const x = fighter.x;
    const at = (index) => new THREE.Vector3(x[index * 3], x[index * 3 + 1], x[index * 3 + 2]);
    const pelvis = at(P.pelvis);
    const neck = at(P.neck);
    const up = neck.clone().sub(pelvis).normalize();
    const across = at(P.rShoulder).sub(at(P.lShoulder)).normalize();
    // His back: square to his shoulders and spine, on the side away from where he faces.
    const back = across.clone().cross(up).normalize();
    const ahead = new THREE.Vector3(...yawRotate([1, 0, 0], fighter.yaw));
    if (back.dot(ahead) > 0) back.negate();
    const forward = back.clone().negate();
    const side = up.clone().cross(forward).normalize();
    group.matrix.makeBasis(side, up, forward);
    group.matrix.setPosition(pelvis.lerp(neck, 0.55).addScaledVector(back, 0.2));
    group.matrixAutoUpdate = false;
    group.matrixWorldNeedsUpdate = true;
  }
  return carried;
}

// The tanks' material, shared by every set.
let flameTankSteel = null;

/** Two fuel tanks and the nitrogen bottle between them, on a frame (local: x across, y up, z ahead). */
function flameTankMeshes() {
  const group = new THREE.Group();
  flameTankSteel ??= new THREE.MeshStandardMaterial({ color: 0x5a6446, roughness: 0.55, metalness: 0.1 });
  for (const x of [-0.11, 0.11]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.52, 14), flameTankSteel);
    tank.position.set(x, -0.02, 0);
    tank.castShadow = true;
    group.add(tank);
  }
  const bottle = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), flameTankSteel);
  bottle.position.set(0, 0.06, -0.07);
  group.add(bottle);
  return group;
}
