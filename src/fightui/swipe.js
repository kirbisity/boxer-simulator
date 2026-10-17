// POC B, directional strike: a round pad by the Guard. Swipe across it the
// way the blow should go (a cut follows the swipe: down from the upper right
// is a cut from the upper right; in from the side is a hook); a short tap is
// the straight blow (a jab, a cross, a thrust, a shot, in turn). Round the
// rim each move's icon sits where it comes from; the one a swipe would throw
// lights as the finger moves, its name in the middle.

import { fightUiCompass, fightUiReady, fightUiSwipe } from './logic.js';
import { fightUiIcon } from './icons.js';
import { fightUiElement, fightUiFlash, fightUiPaintReady } from './kit.js';

export function fightUiDirectional(root, kit, hooks) {
  const pad = root.appendChild(fightUiElement('div', 'fu-compass', '<svg class="fu-compass-trail" aria-hidden="true"><line/><circle r="7"/></svg><div class="fu-compass-ring"></div><div class="fu-compass-hub"><i class="fu-hub-icon"></i><span class="fu-hub-name"></span></div>'));
  pad.setAttribute('aria-label', 'Strike pad: swipe the way the blow should go, tap for a straight blow');
  const ring = pad.querySelector('.fu-compass-ring');
  const hub = pad.querySelector('.fu-compass-hub');
  const trail = pad.querySelector('.fu-compass-trail');
  let style = null;
  let compass = { tap: [], ring: [] };
  let slots = new Map();
  let tapIndex = 0;
  let drag = null;
  let hubKey = null;

  function build() {
    style = kit.me()?.style;
    compass = fightUiCompass(kit.moves());
    slots = new Map();
    hubKey = null;
    ring.replaceChildren(...compass.ring.map((slot) => {
      const element = fightUiElement('div', 'fu-slot', fightUiIcon(slot.entry));
      element.style.setProperty('--fu-a', `${(-slot.angle).toFixed(3)}rad`);
      element.title = slot.entry.name;
      slots.set(slot.entry.move, element);
      return element;
    }));
    showHub(null);
  }

  /** The middle: the blow a swipe would throw now, or the tap's next straight blow. */
  function showHub(pick) {
    const entry = pick?.entry ?? compass.tap[tapIndex % Math.max(1, compass.tap.length)];
    const key = `${entry?.move}:${Boolean(pick)}`;
    if (key === hubKey) return;
    hubKey = key;
    hub.querySelector('.fu-hub-icon').innerHTML = entry ? fightUiIcon(entry, { mark: false }) : '';
    hub.querySelector('.fu-hub-name').textContent = pick ? entry.name : entry ? `Tap · ${entry.name}` : '';
    hub.classList.toggle('picking', Boolean(pick?.angle !== null && pick));
    for (const [move, element] of slots) element.classList.toggle('lit', Boolean(pick && pick.angle !== null && pick.entry.move === move));
  }

  const centre = () => {
    const box = pad.getBoundingClientRect();
    return [box.left + box.width / 2, box.top + box.height / 2, box.width / 2];
  };

  pad.addEventListener('pointerdown', (press) => {
    press.preventDefault();
    press.stopPropagation();
    try { pad.setPointerCapture(press.pointerId); } catch { /* a pointer already gone */ }
    drag = { id: press.pointerId, start: [press.clientX, press.clientY], at: [press.clientX, press.clientY], pick: null };
    pad.classList.add('pressed');
    drawTrail();
  });
  pad.addEventListener('pointermove', (move) => {
    if (!drag || move.pointerId !== drag.id) return;
    drag.at = [move.clientX, move.clientY];
    const dx = drag.at[0] - drag.start[0];
    const dy = drag.start[1] - drag.at[1];
    drag.pick = fightUiSwipe(compass, dx, dy, tapIndex);
    showHub(drag.pick?.angle === null ? null : drag.pick);
    drawTrail();
  });
  const release = (up, cancelled) => {
    if (!drag || up.pointerId !== drag.id) return;
    const dx = up.clientX - drag.start[0];
    const dy = drag.start[1] - up.clientY;
    const pick = cancelled ? null : fightUiSwipe(compass, dx, dy, tapIndex);
    drag = null;
    pad.classList.remove('pressed');
    trail.classList.remove('on');
    if (pick) {
      const source = pick.angle === null ? hub : slots.get(pick.move);
      kit.throwMove(pick.move, pick.zone, source);
      fightUiFlash(source, 'asked');
      if (pick.angle === null) tapIndex += 1;
    }
    showHub(null);
  };
  pad.addEventListener('pointerup', (up) => release(up, false));
  pad.addEventListener('pointercancel', (up) => release(up, true));
  for (const kind of ['contextmenu', 'dblclick', 'selectstart']) pad.addEventListener(kind, (event) => event.preventDefault());

  /** The finger's line across the pad, from where it went down. */
  function drawTrail() {
    if (!drag) return;
    const [cx, cy, radius] = centre();
    const from = [drag.start[0] - cx + radius, drag.start[1] - cy + radius];
    const to = [drag.at[0] - cx + radius, drag.at[1] - cy + radius];
    trail.classList.toggle('on', Math.hypot(to[0] - from[0], to[1] - from[1]) > 6);
    const line = trail.querySelector('line');
    line.setAttribute('x1', from[0]);
    line.setAttribute('y1', from[1]);
    line.setAttribute('x2', to[0]);
    line.setAttribute('y2', to[1]);
    const dot = trail.querySelector('circle');
    dot.setAttribute('cx', to[0]);
    dot.setAttribute('cy', to[1]);
  }

  kit.listen({
    thrown: (strike) => fightUiFlash(strike.source ?? slots.get(strike.move) ?? hub, 'thrown'),
    outcome: (strike) => fightUiFlash(strike.source ?? slots.get(strike.move) ?? hub, strike.outcome),
  });

  function update() {
    const me = kit.me();
    if (!me) return;
    if (me.style !== style) build();
    for (const slot of compass.ring) fightUiPaintReady(slots.get(slot.entry.move), fightUiReady(me, slot.entry.move));
    const tapEntry = compass.tap[tapIndex % Math.max(1, compass.tap.length)];
    if (tapEntry) fightUiPaintReady(hub, fightUiReady(me, tapEntry.move));
    if (!drag) showHub(null);
  }

  return {
    update,
    reset: () => { style = null; drag = null; tapIndex = 0; },
    tap: () => true,
    destroy: () => pad.remove(),
    hooks,
  };
}
