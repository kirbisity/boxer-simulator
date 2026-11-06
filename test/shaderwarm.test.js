// A program first needed mid-fight is built on that frame, and the page stalls for it (8-31 ms on an M1 Pro). Two such were found in
// battles and are now built before the fight (render.js warmSevered, warmWorn): a piece cut off a man (his material, unskinned) and
// what a crowd man wears when it is knocked off (drawn alone in its own materials). The cut and its warmer must ask for the same
// program: both make the material with toon.js unskinnedCopy. The wiring is checked in the source (render.js needs a browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('a cut piece and its warmer make their material the same way', async () => {
  const { unskinnedCopy } = await import('../src/toon.js');
  const original = { skinning: true, needsUpdate: false, vertexColors: true, clone() { return { ...this, clone: this.clone }; } };
  const copy = unskinnedCopy(original);
  assert.notEqual(copy, original, 'a copy, so the body keeps its skinned material');
  assert.equal(copy.skinning, false);
  assert.equal(copy.needsUpdate, true);
  assert.equal(original.skinning, true);
  assert.equal(copy.vertexColors, true, 'all else as it was');
  assert.match(source('weaponview.js'), /new THREE\.Mesh\(lifted, unskinnedCopy\(mesh\.material\)\)/, 'liftTriangles uses it');
  assert.match(source('render.js'), /warmMaterials\(view, materials, unskinnedCopy\)/, 'warmSevered uses it');
});

test('the fight warms its men every frame before drawing, and a crowd template warms what can be knocked off it', () => {
  const main = source('main.js');
  const warm = main.indexOf('warmSevered(scene, state.views);');
  assert.ok(warm > 0 && warm < main.indexOf('if (drawIt) render(scene);'), 'before the frame is drawn');
  const render = source('render.js');
  const bake = render.slice(render.indexOf('function bakeCrowdTemplate'));
  assert.match(bake.slice(0, 1500), /warmWorn\(view, \[full\.group, \.\.\.full\.headProps\.map\(\(prop\) => prop\.loose\)\]\)/);
});
