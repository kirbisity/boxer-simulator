// An army's charge: the roar of many men running at the enemy together (the recorded `charge` loop, samples.js). Not an order read
// but what the men are doing, so it is the same for any battle, any level: per side, the men up and unbroken running at the enemy
// (their pelvis's speed toward the nearest foe past `run` m/s) and not yet met (that foe further than `met` m). With `from` or more of
// them and `share` of the side, the side `sideFrom` strong, the side is charging (until fewer than `holdTo` run on): its roar rises, as loud as their
// number and their distance make it (each man's shout summed in energy over his distance, as the far field sums), from where they are,
// and fades out as the lines close (the mean gap from `fadeFrom` m down to `met`). A duel, a brawl, a few men running: never.
//
// His pace is measured as his pelvis moved since the last look (`was.seen`, over `now`'s step): a far man posed on a beat (physics.js
// proxy) has no velocity of his own; until there is a last look, his velocity.
//
// Pure: `chargeOf(fighters, listener, was, now)` → per side { charging, count, at [x, z], gap, level (dB SPL at the ear) }; engine.js plays it.

import { P } from '../body.js';

/** The charge's numbers. */
export const CHARGE = {
  // Men running at the enemy at once for a charge (a few running is not one), and the share of their side (a battle's opening rush runs
  // a third of a side at once: measured, the levels' 30-35 a side put 10-24 men running together, then a man here and there), the
  // side's least size (a duel or a brawl never), and the count it holds to once begun.
  from: 10, share: 0.3, sideFrom: 20, holdTo: 6,
  // Running (m/s toward his nearest foe: a jog is ~2, a run 3-5), and met (m to the nearest foe: the lines have closed on him).
  run: 2.2, met: 3,
  // The roar fades from this mean gap (m) to `met`: gone as the lines meet, the fight's own noise taking over.
  fadeFrom: 14,
  // A man's roar at 1 m (dB SPL: a shout); the least distance counted (m, his own line round the ear).
  shout: 92, nearest: 4,
  // The loop's length (s): the take is `loopSeconds` of roar whose end runs into its head (samples/README.md); the rise and fall (s).
  loopSeconds: 6, ease: 0.8,
};

/**
 * Each side's charge: { charging, count (men charging), men (the side's up), at [x, z] (their middle), gap (their mean distance to
 * the nearest foe), level (dB SPL at the ear, -Infinity none), fade (0..1 as the lines close) }, by corner. `was`: the last result (its
 * `charging` holds a charge down to CHARGE.holdTo).
 */
export function chargeOf(fighters, listener, was = null, now = null) {
  const seen = new Map();
  const before = was?.seen;
  const elapsed = now !== null && was?.now !== undefined ? now - was.now : 0;
  const sides = new Map();
  for (const fighter of fighters) {
    if (fighter.dormant || fighter.state === 'out' || !fighter.x) continue;
    let side = sides.get(fighter.corner);
    if (!side) sides.set(fighter.corner, (side = []));
    side.push(fighter);
  }
  const out = {};
  const pelvis = P.pelvis * 3;
  for (const [corner, men] of sides) {
    const foes = [];
    for (const [other, list] of sides) if (other !== corner) foes.push(...list);
    let count = 0;
    let sx = 0;
    let sz = 0;
    let gaps = 0;
    let energy = 0;
    for (const man of men) {
      // (A machine roars at nobody.)
      if (man.state !== 'up' || man.panicked || man.body?.gear?.machine) continue;
      const x = man.x[pelvis];
      const z = man.x[pelvis + 2];
      seen.set(man.id, [x, z]);
      let best = Infinity;
      let fx = 0;
      let fz = 0;
      for (const foe of foes) {
        const dx = foe.x[pelvis] - x;
        const dz = foe.x[pelvis + 2] - z;
        const d = dx * dx + dz * dz;
        if (d < best) {
          best = d;
          fx = dx;
          fz = dz;
        }
      }
      if (!Number.isFinite(best)) continue;
      const gap = Math.sqrt(best);
      if (gap <= CHARGE.met) continue;
      const last = elapsed > 0.05 ? before?.get(man.id) : null;
      const vx = last ? (x - last[0]) / elapsed : man.v[pelvis];
      const vz = last ? (z - last[1]) / elapsed : man.v[pelvis + 2];
      const toward = (vx * fx + vz * fz) / gap;
      if (toward < CHARGE.run) continue;
      count += 1;
      sx += x;
      sz += z;
      gaps += gap;
      const d = Math.max(CHARGE.nearest, Math.hypot(x - listener.x, z - listener.z));
      energy += 1 / (d * d);
    }
    const holding = was?.[corner]?.charging;
    const charging = men.length >= CHARGE.sideFrom && count >= (holding ? CHARGE.holdTo : Math.max(CHARGE.from, CHARGE.share * men.length));
    const gap = count ? gaps / count : Infinity;
    const fade = count ? Math.max(0, Math.min(1, (gap - CHARGE.met) / (CHARGE.fadeFrom - CHARGE.met))) : 0;
    out[corner] = {
      charging, count, men: men.length, at: count ? [sx / count, sz / count] : null, gap, fade,
      level: charging && fade > 0 ? CHARGE.shout + 10 * Math.log10(energy) + 20 * Math.log10(fade) : -Infinity,
    };
  }
  // (Kept apart from the sides: the next look's pace.)
  Object.defineProperty(out, 'seen', { value: seen });
  Object.defineProperty(out, 'now', { value: now ?? undefined });
  return out;
}
