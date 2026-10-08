// Touches on the fight, read as the player's gestures. Each touch starts
// undecided; moved past `dragFrom` it is a drag for good (a floating stick,
// centred where it began) and can never become a tap or a press. Kept still:
// a tap if let go quickly (two quick taps near each other, a double tap), a
// press if held past `holdFrom` (it acts the moment it is reached). No DOM:
// positions in pixels, times in seconds.

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
};

/**
 * One recogniser for the surface. Feed it the touches' events; each call
 * returns what the gesture now means:
 *   { type: 'stick', id, origin, at, dx, dy, amount }   (a drag, while it moves)
 *   { type: 'stickEnd', id }
 *   { type: 'tap', id, at, double }                      (let go quickly)
 *   { type: 'hold', id, at }                              (held still past holdFrom, once)
 */
export function createRecognizer(spec = GESTURE) {
  const touches = new Map();
  let lastTap = null;
  const stickOf = (touch, at) => {
    const dx = at[0] - touch.origin[0];
    const dy = at[1] - touch.origin[1];
    const length = Math.hypot(dx, dy);
    const amount = Math.min(1, length / spec.stickRadius);
    return { type: 'stick', id: touch.id, origin: touch.origin, at, dx, dy, amount };
  };
  return {
    /** A touch begins at `at` (px). */
    down(id, at, time) {
      touches.set(id, { id, origin: at, at, start: time, state: 'pending' });
      return [];
    },
    /** It moves: past the threshold, a drag for good. */
    move(id, at) {
      const touch = touches.get(id);
      if (!touch) return [];
      touch.at = at;
      if (touch.state === 'pending' && Math.hypot(at[0] - touch.origin[0], at[1] - touch.origin[1]) > spec.dragFrom) touch.state = 'drag';
      return touch.state === 'drag' ? [stickOf(touch, at)] : [];
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
      if (touch.state === 'drag') return [{ type: 'stickEnd', id }];
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
      return touch?.state === 'drag' ? [{ type: 'stickEnd', id }] : [];
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
