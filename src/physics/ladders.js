// Scaling ladders as things in the battle (a story wall's `works.ladders`: story/ground/walls.js): each stands in its gap in
// the wall's face, and the gap is climbable only while it stands. A defender at its head, with no attacker up there to hold
// it, shoves it off the wall; it goes over backwards and lies, the men on it falling with it from where they were (their
// bodies fall as any body falls and hit the ground as hard as the height made them: physics.js's floor impact), and the
// gap is stone again until men at its foot raise it once more.
//
// Whether he can shove it off is its statics. A ladder leans against the wall from its foot; to tip it away, the push at
// its head (lever arm: its height) must turn it about its foot against the weight on it (each load's lever arm: how far
// in from the foot toward the wall it is, which grows with its height up the ladder):
//     push × height ≥ g × (ladder's mass × run / 2 + Σ climber's mass × run × his height / height)
// At the ~14° of a ladder set by the four-to-one rule the run is a quarter of the height, so the weight on it counts for
// little: one man shoves off a ladder with a man or two on it, two shove off one with three. What stops him is an attacker
// at its head (on its top rungs or come up onto the walk), whose hands on the parapet and the ladder hold it: then there is
// nobody's push to spare, and the ladder stands. A ladder raised again takes its men's time: two men at its foot lift it
// and walk it up to the wall.
//
// The ladders begin the battle lying at the wall's foot, as they were carried up: the attackers nearest each are sent to its
// foot (`ladderPost`, ai.js) and raise it. Then it is climbed: a man at its foot, with the enemy on the walk above, gets on
// it and goes up its rungs at a climbing pace (`climb`), his stance carried by it (the ladder, not the ground's relief,
// holds his feet: a wall's face is no slope to walk up, physics/fieldworks.js FIELDWORKS.face), one man to every `spacing` m
// of it, each waiting on the man above. His hands are on the rungs: he strikes nothing (physics.js throwPunch) until he is
// at its head, his arms over the walk's edge. At its head he steps onto the walk if no enemy stands where he would; else he
// fights from there. Struck down, knocked off its line, or thrown with it, he falls from where he was on it, as any body
// falls.

import { P } from '../body.js';
import { fall, point } from '../physics.js';
import { WORLD } from './config.js';
import { reliefAt, worksOf, worksStateOf } from './fieldworks.js';

export const LADDERS = {
  // rad from the upright: the four-to-one rule (its foot out a quarter of its height, ~14°), as ladders have been set to stand.
  lean: Math.atan(0.25),
  // kg: a scaling ladder for a 4-6 m wall, two bamboo or pine poles and lashed rungs (an estimate: a wooden extension
  // ladder of that length weighs ~20-30 kg).
  kg: 25,
  // N: what a man pushes with both hands at shoulder height, short of all he has (men's maximal initial push forces in the
  // ergonomic tables, Snook & Ciriello 1991, run ~300-450 N), over a parapet.
  push: 350,
  // How many push at once: a ladder's head is a man's width; two at it, one each side.
  pushers: 2,
  // m: a defender this near its head (on the walk, his arms over the parapet) can get his hands on it.
  reach: 1.1,
  // m: an attacker on his feet this near its head (and no more than `heldBelow` m under the walk) is at it: on its top rungs,
  // his hands on the parapet, or come up onto the walk. While one is, it is held.
  held: 1.5,
  heldBelow: 1.4,
  // s: the shove itself, from the hands on it to past the upright (a ladder leaning 14° goes over once its head is out some
  // 1.2 m: a few strides of a push).
  pushSeconds: 1.5,
  // s it takes to go over and lie (a rigid pole falling from near the upright: some 1-2 s), for the drawing.
  fallSeconds: 1.4,
  // A man on it whose weight counts against the push: his footing `climber` m or more above its foot.
  climber: 0.4,
  // m/s out from the wall a man thrown with it is carried (its top's swing as it goes over), and m out he starts his fall
  // (clear of the face: the ladder was under him).
  thrownSpeed: 1.5,
  thrownOut: 0.5,
  // m: a man sent to raise it fights instead with an enemy this near him (a spear's length and a step).
  defendWithin: 2.6,
  // To raise it again: `raisers` attackers on their feet within `raiseWithin` m of its foot, for `raiseSeconds` s (two men
  // lift a ladder off the ground and walk it up to the wall in the time of a few steps each, under the wall's shot).
  raisers: 2,
  raiseWithin: 2.2,
  raiseSeconds: 8,
  // A ladder's width (m): its gap's piece of the face when it is down (story/ground/walls.js STORY_WALL.ladder).
  width: 1.1,
  // The sent: the `raisers` attackers nearest a lying ladder's foot, within `call` m of it, are sent to raise it (the men
  // of its column told off to carry and raise it); their places `postOut` m out from its foot, `postSide` m either side.
  call: 10,
  postOut: 1,
  postSide: 0.6,
  climb: {
    // m/s up the ladder: a man laden with his armour and his weapon, his hands on the rungs (firefighters in full kit climb
    // an aerial ladder at ~0.3-0.5 m/s; unladen and quick, ~0.6-0.8).
    pace: 0.4,
    // m of ladder to each man on it: one to a man's height and his reach (a man's feet clear of the hands of the man below;
    // a 4.6 m ladder takes three or four).
    spacing: 1.2,
    // m under the walk from which his head and arms are over its edge: he can strike from the ladder's head.
    top: 1.2,
    // m in from the face's top he steps to on the walk; an enemy standing within `clear` m of there keeps him on the ladder.
    onto: 0.5,
    clear: 0.7,
    // m from its foot (or from under it, between its foot and the wall) an attacker gets on it, with an enemy on the walk
    // within `enemyWithin` m of its head.
    mount: 0.8,
    enemyWithin: 14,
    // m/s his stance is carried to the ladder's line as he gets on it (a step or two).
    board: 1.5,
    // m: his hips knocked this far off his place on the ladder (by a blow, a shove, the press), his hold is gone: he falls.
    slip: 0.5,
  },
};

/** The ladders of an arena's works as things in this world (null for works without ladders). Attackers: the side out at their feet. */
export function createLadders(world, arena) {
  const works = worksOf(arena);
  const ladders = works?.spec.ladders;
  if (!ladders?.length) return null;
  const spec = LADDERS;
  return ladders.map((ladder, index) => {
    // The wall the ladder stands against, its line and height (the face's stretch nearest its gap).
    const wall = works.walls.reduce((best, each) => {
      const off = Math.min(Math.hypot(each.a[0] - ladder.x, each.a[1] - ladder.z), Math.hypot(each.b[0] - ladder.x, each.b[1] - ladder.z));
      return !best || off < best.off ? { off, each } : best;
    }, null)?.each;
    const u = wall?.u ?? [0, 1];
    // Outward: from the wall to the ladder's foot, the side away from the rampart (the lower ground a metre off its line).
    const normal = [-u[1], u[0]];
    const out = reliefAt(works, ladder.x + normal[0], ladder.z + normal[1]) > reliefAt(works, ladder.x - normal[0], ladder.z - normal[1]) ? [-normal[0], -normal[1]] : normal;
    const reds = world.fighters.filter((fighter) => fighter.corner === 'red' && (fighter.root[0] - ladder.x) * out[0] + (fighter.root[1] - ladder.z) * out[1] > 0).length;
    const blues = world.fighters.filter((fighter) => fighter.corner === 'blue' && (fighter.root[0] - ladder.x) * out[0] + (fighter.root[1] - ladder.z) * out[1] > 0).length;
    const half = spec.width / 2;
    // Its foot out from the wall's foot by the lean (the four-to-one rule's quarter of its height).
    const footOut = ladder.height * Math.tan(spec.lean);
    const made = {
      index, x: ladder.x, z: ladder.z, base: ladder.base ?? 0, height: ladder.height, run: ladder.run ?? 0.3, u, out,
      attackers: reds >= blues ? 'red' : 'blue',
      // The head: at the walk's edge, its top.
      head: [ladder.x - out[0] * (ladder.run ?? 0.3), (ladder.base ?? 0) + ladder.height, ladder.z - out[1] * (ladder.run ?? 0.3)],
      foot: [ladder.x + out[0] * footOut, ladder.z + out[1] * footOut], footOut,
      // Its gap's piece of the face, closed while it is down (fieldworks.js wallsOf).
      piece: { a: [ladder.x - u[0] * half, ladder.z - u[1] * half], b: [ladder.x + u[0] * half, ladder.z + u[1] * half], u, length: spec.width, height: wall?.height ?? (ladder.base ?? 0) + ladder.height + 1.1, kind: wall?.kind ?? 'stone', cover: null },
      // Lying at the wall's foot, as it was carried up: its gap closed until it is raised.
      up: false, push: 0, raise: 0, tilt: 1, pushedOff: 0, pushedLoaded: 0, raised: 0, thrown: 0, climbed: 0, fell: 0,
    };
    const state = worksStateOf(world);
    state.closed = [...state.closed, made.piece];
    state.version += 1;
    return made;
  });
}

/** A ladder set up against the wall: standing, its gap open. */
export function standLadder(world, ladder) {
  ladder.up = true;
  ladder.raise = 0;
  ladder.push = 0;
  ladder.raised += 1;
  const state = worksStateOf(world);
  state.closed = state.closed.filter((piece) => piece !== ladder.piece);
  state.version += 1;
}

/** The place on the floor ([x, z]) of a man `up` m up the ladder (past its height: stepping in onto the walk). */
export function ladderPlace(ladder, up) {
  const share = Math.min(1, Math.max(0, up / ladder.height));
  const over = Math.max(0, up - ladder.height);
  return [ladder.foot[0] + (ladder.head[0] - ladder.foot[0]) * share - ladder.out[0] * over, ladder.foot[1] + (ladder.head[2] - ladder.foot[1]) * share - ladder.out[1] * over];
}

/** The men on a ladder now (on their feet), the highest first. */
const ladderClimbers = (world, ladder) => world.fighters.filter((fighter) => fighter.climbing?.ladder === ladder.index && fighter.state === 'up').sort((a, b) => b.climbing.up - a.climbing.up);

/** Put a man on a ladder `up` m up it (he gets on at its foot; the tests' way to set one higher). */
export function boardLadder(world, fighter, ladder, up = 0) {
  fighter.climbing = { ladder: ladder.index, up, top: up >= ladder.height - LADDERS.climb.top };
  fighter.ladderPost = null;
  fighter.goTo = null;
  fighter.punch = null;
}

/**
 * A man on a ladder, each step (physics.js moveRoot, in place of his own steps): up it at its pace (down, broken), no nearer
 * the man above than its spacing, onto the walk at its head when nobody stands there; his stance on its line, at his rung's
 * height, facing the wall. Returns false when it is gone from under him (his own steps again).
 */
export function climbLadder(world, fighter, dt) {
  const climbing = fighter.climbing;
  const ladder = world.siegeLadders?.[climbing.ladder];
  if (!ladder?.up) {
    fighter.climbing = null;
    return false;
  }
  const spec = LADDERS.climb;
  const along = 1 / Math.cos(LADDERS.lean);
  const down = fighter.panicked || fighter.fled;
  let up = climbing.up + (down ? -1 : 1) * spec.pace * dt;
  for (const other of ladderClimbers(world, ladder)) {
    if (other !== fighter && other.climbing.up > climbing.up) up = Math.min(up, other.climbing.up - spec.spacing / along);
  }
  // At its head: in onto the walk only if no enemy stands where he would step.
  if (up > ladder.height) {
    const landing = ladderPlace(ladder, ladder.height + spec.onto);
    const barred = world.fighters.some((other) => other.corner !== fighter.corner && other.corner !== 'grey' && other.state === 'up' && Math.hypot(other.root[0] - landing[0], other.root[1] - landing[1]) < spec.clear);
    if (barred) up = Math.max(climbing.up, Math.min(up, ladder.height));
  }
  climbing.up = Math.max(climbing.up - spec.pace * dt, up);
  climbing.top = climbing.up >= ladder.height - spec.top;
  const place = ladderPlace(ladder, climbing.up);
  // His stance carried to his place on its line (as he gets on it: a step or two), and held there.
  const dx = place[0] - fighter.root[0];
  const dz = place[1] - fighter.root[1];
  const apart = Math.hypot(dx, dz);
  const most = spec.board * dt + spec.pace * dt * along;
  const moved = apart > most ? most / apart : 1;
  fighter.rootVelocity = [(dx * moved) / Math.max(dt, 1e-9), (dz * moved) / Math.max(dt, 1e-9)];
  fighter.root = [fighter.root[0] + dx * moved, fighter.root[1] + dz * moved];
  fighter.lift = ladder.base + Math.min(climbing.up, ladder.height);
  for (const foot of [fighter.feet.l, fighter.feet.r]) {
    foot.floor = fighter.lift;
    if (foot.step) foot.step.floorFrom = foot.step.floorTo = fighter.lift;
  }
  // Facing the wall.
  const wallYaw = Math.atan2(ladder.out[1], -ladder.out[0]);
  const turn = Math.atan2(Math.sin(wallYaw - fighter.yaw), Math.cos(wallYaw - fighter.yaw));
  fighter.yaw += turn * Math.min(1, dt * WORLD.footing.turnRate);
  // Knocked off his place on it: his hold is gone.
  const hips = point(fighter.x, P.pelvis);
  if (Math.hypot(hips[0] - fighter.root[0], hips[2] - fighter.root[1]) > spec.slip) {
    fighter.climbing = null;
    ladder.fell += 1;
    fall(world, fighter, 'knocked off the ladder');
    return true;
  }
  // Off it: at its foot again, or in on the walk.
  if (climbing.up <= 0 && down) fighter.climbing = null;
  if (climbing.up >= ladder.height + spec.onto) {
    fighter.climbing = null;
    ladder.climbed += 1;
    world.events.push({ time: world.time, kind: 'ladder', ladder: ladder.index, up: true, onto: true, fighters: [fighter.id], effects: ['up the ladder onto the wall'] });
  }
  return true;
}

/** A man's whole mass (kg), his armour and kit with him: his parts'. */
const ladderMassOf = (fighter) => fighter.invMass.reduce((sum, inverse) => sum + (inverse > 0 ? 1 / inverse : 0), 0);

/** His footing's height (m) over the ladder's foot: his rung on it, or the ground's relief where he stands. */
function ladderFootingUp(works, ladder, fighter) {
  if (fighter.climbing?.ladder === ladder.index) return fighter.climbing.up;
  return reliefAt(works, fighter.root[0], fighter.root[1]) - ladder.base;
}

const ladderStanding = (fighter) => fighter.state === 'up' && !fighter.panicked && !fighter.fled && !fighter.crawling && !fighter.mount;

/** The torque (N·m) about its foot its own weight and its climbers' hold it to the wall with, and its climbers. */
export function ladderLoad(world, ladder) {
  const spec = LADDERS;
  const g = 9.81;
  const run = ladder.height * Math.tan(spec.lean);
  const climbers = [];
  let torque = g * spec.kg * run / 2;
  for (const fighter of ladderClimbers(world, ladder)) {
    const up = fighter.climbing.up;
    if (up < spec.climber || up > ladder.height) continue;
    climbers.push({ fighter, up });
    torque += g * ladderMassOf(fighter) * run * Math.min(1, up / ladder.height);
  }
  return { torque, climbers };
}

/** Each step: every ladder pushed at, gone over, lying, or raised again. */
export function stepLadders(world, dt) {
  const ladders = world.siegeLadders;
  if (!ladders?.length) return;
  const works = worksOf(world.arena);
  const spec = LADDERS;
  // A man come off his ladder (struck down, thrown) is off it.
  for (const fighter of world.fighters) if (fighter.climbing && fighter.state !== 'up') fighter.climbing = null;
  ladderPosts(world, ladders);
  for (const ladder of ladders) {
    if (ladder.up) ladderBoard(world, ladder, works);
    if (ladder.up) {
      ladder.tilt = Math.max(0, ladder.tilt - dt / spec.fallSeconds);
      const head = ladder.head;
      const near = (fighter, within) => Math.hypot(fighter.root[0] - head[0], fighter.root[1] - head[2]) < within;
      // Held: an attacker at its head.
      const held = world.fighters.some((fighter) => fighter.corner === ladder.attackers && ladderStanding(fighter) && near(fighter, spec.held) && ladderFootingUp(works, ladder, fighter) > ladder.height - spec.heldBelow);
      const pushers = held ? [] : world.fighters.filter((fighter) => fighter.corner !== ladder.attackers && fighter.corner !== 'grey' && ladderStanding(fighter) && !fighter.punch && near(fighter, spec.reach) && ladderFootingUp(works, ladder, fighter) > ladder.height - 0.3).slice(0, spec.pushers);
      if (!pushers.length) {
        ladder.push = 0;
        continue;
      }
      const load = ladderLoad(world, ladder);
      if (pushers.length * spec.push * ladder.height < load.torque) {
        ladder.push = 0;
        continue;
      }
      ladder.push += dt;
      if (ladder.push < spec.pushSeconds) continue;
      ladderPushOff(world, ladder, pushers, load.climbers);
      continue;
    }
    // Lying: raised by enough of its men at its foot, none of them on the wall's side of it (drawn coming up as they raise it).
    const raisers = world.fighters.filter((fighter) => fighter.corner === ladder.attackers && ladderStanding(fighter) && Math.hypot(fighter.root[0] - ladder.x, fighter.root[1] - ladder.z) < spec.raiseWithin && (fighter.root[0] - ladder.x) * ladder.out[0] + (fighter.root[1] - ladder.z) * ladder.out[1] > 0);
    ladder.raise = raisers.length >= spec.raisers ? ladder.raise + dt : 0;
    ladder.tilt = ladder.raise > 0 ? 1 - ladder.raise / spec.raiseSeconds : Math.min(1, ladder.tilt + dt / spec.fallSeconds);
    if (ladder.raise < spec.raiseSeconds) continue;
    standLadder(world, ladder);
    world.events.push({ time: world.time, kind: 'ladder', ladder: ladder.index, up: true, fighters: raisers.map((fighter) => fighter.id), effects: [ladder.raised > 1 ? 'the ladder raised again' : 'the ladder raised'] });
  }
}

/** The men sent to raise each lying ladder: its `raisers` nearest attackers on their feet within `call` m of its foot. */
function ladderPosts(world, ladders) {
  const spec = LADDERS;
  for (const fighter of world.fighters) if (fighter.ladderPost && ladders[fighter.ladderPost.ladder].up) fighter.ladderPost = null;
  for (const ladder of ladders) {
    if (ladder.up) continue;
    const near = world.fighters
      .filter((fighter) => fighter.corner === ladder.attackers && ladderStanding(fighter) && !fighter.climbing && !fighter.player && fighter.gunCrew === undefined && (!fighter.ladderPost || fighter.ladderPost.ladder === ladder.index) && (fighter.root[0] - ladder.x) * ladder.out[0] + (fighter.root[1] - ladder.z) * ladder.out[1] > 0)
      .map((fighter) => ({ fighter, apart: Math.hypot(fighter.root[0] - ladder.foot[0], fighter.root[1] - ladder.foot[1]) }))
      .filter(({ apart }) => apart < spec.call)
      .sort((a, b) => a.apart - b.apart);
    const sent = near.slice(0, spec.raisers).map(({ fighter }) => fighter);
    for (const { fighter } of near) if (!sent.includes(fighter) && fighter.ladderPost?.ladder === ladder.index) fighter.ladderPost = null;
    sent.forEach((fighter, k) => {
      const side = (k % 2 ? 1 : -1) * spec.postSide;
      fighter.ladderPost = { ladder: ladder.index, at: [ladder.x + ladder.out[0] * spec.postOut + ladder.u[0] * side, ladder.z + ladder.out[1] * spec.postOut + ladder.u[1] * side] };
    });
  }
}

/**
 * A man sent to raise a ladder (ai.js, before his fighting): he goes to his place at its foot and puts his hands to it.
 * Returns whether he did (his think is done), or false (an enemy within a spear's reach of him: he fights).
 */
export function raiseLadder(world, fighter) {
  const post = fighter.ladderPost;
  const ladder = world.siegeLadders?.[post?.ladder];
  if (!ladder || ladder.up) return false;
  if (world.fighters.some((other) => other.corner !== fighter.corner && other.corner !== 'grey' && other.state === 'up' && Math.hypot(other.root[0] - fighter.root[0], other.root[1] - fighter.root[1]) < LADDERS.defendWithin)) return false;
  const apart = Math.hypot(post.at[0] - fighter.root[0], post.at[1] - fighter.root[1]);
  fighter.punch = null;
  fighter.goTo = apart > 0.3 ? [post.at[0], 0, post.at[1]] : null;
  fighter.move = apart > 0.3 ? 1 : 0;
  fighter.running = apart > 4;
  fighter.faceAt = { at: [ladder.x, 1, ladder.z], until: world.time + 0.5 };
  return true;
}

/** A man at a standing ladder's foot gets on it: the enemy holds the walk above, and the man before him is a spacing up it. */
function ladderBoard(world, ladder, works) {
  const spec = LADDERS.climb;
  const climbers = ladderClimbers(world, ladder);
  const lowest = climbers.length ? climbers[climbers.length - 1].climbing.up : Infinity;
  if (lowest < spec.spacing * Math.cos(LADDERS.lean)) return;
  const held = world.fighters.some((other) => other.corner !== ladder.attackers && other.corner !== 'grey' && other.state === 'up' && !other.fled && Math.hypot(other.root[0] - ladder.head[0], other.root[1] - ladder.head[2]) < spec.enemyWithin && reliefAt(works, other.root[0], other.root[1]) > ladder.base + ladder.height / 2);
  if (!held) return;
  let best = null;
  for (const fighter of world.fighters) {
    if (fighter.corner !== ladder.attackers || !ladderStanding(fighter) || fighter.climbing || fighter.gunCrew !== undefined) continue;
    // (Anywhere at its foot or under it, between its foot and the wall, on the ground there.)
    const out = (fighter.root[0] - ladder.x) * ladder.out[0] + (fighter.root[1] - ladder.z) * ladder.out[1];
    if (out < -0.05 || ladderFootingUp(works, ladder, fighter) > LADDERS.climber) continue;
    const outward = Math.min(ladder.footOut, Math.max(0, out));
    const apart = Math.hypot(fighter.root[0] - ladder.x - ladder.out[0] * outward, fighter.root[1] - ladder.z - ladder.out[1] * outward);
    if (apart < spec.mount && (!best || apart < best.apart)) best = { fighter, apart };
  }
  if (best) boardLadder(world, best.fighter, ladder, 0);
}

/** Over it goes: the gap closed, the men on it thrown out from the face and falling from where they stood on it. */
function ladderPushOff(world, ladder, pushers, climbers) {
  const spec = LADDERS;
  ladder.up = false;
  ladder.push = 0;
  ladder.pushedOff += 1;
  ladder.pushedLoaded += climbers.length ? 1 : 0;
  ladder.thrown += climbers.length;
  const state = worksStateOf(world);
  state.closed = [...state.closed, ladder.piece];
  state.version += 1;
  for (const { fighter } of climbers) {
    fighter.climbing = null;
    // Out from the face (the ladder under him swinging away), his whole body as it is, moving outward.
    const hips = point(fighter.x, P.pelvis);
    const outward = (hips[0] - ladder.x) * ladder.out[0] + (hips[2] - ladder.z) * ladder.out[1];
    const shift = Math.max(0, spec.thrownOut - outward);
    const step = world.lastDt ?? 1 / 60;
    for (let index = 0; index < fighter.x.length / 3; index += 1) {
      fighter.x[index * 3] += ladder.out[0] * shift;
      fighter.x[index * 3 + 2] += ladder.out[1] * shift;
      fighter.prev[index * 3] = fighter.x[index * 3] - ladder.out[0] * spec.thrownSpeed * step;
      fighter.prev[index * 3 + 2] = fighter.x[index * 3 + 2] - ladder.out[1] * spec.thrownSpeed * step;
    }
    fighter.root = [fighter.root[0] + ladder.out[0] * shift, fighter.root[1] + ladder.out[1] * shift];
    fall(world, fighter, 'thrown down with the ladder');
  }
  world.events.push({ time: world.time, kind: 'ladder', ladder: ladder.index, up: false, attacker: pushers[0].id, fighters: climbers.map(({ fighter }) => fighter.id), effects: [climbers.length ? `the ladder pushed off, ${climbers.length} on it` : 'the ladder pushed off'] });
}
