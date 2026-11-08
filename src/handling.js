// What a man can do with a weapon, from his strength and its weight.
//
// Holding: at guard the weapon is held out before him; its weight, at its
// balance point out past the hand, is a torque about the shoulder that his
// arms (one, or both on a two-hand grip) must hold steadily. Past that, he
// cannot wield it at all (a great club in an old woman's hands).
//
// Swinging: the swing is the arms' torque against the weapon's moment of
// inertia about the shoulder. A light weapon is quick in anyone's hand (the
// limb's own speed limits it); a heavy one is quick only in strong hands.
// `speed` is the swing's pace against a reference arm's (HANDLING.referenceArmN):
// it slows the turn of the blade and the stroke's clock, so a weak man's
// heavy blade comes slowly and lands with little of its energy.
//
// Bows: a bow's draw weight (`drawN`, at full draw) against what his back and
// arm can pull. Short of it he draws it only as far as the bow's force comes
// up to his pull, along its draw curve, and the arrow gets the energy the bow
// stores at that draw (drawShares); if not even half way, not usefully at
// all; the heavier the bow for him, the slower he draws it. A man who pulls
// its full weight draws it full and gets all of its power.
//
// Crossbows: the prod's power is the crossbow's whatever his strength (the
// string is in the nut, spanned at full draw); his strength decides whether
// he can span it at all and how long the spanning takes (crossbowSpan).

import { P } from './body.js';

export const HANDLING = {
  // A trained man's arm, pushing at the hand (the body model's strikeForce): the weapons' own pace is his.
  referenceArmN: 200,
  // Holding at guard: the hand ~0.35 m before the shoulder; a man holds out steadily this share of his arm's force.
  holdLever: 0.35,
  holdShare: 0.85,
  // The second hand on a two-hand grip adds this share of its arm (a hybrid grip, half of that).
  secondHand: 0.85,
  // How strongly inertia, against the arms' torque, sets the pace (fitted so a heavy club is slow in weak hands
  // and a knife near the same in anyone's), and the bounds of the pace.
  inertiaWeight: 50,
  minSpeed: 0.25,
  maxSpeed: 1.35,
  // Drawing a bow: mostly the back (the lats and rhomboids), with both arms: this many times one arm's push; below `minDraw` of a full draw, it is no use.
  // Against what archers pull: Pukhov & Tarnakov (2023, recurve archers, 37 men and women) found an elite male archer's
  // draw (~24 kgf, an Olympic bow) a third of his maximal force (~70 kgf); the Mary Rose's bows of 150-160 lbf (Hardy)
  // were drawn by men who pulled ~70 kgf and more. With this factor a trained archer (the longbowman, exercise ~0.86)
  // pulls ~90 kgf, a trained banner archer ~110, an average untrained man ~62 and a weak levy ~53 (the untrained
  // figures likely high: a modern untrained man struggles past ~60-70 lbf, 27-32 kgf, though that is a bow shot again
  // and again, not one pull at his limit; left as it is, flagged).
  drawPerArmN: 2.9,
  minDraw: 0.5,
  // The draw's pace: as long as the bow's weight against `drawEase` of what he can pull, within these bounds.
  drawEase: 0.8,
  drawSlowest: 2.5,
  drawQuickest: 0.7,
  // The pull the crossbows' `reloadSeconds` are for (a trained arm's, referenceArmN × drawPerArmN, ~59 kgf), and the least
  // share of the spanning a stronger man can bring it to (the lever, the hook and the hands still travel their way).
  referencePullN: 200 * 2.9,
  spanQuickest: 0.7,
};

const STANDARD_GRAVITY = 9.81;

/** One arm's force at the hand (N): the mean of his two. */
const armForce = (body) => (body.strikeForce[P.lHand] + body.strikeForce[P.rHand]) / 2;

/** How many arms' worth a grip brings to bear. */
const hands = (spec) => (spec.hands === 'two' ? 1 + HANDLING.secondHand : spec.hands === 'hybrid' ? 1 + HANDLING.secondHand / 2 : 1);

/** The weapon's moment of inertia about the shoulder (kg m²), held at arm's length `reach`. */
function inertia(spec, reach) {
  const length = spec.length + spec.handle;
  return spec.mass * (reach + spec.balance) ** 2 + (spec.mass * length * length) / 12;
}

/**
 * A man's handling of a weapon: whether he can wield it (`canHold`), how
 * hard holding it is (`holdLoad`, share of what he can hold), its pace in
 * his hands (`speed`, 1 for the reference arm), and for a bow, how far he
 * draws it (`draw`, 0..1) and how long that takes (`drawTime`, a factor).
 */
export function handling(body, spec) {
  if (!spec || spec.flag) return { canHold: true, holdLoad: 0, speed: 1, draw: 1, drawTime: 1 };
  const force = armForce(body);
  if (spec.drawN) {
    const pull = force * HANDLING.drawPerArmN;
    const { draw, drawEnergy } = drawShares(spec, pull);
    const drawTime = Math.max(HANDLING.drawQuickest, Math.min(HANDLING.drawSlowest, spec.drawN / (pull * HANDLING.drawEase)));
    return { canHold: draw >= HANDLING.minDraw, holdLoad: spec.drawN / pull, speed: 1 / drawTime, draw, drawEnergy, drawTime };
  }
  const grip = hands(spec);
  const holding = spec.mass * STANDARD_GRAVITY * (HANDLING.holdLever + spec.balance);
  const holdLoad = holding / (force * grip * HANDLING.holdLever * HANDLING.holdShare);
  const reach = body.reach;
  // The demand: inertia against the arms' torque; his against the reference arm's on the same weapon.
  const demand = (armN) => inertia(spec, reach) / (armN * grip * reach);
  const speed = (1 + HANDLING.inertiaWeight * demand(HANDLING.referenceArmN)) / (1 + HANDLING.inertiaWeight * demand(force));
  const handled = { canHold: holdLoad < 1, holdLoad, speed: Math.max(HANDLING.minSpeed, Math.min(HANDLING.maxSpeed, speed)), draw: 1, drawTime: 1 };
  const span = spec.shot?.span;
  if (!span) return handled;
  const spanned = crossbowSpan(spec.shot, force * HANDLING.drawPerArmN);
  return { ...handled, canHold: handled.canHold && spanned.canSpan, ...spanned };
}

/**
 * How far a man who pulls `pull` N draws a bow (`draw`, the share of its power stroke) and the share of its full
 * draw's energy he stores (`drawEnergy`). Its force-draw curve is taken as F(s) = drawN·s^p over the share s of the
 * stroke, p = 1/fullness − 1 (the curve whose area is the bow's `fullness` of the rectangle: a straight line for 0.5,
 * rising early for a fuller reflexed bow); he draws until the bow's force meets his pull, s = (pull/drawN)^(1/p), and
 * stores s^(p+1) of the full energy (for a linear draw: the share of the force, squared).
 */
export function drawShares(spec, pull) {
  const ratio = Math.min(1, pull / spec.drawN);
  if (ratio >= 1) return { draw: 1, drawEnergy: 1 };
  const p = 1 / (spec.cast?.fullness ?? 0.5) - 1;
  const draw = ratio ** (1 / p);
  return { draw, drawEnergy: draw ** (p + 1) };
}

/**
 * Spanning a crossbow (`shot.span`) by a man who pulls `pull` N (the bow pull): whether he can bring the prod's
 * draw to the nut at all (`canSpan`: his pull × the method's `lift` × its `advantage` at least its `drawN`), and the
 * seconds his reload takes (`reloadSeconds`): the spanning, `share` of the shot's for a man of HANDLING.referencePullN,
 * by that against his own force on it (no quicker than spanQuickest of it), and the rest (the bolt laid, the bow
 * raised) as it is. The bolt's speed and energy are the crossbow's whatever he pulls.
 */
export function crossbowSpan(shot, pull) {
  const span = shot.span;
  // (The method's lift and advantage are the same for him and the reference man: the pace is their pulls'.)
  const pace = Math.max(HANDLING.spanQuickest, HANDLING.referencePullN / Math.max(1e-6, pull));
  return { canSpan: pull * span.lift * span.advantage >= span.drawN, reloadSeconds: shot.reloadSeconds * (1 - span.share + span.share * pace) };
}
