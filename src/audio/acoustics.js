// The room the ear is in, probed rather than tagged: a few times a second, 12 rays from the head (8 round it, 3 rising at 45°, 1 straight
// up) are marched 30 m into the terrain he stands in (physics/terrain.js sweepReach; a place without terrain but with walls, the
// Colosseum's oval, by its `room` test). How near the walls and roof are, and how many rays come back, give the reverb:
//
//   - Energy that leaves by a ray that finds nothing escapes: up into the sky, or out across an open field, or out of a door. But a ray
//     along a passage that finds no wall within 30 m and is under a roof is not an escape (the sound goes down the passage and comes
//     back): it counts as a wall where the roof ends, or at the probe's end (30 m), the passage's length.
//   - The mean free path l is the rays' mean length (the escapes left out), and the reverb time Sabine's: RT60 = 0.161 V / (S α) with
//     V/S = l / 4, α the walls' absorption (rough stone and earth ~0.08) for the closed share and 1 (open air) for the escaping share.
//   - The reverberant level against the direct sound at a distance r is (r / r_c)², r_c = 0.057 √(V / RT60) the critical distance:
//     a sound's send to the reverb grows with its distance (reverbSend), times how closed the place is.
//   - Pre-delay: the first reflection's extra way, twice the nearest wall over the speed of sound. Damping: the air on the tail's
//     path (343 m/s × RT), the highs dying first.
//   - A passage with near walls on both sides and nothing at its ends flutters: a slap between the walls (2 w / 343 s).
//
// So an open field is nearly dry, a room short, the Dunnottar drains long and wet, without a word of any of them written into the stage.
// The result is eased over half a second (no jump at a doorway). The reverb itself is a convolver of generated decaying noise, three
// lengths cached and cross-faded, with a feedback delay for the flutter.

import { sweepReach } from '../physics/terrain.js';
import { airCutoff } from './ear.js';

/** The probe's numbers. */
export const PROBE = {
  length: 30,
  // A ray's ball (m): thin, so that it passes a doorway as the sound does.
  radius: 0.05,
  // The walls' absorption (rough stone, earth, timber: the castle's; there is no material in the terrain to say otherwise).
  absorption: 0.08,
  rate: 4,
  smoothing: 0.5,
  // The marching step against a place's `room` test (m).
  roomStep: 0.5,
  // A wall nearer than this on both sides of a passage, and its ends further than `flutterOpen`, makes it flutter.
  flutterNear: 3.5,
  flutterOpen: 12,
  // Where a ray that met nothing is looked at for a roof over it (m out).
  roofChecks: [4, 12, 26],
};

/** The 12 directions: 8 round the head, 3 rising at 45° (120° apart), 1 straight up. Each { dir, kind: 'side' | 'rising' | 'up' }. */
export const PROBE_RAYS = (() => {
  const rays = [];
  for (let k = 0; k < 8; k += 1) rays.push({ dir: [Math.cos((k * Math.PI) / 4), 0, Math.sin((k * Math.PI) / 4)], kind: 'side' });
  const s = Math.SQRT1_2;
  for (let k = 0; k < 3; k += 1) rays.push({ dir: [Math.cos((k * 2 * Math.PI) / 3) * s, s, Math.sin((k * 2 * Math.PI) / 3) * s], kind: 'rising' });
  rays.push({ dir: [0, 1, 0], kind: 'up' });
  return rays;
})();

/**
 * Cast the probe from `head` ([x, y, z]): the distance each ray goes before it meets a solid of `terrain` (or leaves `room`, a test
 * (x, z, y) → inside); where it meets nothing within the probe's length, Infinity (it escapes), or the length itself for a ray round the
 * head that stays under a roof all the way (a passage). Written into `out` (12 numbers).
 */
export function probeRays(terrain, room, head, out = new Array(PROBE_RAYS.length)) {
  for (let index = 0; index < PROBE_RAYS.length; index += 1) {
    const { dir, kind } = PROBE_RAYS[index];
    let reach = terrain ? sweepReach(terrain, head, dir, PROBE.length, PROBE.radius) : PROBE.length;
    // (A place's `room` is a plan, walls without a height: only the rays round the head are tested against it.)
    if (room && kind === 'side') {
      for (let along = PROBE.roomStep; along < reach; along += PROBE.roomStep) {
        if (!room(head[0] + dir[0] * along, head[2] + dir[2] * along, head[1] + dir[1] * along)) {
          reach = along;
          break;
        }
      }
    }
    out[index] = reach >= PROBE.length - 1e-6 ? (kind === 'side' && terrain ? roofedAlong(terrain, head, dir) : Infinity) : reach;
  }
  return out;
}

/**
 * How far a way along `dir` from `head` that meets no wall stays under a roof, looked at a few points out: Infinity if the sky is over it
 * at once (a door out, an open field); else the distance to where the roof ends, or the probe's length (a passage). An opening far down
 * a passage is small as seen from here: what goes down the passage mostly comes back, and the ray counts the passage's length.
 */
function roofedAlong(terrain, head, dir) {
  for (let index = 0; index < PROBE.roofChecks.length; index += 1) {
    const along = PROBE.roofChecks[index];
    const point = [head[0] + dir[0] * along, head[1], head[2] + dir[2] * along];
    if (sweepReach(terrain, point, PROBE_UP, PROBE.length, PROBE.radius) >= PROBE.length - 1e-6) return index === 0 ? Infinity : along;
  }
  return PROBE.length;
}
const PROBE_UP = [0, 1, 0];

/**
 * The room from a probe's 12 distances (Infinity: nothing met): { enclosure (the share of the energy kept: 0 open .. 1 shut),
 * hitShare, meanFree (m), volume (m³), rt60 (s), critical (m), wet (0..1), preDelay (s), damping (Hz), roofed, flutter { delay, feedback } }.
 */
export function roomFromProbe(hits) {
  const length = PROBE.length;
  const up = hits[PROBE_RAYS.length - 1];
  const risingHits = PROBE_RAYS.reduce((count, ray, index) => count + (ray.kind === 'rising' && Number.isFinite(hits[index]) ? 1 : 0), 0);
  const roofed = Number.isFinite(up) || risingHits >= 2;
  let escapes = 0;
  let found = 0;
  let pathSum = 0;
  let cubeSum = 0;
  let kept = 0;
  let nearest = Infinity;
  PROBE_RAYS.forEach((ray, index) => {
    const d = hits[index];
    if (Number.isFinite(d)) {
      found += 1;
      nearest = Math.min(nearest, d);
    }
    if (!Number.isFinite(d)) {
      escapes += 1;
      return;
    }
    const span = Math.max(0.3, d);
    pathSum += span;
    cubeSum += span ** 3;
    kept += 1;
  });
  const enclosure = 1 - escapes / PROBE_RAYS.length;
  const meanFree = kept ? pathSum / kept : length;
  // The space the kept rays span (each ray a twelfth of the sphere round the head), for the critical distance.
  const volume = Math.max(1, ((4 / 3) * Math.PI * cubeSum) / PROBE_RAYS.length);
  const alpha = PROBE.absorption * enclosure + (1 - enclosure);
  const rt60 = Math.max(0.05, Math.min(6, (0.04 * meanFree) / alpha));
  const critical = 0.057 * Math.sqrt(volume / rt60);
  // A passage: two opposite side rays near, the two across them far or open.
  let flutter = { delay: 0, feedback: 0 };
  if (roofed) {
    for (let k = 0; k < 4; k += 1) {
      const a = hits[k];
      const b = hits[k + 4];
      const c = hits[(k + 2) % 8];
      const d = hits[((k + 2) % 8) + 4];
      const far = (value) => !Number.isFinite(value) || value > PROBE.flutterOpen;
      if (a < PROBE.flutterNear && b < PROBE.flutterNear && far(c) && far(d)) {
        flutter = { delay: (2 * (a + b)) / 343, feedback: 0.5 * (1 - PROBE.absorption) * enclosure };
        break;
      }
    }
  }
  return {
    enclosure, hitShare: found / PROBE_RAYS.length, meanFree, volume, rt60, critical, roofed,
    // The reverberant field's share: none in the open, all of it in a closed room (each voice's send is by its distance: reverbSend).
    wet: enclosure * enclosure,
    preDelay: Math.max(0.002, Math.min(0.08, Number.isFinite(nearest) ? (2 * nearest) / 343 : 0.08)),
    damping: airCutoff(343 * rt60 * 0.5),
    flutter,
  };
}

/** A room for the open air (the start, and a place with nothing to probe). */
export const OPEN_ROOM = roomFromProbe(new Array(PROBE_RAYS.length).fill(Infinity));

/** Ease `current` toward `target` over the probe's smoothing time (in place): the reverb never jumps at a doorway. */
export function smoothRoom(current, target, dt, seconds = PROBE.smoothing) {
  const k = 1 - Math.exp(-dt / seconds);
  for (const key of ['enclosure', 'meanFree', 'volume', 'rt60', 'critical', 'wet', 'preDelay', 'damping', 'hitShare']) current[key] += (target[key] - current[key]) * k;
  current.flutter.delay += (target.flutter.delay - current.flutter.delay) * k;
  current.flutter.feedback += (target.flutter.feedback - current.flutter.feedback) * k;
  current.roofed = target.roofed;
  return current;
}

/** A copy of a room (to smooth into). */
export const copyRoom = (room) => ({ ...room, flutter: { ...room.flutter } });

/**
 * How much of a sound at `distance` m goes to the reverb (0..1): the reverberant field over the direct one, (r / r_c)² in energy, as an
 * amplitude, times the room's wetness; never more than the direct sound.
 */
export function reverbSend(room, distance) {
  const ratio = Math.max(0.3, distance) / Math.max(0.05, room.critical);
  return room.wet * Math.min(1, ratio);
}

// ---- The reverb itself -----------------------------------------------------------------------------------------------------------------

/** The impulse lengths cached (s): a short room, a hall, a long drain. */
export const REVERB_LENGTHS = [0.5, 1.6, 4.5];

/** A decaying stereo noise impulse of `seconds` (to -60 dB), darker as it goes (the air on its path). */
function reverbImpulse(ctx, seconds) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let y = 0;
    let energy = 0;
    for (let index = 0; index < length; index += 1) {
      const t = index / rate;
      const cutoff = airCutoff(343 * t + 1);
      const k = 1 - Math.exp((-2 * Math.PI * cutoff) / rate);
      y += k * ((Math.random() * 2 - 1) - y);
      data[index] = y * Math.exp((-6.9 * t) / seconds);
      energy += data[index] * data[index];
    }
    // The same energy for each length: a longer tail is longer, not louder.
    const scale = 1 / Math.sqrt(energy / rate + 1e-9) * 0.35;
    for (let index = 0; index < length; index += 1) data[index] *= scale;
  }
  return buffer;
}

/**
 * The reverb, from `input` to `output`: a pre-delay, three convolvers of the cached lengths whose gains are cross-faded by the room's
 * RT60, a low-pass for the damping, and the flutter's feedback delay beside them. `set(room, when)` moves it.
 */
export function createReverb(ctx, input, output) {
  const preDelay = ctx.createDelay(0.2);
  input.connect(preDelay);
  const damping = ctx.createBiquadFilter();
  damping.type = 'lowpass';
  damping.connect(output);
  const branches = REVERB_LENGTHS.map((seconds) => {
    const convolver = ctx.createConvolver();
    convolver.buffer = reverbImpulse(ctx, seconds);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    preDelay.connect(convolver);
    convolver.connect(gain);
    gain.connect(damping);
    return { seconds, gain };
  });
  // The flutter: a delay fed back on itself, low-passed (each slap a little duller), into the output.
  const flutter = ctx.createDelay(0.1);
  const feedback = ctx.createGain();
  const flutterTone = ctx.createBiquadFilter();
  flutterTone.type = 'lowpass';
  flutterTone.frequency.value = 3500;
  const flutterOut = ctx.createGain();
  flutterOut.gain.value = 0;
  feedback.gain.value = 0;
  input.connect(flutter);
  flutter.connect(flutterTone);
  flutterTone.connect(feedback);
  feedback.connect(flutter);
  flutterTone.connect(flutterOut);
  flutterOut.connect(output);
  return {
    set(room, when) {
      const glide = 0.1;
      preDelay.delayTime.setTargetAtTime(room.preDelay, when, glide);
      damping.frequency.setTargetAtTime(room.damping, when, glide);
      const weights = reverbWeights(room.rt60);
      branches.forEach((branch, index) => branch.gain.gain.setTargetAtTime(weights[index], when, glide));
      flutter.delayTime.setTargetAtTime(Math.max(0.005, room.flutter.delay || 0.02), when, glide);
      feedback.gain.setTargetAtTime(Math.min(0.7, room.flutter.feedback), when, glide);
      flutterOut.gain.setTargetAtTime(room.flutter.feedback > 0.01 ? 0.5 : 0, when, glide);
    },
  };
}

/** The cross-fade of the cached lengths for an RT60 (in the logarithm of the time, between the two lengths round it): sums to 1. */
export function reverbWeights(rt60) {
  const weights = REVERB_LENGTHS.map(() => 0);
  const t = Math.max(REVERB_LENGTHS[0], Math.min(REVERB_LENGTHS[REVERB_LENGTHS.length - 1], rt60));
  for (let index = 0; index < REVERB_LENGTHS.length - 1; index += 1) {
    const a = REVERB_LENGTHS[index];
    const b = REVERB_LENGTHS[index + 1];
    if (t <= b) {
      const share = Math.log(t / a) / Math.log(b / a);
      weights[index] = 1 - share;
      weights[index + 1] = share;
      return weights;
    }
  }
  weights[weights.length - 1] = 1;
  return weights;
}
