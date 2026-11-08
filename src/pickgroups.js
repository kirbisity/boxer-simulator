// The builder's two-step pickers: a faction, then a character in it; a kind of weapon, then a style that fights with it.
// Each style's kind is read from its weapon's own data (what it shoots, what its blows do), never listed by hand, so a
// new style lands in its group by itself.

import { PRESETS } from './body.js';
import { STYLES } from './moves.js';
import { factionOf } from './outfits.js';
import { WARRIORS } from './roster.js';
import { WEAPONS } from './weapons.js';

/** The kinds of weapon, in the order the picker offers them (their words: builder.kind.<key>, src/i18n/ui-builder.js). */
export const WEAPON_KINDS = ['bare', 'beast', 'sword', 'polearm', 'blunt', 'bow', 'firearm'].map((key) => ({ key }));

/** Whether a weapon's swing does more blunt harm than cutting harm (a club, a mace, a staff, a whip). */
const bluntSwing = (weapon) => (weapon.harm?.swing?.blunt ?? 0) > (weapon.harm?.swing?.cut ?? 0);

/** A style's kind of weapon (a WEAPON_KINDS key). */
export function weaponCategoryOf(styleKey) {
  const style = STYLES[styleKey];
  const weapon = WEAPONS[style?.weapon];
  // Unarmed: an animal fights with its teeth too.
  if (!weapon) return style?.bite ? 'beast' : 'bare';
  if (weapon.ranged) return weapon.bow || weapon.shot?.bolt ? 'bow' : 'firearm';
  // Spear thrusts and the great wheeling blades (the naginata, the guandao) are fought from a long shaft.
  if (weapon.art === 'artSpear' || weapon.art === 'artWheel') return 'polearm';
  return bluntSwing(weapon) ? 'blunt' : 'sword';
}

/**
 * Every character the builder offers: the presets, and the roster's warriors that are not presets (each a key, its
 * name, its faction and its inputs). A warrior's key is `warrior:<key>` so it cannot meet a preset's.
 */
export function builderCharacters() {
  const characters = Object.entries(PRESETS).map(([key, inputs]) => ({ key, name: inputs.name, faction: factionOf(inputs), inputs }));
  const named = new Set(characters.map((character) => character.name));
  for (const warrior of WARRIORS) {
    if (named.has(warrior.inputs.name)) continue;
    named.add(warrior.inputs.name);
    characters.push({ key: `warrior:${warrior.key}`, name: warrior.inputs.name, faction: warrior.faction, inputs: warrior.inputs });
  }
  return characters;
}
