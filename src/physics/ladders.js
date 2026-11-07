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

import { P } from '../body.js';
import { fall, point } from '../physics.js';
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
  // A man on it: on his feet, within `lane` m of its line, his footing `climber` m or more above its foot.
  lane: 0.8,
  climber: 0.4,
  // m/s out from the wall a man thrown with it is carried (its top's swing as it goes over), and m out he starts his fall
  // (clear of the face: the ladder was under him).
  thrownSpeed: 1.5,
  thrownOut: 0.5,
  // To raise it again: `raisers` attackers on their feet within `raiseWithin` m of its foot, for `raiseSeconds` s (two men
  // lift a ladder off the ground and walk it up to the wall in the time of a few steps each, under the wall's shot).
  raisers: 2,
  raiseWithin: 2.2,
  raiseSeconds: 8,
  // A ladder's width (m): its gap's piece of the face when it is down (story/ground/walls.js STORY_WALL.ladder).
  width: 1.1,
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
    return {
      index, x: ladder.x, z: ladder.z, base: ladder.base ?? 0, height: ladder.height, run: ladder.run ?? 0.3, u, out,
      attackers: reds >= blues ? 'red' : 'blue',
      // The head: at the walk's edge, its top.
      head: [ladder.x - out[0] * (ladder.run ?? 0.3), (ladder.base ?? 0) + ladder.height, ladder.z - out[1] * (ladder.run ?? 0.3)],
      // Its gap's piece of the face, closed while it is down (fieldworks.js wallsOf).
      piece: { a: [ladder.x - u[0] * half, ladder.z - u[1] * half], b: [ladder.x + u[0] * half, ladder.z + u[1] * half], u, length: spec.width, height: wall?.height ?? (ladder.base ?? 0) + ladder.height + 1.1, kind: wall?.kind ?? 'stone', cover: null },
      up: true, push: 0, raise: 0, tilt: 0, pushedOff: 0, raised: 0, thrown: 0,
    };
  });
}

/** A man's whole mass (kg), his armour and kit with him: his parts'. */
const massOf = (fighter) => fighter.invMass.reduce((sum, inverse) => sum + (inverse > 0 ? 1 / inverse : 0), 0);

/** His footing's height (m) over the ladder's foot. */
function footingUp(works, ladder, fighter) {
  return reliefAt(works, fighter.root[0], fighter.root[1]) - ladder.base;
}

/** Whether a man stands at the ladder: within `lane` m of its line across the wall, and from `back` m out from its foot to its head. */
function onLadderLine(ladder, fighter, back) {
  const dx = fighter.root[0] - ladder.x;
  const dz = fighter.root[1] - ladder.z;
  const along = dx * ladder.u[0] + dz * ladder.u[1];
  const outward = dx * ladder.out[0] + dz * ladder.out[1];
  return Math.abs(along) < LADDERS.lane && outward < back && outward > -ladder.run - 0.15;
}

const standing = (fighter) => fighter.state === 'up' && !fighter.panicked && !fighter.fled && !fighter.crawling && !fighter.mount;

/** The torque (N·m) about its foot its own weight and its climbers' hold it to the wall with, and its climbers. */
export function ladderLoad(world, ladder, works = worksOf(world.arena)) {
  const spec = LADDERS;
  const g = 9.81;
  const run = ladder.height * Math.tan(spec.lean);
  const climbers = [];
  let torque = g * spec.kg * run / 2;
  for (const fighter of world.fighters) {
    if (fighter.corner !== ladder.attackers || fighter.state !== 'up' || fighter.mount) continue;
    if (!onLadderLine(ladder, fighter, 0.6)) continue;
    const up = footingUp(works, ladder, fighter);
    if (up < spec.climber) continue;
    climbers.push({ fighter, up });
    torque += g * massOf(fighter) * run * Math.min(1, up / ladder.height);
  }
  return { torque, climbers };
}

/** Each step: every ladder pushed at, gone over, lying, or raised again. */
export function stepLadders(world, dt) {
  const ladders = world.siegeLadders;
  if (!ladders?.length) return;
  const works = worksOf(world.arena);
  const spec = LADDERS;
  for (const ladder of ladders) {
    if (ladder.up) {
      ladder.tilt = Math.max(0, ladder.tilt - dt / spec.raiseSeconds);
      const head = ladder.head;
      const near = (fighter, within) => Math.hypot(fighter.root[0] - head[0], fighter.root[1] - head[2]) < within;
      // Held: an attacker at its head.
      const held = world.fighters.some((fighter) => fighter.corner === ladder.attackers && standing(fighter) && near(fighter, spec.held) && footingUp(works, ladder, fighter) > ladder.height - spec.heldBelow);
      const pushers = held ? [] : world.fighters.filter((fighter) => fighter.corner !== ladder.attackers && fighter.corner !== 'grey' && standing(fighter) && !fighter.punch && near(fighter, spec.reach) && footingUp(works, ladder, fighter) > ladder.height - 0.3).slice(0, spec.pushers);
      if (!pushers.length) {
        ladder.push = 0;
        continue;
      }
      const load = ladderLoad(world, ladder, works);
      if (pushers.length * spec.push * ladder.height < load.torque) {
        ladder.push = 0;
        continue;
      }
      ladder.push += dt;
      if (ladder.push < spec.pushSeconds) continue;
      pushOff(world, ladder, pushers, load.climbers);
      continue;
    }
    ladder.tilt = Math.min(1, ladder.tilt + dt / spec.fallSeconds);
    // Lying: raised by enough of its men at its foot, none of them on the wall's side of it.
    const raisers = world.fighters.filter((fighter) => fighter.corner === ladder.attackers && standing(fighter) && Math.hypot(fighter.root[0] - ladder.x, fighter.root[1] - ladder.z) < spec.raiseWithin && (fighter.root[0] - ladder.x) * ladder.out[0] + (fighter.root[1] - ladder.z) * ladder.out[1] > 0);
    ladder.raise = raisers.length >= spec.raisers ? ladder.raise + dt : 0;
    if (ladder.raise < spec.raiseSeconds) continue;
    ladder.up = true;
    ladder.raise = 0;
    ladder.push = 0;
    ladder.raised += 1;
    const state = worksStateOf(world);
    state.closed = state.closed.filter((piece) => piece !== ladder.piece);
    state.version += 1;
    world.events.push({ time: world.time, kind: 'ladder', ladder: ladder.index, up: true, fighters: raisers.map((fighter) => fighter.id), effects: ['the ladder raised again'] });
  }
}

/** Over it goes: the gap closed, the men on it thrown out from the face and falling from where they stood on it. */
function pushOff(world, ladder, pushers, climbers) {
  const spec = LADDERS;
  ladder.up = false;
  ladder.push = 0;
  ladder.pushedOff += 1;
  ladder.thrown += climbers.length;
  const state = worksStateOf(world);
  state.closed = [...state.closed, ladder.piece];
  state.version += 1;
  for (const { fighter } of climbers) {
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
