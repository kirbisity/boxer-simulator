// Which events a recorded take plays (audio/samples.js), and how: `samplePlan` is pure (Node tests), `playWithSamples` plays.
//
// The take is scheduled at the event's instant (its transient at its start) into the same voice as the synth would be, so the
// distance, the air, the wall between, the panner and the room's reverb are the same. How loud: the engine's gain (the event's level at
// the ear, from its energy) times the set's trim (the clips are cut to the same peak, the synth's parts add up to about the gain). How
// long: a light blow is cut short with a quick fade, a heavy one rings out. Its pitch: a heavier weapon (or body) a little lower, and
// every take a few per cent off at random so no two blows are the same. Where a sound has a part no take has (the ground under a step, a
// blade's scrape), the synth plays that part beside the take.

import { sfxClamp, sfxKeep, sfxRun } from '../synth.js';

const SAMPLED_HEADS = new Set(['blade', 'point', 'blunt']);
const SAMPLED_SOFT = new Set(['flesh', 'padded', 'leather']);
const SAMPLED_HARD = new Set(['plate', 'shieldmetal']);

/** A strength 0..1 of `value` on a log scale from `low` to `high`. */
export const sampleStrength = (value, low, high) => sfxClamp(Math.log(Math.max(low, value) / low) / Math.log(high / low), 0, 1);
const sampleLerp = (a, b, share) => a + (b - a) * share;
/** A weapon's pitch: a heavier head lower (~ m^-0.2, about a sword's at 1.2 kg). */
export const sampleMassRate = (mass, reference = 1.2) => sfxClamp((reference / Math.max(0.1, mass ?? reference)) ** 0.2, 0.82, 1.2);

/**
 * The plan for an event (its type, its family's params, the event): { set, trim (× the gain), rate (playback), seconds (the most to play,
 * null for the whole take), fade (s, at its end), skip (s more into the take), synth (params the synth plays beside it, or null), synthGain },
 * or null where the synth alone plays it.
 */
export function samplePlan(type, params, event = {}, random = Math.random) {
  const jitter = (spread = 0.06) => 1 + (random() * 2 - 1) * spread;
  switch (type) {
    case 'hit': {
      if (!SAMPLED_HEADS.has(params.striker)) return null;
      const s = sampleStrength(params.energy, 5, 400);
      const rate = sampleMassRate(event.mass) * jitter();
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
      // Steel on steel only (a haft or a wooden shield is the synth's chop).
      if (params.wood) return null;
      const s = sampleStrength(params.speed, 1, 20);
      const blunt = !params.modes.length || params.modes[0].f < 500;
      return {
        set: 'clash', trim: 1, rate: sampleMassRate(event.mass) * (blunt ? 0.85 : 1) * jitter(), seconds: sampleLerp(0.15, 0.8, s), fade: sampleLerp(0.04, 0.25, s), skip: 0,
        // Edge along edge: the synth's scrape beside it (without its own ring).
        synth: params.scrape > 0 ? { ...params, modes: [] } : null, synthGain: 0.7,
      };
    }
    case 'step': {
      if (params.armour !== 'plate' && params.armour !== 'mail') return null;
      // The armour's clank with each step (mail lighter and brighter); the ground under the foot still the synth's.
      const mail = params.armour === 'mail';
      return { set: 'armourstep', trim: (mail ? 0.4 : 0.6) * sampleLerp(0.7, 1.2, sampleStrength(params.pace, 0.5, 6)), rate: sfxClamp((85 / Math.max(40, event.mass ?? 85)) ** 0.25, 0.85, 1.15) * (mail ? 1.15 : 1) * jitter(0.05), seconds: null, fade: 0.06, skip: 0, synth: { ...params, armour: 'none' }, synthGain: 0.8 };
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
      if (event.head !== 'blunt') return null;
      return { set: 'maceswing', trim: 0.9, rate: sfxClamp((params.speed / 15) ** 0.2, 0.85, 1.2) * jitter(0.05), seconds: sfxClamp(params.seconds * 2, 0.25, 0.6), fade: 0.12, skip: 0.06, synth: null, synthGain: 0 };
    }
    case 'shot':
      // A matchlock: the recorded report, the synth's low boom under it (what a recording through a phone has little of).
      if (params.kind !== 'matchlock') return null;
      return { set: 'gunshot', trim: 1, rate: jitter(0.04), seconds: null, fade: 0.3, skip: 0, synth: params, synthGain: 0.35 };
    default:
      return null;
  }
}

/** Play a take into `out` at `when` by a plan, at `gain` (the engine's). Returns the end time. */
export function playSample(voice, out, take, plan, when, gain) {
  const ctx = voice.ctx;
  const start = Math.min(take.buffer.duration - 0.02, take.offset + (plan.skip ?? 0));
  const whole = (take.buffer.duration - start) / plan.rate;
  const seconds = Math.max(0.03, Math.min(whole, plan.seconds ?? whole));
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
  if (!take) return family.play(voice, voice.out, params, when, gain);
  let end = playSample(voice, voice.out, take, plan, when, gain);
  if (plan.synth) end = Math.max(end, family.play(voice, voice.out, plan.synth, when, gain * plan.synthGain));
  return end;
}
