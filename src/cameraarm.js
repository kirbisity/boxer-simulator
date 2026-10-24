// The camera's spring arm. Whatever camera the game wants (the follow camera behind the man played, the watching camera over
// the fight, a cutscene's) is a point on an arm from what it is there to see; the scenery between the two is never made see-through.
// Instead the arm is kept clear: a ball (the camera and its near plane) is swept from the man (his chest) out to the wanted
// position, and where it touches a wall, a roof, a floor, a house, the camera stands short of it, with a margin.
//
// Where the arm comes up short it is not simply shortened: in a low tunnel that would leave the camera on top of him. Under `comfort` the
// arm tries other directions (a little to either side, higher, a little lower) and takes the one that leaves the camera furthest back
// for the least turning away from the wanted view (and one that leaves him closer than `tooClose` is dear). So a corridor the view is not
// square to turns it square, a low roof flattens the view (it never throws it up to a top-down one: the pitch is kept between `pitchMin`
// and `pitchMax`), a dead end behind him lifts it up and over, a bend takes it round the corner.
//
// Smooth, not twitchy (tools/camjerk.js measures it): every motion of the arm is a critically damped spring (no overshoot, no velocity
// that jumps: a first-order ease starts at its full speed, and that start is the pop seen on screen), stepped by the frame's dt.
//  - Its length: in fast (`pullIn`), out slow (`letOut`, at most `outSpeed` m/s) and not at all until the way has been clear for `quiet` s;
//    out only once the way is clear for a ball `held` m bigger than the one that pulled it in (a dead band: a wall just at the arm's length
//    does not make it breathe).
//  - Its direction: a choice is kept for `hold` s at least, and only given up for one better by `sticky` m of arm (unless the kept one has
//    the camera on top of him); the turn to it is a spring (`turnRate`, at most `turnSpeed` rad/s), never a snap, and it does not turn into a
//    wall (a step of the turn that would cut the arm short is not taken).
// The only thing that is not smoothed is the last check, that the camera never stands inside anything; where it cuts the arm short, the
// arm's length is taken from it, so that it comes out again slowly rather than the next frame.
//
// The solver knows no THREE and no scene. A `world` says what is in the way: `reach(from, dir, length, radius)` is how far a ball of
// that radius, set going from `from` along the unit `dir`, gets before it touches anything (up to `length`); `pivot(point, radius)`
// (optional) moves the start of the arm out of anything it is inside (a man against a wall). Positions are [x, y, z];
// angles radians: the camera stands at target + (cos pitch cos yaw, sin pitch, cos pitch sin yaw) * distance (render.js placeCamera). The arm runs from a
// `subject` (the man: his chest, not the smoothed point the camera looks at, which lags behind him and may be round a corner from him) to that wanted place.

import { spring } from './followcam.js';

export const ARM = {
  // m: the ball swept from the man to the camera. The hard one (the last check) is the camera's own: near plane 0.2 m, and its corners (with a wide
  // screen) 0.27 m out. The soft one (what the arm settles on) is a little bigger, so that the hard check is seldom what stops it; the held one is the
  // dead band's far side.
  hardRadius: 0.3,
  radius: 0.42,
  held: 0.58,
  // m: the nearest it comes to the look point as things are (the hard check may take it nearer: a man with his back to a gate), and the nearest of all (the start of the arm is itself kept 0.3 m off the walls).
  nearest: 0.45,
  closest: 0.12,
  // m: an arm this long is as good as any longer, and one shorter than `tooClose` has the camera on top of him (m of score lost per m short, `closeCost`).
  comfort: 3.2,
  tooClose: 1.3,
  closeCost: 3,
  // The other directions the arm may try, as offsets of yaw and of pitch (rad) from the wanted one, and what each costs (m of arm per rad off).
  yawSteps: [0.3, -0.3, 0.6, -0.6, 1.0, -1.0, 1.6, -1.6],
  pitchSteps: [0, 0.25, 0.5, -0.15, -0.3, -0.5],
  yawCost: 1.6,
  pitchUpCost: 2.5,
  pitchDownCost: 1.4,
  // m of score the direction kept has over another, and s it is kept at least once taken (unless it leaves him nearer than `tooClose`).
  sticky: 0.6,
  hold: 0.5,
  // The pitch the camera is kept between (rad): never top-down, and under him by no more than a stair needs (the camera behind a man going up a flight stands lower
  // than he does: the flight falls away behind him at 0.46 rad, and a ceiling over it follows the slope).
  pitchMin: -0.3,
  pitchMax: 1.0,
  // rad/s: the springs of the arm's length in and out (critically damped), m/s: the fastest it comes out; s: how long the way is clear before it begins to come out.
  pullIn: 11,
  letOut: 3,
  outSpeed: 3,
  quiet: 0.3,
  // rad/s: the spring of the arm's turn to another direction, and the fastest it turns; m: a step of the turn that would cut the arm shorter than this is not taken.
  turnRate: 7,
  turnSpeed: 3.5,
  turnGuard: 0.3,
  // rad/s: the spring that closes a blocked sight line (the camera's ball in the open), and s: the longest it may stay blocked.
  blockRate: 18,
  blockMost: 0.3,
};

const between = (value, low, high) => Math.max(low, Math.min(high, value));

/** The unit vector from the look point to the camera. */
export const armDirection = (yaw, pitch) => [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)];

/**
 * A spring arm. `solve(input, world, dt, { free })`: `input` { target, subject, yaw, pitch, distance } is the wanted camera (`distance` m from `target` along yaw and pitch: the camera looks at
 * `target`); `subject` (default `target`) is what the arm is kept clear from: the man it is there to see; returns { position, yaw, pitch, distance, pulled } for the camera that is clear: `pulled` m shorter than wanted. `free`: the player
 * has the view in his hand (he is turning it): the arm only shortens, it does not choose another direction.
 * `reset()`: the next solve starts at once where the arm should be (a new place, a cut).
 */
export function createArm(spec = ARM) {
  const arm = { ready: false, deficit: 0, deficitV: 0, yaw: 0, pitch: 0, yawV: 0, pitchV: 0, slack: 0, key: '0:0', kept: 0, blocked: 0 };

  function reset() {
    arm.ready = false;
  }

  /** The score of a direction: the arm's length (up to `comfort`) less what it costs to turn away from the wanted view, the one kept favoured. */
  function score(length, dy, dp, key, comfort) {
    const useful = Math.min(length, comfort);
    const short = length < spec.tooClose ? (spec.tooClose - length) * spec.closeCost : 0;
    const turned = Math.abs(dy) * spec.yawCost + (dp > 0 ? dp * spec.pitchUpCost : -dp * spec.pitchDownCost);
    return useful - short - turned + (key === arm.key ? spec.sticky : 0);
  }

  /**
   * The best direction when the wanted one leaves less than `comfort`: { dy, dp, low, high, key }, its offsets and the arm's length for the arm's ball
   * and for the bigger held ball. The direction kept is kept while it is young (`hold`) and does not leave him too close.
   */
  function chooseWay(reach, wanted, lowAhead, highAhead) {
    const comfort = Math.min(wanted, spec.comfort);
    let best = { dy: 0, dp: 0, low: lowAhead, high: highAhead, key: '0:0', value: score(lowAhead, 0, 0, '0:0', comfort) };
    let kept = best.key === arm.key ? best : null;
    for (const dp of spec.pitchSteps) {
      for (const dy of [0, ...spec.yawSteps]) {
        if (dy === 0 && dp === 0) continue;
        const length = Math.min(wanted, reach(dy, dp, wanted, spec.radius));
        const key = `${dy}:${dp}`;
        const way = { dy, dp, low: length, high: length, key, value: score(length, dy, dp, key, comfort) };
        if (key === arm.key) kept = way;
        if (way.value > best.value) best = way;
      }
    }
    if (kept && kept !== best && arm.kept < spec.hold && kept.low >= spec.tooClose) best = kept;
    if (best.key !== '0:0') best.high = Math.min(wanted, reach(best.dy, best.dp, wanted, spec.held));
    return best;
  }

  function solve(input, world, dt, { free = false } = {}) {
    dt = between(dt, 0, 0.1);
    const { target } = input;
    const open = armPosition(target, input.yaw, input.pitch, input.distance);
    if (!world || !(input.distance > 0)) return { position: open, yaw: input.yaw, pitch: input.pitch, distance: input.distance, pulled: 0 };
    // The arm runs from the subject (the man: his chest) to the wanted camera, whatever the camera is looking at (the look point lags him, and may be round a corner from him).
    const subject = input.subject ?? target;
    const wanted = Math.hypot(open[0] - subject[0], open[1] - subject[1], open[2] - subject[2]);
    if (!(wanted > 1e-6)) return { position: open, yaw: input.yaw, pitch: input.pitch, distance: input.distance, pulled: 0 };
    const yaw = Math.atan2(open[2] - subject[2], open[0] - subject[0]);
    const pitch = Math.asin(between((open[1] - subject[1]) / wanted, -1, 1));
    const pivot = world.pivot ? world.pivot(subject, spec.hardRadius) : subject;
    const pitchOf = (dp) => between(pitch + dp, spec.pitchMin, spec.pitchMax);
    const reach = (dy, dp, length, radius) => world.reach(pivot, armDirection(yaw + dy, pitchOf(dp)), length, radius);

    // The wanted direction first: what is in the way of a ball just bigger than the arm's, and of the arm's own.
    let goal = { dy: 0, dp: 0, low: wanted, high: wanted, key: '0:0' };
    const held = reach(0, 0, wanted, spec.held);
    if (held < wanted) {
      const low = reach(0, 0, wanted, spec.radius);
      goal = { dy: 0, dp: 0, low, high: held, key: '0:0' };
      // Shorter than the arm is worth (a corridor the view is not square to, a roof, a wall behind him): look for a better way.
      // (A direction taken a moment ago is not given up for the wanted one the moment that is fair: it too is held for `hold` s.)
      if (!free && (low < Math.min(wanted, spec.comfort) || (arm.key !== '0:0' && arm.kept < spec.hold))) goal = chooseWay(reach, wanted, low, held);
    }

    // Smooth it. The arm's length is kept as how much shorter than wanted it is, so that a wanted distance that moves by itself (a zoom, a lock-on)
    // passes through at once, and only what the walls took is slow to come back.
    const mustDeficit = Math.max(0, wanted - goal.low);
    const mayDeficit = Math.max(0, wanted - goal.high);
    if (!arm.ready) {
      Object.assign(arm, { ready: true, deficit: mustDeficit, deficitV: 0, yaw: goal.dy, pitch: goal.dp, yawV: 0, pitchV: 0, slack: 0, key: goal.key, kept: 0, blocked: 0 });
    } else {
      arm.kept = goal.key === arm.key ? arm.kept + dt : 0;
      arm.key = goal.key;
      // In at once (a spring, not a step); out only after the way has been clear (for the bigger ball) for `quiet` s, and slowly.
      const inward = arm.deficit < mustDeficit - 1e-4;
      const roomy = arm.deficit > mayDeficit + 1e-4;
      arm.slack = roomy && !inward ? arm.slack + dt : 0;
      if (inward) [arm.deficit, arm.deficitV] = spring(arm.deficit, Math.max(0, arm.deficitV), mustDeficit, spec.pullIn, dt);
      else if (arm.slack >= spec.quiet) {
        [arm.deficit, arm.deficitV] = spring(arm.deficit, Math.min(0, arm.deficitV), mayDeficit, spec.letOut, dt);
        arm.deficitV = Math.max(arm.deficitV, -spec.outSpeed);
      } else if (!arm.blocked) arm.deficitV = 0;
      // (Held: no motion; but a blocked sight line's spring, below, keeps its way.)
      // The turn: towards the direction chosen, sprung, no faster than `turnSpeed`; a step that would cut the arm short is not taken.
      const [yawNext, yawV] = spring(arm.yaw, arm.yawV, goal.dy, spec.turnRate, dt);
      const [pitchNext, pitchV] = spring(arm.pitch, arm.pitchV, goal.dp, spec.turnRate, dt);
      const most = spec.turnSpeed * dt;
      const turned = [arm.yaw + between(yawNext - arm.yaw, -most, most), arm.pitch + between(pitchNext - arm.pitch, -most, most)];
      const length = Math.max(spec.nearest, wanted - arm.deficit);
      const now = reach(arm.yaw, arm.pitch, length, spec.hardRadius);
      const next = reach(turned[0], turned[1], length, spec.hardRadius);
      if (next >= Math.min(now, length) - spec.turnGuard || free) {
        arm.yawV = between(yawV, -spec.turnSpeed, spec.turnSpeed);
        arm.pitchV = between(pitchV, -spec.turnSpeed, spec.turnSpeed);
        [arm.yaw, arm.pitch] = turned;
      } else {
        arm.yawV = 0;
        arm.pitchV = 0;
      }
    }

    // The last check: never in anything. The sight line from him blocked with the camera's ball in the open (the corner he runs round comes
    // between them, a jamb as he goes through a door): closed by a fast spring (`blockRate`), not a cut, for at most `blockMost` s. The ball in
    // a wall, a roof, a floor (or the sight line blocked for longer, or no saying where a ball is free): the arm is cut at once to where the
    // sight line is clear, and takes that length as its own, to come out again slowly.
    const dy = arm.yaw;
    const dp = arm.pitch;
    const finalPitch = pitchOf(dp);
    const direction = armDirection(yaw + dy, finalPitch);
    const at = (length) => [pivot[0] + direction[0] * length, pivot[1] + direction[1] * length, pivot[2] + direction[2] * length];
    let length = Math.max(spec.nearest, wanted - arm.deficit);
    const sight = Math.max(spec.closest, reach(dy, dp, length, spec.hardRadius));
    if (sight < length - 1e-4) {
      arm.blocked += dt;
      if (world.free && arm.blocked <= spec.blockMost) {
        [arm.deficit, arm.deficitV] = spring(arm.deficit, Math.max(0, arm.deficitV), wanted - sight, spec.blockRate, dt);
        length = Math.max(spec.nearest, wanted - arm.deficit);
      }
      if (length > sight + 1e-4 && !(world.free?.(at(length), spec.hardRadius) && arm.blocked <= spec.blockMost)) {
        length = sight;
        arm.deficit = Math.max(arm.deficit, wanted - length);
        arm.deficitV = 0;
      }
    } else arm.blocked = 0;
    const position = at(length);
    return { position, yaw: yaw + dy, pitch: finalPitch, distance: length, pulled: wanted - length };
  }

  return { solve, reset, state: arm };
}

/** Where the camera stands at `distance` from `target` along `yaw` and `pitch`. */
export function armPosition(target, yaw, pitch, distance) {
  const direction = armDirection(yaw, pitch);
  return [target[0] + direction[0] * distance, target[1] + direction[1] * distance, target[2] + direction[2] * distance];
}

/**
 * A world from a test of where the camera may stand: `room(x, z, y)` true inside (the Colosseum's oval, the subway's wall). The arm is
 * walked out along its line and bisected where it leaves.
 */
export function roomWorld(room) {
  return {
    free: (point) => room(point[0], point[2], point[1]),
    reach(from, dir, length) {
      const at = (d) => room(from[0] + dir[0] * d, from[2] + dir[2] * d, from[1] + dir[1] * d);
      if (at(length)) return length;
      let inside = 0;
      let outside = length;
      for (let pass = 0; pass < 10; pass += 1) {
        const middle = (inside + outside) / 2;
        if (at(middle)) inside = middle;
        else outside = middle;
      }
      return inside;
    },
  };
}

/** Several worlds as one: the arm is as short as the shortest says, the look point moved out by each in turn. */
export function joinWorlds(...worlds) {
  const list = worlds.filter(Boolean);
  return {
    reach: (from, dir, length, radius) => list.reduce((reach, world) => Math.min(reach, world.reach(from, dir, reach, radius)), length),
    pivot: (point, radius) => list.reduce((at, world) => (world.pivot ? world.pivot(at, radius) : at), point),
    // (Only if each can say: the voxels of a battle's scenery cannot, and there the sight line is the camera's limit.)
    ...(list.every((world) => world.free) ? { free: (point, radius) => list.every((world) => world.free(point, radius)) } : {}),
  };
}
