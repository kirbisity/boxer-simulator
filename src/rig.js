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

export const RIG = {
  // How far a drawn bone may turn about its own length in one frame (rad).
  maxTurnPerFrame: 0.45,
};

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

/** Rotate v by the smallest rotation that takes unit vector a onto unit vector b. */
function swing(v, a, b) {
  const cos = Math.max(-1, Math.min(1, vec.dot(a, b)));
  let axis = vec.cross(a, b);
  let sin = vec.length(axis);
  if (sin < 1e-8) {
    if (cos > 0) return v;
    // Exactly reversed: any axis across a will do.
    axis = vec.normalize(vec.cross(a, Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
    sin = 0;
  } else axis = vec.scale(axis, 1 / sin);
  return vec.add(vec.add(vec.scale(v, cos), vec.scale(vec.cross(axis, v), sin)), vec.scale(axis, vec.dot(axis, v) * (1 - cos)));
}

const toLocalAxes = (frame, v) => [vec.dot(v, frame.x), vec.dot(v, frame.y), vec.dot(v, frame.z)];
const fromLocalAxes = (frame, v) => vec.add(vec.add(vec.scale(frame.x, v[0]), vec.scale(frame.y, v[1])), vec.scale(frame.z, v[2]));

// Each limb bone's frame is its parent's, swung by the smallest rotation from
// where the limb pointed in the bind pose to where it points now. A fixed
// reference axis (the chest's forward for an arm) flips the frame whenever the
// limb lines up with it — a punch, a raised knee, a body lying down — and
// the skin twists with it; a swing from the parent only fails if a limb turns
// fully round from its bind direction.
const PARENT = {
  neck: 'chest', head: 'neck',
  lClavicle: 'chest', lUpperArm: 'chest', lForearm: 'lUpperArm',
  rClavicle: 'chest', rUpperArm: 'chest', rForearm: 'rUpperArm',
  lThigh: 'pelvis', lShin: 'lThigh', lFoot: 'lShin',
  rThigh: 'pelvis', rShin: 'rThigh', rFoot: 'rShin',
};
const BIND_RELATIONS = new WeakMap();

function bindRelations(body) {
  if (!BIND_RELATIONS.has(body)) {
    const frames = fixedReferenceFrames(bindPoints(body), body);
    const relations = {};
    for (const [bone, parent] of Object.entries(PARENT)) {
      const child = frames[BONE[bone]];
      const parentFrame = frames[BONE[parent]];
      relations[bone] = { y: toLocalAxes(parentFrame, child.y), x: toLocalAxes(parentFrame, child.x) };
    }
    BIND_RELATIONS.set(body, relations);
  }
  return BIND_RELATIONS.get(body);
}

/** A child bone's frame from its parent's, swung to point from origin along `along`. */
function swungFrame(parentFrame, relation, origin, along) {
  const y = vec.normalize(along);
  const restY = fromLocalAxes(parentFrame, relation.y);
  const x = vec.normalize(swing(fromLocalAxes(parentFrame, relation.x), restY, y));
  return { origin, x, y, z: vec.cross(x, y) };
}

/**
 * A hinge's child (shin, forearm): first turned about the parent's hinge
 * axis (its z) by the bend, then swung by what is left out of that plane.
 * A knee folded 150° in a chambered kick is nearly opposite its straight bind
 * direction, where a plain swing has no defined way round; the hinge does.
 */
function hingedFrame(parentFrame, relation, origin, along) {
  const y = vec.normalize(along);
  const axis = parentFrame.z;
  const inPlane = vec.sub(y, vec.scale(axis, vec.dot(y, axis)));
  if (vec.length(inPlane) < 1e-6) return swungFrame(parentFrame, relation, origin, along);
  const restY = fromLocalAxes(parentFrame, relation.y);
  const restInPlane = vec.normalize(vec.sub(restY, vec.scale(axis, vec.dot(restY, axis))));
  const bent = vec.normalize(inPlane);
  const angle = Math.atan2(vec.dot(vec.cross(restInPlane, bent), axis), vec.dot(restInPlane, bent));
  const turn = (v) => vec.add(vec.add(vec.scale(v, Math.cos(angle)), vec.scale(vec.cross(axis, v), Math.sin(angle))), vec.scale(axis, vec.dot(axis, v) * (1 - Math.cos(angle))));
  const turnedY = turn(restY);
  const x = vec.normalize(swing(turn(fromLocalAxes(parentFrame, relation.x)), vec.normalize(turnedY), y));
  return { origin, x, y, z: vec.cross(x, y) };
}

/**
 * Bone frames for a set of particle positions (an array indexed by P).
 * @returns {Array<{origin, x, y, z, end}>} one per BONES entry; `end` is the
 * far end of the bone's segment, used to weight the skin.
 */
export function boneFrames(points, body) {
  const relations = bindRelations(body);
  const at = (name) => points[P[name]];
  const frames = trunkFrames(points);
  const head = at('head');
  const neck = at('neck');
  const neckAxis = vec.sub(head, neck);
  frames[BONE.neck] = { ...swungFrame(frames[BONE.chest], relations.neck, neck, neckAxis), end: vec.add(neck, vec.scale(neckAxis, 0.55)) };
  frames[BONE.head] = { ...swungFrame(frames[BONE.neck], relations.head, head, neckAxis), end: vec.add(head, vec.scale(vec.normalize(neckAxis), body.lengths.headRadius)) };
  for (const side of ['l', 'r']) {
    const bone = (name) => `${side}${name}`;
    const shoulder = at(bone('Shoulder'));
    const elbow = at(bone('Elbow'));
    const hand = at(bone('Hand'));
    frames[BONE[bone('Clavicle')]] = { ...swungFrame(frames[BONE.chest], relations[bone('Clavicle')], neck, vec.sub(shoulder, neck)), end: shoulder };
    frames[BONE[bone('UpperArm')]] = { ...swungFrame(frames[BONE.chest], relations[bone('UpperArm')], shoulder, vec.sub(elbow, shoulder)), end: elbow };
    frames[BONE[bone('Forearm')]] = { ...hingedFrame(frames[BONE[bone('UpperArm')]], relations[bone('Forearm')], elbow, vec.sub(hand, elbow)), end: hand };
    const hip = at(bone('Hip'));
    const knee = at(bone('Knee'));
    const foot = at(bone('Foot'));
    const thigh = swungFrame(frames[BONE.pelvis], relations[bone('Thigh')], hip, vec.sub(knee, hip));
    frames[BONE[bone('Thigh')]] = { ...thigh, end: knee };
    const shin = hingedFrame(thigh, relations[bone('Shin')], knee, vec.sub(foot, knee));
    frames[BONE[bone('Shin')]] = { ...shin, end: foot };
    frames[BONE[bone('Foot')]] = footFrame(shin, relations[bone('Foot')], foot, body);
  }
  return frames;
}

/** Pelvis, spine and chest: along the trunk, sideways by the hips and shoulders (never parallel to it). */
function trunkFrames(points) {
  const at = (name) => points[P[name]];
  const pelvis = at('pelvis');
  const trunk = vec.sub(at('neck'), pelvis);
  const hipLeft = vec.sub(at('lHip'), at('rHip'));
  const shoulderLeft = vec.sub(at('lShoulder'), at('rShoulder'));
  const along = (fraction) => vec.add(pelvis, vec.scale(trunk, fraction));
  const frames = new Array(BONES.length);
  // The pelvis by its hips, steadied by the shoulders: a high kick tilts the
  // hip line far over, and alone it would flip the pelvis about the trunk.
  frames[BONE.pelvis] = { ...frameFrom(pelvis, trunk, vec.add(vec.normalize(hipLeft), vec.scale(vec.normalize(shoulderLeft), 0.5)), false), end: along(SPINE_SPLIT[0]) };
  frames[BONE.spine] = { ...frameFrom(along(SPINE_SPLIT[0]), trunk, vec.add(vec.normalize(hipLeft), vec.normalize(shoulderLeft)), false), end: along(SPINE_SPLIT[1]) };
  frames[BONE.chest] = { ...frameFrom(along(SPINE_SPLIT[1]), trunk, shoulderLeft, false), end: at('neck') };
  return frames;
}

/**
 * The foot: level on the ground, toes where the shin faces, while the shin
 * stands; carried rigidly with the shin as it tips towards lying flat.
 */
function footFrame(shin, relation, foot, body) {
  const rigid = swungFrame(shin, relation, foot, fromLocalAxes(shin, relation.y));
  // Standing, the toes' tilt is flattened out; the heading always comes from
  // the shin, so the foot cannot spin round as the blend changes.
  const standing = Math.min(1, Math.max(0, (Math.abs(shin.y[1]) - 0.5) / 0.35));
  const flattened = vec.sub(rigid.y, vec.scale([0, 1, 0], rigid.y[1] * standing));
  const toes = vec.length(flattened) > 1e-6 ? vec.normalize(flattened) : rigid.y;
  return { ...frameFrom(foot, toes, rigid.x, true), end: vec.add(foot, vec.scale(toes, 0.16 * body.heightM / 1.8)) };
}

/** The original rule, a fixed reference per bone: used once, on the bind pose, where it is well defined. */
function fixedReferenceFrames(points, body) {
  const at = (name) => points[P[name]];
  const frames = trunkFrames(points);
  const neck = at('neck');
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
    const toes = vec.normalize([shin.x[0], 0, shin.x[2]]);
    frames[BONE[`${side}Foot`]] = { ...frameFrom(foot, toes, [0, 1, 0], true), end: vec.add(foot, vec.scale(toes, 0.16 * body.heightM / 1.8)) };
  }
  return frames;
}

/**
 * Frames as drawn, frame after frame. The particles do not say how a limb is
 * twisted about its own length, and any rule for it has poses where it turns
 * round abruptly. Drawn, each bone starts from where it was last frame,
 * carried to its new direction, and turns towards the rule's answer by at
 * most `maxTurn` radians a frame: never a one-frame flip, and a genuinely
 * new orientation is reached within a few frames.
 */
export function coherentFrames(frames, previous, maxTurn = RIG.maxTurnPerFrame) {
  if (!previous) return frames;
  return frames.map((frame, index) => {
    const before = previous[index];
    if (!before) return frame;
    const carried = vec.normalize(swing(before.x, before.y, frame.y));
    const angle = Math.atan2(vec.dot(vec.cross(carried, frame.x), frame.y), vec.dot(carried, frame.x));
    if (Math.abs(angle) <= maxTurn) return frame;
    const turn = Math.sign(angle) * maxTurn;
    const axis = frame.y;
    const x = vec.normalize(vec.add(vec.add(vec.scale(carried, Math.cos(turn)), vec.scale(vec.cross(axis, carried), Math.sin(turn))), vec.scale(axis, vec.dot(axis, carried) * (1 - Math.cos(turn)))));
    return { ...frame, x, z: vec.cross(x, frame.y) };
  });
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
