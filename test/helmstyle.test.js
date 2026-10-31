import test from 'node:test';
import assert from 'node:assert/strict';
import { helmStyleFrom, HELM_STYLE, setHelmStyle } from '../src/helmstyle.js';
import { HELM_MAP_DATA } from '../src/helmmaps-data.js';

test('the helmet and mask designs under study are read from the address, now unless asked', () => {
  assert.deepEqual(helmStyleFrom(''), { helmets: 'now', masks: 'now' });
  assert.deepEqual(helmStyleFrom('#helmets=b&masks=ressei'), { helmets: 'b', masks: 'ressei' });
  assert.deepEqual(helmStyleFrom('#maps=off&helmets=c'), { helmets: 'c', masks: 'now' });
  assert.deepEqual(helmStyleFrom('#helmets=z&masks=kabuki'), { helmets: 'now', masks: 'now' });
  assert.deepEqual(HELM_STYLE, { helmets: 'now', masks: 'now' });
  assert.deepEqual(setHelmStyle({ helmets: 'a', masks: 'nope' }), { helmets: 'a', masks: 'now' });
  setHelmStyle({ helmets: 'now' });
});

test('every helmet and mask sheet is baked; a mask carries its mesh relief', () => {
  for (const name of ['helmBrim', 'helmBrimThraex', 'helmBrimMurmillo', 'helmSecutor', 'helmScissor', 'maskOni', 'maskRessei', 'maskTengu']) {
    const sheet = HELM_MAP_DATA[name];
    assert.ok(sheet && sheet.albedo && sheet.normal && sheet.orm, name);
    if (name.startsWith('mask')) assert.equal(sheet.grid.heights.length, sheet.grid.size ** 2, name);
  }
});
