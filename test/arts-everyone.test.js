import test from 'node:test';
import assert from 'node:assert/strict';
import { MOVES, STYLES } from '../src/moves.js';
import { WEAPONS } from '../src/weapons.js';

// Every hand-to-hand weapon and every unarmed fighting style has a weapon art (weaponarts.js); guns and bows do not.
test('weapon arts: every hand-to-hand weapon and unarmed style has one; no gun or bow', () => {
  for (const [kind, spec] of Object.entries(WEAPONS)) {
    const ranged = spec.ranged || spec.shot || spec.bow;
    if (ranged) assert.equal(spec.art, undefined, `${kind} is ranged`);
    else assert.ok(MOVES[spec.art]?.art, `${kind} has an art`);
  }
  const animals = new Set(['passive', 'dogRam', 'dogGrip']);
  for (const [key, style] of Object.entries(STYLES)) {
    if (style.weapon || animals.has(key)) continue;
    assert.ok(MOVES[style.art]?.art, `${key} has an art`);
  }
});
