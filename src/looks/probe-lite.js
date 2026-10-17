// Probe lite: the budget realistic look. Cheap shading lit by a spherical-
// harmonics light probe. A procedural sky is described once as a function of
// direction; from that one function we get (1) a sky-dome shader, (2) a small
// cube map (steel reflects it, its mips blur it for rough metal), and (3) nine
// SH coefficients (a THREE.LightProbe) for soft sky-coloured ambient from every
// direction. One sun DirectionalLight with one shadow map; skin and cloth are
// MeshLambert, steel is MeshStandard on the baked cube. No composer, no
// outlines, no tone mapping, no PMREM, no scripts: the colour pipeline stays
// authored-sRGB exactly like toon, so nothing is decoded and nothing is added
// to the download but this file.

/* global THREE */
import { defineLook, hidePaintedSky, own, replaceEnvironment, setRenderer, setShadowMapSize, stateOf, SHADOW_MAP } from './kit.js';

const PROBE_LITE_ID = 'probe-lite';

/** The tunables. Colours are authored (display) values, as everywhere else in the game. */
export const PROBE_LITE_TUNE = {
  cubeSize: 128,
  shadowSize: 1024,
  sunDirection: [0.62, 0.62, 0.48],
  probeIntensity: 1.0,
  hallProbeIntensity: 1.0,
  steelEnvIntensity: 1.15,
  steelRoughnessAdd: 0,
  sunGain: 1.0,
};

// The kinds of sky. horizon doubles as the fog colour.
const PROBE_LITE_SKIES = {
  day: { zenith: [0.2, 0.42, 0.82], horizon: [0.8, 0.88, 0.96], haze: [0.96, 0.93, 0.86], sunColour: [1, 0.93, 0.78], ground: [0.3, 0.27, 0.2], groundHaze: false },
  night: { zenith: [0.02, 0.04, 0.1], horizon: [0.07, 0.1, 0.19], haze: [0.1, 0.13, 0.24], sunColour: [0.55, 0.65, 1], ground: [0.03, 0.04, 0.06], groundHaze: false },
};

const probeLiteSmooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const probeLiteMix = (a, b, t) => a + (b - a) * t;

/** Sky radiance (display values) in direction (x, y, z), unit. Mirrors the dome's fragment shader. */
function probeLiteSky(sky, x, y, z, sun, withSun, out) {
  const up = Math.pow(Math.max(y, 0), 0.5);
  const glow = Math.exp(-Math.max(y, 0) * 9) * 0.6;
  const s = Math.max(x * sun[0] + y * sun[1] + z * sun[2], 0);
  const s5 = s * s * s * s * s;
  const s40 = Math.pow(s, 40);
  const disc = withSun ? probeLiteSmooth(0.9993, 0.9997, s) * 3 : 0;
  const below = probeLiteSmooth(0, sky.groundHaze ? 0.05 : 0.12, -y);
  for (let c = 0; c < 3; c++) {
    let v = probeLiteMix(sky.horizon[c], sky.zenith[c], up);
    v = probeLiteMix(v, sky.haze[c], glow);
    v += sky.sunColour[c] * (0.22 * s5 + 0.35 * s40 + disc);
    const ground = sky.groundHaze ? sky.horizon[c] : sky.ground[c];
    out[c] = probeLiteMix(v, ground, below);
  }
  return out;
}

// ---- the indoor "sky": a dark hall with warm panels overhead ------------------

function probeLiteHall(light, x, y, z, out) {
  const bg = light.hallBase;
  const panel = Math.max(0, y - 0.45) / 0.55;
  const warm = Math.pow(panel, 2.5);
  // A ring of dim lights around at about 35 degrees, so steel has something to show on its sides.
  const ringLights = Math.exp(-Math.pow((y - 0.35) * 6, 2)) * (0.5 + 0.5 * Math.cos(Math.atan2(z, x) * 4));
  const floor = probeLiteSmooth(0, 0.3, -y);
  for (let c = 0; c < 3; c++) {
    let v = bg[c] + light.panel[c] * warm + light.panel[c] * 0.35 * ringLights;
    // Below: a lit canvas throws the lamps' light back up; a hall floor without one is dark.
    v = probeLiteMix(v, light.bounce ? light.bounce[c] : bg[c] * 0.4, floor);
    out[c] = v;
  }
  return out;
}

// ---- baking -----------------------------------------------------------------

const PROBE_LITE_FACES = [
  (u, v) => [1, -v, -u], (u, v) => [-1, -v, u], (u, v) => [u, 1, v],
  (u, v) => [u, -1, -v], (u, v) => [u, -v, 1], (u, v) => [-u, -v, -1],
];

/** Fill a cube from a radiance function of the unit world direction (GL face convention; three flips x). */
function probeLiteBakeCube(size, radiance) {
  const images = [];
  const rgb = [0, 0, 0];
  for (const face of PROBE_LITE_FACES) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    const data = g.createImageData(size, size);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const [gx, gy, gz] = face(((i + 0.5) / size) * 2 - 1, ((j + 0.5) / size) * 2 - 1);
        const len = Math.hypot(gx, gy, gz);
        radiance(-gx / len, gy / len, gz / len, rgb);
        const k = (j * size + i) * 4;
        data.data[k] = Math.min(255, rgb[0] * 255);
        data.data[k + 1] = Math.min(255, rgb[1] * 255);
        data.data[k + 2] = Math.min(255, rgb[2] * 255);
        data.data[k + 3] = 255;
      }
    }
    g.putImageData(data, 0, 0);
    images.push(canvas);
  }
  const cube = new THREE.CubeTexture(images);
  cube.generateMipmaps = true;
  cube.minFilter = THREE.LinearMipmapLinearFilter;
  cube.needsUpdate = true;
  return cube;
}

/** Project a radiance function onto the nine SH coefficients of a LightProbe. */
function probeLiteProject(sh, radiance) {
  const rgb = [0, 0, 0];
  const nTheta = 12;
  const nPhi = 24;
  const basis = new Array(9);
  for (const c of sh.coefficients) c.set(0, 0, 0);
  for (let a = 0; a < nTheta; a++) {
    const theta = ((a + 0.5) / nTheta) * Math.PI;
    const weight = (Math.sin(theta) * (Math.PI / nTheta) * (2 * Math.PI)) / nPhi;
    for (let b = 0; b < nPhi; b++) {
      const phi = ((b + 0.5) / nPhi) * 2 * Math.PI;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.sin(phi);
      radiance(x, y, z, rgb);
      basis[0] = 0.282095;
      basis[1] = 0.488603 * y;
      basis[2] = 0.488603 * z;
      basis[3] = 0.488603 * x;
      basis[4] = 1.092548 * x * y;
      basis[5] = 1.092548 * y * z;
      basis[6] = 0.315392 * (3 * z * z - 1);
      basis[7] = 1.092548 * x * z;
      basis[8] = 0.546274 * (x * x - y * y);
      for (let k = 0; k < 9; k++) sh.coefficients[k].x += rgb[0] * basis[k] * weight;
      for (let k = 0; k < 9; k++) sh.coefficients[k].y += rgb[1] * basis[k] * weight;
      for (let k = 0; k < 9; k++) sh.coefficients[k].z += rgb[2] * basis[k] * weight;
    }
  }
}

// ---- the dome ---------------------------------------------------------------

const PROBE_LITE_DOME_VERTEX = `
varying vec3 vDir;
void main() {
  vDir = normalize( position );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

const PROBE_LITE_DOME_FRAGMENT = `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uHaze; uniform vec3 uSunColour; uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize( vDir );
  float up = pow( max( d.y, 0.0 ), 0.5 );
  float glow = exp( -max( d.y, 0.0 ) * 9.0 ) * 0.6;
  float s = max( dot( d, uSunDir ), 0.0 );
  float s2 = s * s;
  float s5 = s2 * s2 * s;
  float s40 = pow( s, 40.0 );
  float disc = smoothstep( 0.9993, 0.9997, s ) * 3.0;
  vec3 v = mix( uHorizon, uZenith, up );
  v = mix( v, uHaze, glow );
  v += uSunColour * ( 0.22 * s5 + 0.35 * s40 + disc );
  v = mix( v, uHorizon, smoothstep( 0.0, 0.05, -d.y ) );
  gl_FragColor = vec4( v, 1.0 );
}`;

function probeLiteMakeDome(sky, sunDir) {
  const material = new THREE.ShaderMaterial({
    vertexShader: PROBE_LITE_DOME_VERTEX,
    fragmentShader: PROBE_LITE_DOME_FRAGMENT,
    uniforms: {
      uZenith: { value: new THREE.Vector3() }, uHorizon: { value: new THREE.Vector3() }, uHaze: { value: new THREE.Vector3() },
      uSunColour: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3() },
    },
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16), material);
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  dome.onBeforeRender = (renderer, scene, camera) => dome.position.copy(camera.position);
  dome.userData.probeLiteDome = true;
  return dome;
}

function probeLiteSetDome(dome, sky, sunDir) {
  const u = dome.material.uniforms;
  u.uZenith.value.fromArray(sky.zenith);
  u.uHorizon.value.fromArray(sky.horizon);
  u.uHaze.value.fromArray(sky.haze);
  u.uSunColour.value.fromArray(sky.sunColour);
  u.uSunDir.value.copy(sunDir);
}

// ---- the look ---------------------------------------------------------------

const PROBE_LITE_PLACES = {
  night: ['port'],
  hall: ['ring', 'subway', 'stadium'],
};
const probeLiteKind = (place) => (PROBE_LITE_PLACES.night.includes(place) ? 'night' : PROBE_LITE_PLACES.hall.includes(place) ? 'hall' : 'day');

// Indoor lighting description per hall place: base ambient, the warm panels,
// and keyGain on the overhead key. A fight-night ring sits under a bank of
// lamps far brighter than the hall around it, so the stage is lit to read
// at least as well as toon's (toon has a hemisphere fill and a rim this look
// switches off); the hall around it stays dark. bounce is the light the
// lit canvas throws back up from below (its pale grey-blue times the lamps):
// it fills chins, undersides and the shadowed side, as a real ring's floor does.
const PROBE_LITE_HALLS = {
  ring: { hallBase: [0.07, 0.08, 0.12], panel: [1.0, 0.9, 0.72], probe: 1.0, keyGain: 1.6, bounce: [0.42, 0.41, 0.37] },
  stadium: { hallBase: [0.05, 0.06, 0.1], panel: [1.0, 0.97, 0.9], probe: 0.9, keyGain: 1.5, bounce: [0.46, 0.47, 0.48] },
  // A subway platform under fluorescent tubes behind yellowed diffusers (about 3200 K): warm yellow panels, a touch
  // of green in the dark from the old tile, the grimy concrete throwing back a little dull warm light.
  subway: { hallBase: [0.085, 0.08, 0.05], panel: [1.0, 0.88, 0.62], probe: 0.62, keyGain: 1.15, bounce: [0.17, 0.15, 0.1] },
};

function probeLiteBuild(st, place, view) {
  st.baked ??= {};
  const kind = probeLiteKind(place);
  const key = kind === 'hall' ? place : kind;
  if (st.baked[key]) return st.baked[key];
  const tune = PROBE_LITE_TUNE;
  const sun = new THREE.Vector3(...tune.sunDirection).normalize();
  const sunArr = [sun.x, sun.y, sun.z];
  let cube;
  const probe = new THREE.LightProbe();
  if (kind === 'hall') {
    const hall = PROBE_LITE_HALLS[place];
    cube = probeLiteBakeCube(tune.cubeSize, (x, y, z, out) => probeLiteHall(hall, x, y, z, out));
    probeLiteProject(probe.sh, (x, y, z, out) => probeLiteHall(hall, x, y, z, out));
    probe.intensity = hall.probe * tune.hallProbeIntensity;
  } else {
    // The sky colours follow the place's own horizon (its fog/background), so each place keeps its weather.
    const base = PROBE_LITE_SKIES[kind];
    const bg = new THREE.Color(view.light.background);
    const sky = { ...base, horizon: kind === 'night' ? base.horizon : [bg.r, bg.g, bg.b] };
    st.skies ??= {};
    st.skies[key] = sky;
    cube = probeLiteBakeCube(tune.cubeSize, (x, y, z, out) => probeLiteSky(sky, x, y, z, sunArr, true, out));
    // The ambient has no sun disc in it: the sun is its own light. Ground bounce comes from the sky function's ground.
    probeLiteProject(probe.sh, (x, y, z, out) => probeLiteSky(sky, x, y, z, sunArr, false, out));
    probe.intensity = tune.probeIntensity;
  }
  const record = { kind, cube, probe, sun };
  st.baked[key] = record;
  return record;
}

export const PROBE_LITE_LOOK = defineLook({
  id: PROBE_LITE_ID,
  label: 'Realistic (default)',
  blurb: 'Budget realistic: a light probe from a procedural sky, one sun with one shadow map, Lambert skin and cloth, steel on a baked sky cube. Cheaper than toon: no outlines, no post, no extra scripts.',
  style: 'soft',
  outlines: false,
  linear: false,
  renderer: { toneMapping: 0, toneMappingExposure: 1, shadowMapType: SHADOW_MAP.pcf },

  apply(view, place) {
    const st = stateOf(view, PROBE_LITE_ID);
    const record = probeLiteBuild(st, place, view);
    const { lights } = view;
    for (const light of Object.values(lights)) light.visible = true;

    // The probe lights everything; swap it for the last place's.
    if (st.probe) view.scene.remove(st.probe);
    st.probe = record.probe;
    view.scene.add(record.probe);
    lights.hemi.visible = false;

    replaceEnvironment(view, record.cube);
    for (const place3 of Object.values(view.places)) place3?.traverse((object) => {
      if (object.material?.userData?.reflects && object.material.envMap) object.material.envMap = record.cube;
    });

    if (record.kind === 'hall') {
      lights.key.intensity *= PROBE_LITE_HALLS[place].keyGain ?? 1;
      lights.sun.visible = false;
      lights.rim.visible = false;
      setShadowMapSize(lights.key, PROBE_LITE_TUNE.shadowSize);
      setRenderer(view, { shadowMapType: SHADOW_MAP.pcf });
      if (st.dome) st.dome.visible = false;
      return;
    }

    // Open air: the dome, the haze, the sun.
    hidePaintedSky(view);
    const sky = st.skies[record.kind === 'night' ? 'night' : 'day'];
    if (!st.dome) {
      st.dome = own(view, probeLiteMakeDome(sky, record.sun));
    }
    st.dome.visible = true;
    probeLiteSetDome(st.dome, sky, record.sun);
    view.scene.background = new THREE.Color().fromArray(sky.horizon);
    view.scene.fog.color.fromArray(sky.horizon);
    lights.key.visible = record.kind === 'night';
    lights.rim.visible = false;
    if (record.kind === 'night') {
      lights.sun.visible = false;
      setShadowMapSize(lights.key, PROBE_LITE_TUNE.shadowSize);
      return;
    }
    lights.sun.visible = true;
    lights.sun.intensity *= PROBE_LITE_TUNE.sunGain;
    lights.sun.color.fromArray(sky.sunColour);
    lights.sun.position.copy(record.sun).multiplyScalar(14);
    lights.sun.target.position.set(0, 0, 0);
    setShadowMapSize(lights.sun, PROBE_LITE_TUNE.shadowSize);
  },

  surface(color, { skinning, vertexColors, opacity }) {
    return new THREE.MeshLambertMaterial({ color, skinning, vertexColors, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  },

  steel(envMap, options) {
    const tune = PROBE_LITE_TUNE;
    const roughness = Math.min(1, (options.roughness ?? 0.4) + tune.steelRoughnessAdd);
    return new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, metalness: 0.9, ...options, roughness, envMap, envMapIntensity: tune.steelEnvIntensity });
  },

  dispose(view) {
    view.scene.remove(stateOf(view, PROBE_LITE_ID).probe ?? new THREE.Object3D());
    delete view.lookState[PROBE_LITE_ID];
    for (const light of Object.values(view.lights)) light.visible = true;
  },
});
