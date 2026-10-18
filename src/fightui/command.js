// The player's orders to his side on screen (command.js): a small column of
// pills at the top left, out of the fight's way (the status is low on the
// left, the Guard, Lock and special buttons down the right), each an icon
// and a word: To me, Charge, Hold, Free. The order standing is lit gold, as
// a choice is in the footer. Shown only in a fight his side is big enough
// for orders. A new order is called for a moment under the column, however
// it was given (a tap, or keys 7–0).

import { canCommand, COMMAND_ORDERS, standingOrder } from '../command.js';
import { fightUiElement } from './kit.js';

export const FIGHT_UI_COMMAND = {
  // The call of a new order stays this long (s).
  callSeconds: 1.6,
  // What each order calls out.
  calls: { rally: 'To me!', charge: 'Charge!', hold: 'Hold!', free: 'As you were' },
};

// Each order's icon: plain strokes in the pill's colour (16 px).
const FIGHT_UI_COMMAND_ICONS = {
  // Gathering in, to a point.
  rally: '<path d="M2 5l3 3-3 3M14 5l-3 3 3 3M5 2l3 3 3-3M5 14l3-3 3 3"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/>',
  // On, at a run.
  charge: '<path d="M3 3l5 5-5 5M8 3l5 5-5 5"/>',
  // A shield: stand fast.
  hold: '<path d="M8 2l5 2v4c0 3-2.5 5-5 6-2.5-1-5-3-5-6V4z"/>',
  // Out, each his own way.
  free: '<path d="M7 7L3 3m0 3V3h3M9 7l4-4m0 3V3h-3M8 9.5V14m-2-2l2 2 2-2"/>',
};

/**
 * Put the order buttons in `root`. `hooks`: world(), player(), now() (s),
 * order(kind) (gives it: main.js, which knows where the camera looks).
 * Returns { update, reset }.
 */
export function fightUiCommandBar(root, hooks) {
  const bar = root.appendChild(fightUiElement('div', 'fu-orders'));
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Orders to your men');
  bar.hidden = true;
  const buttons = COMMAND_ORDERS.map((entry) => {
    const button = fightUiElement('button', 'fu-order', `<svg class="fu-order-icon" viewBox="0 0 16 16" aria-hidden="true">${FIGHT_UI_COMMAND_ICONS[entry.kind]}</svg><span>${entry.label}</span><kbd>${entry.key}</kbd>`);
    button.type = 'button';
    button.dataset.order = entry.kind;
    button.title = `${FIGHT_UI_COMMAND.calls[entry.kind]} (${entry.key})`;
    // Its own press: never the fight surface's tap or drag beneath it.
    button.addEventListener('pointerdown', (press) => {
      press.preventDefault();
      press.stopPropagation();
      hooks.order(entry.kind);
      navigator.vibrate?.(10);
    });
    for (const kind of ['contextmenu', 'dblclick']) button.addEventListener(kind, (event) => event.preventDefault());
    return button;
  });
  bar.append(...buttons);
  const said = root.appendChild(fightUiElement('div', 'fu-order-said'));
  said.hidden = true;
  let shown = null;
  let heard = null;
  let saidAt = -Infinity;

  function update() {
    const world = hooks.world();
    const me = hooks.player();
    const on = canCommand(world, me);
    bar.hidden = !on;
    if (!on) {
      said.hidden = true;
      return;
    }
    const kind = standingOrder(world, me.corner);
    if (kind !== shown) {
      shown = kind;
      for (const button of buttons) button.classList.toggle('on', button.dataset.order === kind);
    }
    // A new order (or the order taken back): called for a moment.
    const serial = world.commands?.[me.corner]?.serial ?? 0;
    const order = `${kind}:${serial}`;
    if (heard !== null && order !== heard) {
      said.textContent = FIGHT_UI_COMMAND.calls[kind];
      said.hidden = false;
      said.classList.remove('fu-order-said-in');
      void said.offsetWidth;
      said.classList.add('fu-order-said-in');
      saidAt = hooks.now();
    }
    heard = order;
    if (hooks.now() - saidAt > FIGHT_UI_COMMAND.callSeconds) said.hidden = true;
  }

  function reset() {
    shown = null;
    heard = null;
    said.hidden = true;
  }

  return { update, reset };
}
