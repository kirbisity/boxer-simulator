// Loose cloth that moves: a skirt's hem, a hanging sleeve, the legs of hakama trail what carries them, swing on after it
// stops, bow downwind and flap in the air. Drawing only: each point of a man's worn cloth carries how loose it hangs
// (loftbody.js looseness: 0 lying on the body .. 1 free), and the vertex shader moves it, after the skinning, by that share of
//   - its bones' swing: a point on a damped spring behind each bone's far end (ClothSwing), so cloth lags a limb that starts,
//     overshoots one that stops, and trails a man who walks or rides (the air he moves through);
//   - the place's wind (clothwind.js: the same air the standards fly in): a bow downwind and a travelling flap.
// What of that would carry the cloth into the body is all but taken out, so it presses on the windward side and
// billows on the lee. Stiff pieces carry no looseness and never move; a crowd's body has none at all (no cost in a battle line).

/* global THREE */

import { CLOTH_WIND, clothWindUniforms } from './clothwind.js';

export const CLOTH_SWAY = {
  // The spring behind a bone: its own frequency (Hz) and damping ratio (under 1: it swings past and back), the trail (s of
  // the bone's speed the cloth hangs behind it, the drag of the air he moves through), and the farthest it may hang off (m).
  hz: 1.5,
  damping: 0.3,
  trail: 0.02,
  reach: 0.08,
  // A jump farther than this in one frame (m) is not a movement (a man placed anew): the cloth starts at rest there.
  jump: 0.7,
  // Wind on worn cloth at clothwind.js `fullAt` m/s: the bow downwind and the flap on top of it (m, wholly loose cloth), the
  // flap's wavelength over the cloth (m), and how much of a move into the body is kept.
  bow: 0.035,
  flap: 0.02,
  wavelength: 0.4,
  inward: 0.12,
};

/**
 * The swing of one man's cloth: per bone, how far (m, world) the loose cloth it carries hangs off where the bone has it.
 * `uniform` is what his materials read (swayCloth); `update` moves it with his bones' frames (rig.js boneFrames) by dt.
 */
export class ClothSwing {
  constructor(bones) {
    this.count = bones;
    this.uniform = { value: new Float32Array(bones * 3) };
    this.at = null;
    this.speed = new Float32Array(bones * 3);
    this.was = new Float32Array(bones * 3);
    this.pace = new Float32Array(bones * 3);
  }

  update(frames, dt) {
    const spec = CLOTH_SWAY;
    const swing = this.uniform.value;
    const fresh = !this.at;
    if (fresh) this.at = new Float32Array(this.count * 3);
    if (!fresh && !(dt > 0)) return;
    const omega = Math.PI * 2 * spec.hz;
    const steps = fresh ? 0 : Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = steps ? dt / steps : 0;
    for (let bone = 0; bone < this.count; bone += 1) {
      const target = frames[bone].end ?? frames[bone].origin;
      const moved = Math.hypot(target[0] - this.was[bone * 3], target[1] - this.was[bone * 3 + 1], target[2] - this.was[bone * 3 + 2]);
      const reset = fresh || moved > spec.jump;
      for (let axis = 0; axis < 3; axis += 1) {
        const slot = bone * 3 + axis;
        if (reset) {
          this.at[slot] = this.was[slot] = target[axis];
          this.speed[slot] = this.pace[slot] = swing[slot] = 0;
          continue;
        }
        // The bone's own speed, smoothed (the physics' steps are not the frames'): the spring is damped against it, so
        // a steady walk carries the cloth along and only a change of speed swings it.
        const pace = (target[axis] - this.was[slot]) / dt;
        this.pace[slot] += (pace - this.pace[slot]) * Math.min(1, dt / 0.08);
        for (let step = 1; step <= steps; step += 1) {
          const goal = this.was[slot] + ((target[axis] - this.was[slot]) * step) / steps;
          this.speed[slot] += (omega * omega * (goal - this.at[slot]) - 2 * spec.damping * omega * (this.speed[slot] - pace)) * h;
          this.at[slot] += this.speed[slot] * h;
        }
        this.was[slot] = target[axis];
        swing[slot] = this.at[slot] - target[axis] - this.pace[slot] * spec.trail;
      }
      const far = Math.hypot(swing[bone * 3], swing[bone * 3 + 1], swing[bone * 3 + 2]);
      if (far > spec.reach) {
        for (let axis = 0; axis < 3; axis += 1) {
          swing[bone * 3 + axis] *= spec.reach / far;
          // (Held at its reach: the spring does not wind up beyond it.)
          this.at[bone * 3 + axis] = target[axis] + swing[bone * 3 + axis] + this.pace[bone * 3 + axis] * spec.trail;
        }
      }
    }
  }
}

const SWAY_DECLARATIONS = (bones) => `
attribute float clothSway;
uniform vec3 uClothSwing[${bones}];
uniform float uWindTime; uniform vec2 uWindWay; uniform float uWindStrength;
`;

const SWAY_MOVE = () => {
  const spec = CLOTH_SWAY;
  const f = (value) => value.toFixed(4);
  return `
#ifdef USE_SKINNING
	if ( clothSway > 0.0 ) {
		vec3 clothMove = uClothSwing[ int( skinIndex.x ) ] * skinWeight.x + uClothSwing[ int( skinIndex.y ) ] * skinWeight.y + uClothSwing[ int( skinIndex.z ) ] * skinWeight.z + uClothSwing[ int( skinIndex.w ) ] * skinWeight.w;
		float clothHz = ${f(CLOTH_WIND.flutterHz)} * uWindStrength * ${f(CLOTH_WIND.fullAt)} + 0.2;
		// (The flap runs over the cloth as it lies on him at rest, downwind and down it, so a moving man's does not race.)
		float clothPhase = 6.2832 * ( clothHz * uWindTime - ( dot( position.xz, uWindWay ) - position.y * 0.6 ) / ${f(spec.wavelength)} );
		float clothGust = 0.75 + 0.25 * sin( 6.2832 * ( 0.31 * uWindTime - dot( transformed.xz, uWindWay ) / ${f(CLOTH_WIND.gustLength)} ) );
		clothMove += vec3( uWindWay.x, 0.0, uWindWay.y ) * ( ( ${f(spec.bow)} * clothGust + ${f(spec.flap)} * sin( clothPhase ) ) * uWindStrength );
		clothMove += vec3( - uWindWay.y, 0.0, uWindWay.x ) * ( ${f(spec.flap * 0.5)} * sin( clothPhase * 1.31 + 1.7 ) * uWindStrength );
		clothMove *= clothSway;
		mat4 clothSkin = bindMatrixInverse * ( boneMatX * skinWeight.x + boneMatY * skinWeight.y + boneMatZ * skinWeight.z + boneMatW * skinWeight.w ) * bindMatrix;
		vec3 clothOut = normalize( ( clothSkin * vec4( normal, 0.0 ) ).xyz );
		float clothIn = dot( clothMove, clothOut );
		if ( clothIn < 0.0 ) clothMove -= clothOut * clothIn * ${f(1 - spec.inward)};
		transformed += clothMove;
	}
#endif
`;
};

/**
 * Make a skinned material sway its geometry's loose cloth (the `clothSway` attribute) by a man's swing (ClothSwing) and the
 * wind. Its other patches are kept and run first; one put on afterwards that replaces the skinning (dqskin.js) leaves this
 * after it. Returns the material.
 */
export function swayCloth(material, swing) {
  if (!material || material.userData.clothSwing) return material;
  material.userData.clothSwing = swing;
  const before = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey?.() ?? '';
  const bones = swing.count;
  material.onBeforeCompile = (shader, renderer) => {
    before?.call(material, shader, renderer);
    Object.assign(shader.uniforms, clothWindUniforms(), { uClothSwing: swing.uniform });
    // (A material already flying in the wind has the wind's uniforms declared.)
    const declared = shader.vertexShader.includes('uniform float uWindTime');
    const declarations = declared ? SWAY_DECLARATIONS(bones).replace(/uniform float uWindTime.*\n/, '') : SWAY_DECLARATIONS(bones);
    shader.vertexShader = shader.vertexShader
      .replace('#include <skinning_pars_vertex>', `#include <skinning_pars_vertex>\n${declarations}`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>\n${SWAY_MOVE()}`);
  };
  material.customProgramCacheKey = () => `${baseKey}|clothSway`;
  material.needsUpdate = true;
  return material;
}
