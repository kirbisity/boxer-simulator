// Level mode, the ending: what happens once the boss is out. The inner cell's door opens (a mechanism), and when the
// player comes near the prince the scene is staged: he cowers in the shadows and shuffles away from the player on his
// knees into the corner, and the screen runs the ending cards over it (main.js, story.js showEnding).
//
// The run's `ending` is { phase }: 'locked' (the boss stands) → 'open' (he is out, the door is open) → 'scene' (the
// player is held where he stands, the prince cowers, the cards run) → 'done' (the finale card is up). Stage data:
//   stage.ending = { door: mechanism id, prince: spawn id, trigger: m, corner: [x, z] }
// No DOM here: the screen is told through the level's `ui` queue ({ type: 'toast' } | { type: 'bossDown' } | { type: 'ending' }).

import { P } from '../body.js';
import { knockOut } from '../physics.js';
import { cowerFor } from './awareness.js';
import { levelOf, say } from './items.js';
import { setMechanism } from './stage.js';

/** The ending's state for a run (null in a stage with no ending). */
export const endingOf = (world) => levelOf(world)?.ending ?? null;

/** Whether the scene holds the player where he stands. */
export const endingBusy = (world) => endingOf(world)?.phase === 'scene';

const hip = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 1], fighter.x[P.pelvis * 3 + 2]];

/** The prince, if the stage has one. */
export function princeOf(world) {
  const id = world.stage.def.ending?.prince;
  return id ? world.fighters.find((fighter) => fighter.spawn?.id === id) ?? null : null;
}

/** The boss, struck down by hand (a debug hook, and the tests': he lies where he stands). True if he was standing. */
export function killBoss(world) {
  const level = levelOf(world);
  const boss = level?.boss && world.fighters[level.boss.id];
  if (!boss || boss.state === 'out') return false;
  knockOut(world, boss, { time: world.time, effects: [] }, 'is struck down', 'killed');
  return true;
}

/** Each step: the boss out opens the door; the player near the prince begins the scene. */
export function watchEnding(world) {
  const level = levelOf(world);
  const def = world.stage.def.ending;
  const ending = level?.ending;
  if (!def || !ending || ending.phase === 'done' || !level.boss) return;
  if (ending.phase === 'locked') {
    if (world.fighters[level.boss.id].state !== 'out') return;
    ending.phase = 'open';
    setMechanism(world, def.door, 'open');
    level.opened.add(def.door);
    say(world, { type: 'bossDown' });
    say(world, { type: 'toast', text: 'The inner cell door swings open' });
    return;
  }
  if (ending.phase !== 'open') return;
  const prince = princeOf(world);
  const me = world.fighters[0];
  if (!prince || prince.dormant) return;
  const [px, py, pz] = hip(me);
  const [qx, qy, qz] = hip(prince);
  if (Math.hypot(px - qx, pz - qz) > def.trigger || Math.abs(py - qy) > 1.6) return;
  ending.phase = 'scene';
  ending.since = world.time;
  cowerFor(world, def.prince, { corner: def.corner, near: def.trigger + 1 });
  say(world, { type: 'ending' });
}

/** The cards are through (the finale is up): the run is over. */
export function endingDone(world) {
  const ending = endingOf(world);
  if (ending) ending.phase = 'done';
}
