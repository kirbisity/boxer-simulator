// The air a fire burns in: each place's wind (its way, its strength, how gusty), the gusts over the fight's time, the shelter of a
// roof, and how far a flame leans in the air going past it.
//
// The wind of a place is the place's own (PLACE_WIND), a level's weather's if it brings one (scenarios.js `weather.wind`; mist lies
// in still air, so a misty morning without one is near calm), and at Dunnottar the stage look's (stagelooks.js `wind`), blowing the
// way the look's rain slants. Under a roof (a stage's interiors, or a ceiling low over the point) only a draught of it gets in.
//
// A flame leans by the air going past it: the wind less the speed of what burns (a man running drags his flames behind him). How far
// is the pool-fire tilt of the AGA/Welker-Sliepcevich correlations: cos θ = 1 / sqrt(u*) for u* ≥ 1, u* the air's speed over the
// fire's own buoyant velocity (g Q / (ρ cp T D))^(1/3) (~1.5 m/s for a man's flames, ~3 m/s for a big pool), eased in below
// u* = 1 rather than cut off. The gusts are a few slow sines (periods of 3 to 16 s) on the strength and a little on the way; a
// flame's own shake a few faster ones, stronger as the air past it grows. All of it is a pure function of the fight's time, so it
// is the same at any frame rate and stands still while the fight is paused.

import { ceilingAt } from './physics/terrain.js';
import { interiorAt } from './levelmode/stage.js';
import { stageLookOf } from './levelmode/stagelooks.js';

export const WIND = {
  // Under a roof: this share of the wind outside gets in (a draught through the doors and the slits), gusting with it.
  indoors: { share: 0.04 },
  // A ceiling less than this far over a point (m) is a roof over it.
  roof: 7,
  // Mist and fog without a wind of their own: lying in still air, no more than this (m/s).
  mistMost: 0.8,
  // The gusts: the strength is the mean times exp(`swing` x `gust` (the place's) x a sum of sines at these rates (Hz) and weights),
  // so it swells and drops smoothly by about the gust factors measured near the ground (1.4-1.8 in strong wind) and never stops dead;
  // the way turns by up to `turn` rad times `gust`.
  gustRates: [0.063, 0.151, 0.37, 0.93],
  gustWeights: [0.45, 0.3, 0.17, 0.08],
  turnRates: [0.047, 0.113, 0.29],
  turn: 0.45,
  swing: 1.0,
  // The tilt: never past `most` rad from upright.
  most: 1.25,
  // A flame's own shake (rad): `still` in calm air, up to `still + moving` in air past it at `movingAt` m/s; at these rates (Hz).
  shake: { still: 0.05, moving: 0.2, movingAt: 7, along: [1.7, 4.3], across: [2.9, 6.1] },
  // How fast a flame takes up a change in the air past it (s): a man turning, stopping, coming in out of the wind.
  follow: 0.15,
};

// The way the Dunnottar storm's rain slants (levelmode/storm.js STORM.rain.slant [3.2, 0, -1.4]): its wind blows that way.
const DUNNOTTAR_TOWARD = [3.2, -1.4];

// Each place's air: `toward` the way it blows (x, z), `speed` m/s, `gust` how much it swells and drops (0..1). Calm under a roof
// (the ring's hall, the stadium), a draught down the subway, light breezes on the open fields, the sea wind on the coasts and the quay.
export const PLACE_WIND = {
  ring: { toward: [1, 0], speed: 0, gust: 0 },
  stadium: { toward: [1, 0], speed: 0, gust: 0 },
  subway: { toward: [1, 0], speed: 0.3, gust: 0.6 },
  colosseum: { toward: [0.94, 0.34], speed: 2, gust: 0.35 },
  meadow: { toward: [0.94, 0.34], speed: 2.5, gust: 0.4 },
  town: { toward: [0.8, 0.6], speed: 1.5, gust: 0.35 },
  // Night rain on the quay, slanting with the wind off the water (render.js buildPort's rain).
  port: { toward: [0.6, -0.25], speed: 4, gust: 0.4 },
  sengoku: { toward: [0.94, 0.34], speed: 2, gust: 0.35 },
  plain: { toward: [0.94, -0.34], speed: 3, gust: 0.35 },
  field: { toward: [0.94, 0.34], speed: 3, gust: 0.35 },
  coastFort: { toward: [0.3, -0.95], speed: 4.5, gust: 0.3 },
  coastVillage: { toward: [0.3, -0.95], speed: 4.5, gust: 0.3 },
  jiangnan: { toward: [0.94, 0.34], speed: 1.2, gust: 0.3 },
  cajamarca: { toward: [-0.8, 0.6], speed: 2.5, gust: 0.35 },
  // Mobei: the fighting ran on to dusk with a wind getting up off the Gobi.
  mobei: { toward: [0.94, 0.34], speed: 6, gust: 0.45 },
  catalaunian: { toward: [0.94, 0.34], speed: 2, gust: 0.3 },
  carrhae: { toward: [0.8, -0.6], speed: 3, gust: 0.4 },
  agincourt: { toward: [0.94, 0.34], speed: 3, gust: 0.35 },
  // A cold still dawn in the mist.
  lastgate: { toward: [0.94, 0.34], speed: 1, gust: 0.3 },
  cerignola: { toward: [0.94, 0.34], speed: 2, gust: 0.3 },
  stage: { toward: [0.94, 0.34], speed: 3, gust: 0.3 },
  // The look's (stagelooks.js `wind`); this only where a look says nothing.
  dunnottar: { toward: DUNNOTTAR_TOWARD, speed: 6, gust: 0.4 },
};

/**
 * The air of a place: `place` (render.js's key), the level's `weather` (or null), and at Dunnottar the stage `look`'s name.
 * Returns { x, z: the unit way it blows, speed: m/s, gust: 0..1 } (a new object: call it when these change, not every frame).
 */
export function placeWind(place, weather = null, look = null) {
  const own = PLACE_WIND[place] ?? PLACE_WIND.ring;
  let { speed, gust } = own;
  if (place === 'dunnottar' && look) ({ speed, gust } = stageLookOf(look).wind ?? own);
  if (weather?.wind) ({ speed, gust } = { speed: weather.wind.speed ?? speed, gust: weather.wind.gust ?? gust });
  else if (weather?.fog) speed = Math.min(speed, WIND.mistMost);
  const toward = weather?.wind?.toward ?? own.toward;
  const length = Math.hypot(toward[0], toward[1]) || 1;
  return { x: toward[0] / length, z: toward[1] / length, speed, gust };
}

/** A sum of sines at `rates` (Hz) and `weights`, -1..1 (about), at `time` s, its phases set by `seed`. */
function windSines(rates, weights, time, seed) {
  let sum = 0;
  let total = 0;
  for (let index = 0; index < rates.length; index += 1) {
    const weight = weights ? weights[index] : 1;
    sum += weight * Math.sin(Math.PI * 2 * rates[index] * time + seed * (index * 2.31 + 1.7));
    total += weight;
  }
  return sum / total;
}

/**
 * The wind outside now (`base` a placeWind), gusting over the fight's `time`: written into `out` ({ x, z } m/s, `speed`), returned.
 * The gusts are the same at the same moment of the fight however it is stepped, and stand still with it.
 */
export function windNow(base, time, out = { x: 0, z: 0, speed: 0 }) {
  const swell = Math.exp(WIND.swing * base.gust * windSines(WIND.gustRates, WIND.gustWeights, time, 1));
  const speed = base.speed * swell;
  const turn = base.gust * WIND.turn * windSines(WIND.turnRates, null, time, 2);
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  out.x = (base.x * cos - base.z * sin) * speed;
  out.z = (base.x * sin + base.z * cos) * speed;
  out.speed = speed;
  return out;
}

/** How much of the wind outside reaches a point of `world` (1 in the open, WIND.indoors.share under a roof). */
export function windShelter(world, x, y, z) {
  const stage = world?.stage?.def;
  if (stage && interiorAt(stage, x, y, z)) return WIND.indoors.share;
  const terrain = world?.arena?.terrain;
  if (terrain && ceilingAt(terrain, x, z, y) < y + WIND.roof) return WIND.indoors.share;
  return 1;
}

/** How far a flame leans from upright (rad) in air going past it at `speed` m/s, its own buoyant velocity `buoyant` m/s. */
export function flameTilt(speed, buoyant) {
  const u = speed / Math.max(0.05, buoyant);
  // cos θ = (1 + u⁴)^(-1/8): 1/sqrt(u) when the wind is strong (the AGA correlation), easing to upright as it drops.
  const cos = (1 + u ** 4) ** -0.125;
  return Math.min(WIND.most, Math.acos(cos));
}

/**
 * The way a flame burns (a unit vector written into `out` [x, y, z]): up by its buoyancy, leaned by the air going past it
 * (`airX`, `airZ` m/s: the wind less the speed of what burns), shaken by its own flicker (`seed`, at the fight's `time`).
 */
export function flameAxis(out, airX, airZ, buoyant, seed = 0, time = 0) {
  const speed = Math.hypot(airX, airZ);
  let hx;
  let hz;
  if (speed > 1e-4) {
    hx = airX / speed;
    hz = airZ / speed;
  } else {
    hx = Math.cos(seed * 6.283);
    hz = Math.sin(seed * 6.283);
  }
  const shake = WIND.shake;
  const amount = shake.still + shake.moving * Math.min(1, speed / shake.movingAt);
  const along = amount * windSines(shake.along, null, time, seed * 3.1 + 0.5);
  const across = amount * 0.8 * windSines(shake.across, null, time, seed * 5.3 + 1.1);
  const tilt = flameTilt(speed, buoyant) + along;
  const lean = Math.sin(tilt);
  const side = Math.sin(across);
  const x = lean * hx - side * hz;
  const y = Math.cos(tilt) * Math.cos(across);
  const z = lean * hz + side * hx;
  const length = Math.hypot(x, y, z);
  out[0] = x / length;
  out[1] = y / length;
  out[2] = z / length;
  return out;
}

/** The share of a step of `dt` s by which something following with time constant `seconds` closes on its target (frame-rate free). */
export const windFollowShare = (dt, seconds = WIND.follow) => (dt > 0 ? 1 - Math.exp(-dt / seconds) : 0);
