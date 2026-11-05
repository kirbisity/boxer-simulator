import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { centreOut, createWorld } from '../src/physics.js';

test('a team with no order of its own forms on its lead: him in the middle, the rest out from him in turn', () => {
  const line = (count) => {
    const places = Array(count);
    for (let index = 0; index < count; index += 1) places[centreOut(index, count)] = index + 1;
    return places.join(' ');
  };
  assert.equal(line(6), '6 4 2 1 3 5');
  assert.equal(line(5), '4 2 1 3 5');
  assert.equal(line(1), '1');
  const team = Array.from({ length: 5 }, () => ({ inputs: structuredClone(PRESETS.light), corner: 'red' }));
  const world = createWorld([...team, { inputs: structuredClone(PRESETS.heavy), corner: 'blue' }], { seed: 1 });
  const across = world.fighters.filter((fighter) => fighter.corner === 'red').map((fighter) => fighter.root[1]);
  const middle = [...across].sort((a, b) => a - b)[2];
  assert.ok(Math.abs(across[0] - middle) < 1e-6, `the lead in the middle: ${across.map((z) => z.toFixed(2)).join(', ')}`);
});
