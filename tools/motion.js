// How smoothly a weapon style moves and how natural its body looks, frame by
// frame at 60 Hz (as drawn), in three phases:
//   guard  — standing in guard, the AI off, 4 s
//   move   — the AI closing from 7 m, until the first stroke
//   fight  — full bouts against a longswordsman, split into strokes
//            (a blade move under way) and the rest
// Jitter:
//   rev    — direction reversals a second, summed over hands, elbows, neck,
//            pelvis and the weapon's tip: a point that moved ≥ 2 mm a frame
//            and then ≥ 2 mm back (> 120° from its last frame's travel)
//   wrev   — the weapon's direction turning back on itself (≥ 0.6° a frame)
//   jerk   — mean change of acceleration of the hands and tip (m/s³ / 1000)
//   snap   — drawn arm bones (rig) turning > 25° about their length in a frame
// Awkward:
//   lean   — the trunk's lean from upright, 95th percentile (°)
//   twist  — shoulders turned against the hips, 95th percentile (°)
//   arm    — weapon arms turned past their range > 10° (share of frames)
//   thru   — the shaft passing through the trunk (share of frames)
// Usage: node tools/motion.js [style ...] [--bouts N] [--seconds S]

import { P, PARTICLES, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, closestBetween, createWorld, placeFighter, point } from '../src/physics.js';
import { BONE, boneFrames, coherentFrames } from '../src/rig.js';
import { vec } from '../src/pose.js';
import { limbTwist, trunkAxes, twistExcess } from '../src/joints.js';

const FRAME = 1 / 60;
const TRACKED = ['lHand', 'rHand', 'lElbow', 'rElbow', 'neck', 'pelvis'];
const MOVED = 0.002;
const SNAP = (25 * Math.PI) / 180;
const ARM_SLACK = (10 * Math.PI) / 180;
const ARM_BONES = ['lUpperArm', 'lForearm', 'rUpperArm', 'rForearm'].map((name) => BONE[name]);

function presetFor(style) {
  return Object.values(PRESETS).find((entry) => entry.style === style) ?? { ...PRESETS.contender, style };
}

function emptyTally() {
  return { frames: 0, rev: 0, wrev: 0, jerk: 0, jerkCount: 0, snap: 0, lean: [], twist: [], arm: 0, armFrames: 0, thru: 0 };
}

/** One fighter's motion, frame after frame, into a tally. */
function tracker(fighter) {
  let history = [];
  let frames = null;
  return (tally) => {
    const points = Array.from({ length: PARTICLES.length }, (_, index) => point(fighter.x, index));
    const weapon = fighter.weapon?.held ? fighter.weapon : null;
    // Two blades: the off hand's tip is tracked too (after the first's), and its arm and shaft checked.
    const second = fighter.offWeapon?.held ? fighter.offWeapon : null;
    const sample = {
      points: [...TRACKED.map((name) => points[P[name]]), ...(weapon ? [weapon.tip] : []), ...(weapon && second ? [second.tip] : [])],
      dir: weapon ? weapon.dir : null,
    };
    const drawn = coherentFrames(boneFrames(points, fighter.body), frames);
    if (frames) {
      for (const index of ARM_BONES) {
        const before = frames[index];
        const now = drawn[index];
        // The turn about the bone's own length: carried x against drawn x.
        const along = now.y;
        const carried = vec.normalize(vec.sub(before.x, vec.scale(along, vec.dot(before.x, along))));
        const angle = Math.atan2(vec.dot(vec.cross(carried, now.x), along), vec.dot(carried, now.x));
        if (Math.abs(angle) > SNAP) tally.snap += 1;
      }
    }
    frames = drawn;
    history.push(sample);
    if (history.length > 4) history = history.slice(-4);
    tally.frames += 1;
    if (history.length >= 3) {
      const [a, b, c] = history.slice(-3);
      const count = Math.min(a.points.length, b.points.length, c.points.length);
      for (let index = 0; index < count; index += 1) {
        const first = vec.sub(b.points[index], a.points[index]);
        const second = vec.sub(c.points[index], b.points[index]);
        const l1 = vec.length(first);
        const l2 = vec.length(second);
        if (l1 > MOVED && l2 > MOVED && vec.dot(first, second) / (l1 * l2) < -0.5) tally.rev += 1;
      }
      if (a.dir && b.dir && c.dir) {
        const first = vec.sub(b.dir, a.dir);
        const second = vec.sub(c.dir, b.dir);
        const l1 = vec.length(first);
        const l2 = vec.length(second);
        if (l1 > 0.01 && l2 > 0.01 && vec.dot(first, second) / (l1 * l2) < -0.5) tally.wrev += 1;
      }
    }
    if (history.length >= 4) {
      const [a, b, c, d] = history;
      // Hands and tip: indices 0, 1 and the last.
      const picks = [0, 1, ...(d.points.length > TRACKED.length && a.points.length === d.points.length ? [TRACKED.length] : [])];
      for (const index of picks) {
        const third = vec.add(vec.sub(d.points[index], vec.scale(c.points[index], 3)), vec.sub(vec.scale(b.points[index], 3), a.points[index]));
        tally.jerk += vec.length(third) / FRAME ** 3 / 1000;
        tally.jerkCount += 1;
      }
    }
    const up = vec.normalize(vec.sub(points[P.neck], points[P.pelvis]));
    tally.lean.push((Math.acos(Math.max(-1, Math.min(1, up[1]))) * 180) / Math.PI);
    const shoulders = vec.sub(points[P.lShoulder], points[P.rShoulder]);
    const hips = vec.sub(points[P.lHip], points[P.rHip]);
    const yaw = (v) => Math.atan2(v[2], v[0]);
    const turn = Math.atan2(Math.sin(yaw(shoulders) - yaw(hips)), Math.cos(yaw(shoulders) - yaw(hips)));
    tally.twist.push((Math.abs(turn) * 180) / Math.PI);
    if (weapon) {
      const axes = trunkAxes(points[P.pelvis], points[P.neck], points[P.lShoulder], points[P.rShoulder]);
      const sides = weapon.twoHanded ? ['l', 'r'] : second ? [weapon.main, second.main] : [weapon.main];
      for (const side of sides) {
        const limb = limbTwist(axes, 'arm', side, points[P[`${side}Shoulder`]], points[P[`${side}Elbow`]], points[P[`${side}Hand`]]);
        tally.armFrames += 1;
        if (Math.abs(twistExcess('arm', limb)) > ARM_SLACK) tally.arm += 1;
      }
      // The shaft behind the rear hand (the butt) and ahead of it, against the trunk's core (either blade).
      const through = (held) => {
        const hand = points[P[`${held.main}Hand`]];
        const butt = vec.sub(hand, vec.scale(held.dir, held.spec.handle ?? 0));
        const near = closestBetween(butt, held.tip, points[P.pelvis], points[P.neck]);
        return vec.length(vec.sub(near.onFirst, near.onSecond)) < 0.07;
      };
      if (through(weapon) || (second && through(second))) tally.thru += 1;
    }
  };
}

function percentile(values, share) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
}

function summary(tally) {
  const seconds = tally.frames * FRAME || 1;
  return {
    seconds,
    rev: tally.rev / seconds,
    wrev: tally.wrev / seconds,
    jerk: tally.jerkCount ? tally.jerk / tally.jerkCount : 0,
    snap: tally.snap / seconds,
    lean: percentile(tally.lean, 0.95),
    twist: percentile(tally.twist, 0.95),
    arm: tally.armFrames ? tally.arm / tally.armFrames : 0,
    thru: tally.frames ? tally.thru / tally.frames : 0,
  };
}

export function motionOf(style, { bouts = 4, seconds = 30 } = {}) {
  const phases = { guard: emptyTally(), move: emptyTally(), stroke: emptyTally(), rest: emptyTally() };
  const opponent = { ...PRESETS.contender, style: 'longsword' };
  for (let bout = 0; bout < bouts; bout += 1) {
    // Guard: the AI off, standing.
    {
      const world = createWorld([presetFor(style), opponent], { seed: 500 + bout });
      placeFighter(world.fighters[0], -2.5, 0);
      placeFighter(world.fighters[1], 2.5, 0);
      advance(world, 1);
      const track = tracker(world.fighters[0]);
      for (let frame = 0; frame < 4 * 60; frame += 1) {
        advance(world, FRAME);
        track(phases.guard);
      }
    }
    // Moving in: from 7 m until his first stroke.
    {
      const world = createWorld([presetFor(style), opponent], { seed: 600 + bout });
      placeFighter(world.fighters[0], -3.5, 0);
      placeFighter(world.fighters[1], 3.5, 0);
      advance(world, 0.5);
      const fighter = world.fighters[0];
      const track = tracker(fighter);
      for (let frame = 0; frame < 6 * 60 && !fighter.punch; frame += 1) {
        advance(world, FRAME, (current, dt) => thinkAll(current, dt));
        if (!fighter.punch && fighter.state === 'up') track(phases.move);
      }
    }
    // Fighting.
    {
      const world = createWorld([presetFor(style), opponent], { seed: 700 + bout });
      const fighter = world.fighters[0];
      const track = tracker(fighter);
      for (let frame = 0; frame < seconds * 60 && !boutWinner(world); frame += 1) {
        advance(world, FRAME, (current, dt) => thinkAll(current, dt));
        if (fighter.state !== 'up' || !fighter.weapon?.held) continue;
        track(fighter.punch?.spec.path === 'blade' ? phases.stroke : phases.rest);
      }
    }
  }
  return Object.fromEntries(Object.entries(phases).map(([name, tally]) => [name, summary(tally)]));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const at = args.indexOf(name);
    if (at < 0) return fallback;
    const value = Number(args[at + 1]);
    args.splice(at, 2);
    return value;
  };
  const bouts = option('--bouts', 4);
  const seconds = option('--seconds', 30);
  const styles = args.length ? args : ['guandao', 'guanYu', 'naginata', 'longsword', 'katana'];
  console.log('style        phase   secs   rev/s  wrev/s  jerk  snap/s  lean95 twist95  arm%  thru%');
  for (const style of styles) {
    const rows = motionOf(style, { bouts, seconds });
    for (const [phase, row] of Object.entries(rows)) {
      console.log(`${style.padEnd(12)} ${phase.padEnd(6)} ${row.seconds.toFixed(0).padStart(5)} ${row.rev.toFixed(2).padStart(7)} ${row.wrev.toFixed(2).padStart(7)} ${row.jerk.toFixed(1).padStart(5)} ${row.snap.toFixed(2).padStart(7)} ${row.lean.toFixed(0).padStart(7)} ${row.twist.toFixed(0).padStart(7)} ${(row.arm * 100).toFixed(1).padStart(5)} ${(row.thru * 100).toFixed(1).padStart(6)}`);
    }
  }
}
