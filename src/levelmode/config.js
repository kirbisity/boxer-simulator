// Level mode, the player's systems: every number, with the reason for it. One place, so that the
// stage's feel is tuned here and nowhere else. (The matchlock's damp powder, being the physics', is
// WORLD.damp in physics/config.js; the pose of tending a wound, WORLD.tend.)

export const LEVEL_CONFIG = {
  // ---- What is near enough to use -------------------------------------------------------------
  interact: {
    // m on the floor from his hips: arm's length and a step (the brief's number): close enough that the thing
    // is plainly the one he is standing at, far enough that a man does not have to line himself up on it.
    reach: 1.5,
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
  start: { bandage: 3, tonic: 1 },
  // The most he can carry: five rolls of cloth fit a belt; three flasks fit a pouch.
  cap: { bandage: 5, tonic: 3 },
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

  // ---- Stand-ins until the awareness AI lands (levelmode/adapter.js) ---------------------------------------
  // An awake enemy counts as aware of the player within this many m.
  awareRange: 30,
};
