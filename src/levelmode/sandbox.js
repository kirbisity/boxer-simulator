// Level mode in the sandbox: the player's own character, and the two ways to walk the stage with him.
//   'ghost'  the garrison never notices him, every gate and ladder stands open (a look at the stage; stage.ghost)
//   'real'   the real run: men see and engage him, gates and levers by the real rules, rests, deaths and the whole ending; only fast travel
//            is a cheat (it flags the run) and the ending cards say "Sandbox run" (stage.sandbox)
// His character is kept in the browser (localStorage, as a fighter code), the Forger until he builds another. No DOM here.

import { normaliseInputs } from '../body.js';
import { placeOnFloor } from '../physics.js';
import { levelPreset } from './presets.js';
import { createLevelWorld } from './level.js';
import { mechanismsOf, setMechanism, updateStage } from './stage.js';
import { comradesOf } from './team.js';
import { endingOf } from './ending.js';

export const HERO_KEY = 'boxer.levelPlayer';
const FILE_KINDS = ['gladiator/fighter', 'boxer-simulator/fighter'];

/** The Forger, the story's own man: the character until another is built. */
export const heroDefault = () => levelPreset('forger');

/** A character made fit for a stage: normalised, on foot (there are no horses in a level), named. */
export function heroClean(raw) {
  const inputs = normaliseInputs(structuredClone(raw ?? heroDefault()));
  delete inputs.mounted;
  const name = String(inputs.name ?? '').trim().slice(0, 32);
  inputs.name = name || 'Nameless';
  return inputs;
}

/** A fighter code (the builder's Copy code): the fighter file as base64 JSON. */
export const heroEncode = (inputs) => btoa(unescape(encodeURIComponent(JSON.stringify({ schemaVersion: 2, kind: FILE_KINDS[0], inputs: normaliseInputs(structuredClone(inputs)) }))));

/** The character in a fighter code; throws if it is not one. */
export function heroDecode(code) {
  const file = JSON.parse(decodeURIComponent(escape(atob(String(code).trim()))));
  if (!FILE_KINDS.includes(file.kind) || !file.inputs) throw new Error('not a fighter file');
  return heroClean(file.inputs);
}

/** The character this browser kept, else the Forger. Never throws (storage may be denied or hold anything). */
export function heroLoad(storage) {
  try {
    const code = storage?.getItem(HERO_KEY);
    if (code) return heroDecode(code);
  } catch {
    // Nothing kept, or not readable.
  }
  return heroClean(heroDefault());
}

/** Keep the character; false when the browser would not. */
export function heroSave(storage, inputs) {
  try {
    storage.setItem(HERO_KEY, heroEncode(inputs));
    return true;
  } catch {
    return false;
  }
}

/** Set a stage world up for the sandbox: `mode` 'ghost' or 'real'. Returns the world. */
export function applySandbox(world, mode) {
  world.stage.sandbox = mode;
  world.stage.cheated = false;
  world.stage.ghost = mode === 'ghost';
  if (mode === 'ghost') {
    // Exploring: every gate and door stands open and every ladder is down, so the whole castle can be walked.
    for (const mechanism of mechanismsOf(world.stage.def)) setMechanism(world, mechanism.id, 'open' in mechanism.states ? 'open' : 'down' in mechanism.states ? 'down' : Object.keys(mechanism.states).at(-1));
  }
  return world;
}

/** A stage world for the sandbox with his character in it. */
export function createSandboxWorld(stage, player, { mode = 'ghost', seed = 1 } = {}) {
  return applySandbox(createLevelWorld(stage, heroClean(player), { seed }), mode);
}

/** The places fast travel offers: in a real run the ending's own places are left out (the ending is earned). */
export const sandboxPlaces = (places, mode) => (mode === 'real' ? places.filter((place) => !place.id.startsWith('ending:')) : places);

/** Fast travel: put him (and in a real run his comrades with him) at a place. Flags a real run as cheated. False if not now. */
export function travelTo(world, place) {
  if (!world.stage?.sandbox || !place) return false;
  const me = world.fighters[0];
  const real = world.stage.sandbox === 'real';
  if (real && (me.state === 'out' || world.stage.level?.dying || ['reveal', 'epilogue', 'done'].includes(endingOf(world)?.phase))) return false;
  placeOnFloor(me, place.at[0], place.at[2], place.at[1], place.yaw);
  if (real) {
    world.stage.cheated = true;
    comradesOf(world).filter((fighter) => fighter.state !== 'out').forEach((fighter, index) => {
      const across = (index % 2 ? 1 : -1) * 1.6 * Math.ceil((index + 1) / 2);
      placeOnFloor(fighter, place.at[0] + Math.sin(place.yaw) * across, place.at[2] + Math.cos(place.yaw) * across, place.at[1], place.yaw);
      fighter.dormant = undefined;
    });
  }
  updateStage(world, true);
  return true;
}

/** The words the ending cards add to a sandbox run, else null. */
export const sandboxBadge = (world) => (world.stage?.sandbox ? `Sandbox run · ${world.fighters[0].body.inputs.name}${world.stage.cheated ? ' · fast travel used' : ''}` : null);
