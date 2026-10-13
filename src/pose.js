// Desired pose in the fighter's own frame: x forward, y up, z to the left,
// origin on the floor between the feet. The motors chase these positions;
// whether the body gets there, and how fast, is the physics' business.

import { P, PARTICLES } from './body.js';
import { WORLD } from './physics/config.js';
import { swivelIntoRange, trunkAxes } from './joints.js';

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
  // An arm holding a weapon: the hand at least this far in front of its
  // shoulder (heights), and the elbow bent down and out, a little forward,
  // so the arm reads as held out rather than folded back behind the body.
  weaponReach: 0.1,
  // Cocking a blow the hand may come back level with its shoulder: the
  // wind-up is where a swing gets its length.
  weaponWindupReach: 0,
  // A polearm's rear hand drives from beside the hip, as far back as its
  // shoulder: the run-up a thrust needs. The front arm holds forward.
  polearmRearReach: 0,
  weaponPole: [0.25, -1, 0.6],
  // A weapon hand drawn in under its shoulder (a polearm's rear hand at the
  // hip) leaves "down" no way to bend the elbow, and the pole's outward part
  // swung it straight out sideways, the upper arm near level. Bent there, the
  // elbow goes back instead, as the arm folds when the hand comes to the
  // hip: by `weaponPoleBack` as the shoulder–hand line turns from `from` to
  // `full` (its downward share).
  weaponPoleBack: { back: 1.0, from: 0.75, full: 0.95 },
  // A hand on a weapon is held outside the trunk, clear of where the ribs
  // stop it (physics keepArmsOffRibs) by `clear` m, from `below` m under the
  // pelvis up: a polearm's rear hand beside the hip, not in the belly. Aimed
  // inside, the ribs pushed it out and the muscles pulled it back, substep
  // after substep: the rear hand and the whole weapon shook.
  weaponClear: { clear: 0.03, below: 0.1 },
};

export const vec = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  // A square root, not Math.hypot: the same length for these sizes, many times cheaper.
  length: (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]),
  normalize: (a) => {
    const length = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1;
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
 * Where a head locked to the trunk sits (a jousting helm bolted to the
 * breastplate): on the trunk's axis above the neck, tilted back by the
 * stance's own lean so that at rest he looks level, and carried with the
 * trunk from there (leaning in further, he looks down; knocked back, up).
 * `up` the trunk's axis and `forward` its front (unit vectors), `restLean` rad.
 */
export function lockedHead(body, neck, up, forward, restLean) {
  const reach = body.lengths.neckToHead;
  const ahead = 0.012 * body.heightM - Math.sin(restLean) * reach;
  return vec.add(neck, vec.add(vec.scale(up, Math.cos(restLean) * reach), vec.scale(forward, ahead)));
}

/**
 * Desired particle positions in the local frame.
 * @param body   built body (lengths)
 * @param intent { stance, twist, lean, dip, shift, headOffset, guardTight,
 *   guardOffset, and per-limb overrides lHand, rHand, lElbow, rElbow,
 *   lFoot, rFoot, lKnee, rKnee (local points), check (lead shin up) }
 */
export function desiredPose(body, intent = {}) {
  const H = body.heightM;
  const L = body.lengths;
  const stance = { blade: POSE.bladeAngle, crouch: POSE.crouch, width: 1, lean: POSE.forwardLean, guardHeight: 0, ...intent.stance };
  const out = new Array(PARTICLES.length);
  const twist = intent.twist ?? 0;
  const blade = stance.blade + twist;
  const across = (angle) => yawRotate([0, 0, 1], angle);

  const hipHeight = L.ankle + L.shank + L.thigh - stance.crouch * H - (intent.dip ?? 0) * H;
  out[P.lFoot] = intent.lFoot ?? [POSE.leadFoot[0] * H * stance.width, L.ankle, POSE.leadFoot[1] * H * stance.width];
  out[P.rFoot] = intent.rFoot ?? [POSE.rearFoot[0] * H * stance.width, L.ankle, POSE.rearFoot[1] * H * stance.width];
  if (intent.check && !intent.lFoot) {
    // Checking a kick: the lead knee comes up and out, the shin a shield.
    out[P.lFoot] = [POSE.leadFoot[0] * H * stance.width + 0.04 * H, hipHeight * 0.42, POSE.leadFoot[1] * H + 0.03 * H];
  }
  const pelvis = [0, hipHeight, 0];
  out[P.pelvis] = pelvis;
  const hipAxis = across(stance.blade * POSE.hipBladeShare + twist * 0.3);
  out[P.lHip] = vec.add(pelvis, vec.scale(hipAxis, L.hipSpan / 2));
  out[P.rHip] = vec.add(pelvis, vec.scale(hipAxis, -L.hipSpan / 2));

  const lean = stance.lean + (intent.lean ?? 0);
  const neck = vec.add(pelvis, [Math.sin(lean) * L.trunk, Math.cos(lean) * L.trunk, 0]);
  out[P.neck] = neck;
  const shoulderAxis = across(blade);
  const shoulderBase = vec.add(neck, [0, -0.025 * H, 0]);
  out[P.lShoulder] = vec.add(shoulderBase, vec.scale(shoulderAxis, L.shoulderSpan / 2));
  out[P.rShoulder] = vec.add(shoulderBase, vec.scale(shoulderAxis, -L.shoulderSpan / 2));
  const headOffset = intent.headOffset ?? [0, 0, 0];
  out[P.head] = vec.add(neck, [0.012 * H + headOffset[0], L.neckToHead + headOffset[1], headOffset[2]]);
  // A locked head (OUTFITS headLocked) goes where the trunk takes it: no slip, roll or bob of its own.
  if (body.gear?.headLocked) out[P.head] = lockedHead(body, neck, [Math.sin(lean), Math.cos(lean), 0], [Math.cos(lean), -Math.sin(lean), 0], stance.lean);

  // Weight shifts onto the front foot to extend a punch: everything above
  // the feet moves forward; the knees go half as far.
  const shift = (intent.shift ?? 0) * H;
  for (let index = 0; index < out.length; index += 1) {
    if (out[index] && index !== P.lFoot && index !== P.rFoot) out[index] = vec.add(out[index], [shift, -Math.abs(shift) * 0.3, 0]);
  }

  // Elbows and knees swivel to where the shoulders and hips can turn them,
  // short of the range's resisting band: the hands and feet stay where the
  // move wants them.
  const margin = WORLD.limbTwist.softBand;
  const weaponShift = intent.weaponArms ? clearOfTrunk(body, out, intent) : null;
  const shoulderAxes = trunkAxes(out[P.pelvis], out[P.neck], out[P.lShoulder], out[P.rShoulder]);
  const hipAxes = trunkAxes(out[P.pelvis], out[P.neck], out[P.lHip], out[P.rHip]);
  for (const side of ['l', 'r']) {
    const hip = out[P[`${side}Hip`]];
    const foot = out[P[`${side}Foot`]];
    const outward = side === 'l' ? 0.35 : -0.35;
    // A raised or kicking leg folds with its knee where the move puts it.
    const kneeOverride = intent[`${side}Knee`];
    out[P[`${side}Knee`]] = kneeOverride ?? swivelIntoRange(hipAxes, 'leg', side, hip, twoBoneIK(hip, foot, L.thigh, L.shank, [1, intent.check && side === 'l' ? 0.6 : 0, outward]), foot, { margin });
    if (kneeOverride) out[P[`${side}Foot`]] = intent[`${side}Foot`] ?? vec.add(kneeOverride, [-0.2, -L.shank * 0.8, 0]);

    const shoulder = out[P[`${side}Shoulder`]];
    const guard = side === 'l' ? POSE.leadGuard : POSE.rearGuard;
    const tight = intent.guardTight ? 0.6 : 1;
    const drift = intent.guardOffset?.[side] ?? [0, 0, 0];
    const guardPoint = vec.add(out[P.head], [(guard[0] * tight + drift[0]) * H, (guard[1] + stance.guardHeight + drift[1]) * H, (guard[2] + drift[2]) * H]);
    const elbowOverride = intent[`${side}Elbow`];
    if (elbowOverride) {
      // Elbow strikes: the point of the elbow leads; the forearm folds back.
      const elbow = vec.add(shoulder, vec.scale(vec.normalize(vec.sub(elbowOverride, shoulder)), L.upperArm));
      out[P[`${side}Elbow`]] = elbow;
      const hand = intent[`${side}Hand`] ?? vec.add(elbow, [0, 0.1, 0]);
      out[P[`${side}Hand`]] = vec.add(elbow, vec.scale(vec.normalize(vec.sub(hand, elbow)), L.forearmToFist));
      continue;
    }
    const weaponArm = intent.weaponArms?.includes(side);
    let wanted = intent[`${side}Hand`] ?? guardPoint;
    if (weaponArm && weaponShift) wanted = vec.add(wanted, weaponShift);
    if (weaponArm) {
      const reach = intent.windingUp ? POSE.weaponWindupReach : intent.polearmRear === side ? POSE.polearmRearReach : intent.weaponReach ?? POSE.weaponReach;
      wanted = [Math.max(wanted[0], shoulder[0] + reach * H), wanted[1], wanted[2]];
    }
    const target = clampReach(shoulder, wanted, (L.upperArm + L.forearmToFist) * 0.995);
    out[P[`${side}Hand`]] = target;
    const pole = weaponArm ? weaponPole(shoulder, target, side) : [-0.4, -1, side === 'l' ? 0.5 : -0.5];
    // A weapon's hand also turns its forearm so the wrist can point the blade.
    const elbow = twoBoneIK(shoulder, target, L.upperArm, L.forearmToFist, pole);
    // Not mid-stroke: a swing's own path through the arm is what drives the blade.
    // A shield arm's forearm lies where the shield's straps put it.
    out[P[`${side}Elbow`]] = (weaponArm && (intent.swinging || intent.windingUp)) || intent.shieldArm === side ? elbow : swivelIntoRange(shoulderAxes, 'arm', side, shoulder, elbow, target, { bladeDir: weaponArm ? intent.bladeDir : null, margin: weaponArm ? margin : 0 });
  }
  return out;
}

/** Which way a weapon arm's elbow bends: down and out, and back as the hand comes in under the shoulder. */
function weaponPole(shoulder, hand, side) {
  const { back, from, full } = POSE.weaponPoleBack;
  const down = -vec.normalize(vec.sub(hand, shoulder))[1];
  const share = Math.max(0, Math.min(1, (down - from) / (full - from)));
  return [POSE.weaponPole[0] - back * share, POSE.weaponPole[1], POSE.weaponPole[2] * (side === 'l' ? 1 : -1)];
}

/**
 * How far to move the hands on a weapon so that none is inside the trunk:
 * out from the spine, the hands together (a two-handed weapon keeps its
 * line). Null if they are clear.
 */
function clearOfTrunk(body, out, intent) {
  const trunk = body.segments?.trunk;
  if (!trunk) return null;
  const pelvis = out[P.pelvis];
  const axis = vec.sub(out[P.neck], pelvis);
  const length = vec.length(axis);
  const up = vec.scale(axis, 1 / length);
  const radius = trunk.muscleRadius + 0.5 * body.segments.lUpperArm.skinRadius + POSE.weaponClear.clear;
  let shift = null;
  let deepest = 0;
  for (const side of intent.weaponArms) {
    const hand = intent[`${side}Hand`];
    if (!hand) continue;
    const offset = vec.sub(hand, pelvis);
    const along = vec.dot(offset, up);
    if (along < -POSE.weaponClear.below || along > length) continue;
    const radial = vec.sub(offset, vec.scale(up, along));
    const distance = vec.length(radial);
    if (distance >= radius || radius - distance <= deepest) continue;
    deepest = radius - distance;
    // Dead on the spine's line: out in front.
    const outward = distance > 1e-6 ? vec.scale(radial, 1 / distance) : [1, 0, 0];
    shift = vec.scale(outward, deepest);
  }
  return shift;
}

/** Rest lengths for the constraint network, measured from the guard pose. */
export function restPose(body) {
  return desiredPose(body, {});
}
