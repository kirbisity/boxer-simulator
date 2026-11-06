// A limb lost: cut off at a joint (physics.js sever) or ruined past use (a
// joint broken, physics.js breakJoint). Neither kills a man by itself (the
// head off still does): what follows is calculated from the body and the man.
//
// - The bleeding. The stump bleeds from the great vessel cut at that level
//   (`vessels`): its flow out of a cut end with the heart racing, against the
//   man's own blood (`bloodPerKg` of his weight), easing as the pressure falls
//   and the vessel closes (`clot`, s). A cleanly cut artery often goes into
//   spasm and draws back into the muscle (`clamp`: the share of such cuts in
//   which it does, more the smaller the vessel), bleeding `clamped.flow` of
//   it and closing in `clamped.clot` of the time; a limb torn or broken open
//   by the edge without coming off (`ruin`) cannot retract, and bleeds as a
//   partial laceration does. He collapses at what puts any man down (physics.js
//   collapseAt), and dies past `deathOver` times that if nothing stops it.
// - The shock. Seeing his hand or leg gone is the most frightening thing that
//   can happen to a man in a fight: a surge of fear (`shock`, by the joint: the
//   more of him gone, the more), fading over `shockHalfLife` s, felt as all his
//   fear is (ai.js fearTarget: through his kit's courage, his side's discipline,
//   and the adrenaline in him), and the less the more trained he is
//   (`trained` × his skill: a veteran has seen it, and his hands go on working).
//   It is also a surge of adrenaline (`adrenaline`, ai.js surge). Whether he
//   breaks is then the fear model's: a man past his breaking point runs, or
//   crawls; one whose adrenaline holds him fights on with what is left, until
//   the blood brings him down. A closed break (`broken`) shocks less.
// - The man played never breaks (ai.js): the shock instead stuns him a moment
//   (`player`), less with adrenaline in him and courage in his kit.

export const MAIMING = {
  // Blood: ~70 ml per kg of body weight (an adult man's 5-5.5 l).
  bloodPerKg: 70,
  // By the joint a limb comes off at: the vessel cut there, its flow out of the cut end (ml/s), the share in which
  // it clamps, and how long its bleeding takes to ease (s, the e-folding time as the pressure falls and it closes).
  // The flows are an open artery's with the heart driving hard (cardiac output in hard exertion 15-20 l/min, the limbs
  // taking most of it): a femoral transection loses ~2 l/min, enough to collapse a man in about half a minute; the
  // brachial at the shoulder over a minute; a forearm's or a hand's arteries (2-3 mm) far less, and they clamp more
  // often than not (Ditkoff and Weiss; the 'paradox' of complete transection: a severed artery retracts, a lacerated
  // one cannot). So the leg off at the thigh is the quickest to drop him, the hand the slowest, and often never.
  // Set for play (the user's call, 2026-11-05): a limb off bleeds the health bar empty fast, an arm in ~7.5 s on a 75 kg man (the
  // thigh ~6, the knee ~7, the elbow ~8, a foot ~9, a hand ~10), many times faster than a real amputation; other wounds (an arrow,
  // a cut) bleed as slowly as before (physics.js wound bleeding). Flows below are a 75 kg man's (`flowRefKg`); a bigger man's
  // heart and vessels move more (×(mass/flowRefKg)^`flowExponent`, as cardiac output scales), so with his larger blood volume he
  // lasts a little longer: 55 kg ~0.93×, 110 kg ~1.1× the time. Clamping halved from the physiological shares: quick, as wanted.
  flowRefKg: 75,
  flowExponent: 0.75,
  vessels: {
    // A hand off: the radial and ulnar arteries at the wrist.
    wrist: { flow: 116, clamp: 0.28, clot: 90 },
    // The forearm off: the brachial at the elbow (~4 mm), where it divides.
    elbow: { flow: 141, clamp: 0.2, clot: 140 },
    // The arm off at the shoulder: the axillary and the top of the brachial (~6 mm).
    shoulder: { flow: 149, clamp: 0.1, clot: 200 },
    // A foot off: the tibial arteries at the ankle.
    ankle: { flow: 128, clamp: 0.25, clot: 90 },
    // The leg off at the knee: the popliteal (~6 mm).
    knee: { flow: 160, clamp: 0.15, clot: 160 },
    // The leg off at the hip: the femoral (~8-10 mm), the worst there is short of the neck.
    hip: { flow: 185, clamp: 0.05, clot: 240 },
  },
  // A clamped artery: this share of the flow, closing in this share of the time.
  clamped: { flow: 0.3, clot: 0.4 },
  // A limb ruined by the edge and broken there (not off): the vessel torn, not cut: this share of the flow, never clamped.
  ruin: { flow: 0.7 },
  // Dead past this many times what collapses him: collapse at ~21 % of the blood (collapseAt × toughness: weak, faint,
  // down), death at ~45 % (class IV haemorrhage). A thigh off kills in a minute or two, an arm at the shoulder in two or
  // three; a forearm or a hand, often not at all by itself.
  deathOver: 2.2,
  // Fear at once (on the fear model's scale, ai.js fearTarget: 1 alone, unhelped, breaks a man), by the joint: the shock
  // beyond what the fear model already feels of it. An arm lost most often costs him his weapon (the weapon hand) or
  // leaves him a two-handed weapon in one: outmatched, which it counts by itself (confidence, weaponDread). A leg
  // lost leaves the weapon in his hand but him on the ground among standing men, which it does not see (it weighs a
  // man, not his height): the leg's shock carries that. More of him gone, more shock. (Calibrated, tools/maiming.js:
  // about half of a middling unit's men break at once, more of a levy's, fewer of an elite's.)
  // (A fifth more across the board, 2026-11-05: a little more likely to break and crawl off than the first tuning.)
  shock: { wrist: 0.48, elbow: 0.54, shoulder: 0.6, ankle: 0.84, knee: 1.02, hip: 1.2 },
  shockHalfLife: 25,
  // Of the shock, the share his training takes off at full skill (a veteran has seen it; his kit's courage and his side's
  // discipline already steady him in the fear model, so this is the smaller part).
  trained: 0.25,
  // A limb broken (not off): this share of the shock.
  broken: 0.7,
  // Adrenaline (0..1) on the moment, times his body's gain (ai.js adrenalineGain): the alarm at its worst, more than a
  // hard blow survived (AI.adrenaline hardHit 0.35) and about a man knocked down (knockdown 0.45). With what the fight
  // has already put in him, a young man's can pass what holds him from breaking (AI.panic adrenalineHolds).
  adrenaline: 0.4,
  // The man played: stunned this long (s) at full shock with no adrenaline and no courage.
  player: { stun: 1.6 },
  // Bleeding this fast (a share of his blood a second, ~10 ml/s in a man of 75 kg) or faster is a great vessel open:
  // the health bar shows it draining (main.js renderHud).
  fastBleed: 0.002,
};

// The joints a limb comes off at (physics.js SEVER_PARTS), by limb.
export const ARM_CUTS = new Set(['wrist', 'elbow', 'shoulder']);
export const LEG_CUTS = new Set(['ankle', 'knee', 'hip']);
// A joint broken (physics.js breakJoint: 'lElbow') to the vessel level it lies at.
const BROKEN_LEVEL = { Elbow: 'elbow', Knee: 'knee', Hip: 'hip' };

/** The level (a key of MAIMING.vessels) a broken joint (lElbow, rKnee, ...) lies at, or null. */
export function brokenLevel(joint) {
  return BROKEN_LEVEL[joint.slice(1)] ?? null;
}

/** His blood, ml. */
export function bloodMl(fighter) {
  return MAIMING.bloodPerKg * (fighter.body.bodyMassKg ?? fighter.body.massKg);
}

/**
 * The great vessel at `level` opened (a limb cut off there, or `ruin`: torn open by the edge): its bleeding (a share of
 * his blood a second) and its easing, drawn for this cut (`random`: whether it clamps). Kept on him as `vessels`.
 * Returns the vessel opened ({ level, rate, clot, clamped }).
 */
export function openArtery(fighter, level, random, { ruin = false } = {}) {
  const spec = MAIMING.vessels[level];
  const clamped = !ruin && random() < spec.clamp;
  const size = ((fighter.body.bodyMassKg ?? fighter.body.massKg ?? MAIMING.flowRefKg) / MAIMING.flowRefKg) ** MAIMING.flowExponent;
  const flow = spec.flow * size * (ruin ? MAIMING.ruin.flow : clamped ? MAIMING.clamped.flow : 1);
  const vessel = { level, rate: flow / bloodMl(fighter), clot: spec.clot * (clamped ? MAIMING.clamped.clot : 1), clamped };
  (fighter.vessels ??= []).push(vessel);
  return vessel;
}

/** The blood (share) his opened vessels lose over `dt` s, each easing as it closes. */
export function stepVessels(fighter, dt) {
  let lost = 0;
  for (const vessel of fighter.vessels ?? []) {
    lost += vessel.rate * dt;
    vessel.rate *= Math.exp(-dt / vessel.clot);
  }
  return lost;
}

/** How fast he bleeds now, a share of his blood a second: his wounds and his opened vessels. */
export function bleedingNow(fighter) {
  return (fighter.bleed ?? 0) + (fighter.vessels ?? []).reduce((sum, vessel) => sum + vessel.rate, 0);
}

/** Whether he is bleeding fast: a great vessel open (MAIMING.fastBleed), the health bar draining. */
export function bleedingFast(fighter) {
  return fighter.state !== 'out' && bleedingNow(fighter) >= MAIMING.fastBleed;
}

/** The shock of a limb lost at `level` (or broken there, `broken`), 0..: before his kit and his nerve take their share. */
export function shockOf(fighter, level, { broken = false } = {}) {
  const skill = fighter.body.skill ?? 0.5;
  return MAIMING.shock[level] * (broken ? MAIMING.broken : 1) * (1 - MAIMING.trained * skill);
}

/** The shock felt: set on him at `time` (added to what is left of any before). */
export function feelShock(fighter, amount, time) {
  fighter.maimShock = maimFear(fighter, time) + amount;
  fighter.maimShockAt = time;
}

/** What is left of the shock at `time`. */
export function maimFear(fighter, time) {
  if (!fighter.maimShock) return 0;
  return fighter.maimShock * 0.5 ** ((time - fighter.maimShockAt) / MAIMING.shockHalfLife);
}

/** How long the man played is stunned by a shock of `amount`: his kit's courage and his adrenaline take it off. */
export function playerStun(fighter, amount) {
  return MAIMING.player.stun * Math.min(1, amount) * (1 - (fighter.body.gear.courage ?? 0)) * (1 - Math.min(1, fighter.adrenaline ?? 0));
}
