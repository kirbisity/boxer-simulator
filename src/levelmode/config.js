// Level mode, the player's systems: every number, with the reason for it. One place, so that the
// stage's feel is tuned here and nowhere else. (The matchlock's damp powder, being the physics', is
// WORLD.damp in physics/config.js; the pose of tending a wound, WORLD.tend.)

export const LEVEL_CONFIG = {
  // ---- What is near enough to use -------------------------------------------------------------
  interact: {
    // m on the floor from his hips: arm's length and a step (the brief's number): close enough that the thing
    // is plainly the one he is standing at, far enough that a man does not have to line himself up on it.
    reach: 1.5,
    // m from the nearest point of a gate's or a ladder's leaf (its whole width, not one spot in front of it): the "Open gate" button
    // was found only by standing on one spot; now it is offered across the approach (still only from the gate's own side, `opensFrom`).
    mechanismReach: 3.8,
    // m from a lever: a pull handle on a wall, found from a few strides' distance.
    leverReach: 3.0,
    // m of height between his feet's floor and the thing's: one storey is never "near" (a note on the wall
    // walk above, a lever on the stair): a stride and a half.
    height: 1.0,
    // A lying body is looted from beside it: the same reach, a little more height (a body on a step).
    bodyHeight: 1.3,
    // m: with an awake enemy this close, nothing is offered (one does not read a note with a pike coming).
    hostileRange: 6,
  },

  // ---- Items -------------------------------------------------------------------------------------
  // A man starts a stage with these, and a rest refills him to at least these. Three bandages: a long fight
  // (a pair of tier 2 guards) costs one or two, so three carry him through a section to the next rest.
  // One tonic: it is the answer to a mistake, not a habit.
  start: { bandage: 4, tonic: 2 },
  // The most he can carry: five rolls of cloth fit a belt; three flasks fit a pouch.
  cap: { bandage: 6, tonic: 3 },
  bandage: {
    // s: the brief's number. Long enough that doing it in a fight is a real gamble (a guard's halberd cut takes
    // about 1.5 s to come round again), short enough to do in the gap after one has been killed.
    seconds: 2.5,
  },
  tonic: {
    // s: blood lost and hurt are restored evenly over this long (the brief's number): quick enough to matter in a
    // fight, slow enough that it is no instant refill. The flask is drunk with one hand while he keeps his feet:
    // nothing else stops him. It mends the blood (all), the brain's strain, gunshot wounds, bruising and trauma
    // to head and trunk; it does not mend what is broken (a broken limb stays broken) nor grow back what is cut off.
    seconds: 4,
  },

  // ---- Loot ----------------------------------------------------------------------------------------
  loot: {
    // s: stripping a man of his harness and putting on another's is slow work and leaves one open
    // (the brief's number); a hit stops it, and the clothes stay where they were.
    outfitSeconds: 3,
  },

  // ---- The marker over a man's head, and Lock ---------------------------------------------------------------
  // m: an enemy who is aware of the player gets his name and health over his head within `aware`; any enemy within
  // `near` does too (close enough to be locked on and struck first).
  marker: { aware: 14, near: 6.5 },

  // ---- Rest and death ------------------------------------------------------------------------------
  rest: {
    // m: the men who stand with him (the freed) are put this far apart, beside him, after a rest or a death.
    followerSpacing: 1.1,
  },

  // ---- The boss -------------------------------------------------------------------------------------
  boss: {
    // The bar shows when he is awake and aware of the player, within this many m (the stand-in for the awareness
    // AI's own word, levelmode/adapter.js), and goes when he is out.
    barRange: 30,
    // Phase 2: at this share of his health gone (hurtShare, what the health bar shows) the helm comes off
    // (bareHead) and he moves faster: footwork and acceleration go from the harness's 0.66 / 0.55 to the
    // 0.82 / 0.78 of light plate (the helm was the harness's clumsiest part), and he works harder (the AI's
    // work and burst temperament traits, x1.25: a modest rise in aggression).
    phase2: { at: 0.5, foot: 0.82, accel: 0.78, work: 1.25, burst: 1.25 },
  },

  // ---- Wading ----------------------------------------------------------------------------------------
  // Standing water and sludge (levelmode/water.js wadeDrag, applied each step by level.js wadeGear) hold a man's legs by how deep it is over his feet, in proportion to
  // his height (the same water is deeper on a short man). `table` is [depth over the feet (m) of a man `height` m tall, the share of his footwork left] for the
  // reference man; between the rows the share is interpolated, above the last it stays, and under the first it is 1 (ankle-deep water holds no one): shin 0.9,
  // knee 0.75, thigh 0.55, waist 0.4 (a man wading at the waist goes at about half a walk), chest 0.3 (past that he is swimming, not walking).
  //   sole:   the ankle joint (what the body's foot particle is) stands this share of his height above the sole, which the depth is measured from.
  //   accel:  his acceleration share is the footwork share to this power (the legs take longer to get going than to carry on).
  //   thick:  a volume's `viscosity` v (1 water, 1.6 the cistern's sewage, 2 the cesspool's sludge) takes a further v^-exp of it, brought on as the water comes up from
  //           `from` to `full` m (reference man) over his feet (a man standing in sludge to the ankle is not stuck; to the knee he is): the cesspool's 0.49 m is x0.6 on top of the knee.
  //   act:    his punches, dodges and turning go at the thick share to this power (a man stuck in sludge is slower everywhere, but only slightly); rising is slowed by his
  //           footwork share itself (physics/rising.js already divides its stages by gear.foot).
  //   tire:   the stamina he loses a second for each 1 of footwork share lost, while he moves (a little).
  wade: { height: 1.75, sole: 0.073, table: [[0.15, 1], [0.3, 0.9], [0.5, 0.75], [0.8, 0.55], [1.0, 0.4], [1.3, 0.3]], accel: 1.2, thick: { exp: 0.75, from: 0.15, full: 0.35 }, act: 0.35, tire: { cost: 0.03, speed: 0.4 } },

  // ---- Stand-ins until the awareness AI lands (levelmode/adapter.js) ---------------------------------------
  // An awake enemy counts as aware of the player within this many m.
  awareRange: 30,
};
