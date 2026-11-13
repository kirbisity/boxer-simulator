// The place's wind in what it moves on screen: a standard's cloth flutters and the grass of an open field bows and
// sways, both with the same air the flames lean in (wind.js: the place's wind, gusting over the fight's time). One pair of
// shader uniforms is shared by every such material, set once a frame (updateClothWind); nothing here touches the physics.
//
// A flag in wind flaps as a travelling wave from the staff to the fly, faster and higher the stronger the air (flag
// flutter frequency rises about linearly with wind speed: Taneda 1968, ~1.5 Hz at 5 m/s for a flag of half a metre).
// Grass bows downwind by its height squared (a stalk bends like a cantilever) and waves as the gusts pass over it.

/* global THREE */

import { placeWind, windNow } from './wind.js';

export const CLOTH_WIND = {
  // Cloth: the flap's frequency (Hz) per m/s of wind, its wavelength (m), and its height (m at the fly) at `fullAt` m/s and above.
  flutterHz: 0.3,
  wavelength: 0.45,
  amplitude: 0.07,
  fullAt: 9,
  // Grass: its bow downwind (m at the tip of a 0.4 m stalk) at `fullAt` m/s, and the sway on top of it as a share of that.
  bow: 0.12,
  sway: 0.5,
  // The gusts' wave travels across the field this fast (m/s per m/s of wind) and is this long (m).
  gustPace: 0.6,
  gustLength: 9,
};

// Shared by every waving material: the time (s), the wind's way (x, z) and its strength (0..1 of `fullAt`).
const CLOTH_WIND_UNIFORMS = { uWindTime: { value: 0 }, uWindWay: { value: null }, uWindStrength: { value: 0 } };

const clothWindWay = () => (CLOTH_WIND_UNIFORMS.uWindWay.value ??= new THREE.Vector2(1, 0));

/** Set the air for this frame from the view's place and weather at the fight's time. */
export function updateClothWind(view, world) {
  if (!view.clothWindBase || view.clothWindFor !== view.place || view.clothWindWeather !== (view.weather ?? null)) {
    view.clothWindBase = placeWind(view.place, view.weather ?? null);
    view.clothWindFor = view.place;
    view.clothWindWeather = view.weather ?? null;
  }
  const wind = windNow(view.clothWindBase, world?.time ?? 0, (view.clothWindNow ??= { x: 0, z: 0, speed: 0 }));
  const way = clothWindWay();
  if (wind.speed > 1e-3) way.set(wind.x / wind.speed, wind.z / wind.speed);
  CLOTH_WIND_UNIFORMS.uWindStrength.value = Math.min(1, wind.speed / CLOTH_WIND.fullAt);
  CLOTH_WIND_UNIFORMS.uWindTime.value = world?.time ?? 0;
}

/** Hook the shared wind into a material's vertex shader: `body` is GLSL that moves `transformed` (local) by the uniforms. */
function windMaterial(material, declarations, body) {
  clothWindWay();
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before?.(shader, renderer);
    Object.assign(shader.uniforms, CLOTH_WIND_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uWindTime; uniform vec2 uWindWay; uniform float uWindStrength;\n${declarations}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${body}`);
  };
  material.customProgramCacheKey = () => `wind:${declarations.length}:${body.length}`;
  return material;
}

/**
 * A flag's cloth that flutters: a plane whose local x runs from the staff (x = -width/2) to the fly, its face at z = 0. The
 * wave runs out along x and grows from nothing at the staff. Give the plane segments along x for it to bend.
 */
export function flutterCloth(material, width) {
  const spec = CLOTH_WIND;
  return windMaterial(material, '', `{
    float fly = clamp((position.x + ${(width / 2).toFixed(3)}) / ${width.toFixed(3)}, 0.0, 1.0);
    float hz = ${spec.flutterHz.toFixed(3)} * uWindStrength * ${spec.fullAt.toFixed(1)} + 0.2;
    float phase = 6.2832 * (hz * uWindTime - position.x / ${spec.wavelength.toFixed(3)});
    transformed.z += sin(phase) * fly * ${spec.amplitude.toFixed(3)} * (0.25 + uWindStrength);
  }`);
}

/** Grass (an instanced tuft standing on y = 0, `height` m tall) that bows downwind and sways as the gusts cross the field. */
export function swayGrass(material, height) {
  const spec = CLOTH_WIND;
  return windMaterial(material, '', `{
    float up = clamp(position.y / ${height.toFixed(3)}, 0.0, 1.0);
    vec4 base = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float along = dot(base.xz, uWindWay);
    float gust = 0.5 + 0.5 * sin(6.2832 * (along / ${spec.gustLength.toFixed(1)} - uWindTime * ${spec.gustPace.toFixed(2)} * uWindStrength * ${spec.fullAt.toFixed(1)} / ${spec.gustLength.toFixed(1)}));
    float bend = up * up * ${spec.bow.toFixed(3)} * uWindStrength * (1.0 + ${spec.sway.toFixed(2)} * (gust - 0.5) * 2.0);
    // (The tuft's own frame is turned; the bend is laid in the world's downwind way, taken back into the tuft's frame.)
    vec3 worldBend = vec3(uWindWay.x, 0.0, uWindWay.y) * bend;
    transformed += (inverse(mat3(instanceMatrix)) * worldBend);
  }`);
}
