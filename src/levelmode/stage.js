// Level mode, stages: a walkable world of sections, as data, and what runs it.
//
// A stage is plain data (it can be written as JSON, except that `Infinity` and
// other numbers a file cannot hold are left out). All lengths are metres, heights
// are y (up), and a facing or a yaw is the fighter's own angle in radians (yaw 0 faces
// +x; a positive yaw turns toward -z). A point is [x, z] on the floor, or [x, y, z]
// where a height matters (y there is the height of the floor).
//
//   stage = {
//     id: 'testyard',                     // its key
//     title: 'The Test Yard',
//     sea: -8,                            // y below which a body is lost to the sea (default: none)
//     start: { section: 'yard', at: [x, y, z], facing: yaw },   // where the player begins
//     sections: [ section, ... ],
//   }
//
//   section = {
//     id: 'yard', name: 'The Yard',
//     // Where this section is: a region (below), one entry or a list (their union).
//     bounds: [ region entries ],
//     // Its static solids (physics/terrain.js: slab, ramp, stairs, wall, ceiling), in world coordinates.
//     terrain: [ solids ],
//     // Standing in `area` (a region) also makes section `to` active: the hand-over corridors.
//     portals: [ { to: 'hall', area: region } ],
//     // Who stands in it. Each becomes a fighter, in this order, after the player (id 0).
//     spawns: [ {
//       id: 'guard1',                     // unique in the stage
//       preset: 'knight',                 // a key of PRESETS (body.js) or LEVEL_PRESETS (levelmode/presets.js); default 'contender'
//       inputs: { name: 'Hob' },          // fighter inputs laid over the preset (any field)
//       role: 'enemy',                    // enemy | boss (corner 'blue'); civilian | prisoner (corner 'grey', neutral); ally (corner 'red', with the player)
//       tier: 1,                          // strength of the garrison, for the AI to read (not used here)
//       post: [x, y, z], facing: yaw,     // where he stands, on the floor at height y
//       patrol: [[x, z], ...],            // optional: the path he walks when unaware (not used here)
//     } ],
//     // Things to find (not used here): { id, kind: 'bandage', at: [x, y, z] }.
//     items: [ ],
//     // A lever pulled by the player (the context button, later): sets the gate or ladder `target` to `state`.
//     levers: [ { id: 'pull1', at: [x, y, z], target: 'gate1', state: 'open' } ],
//     // Mechanisms: solids that come and go with a state. `states[state]` are the solids in force
//     // while it is in that state; `state` is the one it starts in. Gates and ladders are the same
//     // thing under two names (an open gate stops blocking; a kicked ladder becomes a ramp).
//     gates:   [ { id: 'gate1', at: [x, y, z], state: 'closed', states: { closed: [solids], open: [solids] } } ],
//     ladders: [ { id: 'ladder1', at: [x, y, z], state: 'up', states: { up: [solids], down: [solids] } } ],
//     // `activeOnly: true`: the drawing shows this section in detail only while it is active, not when it is merely seen through a portal.
//     // A place to rest (not used here).
//     rest: { at: [x, y, z] },
//   }
//
//   region entry = { at: [x, z], size: [length, width], yaw: 0, y: [low, high] }   // a rectangle
//                | { polygon: [[x, z], ...], y: [low, high] }                      // a polygon
//   (`y` optional: only heights between; a vault under a courtyard shares its footprint.)
//
// What runs it:
//  - createStageWorld(stage, playerInputs): the world. The player is fighter 0 (corner 'red',
//    walking); then every spawn, in section order, ids stable for the whole stage.
//  - world.stage = { def, active: [section ids], mechanisms: { id: state }, ... }.
//  - updateStage(world): call every step (stageThink does, as a think function). The active
//    set is the section the player is in plus those whose portal area he is in; the terrain
//    (world.arena.terrain) is the union of the active sections' solids, rebuilt only when the
//    set or a mechanism changes. Fighters of inactive sections are dormant (fighter.dormant):
//    kept as they are, not stepped, thought for, collided or drawn; they wake when theirs activates.
//    A man who has walked into another section belongs to it from then on (fighter.spawn.section).
//  - setMechanism(world, id, state), pullLever(world, id): gates and ladders.
//
// Neutral men: civilians and prisoners are in corner 'grey'. Nobody targets them
// (physics.js hostile) and the fight AI does not think for them (ai.js thinkAll skips 'grey');
// levelmode drives them itself.

import { P, PRESETS } from '../body.js';
import { createWorld, placeOnFloor } from '../physics.js';
import { createTerrain, floorAt } from '../physics/terrain.js';
import { createAwareness, rehomeFollowers, updateAwareness } from './awareness.js';
import { LEVEL_PRESETS, levelPreset } from './presets.js';

/** Whether a preset key is known: the game's own (body.js PRESETS) or the level cast's (presets.js LEVEL_PRESETS). */
const knownPreset = (key) => !!(PRESETS[key] || LEVEL_PRESETS[key]);

/** The fighter inputs a spawn starts from: its preset (the level cast's, normalised, or the game's), `inputs` laid over it. */
function spawnInputs(spawn) {
  const key = spawn.preset ?? 'contender';
  const base = LEVEL_PRESETS[key] ? levelPreset(key) : structuredClone(PRESETS[key]);
  return { ...base, ...structuredClone(spawn.inputs ?? {}) };
}

const ROLE_CORNER = { enemy: 'blue', boss: 'blue', civilian: 'grey', prisoner: 'grey', ally: 'red' };

/** How far out the walls of the arena box stand: it is a limit only (`arena.open`), never an edge to reach. */
const FAR = 5000;

/** Steps between a fighter's section being worked out afresh (4 times a second). */
const REHOME_EVERY = 15;

// ---- Regions ------------------------------------------------------------------

/** Whether (x, z) (at height y, if given) is in one region entry. */
function entryContains(entry, x, z, y) {
  if (entry.y && y !== undefined && (y < entry.y[0] || y > entry.y[1])) return false;
  if (entry.polygon) {
    let inside = false;
    const points = entry.polygon;
    for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
      const [ax, az] = points[index];
      const [bx, bz] = points[previous];
      if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
    }
    return inside;
  }
  const yaw = entry.yaw ?? 0;
  const dx = x - entry.at[0];
  const dz = z - entry.at[1];
  const u = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const v = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  return Math.abs(u) <= entry.size[0] / 2 && Math.abs(v) <= entry.size[1] / 2;
}

/** Whether a point is in a region (an entry, or a list of them: their union). */
export function regionContains(region, x, z, y) {
  if (!region) return false;
  const entries = Array.isArray(region) && !Array.isArray(region[0]) ? region : [region];
  return entries.some((entry) => entryContains(entry, x, z, y));
}

// ---- The data ----------------------------------------------------------------------

/** A section by id. */
export function sectionById(stage, id) {
  return stage.sections.find((section) => section.id === id);
}

/** Every gate and ladder of a stage: [{ id, section, state, states }]. */
export function mechanismsOf(stage) {
  return stage.sections.flatMap((section) => [...(section.gates ?? []), ...(section.ladders ?? [])].map((mechanism) => ({ id: mechanism.id, section: section.id, state: mechanism.state ?? Object.keys(mechanism.states)[0], states: mechanism.states })));
}

/** What is wrong with a stage's data, as a list of sentences (empty if it is sound). */
export function checkStage(stage) {
  const problems = [];
  const sections = new Set();
  for (const section of stage.sections) {
    if (sections.has(section.id)) problems.push(`two sections are called ${section.id}`);
    sections.add(section.id);
  }
  if (!sections.has(stage.start?.section)) problems.push(`the start is in section ${stage.start?.section}, which is not there`);
  const mechanisms = new Set();
  const spawns = new Set();
  for (const section of stage.sections) {
    if (!section.bounds) problems.push(`section ${section.id} has no bounds`);
    for (const portal of section.portals ?? []) if (!sections.has(portal.to)) problems.push(`section ${section.id} has a portal to ${portal.to}, which is not there`);
    for (const mechanism of mechanismsOf({ sections: [section] })) {
      if (mechanisms.has(mechanism.id)) problems.push(`two gates or ladders are called ${mechanism.id}`);
      mechanisms.add(mechanism.id);
      if (!(mechanism.state in mechanism.states)) problems.push(`${mechanism.id} starts in state ${mechanism.state}, which it has no solids for`);
    }
    for (const spawn of section.spawns ?? []) {
      if (spawns.has(spawn.id)) problems.push(`two spawns are called ${spawn.id}`);
      spawns.add(spawn.id);
      if (!(spawn.role in ROLE_CORNER)) problems.push(`spawn ${spawn.id} has the role ${spawn.role}`);
      if (spawn.preset && !knownPreset(spawn.preset)) problems.push(`spawn ${spawn.id} has the preset ${spawn.preset}, which is not there`);
      if (!spawn.post || spawn.post.length !== 3) problems.push(`spawn ${spawn.id} needs a post [x, y, z]`);
    }
  }
  for (const section of stage.sections) {
    for (const lever of section.levers ?? []) if (!mechanisms.has(lever.target)) problems.push(`lever ${lever.id} works ${lever.target}, which is not there`);
  }
  if (stage.ending) {
    if (!mechanisms.has(stage.ending.door)) problems.push(`the ending opens ${stage.ending.door}, which is not there`);
    if (!spawns.has(stage.ending.prince)) problems.push(`the ending is with ${stage.ending.prince}, who is not there`);
  }
  return problems;
}

/**
 * The sections active for a player at `position` ([x, y, z], or [x, z] for any height): the
 * section(s) whose bounds hold it, and any section whose portal area, in one of those, holds it
 * too. Ids, in the stage's order; none if he is in no section (falling, or outside).
 */
export function activeSections(stage, position) {
  const [x, y, z] = position.length === 3 ? position : [position[0], undefined, position[1]];
  const ids = new Set();
  for (const section of stage.sections) {
    if (!regionContains(section.bounds, x, z, y)) continue;
    ids.add(section.id);
    for (const portal of section.portals ?? []) if (regionContains(portal.area, x, z, y)) ids.add(portal.to);
  }
  return stage.sections.filter((section) => ids.has(section.id)).map((section) => section.id);
}

/**
 * The `interior` of the section a man stands in, at [x, y, z], if it has one (a section's own light: the vaulted chapel's amber dark, with the storm shut out): its
 * fields are what levelmode/storm.js blends the weather's look toward (stagelooks.js `interiorLevels`). Null in the open and in a section without one.
 */
export function interiorAt(stage, x, y, z) {
  for (const section of stage.sections) if (section.interior && regionContains(section.bounds, x, z, y)) return section.interior;
  return null;
}

/** The solids in force for some active sections: their terrain, and each of their gates and ladders in its present state. */
export function activeSolids(stage, ids, states) {
  const solids = [];
  for (const section of stage.sections) {
    if (!ids.includes(section.id)) continue;
    solids.push(...(section.terrain ?? []));
    for (const mechanism of [...(section.gates ?? []), ...(section.ladders ?? [])]) solids.push(...(mechanism.states[states[mechanism.id]] ?? []));
  }
  return solids;
}

/** The terrain (physics/terrain.js) of the active sections. */
export function stageTerrain(stage, ids, states) {
  return createTerrain(activeSolids(stage, ids, states), { sea: stage.sea ?? -Infinity });
}

// ---- The world ----------------------------------------------------------------------

/**
 * The world of a stage: the player (fighter 0, corner 'red', walking) and every spawn of every
 * section, each standing on his post; the sections around the player's start active, the rest of
 * the men dormant. `playerInputs`: his fighter inputs (a preset's, normalised or not).
 */
export function createStageWorld(stage, playerInputs, { seed = 1, awareness = true } = {}) {
  const problems = checkStage(stage);
  if (problems.length) throw new Error(`stage ${stage.id}: ${problems.join('; ')}`);
  const entries = [{ inputs: playerInputs, corner: 'red' }];
  const posts = [{ at: stage.start.at, facing: stage.start.facing ?? 0, spawn: null }];
  for (const section of stage.sections) {
    for (const spawn of section.spawns ?? []) {
      entries.push({ inputs: spawnInputs(spawn), corner: ROLE_CORNER[spawn.role] });
      posts.push({ at: spawn.post, facing: spawn.facing ?? 0, spawn: { id: spawn.id, role: spawn.role, tier: spawn.tier ?? 1, patrol: spawn.patrol ?? null, section: section.id, home: section.id } });
    }
  }
  // An open arena: the box is a far limit, the terrain the floor.
  const arena = { halfX: FAR, halfZ: FAR, open: true, terrain: null };
  const world = createWorld(entries, { seed, arena, rules: { noStandards: true } });
  world.fighters.forEach((fighter, index) => {
    const { at, facing, spawn } = posts[index];
    fighter.spawn = spawn ?? undefined;
    fighter.dormant = undefined;
    fighter.arena = arena;
    // (Placed first on the flat so the stance exists; then on its floor.)
    placeOnFloor(fighter, at[0], at[2], at[1], facing);
  });
  world.fighters[0].walking = true;
  world.stage = { def: stage, active: [], mechanisms: Object.fromEntries(mechanismsOf(stage).map((mechanism) => [mechanism.id, mechanism.state])), steps: 0 };
  arena.terrain = stageTerrain(stage, [], world.stage.mechanisms);
  // Who has noticed whom, and what the unaware do (levelmode/awareness.js); `awareness: false` leaves every man to the fight AI.
  if (awareness) createAwareness(world);
  updateStage(world, true);
  return world;
}

/** The player of a stage world: fighter 0. */
export const stagePlayer = (world) => world.fighters[0];

/** Where the player is: the middle of his hips, [x, y, z]. */
function playerAt(world) {
  const me = stagePlayer(world);
  return [me.x[P.pelvis * 3], me.x[P.pelvis * 3 + 1], me.x[P.pelvis * 3 + 2]];
}

/**
 * Work out the active sections for where the player is now; if they have changed, swap the terrain
 * and let the dormant sleep and the woken wake. Cheap when nothing changes: call it every step.
 * Returns true if the active set changed. (`force`: do it even if the set looks the same.)
 */
export function updateStage(world, force = false) {
  const run = world.stage;
  run.steps += 1;
  const ids = activeSections(run.def, playerAt(world));
  let changed = false;
  if (ids.length && (force || ids.join() !== run.active.join())) {
    // The followers go with him: none is left behind asleep.
    rehomeFollowers(world, ids);
    apply(world, ids);
    changed = true;
  }
  if (run.steps % REHOME_EVERY === 0) rehome(world);
  updateAwareness(world);
  return changed;
}

/** A think function for `advance`/the page: the stage keeps up, then the fight AI thinks (`then`). */
export function stageThink(world, dt, then = null) {
  updateStage(world);
  if (then) then(world, dt);
}

/** The section a man now stands in (among the active ones), if any: he belongs to it from here. */
function rehome(world) {
  const run = world.stage;
  for (const fighter of world.fighters) {
    if (!fighter.spawn || fighter.dormant) continue;
    const x = fighter.x[P.pelvis * 3];
    const y = fighter.x[P.pelvis * 3 + 1];
    const z = fighter.x[P.pelvis * 3 + 2];
    if (regionContains(sectionById(run.def, fighter.spawn.section).bounds, x, z, y)) continue;
    const here = run.active.find((id) => regionContains(sectionById(run.def, id).bounds, x, z, y));
    if (here) fighter.spawn.section = here;
  }
}

/** Make `ids` the active sections: the terrain, who sleeps, who wakes, and what lies about. */
function apply(world, ids) {
  const run = world.stage;
  const before = new Set(run.active);
  run.active = ids;
  world.arena.terrain = stageTerrain(run.def, ids, run.mechanisms);
  let awake = 0;
  for (const fighter of world.fighters) {
    if (fighter.spawn && !ids.includes(fighter.spawn.section)) {
      if (!fighter.dormant) fighter.dormant = true;
      continue;
    }
    awake += 1;
    if (fighter.dormant) wake(fighter);
  }
  world.awake = awake;
  // Weapons and heads lying in a section that has gone quiet stay where they lie, and fall on when it wakes.
  const gone = run.def.sections.filter((section) => before.has(section.id) && !ids.includes(section.id));
  const woken = run.def.sections.filter((section) => !before.has(section.id) && ids.includes(section.id));
  for (const list of [world.debris, world.props ?? []]) {
    for (const piece of list) {
      if (!piece.x || piece.taken) continue;
      if (piece.sleeping) {
        if (woken.some((section) => regionContains(section.bounds, piece.x[0], piece.x[2], piece.x[1]))) {
          piece.resting = piece.sleeping.resting;
          piece.sleeping = undefined;
        }
      } else if (gone.some((section) => regionContains(section.bounds, piece.x[0], piece.x[2], piece.x[1])) && !ids.some((id) => regionContains(sectionById(run.def, id).bounds, piece.x[0], piece.x[2], piece.x[1]))) {
        piece.sleeping = { resting: piece.resting };
        piece.resting = true;
      }
    }
  }
}

/** A dormant man wakes as he was left: still, his feet where they are. */
function wake(fighter) {
  fighter.dormant = undefined;
  fighter.prev.set(fighter.x);
  fighter.v.fill(0);
  fighter.rootVelocity = [0, 0];
  fighter.detail = 'full';
  fighter.stillFor = undefined;
}

// ---- Mechanisms -------------------------------------------------------------------------

/** Put a gate or ladder in a state (`'open'`...): the terrain follows at once. Returns false if there is no such state. */
export function setMechanism(world, id, state) {
  const run = world.stage;
  const mechanism = mechanismsOf(run.def).find((entry) => entry.id === id);
  if (!mechanism || !(state in mechanism.states)) return false;
  if (run.mechanisms[id] === state) return true;
  run.mechanisms[id] = state;
  world.arena.terrain = stageTerrain(run.def, run.active, run.mechanisms);
  world.events.push({ time: world.time, kind: 'mechanism', mechanism: id, state, effects: [`${id} ${state}`] });
  return true;
}

/** A lever pulled: its mechanism goes to the state it sets. */
export function pullLever(world, id) {
  for (const section of world.stage.def.sections) {
    const lever = (section.levers ?? []).find((entry) => entry.id === id);
    if (lever) return setMechanism(world, lever.target, lever.state);
  }
  return false;
}

/** The floor under a point of the stage now (the highest within a stride of y; `-Infinity` over the void). */
export function stageFloor(world, x, z, y) {
  return floorAt(world.arena.terrain, x, z, y + 0.3);
}
