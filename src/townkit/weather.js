// The town kit's materials and the weather they share. Every material is three's standard one over a painted sheet
// (townkit/tex.js: colour, normal map, roughness) with one shader patch that reads a single set of uniforms, the
// place's weather:
//
//   wet   0..1  how wet the surfaces are: they darken and take a sheen, most where they face the sky;
//   pool  0..1  how much water stands on the paving: puddles fill the low places first and spread, lie flat,
//               and mirror the sky and the houses (a cube map taken once of the place, or the sky's two colours);
//   snow  0..1  snow lying on what faces the sky;
//   rain  0..1  rain falling: the puddles' faces are broken by rings (the streaks themselves are townkit/place.js's);
//   mist        a ground mist, thickest low down (over the canal), on top of the scene's own haze.
//
// These are THE parameters a weather system drives (tkSetWeather): the kit decides nothing about the weather itself.
// In the open air (env/: townkit/air.js joins a kit place to it) they are driven from its weather, the haze, the
// sky a mirror shows, the clouds' moving shade and the wind are its own (air.js ENV_GLSL), and the kit's mist and
// fog stand aside.
//
// The patch also knows where it is, from the place's lie (townkit/lay.js: a map from above, baked when the place is
// built): what is under a roof, a vault or a bridge takes no snow, no rain and no puddle, and less of the sky's
// light (the baked shade: under eaves, in a gate's passage, at a wall's foot, in the angle of two walls); water
// stands in the low places; snow lies as the wind left it and is trodden away where feet go. And it weathers what
// it draws, by rule and never by hand: blotches that ignore the sheet's repeat, grime in the joints, a damp band
// and splashed mud at a wall's foot, moss on the sides that face north and in the shade, streaks running down from
// a wall's top and from under its eaves, plaster fallen from the brick, tiles slipped and mossed, the middle of a
// way worn pale and its edges green. The sun is taken off what stands in the baked shadow of the buildings
// (levelmode/kitshadow.js, the castle's own shadow map, reused).

import { ENV_GLSL, envUniforms } from '../env/air.js';
import { ENV } from '../env/config.js';
import { ktShadow, ktShadowInit, KT_SHADOW_FUNCTION, KT_SHADOW_PARS } from '../levelmode/kitshadow.js';
import { TK_TEX, tkxTextures } from './tex.js';

/** How the weather and the dirt show. Each figure was set by eye against the reference photographs (a wet lane after rain; a dry quay; a gate in snow) unless it says otherwise. */
export const TK_WEATHER = {
  // A soaked stone's colour is this share of its dry colour, and its roughness this share of its dry roughness.
  wetDark: 0.58, wetRough: 0.42,
  // An upright face takes this share of the wetness a level one does (rain runs off it; eaves shelter it); what is
  // under cover (the lie's map) keeps this share (damp trodden in, the air's own).
  wetUpright: 0.45, wetUnder: 0.3,
  // A puddle: how much of the scene's mirror image it shows looking straight down, and at a grazing look. (Water
  // throws back about 2 % straight down and nearly all at a grazing look; the low figure is raised a little for
  // the film of mud under a puddle's edge being brighter than deep water.)
  mirror: [0.05, 0.9],
  // A wet stone that is not under water shows this share of a puddle's mirror.
  sheen: 0.3,
  // The damp band at a wall's foot: its height (m; it rises unevenly along the wall, from 0.55 to 1.45 of this) and
  // how dark; how green the moss in it; the mud splashed up the first `splash` m, and its colour.
  foot: { height: 0.9, dark: 0.3, moss: [0.3, 0.38, 0.19], splash: 0.35, mud: [0.3, 0.27, 0.22] },
  // Streaks running down a wall from its top or from under its eave: how dark the darkest, and how far the longest
  // runs (m; each runs its own length, from 0.6 m).
  streak: { dark: 0.5, runs: 3.6 },
  // Plaster fallen from the brick under it: the brick's colour, and how much of a wall has lost it at the foot
  // and a storey up (a threshold on a slow noise: 0 none, 1 all).
  bare: { colour: [0.36, 0.35, 0.34], low: 0.42, high: 0.16 },
  // The baked shade: how much of the sky's light the lie's map may take (1: all it says), how much darker the
  // dirt makes a surface the rain never washes, and how much of the light a joint's own depth takes.
  shade: { most: 0.9, dirt: 0.22, joint: 0.4 },
  // A way's worn middle is this much paler and smoother than its edges; its edges this much darker.
  tread: { pale: 0.1, edge: 0.24 },
  // Snow's colour, and how level a surface must be to hold it (the normal's y: from none to full). `colour` is for
  // the page without the open air's camera curve: well under fresh snow's own reflectance (about 0.9), because
  // with no tone mapping a sunlit field at 0.9 clips to flat white and loses its shape. `colourAir` is for the open
  // air, whose curve holds the range: the figure the open air uses for the land's own snow (env/config.js
  // ENV.terrain.snowColour), new snow throwing back about nine tenths, a little more of the blue. `drift`: how much
  // darker its wind-packed patches are (a few metres across), so a field of it is not one tone. `trodden`: what
  // feet make of it (its colour is multiplied by this where the wear is full). `caught`: the share of an upright
  // face's joints and ledges the wind plasters with it on the side it blows against.
  // `blown`: the wind's work on lying snow, which is what a low sun draws it by. Low drifts `drift` m across and
  // `stretch` times as long down the wind, their flanks up to about `driftSlope` (rise over run); over them a ripple
  // `ripple` m across of `rippleSlope`, seen out to `rippleTo` m. Wind-packed snow's ridges (sastrugi) run from
  // centimetres to a few decimetres high and lie along the wind; the sizes are by eye inside that, approximate.
  snow: { colour: [0.76, 0.79, 0.84], colourAir: ENV.terrain.snowColour, holds: [0.45, 0.8], drift: 0.1, trodden: [0.7, 0.64, 0.56], caught: 0.55, blown: { drift: 4.5, stretch: 2.6, driftSlope: 0.17, ripple: 0.42, rippleSlope: 0.13, rippleTo: [22, 55] } },
};

/**
 * What the wind moves, in the vertex stage, by one rule: the wind at a point (the open air's gusts where it is on,
 * the place's own wind and a slow swell where it is off) and what the thing is.
 *  - `tree` [bend, flutter] (a material: bark, leaves): a point `h` m over the ground under it (the lie map's ground)
 *    goes downwind by bend x h^2 x U^2 m, a cantilever's deflection under drag. bend 6e-5 puts an 8 m crown's top
 *    0.14 m over in a 6 m/s wind; a mature tree's top moves some decimetres in a fresh breeze, approximate.
 *    Leaves shiver besides by `flutter` m per m/s.
 *  - hung things (townkit/stir.js: lanterns, cloth on a line, banners) carry their own pivot and figures as vertex
 *    attributes: `aTkPivot` where each vertex hangs from or is tied, `aTkStir` (catch, flutter, phase, swing rate).
 *    catch > 0: it leans downwind about the pivot by atan(catch x U^2), drag over weight (catch = rho Cd A / 2mg:
 *    a 0.3 kg paper lantern of 0.07 m^2 face is 0.014, 13 degrees at 4 m/s; a wet shirt 0.05; dry light cloth 0.2),
 *    and swings on about that at its pendulum's own rate. catch < 0: tied down one side to a pole (a banner): it
 *    streams round the pole to lie downwind, drooping by atan(-catch / U^2).
 *    flutter: a wave runs down the cloth from where it is held, its height `flutter` x the distance from there, at
 *    its fullest from `fullAt` m/s (TK_STIR.flap: its wave number rad/m, its rate rad/s).
 */
export const TK_STIR_RULE = { tree: { bend: 6e-5, flutter: 0.004 }, flap: { wave: 4.5, rate: 7, fullAt: 6 }, swing: 0.35, swell: [0.35, 0.7] };

/** The uniforms every kit material shares: the weather (tkSetWeather), the mirror's sources, the clock, the place's lie, the open air. */
export const tkWeather = {
  uTkWet: { value: 0 }, uTkPool: { value: 0 }, uTkSnow: { value: 0 }, uTkRain: { value: 0 }, uTkTime: { value: 0 },
  // The mist: (density per metre at its densest, the height it is densest below, how fast it thins above that per metre).
  uTkMist: { value: null }, uTkEnv: { value: null }, uTkEnvOn: { value: 0 }, uTkSkyLow: { value: null }, uTkSkyHigh: { value: null },
  // The lie (lay.js): its two sheets, where the map lies (its corner's x and z, 1 / its width and depth), and how
  // its heights are read (the height at 0, the range, 1 while a map is in force).
  uTkLayA: { value: null }, uTkLayB: { value: null }, uTkLay: { value: null }, uTkLayH: { value: null },
  // (1 in the open air, north's x and z, 0); the wind (the way it blows: x, z; its speed m/s; 0).
  uTkAir: { value: null }, uTkBlow: { value: null },
};

function tkWeatherInit() {
  if (tkWeather.uTkMist.value) return;
  tkWeather.uTkMist.value = new THREE.Vector3(0, 0, 0.5);
  tkWeather.uTkSkyLow.value = new THREE.Color(0xc8d2d8);
  tkWeather.uTkSkyHigh.value = new THREE.Color(0x9fb0bd);
  const blank = new THREE.DataTexture(new Uint8Array([255, 0, 0, 128]), 1, 1, THREE.RGBAFormat);
  blank.needsUpdate = true;
  tkWeather.uTkLayA.value = blank;
  tkWeather.uTkLayB.value = blank;
  tkWeather.uTkLay.value = new THREE.Vector4(0, 0, 1, 1);
  tkWeather.uTkLayH.value = new THREE.Vector3(0, 1, 0);
  tkWeather.uTkAir.value = new THREE.Vector4(0, 0, -1, 0);
  tkWeather.uTkBlow.value = new THREE.Vector4(1, 0, 0, 0);
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

/**
 * Put a place's lie in force (lay.js: `lay` the bake, `textures` its two sheets), or with null take it off;
 * `north`: [x, z] the way north lies on the place's ground (moss takes that side).
 */
export function tkSetLay(lay, textures, north = [0, -1]) {
  tkWeatherInit();
  tkWeather.uTkAir.value.y = north[0];
  tkWeather.uTkAir.value.z = north[1];
  if (!lay) {
    tkWeather.uTkLayH.value.z = 0;
    return;
  }
  tkWeather.uTkLayA.value = textures.a;
  tkWeather.uTkLayB.value = textures.b;
  tkWeather.uTkLay.value.set(lay.min[0], lay.min[1], 1 / lay.size[0], 1 / lay.size[1]);
  tkWeather.uTkLayH.value.set(lay.base, lay.range, 1);
}

/** Tell the materials whether the open air is on (its haze, sky and cloud shade are then used), and the wind: the way it blows [x, z] and its speed (m/s). */
export function tkSetAir(on, blow = null) {
  tkWeatherInit();
  tkWeather.uTkAir.value.x = on ? 1 : 0;
  if (blow) tkWeather.uTkBlow.value.set(blow[0], blow[1], blow[2] ?? 0, 0);
}

const tkVec = (colour) => `vec3(${colour.map((part) => part.toFixed(3)).join(', ')})`;

const TK_PARS = `
varying vec3 vTkPos;
varying vec3 vTkNrm;
uniform float uTkWet;
uniform float uTkPool;
uniform float uTkSnow;
uniform float uTkHold;
uniform float uTkRain;
uniform float uTkTime;
uniform vec3 uTkMist;
uniform samplerCube uTkEnv;
uniform float uTkEnvOn;
uniform vec3 uTkSkyLow;
uniform vec3 uTkSkyHigh;
uniform vec4 uTkKind;
uniform vec4 uTkDirt;
uniform vec4 uTkLaid;
uniform sampler2D uTkLayA;
uniform sampler2D uTkLayB;
uniform vec4 uTkLay;
uniform vec3 uTkLayH;
uniform vec4 uTkAir;
uniform vec4 uTkBlow;
${ENV_GLSL}
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
// What a mirror shows along a world direction: the place's cube map (taken with the open air's sky in it), the
// open air's sky alone, or the sky's two colours.
vec3 tkMirror(vec3 r) {
  if (uTkEnvOn > 0.5) return textureCube(uTkEnv, r).rgb;
  if (uTkAir.x > 0.5) return envSky(normalize(vec3(r.x, max(r.y, 0.02), r.z)));
  return mix(uTkSkyLow, uTkSkyHigh, clamp(r.y * 1.6, 0.0, 1.0));
}
float tkWetHere = 0.0;
float tkPoolHere = 0.0;
float tkSnowHere = 0.0;
vec3 tkUp = vec3(0.0, 1.0, 0.0);
// From the lie: the sky's share here, how far under cover (0..1), the wear, and the joint's depth (the sheet's).
float tkSky = 1.0;
float tkUnder = 0.0;
float tkWear = 0.0;
float tkJoint = 0.0;
`;

// After the colour is read: where this is (the lie), the dirt, the wet, the snow. uTkKind: (x: over 0 a wall with a
// foot at the ground, the damp band's height as a multiple of TK_WEATHER.foot.height; y: 1 paving that holds
// puddles, 2 open water; z: the ground's height at the wall's foot where no lie says; w: how strongly the blotches
// show). uTkDirt: (streaks, moss, grime in the joints, how much treading shows: 0..1 each). uTkLaid: (the sheet's
// tiles across and along, how much plaster may fall from it, 0).
const TK_COLOUR = `
{
  vec3 n = normalize(vTkNrm);
  float blot = tkFbm(vTkPos.xz * 0.21 + vTkPos.y * 0.37);
  float fine = tkFbm(vTkPos.xz * 1.7 + vTkPos.y * 2.1);
  #ifdef USE_ROUGHNESSMAP
    tkJoint = 1.0 - texture2D(roughnessMap, vUv).r;
  #else
    tkJoint = 0.5;
  #endif
  float level = smoothstep(0.2, 0.9, n.y);
  float upright = 1.0 - smoothstep(0.25, 0.6, abs(n.y));

  // The lie of the place here: read a hand's breadth off the face, so a wall reads the ground at its foot and
  // what hangs over it; and once inside the face, for the top of the wall itself (what runs down it starts there).
  float groundY = uTkKind.z;
  float hollow = tkFbm(vTkPos.xz * 0.16 + 3.3) * 0.75;
  float lies = 0.5;
  float nearWall = 0.0;
  float fall = -1.0;
  if (uTkLayH.z > 0.5) {
    vec2 q = (vTkPos.xz + n.xz * 0.3 - uTkLay.xy) * uTkLay.zw;
    if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) {
      vec4 la = texture2D(uTkLayA, q);
      vec4 lb = texture2D(uTkLayB, q);
      float top = lb.r * uTkLayH.y + uTkLayH.x;
      groundY = lb.g * uTkLayH.y + uTkLayH.x;
      float over = top - vTkPos.y;
      tkUnder = smoothstep(0.35, 0.9, over);
      float high = max(vTkPos.y - groundY, 0.0);
      // (Up a wall the sky opens, unless the place is shut in: a passage, a lane's dark end.)
      float lift = smoothstep(0.2, 3.5, high) * smoothstep(0.08, 0.4, la.r);
      tkSky = mix(la.r, 1.0, lift);
      // (Close under what hangs over: an eave's own shade on the wall below it, deepest at the top.)
      tkSky *= 1.0 - 0.6 * tkUnder * exp(-max(over - 0.25, 0.0) / 1.3) * step(1.0, high);
      // (On or over what is built, the map's share is the ground's beneath and is not this point's: a roof or a
      // wall's walk has the whole sky; a wall rising out of a roof has it but for the angle where they meet.)
      float built = step(0.5, top - groundY) * (1.0 - tkUnder);
      tkSky = mix(tkSky, mix(mix(0.6, 1.0, smoothstep(0.0, 1.2, -over)), 1.0, smoothstep(0.15, 0.5, n.y)), built);
      hollow = la.g;
      tkWear = la.b;
      lies = la.a;
      nearWall = lb.b;
      if (upright > 0.01) fall = texture2D(uTkLayB, (vTkPos.xz - n.xz * 0.35 - uTkLay.xy) * uTkLay.zw).r * uTkLayH.y + uTkLayH.x - vTkPos.y;
    }
  }
  float high = vTkPos.y - groundY;

  diffuseColor.rgb *= 1.0 + uTkKind.w * ((blot - 0.5) * 0.5 + (fine - 0.5) * 0.18);
  // Grime: in the joints, and over everything the rain does not wash.
  diffuseColor.rgb *= 1.0 - uTkDirt.z * (tkJoint * 0.3 + ${TK_WEATHER.shade.dirt.toFixed(2)} * (1.0 - tkSky));

  if (uTkLaid.x > 0.5) {
    // A tiled roof: each tile its own tone, a few slipped (a dark gap), moss gathering low on the slopes that face north.
    vec2 tile = floor(vUv * uTkLaid.xy);
    float own = tkHash(tile);
    diffuseColor.rgb *= 0.86 + 0.28 * own;
    diffuseColor.rgb *= 1.0 - 0.6 * step(0.975, tkHash(tile + 17.0)) * smoothstep(0.3, 0.6, tkJoint + 0.3);
    float north = 0.5 + 0.5 * dot(normalize(n.xz + 1e-4), uTkAir.yz);
    float mossy = smoothstep(0.52, 0.8, tkFbm(vTkPos.xz * 0.45 + 5.0) * 0.8 + 0.2 * own + 0.14 * north) * uTkDirt.y;
    diffuseColor.rgb = mix(diffuseColor.rgb, ${tkVec(TK_WEATHER.foot.moss)} * (0.55 + 0.6 * fine), mossy * 0.7 * (0.4 + 0.6 * tkJoint));
  }

  if (uTkKind.x > 0.01 && upright > 0.01) {
    // Along the wall, whichever way it runs.
    float along = vTkPos.x * n.z - vTkPos.z * n.x;
    if (uTkLaid.z > 0.01) {
      // Plaster fallen from the brick: most at the foot, in patches with a broken edge; the edge's shadow.
      float gone = tkFbm(vec2(along * 0.55, vTkPos.y * 0.7) + 2.0) + (tkNoise(vec2(along * 6.0, vTkPos.y * 6.0)) - 0.5) * 0.12;
      float least = 1.0 - uTkLaid.z * mix(${TK_WEATHER.bare.low.toFixed(2)}, ${TK_WEATHER.bare.high.toFixed(2)}, smoothstep(0.2, 2.6, high));
      float bare = smoothstep(least, least + 0.02, gone);
      vec3 brick = ${tkVec(TK_WEATHER.bare.colour)} * (0.8 + 0.4 * fine) * (0.75 + 0.25 * step(0.12, fract(vTkPos.y / 0.075)));
      diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.35 * smoothstep(least - 0.05, least, gone)), brick, bare);
    }
    // A wall's foot: the ground keeps it damp (the band rises unevenly along it), rain splashes mud up it, and
    // moss takes the damp where the sun does not come: the north sides, the shut-in corners.
    float band = uTkKind.x * ${TK_WEATHER.foot.height.toFixed(2)} * (0.55 + 0.9 * tkNoise(vec2(along * 0.35, 3.0)));
    float foot = (1.0 - smoothstep(0.0, 1.0, high / band + (blot - 0.5) * 0.9)) * (0.6 + 0.4 * uTkWet);
    diffuseColor.rgb *= 1.0 - ${TK_WEATHER.foot.dark.toFixed(2)} * foot;
    float splash = 1.0 - smoothstep(0.04, ${TK_WEATHER.foot.splash.toFixed(2)}, high + (fine - 0.5) * 0.25);
    diffuseColor.rgb = mix(diffuseColor.rgb, ${tkVec(TK_WEATHER.foot.mud)} * (0.75 + 0.5 * fine), splash * 0.5);
    float north = 0.5 + 0.5 * dot(normalize(n.xz + 1e-4), uTkAir.yz);
    float mossy = foot * smoothstep(0.42, 0.72, tkFbm(vTkPos.xz * 0.6 + vTkPos.y * 0.4 + 11.0) + 0.3 * (north - 0.5) + 0.25 * (1.0 - tkSky));
    diffuseColor.rgb = mix(diffuseColor.rgb, ${tkVec(TK_WEATHER.foot.moss)} * (0.6 + 0.5 * fine), mossy * 0.8 * uTkDirt.y * (1.0 - 0.6 * uTkSnow));
    // What runs down from the wall's top and from under its eave: dark streaks, each its own width and length.
    if (fall > -0.05) {
      float run = tkNoise(vec2(along * 2.6, 1.7)) * 0.65 + tkNoise(vec2(along * 9.0, 4.2)) * 0.35;
      float runs = 0.6 + ${(TK_WEATHER.streak.runs - 0.6).toFixed(2)} * tkNoise(vec2(along * 1.3, 8.8));
      float streak = smoothstep(0.5, 0.75, run) * (1.0 - smoothstep(0.0, runs, max(fall, 0.0)));
      // (And the wash under the top itself: a darker hand's breadth where the water first runs over.)
      streak = max(streak, 0.6 * (1.0 - smoothstep(0.0, 0.35, max(fall, 0.0))));
      diffuseColor.rgb *= 1.0 - ${TK_WEATHER.streak.dark.toFixed(2)} * uTkDirt.x * streak * upright;
    }
  }

  tkWetHere = uTkWet * mix(${TK_WEATHER.wetUpright.toFixed(2)}, 1.0, level) * (0.75 + 0.5 * blot) * mix(1.0, ${TK_WEATHER.wetUnder.toFixed(2)}, tkUnder);
  if (uTkKind.y > 1.5) {
    tkPoolHere = 1.0;
    tkWetHere = 0.0;
  } else if (uTkKind.y > 0.5) {
    // A way's worn middle is paler and its edges dark with what collects there; green in the joints along a wall's
    // foot, where no one treads.
    float tread = tkWear * uTkDirt.w;
    diffuseColor.rgb *= 1.0 + ${TK_WEATHER.tread.pale.toFixed(2)} * tread - ${TK_WEATHER.tread.edge.toFixed(2)} * nearWall * (0.4 + blot) * (1.0 - tread);
    float weed = tkJoint * smoothstep(0.3, 0.75, nearWall * 0.8 + (fine - 0.5) * 0.7 + (blot - 0.5) * 0.5 - tread) * uTkDirt.y;
    diffuseColor.rgb = mix(diffuseColor.rgb, ${tkVec(TK_WEATHER.foot.moss)} * (0.55 + 0.5 * fine), weed * 0.85 * (1.0 - 0.6 * uTkSnow));
    // Water stands where the ground is low (the lie's map; the joints first), under open sky.
    float low = hollow + tkNoise(vTkPos.xz * 0.9) * 0.12 + tkJoint * 0.22;
    tkPoolHere = smoothstep(1.02 - uTkPool * 0.62, 1.07 - uTkPool * 0.62, low + 0.02) * level * step(0.001, uTkPool) * (1.0 - tkUnder);
    // (The rim of a puddle is soaked.)
    tkWetHere = max(tkWetHere, uTkPool * smoothstep(0.9 - uTkPool * 0.62, 1.02 - uTkPool * 0.62, low) * level * (1.0 - tkUnder));
  }
  // Lying snow: white wherever it holds; less of it leaves bare patches, a few metres and a few tens of metres
  // across. The wind's work (the lie's map) piles it or thins it, feet tread it away, and nothing lies under cover.
  float holds = uTkHold * (1.0 - 0.8 * tkWear);
  float lying = blot * 0.42 + fine * 0.28 + tkFbm(vTkPos.xz * 0.045 + 7.0) * 0.3 + uTkSnow * holds * 0.45 + (lies - 0.5) * 0.8;
  tkSnowHere = smoothstep(0.0, 0.5, uTkSnow) * smoothstep(${TK_WEATHER.snow.holds[0].toFixed(2)}, ${TK_WEATHER.snow.holds[1].toFixed(2)}, n.y) * smoothstep(0.25, 0.55, lying) * (1.0 - tkPoolHere) * (1.0 - tkUnder);
  if (uTkLaid.x > 0.5) {
    // (Off a roof it has slid in sheets: strips down the slope lie bare.)
    float across = vTkPos.x * n.z - vTkPos.z * n.x;
    tkSnowHere *= 1.0 - smoothstep(0.62, 0.7, tkNoise(vec2(across * 0.4, 5.0)) + 0.25 * (fine - 0.5)) * smoothstep(0.1, 0.3, 1.0 - n.y);
  }
  // (The wind plasters it into the joints and onto the ledges of the faces it blows against.)
  float caught = uTkSnow * ${TK_WEATHER.snow.caught.toFixed(2)} * upright * smoothstep(0.1, 0.7, -dot(n.xz, uTkBlow.xy)) * smoothstep(0.35, 0.7, tkJoint + 0.5 * (blot - 0.5)) * (1.0 - tkUnder) * step(0.01, uTkKind.x);
  tkSnowHere = max(tkSnowHere, caught);
  diffuseColor.rgb *= mix(1.0, ${TK_WEATHER.wetDark.toFixed(2)}, max(tkWetHere, tkPoolHere * 0.8));
  vec3 snow = mix(${tkVec(TK_WEATHER.snow.colour)}, ${tkVec(TK_WEATHER.snow.colourAir)}, uTkAir.x) * (1.0 - ${TK_WEATHER.snow.drift.toFixed(2)} * tkFbm(vTkPos.xz * 0.3 + 3.0));
  snow *= mix(vec3(1.0), ${tkVec(TK_WEATHER.snow.trodden)} * (0.85 + 0.3 * fine), clamp(tkWear * 1.3, 0.0, 1.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, snow, tkSnowHere);
}
`;

const TK_ROUGH = `
roughnessFactor = mix(roughnessFactor * mix(1.0, ${TK_WEATHER.wetRough.toFixed(2)}, tkWetHere), 0.06, tkPoolHere);
roughnessFactor = mix(roughnessFactor, 0.85, tkSnowHere);
`;

// Standing water lies flat whatever the stone under it does; rain rings and the wind break its face. Snow buries
// the sheet's relief, and where feet have been it is pocked.
const TK_NORMAL = `
if (tkPoolHere > 0.0) {
  vec2 p = vTkPos.xz;
  float lively = uTkKind.y > 1.5 ? 1.0 : 0.25 + uTkRain;
  // (The wind's own wavelets run before it, stronger as it blows: in the open air its gusts cross the water.)
  float blowing = uTkAir.x > 0.5 ? envGust(p) : uTkBlow.z;
  vec2 drift = uTkBlow.xy * uTkTime * (0.25 + 0.06 * uTkBlow.z);
  vec2 ripple = vec2(tkNoise(p * 2.1 - drift * 2.1 + vec2(uTkTime * 0.11, uTkTime * 0.07)) - 0.5, tkNoise(p * 2.3 - drift * 2.3 + vec2(-uTkTime * 0.09, uTkTime * 0.13) + 5.0) - 0.5) * 0.07 * lively * (0.5 + 0.25 * blowing);
  ripple += vec2(tkNoise(p * 7.0 - drift * 9.0) - 0.5, tkNoise(p * 7.0 - drift * 9.0 + 3.0) - 0.5) * 0.012 * blowing * lively;
  // A drop's ring: cells of half a metre, each struck at its own moment, a ring spreading and dying.
  vec2 cell = floor(p * 2.4);
  vec2 centre = (cell + 0.25 + 0.5 * vec2(tkHash(cell), tkHash(cell + 3.1))) / 2.4;
  float age = fract(uTkTime * 0.9 + tkHash(cell + 7.7));
  float d = length(p - centre) * 2.4;
  float ring = sin((d - age * 0.5) * 60.0) * smoothstep(0.08, 0.0, abs(d - age * 0.5)) * (1.0 - age);
  ripple += normalize(p - centre + 1e-4) * ring * 0.35 * uTkRain * (1.0 - tkUnder);
  tkUp = normalize(vec3(ripple.x, 1.0, ripple.y));
  normal = normalize(mix(normal, normalize((viewMatrix * vec4(tkUp, 0.0)).xyz), tkPoolHere));
}
// Snow lies smooth over whatever is under it: the sheet's own relief is buried.
if (tkSnowHere > 0.0) {
  vec3 tkLie = normalize(vTkNrm);
  if (tkWear > 0.04) {
    // Trodden: pocked by feet (a boot's length across), deeper where more have passed.
    vec2 p = vTkPos.xz * 3.6;
    float here = tkNoise(p);
    tkLie = normalize(tkLie + vec3(here - tkNoise(p + vec2(0.35, 0.0)), 0.0, here - tkNoise(p + vec2(0.0, 0.35))) * 1.6 * clamp(tkWear * 1.5, 0.0, 1.0));
  }
  {
    // Blown: drifts lying along the wind and a ripple over them (TK_WEATHER.snow.blown), flatter where feet have
    // packed it and in the lee under a wall, where it settles instead.
    vec2 along = uTkBlow.xy;
    vec2 across = vec2(-along.y, along.x);
    vec2 q = vec2(dot(vTkPos.xz, along) / ${TK_WEATHER.snow.blown.stretch.toFixed(2)}, dot(vTkPos.xz, across));
    vec2 qa = q / ${TK_WEATHER.snow.blown.drift.toFixed(2)};
    vec2 qb = q / ${TK_WEATHER.snow.blown.ripple.toFixed(2)};
    float ha = tkNoise(qa);
    float hb = tkNoise(qb);
    vec2 ga = vec2(tkNoise(qa + vec2(0.3, 0.0)) - ha, tkNoise(qa + vec2(0.0, 0.3)) - ha) * ${(TK_WEATHER.snow.blown.driftSlope / 0.3).toFixed(3)};
    vec2 gb = vec2(tkNoise(qb + vec2(0.3, 0.0)) - hb, tkNoise(qb + vec2(0.0, 0.3)) - hb) * ${(TK_WEATHER.snow.blown.rippleSlope / 0.3).toFixed(3)} * (1.0 - smoothstep(${TK_WEATHER.snow.blown.rippleTo[0].toFixed(1)}, ${TK_WEATHER.snow.blown.rippleTo[1].toFixed(1)}, length(vViewPosition)));
    vec2 g = (ga + gb) * (0.35 + 0.65 * tkSky) * (1.0 - clamp(tkWear * 1.5, 0.0, 1.0)) * smoothstep(0.7, 0.95, tkLie.y);
    tkLie = normalize(tkLie - vec3(along.x * g.x / ${TK_WEATHER.snow.blown.stretch.toFixed(2)} + across.x * g.y, 0.0, along.y * g.x / ${TK_WEATHER.snow.blown.stretch.toFixed(2)} + across.y * g.y));
  }
  tkLie = normalize((viewMatrix * vec4(tkLie, 0.0)).xyz) * (gl_FrontFacing ? 1.0 : -1.0);
  normal = normalize(mix(normal, tkLie, tkSnowHere * 0.85));
}
`;

// The baked shade, on the light that comes from the sky and the ground (not the sun's own: its shadows are cast).
const TK_SHADE = `
{
  float tkOpen = mix(1.0, tkSky, ${TK_WEATHER.shade.most.toFixed(2)}) * (1.0 - ${TK_WEATHER.shade.joint.toFixed(2)} * tkJoint * (1.0 - tkSnowHere) * step(0.01, uTkDirt.z));
  reflectedLight.indirectDiffuse *= tkOpen;
  reflectedLight.indirectSpecular *= tkOpen;
}
`;

// Over the lit colour: what the wet and the water mirror, by how grazing the look is; then the open air's haze
// (light like the rest: before the camera's curve).
const TK_MIRROR = `
{
  float share = max(tkPoolHere, tkWetHere * ${TK_WEATHER.sheen.toFixed(2)});
  if (share > 0.004) {
    vec3 look = normalize(vTkPos - cameraPosition);
    vec3 n = normalize(mix(normalize(vTkNrm), tkUp, tkPoolHere));
    float graze = pow(1.0 - clamp(dot(-look, n), 0.0, 1.0), 4.0);
    float fresnel = mix(${TK_WEATHER.mirror[0].toFixed(2)}, ${TK_WEATHER.mirror[1].toFixed(2)}, graze);
    // (What stands under cover mirrors the dark over it, not the sky.)
    gl_FragColor.rgb = mix(gl_FragColor.rgb, tkMirror(reflect(look, n)) * mix(1.0, 0.25, tkUnder), fresnel * share);
  }
  if (uTkAir.x > 0.5) gl_FragColor.rgb = envHaze(gl_FragColor.rgb, cameraPosition, vTkPos);
}
`;

// The scene's haze, and the mist lying low: its density falls off above its top, and the way through it is taken
// at the mean height of the eye and the thing seen. In the open air the haze is the air's own (TK_MIRROR), and this
// stands aside.
const TK_FOG = `
#ifdef USE_FOG
  if (uTkAir.x < 0.5) {
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * fogDepth * fogDepth);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, fogDepth);
    #endif
    float tkMid = 0.5 * (cameraPosition.y + vTkPos.y);
    float tkMist = 1.0 - exp(-uTkMist.x * exp(-max(tkMid - uTkMist.y, 0.0) * uTkMist.z) * fogDepth);
    fogFactor = 1.0 - (1.0 - fogFactor) * (1.0 - tkMist);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  }
#endif
`;

// The vertex stage of what the wind moves (TK_STIR_RULE): its uniforms and the wind at a point.
const TK_STIR_PARS = `
uniform float uTkTime;
uniform sampler2D uTkLayB;
uniform vec4 uTkLay;
uniform vec3 uTkLayH;
uniform vec4 uTkAir;
uniform vec4 uTkBlow;
uniform vec4 uTkSway;
${ENV_GLSL}
#ifdef TK_HUNG
attribute vec3 aTkPivot;
attribute vec4 aTkStir;
#endif
float tkWindAt(vec2 xz) {
  return uTkAir.x > 0.5 ? envGust(xz) : uTkBlow.z * (1.0 + ${TK_STIR_RULE.swell[0].toFixed(2)} * sin(uTkTime * ${TK_STIR_RULE.swell[1].toFixed(2)} + xz.x * 0.05 + xz.y * 0.07));
}
// \`r\` turned about the unit \`axis\` by the angle whose sine and cosine are given.
vec3 tkTurn(vec3 r, vec3 axis, float sine, float cosine) { return r * cosine + cross(axis, r) * sine + axis * dot(axis, r) * (1.0 - cosine); }
`;

// Before three's own normal: a hung thing's lean and stream, worked out once for its normal and its place.
const TK_STIR_NORMAL = `
#ifdef TK_HUNG
  float tkU = tkWindAt(aTkPivot.xz);
  vec3 tkDown = vec3(uTkBlow.x, 0.0, uTkBlow.y);
  vec3 tkAxis = vec3(-uTkBlow.y, 0.0, uTkBlow.x);
  vec3 tkArm = position - aTkPivot;
  float tkFree = length(tkArm);
  float tkSine = 0.0;
  float tkCosine = 1.0;
  vec3 tkStream = vec3(0.0, 1.0, 0.0);
  if (aTkStir.x > 0.0) {
    float lean = atan(aTkStir.x * tkU * tkU);
    lean *= 1.0 + ${TK_STIR_RULE.swing.toFixed(2)} * sin(uTkTime * aTkStir.w + aTkStir.z);
    tkSine = sin(lean);
    tkCosine = cos(lean);
    objectNormal = tkTurn(objectNormal, tkAxis, tkSine, tkCosine);
  } else if (aTkStir.x < 0.0) {
    // Round the pole to lie downwind: the turn that takes the cloth's own way out from the pole onto the wind's.
    vec2 out2 = normalize(tkArm.xz + vec2(1e-5, 0.0));
    tkSine = out2.x * tkDown.z - out2.y * tkDown.x;
    tkCosine = dot(out2, tkDown.xz);
    objectNormal = tkTurn(objectNormal, tkStream, -tkSine, tkCosine);
  }
#endif
`;

// After three's own start of the vertex: the thing moved.
const TK_STIR_VERTEX = `
#ifdef TK_HUNG
  {
    vec3 arm = tkArm;
    if (aTkStir.x > 0.0) arm = tkTurn(arm, tkAxis, tkSine, tkCosine);
    else if (aTkStir.x < 0.0) {
      arm = tkTurn(arm, tkStream, -tkSine, tkCosine);
      float droop = atan(-aTkStir.x / max(tkU * tkU, 0.05));
      float reach = length(arm.xz);
      arm.xz *= cos(droop);
      arm.y -= reach * sin(droop);
    }
    float flap = aTkStir.y * tkFree * sin(tkFree * ${TK_STIR_RULE.flap.wave.toFixed(2)} - uTkTime * ${TK_STIR_RULE.flap.rate.toFixed(2)} + aTkStir.z) * clamp(tkU / ${TK_STIR_RULE.flap.fullAt.toFixed(1)}, 0.06, 1.3);
    transformed = aTkPivot + arm + objectNormal * flap;
  }
#endif
#ifdef TK_TREE
  {
    vec3 at = (modelMatrix * vec4(transformed, 1.0)).xyz;
    float ground = uTkLayH.z > 0.5 ? texture2D(uTkLayB, (at.xz - uTkLay.xy) * uTkLay.zw).g * uTkLayH.y + uTkLayH.x : 0.0;
    float high = max(at.y - ground, 0.0);
    float blow = tkWindAt(at.xz);
    vec2 push = uTkBlow.xy * uTkSway.x * high * high * blow * blow * (1.0 + 0.3 * sin(uTkTime * 1.3 + at.x * 0.11 + at.z * 0.13));
    push += uTkSway.y * blow * vec2(sin(uTkTime * 5.3 + at.x * 3.1 + at.y * 2.3), cos(uTkTime * 4.7 + at.z * 2.9 + at.y * 1.7));
    transformed.xz += push;
  }
#endif
`;

let tkSunChunk = null;
/** three's lights chunk with the sun's light (the directional light pointing where the baked shadow's sun is) taken off what stands in the baked shadow. */
function tkSunShaded() {
  if (!tkSunChunk) {
    const line = 'getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );';
    const own = THREE.ShaderChunk.lights_fragment_begin;
    tkSunChunk = own.includes(line)
      ? `float tkSunShadeNow = kitSunShade(vTkPos, normalize(vTkNrm));\n  // (In the open air the clouds' shade crosses the place: the sun's light is set for the floor's middle, env/index.js, and is put right here for this point.)\n  float tkCloudNow = uTkAir.x > 0.5 ? envSunShare(vTkPos) / max(envSunShare(vec3(0.0)), 0.05) : 1.0;\n  vec3 tkSunView = normalize((viewMatrix * vec4(uKitSunDir, 0.0)).xyz);\n${own.replace(line, `${line}\n\t\tdirectLight.color *= mix(1.0, tkSunShadeNow * tkCloudNow, step(0.995, dot(directLight.direction, tkSunView)));`)}`
      : own;
  }
  return tkSunChunk;
}

/**
 * Patch a standard material with the kit's shader. `kind`: [wall foot (0, or the damp band's height as a multiple),
 * puddles 0|1|2 (water), the ground's height, blotch strength]; `hold`: how well snow lies on it (1: as the weather
 * says; less: trodden, it shows through in patches); `dirt`: [streaks, moss, grime, treading] 0..1 each; `laid`:
 * [tiles across the sheet, along it, how much plaster may fall, 0].
 */
export function tkPatch(material, kind = [0, 0, 0, 1], hold = 1, dirt = [0, 0, 0, 0], laid = [0, 0, 0, 0], stir = null) {
  tkWeatherInit();
  const own = { uTkKind: { value: new THREE.Vector4(...kind) }, uTkHold: { value: hold }, uTkDirt: { value: new THREE.Vector4(...dirt) }, uTkLaid: { value: new THREE.Vector4(...laid) }, uTkSway: { value: new THREE.Vector4(...(stir?.tree ?? [0, 0]), 0, 0) } };
  // (`stir`: what the wind does with it, TK_STIR_RULE: { tree: [bend, flutter] } or { hung: true }.)
  if (stir) material.defines = { ...material.defines, ...(stir.hung ? { TK_HUNG: 1 } : { TK_TREE: 1 }) };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, envUniforms(), tkWeather, ktShadow, own);
    if (stir) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${TK_STIR_PARS}`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${TK_STIR_NORMAL}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${TK_STIR_VERTEX}`);
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTkPos;\nvarying vec3 vTkNrm;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvTkPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTkNrm = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <packing>', `#include <packing>\n${TK_PARS}\n${KT_SHADOW_FUNCTION}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${TK_COLOUR}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${TK_ROUGH}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${TK_NORMAL}`)
      .replace('#include <lights_fragment_begin>', tkSunShaded())
      .replace('#include <aomap_fragment>', `${TK_SHADE}\n#include <aomap_fragment>`)
      .replace('#include <tonemapping_fragment>', `${TK_MIRROR}\n#include <tonemapping_fragment>`)
      .replace('#include <fog_fragment>', TK_FOG);
  };
  material.customProgramCacheKey = () => (stir ? (stir.hung ? 'townkit-hung' : 'townkit-tree') : 'townkit');
  material.userData.tkKind = own.uTkKind.value;
  // (The open air leaves a material so marked alone: this one takes its haze, sky and cloud shade itself.)
  material.userData.envOwn = true;
  return material;
}

/**
 * What each of the kit's materials is: its sheet (tex.js), how it weathers, and what three needs to know. `foot`: a
 * wall standing on the ground (the damp band's height as a multiple of TK_WEATHER.foot.height); `pools`: paving that
 * holds puddles; `blotch`: how strongly the blotches show; `dirt`: [streaks down from the top, moss, grime in the
 * joints and the shade, how much treading shows], 0..1 each, set against what the material is (lime plaster streaks
 * and stains most and sheds from its brick; fired brick and dressed stone less; timber greys but does not streak
 * much); `fall`: how much of its plaster may have fallen; `tiles`: a laid roof's tiles across and along its sheet.
 * A place may add its own.
 */
export const TK_MATERIALS = {
  brick: { sheet: 'brick', foot: 1, dirt: [0.55, 0.8, 0.8, 0] },
  ashlar: { sheet: 'ashlar', foot: 1, dirt: [0.6, 0.9, 0.9, 0] },
  rubble: { sheet: 'rubble', foot: 1, dirt: [0.5, 1, 1, 0] },
  plaster: { sheet: 'plaster', foot: 1, blotch: 1.3, dirt: [1, 0.9, 0.6, 0], fall: 1 },
  timber: { sheet: 'timber', foot: 0.5, blotch: 0.6, dirt: [0.35, 0.3, 0.7, 0] },
  rooftile: { sheet: 'rooftile', blotch: 0.9, dirt: [0, 0.8, 0.7, 0], tiles: [TK_TEX.rooftile.rolls, TK_TEX.rooftile.laps] },
  flags: { sheet: 'flags', pools: 1, dirt: [0, 0.9, 0.9, 1] },
  cobble: { sheet: 'cobble', pools: 1, dirt: [0, 1, 0.9, 1] },
  earth: { sheet: 'earth', pools: 1, blotch: 1.2, dirt: [0, 0.5, 0.3, 1] },
  rock: { sheet: 'rock', blotch: 1.2, dirt: [0, 0.4, 0.5, 0] },
  // Bark: the rock's rough sheet under a trunk's own colour (a tree is seen from a few metres at the nearest).
  // (`sway`: the wind moves it as a tree, TK_STIR_RULE.tree: its bend and, for leaves, their shiver.)
  bark: { sheet: 'rock', blotch: 1.1, dirt: [0, 0, 0.5, 0], sway: [TK_STIR_RULE.tree.bend, 0] },
  lattice: { sheet: 'lattice', cutout: true, blotch: 0.4 },
  foliage: { sheet: 'foliage', cutout: true, blotch: 0.8, sway: [TK_STIR_RULE.tree.bend, TK_STIR_RULE.tree.flutter] },
  needles: { sheet: 'needles', cutout: true, blotch: 0.8, sway: [TK_STIR_RULE.tree.bend, TK_STIR_RULE.tree.flutter * 0.5] },
  // Cloth and paper that hang and fly (townkit/stir.js): the plaster sheet's fine grain under each piece's own
  // colour, seen from both sides, holding no snow.
  cloth: { sheet: 'plaster', plain: true, twoSided: true, snow: 0, blotch: 0.5, hung: true },
  // Open water: the canal. Silted green-brown water, nearly all mirror at the angles it is seen from: it shows the
  // sky pale and the houses dark, as the reference's does.
  water: { sheet: 'plaster', pools: 2, colour: [0.2, 0.25, 0.2], blotch: 0.3, plain: true },
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
      tkPatch(material, [spec.foot ?? 0, spec.pools ?? 0, spec.ground ?? ground, spec.blotch ?? 1], spec.snow ?? 1, spec.dirt ?? [0, 0, 0, 0], [spec.tiles?.[0] ?? 0, spec.tiles?.[1] ?? 0, spec.fall ?? 0, 0], spec.hung ? { hung: true } : spec.sway ? { tree: spec.sway } : null);
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
