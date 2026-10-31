// A robot shorting out (`robotSpark`, machinefx.js: at its death and at a cut stump): the recorded electric shock (sfx/sampled.js); until
// it has loaded, a crackle of arcs and the mains' buzz under it.

import { sfxBuffer, sfxClamp, sfxPlayBuffer, sfxTone, writeCrackle } from '../synth.js';

/** The short's loudness at 1 m (dB SPL) by its intensity 0..1 (a death 1, a stump 0.7): an arc's crack, about a heavy blow's. */
export const SPARK_LEVEL = { low: 72, high: 88 };

/** A short, without a context: { intensity, level, seconds }. */
export function sparkParams(event) {
  const intensity = sfxClamp(event.intensity ?? 1, 0, 1);
  return { intensity, level: SPARK_LEVEL.low + (SPARK_LEVEL.high - SPARK_LEVEL.low) * intensity, seconds: 0.35 + 0.9 * intensity };
}

/** Play the synth's short into `out`. Returns the end time. */
export function playSpark(voice, out, params, when, gain) {
  const { seconds } = params;
  const buffer = sfxBuffer(voice.ctx, seconds, (data, rate) => writeCrackle(data, rate, { count: Math.round(40 * seconds), spread: seconds * 0.9, length: 0.002, amp: 0.9 }));
  sfxPlayBuffer(voice, out, buffer, when, gain);
  sfxTone(voice, out, { when, peak: gain * 0.25, attack: 0.005, hold: seconds * 0.5, decay: seconds * 0.5, frequency: 120, type: 'sawtooth' });
  return when + seconds + 0.05;
}
