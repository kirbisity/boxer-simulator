// A crowd man's helmet knocked off mid-fight used to bake a bare-headed template on that frame (9-26 ms, frames of 50-116 ms in a
// legion battle). His template now carries both heads (crowdview.js HEAD_VARIANT), and his own index swaps one for the other
// (render.js bareCrowdHead). Checked here: the far body keeps the two heads apart, the split partitions an index, and the wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BONE } from '../src/rig.js';
import { HEAD_VARIANT, onlyVariant, simplifyTemplate, withoutVariant } from '../src/crowdview.js';

const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

/** A small sheet three times over, as the skin, the helmet and the hair under it, all one colour. */
function headTemplate() {
  const position = [];
  const normal = [];
  const skin = [];
  const colors = [];
  const variant = [];
  const indices = [];
  for (const kind of [HEAD_VARIANT.always, HEAD_VARIANT.helmed, HEAD_VARIANT.bare]) {
    const base = position.length / 3;
    for (let row = 0; row <= 6; row += 1) {
      for (let column = 0; column <= 6; column += 1) {
        position.push(column * 0.01, 1.6 + row * 0.01, 0);
        normal.push(0, 0, 1);
        skin.push(BONE.chest, 0, 0, 0);
        colors.push(0.3, 0.3, 0.3);
        variant.push(kind);
      }
    }
    for (let row = 0; row < 6; row += 1) {
      for (let column = 0; column < 6; column += 1) {
        const a = base + row * 7 + column;
        indices.push(a, a + 1, a + 8, a, a + 8, a + 7);
      }
    }
  }
  const count = position.length / 3;
  return {
    attributes: {
      position: { array: Float32Array.from(position) },
      normal: { array: Float32Array.from(normal) },
      skinIndex: { array: Uint16Array.from(skin) },
      skinWeight: { array: Float32Array.from({ length: count * 4 }, (_, slot) => (slot % 4 === 0 ? 1 : 0)) },
    },
    colors: Float32Array.from(colors),
    variant: Uint8Array.from(variant),
    bodyIndex: Uint32Array.from(indices),
    steelIndex: new Uint32Array(0),
    bodyOutlineIndex: Uint32Array.from(indices),
    steelOutlineIndex: new Uint32Array(0),
    vertexSegment: new Array(count).fill(null),
  };
}

const variantsOf = (indices, variant) => {
  const seen = new Set();
  for (let corner = 0; corner < indices.length; corner += 3) {
    const kinds = new Set([0, 1, 2].map((offset) => variant[indices[corner + offset]]));
    assert.equal(kinds.size, 1, 'no triangle spans two heads');
    seen.add([...kinds][0]);
  }
  return [...seen].sort();
};

test('the far body keeps the helmet and the hair under it apart, though they lie in the same cells in the same colour', () => {
  const template = headTemplate();
  const far = simplifyTemplate(template, { cell: 0.02, colorStep: 0.12, facings: 6 });
  assert.equal(far.variant.length, far.vertices);
  assert.deepEqual(variantsOf(far.bodyIndex, far.variant), [0, 1, 2]);
  // Without the variants the three sheets would merge into one.
  const merged = simplifyTemplate({ ...template, variant: undefined }, { cell: 0.02, colorStep: 0.12, facings: 6 });
  assert.equal(merged.variant, null);
  assert.ok(merged.vertices * 3 === far.vertices);
});

test('a man helmed draws all but the bare head; bare-headed, all but the helmet; the two together are the whole', () => {
  const template = headTemplate();
  const helmed = withoutVariant(template.bodyIndex, template.variant, HEAD_VARIANT.bare);
  const bareOnly = onlyVariant(template.bodyIndex, template.variant, HEAD_VARIANT.bare);
  assert.deepEqual(variantsOf(helmed, template.variant), [0, 1]);
  assert.deepEqual(variantsOf(bareOnly, template.variant), [2]);
  assert.equal(helmed.length + bareOnly.length, template.bodyIndex.length);
  // The helmet knocked off (render.js bareIndex): his index without the helmet, the bare head added.
  const bare = [...withoutVariant(helmed, template.variant, HEAD_VARIANT.helmed), ...bareOnly];
  assert.deepEqual(variantsOf(Uint32Array.from(bare), template.variant), [0, 2]);
  assert.equal(bare.length, (template.bodyIndex.length / 3) * 2);
});

test('a helmet knocked off a crowd man swaps his index, nothing baked; his template is baked with both heads', () => {
  const main = source('main.js');
  const handled = main.slice(main.indexOf("if (event.kind === 'accessory' && event.helmet)"));
  assert.match(handled.slice(0, 300), /if \(view\?\.baked && !bareCrowdHead\(view\)\) rebuildFighterView\(event\.fighter\);/);
  const render = source('render.js');
  const bake = render.slice(render.indexOf('function bakeCrowdTemplate'), render.indexOf('function farTemplate'));
  assert.match(bake, /splitHeads\(template\);\s*splitHeads\(template\.far\);/);
  const detailed = render.slice(render.indexOf('function detailedView'), render.indexOf('function headVariant'));
  assert.match(detailed, /headVariant\(headgear\.group, 'helmed'\)/, 'the helmet marked');
  assert.match(detailed, /mesh\.userData\.crowdVariant = 'bare'/, 'the hair it hid marked, and baked');
  assert.match(detailed, /headVariant\(hairCurtain\([^)]*\)\.group, 'bare'\)/, 'long hair hung under a helmet too, marked');
});
