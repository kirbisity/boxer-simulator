// Adaptive resolution: in a big battle that cannot keep up, the renderer's
// pixel ratio steps down (2 -> 1.5 -> 1.25) and, once the frames come easily
// again, back up. The canvas keeps its size on the page; only the pixels it is
// drawn with change. A duel (a few men) is never touched: it is drawn as
// ever. The choices are plain functions of the frame times, so they run in
// Node (test/adaptres.test.js); `createAdaptiveResolution` applies them to a
// view (render.js createScene) from main.js's frame.

/* global THREE */

export const ADAPTIVE_RESOLUTION = {
  // A fight of fewer fighters than this is never adapted (and is put back to full at once if one shrinks to it): a 1v1 is drawn exactly as ever.
  fewestFighters: 9,
  // Each step's share of the full pixel ratio. Fill cost is the pixel count, so 0.75 of the ratio is 0.56 of the pixels, and 0.625 is 0.39.
  steps: [1, 0.75, 0.625],
  // Never drawn below this ratio, whatever the steps say: under 1 the picture turns to mush.
  floor: 1,
  // ms between frames above which the game is losing frames (a 60 Hz screen asks 16.7; 21 is under 48 fps).
  slowMs: 21,
  // ms at or under which the screen is being kept up with (16.7 ms + a little for the clock's jitter).
  fastMs: 17.6,
  // Weight of each new frame in the smoothed time: a hitch (a garbage collection, a shader compiling) must not count as a slow second.
  smoothing: 0.08,
  // s the smoothed time must stay slow before one step down (long enough that a hitch is not it, short enough that a battle's first seconds are not a slideshow).
  slowSeconds: 1.2,
  // s it must stay fast before one step up is tried. A screen held at 60 Hz looks the same at every step that keeps up, so this is the only way to find headroom: try, and go back if it was not there.
  fastSeconds: 6,
  // A frame is slow for want of pixels only if the page's own work (simulation, views, the draw calls) fills less than this share of it: the rest was spent waiting for the graphics card.
  // Past it the page is held up by the processor, which fewer pixels would not help (and the picture would be spoilt for nothing).
  gpuWaitShare: 0.8,
  // A step up that is followed by a step down within this many seconds failed: the wait before the next try is multiplied by `retryFactor`, up to `fastSecondsMost`.
  failSeconds: 5,
  retryFactor: 2,
  fastSecondsMost: 60,
  // Frames ignored after a change (the canvas is reallocated: that frame is slow, and a smoothed time from before means nothing now).
  settleFrames: 8,
  // ms: a frame this long was a stall (the tab was in the background), not the cost of drawing: ignored.
  stallMs: 250,
};

/** The pixel ratios the steps give from a `full` ratio: descending, none under the floor, each once. */
export function ratioSteps(full, config = ADAPTIVE_RESOLUTION) {
  const ratios = config.steps.map((share) => Math.max(config.floor, Math.round(full * share * 1000) / 1000)).map((ratio) => Math.min(full, ratio));
  return [...new Set(ratios)].sort((a, b) => b - a);
}

export function newAdaptiveState() {
  return { level: 0, smoothed: null, work: null, slowFor: 0, fastFor: 0, sinceStep: Infinity, lastStep: 0, fastNeeded: null, settle: 0 };
}

/**
 * One frame. `state` is changed in place; returns the level wanted now (0 =
 * full). `ms` is the time since the last frame, `work` the page's own time in the last one (ms, null if unknown), `levels` how many ratios
 * there are (`ratioSteps(...).length`), `fighters` how many men are fighting.
 */
export function stepAdaptive(state, { ms, fighters, levels, work = null }, config = ADAPTIVE_RESOLUTION) {
  state.fastNeeded ??= config.fastSeconds;
  if (fighters < config.fewestFighters) {
    Object.assign(state, newAdaptiveState(), { fastNeeded: config.fastSeconds });
    return 0;
  }
  state.level = Math.min(state.level, levels - 1);
  if (ms > config.stallMs) return state.level;
  const dt = ms / 1000;
  state.sinceStep += dt;
  if (state.settle > 0) {
    state.settle -= 1;
    return state.level;
  }
  state.smoothed = state.smoothed === null ? ms : state.smoothed + (ms - state.smoothed) * config.smoothing;
  state.work = work === null ? null : state.work === null ? work : state.work + (work - state.work) * config.smoothing;
  const waiting = state.work === null || state.work < config.gpuWaitShare * state.smoothed;
  if (state.smoothed > config.slowMs && waiting) {
    state.slowFor += dt;
    state.fastFor = 0;
  } else if (state.smoothed <= config.fastMs) {
    state.fastFor += dt;
    state.slowFor = 0;
  } else {
    state.slowFor = 0;
    state.fastFor = 0;
  }
  if (state.slowFor >= config.slowSeconds && state.level < levels - 1) {
    // Down again soon after going up: the headroom was not there, so wait longer before the next try.
    if (state.lastStep < 0 && state.sinceStep < config.failSeconds) state.fastNeeded = Math.min(config.fastSecondsMost, state.fastNeeded * config.retryFactor);
    moved(state, 1, config);
  } else if (state.fastFor >= state.fastNeeded && state.level > 0) {
    moved(state, -1, config);
  }
  return state.level;
}

function moved(state, direction, config) {
  state.level += direction;
  state.lastStep = direction;
  state.sinceStep = 0;
  state.slowFor = 0;
  state.fastFor = 0;
  state.smoothed = null;
  state.settle = config.settleFrames;
}

/**
 * The controller for a view: `frame(view, ms, fighters)` once a frame sets the
 * renderer's pixel ratio; `set(false)` puts it back to full and keeps it there.
 * A ratio someone else set (a look's own) is taken as the new full one.
 */
export function createAdaptiveResolution(config = ADAPTIVE_RESOLUTION) {
  const state = newAdaptiveState();
  let enabled = true;
  let full = null;
  let applied = null;
  let work = null;

  function apply(view, ratio) {
    const renderer = view.renderer;
    if (renderer.getPixelRatio() === ratio) return;
    renderer.setPixelRatio(ratio);
    applied = ratio;
    // A look that draws to its own targets (a composer) sizes them by the ratio.
    const size = renderer.getSize(new THREE.Vector2());
    view.look?.resize?.(view, size.x, size.y);
  }

  const api = {
    config,
    state,
    get enabled() {
      return enabled;
    },
    /** On or off (off: full ratio now, and left alone). */
    set(on, view) {
      enabled = !!on;
      if (!enabled && view && full !== null) {
        apply(view, full);
        Object.assign(state, newAdaptiveState());
      }
      return enabled;
    },
    /** What it is doing now: { enabled, level, ratio, full, smoothedMs }. */
    info(view) {
      return { enabled, level: state.level, ratio: view.renderer.getPixelRatio(), full, smoothedMs: state.smoothed === null ? null : Math.round(state.smoothed * 10) / 10 };
    },
    /** The page's own work in the frame just done (ms), for the next `frame` to tell waiting for the graphics card from being held up by the processor. */
    worked(ms) {
      work = ms;
    },
    frame(view, ms, fighters) {
      const current = view.renderer.getPixelRatio();
      // Anything but our own change is a new full ratio (a look, the page's zoom).
      if (full === null || (applied !== null ? current !== applied : current !== full)) {
        full = current;
        applied = null;
        Object.assign(state, newAdaptiveState());
      }
      if (!enabled) return;
      const ratios = ratioSteps(full, config);
      const level = stepAdaptive(state, { ms, fighters, levels: ratios.length, work }, config);
      const ratio = ratios[level];
      if (ratio !== current) apply(view, ratio);
      if (level === 0) applied = null;
    },
  };
  return api;
}
