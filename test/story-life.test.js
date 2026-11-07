// Story mode's life (src/story/life.js): the luck from the player's own tries (1 / the attempts each chapter took, deaths in any
// life counted), a fatal choice ending a life, effects applied as data, retrying the same man against beginning a new one, the
// hero aged by the chapter's year, his kit by rank, and save and load that survive rubbish.

import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY, storyApplyEffects, storyBeginAnew, storyChoose, storyDie, storyEnterChapter, storyHeroInputs, storyLanguage, storyLoad, storyLuck, storyMarkDead, storyNewLife, storyPassChapter, storyRetry, storySave, storySetLanguage, storyValidLife } from '../src/story/life.js';
import { ageing } from '../src/aging.js';

const COMRADES = [
  { id: 'chen', name: { zh: '陈', en: 'Chen' }, preset: 'mingSpear', joins: 1, bond: 1 },
  { id: 'lou', name: { zh: '楼', en: 'Lou' }, preset: 'mingSpear', joins: 2 },
];
const chapter = (n, year) => ({ id: `c${n}`, n, year, title: { zh: `第${n}章`, en: `Chapter ${n}` }, before: [], after: [] });
const memory = () => {
  const store = new Map();
  return { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key), store };
};

test('a new life: chapter 0, a private soldier in the front rank, his kit the garrison coat, nineteen in 1587', () => {
  const life = storyNewLife(null, { seed: 5, family: { brother: { name: { zh: '吴大', en: 'Wu Da' } } } });
  assert.equal(life.rank, 'soldier');
  assert.equal(life.place, 'front');
  assert.equal(life.lives, 1);
  assert.equal(life.family.brother.alive, true);
  storyEnterChapter(life, chapter(1, 1587), { comrades: COMRADES });
  const inputs = storyHeroInputs(life);
  assert.equal(inputs.age, 1587 - STORY.born);
  assert.equal(inputs.outfit.kind, 'mingGarrison');
  // Only the comrades who have joined by this chapter.
  assert.deepEqual(life.comrades.map((comrade) => comrade.id), ['chen']);
});

test('the hero is aged by the chapter\'s year through aging.js, and wears his rank\'s kit', () => {
  const life = storyNewLife(null, { seed: 5 });
  storyEnterChapter(life, chapter(8, 1621));
  storyApplyEffects(life, { rank: 'officer' });
  const old = storyHeroInputs(life);
  assert.equal(old.age, 1621 - STORY.born);
  assert.equal(old.outfit.kind, 'mingElite');
  // (At nineteen he is not yet at his peak either: aging.js has strength peak at 25-30.)
  const prime = storyHeroInputs(life, 1597);
  assert.ok(ageing(old).aerobic < ageing(prime).aerobic && ageing(old).joints < ageing(prime).joints, 'fifty-three has less wind and worse joints than twenty-nine');
});

test('effects are data: rank, place, flags, bonds, family; unknown keys and rubbish are left alone', () => {
  const life = storyNewLife(null, { seed: 1, family: { brother: { name: { zh: '吴大', en: 'Wu Da' } } } });
  storyEnterChapter(life, chapter(1, 1587), { comrades: COMRADES });
  storyApplyEffects(life, { rank: 'squadLeader', place: 'second', flags: { letter: true }, bond: { chen: 2, nobody: 5 }, family: { brother: { buried: true } }, weird: 1 });
  assert.equal(life.rank, 'squadLeader');
  assert.equal(life.kit, 'mingBrigandine');
  assert.equal(life.place, 'second');
  assert.equal(life.flags.letter, true);
  assert.equal(life.comrades[0].bond, 3);
  assert.equal(life.family.brother.buried, true);
  assert.equal(life.family.brother.name.en, 'Wu Da');
  storyApplyEffects(life, null);
  storyApplyEffects(life, { rank: 'emperor' });
  assert.equal(life.rank, 'squadLeader');
});

test('a fatal choice ends the life: an attempt counted at that chapter, the ending page written', () => {
  const life = storyNewLife(null, { seed: 2 });
  storyEnterChapter(life, chapter(3, 1593), { comrades: COMRADES });
  const card = { id: 'credit', text: { zh: '', en: '' }, choices: [{ text: { zh: '沉默', en: 'Say nothing' }, effects: {} }, { text: { zh: '说出来', en: 'Speak up' }, effects: { flags: { spoke: true } }, fatal: { how: 'executed', text: { zh: '被斩', en: 'Beheaded' } } }] };
  assert.equal(storyChoose(life, card, 0).fatal, null);
  const { fatal } = storyChoose(life, card, 1);
  assert.equal(fatal.how, 'executed');
  assert.equal(life.flags.spoke, true);
  const page = storyDie(life, { kind: 'fatal', how: fatal.how, text: fatal.text });
  assert.equal(page.chapter, 3);
  assert.equal(page.kind, 'fatal');
  assert.equal(life.attempts[3], 2);
  assert.equal(life.record.length, 1);
  assert.deepEqual(page.outlived.map((comrade) => comrade.id), ['chen', 'lou']);
});

test('luck: the product of 1 / attempts over the chapters he lived through; deaths in any life count; the never-fell case', () => {
  let life = storyNewLife(null, { seed: 3 });
  storyEnterChapter(life, chapter(1, 1587));
  storyPassChapter(life);
  storyEnterChapter(life, chapter(2, 1588));
  assert.equal(storyLuck(life).never, true);
  assert.match(storyLuck(life).text.en, /never fell/);
  // Dies at chapter 2 twice (once as this man, once as the next), then a third man lives through it.
  storyDie(life, {});
  life = storyBeginAnew(life);
  assert.equal(life.lives, 2);
  storyEnterChapter(life, chapter(1, 1587));
  storyPassChapter(life);
  storyEnterChapter(life, chapter(2, 1588));
  storyDie(life, {});
  life = storyRetry(life);
  assert.equal(life.lives, 2, 'a retry is the same man');
  assert.equal(life.chapter, 2);
  storyPassChapter(life);
  // Chapter 1 took one try; chapter 2 took three (two deaths in two lives, then this): 1 in 3.
  const luck = storyLuck(life);
  assert.equal(luck.odds, 3);
  assert.ok(Math.abs(luck.percent - 100 / 3) < 1e-9);
  assert.match(luck.text.en, /^1 in 3 lived this life\. He was the luckiest 33%\.$/);
  assert.match(luck.text.zh, /3 人中只有一人/);
  // More chapters multiply: chapter 3 at its fourth try.
  life.attempts[3] = 4;
  storyPassChapter(life, 3);
  assert.equal(storyLuck(life).odds, 12);
  assert.match(storyLuck(life).text.en, /luckiest 8\.3%/);
  life.attempts[4] = 4;
  storyPassChapter(life, 4);
  assert.match(storyLuck(life).text.en, /1 in 48 lived this life/);
});

test('retry goes back to the man as he entered the chapter; beginning anew is a new man, the record kept', () => {
  const life = storyNewLife(null, { seed: 9 });
  storyEnterChapter(life, chapter(1, 1587), { comrades: COMRADES });
  storyApplyEffects(life, { flags: { brave: true }, bond: { chen: 4 } });
  storyMarkDead(life, 'chen', { how: { zh: '被杀', en: 'killed' } });
  storyDie(life, {});
  const again = storyRetry(life);
  assert.equal(again.flags.brave, undefined);
  assert.equal(again.comrades[0].alive, true);
  assert.equal(again.comrades[0].bond, 1);
  assert.equal(again.attempts[1], 2);
  assert.equal(again.record.length, 1);
  assert.equal(again.dead, null);
  const fresh = storyBeginAnew(again);
  assert.equal(fresh.lives, 2);
  assert.equal(fresh.chapter, 0);
  assert.equal(fresh.comrades.length, 0);
  assert.equal(fresh.record.length, 1);
  assert.equal(fresh.attempts[1], 2);
  assert.notEqual(fresh.seed, life.seed);
});

test('a comrade or one of the family marked dead stays dead, with how', () => {
  const life = storyNewLife(null, { seed: 4, family: { brother: { name: { zh: '吴大', en: 'Wu Da' } } } });
  storyEnterChapter(life, chapter(1, 1587), { comrades: COMRADES });
  storyMarkDead(life, 'brother', { how: { zh: '倒在泥里', en: 'in the mud' } });
  storyMarkDead(life, 'chen', { how: { zh: '被杀', en: 'killed' } });
  storyMarkDead(life, 'chen', { how: { zh: '又一次', en: 'again' } });
  assert.equal(life.family.brother.alive, false);
  assert.equal(life.family.brother.diedAt.how.en, 'in the mud');
  assert.equal(life.comrades[0].diedAt.how.en, 'killed');
  assert.equal(storyMarkDead(life, 'nobody'), null);
});

test('save and load: the life comes back; rubbish, an old shape, a throwing storage or none at all give null and never throw', () => {
  const storage = memory();
  const life = storyNewLife(null, { seed: 6 });
  storyEnterChapter(life, chapter(1, 1587), { comrades: COMRADES });
  assert.equal(storySave(storage, life), true);
  const back = storyLoad(storage);
  assert.ok(storyValidLife(back));
  assert.deepEqual(back.comrades.map((comrade) => comrade.id), ['chen']);
  for (const rubbish of ['{', 'null', '42', '"text"', '[]', '{"version":1}', JSON.stringify({ ...life, version: 0 }), JSON.stringify({ ...life, rank: 'king' }), JSON.stringify({ ...life, comrades: [{ id: 5 }] })]) {
    storage.setItem(STORY.storageKey, rubbish);
    assert.equal(storyLoad(storage), null, rubbish.slice(0, 40));
  }
  const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.equal(storyLoad(throwing), null);
  assert.equal(storySave(throwing, life), false);
  assert.equal(storyLoad(null), null);
  assert.equal(storySave(null, life), false);
  assert.equal(storySave(storage, { not: 'a life' }), false);
});

test('the language: English unless chosen, kept, tolerant of a storage that throws', () => {
  const storage = memory();
  assert.equal(storyLanguage(storage), 'en');
  assert.equal(storySetLanguage(storage, 'zh'), true);
  assert.equal(storyLanguage(storage), 'zh');
  assert.equal(storySetLanguage(storage, 'fr'), false);
  storage.setItem(STORY.languageKey, 'klingon');
  assert.equal(storyLanguage(storage), 'en');
  const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.equal(storyLanguage(throwing), 'en');
  assert.equal(storySetLanguage(throwing, 'zh'), false);
});
