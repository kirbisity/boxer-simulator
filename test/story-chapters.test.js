// The story's chapter data: every chapter loads in order, every text is there in both languages, every choice's
// effects are plain data, every comrade a card, scene or flashback names exists, two or three choices are fatal in
// all, every chapter has its death page, and every `when` can be asked of a range of lives without throwing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, COMRADES, FLASHBACKS, STORY_FAMILY, STORY_HERO } from '../src/story/chapters/index.js';
import { PRESETS } from '../src/body.js';

const COMRADE_IDS = new Set(COMRADES.map((each) => each.id));
// Speakers in scene scripts who are not named comrades: roles the engine casts generically.
const ROLES = new Set(['hero', 'narrator', 'squadLeader', 'officer', 'official', 'northTrooper', 'wife', 'daughter', 'son']);
const EFFECT_KEYS = new Set(['rank', 'place', 'flags', 'bond', 'family', 'dies']);

// Every {zh, en} pair anywhere in a value, with where it was found.
function texts(value, path = 'root', found = []) {
  if (!value || typeof value !== 'object') return found;
  if ('zh' in value || 'en' in value) found.push({ path, value });
  for (const [key, child] of Object.entries(value)) if (typeof child === 'object') texts(child, `${path}.${key}`, found);
  return found;
}

const plain = (value) => JSON.stringify(value) === JSON.stringify(JSON.parse(JSON.stringify(value))) && !/function/.test(String(value));

function cards(chapter) {
  return [...chapter.before, ...chapter.after];
}

// A spread of lives to ask every `when` of: early and late, comrades alive and dead, flags on and off.
function lives(chapter) {
  const comrades = (alive) => COMRADES.map((each) => ({ id: each.id, name: each.name, alive, bond: 0, rank: 'soldier', diedAt: alive ? null : { chapter: chapter.n, how: 'battle' } }));
  const flags = { keptLetter: true, letterRead: true, married: true, jinExecuted: true, finished: true, drove: true, helpedOldMan: true, waitedForAhe: true, silentForDead: true };
  return [
    { chapter: chapter.n, rank: 'soldier', comrades: comrades(true), flags: {}, family: {} },
    { chapter: chapter.n, rank: 'officer', comrades: comrades(false), flags, family: { wife: true, son: true, daughter: true } },
    { chapter: chapter.n },
    {},
  ];
}
const OUTCOMES = [undefined, { hero: 'alive', leftPlace: false, comrades: {} }, { hero: 'out' }, { hero: 'alive', leftPlace: true, comrades: Object.fromEntries(COMRADES.map((each) => [each.id, 'dead'])) }];

test('the eight chapters load in the order of the life', () => {
  assert.equal(CHAPTERS.length, 8);
  CHAPTERS.forEach((chapter, index) => {
    assert.equal(chapter.n, index + 1, chapter.id);
    assert.ok(chapter.id && chapter.battle && chapter.year, chapter.id);
    assert.ok(Array.isArray(chapter.before) && Array.isArray(chapter.after) && Array.isArray(chapter.scenes), chapter.id);
  });
  const years = CHAPTERS.map((chapter) => chapter.year);
  assert.deepEqual(years, [...years].sort((a, b) => a - b));
  assert.ok(years[0] === 1587 && years[7] === 1621);
});

test('every text is there in Chinese and in English', () => {
  const all = [...texts(CHAPTERS, 'CHAPTERS'), ...texts(COMRADES, 'COMRADES'), ...texts(FLASHBACKS, 'FLASHBACKS'), ...texts(STORY_FAMILY, 'FAMILY'), ...texts(STORY_HERO, 'HERO')];
  assert.ok(all.length > 300, `only ${all.length} texts`);
  for (const { path, value } of all) {
    assert.ok(typeof value.zh === 'string' && value.zh.trim().length > 0, `${path}: no zh`);
    assert.ok(typeof value.en === 'string' && value.en.trim().length > 0, `${path}: no en`);
    assert.ok(/[一-鿿]/.test(value.zh), `${path}: zh has no Chinese`);
    assert.ok(!/[一-鿿]/.test(value.en.replace(/\([^)]*\)/g, '')), `${path}: Chinese outside a gloss in en`);
  }
});

test('card ids are unique and every card has text and a choices list', () => {
  const ids = new Set();
  for (const chapter of CHAPTERS) {
    for (const card of cards(chapter)) {
      assert.ok(!ids.has(card.id), `duplicate card ${card.id}`);
      ids.add(card.id);
      assert.ok(card.text, card.id);
      assert.ok(Array.isArray(card.choices), card.id);
      if (card.when) assert.equal(typeof card.when, 'function', card.id);
    }
  }
});

test('every choice\'s effects are plain data, with known keys', () => {
  for (const chapter of CHAPTERS) {
    for (const card of cards(chapter)) {
      for (const choice of card.choices) {
        assert.ok(choice.text, `${card.id}: a choice without text`);
        assert.ok(choice.effects && typeof choice.effects === 'object', `${card.id}: no effects`);
        assert.ok(plain(choice.effects), `${card.id}: effects not plain data`);
        for (const key of Object.keys(choice.effects)) assert.ok(EFFECT_KEYS.has(key), `${card.id}: unknown effect ${key}`);
        if (choice.effects.rank) assert.ok(['soldier', 'squadLeader', 'officer'].includes(choice.effects.rank), card.id);
        if (choice.fatal) assert.ok(plain(choice.fatal) && choice.fatal.how && choice.fatal.text, `${card.id}: fatal`);
      }
    }
  }
});

test('every comrade named exists, and every comrade is built from a real preset', () => {
  for (const man of COMRADES) {
    assert.ok(PRESETS[man.preset], `${man.id}: no preset ${man.preset}`);
    assert.ok(man.joins >= 1 && man.joins <= 8 && man.born, man.id);
  }
  assert.ok(COMRADES.length >= 6 && COMRADES.length <= 10);
  assert.ok(PRESETS[STORY_HERO.preset]);
  for (const chapter of CHAPTERS) {
    for (const card of cards(chapter)) {
      for (const choice of card.choices) {
        for (const id of Object.keys(choice.effects.bond ?? {})) assert.ok(COMRADE_IDS.has(id), `${card.id}: bond ${id}`);
        for (const id of Object.keys(choice.effects.dies ?? {})) assert.ok(COMRADE_IDS.has(id), `${card.id}: dies ${id}`);
      }
    }
    for (const scene of chapter.scenes) {
      // (A fatal choice's scene, `at: 'fatal'`, plays before its page.)
      assert.ok(['before', 'after', 'fatal'].includes(scene.at), scene.id);
      for (const line of scene.script) assert.ok(COMRADE_IDS.has(line.who) || ROLES.has(line.who), `${scene.id}: who ${line.who}`);
    }
  }
  for (const flashback of FLASHBACKS) for (const id of flashback.cast) assert.ok(COMRADE_IDS.has(id), `${flashback.id}: cast ${id}`);
});

test('two or three choices are fatal in all', () => {
  const fatal = CHAPTERS.flatMap((chapter) => cards(chapter).flatMap((card) => card.choices.filter((choice) => choice.fatal).map(() => `${chapter.id}/${card.id}`)));
  assert.ok(fatal.length >= 2 && fatal.length <= 3, fatal.join(', '));
});

test('every chapter has its death page', () => {
  for (const chapter of CHAPTERS) assert.ok(chapter.ending?.text?.zh && chapter.ending.text.en, chapter.id);
});

test('every when can be asked of any life and outcome without throwing', () => {
  for (const chapter of CHAPTERS) {
    for (const life of lives(chapter)) {
      for (const outcome of OUTCOMES) {
        for (const item of [...cards(chapter), ...chapter.scenes]) if (item.when) assert.equal(typeof item.when(life, outcome), 'boolean', item.id);
      }
    }
  }
  for (const life of lives(CHAPTERS[7])) for (const flashback of FLASHBACKS) assert.equal(typeof flashback.when(life), 'boolean', flashback.id);
});

test('the flashbacks: a pool of tones, and a last line for any life', () => {
  for (const flashback of FLASHBACKS) assert.ok(['heavy', 'sad', 'beautiful'].includes(flashback.tone), flashback.id);
  for (const tone of ['heavy', 'sad', 'beautiful']) assert.ok(FLASHBACKS.some((each) => each.tone === tone));
  for (const life of lives(CHAPTERS[7])) assert.ok(FLASHBACKS.some((each) => each.last && each.id !== 'fb-last-tag' && each.when(life)));
});

test('a comrade who fell is mourned, one who lived is not', () => {
  const ulsan = CHAPTERS[4];
  const life = { chapter: 5, comrades: COMRADES.map((each) => ({ id: each.id, alive: true })), flags: {} };
  const shown = (outcome) => ulsan.after.filter((card) => !card.when || card.when(life, outcome)).map((card) => card.id);
  assert.ok(shown({ hero: 'alive', comrades: { zhu: 'dead' } }).includes('ulsan-fell-zhu'));
  assert.ok(!shown({ hero: 'alive', comrades: { zhu: 'alive' } }).includes('ulsan-fell-zhu'));
  // A man who has not joined yet is not in the battle, even if the life lists him.
  assert.ok(!CHAPTERS[2].after.find((card) => card.id === 'pyongyang-fell-he').when({ chapter: 2, comrades: [{ id: 'he', alive: false, diedAt: { chapter: 2 } }] }, {}));
});
