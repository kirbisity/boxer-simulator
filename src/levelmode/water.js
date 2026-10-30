// Standing water under the castle (the crypt's flooded way, the old drain's cistern, the cesspool's sludge): where it lies, and what a man does to it as he
// wades. Pure data and decisions (levelmode/kitwater.js draws it and runs these each frame), so that they run in Node.
//
// A body of water is a section's decor `{ kind: 'water', id, shape: 'rect' | 'ellipse', at: [x, y, z] (y: its surface), size: [w, d], bed (y of its floor),
// murk: 'clear' | 'sludge' }`. The water has no say in the physics: a man stands on the bed under it, as he always did; it is a surface drawn, which
// rings round each foot that moves in it (`ripples`), trails a wake behind a man wading, and throws up a splash when one runs through it or drops into it.
//
// A body of water may carry `viscosity` (1 water, thicker the more it holds a man: `WATER.viscosity` by murk when it has none) for what it does to the legs of
// the men in it (`wadeDrag`).
//
// A battlefield's soaked ground is a body of water too (Agincourt's ploughland, with the film standing on it: worksview.js), and it is the same wade and the same
// rings; its men are many, so kitwater.js makes fewer rings for them (`BATTLE_WATER`).
//
// A ripple is { x, z, born (s), amp (0..1+), water (id) }: a ring that spreads at `speed` m/s and dies over `life` s (the shader draws it: kitwater.js).

import { LEVEL_CONFIG } from './config.js';

/** How ripples and splashes are made. */
export const WATER = {
  // The most ripples alive at once (the shader's uniform array): a new one takes the place of the oldest.
  ripples: 24,
  // m/s a ring spreads, and s it lives.
  speed: 0.75,
  life: 2.6,
  // A foot that moves in the water at more than `footSpeed` m/s rings it every `stepGap` s.
  footSpeed: 0.55,
  stepGap: 0.3,
  // A man wading (his hips moving at more than `wakeSpeed` m/s) leaves a ring behind him every `wakeGap` s, `wakeBack` m behind his hips.
  wakeSpeed: 0.35,
  wakeGap: 0.22,
  wakeBack: 0.35,
  // A foot moving faster than `splashSpeed` m/s (a run) throws up `splashDrops` drops; a body that comes down into the water faster than `dropSpeed` m/s (a fall,
  // a drop from above) makes a big ring and `bigDrops`.
  splashSpeed: 2.6,
  splashDrops: 4,
  dropSpeed: 3.2,
  bigDrops: 26,
  // How far above the surface (m) a foot still counts as in it (a foot lifted out and set back makes the ring as it goes in).
  above: 0.06,
  // How thick a body of water is for a man in it when it has no `viscosity` of its own, by murk: clear water 1, the castle's sewage 1.6, a rain-soaked
  // field's clay-water 2 (a battle's soft ground carries its own: fieldworks.js).
  viscosity: { clear: 1, sludge: 1.6, mud: 2 },
};

/**
 * How a battle's water is made (WATER's keys, over WATER): where seventy men wade, a ring a step and a wake every fifth of a second would be hundreds alive at
 * once and a pool of 40 would hold each for a blink; each foot rings once a stride, a wake is left less often, and they die sooner.
 */
export const BATTLE_WATER = { ...WATER, ripples: 40, life: 1.7, footSpeed: 0.9, stepGap: 0.55, wakeSpeed: 0.6, wakeGap: 0.8, splashSpeed: 3.2 };

/**
 * The bodies of water a battle's works have: one over each soft place of mud that has `water` standing on it (Agincourt's ploughland after the night's rain), its
 * surface that much over the mud's (`over`: m the painted mud lies above the ground), its bed the firm layer under it, its viscosity the soft ground's own. As a
 * stage's `water` decor (stageWaters), so that the castle's water code draws it and rings it.
 */
export function worksWaters(works, over = 0.008) {
  return (works?.soft ?? [])
    .filter((area) => area.surface === 'mud' && area.water > 0)
    .map((area, index) => ({
      // (A puddle's own shape and look: `shape` 'ellipse', `murk` a KWT_LOOKS key, e.g. 'puddle'.)
      kind: 'water', id: `field-${index}`, shape: area.shape ?? 'rect', murk: area.murk ?? 'mud', viscosity: area.viscosity,
      at: [(area.x[0] + area.x[1]) / 2, over + area.water, (area.z[0] + area.z[1]) / 2], size: [area.x[1] - area.x[0], area.z[1] - area.z[0]], bed: -area.firm,
    }));
}

/** The bodies of water of a stage: every section's `water` decor, with its section's id. */
export function stageWaters(stage) {
  const out = [];
  for (const section of stage.sections) for (const decor of section.decor ?? []) if (decor.kind === 'water') out.push({ ...decor, section: section.id });
  return out;
}

/** Whether (x, z) lies over the water's surface (its rectangle or ellipse). */
export function waterContains(water, x, z) {
  const dx = x - water.at[0];
  const dz = z - water.at[2];
  const hw = water.size[0] / 2;
  const hd = water.size[1] / 2;
  if (water.shape === 'ellipse') return (dx * dx) / (hw * hw) + (dz * dz) / (hd * hd) <= 1;
  return Math.abs(dx) <= hw && Math.abs(dz) <= hd;
}

/** The water a point [x, y, z] is in (under its surface, `above` m over it at most, and not below its bed by more than a hand), or null. */
export function waterAt(waters, x, y, z, above = WATER.above) {
  for (const water of waters) {
    if (y > water.at[1] + above || y < water.bed - 0.3) continue;
    if (waterContains(water, x, z)) return water;
  }
  return null;
}

/** How deep the water is over its bed (m). */
export const waterDepth = (water) => water.at[1] - water.bed;

/** A pool of ripples: { list, max }. */
export const newRipples = (max = WATER.ripples) => ({ list: [], max });

/** Add a ripple: the oldest goes when the pool is full. */
export function addRipple(pool, ripple) {
  if (pool.list.length >= pool.max) {
    let oldest = 0;
    for (let k = 1; k < pool.list.length; k += 1) if (pool.list[k].born < pool.list[oldest].born) oldest = k;
    pool.list.splice(oldest, 1);
  }
  pool.list.push(ripple);
  return ripple;
}

/** Forget the ripples that have died out by `time`. */
export function ageRipples(pool, time, config = WATER) {
  pool.list = pool.list.filter((ripple) => time - ripple.born < config.life);
  return pool;
}

/** A ripple's ring now: { radius (m), strength (0..1: its amplitude, fading as it spreads and ages) }, or null once it has died out. */
export function rippleRing(ripple, time, config = WATER) {
  const age = time - ripple.born;
  if (age < 0 || age >= config.life) return null;
  return { radius: age * config.speed, strength: ripple.amp * (1 - age / config.life) ** 2 };
}

/**
 * What the men do to the water this frame: `men` are [{ id, feet: [[x, y, z], [x, y, z]], hips: [x, y, z] }] (where they are now), `memory` a Map (id -> what was
 * kept from the frame before), `time` (s). Returns { ripples: [...], splashes: [{ at, count, speed, water }] } and updates `memory`. A foot ringing the water as it
 * moves in it, a wake behind a man wading, a splash from a running foot, a big ring and a burst of drops from a body that comes down into it fast.
 */
export function waterSources(waters, men, memory, time, config = WATER) {
  const ripples = [];
  const splashes = [];
  for (const man of men) {
    const kept = memory.get(man.id);
    const dt = kept ? time - kept.time : 0;
    const next = { time, feet: man.feet.map((foot) => [...foot]), hips: [...man.hips], stepAt: kept?.stepAt ?? [-Infinity, -Infinity], wakeAt: kept?.wakeAt ?? -Infinity, inWater: false };
    memory.set(man.id, next);
    // (A man put somewhere new, or the first sight of him, is not a man moving: nothing is made from it.)
    if (!kept || dt <= 0 || dt > 0.25) continue;
    const hipsWater = waterAt(waters, man.hips[0], Math.min(man.hips[1], ...man.feet.map((foot) => foot[1])), man.hips[2]);
    next.inWater = Boolean(hipsWater);
    // A body coming down into the water fast: the hips falling, and the feet just gone under.
    const fall = (kept.hips[1] - man.hips[1]) / dt;
    if (hipsWater && fall > config.dropSpeed && !kept.inWater) {
      ripples.push({ x: man.hips[0], z: man.hips[2], born: time, amp: Math.min(2.2, 0.8 + fall / config.dropSpeed * 0.5), water: hipsWater.id });
      splashes.push({ at: [man.hips[0], hipsWater.at[1], man.hips[2]], count: config.bigDrops, speed: Math.min(6, 1.5 + fall * 0.4), water: hipsWater.id });
      next.stepAt = [time, time];
      next.wakeAt = time;
      continue;
    }
    man.feet.forEach((foot, k) => {
      const water = waterAt(waters, foot[0], foot[1], foot[2], config.above);
      if (!water) return;
      const before = kept.feet[k];
      const speed = Math.hypot(foot[0] - before[0], foot[1] - before[1], foot[2] - before[2]) / dt;
      const entered = before[1] > water.at[1] + config.above;
      if ((speed > config.footSpeed || entered) && time - next.stepAt[k] >= config.stepGap) {
        next.stepAt[k] = time;
        ripples.push({ x: foot[0], z: foot[2], born: time, amp: Math.min(1, 0.35 + speed * 0.18), water: water.id });
        if (speed > config.splashSpeed) splashes.push({ at: [foot[0], water.at[1], foot[2]], count: config.splashDrops, speed: Math.min(3.5, speed * 0.6), water: water.id });
      }
    });
    // The wake: the hips moving through the water leave rings behind them.
    if (hipsWater) {
      const vx = (man.hips[0] - kept.hips[0]) / dt;
      const vz = (man.hips[2] - kept.hips[2]) / dt;
      const speed = Math.hypot(vx, vz);
      if (speed > config.wakeSpeed && time - next.wakeAt >= config.wakeGap) {
        next.wakeAt = time;
        const back = config.wakeBack / speed;
        ripples.push({ x: man.hips[0] - vx * back, z: man.hips[2] - vz * back, born: time, amp: Math.min(0.9, 0.25 + speed * 0.12), water: hipsWater.id });
      }
    }
  }
  return { ripples, splashes };
}

/** How thick a body of water is for the legs in it: its own `viscosity`, else its murk's (1 for plain water). */
export const waterViscosity = (water) => water.viscosity ?? WATER.viscosity[water.murk] ?? 1;

/**
 * What water `depth` m over a man's feet does to him, as a man `heightM` tall (a short man's legs are as deep in it as the reference man's would be in more):
 * { depth (the reference man's), foot (the share of his footwork left), accel (of his acceleration), act (of his punches, dodges and turning), viscosity }.
 * Footwork falls with the depth (LEVEL_CONFIG.wade.table); the water's viscosity takes a further share once it is over the ankle, and the thicker it is the more.
 * Nothing at all (every share 1) under the table's first row.
 */
export function wadeDrag(water, depth, heightM, spec = LEVEL_CONFIG.wade) {
  const viscosity = waterViscosity(water);
  const reference = depth * (spec.height / (heightM || spec.height));
  const table = spec.table;
  let share = 1;
  if (reference > table[0][0]) {
    share = table[table.length - 1][1];
    for (let k = 1; k < table.length; k += 1) {
      if (reference <= table[k][0]) {
        const [d0, s0] = table[k - 1];
        const [d1, s1] = table[k];
        share = s0 + ((s1 - s0) * (reference - d0)) / (d1 - d0);
        break;
      }
    }
  }
  const thick = spec.thick;
  const engaged = Math.max(0, Math.min(1, (reference - thick.from) / (thick.full - thick.from)));
  const stuck = viscosity > 1 ? viscosity ** (-thick.exp * engaged) : 1;
  const foot = share * stuck;
  return { depth: reference, foot, accel: foot ** spec.accel, act: stuck ** spec.act, viscosity };
}
