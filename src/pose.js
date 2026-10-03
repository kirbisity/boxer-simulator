// Desired pose in the fighter's own frame: x forward, y up, z to the left,
// origin on the floor between the feet. The motors chase these positions;
// whether the body gets there, and how fast, is the physics' business.

import { P, PARTICLES } from './body.js';

export const POSE = {
  // Orthodox stance, bladed so the lead (left) side faces the opponent.
  bladeAngle: 0.55,
  hipBladeShare: 0.6,
  forwardLean: 0.14,
  crouch: 0.03, // drop of the hips, as a share of height, from bent knees
  leadFoot: [0.13, 0.055],
  rearFoot: [-0.13, -0.08],
  // Guard: hands in front of the face, relative to the head, in heights.
  leadGuard: [0.13, -0.1, 0.06],
  rearGuard: [0.035, -0.075, -0.075],
};

export const vec = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  length: (a) => Math.hypot(a[0], a[1], a[2]),
  normalize: (a) => {
    const length = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / length, a[1] / length, a[2] / length];
  },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

/** Rotate a vector about the vertical axis; a positive angle brings the left side (+z) forward (+x). */
export function yawRotate(point, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [point[0] * cos + point[2] * sin, point[1], -point[0] * sin + point[2] * cos];
}

/** Middle joint of a two-bone chain from `root` to `target`, bending towards `pole`. */
export function twoBoneIK(root, target, upperLength, lowerLength, pole) {
  const toTarget = vec.sub(target, root);
  const reach = upperLength + lowerLength;
  const distance = Math.min(vec.length(toTarget), reach * 0.999);
  const axis = vec.normalize(toTarget);
  // Law of cosines: how far along the axis, and how far off it, the joint sits.
  const along = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance);
  const off = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
  const poleOff = vec.sub(pole, vec.scale(axis, vec.dot(pole, axis)));
  const bend = vec.normalize(vec.length(poleOff) > 1e-6 ? poleOff : [0, -1, 0]);
  return vec.add(root, vec.add(vec.scale(axis, along), vec.scale(bend, off)));
}

/** Clamp a hand target to what the arm can reach from the shoulder. */
export function clampReach(shoulder, target, reach) {
  const offset = vec.sub(target, shoulder);
  const distance = vec.length(offset);
  if (distance <= reach) return target;
  return vec.add(shoulder, vec.scale(offset, reach / distance));
}

/**
 * Desired particle positions in the local frame.
 * @param body   built body (lengths)
 * @param intent { twist, headOffset:[x,y,z], lHand:[x,y,z]|null, rHand, guardTight }
 */
export function desiredPose(body, intent = {}) {
  const H = body.heightM;
  const L = body.lengths;
  const out = new Array(PARTICLES.length);
  const twist = intent.twist ?? 0;
  const blade = POSE.bladeAngle + twist;
  const across = (angle) => yawRotate([0, 0, 1], angle);

  out[P.lFoot] = [POSE.leadFoot[0] * H, L.ankle, POSE.leadFoot[1] * H];
  out[P.rFoot] = [POSE.rearFoot[0] * H, L.ankle, POSE.rearFoot[1] * H];
  const hipHeight = L.ankle + L.shank + L.thigh - POSE.crouch * H - (intent.dip ?? 0) * H;
  const pelvis = [0, hipHeight, 0];
  out[P.pelvis] = pelvis;
  const hipAxis = across(POSE.bladeAngle * POSE.hipBladeShare + twist * 0.3);
  out[P.lHip] = vec.add(pelvis, vec.scale(hipAxis, L.hipSpan / 2));
  out[P.rHip] = vec.add(pelvis, vec.scale(hipAxis, -L.hipSpan / 2));

  const lean = POSE.forwardLean + (intent.lean ?? 0);
  const neck = vec.add(pelvis, [Math.sin(lean) * L.trunk, Math.cos(lean) * L.trunk, 0]);
  out[P.neck] = neck;
  const shoulderAxis = across(blade);
  const shoulderBase = vec.add(neck, [0, -0.025 * H, 0]);
  out[P.lShoulder] = vec.add(shoulderBase, vec.scale(shoulderAxis, L.shoulderSpan / 2));
  out[P.rShoulder] = vec.add(shoulderBase, vec.scale(shoulderAxis, -L.shoulderSpan / 2));
  const headOffset = intent.headOffset ?? [0, 0, 0];
  out[P.head] = vec.add(neck, [0.012 * H + headOffset[0], L.neckToHead + headOffset[1], headOffset[2]]);

  // Weight shifts onto the front foot to extend a punch: everything above
  // the feet moves forward; the knees go half as far.
  const shift = (intent.shift ?? 0) * H;
  for (let index = 0; index < out.length; index += 1) {
    if (out[index] && index !== P.lFoot && index !== P.rFoot) out[index] = vec.add(out[index], [shift, -Math.abs(shift) * 0.3, 0]);
  }

  for (const side of ['l', 'r']) {
    const hip = out[P[`${side}Hip`]];
    const foot = out[P[`${side}Foot`]];
    const outward = side === 'l' ? 0.35 : -0.35;
    out[P[`${side}Knee`]] = twoBoneIK(hip, foot, L.thigh, L.shank, [1, 0, outward]);

    const shoulder = out[P[`${side}Shoulder`]];
    const guard = side === 'l' ? POSE.leadGuard : POSE.rearGuard;
    const tight = intent.guardTight ? 0.6 : 1;
    const drift = intent.guardOffset?.[side] ?? [0, 0, 0];
    const guardPoint = vec.add(out[P.head], [(guard[0] * tight + drift[0]) * H, (guard[1] + drift[1]) * H, (guard[2] + drift[2]) * H]);
    const target = clampReach(shoulder, intent[`${side}Hand`] ?? guardPoint, (L.upperArm + L.forearmToFist) * 0.995);
    out[P[`${side}Hand`]] = target;
    const pole = [-0.4, -1, side === 'l' ? 0.5 : -0.5];
    out[P[`${side}Elbow`]] = twoBoneIK(shoulder, target, L.upperArm, L.forearmToFist, pole);
  }
  return out;
}

/** Rest lengths for the constraint network, measured from the guard pose. */
export function restPose(body) {
  return desiredPose(body, {});
}
