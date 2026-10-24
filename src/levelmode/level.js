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
//   checkpoint { id, name, at, facing, section, gear, inventory, comrades }    where, in what, with what he wakes, and the spawn ids of the comrades alive at the rest
//   boss { id, phase } | null
//   ending { phase: 'locked' | 'felled' | 'open' | 'scene' | 'done', held?, watched? } | null    the boss out, the cutscene, the inner door, the scene (ending.js)
//   ui []        what the screen is to be told, in order: { type: 'toast', text } | { type: 'note', key, id }
//                | { type: 'death' } | { type: 'respawned' } | { type: 'rested', name } | { type: 'phase2', id }
//                | { type: 'bossDown' } (the cutscene begins) | { type: 'doorsOpen' } (it is through) | { type: 'ending' }
//   attempts []   the failed attempts, one record per death; attempt { since, from, comrades }   the one in hand (attempts.js)
//   team { fallen: Set of spawn ids, gateTold }   the comrades said to have fallen (a death brings back those a rest recorded), and whether the gate has been spoken of (team.js)
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
import { advance, boutWinner, knockOut, opponentFor, reclothe } from '../physics.js';
import { LEVEL_CONFIG } from './config.js';
import { levelOf, updateAction, updateTonics } from './items.js';
import { noteDeath, playerStands, respawnPlayer, setCheckpoint, spawnDefinitions } from './checkpoints.js';
import { levelAware } from './adapter.js';
import { createStageWorld } from './stage.js';
import { endingBusy, endingRelease, watchEnding } from './ending.js';
import { watchTeam } from './team.js';
import { beginAttempt } from './attempts.js';
import { outfitOf } from '../outfits.js';
import { floorAt } from '../physics/terrain.js';
import { stageWaters, waterAt } from './water.js';

/** Give a stage world its run. Returns the level. */
export function startLevel(world, { settle = true } = {}) {
  const stage = world.stage.def;
  const startItems = { ...LEVEL_CONFIG.start, ...(stage.start.items ?? {}) };
  const spawns = spawnDefinitions(stage);
  const level = {
    inventory: { ...startItems }, startItems,
    taken: new Set(), notes: new Set(), keys: new Set(), pulled: new Set(), opened: new Set(), freed: new Set(),
    action: null, tonics: [], checkpoint: null, boss: null, dying: false, deaths: 0, rests: 0, attempts: [], attempt: null,
    ui: [], rebuild: new Set(), spawns, spawnInputs: {}, team: { fallen: new Set(), gateTold: false }, ending: stage.ending ? { phase: 'locked' } : null,
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
  beginAttempt(world);
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
  return Boolean(level?.action) || Boolean(world.fighters[0].pickup) || endingBusy(world);
}

/**
 * The side the bout banner would name: none in a stage. A level run is not a bout: one enemy falling, or the player
 * standing alone, is not an end; it ends by his death (YOU DIED, then the last rest) or by the ending (ending.js).
 */
export function bannerWinner(world) {
  return world.stage ? null : boutWinner(world);
}

/**
 * The man the player's marker and Lock are on in a stage: the nearest foe, if he is aware of the player and within
 * LEVEL_CONFIG.marker.aware m, or any foe within LEVEL_CONFIG.marker.near m (an unaware man close by can be locked on and
 * struck first); otherwise none (a far, unaware man gets no name over his head).
 */
export function levelOpponent(world, me) {
  const foe = opponentFor(world, me);
  if (!foe || foe.dormant) return null;
  const apart = Math.hypot(foe.x[P.pelvis * 3] - me.x[P.pelvis * 3], foe.x[P.pelvis * 3 + 2] - me.x[P.pelvis * 3 + 2]);
  const { aware, near } = LEVEL_CONFIG.marker;
  return apart <= near || (apart <= aware && levelAware(world, foe)) ? foe : null;
}

/** Each step: the actions and tonics go on, a death is noticed, the boss's second phase is watched for. */
export function levelThink(world, dt) {
  const level = levelOf(world);
  const me = world.fighters[0];
  watchTeam(world);
  dropHelmets(world);
  giveTemper(world);
  wadeGear(world);
  if (me.state === 'out') {
    noteDeath(world);
    return;
  }
  if (level.dying) return;
  updateAction(world, dt);
  updateTonics(world, dt);
  if (level.boss) watchBoss(world, level.boss);
  watchEnding(world);
}

// ---- Wading ---------------------------------------------------------------------------------------------------

/**
 * A man in water deeper than LEVEL_CONFIG.wade.from over his feet is held by it: his footwork and acceleration are scaled down while he is in it and given back as
 * he comes out (`fighter.wading` keeps what they were, for the gear they were taken from: a rest or a death makes his gear new). One with `wader` in his inputs
 * walks in it as on the stone.
 */
export function wadeGear(world) {
  const level = levelOf(world);
  const spec = LEVEL_CONFIG.wade;
  level.waters ??= stageWaters(world.stage.def);
  if (!level.waters.length) return;
  for (const fighter of world.fighters) {
    const gear = fighter.body.gear;
    if (fighter.wading && fighter.wading.gear !== gear) fighter.wading = null;
    const x = fighter.x;
    const feet = Math.min(x[P.lFoot * 3 + 1], x[P.rFoot * 3 + 1]);
    const water = fighter.dormant || fighter.body.inputs.wader ? null : waterAt(level.waters, x[P.pelvis * 3], feet, x[P.pelvis * 3 + 2]);
    const held = Boolean(water) && water.at[1] - feet > spec.from;
    if (held && !fighter.wading) {
      fighter.wading = { gear, foot: gear.foot, accel: gear.accel };
      gear.foot = (gear.foot ?? 1) * spec.foot;
      gear.accel = (gear.accel ?? 1) * spec.accel;
    } else if (!held && fighter.wading) {
      gear.foot = fighter.wading.foot;
      gear.accel = fighter.wading.accel;
      fighter.wading = null;
    }
  }
}

// ---- A man's own temper -----------------------------------------------------------------------------------------------

/**
 * A man whose inputs carry a `temperament` ({ work, move, burst, mobility }: ai.js cadenceOf, each round 1) fights with it and not with one drawn at random (the
 * fight AI draws one the first time it needs it, and again after a rest makes him new): the cesspool's Noname works long and in bursts. Set before the AI thinks.
 */
function giveTemper(world) {
  for (const fighter of world.fighters) {
    const own = fighter.body.inputs.temperament;
    if (own && !fighter.temperament) fighter.temperament = { work: 1, move: 1, burst: 1, mobility: 1, ...own };
  }
}

// ---- A helmet off a dead man's head ---------------------------------------------------------------------------------

/**
 * A man whose inputs say `helmetOffOnDeath` (the cesspool's Noname) loses his helmet as he dies: he is made bare-headed (his face shows) and the helmet lies by
 * his head, on the floor or on the sludge over it (`level.dropped`: { id, kind: 'helmet', owner (spawn id), head (the outfit's headgear), at, yaw }, drawn by
 * kitfilth.js). The screen is told ({ type: 'helmetOff', id }) and the history has it. Once only for each man.
 */
export function dropHelmets(world) {
  const level = levelOf(world);
  if (!level) return;
  for (const fighter of world.fighters) {
    const inputs = fighter.body.inputs;
    if (fighter.state !== 'out' || !inputs.helmetOffOnDeath || inputs.outfit?.bareHead) continue;
    const head = outfitOf(inputs).look.head;
    if (!head) continue;
    const x = fighter.x;
    const hx = x[P.head * 3];
    const hy = x[P.head * 3 + 1];
    const hz = x[P.head * 3 + 2];
    // Beside the head, on the side away from the hips: where it rolled.
    const ax = hx - x[P.pelvis * 3];
    const az = hz - x[P.pelvis * 3 + 2];
    const away = Math.hypot(ax, az) || 1;
    const at = [hx + (ax / away) * 0.3 - (az / away) * 0.3, hy, hz + (az / away) * 0.3 + (ax / away) * 0.3];
    const floor = world.arena.terrain ? floorAt(world.arena.terrain, at[0], at[2], hy + 0.5) : -Infinity;
    at[1] = Number.isFinite(floor) ? floor : hy - 0.1;
    // (In the cesspool it does not sink out of sight: it lies half in the sludge.)
    level.waters ??= stageWaters(world.stage.def);
    const water = waterAt(level.waters, at[0], at[1], at[2]);
    if (water) at[1] = Math.max(at[1], water.at[1] - 0.06);
    reclothe(world, fighter, { ...inputs, outfit: { ...inputs.outfit, bareHead: true } });
    level.rebuild.add(fighter.id);
    level.dropped ??= [];
    level.dropped.push({ id: `helmet:${fighter.spawn?.id ?? fighter.id}`, kind: 'helmet', owner: fighter.spawn?.id ?? null, head: { ...head }, at, yaw: Math.atan2(-az, ax) });
    world.events.push({ time: world.time, kind: 'helmetOff', fighter: fighter.id, effects: ['the helmet comes off'] });
    level.ui.push({ type: 'helmetOff', id: fighter.id });
  }
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
 * What the boss's bar says: { show, name, title, fraction, felled } (fraction: what is left of his health, the measure of
 * the health bars: 1 - hurtShare). Shown while he is awake, aware of the player and not far; when he is out it stays, empty and
 * struck through (felled), for as long as the cutscene plays (the ending's phase 'felled'), then goes.
 */
export function bossStatus(world) {
  const level = levelOf(world);
  if (!level?.boss) return { show: false, name: '', title: '', fraction: 1 };
  const fighter = world.fighters[level.boss.id];
  const me = world.fighters[0];
  const near = Math.hypot(fighter.x[P.pelvis * 3] - me.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2] - me.x[P.pelvis * 3 + 2]) <= LEVEL_CONFIG.boss.barRange;
  const def = level.spawns[fighter.spawn.id].def;
  const felled = fighter.state === 'out' && level.ending?.phase === 'felled';
  return { show: felled || (fighter.state !== 'out' && !fighter.dormant && near && levelAware(world, fighter)), name: fighter.body.inputs.name, title: def.boss?.title ?? '', fraction: felled ? 0 : 1 - hurtShare(fighter), felled };
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

/**
 * Begin again from the last rest he reached (no YOU DIED): false if he has reached none (the caller begins the stage over).
 * A scene half-played is put back to its door being open.
 */
export function restartFromRest(world) {
  const level = levelOf(world);
  if (!level.rests) return false;
  if (level.ending?.phase === 'scene') level.ending.phase = 'open';
  // A cutscene half-played: it is over, and the door is open.
  endingRelease(world);
  level.ui.length = 0;
  respawnPlayer(world);
  level.ui.length = 0;
  return true;
}

export { livingComrades, respawnPlayer, restAtPoint } from './checkpoints.js';
export { attemptCount, attemptLog, attemptStory, beginAttempt } from './attempts.js';
export { contextFor, interact, interactions, hostileNear } from './interact.js';
export { useItem } from './items.js';
export { endingBusy, endingDone, endingHold, endingOf, endingRelease, endingWatched, guideOf, killBoss, princeOf } from './ending.js';
