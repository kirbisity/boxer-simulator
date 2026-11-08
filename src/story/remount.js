// Story mode: a loose horse near him (the battle's HUD says so, storyview.js). Pure (no DOM): test/story-remount.test.js.
//
// A horse whose rider fell or was thrown runs off a little and then stands (physics/mounted.js loseHorse: WORLD.mount
// boltSeconds); a man on his feet beside it, the horse at a walk or standing, can swing up into its saddle and it is his,
// whoever rode it, his own side's or the enemy's (mountHorse: the horse button, or `/`, as in any fight): a rider unhorsed
// or a man on foot. This only finds the horse and says where it is; the mounting is the engine's, by its own rules
// (WORLD.mount.dismount: the horse within `reach` m, at `speed` m/s or slower).
// Names here are prefixed `story` / `STORY_` (the bundle is one shared scope: tools/bundle.js).

import { P } from '../body.js';
import { horseToMount } from '../physics/mounted.js';

export const STORY_REMOUNT = {
  // A loose horse is told of within `near` m of him: as far as he gets at a run in about three seconds (a fit man in a
  // padded coat runs ~4.2 m/s with his weapon: physics/config.js run), near enough to reach before it wanders off or
  // another man takes it.
  near: 12,
};

/**
 * The loose horse nearest him (riderless, on its feet, on the ground), within STORY_REMOUNT.near m of a man on his feet, or
 * null: { horse, distance (m), ready (he can mount it now: horseToMount), toHorse: { ahead, right } (m, in his own facing:
 * ahead of him, to his right hand) }. Nothing for a man already riding, down, or out.
 */
export function storyLooseHorse(world, hero) {
  if (!hero || hero.mount || hero.state !== 'up' || hero.fled) return null;
  const at = [hero.x[P.pelvis * 3], hero.x[P.pelvis * 3 + 2]];
  let best = null;
  let bestDistance = STORY_REMOUNT.near;
  for (const horse of world.horses ?? []) {
    if (horse.state !== 'up' || horse.rider !== null || horse.air) continue;
    const distance = Math.hypot(horse.at[0] - at[0], horse.at[1] - at[1]);
    if (distance <= bestDistance) {
      best = horse;
      bestDistance = distance;
    }
  }
  if (!best) return null;
  // His facing (pose.js yawRotate of +x: [cos, -sin] in x, z) and his right hand (forward × up: [sin, cos]).
  const forward = [Math.cos(hero.yaw ?? 0), -Math.sin(hero.yaw ?? 0)];
  const right = [-forward[1], forward[0]];
  const offset = [best.at[0] - at[0], best.at[1] - at[1]];
  return {
    horse: best,
    distance: bestDistance,
    ready: horseToMount(world, hero) === best,
    toHorse: { ahead: offset[0] * forward[0] + offset[1] * forward[1], right: offset[0] * right[0] + offset[1] * right[1] },
  };
}
