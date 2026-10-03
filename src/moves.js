// Fighting styles and their moves. A move is data: which limb strikes, the
// path its target takes, how the trunk turns and leans, what it costs, and
// how much of the body's mass is behind it. The physics executes it with the
// fighter's own muscles, so a kick is as fast as that leg can make it.

// The striking limb's local path is built from the aim point (the target on
// the opponent, in the attacker's frame: x forward, y up, z left) and the
// limb's side (+1 left, -1 right). Each path returns the targets it drives.
export const MOVES = {
  // Punches.
  jab: { kind: 'strike', limb: 'lHand', path: 'straight', windup: 0, extendUntil: 0.2, duration: 0.34, twist: 0.12, shift: 0.05, cost: 0.012, mass: { arm: 0.55 }, rotation: 0.85, zones: ['head', 'body'], reach: 'arm' },
  cross: { kind: 'strike', limb: 'rHand', path: 'straight', windup: 0, extendUntil: 0.26, duration: 0.44, twist: -0.85, shift: 0.06, cost: 0.02, mass: { arm: 0.6, body: 0.012 }, rotation: 1, zones: ['head', 'body'], reach: 'arm' },
  hook: { kind: 'strike', limb: 'lHand', path: 'hook', windup: 0.09, extendUntil: 0.3, duration: 0.48, twist: 0.45, shift: 0.02, cost: 0.024, mass: { arm: 0.6, body: 0.01 }, rotation: 1.35, zones: ['head', 'body'], reach: 'close' },
  uppercut: { kind: 'strike', limb: 'rHand', path: 'upper', windup: 0.08, extendUntil: 0.28, duration: 0.46, twist: -0.55, dip: 0.02, cost: 0.024, mass: { arm: 0.6, body: 0.01 }, rotation: 1.25, zones: ['head', 'body'], reach: 'close' },
  // Elbows: short, sharp, cutting; the forearm folds and the point leads.
  elbow: { kind: 'strike', limb: 'rElbow', path: 'elbow', windup: 0.09, extendUntil: 0.26, duration: 0.44, twist: -1.25, shift: 0.07, cost: 0.02, mass: { arm: 0.75, body: 0.02 }, rotation: 1.3, cuts: true, zones: ['head'], reach: 'close' },
  upElbow: { kind: 'strike', limb: 'lElbow', path: 'upElbow', windup: 0.05, extendUntil: 0.22, duration: 0.4, twist: 0.3, shift: 0.04, cost: 0.02, mass: { arm: 0.7, body: 0.018 }, rotation: 1.25, cuts: true, zones: ['head'], reach: 'close' },
  // Knee: driven up and forward with the hips.
  knee: { kind: 'strike', limb: 'rKnee', path: 'knee', windup: 0.06, extendUntil: 0.3, duration: 0.55, twist: -0.3, shift: 0.05, lean: -0.1, cost: 0.03, mass: { leg: 0.5, body: 0.05 }, rotation: 0.9, zones: ['body', 'head'], reach: 'close' },
  // Kicks: chamber, then the shin or foot swings or drives through.
  roundhouse: { kind: 'strike', limb: 'rFoot', path: 'roundhouse', windup: 0.12, extendUntil: 0.36, duration: 0.7, twist: -1.25, lean: -0.22, cost: 0.04, mass: { leg: 0.55, body: 0.025 }, rotation: 1.45, zones: ['body', 'head'], reach: 'leg' },
  lowKick: { kind: 'strike', limb: 'rFoot', path: 'roundhouse', windup: 0.1, extendUntil: 0.32, duration: 0.62, twist: -1.1, lean: -0.12, cost: 0.03, mass: { leg: 0.55, body: 0.02 }, rotation: 1, zones: ['legs'], reach: 'leg' },
  teep: { kind: 'strike', limb: 'lFoot', path: 'teep', windup: 0.14, extendUntil: 0.34, duration: 0.6, twist: 0.1, lean: -0.18, cost: 0.03, mass: { leg: 0.45, body: 0.12 }, rotation: 0.5, push: true, zones: ['body'], reach: 'leg' },
  // Whole-body moves.
  // A charge runs until it meets the other body or runs out of steam.
  rush: { kind: 'rush', duration: 1.2, cost: 0.05 },
  clinch: { kind: 'clinch', duration: 3, cost: 0.02 },
};

// Defences, each a timed posture change the physics carries out.
export const DEFENCES = {
  guard: { seconds: 0.5 }, // gloves tight to the face, elbows in
  slip: { seconds: 0.32 }, // head off the line, to one side
  roll: { seconds: 0.45 }, // dip under and come up on the other side
  parry: { seconds: 0.25 }, // lead hand slaps the incoming glove aside
  leanBack: { seconds: 0.4 }, // trunk back out of range: the answer to a head kick
  check: { seconds: 0.45 }, // lead knee up, shin out: the answer to a low kick
  stepBack: { seconds: 0.35 },
};

/**
 * Styles. `stance` shapes the guard (blade angle, crouch, stance width,
 * how upright), `idle` the constant motion, `attacks` and `defences` the
 * AI's mix (relative weights), `rushChance` how often it charges (per s).
 */
export const STYLES = {
  boxing: {
    label: 'Boxing',
    stance: { blade: 0.55, crouch: 0.03, width: 1, lean: 0.14, guardHeight: 0 },
    idle: { bounce: 1, sway: 1, rock: 0.2 },
    attacks: { jab: 0.4, cross: 0.22, hook: 0.16, uppercut: 0.1, rush: 0.006 },
    defences: { slip: 0.32, roll: 0.24, parry: 0.2, guard: 0.18, stepBack: 0.06 },
    defendChance: 0.42,
    pressure: 0.12, // share of the time spent working inside
  },
  kickboxing: {
    label: 'Kickboxing',
    stance: { blade: 0.42, crouch: 0.02, width: 1.12, lean: 0.1, guardHeight: 0.01 },
    idle: { bounce: 0.8, sway: 0.8, rock: 0.4 },
    attacks: { jab: 0.22, cross: 0.17, hook: 0.1, uppercut: 0.05, roundhouse: 0.18, lowKick: 0.15, teep: 0.08, rush: 0.008 },
    defences: { guard: 0.3, check: 0.28, leanBack: 0.18, slip: 0.14, stepBack: 0.1 },
    defendChance: 0.38,
    pressure: 0.05,
  },
  muayThai: {
    label: 'Muay Thai',
    // Square and upright, weight back, guard high and long.
    stance: { blade: 0.22, crouch: 0, width: 0.92, lean: 0.03, guardHeight: 0.02 },
    idle: { bounce: 0.25, sway: 0.7, rock: 1 },
    attacks: { jab: 0.1, cross: 0.1, roundhouse: 0.2, lowKick: 0.12, teep: 0.12, knee: 0.14, elbow: 0.1, upElbow: 0.04, clinch: 0.06, rush: 0.005 },
    defences: { check: 0.34, guard: 0.28, leanBack: 0.26, parry: 0.12 },
    defendChance: 0.4,
    // Muay Thai walks forward into the clinch, knees and elbows.
    pressure: 0.35,
  },
};

export const STYLE_KEYS = Object.keys(STYLES);

/** Which moves the style can use, for the player's pad. */
export function movesFor(styleKey) {
  return Object.keys(STYLES[styleKey]?.attacks ?? STYLES.boxing.attacks);
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/**
 * Local targets for a strike at time t, aimed at `aim`.
 * @returns {object} any of lHand, rHand, lElbow, rElbow, lFoot, rFoot, lKnee, rKnee
 */
export function strikeTargets(move, t, aim, body, followThrough) {
  const side = move.limb[0] === 'l' ? 1 : -1;
  const s = move.limb[0];
  const H = body.heightM;
  const windingUp = t < move.windup;
  const hipY = body.lengths.ankle + body.lengths.shank + body.lengths.thigh;
  switch (move.path) {
    case 'straight':
      return { [`${s}Hand`]: add(aim, [followThrough, 0, 0]) };
    case 'hook':
      return { [`${s}Hand`]: windingUp ? add(aim, [-0.2, 0.02, 0.38 * side]) : add(aim, [0.06, 0, -0.2 * side]) };
    case 'upper':
      return { [`${s}Hand`]: windingUp ? add(aim, [-0.18, -0.38, 0]) : add(aim, [0.06, 0.16, 0]) };
    case 'elbow': {
      // The elbow sweeps across at head height; the fist folds to the ear.
      const elbow = windingUp ? add(aim, [-0.32, 0.04, 0.42 * side]) : add(aim, [0.1, -0.02, -0.3 * side]);
      return { [`${s}Elbow`]: elbow, [`${s}Hand`]: add(elbow, [-0.06, 0.06, -0.16 * side]) };
    }
    case 'upElbow': {
      const elbow = windingUp ? add(aim, [-0.2, -0.32, 0.05 * side]) : add(aim, [0.04, 0.18, 0]);
      return { [`${s}Elbow`]: elbow, [`${s}Hand`]: add(elbow, [-0.05, 0.14, -0.04 * side]) };
    }
    case 'knee': {
      // Knee up and through; the foot tucks under and behind it.
      const knee = windingUp ? [0.15 * H, hipY * 0.85, 0.06 * side] : add(aim, [0.08, -0.02, 0]);
      return { [`${s}Knee`]: knee, [`${s}Foot`]: add(knee, [-0.22, -0.3, 0]) };
    }
    case 'roundhouse': {
      // Open out to the side, level with the target; then sweep the shin
      // across it and through.
      if (windingUp) return { [`${s}Foot`]: add(aim, [-0.12, 0.04, 0.55 * side]) };
      return { [`${s}Foot`]: add(aim, [0.06, 0, -0.35 * side]) };
    }
    case 'teep': {
      // Knee up in front, then the sole drives straight out into the target.
      if (windingUp) return { [`${s}Foot`]: [0.12 * H, hipY * 0.55, 0.05 * side], [`${s}Knee`]: [0.18 * H, hipY * 0.98, 0.05 * side] };
      return { [`${s}Foot`]: add(aim, [followThrough * 0.8, 0, 0]) };
    }
    default:
      return {};
  }
}

/** How far a move reaches from the attacker's pelvis, for choosing moves by distance. */
export function moveRange(move, body) {
  const legReach = body.lengths.thigh + body.lengths.shank;
  if (move.reach === 'leg') return legReach * 1.25;
  if (move.reach === 'close') return body.reach * 0.95;
  return body.reach * 1.3;
}
