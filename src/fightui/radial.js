// POC D, radial hand: one big button by the Guard. Press and hold it and a
// wheel of every move of his style opens round the thumb (each where it
// comes from: hooks to the sides, uppercuts and kicks below, cuts from
// above at the top); slide onto one and let go to throw it, or let go in
// the middle to throw nothing. A quick tap throws the last move again.

import { fightUiRadial, fightUiRadialPick, fightUiReady, fightUiZoneOf } from './logic.js';
import { fightUiIcon, FIGHT_UI_GLYPHS } from './icons.js';
import { fightUiElement, fightUiFlash, fightUiPaintReady } from './kit.js';

export const FIGHT_UI_RADIAL = {
  // A press shorter than this (s), not slid, is a tap: the last move again.
  tapSeconds: 0.2,
  // The wheel's radius (px) and the dead middle where letting go throws nothing.
  radius: 104,
  dead: 34,
};

export function fightUiRadialHand(root, kit, hooks) {
  const hand = root.appendChild(fightUiElement('button', 'fu-hand', `<i class="fu-hand-icon"></i><span class="fu-hand-name"></span><small>hold · wheel</small>`));
  hand.setAttribute('aria-label', 'Attack: tap for the last move again, hold for every move');
  const wheel = root.appendChild(fightUiElement('div', 'fu-wheel', `<div class="fu-wheel-hub">${FIGHT_UI_GLYPHS.ring}<span></span></div>`));
  wheel.hidden = true;
  let style = null;
  let items = [];
  let lastEntry = null;
  let press = null;
  let shownLast = null;

  function build() {
    style = kit.me()?.style;
    items = fightUiRadial(kit.moves()).map((item) => {
      const element = fightUiElement('div', 'fu-wedge', `${fightUiIcon(item.entry)}<span>${item.entry.name}</span>`);
      element.style.setProperty('--fu-dx', `${(Math.cos(item.angle) * FIGHT_UI_RADIAL.radius).toFixed(1)}px`);
      element.style.setProperty('--fu-dy', `${(-Math.sin(item.angle) * FIGHT_UI_RADIAL.radius).toFixed(1)}px`);
      return { ...item, element };
    });
    wheel.replaceChildren(wheel.firstChild, ...items.map((item) => item.element));
    lastEntry = items.find((item) => item.entry.group === 'straight')?.entry ?? items[0]?.entry ?? null;
    showLast();
  }

  function showLast() {
    if (shownLast === lastEntry) return;
    shownLast = lastEntry;
    hand.querySelector('.fu-hand-icon').innerHTML = lastEntry ? fightUiIcon(lastEntry) : FIGHT_UI_GLYPHS.hand;
    hand.querySelector('.fu-hand-name').textContent = lastEntry?.name ?? '';
  }

  /** The wheel round the thumb, kept on the screen (and clear of the footer). */
  function openWheel(at) {
    const box = root.getBoundingClientRect();
    const footer = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--controls-height')) || 56;
    const margin = FIGHT_UI_RADIAL.radius + 40;
    const x = Math.max(box.left + margin, Math.min(box.right - margin, at[0]));
    const y = Math.max(box.top + margin, Math.min(box.bottom - footer - margin, at[1]));
    wheel.style.transform = `translate(${x}px, ${y}px)`;
    wheel.hidden = false;
    press.centre = [x, y];
    wheel.querySelector('.fu-wheel-hub span').textContent = 'Slide to a move';
  }

  function pick(at) {
    if (!press?.centre) return null;
    return fightUiRadialPick(items, at[0] - press.centre[0], press.centre[1] - at[1], FIGHT_UI_RADIAL.dead);
  }

  hand.addEventListener('pointerdown', (down) => {
    down.preventDefault();
    down.stopPropagation();
    try { hand.setPointerCapture(down.pointerId); } catch { /* a pointer already gone */ }
    press = { id: down.pointerId, at: [down.clientX, down.clientY], since: hooks.now(), centre: null, chosen: null };
    hand.classList.add('on');
  });
  hand.addEventListener('pointermove', (move) => {
    if (!press || move.pointerId !== press.id) return;
    const at = [move.clientX, move.clientY];
    if (!press.centre && Math.hypot(at[0] - press.at[0], at[1] - press.at[1]) > 14) openWheel(press.at);
    if (!press.centre) return;
    press.chosen = pick(at);
    for (const item of items) item.element.classList.toggle('lit', item === press.chosen);
    wheel.querySelector('.fu-wheel-hub span').textContent = press.chosen ? press.chosen.entry.name : 'Let go: nothing';
  });
  const release = (up, cancelled) => {
    if (!press || up.pointerId !== press.id) return;
    const done = press;
    press = null;
    hand.classList.remove('on');
    wheel.hidden = true;
    for (const item of items) item.element.classList.remove('lit');
    if (cancelled) return;
    if (!done.centre) {
      // A tap (or a press let go unmoved): the last move again.
      if (lastEntry) {
        kit.throwMove(lastEntry.move, fightUiZoneOf(lastEntry), hand);
        fightUiFlash(hand, 'asked');
      }
      return;
    }
    const chosen = done.chosen ?? pick([up.clientX, up.clientY]);
    if (!chosen) return;
    lastEntry = chosen.entry;
    showLast();
    kit.throwMove(chosen.entry.move, fightUiZoneOf(chosen.entry), hand);
    fightUiFlash(hand, 'asked');
  };
  hand.addEventListener('pointerup', (up) => release(up, false));
  hand.addEventListener('pointercancel', (up) => release(up, true));
  for (const kind of ['contextmenu', 'dblclick']) hand.addEventListener(kind, (event) => event.preventDefault());

  kit.listen({
    thrown: (strike) => fightUiFlash(strike.source, 'thrown'),
    outcome: (strike) => fightUiFlash(strike.source, strike.outcome),
  });

  function update() {
    const me = kit.me();
    if (!me) return;
    if (me.style !== style) build();
    // Held still past the tap's time: the wheel opens where the thumb is.
    if (press && !press.centre && hooks.now() - press.since > FIGHT_UI_RADIAL.tapSeconds) openWheel(press.at);
    for (const item of items) fightUiPaintReady(item.element, fightUiReady(me, item.entry.move));
    if (lastEntry) fightUiPaintReady(hand, fightUiReady(me, lastEntry.move));
  }

  return {
    update,
    reset: () => { style = null; press = null; wheel.hidden = true; shownLast = null; },
    tap: () => true,
    destroy: () => { hand.remove(); wheel.remove(); },
  };
}
