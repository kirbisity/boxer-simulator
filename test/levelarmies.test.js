import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/physics.js';
import { battleOf, SCENARIOS } from '../src/scenarios.js';

test('the wokou garrison is the levy with one or two brigandine regulars among it', () => {
  for (const seed of [1, 5]) {
    const { blue } = SCENARIOS.wokou.cast(seededRandom(seed));
    const brigandine = blue.filter((fighter) => fighter.outfit.kind === 'mingBrigandine').length;
    assert.ok(brigandine >= 1 && brigandine <= 2, `${brigandine} in brigandine`);
    assert.equal(blue.filter((fighter) => fighter.outfit.kind === 'mingGarrison').length, blue.length - brigandine);
  }
});

test('Pyongyang: the Japanese outnumber the Ming; the Ming bring more horse; the same kinds on each side', () => {
  const { red, blue } = battleOf('pyongyang').cast(seededRandom(2));
  assert.ok(blue.length > red.length, `${blue.length} Japanese against ${red.length} Ming`);
  const horse = red.filter((fighter) => fighter.mounted).length;
  assert.ok(horse > 8, `${horse} Ming horse`);
  assert.deepEqual(new Set(red.map((fighter) => fighter.outfit.kind)), new Set(['mingElite', 'mingBrigandine', 'mingIronLamellar']));
  assert.deepEqual(new Set(blue.map((fighter) => fighter.outfit.kind.replace('Tosei', ''))), new Set(['samurai', 'ashigaru']));
});
