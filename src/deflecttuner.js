// The sandbox's deflect feel panel (dialtuner.js): sliders on the deflect's key dials (WORLD.deflect, physics/deflect.js), felt at
// once, kept in this browser, copied out to be made the defaults.

import { createDialTuner } from './dialtuner.js';
import { WORLD } from './physics/config.js';

/** The dials offered: a path into WORLD.deflect, its range, and what it does (the panel's words). */
export const DEFLECT_DIALS = [
  { path: 'window', min: 0.1, max: 0.8, step: 0.01, label: 'Deflect window (s)', hint: 'How long after the press a blow is deflected, for a katana (heavier weapons less, lighter more). More: easier.' },
  { path: 'aiShare', min: 0, max: 1, step: 0.05, label: 'AI window (share)', hint: "The AI's window as a share of yours. Less: the AI deflects your blows less." },
  { path: 'arc', min: 0, max: 3.14, step: 0.05, label: 'Assist arc (rad)', hint: 'A blow from within this angle of where you face is deflected in your window even before your blade gets there. 0: your blade must meet it.' },
  { path: 'reel.1', min: 0.1, max: 2, step: 0.05, label: 'Attacker reel, most (s)', hint: 'How long the man you deflect reels after his hardest blow (a light one less).' },
  { path: 'holdFor', min: 1, max: 8, step: 0.25, label: 'Held guard gives out (s)', hint: 'Held past its window, the guard weakens and drops at this.' },
];

const deflectTuner = createDialTuner(WORLD.deflect, DEFLECT_DIALS, 'gladiator.deflectDials');

/** The panel, built into `host` (a DOM element); the dials kept in this browser are applied first. */
export const mountDeflectTuner = (host) => deflectTuner.mount(host, 'Changes apply at once and are kept in this browser. Copy the values and send them to have them made the default.');
