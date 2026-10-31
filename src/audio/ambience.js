// The place's own sound, from the scene's data: the wind (how strong the place is open to it), rain (the storm's look says how hard; on
// a roof when the probe's up ray finds one over the head), the sea's surf (Dunnottar's cliffs, the coast and the harbour: louder the
// nearer the water), the crowd of an arena, a few birds over an open field by day, the crackle of the braziers and torches near the
// ear, drips and the trickle of water in the castle's drains. Indoors (the probe's enclosure) the outside beds are muffled: a wall
// takes their highs and most of their level. A town's market square by day: its bustle (voices, carts, stalls) all round.
//
// The rain, the wind and the market are recordings when they have decoded (samples.js AMBIENCE_LOOPS: seamless loops, played wide):
// a recorded bed takes over from its synth bed at the same level (their RMS matched), crossfading as the beds ease; until it decodes, or
// where it fails, the synth bed plays (the market has none: the square is then as it was, the wind and the birds). The beds sit under the
// fight: as loud blows ring out they dip by up to 6 dB, and rise again as the fight quietens.
//
// Fires (a torch, a brazier, a hearth: any fire the scene lists with a size, `info.fires`) crackle where they burn: the recorded
// fire's loop, one read at each of the nearest few, placed in the world (panned as the ear turns), falling off with distance as an
// event does; a small fire quiet and thin, a large one louder, fuller and lower (FIRE_SOUND). Until the loop decodes, the synth's
// crackles scattered at the nearest.
//
// Each bed's level is a sound pressure level at the ear (dB SPL), played through the same window as everything else (synth.js
// gainOfLevel): a breeze ~45 dB, heavy rain ~65, surf under a cliff ~70, a full Colosseum ~85.
//
// `ambienceTargets` is pure (Node tests); `createAmbience` builds the beds (looped buffers made once) and scatters the one-shots.

import { EAR, distanceGain } from './ear.js';
import { gainOfLevel, sfxRandom, writeCrackle, writeGrains, lowpassInPlace } from './synth.js';
import { playBird, playCrackle, playDrip } from './sfx/world.js';
import { loopRms, startLoop } from './samples.js';

/**
 * Each place: its beds' levels (dB SPL at the ear) when the weather is fair: `wind`, `surf` (a shore near), `crowd` (an arena's),
 * `birds` (calls a minute, by day), `flow` (water running), `market` (a town's market about the square, by day), `indoor` (under a roof
 * whatever the probe finds: the ring's hall); and `rain` (0..1), a place's own weather (the container quay at night in the rain).
 */
export const PLACE_AMBIENCE = {
  ring: { wind: 0, crowd: 72, indoor: true },
  colosseum: { wind: 38, crowd: 84 },
  subway: { wind: 0, indoor: true, hum: 52 },
  stadium: { wind: 0, crowd: 86, indoor: true },
  meadow: { wind: 44, birds: 6 },
  // Maidstone's market square: the stalls and the crowd of the market about it.
  town: { wind: 40, birds: 3, market: 54 },
  port: { wind: 48, surf: 58, rain: 0.6 },
  sengoku: { wind: 50, birds: 2 },
  plain: { wind: 50, birds: 3 },
  field: { wind: 46, birds: 5 },
  coastFort: { wind: 52, surf: 68, birds: 2 },
  coastVillage: { wind: 50, surf: 66, birds: 3 },
  // A water town's square: the canal running by, and the market along its banks.
  jiangnan: { wind: 38, birds: 5, flow: 48, market: 50 },
  // A walled square in a highland valley: the wind off the hills, a few birds over the fields beyond the walls.
  cajamarca: { wind: 44, birds: 3 },
  // The open steppe at the Gobi's edge: the wind across it never stops, hardly a bird. Champagne in summer: larks over the grass.
  // The plain below Harran at noon in June: a hot wind, no birds to speak of.
  mobei: { wind: 54, birds: 1 },
  catalaunian: { wind: 46, birds: 5 },
  carrhae: { wind: 48, birds: 1 },
  // Agincourt's wet field in October between two woods (the wind in the trees, few birds); Cerignola's vineyard slope at dusk.
  agincourt: { wind: 52, birds: 1 },
  cerignola: { wind: 42, birds: 4 },
  stage: { wind: 36 },
  dunnottar: { wind: 58, surf: 76 },
};

/** The rain at its hardest (dB SPL: a downpour on stone), and the drum of it on a roof over the head. */
const RAIN = { open: 66, roof: 60 };

/**
 * The beds' levels now (dB SPL at the ear, -Infinity for none) and how much the outside is muffled:
 * `info` = { place (or `spec`, a place's beds given outright: the bench), rain (0..1: the look's share of rain; 0 dry), night, room (acoustics.js), ear ([x, y, z]), sea (y of the sea, if any),
 * waters ([{ at, ... }], the stage's), excitement (0..1: an arena's crowd roused by a blow), duck (0..1: how loud the fight is now over
 * the beds) }.
 */
export function ambienceTargets(info) {
  const spec = info.spec ?? PLACE_AMBIENCE[info.place] ?? { wind: 40 };
  const room = info.room;
  const enclosure = spec.indoor ? 1 : room?.enclosure ?? 0;
  const roofed = spec.indoor || Boolean(room?.roofed);
  // Indoors the outside comes through the walls: some 25 dB less, and only its lows.
  const muffle = Math.min(1, Math.max(0, (enclosure - 0.5) / 0.5));
  const outside = (level) => (level === undefined || level <= 0 ? -Infinity : level - 25 * muffle);
  const rain = Math.max(0, Math.min(1, Math.max(info.rain ?? 0, spec.rain ?? 0)));
  // The fight over the beds: up to 6 dB under a loud one (an arena's crowd is not ducked: it roars with the blows).
  const duck = 6 * Math.max(0, Math.min(1, info.duck ?? 0));
  // The surf: the level at the shore, falling with the height over the water (the breakers are below: inverse distance from ~4 m off).
  let surf = spec.surf ?? 0;
  if (surf && info.sea !== undefined && info.ear) surf += 20 * Math.log10(Math.min(1, 4 / Math.max(4, info.ear[1] - info.sea + 4)));
  return {
    wind: outside(spec.wind + (rain > 0 ? 6 * rain : 0)) - duck,
    rain: (rain > 0 ? outside(roofed ? -Infinity : RAIN.open + 10 * Math.log10(rain)) : -Infinity) - duck,
    roof: (rain > 0 && roofed && !spec.indoor ? RAIN.roof + 10 * Math.log10(rain) - 10 * muffle : -Infinity) - duck,
    surf: outside(surf) - duck,
    crowd: spec.crowd ? spec.crowd + 8 * (info.excitement ?? 0) : -Infinity,
    hum: (spec.hum ?? -Infinity) - duck,
    flow: (spec.flow ?? -Infinity) - duck,
    // The market by day, thinned by the rain (under the awnings, gone home).
    market: spec.market && !info.night ? outside(spec.market - 12 * rain) - duck : -Infinity,
    birds: spec.birds && !info.night && rain === 0 ? spec.birds * (1 - muffle) : 0,
    muffle,
    cutoff: 20000 * (500 / 20000) ** muffle,
  };
}

// ---- The beds --------------------------------------------------------------------------------------------------------------------------

/** A stereo loop of `seconds` filled channel by channel (decorrelated: a bed all round the head, not in it). */
function stereoLoop(ctx, seconds, fill) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) fill(buffer.getChannelData(channel), ctx.sampleRate, sfxRandom(11 + channel * 7));
  // The loop's ends faded into each other over 50 ms, so it has no click.
  const fade = Math.floor(ctx.sampleRate * 0.05);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let k = 0; k < fade; k += 1) {
      const share = k / fade;
      data[k] = data[k] * share + data[length - fade + k] * (1 - share);
    }
  }
  return buffer;
}

/** Noise filtered by a one-pole low-pass and a one-pole high-pass, at `amp`, slowly swelling by `swell(t)`. */
function noiseInto(data, rate, random, { low = 20000, high = 0, amp = 1, swell = () => 1 }) {
  const kl = 1 - Math.exp((-2 * Math.PI * low) / rate);
  const kh = 1 - Math.exp((-2 * Math.PI * Math.max(1, high)) / rate);
  let y = 0;
  let floor = 0;
  for (let index = 0; index < data.length; index += 1) {
    y += kl * (random() * 2 - 1 - y);
    floor += kh * (y - floor);
    data[index] += (high ? y - floor : y) * amp * swell(index / rate);
  }
}

/** The beds' buffers, made once per context. */
function ambienceBuffers(ctx) {
  return {
    // Wind: low rushing noise, gusting (two slow swells beating).
    wind: stereoLoop(ctx, 12, (data, rate, random) => noiseInto(data, rate, random, { low: 500, amp: 2.2, swell: (t) => 0.55 + 0.3 * Math.sin((t * 2 * Math.PI) / 6 + random() * 0.01) + 0.15 * Math.sin((t * 2 * Math.PI) / 2.4) })),
    // Rain: a hiss of countless drops, and the bigger ones heard one by one.
    rain: stereoLoop(ctx, 6, (data, rate, random) => {
      noiseInto(data, rate, random, { low: 9000, high: 900, amp: 0.6 });
      writeGrains(data, rate, { count: 900, spread: 5.95, low: 1500, high: 6000, decay: 0.008, amp: 0.25, bunch: 1, random });
    }),
    // Rain on a roof: the drum of the drops on tiles and timber, dulled through it.
    roof: stereoLoop(ctx, 6, (data, rate, random) => {
      writeCrackle(data, rate, { count: 7000, spread: 5.95, length: 0.003, amp: 0.4, random });
      noiseInto(data, rate, random, { low: 700, amp: 0.8 });
      lowpassInPlace(data, rate, 1600);
    }),
    // The surf: breakers coming in every ~9 s, each a swell of low roaring noise and the hiss of its foam running back.
    surf: stereoLoop(ctx, 18, (data, rate, random) => {
      noiseInto(data, rate, random, { low: 400, amp: 2, swell: (t) => 0.35 + 0.65 * Math.max(0, Math.sin((t * 2 * Math.PI) / 9)) ** 2 });
      noiseInto(data, rate, random, { low: 5000, high: 1200, amp: 0.35, swell: (t) => Math.max(0, Math.sin((t * 2 * Math.PI) / 9 - 1.2)) ** 3 });
    }),
    // Running water: a trickle (band-limited noise) and its bubbles.
    flow: stereoLoop(ctx, 5, (data, rate, random) => {
      noiseInto(data, rate, random, { low: 2500, high: 500, amp: 0.7 });
      writeGrains(data, rate, { count: 160, spread: 4.95, low: 500, high: 1800, decay: 0.03, amp: 0.25, bunch: 1, random });
    }),
    // A crowd: many voices at once (the far field's own bed is the same kind of thing: shouts through the mean formants).
    crowd: stereoLoop(ctx, 8, (data, rate, random) => {
      for (let v = 0; v < 70; v += 1) {
        const at = Math.floor(random() * 8 * rate);
        const length = Math.floor((0.5 + random() * 1.5) * rate);
        const f0 = 140 + random() * 200;
        let phase = 0;
        for (let k = 0; k < length; k += 1) {
          const index = (at + k) % data.length;
          phase += f0 / rate;
          const p = phase % 1;
          data[index] += (p < 0.1 ? 1 - p / 0.1 : 0) * Math.sin((Math.PI * k) / length) * 0.12;
        }
      }
      lowpassInPlace(data, rate, 2200);
      noiseInto(data, rate, random, { low: 1500, high: 200, amp: 0.25 });
    }),
    // An electric hum (the subway's lights and rails): 60 Hz and its harmonics, under a little noise.
    hum: stereoLoop(ctx, 4, (data, rate, random) => {
      for (let index = 0; index < data.length; index += 1) {
        const t = index / rate;
        data[index] = 0.3 * Math.sin(2 * Math.PI * 60 * t) + 0.15 * Math.sin(2 * Math.PI * 120 * t) + 0.08 * Math.sin(2 * Math.PI * 180 * t);
      }
      noiseInto(data, rate, random, { low: 3000, high: 300, amp: 0.1 });
    }),
  };
}

/** The beds the engine eases, in order. */
export const AMBIENCE_BEDS = ['wind', 'rain', 'roof', 'surf', 'crowd', 'hum', 'flow', 'market'];

/** The synth bed whose level each recorded one is matched to (the market's: the crowd's voices), and a trim over that (dB). */
const RECORDED = { rain: { match: 'rain', trim: 0 }, wind: { match: 'wind', trim: 0 }, market: { match: 'crowd', trim: 0 } };

/**
 * A fire's crackle by its size (m: the flame's, levelmode/kitprops.js KP_FLAME: a dim torch 0.12, a torch 0.28, a lantern's 0.16, a
 * brazier 0.5 (a great one 0.63), a hearth 0.6; a bonfire, a burning house, 1.5 and more). Any fire with a size is heard.
 *   level      dB SPL at 1 m: `torch` at a torch's size (`ref`), rising `slope` dB a tenfold of size. A flame's height goes as its heat
 *              release to the 2/5 (Heskestad: L ∝ Q^0.4), so its heat, and the noise of its burning (the fuel splitting and spitting,
 *              the gases' roar: a share of the heat), as L^2.5: 25 dB a tenfold. A torch ~51 dB at 1 m (a quiet crackle, under a man's
 *              steps), a brazier ~57, a hearth ~59, a blaze of 1.5 m ~69; never past `most`.
 *   character  from `small` (a torch's size and under: a thin hiss and tick, its lows gone: the take a little fast, high-passed high)
 *              to `large` (a blaze: a deep dark roar: the take slowed, its highs taken off), in a line over the log of the size, each
 *              of `rate`, `highpass` and `lowpass` (Hz) on a log scale between; a brazier comes out near the take as recorded (a
 *              good fire, full).
 *   nearest    how many fires are heard at once (the nearest: a phone's voices), within `within` m (past it a torch is under 30 dB);
 *              one already heard counts `stay` m nearer than a rival (two at about one distance do not take turns); a fire taken up
 *              or let go eases in or out over about `ease` s.
 *   from       the least size heard (a dim torch's 0.12 just; a candle's still flame, ~0.1, not).
 *   trim       the loop's gain over its level's (the loop's RMS is -20 dBFS, a bed's).
 */
export const FIRE_SOUND = {
  ref: 0.28, torch: 51, slope: 25, most: 75,
  small: { size: 0.2, rate: 1.15, highpass: 500, lowpass: 9000 },
  large: { size: 1.5, rate: 0.82, highpass: 45, lowpass: 3200 },
  nearest: 3, within: 16, stay: 1.5, ease: 0.4, from: 0.12, trim: 1,
};

/** A fire of `size` m: { level (dB SPL at 1 m), rate, highpass, lowpass }. */
export function fireVoice(size, spec = FIRE_SOUND) {
  const s = Math.max(1e-3, size);
  const share = Math.min(1, Math.max(0, Math.log(s / spec.small.size) / Math.log(spec.large.size / spec.small.size)));
  const between = (key) => spec.small[key] * (spec.large[key] / spec.small[key]) ** share;
  return { level: Math.min(spec.most, spec.torch + spec.slope * Math.log10(s / spec.ref)), rate: between('rate'), highpass: between('highpass'), lowpass: between('lowpass') };
}

/**
 * The fires heard now: of `fires` ([{ at, size }]) those of a size heard within reach of `ear`, the nearest `spec.nearest` (one in
 * `heard`, already sounding, a little nearer), each { fire, distance, level (dB SPL at the ear: its own, by the distance's falloff) }.
 */
export function heardFires(fires, ear, heard = [], spec = FIRE_SOUND) {
  const near = [];
  for (const fire of fires ?? []) {
    if (!(fire.size >= spec.from)) continue;
    const distance = Math.hypot(fire.at[0] - ear[0], fire.at[1] - ear[1], fire.at[2] - ear[2]);
    if (distance <= spec.within) near.push({ fire, distance, rank: distance - (heard.includes(fire) ? spec.stay : 0) });
  }
  near.sort((a, b) => a.rank - b.rank);
  return near.slice(0, spec.nearest).map(({ fire, distance }) => ({ fire, distance, level: fireVoice(fire.size, spec).level + 20 * Math.log10(distanceGain(distance)) }));
}

/** A buffer's RMS over its channels. */
function bufferRms(buffer) {
  let sum = 0;
  let count = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) sum += data[index] * data[index];
    count += data.length;
  }
  return Math.sqrt(sum / Math.max(1, count));
}

/**
 * The ambience: each bed a looped source → gain → the muffle's low-pass → `out` (the ambience bus); a recorded bed, once `bank`
 * (samples.js) has decoded its loop, alongside it, the synth bed then faded out. `update(targets, info, when, dt)`
 * eases the beds and scatters the one-shots (crackles of the fires near, drips, birds) as placed voices through `place(at, bus)`, which
 * gives a voice (synth.js) whose output is a chain panned, air-filtered and occluded as an event's is (engine.js), or null with no voice
 * free; the level of distance is set here.
 */
export function createAmbience(ctx, out, place, bank = null) {
  const buffers = ambienceBuffers(ctx);
  const muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = 20000;
  muffle.connect(out);
  // The crowd and the hum are in the place with him (not outside): they are not muffled by its walls.
  const into = (name) => (name === 'crowd' || name === 'hum' || name === 'roof' ? out : muffle);
  const beds = {};
  const recorded = {};
  /** A recorded bed started once its loop has decoded: its gain from silence, its level matched to its synth bed's. */
  function adopt(name) {
    const loop = bank?.loop?.(name);
    if (!loop || recorded[name]) return;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(into(name));
    startLoop(ctx, loop, gain, ctx.currentTime);
    const { match, trim } = RECORDED[name];
    recorded[name] = { gain, match: (bufferRms(buffers[match]) / Math.max(1e-6, loopRms(loop))) * 10 ** (trim / 20) };
  }
  for (const name of Object.keys(buffers)) {
    const source = ctx.createBufferSource();
    source.buffer = buffers[name];
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(into(name));
    source.start(ctx.currentTime, Math.random() * buffers[name].duration);
    beds[name] = gain;
  }
  const clocks = { fire: 0, drip: 0, bird: 0 };
  // The fires sounding: each fire heard → its loop's read (source → high-pass → low-pass → gain → panner, placed at the fire).
  const fires = new Map();
  function fireStart(fire, loop, voice, when) {
    const source = ctx.createBufferSource();
    source.buffer = loop.buffer;
    source.loop = true;
    source.loopStart = loop.loopStart;
    source.loopEnd = loop.loopEnd;
    source.playbackRate.value = voice.rate;
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = voice.highpass;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = voice.lowpass;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    // (Placed in the world: the context's listener is the ear, set each tick; the level of distance is set here, not by the panner.)
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'linear';
    panner.rolloffFactor = 0;
    if (panner.positionX) {
      panner.positionX.value = fire.at[0];
      panner.positionY.value = fire.at[1];
      panner.positionZ.value = fire.at[2];
    } else panner.setPosition?.(fire.at[0], fire.at[1], fire.at[2]);
    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(panner);
    panner.connect(out);
    // (Each fire somewhere else in the loop: two torches side by side do not crackle together.)
    source.start(when, loop.loopStart + Math.random() * (loop.loopEnd - loop.loopStart));
    const playing = { source, gain, nodes: [highpass, lowpass, gain, panner] };
    fires.set(fire, playing);
    return playing;
  }
  function fireStop(fire, when) {
    const playing = fires.get(fire);
    fires.delete(fire);
    playing.gain.gain.setTargetAtTime(0, when, FIRE_SOUND.ease / 3);
    playing.source.stop(when + FIRE_SOUND.ease * 2);
    playing.source.onended = () => {
      for (const node of [playing.source, ...playing.nodes]) node.disconnect();
    };
  }
  /** The nearest fires' loops eased to their levels at the ear; the rest let go. Returns whether the loop is there (false: the synth's crackles). */
  function burn(info, when) {
    const loop = bank?.loop?.('fire');
    if (!loop) return false;
    const heard = info.ear ? heardFires(info.fires, info.ear, [...fires.keys()]) : [];
    const keep = new Set(heard.map((one) => one.fire));
    for (const fire of [...fires.keys()]) if (!keep.has(fire)) fireStop(fire, when);
    for (const { fire, level } of heard) {
      const playing = fires.get(fire) ?? fireStart(fire, loop, fireVoice(fire.size), when);
      playing.gain.gain.setTargetAtTime(gainOfLevel(level) * FIRE_SOUND.trim, when, FIRE_SOUND.ease);
    }
    return true;
  }
  return {
    beds,
    recorded,
    fires,
    update(targets, info, when, dt) {
      for (const name of Object.keys(RECORDED)) adopt(name);
      for (const name of AMBIENCE_BEDS) {
        let level = targets[name];
        // Water running near: the stage's waters, by the inverse distance from the nearest (the bed's level is at 1 m).
        if (name === 'flow' && info.waters?.length && info.ear) {
          const near = nearestDistance(info.waters, info.ear);
          level = Math.max(Number.isFinite(level) ? level : -Infinity, 58 + 20 * Math.log10(distanceGain(near)));
          if (near > EAR.radius) level = targets.flow;
        }
        // (Eased: a change of place or weather fades over a second or so, and so does a recording taking over from the synth.)
        const gain = Number.isFinite(level) ? gainOfLevel(level) : 0;
        const take = recorded[name];
        beds[name]?.gain.setTargetAtTime(take ? 0 : gain, when, 0.4);
        take?.gain.gain.setTargetAtTime(gain * take.match, when, 0.4);
      }
      muffle.frequency.setTargetAtTime(targets.cutoff, when, 0.3);
      // The one-shots, each kind on its own clock (a rate a second, at random: a Poisson scatter).
      // The fires: the recorded loop at the nearest few; until it has decoded, the synth's crackles scattered at the nearest.
      clocks.fire -= dt;
      if (!burn(info, when) && clocks.fire <= 0 && info.fires?.length && info.ear) {
        clocks.fire = 0.15 + Math.random() * 0.35;
        const [fire] = heardFires(info.fires, info.ear, [], { ...FIRE_SOUND, nearest: 1 });
        if (fire) {
          const voice = place(fire.fire.at, 'ambience');
          if (voice) playCrackle(voice, voice.out, when, gainOfLevel(fire.level));
        }
      }
      clocks.drip -= dt;
      if (clocks.drip <= 0 && info.ear && (info.drips?.length || (info.waters?.length && info.room?.roofed))) {
        clocks.drip = 0.3 + Math.random() * 1.6;
        const source = info.drips?.length ? nearestOf(info.drips, info.ear) : { at: [info.ear[0] + (Math.random() - 0.5) * 12, info.ear[1] + 1, info.ear[2] + (Math.random() - 0.5) * 12], distance: 6 };
        if (source && source.distance < 14) {
          const voice = place(source.at, 'ambience');
          if (voice) playDrip(voice, voice.out, when, gainOfLevel(58 + 20 * Math.log10(distanceGain(source.distance))), Math.random() < 0.3);
        }
      }
      clocks.bird -= dt;
      if (clocks.bird <= 0 && targets.birds > 0 && info.ear) {
        // Calls a minute: the wait to the next is exponential (a scatter, not a metronome).
        clocks.bird = (-Math.log(1 - Math.random()) * 60) / targets.birds;
        const angle = Math.random() * 2 * Math.PI;
        const distance = 15 + Math.random() * 30;
        const at = [info.ear[0] + Math.cos(angle) * distance, info.ear[1] + 6 + Math.random() * 10, info.ear[2] + Math.sin(angle) * distance];
        const voice = place(at, 'ambience', true);
        if (voice) playBird(voice, voice.out, when, gainOfLevel(78 + 20 * Math.log10(1 / distance)));
      }
    },
  };
}

/** The distance from `ear` to the nearest of `things` ({ at }: a water's centre). */
function nearestDistance(things, ear) {
  let best = Infinity;
  for (const thing of things) best = Math.min(best, Math.hypot(thing.at[0] - ear[0], thing.at[1] - ear[1], thing.at[2] - ear[2]));
  return best;
}

/** The nearest of `things` ({ at, power? }) to `ear`, with its distance; null if none. */
function nearestOf(things, ear) {
  let best = null;
  for (const thing of things) {
    const distance = Math.hypot(thing.at[0] - ear[0], thing.at[1] - ear[1], thing.at[2] - ear[2]);
    if (!best || distance < best.distance) best = { at: thing.at, power: thing.power ?? 1, distance };
  }
  return best;
}
