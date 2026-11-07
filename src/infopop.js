// A choice's details in a pop-up over the screen (its armour card, its description), so the choices themselves stay small:
// opened by the ⓘ on the choice, a right-click or a long press on it; closed by a tap outside, the ✕ or Escape.

import { t } from './i18n.js';

// How long a finger rests on a choice before its details open (ms), and how far it may drift and still count (px).
const INFO_POP = { holdMs: 480, slopPx: 10 };

let openPop = null;

/** Open `content` (a node) in the pop-up, closing any other; returns the function that closes it. */
export function openInfoPop(content, { label = t('cards.details'), onClose = null } = {}) {
  openPop?.();
  const close = () => {
    if (openPop !== close) return;
    openPop = null;
    window.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    onClose?.();
  };
  // Escape closes the pop-up only (taken before the screen under it sees the key).
  const onKey = (press) => {
    if (press.key !== 'Escape') return;
    press.preventDefault();
    press.stopImmediatePropagation();
    close();
  };
  const shut = Object.assign(document.createElement('button'), { type: 'button', className: 'info-pop-close', textContent: '✕', ariaLabel: t('cards.close'), onclick: close });
  const card = document.createElement('div');
  card.className = 'info-pop-card';
  card.append(content, shut);
  const backdrop = Object.assign(document.createElement('div'), { className: 'info-pop', role: 'dialog', ariaModal: 'true', ariaLabel: label });
  backdrop.append(card);
  backdrop.addEventListener('click', (click) => { if (click.target === backdrop) close(); });
  window.addEventListener('keydown', onKey, true);
  document.body.append(backdrop);
  openPop = close;
  shut.focus({ preventScroll: true });
  return close;
}

/** The small ⓘ button that opens a choice's details (`open`), never the choice itself. */
export function infoButton(open, label = t('cards.details')) {
  const button = Object.assign(document.createElement('button'), { type: 'button', className: 'info-btn', textContent: 'i', title: label, ariaLabel: label });
  button.addEventListener('click', (click) => { click.stopPropagation(); open(); });
  return button;
}

/** A right-click or a long press on `element` opens its details (`open`); the press's own click is then not a pick. */
export function holdForInfo(element, open) {
  let timer = null;
  let start = null;
  let held = false;
  let pressedAt = 0;
  const cancel = () => { clearTimeout(timer); timer = null; };
  element.addEventListener('contextmenu', (menu) => { menu.preventDefault(); cancel(); open(); });
  element.addEventListener('pointerdown', (press) => {
    if (press.pointerType === 'mouse') return;
    held = false;
    start = [press.clientX, press.clientY];
    pressedAt = press.timeStamp;
    cancel();
    timer = setTimeout(() => { timer = null; held = true; open(); }, INFO_POP.holdMs);
  });
  element.addEventListener('pointermove', (move) => {
    if (timer && Math.hypot(move.clientX - start[0], move.clientY - start[1]) > INFO_POP.slopPx) cancel();
  });
  // (A busy frame can hold the timer past the lift: a press that lasted long enough still counts.)
  element.addEventListener('pointerup', (lift) => {
    if (timer && lift.timeStamp - pressedAt >= INFO_POP.holdMs) {
      held = true;
      open();
    }
    cancel();
  });
  element.addEventListener('pointercancel', cancel);
  element.addEventListener('click', (click) => {
    if (!held) return;
    held = false;
    click.stopImmediatePropagation();
    click.preventDefault();
  }, true);
}

/** A choice with its details a tap away: `choice` (the button that picks) wrapped with its ⓘ, both opening `details()`. */
export function withInfo(choice, details, label) {
  const open = () => openInfoPop(details(), { label });
  holdForInfo(choice, open);
  const wrap = document.createElement('div');
  wrap.className = 'info-pick';
  wrap.append(choice, infoButton(open, label));
  wrap.openInfo = open;
  return wrap;
}
