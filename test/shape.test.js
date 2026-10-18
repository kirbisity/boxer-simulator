import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, seededRandom } from '../src/physics.js';
import { SCENARIOS } from '../src/scenarios.js';

// The engine reads fighters hundreds of thousands of times a second. Fighters that gain fields in
// their own order each become a different shape of object, and in a crowd every read slows to a
// crawl (a hundred men ran nearly twice as slow). createFighter names every field a fight adds,
// so that all fighters keep one shape; a field added without being named there shows up here.
test('fighters in a big battle all keep one shape', () => {
  const scenario = SCENARIOS.legion;
  const cast = scenario.cast(seededRandom(7));
  const world = createWorld([...cast.red.map((inputs) => ({ inputs, corner: 'red' })), ...cast.blue.map((inputs) => ({ inputs, corner: 'blue' }))], { seed: 7, arena: scenario.arena, formation: scenario.formation });
  advance(world, 25, (current, dt) => thinkAll(current, dt));
  const shapes = new Set(world.fighters.map((fighter) => Object.keys(fighter).join()));
  assert.equal(shapes.size, 1, `${shapes.size} shapes of fighter`);
});
