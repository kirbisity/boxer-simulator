// The human voice, synthesized and without words: a small vocal tract. The source is the glottis, a train of pulses (its spectrum
// falling ~12 dB an octave, as a real one does), with breath noise beside it; the tract is four formants (band-passes) whose places
// are the vowel's, scaled by the length of the tract. A bigger man has a longer tract (lower formants) and longer vocal folds (a lower
// fundamental): both follow the body's size (height), the fundamental a little lower again for a heavier man.
//
// Kinds: `effort` (a grunt on a blow thrown), `struck` (the breath driven out by a blow taken), `wound` (a cry: long, the pitch rising
// and breaking), `death` (falling away), and breath (in and out, the rate and depth from his exertion: engine.js schedules it).

import { bandMakeUp, sfxClamp, sfxEnvelope, sfxFilter, sfxGain, sfxKeep, sfxNoise, sfxRun } from '../synth.js';

/** The vowels (formants in Hz for a 17 cm tract, a man of 1.78 m): 'uh' a grunt, 'ah' a cry, 'oh' the end of a dying breath, 'h' the breath. */
export const VOWELS = {
  uh: [600, 1150, 2450, 3400],
  ah: [800, 1250, 2700, 3800],
  oh: [500, 850, 2500, 3300],
  h: [520, 1500, 2600, 3600],
};
const FORMANT_GAINS = [1, 0.55, 0.3, 0.15];
const FORMANT_Q = [6, 8, 10, 12];

/** The voice of a body: { f0 (Hz), scale (the formants' factor) } from his height (m) and mass (kg). */
export function voiceOfBody(size = 1.78, mass = 80) {
  const height = sfxClamp(size, 0.9, 2.4);
  // The folds and the larynx grow with the body: the fundamental falls as the square of the size ratio (110 Hz at 1.78 m; 140 at 1.6 m).
  const f0 = 110 * (1.78 / height) ** 2 * (80 / sfxClamp(mass, 30, 200)) ** 0.1;
  return { f0, scale: 1.78 / height };
}

/** What a voice event sounds like, without a context: { kind, f0, contour [[t share, f0 factor]...], vowel, seconds, level, breathy }. */
export function voiceParams(event) {
  const { f0, scale } = voiceOfBody(event.size, event.mass);
  const strength = sfxClamp(event.strength ?? 0.5, 0, 1);
  const kind = ['effort', 'struck', 'wound', 'death'].includes(event.kind) ? event.kind : 'effort';
  if (kind === 'effort') return { kind, f0, scale, strength, vowel: 'uh', seconds: 0.14 + 0.16 * strength, contour: [[0, 1.25 + 0.3 * strength], [1, 1.05]], level: 70 + 14 * strength, breathy: 0.35 };
  if (kind === 'struck') return { kind, f0, scale, strength, vowel: 'uh', seconds: 0.16 + 0.14 * strength, contour: [[0, 1.4 + 0.4 * strength], [1, 0.95]], level: 76 + 14 * strength, breathy: 0.55 };
  // A cry of pain: the voice driven up an octave or more, breaking (a jump in the pitch where the folds give), then down.
  if (kind === 'wound') return { kind, f0, scale, strength, vowel: 'ah', seconds: 0.6 + 0.9 * strength, contour: [[0, 1.6], [0.15, 2.1 + 0.9 * strength], [0.45, 2.4 + 1.1 * strength], [0.5, 1.9 + 0.6 * strength], [1, 1.3]], level: 90 + 14 * strength, breathy: 0.3, rough: 0.5 + 0.5 * strength };
  return { kind, f0, scale, strength, vowel: 'ah', toVowel: 'oh', seconds: 1.2 + 0.8 * strength, contour: [[0, 1.5], [0.3, 1.2], [1, 0.55]], level: 82 + 8 * strength, breathy: 0.7, rough: 0.6 };
}

/**
 * Breathing at an exertion (0 at rest .. 1 at empty, more in the overdraft): { rate (breaths/s), level (dB SPL at 1 m), inSeconds, outSeconds }.
 * At rest ~15 a minute, quiet; spent, a gasp nearly every second, loud through the open mouth.
 */
export function breathParams(exertion, size = 1.78) {
  const work = sfxClamp(exertion, 0, 1.5);
  const rate = 0.25 + 0.55 * Math.min(1, work) + 0.2 * Math.max(0, work - 1);
  const cycle = 1 / rate;
  return { rate, level: 38 + 26 * Math.min(1.2, work), inSeconds: cycle * 0.38, outSeconds: cycle * 0.5, scale: 1.78 / sfxClamp(size, 0.9, 2.4) };
}

const GLOTTAL_WAVES = new WeakMap();

/** The glottal pulse's wave (its harmonics falling 12 dB an octave), made once per context. */
function glottalWave(ctx) {
  let wave = GLOTTAL_WAVES.get(ctx);
  if (wave) return wave;
  const count = 40;
  const real = new Float32Array(count);
  const imag = new Float32Array(count);
  for (let n = 1; n < count; n += 1) imag[n] = 1 / (n * n) ** 0.85;
  wave = ctx.createPeriodicWave(real, imag);
  GLOTTAL_WAVES.set(ctx, wave);
  return wave;
}

/** The tract: four formant band-passes in parallel into `dest`, at the vowel's places times `scale`; returns their input and the filters. */
function vocalTract(voice, dest, vowel, scale, when, seconds, toVowel = null) {
  const input = sfxKeep(voice, voice.ctx.createGain());
  VOWELS[vowel].forEach((frequency, index) => {
    const out = sfxGain(voice, dest, FORMANT_GAINS[index] * 2.2);
    const band = sfxFilter(voice, out, 'bandpass', frequency * scale, FORMANT_Q[index]);
    if (toVowel) {
      band.frequency.setValueAtTime(frequency * scale, when);
      band.frequency.linearRampToValueAtTime(VOWELS[toVowel][index] * scale, when + seconds);
    }
    input.connect(band);
  });
  return input;
}

/** Play a voice event into `out`. Returns the end time. */
export function playVoice(voice, out, params, when, gain) {
  const { f0, scale, seconds, contour } = params;
  const level = sfxEnvelope(voice, out, when, gain, 0.025, seconds * 0.55, seconds * 0.45);
  const tract = vocalTract(voice, level, params.vowel, scale, when, seconds, params.toVowel);
  // The voiced source along its contour, a little unsteady (jitter), rougher for a cry (a slow wobble of the folds under strain).
  const glottis = voice.ctx.createOscillator();
  glottis.setPeriodicWave(glottalWave(voice.ctx));
  glottis.frequency.setValueAtTime(f0 * contour[0][1], when);
  for (const [share, factor] of contour.slice(1)) glottis.frequency.linearRampToValueAtTime(f0 * factor * (1 + (Math.random() - 0.5) * 0.04), when + share * seconds);
  const voiced = sfxGain(voice, tract, 1 - params.breathy * 0.5);
  glottis.connect(voiced);
  if (params.rough) {
    const wobble = voice.ctx.createOscillator();
    wobble.frequency.value = 18 + Math.random() * 14;
    const depth = sfxGain(voice, glottis.frequency, f0 * 0.06 * params.rough);
    wobble.connect(depth);
    sfxRun(voice, wobble, when, when + seconds + 0.05);
  }
  sfxRun(voice, glottis, when, when + seconds + 0.05);
  // The breath through the same tract.
  sfxNoise(voice, sfxGain(voice, tract, params.breathy * 0.6), when, seconds + 0.05, 'white');
  return when + seconds + 0.1;
}

/** One breath, in or out, into `out`: noise through the tract of an open 'h', shorter and higher drawn in. */
export function playBreath(voice, out, breath, when, gain, inhale) {
  const seconds = inhale ? breath.inSeconds : breath.outSeconds;
  // (Noise through the formants: the bands keep little of it, made up so that the breath is at its level.)
  const level = sfxEnvelope(voice, out, when, gain * (inhale ? 0.7 : 1) * bandMakeUp(8), seconds * 0.35, seconds * 0.2, seconds * 0.45);
  const tract = vocalTract(voice, level, 'h', breath.scale * (inhale ? 1.15 : 1), when, seconds);
  sfxNoise(voice, tract, when, seconds + 0.05, 'pink');
  return when + seconds + 0.05;
}
