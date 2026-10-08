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
// Bows: a bow's draw weight (`drawN`) against what his back and arm can
// pull. Short of it he draws it only part way (a slower arrow), and if not
// even half way, not usefully at all; the heavier the bow for him, the
// slower he draws it.

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
  drawPerArmN: 2.9,
  minDraw: 0.5,
  // The draw's pace: as long as the bow's weight against `drawEase` of what he can pull, within these bounds.
  drawEase: 0.8,
  drawSlowest: 2.5,
  drawQuickest: 0.7,
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
    const draw = Math.min(1, pull / spec.drawN);
    const drawTime = Math.max(HANDLING.drawQuickest, Math.min(HANDLING.drawSlowest, spec.drawN / (pull * HANDLING.drawEase)));
    return { canHold: draw >= HANDLING.minDraw, holdLoad: spec.drawN / pull, speed: 1 / drawTime, draw, drawTime };
  }
  const grip = hands(spec);
  const holding = spec.mass * STANDARD_GRAVITY * (HANDLING.holdLever + spec.balance);
  const holdLoad = holding / (force * grip * HANDLING.holdLever * HANDLING.holdShare);
  const reach = body.reach;
  // The demand: inertia against the arms' torque; his against the reference arm's on the same weapon.
  const demand = (armN) => inertia(spec, reach) / (armN * grip * reach);
  const speed = (1 + HANDLING.inertiaWeight * demand(HANDLING.referenceArmN)) / (1 + HANDLING.inertiaWeight * demand(force));
  return { canHold: holdLoad < 1, holdLoad, speed: Math.max(HANDLING.minSpeed, Math.min(HANDLING.maxSpeed, speed)), draw: 1, drawTime: 1 };
}
