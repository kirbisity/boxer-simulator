// HDR post: the scene is drawn into a half-float multisampled render target
// so that the sun, its glints on steel and the lamps stay above 1.0, and a
// short chain of passes of its own (no three examples are loaded) makes the
// picture: a soft-knee bright pass, a dual-Kawase bloom at half to 1/16
// resolution, and one final full-screen pass that adds the bloom, exposes,
// tone-maps (ACES), grades (lift/gamma/gain, split tone, saturation),
// vignettes, adds a little grain and encodes sRGB. The sky is an analytic
// HDR dome (gradient, horizon haze, sun glow, a very bright sun disc) that is
// also baked once to a PMREM environment for the steel and the skin; indoor
// places bake a dark hall with bright panel lamps instead.
//
// Colour: the look is `linear` (authored colours decoded going in). While the
// chain draws, the renderer does no tone mapping and writes linear (the
// tone map and the sRGB curve are in the last pass). The small portrait
// renderer is drawn plainly, so `renderer` below gives it ACES and sRGB.
//
// Tunables: HDR_POST (below). Cost control: if frames run slow for a while
// the bloom chain is switched off for good (never back on, so no flicker).

import { defineLook, hidePaintedSky, own, replaceEnvironment, setRenderer, stateOf, OUTPUT_ENCODING, TONE_MAPPING } from './kit.js';

/* global THREE */

export const HDR_POST = {
  exposure: 1.0,
  bloomStrength: 0.42,
  bloomThreshold: 0.95,
  bloomKnee: 0.5,
  vignette: 0.28,
  grain: 0.018,
  saturation: 1.08,
  sunElevation: 0.62,
  sunDisc: 90,
  sunGlow: 1.0,
  samples: 4,
  slowMs: 26,
  slowFrames: 90,
};

const HDR_POST_SKY_GLSL = `
uniform vec3 uSun;
uniform float uMode;
uniform float uSunDisc;
uniform float uSunGlow;
varying vec3 vDir;
vec3 hdrPostSky(vec3 d) {
  float h = d.y;
  float t = clamp(h, 0.0, 1.0);
  vec3 zenith = vec3(0.045, 0.14, 0.50);
  vec3 horizon = vec3(0.56, 0.70, 0.86);
  vec3 col = mix(horizon, zenith, pow(t, 0.42));
  float mu = max(dot(d, uSun), 0.0);
  float band = exp(-abs(h) * 9.0);
  col += vec3(0.30, 0.22, 0.12) * band * pow(mu, 3.0) * uSunGlow;
  col += vec3(1.0, 0.78, 0.5) * (0.30 * pow(mu, 6.0) + 1.6 * pow(mu, 48.0) + 8.0 * pow(mu, 700.0)) * uSunGlow;
  float cosR = cos(0.022);
  col += vec3(1.0, 0.93, 0.8) * uSunDisc * smoothstep(cosR - 0.0004, cosR + 0.0004, mu);
  vec3 ground = vec3(0.13, 0.115, 0.095) + horizon * 0.10 * exp(-max(-h, 0.0) * 5.0);
  col = mix(col, mix(horizon, ground, uMode), smoothstep(0.0, -0.02, h));
  return col;
}
vec3 hdrPostHall(vec3 d) {
  float h = d.y;
  vec3 col = mix(vec3(0.020, 0.022, 0.032), vec3(0.006, 0.007, 0.012), clamp(h, 0.0, 1.0));
  col += vec3(0.05, 0.045, 0.04) * exp(-abs(h) * 6.0);
  if (h > 0.25) {
    vec2 p = d.xz / h;
    vec2 cell = abs(fract(p * 0.42 + 0.5) - 0.5);
    float panel = step(cell.x, 0.15) * step(cell.y, 0.07) * step(length(p), 5.5);
    col += vec3(1.0, 0.93, 0.80) * 30.0 * panel;
  }
  col += vec3(0.25, 0.4, 1.0) * 3.0 * smoothstep(0.85, 0.99, dot(d, normalize(vec3(-0.8, 0.25, -0.6))));
  col += vec3(1.0, 0.7, 0.4) * 2.0 * smoothstep(0.9, 0.99, dot(d, normalize(vec3(0.9, 0.2, 0.4))));
  return col;
}
`;

const hdrPostSkyMaterial = (hall, sun, mode = 0) =>
  new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sun.clone() }, uMode: { value: mode }, uSunDisc: { value: HDR_POST.sunDisc }, uSunGlow: { value: HDR_POST.sunGlow } },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        mat4 v = viewMatrix;
        v[3] = vec4(0.0, 0.0, 0.0, 1.0);
        gl_Position = projectionMatrix * v * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: `${HDR_POST_SKY_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        gl_FragColor = vec4(${hall ? 'hdrPostHall(d)' : 'hdrPostSky(d)'}, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });

/** An HDR PMREM environment of a sky material, baked once. */
function hdrPostBake(renderer, material) {
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  dome.frustumCulled = false;
  scene.add(dome);
  const cube = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, generateMipmaps: false });
  const camera = new THREE.CubeCamera(0.1, 10, cube);
  const toneMapping = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  camera.update(renderer, scene);
  renderer.toneMapping = toneMapping;
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromCubemap(cube.texture);
  generator.dispose();
  cube.dispose();
  dome.geometry.dispose();
  return target;
}

// ---- The post chain -----------------------------------------------------------

const HDR_POST_FULLSCREEN = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const hdrPostPass = (uniforms, fragment) =>
  new THREE.ShaderMaterial({ uniforms, vertexShader: HDR_POST_FULLSCREEN, fragmentShader: `varying vec2 vUv;\n${fragment}`, depthTest: false, depthWrite: false, toneMapped: false });

const HDR_POST_PREFILTER = `
uniform sampler2D tSource;
uniform vec2 uTexel;
uniform vec2 uCurve;
vec3 hdrPostKnee(vec3 c) {
  float b = max(max(c.r, c.g), c.b);
  float soft = clamp(b - uCurve.x + uCurve.y, 0.0, 2.0 * uCurve.y);
  soft = soft * soft / (4.0 * uCurve.y + 1e-4);
  float gain = max(soft, b - uCurve.x) / max(b, 1e-4);
  return c * gain;
}
void main() {
  vec3 c = vec3(0.0);
  c += hdrPostKnee(min(texture2D(tSource, vUv + uTexel * vec2(-1.0, -1.0)).rgb, vec3(64.0)));
  c += hdrPostKnee(min(texture2D(tSource, vUv + uTexel * vec2( 1.0, -1.0)).rgb, vec3(64.0)));
  c += hdrPostKnee(min(texture2D(tSource, vUv + uTexel * vec2(-1.0,  1.0)).rgb, vec3(64.0)));
  c += hdrPostKnee(min(texture2D(tSource, vUv + uTexel * vec2( 1.0,  1.0)).rgb, vec3(64.0)));
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

const HDR_POST_DOWN = `
uniform sampler2D tSource;
uniform vec2 uTexel;
void main() {
  vec3 c = texture2D(tSource, vUv).rgb * 4.0;
  c += texture2D(tSource, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tSource, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  c += texture2D(tSource, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  c += texture2D(tSource, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}`;

const HDR_POST_UP = `
uniform sampler2D tSource;
uniform sampler2D tAdd;
uniform vec2 uTexel;
void main() {
  vec3 c = vec3(0.0);
  c += texture2D(tSource, vUv + uTexel * vec2(-1.0, 0.0)).rgb;
  c += texture2D(tSource, vUv + uTexel * vec2( 1.0, 0.0)).rgb;
  c += texture2D(tSource, vUv + uTexel * vec2(0.0, -1.0)).rgb;
  c += texture2D(tSource, vUv + uTexel * vec2(0.0,  1.0)).rgb;
  c += texture2D(tSource, vUv + uTexel * vec2(-0.5, -0.5)).rgb * 2.0;
  c += texture2D(tSource, vUv + uTexel * vec2( 0.5, -0.5)).rgb * 2.0;
  c += texture2D(tSource, vUv + uTexel * vec2(-0.5,  0.5)).rgb * 2.0;
  c += texture2D(tSource, vUv + uTexel * vec2( 0.5,  0.5)).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0 + texture2D(tAdd, vUv).rgb, 1.0);
}`;

const HDR_POST_FINAL = `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uExposure;
uniform float uVignette;
uniform float uGrain;
uniform float uSaturation;
uniform float uSeed;
uniform vec2 uResolution;
vec3 hdrPostRRT(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 hdrPostAces(vec3 c) {
  const mat3 inMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 outMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c = inMat * (c / 0.6);
  c = hdrPostRRT(c);
  return clamp(outMat * c, 0.0, 1.0);
}
vec3 hdrPostSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hdrPostHash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}
void main() {
  vec3 c = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * uBloom;
  c = hdrPostAces(c * uExposure);
  // Grade: a touch of lift and gain, gentle contrast, cool shadows, warm highlights, saturation.
  c = pow(c, vec3(0.97));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= mix(vec3(0.95, 0.985, 1.05), vec3(1.0), smoothstep(0.0, 0.35, l));
  c *= mix(vec3(1.0), vec3(1.05, 1.015, 0.94), smoothstep(0.55, 1.0, l));
  l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  c = clamp(c, 0.0, 1.0);
  c = hdrPostSrgb(c);
  vec2 q = vUv - 0.5;
  c *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(q, q) * 2.2);
  c += (hdrPostHash(vUv * uResolution + uSeed) - 0.5) * uGrain;
  gl_FragColor = vec4(c, 1.0);
}`;

/** The chain's targets, passes and quad for a view (built on first frame and when the size changes). */
function hdrPostBuildChain(view, state) {
  const renderer = view.renderer;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const options = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
  const chain = (state.chain = { width: size.x, height: size.y, down: [], up: [] });
  const multisampled = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
  chain.scene = multisampled
    ? new THREE.WebGLMultisampleRenderTarget(size.x, size.y, { ...options, depthBuffer: true })
    : new THREE.WebGLRenderTarget(size.x, size.y, { ...options, type: THREE.UnsignedByteType, depthBuffer: true });
  if (multisampled) chain.scene.samples = HDR_POST.samples;
  own(view, chain.scene);
  for (let level = 1; level <= 4; level++) {
    const w = Math.max(2, Math.ceil(size.x / 2 ** level));
    const h = Math.max(2, Math.ceil(size.y / 2 ** level));
    chain.down.push(own(view, new THREE.WebGLRenderTarget(w, h, options)));
    if (level < 4) chain.up.push(own(view, new THREE.WebGLRenderTarget(w, h, options)));
  }
  return chain;
}

function hdrPostEnsure(view) {
  const state = stateOf(view, HDR_POST_LOOK.id);
  if (state.quad) return state;
  state.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  state.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  state.quad.frustumCulled = false;
  state.scene = new THREE.Scene();
  state.scene.add(state.quad);
  state.texel = new THREE.Vector2();
  state.resolution = new THREE.Vector2();
  const pass = (uniforms, fragment) => own(view, hdrPostPass(uniforms, fragment));
  const source = { value: null };
  state.passes = {
    prefilter: pass({ tSource: source, uTexel: { value: new THREE.Vector2() }, uCurve: { value: new THREE.Vector2() } }, HDR_POST_PREFILTER),
    down: pass({ tSource: { value: null }, uTexel: { value: new THREE.Vector2() } }, HDR_POST_DOWN),
    up: pass({ tSource: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } }, HDR_POST_UP),
    final: pass(
      {
        tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0 }, uExposure: { value: 1 }, uVignette: { value: 0 }, uGrain: { value: 0 },
        uSaturation: { value: 1 }, uSeed: { value: 0 }, uResolution: { value: new THREE.Vector2() },
      },
      HDR_POST_FINAL,
    ),
  };
  state.frames = 0;
  state.slow = 0;
  state.lastTime = 0;
  state.bloomOn = true;
  state.shoot = /[?&]shoot\b/.test(location.search);
  return state;
}

function hdrPostRun(state, renderer, material, target) {
  state.quad.material = material;
  renderer.setRenderTarget(target);
  renderer.render(state.scene, state.camera);
}

/** Frame cost: a moving count of slow frames; past the limit the bloom chain is off for good (the harness never degrades). */
function hdrPostWatch(state) {
  const now = performance.now();
  const gap = now - state.lastTime;
  state.lastTime = now;
  if (state.shoot || !state.bloomOn || gap > 250) return;
  state.slow = gap > HDR_POST.slowMs ? state.slow + 1 : Math.max(0, state.slow - 2);
  if (state.slow > HDR_POST.slowFrames) state.bloomOn = false;
}

function hdrPostRenderFrame(view) {
  const state = hdrPostEnsure(view);
  const renderer = view.renderer;
  const size = renderer.getDrawingBufferSize(state.resolution);
  if (!state.chain || state.chain.width !== size.x || state.chain.height !== size.y) {
    if (state.chain) {
      state.chain.scene.dispose();
      for (const target of [...state.chain.down, ...state.chain.up]) target.dispose();
    }
    hdrPostBuildChain(view, state);
  }
  hdrPostWatch(state);
  const { chain, passes } = state;
  state.frames += 1;
  const autoClear = renderer.autoClear;
  renderer.setRenderTarget(chain.scene);
  renderer.clear();
  renderer.render(view.scene, view.camera);
  const bloom = state.bloomOn && HDR_POST.bloomStrength > 0;
  if (bloom) {
    passes.prefilter.uniforms.tSource.value = chain.scene.texture;
    passes.prefilter.uniforms.uTexel.value.set(1 / size.x, 1 / size.y);
    passes.prefilter.uniforms.uCurve.value.set(HDR_POST.bloomThreshold, HDR_POST.bloomKnee * HDR_POST.bloomThreshold);
    hdrPostRun(state, renderer, passes.prefilter, chain.down[0]);
    for (let level = 1; level < 4; level++) {
      const from = chain.down[level - 1];
      passes.down.uniforms.tSource.value = from.texture;
      passes.down.uniforms.uTexel.value.set(1 / from.width, 1 / from.height);
      hdrPostRun(state, renderer, passes.down, chain.down[level]);
    }
    let carried = chain.down[3];
    for (let level = 2; level >= 0; level--) {
      passes.up.uniforms.tSource.value = carried.texture;
      passes.up.uniforms.tAdd.value = chain.down[level].texture;
      passes.up.uniforms.uTexel.value.set(1 / carried.width, 1 / carried.height);
      carried = chain.up[level];
      hdrPostRun(state, renderer, passes.up, carried);
    }
    passes.final.uniforms.tBloom.value = carried.texture;
  }
  const uniforms = passes.final.uniforms;
  uniforms.tScene.value = chain.scene.texture;
  if (!bloom) uniforms.tBloom.value = chain.scene.texture;
  uniforms.uBloom.value = bloom ? HDR_POST.bloomStrength : 0;
  uniforms.uExposure.value = HDR_POST.exposure * (view.hdrPostExposure ?? 1);
  uniforms.uVignette.value = HDR_POST.vignette;
  uniforms.uGrain.value = HDR_POST.grain;
  uniforms.uSaturation.value = HDR_POST.saturation;
  uniforms.uSeed.value = state.shoot ? 0 : (state.frames % 97) * 1.37;
  uniforms.uResolution.value.copy(size);
  hdrPostRun(state, renderer, passes.final, null);
  renderer.autoClear = autoClear;
}

// ---- The place: sky, environment, light ---------------------------------------

let hdrPostSunDirection = null;

function hdrPostEnvironment(view, state, key, material) {
  const cache = (state.environments ??= {});
  if (!cache[key]) cache[key] = own(view, hdrPostBake(view.renderer, material));
  return cache[key].texture;
}

function hdrPostApply(view, place) {
  const state = hdrPostEnsure(view);
  const { renderer, scene, lights } = view;
  const light = view.light;
  const outdoor = Boolean(light.sun);
  hdrPostSunDirection ??= new THREE.Vector3();
  // The chain tone-maps and encodes itself.
  setRenderer(view, { toneMapping: TONE_MAPPING.none, outputEncoding: OUTPUT_ENCODING.linear, toneMappingExposure: 1 });
  view.hdrPostExposure = outdoor ? 1.0 : 1.0;

  if (outdoor) {
    // A lower sun than the toon rig so the shadows lie along the ground and the disc is in the sky.
    const length = lights.sun.position.length();
    const e = HDR_POST.sunElevation;
    lights.sun.position.set(Math.cos(e) * 0.83 * length, Math.sin(e) * length, Math.cos(e) * 0.55 * length);
    hdrPostSunDirection.copy(lights.sun.position).normalize();
    lights.sun.intensity = (light.sun ?? 1) * 1.05;
    lights.hemi.intensity = 0.14;
    lights.rim.intensity *= 0.5;
  } else {
    lights.hemi.intensity = Math.min(lights.hemi.intensity, 0.3);
  }

  const key = outdoor ? 'day' : 'hall';
  let environment = state.environments?.[key]?.texture;
  if (!environment) {
    const material = hdrPostSkyMaterial(!outdoor, outdoor ? hdrPostSunDirection : new THREE.Vector3(0, 1, 0), 1);
    environment = hdrPostEnvironment(view, state, key, material);
    material.dispose();
  }
  scene.environment = environment;
  replaceEnvironment(view, environment);

  if (outdoor) {
    hidePaintedSky(view);
    if (!state.sky || !state.sky.parent) {
      state.sky = own(view, new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), hdrPostSkyMaterial(false, hdrPostSunDirection)));
      state.sky.frustumCulled = false;
      state.sky.renderOrder = -1000;
    }
    state.sky.visible = true;
    state.sky.material.uniforms.uSun.value.copy(hdrPostSunDirection);
    scene.background = new THREE.Color(0.56, 0.70, 0.86);
    // Fog is the haze at the horizon (linear light).
    scene.fog.color.setRGB(0.56, 0.70, 0.86);
  } else {
    if (state.sky) state.sky.visible = false;
    scene.background = new THREE.Color(light.background).convertSRGBToLinear();
  }
}

export const HDR_POST_LOOK = defineLook({
  id: 'hdr-post',
  label: 'HDR post',
  blurb: 'Half-float multisampled target, analytic HDR sky baked to the steel, dual-Kawase bloom, one final pass of ACES, grade, vignette and grain.',
  style: 'soft',
  linear: true,
  outlines: false,
  renderer: { toneMapping: TONE_MAPPING.aces, toneMappingExposure: 1, outputEncoding: OUTPUT_ENCODING.srgb },
  apply: hdrPostApply,
  renderFrame: hdrPostRenderFrame,
  dispose(view) {
    delete (view.lookState ?? {})[HDR_POST_LOOK.id];
  },
});
