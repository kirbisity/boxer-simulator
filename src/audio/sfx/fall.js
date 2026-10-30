// A body going down (`fall`) or coming down from a jump or a drop (`land`): the thud of the body on the ground (its energy ½mv², the
// whole body's this time, on the surface's give), the surface's own layer (a splash in water, a slap of mud, grit on stone), and the
// armour crashing with it.

import { levelFromEnergy, sfxBurst, sfxClamp, sfxModes, sfxTone } from '../synth.js';
import { playArmourShake } from './impact.js';
import { SURFACES, playStep, stepParams } from './step.js';

/** What a fall sounds like, without a context: { level, thud (Hz), seconds, surface, armour, layer (the surface's step params) }. */
export function fallParams(event, kind = 'fall') {
  const mass = Math.max(20, event.mass ?? 80);
  const speed = Math.max(0.3, event.speed ?? 3);
  const surface = SURFACES[event.surface] ? event.surface : 'earth';
  const spec = SURFACES[surface];
  const energy = 0.5 * mass * speed * speed;
  // A man falling is a soft bag: more of a thud than a step's tap (a body is a poor radiator; a landing on the feet less than a fall on the back).
  const efficiency = spec.efficiency * (kind === 'land' ? 0.25 : 0.4);
  // (A heavier body takes longer to come to rest on the ground.)
  const seconds = 0.2 + 0.001 * mass;
  const level = levelFromEnergy(energy, efficiency, seconds);
  // The torso's thump: lower for a heavier body (f ∝ m^-1/2 against the same ground).
  const thud = sfxClamp(95 * (80 / mass) ** 0.5, 40, 160);
  const layer = stepParams({ surface, mass, speed: speed * 1.5, depth: event.depth ?? (surface === 'water' ? 0.4 : 0), armour: 'none' });
  return { level, thud, seconds, surface, armour: event.armour ?? 'none', layer, energy, speed, kind };
}

/** Play a fall into `out`. Returns the end time. */
export function playFall(voice, out, params, when, gain) {
  const { thud, seconds } = params;
  sfxTone(voice, out, { when, peak: gain * 0.9, decay: seconds, frequency: thud * 1.3, to: thud * 0.7 });
  sfxBurst(voice, out, { when, peak: gain * 0.7, attack: 0.003, decay: seconds * 0.6, type: 'lowpass', frequency: 420, color: 'brown' });
  // A fall is a few contacts (hips, back, shoulders, the head last): a second thump after the first.
  if (params.kind === 'fall') sfxTone(voice, out, { when: when + 0.09, peak: gain * 0.5, decay: seconds * 0.7, frequency: thud * 1.6, to: thud });
  const end = playStep(voice, out, params.layer, when, gain * 0.6);
  if (params.armour !== 'none') {
    playArmourShake(voice, out, params.armour, when, gain * 0.9, 0.3);
    if (params.armour === 'plate') playArmourShake(voice, out, 'plate', when + 0.1, gain * 0.6, 0.25);
  }
  return Math.max(end, when + seconds + 0.35);
}

/** A dropped weapon striking the floor (`clatter`): its energy ½mv² into the steel's ring (a recorded clatter plays it where it has loaded). */
export function clatterParams(event) {
  const mass = sfxClamp(event.mass ?? 1.2, 0.2, 6);
  const speed = Math.max(0.5, event.speed ?? 3);
  const energy = 0.5 * mass * speed * speed;
  return { level: levelFromEnergy(energy, 2e-3, 0.4), energy, mass, speed, base: sfxClamp(900 * (1.2 / mass) ** 0.3, 400, 1600) };
}

/** Play a clatter into `out` (the synth's: two knocks of a ringing bar). Returns the end time. */
export function playClatter(voice, out, params, when, gain) {
  for (let k = 0; k < 2; k += 1) {
    const at = when + k * 0.11;
    sfxModes(voice, out, at, [{ f: params.base, decay: 0.25, amp: 1 }, { f: params.base * 2.756, decay: 0.14, amp: 0.5 }, { f: params.base * 5.4, decay: 0.08, amp: 0.3 }], gain * (k ? 0.4 : 0.8));
    sfxBurst(voice, out, { when: at, peak: gain * (k ? 0.2 : 0.4), decay: 0.015, type: 'highpass', frequency: 2500 });
  }
  return when + 0.45;
}
