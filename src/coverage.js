// What of a man his armour covers, read off the armour as it is drawn (loftbody.js ARMOR_KINDS: each piece [from, to, inflate,
// paint] along its part), so that what guards a place is what is seen over it: a blow that lands where no piece is drawn meets
// the clothes, not the coat's figures. Per struck part (physics.js STRUCK), the stretches of it (t along the part: the trunk
// from the hips 0 to the neck 1, a limb from its upper joint 0 to its lower 1) each piece covers, and what the piece is made of
// (detailmaps.js pieceMaterial: steel, mail, kozane, lamellae, scales, studded, armor, pad; cloth: a quilted coat or a surcoat).
//
// The far end of a forearm is the hand (from ARMOUR_COVER.handFrom of the way to the fist), covered only by a gauntlet (a kit's
// `fists: 'gauntlet'`) or the samurai's tekkō (`hands: 'tekko'`): outfits.js HAND_COVERS. The far end of a shank is the foot
// (from ARMOUR_COVER.footFrom), covered by sabatons (`feet.kind` 'sabaton'). The skirt (its hem a share of the thigh's length below
// the waist: loftbody.js skirtTo) covers each thigh from the hip down to its hem, and the shank below the knee where it hangs
// past it.

import { ARMOR_KINDS } from './loftbody.js';
import { pieceMaterial } from './detailmaps.js';

export const ARMOUR_COVER = {
  // Where the hand begins along the forearm (elbow 0, the fist's middle 1): the fist's own radius back from it, ~5 of a
  // forearm's ~33 cm, and the wrist.
  handFrom: 0.85,
  // Where the foot begins along the shank (knee 0, the ankle 1): the ankle bone and below.
  footFrom: 0.94,
  // A thigh's length over a shank's, a man's (Winter: 0.245 and 0.246 of stature): the skirt's hem past the knee onto the shank.
  thighOverShank: 1,
  // A piece's material that is armour (the rest, cloth: armour only where it is the kit's own quilted coat).
  armour: ['steel', 'mail', 'kozane', 'lamellae', 'scales', 'studded', 'armor', 'pad', 'splint'],
};

// Armour drawn whole outside the table (wardrobe.js), its coverage given here: the knight's harness, steel from the neck to
// the sabatons, the gauntlets on his hands.
const whole = (material) => ({ fists, feet }) => ({
  trunk: [{ from: 0, to: 1, material, slot: 'trunk' }], upperArm: [{ from: 0, to: 1, material, slot: 'upperArm' }],
  forearm: [{ from: 0, to: ARMOUR_COVER.handFrom, material, slot: 'forearm' }], thigh: [{ from: 0, to: 1, material, slot: 'thigh' }],
  shank: [{ from: 0, to: ARMOUR_COVER.footFrom, material, slot: 'shin' }],
  hand: fists === 'gauntlet' ? material : null, foot: feet === 'sabaton' || material === 'steel' ? material : null,
});
const FULL = { plate: whole('steel') };

/** Whether coverage is known for an armour kind (drawn from the table, or whole): else a kit keeps its figures everywhere. */
export function coverageKnown(armorKind, also = null) {
  return Boolean(also || FULL[armorKind] || ARMOR_KINDS[armorKind]);
}

// The drawn slots a struck part is covered by (a part's own slot, and the trunk's skirt over the thighs).
const SLOT_OF = { trunk: 'trunk', upperArm: 'upperArm', forearm: 'forearm', thigh: 'thigh', shank: 'shin' };

/** The pieces of an armour kind's slot, for the left side (the same both sides but for a shield arm's guard). */
function pieces(kind, slot, side = 'l') {
  const value = kind?.[slot];
  if (!value) return [];
  const forSide = Array.isArray(value) ? value : value[side];
  if (!forSide) return [];
  return Array.isArray(forSide[0]) ? forSide : [forSide];
}

/** What a piece is (pieceMaterial), or 'cloth' for a quilted or cloth one, or null for what is not worn over the man (a surcoat's heraldry is cloth). */
function materialOf(paint) {
  // Iron splints sewn on cloth (the kote's ikada, the suneate's): armour, though its base is the garment's.
  if (paint && typeof paint === 'object' && paint.stuff) return paint.stuff;
  if (paint && typeof paint === 'object' && paint.splints) return 'splint';
  if (paint && typeof paint === 'object' && paint.lames) return 'steel';
  return pieceMaterial(paint) ?? 'cloth';
}

/**
 * The coverage of an armour kind (`armorKind`, a key of ARMOR_KINDS) on each struck part (by its side-less name: trunk, upperArm,
 * forearm, thigh, shank, and the hand and the foot): a list of { from, to, material, slot } per part, the hand and the foot each
 * a material or null. `fists`, `hands`, `feet`: the kit's (outfits.js), for the hand and the foot.
 */
export function coverageOf(armorKind, { fists = null, hands = null, feet = null, side = 'l', also = null } = {}) {
  // A harness drawn whole elsewhere (wardrobe.js: the knight's plate, cap-a-pie): steel over every part. A kit whose armour is
  // drawn whole by a module of its own (`also: 'whole'`: the exoframe's plates, exoview.js) likewise, in its own stuff.
  if (also === 'whole') return whole('pad')({ fists, hands, feet });
  if (FULL[armorKind]) return FULL[armorKind]({ fists, hands, feet });
  const kind = { ...(ARMOR_KINDS[armorKind] ?? {}) };
  // Armour that is there but not drawn by the table (a kit's `coverAlso`): hidden under a robe (Guan Yu's scale, the rōnin's
  // tatami-dō sewn inside his kosode), or drawn by a module of its own (the ō-yoroi's box, oyoroi.js). Each slot's pieces
  // [from, to, stuff] (a skirt's [hem, stuff]), added to what is drawn.
  for (const [slot, extra] of Object.entries(also ?? {})) {
    const own = pieces(kind, slot, side);
    const added = extra.map((piece) => (slot === 'skirt' ? [piece[0], 0, 1, { stuff: piece[1] }] : [piece[0], piece[1], 1, { stuff: piece[2] }]));
    kind[slot] = [...own, ...added];
  }
  const cover = { trunk: [], upperArm: [], forearm: [], thigh: [], shank: [], hand: null, foot: null };
  if (kind) {
    for (const [part, slot] of Object.entries(SLOT_OF)) {
      for (const [from, to, , paint] of pieces(kind, slot, side)) {
        // (A forearm's `to` at or below 0 counts back from the wrist, ~0.98 of the way to the fist: loftbody.js.)
        const end = part === 'forearm' && to <= 0 ? 0.98 + to : to;
        cover[part].push({ from: Math.max(0, from), to: Math.min(part === 'forearm' ? ARMOUR_COVER.handFrom : 1, end), material: materialOf(paint), slot });
      }
    }
    // Knee cops: from `from` to `to` down the thigh (0 the hip, 1 the knee), on past the knee onto the shank.
    for (const [from, to, , paint] of pieces(kind, 'knee', side)) {
      const material = materialOf(paint);
      cover.thigh.push({ from: Math.max(0, from), to: Math.min(1, to), material, slot: 'knee' });
      if (to > 1) cover.shank.push({ from: 0, to: Math.min(1, to - 1), material, slot: 'knee' });
    }
    // The skirt: from the hip to its hem down the thigh, and on down the shank past the knee.
    for (const [hem, , , paint] of pieces(kind, 'skirt', side)) {
      const material = materialOf(paint);
      cover.thigh.push({ from: 0, to: Math.min(1, hem), material, slot: 'skirt' });
      if (hem > 1) cover.shank.push({ from: 0, to: Math.min(1, (hem - 1) * ARMOUR_COVER.thighOverShank), material, slot: 'skirt' });
    }
  }
  if (fists === 'gauntlet') cover.hand = 'steel';
  else if (hands === 'tekko') cover.hand = 'tekko';
  if (feet === 'sabaton') cover.foot = 'steel';
  return cover;
}

/** The pieces over a place `t` along a part, outermost (last drawn) first; [] where nothing is drawn over it. */
export function piecesAt(cover, part, t) {
  const list = cover?.[part] ?? [];
  return list.filter((piece) => t >= piece.from && t <= piece.to).reverse();
}

/** The share of a part (0 to 1) that some piece covers, its armour (ARMOUR_COVER.armour) or any (`any`: cloth too). */
export function coveredShare(cover, part, { any = false } = {}) {
  const list = (cover?.[part] ?? []).filter((piece) => any || ARMOUR_COVER.armour.includes(piece.material));
  if (!list.length) return 0;
  const steps = 40;
  let covered = 0;
  for (let step = 0; step < steps; step += 1) {
    const t = (step + 0.5) / steps;
    if (list.some((piece) => t >= piece.from && t <= piece.to)) covered += 1;
  }
  return covered / steps;
}
