// The fight's controls on screen, for a finger or a mouse: the game surface
// (drag anywhere open for a floating stick; tap the right side to attack a
// line; long-press a man to lock him), a big Guard button, one special
// button in a fixed place, a Lock button, and the fight-mode HUD (the
// player's status low down, his man's over his head). Only this surface
// takes the browser's gestures from it: menus and text elsewhere stay
// selectable and scroll as usual.

import { P } from './body.js';
import { hurtShare } from './ai.js';
import { ACTIONS, contextAction } from './control.js';
import { createRecognizer, GESTURE } from './gesture.js';
import { inFight, opponentFor, point } from './physics.js';

export const TOUCH = {
  // The right side's share of the screen that takes attacks; its outer strip (px, at least) lunges.
  attackFrom: 0.5,
  lungeStrip: 0.11,
  lungeMinPx: 64,
  // A finger within this (px) of a man's drawn body is on him.
  manRadius: 44,
  // A press on the guard shorter than this (s) is a tap: an evasion, not a block.
  guardTap: 0.18,
  // The marker over his man fades to this, this long (s) after anything last happened to either.
  markerIdle: 0.3,
  markerAwake: 2.5,
};

const uiElement = (tag, className, text) => Object.assign(document.createElement(tag), { className, ...(text ? { textContent: text } : {}) });

/**
 * Put the fight's controls in `root`. `hooks`: world(), player(), orders(),
 * project([x, y, z]) → [px, py, inFront], floorAxes() → { ahead, right }
 * (the camera's on the floor), now() (s). Returns { update, setActive, reset }.
 */
export function installFightControls(root, hooks) {
  const gestures = createRecognizer();
  const surface = root.appendChild(uiElement('div', 'touch-surface'));
  surface.setAttribute('aria-label', 'Fight: drag to move, tap the right side to attack, long-press a man to lock on');
  const hints = surface.appendChild(uiElement('div', 'zone-hints'));
  hints.setAttribute('aria-hidden', 'true');
  for (const [line, label] of [['high', 'High'], ['mid', 'Body'], ['low', 'Low'], ['lunge', 'Lunge']]) hints.appendChild(uiElement('span', `hint ${line}`, label));
  const stick = root.appendChild(uiElement('div', 'stick'));
  stick.appendChild(uiElement('i', 'knob'));
  stick.hidden = true;
  const charge = root.appendChild(uiElement('div', 'charge'));
  charge.hidden = true;
  const guard = root.appendChild(uiElement('button', 'fight-button guard-button'));
  guard.innerHTML = '<b>🛡</b><span>Guard</span>';
  const action = root.appendChild(uiElement('button', 'fight-button action-button'));
  action.innerHTML = '<b></b><span></span>';
  const lock = root.appendChild(uiElement('button', 'lock-button'));
  const status = root.appendChild(uiElement('div', 'player-status'));
  status.innerHTML = '<div class="top"><span class="name"></span><span class="tag"></span></div><div class="bar health"><i></i></div><div class="bar stamina"><i></i></div>';
  const marker = root.appendChild(uiElement('div', 'target-marker'));
  marker.innerHTML = '<span class="name"></span><div class="bar health"><i></i></div>';
  const touches = new Map();
  let stickId = null;
  let guardDown = null;
  let lastAction = null;
  const awake = new Map();
  let active = false;

  /** What a touch at (x, y) starts on: a man, an attack line, or open floor. */
  function regionAt(x, y) {
    const world = hooks.world();
    const me = hooks.player();
    const box = surface.getBoundingClientRect();
    let man;
    let nearest = TOUCH.manRadius;
    for (const other of world?.fighters ?? []) {
      if (!me || other.corner === me.corner || !inFight(other)) continue;
      // His drawn body: a line from the head to between the feet.
      const head = hooks.project(vec3(point(other.x, P.head), 0.12));
      const feet = hooks.project(vec3(point(other.x, P.pelvis), 0, true));
      if (!head[2] || !feet[2]) continue;
      const away = screenSegmentDistance([x, y], head, feet);
      if (away < nearest) {
        nearest = away;
        man = other.id;
      }
    }
    if (man !== undefined) return { man, line: 'close' };
    const across = (x - box.left) / box.width;
    if (across < TOUCH.attackFrom) return { line: null };
    if (box.right - x < Math.max(TOUCH.lungeMinPx, box.width * TOUCH.lungeStrip)) return { line: 'lunge' };
    const down = (y - box.top) / box.height;
    return { line: down < 0.4 ? 'high' : down < 0.68 ? 'mid' : 'low' };
  }

  /** The stick's screen way, as a way on the floor: up the screen is where the camera looks. */
  function floorWay(dx, dy) {
    const { ahead, right } = hooks.floorAxes();
    const way = [right[0] * dx - ahead[0] * dy, right[1] * dx - ahead[1] * dy];
    const length = Math.hypot(way[0], way[1]) || 1;
    return [way[0] / length, way[1] / length];
  }

  function handle(events) {
    const orders = hooks.orders();
    const world = hooks.world();
    for (const event of events) {
      if (event.type === 'stick') {
        if (stickId === null) stickId = event.id;
        if (stickId !== event.id) continue;
        orders.stick = event.amount > 0 ? { dir: floorWay(event.dx, event.dy), amount: event.amount } : null;
        showStick(event);
      } else if (event.type === 'stickEnd') {
        if (stickId !== event.id) continue;
        stickId = null;
        orders.stick = null;
        stick.hidden = true;
      } else if (event.type === 'charge') {
        charge.hidden = false;
        charge.style.transform = `translate(${event.at[0]}px, ${event.at[1]}px) translate(-50%, -50%) scale(${0.6 + 0.6 * event.share})`;
      } else if (event.type === 'longPress') {
        const man = event.region.man;
        orders.lock = orders.lock === man ? null : man;
        navigator.vibrate?.(15);
        wake(man);
      } else if (event.type === 'tap' || event.type === 'heavy') {
        charge.hidden = true;
        const line = event.region?.line;
        if (!line) continue;
        const strength = event.type === 'heavy' ? 'heavy' : event.double ? 'combo' : 'quick';
        orders.requests.push({ line, strength, at: world.time });
        const target = orders.lock ?? opponentFor(world, hooks.player())?.id;
        if (target !== undefined && target !== null) wake(target);
      }
    }
  }

  function showStick(event) {
    stick.hidden = false;
    const radius = GESTURE.stickRadius;
    const length = Math.hypot(event.dx, event.dy) || 1;
    const reach = Math.min(radius, length);
    stick.style.transform = `translate(${event.origin[0]}px, ${event.origin[1]}px)`;
    stick.firstChild.style.transform = `translate(${(event.dx / length) * reach}px, ${(event.dy / length) * reach}px)`;
    stick.classList.toggle('running', event.amount >= 0.88);
  }

  // The surface's own touches: captured, so a finger that strays over a button or off the edge keeps its gesture.
  surface.addEventListener('pointerdown', (press) => {
    if (!active) return;
    press.preventDefault();
    capture(surface, press.pointerId);
    touches.set(press.pointerId, true);
    handle(gestures.down(press.pointerId, [press.clientX, press.clientY], hooks.now(), regionAt(press.clientX, press.clientY)));
  });
  surface.addEventListener('pointermove', (move) => {
    if (!touches.has(move.pointerId)) return;
    handle(gestures.move(move.pointerId, [move.clientX, move.clientY]));
  });
  const lift = (up) => {
    if (!touches.has(up.pointerId)) return;
    touches.delete(up.pointerId);
    handle(gestures.up(up.pointerId, [up.clientX, up.clientY], hooks.now()));
    if (!touches.size) charge.hidden = true;
  };
  surface.addEventListener('pointerup', lift);
  surface.addEventListener('pointercancel', (cancel) => {
    if (!touches.has(cancel.pointerId)) return;
    touches.delete(cancel.pointerId);
    handle(gestures.cancel(cancel.pointerId));
    charge.hidden = true;
  });
  surface.addEventListener('lostpointercapture', (lost) => {
    if (touches.has(lost.pointerId)) {
      touches.delete(lost.pointerId);
      handle(gestures.cancel(lost.pointerId));
    }
  });
  // No callout, selection, context menu or page zoom from the fight.
  for (const kind of ['contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'dblclick']) {
    for (const target of [surface, guard, action, lock]) target.addEventListener(kind, (event) => event.preventDefault());
  }

  // Guard: held, the block; tapped, an evasion.
  guard.addEventListener('pointerdown', (press) => {
    if (!active) return;
    press.preventDefault();
    capture(guard, press.pointerId);
    guardDown = { id: press.pointerId, at: hooks.now() };
    guard.classList.add('on');
  });
  const guardUp = (up, cancelled) => {
    if (!guardDown || guardDown.id !== up.pointerId) return;
    const orders = hooks.orders();
    if (!cancelled && hooks.now() - guardDown.at < TOUCH.guardTap) (orders.evasions ??= []).push(1);
    orders.guard = false;
    guardDown = null;
    guard.classList.remove('on');
  };
  guard.addEventListener('pointerup', (up) => guardUp(up, false));
  guard.addEventListener('pointercancel', (up) => guardUp(up, true));

  action.addEventListener('pointerdown', (press) => {
    press.preventDefault();
    if (!active || !lastAction) return;
    (hooks.orders().actions ??= []).push(lastAction);
    navigator.vibrate?.(10);
  });
  lock.addEventListener('click', () => {
    const orders = hooks.orders();
    if (orders.lock !== null) orders.lock = null;
    else {
      const target = opponentFor(hooks.world(), hooks.player());
      if (target) {
        orders.lock = target.id;
        wake(target.id);
      }
    }
  });

  function wake(id) {
    awake.set(id, hooks.now());
  }

  /** Each frame: held touches age, the buttons and the HUD follow the fight. */
  function update() {
    if (!active) return;
    const now = hooks.now();
    handle(gestures.tick(now));
    const world = hooks.world();
    const me = hooks.player();
    const orders = hooks.orders();
    if (!world || !me) return;
    if (guardDown && now - guardDown.at >= TOUCH.guardTap) orders.guard = true;
    // The special button: one place, its label what it would do now.
    const name = contextAction(world, me);
    if (name !== lastAction) {
      lastAction = name;
      action.disabled = !name;
      action.classList.toggle('idle', !name);
      action.querySelector('b').textContent = name ? ACTIONS[name].icon : '·';
      action.querySelector('span').textContent = name ? ACTIONS[name].label : 'Action';
    }
    const locked = orders.lock !== null ? world.fighters[orders.lock] : null;
    lock.textContent = locked ? `◎ Unlock ${firstNameOf(locked)}` : '◎ Lock';
    lock.classList.toggle('on', Boolean(locked));
    // The player's own status, compact, low down.
    status.querySelector('.name').textContent = firstNameOf(me);
    status.querySelector('.tag').textContent = me.state === 'down' ? 'DOWN' : me.stagger > 0 ? 'REELING' : me.reloading ? 'LOADING' : '';
    status.querySelector('.health i').style.width = `${Math.round((1 - hurtShare(me)) * 100)}%`;
    status.querySelector('.stamina i').style.width = `${Math.round(me.stamina * 100)}%`;
    // His man: the one locked, or the one he is on; a marker over his head.
    const target = locked ?? opponentFor(world, me);
    for (const event of world.events.slice(-6)) if (event.time > world.time - 0.1 && event.defender !== undefined) wake(event.defender);
    if (!target) {
      marker.hidden = true;
      return;
    }
    const at = hooks.project(vec3(point(target.x, P.head), 0.42));
    marker.hidden = !at[2];
    if (!at[2]) return;
    marker.style.transform = `translate(${at[0]}px, ${at[1]}px) translate(-50%, -100%)`;
    marker.querySelector('.name').textContent = firstNameOf(target);
    marker.querySelector('.health i').style.width = `${Math.round((1 - hurtShare(target)) * 100)}%`;
    marker.classList.toggle('locked', Boolean(locked));
    const fresh = now - (awake.get(target.id) ?? -Infinity) < TOUCH.markerAwake;
    marker.style.opacity = locked || fresh ? '1' : String(TOUCH.markerIdle);
  }

  function setActive(on) {
    active = on;
    root.hidden = !on;
    if (!on) reset();
  }

  function reset() {
    gestures.reset();
    touches.clear();
    stickId = null;
    guardDown = null;
    lastAction = undefined;
    stick.hidden = true;
    charge.hidden = true;
    guard.classList.remove('on');
    awake.clear();
  }

  return { update, setActive, reset };
}

/** Keep a pointer's events coming here even off the element (a pointer the browser no longer knows is let be). */
function capture(element, pointerId) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Already lifted, or not a live pointer: its events still come while it is over the element.
  }
}

const vec3 = (at, up = 0, floor = false) => [at[0], floor ? 0.05 : at[1] + up, at[2]];
const firstNameOf = (fighter) => fighter.body.inputs.name.split(' ')[0];

/** Distance (px) from a point to the segment a–b. */
function screenSegmentDistance(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1]];
  const lengthSquared = ab[0] * ab[0] + ab[1] * ab[1] || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / lengthSquared));
  return Math.hypot(p[0] - (a[0] + ab[0] * t), p[1] - (a[1] + ab[1] * t));
}
