import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Where a fighter is from (faceregions.js REGION_ORIGINS): chosen in the character creator apart from his kit, his skin
// picked within the origin's range; everyone not given one is cast from his kit exactly as before.

import { clampTone, KIT_REGIONS, originOf, REGION_ORIGINS, REGION_PLACES, REGION_TONES, regionsFor, regionTone, TONE_REGIONS, toneRange, toneShift } from '../src/faceregions.js';
import { buildBody, normaliseInputs, PRESETS } from '../src/body.js';
import { redress } from '../src/cast.js';
import { SKIN_TONES } from '../src/skintones.js';

const MANIFEST = JSON.parse(readFileSync(new URL('../assets/faces/manifest.json', import.meta.url), 'utf8'));
const regionsOf = (sex) => Object.values(MANIFEST.faces).filter((face) => face.sex === sex).map((face) => face.region);
const LADDER = Object.keys(SKIN_TONES);

test('every region is offered under a continent and has a tone; every composite is offered', () => {
  const offered = REGION_ORIGINS.flatMap((group) => Object.keys(group.regions));
  assert.equal(new Set(offered).size, offered.length, 'no region offered twice');
  for (const region of Object.keys(REGION_PLACES)) {
    assert.ok(offered.includes(region), `${region} is offered`);
    assert.ok(LADDER.includes(REGION_TONES[region]), `${region} has a tone of the ladder`);
  }
  for (const region of [...regionsOf('male'), ...regionsOf('female')]) assert.ok(offered.includes(region), `${region} (a composite) is offered`);
});

test('the tone range: the region\'s own tone and a step either way, cut by the ladder\'s ends; out of range clamps to the nearer end', () => {
  assert.deepEqual(toneRange('england'), ['porcelain', 'light', 'lightTan']);
  assert.deepEqual(toneRange('japan'), ['light', 'lightTan', 'medium']);
  assert.deepEqual(toneRange('westAfrica'), ['tan', 'deep'], 'deep is the ladder\'s end');
  assert.deepEqual(toneRange('brazil'), ['light', 'lightTan', 'medium', 'tan', 'deep'], 'a wide region reaches two steps');
  for (const region of Object.keys(REGION_PLACES)) {
    const range = toneRange(region);
    assert.ok(range.includes(regionTone(region)), `${region}'s own tone is in its range`);
    for (const tone of LADDER) {
      const kept = clampTone(region, tone);
      assert.ok(range.includes(kept), `${region} ${tone} → ${kept}, in range`);
      if (range.includes(tone)) assert.equal(kept, tone, 'a tone in range is kept');
      else assert.equal(kept, LADDER.indexOf(tone) < LADDER.indexOf(range[0]) ? range[0] : range.at(-1), 'out of range: the nearer end');
    }
  }
  assert.equal(clampTone('england', 'deep'), 'lightTan');
  assert.equal(clampTone('westAfrica', 'porcelain'), 'tan');
  assert.equal(clampTone('korea', 'nonsense'), 'lightTan', 'no tone: the region\'s own');
});

test('every preset is cast from its kit as before: its default origin is its kit\'s commonest, and its skin is not shifted', () => {
  for (const [key, preset] of Object.entries(PRESETS)) {
    const inputs = normaliseInputs(structuredClone(preset));
    const kit = KIT_REGIONS[inputs.outfit?.kind] ?? TONE_REGIONS[inputs.look.skinTone ?? 'medium'] ?? TONE_REGIONS.medium;
    assert.deepEqual(regionsFor(inputs), kit, `${key}'s regions`);
    assert.equal(toneShift(inputs), null, `${key}'s photo skin is the composite's`);
    for (const sex of ['male', 'female']) assert.ok(regionsOf(sex).includes(originOf(inputs, regionsOf(sex))), `${key}: a ${sex} origin there is`);
  }
  assert.equal(originOf(normaliseInputs(structuredClone(PRESETS.samurai)), regionsOf('male')), 'japan');
  assert.equal(originOf(normaliseInputs(structuredClone(PRESETS.knight)), regionsOf('male')), 'england');
});

test('a chosen origin wins over the kit, whatever the kit, and lives through the way a custom fighter goes into a fight', () => {
  const custom = normaliseInputs(structuredClone({ ...PRESETS.samurai, look: { ...PRESETS.samurai.look, faceRegion: 'westAfrica', skinTone: 'tan' } }));
  // The creator's onDone, then the fight button's redress and the match's own normalising, then the body built from it.
  const fought = buildBody(normaliseInputs(structuredClone(normaliseInputs(redress(structuredClone(custom))))));
  assert.equal(fought.inputs.look.faceRegion, 'westAfrica');
  assert.equal(fought.inputs.look.skinTone, 'tan');
  assert.deepEqual(regionsFor(fought.inputs), ['westAfrica']);
  assert.deepEqual(toneShift(fought.inputs), { from: 'deep', to: 'tan' });
  assert.equal(toneShift({ look: { faceRegion: 'westAfrica', skinTone: 'deep' } }), null, 'the origin\'s own tone: no shift');
  assert.deepEqual(toneShift({ look: { faceRegion: 'westAfrica', skinTone: 'porcelain' } }), { from: 'deep', to: 'tan' }, 'clamped');
});

// ---- The photo face and the creator, with just enough of THREE and the page ----------------------------------------------

class Color {
  constructor(value = 0) {
    const hex = typeof value === 'string' ? parseInt(value.replace('#', ''), 16) : value;
    this.setRGB(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
  }
  setRGB(r, g, b) { Object.assign(this, { r, g, b }); return this; }
  lerp(other, t) { return this.setRGB(this.r + (other.r - this.r) * t, this.g + (other.g - this.g) * t, this.b + (other.b - this.b) * t); }
  getHSL(target) { return Object.assign(target, { h: 0, s: 0, l: (this.r + this.g + this.b) / 3 }); }
  setHSL() { return this; }
  getHexString() { return [this.r, this.g, this.b].map((value) => Math.round(value * 255).toString(16).padStart(2, '0')).join(''); }
}

async function photoFaces() {
  globalThis.THREE = { Color };
  globalThis.fetch = async () => ({ ok: true, json: async () => MANIFEST });
  const photo = await import('../src/photoface.js');
  await photo.loadPhotoFaces();
  return photo;
}
const lightness = (hex) => [1, 3, 5].reduce((sum, at) => sum + parseInt(hex.slice(at, at + 2), 16), 0);

test('the chosen origin reaches the photo face, and the tone moves its skin; a preset\'s face is its kit\'s', async () => {
  const { photoFaceFor, photoFaceRegions } = await photoFaces();
  assert.deepEqual(photoFaceRegions('female'), regionsOf('female'));
  const knight = normaliseInputs(structuredClone(PRESETS.knight));
  assert.ok(regionsFor(knight).includes(photoFaceFor(knight).primary.region), 'the knight is cast from his kit\'s regions');
  const as = (skinTone) => normaliseInputs(structuredClone({ ...PRESETS.knight, name: 'Same', look: { ...PRESETS.knight.look, faceRegion: 'korea', skinTone } }));
  const own = photoFaceFor(as('lightTan'));
  assert.equal(own.primary.region, 'korea');
  const lighter = photoFaceFor(as('light'));
  const darker = photoFaceFor(as('medium'));
  assert.equal(lighter.primary.region, 'korea');
  assert.ok(lightness(lighter.skin) > lightness(own.skin) && lightness(own.skin) > lightness(darker.skin), `${lighter.skin} > ${own.skin} > ${darker.skin}`);
});

function fakeDocument(ids) {
  const make = (tag) => {
    const node = {
      tag, children: [], className: '', hidden: false, dataset: {}, style: {}, onclick: null, textContent: '', parent: null,
      classList: { add(name) { node.className += ` ${name}`; }, remove() {}, contains: (name) => node.className.split(' ').includes(name) },
      append(...items) { for (const item of items) { if (item && typeof item === 'object') item.parent = node; node.children.push(item); } },
      replaceChildren(...items) { node.children = []; node.append(...items); },
      addEventListener() {}, focus() {},
      all(test, found = []) { if (test(node)) found.push(node); node.children.forEach((child) => child?.all?.(test, found)); return found; },
    };
    return node;
  };
  const byId = Object.fromEntries(ids.map((id) => [id, make('div')]));
  return { byId, document: { body: make('body'), createElement: make, getElementById: (id) => byId[id] } };
}

test('the creator offers the origins of the fighter\'s sex, preselects his kit\'s, and a pick resets the skin to the origin\'s tone and range', async () => {
  await photoFaces();
  const page = fakeDocument(['home', 'quick', 'lastgate-screen', 'levels-screen', 'muster-screen', 'stages-screen', 'versus', 'wizard', 'settings-screen']);
  const keptThree = globalThis.THREE;
  // render.js is imported with the menu: a THREE that answers anything.
  const stub = new Proxy(function stand() {}, { get: (_, key) => (key === Symbol.toPrimitive ? () => 0 : stub), apply: () => stub, construct: () => stub });
  globalThis.THREE = stub;
  globalThis.document = page.document;
  const { installMenus } = await import('../src/menu.js');
  const matches = [];
  const menus = installMenus({ onMenu() {}, attract() {}, preview() {}, stats: () => ({ weight: 80, bodyFat: 0.15, bench: 100, sprint: 4.2 }), calorieRange: () => [1500, 4000], hours: () => 5, match: (setup) => matches.push(setup) });
  menus.quickEvent();
  page.byId.quick.all((node) => node.tag === 'button' && /Blood & Sand/.test(node.textContent))[0].onclick();
  const wizard = page.byId.wizard;
  const find = (test) => wizard.all(test)[0];
  find((node) => node.tag === 'button' && node.title === 'Their face').onclick();
  let select = find((node) => node.tag === 'select');
  const offered = select.all((node) => node.tag === 'option').map((option) => option.value);
  assert.deepEqual([...offered].sort(), [...regionsOf('male')].sort(), 'a man is offered the men\'s composites');
  assert.ok(select.all((node) => node.tag === 'optgroup').length >= 5, 'grouped by continent');
  // Every gladiator's kit (the arena's men) is cast from its own regions: the one shown is the kit's.
  const kitOrigin = select.value;
  assert.ok(regionsOf('male').includes(kitOrigin));
  select.value = 'westAfrica';
  select.onchange();
  const swatches = () => wizard.all((node) => node.tag === 'button' && /swatch/.test(node.className) && node.parent?.className === 'swatches' && node.parent.parent?.children[0]?.textContent === 'Skin');
  assert.deepEqual(swatches().map((button) => button.title), toneRange('westAfrica').map((tone) => tone.replace(/([A-Z])/g, ' $1').toLowerCase()));
  assert.match(swatches().find((button) => /\bon\b/.test(button.className)).title, /deep/, 'the skin reset to the origin\'s own');
  swatches()[0].onclick();
  select = find((node) => node.tag === 'select');
  assert.equal(select.value, 'westAfrica');
  // On to the end and into the fight: the origin and the tone go with him.
  find((node) => node.tag === 'button' && node.title === 'Ready').onclick();
  find((node) => node.tag === 'button' && node.textContent === 'Fight!').onclick();
  const player = matches[0].red[0];
  assert.equal(player.look.faceRegion, 'westAfrica');
  assert.equal(player.look.skinTone, 'tan');
  globalThis.THREE = keptThree;
});
