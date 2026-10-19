// Level mode, rest points and death. A rest heals the operative whole, refills his items, puts the
// enemies back at their posts and makes the place his respawn point; a death does the same from the
// last rest (or the start), with the gear he had at that rest. What the run has done to the stage stays:
// opened gates and kicked ladders (world.stage.mechanisms), freed prisoners, notes read, keys and pickups
// taken. Men are made new in place (physics reviveFighter: the same object, so ids and the world's
// references hold); the screen is told which to draw again (level.rebuild).
// The comrades (team.js): a rest records who is alive (the checkpoint's roster); a death wakes the operative with exactly those
// beside him, so a comrade who fell since the rest comes back. One who fell before the rest is not on its roster and stays gone: he
// is lost for good once the next rest is reached while he is dead.
// Every death is a failed attempt on the prince (attempts.js keeps the record); a death or a respawn begins the next attempt.

import { P } from '../body.js';
import { reviveFighter } from '../physics.js';
import { LEVEL_CONFIG } from './config.js';
import { levelOf, say, feetFloor } from './items.js';
import { regionContains, updateStage } from './stage.js';
import { levelResetMinds } from './adapter.js';
import { endingRelease } from './ending.js';
import { beginAttempt, recordAttempt } from './attempts.js';
import { comradesOf } from './team.js';

/** The operative's gear as it is now: his inputs (outfit, headgear, style) and the shield on his arm. */
export function snapshotGear(me) {
  const inputs = structuredClone(me.body.inputs);
  inputs.style = me.style;
  return { inputs, shield: me.shield?.kind ?? null };
}

/** Where the player stands: the middle of his hips and the floor under his feet, [x, y, z]. */
export function playerStands(me) {
  return [me.x[P.pelvis * 3], feetFloor(me), me.x[P.pelvis * 3 + 2]];
}

/** The section a point is in (the first whose bounds hold it), else the stage's start section. */
function sectionAt(stage, at) {
  return stage.sections.find((section) => regionContains(section.bounds, at[0], at[2], at[1]))?.id ?? stage.start.section;
}

/** The spawn ids of the comrades who are alive now (down or up, awake or not): the roster a rest records. */
export const livingComrades = (world) => comradesOf(world).filter((fighter) => fighter.state !== 'out').map((fighter) => fighter.spawn.id);

/** Make the checkpoint: the place, the gear and the items he will wake with, and the comrades alive (whom a death brings back). */
export function setCheckpoint(world, { id = null, at, facing, name = null }) {
  const level = levelOf(world);
  const me = world.fighters[0];
  level.checkpoint = { id, name, at: [...at], facing, section: sectionAt(world.stage.def, at), gear: snapshotGear(me), inventory: { ...level.inventory }, comrades: livingComrades(world) };
}

/** The spawn definitions by id, with the section each stands in: { id: { def, section } }. */
export function spawnDefinitions(stage) {
  const found = {};
  for (const section of stage.sections) for (const def of section.spawns ?? []) found[def.id] = { def, section: section.id };
  return found;
}

/** Put the fighter beside the player (the n-th of his followers), in the open. */
function beside(me, number) {
  const [x, y, z] = playerStands(me);
  const side = number % 2 === 0 ? 1 : -1;
  const across = Math.ceil((number + 1) / 2) * LEVEL_CONFIG.rest.followerSpacing * side;
  // Beside him: perpendicular to the way he faces (yaw 0 faces +x; a positive yaw turns toward -z).
  return [x + Math.sin(me.yaw) * across, y, z + Math.cos(me.yaw) * across];
}

/** Whether a fighter shows signs that his drawing is out of date (wounds, loss, a shield or limb gone). */
function marked(fighter) {
  return fighter.damageVersion > 0 || fighter.state !== 'up' || fighter.severed || fighter.broken.size > 0;
}

/** Make the fighter new where he stands as `inputs` say; his drawing is asked for again if it shows anything. */
function remake(world, fighter, inputs, options, { force = false } = {}) {
  const level = levelOf(world);
  const draw = force || marked(fighter) || (world.props ?? []).some((prop) => prop.owner === fighter.id && !prop.attached);
  reviveFighter(world, fighter, inputs, options);
  if (draw) level.rebuild.add(fighter.id);
}

/**
 * The enemies back at their posts, whole and as they were made; the comrades (the team and the freed) beside the player: the
 * living, and the ones on the checkpoint's roster, who come back whole if they have fallen since the rest (a death). One who is not
 * on the roster and lies fallen stays where he lies (a rest records only the living, so he is lost for good).
 */
function reviveWorld(world, { followersAt = true } = {}) {
  const level = levelOf(world);
  const me = world.fighters[0];
  let follower = 0;
  for (const fighter of world.fighters) {
    if (fighter.id === 0 || !fighter.spawn) continue;
    const found = level.spawns[fighter.spawn.id];
    const inputs = level.spawnInputs[fighter.id];
    if (!found || !inputs) continue;
    const { def } = found;
    if (def.dead) continue;
    if (fighter.corner === 'blue') {
      // A boss who has fallen stays down: the stage is done.
      if (def.role === 'boss' && fighter.state === 'out') continue;
      fighter.spawn.section = fighter.spawn.home;
      remake(world, fighter, inputs, { at: def.post, yaw: def.facing ?? 0, shield: undefined });
      if (def.role === 'boss') level.boss = { id: fighter.id, phase: 1 };
    } else if (fighter.corner === 'red' && followersAt) {
      if (fighter.state === 'out' && !level.checkpoint.comrades.includes(fighter.spawn.id)) continue;
      remake(world, fighter, inputs, { at: beside(me, follower), yaw: me.yaw, shield: undefined });
      fighter.spawn.section = level.checkpoint.section;
      follower += 1;
    }
  }
  world.hangFires = [];
  // Every mind starts over (the awareness AI), the followers are brought to his side.
  levelResetMinds(world);
  updateStage(world, true);
}

/**
 * Rest at a rest point (`{ id, at, name }` of a section): the operative is made whole where he kneels,
 * the items refilled to at least the stage's start counts, the enemies sent back to their posts, and this the
 * place he wakes at. Everything the run has opened stays open.
 */
export function restAtPoint(world, point) {
  const level = levelOf(world);
  const me = world.fighters[0];
  const gear = snapshotGear(me);
  const facing = me.yaw;
  const at = [...point.at];
  remake(world, me, gear.inputs, { at, yaw: facing, shield: gear.shield }, { force: true });
  level.tonics.length = 0;
  level.action = null;
  for (const kind of Object.keys(level.startItems)) level.inventory[kind] = Math.max(level.inventory[kind] ?? 0, level.startItems[kind]);
  setCheckpoint(world, { id: point.id ?? null, at, facing, name: point.name ?? null });
  reviveWorld(world);
  level.rests += 1;
  world.events.push({ time: world.time, kind: 'rested', fighter: 0, effects: [`rests${point.name ? ` at ${point.name}` : ''}`] });
  say(world, { type: 'rested', name: point.name ?? null });
  say(world, { type: 'toast', text: 'You rest. The world stirs again.' });
  return true;
}

/** The operative is out: put the failed attempt on the record, say so once, and the screen runs its death (which calls `respawnPlayer` while dark). */
export function noteDeath(world) {
  const level = levelOf(world);
  if (level.dying) return;
  level.dying = true;
  level.deaths += 1;
  const at = playerStands(world.fighters[0]);
  // (Lost to the sea or over an edge he is in no section: the one the stage last had awake for him.)
  const sections = world.stage.def.sections;
  const section = sections.find((each) => regionContains(each.bounds, at[0], at[2], at[1])) ?? sections.find((each) => each.id === world.stage.active[0]);
  recordAttempt(world, { section: section?.id ?? null, place: section?.name ?? null });
  say(world, { type: 'death' });
}

/**
 * Wake at the last rest (or the stage's start) in the gear he had there, with the items he had then, the
 * enemies at their posts and the freed beside him. What he opened, freed, read and took stays so.
 */
export function respawnPlayer(world) {
  const level = levelOf(world);
  const me = world.fighters[0];
  const point = level.checkpoint;
  level.tonics.length = 0;
  level.action = null;
  level.inventory = { ...point.inventory };
  remake(world, me, point.gear.inputs, { at: point.at, yaw: point.facing, shield: point.gear.shield }, { force: true });
  me.orderPickup = null;
  level.dying = false;
  // (He died while the boss's cutscene played, or after it: the boss is down, the door is open.)
  endingRelease(world);
  // Where he is decides which sections are awake, before the men are put back.
  updateStage(world, true);
  reviveWorld(world);
  beginAttempt(world);
  world.events.push({ time: world.time, kind: 'respawned', fighter: 0, effects: ['wakes at the last rest'] });
  say(world, { type: 'respawned' });
  return true;
}
