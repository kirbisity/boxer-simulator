// The deflect (WORLD.deflect): a blade brought onto a blow in the first moment of the guard turns it. Here: when a man's guard
// went up and whether it is fresh, the window his weapon gives him, how much of the guard is left as he holds it, and whether
// a meeting now is a deflect.
import { WEAPONS } from '../weapons.js';
import { WORLD } from './config.js';
import { weaponInertia } from './effort.js';

const GUARDING_DEFENCES = new Set(['guard', 'weaponBlock', 'shieldBlock', 'parry']);

/** Whether his guard is a deflect (a weapon in hand, no shield): the fists' guard and a shield's block are as they were. */
export function deflectsWith(fighter) {
  return Boolean(fighter?.weapon?.held && !fighter.shield && !fighter.weapon.spec.ranged);
}

/** Whether a man is guarding now: the guard held (the player's button, an AI's kept guard) or a block or parry under way. */
export function guarding(fighter) {
  return Boolean(fighter.guardHeld) || GUARDING_DEFENCES.has(fighter.defence?.name);
}

/**
 * Each step, for each man: the moment his guard went up (`guardSince`), whether it came up fresh (`guardFresh`: not within
 * `spam` s of the last let down), and when it last came down (`guardDownAt`).
 */
export function noteGuard(world, fighter) {
  const up = guarding(fighter);
  if (up && !fighter.guardUp) {
    fighter.guardUp = true;
    fighter.guardSince = world.time;
    fighter.guardFresh = world.time - (fighter.guardDownAt ?? -Infinity) >= WORLD.deflect.spam;
  } else if (!up && fighter.guardUp) {
    fighter.guardUp = false;
    fighter.guardDownAt = world.time;
  }
}

/** The deflect window (s) his weapon gives him: the base for the reference weapon, over √ of his weapon's inertia against it. */
export function deflectWindow(fighter) {
  const spec = WORLD.deflect;
  const weapon = fighter.weapon?.held ? fighter.weapon.spec : null;
  if (!weapon) return 0;
  const reach = fighter.body.reach;
  const ratio = weaponInertia(weapon, reach) / weaponInertia(WEAPONS[spec.ref], reach);
  const own = Math.min(spec.most, Math.max(spec.least, spec.window / Math.sqrt(ratio)));
  // (A man the AI plays: `aiShare` of it, WORLD.deflect.)
  return fighter.player ? own : own * spec.aiShare;
}

/** Whether a meeting of his blade with a blow now is a deflect: his guard fresh, up with a weapon, and within its window. */
export function deflecting(fighter, time) {
  if (!fighter.guardUp || !fighter.guardFresh || !deflectsWith(fighter)) return false;
  return time - fighter.guardSince <= deflectWindow(fighter);
}

/**
 * How much of his guard is left as he holds it (0..1): whole through the window, then falling to nothing at `holdFor` s. A
 * weapon's guard only: a shield is held on the arm and the fists' guard is the arms', both as they were.
 */
export function guardHold(fighter, time) {
  if (!fighter.guardUp || !deflectsWith(fighter)) return 1;
  const spec = WORLD.deflect;
  const held = time - fighter.guardSince;
  const window = deflectWindow(fighter);
  if (held <= window) return 1;
  return Math.max(0, 1 - (held - window) / Math.max(1e-6, spec.holdFor - window));
}
