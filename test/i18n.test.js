// The game in two languages (src/i18n.js): every text has both, every key used exists, and the switch keeps.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { KEEP_ENGLISH, LANGS, LANG_STORAGE_KEY, getLang, pick, setLang, t, tname } from '../src/i18n.js';
import { UI, UI_TABLES } from '../src/i18n/ui.js';
import { NAME_TABLES, NAMES_ZH } from '../src/i18n/names.js';

const SRC = new URL('../src/', import.meta.url).pathname;
const sourceFiles = (dir = SRC) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return sourceFiles(path);
  return name.endsWith('.js') && !name.endsWith('-data.js') ? [path] : [];
});
const keep = new Set(KEEP_ENGLISH);
const blank = (text) => typeof text !== 'string' || !text.trim();
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();
const CJK = /[㐀-鿿]/;
/**
 * A zh that is Chinese, or has no words to translate (only placeholders, glyphs and numbers), or is the English kept on purpose
 * (the en, its glyphs and trailing marks aside, on KEEP_ENGLISH).
 */
function chineseOrKept({ en, zh }) {
  if (CJK.test(zh) || !zh.replace(/\{\w+\}/g, '').replace(/[^\p{L}]+/gu, '')) return true;
  const kept = en.replace(/\{\w+\}/g, '').replace(/^[^\p{L}]+|[^\p{L}!.]+$/gu, '').trim();
  return keep.has(kept) || keep.has(en);
}

test('every UI string has both languages, the same placeholders, and Chinese unless it is kept English on purpose', () => {
  const seen = new Map();
  for (const [table, entries] of Object.entries(UI_TABLES)) {
    for (const [key, entry] of Object.entries(entries)) {
      assert.ok(!seen.has(key), `${key} is in both ${seen.get(key)} and ${table}`);
      seen.set(key, table);
      assert.ok(!blank(entry.en) && !blank(entry.zh), `${table} ${key}: en and zh both wanted`);
      assert.deepEqual(placeholders(entry.zh), placeholders(entry.en), `${key}: the zh has other placeholders than the en`);
      assert.ok(chineseOrKept(entry), `${key}: zh '${entry.zh}' is not Chinese and '${entry.en}' is not in KEEP_ENGLISH`);
    }
  }
});

test('every t() key used in the source, and every data-i18n key in index.html, is in the tables', () => {
  const used = new Map();
  for (const file of sourceFiles()) {
    for (const [, key] of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([a-z][\w-]*\.[\w.-]+)'/g)) used.set(key, file.replace(SRC, 'src/'));
  }
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const [, key] of html.matchAll(/data-i18n(?:-title|-aria|-placeholder)?="([^"]+)"/g)) used.set(key, 'index.html');
  const missing = [...used].filter(([key]) => !UI[key]).map(([key, file]) => `${key} (${file})`);
  assert.deepEqual(missing, []);
  assert.ok(used.size > 50, `only ${used.size} keys found: is the scan still finding them?`);
});

test('every name in the names catalogue is Chinese, and no English name is in two tables', () => {
  const seen = new Map();
  for (const [table, entries] of Object.entries(NAME_TABLES)) {
    for (const [english, zh] of Object.entries(entries)) {
      if (seen.has(english)) assert.equal(zh, NAMES_ZH[english], `${english}: two tables give it two names`);
      seen.set(english, table);
      assert.ok(!blank(zh), `${table} ${english}: no Chinese`);
      assert.ok(CJK.test(zh) || keep.has(english), `${table} ${english}: '${zh}' is not Chinese`);
    }
  }
});

/** Every `{ en, zh }` text reachable from a module's exports. */
function* bilingual(value, path, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (ArrayBuffer.isView(value)) return;
  if ('en' in value && typeof value.en === 'string') {
    yield [path, value];
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'object') yield* bilingual(child, `${path}.${key}`, seen);
  }
}

test('every { en, zh } text in the data has both, non-empty, and the Chinese is Chinese', async () => {
  let count = 0;
  const bad = [];
  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    if (!/\ben: /.test(source)) continue;
    let module;
    try {
      module = await import(file);
    } catch {
      continue; // (a module that needs a page: its texts are checked by the source scan below)
    }
    for (const [name, value] of Object.entries(module)) {
      for (const [path, text] of bilingual(value, `${file.replace(SRC, '')}:${name}`)) {
        count += 1;
        if (blank(text.en) || blank(text.zh)) bad.push(`${path}: missing a language`);
        else if (!chineseOrKept(text)) bad.push(`${path}: zh '${text.zh.slice(0, 40)}' is not Chinese`);
      }
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(count > 0);
});

test('in the source, every { en: ... } literal has its zh beside it', () => {
  const bad = [];
  for (const file of sourceFiles()) {
    if (file.endsWith('i18n.js')) continue;
    const source = readFileSync(file, 'utf8');
    // An `en:` key opening an object literal, and the next 400 characters after its string closes: the zh key must follow.
    for (const match of source.matchAll(/\{\s*en:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1\s*([,}])/g)) {
      const after = source.slice(match.index + match[0].length - 1, match.index + match[0].length + 20);
      if (!/^,\s*zh:/.test(after)) bad.push(`${file.replace(SRC, 'src/')}: '${match[2].slice(0, 40)}'`);
    }
  }
  assert.deepEqual(bad, []);
});

test('pick: the language in force, en when the other is missing; a string as it is', () => {
  const before = getLang();
  setLang('zh');
  assert.equal(pick({ en: 'Sword', zh: '剑' }), '剑');
  assert.equal(pick({ en: 'Sword' }), 'Sword');
  assert.equal(pick({ en: 'Sword', zh: '' }), 'Sword');
  assert.equal(pick('plain'), 'plain');
  assert.equal(pick(null), '');
  setLang('en');
  assert.equal(pick({ en: 'Sword', zh: '剑' }), 'Sword');
  setLang(before);
});

test('t fills its placeholders; an unknown key comes back as itself; tname leaves an unknown name English', () => {
  const before = getLang();
  const [key] = Object.keys(UI).filter((each) => placeholders(UI[each].en).length);
  if (key) {
    const vars = Object.fromEntries(placeholders(UI[key].en).map((name) => [name, `<${name}>`]));
    for (const lang of LANGS) {
      setLang(lang);
      for (const name of Object.keys(vars)) assert.ok(t(key, vars).includes(`<${name}>`), `${lang} ${key} lacks {${name}}`);
    }
  }
  assert.equal(t('no.such.key'), 'no.such.key');
  setLang('zh');
  assert.equal(tname('Nobody At All'), 'Nobody At All');
  setLang('en');
  assert.equal(tname('Noble Knight'), 'Noble Knight');
  setLang(before);
});

test('setLang persists the choice, tells its listeners, and survives a storage that throws', async () => {
  const saved = globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) };
  const fresh = await import(`../src/i18n.js?persist=${Date.now()}`);
  let heard = null;
  fresh.onLangChange((lang) => { heard = lang; });
  fresh.setLang(fresh.getLang() === 'zh' ? 'en' : 'zh');
  assert.equal(store.get(LANG_STORAGE_KEY), fresh.getLang());
  assert.equal(heard, fresh.getLang());
  // A second page load reads it back.
  const again = await import(`../src/i18n.js?reload=${Date.now()}`);
  assert.equal(again.getLang(), store.get(LANG_STORAGE_KEY));
  // A storage that throws on every touch (a private window): the module loads, falls back, and switches all the same.
  globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const blocked = await import(`../src/i18n.js?blocked=${Date.now()}`);
  assert.ok(LANGS.includes(blocked.getLang()));
  blocked.setLang('zh');
  assert.equal(blocked.getLang(), 'zh');
  assert.throws(() => blocked.setLang('fr'));
  globalThis.localStorage = saved;
});
