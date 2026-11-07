// The switch between the two attack controls: "Controls: Body · Buttons" in
// the fight's footer (with a key that opens the legend of the colours), and
// a line on the home screen that flips it. Both remember the choice.

import { FIGHT_UI_DESIGNS, fightUiChoose, fightUiPreferred } from './index.js';
import { fightUiElement, fightUiLegend } from './kit.js';
import { onLangChange, t } from '../i18n.js';

/** Wire the footer's switch (index.html #fightui-pick): its buttons choose; its key shows the colours. */
export function fightUiWireToggle(pick) {
  if (!pick) return;
  const legend = document.body.appendChild(fightUiElement('div', 'fu-legend fu-legend-pop', `<b>${t('menu.controls.legend')}</b>${fightUiLegend()}`));
  // In the new language when it changes (the legend's own rows too, as fightui/kit.js words them).
  onLangChange(() => { legend.innerHTML = `<b>${t('menu.controls.legend')}</b>${fightUiLegend()}`; });
  legend.id = 'fightui-legend';
  legend.hidden = true;
  const key = pick.querySelector('.fu-pick-key');
  const paint = (id) => {
    for (const button of pick.querySelectorAll('button[data-value]')) {
      button.classList.toggle('on', button.dataset.value === id);
      button.setAttribute('aria-pressed', String(button.dataset.value === id));
    }
  };
  for (const button of pick.querySelectorAll('button[data-value]')) button.addEventListener('click', () => fightUiChoose(button.dataset.value));
  const showLegend = (on) => {
    legend.hidden = !on;
    key?.setAttribute('aria-expanded', String(on));
    key?.classList.toggle('on', on);
  };
  key?.addEventListener('click', (event) => {
    event.stopPropagation();
    showLegend(legend.hidden);
  });
  legend.addEventListener('click', () => showLegend(false));
  addEventListener('fightui', (event) => paint(event.detail));
  paint(fightUiPreferred());
}

/** The home screen's line: "Controls: Body", a tap flips to the other. */
export function fightUiHomeSwitch(make) {
  const designName = (id) => ({ target: t('menu.controls.body'), buttons: t('menu.controls.buttons') })[id] ?? FIGHT_UI_DESIGNS[id].name;
  const label = () => t('menu.controls', { name: designName(fightUiPreferred()) });
  const button = make(label(), () => {
    fightUiChoose(fightUiPreferred() === 'target' ? 'buttons' : 'target');
    button.textContent = label();
  });
  button.title = t('menu.controls.title');
  return button;
}
