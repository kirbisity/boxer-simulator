// The world's own sounds: thunder (a `thunder` event: a crack near, a long rumble far, the bolt's channel heard a stretch at a time as
// its kilometres of length arrive one after another), the mechanisms of the castle (`mech`: a door's creak and slam, a gate's or a
// portcullis's chain, a drawbridge's, a ladder of wood, a lock and its key, a thing picked up, a chest, a lever), and the one-shots the
// ambience scatters (ambience.js): a drip, a fire's crackle, a bird.

import { sfxBuffer, sfxBurst, sfxClamp, sfxEnvelope, sfxFilter, sfxGain, sfxModes, sfxNoise, sfxPlayBuffer, sfxRun, sfxTone, writeCrackle, writeGrains, lowpassInPlace } from '../synth.js';

/**
 * Thunder at `distance` m: { level at 1 m, seconds (the rumble: longer the further, as more of the channel is heard spread out),
 * crack (0..1: only a near strike cracks) }. A strike is ~160 dB at a metre's equivalent: ~110 dB 300 m off.
 */
export function thunderParams(event) {
  const distance = Math.max(50, event.distance ?? 2000);
  return { level: 160, distance, seconds: sfxClamp(1.5 + distance / 700, 1.5, 7), crack: sfxClamp(1 - distance / 1200, 0, 1) };
}

/** Play thunder into `out` (its distance's level and air are the ear's). */
export function playThunder(voice, out, params, when, gain) {
  const { seconds, crack } = params;
  if (crack > 0) {
    sfxBurst(voice, out, { when, peak: gain * crack * 1.2, attack: 0.001, decay: 0.08, type: 'highpass', frequency: 600 });
    sfxBurst(voice, out, { when: when + 0.02, peak: gain * crack, attack: 0.002, decay: 0.4, type: 'bandpass', frequency: 1200, q: 0.6 });
  }
  // The rumble: brown noise, low-passed, in swells (the channel's kinks arriving one by one).
  const envelope = sfxEnvelope(voice, out, when, gain, 0.15, seconds * 0.15, seconds * 0.85);
  const swells = sfxGain(voice, envelope, 0.6);
  const lfo = voice.ctx.createOscillator();
  lfo.frequency.value = 0.7 + Math.random() * 0.8;
  lfo.connect(sfxGain(voice, swells.gain, 0.4));
  sfxRun(voice, lfo, when, when + seconds + 0.2);
  const low = sfxFilter(voice, swells, 'lowpass', 180 + 300 * crack, 0.7);
  sfxNoise(voice, low, when, seconds + 0.2, 'brown');
  return when + seconds + 0.3;
}

/** Each mechanism: its level at 1 m (dB SPL) and its make-up. */
export const MECHS = {
  door: { level: 78 },
  gate: { level: 86 },
  portcullis: { level: 90 },
  drawbridge: { level: 92 },
  ladder: { level: 72 },
  lock: { level: 62 },
  pickup: { level: 55 },
  chest: { level: 70 },
  lever: { level: 78 },
};

/** What a mechanism sounds like, without a context: { kind, state, level, seconds }. */
export function mechParams(event) {
  const kind = MECHS[event.kind] ? event.kind : 'door';
  const seconds = { door: 0.9, gate: 1.4, portcullis: 2.4, drawbridge: 3, ladder: 0.35, lock: 0.5, pickup: 0.25, chest: 0.8, lever: 0.6 }[kind];
  return { kind, state: event.state ?? 'open', level: MECHS[kind].level, seconds };
}

/** A creak: stick-slip of wood on a pin (a train of clicks, its rate wandering) through the board's resonances. */
function playCreak(voice, out, when, seconds, gain, rate = 55) {
  const buffer = sfxBuffer(voice.ctx, seconds, (data, sampleRate) => {
    let t = 0;
    let period = 1 / rate;
    while (t < seconds) {
      const at = Math.floor(t * sampleRate);
      for (let k = 0; k < 40 && at + k < data.length; k += 1) data[at + k] += (Math.random() * 2 - 1) * (1 - k / 40) * 0.8;
      // The slip's rate wanders as the pressure on the pin does.
      period *= 1 + (Math.random() - 0.5) * 0.25;
      period = sfxClamp(period, 1 / (rate * 2.5), 2.5 / rate);
      t += period;
    }
  });
  // The board's two lowest resonances, fed together.
  const body = sfxGain(voice, sfxFilter(voice, out, 'bandpass', 700, 3), 1);
  body.connect(sfxFilter(voice, out, 'bandpass', 1500, 4));
  sfxPlayBuffer(voice, body, buffer, when, gain * 1.6);
}

/** A chain running over its wheel: links knocking, fast and even. */
function playChain(voice, out, when, seconds, gain) {
  const buffer = sfxBuffer(voice.ctx, seconds + 0.05, (data, rate) => {
    writeGrains(data, rate, { count: Math.round(seconds * 28), spread: seconds, low: 1800, high: 5200, decay: 0.03, amp: 0.4, bunch: 1 });
    writeGrains(data, rate, { count: Math.round(seconds * 10), spread: seconds, low: 400, high: 900, decay: 0.05, amp: 0.4, bunch: 1 });
  });
  sfxPlayBuffer(voice, out, buffer, when, gain);
}

/** A heavy wooden thing coming to its stop: a big knock. */
function playSlam(voice, out, when, gain, base = 110) {
  sfxModes(voice, out, when, [{ f: base, decay: 0.3, amp: 1 }, { f: base * 2.3, decay: 0.18, amp: 0.6 }, { f: base * 4.1, decay: 0.1, amp: 0.3 }], gain);
  sfxBurst(voice, out, { when, peak: gain * 0.7, decay: 0.12, type: 'lowpass', frequency: 800, color: 'pink' });
}

/** Play a mechanism into `out`. Returns the end time. */
export function playMech(voice, out, params, when, gain) {
  const { kind, seconds } = params;
  const opening = params.state !== 'closed' && params.state !== 'shut' && params.state !== 'down';
  if (kind === 'door') {
    playCreak(voice, out, when, seconds * 0.8, gain * 0.7, opening ? 45 : 65);
    if (!opening) playSlam(voice, out, when + seconds * 0.75, gain);
    return when + seconds + 0.4;
  }
  if (kind === 'gate' || kind === 'chest') {
    playCreak(voice, out, when, seconds * 0.7, gain * 0.6, 35);
    playSlam(voice, out, when + seconds * 0.7, gain * 0.8, kind === 'chest' ? 160 : 90);
    if (kind === 'gate') sfxModes(voice, out, when + seconds * 0.7, [{ f: 820, decay: 0.4, amp: 1 }, { f: 1900, decay: 0.25, amp: 0.5 }], gain * 0.4);
    return when + seconds + 0.4;
  }
  if (kind === 'portcullis' || kind === 'drawbridge') {
    playChain(voice, out, when, seconds, gain * 0.9);
    // Its weight coming to rest: iron on stone, or the bridge's timber on the far side.
    if (kind === 'portcullis') sfxModes(voice, out, when + seconds, [{ f: 240, decay: 0.5, amp: 1 }, { f: 610, decay: 0.3, amp: 0.6 }, { f: 1450, decay: 0.2, amp: 0.4 }], gain);
    else playSlam(voice, out, when + seconds, gain * 1.1, 70);
    return when + seconds + 0.6;
  }
  if (kind === 'ladder') {
    sfxModes(voice, out, when, [{ f: 330, decay: 0.12, amp: 1 }, { f: 820, decay: 0.07, amp: 0.5 }], gain);
    playCreak(voice, out, when + 0.03, 0.2, gain * 0.3, 80);
    return when + 0.4;
  }
  if (kind === 'lock') {
    // The key in, the wards turning, the bolt going over.
    const buffer = sfxBuffer(voice.ctx, seconds, (data, rate) => {
      writeGrains(data, rate, { count: 4, spread: 0.12, low: 2500, high: 5000, decay: 0.02, amp: 0.5 });
      writeGrains(data, rate, { count: 2, spread: 0.05, start: seconds * 0.6, low: 900, high: 1600, decay: 0.06, amp: 0.8 });
    });
    sfxPlayBuffer(voice, out, buffer, when, gain);
    return when + seconds + 0.05;
  }
  if (kind === 'lever') {
    sfxModes(voice, out, when, [{ f: 420, decay: 0.3, amp: 1 }, { f: 1130, decay: 0.2, amp: 0.5 }, { f: 2400, decay: 0.1, amp: 0.3 }], gain * 0.8);
    const ratchet = sfxBuffer(voice.ctx, seconds, (data, rate) => writeGrains(data, rate, { count: 7, spread: seconds * 0.8, low: 1800, high: 2600, decay: 0.012, amp: 0.6, bunch: 1 }));
    sfxPlayBuffer(voice, out, ratchet, when + 0.05, gain * 0.7);
    return when + seconds + 0.3;
  }
  // A thing picked up: cloth and a small knock.
  sfxBurst(voice, out, { when, peak: gain * 0.6, attack: 0.02, decay: 0.15, type: 'bandpass', frequency: 2500, q: 0.8, color: 'pink' });
  sfxTone(voice, out, { when: when + 0.05, peak: gain * 0.4, decay: 0.08, frequency: 600 });
  return when + seconds + 0.05;
}

/** A drop of water into a pool (or onto stone): the plink of the bubble it traps, its pitch by the bubble's size (Minnaert). */
export function playDrip(voice, out, when, gain, onStone = false) {
  if (onStone) {
    sfxBurst(voice, out, { when, peak: gain, decay: 0.02, type: 'bandpass', frequency: 3000 + Math.random() * 1500, q: 2 });
    return when + 0.05;
  }
  const f = 900 + Math.random() * 1500;
  sfxTone(voice, out, { when, peak: gain, attack: 0.001, decay: 0.06, frequency: f, to: f * 1.6 });
  return when + 0.1;
}

/** A fire's crackle: a few bursts of resin and the pop of a knot now and then. */
export function playCrackle(voice, out, when, gain) {
  const seconds = 0.5 + Math.random() * 0.6;
  const buffer = sfxBuffer(voice.ctx, seconds, (data, rate) => {
    writeCrackle(data, rate, { count: 18 + Math.floor(Math.random() * 30), spread: seconds * 0.95, length: 0.0015, amp: 0.7 });
    if (Math.random() < 0.3) writeCrackle(data, rate, { count: 1, spread: 0.01, start: seconds * Math.random() * 0.8, length: 0.006, amp: 1.2 });
    lowpassInPlace(data, rate, 6500);
  });
  sfxPlayBuffer(voice, out, buffer, when, gain);
  return when + seconds;
}

/** A bird's call: a few quick falling chirps (a sine swept over a few kHz). */
export function playBird(voice, out, when, gain) {
  const notes = 2 + Math.floor(Math.random() * 4);
  const base = 2800 + Math.random() * 2400;
  let t = when;
  for (let k = 0; k < notes; k += 1) {
    sfxTone(voice, out, { when: t, peak: gain * (0.7 + Math.random() * 0.3), attack: 0.005, decay: 0.07, frequency: base * (1.2 + Math.random() * 0.2), to: base * 0.8 });
    t += 0.09 + Math.random() * 0.07;
  }
  return t + 0.1;
}
