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
// Cries (a voice event the cry director, audio/cries.js, let through: its `cry`): the sex's set of its kind, at the voice's pitch, a
// light hurt cut short; with no take they are silent (the synth's voice is not played: families.js `sampledOnly`).

import { sfxClamp, sfxKeep, sfxRun } from '../synth.js';
import { cryOfEvent } from './voice.js';

const SAMPLED_HEADS = new Set(['blade', 'point', 'blunt']);
const SAMPLED_SOFT = new Set(['flesh', 'padded', 'leather']);
const SAMPLED_HARD = new Set(['plate', 'shieldmetal']);

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
};
/** Heels (a heeled boot, outfits.js `heels`: the gear's heelLift) on a hard floor click: the recorded heels, whatever the pace. */
const HEEL_STEPS = {
  stone: { walk: 'step-heel', run: 'step-heel', trim: 1.1, rate: 1 },
  tile: { walk: 'step-heel', run: 'step-heel', trim: 1.1, rate: 1.05 },
  wood: { walk: 'step-heel', run: 'step-heel', trim: 1.1, rate: 0.95, synthGain: 0.35 },
};
/** A limb's (or a body's) blow: its pitch (a foot or a knee heavier than a fist, lower; a shoulder's crash a dull thud) and its trim. */
const LIMB_BLOWS = { fist: { rate: 1.04, trim: 1.2 }, elbow: { rate: 1, trim: 1.2 }, head: { rate: 0.95, trim: 1.1 }, knee: { rate: 0.92, trim: 1.25 }, foot: { rate: 0.88, trim: 1.3 }, body: { rate: 0.8, trim: 1 } };
const HOOF_HARD = new Set(['stone', 'tile', 'wood']);
const HOOF_SOFT = new Set(['earth', 'grass', 'sand', 'snow']);
/** A hoof by its gait: the trim and the rate. */
const HOOF_PACE = { walk: { trim: 0.7, rate: 0.94 }, trot: { trim: 0.85, rate: 0.97 }, canter: { trim: 1, rate: 1 }, gallop: { trim: 1.1, rate: 1.03 } };

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
 * played with it: { set, trim, rate, seconds, fade, skip }), synth (params the synth plays beside it, or null), synthGain },
 * or null where the synth alone plays it.
 */
export function samplePlan(type, params, event = {}, random = Math.random) {
  const jitter = (spread = 0.06) => 1 + (random() * 2 - 1) * spread;
  switch (type) {
    case 'hit': {
      const limb = LIMB_BLOWS[params.striker];
      if (!SAMPLED_HEADS.has(params.striker) && !limb) return null;
      const s = sampleStrength(params.energy, 5, 400);
      const rate = sampleMassRate(event.mass) * jitter();
      // A helmet struck rings (by a weapon, a fist or a boot; a shoulder's crash is the synth's): a heavier blow louder and rung out longer.
      if (event.part === 'head' && params.covering === 'plate' && params.striker !== 'body') {
        return { set: 'helmet', trim: (limb ? 0.8 : 1) * sampleLerp(0.75, 1.15, s), rate: rate * (params.striker === 'blunt' ? 0.88 : 1) * (limb ? 1.08 : 1), seconds: sampleLerp(0.22, 0.75, s), fade: sampleLerp(0.06, 0.3, s), skip: 0, synth: null, synthGain: 0 };
      }
      // A wooden shield's boards knocked hollow (anything on them): a heavier blow fuller and longer, a weight's lower.
      if (params.covering === 'wood') {
        return { set: 'woodshield', trim: (limb ? limb.trim * 0.75 : 1) * sampleLerp(0.75, 1.15, s), rate: (limb ? limb.rate : rate) * (params.striker === 'blunt' ? 0.9 : 1), seconds: sampleLerp(0.12, 0.32, s), fade: sampleLerp(0.04, 0.14, s), skip: 0, synth: null, synthGain: 0 };
      }
      // A punch, a kick, a knee, an elbow, a head or a shoulder into the body (bare, padded or leather): the recorded punch, the harder
      // blow louder and its whole take, the lighter one clipped short.
      if (limb) {
        if (!SAMPLED_SOFT.has(params.covering)) return null;
        const p = sampleStrength(params.energy, 3, 300);
        return { set: 'punch', trim: limb.trim * sampleLerp(0.75, 1.2, p), rate: limb.rate * jitter(), seconds: sampleLerp(0.1, 0.26, p), fade: sampleLerp(0.03, 0.1, p), skip: 0, synth: null, synthGain: 0 };
      }
      // A blade into flesh slices; a weight into it lands on the bone under it.
      if (SAMPLED_SOFT.has(params.covering)) return { set: params.striker === 'blunt' ? 'bonehit' : 'slice', trim: params.striker === 'blunt' ? 1 : 0.85, rate, seconds: sampleLerp(0.22, 0.75, s), fade: sampleLerp(0.04, 0.2, s), skip: 0, synth: null, synthGain: 0 };
      // Steel on steel plate (or a steel shield): the crash of it; a weight heavier, lower.
      if (SAMPLED_HARD.has(params.covering)) return { set: 'break', trim: 0.9, rate: rate * (params.striker === 'blunt' ? 0.85 : 1), seconds: sampleLerp(0.2, 0.6, s), fade: sampleLerp(0.05, 0.2, s), skip: 0, synth: null, synthGain: 0 };
      return null;
    }
    case 'wound': {
      const s = params.severity;
      if (params.kind === 'cut') return { set: 'gore', trim: 0.7, rate: jitter(), seconds: sampleLerp(0.25, 0.85, s), fade: sampleLerp(0.06, 0.25, s), skip: 0, synth: null, synthGain: 0 };
      if (params.kind === 'bone') return { set: 'bones', trim: 1, rate: jitter(), seconds: sampleLerp(0.15, 0.5, s), fade: sampleLerp(0.03, 0.12, s), skip: 0, synth: null, synthGain: 0 };
      // A skull or a neck giving way: the bones' snap, lower and slower.
      if (params.kind === 'crush') return { set: 'bones', trim: 1, rate: 0.8 * jitter(0.04), seconds: null, fade: 0.12, skip: 0, synth: null, synthGain: 0 };
      return null;
    }
    case 'clash': {
      const s = sampleStrength(params.speed, 1, 20);
      // Steel into wood: a wooden shield's boards knocked; a haft (thinner, its first mode higher) the same take a little higher and shorter.
      if (params.wood) {
        return { set: 'woodshield', trim: sampleLerp(0.75, 1.15, s), rate: sfxClamp((params.wood.base / 300) ** 0.5, 0.9, 1.3) * jitter(), seconds: sampleLerp(0.1, 0.3, s) * (300 / params.wood.base), fade: sampleLerp(0.04, 0.12, s), skip: 0, synth: null, synthGain: 0 };
      }
      const blunt = !params.modes.length || params.modes[0].f < 500;
      return {
        set: 'clash', trim: 1, rate: sampleMassRate(event.mass) * (blunt ? 0.85 : 1) * jitter(), seconds: sampleLerp(0.15, 0.8, s), fade: sampleLerp(0.04, 0.25, s), skip: 0,
        // Edge along edge: the synth's scrape beside it (without its own ring).
        synth: params.scrape > 0 ? { ...params, modes: [] } : null, synthGain: 0.7,
      };
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
      if (params.armour !== 'plate' && params.armour !== 'mail') return null;
      const s = sampleStrength(params.speed, 0.8, 9);
      const synth = { ...params, armour: 'none' };
      // A man in armour going down crashes with it; landing on his feet, a heavy step's clank.
      if (params.kind === 'fall') return { set: 'clatter', trim: (params.armour === 'mail' ? 0.5 : 0.75) * sampleLerp(0.6, 1.1, s), rate: sfxClamp((85 / Math.max(40, event.mass ?? 85)) ** 0.2, 0.85, 1.15) * 0.9 * jitter(0.04), seconds: sampleLerp(0.4, 1, s), fade: 0.2, skip: 0, synth, synthGain: 1 };
      return { set: 'armourstep', trim: 0.8 * sampleLerp(0.7, 1.2, s), rate: 0.9 * jitter(0.05), seconds: null, fade: 0.06, skip: 0, synth, synthGain: 1 };
    }
    case 'clatter': {
      const s = sampleStrength(params.speed, 1.2, 8);
      return { set: 'clatter', trim: sampleLerp(0.6, 1, s), rate: sampleMassRate(params.mass) * jitter(), seconds: sampleLerp(0.3, 1, s), fade: sampleLerp(0.08, 0.3, s), skip: 0, synth: null, synthGain: 0 };
    }
    case 'swing': {
      // A weight's whoosh (a mace, a club, an axe's head); a blade's thin whistle stays the synth's. The swing is logged at the stroke's
      // fastest, so the take starts a little into its rise.
      // A fist or a foot driven at a man (log.js trackPunchSwing: logged as the drive starts): the whoosh rising into the blow, its loud
      // end played (the take's last `seconds`, about the drive's), a faster drive louder and longer, a kick lower. The air off a limb is
      // 20-30 dB under a blade's (swingParams), lost under the blows at its own level: lifted (×18) to about 8 dB under the punch.
      if (event.head === 'fist' || event.head === 'foot') {
        const s = sampleStrength(params.speed, 4, 14);
        return { set: 'fistswing', trim: 18 * sampleLerp(0.7, 1.3, s), rate: sfxClamp((params.speed / 9) ** 0.15, 0.9, 1.12) * (event.head === 'foot' ? 0.85 : 1) * jitter(0.05), seconds: sfxClamp(event.reach ?? 0.25, 0.15, 0.4) * sampleLerp(0.8, 1.2, s), fade: 0.03, skip: 0, fromEnd: true, synth: null, synthGain: 0 };
      }
      if (event.head !== 'blunt') return null;
      return { set: 'maceswing', trim: 0.9, rate: sfxClamp((params.speed / 15) ** 0.2, 0.85, 1.2) * jitter(0.05), seconds: sfxClamp(params.seconds * 2, 0.25, 0.6), fade: 0.12, skip: 0.06, synth: null, synthGain: 0 };
    }
    case 'horse': {
      if (params.kind === 'neigh') return { set: 'neigh', trim: 1, rate: sfxClamp((500 / Math.max(150, event.mass ?? 500)) ** 0.2, 0.85, 1.2) * jitter(0.04), seconds: null, fade: 0.25, skip: 0, synth: null, synthGain: 0 };
      if (params.kind !== 'hoof') return null;
      // A hoof on hard ground (stone, tile, boards) clops; on earth, grass, sand or snow it thuds (the gallop's). Mud and water are the synth's.
      const set = HOOF_HARD.has(params.surface) ? 'hoof-stone' : HOOF_SOFT.has(params.surface) ? 'hoof-soft' : null;
      if (!set) return null;
      // A walking horse sets its hooves down softer and slower than a galloping one comes down on them.
      const pace = HOOF_PACE[event.gait] ?? HOOF_PACE.trot;
      return { set, trim: pace.trim, rate: sfxClamp((500 / Math.max(150, event.mass ?? 500)) ** 0.15, 0.85, 1.15) * pace.rate * jitter(0.05), seconds: null, fade: 0.03, skip: 0, synth: null, synthGain: 0 };
    }
    case 'shot':
      // A matchlock: the recorded report, the synth's low boom under it (what a recording through a phone has little of).
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
    case 'charge':
      // The army's roar (engine.js loops it; the board plays it once): its whole take.
      return { set: 'charge', trim: 1, rate: jitter(0.03), seconds: null, fade: 0.5, skip: 0, synth: null, synthGain: 0 };
    default:
      return null;
  }
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
    if (more) end = Math.max(end, playSample(voice, voice.out, more, layer, when, gain));
  }
  if (plan.synth) end = Math.max(end, family.play(voice, voice.out, plan.synth, when, gain * plan.synthGain));
  return end;
}
