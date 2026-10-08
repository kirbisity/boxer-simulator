// Touches on the fight, read as the player's gestures. Each touch starts
// undecided; moved past `dragFrom` it is a drag for good (a floating stick,
// centred where it began) and can never become a tap or a long press. Kept
// still: a tap if let go quickly, a press-and-release (heavy) if held, and on
// a man a long press (lock). No DOM: positions in pixels, times in seconds.

export const GESTURE = {
  // px a touch may wander and still be a tap or a press.
  dragFrom: 14,
  // s: let go before this, a tap; after, a press-and-release.
  heavyFrom: 0.28,
  // s held still on a man: a long press (the lock), at once, without waiting for the release.
  longPressFrom: 0.5,
  // s: a second tap on the same line this soon after the first is a double tap.
  doubleTapWithin: 0.32,
  // px from the stick's centre to its full throw.
  stickRadius: 70,
};

/**
 * One recogniser for the surface. Feed it the touches' events; each call
 * returns what the gesture now means:
 *   { type: 'stick', id, origin, at, dx, dy, amount }   (a drag, while it moves)
 *   { type: 'stickEnd', id }
 *   { type: 'tap', id, at, region, double }             (released quickly)
 *   { type: 'charge', id, at, region, share }            (held still, a heavy one building)
 *   { type: 'heavy', id, at, region }                    (press-and-release)
 *   { type: 'longPress', id, at, region }                (held still on a man)
 * `region` is whatever the caller classified the touch's start as (a line, a man, open floor).
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
    /** A touch begins at `at` (px), in `region`. */
    down(id, at, time, region) {
      touches.set(id, { id, origin: at, at, start: time, region, state: 'pending' });
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
    /** Time passes with it held: a long press on a man fires now; elsewhere, the heavy one builds. */
    tick(time) {
      const out = [];
      for (const touch of touches.values()) {
        if (touch.state !== 'pending') continue;
        const held = time - touch.start;
        if (touch.region?.man !== undefined && held >= spec.longPressFrom) {
          touch.state = 'done';
          out.push({ type: 'longPress', id: touch.id, at: touch.at, region: touch.region });
        } else if (touch.region?.man === undefined && held >= spec.heavyFrom) {
          out.push({ type: 'charge', id: touch.id, at: touch.at, region: touch.region, share: Math.min(1, (held - spec.heavyFrom) / spec.heavyFrom) });
        }
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
      const held = time - touch.start;
      if (held >= spec.heavyFrom) {
        // A man held for less than the long press: no lock, and no heavy blow either (it was meant for him).
        if (touch.region?.man !== undefined) return [];
        return [{ type: 'heavy', id, at: touch.origin, region: touch.region }];
      }
      const line = touch.region?.line ?? null;
      const double = Boolean(lastTap && line && lastTap.line === line && time - lastTap.time <= spec.doubleTapWithin);
      lastTap = double ? null : { line, time };
      return [{ type: 'tap', id, at: touch.origin, region: touch.region, double }];
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
