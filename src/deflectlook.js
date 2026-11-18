// How a deflect looks (physics/deflect.js): a tight jet of fast orange sparks thrown straight back at the man deflected (the
// way his blow is turned), over an orange flash at the meeting; and, when the man played deflects, a gold shine down from the
// top of the screen with the word (DEFLECT_LOOK.cue; its CSS is fightui.css .deflect-cue).

import { battleFxSpark } from './battlefx.js';
import { spawnSparks } from './weaponview.js';

// `sparks`: weaponview.js spawnSparks (`cone` 3: a jet, not a spray; `tint`: orange from the first); `flash`: its size, colour
// and seconds (an orange flash held a little longer than a clash's).
export const DEFLECT_LOOK = {
  sparks: { count: 60, speed: [6, 13], life: [0.15, 0.45], width: [0.006, 0.011], cone: 3, tint: 0.65, gravity: 0.5 },
  flash: { size: 0.32, colour: [2.4, 1.35, 0.4], seconds: 0.08 },
};

/** A deflect's sparks and flash at `at`, thrown `toward` (a direction: at the man deflected). */
export function deflectBurst(view, at, toward) {
  spawnSparks(view, at, DEFLECT_LOOK.sparks.count, { flash: false, along: toward, ...DEFLECT_LOOK.sparks });
  battleFxSpark(view, at, DEFLECT_LOOK.flash.size, DEFLECT_LOOK.flash.colour, DEFLECT_LOOK.flash.seconds);
}

/** The screen's cue that the man played has deflected: its CSS animation on `element`, played once again. */
export function deflectCue(element) {
  if (!element) return;
  element.classList.remove('play');
  // (Read so the animation starts again on a deflect that follows another.)
  void element.offsetWidth;
  element.classList.add('play');
}
