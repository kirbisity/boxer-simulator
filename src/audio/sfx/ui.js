// The menus' sounds: a click on a button, a confirm (two notes up) on the button that starts something, a back (a note down), and the
// short stings of a victory and a defeat (played when the scene has no music cue for them). Not in the world: no distance, no room;
// straight into the effects bus.

import { sfxBurst, sfxTone } from '../synth.js';

/** The notes of each UI sound: [semitones over A4, start (s), length (s)]; and its kind of tone. */
export const UI_SOUNDS = {
  click: { notes: [[3, 0, 0.04]], type: 'triangle', tick: true },
  confirm: { notes: [[3, 0, 0.07], [10, 0.06, 0.12]], type: 'triangle' },
  back: { notes: [[7, 0, 0.06], [0, 0.05, 0.1]], type: 'triangle' },
  // A rising fanfare in the major; a falling minor line.
  victory: { notes: [[0, 0, 0.18], [4, 0.15, 0.18], [7, 0.3, 0.18], [12, 0.45, 0.7]], type: 'sawtooth', soft: true },
  defeat: { notes: [[7, 0, 0.3], [3, 0.28, 0.3], [0, 0.56, 0.3], [-5, 0.84, 1]], type: 'sawtooth', soft: true },
};

/** A UI sound's notes as frequencies (Hz) and times, without a context. */
export function uiParams(kind) {
  const spec = UI_SOUNDS[kind] ?? UI_SOUNDS.click;
  return { kind, type: spec.type, tick: Boolean(spec.tick), soft: Boolean(spec.soft), notes: spec.notes.map(([semitones, at, seconds]) => ({ f: 440 * 2 ** (semitones / 12), at, seconds })) };
}

/** Play a UI sound into `out`. Returns the end time. */
export function playUi(voice, out, params, when, gain) {
  let end = when;
  for (const note of params.notes) {
    const peak = gain * (params.soft ? 0.25 : 0.35);
    sfxTone(voice, out, { when: when + note.at, peak, attack: params.soft ? 0.02 : 0.003, hold: params.soft ? note.seconds * 0.5 : 0, decay: note.seconds, frequency: note.f, type: params.type });
    if (params.soft) sfxTone(voice, out, { when: when + note.at, peak: peak * 0.6, attack: 0.02, hold: note.seconds * 0.5, decay: note.seconds, frequency: note.f * 1.005, type: 'triangle' });
    end = Math.max(end, when + note.at + note.seconds * 1.5);
  }
  if (params.tick) sfxBurst(voice, out, { when, peak: gain * 0.25, decay: 0.012, type: 'highpass', frequency: 3000 });
  return end + 0.05;
}
