// How clean a knocked-out body's fall is. Knocks a fighter down from several
// directions and measures, over the fall and while lying:
//   flips   — frames where a rig bone's frame turns more than 60° (the skin twists)
//   jitter  — mean change of particle acceleration per frame while lying (m/s²)
//   settle  — seconds until every particle moves slower than 0.15 m/s, frame to frame
//   folded  — frames where a hand or foot is inside the trunk
// Usage: node tools/falls-quality.js

import { P, PRESETS } from '../src/body.js';
import { advance, createWorld, hitParticle, placeFighter, point } from '../src/physics.js';
import { boneFrames, coherentFrames } from '../src/rig.js';
import { vec } from '../src/pose.js';

const PARTICLE_COUNT = 15;
const DIRECTIONS = [[-1, 0.2, 0.3], [-1, 0.1, -0.4], [0.3, 0.1, 1], [-0.6, -0.4, 0], [1, 0.3, 0.2]];

/** One knockout fall: hit the head hard, let go of the muscles, watch 4 s. */
export function fallQuality(preset = 'heavy', direction = DIRECTIONS[0], impulse = 40) {
  const world = createWorld([{ ...PRESETS[preset], style: 'boxing' }, PRESETS.light], { seed: 3 });
  placeFighter(world.fighters[1], 2.6);
  advance(world, 0.6);
  const fighter = world.fighters[0];
  fighter.state = 'down';
  fighter.downTimer = 99;
  hitParticle(world, fighter, P.head, direction, impulse);
  const result = { flips: 0, jitter: 0, settle: null, folded: 0 };
  let previousFrames = null;
  let previousAcceleration = null;
  let lyingFrames = 0;
  let previousPoints = null;
  const frameCount = 240;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const before = Array.from(fighter.v);
    advance(world, 1 / 60);
    const points = Array.from({ length: PARTICLE_COUNT }, (_, index) => point(fighter.x, index));
    const frames = coherentFrames(boneFrames(points, fighter.body), previousFrames);
    if (previousFrames) {
      frames.forEach((bone, index) => {
        if (vec.dot(bone.x, previousFrames[index].x) < Math.cos(Math.PI / 3)) result.flips += 1;
      });
    }
    previousFrames = frames;
    const acceleration = Array.from(fighter.v, (value, index) => (value - before[index]) * 60);
    if (previousAcceleration && frame > 60) {
      let change = 0;
      for (let index = 0; index < acceleration.length; index += 1) change += Math.abs(acceleration[index] - previousAcceleration[index]);
      result.jitter += change / PARTICLE_COUNT;
      lyingFrames += 1;
    }
    previousAcceleration = acceleration;
    // Speed as the eye sees it: movement from one drawn frame to the next.
    const fastest = previousPoints ? Math.max(...points.map((at, index) => vec.length(vec.sub(at, previousPoints[index])) * 60)) : Infinity;
    previousPoints = points;
    if (result.settle === null && frame > 30 && fastest < 0.15) result.settle = frame / 60;
    if (result.settle !== null && fastest > 0.4) result.settle = null;
    // Inside the trunk: within its radius of the pelvis–neck segment.
    const pelvis = points[P.pelvis];
    const axis = vec.sub(points[P.neck], pelvis);
    const length = vec.length(axis);
    for (const end of ['lHand', 'rHand', 'lFoot', 'rFoot']) {
      const offset = vec.sub(points[P[end]], pelvis);
      const along = Math.max(0, Math.min(length, vec.dot(offset, axis) / length));
      const away = vec.length(vec.sub(offset, vec.scale(axis, along / length)));
      if (along > 0.05 && along < length - 0.05 && away < fighter.body.segments.trunk.skinRadius * 0.8) result.folded += 1;
    }
  }
  result.jitter /= Math.max(1, lyingFrames);
  result.settle ??= Infinity;
  return result;
}

export function fallSweep() {
  const rows = [];
  for (const preset of ['heavy', 'light']) for (const direction of DIRECTIONS) rows.push(fallQuality(preset, direction));
  const mean = (key) => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
  const settled = rows.filter((row) => row.settle < Infinity);
  return { flips: mean('flips'), jitter: mean('jitter'), unsettled: rows.length - settled.length, settle: settled.reduce((sum, row) => sum + row.settle, 0) / Math.max(1, settled.length), folded: mean('folded'), rows };
}

if (process.argv[1]?.endsWith('falls-quality.js')) {
  const { rows, ...summary } = fallSweep();
  for (const row of rows) console.log(Object.entries(row).map(([key, value]) => `${key} ${value.toFixed(2)}`).join('  '));
  console.log('mean', Object.entries(summary).map(([key, value]) => `${key} ${value.toFixed(2)}`).join('  '));
}
