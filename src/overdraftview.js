// The stamina overdraft as the player sees it (physics/overdraft.js is the rule; WORLD.overdraft the numbers): a fade laid over the
// picture, and the stamina bar's second segment. Plain DOM; nothing here knows the physics beyond the pure functions of stamina.
//
// The fade is one fixed element (`#fade`, over the canvas, under every control, never taking a pointer) that styles itself from one
// custom property, `--od` (0 clear to 1 black): a vignette that closes in from the edges (a radial gradient), the picture
// darkening towards its edges and desaturating (a grey layer blended in `saturation` mode), all in the stylesheet (boxer.css).
// No layout is touched: a frame only changes the property, and not while it is clear.

import { WORLD } from './physics/config.js';
import { fadeOf, staminaBar } from './physics/overdraft.js';

/** What the pulse does to the fade at this strength, `beat` 0..1: it dips by up to `pulse` of itself, more the deeper he is. */
export function pulsedFade(strength, beat) {
  return Math.min(1, strength * (1 - WORLD.overdraft.screen.pulse * strength * (1 - beat)));
}

/**
 * Drive the fade element. `update(fighter, dt)`: the man played, or null; `dt` real seconds. Returns { update, strength }.
 * The pulse is a heartbeat that quickens with the depth (`screen.pulseHz` at the start, double at the floor).
 */
export function installFade(element) {
  let phase = 0;
  let shown = -1;
  const api = {
    strength: 0,
    update(fighter, dt) {
      const strength = fighter?.player ? fadeOf(fighter) : 0;
      api.strength = strength;
      if (strength <= 0.002) {
        if (shown !== 0) {
          shown = 0;
          element.style.display = 'none';
          element.style.setProperty('--od', '0');
        }
        phase = 0;
        return;
      }
      phase += dt * WORLD.overdraft.screen.pulseHz * (1 + strength);
      // A heartbeat, not a sine: a sharp swell and a slow fall.
      const beat = Math.max(0, Math.sin(phase * Math.PI * 2)) ** 3;
      const value = pulsedFade(strength, beat);
      if (shown === 0) element.style.display = '';
      if (Math.abs(value - shown) > 0.002) {
        shown = value;
        element.style.setProperty('--od', value.toFixed(3));
      }
    },
  };
  return api;
}

/**
 * Paint a stamina bar (`.bar.stamina`, holding an `<i>`): the green fill for what is left, and, in the overdraft, the bar goes
 * dark red with a red segment growing from the left for how deep he is.
 */
export function paintStamina(bar, stamina) {
  const { fill, debt } = staminaBar(stamina);
  bar.querySelector('i').style.width = `${Math.round(fill * 100)}%`;
  let segment = bar.querySelector('i.debt');
  if (debt > 0 && !segment) segment = bar.appendChild(Object.assign(document.createElement('i'), { className: 'debt' }));
  if (segment) segment.style.width = `${Math.round(debt * 100)}%`;
  bar.classList.toggle('overdrawn', debt > 0);
  if (bar.dataset.title === undefined) bar.dataset.title = bar.title;
  bar.title = debt > 0 ? `Stamina overdrawn: ${Math.round(debt * 100)}% of the way to a faint` : bar.dataset.title;
}
