// The castle's torch lights: four real lights, lent to the nearest torches. A light that was taken from one torch and given to another in a single frame
// made the stone around both jump (every 0.2 s, as he walked, a fifth torch drew nearer than the fourth: the fourth's light vanished and the fifth's
// appeared, a pop in the walls' brightness; and two torches at nearly one distance took turns). So: a torch that already has a light keeps it against
// a rival that is only a little nearer (`stay`), a light stays with its torch as long as the torch is among the nearest, and a light that must go fades
// out over `fadeSeconds` before another torch has it, which fades in. Pure functions (levelmode/kit.js applies them), so that they run in Node.

export const TORCH_POOL = {
  // m a torch already lit counts nearer than a rival, so that two at much the same distance do not take turns.
  stay: 2.0,
  // s a light takes to fade in on its torch, or out.
  fadeSeconds: 0.35,
};

/** The `count` torches to light: `candidates` is [{ l, d }] (a torch and its distance), `lit` the torches lit now. */
export function pickLit(candidates, lit, count, config = TORCH_POOL) {
  return candidates
    .map((c) => ({ l: c.l, d: c.d - (lit.includes(c.l) ? config.stay : 0) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((c) => c.l);
}

/** A pool of `count` lamps: each `{ l: the torch it is on or null, fade: 0..1 }`. */
export function newLamps(count) {
  return Array.from({ length: count }, () => ({ l: null, fade: 0 }));
}

/**
 * One frame of `dt` s: each lamp on a lit torch fades in, each on a torch no longer lit fades out and is free when dark; a lit torch with no lamp takes a free one
 * (it waits, at most `fadeSeconds`, if all are busy). Changes `lamps` in place.
 */
export function stepLamps(lamps, lit, dt, config = TORCH_POOL) {
  const rate = dt / config.fadeSeconds;
  for (const lamp of lamps) {
    if (!lamp.l) continue;
    if (lit.includes(lamp.l)) {
      lamp.fade = Math.min(1, lamp.fade + rate);
    } else {
      lamp.fade = Math.max(0, lamp.fade - rate);
      if (lamp.fade <= 0) lamp.l = null;
    }
  }
  for (const l of lit) {
    if (lamps.some((lamp) => lamp.l === l)) continue;
    const free = lamps.find((lamp) => !lamp.l);
    if (free) Object.assign(free, { l, fade: 0 });
  }
  return lamps;
}

/** The brightness of a lamp, 0..1: its fade, eased. */
export const lampShare = (lamp) => lamp.fade * lamp.fade * (3 - 2 * lamp.fade);

/** A torch's flicker (a factor near 1: a slow waver and a faint quick one; `k` and `phase` tell torches apart): +-8 % at most, not the +-18 % that flashed the stone. */
export function torchFlicker(time, k = 0) {
  return 0.92 + 0.06 * Math.sin(time * 9 + k * 2) + 0.02 * Math.sin(time * 21 + k);
}
