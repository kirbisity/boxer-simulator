// The player's systems' seam with the awareness AI (levelmode/awareness.js): the things this side needs
// from it, behind names of our own, so that the one file says what is borrowed.

import { P } from '../body.js';
import { LEVEL_CONFIG } from './config.js';
import { createAwareness, freePrisoner, gatherFollowers, mindState } from './awareness.js';

/**
 * Whether an enemy is aware of the player: in the awareness AI's aggro (he has seen him and fights) or search
 * (he is going to where he last saw him) state. A world with no awareness (a stage made with `awareness: false`)
 * has only the stand-in: any awake enemy within LEVEL_CONFIG.awareRange.
 */
export function levelAware(world, fighter) {
  if (fighter.dormant || fighter.state === 'out') return false;
  if (world.stage?.aware) {
    const state = mindState(world, fighter.id);
    return state === 'aggro' || state === 'search';
  }
  const me = world.fighters[0];
  return Math.hypot(fighter.x[P.pelvis * 3] - me.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2] - me.x[P.pelvis * 3 + 2]) <= LEVEL_CONFIG.awareRange;
}

/** The prisoner `id` (a spawn id) is let out and fights beside the player from now on (awareness.js freePrisoner). */
export function levelFreePrisoner(world, id) {
  return freePrisoner(world, id);
}

/**
 * After men have been made new in place (a rest, a respawn): every mind starts over (at his post, or following),
 * the followers are brought to the player's side. What the awareness keeps for the ending (civilians harmed) is kept.
 */
export function levelResetMinds(world) {
  if (!world.stage.aware) return;
  const harmed = world.stage.civiliansHarmed;
  createAwareness(world);
  world.stage.civiliansHarmed = harmed;
  gatherFollowers(world);
}
