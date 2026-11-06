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
  // Locked on a man further off than `from` m (all of it from `to` m: an archer's mark, a horse archer's, a man across a battle), the view
  // is not backed out to fit him: it stands `distance` m behind the player (his zoom and a narrow screen's `minHalfWidth` as ever), `pitch`
  // rad above him, turned off the line to his man just so far that, aimed between the two, the player stands `third` of the half-frame off
  // its middle on one side and his man as far on the other (no more than `angleMost` rad off the line). Up and down it is aimed `tilt` of
  // the way from the player's chest to his man's, and turned no further than keeps both inside `margin` of the half-frame. Between `from`
  // and `to` the near framing becomes the far one smoothly (eased in and out).
  lockFar: { from: 3, to: 12, distance: 4.4, pitch: 0.16, third: 0.33, tilt: 0.1, margin: 0.8, angleMost: 0.55 },
  // Looking ahead, moving free (the stick or the keys, walking or running, not locked on, not down): the view turns into where he is going
  // before his body has, as a man looks where he goes. The lead (rad of the view's yaw) is `turn` s of how fast his way of going turns
  // (that way smoothed over `headingSeconds`), plus `intent` of the angle between the way the stick asks and the way he goes (faded out
  // between `intentFrom` and `intentTo` rad: a stick pulled back towards the camera swings nothing), at most `most` rad (eased into). None
  // under `still` m/s, the whole of it from `brisk` m/s, so that standing still it settles back to none. It is eased over `seconds` and
  // changes no faster than `rate` rad/s: a swing, never a whip. The player's own drag of the view stops it at once; it comes back only
  // `pause` s after the last of his drag, from nothing. A visitor who asks for less motion (prefers-reduced-motion) gets `reduced` of it.
  // Its swing gathers and dies away no faster than `accel` rad/s² (a head turning, never a snap at the start or the end of a turn).
  ahead: { turn: 0.55, intent: 0.4, intentFrom: 1.4, intentTo: 2.2, most: 0.5, headingSeconds: 0.25, still: 0.5, brisk: 2.2, seconds: 0.45, rate: 0.7, accel: 2, pause: 1, reduced: 0.4 },
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

const smoothstep = (from, to, value) => {
  const u = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return u * u * (3 - 2 * u);
};

/**
 * How far (rad, of his facing yaw: + turns the view to his left) the view leads where he is going (FOLLOW_CAM.ahead): `heading` the way he
 * goes (a facing yaw), `turnRate` how fast it turns (rad/s), `intent` the way the stick asks (a facing yaw, or null), `speed` m/s.
 */
export function aheadLead({ heading, turnRate = 0, intent = null, speed = 0 }, spec = FOLLOW_CAM) {
  const ahead = spec.ahead;
  const asked = intent === null || intent === undefined ? 0 : wrap(intent - heading);
  const toward = asked * (1 - smoothstep(ahead.intentFrom, ahead.intentTo, Math.abs(asked)));
  return smoothstep(ahead.still, ahead.brisk, speed) * softCap(ahead.turn * turnRate + ahead.intent * toward, ahead.most);
}

/** The unit vector from a look point to the camera (cameraarm.js armDirection; render.js placeCamera). */
const orbitDirection = (yaw, pitch) => [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)];

/** Where an orbit { target, yaw, pitch, distance } puts the camera. */
export function orbitCamera({ target, yaw, pitch, distance }) {
  const out = orbitDirection(yaw, pitch);
  return [target[0] + out[0] * distance, target[1] + out[1] * distance, target[2] + out[2] * distance];
}

/**
 * Where `point` falls in the picture of an orbit (the camera at orbitCamera, looking at its target, up the world's up): [x, y] from −1 to 1
 * across and up the screen, and `ahead` (m in front of the camera; ≤ 0 behind it).
 */
export function framePoint(orbit, point, aspect, spec = FOLLOW_CAM) {
  const eye = orbitCamera(orbit);
  const forward = orbitDirection(orbit.yaw, orbit.pitch).map((value) => -value);
  const right = [-forward[2], 0, forward[0]];
  const rightLength = Math.hypot(right[0], right[2]) || 1;
  right[0] /= rightLength;
  right[2] /= rightLength;
  const up = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
  const off = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const ahead = dot(off, forward);
  const tanV = Math.tan(((spec.fov / 2) * Math.PI) / 180);
  return { x: dot(off, right) / (ahead * tanV * aspect), y: dot(off, up) / (ahead * tanV), ahead };
}

/**
 * The orbit that frames the player and the man he is locked on (FOLLOW_CAM lockAt ... lockFar): `me` and `foe` [x, y, z] (their pelvises,
 * smoothed), `aspect` the screen's width over height, `zoom` the player's. Near: behind him off the line, backed out to fit both, aimed
 * between them. Far: kept near him, turned and aimed so that he is on one side of the picture and his man on the other. Returns
 * { target, yaw, pitch, distance, far } (`far` the share of the far framing).
 */
export function lockFraming({ me, foe, aspect = 16 / 9, zoom = 1 }, spec = FOLLOW_CAM) {
  const far = spec.lockFar;
  const tanV = Math.tan(((spec.fov / 2) * Math.PI) / 180);
  const across = aspect * tanV;
  const gap = Math.hypot(foe[0] - me[0], foe[2] - me[2]);
  const way = gap > 1e-6 ? [(foe[0] - me[0]) / gap, (foe[2] - me[2]) / gap] : [1, 0];
  const line = Math.atan2(-way[1], -way[0]);
  const height = me[1] + spec.aboveHips;
  // Near: behind him, `lockAngle` off the line, aimed `lockAt` of the way to his man, backed out for both.
  const apart = Math.min(gap, spec.lockReach);
  const near = {
    target: [me[0] + way[0] * apart * spec.lockAt, height, me[2] + way[1] * apart * spec.lockAt],
    yaw: line + spec.lockAngle,
    pitch: spec.pitch,
    distance: Math.max(spec.distance + apart * spec.lockBack, (spec.lockMargin + apart * 0.5) / across) * zoom,
  };
  const share = smoothstep(far.from, far.to, gap);
  if (share <= 0) return { ...near, far: 0 };
  // Far: the camera `distance` behind his chest, turned off the line so that, from it, the two men are `third` of the half-frame either side of the middle.
  const chest = [me[0], height, me[2]];
  const mark = [foe[0], foe[1] + spec.aboveHips, foe[2]];
  const back = Math.max(far.distance, spec.minHalfWidth / across) * zoom;
  const flat = back * Math.cos(far.pitch);
  const spread = 2 * Math.atan(far.third * across);
  let angle = spread;
  for (let pass = 0; pass < 6; pass += 1) angle = Math.min(far.angleMost, spread + Math.atan2(flat * Math.sin(angle), gap + flat * Math.cos(angle)));
  const eye = orbitCamera({ target: chest, yaw: line + angle, pitch: far.pitch, distance: back });
  // Aimed across between them; up and down `tilt` of the way from him to his man, kept so that both are inside `margin` of the frame.
  const toMe = Math.atan2(chest[2] - eye[2], chest[0] - eye[0]);
  const toFoe = Math.atan2(mark[2] - eye[2], mark[0] - eye[0]);
  const look = toMe + wrap(toFoe - toMe) / 2;
  const rise = (point) => Math.atan2(point[1] - eye[1], Math.hypot(point[0] - eye[0], point[2] - eye[2]));
  const [meRise, foeRise] = [rise(chest), rise(mark)];
  const room = Math.atan(far.margin * tanV);
  let tilt = meRise + (foeRise - meRise) * far.tilt;
  tilt = Math.min(meRise + room, Math.max(foeRise - room, tilt));
  tilt = Math.max(meRise - room, Math.min(foeRise + room, tilt));
  // As an orbit: the look point on that line as far off as he is, the camera looking back along it.
  const reach = Math.hypot(chest[0] - eye[0], chest[1] - eye[1], chest[2] - eye[2]);
  const ahead = [Math.cos(tilt) * Math.cos(look), Math.sin(tilt), Math.cos(tilt) * Math.sin(look)];
  const farOrbit = {
    target: [eye[0] + ahead[0] * reach, eye[1] + ahead[1] * reach, eye[2] + ahead[2] * reach],
    yaw: look + Math.PI,
    pitch: -tilt,
    distance: reach,
  };
  const mix = (a, b) => a + (b - a) * share;
  return {
    target: near.target.map((value, axis) => mix(value, farOrbit.target[axis])),
    yaw: near.yaw + wrap(farOrbit.yaw - near.yaw) * share,
    pitch: mix(near.pitch, farOrbit.pitch),
    distance: mix(near.distance, farOrbit.distance),
    far: share,
  };
}

/**
 * A follow camera. Returns { update, look, zoom, reset, state }. `reduced`: the visitor asks for less motion (less of the look ahead).
 */
export function createFollowCam(spec = FOLLOW_CAM, { reduced = false } = {}) {
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
    cam.ahead = 0;
    cam.aheadV = 0;
    cam.heading = null;
    cam.turning = 0;
    cam.subjectY = anchor[1];
    cam.room = 1;
    cam.foe = input.foe ? input.foe.slice() : null;
    const framed = input.foe ? lockFraming({ me: anchor, foe: input.foe, aspect: input.aspect, zoom: cam.zoom }, spec) : null;
    cam.facing = framed ? framed.yaw : behindYaw(input.facing);
    cam.goalYaw = cam.facing;
    cam.yaw = cam.goalYaw;
    cam.yawV = 0;
    cam.pitch = framed ? framed.pitch : spec.pitch;
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
   * the frame before: 1 in the open), aspect (the screen's width over height), intent ([x, z] the way the stick or the keys ask him to go, or
   * null: the look ahead's) },
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
    // Locked on: the orbit that frames both (near: backed out for both; far: turned and aimed, not backed out).
    const framed = locked ? lockFraming({ me: cam.anchor, foe: cam.foe, aspect: input.aspect ?? 16 / 9, zoom: cam.zoom }, spec) : null;
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
      goalYaw = framed.yaw;
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
    // Looking ahead: the way he goes (his smoothed velocity's), how fast it turns, and where the stick asks him to go lead the view into
    // the turn (aheadLead), eased and rate-limited; none locked on, down, standing, or until `look.pause` s after the player's own look.
    const look = spec.ahead;
    if (speed > look.still * 0.5 && dt > 0) {
      const heading = Math.atan2(-cam.velocity[2], cam.velocity[0]);
      const turning = cam.heading === null ? 0 : wrap(heading - cam.heading) / dt;
      cam.turning = lowPass(cam.turning, Math.max(-6, Math.min(6, turning)), look.headingSeconds, dt);
      cam.heading = heading;
    } else {
      cam.turning = lowPass(cam.turning, 0, look.headingSeconds, dt);
      if (speed <= look.still * 0.5) cam.heading = null;
    }
    const looksAhead = !locked && !input.down && !manual && (input.moving || running) && now >= cam.lastLook + look.pause && cam.heading !== null;
    const intent = input.intent ? Math.atan2(-input.intent[1], input.intent[0]) : null;
    const lead = looksAhead ? -aheadLead({ heading: cam.heading, turnRate: cam.turning, intent, speed }, spec) * (reduced ? look.reduced : 1) : 0;
    if (dt > 0) {
      // The swing it would have (closing on the lead over `seconds`, no faster than `rate`), reached by an eased swing (`accel`).
      const wanted = Math.max(-look.rate, Math.min(look.rate, (lead - cam.ahead) / look.seconds));
      cam.aheadV += Math.max(-look.accel * dt, Math.min(look.accel * dt, wanted - cam.aheadV));
      cam.ahead += cam.aheadV * dt;
    }
    const shown = cam.yaw + cam.ahead;
    const goalPitch = manual ? cam.manualPitch : framed ? framed.pitch : spec.pitch;
    if (!manual) [cam.pitch, cam.pitchV] = spring(cam.pitch, cam.pitchV, goalPitch, spec.pitchRate, dt);
    // What it looks at: over his shoulder (to the view's right), or between the two men.
    const right = [Math.sin(shown), -Math.cos(shown)];
    const across = (input.aspect ?? 16 / 9) * Math.tan(((spec.fov / 2) * Math.PI) / 180);
    // How far back: locked on, as the framing says (lockFraming); else his zoom, and a narrow screen's room for him (the walls come after).
    const wanted = locked ? framed.distance : Math.max(spec.distance, spec.minHalfWidth / across) * cam.zoom;
    if (cam.distance === null) cam.distance = wanted;
    const shoulder = Math.min(spec.shoulder, cam.distance * across * spec.shoulderShare) * cam.room;
    const height = cam.anchor[1] + spec.aboveHips;
    const goalTarget = locked ? framed.target.slice() : [cam.anchor[0] + right[0] * shoulder, height, cam.anchor[2] + right[1] * shoulder];
    // (The look point's spring lags a moving goal by 2 / rate s of its motion: so much of it is led.)
    const led = leadOf(2 / spec.targetRate);
    for (let axis = 0; axis < 3; axis += 1) goalTarget[axis] += led[axis];
    if (!cam.target) cam.target = goalTarget.slice();
    for (let axis = 0; axis < 3; axis += 1) [cam.target[axis], cam.targetV[axis]] = spring(cam.target[axis], cam.targetV[axis], goalTarget[axis], spec.targetRate, dt);
    // The distance eases to it. (What stands in its way is not the follow camera's to know: cameraarm.js pulls the camera in.)
    [cam.distance, cam.distanceV] = spring(cam.distance, cam.distanceV, wanted, spec.distanceRate, dt);
    return {
      target: cam.target.slice(),
      yaw: shown,
      pitch: cam.pitch,
      distance: cam.distance,
      subject: [me[0], cam.subjectY + spec.aboveHips, me[2]],
    };
  }

  /** The player turns the view (rad of yaw and pitch): kept until `holdSeconds` after the last of it. */
  function look(dyaw, dpitch, now, locked = false) {
    if (!cam.ready) return;
    // (The look ahead is folded into the view he takes hold of: it stops where it was, without a jump.)
    cam.yaw += cam.ahead;
    cam.ahead = 0;
    cam.aheadV = 0;
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
