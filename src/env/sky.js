// The sky of an open-air place (src/env/): a dome that follows the camera and draws the sky table (air.js), the
// sun's disc and glare, one sheet of cloud drifting on the wind aloft and lit from the sun's side, and the ground
// haze looked up through. The same cloud sheet shades the land (air.js envSunShare), so a shadow on the hills has
// its cloud in the sky.

/* global THREE */

import { ENV } from './config.js';
import { ENV_GLSL, envUniforms } from './air.js';

const ENV_SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // On the far plane: the dome is behind everything whatever its radius.
  gl_Position = clip.xyww;
}`;

const ENV_SKY_FRAGMENT = /* glsl */ `
${ENV_GLSL}
varying vec3 vDir;

void main() {
  vec3 dir = normalize(vDir);
  vec3 colour = envSky(dir);
  float toSun = dot(dir, uEnvSunDir);
  float up = max(dir.y, 0.0);
  vec3 sunTint = uEnvSunColour / max(max(uEnvSunColour.r, uEnvSunColour.g), max(uEnvSunColour.b, 0.05));
  float sunPower = clamp(max(uEnvSunColour.r, uEnvSunColour.g), 0.0, 1.2);

  // The cloud sheet: where the sight line meets it (the 0.05 bends the sheet down a little at the horizon, as the earth does).
  float density = 0.0;
  vec3 cloud = vec3(0.0);
  if (dir.y > 0.0) {
    vec2 sheet = (cameraPosition.xz + dir.xz / (up + 0.05) * uEnvCloud.w) * uEnvCloud.z - uEnvCloudTravel;
    density = envCloud(sheet);
    // Its depth toward the sun shades it: thick cloud between here and the sun is dark, an edge facing the sun bright.
    vec2 sunward = normalize(uEnvSunDir.xz + vec2(1e-4, 0.0)) * ${ENV.clouds.selfShadow.toFixed(3)};
    float behind = envCloud(sheet + sunward);
    float beyond = envCloud(sheet + sunward * 2.6);
    float lit = clamp(1.0 - 0.55 * behind - 0.35 * beyond, 0.0, 1.0);
    // The grain of the cloud itself.
    float grain = texture2D(uEnvNoise, sheet * 1.9).a;
    lit *= 0.82 + 0.36 * grain;
    cloud = mix(uEnvCloudDark, uEnvCloudLit, lit);
    // Thin cloud near the sun glows with it (forward scattering): the silver lining.
    float lining = pow(max(toSun, 0.0), 24.0) * (1.0 - density * 0.7);
    cloud += sunTint * sunPower * lining * 0.9;
    density *= smoothstep(0.0, ${ENV.clouds.horizonFade.toFixed(3)}, up);
  }

  // The sun: its disc and the glare round it, behind the cloud.
  float disc = smoothstep(cos(${(ENV.sky.discRadius * 1.25).toFixed(5)}), cos(${ENV.sky.discRadius.toFixed(5)}), toSun);
  float glare = ${ENV.sky.glowGain.toFixed(3)} * pow(max(toSun, 0.0), 900.0) + 0.12 * pow(max(toSun, 0.0), 90.0);
  vec3 sun = sunTint * sunPower * (disc * ${ENV.sky.discGain.toFixed(1)} + glare);
  colour += sun * (1.0 - density) * step(0.0, dir.y + 0.01);

  colour = mix(colour, cloud, density);

  // The ground haze looked up through: all of it along the horizon, little of it overhead.
  float column = uEnvRayleigh.a / uEnvHaze.w * exp(-max(cameraPosition.y, 0.0) * uEnvHaze.w) / max(dir.y, 0.004);
  colour = mix(envAirlight(dir), colour, dir.y > 0.0 ? exp(-column) : 0.0);

  gl_FragColor = vec4(colour, 1.0);
  #include <tonemapping_fragment>
  // A grain of half a display step: the table is 8 bits and a clear sky would band without it.
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  gl_FragColor.rgb += dither / 255.0;
}`;

/** The dome (one mesh). It carries itself to the camera each frame. */
export function envBuildSky() {
  const material = new THREE.ShaderMaterial({
    vertexShader: ENV_SKY_VERTEX,
    fragmentShader: ENV_SKY_FRAGMENT,
    uniforms: envUniforms(),
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  dome.userData.env = 'sky';
  dome.onBeforeRender = (renderer, scene, camera) => {
    camera.getWorldPosition(dome.position);
    dome.parent?.worldToLocal(dome.position);
    dome.updateMatrixWorld();
  };
  return dome;
}
