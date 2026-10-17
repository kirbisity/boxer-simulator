// Scenery variants: generated land (proof of concept). See src/scenery.js for the contract.
//
// ridges  — painted skyline rings far out (120–470 m), fBm ridgelines, aerial perspective, the place's mountains in them.
// terrain — a real displaced land mesh round the fighting ground out to 230 m, flat where the fight is, coloured by height and slope.
// ground  — the ground's far reach: an outer ground with a macro variation beneath the place's own, tufts and bushes out into the haze.
// generated-land — all three, ridges far, terrain near-mid, ground and tufts on top of the terrain.

/* global THREE */

// ---- noise -------------------------------------------------------------------

/** A seeded generator from a string. */
function generatedRandom(text) {
  let seed = 2166136261;
  for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2D gradient noise in about [-1, 1], seeded. */
function generatedNoise(random) {
  const perm = new Uint8Array(512);
  const base = Array.from({ length: 256 }, (_, index) => index);
  for (let index = 255; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [base[index], base[other]] = [base[other], base[index]];
  }
  for (let index = 0; index < 512; index += 1) perm[index] = base[index & 255];
  const gx = [1, -1, 1, -1, 1.41, -1.41, 0, 0];
  const gy = [1, 1, -1, -1, 0, 0, 1.41, -1.41];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const corner = (cx, cy) => {
      const hash = perm[perm[X + cx] + Y + cy] & 7;
      return gx[hash] * (xf - cx) + gy[hash] * (yf - cy);
    };
    const u = fade(xf);
    const v = fade(yf);
    const bottom = corner(0, 0) + u * (corner(1, 0) - corner(0, 0));
    const top = corner(0, 1) + u * (corner(1, 1) - corner(0, 1));
    return (bottom + v * (top - bottom)) * 0.7;
  };
}

function generatedFbm(noise, x, y, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += amp * noise(x * freq + octave * 17.3, y * freq - octave * 9.1);
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

/** Ridged multifractal in about [0, 1]: sharp crests, soft valleys. */
function generatedRidged(noise, x, y, octaves = 5) {
  let sum = 0;
  let amp = 0.55;
  let freq = 1;
  let weight = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    let n = 1 - Math.abs(noise(x * freq + octave * 31.7, y * freq + octave * 7.7) * 1.4);
    n *= n;
    n *= weight;
    weight = Math.min(1, Math.max(0, n * 1.6));
    sum += amp * n;
    freq *= 2.1;
    amp *= 0.5;
  }
  return sum;
}

const generatedSmooth = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
const generatedMix = (a, b, t) => a + (b - a) * t;
const generatedColour = (hex) => new THREE.Color(hex);

// ---- the land, shared by terrain and ground ------------------------------------

const GENERATED_RADIUS = 230;
const GENERATED_FAR = 700;

/** Each place's land: how it rises, its colours, its great mountains placed for real distances. */
const GENERATED_PLACES = {
  meadow: {
    character: 'rolling', ramp: 26, slope: 0.13, scale: 70,
    grass: 0x6d8a45, lush: 0x5c7c38, woods: 0x34532a, rock: 0x77735f, dry: 0x8a8a4a,
    ridge: 0x4f6a3e, ridgeAngle: 0.55, tuft: 0x6a8a3a, bush: 0x34532a, bushes: 1200,
  },
  field: {
    character: 'rolling', ramp: 30, slope: 0.11, scale: 90,
    grass: 0x6d8a45, lush: 0x5e7e3a, woods: 0x34532a, rock: 0x77735f, dry: 0x8a8a4a,
    ridge: 0x506c40, ridgeAngle: 0.5, tuft: 0x6c8c3e, bush: 0x34532a, bushes: 1200,
  },
  plain: {
    character: 'dry', ramp: 35, slope: 0.075, scale: 80,
    grass: 0x857c48, lush: 0x6e6c44, woods: 0x3e4a34, rock: 0x5c5850, dry: 0x9a8a58,
    ridge: 0x6a6450, ridgeAngle: 0.75, tuft: 0x8c8448, bush: 0x5e6440, bushes: 450,
    volcanoes: [
      { angle: -1.92, distance: 175, height: 38, radius: 82, shape: 'cone', snow: 0.6 },
      { angle: -1.36, distance: 185, height: 30, radius: 95, shape: 'ridge', snow: 0.62 },
    ],
  },
  sengoku: {
    character: 'forested', ramp: 22, slope: 0.2, scale: 85,
    grass: 0x6a7a40, lush: 0x4a6a34, woods: 0x2c4a2c, rock: 0x666660, dry: 0x7d8a4a,
    ridge: 0x37523e, ridgeAngle: 1.25, tuft: 0x6e8040, bush: 0x2c4430, bushes: 1600,
  },
};

/**
 * Foothills: the same land made gentle, for when a photograph carries the
 * mountains. The ground undulates a little (bump, in metres) just off the
 * fighting ground and rises slowly (slope, metres per metre) into small
 * hills at the far edge (radius), where the haze takes them into the
 * photograph's horizon. No volcanoes: the photograph has its own.
 */
// farTint is the photograph's own ground just below its horizon (its mean
// colour from 2 to 6 degrees down): the far hills take it on, so the land
// runs into the picture's land without a change of colour.
const GENERATED_FOOTHILLS = {
  meadow: { ...GENERATED_PLACES.meadow, bump: 0.8, slope: 0.075, ramp: 12, radius: 360, cap: 22, farTint: 0x56663d },
  field: { ...GENERATED_PLACES.field, bump: 0.7, slope: 0.065, ramp: 14, radius: 360, cap: 20, farTint: 0x56663d },
  plain: { ...GENERATED_PLACES.plain, bump: 0.6, slope: 0.08, ramp: 16, radius: 360, cap: 24, volcanoes: [], farTint: 0x6a5e4c },
  sengoku: { ...GENERATED_PLACES.sengoku, bump: 0.9, slope: 0.11, ramp: 12, radius: 360, cap: 32, farTint: 0x858759 },
};

// The haze while foothills are shown: far enough to see the hills, near enough that their edge fades into the horizon.
const GENERATED_FOOTHILLS_FOG = [70, 420];

const generatedLands = new Map();

/** The land of a place: a height at any (x, z) and the noise behind it; the same every time. */
function generatedLand(place, spec, profile = 'land') {
  const key = `${place}:${profile}`;
  if (generatedLands.has(key)) return generatedLands.get(key);
  const land = profile === 'foothills' ? GENERATED_FOOTHILLS[place] : GENERATED_PLACES[place];
  const random = generatedRandom(`land:${place}`);
  const noise = generatedNoise(random);
  const patch = generatedNoise(random);
  const [kx, kz] = spec.keepOut;
  const clear = spec.keepClear ?? [];
  const volcanoes = (land.volcanoes ?? []).map((volcano) => ({
    ...volcano, x: Math.cos(volcano.angle) * volcano.distance, z: Math.sin(volcano.angle) * volcano.distance,
  }));

  /** Metres outside the flat ground (keepOut plus a margin), and how much the land may rise there (0 flat .. 1). */
  const flatness = (x, z) => {
    const qx = Math.max(Math.abs(x) - kx, 0);
    const qz = Math.max(Math.abs(z) - kz, 0);
    const outside = Math.hypot(qx, qz) - 4;
    let rise = generatedSmooth(0, land.ramp, outside);
    for (const { at, radius } of clear) rise *= generatedSmooth(radius + 3, radius + 16, Math.hypot(x - at[0], z - at[1]));
    return { outside, rise };
  };

  const volcanoHeight = (x, z) => {
    let best = 0;
    for (const volcano of volcanoes) {
      const dx = x - volcano.x;
      const dz = z - volcano.z;
      let s;
      if (volcano.shape === 'ridge') {
        // Iztaccíhuatl: a long ridge across the line of sight, several summits.
        const along = (dx * -Math.sin(volcano.angle) + dz * Math.cos(volcano.angle)) / 2.1;
        const across = dx * Math.cos(volcano.angle) + dz * Math.sin(volcano.angle);
        s = Math.hypot(along, across) / volcano.radius;
        if (s >= 1) continue;
        const crest = 0.86 + 0.14 * Math.sin(along * 0.11 + 1.3) * Math.cos(along * 0.05);
        const h = volcano.height * crest * Math.pow(1 - s, 1.25) * (1 - 0.35 * Math.pow(1 - s, 6));
        best = Math.max(best, h * (0.9 + 0.18 * generatedRidged(noise, x / 22, z / 22, 4)));
      } else {
        // Popocatépetl: a steep cone, concave flanks, a crater, gullies down the sides.
        s = Math.hypot(dx, dz) / volcano.radius;
        if (s >= 1) continue;
        const theta = Math.atan2(dz, dx);
        let h = volcano.height * Math.pow(1 - s, 1.6);
        h -= volcano.height * 0.08 * generatedSmooth(0.07, 0.0, s);
        const gully = generatedRidged(noise, theta * 5, s * 6, 3);
        h *= 0.92 + 0.12 * gully * generatedSmooth(0.05, 0.3, s);
        best = Math.max(best, h);
      }
    }
    return best;
  };

  const height = (x, z) => {
    const { outside, rise } = flatness(x, z);
    if (rise <= 0) return 0;
    const reach = Math.max(outside, 0);
    const amplitude = Math.min((land.bump ?? 1.5) + land.slope * reach, land.cap ?? Infinity);
    const sx = x / land.scale;
    const sz = z / land.scale;
    let shape;
    if (land.character === 'rolling') {
      shape = Math.pow(Math.max(0, generatedFbm(noise, sx, sz, 4) * 0.9 + 0.55), 1.4);
    } else if (land.character === 'dry') {
      shape = 0.45 * (generatedFbm(noise, sx, sz, 4) + 0.5) + 0.75 * generatedRidged(noise, sx * 0.8, sz * 0.8, 5) * generatedSmooth(30, 120, reach);
    } else {
      shape = 0.25 * (generatedFbm(noise, sx, sz, 3) + 0.5) + 1.05 * Math.pow(generatedRidged(noise, sx, sz, 5), 1.15);
    }
    let h = amplitude * Math.max(0, shape) * rise;
    h = Math.max(h, volcanoHeight(x, z) * rise);
    return h;
  };

  const result = { land, noise, patch, height, flatness, volcanoes };
  generatedLands.set(key, result);
  return result;
}

/** The place's own ground mesh (the flat painted plane), its size and its mean colour. */
function generatedGround(view, place) {
  let ground = null;
  view.places[place].traverse((object) => {
    if (!ground && object.userData.scenery === 'ground' && object.isMesh) ground = object;
  });
  const size = ground?.geometry.parameters?.width ?? 100;
  const map = ground?.material.map ?? null;
  const mean = new THREE.Color(0.45, 0.5, 0.3);
  if (map?.image) {
    const small = Object.assign(document.createElement('canvas'), { width: 8, height: 8 });
    const paint = small.getContext('2d');
    paint.drawImage(map.image, 0, 0, 8, 8);
    const data = paint.getImageData(0, 0, 8, 8).data;
    let r = 0; let g = 0; let b = 0;
    for (let index = 0; index < data.length; index += 4) { r += data[index]; g += data[index + 1]; b += data[index + 2]; }
    const count = data.length / 4;
    mean.setRGB(r / count / 255, g / count / 255, b / count / 255);
  }
  return { ground, size, map, mean };
}

/** A canvas of macro tint (0.5 = neutral) spread over 640 m: lusher and drier patches, bare earth. */
function generatedMacroTexture(place, land) {
  const size = 256;
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const paint = canvas.getContext('2d');
  const image = paint.createImageData(size, size);
  const noise = generatedNoise(generatedRandom(`macro:${place}`));
  const dry = land.character === 'dry';
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const lush = generatedFbm(noise, x / 22, y / 22, 4);
      const dirt = generatedSmooth(0.18, 0.32, generatedFbm(noise, x / 9 + 50, y / 9 - 30, 3));
      let r = 1 - lush * 0.35;
      let g = 1 + lush * 0.12;
      let b = 1 - lush * 0.3;
      if (dry) { r += 0.05; b -= 0.05; }
      r = generatedMix(r, 1.25, dirt * 0.7);
      g = generatedMix(g, 1.0, dirt * 0.7);
      b = generatedMix(b, 0.85, dirt * 0.7);
      const at = (y * size + x) * 4;
      image.data[at] = Math.min(255, r * 127);
      image.data[at + 1] = Math.min(255, g * 127);
      image.data[at + 2] = Math.min(255, b * 127);
      image.data[at + 3] = 255;
    }
  }
  paint.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * The land's material: the place's own ground material, its texture kept
 * where the land is flat (so it runs on from the painted plane without a
 * seam), fading to vertex colour where it rises, with the texture's grain
 * left in; a macro tint over it when the ground variant is on.
 */
function generatedLandMaterial(view, place, land) {
  const { ground, size, map, mean } = generatedGround(view, place);
  const material = ground ? ground.material.clone() : new THREE.MeshStandardMaterial({ roughness: 0.95 });
  material.color.set(0xffffff);
  material.vertexColors = true;
  material.map = map;
  const uniforms = {
    uGroundMean: { value: mean },
    uMacro: { value: generatedMacroTexture(place, land) },
    uMacroOn: { value: 0 },
    uPlaneHalf: { value: size / 2 },
  };
  material.userData.generated = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float fade;\nvarying float vFade;\nvarying vec2 vLandXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = fade;\nvLandXZ = (modelMatrix * vec4(position, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uGroundMean;\nuniform sampler2D uMacro;\nuniform float uMacroOn;\nuniform float uPlaneHalf;\nvarying float vFade;\nvarying vec2 vLandXZ;')
      .replace('#include <color_fragment>', '')
      .replace('#include <map_fragment>', `
        vec3 landTex = vec3(1.0);
        #ifdef USE_MAP
          landTex = mapTexelToLinear(texture2D(map, vUv)).rgb;
        #endif
        vec3 landGrain = mix(vec3(1.0), landTex / uGroundMean, 0.55);
        vec3 landColour = mix(landTex, vColor * landGrain, vFade);
        float landReach = max(abs(vLandXZ.x), abs(vLandXZ.y));
        vec3 landTint = texture2D(uMacro, vLandXZ / 640.0 + 0.5).rgb * 2.0;
        landTint = mix(landTint, texture2D(uMacro, vLandXZ / 97.0).rgb * 2.0, 0.35);
        landColour *= mix(vec3(1.0), landTint, uMacroOn * smoothstep(uPlaneHalf * 0.85, uPlaneHalf * 1.4 + 10.0, landReach));
        diffuseColor.rgb *= landColour;
      `);
  };
  material.customProgramCacheKey = () => 'generated-land';
  material.needsUpdate = true;
  return { material, size, mean };
}

// ---- the warden: camera reach and haze while the land is shown ----------------

/**
 * The game's camera sees 60 m and its haze closes in by 70–140 m: right for
 * the old scenery, too short for land 230 m out. While terrain or ground is
 * shown in the current place the camera's far plane is pushed out; while
 * terrain is shown the haze is drawn out as well. Both go back when they
 * are not. Done before each render, so no other code has to know.
 */
function generatedInstallWarden(view) {
  const scene = view.scene;
  if (scene.userData.generatedWarden) return;
  scene.userData.generatedWarden = true;
  window.__generatedView = view; // for measuring (triangles, camera) from the console
  const before = scene.onBeforeRender;
  let baseFar = null;
  let hazed = false;
  scene.onBeforeRender = function generatedWarden(renderer, sceneArg, camera, target) {
    before?.call(this, renderer, sceneArg, camera, target);
    const group = view.places?.[view.place];
    let reach = false;
    let terrain = false;
    let foothills = false;
    let ridges = null;
    if (group?.visible) {
      for (const child of group.children) {
        if (!child.visible) continue;
        const id = child.userData.sceneryVariant;
        if (id === 'terrain') terrain = reach = true;
        if (id === 'foothills') foothills = reach = true;
        if (id === 'ground') reach = true;
        if (id === 'ridges') ridges = child;
      }
    }
    if (camera.isPerspectiveCamera) {
      if (camera.far !== GENERATED_FAR) baseFar = camera.far;
      const far = reach ? GENERATED_FAR : baseFar ?? camera.far;
      if (camera.far !== far) {
        camera.far = far;
        camera.updateProjectionMatrix();
      }
    }
    const fog = scene.fog;
    if (fog?.isFog && view.light?.fog) {
      if (foothills) {
        [fog.near, fog.far] = GENERATED_FOOTHILLS_FOG;
        hazed = true;
      } else if (terrain) {
        fog.far = 460;
        hazed = true;
      } else if (hazed) {
        [fog.near, fog.far] = view.light.fog;
        hazed = false;
      }
    }
    if (ridges && fog) ridges.userData.fogColour?.copy(fog.color);
  };
}

const generatedSiblingShown = (group, id) => Boolean(group.parent?.children.find((child) => child.userData.sceneryVariant === id)?.visible);

// ---- ridges -----------------------------------------------------------------

const GENERATED_RIDGE_VERTEX = `
attribute vec3 color;
attribute float haze;
varying vec3 vColour;
varying float vHaze;
void main() {
  vColour = color;
  vHaze = haze;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  clip.z = 0.0;
  gl_Position = clip;
}`;

const GENERATED_RIDGE_FRAGMENT = `
uniform vec3 uFog;
varying vec3 vColour;
varying float vHaze;
void main() {
  gl_FragColor = vec4(mix(vColour, uFog, vHaze), 1.0);
}`;

const GENERATED_RINGS = [130, 190, 270, 360, 470];
const GENERATED_SUN = new THREE.Vector3(0.62, 0.62, 0.48).normalize();

/**
 * One skyline ring: a wall `distance` m out whose top is `top(theta)` m
 * high, `rows` rows from below the horizon to the top, coloured per vertex
 * (base colour shaded by the ridge's slope to the sun, snow above a line)
 * and hazed toward the sky by distance and more at its foot.
 */
function generatedRidgeStrip({ distance, from, to, columns, top, colourAt, haze, rows = 5 }) {
  const positions = [];
  const colours = [];
  const hazes = [];
  const indices = [];
  const full = to - from >= Math.PI * 2 - 1e-6;
  const count = full ? columns : columns + 1;
  const heights = [];
  for (let column = 0; column < count; column += 1) heights.push(top(from + ((to - from) * column) / columns));
  const step = ((to - from) / columns) * distance;
  const colour = new THREE.Color();
  for (let column = 0; column < count; column += 1) {
    const theta = from + ((to - from) * column) / columns;
    const prev = heights[(column - 1 + count) % count];
    const next = heights[(column + 1) % count];
    const slope = full || (column > 0 && column < count - 1) ? (next - prev) / (2 * step) : 0;
    // A pseudo-normal: facing the centre, tilted by the ridge's slope along the ring, and up.
    const inward = new THREE.Vector3(-Math.cos(theta), 0, -Math.sin(theta));
    const along = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta));
    const normal = inward.multiplyScalar(0.55).addScaledVector(along, -slope * 1.6).add(new THREE.Vector3(0, 0.75, 0)).normalize();
    const light = 0.72 + 0.5 * Math.max(0, normal.dot(GENERATED_SUN));
    const height = heights[column];
    for (let row = 0; row < rows; row += 1) {
      const t = row / (rows - 1);
      const k = 1 - Math.pow(1 - t, 2.2);
      const y = generatedMix(-distance * 0.12, height, k);
      positions.push(Math.cos(theta) * distance, y, Math.sin(theta) * distance);
      colourAt(colour, theta, y, height, t);
      colour.multiplyScalar(light);
      colours.push(colour.r, colour.g, colour.b);
      hazes.push(Math.min(1, haze + (1 - haze) * Math.pow(1 - t, 1.3)));
    }
  }
  for (let column = 0; column < columns; column += 1) {
    const a = column * rows;
    const b = ((column + 1) % count) * rows;
    for (let row = 0; row < rows - 1; row += 1) indices.push(a + row, b + row, a + row + 1, b + row, b + row + 1, a + row + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('haze', new THREE.Float32BufferAttribute(hazes, 1));
  geometry.setIndex(indices);
  return geometry;
}

function generatedBuildRidges({ place, view }) {
  const land = GENERATED_PLACES[place];
  if (!land) return null;
  generatedInstallWarden(view);
  const group = new THREE.Group();
  const fogColour = new THREE.Color().copy(view.scene.fog?.color ?? new THREE.Color(0xbcd8f0));
  group.userData.fogColour = fogColour;
  const material = new THREE.ShaderMaterial({
    vertexShader: GENERATED_RIDGE_VERTEX,
    fragmentShader: GENERATED_RIDGE_FRAGMENT,
    uniforms: { uFog: { value: fogColour } },
    depthTest: false, depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  const random = generatedRandom(`ridges:${place}`);
  const noise = generatedNoise(random);
  const base = generatedColour(land.ridge);
  const forest = generatedColour(land.woods);
  const rock = generatedColour(land.rock);
  const snow = generatedColour(0xf4f6fa);
  const deg = Math.PI / 180;
  const rings = [];
  GENERATED_RINGS.forEach((distance, index) => {
    const elevation = (2 + index * 1.25) * land.ridgeAngle * deg;
    const circle = distance / 85;
    const top = (theta) => {
      const cx = Math.cos(theta) * circle + index * 13;
      const cz = Math.sin(theta) * circle;
      let shape;
      if (land.character === 'rolling') shape = 0.35 + 1.1 * (generatedFbm(noise, cx * 0.6, cz * 0.6, 4) + 0.5);
      else if (land.character === 'dry') shape = 0.25 + 0.6 * (generatedFbm(noise, cx * 0.5, cz * 0.5, 3) + 0.5) + 0.8 * generatedRidged(noise, cx * 0.7, cz * 0.7, 4);
      else shape = 0.3 + 1.25 * generatedRidged(noise, cx * 0.8, cz * 0.8, 6);
      let h = Math.max(0.15, shape) * distance * Math.tan(elevation);
      // Forested ridges: a ragged line of tree crowns along the crest.
      if (land.character === 'forested') h += distance * 0.0035 * (generatedFbm(noise, cx * 18, cz * 18, 2) + 0.4);
      return h;
    };
    const tone = generatedColour(land.ridge).lerp(forest, land.character === 'forested' ? 0.3 : 0.1);
    const geometry = generatedRidgeStrip({
      distance, from: 0, to: Math.PI * 2, columns: land.character === 'forested' ? 1100 : 760, rows: 5, top,
      haze: Math.min(0.9, 1 - Math.exp(-(distance - 40) / 300)),
      colourAt: (out, theta, y, height, t) => {
        out.copy(tone).lerp(base, 0.4 * t);
        const vary = generatedFbm(noise, theta * 3 + index, y / 60, 2);
        out.multiplyScalar(0.9 + 0.25 * vary);
        if (land.character === 'dry' && t > 0.8) out.lerp(rock, 0.25);
      },
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.renderOrder = -990 - index;
    ring.frustumCulled = false;
    ring.userData.distance = distance;
    rings.push(ring);
    group.add(ring);
  });
  // The great mountains of the place, in the skyline: snowy volcanoes for the plain.
  const peaks = [];
  for (const volcano of land.volcanoes ?? []) {
    const distance = 330;
    const ringIndex = GENERATED_RINGS.findIndex((ring) => ring > distance);
    const tall = volcano.height * (distance / volcano.distance);
    const halfWidth = (volcano.radius * (distance / volcano.distance) * (volcano.shape === 'ridge' ? 2.0 : 1.0)) / distance;
    const top = (theta) => {
      const s = Math.abs(theta - volcano.angle) / halfWidth;
      if (s >= 1) return -5;
      if (volcano.shape === 'ridge') {
        const crest = 0.84 + 0.16 * Math.sin((theta - volcano.angle) * 24 + 1.3);
        return tall * crest * Math.pow(1 - s, 0.9) * (1 - 0.3 * Math.pow(1 - s, 8)) * (0.95 + 0.08 * generatedFbm(noise, theta * 18, 3, 2));
      }
      const crater = 1 - 0.05 * generatedSmooth(0.05, 0.0, s);
      return tall * Math.pow(1 - s, 1.45) * crater * (0.97 + 0.05 * generatedFbm(noise, theta * 18, 1, 2));
    };
    const geometry = generatedRidgeStrip({
      distance, from: volcano.angle - halfWidth, to: volcano.angle + halfWidth, columns: 360, rows: 9, top,
      haze: Math.min(0.9, 1 - Math.exp(-(distance - 40) / 300)) * 0.85,
      colourAt: (out, theta, y, height, t) => {
        out.copy(rock).lerp(forest, generatedSmooth(0.45, 0.2, y / tall) * 0.8);
        const snowLine = tall * volcano.snow + tall * 0.07 * generatedFbm(noise, theta * 30, 5, 3);
        const gully = generatedFbm(noise, theta * 20, y / 40, 2);
        out.multiplyScalar(0.92 + 0.15 * gully);
        out.lerp(snow, generatedSmooth(snowLine - tall * 0.04, snowLine + tall * 0.04, y) * (0.9 + 0.1 * gully));
      },
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = rings[ringIndex].renderOrder + 0.5;
    mesh.frustumCulled = false;
    peaks.push(mesh);
    group.add(mesh);
  }
  group.userData.rings = rings;
  group.userData.peaks = peaks;
  return group;
}

/** With the terrain on, only the rings beyond its edge show, and its own volcanoes stand in for the skyline's. */
function generatedApplyRidges({ view, group }) {
  const terrain = generatedSiblingShown(group, 'terrain');
  for (const ring of group.userData.rings) ring.visible = !terrain || ring.userData.distance > GENERATED_RADIUS + 20;
  for (const peak of group.userData.peaks) peak.visible = !terrain;
  if (view.scene.fog) group.userData.fogColour.copy(view.scene.fog.color);
}

// ---- terrain ----------------------------------------------------------------

function generatedBuildTerrain({ place, view, spec }, profile = 'land') {
  const settings = GENERATED_PLACES[place];
  if (!settings) return null;
  generatedInstallWarden(view);
  const world = generatedLand(place, spec, profile);
  const { land, patch, height, flatness } = world;
  const { material, size, mean } = generatedLandMaterial(view, place, land);
  const segments = 256;
  const ringCount = 72;
  const inner = 6;
  const outer = land.radius ?? GENERATED_RADIUS;
  const radii = Array.from({ length: ringCount + 1 }, (_, index) => inner + (outer - inner) * Math.pow(index / ringCount, 1.7));
  const positions = [];
  const uvs = [];
  const fades = [];
  for (const radius of radii) {
    for (let segment = 0; segment < segments; segment += 1) {
      const theta = (segment / segments) * Math.PI * 2;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;
      positions.push(x, height(x, z) - 0.03, z);
      uvs.push(x / size + 0.5, -z / size + 0.5);
    }
  }
  const indices = [];
  for (let ring = 0; ring < ringCount; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = ring * segments + segment;
      const b = ring * segments + ((segment + 1) % segments);
      const c = a + segments;
      const d = b + segments;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Colour by height and slope: the ground's own green where flat, lusher and woods on the rises, rock on the steep, snow up high.
  const normals = geometry.attributes.normal;
  const colours = new Float32Array(positions.length);
  const colour = new THREE.Color();
  const grass = mean.clone();
  const lush = generatedColour(land.lush);
  const woods = generatedColour(land.woods);
  const rock = generatedColour(land.rock);
  const dry = generatedColour(land.dry);
  const snow = generatedColour(0xf2f4f8);
  for (let index = 0; index < positions.length / 3; index += 1) {
    const x = positions[index * 3];
    const y = positions[index * 3 + 1] + 0.03;
    const z = positions[index * 3 + 2];
    const up = normals.getY(index);
    const { outside } = flatness(x, z);
    const patchy = generatedFbm(patch, x / 40, z / 40, 3);
    colour.copy(grass);
    colour.lerp(land.character === 'dry' ? dry : lush, generatedSmooth(-0.2, 0.3, patchy) * generatedSmooth(4, 30, outside) * 0.8);
    let wooded;
    if (land.character === 'forested') wooded = generatedSmooth(2, 9, y) * (0.75 + 0.25 * generatedSmooth(-0.1, 0.2, patchy));
    else if (land.character === 'dry') wooded = generatedSmooth(0.05, 0.25, generatedFbm(patch, x / 25 + 9, z / 25, 3)) * generatedSmooth(10, 22, y) * 0.8;
    else wooded = generatedSmooth(0.1, 0.3, generatedFbm(patch, x / 30 + 9, z / 30, 3)) * generatedSmooth(0.5, 3, y) * 0.9;
    colour.lerp(woods, wooded);
    const steep = generatedSmooth(0.82, 0.62, up);
    colour.lerp(rock, steep * (land.character === 'forested' ? 0.5 : 0.8));
    for (const volcano of world.volcanoes) {
      const near = Math.hypot(x - volcano.x, z - volcano.z) / volcano.radius;
      if (near > 1) continue;
      const rel = y / volcano.height;
      colour.lerp(woods, generatedSmooth(0.12, 0.22, rel) * generatedSmooth(0.5, 0.38, rel) * 0.85);
      colour.lerp(rock, generatedSmooth(0.4, 0.55, rel) * 0.85);
      const line = volcano.snow + 0.07 * generatedFbm(patch, x / 9, z / 9, 3);
      if (rel > line && up > 0.35) colour.lerp(snow, generatedSmooth(line, line + 0.04, rel));
    }
    if (land.farTint !== undefined) colour.lerp(generatedColour(land.farTint), 0.8 * generatedSmooth(70, 280, Math.hypot(x, z)));
    colour.multiplyScalar(0.92 + 0.14 * generatedFbm(patch, x / 6, z / 6, 2));
    colours[index * 3] = colour.r;
    colours[index * 3 + 1] = colour.g;
    colours[index * 3 + 2] = colour.b;
    fades.push(Math.max(generatedSmooth(2, 26, outside), generatedSmooth(0.3, 2.5, y)));
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.setAttribute('fade', new THREE.Float32BufferAttribute(fades, 1));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  group.userData.material = material;
  // For whatever stands on the land (trees): its height at (x, z).
  group.userData.heightAt = height;
  return group;
}

function generatedApplyTerrain({ group }) {
  group.userData.material.userData.generated.uMacroOn.value = 0;
}

function generatedApplyFoothills({ group }) {
  // The macro tint's lusher and drier patches: the ground's slight variance, out to the hills.
  group.userData.material.userData.generated.uMacroOn.value = 1;
}

// ---- ground -----------------------------------------------------------------

/** A grass tuft: three thin blades, dark at the root. */
function generatedTuftGeometry() {
  const positions = [];
  const colours = [];
  for (let blade = 0; blade < 3; blade += 1) {
    const turn = (blade / 3) * Math.PI;
    const lean = 0.12 * (blade - 1);
    const cx = Math.cos(turn) * 0.09;
    const cz = Math.sin(turn) * 0.09;
    const tip = [lean * Math.sin(turn), 0.42 + 0.08 * blade, lean * Math.cos(turn)];
    // Both windings, so each blade is front-facing from either side and lit as if it faced up.
    positions.push(-cx, 0, -cz, cx, 0, cz, ...tip, cx, 0, cz, -cx, 0, -cz, ...tip);
    colours.push(0.92, 0.92, 0.88, 0.92, 0.92, 0.88, 1.12, 1.12, 1.05, 0.92, 0.92, 0.88, 0.92, 0.92, 0.88, 1.12, 1.12, 1.05);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  // Blades lit as if they faced up, so they read as grass not as cards.
  const normals = geometry.attributes.normal;
  for (let index = 0; index < normals.count; index += 1) normals.setXYZ(index, 0, 1, 0);
  return geometry;
}

/** Scatter `count` copies between `from` and `to` m out, sparser with distance, off the fighting ground, in noise-driven drifts. */
function generatedScatter({ geometry, material, count, from, to, spec, random, noise, sizes, colours, heightAt, sink = 0, squash = 1, grow = 0, maxHeight = Infinity }) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const at = new THREE.Object3D();
  const colour = new THREE.Color();
  const [kx, kz] = spec.keepOut;
  let placed = 0;
  let tries = 0;
  while (placed < count && tries < count * 30) {
    tries += 1;
    const r = from + (to - from) * Math.pow(random(), 1.6);
    const theta = random() * Math.PI * 2;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    if (Math.abs(x) < kx + 1.5 && Math.abs(z) < kz + 1.5) continue;
    if ((spec.keepClear ?? []).some(({ at: [cx, cz], radius }) => Math.hypot(x - cx, z - cz) < radius + 2)) continue;
    if (generatedFbm(noise, x / 14, z / 14, 3) < -0.12 + random() * 0.1) continue;
    const ground = heightAt ? heightAt(x, z) : 0;
    if (ground > maxHeight) continue;
    const scale = (sizes[0] + (sizes[1] - sizes[0]) * random()) * (1 + grow * r);
    at.position.set(x, (heightAt ? ground - 0.03 : 0) - sink * scale, z);
    at.rotation.set(0, random() * Math.PI * 2, 0);
    at.scale.set(scale, scale * squash * (0.8 + 0.4 * random()), scale);
    at.updateMatrix();
    mesh.setMatrixAt(placed, at.matrix);
    colour.copy(colours[Math.floor(random() * colours.length)]).multiplyScalar(0.85 + 0.3 * random());
    mesh.setColorAt(placed, colour);
    placed += 1;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** The tufts, stones and bushes, either on flat ground or draped over the terrain. */
function generatedLitter(place, spec, land, heightAt) {
  const random = generatedRandom(`litter:${place}:${heightAt ? 'draped' : 'flat'}`);
  const noise = generatedNoise(generatedRandom(`litter:${place}`));
  const tuftColour = generatedColour(land.tuft);
  const tufts = [tuftColour, tuftColour.clone().lerp(generatedColour(land.dry), 0.5), tuftColour.clone().lerp(generatedColour(land.lush), 0.5)];
  const bushColour = generatedColour(land.bush);
  const bushes = [bushColour, bushColour.clone().lerp(generatedColour(land.lush), 0.4), bushColour.clone().multiplyScalar(0.8)];
  const stones = [generatedColour(0x8a8478), generatedColour(0x6e6860), generatedColour(0x9a9282)];
  const tuftMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const bushMaterial = new THREE.MeshLambertMaterial();
  const solidMaterial = new THREE.MeshLambertMaterial({ flatShading: true });
  const stone = new THREE.DodecahedronGeometry(0.3, 0);
  const bush = new THREE.SphereGeometry(1, 7, 4);
  const group = new THREE.Group();
  group.add(
    generatedScatter({ geometry: generatedTuftGeometry(), material: tuftMaterial, count: 11000, from: 8, to: 95, spec, random, noise, sizes: [0.5, 0.95], colours: tufts, heightAt, maxHeight: 14 }),
    generatedScatter({ geometry: stone, material: solidMaterial, count: 700, from: 10, to: 140, spec, random, noise, sizes: [0.5, 2.2], colours: stones, heightAt, sink: 0.12, squash: 0.55 }),
    generatedScatter({ geometry: bush, material: bushMaterial, count: land.bushes, from: 45, to: 220, spec, random, noise, sizes: [0.9, 2.4], colours: bushes, heightAt, sink: 0.35, squash: 0.7, maxHeight: 16 }),
  );
  return group;
}

function generatedBuildGround({ place, view, spec }) {
  const land = GENERATED_PLACES[place];
  if (!land) return null;
  generatedInstallWarden(view);
  const { material, size } = generatedLandMaterial(view, place, land);
  material.userData.generated.uMacroOn.value = 1;
  // The outer ground: under the place's painted plane (which keeps its track and wear), running on to the haze.
  const disk = new THREE.CircleGeometry(GENERATED_FAR * 0.6, 160);
  disk.rotateX(-Math.PI / 2);
  const positions = disk.attributes.position;
  const uvs = disk.attributes.uv;
  for (let index = 0; index < positions.count; index += 1) uvs.setXY(index, positions.getX(index) / size + 0.5, -positions.getZ(index) / size + 0.5);
  const colours = new Float32Array(positions.count * 3).fill(1);
  disk.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  disk.setAttribute('fade', new THREE.Float32BufferAttribute(new Float32Array(positions.count), 1));
  const outer = new THREE.Mesh(disk, material);
  outer.position.y = -0.06;
  outer.receiveShadow = true;
  const group = new THREE.Group();
  const flat = generatedLitter(place, spec, land, null);
  group.add(outer, flat);
  group.userData = { outer, flat, draped: null, land, spec, place };
  return group;
}

/** On its own: the outer ground and the litter on the flat. With the terrain: the litter draped over it, the terrain wearing the macro tint. */
function generatedApplyGround({ group }) {
  const terrainGroup = group.parent?.children.find((child) => child.userData.sceneryVariant === 'terrain');
  const terrain = Boolean(terrainGroup?.visible);
  const data = group.userData;
  if (terrain && !data.draped) {
    const world = generatedLand(data.place, data.spec);
    data.draped = generatedLitter(data.place, data.spec, data.land, world.height);
    group.add(data.draped);
  }
  data.outer.visible = !terrain;
  data.flat.visible = !terrain;
  if (data.draped) data.draped.visible = terrain;
  if (terrain) terrainGroup.userData.material.userData.generated.uMacroOn.value = 1;
}

// ---- the variants -----------------------------------------------------------

/** Variants: { id, label, blurb, replaces: [tags], build({ place, view, spec, rng }) -> THREE.Group, apply?({ place, view, spec, group }) }. */
export const GENERATED_VARIANTS = [
  {
    id: 'ridges',
    label: 'Generated: skyline ridges',
    blurb: 'Five painted skyline rings 130–470 m out, fBm/ridged noise ridgelines paling into the haze, the place\'s mountains in them; unlit, drawn behind everything.',
    replaces: ['mountains'],
    build: generatedBuildRidges,
    apply: generatedApplyRidges,
  },
  {
    id: 'terrain',
    label: 'Generated: terrain',
    blurb: 'A real displaced land mesh to 230 m (37k triangles): flat at the fight, rising to noise hills, volcanoes or forested slopes, coloured by height and slope, lit and shadowed.',
    replaces: ['hills', 'mountains'],
    build: generatedBuildTerrain,
    apply: generatedApplyTerrain,
  },
  {
    id: 'ground',
    label: 'Generated: ground far reach',
    blurb: 'The place\'s painted ground kept, an outer ground beneath it with a non-repeating macro tint, and instanced tufts, stones and bushes out into the haze.',
    replaces: [],
    build: generatedBuildGround,
    apply: generatedApplyGround,
  },
  {
    id: 'foothills',
    label: 'Generated: foothills (for the photo)',
    blurb: 'The terrain made gentle: a little undulation off the fighting ground, rising into small hills out to 360 m that the haze takes into the photograph\'s horizon.',
    replaces: ['hills', 'mountains'],
    build: (context) => generatedBuildTerrain(context, 'foothills'),
    apply: generatedApplyFoothills,
  },
  {
    id: 'generated-land',
    label: 'Generated land (terrain + ridges + ground)',
    blurb: 'Terrain near and mid, skyline ridges beyond its edge, the ground\'s macro tint and litter draped over the terrain.',
    parts: ['terrain', 'ridges', 'ground'],
  },
];
