// The third-person camera that follows the man played: over his right
// shoulder, behind him, or (locked on) on both men. It follows a smoothed
// anchor, not his body: the pelvis of a simulated body bobs, sways and
// jolts with every step and blow, and a camera tied to it shakes. Every
// motion is a critically damped spring (no overshoot, no wobble), stepped
// by the frame's dt, so the feel is the same at any frame rate. The way he
// faces is followed lazily: small turns (his stance, a cut) leave the view
// where it is; down on the floor the view holds its heading. The player's
// own drag of the view is kept for `holdSeconds`, then eases back. No DOM
// and no THREE: positions are [x, y, z], angles radians.

export const FOLLOW_CAM = {
  // m behind, rad above, m over the hips the view looks, m to the right of him (the view's right).
  distance: 4.2,
  pitch: 0.26,
  aboveHips: 0.45,
  shoulder: 0.55,
  // s: the low-pass on the pelvis the view is anchored to (the bob of steps and blows is shorter).
  anchorSeconds: 0.18,
  // Down (or getting up): the anchor is smoothed this much more, and the heading held.
  downSeconds: 0.45,
  // rad/s: how fast (natural frequency of the springs) the look point, the distance and the pitch follow.
  targetRate: 7,
  distanceRate: 3,
  pitchRate: 3.5,
  // rad/s: how fast the view comes round behind him standing, walking free, and locked on.
  turnRate: 2.4,
  walkTurnRate: 0.9,
  lockTurnRate: 3,
  // s: the low-pass on the way he faces; rad: a turn smaller than this leaves the view where it is.
  facingSeconds: 0.35,
  deadBand: 0.3,
  // Locked on: the view aimed `lockAt` of the way to his man, `lockAngle` rad off the line between them, `lockBack` m further back for every m apart.
  lockAt: 0.45,
  lockAngle: 0.55,
  lockBack: 0.6,
  // The player's drag: kept this long (s) after he lets go (shorter locked on), then eased back.
  holdSeconds: 3,
  lockHoldSeconds: 1.2,
  // His zoom: a share of the distance, within these.
  zoomMin: 0.5,
  zoomMax: 2.2,
  // The pitch he may drag to (rad).
  pitchMin: -0.05,
  pitchMax: 1.2,
  // Nearer than this (m) the view does not come in for a wall; it eases back out at `distanceRate`.
  nearest: 1.4,
  // A narrow screen (a phone held upright) shows little across: the view stands back until this
  // much (m) either side of what it looks at is in the picture, and the shoulder offset is at most
  // this share of it, so that he stays in frame. The camera's vertical field of view (degrees).
  minHalfWidth: 1.1,
  shoulderShare: 0.3,
  // Locked on: both men in the picture, with this much (m) to spare beyond each.
  lockMargin: 0.5,
  fov: 40,
};

const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** One step of a critically damped spring towards `goal`: [value, velocity]. Exact for any dt. */
export function spring(value, velocity, goal, rate, dt) {
  const decay = Math.exp(-rate * dt);
  const off = value - goal;
  const push = (velocity + rate * off) * dt;
  return [goal + (off + push) * decay, (velocity - rate * push) * decay];
}

/** A first-order low-pass of `value` towards `goal` over `seconds`. */
const lowPass = (value, goal, seconds, dt) => value + (goal - value) * (1 - Math.exp(-dt / Math.max(1e-4, seconds)));

/** The way behind a man facing `yaw` (he faces (cos yaw, −sin yaw) on the floor): the camera's orbit yaw. */
export const behindYaw = (yaw) => Math.atan2(Math.sin(yaw), -Math.cos(yaw));

/**
 * A follow camera. `room(x, z)` (optional) says whether the camera may
 * stand there (inside the walls); outside, it comes in along its line.
 * Returns { update, look, zoom, reset, state }.
 */
export function createFollowCam(spec = FOLLOW_CAM, { room = null } = {}) {
  const cam = { ready: false };

  function reset() {
    cam.ready = false;
    cam.manualUntil = -Infinity;
    cam.zoom = 1;
  }
  reset();

  /**
   * Start where the view would settle, at once (a new bout, play just begun): behind him, at the
   * follow distance. Nothing is carried over from the view before (the watching camera may have
   * been 26 m out over an army, aimed at its middle): the first frame lands the view on him.
   */
  function place(input) {
    const anchor = input.me.slice();
    cam.anchor = anchor;
    cam.foe = input.foe ? input.foe.slice() : null;
    cam.facing = input.foe ? Math.atan2(anchor[2] - input.foe[2], anchor[0] - input.foe[0]) + spec.lockAngle : behindYaw(input.facing);
    cam.goalYaw = cam.facing;
    cam.yaw = cam.goalYaw;
    cam.yawV = 0;
    cam.pitch = spec.pitch;
    cam.pitchV = 0;
    cam.distance = null;
    cam.distanceV = 0;
    cam.target = null;
    cam.targetV = [0, 0, 0];
    cam.ready = true;
  }

  /**
   * One frame. `input`: { me: [x, y, z] (his pelvis), facing (his yaw), down (on the floor or rising),
   * foe: [x, y, z] (the man locked on's pelvis, or null), moving (walking free), aspect (the screen's width over height) },
   * `now` (s, real time) and `dt` (s). Returns { target, yaw, pitch, distance }.
   */
  function update(input, now, dt) {
    if (!cam.ready) place(input);
    dt = Math.max(0, Math.min(0.1, dt));
    // The anchor: his pelvis, smoothed; more so while he is down.
    const smooth = input.down ? spec.downSeconds : spec.anchorSeconds;
    for (let axis = 0; axis < 3; axis += 1) cam.anchor[axis] = lowPass(cam.anchor[axis], input.me[axis], smooth, dt);
    const locked = Boolean(input.foe);
    if (locked) {
      if (!cam.foe) cam.foe = input.foe.slice();
      for (let axis = 0; axis < 3; axis += 1) cam.foe[axis] = lowPass(cam.foe[axis], input.foe[axis], spec.anchorSeconds, dt);
    } else cam.foe = null;
    const manual = now < cam.manualUntil;
    // Where the view wants to be: behind him (lazily), or on the line from his man.
    let goalYaw;
    if (locked) {
      goalYaw = Math.atan2(cam.anchor[2] - cam.foe[2], cam.anchor[0] - cam.foe[0]) + spec.lockAngle;
      cam.facing = goalYaw;
    } else {
      if (!input.down) cam.facing += wrap(behindYaw(input.facing) - cam.facing) * (1 - Math.exp(-dt / spec.facingSeconds));
      // Within the dead band of where the view is going, a turn leaves it be; past it, the goal is dragged along.
      const off = wrap(cam.facing - cam.goalYaw);
      if (Math.abs(off) > spec.deadBand) cam.goalYaw = wrap(cam.goalYaw + off - Math.sign(off) * spec.deadBand);
      goalYaw = cam.goalYaw;
    }
    if (manual) goalYaw = cam.manualYaw;
    else if (!locked && cam.wasManual) {
      // His look let go: the view comes back from where he left it.
      cam.goalYaw = cam.facing;
      goalYaw = cam.goalYaw;
    }
    cam.wasManual = manual;
    const rate = locked ? spec.lockTurnRate : input.moving ? spec.walkTurnRate : spec.turnRate;
    // The yaw spring runs on the unwrapped angle nearest the goal.
    const nearGoal = cam.yaw + wrap(goalYaw - cam.yaw);
    if (!manual) [cam.yaw, cam.yawV] = spring(cam.yaw, cam.yawV, nearGoal, rate, dt);
    const goalPitch = manual ? cam.manualPitch : spec.pitch;
    if (!manual) [cam.pitch, cam.pitchV] = spring(cam.pitch, cam.pitchV, goalPitch, spec.pitchRate, dt);
    // What it looks at: over his shoulder (to the view's right), or between the two men.
    const right = [Math.sin(cam.yaw), -Math.cos(cam.yaw)];
    const across = (input.aspect ?? 16 / 9) * Math.tan(((spec.fov / 2) * Math.PI) / 180);
    // How far back: further, the further apart they stand; his zoom (the walls come after).
    const apart = locked ? Math.hypot(cam.foe[0] - cam.anchor[0], cam.foe[2] - cam.anchor[2]) : 0;
    const halfWidth = locked ? spec.lockMargin + apart * 0.5 : spec.minHalfWidth;
    const wanted = Math.max(spec.distance + apart * spec.lockBack, halfWidth / across) * cam.zoom;
    if (cam.distance === null) cam.distance = wanted;
    const shoulder = Math.min(spec.shoulder, cam.distance * across * spec.shoulderShare);
    const height = cam.anchor[1] + spec.aboveHips;
    const goalTarget = locked
      ? [cam.anchor[0] + (cam.foe[0] - cam.anchor[0]) * spec.lockAt, height, cam.anchor[2] + (cam.foe[2] - cam.anchor[2]) * spec.lockAt]
      : [cam.anchor[0] + right[0] * shoulder, height, cam.anchor[2] + right[1] * shoulder];
    if (!cam.target) cam.target = goalTarget.slice();
    for (let axis = 0; axis < 3; axis += 1) [cam.target[axis], cam.targetV[axis]] = spring(cam.target[axis], cam.targetV[axis], goalTarget[axis], spec.targetRate, dt);
    // The distance eases to it; then no further back than the walls allow.
    [cam.distance, cam.distanceV] = spring(cam.distance, cam.distanceV, wanted, spec.distanceRate, dt);
    const allowed = roomFor(cam.target, cam.yaw, cam.pitch, cam.distance);
    if (allowed < cam.distance) {
      cam.distance = allowed;
      cam.distanceV = Math.min(0, cam.distanceV);
    }
    return { target: cam.target.slice(), yaw: cam.yaw, pitch: cam.pitch, distance: cam.distance };
  }

  /** The furthest the camera may stand back along its line (no nearer than `nearest`). */
  function roomFor(target, yaw, pitch, distance) {
    if (!room) return distance;
    const at = (d) => [target[0] + Math.cos(pitch) * Math.cos(yaw) * d, target[2] + Math.cos(pitch) * Math.sin(yaw) * d];
    if (room(...at(distance))) return distance;
    let inside = spec.nearest;
    let outside = distance;
    for (let pass = 0; pass < 12; pass += 1) {
      const middle = (inside + outside) / 2;
      if (room(...at(middle))) inside = middle;
      else outside = middle;
    }
    return Math.max(spec.nearest, inside);
  }

  /** The player turns the view (rad of yaw and pitch): kept until `holdSeconds` after the last of it. */
  function look(dyaw, dpitch, now, locked = false) {
    if (!cam.ready) return;
    if (now >= cam.manualUntil) {
      cam.manualYaw = cam.yaw;
      cam.manualPitch = cam.pitch;
    }
    cam.manualYaw += dyaw;
    cam.manualPitch = Math.max(spec.pitchMin, Math.min(spec.pitchMax, cam.manualPitch + dpitch));
    cam.yaw = cam.manualYaw;
    cam.pitch = cam.manualPitch;
    cam.yawV = 0;
    cam.pitchV = 0;
    cam.manualUntil = now + (locked ? spec.lockHoldSeconds : spec.holdSeconds);
  }

  /** The player zooms: the distance times 1/ratio (a pinch apart comes in), within its limits. Kept. */
  function zoom(ratio) {
    cam.zoom = Math.max(spec.zoomMin, Math.min(spec.zoomMax, cam.zoom / Math.max(0.2, ratio)));
  }

  return { update, look, zoom, reset, state: cam };
}

/** Where the camera may stand in a place: inside its walls, if it has any (null: anywhere). */
export function cameraRoom(place, arena) {
  // The Colosseum's podium wall is an oval of 10.5 by 7 m; the subway's stair wall stands 0.9 m behind the platform.
  if (place === 'colosseum') return (x, z) => (x / 10.1) ** 2 + (z / 6.6) ** 2 < 1;
  if (place === 'subway') return (x, z) => z > -(arena.halfZ + 0.9) + 0.3;
  return null;
}
