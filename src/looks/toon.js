// The toon look: today's rendering, exactly. MeshToon cel steps, ink
// outlines, the painted sky dome, one painted-gradient environment for
// the steel, the hemisphere + spot + sun rig set by render.js, no tone
// mapping, the default (linear) output. Every hook is left out on purpose:
// a hook left out is the identity, so nothing here may add one (the test in
// test/looks.test.js holds it to that).

import { defineLook } from './kit.js';

export const TOON_LOOK = defineLook({
  id: 'toon',
  label: 'Classic cartoon',
  blurb: 'Cel-shaded with ink outlines and a painted sky: the game as it has always looked. Loads nothing extra.',
  style: 'toon',
  outlines: true,
});
