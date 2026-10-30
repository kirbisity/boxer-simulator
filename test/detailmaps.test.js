// The detail maps pilot (detailmaps.js): mail and laced lamellae drawn as shells carrying baked maps instead of plate by plate,
// the maps embedded in the page, and `#maps=off` drawing everything as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRESETS, buildBody } from '../src/body.js';
import { buildLoftBody } from '../src/loftbody.js';
import { DETAIL_ARMOUR, DETAIL_MAPS, detailKindOf, detailMapsWanted } from '../src/detailmaps.js';
import { DETAIL_MAP_DATA } from '../src/detailmaps-data.js';
import { skinWorkerAnswer } from '../src/skinworker.js';

const JEBE = { ...structuredClone(PRESETS.kheshig), outfit: { kind: 'mingIronLamellar', design: 0 } };
const TEMPLAR = structuredClone(PRESETS.templar);

/** A built body's triangles, and how many of them carry each kind of detail map. */
function tally(built) {
  const triangles = built.indices.length / 3;
  const kinds = {};
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const kind = built.uvs ? detailKindOf(built.uvs[built.indices[triangle * 3] * 2]) : null;
    if (kind) kinds[kind] = (kinds[kind] ?? 0) + 1;
  }
  return { triangles, kinds };
}

function built(inputs, on, options = {}) {
  const was = DETAIL_MAPS.on;
  DETAIL_MAPS.on = on;
  try {
    return tally(buildLoftBody(buildBody(inputs), options));
  } finally {
    DETAIL_MAPS.on = was;
  }
}

test('laced lamellae are one mapped shell: fewer triangles than plate by plate', () => {
  const on = built(JEBE, true);
  const off = built(JEBE, false);
  assert.ok(on.kinds.lamellae > 0, 'the lamellae carry their maps');
  assert.equal(off.kinds.lamellae, undefined, 'off: no mapped lamellae');
  assert.ok(on.triangles < off.triangles * 0.85, `${on.triangles} triangles with the maps against ${off.triangles} plate by plate`);
});

test('mail carries the mail maps at no cost in triangles', () => {
  const on = built(TEMPLAR, true);
  const off = built(TEMPLAR, false);
  assert.ok(on.kinds.mail > 0, 'the mail carries its maps');
  assert.equal(off.kinds.mail, undefined);
  assert.ok(on.triangles <= off.triangles * 1.01, `${on.triangles} against ${off.triangles}`);
});

test('a crowd body (low detail) and an unarmoured one carry no detail maps', () => {
  assert.deepEqual(built(JEBE, true, { lowDetail: true }).kinds, {});
  assert.deepEqual(built(structuredClone(PRESETS.contender), true).kinds, {});
});

test('the mail weave closes round each piece: a whole number of tiles round', () => {
  const was = DETAIL_MAPS.on;
  DETAIL_MAPS.on = true;
  const body = buildLoftBody(buildBody(TEMPLAR));
  DETAIL_MAPS.on = was;
  // Every mail u is in its band, and a band's largest u (the seam's copy) is a whole number of tiles from its start.
  const us = [];
  for (let vertex = 0; vertex < body.uvs.length / 2; vertex += 1) if (detailKindOf(body.uvs[vertex * 2]) === 'mail') us.push(body.uvs[vertex * 2] - DETAIL_ARMOUR.mail.band);
  assert.ok(us.length > 0);
  assert.ok(Math.min(...us) >= 0);
  const top = Math.max(...us);
  assert.ok(Math.abs(top - Math.round(top)) < 1e-4, `the seam at ${top} tiles`);
});

test('#maps=off turns the maps off; anything else leaves them on', () => {
  assert.equal(detailMapsWanted(''), true);
  assert.equal(detailMapsWanted('#maps=on'), true);
  assert.equal(detailMapsWanted('#maps=off'), false);
  assert.equal(detailMapsWanted('#look=x&maps=off'), false);
  assert.equal(detailMapsWanted('#maps=offish'), true);
});

test('the skin worker builds as the page says (maps on or off)', () => {
  const lamellae = (detailMaps) => tally(skinWorkerAnswer({ id: 1, inputs: JEBE, style: 'lofted', detailMaps }).answer.built).kinds.lamellae;
  const was = DETAIL_MAPS.on;
  try {
    assert.ok(lamellae(true) > 0);
    assert.equal(lamellae(false), undefined);
  } finally {
    DETAIL_MAPS.on = was;
  }
});

test('the baked maps are embedded: each tile a WebP colour, normal and ORM map, and in the bundle', () => {
  for (const name of ['mail', 'lamellae', 'ashlar', 'cobble']) {
    const tile = DETAIL_MAP_DATA[name];
    assert.ok(tile, name);
    assert.equal(tile.size.length, 2);
    assert.equal(tile.mean.length, 3);
    for (const key of ['albedo', 'normal', 'orm']) {
      const head = Buffer.from(tile[key].slice(0, 24), 'base64');
      assert.equal(head.subarray(0, 4).toString(), 'RIFF', `${name}.${key}`);
      assert.equal(head.subarray(8, 12).toString(), 'WEBP', `${name}.${key}`);
    }
  }
  const bundle = readFileSync(new URL('../tools/bundle.js', import.meta.url), 'utf8');
  for (const module of ['detailmaps', 'detailmaps-data', 'detailtex']) assert.ok(bundle.includes(`'${module}'`), module);
});

test('the materials take the maps once the pictures are decoded: the armour its colour, normal and ORM maps and the lace, the stone its own', async () => {
  const kept = { THREE: globalThis.THREE, Image: globalThis.Image };
  class Texture {
    constructor(image) {
      Object.assign(this, { image, repeat: { x: 1, y: 1, clone() { return { ...this }; }, copy(other) { Object.assign(this, { x: other.x, y: other.y }); } } });
    }
  }
  const decoders = [];
  globalThis.THREE = { Texture, RepeatWrapping: 1000 };
  globalThis.Image = class {
    set src(value) {
      this.data = value;
      decoders.push(() => this.onload());
    }
  };
  try {
    const { armourDetailMaterial, stoneDetailMaps } = await import('../src/detailtex.js');
    const steel = { needsUpdate: false };
    const lace = { clone: () => ({ r: 0.5, g: 0.1, b: 0.1 }) };
    armourDetailMaterial(steel, 'lamellae', { lace });
    assert.equal(steel.normalMap, undefined, 'nothing before the pictures are decoded');
    for (const decode of decoders.splice(0)) decode();
    assert.ok(steel.map && steel.normalMap && steel.roughnessMap && steel.metalnessMap && steel.aoMap, 'colour, normal, roughness, metalness, occlusion');
    assert.equal(steel.roughness, 1);
    assert.equal(steel.metalness, 1);
    const shader = { uniforms: {}, fragmentShader: 'void main() {\n#include <color_fragment>\n}' };
    steel.onBeforeCompile(shader);
    assert.ok(shader.fragmentShader.includes('uDetailLace') && shader.uniforms.uDetailLace.value.r === 0.5, 'the lacing in its own colour');
    const stone = { map: { repeat: { x: 0.25, y: 0.25, clone() { return { x: this.x, y: this.y }; } } } };
    assert.equal(stoneDetailMaps(stone, 'ashlar'), true);
    for (const decode of decoders.splice(0)) decode();
    assert.ok(stone.normalMap && stone.roughnessMap, 'the stone has its normal and roughness');
    assert.equal(stone.map.repeat.x, 0.25, 'tiling over the same metres');
    assert.deepEqual(stone.map.kitMean, DETAIL_MAP_DATA.ashlar.mean);
  } finally {
    for (const [name, value] of Object.entries(kept)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
});
