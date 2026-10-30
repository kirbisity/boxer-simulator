// What the two attack controls share: asking for a move (and marking it on
// his man in the fight: fightui/marker.js), knowing when it was thrown and
// how it went, the word of it beside the man (its icon and name in the
// colour of its kind, then Hit / Blocked / Glanced / Missed), the pulse at
// the screen's edge when the player is hit (on the side the blow came
// from), and the legend of the colours in his first fights.

import { P } from '../body.js';
import { opponentFor } from '../physics.js';
import { attackMark, moveName } from '../control.js';
import { FIGHT_UI, fightUiColour, fightUiMoves, fightUiZoneOf } from './logic.js';
import { FIGHT_UI_OUTCOME_GLYPHS, fightUiIcon } from './icons.js';

export const FIGHT_UI_KIT = {
  // The word stays this long (s) from the blow, and this long after how it went is known.
  callSeconds: 0.9,
  afterOutcome: 0.6,
  // A blow begun this soon (s) after it was asked for is that ask's.
  askedWithin: 1,
  // The pulse at the edge when he is hit: this long (s); a blow under this harm share is too light for it.
  dangerSeconds: 0.5,
  // The legend of the colours shows this long (s) in his first this many fights, then only when asked.
  legendSeconds: 7,
  legendFights: 2,
  legendKey: 'gladiator.fightLegendSeen',
};

export const FIGHT_UI_OUTCOME_WORDS = { hit: 'Hit', glance: 'Glanced', blocked: 'Blocked', parried: 'Parried', miss: 'Missed' };

/** A remembered value on this device (null if none, or none can be read: a private window, blocked site data). */
export function fightUiRecall(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Remember a value, if this device lets us. */
export function fightUiRemember(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Not remembered: it holds for this visit.
  }
}

/** A new element: tag, class, inner markup. */
export const fightUiElement = (tag, className, html = '') => Object.assign(document.createElement(tag), { className, innerHTML: html });

/**
 * The event that settled how a blow went (the first after `since`): a blow
 * landed or blocked, his blade parried, or his shot. It carries where it
 * landed (`point`). Null if none yet.
 */
export function fightUiStrikeEvent(events, attacker, since) {
  let found = null;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.time < since) break;
    if (((event.kind === 'landed' || event.kind === 'blocked' || event.kind === 'shot') && event.attacker === attacker) || (event.kind === 'bladeBlock' && event.defender === attacker)) found = event;
  }
  return found;
}

/** How a blow went, by the event that settled it (as control.js strikeOutcome words it, and a shot too): 'hit', 'glance', 'blocked', 'parried' or 'miss'. */
export function fightUiOutcomeOf(event) {
  if (event.kind === 'landed') return event.effects?.some((effect) => /glanced/.test(effect)) ? 'glance' : 'hit';
  if (event.kind === 'blocked') return 'blocked';
  if (event.kind === 'bladeBlock') return 'parried';
  if (event.kind === 'shot') return event.defender === undefined ? 'miss' : event.target === 'shield' ? 'blocked' : 'hit';
  return null;
}

/**
 * Where on the screen's edge a blow from a way comes in: the way (x right,
 * y UP, from the middle) to the edge of a w × h screen. Returns [x, y] in
 * px from the top left.
 */
export function fightUiEdge(dx, dy, width, height) {
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return [width / 2, height];
  const [x, y] = [dx / length, -dy / length];
  const scale = Math.min(x ? width / 2 / Math.abs(x) : Infinity, y ? height / 2 / Math.abs(y) : Infinity);
  return [width / 2 + x * scale, height / 2 + y * scale];
}

/** The legend of the colours: each kind of blow, its colour and its icon's shape. */
export function fightUiLegend() {
  const sample = {
    straight: { travel: null, group: 'straight', limb: 'fist', side: 0 }, side: { travel: [1, 0], group: 'side', limb: 'fist' }, down: { travel: [0, -1], group: 'down', limb: 'fist' },
    rising: { travel: [0, 1], group: 'rising', limb: 'fist' }, low: { travel: [1, 0.1], group: 'low', limb: 'foot' }, push: { travel: null, group: 'push', limb: 'body' },
  };
  return FIGHT_UI.groups.map((group) => `<span class="fu-key" style="--fu-col:${fightUiColour(group)}"><i>${fightUiIcon(sample[group], { mark: false })}</i>${FIGHT_UI.groupNames[group]}</span>`).join('');
}

/**
 * The kit for one control design: `hooks` are touch.js's (with `marks`, the
 * marks in the fight). listen({ thrown, outcome }) hears each blow as it
 * begins ({ move, source, entry }) and how it went.
 */
export function fightUiKit(root, hooks) {
  const toast = root.appendChild(fightUiElement('div', 'fu-toast', '<i class="fu-toast-icon"></i><b class="fu-toast-name"></b><em class="fu-toast-outcome"><i></i><span></span></em>'));
  toast.setAttribute('role', 'status');
  toast.hidden = true;
  const danger = root.appendChild(fightUiElement('div', 'fu-danger'));
  danger.setAttribute('aria-hidden', 'true');
  const legend = root.appendChild(fightUiElement('div', 'fu-legend fu-legend-first', fightUiLegend()));
  legend.hidden = true;
  let asked = null;
  let strike = null;
  let cached = { style: null, moves: [] };
  let heardUntil = null;
  let legendFrom = null;
  let lastWorld = null;
  const listeners = [];

  const me = () => hooks.player();
  const world = () => hooks.world();
  const marks = () => hooks.marks?.() ?? null;

  /** The moves of his style now (kept until the style changes). */
  function moves() {
    const style = me()?.style;
    if (style !== cached.style) cached = { style, moves: fightUiMoves(style) };
    return cached.moves;
  }

  /** His man: the one locked on, else the one he is on. */
  function targetMan() {
    const fightWorld = world();
    const fighter = me();
    if (!fightWorld || !fighter) return null;
    const orders = hooks.orders();
    return (orders.lock !== null ? fightWorld.fighters[orders.lock] : null) ?? attackMark(fightWorld, fighter, orders, opponentFor(fightWorld, fighter));
  }

  /** Mark a blow on his man: where it goes, its way, its colour. */
  function markAim(entry, zone, side) {
    const target = targetMan();
    if (!target || !entry) return;
    marks()?.aim({ target: target.id, from: me().id, zone, side, group: entry.group, travel: entry.travel });
  }

  /**
   * Ask for a move (an entry of moves()) at a zone, on a side of him: thrown
   * at once (or as soon as the hands are back), and marked on him. `source`
   * (the button or place pressed) is told when it begins; `again`: a quick
   * second press (the next blow of a combination).
   */
  function throwMove(entry, zone, side, source = null, { again = false } = {}) {
    const orders = hooks.orders();
    const now = world()?.time ?? 0;
    orders.requests.push({ move: entry.move, zone, strength: 'quick', at: now });
    asked = { move: entry.move, entry, zone, side, source, at: hooks.clock?.() ?? hooks.now() };
    markAim(entry, zone, side);
    navigator.vibrate?.(8);
    hooks.signal?.(again ? 'combo' : 'tap', entry.move);
    return true;
  }

  /** Each frame: a blow begun is announced; how it went, when known; a blow on him pulses the edge. */
  function update() {
    const fighter = me();
    const fightWorld = world();
    if (!fighter || !fightWorld) return;
    // A new fight: nothing of the last one carries over.
    if (fightWorld !== lastWorld) {
      if (lastWorld) reset();
      lastWorld = fightWorld;
    }
    // The fight's own pace (slowed with it, still while paused), so the word keeps step with the marks in the fight.
    const now = hooks.clock?.() ?? hooks.now();
    showLegend(hooks.now());
    const punch = fighter.punch;
    if (punch && punch !== strike?.punch && punch.spec?.kind === 'strike') {
      const mine = asked && asked.move === punch.type && now - asked.at < FIGHT_UI_KIT.askedWithin ? asked : null;
      const entry = moves().find((item) => item.move === punch.type) ?? null;
      strike = { punch, move: punch.type, entry, source: mine?.source ?? null, since: fightWorld.time - (punch.age ?? 0) - 1 / 60, start: now, outcome: null, outcomeAt: null };
      // A blow not asked for here (a key): marked as it begins.
      if (!mine && entry) markAim(entry, punch.zone ?? fightUiZoneOf(entry), entry.side);
      asked = null;
      const colour = entry ? fightUiColour(entry.group) : '#ffffff';
      toast.style.setProperty('--fu-col', colour);
      toast.querySelector('.fu-toast-icon').innerHTML = entry ? fightUiIcon(entry, { mark: false }) : '';
      toast.querySelector('.fu-toast-name').textContent = entry?.name ?? moveName(punch.type).name;
      toast.querySelector('.fu-toast-outcome span').textContent = '';
      toast.querySelector('.fu-toast-outcome i').innerHTML = '';
      toast.dataset.outcome = '';
      toast.hidden = false;
      toast.classList.remove('show');
      void toast.offsetWidth;
      toast.classList.add('show');
      for (const listener of listeners) listener.thrown?.(strike);
      hooks.signal?.('strike', punch.type);
    }
    // Asked for and never thrown (tired, knocked down): its mark goes.
    if (asked && now - asked.at > FIGHT_UI_KIT.askedWithin) {
      asked = null;
      if (!strike || strike.outcome) marks()?.cancel();
    }
    if (strike && !strike.outcome) {
      const event = fightUiStrikeEvent(fightWorld.events, fighter.id, strike.since);
      const outcome = event ? fightUiOutcomeOf(event) : fighter.punch !== strike.punch ? 'miss' : null;
      if (outcome) {
        strike.outcome = outcome;
        strike.outcomeAt = now;
        strike.event = event;
        toast.dataset.outcome = outcome;
        toast.querySelector('.fu-toast-outcome span').textContent = FIGHT_UI_OUTCOME_WORDS[outcome];
        toast.querySelector('.fu-toast-outcome i').innerHTML = FIGHT_UI_OUTCOME_GLYPHS[outcome] ?? '';
        marks()?.land(outcome, strike.event?.point ?? null);
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
    placeToast();
    feelBlows(fightWorld, fighter);
  }

  /** A blow landed on the player: the edge of the screen it came from pulses red. */
  function feelBlows(fightWorld, fighter) {
    const events = fightWorld.events;
    // From the start of the fight (or the controls), only what comes after.
    if (heardUntil === null) {
      heardUntil = events.at(-1)?.time ?? -Infinity;
      return;
    }
    let blow = null;
    for (let index = events.length - 1; index >= 0 && events[index].time > heardUntil; index -= 1) {
      const event = events[index];
      if (event.kind === 'landed' && event.defender === fighter.id && !blow) blow = event;
    }
    heardUntil = events.at(-1)?.time ?? heardUntil;
    if (!blow) return;
    const attacker = fightWorld.fighters[blow.attacker];
    const { ahead, right } = hooks.floorAxes?.() ?? { ahead: [0, 1], right: [1, 0] };
    const from = attacker ?? null;
    const rel = from ? [from.x[P.pelvis * 3] - fighter.x[P.pelvis * 3], from.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2]] : [0, 1];
    const box = root.getBoundingClientRect();
    const width = box.width || innerWidth;
    const height = box.height || innerHeight;
    const [x, y] = fightUiEdge(rel[0] * right[0] + rel[1] * right[1], rel[0] * ahead[0] + rel[1] * ahead[1], width, height);
    danger.style.setProperty('--fu-dx', `${((x / width) * 100).toFixed(1)}%`);
    danger.style.setProperty('--fu-dy', `${((y / height) * 100).toFixed(1)}%`);
    danger.classList.remove('on');
    void danger.offsetWidth;
    danger.classList.add('on');
  }

  /** The word beside his man: at the man's shoulder, on the side of the screen nearer the middle. */
  function placeToast() {
    if (toast.hidden) return;
    const target = targetMan();
    if (!target) return;
    // At the height of his head, clear of the ring on him.
    const at = hooks.project([target.x[P.head * 3], target.x[P.head * 3 + 1] + 0.1, target.x[P.head * 3 + 2]]);
    if (!at[2]) return;
    const width = root.getBoundingClientRect().width || innerWidth;
    // On his right if it fits there, else on his left; kept on the screen either way.
    const wide = toast.offsetWidth || 160;
    const gap = 62;
    const right = at[0] + gap + wide < width - 8 || at[0] - gap - wide < 8;
    toast.classList.toggle('left', !right);
    const x = right ? Math.max(8, Math.min(width - 8 - wide, at[0] + gap)) : Math.min(width - 8, Math.max(8 + wide, at[0] - gap));
    toast.style.transform = `translate(${x.toFixed(0)}px, ${Math.max(70, at[1]).toFixed(0)}px)`;
  }

  /** The legend in his first fights: shown a while, then gone (counted per fight). */
  function showLegend(now) {
    if (legendFrom === null) {
      legendFrom = now;
      const seen = Number(fightUiRecall(FIGHT_UI_KIT.legendKey)) || 0;
      legend.hidden = seen >= FIGHT_UI_KIT.legendFights;
      if (!legend.hidden) fightUiRemember(FIGHT_UI_KIT.legendKey, String(seen + 1));
    }
    if (!legend.hidden && now - legendFrom > FIGHT_UI_KIT.legendSeconds) legend.hidden = true;
  }

  function reset() {
    asked = null;
    strike = null;
    toast.hidden = true;
    danger.classList.remove('on');
    cached = { style: null, moves: [] };
    heardUntil = null;
    legendFrom = null;
    legend.hidden = true;
    marks()?.reset();
  }

  function destroy() {
    toast.remove();
    danger.remove();
    legend.remove();
  }

  return { me, world, moves, targetMan, throwMove, update, reset, destroy, listen: (listener) => listeners.push(listener), toast };
}

/** Show a control's readiness: greyed when it cannot (tired, down), a sweep while a blow is in flight. */
export function fightUiPaintReady(element, ready) {
  element.classList.toggle('fu-tired', ready.why === 'tired' || ready.why === 'none' || ready.why === 'down');
  element.classList.toggle('fu-busy', ready.why === 'busy');
  element.style.setProperty('--fu-cool', String(ready.cooling ?? 0));
}

/** Flash a control: asked (its kind's colour, a pulse), then how it went. */
export function fightUiFlash(element, kind, colour = null) {
  if (!element) return;
  element.dataset.fuFlash = kind;
  if (colour) element.style.setProperty('--fu-lit', colour);
  element.classList.remove('fu-flash');
  void element.offsetWidth;
  element.classList.add('fu-flash');
}
