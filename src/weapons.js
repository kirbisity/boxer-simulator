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

// Crossbows: spanned once and loaded like a gun (`shot`, one at a time, no
// misfire), they loose a bolt that flies as an arrow does (`bolt`), shorter
// and heavier: `energy` against a long bow's arrow, `bounce` the chance it
// glances off proof armour (an arrow's ARROW.bounce). A 15th-century
// steel or composite crossbow spanned with a belt hook or goat's foot:
// ~100–200 J against a war bow's ~80–100; ~8 s a shot. The Chinese nu, the
// Han's spanned with the feet (jue zhang) and the Ming's with the waist: a
// little less, quicker to span.
export const CROSSBOW = { bolt: true, speed: 50, energy: 1.7, length: 0.38, bounce: 0.72, spread: 0.012, rounds: 1, misfire: 0, reloadSeconds: 8 };
export const NU = { ...CROSSBOW, speed: 48, energy: 1.45, length: 0.42, bounce: 0.78, reloadSeconds: 6 };

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
// A percussion-cap duelling pistol of the 1840s (a cased pair by Wogdon's
// heirs or Manton): one heavy round ball (~.50, ~14 g at ~220 m/s: ~350 J),
// smoothbore but made to shoot true at twenty paces, a hair trigger; the cap
// rarely fails (a flint far more often); then the long reload down the
// muzzle: powder, ball and patch, ramrod, a new cap.
export const DUELLING = {
  energy: 350,
  lethal: { head: 1, torso: 1.1, limb: 0.35 },
  bleed: { head: 0.03, torso: 0.035, limb: 0.018 },
  limbBreak: 0.6,
  impulse: 3.2,
  recoil: 5,
  spread: 0.009,
  movingSpread: 0.035,
  misfire: 0.02,
  reloadSeconds: 25,
  rounds: 1,
};

export const MATCHLOCK = {
  energy: 1000,
  // A body hit: past the line that drops a man (1) unless armour proofed against
  // it (tōsei, plate, a SWAT vest) held a good share.
  lethal: { head: 1, torso: 1.35, limb: 0.45 },
  bleed: { head: 0.03, torso: 0.04, limb: 0.02 },
  limbBreak: 0.75,
  impulse: 5.2,
  recoil: 9,
  spread: 0.014,
  movingSpread: 0.035,
  misfire: 0.08,
  reloadSeconds: 15,
};

/**
 * The san yan chong (三眼銃, "three-eyed gun"): three short iron barrels in
 * a triangle on the end of a wooden shaft, each with its own touch-hole, lit
 * one after another for a quick volley (`barrels`, `between` s apart). Short
 * barrels and a small charge: a lighter, slower ball than a matchlock's
 * (~350 J) that scatters (`spread`). Ming border troops did not reload it in
 * the press of a fight: they swung it as a club, the iron barrels its head.
 * Dimensions are estimates (the sources give none): ~1.3 m, ~4 kg.
 */
export const THREE_EYED = {
  energy: 350,
  lethal: { head: 0.95, torso: 0.6, limb: 0.25 },
  bleed: { head: 0.02, torso: 0.03, limb: 0.012 },
  limbBreak: 0.25,
  impulse: 2.2,
  recoil: 5,
  spread: 0.05,
  movingSpread: 0.06,
  misfire: 0.12,
  barrels: 3,
  between: 0.45,
  reloadSeconds: 40,
};

/**
 * The AR-15: a semi-automatic 5.56 mm carbine. A light, very fast round
 * (~4 g at ~950 m/s, ~1750 J: more than a matchlock ball) that tumbles and
 * fragments in flesh; an optic and a fixed stock make it very accurate.
 * The gas system and buffer spring stretch its small kick over a longer
 * moment (`recoilSeconds`). Thirty rounds a magazine (`rounds`), changed in
 * a couple of seconds.
 */
export const RIFLE = {
  energy: 1750,
  lethal: { head: 1.2, torso: 1.7, limb: 0.6 },
  bleed: { head: 0.04, torso: 0.06, limb: 0.03 },
  limbBreak: 0.65,
  impulse: 3.8,
  recoil: 5,
  recoilSeconds: 0.06,
  spread: 0.005,
  movingSpread: 0.02,
  misfire: 0.002,
  rounds: 30,
  reloadSeconds: 2.5,
};

/**
 * A 12-gauge pump shotgun with 00 buckshot: nine pellets of ~3.5 g at
 * ~400 m/s (~280 J each, half a 9 mm round), in a pattern that opens about
 * `pellet` rad (~3 cm a metre). Close in nearly all of it lands; at twenty
 * metres much of it misses. A heavy charge and a heavy shot column: a hard
 * kick into the shoulder (`recoil`, N·s) that a light, weak shooter cannot
 * hold. Five shells, each pumped; reloaded one by one.
 */
export const SHOTGUN = {
  energy: 280,
  pellets: 9,
  pellet: 0.016,
  lethal: { head: 0.55, torso: 0.26, limb: 0.1 },
  bleed: { head: 0.012, torso: 0.016, limb: 0.006 },
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
};

export const WEAPONS = {
  // A side-handle-less straight police baton: hard, heavy at the tip.
  baton: {
    label: 'Police baton', hands: 'one', length: 0.58, strikeFrom: 0.12, handle: 0.08, mass: 0.6, balance: 0.24, radius: 0.019,
    harm: { swing: { blunt: 1 }, thrust: { blunt: 1 } },
    contactSeconds: 0.005, rotation: 1.15, wrist: { omega: 62, zeta: 0.6 }, threat: 1.6,
  },
  // Hand-and-a-half: two hands for the big swings, one for the lunge.
  longsword: {
    label: 'Long sword', hands: 'hybrid', length: 0.98, strikeFrom: 0.14, handle: 0.24, spacing: 0.15, mass: 1.45, balance: 0.11, radius: 0.012,
    harm: { swing: { cut: 1, blunt: 0.5 }, thrust: { pierce: 1, cut: 0.15, blunt: 0.15 } },
    contactSeconds: 0.004, rotation: 0.8, wrist: { omega: 17, zeta: 0.8 }, threat: 4,
  },
  // Two hands always: the sharper, shorter blade cuts deeper, stabs less.
  katana: {
    label: 'Katana', hands: 'two', length: 0.8, strikeFrom: 0.12, handle: 0.27, spacing: 0.17, mass: 1.15, balance: 0.12, radius: 0.012,
    harm: { swing: { cut: 1.3, blunt: 0.4 }, thrust: { pierce: 0.7, cut: 0.15, blunt: 0.15 } },
    contactSeconds: 0.004, rotation: 0.8, wrist: { omega: 20, zeta: 0.8 }, threat: 4.5,
  },
  knife: {
    label: 'Knife', hands: 'one', length: 0.21, strikeFrom: 0.05, handle: 0.1, mass: 0.22, balance: 0, radius: 0.01,
    harm: { thrust: { pierce: 0.65, blunt: 0.35 }, swing: { cut: 0.42, blunt: 0.22 } },
    contactSeconds: 0.005, rotation: 0.6, wrist: { omega: 45, zeta: 0.8 }, threat: 2.2,
  },
  // The hoplomachus's hasta: held near its balance in one hand, long ahead
  // of the hand and a good way behind it; made to thrust.
  spear: {
    label: 'Spear', hands: 'one', length: 1.3, strikeFrom: 0.9, handle: 0.6, mass: 1.6, balance: 0.18, radius: 0.016,
    harm: { thrust: { pierce: 1.3, cut: 0.1, blunt: 0.2 }, swing: { cut: 0.2, blunt: 0.6 } },
    contactSeconds: 0.005, rotation: 0.5, wrist: { omega: 14, zeta: 0.85 }, threat: 3.5,
  },
  // Polearms, two hands well apart on the shaft. `crush`: the share of
  // blunt armour a hard, heavy head drives straight through (the hammer's
  // blow is felt through plate); `grip`: how firmly the weapon is held
  // against blows (a long spear, levered from the hands, is easiest lost).
  warhammer: {
    label: 'War hammer', hands: 'two', length: 1.45, strikeFrom: 1.15, handle: 0.55, spacing: 0.42, leadAhead: true, mass: 2.6, balance: 0.85, radius: 0.04,
    harm: { swing: { blunt: 1.6 }, thrust: { blunt: 1, pierce: 0.35 } },
    contactSeconds: 0.004, rotation: 1.2, wrist: { omega: 11, zeta: 0.8 }, threat: 4, crush: 0.45,
  },
  naginata: {
    label: 'Naginata', hands: 'two', length: 1.5, strikeFrom: 1.0, handle: 0.5, spacing: 0.4, leadAhead: true, edgeLeads: true, mass: 2.35, balance: 0.55, radius: 0.014,
    // A heavy head on a long shaft (+25% weight, +25% blunt): it knocks men about as it cuts.
    harm: { swing: { cut: 1.3, blunt: 0.625 }, thrust: { pierce: 0.75, cut: 0.15, blunt: 0.25 } },
    contactSeconds: 0.004, rotation: 0.8, wrist: { omega: 14, zeta: 0.8 }, threat: 4.5,
  },
  longSpear: {
    label: 'Spear', hands: 'two', length: 1.75, strikeFrom: 1.45, handle: 0.5, spacing: 0.45, leadAhead: true, mass: 1.9, balance: 0.55, radius: 0.016,
    harm: { thrust: { pierce: 1.3, blunt: 0.25, cut: 0.15 }, swing: { blunt: 0.6, cut: 0.2 } },
    contactSeconds: 0.005, rotation: 0.5, wrist: { omega: 13, zeta: 0.85 }, threat: 3.5, grip: 0.5,
  },
  // A modern 9 mm service pistol: fired, not swung (`ranged`; see GUN). In
  // the hand a small light thing, very easily knocked away (`grip`); swung
  // in close, the frame clubs. `edgeUp`: drawn with its sights up.
  pistol: {
    label: 'Pistol', hands: 'one', length: 0.19, strikeFrom: 0.04, handle: 0.05, mass: 0.75, balance: 0.04, radius: 0.018,
    harm: { swing: { blunt: 0.7 }, thrust: { blunt: 0.5 } },
    contactSeconds: 0.004, rotation: 0.6, wrist: { omega: 22, zeta: 0.9 }, threat: 6, grip: 0.12, ranged: true, edgeUp: true,
  },
  // The duelling pistol (DUELLING): a long octagonal barrel on a walnut
  // half-stock, the rounded grip; one shot, then muzzle-loading. Swung, the butt clubs.
  duellingPistol: {
    label: 'Duelling pistol', hands: 'one', length: 0.3, strikeFrom: 0.2, handle: 0.07, mass: 1.2, balance: 0.12, radius: 0.016,
    harm: { swing: { blunt: 0.8 }, thrust: { blunt: 0.5 } },
    contactSeconds: 0.004, rotation: 0.6, wrist: { omega: 20, zeta: 0.9 }, threat: 5, grip: 0.15, ranged: true, edgeUp: true,
    muzzle: [0.3, 0.045],
    shot: DUELLING,
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
  // A long wooden staff (the Shaolin gun): held near its middle, both ends
  // striking (`strikeFrom` reaches back past the hands to the butt). Wood
  // only: blunt harm, a softer contact than steel; its length makes it quick
  // at the ends, a little more than a baton.
  staff: {
    label: 'Staff', hands: 'two', length: 0.95, strikeFrom: -0.85, handle: 0.85, spacing: 0.5, leadAhead: true, mass: 1.6, balance: 0.05, radius: 0.016,
    harm: { swing: { blunt: 1 }, thrust: { blunt: 0.8 } },
    contactSeconds: 0.007, rotation: 0.9, wrist: { omega: 18, zeta: 0.8 }, threat: 3.8, grip: 0.6,
  },
  // The Spanish espada: a one-handed cut-and-thrust sword of Toledo steel,
  // a little longer than a short sword, made for the thrust.
  espada: {
    label: 'Espada', hands: 'one', length: 0.85, strikeFrom: 0.12, handle: 0.14, mass: 1.1, balance: 0.12, radius: 0.011,
    harm: { thrust: { pierce: 0.95, cut: 0.2, blunt: 0.1 }, swing: { cut: 0.9, blunt: 0.35 } },
    contactSeconds: 0.004, rotation: 0.7, wrist: { omega: 24, zeta: 0.8 }, threat: 3.4,
  },
  // The rapier: a long, slender thrusting sword with a swept hilt. Its point
  // is everything (`pierce`); its narrow edge cuts a little, it barely bruises.
  rapier: {
    label: 'Rapier', hands: 'one', length: 1.05, strikeFrom: 0.1, handle: 0.14, mass: 1.15, balance: 0.1, radius: 0.008,
    harm: { thrust: { pierce: 1.6, cut: 0.08, blunt: 0.03 }, swing: { cut: 0.4, blunt: 0.05 } },
    contactSeconds: 0.003, rotation: 0.5, wrist: { omega: 26, zeta: 0.8 }, threat: 3.8,
  },
  // The macuahuitl: a flat oak club edged both sides with obsidian blades.
  // Obsidian cuts flesh as nothing else does (`cut`), but it is glass: each
  // blow on steel or hard armour chips the edge (`brittle`: what is left of
  // its cutting after such a blow), while the oak still strikes (`blunt`).
  macuahuitl: {
    label: 'Macuahuitl', hands: 'one', length: 0.8, strikeFrom: 0.2, handle: 0.18, mass: 1.4, balance: 0.38, radius: 0.03, brittle: 0.7,
    harm: { swing: { cut: 1.5, blunt: 0.7 }, thrust: { blunt: 0.5 } },
    contactSeconds: 0.004, rotation: 0.85, wrist: { omega: 20, zeta: 0.8 }, threat: 3.6,
  },
  // The tepoztopilli: a broad wooden spearhead edged with obsidian, for cut and thrust.
  tepoztopilli: {
    label: 'Tepoztopilli', hands: 'two', length: 1.5, strikeFrom: 1.15, handle: 0.4, spacing: 0.42, leadAhead: true, mass: 2.0, balance: 0.6, radius: 0.02, brittle: 0.7,
    harm: { thrust: { pierce: 0.8, cut: 0.5, blunt: 0.25 }, swing: { cut: 1.1, blunt: 0.45 } },
    contactSeconds: 0.005, rotation: 0.6, wrist: { omega: 13, zeta: 0.85 }, threat: 3.8, grip: 0.5,
  },
  // The kanabo: a long oak club shod with iron studs, swung in two hands.
  // Heavy (~5 kg of iron-shod oak), its weight spread along the swelling
  // upper half rather than packed in a head (`balance`), struck with that
  // half (`strikeFrom`), not a point; no thrust; slow to turn, slow to raise
  // and to recover (WORLD.weapons.heavyFrom). Oak gives more than steel: a
  // longer contact (`contactSeconds`), so a lower peak force for the same blow.
  kanabo: {
    label: 'Kanabo', hands: 'two', length: 1.15, strikeFrom: 0.55, handle: 0.35, spacing: 0.17, mass: 5, balance: 0.68, radius: 0.05,
    harm: { swing: { blunt: 1.4 }, thrust: { blunt: 0.4 } },
    contactSeconds: 0.006, rotation: 1.25, wrist: { omega: 8, zeta: 0.85 }, threat: 4.4, crush: 0.5,
  },
  // One-handed maces, the horseman's answer to armour (swords skate off it):
  // a short iron-bound haft and a heavy head, swung with the wrist and arm
  // (lighter and quicker than a two-handed club, so a little less blunt than
  // the kanabo). The Jurchen "wolf-tooth" mace (langya bang) is studded with
  // iron teeth that bite as it crushes; the flanged mace (Mongol, Ottoman
  // shestopyor and bozdoğan) drives its blow into a flange's narrow edge.
  langya: {
    label: 'Wolf-tooth mace', hands: 'one', length: 0.72, strikeFrom: 0.46, handle: 0.13, mass: 2.0, balance: 0.68, radius: 0.042,
    harm: { swing: { blunt: 1.45, pierce: 0.3 }, thrust: { blunt: 0.4, pierce: 0.15 } },
    contactSeconds: 0.004, rotation: 1.0, wrist: { omega: 12, zeta: 0.85 }, threat: 4, crush: 0.45,
  },
  flangedMace: {
    label: 'Flanged mace', hands: 'one', length: 0.66, strikeFrom: 0.5, handle: 0.12, mass: 1.6, balance: 0.72, radius: 0.036,
    harm: { swing: { blunt: 1.5 }, thrust: { blunt: 0.35 } },
    contactSeconds: 0.004, rotation: 0.95, wrist: { omega: 14, zeta: 0.85 }, threat: 3.9, crush: 0.55,
  },
  // The steppe and Turkish sabre (Mongol sabre, Ottoman kılıç): a long,
  // gently curved single edge for the draw cut. The yatagan, the Janissary's
  // short sword, curves forward instead, its weight out towards the point.
  saber: {
    label: 'Sabre', hands: 'one', length: 0.82, strikeFrom: 0.12, handle: 0.14, mass: 1.0, balance: 0.13, radius: 0.012,
    harm: { swing: { cut: 1.05, blunt: 0.35 }, thrust: { pierce: 0.7, cut: 0.15, blunt: 0.1 } },
    contactSeconds: 0.004, rotation: 0.75, wrist: { omega: 24, zeta: 0.8 }, threat: 3.3,
  },
  yatagan: {
    label: 'Yatagan', hands: 'one', length: 0.64, strikeFrom: 0.1, handle: 0.13, mass: 0.85, balance: 0.16, radius: 0.012,
    harm: { swing: { cut: 1.05, blunt: 0.3 }, thrust: { pierce: 0.8, cut: 0.15, blunt: 0.1 } },
    contactSeconds: 0.004, rotation: 0.7, wrist: { omega: 25, zeta: 0.8 }, threat: 3.2,
  },
  // A bow (`bow`): held in the left hand (`hand`), the stave running
  // `length` up and `handle` down from the grip. It looses arrows (ARROW);
  // there is no edge to strike with.
  bow: {
    label: 'Bow', hands: 'one', hand: 'l', length: 0.95, strikeFrom: 0.95, handle: 0.85, mass: 0.6, balance: 0, radius: 0.014,
    harm: { swing: { blunt: 0.3 }, thrust: { blunt: 0.2 } },
    contactSeconds: 0.006, rotation: 0.5, wrist: { omega: 14, zeta: 0.9 }, threat: 3.5, grip: 0.4, ranged: true, bow: true,
  },
  // The steppe composite bow (Mongol, Turkish): short and sharply recurved,
  // horn, wood and sinew, a heavy draw; it casts the same arrow faster than
  // a long wooden bow (`arrowSpeed`, m/s; ARROW.speed otherwise), and the
  // arrow strikes with its kinetic energy.
  compositeBow: {
    label: 'Composite bow', hands: 'one', hand: 'l', length: 0.62, strikeFrom: 0.62, handle: 0.55, mass: 0.7, balance: 0, radius: 0.016,
    harm: { swing: { blunt: 0.3 }, thrust: { blunt: 0.2 } },
    contactSeconds: 0.006, rotation: 0.5, wrist: { omega: 14, zeta: 0.9 }, threat: 3.6, grip: 0.4, ranged: true, bow: true, arrowSpeed: 62,
  },
  // Sidearms, drawn when the main weapon is lost (an outfit's `sidearm`):
  // a knight's rondel dagger, made to find the gaps in plate; a man-at-arms'
  // short sword; a samurai's wakizashi, the short companion of the katana.
  dagger: {
    label: 'Dagger', hands: 'one', length: 0.3, strikeFrom: 0.06, handle: 0.11, mass: 0.35, balance: 0, radius: 0.01,
    harm: { thrust: { pierce: 0.8, blunt: 0.3 }, swing: { cut: 0.35, blunt: 0.2 } },
    contactSeconds: 0.005, rotation: 0.6, wrist: { omega: 40, zeta: 0.8 }, threat: 2.5,
  },
  shortSword: {
    label: 'Short sword', hands: 'one', length: 0.6, strikeFrom: 0.1, handle: 0.12, mass: 0.85, balance: 0.08, radius: 0.012,
    harm: { thrust: { pierce: 0.85, cut: 0.2, blunt: 0.15 }, swing: { cut: 0.8, blunt: 0.4 } },
    contactSeconds: 0.004, rotation: 0.7, wrist: { omega: 26, zeta: 0.8 }, threat: 3,
  },
  wakizashi: {
    label: 'Wakizashi', hands: 'one', length: 0.5, strikeFrom: 0.08, handle: 0.16, mass: 0.7, balance: 0.08, radius: 0.012,
    harm: { swing: { cut: 1.15, blunt: 0.3 }, thrust: { pierce: 0.6, cut: 0.15, blunt: 0.1 } },
    contactSeconds: 0.004, rotation: 0.75, wrist: { omega: 28, zeta: 0.8 }, threat: 3.2,
  },
  // The Ming dao (a liuyedao, "willow-leaf sabre"): one hand, a gently
  // curved single edge, a round guard. Cuts first, and thrusts.
  dao: {
    label: 'Dao', hands: 'one', length: 0.75, strikeFrom: 0.12, handle: 0.15, mass: 0.95, balance: 0.1, radius: 0.012,
    harm: { swing: { cut: 1.1, blunt: 0.35 }, thrust: { pierce: 0.78, cut: 0.15, blunt: 0.1 } },
    contactSeconds: 0.004, rotation: 0.75, wrist: { omega: 25, zeta: 0.8 }, threat: 3.2,
  },
  // The guandao: a broad, heavy crescent blade on a long shaft, fought like
  // the naginata but a quarter heavier, its weight knocking men about more
  // (blunt, and some of it through armour) while its thicker edge cuts and
  // its point pierces a little less.
  guandao: {
    label: 'Guandao', hands: 'two', length: 1.6, strikeFrom: 1.05, handle: 0.55, spacing: 0.42, leadAhead: true, edgeLeads: true, mass: 2.95, balance: 0.6, radius: 0.016,
    harm: { swing: { cut: 1.15, blunt: 1.05 }, thrust: { pierce: 0.55, cut: 0.12, blunt: 0.5 } },
    // Its heavy head drives some of a blow through armour (`crush`): between the naginata (none) and the war hammer (0.45); its blunt share too, 1.05 between their 0.625 and 1.6.
    contactSeconds: 0.005, rotation: 0.85, wrist: { omega: 12, zeta: 0.85 }, threat: 4.7, crush: 0.3,
  },
  // The jian: the Chinese straight sword, double-edged, one hand, its blade
  // ~0.8 m (Han jian were long: to ~0.9). Quick in the hand, light at the
  // point: the thrust and the flicking cut, not the chop.
  jian: {
    label: 'Jian', hands: 'one', length: 0.8, strikeFrom: 0.1, handle: 0.17, mass: 0.85, balance: 0.09, radius: 0.01,
    harm: { thrust: { pierce: 1.05, cut: 0.2, blunt: 0.08 }, swing: { cut: 0.9, blunt: 0.25 } },
    contactSeconds: 0.004, rotation: 0.6, wrist: { omega: 30, zeta: 0.78 }, threat: 3.6,
  },
  // The ōdachi (nodachi): a field sword of a metre of blade and more, a long
  // grip for two hands; carried by a strong man at Anegawa (1570) to cut at
  // horse and men. Heavy for a sword, long in the reach, slow to recover.
  odachi: {
    label: 'Ōdachi', hands: 'two', length: 1.08, strikeFrom: 0.15, handle: 0.42, spacing: 0.26, mass: 2.3, balance: 0.24, radius: 0.013,
    harm: { swing: { cut: 1.4, blunt: 0.6 }, thrust: { pierce: 0.65, cut: 0.15, blunt: 0.2 } },
    contactSeconds: 0.005, rotation: 0.85, wrist: { omega: 14, zeta: 0.82 }, threat: 4.9,
  },
  // A wooden baseball bat (~84 cm, ~0.9 kg), swung two-handed: all its
  // harm blunt, its weight out in the barrel.
  bat: {
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
    contactSeconds: 0.005, rotation: 0.85, wrist: { omega: 12, zeta: 0.85 }, threat: 4.7, crush: 0.3,
  },
  // A knight's arming sword of the 1420s (Joan's, from Sainte-Catherine-de-
  // Fierbois): one hand, ~0.8 m of stiff tapering blade, a straight cross and
  // a wheel pommel; made to thrust into the gaps of plate as much as to cut.
  armingSword: {
    label: 'Arming sword', hands: 'one', length: 0.8, strikeFrom: 0.12, handle: 0.13, mass: 1.15, balance: 0.12, radius: 0.011,
    harm: { thrust: { pierce: 1, cut: 0.2, blunt: 0.12 }, swing: { cut: 0.95, blunt: 0.4 } },
    contactSeconds: 0.004, rotation: 0.7, wrist: { omega: 24, zeta: 0.8 }, threat: 3.4,
  },
  // Hercules's club (clava), as Commodus carried it into the arena: a length
  // of knotted wood thickening to its end, ~0.9 m and 2 kg, no iron on it.
  // Only blunt; its weight out at the head.
  clava: {
    label: 'Club', hands: 'one', length: 0.78, strikeFrom: 0.42, handle: 0.12, mass: 2.0, balance: 0.6, radius: 0.04,
    harm: { swing: { blunt: 1.35 }, thrust: { blunt: 0.4 } },
    contactSeconds: 0.005, rotation: 0.95, wrist: { omega: 13, zeta: 0.85 }, threat: 3.6, crush: 0.35,
  },
  // His backup: a short sword that cuts and stabs.
  gladius: {
    label: 'Gladius', hands: 'one', length: 0.62, strikeFrom: 0.1, handle: 0.13, mass: 0.9, balance: 0.08, radius: 0.012,
    harm: { thrust: { pierce: 0.9, cut: 0.2, blunt: 0.15 }, swing: { cut: 0.8, blunt: 0.4 } },
    contactSeconds: 0.004, rotation: 0.7, wrist: { omega: 26, zeta: 0.8 }, threat: 3,
  },  // The thraex's sica: a short sword curved like a sickle (~0.42 m of blade),
  // made to reach round a shield's edge into the back and the legs.
  sica: {
    label: 'Sica', hands: 'one', length: 0.46, strikeFrom: 0.08, handle: 0.12, mass: 0.7, balance: 0.14, radius: 0.012, curved: true,
    harm: { swing: { cut: 1.15, blunt: 0.3 }, thrust: { pierce: 0.7, cut: 0.25, blunt: 0.1 } },
    contactSeconds: 0.004, rotation: 0.75, wrist: { omega: 26, zeta: 0.8 }, threat: 3.1,
  },
  // The retiarius's trident (fuscina): ~1.7 m of ash with three iron prongs.
  // One hand while the other holds the net; both once it is thrown. The
  // prongs are short and spread: they wound wide rather than deep.
  trident: {
    label: 'Trident', hands: 'hybrid', length: 1.15, strikeFrom: 0.95, handle: 0.55, spacing: 0.4, leadAhead: true, mass: 1.8, balance: 0.5, radius: 0.016, tines: 3,
    harm: { thrust: { pierce: 0.85, cut: 0.2, blunt: 0.3 }, swing: { blunt: 0.55 } },
    contactSeconds: 0.005, rotation: 0.5, wrist: { omega: 14, zeta: 0.85 }, threat: 3.8, grip: 0.5,
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
    harm: { swing: { blunt: 1 }, thrust: { blunt: 0.7, pierce: 0.3 } },
    contactSeconds: 0.008, rotation: 1.4, wrist: { omega: 10, zeta: 0.9 }, threat: 2, grip: 0.5,
  }])),
};

// Shields strapped to the off forearm: a disc of this radius held off the
// arm, facing where the fighter faces. A strike that meets it is stopped
// there; its momentum goes into the arm and the body braced behind it.
export const SHIELDS = {
  // The parma: small, round, convex bronze — far smaller than a hoplon.
  parma: { label: 'Parma', radius: 0.28, mass: 2.4, offset: 0.07, armHarm: 0.15 },
  // A Ming soldier's small round shield: lacquered wood with an iron rim and a boss.
  roundShield: { label: 'Round shield', radius: 0.3, mass: 2.2, offset: 0.07, armHarm: 0.15, look: 'ming' },
  // The Spanish rodela: a round steel shield, heavy and proof against cuts and thrusts.
  rodela: { label: 'Rodela', radius: 0.29, mass: 3.5, offset: 0.07, armHarm: 0.12, look: 'steel' },
  // The Mexica chimalli: a round shield of wicker or wood faced with feathers and hide.
  chimalli: { label: 'Chimalli', radius: 0.33, mass: 1.6, offset: 0.07, armHarm: 0.2, look: 'feather' },
  // A small round iron parry shield, held out to meet a blow.
  buckler: { label: 'Iron buckler', radius: 0.2, mass: 1.4, offset: 0.06, armHarm: 0.12, look: 'steel' },
  // The kalkan: the Turkish and steppe round shield of wicker bound in
  // coloured thread round an iron boss; light and springy.
  kalkan: { label: 'Kalkan', radius: 0.3, mass: 1.7, offset: 0.07, armHarm: 0.17, look: 'ming' },
  // Shaped shields (`shape: 'curved'`): a rectangle `width` × `height` (m)
  // bent round a vertical axis (`curve`, the bend's radius), held upright by
  // a grip at its middle. The scutum of the murmillo and the secutor: plywood
  // faced with leather, an iron boss, about 0.6 × 0.95 m and 6 kg (an arena
  // scutum was smaller than a legionary's); shoulder to shin, curved round
  // the body: blows go round it to the head or the forward leg.
  // A police riot shield: clear polycarbonate, ~0.6 × 1.05 m, slightly
  // curved; it stops blows, thrown things and edges, not rounds.
  riotShield: { label: 'Riot shield', shape: 'curved', width: 0.6, height: 1.05, curve: 1.2, mass: 4, offset: 0.1, armHarm: 0.07, look: 'riot' },
  scutum: { label: 'Scutum', shape: 'curved', width: 0.62, height: 0.95, curve: 0.5, mass: 6, offset: 0.1, armHarm: 0.07, look: 'scutum' },
  // The thraex's parmula: small and nearly square (~0.36 × 0.42 m), flat-ish.
  parmula: { label: 'Parmula', shape: 'curved', width: 0.36, height: 0.42, curve: 0.9, mass: 2.4, offset: 0.08, armHarm: 0.13, look: 'parmula' },
  // The scissor's arm: a steel tube over the left forearm and fist, ending in
  // a crescent blade (~0.13 m round): it parries like a small shield.
  scissores: { label: 'Scissores', radius: 0.13, mass: 2, offset: 0.12, armHarm: 0.04, look: 'scissores' },
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

/** Where a segment comes nearest a shield, sampled along it: { distance, point, along, from }. */
export function segmentToShield(a, b, shield, samples = 10) {
  let best = { distance: Infinity, point: shield.centre, along: 0 };
  for (let index = 0; index <= samples; index += 1) {
    const along = index / samples;
    const p = vec.lerp(a, b, along);
    const onShield = shieldClosest(p, shield);
    const distance = vec.length(vec.sub(p, onShield));
    if (distance < best.distance) best = { distance, point: onShield, along, from: p };
  }
  return best;
}

// Cutting and piercing, in joules of a contact's collision energy after
// armour. A cut this deep within `zone` of a joint takes the limb off there
// (scaled by the limb's thickness against a typical one); a stab this deep
// into the chest or head is fatal. Wounds bleed: blood lost per second per
// joule, the bleeding easing as it clots, and a man who has lost this share
// of his blood collapses.
export const BLADES = {
  // Armour this proof against cuts chips a brittle (obsidian) edge.
  chipsOn: 0.6,
  // Rigid armour (proof against cuts from `rigidFrom`) has gaps: the
  // armpits, the inside of the elbow, the groin, the visor's slit, the
  // lacing between lamellae. A blow finds one this often (a point far more
  // than an edge; × the striker's technique), and meets there only what is
  // under it (`under`: the arming doublet, a mail voider), and does not
  // glance. Fighting in armour was largely the art of finding them.
  gaps: { rigidFrom: 0.75, thrust: 0.25, swing: 0.06, under: { blunt: 0.25, cut: 0.3, pierce: 0.2 } },
  sever: {
    // joint: [J for a typical limb, the segment whose thickness scales it, typical radius m]
    wrist: [40, 'Forearm', 0.035], elbow: [70, 'Forearm', 0.04], shoulder: [125, 'UpperArm', 0.05],
    ankle: [65, 'Shank', 0.045], knee: [110, 'Shank', 0.055], hip: [230, 'Thigh', 0.08], neck: [140, null, 0],
  },
  zone: 0.32, // share of the segment's length from its end that counts as at the joint
  lethalPierce: 45,
  // Edge alignment: a cut needs the edge moving across the blade, not along it.
  cutAlignmentPower: 2,
  // A thrust pierces only with the point: contact this far out along the striking length.
  pointShare: 0.78,
  bleedPerJoule: { cut: 0.00006, pierce: 0.00012 },
  bleedZone: { head: 1.4, trunk: 1.5, limb: 0.7 },
  clotSeconds: 25,
  collapseAt: 0.38,
  // Blood loss weakens: muscles at this share at the point of collapse.
  shockStrength: 0.55,
  // Grip: hard knocks to the weapon arm or the weapon strain the grip by
  // impulse over (this × the hand's strike force); past 1 the weapon goes.
  gripImpulsePerNewton: 0.1,
  gripLeak: 0.5, // per second
  armHitShare: 0.6, // a blow to the forearm or upper arm, against one to the weapon
  // Blades meeting: how much bounce, and the closing speed (m/s) that counts as a clash.
  clashRestitution: 0.25,
  clashSpeed: 1.5,
  // A blade that glances off plate is turned aside: this share of the
  // contact impulse sends the weapon along the plate, away from the cut.
  glanceShare: 0.6,
};

export const WEAPON_KEYS = Object.keys(WEAPONS);

/**
 * Pistol shots. `lethal`: what one hit does to an unarmoured 80 kg man
 * (`referenceKg`), as a share of what kills him — one to the head, two to
 * the body, five to the arms and legs; a heavier part takes less, a hurt
 * one more (`hurtShare` per unit of damage). Armour (an outfit's
 * `protection.bullet`) takes its share off. A hit to head or body staggers
 * at once, armoured or not; every wound bleeds (`bleed`, per unit of harm).
 * `muzzle`: the barrel's end from the hand (along, above, m); `spread`:
 * the aim's error (rad, standard deviation) standing still, more moving or
 * reeling; `range` (m); `recoil` (N·s on the hand).
 */
export const GUN = {
  referenceKg: 80,
  lethal: { head: 1, torso: 0.5, limb: 0.2 },
  hurtShare: 0.5,
  bleed: { head: 0.02, torso: 0.025, limb: 0.01 },
  muzzle: [0.17, 0.045],
  spread: 0.022,
  barrelShare: 0.15, // of the barrel's own misalignment that goes into the shot
  settled: 0.08, // rad: the barrel this near the line to the mark, he fires (else at the end of the aim)
  steadyBelow: 0.35, // m/s: a shouldered gun moving less than this against the shoulder (stopped on the mark)
  movingSpread: 0.02, // more per m/s the shooter moves
  reelingSpread: 2.5, // times, staggered
  range: 30,
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
  energy: 520,
  // A heavy ball is seen to strike the armour (and not to enter) only where it stopped this much.
  platedHolds: 0.45,
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
 * knock (`impulse`, N·s). Off good plate and lamellar (`arrowproof`) an
 * arrow glances `bounce` of the time; one that finds a gap does `gapHarm`.
 * A spent arrow lies `stays` s.
 */
export const ARROW = {
  speed: 55, gravity: 9.81, spread: 0.02, length: 0.8,
  lethal: { head: 0.85, torso: 0.4, limb: 0.13 },
  bleed: { head: 0.02, torso: 0.03, limb: 0.012 },
  impulse: 1.4, bounce: 0.9, gapHarm: 0.5, stays: 6,
};

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
export function effectiveMassAt(spec, armMass, distance, armLength = 0.6, along = 0) {
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
  // it (a cut) they must turn. Mixed by how the contact moves.
  return 1 / ((along * along) / total + (1 - along * along) / turning);
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
    const pointFirst = at >= BLADES.pointShare && along > 0.5;
    mix.pierce = pointFirst ? (table.pierce ?? 0) * along : 0;
    mix.cut = (table.cut ?? 0) * across ** BLADES.cutAlignmentPower;
    if (!pointFirst) mix.blunt = Math.max(mix.blunt, 0.3);
  } else {
    mix.cut = (table.cut ?? 0) * across ** BLADES.cutAlignmentPower;
    mix.pierce = 0;
  }
  return mix;
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
    if (t < move.windup) return { hand: from.hand, dir: slerpDir(from.dir, dir, Math.min(1, t / Math.max(1e-3, move.windup))) };
    const u = Math.min(1, (t - move.windup) / (move.extendUntil - move.windup));
    // Accelerating all the way in, as a punch does, not easing to a stop at the skin.
    const end = vec.sub(aim, vec.scale(dir, spec.length * reachShare - (move.depth ?? 0.25)));
    // Fully out by three quarters of the way, then held there for the hand to arrive.
    const out = Math.min(1, u / 0.75);
    return { hand: vec.lerp(from.hand, end, out * out), dir };
  }
  const to = { hand: scale3(move.to.hand, H), dir: vec.normalize(move.to.dir) };
  if (t < move.windup) return from;
  const u = Math.min(1, (t - move.windup) / (move.extendUntil - move.windup));
  const middleDir = move.mid ? vec.normalize(move.mid) : slerpDir(from.dir, to.dir, 0.5);
  const middle = vec.sub(aim, vec.scale(middleDir, spec.length * (move.contactAt ?? 0.7)));
  // A quadratic curve through `middle` at u = ½.
  const control = vec.sub(vec.scale(middle, 2), vec.scale(vec.add(from.hand, to.hand), 0.5));
  const hand = addVec(addVec(scale3(from.hand, (1 - u) ** 2), scale3(control, 2 * u * (1 - u))), scale3(to.hand, u * u));
  return { hand, dir: u < 0.5 ? slerpDir(from.dir, middleDir, u * 2) : slerpDir(middleDir, to.dir, u * 2 - 1) };
}
