// Runs and walks every stair flight of Dunnottar (and the test yard's) up and down, and reports falls and injuries.
// Usage: node tools/stairs.js [walk|run] [seeds]
import { P, PRESETS } from '../src/body.js';
import { advance, legShare, placeOnFloor } from '../src/physics.js';
import { floorAt } from '../src/physics/terrain.js';
import { createStageWorld, mechanismsOf, setMechanism, updateStage } from '../src/levelmode/stage.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { DUNNOTTAR } from '../src/levelmode/stages/dunnottar.js';
import { hipsAt } from '../test/walker.js';

export const BODIES = { forger: () => levelPreset('forger'), heavy: () => structuredClone(PRESETS.heavy), light: () => structuredClone(PRESETS.light) };

/**
 * Every stair of a stage, read from its data: a straight flight (kind 'stairs') or a winding stair (the
 * slab treads sharing an id with more than ten of them). Each is { name, section, foot, route, top, floor, yaw },
 * `route` the points [x, z] up the middle (the first on the landing before it, the last on the landing past it).
 */
export function stairsOfStage(stage, margin = 1) {
  const out = [];
  for (const section of stage.sections) {
    const winding = new Map();
    section.terrain.forEach((solid, index) => {
      if (solid.kind === 'stairs') {
        const cos = Math.cos(solid.yaw ?? 0);
        const sin = Math.sin(solid.yaw ?? 0);
        const half = solid.size[0] / 2;
        const at = (u) => [solid.at[0] + u * cos, solid.at[1] - u * sin];
        const route = [at(-half - margin), at(-half + 0.35), at(half - 0.35), at(half + margin)];
        out.push({ name: `${section.id}/${solid.id ?? 'flight'}#${index}`, section: section.id, route, floor: solid.from, top: solid.from + solid.steps * solid.rise, steps: solid.steps, rise: solid.rise, yaw: solid.yaw ?? 0, upYaw: solid.yaw ?? 0 });
      } else if (solid.kind === 'slab' && solid.id && solid.bottom !== undefined && solid.bottom > -Infinity) {
        if (!winding.has(solid.id)) winding.set(solid.id, []);
        winding.get(solid.id).push(solid);
      }
    });
    for (const [id, treads] of winding) {
      if (treads.length < 10) continue;
      treads.sort((a, b) => a.top - b.top);
      const route = treads.map((t) => t.at);
      out.push({ name: `${section.id}/${id}`, section: section.id, route, floor: treads[0].top - (treads[1].top - treads[0].top), top: treads.at(-1).top, steps: treads.length, rise: treads[1].top - treads[0].top, winding: true });
    }
  }
  return out;
}

/** Run (or walk) a man along waypoints on a stage's terrain; returns what happened to him. */
export function trek(world, fighter, waypoints, { running = true, seconds = 120, within = 0.5 } = {}) {
  fighter.walking = true;
  fighter.running = running;
  const log = { air: 0, minHip: Infinity, maxDown: 0, reached: 0, stateChanges: [] };
  let lastState = fighter.state;
  const started = world.time;
  const listed = world.events.length;
  for (let i = 0; i < waypoints.length; i += 1) {
    const [x, z] = waypoints[i];
    let best = Infinity;
    let lastCloser = world.time;
    for (;;) {
      const [hx, hz] = hipsAt(fighter);
      const d = Math.hypot(x - hx, z - hz);
      if (d < within) break;
      if (world.time - started > seconds) return finish(log, world, fighter, listed, false);
      if (d < best - 0.05) { best = d; lastCloser = world.time; } else if (world.time - lastCloser > 3) return finish(log, world, fighter, listed, false);
      fighter.goTo = [x, 0, z];
      fighter.move = 1;
      fighter.running = running;
      advance(world, 1 / 60, (w) => { updateStage(w); });
      if (fighter.state !== lastState) { log.stateChanges.push([+(world.time - started).toFixed(2), lastState, fighter.state, +hx.toFixed(1), +hz.toFixed(1)]); lastState = fighter.state; }
      if (fighter.air) log.air += 1;
      const hy = fighter.x[P.pelvis * 3 + 1];
      log.minHip = Math.min(log.minHip, hy - floorAt(world.arena.terrain, hx, hz, hy));
      log.maxDown = Math.max(log.maxDown, -fighter.v[P.pelvis * 3 + 1]);
    }
    log.reached = i + 1;
  }
  return finish(log, world, fighter, listed, true);
}

function finish(log, world, fighter, listed, done) {
  log.done = done;
  log.events = world.events.slice(listed).filter((e) => e.fighter === fighter.id && ['fell', 'impact', 'broken', 'killed', 'stopped'].includes(e.kind)).map((e) => `${e.kind}${e.speed ? `@${e.speed.toFixed(1)}` : ''}:${(e.effects ?? []).join('+')}`);
  log.legs = +legShare(fighter).toFixed(2);
  log.trunk = +(fighter.trauma?.trunk ?? 0).toFixed(2);
  log.broken = [...fighter.broken];
  log.state = fighter.state;
  log.ok = done && fighter.state === 'up' && log.events.length === 0 && log.air === 0 && log.stateChanges.length === 0;
  return log;
}

/** A world of `stage` with only the player awake, standing on the floor at `at` ([x, z]), facing `yaw`. */
export function lone(stage, bodyName, seed, at, floor, yaw) {
  const world = createStageWorld(stage, BODIES[bodyName](), { seed });
  const me = world.fighters[0];
  for (const mechanism of mechanismsOf(stage)) setMechanism(world, mechanism.id, 'open');
  placeOnFloor(me, at[0], at[1], floor, yaw);
  updateStage(world, true);
  world.fighters.slice(1).forEach((f) => { f.dormant = true; });
  return { world, me };
}

/** One trek up (dir 'up') or down a stair. Returns the log. */
export function climbStair(stage, stair, body, seed, dir, running) {
  const route = dir === 'up' ? stair.route : [...stair.route].reverse();
  const start = route[0];
  const next = route[1];
  const yaw = Math.atan2(-(next[1] - start[1]), next[0] - start[0]);
  const floor = dir === 'up' ? (stair.winding ? stair.floor : stair.floor) : stair.top;
  const { world, me } = lone(stage, body, seed, start, floor, yaw);
  const log = trek(world, me, route.slice(1), { running });
  log.fighter = me;
  log.world = world;
  return log;
}

if (process.argv[1]?.endsWith('tools/stairs.js')) {
  const mode = process.argv[2] ?? 'run';
  const seeds = Number(process.argv[3] ?? 3);
  const running = mode === 'run';
  let bad = 0;
  let total = 0;
  for (const stair of stairsOfStage(DUNNOTTAR)) {
    const failures = [];
    for (const body of Object.keys(BODIES)) {
      for (let seed = 1; seed <= seeds; seed += 1) {
        for (const dir of ['up', 'down']) {
          total += 1;
          const log = climbStair(DUNNOTTAR, stair, body, seed, dir, running);
          if (!log.ok) { bad += 1; failures.push(`${body}${seed}${dir}: ${JSON.stringify({ done: log.done, reached: log.reached, air: log.air, ev: log.events, st: log.stateChanges, legs: log.legs, trunk: log.trunk, br: log.broken, maxDown: +log.maxDown.toFixed(1), minHip: +log.minHip.toFixed(2) })}`); }
        }
      }
    }
    console.log(stair.name, `${stair.steps}x${stair.rise.toFixed(3)}`, failures.length ? `${failures.length} bad` : 'clean');
    failures.slice(0, 4).forEach((f) => console.log('   ', f));
  }
  console.log(`${mode}: ${bad} of ${total} treks went wrong`);
}
