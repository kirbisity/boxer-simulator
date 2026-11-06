import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { companyFear, seeingField, standingFear, thinkAll } from '../src/ai.js';
import { advance, fillGrid, floorGrid, gridAround, gridNear, seededRandom, spatialGrid } from '../src/physics.js';
import { scenarioWorld } from '../src/scenarios.js';

// Men as the grids read them: only the hips (x, z) matter.
function scatter(count, random, spread) {
  return Array.from({ length: count }, () => {
    const x = new Float64Array(P.pelvis * 3 + 3);
    x[P.pelvis * 3] = (random() - 0.5) * spread;
    x[P.pelvis * 3 + 2] = (random() - 0.5) * spread;
    return { x };
  });
}

test('a kept grid, refilled, finds the same men in the same order as a new spatialGrid', () => {
  const random = seededRandom(3);
  const grid = floorGrid();
  for (const [count, cell] of [[70, 3], [200, 2.5], [12, 6]]) {
    const men = scatter(count, random, 40);
    const fresh = spatialGrid(men.map((man) => [man.x[P.pelvis * 3], man.x[P.pelvis * 3 + 2]]), cell);
    fillGrid(grid, men, cell);
    for (let index = 0; index < count; index += 1) assert.deepEqual([...gridNear(grid, index)], fresh.near(index));
  }
});

test('a look round a point takes in every man within its radius, in index order', () => {
  const random = seededRandom(5);
  const men = scatter(150, random, 50);
  const grid = fillGrid(floorGrid(), men, 6);
  for (const radius of [2.5, 6, 18]) {
    for (let probe = 0; probe < 20; probe += 1) {
      const x = (random() - 0.5) * 50;
      const z = (random() - 0.5) * 50;
      const found = [...gridAround(grid, x, z, radius)];
      assert.deepEqual(found, [...found].sort((a, b) => a - b));
      men.forEach((man, index) => {
        if (Math.hypot(man.x[P.pelvis * 3] - x, man.x[P.pelvis * 3 + 2] - z) <= radius) assert.ok(found.includes(index), `man ${index} within ${radius} m`);
      });
    }
  }
});

test('within a think, the fear of the men round him is what a look at every man finds', () => {
  for (const key of ['legion', 'wokou']) {
    const world = scenarioWorld(key, 2);
    advance(world, 12, (current, dt) => thinkAll(current, dt));
    const everyone = world.fighters.map((fighter) => [companyFear(world, fighter), standingFear(world, fighter)]);
    const gridded = seeingField(world, () => world.fighters.map((fighter) => [companyFear(world, fighter), standingFear(world, fighter)]));
    assert.deepEqual(gridded, everyone, key);
    assert.ok(everyone.some(([company, standing]) => company !== 0 || standing !== 0), `${key}: some fear to compare`);
  }
});
