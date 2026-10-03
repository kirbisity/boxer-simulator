// Visible glitches in full bouts, across every pairing of styles and a range
// of weights: what the eye would catch frame to frame.
//   pops   — a particle moving more than 40 cm between drawn frames (24 m/s: faster than any strike)
//   flips  — a rig bone turning more than 60° between drawn frames
//   folds  — a hand, foot, knee or elbow inside its own trunk
//   knees  — a standing fighter's knee bent backwards past 10°
//   broken — any non-finite position
// Usage: node tools/glitches.js [seconds per bout]

import { FRAMES, normaliseInputs, P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { caloriesForWeight } from '../src/physiology.js';
import { advance, boutWinner, createWorld, point } from '../src/physics.js';
import { boneFrames, coherentFrames } from '../src/rig.js';
import { vec } from '../src/pose.js';
import { STYLE_KEYS, STYLES } from '../src/moves.js';

const PARTICLE_COUNT = 15;

/** A preset fed to a BMI: the extremes of the calorie slider. */
function atBmi(preset, bmi) {
  const inputs = normaliseInputs({ ...PRESETS[preset] });
  const height = inputs.heightCm / 100;
  return { ...inputs, calories: Math.round(caloriesForWeight(inputs, bmi * height * height, FRAMES[inputs.frame].lean)) };
}

export const BODIES = {
  light: () => PRESETS.light,
  heavy: () => PRESETS.heavy,
  contender: () => PRESETS.contender,
  wasted: () => atBmi('amateur', 13),
  obese: () => atBmi('amateur', 45),
};

function countFrame(fighter, previous, tally) {
  const points = Array.from({ length: PARTICLE_COUNT }, (_, index) => point(fighter.x, index));
  if (points.some((at) => at.some((value) => !Number.isFinite(value)))) tally.broken += 1;
  // As drawn: the renderer carries each bone's twist on from the last frame.
  const frames = coherentFrames(boneFrames(points, fighter.body), previous?.frames);
  if (previous) {
    points.forEach((at, index) => {
      if (vec.length(vec.sub(at, previous.points[index])) > 0.4) tally.pops += 1;
    });
    frames.forEach((bone, index) => {
      if (vec.dot(bone.x, previous.frames[index].x) < 0.5) tally.flips += 1;
    });
  }
  const pelvis = points[P.pelvis];
  const axis = vec.sub(points[P.neck], pelvis);
  const length = vec.length(axis);
  // The lean trunk: a fat body's own arms rightly rest in its flesh, not in its ribs.
  const radius = fighter.body.segments.trunk.muscleRadius * 0.8;
  for (const name of ['lHand', 'rHand', 'lFoot', 'rFoot', 'lKnee', 'rKnee', 'lElbow', 'rElbow']) {
    const offset = vec.sub(points[P[name]], pelvis);
    const along = vec.dot(offset, axis) / length;
    if (along < 0.08 || along > length - 0.08) continue;
    if (vec.length(vec.sub(offset, vec.scale(axis, along / length))) < radius) tally.folds += 1;
  }
  if (fighter.state === 'up') {
    const up = vec.normalize(axis);
    const forward = vec.normalize(vec.cross(up, vec.sub(points[P.lHip], points[P.rHip])));
    for (const side of ['l', 'r']) {
      const hip = points[P[`${side}Hip`]];
      const foot = points[P[`${side}Foot`]];
      const line = vec.normalize(vec.sub(foot, hip));
      const knee = points[P[`${side}Knee`]];
      const onLine = vec.add(hip, vec.scale(line, vec.dot(vec.sub(knee, hip), line)));
      const bend = vec.dot(vec.sub(knee, onLine), forward);
      if (bend < -Math.sin((10 * Math.PI) / 180 / 2) * fighter.body.lengths.shank) tally.knees += 1;
    }
  }
  return { points, frames };
}

/** Play one bout between two bodies and styles, counting glitches. */
export function boutGlitches(red, blue, seconds = 40, seed = 1) {
  const world = createWorld([red, blue], { seed });
  const tally = { pops: 0, flips: 0, folds: 0, knees: 0, broken: 0, minutes: 0 };
  const previous = [null, null];
  let elapsed = 0;
  while (elapsed < seconds && !boutWinner(world)) {
    advance(world, 1 / 60, (current, dt) => thinkAll(current, dt));
    elapsed += 1 / 60;
    world.fighters.forEach((fighter, index) => {
      previous[index] = countFrame(fighter, previous[index], tally);
    });
  }
  tally.minutes = elapsed / 60;
  return tally;
}

export function glitchSweep(seconds = 40) {
  const rows = [];
  const pairs = [['light', 'heavy'], ['contender', 'heavy'], ['wasted', 'obese'], ['light', 'obese'], ['wasted', 'light']];
  for (const [a, b] of pairs) {
    for (const styleA of STYLE_KEYS) {
      for (const styleB of STYLE_KEYS) {
        const tally = boutGlitches({ ...BODIES[a](), style: styleA }, { ...BODIES[b](), style: styleB }, seconds);
        rows.push({ pairing: `${a}:${styleA} v ${b}:${styleB}`, ...tally });
      }
    }
  }
  return rows;
}

/** Weapon styles against each other and against the bare-handed ones. */
export const WEAPON_STYLES = STYLE_KEYS.filter((key) => STYLES[key].weapon);

export function weaponGlitchSweep(seconds = 40) {
  const rows = [];
  const pairs = [['contender', 'heavy'], ['light', 'heavy'], ['wasted', 'obese']];
  for (const [a, b] of pairs) {
    for (const styleA of WEAPON_STYLES) {
      for (const styleB of [...WEAPON_STYLES, 'boxing', 'street']) {
        for (const seed of [1, 2]) {
          const tally = boutGlitches({ ...BODIES[a](), style: styleA }, { ...BODIES[b](), style: styleB }, seconds, seed);
          rows.push({ pairing: `${a}:${styleA} v ${b}:${styleB} #${seed}`, ...tally });
        }
      }
    }
  }
  return rows;
}

if (process.argv[1]?.endsWith('glitches.js')) {
  const weapons = process.argv[2] === 'weapons';
  const seconds = Number(process.argv[weapons ? 3 : 2] ?? 40);
  const rows = weapons ? weaponGlitchSweep(seconds) : glitchSweep(seconds);
  const total = { pops: 0, flips: 0, folds: 0, knees: 0, broken: 0, minutes: 0 };
  for (const row of rows) {
    for (const key of Object.keys(total)) total[key] += row[key];
    const perMinute = (key) => (row[key] / Math.max(0.01, row.minutes)).toFixed(1);
    if (row.pops + row.flips + row.broken > 0 || row.folds / Math.max(0.01, row.minutes) > 30) console.log(row.pairing.padEnd(42), `pops ${perMinute('pops')}  flips ${perMinute('flips')}  folds ${perMinute('folds')}  knees ${perMinute('knees')}  broken ${row.broken}`);
  }
  console.log('total per minute', Object.entries(total).filter(([key]) => key !== 'minutes').map(([key, value]) => `${key} ${(value / total.minutes).toFixed(2)}`).join('  '), `over ${total.minutes.toFixed(1)} min`);
}
