// Running, by body: each build run flat out along an open field from a standstill, then let go.
// Per build: mass (with gear), top speed (m/s, the hips' over the last 2.5 s of the run), the time to 90% of it, the
// stopping distance (m the hips travel once the run is let go, until they are below 0.3 m/s), the same from a 3 m/s
// jog (`stop3`: where the gait model exists), the step rate (landings a second at the top), the stride (m per step), the
// flight share (frames with both ankles 10 cm or more above where they stand) and the trunk's lean (deg forward of
// upright, mean at the top).
// Usage: node tools/gait.js [sprint|ai] [seconds]
//   sprint: the player's run (runMode and running); ai: an AI man's run (running alone, as ai.js sets it).

import { P, PRESETS } from '../src/body.js';
import { advance, createWorld, placeFighter, point } from '../src/physics.js';

const BASE = { sex: 'male', heightCm: 178, frame: 'medium', age: 28, style: 'boxing' };

/** The builds the gait is compared over: from starved to sumo, and men in armour. */
export const GAIT_BUILDS = {
  starved: { ...BASE, heightCm: 170, exercise: 0.2, calories: 1669, outfit: { kind: 'rags' } },
  light: { ...BASE, heightCm: 170, frame: 'small', exercise: 0.5, bodyFat: 0.12 },
  average: { ...BASE, exercise: 0.35, bodyFat: 0.19, age: 32 },
  athletic: { ...BASE, heightCm: 180, exercise: 0.9, bodyFat: 0.1, age: 24 },
  bodybuilder: { ...BASE, heightCm: 180, frame: 'large', exercise: 1, bodyFat: 0.11 },
  overweight: { ...BASE, exercise: 0.25, bodyFat: 0.28, age: 38 },
  obese: { ...BASE, exercise: 0.1, bodyFat: 0.38, age: 40 },
  sumo: { ...PRESETS.sumo },
  old: { ...BASE, exercise: 0.15, bodyFat: 0.24, age: 72 },
  woman: { ...BASE, sex: 'female', heightCm: 165, exercise: 0.45, bodyFat: 0.24 },
  plate: { ...PRESETS.knight },
  mail: { ...PRESETS.templar },
  gambeson: { ...BASE, exercise: 0.6, bodyFat: 0.14, outfit: { kind: 'forger' }, style: 'longsword' },
};

const FIELD = { halfX: 120, halfZ: 120 };
const DT = 1 / 60;

function speedOf(samples, from, to) {
  const a = samples[from];
  const b = samples[to];
  return Math.hypot(b.at[0] - a.at[0], b.at[2] - a.at[2]) / (b.t - a.t);
}

/** One build run from a standstill for `seconds`, then let go. `setup(fighter)` may change him (stamina, an injury). */
export function runTrial(inputs, { mode = 'sprint', seconds = 8, setup, turn = 0, pace = 1, frames } = {}) {
  const world = createWorld([{ inputs: structuredClone(inputs), corner: 'red' }, { inputs: structuredClone(PRESETS.light), corner: 'blue' }], { seed: 5, arena: FIELD });
  const me = world.fighters[0];
  placeFighter(me, -100, 0);
  placeFighter(world.fighters[1], -100, 100);
  advance(world, 0.6);
  setup?.(me);
  const samples = [];
  let landings = 0;
  let flight = 0;
  let leanSum = 0;
  let leanFrames = 0;
  const stepping = { l: false, r: false };
  const go = (t) => {
    const heading = turn ? turn * Math.max(0, t - seconds / 2) : 0;
    const pelvis = point(me.x, P.pelvis);
    me.goTo = [pelvis[0] + Math.cos(heading) * 5, 0, pelvis[2] - Math.sin(heading) * 5];
    me.move = pace;
    me.running = true;
    if (mode === 'sprint') me.runMode = true;
  };
  let t = 0;
  const top = { from: seconds - 2.5 };
  for (; t < seconds; t += DT) {
    go(t);
    advance(world, DT);
    frames?.(me, t, world);
    const at = point(me.x, P.pelvis);
    samples.push({ t, at });
    if (t >= top.from) {
      for (const side of ['l', 'r']) {
        const now = Boolean(me.feet?.[side]?.step);
        if (stepping[side] && !now) landings += 1;
        stepping[side] = now;
      }
      const off = ['lFoot', 'rFoot'].every((name) => me.x[P[name] * 3 + 1] - me.body.lengths.ankle - (me.lift ?? 0) > 0.1);
      if (off) flight += 1;
      const trunk = [me.x[P.neck * 3] - at[0], me.x[P.neck * 3 + 1] - at[1], me.x[P.neck * 3 + 2] - at[2]];
      const forward = [Math.cos(me.yaw), -Math.sin(me.yaw)];
      leanSum += Math.atan2(trunk[0] * forward[0] + trunk[2] * forward[1], trunk[1]);
      leanFrames += 1;
    } else {
      for (const side of ['l', 'r']) stepping[side] = Boolean(me.feet?.[side]?.step);
    }
  }
  const firstTop = samples.findIndex((s) => s.t >= top.from);
  const topSpeed = speedOf(samples, firstTop, samples.length - 1);
  // The time to 90% of it: the first 0.25 s window as fast.
  const window = Math.round(0.25 / DT);
  let to90 = null;
  for (let index = window; index < samples.length; index += 1) {
    if (speedOf(samples, index - window, index) >= 0.9 * topSpeed) {
      to90 = samples[index - Math.round(window / 2)].t;
      break;
    }
  }
  // Let go: how far the hips carry on.
  const released = point(me.x, P.pelvis);
  me.running = false;
  me.runMode = false;
  me.move = 0;
  me.goTo = null;
  let stopping = null;
  let last = released;
  let fell = me.state !== 'up';
  for (let s = 0; s < 4; s += DT) {
    me.move = 0;
    advance(world, DT);
    frames?.(me, seconds + s, world);
    const at = point(me.x, P.pelvis);
    const speed = Math.hypot(at[0] - last[0], at[2] - last[2]) / DT;
    last = at;
    if (me.state !== 'up') fell = true;
    if (stopping === null && s > 0.1 && speed < 0.3) {
      stopping = Math.hypot(at[0] - released[0], at[2] - released[2]);
      break;
    }
  }
  const span = seconds - top.from;
  const stepRate = landings / span;
  return {
    kg: me.body.massKg, topSpeed, to90, stopping, stepRate, stride: stepRate > 0 ? topSpeed / stepRate : null,
    flight: flight / Math.max(1, leanFrames), lean: (leanSum / Math.max(1, leanFrames)) * (180 / Math.PI), fell, stamina: me.stamina,
  };
}

/** The stopping distance from a run at `speed` m/s (null where there is no gait model to set the pace by). */
async function stopFrom(inputs, speed) {
  const gait = await import('../src/physics/gait.js').catch(() => null);
  if (!gait) return null;
  let pace = 1;
  runTrial(inputs, { mode: 'sprint', seconds: 0.7, setup: (me) => { pace = Math.min(1, speed / gait.runSpeed(me, true)); } });
  return runTrial(inputs, { mode: 'sprint', seconds: 5, pace }).stopping;
}

export async function gaitTable(builds = GAIT_BUILDS, options = {}) {
  const rows = [];
  for (const [label, inputs] of Object.entries(builds)) rows.push({ label, ...runTrial(inputs, options), stop3: await stopFrom(inputs, 3) });
  return rows;
}

const fixed = (value, digits = 2, width = 5) => (value === null || value === undefined ? '-' : value.toFixed(digits)).padStart(width);

export function printTable(rows) {
  console.log('build          kg    top m/s  to90 s  stop m  stop3 m  steps/s  stride m  flight  lean deg');
  for (const row of rows) {
    console.log(`${row.label.padEnd(12)} ${fixed(row.kg, 0, 4)}  ${fixed(row.topSpeed, 2, 7)}  ${fixed(row.to90, 2, 6)}  ${fixed(row.stopping, 2, 6)}  ${fixed(row.stop3, 2, 7)}  ${fixed(row.stepRate, 2, 7)}  ${fixed(row.stride, 2, 8)}  ${fixed(row.flight, 2, 6)}  ${fixed(row.lean, 1, 8)}${row.fell ? '  FELL' : ''}`);
  }
}

if (globalThis.process?.argv[1]?.endsWith('gait.js')) {
  const mode = process.argv[2] ?? 'sprint';
  const seconds = Number(process.argv[3] ?? 8);
  printTable(await gaitTable(GAIT_BUILDS, { mode, seconds }));
}
