// The heads he takes (life.js `heads`, runner.js storyHeadsIn): only enemy men he put out himself, each once, added up over
// his battles and written on his page.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storyHeadsIn } from '../src/story/runner.js';

test('heads: his own enemy kills, each man once, read on from where the last call left off', () => {
  const hero = { id: 0, corner: 'red' };
  const fighters = [hero, { id: 1, corner: 'blue' }, { id: 2, corner: 'blue' }, { id: 3, corner: 'red' }];
  const world = { fighters, events: [] };
  const keep = {};
  assert.equal(storyHeadsIn(world, hero, keep), 0);
  world.events.push({ kind: 'killed', fighter: 1, attacker: 0 }, { kind: 'killed', fighter: 2, attacker: 3 }, { kind: 'killed', fighter: 3, attacker: 0 });
  assert.equal(storyHeadsIn(world, hero, keep), 1, 'his own man and another\'s kill do not count');
  world.events.push({ kind: 'killed', fighter: 1, attacker: 0 }, { kind: 'killed', fighter: 2, attacker: 0 });
  assert.equal(storyHeadsIn(world, hero, keep), 2, 'a man finished off again counts once');
});
