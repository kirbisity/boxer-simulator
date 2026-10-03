// The rig: bones laid over the physics skeleton. Each bone's frame (origin
// and axes) is computed from particle positions alone, by the same rule in
// the bind pose and every frame after, so a skin bound to the bind frames
// follows the particles exactly. Axes: x forward, y along the bone, z = x × y
// (to the fighter's left for an upright trunk).

import { P } from './body.js';
import { vec } from './pose.js';

// The three trunk bones split the pelvis→neck line at these fractions, so
// the hips can turn under the shoulders and the skin twists between them.
const SPINE_SPLIT = [0.36, 0.68];

export const BONES = [
  'pelvis', 'spine', 'chest', 'neck', 'head',
  'lClavicle', 'lUpperArm', 'lForearm', 'rClavicle', 'rUpperArm', 'rForearm',
  'lThigh', 'lShin', 'lFoot', 'rThigh', 'rShin', 'rFoot',
];
export const BONE = Object.fromEntries(BONES.map((name, index) => [name, index]));

function frameFrom(origin, along, reference, referenceIsForward) {
  const y = vec.normalize(along);
  let ref = vec.sub(reference, vec.scale(y, vec.dot(reference, y)));
  if (vec.length(ref) < 1e-6) ref = Math.abs(y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  ref = vec.normalize(ref);
  if (referenceIsForward) return { origin, x: ref, y, z: vec.cross(ref, y) };
  const x = vec.cross(y, ref);
  return { origin, x, y, z: ref };
}

/**
 * Bone frames for a set of particle positions (an array indexed by P).
 * @returns {Array<{origin, x, y, z, end}>} one per BONES entry; `end` is the
 * far end of the bone's segment, used to weight the skin.
 */
export function boneFrames(points, body) {
  const at = (name) => points[P[name]];
  const pelvis = at('pelvis');
  const neck = at('neck');
  const trunk = vec.sub(neck, pelvis);
  const hipLeft = vec.sub(at('lHip'), at('rHip'));
  const shoulderLeft = vec.sub(at('lShoulder'), at('rShoulder'));
  const frames = new Array(BONES.length);
  const along = (fraction) => vec.add(pelvis, vec.scale(trunk, fraction));

  frames[BONE.pelvis] = { ...frameFrom(pelvis, trunk, hipLeft, false), end: along(SPINE_SPLIT[0]) };
  frames[BONE.spine] = { ...frameFrom(along(SPINE_SPLIT[0]), trunk, vec.add(vec.normalize(hipLeft), vec.normalize(shoulderLeft)), false), end: along(SPINE_SPLIT[1]) };
  frames[BONE.chest] = { ...frameFrom(along(SPINE_SPLIT[1]), trunk, shoulderLeft, false), end: neck };
  const chestForward = frames[BONE.chest].x;
  const head = at('head');
  const neckAxis = vec.sub(head, neck);
  frames[BONE.neck] = { ...frameFrom(neck, neckAxis, chestForward, true), end: vec.add(neck, vec.scale(neckAxis, 0.55)) };
  frames[BONE.head] = { ...frameFrom(head, neckAxis, chestForward, true), end: vec.add(head, vec.scale(vec.normalize(neckAxis), body.lengths.headRadius)) };

  for (const side of ['l', 'r']) {
    const shoulder = at(`${side}Shoulder`);
    const elbow = at(`${side}Elbow`);
    const hand = at(`${side}Hand`);
    frames[BONE[`${side}Clavicle`]] = { ...frameFrom(neck, vec.sub(shoulder, neck), chestForward, true), end: shoulder };
    const upper = frameFrom(shoulder, vec.sub(elbow, shoulder), chestForward, true);
    frames[BONE[`${side}UpperArm`]] = { ...upper, end: elbow };
    frames[BONE[`${side}Forearm`]] = { ...frameFrom(elbow, vec.sub(hand, elbow), upper.x, true), end: hand };

    const pelvisForward = frames[BONE.pelvis].x;
    const hip = at(`${side}Hip`);
    const knee = at(`${side}Knee`);
    const foot = at(`${side}Foot`);
    const thigh = frameFrom(hip, vec.sub(knee, hip), pelvisForward, true);
    frames[BONE[`${side}Thigh`]] = { ...thigh, end: knee };
    const shin = frameFrom(knee, vec.sub(foot, knee), thigh.x, true);
    frames[BONE[`${side}Shin`]] = { ...shin, end: foot };
    // The foot points where the shin's forward points, kept level.
    const toes = vec.normalize([shin.x[0], 0, shin.x[2]]);
    frames[BONE[`${side}Foot`]] = { ...frameFrom(foot, toes, [0, 1, 0], true), end: vec.add(foot, vec.scale(toes, 0.16 * body.heightM / 1.8)) };
  }
  return frames;
}

/** A neutral A-pose for binding the skin: standing straight, arms 25° out. */
export function bindPoints(body) {
  const L = body.lengths;
  const H = body.heightM;
  const points = new Array(Object.keys(P).length);
  const hipY = L.ankle + L.shank + L.thigh;
  points[P.pelvis] = [0, hipY, 0];
  points[P.neck] = [0, hipY + L.trunk, 0];
  points[P.head] = [0.012 * H, hipY + L.trunk + L.neckToHead, 0];
  const armAngle = (25 * Math.PI) / 180;
  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    const hip = [0, hipY, (sign * L.hipSpan) / 2];
    points[P[`${side}Hip`]] = hip;
    points[P[`${side}Knee`]] = [0.005, hipY - L.thigh, (sign * L.hipSpan) / 2];
    points[P[`${side}Foot`]] = [0, L.ankle, (sign * L.hipSpan) / 2];
    const shoulder = [0, hipY + L.trunk - 0.025 * H, (sign * L.shoulderSpan) / 2];
    points[P[`${side}Shoulder`]] = shoulder;
    const down = [0, -Math.cos(armAngle), sign * Math.sin(armAngle)];
    points[P[`${side}Elbow`]] = vec.add(shoulder, vec.scale(down, L.upperArm));
    points[P[`${side}Hand`]] = vec.add(shoulder, vec.scale(down, L.upperArm + L.forearmToFist));
  }
  return points;
}

/** Column-major 4×4 matrix (Three.js order) for a frame. */
export function frameMatrix(frame) {
  const { x, y, z, origin } = frame;
  return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, origin[0], origin[1], origin[2], 1];
}

/** Express a world point in a frame's coordinates, and back. */
export function toFrame(frame, point) {
  const d = vec.sub(point, frame.origin);
  return [vec.dot(d, frame.x), vec.dot(d, frame.y), vec.dot(d, frame.z)];
}
export function fromFrame(frame, local) {
  return vec.add(frame.origin, vec.add(vec.scale(frame.x, local[0]), vec.add(vec.scale(frame.y, local[1]), vec.scale(frame.z, local[2]))));
}
