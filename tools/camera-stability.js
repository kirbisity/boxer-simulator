// How steady the following camera is through a fight: the camera of
// before (eased by fixed shares a frame, tied to the raw pelvis and the
// fighter's yaw) against followcam.js, over the same fights, each frame at
// 60 fps. Reported per pairing, unlocked and locked on:
//   shake   RMS acceleration of the camera's position (m/s²)
//   aimAcc  RMS angular acceleration of where it looks (rad/s²)
//   turns   reversals of the view's turning (yaw rate changing sign while over 0.05 rad/s) per second
//   lookAcc RMS acceleration of the point it looks at (m/s²)
// Usage: node tools/camera-stability.js [seconds] [seeds]

import { PRESETS, P } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, opponentFor, point } from '../src/physics.js';
import { createFollowCam, FOLLOW_CAM } from '../src/followcam.js';

const seconds = Number(process.argv[2] ?? 30);
const seeds = Number(process.argv[3] ?? 3);
const FPS = 60;
const dt = 1 / FPS;
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** The camera as it was (main.js before): shares of the way a frame. */
function oldCamera() {
  const orbit = { yaw: -0.5, pitch: 0.2, distance: 5.2, target: null };
  return (fighter, foe) => {
    const pelvis = point(fighter.x, P.pelvis);
    const apart = foe ? Math.hypot(foe[0] - pelvis[0], foe[2] - pelvis[2]) : 0;
    orbit.distance += (4.2 + apart * 0.6 - orbit.distance) * 0.1;
    orbit.pitch += (0.26 - orbit.pitch) * 0.05;
    const behind = foe ? Math.atan2(pelvis[2] - foe[2], pelvis[0] - foe[0]) + 0.55 : Math.atan2(Math.sin(fighter.yaw), -Math.cos(fighter.yaw));
    orbit.yaw += wrap(behind - orbit.yaw) * 0.05;
    const focus = foe
      ? [pelvis[0] + (foe[0] - pelvis[0]) * 0.45, pelvis[1] + 0.45, pelvis[2] + (foe[2] - pelvis[2]) * 0.45]
      : [pelvis[0] + Math.sin(fighter.yaw) * 0.55, pelvis[1] + 0.45, pelvis[2] + Math.cos(fighter.yaw) * 0.55];
    orbit.target ??= focus.slice();
    for (let axis = 0; axis < 3; axis += 1) orbit.target[axis] += (focus[axis] - orbit.target[axis]) * 0.2;
    return { target: orbit.target.slice(), yaw: orbit.yaw, pitch: orbit.pitch, distance: orbit.distance };
  };
}

/** The new camera, fed as main.js feeds it. */
function newCamera() {
  const cam = createFollowCam(FOLLOW_CAM);
  let now = 0;
  return (fighter, foe) => {
    now += dt;
    return cam.update({ me: point(fighter.x, P.pelvis), facing: fighter.yaw, down: fighter.state !== 'up', foe, moving: false }, now, dt);
  };
}

const position = (view) => [
  view.target[0] + Math.cos(view.pitch) * Math.cos(view.yaw) * view.distance,
  view.target[1] + Math.sin(view.pitch) * view.distance,
  view.target[2] + Math.cos(view.pitch) * Math.sin(view.yaw) * view.distance,
];

function measure(frames) {
  const accel = (series) => {
    let sum = 0;
    for (let index = 2; index < series.length; index += 1) {
      const a = series[index].map((value, axis) => (value - 2 * series[index - 1][axis] + series[index - 2][axis]) / (dt * dt));
      sum += a.reduce((total, value) => total + value * value, 0);
    }
    return Math.sqrt(sum / Math.max(1, series.length - 2));
  };
  const positions = frames.map(position);
  const targets = frames.map((view) => view.target);
  // Aim: yaw and pitch, unwrapped.
  const aims = [];
  let yaw = frames[0].yaw;
  for (const view of frames) {
    yaw += wrap(view.yaw - yaw);
    aims.push([yaw, view.pitch]);
  }
  let turns = 0;
  let lastSign = 0;
  for (let index = 1; index < aims.length; index += 1) {
    const rate = (aims[index][0] - aims[index - 1][0]) / dt;
    if (Math.abs(rate) < 0.05) continue;
    const sign = Math.sign(rate);
    if (lastSign && sign !== lastSign) turns += 1;
    lastSign = sign;
  }
  return { shake: accel(positions), aimAcc: accel(aims), turns: turns / (frames.length * dt), lookAcc: accel(targets) };
}

const pairings = [['samurai', 'knight'], ['heavy', 'light'], ['legionary', 'thraex']];
const rows = [];
for (const [red, blue] of pairings) {
  for (const locked of [false, true]) {
    const totals = { old: [], new: [] };
    for (let seed = 1; seed <= seeds; seed += 1) {
      const world = createWorld([{ inputs: structuredClone(PRESETS[red]), corner: 'red' }, { inputs: structuredClone(PRESETS[blue]), corner: 'blue' }], { seed });
      const cameras = { old: oldCamera(), new: newCamera() };
      const frames = { old: [], new: [] };
      const me = world.fighters[0];
      for (let frame = 0; frame < seconds * FPS; frame += 1) {
        advance(world, dt, (current, step) => thinkAll(current, step), dt);
        const his = locked ? opponentFor(world, me) : null;
        const foe = his ? point(his.x, P.pelvis) : null;
        for (const kind of ['old', 'new']) frames[kind].push(cameras[kind](me, foe));
      }
      for (const kind of ['old', 'new']) totals[kind].push(measure(frames[kind].slice(FPS)));
    }
    const mean = (list, key) => list.reduce((sum, entry) => sum + entry[key], 0) / list.length;
    const row = { pairing: `${red} v ${blue}`, locked };
    for (const key of ['shake', 'aimAcc', 'turns', 'lookAcc']) row[key] = `${mean(totals.old, key).toFixed(2)} → ${mean(totals.new, key).toFixed(2)}`;
    rows.push(row);
  }
}
console.table(rows);
