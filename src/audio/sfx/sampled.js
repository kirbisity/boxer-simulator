// Which events a recorded take plays (audio/samples.js), and how: `samplePlan` is pure (Node tests), `playWithSamples` plays.
//
// The take is scheduled at the event's instant (its transient at its start) into the same voice as the synth would be, so the
// distance, the air, the wall between, the panner and the room's reverb are the same. How loud: the engine's gain (the event's level at
// the ear, from its energy) times the set's trim (the clips are cut to the same peak, the synth's parts add up to about the gain). How
// long: a light blow is cut short with a quick fade, a heavy one rings out. Its pitch: a heavier weapon (or body) a little lower, and
// every take a few per cent off at random so no two blows are the same. Where a sound has a part no take has (the ground under a step, a
// blade's scrape), the synth plays that part beside the take.
//
// Footsteps: the ground's own take (stone, grass, mud, water; earth from grass), walk or run by the pace, weighed by the man (STEP_WEIGHT),
// with the armour's clank on top for plate or mail; heels on a hard floor (stone, tile, boards) click (the recorded heels; boards, the
// ring's canvas among them, are otherwise the synth's). Hooves: on hard ground or soft by the surface, by the gait; the neigh recorded. Blows: a helmet rings, a wooden shield
// (or a haft) knocks, a fist, foot, knee or elbow on the body punches, the fist's whoosh rises into it; thunder near cracks, far rumbles.
// A man going down thuds (the recorded body fall; in plate or mail the crash of his kit over it), a whip's tip cracks on what it lashes, a
// wooden door creaks as it swings and slams as it shuts (a chest's lid the same, smaller).
// The fifth batch and what was the synth's: a blade on mail (recorded), on lamellar or scale (the mail's rattle lower over a plate's knock); a
// point (or a blade on leather) stabs; a fist, a foot or a shoulder on plate is the punch's thud under a dull, short clank (derived from the
// sword-on-plate, helmet and clash takes); on mail the punch with the rings under it; steel on a steel shield clangs (the helmet's and the
// plate's takes); a blade's swing whooshes (the fist's and the mace's whooshes, higher); a bow and a crossbow are loosed (recorded), a
// cannon is the gunshot slowed under the synth's boom; an arrow strikes as a point does; a portcullis rattles down on its chain and slams,
// a barred gate creaks and clangs, a drawbridge runs its chain, a lock's latch clicks, a lever ratchets, a ladder knocks; a man falls
// into water or mud (the steps' splash and squelch, lower); steps on boards, sand and snow (stone's and grass's, lower, the synth's ground
// beside); hooves in mud and water.
// The sixth batch: a robot shorting out (robotSpark: at its death and at a cut stump) is the recorded electric shock, a death's whole,
// a stump's shorter and higher; a portcullis raised and a drawbridge run on the heavy chain's runs (a portcullis let down keeps its own
// chain, the slam's recording); a chained prisoner's shackles rattle as he sobs and under the lash (the chain shaken short). The breath and
// the menu's tap and chime are played by the engine (breathPlan, uiSamplePlan).
// Every blow (a hit, a clash, an arrow) is played a little longer than its energy's share of the take alone, the heaviest ringing out
// longest, with a long fade (BLOW_TAIL).
// Cries (a voice event the cry director, audio/cries.js, let through: its `cry`): the sex's set of its kind, at the voice's pitch, a
// light hurt cut short; with no take they are silent (the synth's voice is not played: families.js `sampledOnly`).

import { sfxClamp, sfxKeep, sfxRun } from '../synth.js';
import { cryOfEvent } from './voice.js';

const SAMPLED_HEADS = new Set(['blade', 'point', 'blunt']);
const SAMPLED_SOFT = new Set(['flesh', 'padded', 'leather']);
const SAMPLED_HARD = new Set(['plate', 'shieldmetal']);
/** Mail, lamellar and scale: each its set, its pitch and trim (scale's plates smaller than lamellar's, higher). */
const ARMOUR_RINGS = { mail: { set: 'mail', rate: 1, trim: 1 }, lamellar: { set: 'lamellar', rate: 1, trim: 1 }, scale: { set: 'lamellar', rate: 1.12, trim: 0.9 } };
/**
 * A blow's length (the user's ask: every blow a little longer, the heaviest ringing out longest): at strength 0 its length and fade × `light`
 * and `fadeLight`, at 1 × `heavy` and `fadeHeavy` (in a line between). The take itself ends where it was cut (45 dB under its peak), so a
 * heavy blow's tail is its whole ring, faded out slowly, never cut short.
 */
export const BLOW_TAIL = { light: 1.15, heavy: 1.8, fadeLight: 1.3, fadeHeavy: 2.4 };
/** A blow's plan with its length and fade drawn out by BLOW_TAIL at strength `s`. */
export function blowTail(plan, s) {
  if (!plan) return plan;
  const k = sfxClamp(s, 0, 1);
  return { ...plan, seconds: plan.seconds === null ? null : plan.seconds * sampleLerp(BLOW_TAIL.light, BLOW_TAIL.heavy, k), fade: plan.fade * sampleLerp(BLOW_TAIL.fadeLight, BLOW_TAIL.fadeHeavy, k) };
}

/** A strength 0..1 of `value` on a log scale from `low` to `high`. */
export const sampleStrength = (value, low, high) => sfxClamp(Math.log(Math.max(low, value) / low) / Math.log(high / low), 0, 1);
const sampleLerp = (a, b, share) => a + (b - a) * share;
/** A weapon's pitch: a heavier head lower (~ m^-0.2, about a sword's at 1.2 kg). */
export const sampleMassRate = (mass, reference = 1.2) => sfxClamp((reference / Math.max(0.1, mass ?? reference)) ** 0.2, 0.82, 1.2);

/**
 * A footstep's weight (the user's ask: a light man's step quieter, shorter and crisper; a heavy man's louder, lower and drawn out).
 * Body mass (kg, the step event's) from `light` to `heavy` takes each value from its first to its second, in a line; past either end it stays.
 *   gainDb  dB over the step's own level (which already grows with the mass through the foot's energy, +3 dB from 55 to 110 kg)
 *   rate    the playback rate: a touch high and crisp light, slowed and lowered heavy (which also draws the take out by 1/rate)
 *   length  the share of the take played before its end is faded: the light man's tail cut, the heavy man's whole
 *   fade    the fade at its end (s): quick light, long heavy
 */
export const STEP_WEIGHT = { light: 55, heavy: 110, gainDb: [-4, 4], rate: [1.08, 0.87], length: [0.6, 1], fade: [0.025, 0.12] };
/** A step's pace (m/s, the event's speed): from `run` on, the running takes (harder heel strikes), a little louder, shorter and quicker; under `slow`, softer. */
export const STEP_PACE = { slow: 0.8, run: 2.8, runGainDb: 3, slowGainDb: -3, runLength: 0.85, runRate: 1.04 };
/**
 * Each ground the recordings cover: its sets (walk, run), the trim, and a rate under the weight's. Earth (dirt, gravel steppe) has no
 * recording of its own: the grass's steps, lower and quieter, with the synth's thud kept under them.
 */
const GROUND_STEPS = {
  stone: { walk: 'step-stone-walk', run: 'step-stone-run', trim: 1, rate: 1 },
  tile: { walk: 'step-stone-walk', run: 'step-stone-run', trim: 0.95, rate: 1.08 },
  grass: { walk: 'step-grass-walk', run: 'step-grass-run', trim: 1, rate: 1 },
  earth: { walk: 'step-grass-walk', run: 'step-grass-run', trim: 0.75, rate: 0.88, synthGain: 0.5 },
  mud: { walk: 'step-mud', run: 'step-mud', trim: 1, rate: 1 },
  water: { walk: 'step-water', run: 'step-water', trim: 1, rate: 1 },
  // No recording of boards, sand or snow: boards the stone's steps lower and duller with the synth's hollow knock of the planks beside;
  // sand and snow the grass's (a soft crunch), sand a little lower, snow lower still, the synth's crunch beside.
  wood: { walk: 'step-stone-walk', run: 'step-stone-run', trim: 0.8, rate: 0.86, synthGain: 0.6 },
  sand: { walk: 'step-grass-walk', run: 'step-grass-run', trim: 0.85, rate: 0.92, synthGain: 0.45 },
  snow: { walk: 'step-grass-walk', run: 'step-grass-run', trim: 0.85, rate: 0.8, synthGain: 0.6 },
};
/** Heels (a heeled boot, outfits.js `heels`: the gear's heelLift) on a hard floor click: the recorded heels, whatever the pace. */
const HEEL_STEPS = {
  stone: { walk: 'step-heel', run: 'step-heel', trim: 1.1, rate: 1 },
  tile: { walk: 'step-heel', run: 'step-heel', trim: 1.1, rate: 1.05 },
  wood: { walk: 'step-heel', run: 'step-heel', trim: 1.1, rate: 0.95, synthGain: 0.35 },
};
/** A limb's (or a body's) blow: its pitch (a foot or a knee heavier than a fist, lower; a shoulder's crash a dull thud) and its trim. */
const LIMB_BLOWS = { fist: { rate: 1.04, trim: 1.2 }, elbow: { rate: 1, trim: 1.2 }, head: { rate: 0.95, trim: 1.1 }, knee: { rate: 0.92, trim: 1.25 }, foot: { rate: 0.88, trim: 1.3 }, body: { rate: 0.8, trim: 1 }, shield: { rate: 0.85, trim: 1.15 } };
const HOOF_HARD = new Set(['stone', 'tile', 'wood']);
const HOOF_SOFT = new Set(['earth', 'grass', 'sand', 'snow']);
/** A hoof in mud or water: the man's squelch or splash, lower (a horse's weight on it). */
const HOOF_WET = { mud: 'step-mud', water: 'step-water' };
/** A hoof by its gait: the trim and the rate. */
const HOOF_PACE = { walk: { trim: 0.7, rate: 0.94 }, trot: { trim: 0.85, rate: 0.97 }, canter: { trim: 1, rate: 1 }, gallop: { trim: 1.1, rate: 1.03 } };
/**
 * A body falling (the recorded thud, cut on a hard floor): on soft ground duller and a little lower; in water or mud the synth's splash
 * and slap instead. Its weight: from `light` to `heavy` kg, `gainDb` over the fall's own level and the share of the length played.
 * (The trims are about 6 dB over the synth's thud: at the fall's own level, a man going down at 3 m/s was under the footsteps.)
 */
const BODY_FALL_GROUND = { stone: { trim: 2.4, rate: 1 }, tile: { trim: 2.4, rate: 1.03 }, wood: { trim: 2.5, rate: 0.97 }, earth: { trim: 2.2, rate: 0.94 }, grass: { trim: 2, rate: 0.94 }, sand: { trim: 1.8, rate: 0.9 }, snow: { trim: 1.7, rate: 0.9 } };
/** A body going down in water or mud: the steps' splash or squelch, lower and drawn out (a whole man, not a foot), the synth's splash beside. */
const BODY_FALL_WET = { water: { set: 'step-water', trim: 2.4, rate: 0.7, synthGain: 0.5 }, mud: { set: 'step-mud', trim: 2.4, rate: 0.72, synthGain: 0.4 } };
export const BODY_FALL_WEIGHT = { light: 50, heavy: 120, gainDb: [-3, 3], length: [0.85, 1.2] };
/** A whip's lash (its tip's energy, J, from `low` to `high`): lifted by `lift` to be heard as the crack it is, not the tip's few joules. */
export const WHIP_LASH = { low: 2, high: 40, lift: 2.5 };
/** The wooden mechanisms the door's takes play, by weight 0..1 (a chest's lid light: higher, quieter, shorter; a door heavy). */
const WOODEN_MECHS = { chest: 0, door: 1 };

/** Where `mass` (kg) is on the weight curve, 0 (light) .. 1 (heavy). */
export const stepWeight = (mass) => sfxClamp(((mass ?? 80) - STEP_WEIGHT.light) / (STEP_WEIGHT.heavy - STEP_WEIGHT.light), 0, 1);

/** The recorded ground under a step (its plan without `extra`), or null where the ground has no recording (wood, sand, snow). */
function groundStep(params, event, jitter) {
  const ground = (event.heels && HEEL_STEPS[params.surface]) || GROUND_STEPS[params.surface];
  if (!ground) return null;
  const w = stepWeight(event.mass);
  const pick = (range) => sampleLerp(range[0], range[1], w);
  const run = params.pace >= STEP_PACE.run;
  const paceDb = run ? STEP_PACE.runGainDb : params.pace < STEP_PACE.slow ? STEP_PACE.slowGainDb : 0;
  // (The take's own length, about 0.2-0.5 s, is cut to `length` of itself: seconds here is a share, made seconds in playSample.)
  return {
    set: run ? ground.run : ground.walk, trim: ground.trim * 10 ** ((pick(STEP_WEIGHT.gainDb) + paceDb) / 20), rate: ground.rate * pick(STEP_WEIGHT.rate) * (run ? STEP_PACE.runRate : 1) * jitter(0.04),
    seconds: null, share: pick(STEP_WEIGHT.length) * (run ? STEP_PACE.runLength : 1), fade: pick(STEP_WEIGHT.fade), skip: 0,
    synth: ground.synthGain ? { ...params, armour: 'none' } : null, synthGain: ground.synthGain ?? 0,
  };
}

/**
 * The plan for an event (its type, its family's params, the event): { set, trim (× the gain), rate (playback), seconds (the most to play,
 * null for the whole take), share (of that, played; 1 if absent), fade (s, at its end), skip (s more into the take), extra (more takes
 * played with it: { set, trim, rate, seconds, fade, skip, delay (s after the first) }), synth (params the synth plays beside it, or null), synthGain },
 * or null where the synth alone plays it.
 */
export function samplePlan(type, params, event = {}, random = Math.random) {
  const jitter = (spread = 0.06) => 1 + (random() * 2 - 1) * spread;
  switch (type) {
    case 'hit': {
      // A whip's tip (physics/whip.js) cracks on whatever it lashes: the harder lash louder and rung out longer; on armour or a shield
      // the crack shorter and higher, the synth's knock of what it struck beside it.
      if (params.striker === 'lash') {
        const s = sampleStrength(params.energy, WHIP_LASH.low, WHIP_LASH.high);
        const soft = SAMPLED_SOFT.has(params.covering);
        // (A prisoner chained up at the wall jerks against his shackles under it.)
        const shackles = event.chained ? { extra: [{ set: 'shackle', trim: sampleLerp(0.5, 0.9, s), rate: jitter(0.06), seconds: null, fade: 0.06, skip: 0, delay: 0.04 }] } : {};
        return { ...shackles, set: 'whip', trim: WHIP_LASH.lift * (soft ? 1 : 0.6) * sampleLerp(0.7, 1.25, s), rate: (soft ? 1 : 1.1) * sampleLerp(1.06, 0.96, s) * jitter(0.05), seconds: (soft ? 1 : 0.6) * sampleLerp(0.18, 0.55, s), fade: sampleLerp(0.05, 0.2, s), skip: 0, synth: soft ? null : params, synthGain: soft ? 0 : 0.6 };
      }
      const limb = LIMB_BLOWS[params.striker];
      if (!SAMPLED_HEADS.has(params.striker) && !limb) return null;
      const s = sampleStrength(params.energy, 5, 400);
      const rate = sampleMassRate(event.mass) * jitter();
      // A helmet struck rings (by a weapon, a fist or a boot; a shoulder's crash is the synth's): a heavier blow louder and rung out longer.
      if (event.part === 'head' && params.covering === 'plate' && params.striker !== 'body') {
        return blowTail({ set: 'helmet', trim: (limb ? 0.8 : 1) * sampleLerp(0.75, 1.15, s), rate: rate * (params.striker === 'blunt' ? 0.88 : 1) * (limb ? 1.08 : 1), seconds: sampleLerp(0.22, 0.75, s), fade: sampleLerp(0.06, 0.3, s), skip: 0, synth: null, synthGain: 0 }, s);
      }
      // A wooden shield's boards knocked hollow (anything on them): a heavier blow fuller and longer, a weight's lower.
      if (params.covering === 'wood') {
        return blowTail({ set: 'woodshield', trim: (limb ? limb.trim * 0.75 : 1) * sampleLerp(0.75, 1.15, s), rate: (limb ? limb.rate : rate) * (params.striker === 'blunt' ? 0.9 : 1), seconds: sampleLerp(0.12, 0.32, s), fade: sampleLerp(0.04, 0.14, s), skip: 0, synth: null, synthGain: 0 }, s);
      }
      if (limb) {
        const p = sampleStrength(params.energy, 3, 300);
        const punch = { set: 'punch', trim: limb.trim * sampleLerp(0.75, 1.2, p), rate: limb.rate * jitter(), seconds: sampleLerp(0.1, 0.26, p), fade: sampleLerp(0.03, 0.1, p), skip: 0, synth: null, synthGain: 0 };
        // A punch, a kick, a knee, an elbow, a head, a shoulder or a shield's rim into the body (bare, padded or leather): the recorded
        // punch, the harder blow louder and its whole take, the lighter one clipped short.
        if (SAMPLED_SOFT.has(params.covering)) return blowTail(punch, p);
        // On plate (or a steel shield's face): the thud of the body behind it under a dull, short clank (no edge to ring it bright; a
        // harder blow louder and longer, a kick or a shoulder lower).
        if (SAMPLED_HARD.has(params.covering)) {
          return blowTail({ set: 'platepunch', trim: limb.trim * sampleLerp(0.7, 1.15, p), rate: limb.rate * jitter(), seconds: sampleLerp(0.12, 0.3, p), fade: sampleLerp(0.04, 0.12, p), skip: 0, synth: null, synthGain: 0 }, p);
        }
        // On mail, lamellar or scale: the punch, and the rings or plates shaken under it, quieter.
        const rings = ARMOUR_RINGS[params.covering];
        if (rings) return blowTail({ ...punch, extra: [{ set: rings.set, trim: rings.trim * sampleLerp(0.35, 0.6, p), rate: rings.rate * limb.rate * jitter(0.05), seconds: sampleLerp(0.12, 0.25, p), fade: sampleLerp(0.04, 0.1, p), skip: 0 }] }, p);
        return null;
      }
      if (SAMPLED_SOFT.has(params.covering)) {
        // A weight into flesh lands on the bone under it; a point stabs in (a blade's edge into leather too: it bites, it does not slice);
        // a blade's edge into flesh or a gambeson slices.
        if (params.striker === 'blunt') return blowTail({ set: 'bonehit', trim: 1, rate, seconds: sampleLerp(0.22, 0.75, s), fade: sampleLerp(0.04, 0.2, s), skip: 0, synth: null, synthGain: 0 }, s);
        if (params.striker === 'point' || params.covering === 'leather') return blowTail({ set: 'stab', trim: 0.95 * sampleLerp(0.8, 1.15, s), rate, seconds: sampleLerp(0.14, 0.4, s), fade: sampleLerp(0.04, 0.15, s), skip: 0, synth: null, synthGain: 0 }, s);
        return blowTail({ set: 'slice', trim: 0.85, rate, seconds: sampleLerp(0.22, 0.75, s), fade: sampleLerp(0.04, 0.2, s), skip: 0, synth: null, synthGain: 0 }, s);
      }
      // Mail rings jangle; lamellar's and scale's laced plates clack (a weight lower).
      const rings = ARMOUR_RINGS[params.covering];
      if (rings) return blowTail({ set: rings.set, trim: rings.trim * sampleLerp(0.75, 1.15, s), rate: rate * rings.rate * (params.striker === 'blunt' ? 0.88 : 1), seconds: sampleLerp(0.15, 0.45, s), fade: sampleLerp(0.04, 0.15, s), skip: 0, synth: null, synthGain: 0 }, s);
      // Steel on steel plate (or a steel shield): the crash of it; a weight heavier, lower.
      if (SAMPLED_HARD.has(params.covering)) return blowTail({ set: 'break', trim: 0.9, rate: rate * (params.striker === 'blunt' ? 0.85 : 1), seconds: sampleLerp(0.2, 0.6, s), fade: sampleLerp(0.05, 0.2, s), skip: 0, synth: null, synthGain: 0 }, s);
      return null;
    }
    case 'arrowhit': {
      // An arrow or a bolt striking (its energy from its speed: 8 J at 15 m/s, 280 J at 90): as a point does, higher and shorter (a light
      // shaft); into the ground or stone the synth's.
      const s = sampleStrength(params.energy, 8, 280);
      const covering = event.covering ?? params.covering;
      const rate = 1.12 * jitter();
      const plan = (set, trim, low, high) => blowTail({ set, trim: trim * sampleLerp(0.75, 1.15, s), rate, seconds: sampleLerp(low, high, s), fade: sampleLerp(0.03, 0.12, s), skip: 0, synth: null, synthGain: 0 }, s);
      if (SAMPLED_SOFT.has(covering)) return plan('stab', 0.9, 0.12, 0.3);
      if (ARMOUR_RINGS[covering]) return { ...plan(ARMOUR_RINGS[covering].set, ARMOUR_RINGS[covering].trim, 0.12, 0.3), rate: rate * ARMOUR_RINGS[covering].rate };
      if (SAMPLED_HARD.has(covering)) return { ...plan(event.part === 'head' ? 'helmet' : 'break', 0.85, 0.12, 0.35), rate: rate * 1.1 };
      if (covering === 'wood') return plan('woodshield', 1, 0.1, 0.25);
      return null;
    }
    case 'wound': {
      const s = params.severity;
      if (params.kind === 'cut') return { set: 'gore', trim: 0.7, rate: jitter(), seconds: sampleLerp(0.25, 0.85, s), fade: sampleLerp(0.06, 0.25, s), skip: 0, synth: null, synthGain: 0 };
      // A point driven in: the stab into leather and what is under it, a deeper one longer.
      if (params.kind === 'stab') return { set: 'stab', trim: sampleLerp(0.6, 0.9, s), rate: sampleLerp(1.05, 0.92, s) * jitter(0.05), seconds: sampleLerp(0.15, 0.4, s), fade: sampleLerp(0.04, 0.15, s), skip: 0, synth: null, synthGain: 0 };
      if (params.kind === 'bone') return { set: 'bones', trim: 1, rate: jitter(), seconds: sampleLerp(0.15, 0.5, s), fade: sampleLerp(0.03, 0.12, s), skip: 0, synth: null, synthGain: 0 };
      // A skull or a neck giving way: the bones' snap, lower and slower.
      if (params.kind === 'crush') return { set: 'bones', trim: 1, rate: 0.8 * jitter(0.04), seconds: null, fade: 0.12, skip: 0, synth: null, synthGain: 0 };
      return null;
    }
    case 'clash': {
      const s = sampleStrength(params.speed, 1, 20);
      // Steel into wood: a wooden shield's boards knocked; a haft (thinner, its first mode higher) the same take a little higher and shorter.
      if (params.wood) {
        return blowTail({ set: 'woodshield', trim: sampleLerp(0.75, 1.15, s), rate: sfxClamp((params.wood.base / 300) ** 0.5, 0.9, 1.3) * jitter(), seconds: sampleLerp(0.1, 0.3, s) * (300 / params.wood.base), fade: sampleLerp(0.04, 0.12, s), skip: 0, synth: null, synthGain: 0 }, s);
      }
      // Steel on a steel shield's face or boss: a shell's clang (the helmet's and the plate's takes), a weight's lower.
      if (event.a === 'shieldmetal' || event.b === 'shieldmetal') {
        const blunt = event.a === 'blunt' || event.b === 'blunt';
        return blowTail({ set: 'shieldclang', trim: sampleLerp(0.75, 1.15, s), rate: sampleMassRate(event.mass) * (blunt ? 0.88 : 1) * jitter(), seconds: sampleLerp(0.2, 0.7, s), fade: sampleLerp(0.05, 0.25, s), skip: 0, synth: params.scrape > 0 ? { ...params, modes: [] } : null, synthGain: 0.7 }, s);
      }
      const blunt = !params.modes.length || params.modes[0].f < 500;
      return blowTail({
        set: 'clash', trim: 1, rate: sampleMassRate(event.mass) * (blunt ? 0.85 : 1) * jitter(), seconds: sampleLerp(0.15, 0.8, s), fade: sampleLerp(0.04, 0.25, s), skip: 0,
        // Edge along edge: the synth's scrape beside it (without its own ring).
        synth: params.scrape > 0 ? { ...params, modes: [] } : null, synthGain: 0.7,
      }, s);
    }
    case 'step': {
      const armoured = params.armour === 'plate' || params.armour === 'mail';
      // The armour's clank with each step (mail lighter and brighter), over the footfall: a man in plate is heard by his kit
      // before his feet (it was 0.6 and 0.4 of the clip's peak, under the step; raised to carry over it).
      const mail = params.armour === 'mail';
      const armour = armoured ? { set: 'armourstep', trim: (mail ? 0.8 : 1.2) * sampleLerp(0.8, 1.3, sampleStrength(params.pace, 0.5, 6)), rate: sfxClamp((85 / Math.max(40, event.mass ?? 85)) ** 0.25, 0.85, 1.15) * (mail ? 1.15 : 1) * jitter(0.05), seconds: null, fade: 0.06, skip: 0 } : null;
      const ground = groundStep(params, event, jitter);
      // The ground recorded (the armour's take on top of it), or the synth's ground under the armour's take, or the synth alone.
      if (ground) return { ...ground, extra: armour ? [armour] : [], synth: ground.synth, synthGain: ground.synthGain };
      return armour ? { ...armour, synth: { ...params, armour: 'none' }, synthGain: 0.8 } : null;
    }
    case 'fall':
    case 'land': {
      const armoured = params.armour === 'plate' || params.armour === 'mail';
      const s = sampleStrength(params.speed, 0.8, 9);
      const synth = { ...params, armour: 'none' };
      // A body going down (any man, any kit): the recorded thud, harder the faster he comes down and louder, lower and drawn out the
      // heavier he is; where the ground has no recording of it (water, mud), the synth's thud and splash.
      // (In water or mud: the steps' splash or squelch, lower, the synth's splash beside it.)
      const wet = params.kind === 'fall' ? BODY_FALL_WET[params.surface] : null;
      const ground = params.kind === 'fall' ? BODY_FALL_GROUND[params.surface] ?? wet : null;
      const w = sfxClamp(((event.mass ?? 80) - BODY_FALL_WEIGHT.light) / (BODY_FALL_WEIGHT.heavy - BODY_FALL_WEIGHT.light), 0, 1);
      const body = ground ? {
        set: wet ? wet.set : 'bodyfall', trim: ground.trim * sampleLerp(0.6, 1.15, s) * 10 ** (sampleLerp(...BODY_FALL_WEIGHT.gainDb, w) / 20), rate: ground.rate * sfxClamp((80 / Math.max(40, event.mass ?? 80)) ** 0.25, 0.85, 1.15) * jitter(0.04),
        seconds: sampleLerp(0.3, 1.1, s) * sampleLerp(...BODY_FALL_WEIGHT.length, w), fade: sampleLerp(0.06, 0.3, s), skip: 0,
      } : null;
      if (!armoured) return body ? { ...body, synth: wet ? synth : null, synthGain: wet ? wet.synthGain : 0 } : null;
      // A man in armour going down crashes with it (over the body's thud); landing on his feet, a heavy step's clank.
      if (params.kind === 'fall') return { set: 'clatter', trim: (params.armour === 'mail' ? 0.5 : 0.75) * sampleLerp(0.6, 1.1, s), rate: sfxClamp((85 / Math.max(40, event.mass ?? 85)) ** 0.2, 0.85, 1.15) * 0.9 * jitter(0.04), seconds: sampleLerp(0.4, 1, s), fade: 0.2, skip: 0, extra: body ? [body] : [], synth: body && !wet ? null : synth, synthGain: wet ? wet.synthGain : 1 };
      return { set: 'armourstep', trim: 0.8 * sampleLerp(0.7, 1.2, s), rate: 0.9 * jitter(0.05), seconds: null, fade: 0.06, skip: 0, synth, synthGain: 1 };
    }
    case 'mech': {
      const shutting = params.state === 'closed' || params.state === 'shut' || params.state === 'down' || params.state === 'closing';
      // A portcullis: its chain run over the wheel (raised, a little slower and lower: wound up), let down it runs and the grate slams
      // on the stone and rumbles (the slam `delay` s into the chain, as the recording has it).
      // (Raised: the heavy chain wound up, a little slower and lower. Let down: the portcullis's own chain, the slam's recording, 1 s to it.)
      if (params.kind === 'portcullis') {
        if (!shutting) return { set: 'chain', trim: 1, rate: 0.9 * jitter(0.03), seconds: null, fade: 0.15, skip: 0, synth: null, synthGain: 0 };
        return { set: 'portcullis-chain', trim: 1, rate: jitter(0.03), seconds: null, fade: 0.1, skip: 0, synth: null, synthGain: 0, extra: [{ set: 'portcullis-slam', trim: 1.2, rate: jitter(0.03), seconds: null, fade: 0.6, skip: 0, delay: 1 }] };
      }
      // A drawbridge: the heavy chain, slower and lower (a bigger wheel), two runs one after the other, the synth's chain and timber slam
      // carrying it on.
      if (params.kind === 'drawbridge') {
        const run = { set: 'chain', trim: 1, rate: 0.82 * jitter(0.03), seconds: null, fade: 0.2, skip: 0 };
        return { ...run, extra: [{ ...run, rate: 0.8 * jitter(0.03), delay: 1.25 }], synth: params, synthGain: 0.5 };
      }
      // A prisoner's shackles shaken (a sob, a jerk at the wall): the chain shaken short, a harder one louder and longer.
      if (params.kind === 'shackles') {
        const k = sfxClamp(event.strength ?? 0.5, 0, 1);
        return { set: 'shackle', trim: sampleLerp(0.45, 0.9, k), rate: sampleLerp(1.1, 0.95, k) * jitter(0.05), seconds: sampleLerp(0.2, 0.6, k), fade: 0.08, skip: 0, synth: null, synthGain: 0 };
      }
      // A gate of bars: its hinges creak (the door's creak, lower: iron), shut it clangs (the portcullis's slam, higher and shorter: a lighter grate).
      if (params.kind === 'gate') {
        const creak = { set: 'door-creak', trim: 0.9, rate: 0.85 * jitter(0.04), seconds: shutting ? 0.6 : 1, fade: shutting ? 0.08 : 0.25, skip: 0, synth: null, synthGain: 0 };
        return shutting ? { ...creak, extra: [{ set: 'portcullis-slam', trim: 1.1, rate: 1.25 * jitter(0.04), seconds: 0.9, fade: 0.4, skip: 0, delay: 0.55 }] } : creak;
      }
      // A lock: the key's first click and the bolt going over (the crossbow's latch, high then low).
      if (params.kind === 'lock') return { set: 'crossbow-latch', trim: 0.7, rate: 1.3 * jitter(0.04), seconds: null, fade: 0.02, skip: 0, extra: [{ set: 'crossbow-latch', trim: 1, rate: 0.85 * jitter(0.04), seconds: null, fade: 0.03, skip: 0, delay: 0.3 }], synth: null, synthGain: 0 };
      // A lever thrown: its ratchet (the crossbow's crank), the synth's clunk of the arm beside it.
      if (params.kind === 'lever') return { set: 'crossbow-crank', trim: 0.9, rate: jitter(0.04), seconds: 0.5, fade: 0.12, skip: 0, synth: params, synthGain: 0.5 };
      // A ladder falling against the wall or set down: a knock of wood (the wooden shield's, lower: a longer pole).
      if (params.kind === 'ladder') return { set: 'woodshield', trim: 1, rate: 0.75 * jitter(0.05), seconds: 0.35, fade: 0.1, skip: 0, synth: null, synthGain: 0 };
      // A wooden door (a chest's lid lighter: higher, quieter, shorter) creaks as it swings; shut, it creaks a moment and slams (the slam
      // `delay` s into the creak, as the synth's). A thing picked up stays the synth's.
      if (!(params.kind in WOODEN_MECHS)) return null;
      const w = WOODEN_MECHS[params.kind];
      const opening = params.state !== 'closed' && params.state !== 'shut' && params.state !== 'down' && params.state !== 'closing';
      const rate = sampleLerp(1.15, 1, w) * jitter(0.04);
      const length = sampleLerp(0.55, 1, w);
      const creak = { set: 'door-creak', trim: sampleLerp(0.8, 1.1, w), rate, seconds: (opening ? 0.95 : 0.5) * length, fade: opening ? 0.25 : 0.08, skip: 0, synth: null, synthGain: 0 };
      if (opening) return creak;
      return { ...creak, extra: [{ set: 'door-slam', trim: sampleLerp(1.2, 2, w), rate: rate * 0.98, seconds: sampleLerp(0.5, 1.4, w), fade: sampleLerp(0.15, 0.4, w), skip: 0, delay: 0.45 * length }] };
    }
    case 'clatter': {
      const s = sampleStrength(params.speed, 1.2, 8);
      return { set: 'clatter', trim: sampleLerp(0.6, 1, s), rate: sampleMassRate(params.mass) * jitter(), seconds: sampleLerp(0.3, 1, s), fade: sampleLerp(0.08, 0.3, s), skip: 0, synth: null, synthGain: 0 };
    }
    case 'swing': {
      // A weight's whoosh (a mace, a club, an axe's head); a blade's edge a thin whoosh (below). The swing is logged at the stroke's
      // fastest, so the take starts a little into its rise.
      // A fist or a foot driven at a man (log.js trackPunchSwing: logged as the drive starts): the whoosh rising into the blow, its loud
      // end played (the take's last `seconds`, about the drive's), a faster drive louder and longer, a kick lower. The air off a limb is
      // 20-30 dB under a blade's (swingParams), lost under the blows at its own level: lifted (×18) to about 8 dB under the punch.
      if (event.head === 'fist' || event.head === 'foot') {
        const s = sampleStrength(params.speed, 4, 14);
        return { set: 'fistswing', trim: 18 * sampleLerp(0.7, 1.3, s), rate: sfxClamp((params.speed / 9) ** 0.15, 0.9, 1.12) * (event.head === 'foot' ? 0.85 : 1) * jitter(0.05), seconds: sfxClamp(event.reach ?? 0.25, 0.15, 0.4) * sampleLerp(0.8, 1.2, s), fade: 0.03, skip: 0, fromEnd: true, synth: null, synthGain: 0 };
      }
      // A blade's thin whoosh (the fist's and the mace's whooshes, pitched up and thinned), a faster stroke louder, higher and its whole pass.
      if (event.head === 'blade') {
        const s = sampleStrength(params.speed, 8, 35);
        return { set: 'bladeswing', trim: sampleLerp(0.8, 1.2, s), rate: sfxClamp((params.speed / 20) ** 0.2, 0.88, 1.15) * jitter(0.05), seconds: sfxClamp(params.seconds * 1.6, 0.12, 0.3), fade: 0.06, skip: 0, synth: null, synthGain: 0 };
      }
      if (event.head !== 'blunt') return null;
      return { set: 'maceswing', trim: 0.9, rate: sfxClamp((params.speed / 15) ** 0.2, 0.85, 1.2) * jitter(0.05), seconds: sfxClamp(params.seconds * 2, 0.25, 0.6), fade: 0.12, skip: 0.06, synth: null, synthGain: 0 };
    }
    case 'horse': {
      if (params.kind === 'neigh') return { set: 'neigh', trim: 1, rate: sfxClamp((500 / Math.max(150, event.mass ?? 500)) ** 0.2, 0.85, 1.2) * jitter(0.04), seconds: null, fade: 0.25, skip: 0, synth: null, synthGain: 0 };
      if (params.kind !== 'hoof') return null;
      // A hoof on hard ground (stone, tile, boards) clops; on earth, grass, sand or snow it thuds (the gallop's). Mud and water are the synth's.
      const set = HOOF_HARD.has(params.surface) ? 'hoof-stone' : HOOF_SOFT.has(params.surface) ? 'hoof-soft' : HOOF_WET[params.surface] ?? null;
      if (!set) return null;
      // A walking horse sets its hooves down softer and slower than a galloping one comes down on them; in mud or water a man's
      // squelch or splash, lower and louder (a horse's weight).
      const pace = HOOF_PACE[event.gait] ?? HOOF_PACE.trot;
      const wet = Boolean(HOOF_WET[params.surface]);
      return { set, trim: pace.trim * (wet ? 1.3 : 1), rate: sfxClamp((500 / Math.max(150, event.mass ?? 500)) ** 0.15, 0.85, 1.15) * pace.rate * (wet ? 0.75 : 1) * jitter(0.05), seconds: null, fade: wet ? 0.08 : 0.03, skip: 0, synth: null, synthGain: 0 };
    }
    case 'shot':
      // A matchlock: the recorded report, the synth's low boom under it (what a recording through a phone has little of).
      // A bow loosed (the recorded release; the synth's thrum of the string under it) and a crossbow's prod snapping (recorded, its knock
      // and thrum under it, quieter). A cannon: the pistol's report slowed to half (a far bigger charge, its crack lower and longer), the
      // synth's deep boom and rumble carrying it.
      if (params.kind === 'bow') return { set: 'bow', trim: 1, rate: jitter(0.04), seconds: null, fade: 0.06, skip: 0, synth: params, synthGain: 0.45 };
      if (params.kind === 'crossbow') return { set: 'crossbow', trim: 1, rate: jitter(0.04), seconds: null, fade: 0.1, skip: 0, synth: params, synthGain: 0.3 };
      if (params.kind === 'cannon') return { set: 'gunshot', trim: 1, rate: 0.5 * jitter(0.04), seconds: null, fade: 0.8, skip: 0, synth: params, synthGain: 0.8 };
      if (params.kind !== 'matchlock') return null;
      return { set: 'gunshot', trim: 1, rate: jitter(0.04), seconds: null, fade: 0.3, skip: 0, synth: params, synthGain: 0.35 };
    case 'thunder': {
      // A strike near cracks and roars (the whole take, at its pitch); a far one is the rumble only (the crack skipped), lower and drawn
      // out, the synth's long rumble under it carrying it on (its loudness is the distance's, the ear's).
      const near = params.crack;
      return { set: 'thunder', trim: sampleLerp(0.85, 1.2, near), rate: sampleLerp(0.78, 1, near) * jitter(0.04), seconds: null, fade: sampleLerp(0.9, 0.5, near), skip: sampleLerp(0.12, 0, near), synth: { ...params, crack: 0 }, synthGain: sampleLerp(0.8, 0.35, near) };
    }
    case 'voice': {
      const cry = cryOfEvent(event);
      if (!cry) return null;
      const i = sfxClamp(cry.intensity ?? 0.5, 0, 1);
      // A light hurt is a catch of the breath (the take's head, faded), a hard one the whole cry; a moan and a dying cry let die away.
      const share = cry.kind === 'hurt' ? sampleLerp(CRY_PLAY.hurtShare, 1, i) : 1;
      return { set: `voice-${cry.sex}-${cry.kind}`, trim: sampleLerp(CRY_PLAY.trim[0], CRY_PLAY.trim[1], i), rate: cry.rate ?? 1, seconds: null, share, fade: CRY_PLAY.fade[cry.kind] ?? 0.08, skip: 0, synth: null, synthGain: 0 };
    }
    case 'robotSpark': {
      // A robot shorting out: the shock, a death's (intensity 1) its whole take and a stump's (0.7) shorter, higher and quieter.
      const i = sfxClamp(params.intensity ?? 1, 0, 1);
      return { set: 'shock', trim: sampleLerp(0.6, 1, i), rate: sampleLerp(1.15, 1, i) * jitter(0.05), seconds: sampleLerp(0.35, 1.4, i), fade: sampleLerp(0.08, 0.25, i), skip: 0, synth: null, synthGain: 0 };
    }
    case 'charge':
      // The army's roar (engine.js loops it; the board plays it once): its whole take.
      return { set: 'charge', trim: 1, rate: jitter(0.03), seconds: null, fade: 0.5, skip: 0, synth: null, synthGain: 0 };
    default:
      return null;
  }
}

/**
 * The recorded breath (engine.js breathe): heard only when he is all but spent (`from`: his exertion, 0 rested .. 1 at empty, past 1 in the
 * overdraft: the stamina's last tenth), silent before; each breath a take of his sex's, drawn in or let out, at his voice's pitch (cryRate),
 * cut to the breath's own length (`length` of it: the cadence is breathParams's) with a fade. Exhaled louder than drawn in (as recorded).
 */
export const BREATH_TAKES = { from: 0.9, trim: 1, inTrim: 1, length: 1.05, fade: { in: 0.08, out: 0.12 } };

/** Is a breath at this exertion heard at all. */
export const breathHeard = (exertion) => exertion >= BREATH_TAKES.from;

/** A breath's plan (breath: breathParams's; sex 'male' | 'female'; rate: his voice's), or null when he is not tired enough to be heard. */
export function breathPlan(breath, inhale, exertion, sex, rate = 1) {
  if (!breathHeard(exertion)) return null;
  const spec = BREATH_TAKES;
  return { set: `breath-${sex === 'female' ? 'female' : 'male'}-${inhale ? 'in' : 'out'}`, trim: spec.trim * (inhale ? spec.inTrim : 1), rate, seconds: (inhale ? breath.inSeconds : breath.outSeconds) * spec.length, fade: inhale ? spec.fade.in : spec.fade.out, skip: 0, synth: null, synthGain: 0 };
}

/**
 * A menu's sound (engine.js ui): a click the recorded tap, a back the tap lower, a confirm the tap a little higher with the chime under it.
 * Victory and defeat stay the synth's (null).
 */
export function uiSamplePlan(kind, random = Math.random) {
  const jitter = (spread) => 1 + (random() * 2 - 1) * spread;
  const tap = { set: 'ui-tap', trim: 0.55, rate: jitter(0.03), seconds: null, fade: 0.04, skip: 0, synth: null, synthGain: 0 };
  if (kind === 'click') return tap;
  if (kind === 'back') return { ...tap, rate: 0.8 * jitter(0.02) };
  if (kind === 'confirm') return { ...tap, rate: 1.12 * jitter(0.02), extra: [{ set: 'ui-chime', trim: 0.4, rate: 1, seconds: 0.7, fade: 0.3, skip: 0, delay: 0.02 }] };
  return null;
}

/** A cry's take: its trim from none to full intensity (the takes are cut to one peak), the least share of a hurt cry played, each kind's fade (s). */
export const CRY_PLAY = { trim: [0.55, 1], hurtShare: 0.6, fade: { hurt: 0.06, scream: 0.12, moan: 0.25, fear: 0.1, dying: 0.35 } };

/** Play a take into `out` at `when` by a plan, at `gain` (the engine's). Returns the end time. */
export function playSample(voice, out, take, plan, when, gain) {
  const ctx = voice.ctx;
  let start = Math.min(take.buffer.duration - 0.02, take.offset + (plan.skip ?? 0));
  const whole = (take.buffer.duration - start) / plan.rate;
  const seconds = Math.max(0.03, Math.min(whole, plan.seconds ?? whole) * (plan.share ?? 1));
  // (`fromEnd`: the take's last `seconds` played, its end where it is loudest: a whoosh rising into the blow.)
  if (plan.fromEnd) start = Math.max(start, take.buffer.duration - seconds * plan.rate);
  const fade = Math.min(plan.fade ?? 0.05, seconds * 0.6);
  const peak = Math.max(0.0002, gain * plan.trim);
  const envelope = sfxKeep(voice, ctx.createGain());
  envelope.gain.setValueAtTime(peak, when);
  envelope.gain.setValueAtTime(peak, when + seconds - fade);
  envelope.gain.exponentialRampToValueAtTime(peak * 0.001, when + seconds);
  envelope.connect(out);
  const source = ctx.createBufferSource();
  source.buffer = take.buffer;
  source.playbackRate.value = plan.rate;
  source.connect(envelope);
  sfxRun(voice, source, when, when + seconds + 0.005, start);
  return when + seconds + 0.01;
}

/** Play a plan's take and its extra layers from `bank` into `voice.out` (no synth beside it). Returns the end time, or null where its set has no take loaded. */
export function playPlan(bank, voice, plan, when, gain) {
  const take = plan && bank ? bank.pick(plan.set) : null;
  if (!take) return null;
  let end = playSample(voice, voice.out, take, plan, when, gain);
  for (const layer of plan.extra ?? []) {
    const more = bank.pick(layer.set);
    if (more) end = Math.max(end, playSample(voice, voice.out, more, layer, when + (layer.delay ?? 0), gain));
  }
  return end;
}

/**
 * Play an event: its take where one has loaded (`bank`: samples.js createSampleBank, or null), with the synth's part beside it if the plan
 * has one; else the synth alone, as before. Returns the end time.
 */
export function playWithSamples(bank, voice, family, event, params, when, gain) {
  const plan = bank ? samplePlan(event.type, params, event) : null;
  const take = plan ? bank.pick(plan.set) : null;
  // (A family played only from its recordings, the cries: nothing until they have loaded.)
  if (!take) return family.sampledOnly ? when : family.play(voice, voice.out, params, when, gain);
  let end = playSample(voice, voice.out, take, plan, when, gain);
  for (const layer of plan.extra ?? []) {
    const more = bank.pick(layer.set);
    if (more) end = Math.max(end, playSample(voice, voice.out, more, layer, when + (layer.delay ?? 0), gain));
  }
  if (plan.synth) end = Math.max(end, family.play(voice, voice.out, plan.synth, when, gain * plan.synthGain));
  return end;
}
