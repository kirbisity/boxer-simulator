// An army's colours (armythemes.js) are colour only: every man of every battle is the same man with them and without them, in
// the same kit, the same armour, mass and protection, the same weapons and the same place in the cast; only his colour fields
// differ, and of those never his steel's.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, battleOf } from '../src/scenarios.js';
import { seededRandom } from '../src/physics.js';
import { buildBody, normaliseInputs } from '../src/body.js';
import { outfitOf } from '../src/outfits.js';
import { STORY_BATTLES } from '../src/story/battles/index.js';
import { storyNewLife } from '../src/story/life.js';
import { ARMY_THEMES, BATTLE_THEMES, FACTION_THEMES, factionThemes, hslOf, sameLook, themedFighters, themedMan } from '../src/armythemes.js';

// What a theme writes, all of it colour: taken off, a themed man is the man he was.
const COLOUR_FIELDS = ['paint', 'colors', 'tint', 'banner', 'crest', 'badge', 'sash', 'theme', 'handColors'];
function withoutColour(inputs) {
  const { standardColour: _standard, ...rest } = inputs;
  const outfit = Object.fromEntries(Object.entries(rest.outfit ?? {}).filter(([key]) => !COLOUR_FIELDS.includes(key)));
  return { ...rest, outfit };
}

// A man's body as physics has it: his mass and what he carries, how his kit guards him, its metal and gaps.
function physical(inputs) {
  const body = buildBody(normaliseInputs(structuredClone(inputs)));
  const { gear } = body;
  return JSON.stringify({ massKg: body.massKg, gearKg: body.gearKg, extraMass: gear.extraMass, protection: gear.protection, metal: gear.metal, under: gear.under, cover: gear.cover, handCover: gear.handCover, helmet: gear.helmet, gaps: gear.gaps, mounted: gear.mounted });
}

// The look's fields a theme may paint: cloth, lacing, tassels, a cap's felt, a cloth coat's colour (its `armor.color` is its cloth),
// a lacquered helmet's own (through the kit's tint, drawn by wardrobe.js). Never the mail, the gilt, a plate's or a helmet's steel.
const PAINTABLE = new Set(['armor.cloth', 'armor.cloth2', 'armor.lace', 'armor.cord', 'head.tassel', 'head.coif', 'head.trim', 'top.color', 'bottom.color']);
const CLOTH_COATS = new Set(['escaupil', 'dolama', 'uncu', 'uncuChecks', 'deel', 'mongolDeel']);
const FELT_CAPS = new Set(['bork']);

function colourPaths(look, path = '', out = {}) {
  for (const [key, value] of Object.entries(look ?? {})) {
    const at = path ? `${path}.${key}` : key;
    if (typeof value === 'string' && value.startsWith('#')) out[at] = value;
    else if (value && typeof value === 'object' && !Array.isArray(value)) colourPaths(value, at, out);
  }
  return out;
}

function assertOnlyCloth(themed, plain, where) {
  const before = colourPaths(outfitOf(plain).look);
  const after = colourPaths(outfitOf(themed).look);
  const armour = outfitOf(plain).look.armor?.kind;
  const head = outfitOf(plain).look.head?.kind;
  for (const [path, colour] of Object.entries(after)) {
    if (before[path] === colour) continue;
    const allowed = PAINTABLE.has(path) || (path === 'armor.color' && CLOTH_COATS.has(armour)) || (path === 'head.color' && FELT_CAPS.has(head));
    assert.ok(allowed, `${where}: ${path} ${before[path]} -> ${colour}`);
  }
  // A Japanese kit's lacquer (the tint) goes on lacquered armour only, never on bare iron or polished steel.
  const lacquer = themed.outfit?.tint?.armor;
  if (lacquer && lacquer !== plain.outfit?.tint?.armor) {
    const own = outfitOf(plain).look.armor?.color;
    // (Steel and bare iron are greys of some lightness: a polished plate, a tōsei's russet-free iron.)
    const { sat, light } = hslOf(own);
    assert.ok(!(sat < 0.18 && light > 0.2), `${where}: lacquer over ${own}`);
  }
}

test('every battle\'s men are the same with their armies\' colours and without: kit, armour, mass, protection, weapons, numbers', () => {
  for (const key of Object.keys(SCENARIOS)) {
    if (!SCENARIOS[key].cast) continue;
    const themed = battleOf(key).cast(seededRandom(7));
    const plain = battleOf(key, { themes: false }).cast(seededRandom(7));
    for (const corner of Object.keys(plain)) {
      assert.equal(themed[corner].length, plain[corner].length, `${key} ${corner}: numbers`);
      themed[corner].forEach((inputs, index) => {
        const where = `${key} ${corner} #${index} ${inputs.outfit?.kind}`;
        assert.deepEqual(withoutColour(inputs), withoutColour(plain[corner][index]), where);
        assert.equal(physical(inputs), physical(plain[corner][index]), `${where}: body`);
        assertOnlyCloth(inputs, plain[corner][index], where);
      });
    }
  }
});

test('the story battles likewise', () => {
  for (const [id, battle] of Object.entries(STORY_BATTLES)) {
    const themes = BATTLE_THEMES[`story:${id}`];
    if (!themes) continue;
    const plain = battle.setup(storyNewLife(1), 1).fighters;
    const themed = themedFighters(plain, themes);
    themed.forEach((fighter, index) => {
      const where = `story ${id} #${index} ${fighter.inputs.outfit?.kind}`;
      assert.deepEqual(withoutColour(fighter.inputs), withoutColour(plain[index].inputs), where);
      assert.equal(physical(fighter.inputs), physical(plain[index].inputs), `${where}: body`);
      assertOnlyCloth(fighter.inputs, plain[index].inputs, where);
    });
  }
});

test('the sides can be told apart: the Ming red, the Japanese black under white sashimono, the banners without a red one', () => {
  const pyongyang = battleOf('pyongyang').cast(seededRandom(1));
  const brigandine = pyongyang.red.find((inputs) => inputs.outfit.kind === 'mingBrigandine');
  assert.ok(sameLook('mingRed', 'mingRed'));
  assert.match(outfitOf(brigandine).look.armor.cloth, /^#(9|a)/, 'a red coat');
  for (const inputs of pyongyang.blue) assert.equal(inputs.outfit.banner, '#ece5d3', 'a white sashimono');
  const sarhu = battleOf('sarhu').cast(seededRandom(1));
  for (const inputs of sarhu.blue) {
    const cloth = outfitOf(inputs).look.armor.cloth;
    const { r, g, b } = { r: parseInt(cloth.slice(1, 3), 16), g: parseInt(cloth.slice(3, 5), 16), b: parseInt(cloth.slice(5, 7), 16) };
    assert.ok(!(r > 140 && g < 70 && b < 70), `a red banner coat at Sarhu: ${cloth}`);
  }
  const agincourt = battleOf('agincourt').cast(seededRandom(1));
  assert.ok(agincourt.blue.every((inputs) => inputs.outfit.badge?.color === '#b3161b'), 'the red cross on every Englishman');
  assert.ok(agincourt.red.every((inputs) => inputs.outfit.badge?.color === '#ece5d3'), 'the white cross on every Frenchman');
});

test('a unit\'s native dress and the steel are left as they are: the garrison\'s own clothes, the Qi elite infantry\'s, the iron men', () => {
  for (const key of ['sarhu', 'zeelandia', 'wokou', 'qiJiguang']) {
    const cast = battleOf(key).cast(seededRandom(3));
    const plain = battleOf(key, { themes: false }).cast(seededRandom(3));
    for (const corner of Object.keys(cast)) {
      cast[corner].forEach((inputs, index) => {
        if (!['mingGarrison', 'mingEliteInfantry', 'mingElite', 'ronin'].includes(inputs.outfit.kind)) return;
        assert.deepEqual(inputs, plain[corner][index], `${key} ${inputs.outfit.kind}`);
      });
    }
  }
});

test('a colour picked by hand is never painted over', () => {
  const man = { name: 'Test', outfit: { kind: 'mingBrigandine', design: 1, colors: { top: '#123456' }, handColors: true } };
  assert.equal(themedMan(man, ['mingRed']).outfit.colors.top, '#123456');
  const horseman = { name: 'Test', outfit: { kind: 'mingIronLamellar', design: 1, colors: { top: '#123456' }, handColors: true } };
  assert.equal(themedMan(horseman, ['mingRed']).outfit.colors.top, '#123456');
  assert.notEqual(themedMan({ ...horseman, outfit: { ...horseman.outfit, handColors: false } }, ['mingRed']).outfit.colors.top, '#123456');
});

test('a custom battle\'s blue side wears its alternate where the two mains would look alike', () => {
  assert.deepEqual(factionThemes({ red: 'chinese', blue: 'chinese' }), { red: ['mingRed'], blue: ['mingDark'] });
  assert.deepEqual(factionThemes({ red: 'chinese', blue: 'manchu' }), { red: ['mingRed'], blue: ['banners'] });
  assert.deepEqual(factionThemes({ red: 'gladiators', blue: 'ring' }), { red: [], blue: [] });
  for (const { main, alt } of Object.values(FACTION_THEMES)) assert.ok(ARMY_THEMES[main] && ARMY_THEMES[alt]);
});

test('themed twice is themed once', () => {
  const cast = battleOf('agincourt').cast(seededRandom(2));
  for (const inputs of [...cast.red, ...cast.blue]) assert.deepEqual(themedMan(inputs, [inputs.outfit.theme]), inputs);
});
