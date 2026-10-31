// The detail maps (detailmaps.js): mail, laced lamellar (steppe and Japanese), plate and the places' surfaces drawn with maps baked
// in Blender instead of polygon by polygon; the maps embedded in the page; `#maps=off` drawing everything as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRESETS, buildBody } from '../src/body.js';
import { buildLoftBody } from '../src/loftbody.js';
import { DETAIL_ARMOUR, DETAIL_MAPS, detailKindOf, detailMapsWanted } from '../src/detailmaps.js';
import { DETAIL_MAP_DATA } from '../src/detailmaps-data.js';
import { FACTIONS } from '../src/outfits.js';
import { skinWorkerAnswer } from '../src/skinworker.js';

const JEBE = { ...structuredClone(PRESETS.kheshig), outfit: { kind: 'mingIronLamellar', design: 0 } };
const TEMPLAR = structuredClone(PRESETS.templar);
const SAMURAI = structuredClone(PRESETS.samurai);
const KNIGHT = structuredClone(PRESETS.knight);

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

test('laced lamellae are one mapped shell: far fewer triangles than plate by plate', () => {
  const on = built(JEBE, true);
  const off = built(JEBE, false);
  assert.ok(on.kinds.lamellae > 0, 'the lamellae carry their maps');
  assert.deepEqual(off.kinds, {}, 'off: no maps at all');
  assert.ok(on.triangles < off.triangles * 0.8, `${on.triangles} triangles with the maps against ${off.triangles} plate by plate`);
});

test('mail carries the mail maps and plate the plate maps at no cost in triangles', () => {
  for (const [inputs, kind] of [[TEMPLAR, 'mail'], [KNIGHT, 'plate']]) {
    const on = built(inputs, true);
    const off = built(inputs, false);
    assert.ok(on.kinds[kind] > 0, kind);
    assert.ok(on.triangles <= off.triangles * 1.01, `${kind}: ${on.triangles} against ${off.triangles}`);
  }
});

test('Japanese laced rows wear the kozane tile', () => {
  assert.ok(built(SAMURAI, true).kinds.kozane > 0);
  assert.equal(built(SAMURAI, false).kinds.kozane, undefined);
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

test('lamellar cords are the people\'s: the steppe\'s white, the Chinese red', () => {
  const lightness = (hex) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
  assert.ok(lightness(FACTIONS.steppe.lamellarCord) > 600, 'white or off-white');
  const red = FACTIONS.chinese.lamellarCord;
  assert.ok(parseInt(red.slice(1, 3), 16) > 2 * parseInt(red.slice(3, 5), 16), 'red');
  assert.equal(FACTIONS.japanese.lamellarCord, undefined, 'Japanese kits keep their lace');
});

test('the baked maps are embedded, 1024² at most, ground tiles as two maps, and in the bundle', () => {
  const armour = ['mail', 'lamellae', 'kozane', 'plate'];
  const ground = ['ashlar', 'cobble', 'setts', 'slabs', 'rubble', 'planks', 'earth', 'grass', 'drygrass', 'gravel', 'sand', 'beach', 'concrete'];
  for (const name of [...armour, ...ground]) {
    const tile = DETAIL_MAP_DATA[name];
    assert.ok(tile, name);
    assert.equal(tile.kind, armour.includes(name) ? 'armour' : 'ground', name);
    assert.ok(tile.size[0] <= 1024 && tile.size[1] <= 1024 && (tile.size[0] & (tile.size[0] - 1)) === 0, `${name} ${tile.size}`);
    for (const key of tile.kind === 'armour' ? ['albedo', 'normal', 'orm'] : ['albedo', 'normal']) {
      const head = Buffer.from(tile[key].slice(0, 24), 'base64');
      assert.equal(head.subarray(0, 4).toString(), 'RIFF', `${name}.${key}`);
      assert.equal(head.subarray(8, 12).toString(), 'WEBP', `${name}.${key}`);
    }
    if (tile.kind === 'ground') assert.ok(tile.metres > 0 && !tile.orm, name);
  }
  const bundle = readFileSync(new URL('../tools/bundle.js', import.meta.url), 'utf8');
  for (const module of ['detailmaps', 'detailmaps-data', 'detailtex']) assert.ok(bundle.includes(`'${module}'`), module);
});

test('the materials wear the maps from the start (a stand-in until decoded), the cords in their colours, the stone over its metres', async () => {
  const kept = { THREE: globalThis.THREE, Image: globalThis.Image, document: globalThis.document };
  class Texture {
    constructor(image) {
      Object.assign(this, { image, repeat: { x: 1, y: 1, set(x, y) { Object.assign(this, { x, y }); } } });
    }
  }
  const decoders = [];
  globalThis.THREE = { Texture, RepeatWrapping: 1000, Color: class { constructor(r = 1, g = 1, b = 1) { Object.assign(this, { r, g, b }); } clone() { return Object.assign(Object.create(Object.getPrototypeOf(this)), this); } }, Vector2: class { constructor(x, y) { Object.assign(this, { x, y }); } } };
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) };
  globalThis.Image = class {
    set src(value) {
      this.data = value;
      decoders.push(() => this.onload());
    }
  };
  try {
    const { armourDetailMaterial, stoneDetailMaps, groundDetailLayer } = await import('../src/detailtex.js');
    const steel = {};
    const cord = new THREE.Color(0.6, 0.1, 0.1);
    armourDetailMaterial(steel, 'lamellae', { cords: [cord, cord], metalness: 1 });
    assert.ok(steel.map && steel.normalMap && steel.roughnessMap && steel.metalnessMap && steel.aoMap, 'colour, normal, roughness, metalness, occlusion');
    assert.equal(steel.map.image.data, undefined, 'a stand-in until the picture is decoded');
    for (const decode of decoders.splice(0)) decode();
    assert.ok(steel.map.image.data.startsWith('data:image/webp'), 'then the picture');
    const shader = { uniforms: {}, vertexShader: '', fragmentShader: 'void main() {\n#include <color_fragment>\n}' };
    steel.onBeforeCompile(shader);
    assert.ok(shader.fragmentShader.includes('uDetailCordA') && shader.uniforms.uDetailCordB.value.r === 0.6, 'the cords in their colours');
    const stone = {};
    stone.userData = {};
    assert.equal(stoneDetailMaps(stone, 'ashlar'), true);
    assert.ok(stone.normalMap && stone.userData.roughInAlpha, 'the stone has its normal, its roughness in the colour\'s alpha');
    assert.equal(stone.map.repeat.x, 1 / DETAIL_MAP_DATA.ashlar.metres, 'tiling over its own metres');
    const layer = groundDetailLayer('sand');
    assert.ok(layer.colour && layer.normal && layer.metres === DETAIL_MAP_DATA.sand.metres, 'a ground layer');
  } finally {
    for (const [name, value] of Object.entries(kept)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
});
