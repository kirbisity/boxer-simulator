// What the new attack controls share: asking for a move, knowing when it
// was thrown and how it went, and the word of it beside the man it went at
// (its icon, its name, then Hit / Blocked / Missed in colour).

import { P } from '../body.js';
import { strikeOutcome } from '../control.js';
import { opponentFor } from '../physics.js';
import { fightUiMoves } from './logic.js';
import { fightUiIcon } from './icons.js';

export const FIGHT_UI_KIT = {
  // The word stays this long (s) from the blow, and this long after how it went is known.
  callSeconds: 0.9,
  afterOutcome: 0.8,
  // A blow begun this soon (s) after it was asked for is that ask's.
  askedWithin: 1,
};

const FIGHT_UI_OUTCOMES = { hit: 'Hit', glance: 'Glanced', blocked: 'Blocked', parried: 'Parried', miss: 'Missed' };

/** A new element: tag, class, inner markup. */
export const fightUiElement = (tag, className, html = '') => Object.assign(document.createElement(tag), { className, innerHTML: html });

/**
 * The kit for one control design: `hooks` are touch.js's. listen({ thrown,
 * outcome }) hears each blow as it begins ({ move, source }) and how it went.
 */
export function fightUiKit(root, hooks) {
  const toast = root.appendChild(fightUiElement('div', 'fu-toast', '<i class="fu-toast-icon"></i><b class="fu-toast-name"></b><em class="fu-toast-outcome"></em>'));
  toast.setAttribute('role', 'status');
  toast.hidden = true;
  let asked = null;
  let strike = null;
  let cached = { style: null, moves: [] };
  const listeners = [];

  const me = () => hooks.player();
  const world = () => hooks.world();

  /** The moves of his style now (kept until the style changes). */
  function moves() {
    const style = me()?.style;
    if (style !== cached.style) cached = { style, moves: fightUiMoves(style) };
    return cached.moves;
  }

  /** Ask for a move at a zone: thrown at once (or as soon as the hands are back). `source` is told when it begins. */
  function throwMove(move, zone, source = null) {
    const orders = hooks.orders();
    const now = world()?.time ?? 0;
    orders.requests.push({ move, zone, strength: 'quick', at: now });
    asked = { move, source, at: hooks.now() };
    navigator.vibrate?.(8);
    hooks.signal?.('tap', move);
    return true;
  }

  /** Each frame: a blow begun is announced; how it went, when known. */
  function update() {
    const fighter = me();
    const fightWorld = world();
    if (!fighter || !fightWorld) return;
    const now = hooks.now();
    const punch = fighter.punch;
    if (punch && punch !== strike?.punch && punch.spec?.kind === 'strike') {
      const source = asked && asked.move === punch.type && now - asked.at < FIGHT_UI_KIT.askedWithin ? asked.source : null;
      strike = { punch, move: punch.type, source, since: fightWorld.time - (punch.age ?? 0) - 1 / 60, start: now, outcome: null, outcomeAt: null };
      const entry = moves().find((item) => item.move === punch.type);
      toast.querySelector('.fu-toast-icon').innerHTML = entry ? fightUiIcon(entry, { mark: false }) : '';
      toast.querySelector('.fu-toast-name').textContent = entry?.name ?? punch.type;
      toast.querySelector('.fu-toast-outcome').textContent = '';
      toast.dataset.outcome = '';
      toast.hidden = false;
      toast.classList.remove('show');
      void toast.offsetWidth;
      toast.classList.add('show');
      for (const listener of listeners) listener.thrown?.(strike);
      hooks.signal?.('strike', punch.type);
    }
    if (strike && !strike.outcome) {
      const outcome = strikeOutcome(fightWorld.events, fighter.id, strike.since, fighter.punch !== strike.punch);
      if (outcome) {
        strike.outcome = outcome;
        strike.outcomeAt = now;
        toast.dataset.outcome = outcome;
        toast.querySelector('.fu-toast-outcome').textContent = FIGHT_UI_OUTCOMES[outcome];
        for (const listener of listeners) listener.outcome?.(strike);
        hooks.signal?.('outcome', outcome);
      }
    }
    if (strike) {
      const until = Math.max(strike.start + FIGHT_UI_KIT.callSeconds, (strike.outcomeAt ?? strike.start) + FIGHT_UI_KIT.afterOutcome);
      if (now > until && (strike.outcome || fighter.punch !== strike.punch)) {
        toast.classList.remove('show');
        if (now > until + 0.3) {
          toast.hidden = true;
          strike = null;
        }
      }
    }
    placeToast(fightWorld, fighter);
  }

  /** The word beside his man: at the man's shoulder, on the side of the screen nearer the middle. */
  function placeToast(fightWorld, fighter) {
    if (toast.hidden) return;
    const orders = hooks.orders();
    const target = (orders.lock !== null ? fightWorld.fighters[orders.lock] : null) ?? opponentFor(fightWorld, fighter);
    if (!target) return;
    const at = hooks.project([target.x[P.neck * 3], target.x[P.neck * 3 + 1], target.x[P.neck * 3 + 2]]);
    if (!at[2]) return;
    const width = root.getBoundingClientRect().width || innerWidth;
    // On his right if it fits there, else on his left; kept on the screen either way.
    const wide = toast.offsetWidth || 160;
    const right = at[0] + 46 + wide < width - 8 || at[0] - 46 - wide < 8;
    toast.classList.toggle('left', !right);
    const x = right ? Math.max(8, Math.min(width - 8 - wide, at[0] + 46)) : Math.min(width - 8, Math.max(8 + wide, at[0] - 46));
    toast.style.transform = `translate(${x.toFixed(0)}px, ${Math.max(70, at[1]).toFixed(0)}px)`;
  }

  function reset() {
    asked = null;
    strike = null;
    toast.hidden = true;
    cached = { style: null, moves: [] };
  }

  function destroy() {
    toast.remove();
  }

  return { me, world, moves, throwMove, update, reset, destroy, listen: (listener) => listeners.push(listener), toast };
}

/** Show a control's readiness: greyed when it cannot (tired, down), a sweep while a blow is in flight. */
export function fightUiPaintReady(element, ready) {
  element.classList.toggle('fu-tired', ready.why === 'tired' || ready.why === 'none' || ready.why === 'down');
  element.classList.toggle('fu-busy', ready.why === 'busy');
  element.style.setProperty('--fu-cool', String(ready.cooling ?? 0));
}

/** Flash a control: thrown (gold), then how it went (its colour). */
export function fightUiFlash(element, kind) {
  if (!element) return;
  element.dataset.fuFlash = kind;
  element.classList.remove('fu-flash');
  void element.offsetWidth;
  element.classList.add('fu-flash');
}
