// How a deflect looks (physics/deflect.js): the sparks thrown off the meeting, its flash, and, when the man played deflects,
// a cue at the screen's edge. Five looks to choose among (DEFLECT_LOOKS; `deflectLook.chosen`, boxer.deflectLook(name)):
// each differs in kind, not degree. All throw their sparks toward the man deflected (`toward`: the way the blow is turned
// back), orange from the first.
//  - forge: a dense orange cone of short hot sparks, a big flash; the screen's four edges glow gold once.
//  - shower: fewer, long, heavy streaks that fall in arcs (a grinding wheel's), a smaller flash; a gold bar sweeps the top.
//  - star: a four-rayed flare at the meeting over a loose spray; gold brackets flash in the screen's corners.
//  - comet: a tight jet of fast sparks straight back at him, a hot core; a gold shine down from the top edge, with the word.
//  - ember: a slow bloom of embers that hangs a moment; the whole screen is washed warm for an instant, edges gold.

import { battleFxSpark, battleFxStar } from './battlefx.js';
import { spawnSparks } from './weaponview.js';

export const DEFLECT_LOOKS = {
  forge: { sparks: { count: 80, speed: [3, 9], life: [0.2, 0.6], width: [0.007, 0.012], cone: 0.9, tint: 0.7, gravity: 0.8 }, flash: 0.42, cue: 'edges' },
  shower: { sparks: { count: 36, speed: [2.5, 6], life: [0.5, 1.2], width: [0.009, 0.015], cone: 0.7, tint: 0.85, gravity: 1.6 }, flash: 0.24, cue: 'sweep' },
  star: { sparks: { count: 44, speed: [2, 6], life: [0.25, 0.7], width: [0.006, 0.01], cone: 0.5, tint: 0.6, gravity: 1 }, flash: 0.2, star: { size: 0.24, length: 0.55, rays: 4, colour: [2.6, 1.6, 0.6], seconds: 0.14 }, cue: 'corners' },
  comet: { sparks: { count: 60, speed: [6, 13], life: [0.15, 0.45], width: [0.006, 0.011], cone: 3, tint: 0.65, gravity: 0.5 }, flash: 0.32, cue: 'top' },
  ember: { sparks: { count: 70, speed: [0.8, 3], life: [0.6, 1.4], width: [0.01, 0.018], cone: 0.4, tint: 1, gravity: 0.15 }, flash: 0.3, cue: 'wash' },
};

/** The look in use (one of DEFLECT_LOOKS' keys). */
export const deflectLook = { chosen: 'forge' };

/** A deflect's sparks and flash at `at`, thrown `toward` (a direction), in the look chosen (or `look`). */
export function deflectBurst(view, at, toward, look = deflectLook.chosen) {
  const spec = DEFLECT_LOOKS[look] ?? DEFLECT_LOOKS.forge;
  spawnSparks(view, at, spec.sparks.count, { flash: false, along: toward, ...spec.sparks });
  // (An orange flash, held a little longer than a clash's.)
  battleFxSpark(view, at, spec.flash, [2.4, 1.35, 0.4], 0.08);
  if (spec.star) battleFxStar(view, at, spec.star);
}

/** The screen's cue that the man played has deflected (a class on `element` that its CSS plays once), in the look chosen. */
export function deflectCue(element, look = deflectLook.chosen) {
  if (!element) return;
  const spec = DEFLECT_LOOKS[look] ?? DEFLECT_LOOKS.forge;
  element.dataset.cue = spec.cue;
  element.classList.remove('play');
  // (Read so the animation starts again on a deflect that follows another.)
  void element.offsetWidth;
  element.classList.add('play');
}
