// A body or its armour struck (the `hit` event): what was struck (the covering), by what (the striker), with what energy. The
// covering sets the sound's make-up and how long it lasts: flesh a low thump of the body under it with a slap on the skin; a gambeson
// a muffled thump; leather a sharper slap; mail the thump and a jangle of its rings; lamellar and scale a rattle of small plates;
// plate a ring of inharmonic modes over a dull thud; a wooden shield a knock, a metal one a clang. The energy sets the level (how
// much of it the material turns into sound, over how long) and, a little, how bright the first instant is (a harder, faster blow is
// a shorter contact). The struck part's mass sets the thump: a heavier part is lower.

import { clamp01, contactBrightness, levelFromEnergy, sfxBuffer, sfxBurst, sfxClamp, sfxModes, sfxPlayBuffer, sfxTone, writeGrains } from '../synth.js';

/**
 * Each covering: `efficiency` (the share of the blow's energy radiated as sound: a stiff thin shell rings, flesh hardly does),
 * `seconds` (how long the sound carries it), `hardness` (0 soft .. 1 steel: how bright the contact is), and its make-up.
 * Plate's modes: a thin shell's, inharmonic (circular-plate ratios); base and decay set by the thickness (thicker: lower, longer).
 */
export const COVERINGS = {
  flesh: { efficiency: 1.2e-5, seconds: 0.09, hardness: 0.12 },
  padded: { efficiency: 4e-6, seconds: 0.08, hardness: 0.05 },
  leather: { efficiency: 2.5e-5, seconds: 0.07, hardness: 0.3 },
  mail: { efficiency: 1.5e-4, seconds: 0.3, hardness: 0.6, rings: { count: 60, low: 2600, high: 9000, decay: 0.05, spread: 0.22 } },
  lamellar: { efficiency: 1.2e-4, seconds: 0.18, hardness: 0.55, plates: { count: 14, low: 1700, high: 4800, decay: 0.03, spread: 0.07 } },
  scale: { efficiency: 1e-4, seconds: 0.16, hardness: 0.5, plates: { count: 18, low: 2200, high: 5600, decay: 0.025, spread: 0.06 } },
  plate: { efficiency: 1e-3, seconds: 0.7, hardness: 0.95, shell: { base: 520, decay: 0.75, ratios: [1, 1.59, 2.14, 2.3, 2.65, 2.92, 3.5] } },
  wood: { efficiency: 3e-4, seconds: 0.12, hardness: 0.45, knock: { base: 340, decay: 0.11 } },
  shieldmetal: { efficiency: 8e-4, seconds: 0.5, hardness: 0.9, shell: { base: 780, decay: 0.45, ratios: [1, 1.71, 2.47, 3.11, 3.9] } },
};

/** How hard each striker is (0 soft .. 1 steel): the slap's brightness on flesh. A bare fist is bone under skin; a blade an edge of steel. */
export const STRIKERS = { fist: 0.3, foot: 0.35, knee: 0.5, elbow: 0.55, head: 0.45, blade: 0.9, blunt: 0.8, point: 0.75, shield: 0.65, body: 0.15, arrow: 0.8, lash: 0.9 };

/** A part's share of an 80 kg man's mass (kg): the thump of the body under the blow, lower for a heavier part. */
const PART_MASS = { head: 5, neck: 5, trunk: 30, chest: 30, belly: 30, pelvis: 15, arm: 2.5, upperArm: 2.5, forearm: 1.5, hand: 0.5, thigh: 9, leg: 9, shank: 4, foot: 1.2 };

/** The struck part's mass (kg) from a part name ('lThigh', 'head', 'trunk', ...). */
export function partMass(part = 'trunk') {
  const key = String(part).replace(/^[lr](?=[A-Z])/, '');
  const name = key.charAt(0).toLowerCase() + key.slice(1);
  return PART_MASS[name] ?? PART_MASS[Object.keys(PART_MASS).find((entry) => name.toLowerCase().includes(entry.toLowerCase()))] ?? 10;
}

/**
 * What a hit sounds like, without a context: { level (dB SPL at 1 m), brightness (Hz), decay (s), thump (Hz), slap (Hz), covering,
 * modes (plate) }. Energy in J; the braced blow (a man set for it) gives a firmer, shorter thump.
 */
export function impactParams(event) {
  const covering = COVERINGS[event.covering] ? event.covering : 'flesh';
  const spec = COVERINGS[covering];
  const energy = Math.max(0.05, event.energy ?? 20);
  const strikerHardness = STRIKERS[event.striker] ?? 0.4;
  // The contact's stiffness: the two in series, so the softer of them rules (the harmonic mean: a mace on a gambeson is dull, on plate bright).
  const hardness = 2 / (1 / Math.max(0.01, spec.hardness) + 1 / Math.max(0.01, strikerHardness));
  const level = levelFromEnergy(energy, spec.efficiency, spec.seconds);
  const mass = partMass(event.part);
  // The body's resonance (a mass on the spring of the tissue under it): f ∝ 1/√m, softened by the cavity (m^-1/4 fits chest and head).
  const thump = (180 / mass ** 0.25) * (event.braced ? 1.15 : 1);
  const brightness = contactBrightness(hardness, energy);
  const shell = spec.shell ? shellModes(spec.shell, energy) : null;
  return { covering, level, brightness, decay: spec.seconds, thump, slap: contactBrightness(strikerHardness, energy), hardness, energy, modes: shell, striker: event.striker ?? 'fist' };
}

/** A shell's modes: its ratios over its base, each higher one dying sooner and excited more by a harder blow (more energy, more of the upper modes). */
function shellModes(shell, energy) {
  const reach = clamp01(0.35 + 0.15 * Math.log10(Math.max(1, energy)));
  return shell.ratios.map((ratio, index) => ({ f: shell.base * ratio * (1 + (Math.random() - 0.5) * 0.04), decay: shell.decay / (1 + index * 0.35), amp: (index === 0 ? 1 : 0.7 / index) * (index / shell.ratios.length < reach ? 1 : 0.25) }));
}

/** The jangle of mail, the rattle of lamellar or the clank of plate on a body that moves (a step, a fall): into `dest`, at `peak`. */
export function playArmourShake(voice, dest, armour, when, peak, seconds = 0.15) {
  if (armour === 'mail') {
    const buffer = sfxBuffer(voice.ctx, seconds + 0.06, (data, rate) => {
      writeGrains(data, rate, { count: Math.round(40 * seconds / 0.15), spread: seconds, low: 3000, high: 9500, decay: 0.035, amp: 0.25, bunch: 1.6 });
    });
    sfxPlayBuffer(voice, dest, buffer, when, peak);
  } else if (armour === 'lamellar') {
    const buffer = sfxBuffer(voice.ctx, seconds + 0.05, (data, rate) => {
      writeGrains(data, rate, { count: Math.round(10 * seconds / 0.15), spread: seconds, low: 1500, high: 4200, decay: 0.03, amp: 0.4, bunch: 1.4 });
    });
    sfxPlayBuffer(voice, dest, buffer, when, peak);
  } else if (armour === 'plate') {
    // Two plates knocking at their joints: a short ring each.
    for (let k = 0; k < 2; k += 1) sfxModes(voice, dest, when + k * seconds * 0.4, [{ f: 900 + Math.random() * 400, decay: 0.18, amp: 1 }, { f: 2100 + Math.random() * 500, decay: 0.1, amp: 0.6 }, { f: 3400 + Math.random() * 600, decay: 0.07, amp: 0.4 }], peak * (k ? 0.6 : 1));
  } else if (armour === 'padded') {
    sfxBurst(voice, dest, { when, peak: peak * 0.4, decay: seconds, type: 'lowpass', frequency: 900, color: 'pink' });
  }
}

/** Play a hit into `out` at `when` (`gain`: the level at the ear, from engine.js). Returns the end time. */
export function playImpact(voice, out, params, when, gain) {
  const { covering, brightness, thump, slap, decay } = params;
  // The thud of the body (or the shell's body) under the blow: a low tone that drops a little as the tissue gives, and a pink-noise knock.
  const body = covering === 'plate' || covering === 'shieldmetal' ? 0.45 : covering === 'wood' ? 0.5 : 1;
  sfxTone(voice, out, { when, peak: gain * 0.7 * body, attack: 0.002, decay: 0.12 + 0.05 * (params.energy > 100 ? 1 : 0), frequency: thump * 1.25, to: thump * 0.8 });
  sfxBurst(voice, out, { when, peak: gain * 0.6 * body, decay: 0.07, type: 'lowpass', frequency: covering === 'padded' ? 450 : 900, color: 'pink' });
  if (covering === 'flesh' || covering === 'leather') {
    // The slap on the skin (or the hide): a burst as bright as the striker is hard.
    sfxBurst(voice, out, { when, peak: gain * (covering === 'leather' ? 0.75 : 0.55), decay: 0.03, type: 'bandpass', frequency: sfxClamp(slap, 600, 7000), q: 0.8 });
  }
  if (covering === 'padded') sfxBurst(voice, out, { when, peak: gain * 0.3, decay: 0.06, type: 'lowpass', frequency: 700 });
  const spec = COVERINGS[covering];
  if (spec.rings || spec.plates) {
    const grains = spec.rings ?? spec.plates;
    const count = Math.round(grains.count * sfxClamp(params.energy / 40, 0.4, 1.6));
    const buffer = sfxBuffer(voice.ctx, grains.spread + grains.decay + 0.02, (data, rate) => {
      writeGrains(data, rate, { count, spread: grains.spread, low: grains.low, high: grains.high, decay: grains.decay, amp: 0.3, bunch: 2 });
    });
    sfxPlayBuffer(voice, out, buffer, when, gain * 0.8);
  }
  if (params.modes) {
    // The shell rings over its thud; a little noise at its own brightness for the strike itself.
    sfxModes(voice, out, when, params.modes, gain * 0.9);
    sfxBurst(voice, out, { when, peak: gain * 0.5, decay: 0.02, type: 'highpass', frequency: sfxClamp(brightness * 0.4, 1000, 8000) });
  }
  if (spec.knock) {
    sfxModes(voice, out, when, [{ f: spec.knock.base, decay: spec.knock.decay, amp: 1 }, { f: spec.knock.base * 2.3, decay: spec.knock.decay * 0.6, amp: 0.5 }, { f: spec.knock.base * 3.9, decay: spec.knock.decay * 0.4, amp: 0.3 }], gain * 0.8);
    sfxBurst(voice, out, { when, peak: gain * 0.4, decay: 0.03, type: 'bandpass', frequency: 1800, q: 0.9 });
  }
  return when + Math.max(decay, params.modes ? params.modes[0].decay : 0) + 0.05;
}

/** An arrow (or bolt) striking: the same as a hit by a point, its energy from its speed (a 70 g arrow). */
export function arrowHitParams(event) {
  const energy = 0.5 * 0.07 * (event.speed ?? 50) ** 2;
  return impactParams({ covering: event.covering, energy, striker: 'arrow', part: 'trunk' });
}
