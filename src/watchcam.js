// The camera when watching a fight (not playing): by default it frames
// everyone ('auto'); the viewer can take it over ('free'): zoom in on one man
// or a few, and the camera stays where he put it, following what is there
// as they move. Nothing here knows THREE or the DOM: it moves an orbit
// ({ yaw, pitch, distance, target }) from plain positions.
//
// A man is { id, x, y, z, gone }: his pelvis on the floor (x, z), his neck's
// height (y), and whether he has been out of the fight long enough to be
// left lying.

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
};

export function createWatchCam() {
  return { mode: 'auto', focus: null, anchor: null, anchorFocus: null, reframing: false, spread: 0 };
}

/** The distance that frames every man, `spread` m being the farthest from their middle. */
export function frameDistance(spread) {
  const { base, spreadBase, perSpread } = WATCH_CAM.frame;
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
  cam.reframing = false;
  cam.anchor = null;
}

/** Back to framing everyone (and drawing back to do it). */
export function frameAll(cam) {
  cam.mode = 'auto';
  cam.focus = null;
  cam.anchor = null;
  cam.reframing = true;
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

/** 'Frame all' drawing the distance back to the framing's (the auto mode's own easing does it in a crowd). Returns the new distance. */
export function stepReframe(cam, orbit, spread, dt) {
  if (!cam.reframing) return orbit.distance;
  const to = frameDistance(spread);
  orbit.distance += (to - orbit.distance) * (1 - Math.exp(-WATCH_CAM.reframe * dt));
  if (Math.abs(to - orbit.distance) < to * 0.02) cam.reframing = false;
  return orbit.distance;
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
