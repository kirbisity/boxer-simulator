// Joints out of their range in weapon fighting, per minute of a fighter
// holding a weapon on his feet:
//   arm     — a weapon arm's forearm turned past what the shoulder can rotate
//             (joints.js limbTwist, WORLD.limbTwist), by more than 10°
//   back    — of those, turned clean round: an elbow bent backwards (past 150°)
//   wrist   — the weapon pointing back into the forearm holding it, past the
//             wrist's reach (WORLD.limbTwist.wristBack) by more than 10°
//   drawn   — the drawn rig's elbow (rig.js: the forearm hinged on the upper
//             arm's frame) bent backwards past 15°
//   knee    — a leg's shin turned past what the hip can rotate, by more than 10°
// Usage: node tools/anatomy.js [bouts per style] [seconds]

import { P, PARTICLES, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld, point } from '../src/physics.js';
import { BONE, boneFrames } from '../src/rig.js';
import { vec } from '../src/pose.js';
import { limbTwist, trunkAxes, twistExcess, wristAngle } from '../src/joints.js';
import { WORLD } from '../src/physics/config.js';

export const ANATOMY_STYLES = ['baton', 'longsword', 'katana', 'knife', 'hoplomachus', 'warhammer', 'naginata', 'spear'];
const SLACK = (10 * Math.PI) / 180;
const DRAWN_BACK = (15 * Math.PI) / 180;

/** A body's limbs twisted out of range now: { arm, back, knee } counts (one per limb). */
export function limbViolations(points, { arms = true, legs = true } = {}) {
  const tally = { arm: 0, back: 0, knee: 0 };
  const shoulders = trunkAxes(points[P.pelvis], points[P.neck], points[P.lShoulder], points[P.rShoulder]);
  const hips = trunkAxes(points[P.pelvis], points[P.neck], points[P.lHip], points[P.rHip]);
  for (const side of ['l', 'r']) {
    if (arms) {
      const turn = limbTwist(shoulders, 'arm', side, points[P[`${side}Shoulder`]], points[P[`${side}Elbow`]], points[P[`${side}Hand`]]);
      if (Math.abs(twistExcess('arm', turn)) > SLACK) tally.arm += 1;
      if (turn && Math.abs(turn.twist) > (150 * Math.PI) / 180) tally.back += 1;
    }
    if (legs) {
      const turn = limbTwist(hips, 'leg', side, points[P[`${side}Hip`]], points[P[`${side}Knee`]], points[P[`${side}Foot`]]);
      if (Math.abs(twistExcess('leg', turn)) > SLACK) tally.knee += 1;
    }
  }
  return tally;
}

/** Count of limbs out of range (arms and legs): for tools that want one number. */
export function jointViolations(fighter, points, options) {
  const tally = limbViolations(points, options);
  return tally.arm + tally.knee;
}

/** The drawn elbow bent backwards: the forearm on the far side of its hinge in the upper arm's frame. */
function drawnBack(frames, points, side) {
  const upper = frames[BONE[`${side}UpperArm`]];
  const forearm = vec.normalize(vec.sub(points[P[`${side}Hand`]], points[P[`${side}Elbow`]]));
  const inPlane = Math.atan2(vec.dot(forearm, upper.x), vec.dot(forearm, upper.y));
  return inPlane < -DRAWN_BACK;
}

export function armRanges(style, bouts = 3, seconds = 40) {
  const totals = { seconds: 0, arm: 0, back: 0, wrist: 0, drawn: 0, knee: 0 };
  const preset = Object.values(PRESETS).find((entry) => entry.style === style);
  for (let bout = 0; bout < bouts; bout += 1) {
    const world = createWorld([{ ...preset }, { ...PRESETS.contender, style: 'longsword' }], { seed: 300 + bout });
    for (let tick = 0; tick < seconds * 30 && !boutWinner(world); tick += 1) {
      advance(world, 1 / 30, (current, dt) => thinkAll(current, dt));
      for (const fighter of world.fighters) {
        if (fighter.state !== 'up' || !fighter.weapon?.held) continue;
        totals.seconds += 1 / 30;
        const points = Array.from({ length: PARTICLES.length }, (_, index) => point(fighter.x, index));
        const frames = boneFrames(points, fighter.body);
        // Two blades: the off hand's arm is a weapon arm too.
        const second = fighter.offWeapon?.held ? fighter.offWeapon : null;
        const sides = fighter.weapon.twoHanded ? ['l', 'r'] : second ? [fighter.weapon.main, second.main] : [fighter.weapon.main];
        const shoulders = trunkAxes(points[P.pelvis], points[P.neck], points[P.lShoulder], points[P.rShoulder]);
        for (const side of sides) {
          const turn = limbTwist(shoulders, 'arm', side, points[P[`${side}Shoulder`]], points[P[`${side}Elbow`]], points[P[`${side}Hand`]]);
          if (Math.abs(twistExcess('arm', turn)) > SLACK) totals.arm += 1;
          if (turn && Math.abs(turn.twist) > (150 * Math.PI) / 180) totals.back += 1;
          if (drawnBack(frames, points, side)) totals.drawn += 1;
        }
        for (const held of second ? [fighter.weapon, second] : [fighter.weapon]) {
          if (wristAngle(points[P[`${held.main}Elbow`]], points[P[`${held.main}Hand`]], held.dir) > WORLD.limbTwist.wristBack + SLACK) totals.wrist += 1;
        }
        totals.knee += limbViolations(points, { arms: false }).knee;
      }
    }
  }
  const minutes = totals.seconds / 60;
  return { style, minutes, arm: totals.arm / minutes, back: totals.back / minutes, wrist: totals.wrist / minutes, drawn: totals.drawn / minutes, knee: totals.knee / minutes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bouts = Number(process.argv[2] ?? 3);
  const seconds = Number(process.argv[3] ?? 40);
  // Styles named after the numbers: those alone (each must have a character).
  const only = process.argv.slice(4);
  const sum = { minutes: 0, arm: 0, back: 0, wrist: 0, drawn: 0, knee: 0 };
  for (const style of only.length ? only : ANATOMY_STYLES) {
    const row = armRanges(style, bouts, seconds);
    for (const key of Object.keys(sum)) sum[key] += key === 'minutes' ? row.minutes : row[key] * row.minutes;
    console.log(`${style.padEnd(12)} per minute held: arm ${row.arm.toFixed(1).padStart(6)}  back ${row.back.toFixed(1).padStart(6)}  wrist ${row.wrist.toFixed(1).padStart(6)}  drawn ${row.drawn.toFixed(1).padStart(6)}  knee ${row.knee.toFixed(1).padStart(6)}`);
  }
  console.log(`${'all'.padEnd(12)} per minute held: ${['arm', 'back', 'wrist', 'drawn', 'knee'].map((key) => `${key} ${(sum[key] / sum.minutes).toFixed(1).padStart(6)}`).join('  ')}  (frames at 30 Hz, ${sum.minutes.toFixed(1)} min)`);
}
