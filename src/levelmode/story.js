// Level Mode's story and its cards: the opening title card, the parchment notes, YOU DIED, the boss's
// health bar and the ending in the cell. Plain DOM over the game (styled under "Level Mode" in boxer.css);
// nothing here knows the stage or the world. The stage calls these, and asks `storyBusy()` whether a
// card is up (to hold the world still behind it).
//
// Every card shows itself, and returns { close } to take it down early (leaving the stage, say).
// Tap, click, Enter, Space or Escape moves a card on; while one is up those keys are the card's, not the fight's.

export const STAGE_ONE = {
  key: 'dunnottar',
  title: 'Memories of Dunnottar',
  chapter: 'Chapter 4 · The Murmurs of the Shattered Chalice',
  // The lore on the opening card, one paragraph to each beat.
  lore: [
    'Queen Alta of Albion does not conquer; she unravels. With false kindness, quiet sabotage and patient cruelty she has dismantled the realms around her: powder cut with redstone dust to ruin their guns, plagues set loose, holy rites twisted, whole peoples bound in debt.',
    'Caby has fallen. The young Prince of Caby was carried in secret to Dunnottar, a storm-lashed fortress on a sea-cliff at the border, in the name of protective custody. In its vaults the Queen has gaslit him into a shell that clings to the shards of a false chalice.',
    'You are an operative of the Forgers, the resistance founded by Eileen of Okimo, and you carry a scroll signed in blood by Caby\'s miners and peasants. Breach the choke points. Cut through the garrison. Reach the summit keep, where Lord Vaelen, the Queen\'s chief jailer, keeps the key.',
  ],
};

// The Level Mode menu's list: Stage 1 is open, the next is shown and not open yet.
export const STAGE_LIST = [
  { key: STAGE_ONE.key, number: 1, ready: true, glyph: '🏰', kicker: 'Playable', title: `Stage 1 · ${STAGE_ONE.title}`, blurb: 'A sea-cliff fortress in a storm. Cut through the garrison to Lord Vaelen at the summit.' },
  { key: null, number: 2, ready: false, glyph: '🔒', kicker: 'Locked', title: 'Stage 2 · Coming soon', blurb: 'Not yet unlocked.' },
];

// Five found papers, in the order the route meets them (the stage places them): what each is, and what it says.
export const NOTES = {
  powder: {
    title: 'Scratched on a powder keg',
    body: 'Third misfire this week. The quartermaster swears the powder is sound, yet it clots in the pan like wet sand and there is red grit in every barrel. Redstone, the old men say. If the matchlocks fail us in a siege, I know whose door I am knocking on.',
  },
  servant: {
    title: 'A servant\'s letter, unsent',
    body: 'Dearest Mara, they keep the boy in the tower room above the vaults. He will not eat unless the Queen\'s physician watches. He holds pieces of a broken cup to his chest as if they were alive, and says they told him to wait. I pray you never see this place.',
  },
  ledger: {
    title: 'The Turnkey\'s ledger: Whigs\' Vault',
    body: 'Cell three: two Caby miners, loud, pick-callused. Cell five: a soldier, one eye, half rations. Cell seven: no name given; the Queen\'s order says feed him, never free him. The keys hang at my belt and nowhere else; lose one and I answer to Lord Vaelen.',
  },
  soldier: {
    title: 'Cut into the parapet',
    body: 'The wind took the others over the wall and the sea kept them. Tell my mother the Queen never once climbed up to see who guarded her. If you read this, keep to the stones. The wet takes your feet, and the drop takes the rest.',
  },
  order: {
    title: 'Sealed order: Alta to Vaelen',
    body: 'Vaelen. The boy is not to die, and he is not to leave. Let him believe the door is locked and that the world beyond it has forgotten him. If anyone comes for him, they come for me, and you know what I do with those who come.',
  },
};
export const NOTE_KEYS = Object.keys(NOTES);

// What the cell says. `endingLines` is the whole sequence in order; the middle line differs when civilians were harmed.
const ENDING = {
  cell: [
    'The inner cell stands open. No guard inside, no chain on the door.',
    'The Prince of Caby sits where the torchlight does not reach. He does not look up.',
    'In both hands he holds the shards of a chalice, a fake, pressed so hard to his chest that they have drawn blood. He does not seem to feel it.',
    'You hold out the scroll, signed in blood by his miners and his peasants. He flinches from it, and from you. "She said the world had forgotten me," he whispers. "She said someone would come, and that it would be a lie."',
  ],
  spared: 'You spared those who only served. In the dark, for a breath, his eyes find yours.',
  harmed: 'The servants who fell on your way were no one\'s soldiers. He saw them from the stair. "Then you are hers too," he whispers, and turns his face to the wall.',
  closing: [
    'He will not leave. The door is open, and the prison is already inside him.',
    'Beyond the walls, the storm begins to break.',
  ],
  end: 'End of Stage 1 · Memories of Dunnottar',
};

/** The ending's lines in order, for the way the run went. */
export function endingLines({ civiliansHarmed = false } = {}) {
  return [...ENDING.cell, civiliansHarmed ? ENDING.harmed : ENDING.spared, ...ENDING.closing, ENDING.end];
}

/** How long the cards take (s): the fade of each, and how long a card holds before a tap counts. */
export const STORY_TIMING = {
  openingFade: 1.6, openingLock: 1.2,
  noteLock: 0.35,
  deathIn: 1.6, deathHold: 2.4, deathOut: 1.0,
  endingLineFade: 1.4, endingLineHold: 3.2, endingLock: 0.6,
};

// ---- The cards -----------------------------------------------------------------

let storyUp = 0;
// Every card that is up, to take them all down at once (leaving the stage).
const cardsUp = new Set();
/** Whether a card that wants the fight held still is on screen (the opening, a note, the ending; not the death fade or the boss bar). */
export const storyBusy = () => storyUp > 0;

function storyEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * A full-window card that takes the keys and the taps. `onAdvance` runs for each; the card is `close`d by the caller.
 * Returns { root, close }.
 */
function storyCard(className, onAdvance, { holds = true, bodyClass = null } = {}) {
  const root = storyEl('div', `story-card ${className}`);
  root.setAttribute('role', 'dialog');
  const advance = () => onAdvance();
  const key = (event) => {
    if (event.repeat || !['Enter', ' ', 'Escape', 'Spacebar'].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    advance();
  };
  // Keys that are not the card's are held from the fight too (the stick keys must not walk a man behind a note).
  const swallow = (event) => {
    if (!['Enter', ' ', 'Escape', 'Spacebar'].includes(event.key) && !event.metaKey && !event.ctrlKey) event.stopImmediatePropagation();
  };
  root.addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); });
  root.addEventListener('click', (event) => { event.stopPropagation(); advance(); });
  window.addEventListener('keydown', key, true);
  window.addEventListener('keydown', swallow, true);
  window.addEventListener('keyup', swallow, true);
  document.body.append(root);
  if (bodyClass) document.body.classList.add(bodyClass);
  if (holds) storyUp += 1;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    cardsUp.delete(close);
    if (bodyClass) document.body.classList.remove(bodyClass);
    if (holds) storyUp = Math.max(0, storyUp - 1);
    window.removeEventListener('keydown', key, true);
    window.removeEventListener('keydown', swallow, true);
    window.removeEventListener('keyup', swallow, true);
    root.remove();
  };
  cardsUp.add(close);
  return { root, close };
}

/** Take down every card and the boss's bar (the stage is left behind). */
export function closeStory() {
  for (const close of [...cardsUp]) close();
  storyUp = 0;
  bossBar.hide();
}

/** Fade a card out and take it down, then say so. */
function storyFadeOut(card, seconds, then) {
  card.root.classList.add('leaving');
  card.root.style.setProperty('--story-out', `${seconds}s`);
  setTimeout(() => { card.close(); then?.(); }, seconds * 1000);
}

/**
 * The opening title card over the storm: the stage's title, its chapter and the lore. A tap (after a breath) goes on.
 * `stage` defaults to Stage 1. onDone runs once the card has faded.
 */
export function showOpening(onDone, stage = STAGE_ONE) {
  let ready = false;
  let leaving = false;
  const card = storyCard('story-opening', () => {
    if (!ready || leaving) return;
    leaving = true;
    storyFadeOut(card, 0.9, onDone);
  }, { bodyClass: 'card-up' });
  card.root.style.setProperty('--story-fade', `${STORY_TIMING.openingFade}s`);
  card.root.append(
    storyEl('p', 'story-chapter', stage.chapter),
    storyEl('h1', 'story-title', stage.title),
    storyEl('div', 'story-rule'),
    storyEl('div', 'story-lore', undefined),
    storyEl('p', 'story-prompt', 'Tap to begin'),
  );
  card.root.querySelector('.story-lore').append(...stage.lore.map((line) => storyEl('p', '', line)));
  setTimeout(() => { ready = true; card.root.classList.add('ready'); }, STORY_TIMING.openingLock * 1000 + 1200);
  return { close: card.close };
}

/** A found paper: its title and its words on parchment; a tap puts it away. onDone runs after. */
export function showNote({ title, body }, onDone) {
  let ready = false;
  const card = storyCard('story-note-card', () => {
    if (!ready) return;
    card.close();
    onDone?.();
  });
  const paper = storyEl('div', 'story-note');
  paper.append(storyEl('h2', '', title), storyEl('p', '', body), storyEl('span', 'story-prompt', 'Tap to put away'));
  card.root.append(paper);
  setTimeout(() => { ready = true; }, STORY_TIMING.noteLock * 1000);
  return { close: card.close };
}

/** YOU DIED: the screen falls to a red-black, the words rise, hold; onDone runs while it is still dark (respawn behind it) and it lifts. */
export function showDeath(onDone) {
  const { deathIn, deathHold, deathOut } = STORY_TIMING;
  // The death fade does not hold the world still (the man's fall is part of it).
  const card = storyCard('story-death', () => {}, { holds: false });
  let closed = false;
  card.root.style.setProperty('--story-in', `${deathIn}s`);
  card.root.append(storyEl('p', 'story-died', 'YOU DIED'));
  requestAnimationFrame(() => card.root.classList.add('shown'));
  setTimeout(() => {
    if (closed) return;
    onDone?.();
    card.root.style.setProperty('--story-out', `${deathOut}s`);
    card.root.classList.add('leaving');
    setTimeout(card.close, deathOut * 1000);
  }, (deathIn + deathHold) * 1000);
  return { close: () => { closed = true; card.close(); } };
}

/**
 * The ending in the cell: lines rise one by one over black (a tap brings the next at once); `onLine(index, text)` says
 * which is up, so the stage can pose the cell behind it; the last tap closes the card and runs onDone.
 */
export function showEnding({ civiliansHarmed = false, onLine = null, over = true } = {}, onDone) {
  const lines = endingLines({ civiliansHarmed });
  const shown = [];
  let at = -1;
  let timer = null;
  let finished = false;
  const stack = storyEl('div', 'story-ending-lines');
  let ready = false;
  const next = () => {
    clearTimeout(timer);
    if (at >= lines.length - 1) return;
    at += 1;
    const line = storyEl('p', at === lines.length - 1 ? 'story-line story-end' : 'story-line', lines[at]);
    stack.append(line);
    requestAnimationFrame(() => line.classList.add('shown'));
    shown.push(line);
    // The one before dims, so the eye stays on the newest; any before that are cleared, so a short window never overflows.
    shown.slice(0, -1).forEach((old) => old.classList.add('old'));
    shown.slice(0, -2).forEach((gone) => gone.classList.add('gone'));
    onLine?.(at, lines[at]);
    if (at < lines.length - 1) timer = setTimeout(next, STORY_TIMING.endingLineHold * 1000);
    else card.root.classList.add('last');
  };
  // Over the scene (the default): the cell stays in view above the words, and the world runs behind them.
  const card = storyCard(over ? 'story-ending over' : 'story-ending', () => {
    if (!ready || finished) return;
    if (at < lines.length - 1) { next(); return; }
    finished = true;
    storyFadeOut(card, 1.2, onDone);
  }, { holds: !over, bodyClass: over ? 'card-up' : null });
  card.root.style.setProperty('--story-fade', `${STORY_TIMING.endingLineFade}s`);
  card.root.append(stack, storyEl('p', 'story-prompt', 'Tap'));
  setTimeout(() => { ready = true; }, STORY_TIMING.endingLock * 1000);
  setTimeout(next, 900);
  return { close: () => { clearTimeout(timer); card.close(); } };
}

/**
 * The card after the ending: where the stage stops. "Return to menu" and "Play again" (each runs its callback once, the card
 * taking itself down). Enter works the button that has the focus.
 */
export function showFinale({ onMenu, onAgain }, stage = STAGE_ONE) {
  let done = false;
  const card = storyCard('story-finale', () => document.activeElement?.closest?.('.story-finale') && document.activeElement.click?.(), { bodyClass: 'card-up' });
  const choose = (callback) => () => {
    if (done) return;
    done = true;
    storyFadeOut(card, 0.6, callback);
  };
  const button = (text, className, callback) => {
    const control = storyEl('button', `story-button ${className}`, text);
    control.type = 'button';
    control.addEventListener('click', (event) => { event.stopPropagation(); choose(callback)(); });
    return control;
  };
  const again = button('Play again', 'story-primary', onAgain);
  card.root.append(
    storyEl('p', 'story-chapter', stage.chapter),
    storyEl('h2', 'story-fin-title', `Stage 1 complete`),
    storyEl('p', 'story-fin-sub', stage.title),
    storyEl('div', 'story-rule'),
    storyEl('div', 'story-buttons'),
  );
  card.root.querySelector('.story-buttons').append(again, button('Return to menu', '', onMenu));
  setTimeout(() => again.focus({ preventScroll: true }), 400);
  return { close: card.close };
}

// ---- The boss's bar ---------------------------------------------------------------------------

let bossRoot = null;
let bossFill = null;
let bossLag = null;
let bossName = null;
let bossTitle = null;
let bossFraction = 1;

function bossBuild() {
  if (bossRoot) return;
  bossRoot = storyEl('div', 'boss-bar');
  bossRoot.hidden = true;
  bossName = storyEl('b', 'boss-name');
  bossTitle = storyEl('span', 'boss-title');
  const track = storyEl('div', 'boss-track');
  bossLag = storyEl('i', 'boss-lag');
  bossFill = storyEl('i', 'boss-fill');
  track.append(bossLag, bossFill);
  bossRoot.append(storyEl('div', 'boss-words'), track);
  bossRoot.firstChild.append(bossName, bossTitle);
  bossRoot.setAttribute('aria-hidden', 'true');
  document.body.append(bossRoot);
}

/** The stage boss's bar, bottom centre: name and title over a track that drains red, with the pale lag of the last blow behind it. */
export const bossBar = {
  /** Show it, full. `title` is the epithet under the name ("Chief Jailer of the Queen"). */
  show(name, title = '') {
    bossBuild();
    bossName.textContent = name;
    bossTitle.textContent = title;
    bossTitle.hidden = !title;
    bossFraction = 1;
    bossFill.style.transform = 'scaleX(1)';
    bossLag.style.transform = 'scaleX(1)';
    bossRoot.hidden = false;
    bossRoot.classList.remove('fading', 'felled', 'empty');
    // One frame to be laid out hidden-then-shown, so the fade in runs.
    requestAnimationFrame(() => bossRoot.classList.add('shown'));
  },
  /** Set what is left (0 to 1). The bar follows at once; the pale lag catches up after a moment. */
  set(fraction) {
    if (!bossRoot) return;
    bossFraction = Math.min(1, Math.max(0, fraction));
    bossFill.style.transform = `scaleX(${bossFraction})`;
    bossLag.style.transform = `scaleX(${bossFraction})`;
    bossRoot.classList.toggle('empty', bossFraction <= 0);
  },
  /** He is out: the bar is empty and his name struck through; it holds a moment and fades (boxer.css). */
  fell() {
    if (!bossRoot || bossRoot.hidden) return;
    bossFraction = 0;
    bossFill.style.transform = 'scaleX(0)';
    bossLag.style.transform = 'scaleX(0)';
    bossRoot.classList.add('empty', 'felled');
  },
  /** Take it down. */
  hide() {
    if (!bossRoot) return;
    bossRoot.classList.remove('shown', 'felled');
    bossRoot.hidden = true;
  },
  get visible() { return Boolean(bossRoot) && !bossRoot.hidden; },
  get fraction() { return bossFraction; },
};
