// Horses: the breeds men rode to war, the armour some of them wore, and who
// rode. A man rides if his kit says so (an outfit's `horse`: the breed his
// people rode) and his horse is barded if it says that too (`barding`).
// Nothing here names a character; the outfits name their horses.

import { outfitOf } from './outfits.js';

/**
 * The breeds, each as it went to war. `mass` (kg) unladen; `withers` (m)
 * the height at the shoulder (everything else is drawn and struck to that
 * scale); `gallop`, `canter`, `trot`, `walk` (m/s) its paces unladen;
 * `accel` (m/s²) how hard it gets away and pulls up; `lateral` (m/s²) the
 * sideways pull it can lean into a turn at speed (a turn's radius is
 * speed² / lateral); `spin` (rad/s) turning on the spot. Its load
 * (rider, his kit, the barding) slows it (`HORSE_LOAD`).
 * Sources: the weights and heights of medieval horse bones (Clark, *The
 * Medieval Horse and its Equipment*; Ameen et al. 2021: few war horses over
 * 14.2–15 hands); Mongolian horses 12–14 hands, ~300 kg; racing and polo
 * figures for speed and turning (a gallop 12–17 m/s unladen at best, a
 * polo pony's turns at ~0.7 g).
 */
export const HORSES = {
  // The great horse of the knights: tall, deep and strong, not fast.
  destrier: { label: 'Destrier', mass: 600, withers: 1.58, gallop: 10.5, canter: 5.8, trot: 3.6, walk: 1.6, accel: 3.2, lateral: 5.5, spin: 1.3, coats: ['#3a2a1e', '#5a3a22', '#2a2622', '#8a8a86'] },
  // The riding warhorse (courser, jennet, Andalusian; a Han or Ferghana horse): lighter, quicker.
  warhorse: { label: 'Warhorse', mass: 480, withers: 1.52, gallop: 12, canter: 6, trot: 3.6, walk: 1.6, accel: 3.6, lateral: 6.5, spin: 1.5, coats: ['#6a3a1c', '#4a2a18', '#2a2420', '#9a6a3a'] },
  // The Arab and Turkoman horses of Saladin's and the Sultan's horsemen: light, fast, quick to turn.
  arabian: { label: 'Arabian', mass: 430, withers: 1.48, gallop: 12.5, canter: 6.2, trot: 3.7, walk: 1.7, accel: 4, lateral: 7, spin: 1.7, coats: ['#d8d2c6', '#7a4a24', '#5a3a22', '#3a2a20'] },
  // The steppe horse (Mongol, Jurchen, the Ming's northern remounts): small, hardy, quick to turn.
  steppe: { label: 'Steppe horse', mass: 320, withers: 1.34, gallop: 11, canter: 5.8, trot: 3.4, walk: 1.6, accel: 3.8, lateral: 7, spin: 1.8, coats: ['#8a6a42', '#5a4030', '#2a2420', '#b8a888', '#6a5a4a'] },
  // The Japanese horse of the samurai (kiso, misaki): small, stocky.
  japanese: { label: 'Japanese horse', mass: 320, withers: 1.3, gallop: 10, canter: 5.4, trot: 3.3, walk: 1.5, accel: 3.4, lateral: 6.5, spin: 1.7, coats: ['#3a2a1e', '#6a4a2a', '#2a2420', '#8a6a4a'] },
};

/**
 * What a load does to a horse: comfortable up to `easy` of its own weight
 * (cavalry manuals: a fifth to a quarter); past that its paces fall by
 * `slows` per unit of weight over (a 320 kg steppe horse under a 100 kg
 * man in iron and 30 kg of barding gallops a fifth slower). Getting away
 * and pulling up go as its own weight to its weight laden.
 */
export const HORSE_LOAD = { easy: 0.2, slows: 0.9, least: 0.6 };

/**
 * Horse armour (barding), by the part of the horse it covers. Protection
 * as an outfit's (0–1 of a blow's blunt, cut and pierce harm kept out;
 * `deflects`: plate turns an edge). `mass` (kg) of the whole.
 * - plate: the chanfron (head), crinet (neck), peytral (chest), flanchards
 *   and crupper (sides and hindquarters); the legs and belly bare. 30–40 kg
 *   in surviving 15th–16th c. bards (the Wallace, the Royal Armouries).
 * - lamellar: iron lamellae laced over the head, neck, chest and body to the
 *   knees (the Jurchen 'iron pagoda' horses, the khan's guard): ~30 kg.
 * - bare: a saddle and tack only.
 */
const PLATE_BARD = { blunt: 0.55, cut: 1, pierce: 0.88, deflects: true };
const LAMELLAR_BARD = { blunt: 0.42, cut: 0.86, pierce: 0.7 };
const NONE = { blunt: 0, cut: 0, pierce: 0 };
export const BARDING = {
  plate: { label: 'Steel plate barding', mass: 34, parts: { head: PLATE_BARD, neck: PLATE_BARD, chest: PLATE_BARD, body: { ...PLATE_BARD, blunt: 0.45 }, legs: NONE } },
  lamellar: { label: 'Steel lamellar barding', mass: 30, parts: { head: LAMELLAR_BARD, neck: LAMELLAR_BARD, chest: LAMELLAR_BARD, body: LAMELLAR_BARD, legs: NONE } },
  bare: { label: 'Bare horse', mass: 0, parts: { head: NONE, neck: NONE, chest: NONE, body: NONE, legs: NONE } },
};

/** Whether a character rides: his kit names the horse his people rode. */
export function canRide(inputs) {
  return Boolean(HORSES[outfitOf(inputs).spec.horse]);
}

/** His horse and its armour (null if he does not ride): { breed, barding }. */
export function mountOf(inputs) {
  const spec = outfitOf(inputs).spec;
  if (!HORSES[spec.horse]) return null;
  return { breed: spec.horse, barding: BARDING[spec.barding] ? spec.barding : 'bare' };
}

/** Whether he is on a horse: set to ride (`inputs.mounted`) and his kit rides. */
export function isMounted(inputs) {
  return Boolean(inputs.mounted) && canRide(inputs);
}

/** The fighters of a roster who can ride, set to ride (`on`) or to fight on foot; the rest are left as they are. Returns how many ride. */
export function mountAll(roster, on) {
  let riders = 0;
  for (const inputs of roster) {
    if (!canRide(inputs)) continue;
    inputs.mounted = on;
    riders += 1;
  }
  return riders;
}

/** The sides an older setup's side-level `mounted` ('red', 'blue', 'both', true for both, or { red: bool, blue: bool }) names. */
export function sidesMounted(value) {
  if (value === 'both' || value === true) return ['red', 'blue'];
  if (value === 'red' || value === 'blue') return [value];
  if (value && typeof value === 'object') return ['red', 'blue'].filter((corner) => value[corner]);
  return [];
}

/**
 * A setup file's fighters with each one's own `mounted` set. A fighter's own
 * `mounted` wins; one with none rides if his side was named in the file's
 * side-level `mounted` (or `mountedSides`: an older setup) and his kit rides.
 * Returns { red: [inputs...], blue: [inputs...] } as copies.
 */
export function mountedTeams(file) {
  const named = new Set(sidesMounted(file.mounted ?? file.mountedSides ?? file.teams?.mounted ?? file.teams?.mountedSides));
  const team = (corner) => file.teams[corner].map((entry) => {
    const inputs = { ...entry };
    if (inputs.mounted === undefined && named.has(corner) && canRide(inputs)) inputs.mounted = true;
    return inputs;
  });
  return { red: team('red'), blue: team('blue') };
}
