// The castle kit's surfaces: painted canvas textures (stone coursing, setts, flags, black rock, grass, boards; the stone and
// ground ones are painted in kitpaint.js) and the materials made of them. Everything is authored in the colours it should show
// (the game's output is linear), muted and cool, for a storm. A texture tiles over a stated number of metres, so geometry only has
// to give its UVs in metres. Nothing here runs until `ktMaterials` is called (THREE and the canvas are the browser's).
//
// What the shader adds to each (`ktPatch`), so that no tile can be found by eye: the same texture read a second time at another
// scale and offset and blended in by a world-space noise (the walls and ground are in two minds, patch by patch); a macro map
// read once in world space for a slow swell of light and dark, drifts of warm and cool, moss and damp in patches (more on the
// north faces, the tops of things and in the dark of a crevice) and rain streaks running down the walls; wet stone darker and
// glossier where the vertex colour says the wall is in shadow at its foot; and a fog that thickens toward the sea (height fog).

import { KIT_FLOOR_OFFSET } from '../depthrange.js';
import { KT_SHADOW_FUNCTION, KT_SHADOW_PARS, ktShadow, ktShadowInit } from './kitshadow.js';
import { kwTexture } from './kitwear.js';
import { ktAshlar, ktCobbles, ktFlags, ktGrain, ktGrass, ktMacroData, ktPath, ktRandom, ktRock, ktRubble, ktRuinWall, ktShade } from './kitpaint.js';

export { ktRandom } from './kitpaint.js';

/** A canvas texture of `size` px square, painted by `paint(g, size, random)`; its mean colour (0..1) is kept for the shader's blend. */
function ktTexture(size, seed, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  paint(g, size, ktRandom(seed));
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  // The mean colour, from a sparse sample.
  const data = g.getImageData(0, 0, size, size).data;
  const mean = [0, 0, 0];
  let count = 0;
  for (let k = 0; k < data.length; k += 4 * 7) {
    mean[0] += data[k];
    mean[1] += data[k + 1];
    mean[2] += data[k + 2];
    count += 1;
  }
  texture.kitMean = mean.map((v) => v / count / 255);
  return texture;
}

/** Boards: grey-brown planks, the grain and nail heads. */
function ktBoards(g, size, random, base = [84, 66, 48]) {
  const planks = 6;
  const width = size / planks;
  for (let plank = 0; plank < planks; plank += 1) {
    const tone = 0.7 + random() * 0.5;
    g.fillStyle = ktShade(base, tone);
    g.fillRect(plank * width, 0, width, size);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(plank * width, 0, 2, size);
    for (let line = 0; line < 22; line += 1) {
      g.fillStyle = `rgba(20,14,10,${0.08 + random() * 0.14})`;
      g.fillRect(plank * width + 3 + random() * (width - 6), 0, 1, size);
    }
    for (let nail = 0; nail < 2; nail += 1) {
      g.fillStyle = 'rgba(10,10,10,0.7)';
      g.fillRect(plank * width + width / 2, random() * size, 3, 3);
    }
  }
  ktGrain(g, size, random, 1500, 0.1);
}

/** Wet iron-grey, for gates and fittings. */
function ktIron(g, size, random) {
  g.fillStyle = 'rgb(48,48,52)';
  g.fillRect(0, 0, size, size);
  ktGrain(g, size, random, 3000, 0.3, 140, 0);
  for (let index = 0; index < 40; index += 1) {
    g.fillStyle = `rgba(110,60,30,${random() * 0.25})`;
    g.fillRect(random() * size, random() * size, 2 + random() * 8, 2 + random() * 8);
  }
}

// ---- the shared uniforms -------------------------------------------------------------------------------

/** The macro map (one per page, made on the first material). */
let ktMacro = null;
function ktMacroTexture() {
  if (!ktMacro) {
    ktMacro = new THREE.DataTexture(ktMacroData(256), 256, 256, THREE.RGBAFormat);
    ktMacro.wrapS = THREE.RepeatWrapping;
    ktMacro.wrapT = THREE.RepeatWrapping;
    ktMacro.magFilter = THREE.LinearFilter;
    ktMacro.minFilter = THREE.LinearMipmapLinearFilter;
    ktMacro.generateMipmaps = true;
    ktMacro.needsUpdate = true;
  }
  return ktMacro;
}

/**
 * What the weather does to every surface of the stage, and what the fog does with height: shared by all its materials, set by the stage's look
 * (stagelooks.js). `uKitWet` (0..1): how soaked the stone is. `uKitFog`: (density per metre at the base, the height (m) it is at full density below,
 * how fast it thins above that (per metre), 0). `uKitPools`: how much standing water lies on the paving (0..1). `uKitPoolSky` (0..1): how much of the sky the puddles
 * show: all in the open, a tenth under a roof (kit.js).
 */
export const ktWeather = { uKitWet: { value: 0.3 }, uKitPools: { value: 0 }, uKitPoolSky: { value: 1 }, uKitFog: { value: null } };

/**
 * How much of the shader's finer work a pixel gets, by distance and by the quality tier (quality.js; kit.js `setQuality` sets it): shared by all the stage's materials, so
 * a change of tier is a change of two uniforms, not a new program. `uKitLod` (metres): x the reach of the environment's reflection, y the reach of the second read of the
 * stone's map (the one that hides the tiling), z the reach of standing water, w the reach of the soft edge of the baked shadow. Each term fades to nothing over its last
 * quarter, so there is no line where it stops. `uKitFlags`: x 1 if the macro map is read at all, y the baked shadow's taps (1: one, 2 or more: the five and the soft edge).
 */
export const ktLod = { uKitLod: { value: null }, uKitFlags: { value: null } };

/** The reaches of a tier of the picture (quality.js gives the numbers). */
export function ktSetLod({ env, tile, pool, penumbra, macro = 1, taps = 2 }) {
  ktLodInit();
  const reach = (metres) => Math.max(0.01, metres);
  ktLod.uKitLod.value.set(reach(env), reach(tile), reach(pool), reach(penumbra));
  ktLod.uKitFlags.value.set(macro, taps, 0, 0);
}

function ktLodInit() {
  ktLod.uKitLod.value ??= new THREE.Vector4(1e4, 1e4, 1e4, 1e4);
  ktLod.uKitFlags.value ??= new THREE.Vector4(1, 2, 0, 0);
}

// ---- the detail ----------------------------------------------------------------------------------------------

/** The map chunk: the texture read once or twice, the macro map over it, moss, damp, standing water (`pools`: how much this surface holds, 0..1) and streaks. `two`: 0 once, 1 again at another scale (hard patches), 2 again turned (soft). */
const ktMapChunk = (two, pools = 0) => `
#ifdef USE_MAP
  vec3 kitN = normalize(vKitNrm);
  vec3 kitAbs = abs(kitN);
  // How far this pixel is from the eye: the finer terms below are for what is near, and thin out (to nothing, with no step) with the distance (uKitLod, kittex.js ktLod).
  float kitDist = length(vViewPosition);
  // (The slopes of the map's coordinates are taken here, in step for the whole quad, for the reads inside the branches below.)
  vec2 kitDx = dFdx(vUv);
  vec2 kitDy = dFdy(vUv);
  // The macro map in the plane of the surface: plan view on a floor, along the wall on a wall (v is up, so the streaks run down).
  vec2 kitP = kitAbs.y > max(kitAbs.x, kitAbs.z) ? vKitPos.xz : (kitAbs.x > kitAbs.z ? vec2(vKitPos.z, vKitPos.y) : vec2(vKitPos.x, vKitPos.y));
  vec2 kitPx = dFdx(kitP);
  vec2 kitPy = dFdy(kitP);
  vec4 kitM = uKitFlags.x > 0.5 ? texture2D(uKitMacro, kitP * 0.0625) : vec4(0.5, 0.5, 0.5, 0.0);
  vec4 texelColor = texture2D(map, vUv);
  ${two === 0 ? '' : `float kitW = smoothstep(${two === 2 ? '0.3, 0.7' : '0.44, 0.56'}, kitM.g) * (1.0 - smoothstep(0.75 * uKitLod.y, uKitLod.y, kitDist));
  if (kitW > 0.0) {
    ${two === 2 ? 'vec2 kitUvB = mat2(0.8, -0.6, 0.6, 0.8) * vUv * 0.67 + vec2(0.31, 0.57);\n    vec2 kitBx = mat2(0.8, -0.6, 0.6, 0.8) * kitDx * 0.67;\n    vec2 kitBy = mat2(0.8, -0.6, 0.6, 0.8) * kitDy * 0.67;' : 'vec2 kitUvB = vUv * 0.71 + vec2(0.37, 0.19);\n    vec2 kitBx = kitDx * 0.71;\n    vec2 kitBy = kitDy * 0.71;'}
    vec3 kitB = textureGrad(map, kitUvB, kitBx, kitBy).rgb;
    ${two === 2 ? 'texelColor.rgb = uKitMean + (mix(texelColor.rgb, kitB, kitW) - uKitMean) * inversesqrt(kitW * kitW + (1.0 - kitW) * (1.0 - kitW));\n    texelColor.rgb = max(texelColor.rgb, vec3(0.0));' : 'texelColor.rgb = mix(texelColor.rgb, kitB, kitW);'}
  }`}
  texelColor = mapTexelToLinear(texelColor);
  diffuseColor *= texelColor;
  float kitLum = dot(texelColor.rgb, vec3(0.3, 0.55, 0.15));
  // The swell of light and dark, the drift of warm and cool.
  diffuseColor.rgb *= mix(1.0, 0.5 + 1.0 * kitM.r, uKitDetail.x);
  diffuseColor.rgb *= vec3(1.0 + (kitM.g - 0.5) * 0.2 * uKitDetail.y, 1.0, 1.0 - (kitM.g - 0.5) * 0.2 * uKitDetail.y);
  // Damp: darker where the wall is in shade at its foot (the vertex colour), and in patches.
  #ifdef USE_COLOR
    float kitShade = 1.0 - dot(vColor, vec3(0.3333));
  #else
    float kitShade = 0.0;
  #endif
  kitWet = clamp(uKitWet * (0.35 + 1.6 * smoothstep(0.08, 0.5, kitShade) + 0.7 * smoothstep(0.45, 0.8, kitM.b)), 0.0, 1.0);
  diffuseColor.rgb *= 1.0 - 0.34 * kitWet;
  // Standing water on what faces up: patches from a broader read of the macro map. The water is a mirror (the sky in it: see KT_POOL_SKY), so the stone under it
  // is only a little darker, and darker at the middle of a puddle than at its rim (a thin film there: the stone shows through it).
  ${pools > 0 ? `float kitFlat = smoothstep(0.85, 0.97, kitN.y) * (1.0 - smoothstep(0.75 * uKitLod.z, uKitLod.z, kitDist));
  if (uKitPools > 0.0 && kitFlat > 0.0) {
    float kitPoolNoise = textureGrad(uKitMacro, kitP * 0.19 + vec2(0.43, 0.71), kitPx * 0.19, kitPy * 0.19).b + 0.3 * (kitM.b - 0.5);
    kitPool = uKitPools * ${pools.toFixed(2)} * kitFlat * smoothstep(0.47, 0.54, kitPoolNoise);
    diffuseColor.rgb *= 1.0 - kitPool * (0.12 + 0.12 * smoothstep(0.5, 0.62, kitPoolNoise));
  }` : ''}
  kitWet = max(kitWet, kitPool);
  // Moss: in patches, thicker on north faces and on tops, thicker in the dark of a crevice.
  float kitUp = smoothstep(0.3, 0.95, kitN.y);
  float kitNorth = smoothstep(-0.1, 0.85, -kitN.z);
  float kitMoss = smoothstep(0.5, 0.8, kitM.b) * uKitDetail.z * (0.25 + 0.5 * kitUp + 0.6 * kitNorth) * (1.0 - 0.6 * smoothstep(0.15, 0.55, kitLum)) * (0.6 + 0.8 * kitWet);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.17, 0.07) * (0.7 + 2.2 * kitLum) * (1.0 + 0.5 * kitM.r), clamp(kitMoss, 0.0, 0.85));
  // Rain streaks down the vertical faces.
  diffuseColor.rgb *= 1.0 - uKitDetail.w * kitM.a * (1.0 - kitUp) * (0.3 + 0.7 * kitWet);
#endif
`;

/**
 * What a puddle shows: the look's sky (the environment the wet stone uses), mirrored in a flat surface and seen at the angle the camera has to it (the shader's
 * own Fresnel makes it faint looking down and strong looking along), brighter than the stone's own gloss (\`gain\`), a little stirred (the ripple), and faded
 * under a roof (\`uKitPoolSky\`). It replaces the stone's reflection where there is water, by how much water there is.
 */
const KT_POOL_SKY = `
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular ) && defined( USE_MAP )
  if (kitPool > 0.003) {
    vec3 kitUp = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
    vec3 kitStir = (viewMatrix * vec4(kitM.r - 0.5, 0.0, kitM.g - 0.5, 0.0)).xyz;
    vec3 kitSky = getLightProbeIndirectRadiance(geometry.viewDir, normalize(kitUp + kitStir * 0.06), 0.04, maxMipLevel) / max(envMapIntensity, 0.02);
    radiance = mix(radiance, (kitSky * 1.9 + vec3(0.05, 0.05, 0.06)) * uKitPoolSky, kitPool);
  }
#endif`;

/**
 * The environment's share of the light (the reflection of the sky in the wet stone, the sky's wash on it: both read from the prefiltered environment map, which is
 * the dearest part of the standard shader) for the pixels near enough to show it, and nothing for the rest (fading out over the last quarter of `uKitLod.x`).
 */
const KT_ENV_REACH = `
#if defined( RE_IndirectSpecular ) && defined( RE_IndirectDiffuse )
  float kitEnvFade = 1.0 - smoothstep(0.75 * uKitLod.x, uKitLod.x, kitDist);
  vec3 kitRadiance0 = radiance;
  vec3 kitIbl0 = iblIrradiance;
  if (kitEnvFade > 0.0) {
    #include <lights_fragment_maps>
    radiance = mix(kitRadiance0, radiance, kitEnvFade);
    iblIrradiance = mix(kitIbl0, iblIrradiance, kitEnvFade);
  }
#else
  #include <lights_fragment_maps>
#endif`;

/** The fog chunk: the stage's distance fog, thickened with height (a mist that lies on the sea and the low ground and thins above). */
const KT_FOG = `
#ifdef USE_FOG
  float fogFactor = smoothstep(fogNear, fogFar, fogDepth);
  float kitMid = 0.5 * (cameraPosition.y + vKitPos.y);
  float kitHeightFog = 1.0 - exp(-uKitFog.x * exp(-max(kitMid - uKitFog.y, 0.0) * uKitFog.z) * fogDepth);
  fogFactor = 1.0 - (1.0 - fogFactor) * (1.0 - kitHeightFog);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif
`;

/**
 * three's own lights chunk with one line added: the light that comes from the sun (the directional one that points where the look's sun is: the rim light is another)
 * is multiplied by how much of it the baked map lets through (kitshadow.js). The ambient (the probe, the hemisphere) is not.
 */
let ktSunChunk = null;
function ktSunShaded() {
  if (!ktSunChunk) {
    const line = 'getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );';
    const own = THREE.ShaderChunk.lights_fragment_begin;
    ktSunChunk = own.includes(line)
      ? `float kitSunShadeNow = kitSunShade(vKitPos, normalize(vKitNrm));\n  vec3 kitSunView = normalize((viewMatrix * vec4(uKitSunDir, 0.0)).xyz);\n${own.replace(line, `${line}\n\t\tdirectLight.color *= mix(1.0, kitSunShadeNow, step(0.995, dot(directLight.direction, kitSunView)));`)}`
      : '#include <lights_fragment_begin>';
  }
  return ktSunChunk;
}

/**
 * Give a material the castle's shader: the detail over its map (`detail`: { macro, hue, moss, streak, two }), the height fog
 * (any material that has fog on) and the baked shadow of the castle on the sun's light (`shadow`: kitshadow.js). Patched once, before its first draw.
 */
export function ktPatch(material, { detail = null, fog = true, shadow = false } = {}) {
  const two = detail ? detail.two ?? 0 : 0;
  const mean = material.map?.kitMean ?? [0.5, 0.5, 0.5];
  ktWeather.uKitFog.value ??= new THREE.Vector4(0, 0, 0.05, 0);
  if (shadow) ktShadowInit();
  ktLodInit();
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vKitPos;\nvarying vec3 vKitNrm;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vKitPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vKitNrm = normalize(mat3(modelMatrix) * objectNormal);',
    );
    Object.assign(shader.uniforms, ktLod);
    let uniforms = 'varying vec3 vKitPos;\nvarying vec3 vKitNrm;\nuniform vec4 uKitLod;\nuniform vec4 uKitFlags;\n';
    let fragment = shader.fragmentShader;
    if (detail) {
      shader.uniforms.uKitMacro = { value: ktMacroTexture() };
      shader.uniforms.uKitDetail = { value: new THREE.Vector4(detail.macro ?? 0.6, detail.hue ?? 1, detail.moss ?? 0, detail.streak ?? 0) };
      shader.uniforms.uKitMean = { value: new THREE.Vector3(...mean) };
      shader.uniforms.uKitWet = ktWeather.uKitWet;
      shader.uniforms.uKitPools = ktWeather.uKitPools;
      shader.uniforms.uKitPoolSky = ktWeather.uKitPoolSky;
      uniforms += 'uniform sampler2D uKitMacro;\nuniform vec4 uKitDetail;\nuniform vec3 uKitMean;\nuniform float uKitWet;\nuniform float uKitPools;\nuniform float uKitPoolSky;\n';
      fragment = fragment
        .replace('#include <map_fragment>', ktMapChunk(two, detail.pools ?? 0))
        .replace('void main() {', 'void main() {\n  float kitWet = 0.0;\n  float kitPool = 0.0;')
        .replace('#include <lights_fragment_maps>', `${KT_ENV_REACH}${KT_POOL_SKY}`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor *= 1.0 - 0.5 * kitWet;\n  roughnessFactor = mix(roughnessFactor, 0.05, kitPool);');
    }
    if (shadow) {
      Object.assign(shader.uniforms, ktShadow);
      uniforms += KT_SHADOW_PARS;
      fragment = fragment.replace('#include <lights_pars_begin>', `#include <lights_pars_begin>\n${KT_SHADOW_FUNCTION}`).replace('#include <lights_fragment_begin>', ktSunShaded());
    }
    if (fog) {
      shader.uniforms.uKitFog = ktWeather.uKitFog;
      uniforms += 'uniform vec4 uKitFog;\n';
      fragment = fragment.replace('#include <fog_fragment>', KT_FOG);
    }
    shader.fragmentShader = `${uniforms}${fragment}`;
  };
  material.customProgramCacheKey = () => `kit-${detail ? `d${two}p${detail.pools ?? 0}` : ''}${fog ? 'f' : ''}${shadow ? 's' : ''}`;
}

/**
 * The materials of the castle, by name, each tiling over `tile` metres (the geometry's UVs are in metres).
 * `{ ashlar, ruin, rubble, rock, cobble, flags, grass, path, boards, wood, iron, bone, cloth, straw, flame, glow, black }`.
 */
export function ktMaterials() {
  // (A floor's dressing wins a tie with the face under it, by a few steps of the depth buffer: depthrange.js.)
  const make = (map, tile, options = {}, layer = null) => {
    map.repeat.set(1 / tile, 1 / tile);
    const offset = layer && (layer.factor || layer.units) ? { polygonOffset: true, polygonOffsetFactor: layer.factor, polygonOffsetUnits: layer.units } : {};
    return new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.78, metalness: 0, ...offset, ...options });
  };
  const m = {};
  // (Courses stay level, so a masonry texture is read again at another scale, not turned: `two` 1; the ground and the rock may turn: `two` 2.)
  const detail = {
    ashlar: { macro: 0.7, hue: 1, moss: 0.5, streak: 0.5, two: 1, pools: 0.5 },
    ruin: { macro: 0.8, hue: 1, moss: 1.0, streak: 0.55, two: 1, pools: 0.35 },
    rubble: { macro: 0.75, hue: 1, moss: 0.9, streak: 0.5, two: 2, pools: 0.35 },
    rock: { macro: 0.7, hue: 0.6, moss: 0.5, streak: 0.5, two: 2, pools: 0.5 },
    cobble: { macro: 0.7, hue: 0.6, moss: 0.4, streak: 0, two: 2, pools: 1 },
    flags: { macro: 0.7, hue: 0.6, moss: 0.6, streak: 0, two: 2, pools: 1 },
    grass: { macro: 0.9, hue: 1.6, moss: 0, streak: 0, two: 2, pools: 0.1 },
    path: { macro: 0.8, hue: 1, moss: 0.2, streak: 0, two: 2, pools: 0.85 },
    boards: { macro: 0.6, hue: 0.4, moss: 0.2, streak: 0.3, two: 0, pools: 0.3 },
    wood: { macro: 0.6, hue: 0.4, moss: 0.2, streak: 0.3, two: 0, pools: 0 },
    iron: { macro: 0.5, hue: 0, moss: 0, streak: 0.4, two: 0, pools: 0 },
  };
  // (Masonry is drawn on both faces: a wall seen from inside its own thickness, or a vault from above, has a face to show and is not a hole into the void.)
  m.ashlar = make(ktTexture(512, 11, ktAshlar), 4, { roughness: 0.66, side: THREE.DoubleSide });
  m.ruin = make(ktTexture(512, 12, ktRuinWall), 4, { roughness: 0.74, side: THREE.DoubleSide });
  m.rubble = make(ktTexture(512, 13, ktRubble), 4, { roughness: 0.76, side: THREE.DoubleSide });
  m.rock = make(ktTexture(512, 14, ktRock), 6, { roughness: 0.6, side: THREE.DoubleSide });
  m.cobble = make(ktTexture(512, 15, ktCobbles), 3, { roughness: 0.5 }, KIT_FLOOR_OFFSET.cobble);
  m.flags = make(ktTexture(512, 16, ktFlags), 4, { roughness: 0.52 }, KIT_FLOOR_OFFSET.flags);
  m.grass = make(ktTexture(512, 17, ktGrass), 6, { roughness: 0.95 }, KIT_FLOOR_OFFSET.grass);
  m.path = make(ktTexture(512, 18, ktPath), 4, { roughness: 0.84 }, KIT_FLOOR_OFFSET.path);
  m.boards = make(ktTexture(128, 19, (g, s, r) => ktBoards(g, s, r)), 2, { roughness: 0.8 }, KIT_FLOOR_OFFSET.boards);
  m.wood = make(ktTexture(128, 20, (g, s, r) => ktBoards(g, s, r, [70, 52, 36])), 2, { roughness: 0.85 });
  m.iron = make(ktTexture(128, 21, ktIron), 1.5, { roughness: 0.45, metalness: 0.55 });
  for (const name of Object.keys(detail)) ktPatch(m[name], { detail: detail[name], shadow: true });
  const flat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, vertexColors: true, roughness: 0.9, ...options });
  m.bone = flat(0xb9b29a, { roughness: 0.8 });
  m.cloth = flat(0x6a3a32, { roughness: 0.95, side: THREE.DoubleSide });
  m.straw = flat(0x8a7a4a, { roughness: 1 });
  m.black = flat(0x101114, { roughness: 0.9 });
  for (const name of ['bone', 'cloth', 'straw', 'black']) ktPatch(m[name], { shadow: true });
  // The wear and dirt: decals over the stone (kitwear.js), alpha-blended, a hair off the face, with the castle's fog and cut-away.
  m.wear = new THREE.MeshStandardMaterial({ map: kwTexture(), vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  ktPatch(m.wear);
  m.silhouette = flat(0x23252b, { roughness: 1 });
  ktPatch(m.silhouette, { shadow: true });
  m.flame = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  m.glow = new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  m.raven = flat(0x0b0c10, { roughness: 0.6 });
  m.water = new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.88, envMapIntensity: 1.4 });
  return m;
}

/** Let go of a material set's maps and materials. */
export function ktDispose(materials) {
  for (const material of Object.values(materials)) {
    material.map?.dispose();
    material.dispose();
  }
}
