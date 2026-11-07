// Story mode: one Ming conscript's life, 1587-1621 (the spec: working-memory/projects/boxer-simulator/specs/2026-11-07-story-mode-conscript.md).
// This is the life's state and nothing else: pure, no DOM, run in Node by test/story-life.test.js.
//
//   life = { hero: { name, born, inputs, natural }, chapter, year, rank, place, kit,
//            comrades: [{ id, name, inputs, born, rank, alive, bond, diedAt: { chapter, year, how } | null }],
//            family: { [who]: { …, alive, diedAt } }, flags, passed: [chapter numbers lived through],
//            attempts: { [chapter]: n }, lives, record: [ending pages], checkpoint }
//
// Luck is the player's own: a chapter's share is 1 / the attempts it took, and every death at that chapter in any life is an
// attempt (`attempts[n]` is 1 + the deaths there). A life's luck is the product over the chapters it lived through: "1 in 48
// lived this life", "the luckiest 2%". A life that never fell says so.
// Effects are data (the chapters' cards, src/story/chapters/): this applies them. A choice may be fatal: the life ends there.
// Retrying the chapter is the same man as he entered it (`checkpoint`); beginning anew is a new man, the deaths kept.

import { greyedHair } from '../aging.js';
import { normaliseInputs, PRESETS } from '../body.js';
import { mingSoldier, varyCharacter } from '../cast.js';
import { seededRandom } from '../physics.js';

export const STORY = {
  // He was born c. 1568 (the spec): nineteen at the suppression of 1587, fifty-three at the Hun River.
  born: 1568,
  // The save and the language, in this browser (localStorage, each read and write in try/catch).
  storageKey: 'gladiator.story.v1',
  languageKey: 'gladiator.story.lang',
  version: 1,
  languages: ['zh', 'en'],
  // The kit by rank (outfits.js): the garrison man's padded coat, the brigandine of a squad leader, an officer's elite coat.
  kit: { soldier: 'mingGarrison', squadLeader: 'mingBrigandine', officer: 'mingElite' },
  ranks: ['soldier', 'squadLeader', 'officer'],
  // His place in the line: the front rank, the second, the rear (a battle file reads it to stand him there).
  places: ['front', 'second', 'rear'],
  // A Yiwu man: a southerner (cast.js PERIOD_BUILD.mingSouth), a garrison spearman when he enters the register.
  people: 'mingSouth',
  style: 'spear',
  // The hero's own name, both ways, unless the chapters name him (chapters/family.js STORY_HERO, given as `hero`).
  name: { zh: '陈二', en: 'Chen Er' },
};

const clone = (value) => (value === undefined ? undefined : structuredClone(value));
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const ageIn = (born, year) => Math.max(16, Math.round(year - born));

/** The hero's body as made when the life begins: a southern garrison spearman, from the life's seed. */
function storyHeroBase(seed, preset = null) {
  const random = seededRandom(seed);
  const inputs = mingSoldier(random, PRESETS[preset]?.style ?? STORY.style, 'garrison', { people: STORY.people });
  return normaliseInputs({ ...inputs, name: STORY.name.en, outfit: { kind: STORY.kit.soldier, design: 0 } });
}

/** A comrade's body (a COMRADES entry): its `preset` a PRESETS key (varied by his seed) or inputs of his own. */
function storyComradeInputs(entry, seed) {
  const random = seededRandom(seed);
  const preset = typeof entry.preset === 'string' ? PRESETS[entry.preset] : entry.preset;
  const base = preset ? (typeof entry.preset === 'string' ? varyCharacter(preset, random, { sex: 'male' }) : normaliseInputs(structuredClone(preset))) : mingSoldier(random, 'spear', 'garrison', { people: STORY.people });
  return normaliseInputs({ ...base, sex: 'male', name: entry.name?.en ?? base.name });
}

/** A string hash, for a stable seed per comrade. */
function storyHash(text) {
  let hash = 2166136261;
  for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

/**
 * A new life. `previous`: the life before (its deaths, lives and record carried on: the player's luck is all his tries).
 * `seed` makes the man (a new man each life unless given). `family`: the FAMILY entries (src/story/chapters/), as data.
 */
export function storyNewLife(previous = null, { seed = null, family = {}, hero = null } = {}) {
  const lives = (previous?.lives ?? 0) + 1;
  const heroSeed = seed ?? (storyHash(`hero:${lives}`) ^ (previous?.record?.length ?? 0));
  const inputs = storyHeroBase(heroSeed, hero?.preset);
  const name = clone(hero?.name) ?? clone(STORY.name);
  inputs.name = name.en;
  const life = {
    version: STORY.version,
    seed: heroSeed,
    hero: { name, born: hero?.born ?? STORY.born, inputs, natural: inputs.look?.hairColor ?? null },
    chapter: 0,
    year: null,
    rank: 'soldier',
    place: 'front',
    kit: STORY.kit.soldier,
    comrades: [],
    // His family as the life begins: those born before him (his elder brother); the rest come into it by a card's choice
    // (`family: { wife: true }`: chapters/family.js), and read as their entry there.
    family: Object.fromEntries(Object.entries(family).filter(([, entry]) => (entry.born ?? -Infinity) < (hero?.born ?? STORY.born)).map(([who, entry]) => [who, { ...clone(entry), alive: true, diedAt: null }])),
    flags: {},
    passed: [],
    attempts: clone(previous?.attempts) ?? {},
    lives,
    record: clone(previous?.record) ?? [],
    dead: null,
    checkpoint: null,
  };
  return life;
}

/** The fields of a life that belong to the player, not to the man: kept through a retry and into the next life. */
const STORY_GLOBAL = ['attempts', 'lives', 'record'];

/** The man as he is, without the player's fields or the checkpoint (what a retry goes back to). */
function storySnapshot(life) {
  const snapshot = {};
  for (const [key, value] of Object.entries(life)) if (!STORY_GLOBAL.includes(key) && key !== 'checkpoint') snapshot[key] = clone(value);
  return snapshot;
}

/** The hero's fighter inputs in a year: his age then (aging.js reads it into his body), his hair greying with it, his rank's kit. */
export function storyHeroInputs(life, year = life.year ?? life.hero.born + 19) {
  const inputs = normaliseInputs(clone(life.hero.inputs));
  inputs.age = ageIn(life.hero.born, year);
  inputs.name = life.hero.name.en;
  if (life.hero.natural && inputs.look) inputs.look.hairColor = greyedHair(life.hero.natural, inputs.age);
  inputs.outfit = { ...inputs.outfit, kind: STORY.kit[life.rank] ?? STORY.kit.soldier };
  return normaliseInputs(inputs);
}

/** A comrade's fighter inputs in a year (his age then, greying). */
export function storyComradeFighter(comrade, year) {
  const inputs = normaliseInputs(clone(comrade.inputs));
  inputs.age = ageIn(comrade.born, year);
  if (comrade.natural && inputs.look) inputs.look.hairColor = greyedHair(comrade.natural, inputs.age);
  inputs.outfit = { ...inputs.outfit, kind: STORY.kit[comrade.rank] ?? inputs.outfit?.kind ?? STORY.kit.soldier };
  return normaliseInputs(inputs);
}

/**
 * Into a chapter: its year, his age, the comrades who join him by then (COMRADES `joins` ≤ the chapter's n), his kit; and the
 * checkpoint a retry goes back to. The attempt is counted only by a death (storyDie): an attempt is 1 + the deaths there.
 */
export function storyEnterChapter(life, chapter, { comrades = [] } = {}) {
  life.chapter = chapter.n;
  life.year = chapter.year;
  life.kit = STORY.kit[life.rank] ?? STORY.kit.soldier;
  life.attempts[chapter.n] ??= 1;
  for (const entry of comrades) {
    if ((entry.joins ?? 1) > chapter.n || life.comrades.some((comrade) => comrade.id === entry.id)) continue;
    const inputs = storyComradeInputs(entry, storyHash(`${life.seed}:${entry.id}`));
    life.comrades.push({
      id: entry.id, name: clone(entry.name) ?? { zh: entry.id, en: entry.id }, inputs, natural: inputs.look?.hairColor ?? null, joins: entry.joins ?? 1,
      born: entry.born ?? chapter.year - (inputs.age ?? 22), rank: entry.rank ?? 'soldier', alive: true, bond: entry.bond ?? 0, diedAt: null,
    });
  }
  // A comrade still living rises as his entry says (`rises`: [{ chapter, rank }]).
  for (const comrade of life.comrades) {
    const entry = comrades.find((each) => each.id === comrade.id);
    for (const rise of entry?.rises ?? []) if (comrade.alive && rise.chapter <= chapter.n && STORY.ranks.includes(rise.rank)) comrade.rank = rise.rank;
  }
  life.checkpoint = storySnapshot(life);
  return life;
}

/** A comrade by id, or a family member by name (`family[who]`), or null. */
export function storyPerson(life, id) {
  return life.comrades.find((comrade) => comrade.id === id) ?? (life.family[id] ? { id, ...life.family[id] } : null);
}

/**
 * Apply a choice's effects (data: { rank?, place?, flags?, bond?: { id: n }, family?: { who: { … } }, comrades?: { id: { … } } }).
 * Unknown keys are left alone (a later chapter's own may be read by its cards through `flags`).
 */
export function storyApplyEffects(life, effects = {}) {
  if (!isObject(effects)) return life;
  if (STORY.ranks.includes(effects.rank)) {
    life.rank = effects.rank;
    life.kit = STORY.kit[effects.rank];
  }
  if (typeof effects.place === 'string') life.place = effects.place;
  if (isObject(effects.flags)) Object.assign(life.flags, clone(effects.flags));
  if (isObject(effects.bond)) {
    for (const [id, change] of Object.entries(effects.bond)) {
      const comrade = life.comrades.find((each) => each.id === id);
      if (comrade && Number.isFinite(change)) comrade.bond += change;
    }
  }
  if (isObject(effects.family)) {
    for (const [who, change] of Object.entries(effects.family)) life.family[who] = isObject(change) ? { ...life.family[who], ...clone(change) } : clone(change);
  }
  // A named man killed off the battlefield (`dies: { id: how }`: executed after the pay protest, …).
  if (isObject(effects.dies)) for (const [id, how] of Object.entries(effects.dies)) storyMarkDead(life, id, { how });
  if (isObject(effects.comrades)) {
    for (const [id, change] of Object.entries(effects.comrades)) {
      const comrade = life.comrades.find((each) => each.id === id);
      if (comrade && isObject(change)) Object.assign(comrade, clone(change));
    }
  }
  return life;
}

/**
 * The player chooses `index` of a card's choices: its effects applied. Returns { fatal } (the choice's `fatal`, or null): a fatal
 * choice ends the life where it stands (the caller writes its death with storyDie).
 */
export function storyChoose(life, card, index) {
  const choice = card?.choices?.[index];
  if (!choice) return { fatal: null, choice: null };
  storyApplyEffects(life, choice.effects);
  return { fatal: choice.fatal ?? null, choice };
}

/** A named man fallen (a comrade or one of his family): dead in the story from now on, with how. */
export function storyMarkDead(life, id, { chapter = life.chapter, year = life.year, how = null } = {}) {
  const comrade = life.comrades.find((each) => each.id === id);
  const diedAt = { chapter, year, how: clone(how) };
  if (comrade) {
    if (!comrade.alive) return comrade;
    comrade.alive = false;
    comrade.diedAt = diedAt;
    return comrade;
  }
  if (life.family[id]) {
    if (life.family[id].alive === false) return life.family[id];
    life.family[id] = { ...life.family[id], alive: false, diedAt };
    return life.family[id];
  }
  return null;
}

/** A chapter lived through: counted for his luck, and the next is his. */
export function storyPassChapter(life, n = life.chapter) {
  if (!life.passed.includes(n)) life.passed.push(n);
  return life;
}

/**
 * His luck: the product over the chapters he lived through of 1 / the attempts each took (deaths in any life count). `odds`
 * is N in "1 in N lived this life"; `percent` the luckiest p%; `never` true when it took no retry anywhere.
 */
export function storyLuck(life, chapters = life.passed) {
  const odds = chapters.reduce((product, n) => product * Math.max(1, life.attempts[n] ?? 1), 1);
  const percent = 100 / odds;
  return { odds, share: 1 / odds, percent, never: odds === 1, text: storyLuckText({ odds, percent }) };
}

/** A percentage as people say it: 50%, 12%, 2%, 0.4%, 0.03%. */
function storyPercent(percent) {
  if (percent >= 10) return String(Math.round(percent));
  if (percent >= 1) return String(Math.round(percent * 10) / 10);
  const digits = Math.max(1, -Math.floor(Math.log10(percent)) + 1);
  return percent.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
}

/** The luck in words, both ways: the never-fell case, "1 in N lived this life", "the luckiest p%". */
export function storyLuckText({ odds, percent }) {
  if (odds <= 1) return { zh: '他一次也没有倒下。', en: 'He never fell once.', odds: { zh: '他一次也没有倒下。', en: 'He never fell once.' }, rank: { zh: '', en: '' } };
  const p = storyPercent(percent);
  const n = odds >= 100 ? Math.round(odds).toLocaleString('en-US') : String(Math.round(odds * 10) / 10);
  return {
    zh: `${n} 人中只有一人活成这一生。他是最幸运的 ${p}%。`,
    en: `1 in ${n} lived this life. He was the luckiest ${p}%.`,
    odds: { zh: `${n} 人中只有一人活成这一生。`, en: `1 in ${n} lived this life.` },
    rank: { zh: `最幸运的 ${p}%`, en: `the luckiest ${p}%` },
  };
}

/**
 * His death: counted as an attempt at this chapter (`attempts`), and the ending page written into the record. `death`: { where
 * ({zh,en}), how ({zh,en} or a kind), text ({zh,en}: the chapter's ending lines or the fatal choice's), kind ('battle' | 'fatal' | …) }.
 * Returns the page.
 */
export function storyDie(life, death = {}) {
  const n = life.chapter;
  life.attempts[n] = (life.attempts[n] ?? 1) + 1;
  const luck = storyLuck(life);
  const page = {
    life: life.lives,
    name: clone(life.hero.name),
    chapter: n,
    year: life.year,
    age: life.year ? ageIn(life.hero.born, life.year) : null,
    rank: life.rank,
    where: clone(death.where) ?? null,
    how: clone(death.how) ?? null,
    text: clone(death.text) ?? null,
    kind: death.kind ?? 'battle',
    outlived: life.comrades.filter((comrade) => comrade.alive).map((comrade) => ({ id: comrade.id, name: clone(comrade.name) })),
    fallen: life.comrades.filter((comrade) => !comrade.alive).map((comrade) => ({ id: comrade.id, name: clone(comrade.name), diedAt: clone(comrade.diedAt) })),
    family: clone(life.family),
    luck: { odds: luck.odds, percent: luck.percent, never: luck.never },
    passed: [...life.passed],
  };
  life.dead = page;
  life.record.push(page);
  return page;
}

/** The ending of a life that lived through every chapter: written into the record, as a death is (no attempt counted). */
export function storyLivedThrough(life, ending = {}) {
  const luck = storyLuck(life);
  const page = {
    life: life.lives, name: clone(life.hero.name), chapter: life.chapter, year: life.year, age: life.year ? ageIn(life.hero.born, life.year) : null,
    rank: life.rank, where: clone(ending.where) ?? null, how: null, text: clone(ending.text) ?? null, kind: 'lived',
    outlived: life.comrades.filter((comrade) => comrade.alive).map((comrade) => ({ id: comrade.id, name: clone(comrade.name) })),
    fallen: life.comrades.filter((comrade) => !comrade.alive).map((comrade) => ({ id: comrade.id, name: clone(comrade.name), diedAt: clone(comrade.diedAt) })),
    family: clone(life.family), luck: { odds: luck.odds, percent: luck.percent, never: luck.never }, passed: [...life.passed],
  };
  life.dead = page;
  life.record.push(page);
  return page;
}

/** Retry the chapter as the same man: as he entered it (its checkpoint), the deaths, lives and record kept. */
export function storyRetry(life) {
  if (!life.checkpoint) return life;
  const again = { ...clone(life.checkpoint), checkpoint: clone(life.checkpoint) };
  for (const key of STORY_GLOBAL) again[key] = clone(life[key]);
  again.dead = null;
  return again;
}

/** Begin a new man: a new life from the first chapter, the deaths and the record carried on. */
export function storyBeginAnew(life, options = {}) {
  return storyNewLife(life, options);
}

// ---- Save and load ---------------------------------------------------------------------------------------------------------

/** Whether a loaded thing is a life this code can play (a save from an older shape, or rubbish, is not). */
export function storyValidLife(life) {
  return isObject(life) && life.version === STORY.version && isObject(life.hero) && isObject(life.hero.inputs) && isObject(life.hero.name)
    && Number.isFinite(life.chapter) && Array.isArray(life.comrades) && life.comrades.every((comrade) => isObject(comrade) && typeof comrade.id === 'string')
    && isObject(life.family) && isObject(life.flags) && isObject(life.attempts) && Array.isArray(life.record) && Array.isArray(life.passed)
    && STORY.ranks.includes(life.rank) && Number.isFinite(life.lives);
}

/** The life saved in `storage` (localStorage or anything with getItem), or null: none, unreadable, or not a life. Never throws. */
export function storyLoad(storage) {
  try {
    const text = storage?.getItem(STORY.storageKey);
    if (!text) return null;
    const life = JSON.parse(text);
    return storyValidLife(life) ? life : null;
  } catch {
    return null;
  }
}

/** Save the life (true if it was written). Never throws: a page denied its storage plays on unsaved. */
export function storySave(storage, life) {
  try {
    if (!storage || !storyValidLife(life)) return false;
    storage.setItem(STORY.storageKey, JSON.stringify(life));
    return true;
  } catch {
    return false;
  }
}

/** Forget the saved life (the record with it). */
export function storyForget(storage) {
  try {
    storage?.removeItem(STORY.storageKey);
    return true;
  } catch {
    return false;
  }
}

/** The language chosen ('zh' | 'en'), English unless chosen. */
export function storyLanguage(storage) {
  try {
    const value = storage?.getItem(STORY.languageKey);
    return STORY.languages.includes(value) ? value : 'en';
  } catch {
    return 'en';
  }
}

/** Remember the language chosen. */
export function storySetLanguage(storage, language) {
  if (!STORY.languages.includes(language)) return false;
  try {
    storage?.setItem(STORY.languageKey, language);
    return true;
  } catch {
    return false;
  }
}

/** A {zh, en} text in a language (a plain string is the same in both; a missing one is ''). */
export function storyText(text, language = 'en') {
  if (text === null || text === undefined) return '';
  if (typeof text === 'string') return text;
  return text[language] ?? text.en ?? text.zh ?? '';
}
