// Touches on the fight, read as the player's gestures. Each touch starts
// undecided; moved past `dragFrom` it is a drag for good and can never
// become a tap or a press. What a drag does is decided by where it began:
// in the top part of the screen it turns the view (two such drags at once
// pinch to zoom), in the bottom part it is a floating stick, centred where
// it began. Kept still: a tap if let go quickly (two quick taps near each
// other, a double tap), a press if held past `holdFrom` (it acts the moment
// it is reached), wherever it is. No DOM: positions in pixels, times in seconds.

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
  // The share of the surface's height, from its top, where a drag looks about; below it, a drag moves.
  lookShare: 0.5,
};

/** Which part of the surface a point is in: 'look' (the top `share` of it) or 'move'. */
export function screenZone(y, top, height, share = GESTURE.lookShare) {
  return y - top < height * share ? 'look' : 'move';
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
 * 'move'); without it every drag is a stick.
 */
export function createRecognizer(spec = GESTURE, { zoneOf = () => 'move' } = {}) {
  const touches = new Map();
  let lastTap = null;
  const lookers = () => [...touches.values()].filter((touch) => touch.state === 'drag' && touch.zone === 'look');
  const stickOf = (touch, at) => {
    const dx = at[0] - touch.origin[0];
    const dy = at[1] - touch.origin[1];
    const length = Math.hypot(dx, dy);
    const amount = Math.min(1, length / spec.stickRadius);
    return { type: 'stick', id: touch.id, origin: touch.origin, at, dx, dy, amount };
  };
  return {
    /** A touch begins at `at` (px); `zone` overrides where it began (a mouse's right button always looks). */
    down(id, at, time, zone = zoneOf(at)) {
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
