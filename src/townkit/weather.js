// The town kit's materials and the weather they share. Every material is three's standard one over a painted sheet
// (townkit/tex.js: colour, normal map, roughness) with one shader patch that reads a single set of uniforms, the
// place's weather:
//
//   wet   0..1  how wet the surfaces are: they darken and take a sheen, most where they face the sky;
//   pool  0..1  how much water stands on the paving: puddles fill the low joints first and spread, lie flat,
//               and mirror the sky and the houses (a cube map taken once of the place, or the sky's two colours);
//   snow  0..1  snow lying on what faces the sky;
//   rain  0..1  rain falling: the puddles' faces are broken by rings (the streaks themselves are townkit/place.js's);
//   mist        a ground mist, thickest low down (over the canal), on top of the scene's own haze.
//
// These are THE parameters a weather system drives (tkSetWeather): the kit decides nothing about the weather itself.
// The patch also takes the sun off what stands in the baked shadow of the buildings (levelmode/kitshadow.js, the
// castle's own shadow map, reused) and weathers the walls: blotches that ignore the sheet's repeat, a damp, mossy
// band at a wall's foot.

import { ktShadow, ktShadowInit, KT_SHADOW_FUNCTION, KT_SHADOW_PARS } from '../levelmode/kitshadow.js';
import { TK_TEX, tkxTextures } from './tex.js';

/** How the weather shows. Each figure was set by eye against the reference photographs (a wet lane after rain; a dry quay). */
export const TK_WEATHER = {
  // A soaked stone's colour is this share of its dry colour, and its roughness this share of its dry roughness.
  wetDark: 0.58, wetRough: 0.42,
  // An upright face takes this share of the wetness a level one does (rain runs off it; eaves shelter it).
  wetUpright: 0.45,
  // A puddle: how much of the scene's mirror image it shows looking straight down, and at a grazing look.
  mirror: [0.06, 0.85],
  // The damp band at a wall's foot: its height (m) and how dark; and how green the moss in it.
  foot: { height: 0.9, dark: 0.3, moss: [0.36, 0.44, 0.24] },
  // Snow's colour, and how level a surface must be to hold it (the normal's y: from none to full).
  snow: { colour: [0.9, 0.92, 0.95], holds: [0.45, 0.8] },
};

/** The uniforms every kit material shares: the weather (tkSetWeather), the mirror's sources, the clock. */
export const tkWeather = {
  uTkWet: { value: 0 }, uTkPool: { value: 0 }, uTkSnow: { value: 0 }, uTkRain: { value: 0 }, uTkTime: { value: 0 },
  // The mist: (density per metre at its densest, the height it is densest below, how fast it thins above that per metre).
  uTkMist: { value: null }, uTkEnv: { value: null }, uTkEnvOn: { value: 0 }, uTkSkyLow: { value: null }, uTkSkyHigh: { value: null },
};

function tkWeatherInit() {
  if (tkWeather.uTkMist.value) return;
  tkWeather.uTkMist.value = new THREE.Vector3(0, 0, 0.5);
  tkWeather.uTkSkyLow.value = new THREE.Color(0xc8d2d8);
  tkWeather.uTkSkyHigh.value = new THREE.Color(0x9fb0bd);
  ktShadowInit();
}

/** Set the weather: any of `wet`, `pool`, `snow`, `rain` (0..1 each), `mist` [density, top, falloff], `sky` [low, high] (colours). */
export function tkSetWeather({ wet, pool, snow, rain, mist, sky } = {}) {
  tkWeatherInit();
  const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0));
  if (wet !== undefined) tkWeather.uTkWet.value = clamp(wet);
  if (pool !== undefined) tkWeather.uTkPool.value = clamp(pool);
  if (snow !== undefined) tkWeather.uTkSnow.value = clamp(snow);
  if (rain !== undefined) tkWeather.uTkRain.value = clamp(rain);
  if (mist) tkWeather.uTkMist.value.set(mist[0], mist[1], mist[2]);
  if (sky) {
    tkWeather.uTkSkyLow.value.set(sky[0]);
    tkWeather.uTkSkyHigh.value.set(sky[1]);
  }
  return tkWeatherNow();
}

/** The weather as it stands: { wet, pool, snow, rain }. */
export const tkWeatherNow = () => ({ wet: tkWeather.uTkWet.value, pool: tkWeather.uTkPool.value, snow: tkWeather.uTkSnow.value, rain: tkWeather.uTkRain.value });

const TK_PARS = `
varying vec3 vTkPos;
varying vec3 vTkNrm;
uniform float uTkWet;
uniform float uTkPool;
uniform float uTkSnow;
uniform float uTkRain;
uniform float uTkTime;
uniform vec3 uTkMist;
uniform samplerCube uTkEnv;
uniform float uTkEnvOn;
uniform vec3 uTkSkyLow;
uniform vec3 uTkSkyHigh;
uniform vec4 uTkKind;
${KT_SHADOW_PARS}
// (The castle's shadow function asks its own material's tier and soft-edge distance: here the fuller tier, soft within 30 m.)
const vec4 uKitFlags = vec4(0.0, 2.0, 0.0, 0.0);
const vec4 uKitLod = vec4(0.0, 0.0, 0.0, 30.0);
float tkHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tkNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(tkHash(i), tkHash(i + vec2(1.0, 0.0)), f.x), mix(tkHash(i + vec2(0.0, 1.0)), tkHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float tkFbm(vec2 p) { return 0.55 * tkNoise(p) + 0.3 * tkNoise(p * 2.3 + 7.1) + 0.15 * tkNoise(p * 5.1 + 3.7); }
// What a mirror shows along a world direction: the place's cube map, or the sky's two colours.
vec3 tkMirror(vec3 r) {
  vec3 sky = mix(uTkSkyLow, uTkSkyHigh, clamp(r.y * 1.6, 0.0, 1.0));
  if (uTkEnvOn < 0.5) return sky;
  return textureCube(uTkEnv, r).rgb;
}
float tkWetHere = 0.0;
float tkPoolHere = 0.0;
float tkSnowHere = 0.0;
vec3 tkUp = vec3(0.0, 1.0, 0.0);
`;

// After the colour is read: the weathering, the wet, the snow. uTkKind: (x: 1 a wall with a foot at the ground, y: 1 paving
// that holds puddles, 2 open water; z: the ground's height at the wall's foot; w: how strongly the blotches show).
const TK_COLOUR = `
{
  vec3 n = normalize(vTkNrm);
  float blot = tkFbm(vTkPos.xz * 0.21 + vTkPos.y * 0.37);
  float fine = tkFbm(vTkPos.xz * 1.7 + vTkPos.y * 2.1);
  diffuseColor.rgb *= 1.0 + uTkKind.w * ((blot - 0.5) * 0.5 + (fine - 0.5) * 0.18);
  if (uTkKind.x > 0.5) {
    // A wall's foot: rain splashes it and the ground keeps it damp; moss takes the north sides and the corners.
    float h = (vTkPos.y - uTkKind.z) / ${TK_WEATHER.foot.height.toFixed(2)};
    float foot = (1.0 - smoothstep(0.0, 1.0, h + (blot - 0.5) * 1.2)) * (0.6 + 0.4 * uTkWet);
    diffuseColor.rgb *= 1.0 - ${TK_WEATHER.foot.dark.toFixed(2)} * foot;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${TK_WEATHER.foot.moss.join(', ')}) * (0.6 + 0.5 * fine), foot * smoothstep(0.45, 0.75, tkFbm(vTkPos.xz * 0.6 + 11.0)) * 0.7 * (1.0 - uTkSnow));
  }
  float level = smoothstep(0.2, 0.9, n.y);
  tkWetHere = uTkWet * mix(${TK_WEATHER.wetUpright.toFixed(2)}, 1.0, level) * (0.75 + 0.5 * blot);
  if (uTkKind.y > 1.5) {
    tkPoolHere = 1.0;
    tkWetHere = 0.0;
  } else if (uTkKind.y > 0.5) {
    // Water stands where the paving is low: the hollows of a slow wave across the ground, and the joints first.
    #ifdef USE_ROUGHNESSMAP
      float joint = 1.0 - texture2D(roughnessMap, vUv).r;
    #else
      float joint = 0.5;
    #endif
    float hollow = tkFbm(vTkPos.xz * 0.16 + 3.3) * 0.75 + tkNoise(vTkPos.xz * 0.9) * 0.15 + joint * 0.22;
    tkPoolHere = smoothstep(1.02 - uTkPool * 0.62, 1.07 - uTkPool * 0.62, hollow + 0.02) * level * step(0.001, uTkPool);
    // (The rim of a puddle is soaked.)
    tkWetHere = max(tkWetHere, uTkPool * smoothstep(0.9 - uTkPool * 0.62, 1.02 - uTkPool * 0.62, hollow) * level);
  }
  tkSnowHere = uTkSnow * smoothstep(${TK_WEATHER.snow.holds[0].toFixed(2)}, ${TK_WEATHER.snow.holds[1].toFixed(2)}, n.y) * smoothstep(0.25, 0.55, blot * 0.6 + fine * 0.4 + uTkSnow * 0.45) * (1.0 - tkPoolHere);
  diffuseColor.rgb *= mix(1.0, ${TK_WEATHER.wetDark.toFixed(2)}, max(tkWetHere, tkPoolHere * 0.8));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${TK_WEATHER.snow.colour.join(', ')}), tkSnowHere);
}
`;

const TK_ROUGH = `
roughnessFactor = mix(roughnessFactor * mix(1.0, ${TK_WEATHER.wetRough.toFixed(2)}, tkWetHere), 0.06, tkPoolHere);
roughnessFactor = mix(roughnessFactor, 0.85, tkSnowHere);
`;

// Standing water lies flat whatever the stone under it does; rain rings and a breath of wind break its face.
const TK_NORMAL = `
if (tkPoolHere > 0.0) {
  vec2 p = vTkPos.xz;
  float lively = uTkKind.y > 1.5 ? 1.0 : 0.25 + uTkRain;
  vec2 ripple = vec2(tkNoise(p * 2.1 + vec2(uTkTime * 0.31, uTkTime * 0.17)) - 0.5, tkNoise(p * 2.3 + vec2(-uTkTime * 0.23, uTkTime * 0.29) + 5.0) - 0.5) * 0.07 * lively;
  // A drop's ring: cells of half a metre, each struck at its own moment, a ring spreading and dying.
  vec2 cell = floor(p * 2.4);
  vec2 centre = (cell + 0.25 + 0.5 * vec2(tkHash(cell), tkHash(cell + 3.1))) / 2.4;
  float age = fract(uTkTime * 0.9 + tkHash(cell + 7.7));
  float d = length(p - centre) * 2.4;
  float ring = sin((d - age * 0.5) * 60.0) * smoothstep(0.08, 0.0, abs(d - age * 0.5)) * (1.0 - age);
  ripple += normalize(p - centre + 1e-4) * ring * 0.35 * uTkRain;
  tkUp = normalize(vec3(ripple.x, 1.0, ripple.y));
  normal = normalize(mix(normal, normalize((viewMatrix * vec4(tkUp, 0.0)).xyz), tkPoolHere));
}
`;

// Over the lit colour: what the wet and the water mirror, by how grazing the look is.
const TK_MIRROR = `
{
  float share = max(tkPoolHere, tkWetHere * 0.3);
  if (share > 0.004) {
    vec3 look = normalize(vTkPos - cameraPosition);
    vec3 n = normalize(mix(normalize(vTkNrm), tkUp, tkPoolHere));
    float graze = pow(1.0 - clamp(dot(-look, n), 0.0, 1.0), 4.0);
    float fresnel = mix(${TK_WEATHER.mirror[0].toFixed(2)}, ${TK_WEATHER.mirror[1].toFixed(2)}, graze);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, tkMirror(reflect(look, n)), fresnel * share);
  }
}
`;

// The scene's haze, and the mist lying low: its density falls off above its top, and the way through it is taken
// at the mean height of the eye and the thing seen.
const TK_FOG = `
#ifdef USE_FOG
  float fogFactor = smoothstep(fogNear, fogFar, fogDepth);
  float tkMid = 0.5 * (cameraPosition.y + vTkPos.y);
  float tkMist = 1.0 - exp(-uTkMist.x * exp(-max(tkMid - uTkMist.y, 0.0) * uTkMist.z) * fogDepth);
  fogFactor = 1.0 - (1.0 - fogFactor) * (1.0 - tkMist);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif
`;

let tkSunChunk = null;
/** three's lights chunk with the sun's light (the directional light pointing where the baked shadow's sun is) taken off what stands in the baked shadow. */
function tkSunShaded() {
  if (!tkSunChunk) {
    const line = 'getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );';
    const own = THREE.ShaderChunk.lights_fragment_begin;
    tkSunChunk = own.includes(line)
      ? `float tkSunShadeNow = kitSunShade(vTkPos, normalize(vTkNrm));\n  vec3 tkSunView = normalize((viewMatrix * vec4(uKitSunDir, 0.0)).xyz);\n${own.replace(line, `${line}\n\t\tdirectLight.color *= mix(1.0, tkSunShadeNow, step(0.995, dot(directLight.direction, tkSunView)));`)}`
      : own;
  }
  return tkSunChunk;
}

/** Patch a standard material with the kit's shader. `kind`: [wall foot 0|1, puddles 0|1|2 (water), the ground's height, blotch strength]. */
export function tkPatch(material, kind = [0, 0, 0, 1]) {
  tkWeatherInit();
  const own = { uTkKind: { value: new THREE.Vector4(...kind) } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, tkWeather, ktShadow, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTkPos;\nvarying vec3 vTkNrm;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvTkPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTkNrm = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <packing>', `#include <packing>\n${TK_PARS}\n${KT_SHADOW_FUNCTION}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${TK_COLOUR}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${TK_ROUGH}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${TK_NORMAL}`)
      .replace('#include <lights_fragment_begin>', tkSunShaded())
      .replace('#include <tonemapping_fragment>', `${TK_MIRROR}\n#include <tonemapping_fragment>`)
      .replace('#include <fog_fragment>', TK_FOG);
  };
  material.customProgramCacheKey = () => 'townkit';
  material.userData.tkKind = own.uTkKind.value;
  return material;
}

/**
 * What each of the kit's materials is: its sheet (tex.js), how it weathers (`foot`: a wall standing on the ground; `pools`:
 * paving that holds puddles; `blotch`: how strongly the blotches show), and what three needs to know. A place may add its own.
 */
export const TK_MATERIALS = {
  brick: { sheet: 'brick', foot: 1 },
  ashlar: { sheet: 'ashlar', foot: 1 },
  rubble: { sheet: 'rubble', foot: 1 },
  plaster: { sheet: 'plaster', foot: 1, blotch: 1.3 },
  timber: { sheet: 'timber', blotch: 0.6 },
  rooftile: { sheet: 'rooftile', blotch: 0.9 },
  flags: { sheet: 'flags', pools: 1 },
  cobble: { sheet: 'cobble', pools: 1 },
  earth: { sheet: 'earth', pools: 1, blotch: 1.2 },
  rock: { sheet: 'rock', blotch: 1.2 },
  // Bark: the rock's rough sheet under a trunk's own colour (a tree is seen from a few metres at the nearest).
  bark: { sheet: 'rock', blotch: 1.1 },
  lattice: { sheet: 'lattice', cutout: true, blotch: 0.4 },
  foliage: { sheet: 'foliage', cutout: true, blotch: 0.8 },
  needles: { sheet: 'needles', cutout: true, blotch: 0.8 },
  // Open water: the canal. A dark green that is nearly all mirror.
  water: { sheet: 'plaster', pools: 2, colour: [0.2, 0.27, 0.22], blotch: 0.3, plain: true },
};

/**
 * The kit's materials for one place: `get(name)` makes each on first use (its sheet painted then). `size`: the sheets'
 * resolution (the low tier halves it); `ground`: the height the walls' feet stand at; `anisotropy`: for paving seen at a
 * grazing angle. `dispose()` lets the sheets go.
 */
export function tkMaterials({ size = 512, ground = 0, anisotropy = 8, extra = {} } = {}) {
  const made = new Map();
  const sheets = new Map();
  const sheet = (name) => {
    if (!sheets.has(name)) {
      const textures = tkxTextures(name, { size: Math.min(size, TK_TEX[name].size ?? size), anisotropy });
      for (const texture of [textures.map, textures.normalMap, textures.surfaceMap]) texture.repeat.set(1 / textures.metres, 1 / textures.metres);
      sheets.set(name, textures);
    }
    return sheets.get(name);
  };
  return {
    get(name) {
      if (made.has(name)) return made.get(name);
      const spec = extra[name] ?? TK_MATERIALS[name];
      if (!spec) throw new Error(`townkit: no material called ${name}`);
      const textures = sheet(spec.sheet);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(...(spec.colour ?? [1, 1, 1])), vertexColors: true, metalness: 0, roughness: 1,
        map: spec.plain ? null : textures.map, normalMap: textures.normalMap, roughnessMap: spec.plain ? null : textures.surfaceMap,
        alphaTest: spec.cutout ? 0.5 : 0, side: spec.cutout || spec.twoSided ? THREE.DoubleSide : THREE.FrontSide,
      });
      if (spec.normalScale) material.normalScale.set(spec.normalScale, spec.normalScale);
      material.name = `townkit:${name}`;
      tkPatch(material, [spec.foot ?? 0, spec.pools ?? 0, spec.ground ?? ground, spec.blotch ?? 1]);
      made.set(name, material);
      return material;
    },
    dispose() {
      for (const material of made.values()) material.dispose();
      for (const textures of sheets.values()) for (const texture of [textures.map, textures.normalMap, textures.surfaceMap]) texture.dispose();
      made.clear();
      sheets.clear();
    },
  };
}
