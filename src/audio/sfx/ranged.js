// Shooting (the `shot` event) and what is shot (the arrow in the air, read from the world's live arrows; its strike, `arrowhit`, is an
// impact by a point: impact.js). A bow's release is the string's thrum (a string stopped short: a low fundamental and its harmonics,
// dying fast) and the limbs' creak; a crossbow a heavier snap of its steel or horn prod and the knock of its stock. A matchlock is a
// crack (the muzzle blast, a pressure pulse a few ms long) and the boom of the burning powder behind it; a cannon a deep boom and a long
// rumble. Gunfire is heard over the whole map: the air takes its crack off at a distance (ear.js), the boom carries.

import { sfxBurst, sfxClamp, sfxEnvelope, sfxFilter, sfxModes, sfxNoise, sfxTone } from '../synth.js';

/** Each weapon: its level at 1 m (dB SPL: a matchlock's muzzle blast is ~150 dB, a cannon's ~165; a bow's release ~80) and its make-up. */
export const SHOTS = {
  bow: { level: 80, thrum: 110, seconds: 0.25 },
  crossbow: { level: 92, thrum: 75, seconds: 0.3, knock: 260 },
  matchlock: { level: 150, seconds: 0.9, boom: 160 },
  cannon: { level: 165, seconds: 3, boom: 55 },
};

/** What a shot sounds like, without a context. */
export function shotParams(event) {
  const kind = SHOTS[event.kind] ? event.kind : 'bow';
  return { kind, ...SHOTS[kind] };
}

/**
 * An arrow going past (from the live arrow, not an event): { level at 1 m, centre (Hz), seconds, drop (the Doppler's ratio of pitch
 * before to after: (c + v cos) / (c - v cos)) }. Aeolian like a swing: ~70 dB for a 50 m/s arrow, ∝ v^6.
 */
export function whizzParams(speed, closest) {
  const v = Math.max(5, speed);
  const doppler = (343 + v) / Math.max(50, 343 - v);
  return { level: 70 + 60 * Math.log10(v / 50), centre: sfxClamp(0.2 * v / 0.004, 900, 6000), seconds: sfxClamp(1.2 / v + closest / v, 0.08, 0.5), drop: doppler };
}

/** Play a shot into `out`. Returns the end time. */
export function playShot(voice, out, params, when, gain) {
  if (params.kind === 'bow' || params.kind === 'crossbow') {
    // The string stopped at the brace: its fundamental and two harmonics, gone in a quarter of a second.
    sfxModes(voice, out, when, [{ f: params.thrum, decay: params.seconds, amp: 1 }, { f: params.thrum * 2.02, decay: params.seconds * 0.6, amp: 0.5 }, { f: params.thrum * 3.05, decay: params.seconds * 0.4, amp: 0.3 }], gain);
    sfxBurst(voice, out, { when, peak: gain * 0.6, decay: 0.02, type: 'bandpass', frequency: params.kind === 'crossbow' ? 2200 : 3200, q: 1.2 });
    if (params.knock) sfxModes(voice, out, when, [{ f: params.knock, decay: 0.08, amp: 1 }, { f: params.knock * 2.5, decay: 0.05, amp: 0.4 }], gain * 0.8);
    // The air off the fletching as it leaves.
    sfxBurst(voice, out, { when: when + 0.01, peak: gain * 0.25, attack: 0.02, decay: 0.12, type: 'bandpass', frequency: 1800, q: 1.5, color: 'pink' });
    return when + params.seconds + 0.1;
  }
  // The crack: a pulse of a few ms, every frequency in it.
  sfxBurst(voice, out, { when, peak: gain * 1.2, attack: 0.0003, decay: params.kind === 'cannon' ? 0.03 : 0.012, type: 'highpass', frequency: 300 });
  // The boom behind it: the gases, low and rolling, longer for the cannon.
  const envelope = sfxEnvelope(voice, out, when, gain, 0.004, params.kind === 'cannon' ? 0.15 : 0.03, params.seconds);
  const low = sfxFilter(voice, envelope, 'lowpass', params.boom * 3, 0.8);
  sfxNoise(voice, low, when, params.seconds + 0.2, 'brown');
  sfxTone(voice, out, { when, peak: gain * 0.6, decay: params.seconds * 0.6, frequency: params.boom, to: params.boom * 0.6 });
  return when + params.seconds + 0.25;
}

/** Play an arrow's whizz past the ear into `out`: a band of noise whose pitch falls by the Doppler ratio as it goes by. */
export function playWhizz(voice, out, params, when, gain) {
  const { seconds, centre, drop } = params;
  const envelope = voice.ctx.createGain();
  voice.nodes.push(envelope);
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + seconds * 0.5);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * 0.001), when + seconds);
  envelope.connect(out);
  const band = sfxFilter(voice, envelope, 'bandpass', centre * Math.sqrt(drop), 3);
  band.frequency.setValueAtTime(centre * Math.sqrt(drop), when);
  band.frequency.exponentialRampToValueAtTime(centre / Math.sqrt(drop), when + seconds);
  sfxNoise(voice, band, when, seconds + 0.02);
  return when + seconds + 0.03;
}
