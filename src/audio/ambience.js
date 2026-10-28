// The place's own sound, from the scene's data: the wind (how strong the place is open to it), rain (the storm's look says how hard; on
// a roof when the probe's up ray finds one over the head), the sea's surf (Dunnottar's cliffs, the coast and the harbour: louder the
// nearer the water), the crowd of an arena, a few birds over an open field by day, the crackle of the braziers and torches near the
// ear, drips and the trickle of water in the castle's drains. Indoors (the probe's enclosure) the outside beds are muffled: a wall
// takes their highs and most of their level.
//
// Each bed's level is a sound pressure level at the ear (dB SPL), played through the same window as everything else (synth.js
// gainOfLevel): a breeze ~45 dB, heavy rain ~65, surf under a cliff ~70, a full Colosseum ~85.
//
// `ambienceTargets` is pure (Node tests); `createAmbience` builds the beds (looped buffers made once) and scatters the one-shots.

import { EAR, distanceGain } from './ear.js';
import { gainOfLevel, sfxRandom, writeCrackle, writeGrains, lowpassInPlace } from './synth.js';
import { playBird, playCrackle, playDrip } from './sfx/world.js';

/**
 * Each place: its beds' levels (dB SPL at the ear) when the weather is fair: `wind`, `surf` (a shore near), `crowd` (an arena's),
 * `birds` (calls a minute, by day), `flow` (water running), `indoor` (under a roof whatever the probe finds: the ring's hall).
 */
export const PLACE_AMBIENCE = {
  ring: { wind: 0, crowd: 72, indoor: true },
  colosseum: { wind: 38, crowd: 84 },
  subway: { wind: 0, indoor: true, hum: 52 },
  stadium: { wind: 0, crowd: 86, indoor: true },
  meadow: { wind: 44, birds: 6 },
  town: { wind: 40, birds: 3 },
  port: { wind: 48, surf: 58 },
  sengoku: { wind: 50, birds: 2 },
  plain: { wind: 50, birds: 3 },
  field: { wind: 46, birds: 5 },
  coastFort: { wind: 52, surf: 68, birds: 2 },
  coastVillage: { wind: 50, surf: 66, birds: 3 },
  jiangnan: { wind: 38, birds: 5, flow: 48 },
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
 * waters ([{ at, ... }], the stage's), excitement (0..1: an arena's crowd roused by a blow) }.
 */
export function ambienceTargets(info) {
  const spec = info.spec ?? PLACE_AMBIENCE[info.place] ?? { wind: 40 };
  const room = info.room;
  const enclosure = spec.indoor ? 1 : room?.enclosure ?? 0;
  const roofed = spec.indoor || Boolean(room?.roofed);
  // Indoors the outside comes through the walls: some 25 dB less, and only its lows.
  const muffle = Math.min(1, Math.max(0, (enclosure - 0.5) / 0.5));
  const outside = (level) => (level === undefined || level <= 0 ? -Infinity : level - 25 * muffle);
  const rain = Math.max(0, Math.min(1, info.rain ?? 0));
  // The surf: the level at the shore, falling with the height over the water (the breakers are below: inverse distance from ~4 m off).
  let surf = spec.surf ?? 0;
  if (surf && info.sea !== undefined && info.ear) surf += 20 * Math.log10(Math.min(1, 4 / Math.max(4, info.ear[1] - info.sea + 4)));
  return {
    wind: outside(spec.wind + (rain > 0 ? 6 * rain : 0)),
    rain: rain > 0 ? outside(roofed ? -Infinity : RAIN.open + 10 * Math.log10(rain)) : -Infinity,
    roof: rain > 0 && roofed && !spec.indoor ? RAIN.roof + 10 * Math.log10(rain) - 10 * muffle : -Infinity,
    surf: outside(surf),
    crowd: spec.crowd ? spec.crowd + 8 * (info.excitement ?? 0) : -Infinity,
    hum: spec.hum ?? -Infinity,
    flow: spec.flow ?? -Infinity,
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

/**
 * The ambience: each bed a looped source → gain → the muffle's low-pass → `out` (the ambience bus). `update(targets, info, when, dt)`
 * eases the beds and scatters the one-shots (crackles of the fires near, drips, birds) as placed voices through `place(at, bus)`, which
 * gives a voice (synth.js) whose output is a chain panned, air-filtered and occluded as an event's is (engine.js), or null with no voice
 * free; the level of distance is set here.
 */
export function createAmbience(ctx, out, place) {
  const buffers = ambienceBuffers(ctx);
  const muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = 20000;
  muffle.connect(out);
  const beds = {};
  for (const name of Object.keys(buffers)) {
    const source = ctx.createBufferSource();
    source.buffer = buffers[name];
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    // The crowd and the hum are in the place with him (not outside): they are not muffled by its walls.
    gain.connect(name === 'crowd' || name === 'hum' || name === 'roof' ? out : muffle);
    source.start(ctx.currentTime, Math.random() * buffers[name].duration);
    beds[name] = gain;
  }
  const clocks = { fire: 0, drip: 0, bird: 0 };
  return {
    beds,
    update(targets, info, when, dt) {
      for (const name of ['wind', 'rain', 'roof', 'surf', 'crowd', 'hum', 'flow']) {
        let level = targets[name];
        // Water running near: the stage's waters, by the inverse distance from the nearest (the bed's level is at 1 m).
        if (name === 'flow' && info.waters?.length && info.ear) {
          const near = nearestDistance(info.waters, info.ear);
          level = Math.max(Number.isFinite(level) ? level : -Infinity, 58 + 20 * Math.log10(distanceGain(near)));
          if (near > EAR.radius) level = targets.flow;
        }
        beds[name].gain.setTargetAtTime(Number.isFinite(level) ? gainOfLevel(level) : 0, when, 0.4);
      }
      muffle.frequency.setTargetAtTime(targets.cutoff, when, 0.3);
      // The one-shots, each kind on its own clock (a rate a second, at random: a Poisson scatter).
      clocks.fire -= dt;
      if (clocks.fire <= 0 && info.fires?.length && info.ear) {
        clocks.fire = 0.15 + Math.random() * 0.35;
        const fire = nearestOf(info.fires, info.ear);
        if (fire && fire.distance < 12) {
          const voice = place(fire.at, 'ambience');
          if (voice) playCrackle(voice, voice.out, when, gainOfLevel((fire.power > 1.2 ? 62 : 55) + 20 * Math.log10(distanceGain(fire.distance))));
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
