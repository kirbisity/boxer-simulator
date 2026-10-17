// How a rider moves on his horse at each gait, frame by frame at 60 Hz: the horse's
// body (its withers' height over the stride), his hips (held to the saddle), his
// neck and head (carried by the trunk), the weapon hand and the blade's tip; the
// peak-to-peak rise and fall of each (cm), the bounce's rate (Hz), the largest change
// between two frames (cm: a pop would show here) and how much of the horse's
// bounce the head is given. The trunk's lean (deg) rocks with the stride too.
// Usage: node tools/riding-motion.js [character] [seconds]

import { P, PRESETS } from '../src/body.js';
import { advance, createWorld, point } from '../src/physics.js';
import { horsePoint } from '../src/physics/mounted.js';

const [key = 'saber', secondsArg = '8'] = process.argv.slice(2);
const seconds = Number(secondsArg);
const FRAME = 1 / 60;
const SPEEDS = { walk: 1.6, trot: 3.6, canter: 6, gallop: 11 };

/** One gait: the series of heights and leans as the horse holds the pace. */
export function measure(character, gait, speed, length = seconds) {
  const inputs = { ...PRESETS[character], mounted: true };
  const world = createWorld([{ inputs, corner: 'red' }, { inputs: { ...PRESETS.street, style: 'unskilled' }, corner: 'blue' }], { seed: 5, arena: { halfX: 80, halfZ: 20 } });
  const [horse] = world.horses;
  const [rider, other] = world.fighters;
  other.state = 'out';
  rider.cooldown = 1000;
  const series = { withers: [], pelvis: [], neck: [], head: [], hand: [], tip: [], lean: [] };
  const frames = Math.round(length / FRAME);
  for (let frame = 0; frame < frames; frame += 1) {
    horse.goal = { heading: 0, speed };
    horse.goalAt = world.time + 1;
    advance(world, FRAME);
    // (Past the first 3 s: the horse has got up to its pace.)
    if (frame < 3 / FRAME) continue;
    series.withers.push(horsePoint(horse, [0.3 * horse.withers, horse.withers, 0])[1]);
    series.pelvis.push(point(rider.x, P.pelvis)[1]);
    series.neck.push(point(rider.x, P.neck)[1]);
    series.head.push(point(rider.x, P.head)[1]);
    series.hand.push(point(rider.x, P.rHand)[1]);
    series.tip.push(rider.weapon?.tip?.[1] ?? 0);
    const neck = point(rider.x, P.neck);
    const pelvis = point(rider.x, P.pelvis);
    series.lean.push((Math.atan2(neck[0] - pelvis[0], neck[1] - pelvis[1]) * 180) / Math.PI);
  }
  return { gait, speed: horse.speed, series };
}

const range = (values) => Math.max(...values) - Math.min(...values);
const jump = (values) => Math.max(...values.slice(1).map((value, index) => Math.abs(value - values[index])));
/** Rises through the mean a second: the bounce's rate. */
function rate(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let crossings = 0;
  for (let index = 1; index < values.length; index += 1) if (values[index - 1] < mean && values[index] >= mean) crossings += 1;
  return crossings / (values.length * FRAME);
}

if (process.argv[1].endsWith('riding-motion.js')) {
  console.log(`${key} on his horse, ${seconds} s at each pace (peak to peak, cm; lean in deg; jump: the biggest change in one frame, cm)`);
  console.log('gait    speed  hz   | withers  hips  neck  head  hand  tip  | head/withers | lean p-p | jump: hips head tip');
  for (const [gait, speed] of Object.entries(SPEEDS)) {
    const { series, speed: actual } = measure(key, gait, speed);
    const cm = (values) => (100 * range(values)).toFixed(1).padStart(5);
    console.log(`${gait.padEnd(7)} ${actual.toFixed(1).padStart(5)} ${rate(series.withers).toFixed(1).padStart(4)} | ${cm(series.withers)}   ${cm(series.pelvis)} ${cm(series.neck)} ${cm(series.head)} ${cm(series.hand)} ${cm(series.tip)} | ${(range(series.head) / Math.max(1e-9, range(series.withers))).toFixed(2).padStart(6)}       | ${range(series.lean).toFixed(1).padStart(5)}    | ${(100 * jump(series.pelvis)).toFixed(1)} ${(100 * jump(series.head)).toFixed(1)} ${(100 * jump(series.tip)).toFixed(1)}`);
  }
}
