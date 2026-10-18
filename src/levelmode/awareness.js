// Level mode, awareness: who has noticed whom, and what the men of a stage do about it.
//
// The fight AI (ai.js) knows every enemy always. In a stage nobody does: a man fights only once he has
// seen the player (or been hit), and until then he stands his post or walks his round, relaxed, guard
// down. Awake men of a stage each have a "mind" (world.stage.aware.minds[fighterId]):
//
//   guard (role enemy | boss, corner 'blue')
//     idle     at his post, facing as the spawn says
//     patrol   walks spawn.patrol (to and fro), a pause at each end
//     aggro    the fight AI has him (ai.js think): targets the player and his followers
//     search   lost sight for AWARE.loseSeconds: goes to where he last saw them, looks about
//     return   walks back to his post (the way he came if the straight line is walled), then idle or patrol
//   civilian (role civilian, corner 'grey')    idle | patrol | flee | cower | return
//   captive (role prisoner, corner 'grey')     idle | flee | cower | return; freePrisoner() makes him an ally
//   ally (role ally, corner 'red')             follow (2-4 m behind the player, along his route) | stayed | aggro
//
// Seeing (the user's algorithm, run from the player outward, about 5 times a second, each man on his own beat):
//   1. Candidates: the men awake within R of the player (a sweep of the sight lines in a circle is
//      a ray to each man in it: the same thing, and cheaper than casting at every angle). R is the
//      section's `vision` (m), else AWARE.radius dimmed by its `light` (0 dark .. 1 bright).
//   2. Mutual visibility, cheapest test first: in range; the player inside the man's forward cone
//      (AWARE.cone, full angle, from his yaw; narrower in a helm with a slit); no wall or ledge between
//      the two heads (physics/terrain.js rayBlocked). Only then he is aggro.
//   3. Seen but facing away: nothing. He stays idle or on his round: the player can walk up behind him.
//   4. A man the player has not seen (off screen, behind a corner) whose cone holds the player with
//      no wall between is the same test: he is aggro too (the "rear threat": the test is mutual).
// Besides sight: a blow that lands on or is blocked by an unaware man makes him aggro; a clash of arms
// within AWARE.noiseRadius sends an idle man to search where it was; an aggro man shouts, and any
// unaware man within AWARE.shoutRadius with a clear sight line to him is aggro too.
//
// The hooks: ai.js thinkAll does not think for a man with `fighter.driven` (this module drives him with
// the same intents a player has: goTo, move, running); `fighter.mayTarget` limits whom a follower fights;
// `world.stage.rout` and `world.stage.escape` make a frightened man run along walkable ground.

import { P } from '../body.js';
import { placeOnFloor, startCrawl } from '../physics.js';
import { floorAt, rayBlocked } from '../physics/terrain.js';
import { regionContains, sectionById } from './stage.js';

export const AWARE = {
  // How far a man sees (m) in full light; at light 0 this share of it. A section's own `vision` overrides.
  radius: 25,
  darkest: 0.35,
  // The cone of sight (full angle, degrees) from his yaw; in a helm with a slit; while searching (he is looking about).
  cone: 120,
  slitCone: 50,
  searchCone: 170,
  // Seconds between a man's looks.
  every: 0.2,
  // An aggro man who has not seen a foe for this long (s) searches; within `meleeSense` m he sees (hears) one regardless.
  loseSeconds: 8,
  meleeSense: 2.5,
  // Searching: seconds spent looking about at the place, how fast he goes (share of a walk), the longest he looks for the place (s).
  lookSeconds: 4,
  searchSpeed: 0.9,
  searchGiveUp: 12,
  // Walking round and home (share of a full walk); the pause at each end of a round (s, from..to); arrival (m).
  patrolSpeed: 0.7,
  patrolPause: [2, 4],
  returnSpeed: 0.8,
  returnGiveUp: 45,
  arrive: 0.7,
  // A shout reaches allies within this (m) that have a clear sight line to the shouter.
  shoutRadius: 15,
  // Noise: a blow struck or blocked within this (m) of an unaware man, for this long (s), draws him to look.
  noiseRadius: 6,
  noiseSeconds: 1.5,
  // Civilians and prisoners: a fight, or an aggro enemy in sight, within these (m) makes them run.
  fleeRadius: 8,
  seeRadius: 10,
  // How far they run at most (m) and for how long (s) before they crouch where they are; the pause before they get up (s with no fight within calmRadius m).
  fleeMax: 14,
  fleeSeconds: 8,
  calmRadius: 15,
  calmSeconds: 12,
  // Followers: stay this far (m) behind the player along his route, a further `spacing` for each one more; run if farther than runFrom;
  // fight those aggro within allyReach (m) of the player or of him; re-home with the player if within rehome m.
  follow: { min: 2.5, max: 4, spacing: 1.3, runFrom: 9 },
  allyReach: 16,
  rehome: 30,
  // The player's route, remembered for the followers: a point each 0.7 m, so many of them.
  trailStep: 0.7,
  trailMax: 160,
};

const TWO_PI = Math.PI * 2;
const GUARDS = new Set(['enemy', 'boss']);

// ---- Small things ----------------------------------------------------------------

const hipX = (fighter) => fighter.x[P.pelvis * 3];
const hipZ = (fighter) => fighter.x[P.pelvis * 3 + 2];
const eyeY = (fighter) => fighter.x[P.head * 3 + 1];
const flatApart = (a, b) => Math.hypot(hipX(a) - hipX(b), hipZ(a) - hipZ(b));
const upright = (fighter) => fighter.state === 'up' && !fighter.dormant;
const yawToward = (dx, dz) => Math.atan2(-dz, dx);

/** Stand where he is, facing `yaw` (the physics turns a man toward his goTo). */
function stand(fighter, yaw) {
  fighter.goTo = [hipX(fighter) + Math.cos(yaw) * 3, 0, hipZ(fighter) - Math.sin(yaw) * 3];
  fighter.move = 0;
  fighter.running = false;
  fighter.strafe = 0;
}

/** Head for (x, z) at `speed` (share of a full walk), running if asked. */
function head(fighter, x, z, speed, running = false) {
  fighter.goTo = [x, 0, z];
  fighter.move = speed;
  fighter.running = running;
  fighter.strafe = 0;
}

/** Whether a man could walk the straight line between two floor points: no wall or ledge at waist height. */
function walkable(terrain, ax, az, ay, bx, bz, by) {
  return !rayBlocked(terrain, [ax, az], [bx, bz], ay + 0.9, by + 0.9);
}

const floorOf = (fighter) => fighter.lift ?? 0;

// ---- The minds ---------------------------------------------------------------------------

/**
 * Give a stage world its awareness: a mind for every man of a spawn, the player's route, the hooks.
 * (createStageWorld does this; the world keeps it in world.stage.aware.)
 */
export function createAwareness(world, config = {}) {
  const run = world.stage;
  const aware = {
    config: { ...AWARE, ...config },
    minds: [],
    time: world.time,
    cursor: world.events.length,
    clashes: [],
    trail: [],
    trailAt: 0,
    log: [],
    targetsAt: -1,
    targets: [],
    looks: 0,
  };
  run.aware = aware;
  run.civiliansHarmed = false;
  run.rout = (current, fighter, opponent) => routed(current, fighter, opponent);
  run.escape = (current, fighter, opponent) => escapeFrom(current, fighter, opponent);
  world.fighters.forEach((fighter, index) => {
    const spawn = fighter.spawn;
    if (!spawn) {
      aware.minds.push(null);
      return;
    }
    const post = world.stage.def.sections.flatMap((section) => section.spawns ?? []).find((each) => each.id === spawn.id);
    const kind = GUARDS.has(spawn.role) ? 'guard' : spawn.role === 'civilian' ? 'civilian' : spawn.role === 'prisoner' ? 'captive' : 'ally';
    const mind = {
      id: index,
      kind,
      state: 'idle',
      since: world.time,
      post: [...post.post],
      facing: post.facing ?? 0,
      patrol: post.patrol?.length ? post.patrol : null,
      refuge: post.refuge ?? null,
      leg: 0,
      step: 1,
      pauseUntil: 0,
      next: (index % 5) * (aware.config.every / 5),
      lastSeen: null,
      seenAt: -Infinity,
      trail: [],
      go: null,
      slept: false,
    };
    aware.minds.push(mind);
    if (kind === 'ally') setState(world, aware, mind, fighter, 'follow');
    else setState(world, aware, mind, fighter, mind.patrol && kind !== 'captive' ? 'patrol' : 'idle');
  });
  return aware;
}

/** What each man is up to, for a look: [{ id, name, kind, state, since, at, aware: the letter }]. */
export function awarenessReport(world) {
  const aware = world.stage?.aware;
  if (!aware) return [];
  return aware.minds.filter(Boolean).map((mind) => {
    const fighter = world.fighters[mind.id];
    return { id: mind.id, spawn: fighter.spawn.id, name: fighter.body.inputs.name, kind: mind.kind, state: mind.state, since: Number(mind.since.toFixed(2)), dormant: Boolean(fighter.dormant), at: [Number(hipX(fighter).toFixed(2)), Number(hipZ(fighter).toFixed(2))] };
  });
}

/** The state of one man, by fighter id. */
export const mindState = (world, id) => world.stage?.aware?.minds[id]?.state;

const LETTER = { idle: 'I', patrol: 'P', aggro: 'A', search: 'S', return: 'R', flee: 'F', cower: 'C', follow: 'f', stayed: 's', down: 'x' };
/** The letter for a state, for an overlay. */
export const stateLetter = (state) => LETTER[state] ?? '?';

/** Put a man in a state, and his body to match: driven (relaxed, the awareness steering) or the fight AI's. */
function setState(world, aware, mind, fighter, state, why = '') {
  if (mind.state === state && mind.set) return;
  const before = mind.state;
  mind.state = state;
  mind.since = world.time;
  mind.go = null;
  mind.set = true;
  if (aware.log.length >= 200) aware.log.shift();
  aware.log.push({ time: Number(world.time.toFixed(2)), id: mind.id, from: before, to: state, why });
  if (state === 'aggro') {
    fighter.driven = false;
    fighter.walking = false;
    fighter.goTo = null;
    fighter.move = 0;
    fighter.running = false;
    fighter.focus = undefined;
    return;
  }
  fighter.driven = true;
  fighter.walking = true;
  fighter.focus = undefined;
  if (state !== 'cower' && fighter.crawling && fighter.state === 'up' && mind.kind !== 'guard') fighter.crawling = false;
}

// ---- Seeing --------------------------------------------------------------------------------

/** How far this man sees (m): his section's `vision`, or the radius dimmed by its light. */
function rangeOf(aware, world, fighter) {
  const section = fighter.spawn ? sectionById(world.stage.def, fighter.spawn.section) : null;
  if (section?.vision !== undefined) return section.vision;
  const light = section?.light ?? 1;
  const config = aware.config;
  return config.radius * (config.darkest + (1 - config.darkest) * Math.max(0, Math.min(1, light)));
}

/**
 * Whether `fighter` sees `target` now: in range, the target inside the cone of his sight (full angle
 * `cone` degrees about his yaw), and no wall or ledge between the two heads. `cone` 360 is all round.
 */
export function sees(world, fighter, target, range, cone) {
  const dx = hipX(target) - hipX(fighter);
  const dz = hipZ(target) - hipZ(fighter);
  const apart = Math.hypot(dx, dz);
  if (apart > range) return false;
  if (apart > 0.05 && cone < 360) {
    const ahead = (Math.cos(fighter.yaw) * dx - Math.sin(fighter.yaw) * dz) / apart;
    if (ahead < Math.cos((cone * Math.PI) / 360)) return false;
  }
  return !rayBlocked(world.arena.terrain, [hipX(fighter), hipZ(fighter)], [hipX(target), hipZ(target)], eyeY(fighter), eyeY(target));
}

/** Whether two men have a clear line between their heads, whichever way they face. */
function lineBetween(world, first, second) {
  return !rayBlocked(world.arena.terrain, [hipX(first), hipZ(first)], [hipX(second), hipZ(second)], eyeY(first), eyeY(second));
}

/** The cone (full angle) a guard sees by now. */
function coneOf(aware, fighter, mind) {
  if (mind.state === 'search') return aware.config.searchCone;
  return fighter.body.gear.headLocked ? aware.config.slitCone : aware.config.cone;
}

/** Whom the unaware may notice: the player, and any follower who is fighting. Cached for the step. */
function targetsOf(world, aware) {
  if (aware.targetsAt === world.time) return aware.targets;
  aware.targetsAt = world.time;
  const player = world.fighters[0];
  aware.targets = world.fighters.filter((fighter) => (fighter === player ? fighter.state !== 'out' : upright(fighter) && aware.minds[fighter.id]?.kind === 'ally' && aware.minds[fighter.id].state === 'aggro'));
  return aware.targets;
}

/** The first of the targets this man sees, or null. */
function spot(world, aware, fighter, mind) {
  const range = rangeOf(aware, world, fighter);
  const cone = coneOf(aware, fighter, mind);
  for (const target of targetsOf(world, aware)) if (target !== fighter && sees(world, fighter, target, range, cone)) return target;
  return null;
}

// ---- Alarm ----------------------------------------------------------------------------------

/** A guard turns aggro: the fight AI has him; he shouts (unless he was himself called, `why` shout). */
function alarm(world, aware, mind, fighter, why, target = null) {
  if (mind.state === 'aggro' || mind.state === 'down') return;
  const at = target ?? world.fighters[0];
  setState(world, aware, mind, fighter, 'aggro', why);
  mind.seenAt = world.time;
  mind.lastSeen = { x: hipX(at), z: hipZ(at), y: floorOf(at) };
  mind.trail = [[hipX(fighter), hipZ(fighter), floorOf(fighter)]];
  if (why !== 'shout') shout(world, aware, mind, fighter);
}

/** The shout: unaware men within reach with a clear line to the shouter turn aggro. */
function shout(world, aware, mind, fighter) {
  const config = aware.config;
  for (const other of aware.minds) {
    if (!other || other === mind || other.kind !== 'guard' || other.state === 'aggro' || other.state === 'down') continue;
    const friend = world.fighters[other.id];
    if (!upright(friend) || flatApart(friend, fighter) > config.shoutRadius || Math.abs(floorOf(friend) - floorOf(fighter)) > 4) continue;
    if (lineBetween(world, friend, fighter)) {
      alarm(world, aware, other, friend, 'shout', null);
      other.lastSeen = mind.lastSeen;
    }
  }
}

// ---- The events: blows, harm, noise -------------------------------------------------------------

function readEvents(world, aware) {
  const events = world.events;
  if (aware.cursor > events.length) aware.cursor = events.length;
  const time = world.time;
  for (; aware.cursor < events.length; aware.cursor += 1) {
    const event = events[aware.cursor];
    // Two bodies that run into each other: each knows, if the other is a foe.
    if (event.kind === 'bump' || event.kind === 'crash') {
      for (const [one, two] of [[event.attacker, event.defender], [event.defender, event.attacker]]) {
        const mind = aware.minds[one];
        const other = world.fighters[two];
        if (mind && other && mind.kind === 'guard' && other.corner === 'red' && !world.stage.ghost) alarm(world, aware, mind, world.fighters[one], 'bump', other);
      }
      continue;
    }
    if (event.kind !== 'landed' && event.kind !== 'blocked' && event.kind !== 'shot' && event.kind !== 'arrow') continue;
    const defender = world.fighters[event.defender];
    if (!defender) continue;
    const attacker = world.fighters[event.attacker];
    const mind = aware.minds[defender.id];
    // A civilian or prisoner the player's side wounded.
    if (event.kind === 'landed' && defender.corner === 'grey' && attacker?.corner === 'red') world.stage.civiliansHarmed = true;
    if (!mind) {
      aware.clashes.push({ x: hipX(defender), z: hipZ(defender), y: floorOf(defender), time, by: event.attacker });
      continue;
    }
    // Hit, or blocked: the man knows. A guard fights; an ally answers; a civilian runs.
    if (mind.kind === 'guard') alarm(world, aware, mind, defender, 'hit', attacker);
    else if (mind.kind === 'ally') engage(world, aware, mind, defender, 'hit');
    else mind.hurtAt = time;
    aware.clashes.push({ x: hipX(defender), z: hipZ(defender), y: floorOf(defender), time, by: event.attacker });
  }
  const keep = time - aware.config.noiseSeconds - 1;
  if (aware.clashes.length && aware.clashes[0].time < keep) aware.clashes = aware.clashes.filter((clash) => clash.time >= keep);
}

/** The latest clash within `radius` m of a man (same floor), no older than `seconds`, or null. */
function clashNear(aware, world, fighter, radius, seconds) {
  const x = hipX(fighter);
  const z = hipZ(fighter);
  const y = floorOf(fighter);
  for (let index = aware.clashes.length - 1; index >= 0; index -= 1) {
    const clash = aware.clashes[index];
    if (world.time - clash.time > seconds) return null;
    if (Math.abs(clash.y - y) < 3 && Math.hypot(clash.x - x, clash.z - z) < radius) return clash;
  }
  return null;
}

// ---- The player's route ----------------------------------------------------------------------------

function keepTrail(world, aware) {
  const player = world.fighters[0];
  if (world.time < aware.trailAt) return;
  aware.trailAt = world.time + 0.1;
  const x = hipX(player);
  const z = hipZ(player);
  const trail = aware.trail;
  const last = trail[trail.length - 1];
  if (last && Math.hypot(x - last.x, z - last.z) < aware.config.trailStep) return;
  // A jump (a respawn at a rest): the old route leads nowhere.
  if (last && Math.hypot(x - last.x, z - last.z) > 8) trail.length = 0;
  const from = trail[trail.length - 1];
  trail.push({ x, z, y: floorOf(player), s: from ? from.s + Math.hypot(x - from.x, z - from.z) : 0 });
  if (trail.length > aware.config.trailMax) trail.shift();
}

// ---- The step -------------------------------------------------------------------------------------------

/**
 * Call every step (updateStage does): reads the new events, keeps the player's route, and lets each man
 * whose turn it is (about 5 times a second, on his own beat) look and decide. Cheap between looks.
 */
export function updateAwareness(world) {
  const aware = world.stage?.aware;
  if (!aware) return;
  readEvents(world, aware);
  keepTrail(world, aware);
  const time = world.time;
  for (const mind of aware.minds) {
    if (!mind || time < mind.next) continue;
    mind.next = time + aware.config.every;
    look(world, aware, mind, world.fighters[mind.id]);
  }
}

function look(world, aware, mind, fighter) {
  if (fighter.dormant) {
    mind.slept = true;
    return;
  }
  if (mind.slept) {
    mind.slept = false;
    // Left in the middle of a chase, a fright or a hunt: that is over.
    if (mind.state === 'aggro' || mind.state === 'search') setState(world, aware, mind, fighter, 'return', 'woke');
    else if (mind.state === 'flee' || mind.state === 'cower') setState(world, aware, mind, fighter, 'return', 'woke');
  }
  aware.looks += 1;
  if (fighter.state === 'out') {
    if (mind.state !== 'down') {
      mind.state = 'down';
      mind.since = world.time;
      fighter.driven = false;
    }
    return;
  }
  if (fighter.state !== 'up') return;
  if (mind.kind === 'guard') lookGuard(world, aware, mind, fighter);
  else if (mind.kind === 'ally') lookAlly(world, aware, mind, fighter);
  else lookNeutral(world, aware, mind, fighter);
}

// ---- Walking about --------------------------------------------------------------------------------------

/**
 * Go toward (x, z): 'arrived' within `arrive` m, 'stuck' if three seconds have not brought him 0.3 m nearer, else 'going'.
 */
function goStep(world, mind, fighter, x, z, speed, running = false) {
  const aim = mind.go;
  const distance = Math.hypot(x - hipX(fighter), z - hipZ(fighter));
  if (!aim || Math.hypot(aim.x - x, aim.z - z) > 0.5) mind.go = { x, z, best: distance, time: world.time };
  else if (distance < aim.best - 0.3) {
    aim.best = distance;
    aim.time = world.time;
  }
  if (distance < AWARE.arrive) return 'arrived';
  if (world.time - mind.go.time > 3) return 'stuck';
  head(fighter, x, z, speed, running);
  return 'going';
}

/** Back to his post, then to his round or to standing. */
function settle(world, aware, mind, fighter) {
  setState(world, aware, mind, fighter, mind.patrol && mind.kind !== 'captive' ? 'patrol' : 'idle', 'home');
  mind.leg = 0;
  mind.step = 1;
  mind.pauseUntil = 0;
}

function doIdle(world, aware, mind, fighter) {
  // Shoved from his post: back to it.
  if (Math.hypot(mind.post[0] - hipX(fighter), mind.post[2] - hipZ(fighter)) > 2) {
    setState(world, aware, mind, fighter, 'return', 'displaced');
    return;
  }
  stand(fighter, mind.facing);
}

function doPatrol(world, aware, mind, fighter) {
  const path = mind.patrol;
  const [x, z] = path[mind.leg];
  if (world.time < mind.pauseUntil) {
    stand(fighter, mind.heading ?? mind.facing);
    return;
  }
  const result = goStep(world, mind, fighter, x, z, aware.config.patrolSpeed);
  if (result === 'going') return;
  // At the end of a leg (or given it up): stand a while, looking the way he was going; then the next.
  mind.heading = yawToward(x - hipX(fighter), z - hipZ(fighter));
  if (path.length === 1) {
    mind.heading = mind.facing;
  } else {
    if (mind.leg + mind.step < 0 || mind.leg + mind.step >= path.length) mind.step = -mind.step;
    mind.leg += mind.step;
  }
  const [low, high] = aware.config.patrolPause;
  mind.pauseUntil = world.time + low + world.random() * (high - low);
  mind.go = null;
  stand(fighter, mind.heading);
}

/** Walk to a post by the straight line if it is open, else back along the way he came (`mind.trail`). Returns 'arrived' | 'going' | 'stuck'. */
function walkHome(world, mind, fighter, speed) {
  const terrain = world.arena.terrain;
  const [px, py, pz] = mind.post;
  const fx = hipX(fighter);
  const fz = hipZ(fighter);
  const floor = floorOf(fighter);
  // The way back: the latest point he passed that he can walk to; points reached are forgotten.
  while (mind.trail.length && Math.hypot(mind.trail.at(-1)[0] - fx, mind.trail.at(-1)[1] - fz) < 1.2) mind.trail.pop();
  if (mind.trail.length && !walkable(terrain, fx, fz, floor, px, pz, py)) {
    // The farthest back of the last few that is open.
    let pick = mind.trail.length - 1;
    for (let index = Math.max(0, mind.trail.length - 6); index < mind.trail.length; index += 1) {
      const [tx, tz, ty] = mind.trail[index];
      if (walkable(terrain, fx, fz, floor, tx, tz, ty)) {
        pick = index;
        break;
      }
    }
    mind.trail.length = pick + 1;
    const [tx, tz] = mind.trail[pick];
    const result = goStep(world, mind, fighter, tx, tz, speed);
    // Reached it, or could not: on to the next point back.
    if (result !== 'going') mind.trail.pop();
    return 'going';
  }
  return goStep(world, mind, fighter, px, pz, speed);
}

function doReturn(world, aware, mind, fighter) {
  const result = walkHome(world, mind, fighter, aware.config.returnSpeed);
  if (result === 'arrived') settle(world, aware, mind, fighter);
  else if (result === 'stuck' || world.time - mind.since > aware.config.returnGiveUp) {
    // Cannot get home: this is his post now.
    mind.post = [hipX(fighter), floorOf(fighter), hipZ(fighter)];
    mind.trail = [];
    settle(world, aware, mind, fighter);
  }
}

// ---- Guards ------------------------------------------------------------------------------------------------

function lookGuard(world, aware, mind, fighter) {
  const config = aware.config;
  // Ghost walk (a designer's debug, the sandbox): the garrison neither sees nor hears him; a hunt already on is given up.
  if (world.stage.ghost) {
    if (mind.state === 'aggro' || mind.state === 'search') setState(world, aware, mind, fighter, 'return', 'ghost');
    if (mind.state === 'idle') doIdle(world, aware, mind, fighter);
    else if (mind.state === 'patrol') doPatrol(world, aware, mind, fighter);
    else if (mind.state === 'return') doReturn(world, aware, mind, fighter);
    return;
  }
  if (mind.state === 'aggro') {
    lookAggro(world, aware, mind, fighter);
    return;
  }
  const seen = spot(world, aware, fighter, mind);
  if (seen) {
    alarm(world, aware, mind, fighter, 'saw', seen);
    return;
  }
  // A clash of arms near: he goes to see (unless he is already looking for trouble).
  const noise = mind.state === 'search' ? null : clashNear(aware, world, fighter, config.noiseRadius, config.noiseSeconds);
  if (noise && (mind.heardAt ?? -Infinity) < noise.time) {
    mind.heardAt = noise.time;
    mind.lastSeen = { x: noise.x, z: noise.z, y: noise.y };
    mind.trail = [[hipX(fighter), hipZ(fighter), floorOf(fighter)]];
    setState(world, aware, mind, fighter, 'search', 'noise');
    return;
  }
  if (mind.state === 'idle') doIdle(world, aware, mind, fighter);
  else if (mind.state === 'patrol') doPatrol(world, aware, mind, fighter);
  else if (mind.state === 'return') doReturn(world, aware, mind, fighter);
  else if (mind.state === 'search') doSearch(world, aware, mind, fighter);
}

/** The foes an aggro man may know of: the player and the allies, awake and on their feet or down. */
function foesOf(world) {
  return world.fighters.filter((other) => other.corner === 'red' && !other.dormant && other.state !== 'out');
}

function lookAggro(world, aware, mind, fighter) {
  const config = aware.config;
  const terrain = world.arena.terrain;
  // His trail, for the way home.
  const last = mind.trail.at(-1);
  if (!last || Math.hypot(last[0] - hipX(fighter), last[1] - hipZ(fighter)) > 1.4) {
    mind.trail.push([hipX(fighter), hipZ(fighter), floorOf(fighter)]);
    if (mind.trail.length > 90) mind.trail = mind.trail.filter((_, index) => index % 2 === 0 || index === mind.trail.length - 1);
  }
  const range = rangeOf(aware, world, fighter);
  let nearest = null;
  let nearestApart = Infinity;
  for (const foe of foesOf(world)) {
    const apart = flatApart(fighter, foe);
    if (apart > range || apart >= nearestApart) continue;
    // Close enough, he knows where the man is, if there is no wall; else a clear line.
    if (!rayBlocked(terrain, [hipX(fighter), hipZ(fighter)], [hipX(foe), hipZ(foe)], eyeY(fighter), eyeY(foe))) {
      nearest = foe;
      nearestApart = apart;
    } else if (apart < config.meleeSense && Math.abs(floorOf(foe) - floorOf(fighter)) < 1.5) {
      nearest = foe;
      nearestApart = apart;
    }
  }
  if (nearest) {
    mind.seenAt = world.time;
    mind.lastSeen = { x: hipX(nearest), z: hipZ(nearest), y: floorOf(nearest) };
    return;
  }
  // Hurt and broken men are the fight's (fear, crawling); a man is not sent searching on his knees.
  if (fighter.panicked || fighter.crawling || fighter.pain) return;
  if (world.time - mind.seenAt > config.loseSeconds) setState(world, aware, mind, fighter, 'search', 'lost');
}

function doSearch(world, aware, mind, fighter) {
  const config = aware.config;
  const spot = mind.lastSeen ?? { x: hipX(fighter), z: hipZ(fighter) };
  if (!mind.looking) {
    const result = goStep(world, mind, fighter, spot.x, spot.z, config.searchSpeed);
    if (result === 'going' && world.time - mind.since < config.searchGiveUp) return;
    mind.looking = { from: world.time, yaw: fighter.yaw };
  }
  const t = world.time - mind.looking.from;
  if (t > config.lookSeconds) {
    mind.looking = null;
    setState(world, aware, mind, fighter, 'return', 'gave up');
    return;
  }
  // Looks about: a slow sweep either side of the way he was facing.
  stand(fighter, mind.looking.yaw + 1.5 * Math.sin((t / config.lookSeconds) * TWO_PI * 1.25));
}

// ---- Neutral men: civilians and prisoners -----------------------------------------------------------------

/** The flight picked from a point: of the headings round, the free one that goes farthest from `threat`, toward `refuge` or `rear` if given. */
function flight(world, fighter, threat, { refuge = null, rear = null } = {}) {
  const terrain = world.arena.terrain;
  const x = hipX(fighter);
  const z = hipZ(fighter);
  const floor = floorOf(fighter);
  const away = Math.hypot(x - threat[0], z - threat[1]) || 1;
  const awayX = (x - threat[0]) / away;
  const awayZ = (z - threat[1]) / away;
  let best = null;
  let bestScore = -Infinity;
  const toward = (point) => {
    const length = Math.hypot(point[0] - x, point[1] - z) || 1;
    return [(point[0] - x) / length, (point[1] - z) / length];
  };
  const goal = refuge ?? rear;
  const goalWay = goal ? toward(goal) : null;
  for (let index = 0; index < 16; index += 1) {
    const angle = (index / 16) * TWO_PI;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    let run = 0;
    let level = floor;
    let edge = false;
    for (let step = 0.5; step <= 6; step += 0.5) {
      const under = floorAt(terrain, x + dx * step, z + dz * step, level + 0.45);
      if (under === -Infinity || under < level - 0.45) {
        edge = true;
        break;
      }
      level = under;
      run = step;
    }
    // He keeps a stride back from an edge.
    if (edge) run = Math.max(0, run - 1);
    // A wall: shorten the run until the line is clear.
    for (let tries = 0; tries < 4 && run > 0 && rayBlocked(terrain, [x, z], [x + dx * run, z + dz * run], floor + 0.6, level + 0.6); tries += 1) run = Math.floor(run / 2 / 0.5) * 0.5;
    const score = Math.min(run, 5) * 0.6 + (dx * awayX + dz * awayZ) * 4 + (goalWay ? (dx * goalWay[0] + dz * goalWay[1]) * (refuge ? 6 : 3) : 0);
    if (run >= 0.5 && score > bestScore) {
      bestScore = score;
      best = { to: [x + dx * run, z + dz * run], run, score };
    }
  }
  return best;
}

function lookNeutral(world, aware, mind, fighter) {
  if (mind.scripted) return doScripted(world, aware, mind, fighter);
  const config = aware.config;
  // What frightens him: a fight near, an aggro enemy in sight, a blow on himself.
  let threat = null;
  const clash = clashNear(aware, world, fighter, config.fleeRadius, 2);
  if (clash) threat = [clash.x, clash.z];
  if (!threat) {
    for (const other of aware.minds) {
      if (!other || other.kind !== 'guard' || other.state !== 'aggro') continue;
      const guard = world.fighters[other.id];
      if (upright(guard) && flatApart(guard, fighter) < config.seeRadius && Math.abs(floorOf(guard) - floorOf(fighter)) < 3 && lineBetween(world, fighter, guard)) {
        threat = [hipX(guard), hipZ(guard)];
        break;
      }
    }
  }
  if (!threat && mind.hurtAt !== undefined && world.time - mind.hurtAt < 2) {
    const foe = world.fighters.find((other) => other.corner !== 'grey' && other.punch?.target === fighter.id);
    if (foe) threat = [hipX(foe), hipZ(foe)];
  }
  if (threat) mind.threatAt = world.time;
  mind.threat = threat ?? mind.threat;
  if (threat && mind.state !== 'flee' && mind.state !== 'cower') {
    mind.fled = { from: [hipX(fighter), hipZ(fighter)], time: world.time };
    setState(world, aware, mind, fighter, 'flee', 'fight near');
  }
  switch (mind.state) {
    case 'flee': return doFlee(world, aware, mind, fighter, threat);
    case 'cower': return doCower(world, aware, mind, fighter);
    case 'idle': return doIdle(world, aware, mind, fighter);
    case 'patrol': return doPatrol(world, aware, mind, fighter);
    case 'return': return doReturn(world, aware, mind, fighter);
    default: return undefined;
  }
}

/**
 * A civilian cowering for good, as a scene wants him (the prince in the cell): on his knees, he shuffles away from the
 * player toward `corner` ([x, z]) while the player is within `near` m, and otherwise stays down where he is. Nothing calms him.
 * Returns false if there is no such man.
 */
export function cowerFor(world, id, { corner, near = 3.5 }) {
  const aware = world.stage?.aware;
  const fighter = world.fighters.find((each) => each.spawn?.id === id);
  const mind = fighter && aware?.minds[fighter.id];
  if (!mind || fighter.state === 'out') return false;
  mind.scripted = { corner, near };
  setState(world, aware, mind, fighter, 'cower', 'the scene');
  fighter.crawling || startCrawl(world, fighter, 'cowers');
  return true;
}

function doScripted(world, aware, mind, fighter) {
  const { corner, near } = mind.scripted;
  if (!fighter.crawling) startCrawl(world, fighter, 'cowers');
  const player = world.fighters[0];
  const toCorner = Math.hypot(corner[0] - hipX(fighter), corner[1] - hipZ(fighter));
  if (flatApart(player, fighter) < near && toCorner > 0.5) head(fighter, corner[0], corner[1], 1);
  else stand(fighter, yawToward(hipX(fighter) - hipX(player), hipZ(fighter) - hipZ(player)));
}

function doFlee(world, aware, mind, fighter, threat) {
  const config = aware.config;
  const from = threat ?? mind.threat ?? [hipX(fighter) - Math.cos(fighter.yaw), hipZ(fighter) + Math.sin(fighter.yaw)];
  const refuge = mind.refuge ? [mind.refuge[0], mind.refuge.at(-1)] : null;
  // At the refuge, or run far enough, or out of breath: down where he is.
  const gone = Math.hypot(hipX(fighter) - mind.fled.from[0], hipZ(fighter) - mind.fled.from[1]);
  const arrived = refuge && Math.hypot(refuge[0] - hipX(fighter), refuge[1] - hipZ(fighter)) < 1.5;
  const way = arrived ? null : flight(world, fighter, from, { refuge });
  if (arrived || !way || way.run < 1.2 || gone > config.fleeMax || world.time - mind.fled.time > config.fleeSeconds) {
    setState(world, aware, mind, fighter, 'cower', arrived ? 'refuge' : !way || way.run < 1.2 ? 'cornered' : 'far enough');
    fighter.crawling || startCrawl(world, fighter, 'cowers');
    stand(fighter, fighter.yaw);
    return;
  }
  head(fighter, way.to[0], way.to[1], 1, true);
}

function doCower(world, aware, mind, fighter) {
  const config = aware.config;
  if (!fighter.crawling) startCrawl(world, fighter, 'cowers');
  stand(fighter, fighter.yaw);
  const fight = clashNear(aware, world, fighter, config.calmRadius, config.calmSeconds) || aware.minds.some((other) => other && other.kind === 'guard' && other.state === 'aggro' && flatApart(world.fighters[other.id], fighter) < config.calmRadius && !world.fighters[other.id].dormant);
  if (fight) mind.threatAt = world.time;
  if (world.time - (mind.threatAt ?? mind.since) > config.calmSeconds) {
    fighter.crawling = false;
    setState(world, aware, mind, fighter, 'return', 'calm');
  }
}

// ---- Followers -------------------------------------------------------------------------------------------------

/**
 * A prisoner freed: he is an ally from now on (corner 'red'), and follows the player. `id`: his spawn id
 * ('captive') or his fighter id. Returns false if there is no such man or he is not a prisoner.
 */
export function freePrisoner(world, id) {
  const aware = world.stage?.aware;
  if (!aware) return false;
  const fighter = typeof id === 'number' ? world.fighters[id] : world.fighters.find((each) => each.spawn?.id === id);
  const mind = fighter && aware.minds[fighter.id];
  if (!mind || mind.kind !== 'captive') return false;
  fighter.corner = 'red';
  fighter.spawn.role = 'ally';
  if (fighter.crawling) fighter.crawling = false;
  mind.kind = 'ally';
  mind.freed = true;
  mind.set = false;
  fighter.mayTarget = (other) => mayFight(world, aware, mind, fighter, other);
  setState(world, aware, mind, fighter, 'follow', 'freed');
  world.events.push({ time: world.time, kind: 'freed', fighter: fighter.id, effects: ['is freed'] });
  return true;
}

/** Followers, in order. */
const followers = (world, aware) => aware.minds.filter((mind) => mind && mind.kind === 'ally' && !world.fighters[mind.id].dormant && world.fighters[mind.id].state !== 'out');

/** Whom a follower may fight: aggro enemies, and anyone who is striking at him. */
function mayFight(world, aware, mind, fighter, other) {
  const theirs = aware.minds[other.id];
  // The boss is the player's alone: the freed stay out of that fight (the duel with Lord Vaelen is one to one).
  if (other.spawn?.role === 'boss') return false;
  if (theirs) return theirs.state === 'aggro';
  return other.punch?.target === fighter.id;
}

/** Fight, or stop fighting: aggro enemies near the player or near him bring a follower in. */
function engage(world, aware, mind, fighter, why) {
  if (mind.state === 'aggro') return;
  mind.back = mind.state === 'stayed' ? 'stayed' : 'follow';
  setState(world, aware, mind, fighter, 'aggro', why);
  mind.engagedAt = world.time;
}

function lookAlly(world, aware, mind, fighter) {
  const config = aware.config;
  const player = world.fighters[0];
  if (!fighter.mayTarget) fighter.mayTarget = (other) => mayFight(world, aware, mind, fighter, other);
  // Is there a fight to join?
  let fight = false;
  for (const other of aware.minds) {
    if (!other || other.kind !== 'guard' || other.state !== 'aggro') continue;
    const guard = world.fighters[other.id];
    if (!upright(guard) || guard.spawn.role === 'boss') continue;
    if (flatApart(guard, fighter) < config.allyReach || (mind.state !== 'stayed' && flatApart(guard, player) < config.allyReach)) {
      fight = true;
      break;
    }
  }
  if (mind.state === 'aggro') {
    // Not the whole of a fight: he stays in it a moment past the last foe, then goes back to following.
    if (fight || world.time - mind.engagedAt < 1.5 || fighter.panicked || fighter.crawling || fighter.pain) {
      if (fight) mind.engagedAt = world.time;
      return;
    }
    setState(world, aware, mind, fighter, mind.back ?? 'follow', 'quiet');
  } else if (fight) {
    engage(world, aware, mind, fighter, 'fight');
    return;
  }
  // Past the chapel gate (the stage's `followStopsAt`) he stays.
  const stops = world.stage.def.followStopsAt;
  if (mind.state !== 'stayed' && stops && regionContains(stops, hipX(fighter), hipZ(fighter), floorOf(fighter))) {
    setState(world, aware, mind, fighter, 'stayed', 'the gate');
  }
  if (mind.state === 'stayed') {
    stand(fighter, mind.stayYaw ?? (mind.stayYaw = fighter.yaw));
    return;
  }
  follow(world, aware, mind, fighter);
}

/** Keep 2.5 to 4 m behind the player along his route, a little more for each follower after the first. */
function follow(world, aware, mind, fighter) {
  const config = aware.config.follow;
  const player = world.fighters[0];
  const terrain = world.arena.terrain;
  const rank = followers(world, aware).findIndex((each) => each === mind);
  const behind = config.min + Math.max(0, rank) * config.spacing;
  const apart = flatApart(fighter, player);
  const px = hipX(player);
  const pz = hipZ(player);
  const fx = hipX(fighter);
  const fz = hipZ(fighter);
  const floor = floorOf(fighter);
  const open = walkable(terrain, fx, fz, floor, px, pz, floorOf(player));
  // Near enough with the way clear: he stands, looking at the player.
  if (open && apart < behind + (config.max - config.min) && Math.abs(floorOf(player) - floor) < 1.5) {
    if (apart < behind - 0.6) {
      // Too close: a step back from him, so as not to stand in his way.
      const length = apart || 1;
      head(fighter, fx + ((fx - px) / length) * 1.5, fz + ((fz - pz) / length) * 1.5, 0.5);
    } else stand(fighter, yawToward(px - fx, pz - fz));
    return;
  }
  const route = aware.trail;
  if (!route.length) {
    head(fighter, px, pz, 1, apart > config.runFrom);
    return;
  }
  // The route: the point `behind` back from the player's end of it; he walks to the farthest of the next few points he can walk to.
  const goal = route[route.length - 1].s - behind;
  let nearest = 0;
  let best = Infinity;
  for (let index = 0; index < route.length; index += 1) {
    const distance = Math.hypot(route[index].x - fx, route[index].z - fz) + Math.abs(route[index].y - floor) * 2;
    if (distance < best) {
      best = distance;
      nearest = index;
    }
  }
  let target = Math.min(route.length - 1, nearest + 1);
  for (let index = Math.min(route.length - 1, nearest + 8); index > nearest; index -= 1) {
    if (route[index].s <= goal + 1 && walkable(terrain, fx, fz, floor, route[index].x, route[index].z, route[index].y)) {
      target = index;
      break;
    }
  }
  if (open && route[target].s > goal + 1) target = route.length - 1;
  head(fighter, route[target].x, route[target].z, 1, apart > config.runFrom);
}

/**
 * Put the followers beside the player (a respawn at a rest, a gate passed): each a little behind him, on his floor.
 * Returns how many were moved.
 */
export function gatherFollowers(world) {
  const aware = world.stage?.aware;
  if (!aware) return 0;
  const player = world.fighters[0];
  const list = aware.minds.filter((mind) => mind && mind.kind === 'ally' && world.fighters[mind.id].state !== 'out');
  list.forEach((mind, index) => {
    const fighter = world.fighters[mind.id];
    const way = player.yaw + Math.PI + (index % 2 ? 0.5 : -0.5);
    placeOnFloor(fighter, hipX(player) + Math.cos(way) * (2.5 + index), hipZ(player) - Math.sin(way) * (2.5 + index), floorOf(player), player.yaw);
    fighter.dormant = undefined;
    mind.state = 'follow';
    mind.set = false;
    setState(world, aware, mind, fighter, 'follow', 'gathered');
  });
  return list.length;
}

/**
 * Before the sections swap (stage.js apply): followers near the player go with him into whichever section is
 * now active, so that none is left dormant behind.
 */
export function rehomeFollowers(world, ids) {
  const aware = world.stage?.aware;
  if (!aware || !ids.length) return;
  const player = world.fighters[0];
  for (const mind of aware.minds) {
    if (!mind || mind.kind !== 'ally') continue;
    const fighter = world.fighters[mind.id];
    // (One who has stayed at the gate stays in his section: he sleeps with it, and wakes standing, rather than be woken over a floor that is gone.)
    if (fighter.state === 'out' || mind.state === 'stayed' || ids.includes(fighter.spawn.section)) continue;
    if (flatApart(fighter, player) < aware.config.rehome) fighter.spawn.section = ids[0];
  }
}

// ---- Fear: the garrison runs for its rear, not off the field -----------------------------------------------------

/** The point an enemy of a section runs toward when broken: its `rear` if the section has one. */
function rearOf(world, fighter) {
  const section = sectionById(world.stage.def, fighter.spawn?.section);
  return section?.rear ? [section.rear[0], section.rear.at(-1)] : null;
}

/** ai.js rout, in a stage: a broken man runs along walkable ground, away from the nearest foe and toward his section's rear. True while it has him. */
function routed(world, fighter, opponent) {
  if (!fighter.spawn || !opponent) return false;
  const apart = flatApart(fighter, opponent);
  if (apart > 14) {
    fighter.move = 0;
    fighter.running = false;
    fighter.goTo = null;
    return true;
  }
  const way = flight(world, fighter, [hipX(opponent), hipZ(opponent)], { rear: rearOf(world, fighter) });
  // Cornered: he fights from where he is (the fight AI's cover-up).
  if (!way || way.run < 1) return false;
  head(fighter, way.to[0], way.to[1], 1, fighter.stamina > 0.15);
  return true;
}

/** ai.js escapePoint, in a stage: [x, 0, z] a stride away from `opponent` along walkable ground, or null. */
function escapeFrom(world, fighter, opponent) {
  const way = flight(world, fighter, [hipX(opponent), hipZ(opponent)], { rear: rearOf(world, fighter) });
  return way ? [way.to[0], 0, way.to[1]] : null;
}
