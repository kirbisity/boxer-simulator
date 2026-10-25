// The music, sparse (the user's choice): only at moments. The menu; a level's opening (the cue once, or looped a short while, then
// faded out); the Noname boss fight while his bar shows; victory and defeat (once). The rest of the time there is none: the ambience
// and the fight are the sound.
//
// The cues are pre-rendered (ACE-Step, period instruments per scenario: audio/music/manifest.js), embedded as base64; each is decoded
// the first time it is wanted and kept. A loop is played as overlapping copies, each faded out over its last two seconds as the next
// fades in (the loop points need no zero crossing); a change of cue cross-fades the same way. Under loud action the music ducks.
//
// `musicMoment` is pure (Node tests); `createMusic` plays.

import { MUSIC_CUES, cueFor } from './music/manifest.js';

/** The music's numbers (s): the overlap of a loop's copies and of one cue into the next; how long an opening may loop; the duck's depth. */
export const MUSIC = { overlap: 2, fade: 2, openingSeconds: 45, duck: 0.55 };

/**
 * The moment the game is at, for the music: { moment ('menu' | 'opening' | 'boss' | 'victory' | 'defeat' | null), key (one occurrence of
 * it: an opening is played once per world) }. `info`: { menu (a menu screen shown), game, worldId, worldAge (s), boss (a boss bar
 * shown), outcome ('victory' | 'defeat' | null) }.
 */
export function musicMoment(info) {
  if (info.outcome) return { moment: info.outcome, key: `${info.worldId}:${info.outcome}` };
  if (info.boss) return { moment: 'boss', key: `${info.worldId}:boss` };
  if (info.menu) return { moment: 'menu', key: 'menu' };
  if (info.game === 'level' && info.worldAge < MUSIC.openingSeconds) return { moment: 'opening', key: `${info.worldId}:opening` };
  return { moment: null, key: null };
}

/** base64 → ArrayBuffer. */
function bytesOf(base64) {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index);
  return bytes.buffer;
}

/**
 * The player: `update({ moment, key, scene, duck }, when)` once a tick: the cue for the moment (manifest cueFor) played, looped and
 * cross-faded; `play(id)` a cue now (the bench); `stop()`. `onMissing(moment)`: told when a victory or defeat has no cue (the engine
 * plays a sting instead).
 */
export function createMusic(ctx, out, { onMissing = () => {} } = {}) {
  const decoded = new Map();
  const master = ctx.createGain();
  master.connect(out);
  let current = null;
  let wantedKey = null;
  let finished = new Set();

  function decode(id) {
    if (!decoded.has(id)) {
      const cue = MUSIC_CUES[id];
      decoded.set(id, cue ? ctx.decodeAudioData(bytesOf(cue.data)).catch((error) => {
        console.warn(`Gladiator: the music cue ${id} could not be decoded`, error);
        return null;
      }) : Promise.resolve(null));
    }
    return decoded.get(id);
  }

  /** One copy of a cue from `when`, fading in over `fadeIn` s; returns { source, gain, ends }. */
  function copyOf(track, when, fadeIn) {
    const { buffer, cue } = track;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    const level = cue.gain ?? 1;
    gain.gain.setValueAtTime(fadeIn > 0 ? 0.0001 : level, when);
    if (fadeIn > 0) gain.gain.linearRampToValueAtTime(level, when + fadeIn);
    source.connect(gain);
    gain.connect(track.bus);
    const start = cue.loop ? cue.loopStart ?? 0 : 0;
    const end = cue.loop ? Math.min(buffer.duration, cue.loopEnd ?? buffer.duration) : buffer.duration;
    source.start(when, start);
    const ends = when + (end - start);
    if (cue.loop) {
      // The copy's own tail, faded as the next copy comes in over it.
      gain.gain.setValueAtTime(level, ends - MUSIC.overlap);
      gain.gain.linearRampToValueAtTime(0.0001, ends);
    }
    source.stop(ends + 0.05);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    return { source, gain, ends };
  }

  /** Fade a track out over `seconds` and let it go. */
  function release(track, when, seconds = MUSIC.fade) {
    if (!track) return;
    track.released = true;
    track.bus.gain.cancelScheduledValues(when);
    track.bus.gain.setValueAtTime(track.bus.gain.value, when);
    track.bus.gain.linearRampToValueAtTime(0.0001, when + seconds);
    for (const copy of track.copies) copy.source.stop(when + seconds + 0.05);
    setTimeout(() => track.bus.disconnect(), (seconds + 0.2) * 1000);
  }

  async function start(id, key, moment, when) {
    const buffer = await decode(id);
    if (!buffer || wantedKey !== key) return;
    const cue = MUSIC_CUES[id];
    const bus = ctx.createGain();
    bus.connect(master);
    const at = Math.max(when, ctx.currentTime);
    const track = { id, key, moment, buffer, cue, bus, copies: [], begun: at, released: false };
    release(current, at);
    track.copies.push(copyOf(track, at, current ? MUSIC.fade : 0.5));
    current = track;
  }

  /** Keep the playing cue going: the next copy of a loop laid over the last one's tail, an opening let go after its while. */
  function maintain(when) {
    const track = current;
    if (!track || track.released) return;
    const last = track.copies[track.copies.length - 1];
    // An opening loops a short while and fades; a cue that does not loop is done when it ends.
    if (track.moment === 'opening' && when - track.begun > MUSIC.openingSeconds - MUSIC.fade) {
      finished.add(track.key);
      release(track, when, MUSIC.fade * 2);
      current = null;
      return;
    }
    if (track.cue.loop && last.ends - when < MUSIC.overlap + 0.4) {
      track.copies.push(copyOf(track, last.ends - MUSIC.overlap, MUSIC.overlap));
      if (track.copies.length > 3) track.copies.shift();
    } else if (!track.cue.loop && when > last.ends) {
      finished.add(track.key);
      current = null;
    }
  }

  return {
    master,
    maintain,
    /** What is playing (the bench, tests): its cue and how many copies of it are laid down. */
    status: () => ({ id: current?.id ?? null, copies: current?.copies.length ?? 0, moment: current?.moment ?? null }),
    update({ moment, key, scene, duck = 0 }, when) {
      master.gain.setTargetAtTime(1 - MUSIC.duck * Math.max(0, Math.min(1, duck)), when, 0.25);
      if (key !== wantedKey) {
        wantedKey = key;
        const id = moment && !finished.has(key) ? cueFor(scene, moment) : null;
        if (!id) {
          if ((moment === 'victory' || moment === 'defeat') && !finished.has(key)) onMissing(moment);
          if (key) finished.add(key);
          release(current, when);
          current = null;
        } else if (current?.id !== id) start(id, key, moment, when);
        else current.key = key;
      }
      maintain(when);
    },
    /** Play a cue now (the bench), whatever the moment. */
    play(id) {
      wantedKey = `bench:${id}:${ctx.currentTime}`;
      return start(id, wantedKey, 'bench', ctx.currentTime);
    },
    stop() {
      wantedKey = null;
      release(current, ctx.currentTime, 0.5);
      current = null;
    },
    forget() {
      finished = new Set();
    },
  };
}
