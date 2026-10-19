// Level mode, the ending: what happens once the boss is out. The screen plays the boss's cutscene (cutscene.js, cutsceneview.js), then
// the inner cell's door opens (a mechanism) and a guide leads to the prince; when the player comes near him the scene is staged: he
// cowers in the shadows and shuffles away from the player on his knees into the corner, and the screen runs the ending cards over it
// (main.js, story.js showEnding).
//
// The run's `ending` is { phase }: 'locked' (the boss stands) → 'felled' (he is out; the cutscene plays; the player is held while it
// does, `held`) → 'open' (the cutscene is through, the door is open) → 'scene' (the player is held where he stands, the prince
// cowers, the cards run) → 'done' (the finale card is up). The screen says it is playing the cutscene (`watched`) and when it is
// through (endingRelease); a world with no screen (the tests, the bot) opens the door itself after ENDING_WAIT.headless s. Stage data:
//   stage.ending = { door: mechanism id, prince: spawn id, trigger: m, corner: [x, z] }
// (Where the door and the prince are is read from the stage's own data: its gate `at`, the prince's body.)
// No DOM here: the screen is told through the level's `ui` queue ({ type: 'toast' } | { type: 'bossDown' } | { type: 'doorsOpen' } | { type: 'ending' }).

import { P } from '../body.js';
import { knockOut } from '../physics.js';
import { cowerFor } from './awareness.js';
import { CUTSCENE } from './cutscene.js';
import { levelOf, say } from './items.js';
import { setMechanism } from './stage.js';

export const ENDING_WAIT = {
  // s of the world's clock the door waits after the boss is out in a world with no screen to play the cutscene (the fall, and a breath).
  headless: 1.5,
};

/** The ending's state for a run (null in a stage with no ending). */
export const endingOf = (world) => levelOf(world)?.ending ?? null;

/** Whether the scene (or the cutscene before it) holds the player where he stands. */
export const endingBusy = (world) => endingOf(world)?.phase === 'scene' || Boolean(endingOf(world)?.held);

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

/** The screen has taken the cutscene (it will say when it is through): the world does not open the door by itself. */
export function endingWatched(world) {
  const ending = endingOf(world);
  if (ending) ending.watched = true;
}

/** The cutscene holds the player where he stands, or lets him go. */
export function endingHold(world, held) {
  const ending = endingOf(world);
  if (ending) ending.held = Boolean(held);
}

/** The cutscene is through (or the run has begun again): the player is free and the inner door is open. True if it opened the door now. */
export function endingRelease(world) {
  const level = levelOf(world);
  const def = world.stage.def.ending;
  const ending = level?.ending;
  if (!ending || !def) return false;
  ending.held = false;
  if (ending.phase !== 'felled') return false;
  ending.phase = 'open';
  setMechanism(world, def.door, 'open');
  level.opened.add(def.door);
  say(world, { type: 'doorsOpen' });
  say(world, { type: 'toast', text: CUTSCENE.words.toast });
  return true;
}

/**
 * Where the guide leads once the door is open, from stage data: { door: [x, y, z], prince: [x, y, z] } (the floor under each), or
 * null (not open yet, the scene begun, or no such door). The door's place is its gate's `at`; the prince's is where he stands.
 */
export function guideOf(world) {
  const def = world.stage.def.ending;
  if (endingOf(world)?.phase !== 'open' || !def) return null;
  const gate = world.stage.def.sections.flatMap((section) => section.gates ?? []).find((each) => each.id === def.door);
  const prince = princeOf(world);
  if (!gate || !prince) return null;
  const [x, , z] = hip(prince);
  // (The door itself is its first closed solid; where it is worked from, `at`, is a stride before it.)
  const leaf = gate.states?.closed?.find((solid) => solid.at)?.at;
  return { door: [leaf ? leaf[0] : gate.at[0], gate.at[1], leaf ? leaf[leaf.length - 1] : gate.at[2]], prince: [x, prince.lift ?? gate.at[1], z] };
}

/** Each step: the boss out begins the cutscene (the door opens when it is through); the player near the prince begins the scene. */
export function watchEnding(world) {
  const level = levelOf(world);
  const def = world.stage.def.ending;
  const ending = level?.ending;
  if (!def || !ending || ending.phase === 'done' || !level.boss) return;
  if (ending.phase === 'locked') {
    if (world.fighters[level.boss.id].state !== 'out') return;
    ending.phase = 'felled';
    ending.since = world.time;
    say(world, { type: 'bossDown' });
    return;
  }
  if (ending.phase === 'felled') {
    if (!ending.watched && world.time - ending.since >= ENDING_WAIT.headless) endingRelease(world);
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
