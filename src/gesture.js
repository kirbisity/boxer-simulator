// Touches on the fight, read as the player's gestures. Each touch starts
// undecided; moved past `dragFrom` it is a drag for good and can never
// become a tap or a press. What a drag does is decided by where it began:
// on the stick (a fixed pad low at the left, touch.js) it moves him at once,
// the stick's throw measured from the pad's centre; anywhere else it turns the
// view (two such drags at once pinch to zoom). Without a fixed pad, a drag
// begun in the 'move' zone is a floating stick, centred where it began. Kept
// still: a tap if let go quickly (two quick taps near each other, a double
// tap), a press if held past `holdFrom` (it acts the moment it is reached),
// wherever it is. No DOM: positions in pixels, times in seconds.

export const GESTURE = {
  // px a touch may wander and still be a tap or a press.
  dragFrom: 14,
  // s held still: a press, not a tap.
  holdFrom: 0.3,
  // A second tap this soon (s) after the first, and this near it (px), is a double tap.
  doubleTapWithin: 0.32,
  doubleTapNear: 90,
  // px from the stick's centre to its full throw.
  stickRadius: 70,
  // The share of the surface's height, from its top, where a drag looks about; below it, a drag moves (screenZone, a split screen).
  lookShare: 0.5,
  // A touch this far past the fixed stick's ring (its radius times this) still takes the stick.
  stickCatch: 1.3,
};

/** Which part of the surface a point is in: 'look' (the top `share` of it) or 'move'. */
export function screenZone(y, top, height, share = GESTURE.lookShare) {
  return y - top < height * share ? 'look' : 'move';
}

/** Whether a touch at `at` takes the fixed stick (centred at `centre`, its ring `radius` px): 'move', or 'look' (the rest of the screen). */
export function stickZone(at, centre, radius, spec = GESTURE) {
  return Math.hypot(at[0] - centre[0], at[1] - centre[1]) <= radius * spec.stickCatch ? 'move' : 'look';
}

/**
 * One recogniser for the surface. Feed it the touches' events; each call
 * returns what the gesture now means:
 *   { type: 'stick', id, origin, at, dx, dy, amount }   (a drag begun low, while it moves)
 *   { type: 'stickEnd', id }
 *   { type: 'look', id, dx, dy }                         (a drag begun high: px moved since the last)
 *   { type: 'zoom', ratio }                              (two drags begun high: their spread now over before)
 *   { type: 'lookEnd', id }
 *   { type: 'tap', id, at, double }                      (let go quickly)
 *   { type: 'hold', id, at }                              (held still past holdFrom, once)
 * `zoneOf(at)` says which part of the surface a touch began in ('look' or
 * 'move'); without it every drag is a stick. `stickPad()`, if given, is the
 * fixed stick ({ centre, radius } px, or null): a touch begun in 'move' is the
 * stick from the moment it lands (no tap or press there), thrown from that centre.
 */
export function createRecognizer(spec = GESTURE, { zoneOf = () => 'move', stickPad = null } = {}) {
  const touches = new Map();
  let lastTap = null;
  const lookers = () => [...touches.values()].filter((touch) => touch.state === 'drag' && touch.zone === 'look');
  const stickOf = (touch, at) => {
    const dx = at[0] - touch.origin[0];
    const dy = at[1] - touch.origin[1];
    const length = Math.hypot(dx, dy);
    const amount = Math.min(1, length / (touch.radius ?? spec.stickRadius));
    return { type: 'stick', id: touch.id, origin: touch.origin, at, dx, dy, amount };
  };
  return {
    /** A touch begins at `at` (px); `zone` overrides where it began (a mouse's right button always looks). */
    down(id, at, time, zone = zoneOf(at)) {
      const pad = zone === 'move' ? stickPad?.() : null;
      if (pad) {
        // The fixed stick: a drag from the first touch, its throw from the pad's centre.
        const touch = { id, origin: pad.centre, radius: pad.radius, at, start: time, state: 'drag', zone };
        touches.set(id, touch);
        return [stickOf(touch, at)];
      }
      touches.set(id, { id, origin: at, at, start: time, state: 'pending', zone });
      return [];
    },
    /** It moves: past the threshold, a drag for good. */
    move(id, at) {
      const touch = touches.get(id);
      if (!touch) return [];
      const before = touch.at;
      touch.at = at;
      if (touch.state === 'pending' && Math.hypot(at[0] - touch.origin[0], at[1] - touch.origin[1]) > spec.dragFrom) {
        touch.state = 'drag';
        // The view turns from the moment it is a drag: the threshold's worth is not lost.
        touch.last = touch.origin;
      }
      if (touch.state !== 'drag') return [];
      if (touch.zone !== 'look') return [stickOf(touch, at)];
      const others = lookers().filter((other) => other !== touch);
      const last = touch.last ?? before;
      touch.last = at;
      if (others.length) {
        // Two fingers on the view: their spread zooms, and the view holds still.
        const other = others[0];
        const was = Math.hypot(last[0] - other.at[0], last[1] - other.at[1]);
        const now = Math.hypot(at[0] - other.at[0], at[1] - other.at[1]);
        return was > 1 && now > 1 ? [{ type: 'zoom', ratio: now / was }] : [];
      }
      return [{ type: 'look', id, dx: at[0] - last[0], dy: at[1] - last[1] }];
    },
    /** Time passes with it held: still past the threshold, a press, at once. */
    tick(time) {
      const out = [];
      for (const touch of touches.values()) {
        if (touch.state !== 'pending' || time - touch.start < spec.holdFrom) continue;
        touch.state = 'done';
        out.push({ type: 'hold', id: touch.id, at: touch.origin });
      }
      return out;
    },
    /** It lifts. */
    up(id, at, time) {
      const touch = touches.get(id);
      touches.delete(id);
      if (!touch) return [];
      if (touch.state === 'drag') return [{ type: touch.zone === 'look' ? 'lookEnd' : 'stickEnd', id }];
      if (touch.state !== 'pending') return [];
      // Let go before the tick saw it pass the threshold: still a press.
      if (time - touch.start >= spec.holdFrom) return [{ type: 'hold', id, at: touch.origin }];
      const near = lastTap && Math.hypot(touch.origin[0] - lastTap.at[0], touch.origin[1] - lastTap.at[1]) <= spec.doubleTapNear;
      const double = Boolean(near && time - lastTap.time <= spec.doubleTapWithin);
      lastTap = double ? null : { at: touch.origin, time };
      return [{ type: 'tap', id, at: touch.origin, double }];
    },
    /** The browser took it back (a call, a system gesture): it ends as nothing at all. */
    cancel(id) {
      const touch = touches.get(id);
      touches.delete(id);
      return touch?.state === 'drag' ? [{ type: touch.zone === 'look' ? 'lookEnd' : 'stickEnd', id }] : [];
    },
    /** Forget every touch (leaving play, a new bout). */
    reset() {
      touches.clear();
      lastTap = null;
    },
    get count() {
      return touches.size;
    },
    pending(id) {
      return touches.get(id)?.state === 'pending';
    },
  };
}
