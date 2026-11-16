// The camera when watching a fight (not playing): by default it frames
// everyone ('auto'); the viewer can take it over ('free'): zoom in on one man
// or a few, and the camera stays where he put it, following what is there
// as they move. Nothing here knows THREE or the DOM: it moves an orbit
// ({ yaw, pitch, distance, target }) from plain positions.
//
// A man is { id, x, y, z, gone }: his pelvis on the floor (x, z), his neck's
// height (y), and whether he has been out of the fight long enough to be
// left lying.

import { spring } from './followcam.js';

export const WATCH_CAM = {
  // Nearest the camera goes to its target (m): a man's head and shoulders fill the view (a 40 degree lens).
  minDistance: 1.1,
  // The farthest when the field is small (a bigger one is allowed to be seen whole: see zoomLimits).
  maxDistance: 12,
  // The whole field in view takes this much more room than the auto-framing's distance.
  slack: 1.25,
  // Auto-framing's distance: at least `base`, and `perSpread` per metre the men are strewn from their middle, from `spreadBase`.
  frame: { base: 5.2, spreadBase: 3.4, perSpread: 2.2 },
  // How fast (1/s) the camera's target settles on what it follows; the part of its motion that is steady is followed exactly.
  settle: 6,
  // The target moves along with its man at up to this speed (m/s): a horse at a gallop is followed exactly, a man thrown further than that is not.
  carry: 16,
  // How fast (1/s) 'Frame all' draws the camera back to the auto-framing's distance.
  reframe: 3,
  // The target's height against the neck (m): a little above it for a close-up (head and shoulders), `below` m under it from `farFrom` m of distance on (his body whole).
  above: 0.12,
  below: 0.22,
  farFrom: 5,
  // A zoomed-in view follows the men within this share of the distance from where it looks, at least `radiusMin` m, at most `radiusMax`.
  radius: 0.7,
  radiusMin: 2,
  radiusMax: 8,
  // A tap this close (px of movement, ms) is a tap; a second one this soon (ms) after, within `doubleNear` px, a double tap.
  tapMove: 9,
  tapMs: 400,
  doubleMs: 380,
  doubleNear: 34,
  // The camera never goes nearer the ground under it than this (m): it rises over the target instead of sinking through the floor.
  clearance: 0.3,
  // The steepest it rises to stay above the ground (rad): above the target, looking down.
  steepest: 1.45,
  // Auto-framing (stepAuto): what it frames and how it moves. Every rate is a critically damped spring's (1/s), stepped exactly
  // for any frame time, so the camera takes the same path at 30, 60 or 144 frames a second and never overshoots.
  auto: {
    // The look point's height (m): a standing man's middle, as the ringside view always had it.
    height: 1.1,
    // The look point follows the men's middle at this rate: lagging a walking pair by under half a metre (a ramp's lag is
    // 2/rate s), and smoothing the give and take of an exchange, where the middle jumps about by tenths of a metre.
    follow: 4,
    // A man out of the fight (down for good, fled, dormant) leaves the framing over about this long (s), eased: the
    // camera neither jumps when he falls nor keeps framing the dead. A man who comes into the fight enters it as gently.
    leaveSeconds: 3,
    // The men's extent framed: the distance from their middle within which this share of them (by weight) stands. In a
    // fight of a few it is the farthest man; in a crowd a runaway or an archer far back does not pull the whole view out.
    share: 0.9,
    // How far (a share of it) the framing's distance falls below the distance held before the camera comes in. A pair
    // stepping in and out, a man pushed back a pace, moves the wanted distance by 5 to 10 per cent: that is not followed.
    deadBand: 0.15,
    // The distance's springs, on its logarithm (an equal share of the picture each second, near or far): out briskly, so no
    // one walks out of the picture, in slowly, so the view does not breathe with the fight.
    zoomOut: 2.2,
    zoomIn: 0.6,
    // A pair is held at the zoom it opened on until one of them would leave the picture: each man's middle kept this far (m) inside
    // its edge (his shoulders and his weapon arm).
    pairMargin: 0.8,
  },
};

/**
 * Keep an orbit's camera above the ground: raise its pitch (no more than
 * needed) until the camera stands `clearance` m above `groundAt(x, z)` (the
 * floor's height there; flat ground: 0). Returns whether it was raised. The
 * orbit is changed in place, so a drag that keeps pushing down rests at the
 * limit instead of fighting it.
 */
export function orbitAboveGround(orbit, groundAt = () => 0, clearance = WATCH_CAM.clearance) {
  const { yaw, distance, target } = orbit;
  if (!(distance > 0)) return false;
  const heightAt = (pitch) => {
    const out = Math.cos(pitch) * distance;
    const x = target.x + Math.cos(yaw) * out;
    const z = target.z + Math.sin(yaw) * out;
    return { camera: target.y + Math.sin(pitch) * distance, floor: Math.max(0, groundAt(x, z) || 0) + clearance };
  };
  let pitch = orbit.pitch;
  let raised = false;
  // The ground under the camera moves as it rises (a slope): a few passes settle it.
  for (let pass = 0; pass < 4; pass += 1) {
    const { camera, floor } = heightAt(pitch);
    if (camera >= floor - 1e-6) break;
    const lowest = Math.asin(Math.max(-1, Math.min(1, (floor - target.y) / distance)));
    pitch = Math.min(WATCH_CAM.steepest, Math.max(pitch, lowest) + 1e-4);
    raised = true;
  }
  if (raised) orbit.pitch = Math.max(orbit.pitch, pitch);
  return raised;
}

/**
 * A fresh watching camera. `framing` is the auto-framing's own state (stepAuto): null until its first frame, which is a cut
 * (`cut`: a new fight is shown at once where it is, not panned to from the last).
 */
export function createWatchCam() {
  return { mode: 'auto', focus: null, anchor: null, anchorFocus: null, reframing: false, spread: 0, framing: null, cut: true, rest: null, weights: new Map() };
}

/** The distance that frames every man, `spread` m being the farthest from their middle; never under `base` m. */
export function frameDistance(spread, base = WATCH_CAM.frame.base) {
  const { spreadBase, perSpread } = WATCH_CAM.frame;
  return Math.max(base, spreadBase + spread * perSpread);
}

/** How near and how far the viewer may zoom: out to the whole field, in to one man's head and shoulders. */
export function zoomLimits(spread) {
  return { min: WATCH_CAM.minDistance, max: Math.max(WATCH_CAM.maxDistance, frameDistance(spread) * WATCH_CAM.slack) };
}

/** The viewer takes the camera: it stays as he leaves it. */
export function takeCamera(cam) {
  if (cam.mode === 'free') return;
  cam.mode = 'free';
  // (Taken before the auto-framing's first frame: there is no opening shot left to cut to.)
  cam.cut = false;
  cam.reframing = false;
  cam.anchor = null;
}

/** Back to framing everyone (and drawing back to do it). */
export function frameAll(cam) {
  cam.mode = 'auto';
  cam.focus = null;
  cam.anchor = null;
  cam.reframing = true;
  // The auto-framing starts again from where the camera is (stepAuto): drawn back to the men by its springs, not cut.
  cam.framing = null;
}

/** Follow one man (null: whoever is near where the camera looks). */
export function focusOn(cam, id) {
  takeCamera(cam);
  cam.focus = id;
  cam.anchor = null;
}

/** The viewer zooms by `ratio` (more than 1: out): the camera is his now. Returns whether the distance changed. */
export function zoomBy(cam, orbit, ratio, spread) {
  const { min, max } = zoomLimits(spread);
  const to = Math.max(min, Math.min(max, orbit.distance * ratio));
  if (Math.abs(to - orbit.distance) < 1e-6) return false;
  orbit.distance = to;
  takeCamera(cam);
  return true;
}

/** The men a zoomed-in view follows: those within `radius` of (x, z), else the nearest; null if nobody is left. */
function regionOf(men, x, z, radius) {
  const here = men.filter((man) => !man.gone);
  if (!here.length) return null;
  const near = here.filter((man) => Math.hypot(man.x - x, man.z - z) <= radius);
  if (near.length) return near;
  return [here.reduce((best, man) => (Math.hypot(man.x - x, man.z - z) < Math.hypot(best.x - x, best.z - z) ? man : best))];
}

/** The man to follow instead of one who is gone: the nearest still in the fight to where he fell (the focus held if no one is). */
function nextFocus(men, from) {
  const here = men.filter((man) => !man.gone && man.up);
  if (!here.length) return null;
  return here.reduce((best, man) => (Math.hypot(man.x - from.x, man.z - from.z) < Math.hypot(best.x - from.x, best.z - from.z) ? man : best)).id;
}

/** The point a free camera wants to look at, or null: [x, y, z], and who it is following (a man's id or null). */
export function wantedTarget(cam, orbit, men) {
  let followed = cam.focus === null ? undefined : men.find((man) => man.id === cam.focus);
  if (followed?.gone) {
    // Left lying: move on to the nearest man still fighting, if any.
    const id = nextFocus(men, followed);
    if (id === null) return null;
    cam.focus = id;
    cam.anchor = null;
    followed = men.find((man) => man.id === id);
  }
  let group;
  if (followed) group = [followed];
  else {
    // A man who is no longer in the list: the region instead.
    if (cam.focus !== null) cam.focus = null;
    const radius = Math.max(WATCH_CAM.radiusMin, Math.min(WATCH_CAM.radiusMax, orbit.distance * WATCH_CAM.radius));
    group = regionOf(men, orbit.target.x, orbit.target.z, radius);
  }
  if (!group) return null;
  const mean = (key) => group.reduce((sum, man) => sum + man[key] / group.length, 0);
  const far = Math.max(0, Math.min(1, (orbit.distance - WATCH_CAM.minDistance) / (WATCH_CAM.farFrom - WATCH_CAM.minDistance)));
  const lift = WATCH_CAM.above - (WATCH_CAM.above + WATCH_CAM.below) * far;
  return { at: [mean('x'), mean('y') + lift, mean('z')], focus: followed ? followed.id : null };
}

/**
 * One frame of the free camera: the target moves with what it follows, by
 * as much as that moved (a man running at a gallop stays where he is on the
 * screen), and settles the rest of the way (damped: a man knocked down does
 * not snap the view). Auto mode is the caller's: the middle of everyone.
 * `dt` in seconds. Returns whether the camera moved the target.
 */
export function stepFree(cam, orbit, men, dt) {
  if (cam.mode !== 'free') return false;
  const wanted = wantedTarget(cam, orbit, men);
  if (!wanted) return false;
  const [x, y, z] = wanted.at;
  const target = orbit.target;
  // The part of the move that the target would otherwise lag behind by.
  if (cam.anchor && cam.anchorFocus === wanted.focus) {
    const most = WATCH_CAM.carry * dt;
    target.x += Math.max(-most, Math.min(most, x - cam.anchor[0]));
    target.z += Math.max(-most, Math.min(most, z - cam.anchor[2]));
  }
  cam.anchor = wanted.at;
  cam.anchorFocus = wanted.focus;
  const k = 1 - Math.exp(-WATCH_CAM.settle * dt);
  target.x += (x - target.x) * k;
  target.y += (y - target.y) * k;
  target.z += (z - target.z) * k;
  return true;
}

/**
 * The share `share` (0..1) of a weighted list of values: the value under which that share of the weight lies, read between the
 * values (each value standing at the middle of its own weight), so that it moves smoothly as the values and the weights do.
 */
export function weightedShare(values, weights, share) {
  const order = values.map((value, index) => index).filter((index) => weights[index] > 0).sort((a, b) => values[a] - values[b]);
  if (!order.length) return 0;
  const total = order.reduce((sum, index) => sum + weights[index], 0);
  const wanted = share * total;
  let below = 0;
  let last = null;
  for (const index of order) {
    const middle = below + weights[index] / 2;
    if (middle >= wanted) {
      if (!last) return values[index];
      return last.value + ((values[index] - last.value) * (wanted - last.middle)) / Math.max(1e-9, middle - last.middle);
    }
    last = { value: values[index], middle };
    below += weights[index];
  }
  return last.value;
}

/**
 * Each man's weight in the auto-framing, eased (linearly, over `leaveSeconds`) towards 1 while he is in the fight and 0 once he is
 * out of it, so that he leaves and enters the framing gradually. While fewer than two men are still fighting the weights hold:
 * the end of a fight (a knockout, the last man of a battle) is framed with the man who fell in it, not swung onto the winner alone.
 * A man seen the first time starts at his weight; after a cut, everyone does. Returns the weights by the order of `men`.
 */
function framingWeights(cam, men, dt, cut) {
  const fighting = men.filter((man) => man.in).length;
  const step = dt / WATCH_CAM.auto.leaveSeconds;
  return men.map((man) => {
    const goal = man.in ? 1 : 0;
    let weight = cam.weights.get(man.id);
    if (weight === undefined || cut) weight = goal;
    else if (fighting >= 2) weight = goal > weight ? Math.min(goal, weight + step) : Math.max(goal, weight - step);
    cam.weights.set(man.id, weight);
    return weight;
  });
}

/** Smoothstep of a weight, so a man's share of the framing starts and ends with no step in its rate either. */
const framingEase = (weight) => weight * weight * (3 - 2 * weight);

/**
 * The auto-framing's goal: the men's middle (their weighted mean on the floor) and the distance that frames them, from the
 * distance from that middle within which `share` of them stand (weightedShare). `men` [{ id, x, z, in }]: where each stands
 * (pelvis on the floor, never a weapon's tip, a flung limb or an arrow) and whether he is still in the fight.
 */
export function framingGoal(cam, men, dt, cut = false) {
  const weights = framingWeights(cam, men, dt, cut).map(framingEase);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  // Nobody to frame (all gone from the start): the middle of everyone.
  const use = total > 1e-6 ? weights : men.map(() => 1);
  const sum = total > 1e-6 ? total : men.length;
  const middle = [0, 0];
  men.forEach((man, index) => {
    middle[0] += (man.x * use[index]) / sum;
    middle[1] += (man.z * use[index]) / sum;
  });
  const radii = men.map((man) => Math.hypot(man.x - middle[0], man.z - middle[1]));
  const spread = weightedShare(radii, use, WATCH_CAM.auto.share);
  return { middle, spread };
}

/**
 * One frame of the auto-framing: the look point and the distance moved by critically damped springs towards the men's middle and
 * the distance that frames them. The distance:
 *  - for a pair is the zoom they opened on (`rest`) until they would not both fit across the picture; for a crowd, frameDistance of
 *    their extent; never over `furthest`;
 *  - is held inside a dead band: the camera draws back as soon as the men need more room, and comes in only once they need
 *    `deadBand` less than it holds (hysteresis with no step: the goal held slides down at that margin above the wanted one);
 *  - moves on its logarithm, out at `zoomOut` and in at `zoomIn` (1/s).
 * The first frame of a fight is a cut: everything starts where it should be, at rest. Afterwards there is no step and no whip.
 * `men` as framingGoal's; `pair`: a duel's framing (the distance held at its rest unless they need more); `lens` { fov (deg, vertical),
 * aspect } of the camera; `dt` in s. Moves `orbit`.
 */
export function stepAuto(cam, orbit, men, dt, { pair = false, furthest = Infinity, lens = {} } = {}) {
  const spec = WATCH_CAM.auto;
  const cut = cam.cut || !cam.framing;
  const { middle, spread } = framingGoal(cam, men, dt, cam.cut);
  if (cam.cut) cam.rest = pair ? orbit.distance : null;
  // A pair: the zoom it opened on, unless the two would not fit across the picture at it (the lens's half-width, from its
  // vertical angle and the screen's shape). A crowd: the framing's own distance.
  let wanted;
  if (pair && cam.rest !== null) {
    const halfWidth = Math.atan(Math.tan(((lens.fov ?? 40) * Math.PI) / 360) * (lens.aspect ?? 16 / 9));
    wanted = Math.max(cam.rest, (spread + spec.pairMargin) / Math.tan(halfWidth));
  } else wanted = frameDistance(spread);
  wanted = Math.max(WATCH_CAM.minDistance, Math.min(furthest, wanted));
  if (cut) {
    // A new fight shown at once where it is (cam.cut), or the auto-framing taken back from the viewer (Frame all): from where the camera is, at rest.
    const fresh = cam.cut;
    cam.framing = {
      at: fresh ? [middle[0], spec.height, middle[1]] : [orbit.target.x, orbit.target.y, orbit.target.z],
      velocity: [0, 0, 0],
      log: Math.log(fresh ? wanted : Math.max(WATCH_CAM.minDistance, orbit.distance)),
      logVelocity: 0,
      held: wanted,
    };
    cam.cut = false;
  }
  const framing = cam.framing;
  framing.held = Math.max(wanted, Math.min(framing.held, wanted * (1 + spec.deadBand)));
  const goal = [middle[0], spec.height, middle[1]];
  for (let axis = 0; axis < 3; axis += 1) [framing.at[axis], framing.velocity[axis]] = spring(framing.at[axis], framing.velocity[axis], goal[axis], spec.follow, dt);
  const goalLog = Math.log(framing.held);
  const rate = goalLog > framing.log ? spec.zoomOut : spec.zoomIn;
  [framing.log, framing.logVelocity] = spring(framing.log, framing.logVelocity, goalLog, rate, dt);
  orbit.target.x = framing.at[0];
  orbit.target.y = framing.at[1];
  orbit.target.z = framing.at[2];
  orbit.distance = Math.exp(framing.log);
  cam.spread = spread;
  cam.reframing = false;
  return { middle, spread, wanted, held: framing.held };
}

/**
 * The man a tap at (x, y) on the screen is on: `shapes` are [{ id, depth, points: [[x, y], ...] }]
 * (screen points of head, pelvis, feet in that order: a stick figure); the tap is on the nearest stick
 * within `slack` px plus a share of his height; ties go to the nearer to the camera. Null if on none.
 */
export function pickMan(shapes, x, y, slack = 18, share = 0.22) {
  let best = null;
  for (const shape of shapes) {
    const [head, pelvis, ...feet] = shape.points;
    const sticks = [[head, pelvis], ...feet.map((foot) => [pelvis, foot])];
    const apart = Math.min(...sticks.map(([a, b]) => distanceToSegment(x, y, a, b)));
    const height = Math.max(...shape.points.map((p) => Math.abs(p[1] - head[1])));
    const reach = slack + height * share;
    if (apart > reach) continue;
    const score = apart / reach;
    if (!best || score < best.score - 0.15 || (Math.abs(score - best.score) <= 0.15 && shape.depth < best.depth)) best = { id: shape.id, score, depth: shape.depth };
  }
  return best ? best.id : null;
}

function distanceToSegment(px, py, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / length2)) : 0;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

/** Tells a tap from a drag, and a double tap from two taps. Feed it the pointer's events; it returns 'tap', 'double' or null on release. */
export function createTapper() {
  let down = null;
  let last = null;
  return {
    press(x, y, now) {
      down = { x, y, now, moved: false };
    },
    move(x, y) {
      if (down && Math.hypot(x - down.x, y - down.y) > WATCH_CAM.tapMove) down.moved = true;
    },
    /** A second finger, or anything else that makes this not a tap. */
    cancel() {
      down = null;
      last = null;
    },
    release(x, y, now) {
      const press = down;
      down = null;
      if (!press || press.moved || now - press.now > WATCH_CAM.tapMs) return null;
      if (last && now - last.now < WATCH_CAM.doubleMs && Math.hypot(x - last.x, y - last.y) < WATCH_CAM.doubleNear) {
        last = null;
        return { kind: 'double', x, y };
      }
      last = { x, y, now };
      return { kind: 'tap', x, y };
    },
  };
}
