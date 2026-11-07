// The language story mode shows ('en' | 'zh'): the one place it is read, set and watched, so it can be pointed at the game's
// own setting (src/i18n.js: getLang / setLang / pick / a change event) when that lands: replace these four bodies with calls
// to it and nothing else in src/story/ changes. Until then it is kept in this browser (life.js storyLanguage: localStorage,
// in try/catch).

import { STORY, storyLanguage, storySetLanguage, storyText } from './life.js';

const storyLangWatchers = new Set();
// Chosen in this page (kept even where the storage is denied).
let storyLangNow = null;

/** The browser's storage, or null where it is denied. */
function storyLangStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The language now. */
export function storyGetLang() {
  return storyLangNow ?? storyLanguage(storyLangStorage());
}

/** Set it (kept), and tell whoever watches. Returns the language in force. */
export function storySetLang(language) {
  if (!STORY.languages.includes(language)) return storyGetLang();
  storyLangNow = language;
  storySetLanguage(storyLangStorage(), language);
  for (const watcher of storyLangWatchers) watcher(language);
  return language;
}

/** A { zh, en } text in the language now (English where the other is missing). */
export function storyPick(text, language = storyGetLang()) {
  return storyText(text, language);
}

/** Watch for a change of language: `fn(language)`. Returns a function that stops watching. */
export function storyOnLang(fn) {
  storyLangWatchers.add(fn);
  return () => storyLangWatchers.delete(fn);
}
