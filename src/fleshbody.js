// The 'flesh' body style: the body as one continuous skin over its own
// anatomy, for the fighters the camera comes close to (a hero, a portrait, a
// cutscene), never a crowd. The anatomy is a signed distance field (as in
// bodymesh.js): the bones and muscles are volumes (a rib cage's ribs, the
// collarbones, the spine's knobs, the shoulder blades, the hip bones, the
// kneecaps and ankle bones; pectorals, ab blocks, deltoids, lats, quadriceps,
// calves...) blended with a smooth minimum, and the skin is that lean body
// pushed out by the fat on it, which is the real mechanism: where the layer
// is thin (a starved body) the bones come through it, where it is thick (an
// obese one) it rounds every landmark off and lays its own deposits (belly,
// flanks, chest, nape, buttocks) and creases on top. The fat's deposits are
// the sculpt style's rules (sculpt.js trunkFat), shared so the two draw the
// same body; the bones and muscles are drawn here as volumes, not bumps.
//
// Meshed in the bind pose by surface nets, weighted to the rig as the other
// field styles are. Trunks and a sports top are drawn as offset copies of the
// skin where they lie, so they fit any build; armour and loose clothes are
// not drawn by this style (the sheets' fit check says what that needs).
// No Three.js: plain arrays, buildable in Node.

import { LANDMARKS, rulesProfile } from './skinrules.js';
import { P } from './body.js';
import { vec } from './pose.js';
import { BONE, bindPoints, boneFrames } from './rig.js';
import { cone, ellipsoid, relax, skinWeights, smoothMin, surfaceNets } from './bodymesh.js';
import { glovedFists, outfitOf } from './outfits.js';
import { buildLoftBody } from './loftbody.js';
import { SCULPT, sculptProfile, sculptTraits, trunkFat, trunkProfiles } from './sculpt.js';

export const FLESH = {
  // Grid spacing (m) of the field: ribs 4 cm apart and 1 cm thick want under a centimetre (8.5 mm keeps them; 7.5 is cleaner and a third as dear again).
  cell: 0.0085,
  // How far apart two lean shapes start to merge (m): small, so landmarks stay crisp.
  blend: 0.01,
  // The same for muscles that grow out of the body without an edge (pectorals, the back's).
  softBlend: 0.045,
  // The thinnest a flat muscle or bone plate is drawn (m): under about a cell it would mesh to nothing on one side and not the other.
  thinnest: 0.011,
  // Nodes farther than this from the surface keep the field: more than the most any deposit or crease moves it.
  band: 0.11,
  // One light relaxing pass takes the grid's stair-steps off.
  relaxPasses: 1,
  relaxAmount: 0.3,
  // How far trunks, a waistband and a sports top stand off the skin (m).
  standoff: { kit: 0.0045, band: 0.0065, top: 0.0035 },
  // Where the garments end up the trunk (u): the waistband, a sports top (the loft's own TOPS and trunks).
  garments: { band: [0.17, 0.25], top: [0.56, 0.86], reach: 1.04 },
  // Rib cage: how many ribs are drawn, the spacing (of the trunk's length), the tube's radius (m, at 1.8 m), how far they droop to the front (m).
  ribs: { count: 7, top: 0.6, spacing: 0.042, radius: 0.0105, droop: 0.045 },
  // Refined, the cage where it is (skinrules.js LANDMARKS): the first rib under the collarbone, ten down to the lowest margin at the side.
  refinedRibs: { count: 10, top: 0.93, spacing: 0.047, radius: 0.0095, droop: 0.075 },
  // Where along the thigh the trunks end (the loft's own reach for trunks).
  trunksReach: 0.42,
  // Per-vertex painting (the flesh-lite style): how far out (m) the field is probed for a cavity, and how dark a full one is.
  paint: { probe: 0.014, dark: 0.3 },
  // Where (u up the trunk) the core narrows from the rib cage to the neck.
  shoulderFrom: 0.8,
  shoulderTo: 1.0,
  // The refined anatomy (round two's styles): the core closes on the neck later, so the trapezius and deltoids make the shoulder line.
  refinedShoulder: [0.93, 1.05],
  // ...and the pectoral blended into the chest over a wider band (a narrow one left a rim round a plate).
  refinedPecBlend: 0.085,
  // Muscle's proud is scaled by how bare the skin is over it, and a bone's by the same and by how bony the body (see sculpt.js).
};

/**
 * An ellipsoid whose distance is never under the distance to its own bounding box: the usual approximation is only good near the
 * surface, and for a flat ellipsoid (a muscle lying on the trunk) it reads near zero a long way off, which grows a slab through the body.
 */
function solidEllipsoid(center, radii, axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
  const shape = ellipsoid(center, radii, axes);
  return {
    box: shape.box,
    distance(x, y, z) {
      const near = shape.distance(x, y, z);
      if (near < 0) return near;
      const d = [x - center[0], y - center[1], z - center[2]];
      let outside = 0;
      for (let axis = 0; axis < 3; axis += 1) {
        const over = Math.max(0, Math.abs(vec.dot(d, axes[axis])) - radii[axis]);
        outside += over * over;
      }
      return Math.max(near, Math.sqrt(outside));
    },
  };
}

const fleshClamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const fleshSmooth = (low, high, x) => {
  const t = fleshClamp((x - low) / (high - low));
  return t * t * (3 - 2 * t);
};

/**
 * A trunk-shaped core: an ellipse swept up the trunk, its half-width, half-depth and forward shift each a function of u
 * (hip joint 0, base of the neck 1), closed at both ends.
 */
function sweptEllipse(origin, length, from, to, { width, depth, shift }) {
  const reach = Math.max(...[-0.1, 0.3, 0.6, 0.9].map(width)) * 1.4;
  return {
    box: [origin[0] - 0.3, origin[1] + from * length - 0.03, origin[2] - reach, origin[0] + 0.3, origin[1] + to * length + 0.03, origin[2] + reach],
    distance(x, y, z) {
      const u = (y - origin[1]) / length;
      const held = fleshClamp(u, from, to);
      const W = width(held);
      const D = depth(held);
      const qx = (x - origin[0] - shift(held)) / D;
      const qz = (z - origin[2]) / W;
      const k0 = Math.hypot(qx, qz);
      const k1 = Math.hypot(qx / D, qz / W);
      let d = k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(D, W);
      const overshoot = (u - held) * length;
      if (overshoot !== 0) d = d > 0 ? Math.hypot(d, overshoot) : Math.abs(overshoot);
      return d;
    },
  };
}

/** A tube round an ellipse in a plane (a rib), thinning to nothing at the breastbone and the spine, its front end drooping. */
function ribTube(center, axes, y, droop, radius) {
  const [D, W] = axes;
  return {
    box: [center[0] - D - radius, y - droop - radius, center[2] - W - radius, center[0] + D + radius, y + radius, center[2] + W + radius],
    distance(x, py, z) {
      const qx = (x - center[0]) / D;
      const qz = (z - center[2]) / W;
      const k0 = Math.hypot(qx, qz);
      const k1 = Math.hypot(qx / D, qz / W);
      const ring = k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(D, W);
      // The angle from the front: ribs are not there at the breastbone or the spine.
      const around = Math.atan2(Math.abs(qz), qx);
      const seen = fleshSmooth(0.22, 0.62, around) * (1 - fleshSmooth(2.7, 3.05, around));
      const here = y - droop * (1 - fleshSmooth(0.5, 2.9, around));
      // Where it is not there it sinks into the cage (no sliver of a tube to mesh badly).
      return Math.hypot(ring, py - here) - radius + (1 - seen) * radius * 2.4;
    },
  };
}

/** A segment from a to b as a rounded tube. */
const fleshTube = (a, b, r1, r2 = r1) => cone(a, b, r1, r2);
/** A ball. */
const fleshBall = (center, radius) => solidEllipsoid(center, [radius, radius, radius]);

/**
 * The lean body: its volumes and the fat that goes over it.
 * @returns { shapes, thickness(x, y, z), traits }
 */
export function fleshAnatomy(body, { refined = false, coarse = false } = {}) {
  // `coarse`: the large forms only (no ribs, spine knobs or ab blocks): what a low-polygon skin is drawn onto, the maps carrying the rest.
  // `refined`: round two's corrections (a pectoral fanned to the shoulder, a smooth trapezius and deltoid, bone buried by fat, a hanging apron).
  const [shoulderFrom, shoulderTo] = refined ? FLESH.refinedShoulder : [FLESH.shoulderFrom, FLESH.shoulderTo];
  const points = bindPoints(body);
  const at = (name) => points[P[name]];
  const seg = body.segments;
  const L = body.lengths;
  const H = body.heightM;
  const sc = H / 1.8;
  const traits = sculptTraits(body);
  const { female } = traits;
  // In armour the skin is drawn plain (no muscle plates, no deposits): the armour is built on the loft's rings and has no room for them.
  const armoured = Boolean(outfitOf(body.inputs).look.armor);
  const dev = armoured ? 0 : traits.developed;
  const bony = traits.trunk.bony * (1 - SCULPT.muscleCoversBone * fleshClamp(dev));
  const lean = traits.trunk.lean;
  const shapes = [];
  const lerp = vec.lerp;

  // The trunk's lean profiles (sculpt.js: the same the loft draws its rings from).
  const pelvis = at('pelvis');
  const neck = at('neck');
  const trunkLength = vec.length(vec.sub(neck, pelvis));
  const R = seg.trunk.muscleRadius;
  const neckR = L.headRadius * (0.44 + 0.12 * body.neckIndex);
  const hipHalf = L.hipSpan / 2 + seg.lThigh.muscleRadius * 0.85;
  // Refined, the profiles are smooth curves through their stops (no shelf where an eased one sits flat at a stop).
  const profiles = trunkProfiles(body, traits, { L, R, neckR, hipHalf, sculptProfile: refined ? rulesProfile : sculptProfile });
  const fat = trunkFat(traits);
  // Above the ribs the core closes in on the neck, so the trapezius (a volume of its own, below) makes the slope to the shoulders, not a shelf.
  const closing = (profile, neckSize) => (u) => profile(u) + (neckSize - profile(u)) * fleshSmooth(shoulderFrom, shoulderTo, u);
  // The lats widen the back above the waist (a V), with training and without fat over them.
  const wide = (u) => 1 + 0.1 * dev * lean ** 1.2 * Math.exp(-(((u - 0.55) / 0.14) ** 2));
  // The skin's own envelope (lean body and the layer of fat over it, as the loft's rings are drawn): the bones and muscles stand proud of it
  // by as much as they would show, so a thick layer buries them and a thin one lets them through.
  const trunkLayer = Math.max(0, seg.trunk.skinRadius - seg.trunk.muscleRadius);
  const leanWide = (u) => closing(profiles.leanWidth, neckR * 1.2)(u) * wide(u);
  const leanDeep = closing(profiles.leanDepth, neckR * 1.15);
  const closeness = (u) => 1 - fleshSmooth(shoulderFrom, shoulderTo, u);
  const width = (u) => leanWide(u) + trunkLayer * profiles.fatWidth(u) * closeness(u);
  const depth = (u) => leanDeep(u) + trunkLayer * profiles.fatDepth(u) * closeness(u);
  const shift = (u) => profiles.leanOffset(u) + trunkLayer * profiles.fatOffset(u) * closeness(u);
  shapes.push(sweptEllipse(pelvis, trunkLength, -0.1, 1.06, { width, depth, shift }));

  /**
   * A flat muscle or bone plate lying on the trunk: an ellipsoid whose outer face stands `proud` m above the surface at (u, lateral),
   * `tall` and `wide` (m) half-extents along and across the surface.
   */
  const lens = (u, lateral, proud, tall, wide, blend = FLESH.blend, tilt = 0) => {
    const normal = Math.min(Math.max(proud * 1.25 + 0.002, FLESH.thinnest), tall, wide);
    const onSurface = surface(u, lateral, 1);
    const out = [Math.cos(lateral), 0, Math.sin(lateral)];
    const across = [-Math.sin(lateral), 0, Math.cos(lateral)];
    const centre = vec.sub(onSurface, vec.scale(out, normal - proud));
    // `tilt`: the plate's long axis turned up (rad) from running outwards along the surface, as a pectoral's fibres run to the shoulder.
    const outwards = vec.scale(across, Math.sign(Math.sin(lateral)) || 1);
    const long = vec.add(vec.scale(outwards, Math.cos(tilt)), [0, Math.sin(tilt), 0]);
    const short = vec.add(vec.scale(outwards, -Math.sin(tilt)), [0, Math.cos(tilt), 0]);
    // Refined, a plate that would barely stand proud is left out: buried under fat its rim still printed (a box on a heavy back).
    return { ...solidEllipsoid(centre, [normal, tall, wide], [out, tilt ? short : [0, 1, 0], tilt ? long : across]), blend, skip: refined && proud < 0.0015 };
  };

  /** A point on the lean trunk's surface at u, signed angle `lateral` from the front (+ to the left), a share `inset` of the way out. */
  const surface = (u, lateral, inset = 1) => [
    pelvis[0] + shift(u) + Math.cos(lateral) * depth(u) * inset,
    pelvis[1] + u * trunkLength,
    pelvis[2] + Math.sin(lateral) * width(u) * inset,
  ];

  // Bones show wherever the skin is thin; a muscled trunk's are covered by muscle and are made only a little proud.
  const boneProud = 0.35 + 0.65 * bony;
  // Muscle shows only where the fat is thin: a heavy man's pectorals are under his chest.
  const bare = lean ** 1.2;
  // And bone is buried by the fat as well: a plate or a crest on a heavy trunk is not seen.
  const boneBare = refined ? lean ** 1.1 : 1;

  // ---- Ribs, breastbone side to spine: tubes round the cage, each a little lower at the front.
  const ribs = refined ? FLESH.refinedRibs : FLESH.ribs;
  for (let rib = 0; rib < (coarse ? 0 : ribs.count); rib += 1) {
    const u = ribs.top - rib * ribs.spacing;
    // Under muscle or fat the ribs sink in as well as thin: a trained trunk's are all but gone.
    const inset = 0.985 - (refined ? 0.06 : 0.035) * (1 - bony);
    shapes.push(ribTube([pelvis[0] + shift(u), 0, pelvis[2]], [depth(u) * inset, width(u) * inset], pelvis[1] + u * trunkLength, ribs.droop * sc, ribs.radius * sc * (0.45 + 0.55 * bony)));
  }

  // ---- Collarbones: from the notch at the top of the breastbone out and a little up to the point of the shoulder.
  for (const side of [1, -1]) {
    const notch = refined ? surface(LANDMARKS.notch - 0.015, side * 0.12, 0.975) : surface(0.88, side * 0.12, 0.975);
    // Refined, the collarbone runs out to the point of the shoulder (over the joint), nearly level.
    const tip = refined ? vec.add(at(side > 0 ? 'lShoulder' : 'rShoulder'), [0.012, 0.03, 0]) : surface(0.925, side * 1.42, 0.985);
    // Refined, the collarbone sinks under fat (its inner end stood up as a knob on a heavy chest), and starts off the notch.
    const clavicle = refined ? 0.3 + 0.7 * boneBare : 1;
    shapes.push(fleshTube(refined ? lerp(notch, tip, 0.06) : notch, tip, 0.0072 * sc * (0.7 + 0.5 * boneProud) * clavicle, 0.0082 * sc * (0.7 + 0.5 * boneProud) * clavicle));
    // The sternum's top, and the pit between the collarbones is left to the lean core.
    // Shoulder blades: flat plates on the back, their spine a ridge.
    shapes.push(lens(refined ? 0.78 : 0.69, side * (Math.PI - 0.62), (0.004 + 0.009 * Math.max(bony, dev * 0.7)) * boneBare, 0.065 * sc, 0.045 * sc, FLESH.softBlend));
    shapes.push({ ...fleshTube(surface(refined ? 0.9 : 0.8, side * (Math.PI - 0.22), 0.985), surface(refined ? 0.94 : 0.79, side * (Math.PI - 1.15), 0.985), (0.0035 + 0.004 * boneProud) * (refined ? 0.3 + 0.7 * boneBare : 1), (0.004 + 0.0045 * boneProud) * (refined ? 0.3 + 0.7 * boneBare : 1)), skip: (refined && boneBare < 0.2) || coarse });
    // Hip bones: the front spine, the crest running back, the back spine.
    const front = surface(0.085, side * 1.02, 0.97);
    const crest = surface(0.17, side * 1.85, 0.97);
    const back = surface(0.1, side * 2.75, 0.97);
    shapes.push(fleshBall(front, (0.0105 * sc * boneProud + 0.004) * (0.3 + 0.7 * boneBare)));
    shapes.push(fleshTube(front, crest, (0.0085 * sc * boneProud + 0.003) * (0.3 + 0.7 * boneBare)));
    shapes.push(fleshTube(crest, back, (0.0085 * sc * boneProud + 0.003) * (0.3 + 0.7 * boneBare)));
    // The pectoral: a shelf with a sharp lower edge (a man's); a woman's bust is the fat's.
    if (!female && dev > 0.08 && bare > 0.12) {
      // A broad fan from the breastbone to the shoulder: long outwards and a little up, a flat edge below, no cleft where the two meet.
      if (refined) shapes.push(lens(0.75, side * 0.66, (0.004 + 0.016 * dev) * bare, 0.05 * sc, 0.095 * sc, FLESH.refinedPecBlend, 0.3));
      else shapes.push(lens(0.665, side * 0.55, (0.005 + 0.022 * dev) * bare, 0.058 * sc, 0.085 * sc, FLESH.softBlend));
    }
    // Lats flare the back; the trapezius slopes from the neck to the shoulder.
    // The shoulder girdle: the trapezius from the neck out to the point of the shoulder, thin in the starved, thick in the trained.
    const shoulderPoint = at(side > 0 ? 'lShoulder' : 'rShoulder');
    if (refined) shapes.push({ ...fleshTube(vec.add(lerp(neck, shoulderPoint, 0.06), [-0.012, -0.012, 0]), vec.add(lerp(neck, shoulderPoint, 0.93), [-0.006, -0.012, 0]), 0.026 + 0.026 * dev + 0.012 * body.neckIndex, 0.03 + 0.014 * dev), blend: FLESH.softBlend });
    else shapes.push(fleshTube(vec.add(lerp(neck, shoulderPoint, 0.1), [-0.015, 0.0, 0]), vec.add(lerp(neck, shoulderPoint, 0.9), [-0.01, 0.004, 0]), 0.014 + 0.032 * dev + 0.012 * body.neckIndex, 0.02 + 0.012 * dev));
    // The neck's two cords, from behind the ear to the notch.
    const cords = lean * (0.25 + 0.5 * bony + 0.5 * Math.min(1, body.neckIndex));
    shapes.push(fleshTube([neck[0] + 0.03, neck[1] - 0.02, neck[2] + side * 0.014], [neck[0] - 0.012, neck[1] + 0.1 * (L.neckToHead / 0.207), neck[2] + side * 0.036], 0.0045 + 0.0075 * cords, 0.0045 + 0.0075 * cords));
  }

  // ---- Abdomen: ab blocks in four rows, a groove down the middle and between the rows, only where they are trained.
  const absShow = fleshSmooth(0.12, 0.5, dev) * fleshSmooth(SCULPT.definedFrom, SCULPT.definedTo, traits.trunk.fat);
  if (absShow > 0.05) {
    for (const side of [1, -1]) {
      for (let row = 0; row < (coarse ? 0 : refined ? 3 : 4); row += 1) {
        const u = refined ? 0.535 - row * 0.105 : 0.46 - row * 0.07;
        shapes.push(lens(u, side * 0.27, 0.003 + 0.011 * absShow, 0.0185 * sc, 0.031 * sc));
      }
    }
  }
  // ---- Spine: the knobs of the vertebrae (bony), the erector muscles either side of them (trained).
  const knobs = Math.floor(0.82 / SCULPT_SPINE_KNOB);
  if (bony > 0.15 && !coarse) {
    for (let knob = 0; knob < knobs; knob += 1) {
      const u = 0.12 + knob * SCULPT_SPINE_KNOB;
      shapes.push(fleshBall(surface(u, Math.PI, 0.99), 0.0058 * sc * bony + 0.001));
    }
  }
  if (dev > 0.12 && bare > 0.12 && !coarse) {
    for (const side of [1, -1]) shapes.push(lens(0.45, side * (Math.PI - 0.18), (0.003 + 0.008 * dev) * bare, 0.17 * sc, 0.026, FLESH.softBlend));
  }
  // Glutes (existing proportions): round, heavier with training.
  for (const side of [1, -1]) {
    const glute = vec.add(lerp(pelvis, neck, 0.02), [-depth(0.02) * 0.5, 0, side * L.hipSpan * 0.32]);
    shapes.push(solidEllipsoid(glute, [seg.lThigh.muscleRadius * 0.7, seg.lThigh.muscleRadius * 0.95, seg.lThigh.muscleRadius * (0.8 + 0.2 * dev)]));
  }

  // ---- Neck.
  const neckRadius = neckR * 0.95;
  shapes.push(cone(vec.add(neck, [0, -0.02, 0]), lerp(neck, at('head'), 0.55), neckRadius * 1.15, neckRadius));

  // ---- Arms.
  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    const shoulder = at(`${side}Shoulder`);
    const elbow = at(`${side}Elbow`);
    const hand = at(`${side}Hand`);
    const upperR = seg[`${side}UpperArm`].muscleRadius;
    const foreR = seg[`${side}Forearm`].muscleRadius;
    const armLean = traits.arm.lean;
    const armBony = traits.arm.bony;
    const forward = [1, 0, 0];
    shapes.push(cone(shoulder, elbow, upperR * 0.95, upperR * 0.72));
    // Deltoid over the joint, cap and three heads.
    const armAxis = vec.normalize(vec.sub(elbow, shoulder));
    const armSide = vec.normalize(vec.cross(armAxis, [1, 0, 0]));
    if (refined) shapes.push({ ...solidEllipsoid(vec.add(shoulder, vec.scale(armAxis, upperR * 0.55)), [upperR * (1.05 + 0.25 * dev), upperR * (1.5 + 0.35 * dev), upperR * (1.0 + 0.2 * dev)], [[1, 0, 0], armAxis, armSide]), blend: FLESH.softBlend });
    else shapes.push(solidEllipsoid(vec.add(shoulder, [0, -0.004, sign * 0.012]), [upperR * (1.05 + 0.25 * dev), upperR * (1.35 + 0.3 * dev), upperR * (1.0 + 0.2 * dev)]));
    // Biceps in front, triceps behind, the groove between them on the inside.
    const belly = upperR * (0.5 + 0.35 * dev * armLean);
    shapes.push(cone(vec.add(lerp(shoulder, elbow, 0.32), vec.scale(forward, upperR * 0.3)), vec.add(lerp(shoulder, elbow, 0.76), vec.scale(forward, upperR * 0.28)), belly, belly * 0.7));
    shapes.push(cone(vec.add(lerp(shoulder, elbow, 0.22), vec.scale(forward, -upperR * 0.28)), vec.add(lerp(shoulder, elbow, 0.7), vec.scale(forward, -upperR * 0.26)), belly * 1.08, belly * 0.8));
    // The elbow: a joint's knobs, bigger against a thin arm: the point behind, the epicondyles at the sides.
    shapes.push(solidEllipsoid(elbow, [upperR * 0.62, upperR * 0.6, upperR * 0.62]));
    shapes.push(fleshBall(vec.add(elbow, [-upperR * 0.5, 0.004, 0]), 0.008 + 0.006 * armBony));
    for (const across of [1, -1]) shapes.push(fleshBall(vec.add(elbow, [0, 0.01, across * upperR * 0.6]), 0.0065 + 0.005 * armBony));
    // The forearm: thick below the elbow, narrow at the wrist, a bulge of muscle on the outside (brachioradialis).
    // Refined and bare-handed, the forearm runs on to the fist (as the loft's does); in gloves it stops inside the cuff.
    const wrist = lerp(elbow, hand, refined && !glovedFists(body.inputs) ? 0.95 : 0.72);
    shapes.push(cone(lerp(elbow, hand, 0.02), lerp(elbow, hand, 0.35), foreR * 1.12, foreR * 1.03));
    shapes.push(cone(lerp(elbow, hand, 0.35), wrist, foreR * 1.03, foreR * 0.62));
    shapes.push(cone(vec.add(lerp(elbow, hand, 0.12), [0.004, 0, sign * foreR * 0.35]), vec.add(lerp(elbow, hand, 0.4), [0.004, 0, sign * foreR * 0.25]), foreR * (0.5 + 0.2 * dev), foreR * 0.4));
    // The wrist's two knobs.
    if (!coarse) for (const across of [1, -1]) shapes.push(fleshBall(vec.add(wrist, [0, 0.004, across * foreR * 0.55]), 0.0045 + 0.0035 * armBony));
  }

  // ---- Legs.
  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    const hip = at(`${side}Hip`);
    const knee = at(`${side}Knee`);
    const foot = at(`${side}Foot`);
    const thighR = seg[`${side}Thigh`].muscleRadius;
    const shankR = seg[`${side}Shank`].muscleRadius;
    const legMuscle = dev * traits.thigh.lean;
    const legBony = traits.thigh.bony;
    const hipTop = vec.add(hip, [0, 0.02, sign * 0.01]);
    shapes.push(cone(hipTop, knee, thighR * 1.1, thighR * 0.62));
    // Quadriceps: the outer sweep, the rectus down the front, the teardrop above the knee inside.
    shapes.push(cone(vec.add(lerp(hip, knee, 0.22), [thighR * 0.28, 0, sign * thighR * 0.32]), vec.add(lerp(hip, knee, 0.78), [thighR * 0.3, 0, sign * thighR * 0.18]), thighR * (0.4 + 0.28 * legMuscle), thighR * 0.32));
    shapes.push(cone(vec.add(lerp(hip, knee, 0.2), [thighR * 0.34, 0, 0]), vec.add(lerp(hip, knee, 0.8), [thighR * 0.3, 0, 0]), thighR * (0.4 + 0.2 * legMuscle), thighR * 0.36));
    shapes.push(solidEllipsoid(vec.add(lerp(hip, knee, 0.88), [thighR * 0.22, 0, -sign * thighR * 0.28]), [thighR * 0.34, thighR * 0.5, thighR * (0.28 + 0.2 * legMuscle)]));
    // Hamstrings behind, adductors inside.
    shapes.push(cone(vec.add(lerp(hip, knee, 0.15), [-thighR * 0.3, 0, 0]), vec.add(lerp(hip, knee, 0.7), [-thighR * 0.26, 0, 0]), thighR * (0.5 + 0.3 * legMuscle), thighR * 0.4));
    shapes.push(cone(vec.add(lerp(hip, knee, 0.08), [0, 0, -sign * thighR * 0.5]), vec.add(lerp(hip, knee, 0.6), [0, 0, -sign * thighR * 0.35]), thighR * 0.4, thighR * 0.32));
    // The great trochanter at the hip, the knee's bones: kneecap, condyles (knobby when thin).
    shapes.push(fleshBall(vec.add(hip, [-0.005, -0.03, sign * (thighR * 0.9)]), 0.011 + 0.01 * legBony));
    shapes.push(solidEllipsoid(knee, [thighR * 0.62, thighR * 0.62, thighR * 0.64]));
    shapes.push(fleshBall(vec.add(knee, [thighR * 0.62, 0.006, 0]), 0.0095 + 0.007 * legBony));
    for (const across of [1, -1]) shapes.push(fleshBall(vec.add(knee, [0, 0.004, across * thighR * 0.62]), 0.008 + 0.006 * legBony));
    // Shin and calf: the tibia's crest in front, the calf's two heads high behind, the ankle bones.
    const ankle = lerp(knee, foot, 0.95);
    shapes.push(cone(knee, ankle, shankR * 0.82, shankR * 0.5));
    shapes.push(fleshTube(vec.add(lerp(knee, foot, 0.06), [shankR * 0.6, 0, 0]), vec.add(lerp(knee, foot, 0.7), [shankR * 0.42, 0, 0]), 0.004 + 0.007 * legBony, 0.0035 + 0.005 * legBony));
    const calf = shankR * (0.55 + 0.28 * dev * traits.shank.lean);
    for (const across of [0.45, -0.45]) {
      shapes.push(cone(vec.add(lerp(knee, foot, 0.14), [-shankR * 0.32, 0, across * shankR * 0.34]), vec.add(lerp(knee, foot, 0.52), [-shankR * 0.18, 0, across * shankR * 0.2]), calf * (across * sign > 0 ? 1.05 : 0.9), calf * 0.5));
    }
    for (const across of [1, -1]) shapes.push(fleshBall(vec.add(lerp(knee, foot, 0.95), [0, 0.006, across * shankR * 0.45]), 0.0075 + 0.003 * traits.shank.bony));
  }

  // ---- The fat laid over the lean body, by place.
  // Which part of the body a point is nearest, for the layer its segment carries.
  const bones = [
    ['trunk', pelvis, neck],
    ['head', neck, at('head')],
    ['lUpperArm', at('lShoulder'), at('lElbow')], ['lForearm', at('lElbow'), at('lHand')],
    ['rUpperArm', at('rShoulder'), at('rElbow')], ['rForearm', at('rElbow'), at('rHand')],
    ['lThigh', at('lHip'), at('lKnee')], ['lShank', at('lKnee'), at('lFoot')],
    ['rThigh', at('rHip'), at('rKnee')], ['rShank', at('rKnee'), at('rFoot')],
  ].map(([key, a, b]) => ({ key, a, b, ab: vec.sub(b, a), lengthSquared: Math.max(1e-9, vec.dot(vec.sub(b, a), vec.sub(b, a))), layer: Math.max(0, seg[key].skinRadius - seg[key].muscleRadius) }));
  const layerOf = Object.fromEntries(bones.map((bone) => [bone.key, bone.layer]));

  const nearness = new Float64Array(bones.length);
  /** Metres of fat over the lean surface at a point (negative in a crease). */
  const thickness = (x, y, z) => {
    let total = 0;
    let weights = 0;
    for (let index = 0; index < bones.length; index += 1) {
      const bone = bones[index];
      const px = x - bone.a[0];
      const py = y - bone.a[1];
      const pz = z - bone.a[2];
      const t = fleshClamp((px * bone.ab[0] + py * bone.ab[1] + pz * bone.ab[2]) / bone.lengthSquared);
      const dx = px - bone.ab[0] * t;
      const dy = py - bone.ab[1] * t;
      const dz = pz - bone.ab[2] * t;
      const w = 1 / (dx * dx + dy * dy + dz * dz + 1e-5) ** 2;
      nearness[index] = w;
      weights += w;
    }
    for (let index = 0; index < bones.length; index += 1) {
      const share = nearness[index] / weights;
      if (share < 1e-4) continue;
      const bone = bones[index];
      if (bone.key === 'trunk') {
        const u = (y - pelvis[1]) / trunkLength;
        const angle = Math.atan2(z - pelvis[2], x - pelvis[0] - shift(u));
        // The sign convention of the loft's rings: + on the right; the rules are symmetric.
        const a = Math.atan2(Math.sin(angle) * depth(u) / Math.max(1e-4, width(u)), Math.cos(angle));
        // The trunk's layer is in its envelope; what is laid on it here is the deposits and the creases between them.
        const reach = fleshSmooth(-0.14, -0.06, u);
        total += armoured ? 0 : share * reach * (fat.mass(u, a) + fat.folds(u, a));
      } else total += share * bone.layer * (bone.key.endsWith('Thigh') && female ? 1.3 : 1);
    }
    return total;
  };
  // The skin is never farther than this from the lean surface: the trunk's fat is the most, at its thickest ring, with deposits and creases on it.
  const band = FLESH.band;
  if (refined) for (let index = shapes.length - 1; index >= 0; index -= 1) if (shapes[index].skip) shapes.splice(index, 1);
  return { shapes, thickness, band, traits, bones, points, layerOf, trunkWidth: width };
}

const SCULPT_SPINE_KNOB = 0.036;

// ---- The field, the surface -------------------------------------------------

/**
 * The signed distance to the skin (negative inside it) as a function of a bind-pose point: the lean field with the fat pushed
 * out of it, as `sampleSkin` meshes it, but read anywhere on its own, to project another surface onto it or to bake its height
 * into textures. Exact only near the surface; shapes too far to matter at the surface are skipped.
 */
export function fleshField(anatomy) {
  const { shapes, thickness, band } = anatomy;
  const reach = band + FLESH.blend + 0.01;
  return (x, y, z) => {
    let lean = 1;
    for (const shape of shapes) {
      const box = shape.box;
      if (x < box[0] - reach || x > box[3] + reach || y < box[1] - reach || y > box[4] + reach || z < box[2] - reach || z > box[5] + reach) continue;
      lean = smoothMin(lean, shape.distance(x, y, z), shape.blend ?? FLESH.blend);
    }
    if (lean > band || lean < -band) return lean;
    return lean - thickness(x, y, z) * (1 - fleshSmooth(band * 0.6, band, Math.abs(lean)));
  };
}


/** Grid and field of the lean union, then the skin: the lean field pushed out by the fat near its surface. */
export function sampleSkin({ shapes, thickness, band }, cell) {
  const blend = FLESH.blend;
  const margin = band + cell * 2;
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const shape of shapes) {
    for (let axis = 0; axis < 3; axis += 1) {
      low[axis] = Math.min(low[axis], shape.box[axis] - margin);
      high[axis] = Math.max(high[axis], shape.box[axis + 3] + margin);
    }
  }
  const size = low.map((value, axis) => Math.ceil((high[axis] - value) / cell) + 1);
  const [nx, ny, nz] = size;
  const field = new Float32Array(nx * ny * nz).fill(1);
  for (const shape of shapes) {
    const from = [0, 1, 2].map((axis) => Math.max(0, Math.floor((shape.box[axis] - margin - low[axis]) / cell)));
    const to = [0, 1, 2].map((axis) => Math.min(size[axis] - 1, Math.ceil((shape.box[axis + 3] + margin - low[axis]) / cell)));
    for (let k = from[2]; k <= to[2]; k += 1) {
      const z = low[2] + k * cell;
      for (let j = from[1]; j <= to[1]; j += 1) {
        const y = low[1] + j * cell;
        let index = from[0] + nx * (j + ny * k);
        for (let i = from[0]; i <= to[0]; i += 1, index += 1) {
          field[index] = smoothMin(field[index], shape.distance(low[0] + i * cell, y, z), shape.blend ?? blend);
        }
      }
    }
  }
  // The skin: where the lean surface is within the band, push it out by the fat there.
  for (let k = 0; k < nz; k += 1) {
    const z = low[2] + k * cell;
    for (let j = 0; j < ny; j += 1) {
      const y = low[1] + j * cell;
      let index = nx * (j + ny * k);
      for (let i = 0; i < nx; i += 1, index += 1) {
        const lean = field[index];
        if (lean > band || lean < -band) continue;
        // The push fades out toward the band's edge, so it never makes a second surface there.
        const fade = 1 - fleshSmooth(band * 0.6, band, Math.abs(lean));
        field[index] = lean - thickness(low[0] + i * cell, y, z) * fade;
      }
    }
  }
  return { field, size, low, cell };
}

/**
 * The skin as a mesh in the bind pose: { positions, normals, indices, regions, rigid, skinIndex, skinWeight, bindFrames, bindPoints }.
 * `regions` names each vertex (skin, or kit, band, top for the trunks and top drawn over it).
 */
export function buildFleshBody(body, { cell = FLESH.cell, paint = false, refined = false } = {}) {
  const anatomy = fleshAnatomy(body, { refined });
  let surface = surfaceNets(sampleSkin(anatomy, cell));
  surface = relax(surface, FLESH.relaxPasses, FLESH.relaxAmount);
  const frames = boneFrames(anatomy.points, body);
  const weights = skinWeights(surface.positions, frames);
  const vertexCount = surface.positions.length / 3;
  const regions = new Array(vertexCount).fill('skin');
  const mesh = { positions: surface.positions, normals: surface.normals, indices: surface.indices, regions, rigid: new Array(vertexCount).fill(false), ...weights, bindFrames: frames, bindPoints: anatomy.points };
  const dressed = dressSkin(mesh, body, anatomy);
  // `paint`: the skin coloured per vertex instead of by maps (the flesh-lite style): `tint`, a multiplier on the tone for each vertex.
  if (!paint) return dressed;
  const field = fleshField(anatomy);
  return { ...dressed, field, tint: paintFleshVertices(dressed, field, anatomy.traits) };
}

/**
 * Per-vertex skin colour from the field: how shut in each skin vertex is (the skin's own field read a little way out along its normal:
 * less than that far out means a cavity), as the albedo map shades its cavities, with the ruddy of the heavy and the pale of the starved.
 * @returns the multipliers, three a vertex (1 for what is not skin)
 */
export function paintFleshVertices(mesh, field, traits) {
  const count = mesh.positions.length / 3;
  const tint = new Float32Array(count * 3).fill(1);
  const ruddy = fleshSmooth(0.03, 0.095, traits.trunk.fat) * (traits.female ? 0.85 : 1);
  const pale = traits.trunk.bony;
  const probe = FLESH.paint.probe;
  for (let vertex = 0; vertex < count; vertex += 1) {
    if (mesh.regions[vertex] !== 'skin') continue;
    const x = mesh.positions[vertex * 3];
    const y = mesh.positions[vertex * 3 + 1];
    const z = mesh.positions[vertex * 3 + 2];
    const out = field(x + mesh.normals[vertex * 3] * probe, y + mesh.normals[vertex * 3 + 1] * probe, z + mesh.normals[vertex * 3 + 2] * probe);
    // On a flat face the field a probe out is the probe; in a hollow it is less.
    const hollow = fleshClamp((probe - out) / probe);
    const dark = hollow ** 0.9 * FLESH.paint.dark;
    tint[vertex * 3] = (1 - dark * (0.45 + 0.4 * pale)) * (1 + 0.045 * ruddy - 0.03 * pale);
    tint[vertex * 3 + 1] = (1 - dark * (0.95 - 0.1 * pale)) * (1 - 0.035 * ruddy - 0.006 * pale);
    tint[vertex * 3 + 2] = (1 - dark * (1 - 0.2 * pale)) * (1 - 0.05 * ruddy + 0.032 * pale);
  }
  return tint;
}

// ---- Clothes as offset skin ------------------------------------------------

const FLESH_ARM_BONES = new Set([BONE.lClavicle, BONE.lUpperArm, BONE.lForearm, BONE.rClavicle, BONE.rUpperArm, BONE.rForearm]);

/**
 * The skin's triangles between two heights, cut cleanly at them (a vertex on each cut where an edge crosses it), as new
 * vertices carrying the nearest original's skin weights. `keep` says which original vertices may be clothed (not the arms).
 */
function sliceSkin(mesh, low, high, keep) {
  const { positions, normals, indices, skinIndex, skinWeight } = mesh;
  const made = { positions: [], normals: [], skinIndex: [], skinWeight: [], indices: [] };
  const corner = (vertex) => ({ p: [positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]], n: [normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2]], from: vertex });
  const cut = (a, b, y) => {
    const t = (y - a.p[1]) / (b.p[1] - a.p[1]);
    return { p: vec.lerp(a.p, b.p, t), n: vec.normalize(vec.lerp(a.n, b.n, t)), from: t < 0.5 ? a.from : b.from };
  };
  // Sutherland-Hodgman against one horizontal plane: keep what is above it or below it.
  const clip = (polygon, y, above) => {
    const out = [];
    polygon.forEach((a, index) => {
      const b = polygon[(index + 1) % polygon.length];
      const aIn = above ? a.p[1] >= y : a.p[1] <= y;
      const bIn = above ? b.p[1] >= y : b.p[1] <= y;
      if (aIn) out.push(a);
      if (aIn !== bIn) out.push(cut(a, b, y));
    });
    return out;
  };
  for (let face = 0; face < indices.length; face += 3) {
    const corners = [indices[face], indices[face + 1], indices[face + 2]];
    if (!corners.every(keep)) continue;
    let polygon = corners.map(corner);
    polygon = clip(polygon, low, true);
    if (polygon.length >= 3) polygon = clip(polygon, high, false);
    if (polygon.length < 3) continue;
    const first = made.positions.length / 3;
    for (const point of polygon) {
      made.positions.push(...point.p);
      made.normals.push(...point.n);
      for (let slot = 0; slot < 4; slot += 1) {
        made.skinIndex.push(skinIndex[point.from * 4 + slot]);
        made.skinWeight.push(skinWeight[point.from * 4 + slot]);
      }
    }
    for (let fan = 1; fan < polygon.length - 1; fan += 1) made.indices.push(first, first + fan, first + fan + 1);
  }
  return made;
}

/**
 * Trunks, a waistband and (for a woman) a sports top, drawn as copies of the skin between heights, stood off it:
 * they fit any body, for the price of drawing only what is cut from the skin's own shape.
 */
function dressSkin(mesh, body, anatomy) {
  const { look } = outfitOf(body.inputs);
  const female = body.inputs.sex === 'female';
  const bottom = look.bottom && !look.bottom.skirt && ['trunks', 'longShorts', 'splitShorts'].includes(look.bottom.kind) ? look.bottom : null;
  const top = look.top && (!look.top.female || female) && look.top.kind === 'sportsBra' ? look.top : null;
  // Anything but plain trunks and a sports top (armour, a coat, trousers) is the loft's own cloth, drawn over this skin: the fit check's subject.
  const plain = !look.armor && !look.extras?.length && (!look.top || look.top.kind === 'sportsBra') && (!look.bottom || bottom);
  if (!plain) return withLoftCloth(mesh, body);
  if (!bottom && !top) return mesh;
  const pelvis = anatomy.points[P.pelvis];
  const trunkLength = vec.length(vec.sub(anatomy.points[P.neck], pelvis));
  const heightAt = (u) => pelvis[1] + u * trunkLength;
  const reachY = anatomy.points[P.lHip][1] - FLESH.trunksReach * body.lengths.thigh;
  // On the trunk (not an arm): by where it is, not by the bone that carries it, which near the armpit is the arm's.
  const notArm = (vertex) => {
    if (!FLESH_ARM_BONES.has(mesh.skinIndex[vertex * 4])) return true;
    const u = (mesh.positions[vertex * 3 + 1] - pelvis[1]) / trunkLength;
    return Math.abs(mesh.positions[vertex * 3 + 2]) < anatomy.trunkWidth(u) * FLESH.garments.reach;
  };
  const pieces = [];
  if (bottom) pieces.push(['kit', reachY, heightAt(FLESH.garments.band[0])], ['band', heightAt(FLESH.garments.band[0]), heightAt(FLESH.garments.band[1])]);
  if (top) pieces.push(['top', heightAt(FLESH.garments.top[0]), heightAt(FLESH.garments.top[1])]);
  const extra = { positions: [], normals: [], skinIndex: [], skinWeight: [], indices: [], regions: [] };
  for (const [role, low, high] of pieces) {
    const slice = sliceSkin(mesh, low, high, notArm);
    const base = mesh.positions.length / 3 + extra.regions.length;
    const out = FLESH.standoff[role];
    for (let vertex = 0; vertex < slice.positions.length / 3; vertex += 1) {
      for (let axis = 0; axis < 3; axis += 1) extra.positions.push(slice.positions[vertex * 3 + axis] + slice.normals[vertex * 3 + axis] * out);
      extra.regions.push(role);
    }
    // (Not spread: a slice is tens of thousands of numbers.)
    for (const value of slice.normals) extra.normals.push(value);
    for (const value of slice.skinIndex) extra.skinIndex.push(value);
    for (const value of slice.skinWeight) extra.skinWeight.push(value);
    for (const index of slice.indices) extra.indices.push(base + index);
  }
  const join = (Type, first, second) => {
    const joined = new Type(first.length + second.length);
    joined.set(first);
    joined.set(second, first.length);
    return joined;
  };
  const total = mesh.positions.length / 3 + extra.regions.length;
  return {
    ...mesh,
    positions: join(Float32Array, mesh.positions, Float32Array.from(extra.positions)),
    normals: join(Float32Array, mesh.normals, Float32Array.from(extra.normals)),
    indices: join(Uint32Array, mesh.indices, Uint32Array.from(extra.indices)),
    skinIndex: join(Uint16Array, mesh.skinIndex, Uint16Array.from(extra.skinIndex)),
    skinWeight: join(Float32Array, mesh.skinWeight, Float32Array.from(extra.skinWeight)),
    regions: [...mesh.regions, ...extra.regions],
    rigid: new Array(total).fill(false),
  };
}

/**
 * The loft's clothes and armour, stood over this skin as they were built over the loft's own (not fitted to it: see the fit notes).
 */
function withLoftCloth(mesh, body) {
  const loft = buildLoftBody(body);
  const cloth = loft.regions.map((region) => region !== 'skin');
  const remap = new Map();
  const keep = [];
  const triangles = [];
  for (let face = 0; face < loft.indices.length; face += 3) {
    const corners = [loft.indices[face], loft.indices[face + 1], loft.indices[face + 2]];
    if (!corners.every((vertex) => cloth[vertex])) continue;
    for (const vertex of corners) {
      if (!remap.has(vertex)) {
        remap.set(vertex, keep.length);
        keep.push(vertex);
      }
    }
    triangles.push(...corners.map((vertex) => remap.get(vertex)));
  }
  const base = mesh.positions.length / 3;
  const pick = (array, size) => Float32Array.from(keep.flatMap((vertex) => Array.from(array.subarray(vertex * size, vertex * size + size))));
  const join = (Type, first, second) => {
    const joined = new Type(first.length + second.length);
    joined.set(first);
    joined.set(second, first.length);
    return joined;
  };
  return {
    ...mesh,
    positions: join(Float32Array, mesh.positions, pick(loft.positions, 3)),
    normals: join(Float32Array, mesh.normals, pick(loft.normals, 3)),
    indices: join(Uint32Array, mesh.indices, Uint32Array.from(triangles.map((index) => index + base))),
    skinIndex: join(Uint16Array, mesh.skinIndex, Uint16Array.from(keep.flatMap((vertex) => Array.from(loft.skinIndex.subarray(vertex * 4, vertex * 4 + 4))))),
    skinWeight: join(Float32Array, mesh.skinWeight, pick(loft.skinWeight, 4)),
    regions: [...mesh.regions, ...keep.map((vertex) => loft.regions[vertex])],
    rigid: [...mesh.rigid, ...keep.map((vertex) => loft.rigid[vertex])],
  };
}
