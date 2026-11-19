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

/**
 * Whether a man is guarding now: the guard held (the player's button, an AI's kept guard) or a block or parry under way, and no
 * stroke of his own going (a cut made from the guard takes the blade out of it; brought back after, it is raised again).
 */
export function guarding(fighter) {
  // (A man broken open by a big deflect has no guard at all: bigDeflect.)
  if (fighter.brokenOpen > 0) return false;
  return (Boolean(fighter.guardHeld) || GUARDING_DEFENCES.has(fighter.defence?.name)) && !fighter.punch;
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

/**
 * Whether the man played's deflect now is a big one (WORLD.deflect.big): his guard up within its share of his window (least..most s).
 * The AI's never are: a big deflect is the player's reward for the closest timing.
 */
export function bigDeflect(fighter, time) {
  if (!fighter.player || !deflecting(fighter, time)) return false;
  const spec = WORLD.deflect.big;
  return time - fighter.guardSince <= Math.min(spec.most, Math.max(spec.least, deflectWindow(fighter) * spec.share));
}

/**
 * The striker of a big deflect broken open (WORLD.deflect.big `open`): for that long no guard, no block, no stroke (`brokenOpen` s, the
 * AI thinks nothing for him: ai.js), after the deflect's own reel (physics.js reel).
 */
export function breakOpen(world, fighter, event) {
  const seconds = WORLD.deflect.big.open;
  if (fighter.state !== 'up') return;
  fighter.brokenOpen = seconds;
  fighter.punch = null;
  fighter.rush = null;
  fighter.defence = null;
  fighter.guardHeld = false;
  // (Not a stagger's length: his arms keep their strength, his blade held off as it was knocked; a 2 s stagger's slack arm let
  // it swing on into the man who deflected it. The deflect's own reel shows the blow thrown back.)
  event.big = true;
  event.effects.push(`broken open (${seconds.toFixed(0)} s)`);
}
