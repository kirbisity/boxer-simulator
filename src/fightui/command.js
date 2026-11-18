// The player's orders to his side on screen (command.js): a bar of buttons all one size along the top left, in two rows,
// out of the fight's way (the status is low on the left, the Guard, Lock and special buttons down the right). The first
// row: To me, Charge, Hold, Free, Formation, and Hold fire / Fire at will (where his side has shot). The second: the
// arms, where his side has more than one (All, Foot, Shot, Horse; keys [ and ]: the orders go to the arm lit); or, while
// Formation is open, the shapes (Line, Wedge, Square, and Places, back to the places set before the fight, where the side
// has them), one press giving the order and closing them. The order standing is lit gold, as a choice is in the footer
// (Formation, while a shape stands). Shown only in a fight his side is big enough for orders. A new order is called for
// a moment under the bar, however it was given (a tap, or its key).

import { canCommand, chosenGroup, COMMAND_GROUPS, COMMAND_ORDERS, FIRE_ORDER_KEY, groupsFor, hasShot, holdingFire, orderOver, ordersFor, ORDER_SHAPES, standingOrder } from '../command.js';
import { fightUiElement } from './kit.js';
import { onLangChange, t } from '../i18n.js';

export const FIGHT_UI_COMMAND = {
  // The call of a new order stays this long (s).
  callSeconds: 1.6,
  // What each order calls out.
  calls: { rally: 'To me!', charge: 'Charge!', hold: 'Hold!', free: 'As you were', form: 'Back to formation!', line: 'Form line!', wedge: 'Form wedge!', square: 'Form square!' },
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
  // Men in their places: two ranks of dots, an arrow back to them.
  // The shapes, as dots: two ranks; a point and its widening ranks; a hollow square.
  line: '<g fill="currentColor" stroke="none"><circle cx="2.5" cy="6" r="1.2"/><circle cx="6.2" cy="6" r="1.2"/><circle cx="9.8" cy="6" r="1.2"/><circle cx="13.5" cy="6" r="1.2"/><circle cx="2.5" cy="10.5" r="1.2"/><circle cx="6.2" cy="10.5" r="1.2"/><circle cx="9.8" cy="10.5" r="1.2"/><circle cx="13.5" cy="10.5" r="1.2"/></g>',
  wedge: '<g fill="currentColor" stroke="none"><circle cx="8" cy="3" r="1.2"/><circle cx="5.8" cy="7" r="1.2"/><circle cx="10.2" cy="7" r="1.2"/><circle cx="3.6" cy="11" r="1.2"/><circle cx="8" cy="11" r="1.2"/><circle cx="12.4" cy="11" r="1.2"/></g>',
  square: '<g fill="currentColor" stroke="none"><circle cx="3" cy="3" r="1.2"/><circle cx="8" cy="3" r="1.2"/><circle cx="13" cy="3" r="1.2"/><circle cx="3" cy="8" r="1.2"/><circle cx="13" cy="8" r="1.2"/><circle cx="3" cy="13" r="1.2"/><circle cx="8" cy="13" r="1.2"/><circle cx="13" cy="13" r="1.2"/></g>',
  // A bow drawn (Fire at will) and the same with a bar through it (Hold fire).
  fire: '<path d="M4 2c5 2 5 10 0 12M4 2v12M4 8h9m-2-2l2 2-2 2"/>',
  holdFire: '<path d="M4 2c5 2 5 10 0 12M4 2v12M4 8h9"/><path d="M2 14L14 2"/>',
  // The Formation button (opening the shapes): ranks under a frame.
  formation: '<rect x="2" y="2" width="12" height="12" rx="1.5"/><g fill="currentColor" stroke="none"><circle cx="5.5" cy="6.5" r="1.1"/><circle cx="8" cy="6.5" r="1.1"/><circle cx="10.5" cy="6.5" r="1.1"/><circle cx="5.5" cy="10" r="1.1"/><circle cx="8" cy="10" r="1.1"/><circle cx="10.5" cy="10" r="1.1"/></g>',
  form: '<circle cx="4" cy="4" r="1.2" fill="currentColor" stroke="none"/><circle cx="8" cy="4" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="4" r="1.2" fill="currentColor" stroke="none"/><circle cx="6" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="10" cy="8" r="1.2" fill="currentColor" stroke="none"/><path d="M8 15v-4m-2 2l2-2 2 2"/>',
};

/**
 * Put the order buttons in `root`. `hooks`: world(), player(), now() (s),
 * order(kind) (gives it: main.js, which knows where the camera looks),
 * group(step) (chooses the arm: an arm's key).
 * Returns { update, reset }.
 */
export function fightUiCommandBar(root, hooks) {
  const bar = root.appendChild(fightUiElement('div', 'fu-orders'));
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', t('fightui.orders'));
  bar.hidden = true;
  const top = bar.appendChild(fightUiElement('div', 'fu-order-row'));
  const second = bar.appendChild(fightUiElement('div', 'fu-order-row fu-order-second'));
  const arms = second.appendChild(fightUiElement('div', 'fu-arms'));
  arms.setAttribute('role', 'tablist');
  const armButtons = COMMAND_GROUPS.map((entry) => {
    const button = fightUiElement('button', 'fu-arm', t(`order.group.${entry.key}`));
    button.type = 'button';
    button.dataset.group = entry.key;
    button.title = `${t(`order.group.${entry.key}`)} ([ ])`;
    button.addEventListener('pointerdown', (press) => {
      press.preventDefault();
      press.stopPropagation();
      hooks.group?.(entry.key);
      navigator.vibrate?.(10);
    });
    return button;
  });
  arms.append(...armButtons);
  // A button of the bar: an icon over its word, its key in a corner (with a mouse). Its own press: never the fight surface's
  // tap or drag beneath it.
  const barButton = (className, icon, word, key, press) => {
    const button = fightUiElement('button', `fu-order ${className}`, `<svg class="fu-order-icon" viewBox="0 0 16 16" aria-hidden="true">${icon}</svg><span>${word}</span><kbd>${key}</kbd>`);
    button.type = 'button';
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      press();
      navigator.vibrate?.(10);
    });
    for (const kind of ['contextmenu', 'dblclick']) button.addEventListener(kind, (event) => event.preventDefault());
    return button;
  };
  // The shapes (and Places) are shown only while Formation is open; a shape given closes them.
  let formationOpen = false;
  const shaped = (kind) => ORDER_SHAPES.includes(kind) || kind === 'form';
  const buttons = COMMAND_ORDERS.map((entry) => {
    const button = barButton('', FIGHT_UI_COMMAND_ICONS[entry.kind], entry.kind === 'form' ? t('order.places') : t(`order.${entry.kind}`), entry.key.toUpperCase(), () => {
      hooks.order(entry.kind);
      if (shaped(entry.kind)) formationOpen = false;
    });
    button.dataset.order = entry.kind;
    button.title = `${t(`order.call.${entry.kind}`)} (${entry.key.toUpperCase()})`;
    return button;
  });
  const shapes = second.appendChild(fightUiElement('div', 'fu-shapes'));
  shapes.hidden = true;
  const formation = barButton('fu-formation', FIGHT_UI_COMMAND_ICONS.formation, t('order.formation'), 'G', () => {
    formationOpen = !formationOpen;
  });
  for (const button of buttons) (shaped(button.dataset.order) ? shapes : top).append(button);
  top.append(formation);
  // Hold fire / Fire at will: one button, its word what it is now; only where he has bows or guns to tell.
  const fire = barButton('fu-fire', '', '', 'H', () => hooks.fire?.());
  top.append(fire);
  let fireShown = null;
  // A switch of language (src/i18n.js) relabels the buttons and the bar.
  onLangChange(() => {
    bar.setAttribute('aria-label', t('fightui.orders'));
    for (const button of buttons) {
      const entry = COMMAND_ORDERS.find((each) => each.kind === button.dataset.order);
      button.querySelector('span').textContent = entry.kind === 'form' ? t('order.places') : t(`order.${entry.kind}`);
      button.title = `${t(`order.call.${entry.kind}`)} (${entry.key.toUpperCase()})`;
    }
    formation.querySelector('span').textContent = t('order.formation');
    for (const button of armButtons) button.textContent = t(`order.group.${button.dataset.group}`);
    fireShown = null;
  });
  const said = bar.appendChild(fightUiElement('div', 'fu-order-said'));
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
    // The arms he has (only All: no tabs), the one chosen lit.
    const groups = groupsFor(world, me);
    const group = chosenGroup(world, me);
    // The second row: the shapes while Formation is open, else the arms (where there is more than one).
    const offeredShapes = new Set(ordersFor(world, me.corner, group).map((entry) => entry.kind));
    if (!ORDER_SHAPES.some((kind) => offeredShapes.has(kind))) formationOpen = false;
    shapes.hidden = !formationOpen;
    arms.hidden = formationOpen || groups.length < 2;
    second.hidden = shapes.hidden && arms.hidden;
    formation.hidden = !ORDER_SHAPES.some((kind) => offeredShapes.has(kind));
    formation.classList.toggle('open', formationOpen);
    for (const button of armButtons) {
      button.hidden = !groups.includes(button.dataset.group);
      button.classList.toggle('on', button.dataset.group === group);
    }
    // Formation only where the side has places of its own; the horse only what a rider can be told.
    const offered = new Set(ordersFor(world, me.corner, group).map((entry) => entry.kind));
    for (const button of buttons) button.hidden = !offered.has(button.dataset.order);
    // The fire order: lit (gold) while the shot holds; its word the order standing.
    fire.hidden = !hasShot(world, me);
    const holding = holdingFire(world, me.corner);
    if (fireShown !== holding) {
      fireShown = holding;
      fire.classList.toggle('on', holding);
      fire.querySelector('svg').innerHTML = FIGHT_UI_COMMAND_ICONS[holding ? 'holdFire' : 'fire'];
      fire.querySelector('span').textContent = t(holding ? 'order.holdFire' : 'order.fireAtWill');
      fire.title = `${t(holding ? 'order.call.fireAtWill' : 'order.call.holdFire')} (H)`;
    }
    const kind = standingOrder(world, me.corner, group);
    if (`${group}:${kind}` !== shown) {
      shown = `${group}:${kind}`;
      for (const button of buttons) button.classList.toggle('on', button.dataset.order === kind);
      formation.classList.toggle('on', shaped(kind));
    }
    // A new order (or the order taken back): called for a moment.
    const serial = orderOver(world, me.corner, group)?.serial ?? 0;
    const order = `${kind}:${serial}`;
    if (heard !== null && order !== heard) {
      said.textContent = t(`order.call.${kind}`);
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
    fireShown = null;
    formationOpen = false;
    heard = null;
    said.hidden = true;
  }

  /** Formation opened or closed (its button, or G). */
  function toggleFormation() {
    formationOpen = !formationOpen;
  }

  return { update, reset, toggleFormation };
}
