// The feel of a charge: the player's man on his horse, riding at the man he chose (a charge ordered at him, control.js
// chargeOrder, or the man he is locked on) at speed, is shown going fast, and only that. Purely what is drawn: nothing here
// touches the fight (the physics and the AI never read it).
//
//   widen   the lens opened a few degrees (the world rushing in at the edges), eased in and out, never snapped
//   lines   thin pale streaks at the screen's edges flying outward, the centre (his man) left clear
//
// Both by one level (0..1): the horse's speed as a share of its own gallop (laden: a heavy man in iron on a barded horse
// is at his full charge at his own gallop), only while his man is ahead of the horse, near enough to be ridden at. The
// level eases toward that, in and out (a cantering stride or a swerve does not flicker it).
//
// prefers-reduced-motion: no widening at all, and the streaks fainter and still.
// No DOM and no three.js: main.js asks it each frame (chargefeelview.js draws it); tests drive it directly.

import { P } from './body.js';

export const CHARGEFEEL = {
  // The horse's forward speed as a share of its own gallop (horse.paces.gallop, laden): nothing below `from` (a canter is
  // ~half the gallop), all of it at `full` (a horse seldom holds the whole of its gallop, and is slowed into the pass).
  speed: { from: 0.55, full: 0.9 },
  // His man within this angle (rad) of the horse's line: ridden at, not passed by or wheeled away from.
  cone: 0.6,
  // His man within `farthest` m (beyond, he is only riding that way); closer than `nearest` m the pass is on him: let go.
  range: { nearest: 1.5, farthest: 50 },
  // The level's ease (s, a time constant): in over about a horse's stride, out a little slower (the rush dies away).
  ease: { in: 0.4, out: 0.6 },
  // The lens widened (degrees of vertical fov) at the full level: felt as speed, not seen as a zoom.
  widen: 6,
  // The streaks at the full level: how many, their most opacity, where they start (a share of the way from the centre to
  // the corner, on an ellipse of the screen's shape: the inner part of the screen stays clear), their length (a share of that way), and how fast they fly
  // outward (that way per second).
  lines: { count: 44, opacity: 0.7, inner: 0.5, length: 0.3, flow: 1.6 },
  // Toned down for prefers-reduced-motion: each a share of the full effect (the streaks held still).
  reduced: { widen: 0, lines: 0.5, flow: 0 },
};

const chargeClamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const chargeSmooth = (share) => share * share * (3 - 2 * share);

/** The man he rides at: his charge's (while it is still the run at him) or the man he is locked on. Null for none. */
export function chargeQuarry(world, fighter, orders) {
  const charge = orders?.charge;
  if (charge && charge.phase !== 'charge') return null;
  const id = charge?.target ?? orders?.lock ?? null;
  if (id === null || id === undefined || id === fighter.id) return null;
  return world.fighters[id] ?? null;
}

/**
 * How much of the charge's feel is wanted now (0..1): his man (`fighter`) on his horse, on his feet, riding at the man he
 * chose (chargeQuarry), ahead of him and within range, at speed (a share of his horse's gallop, eased by smoothstep).
 */
export function chargeGoal(world, fighter, orders) {
  const horse = fighter?.mount;
  if (!horse || fighter.state !== 'up') return 0;
  const man = chargeQuarry(world, fighter, orders);
  if (!man || man.state !== 'up' || man.corner === fighter.corner) return 0;
  const gallop = horse.paces?.gallop ?? 0;
  if (!(gallop > 0)) return 0;
  const { from, full } = CHARGEFEEL.speed;
  const share = chargeClamp((horse.speed / gallop - from) / (full - from));
  if (share <= 0) return 0;
  const at = man.mount ? [man.mount.at[0], man.mount.at[1]] : [man.x[P.pelvis * 3], man.x[P.pelvis * 3 + 2]];
  const to = [at[0] - horse.at[0], at[1] - horse.at[1]];
  const distance = Math.hypot(to[0], to[1]);
  if (distance < CHARGEFEEL.range.nearest || distance > CHARGEFEEL.range.farthest) return 0;
  // (The horse's line: yawRotate([1, 0, 0], yaw), on the floor.)
  const along = (to[0] * Math.cos(horse.yaw) - to[1] * Math.sin(horse.yaw)) / distance;
  if (along < Math.cos(CHARGEFEEL.cone)) return 0;
  return chargeSmooth(share);
}

/** The level eased `dt` s toward `goal`: in by CHARGEFEEL.ease.in, out by .out (time constants). */
export function easeCharge(level, goal, dt) {
  if (!(dt > 0)) return level;
  const seconds = goal > level ? CHARGEFEEL.ease.in : CHARGEFEEL.ease.out;
  const next = goal + (level - goal) * Math.exp(-dt / seconds);
  return Math.abs(next - goal) < 1e-3 ? goal : next;
}

/**
 * The charge's feel for one player: update(world, fighter, orders, dt) each frame (fighter null: no man of his to feel it);
 * level, the lens's widening (degrees), the streaks' opacity and flow; reset() for a new bout.
 */
export function createChargeFeel({ reduced = false } = {}) {
  const tone = reduced ? CHARGEFEEL.reduced : { widen: 1, lines: 1, flow: 1 };
  let level = 0;
  function update(world, fighter, orders, dt) {
    level = easeCharge(level, fighter ? chargeGoal(world, fighter, orders) : 0, dt);
    return level;
  }
  return {
    update,
    reduced,
    get level() {
      return level;
    },
    widen: () => CHARGEFEEL.widen * tone.widen * level,
    lines: () => CHARGEFEEL.lines.opacity * tone.lines * level,
    flow: () => CHARGEFEEL.lines.flow * tone.flow * level,
    reset() {
      level = 0;
    },
  };
}
