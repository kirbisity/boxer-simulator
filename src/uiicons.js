import { onLangChange } from './i18n.js';

// The interface's own icons: one hand for all of them (a 24 px square, a 1.5 px line, no fill), drawn here as inline SVG (no assets),
// in the colour of the text around them. The game's data names its pictures by an emoji (a faction's, a mode's, a stage's): the
// interface asks here for the drawn one; one not drawn yet is shown as the emoji, toned to the page (boxer.css `.glyph.emoji`).

const UI_ICON_PATHS = {
  // Career: a cup.
  '🏆': '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5.2c0 2.2 1.2 3.6 3.1 4M16 6h2.8c0 2.2-1.2 3.6-3.1 4"/><path d="M12 13v4M9.5 17h5v3h-5zM7.5 20h9"/>',
  // Story: a bound book.
  '📜': '<path d="M6 6.5a2.5 2.5 0 0 1 2.5-2.5H18v12.5H8.5A2.5 2.5 0 0 0 6 19z"/><path d="M6 19a2.5 2.5 0 0 0 2.5 1.5H18v-4"/><path d="M10 8h5M10 11h5"/>',
  // Battles: a standard on its pole.
  '🗺': '<path d="M6 3v18"/><path d="M6 4.5h12.5l-3 3.5 3 3.5H6"/>',
  // The stage: a gate tower.
  '🏰': '<path d="M5 4h3v2h2.5V4h3v2H16V4h3v4.5L17.5 10v11h-11V10L5 8.5z"/><path d="M10 21v-4.5a2 2 0 0 1 4 0V21"/>',
  // The last stand: a shield.
  '🛡': '<path d="M12 3l7 2.5V11c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V5.5z"/><path d="M12 3v18M5 10.5h14"/>',
  // Who would win: a skull.
  '☠': '<path d="M12 3a7.5 7.5 0 0 0-7.5 7.5c0 2.6 1.3 4.6 3 5.8V19a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-2.7c1.7-1.2 3-3.2 3-5.8A7.5 7.5 0 0 0 12 3z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M10.5 17.5V20M13.5 17.5V20"/>',
  // The quick fight: a bolt.
  '⚡': '<path d="M13 3L5 13.5h6L10 21l8.5-11h-6z"/>',
  // The sandbox: a flask.
  '🧪': '<path d="M9.5 3h5M10.5 3v6.2L5.2 18.6A1.6 1.6 0 0 0 6.6 21h10.8a1.6 1.6 0 0 0 1.4-2.4L13.5 9.2V3"/><path d="M7.8 15h8.4"/>',
  // The prize fight: a glove.
  '🥊': '<path d="M8 20v-3.5C6.2 15.6 5 13.6 5 11.2 5 7.8 7.6 5 11 5h1.5C15 5 17 7 17 9.5V12h.5a2 2 0 0 1 2 2c0 1.4-1.1 2.5-2.5 2.5H16V20z"/><path d="M8 17h8"/>',
  // Steel: two swords crossed.
  '⚔': '<path d="M4.5 4.5l14 14M19.5 4.5l-14 14M12 16l4-4M8 12l4 4"/><path d="M4.5 7.1V4.5h2.6M19.5 7.1V4.5h-2.6"/>',
  // The training yard: a butt.
  '🎯': '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.7"/><circle cx="12" cy="12" r="1"/>',
  // Not open yet: a lock.
  '🔒': '<path d="M7 11h10v9H7z"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/>',
  // A way in to the menu: three lines.
  '☰': '<path d="M4 7h16M4 12h16M4 17h16"/>',
  // The settings: a cog.
  '⚙': '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M5.6 18.4l2.2-2.2M16.2 7.8l2.2-2.2"/>',
  // Play it: the triangle.
  '▶': '<path d="M8 5l11 7-11 7z"/>',
  // The controls: a pad.
  '🎮': '<path d="M7 8h10a4 4 0 0 1 4 4v1.2a2.8 2.8 0 0 1-5.2 1.5L15 14H9l-.8.7A2.8 2.8 0 0 1 3 13.200V12a4 4 0 0 1 4-4z"/><path d="M7.5 10v3M6 11.5h3"/><circle cx="16.5" cy="11.5" r=".7"/>',
  // Only watch: an eye.
  '👁': '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  // Unseen: a ghost.
  '👻': '<path d="M6 20V10a6 6 0 0 1 12 0v10l-2-1.6-2 1.6-2-1.6-2 1.6-2-1.600z"/><circle cx="9.8" cy="10.5" r=".8"/><circle cx="14.2" cy="10.5" r=".8"/>',
  // The man played: a figure.
  '🧍': '<circle cx="12" cy="5.3" r="2.2"/><path d="M12 7.500v7.500M8.2 10.500h7.600M12 15l-2.5 6M12 15l2.5 6"/>',
  // At random: a die.
  '🎲': '<rect x="4.5" y="4.5" width="15" height="15" rx="2"/><circle cx="8.6" cy="8.6" r=".7"/><circle cx="15.4" cy="15.4" r=".7"/><circle cx="12" cy="12" r=".7"/><circle cx="15.4" cy="8.6" r=".7"/><circle cx="8.6" cy="15.4" r=".7"/>',
  // The camera.
  '🎥': '<rect x="3.5" y="7.5" width="11.5" height="9.5" rx="1.5"/><path d="M15 11l5.5-3v8.500L15 13.5"/>',
  // The bow.
  '🏹': '<path d="M7 3c6.5 3 6.5 15 0 18"/><path d="M7 3v18"/><path d="M3.5 12h16.500M17 9l3 3-3 3"/>',
  // The blade.
  '🗡': '<path d="M12 2.500l2 3.500v8h-4V6z"/><path d="M8 14h8M12 14v5"/><circle cx="12" cy="20.2" r="1.2"/>',
};

/** The drawn icon for a glyph, or null if it has none. */
export const uiIconMarkup = (glyph) => {
  const paths = UI_ICON_PATHS[String(glyph ?? '').replace(/️/g, '')];
  return paths ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>` : null;
};

/** A glyph's element (`span.glyph`): the drawn icon (`.drawn`), else the emoji itself (`.emoji`). */
export function uiIcon(glyph, className = 'glyph') {
  const node = document.createElement('span');
  node.setAttribute('aria-hidden', 'true');
  const drawn = uiIconMarkup(glyph);
  node.className = `${className} ${drawn ? 'drawn' : 'emoji'}`;
  if (drawn) node.innerHTML = drawn;
  else node.textContent = glyph ?? '';
  return node;
}

// A label that opens with a picture ("⚙ Settings", "☰ Menu": the words are data and keep theirs): the picture as the interface's own.
const LEADING_GLYPH = /^\s*((?:[\u{1F300}-\u{1FAFF}]|[☀-➿]|▶)️?)(?:\s+|$)/u;

/**
 * Dress the labels under `root` (buttons, tabs, headings): a leading emoji becomes the drawn icon, or, not drawn yet, the emoji
 * toned to the page; a plain symbol not drawn (a star, a tick) stays as text. Safe to run again: a label already dressed has no
 * leading emoji left. Run when a screen is shown or the page's words are set, never in a fight's frame.
 */
export function dressLabels(root = document.body, selector = 'button, [data-glyph-label]') {
  for (const node of root.querySelectorAll(selector)) {
    const first = node.firstChild;
    if (!first || first.nodeType !== 3) continue;
    const found = LEADING_GLYPH.exec(first.nodeValue);
    if (!found) continue;
    const glyph = found[1];
    if (!uiIconMarkup(glyph) && glyph.codePointAt(0) < 0x1F000) continue;
    first.nodeValue = first.nodeValue.slice(found[0].length);
    const icon = uiIcon(glyph, 'glyph label-glyph');
    node.insertBefore(icon, first);
    if (!first.nodeValue && node.childNodes.length === 2) node.classList.add('glyph-only');
  }
}

// The page's own labels (index.html, worded by translatePage) are dressed once the page's script has run and after each change of
// language; the few places whose buttons are worded again later (the side pick, the banner's row, home's links) are watched, so a
// label set there is dressed as it lands. Nothing here runs in a frame: a watch fires only when one of those labels is rewritten.
const WATCHED = ['#side-pick', '.banner-actions', '#home', '.controls'];
if (typeof document !== 'undefined' && typeof queueMicrotask === 'function') {
  const dressPage = () => queueMicrotask(() => dressLabels());
  dressPage();
  onLangChange(dressPage);
  queueMicrotask(() => {
    if (typeof MutationObserver !== 'function') return;
    for (const selector of WATCHED) {
      const place = document.querySelector(selector);
      if (place) new MutationObserver(() => dressLabels(place)).observe(place, { childList: true, subtree: true });
    }
  });
}
