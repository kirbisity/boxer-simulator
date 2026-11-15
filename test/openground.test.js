// The lie of the land under the open-air fights (src/env/lie.js): the meadow, the field and Sengoku are fought on as
// their land lies, gently; the physics stands on the same heights the land is drawn with; a ring is not touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENV_LIE, envLieOf } from '../src/env/lie.js';
import { envHeightField } from '../src/env/terrain.js';
import { PLACE_ENV } from '../src/env/config.js';
import { createWorld } from '../src/physics.js';
import { reliefAt, worksOf } from '../src/physics/fieldworks.js';
import { PRESETS } from '../src/body.js';

const FLOORS = { meadow: { halfX: 9, halfZ: 7 }, field: { halfX: 45, halfZ: 30 }, sengoku: { halfX: 11, halfZ: 7 } };

for (const [place, arena] of Object.entries(FLOORS)) {
  test(`${place}: the fight stands on the land as drawn, uneven and gentle`, () => {
    const world = createWorld([{ inputs: structuredClone(PRESETS.heavy), corner: 'red' }, { inputs: structuredClone(PRESETS.light), corner: 'blue' }], { seed: 1, place, arena });
    const works = worksOf(world.arena);
    assert.ok(works?.relief, 'the floor has relief');
    const keepOut = [arena.halfX + 4, arena.halfZ + 4];
    const drawn = envHeightField(PLACE_ENV[place].terrain, keepOut, envLieOf(place, arena));
    let [low, high, steepest] = [Infinity, -Infinity, 0];
    const step = 0.5;
    for (let x = -arena.halfX; x <= arena.halfX; x += step) {
      for (let z = -arena.halfZ; z <= arena.halfZ; z += step) {
        const y = reliefAt(works, x, z);
        assert.ok(Math.abs(drawn(x, z) - y) < 1e-9, `drawn and stood on agree at [${x}, ${z}]`);
        [low, high] = [Math.min(low, y), Math.max(high, y)];
        steepest = Math.max(steepest, Math.hypot(reliefAt(works, x + step, z) - y, reliefAt(works, x, z + step) - y) / step);
      }
    }
    assert.ok(high - low > 0.15, `not a levelled patch (${(high - low).toFixed(2)} m)`);
    assert.ok(steepest < 0.2, `gentle: steepest grade ${steepest.toFixed(3)}`);
  });
}

test('a ring and a place with no land of its own stay level', () => {
  assert.equal(envLieOf('meadow', { halfX: 4, halfZ: 4, ring: true }), null);
  assert.equal(envLieOf('colosseum', { halfX: 6.5, halfZ: 4.4 }), null);
  const world = createWorld([{ inputs: structuredClone(PRESETS.heavy), corner: 'red' }, { inputs: structuredClone(PRESETS.light), corner: 'blue' }], { seed: 1 });
  assert.equal(worksOf(world.arena), null);
  assert.ok(ENV_LIE.fought > 0 && ENV_LIE.fought < 1);
});
