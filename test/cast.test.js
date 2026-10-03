import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { STYLE_KEYS } from '../src/moves.js';
import { randomCharacter, varyCharacter } from '../src/cast.js';
import { seededRandom } from '../src/physics.js';
import { headgearOptions } from '../src/outfits.js';

test('every style has a character, dressed for it; the knight and samurai wear their plume and crest', () => {
  for (const style of STYLE_KEYS) assert.ok(Object.values(PRESETS).some((preset) => preset.style === style), style);
  assert.deepEqual(PRESETS.knight.accessories, ['plume']);
  assert.deepEqual(PRESETS.samurai.accessories, ['crest']);
  for (const preset of Object.values(PRESETS)) {
    for (const item of preset.accessories ?? []) assert.ok(headgearOptions(preset.outfit?.kind ?? 'boxing').includes(item), `${preset.name}: ${item}`);
  }
});

test('a team-mate is the lead again, a little different', () => {
  const random = seededRandom(5);
  const lead = PRESETS.samurai;
  const mates = Array.from({ length: 12 }, () => varyCharacter(lead, random));
  for (const mate of mates) {
    assert.equal(mate.style, lead.style);
    assert.equal(mate.outfit.kind, lead.outfit.kind);
    assert.equal(mate.outfit.design, lead.outfit.design);
    assert.deepEqual(mate.accessories, lead.accessories);
    assert.ok(Math.abs(mate.heightCm - lead.heightCm) <= 20);
  }
  assert.ok(new Set(mates.map((mate) => mate.sex)).size === 2, 'some are the other sex');
  assert.ok(new Set(mates.map((mate) => mate.heightCm)).size > 3, 'builds differ');
});

test('the dice make anyone at all', () => {
  const random = seededRandom(9);
  const styles = new Set(Array.from({ length: 30 }, () => randomCharacter(random).style));
  assert.ok(styles.size >= 6, `styles: ${[...styles]}`);
});
