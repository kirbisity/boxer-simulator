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
  // The Last Stand's levels: a torii, and a patrol's beacon.
  '⛩': '<path d="M3.500 6c5.500 1.500 11.500 1.500 17 0"/><path d="M5 10h14"/><path d="M7.500 7v13.500M16.500 7v13.500M12 7.300V10"/>',
  '🚓': '<path d="M7.500 16v-3.500a4.500 4.500 0 0 1 9 0V16"/><path d="M5 16h14v3.500H5z"/><path d="M12 3v2M5.200 5.800l1.400 1.400M18.800 5.800l-1.400 1.400"/>',
  // The fight's moments (drama.js), over the man they happen to. A knockout: a burst.
  '💥': '<path d="M12.0 2.5L13.8 7.8L18.7 5.3L16.2 10.2L21.5 12.0L16.2 13.8L18.7 18.7L13.8 16.2L12.0 21.5L10.2 16.2L5.3 18.7L7.8 13.8L2.5 12.0L7.8 10.2L5.3 5.3L10.2 7.8z"/>',
  // Down: driven to the ground.
  '💫': '<path d="M7 5.500l5 5 5-5M7 11.500l5 5 5-5"/><path d="M5 20.500h14"/>',
  // Broken: a snapped shaft.
  '🦴': '<path d="M3 16l7-2 1-3.500"/><path d="M13 14.500l1-3.500 7-2"/><path d="M11.500 5v2.200M8 6l1 1.900M15.500 6l-1 1.900"/>',
  // Blood: a drop.
  '🩸': '<path d="M12 3.500c3 4 5.500 6.800 5.500 10a5.500 5.500 0 0 1-11 0c0-3.200 2.500-6 5.500-10z"/>',
  // Staggered: reeling.
  '🌀': '<path d="M12 12.200a1.200 1.200 0 1 0-1.200-1.200c0 2 1.600 3.400 3.600 3.400a4 4 0 0 0 4-4c0-3.400-2.800-5.900-6.200-5.900a6.800 6.800 0 0 0-6.800 6.800c0 4.600 3.800 8.200 8.400 8.200"/>',
  // Panic: a face, mouth open.
  '😱': '<circle cx="12" cy="12" r="8.500"/><path d="M8.500 9.500h1.200M14.300 9.500h1.200"/><ellipse cx="12" cy="15" rx="1.800" ry="2.600"/>',
  // Fights on: a flame.
  '🔥': '<path d="M12 3c.5 3.500 4.500 5.500 4.500 10.500a4.500 4.500 0 0 1-9 0c0-2 1-3.500 2-4.500.2 1.500.8 2.300 1.500 2.800C11 9 10.500 5.500 12 3z"/>',
  // Rage: the four corners drawn in.
  '💢': '<path d="M9.500 4.500V8A1.500 1.500 0 0 1 8 9.500H4.500M14.500 4.500V8A1.500 1.500 0 0 0 16 9.500h3.500M9.500 19.500V16A1.500 1.500 0 0 0 8 14.500H4.500M14.500 19.500V16a1.500 1.500 0 0 1 1.500-1.500h3.500"/>',
  // A hold: two rings locked.
  '🤼': '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>',
  // Knocked off: a cap, off the head.
  '🎧': '<path d="M5.500 15a6.500 6.500 0 0 1 13 0v1.500h-13z"/><path d="M4 20h16"/><path d="M12 4v2.200M6.200 6l1.300 1.700M17.800 6l-1.300 1.700"/>',
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
const WATCHED = ['#side-pick', '.banner-actions', '#home', '.controls', '#lastgate-screen'];
// The Last Stand names its levels and factions picture first, in headings as well as buttons.
const WATCHED_LABELS = { '#lastgate-screen': 'button, h1, h2, h3, b, [data-glyph-label]' };
if (typeof document !== 'undefined' && typeof queueMicrotask === 'function') {
  const dressPage = () => queueMicrotask(() => dressLabels());
  dressPage();
  onLangChange(dressPage);
  queueMicrotask(() => {
    if (typeof MutationObserver !== 'function') return;
    for (const selector of WATCHED) {
      const place = document.querySelector(selector);
      if (place) new MutationObserver(() => dressLabels(place, WATCHED_LABELS[selector])).observe(place, { childList: true, subtree: true });
    }
  });
}
