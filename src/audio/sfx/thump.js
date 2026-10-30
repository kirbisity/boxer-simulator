// The hit feel's thump (hitfeel.js): a low thud under a blow the player's man lands or takes, felt more than heard, as a body
// takes a blow in the chest. Not in the world (no distance, no room): his own blow, straight into the effects bus, under its own sound.

import { sfxBurst, sfxTone } from '../synth.js';

/** The thump, by its strength (0..1): a heavier blow is lower and longer. { frequency (Hz), to (Hz), decay (s), body (0..1 of the noise) }. */
export function thumpParams(strength) {
  const s = Math.max(0, Math.min(1, strength));
  // 85 Hz falling to ~45 for a light blow; 65 falling to ~32 for the heaviest: under the impact's own thump (impact.js: 100-200 Hz).
  return { frequency: 85 - 20 * s, to: 45 - 13 * s, decay: 0.09 + 0.12 * s, body: 0.35 + 0.25 * s };
}

/** Play the thump at `gain` into `out`. Returns the end time. */
export function playThump(voice, out, params, when, gain) {
  sfxTone(voice, out, { when, peak: gain, attack: 0.003, decay: params.decay, frequency: params.frequency, to: params.to });
  // The first instant's weight: low noise, shorter.
  sfxBurst(voice, out, { when, peak: gain * params.body, attack: 0.001, decay: params.decay * 0.4, type: 'lowpass', frequency: 220, q: 0.7, color: 'brown' });
  return when + params.decay + 0.05;
}
