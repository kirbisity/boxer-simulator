// Buttons (A): a thumb cluster of big round buttons round the Guard, one
// for each kind of blow his style has (straight, swing, from above, rising,
// low, push), each ringed in its kind's colour. Each shows the icon and
// name of the move it throws next; a press throws it (pulsing in its
// colour, and marking the blow on his man) and the button moves on to the
// next of its kind (a jab, then a cross). Keys 1–6 press them too.

import { fightUiButtons, fightUiColour, fightUiReady, fightUiZoneOf, FIGHT_UI } from './logic.js';
import { fightUiIcon } from './icons.js';
import { fightUiElement, fightUiFlash, fightUiPaintReady } from './kit.js';

// Where each button sits: its centre, px left of the right edge and above the footer, round the guard's.
const FIGHT_UI_SLOTS = [[206, 64], [186, 140], [128, 194], [52, 210], [282, 112], [262, 196]];

export function fightUiActionButtons(root, kit, hooks) {
  const cluster = root.appendChild(fightUiElement('div', 'fu-buttons'));
  let style = null;
  let buttons = [];

  function build() {
    style = kit.me()?.style;
    buttons = fightUiButtons(kit.moves()).slice(0, FIGHT_UI_SLOTS.length).map((group, index) => {
      const element = fightUiElement('button', 'fu-btn', '<i class="fu-btn-icon"></i><span class="fu-btn-name"></span><span class="fu-btn-dots"></span><kbd></kbd>');
      element.setAttribute('aria-label', FIGHT_UI.groupNames[group.group]);
      element.dataset.group = group.group;
      element.style.setProperty('--fu-col', fightUiColour(group.group));
      element.querySelector('kbd').textContent = String(index + 1);
      const [right, bottom] = FIGHT_UI_SLOTS[index];
      element.style.setProperty('--fu-x', `${right}px`);
      element.style.setProperty('--fu-y', `${bottom}px`);
      const button = { element, group, next: 0, pressedAt: -Infinity };
      element.addEventListener('pointerdown', (press) => {
        press.preventDefault();
        press.stopPropagation();
        pressButton(button);
      });
      for (const kind of ['contextmenu', 'dblclick']) element.addEventListener(kind, (event) => event.preventDefault());
      show(button);
      return button;
    });
    cluster.replaceChildren(...buttons.map((button) => button.element));
  }

  function show(button) {
    const entry = button.group.moves[button.next];
    button.element.querySelector('.fu-btn-icon').innerHTML = fightUiIcon(entry);
    button.element.querySelector('.fu-btn-name').textContent = entry.name;
    button.element.querySelector('.fu-btn-dots').innerHTML = button.group.moves.length > 1 ? button.group.moves.map((_, index) => `<i class="${index === button.next ? 'on' : ''}"></i>`).join('') : '';
  }

  /** A press: the move it shows, then the next of its kind. */
  function pressButton(button) {
    const entry = button.group.moves[button.next];
    const now = hooks.now();
    const again = now - button.pressedAt < FIGHT_UI.againWithin;
    button.pressedAt = now;
    kit.throwMove(entry, fightUiZoneOf(entry), entry.side, button.element, { again });
    fightUiFlash(button.element, 'asked', fightUiColour(entry.group));
    button.next = (button.next + 1) % button.group.moves.length;
    show(button);
  }

  function onKey(event) {
    if (root.hidden || event.repeat || event.target.closest?.('input, select, textarea')) return;
    const index = Number(event.key) - 1;
    if (Number.isInteger(index) && buttons[index]) {
      event.preventDefault();
      pressButton(buttons[index]);
    }
  }
  window.addEventListener('keydown', onKey);

  kit.listen({
    outcome: (strike) => fightUiFlash(strike.source, strike.outcome),
  });

  function update() {
    const me = kit.me();
    if (!me) return;
    if (me.style !== style) build();
    for (const button of buttons) fightUiPaintReady(button.element, fightUiReady(me, button.group.moves[button.next].move));
  }

  return {
    update,
    reset: () => { style = null; },
    tap: () => true,
    destroy: () => {
      window.removeEventListener('keydown', onKey);
      cluster.remove();
    },
  };
}
