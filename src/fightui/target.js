// Body (C, the default): tap his man himself, in the fight, where you want
// to hit (head, body or legs, on the left or right of him as the screen
// shows him). The game picks the move of his style that reaches there best;
// a quick second tap on the same place takes the next best (a jab, then a
// hook). No panel covers the fight: the only sign is a faint ring on his
// chest, which lights in the colour of the move chosen, flashes how it
// went, greys while he has not the wind, and pulses when a tap misses him.

import { P } from '../body.js';
import { opponentFor } from '../physics.js';
import { fightUiColour, fightUiReady, fightUiTarget, FIGHT_UI } from './logic.js';
import { fightUiElement, fightUiFlash, fightUiPaintReady } from './kit.js';

const FIGHT_UI_RETICLE = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="14"/>'
  + '<path d="M20 1v8M20 31v8M1 20h8M31 20h8"/></svg>';

export const FIGHT_UI_TAP = {
  // How far round his figure (in shares of his height on screen) a tap still counts as on him: a finger is wide.
  above: 0.14,
  below: 0.06,
  aside: 0.4,
  // Under this height (px) on screen (far off, in a crowd) he is taken as this tall, so he can still be hit.
  leastTall: 70,
  // The ring: its width as a share of his height on screen, within these px.
  ringShare: 0.2,
  ringLeast: 22,
  ringMost: 54,
  // It stays lit this long (s) after the tap, unless the blow takes longer.
  litFor: 0.9,
};

/** Where on his figure a tap at [x, y] (px) lands, from his head, neck, hips and feet on screen: { zone, side } or null if off him. */
export function fightUiPlaceOnHim(at, head, neck, hips, feet, spec = FIGHT_UI_TAP) {
  const foot = Math.max(feet[0][1], feet[1][1]);
  const tall = Math.max(spec.leastTall, foot - head[1]);
  const [x, y] = at;
  if (y < head[1] - tall * spec.above || y > foot + tall * spec.below || Math.abs(x - hips[0]) > tall * spec.aside) return null;
  const zone = y < neck[1] + tall * 0.02 ? 'head' : y < hips[1] + tall * 0.04 ? 'body' : 'legs';
  const side = x < (zone === 'head' ? head[0] : hips[0]) ? -1 : 1;
  return { zone, side };
}

export function fightUiTargetBody(root, kit, hooks) {
  const ring = root.appendChild(fightUiElement('div', 'fu-reticle', FIGHT_UI_RETICLE));
  ring.setAttribute('aria-hidden', 'true');
  ring.hidden = true;
  let last = null;
  let litUntil = null;
  let readyMove = null;
  let readyStyle = null;

  /** His man: the one locked on, else the one he is on. */
  function targetMan() {
    const world = kit.world();
    const me = kit.me();
    if (!world || !me) return null;
    const orders = hooks.orders();
    return (orders.lock !== null ? world.fighters[orders.lock] : null) ?? opponentFor(world, me);
  }

  const onScreen = (target, index) => hooks.project([target.x[index * 3], target.x[index * 3 + 1], target.x[index * 3 + 2]]);

  /** A tap on a place on him: its best move (the next on a quick second tap). */
  function strikeAt(zone, side) {
    const now = hooks.now();
    const again = last && last.zone === zone && last.side === side && now - last.at < FIGHT_UI.againWithin ? last.again + 1 : 0;
    const pick = fightUiTarget(kit.moves(), zone, side, again);
    if (!pick) return;
    last = { zone, side, at: now, again };
    kit.throwMove(pick.entry, pick.zone, side, ring, { again: again > 0 });
    const colour = fightUiColour(pick.entry.group);
    fightUiFlash(ring, 'asked', colour);
    ring.style.setProperty('--fu-lit', colour);
    ring.classList.add('fu-lit');
    litUntil = now + FIGHT_UI_TAP.litFor;
  }

  /** A tap in the fight: on his man, struck where it landed; off him, the ring pulses to show where to tap. */
  function tapInWorld(event) {
    const target = targetMan();
    if (!target) return false;
    const head = onScreen(target, P.head);
    const hips = onScreen(target, P.pelvis);
    if (!head[2] || !hips[2]) return false;
    const place = fightUiPlaceOnHim(event.at, head, onScreen(target, P.neck), hips, [onScreen(target, P.lFoot), onScreen(target, P.rFoot)]);
    if (!place) {
      fightUiFlash(ring, 'nudge');
      return false;
    }
    strikeAt(place.zone, place.side);
    return true;
  }

  kit.listen({
    // Lit while the blow is on its way.
    thrown: (strike) => { if (strike.source === ring && litUntil !== null) litUntil = Math.max(litUntil, hooks.now() + 0.6); },
    outcome: (strike) => {
      if (strike.source !== ring) return;
      if (litUntil !== null) litUntil = hooks.now() + 0.45;
      fightUiFlash(ring, strike.outcome);
    },
  });

  /** Each frame: the ring on his chest, sized to him, showing whether a blow can be thrown. */
  function update() {
    const me = kit.me();
    const target = targetMan();
    if (!me || !target) {
      ring.hidden = true;
      return;
    }
    const head = onScreen(target, P.head);
    const neck = onScreen(target, P.neck);
    const hips = onScreen(target, P.pelvis);
    ring.hidden = !neck[2] || !hips[2];
    if (ring.hidden) return;
    const tall = Math.max(1, Math.max(onScreen(target, P.lFoot)[1], onScreen(target, P.rFoot)[1]) - head[1]);
    const size = Math.min(FIGHT_UI_TAP.ringMost, Math.max(FIGHT_UI_TAP.ringLeast, tall * FIGHT_UI_TAP.ringShare));
    ring.style.setProperty('--fu-size', `${size.toFixed(1)}px`);
    ring.style.transform = `translate(${((neck[0] + hips[0]) / 2).toFixed(1)}px, ${(neck[1] * 0.6 + hips[1] * 0.4).toFixed(1)}px)`;
    const now = hooks.now();
    if (litUntil !== null && now > litUntil) {
      litUntil = null;
      ring.classList.remove('fu-lit');
    }
    // Ready or not by his body blow, the one a tap on the middle of him throws.
    if (me.style !== readyStyle) {
      readyStyle = me.style;
      readyMove = fightUiTarget(kit.moves(), 'body', 1, 0)?.move ?? null;
    }
    if (readyMove) fightUiPaintReady(ring, fightUiReady(me, readyMove));
  }

  return {
    update,
    reset: () => { last = null; litUntil = null; readyStyle = null; ring.classList.remove('fu-lit'); },
    tap: (event) => { tapInWorld(event); return true; },
    destroy: () => ring.remove(),
  };
}
