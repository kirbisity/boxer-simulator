// Weapons: what is held, how it moves with the hands, and what it does on
// contact. A weapon is a rigid line from the main hand to its tip. Held in
// one hand, a wrist spring turns it towards where the move points it, as fast
// as its moment of inertia allows; held in two, the hands set it: the blade
// runs from the off hand through the main hand and on. Its mass rides on the
// hands, so a heavy blade swings slower under the same muscles.
//
// On contact the physics is the same as any strike (an impulse between two
// effective masses), and the harm splits by kind: blunt (bruising, the head
// shaken), cut (an edge drawn across: wounds, and through a limb at a joint)
// and pierce (a point driven in: wounds, and into the chest or head, death).
// Which a contact is depends on the blade's motion there: a point moving
// along the blade into the target pierces; an edge moving across it cuts.

import { vec } from './pose.js';
import { muzzleEnergy } from './physics/ballistics.js';

// Crossbows: spanned once and loaded like a gun (`shot`, one at a time, no
// misfire), they loose a bolt that flies as an arrow does (`bolt`), shorter
// and heavier: `energy` against a long bow's arrow, `bounce` the chance it
// glances off proof armour (an arrow's ARROW.bounce). A 15th-century
// steel or composite crossbow spanned with a belt hook or goat's foot:
// ~100–200 J against a war bow's ~80–100; ~8 s a shot. The Chinese nu, the
// Han's spanned with the feet (jue zhang) and the Ming's with the waist: a
// little less, quicker to span.
// What he carries (`ammo`, every missile weapon's: the bolts, balls or arrows he has in all, the loaded one
// counted; physics/ranged.js ammoLeft): a crossbowman's quiver held ~18-20 bolts (the Genoese at Crécy, the
// inventories of the Italian communes' companies). The Han nu-men's sheaves were bigger, ~50 (Li Ling's five
// thousand loosed half a million bolts in a day, ~100 a man, the rest from the carts: SUPPLY).
// Its power is the prod's, not the man's: spanned at all, the string sits in the nut at full draw and the bolt goes at the
// crossbow's own `speed` and `energy` whoever looses it. His strength decides only whether he can span it and how long the
// spanning takes (`span`, handling.js crossbowSpan): the string drawn to the nut against the prod's `drawN` (N, at the nut)
// through the spanning aid's mechanical `advantage`, by what his back and arms pull (handling.js's bow pull) times `lift`
// (what a method that straightens the legs and back brings to bear against an arm-and-back pull: a deadlift against a
// row, ~2 for an untrained man by common strength norms: an estimate). The spanning is `share` of `reloadSeconds` for
// a man who pulls HANDLING.referencePullN; a stronger man spans the quicker (to HANDLING.spanQuickest of it: the hands
// and the lever still have to travel), a weaker the slower; one who cannot bring `drawN` to bear cannot span it at all.
// - The crossbow: a 15th-century composite or steel prod spanned with a goat's foot lever (Payne-Gallwey, The Crossbow,
//   1903, on the lever's use for the lighter war crossbows): ~400 lbf at the nut (an estimate: the goat's foot served
//   bows of a few hundred pounds, the windlass the heavier), the lever's advantage ~4 (the long arm over the short
//   one, an estimate from Payne-Gallwey's drawings); the arms and back on the lever (`lift` 1). Spanning is about half
//   its ~8 s shot (the rest: a bolt from the quiver, laid in the groove, the bow raised and laid on the mark).
// - The nu: spanned with the waist (the Ming's yao zhang: a hook at the belt, the feet in the bow, the legs and back
//   straightened) or the feet (the Han's jue zhang): no aid (`advantage` 1) but the legs and back (`lift` 2). Han nu
//   were rated in shi (the Juyan slips list 3-, 4-, 5- and 6-shi bows; a Han shi ~120 jin of ~0.25 kg, ~30 kgf):
//   ~3.5 shi, ~1000 N, a common waist-spanned bow (an estimate within that range).
export const CROSSBOW = { bolt: true, speed: 50, energy: 2, length: 0.38, bounce: 0.72, spread: 0.012, rounds: 1, misfire: 0, reloadSeconds: 8, ammo: 30,
  span: { by: "goat's foot", drawN: 1800, advantage: 4, lift: 1, share: 0.5 } };
export const NU = { ...CROSSBOW, speed: 48, energy: 1.6, length: 0.42, bounce: 0.78, reloadSeconds: 6, ammo: 75,
  span: { by: 'waist', drawN: 1000, advantage: 1, lift: 2, share: 0.5 } };

/**
 * A matchlock's shot, for its realism. A lead ball of ~13 g leaves the
 * muzzle at ~400 m/s: ~1 kJ, about twice a 9 mm pistol round, and a soft
 * ball that flattens in the wound. One in the body nearly always drops a man
 * (`lethal`, against GUN's); one in an arm or leg usually shatters the bone
 * (`limbBreak`, the share that breaks the joint, less what armour stops).
 * Armour stops less of it than of a pistol round (see an outfit's `bulletRating`). Smoothbore,
 * braced at the cheek: tight at duel range (`spread`, rad) but thrown wide by
 * moving. Now and then the priming flashes
 * without firing the charge (`misfire`). A trained
 * gunner reloads in ~15 s (`reloadSeconds`): powder, ball, ramrod, priming.
 */
// The Adams revolver of 1851 (Robert Adams, London): five chambers, a solid
// frame, double action (each pull of the trigger cocks and fires: no thumbing
// of the hammer). 54-bore (~.44), a ~14 g ball at ~200 m/s: ~280 J, a little
// under a duelling pistol's. Short-barrelled, so a little wider in its
// shot. Its five fired, every chamber is loaded again from the muzzle (powder
// or a combustible cartridge, the ball rammed home, a new cap on each
// nipple): ~40 s.
// Its ball (`projectile`: physics/ballistics.js, what it flies as; `energy`, its muzzle energy, from it): ~14 g of lead at
// ~200 m/s (a short barrel's charge, a black-powder revolver's chronographed range, 180-230).
const ADAMS_BALL = { kg: 0.014, velocity: 200, curve: 'sphere' };
export const ADAMS = {
  projectile: ADAMS_BALL,
  energy: muzzleEnergy(ADAMS_BALL),
  lethal: { head: 1, torso: 1.05, limb: 0.32 },
  bleed: { head: 0.0024, torso: 0.0028, limb: 0.0014 },
  limbBreak: 0.55,
  impulse: 2.8,
  recoil: 4.5,
  spread: 0.013,
  movingSpread: 0.035,
  misfire: 0.03,
  reloadSeconds: 40,
  rounds: 5,
  // A flask and a box of combustible cartridges and caps in the pocket: five loads of the cylinder (`ammo`, every round).
  ammo: 25,
  // Loaded at the front of the cylinder, chamber by chamber, the rammer lever
  // under the barrel pressing each ball home (the reload pose: physics weaponIntent).
  cylinder: true,
};

// A whip: the Roman flagellum as the arena's lorarii used it to drive men on
// (or a drover's bullwhip): a short stiff handle and a plaited leather thong
// tapering to a fall, ~2.4 m. The thong is a rope (physics/whip.js): links
// of falling mass to the tip, so a snap of the handle runs out along it and
// the tip goes many times faster than the hand. What strikes is the tip's
// small mass (`tipLinks` links of the `massKg`), fast: it lashes the skin
// (cut, shallow), stings and shoves; the pain makes an unarmoured man reel,
// and a hard lash may put him on his knees. Against armour it does almost
// nothing (its cut protection takes it). `lashFrom`: m/s of the tip before
// a touch is a lash; `painFrom`: joules through the skin before a man may
// drop to his knees with it (likelier the harder, to `painSure`), for
// `kneelSeconds` and `riseSeconds` back up.
export const WHIP = {
  length: 2.4, links: 16, massKg: 0.28, taper: 0.15, drag: 1.2, passes: 10, tipLinks: 3,
  lashFrom: 14, cutShare: 0.6, painFrom: 5, painSure: 22, kneelSeconds: 1.6, riseSeconds: 0.9,
  // The lash's push: the tip's momentum into the part it strikes, ×`impact` for the rest of the thong that wraps on after
  // it (the whole 0.28 kg at about half the tip's speed: ~9× the tip's 15 g at its own), armour or not; a man braced in a
  // shell takes `braced` m/s of the body's shove off per unit of poise over 1 (only the struck part flinches); and the pain's flinch: from
  // `staggerFrom` of painFrom through the skin he reels (a stagger of `staggerSeverity` + `staggerPerPain` × through/painFrom).
  impact: 9, braced: 0.05, staggerFrom: 0.4, staggerSeverity: 0.72, staggerPerPain: 0.12,
  // A stroke at a man is laid on him (physics/whip.js homeTip): a lorarius's whole craft is putting the fall where he means it,
  // and the thong's own swing is too loose to find a moving man by itself. From `from` s before the arm's drive ends
  // (the snap: the tip turns over just after the hand stops) the tip goes at his mark at no less than `crack` m/s (the middle
  // of a free stroke's tip speeds, 15-50), `through` m past it so its last stretch meets him; the mark held within `taut` of
  // the thong's length from the handle (a thong pulled straight reaches no further). A man drawing out of that through the
  // stroke is stepped after (whipDrive): footwork drive `gain` per m he will be beyond `margin` of that reach at the crack
  // (`ahead` s after the arm's drive, the tip's flight), to `most` (a full step).
  home: { from: 0.06, crack: 30, through: 0.05, taut: 0.97, step: { gain: 3, most: 1, margin: 0.92, ahead: 0.08 } },
};

// Its ball (`projectile`; physics/ballistics.js): ~13 g of lead (~13 mm, between the ashigaru's 3-monme gun, 11 g, and
// the 6-monme, 23 g) at ~390 m/s (the Graz armoury's trials of its 16th-17th c. long guns, Krenn, Kalaus & Hall 1995:
// 400-500 m/s for longer barrels and heavier charges; an arquebus's 300-400): ~1 kJ at the muzzle, falling as it flies
// (the round ball's drag: ~700 J at 30 m, ~340 at 120).
const MATCHLOCK_BALL = { kg: 0.013, velocity: 392, curve: 'sphere' };
export const MATCHLOCK = {
  projectile: MATCHLOCK_BALL,
  energy: muzzleEnergy(MATCHLOCK_BALL),
  // A body hit: past the line that drops a man (1) unless armour proofed against
  // it (tōsei, plate, a SWAT vest) held a good share.
  lethal: { head: 1, torso: 1.35, limb: 0.45 },
  bleed: { head: 0.0024, torso: 0.0032, limb: 0.0016 },
  limbBreak: 0.75,
  impulse: 5.2,
  recoil: 9,
  spread: 0.014,
  movingSpread: 0.035,
  misfire: 0.08,
  reloadSeconds: 15,
  // A bandolier of a dozen wooden charges, each a measure of powder ("the twelve apostles"), a flask for more and a
  // pouch of balls: ~20-30 shots (an ashigaru's cartridge box held about as many). In all, the loaded one counted.
  ammo: 24,
};
// (The Japanese teppō is this gun as listed: well made in the Sakai and Kunitomo workshops, its ball through layered damp
// felt at 80 paces (Song Yingchang's trial, 1593, as quoted secondhand: why the Ming put iron inside their cotton coats).
// Two soaked blankets through at 80 paces, three or four at 50 (经略复国要编, as given by Great Ming Military, "Random
// mythbusting", 2016): at ~120 m (a Ming pace ~1.5 m) this ball still has ~340 J at ~230 m/s, at ~75 m ~470 J (the
// flight, physics/ballistics.js): two thirds of a 9 mm pistol round's muzzle energy in a ball half as wide again, and
// more layers at the nearer distance for its more energy there (2 against 3-4 layers; 340 against 470 J, ×1.4: the
// layers' ×1.5-2 a little steeper: the paces and the blankets are both loose measures). Its fire drilled in volleys is the drill's (formation.js), not the gun's.)

/**
 * The Ming bird gun (鸟铳, niaochong): the same gun, copied from the Japanese and Portuguese matchlocks taken at Shuangyu
 * in 1548 (Zheng Ruozeng, 《筹海图编》; Qi Jiguang, 《纪效新书》: as quoted secondhand), the same bore, ball and charge
 * (`energy` as the matchlock's). But made in the Ming arsenals by unpaid craftsmen to a price: barrels badly bored and
 * badly welded, the ball loose in them, guns that burst, so that the men feared to put their faces to them (Zhao Shizhen,
 * 《神器谱》, 1598, as quoted in Andrade, *The Gunpowder Age*, 2016): wider in its shot (`spread` 0.018, the teppō's
 * 0.014: a loose ball leaves the muzzle off the line by its windage) and failing to fire half as often again (`misfire`
 * 0.12, the teppō's 0.08). The weapon's make for the Ming men (WEAPONS.matchlock `makes`).
 */
export const NIAOCHONG = { ...MATCHLOCK, spread: 0.018, misfire: 0.12 };

/**
 * The san yan chong (三眼銃, "three-eyed gun"): three short iron barrels in
 * a triangle on the end of a wooden shaft, each with its own touch-hole, lit
 * one after another for a quick volley (`barrels`, `between` s apart). Short
 * barrels and a small charge: a lighter, slower ball than a matchlock's
 * (~350 J) that scatters (`spread`). Ming border troops did not reload it in
 * the press of a fight: they swung it as a club, the iron barrels its head.
 * Dimensions are estimates (the sources give none): ~1.3 m, ~4 kg.
 * Cheap, short and inaccurate: no sights, fired from the hip or under the arm, the shot not aimed (Qi Jiguang's complaint
 * of the northern troops' fast guns, 快枪, in 《练兵实纪》, as quoted secondhand), a wide `spread` (0.05, the matchlock's
 * 0.014); its iron touch-holes lit by hand from a slow match, so one in eight fails (`misfire`).
 */
const THREE_EYED_BALL = { kg: 0.012, velocity: 183, curve: 'sphere' };
export const THREE_EYED = {
  // Its barrels are short (~30 cm, a hand cannon's): the charge burns out of the muzzle before it has driven the ball far, ~200 J
  // (it was 350): proof plate holds it (a plated kit rated past it: physics/ranged.js bulletHit), it bruises and stuns.
  // Its ball (`projectile`): ~12 g of lead (a ~13 mm bore: an estimate, the surviving pieces' bores 12-20 mm) at ~180 m/s
  // (the speed that gives the ~200 J; replica hand cannons of its barrel length chronograph ~150-250 m/s): slow, it keeps
  // its speed better than a matchlock's supersonic ball, but has little to keep (~150 J at 50 m).
  projectile: THREE_EYED_BALL,
  energy: muzzleEnergy(THREE_EYED_BALL),
  lethal: { head: 0.95, torso: 0.6, limb: 0.25 },
  bleed: { head: 0.0016, torso: 0.0024, limb: 0.001 },
  limbBreak: 0.25,
  impulse: 2.2,
  recoil: 5,
  spread: 0.05,
  movingSpread: 0.06,
  misfire: 0.12,
  barrels: 3,
  between: 0.45,
  reloadSeconds: 40,
  // Three loads for its three barrels (in all, nine shots): it was reloaded seldom, and then swung.
  ammo: 9,
};

/**
 * The AR-15: a semi-automatic 5.56 mm carbine. A light, very fast round
 * (~4 g at ~950 m/s, ~1750 J: more than a matchlock ball) that tumbles and
 * fragments in flesh; an optic and a fixed stock make it very accurate.
 * The gas system and buffer spring stretch its small kick over a longer
 * moment (`recoilSeconds`). Thirty rounds a magazine (`rounds`), changed in
 * a couple of seconds.
 */
const M855 = { kg: 0.004, velocity: 935, curve: 'g7', bc: 0.151, calibre: 0.0057 };
export const RIFLE = {
  // Its bullet (`projectile`): the M855's 62 gr (4.0 g) steel-tipped spitzer at ~935 m/s from a carbine's barrel, its
  // ballistic coefficient 0.151 on the G7 curve (the published figure): it keeps most of its energy to 300 m (~800 J).
  projectile: M855,
  energy: muzzleEnergy(M855),
  lethal: { head: 1.2, torso: 1.7, limb: 0.6 },
  bleed: { head: 0.0032, torso: 0.0048, limb: 0.0024 },
  limbBreak: 0.65,
  impulse: 3.8,
  recoil: 5,
  recoilSeconds: 0.06,
  spread: 0.005,
  movingSpread: 0.02,
  misfire: 0.002,
  rounds: 30,
  reloadSeconds: 2.5,
  // The empty magazine dropped and a full one seated from the chest pouch (physics/ranged.js MAGAZINE_CHANGE).
  reload: 'magazine',
  // A soldier's basic load: seven magazines (210 rounds).
  ammo: 210,
  // Fully automatic (the M16/M4 family's select fire): ~12 rounds a second (~720 a minute), in bursts of 3-6.
  automatic: { rate: 12, burst: [3, 6] },
};

/**
 * A 12-gauge pump shotgun with 00 buckshot: nine pellets of ~3.5 g at
 * ~400 m/s (~280 J each, half a 9 mm round), in a pattern that opens about
 * `pellet` rad (~3 cm a metre). Close in nearly all of it lands; at twenty
 * metres much of it misses. A heavy charge and a heavy shot column: a hard
 * kick into the shoulder (`recoil`, N·s) that a light, weak shooter cannot
 * hold. Five shells, each pumped; reloaded one by one.
 */
const BUCKSHOT = { kg: 0.0035, velocity: 400, curve: 'sphere' };
export const SHOTGUN = {
  // Each pellet (`projectile`): a 00 buckshot ball, 3.5 g of lead (8.4 mm) at ~400 m/s: `energy` is a pellet's.
  projectile: BUCKSHOT,
  energy: muzzleEnergy(BUCKSHOT),
  pellets: 9,
  pellet: 0.016,
  lethal: { head: 0.55, torso: 0.26, limb: 0.1 },
  bleed: { head: 0.001, torso: 0.0013, limb: 0.0005 },
  limbBreak: 0.08,
  impulse: 1.4,
  recoil: 16,
  // Taken by the shoulder through the stock's recoil pad, over a longer moment than a bare kick.
  recoilSeconds: 0.05,
  spread: 0.012,
  movingSpread: 0.03,
  misfire: 0.002,
  rounds: 5,
  reloadSeconds: 4,
  // Shell by shell up into the tube under the barrel (physics/ranged.js TUBE_LOAD).
  reload: 'tube',
  // Five in the tube and a bandolier or a sidesaddle of shells: ~30.
  ammo: 30,
};

/**
 * The M2-2 flamethrower (1943-): two ~9 L tanks of thickened fuel and a small
 * one of nitrogen on the back (~32 kg full), a hose to the wand. The trigger
 * opens the valve: a jet of burning fuel, thickened so that it carries as a
 * rope and arcs under gravity to 20-40 m, sticks where it lands and burns on
 * there. About 8 s of fire in all (7-9 s), in bursts of 1-2.5 s. Fired as an
 * automatic gun is (`automatic`): each "round" is a tenth of a second of the
 * valve open (physics/flame.js FLAME: the stream, what it does to a man).
 * Empty, it is let fall and his sidearm drawn (no refilling it in a fight).
 */
export const FLAMER = {
  flame: true,
  rounds: 80,
  ammo: 80,
  reloadSeconds: Infinity,
  automatic: { rate: 10, burst: [10, 25] },
  misfire: 0,
  spread: 0.02,
};

// The combat bot's forearm guns: the AR-15's round and rate, the shotgun's
// buckshot, fed from the body (`rounds` without end: never reloaded).
export const ARM_RIFLE = { ...RIFLE, rounds: Infinity, ammo: Infinity };
export const ARM_SHOTGUN = { ...SHOTGUN, rounds: Infinity, ammo: Infinity };
/**
 * A cartridge's recoil (N·s): the bullet's momentum and its powder gas's (the gas leaves at ~1.7 times the bullet's speed,
 * a rifle's rule of thumb), less what a suppressor catches of the gas (`gasShare`: what gets out through it).
 */
export function cartridgeRecoil({ bulletKg, muzzle, chargeKg, gasSpeed = 1.7, gasShare = 1 }) {
  return bulletKg * muzzle + chargeKg * muzzle * gasSpeed * gasShare;
}
// The SPUR turret's 6.5 Creedmoor, semi-automatic: a 140 gr (9.07 g) bullet at ~813 m/s (3.0 kJ at the muzzle, against the
// AR-15's 1.75) on ~41 gr (2.66 g) of powder, through its suppressor (~3/4 of the gas's push gets out): ~10 N·s of recoil
// (the AR-15's 5.56 ~5). Fired from a rigid, motor-laid mount with a magnified optic, it is more precise than a carbine
// from the shoulder: its round goes ~25% tighter.
const CREEDMOOR = { kg: 0.00907, velocity: 813, curve: 'g7', bc: 0.305, calibre: 0.0067 };
export const TURRET_RIFLE = {
  ...RIFLE, automatic: undefined,
  // Its bullet: the 140 gr match bullet (9.07 g, 6.7 mm), G7 0.305 (the makers' 0.30-0.33).
  projectile: CREEDMOOR,
  energy: muzzleEnergy(CREEDMOOR), rounds: Infinity, ammo: Infinity,
  recoil: cartridgeRecoil({ bulletKg: CREEDMOOR.kg, muzzle: CREEDMOOR.velocity, chargeKg: 0.00266, gasShare: 0.75 }),
  spread: 0.0037, movingSpread: 0.015,
};

/**
 * A bow's cast, from its build (`spec.cast`) and its draw weight (`spec.drawN`, N at full draw), as Klopsteg (1943,
 * "Physics of bows and arrows", Am. J. Phys. 11) and Kooi (1983, On the Mechanics of the Bow and Arrow, Groningen;
 * 1991) treat it:
 * - its power stroke: the draw length less the brace height (`drawLength` − `brace`, m), the way the string pushes the arrow;
 * - what it stores at full draw: `fullness` × drawN × the stroke (the area under the force-draw curve over the rectangle
 *   it fills: ~0.5 for a straight limb whose force rises in line with the draw, ~0.4-0.45 for a wooden self bow that
 *   stacks a little late, more for a reflexed composite whose force comes up early and whose siyahs ease it at the end);
 * - what reaches the arrow: `kept` (what the limbs' internal friction, their hysteresis, leaves: Baugh's and Kooi's
 *   models both miss measured speeds without it) × m/(m + `virtualKg`): the limbs and string must be moved too, and
 *   their effective (virtual) mass takes its share of the energy (Kooi's virtual mass). A heavy-limbed bow wastes the
 *   more on a light arrow, so it was shot with a heavy one;
 * - the arrow's speed: v = √(2E/m), of `arrowKg`.
 * `share`: of the full draw's energy (a man too weak to draw it full: handling.js drawEnergy); `arrowKg`: another arrow.
 * Returns { stroke, stored, efficiency, joules, kg, speed }.
 */
export function bowCast(spec, share = 1, arrowKg = spec?.cast?.arrowKg) {
  const cast = spec?.cast;
  if (!cast) {
    // A bow with no build given: the reference war arrow (ARROW) at its speed, by the share of the draw.
    const kg = (2 * ARROW.joules) / ARROW.speed ** 2;
    return { stroke: 0, stored: ARROW.joules, efficiency: 1, joules: ARROW.joules * share, kg, speed: ARROW.speed * Math.sqrt(share) };
  }
  const stroke = cast.drawLength - cast.brace;
  const stored = cast.fullness * spec.drawN * stroke;
  const efficiency = (cast.kept * arrowKg) / (arrowKg + cast.virtualKg);
  const joules = stored * efficiency * share;
  return { stroke, stored, efficiency, joules, kg: arrowKg, speed: Math.sqrt((2 * joules) / arrowKg) };
}

// `art`: the weapon art (moves.js, weaponarts.js) its family is made for, the move the player can make with it once his
// blood is up: the katana's and ōdachi's draw-cut (iai), the long sword's pommel strike, the jian's, dao's and kilij's drawing cut,
// the polearm's wheel, the hammer's and kanabo's charged blow (a mace's, one-handed), the two-handed spear's step back and lunge (a spear in one hand, a shield on the other arm, cannot make it). No
// gun or bow has one. It names the family too: the family's other arts, made when the situation asks for them, are
// weaponarts.js ARTS.choices'.
export const WEAPONS = {
  // A side-handle-less straight police baton: hard, heavy at the tip.
  baton: {
    art: 'artCrushOne',
    label: 'Police baton', hands: 'one', length: 0.58, strikeFrom: 0.12, handle: 0.08, mass: 0.6, balance: 0.24, radius: 0.019,
    harm: { swing: { blunt: 1 }, thrust: { blunt: 1 } },
    contactSeconds: 0.005, rotation: 1.15, wrist: { omega: 62, zeta: 0.6 }, threat: 1.6,
  },
  // Hand-and-a-half: two hands for the big swings, one for the lunge.
  longsword: {
    label: 'Long sword', hands: 'hybrid', length: 0.98, strikeFrom: 0.14, handle: 0.24, spacing: 0.15, mass: 1.45, balance: 0.11, radius: 0.012,
    harm: { swing: { cut: 1, blunt: 0.5 }, thrust: { pierce: 1, cut: 0.15, blunt: 0.15 } },
    contactSeconds: 0.004, rotation: 0.8, wrist: { omega: 17, zeta: 0.8 }, threat: 4, art: 'artPommel',
  },
  // Two hands always: the sharper, shorter blade cuts deeper, stabs less. Its sori a shallow 2 cm (`curve`: BLADES.slice),
  // the ōdachi's 3, the wakizashi's a little over 1.
  katana: {
    label: 'Katana', hands: 'two', length: 0.8, strikeFrom: 0.12, handle: 0.27, spacing: 0.17, mass: 1.15, balance: 0.12, radius: 0.012, curve: 0.02,
    harm: { swing: { cut: 1.3, blunt: 0.4 }, thrust: { pierce: 0.7, cut: 0.15, blunt: 0.15 } },
    contactSeconds: 0.004, rotation: 0.8, wrist: { omega: 20, zeta: 0.8 }, threat: 4.5, art: 'artIai',
  },
  knife: {
    art: 'artFleche',
    label: 'Knife', hands: 'one', length: 0.21, strikeFrom: 0.05, handle: 0.1, mass: 0.22, balance: 0, radius: 0.01,
    harm: { thrust: { pierce: 0.65, blunt: 0.35 }, swing: { cut: 0.42, blunt: 0.22 } },
    contactSeconds: 0.005, rotation: 0.6, wrist: { omega: 45, zeta: 0.8 }, threat: 2.2,
  },
  // The hoplomachus's hasta: held near its balance in one hand, long ahead
  // of the hand and a good way behind it; made to thrust.
  // (`pointWidth` 0.04: a leaf-shaped head ~4 cm across; PUNCTURE.)
  spear: {
    art: 'artSpear',
    pointFrom: 0, label: 'Spear', hands: 'one', length: 1.3, strikeFrom: 0.9, handle: 0.6, mass: 1.6, balance: 0.18, radius: 0.016, pointWidth: 0.04,
    harm: { thrust: { pierce: 1.3, cut: 0.1, blunt: 0.2 }, swing: { cut: 0.2, blunt: 0.6 } },
    contactSeconds: 0.005, rotation: 0.5, wrist: { omega: 14, zeta: 0.85 }, threat: 3.5,
  },
  // Polearms, two hands well apart on the shaft. `crush`: the share of
  // blunt armour a hard, heavy head drives straight through (the hammer's
  // blow is felt through plate); `grip`: how firmly the weapon is held
  // against blows (a long spear, levered from the hands, is easiest lost).
  // (`pointWidth` 0.015: the top spike, ~1.5 cm; PUNCTURE.)
  warhammer: {
    label: 'War hammer', hands: 'two', length: 1.45, strikeFrom: 1.15, handle: 0.55, spacing: 0.42, leadAhead: true, mass: 3.4, balance: 0.85, radius: 0.04, pointWidth: 0.015,
    // (Its haft: ~3.5 cm of ash under the langets, not the head's 8 cm: what snaps, physics/wear.js.) The langets: the steel
    // straps riveted down the haft from the head (`langets`, m), ~30-50 cm on surviving 15th-c. pollaxes, bec de corbins
    // and Lucerne hammers, there to keep an edge off the wood below the head; they also stiffen it, so a thrust bows only
    // the ~0.8 m of bare wood from the front hand to their foot (WORLD.wear.column: Euler's ~15 kN, not a war spear's ~4).
    build: { shaftRadius: 0.018, langets: 0.35 },
    // Its head is a hammer face with a beak behind it (the bec de corbin): a swing lands one or the other, the beak a spike
    // that goes into plate where an edge skids (pierce). The face is small and hard on a long lever: most of its blow is felt
    // through plate, which dents and passes it on rather than spreading it (`crush` 0.7; was 0.45, as a mace's flanges).
    // The top spike (the last fifth of the head, BLADES.pointShare) is a 14 cm square point: thrust, it goes in as a
    // dagger's does (`pierce` 0.8, the dagger's; was 0.35), the heavy head behind it (`blunt` 1).
    harm: { swing: { blunt: 1.6, pierce: 0.4 }, thrust: { blunt: 1, pierce: 0.8 } },
    contactSeconds: 0.004, rotation: 1.2, wrist: { omega: 11, zeta: 0.8 }, threat: 4, art: 'artCrush', crush: 0.7,
    // (Its striking `face`, m: the hammer's face, some 4 cm square, not the head's whole 8 cm; physics.js contactStress.)
    face: 0.02,
    // Swung beak first (a weapon art's, moves.js artBeak): the curved spike behind the face leads, a point square to the haft
    // with the whole head behind it — it goes into plate where it meets it near square (BLADES.bite), as a thrust's point does.
    beak: { pierce: 1, blunt: 0.5 },
  },
  naginata: {
    label: 'Naginata', hands: 'two', length: 1.5, strikeFrom: 1.0, handle: 0.5, spacing: 0.4, leadAhead: true, edgeLeads: true, mass: 2.35, balance: 0.55, radius: 0.014,
    // A heavy head on a long shaft (+25% weight, +25% blunt): it knocks men about as it cuts.
    harm: { swing: { cut: 1.3, blunt: 0.625 }, thrust: { pierce: 0.75, cut: 0.15, blunt: 0.25 } },
    contactSeconds: 0.004, rotation: 0.8, wrist: { omega: 14, zeta: 0.8 }, threat: 4.5, art: 'artWheel',
    // Its oak haft, oval ~3.5 × 2.8 cm (a round one of ~3.2 cm), not the blade's `radius`: what snaps, physics/wear.js.
    build: { shaftRadius: 0.016 },
  },
  // The war spear: a stout ash shaft and a long socketed iron head, ~2.3 kg;
  // its weight behind a narrow point drives the thrust deep.
  // (`pointWidth` 0.04: a leaf-shaped head ~4 cm across; PUNCTURE.)
  longSpear: {
    pointFrom: 0, label: 'Spear', hands: 'two', length: 1.75, strikeFrom: 1.45, handle: 0.5, spacing: 0.45, leadAhead: true, mass: 2.3, balance: 0.6, radius: 0.018, pointWidth: 0.04,
    harm: { thrust: { pierce: 1.5, blunt: 0.3, cut: 0.15 }, swing: { blunt: 0.65, cut: 0.2 } },
    contactSeconds: 0.005, rotation: 0.5, wrist: { omega: 13, zeta: 0.85 }, threat: 3.8, art: 'artSpear', grip: 0.5,
  },
  // The war lance taken up on foot: an ash shaft of ~3.3 m, swelling at the
  // grip and tapering to a socketed steel war point (not the jousting
  // coronel's three blunt tines: on foot and to the death, the sharp head of
  // the Rennen and the field). ~5.2 kg: ~4.4 kg of ash (a war lance, not the
  // 10–14 kg hollowed jousting lance no man wields off a horse) and ~0.8 kg
  // of vamplate (the steel cone over the grip that guards the hand): twice
  // any spear here. The point is the last ~0.25 m (`pointFrom`); the shaft
  // before it, met by a man who has come inside the point, only shoves. Held at the
  // grip behind the vamplate, the other hand back on the butt (`hands` two,
  // the second behind); its balance a hand's breadth ahead of the grip, as a
  // lance is made. Driven, not swung: a narrow four-sided war point, a
  // little keener than a spear's leaf per joule (`pierce`; the man's weight
  // behind it is in the blow's mass, not here, so not counted twice); its narrow head has next to
  // no edge; swung, the heavy shaft clubs (`swing` blunt). Slow to turn (`wrist`). The swell and the burr behind the grip
  // hold it in the hand against a blow on the long shaft (`grip`) better than a spear.
  // (`pointWidth` 0.025: a war lance's narrow socketed head, ~2.5 cm; PUNCTURE.)
  lance: {
    art: 'artSpear',
    pointFrom: 0.78, label: 'Lance', hands: 'two', length: 2.45, strikeFrom: 1.3, handle: 0.85, spacing: 0.45, mass: 5.2, balance: 0.18, radius: 0.026, pointWidth: 0.025, vamplate: 0.13,
    harm: { thrust: { pierce: 1.6, blunt: 0.35, cut: 0.02 }, swing: { blunt: 0.9 } },
    contactSeconds: 0.005, rotation: 0.4, wrist: { omega: 7, zeta: 0.9 }, threat: 4, grip: 0.8,
    // The ash shaft breaks only on heavy armour (physics.js shattersOn): its point met by armour proof against it to `pierce`
    // or more (plate 0.85–0.95, heavy lamellar 0.72–0.8; mail alone ~0.6, a brigandine, leather and cloth less), with `joules`
    // or more taken up (a couched charge from the saddle: 500–2,000 J; on foot at a run, 40–160 J: it never breaks a lance).
    // Anything else (flesh, light armour, a shield) it goes into or skids off whole, and is kept, its jar taken up along the
    // shaft by the rest and the arm (no grip strain), to be couched again.
    shatters: { pierce: 0.7, joules: 250 },
  },
  // The banners' heavy spear (长枪, the Qing's qiang; the Bayara's, Nurhaci's guard's at Sarhu, 1619), between the war spear
  // (`longSpear`) and the knight's lance: a horseman's spear fought as well on foot. A shaft of white-wax wood (白蜡杆,
  // Chinese ash grown slow and straight, the wood the Chinese preferred for spear shafts because it bends far and springs
  // back where a stiffer ash snaps) ~2.9 m overall, thicker than a foot spear's, with an iron butt cap; on it a long
  // narrow iron head on a long socket, ~0.45 m of iron in all (a foot spear's leaf and socket ~0.25; the Qing
  // regulations' cavalry spear heads, and those of the Shenyang palace collection, a chi and more), a tuft of red horsehair
  // at its foot. ~3.4 kg: a kilo over the war spear's 2.3, under the lance's 5.2 (no vamplate, a shaft not swelled for the
  // couch). Held as the lance is, the rear hand back by the butt (`hands` two, `handle` behind the front hand), couched
  // under the arm from the saddle or levelled on foot. Its point: the long head is all point, narrow and four-sided at the
  // tip, keener per joule than the war spear's leaf (`pierce` 1.6, the lance's narrow war point's, over the spear's 1.5;
  // the weight behind it is in the blow's mass, not here); its long edges cut a little when swung. Its grip between the
  // spear's and the lance's (`grip`); slower to turn than the spear, quicker than the lance (`wrist`).
  // It breaks less easily than the lance (`shatters`): its springy shaft, shorter and unhollowed, takes up a charge's jar
  // by bending, and snaps only on armour a point cannot go into at all (plate, `pierce` 0.85 and over: not on the heaviest
  // lamellar, 0.72-0.8, or on mail) and only under a full charge's blow (`joules` 500: a gallop's couched point, 500-2,000
  // J, not a trot's or anything on foot). A foot spear never breaks.
  // (`pointWidth` 0.03: a narrow leaf head ~3 cm; PUNCTURE.)
  manchuLance: {
    pointFrom: 0, label: 'Heavy spear', hands: 'two', length: 2.05, strikeFrom: 1.6, handle: 0.85, spacing: 0.45, mass: 3.4, balance: 0.5, radius: 0.021, pointWidth: 0.03,
    harm: { thrust: { pierce: 1.6, blunt: 0.3, cut: 0.15 }, swing: { blunt: 0.75, cut: 0.25 } },
    contactSeconds: 0.005, rotation: 0.45, wrist: { omega: 10, zeta: 0.88 }, threat: 4, art: 'artSpear', grip: 0.7,
    // The iron head's length along the shaft (m), as drawn (weaponview.js) and struck: `strikeFrom` to the tip.
    head: 0.45,
    shatters: { pierce: 0.85, joules: 500 },
    // Its white-wax wood shaft bends and springs back (MATERIALS.waxwood).
    build: { shaft: 'waxwood' },
  },
  // The yari, as the ashigaru carried it: the war spear's long straight head
  // with a cross blade (jūmonji) below the point. The side blades cut and
  // hook a little better; the slimmer head knocks a man about a little less.
  // (`pointWidth` 0.022: the sankaku yari's narrow three-sided head, ~2 cm; PUNCTURE.)
  yari: {
    pointFrom: 0, label: 'Yari', hands: 'two', length: 1.75, strikeFrom: 1.45, handle: 0.5, spacing: 0.45, leadAhead: true, mass: 2.3, balance: 0.6, radius: 0.018, pointWidth: 0.022,
    harm: { thrust: { pierce: 1.5, blunt: 0.22, cut: 0.3 }, swing: { blunt: 0.5, cut: 0.4 } },
    contactSeconds: 0.005, rotation: 0.5, wrist: { omega: 13, zeta: 0.85 }, threat: 3.9, art: 'artSpear', grip: 0.5,
  },
  // The langxian (wolf-brush) of Qi Jiguang's mandarin-duck squad (Jixiao
  // xinshu): a whole bamboo of about 1 zhang 5 chi (some 4.7 m), its side
  // branches left on in tiers along the upper part and their ends hardened,
  // a small iron spearhead at the top; about 7 jin (~4 kg). Held near the
  // butt in two hands (`handle` behind the front hand), its balance far out
  // ahead of them, slow to turn. The branches make a brush some 0.3 m
  // across along its upper part (`radius`): a sword cut meets bamboo,
  // not the man behind it, and he cannot step through it to the bearer;
  // swept across, it lashes (`swing`, little harm); the iron head is
  // driven at the face (`thrust`, the last fifth: `pointFrom`).
  // (`pointWidth` 0.03: its spear tip among the branches, ~3 cm; PUNCTURE.)
  langxian: {
    art: 'artSpear',
    pointFrom: 0.8, label: 'Langxian', hands: 'two', length: 3.3, strikeFrom: 1.3, handle: 1.4, spacing: 0.55, mass: 4, balance: 0.9, radius: 0.15, pointWidth: 0.03,
    harm: { thrust: { pierce: 1, blunt: 0.35, cut: 0.05 }, swing: { blunt: 0.45, cut: 0.05 } },
    contactSeconds: 0.008, rotation: 0.45, wrist: { omega: 6, zeta: 0.9 }, threat: 3.4, grip: 0.6,
    // Where its branches are, m out from the front hand: from a little past the hands to just short of the iron head.
    // A blade that comes in among them may be caught there (physics/brush.js).
    brush: { from: 1.2, to: 3.0 },
    // A whole bamboo some 5 cm through at the butt (not its 0.3 m brush of branches): MATERIALS.bamboo.
    build: { shaft: 'bamboo', shaftRadius: 0.025 },
  },
  // A hay fork taken up by a rebel: two long wooden-shafted iron tines, not
  // made to fight. Blunt tines that pierce poorly and knock a man about;
  // a farm tool held loosely, easily knocked from the hands.
  // (`pointWidth` 0.012: a tine; PUNCTURE.)
  pitchfork: {
    art: 'artSpear',
    pointFrom: 0, label: 'Pitchfork', hands: 'two', length: 1.6, strikeFrom: 1.3, handle: 0.5, spacing: 0.45, leadAhead: true, mass: 1.8, balance: 0.5, radius: 0.017, pointWidth: 0.012,
    harm: { thrust: { pierce: 0.85, blunt: 0.45, cut: 0.03 }, swing: { blunt: 0.7, cut: 0.05 } },
    contactSeconds: 0.006, rotation: 0.5, wrist: { omega: 13, zeta: 0.85 }, threat: 3, grip: 0.3,
  },
  // A modern 9 mm service pistol: fired, not swung (`ranged`; see GUN). In
  // the hand a small light thing, very easily knocked away (`grip`); swung
  // in close, the frame clubs. `edgeUp`: drawn with its sights up.
  pistol: {
    label: 'Pistol', hands: 'one', length: 0.19, strikeFrom: 0.04, handle: 0.05, mass: 0.75, balance: 0.04, radius: 0.018,
    harm: { swing: { blunt: 0.7 }, thrust: { blunt: 0.5 } },
    contactSeconds: 0.004, rotation: 0.6, wrist: { omega: 22, zeta: 0.9 }, threat: 6, grip: 0.12, ranged: true, edgeUp: true,
  },
  // The Adams revolver (ADAMS): an octagonal barrel and solid frame, the
  // five-chambered cylinder, a spurless double-action hammer, a chequered
  // walnut grip. Swung, the butt clubs.
  adams: {
    label: 'Adams revolver', hands: 'one', length: 0.26, strikeFrom: 0.16, handle: 0.07, mass: 1.25, balance: 0.08, radius: 0.016,
    harm: { swing: { blunt: 0.8 }, thrust: { blunt: 0.5 } },
    contactSeconds: 0.004, rotation: 0.6, wrist: { omega: 20, zeta: 0.9 }, threat: 6, grip: 0.15, ranged: true, edgeUp: true,
    muzzle: [0.26, 0.045],
    shot: ADAMS,
  },
  // The whip (WHIP): the handle is what the hand holds and moves; the thong
  // is a rope hung from its end, and only its tip strikes (`rope`). `reach`:
  // how far it strikes, beyond the handle's own length.
  whip: {
    art: 'artCrushOne',
    label: 'Whip', hands: 'one', length: 0.3, strikeFrom: 0.3, handle: 0.05, mass: 0.45, balance: 0.1, radius: 0.012,
    harm: { swing: { blunt: 0.2 }, thrust: { blunt: 0.2 } },
    contactSeconds: 0.004, rotation: 0.6, wrist: { omega: 34, zeta: 0.6 }, threat: 2.6, grip: 0.3,
    rope: WHIP, reach: 0.3 + WHIP.length * 0.85,
  },
  // A matchlock (the Japanese teppō, the European arquebus): a smoothbore
  // long gun fired by a lit match, the stock to the cheek, the support hand
  // ahead under the barrel (`supportAhead`). One heavy lead ball (`shot`),
  // then a long reload; swung in close, the stock clubs. `length` runs to
  // the muzzle, `handle` back to the butt.
  matchlock: {
    label: 'Matchlock', hands: 'two', length: 1.0, strikeFrom: 0.2, handle: 0.32, spacing: 0.42, supportAhead: true, longGun: true,
    mass: 3.8, balance: 0.3, radius: 0.02,
    harm: { swing: { blunt: 1 }, thrust: { blunt: 0.7 } },
    contactSeconds: 0.005, rotation: 0.5, wrist: { omega: 11, zeta: 0.9 }, threat: 5, grip: 0.7, ranged: true, edgeUp: true,
    // The muzzle from the trigger hand (along the barrel, above it), m.
    muzzle: [1.0, 0.02],
    shot: MATCHLOCK,
    // As each people made it (physics.js madeSpec, by his kit's faction): the Ming arsenals' bird gun (NIAOCHONG).
    makes: { chinese: { shot: NIAOCHONG } },
  },
  // The three-eyed gun (see THREE_EYED): fired from the hip with the shaft
  // under the arm; empty, a club with an iron head (`crush`: the barrels'
  // mass drives through armour as a mace's does).
  threeEyed: {
    label: 'Three-eyed gun', hands: 'two', length: 0.95, strikeFrom: 0.55, handle: 0.35, spacing: 0.4, supportAhead: true, longGun: true,
    mass: 4.0, balance: 0.62, radius: 0.04,
    harm: { swing: { blunt: 1.3 }, thrust: { blunt: 0.6 } },
    contactSeconds: 0.004, rotation: 1.2, wrist: { omega: 9, zeta: 0.85 }, threat: 4.6, grip: 0.7, ranged: true, edgeUp: true, crush: 0.4,
    muzzle: [0.95, 0],
    shot: THREE_EYED,
  },
  // The crossbow: a stock (tiller) held to the cheek, the prod across its
  // nose, a stirrup to span it by; swung in close, the tiller clubs.
  crossbow: {
    label: 'Crossbow', hands: 'two', length: 0.72, strikeFrom: 0.3, handle: 0.22, spacing: 0.36, supportAhead: true, longGun: true,
    mass: 4.2, balance: 0.35, radius: 0.025,
    harm: { swing: { blunt: 0.9 }, thrust: { blunt: 0.6 } },
    contactSeconds: 0.005, rotation: 0.5, wrist: { omega: 11, zeta: 0.9 }, threat: 4.6, grip: 0.7, ranged: true, edgeUp: true,
    muzzle: [0.66, 0.05],
    shot: CROSSBOW,
  },
  // The Chinese crossbow (nu): a wooden stock, a bronze trigger lock, a
  // long composite prod; lighter than the steel crossbow.
  nu: {
    label: 'Crossbow (nu)', hands: 'two', length: 0.7, strikeFrom: 0.3, handle: 0.18, spacing: 0.34, supportAhead: true, longGun: true,
    mass: 3.0, balance: 0.35, radius: 0.022,
    harm: { swing: { blunt: 0.8 }, thrust: { blunt: 0.5 } },
    contactSeconds: 0.005, rotation: 0.5, wrist: { omega: 12, zeta: 0.9 }, threat: 4.4, grip: 0.7, ranged: true, edgeUp: true,
    muzzle: [0.64, 0.05],
    shot: NU,
  },
  // The AR-15 carbine and the pump shotgun: shouldered long guns, the
  // support hand on the handguard or the pump; swung in close, the stock.
  rifle: {
    label: 'AR-15', hands: 'two', length: 0.62, strikeFrom: 0.2, handle: 0.24, spacing: 0.36, supportAhead: true, longGun: true,
    mass: 3.0, balance: 0.2, radius: 0.025,
    harm: { swing: { blunt: 0.9 }, thrust: { blunt: 0.7 } },
    contactSeconds: 0.005, rotation: 0.5, wrist: { omega: 12, zeta: 0.9 }, threat: 7, grip: 0.7, ranged: true, edgeUp: true,
    muzzle: [0.6, 0.06],
    shot: RIFLE,
  },
  shotgun: {
    label: 'Shotgun', hands: 'two', length: 0.72, strikeFrom: 0.2, handle: 0.3, spacing: 0.4, supportAhead: true, longGun: true,
    mass: 3.6, balance: 0.25, radius: 0.024,
    harm: { swing: { blunt: 1 }, thrust: { blunt: 0.7 } },
    contactSeconds: 0.005, rotation: 0.5, wrist: { omega: 11, zeta: 0.9 }, threat: 6.5, grip: 0.7, ranged: true, edgeUp: true,
    muzzle: [0.72, 0.03],
    shot: SHOTGUN,
  },
  // The flamethrower's wand (the tanks on his back are his kit's weight: physics/flame.js withTanks); swung, a steel tube. On its
  // hose to the tanks (`tethered`): never knocked away or shaken loose, let go only when he means to.
  flamethrower: {
    label: 'Flamethrower', hands: 'two', length: 0.8, strikeFrom: 0.3, handle: 0.2, spacing: 0.42, supportAhead: true, longGun: true, tethered: true,
    mass: 4.5, balance: 0.35, radius: 0.028,
    harm: { swing: { blunt: 0.8 }, thrust: { blunt: 0.6 } },
    contactSeconds: 0.005, rotation: 0.5, wrist: { omega: 10, zeta: 0.9 }, threat: 8, grip: 0.7, ranged: true, edgeUp: true,
    muzzle: [0.8, 0],
    shot: FLAMER,
  },
  // Forearm weapons (`mounted`): built into an arm (`hand`), no grip to
  // lose (never dropped or knocked away), their weight the body's own. Each
  // fires and strikes. The right: an AR-15's barrel (ARM_RIFLE) along the
  // forearm, a heavy blade under it running past the muzzle, a short sword
  // twice a sword's weight that cuts deeper. The left: a shotgun's barrel
  // (ARM_SHOTGUN) in a thick steel housing, its flanged muzzle a mace's
  // head, as the emptied three-eyed gun is swung (its blunt harm and crush).
  // (`pointWidth` 0.025: the blade's point, ~2.5 cm; PUNCTURE.)
  armRifle: {
    label: 'Arm rifle and blade', hands: 'one', hand: 'r', mounted: true, length: 0.55, strikeFrom: 0.18, handle: 0.02, mass: 2.6, balance: 0.22, radius: 0.026, pointWidth: 0.025,
    harm: { swing: { cut: 1.25, blunt: 0.5 }, thrust: { pierce: 1.05, cut: 0.2, blunt: 0.25 } },
    contactSeconds: 0.004, rotation: 0.75, wrist: { omega: 18, zeta: 0.8 }, threat: 7, ranged: true,
    muzzle: [0.34, 0.03],
    shot: ARM_RIFLE,
  },
  // SWORD Defense's SPUR, the rifle turret shown on Ghost Robotics' Vision 60: a 6.5 Creedmoor
  // (~9 g at ~820 m/s, ~3.0 kJ: TURRET_RIFLE) on a pan-and-tilt mount on the robot's back, fired one round at a time.
  // Drawn and aimed as the combat bot's forearm rifle (`mounted`); never dropped; its ten-round box not counted (fudged).
  // Laid by its pan-and-tilt motors (`turret`: physics/mounted.js stepTurret), not a wrist: the trunnion `height` m over the
  // robot's back, the receiver `grip` m ahead of it; at rest level (`rest` rad); its stops `pan` rad either way and `tilt`
  // [down, up]; its motors slew it at most `slew` rad/s (~100°/s, as a light remote weapon station's), accelerating it
  // `accel` rad/s², laying it at `servo` /s of its error and leading by how fast the line to the mark moves (smoothed over
  // `lead` s: a stabilised mount); the gun gives on its cradle (`mount`: Hz, damping), the bore `bore` m above the trunnion,
  // the gun and cradle `inertia` kg·m² about it (4 kg over ~0.9 m, and the cradle); its fire control looses only once the
  // barrel lies within `lay` rad of the mark (~1 cm a metre), and its gunner (ai.js gunfight) asks for a shot only once it
  // is within `ready` rad.
  turretRifle: {
    label: 'SPUR rifle turret', hands: 'one', hand: 'r', mounted: true, length: 0.7, strikeFrom: 0.18, handle: 0.02, mass: 4, balance: 0.3, radius: 0.03,
    harm: { swing: { blunt: 0.5 }, thrust: { blunt: 0.3 } },
    contactSeconds: 0.004, rotation: 0.75, wrist: { omega: 14, zeta: 0.85 }, threat: 7, ranged: true,
    muzzle: [0.6, 0.03],
    turret: { height: 0.12, grip: 0.05, rest: -0.05, pan: 2.6, tilt: [-0.35, 1.05], slew: 1.75, accel: 20, servo: 10, lead: 0.05, mount: { hz: 9, zeta: 0.35 }, bore: 0.04, inertia: 0.3, lay: 0.01, ready: 0.15 },
    shot: TURRET_RIFLE,
  },
  armShotgun: {
    label: 'Arm shotgun and mace', hands: 'one', hand: 'l', mounted: true, length: 0.42, strikeFrom: 0.16, handle: 0.02, mass: 4.0, balance: 0.3, radius: 0.05,
    harm: { swing: { blunt: 1.3 }, thrust: { blunt: 0.6 } },
    contactSeconds: 0.004, rotation: 1.2, wrist: { omega: 11, zeta: 0.85 }, threat: 6.5, ranged: true, crush: 0.4,
    muzzle: [0.42, 0],
    shot: ARM_SHOTGUN,
  },
  // A long wooden staff (the Shaolin gun): held near its middle, both ends
  // striking (`strikeFrom` reaches back past the hands to the butt). Wood
  // only: blunt harm, a softer contact than steel; its length makes it quick
  // at the ends, a little more than a baton.
  staff: {
    art: 'artCrushClub',
    label: 'Staff', hands: 'two', length: 0.95, strikeFrom: -0.85, handle: 0.85, spacing: 0.5, leadAhead: true, mass: 1.6, balance: 0.05, radius: 0.016,
    harm: { swing: { blunt: 1 }, thrust: { blunt: 0.8 } },
    contactSeconds: 0.007, rotation: 0.9, wrist: { omega: 18, zeta: 0.8 }, threat: 3.8, grip: 0.6,
  },
  // The Spanish espada: a one-handed cut-and-thrust sword of Toledo steel,
  // a little longer than a short sword, made for the thrust.
  espada: {
    art: 'artDrawCut',
    label: 'Espada', hands: 'one', length: 0.85, strikeFrom: 0.12, handle: 0.14, mass: 1.1, balance: 0.12, radius: 0.011,
    harm: { thrust: { pierce: 0.95, cut: 0.2, blunt: 0.1 }, swing: { cut: 0.9, blunt: 0.35 } },
    contactSeconds: 0.004, rotation: 0.7, wrist: { omega: 24, zeta: 0.8 }, threat: 3.4,
  },
  // The rapier: a long, slender thrusting sword with a swept hilt. Its point
  // is everything (`pierce`); its narrow edge cuts a little, it barely bruises.
  rapier: {
    art: 'artFleche',
    label: 'Rapier', hands: 'one', length: 1.05, strikeFrom: 0.1, handle: 0.14, mass: 1.15, balance: 0.1, radius: 0.008,
    harm: { thrust: { pierce: 1.6, cut: 0.08, blunt: 0.03 }, swing: { cut: 0.4, blunt: 0.05 } },
    contactSeconds: 0.003, rotation: 0.5, wrist: { omega: 26, zeta: 0.8 }, threat: 3.8,
  },
  // The macuahuitl: a flat oak club edged both sides with obsidian blades,
  // about 70 cm. Obsidian is sharper than steel but its flakes are small and
  // set in a groove: they open the skin, not deep into a limb, and snap off
  // as they go (`cut` a little above a sword's, well short of a katana's
  // drawn cut); on steel or hard armour the edge chips away (`brittle`: what
  // is left of its cutting after such a blow). A flake stands a few
  // millimetres proud of the wood, so the cut stops at the bone: it takes
  // a limb off only by a far harder blow than steel needs (`cleave`: the
  // share of the cut that goes on into bone). The thin oak paddle is light
  // and flexes, so it bruises less than a club (`blunt`).
  macuahuitl: {
    art: 'artDrawCut',
    label: 'Macuahuitl', hands: 'one', length: 0.7, strikeFrom: 0.18, handle: 0.16, mass: 1.15, balance: 0.36, radius: 0.028, brittle: 0.55, cleave: 0.4,
    harm: { swing: { cut: 1.0, blunt: 0.4 }, thrust: { blunt: 0.3 } },
    contactSeconds: 0.004, rotation: 0.85, wrist: { omega: 21, zeta: 0.8 }, threat: 3.2,
  },
  // The tepoztopilli: a broad wooden head edged with obsidian flakes on a
  // short shaft, more a thrusting club than a steel spear: the flakes cut
  // shallow and the wooden point goes in less than iron.
  // (`pointWidth` 0.08: a broad wooden head edged in obsidian, ~8 cm; PUNCTURE.)
  tepoztopilli: {
    art: 'artSpear',
    pointFrom: 0, label: 'Tepoztopilli', hands: 'two', length: 1.3, strikeFrom: 0.98, handle: 0.38, spacing: 0.4, leadAhead: true, mass: 1.7, balance: 0.58, radius: 0.02, pointWidth: 0.08, brittle: 0.55, cleave: 0.4,
    harm: { thrust: { pierce: 0.65, cut: 0.3, blunt: 0.15 }, swing: { cut: 0.7, blunt: 0.3 } },
    contactSeconds: 0.005, rotation: 0.6, wrist: { omega: 14, zeta: 0.85 }, threat: 3.4, grip: 0.5,
  },
  // The kanabo: a long oak club shod with iron studs, swung in two hands.
  // Heavy (~5 kg of iron-shod oak), its weight spread along the swelling
  // upper half rather than packed in a head (`balance`). Studded from just
  // above the grip to the end, the whole length strikes (`strikeFrom`): near
  // the hands slower and lighter (the swing's ω × r, effectiveMassAt), so
  // the far half hits hardest by the physics; not a point; no thrust; slow
  // to turn, slow to raise and to recover (WORLD.weapons.heavyFrom). Oak
  // gives more than steel: a longer contact (`contactSeconds`), so a lower
  // peak force for the same blow.
  kanabo: {
    label: 'Kanabo', hands: 'two', length: 1.15, strikeFrom: 0.25, handle: 0.35, spacing: 0.17, mass: 5, balance: 0.68, radius: 0.05,
    harm: { swing: { blunt: 1.4 }, thrust: { blunt: 0.4 } },
    contactSeconds: 0.006, rotation: 1.25, wrist: { omega: 8, zeta: 0.85 }, threat: 4.4, art: 'artCrushClub', crush: 0.5,
  },
  // One-handed maces, the horseman's answer to armour (swords skate off it):
  // a short iron-bound haft and a heavy head, swung with the wrist and arm
  // (lighter and quicker than a two-handed club, so a little less blunt than
  // the kanabo). The Jurchen "wolf-tooth" mace (langya bang) is studded with
  // iron teeth that bite as it crushes; the flanged mace (Mongol, Ottoman
  // shestopyor and bozdoğan) drives its blow into a flange's narrow edge.
  // (`pointWidth` 0.012: an iron tooth; PUNCTURE.)
  langya: {
    label: 'Wolf-tooth mace', hands: 'one', length: 0.72, strikeFrom: 0.46, handle: 0.13, mass: 2.0, balance: 0.68, radius: 0.042, pointWidth: 0.012,
    harm: { swing: { blunt: 1.45, pierce: 0.3 }, thrust: { blunt: 0.4, pierce: 0.15 } },
    contactSeconds: 0.004, rotation: 1.0, wrist: { omega: 12, zeta: 0.85 }, threat: 4, art: 'artCrushOne', crush: 0.45,
    // Its short haft bound in iron: no bare wood to snap.
    build: { shaft: null },
    // The iron-clad head as drawn (weaponview.js), m: ~0.035, a sixth under the 0.042 it strikes with (`radius`, which its
    // teeth stand out to), so the head reads as a sidearm's at the Iron Pagoda's belt and not a club's (the user's call,
    // 2026-11-08). Drawing only: `radius`, `mass` and `balance` stay as they were, so it hits as it did.
    drawnRadius: 0.035,
  },
  flangedMace: {
    label: 'Flanged mace', hands: 'one', length: 0.66, strikeFrom: 0.5, handle: 0.12, mass: 1.6, balance: 0.72, radius: 0.036,
    harm: { swing: { blunt: 1.5 }, thrust: { blunt: 0.35 } },
    contactSeconds: 0.004, rotation: 0.95, wrist: { omega: 14, zeta: 0.85 }, threat: 3.9, art: 'artCrushOne', crush: 0.55,
    // (Its striking `face`, m: a flange's edge, ~5 cm deep and a few mm thick, lands first, not the round of the head.)
    face: 0.02,
    // An iron haft, or one bound in iron strips: no bare wood to snap.
    build: { shaft: null },
  },
  // The Inca champi (the Spaniards' porra): a star-shaped head of cast bronze
  // (or ground stone), five or six points round a hole, on a wooden haft of
  // some 80 cm; the warrior's weapon of the Andes, and what Atahualpa's men
  // were said to carry under their tunics at Cajamarca. Lighter in the head
  // than an iron mace (a bronze star of ~0.6 kg, `mass` with the haft), so
  // less crush against steel; its points bite as it lands (`pierce`).
  champi: {
    art: 'artCrushOne',
    label: 'Champi', hands: 'one', length: 0.74, strikeFrom: 0.62, handle: 0.12, mass: 1.25, balance: 0.74, radius: 0.05,
    harm: { swing: { blunt: 1.3, pierce: 0.25 }, thrust: { blunt: 0.35 } },
    contactSeconds: 0.004, rotation: 0.95, wrist: { omega: 14, zeta: 0.85 }, threat: 3.6, crush: 0.3,
    // A wooden haft ~3 cm through under the star (its `radius` is the star's).
    build: { shaftRadius: 0.015 },
  },
  // The steppe sabre (the Mongol's, the Ming northern horse's): a long,
  // gently curved single edge for the draw cut, its back bowed 6 cm off the
  // line of the grip at the point (`curve`: BLADES.slice, sliceGain). The
  // yatagan, the Janissary's short sword, curves forward instead (the edge on
  // the inside of the curve), its weight out towards the point.
  saber: {
    art: 'artDrawCut',
    label: 'Sabre', hands: 'one', length: 0.82, strikeFrom: 0.12, handle: 0.14, mass: 1.0, balance: 0.13, radius: 0.012, curve: 0.06,
    harm: { swing: { cut: 1.05, blunt: 0.35 }, thrust: { pierce: 0.7, cut: 0.15, blunt: 0.1 } },
    contactSeconds: 0.004, rotation: 0.75, wrist: { omega: 24, zeta: 0.8 }, threat: 3.3,
  },
  // The kılıç (kilij) of the Sultan's men, and the long sabre of the Kipchak steppe before it: longer than the
  // Mongol sabre and far more deeply curved. The Cuman kurgans' sabres run to ~0.9-1 m of blade (the Dnieper and Don
  // finds, 12th-13th c.), and the Ottoman kılıç of the 15th-17th centuries (Topkapı and the Askeri Müze's; the Met's
  // 36.25.1293) to ~0.75-0.9 m, bowed 8-12 cm off the line of the grip, its last third widened into the yelman, a
  // false edge on the back that puts its weight out towards the point: here 0.9 m, 12 cm of curve (`curve`, twice the Mongol
  // sabre's), ~1.2 kg
  // balanced further out than the sabre (`balance`), so a little slower in the wrist. The curve presents the edge
  // leaning back along the line of the cut, so it slides as it goes in and draws a long cut (BLADES.slice): most from the
  // saddle, the horse carrying the hand past the man. It takes the point off the line of a thrust (`pierce` less than
  // the sabre's); the yelman's back edge cuts on the backhand as well.
  kilij: {
    label: 'Kilij', hands: 'one', length: 0.9, strikeFrom: 0.12, handle: 0.14, mass: 1.2, balance: 0.18, radius: 0.012, curve: 0.12,
    harm: { swing: { cut: 1.05, blunt: 0.38 }, thrust: { pierce: 0.6, cut: 0.15, blunt: 0.1 } },
    contactSeconds: 0.004, rotation: 0.78, wrist: { omega: 21, zeta: 0.8 }, threat: 3.4,
    // Its art the drawing cut (the dao's and the jian's, `artDrawCut`): the hilt pulled back through the cut, so the curve
    // slides the edge along the wound instead of against the push of an arm straightening into a plain cut.
    art: 'artDrawCut',
  },
  yatagan: {
    art: 'artDrawCut',
    label: 'Yatagan', hands: 'one', length: 0.64, strikeFrom: 0.1, handle: 0.13, mass: 0.85, balance: 0.16, radius: 0.012, curve: -0.04,
    harm: { swing: { cut: 1.05, blunt: 0.3 }, thrust: { pierce: 0.8, cut: 0.15, blunt: 0.1 } },
    contactSeconds: 0.004, rotation: 0.7, wrist: { omega: 25, zeta: 0.8 }, threat: 3.2,
  },
  // A bow (`bow`): held in the left hand (`hand`), the stave running
  // `length` up and `handle` down from the grip. It looses arrows (ARROW);
  // there is no edge to strike with. What it casts is its build's (`cast`, bowCast): the draw length and the brace
  // height (m: the power stroke between them), the draw curve's `fullness`, the share the limbs' hysteresis leaves
  // (`kept`), the limbs' and string's virtual mass and the arrow's (kg). Values marked "estimate" are judgements
  // within the period's range where no measurement was found.
  //
  // The plain wooden war bow: a self bow of elm, ash or yew of a common man (the levy's, the townsman's, the Scots'
  // and the rebels' of 1381), ~80 lbf (360 N) at a 28 in (0.71 m) draw, braced at ~6 in (0.15 m): lighter than a
  // picked longbowman's and drawn shorter. A straight limb that stacks a little late (`fullness` 0.45, Klopsteg's
  // self bows ~0.4-0.5); a wooden limb's hysteresis as the longbow's (`kept` 0.85, below); lighter limbs (`virtualKg`
  // ~15 g: an estimate; self bows of ~70 lb are put at ~13 g by bowyers' chronograph work) and a ~60 g arrow (an
  // estimate). It stores ~91 J and gives ~62 J to the arrow at ~45 m/s (~149 fps).
  bow: {
    label: 'Bow', hands: 'one', hand: 'l', length: 0.95, strikeFrom: 0.95, handle: 0.85, mass: 0.6, balance: 0, radius: 0.014,
    harm: { swing: { blunt: 0.3 }, thrust: { blunt: 0.2 } },
    contactSeconds: 0.006, rotation: 0.5, wrist: { omega: 14, zeta: 0.9 }, threat: 3.5, grip: 0.4, ranged: true, bow: true,
    drawN: 360,
    cast: { drawLength: 0.71, brace: 0.15, fullness: 0.45, kept: 0.85, virtualKg: 0.015, arrowKg: 0.06 },
    // The arrows a foot archer carries (`ammo`, a kit's `quiver` before it): a sheaf of 24 and a second in the belt, 36.
    ammo: 36,
  },
  // The steppe composite bow (Mongol, Xiongnu, Hun, Parthian, Cuman; the Ottoman war bow too, below): short and sharply
  // reflexed, horn on the belly, sinew on the back, light working limbs with short stiff ears. 80-130 lbf; here ~90 lbf
  // (400 N), a common horse archer's (the game's men who shoot it pull more: handling.js), drawn with the thumb ring to
  // the ear, ~30 in (0.76 m), braced ~6.3 in (0.16 m). The reflex brings its force up early and the ears ease it at the
  // end: the fullest draw curve of these (`fullness` 0.6, an estimate from Klopsteg's force-draw curves of Turkish
  // bows, 1934, Turkish Archery and the Composite Bow); horn and sinew lose little (`kept` 0.9, an estimate); light
  // limbs (`virtualKg` ~10 g: an estimate between a flight bow's ~5 g and a self bow's) on a medium ~65 g arrow. It
  // stores ~144 J and gives ~112 J at ~59 m/s (~193 fps; the 170-200+ fps the steppe bow is credited with).
  // The Ottoman war bow is kept on this bow: Klopsteg's measured Turkish bows are flight bows (a sport's, light, for
  // distance), and no draw weights of the Janissaries' and azaps' war bows were found to give one of its own; a war
  // bow was heavier than a flight bow and about this steppe bow's build, so it shoots as this one.
  compositeBow: {
    label: 'Composite bow', hands: 'one', hand: 'l', length: 0.62, strikeFrom: 0.62, handle: 0.55, mass: 0.7, balance: 0, radius: 0.016,
    harm: { swing: { blunt: 0.3 }, thrust: { blunt: 0.2 } },
    contactSeconds: 0.006, rotation: 0.5, wrist: { omega: 14, zeta: 0.9 }, threat: 3.6, grip: 0.4, ranged: true, bow: true,
    drawN: 400,
    cast: { drawLength: 0.76, brace: 0.16, fullness: 0.6, kept: 0.9, virtualKg: 0.01, arrowKg: 0.065 },
    // The steppe quiver: thirty to forty arrows (the Strategikon's; a horse archer's kit says its own, outfits.js `quiver`).
    ammo: 54,
  },
  // The Ming bow: the standard Chinese composite of horn, bamboo and sinew, longer than the steppe bow, with medium
  // siyahs: between the light steppe bow and the heavy Manchu bow that grew out of it (the Manchu bow is this bow made
  // longer and heavier-eared). ~100 lbf (450 N; the Ming soldier's bow of the military manuals, Qi Jiguang's and the
  // Wubei zhi's, ran ~70-120 lbf: an estimate, no measured Ming war bow was found), drawn with the thumb ring to the ear
  // and a little past, ~31.5 in (0.8 m), braced ~0.16 m; `fullness` 0.57 and `kept` 0.88 (between the two: estimates);
  // `virtualKg` ~25 g (medium ears: an estimate) on a ~90 g war arrow (an estimate). It stores ~164 J and gives ~113 J
  // at ~50 m/s (~165 fps). The Ming soldier's bow (STYLES.mingBow).
  chineseBow: {
    label: 'Ming bow', hands: 'one', hand: 'l', length: 0.8, strikeFrom: 0.8, handle: 0.72, mass: 0.8, balance: 0, radius: 0.016,
    harm: { swing: { blunt: 0.32 }, thrust: { blunt: 0.22 } },
    contactSeconds: 0.006, rotation: 0.5, wrist: { omega: 14, zeta: 0.9 }, threat: 3.7, grip: 0.4, ranged: true, bow: true,
    drawN: 450,
    cast: { drawLength: 0.8, brace: 0.16, fullness: 0.57, kept: 0.88, virtualKg: 0.025, arrowKg: 0.09 },
    // A soldier's quiver: ~30 arrows, a second bundle with the company's carts (SUPPLY).
    ammo: 36,
  },
  // The yumi: the Japanese war bow, over two metres of laminated bamboo and wood bound in rattan, gripped a third of
  // the way up (`handle` the short lower limb, `length` the long upper; why so low is argued: for the horse's neck,
  // for shooting kneeling, or at the node where the long bow's vibration is least). Japan has its own yew (Taxus
  // cuspidata); what it lacked for a composite was horn, and bamboo laminates gave the yumi its cast instead. A war
  // bow of ~100 lbf (450 N; up to 100-120 lbf for the strongest: an estimate), drawn long, past the ear, ~0.88 m (the
  // yazuka of a man ~1.6 m tall), braced ~0.16 m: the longest stroke of these. Its long straight limbs draw near
  // linearly (`fullness` 0.5), bamboo damps a little (`kept` 0.85, as wood: an estimate), the long limbs move a fair
  // mass (`virtualKg` ~30 g, an estimate) on a ~90 g war arrow (an estimate). It stores ~162 J and gives ~103 J at
  // ~48 m/s (~157 fps; the 130-160 fps a yumi is credited with). Drawn full by a strong back (handling.js).
  yumi: {
    label: 'Yumi', hands: 'one', hand: 'l', length: 1.45, strikeFrom: 1.45, handle: 0.75, mass: 0.75, balance: 0.2, radius: 0.014,
    harm: { swing: { blunt: 0.3 }, thrust: { blunt: 0.2 } },
    contactSeconds: 0.006, rotation: 0.5, wrist: { omega: 13, zeta: 0.9 }, threat: 3.8, grip: 0.4, ranged: true, bow: true,
    drawN: 450,
    cast: { drawLength: 0.88, brace: 0.16, fullness: 0.5, kept: 0.85, virtualKg: 0.03, arrowKg: 0.09 },
    // The ebira (the quiver on the back) held ~24 arrows.
    ammo: 36,
  },
  // The Manchu bow of the Jurchen banners (Nurhaci's men at Sarhu, 1619; the Qing army's after 1636): a long
  // composite of horn, bamboo and sinew, ~1.6-1.8 m strung, with long heavy rigid ears (siyah) and string bridges.
  // The Qing regulations (Huangchao liqi tushi, 1766) graded the military examination bows at 8, 10 and 12 li, about
  // 107, 133 and 160 lbf, and strength bows to 18 li (~240 lbf): here 130 lbf (580 N), a banner man's war bow. Drawn
  // past the ear, ~34 in (0.86 m), high-braced on its bridges (~0.2 m: an estimate), `fullness` 0.55 (the long ears
  // ease the end of the draw: an estimate), `kept` 0.88 (an estimate). The heavy ears are a great virtual mass
  // (`virtualKg` ~45 g: an estimate), which is why it shot long arrows (~1 m) of ~130-150 g with broad heads (Qing
  // war arrows; Selby, Chinese Archery, 2000): ~140 g here. It stores ~211 J and gives ~140 J at ~45 m/s (~147 fps; the
  // 130-150 fps it is credited with); with a steppe arrow of 65 g it would give only ~109 J, 52% of what it stores against
  // 67% (test/bowcast.test.js). A broad head needs more energy at the point to go through a coat (the
  // armour's physics: PUNCTURE), and the heavy arrow's momentum knocks a man the harder (arrowHit).
  // Drawn full only by a strong man (handling.js); the archer comes in close to make his shots (STYLES.manchuBow).
  manchuBow: {
    label: 'Manchu bow', hands: 'one', hand: 'l', length: 0.92, strikeFrom: 0.92, handle: 0.82, mass: 0.9, balance: 0, radius: 0.017,
    harm: { swing: { blunt: 0.35 }, thrust: { blunt: 0.25 } },
    contactSeconds: 0.006, rotation: 0.5, wrist: { omega: 13, zeta: 0.9 }, threat: 3.8, grip: 0.4, ranged: true, bow: true,
    drawN: 580,
    cast: { drawLength: 0.86, brace: 0.2, fullness: 0.55, kept: 0.88, virtualKg: 0.045, arrowKg: 0.14 },
    // The quiver of a banner man: ~30 arrows (the Qing regulations' 30 to a quiver).
    ammo: 30,
  },
  // ---- Agincourt, Cerignola (the battle maps of 1415 and 1503) ----
  // The English war bow (the longbow of the Mary Rose's ~140 staves): a self bow of yew about 1.9 m long (the staves
  // mostly imported, from the Alps and the Baltic trade, England's own yew too knotty), drawn to the ear at 100-185 lbf
  // (the Mary Rose bows put by Hardy at 150-160 lbf, 670-710 N, at 30 in; here 600 N, a common archer's), a 30 in
  // (0.76 m) draw braced at ~6.5 in (0.165 m). A straight wooden limb (`fullness` 0.45), its war arrow ~95 g (the
  // heavy arrow of the replica tests; the Mary Rose's arrows were mostly of poplar, with ash and others).
  // `kept` 0.85 and `virtualKg` 20 g are set by the replica tests in Strickland & Hardy, The Great Warbow (2005): a
  // 150 lbf bow cast a 57.8 g arrow at 62.25 m/s (112 J) and Stretton's 144 lbf bow a 102 g arrow at 47.2 m/s (114 J):
  // at 600 N that is ~101 J and ~107 J, and this bow gives ~102 J and ~114 J to those arrows. It stores ~161 J and
  // gives ~113 J to its own at ~49 m/s (~160 fps; the 140-160 fps it is credited with).
  // Drawn only by a man trained to it from boyhood (handling.js: a weak man draws it part way and slowly).
  // Against plate it is the armour's physics that decides (ARROW.bounce, its gaps), not the bow.
  longbow: {
    label: 'Longbow', hands: 'one', hand: 'l', length: 1.0, strikeFrom: 1.0, handle: 0.9, mass: 0.8, balance: 0, radius: 0.016,
    harm: { swing: { blunt: 0.35 }, thrust: { blunt: 0.25 } },
    contactSeconds: 0.006, rotation: 0.5, wrist: { omega: 13, zeta: 0.9 }, threat: 3.8, grip: 0.4, ranged: true, bow: true,
    drawN: 600,
    cast: { drawLength: 0.76, brace: 0.165, fullness: 0.45, kept: 0.85, virtualKg: 0.02, arrowKg: 0.095 },
    // Two sheaves of 24 (a sheaf at the belt and one stuck in the ground before him), the more brought up to the line by
    // the boys of the baggage (SUPPLY).
    ammo: 72,
  },
  // The pike of the Swiss and the Landsknechts (and Gonzalo's Germans at Cerignola): an ash shaft of 5 m
  // (16–18 ft), a small leaf head on long langets, ~3.5 kg; held with both hands a third of the way up from
  // the butt (`handle` behind the rear hand), the front hand far out on the shaft, levelled at chest height
  // and pushed (the "push of pike"), not swung. Its weight far out before the hands makes it slow to bring
  // round (`wrist`), and a blow on its long shaft levers it from the hands easily (`grip`). Set against a
  // horse's charge with the butt to the ground, the man's weight is behind its point (WORLD.mount.brace).
  // (`pointWidth` 0.025: a pike's small narrow head, ~2.5 cm; PUNCTURE.)
  pike: {
    art: 'artSpear',
    pointFrom: 0, label: 'Pike', hands: 'two', length: 3.4, strikeFrom: 3.1, handle: 1.6, spacing: 0.6, leadAhead: true, mass: 3.5, balance: 0.7, radius: 0.017, pointWidth: 0.025,
    harm: { thrust: { pierce: 1.5, blunt: 0.25, cut: 0.1 }, swing: { blunt: 0.6, cut: 0.1 } },
    contactSeconds: 0.005, rotation: 0.4, wrist: { omega: 8, zeta: 0.9 }, threat: 4, grip: 0.45,
  },
  // Sidearms, drawn when the main weapon is lost (an outfit's `sidearm`):
  // a knight's rondel dagger, made to find the gaps in plate; a man-at-arms'
  // short sword; a samurai's wakizashi, the short companion of the katana.
  // (`pointWidth` 0.012: the rondel's stiff square-sectioned point, ~1.2 cm a little behind its tip, the bodkin's kind of
  // point, made to be pressed through mail; was its blade's 2 cm, which stopped a finisher's point in the mail at a man's
  // throat. PUNCTURE.)
  dagger: {
    art: 'artFleche',
    label: 'Dagger', hands: 'one', length: 0.3, strikeFrom: 0.06, handle: 0.11, mass: 0.35, balance: 0, radius: 0.01, pointWidth: 0.012,
    harm: { thrust: { pierce: 0.8, blunt: 0.3 }, swing: { cut: 0.35, blunt: 0.2 } },
    contactSeconds: 0.005, rotation: 0.6, wrist: { omega: 40, zeta: 0.8 }, threat: 2.5,
  },
  shortSword: {
    art: 'artFleche',
    label: 'Short sword', hands: 'one', length: 0.6, strikeFrom: 0.1, handle: 0.12, mass: 0.85, balance: 0.08, radius: 0.012,
    harm: { thrust: { pierce: 0.85, cut: 0.2, blunt: 0.15 }, swing: { cut: 0.8, blunt: 0.4 } },
    contactSeconds: 0.004, rotation: 0.7, wrist: { omega: 26, zeta: 0.8 }, threat: 3,
  },
  wakizashi: {
    art: 'artDrawCut',
    label: 'Wakizashi', hands: 'one', length: 0.5, strikeFrom: 0.08, handle: 0.16, mass: 0.7, balance: 0.08, radius: 0.012, curve: 0.012,
    harm: { swing: { cut: 1.15, blunt: 0.3 }, thrust: { pierce: 0.6, cut: 0.15, blunt: 0.1 } },
    contactSeconds: 0.004, rotation: 0.75, wrist: { omega: 28, zeta: 0.8 }, threat: 3.2,
  },
  // The Ming dao (a liuyedao, "willow-leaf sabre"): one hand, a gently
  // curved single edge, a round guard. Cuts first, and thrusts.
  dao: {
    label: 'Dao', hands: 'one', length: 0.75, strikeFrom: 0.12, handle: 0.15, mass: 0.95, balance: 0.1, radius: 0.012, curve: 0.05,
    harm: { swing: { cut: 1.1, blunt: 0.35 }, thrust: { pierce: 0.78, cut: 0.15, blunt: 0.1 } },
    contactSeconds: 0.004, rotation: 0.75, wrist: { omega: 25, zeta: 0.8 }, threat: 3.2, art: 'artDrawCut',
  },
  // The guandao: a broad, heavy crescent blade on a long shaft, fought like
  // the naginata but a quarter heavier, its weight knocking men about more
  // (blunt, and some of it through armour) while its thicker edge cuts and
  // its point pierces a little less.
  guandao: {
    label: 'Guandao', hands: 'two', length: 1.6, strikeFrom: 1.05, handle: 0.55, spacing: 0.42, leadAhead: true, edgeLeads: true, mass: 2.95, balance: 0.6, radius: 0.016,
    harm: { swing: { cut: 1.15, blunt: 1.05 }, thrust: { pierce: 0.55, cut: 0.12, blunt: 0.5 } },
    // Its heavy head drives some of a blow through armour (`crush`): between the naginata (none) and the war hammer (0.45); its blunt share too, 1.05 between their 0.625 and 1.6.
    contactSeconds: 0.005, rotation: 0.85, wrist: { omega: 12, zeta: 0.85 }, threat: 4.7, art: 'artWheel', crush: 0.3,
  },
  // The jian: the Chinese straight sword, double-edged, one hand. The Han's
  // were long: excavated iron jian run 0.85-1 m of blade and more (to ~1.1 m
  // overall and beyond), with a long grip; this one has 0.95 m. Light at the
  // point for its length: the thrust and the flicking cut, not the chop.
  jian: {
    label: 'Jian', hands: 'one', length: 0.95, strikeFrom: 0.1, handle: 0.21, mass: 1.0, balance: 0.1, radius: 0.01,
    harm: { thrust: { pierce: 1.05, cut: 0.2, blunt: 0.08 }, swing: { cut: 0.9, blunt: 0.25 } },
    contactSeconds: 0.004, rotation: 0.6, wrist: { omega: 30, zeta: 0.78 }, threat: 3.6, art: 'artDrawCut',
  },
  // The ōdachi (nodachi): a field sword of a metre of blade and more, a long
  // grip for two hands; carried by a strong man at Anegawa (1570) to cut at
  // horse and men. Heavy for a sword, long in the reach, slow to recover.
  // The hands well apart on the long tsuka: the right at the tsuba, the left at the pommel.
  odachi: {
    label: 'Ōdachi', hands: 'two', length: 1.08, strikeFrom: 0.15, handle: 0.42, spacing: 0.36, mass: 2.3, balance: 0.24, radius: 0.013, curve: 0.03,
    harm: { swing: { cut: 1.4, blunt: 0.6 }, thrust: { pierce: 0.65, cut: 0.15, blunt: 0.2 } },
    contactSeconds: 0.005, rotation: 0.85, wrist: { omega: 14, zeta: 0.82 }, threat: 4.9, art: 'artIai',
  },
  // A wooden baseball bat (~84 cm, ~0.9 kg), swung two-handed: all its
  // harm blunt, its weight out in the barrel.
  bat: {
    art: 'artCrushOne',
    label: 'Baseball bat', hands: 'two', length: 0.6, strikeFrom: 0.32, handle: 0.24, spacing: 0.09, mass: 0.9, balance: 0.42, radius: 0.033,
    harm: { swing: { blunt: 1.25 }, thrust: { blunt: 0.4 } },
    contactSeconds: 0.005, rotation: 1.0, wrist: { omega: 16, zeta: 0.85 }, threat: 3.4,
  },
  // Guan Yu's Green Dragon Crescent Blade (qinglong yanyue dao): the guandao
  // of the legend, its weight a legend too (82 jin); fought here at a real
  // guandao's, its look its own (a dragon's head at the blade, a red tassel).
  qinglong: {
    label: 'Green Dragon Crescent Blade', hands: 'two', length: 1.6, strikeFrom: 1.05, handle: 0.55, spacing: 0.42, leadAhead: true, edgeLeads: true, mass: 2.95, balance: 0.6, radius: 0.016,
    harm: { swing: { cut: 1.15, blunt: 1.05 }, thrust: { pierce: 0.55, cut: 0.12, blunt: 0.5 } },
    contactSeconds: 0.005, rotation: 0.85, wrist: { omega: 12, zeta: 0.85 }, threat: 4.7, art: 'artWheel', crush: 0.3,
  },
  // A knight's arming sword of the 1420s (Joan's, from Sainte-Catherine-de-
  // Fierbois): one hand, ~0.8 m of stiff tapering blade, a straight cross and
  // a wheel pommel; made to thrust into the gaps of plate as much as to cut.
  armingSword: {
    art: 'artDrawCut',
    label: 'Arming sword', hands: 'one', length: 0.8, strikeFrom: 0.12, handle: 0.13, mass: 1.15, balance: 0.12, radius: 0.011,
    harm: { thrust: { pierce: 1, cut: 0.2, blunt: 0.12 }, swing: { cut: 0.95, blunt: 0.4 } },
    contactSeconds: 0.004, rotation: 0.7, wrist: { omega: 24, zeta: 0.8 }, threat: 3.4,
  },
  // The Ayyubid sword (sayf) of Saladin's day: straight and two-edged (the
  // curved sabre came to Syria and Egypt only with the Mamluks, a century
  // on), ~0.85 m of broad blade with a wide fuller and a rounded point, a
  // short cross with langets, a cap pommel; a horseman's sword, made to cut
  // from the saddle more than to thrust, so its balance a little further out.
  sayf: {
    art: 'artDrawCut',
    label: 'Sayf', hands: 'one', length: 0.84, strikeFrom: 0.12, handle: 0.12, mass: 1.15, balance: 0.16, radius: 0.012,
    harm: { swing: { cut: 1.0, blunt: 0.4 }, thrust: { pierce: 0.85, cut: 0.2, blunt: 0.12 } },
    contactSeconds: 0.004, rotation: 0.72, wrist: { omega: 23, zeta: 0.8 }, threat: 3.4,
  },
  // Hercules's club (clava), as Commodus carried it into the arena: a length
  // of knotted wood thickening to its end, ~0.9 m and 2 kg, no iron on it.
  // Only blunt; its weight out at the head.
  clava: {
    art: 'artCrushOne',
    label: 'Club', hands: 'one', length: 0.78, strikeFrom: 0.42, handle: 0.12, mass: 2.0, balance: 0.6, radius: 0.04,
    harm: { swing: { blunt: 1.35 }, thrust: { blunt: 0.4 } },
    contactSeconds: 0.005, rotation: 0.95, wrist: { omega: 13, zeta: 0.85 }, threat: 3.6, crush: 0.35,
  },
  // His backup: a short sword that cuts and stabs.
  gladius: {
    art: 'artFleche',
    label: 'Gladius', hands: 'one', length: 0.62, strikeFrom: 0.1, handle: 0.13, mass: 0.9, balance: 0.08, radius: 0.012,
    harm: { thrust: { pierce: 0.9, cut: 0.2, blunt: 0.15 }, swing: { cut: 0.8, blunt: 0.4 } },
    contactSeconds: 0.004, rotation: 0.7, wrist: { omega: 26, zeta: 0.8 }, threat: 3,
    // Roman-era bloomery iron and uneven steel, softer than a later quench-hardened blade (MATERIALS.iron).
    build: { edge: 'iron', blade: 'iron' },
  },  // The thraex's sica: a short sword curved like a sickle (~0.42 m of blade),
  // made to reach round a shield's edge into the back and the legs.
  sica: {
    art: 'artDrawCut',
    label: 'Sica', hands: 'one', length: 0.46, strikeFrom: 0.08, handle: 0.12, mass: 0.7, balance: 0.14, radius: 0.012, curved: true, curve: -0.07,
    harm: { swing: { cut: 1.15, blunt: 0.3 }, thrust: { pierce: 0.7, cut: 0.25, blunt: 0.1 } },
    contactSeconds: 0.004, rotation: 0.75, wrist: { omega: 26, zeta: 0.8 }, threat: 3.1,
    // Roman-era bloomery iron and uneven steel, softer than a later quench-hardened blade (MATERIALS.iron).
    build: { edge: 'iron', blade: 'iron' },
  },
  // The retiarius's trident (fuscina): ~1.7 m of ash with three iron prongs.
  // One hand while the other holds the net; both once it is thrown. The
  // prongs are short and spread: they wound wide rather than deep.
  // (`pointWidth` 0.012: a prong; PUNCTURE.)
  trident: {
    art: 'artSpear',
    label: 'Trident', hands: 'hybrid', length: 1.15, strikeFrom: 0.95, handle: 0.55, spacing: 0.4, leadAhead: true, mass: 1.8, balance: 0.5, radius: 0.016, pointWidth: 0.012, tines: 3,
    harm: { thrust: { pierce: 0.85, cut: 0.2, blunt: 0.3 }, swing: { blunt: 0.55 } },
    contactSeconds: 0.005, rotation: 0.5, wrist: { omega: 14, zeta: 0.85 }, threat: 3.8, grip: 0.5,
  },
  // ---- Late antiquity and the Parthians (Carrhae, the Catalaunian Plains) ----
  // The spatha: the long straight two-edged sword of the late Roman army and
  // the Germanic peoples (and the Hunnic nobility), ~0.8 m of blade with a
  // small guard and a mushroom pommel, ~1.2 kg; a cut-and-thrust sword for a
  // man with a shield, longer than the legion's old gladius. As the arming
  // sword (a sword of the same kind a thousand years on) in all but the hilt.
  spatha: {
    art: 'artDrawCut',
    label: 'Spatha', hands: 'one', length: 0.82, strikeFrom: 0.12, handle: 0.12, mass: 1.2, balance: 0.13, radius: 0.011,
    harm: { thrust: { pierce: 0.95, cut: 0.2, blunt: 0.12 }, swing: { cut: 0.95, blunt: 0.4 } },
    contactSeconds: 0.004, rotation: 0.72, wrist: { omega: 23, zeta: 0.8 }, threat: 3.4,
    // Roman-era bloomery iron and uneven steel, softer than a later quench-hardened blade (MATERIALS.iron).
    build: { edge: 'iron', blade: 'iron' },
  },
  // The kontos: the cataphract's lance, ~3.7 m (Plutarch's and Heliodorus's
  // 'long pike'; the Sarmatian and Parthian horse's), held in both hands across
  // the horse's neck and driven with the horse's weight behind it: no vamplate
  // and no rest, a long ash or cornel shaft with a heavy socketed point. Longer
  // and a little heavier than the knight's war lance (`lance`), as much of it
  // behind the grip; its grip a two-handed one, firmer than a spear's.
  // (`pointWidth` 0.03: a narrow head ~3 cm; PUNCTURE.)
  kontos: {
    art: 'artSpear',
    pointFrom: 0.78, label: 'Kontos', hands: 'two', length: 2.65, strikeFrom: 1.5, handle: 1.05, spacing: 0.55, mass: 5.6, balance: 0.2, radius: 0.025, pointWidth: 0.03,
    harm: { thrust: { pierce: 1.6, blunt: 0.35, cut: 0.02 }, swing: { blunt: 0.9 } },
    contactSeconds: 0.005, rotation: 0.38, wrist: { omega: 6.5, zeta: 0.9 }, threat: 4, grip: 0.75,
  },
  // Standards: the side's flag on a staff, carried by its leader (see
  // FACTIONS[...].standard). A bearer wants both hands for it; it is a poor
  // weapon, a long ash pole heavy at the top with the cloth and finial (~3.5 kg,
  // ~2.6 m), swung or jabbed only to keep a man off. `flag` names the look.
  ...Object.fromEntries([
    // A square knight's banner on a lance-length staff, a spear finial.
    ['banner', 'Banner', 'knights'],
    // The Ming command flag (令旗): a triangle with a flame-tongue border.
    ['lingQi', 'Command flag', 'chinese'],
    // The Ottoman sancak: a swallow-tailed field on a staff with a brass crescent.
    ['sancak', 'Sancak', 'ottomans'],
    // The steppe tug: horse-tail plumes hung under a trident finial, no cloth.
    ['tug', 'Tug', 'steppe'],
    // A nobori: tall and narrow, hung from a pole and a crossbar; the leader's
    // back banner, picked up, is carried in the hands like this.
    ['nobori', 'Nobori', 'japanese'],
    // The Mexica pamitl: a captain's device on a frame up his back, a disc of
    // feather-work under a spray of quetzal plumes; fallen, it is carried in the hands.
    ['pamitl', 'Pamitl', 'mexica'],
    // The Roman vexillum: a square red cloth hung from a crossbar under the
    // point, a gold fringe, the legion's name in gold.
    ['vexillum', 'Vexillum', 'romans'],
  ].map(([kind, label, flag]) => [kind, {
    label, flag, hands: 'two', length: 1.75, strikeFrom: -0.6, handle: 0.85, spacing: 0.45, leadAhead: true, mass: 3.5, balance: 0.75, radius: 0.018,
    // (`pointWidth`: a finial's spear point, ~4 cm across; PUNCTURE.)
    pointWidth: 0.04,
    harm: { swing: { blunt: 1 }, thrust: { blunt: 0.7, pierce: 0.3 } },
    contactSeconds: 0.008, rotation: 1.4, wrist: { omega: 10, zeta: 0.9 }, threat: 2, grip: 0.5,
    // Its finial driven in as a spear's point is.
    art: 'artSpear',
  }])),
};

/**
 * What weapons and shields are made of, for their wear (physics/wear.js). A weapon's `build` names the material of its
 * edge (what dulls), its blade (the metal body that bends or snaps: a sword's) and its shaft (the wood between the hands
 * and the head that snaps or is hacked through: a spear's, a polearm's); left out, buildOf works it out from the spec.
 * A shield's `material` names its board.
 * - `hardness`: how hard a face it is for another's edge to meet, against good steel (1): what an edge that meets it dulls by.
 * - `dulls`: how much wider an edge of it grows (× its fresh width) for each joule it takes on a face as hard as steel. A
 *   fresh sword edge is ~20-40 µm across; a parry edge to edge or a cut onto plate rolls and notches it a few µm per
 *   joule of the blow: a hard minute of it (some 2,000 J taken edge on) leaves good steel ~3× as wide, soft iron and
 *   bronze, which turn and nick sooner, twice and more that.
 * - `blade`: a metal blade's bending: `strength` (J), the single blow across it (at the reference blade, WORLD.wear.blade)
 *   that bends or snaps it; `scatter`, the Weibull modulus of that strength over blades of the metal (the higher, the more
 *   alike: quench-hardened steel is made to a standard, bloomery iron and cast bronze vary with every slag inclusion and
 *   pore); `capacity` (J), what it takes in all before the blows that each did nothing work it to a crack (fatigue). A
 *   good steel sword passes a proof of full flat blows on a block (~150 J) and is rarely broken in a fight; Polybius's
 *   Gauls straightened their soft iron swords under the foot after a blow or two, and bronze swords bent; `fails`, how
 *   (hardened steel snaps, soft iron and bronze bend: either way it is no longer a sword to fight with).
 * - `shaft`: a wooden shaft's `strength` (× WORLD.mount.brace.shaft at the reference shaft, WORLD.wear.shaft: the energy
 *   a set point carries before its shaft gives), its `scatter` (clear wood's strength varies ~20 %: modulus ~6), and
 *   `chop` (J at the reference shaft), the edge-on work that hacks it through (why polearms grew iron langets).
 * - `board`: a shield board's `perKg` (J of its weight), the hacking it takes before it splits apart: a lime or alder
 *   board of ~4 kg goes in some 20 full axe or two-hander blows (~200 J each, edge led: reconstructions in reenactment and
 *   test cutting split planked round shields in ten to thirty); plywood (glued cross-grain, the scutum) holds longer,
 *   springy wicker as well for its weight (but a wicker shield is light); `scatter` as the shaft's. Steel and bronze dent
 *   and do not split (no `board`).
 */
export const MATERIALS = {
  steel: { hardness: 1, dulls: 0.001, blade: { strength: 1200, scatter: 8, capacity: 40000, fails: 'snapped' } },
  // Bloomery iron and the uneven early steels of antiquity: softer, it turns and bends sooner.
  iron: { hardness: 0.7, dulls: 0.0022, blade: { strength: 500, scatter: 4, capacity: 9000, fails: 'bent' } },
  // Tin bronze: work-hardened at the edge but soft behind it; it bends.
  bronze: { hardness: 0.6, dulls: 0.0025, blade: { strength: 600, scatter: 5, capacity: 7000, fails: 'bent' } },
  // Hardwood (ash, oak, hickory): the shaft the brace figure is set against.
  hardwood: { hardness: 0.1, shaft: { strength: 1, scatter: 6, chop: 600 } },
  // White-wax wood: Chinese ash grown slow and straight, it bends far and springs back where a stiffer ash snaps.
  waxwood: { hardness: 0.1, shaft: { strength: 1.4, scatter: 6, chop: 600 } },
  // Bamboo: hollow, light and springy; it splits along its fibres under an edge sooner than solid wood.
  bamboo: { hardness: 0.1, shaft: { strength: 0.8, scatter: 5, chop: 350 } },
  // Shield boards.
  planks: { hardness: 0.12, board: { perKg: 850, scatter: 6 } },
  plywood: { hardness: 0.12, board: { perKg: 1200, scatter: 6 } },
  wicker: { hardness: 0.08, board: { perKg: 900, scatter: 5 } },
  // A riot shield's polycarbonate: it crazes and cracks only under very many heavy blows.
  polycarbonate: { hardness: 0.15, board: { perKg: 5000, scatter: 6 } },
  // Metal shields dent and do not split.
  steelPlate: { hardness: 1 },
  bronzePlate: { hardness: 0.6 },
};

/**
 * A weapon's build: its edge's, its blade's and its shaft's materials (null: it has none that wears), and the radius of its
 * shaft (m). Its own `build` says; else an edge of good steel if it cuts or pierces (not a brittle one: obsidian's flakes
 * chip on their own, physics.js chip), a wooden haft if its head is set a forearm or more out from the hands
 * (WORLD.wear.shaftFrom; or it is all pole, a staff's `strikeFrom` behind the hands), a steel blade if it has an edge and
 * no haft. A gun, a bow, a whip and a forearm weapon do not wear here.
 */
export function buildOf(spec, shaftFrom) {
  if (spec.ranged || spec.bow || spec.rope || spec.mounted || spec.tethered) return NO_BUILD;
  const own = spec.build ?? {};
  const harm = spec.harm ?? {};
  const edged = !spec.brittle && Object.values(harm).some((mix) => (mix.cut ?? 0) > 0 || (mix.pierce ?? 0) > 0);
  const hafted = spec.strikeFrom >= shaftFrom || spec.strikeFrom < 0;
  const edge = own.edge !== undefined ? own.edge : edged ? 'steel' : null;
  const shaft = own.shaft !== undefined ? own.shaft : hafted ? 'hardwood' : null;
  const blade = own.blade !== undefined ? own.blade : edge && !shaft ? edge : null;
  return { edge, blade, shaft, shaftRadius: own.shaftRadius ?? spec.radius, langets: own.langets ?? 0 };
}
const NO_BUILD = { edge: null, blade: null, shaft: null, shaftRadius: 0, langets: 0 };

/**
 * How far (m) ahead of the front hand a shaft's head begins: its socket (a long head's own `head` length back from the tip,
 * else where a point's `pointFrom` share of the striking length starts, else the striking length's start), less the steel
 * `langets` strapped down the wood below it: the free wood that bows under a thrust (WORLD.wear.column). Null for a weapon
 * that is all pole (a staff's or a standard's `strikeFrom` behind the hands).
 */
export function freeShaft(spec, build) {
  if (spec.strikeFrom < 0) return null;
  const headFrom = spec.head ? spec.length - spec.head : spec.strikeFrom + (spec.pointFrom ?? 0) * (spec.length - spec.strikeFrom);
  return Math.max(0.1, headFrom - (build.langets ?? 0));
}

// Shields strapped to the off forearm: a disc of this radius held off the
// arm, facing where the fighter faces. A strike that meets it is stopped
// there; its momentum goes into the arm and the body braced behind it.
// `hold`: how fast it is held on the arm against a blow that would tear it
// off (× the hand's grip; WORLD.shield.wrench). On arm straps (enarmes and a
// guige: the heater, the rodela, a riot shield) the whole forearm holds it and
// it is hard to lose; on a single grip behind the boss (the parma, a round
// shield, the kalkan) the hand alone; a buckler, held out in the fist, least of
// all. The scutum's horizontal grip is braced along the forearm and against the
// body; the scissor's tube is on the arm itself.
export const SHIELDS = {
  // The parma: small, round, convex bronze — far smaller than a hoplon.
  parma: { label: 'Parma', radius: 0.28, mass: 2.4, offset: 0.07, armHarm: 0.15, hold: 1.0, material: 'bronzePlate' },
  // A Ming soldier's small round shield: lacquered wood with an iron rim and a boss.
  roundShield: { label: 'Round shield', radius: 0.3, mass: 2.2, offset: 0.07, armHarm: 0.15, hold: 1.1, look: 'ming', material: 'planks' },
  // The Spanish rodela: a round steel shield, heavy and proof against cuts and thrusts.
  rodela: { label: 'Rodela', radius: 0.29, mass: 3.5, offset: 0.07, armHarm: 0.12, hold: 1.4, look: 'steel', material: 'steelPlate' },
  // The Mexica chimalli: a round shield of wicker or wood faced with feathers and hide.
  chimalli: { label: 'Chimalli', radius: 0.33, mass: 1.6, offset: 0.07, armHarm: 0.2, hold: 1.3, look: 'feather', material: 'wicker' },
  // A small round iron parry shield, held out to meet a blow.
  buckler: { label: 'Iron buckler', radius: 0.2, mass: 1.4, offset: 0.06, armHarm: 0.12, hold: 0.6, look: 'steel', material: 'steelPlate' },
  // The kalkan: the Turkish and steppe round shield of wicker bound in
  // coloured thread round an iron boss; light and springy.
  kalkan: { label: 'Kalkan', radius: 0.3, mass: 1.7, offset: 0.07, armHarm: 0.17, hold: 1.1, look: 'ming', material: 'wicker' },
  // The Ayyubid horseman's round shield (turs): boards faced with dark
  // leather, ~0.65 m across, a rawhide rim and an iron boss; heavier than
  // the wicker kalkan of later centuries, and stiffer under a blow.
  turs: { label: 'Turs', radius: 0.32, mass: 2.8, offset: 0.07, armHarm: 0.15, hold: 1.3, look: 'turs', material: 'planks' },
  // Shaped shields (`shape: 'curved'`): a rectangle `width` × `height` (m)
  // bent round a vertical axis (`curve`, the bend's radius), held upright by
  // a grip at its middle. The scutum of the murmillo and the secutor: plywood
  // faced with leather, an iron boss, about 0.6 × 0.95 m and 6 kg (an arena
  // scutum was smaller than a legionary's); shoulder to shin, curved round
  // the body: blows go round it to the head or the forward leg.
  // A police riot shield: clear polycarbonate, ~0.6 × 1.05 m, slightly
  // curved; it stops blows, thrown things and edges, not rounds.
  riotShield: { label: 'Riot shield', shape: 'curved', width: 0.6, height: 1.05, curve: 1.2, mass: 4, offset: 0.1, armHarm: 0.07, hold: 1.5, look: 'riot', material: 'polycarbonate' },
  // The heater: the knight's shield of the 12th–13th century, ~0.6 × 0.8 m,
  // flat at the top and curving to a point below, a little bent round the
  // arm; wood faced with leather, painted (the Temple's white with its red cross).
  heater: { label: 'Heater shield', shape: 'curved', width: 0.56, height: 0.8, curve: 0.75, mass: 4, offset: 0.1, armHarm: 0.08, hold: 1.6, look: 'heater', material: 'planks' },
  scutum: { label: 'Scutum', shape: 'curved', width: 0.62, height: 0.95, curve: 0.5, mass: 6, offset: 0.1, armHarm: 0.07, hold: 1.5, look: 'scutum', material: 'plywood' },
  // The late Roman infantry's shield (scutum of the 4th–5th centuries, as the
  // Dura-Europos and Notitia shields show it): a broad oval of glued planks,
  // ~0.8 × 1.05 m, faced with painted leather (each unit its own device), an
  // iron boss over a horizontal grip; only gently dished, not the old
  // semicylinder. Met as a rectangle (`shape: 'curved'`) a little inside the
  // oval (0.72 × 0.98 m): the corners an oval has not are left out; ~5.5 kg.
  oval: { label: 'Oval shield', shape: 'curved', width: 0.72, height: 0.98, curve: 1.6, mass: 5.5, offset: 0.1, armHarm: 0.08, hold: 1.3, look: 'oval', material: 'planks' },
  // The Germanic round shield (the Visigoths', the Franks', the Huns' foot): planks of
  // lime or alder ~0.85 m across, rawhide-edged, a domed iron boss over a single grip; ~4 kg.
  germanic: { label: 'Round shield', radius: 0.42, mass: 4, offset: 0.08, armHarm: 0.14, hold: 1.1, look: 'germanic', material: 'planks' },
  // The thraex's parmula: small and nearly square (~0.36 × 0.42 m), flat-ish.
  parmula: { label: 'Parmula', shape: 'curved', width: 0.36, height: 0.42, curve: 0.9, mass: 2.4, offset: 0.08, armHarm: 0.13, hold: 1.1, look: 'parmula', material: 'planks' },
  // The scissor's arm: a steel tube over the left forearm and fist, ending in
  // a crescent blade (~0.13 m round): it parries like a small shield.
  scissores: { label: 'Scissores', radius: 0.13, mass: 2, offset: 0.12, armHarm: 0.04, hold: 4, look: 'scissores', material: 'steelPlate' },
};

/**
 * The retiarius's net (rete): weighted at the edge with lead, ~3 m across,
 * thrown open over a man (`speed` m/s, opening to `radius` m over `open` s).
 * On him it binds his arms and weapon: his blows and guard are gone, his
 * steps short (`step` of his pace), his footing poorer (`footing`), until
 * he works free: at `freeRate` a second, `bladeFree` times that with an
 * edge in his hand to cut it. On the floor, past `lies` s, it is done.
 */
export const NET = { speed: 8.5, radius: 0.75, open: 0.25, flightMax: 1.2, step: 0.35, footing: 0.7, freeRate: 0.22, bladeFree: 2.2, lies: 30 };

/**
 * Hand grenades (physics/throwable.js): one carried by a kit that has a `throwable` (outfits.js: the modern infantryman's
 * frag, a SWAT officer's flashbang), thrown once overhand and gone. The pin is pulled as the throw begins and the fuse burns
 * from then (`fuse` s); in flight it is a body under gravity that bounces and rolls where it lands; at the end of its fuse
 * it goes off. Nothing here is a damage figure: what it does is the physics of what it throws out.
 *
 * frag, the US M67: a 0.4 kg steel sphere round 185 g of Composition B, a 4-5.5 s fuse. Its notched steel body breaks into
 * hundreds of fragments of a fraction of a gram at ~1500 m/s; the manuals give a lethal radius of 5 m and a casualty radius
 * of 15 m, fragments carrying to 230 m. Here:
 * - `fragments`: how many effective fragments go out over the half of the sphere above the ground (the other half goes into
 *   it). A man takes as many as his body presents of that half sphere at his distance (his capsules' area square to the
 *   line, over 2πd²): a dozen and more at 2 m, ~3 at 5 m, ~0.4 at 15 m (a bare man at 5 m: a quarter killed outright, most
 *   of the rest badly hurt and bleeding; at 15 m a scratch or nothing). Each is a projectile hit through the rounds' path (ranged.js
 *   bulletHit: his armour's bullet protection, proof against so small a fragment, takes its share; a man between takes it
 *   instead of the one behind him); at most `raysMost` are traced on any one man (by then he has more than enough).
 * - `joules`: a fragment's energy as it leaves (~0.2 g at ~1500 m/s, ~225 J); `fade` m: its energy's e-fold in the air (a
 *   small, ragged fragment slows fast: drag over its mass), so ~70 % is left at 5 m and ~30 % at 15 m.
 * - `lethal`, `bleed`: one fragment at `joules` (scaled by the energy it still has), as the guns' (GUN, of what kills an
 *   80 kg man): a fragment fresh from the burst is most of a pistol round's wound (half its energy, but ragged: it tumbles
 *   and tears), half of one by 5 m, a quarter by 15 m.
 * - `impulse`: what a fragment carries into what it hits (N·s: 0.2 g × 1500 m/s).
 * - `blast`: the shock's push on a body (N·s at 1 m, falling as 1/d: the positive impulse of 185 g of explosive, ~170 Pa·s at
 *   1 m, over a standing man's ~0.7 m²), no nearer than `near` m, out to `reach` m: at 1 m it throws a man off his feet
 *   (WORLD.balance.speed), at 3 m it rocks him.
 * flashbang, the M84 stun grenade: a perforated steel tube that stays whole (no fragments) round 4.5 g of magnesium and
 * perchlorate: a flash of some 6-8 million candela and a bang of 170-180 dB at 1.5 m, its fuse 1-2.3 s. It blinds and
 * deafens: the eyes' rods bleached for about five seconds, the ear's balance upset, a man at its foot disoriented, not hurt.
 * - `flash.stun`: [distance m, s] of being dazed (WORLD.daze: slower to react, weaker, swaying; interpolated between rows)
 *   for a man facing it with nothing between; facing away the bang alone (`away` of it), behind a wall `hidden` of it.
 *   `staggerWithin` m: the blast and the shock set him reeling (WORLD.stagger, severity `stagger` at its foot falling to
 *   the threshold at `staggerWithin`); `stunShare`: the share of the daze his limbs are slack (fighter.stun).
 * - `blast`: a few grams: a small push, enough to rock a man at its foot.
 * `ai`: when a man of the AI throws it (ai.js): at least `least` enemies within `within` m of a mark `from`-`to` m off, no
 * man of his own within `clear` m of it.
 */
export const THROWABLES = {
  frag: {
    label: 'Frag', name: 'fragmentation grenade', massKg: 0.4, radius: 0.032, fuse: 4.5,
    fragments: 1200, raysMost: 12, joules: 225, fade: 14, reach: 30,
    lethal: { head: 0.8, torso: 0.4, limb: 0.15 },
    bleed: { head: 0.0012, torso: 0.0018, limb: 0.0008 },
    impulse: 0.3,
    blast: { impulse: 120, near: 0.6, reach: 12 },
    flash: null,
    ai: { least: 3, within: 5, clear: 10, from: 8, to: 25 },
  },
  flashbang: {
    label: 'Flashbang', name: 'stun grenade', massKg: 0.47, radius: 0.025, fuse: 1.5,
    fragments: 0,
    blast: { impulse: 12, near: 0.6, reach: 4 },
    flash: { stun: [[1, 6], [3, 5], [5, 3.5], [8, 2], [12, 0.8], [15, 0]], away: 0.45, hidden: 0.3, staggerWithin: 3, stagger: 1, stunShare: 0.5 },
    ai: { least: 2, within: 4, clear: 6, from: 4, to: 18 },
  },
};

/**
 * The throw (physics/throwable.js), with the hand not on a weapon (the off hand behind a gun): the pin pulled at the chest
 * (`pin` s), the arm cocked back high behind the head with the shoulder turned away (to `release` s), then whipped over and
 * let go, the arm following through (to `seconds`). Lobbed at `angle` rad over the horizontal (a soldier's 30-40° arc that
 * drops it over cover), as fast as that needs to land on the mark, up to `speedMost` m/s (a fit man's ~35-40 m with a
 * grenade); off the mark by `spread` of the distance (a gaussian, wider for the unskilled, × (1.5 - skill)). Where it lands
 * it bounces (`bounce`: the vertical speed kept; `keep`: the horizontal) and rolls to a stop at `roll` m/s² (grass, earth).
 * Pressed with nobody to throw at, it goes `ahead` m straight on; a mark further than `reach` m is thrown at `reach`.
 */
export const THROW = { pin: 0.35, release: 0.8, seconds: 1.1, angle: 0.6, speedMost: 21, spread: 0.07, bounce: 0.3, keep: 0.5, roll: 5, ahead: 15, reach: 35 };

/** A shield's outer bound (m from its centre): its radius, or a shaped shield's half-diagonal. */
export function shieldReach(spec) {
  return spec.shape ? Math.hypot(spec.width / 2, spec.height / 2) : spec.radius;
}

/**
 * The point of a shield nearest `p` (shield from shieldDisc: centre, normal,
 * up, across, spec). A round shield is a flat disc; a shaped one a curved
 * rectangle, its middle at the centre, bending back round an upright axis.
 */
export function shieldClosest(p, shield) {
  const spec = shield.spec;
  if (!spec?.shape) {
    const offset = vec.sub(p, shield.centre);
    const height = vec.dot(offset, shield.normal);
    const flat = vec.sub(offset, vec.scale(shield.normal, height));
    const out = vec.length(flat);
    return out <= shield.radius ? vec.add(shield.centre, flat) : vec.add(shield.centre, vec.scale(flat, shield.radius / out));
  }
  const axis = vec.sub(shield.centre, vec.scale(shield.normal, spec.curve));
  const d = vec.sub(p, axis);
  const up = Math.max(-spec.height / 2, Math.min(spec.height / 2, vec.dot(d, shield.up)));
  const most = spec.width / 2 / spec.curve;
  const angle = Math.max(-most, Math.min(most, Math.atan2(vec.dot(d, shield.across), vec.dot(d, shield.normal))));
  const round = vec.add(vec.scale(shield.normal, Math.cos(angle) * spec.curve), vec.scale(shield.across, Math.sin(angle) * spec.curve));
  return vec.add(axis, vec.add(vec.scale(shield.up, up), round));
}

/**
 * Whether a point lies behind a shield's face, within its outline (not past
 * its rim): what a blade or a fist there could only have reached through it.
 */
export function behindShield(p, shield) {
  const side = shieldSide(p, shield);
  return side.inside && side.height < 0;
}

// What measureSide finds, in numbers rather than vectors: a crowd asks it for every
// sample of every trunk against every shield, every substep.
const measured = { inside: false, height: 0, onX: 0, onY: 0, onZ: 0, outX: 0, outY: 0, outZ: 0 };

/**
 * A point (px, py, pz) against a shield, worked into `measured`: the nearest
 * point on it (shieldClosest's), whether that is within its outline, the face's
 * outward normal there and the point's height over the face (shieldSide's answer).
 */
function measureSide(px, py, pz, shield) {
  const spec = shield.spec;
  const centre = shield.centre;
  const normal = shield.normal;
  if (!spec?.shape) {
    // A flat disc: the point's offset from the centre, less its height over the face, held within the radius.
    const ox = px - centre[0];
    const oy = py - centre[1];
    const oz = pz - centre[2];
    const over = ox * normal[0] + oy * normal[1] + oz * normal[2];
    const fx = ox - normal[0] * over;
    const fy = oy - normal[1] * over;
    const fz = oz - normal[2] * over;
    const out = Math.sqrt(fx * fx + fy * fy + fz * fz);
    if (out <= shield.radius) {
      measured.onX = centre[0] + fx;
      measured.onY = centre[1] + fy;
      measured.onZ = centre[2] + fz;
    } else {
      const squeeze = shield.radius / out;
      measured.onX = centre[0] + fx * squeeze;
      measured.onY = centre[1] + fy * squeeze;
      measured.onZ = centre[2] + fz * squeeze;
    }
    const rx = measured.onX - centre[0];
    const ry = measured.onY - centre[1];
    const rz = measured.onZ - centre[2];
    measured.inside = Math.sqrt(rx * rx + ry * ry + rz * rz) < shield.radius - 1e-3;
    measured.outX = normal[0];
    measured.outY = normal[1];
    measured.outZ = normal[2];
  } else {
    // A curved rectangle bending back round an upright axis.
    const up = shield.up;
    const across = shield.across;
    const ax = centre[0] - normal[0] * spec.curve;
    const ay = centre[1] - normal[1] * spec.curve;
    const az = centre[2] - normal[2] * spec.curve;
    const dx = px - ax;
    const dy = py - ay;
    const dz = pz - az;
    const rise = Math.max(-spec.height / 2, Math.min(spec.height / 2, dx * up[0] + dy * up[1] + dz * up[2]));
    const most = spec.width / 2 / spec.curve;
    const around = Math.max(-most, Math.min(most, Math.atan2(dx * across[0] + dy * across[1] + dz * across[2], dx * normal[0] + dy * normal[1] + dz * normal[2])));
    const cos = Math.cos(around) * spec.curve;
    const sin = Math.sin(around) * spec.curve;
    const onX = ax + (up[0] * rise + (normal[0] * cos + across[0] * sin));
    const onY = ay + (up[1] * rise + (normal[1] * cos + across[1] * sin));
    const onZ = az + (up[2] * rise + (normal[2] * cos + across[2] * sin));
    measured.onX = onX;
    measured.onY = onY;
    measured.onZ = onZ;
    const ex = onX - ax;
    const ey = onY - ay;
    const ez = onZ - az;
    const height = ex * up[0] + ey * up[1] + ez * up[2];
    const angle = Math.atan2(ex * across[0] + ey * across[1] + ez * across[2], ex * normal[0] + ey * normal[1] + ez * normal[2]);
    measured.inside = Math.abs(height) < spec.height / 2 - 1e-3 && Math.abs(angle) < spec.width / 2 / spec.curve - 1e-3;
    const bend = 1 / spec.curve;
    measured.outX = (ex - up[0] * height) * bend;
    measured.outY = (ey - up[1] * height) * bend;
    measured.outZ = (ez - up[2] * height) * bend;
  }
  measured.height = (px - measured.onX) * measured.outX + (py - measured.onY) * measured.outY + (pz - measured.onZ) * measured.outZ;
}

/**
 * A point against a shield: the nearest point on it, whether that is within
 * its outline (not on the rim), the face's outward normal there (the side
 * away from the man holding it), and the point's height over the face.
 */
function shieldSide(p, shield) {
  measureSide(p[0], p[1], p[2], shield);
  const outward = shield.spec?.shape ? [measured.outX, measured.outY, measured.outZ] : shield.normal;
  return { onShield: [measured.onX, measured.onY, measured.onZ], inside: measured.inside, outward, height: measured.height };
}

// The samples along a segment, as shieldContact takes them: up to 25.
const sampleInside = new Uint8Array(25);
const sampleHeight = new Float64Array(25);
const sampleOn = new Float64Array(75);
const sampleOut = new Float64Array(75);
const sampleAt = new Float64Array(75);

/**
 * A segment (a blade, a limb, of this radius) against a shield, sampled along
 * it: how deep it is in, where, and the way out — or null if clear. The shield
 * is a thin plate a fast blade can pass in one substep: a segment with points
 * both before and behind its face, within its outline, has gone into it from
 * the front and goes back out that way, however far through; past the rim it
 * meets the edge. A segment all behind the face (round the rim) is not in it.
 */
export function shieldContact(a, b, shield, radius) {
  // A ball (a fist) is one point; a blade a point every 8 cm or so.
  const length = vec.length(vec.sub(b, a));
  const samples = length < 1e-6 ? 0 : Math.max(4, Math.min(24, Math.ceil(length / 0.08)));
  let before = false;
  let behind = false;
  for (let index = 0; index <= samples; index += 1) {
    const along = samples ? index / samples : 0;
    const at = index * 3;
    const px = a[0] + (b[0] - a[0]) * along;
    const py = a[1] + (b[1] - a[1]) * along;
    const pz = a[2] + (b[2] - a[2]) * along;
    measureSide(px, py, pz, shield);
    sampleAt[at] = px;
    sampleAt[at + 1] = py;
    sampleAt[at + 2] = pz;
    sampleOn[at] = measured.onX;
    sampleOn[at + 1] = measured.onY;
    sampleOn[at + 2] = measured.onZ;
    sampleOut[at] = measured.outX;
    sampleOut[at + 1] = measured.outY;
    sampleOut[at + 2] = measured.outZ;
    sampleHeight[index] = measured.height;
    sampleInside[index] = measured.inside ? 1 : 0;
    if (measured.inside) {
      if (measured.height >= 0) before = true;
      else behind = true;
    }
  }
  const through = before && behind;
  const flat = !shield.spec?.shape;
  let bestDepth = 0;
  let bestIndex = -1;
  let bestOutward = true;
  let awayX = 0;
  let awayY = 0;
  let awayZ = 0;
  for (let index = 0; index <= samples; index += 1) {
    const at = index * 3;
    let depth;
    let outward = true;
    let x = sampleOut[at];
    let y = sampleOut[at + 1];
    let z = sampleOut[at + 2];
    if (sampleInside[index] && (sampleHeight[index] >= 0 || through)) {
      depth = radius - sampleHeight[index];
    } else if (!sampleInside[index]) {
      const ox = sampleAt[at] - sampleOn[at];
      const oy = sampleAt[at + 1] - sampleOn[at + 1];
      const oz = sampleAt[at + 2] - sampleOn[at + 2];
      const distance = Math.sqrt(ox * ox + oy * oy + oz * oz);
      depth = radius - distance;
      if (distance > 1e-6) {
        const scale = 1 / distance;
        x = ox * scale;
        y = oy * scale;
        z = oz * scale;
        outward = false;
      }
    } else continue;
    if (depth > 0 && (bestIndex < 0 || depth > bestDepth)) {
      bestDepth = depth;
      bestIndex = index;
      bestOutward = outward;
      awayX = x;
      awayY = y;
      awayZ = z;
    }
  }
  if (bestIndex < 0) return null;
  const at = bestIndex * 3;
  // (A flat shield's outward is its own normal, the very array; an offset's away is new.)
  const away = bestOutward && flat ? shield.normal : [awayX, awayY, awayZ];
  return { depth: bestDepth, point: [sampleOn[at], sampleOn[at + 1], sampleOn[at + 2]], along: samples ? bestIndex / samples : 0, from: [sampleAt[at], sampleAt[at + 1], sampleAt[at + 2]], away };
}

// Cutting and piercing, in joules of a contact's collision energy after
// armour. A cut this deep within `zone` of a joint takes the limb off there
// (scaled by the limb's thickness against a typical one); a stab this deep
// into the chest or head is the worst of injuries. Deep wounds bleed (`bleed`):
// blood lost per second per joule past what the skin and flesh take, easing as
// it clots, and a man who has lost this share of his blood collapses — slowly,
// and second to the injury itself (addDamage: the part's health).
export const BLADES = {
  // Armour this proof against cuts chips a brittle (obsidian) edge.
  chipsOn: 0.6,
  // Rigid armour (proof against cuts from `rigidFrom`) has gaps, and only
  // where they really are (`zones`, physics/gaps.js gapZoneAt): the armpits,
  // the groin under the fauld, the inside of the elbow, the back of the knee,
  // the throat between helmet and gorget, the sights of a closed helmet (or
  // the face of an open one). The middle of the breastplate, the back plate
  // and the crown of the helmet never have one. A blow that lands in a zone
  // finds the opening this often (`thrust`, `swing`: a point far more than
  // an edge; × the striker's technique and (0.5 + skill)), and meets there
  // only what is under it (`under`: the arming doublet; `mail` where the kit
  // has voiders, a standard or a mail skirt there; the bare face behind the
  // sights), and does not glance. Fighting in armour was largely the art of
  // finding them. Laced armour (lamellar, scale, brigandine) also parts at
  // its lacing a little anywhere but the solid plates: a kit's `lacing`, a
  // share of `thrust`. A gap is about a hand's breadth (`size`, m): a heavy
  // point that wanders (a lance carried at a run) is put into one the less,
  // by size / (size + its wander).
  gaps: {
    rigidFrom: 0.75, thrust: 0.4, swing: 0.1, size: 0.05, lacing: 0,
    under: { blunt: 0.25, cut: 0.3, pierce: 0.2 },
    // What else may be under a gap (a kit's `mail`: the zones, or 'all', where it has mail under them; a zone's `under`):
    // riveted mail over the arming doublet (voiders, gussets, a standard, a mail skirt), which turns an edge and a point
    // less (as the kits' own mail over its padding: cut ~0.88, pierce 0.65); bare skin.
    layers: { mail: { blunt: 0.3, cut: 0.85, pierce: 0.65 }, bare: { blunt: 0, cut: 0, pierce: 0 } },
    // A zone counts as one when the normal of the struck surface faces this far (cosine) towards where it opens (`faces`).
    facing: 0.3,
    // Each zone on the parts it lies on, measured on the man's own body: on the trunk, `height` the share of the way from
    // his hips to his neck and `round` the degrees round from the front of his chest (to either side; 180 his back), `cap`
    // how far up its top end the surface faces (the collar); on the head, `rise` how far up the face of the helmet faces
    // (the sine: -1 under the chin, 1 the crown) and `round` as the trunk's; on a limb, `along` the share of the way out
    // from the root joint, and `faces` the side: the trunk's (the inside of the arm), the other leg's (the inside of the
    // thigh), or the inside of the joint's bend (`crease`: the elbow's front, the knee's back). `edge`: an edge can find it
    // too (not the sights, a slit a point is put into); `helm`: only behind a helmet of that face (outfits.js HELMETS
    // `face`: a closed helm's sights, an open helmet's face); `under`: what is behind it whatever the kit. A part may have
    // more than one shape of a zone (a list).
    zones: {
      // (Behind the arm too, high, where the pauldron and the back plate part.)
      armpit: { trunk: [{ height: [0.6, 0.92], round: [50, 125] }, { height: [0.7, 0.92], round: [125, 140] }], UpperArm: { along: [0, 0.3], faces: 'trunk' }, edge: true },
      groin: { trunk: { height: [-1, 0.08], round: [0, 75] }, Thigh: { along: [0, 0.25], faces: 'inside' }, edge: true },
      // (Under the chin, and behind, the nape under the helmet's tail, where the aventail or the standard is.)
      neck: { trunk: { cap: 0.6 }, head: [{ rise: [-1, -0.5], round: [0, 180] }, { rise: [-1, -0.3], round: [120, 180] }], edge: true },
      elbow: { UpperArm: { along: [0.8, 1], faces: 'crease' }, Forearm: { along: [0, 0.2], faces: 'crease' }, edge: true },
      knee: { Thigh: { along: [0.8, 1], faces: 'crease' }, Shank: { along: [0, 0.2], faces: 'crease' }, edge: true },
      visor: { head: { rise: [-0.05, 0.4], round: [0, 35] }, helm: 'closed', under: 'bare' },
      face: { head: { rise: [-0.5, 0.35], round: [0, 55] }, helm: 'open', under: 'bare', edge: true },
    },
    // For a man weighing his blows (ai.js harmThrough): the share of the points that land on a part aimed at that falls in
    // one of its zones (measured, tools/gaps.js: on the trunk 12%, the head 33% behind a closed helm (the throat, the
    // sights), 55% behind an open one (its face, the throat); a limb's joints a guess).
    aimed: { trunk: 0.12, limb: 0.1, head: { closed: 0.33, open: 0.55, sealed: 0.2, bare: 0 } },
    // Never a gap, not even at the lacing: the middle of the breast, the back, the crown.
    solid: { trunk: [{ height: [0.08, 1.1], round: [0, 50] }, { height: [-1, 1.1], round: [125, 180] }], head: [{ rise: [0.4, 1], round: [0, 180] }] },
  },
  // A point meets plate square enough to bite only within ~35 degrees of
  // square (the cosine, 0.82); further round the curve of a breastplate or
  // helm it skids off and goes in nowhere, as arrows and spear points were
  // seen to on plate: the medial ridge and rounded breast were made so.
  bite: 0.82,
  // A point the armour stops (it skids off, or comes short of going through: PUNCTURE) is still a blow on it: what of the
  // point's share did not go in lands as the blow's, `stopped` of it (the rest is the armour's own give: the plate dented,
  // the lames bent, the shaft's flex), and the armour spreads that as it spreads any blow (its `blunt`). 0.5, as an edge
  // turned to its flat (WORLD.skill.flatBlunt). So a lance at the gallop that does not go through still stoves a man in:
  // the user's call, 2026-11-09 (a Bayara on foot took a full charge on his brigandine for under 5% of his health).
  stopped: 0.5,
  sever: {
    // joint: [J for a typical limb, the segment whose thickness scales it, typical radius m]
    // The limbs' are an eighth below what they were (wrist 34, elbow 60, shoulder 105, ankle 55, knee 94, hip 195): an
    // edge does not shear a long bone through its whole section, it is a wedge, and cortical bone (brittle across the
    // grain: fracture toughness ~2-5 MPa·√m against a shear strength of ~50-70 MPa) splits ahead of it once it is in, so
    // the last of the section parts for less than its shear work. (The neck is not a limb: as it was.)
    wrist: [30, 'Forearm', 0.035], elbow: [53, 'Forearm', 0.04], shoulder: [92, 'UpperArm', 0.05],
    ankle: [48, 'Shank', 0.045], knee: [83, 'Shank', 0.055], hip: [172, 'Thigh', 0.08], neck: [120, null, 0],
  },
  // What is left of a limb to cut through (physics.js limbResistance): the energy to go through it (`sever`) is the
  // flesh's (skin, muscle, tendon: 1 - `bone` of it) and the bone's (`bone`: the bone takes most of the work, as a
  // butcher's cleaver finds; the soft tissue parts under an edge for little). An edge that stops in the limb leaves it
  // so: of the flesh it parted, `reopen` lies where the next blow at that place cuts (a blow put to a place lands within
  // a hand's breadth of the last; a wound gapes, and what is cut does not resist again); of the bone, what it notched.
  // An edge that goes into the bone `splits` of the way (by energy: what is past the flesh, and as much of it as came
  // square across the limb, BLADES.bone `grazeShare` for a graze) breaks it: a notched long bone fails across the notch
  // under the limb's own load (a notch a third or more into a cortical tube takes most of its bending strength). A
  // broken bone carries `fractured` of its share: the ends move apart under the next edge, only the splinters and the
  // periosteum to part, and the flesh is all that holds the limb on. So a heavy cut short of the bone's work cuts, past
  // it breaks, past the whole limb takes it off; and a broken or cut-into limb comes off to a blow that would only
  // have cut a whole one — what is left of the limb resists, not a rule for a second blow.
  limbCut: { bone: 0.6, splits: 0.45, fractured: 0.2, reopen: 0.5 },
  // A cut or a stab in a limb breaks the bone only if it reaches it: the
  // flesh takes the first `fleshJ` of it, all past `fullJ` gets to the bone;
  // and a blow that only grazes the side of the limb (its line passing far
  // from the axis, the bone) carries `grazeShare` of that, a square one all
  // of it. So force and precision both decide; short of the bone it bleeds.
  // Below the sever energies: a hard square cut breaks a limb before it takes it off.
  // `flesh`: what a limb wound that stops short of the bone still counts towards the limb's health: cut muscle and
  // tendon weaken it, and enough of them disable it as a broken bone does (before, it only bled, and a forearm cut
  // to the bone's edge twice over did nothing but bleed).
  bone: { fleshJ: 15, fullJ: 60, grazeShare: 0.3, flesh: 0.35 },
  zone: 0.32, // share of the segment's length from its end that counts as at the joint
  lethalPierce: 45,
  // A point through the heart or the great vessels of the chest (past `lethalPierce`, in the upper trunk) is the worst
  // injury there is short of the head: it takes `organ` of the chest's health at once (WORLD.injury.trunkFatal), on top
  // of the point's own harm (pierceTrauma), and the vessels bleed him to collapse in `seconds` s. A hard thrust through
  // the heart (~55 J) so kills him outright, by the chest's health; one barely past the mark leaves him a fifth of it,
  // fighting on for a little until the next blow there or the blood ends him. (It was a bleed timer that dropped him
  // 8 s later however hard the thrust, and the chest's health did not move.)
  vital: { organ: 0.6, seconds: 45 },
  // How much of a point's energy (J) counts as injury to the trunk or the head (a limb's: 0.25, as its bone takes it).
  // As much as an edge (1/6, ~0.17): what a point does is inside him — a lung, the gut, the liver opened — and that
  // is the injury, not the bleeding. It was 0.04 and then 0.1, when the wound's bleeding was taken for its harm:
  // a spear in the belly then barely moved the health he had, and only killed by bleeding.
  pierceTrauma: 0.17,
  // A weapon's blunt blow crushes the tissue under it: of the contact's energy that its blunt share puts through the
  // armour (J), this much counts as injury to the part (as an edge's 1/6 and a point's pierceTrauma; physics.js
  // bluntConsequences takes it where it is worse than the part's speed change, the fist's and the fall's measure). The
  // speed change of the whole part alone is the blow's momentum spread over 28 kg of trunk: a hard head of 1.7 kg at
  // 23 m/s (430 J) then did less than a heavy jab twice over, and the hammer's blows off the head did next to nothing.
  // Calibrated on the chest: Kroell's pendulum (23.4 kg, a flat 15 cm face, at 6.7 m/s: ~285 J of collision on a 28 kg
  // trunk) breaks several ribs (AIS 3), what WORLD.damageCapacity calls seriously hurt (8.8 m/s): 0.03 × 285 ≈ 8.6.
  crushTrauma: 0.03,
  // The face of that pendulum (m, its radius: Kroell's flat 15 cm disc). The crush is the tissue's injury under the head,
  // and goes by how deep the face presses in, as the speed change does (WORLD.contactStress, physics.js contactStress):
  // a weapon's striking face of radius a (its `face`, else its `radius`: the head's, the club's thickness) crushes
  // √(crushFace / a) times what the pendulum's would for the same energy, to the same `most` (a club 1.37, a wolf-tooth
  // mace 1.34, a kanabo or a champi 1.22; a flange's edge, a hammer's face, a bat, a baton at the limit, 1.5). Only a blunt
  // weapon's head (physics.js bluntHeaded); a blade's flat and a spear's shaft as the pendulum. It crushed as a 15 cm disc before.
  crushFace: 0.075,
  // Edge alignment: a cut needs the edge moving across the blade, not along it.
  cutAlignmentPower: 2,
  // The draw of a curved edge (sliceGain; a blade's `curve`). An edge parts flesh with less push the faster it slides
  // along itself as it goes in: with the slice/push ratio ξ (the speed along the edge over the speed into the cut) the
  // push needed falls as 1/(1 + ξ²), the rest of the work drawn from the slide (Atkins, Xu and Jeronimidis 2004, cutting
  // cheese and salami by 'pressing and slicing'; Atkins 2009, The Science and Engineering of Cutting), so the same press
  // opens (1 + ξ²) the wound: longer, as deep. Measured cutting forces stop falling once the slide is about twice the
  // push (Reyssat et al. 2012, 'Slicing softly with shear'): ξ is counted to `most`. A slide parts what is cut fibre by
  // fibre (skin, flesh, cloth, quilting, leather), not steel: rings and plates are stopped by their hardness, however the
  // edge meets them, so armour proof against an edge to `hardFrom` or more (mail, lamellar, scale, plate: BLADES.gaps
  // `rigidFrom`) gives the slide nothing.
  slice: { most: 2, hardFrom: 0.75 },
  // A thrust pierces only with the point: contact this far out along the striking length.
  pointShare: 0.78,
  // Bleeding (bleedRate): a wound bleeds only past `from` J of edge or point through the armour — what the log calls a
  // deep cut (> 40 J) or a man run through (> 25 J). Short of it (a graze, a nick, a cut stopped in the mail or the
  // padding, a point turned by the plate) it bleeds a little and stops of itself, and does not count; past it,
  // `perJoule` of his blood a second for each joule beyond, by where it is (`zone`), easing as it clots over
  // `clotSeconds`. So most blows open nothing that bleeds, and a deep wound bleeds slowly: a 60 J cut through a
  // forearm loses ~2 % of his blood, a 100 J cut across the belly ~11 %, a 50 J thrust into it ~7 %, against the
  // ~21 % at which he collapses (collapseAt × BODY.toughness) — several deep wounds and minutes, not one and seconds.
  // What kills is the injury to the head and the trunk (WORLD.injury, the parts' health).
  // The great vessels are their own: a limb's artery opened (`artery`: a cut or point that goes to the bone of the
  // thigh or the upper arm, where the femoral and brachial run, `reach` of the way there by boneShare) collapses him in
  // `seconds`; the chest's, `vital`. Before this a wound bled 3–4× as fast past 0.5 J, by the blade's full energy:
  // three in four blows started a bleed, and a cut or two dropped a man in seconds.
  bleed: { from: { cut: 40, pierce: 25 }, perJoule: { cut: 0.00002, pierce: 0.00003 }, zone: { head: 1.2, trunk: 1.5, limb: 1 }, artery: { reach: 0.6, seconds: 90 } },
  // A wound eases as it clots, over about a minute of fighting (exertion keeps it open).
  clotSeconds: 60,
  collapseAt: 0.38,
  // Blood loss weakens: muscles at this share at the point of collapse.
  shockStrength: 0.55,
  // Grip: hard knocks to the weapon arm or the weapon strain the grip by
  // impulse over (this × the hand's strike force); past 1 the weapon goes.
  // Of a knock on the weapon, the hand has to stop only its own share: the
  // weapon's mass takes the rest (`gripHold`: the forearm and hand's share
  // of the arm, as a blow's effective mass reckons it; both arms on a
  // two-handed weapon), so a heavy mace is hard to beat out of a fist and a
  // light sword easy.
  gripImpulsePerNewton: 0.12,
  gripHold: 0.6,
  gripLeak: 0.5, // per second
  armHitShare: 0.6, // a blow to the forearm or upper arm, against one to the weapon
  // Blades meeting: how much bounce, and the closing speed (m/s) that counts as a clash.
  clashRestitution: 0.25,
  clashSpeed: 1.5,
  // A blow parried by a blade much lighter (physics.js beatenThrough): the parrier's side counts `braced` times its effective
  // mass (his wrist locked and shoulder set for it), and a blow keeping `from` or more of its speed through the meeting beats the
  // blade back and goes on. Swords on swords, an odachi on a katana: stopped (~0.25-0.4 kept); a mace or a war hammer on a
  // sword (~0.6-0.7), a kanabo on anything: through.
  beatThrough: { braced: 1.5, from: 0.5 },
  // A blade that glances off plate is turned aside: this share of the
  // contact impulse sends the weapon along the plate, away from the cut.
  glanceShare: 0.6,
};

export const WEAPON_KEYS = Object.keys(WEAPONS);

/** How fast a wound of `joules` (edge or point, `kind`, past the armour) bleeds, a share of his blood a second; 0 short of a deep one. */
export function bleedRate(kind, joules, zone) {
  const spec = BLADES.bleed;
  return Math.max(0, joules - spec.from[kind]) * spec.perJoule[kind] * spec.zone[zone];
}

/** The bleeding (share a second) that, easing as it clots, loses `left` of the blood in `seconds` s: a great vessel opened. */
export function bleedToLose(left, seconds) {
  const clot = BLADES.clotSeconds;
  return Math.max(0, left) / (clot * (1 - Math.exp(-seconds / clot)));
}

/**
 * Pistol shots. `lethal`: what one hit does to an unarmoured 80 kg man
 * (`referenceKg`), as a share of what kills him — one to the head, two to
 * the body, five to the arms and legs; a heavier part takes less, a hurt
 * one more (`hurtShare` per unit of damage). Armour (an outfit's
 * `protection.bullet`) takes its share off. A hit to head or body staggers
 * at once, armoured or not; every wound bleeds (`bleed`, a share of his
 * blood a second, easing as it clots: a ball in the body loses ~12 % of it,
 * in a limb ~4 %, against the ~21 % that collapses him; it was ~5× as much,
 * and a ball in the body bled him out in ten seconds whatever else it did).
 * `muzzle`: the barrel's end from the hand (along, above, m); `spread`:
 * the aim's error (rad, standard deviation) standing still, more moving or
 * reeling; `range` (m); `recoil` (N·s on the hand).
 */
const NINE_MM = { kg: 0.008, velocity: 360, curve: 'g1', bc: 0.15, calibre: 0.009 };
export const GUN = {
  referenceKg: 80,
  lethal: { head: 1, torso: 0.5, limb: 0.2 },
  hurtShare: 0.5,
  bleed: { head: 0.0008, torso: 0.002, limb: 0.0006 },
  muzzle: [0.17, 0.045],
  // The 9 mm round (`projectile`, physics/ballistics.js): a 124 gr (8.0 g) full-metal-jacket round nose at ~360 m/s, G1
  // 0.15 (Speer's figure for it): `energy` its muzzle energy.
  projectile: NINE_MM,
  spread: 0.022,
  barrelShare: 0.15, // of the barrel's own misalignment that goes into the shot
  settled: 0.08, // rad: the barrel this near the line to the mark, he fires (else at the end of the aim)
  steadyBelow: 0.35, // m/s: a shouldered gun moving less than this against the shoulder (stopped on the mark)
  movingSpread: 0.02, // more per m/s the shooter moves
  reelingSpread: 2.5, // times, staggered
  // (No range: a round flies until it comes down or is spent, physics/ballistics.js traceFlight and its cutoff.)
  // The distance (m) every round's wound figures (`lethal`, `bleed`: GUN's and each shot's) are for: a hit at a handgun
  // fight's distance and a bout's (most police shootings within ~7 m, the FBI's LEOKA counts; the shot's tables were set
  // against hits there). Nearer it carries a little more energy, further less, and its wound scales by that energy (as
  // through a screen): a matchlock's ball at 120 m does about two fifths of what it does at 7.
  woundAt: 7,
  // Recoil (N·s) into the hands, arms and shoulders: the same kick moves a
  // light arm further, and a shot fired before the gun has settled again
  // goes wider by `unsettled` rad per m/s the hand is still moving.
  recoil: 4,
  unsettled: 0.05,
  impulse: 2.9, // N·s a 9 mm round carries into what it hits
  // An outfit's `bullet` protection is what it stops of this round (J, a
  // 9 mm's energy). Against a heavier ball it stops that share only up to
  // what it is proof against (the outfit's `bulletRating`, J): a SWAT vest (rated against a
  // .44 Magnum) stops a matchlock ball as well; proofed plate stops about
  // two thirds as much; the bullet-tested tōsei dō, nine tenths; anything
  // else, only what it would of a pistol round's worth.
  energy: muzzleEnergy(NINE_MM),
  // A heavy ball is seen to strike the armour (and not to enter) only where it stopped this much.
  platedHolds: 0.45,
  // A ball the plate is proof against (physics/ranged.js bulletHit): it stuns for `stun` s on the helmet and staggers by `stagger`,
  // each for a ball of GUN.energy and in proportion to its own.
  plateKnock: { stun: 2, stagger: 0.5 },
};

/** The share of an outfit's bullet protection that holds against a shot of `energy` J. */
export function bulletProof(bulletRating, energy = GUN.energy) {
  const rating = Math.max(bulletRating ?? GUN.energy, GUN.energy);
  return Math.min(1, rating / energy);
}

/**
 * Arrows: loosed at `speed` (m/s), falling under gravity, aimed a little
 * high for the drop. Mostly a piercing wound (`lethal`, as for GUN, of what
 * kills an 80 kg man, cut by the armour's pierce protection) with a small
 * knock (`impulse`, N·s). It meets what a blade's point meets there (the
 * part's armour, or a gap and what is under it): off plate (`deflects`) it
 * glances `bounce` of the time; else the armour's `pierce` holds it.
 * A spent arrow lies `stays` s.
 */
export const ARROW = {
  // `spread` 0.025 rad (was 0.02): too true, every arrow found the middle of the breast and its plate; a war archer's
  // shafts at a man in the fight wander a hand or two at 10-20 m, and find a limb, the face, a gap, as the wounds of
  // Towton and Visby show (arms, legs, faces as often as trunks): the user's call, 2026-11-09.
  speed: 55, gravity: 9.81, spread: 0.025, length: 0.8,
  // (Of what takes an 80 kg man out of the fight, as GUN's: a war arrow into a bare head or a bare trunk drops him, one in a limb
  // a quarter of the way; raised 2026-11-03 from 0.85, 0.4, 0.13, at which a peasant took four arrows in the body.)
  lethal: { head: 1.1, torso: 1, limb: 0.25 },
  // How an arrow (or a bolt) wound bleeds: by what it went through. The shaft and head stay in the track and plug
  // it, and the track is narrow (a point, not a ball's cavity), so through muscle and the body's soft parts a man
  // bleeds slowly, over hours (the surgeons of the Hundred Years' War and of the Napoleonic wars both drew arrows
  // from men who had fought on with them: a share of a man's blood a second at the start, easing as it clots,
  // BLADES.clotSeconds, so a `muscle` wound loses ~5% of his blood, a `torso` one ~7%, against the ~21% at which he
  // collapses (BLADES.collapseAt × BODY.toughness): he fights on, slowed, and takes several before he drops of it). It kills in a minute or more only where it opens a great vessel:
  // - `artery`: the femoral or brachial artery, deep in the thigh or the upper arm (an arrow whose path passes
  //   within `deep` of the limb's radius of its axis, where the vessel runs by the bone): `seconds.artery` to collapse;
  // - `chest`: deep in the upper trunk (the same `deep` share off its axis, above `chestFrom` of the way from
  //   the pelvis to the neck): the heart and the great vessels, `seconds.chest` s of fight left (an arrow is slower
  //   than a blade's open cut: the shaft holds the wound, Bodiam's and Towton's men shot through the chest);
  // - `abdomen`: deep in the belly below that: the aorta, the vena cava, the liver: `seconds.abdomen` to collapse;
  // - `throat`: the neck's vessels (carotid, jugular): as the chest;
  // - `head`: the scalp and face bleed freely but little (an arrow into the skull kills by `lethal`).
  // Each scaled by how much of it got through the armour, and only `deepFrom` of a war arrow's energy or more
  // reaches a great vessel. A bullet's wound is not this: the ball tears a cavity that bleeds freely (GUN.bleed),
  // and is left as it is.
  wound: {
    rate: { muscle: 0.0008, torso: 0.0012, head: 0.0012 },
    // (`chest` as a blade's through the heart, BLADES.vital; it was 20 s, a timer that dropped him before anything else could.)
    seconds: { artery: 90, abdomen: 75, chest: 45 },
    deep: 0.4, chestFrom: 0.45, deepFrom: 0.3,
  },
  // The knock (`impulse`, N·s) is the reference war arrow's (`joules` at `speed`: ~66 g at 55 m/s, its momentum 2·joules/speed,
  // ARROW_MOMENTUM); another arrow or a bolt knocks by its own momentum against that one's (physics/ranged.js arrowHit): a
  // heavy Manchu arrow staggers a man more than a light steppe one of the same energy. What goes through armour is the
  // energy at the point; what knocks him is the momentum.
  impulse: 1.4, bounce: 0.9, stays: 6,
  // Its flight through the air (physics/ballistics.js): the drag on its shaft's section, Cd `cd` (Park 2011's 1.5-2.6 for
  // a fletched arrow, the turbulent figure for a war arrow's big feathers and rough shaft), on a shaft of `shaft` m (the Mary
  // Rose's arrows, ~10-13 mm at the middle, tapering) or a bolt's of `boltShaft` (a crossbow's stubby bolt, ~14-17 mm
  // behind its head); its mass that of its energy at its speed (a long bow's war arrow ~66 g, a lighter arrow less, which the
  // same drag slows the faster: a 40 g arrow sheds its speed over a distance ~1.7 times as fast as a 66 g one).
  flight: { cd: 2, shaft: 0.0115, boltShaft: 0.015 },
  // The reference war arrow's energy (J; an arrow's `energy` 1): a ~66 g shaft at ~55 m/s, ~100 J. Each bow's own arrow carries
  // what its build gives it (bowCast), counted against this. In a horse (physics/ranged.js missileInHorse) it is a point of that many joules.
  joules: 100,
  // Shooting from a rank behind his own: the arrow is put up over the heads of the men in front (physics/ranged.js
  // overHeads), on the arc that comes down on the mark, the bow drawn the less the higher it goes; tried from the flat
  // shot upward `step` rad at a time (~0.6 deg, finer than an archer lays his bow) to `most` rad (43 deg: about the
  // elevation of a bow's longest cast, the massed lob of the rear ranks; higher, an arrow only comes down slower and nearer).
  over: { step: 0.01, most: 0.75 },
  // The share of a ball's energy left in a horse it strikes (the ball goes on through a body that size, or lodges with what
  // little it has left): a quarter, taken over the wound channel.
  horseShare: 0.25,
};

/** The reference war arrow's momentum (N·s): ARROW.joules at ARROW.speed, ~66 g × 55 m/s. */
export const ARROW_MOMENTUM = (2 * ARROW.joules) / ARROW.speed;

/** What a bullet hit is to: head, torso (the trunk) or limb. */
export function bulletRegion(capsuleKey) {
  if (capsuleKey === 'head') return 'head';
  if (capsuleKey === 'trunk') return 'torso';
  return 'limb';
}

/**
 * Where the off hand holds, along the weapon from the main hand (m): a
 * sword's pommel hand below and behind the guard hand; on a polearm
 * (`leadAhead`) the front hand reaches up the shaft ahead of the rear one,
 * as spears and hammers are held, so neither arm folds back.
 */
export function offHandAlong(spec) {
  return spec.leadAhead || spec.supportAhead ? spec.spacing : -spec.spacing;
}

/**
 * How far back along the weapon the rear (main) hand is set from where a
 * move puts the grip, for a polearm held with the lead hand ahead: the two
 * hands straddle that point, so the front hand is no further out — no more
 * exposed to a blade — than a single grip there would be.
 */
/**
 * Missiles brought up to the line: a shooter on foot standing in his side's formation (a drawn-up line, `slot`)
 * is not left with what he carried. The boys of the baggage ran sheaves up to the English archers (Agincourt,
 * Crécy: the wagons stood behind the line); the Han crossbowmen had bolts from the carts; the gunners' powder and
 * ball came up from the munition wagons. His ammunition spent, a fresh load (his weapon's `ammo`, or his kit's) is
 * put into his hands after `seconds` s (the bearer's run along the back of the line), at most `loads` times: a long
 * battle's worth at the game's rate of shooting, and then that is all there is (physics/ranged.js resupplyInLine).
 * A man out of his ranks (a skirmisher, a horse archer) has only what he carries, or his side's train (riding.js).
 */
export const SUPPLY = { seconds: 5, loads: 2 };

export const LEAD_GRIP = { rearShare: 0.5 };

/**
 * Where a segment comes nearest a disc (centre c, unit normal n, radius r):
 * sampled along the segment, which is plenty for a short blade or limb.
 * Returns { distance, point (on the disc), along (0–1 on the segment) }.
 */
export function segmentToDisc(a, b, centre, normal, radius, samples = 10) {
  let best = { distance: Infinity, point: centre, along: 0 };
  for (let index = 0; index <= samples; index += 1) {
    const along = index / samples;
    const p = vec.lerp(a, b, along);
    const offset = vec.sub(p, centre);
    const height = vec.dot(offset, normal);
    const flat = vec.sub(offset, vec.scale(normal, height));
    const out = vec.length(flat);
    const onDisc = out <= radius ? vec.add(centre, flat) : vec.add(centre, vec.scale(flat, radius / out));
    const distance = vec.length(vec.sub(p, onDisc));
    if (distance < best.distance) best = { distance, point: onDisc, along, from: p };
  }
  return best;
}

/** A fighter's weapon, in hand, for a style that carries one. */
export function createWeapon(kind) {
  const spec = WEAPONS[kind];
  if (!spec) return null;
  return {
    kind, spec, main: spec.hand === 'l' ? 'l' : 'r', off: spec.hand === 'l' ? 'r' : 'l', held: true, twoHanded: spec.hands !== 'one',
    dir: [1, 0, 0], spin: [0, 0, 0], tip: [0, 0, 0], tipPrev: null, tipVelocity: [0, 0, 0], strain: 0,
    // A gun with a charge (a matchlock) starts loaded.
    loaded: true, reloaded: 0,
    // What a weapon gains in the fight, named here (unset) so that every weapon has one shape.
    handling: undefined, charges: undefined, colour: undefined, edge: undefined, dulled: undefined, spent: undefined,
    draw: undefined, facing: undefined, rope: undefined, wear: undefined,
    // Whose make it is (a key of its spec's `makes`), or null: the weapon as listed.
    make: null,
  };
}

/** The share of the weapon's mass each hand carries. */
export function handShares(spec) {
  return spec.hands === 'one' ? { main: 1, off: 0 } : { main: 0.6, off: 0.4 };
}

/**
 * The effective mass at `distance` along the blade from the main hand, for
 * the weapon held by an arm whose own effective mass sits at the grip: a
 * free rigid body of the two, struck at that point (1/m = 1/M + d²/I).
 * Near the balance it is nearly the whole system; far out, much less.
 */
export function effectiveMassAt(spec, armMass, distance, armLength = 0.6, along = 0, held = false) {
  const total = spec.mass + armMass;
  const centre = (spec.mass * spec.balance) / total;
  const reach = spec.length + spec.handle;
  const ownInertia = (spec.mass * reach * reach) / 12;
  const inertia = ownInertia + spec.mass * (spec.balance - centre) ** 2 + armMass * centre * centre;
  const loose = 1 / (1 / total + (distance - centre) ** 2 / Math.max(1e-4, inertia));
  // A committed blow is struck with the wrist locked: arm and weapon turn
  // as one about the shoulder for the instant of contact.
  const pivoted = (armMass * (armLength * 0.45) ** 2 + ownInertia + spec.mass * (armLength + spec.balance) ** 2) / (armLength + Math.abs(distance)) ** 2;
  const turning = Math.max(loose, pivoted);
  // Along the blade (a thrust) the arm and weapon push as one mass; across
  // it (a cut) they must turn. Mixed by how the contact moves: a push in one
  // line (an edge, a point sliding) meets the two in series. A point that goes
  // in (`held`) stops in him: its motion along the shaft and across it are each
  // stopped by their own mass (each axis takes its own ½ m v²), side by side.
  if (held) return along * along * total + (1 - along * along) * turning;
  return 1 / ((along * along) / total + (1 - along * along) / turning);
}

/** Whether a thrust's contact is its point going in: on the point (`pointFrom`), driven near along the blade. */
export function pointFirst(spec, along, at) {
  return at >= (spec.pointFrom ?? BLADES.pointShare) && along > 0.5;
}

/**
 * How a contact cuts and pierces, from the blade's motion where it touched:
 * `along` is the share of the closing speed directed along the blade, `at`
 * how far along the striking length (0 hilt, 1 tip). A thrust's point that
 * arrives point-first pierces; any edge moving across the blade cuts.
 */
export function harmMix(spec, mode, along, at) {
  const table = spec.harm[mode] ?? spec.harm.swing ?? { blunt: 1 };
  const mix = { blunt: table.blunt ?? 0, cut: 0, pierce: 0 };
  const across = Math.sqrt(Math.max(0, 1 - along * along));
  if (mode === 'thrust') {
    // A spear's whole head is its point (a leaf of sharp iron): driven along the shaft it goes in wherever on the head it meets him.
    const goesIn = pointFirst(spec, along, at);
    mix.pierce = goesIn ? (table.pierce ?? 0) * along : 0;
    mix.cut = (table.cut ?? 0) * across ** BLADES.cutAlignmentPower;
    if (!goesIn) mix.blunt = Math.max(mix.blunt, 0.3);
  } else {
    mix.cut = (table.cut ?? 0) * across ** BLADES.cutAlignmentPower;
    mix.pierce = 0;
  }
  return mix;
}

/**
 * A point (an arrow's, a bolt's, a spear's, a lance's, a dagger's, a tooth's) against armour: the armour is proof against so
 * many joules at the point (its puncture: punctureOf, from its `pierce` and the point's width), and stops all of a point that
 * brings less; a man under it feels the blow, not the point. A point that brings more goes through: the armour spends its
 * puncture on it, and the hole's edges and the padding behind still hold `after` × pierce of what is left. So harm is nearly
 * nothing below the puncture and rises steeply past it, as an arrow stands in mail that a heavy bolt goes through, and a hand
 * thrust stops on a breastplate that a lance at the gallop goes through. Each strike `spread` either way of the armour's
 * puncture: where on a plate or a ring it lands, the point's own set (`roll` 0..1, the strike's own draw).
 * The puncture is in proportion to the point's width (a weapon's `pointWidth`, else its blade's own, twice its `radius`)
 * against a war arrow's bodkin, `width` (~10 mm, the Mary Rose's and the Tower's square bodkins): the armour must open a hole
 * that wide, parting as many more rings, lamellae or as much more plate (the perforating energy of a thin plate goes with the
 * point's perimeter); a narrow bodkin or a rondel goes where a broad blade or a leaf-bladed spear stops. And it rises with
 * the armour's odds against a point (pierce / (1 − pierce)), to a `power` of them, fitted to two points for the bodkin and
 * nothing else: mail on its padding (pierce 0.65) at `joules`, ~95 J, a war arrow's ~100 J just at it (the Frankish foot on
 * the march to Arsuf, 1191, with arrows standing in their mail), a crossbow's ~170 J bolt well past it; and a breastplate
 * (0.95) at ~300 J, past any hand bow (Williams, The Knight and the Blast Furnace, 2003: good plate needs some hundreds of
 * joules at a bodkin, more than a war bow gives). For the rest it follows: for a bodkin, a padded coat (0.3) ~45 J, iron
 * lamellar (0.85) ~165 J, a brigandine (0.9) ~205 J, a jousting harness's thick plate (0.985) ~550 J; for a sword's ~24 mm
 * point, plate ~720 J, past the hardest lunge with the body behind it (~600 J at the point, tools/gaps.js); for a lance's
 * narrow ~25 mm head, plate ~750 J, under the lance couched at the full gallop and met square (~900-1000 J,
 * tools/couched.js), which did go through a harness, and a jousting harness ~1400 J, past it (the lance lands as the jolt).
 */
export const PUNCTURE = { joules: 95, at: 0.65, power: 0.5, width: 0.01, after: 0.3, spread: 0.3, most: 0.995 };

const punctureOdds = (share) => share / (1 - share);

/** The joules a point `width` m across must bring to go through armour of this `pierce` (PUNCTURE). */
export function punctureOf(pierce, width = PUNCTURE.width) {
  const share = Math.min(PUNCTURE.most, Math.max(0, pierce ?? 0));
  return PUNCTURE.joules * (punctureOdds(share) / punctureOdds(PUNCTURE.at)) ** PUNCTURE.power * (width / PUNCTURE.width);
}

/** How wide a weapon's point is as it goes in (m): its own `pointWidth` (a head on a shaft, a spike), else its blade's, twice its `radius`. */
export const pointWidthOf = (spec) => spec.pointWidth ?? 2 * (spec.radius ?? PUNCTURE.width / 2);

/**
 * The share of a point bringing `joules` (physical, at the point), `width` m across, that gets through armour of this
 * `pierce` (PUNCTURE), the strike's draw `roll` (0..1).
 */
export function pointThrough(joules, pierce, roll = 0.5, width = PUNCTURE.width) {
  const share = Math.min(PUNCTURE.most, Math.max(0, pierce ?? 0));
  if (!(joules > 0)) return 0;
  if (share <= 0) return 1;
  const proof = punctureOf(share, width) * (1 + PUNCTURE.spread * (2 * roll - 1));
  return joules <= proof ? 0 : ((joules - proof) / joules) * (1 - PUNCTURE.after * share);
}

/**
 * What a curved edge's draw adds to a cut (× the cut's harm; 1 for a straight blade), from the blade's motion where it met
 * him: `relative` (m/s) its velocity against the part struck, `dir` the blade's line from the grip (the hilt's tangent:
 * a sabre is drawn bowing back off it), `distance` (m) out along it from the hand, `protection` what it met there.
 * A blade's `curve` (m) is how far its back bows off that line at the point, as a parabola from the hilt (+: the edge on
 * the outside of the curve, the sabre's; −: inside it, the yatagan's forward curve). At the contact the edge leans
 * back from the grip's line by α = 2·curve·s/L² (s out of L): the swing, coming in across the blade, meets an edge
 * already sloping away, and slides along it at ξ = tan(θ ± α) where a straight blade's edge slides at tan θ (θ the angle
 * of the blade's motion off square to it: the draw of the arm, and the speed of the horse under a rider whose blade
 * trails). The rider's forward speed is in `relative` (physics.js handVelocityOf adds the horse's), so the curve turns
 * that too into slide. A straight edge's slide is already the cut's alignment (harmMix, cutAlignmentPower): what is
 * counted here is only what the curve adds, (1 + ξ²) / (1 + ξ₀²) (BLADES.slice). A blade pushed out towards its point as
 * it cuts slides less with a curve (the curve leans back against the push), but a straight blade's slide was never
 * counted as help to its cut (the alignment loses it), so there is none to take back: then the curve only squares the
 * edge to the push, and the cut is the straight blade's (× 1). Nothing through mail or plate.
 */
export function sliceGain(spec, relative, dir, distance, protection = {}) {
  const curve = spec.curve ?? 0;
  const rule = BLADES.slice;
  if (!curve || (protection.cut ?? 0) >= rule.hardFrom) return 1;
  const chord = relative[0] * dir[0] + relative[1] * dir[1] + relative[2] * dir[2];
  const across = Math.hypot(relative[0] - chord * dir[0], relative[1] - chord * dir[1], relative[2] - chord * dir[2]);
  if (across < 1e-6) return 1;
  const share = Math.max(0, Math.min(1, distance / spec.length));
  const lean = Math.atan((2 * Math.abs(curve) * share) / spec.length);
  // The edge leans away from the way it moves (a sabre's back bows away from its edge): it meets the motion's chord-wise
  // part as a draw towards the hilt adds to it. A forward curve leans the other way.
  const sign = Math.sign(curve);
  const slide = Math.abs(chord * Math.cos(lean) - sign * across * Math.sin(lean));
  const press = across * Math.cos(lean) + sign * chord * Math.sin(lean);
  if (press <= 1e-6) return 1;
  const ratio = Math.min(rule.most, slide / press);
  const straight = Math.min(rule.most, Math.abs(chord) / across);
  return Math.max(1, (1 + ratio * ratio) / (1 + straight * straight));
}

const addVec = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

/** Spherical blend of two unit vectors. */
export function slerpDir(a, b, t) {
  const cos = Math.max(-1, Math.min(1, vec.dot(a, b)));
  if (cos > 0.9995) return vec.normalize(vec.lerp(a, b, t));
  const angle = Math.acos(cos);
  const sin = Math.sin(angle);
  if (sin < 1e-4) {
    // Opposite: turn through a perpendicular.
    const side = vec.normalize(Math.abs(a[1]) < 0.9 ? vec.cross(a, [0, 1, 0]) : vec.cross(a, [1, 0, 0]));
    return t < 0.5 ? slerpDir(a, side, t * 2) : slerpDir(side, b, t * 2 - 1);
  }
  const wa = Math.sin((1 - t) * angle) / sin;
  const wb = Math.sin(t * angle) / sin;
  return vec.normalize(addVec(scale3(a, wa), scale3(b, wb)));
}

/**
 * The guard a weapon style stands in: where the main hand is (local, in
 * heights) and where the weapon points.
 */
export function guardTargets(style, body) {
  const guard = style.weaponGuard;
  const H = body.heightM;
  return { hand: scale3(guard.hand, H), dir: vec.normalize(guard.dir) };
}

/**
 * The share of a blade's length at which a swing is laid to meet its mark (`contactAt`, 0.7 if unset); a move made to land
 * with the weapon's sweet spot (`sweetSpot`: a weapon art's) lays it at the middle of the striking part, from `strikeFrom` to
 * the tip: a hammer's head, a club's thick half, not its haft.
 */
export function contactShare(move, spec) {
  return move.sweetSpot ? (spec.strikeFrom + spec.length) / (2 * spec.length) : move.contactAt ?? 0.7;
}

/**
 * Targets for a weapon move at time t: the main hand (local) and the blade's
 * direction. A swing is a curve from the cocked position to the follow-
 * through, bent so that `contactAt` of the blade passes through the aim
 * halfway; the blade turns between the two. A thrust drives the point
 * along the line to the aim and past it.
 */
export function bladeTargets(move, t, aim, body, spec, reachShare = 1) {
  const H = body.heightM;
  const from = { hand: scale3(move.from.hand, H), dir: vec.normalize(move.from.dir) };
  if (move.mode === 'thrust') {
    // Point on the line from the hand to the aim, then driven along it, so
    // the point arrives first; it goes `depth` past the surface it aims at.
    const dir = vec.normalize(vec.sub(aim, from.hand));
    // Driven hilt first (a weapon art's pommel strike, `hilt`): the blade laid back along the line, the pommel leading.
    const pointing = move.hilt ? scale3(dir, -1) : dir;
    if (t < move.windup) return { hand: from.hand, dir: slerpDir(from.dir, pointing, Math.min(1, t / Math.max(1e-3, move.windup))) };
    const u = Math.min(1, (t - move.windup) / (move.extendUntil - move.windup));
    // (The pommel is `handle` behind the hand: the hand goes to `depth` past the surface, less that.)
    if (move.hilt) return { hand: vec.lerp(from.hand, vec.sub(aim, vec.scale(dir, spec.handle - (move.depth ?? 0.1))), Math.min(1, u / (move.extendShare ?? 0.75)) ** 2), dir: pointing };
    // Couched: the hand stays at the hip on that line, and goes on along it only as far as the body throws itself in (`drive`).
    if (move.couched) return { hand: vec.add(from.hand, vec.scale(dir, move.couched.drive * Math.min(1, u / (move.extendShare ?? 0.75)) ** 2)), dir };
    // Accelerating all the way in, as a punch does, not easing to a stop at the skin.
    const end = vec.sub(aim, vec.scale(dir, spec.length * reachShare - (move.depth ?? 0.25)));
    // Fully out by `extendShare` of the way (three quarters by default), then
    // held there for the hand to arrive: a spear driven hard is out sooner,
    // its pace then the arms' and the step's (the muscles' cap), not the path's.
    const out = Math.min(1, u / (move.extendShare ?? 0.75));
    return { hand: vec.lerp(from.hand, end, out * out), dir };
  }
  const to = { hand: scale3(move.to.hand, H), dir: vec.normalize(move.to.dir) };
  if (t < move.windup) return from;
  const u = Math.min(1, (t - move.windup) / (move.extendUntil - move.windup));
  const middleDir = move.mid ? vec.normalize(move.mid) : slerpDir(from.dir, to.dir, 0.5);
  // (Swung hilt first, `hilt`: the mordhau, the sword held reversed, its hilt end the hammer's head: laid on the mark by the
  // middle of the pommel's span behind the hand, physics/arts.js ART_MECHANICS.hilt: −(handle + knob 0.03) to −(handle − grip 0.07).)
  const middle = vec.sub(aim, vec.scale(middleDir, move.hilt ? -(spec.handle - 0.02) : spec.length * contactShare(move, spec)));
  // A quadratic curve through `middle` at u = `meet` (½ unless the move says: a weapon art meets its mark later in the
  // stroke, where the weapon, lagging the hands that drive it, has come up to its full speed).
  const meet = move.meet ?? 0.5;
  const control = vec.scale(vec.sub(vec.sub(middle, scale3(from.hand, (1 - meet) ** 2)), scale3(to.hand, meet * meet)), 1 / (2 * meet * (1 - meet)));
  const hand = addVec(addVec(scale3(from.hand, (1 - u) ** 2), scale3(control, 2 * u * (1 - u))), scale3(to.hand, u * u));
  return { hand, dir: u < meet ? slerpDir(from.dir, middleDir, u / meet) : slerpDir(middleDir, to.dir, (u - meet) / (1 - meet)) };
}
