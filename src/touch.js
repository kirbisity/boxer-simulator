// The fight's controls on screen, for a finger or a mouse: the game surface
// (a drag begun in the top half turns the view, two fingers there zoom; a
// drag begun in the bottom half is a floating stick; a mouse's right button
// always turns the view; tap anywhere for an attack, which one by where:
// every move of his style has its place on the screen; press and hold to
// shove, or to hold down a man on the floor), a big Guard button, a Lock
// button above it, one special button in a fixed place, and the fight-mode
// HUD (the player's status low down, his man's over his head, and the name
// of each attack he makes, with how it went).
// Only this surface takes the browser's gestures from it: menus and text
// elsewhere stay selectable and scroll as usual.

import { P } from './body.js';
import { hurtShare } from './ai.js';
import { ACTIONS, attackAt, attackLayout, attackWhere, contextAction, moveName, strikeOutcome } from './control.js';
import { createRecognizer, GESTURE, screenZone } from './gesture.js';
import { inFight, opponentFor, point, reachOf } from './physics.js';

export const TOUCH = {
  // A tap's line of sight passing within this (m) of a man's body is aimed at him.
  manWithin: 0.35,
  // Otherwise it strikes the air this share of his reach before him, where the line of sight crosses it.
  airReach: 0.9,
  // A press on the guard shorter than this (s) is a tap: an evasion, not a block.
  guardTap: 0.18,
  // The marker over his man fades to this, this long (s) after anything last happened to either.
  markerIdle: 0.3,
  markerAwake: 2.5,
  // The ring where a tap or press landed fades over this (s).
  markSeconds: 0.35,
  // The pad keeps clear of the buttons' column at the right edge (px).
  padRight: 130,
  // rad the view turns for each px dragged, across and up.
  lookYaw: 0.008,
  lookPitch: 0.005,
  // The attack's name stays this long (s) from the blow, and at least this long after how it went is known.
  callSeconds: 0.8,
  callAfterOutcome: 0.6,
  // The man's attack, small over his head, this long (s).
  incomingSeconds: 0.7,
  // The look and move hints fade this long (s) after both have been used.
  hintFade: 1.5,
};

const OUTCOME_WORDS = { hit: 'Hit', glance: 'Glanced off', blocked: 'Blocked', parried: 'Parried', miss: 'Missed' };

const uiElement = (tag, className, text) => Object.assign(document.createElement(tag), { className, ...(text ? { textContent: text } : {}) });

/**
 * Put the fight's controls in `root`. `hooks`: world(), player(), orders(),
 * project([x, y, z]) → [px, py, inFront], ray(px, py) → { origin, dir } (the
 * line of sight through a point on the screen), floorAxes() → { ahead, right }
 * (the camera's on the floor), now() (s). Returns { update, setActive, reset }.
 */
export function installFightControls(root, hooks) {
  const surface = root.appendChild(uiElement('div', 'touch-surface'));
  surface.setAttribute('aria-label', 'Fight: drag in the top half to look about, in the bottom half to move; tap for an attack (each move has its place on the screen), press and hold to shove or hold a man down');
  const gestures = createRecognizer(GESTURE, { zoneOf: (at) => {
    const { top, height } = playArea();
    return screenZone(at[1], top, height);
  } });
  // The two halves, named faintly until each has been used.
  const hints = root.appendChild(uiElement('div', 'zone-hints'));
  hints.setAttribute('aria-hidden', 'true');
  hints.innerHTML = '<span class="look"></span><i class="divider"></i><span class="move"></span>';
  const used = { look: false, move: false, at: null };
  // The attack just made: its name, where it went, how it went.
  const call = root.appendChild(uiElement('div', 'strike-call'));
  call.setAttribute('role', 'status');
  call.innerHTML = '<span class="where"></span><b class="name"></b><span class="gloss"></span><em class="outcome"></em>';
  call.hidden = true;
  let strike = null;
  let lastTapAt = null;
  const stick = root.appendChild(uiElement('div', 'stick'));
  stick.appendChild(uiElement('i', 'knob'));
  stick.hidden = true;
  // The pad's labels: each move of his style, faintly, where a tap throws it.
  const pad = root.appendChild(uiElement('div', 'attack-pad'));
  pad.setAttribute('aria-hidden', 'true');
  let padStyle = null;
  const mark = root.appendChild(uiElement('div', 'tap-mark'));
  mark.hidden = true;
  const guard = root.appendChild(uiElement('button', 'fight-button guard-button'));
  guard.innerHTML = '<b>🛡</b><span>Guard</span>';
  const action = root.appendChild(uiElement('button', 'fight-button action-button'));
  action.innerHTML = '<b></b><span></span>';
  const lock = root.appendChild(uiElement('button', 'fight-button lock-button'));
  lock.innerHTML = '<b>◎</b><span class="label">Lock</span><span class="who"></span>';
  const status = root.appendChild(uiElement('div', 'player-status'));
  status.innerHTML = '<div class="top"><span class="name"></span><span class="tag"></span></div><div class="bar health"><i></i></div><div class="bar stamina"><i></i></div>';
  const marker = root.appendChild(uiElement('div', 'target-marker'));
  marker.innerHTML = '<span class="incoming"></span><span class="name"></span><div class="bar health"><i></i></div>';
  let incoming = null;
  const touches = new Map();
  let stickId = null;
  let guardDown = null;
  let lastAction = null;
  let markAt = -Infinity;
  const awake = new Map();
  let active = false;

  /**
   * The place in the world a point on the screen means: on a man if the line
   * of sight passes by his body, else in the air at striking distance before
   * the player, where the line of sight crosses it.
   */
  function aimAt(x, y) {
    const world = hooks.world();
    const me = hooks.player();
    const { origin, dir } = hooks.ray(x, y);
    let best = null;
    let bestDistance = TOUCH.manWithin;
    for (const other of world?.fighters ?? []) {
      if (!me || other.corner === me.corner || !inFight(other)) continue;
      const near = rayToSegment(origin, dir, point(other.x, P.pelvis), point(other.x, P.head));
      if (near.distance < bestDistance) {
        bestDistance = near.distance;
        best = near.onSegment;
      }
    }
    if (best) return best;
    // The air before him: where the line of sight comes within his reach of him, at its far side.
    const hips = point(me.x, P.pelvis);
    const radius = reachOf(me) * TOUCH.airReach;
    const flat = [dir[0], dir[2]];
    const flatLength = Math.hypot(flat[0], flat[1]) || 1e-6;
    const unit = [flat[0] / flatLength, flat[1] / flatLength];
    const along = (hips[0] - origin[0]) * unit[0] + (hips[2] - origin[2]) * unit[1];
    const across = Math.hypot(origin[0] + unit[0] * along - hips[0], origin[2] + unit[1] * along - hips[2]);
    const beyond = Math.sqrt(Math.max(0, radius * radius - across * across));
    const run = Math.max(0, along + beyond) / flatLength;
    const at = [origin[0] + dir[0] * run, origin[1] + dir[1] * run, origin[2] + dir[2] * run];
    // A tap off past the edge of his reach is still struck within it.
    const off = [at[0] - hips[0], at[2] - hips[2]];
    const offLength = Math.hypot(off[0], off[1]) || 1;
    const scale = Math.min(1, radius / offLength);
    const top = me.x[P.head * 3 + 1] + 0.1;
    return [hips[0] + off[0] * scale, Math.max(0.15, Math.min(top, at[1])), hips[2] + off[1] * scale];
  }

  /** The stick's screen way, as a way on the floor: up the screen is where the camera looks. */
  function floorWay(dx, dy) {
    const { ahead, right } = hooks.floorAxes();
    const way = [right[0] * dx - ahead[0] * dy, right[1] * dx - ahead[1] * dy];
    const length = Math.hypot(way[0], way[1]) || 1;
    return [way[0] / length, way[1] / length];
  }

  function showMark(at, kind) {
    mark.hidden = false;
    mark.className = `tap-mark ${kind}`;
    mark.style.transform = `translate(${at[0]}px, ${at[1]}px) translate(-50%, -50%)`;
    markAt = hooks.now();
  }

  const signal = (kind, detail) => hooks.signal?.(kind, detail);

  function handle(events) {
    const orders = hooks.orders();
    const world = hooks.world();
    for (const event of events) {
      if (event.type === 'stick') {
        if (stickId === null) stickId = event.id;
        if (stickId !== event.id) continue;
        orders.stick = event.amount > 0 ? { dir: floorWay(event.dx, event.dy), amount: event.amount } : null;
        showStick(event);
        markUsed('move');
        signal('move', event.amount);
      } else if (event.type === 'look') {
        hooks.look?.(event.dx * TOUCH.lookYaw, event.dy * TOUCH.lookPitch);
        markUsed('look');
        signal('look', Math.abs(event.dx * TOUCH.lookYaw) + Math.abs(event.dy * TOUCH.lookPitch));
      } else if (event.type === 'zoom') {
        hooks.zoom?.(event.ratio);
        signal('zoom', event.ratio);
      } else if (event.type === 'stickEnd') {
        if (stickId !== event.id) continue;
        stickId = null;
        orders.stick = null;
        stick.hidden = true;
      } else if (event.type === 'tap') {
        // Always an attack, at once: the move whose place on the pad the tap is nearest.
        const [x, y] = padCoordinates(event.at[0], event.at[1]);
        const chosen = attackAt(hooks.player().style, x, y);
        if (!chosen) continue;
        orders.requests.push({ move: chosen.move, zone: chosen.zone, strength: event.double ? 'combo' : 'quick', at: world.time });
        showMark(event.at, 'strike');
        flashLabel(chosen.move);
        lastTapAt = { move: chosen.move, x, zone: chosen.zone, time: hooks.now() };
        signal(event.double ? 'combo' : 'tap', chosen.move);
        const target = orders.lock ?? opponentFor(world, hooks.player())?.id;
        if (target !== undefined && target !== null) awake.set(target, hooks.now());
      } else if (event.type === 'hold') {
        const aim = aimAt(event.at[0], event.at[1]);
        (orders.holds ??= []).push(aim);
        showMark(event.at, 'press');
        navigator.vibrate?.(12);
        wakeNear(aim);
        signal('hold');
      }
    }
  }

  /** The fight's part of the surface: above the footer. */
  function playArea() {
    const box = surface.getBoundingClientRect();
    const footer = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--controls-height')) || 0;
    return { left: box.left, top: box.top, width: box.width, height: Math.max(1, box.height - footer) };
  }

  /** A point on the screen as a place on the pad: x right and y up, −1 to 1 about the middle of the fight (above the footer). */
  function padCoordinates(px, py) {
    const { left, top, width: full, height } = playArea();
    const width = Math.max(1, full - TOUCH.padRight);
    return [((px - left) / width) * 2 - 1, 1 - ((py - top) / height) * 2];
  }

  /** A half of the screen has been used: once both have, the hints fade. */
  function markUsed(zone) {
    if (used[zone]) return;
    used[zone] = true;
    hints.querySelector(`.${zone}`).classList.add('used');
    if (used.look && used.move) used.at = hooks.now();
  }

  /** The hints in the words of the hand in use: a finger, or a mouse and keys. */
  function wordHints(mouse) {
    hints.querySelector('.look').textContent = mouse ? 'Drag here or right-drag · look' : 'Drag here · look';
    hints.querySelector('.move').textContent = mouse ? 'Drag here or WASD · move' : 'Drag here · move';
  }

  /** The pad's labels for his style, placed as the pad places its moves. */
  function drawPad(styleKey) {
    padStyle = styleKey;
    pad.replaceChildren(...attackLayout(styleKey).map((place) => {
      const label = uiElement('span', 'pad-move', moveName(place.move).name);
      label.dataset.move = place.move;
      label.style.left = `${50 + place.x * 50}%`;
      label.style.top = `${50 - place.y * 50}%`;
      return label;
    }));
  }

  function flashLabel(move) {
    const label = pad.querySelector(`[data-move="${move}"]`);
    if (!label) return;
    label.classList.remove('flash');
    void label.offsetWidth;
    label.classList.add('flash');
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
    setDevice(press.pointerType === 'mouse' ? 'mouse' : 'touch');
    // The right (or middle) button turns the view wherever it is pressed; it never strikes.
    const at = [press.clientX, press.clientY];
    handle(press.button > 0 ? gestures.down(press.pointerId, at, hooks.now(), 'look') : gestures.down(press.pointerId, at, hooks.now()));
    if (press.button > 0) rightButtons.add(press.pointerId);
  });
  const rightButtons = new Set();
  // The wheel zooms.
  surface.addEventListener('wheel', (wheel) => {
    if (!active) return;
    wheel.preventDefault();
    hooks.zoom?.(Math.exp(-wheel.deltaY * 0.001));
  }, { passive: false });
  surface.addEventListener('pointermove', (move) => {
    if (!touches.has(move.pointerId)) return;
    handle(gestures.move(move.pointerId, [move.clientX, move.clientY]));
  });
  surface.addEventListener('pointerup', (up) => {
    if (!touches.has(up.pointerId)) return;
    touches.delete(up.pointerId);
    const events = gestures.up(up.pointerId, [up.clientX, up.clientY], hooks.now());
    // A right-button click is not a tap: only its drag counts.
    const right = rightButtons.delete(up.pointerId);
    handle(right ? events.filter((event) => event.type !== 'tap' && event.type !== 'hold') : events);
  });
  const drop = (cancel) => {
    if (!touches.has(cancel.pointerId)) return;
    touches.delete(cancel.pointerId);
    handle(gestures.cancel(cancel.pointerId));
  };
  surface.addEventListener('pointercancel', drop);
  surface.addEventListener('lostpointercapture', drop);
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
    if (!cancelled && hooks.now() - guardDown.at < TOUCH.guardTap) {
      (orders.evasions ??= []).push(1);
      signal('evade');
    }
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
    signal('action', lastAction);
  });
  // Lock: on the man he is on (the nearest), or off.
  lock.addEventListener('pointerdown', (press) => {
    press.preventDefault();
    if (!active) return;
    toggleLock();
    navigator.vibrate?.(15);
  });

  /** Lock on the man he is on (the nearest), or let go. */
  function toggleLock() {
    const orders = hooks.orders();
    if (orders.lock !== null) {
      orders.lock = null;
      signal('unlock');
      return;
    }
    const target = opponentFor(hooks.world(), hooks.player());
    if (!target) return;
    orders.lock = target.id;
    awake.set(target.id, hooks.now());
    signal('lock', target.id);
  }

  let device = null;
  /** The hand in use, for the words on screen: 'touch' or 'mouse' (a key pressed counts as the mouse). */
  function setDevice(kind) {
    if (kind === device) return;
    device = kind;
    root.dataset.device = kind;
    wordHints(kind === 'mouse');
    hooks.onDevice?.(kind);
  }
  setDevice(globalThis.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'mouse');

  /** The attack he has just made: its name, its height and side, and (once known) how it went. */
  function callStrike(world, me, now) {
    const punch = me.punch;
    if (punch && punch !== strike?.punch && punch.spec?.kind === 'strike') {
      // Its side on the screen: the tap that asked for it, or the move's own place on the pad.
      const tapped = lastTapAt && lastTapAt.move === punch.type && now - lastTapAt.time < 1 ? lastTapAt : null;
      const place = tapped ?? attackLayout(me.style).find((entry) => entry.move === punch.type);
      const where = attackWhere(punch.zone, place?.x ?? 0);
      const { name, gloss } = moveName(punch.type);
      strike = { punch, since: world.time - (punch.age ?? 0) - 1 / 60, start: now, outcome: null, outcomeAt: null };
      call.hidden = false;
      call.dataset.outcome = '';
      call.querySelector('.where').textContent = `${where.arrow} ${where.height}${where.side === 'centre' ? '' : ` · ${where.side}`}`;
      call.querySelector('.name').textContent = name;
      call.querySelector('.gloss').textContent = gloss;
      call.querySelector('.outcome').textContent = '';
      call.classList.remove('show');
      void call.offsetWidth;
      call.classList.add('show');
      signal('strike', punch.type);
    }
    if (!strike) return;
    if (!strike.outcome) {
      const outcome = strikeOutcome(world.events, me.id, strike.since, me.punch !== strike.punch);
      if (outcome) {
        strike.outcome = outcome;
        strike.outcomeAt = now;
        call.dataset.outcome = outcome;
        call.querySelector('.outcome').textContent = OUTCOME_WORDS[outcome];
        signal('outcome', outcome);
      }
    }
    const until = Math.max(strike.start + TOUCH.callSeconds, (strike.outcomeAt ?? strike.start) + TOUCH.callAfterOutcome);
    if (now > until && (strike.outcome || me.punch !== strike.punch)) {
      call.classList.remove('show');
      if (now > until + 0.3) {
        call.hidden = true;
        strike = null;
      }
    }
  }

  /** The man's own attack, small over his head as it begins. */
  function callIncoming(target, now) {
    const punch = target.punch;
    const label = marker.querySelector('.incoming');
    if (punch && punch !== incoming?.punch && punch.spec?.kind === 'strike') {
      incoming = { punch, start: now };
      label.textContent = moveName(punch.type).name;
      label.classList.add('show');
    }
    if (incoming && now - incoming.start > TOUCH.incomingSeconds) {
      label.classList.remove('show');
      incoming = null;
    }
  }

  /** Anything aimed near a man wakes his marker. */
  function wakeNear(at) {
    for (const other of hooks.world()?.fighters ?? []) if (Math.hypot(other.x[P.pelvis * 3] - at[0], other.x[P.pelvis * 3 + 2] - at[2]) < 1.2) awake.set(other.id, hooks.now());
  }

  /** Each frame: held touches age, the buttons and the HUD follow the fight. */
  function update() {
    if (!active) return;
    const now = hooks.now();
    handle(gestures.tick(now));
    if (now - markAt > TOUCH.markSeconds) mark.hidden = true;
    hints.classList.toggle('gone', used.at !== null && now - used.at > TOUCH.hintFade);
    const world = hooks.world();
    const me = hooks.player();
    const orders = hooks.orders();
    if (!world || !me) return;
    if (me.style !== padStyle) drawPad(me.style);
    callStrike(world, me, now);
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
    lock.classList.toggle('on', Boolean(locked));
    lock.querySelector('.label').textContent = locked ? 'Unlock' : 'Lock';
    lock.querySelector('.who').textContent = locked ? firstNameOf(locked) : '';
    // The player's own status, compact, low down.
    status.querySelector('.name').textContent = firstNameOf(me);
    status.querySelector('.tag').textContent = me.state === 'down' ? 'DOWN' : me.pin ? 'HOLDING' : me.dazed > 0 ? 'DAZED' : me.stagger > 0 ? 'REELING' : me.reloading ? 'LOADING' : '';
    status.querySelector('.health i').style.width = `${Math.round((1 - hurtShare(me)) * 100)}%`;
    status.querySelector('.stamina i').style.width = `${Math.round(me.stamina * 100)}%`;
    // His man: the one locked, or the one he is on; a marker over his head.
    const target = locked ?? opponentFor(world, me);
    for (const event of world.events.slice(-6)) if (event.time > world.time - 0.1 && event.defender !== undefined) awake.set(event.defender, now);
    if (!target) {
      marker.hidden = true;
      return;
    }
    const at = hooks.project([target.x[P.head * 3], target.x[P.head * 3 + 1] + 0.42, target.x[P.head * 3 + 2]]);
    marker.hidden = !at[2];
    if (!at[2]) return;
    marker.style.transform = `translate(${at[0]}px, ${at[1]}px) translate(-50%, -100%)`;
    callIncoming(target, now);
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
    mark.hidden = true;
    guard.classList.remove('on');
    awake.clear();
    padStyle = null;
    strike = null;
    incoming = null;
    call.hidden = true;
    lastTapAt = null;
    rightButtons.clear();
  }

  return { update, setActive, reset, toggleLock, setDevice, get device() { return device; } };
}

/** Keep a pointer's events coming here even off the element (a pointer the browser no longer knows is let be). */
function capture(element, pointerId) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Already lifted, or not a live pointer: its events still come while it is over the element.
  }
}

/** A man's first name; a rank or title ("Sir Edric", "Sgt. Cole") gives way to the name after it. */
const firstNameOf = (fighter) => {
  const words = fighter.body.inputs.name.split(' ');
  return (/\.$/.test(words[0]) || ['Sir', 'Officer'].includes(words[0])) && words[1] ? words[1] : words[0];
};

/** The nearest approach of a line of sight (origin + t·dir, t ≥ 0) to a segment a–b: how far, and the point on the segment. */
function rayToSegment(origin, dir, a, b) {
  const u = dir;
  const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w = [origin[0] - a[0], origin[1] - a[1], origin[2] - a[2]];
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const uu = dot(u, u);
  const uv = dot(u, v);
  const vv = dot(v, v) || 1e-9;
  const uw = dot(u, w);
  const vw = dot(v, w);
  const denominator = uu * vv - uv * uv;
  let s = denominator > 1e-9 ? (uv * vw - vv * uw) / denominator : 0;
  s = Math.max(0, s);
  const t = Math.max(0, Math.min(1, (vw + s * uv) / vv));
  const onRay = [origin[0] + u[0] * s, origin[1] + u[1] * s, origin[2] + u[2] * s];
  const onSegment = [a[0] + v[0] * t, a[1] + v[1] * t, a[2] + v[2] * t];
  return { distance: Math.hypot(onRay[0] - onSegment[0], onRay[1] - onSegment[1], onRay[2] - onSegment[2]), onSegment };
}
