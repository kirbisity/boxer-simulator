// A weapon (or a limb) swung (the `swing` event): the whoosh of the air shed off it. Its pitch is the shedding's (Strouhal: f ≈ 0.2 v / d,
// the speed over the thickness that meets the air: a blade's edge-on 6 mm sings high, a club or a fist low), its level the aeroacoustic
// dipole's (sound power ∝ v^6: twice as fast is 18 dB louder), its length the arc's at that speed.

import { sfxClamp, sfxFilter, sfxNoise } from '../synth.js';

/** What a swing sounds like, without a context: { level (dB SPL at 1 m), centre (Hz), seconds }. */
export function swingParams(event) {
  const speed = Math.max(1, event.speed ?? 12);
  const length = sfxClamp(event.length ?? 0.9, 0.2, 3);
  const mass = Math.max(0.2, event.mass ?? 1.2);
  // What meets the air: thicker for a heavier piece of the same length (a mace's head, a fist), thin for a blade.
  const thickness = sfxClamp(0.004 * (mass / length) ** 0.7, 0.004, 0.08);
  const centre = sfxClamp((0.2 * speed) / thickness, 120, 3500);
  // A 1 m blade at 20 m/s is ~68 dB at a metre; v^6, and a longer blade sheds over more of its length.
  const level = 68 + 60 * Math.log10(speed / 20) + 10 * Math.log10(length / 1);
  // The arc: about a quarter turn of the weapon and the arm behind it, at the tip's speed.
  const seconds = sfxClamp(((length + 0.7) * 1.6) / speed, 0.08, 0.6);
  return { level, centre, seconds, speed };
}

/** Play a swing into `out`. Returns the end time. */
export function playSwing(voice, out, params, when, gain) {
  const { centre, seconds } = params;
  // Up as the tip comes to its speed, down as it slows: the band rises and falls with it (the Doppler of a blade past the face, too).
  const envelope = voice.ctx.createGain();
  voice.nodes.push(envelope);
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.linearRampToValueAtTime(gain, when + seconds * 0.55);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * 0.001), when + seconds * 1.15);
  envelope.connect(out);
  const band = sfxFilter(voice, envelope, 'bandpass', centre, 2.2);
  band.frequency.setValueAtTime(centre * 0.6, when);
  band.frequency.linearRampToValueAtTime(centre * 1.15, when + seconds * 0.55);
  band.frequency.linearRampToValueAtTime(centre * 0.7, when + seconds * 1.1);
  sfxNoise(voice, band, when, seconds * 1.2, 'pink');
  return when + seconds * 1.2 + 0.02;
}
