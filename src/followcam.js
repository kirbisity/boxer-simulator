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
  // The lag of the anchor and of the look point's spring (a man running 7 m/s was 1.4 m ahead of what the view looked at, and the camera
  // 5.6 m behind him) is made up, `leadShare` of it, by his velocity on the floor: smoothed over `velocitySeconds` (the sway of his steps is
  // not in it), at most `leadMost` m. Not while he is down (a body thrown about has no way it goes). A man who stops is not overshot by more
  // than a hand's breadth: the velocity eases out with him.
  leadShare: 0.75,
  velocitySeconds: 0.2,
  leadMost: 1.5,
  // The arm's subject (cameraarm.js: what it is kept clear from) is his chest, where he is, but its height smoothed over `subjectSeconds`
  // (the bob of a run's stride), never more than `subjectMost` m off.
  subjectSeconds: 0.15,
  subjectMost: 0.25,
  // rad/s: how fast (natural frequency of the springs) the look point, the distance and the pitch follow.
  targetRate: 7,
  distanceRate: 3,
  pitchRate: 3.5,
  // rad/s: how fast the view comes round behind him standing, walking free, and locked on.
  turnRate: 2.4,
  walkTurnRate: 0.9,
  lockTurnRate: 3,
  // rad/s: the fastest the view comes round by itself (the player's own drag of it is his).
  turnMost: 2.2,
  // s: the low-pass on the way he faces; rad: a turn smaller than this leaves the view where it is.
  facingSeconds: 0.35,
  deadBand: 0.3,
  // Running (run mode, free of a lock): the view eases round behind the way he runs, with no dead band. `rate` rad/s of spring
  // frequency at a standstill, plus `perSpeed` for each m/s he runs (4.2 m/s: 3.7; a 90 degree turn is 90% followed in 0.7 s); a heading that points back at the
  // camera does not swing it round (it fades out between `towardFrom` and `towardTo` rad off the view's own behind-him line, so a man
  // running at the camera is not chased round, and a hairpin is not a spin). The player's own look pauses the following for `pause` s
  // after the last of it (the usual `holdSeconds` is for walking), then it resumes from where he left the view.
  run: { rate: 1.6, perSpeed: 0.5, towardFrom: 2.1, towardTo: 2.75, pause: 1.5 },
  // Locked on: the view aimed `lockAt` of the way to his man, `lockAngle` rad off the line between them, `lockBack` m further back for every m apart.
  lockAt: 0.45,
  lockAngle: 0.55,
  lockBack: 0.6,
  // m: the most of the gap between them the locked view frames. A man locked on further off (across
  // a battle, or from horseback, where the gap opens fast) turns the view to him over the shoulder
  // without backing out to fit him in: the view stays a third-person view of the player.
  lockReach: 3,
  // The player's drag: kept this long (s) after he lets go (shorter locked on), then eased back.
  holdSeconds: 3,
  lockHoldSeconds: 1.2,
  // His zoom: a share of the distance, within these.
  zoomMin: 0.5,
  zoomMax: 2.2,
  // The pitch he may drag to (rad).
  pitchMin: -0.05,
  pitchMax: 1.2,
  // A narrow screen (a phone held upright) shows little across: the view stands back until this
  // much (m) either side of what it looks at is in the picture, and the shoulder offset is at most
  // this share of it, so that he stays in frame. The camera's vertical field of view (degrees).
  minHalfWidth: 1.1,
  shoulderShare: 0.3,
  // Hemmed in (the arm, cameraarm.js, left less than `roomFrom` of its length the frame before; none of the shoulder offset under `roomTo`), the view
  // comes in behind him instead of over his shoulder, and the lazy follow's dead band closes: in a drain 3.2 m wide a camera over his shoulder,
  // or left 15 degrees off his way, touches the wall; behind him it does not. Smoothed over `roomSeconds`.
  roomFrom: 0.95,
  roomTo: 0.6,
  roomSeconds: 0.5,
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

/** `value` kept under `most` in size, eased into from 0.6 of it (below that it is untouched). */
function softCap(value, most) {
  const knee = most * 0.6;
  const size = Math.abs(value);
  return size <= knee ? value : Math.sign(value) * (knee + (most - knee) * Math.tanh((size - knee) / (most - knee)));
}

/** A first-order low-pass of `value` towards `goal` over `seconds`. */
const lowPass = (value, goal, seconds, dt) => value + (goal - value) * (1 - Math.exp(-dt / Math.max(1e-4, seconds)));

/** The way behind a man facing `yaw` (he faces (cos yaw, −sin yaw) on the floor): the camera's orbit yaw. */
export const behindYaw = (yaw) => Math.atan2(Math.sin(yaw), -Math.cos(yaw));

/** The spring rate (rad/s) at which the view comes round behind a man running `speed` m/s (FOLLOW_CAM.run). */
export function runFollowRate(speed, spec = FOLLOW_CAM) {
  return spec.run.rate + spec.run.perSpeed * Math.max(0, speed);
}

/**
 * Where the view heads while he runs: from the view's yaw `yaw` towards behind-him (`facing` his yaw), the whole way for a heading
 * within `towardFrom` of the view's own line, none at all past `towardTo` (he runs at the camera), smoothly between.
 */
export function runFollowGoal(yaw, facing, spec = FOLLOW_CAM) {
  const off = wrap(behindYaw(facing) - yaw);
  const { towardFrom, towardTo } = spec.run;
  const share = Math.max(0, Math.min(1, (towardTo - Math.abs(off)) / (towardTo - towardFrom)));
  return yaw + off * share * share * (3 - 2 * share);
}

/**
 * A follow camera. Returns { update, look, zoom, reset, state }.
 */
export function createFollowCam(spec = FOLLOW_CAM) {
  const cam = { ready: false };

  function reset() {
    cam.ready = false;
    cam.manualUntil = -Infinity;
    cam.lastLook = -Infinity;
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
    cam.last = anchor.slice();
    cam.velocity = [0, 0, 0];
    cam.lead = 0;
    cam.subjectY = anchor[1];
    cam.room = 1;
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
   * foe: [x, y, z] (the man locked on's pelvis, or null), moving (walking free), running (in run mode) and speed (m/s, for the
   * run's follow), velocity ([x, y, z] m/s, his walk's: optional, else it is read from the pelvis), room (the share of the arm the walls left
   * the frame before: 1 in the open), aspect (the screen's width over height) },
   * `now` (s, real time) and `dt` (s). Returns { target, yaw, pitch, distance, subject }: the orbit, and for the arm (cameraarm.js)
   * the point it is kept clear from (his chest).
   */
  function update(input, now, dt) {
    if (!cam.ready) place(input);
    dt = Math.max(0, Math.min(0.1, dt));
    // His velocity on the floor, smoothed; the share of it that leads the anchor and the look point (none while he is down).
    const { me } = input;
    // (His walk's own velocity, `input.velocity`, if it is given: the pelvis's surges with each stride and sways side to side, the walk does not.)
    if (dt > 0) {
      for (const axis of [0, 2]) {
        const raw = input.velocity ? input.velocity[axis] : (me[axis] - cam.last[axis]) / dt;
        cam.velocity[axis] = lowPass(cam.velocity[axis], Math.max(-12, Math.min(12, raw)), spec.velocitySeconds, dt);
      }
      cam.last = me.slice();
    }
    cam.lead = lowPass(cam.lead, input.down ? 0 : spec.leadShare, spec.velocitySeconds, dt);
    const speed = Math.hypot(cam.velocity[0], cam.velocity[2]);
    const leadOf = (seconds) => {
      const scale = cam.lead * Math.min(seconds, spec.leadMost / Math.max(speed, 1e-6));
      return [cam.velocity[0] * scale, 0, cam.velocity[2] * scale];
    };
    // The anchor: his pelvis, smoothed (more so while he is down), its lag made up by the lead.
    const smooth = input.down ? spec.downSeconds : spec.anchorSeconds;
    const ahead = leadOf(smooth);
    for (let axis = 0; axis < 3; axis += 1) cam.anchor[axis] = lowPass(cam.anchor[axis], me[axis] + ahead[axis], smooth, dt);
    // The arm's subject: his chest where he is, its height without the bob.
    cam.subjectY = lowPass(cam.subjectY, me[1], spec.subjectSeconds, dt);
    cam.subjectY = Math.max(me[1] - spec.subjectMost, Math.min(me[1] + spec.subjectMost, cam.subjectY));
    // How hemmed in the arm was (1: not at all): the shoulder offset and the dead band of the lazy follow go with it.
    cam.room = lowPass(cam.room, Math.max(0, Math.min(1, ((input.room ?? 1) - spec.roomTo) / (spec.roomFrom - spec.roomTo))), spec.roomSeconds, dt);
    const locked = Boolean(input.foe);
    if (locked) {
      if (!cam.foe) cam.foe = input.foe.slice();
      for (let axis = 0; axis < 3; axis += 1) cam.foe[axis] = lowPass(cam.foe[axis], input.foe[axis], spec.anchorSeconds, dt);
    } else cam.foe = null;
    // Running free, the player's look holds the view only `run.pause` s; otherwise `holdSeconds` after it.
    const running = Boolean(input.running) && !locked && !input.down;
    const manual = now < (running ? Math.min(cam.manualUntil, cam.lastLook + spec.run.pause) : cam.manualUntil);
    // Where the view wants to be: behind him (lazily), or on the line from his man.
    let goalYaw;
    let followRate = 0;
    cam.following = running && !manual;
    if (cam.following) {
      // Running: round behind the way he runs, the rate rising with his speed; what is left of a lazier goal is kept up with it.
      goalYaw = runFollowGoal(cam.yaw, input.facing, spec);
      followRate = runFollowRate(input.speed ?? 0, spec);
      cam.facing = behindYaw(input.facing);
      cam.goalYaw = goalYaw;
    } else if (locked) {
      goalYaw = Math.atan2(cam.anchor[2] - cam.foe[2], cam.anchor[0] - cam.foe[0]) + spec.lockAngle;
      cam.facing = goalYaw;
    } else {
      if (!input.down) cam.facing += wrap(behindYaw(input.facing) - cam.facing) * (1 - Math.exp(-dt / spec.facingSeconds));
      // Within the dead band of where the view is going, a turn leaves it be; past it, the goal is dragged along.
      const off = wrap(cam.facing - cam.goalYaw);
      const band = spec.deadBand * cam.room;
      if (Math.abs(off) > band) cam.goalYaw = wrap(cam.goalYaw + off - Math.sign(off) * band);
      goalYaw = cam.goalYaw;
    }
    if (manual) goalYaw = cam.manualYaw;
    else if (!locked && !running && cam.wasManual) {
      // His look let go: the view comes back from where he left it.
      cam.goalYaw = cam.facing;
      goalYaw = cam.goalYaw;
    }
    cam.wasManual = manual;
    const rate = followRate || (locked ? spec.lockTurnRate : input.moving ? spec.walkTurnRate : spec.turnRate);
    // The yaw spring runs on the unwrapped angle nearest the goal.
    const nearGoal = cam.yaw + wrap(goalYaw - cam.yaw);
    if (!manual) {
      // (No faster than `turnMost` rad/s, eased into: a hairpin at a sprint swings the view round, it does not whip it.)
      const [yaw, yawV] = spring(cam.yaw, cam.yawV, nearGoal, rate, dt);
      if (dt > 0) cam.yaw += softCap((yaw - cam.yaw) / dt, spec.turnMost) * dt;
      cam.yawV = softCap(yawV, spec.turnMost);
    }
    const goalPitch = manual ? cam.manualPitch : spec.pitch;
    if (!manual) [cam.pitch, cam.pitchV] = spring(cam.pitch, cam.pitchV, goalPitch, spec.pitchRate, dt);
    // What it looks at: over his shoulder (to the view's right), or between the two men.
    const right = [Math.sin(cam.yaw), -Math.cos(cam.yaw)];
    const across = (input.aspect ?? 16 / 9) * Math.tan(((spec.fov / 2) * Math.PI) / 180);
    // How far back: further, the further apart they stand; his zoom (the walls come after).
    const gap = locked ? Math.hypot(cam.foe[0] - cam.anchor[0], cam.foe[2] - cam.anchor[2]) : 0;
    const apart = Math.min(gap, spec.lockReach);
    const halfWidth = locked ? spec.lockMargin + apart * 0.5 : spec.minHalfWidth;
    const wanted = Math.max(spec.distance + apart * spec.lockBack, halfWidth / across) * cam.zoom;
    if (cam.distance === null) cam.distance = wanted;
    const shoulder = Math.min(spec.shoulder, cam.distance * across * spec.shoulderShare) * cam.room;
    const height = cam.anchor[1] + spec.aboveHips;
    const goalTarget = locked
      ? [cam.anchor[0] + ((cam.foe[0] - cam.anchor[0]) / Math.max(gap, 1e-6)) * apart * spec.lockAt, height, cam.anchor[2] + ((cam.foe[2] - cam.anchor[2]) / Math.max(gap, 1e-6)) * apart * spec.lockAt]
      : [cam.anchor[0] + right[0] * shoulder, height, cam.anchor[2] + right[1] * shoulder];
    // (The look point's spring lags a moving goal by 2 / rate s of its motion: so much of it is led.)
    const led = leadOf(2 / spec.targetRate);
    for (let axis = 0; axis < 3; axis += 1) goalTarget[axis] += led[axis];
    if (!cam.target) cam.target = goalTarget.slice();
    for (let axis = 0; axis < 3; axis += 1) [cam.target[axis], cam.targetV[axis]] = spring(cam.target[axis], cam.targetV[axis], goalTarget[axis], spec.targetRate, dt);
    // The distance eases to it. (What stands in its way is not the follow camera's to know: cameraarm.js pulls the camera in.)
    [cam.distance, cam.distanceV] = spring(cam.distance, cam.distanceV, wanted, spec.distanceRate, dt);
    return {
      target: cam.target.slice(),
      yaw: cam.yaw,
      pitch: cam.pitch,
      distance: cam.distance,
      subject: [me[0], cam.subjectY + spec.aboveHips, me[2]],
    };
  }

  /** The player turns the view (rad of yaw and pitch): kept until `holdSeconds` after the last of it. */
  function look(dyaw, dpitch, now, locked = false) {
    if (!cam.ready) return;
    if (now >= cam.manualUntil || cam.following) {
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
    cam.lastLook = now;
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
