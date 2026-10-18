// Level mode, loot: a dead man's weapon or shield (taken as any weapon off the floor is: the stoop, the
// style that goes with the weapon), and his whole outfit, a timed action that makes the operative over
// in the dead man's harness with his own wounds, blood and bones as they are.

import { P } from '../body.js';
import { reclothe } from '../physics.js';
import { OUTFITS } from '../outfits.js';
import { handling } from '../handling.js';
import { WEAPONS } from '../weapons.js';
import { LEVEL_CONFIG } from './config.js';
import { beginAction, feetFloor, levelOf, say } from './items.js';

/** The same outfit? (kind, design, colours, headgear) */
function sameKit(a, b) {
  return JSON.stringify([a.outfit, a.accessories ?? []]) === JSON.stringify([b.outfit, b.accessories ?? []]);
}

/** Loose weapons and shields within reach that he could take up: [{ debris, distance }]. */
export function looseWithin(world, me, reach, height) {
  const at = [me.x[P.pelvis * 3], me.x[P.pelvis * 3 + 2]];
  const floor = feetFloor(me);
  const found = [];
  for (const debris of world.debris) {
    if (debris.taken || !debris.resting || !debris.x) continue;
    if (debris.kind === 'weapon') {
      const spec = WEAPONS[debris.weapon];
      if (!spec || spec.flag || me.body.gear.unarmed || !handling(me.body, spec).canHold) continue;
      if (me.weapon?.held && me.weapon.kind === debris.weapon) continue;
    } else if (debris.kind === 'shield') {
      if (me.shield?.kind === debris.shield) continue;
    } else continue;
    const distance = Math.hypot(debris.x[0] - at[0], debris.x[2] - at[1]);
    if (distance <= reach && Math.abs(debris.x[1] - floor) <= height + 0.5) found.push({ debris, distance });
  }
  return found;
}

/** Bodies within reach whose outfit is not the player's: [{ dead, distance }]. */
export function bodiesWithin(world, me, reach, height) {
  const at = [me.x[P.pelvis * 3], me.x[P.pelvis * 3 + 2]];
  const floor = feetFloor(me);
  const found = [];
  for (const dead of world.fighters) {
    if (dead === me || dead.state !== 'out' || dead.dormant) continue;
    const distance = Math.hypot(dead.x[P.pelvis * 3] - at[0], dead.x[P.pelvis * 3 + 2] - at[1]);
    if (distance > reach || Math.abs(dead.x[P.pelvis * 3 + 1] - floor) > height + 1) continue;
    if (sameKit(dead.body.inputs, me.body.inputs)) continue;
    found.push({ dead, distance });
  }
  return found;
}

/**
 * Take up a loose weapon or shield: he goes to it and stoops, the existing pickup (physics startPickup, with
 * `swap`: what he holds of that kind is let fall for it), and his style follows the weapon. True if begun.
 */
export function takeLoose(world, debris) {
  const me = world.fighters[0];
  if (me.state !== 'up' || me.pickup || levelOf(world).action) return false;
  me.orderPickup = debris.id;
  return true;
}

/** Begin changing into a dead man's outfit (a timed action); true if begun. */
export function takeOutfit(world, dead) {
  return beginAction(world, { kind: 'outfit', label: 'Changing', seconds: LEVEL_CONFIG.loot.outfitSeconds, done: (done) => swapOutfits(done, dead) });
}

/**
 * The operative put into the dead man's outfit (kind, design, colours, headgear), and the dead man into
 * his: bodies and views made again; wounds, blood, bones and weapon stay as they were.
 */
export function swapOutfits(world, dead) {
  const me = world.fighters[0];
  const level = levelOf(world);
  if (dead.state !== 'out') return false;
  const mine = me.body.inputs;
  const theirs = dead.body.inputs;
  reclothe(world, me, { ...mine, outfit: structuredClone(theirs.outfit), accessories: [...(theirs.accessories ?? [])] });
  reclothe(world, dead, { ...theirs, outfit: structuredClone(mine.outfit), accessories: [...(mine.accessories ?? [])] });
  level.rebuild.add(0);
  level.rebuild.add(dead.id);
  world.events.push({ time: world.time, kind: 'changed', fighter: 0, effects: [`puts on ${theirs.name}'s ${outfitName(theirs)}`] });
  say(world, { type: 'toast', text: `You put on the ${outfitName(theirs)}` });
  return true;
}

/** An outfit in words ("Levy — quilted jack" gives "quilted jack": the kit's label after its dash). */
function outfitName(inputs) {
  const label = OUTFITS[inputs.outfit?.kind]?.label ?? 'clothes';
  return (label.split('—')[1] ?? label).trim().toLowerCase();
}
