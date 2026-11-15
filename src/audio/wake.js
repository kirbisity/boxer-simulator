// The context kept awake: put to sleep when the page is hidden, and woken when it comes back, whatever the browser does in between.
//
// A browser may refuse to resume a context without a gesture (iOS Safari after the screen was off or the app left), may leave it
// 'interrupted' (iOS: a call, Siri, another app's sound), or may report it 'running' while its clock stands still and nothing is
// heard. So: a resume is tried as soon as the page is back; if the context is not running a little later, the next tap, click or key
// resumes it (the first one after a return in any case, with a silent sample: what wakes iOS's output); if even that fails, or the
// clock is found standing still, the next gesture builds a new context.
//
// Pure (no DOM): the engine gives it the context and the means; test/audiowake.test.js drives it with a pretend context.

/** The waking's numbers (s). */
export const WAKE = {
  // How long after a resume the context is looked at again to see whether it took (a refused one stays as it was).
  settle: 0.6,
  // How long a context said to be running may keep its clock still, the page shown, before it is taken as dead.
  stall: 1.5,
};

/**
 * `context()`: the context now, or null before the first gesture. `create()`: make it (the first gesture). `rebuild()`: close a dead one
 * and make another, inside a gesture. `prime(ctx)`: play a silent sample (inside a gesture). `wall()`: seconds of real time.
 * `later(fn, seconds)`: run `fn` after a while. Returns the handlers: `gesture()`, `hide()`, `show()`, `stateChanged(ctx)` and `watch()`
 * (once a frame), and `status()` (tests).
 */
export function createWake({ context, create, rebuild, prime, wall, later }) {
  let away = false;
  // A resume refused without a gesture: the next gesture resumes.
  let refused = false;
  // A gesture's resume did not take, or the clock stands still: the next gesture builds a new context.
  let dead = false;
  // The page came back: its first gesture plays the silent sample and resumes even a context said to be running (iOS may say so and
  // play nothing).
  let returned = false;
  let clock = { time: -1, at: 0 };

  function attempt(ctx, fromGesture) {
    ctx.resume().catch(() => {});
    later(() => {
      if (ctx !== context() || away) return;
      if (ctx.state === 'running') refused = false;
      else if (fromGesture) dead = true;
      else refused = true;
    }, WAKE.settle);
  }

  return {
    gesture() {
      const ctx = context();
      if (!ctx) {
        create();
        return;
      }
      if (away) return;
      if (dead) {
        dead = false;
        refused = false;
        returned = false;
        clock = { time: -1, at: wall() };
        rebuild();
        return;
      }
      if (ctx.state !== 'running' || refused || returned) {
        returned = false;
        prime(ctx);
        attempt(ctx, true);
      }
    },
    hide() {
      away = true;
      context()?.suspend().catch(() => {});
    },
    show() {
      away = false;
      const ctx = context();
      if (!ctx) return;
      clock = { time: -1, at: wall() };
      returned = true;
      if (ctx.state !== 'running') attempt(ctx, false);
    },
    /** The context's own change of state (onstatechange): one interrupted or suspended by the browser while shown is resumed. */
    stateChanged(ctx) {
      if (ctx !== context() || away) return;
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') attempt(ctx, false);
    },
    /** Once a frame: a running context's clock watched; one that has stood still too long is dead, one that moves again is well. */
    watch() {
      const ctx = context();
      if (!ctx || away || ctx.state !== 'running') return;
      const now = wall();
      if (ctx.currentTime !== clock.time) {
        clock = { time: ctx.currentTime, at: now };
        dead = false;
      } else if (now - clock.at > WAKE.stall) dead = true;
    },
    status: () => ({ away, refused, dead }),
  };
}
