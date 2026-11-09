// Horses: the breeds men rode to war, the armour some of them wore, and who
// rode. A man rides if his kit says so (an outfit's `horse`: the breed his
// people rode) and his horse is barded if it says that too (`barding`).
// Nothing here names a character; the outfits name their horses.

import { FACTIONS, factionOf, outfitOf } from './outfits.js';
import { ROBOT_DOGS, ROBOT_SHELL } from './robotdogs.js';

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
 * 14.2–15 hands); racing and polo figures for speed and turning (a gallop
 * 12–17 m/s unladen at best, a polo pony's turns at ~0.7 g). Each breed's
 * height and weight by its own line below. Paces go with size and build: the
 * small horses no faster than the riding horses, the heaviest the slowest
 * away and the widest in a turn; none tuned to a fight.
 */
export const HORSES = {
  // The great horse of the knights: deep and strong, not fast, and no giant: most war horses' bones stand 14–15.2 hands
  // (142–157 cm) and few over 15 (Clark 2004; Ameen et al. 2021, the English medieval horse bones), a heavy-boned horse of
  // that height ~550 kg (was 1.58 m, 600 kg).
  destrier: { label: 'Destrier', mass: 560, withers: 1.55, gallop: 10.5, canter: 5.8, trot: 3.6, walk: 1.6, accel: 3.2, lateral: 5.5, spin: 1.3, coats: ['#3a2a1e', '#5a3a22', '#2a2622', '#8a8a86'] },
  // The riding warhorse (courser, jennet, Andalusian; a Han or Ferghana horse; the Romans' cavalry horses): lighter, quicker.
  // The courser of the same bones as the destrier's lower half (Clark 2004); the Roman cavalry horses of the frontier finds
  // 1.40–1.50 m (Junkelmann, *Die Reiter Roms*, 1990–92); ~14.3 hands, ~470 kg (was 1.52 m, 480 kg).
  warhorse: { label: 'Warhorse', mass: 470, withers: 1.5, gallop: 12, canter: 6, trot: 3.6, walk: 1.6, accel: 3.6, lateral: 6.5, spin: 1.5, coats: ['#6a3a1c', '#4a2a18', '#2a2420', '#9a6a3a'] },
  // The Arab horse of Saladin's horsemen: light, fast, quick to turn. The breed stands 142–152 cm and weighs 380–450 kg
  // (the breed societies' standard; Edwards, *The Arabian*, 1973) (was 1.48 m, 430 kg).
  arabian: { label: 'Arabian', mass: 420, withers: 1.47, gallop: 12.5, canter: 6.2, trot: 3.7, walk: 1.7, accel: 4, lateral: 7, spin: 1.7, coats: ['#d8d2c6', '#7a4a24', '#5a3a22', '#3a2a20'] },
  // The Turkoman (Turkmen) horse of Central Asia, the Akhal-Teke's kind: the Nisaean horse of the Parthian and Persian
  // cataphracts, the Turkmen frontier warriors' and the Ottoman sipahi's: tall, lean, long in the leg, a racer's
  // endurance. 145–160 cm, 400–450 kg (the Akhal-Teke's breed figures, Hendricks, *International Encyclopedia of Horse
  // Breeds*, 1995); quick, a little less handy than the smaller Arab.
  turkoman: { label: 'Turkoman horse', mass: 430, withers: 1.53, gallop: 12.5, canter: 6.2, trot: 3.7, walk: 1.7, accel: 3.9, lateral: 6.8, spin: 1.6, coats: ['#b08a52', '#6a4a2a', '#3a2a20', '#c8b89a', '#4a3a30'] },
  // The steppe horse (Mongol, Jurchen and Manchurian): small, hardy, quick to turn. 12–14 hands (122–142 cm), the
  // Mongolian horse's mean 127–128 cm (Oklahoma State University, *Breeds of Livestock*), the Chinese Mongolian horse's
  // 1.28 m, 300–360 kg (Hendricks 1995); a little under its old 1.34 m and 320 kg. Its gallop is a long-distance runner's
  // (Mongolian horses race 15–30 km), no faster than a riding horse's over a sprint.
  steppe: { label: 'Steppe horse', mass: 300, withers: 1.3, gallop: 11, canter: 5.8, trot: 3.4, walk: 1.6, accel: 3.8, lateral: 7, spin: 1.8, coats: ['#8a6a42', '#5a4030', '#2a2420', '#b8a888', '#6a5a4a'] },
  // The Ming border army's horse: steppe-bred, but the pick of what the Ming bought at the Liaodong horse markets (from
  // the Mongols and Jurchens) and through the tea-horse trade of the northwest (the tea-horse offices of Xining, Hezhou and
  // Taozhou, horses of the Tibetan uplands: Rossabi, 'The Tea and Horse Trade with Inner Asia during the Ming', *Journal
  // of Asian History* 4, 1970), the Hequ kind among them, larger than the Mongolian (the Hequ horse ~1.32–1.40 m, ~350 kg:
  // Chinese breed surveys, as quoted secondhand). The generals' household cavalry rode the best of it. A little bigger than the Japanese horse: at
  // Byeokjegwan (1593) the Japanese coveted the Ming's big horses (Tachibana house papers, as quoted secondhand).
  mingBorder: { label: 'Ming border horse', mass: 350, withers: 1.36, gallop: 11, canter: 5.8, trot: 3.5, walk: 1.6, accel: 3.6, lateral: 6.8, spin: 1.7, coats: ['#6a4a2a', '#8a6a42', '#2a2420', '#5a3a22', '#b8a888'] },
  // The Japanese horse of the samurai (the Kiso and Misaki kind): small and stocky. The horse bones of medieval Kamakura
  // (the Zaimokuza site, 1333) stand ~109–140 cm, most about 130 (Hayashida Shigeyuki 1957, as quoted secondhand in the
  // surveys of Japan's native breeds); the Kiso horse today ~133 cm, the Misaki ~130 cm: ~1.29 m, ~300 kg (was
  // 1.30 m, 320 kg). Slower than the steppe horse and less handy (shorter-legged, heavier in the forehand).
  japanese: { label: 'Japanese horse', mass: 300, withers: 1.29, gallop: 10, canter: 5.4, trot: 3.3, walk: 1.5, accel: 3.4, lateral: 6.5, spin: 1.7, coats: ['#3a2a1e', '#6a4a2a', '#2a2420', '#8a6a4a'] },
};

/**
 * What a load does to a horse: comfortable up to `easy` of its own weight
 * (cavalry manuals: a fifth to a quarter); past that its paces fall by
 * `slows` per unit of weight over (a 300 kg steppe horse under a 100 kg
 * man in iron and 30 kg of barding gallops a fifth slower). Getting away
 * and pulling up go as its own weight to its weight laden.
 */
export const HORSE_LOAD = { easy: 0.2, slows: 0.9, least: 0.6 };

/**
 * Horse armour (barding), by the part of the horse it covers (the capsules of physics/mounted.js HORSE_SHAPE: head, neck,
 * chest, body, legs). Protection as an outfit's (0–1 of a blow's blunt, cut and pierce harm kept out; `deflects`: plate
 * turns an edge). `mass` (kg) of the whole. `from` (of the withers' height): a part's armour reaches down only so far, and
 * a blow landing below it meets the bare horse (the forearms and the belly under the peytral's hem). As drawn: horsebard.js.
 * - plate, the full bard of c. 1480–1560: the shaffron over the whole face (head); the crinet's lames over the crest and
 *   upper sides of the neck, mail under the throat (neck: the lames turn an edge; a point finds the mail); the peytral round
 *   the breast and the shoulders to above the forearm (chest, down to 0.6 of the withers); the flanchards under the saddle
 *   and the crupper over the hindquarters (body); the legs and the belly bare. Surviving bards weigh 30–40 kg: the
 *   Wallace Collection's Landshut bard (A21, c. 1480) 30.07 kg; 1–1.5 mm plate over ~3 m² of horse.
 * - lamellar, the Song and Jin bard (Wujing Zongyao, 1044: face, neck, breast, body and rump pieces) the Jurchen 'iron
 *   pagoda' and the khans' guards rode: the face under an iron brow plate and lamellae, the whole neck, the breast, and
 *   a skirt down the flanks below the belly and over the rump, all small iron lamellae laced in overlapping rows
 *   (~4.5 m², much of it doubled where the rows lap). No weights survive; at the 0.7–1 mm of the riders' own
 *   lamellae (Met 788894), ~38 kg.
 * - brigandine, the Later Jin and Qing guard's bard (the horse armour of the Qing's ceremonial and guard harness, the
 *   Palace Museum's and the Shenyang palace's; the Ming 'iron horse armour' of the Wubei zhi's cavalry before it), made as
 *   the rider's own coat is: small iron plates riveted inside a cloth facing of his colours, the rivets' gilt heads
 *   studding the outside in rows. The same pieces as the lamellar bard, the horse fully clad (a face piece under an iron
 *   brow plate, the whole neck, the breast, a skirt down the flanks below the belly and over the rump). Guarded as a
 *   brigandine is (the Ming brigandine's coat: the plates turn an edge, a point finds the seams between them, the cloth and
 *   its quilting spread a blow a little less than lamellar's laced rows), no mail under it; the plates smaller and thinner
 *   than the lamellar bard's (~0.7 mm, 48 x 24 mm): ~30 kg over ~4.5 m². Not plate: an edge is not turned aside (no
 *   `deflects`), and proof enough against an edge (cut 0.82) that a slide along it parts nothing (weapons.js sliceGain).
 * - mingFront, the late Ming elite charger's (the user's description, 2026-11-09): armoured for the charge, from the
 *   front only. An iron face plate (面帘) with brass fittings and red tassels; a thick quilted neck collar (项铠) lined with
 *   iron scales; a chest apron (胸墙甲) of dark canvas studded with riveted iron plates (钉甲), hanging past the breast to
 *   the forearms (`from` 0.4 of the withers, against the plate peytral's 0.6). The flanks, the hindquarters and the legs
 *   bare under a quilted saddle blanket, the horse kept light for the sprint. The face guarded as a plate shaffron is (a
 *   plate turns an edge); the collar and the apron as the brigandine bard (plates under cloth). ~12 kg: the face plate
 *   ~1.5, the collar ~4, the apron ~6.
 * - bare: a saddle and tack only.
 */
const PLATE_BARD = { blunt: 0.55, cut: 1, pierce: 0.88, deflects: true };
// The crinet: lames over the crest and upper sides, mail under the throat (a point goes through the mail's rings; mail spreads little of a blow).
const CRINET = { blunt: 0.42, cut: 1, pierce: 0.72, deflects: true };
const LAMELLAR_BARD = { blunt: 0.42, cut: 0.86, pierce: 0.7 };
const BRIGANDINE_BARD = { blunt: 0.4, cut: 0.82, pierce: 0.55 };
const NONE = { blunt: 0, cut: 0, pierce: 0 };
export const BARDING = {
  plate: { label: 'Steel plate barding', mass: 36, parts: { head: PLATE_BARD, neck: CRINET, chest: { ...PLATE_BARD, from: 0.6 }, body: { ...PLATE_BARD, blunt: 0.45, from: 0.56 }, legs: NONE } },
  lamellar: { label: 'Steel lamellar barding', mass: 38, parts: { head: LAMELLAR_BARD, neck: LAMELLAR_BARD, chest: LAMELLAR_BARD, body: LAMELLAR_BARD, legs: NONE } },
  // (`covering`: what a blow on it sounds like, audio/log.js COVERINGS: the small plates under cloth rattle as scale does.)
  brigandine: { label: 'Brigandine barding', mass: 30, covering: 'scale', parts: { head: BRIGANDINE_BARD, neck: BRIGANDINE_BARD, chest: BRIGANDINE_BARD, body: BRIGANDINE_BARD, legs: NONE } },
  mingFront: { label: 'Ming front barding', mass: 12, covering: 'scale', parts: { head: PLATE_BARD, neck: BRIGANDINE_BARD, chest: { ...BRIGANDINE_BARD, from: 0.4 }, body: NONE, legs: NONE } },
  bare: { label: 'Bare horse', mass: 0, parts: { head: NONE, neck: NONE, chest: NONE, body: NONE, legs: NONE } },
  // (a robot dog's shell, robotdogs.js.)
  robotShell: ROBOT_SHELL,
};

/**
 * What a horse's armour keeps out at one of its parts, struck at `height` (m above the ground under it; omitted: anywhere
 * the armour covers): the part's protection, or none below the armour's reach (`from`, of the withers' height).
 */
export function bardingAt(barding, part, height = Infinity, withers = 1.5) {
  const protection = BARDING[barding]?.parts[part] ?? NONE;
  return protection.from !== undefined && height < protection.from * withers ? NONE : protection;
}

/** A mount's breed: a horse, or a robot dog (robotdogs.js). */
export const breedOf = (key) => HORSES[key] ?? ROBOT_DOGS[key];

/**
 * The breed he rides: his own (`outfit.horse`, a breed key: a man of an army that bought its horses bigger than his kit's
 * people rode, the Ming border cavalry in a Mongol-cut coat) before his kit's; null if he does not ride.
 */
export function breedKeyOf(inputs) {
  const own = inputs.outfit?.horse;
  const kit = outfitOf(inputs).spec.horse;
  if (!breedOf(kit)) return null;
  return HORSES[own] ? own : kit;
}

/** Whether a character rides: his kit names the horse his people rode. */
export function canRide(inputs) {
  return Boolean(breedKeyOf(inputs));
}

/**
 * His horse and its armour (null if he does not ride): { breed, barding, finish }. The bard is finished as his own
 * harness is (`finish`: `style` fluted, etched or plain plate; `steel` its colour; `lace` a laced bard's lacing, as his
 * lamellar's: his kit's cord, else his people's, else his lace; `cloth` and `gold` a brigandine bard's facing and its
 * studs, his own coat's: its cloth, else its colour, and its gilt).
 */
export function mountOf(inputs) {
  const { spec, look } = outfitOf(inputs);
  const breed = breedKeyOf(inputs);
  if (!breed) return null;
  const armor = look?.armor ?? {};
  const finish = {
    style: armor.fluted ? 'fluted' : armor.joust ? 'etched' : 'plain',
    steel: armor.color ?? null,
    lace: armor.cord ?? FACTIONS[factionOf(inputs)]?.lamellarCord ?? armor.lace ?? null,
    cloth: armor.cloth ?? armor.color ?? null,
    gold: armor.gold ?? null,
  };
  return { breed, barding: BARDING[spec.barding] ? spec.barding : 'bare', finish };
}

/** Whether his kit is bolted to its mount (a robot dog's: robotdogs.js): he is always on it, never on foot. */
export function boltedOn(inputs) {
  return Boolean(outfitOf(inputs).spec.bolted);
}

/** Whether he is on a horse: set to ride (`inputs.mounted`) and his kit rides; or bolted to his mount (boltedOn). */
export function isMounted(inputs) {
  return (Boolean(inputs.mounted) || boltedOn(inputs)) && canRide(inputs);
}

/** The fighters of a roster who can ride, set to ride (`on`) or to fight on foot; the rest are left as they are. Returns how many ride. */
export function mountAll(roster, on) {
  let riders = 0;
  for (const inputs of roster) {
    if (!canRide(inputs)) continue;
    inputs.mounted = on || boltedOn(inputs);
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
