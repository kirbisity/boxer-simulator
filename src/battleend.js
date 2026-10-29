// When a battle is decided. A duel, or a fight of a few men, ends as it
// always has: when one side has nobody left in the fight (physics.js
// boutWinner). A battle (BATTLE_END.minSide men a side or more at the start)
// was never fought to the last man: it was over when one side's fighting
// strength had gone, its last few broken, running, crawling off or standing
// alone among the enemy; the winners were left in possession of the field,
// chasing, plundering, taking prisoners. So a battle is decided when
// - the losing side has no man still fighting (ai.js stillFighting: all down,
//   out, broken and running, crawling off or fled), or what it has left is a
//   remnant (`remnant` of its men or fewer) outnumbered `outnumbered` to one by
//   strength (strengthOf), held for `holdFor` s (a man knocked down who gets
//   up, or a runner who rallies inside that, and it is not over yet); after
//   that a runner who comes back changes nothing: the battle has been lost;
// - or, at `timeLimit` s of battle, whichever side has the more fighting
//   strength holds the field; within `drawWithin` of even (a ratio), a draw:
//   both sides drew off (an afternoon of fighting with neither side broken
//   ended at dusk, each claiming it).
// Decided, the battle goes on (main.js: the player still has his man, the
// winners still chase): the decision is kept on the world (world.verdict),
// never taken back. The level tool (tools/levels.js) ends its battles by the
// same rule, so its measurements and the game agree.

import { stillFighting, strengthOf } from './ai.js';
import { boutWinner } from './physics.js';

export const BATTLE_END = {
  // Men a side at the start for a fight to be a battle (AI.rout minSide: the same line, where a side can rout).
  minSide: 4,
  // The remnant: at most this share of its men still fighting…
  remnant: 0.15,
  // …and outnumbered this many to one by strength.
  outnumbered: 3,
  // How long the collapse must hold (s): a couple of seconds, to see that the last man down stays down.
  holdFor: 3,
  // The battle's length (s of battle time): five minutes, and whoever has more fight left holds the field.
  timeLimit: 300,
  // At the time limit, strengths within this ratio of each other are a draw.
  drawWithin: 1.25,
};

const BATTLE_CORNERS = ['red', 'blue'];
const foeCorner = (corner) => (corner === 'red' ? 'blue' : 'red');

/** Whether the world is a battle by BATTLE_END's rule (each side `minSide` men or more at the start); a level's stage never is. */
export function isBattle(world) {
  if (world.stage) return false;
  return BATTLE_CORNERS.every((corner) => world.fighters.filter((fighter) => fighter.corner === corner).length >= BATTLE_END.minSide);
}

/** A side's men still fighting: how many, how many it had, and their strength. */
function sideFighting(world, corner) {
  const men = world.fighters.filter((fighter) => fighter.corner === corner);
  const fighting = men.filter(stillFighting);
  return { men: men.length, fighting: fighting.length, strength: fighting.reduce((sum, fighter) => sum + strengthOf(fighter), 0) };
}

/** Whether `corner` has collapsed against `other` (BATTLE_END): nobody still fighting, or a remnant outnumbered. */
function sideCollapsed(mine, theirs) {
  if (mine.fighting === 0) return true;
  return mine.fighting <= BATTLE_END.remnant * mine.men && theirs.strength >= BATTLE_END.outnumbered * mine.strength;
}

/**
 * The verdict, judged now and kept (world.verdict): { winner: 'red' | 'blue' |
 * null (a draw), how: 'last' (the other side all out), 'collapsed', 'time',
 * time }, or null while undecided. Call it as the battle goes (each frame or
 * each step: the hold is timed by world.time). A duel or a small fight: the
 * last-man rule alone (boutWinner), as before.
 */
export function judgeBattle(world) {
  if (world.verdict) return world.verdict;
  const last = boutWinner(world);
  if (last) return (world.verdict = { winner: last, how: 'last', time: world.time });
  if (!isBattle(world)) return null;
  const sides = { red: sideFighting(world, 'red'), blue: sideFighting(world, 'blue') };
  const since = (world.collapseSince ??= { red: null, blue: null });
  for (const corner of BATTLE_CORNERS) {
    const down = sideCollapsed(sides[corner], sides[foeCorner(corner)]);
    since[corner] = down ? since[corner] ?? world.time : null;
  }
  // Both gone at once (the last two killing each other): the one that went first lost.
  const lost = BATTLE_CORNERS.filter((corner) => since[corner] !== null && world.time - since[corner] >= BATTLE_END.holdFor).sort((a, b) => since[a] - since[b])[0];
  if (lost) return (world.verdict = { winner: foeCorner(lost), how: 'collapsed', time: world.time });
  if (world.time >= BATTLE_END.timeLimit) {
    const [red, blue] = [sides.red.strength, sides.blue.strength];
    const even = Math.max(red, blue) <= BATTLE_END.drawWithin * Math.min(red, blue);
    return (world.verdict = { winner: even ? null : red > blue ? 'red' : 'blue', how: 'time', time: world.time });
  }
  return null;
}
