// The weather of Stage 1: a storm over a black sea. A bruised purple-grey sky with one pale break low in the west, a sea
// that heaves, rain that follows the player and stops under a roof, and lightning every several seconds (seeded, so a run
// has its own storm but the same each time): a bolt over the water and a flash on the whole scene. The grading is baked
// into the colours (muted, cool, desaturated) so there is no full-screen pass; the one thing added to the page is a
// cheap vignette (boxer.css, body[data-place="dunnottar"]).
//
// render.js builds the place with `buildStormPlace({ buildRain })` and calls the place's `tick(time)` each frame; the
// castle kit (kit.js) tells it where the player is (`stormFollow`), so that the rain falls round him and the sea and sky
// stay put round the stage.

import { ktRandom } from './kittex.js';

/** Where the weather is centred: round the stage, and the rain and bolts round the player. */
const STORM = {
  centre: [-30, 0, 0],
  skyRadius: 560,
  seaSize: 1800,
  // Seconds between strikes (from, to), and how long one lasts.
  gap: [4, 11],
  flashSeconds: 0.55,
  rain: { halfX: 15, halfZ: 15, height: 18, count: 2200, speed: 15, length: 0.8, slant: [3.2, 0, -1.4] },
};

const stormState = {
  follow: [-100, 14, 0],
  indoors: false,
  place: null,
  view: null,
  random: ktRandom(1500),
  nextStrike: 3.5,
  strike: null,
  base: null,
  environment: null,
};

/** Tell the weather where the player is (and whether he is under a roof). */
export function stormFollow(x, y, z, indoors = false) {
  stormState.follow[0] = x;
  stormState.follow[1] = y;
  stormState.follow[2] = z;
  stormState.indoors = indoors;
}

/** Start a run of the storm over: a new seed (the stage's), strikes from the beginning. */
export function stormReset(seed = 1500) {
  stormState.random = ktRandom(seed);
  stormState.nextStrike = 3.5;
  stormState.strike = null;
}

// ---- the sky -------------------------------------------------------------------------------------

/** The sky as a painted equirectangular map: black-violet overhead, clouds in banks, a pale break low in the west, a dark sea under the horizon. */
function stormSkyCanvas(width = 1024, height = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  const random = ktRandom(2024);
  const gradient = g.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#15131f');
  gradient.addColorStop(0.28, '#272433');
  gradient.addColorStop(0.44, '#443f50');
  gradient.addColorStop(0.495, '#6d6676');
  gradient.addColorStop(0.5, '#3a3745');
  gradient.addColorStop(1, '#14161d');
  g.fillStyle = gradient;
  g.fillRect(0, 0, width, height);
  // The break in the cloud: pale, a little amber, low over the sea to the west (u = 0.25), with a few shafts reaching down.
  const breakX = width * 0.25;
  const glow = g.createRadialGradient(breakX, height * 0.46, 0, breakX, height * 0.46, width * 0.16);
  glow.addColorStop(0, 'rgba(236,208,160,0.95)');
  glow.addColorStop(0.25, 'rgba(190,168,150,0.6)');
  glow.addColorStop(1, 'rgba(110,100,120,0)');
  g.fillStyle = glow;
  g.fillRect(0, height * 0.2, width, height * 0.32);
  g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 7; k += 1) {
    const a = (random() - 0.5) * 0.9;
    const ray = g.createLinearGradient(breakX, height * 0.4, breakX + a * 220, height * 0.5);
    ray.addColorStop(0, 'rgba(210,190,160,0.20)');
    ray.addColorStop(1, 'rgba(210,190,160,0)');
    g.fillStyle = ray;
    g.beginPath();
    g.moveTo(breakX - 6, height * 0.4);
    g.lineTo(breakX + 6, height * 0.4);
    g.lineTo(breakX + a * 220 + 28, height * 0.5);
    g.lineTo(breakX + a * 220 - 28, height * 0.5);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  // Cloud banks: soft dark and lighter masses, flattened, thickest overhead; wrapped round the seam.
  for (let k = 0; k < 420; k += 1) {
    const x = random() * width;
    const y = height * (0.04 + random() * 0.44);
    const size = 30 + random() * 90;
    const dark = random() < 0.62;
    const nearBreak = Math.exp(-Math.pow((x - breakX) / (width * 0.14), 2)) * (y / height > 0.3 ? 1 : 0);
    const alpha = dark ? 0.2 : 0.1 * (1 - nearBreak * 0.8);
    for (const ox of [0, width, -width]) {
      const blob = g.createRadialGradient(x + ox, y, 0, x + ox, y, size);
      blob.addColorStop(0, dark ? `rgba(12,10,20,${alpha})` : `rgba(116,108,132,${alpha})`);
      blob.addColorStop(1, 'rgba(0,0,0,0)');
      g.save();
      g.translate(0, y);
      g.scale(1, 0.34);
      g.translate(0, -y);
      g.fillStyle = blob;
      g.fillRect(x + ox - size, y - size, size * 2, size * 2);
      g.restore();
    }
  }
  // The sea under the horizon: darker with a few paler swells.
  for (let k = 0; k < 90; k += 1) {
    g.fillStyle = `rgba(80,86,100,${0.03 + random() * 0.05})`;
    g.fillRect(random() * width, height * (0.52 + random() * 0.2), 40 + random() * 160, 2 + random() * 3);
  }
  return canvas;
}

/** A wave normal map: many waves of random direction and size (whole numbers of them to the tile, so it tiles), turned into normals. */
function stormWaveTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const image = g.createImageData(size, size);
  const random = ktRandom(808);
  const waves = [];
  for (let k = 0; k < 16; k += 1) {
    const kx = Math.round((random() - 0.5) * 18);
    const ky = Math.round((random() - 0.5) * 18);
    if (!kx && !ky) continue;
    waves.push({ kx, ky, phase: random() * Math.PI * 2, amplitude: 1 / Math.hypot(kx, ky) });
  }
  const height = (x, y) => {
    let h = 0;
    for (const w of waves) h += Math.sin(((x * w.kx + y * w.ky) / size) * Math.PI * 2 + w.phase) * w.amplitude;
    return h;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = -(height(x + 1, y) - height(x - 1, y)) * 2.2;
      const ny = -(height(x, y + 1) - height(x, y - 1)) * 2.2;
      const length = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      image.data[i] = ((nx / length) * 0.5 + 0.5) * 255;
      image.data[i + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      image.data[i + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** The environment the wet stone, the puddles and the sea reflect: the storm sky, prefiltered (once per renderer). */
export function stormEnvironment(renderer) {
  if (stormState.environment?.renderer === renderer) return stormState.environment.texture;
  const texture = new THREE.CanvasTexture(stormSkyCanvas(512, 256));
  texture.mapping = THREE.EquirectangularReflectionMapping;
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromEquirectangular(texture);
  generator.dispose();
  texture.dispose();
  stormState.environment = { renderer, texture: target.texture };
  return target.texture;
}

// ---- lightning -----------------------------------------------------------------------------------

/** A bolt: a jagged ribbon from the cloud to the sea, facing the player, with a branch or two. Returns a mesh. */
function stormBolt(random, from, material, facing) {
  // Over the water in front of him, within a third of a turn either side of where he looks.
  const bearing = facing + (random() - 0.5) * 2.2;
  const distance = 150 + random() * 120;
  const x = from[0] + Math.cos(bearing) * distance;
  const z = from[2] + Math.sin(bearing) * distance;
  // Across the line of sight: the ribbon's width runs along this.
  const side = [-Math.sin(bearing), Math.cos(bearing)];
  const points = [];
  const top = 190;
  const bottom = -9;
  const segments = 16;
  let sway = 0;
  for (let k = 0; k <= segments; k += 1) {
    const y = top + ((bottom - top) * k) / segments;
    sway += (random() - 0.5) * 22;
    points.push([sway, y]);
  }
  const strips = [{ points, width: 1.9 }];
  for (let b = 0; b < 2; b += 1) {
    const start = 4 + Math.floor(random() * 7);
    const branch = [points[start]];
    let s = points[start][0];
    const direction = random() < 0.5 ? -1 : 1;
    for (let k = 1; k < 5; k += 1) {
      s += direction * (4 + random() * 10);
      branch.push([s, points[start][1] - k * (12 + random() * 8)]);
    }
    strips.push({ points: branch, width: 0.9 });
  }
  const position = [];
  for (const strip of strips) {
    for (let k = 0; k + 1 < strip.points.length; k += 1) {
      const [s0, y0] = strip.points[k];
      const [s1, y1] = strip.points[k + 1];
      const w = strip.width;
      const p = (s, y, dw) => [x + side[0] * (s + dw), y, z + side[1] * (s + dw)];
      const a = p(s0, y0, -w);
      const b = p(s0, y0, w);
      const c = p(s1, y1, w);
      const d = p(s1, y1, -w);
      position.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;
  mesh.userData.at = [x, z];
  return mesh;
}

/** The flash's brightness at `age` s into a strike: a crack, a dip, a second crack, a slow fade. */
function stormFlash(age) {
  if (age < 0 || age > STORM.flashSeconds) return 0;
  if (age < 0.07) return 1;
  if (age < 0.13) return 0.25;
  if (age < 0.21) return 0.9;
  return Math.max(0, 0.55 * (1 - (age - 0.21) / (STORM.flashSeconds - 0.21)));
}

// ---- the place ----------------------------------------------------------------------------------------

/**
 * The storm's place group: sky, sea, rain, and the bolt. `buildRain` is render.js's (injected, as it is private to it).
 * `place.userData.tick(time)` moves it; `place.userData.bind(view)` gives it the scene's lights to flash.
 */
export function buildStormPlace({ buildRain }) {
  const place = new THREE.Group();
  place.name = 'storm';
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(STORM.skyRadius, 32, 16),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(stormSkyCanvas()), side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.position.set(...STORM.centre);
  sky.rotation.y = 0.9;
  sky.renderOrder = -1;
  place.add(sky);
  // The sea: heaving normals scrolled over a dark glossy plane.
  const waves = stormWaveTexture();
  waves.repeat.set(70, 70);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(STORM.seaSize, STORM.seaSize),
    new THREE.MeshStandardMaterial({ color: 0x17202c, roughness: 0.42, metalness: 0.3, normalMap: waves, normalScale: new THREE.Vector2(0.55, 0.55), envMapIntensity: 1.1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(STORM.centre[0], -9, STORM.centre[2]);
  sea.name = 'stage-sea';
  // Drawn after the castle and the land (which hide a good part of it): the sea is the most expensive pixel of the picture, and one the depth test can refuse is not shaded.
  sea.renderOrder = 1;
  place.add(sea);
  // Rain, which comes down round the player.
  const rain = buildRain(STORM.rain);
  place.add(rain);
  const boltMaterial = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  place.userData.storm = { sea, rain, waves, boltMaterial };
  place.userData.bind = (view) => {
    stormState.view = view;
    stormState.place = place;
    stormState.base = null;
    stormReset();
    place.userData.storm.env = stormEnvironment(view.renderer);
    sea.material.envMap = place.userData.storm.env;
    sea.material.needsUpdate = true;
  };
  place.userData.tick = (time) => {
    waves.offset.set((time * 0.006) % 1, (time * 0.011) % 1);
    const [fx, fy, fz] = stormState.follow;
    // The rain falls round him, stops under a roof, and runs on the same clock as the weather.
    rain.visible = !stormState.indoors;
    rain.userData.tick(time);
    rain.position.set(fx, fy - 4, fz);
    const view = stormState.view;
    if (!view) return;
    const scene = view.scene;
    // A storm light: cold, dim, from the sky; the sun's shadow (made for a ring) is not wanted over a whole stage.
    view.lights.hemi.color.setHex(0x78748f);
    view.lights.hemi.groundColor.setHex(0x2a2530);
    view.lights.sun.color.setHex(0x9a98b8);
    view.lights.sun.castShadow = false;
    // Strikes, from the stage's seed.
    if (!stormState.strike && time > stormState.nextStrike) {
      const look = new THREE.Vector3();
      view.camera.getWorldDirection(look);
      const bolt = stormBolt(stormState.random, stormState.follow, boltMaterial, Math.atan2(look.z, look.x));
      place.add(bolt);
      stormState.strike = { start: time, bolt };
      stormState.nextStrike = time + STORM.gap[0] + stormState.random() * (STORM.gap[1] - STORM.gap[0]);
    }
    const strike = stormState.strike;
    let flash = 0;
    if (strike) {
      if (stormState.hold) strike.start = time - 0.02;
      flash = stormFlash(time - strike.start);
      boltMaterial.opacity = Math.min(1, flash * 1.4);
      if (time - strike.start > STORM.flashSeconds) {
        place.remove(strike.bolt);
        strike.bolt.geometry.dispose();
        stormState.strike = null;
        flash = 0;
      }
    }
    // The flash on the whole scene: the sky light, the fog and the background lift toward a cold white.
    const lights = view.lights;
    if (!stormState.base || (flash === 0 && !stormState.flashing)) {
      stormState.probe = scene.children.find((child) => child.isLightProbe) ?? null;
      stormState.base = { hemi: lights.hemi.intensity, sun: lights.sun.intensity, key: lights.key.intensity, probe: stormState.probe?.intensity ?? 0, fog: scene.fog?.color.clone(), background: scene.background?.clone?.() };
    }
    stormState.flashing = flash > 0;
    const base = stormState.base;
    const dim = stormState.indoors ? 0.3 : 1;
    if (flash > 0 || stormState.flashed) {
      lights.hemi.intensity = base.hemi + flash * 2.4 * dim;
      lights.sun.intensity = base.sun + flash * 1.6 * dim;
      lights.key.intensity = base.key + flash * 1.2 * dim;
      if (stormState.probe) stormState.probe.intensity = base.probe + flash * 2.2 * dim;
      if (scene.fog && base.fog) scene.fog.color.copy(base.fog).lerp(new THREE.Color(0xb9c4e4), flash * 0.5 * dim);
      if (base.background) scene.background = base.background.clone().lerp(new THREE.Color(0xb9c4e4), flash * 0.5 * dim);
      stormState.flashed = flash > 0;
    }
  };
  return place;
}

/** Leaving the storm: the lights it tinted go back to what the next place sets (the intensities are set by the place; the colours here). */
export function stormRelease(view) {
  const { hemi, sun } = view.lights;
  const saved = view.defaults?.lights;
  if (saved) {
    hemi.color.copy(saved.hemi.color);
    hemi.groundColor.copy(saved.hemi.groundColor);
    sun.color.copy(saved.sun.color);
    sun.castShadow = saved.sun.castShadow;
  }
  stormState.view = null;
  stormState.base = null;
}

/** Bring the next strike to now (for the weather's test, and a look at one). */
export function stormStrikeNow(hold = false) {
  stormState.nextStrike = 0;
  stormState.hold = hold;
}
