// A foot coming down (the `step` event) on its surface: stone a tap of the heel and the scuff of the sole, earth a soft thud, grass a
// swish, sand a hiss, wood a hollow knock, mud a squelch, water a splash as deep and as fast as the foot goes into it, tile a brighter
// tap, snow a crunch. The energy is the foot's (the leg's share of the body, ~15%, at the speed it comes down at, which grows with the
// pace): a heavier man is louder and lower; his armour moves with every step (a jingle of mail, a clank of plate, a rattle of lamellar).

import { levelFromEnergy, sfxBuffer, sfxBurst, sfxClamp, sfxModes, sfxPlayBuffer, sfxTone, writeCrackle, writeGrains, lowpassInPlace } from '../synth.js';
import { playArmourShake } from './impact.js';

/**
 * Each surface: `efficiency` (the share of the foot's energy it turns to sound: a hard floor rings a little, soft earth swallows it),
 * `seconds`, and its make-up: `tap` (the hard click's band), `thud` (the body of it), `grain` (a granular layer: grass, sand, snow).
 */
export const SURFACES = {
  stone: { efficiency: 4e-6, seconds: 0.06, tap: 3200, thud: 180 },
  tile: { efficiency: 5e-6, seconds: 0.05, tap: 4200, thud: 220 },
  wood: { efficiency: 1.2e-5, seconds: 0.1, tap: 1800, thud: 160, knock: 230 },
  earth: { efficiency: 1.2e-6, seconds: 0.08, thud: 110 },
  grass: { efficiency: 1e-6, seconds: 0.12, thud: 100, grain: { kind: 'swish', low: 2500, high: 7000 } },
  sand: { efficiency: 1e-6, seconds: 0.14, thud: 90, grain: { kind: 'hiss', low: 3500, high: 9000 } },
  snow: { efficiency: 1.2e-6, seconds: 0.16, thud: 120, grain: { kind: 'crunch', low: 900, high: 3200 } },
  mud: { efficiency: 2.5e-6, seconds: 0.22, thud: 90, squelch: true },
  water: { efficiency: 8e-6, seconds: 0.2, thud: 80, splash: true },
};

/** The leg's share of the body that comes down with the foot, and how fast it comes down for a pace (m/s): a walk ~0.6, a run ~1.6. */
const LEG_SHARE = 0.15;
export const footSpeed = (pace) => 0.35 + 0.25 * Math.max(0, pace);

/** What a step sounds like, without a context: { surface, level, thud (Hz), seconds, splash (0..1), armour }. */
export function stepParams(event) {
  const surface = SURFACES[event.surface] ? event.surface : 'earth';
  const spec = SURFACES[surface];
  const mass = Math.max(20, event.mass ?? 80);
  const pace = Math.max(0, event.speed ?? 1.4);
  const v = footSpeed(pace);
  const energy = 0.5 * LEG_SHARE * mass * v * v;
  // Water: what the foot throws up grows with its depth in it and its speed through it (a splash's energy ~ the water moved). Mud with water standing on it (a
  // ploughed field after rain) splashes as well as squelches, by the film's depth.
  const depth = sfxClamp(event.depth ?? 0, 0, 1.2);
  const splash = surface === 'water' ? sfxClamp(depth * 2 * (0.4 + pace / 4), 0.05, 1.5) : spec.squelch && depth > 0 ? sfxClamp(depth * 2 * (0.4 + pace / 4), 0.05, 1.5) : 0;
  const seconds = spec.seconds * (1 + (mass - 80) / 400) * (surface === 'water' ? 0.7 + splash : 1);
  const level = levelFromEnergy(energy * (1 + splash * 3), spec.efficiency, seconds);
  // The heel's thud: the leg's mass on the floor's give (a spring-mass: lower for a heavier man).
  const thud = spec.thud * (80 / mass) ** 0.5;
  return { surface, level, thud, seconds, splash, armour: event.armour ?? 'none', energy, pace };
}

/** Play a step into `out`. Returns the end time. */
export function playStep(voice, out, params, when, gain) {
  const spec = SURFACES[params.surface];
  const { seconds } = params;
  sfxTone(voice, out, { when, peak: gain * 0.6, decay: seconds, frequency: params.thud, to: params.thud * 0.7 });
  if (spec.tap) sfxBurst(voice, out, { when: when + 0.004, peak: gain * 0.55, decay: 0.018, type: 'bandpass', frequency: spec.tap * (0.85 + Math.random() * 0.3), q: 1.4 });
  if (spec.knock) sfxModes(voice, out, when, [{ f: spec.knock, decay: 0.12, amp: 1 }, { f: spec.knock * 2.6, decay: 0.06, amp: 0.4 }], gain * 0.6);
  if (spec.tap) {
    // The sole's scuff as the weight rolls on.
    sfxBurst(voice, out, { when: when + 0.03, peak: gain * 0.18, attack: 0.01, decay: 0.05, type: 'highpass', frequency: 2500, color: 'pink' });
  }
  if (spec.grain) {
    const grain = spec.grain;
    const buffer = sfxBuffer(voice.ctx, seconds + 0.04, (data, rate) => {
      if (grain.kind === 'crunch') writeGrains(data, rate, { count: 30, spread: seconds, low: grain.low, high: grain.high, decay: 0.005, amp: 0.5, bunch: 1.3 });
      else writeCrackle(data, rate, { count: grain.kind === 'hiss' ? 260 : 150, spread: seconds, length: 0.0012, amp: 0.35, shape: (share) => 1 - share });
    });
    sfxPlayBuffer(voice, out, buffer, when, gain * 0.8);
  }
  if (spec.squelch) {
    // The foot sinking (a low band sliding down) and the suck as it lifts; a few bubbles.
    sfxBurst(voice, out, { when, peak: gain * 0.7, attack: 0.02, decay: seconds * 0.6, type: 'bandpass', frequency: 500, q: 2, color: 'pink' });
    sfxTone(voice, out, { when: when + seconds * 0.5, peak: gain * 0.25, decay: 0.08, frequency: 180, to: 420, type: 'triangle' });
    const bubbles = sfxBuffer(voice.ctx, seconds, (data, rate) => writeGrains(data, rate, { count: 5, spread: seconds * 0.8, low: 300, high: 900, decay: 0.03, amp: 0.4 }));
    sfxPlayBuffer(voice, out, bubbles, when, gain * 0.5);
  }
  if (spec.splash || params.splash > 0) {
    // The splash: water broken (bright noise, longer and lower for a deeper, faster foot), the drops falling back, the bubbles of the air carried under.
    const splash = params.splash;
    sfxBurst(voice, out, { when, peak: gain * 0.9, attack: 0.01, decay: seconds, type: 'bandpass', frequency: 2200 - 900 * Math.min(1, splash), q: 0.7 });
    const drops = sfxBuffer(voice.ctx, seconds + 0.2, (data, rate) => {
      writeGrains(data, rate, { count: Math.round(10 + 40 * splash), spread: seconds, start: 0.03, low: 900, high: 4000, decay: 0.01, amp: 0.25 });
      writeGrains(data, rate, { count: Math.round(3 + 8 * splash), spread: seconds * 0.8, low: 250, high: 700, decay: 0.04, amp: 0.3 });
      lowpassInPlace(data, rate, 6000);
    });
    sfxPlayBuffer(voice, out, drops, when, gain * 0.8);
  }
  if (params.armour !== 'none') playArmourShake(voice, out, params.armour, when + 0.01, gain * (params.armour === 'plate' ? 0.45 : 0.6), 0.08 + params.pace * 0.02);
  return when + seconds + 0.25;
}
