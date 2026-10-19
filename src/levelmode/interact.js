// Level mode, the context button: what the player can do where he stands. `interactions(world)` lists what
// is within reach, nearest first (items, lying weapons and shields, a dead man's outfit, levers, gates,
// ladders, rest points, notes, cell doors); `contextFor` is the one the button offers: the nearest, and only
// if no awake enemy aware of him is within the hostile range. `interact` does it.
//
// Stage data it reads (all optional, see stage.js for the rest):
//   section.items:   [{ id, kind: 'bandage' | 'tonic' | 'note' | 'key', at: [x, y, z], note?: NOTES key (default: the id), label? }]
//   section.rest:    { at: [x, y, z], id?, name? }
//   section.levers:  [{ id, at, target, state, label? }]        pulled from within `leverReach` of `at`
//   section.gates:   [{ id, at, ..., opensFrom?: region, key?: item id, frees?: [spawn ids], label? }]
//                    opened by hand from anywhere within `mechanismReach` of the gate's leaf (its whole width, not one point), only from
//                    within `opensFrom` (a region, as stage.js's; none: from anywhere near) and with the key (an item id the player holds);
//                    `frees`: prisoners let out when it opens. A gate with none of these is worked by a lever only.
//   section.ladders: [{ id, at, ..., kickFrom?: region }]        kicked down from within `mechanismReach` of the ladder, from within `kickFrom`

import { P } from '../body.js';
import { LEVEL_CONFIG } from './config.js';
import { collectItem, feetFloor, levelOf, say } from './items.js';
import { bodiesWithin, looseWithin, takeLoose, takeOutfit } from './loot.js';
import { restAtPoint, playerStands } from './checkpoints.js';
import { levelAware, levelFreePrisoner } from './adapter.js';
import { pullLever, regionContains, setMechanism } from './stage.js';

/** An awake enemy aware of the player, within `range` m (the context button hides while one is). */
export function hostileNear(world, range = LEVEL_CONFIG.interact.hostileRange) {
  const me = world.fighters[0];
  const at = [me.x[P.pelvis * 3], me.x[P.pelvis * 3 + 2]];
  return world.fighters.some((fighter) => fighter.corner === 'blue' && fighter.state !== 'out' && !fighter.dormant
    && Math.hypot(fighter.x[P.pelvis * 3] - at[0], fighter.x[P.pelvis * 3 + 2] - at[1]) <= range && levelAware(world, fighter));
}

/** A thing in the section lists at a point: its distance from the player if within reach on the floor and in height. */
function nearAt(me, at, reach = LEVEL_CONFIG.interact.reach) {
  const { height } = LEVEL_CONFIG.interact;
  const distance = Math.hypot(at[0] - me.x[P.pelvis * 3], at[2] - me.x[P.pelvis * 3 + 2]);
  return distance <= reach && Math.abs(at[1] - feetFloor(me)) <= height ? distance : null;
}

/**
 * How far the player is from a gate or ladder: the nearest point of its leaf (the first solid of its closed or raised state: a
 * wall, a rectangle turned by its yaw) when it has one, else its `at` point; null if it is a storey away. A door is a thing
 * as wide as its opening, so the button is offered along all of it and a few metres out, not at one spot in front of it.
 */
function mechanismDistance(me, mechanism) {
  const { height } = LEVEL_CONFIG.interact;
  const x = me.x[P.pelvis * 3];
  const z = me.x[P.pelvis * 3 + 2];
  if (Math.abs(mechanism.at[1] - feetFloor(me)) > height) return null;
  const leaf = (mechanism.states.closed ?? mechanism.states.up ?? [])[0];
  if (!leaf?.size) return Math.hypot(mechanism.at[0] - x, mechanism.at[2] - z);
  const yaw = leaf.yaw ?? 0;
  const dx = x - leaf.at[0];
  const dz = z - leaf.at[1];
  const u = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const v = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  return Math.hypot(Math.max(Math.abs(u) - leaf.size[0] / 2, 0), Math.max(Math.abs(v) - leaf.size[1] / 2, 0));
}

const ITEM_LABEL = { bandage: 'Take bandage', tonic: 'Take tonic', key: 'Take key', note: 'Read note' };
const ITEM_ICON = { bandage: 'bandage', tonic: 'tonic', key: 'key', note: 'note' };

/**
 * Everything he could do from here, nearest first: [{ id, kind, label, icon, distance, disabled?, run }].
 * `kind`: item | weapon | shield | outfit | lever | gate | ladder | rest. `run(world)` does it (true if done).
 * Not offered at all if he is not on his feet or is at some other work.
 */
export function interactions(world) {
  const level = levelOf(world);
  const me = world.fighters[0];
  if (me.state !== 'up' || level.action || me.pickup || level.dying) return [];
  const here = playerStands(me);
  const found = [];
  const stage = world.stage;
  for (const section of stage.def.sections) {
    if (!stage.active.includes(section.id)) continue;
    for (const item of section.items ?? []) {
      if (level.taken.has(item.id)) continue;
      const distance = nearAt(me, item.at);
      if (distance !== null) found.push({ id: `item:${item.id}`, kind: 'item', label: item.label ?? ITEM_LABEL[item.kind] ?? 'Pick up', icon: ITEM_ICON[item.kind] ?? 'hand', distance, run: (w) => collectItem(w, item) });
    }
    for (const lever of section.levers ?? []) {
      if (stage.mechanisms[lever.target] === lever.state) continue;
      const distance = nearAt(me, lever.at, LEVEL_CONFIG.interact.leverReach);
      if (distance !== null) found.push({ id: `lever:${lever.id}`, kind: 'lever', label: lever.label ?? 'Pull lever', icon: 'lever', distance, run: (w) => { level.pulled.add(lever.id); say(w, { type: 'toast', text: 'The lever grinds over' }); return pullLever(w, lever.id); } });
    }
    for (const gate of section.gates ?? []) {
      if (!gate.opensFrom && !gate.key) continue;
      if (stage.mechanisms[gate.id] === 'open') continue;
      const distance = mechanismDistance(me, gate);
      if (distance === null || distance > LEVEL_CONFIG.interact.mechanismReach || (gate.opensFrom && !regionContains(gate.opensFrom, here[0], here[2], me.x[P.pelvis * 3 + 1]))) continue;
      const locked = gate.key && !level.keys.has(gate.key);
      found.push({
        id: `gate:${gate.id}`, kind: 'gate', label: locked ? 'Locked' : gate.label ?? (gate.key ? 'Unlock' : 'Open gate'), icon: locked ? 'lock' : 'gate', distance, disabled: Boolean(locked),
        run: (w) => {
          if (locked) {
            say(w, { type: 'toast', text: gate.lockedText ?? 'It is locked. The key is somewhere in this place.' });
            return false;
          }
          return openGate(w, gate);
        },
      });
    }
    for (const ladder of section.ladders ?? []) {
      if (!ladder.kickFrom || stage.mechanisms[ladder.id] === 'down') continue;
      const distance = mechanismDistance(me, ladder);
      if (distance === null || distance > LEVEL_CONFIG.interact.mechanismReach || !regionContains(ladder.kickFrom, here[0], here[2], me.x[P.pelvis * 3 + 1])) continue;
      found.push({ id: `ladder:${ladder.id}`, kind: 'ladder', label: ladder.label ?? 'Kick ladder down', icon: 'ladder', distance, run: (w) => { say(w, { type: 'toast', text: 'The ladder crashes down' }); return setMechanism(w, ladder.id, 'down'); } });
    }
    if (section.rest) {
      const distance = nearAt(me, section.rest.at);
      if (distance !== null) found.push({ id: `rest:${section.rest.id ?? section.id}`, kind: 'rest', label: 'Rest', icon: 'rest', distance, run: (w) => restAtPoint(w, { id: section.rest.id ?? section.id, at: section.rest.at, name: section.rest.name ?? section.name }) });
    }
  }
  const { reach, height, bodyHeight } = LEVEL_CONFIG.interact;
  for (const { debris, distance } of looseWithin(world, me, reach, height)) {
    const shield = debris.kind === 'shield';
    found.push({ id: `${shield ? 'shield' : 'weapon'}:${debris.id}`, kind: shield ? 'shield' : 'weapon', label: shield ? 'Take shield' : 'Take weapon', icon: shield ? 'shield' : 'weapon', distance, run: (w) => takeLoose(w, debris) });
  }
  for (const { dead, distance } of bodiesWithin(world, me, reach, bodyHeight)) {
    found.push({ id: `outfit:${dead.id}`, kind: 'outfit', label: 'Take outfit', icon: 'outfit', distance, run: (w) => takeOutfit(w, dead) });
  }
  return found.sort((a, b) => a.distance - b.distance);
}

/** The one thing the button offers now, or null (nothing near, or an enemy too near to stop for it). */
export function contextFor(world) {
  if (!world.stage?.level) return null;
  const list = interactions(world);
  if (!list.length || hostileNear(world)) return null;
  return list[0];
}

/** Do what the button offers (or `choice`). True if something was done. */
export function interact(world, choice = contextFor(world)) {
  return Boolean(choice) && choice.run(world) !== false;
}

/** A gate opened by hand: its state goes to 'open', the prisoners it frees are let out. */
function openGate(world, gate) {
  const level = levelOf(world);
  setMechanism(world, gate.id, 'open');
  level.opened.add(gate.id);
  for (const id of gate.frees ?? []) if (levelFreePrisoner(world, id)) level.freed.add(id);
  say(world, { type: 'toast', text: gate.frees?.length ? 'The door swings open' : 'The gate swings open' });
  return true;
}
