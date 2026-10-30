// Armour sense (ai.js AI.armourSense, harmThrough, senseArmour): a trained man picks his blows by what gets through the kit
// of the man in front of him, an untrained one swings as drilled.
// - a longsword's cut lets little through full plate (the edge glances), its thrust more (the gaps); on a bare man both all;
// - an elite facing plate weights his thrusts far over his cuts; facing an unarmoured man, as his style says;
// - an untrained man's weights are his style's whatever the other wears.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { armourSense, harmThrough, senseArmour } from '../src/ai.js';
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

test('a cut lets little through plate, a thrust more (the gaps); on an unarmoured man, all of either', () => {
  const [me, plate] = pair(0.75, knight());
  const [, man] = pair(0.75, bare());
  const cut = harmThrough(me, plate, MOVES.oberhau, 'body');
  const thrust = harmThrough(me, plate, MOVES.lunge, 'body');
  assert.ok(cut < 0.25 && thrust > 1.8 * cut, `through plate: cut ${cut.toFixed(2)}, thrust ${thrust.toFixed(2)}`);
  assert.ok(harmThrough(me, man, MOVES.oberhau, 'body') > 0.95 && harmThrough(me, man, MOVES.lunge, 'body') > 0.95);
});

test('an elite facing plate weights thrusts far over cuts; facing an unarmoured man, as his style says', () => {
  const style = thrustShare(0.75, bare());
  const plate = thrustShare(0.75, knight());
  assert.ok(Math.abs(style - STYLES.longsword.attacks.lunge) < 1e-9, `unarmoured: ${style.toFixed(2)}`);
  assert.ok(plate > 0.75, `on plate: ${plate.toFixed(2)} of his weight on the thrust (style ${style.toFixed(2)})`);
});

test('an untrained man does not read the other\'s kit: his weights are his style\'s', () => {
  const [me] = pair(0.1, knight());
  assert.equal(armourSense(me), 0);
  assert.ok(Math.abs(thrustShare(0.1, knight()) - thrustShare(0.1, bare())) < 1e-9);
});
