// What of a crowd is drawn, and how: pure decisions, no drawing. The renderer
// (render.js `selectCrowdDraw`) asks these each frame for every baked fighter.

import { CROWD_VIEW } from './crowdview.js';
import { P } from './body.js';

/** The switch for before/after comparison (`boxer.lod(false)`): off, a crowd is drawn as it was, every man in full. */
export const crowdLod = { enabled: true };

/**
 * The men who are never simplified, culled or stripped of their shadow, in
 * a crowd: whoever the viewer is playing or watching closely.
 *   - the man he plays, the man he has locked on, and the man the game
 *     calls his opponent (`opponentFor`);
 *   - every man within `CROWD_VIEW.protectRadius` of the player (they are
 *     the ones he is fighting, whichever side they are on);
 *   - the man the watching camera follows (`watchCam.focus`).
 * Anyone near the camera is kept in full by the distance rules themselves.
 * @returns {Set<number>} fighter ids
 */
export function protectedMen({ player = null, lock = null, opponent = null, focus = null, fighters = [] } = {}) {
  const safe = new Set();
  for (const man of [player, lock, opponent, focus]) if (man) safe.add(man.id);
  if (player) {
    const around = CROWD_VIEW.protectRadius * CROWD_VIEW.protectRadius;
    const [x, y, z] = [P.pelvis * 3, P.pelvis * 3 + 1, P.pelvis * 3 + 2].map((at) => player.x[at]);
    for (const other of fighters) {
      const dx = other.x[P.pelvis * 3] - x;
      const dy = other.x[P.pelvis * 3 + 1] - y;
      const dz = other.x[P.pelvis * 3 + 2] - z;
      if (dx * dx + dy * dy + dz * dz < around) safe.add(other.id);
    }
  }
  return safe;
}

/**
 * Whether a distance is past a limit, with a margin so a man standing on
 * the line does not flicker: once past, he stays past until he is `margin`
 * inside it.
 */
export function pastLimit(distance, wasPast, limit, margin) {
  return distance > (wasPast ? limit - margin : limit);
}

/**
 * How one crowd man is drawn this frame, written into `draw`
 * ({ culled, far, shadow }, kept between frames for the hysteresis).
 * `distance`: pelvis to camera (m); `fallen`: down or out (he is drawn
 * simpler sooner); `safe`: in the protected set; `inView`: his bounding
 * sphere meets the camera's frustum; `inShadow`: it meets the shadow
 * camera's.
 */
export function chooseDraw(draw, { distance, fallen, safe, inView, inShadow }) {
  const config = CROWD_VIEW;
  draw.culled = !safe && !inView;
  draw.far = !safe && pastLimit(distance, draw.far, fallen ? config.fallenLodDistance : config.lodDistance, config.lodMargin);
  const shadowLimit = fallen ? config.fallenShadowDistance : config.shadowDistance;
  draw.shadow = safe || (inShadow && !pastLimit(distance, !draw.shadow, shadowLimit, config.lodMargin));
  return draw;
}
