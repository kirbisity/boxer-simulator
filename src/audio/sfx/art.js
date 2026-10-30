// A weapon art's own layers (artdrama.js), under the stroke's ordinary sounds and not in the world (no distance, no room): his
// own all-out stroke, straight into the effects bus as the hit feel's thump is.
//   draw    the stroke gathered and let go: a long breath of air rising in pitch through the wind-up into a fast whoosh, and on
//           steel a faint high ring of the blade drawn (an edge leaving its guard)
//   impact  under the blow's own crack: a deep falling boom felt in the chest, a short low burst of weight, and on steel a
//           brief bright ring

import { sfxBurst, sfxFilter, sfxModes, sfxNoise, sfxTone } from '../synth.js';

/** The draw's shape: { seconds (whole), rise (s to the whoosh's peak), from, to (Hz of the air's band), ring (0..1: a blade's) }. */
export function artDrawParams(blade = true) {
  // ~0.6 s from a low breath to the whoosh: the wind-up's length played slow (artdrama.js), the band rising ~3 octaves.
  return { seconds: 0.75, rise: 0.5, from: 260, to: 2200, ring: blade ? 0.18 : 0 };
}

/** Play the draw at `gain` into `out`. Returns the end time. */
export function playArtDraw(voice, out, params, when, gain) {
  const envelope = voice.ctx.createGain();
  voice.nodes.push(envelope);
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(gain * 0.9, when + params.rise);
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + params.seconds);
  envelope.connect(out);
  const band = sfxFilter(voice, envelope, 'bandpass', params.from, 1.6);
  band.frequency.setValueAtTime(params.from, when);
  band.frequency.exponentialRampToValueAtTime(params.to, when + params.rise);
  band.frequency.exponentialRampToValueAtTime(params.to * 0.6, when + params.seconds);
  sfxNoise(voice, band, when, params.seconds + 0.05, 'pink');
  // The steel's whisper: a few high partials, barely there, as the edge comes free.
  if (params.ring > 0) sfxModes(voice, out, when + 0.02, [{ f: 3150, decay: 0.7, amp: 1 }, { f: 4720, decay: 0.5, amp: 0.6 }, { f: 6890, decay: 0.35, amp: 0.35 }], gain * params.ring);
  return when + params.seconds + 0.05;
}

/** The impact layer by strength (0..1): lower, longer and heavier the harder. */
export function artImpactParams(strength, metal = false) {
  const s = Math.max(0, Math.min(1, strength));
  return { frequency: 70 - 22 * s, to: 34 - 8 * s, decay: 0.28 + 0.32 * s, body: 0.5 + 0.35 * s, ring: metal ? 0.25 + 0.2 * s : 0 };
}

/** Play the impact layer at `gain` into `out`. Returns the end time. */
export function playArtImpact(voice, out, params, when, gain) {
  sfxTone(voice, out, { when, peak: gain, attack: 0.002, decay: params.decay, frequency: params.frequency, to: params.to });
  // A second, lower boom a beat behind: the weight of it arriving.
  sfxTone(voice, out, { when: when + 0.012, peak: gain * 0.6, attack: 0.004, decay: params.decay * 1.4, frequency: params.frequency * 0.6, to: params.to * 0.7 });
  sfxBurst(voice, out, { when, peak: gain * params.body, attack: 0.001, decay: params.decay * 0.35, type: 'lowpass', frequency: 320, q: 0.7, color: 'brown' });
  if (params.ring > 0) sfxModes(voice, out, when, [{ f: 1830, decay: 0.5, amp: 1 }, { f: 2970, decay: 0.38, amp: 0.7 }, { f: 4410, decay: 0.25, amp: 0.45 }], gain * params.ring);
  return when + params.decay * 1.4 + 0.05;
}
