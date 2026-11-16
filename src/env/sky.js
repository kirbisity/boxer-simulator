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

// The cloud sheet where the sight line meets it, lift (0..1) of the clouds' depth above their base: rgb its
// colour, a its cover. (The 0.05 bends the sheet down a little at the horizon, as the earth does.)
vec4 envSkyCloud(vec3 dir, float lift) {
  vec2 sheet = (cameraPosition.xz + dir.xz / (max(dir.y, 0.0) + 0.05) * (uEnvCloud.w + lift * ${ENV.clouds.deep.toFixed(1)})) * uEnvCloud.z - uEnvCloudTravel;
  // Near overhead a pixel spans a few metres of cloud, and the noise's finest lumps (some 50 m at the sheet's
  // scale) were drawn blown up into a soft grain. There the cloud is given the next, finer lumps of the same noise
  // (ENV.clouds.nearDetail), faded in as the sheet comes nearer than \`nearFrom\` m: a cumulus's edge has lumps on
  // lumps down to tens of metres, and from below it is sharp-edged, not a blur.
  float away = (uEnvCloud.w + lift * ${ENV.clouds.deep.toFixed(1)}) / (max(dir.y, 0.0) + 0.05);
  float near = 1.0 - smoothstep(${(ENV.clouds.nearFrom * 0.5).toFixed(1)}, ${ENV.clouds.nearFrom.toFixed(1)}, away);
  float finer = texture2D(uEnvNoise, sheet * ${ENV.clouds.nearDetail[0].toFixed(2)} + vec2(0.53, 0.19)).a;
  float depth = envCloudDepth(sheet) + near * (finer - 0.5) * uEnvCloudForm.x * ${ENV.clouds.nearDetail[1].toFixed(2)} - lift * ${ENV.clouds.taper.toFixed(3)};
  // A cloud is seen from below: where it is thick the sun does not come through and the base is dark, and its
  // thin edges are bright. The side toward the sun is brighter again: less cloud that way to shade it. Above the
  // base it is the cloud's flank that is seen, in the sun but for the cloud between, and only as far as it is the
  // sunlit side that faces the eye: the lit share of a lump's face goes as the moon's does with its phase, all
  // of it with the sun behind the eye and none looking into the sun, where a cloud is dark with a bright rim.
  float phase = smoothstep(0.0, 0.8, 0.5 - 0.5 * dot(dir, uEnvSunDir));
  vec2 sunward = normalize(uEnvSunDir.xz + vec2(1e-4, 0.0)) * ${ENV.clouds.selfShadow.toFixed(3)};
  float behind = envCloud(sheet + sunward);
  float beyond = envCloud(sheet + sunward * 2.6);
  float thick = smoothstep(0.02, uEnvCloudForm.y, depth) * (1.0 - lift * phase);
  float lit = (1.0 - thick) * (1.0 - 0.3 * behind) + 0.3 * (1.0 - behind) * (1.0 - 0.6 * beyond);
  // The grain of the cloud itself.
  lit = clamp(lit * (1.0 + 1.25 * uEnvCloudForm.x * (texture2D(uEnvNoise, sheet * 1.9).a - 0.5 + near * (finer - 0.5))), 0.0, 1.0);
  return vec4(mix(uEnvCloudDark, uEnvCloudLit, lit), smoothstep(-0.07 * uEnvCloudForm.z, 0.11 * uEnvCloudForm.z, depth));
}

void main() {
  vec3 dir = normalize(vDir);
  vec3 colour = envSky(dir);
  float toSun = dot(dir, uEnvSunDir);
  float up = max(dir.y, 0.0);
  vec3 sunTint = uEnvSunColour / max(max(uEnvSunColour.r, uEnvSunColour.g), max(uEnvSunColour.b, 0.05));
  float sunPower = clamp(max(uEnvSunColour.r, uEnvSunColour.g), 0.0, 1.2);

  // The clouds have depth: the sheet is met at its base and again at levels above it, where a cloud is narrower
  // and in the sun, so past each grey base the lit flank of the cloud behind it stands up.
  float density = 0.0;
  vec3 cloud = vec3(0.0);
  if (dir.y > 0.0) {
    for (int i = ${ENV.clouds.levels - 1}; i >= 0; i--) {
      vec4 level = envSkyCloud(dir, float(i) / ${(ENV.clouds.levels - 1).toFixed(1)});
      cloud = mix(cloud, level.rgb, level.a);
      density = mix(density, 1.0, level.a);
    }
    // Thin cloud near the sun glows with it (forward scattering): the silver lining.
    float lining = pow(max(toSun, 0.0), 24.0) * (1.0 - density * 0.7);
    cloud += sunTint * sunPower * lining * 0.9;
    density *= smoothstep(0.0, ${ENV.clouds.horizonFade.toFixed(3)}, up);
  }

  // The sun: its disc and the glare round it, behind the cloud.
  float disc = smoothstep(cos(${(ENV.sky.discRadius * 1.25).toFixed(5)}), cos(${ENV.sky.discRadius.toFixed(5)}), toSun);
  float glare = ${ENV.sky.glowGain.toFixed(3)} * pow(max(toSun, 0.0), 900.0) + 0.12 * pow(max(toSun, 0.0), 90.0) + uEnvGlare.x * pow(max(toSun, 0.0), uEnvGlare.y);
  vec3 sun = sunTint * sunPower * (disc * ${ENV.sky.discGain.toFixed(1)} + glare);
  colour += sun * (1.0 - density) * step(0.0, dir.y + 0.01);

  colour = mix(colour, cloud, density);

  // The ground haze looked up through: all of it along the horizon, little of it overhead.
  float column = uEnvRayleigh.a / uEnvHaze.w * exp(-max(cameraPosition.y, 0.0) * uEnvHaze.w) / max(dir.y, 0.004);
  // Its light is the sun's scattered in it, so it is dim where cloud or crowns stand between it and the sun: the
  // share of it in the sun is taken along the sight line as the land's haze takes it (air.js), at steps even in
  // what each adds (not jittered: over the sky's width a grain shows, and cloud shade is too broad to band). The
  // haze thins with height, so a depth t of the column lies -ln(1 - t / column) scale heights up; over the cloud
  // sheet nothing shades it.
  float share = uEnvShade.w;
  if (share < 0.0 && dir.y > 0.0) {
    float gone = 1.0 - exp(-column);
    float rise = max(dir.y, 0.004) * uEnvHaze.w;
    share = 0.0;
    for (int i = 0; i < 4; i++) {
      float depth = -log(1.0 - (float(i) + 0.5) * 0.25 * gone);
      vec3 point = cameraPosition + dir * (-log(max(1.0 - depth / column, 1e-4)) / rise);
      share += point.y < uEnvCloud.w ? envAirSun(point) * 0.25 : 0.25;
    }
  }
  colour = mix(envAirlightIn(dir, max(share, 0.0)), colour, dir.y > 0.0 ? exp(-column) : 0.0);

  gl_FragColor = vec4(colour, 1.0);
  #include <tonemapping_fragment>
  // A grain of half a display step: the table is 8 bits and a clear sky would band without it.
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  gl_FragColor.rgb += dither * ${(ENV.sky.most / 255).toFixed(5)};
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
