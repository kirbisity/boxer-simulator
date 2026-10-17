// POC C, target on the body: a small figure of his man by the Guard, cut
// into six places to hit (head, body and legs, each on the left or right of
// the screen). Tap where you want to hit; the game picks the move of his
// style that reaches there best (each place shows its move's icon); a
// quick second tap on the same place takes the next best (a jab, then a
// hook). A tap on the man himself in the fight does the same, by where it
// lands on him. The place struck lights in how it went.

import { P } from '../body.js';
import { opponentFor } from '../physics.js';
import { fightUiReady, fightUiTarget, FIGHT_UI } from './logic.js';
import { fightUiIcon } from './icons.js';
import { fightUiElement, fightUiFlash, fightUiPaintReady } from './kit.js';

const FIGHT_UI_FIGURE = '<svg class="fu-figure" viewBox="0 0 120 220" aria-hidden="true">'
  + '<circle cx="60" cy="27" r="19"/>'
  + '<path d="M60 48c-12 0-30 4-34 12l-10 46c-1 5 7 7 9 2l9-34 2 52h48l2-52 9 34c2 5 10 3 9-2l-10-46c-4-8-22-12-34-12z"/>'
  + '<path d="M38 128l-6 82c0 6 12 6 13 0l13-62h4l13 62c1 6 13 6 13 0l-6-82z"/>'
  + '<path d="M60 4v212" class="fu-figure-mid"/></svg>';

const FIGHT_UI_ZONES = [
  { zone: 'head', side: -1 }, { zone: 'head', side: 1 },
  { zone: 'body', side: -1 }, { zone: 'body', side: 1 },
  { zone: 'legs', side: -1 }, { zone: 'legs', side: 1 },
];

export function fightUiTargetBody(root, kit, hooks) {
  const panel = root.appendChild(fightUiElement('div', 'fu-target', `${FIGHT_UI_FIGURE}<div class="fu-target-name"></div>`));
  panel.setAttribute('aria-label', 'Tap where to hit him');
  const nameLine = panel.querySelector('.fu-target-name');
  let style = null;
  let last = null;
  const places = FIGHT_UI_ZONES.map((place) => {
    const element = panel.appendChild(fightUiElement('button', `fu-zone ${place.zone} ${place.side < 0 ? 'left' : 'right'}`, '<i class="fu-zone-icon"></i>'));
    element.setAttribute('aria-label', `${place.zone} ${place.side < 0 ? 'left' : 'right'}`);
    element.addEventListener('pointerdown', (press) => {
      press.preventDefault();
      press.stopPropagation();
      strikeAt(place.zone, place.side, element);
    });
    element.addEventListener('contextmenu', (event) => event.preventDefault());
    return { ...place, element, pick: null };
  });

  /** A tap on a place on him: its best move (the next on a quick second tap). */
  function strikeAt(zone, side, source) {
    const now = hooks.now();
    const again = last && last.zone === zone && last.side === side && now - last.at < FIGHT_UI.againWithin ? last.again + 1 : 0;
    const pick = fightUiTarget(kit.moves(), zone, side, again);
    if (!pick) return;
    last = { zone, side, at: now, again };
    kit.throwMove(pick.move, pick.zone, source);
    fightUiFlash(source, 'asked');
    nameLine.textContent = pick.entry.name;
  }

  function build() {
    style = kit.me()?.style;
    for (const place of places) {
      place.pick = fightUiTarget(kit.moves(), place.zone, place.side, 0);
      place.element.querySelector('.fu-zone-icon').innerHTML = place.pick ? fightUiIcon(place.pick.entry) : '';
      place.element.title = place.pick?.entry.name ?? '';
      // No move of his reaches there (a boxer at the legs): the best he has, dimmed.
      place.element.classList.toggle('fu-cant', !place.pick?.reaches);
    }
    nameLine.textContent = 'Tap where to hit';
  }

  /** A tap in the fight on his man: the place on him it landed on, struck. True if it was on him. */
  function tapInWorld(event) {
    const world = kit.world();
    const me = kit.me();
    const orders = hooks.orders();
    const target = (orders.lock !== null ? world.fighters[orders.lock] : null) ?? opponentFor(world, me);
    if (!target) return false;
    const screen = (index) => hooks.project([target.x[index * 3], target.x[index * 3 + 1], target.x[index * 3 + 2]]);
    const head = screen(P.head);
    const neck = screen(P.neck);
    const hips = screen(P.pelvis);
    const feet = [screen(P.lFoot), screen(P.rFoot)];
    if (!head[2] || !hips[2]) return false;
    const foot = Math.max(feet[0][1], feet[1][1]);
    const tall = Math.max(40, foot - head[1]);
    const [x, y] = event.at;
    if (y < head[1] - tall * 0.12 || y > foot + tall * 0.04 || Math.abs(x - hips[0]) > tall * 0.32) return false;
    const zone = y < neck[1] + tall * 0.02 ? 'head' : y < hips[1] + tall * 0.04 ? 'body' : 'legs';
    const side = x < (zone === 'head' ? head[0] : hips[0]) ? -1 : 1;
    const place = places.find((item) => item.zone === zone && item.side === side);
    strikeAt(zone, side, place?.element ?? null);
    return true;
  }

  kit.listen({
    thrown: (strike) => fightUiFlash(strike.source, 'thrown'),
    outcome: (strike) => fightUiFlash(strike.source, strike.outcome),
  });

  function update() {
    const me = kit.me();
    if (!me) return;
    if (me.style !== style) build();
    for (const place of places) if (place.pick) fightUiPaintReady(place.element, fightUiReady(me, place.pick.move));
  }

  return {
    update,
    reset: () => { style = null; last = null; },
    tap: (event) => { tapInWorld(event); return true; },
    destroy: () => panel.remove(),
  };
}
