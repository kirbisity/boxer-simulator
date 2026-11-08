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
// Set at a stair's slope (`lean`: 65° from the ground, its foot out nearly half its height) the weight on it counts: two
// men shove off a ladder with a man near its top where one alone no longer can; and its head has further to go to pass the
// upright (`pushSpeed`). What stops them outright is an attacker at its head (on its top rungs or come up onto the walk),
// whose hands on the parapet and the ladder hold it: then there is nobody's push to spare, and the ladder stands. A ladder
// raised again takes its men's time: two men at its foot lift it and walk it up to the wall.
//
// The ladders begin the battle lying at the wall's foot, as they were carried up: the attackers nearest each are sent to its
// foot (`ladderPost`, ai.js) and raise it. Then it is climbed: a man at its foot, with the enemy on the walk above, gets on
// it and goes up it as up a steep stair (`climb`), his stance carried by it (the ladder, not the ground's relief, holds his
// feet: a wall's face is no slope to walk up, physics/fieldworks.js FIELDWORKS.face). It is two men wide (`lanes`): two go
// up it abreast, each in his lane one to every `spacing` m of it, each waiting on the man above him in it. He goes up only
// from over its foot (not from where he stood beside it or under it), his feet on its rungs one by turns and his hands on
// rungs above them (`climb`, ladderLimbs: his own steps given up while he is on it), his trunk along it: he strikes nothing
// (physics.js throwPunch) until he is at its head, his arms over the walk's edge. At its head
// he steps onto the walk if no enemy stands where he would; else he fights from there. Struck down, knocked off its line,
// or thrown with it, he falls from where he was on it, as any body falls.
//
// The player is not put on it: he gets on by walking at the wall from its foot (`climb.wish`), goes up while he keeps
// pressing at the wall, holds his rung while he does not, and climbs back down (and off at its foot) when he pulls away.

import { P } from '../body.js';
import { fall, point, toLocal } from '../physics.js';
import { POSE, yawRotate } from '../pose.js';
import { WORLD } from './config.js';
import { reliefAt, worksOf, worksStateOf } from './fieldworks.js';

export const LADDERS = {
  // rad from the upright: set at 65° from the ground, a ship stair's slope (OSHA 29 CFR 1910.25: ship stairs 50-70°,
  // ladders 60-90°), its foot out 0.47 of its height. Steep enough to stand on the wall's top and be raised by two men;
  // shallow enough to be gone up facing the wall as up a steep stair, the weight on the feet, one hand on a rail and the
  // weapon in the other; and the shallower a ladder stands the more its load holds it to the wall against a push (the
  // statics above: the four-to-one rule's 76° is set for a ladder nobody is trying to throw down).
  lean: (25 * Math.PI) / 180,
  // Two abreast (`lanes`), `laneApart` m between the two men's lines: a man's shoulders are ~0.45-0.5 m across, and the
  // two need room for their elbows and a shield. The width is an estimate: the Wujing Zongyao's (1044) cloud ladders were
  // built broad on wheeled carriages; the widths of the scaling ladders carried at Pyongyang and Ulsan are not given in the
  // sources checked.
  lanes: 2,
  laneApart: 0.7,
  // kg: a two-abreast scaling ladder for a 4.5-7 m wall: two pine or bamboo rails ~6.5 m long and some twenty rungs 1.4 m
  // wide (an estimate: rails 10 × 5 cm of pine, ~14 kg each; rungs ~0.7 kg each).
  kg: 40,
  // N: what a man pushes with both hands at shoulder height, short of all he has (men's maximal initial push forces in the
  // ergonomic tables, Snook & Ciriello 1991, run ~300-450 N), over a parapet.
  push: 350,
  // How many push at once: one at each rail's head.
  pushers: 2,
  // m: a defender this near its head (on the walk, his arms over the parapet) can get his hands on it.
  reach: 1.1,
  // m: an attacker on his feet this near its head (and no more than `heldBelow` m under the walk) is at it: on its top rungs,
  // his hands on the parapet, or come up onto the walk. While one is, it is held.
  held: 1.5,
  heldBelow: 1.4,
  // m/s: how fast the men at its head walk it out from the wall to past the upright (its head goes out height × sin(lean)):
  // a few strides of a push; 0.75 m/s takes a 4.5 m ladder at 25° (1.9 m out) 2.5 s.
  pushSpeed: 0.75,
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
  // To raise it again: `raisers` attackers on their feet within `raiseWithin` m of it, for `raiseSeconds` s (two men
  // lift a ladder off the ground and walk it up to the wall in the time of a few steps each, under the wall's shot).
  raisers: 2,
  raiseWithin: 2.2,
  raiseSeconds: 8,
  // m along the rails from rung to rung (and from its foot to the first): a ladder's rungs are 10-14 in (0.25-0.36 m) apart
  // (OSHA 29 CFR 1910.23(b)(2)), a stair's rise up it; 0.3 m along at 65° is 0.27 m up. The drawing's rungs are these
  // (story/ground/wallview.js), and his hands and feet go on them (`climb`).
  rung: 0.3,
  // m along the rails they stand up past the walk's edge: a ladder set to be stepped off at its head (and held there by the
  // hands), not climbed over; OSHA 29 CFR 1910.23(c)(11) has a ladder's rails 3 ft (0.9 m) past what it is got off onto, a
  // scaling ladder cut to the wall's height a little less.
  over: 0.6,
  // A ladder's width (m): its gap's piece of the face when it is down (story/ground/walls.js STORY_WALL.ladder): its two
  // lanes and a rail's room either side.
  width: 1.6,
  // The sent: the `raisers` attackers nearest a lying ladder's foot, within `call` m of it, are sent to raise it (the men
  // of its column told off to carry and raise it); their places `postOut` m out from the wall's foot, `postSide` m either side.
  call: 10,
  postOut: 1,
  postSide: 0.6,
  climb: {
    // m/s along it: up a stair-steep ladder facing it, laden with armour and a weapon. Men climbing ladders of several
    // slants in the laboratory went at 0.3-0.5 m/s (Bloswick & Chaffin, "An ergonomic analysis of the ladder climbing
    // activity", Int. J. Industrial Ergonomics 6, 1990: 12 and 20 in/s); a man hurrying up a stair goes ~1 m/s along it.
    // 0.6 m/s along at 65° is 0.54 m/s up: a 4.5 m wall in some 8 s.
    pace: 0.6,
    // m of ladder to each man in a lane: one to a man's height and his reach (a man's feet clear of the hands of the man
    // below; a 5 m ladder takes four to a lane).
    spacing: 1.2,
    // m under the walk from which his head and arms are over its edge: he can strike from the ladder's head.
    top: 1.2,
    // m in from the face's top he steps to on the walk; an enemy standing within `clear` m of there keeps him on the ladder.
    onto: 0.5,
    clear: 0.7,
    // m from its line (anywhere from its foot to under it, at the wall) an attacker gets on it, with an enemy on the walk
    // within `enemyWithin` m of its head: half its width, so the men at its foot go up it from where they stand.
    mount: 0.8,
    enemyWithin: 14,
    // m/s his stance is carried to his lane's line as he gets on it (a step or two); he goes up only once it is within
    // `onPlace` m of his place on it (his feet on its bottom rungs, not on the ground a stride off: there he would be climbing
    // the air beside it).
    board: 1.5,
    onPlace: 0.15,
    // m: his hips knocked this far off his place on the ladder (by a blow, a shove, the press), his hold is gone: he falls.
    slip: 0.5,
    // His balance against a knock (physics.js: the speed a shove must give him to put him over) on a ladder: his hands on
    // its rails as well as his feet on a rung, so a shove has to tear his grip loose too (a man braced with both hands takes
    // about twice what he takes on his feet alone). A blow that knocks his hips off his place still takes him off (`slip`).
    hold: 2,
    // His hands and feet on its rungs (ladderLimbs). A foot to every other rung, the two by turns: the one stands on its rung
    // while the other comes up past it onto the next (the reciprocal gait of men up a ladder as up a stair: Bloswick & Chaffin
    // 1990 above), so he has a foot on a rung, and both hands on others, at every moment ("three points of contact").
    // The ball of his foot on the rung: his ankle `heel` m out behind it (a man's ankle is some 0.1-0.12 m behind the ball of
    // his foot, nearly half the foot's length, itself 0.152 of his stature: Drillis & Contini 1966), his feet `feetApart` m
    // apart along it (his hips' width); and his stance (root) over them.
    heel: 0.1,
    feetApart: 0.22,
    // m the rising foot is drawn out from the rungs at the middle of its swing, the toes clear of the rung it passes.
    clearance: 0.08,
    // His stance (the height his hips are set from) this share of a rung under the rung his foot has just come onto: his knee
    // bent the most as it lands (a stair's rise more than a guard's crouch), near straight (the guard's) as he rises to it and
    // the other foot reaches for the next.
    stand: 0.75,
    // His hands on the rungs at about his shoulders' height over the rung his (other) foot is on, `grip` of his height (the
    // shoulder, the acromion, is 0.82 of a man's stature: Drillis & Contini 1966; less his bent knees and his lean), each going
    // up with the other side's foot (the diagonal gait: right hand and left foot together), `handsApart` m apart (his
    // shoulders' width). Each hand's fist is on its rung, the weapon in it pointed up along the rails (a two-handed haft in
    // the one hand: the other is on the ladder).
    grip: 0.75,
    handsApart: 0.4,
    // His trunk leaned toward the ladder, a share of its own lean from the upright: along its rails, his weight kept in over
    // the rungs and his shoulders in his hands' reach, as a man's up a steep stair-ladder.
    trunk: 1,
    // The player's way: the share of his stick (or his steps' way) pointed at the wall that puts him on it at its foot and
    // takes him up it; pointed away from it as much, he climbs down. Less either way, he holds his rung.
    wish: 0.5,
  },
};

/** s: the push at a ladder's head, from the hands on it to past the upright (its head carried out by its lean). */
export const ladderPushSeconds = (ladder) => (ladder.height * Math.sin(LADDERS.lean)) / LADDERS.pushSpeed;

/** m along its line (u) of lane `lane`'s middle, from the ladder's middle. */
const ladderLaneSide = (lane) => (lane - (LADDERS.lanes - 1) / 2) * LADDERS.laneApart;

/**
 * Where a ladder of a wall's works (`works`: fieldworks.js worksOf) stands: the wall it leans on (its line `u`, the way `out`
 * from it to the attackers' ground), its foot out on the ground by its lean from its head at the walk's edge (`base` the
 * ground there; `height` its rise from there to the walk's top). On a hill's slope the ground at its foot is below the wall's
 * foot, so it rises the more and stands the further out: a few rounds of that settle it. (The physics and the drawing alike.)
 */
export function ladderStance(works, ladder) {
  // The wall the ladder stands against, its line and height (the face's stretch nearest its gap).
  const wall = works.walls.reduce((best, each) => {
    const off = Math.min(Math.hypot(each.a[0] - ladder.x, each.a[1] - ladder.z), Math.hypot(each.b[0] - ladder.x, each.b[1] - ladder.z));
    return !best || off < best.off ? { off, each } : best;
  }, null)?.each;
  const u = wall?.u ?? [0, 1];
  // Outward: from the wall to the ladder's foot, the side away from the rampart (the lower ground a metre off its line).
  const normal = [-u[1], u[0]];
  const out = reliefAt(works, ladder.x + normal[0], ladder.z + normal[1]) > reliefAt(works, ladder.x - normal[0], ladder.z - normal[1]) ? [-normal[0], -normal[1]] : normal;
  const run = ladder.run ?? 0.3;
  const top = (ladder.base ?? 0) + ladder.height;
  let base = ladder.base ?? 0;
  let footOut = 0;
  for (let round = 0; round < 4; round += 1) {
    footOut = Math.max(0, (top - base) * Math.tan(LADDERS.lean) - run);
    base = reliefAt(works, ladder.x + out[0] * footOut, ladder.z + out[1] * footOut);
  }
  return {
    wall, u, out, run, top, base, height: top - base, footOut,
    foot: [ladder.x + out[0] * footOut, ladder.z + out[1] * footOut],
    // The head: at the walk's edge, its top.
    head: [ladder.x - out[0] * run, top, ladder.z - out[1] * run],
  };
}

/** The ladders of an arena's works as things in this world (null for works without ladders). Attackers: the side out at their feet. */
export function createLadders(world, arena) {
  const works = worksOf(arena);
  const ladders = works?.spec.ladders;
  if (!ladders?.length) return null;
  const spec = LADDERS;
  return ladders.map((ladder, index) => {
    const { wall, u, out, run, top, base, height, footOut, foot, head } = ladderStance(works, ladder);
    const reds = world.fighters.filter((fighter) => fighter.corner === 'red' && (fighter.root[0] - ladder.x) * out[0] + (fighter.root[1] - ladder.z) * out[1] > 0).length;
    const blues = world.fighters.filter((fighter) => fighter.corner === 'blue' && (fighter.root[0] - ladder.x) * out[0] + (fighter.root[1] - ladder.z) * out[1] > 0).length;
    const half = spec.width / 2;
    const made = {
      // (base: the ground at its foot; height: its rise from there to the walk.)
      index, x: ladder.x, z: ladder.z, base, height, run, u, out, head, foot, footOut,
      attackers: reds >= blues ? 'red' : 'blue',
      // Its gap's piece of the face, closed while it is down (fieldworks.js wallsOf).
      piece: { a: [ladder.x - u[0] * half, ladder.z - u[1] * half], b: [ladder.x + u[0] * half, ladder.z + u[1] * half], u, length: spec.width, height: wall?.height ?? top + 1.1, kind: wall?.kind ?? 'stone', cover: null },
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

/** The place on the floor ([x, z]) of a man `up` m up the ladder in lane `lane` (past its height: stepping in onto the walk). */
export function ladderPlace(ladder, up, lane = 0) {
  const share = Math.min(1, Math.max(0, up / ladder.height));
  const over = Math.max(0, up - ladder.height);
  const side = ladderLaneSide(lane);
  return [
    ladder.foot[0] + (ladder.head[0] - ladder.foot[0]) * share - ladder.out[0] * over + ladder.u[0] * side,
    ladder.foot[1] + (ladder.head[2] - ladder.foot[1]) * share - ladder.out[1] * over + ladder.u[1] * side,
  ];
}

/** m up a ladder from rung to rung. */
const ladderRise = () => LADDERS.rung * Math.cos(LADDERS.lean);

/**
 * A point on a ladder's rails `h` m up it (over its foot; past its head they go on up the same line, to their tops), `across`
 * m to the side of lane `lane`'s line and `out` m out from its rungs (on the level, away from the wall): [x, y, z].
 */
function ladderRailPoint(ladder, h, lane, across = 0, out = 0) {
  const share = h / ladder.height;
  const side = ladderLaneSide(lane) + across;
  return [
    ladder.foot[0] + (ladder.head[0] - ladder.foot[0]) * share + ladder.u[0] * side + ladder.out[0] * out,
    ladder.base + h,
    ladder.foot[1] + (ladder.head[2] - ladder.foot[1]) * share + ladder.u[1] * side + ladder.out[1] * out,
  ];
}

/**
 * Where a hand or a foot that goes on every other rung (those of parity `parity`) is, the climber `n` rungs up: on the last of
 * its rungs he has come to (`from`, and `to` the same), or on its way from it to the next (`t` of the way, 0-1), in the rung
 * after its own, while the other side's stands. Down the ladder, the same backwards.
 */
function ladderRungOf(n, parity) {
  const from = parity + 2 * Math.floor((n - parity) / 2);
  const t = n - from - 1;
  return t > 0 ? { from, to: from + 2, t } : { from, to: from, t: 0 };
}

/**
 * A climber's hands and feet on his ladder now ({ l: { foot, hand }, r: ... }, each [x, y, z]; LADDERS.climb): his left foot
 * on the even rungs, his right on the odd, each hand going up with the other side's foot `grip` of his height above it, on
 * the rungs to the rails' tops. A rung past the ladder's head is the walk: a foot stepping in onto it (ladderPlace).
 */
export function ladderLimbs(ladder, fighter) {
  const spec = LADDERS.climb;
  const rise = ladderRise();
  const lane = fighter.climbing.lane ?? 0;
  const n = fighter.climbing.up / rise + spec.stand;
  const grip = Math.round((spec.grip * fighter.body.heightM) / rise);
  const railTop = ladder.height + LADDERS.over * Math.cos(LADDERS.lean);
  // His left along the rungs (facing the wall, as he climbs): which way of its line (u) that is.
  const leftWay = yawRotate([0, 0, 1], Math.atan2(ladder.out[1], -ladder.out[0]));
  const left = Math.sign(leftWay[0] * ladder.u[0] + leftWay[2] * ladder.u[1]) || 1;
  const footAt = (rung, across) => {
    const h = Math.max(0, rung * rise);
    if (h <= ladder.height) return ladderRailPoint(ladder, h, lane, across, spec.heel);
    const [x, z] = ladderPlace(ladder, h, lane);
    return [x + ladder.u[0] * across, ladder.base + ladder.height, z + ladder.u[1] * across];
  };
  const handAt = (rung, across) => ladderRailPoint(ladder, Math.min(railTop, Math.max(0, rung * rise)), lane, across, 0);
  /** On its rung, or on its way to the next: drawn out from the rungs at the middle of the move, clear of them. */
  const moving = (at, { from, to, t }, across) => {
    const a = at(from, across);
    const b = at(to, across);
    const ease = t * t * (3 - 2 * t);
    const clear = spec.clearance * Math.sin(Math.PI * t);
    return [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * ease + (k === 1 ? 0 : ladder.out[k === 0 ? 0 : 1] * clear));
  };
  const limbs = {};
  for (const [side, parity, sign] of [['l', 0, left], ['r', 1, -left]]) {
    const feet = ladderRungOf(n, parity);
    // (His other hand goes with this foot: the rungs of this foot's parity, `grip` up.)
    const hand = ladderRungOf(n, 1 - parity);
    limbs[side] = {
      foot: moving(footAt, feet, (sign * spec.feetApart) / 2),
      hand: moving(handAt, { from: hand.from + grip, to: hand.to + grip, t: hand.t }, (sign * spec.handsApart) / 2),
    };
  }
  return limbs;
}

/**
 * A climber's pose on his ladder (physics.js updateIntent, after the rest of it): square to it, his trunk along its rails,
 * his hands on its rungs (ladderLimbs) with his weapon in his fist pointed up it; at its head a blow or a block of his own
 * takes his hands off it. (His feet are its: climbLadder.)
 */
export function ladderPose(world, fighter, intent) {
  const ladder = world.siegeLadders?.[fighter.climbing?.ladder];
  if (!ladder) return;
  intent.twist = 0;
  intent.hipYaw = 0;
  intent.lean = LADDERS.lean * LADDERS.climb.trunk - (intent.stance?.lean ?? POSE.forwardLean);
  if (fighter.punch || fighter.defence) return;
  const limbs = ladderLimbs(ladder, fighter);
  intent.lHand = toLocal(fighter, limbs.l.hand);
  intent.rHand = toLocal(fighter, limbs.r.hand);
  intent.twoHanded = false;
  intent.weaponArms = null;
  intent.guardTight = false;
  // Up along its rails, in his frame.
  const length = Math.hypot(ladder.head[0] - ladder.foot[0], ladder.height, ladder.head[2] - ladder.foot[1]);
  const up = yawRotate([(ladder.head[0] - ladder.foot[0]) / length, ladder.height / length, (ladder.head[2] - ladder.foot[1]) / length], -fighter.yaw);
  if (intent.bladeDir) intent.bladeDir = up;
  if (intent.offBladeDir) intent.offBladeDir = up;
}

/** The men on a ladder now (on their feet; in one lane of it, if given), the highest first. */
const ladderClimbers = (world, ladder, lane = null) => world.fighters.filter((fighter) => fighter.climbing?.ladder === ladder.index && fighter.state === 'up' && (lane === null || fighter.climbing.lane === lane)).sort((a, b) => b.climbing.up - a.climbing.up);

/** The lane of a ladder nearest a man standing at (x, z). */
const ladderLaneNear = (ladder, x, z) => {
  const across = (x - ladder.x) * ladder.u[0] + (z - ladder.z) * ladder.u[1];
  let best = 0;
  for (let lane = 1; lane < LADDERS.lanes; lane += 1) if (Math.abs(across - ladderLaneSide(lane)) < Math.abs(across - ladderLaneSide(best))) best = lane;
  return best;
};

/** Put a man on a ladder `up` m up it, in a lane (by default the one nearest him; he gets on at its foot; the tests' way to set one higher). */
export function boardLadder(world, fighter, ladder, up = 0, lane = ladderLaneNear(ladder, fighter.root[0], fighter.root[1])) {
  fighter.climbing = { ladder: ladder.index, lane, up, top: up >= ladder.height - LADDERS.climb.top };
  fighter.ladderPost = null;
  fighter.goTo = null;
  fighter.punch = null;
}

/**
 * The player's way with a ladder (null for any other man): the share of his steps' way (control.js: where he is going, or
 * in and out from his man when locked on) that points at its wall, -1 to 1; 0 standing still.
 */
export function ladderWish(fighter, ladder) {
  if (!fighter.player) return null;
  const move = fighter.move ?? 0;
  if (fighter.goTo && move > 0.05) {
    const dx = fighter.goTo[0] - fighter.root[0];
    const dz = fighter.goTo[2] - fighter.root[1];
    const apart = Math.hypot(dx, dz);
    return apart > 1e-6 ? -(dx * ladder.out[0] + dz * ladder.out[1]) / apart : 0;
  }
  if (Math.abs(move) <= 0.05) return 0;
  // Locked on: his forward (yaw) in or out, as his move says.
  const forward = [Math.cos(fighter.yaw), -Math.sin(fighter.yaw)];
  return -Math.sign(move) * (forward[0] * ladder.out[0] + forward[1] * ladder.out[1]);
}

/**
 * A man on a ladder, each step (physics.js moveRoot, in place of his own steps): up his lane at its pace (down, broken; the
 * player as he presses), no nearer the man above than its spacing, onto the walk at its head when nobody stands there; his
 * stance on his lane's line, at his rung's height, facing the wall. Returns false when it is gone from under him.
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
  // m/s up: his pace along it, as its slope rises.
  const rate = spec.pace / along;
  const wish = ladderWish(fighter, ladder);
  const lane = climbing.lane ?? 0;
  const down = fighter.panicked || fighter.fled || (wish !== null && wish <= -spec.wish);
  // Not yet over his rung (getting on from where he stood at its foot, or under it): he steps to it before he climbs.
  const was = ladderPlace(ladder, climbing.up, lane);
  const off = Math.hypot(was[0] + ladder.out[0] * spec.heel - fighter.root[0], was[1] + ladder.out[1] * spec.heel - fighter.root[1]);
  const going = down ? -1 : (wish === null || wish >= spec.wish) && off <= spec.onPlace ? 1 : 0;
  let up = climbing.up + going * rate * dt;
  for (const other of ladderClimbers(world, ladder, lane)) {
    if (other !== fighter && other.climbing.up > climbing.up) up = Math.min(up, other.climbing.up - spec.spacing / along);
  }
  // At its head: in onto the walk only if no enemy stands where he would step.
  if (up > ladder.height) {
    const landing = ladderPlace(ladder, ladder.height + spec.onto, lane);
    const barred = world.fighters.some((other) => other.corner !== fighter.corner && other.corner !== 'grey' && other.state === 'up' && Math.hypot(other.root[0] - landing[0], other.root[1] - landing[1]) < spec.clear);
    if (barred) up = Math.max(climbing.up, Math.min(up, ladder.height));
  }
  climbing.up = Math.max(climbing.up - rate * dt, up);
  climbing.top = climbing.up >= ladder.height - spec.top;
  const place = ladderPlace(ladder, climbing.up, lane);
  // His stance carried to his place on its line (as he gets on it: a step or two), and held there: over the balls of his feet
  // on the rungs, his ankles `heel` out behind them.
  const dx = place[0] + ladder.out[0] * spec.heel - fighter.root[0];
  const dz = place[1] + ladder.out[1] * spec.heel - fighter.root[1];
  const apart = Math.hypot(dx, dz);
  const most = spec.board * dt + spec.pace * dt;
  const moved = apart > most ? most / apart : 1;
  fighter.rootVelocity = [(dx * moved) / Math.max(dt, 1e-9), (dz * moved) / Math.max(dt, 1e-9)];
  fighter.root = [fighter.root[0] + dx * moved, fighter.root[1] + dz * moved];
  fighter.lift = ladder.base + Math.min(climbing.up, ladder.height);
  // His feet on its rungs (ladderLimbs): set there each step, his own steps given up while he is on it (physics.js updateFeet).
  const limbs = ladderLimbs(ladder, fighter);
  for (const side of ['l', 'r']) {
    const foot = fighter.feet[side];
    const at = limbs[side].foot;
    foot.step = null;
    foot.lifted = false;
    foot.planted = [at[0], fighter.desired?.[foot.index]?.[1] ?? 0, at[2]];
    foot.floor = at[1];
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
  // Off it: at its foot again (stepped off it onto the ground), or in on the walk.
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
      if (ladder.push < ladderPushSeconds(ladder)) continue;
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

/**
 * Men at a standing ladder's foot get on it, a man to each lane whose last man is a spacing up it, while the enemy holds the
 * walk above: the nearest to that lane's line. The player only by walking at the wall (ladderWish), never as he passes.
 */
function ladderBoard(world, ladder, works) {
  const spec = LADDERS.climb;
  const held = world.fighters.some((other) => other.corner !== ladder.attackers && other.corner !== 'grey' && other.state === 'up' && !other.fled && Math.hypot(other.root[0] - ladder.head[0], other.root[1] - ladder.head[2]) < spec.enemyWithin && reliefAt(works, other.root[0], other.root[1]) > ladder.base + ladder.height / 2);
  if (!held) return;
  for (let lane = 0; lane < LADDERS.lanes; lane += 1) {
    const climbers = ladderClimbers(world, ladder, lane);
    const lowest = climbers.length ? climbers[climbers.length - 1].climbing.up : Infinity;
    if (lowest < spec.spacing * Math.cos(LADDERS.lean)) continue;
    const side = ladderLaneSide(lane);
    let best = null;
    for (const fighter of world.fighters) {
      if (fighter.corner !== ladder.attackers || !ladderStanding(fighter) || fighter.climbing || fighter.gunCrew !== undefined) continue;
      const wish = ladderWish(fighter, ladder);
      if (wish !== null && wish < spec.wish) continue;
      // (Anywhere at its foot or under it, between its foot and the wall, on the ground there.)
      const out = (fighter.root[0] - ladder.x) * ladder.out[0] + (fighter.root[1] - ladder.z) * ladder.out[1];
      if (out < -0.05 || ladderFootingUp(works, ladder, fighter) > LADDERS.climber) continue;
      const across = (fighter.root[0] - ladder.x) * ladder.u[0] + (fighter.root[1] - ladder.z) * ladder.u[1] - side;
      const apart = Math.hypot(across, Math.max(0, out - ladder.footOut));
      if (apart < spec.mount && (!best || apart < best.apart)) best = { fighter, apart };
    }
    if (best) boardLadder(world, best.fighter, ladder, 0, lane);
  }
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
