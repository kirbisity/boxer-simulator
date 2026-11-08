import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { WARRIORS } from '../src/roster.js';
import { hasOrigin, originOf, regionsFor, TONE_REGIONS } from '../src/faceregions.js';

// An animal or a machine is never given a people's origin: a gorilla's dark coat must never be read as a human skin tone.
test('no animal or machine has an origin, a face region or a people', () => {
  const everyone = [...Object.values(PRESETS), ...WARRIORS.map((warrior) => warrior.inputs)];
  const beasts = everyone.filter((inputs) => ['gorilla', 'chimp', 'baboon', 'macaque'].includes(inputs.style));
  assert.ok(beasts.length >= 4, 'the primates are in the roster');
  const all = Object.values(TONE_REGIONS).flat();
  for (const inputs of beasts) {
    assert.equal(hasOrigin(inputs), false, inputs.name);
    assert.equal(originOf(inputs, all), null, inputs.name);
    assert.deepEqual(regionsFor(inputs), [], inputs.name);
    assert.equal(originOf({ ...inputs, look: { ...inputs.look, faceRegion: 'africanAmerican' } }, all), null, `${inputs.name}: not even one set by hand`);
  }
  assert.ok(hasOrigin(PRESETS.heavy), 'a man has one');
});
