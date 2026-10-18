// Level mode, the player's side of a stage run. `startLevel(world)` gives a stage world (stage.js) the
// run's state: the items he carries, what he has taken, read, opened and freed, the rest he wakes at, the
// boss. `levelThink(world, dt)` is its step: actions and tonics go on, a death is noticed, the boss's second
// phase is watched for. The pieces are in items.js (items and actions), loot.js, interact.js (the context
// button), checkpoints.js (rest and death), adapter.js (the awareness AI's seam).
//
// The run lives in `world.stage.level`:
//   inventory { bandage, tonic }   startItems   the counts a rest refills to
//   taken (Set of item ids)  notes  keys  pulled  opened  freed (Sets)   what the run has done to the stage
//   action { kind, label, seconds, t, ... } | null    what holds the man still now
//   tonics []   tonic effects at work
//   checkpoint { id, name, at, facing, section, gear, inventory }    where, in what, with what he wakes
//   boss { id, phase } | null
//   ui []        what the screen is to be told, in order: { type: 'toast', text } | { type: 'note', key, id }
//                | { type: 'death' } | { type: 'respawned' } | { type: 'rested', name } | { type: 'phase2', id }
//   rebuild Set  fighter ids whose drawing is out of date (their bodies were remade)
//   spawns { id: { def, section } }   spawnInputs { fighterId: inputs }   what the stage made them from
//
// Stage data this reads, beyond stage.js's:
//   stage.start.items        { bandage, tonic }: the start counts (default LEVEL_CONFIG.start)
//   spawn.dead: true         a body that lies where it was put, from the start (weapon dropped); never respawned
//   spawn.boss               { title?, phase2?: { at, foot, accel, work, burst } | false } on a spawn of role 'boss'
//   (and the items / rest / levers / gates / ladders fields of interact.js)

import { hurtShare } from '../ai.js';
import { P } from '../body.js';
import { advance, knockOut, reclothe } from '../physics.js';
import { LEVEL_CONFIG } from './config.js';
import { levelOf, updateAction, updateTonics } from './items.js';
import { noteDeath, playerStands, setCheckpoint, spawnDefinitions } from './checkpoints.js';
import { levelAware } from './adapter.js';
import { createStageWorld } from './stage.js';

/** Give a stage world its run. Returns the level. */
export function startLevel(world, { settle = true } = {}) {
  const stage = world.stage.def;
  const startItems = { ...LEVEL_CONFIG.start, ...(stage.start.items ?? {}) };
  const spawns = spawnDefinitions(stage);
  const level = {
    inventory: { ...startItems }, startItems,
    taken: new Set(), notes: new Set(), keys: new Set(), pulled: new Set(), opened: new Set(), freed: new Set(),
    action: null, tonics: [], checkpoint: null, boss: null, dying: false, deaths: 0, rests: 0,
    ui: [], rebuild: new Set(), spawns, spawnInputs: {},
  };
  world.stage.level = level;
  // The operative fights from his guard (the stick within the run threshold); the walk mode's guardless stance is for exploring.
  world.fighters[0].walking = false;
  for (const fighter of world.fighters) {
    if (!fighter.spawn) continue;
    level.spawnInputs[fighter.id] = structuredClone(fighter.body.inputs);
    if (fighter.spawn.role === 'boss' && !level.boss) level.boss = { id: fighter.id, phase: 1 };
  }
  // The bodies that lie from the start fall where they stood.
  const dead = world.fighters.filter((fighter) => fighter.spawn && spawns[fighter.spawn.id]?.def.dead);
  for (const fighter of dead) knockOut(world, fighter, { time: world.time, effects: [] }, 'lies dead', 'killed');
  if (settle && dead.some((fighter) => !fighter.dormant)) {
    advance(world, 2.5);
    // (What happened before the first step is not the run's history.)
    world.events.length = 0;
  }
  const me = world.fighters[0];
  setCheckpoint(world, { id: null, at: playerStands(me), facing: me.yaw });
  return level;
}

/** A stage's world with its run: the player, the men, and what he carries. */
export function createLevelWorld(stage, playerInputs, options = {}) {
  const world = createStageWorld(stage, playerInputs, options);
  startLevel(world, options);
  return world;
}

/** Whether the man is held where he stands (an action, a stoop to take something up). */
export function levelBusy(world) {
  const level = levelOf(world);
  return Boolean(level?.action) || Boolean(world.fighters[0].pickup);
}

/** Each step: the actions and tonics go on, a death is noticed, the boss's second phase is watched for. */
export function levelThink(world, dt) {
  const level = levelOf(world);
  const me = world.fighters[0];
  if (me.state === 'out') {
    noteDeath(world);
    return;
  }
  if (level.dying) return;
  updateAction(world, dt);
  updateTonics(world, dt);
  if (level.boss) watchBoss(world, level.boss);
}

// ---- The boss -----------------------------------------------------------------------------------------------

/** The boss spawn's own settings over the config's. */
function phaseTwo(world, boss) {
  const def = levelOf(world).spawns[world.fighters[boss.id].spawn.id].def;
  return def.boss?.phase2 === false ? null : { ...LEVEL_CONFIG.boss.phase2, ...(def.boss?.phase2 ?? {}) };
}

/** At the share of his health gone that the config says, the helm comes off and he is quicker and keener. */
function watchBoss(world, boss) {
  const fighter = world.fighters[boss.id];
  if (boss.phase !== 1 || fighter.state === 'out' || fighter.dormant) return;
  const phase = phaseTwo(world, boss);
  if (!phase || hurtShare(fighter) < phase.at) return;
  boss.phase = 2;
  reclothe(world, fighter, { ...fighter.body.inputs, outfit: { ...fighter.body.inputs.outfit, bareHead: true }, accessories: [] });
  fighter.body.gear.foot = phase.foot;
  fighter.body.gear.accel = phase.accel;
  fighter.temperament = { work: 1, move: 1, burst: 1, mobility: 1, ...fighter.temperament };
  fighter.temperament.work *= phase.work;
  fighter.temperament.burst *= phase.burst;
  levelOf(world).rebuild.add(fighter.id);
  world.events.push({ time: world.time, kind: 'phase2', fighter: fighter.id, effects: ['the helm comes off'] });
  levelOf(world).ui.push({ type: 'phase2', id: fighter.id });
}

/**
 * What the boss's bar says: { show, name, title, fraction } (fraction: what is left of his health, the measure of
 * the health bars: 1 - hurtShare). Shown while he is awake, aware of the player and not far; gone when he is out.
 */
export function bossStatus(world) {
  const level = levelOf(world);
  if (!level?.boss) return { show: false, name: '', title: '', fraction: 1 };
  const fighter = world.fighters[level.boss.id];
  const me = world.fighters[0];
  const near = Math.hypot(fighter.x[P.pelvis * 3] - me.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2] - me.x[P.pelvis * 3 + 2]) <= LEVEL_CONFIG.boss.barRange;
  const def = level.spawns[fighter.spawn.id].def;
  return { show: fighter.state !== 'out' && !fighter.dormant && near && levelAware(world, fighter), name: fighter.body.inputs.name, title: def.boss?.title ?? '', fraction: 1 - hurtShare(fighter) };
}

// ---- What the screen is told ------------------------------------------------------------------------------------

/** The messages for the screen since last asked (and forget them). */
export function drainUi(world) {
  const level = levelOf(world);
  return level.ui.splice(0);
}

/** The fighters whose drawing is out of date since last asked (and forget them). */
export function drainRebuilds(world) {
  const level = levelOf(world);
  const ids = [...level.rebuild];
  level.rebuild.clear();
  return ids;
}

export { respawnPlayer, restAtPoint } from './checkpoints.js';
export { contextFor, interact, interactions, hostileNear } from './interact.js';
export { useItem } from './items.js';
