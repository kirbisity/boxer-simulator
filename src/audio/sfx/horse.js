// A horse (the `horse` event): its hooves (a step of a 500 kg animal on a small hard hoof: on stone a clop with the hollow of the hoof's
// wall in it, on earth a thud), its snort (air blown through the nostrils, fluttering them) and a short neigh (a high voice, wavering,
// falling). The four-beat walk and the three-beat canter come from the events' own timing.

import { bandMakeUp, levelFromEnergy, sfxBurst, sfxEnvelope, sfxFilter, sfxGain, sfxModes, sfxNoise, sfxRun } from '../synth.js';
import { SURFACES, playStep, stepParams } from './step.js';

/** What a horse event sounds like, without a context. */
export function horseParams(event) {
  const kind = ['hoof', 'snort', 'neigh'].includes(event.kind) ? event.kind : 'hoof';
  const mass = Math.max(150, event.mass ?? 500);
  if (kind === 'hoof') {
    const surface = SURFACES[event.surface] ? event.surface : 'earth';
    // A hoof comes down harder than a foot: a quarter of the horse on it at its gait's speed.
    const speed = Math.max(0.5, event.speed ?? 2);
    const v = 0.5 + 0.2 * speed;
    const energy = 0.5 * 0.12 * mass * v * v;
    const hard = surface === 'stone' || surface === 'tile' || surface === 'wood';
    const seconds = hard ? 0.08 : 0.12;
    // The hoof is horn: it rings a little on hard ground (a horn shell's knock, lower for a bigger horse).
    const clop = hard ? 650 * (500 / mass) ** 0.25 : 0;
    return { kind, surface, level: levelFromEnergy(energy, SURFACES[surface].efficiency * (hard ? 2.5 : 1.2), seconds), clop, layer: stepParams({ surface, mass: mass * 0.25, speed: speed * 0.6, depth: event.depth ?? 0 }), seconds };
  }
  if (kind === 'snort') return { kind, level: 74, seconds: 0.45, flutter: 32 * (500 / mass) ** 0.2 };
  // A neigh: the larynx of a horse, ~ 500-900 Hz at its height, wavering and falling.
  return { kind, level: 92, seconds: 1.1, f0: 620 * (500 / mass) ** 0.2 };
}

/** Play a horse event into `out`. Returns the end time. */
export function playHorse(voice, out, params, when, gain) {
  if (params.kind === 'hoof') {
    const end = playStep(voice, out, params.layer, when, gain * 0.8);
    if (params.clop) sfxModes(voice, out, when, [{ f: params.clop, decay: 0.07, amp: 1 }, { f: params.clop * 1.8, decay: 0.05, amp: 0.6 }, { f: params.clop * 3.1, decay: 0.03, amp: 0.3 }], gain);
    return Math.max(end, when + params.seconds + 0.05);
  }
  if (params.kind === 'snort') {
    // The breath forced out through the nostrils, which flap at their own rate: noise amplitude-modulated by the flutter.
    const level = sfxEnvelope(voice, out, when, gain * bandMakeUp(1.2) * 1.5, 0.03, 0.15, 0.28);
    const flap = sfxGain(voice, level, 0.5);
    const flutter = voice.ctx.createOscillator();
    flutter.frequency.value = params.flutter;
    const depth = sfxGain(voice, flap.gain, 0.5);
    flutter.connect(depth);
    sfxRun(voice, flutter, when, when + params.seconds);
    const band = sfxFilter(voice, flap, 'bandpass', 700, 1.2);
    sfxNoise(voice, band, when, params.seconds + 0.05, 'pink');
    return when + params.seconds + 0.05;
  }
  // The neigh: a voiced whinny with a fast vibrato, through a nasal formant, the pitch climbing then falling in steps.
  const { f0, seconds } = params;
  const level = sfxEnvelope(voice, out, when, gain, 0.05, seconds * 0.55, seconds * 0.4);
  const nose = sfxFilter(voice, level, 'bandpass', 1400, 1.5);
  const oscillator = voice.ctx.createOscillator();
  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(f0, when);
  oscillator.frequency.linearRampToValueAtTime(f0 * 1.5, when + seconds * 0.2);
  oscillator.frequency.linearRampToValueAtTime(f0 * 1.1, when + seconds * 0.6);
  oscillator.frequency.linearRampToValueAtTime(f0 * 0.7, when + seconds);
  const vibrato = voice.ctx.createOscillator();
  vibrato.frequency.value = 11;
  vibrato.connect(sfxGain(voice, oscillator.frequency, f0 * 0.08));
  oscillator.connect(nose);
  sfxRun(voice, oscillator, when, when + seconds + 0.05);
  sfxRun(voice, vibrato, when, when + seconds + 0.05);
  sfxBurst(voice, out, { when: when + seconds * 0.8, peak: gain * 0.3, attack: 0.05, decay: 0.3, type: 'bandpass', frequency: 800, q: 1, color: 'pink' });
  return when + seconds + 0.4;
}
