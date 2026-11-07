// Soldiers' own names in Chinese (src/i18n.js tname, part by part from src/i18n/names-parts.js): every name the game makes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cast from '../src/cast.js';
import { LAST_GATE_MODES, lastGateRebel } from '../src/lastgate.js';
import { getLang, setLang, tname } from '../src/i18n.js';
import { NAME_PARTS, NAME_PARTS_EAST, NAME_TITLES } from '../src/i18n/names-parts.js';

const CJK = /[㐀-鿿]/;
const seeded = (seed) => {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};
// The generators' arguments that change the names they make (people, rank, type); the rest are called with their defaults.
const VARIANTS = {
  sengokuWarrior: [['east', 'katana'], ['west', 'spear']], samuraiHorseman: [['east']],
  mingSoldier: [['spear', 'garrison'], ['dao', 'elite'], ['dao', 'brigandine']], wokouRaider: [['dao', 'chinese'], ['dao', 'japanese']],
  europeanSoldier: [['hidalgo'], ['pikeman']], pikeman: [['swiss'], ['landsknecht']], hospitaller: [['longsword', 'knight'], ['longsword', 'sergeant']],
  ottomanSoldier: [['yatagan', 'janissary'], ['matchlock', 'azap']], englishArcher: [[]],
};
const NOT_SOLDIERS = new Set(['CAST', 'GLADIATORS', 'weightOf', 'redress', 'varyCharacter', 'drilledSoldier', 'randomBoxer', 'randomGladiator', 'randomCharacter']);

function everyName() {
  const names = new Set();
  for (const [key, make] of Object.entries(cast)) {
    if (typeof make !== 'function' || NOT_SOLDIERS.has(key)) continue;
    for (const args of VARIANTS[key] ?? [[]]) {
      for (let seed = 1; seed <= 120; seed += 1) names.add(make(seeded(seed * 7919), ...args).name);
    }
  }
  for (const spec of Object.values(LAST_GATE_MODES)) {
    if (!spec.people) continue;
    for (let seed = 1; seed <= 120; seed += 1) names.add(lastGateRebel(seeded(seed * 104729), 'unarmed', spec.people).name);
  }
  return [...names];
}

test('every soldier the game makes has a Chinese name in Chinese, and his English one in English', () => {
  const before = getLang();
  const names = everyName();
  assert.ok(names.length > 1000, `only ${names.length} names made`);
  setLang('zh');
  const english = names.filter((name) => !CJK.test(tname(name)));
  const samples = names.filter((_, index) => index % Math.floor(names.length / 20) === 0).slice(0, 20).map((name) => `${name} → ${tname(name)}`);
  console.log(samples.join('\n'));
  setLang('en');
  const changed = names.filter((name) => tname(name) !== name);
  setLang(before);
  assert.deepEqual(english, []);
  assert.deepEqual(changed, []);
});

test('the name parts: every one Chinese (a dropped particle aside), and no part both East and West', () => {
  for (const [table, parts] of Object.entries({ NAME_PARTS, NAME_PARTS_EAST, NAME_TITLES })) {
    for (const [part, zh] of Object.entries(parts)) assert.ok(CJK.test(zh), `${table} ${part}: '${zh}'`);
  }
  const both = Object.keys(NAME_PARTS).filter((part) => part in NAME_PARTS_EAST || part in NAME_TITLES);
  assert.deepEqual(both, []);
});

test('East Asian names run together, the others take the dot, titles go after', () => {
  const before = getLang();
  setLang('zh');
  assert.equal(tname('Wang Da'), '王大');
  assert.equal(tname('Wang Wu'), '王五');
  assert.equal(tname('Ii Naomasa'), '井伊直政');
  assert.equal(tname('Hans von Uri'), '汉斯·冯·乌里');
  assert.equal(tname('Sgt. Reyes'), '雷耶斯中士');
  assert.equal(tname('Sir Thomas de Beauchamp'), '托马斯·德·博尚爵士');
  assert.equal(tname('Aldo the Miller'), '阿尔多·磨坊主');
  assert.equal(tname('Jōmyō Hōshi'), '净妙法师');
  // Any part unknown: the whole name stays as it is.
  assert.equal(tname('Wang Nobody'), 'Wang Nobody');
  setLang(before);
});
