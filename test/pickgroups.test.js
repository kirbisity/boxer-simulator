import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_STYLE_KEYS } from '../src/moves.js';
import { WARRIORS } from '../src/roster.js';
import { builderCharacters, WEAPON_KINDS, weaponCategoryOf } from '../src/pickgroups.js';
import { UI } from '../src/i18n/ui.js';

test('every style the builder offers falls under one kind of weapon, and each kind has words in both languages', () => {
  const kinds = new Set(WEAPON_KINDS.map((kind) => kind.key));
  for (const key of CUSTOM_STYLE_KEYS) assert.ok(kinds.has(weaponCategoryOf(key)), key);
  for (const kind of kinds) assert.ok(UI[`builder.kind.${kind}`]?.en && UI[`builder.kind.${kind}`]?.zh, kind);
  assert.equal(weaponCategoryOf('boxing'), 'bare');
  assert.equal(weaponCategoryOf('chimp'), 'beast');
  assert.equal(weaponCategoryOf('katana'), 'sword');
  assert.equal(weaponCategoryOf('pike'), 'polearm');
  assert.equal(weaponCategoryOf('warhammer'), 'blunt');
  assert.equal(weaponCategoryOf('crossbow'), 'bow');
  assert.equal(weaponCategoryOf('matchlock'), 'firearm');
});

test('the builder offers every warrior of the roster, once, under his faction', () => {
  const characters = builderCharacters();
  const names = characters.map((character) => character.name);
  assert.equal(new Set(names).size, names.length);
  for (const warrior of WARRIORS) assert.ok(names.includes(warrior.inputs.name), warrior.inputs.name);
  for (const character of characters) assert.ok(character.faction, character.name);
});
