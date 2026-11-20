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
  // Armour that gives (loftbody.js LOFT.armourGive: its points' looseness negative), as the Iron Pagoda's bard (horseview.js
  // BARD_SWAY, the user's call, 2026-11-20): `air` of the wind's bow and flap (iron is heavy); its hem on a second spring
  // following the first (`chain`: its own hz and damping, at most `reach` m off), the piece between the two by how loose it
  // is, so the hem lags as hair does; and a ripple run over its plates (`ripple`: `amp` m at full swing, its frequency, waves
  // per m round and down), swelling with how far the piece swings, so the plates lift out of step and lie still at rest.
  armour: { air: 0.15, chain: { hz: 1.0, damping: 0.2, reach: 0.12 }, ripple: { amp: 0.012, hz: 1.6, waves: [9, 6] } },
  // The soft swing of the man played and the two of a duel (main.js softSwing; ClothSwing `soft`, eased in and out over
  // `ease` s): every garment's cloth, a shirt and trousers too, stirs as hair does, lighter than armour: at least `floor` loose
  // wherever it lies, its hem on the second spring as armour's, `wind` times the wind it takes otherwise, and a flutter run
  // over it (`flutter`: `amp` m, waves per m down and round) by the wind and by how far it swings, never quite still.
  soft: { ease: 0.5, floor: 0.3, wind: 1.6, flutter: { amp: 0.008, waves: [11, 8], rest: 0.25 } },
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
    // The armour's hem (CLOTH_SWAY.armour.chain): a second spring per bone following the first, and the ripple's clock.
    this.hem = { value: new Float32Array(bones * 3) };
    this.chain = new Float32Array(bones * 3);
    this.chainSpeed = new Float32Array(bones * 3);
    this.clock = { value: 0 };
    // Whether the man has the soft swing (0..1, eased: CLOTH_SWAY.soft); set by render.js each frame.
    this.soft = { value: 0 };
    this.softWanted = 0;
  }

  update(frames, dt) {
    const spec = CLOTH_SWAY;
    const swing = this.uniform.value;
    const fresh = !this.at;
    if (fresh) this.at = new Float32Array(this.count * 3);
    if (!fresh && !(dt > 0)) return;
    const omega = Math.PI * 2 * spec.hz;
    const chain = spec.armour.chain;
    const chainOmega = Math.PI * 2 * chain.hz;
    const hem = this.hem.value;
    this.clock.value = (this.clock.value + dt * Math.PI * 2 * spec.armour.ripple.hz) % 1000;
    this.soft.value += (this.softWanted - this.soft.value) * Math.min(1, dt / spec.soft.ease);
    const steps = fresh ? 0 : Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = steps ? dt / steps : 0;
    for (let bone = 0; bone < this.count; bone += 1) {
      const target = frames[bone].end ?? frames[bone].origin;
      const moved = Math.hypot(target[0] - this.was[bone * 3], target[1] - this.was[bone * 3 + 1], target[2] - this.was[bone * 3 + 2]);
      const reset = fresh || moved > spec.jump;
      for (let axis = 0; axis < 3; axis += 1) {
        const slot = bone * 3 + axis;
        if (reset) {
          this.at[slot] = this.was[slot] = this.chain[slot] = target[axis];
          this.speed[slot] = this.pace[slot] = swing[slot] = this.chainSpeed[slot] = hem[slot] = 0;
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
          this.chainSpeed[slot] += (chainOmega * chainOmega * (this.at[slot] - this.chain[slot]) - 2 * chain.damping * chainOmega * (this.chainSpeed[slot] - this.speed[slot])) * h;
          this.chain[slot] += this.chainSpeed[slot] * h;
        }
        this.was[slot] = target[axis];
        swing[slot] = this.at[slot] - target[axis] - this.pace[slot] * spec.trail;
        hem[slot] = this.chain[slot] - target[axis] - this.pace[slot] * spec.trail;
      }
      // The hem eased into its reach (not stopped at it: a hard stop kinks it), its spring held back at twice that.
      const hemFar = Math.hypot(hem[bone * 3], hem[bone * 3 + 1], hem[bone * 3 + 2]);
      if (hemFar > 0) {
        if (hemFar > 2 * chain.reach) for (let axis = 0; axis < 3; axis += 1) this.chain[bone * 3 + axis] -= hem[bone * 3 + axis] * (1 - (2 * chain.reach) / hemFar);
        const drawn = chain.reach * Math.tanh(Math.min(hemFar, 2 * chain.reach) / chain.reach);
        for (let axis = 0; axis < 3; axis += 1) hem[bone * 3 + axis] *= drawn / hemFar;
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
uniform vec3 uClothHem[${bones}];
uniform float uClothClock;
uniform float uClothSoft;
uniform float uWindTime; uniform vec2 uWindWay; uniform float uWindStrength;
`;

const SWAY_MOVE = () => {
  const spec = CLOTH_SWAY;
  const f = (value) => value.toFixed(4);
  return `
#ifdef USE_SKINNING
	if ( clothSway != 0.0 ) {
		// (Armour, negative: its swing, its hem's lag, the ripple; a share of the wind. Cloth, positive: as it was.)
		float clothArmour = clothSway < 0.0 ? 1.0 : 0.0;
		// (Cloth in the soft swing: at least the floor loose, its hem lagging as armour's does.)
		float clothSoftCloth = uClothSoft * ( 1.0 - clothArmour );
		float clothLoose = mix( abs( clothSway ), max( abs( clothSway ), ${f(spec.soft.floor)} ), clothSoftCloth );
		vec3 clothMove = uClothSwing[ int( skinIndex.x ) ] * skinWeight.x + uClothSwing[ int( skinIndex.y ) ] * skinWeight.y + uClothSwing[ int( skinIndex.z ) ] * skinWeight.z + uClothSwing[ int( skinIndex.w ) ] * skinWeight.w;
		vec3 clothHemMove = uClothHem[ int( skinIndex.x ) ] * skinWeight.x + uClothHem[ int( skinIndex.y ) ] * skinWeight.y + uClothHem[ int( skinIndex.z ) ] * skinWeight.z + uClothHem[ int( skinIndex.w ) ] * skinWeight.w;
		clothMove = mix( clothMove, mix( clothMove, clothHemMove, clothLoose ), max( clothArmour, clothSoftCloth ) );
		vec3 clothSwingOnly = clothMove;
		float clothHz = ${f(CLOTH_WIND.flutterHz)} * uWindStrength * ${f(CLOTH_WIND.fullAt)} + 0.2;
		// (The flap runs over the cloth as it lies on him at rest, downwind and down it, so a moving man's does not race.)
		float clothPhase = 6.2832 * ( clothHz * uWindTime - ( dot( position.xz, uWindWay ) - position.y * 0.6 ) / ${f(spec.wavelength)} );
		float clothGust = 0.75 + 0.25 * sin( 6.2832 * ( 0.31 * uWindTime - dot( transformed.xz, uWindWay ) / ${f(CLOTH_WIND.gustLength)} ) );
		float clothAir = mix( 1.0, ${f(spec.armour.air)}, clothArmour ) * mix( 1.0, ${f(spec.soft.wind)}, clothSoftCloth );
		clothMove += vec3( uWindWay.x, 0.0, uWindWay.y ) * ( ( ${f(spec.bow)} * clothGust + ${f(spec.flap)} * sin( clothPhase ) ) * uWindStrength * clothAir );
		clothMove += vec3( - uWindWay.y, 0.0, uWindWay.x ) * ( ${f(spec.flap * 0.5)} * sin( clothPhase * 1.31 + 1.7 ) * uWindStrength * clothAir );
		clothMove *= clothLoose;
		mat4 clothSkin = bindMatrixInverse * ( boneMatX * skinWeight.x + boneMatY * skinWeight.y + boneMatZ * skinWeight.z + boneMatW * skinWeight.w ) * bindMatrix;
		vec3 clothOut = normalize( ( clothSkin * vec4( normal, 0.0 ) ).xyz );
		float clothIn = dot( clothMove, clothOut );
		if ( clothIn < 0.0 ) clothMove -= clothOut * clothIn * ${f(1 - spec.inward)};
		// The armour's plates lifting out of step as it swings (outward only, as plates lift off what is under them).
		float clothStir = min( 1.0, length( clothSwingOnly ) / ${f(spec.reach)} );
		float clothWave = sin( uClothClock - position.y * ${f(spec.armour.ripple.waves[1])} + atan( position.z, position.x ) * ${f(spec.armour.ripple.waves[0] * 0.15)} );
		clothMove += clothOut * ( max( clothWave, 0.0 ) * ${f(spec.armour.ripple.amp)} * clothStir * clothLoose * clothArmour );
		// The cloth's flutter (soft swing): by the wind and its own swing, a little even still; outward and back to the body.
		float clothFlutter = sin( clothPhase * 1.7 + position.y * ${f(spec.soft.flutter.waves[0])} + atan( position.z, position.x ) * ${f(spec.soft.flutter.waves[1] * 0.15)} );
		clothMove += clothOut * ( ( 0.5 + 0.5 * clothFlutter ) * ${f(spec.soft.flutter.amp)} * clothLoose * clothSoftCloth * clamp( uWindStrength + clothStir + ${f(spec.soft.flutter.rest)}, 0.0, 1.5 ) );
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
    Object.assign(shader.uniforms, clothWindUniforms(), { uClothSwing: swing.uniform, uClothHem: swing.hem, uClothClock: swing.clock, uClothSoft: swing.soft });
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
