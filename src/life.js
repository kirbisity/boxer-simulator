// The small movements that make a fighter look alive rather than posed, all
// layered over the commanded pose so the physics carries them out with real
// inertia. Each style moves differently at rest: a boxer bounces on the balls
// of the feet, a kickboxer springs a little wider, a Muay Thai fighter rocks
// forward and back on a flat rhythm, weight on the rear leg.
//
// Smooth, seeded noise (sines at unrelated periods) so nothing repeats
// visibly and a seed replays exactly.

import { STYLES } from './moves.js';

export const LIFE = {
  // Boxers bounce at about 1.5–2.2 Hz; untrained people barely bounce.
  bounceHz: { min: 1.6, range: 0.5 },
  bounceDepth: 0.016, // share of height, for a fully trained fighter (~3 cm)
  // Muay Thai's rock: weight forward and back with the rhythm, ~1 Hz.
  rockHz: 0.95,
  rockDepth: 0.02,
  breathHz: 0.32, // a fighter breathes ~20 times a minute between exchanges
  breathLean: 0.018,
  sway: 0.011, // share of height: head drift side to side and fore-aft
  trunkTwist: 0.07, // rad
  shoulderRoll: 0.06, // rad, the slow roll of the shoulders in the guard
  weightShift: 0.012, // share of height: weight moving between the feet
  handDrift: 0.012, // share of height
  // Feints: a hand twitches out now and then, reading the opponent.
  feintEvery: 2.4,
  feintReach: 0.05,
  // A stunned fighter's legs and neck go loose: sway grows this much.
  stunnedSway: 3.2,
  periods: [1.7, 2.9, 4.3, 3.3, 2.3, 5.1, 1.9, 3.7, 2.7, 4.7, 2.1, 3.1, 6.1, 5.7],
};

/** Per-fighter phases, so two fighters never move in step. */
export function lifePhases(random) {
  return {
    phases: LIFE.periods.map(() => random() * Math.PI * 2),
    bounceHz: LIFE.bounceHz.min + random() * LIFE.bounceHz.range,
    feintOffset: random() * LIFE.feintEvery,
  };
}

function wave(life, index, time) {
  return Math.sin((time * Math.PI * 2) / LIFE.periods[index] + life.phases[index]);
}

/** Small offsets to layer over the commanded pose, in shares of height and radians. */
export function idleMotion(fighter, time) {
  const life = fighter.life;
  const style = STYLES[fighter.style]?.idle ?? STYLES.boxing.idle;
  const training = fighter.body.inputs.training;
  const freshness = 0.35 + 0.65 * fighter.stamina;
  const loose = fighter.stun > 0 ? LIFE.stunnedSway : 1;
  const sway = LIFE.sway * loose * style.sway;
  const busy = fighter.punch ? 0.3 : 1;
  const bounce = LIFE.bounceDepth * style.bounce * (0.15 + 0.85 * training) * freshness * busy * (0.5 - 0.5 * Math.cos(time * Math.PI * 2 * life.bounceHz));
  const rock = LIFE.rockDepth * style.rock * busy * Math.sin(time * Math.PI * 2 * LIFE.rockHz + life.phases[11]);
  // Breathing deepens and quickens as stamina runs down.
  const breath = LIFE.breathLean * (1.4 - 0.6 * fighter.stamina) * Math.sin(time * Math.PI * 2 * LIFE.breathHz * (1.6 - 0.6 * fighter.stamina));
  // A feint: a quick half-extension of the lead hand, every few seconds.
  const feintPhase = ((time + life.feintOffset) % LIFE.feintEvery) / 0.18;
  const feint = !fighter.punch && feintPhase < 1 ? Math.sin(Math.PI * feintPhase) * LIFE.feintReach * training : 0;
  return {
    dip: bounce + Math.max(0, rock) * 0.3,
    shift: rock + LIFE.weightShift * wave(life, 12, time),
    headOffset: [sway * 0.6 * wave(life, 0, time), sway * 0.25 * wave(life, 1, time), sway * wave(life, 2, time)],
    twist: LIFE.trunkTwist * loose * wave(life, 3, time) + LIFE.shoulderRoll * wave(life, 13, time),
    lean: 0.025 * loose * wave(life, 4, time) + breath - rock * 1.5,
    guardOffset: {
      l: [LIFE.handDrift * wave(life, 5, time) + feint, LIFE.handDrift * 0.8 * wave(life, 6, time), LIFE.handDrift * 0.5 * wave(life, 7, time)],
      r: [LIFE.handDrift * wave(life, 8, time), LIFE.handDrift * 0.8 * wave(life, 9, time), LIFE.handDrift * 0.5 * wave(life, 10, time)],
    },
  };
}
