// How far a limb can turn about its own length. An elbow bends one way and a
// knee the other; which way that is in the world depends on how far the
// shoulder or hip has turned the upper bone, and that has a range. A forearm
// or shin pointing where the turn cannot take it is twisted, however the
// hinge itself bends. Shared by the pose (targets within range), the physics
// (limits holding a body to it) and the tools that count what is out of it.
// Ranges: WORLD.limbTwist.

import { WORLD } from './physics/config.js';
import { vec } from './pose.js';

// The arm hangs this far out from the trunk in the rig's bind pose
// (rig.js bindPoints), the leg straight down: turns are measured from there.
const LIMB_BIND = { arm: (25 * Math.PI) / 180, leg: 0 };

/**
 * The trunk's axes from its particles: up the spine, to the left along the
 * shoulders (or `across`, the hips), forward = up × left. Null if degenerate.
 */
export function trunkAxes(pelvis, neck, leftPoint, rightPoint) {
  const up = vec.normalize(vec.sub(neck, pelvis));
  const across = vec.sub(leftPoint, rightPoint);
  const flat = vec.sub(across, vec.scale(up, vec.dot(across, up)));
  const size = vec.length(flat);
  if (size < 1e-6) return null;
  const left = vec.scale(flat, 1 / size);
  return { up, left, forward: vec.cross(up, left) };
}

/** Rotate v about unit `axis` by `angle`. */
export function turnAbout(v, axis, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return vec.add(vec.add(vec.scale(v, cos), vec.scale(vec.cross(axis, v), sin)), vec.scale(axis, vec.dot(axis, v) * (1 - cos)));
}

/** v carried by the smallest rotation taking unit a onto unit b. */
function swingAlong(v, a, b) {
  const axis = vec.cross(a, b);
  const sin = vec.length(axis);
  const cos = vec.dot(a, b);
  if (sin < 1e-6) return cos > 0 ? v : vec.scale(v, -1);
  return turnAbout(v, vec.scale(axis, 1 / sin), Math.atan2(sin, cos));
}

/**
 * A limb's turn about its upper bone. `kind` 'arm' (the forearm flexes
 * forward of the hanging upper arm) or 'leg' (the shin flexes back of the
 * hanging thigh). Returns { twist (rad, + inward), elevation (rad), bend
 * (rad, 0 straight) }, or null where the limb is too straight to say.
 */
export function limbTwist(axes, kind, side, root, middle, end) {
  if (!axes) return null;
  const upper = vec.sub(middle, root);
  const lower = vec.sub(end, middle);
  const upperLength = vec.length(upper);
  const lowerLength = vec.length(lower);
  if (upperLength < 1e-6 || lowerLength < 1e-6) return null;
  const u = vec.scale(upper, 1 / upperLength);
  const f = vec.scale(lower, 1 / lowerLength);
  const bend = Math.acos(Math.max(-1, Math.min(1, vec.dot(u, f))));
  if (bend < WORLD.limbTwist.from) return null;
  const outward = side === 'l' ? axes.left : vec.scale(axes.left, -1);
  const angle = LIMB_BIND[kind];
  const bind = vec.add(vec.scale(axes.up, -Math.cos(angle)), vec.scale(outward, Math.sin(angle)));
  // Swung up near the opposite of hanging, the swing from hanging has no
  // one way round, and the turn no meaning.
  if (vec.dot(u, bind) < -WORLD.limbTwist.reversed) return null;
  const flexes = kind === 'arm' ? axes.forward : vec.scale(axes.forward, -1);
  // Inward is positive whichever side: the sign a turn of the bent part
  // towards the midline makes about the hanging bone.
  const sign = Math.sign(vec.dot(vec.cross(flexes, vec.scale(outward, -1)), bind)) || 1;
  const neutral = swingAlong(flexes, bind, u);
  const bent = vec.sub(f, vec.scale(u, vec.dot(f, u)));
  const twist = sign * Math.atan2(vec.dot(vec.cross(neutral, bent), u), vec.dot(neutral, bent));
  return { twist, elevation: Math.asin(Math.max(-1, Math.min(1, vec.dot(u, axes.up)))), bend };
}

/** The turn's limits at this elevation: { inward, outward } (rad). */
export function twistRange(kind, elevation) {
  const spec = WORLD.limbTwist[kind];
  const share = Math.max(0, Math.min(1, (elevation - spec.lowAt) / (spec.highAt - spec.lowAt)));
  return {
    inward: spec.low.inward + (spec.high.inward - spec.low.inward) * share,
    outward: spec.low.outward + (spec.high.outward - spec.low.outward) * share,
  };
}

/** How far (rad) a turn is past its range, `margin` inside it: + inward, − outward, 0 within. */
export function twistExcess(kind, turn, margin = 0) {
  if (!turn) return 0;
  const range = twistRange(kind, turn.elevation);
  if (turn.twist > range.inward - margin) return turn.twist - (range.inward - margin);
  if (turn.twist < -(range.outward - margin)) return turn.twist + (range.outward - margin);
  return 0;
}

/** Angle (rad) between a held weapon and the forearm holding it: past WORLD.limbTwist.wristBack it points back into the arm. */
export function wristAngle(elbow, hand, bladeDir) {
  const forearm = vec.normalize(vec.sub(hand, elbow));
  return Math.acos(Math.max(-1, Math.min(1, vec.dot(forearm, vec.normalize(bladeDir)))));
}

/**
 * How far a limb's pose is out of range: the turn's excess past its range
 * (`margin` inside it), plus how far a held blade points back past the
 * wrist's reach. 0 within range.
 */
function poseExcess(axes, kind, side, root, middle, end, bladeDir, margin) {
  const turn = limbTwist(axes, kind, side, root, middle, end);
  let excess = Math.abs(twistExcess(kind, turn, margin));
  if (bladeDir) excess += Math.max(0, wristAngle(middle, end, bladeDir) - (WORLD.limbTwist.wristBack - margin));
  return excess;
}

/**
 * Swivel a middle joint (elbow, knee) about the root–end line, keeping both
 * ends, to the nearest place where the limb is within range (`margin` inside
 * it): the limb's ends stay where the move wants them and the joint between
 * finds a way to get there untwisted. Returns the middle joint's position.
 * Where nowhere is in range, the least-twisted place.
 */
export function swivelIntoRange(axes, kind, side, root, middle, end, { bladeDir = null, margin = 0, samples = 24 } = {}) {
  if (!axes || poseExcess(axes, kind, side, root, middle, end, bladeDir, margin) === 0) return middle;
  const line = vec.sub(end, root);
  const length = vec.length(line);
  if (length < 1e-6) return middle;
  const axis = vec.scale(line, 1 / length);
  const centre = vec.add(root, vec.scale(axis, vec.dot(vec.sub(middle, root), axis)));
  const offset = vec.sub(middle, centre);
  if (vec.length(offset) < 1e-6) return middle;
  const at = (angle) => vec.add(centre, turnAbout(offset, axis, angle));
  const excessAt = (angle) => poseExcess(axes, kind, side, root, at(angle), end, bladeDir, margin);
  // The nearest angle either way that is in range: sampled, then the edge
  // found by halving, so the joint moves no further round than it must.
  let best = null;
  let leastExcess = Infinity;
  let leastAngle = 0;
  for (let step = 1; step <= samples / 2 && best === null; step += 1) {
    for (const direction of [1, -1]) {
      const angle = (direction * step * 2 * Math.PI) / samples;
      const excess = excessAt(angle);
      if (excess === 0) {
        best = angle;
        break;
      }
      if (excess < leastExcess) {
        leastExcess = excess;
        leastAngle = angle;
      }
    }
  }
  if (best === null) return at(leastAngle);
  let outside = best - Math.sign(best) * ((2 * Math.PI) / samples);
  let inside = best;
  for (let halving = 0; halving < 6; halving += 1) {
    const mid = (outside + inside) / 2;
    if (excessAt(mid) === 0) inside = mid;
    else outside = mid;
  }
  return at(inside);
}
