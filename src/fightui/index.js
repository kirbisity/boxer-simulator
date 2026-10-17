// The fight's attack controls, one of two the player picks between (the
// "Controls: Body · Buttons" switch in the footer and on the home screen):
//   target  — Body, the default: tap the man himself where to hit; a faint
//             ring on his chest is the only sign (fightui/target.js)
//   buttons — Buttons: one coloured button per kind of blow round the Guard (fightui/buttons.js)
// The choice is remembered on this device; ?fightui=<id> in the address
// overrides it (for testing), as does boxer.fightUi('<id>'). The Guard,
// Lock, special button, stick, look and the keys stay as they are.

import { fightUiActionButtons } from './buttons.js';
import { fightUiTargetBody } from './target.js';
import { fightUiKit, fightUiRecall, fightUiRemember } from './kit.js';

export const FIGHT_UI_DESIGNS = {
  target: { name: 'Body', title: 'Target on the body', make: fightUiTargetBody },
  buttons: { name: 'Buttons', title: 'Action buttons', make: fightUiActionButtons },
};

export const FIGHT_UI_CHOICE = {
  fallback: 'target',
  storageKey: 'gladiator.fightControls',
};

/** The design asked for in the address (?fightui=<id>), or null. */
export function fightUiFromAddress(search = globalThis.location?.search ?? '') {
  const id = new URLSearchParams(search).get('fightui');
  return id && FIGHT_UI_DESIGNS[id] ? id : null;
}

/** The controls the player chose: the address's, else the remembered, else Body. */
export function fightUiPreferred(search) {
  const remembered = fightUiRecall(FIGHT_UI_CHOICE.storageKey);
  return fightUiFromAddress(search) ?? (FIGHT_UI_DESIGNS[remembered] ? remembered : FIGHT_UI_CHOICE.fallback);
}

const fightUiChoosers = new Set();

/** Choose the controls (remembered), for every fight surface on the page. */
export function fightUiChoose(id) {
  if (!FIGHT_UI_DESIGNS[id]) return null;
  fightUiRemember(FIGHT_UI_CHOICE.storageKey, id);
  for (const chooser of fightUiChoosers) chooser(id);
  globalThis.dispatchEvent?.(new CustomEvent('fightui', { detail: id }));
  return id;
}

/**
 * The chooser, inside the fight's controls (`root`, touch.js's `hooks`):
 * update/reset follow the fight; tap(event) is asked about each tap on the
 * fight's surface (Body strikes where the tap lands on his man).
 */
export function fightUiInstall(root, hooks) {
  let id = null;
  let kit = null;
  let design = null;

  function choose(next) {
    const wanted = FIGHT_UI_DESIGNS[next] ? next : FIGHT_UI_CHOICE.fallback;
    if (wanted === id) return id;
    design?.destroy();
    kit?.destroy();
    id = wanted;
    kit = fightUiKit(root, hooks);
    design = FIGHT_UI_DESIGNS[id].make(root, kit, hooks);
    root.dataset.fightui = id;
    return id;
  }
  choose(fightUiPreferred());
  fightUiChoosers.add(choose);

  return {
    choose,
    get id() { return id; },
    tap: (event) => design.tap(event),
    update: () => {
      design.update();
      kit.update();
    },
    reset: () => {
      design.reset();
      kit.reset();
    },
  };
}
