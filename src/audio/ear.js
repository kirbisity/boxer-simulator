// The ear: the listener and what it hears. Sounds are not emitted by the things that make them; each audio tick the ear takes what the
// simulation recorded inside its circle (audio/log.js: 20 m round the player's head) and decides which of it becomes sound: how loud
// each event is where the ear is, whether it is worth a voice, which voices it may take from quieter sounds.
//
// The listener is a hybrid (the user's choice): the *direction* of a sound is the camera's (what is on the left of the screen is heard
// on the left, what is behind the camera behind), its *distance* the player's head's (a fight 3 m from him is 3 m away however far the
// camera has pulled back). Where nobody is played (a battle watched, a duel spectated) the head is the camera's focus.
//
// Distance is real: inverse distance from 1 m (-6 dB a doubling), the air taking the highs as the way grows longer (ISO 9613: about
// 0.1 dB/m at 8 kHz, rising as the square of the frequency), with a floor inside the circle so that a fight 15 m away still carries.
// Between 10 and 20 m quiet events thin out first (a footstep there is lost, a clang or a cry is not); past 20 m only thunder and gunfire
// are heard one by one, the rest is the far field's din (farfield.js).
//
// All pure: Node tests run it.

/** The ear's numbers. */
export const EAR = {
  radius: 20,
  // Full detail inside this; between it and the radius quiet events thin out.
  full: 10,
  // The least the inverse distance comes to inside the circle (-23 dB: reached at 14 m), so a fight at the edge stays audible.
  floor: 0.07,
  // The level at the ear (dB SPL) an event must reach to be played at the full distance, rising to `thinTo` at the radius.
  thinFrom: 35,
  thinTo: 60,
  // The voices at once: a desktop's, and a phone's (a slower machine, a small speaker).
  budget: 24,
  phoneBudget: 14,
  // A new sound takes a playing voice only if it is this much louder (dB) than the quietest one.
  stealMargin: 3,
  // A wall between: what gets round it (diffraction carries the lows) is this much quieter (dB) and low-passed to `blockedCutoff` Hz.
  blockedLoss: 12,
  blockedCutoff: 900,
  // Speakers (no head-related filtering): a sound behind is dulled as the outer ear shadows it (from 90° off the nose to straight behind).
  behindCutoff: 4500,
  // The most of each kind started in one tick (the rest merged or dropped): the steps of many men at once are a single patter.
  perTick: { step: 6, swing: 5, voice: 4, hit: 8, wound: 6, clash: 6, fall: 4, land: 4, clatter: 3, horse: 6, shot: 6, arrowhit: 6, mech: 4, thunder: 2, robotSpark: 3, draw: 4 },
};

/** A listener: where the head is and how the camera faces (its right, up and forward, unit vectors in the world). */
export function createListener() {
  return { x: 0, y: 1.6, z: 0, right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, -1] };
}

/**
 * Put the listener at the head (`head`: [x, y, z]) facing as the camera does. `camera`: a three.js camera's `matrixWorld.elements`
 * (column-major: its x axis is the screen's right, its y the screen's up, its z points back out of the screen).
 */
export function placeListener(listener, head, camera) {
  listener.x = head[0];
  listener.y = head[1];
  listener.z = head[2];
  if (!camera) return listener;
  const length = (x, y, z) => Math.hypot(x, y, z) || 1;
  const r = length(camera[0], camera[1], camera[2]);
  listener.right[0] = camera[0] / r; listener.right[1] = camera[1] / r; listener.right[2] = camera[2] / r;
  const u = length(camera[4], camera[5], camera[6]);
  listener.up[0] = camera[4] / u; listener.up[1] = camera[5] / u; listener.up[2] = camera[6] / u;
  const b = length(camera[8], camera[9], camera[10]);
  listener.forward[0] = -camera[8] / b; listener.forward[1] = -camera[9] / b; listener.forward[2] = -camera[10] / b;
  return listener;
}

/**
 * Where a point is from the ear: { distance (m), azimuth (rad: 0 ahead on screen, +π/2 to the right, ±π behind the camera), elevation
 * (rad, up the screen positive) }. Written into `out` (no allocation in a loop).
 */
export function earDirection(listener, x, y, z, out = { distance: 0, azimuth: 0, elevation: 0 }) {
  const dx = x - listener.x;
  const dy = y - listener.y;
  const dz = z - listener.z;
  const distance = Math.hypot(dx, dy, dz);
  const right = dx * listener.right[0] + dy * listener.right[1] + dz * listener.right[2];
  const up = dx * listener.up[0] + dy * listener.up[1] + dz * listener.up[2];
  const front = dx * listener.forward[0] + dy * listener.forward[1] + dz * listener.forward[2];
  out.distance = distance;
  out.azimuth = Math.atan2(right, front);
  out.elevation = distance > 1e-6 ? Math.asin(Math.max(-1, Math.min(1, up / distance))) : 0;
  return out;
}

/** The gain of distance: 1/d from 1 m, never below the floor inside the circle; past it (a map-wide sound) the plain inverse distance. */
export function distanceGain(distance, mapWide = false) {
  const inverse = 1 / Math.max(1, distance);
  return mapWide && distance > EAR.radius ? inverse : Math.max(EAR.floor, inverse);
}

/** The air's low-pass at a distance (Hz): where its absorption reaches 3 dB (0.1 dB/m at 8 kHz, as f²). No cut within a few metres. */
export function airCutoff(distance) {
  return Math.max(250, Math.min(20000, 8000 * Math.sqrt(30 / Math.max(1, distance))));
}

/** The low-pass of a sound behind (Speakers mode: no head filter to say it): open in front, closing to EAR.behindCutoff straight behind. */
export function behindCutoff(azimuth) {
  const behind = Math.max(0, -Math.cos(azimuth));
  return 20000 * (EAR.behindCutoff / 20000) ** behind;
}

/** Whether an event is heard over the whole map (thunder, a gun, a cannon, a grenade): never thinned, never cut off by the circle. */
export function isMapWide(event) {
  return event.type === 'thunder' || (event.type === 'shot' && (event.kind === 'matchlock' || event.kind === 'cannon' || event.kind === 'frag' || event.kind === 'flashbang'));
}

/** The level at the ear (dB SPL) of a level at 1 m heard `distance` m off (with the circle's floor). */
export function levelAtEar(level, distance, mapWide = false) {
  return level + 20 * Math.log10(distanceGain(distance, mapWide));
}

/**
 * The 10-20 m rule: inside `full` everything is kept; between it and the radius only what is loud enough at the ear (the bar rising with
 * the distance); past the radius only a map-wide sound.
 */
export function thinningKeeps(atEar, distance, mapWide = false) {
  if (mapWide) return true;
  if (distance <= EAR.full) return true;
  if (distance > EAR.radius) return false;
  const share = (distance - EAR.full) / (EAR.radius - EAR.full);
  return atEar >= EAR.thinFrom + share * (EAR.thinTo - EAR.thinFrom);
}

/**
 * Which candidates start, and which playing voices they take: `active` the voices playing ({ atEar }), `candidates` this tick's sounds
 * ({ atEar }), `budget` the voices allowed. Loudest first; a candidate past the budget takes the quietest playing voice if it is louder by
 * the margin. Returns { start: [candidates], steal: [voices] } (fresh arrays: a few entries a tick).
 */
export function allocateVoices(active, candidates, budget) {
  const ranked = candidates.slice().sort((a, b) => b.atEar - a.atEar);
  const playing = active.slice().sort((a, b) => a.atEar - b.atEar);
  const start = [];
  const steal = [];
  let free = Math.max(0, budget - active.length);
  for (const candidate of ranked) {
    if (free > 0) {
      start.push(candidate);
      free -= 1;
      continue;
    }
    const quietest = playing[0];
    if (quietest && candidate.atEar > quietest.atEar + EAR.stealMargin) {
      steal.push(playing.shift());
      start.push(candidate);
    }
  }
  return { start, steal };
}

/**
 * The per-tick limits (EAR.perTick): of each kind, the loudest few. Far steps (past `full`) of one tick are merged into the loudest of
 * them, carrying their summed energy (n steps together are 10 log10 n dB louder than one): a patter, not a voice each.
 * `candidates` sorted or not; returns a new list.
 */
export function limitPerTick(candidates) {
  const byType = new Map();
  for (const candidate of candidates) {
    const list = byType.get(candidate.event.type);
    if (list) list.push(candidate);
    else byType.set(candidate.event.type, [candidate]);
  }
  const kept = [];
  for (const [type, list] of byType) {
    list.sort((a, b) => b.atEar - a.atEar);
    let pool = list;
    if (type === 'step' || type === 'horse') {
      const near = list.filter((candidate) => candidate.distance <= EAR.full);
      const far = list.filter((candidate) => candidate.distance > EAR.full);
      if (far.length > 1) {
        const loudest = far[0];
        const energy = far.reduce((sum, candidate) => sum + 10 ** (candidate.atEar / 10), 0);
        loudest.atEar = 10 * Math.log10(energy);
        loudest.merged = far.length;
        pool = [...near, loudest].sort((a, b) => b.atEar - a.atEar);
      }
    }
    kept.push(...pool.slice(0, EAR.perTick[type] ?? 6));
  }
  return kept;
}

/** Whether this machine is a phone (a coarse pointer, or a small screen): stereo by default, and the smaller voice budget. */
export function isPhone(env = globalThis) {
  try {
    if (env.matchMedia?.('(pointer: coarse)').matches) return true;
    const width = Math.min(env.screen?.width ?? 1e9, env.screen?.height ?? 1e9);
    return width < 600;
  } catch {
    return false;
  }
}
