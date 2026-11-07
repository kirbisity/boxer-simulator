// The gaps in rigid armour (weapons.js BLADES.gaps), where they really are: which opening, if any, a blow that lands at a
// point on a part of a man meets there (gapZoneAt), measured on his own body (his hips, neck, shoulders and the joints of
// his limbs), so it moves and scales with the man; how often a blow put there finds it (gapChance); and what is under it
// (gapUnder). Pure: physics.js registerWeaponImpact asks at the moment a blade lands, ai.js and finisher.js in expectation.
// Nothing here scales harm: a gap only lets the blow meet what is under the plate instead of the plate.

import { P, SEGMENTS } from '../body.js';
import { vec } from '../pose.js';
import { BLADES } from '../weapons.js';

const gapPoint = (fighter, name) => [fighter.x[P[name] * 3], fighter.x[P[name] * 3 + 1], fighter.x[P[name] * 3 + 2]];
const GAP_DEGREES = 180 / Math.PI;

/** The share of `v` square to the unit `axis`. */
const squareTo = (v, axis) => vec.sub(v, vec.scale(axis, vec.dot(v, axis)));

/** The kit's gaps: the defaults (BLADES.gaps) with what the kit says of its own (`gear.gaps`). */
export function gapsOf(gear) {
  return gear?.gaps ? { ...BLADES.gaps, ...gear.gaps } : BLADES.gaps;
}

/** His trunk's frame, from his own landmarks: up his spine, to his left by his shoulders and hips, and forward out of his chest. */
export function gapTrunkFrame(fighter) {
  const pelvis = gapPoint(fighter, 'pelvis');
  const spine = vec.sub(gapPoint(fighter, 'neck'), pelvis);
  const up = vec.normalize(spine);
  const leftward = vec.add(vec.sub(gapPoint(fighter, 'lShoulder'), gapPoint(fighter, 'rShoulder')), vec.sub(gapPoint(fighter, 'lHip'), gapPoint(fighter, 'rHip')));
  const left = vec.normalize(squareTo(leftward, up));
  return { pelvis, spine, up, left, forward: vec.cross(up, left) };
}

/** Degrees round from `forward` (0 straight ahead, 180 behind) of the direction `v` about `up`. */
function roundFrom(v, up, forward, left) {
  const flat = squareTo(v, up);
  if (vec.length(flat) < 1e-6) return 0;
  return Math.abs(Math.atan2(vec.dot(flat, left), vec.dot(flat, forward))) * GAP_DEGREES;
}

const gapWithin = (value, [low, high]) => value >= low && value <= high;

/** The way the side `faces` names opens on limb `key` (from `a` to `b`, unit `axis`), square to it. */
function gapOpening(fighter, key, faces, a, axis, frame) {
  const side = key[0];
  const other = side === 'l' ? 'r' : 'l';
  const part = key.slice(1);
  let toward;
  if (faces === 'trunk') {
    // The inside of the arm: towards the nearest point of his spine.
    const along = Math.max(0, Math.min(1, vec.dot(vec.sub(a, frame.pelvis), frame.spine) / vec.dot(frame.spine, frame.spine)));
    toward = vec.sub(vec.add(frame.pelvis, vec.scale(frame.spine, along)), a);
  } else if (faces === 'inside') {
    toward = vec.sub(gapPoint(fighter, `${other}Hip`), gapPoint(fighter, `${side}Hip`));
  } else {
    // The inside of the bend: the way the bone beyond (or before) the joint folds.
    const bend = { UpperArm: ['Elbow', 'Hand'], Forearm: ['Elbow', 'Shoulder'], Thigh: ['Knee', 'Foot'], Shank: ['Knee', 'Hip'] }[part];
    toward = vec.sub(gapPoint(fighter, `${side}${bend[1]}`), gapPoint(fighter, `${side}${bend[0]}`));
    // Straight, the bend says little: the elbow's crease faces forward, the knee's back.
    if (vec.length(squareTo(toward, axis)) < 0.25 * vec.length(toward)) toward = /Arm/.test(part) ? frame.forward : vec.scale(frame.forward, -1);
  }
  const square = squareTo(toward, axis);
  return vec.length(square) < 1e-9 ? null : vec.normalize(square);
}

/** Whether a blow at `point` with outward surface `normal` on part `key` falls in `shape` (one zone's, or a solid's, on that part). */
function inGapShape(fighter, key, shape, point, normal, frame) {
  if (key === 'trunk') {
    if (shape.cap !== undefined) return vec.dot(normal, frame.up) >= shape.cap;
    const height = vec.dot(vec.sub(point, frame.pelvis), frame.spine) / vec.dot(frame.spine, frame.spine);
    return gapWithin(height, shape.height) && gapWithin(roundFrom(normal, frame.up, frame.forward, frame.left), shape.round);
  }
  if (key === 'head') {
    const up = vec.normalize(vec.sub(gapPoint(fighter, 'head'), gapPoint(fighter, 'neck')));
    const forward = vec.normalize(squareTo(frame.forward, up));
    return gapWithin(vec.dot(normal, up), shape.rise) && gapWithin(roundFrom(normal, up, forward, vec.cross(up, forward)), shape.round);
  }
  const segment = SEGMENTS[key];
  const a = gapPoint(fighter, segment.from);
  const bone = vec.sub(gapPoint(fighter, segment.to), a);
  const axis = vec.normalize(bone);
  const along = vec.dot(vec.sub(point, a), bone) / vec.dot(bone, bone);
  if (!gapWithin(along, shape.along)) return false;
  const toward = gapOpening(fighter, key, shape.faces, a, axis, frame);
  return Boolean(toward) && vec.dot(normal, toward) >= BLADES.gaps.facing;
}

/**
 * The gap a blow meets where it lands, by name (a key of BLADES.gaps.zones, or 'lacing'), or null where the armour has none:
 * on part `key` of `fighter` at world `point`, the struck surface's outward `normal` there. Only a zone his kit has (not in
 * its `gaps.closed`), only behind a helmet of the zone's face; laced armour (`gaps.lacing`) parts anywhere else but the solid
 * plates (BLADES.gaps.solid).
 */
export function gapZoneAt(fighter, key, point, normal) {
  const gear = fighter.body.gear;
  const gaps = gapsOf(gear);
  const part = key === 'head' || key === 'trunk' ? key : key.slice(1);
  const frame = gapTrunkFrame(fighter);
  for (const [name, zone] of Object.entries(BLADES.gaps.zones)) {
    if (!zone[part] || gaps.closed?.includes(name)) continue;
    if (zone.helm && zone.helm !== (gear.helmFace ?? 'open')) continue;
    if ([].concat(zone[part]).some((shape) => inGapShape(fighter, key, shape, point, normal, frame))) return name;
  }
  if (!(gaps.lacing > 0)) return null;
  const solid = BLADES.gaps.solid[part] ?? [];
  return solid.some((shape) => inGapShape(fighter, key, shape, point, normal, frame)) ? null : 'lacing';
}

/**
 * How often a blow landing in gap `zone` of this kit finds the opening, before the striker's own terms (technique, skill,
 * placement): a point the kit's `thrust` (the lacing a share of it); an edge the kit's `swing`, only where an edge can go
 * (the zone's `edge`) and never in a full harness (`cutProof`).
 */
export function gapChance(gear, zone, mode) {
  if (!zone) return 0;
  const gaps = gapsOf(gear);
  if (zone === 'lacing') return mode === 'thrust' ? gaps.thrust * gaps.lacing : 0;
  if (mode === 'thrust') return gaps.thrust;
  return BLADES.gaps.zones[zone].edge && !gear.cutProof ? gaps.swing : 0;
}

/**
 * What a blow into gap `zone` of this kit meets: behind the sights or an open face, bare skin; where the kit has mail under
 * the gap (`gaps.mail`: zone names, or 'all' but the face), mail; where a layer worn under it reaches (`gear.under`), that
 * layer; else what is under all its plates (`gaps.under`: the arming doublet) — never more than the armour there itself
 * (`covered`).
 */
export function gapUnder(gear, zone, covered) {
  const gaps = gapsOf(gear);
  const spec = BLADES.gaps.zones[zone];
  const mailed = gaps.mail === 'all' ? !spec?.under : gaps.mail?.includes(zone);
  // (A layer worn under the whole kit, outfits.js UNDER_ARMOUR, lies under the gaps it reaches: a mail shirt under the coat.)
  const layered = !spec?.under && gear.under?.zones?.includes(zone);
  const under = mailed ? BLADES.gaps.layers.mail : spec?.under ? BLADES.gaps.layers[spec.under] : layered ? gear.under.guard : gaps.under;
  return {
    blunt: Math.min(under.blunt ?? 0, covered.blunt ?? 0),
    cut: Math.min(under.cut ?? 0, covered.cut ?? 0),
    pierce: Math.min(under.pierce ?? 0, covered.pierce ?? 0),
  };
}

/**
 * In expectation, for a man weighing a blow at part `key` of this kit (ai.js harmThrough): the share of such blows that
 * meet a gap's opening before the striker's own terms (the share that lands in a zone, BLADES.gaps.aimed, × gapChance
 * there), and what is under it (`under`, as the zone most such blows meet: an open face, the throat, the armpit, the elbow).
 */
export function expectedGap(gear, key, mode, covered) {
  const aimed = BLADES.gaps.aimed;
  const face = gear.helmFace ?? 'open';
  const part = key === 'head' || key === 'trunk' ? key : 'limb';
  const share = part === 'head' ? aimed.head[face] ?? 0 : aimed[part];
  const zone = part === 'head' ? (face === 'open' ? 'face' : 'neck') : part === 'trunk' ? 'armpit' : 'elbow';
  if (gapsOf(gear).closed?.includes(zone)) return { found: 0, under: covered };
  return { found: share * gapChance(gear, zone, mode), under: gapUnder(gear, zone, covered) };
}

