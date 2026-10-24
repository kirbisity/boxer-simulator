// How smooth the camera is: the play camera (followcam.js, then the rig's arm, camerarig.js, as main.js drawWorld runs them, at 60 frames a
// second, one physics step a frame) along Dunnottar's routes walked and run, in fights locked on, turning and sprinting in the sandbox, and
// the watching camera over a crowd. Per frame it records where the camera stands and looks, the arm's length and the direction it chose,
// and reports per stretch:
//   acc     |acceleration| of the camera (m/s²), p50 / p95 / max
//   jerk    |jerk| (m/s³), p50 / p95 / max
//   yawAcc  |angular acceleration| of where it looks (rad/s²), p95 / max
//   pops    frames that moved the camera more than 0.3 m (cuts excepted)
//   flips   changes of the direction the arm chose, per minute
//   dArm    the most the arm's length changed in a frame (m)
//   near    share of frames the camera stood nearer than 3 m to him; armP10: the 10th percentile of its length
// Usage: node tools/camjerk.js [scenario,...] [--out dir (an SVG of the frames round each scenario's worst jerk)] [--json file]
//   scenarios: front-walk front-run sewer-run tour sprint fight lockswitch turns watch (default: all)
// Not part of the game.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, placeOnFloor, point } from '../src/physics.js';
import { floorAt } from '../src/physics/terrain.js';
import { createFollowCam } from '../src/followcam.js';
import { createCameraRig } from '../src/camerarig.js';
import { createWatchCam, frameDistance } from '../src/watchcam.js';
import { cameraTerrain, mechanismsOf, regionContains, setMechanism, updateStage } from '../src/levelmode/stage.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { createLevelWorld, levelThink } from '../src/levelmode/level.js';
import { feetFloor } from '../src/levelmode/items.js';
import { DN_Y } from '../src/levelmode/stages/dnbuild.js';
import { DUNNOTTAR, DUNNOTTAR_BRANCHES, DUNNOTTAR_ROUTE, DUNNOTTAR_SEWER_ROUTE } from '../src/levelmode/stages/dunnottar.js';
import { CONTROL, directFighter, newOrders } from '../src/control.js';

const FPS = 60;
const DT = 1 / FPS;
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** A camera as main.js runs it in play mode: { frame(world, fighter, foe), series }. */
export function playCamera() {
  const cam = createFollowCam();
  const rig = createCameraRig();
  const scene = { place: 'stage', orbit: { yaw: 0, pitch: 0, distance: 1, target: { x: 0, y: 0, z: 0 } }, camera: { position: { set() {} }, lookAt() {} } };
  const series = [];
  let now = 0;
  let terrainWas = null;
  let last = null;
  function frame(world, fighter, { foe = null, label = '' } = {}) {
    now += DT;
    const view = cam.update({
      me: point(fighter.x, P.pelvis),
      facing: fighter.yaw,
      down: fighter.state !== 'up',
      foe: foe ? point(foe.x, P.pelvis) : null,
      running: Boolean(fighter.runMode),
      speed: Math.hypot(fighter.rootVelocity[0], fighter.rootVelocity[1]),
      velocity: [fighter.rootVelocity[0], 0, fighter.rootVelocity[1]],
      room: last ? last.distance / Math.max(1e-6, last.distance + last.pulled) : 1,
      moving: Boolean(fighter.walking),
      aspect: 16 / 9,
    }, now, DT);
    Object.assign(scene.orbit, { yaw: view.yaw, pitch: view.pitch, distance: view.distance });
    Object.assign(scene.orbit.target, { x: view.target[0], y: view.target[1], z: view.target[2] });
    const terrain = world.stage ? cameraTerrain(world) : null;
    const cut = !rig.arm.state.ready;
    const answer = (last = rig.update(scene, { terrain, subject: view.subject, free: cam.state.wasManual, dt: DT }));
    const pelvis = point(fighter.x, P.pelvis);
    series.push({
      t: now,
      p: answer.position,
      look: view.target,
      man: pelvis,
      arm: answer.distance,
      wanted: view.distance,
      pitch: answer.pitch,
      key: rig.arm.state.key,
      offset: [rig.arm.state.yaw, rig.arm.state.pitch],
      view: [view.yaw, view.pitch, view.distance],
      facing: fighter.yaw,
      runMode: Boolean(fighter.runMode),
      deficit: rig.arm.state.deficit,
      cut,
      swap: Boolean(world.stage && terrainWas && world.arena.terrain !== terrainWas),
      label,
      section: world.stage ? sectionOf(fighter) : '',
    });
    terrainWas = world.stage ? world.arena.terrain : null;
  }
  return { frame, series, cam, rig };
}

function sectionOf(fighter) {
  const x = fighter.x[P.pelvis * 3];
  const z = fighter.x[P.pelvis * 3 + 2];
  const y = feetFloor(fighter);
  return DUNNOTTAR.sections.find((section) => regionContains(section.bounds, x, z, y))?.id ?? '?';
}

const quantile = (list, q) => {
  if (!list.length) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};
const norm = (v) => Math.hypot(...v);
const sub = (a, b) => a.map((value, axis) => value - b[axis]);

/** The look direction (yaw, pitch) of a frame: from the camera to what it looks at. */
const aim = (frame) => {
  const d = sub(frame.look, frame.p);
  return [Math.atan2(d[2], d[0]), Math.atan2(d[1], Math.hypot(d[0], d[2]))];
};

/** The measures of a run of frames (a cut and the two frames after it are not measured across). */
export function measure(frames) {
  const acc = [];
  const jerk = [];
  const yawAcc = [];
  const steps = [];
  const dArm = [];
  let pops = 0;
  let flips = 0;
  const aims = [];
  let yaw = null;
  for (const frame of frames) {
    const [a, b] = aim(frame);
    yaw = yaw === null ? a : yaw + wrap(a - yaw);
    aims.push([yaw, b]);
  }
  let worst = { at: 0, jerk: 0 };
  for (let i = 1; i < frames.length; i += 1) {
    const recent = frames.slice(Math.max(0, i - 3), i + 1).some((frame) => frame.cut);
    if (recent) continue;
    const step = norm(sub(frames[i].p, frames[i - 1].p));
    steps.push(step);
    if (step > 0.3) pops += 1;
    dArm.push(Math.abs(frames[i].arm - frames[i - 1].arm));
    if (frames[i].key !== frames[i - 1].key) flips += 1;
    if (i < 3) continue;
    const v = (k) => sub(frames[k].p, frames[k - 1].p).map((value) => value / DT);
    const a = (k) => sub(v(k), v(k - 1)).map((value) => value / DT);
    const ai = a(i);
    acc.push(norm(ai));
    const j = norm(sub(ai, a(i - 1)).map((value) => value / DT));
    jerk.push(j);
    if (j > worst.jerk) worst = { at: i, jerk: j };
    const w = (k) => (aims[k][0] - aims[k - 1][0]) / DT;
    yawAcc.push(Math.abs((w(i) - w(i - 1)) / DT));
  }
  const arms = frames.map((frame) => frame.arm);
  const minutes = (frames.length * DT) / 60;
  return {
    frames: frames.length,
    acc: [quantile(acc, 0.5), quantile(acc, 0.95), Math.max(0, ...acc)],
    jerk: [quantile(jerk, 0.5), quantile(jerk, 0.95), Math.max(0, ...jerk)],
    yawAcc: [quantile(yawAcc, 0.95), Math.max(0, ...yawAcc)],
    pops,
    flips: flips / Math.max(minutes, 1e-6),
    dArm: Math.max(0, ...dArm),
    near: arms.filter((value) => value < 3).length / Math.max(1, arms.length),
    armP10: quantile(arms, 0.1),
    armP50: quantile(arms, 0.5),
    worst,
  };
}

// ---- Scenarios -------------------------------------------------------------------------------------------------------------------

/**
 * The player walked (or run: the stick past its run threshold, as a person runs, control.js) along `points` ([x, z] each) by the game's own
 * control (directFighter): the stick aimed at the next point, and on to the one after it once he is by it or past it (a man running
 * 7 m/s circles a point he has to reach exactly); his breath kept up. `each()` after every step. Returns { reached, stuckAt }.
 */
function stickWalk(world, me, points, { run = () => false, seconds = 200, think = null, each = null } = {}) {
  const orders = newOrders();
  const started = world.time;
  const step = (current, dt) => {
    if (current.stage) updateStage(current);
    think?.(current, dt);
    me.stamina = 1;
    directFighter(current, me, orders, dt);
  };
  const line = [[me.x[P.pelvis * 3], me.x[P.pelvis * 3 + 2]], ...points];
  let segment = 0;
  let best = -Infinity;
  let progressAt = world.time;
  while (segment < line.length - 1) {
    const hx = me.x[P.pelvis * 3];
    const hz = me.x[P.pelvis * 3 + 2];
    const [a, b] = [line[segment], line[segment + 1]];
    const length = Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]));
    const along = ((hx - a[0]) * (b[0] - a[0]) + (hz - a[1]) * (b[1] - a[1])) / length;
    // (Past the point, or by it, he aims at the next one: a man running 7 m/s does not hit a point, he passes by it.)
    if (along >= length - 0.2 || Math.hypot(b[0] - hx, b[1] - hz) < 0.8) {
      segment += 1;
      best = -Infinity;
      continue;
    }
    const progress = segment * 1000 + along;
    if (progress > best + 0.05) {
      best = progress;
      progressAt = world.time;
    } else if (world.time - progressAt > 3 || world.time - started > seconds) return { reached: segment, stuckAt: [hx, hz] };
    const dx = b[0] - hx;
    const dz = b[1] - hz;
    const distance = Math.max(1e-6, Math.hypot(dx, dz));
    const dir = [dx / distance, dz / distance];
    // (Where the floor falls away ahead, a ledge by the way, he walks: a person does not sprint along a cliff's edge.)
    const terrain = world.arena?.terrain;
    const y = me.x[P.pelvis * 3 + 1];
    const edge = terrain && [1, 2].some((m) => floorAt(terrain, hx, hz, y) - floorAt(terrain, hx + dir[0] * m, hz + dir[1] * m, y) > 0.8);
    orders.stick = { dir, amount: run() && !edge ? 1 : CONTROL.stick.fullFrom };
    advance(world, DT, step);
    each?.();
  }
  orders.stick = null;
  return { reached: points.length, stuckAt: null };
}

function ghostWorld(seed = 21) {
  const world = createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed });
  world.stage.ghost = true;
  for (const mechanism of mechanismsOf(DUNNOTTAR)) setMechanism(world, mechanism.id, 'open' in mechanism.states ? 'open' : 'down' in mechanism.states ? 'down' : Object.keys(mechanism.states).at(-1));
  return world;
}

/** The tight places off the routes: the vault's branches (the torture chamber, the stores, the well shaft and the crypt), and round the well in the court. */
const TOUR = [
  ...DUNNOTTAR_BRANCHES.map((branch) => ({ name: branch.name, start: branch.start, yaw: branch.facing, open: branch.open, points: branch.points })),
  { name: 'round the well in the court', start: [26, DN_Y.quad, -1], yaw: 0, points: [[34.2, -1.2], [34.2, -2.4], [29.5, -2.4], [29.5, -0.5], [33, -0.5]] },
];

const quiet = (current, dt) => {
  current.fighters.slice(1).forEach((fighter) => { fighter.dormant = true; });
  levelThink(current, dt);
};

/** Walk legs in a ghost walk; `sprint` (s on, s off) toggles the run. */
function routeRun(legs, { run, start = null, yaw = 0, sprint = null } = {}) {
  const world = ghostWorld();
  const me = world.fighters[0];
  if (start) {
    placeOnFloor(me, start[0], start[2], start[1], yaw);
    updateStage(world, true);
  }
  const camera = playCamera();
  let label = '';
  const running = () => (sprint ? world.time % (sprint[0] + sprint[1]) < sprint[0] : run);
  const each = () => camera.frame(world, me, { label });
  for (const leg of legs) {
    label = leg.name;
    for (const id of leg.open ?? []) setMechanism(world, id, 'open');
    if (leg.start) {
      placeOnFloor(me, leg.start[0], leg.start[2], leg.start[1], leg.yaw ?? 0);
      updateStage(world, true);
      camera.rig.reset();
      camera.cam.reset();
    }
    const result = stickWalk(world, me, leg.points, { run: running, think: quiet, each });
    if (result.reached < leg.points.length) console.error(`  (${leg.name}: stuck at ${result.stuckAt?.map((v) => v.toFixed(1))})`);
  }
  return camera.series;
}

/** A fight in the sandbox's ring, the camera locked on his man; `switchEvery` s: the lock moves between the other two. */
function fightRun({ seconds = 40, seed = 3, switchEvery = 0 } = {}) {
  const men = switchEvery ? [['samurai', 'red'], ['knight', 'blue'], ['heavy', 'blue']] : [['samurai', 'red'], ['knight', 'blue']];
  const world = createWorld(men.map(([preset, corner]) => ({ inputs: structuredClone(PRESETS[preset]), corner })), { seed });
  const camera = playCamera();
  const me = world.fighters[0];
  for (let frame = 0; frame < seconds * FPS; frame += 1) {
    advance(world, DT, (current, step) => thinkAll(current, step), DT);
    const index = switchEvery ? 1 + (Math.floor(world.time / switchEvery) % 2) : 1;
    camera.frame(world, me, { foe: world.fighters[index], label: switchEvery ? 'lock switching' : 'locked on' });
  }
  return camera.series;
}

/** Turning and sprinting in an open yard: a zigzag of 90 and 150 degree turns, the run on and off. */
function turnsRun() {
  const world = createWorld([{ inputs: structuredClone(PRESETS.heavy), corner: 'red' }], { seed: 5, arena: { halfX: 60, halfZ: 60, ring: false } });
  const me = world.fighters[0];
  const camera = playCamera();
  const points = [[10, 0], [10, 10], [0, 12], [12, 20], [-10, 20], [-10, 0], [8, -14], [0, -24], [20, -24]];
  let label = 'walk';
  const each = () => camera.frame(world, me, { label });
  for (const [mode, run] of [['walk', false], ['run', true]]) {
    label = mode;
    stickWalk(world, me, points, { run: () => run, think: (current, dt) => thinkAll(current, dt, new Set([0])), each });
  }
  return camera.series;
}

/** The watching camera's auto framing of a crowd (main.js watchCamera, then placeCamera's ease onto their middle). */
function watchRun({ seconds = 40 } = {}) {
  const names = ['samurai', 'knight', 'heavy', 'light', 'legionary', 'thraex'];
  const world = createWorld(names.map((preset, index) => ({ inputs: structuredClone(PRESETS[preset]), corner: index % 2 ? 'blue' : 'red' })), { seed: 7 });
  const orbit = { yaw: -0.5, pitch: 0.3, distance: 8, target: { x: 0, y: 1.1, z: 0 } };
  const watch = createWatchCam();
  const series = [];
  for (let frame = 0; frame < seconds * FPS; frame += 1) {
    advance(world, DT, (current, step) => thinkAll(current, step), DT);
    const middle = [0, 0, 0];
    for (const fighter of world.fighters) {
      middle[0] += fighter.x[24] / world.fighters.length;
      middle[2] += fighter.x[26] / world.fighters.length;
    }
    const spread = Math.max(0, ...world.fighters.map((fighter) => Math.hypot(fighter.x[24] - middle[0], fighter.x[26] - middle[2])));
    autoWatchStep(watch, orbit, middle, spread, DT);
    const { yaw, pitch, distance, target } = orbit;
    const p = [target.x + Math.cos(pitch) * Math.cos(yaw) * distance, target.y + Math.sin(pitch) * distance, target.z + Math.cos(pitch) * Math.sin(yaw) * distance];
    series.push({ t: frame * DT, p, look: [target.x, target.y, target.z], man: middle, arm: distance, wanted: distance, pitch, key: '', cut: frame === 0, swap: false, label: 'watch', section: '' });
  }
  return series;
}

/** main.js's auto watch frame for a crowd: the distance and the target eased (watchCamera, then placeCamera). */
function autoWatchStep(watch, orbit, middle, spread, dt) {
  orbit.distance += (frameDistance(spread) - orbit.distance) * (1 - 0.97 ** (dt * 60));
  for (const [axis, value] of [['x', middle[0]], ['y', 1.1], ['z', middle[2]]]) orbit.target[axis] += (value - orbit.target[axis]) * (1 - 0.94 ** (dt * 60));
}

export const SCENARIOS = {
  'front-walk': () => routeRun(DUNNOTTAR_ROUTE, { run: false }),
  'front-run': () => routeRun(DUNNOTTAR_ROUTE, { run: true }),
  'sewer-run': () => routeRun(DUNNOTTAR_SEWER_ROUTE.slice(1, 10), { run: true, start: [-46, 0, 46], yaw: 0 }),
  tour: () => routeRun(TOUR, { run: true }),
  sprint: () => routeRun(DUNNOTTAR_ROUTE.slice(0, 1), { run: false, sprint: [3, 1.5] }),
  fight: () => fightRun(),
  lockswitch: () => fightRun({ switchEvery: 3, seed: 4 }),
  turns: () => turnsRun(),
  watch: () => watchRun(),
};

// ---- Report ----------------------------------------------------------------------------------------------------------------------

const f = (value, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : '-');

function row(name, m) {
  return {
    stretch: name.slice(0, 34),
    frames: m.frames,
    acc: `${f(m.acc[0])}/${f(m.acc[1])}/${f(m.acc[2], 0)}`,
    jerk: `${f(m.jerk[0], 0)}/${f(m.jerk[1], 0)}/${f(m.jerk[2], 0)}`,
    yawAcc: `${f(m.yawAcc[0])}/${f(m.yawAcc[1], 0)}`,
    pops: m.pops,
    flips: f(m.flips),
    dArm: f(m.dArm, 2),
    near: `${f(m.near * 100, 0)}%`,
    armP10: f(m.armP10, 2),
  };
}

/** Groups of consecutive frames with the same key. */
function groups(series, key) {
  const out = new Map();
  for (const frame of series) {
    const name = frame[key] || '-';
    if (!out.has(name)) out.set(name, []);
    out.get(name).push(frame);
  }
  return out;
}

/** An SVG of a window of frames: the camera's height, its step per frame and the arm's length. */
export function plot(frames, title) {
  const width = 900;
  const lane = 120;
  const lanes = [
    ['camera y (m)', frames.map((frame) => frame.p[1])],
    ['step per frame (m)', frames.map((frame, i) => (i ? norm(sub(frame.p, frames[i - 1].p)) : 0))],
    ['arm length (m)', frames.map((frame) => frame.arm)],
    ['look point y (m)', frames.map((frame) => frame.look[1])],
  ];
  let body = '';
  lanes.forEach(([name, values], index) => {
    const top = 30 + index * (lane + 24);
    const low = Math.min(...values);
    const high = Math.max(...values, low + 1e-3);
    const x = (i) => 50 + (i / Math.max(1, values.length - 1)) * (width - 70);
    const y = (value) => top + lane - ((value - low) / (high - low)) * lane;
    body += `<text x="50" y="${top - 6}" font-size="12" fill="#555">${name}: ${low.toFixed(2)} to ${high.toFixed(2)}</text>`;
    body += `<rect x="50" y="${top}" width="${width - 70}" height="${lane}" fill="none" stroke="#ddd"/>`;
    body += `<polyline fill="none" stroke="#2b6cb0" stroke-width="1.5" points="${values.map((value, i) => `${x(i).toFixed(1)},${y(value).toFixed(1)}`).join(' ')}"/>`;
    frames.forEach((frame, i) => {
      if (frame.swap) body += `<line x1="${x(i)}" x2="${x(i)}" y1="${top}" y2="${top + lane}" stroke="#d69e2e" stroke-dasharray="3,3"/>`;
      if (i && frame.key !== frames[i - 1].key) body += `<circle cx="${x(i)}" cy="${top + lane - 4}" r="3" fill="#c53030"/>`;
    });
  });
  const height = 30 + lanes.length * (lane + 24);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="sans-serif"><rect width="100%" height="100%" fill="#fff"/><text x="50" y="18" font-size="14">${title} (frames at 60 fps; dashed: a section swap, dot: the arm's direction changed)</text>${body}</svg>`;
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : null;
  };
  const names = (args[0] && !args[0].startsWith('--') ? args[0].split(',') : Object.keys(SCENARIOS));
  const out = option('--out');
  const jsonFile = option('--json');
  const all = {};
  for (const name of names) {
    const started = Date.now();
    const series = SCENARIOS[name]();
    const total = measure(series);
    const rows = [row(`${name} (all)`, total)];
    const parts = {};
    const by = groups(series, 'label');
    if (by.size > 1) for (const [part, frames] of by) {
      parts[part] = measure(frames);
      rows.push(row(`  ${part}`, parts[part]));
    }
    const sections = {};
    if (series[0]?.section) for (const [part, frames] of groups(series, 'section')) sections[part] = measure(frames);
    console.log(`\n== ${name} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
    console.table(rows);
    all[name] = { total, parts, sections };
    if (out) {
      mkdirSync(out, { recursive: true });
      const at = total.worst.at;
      const window = series.slice(Math.max(0, at - 120), at + 120);
      writeFileSync(join(out, `${name}-worst.svg`), plot(window, `${name}: around the worst jerk (frame ${at}, ${series[at]?.label})`));
      all[name].worstFrame = { at, label: series[at]?.label, man: series[at]?.man, p: series[at]?.p };
    }
  }
  if (jsonFile) writeFileSync(jsonFile, JSON.stringify(all, null, 1));
}

if (process.argv[1]?.endsWith('camjerk.js')) await main();
