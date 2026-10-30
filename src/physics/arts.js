// The mechanics a weapon art (moves.js `art`, weaponarts.js) adds to an ordinary stroke: the hips wound
// the other way before they turn through (`coil`), the whole body turned off its man and back into the
// blow (`turn`), a step back in the wind-up (`retreat`), and a blow struck with the hilt (`hilt`: the
// pommel). Pure: physics.js asks these at the few places they matter.
// Nothing here scales a blow: each only changes how the body and the weapon move, or which part of the
// weapon meets him, and the physics makes of that what it is.

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
};

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
