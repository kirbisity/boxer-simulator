// The mechanics a weapon art (moves.js `art`, weaponarts.js) adds to an ordinary stroke: the hips wound
// the other way before they turn through (`coil`), the whole body turned off its man and back into the
// blow (`turn`) and, through locked arms, turning behind it as one (turningMass), a step back in the
// wind-up (`retreat`), the distance measured in the wind-up so the head lands, not the haft (`range`),
// and a blow struck with the hilt (`hilt`: the pommel). Pure: physics.js asks these at the few places
// they matter.
// Nothing here scales a blow: each only changes how the body and the weapon move, or which part of the
// weapon meets him, and the physics makes of that what it is.

import { bladeTargets } from '../weapons.js';

export const ART_MECHANICS = {
  // The trunk's turn (`twist`) in a coiled stroke: wound the other way through the wind-up (`coil` of it), then turned through
  // from there to the full twist, finishing by `lead` of the way from the wind-up to the extension (the hips lead the hands,
  // as WORLD.rotationLead has it from the start of an ordinary stroke). (Started from the wound-up side, the trunk turns
  // through `1 + coil` of a plain stroke's turn in the time the hands strike: the shoulders carry the arms faster.) The
  // body's own `turn` comes back square to his man by the same share of the drive: the feet lag it (WORLD.footing.turnRate),
  // so the turn is still sweeping the arms round as the blow lands.
  lead: 0.6,
  // The pommel (`hilt`): it meets what it strikes over this much of the weapon behind the main hand (m, along the weapon:
  // from the end of the grip, `handle`, plus the knob's own `knob`, to `handle` less `grip`): a longsword's pommel is a steel
  // disc or wheel of ~4 cm at the end of a ~24 cm grip. All of it blunt (`blunt`): a rounded steel knob neither cuts nor stabs.
  hilt: { knob: 0.03, grip: 0.07, blunt: 1 },
  // An art measured to its distance (a move's `range`: where his hands are to pass as the stroke meets its mark, as a share of
  // his arm's reach before his hips, so that the weapon's head and not its haft meets him there): through the wind-up his eye
  // stays on his man, the stroke laid for where he stands now, and his feet take him in or back toward that distance, `gain`
  // × footwork speed for each metre off it, at most `most` (a quick shuffle, not a run). A committed blow is measured.
  range: { gain: 4, most: 1.6 },
  // A blow struck with the whole body turning through it (`turn`): the arms locked to it, the weapon, the arms and the trunk
  // turn as one about his spine, half his shoulders' span behind the shoulder, not about the shoulder alone (weapons.js
  // effectiveMassAt's ordinary stroke): what meets the weapon there is the turning inertia of all of it. The trunk's share
  // behind the blow (`mass.body`) turns at `gyration` m about the spine (the trunk and shoulders, ~0.2 m), not at the hand.
  turning: { gyration: 0.2 },
};

/**
 * Whether an art's body turn (`turn`, + to his right) carries the blow round with it: turned away to the side the swing
 * comes from, the body turns back the way the hands sweep (a swing from his right across to his left, or the other way:
 * the hands' local z, + to his left, from `from` to `to`). A turn against the sweep is no help to it.
 */
export function turnsWithBlow(spec) {
  if (!spec.turn || spec.mode !== 'swing') return false;
  return Math.sign(spec.turn) === Math.sign(spec.to.hand[2] - spec.from.hand[2]);
}

/**
 * The effective mass (kg) a blow struck with the whole body turning through it (`turn`) meets its mark with at `distance`
 * m along the weapon from the hand: everything turned about the spine, `back` m behind the shoulder (half his shoulders'
 * span), its inertia there over the square of the radius out to the point of contact. `armsKg` is the arms' mass behind it
 * (at the arm's middle), `bodyKg` the trunk's share (at ART_MECHANICS.turning.gyration); `along`, as weapons.js
 * effectiveMassAt has it: a blow along the weapon pushes with the mass of all of it.
 */
export function turningMass(weaponSpec, armsKg, bodyKg, distance, armLength, back, along = 0) {
  const reach = weaponSpec.length + weaponSpec.handle;
  const inertia = bodyKg * ART_MECHANICS.turning.gyration ** 2 + armsKg * (back + armLength * 0.45) ** 2
    + (weaponSpec.mass * reach * reach) / 12 + weaponSpec.mass * (back + armLength + weaponSpec.balance) ** 2;
  const turning = inertia / (back + armLength + Math.abs(distance)) ** 2;
  const total = weaponSpec.mass + armsKg + bodyKg;
  return 1 / ((along * along) / total + (1 - along * along) / turning);
}

/**
 * How far (m) his man stands beyond the distance an art's head lands at (+ too far, − too near): the hands' place where
 * the stroke meets its mark (weapons.js bladeTargets `meet`), laid at `aim` (local), against where his arm wants them, `range` of his reach before his hips.
 */
export function rangeOff(spec, aim, body, weaponSpec) {
  const middle = bladeTargets(spec, spec.windup + (spec.meet ?? 0.5) * (spec.extendUntil - spec.windup), aim, body, weaponSpec).hand;
  return middle[0] - spec.range * body.reach;
}

/** The legs' drive (× footwork speed, + in) while an art measures its distance through the wind-up (`range`), or null. */
export function rangeDrive(punch) {
  if (!punch?.spec.range || punch.load > 0 || punch.t >= punch.spec.windup - (punch.spec.stepLead ?? 0) || punch.rangeOff === undefined) return null;
  const { gain, most } = ART_MECHANICS.range;
  return Math.max(-most, Math.min(most, gain * punch.rangeOff));
}

/**
 * The share of a stroke's `twist` the trunk takes at time `t` of a coiled art: from 0 to −`coil` through the wind-up, then
 * round to 1 by `lead` of the drive, held to the extension and eased back after it, as an ordinary stroke's is.
 */
export function coiledTwist(spec, t) {
  if (t < spec.windup) return -spec.coil * Math.sin((t / Math.max(1e-3, spec.windup)) * Math.PI * 0.5);
  if (t < spec.extendUntil) {
    const drive = Math.min(1, (t - spec.windup) / Math.max(1e-3, (spec.extendUntil - spec.windup) * ART_MECHANICS.lead));
    return -spec.coil + (1 + spec.coil) * Math.sin(drive * Math.PI * 0.5);
  }
  return Math.max(0, 1 - (t - spec.extendUntil) / Math.max(1e-3, spec.duration - spec.extendUntil));
}

/**
 * How far (rad, + to his right) a weapon art turns his whole body off his man at this moment of it (`turn`): round away
 * through the wind-up, then back square to him by `lead` of the drive, the feet turning the body as fast as they can
 * (WORLD.footing.turnRate) — the turn carries the arms and the weapon round with it, its speed added to theirs.
 */
export function artTurn(punch) {
  const spec = punch?.spec;
  if (!spec?.turn) return 0;
  if (punch.load > 0) return 0;
  const t = punch.t;
  if (t < spec.windup) return spec.turn * Math.sin((t / Math.max(1e-3, spec.windup)) * Math.PI * 0.5);
  const drive = Math.min(1, (t - spec.windup) / Math.max(1e-3, (spec.extendUntil - spec.windup) * ART_MECHANICS.lead));
  return spec.turn * Math.cos(drive * Math.PI * 0.5);
}

/** The legs' drive (× footwork speed, back) while an art steps back in its wind-up (`retreat`), or null. */
export function retreatDrive(punch) {
  if (!punch?.spec.retreat || punch.load > 0 || punch.t >= punch.spec.windup) return null;
  return -punch.spec.retreat;
}

/**
 * The stretch of the weapon (m along it from the main hand: [from, to]) that strikes in this stroke: the striking part
 * (`strikeFrom` to the tip), or for a blow with the hilt the pommel at the end of the grip, behind the hand.
 */
export function strikeSpan(weapon, stroke) {
  const spec = weapon.spec;
  if (!stroke?.spec.hilt) return [spec.strikeFrom, spec.length];
  return [-(spec.handle + ART_MECHANICS.hilt.knob), -(spec.handle - ART_MECHANICS.hilt.grip)];
}

/** How a blow with the pommel harms: all blunt (in harmMix's shape). */
export function hiltMix() {
  return { blunt: ART_MECHANICS.hilt.blunt, cut: 0, pierce: 0 };
}
