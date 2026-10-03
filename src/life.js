// The small movements that make a fighter look alive rather than posed: a
// rhythmic bounce on the balls of the feet, a slow sway of head and trunk,
// hands that never sit still in the guard. Smooth, seeded noise (a few
// sines at unrelated periods) so it never repeats visibly and replays
// exactly from the seed.

export const LIFE = {
  // Boxers bounce at about 1.5–2.2 Hz; untrained people barely bounce.
  bounceHz: { min: 1.6, range: 0.5 },
  bounceDepth: 0.016, // share of height, for a fully trained fighter (~3 cm)
  sway: 0.011, // share of height: head drift side to side and fore-aft
  trunkTwist: 0.07, // rad
  handDrift: 0.012, // share of height
  // A stunned fighter's legs and neck go loose: sway grows this much.
  stunnedSway: 3.2,
  periods: [1.7, 2.9, 4.3, 3.3, 2.3, 5.1, 1.9, 3.7, 2.7, 4.7, 2.1, 3.1],
};

/** Per-fighter phases, so two fighters never sway in step. */
export function lifePhases(random) {
  return { phases: LIFE.periods.map(() => random() * Math.PI * 2), bounceHz: LIFE.bounceHz.min + random() * LIFE.bounceHz.range };
}

function wave(life, index, time) {
  return Math.sin((time * Math.PI * 2) / LIFE.periods[index] + life.phases[index]);
}

/** Small offsets to layer over the commanded pose, in shares of height and radians. */
export function idleMotion(fighter, time) {
  const life = fighter.life;
  const training = fighter.body.inputs.training;
  const freshness = 0.35 + 0.65 * fighter.stamina;
  const loose = fighter.stun > 0 ? LIFE.stunnedSway : 1;
  const sway = LIFE.sway * loose;
  const bouncing = fighter.punch ? 0.3 : 1;
  const bounce = LIFE.bounceDepth * (0.15 + 0.85 * training) * freshness * bouncing * (0.5 - 0.5 * Math.cos(time * Math.PI * 2 * life.bounceHz));
  return {
    dip: bounce,
    headOffset: [sway * 0.6 * wave(life, 0, time), sway * 0.25 * wave(life, 1, time), sway * wave(life, 2, time)],
    twist: LIFE.trunkTwist * loose * wave(life, 3, time),
    lean: 0.025 * loose * wave(life, 4, time),
    guardOffset: {
      l: [LIFE.handDrift * wave(life, 5, time), LIFE.handDrift * 0.8 * wave(life, 6, time), LIFE.handDrift * 0.5 * wave(life, 7, time)],
      r: [LIFE.handDrift * wave(life, 8, time), LIFE.handDrift * 0.8 * wave(life, 9, time), LIFE.handDrift * 0.5 * wave(life, 10, time)],
    },
  };
}
