// Level mode, the player's actions and his items. An action (a bandage going on, an outfit being
// changed) holds the man still with his hands at his side for its time, ends if he is struck or goes
// down, and does its work when its time is out. The items are bandages and a tonic, counted in the
// stage run (world.stage.level.inventory); a bandage is an action, a tonic an effect over time.
//
// No DOM here: what the screen must say goes on the level's `ui` queue (see level.js).

import { soundEvent } from '../audio/log.js';
import { P } from '../body.js';
import { LEVEL_CONFIG } from './config.js';

export const ITEM_KINDS = ['bandage', 'tonic'];

/** The level run of a stage world. */
export const levelOf = (world) => world.stage?.level ?? null;

/** Tell the screen something (a toast, a note card...); main drains these. */
export function say(world, message) {
  levelOf(world).ui.push(message);
}

/** Hold the player still: no steps, no run, nowhere to go. */
export function holdPlayer(me) {
  me.move = 0;
  me.strafe = 0;
  me.goTo = null;
  me.running = false;
}

// ---- Actions ------------------------------------------------------------------------------------------

/**
 * Begin an action that holds the man for `seconds`: `done(world)` runs when it is out. False if he is not
 * free to (not standing, in the middle of a blow, already at an action).
 */
export function beginAction(world, { kind, label, seconds, done }) {
  const level = levelOf(world);
  const me = world.fighters[0];
  if (level.action || me.state !== 'up' || me.punch || me.pickup || me.clinch) return false;
  level.action = { kind, label, seconds, t: 0, start: world.time, cursor: world.events.length, done };
  me.tending = { t: 0, seconds };
  holdPlayer(me);
  return true;
}

/** Whether a blow, a shot or a fall has struck the player since the action began. */
function struck(world, me, action) {
  if (Math.max(...me.hitAt) > action.start) return true;
  for (let index = action.cursor; index < world.events.length; index += 1) {
    const event = world.events[index];
    if (event.defender === 0 && ['landed', 'blocked', 'shot', 'arrow', 'crash', 'bladeBlock'].includes(event.kind)) return true;
  }
  action.cursor = world.events.length;
  return false;
}

/** Put an action aside, undone (a hit, a fall); the screen is told. */
export function cancelAction(world, why = 'interrupted') {
  const level = levelOf(world);
  const action = level.action;
  if (!action) return;
  level.action = null;
  world.fighters[0].tending = undefined;
  say(world, { type: 'toast', text: `${action.label} ${why}` });
  world.events.push({ time: world.time, kind: 'actionStopped', fighter: 0, action: action.kind, effects: [why] });
}

/** Each step: the action runs on, or ends. */
export function updateAction(world, dt) {
  const level = levelOf(world);
  const me = world.fighters[0];
  const action = level.action;
  if (!action) {
    if (me.tending) me.tending = undefined;
    return;
  }
  action.t += dt;
  if (me.tending) me.tending.t = action.t;
  holdPlayer(me);
  if (me.state !== 'up' || struck(world, me, action)) return cancelAction(world, 'interrupted');
  if (action.t >= action.seconds) {
    level.action = null;
    me.tending = undefined;
    action.done(world);
  }
}

// ---- Items ----------------------------------------------------------------------------------------------

/** How many of an item he has. */
export const itemCount = (world, kind) => levelOf(world).inventory[kind] ?? 0;

/** Wounds still open? (any bleeding to speak of) */
const bleeding = (me) => (me.bleed ?? 0) > 1e-4;

/** What is wrong that a tonic mends: blood lost, strain, gunshot, bruising and trauma, knockdowns. */
function tonicNeed(me) {
  const damage = Object.values(me.damage ?? {}).reduce((sum, value) => sum + value, 0);
  return (me.bloodLost ?? 0) > 1e-3 || me.concussion > 1e-3 || (me.gunshot ?? 0) > 1e-3 || damage > 0.01 || me.knockdowns > 0;
}

/** Whether an item can be used now, and if not, why (a sentence). */
export function whyNot(world, kind) {
  const level = levelOf(world);
  const me = world.fighters[0];
  if (!ITEM_KINDS.includes(kind)) return 'no such thing';
  if (!itemCount(world, kind)) return `no ${kind}s`;
  if (me.state !== 'up') return 'not on his feet';
  if (level.action) return 'busy';
  if (kind === 'bandage' && !bleeding(me)) return 'not bleeding';
  if (kind === 'tonic' && !tonicNeed(me)) return 'not hurt';
  return null;
}

/** Use a bandage or a tonic (keys 1 and 2, the buttons). True if it was begun. */
export function useItem(world, kind) {
  const level = levelOf(world);
  const me = world.fighters[0];
  const reason = whyNot(world, kind);
  if (reason) {
    say(world, { type: 'toast', text: reason === 'not bleeding' ? 'You are not bleeding' : reason === 'not hurt' ? 'You are not hurt' : `Cannot use ${kind}: ${reason}` });
    return false;
  }
  if (kind === 'bandage') {
    const began = beginAction(world, { kind, label: 'Bandaging', seconds: LEVEL_CONFIG.bandage.seconds, done: bandaged });
    if (began) level.inventory.bandage -= 1;
    return began;
  }
  level.inventory.tonic -= 1;
  level.tonics.push(tonicEffect(me));
  say(world, { type: 'toast', text: 'You drink the tonic' });
  world.events.push({ time: world.time, kind: 'tonic', fighter: 0, effects: ['drinks the tonic'] });
  return true;
}

/** The bandage is on: every wound stops bleeding (and its clotting has nothing left to do). */
function bandaged(world) {
  const me = world.fighters[0];
  me.bleed = 0;
  me.bleedInside = 0;
  me.bleedOutside = 0;
  say(world, { type: 'toast', text: 'Bleeding stopped' });
  world.events.push({ time: world.time, kind: 'bandaged', fighter: 0, effects: ['the bleeding is stopped'] });
}

// The segments that break at a joint: a hurt limb with that joint broken keeps its hurt.
const SEGMENT_JOINT = { Forearm: 'Elbow', UpperArm: 'Elbow', Shank: 'Knee', Thigh: 'Hip' };

/** A tonic's remaining work: what was to be mended when it was drunk, mended evenly over its seconds. */
function tonicEffect(me) {
  return {
    t: 0,
    seconds: LEVEL_CONFIG.tonic.seconds,
    from: { bloodLost: me.bloodLost ?? 0, concussion: me.concussion, gunshot: me.gunshot ?? 0, damage: { ...me.damage }, trauma: { head: me.trauma?.head ?? 0, trunk: me.trauma?.trunk ?? 0 } },
  };
}

/** Each step: the tonics drunk go on working. */
export function updateTonics(world, dt) {
  const level = levelOf(world);
  const me = world.fighters[0];
  for (let index = level.tonics.length - 1; index >= 0; index -= 1) {
    const effect = level.tonics[index];
    const step = Math.min(dt, effect.seconds - effect.t) / effect.seconds;
    effect.t += dt;
    const { from } = effect;
    if (me.bloodLost) me.bloodLost = Math.max(0, me.bloodLost - from.bloodLost * step);
    me.concussion = Math.max(0, me.concussion - from.concussion * step);
    if (me.gunshot) me.gunshot = Math.max(0, me.gunshot - from.gunshot * step);
    for (const key of Object.keys(me.damage)) {
      const joint = SEGMENT_JOINT[key.replace(/^[lr]/, '')];
      if (joint && me.broken.has(`${key[0]}${joint}`)) continue;
      me.damage[key] = Math.max(0, me.damage[key] - (from.damage[key] ?? 0) * step);
    }
    me.damageVersion += 1;
    for (const key of ['head', 'trunk']) if (me.trauma?.[key]) me.trauma[key] = Math.max(0, me.trauma[key] - from.trauma[key] * step);
    if (effect.t >= effect.seconds) {
      me.knockdowns = 0;
      level.tonics.splice(index, 1);
    }
  }
}

// ---- Things lying about ------------------------------------------------------------------------------------

/**
 * He takes what he finds: a bandage or tonic into the pouch (if it holds more), a key, a note read. Returns
 * whether it was taken (a note is read again whenever he likes: it stays).
 */
export function collectItem(world, item) {
  const level = levelOf(world);
  if (item.kind === 'note') {
    level.notes.add(item.id);
    say(world, { type: 'note', key: item.note ?? item.id, id: item.id });
    return pickedUp(world, item);
  }
  if (item.kind === 'key') {
    level.keys.add(item.id);
    level.taken.add(item.id);
    say(world, { type: 'toast', text: item.label ?? 'You take the key' });
    return pickedUp(world, item);
  }
  if (ITEM_KINDS.includes(item.kind)) {
    if (level.inventory[item.kind] >= LEVEL_CONFIG.cap[item.kind]) {
      say(world, { type: 'toast', text: `You cannot carry more ${item.kind}s` });
      return false;
    }
    level.inventory[item.kind] += 1;
    level.taken.add(item.id);
    say(world, { type: 'toast', text: `${item.kind === 'bandage' ? 'Bandage' : 'Tonic'} taken (${level.inventory[item.kind]})` });
    return pickedUp(world, item);
  }
  return false;
}

/** Heard: a thing taken up (a full pouch takes nothing, and nothing is heard). True: it was taken. */
function pickedUp(world, item) {
  if (world.ear) soundEvent(world, 'mech', { at: item.at, kind: 'pickup', state: 'open', id: item.id });
  return true;
}

/** The height of the floor under the player's feet (m). */
export function feetFloor(me) {
  return Math.min(me.x[P.lFoot * 3 + 1], me.x[P.rFoot * 3 + 1]) - me.body.lengths.ankle;
}
