// The game's language: English or Chinese (中文), one setting for the whole game, kept in this browser.
//
// THE CONTRACT (for every module that shows words, the story mode's included):
//   getLang()          'en' or 'zh': the language in force. Read it when drawing, never cache it in data.
//   setLang(lang)      switch (persisted in localStorage under LANG_STORAGE_KEY; a storage that throws is shrugged off),
//                      then every onLangChange listener runs and a 'gladiator:lang' event ({ detail: { lang } }) fires on
//                      window, so an open screen draws itself again in the new language without a reload.
//   onLangChange(fn)   fn(lang) after every switch; returns the unsubscribe.
//   pick(text)         a text kept beside its data as { en, zh } → the one for the language in force (en when zh is missing
//                      or empty); a plain string passes through as it is. Long texts (a kit's story, a battle's blurb, story
//                      lines) live this way, next to the data they describe.
//   t(key, vars)       a UI chrome string by key (the tables in src/i18n/ui.js), `{name}` placeholders filled from vars;
//                      an unknown key comes back as the key itself (and the test in test/i18n.test.js catches it first).
//   tname(english)     a proper name that travels through the game's data as English (a unit's name in inputs.name, a kit's,
//                      a weapon's, a style's, a faction's, a place's): its Chinese from the names catalogue (src/i18n/names.js),
//                      or the English as it is when there is none. The data, saved fighters and setup codes stay English.
//   tlist(strings)     tname over a list, joined with the language's own separator.
//
// What stays English in Chinese on purpose (KEEP_ENGLISH): the short iconic game phrases a Chinese player reads as the genre's
// own, the way arcade and fighting games print them. A table entry whose zh is the same as its en must be on this list; the
// test reads it, so nothing is left English by accident.

import { UI } from './i18n/ui.js';
import { NAMES_ZH } from './i18n/names.js';

/** The languages, in the order the switch shows them. */
export const LANGS = ['en', 'zh'];
/** Each language's own name, as the switch shows it. */
export const LANG_NAMES = { en: 'English', zh: '中文' };
export const LANG_STORAGE_KEY = 'gladiator.lang';

/**
 * Deliberately English in Chinese mode: stylish fighting-game conventions Chinese players know as they are.
 * (Anything that explains, describes, names or instructs is translated.)
 */
export const KEEP_ENGLISH = ['KO', 'K.O.', 'VS', 'Fight!', 'Round', 'Victory', 'You died', 'Retry', 'Pause', 'Play', 'Restart', 'OUT', 'DOWN', 'KILLED', 'RED', 'BLUE', 'GO', 'Ready', 'Perfect', 'Game over', 'English', '中文'];

/** The language a first visit opens in: Chinese for a browser set to any Chinese, else English. */
function browserLang() {
  try {
    const wanted = (globalThis.navigator?.languages?.[0] ?? globalThis.navigator?.language ?? '').toLowerCase();
    return wanted.startsWith('zh') ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

function storedLang() {
  try {
    const kept = globalThis.localStorage?.getItem(LANG_STORAGE_KEY);
    return LANGS.includes(kept) ? kept : null;
  } catch {
    return null;
  }
}

let langNow = storedLang() ?? browserLang();
const langListeners = new Set();

export const getLang = () => langNow;

/** Mark the page with its language (CSS :lang(zh) and the CJK fonts follow it). */
function markLangOnPage() {
  try {
    if (globalThis.document?.documentElement) globalThis.document.documentElement.lang = langNow === 'zh' ? 'zh-CN' : 'en';
  } catch { /* no page (node) */ }
}
markLangOnPage();

export function setLang(next) {
  if (!LANGS.includes(next)) throw new Error(`setLang: no language '${next}' (have ${LANGS.join(', ')})`);
  const changed = next !== langNow;
  langNow = next;
  try {
    globalThis.localStorage?.setItem(LANG_STORAGE_KEY, next);
  } catch { /* a private window or blocked storage: the choice lasts this visit */ }
  if (!changed) return langNow;
  markLangOnPage();
  for (const listener of [...langListeners]) {
    try {
      listener(langNow);
    } catch (error) {
      console.error('a language listener failed', error);
    }
  }
  try {
    globalThis.dispatchEvent?.(new CustomEvent('gladiator:lang', { detail: { lang: langNow } }));
  } catch { /* no window (node) */ }
  return langNow;
}

/** Flip between the languages (the switch's one tap). */
export const toggleLang = () => setLang(LANGS[(LANGS.indexOf(langNow) + 1) % LANGS.length]);

export function onLangChange(listener) {
  langListeners.add(listener);
  return () => langListeners.delete(listener);
}

/** A `{ en, zh }` text in the language in force (en when the other is missing); a string as it is. */
export function pick(text) {
  if (text === null || text === undefined) return '';
  if (typeof text !== 'object') return String(text);
  return (langNow !== 'en' && text[langNow]) || text.en || '';
}

const fillVars = (template, vars) => (vars ? template.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole)) : template);

/** A UI string by key, its `{placeholders}` filled. */
export function t(key, vars) {
  const entry = UI[key];
  if (!entry) return key;
  return fillVars(pick(entry), vars);
}

/** A proper name kept English in the data, in the language in force. */
export function tname(english) {
  if (langNow === 'en' || english === null || english === undefined) return english ?? '';
  return NAMES_ZH[english] ?? english;
}

/** Names joined as the language joins a list. */
export const tlist = (strings) => strings.map(tname).join(langNow === 'zh' ? '、' : ', ');

/** The separator between the parts of a line ("Sword · Plate"), which the two languages share. */
export const SEP = ' · ';

/**
 * The page's static words (index.html) in the language in force: an element's `data-i18n` key sets its text, and
 * `data-i18n-title`, `data-i18n-aria` and `data-i18n-placeholder` its tooltip, aria-label and placeholder. Run at start and
 * on every switch (main.js).
 */
export function translatePage(root = globalThis.document) {
  if (!root?.querySelectorAll) return;
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of root.querySelectorAll('[data-i18n-title]')) node.title = t(node.dataset.i18nTitle);
  for (const node of root.querySelectorAll('[data-i18n-aria]')) node.setAttribute('aria-label', t(node.dataset.i18nAria));
  for (const node of root.querySelectorAll('[data-i18n-placeholder]')) node.placeholder = t(node.dataset.i18nPlaceholder);
}
