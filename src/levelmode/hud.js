// Level mode, the player's part of the screen (styled under "Level Mode: the player" in fightui.css):
//  - the context pill, bottom centre above the controls: shown only where something can be done and no
//    enemy is near; an icon, a word, and E for the key;
//  - the item row, top left: a bandage and a tonic, each a button with its count and its key (1, 2);
//  - the action bar, over the pill's place, while a bandage goes on or a harness is changed;
//  - a toast line for what just happened;
//  - the boss's bar (story.js) kept at his health, while he is in the fight;
//  - the team (teamview.js): the comrades' names and health above the player's card, a pip over each one's head.
// Plain DOM over the fight; nothing here knows the physics beyond level.js's answers.

import { bossStatus, contextFor, interact, useItem } from './level.js';
import { bossBar, storyBusy } from './story.js';
import { createTeamView } from './teamview.js';

export const LEVEL_HUD = {
  // The toast stays this long (s).
  toastSeconds: 2.6,
  // The keys: E the context button, 1 a bandage, 2 a tonic.
  keys: { context: 'e', bandage: '1', tonic: '2' },
};

// Each icon: plain strokes in the control's colour (16 px).
const LEVEL_ICONS = {
  hand: '<path d="M5 8V3.5a1 1 0 012 0V7m0-2.5a1 1 0 012 0V8m0-2a1 1 0 012 0v4c0 2.5-2 4.5-4.5 4.5S4.5 13 3.5 11L2 8.5a1 1 0 011.5-.8L5 9"/>',
  bandage: '<rect x="1.5" y="5.5" width="13" height="5" rx="2.5"/><path d="M8 5.5v5M5.5 8h5"/>',
  tonic: '<path d="M6 2h4M7 2v4L3.5 13a1 1 0 00.9 1.4h7.2a1 1 0 00.9-1.4L9 6V2"/><path d="M5 10h6"/>',
  key: '<circle cx="4.8" cy="8" r="2.6"/><path d="M7.4 8H14M12 8v2.5M10 8v1.6"/>',
  note: '<path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M6 8h4.5M6 11h4.5"/>',
  lever: '<path d="M3.5 14h9M8 14V6.5l3.5-3.5"/><circle cx="12" cy="2.8" r="1.3"/>',
  gate: '<path d="M3 14.5V2.5M8 14.5V2.5M13 14.5V2.5M1.5 6h13M1.5 11h13"/>',
  lock: '<rect x="3.5" y="7" width="9" height="7" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/>',
  ladder: '<path d="M5 1.5v13M11 1.5v13M5 4.5h6M5 8h6M5 11.5h6"/>',
  rest: '<path d="M8 1.5c1 3 4 4 4 8a4 4 0 01-8 0c0-2 1-3 2-4 0 1 1 2 2 2 0-2-1-4 0-6z"/>',
  weapon: '<path d="M3 13l8-8M10 3.5l2.5-1.5-1.5 2.5zM4.5 10.5l2 2M2 14l2.5-2.5"/>',
  shield: '<path d="M8 2l5 2v4c0 3-2.5 5-5 6-2.5-1-5-3-5-6V4z"/>',
  outfit: '<path d="M5.5 2L2 4l1.5 3L5 6.2V14h6V6.2L12.5 7 14 4l-3.5-2c-.4 1.2-1.4 1.8-2.5 1.8S5.9 3.2 5.5 2z"/>',
};
const levelIcon = (name) => `<svg class="lv-icon" viewBox="0 0 16 16" aria-hidden="true">${LEVEL_ICONS[name] ?? LEVEL_ICONS.hand}</svg>`;

const levelElement = (tag, className, html = '') => Object.assign(document.createElement(tag), { className, innerHTML: html });

/**
 * Put the level's controls in `root` (the fight's, so they show only while the fight does). `hooks`:
 * world(), active() (a stage run is being played), now() (s), camera() (the scene's, for the pips). Returns { update, reset, toast, destroy }.
 */
export function installLevelHud(root, hooks) {
  const pill = root.appendChild(levelElement('button', 'lv-context', `${levelIcon('hand')}<span class="lv-label"></span><kbd>E</kbd>`));
  pill.type = 'button';
  pill.hidden = true;
  const items = root.appendChild(levelElement('div', 'lv-items'));
  items.hidden = true;
  const buttons = Object.fromEntries(['bandage', 'tonic'].map((kind) => {
    const button = items.appendChild(levelElement('button', 'lv-item', `${levelIcon(kind)}<b class="lv-count"></b><kbd>${LEVEL_HUD.keys[kind]}</kbd>`));
    button.type = 'button';
    button.dataset.item = kind;
    button.setAttribute('aria-label', kind === 'bandage' ? 'Bandage' : 'Tonic');
    button.addEventListener('pointerdown', (press) => {
      press.preventDefault();
      press.stopPropagation();
      if (hooks.active()) useItem(hooks.world(), kind);
    });
    return [kind, button];
  }));
  const bar = root.appendChild(levelElement('div', 'lv-action', '<span class="lv-action-label"></span><i><b></b></i>'));
  bar.hidden = true;
  const team = createTeamView(root, hooks);
  const toastLine = root.appendChild(levelElement('div', 'lv-toast'));
  toastLine.hidden = true;
  let toastUntil = -Infinity;
  let shown = null;
  let bossShown = false;

  pill.addEventListener('pointerdown', (press) => {
    press.preventDefault();
    press.stopPropagation();
    if (!hooks.active()) return;
    navigator.vibrate?.(10);
    interact(hooks.world());
  });
  for (const kind of ['contextmenu', 'dblclick']) for (const control of [pill, ...Object.values(buttons)]) control.addEventListener(kind, (event) => event.preventDefault());

  // The keys, taken first (the attack buttons also use 1 and 2): only while a stage run is on, and no card is up.
  const onKey = (event) => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || !hooks.active() || storyBusy() || event.target.closest?.('input, select, textarea')) return;
    const key = event.key.toLowerCase();
    const world = hooks.world();
    if (key === LEVEL_HUD.keys.bandage || key === LEVEL_HUD.keys.tonic) {
      event.preventDefault();
      event.stopImmediatePropagation();
      useItem(world, key === LEVEL_HUD.keys.bandage ? 'bandage' : 'tonic');
    } else if (key === LEVEL_HUD.keys.context && contextFor(world)) {
      // Only with something to do: otherwise E is the parry key as ever.
      event.preventDefault();
      event.stopImmediatePropagation();
      interact(world);
    }
  };
  window.addEventListener('keydown', onKey, true);

  function toast(text) {
    toastLine.textContent = text;
    toastLine.hidden = false;
    toastLine.classList.remove('lv-toast-in');
    void toastLine.offsetWidth;
    toastLine.classList.add('lv-toast-in');
    toastUntil = hooks.now() + LEVEL_HUD.toastSeconds;
  }

  function update() {
    const world = hooks.world();
    const on = hooks.active() && Boolean(world?.stage?.level);
    team.update();
    if (!on) {
      if (pill.hidden === false || items.hidden === false || bar.hidden === false) reset();
      return;
    }
    const level = world.stage.level;
    items.hidden = false;
    for (const [kind, button] of Object.entries(buttons)) {
      const count = level.inventory[kind] ?? 0;
      button.querySelector('.lv-count').textContent = `×${count}`;
      button.classList.toggle('empty', count === 0);
    }
    const action = level.action;
    bar.hidden = !action;
    if (action) {
      bar.querySelector('.lv-action-label').textContent = action.label;
      bar.querySelector('b').style.width = `${Math.round(Math.min(1, action.t / action.seconds) * 100)}%`;
    }
    const choice = action || level.dying ? null : contextFor(world);
    pill.hidden = !choice;
    if (choice && choice.id !== shown) {
      shown = choice.id;
      pill.querySelector('.lv-label').textContent = choice.label;
      pill.querySelector('.lv-icon').outerHTML = levelIcon(choice.icon);
      pill.classList.toggle('disabled', Boolean(choice.disabled));
    }
    if (!choice) shown = null;
    if (toastLine.hidden === false && hooks.now() > toastUntil) toastLine.hidden = true;
    const boss = bossStatus(world);
    // (The bar of a boss who is out stays only if it was up: it empties and fades, and the cutscene's title takes over.)
    if (boss.show && !bossShown && !boss.felled) {
      bossBar.show(boss.name, boss.title);
      bossShown = true;
    } else if (!boss.show && bossShown) {
      bossBar.hide();
      bossShown = false;
    }
    if (bossShown) {
      if (boss.felled) bossBar.fell();
      else bossBar.set(boss.fraction);
    }
  }

  function reset() {
    team.reset();
    pill.hidden = true;
    items.hidden = true;
    bar.hidden = true;
    toastLine.hidden = true;
    shown = null;
    if (bossShown) {
      bossBar.hide();
      bossShown = false;
    }
  }

  return { update, reset, toast, destroy: () => { window.removeEventListener('keydown', onKey, true); team.destroy(); for (const node of [pill, items, bar, toastLine]) node.remove(); } };
}
