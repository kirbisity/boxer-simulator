import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Where a fighter is from (faceregions.js REGION_ORIGINS): chosen in the character creator apart from his kit, his skin
// picked within the origin's range; everyone not given one is cast from his kit exactly as before.

import { clampTone, KIT_REGIONS, nearestRegion, originOf, REGION_ORIGINS, REGION_PLACES, REGION_TONES, regionsFor, regionTone, setShade, settleOrigin, skinShadeOf, TONE_REGIONS, toneRange, toneShift, toneSpan } from '../src/faceregions.js';
import { buildBody, normaliseInputs, PRESETS } from '../src/body.js';
import { redress } from '../src/cast.js';
import { lookSkinHex, shadeColor, shadeTone, SKIN_TONES, toneShade } from '../src/skintones.js';

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
  assert.deepEqual(toneShift(fought.inputs), { from: 5, to: 4 }, 'deep to tan, as places on the ladder');
  assert.equal(toneShift({ look: { faceRegion: 'westAfrica', skinTone: 'deep' } }), null, 'the origin\'s own tone: no shift');
  assert.deepEqual(toneShift({ look: { faceRegion: 'westAfrica', skinTone: 'porcelain' } }), { from: 5, to: 4 }, 'clamped');
  assert.deepEqual(toneShift({ look: { faceRegion: 'westAfrica', skinTone: 'deep', skinShade: 4.6 } }), { from: 5, to: 4.6 }, 'the shade wins over the named tone');
  assert.deepEqual(toneShift({ look: { faceRegion: 'westAfrica', skinTone: 'deep', skinShade: 1 } }), { from: 5, to: 4 }, 'a shade out of range: the nearer end');
});

test('the Skin slider\'s span: the origin\'s range, in shades between its tones; a shade sets the nearest named tone and the body\'s colour', () => {
  for (const region of Object.keys(REGION_PLACES)) {
    const [low, high] = toneSpan(region);
    const range = toneRange(region);
    assert.equal(LADDER[low], range[0], `${region}: lightest`);
    assert.equal(LADDER[high], range.at(-1), `${region}: deepest`);
    assert.ok(low <= toneShade(regionTone(region)) && toneShade(regionTone(region)) <= high, `${region}'s own tone is inside`);
    assert.ok(high - low >= 1 && high - low <= 4, `${region}: a step or two either way, no more`);
    for (const shade of [-3, low - 0.3, low, (low + high) / 2, high, high + 0.4, 9]) {
      const kept = skinShadeOf(region, { skinShade: shade });
      assert.ok(kept >= low && kept <= high, `${region} ${shade} → ${kept}, in span`);
    }
  }
  assert.deepEqual(toneSpan(null), [0, LADDER.length - 1], 'drawn faces: the whole ladder');
  assert.deepEqual(setShade({}, 3.62), { skinShade: 3.62, skinTone: 'tan' });
  assert.equal(setShade({}, 2.123).skinShade, 2.12, 'a hundredth of a step');
  assert.equal(shadeTone(0.49), 'porcelain');
  assert.equal(shadeColor(2), SKIN_TONES.lightTan, 'a whole step is the named tone');
  assert.equal(lookSkinHex({ skinTone: 'tan' }), SKIN_TONES.tan, 'no shade: the named tone (every preset)');
  const between = lookSkinHex({ skinTone: 'tan', skinShade: 4.5 });
  for (const shift of [16, 8, 0]) {
    const channel = (hex) => (hex >> shift) & 255;
    assert.ok(channel(between) < channel(SKIN_TONES.tan) && channel(between) > channel(SKIN_TONES.deep), 'half way between tan and deep');
  }
  // A sex changed: an origin with no composite of hers becomes the nearest that has one, the shade kept in its span.
  const settled = settleOrigin({ faceRegion: 'africanAmerican', skinShade: 3.1, skinTone: 'medium' }, regionsOf('female'));
  assert.equal(settled.faceRegion, nearestRegion('africanAmerican', regionsOf('female')));
  assert.ok(regionsOf('female').includes(settled.faceRegion));
  assert.ok(settled.skinShade >= toneSpan(settled.faceRegion)[0] && settled.skinShade <= toneSpan(settled.faceRegion)[1]);
  const kept = { faceRegion: 'japan', skinShade: 2.4, skinTone: 'lightTan' };
  assert.deepEqual(settleOrigin({ ...kept }, regionsOf('female')), kept, 'one she has: untouched');
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
  // Lighter or darker, the same people's skin: its hue kept (the ratio of brightness, not channel by channel, which turned a
  // light Korean pink), and a shade between two tones between them.
  const hue = (hex) => {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
    return [r / (r + g + b), g / (r + g + b)];
  };
  for (const other of [lighter, darker]) hue(other.skin).forEach((share, at) => assert.ok(Math.abs(share - hue(own.skin)[at]) < 0.02, `${other.skin}'s hue is ${own.skin}'s`));
  const slightly = photoFaceFor(normaliseInputs(structuredClone({ ...PRESETS.knight, name: 'Same', look: { ...PRESETS.knight.look, faceRegion: 'korea', skinTone: 'lightTan', skinShade: 1.7 } })));
  assert.ok(lightness(lighter.skin) > lightness(slightly.skin) && lightness(slightly.skin) > lightness(own.skin), `a shade between: ${slightly.skin}`);
});

function fakeDocument(ids) {
  const make = (tag) => {
    const node = {
      tag, children: [], className: '', hidden: false, dataset: {}, style: { setProperty(name, value) { node.style[name] = value; } }, onclick: null, textContent: '', parent: null,
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

/** A seeded Math.random for the creator's dealt fighter (cast.js randomGladiator): the same man every run. */
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** The menus on a fake page, the creator opened for the arena (Blood & Sand) and set to `sex` on its first step. */
async function creator(sex) {
  await photoFaces();
  const page = fakeDocument(['home', 'quick', 'lastgate-screen', 'levels-screen', 'muster-screen', 'custom-screen', 'stages-screen', 'versus', 'wizard', 'settings-screen']);
  // render.js comes in with the menu's imports: a THREE that answers anything. (Put back for the photo faces after.)
  const stub = new Proxy(function stand() {}, { get: (_, key) => (key === Symbol.toPrimitive ? () => 0 : stub), apply: () => stub, construct: () => stub });
  const keptThree = globalThis.THREE;
  globalThis.THREE = stub;
  globalThis.document = page.document;
  const { installMenus } = await import('../src/menu.js');
  globalThis.THREE = keptThree;
  const matches = [];
  const menus = installMenus({ onMenu() {}, attract() {}, preview() {}, stats: () => ({ weight: 80, bodyFat: 0.15, bench: 100, sprint: 4.2 }), calorieRange: () => [1500, 4000], hours: () => 5, match: (setup) => matches.push(setup) });
  menus.quickEvent();
  page.byId.quick.all((node) => node.tag === 'button' && /Blood & Sand/.test(node.textContent))[0].onclick();
  const wizard = page.byId.wizard;
  const find = (test) => wizard.all(test)[0];
  // The dealt fighter is a man or a woman by chance (why this test once failed in the full run, on a woman): say which.
  find((node) => node.tag === 'button' && node.textContent === (sex === 'male' ? 'Man' : 'Woman')).onclick();
  const step = (title) => find((node) => node.tag === 'button' && node.title === title).onclick();
  const select = () => find((node) => node.tag === 'select');
  const skin = () => find((node) => node.tag === 'input' && node.type === 'range' && node.ariaLabel === 'Skin');
  return { find, step, select, skin, matches, wizard };
}

test('the creator offers the origins of the fighter\'s sex, preselects his kit\'s, and a pick resets the skin to the origin\'s tone and range', async () => {
  const keptRandom = Math.random;
  Math.random = seededRandom(7);
  try {
    for (const sex of ['male', 'female']) {
      const { step, select, skin, wizard } = await creator(sex);
      step('Their face');
      const offered = select().all((node) => node.tag === 'option').map((option) => option.value);
      assert.deepEqual([...offered].sort(), [...regionsOf(sex)].sort(), `a ${sex === 'male' ? 'man' : 'woman'} is offered the composites of that sex`);
      assert.ok(select().all((node) => node.tag === 'optgroup').length >= 5, 'grouped by continent');
      assert.ok(regionsOf(sex).includes(select().value), 'the one shown is the kit\'s, one there is');
      assert.ok(!wizard.all((node) => node === null || node === 'null').length && !wizard.all((node) => node?.children?.some((child) => child === null || child === 'null')).length, 'nothing null on the page (a woman has no facial hair row)');
      select().value = 'westAfrica';
      select().onchange();
      assert.equal(select().value, 'westAfrica');
      assert.deepEqual([Number(skin().min), Number(skin().max)], toneSpan('westAfrica'), 'the slider spans the origin\'s range');
      assert.equal(Number(skin().value), toneShade('deep'), 'the skin reset to the origin\'s own');
      select().value = 'england';
      select().onchange();
      assert.deepEqual([Number(skin().min), Number(skin().max)], toneSpan('england'));
      assert.equal(Number(skin().value), toneShade('light'));
    }
  } finally {
    Math.random = keptRandom;
  }
});

test('the creator\'s Skin slider moves the shade within the origin\'s range, and the fight is fought with that origin and shade', async () => {
  const keptRandom = Math.random;
  Math.random = seededRandom(11);
  try {
    const { find, step, select, skin, matches } = await creator('male');
    step('Their face');
    select().value = 'westAfrica';
    select().onchange();
    skin().value = '4.3';
    skin().oninput();
    assert.match(find((node) => node.tag === 'output').textContent, /tan/, 'the shade named');
    // Away to another step and back: the origin and shade stay his.
    step('How they fight');
    step('Their face');
    assert.equal(select().value, 'westAfrica');
    assert.equal(Number(skin().value), 4.3);
    step('Ready');
    find((node) => node.tag === 'button' && node.textContent === 'Fight!').onclick();
    const player = matches[0].red[0];
    assert.equal(player.look.faceRegion, 'westAfrica');
    assert.equal(player.look.skinShade, 4.3);
    assert.equal(player.look.skinTone, 'tan');
    // The fight: his inputs as the match takes them (redressed, normalised), his photo face West African and a shade lighter
    // than the composite's own; his body (render.js lookOf) takes its skin from that face.
    const { photoFaceFor } = await photoFaces();
    const face = photoFaceFor(normaliseInputs(redress(structuredClone(player))));
    assert.equal(face.primary.region, 'westAfrica');
    const own = photoFaceFor(normaliseInputs(redress(structuredClone({ ...player, look: { ...player.look, skinShade: 5, skinTone: 'deep' } }))));
    assert.equal(own.primary.region, 'westAfrica');
    assert.ok(lightness(face.skin) > lightness(own.skin), `${face.skin} lighter than the origin's own ${own.skin}`);
    // Moved out of range by hand (a fighter code), it is kept to the range.
    assert.deepEqual(toneShift({ look: { ...player.look, skinShade: 0 } }), { from: 5, to: toneSpan('westAfrica')[0] });
  } finally {
    Math.random = keptRandom;
  }
});
