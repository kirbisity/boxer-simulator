import test from 'node:test';
import assert from 'node:assert/strict';
import { helmStyleFrom, HELM_STYLE, setHelmStyle } from '../src/helmstyle.js';
import { HELM_MAP_DATA } from '../src/helmmaps-data.js';
import { HELM_FORMS } from '../src/helmforms.js';

test('the helmets are the remodelled ones unless the address asks for the old; the masks as they were unless asked', () => {
  assert.deepEqual(helmStyleFrom(''), { helmets: 'new', masks: 'now', kettle: 'now' });
  assert.deepEqual(helmStyleFrom('#helmets=now&masks=ressei&kettle=b'), { helmets: 'now', masks: 'ressei', kettle: 'b' });
  assert.deepEqual(helmStyleFrom('#maps=off&helmets=now'), { helmets: 'now', masks: 'now', kettle: 'now' });
  assert.deepEqual(helmStyleFrom('#helmets=b&masks=kabuki&kettle=x'), { helmets: 'new', masks: 'now', kettle: 'now' });
  assert.deepEqual(HELM_STYLE, { helmets: 'new', masks: 'now', kettle: 'now' });
  assert.deepEqual(setHelmStyle({ helmets: 'now', masks: 'nope', kettle: 'd' }), { helmets: 'now', masks: 'now', kettle: 'd' });
  setHelmStyle({ helmets: 'new', kettle: 'now' });
});

test('every helmet kind and mask has its sheet baked; a mask carries its mesh relief', () => {
  const sheets = [...Object.values(HELM_FORMS).map((form) => form.sheet), 'maskOni', 'maskRessei', 'maskTengu'];
  for (const name of sheets) {
    const sheet = HELM_MAP_DATA[name];
    assert.ok(sheet && sheet.albedo && sheet.normal && sheet.orm, name);
    if (name.startsWith('mask')) assert.equal(sheet.grid.heights.length, sheet.grid.size ** 2, name);
  }
});
