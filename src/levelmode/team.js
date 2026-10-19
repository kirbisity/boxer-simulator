// Level mode, the team: the comrades who fight beside the operative (the three Forgers the stage starts him with, and any
// prisoner he frees: role 'ally', corner 'red'). They follow him and fight what he fights (awareness.js followers); this
// module is what the player is told about them, with no drawing:
//   teamStatus(world)   [{ id, spawn, name, alive, state, fraction, distance, near }] in fighter order, the fallen too
//   watchTeam(world)    each step: a comrade who falls is said so once ('Brann has fallen'), and the first time any holds at the
//                       chapel gate the player is told they do ('Your comrades hold the gate')
// The rule the rest of the run keeps (checkpoints.js reviveWorld): a comrade who has fallen stays fallen, through every rest and
// every death of the operative; the living are gathered beside him each time. Nothing here revives anyone.

import { P } from '../body.js';
import { hurtShare } from '../ai.js';
import { mindState } from './awareness.js';
import { levelOf, say } from './items.js';

export const TEAM = {
  // m: within this a living comrade has his name and pip over his head (the HUD's panel lists them always).
  markerRange: 12,
  // What the screen is told.
  gateText: 'Your comrades hold the gate',
  fallenText: (name) => `${name} has fallen`,
};

/** The comrades, in fighter order (the player excluded). */
export const comradesOf = (world) => world.fighters.filter((fighter) => fighter.id !== 0 && fighter.spawn?.role === 'ally');

/** How a comrade is: 'fallen' | 'down' (knocked off his feet, not out) | the awareness state (follow, aggro, stayed). */
function comradeState(world, fighter) {
  if (fighter.state === 'out') return 'fallen';
  if (fighter.state !== 'up') return 'down';
  return mindState(world, fighter.id) ?? 'follow';
}

/** Every comrade as the screen shows him: [{ id, spawn, name, alive, state, fraction (health left, 0..1), distance (m), near }]. */
export function teamStatus(world) {
  const me = world.fighters[0];
  return comradesOf(world).map((fighter) => {
    const alive = fighter.state !== 'out';
    const distance = Math.hypot(fighter.x[P.pelvis * 3] - me.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2] - me.x[P.pelvis * 3 + 2]);
    return {
      id: fighter.id, spawn: fighter.spawn.id, name: fighter.body.inputs.name, alive, state: comradeState(world, fighter),
      fraction: alive ? Math.max(0, 1 - hurtShare(fighter)) : 0, distance,
      near: alive && !fighter.dormant && distance <= TEAM.markerRange,
    };
  });
}

/** Who is still on his feet beside the operative (alive, awake or not). */
export const teamAlive = (world) => comradesOf(world).filter((fighter) => fighter.state !== 'out');

/** Each step: say a fall once, and the gate once. (The run keeps it in `level.team`.) */
export function watchTeam(world) {
  const level = levelOf(world);
  if (!level) return;
  const team = (level.team ??= { fallen: new Set(), gateTold: false });
  for (const fighter of comradesOf(world)) {
    if (fighter.state === 'out' && !team.fallen.has(fighter.spawn.id)) {
      team.fallen.add(fighter.spawn.id);
      say(world, { type: 'toast', text: TEAM.fallenText(fighter.body.inputs.name) });
    }
  }
  if (!team.gateTold && comradesOf(world).some((fighter) => fighter.state !== 'out' && mindState(world, fighter.id) === 'stayed')) {
    team.gateTold = true;
    say(world, { type: 'toast', text: TEAM.gateText });
  }
}
