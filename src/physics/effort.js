// What a stroke or a shot costs a man in stamina by the weapon in his hands (WORLD.weapons.effort, WORLD.heat).
//
// A move's own cost (moves.js `cost`) is the arms' and trunk's work for one stroke, set for a sword and shared by every weapon
// that makes the move; the weapon's own share of the work (`share`) goes with what it asks of the arm: a swing's, its moment of
// inertia about the shoulder (a bat, a dagger, a wakizashi take less than a katana does, an ōdachi more); a thrust's, its mass
// (a point is driven, not swung). Measured against the move's reference weapon (`refWeapon`: the katana unless the move names
// another, a hammer's or a naginata's own).
//
// A bow's draw is work too: what the bow stores at the draw he gets (weapons.js bowCast, handling.js drawEnergy), paid out of his
// bar at the muscles' efficiency (WORLD.heat.efficiency) on the bar's energy (staminaJoules), not one price for every bow.

import { WEAPONS, bowCast } from '../weapons.js';
import { WORLD } from './config.js';

/** A weapon's moment of inertia about the shoulder (kg m²), held at arm's length `reach`: as handling.js inertia. */
export function weaponInertia(spec, reach) {
  const length = spec.length + (spec.handle ?? 0);
  return spec.mass * (reach + spec.balance) ** 2 + (spec.mass * length * length) / 12;
}

/** The stroke's cost as a multiple of its move's own, by the weapon (1 for the move's reference weapon). */
export function swingEffort(spec, reach, move) {
  const rule = WORLD.weapons.effort;
  const reference = WEAPONS[move?.refWeapon ?? rule.ref];
  const ratio = move?.mode === 'thrust' ? spec.mass / reference.mass : weaponInertia(spec, reach) / weaponInertia(reference, reach);
  return 1 - rule.share + rule.share * Math.min(rule.cap, ratio);
}

/** What one shot of a bow costs his bar (before his aerobic), at the draw he makes of it (`drawEnergy`: handling.js). */
export function bowShotCost(spec, drawEnergy = 1) {
  return (bowCast(spec).stored * drawEnergy) / (WORLD.heat.efficiency * WORLD.heat.staminaJoules);
}
