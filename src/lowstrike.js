// A blow at a man low before him: lying, getting up, on his knees, crawling. One tap of the attack is enough. The blow is made at a
// place on his body as it lies (the nearest of his head, his chest, his belly), not at the air where a standing man's chest would
// be; the striker steps in if it is beyond him (as the finisher steps in, finisher.js stepTowards), bends as far as the blow
// needs (the hips down, the trunk over, to his knees for a fist at a man flat on the floor: WORLD.lowStrike), and makes it: a cut
// pitched down about his shoulder onto the place (physics.js strokeTargets, as a rider cuts down at a man on foot), a point driven
// down at it, a fist down into it, a kick at him on the floor. Nothing is added to it: its force is the stroke's.
//
// The player's (control.js: an attack tapped with a man low within reach; a man helpless on the floor in a fight with weapons is
// the finisher's first). The state is `fighter.lowStrike`; `updateLowStrike` runs it each step from `directFighter`.

import { P } from './body.js';
import { MOVES, STYLES } from './moves.js';
import { POSE, vec } from './pose.js';
import { bladeFor, hostile, point, stoopShift, throwPunch, WORLD } from './physics.js';
import { stepTowards } from './finisher.js';

/** The places on a man a low blow goes to (world points), and the zone each is for the blow. */
const PARTS = {
  head: { zone: 'head', at: (man) => point(man.x, P.head) },
  chest: { zone: 'body', at: (man) => vec.lerp(point(man.x, P.pelvis), point(man.x, P.neck), 0.6) },
  belly: { zone: 'body', at: (man) => vec.lerp(point(man.x, P.pelvis), point(man.x, P.neck), 0.25) },
};

/** The floor under him (y): his lower foot, less the ankle. */
function floorOf(fighter) {
  return Math.min(fighter.x[P.lFoot * 3 + 1], fighter.x[P.rFoot * 3 + 1]) - fighter.body.lengths.ankle;
}

/** His stance's own lean (rad) and crouch (share of his height). */
function stanceOf(fighter) {
  const stance = STYLES[fighter.style]?.stance ?? {};
  return { lean: stance.lean ?? POSE.forwardLean, crouch: stance.crouch ?? POSE.crouch };
}

/** His shoulder standing upright in his stance (local m: forward of the hips, up from the floor). */
function standingShoulder(fighter) {
  const L = fighter.body.lengths;
  const { lean, crouch } = stanceOf(fighter);
  return [L.trunk * Math.sin(lean), L.ankle + L.shank + L.thigh - crouch * fighter.body.heightM + L.trunk * Math.cos(lean)];
}

/** Whether a man is low before this one: on the floor, getting up, crawling, or his head below a kneeling man's. */
export function lowMan(fighter, man) {
  if (!man || man === fighter || man.state === 'out' || man.dormant || man.fled || man.mount) return false;
  if (man.state === 'down' || man.state === 'rising' || man.crawling) return true;
  return man.x[P.head * 3 + 1] - floorOf(fighter) < WORLD.lowStrike.headBelow * standingShoulder(fighter)[1];
}

/**
 * How a move reaches down: `from` 'shoulder' (a fist, a blade) or 'hip' (a kick); `outer` (m), the furthest from there a place
 * can be and meet its striking part with the limb `fit` of its length out (WORLD.lowStrike); `inner`, the nearest (the hand
 * `handIn` out at least). The striking part is the fist; a blade's contact point (`contactAt` along it: the place is met there,
 * not at the haft or past the tip); a point's end less the depth it goes in (and a point starts from the move's hand, `start`,
 * with the blade's length before it); a whip's thong. Outer Infinity for a shot. Null for a move that cannot go down to a man on
 * the floor (a knee, a clinch, a rush).
 */
function reachOf(fighter, spec) {
  if (!spec || spec.kind !== 'strike' || spec.limb.endsWith('Knee')) return null;
  const { fit, handIn } = WORLD.lowStrike;
  if (spec.path === 'aim') return { from: 'shoulder', outer: Infinity, inner: 0 };
  if (spec.limb.endsWith('Foot')) return { from: 'hip', outer: (fighter.body.lengths.thigh + fighter.body.lengths.shank) * fit, inner: 0 };
  const arm = fighter.body.reach * fit;
  const blade = spec.path === 'blade' ? bladeFor(fighter, spec) : null;
  if (!blade?.held) return { from: 'shoulder', outer: arm, inner: handIn };
  const held = blade.spec;
  if (held.reach) return { from: 'shoulder', outer: arm + held.reach, inner: handIn + held.strikeFrom };
  if (spec.mode === 'thrust') return { from: 'shoulder', outer: arm + held.length - (spec.depth ?? 0.25), inner: handIn, start: spec.from.hand, length: held.length };
  const contact = held.length * (spec.contactAt ?? 0.7);
  return { from: 'shoulder', outer: arm + contact, inner: handIn + contact };
}

/** Whether he can make a move now: a strike of his style that reaches down, with the weapon or shield it needs and its limb whole. */
function usable(fighter, name) {
  const spec = MOVES[name];
  if (!reachOf(fighter, spec)) return false;
  if (spec.reach === 'weapon' && !fighter.weapon?.held && !fighter.offWeapon?.held) return false;
  if (spec.bash && !fighter.shield) return false;
  return !fighter.limp?.has(P[spec.limb]);
}

/**
 * How well a move goes down onto a man low before it, by its own path: a point, a shot, a straight or clubbing fist go wherever
 * they are aimed (1); a cut by how far its hand falls through it (its `from` to its `to`, shares of his height: an overhead cut
 * ~0.5, a level sweep ~0, a rising cut below 0); a hook half; a kick half (a stamp, as it comes); an uppercut or an elbow not.
 */
function downward(spec) {
  if (spec.path === 'aim' || spec.mode === 'thrust') return 1;
  if (spec.path === 'blade') return spec.to ? spec.from.hand[1] - spec.to.hand[1] : 0;
  if (spec.limb.endsWith('Foot')) return 0.5;
  return { straight: 1, club: 1, hook: 0.5 }[spec.path] ?? 0;
}

/**
 * The move for a low blow: the one asked for if it goes down onto him (`downFrom`, WORLD.lowStrike), else the one of his style
 * that goes down best (the most used of those alike): a chop for a sweep, a straight blow for an uppercut.
 */
export function lowMove(fighter, wanted) {
  if (usable(fighter, wanted) && downward(MOVES[wanted]) >= WORLD.lowStrike.downFrom) return wanted;
  const attacks = Object.entries(STYLES[fighter.style]?.attacks ?? {}).filter(([name, weight]) => weight > 0 && usable(fighter, name));
  attacks.sort((a, b) => downward(MOVES[b[0]]) - downward(MOVES[a[0]]) || b[1] - a[1]);
  return attacks[0]?.[0] ?? null;
}

/**
 * The place on him to strike: the nearest of his head, chest and belly to this man's hips (planar); for a weapon (`spec` a
 * blade's move), the head counted `headFurther` m further for the smaller mark it is (WORLD.lowStrike).
 */
function nearestPart(fighter, man, spec) {
  const headFurther = spec.path === 'blade' ? WORLD.lowStrike.headFurther : 0;
  const hips = point(fighter.x, P.pelvis);
  let best = null;
  let bestApart = Infinity;
  for (const [name, part] of Object.entries(PARTS)) {
    const at = part.at(man);
    const apart = Math.hypot(at[0] - hips[0], at[2] - hips[2]) + (name === 'head' ? headFurther : 0);
    if (apart < bestApart) {
      best = name;
      bestApart = apart;
    }
  }
  return best;
}

/**
 * The bend (0 to 1 of WORLD.lowStrike's deepest) a move needs to meet a place `apart` m out (planar, from his hips) and `height`
 * m up from his floor: the least that brings its striking part to it (between `inner` and `outer`). Null if not even the deepest does.
 */
export function stoopNeeded(fighter, spec, apart, height) {
  const how = reachOf(fighter, spec);
  if (!how) return null;
  const { outer } = how;
  if (how.from === 'hip') {
    const hip = fighter.body.lengths.ankle + fighter.body.lengths.shank + fighter.body.lengths.thigh;
    return Math.hypot(apart, hip - height) <= outer ? 0 : null;
  }
  const shoulder = standingShoulder(fighter);
  for (let stoop = 0; stoop <= 1.0001; stoop += 0.05) {
    const shift = stoopShift(fighter, stoop);
    const distance = Math.hypot(apart - shoulder[0] - shift[0], height - shoulder[1] - shift[1]);
    if (distance <= outer && distance >= how.inner && clearOfPoint(fighter, how, apart, height, shift)) return Math.min(1, stoop);
  }
  return null;
}

/** Whether a point (a thrust) starts `room` short of a place, bent by `shift` (local m); anything else, true. */
function clearOfPoint(fighter, how, apart, height, shift) {
  if (!how.start) return true;
  const H = fighter.body.heightM;
  return Math.hypot(apart - how.start[0] * H - shift[0], height - how.start[1] * H - shift[1]) >= how.length + WORLD.lowStrike.room;
}

/**
 * How far out (m, planar from his hips) he stands to make a move at a place `height` m up, bent `stoop` of the deepest: midway
 * between the nearest the place may be (`inner`) and the furthest (`outer`), his feet off the man's body.
 */
function standingOff(fighter, spec, height, stoop) {
  const how = reachOf(fighter, spec);
  const { outer } = how;
  if (outer === Infinity) return Infinity;
  if (how.from === 'hip') {
    const hip = fighter.body.lengths.ankle + fighter.body.lengths.shank + fighter.body.lengths.thigh;
    return Math.max(WORLD.lowStrike.standOff, Math.sqrt(Math.max(0, outer ** 2 - (hip - height) ** 2)) * 0.9);
  }
  const shoulder = vec.add([...standingShoulder(fighter), 0], stoopShift(fighter, stoop));
  const drop = height - shoulder[1];
  let near = shoulder[0] + Math.sqrt(Math.max(0, how.inner ** 2 - drop ** 2));
  if (how.start) {
    // (A point: its start `room` short of the place, from the hand it starts from.)
    const H = fighter.body.heightM;
    const shift = stoopShift(fighter, stoop);
    const fall = height - how.start[1] * H - shift[1];
    near = Math.max(near, how.start[0] * H + shift[0] + Math.sqrt(Math.max(0, (how.length + WORLD.lowStrike.room) ** 2 - fall ** 2)));
  }
  const far = shoulder[0] + Math.sqrt(Math.max(0, outer ** 2 - drop ** 2));
  return Math.max(WORLD.lowStrike.standOff, (near + far) / 2);
}

/**
 * The man a tap goes at low: his mark (the man the attack would go at) if he is low and within `within`; else, unless the mark
 * is a man on his feet within it (he owns the blow), the nearest man low within it, an enemy before anyone else. Null if none.
 */
export function lowTarget(world, fighter, mark) {
  const range = WORLD.lowStrike.within;
  const apart = (man) => Math.hypot(man.x[P.pelvis * 3] - fighter.x[P.pelvis * 3], man.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2]);
  if (mark && apart(mark) <= range) return lowMan(fighter, mark) ? mark : null;
  let best = null;
  let bestScore = Infinity;
  for (const man of world.fighters) {
    if (!lowMan(fighter, man) || apart(man) > range) continue;
    const score = apart(man) + (hostile(man, fighter) ? 0 : WORLD.aimedAtOthers);
    if (score < bestScore) {
      best = man;
      bestScore = score;
    }
  }
  return best;
}

/** Begin a low blow at `man` with the move asked for (or one that goes down to him). False if he has none. */
export function startLowStrike(world, fighter, man, wanted, { heavy = false } = {}) {
  if (!man || fighter.state !== 'up' || fighter.punch || fighter.mount || fighter.crawling || fighter.netted || fighter.finisher) return false;
  const move = lowMove(fighter, wanted);
  if (!move) return false;
  const part = nearestPart(fighter, man, MOVES[move]);
  fighter.lowStrike = { target: man.id, move, part, zone: PARTS[part].zone, heavy, phase: 'approach', t: 0, stoop: 0, need: 0, kneels: false, punch: null };
  return true;
}

/** Let go of it: back upright, his feet his own. */
function endLowStrike(fighter) {
  fighter.lowStrike = null;
  fighter.goTo = null;
  fighter.running = false;
  fighter.move = 0;
  fighter.strafe = 0;
}

/**
 * Each step of a low blow: the steps in, the bend, the blow (kept on the place as he moves), the straightening. True while it
 * holds him (control.js then leaves his feet and hands to it).
 */
export function updateLowStrike(world, fighter, dt) {
  const state = fighter.lowStrike;
  if (!state) return false;
  const spec = WORLD.lowStrike;
  const man = world.fighters[state.target];
  state.t += dt;
  if (fighter.state !== 'up' || fighter.netted || fighter.mount || fighter.pain || fighter.crawling) {
    endLowStrike(fighter);
    return false;
  }
  const hips = point(fighter.x, P.pelvis);
  const mark = PARTS[state.part].at(man);
  const apart = Math.hypot(mark[0] - hips[0], mark[2] - hips[2]);
  const height = mark[1] - floorOf(fighter);
  const move = MOVES[state.move];
  if (state.phase === 'approach' || state.phase === 'stoop') {
    if (!lowMan(fighter, man) || apart > spec.lost) {
      endLowStrike(fighter);
      // Up on his feet again before it went: the blow goes as at any man standing (as the attack would have gone at him).
      if (man.state === 'up' && apart <= spec.lost) throwPunch(world, fighter, state.move, state.zone, { heavy: state.heavy, at: hostile(man, fighter) ? null : PARTS.chest.at(man) });
      return false;
    }
  }
  if (state.phase === 'approach') {
    const need = stoopNeeded(fighter, move, apart, height);
    if (need === null && state.t <= spec.approachMost) {
      const off = standingOff(fighter, move, height, spec.approachShare);
      const way = apart > 1e-6 ? [(hips[0] - mark[0]) / apart, (hips[2] - mark[2]) / apart] : [-Math.cos(fighter.yaw), Math.sin(fighter.yaw)];
      stepTowards(world, fighter, [mark[0] + way[0] * off, hips[1], mark[2] + way[1] * off], mark);
      return true;
    }
    state.phase = 'stoop';
    state.need = need ?? 1;
    state.kneels = state.need >= spec.kneelFrom;
    state.t = 0;
  }
  fighter.goTo = null;
  fighter.running = false;
  fighter.move = 0;
  fighter.strafe = 0;
  fighter.faceAt = { at: mark, until: world.time + 0.25 };
  if (state.phase === 'stoop') {
    // (The place moves as he does: the bend follows it, the knees once down staying down.)
    state.need = stoopNeeded(fighter, move, apart, height) ?? 1;
    state.kneels ||= state.need >= spec.kneelFrom;
    state.stoop = state.stoop < state.need ? Math.min(state.need, state.stoop + dt / spec.stoopSeconds) : Math.max(state.need, state.stoop - dt / spec.recoverSeconds);
    if (state.stoop < state.need - 1e-6) return true;
    if (!throwPunch(world, fighter, state.move, state.zone, { heavy: state.heavy, at: mark })) {
      endLowStrike(fighter);
      return false;
    }
    fighter.punch.low = true;
    state.punch = fighter.punch;
    state.phase = 'strike';
    state.t = 0;
    return true;
  }
  if (state.phase === 'strike') {
    const punch = state.punch;
    if (fighter.punch === punch) {
      // Kept on the place as it moves (as far off it as the blow went: its miss), until the blow is out.
      if (punch.t < punch.spec.extendUntil && punch.at) punch.at = vec.add(mark, punch.miss);
      return true;
    }
    state.phase = 'recover';
  }
  state.stoop = Math.max(0, state.stoop - dt / spec.recoverSeconds);
  if (state.stoop > 0) return true;
  endLowStrike(fighter);
  return false;
}

