// The human voice, synthesized and without words: a small vocal tract. The source is the glottis, a train of pulses (its spectrum
// falling ~12 dB an octave, as a real one does), with breath noise beside it; the tract is four formants (band-passes) whose places
// are the vowel's, scaled by the length of the tract. A bigger man has a longer tract (lower formants) and longer vocal folds (a lower
// fundamental): both follow the body's size (height), the fundamental a little lower again for a heavier man.
//
// Kinds: `effort` (a grunt on a blow thrown), `struck` (the breath driven out by a blow taken), `wound` (a cry: long, the pitch rising
// and breaking), `death` (falling away), and breath (in and out, the rate and depth from his exertion: engine.js schedules it).
//
// The synth's cries are not played (the user found them wrong): a cry is a recorded one (samples voice-<sex>-<kind>, cut from the user's
// recordings of a man and a woman crying), chosen and rationed by audio/cries.js, played by sfx/sampled.js. What is here for them is
// pure: the kinds, how loud each is, and the pitch of a body's voice (CRY_VOICE).

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

// ---- The recorded cries ---------------------------------------------------------------------------------------------------------------

/**
 * The kinds of cry (each a set per sex, voice-<sex>-<kind>), with
 *   level    dB SPL at 1 m at full intensity, `low` less at none: a scream as loud as a voice goes (~100 dB at 1 m shouted), the hurt cry
 *            under it, the moan of a man lying hurt a voice's ordinary loudness; all kept ~6 dB under a heavy blow's own level at the ear
 *            (impact.js, + its family boost), so a cry never buries the blow that caused it
 *   seconds  about how long a take lasts (s): for the director's count of who is still crying
 *   weight   its rank when there are more cries than voices for them: a death and a scream before a grunt, a moan last
 */
export const CRY_KINDS = {
  hurt: { level: 84, low: 8, seconds: 0.45, weight: 1 },
  scream: { level: 92, low: 6, seconds: 1.1, weight: 2 },
  moan: { level: 72, low: 4, seconds: 1.4, weight: 0.5 },
  fear: { level: 86, low: 6, seconds: 0.9, weight: 1 },
  dying: { level: 88, low: 4, seconds: 1.6, weight: 3 },
};

/**
 * A voice's pitch (the take's playback rate) by the body. The recorded voices are an adult man's and woman's (`ref`: the body their
 * voices are taken to be); a body larger than that is lower (`height`: the rate falls as (ref/height)^0.9, the folds and the tract
 * longer), a heavier one a little lower again (`mass`), a child's higher (`youngUnder`: `young` up a year under it), an old one lower
 * and duller (`oldFrom`: `old` down a year over it, to `oldFloor`). Each man his own voice (`personal`: ± that share, the same each
 * time, from his id) and each cry a little off it (`utterance`: ±). Kept within `range` (past it a take sounds like a tape sped up).
 */
export const CRY_VOICE = {
  ref: { male: { height: 1.78, mass: 80 }, female: { height: 1.65, mass: 62 } },
  height: 0.9, mass: 0.12, youngUnder: 18, young: 0.025, oldFrom: 40, old: 0.004, oldFloor: 0.9, personal: 0.05, utterance: 0.03, range: [0.78, 1.3],
};

/** A body's sex as its voice is: 'female' or 'male'. */
export const crySex = (sex) => (sex === 'female' ? 'female' : 'male');

/** A stable share 0..1 from an id (a man's own voice: the same each fight). */
export function cryPersonal(id) {
  let h = (Math.imul((id ?? 0) + 1, 2654435761) >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** The rate of a voice: { sex, height (m), mass (kg), age (years), id }; `jitter` -1..1 the utterance's own (0: his voice itself). */
export function cryRate({ sex, height, mass, age, id }, jitter = 0) {
  const spec = CRY_VOICE;
  const ref = spec.ref[crySex(sex)];
  const years = age ?? 30;
  const youth = 1 + spec.young * Math.max(0, spec.youngUnder - years);
  const elder = Math.max(spec.oldFloor, 1 - spec.old * Math.max(0, years - spec.oldFrom));
  const own = 1 + spec.personal * (cryPersonal(id) * 2 - 1);
  const rate = (ref.height / sfxClamp(height ?? ref.height, 0.9, 2.4)) ** spec.height * (ref.mass / sfxClamp(mass ?? ref.mass, 25, 220)) ** spec.mass * youth * elder * own * (1 + spec.utterance * jitter);
  return sfxClamp(rate, spec.range[0], spec.range[1]);
}

/** A cry's level at 1 m (dB SPL) by its kind and intensity (0..1). */
export const cryLevel = (cry) => CRY_KINDS[cry.kind].level - CRY_KINDS[cry.kind].low * (1 - sfxClamp(cry.intensity ?? 0.5, 0, 1));

/**
 * The cry a voice event stands for when nothing chose one (the bench's, the board's): a blow taken a hurt cry, a wound a scream, a death
 * dying; an effort none (no recording of one). { kind, sex, intensity, rate } or null.
 */
export function cryOfEvent(event) {
  if (event.cry) return event.cry;
  const kind = { struck: 'hurt', wound: 'scream', death: 'dying', moan: 'moan', fear: 'fear', hurt: 'hurt', scream: 'scream', dying: 'dying' }[event.kind];
  if (!kind) return null;
  return { kind, sex: crySex(event.sex), intensity: sfxClamp(event.strength ?? 0.6, 0, 1), rate: cryRate({ sex: event.sex, height: event.size, mass: event.mass, age: event.age, id: event.who }) };
}
