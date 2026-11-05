// A rider through a slalom under the stick (the reins, control.js rideStick) at a walk, a canter and a gallop: how smoothly his
// trunk and head are carried round the turns, and how far he leans into them against the lean that balances the turn.
// Measured at 60 Hz after the horse is up to its pace: the RMS jerk of his head across the horse's line (m/s³), the RMS
// angular acceleration of his trunk (pelvis to neck, rad/s²), the horse's own RMS yaw acceleration (rad/s²); his trunk's lean
// into the turn against the balance angle atan(v·ω/g) (deg, the mean over the turning frames, and the RMS of the difference), and
// his head's tilt off the vertical across the line (deg RMS). `node tools/rider-turn.js [character] [half-period s] [angle deg] [skill]`.

import { P, PRESETS } from '../src/body.js';
import { advance, createWorld, point, WORLD } from '../src/physics.js';
import { directFighter, newOrders } from '../src/control.js';
import { vec, yawRotate } from '../src/pose.js';

export const SLALOM_GAITS = { walk: 0.3, canter: 0.8, gallop: 1 };
const FRAME = 1 / 60;

/** One slalom: the stick swung `angle` either side of the line every `half` s, for `seconds`. Returns the frames' series. */
export function slalom(gait, { key = 'knight', half = 1.4, angle = 70, seconds = 12, skill, record } = {}) {
  const inputs = { ...structuredClone(PRESETS[key]), mounted: true };
  if (skill !== undefined) inputs.skill = skill;
  const world = createWorld([{ inputs, corner: 'red' }, { inputs: structuredClone(PRESETS.yari), corner: 'blue' }], { seed: 3, arena: { halfX: 400, halfZ: 400 } });
  const [me, foe] = world.fighters;
  foe.state = 'out';
  me.cooldown = 1e9;
  const orders = newOrders();
  const horse = me.mount;
  const amount = SLALOM_GAITS[gait];
  const line = horse.yaw;
  const frames = [];
  const warm = 4;
  for (let t = 0; t < warm + seconds; t += FRAME) {
    const swing = t < warm ? 0 : (Math.floor((t - warm) / half) % 2 === 0 ? 1 : -1) * (angle * Math.PI) / 180;
    const heading = line + swing;
    orders.stick = { dir: [Math.cos(heading), -Math.sin(heading)], amount };
    directFighter(world, me, orders, FRAME);
    advance(world, FRAME);
    if (t < warm) continue;
    const f = yawRotate([1, 0, 0], horse.yaw);
    const l = yawRotate([0, 0, 1], horse.yaw);
    const frame = { t, yaw: horse.yaw, yawRate: horse.yawRate, speed: horse.speed, bank: horse.bank ?? 0, f, l, pelvis: point(me.x, P.pelvis), neck: point(me.x, P.neck), head: point(me.x, P.head) };
    frames.push(frame);
    record?.(world, me, frame);
  }
  return frames;
}

const rms = (values) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / Math.max(1, values.length));
const deg = (rad) => (rad * 180) / Math.PI;

/** The measures of a slalom's frames. */
export function measures(frames) {
  const n = frames.length;
  const g = WORLD.gravity;
  // The head's acceleration (central second difference), across the horse's line; its jerk the difference of that.
  const lateralAcc = [];
  for (let i = 1; i < n - 1; i += 1) {
    const a = vec.scale(vec.add(vec.sub(frames[i + 1].head, vec.scale(frames[i].head, 2)), frames[i - 1].head), 1 / (FRAME * FRAME));
    lateralAcc.push(vec.dot(a, frames[i].l));
  }
  const headJerk = lateralAcc.slice(1).map((value, i) => (value - lateralAcc[i]) / FRAME);
  // The same of his hips (held to the saddle): what the horse gives him.
  const seatAcc = [];
  for (let i = 1; i < n - 1; i += 1) seatAcc.push(vec.dot(vec.scale(vec.add(vec.sub(frames[i + 1].pelvis, vec.scale(frames[i].pelvis, 2)), frames[i - 1].pelvis), 1 / (FRAME * FRAME)), frames[i].l));
  const seatJerk = seatAcc.slice(1).map((value, i) => (value - seatAcc[i]) / FRAME);
  // The trunk's line and its angular velocity (u × du/dt), and the change of that.
  const trunk = frames.map((frame) => vec.normalize(vec.sub(frame.neck, frame.pelvis)));
  const omega = [];
  for (let i = 1; i < n - 1; i += 1) omega.push(vec.cross(trunk[i], vec.scale(vec.sub(trunk[i + 1], trunk[i - 1]), 1 / (2 * FRAME))));
  const trunkAlpha = omega.slice(1).map((value, i) => vec.length(vec.sub(value, omega[i])) / FRAME);
  const yawAlpha = frames.slice(1).map((frame, i) => (frame.yawRate - frames[i].yawRate) / FRAME);
  // The lean into the turn: positive in toward the turn's centre (a positive yaw rate turns right, its left is +l).
  const leans = [];
  const balances = [];
  const heads = [];
  // Signed (positive to the horse's left), every frame: his trunk's roll and the balance angle, for the lag between them.
  const rolls = [];
  const balanced = [];
  for (let i = 0; i < n; i += 1) {
    const frame = frames[i];
    const side = vec.dot(trunk[i], frame.l);
    const roll = Math.atan2(side, trunk[i][1]);
    // Toward the centre: a right turn's centre is to the right (−l).
    const inward = -Math.sign(frame.yawRate) * roll;
    const balance = Math.atan(Math.abs(frame.speed * frame.yawRate) / g);
    const headLine = vec.normalize(vec.sub(frame.head, frame.neck));
    heads.push(Math.atan2(vec.dot(headLine, frame.l), headLine[1]));
    rolls.push(roll);
    balanced.push(-Math.sign(frame.yawRate) * balance);
    if (balance > (3 * Math.PI) / 180) {
      leans.push(inward);
      balances.push(balance);
    }
  }
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  // The shift (s) of his roll that best matches the balance angle's course: negative, he leans ahead of the turn.
  let lag = 0;
  let best = -Infinity;
  for (let shift = -30; shift <= 30; shift += 1) {
    let sum = 0;
    for (let i = Math.max(0, -shift); i < n - Math.max(0, shift); i += 1) sum += rolls[i + shift] * balanced[i];
    if (sum > best) [best, lag] = [sum, shift * FRAME];
  }
  return {
    lag,
    speed: mean(frames.map((frame) => Math.abs(frame.speed))),
    headJerk: rms(headJerk),
    seatJerk: rms(seatJerk),
    trunkAlpha: rms(trunkAlpha),
    yawAlpha: rms(yawAlpha),
    lean: deg(mean(leans)),
    balance: deg(mean(balances)),
    leanError: deg(rms(leans.map((lean, i) => lean - balances[i]))),
    headTilt: deg(rms(heads)),
    turning: leans.length / n,
  };
}

if (process.argv[1].endsWith('rider-turn.js')) {
  const [key = 'knight', halfArg = '1.4', angleArg = '70', skillArg] = process.argv.slice(2);
  const skill = skillArg === undefined ? undefined : Number(skillArg);
  console.log(`${key}${skill === undefined ? '' : ` (skill ${skill})`}, the stick swung ±${angleArg} deg every ${halfArg} s for 12 s`);
  console.log('gait     m/s | head (hips) jerk m/s3 | trunk alpha rad/s2 | horse yaw alpha | lean deg / balance deg | lean err deg | lag ms | head tilt deg | turning');
  for (const gait of Object.keys(SLALOM_GAITS)) {
    const m = measures(slalom(gait, { key, half: Number(halfArg), angle: Number(angleArg), skill }));
    console.log(`${gait.padEnd(7)} ${m.speed.toFixed(1).padStart(5)} | ${m.headJerk.toFixed(0).padStart(9)} (${m.seatJerk.toFixed(0).padStart(4)}) | ${m.trunkAlpha.toFixed(1).padStart(18)} | ${m.yawAlpha.toFixed(2).padStart(15)} | ${m.lean.toFixed(1).padStart(8)} / ${m.balance.toFixed(1).padStart(5)}       | ${m.leanError.toFixed(1).padStart(12)} | ${(1000 * m.lag).toFixed(0).padStart(6)} | ${m.headTilt.toFixed(1).padStart(13)} | ${(100 * m.turning).toFixed(0)}%`);
  }
}
