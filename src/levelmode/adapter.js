// The player's systems' seam with the awareness AI (levelmode/awareness.js, built by another track):
// the two things this side needs from it, behind names of our own. Until it lands both are stand-ins.
// The merge is these two bodies and nothing else.

import { P } from '../body.js';
import { LEVEL_CONFIG } from './config.js';

/**
 * Whether an enemy is aware of the player (will fight him, is not an idle man who has not seen him).
 * TODO(awareness): replace the body with the awareness AI's word (its aggro / search states).
 * Stand-in: any awake enemy within LEVEL_CONFIG.awareRange.
 */
export function levelAware(world, fighter) {
  if (fighter.dormant || fighter.state === 'out') return false;
  const me = world.fighters[0];
  return Math.hypot(fighter.x[P.pelvis * 3] - me.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2] - me.x[P.pelvis * 3 + 2]) <= LEVEL_CONFIG.awareRange;
}

/**
 * The prisoner `id` (a spawn id) is let out of his cell and fights beside the player from now on.
 * TODO(awareness): call awareness.js's freePrisoner(world, id) here instead (it makes him a follower of the player).
 * Stand-in: his corner is the player's, so that nobody fights him and he fights the player's enemies.
 */
export function levelFreePrisoner(world, id) {
  const fighter = world.fighters.find((entry) => entry.spawn?.id === id);
  if (!fighter || fighter.spawn.role !== 'prisoner') return false;
  fighter.corner = 'red';
  fighter.spawn.role = 'ally';
  fighter.spawn.freed = true;
  return true;
}
