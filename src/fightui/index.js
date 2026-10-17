// Which attack controls the fight draws: today's tap pad (touch.js, the
// default) or one of the POCs here, for the player to try and pick among:
//   buttons — A, action buttons round the Guard (fightui/buttons.js)
//   swipe   — B, a pad to swipe the blow's way across (fightui/swipe.js)
//   target  — C, a figure of his man to tap where to hit (fightui/target.js)
//   radial  — D, hold a hand button for a wheel of every move (fightui/radial.js)
// Chosen by ?fightui=<id> in the address, or boxer.fightUi('<id>') ('pad' or
// null for today's). The Guard, Lock, special button, stick and look stay.

import { fightUiActionButtons } from './buttons.js';
import { fightUiDirectional } from './swipe.js';
import { fightUiTargetBody } from './target.js';
import { fightUiRadialHand } from './radial.js';
import { fightUiKit } from './kit.js';

export const FIGHT_UI_DESIGNS = {
  buttons: { name: 'Action buttons', make: fightUiActionButtons },
  swipe: { name: 'Directional strike', make: fightUiDirectional },
  target: { name: 'Target on the body', make: fightUiTargetBody },
  radial: { name: 'Radial hand', make: fightUiRadialHand },
};

/** The design asked for in the address (?fightui=<id>), or null for today's. */
export function fightUiFromAddress(search = globalThis.location?.search ?? '') {
  const id = new URLSearchParams(search).get('fightui');
  return id && FIGHT_UI_DESIGNS[id] ? id : null;
}

/**
 * The chooser, inside the fight's controls (`root`, touch.js's `hooks`):
 * update/reset follow the fight; tap(event) is asked first about each tap
 * on the fight's surface (true: the design took it, the pad throws nothing).
 */
export function fightUiInstall(root, hooks) {
  let id = null;
  let kit = null;
  let design = null;

  function choose(next) {
    const wanted = next && FIGHT_UI_DESIGNS[next] ? next : null;
    if (wanted === id) return id;
    design?.destroy();
    kit?.destroy();
    design = null;
    kit = null;
    id = wanted;
    if (id) {
      kit = fightUiKit(root, hooks);
      design = FIGHT_UI_DESIGNS[id].make(root, kit, hooks);
      root.dataset.fightui = id;
    } else delete root.dataset.fightui;
    return id;
  }
  choose(fightUiFromAddress());

  return {
    choose,
    get id() { return id; },
    tap: (event) => Boolean(design?.tap(event)),
    update: () => {
      if (!design) return;
      design.update();
      kit.update();
    },
    reset: () => {
      design?.reset();
      kit?.reset();
    },
  };
}
