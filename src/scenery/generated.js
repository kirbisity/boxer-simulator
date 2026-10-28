// The generated land in front of the photograph (skyball.js): foothills. A
// real displaced land mesh round the fighting ground out to 360 m, flat
// where the fight is, undulating a little just off it and rising into small
// hills, coloured by height and slope and tinted at its far edge to the
// photograph's own ground, the haze taking it into the photograph's horizon.
// Trees (trees.js) stand on it through group.userData.heightAt.
// See src/scenery.js for the contract.

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

// ---- the land ------------------------------------

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
  // The edge of the Gobi: gravel steppe in long low swells, bare; its far ridges come from the photograph.
  mobei: {
    character: 'dry', ramp: 40, slope: 0.06, scale: 110,
    grass: 0x857a5e, lush: 0x78744e, woods: 0x4e4c3a, rock: 0x5e5a54, dry: 0x968a66,
    ridge: 0x5e5a4c, ridgeAngle: 0.6, tuft: 0x8e8a5a, bush: 0x5e5e44, bushes: 300,
  },
  // Champagne: rolling grass, and the long ridge (Jordanes's) beyond the far side (−z), its crest some
  // 70 m out and 12 m up, running the floor's length: built as Iztaccíhuatl's long ridge is, without snow.
  catalaunian: {
    character: 'rolling', ramp: 30, slope: 0.09, scale: 100,
    grass: 0x7c8a44, lush: 0x667a3a, woods: 0x34532a, rock: 0x77735f, dry: 0x9a9a52,
    ridge: 0x5e7440, ridgeAngle: 0.5, tuft: 0x8a9046, bush: 0x34532a, bushes: 900,
    volcanoes: [{ angle: -Math.PI / 2, distance: 72, height: 12, radius: 60, shape: 'ridge', snow: 99 }],
  },
  // Below Harran: nearly flat sand and gravel, a few bare hills far off.
  carrhae: {
    character: 'dry', ramp: 45, slope: 0.035, scale: 120,
    grass: 0xc2ac84, lush: 0xa89a70, woods: 0x7a7458, rock: 0x9a8a6e, dry: 0xd0b890,
    ridge: 0xa8906a, ridgeAngle: 0.9, tuft: 0x7e8458, bush: 0x6e7450, bushes: 200,
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
// colour from 1 to 7 degrees down): the far hills take it on, so the land
// runs into the picture's land without a change of colour. The plain keeps
// its volcanoes: no CC0 photograph shows Popocatépetl and Iztaccíhuatl, so
// they are built, in front of a photograph of a dry plateau's far ranges.
const GENERATED_FOOTHILLS = {
  meadow: { ...GENERATED_PLACES.meadow, bump: 0.8, slope: 0.075, ramp: 12, radius: 360, cap: 22, farTint: 0x6a724c },
  field: { ...GENERATED_PLACES.field, bump: 0.7, slope: 0.065, ramp: 14, radius: 360, cap: 20, farTint: 0x6a724c },
  plain: { ...GENERATED_PLACES.plain, bump: 0.6, slope: 0.06, ramp: 16, radius: 360, cap: 16, farTint: 0x9a908b },
  mobei: { ...GENERATED_PLACES.mobei, bump: 0.5, slope: 0.045, ramp: 18, radius: 360, cap: 12, farTint: 0x9a908b },
  catalaunian: { ...GENERATED_PLACES.catalaunian, bump: 0.7, slope: 0.06, ramp: 14, radius: 360, cap: 16, farTint: 0x6a724c },
  carrhae: { ...GENERATED_PLACES.carrhae, bump: 0.35, slope: 0.03, ramp: 20, radius: 360, cap: 8, farTint: 0x9a908b },
  sengoku: { ...GENERATED_PLACES.sengoku, bump: 0.9, slope: 0.11, ramp: 12, radius: 360, cap: 32, farTint: 0x858759 },
};

// The haze while foothills are shown: far enough to see the hills, near enough that their edge fades into the horizon.
const GENERATED_FOOTHILLS_FOG = [70, 420];

const generatedLands = new Map();

/** The land of a place: a height at any (x, z) and the noise behind it; the same every time. */
function generatedLand(place, spec, profile = 'land') {
  // (The flat ground is the spec's keepOut: a wider floor has its own land.)
  const key = `${place}:${profile}:${spec.keepOut.join('x')}`;
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
  const before = scene.onBeforeRender;
  let baseFar = null;
  let hazed = false;
  scene.onBeforeRender = function generatedWarden(renderer, sceneArg, camera, target) {
    before?.call(this, renderer, sceneArg, camera, target);
    const group = view.places?.[view.place];
    const foothills = Boolean(group?.visible && group.children.some((child) => child.visible && child.userData.sceneryVariant === 'foothills'));
    const reach = foothills;
    // A level's mist (render.js applyWeather) keeps its own fog and the camera's reach that goes with it.
    const mist = view.weather?.fog;
    if (camera.isPerspectiveCamera) {
      if (camera.far !== GENERATED_FAR) baseFar = camera.far;
      const far = reach && !mist ? GENERATED_FAR : view.cameraFar ?? baseFar ?? camera.far;
      if (camera.far !== far) {
        camera.far = far;
        camera.updateProjectionMatrix();
      }
    }
    const fog = scene.fog;
    if (fog?.isFog && view.light?.fog) {
      if (foothills) {
        [fog.near, fog.far] = mist ?? GENERATED_FOOTHILLS_FOG;
        hazed = true;
      } else if (hazed) {
        [fog.near, fog.far] = view.light.fog;
        hazed = false;
      }
    }
  };
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

function generatedApplyFoothills({ group }) {
  // The macro tint's lusher and drier patches: the ground's slight variance, out to the hills.
  group.userData.material.userData.generated.uMacroOn.value = 1;
}

// ---- the variants -----------------------------------------------------------

/** Variants: { id, label, blurb, replaces: [tags], build({ place, view, spec, rng }) -> THREE.Group, apply?({ place, view, spec, group }) }. */
export const GENERATED_VARIANTS = [
  {
    id: 'foothills',
    label: 'Foothills (in front of the photograph)',
    blurb: 'A little undulation off the fighting ground, rising into small hills out to 360 m that the haze takes into the photograph\'s horizon.',
    replaces: ['hills', 'mountains'],
    build: (context) => generatedBuildTerrain(context, 'foothills'),
    apply: generatedApplyFoothills,
  },
];
