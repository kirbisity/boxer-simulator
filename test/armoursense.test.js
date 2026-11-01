// Armour sense (ai.js AI.armourSense, harmThrough, senseArmour): a trained man picks his blows by what gets through the kit
// of the man in front of him, an untrained one swings as drilled.
// - an untrained man's weights are his style's whatever the other wears.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { armourSense, senseArmour } from '../src/ai.js';
import { MOVES, STYLES } from '../src/moves.js';
import { createWorld } from '../src/physics.js';

const bare = (skill = 0.75) => ({ ...structuredClone(PRESETS.knight), outfit: { kind: 'casual', design: 0 }, accessories: [], skill });
const knight = (skill = 0.75) => ({ ...structuredClone(PRESETS.knight), skill });

/** A knight-swordsman at `skill` and the man he faces. */
function pair(skill, him) {
  const world = createWorld([{ inputs: knight(skill), corner: 'red' }, { inputs: him, corner: 'blue' }], { seed: 1 });
  return world.fighters;
}

/** The share of his style's attack weight on thrusts, after his armour sense, against `him`. */
function thrustShare(skill, him) {
  const [me, other] = pair(skill, him);
  const choices = { ...STYLES.longsword.attacks };
  senseArmour(me, other, choices);
  const total = Object.values(choices).reduce((sum, weight) => sum + weight, 0);
  return Object.entries(choices).reduce((sum, [name, weight]) => sum + (MOVES[name].mode === 'thrust' ? weight : 0), 0) / total;
}

test('an untrained man does not read the other\'s kit: his weights are his style\'s', () => {
  const [me] = pair(0.1, knight());
  assert.equal(armourSense(me), 0);
  assert.ok(Math.abs(thrustShare(0.1, knight()) - thrustShare(0.1, bare())) < 1e-9);
});
