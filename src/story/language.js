// The language story mode shows ('en' | 'zh'): the game's one setting (src/i18n.js), read, set and watched here so the
// rest of src/story/ goes through one place.

import { getLang, onLangChange, setLang } from '../i18n.js';
import { STORY, storyText } from './life.js';

/** The language now. */
export function storyGetLang() {
  return getLang();
}

/** Set it (kept by i18n.js, which tells every view). Returns the language in force. */
export function storySetLang(language) {
  if (!STORY.languages.includes(language)) return storyGetLang();
  setLang(language);
  return getLang();
}

/** A { zh, en } text in the language now (English where the other is missing). */
export function storyPick(text, language = storyGetLang()) {
  return storyText(text, language);
}

/** Watch for a change of language: `fn(language)`. Returns a function that stops watching. */
export function storyOnLang(fn) {
  return onLangChange(fn);
}
