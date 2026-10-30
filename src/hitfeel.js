// How a blow feels to the player, for a game whose motion is real and not
// an arcade's: nothing here is drawn bigger than the blow was. Each effect is
// small, short, and scaled by the blow's own impulse (or, for an edge or a
// point, its energy), so a jab is barely there and a full kick or a two-handed
// cut is felt. Only blows the player's man lands (in full), takes (less), or
// has blocked (a little, through the arms) are felt; a crowd's blows are not.
//
// The effects (each on or off, each with its intensity, kept in this browser;
// a URL hash `#hitfeel=kick,thump` or `#hitfeel=all` / `none` overrides them
// for a visit, to try one at a time):
//   kick      the camera jolted along the blow, a few cm, damped in a fifth of a second
//   hitStop   the fight slowed for a few hundredths of a second on a heavy blow landed
//             (the frame's pace only: the physics step is never changed)
//   puff      a soft mist of sweat and dust off the struck point
//   vignette  the screen's edges darkened for a moment on a heavy blow
//   haptic    a short vibration (phones that have it: navigator.vibrate)
//   thump     a low body thump under the blow's own sound, by its energy
//   fov       the view narrowed a degree or two, as the eye fixes on the blow
//
// No DOM and no three.js: main.js asks it what to do each frame (tests drive it directly).

export const HITFEEL = {
  // The blow's strength (0..1) is its impulse (N·s) on a log scale between these: a flicked jab is ~5,
  // a full cross ~20, a kick ~40 to 110 (tools/bout.js). Below `light` it is not felt at all.
  impulse: { light: 4, heavy: 70 },
  // An edge or a point can do its harm with little impulse: its cutting energy (J) counts too, on the same kind of scale.
  energy: { light: 10, heavy: 150 },
  // The share of a blow felt each way: his own landed in full; one he takes less (it is not his to enjoy);
  // his own blocked, a little (felt through the arms that stopped it).
  share: { landed: 1, taken: 0.55, blocked: 0.3 },
  // Each effect: whether it is on and its intensity (0..2, 1 as tuned). The defaults: the quiet ones on.
  effects: {
    kick: { on: true, intensity: 1, label: 'Camera kick', note: 'The view jolts along the blow' },
    hitStop: { on: true, intensity: 1, label: 'Hit-stop', note: 'A heavy blow holds the moment' },
    puff: { on: true, intensity: 1, label: 'Impact mist', note: 'Sweat and dust off the struck place' },
    vignette: { on: true, intensity: 1, label: 'Dark edges', note: 'The edges dim on a heavy blow' },
    haptic: { on: true, intensity: 1, label: 'Vibration', note: 'A buzz on phones that have it' },
    thump: { on: true, intensity: 1, label: 'Body thump', note: 'A low thud under the blow' },
    fov: { on: true, intensity: 1, label: 'Focus punch', note: 'The view narrows for an instant' },
  },
  // The camera's jolt: metres at full strength (3 cm at 2.5 m is about 1% of the screen: felt, not seen as a shake),
  // how fast it rings (Hz: a body's sway, not a buzz) and dies (s, its time constant), and how long it is kept.
  kick: { metres: 0.03, hz: 9, decay: 0.06, seconds: 0.3 },
  // Hit-stop: only a blow past `from` in strength; the fight runs at `slowest` of its pace for between `seconds.light`
  // and `seconds.heavy` (real seconds), then eases back over `ease` (a hard snap back reads as a stutter).
  hitStop: { from: 0.35, slowest: 0.15, seconds: { light: 0.025, heavy: 0.075 }, ease: 0.04 },
  // The mist: its size (m) and opacity at full strength, and its life (s).
  puff: { size: 0.26, opacity: 0.45, seconds: 0.35 },
  // The dark edges: only past `from` in strength; their most (opacity) and how long they fade (s).
  vignette: { from: 0.4, opacity: 0.5, seconds: 0.4 },
  // A vibration (ms) from the lightest blow felt to the heaviest: a phone's motor needs ~8 ms to be felt at all.
  haptic: { light: 8, heavy: 40 },
  // The thump's gain (0..1 of the effects bus) at full strength.
  thump: { gain: 0.7 },
  // The view narrowed (degrees) at full strength, and the time (s) it eases back.
  fov: { degrees: 2.2, seconds: 0.28 },
  // Settings kept in this browser under this key.
  key: 'gladiator-hitfeel',
};

const hitFeelClamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));

/** The share (0..1) of `value` on a log scale from `light` to `heavy`. */
const hitFeelLogShare = (value, { light, heavy }) => (value > light ? hitFeelClamp(Math.log(value / light) / Math.log(heavy / light)) : 0);

/** A blow's strength, 0..1, from its impulse or (an edge, a point) its energy, whichever is more. */
export function hitStrength(event) {
  const byImpulse = hitFeelLogShare(event.impulse ?? 0, HITFEEL.impulse);
  const edge = (event.cut ?? 0) + (event.pierce ?? 0);
  const byEnergy = hitFeelLogShare(Math.max(edge, event.energy && event.weapon ? event.energy : 0), HITFEEL.energy);
  return Math.max(byImpulse, byEnergy);
}

/** The settings: every effect's `on` and `intensity`, the kept ones (storage: localStorage or null) over the defaults. */
export function loadHitFeel(storage) {
  const settings = Object.fromEntries(Object.entries(HITFEEL.effects).map(([name, spec]) => [name, { on: spec.on, intensity: spec.intensity }]));
  try {
    const kept = JSON.parse(storage?.getItem(HITFEEL.key) ?? 'null');
    if (kept && typeof kept === 'object') {
      for (const [name, value] of Object.entries(kept)) {
        if (!settings[name] || !value || typeof value !== 'object') continue;
        if (typeof value.on === 'boolean') settings[name].on = value.on;
        if (Number.isFinite(value.intensity)) settings[name].intensity = hitFeelClamp(value.intensity, 0, 2);
      }
    }
  } catch {
    // Blocked or broken storage: the defaults.
  }
  return settings;
}

export function saveHitFeel(storage, settings) {
  try {
    storage?.setItem(HITFEEL.key, JSON.stringify(settings));
  } catch {
    // A private window: the settings last this visit.
  }
}

/** A URL hash's `hitfeel=` list over the settings (for this visit): `all`, `none`, or names of the effects to have on (the rest off). */
export function hitFeelFromHash(settings, hash) {
  const match = /(?:^|[#&])hitfeel=([\w,]*)/.exec(hash ?? '');
  if (!match) return settings;
  const wanted = match[1] === 'all' ? Object.keys(settings) : match[1] === 'none' ? [] : match[1].split(',');
  for (const [name, value] of Object.entries(settings)) value.on = wanted.includes(name);
  return settings;
}

/**
 * The feel of the blows: hear(event, playerId, now) for each event of the world (now: real seconds);
 * it returns what to do at once ({ vibrate (ms), thump (gain), puff ({ point, normal, size, opacity, seconds }) },
 * or null for a blow not felt). Each frame: pace(now) (a share of the fight's pace), offset(now) (the camera's
 * jolt, [x, y, z] m), vignette(now) (0..1), fov(now) (degrees narrower).
 */
export function createHitFeel(settings = loadHitFeel(null)) {
  const pulses = [];
  const level = (name) => (settings[name]?.on ? settings[name].intensity : 0);

  function hear(event, playerId, now) {
    if (playerId === null || playerId === undefined) return null;
    if (event.kind !== 'landed' && event.kind !== 'blocked') return null;
    const way = event.kind === 'blocked' ? (event.attacker === playerId ? 'blocked' : null)
      : event.attacker === playerId ? 'landed' : event.defender === playerId ? 'taken' : null;
    if (!way) return null;
    const strength = hitStrength(event) * HITFEEL.share[way];
    if (strength <= 0) return null;
    // The blow's way: into the struck man (the event's normal points out of him, toward the striker).
    const normal = event.normal ?? [0, 0, 1];
    const into = [-normal[0], -normal[1], -normal[2]];
    pulses.push({ start: now, strength, way, into });
    while (pulses.length > 8) pulses.shift();
    const haptic = level('haptic');
    const thump = level('thump');
    const puff = level('puff');
    return {
      strength,
      way,
      vibrate: haptic > 0 ? Math.round(Math.min(80, (HITFEEL.haptic.light + (HITFEEL.haptic.heavy - HITFEEL.haptic.light) * strength) * haptic)) : 0,
      thump: thump > 0 ? HITFEEL.thump.gain * strength * thump : 0,
      // The mist is off the struck place: a blow he lands or takes, not one stopped on his guard.
      puff: puff > 0 && way !== 'blocked' && event.point ? { point: event.point, normal, size: HITFEEL.puff.size * (0.4 + 0.6 * strength), opacity: Math.min(0.6, HITFEEL.puff.opacity * strength * puff), seconds: HITFEEL.puff.seconds } : null,
    };
  }

  function forget(now) {
    const longest = Math.max(HITFEEL.kick.seconds, HITFEEL.vignette.seconds, HITFEEL.fov.seconds, HITFEEL.hitStop.seconds.heavy + HITFEEL.hitStop.ease);
    while (pulses.length && now - pulses[0].start > longest) pulses.shift();
  }

  /** The share of the fight's pace now: 1, or less in a hit-stop. */
  function pace(now) {
    const amount = level('hitStop');
    if (amount <= 0) return 1;
    forget(now);
    const spec = HITFEEL.hitStop;
    let share = 1;
    for (const pulse of pulses) {
      if (pulse.way !== 'landed' || pulse.strength < spec.from) continue;
      const over = (pulse.strength - spec.from) / (1 - spec.from);
      const hold = (spec.seconds.light + (spec.seconds.heavy - spec.seconds.light) * over) * amount;
      const age = now - pulse.start;
      const eased = age < hold ? 0 : hitFeelClamp((age - hold) / spec.ease);
      share = Math.min(share, spec.slowest + (1 - spec.slowest) * eased);
    }
    return share;
  }

  /** The camera's jolt now ([x, y, z] m, into out): along each blow's way, a damped swing. */
  function offset(now, out = [0, 0, 0]) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    const amount = level('kick');
    if (amount <= 0) return out;
    forget(now);
    const spec = HITFEEL.kick;
    for (const pulse of pulses) {
      const age = now - pulse.start;
      if (age < 0 || age > spec.seconds) continue;
      const swing = Math.sin(2 * Math.PI * spec.hz * age) * Math.exp(-age / spec.decay);
      const metres = spec.metres * pulse.strength * amount * swing;
      out[0] += pulse.into[0] * metres;
      out[1] += pulse.into[1] * metres - Math.abs(metres) * 0.3;
      out[2] += pulse.into[2] * metres;
    }
    return out;
  }

  /** How dark the edges are now (0..1). */
  function vignette(now) {
    const amount = level('vignette');
    if (amount <= 0) return 0;
    forget(now);
    const spec = HITFEEL.vignette;
    let most = 0;
    for (const pulse of pulses) {
      if (pulse.strength < spec.from) continue;
      const left = 1 - (now - pulse.start) / spec.seconds;
      if (left > 0) most = Math.max(most, spec.opacity * amount * ((pulse.strength - spec.from) / (1 - spec.from)) * left * left);
    }
    return hitFeelClamp(most);
  }

  /** How much narrower the view is now (degrees). */
  function fov(now) {
    const amount = level('fov');
    if (amount <= 0) return 0;
    forget(now);
    const spec = HITFEEL.fov;
    let most = 0;
    for (const pulse of pulses) {
      const age = now - pulse.start;
      if (age < 0 || age > spec.seconds) continue;
      // In at once, out smoothly.
      const left = 1 - age / spec.seconds;
      most = Math.max(most, spec.degrees * pulse.strength * amount * left * left * (3 - 2 * left));
    }
    return most;
  }

  return { settings, hear, pace, offset, vignette, fov, reset: () => pulses.splice(0), get active() { return pulses.length; } };
}
