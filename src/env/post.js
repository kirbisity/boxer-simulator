// The camera's last steps for an open-air place (src/env/): the frame's light sums (display values, which may
// pass 1) are decoded to light, exposed for the light on the ground, spread a little by the lens where they are
// very bright, drawn out into shafts where lit haze stands before the sun, bent by one filmic curve and graded.
//
//   envToneOf(air, weather)   the exposure and the curve for an air state: { exposure, contrast, sigma, gain, ... }
//   ENV_GLSL_FILM             the curve, for the frame's last pass here and for the materials' own (air.js) where
//                             there is no last pass
//   envPostDraw(view, tone, level, shafts)   draw the frame through the passes (false: it cannot here; draw plain)
//
// Only an open-air place is drawn this way. Every other place's lights, colours and skin are set against the plain
// picture, and a curve over them would move every one of those colours.

/* global THREE */

import { ENV } from './config.js';
import { ENV_GLSL, envUniforms } from './air.js';

/**
 * The curve for an air state (air.js envAirState) under a weather, its constants solved so mid-grey keeps its value
 * and `white` reaches the ceiling (config.js), and what the camera's meter needs: `ground`, the light the place's
 * ground (a grey card, where neither the place's `meter`, the wet nor lying snow says otherwise) on the level sends back (sun x sine of its elevation + sky; display values summed, their luminance to the 2.2
 * power as light), and `hazed`, the share of a view that is the haze's own light and not the land's.
 */
export function envToneOf(air, weather, place, skySeen) {
  const tune = ENV.tone;
  const grade = { ...tune.grade, ...weather.grade };
  // What the place's ground sees of the sky (among walls less than all of it) and what it throws back: a grey
  // card's worth unless the place says, and moved toward snow's by the weather's lying snow.
  const open = skySeen ?? place?.meter?.sky ?? 1;
  const bare = place?.meter?.albedo ?? tune.grey;
  // (Wet, it throws back less: the same share the land's shader darkens it by.)
  const soaked = bare * (1 - (1 - ENV.terrain.wetDarken) * (weather.wet || 0));
  const card = tune.grey + (soaked + (ENV.air.snowBounce - soaked) * (weather.snow || 0) - tune.grey) * tune.groundSeen;
  const level = [0, 1, 2].map((channel) => air.sunColour[channel] * air.sun[1] + air.skyLight[channel] * open);
  const n = grade.contrast;
  const grey = Math.pow(tune.grey, n);
  const white = Math.pow(grade.white, n);
  const sigma = (grey * (1 - tune.grey)) / (tune.grey - grey / white);
  return {
    ground: card * Math.pow(envLuma(level), 2.2),
    hazed: air.extinction ? 1 - Math.exp(-air.extinction * tune.view) : 0,
    stops: Math.pow(2, grade.ev),
    skyShare: place?.meter?.frame ?? tune.skyShare,
    exposure: 1,
    contrast: n,
    sigma,
    gain: 1 + sigma / white,
    saturation: grade.saturation,
    warmth: grade.warmth,
  };
}

const envLuma = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
const envSeen = [0, 0, 0];

/**
 * Meter the camera for the way it looks (x, z: level, unit or zero) and set `tone.exposure`: what it sees is the
 * land, a grey card's worth of the light on the ground, and through thick air the haze's own light that way (the
 * sky table's horizon row, as the haze shader draws it), each by its share of the view. Looking into the sun
 * through mist the meter closes down, as far as ENV.tone.hazeMost lets the air's light count (past it the air
 * round the sun burns out and what stands in the mist is still seen); looking away it opens. A sky far brighter
 * than the land (a low sun's) closes it too, by the share of a frame the sky fills.
 */
export function envMeter(tone, air, x, z) {
  const tune = ENV.tone;
  let haze = 0;
  let sky = 0;
  {
    const { across } = ENV.sky;
    const flat = Math.hypot(x, z);
    const cosine = flat > 1e-4 ? Math.min(1, Math.max(-1, (x * air.sun[0] + z * air.sun[2]) / (flat * Math.hypot(air.sun[0], air.sun[2])))) : 0;
    const column = (Math.acos(cosine) / Math.PI) * (across - 1);
    const left = Math.min(across - 2, Math.floor(column));
    for (let channel = 0; channel < 3; channel += 1) {
      const a = air.table[left * 4 + channel];
      envSeen[channel] = (a + (air.table[left * 4 + 4 + channel] - a) * (column - left)) / 255 * ENV.sky.most;
    }
    sky = Math.pow(envLuma(envSeen), 2.2);
    if (tone.hazed > 0.01) haze = Math.pow(envLuma(envSeen) * (1 - ENV.air.shadeBeam * (1 - (tone.airShare ?? 1))), 2.2);
  }
  // The sky that way is in the frame too, and counts where it outshines the land past what the curve's shoulder
  // holds (ENV.tone.skyOver): toward a low sun the camera closes down for it and lets the land go dark, as an
  // evening is photographed, where an exposure set by the land alone burnt the whole sky out.
  const land = tone.ground + (Math.min(haze, tone.ground * tune.hazeMost) - tone.ground) * tone.hazed;
  const seen = land + Math.max(0, sky - tone.ground * tune.skyOver) * tone.skyShare * (1 - tone.hazed);
  tone.exposure = Math.pow((tune.grey * tune.meter) / seen, tune.adapt) * tone.stops;
  return tone.exposure;
}

/** GLSL: exposed light to a display value. `tone`: y contrast, z sigma, w gain; `grade`: x saturation, y warmth. */
export const ENV_GLSL_FILM = /* glsl */ `
vec3 envFilm(vec3 light, vec4 tone, vec2 grade) {
  light *= vec3(1.0 + grade.y, 1.0, 1.0 - grade.y);
  light = max(mix(vec3(dot(light, vec3(0.2126, 0.7152, 0.0722))), light, grade.x), 0.0);
  vec3 p = pow(light, vec3(tone.y));
  vec3 each = tone.w * p / (p + tone.z);
  // The curve on the light as a whole (ENV.tone.hue): the brightness bent, the colour's proportions kept (raised
  // to the curve's power, as the curve raises them in the middle tones), and a colour the display cannot hold
  // let go toward white at its brightness rather than turned by its strongest channel stopping first.
  float whole = dot(light, vec3(0.2126, 0.7152, 0.0722));
  float bent = pow(whole, tone.y);
  bent = tone.w * bent / (bent + tone.z);
  vec3 part = pow(light / max(whole, 1e-6), vec3(tone.y));
  vec3 kept = bent * part / max(dot(part, vec3(0.2126, 0.7152, 0.0722)), 1e-6);
  float top = max(max(kept.r, kept.g), kept.b);
  kept = mix(kept, vec3(bent), clamp((top - 1.0) / max(top - bent, 1e-4), 0.0, 1.0));
  return pow(max(mix(each, kept, ${ENV.tone.hue.toFixed(2)}), 0.0), vec3(0.4545));
}`;

const ENV_POST_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// One blur for every step of the bloom (the dual filter: a picture halved through five taps and doubled through
// eight is close to a Gaussian at each size). uHow.x: 0 halve, 1 double; y: decode display values and expose by
// this (0: the source is light already); z: keep only light over this; w: times this.
const ENV_POST_BLUR = /* glsl */ `
uniform sampler2D uFrom;
uniform vec2 uStep;
uniform vec4 uHow;
varying vec2 vUv;
vec3 at(vec2 off) {
  vec3 c = texture2D(uFrom, vUv + off * uStep).rgb;
  if (uHow.y > 0.0) c = min(pow(max(c, 0.0), vec3(2.2)) * uHow.y, vec3(${ENV.post.bloomMost.toFixed(1)}));
  return c;
}
void main() {
  vec3 c;
  if (uHow.x < 0.5) {
    c = (at(vec2(0.0)) * 4.0 + at(vec2(1.0)) + at(vec2(-1.0)) + at(vec2(1.0, -1.0)) + at(vec2(-1.0, 1.0))) / 8.0;
  } else {
    c = (at(vec2(2.0, 0.0)) + at(vec2(-2.0, 0.0)) + at(vec2(0.0, 2.0)) + at(vec2(0.0, -2.0))
      + (at(vec2(1.0)) + at(vec2(-1.0)) + at(vec2(1.0, -1.0)) + at(vec2(-1.0, 1.0))) * 2.0) / 12.0;
  }
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(c * max(luma - uHow.z, 0.0) / max(luma, 1e-4) * uHow.w, 1.0);
}`;

// The shafts: from each point of the picture a walk toward the sun's place on it, summing the bright light met
// on the way (what is bright between the eye's line and the sun is haze in the sun, or the sky that lights it).
// uSun: xy the sun's place (uv; it may lie off the picture, whose edge then stands for what is beyond it),
// z strength, w the picture's width over its height.
const ENV_POST_SHAFTS = /* glsl */ `
uniform sampler2D uFrom;
uniform vec4 uSun;
varying vec2 vUv;
void main() {
  vec2 pace = (uSun.xy - vUv) * ${(ENV.post.shaftReach / ENV.post.shaftSteps).toFixed(5)};
  float span = length(pace * vec2(uSun.w, 1.0));
  vec2 p = vUv + pace * fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${ENV.post.shaftSteps}; i++) {
    vec3 c = texture2D(uFrom, p).rgb;
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    sum += c * max(luma - ${ENV.post.shaftFrom.toFixed(2)}, 0.0) / max(luma, 1e-4) * exp(-span * float(i) * ${ENV.post.shaftFade.toFixed(2)});
    p += pace;
  }
  gl_FragColor = vec4(sum * uSun.z / ${ENV.post.shaftSteps.toFixed(1)}, 1.0);
}`;

// The frame: light, the lens's glare and the shafts added, the corners dimmed as a lens dims them, the curve.
// uGrade: x saturation, y warmth, z bloom's share, w vignette's; uLens: the tangents of half the view across and up.
const ENV_POST_FRAME = /* glsl */ `
uniform sampler2D uFrom;
uniform sampler2D uBloom;
uniform sampler2D uShafts;
uniform vec4 uTone;
uniform vec4 uGrade;
uniform vec3 uLens;
varying vec2 vUv;
${ENV_GLSL_FILM}
void main() {
  vec3 light = pow(max(texture2D(uFrom, vUv).rgb, 0.0), vec3(2.2)) * uTone.x;
  light += texture2D(uBloom, vUv).rgb * uGrade.z + texture2D(uShafts, vUv).rgb * uLens.z;
  vec2 off = (vUv - 0.5) * 2.0 * uLens.xy;
  float cosine = 1.0 / (1.0 + dot(off, off));
  light *= mix(1.0, cosine * cosine, uGrade.w);
  vec3 c = envFilm(light, uTone, uGrade.xy);
  c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;

// Shade in the air, walked once a point of the picture (ENV.air.frameSteps): the scene's materials have put the
// air's light before everything as if the sun were on all of it (air.js envAirShare gives them 1), and this pass,
// at half the frame's size, finds from the depth of each point how much of the light on its line the sun does
// not reach and writes the light that is not there: rgb in the scene's own display values, a the point's depth
// (m), which the next pass uses to keep one thing's air off another's edge. The sky's points lie at the far
// plane: their line is walked up through the layer as sky.js lays it over the sky.
// (Made at first use and not as this file is read: air.js and this file read one another.)
const envPostAirShader = () => /* glsl */ `
uniform sampler2D uDepth;
uniform mat4 uUnproject;
uniform vec3 uEye;
uniform vec2 uRange;
varying vec2 vUv;
${ENV_GLSL}
void main() {
  float z = texture2D(uDepth, vUv).x;
  vec4 at = uUnproject * vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
  vec3 ray = at.xyz / at.w - uEye;
  float distance_ = length(ray);
  vec3 dir = ray / max(distance_, 1e-3);
  vec3 depth = (uEnvRayleigh.rgb + uEnvHaze.rgb * envHazeColumn(max(uEye.y, 0.0), max(uEye.y + ray.y, 0.0))) * distance_;
  if (z >= 0.999999) {
    float column = uEnvRayleigh.a / uEnvHaze.w * exp(-max(uEye.y, 0.0) * uEnvHaze.w) / max(dir.y, 0.004);
    depth = vec3(dir.y > 0.0 ? column : 40.0);
  }
  float share = envAirWalk(uEye, ray, depth.g, envGrain(gl_FragCoord.xy), ${ENV.air.frameSteps});
  gl_FragColor = vec4((envAirlightIn(dir, 1.0) - envAirlightIn(dir, share)) * (1.0 - exp(-depth)), uRange.x * uRange.y / (uRange.y - z * (uRange.y - uRange.x)));
}`;

// The scene less that light. The pass above is half the size, so each point takes the four of its points round
// it, each by how near it is and by how like its depth is to this point's: the air before a far wood is not
// laid on the edge of a fighter standing before it.
const ENV_POST_UNSHADE = /* glsl */ `
uniform sampler2D uFrom;
uniform sampler2D uAir;
uniform sampler2D uDepth;
uniform vec2 uStep;
uniform vec2 uRange;
varying vec2 vUv;
void main() {
  vec4 colour = texture2D(uFrom, vUv);
  float z = texture2D(uDepth, vUv).x;
  float here = uRange.x * uRange.y / (uRange.y - z * (uRange.y - uRange.x));
  vec2 at = vUv / uStep - 0.5;
  vec2 corner = (floor(at) + 0.5) * uStep;
  vec2 part = fract(at);
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 which = vec2(mod(float(i), 2.0), floor(float(i) / 2.0));
    vec4 tap = texture2D(uAir, corner + which * uStep);
    vec2 near_ = mix(1.0 - part, part, which);
    float weight = (near_.x * near_.y + 0.02) / (0.03 + abs(tap.a - here) / max(here, 1.0));
    sum += tap.rgb * weight;
    total += weight;
  }
  gl_FragColor = vec4(max(colour.rgb - sum / total, 0.0), colour.a);
}`;

let envPost = null;

/** Whether the frame can be drawn through the passes on this device (so the air's shade may be left to them). */
export function envPostAble(renderer) {
  envPost ??= envPostMake(renderer);
  return envPost.able;
}

/** The passes' own things, made at first use: a quad, three materials, and whether this device can hold light in a target. */
function envPostMake(renderer) {
  const pass = (fragmentShader, uniforms, more) => new THREE.ShaderMaterial({ vertexShader: ENV_POST_VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false, fog: false, ...more });
  const blur = { uFrom: { value: null }, uStep: { value: new THREE.Vector2() }, uHow: { value: new THREE.Vector4() } };
  const post = {
    able: renderer.capabilities.isWebGL2 && !!renderer.extensions.get('EXT_color_buffer_float'),
    width: 0,
    height: 0,
    scene: new THREE.Scene(),
    late: new THREE.Scene(),
    camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    blur: pass(ENV_POST_BLUR, blur),
    // The same blur, laid over what its target holds: a level of the bloom added to the one above it.
    add: pass(ENV_POST_BLUR, blur, { blending: THREE.AdditiveBlending, transparent: true }),
    shafts: pass(ENV_POST_SHAFTS, { uFrom: { value: null }, uSun: { value: new THREE.Vector4() } }),
    frame: pass(ENV_POST_FRAME, { uFrom: { value: null }, uBloom: { value: null }, uShafts: { value: null }, uTone: { value: new THREE.Vector4() }, uGrade: { value: new THREE.Vector4() }, uLens: { value: new THREE.Vector3() } }),
    air: pass(envPostAirShader(), { ...envUniforms(), uDepth: { value: null }, uUnproject: { value: new THREE.Matrix4() }, uEye: { value: new THREE.Vector3() }, uRange: { value: new THREE.Vector2() } }),
    unshade: pass(ENV_POST_UNSHADE, { uFrom: { value: null }, uAir: { value: null }, uDepth: { value: null }, uStep: { value: new THREE.Vector2() }, uRange: { value: new THREE.Vector2() } }),
    targets: [],
    sunAt: new THREE.Vector3(),
    size: new THREE.Vector2(),
  };
  post.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post.blur);
  post.quad.frustumCulled = false;
  post.late.autoUpdate = false;
  post.scene.add(post.quad);
  return post;
}

/** Targets for a drawing buffer of this size: the scene's (light, smoothed edges), half of it, and the bloom's levels down from a quarter. */
function envPostSize(post, width, height) {
  if (post.width === width && post.height === height) return;
  for (const target of post.targets) target.dispose();
  const make = (Kind, w, h) => {
    const target = new Kind(Math.max(1, w), Math.max(1, h), { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: Kind !== THREE.WebGLRenderTarget, stencilBuffer: false });
    target.texture.generateMipmaps = false;
    return target;
  };
  post.width = width;
  post.height = height;
  post.main = make(THREE.WebGLMultisampleRenderTarget, width, height);
  // (The scene's depth is kept to read: the air's shade is walked from it.)
  post.main.depthTexture?.dispose();
  post.main.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
  post.lit = make(THREE.WebGLRenderTarget, width, height);
  post.airAt = make(THREE.WebGLRenderTarget, width >> 1, height >> 1);
  post.airAt.texture.minFilter = post.airAt.texture.magFilter = THREE.NearestFilter;
  post.half = make(THREE.WebGLRenderTarget, width >> 1, height >> 1);
  post.levels = [];
  for (let level = 0; level < ENV.post.bloomLevels; level += 1) post.levels.push(make(THREE.WebGLRenderTarget, width >> (level + 2), height >> (level + 2)));
  post.rays = [make(THREE.WebGLRenderTarget, width >> 2, height >> 2), make(THREE.WebGLRenderTarget, width >> 2, height >> 2)];
  post.targets = [post.main, post.lit, post.airAt, post.half, ...post.levels, ...post.rays];
}

/**
 * Draw the view's frame through the passes. `tone`: an envToneOf; `level`: 1 bloom, 2 bloom and shafts
 * (ENV.quality's `post`); `shafts`: the shafts' strength (index.js, from the air); `air`: the air's shade is
 * walked here, from the scene's depth (the scene's materials were told so: index.js envUpdate). Returns false where
 * the device cannot hold light in a target: the caller draws the plain frame, whose materials then carry the
 * curve themselves.
 */
export function envPostDraw(view, tone, level, shafts, air) {
  const renderer = view.renderer;
  envPost ??= envPostMake(renderer);
  const post = envPost;
  if (!post.able) return false;
  renderer.getDrawingBufferSize(post.size);
  envPostSize(post, post.size.x, post.size.y);
  const tune = ENV.post;
  const camera = view.camera;

  // The scene, as light sums: its materials' own curve stands aside for a negative exposure (air.js).
  // What falls through the air and is seen through (rain, snow, dust) waits where the air's shade is taken off
  // the frame: that light is worked out for what stands behind each pixel, and taken off a flake in front of a far
  // wood or a shaded sky it left the flake black. It is drawn onto the frame after, tested against the scene's depth.
  const late = air ? (view.env?.group?.userData.envParts?.particles.children ?? []).filter((mesh) => mesh.userData.envLate && mesh.visible) : [];
  for (const mesh of late) mesh.visible = false;
  renderer.toneMappingExposure = -1;
  renderer.setRenderTarget(post.main);
  renderer.render(view.scene, camera);
  for (const mesh of late) mesh.visible = true;

  const quad = post.quad;
  const run = (material, from, to, x, expose, cut, times) => {
    quad.material = material;
    const u = material.uniforms;
    u.uFrom.value = from.texture;
    if (u.uStep) {
      // (Halving: the taps sit on the source's texel corners; doubling: half a source texel apart.)
      u.uStep.value.set((x ? 0.5 : 1) / from.width, (x ? 0.5 : 1) / from.height);
      u.uHow.value.set(x, expose, cut, times);
    }
    renderer.setRenderTarget(to);
    renderer.render(post.scene, post.camera);
  };
  // The air's shade: the light that is not there, at half size, then the scene less it.
  let scene = post.main;
  if (air) {
    quad.material = post.air;
    const a = post.air.uniforms;
    a.uDepth.value = post.main.depthTexture;
    a.uUnproject.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    a.uEye.value.setFromMatrixPosition(camera.matrixWorld);
    a.uRange.value.set(camera.near, camera.far);
    renderer.setRenderTarget(post.airAt);
    renderer.render(post.scene, post.camera);
    quad.material = post.unshade;
    const s = post.unshade.uniforms;
    s.uFrom.value = post.main.texture;
    s.uAir.value = post.airAt.texture;
    s.uDepth.value = post.main.depthTexture;
    s.uStep.value.set(1 / post.airAt.width, 1 / post.airAt.height);
    s.uRange.value.set(camera.near, camera.far);
    renderer.setRenderTarget(post.lit);
    renderer.render(post.scene, post.camera);
    scene = post.lit;
    if (late.length) {
      for (const mesh of late) {
        mesh.material.uniforms.uLate.value.set(1 / post.lit.width, 1 / post.lit.height, 1);
        mesh.material.uniforms.uLateDepth.value = post.main.depthTexture;
      }
      // (Their own scene only to be drawn from: they stay the place's children, and their matrices are the main
      // scene's.)
      post.late.children = late;
      const clears = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(post.late, camera);
      renderer.autoClear = clears;
      // (The depth is not left on their materials: a stage torn down frees every texture its materials hold
      // (toon.js disposeMaterialTextures), and this one is the frame's.)
      for (const mesh of late) {
        mesh.material.uniforms.uLate.value.z = 0;
        mesh.material.uniforms.uLateDepth.value = null;
      }
    }
  }
  const levels = post.levels;
  run(post.blur, scene, post.half, 0, tone.exposure, 0, 1);
  run(post.blur, post.half, levels[0], 0, 0, tune.bloomFrom, 1);
  for (let at = 1; at < levels.length; at += 1) run(post.blur, levels[at - 1], levels[at], 0, 0, 0, 1);
  for (let at = levels.length - 1; at > 0; at -= 1) run(post.add, levels[at], levels[at - 1], 1, 0, 0, tune.bloomSpread);

  // The sun's place on the picture; behind the camera, or far off its edge, there are no shafts to draw.
  let rays = 0;
  if (level > 1 && shafts > 0) {
    const sun = view.env.air.sun;
    const at = post.sunAt.set(sun[0], sun[1], sun[2]).transformDirection(camera.matrixWorldInverse);
    if (at.z < -0.05) {
      const tangent = Math.tan((camera.fov * Math.PI) / 360);
      const x = at.x / -at.z / (tangent * camera.aspect);
      const y = at.y / -at.z / tangent;
      rays = shafts * Math.min(1, Math.max(0, (tune.shaftOff - Math.max(Math.abs(x), Math.abs(y))) / (tune.shaftOff - 1)));
      if (rays > 0) {
        post.shafts.uniforms.uSun.value.set(x * 0.5 + 0.5, y * 0.5 + 0.5, 1, camera.aspect);
        run(post.shafts, post.half, post.rays[0], 0, 0, 0, 0);
        run(post.blur, post.rays[0], post.rays[1], 1, 0, 0, 1);
      }
    }
  }

  const u = post.frame.uniforms;
  u.uBloom.value = levels[0].texture;
  u.uShafts.value = post.rays[1].texture;
  u.uTone.value.set(tone.exposure, tone.contrast, tone.sigma, tone.gain);
  u.uGrade.value.set(tone.saturation, tone.warmth, tune.bloom, tune.vignette);
  const tangent = Math.tan((camera.fov * Math.PI) / 360);
  u.uLens.value.set(tangent * camera.aspect, tangent, rays);
  run(post.frame, scene, null);
  return true;
}
