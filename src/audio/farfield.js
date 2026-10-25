// The far field: beyond the ear's circle men are not heard one by one but counted. One pass over the fighters puts each man past 20 m
// into one of 8 sectors of 45° round the ear (by the camera: sector 0 dead ahead on the screen, 2 to the right, 4 behind, 6 to the
// left), adding his shouting's energy and, if he is fighting (a blow under way, a body in contact), his share of the clash of
// weapons, each by the inverse square of his distance: many men far off add up as incoherent sources do, in energy. Each sector's two
// levels drive a looped din panned to it (a bed of shouting, a bed of clashing), eased so that the roar swells and falls rather than
// jumps. Cheap for hundreds: no allocation, a few multiplications a man.

import { P } from '../body.js';
import { EAR } from './ear.js';
import { gainOfLevel, sfxBuffer, sfxRandom, writeGrains, lowpassInPlace } from './synth.js';

/** The far field's numbers: the sectors, and each man's levels at 1 m (dB SPL): a man shouting in a fight, one marching or waiting, the clash of his weapon. */
export const FAR_FIELD = { sectors: 8, shoutFighting: 88, shoutIdle: 70, clash: 92, ease: 0.6 };

/** The sectors' sums, made once: per sector the men counted, those fighting, the nearest, and the energies. */
export function createSectors(count = FAR_FIELD.sectors) {
  return { men: new Float64Array(count), fighting: new Float64Array(count), nearest: new Float64Array(count).fill(Infinity), shout: new Float64Array(count), clash: new Float64Array(count) };
}

/** The sector (0..7) of an azimuth (rad, 0 ahead, + right). */
export function sectorOf(azimuth, count = FAR_FIELD.sectors) {
  const width = (2 * Math.PI) / count;
  return ((Math.round(azimuth / width) % count) + count) % count;
}

/** The sector's middle azimuth (rad). */
export const sectorAzimuth = (sector, count = FAR_FIELD.sectors) => {
  const azimuth = (sector * 2 * Math.PI) / count;
  return azimuth > Math.PI ? azimuth - 2 * Math.PI : azimuth;
};

/**
 * Count the fighters past `radius` (the ear's) into the sectors round `listener` (ear.js): one pass, written into `sectors`.
 * A man out of the fight or dormant (a stage's section asleep) is silent.
 */
export function countSectors(fighters, listener, sectors, radius = EAR.radius) {
  const n = sectors.men.length;
  sectors.men.fill(0);
  sectors.fighting.fill(0);
  sectors.nearest.fill(Infinity);
  sectors.shout.fill(0);
  sectors.clash.fill(0);
  const pelvis = P.pelvis * 3;
  const fx = listener.forward[0];
  const fz = listener.forward[2];
  const rx = listener.right[0];
  const rz = listener.right[2];
  // The camera's ground plane: its forward and right flattened (a camera looking down still has a front).
  const fl = Math.hypot(fx, fz) || 1;
  const rl = Math.hypot(rx, rz) || 1;
  const idle = 10 ** (FAR_FIELD.shoutIdle / 10);
  const fighting = 10 ** (FAR_FIELD.shoutFighting / 10);
  const clash = 10 ** (FAR_FIELD.clash / 10);
  const r2 = radius * radius;
  for (let index = 0; index < fighters.length; index += 1) {
    const fighter = fighters[index];
    if (fighter.dormant || fighter.state === 'out') continue;
    const dx = fighter.x[pelvis] - listener.x;
    const dz = fighter.x[pelvis + 2] - listener.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= r2) continue;
    const front = (dx * fx + dz * fz) / fl;
    const right = (dx * rx + dz * rz) / rl;
    const sector = sectorOf(Math.atan2(right, front), n);
    const engaged = fighter.punch || fighter.contacts?.size > 0;
    sectors.men[sector] += 1;
    if (engaged) sectors.fighting[sector] += 1;
    const d = Math.sqrt(d2);
    if (d < sectors.nearest[sector]) sectors.nearest[sector] = d;
    sectors.shout[sector] += (engaged ? fighting : idle) / d2;
    if (engaged) sectors.clash[sector] += clash / d2;
  }
  return sectors;
}

/** A sector's two levels at the ear (dB SPL; -Infinity silent) from its energies. */
export function sectorLevels(sectors, sector) {
  return { shout: 10 * Math.log10(sectors.shout[sector]), clash: 10 * Math.log10(sectors.clash[sector]) };
}

// ---- The din ---------------------------------------------------------------------------------------------------------------------------

/**
 * A looped bed of many men shouting, made once (seeded, 6 s): glottal buzzes at scattered pitches and vowels, each a second or so,
 * overlapping, through a crowd's mean formants. The level is the sector's; the bed itself has unit loudness.
 */
function shoutBed(ctx) {
  const random = sfxRandom(77);
  return sfxBuffer(ctx, 6, (data, rate) => {
    const voices = 36;
    for (let v = 0; v < voices; v += 1) {
      const start = random() * 6;
      const seconds = 0.4 + random() * 1.1;
      const f0 = 110 * (1.3 + random() * 1.4);
      const length = Math.floor(seconds * rate);
      const at = Math.floor(start * rate);
      let phase = 0;
      for (let k = 0; k < length; k += 1) {
        const index = (at + k) % data.length;
        const share = k / length;
        const envelope = Math.sin(Math.PI * share) ** 0.6;
        phase += (f0 * (1 + 0.1 * Math.sin(share * 6))) / rate;
        // A buzz rich in harmonics (the sum of a few), shaped by the envelope.
        const p = phase % 1;
        data[index] += (p < 0.12 ? 1 - p / 0.12 : 0) * envelope * 0.15;
      }
    }
    // The crowd's formants smear into a broad hump at 500-1500 Hz: a low-pass over the buzz, and the highs left by a gentle one.
    lowpassInPlace(data, rate, 1800);
  });
}

/** A looped bed of weapons meeting far off (seeded, 5 s): clangs and knocks, their highs already dulled by the way. */
function clashBed(ctx) {
  const random = sfxRandom(31);
  return sfxBuffer(ctx, 5, (data, rate) => {
    writeGrains(data, rate, { count: 70, spread: 4.9, low: 500, high: 3200, decay: 0.25, amp: 0.25, bunch: 1, random });
    writeGrains(data, rate, { count: 50, spread: 4.9, low: 180, high: 600, decay: 0.08, amp: 0.3, bunch: 1, random });
    lowpassInPlace(data, rate, 3500);
  });
}

/**
 * The far field's sound: per sector a panner and two looped beds (shout, clash) with their gains. `update(sectors, dt, when)` eases each
 * to its level. Built into `out` (the ambience bus); `makePanner(azimuth, out)` gives the input of a panner for a side, wired into `out`.
 */
export function createFarField(ctx, out, makePanner) {
  const shout = shoutBed(ctx);
  const clang = clashBed(ctx);
  const beds = [];
  for (let sector = 0; sector < FAR_FIELD.sectors; sector += 1) {
    // (The engine's panner for that side, already wired into `out`: its input.)
    const panner = makePanner(sectorAzimuth(sector), out);
    const pair = [shout, clang].map((buffer) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      // Each sector its own place in the loop and a slightly different speed: no two sides alike.
      source.playbackRate.value = 0.94 + 0.12 * ((sector * 37) % 10) / 10;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(panner);
      source.start(ctx.currentTime, (sector * 0.73) % buffer.duration);
      return gain;
    });
    beds.push({ panner, shout: pair[0], clash: pair[1], level: [0, 0] });
  }
  return {
    update(sectors, when) {
      for (let sector = 0; sector < beds.length; sector += 1) {
        const levels = sectorLevels(sectors, sector);
        const bed = beds[sector];
        bed.shout.gain.setTargetAtTime(Number.isFinite(levels.shout) ? gainOfLevel(levels.shout) : 0, when, FAR_FIELD.ease);
        bed.clash.gain.setTargetAtTime(Number.isFinite(levels.clash) ? gainOfLevel(levels.clash) : 0, when, FAR_FIELD.ease);
      }
    },
    beds,
  };
}
