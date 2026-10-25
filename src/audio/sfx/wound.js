// A wound made (the `wound` event): full realism, as the user asked. A cut is wet tissue tearing (a crackle of tiny bursts under a
// band of noise, longer the deeper it goes); a stab a short wet push and the suck of the blade drawn out; a bone breaking a sharp
// broadband snap and the crunch of its splinters; a crush the low grinding of a limb or skull giving way. The severity (0..1) sets the
// level and the length: a graze is a whisper of it, a limb half off is heard across the yard.

import { bandMakeUp, sfxBuffer, sfxBurst, sfxClamp, sfxPlayBuffer, sfxTone, writeCrackle, writeGrains, lowpassInPlace } from '../synth.js';

/** What each kind is: its level at full severity (dB SPL at 1 m: a long bone snapping is as loud as a stick of hardwood), and its length. */
export const WOUND_KINDS = {
  cut: { level: 80, seconds: 0.45, wet: 1 },
  stab: { level: 76, seconds: 0.3, wet: 0.8 },
  bone: { level: 92, seconds: 0.25, wet: 0.3 },
  crush: { level: 86, seconds: 0.4, wet: 0.5 },
};

/** What a wound sounds like, without a context: { kind, level (dB SPL at 1 m), seconds, wet (0..1) }. */
export function woundParams(event) {
  const kind = WOUND_KINDS[event.kind] ? event.kind : 'cut';
  const spec = WOUND_KINDS[kind];
  const severity = sfxClamp(event.severity ?? 0.5, 0, 1);
  // A deeper wound tears more tissue: the level by its share (as many small tears add up in energy, +10 dB for ten times as many).
  return { kind, severity, level: spec.level + 10 * Math.log10(0.1 + 0.9 * severity), seconds: spec.seconds * (0.4 + 0.6 * severity), wet: spec.wet };
}

/** Play a wound into `out`. Returns the end time. */
export function playWound(voice, out, params, when, gain) {
  const { kind, seconds, severity } = params;
  if (kind === 'cut') {
    // The tear: a crackle, densest at the start, through the wet low-mids, over a band of noise; the blood after it.
    const buffer = sfxBuffer(voice.ctx, seconds + 0.05, (data, rate) => {
      writeCrackle(data, rate, { count: Math.round(120 + 260 * severity), spread: seconds, length: 0.0015, amp: 0.5, shape: (share) => (1 - share) ** 1.5 });
      lowpassInPlace(data, rate, 3200);
    });
    sfxPlayBuffer(voice, out, buffer, when, gain * 3);
    sfxBurst(voice, out, { when, peak: gain * 0.5 * bandMakeUp(1.2), attack: 0.004, decay: seconds * 0.8, type: 'bandpass', frequency: 1100, q: 1.2, color: 'pink' });
    // The spatter: drops on what is under him a moment later.
    const drops = sfxBuffer(voice.ctx, 0.4, (data, rate) => writeGrains(data, rate, { count: Math.round(6 + 16 * severity), spread: 0.3, start: 0.05, low: 600, high: 2400, decay: 0.012, amp: 0.25 }));
    sfxPlayBuffer(voice, out, drops, when + seconds * 0.3, gain * 0.5);
    return when + seconds + 0.45;
  }
  if (kind === 'stab') {
    // The push in (low wet noise swelling), and the suck as the blade comes out.
    sfxBurst(voice, out, { when, peak: gain * 0.9, attack: 0.02, decay: seconds * 0.5, type: 'lowpass', frequency: 700, color: 'pink' });
    const buffer = sfxBuffer(voice.ctx, seconds, (data, rate) => {
      writeCrackle(data, rate, { count: Math.round(60 + 120 * severity), spread: seconds * 0.6, length: 0.002, amp: 0.45, start: seconds * 0.3 });
      lowpassInPlace(data, rate, 1800);
    });
    sfxPlayBuffer(voice, out, buffer, when, gain * 2.6);
    sfxTone(voice, out, { when: when + seconds * 0.55, peak: gain * 0.25, decay: 0.12, frequency: 260, to: 520, type: 'triangle' });
    return when + seconds + 0.2;
  }
  if (kind === 'bone') {
    // The snap: a click a few ms long, broadband; then the crunch of the ends grinding.
    sfxBurst(voice, out, { when, peak: gain * 1.4, attack: 0.0005, decay: 0.012, type: 'highpass', frequency: 1800 });
    sfxBurst(voice, out, { when, peak: gain * 0.8, attack: 0.0005, decay: 0.03, type: 'bandpass', frequency: 3600, q: 1.5 });
    sfxTone(voice, out, { when, peak: gain * 0.5, decay: 0.05, frequency: 220, to: 120 });
    const crunch = sfxBuffer(voice.ctx, seconds + 0.05, (data, rate) => {
      writeGrains(data, rate, { count: Math.round(20 + 30 * severity), spread: seconds, start: 0.01, low: 900, high: 4200, decay: 0.004, amp: 0.5, bunch: 1.8 });
      writeCrackle(data, rate, { count: 40, spread: seconds * 0.8, start: 0.01, length: 0.001, amp: 0.3 });
    });
    sfxPlayBuffer(voice, out, crunch, when, gain * 0.9);
    return when + seconds + 0.08;
  }
  // Crush: a low grinding crunch, the give of what is under it.
  const buffer = sfxBuffer(voice.ctx, seconds + 0.05, (data, rate) => {
    writeGrains(data, rate, { count: Math.round(40 + 50 * severity), spread: seconds, low: 300, high: 2200, decay: 0.008, amp: 0.45, bunch: 1.4 });
    writeCrackle(data, rate, { count: 120, spread: seconds, length: 0.002, amp: 0.3 });
    lowpassInPlace(data, rate, 2500);
  });
  sfxPlayBuffer(voice, out, buffer, when, gain * 1.2);
  sfxBurst(voice, out, { when, peak: gain * 0.7, decay: seconds * 0.6, type: 'lowpass', frequency: 300, color: 'brown' });
  return when + seconds + 0.08;
}
