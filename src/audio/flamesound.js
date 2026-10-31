// The flamethrower's sound (a proof of concept: physics/flame.js). The roar of each jet while its valve is open, at its nozzle: the
// recorded take's whoosh at the head of each burst, then its roar looped; and the crackle of what burns (a man alight, a patch on the
// floor: the loudest few at the ear) where it burns, the recorded fire looped. Each loop is a gain and a stereo pan into the effects bus,
// eased to its level by its distance, faded out and taken down when it stops. engine.js calls `update` from its tick.
//
// Pure: `flameSources(world, listener)`, what of the fire is heard now.

import { distanceGain, earDirection } from './ear.js';
import { gainOfLevel } from './synth.js';

export const FLAME_SOUND = {
  // The loops (samples/README.md: the period, `seconds`, after `lead` s of its own tail) and the whoosh; each one's level at 1 m (dB SPL).
  roar: { file: 'flame-roar-1', seconds: 2, lead: 0.25, level: 106 },
  burn: { file: 'flame-burn-1', seconds: 3, lead: 0.25, level: 84 },
  start: { file: 'flame-start-1', level: 106 },
  // Burnings heard at once (the loudest at the ear); a patch's level is the man's at `patchFuel` kg.
  burnings: 3, patchFuel: 0.15,
  // How quickly a loop comes up to its level, and fades when it stops (s).
  ease: 0.05, fade: 0.35,
};

/** What of the fire is heard now: [{ key, kind ('roar' | 'burn'), at, level (dB SPL at 1 m) }]: every open jet, the loudest burnings. */
export function flameSources(world, listener) {
  const flame = world.flame;
  const out = [];
  if (flame) for (const [id, valve] of flame.valves) if (valve.open) out.push({ key: `roar:${id}:${valve.burst}`, kind: 'roar', at: valve.at, level: FLAME_SOUND.roar.level });
  const burnings = [];
  const heard = (source) => source.level + 20 * Math.log10(distanceGain(Math.hypot(source.at[0] - listener.x, source.at[1] - listener.y, source.at[2] - listener.z)));
  for (const fighter of world.fighters ?? []) {
    if (!fighter.burning || fighter.dormant) continue;
    const at = [fighter.x[3], fighter.x[4], fighter.x[5]];
    burnings.push({ key: `man:${fighter.id}`, kind: 'burn', at, level: FLAME_SOUND.burn.level + 20 * Math.log10(Math.max(0.05, fighter.burning.heat)) });
  }
  for (const patch of flame?.patches ?? []) burnings.push({ key: `patch:${patch.seed}`, kind: 'burn', at: patch.x, level: FLAME_SOUND.burn.level + 10 * Math.log10(Math.max(0.01, patch.fuel / FLAME_SOUND.patchFuel)) });
  burnings.sort((a, b) => heard(b) - heard(a));
  return out.concat(burnings.slice(0, FLAME_SOUND.burnings));
}

/** The fire's loops for a context: `update(world, now, { ctx, samples, out, listener })` each tick; `stop()` all of them. */
export function createFlameSound() {
  const beds = new Map();
  const end = (bed, at) => {
    bed.gain.gain.setTargetAtTime(0, at, FLAME_SOUND.fade / 3);
    bed.source.stop(at + FLAME_SOUND.fade);
  };
  function begin(ctx, samples, out, kind, now) {
    const spec = FLAME_SOUND[kind];
    const take = samples?.take(spec.file);
    if (!take) return null;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    gain.connect(pan);
    pan.connect(out);
    const source = ctx.createBufferSource();
    source.buffer = take.buffer;
    source.loop = true;
    source.loopStart = spec.lead;
    source.loopEnd = spec.lead + spec.seconds;
    source.playbackRate.value = 0.94 + Math.random() * 0.12;
    source.connect(gain);
    let at = now;
    // A burst begins with the valve's whoosh, the roar coming in under its tail.
    const whoosh = kind === 'roar' ? samples.take(FLAME_SOUND.start.file) : null;
    if (whoosh) {
      const head = ctx.createBufferSource();
      head.buffer = whoosh.buffer;
      head.connect(gain);
      head.start(now, whoosh.offset);
      at = now + 0.25;
    }
    source.start(at, spec.lead + Math.random() * spec.seconds);
    return { source, gain, pan };
  }
  return {
    update(world, now, { ctx, samples, out, listener }) {
      const live = new Set();
      for (const source of flameSources(world, listener)) {
        live.add(source.key);
        let bed = beds.get(source.key);
        if (!bed) {
          bed = begin(ctx, samples, out, source.kind, now);
          if (!bed) continue;
          beds.set(source.key, bed);
        }
        const seen = earDirection(listener, source.at[0], source.at[1], source.at[2]);
        bed.pan.pan.setTargetAtTime(Math.sin(seen.azimuth), now, 0.05);
        bed.gain.gain.setTargetAtTime(gainOfLevel(source.level + 20 * Math.log10(distanceGain(seen.distance))), now, FLAME_SOUND.ease);
      }
      for (const [key, bed] of beds) {
        if (live.has(key)) continue;
        end(bed, now);
        beds.delete(key);
      }
    },
    stop(now = 0) {
      for (const bed of beds.values()) end(bed, now);
      beds.clear();
    },
  };
}
