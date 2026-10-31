// The cloth detail maps (detailmaps.js CLOTH_*, detailtex.js clothDetailMaterial): every outfit's textiles and organics in one
// atlas of tiles baked in Blender, each garment's material looked up by what it is; `#maps=off` drawing them as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRESETS, buildBody } from '../src/body.js';
import { buildLoftBody } from '../src/loftbody.js';
import {
  CLOTH_BAND, CLOTH_FAMILIES, CLOTH_FLAT_CELL, CLOTH_GARMENTS, CLOTH_MATERIALS, CLOTH_ROLES, DETAIL_MAPS, clothCellOf, clothFamilyOf, clothMaterialOf, detailKindOf,
} from '../src/detailmaps.js';
import { CLOTH_MAP_DATA } from '../src/clothmaps-data.js';
import { OUTFITS, factionOf } from '../src/outfits.js';

const context = (kind) => ({ faction: OUTFITS[kind].faction ?? 'ring', outfit: kind });

function withMaps(on, run) {
  const was = DETAIL_MAPS.on;
  DETAIL_MAPS.on = on;
  try {
    return run();
  } finally {
    DETAIL_MAPS.on = was;
  }
}

/** A built body's triangles by the cloth cell they carry. */
function clothCells(built) {
  const cells = {};
  for (let triangle = 0; triangle < built.indices.length / 3; triangle += 1) {
    const vertex = built.indices[triangle * 3];
    const cell = built.uvs ? clothCellOf(built.uvs[vertex * 2], built.uvs[vertex * 2 + 1]) : null;
    if (cell !== null) cells[cell] = (cells[cell] ?? 0) + 1;
  }
  return cells;
}

test('every slot kind and armour kind any outfit wears is in the tables, and every material is a family or explicitly none', () => {
  for (const [kind, spec] of Object.entries(OUTFITS)) {
    for (const [index, look] of spec.designs.entries()) {
      for (const slot of ['top', 'bottom', 'feet', 'femaleFeet', 'head']) {
        const worn = look[slot]?.kind;
        if (!worn) continue;
        const table = CLOTH_GARMENTS[slot === 'femaleFeet' ? 'feet' : slot];
        assert.ok(worn in table, `${kind} ${index}: ${slot} ${worn} has no material`);
      }
      if (look.armor?.kind) assert.ok(CLOTH_GARMENTS.armor[look.armor.kind], `${kind} ${index}: armour ${look.armor.kind} has no materials`);
      if (look.armor?.over) assert.ok(CLOTH_GARMENTS.armor[look.armor.over], `${kind} ${index}: over-armour ${look.armor.over}`);
      for (const role of Object.keys(CLOTH_ROLES)) {
        const material = clothMaterialOf(look, role, context(kind));
        assert.ok(material in CLOTH_MATERIALS, `${kind} ${index}: role ${role} -> ${material}`);
      }
    }
  }
  for (const [name, spec] of Object.entries(CLOTH_MATERIALS)) {
    if (spec === null) continue;
    assert.ok(CLOTH_FAMILIES[spec.family], `${name}: family ${spec.family}`);
    assert.ok(spec.scale > 0.3 && spec.scale < 5, `${name}: scale ${spec.scale}`);
  }
  for (const table of ['top', 'bottom', 'feet', 'head']) for (const [kind, material] of Object.entries(CLOTH_GARMENTS[table])) assert.ok(material in CLOTH_MATERIALS, `${table}.${kind}`);
  for (const [kind, roles] of Object.entries(CLOTH_GARMENTS.armor)) {
    assert.ok('*' in roles, `${kind}: its other roles`);
    for (const material of Object.values(roles)) assert.ok(material in CLOTH_MATERIALS, `${kind}: ${material}`);
  }
});

test('every role painted on every design\'s body resolves to a material (a family or none)', () => {
  const unknown = new Set();
  withMaps(true, () => {
    for (const [kind, spec] of Object.entries(OUTFITS)) {
      for (const [design, look] of spec.designs.entries()) {
        const inputs = { ...structuredClone(PRESETS.contender), outfit: { kind, design } };
        const built = buildLoftBody(buildBody(inputs), { lowDetail: true });
        for (const role of new Set(built.regions)) {
          if (!(clothMaterialOf(look, role, { faction: factionOf(inputs), outfit: kind }) in CLOTH_MATERIALS)) unknown.add(`${kind}/${design}: ${role}`);
        }
      }
    }
  });
  assert.deepEqual([...unknown], []);
});

test('the peoples\' stuff: what the references say each was made of', () => {
  const material = (kind, role, design = 0) => clothMaterialOf(OUTFITS[kind].designs[design], role, context(kind));
  const family = (kind, role, design = 0) => clothFamilyOf(material(kind, role, design))?.family ?? null;
  assert.equal(family('mexicaWarrior', 'cloth'), 'diamondQuilt', 'the ichcahuipilli, quilted in diamonds');
  assert.equal(family('conquistadorQuilted', 'cloth'), 'diamondQuilt', 'the escaupil, the same cotton armour');
  const eagle = OUTFITS.mexicaElite.designs.findIndex((look) => look.armor?.kind === 'featherSuit');
  const jaguar = OUTFITS.mexicaElite.designs.findIndex((look) => look.armor?.kind === 'jaguarSuit');
  assert.equal(family('mexicaElite', 'cloth', eagle), 'feathers');
  assert.equal(family('mexicaElite', 'cloth', jaguar), 'fur');
  assert.equal(family('knight', 'top'), 'quilt', 'a knight\'s arming coat under his plate');
  assert.equal(family('goth', 'top'), 'twill', 'Germanic diamond twill wool');
  assert.equal(family('legionary', 'top'), 'plain', 'Roman wool tabby');
  assert.equal(family('steppeMedium', 'fur'), 'fur');
  assert.equal(family('steppeMedium', 'leather'), 'leather');
  assert.equal(family('casual', 'kit', OUTFITS.casual.designs.findIndex((look) => look.bottom?.kind === 'jeans')), 'denim');
  assert.equal(family('specialForces', 'cloth'), 'cordura');
  assert.equal(family('specialForces', 'kit'), 'ripstop');
  assert.equal(family('janissary', 'cloth'), 'felt', 'the dolama\'s fulled broadcloth');
  assert.equal(family('saladin', 'cloth'), 'damask');
  assert.equal(family('silverback', 'cloth'), 'fur');
  assert.equal(family('boxing', 'kit'), null, 'satin trunks: smooth');
  assert.equal(family('legionary', 'steel'), null, 'metal is the armour tiles\'');
  assert.equal(family('ashigaru', 'kit'), 'plain', 'hemp');
});

test('the families: 14 cells of the atlas, in its order, and the flat cell past them', () => {
  const names = Object.keys(CLOTH_FAMILIES);
  assert.ok(names.length >= 10 && names.length <= 15, `${names.length} families`);
  assert.deepEqual(CLOTH_MAP_DATA.families, names, 'the atlas holds the families in their order');
  names.forEach((name, index) => assert.equal(CLOTH_FAMILIES[name].cell, index, name));
  assert.ok(names.length <= CLOTH_FLAT_CELL);
  assert.equal(CLOTH_MAP_DATA.means.length, names.length);
  for (const [shade, rough] of CLOTH_MAP_DATA.means) assert.ok(shade > 0.2 && shade <= 1 && rough > 0.1 && rough <= 1, `${shade} ${rough}`);
});

test('the atlas is embedded as one WebP, 2048² at most, within 3 MB, and bundled', () => {
  const head = Buffer.from(CLOTH_MAP_DATA.atlas.slice(0, 24), 'base64');
  assert.equal(head.subarray(0, 4).toString(), 'RIFF');
  assert.equal(head.subarray(8, 12).toString(), 'WEBP');
  assert.deepEqual(CLOTH_MAP_DATA.size, [CLOTH_MAP_DATA.grid * CLOTH_MAP_DATA.cell, CLOTH_MAP_DATA.grid * CLOTH_MAP_DATA.cell]);
  assert.ok(CLOTH_MAP_DATA.size[0] <= 2048);
  assert.ok(readFileSync(new URL('../src/clothmaps-data.js', import.meta.url)).length < 3 * 1024 * 1024, 'the data file within 3 MB');
  const bundle = readFileSync(new URL('../tools/bundle.js', import.meta.url), 'utf8');
  assert.ok(bundle.includes("'clothmaps-data'"));
});

test('cloth carries its cells with the maps, none off or in a crowd, at no cost in triangles', () => {
  for (const name of ['templar', 'kheshig', 'contender', 'knight']) {
    const inputs = structuredClone(PRESETS[name]);
    const on = withMaps(true, () => buildLoftBody(buildBody(inputs)));
    const off = withMaps(false, () => buildLoftBody(buildBody(inputs)));
    const crowd = withMaps(true, () => buildLoftBody(buildBody(inputs), { lowDetail: true }));
    assert.ok(Object.keys(clothCells(on)).length > 0, `${name}: cloth with maps`);
    assert.deepEqual(clothCells(off), {}, `${name}: none with #maps=off`);
    assert.deepEqual(clothCells(crowd), {}, `${name}: none in a crowd`);
    // (Kozane and lamellae shells are fewer triangles with the maps; cloth adds none.)
    assert.ok(on.indices.length <= off.indices.length * 1.01, `${name}: ${on.indices.length / 3} against ${off.indices.length / 3}`);
    // Cloth's coordinates are not the armour's.
    for (let vertex = 0; vertex < on.uvs.length / 2; vertex += 1) if (on.uvs[vertex * 2] >= CLOTH_BAND) assert.equal(detailKindOf(on.uvs[vertex * 2]), null);
  }
});

test('a garment\'s weave closes round it: a whole number of tiles round each cloth loft', () => {
  const built = withMaps(true, () => buildLoftBody(buildBody(structuredClone(PRESETS.templar))));
  // The seam's two columns are the same points: their u apart by a whole number of tiles.
  const byPlace = new Map();
  for (let vertex = 0; vertex < built.uvs.length / 2; vertex += 1) {
    if (built.uvs[vertex * 2] < CLOTH_BAND) continue;
    const key = [0, 1, 2].map((axis) => built.positions[vertex * 3 + axis].toFixed(5)).join(',');
    if (!byPlace.has(key)) byPlace.set(key, []);
    byPlace.get(key).push(built.uvs[vertex * 2]);
  }
  let checked = 0;
  for (const us of byPlace.values()) {
    if (us.length !== 2 || Math.floor(us[0] / CLOTH_BAND) !== Math.floor(us[1] / CLOTH_BAND) || us[0] === us[1]) continue;
    const apart = Math.abs(us[0] - us[1]);
    assert.ok(Math.abs(apart - Math.round(apart)) < 2e-3, `the seam ${apart} tiles apart`);
    checked += 1;
  }
  assert.ok(checked > 0);
});

test('the cloth material wears the atlas from the start, one texture for all, and reads its cell in the shader', async () => {
  const kept = { THREE: globalThis.THREE, Image: globalThis.Image, document: globalThis.document };
  class Texture {
    constructor(image) {
      this.image = image;
    }
  }
  globalThis.THREE = { Texture, ClampToEdgeWrapping: 1001, Vector2: class { constructor(x, y) { Object.assign(this, { x, y }); } } };
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) };
  globalThis.Image = class {
    set src(value) {
      this.data = value;
    }
  };
  try {
    const { clothDetailMaterial, clothAtlasTexture, DETAIL_MAP_MEMORY } = await import('../src/detailtex.js');
    const a = clothDetailMaterial({ isMeshStandardMaterial: true });
    const b = clothDetailMaterial({ isMeshStandardMaterial: true });
    assert.ok(a.normalMap && a.normalMap === b.normalMap && a.normalMap === clothAtlasTexture(), 'one atlas shared');
    assert.ok(DETAIL_MAP_MEMORY.cloth > 0 && DETAIL_MAP_MEMORY.cloth < 25e6, `${DETAIL_MAP_MEMORY.cloth} bytes on the GPU`);
    const shader = {
      uniforms: {},
      vertexShader: 'void main() {\n#include <uv_vertex>\n}',
      fragmentShader: 'void main() {\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n}',
    };
    a.onBeforeCompile(shader);
    assert.ok(shader.fragmentShader.includes('textureGrad') && shader.fragmentShader.includes('perturbNormal2Arb'), 'the cell read with its gradients, the relief as normals');
    assert.equal(shader.uniforms.uClothMeans.value.length, 16);
    const lambert = clothDetailMaterial({ isMeshLambertMaterial: true });
    assert.equal(lambert.normalMap, undefined, 'a material that cannot take a normal map is left as it is');
  } finally {
    for (const [name, value] of Object.entries(kept)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
});
