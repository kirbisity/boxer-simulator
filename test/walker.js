// A scripted walker for the level-mode tests: a fighter walking with a fixed stick toward
// waypoints, step by step, with a look at his feet each step. Not a test file (no .test).

import { P } from '../src/body.js';
import { floorAt } from '../src/physics/terrain.js';
import { advance } from '../src/physics.js';
import { updateStage } from '../src/levelmode/stage.js';

/** The middle of a fighter's hips on the floor: [x, z]. */
export const hipsAt = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];

/**
 * How far above (+) or below (-) the floor each foot is, past the height the planted foot has on
 * flat ground (its ankle): for the feet planted now (not mid-step, not lifted). { l, r } (null for a foot in motion).
 */
export function footErrors(fighter, terrain) {
  const out = {};
  for (const side of ['l', 'r']) {
    const foot = fighter.feet[side];
    const index = foot.index;
    if (foot.step || foot.lifted) {
      out[side] = null;
      continue;
    }
    const y = fighter.x[index * 3 + 1];
    const floor = floorAt(terrain, fighter.x[index * 3], fighter.x[index * 3 + 2], y + 0.3);
    out[side] = y - fighter.body.lengths.ankle - floor;
  }
  return out;
}

/**
 * Walk `fighter` through `waypoints` ([x, z] each), the stick held fully forward, for at most
 * `seconds` in all. `each(world, fighter)` is called after every step. Stage worlds keep their
 * sections up (updateStage). Returns { reached, seconds, stuckAt }.
 */
export function walk(world, fighter, waypoints, { within = 0.4, seconds = 60, each = null, think = null } = {}) {
  fighter.walking = true;
  const started = world.time;
  const step = (current, dt) => {
    if (current.stage) updateStage(current);
    if (think) think(current, dt);
  };
  for (let index = 0; index < waypoints.length; index += 1) {
    const [x, z] = waypoints[index];
    let lastCloser = world.time;
    let best = Infinity;
    for (;;) {
      const [hx, hz] = hipsAt(fighter);
      const distance = Math.hypot(x - hx, z - hz);
      if (distance < within) break;
      if (world.time - started > seconds) return { reached: index, seconds: world.time - started, stuckAt: [hx, hz] };
      // Not getting nearer for three seconds: stuck.
      if (distance < best - 0.05) {
        best = distance;
        lastCloser = world.time;
      } else if (world.time - lastCloser > 3) return { reached: index, seconds: world.time - started, stuckAt: [hx, hz] };
      fighter.goTo = [x, 0, z];
      fighter.move = 1;
      advance(world, 1 / 60, step);
      each?.(world, fighter);
    }
  }
  fighter.move = 0;
  return { reached: waypoints.length, seconds: world.time - started, stuckAt: null };
}
