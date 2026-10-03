// A low-polygon body, built the way game characters are: each part is a
// loft of elliptical rings along its bones, with a designed profile (the
// deltoid cap, the biceps, the narrow elbow, the calf), and the parts
// overlap where they meet rather than being fused. ~3k triangles for the
// whole body, and no lumps: every ring is a clean ellipse. 'faceted' drops to
// seven sides and flat normals, for a low-poly art look.

import { P } from './body.js';
import { relax, skinWeights } from './bodymesh.js';
import { vec } from './pose.js';
import { BONE, bindPoints, boneFrames } from './rig.js';

// Street tops: where the hem and neckline sit along the trunk (0 hips, 1
// neck), how far the cloth stands off the skin, and how long the sleeves run
// (as a share of the upper arm; above 1, on down the forearm).
export const CLOTHES = {
  tshirt: { hem: 0.02, neck: 0.98, loose: 1.06, sleeve: 0.5, sleeveLoose: 1.22, ribbed: false },
  hoodie: { hem: -0.1, neck: 1.0, loose: 1.11, sleeve: 1.8, sleeveLoose: 1.24, ribbed: true },
};

export const LOFT = {
  // Belly: fat layer thickness (m) past which the abdomen bulges and hangs;
  // how far forward it bulges, and how far below the waistband it hangs,
  // per metre of layer past that.
  bellyFrom: 0.035,
  bellyScale: 0.9,
  bellyDrop: 2.2,
  // Trunk lean radius (m) below which the body looks wasted, and over what
  // span it reaches the BMI floor's look (~0.107 m for a 180 cm man).
  wastingFrom: 0.135,
  wastingSpan: 0.03,
  sides: 18,
  facetedSides: 7,
  // Rings per unit of each part's count; above 1 is denser along the limbs.
  rowDensity: 1.4,
  // A light relaxation rounds the ring edges without losing the shapes.
  relaxPasses: 2,
  relaxAmount: 0.3,
};

const smooth = (t) => t * t * (3 - 2 * t);

/** Piecewise-smooth interpolation through [u, value] stops. */
function profile(stops) {
  return (u) => {
    if (u <= stops[0][0]) return stops[0][1];
    for (let index = 1; index < stops.length; index += 1) {
      const [u0, v0] = stops[index - 1];
      const [u1, v1] = stops[index];
      if (u <= u1) return v0 + (v1 - v0) * smooth((u - u0) / (u1 - u0));
    }
    return stops.at(-1)[1];
  };
}

/**
 * Add one loft to the mesh arrays.
 * @param rings [{ center, depthAxis, widthAxis, depth, width }]
 */
function loft(mesh, rings, sides, { capStart = true, capEnd = true, color = 'skin', inflate = 1, bones = () => null } = {}) {
  const start = mesh.positions.length / 3;
  for (const ring of rings) {
    for (let step = 0; step < sides; step += 1) {
      const angle = (step / sides) * Math.PI * 2;
      const p = vec.add(ring.center, vec.add(vec.scale(ring.depthAxis, Math.cos(angle) * ring.depth * inflate), vec.scale(ring.widthAxis, Math.sin(angle) * ring.width * inflate)));
      mesh.positions.push(...p);
      // Weighted where the body's own surface is beneath it: cloth standing
      // off the skin would otherwise follow the bones less than the skin
      // under it, and the skin would come through when a limb moves.
      mesh.weightPositions.push(...vec.add(ring.center, vec.add(vec.scale(ring.depthAxis, Math.cos(angle) * ring.depth), vec.scale(ring.widthAxis, Math.sin(angle) * ring.width))));
      mesh.colors.push(color);
      mesh.bones.push(bones(ring, Math.cos(angle)));
    }
  }
  for (let row = 0; row < rings.length - 1; row += 1) {
    for (let step = 0; step < sides; step += 1) {
      const a = start + row * sides + step;
      const b = start + row * sides + ((step + 1) % sides);
      mesh.indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
  }
  const cap = (row, flip) => {
    const center = mesh.positions.length / 3;
    mesh.positions.push(...rings[row].center);
    mesh.weightPositions.push(...rings[row].center);
    mesh.colors.push(color);
    mesh.bones.push(bones(rings[row], 0));
    for (let step = 0; step < sides; step += 1) {
      const a = start + row * sides + step;
      const b = start + row * sides + ((step + 1) % sides);
      if (flip) mesh.indices.push(center, b, a);
      else mesh.indices.push(center, a, b);
    }
  };
  if (capStart) cap(0, false);
  if (capEnd) cap(rings.length - 1, true);
}

/** Rings along a straight run from a to b, oriented by a frame's forward axis. */
function along(a, b, forward, count, from, to, depthAt, widthAt, offsetAt = () => 0) {
  const axis = vec.normalize(vec.sub(b, a));
  const depthAxis = vec.normalize(vec.sub(forward, vec.scale(axis, vec.dot(forward, axis))));
  const widthAxis = vec.cross(axis, depthAxis);
  const length = vec.length(vec.sub(b, a));
  const rings = [];
  for (let index = 0; index <= count; index += 1) {
    const t = from + ((to - from) * index) / count;
    const center = vec.add(vec.add(a, vec.scale(axis, t * length)), vec.scale(depthAxis, offsetAt(t)));
    rings.push({ t, center, depthAxis, widthAxis, depth: depthAt(t), width: widthAt(t) });
  }
  return rings;
}

function computeNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let face = 0; face < indices.length; face += 3) {
    const [a, b, c] = [indices[face], indices[face + 1], indices[face + 2]];
    const p = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    const n = vec.cross(vec.sub(p(b), p(a)), vec.sub(p(c), p(a)));
    for (const i of [a, b, c]) for (let axis = 0; axis < 3; axis += 1) normals[i * 3 + axis] += n[axis];
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= length;
    normals[i + 1] /= length;
    normals[i + 2] /= length;
  }
  return normals;
}

/** Split every triangle's corners apart so each face shades flat. */
function facet(positions, indices, colors, bones, weightPositions) {
  const flatPositions = [];
  const flatIndices = [];
  const flatColors = [];
  const flatBones = [];
  const flatWeights = [];
  for (let face = 0; face < indices.length; face += 1) {
    const i = indices[face];
    flatPositions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    flatColors.push(colors[i]);
    flatBones.push(bones[i]);
    flatWeights.push(weightPositions[i * 3], weightPositions[i * 3 + 1], weightPositions[i * 3 + 2]);
    flatIndices.push(face);
  }
  return { positions: flatPositions, indices: flatIndices, colors: flatColors, bones: flatBones, weightPositions: flatWeights };
}

export function buildLoftBody(body, { faceted = false } = {}) {
  const sides = faceted ? LOFT.facetedSides : LOFT.sides;
  const rows = faceted ? 0.5 : LOFT.rowDensity;
  const count = (n) => Math.max(2, Math.round(n * rows));
  const points = bindPoints(body);
  const frames = boneFrames(points, body);
  const at = (name) => points[P[name]];
  const seg = body.segments;
  const L = body.lengths;
  const mesh = { positions: [], weightPositions: [], indices: [], colors: [], bones: [] };
  const build = seg.trunk.tissue.muscle / (seg.trunk.tissue.muscle + seg.trunk.tissue.fat);
  // The trunk is a lean shape (from the radius without fat) under a layer
  // of fat, laid on where fat goes: thickest at the waist and belly, then
  // the hips (more so for women), least over the shoulders.
  const R = seg.trunk.muscleRadius;
  const fatLayer = Math.max(0, seg.trunk.skinRadius - seg.trunk.muscleRadius);
  const female = body.inputs.sex === 'female';
  const forward = [1, 0, 0];

  // Trunk: hips, waist, chest, shoulders, narrowing into the neck.
  const hipHalf = L.hipSpan / 2 + seg.lThigh.muscleRadius * 0.85;
  const neckR = L.headRadius * (0.44 + 0.12 * body.neckIndex);
  const hipFat = female ? 1.6 : 1.1;
  // Wasting (0 at a normal build, 1 at the BMI floor): the abdomen sinks
  // behind the ribs, the waist pinches and the chest shrinks onto its cage.
  const wasting = Math.min(1, Math.max(0, (LOFT.wastingFrom - R) / LOFT.wastingSpan));
  const leanWidth = profile([[-0.12, hipHalf * 0.8], [0.02, hipHalf], [0.3, (L.hipSpan * 0.42 + R * 0.25) * (1 - 0.3 * wasting)], [0.62, (L.shoulderSpan * 0.42 + 0.02) * (1 - 0.14 * wasting)], [0.84, L.shoulderSpan * 0.48 * (1 - 0.06 * wasting)], [0.94, L.shoulderSpan * 0.4], [1.04, neckR * (1.7 + 0.5 * body.neckIndex)], [1.12, neckR * 1.15]]);
  const fatWidth = profile([[-0.12, 0.9 * hipFat], [0.05, 1.25 * hipFat], [0.3, 1.55], [0.6, 1.05], [0.86, 0.55], [1.04, 0.45], [1.12, 0.25]]);
  const leanDepth = profile([[-0.12, R * 0.5], [0.02, R * 0.62], [0.3, R * 0.55 * (1 - 0.3 * wasting)], [0.62, R * 0.62 * (1 + 0.15 * build) * (1 - 0.1 * wasting)], [0.88, R * 0.52], [1.04, neckR * 1.3], [1.12, neckR * 1.05]]);
  const fatDepth = profile([[-0.12, 0.8], [0.1, 1.05], [0.3, 1.45], [0.62, 0.95], [0.88, 0.5], [1.04, 0.6], [1.12, 0.35]]);
  // The belly carries forward of the spine as fat thickens.
  const leanOffset = profile([[0, -0.012], [0.3, 0], [0.65, 0.012], [1, -0.01]]);
  const fatOffset = profile([[0, 0.1], [0.25, 0.55], [0.45, 0.35], [0.65, 0.1], [1, 0]]);
  // Past a thick enough layer the abdomen bulges forward, then hangs: the
  // trunk carries on below the waistband as an apron in front of the thighs,
  // narrowing and thinning to its hem.
  const belly = Math.max(0, fatLayer - LOFT.bellyFrom);
  const bulge = profile([[-0.12, 0.7], [0.15, 1], [0.4, 0.4], [0.6, 0]]);
  const hem = -0.12 - (belly * LOFT.bellyDrop) / vec.length(vec.sub(at('neck'), at('pelvis')));
  const bodyWidth = (u) => leanWidth(u) + fatLayer * fatWidth(u);
  const bodyDepth = (u) => leanDepth(u) + fatLayer * fatDepth(u) + belly * LOFT.bellyScale * bulge(u);
  const bodyLean = (u) => leanOffset(u) + fatLayer * fatOffset(u) + belly * LOFT.bellyScale * 0.8 * bulge(u);
  // 0 at the hem, 1 at the waistband.
  const apron = (u) => Math.sqrt(Math.max(0, (u - hem) / (-0.12 - hem)));
  const width = (u) => (u >= -0.12 ? bodyWidth(u) : bodyWidth(-0.12) * (0.55 + 0.45 * apron(u)));
  const depth = (u) => (u >= -0.12 ? bodyDepth(u) : bodyDepth(-0.12) * (0.3 + 0.7 * apron(u)));
  const lean = (u) => (u >= -0.12 ? bodyLean(u) : bodyLean(-0.12) + bodyDepth(-0.12) * 0.7 * (1 - apron(u)));
  const trunkRings = (from, to, rings) => along(at('pelvis'), at('neck'), forward, rings, from, to, depth, width, lean);
  // Skin weights go by distance; a wide belly lies nearer the hanging
  // forearms than the spine, so the abdomen is bound to the torso alone,
  // and the apron to the pelvis and spine, not the legs it hangs over.
  // The front of a fat belly lies over the thighs too, which swing forward
  // in a crouch; only the sides and back of the hips follow the legs.
  const torso = [BONE.pelvis, BONE.spine, BONE.chest, BONE.lThigh, BONE.rThigh];
  const hanging = [BONE.pelvis, BONE.spine, BONE.chest];
  const abdomen = (ring, front) => (ring.t < -0.12 || (belly > 0 && front > 0.2) ? hanging : ring.t < 0.55 ? torso : null);
  loft(mesh, trunkRings(Math.min(-0.12, hem), 1.12, count(18) + Math.round((-0.12 - Math.min(-0.12, hem)) * 10)), sides, { bones: abdomen });
  // Kit is geometry, not paint: shorts, waistband and (for women) a sports
  // top are lofts a little proud of the skin, so their edges are crisp.
  // Shorts sit on the hips under the belly, which hangs over them.
  const unbulged = (shape, bellyPart) => (u) => shape(u) - belly * LOFT.bellyScale * bellyPart * bulge(u);
  const shortsRings = (from, to, rings) => along(at('pelvis'), at('neck'), forward, rings, from, to, unbulged(bodyDepth, 1), bodyWidth, unbulged(bodyLean, 0.8));
  // Street clothes replace the ring kit: a T-shirt or a hoodie over the
  // trunk, and jeans or joggers to the ankle (see the limbs below).
  const clothing = body.inputs.clothing;
  const outfit = clothing ? CLOTHES[clothing.top] : null;
  if (!clothing) {
    loft(mesh, shortsRings(-0.12, 0.2, count(5)), sides, { color: 'kit', inflate: 1.05, capStart: false, capEnd: false, bones: abdomen });
    loft(mesh, shortsRings(0.17, 0.25, 1), sides, { color: 'band', inflate: 1.08, capStart: false, capEnd: false, bones: abdomen });
  } else {
    loft(mesh, shortsRings(-0.12, 0.2, count(5)), sides, { color: 'pants', inflate: 1.06, capStart: false, capEnd: false, bones: abdomen });
    if (clothing.bottom === 'jeans') loft(mesh, shortsRings(0.12, 0.17, 1), sides, { color: 'belt', inflate: 1.075, capStart: false, capEnd: false, bones: abdomen });
    // The top hangs from the shoulders and drapes over the belly.
    loft(mesh, trunkRings(outfit.hem, outfit.neck, count(14)), sides, { color: 'shirt', inflate: outfit.loose, capStart: false, capEnd: false, bones: abdomen });
    if (outfit.ribbed) loft(mesh, trunkRings(outfit.hem, outfit.hem + 0.06, 1), sides, { color: 'cuff', inflate: outfit.loose + 0.012, capStart: false, capEnd: false, bones: abdomen });
  }
  // Fewer sides cut deeper chords, so the faceted top needs more clearance.
  if (body.inputs.sex === 'female' && !clothing) loft(mesh, trunkRings(0.56, 0.86, count(5)), sides, { color: 'top', inflate: faceted ? 1.1 : 1.05, capStart: false, capEnd: false, bones: abdomen });
  loft(mesh, along(at('neck'), at('head'), forward, count(3), -0.05, 0.6, () => neckR, () => neckR * 1.05), sides, { capEnd: false });

  for (const side of ['l', 'r']) {
    const shoulder = at(`${side}Shoulder`);
    const elbow = at(`${side}Elbow`);
    const hand = at(`${side}Hand`);
    const upperR = seg[`${side}UpperArm`].skinRadius;
    const foreR = seg[`${side}Forearm`].skinRadius;
    const armBuild = seg[`${side}UpperArm`].tissue.muscle / (seg[`${side}UpperArm`].tissue.muscle + seg[`${side}UpperArm`].tissue.fat);
    const armForward = frames[BONE[`${side}UpperArm`]].x;
    // Deltoid cap, biceps and triceps (deeper than wide), the narrow elbow.
    // It starts well inside the trunk so its end never shows at the shoulder.
    // Its root closes to a point inside the shoulder, so no end face shows.
    const upperDepth = profile([[-0.3, upperR * 0.08], [-0.06, upperR * 1.22], [0.15, upperR * 1.2], [0.5, upperR * (1 + 0.15 * armBuild)], [0.9, upperR * 0.74], [1, upperR * 0.7]]);
    const upperWidth = profile([[-0.3, upperR * 0.08], [-0.06, upperR * 1.25], [0.15, upperR * 1.15], [0.5, upperR * 0.92], [1, upperR * 0.72]]);
    loft(mesh, along(shoulder, elbow, armForward, count(10), -0.3, 1.0, upperDepth, upperWidth), sides, { capStart: false });
    // Forearm: full below the elbow, tapering to the wrist inside the glove
    // (or, bare, on to the wrist above the fist).
    const wrist = body.inputs.gloves === false ? 0.84 : 0.74;
    const forearmRings = (from, to, rings) => along(elbow, hand, armForward, rings, from, to,
      profile([[-0.04, upperR * 0.7], [0.2, foreR * 1.05], [0.74, foreR * 0.6], [0.84, foreR * 0.56]]),
      profile([[-0.04, upperR * 0.72], [0.2, foreR * 1.18], [0.74, foreR * 0.68], [0.84, foreR * 0.62]]));
    loft(mesh, forearmRings(-0.04, wrist, count(8)), sides);
    if (outfit) {
      // Sleeves: a T-shirt's stop halfway down the upper arm; a hoodie's
      // run to a ribbed cuff at the wrist.
      // The sleeve follows the arm's own shape, deltoid and all, a little off it.
      const upperArmRings = (from, to, rings) => along(shoulder, elbow, armForward, rings, from, to, (t) => Math.max(upperDepth(t), upperR * 0.9), (t) => Math.max(upperWidth(t), upperR * 0.9));
      // From as deep in the shoulder as the arm's own skin starts, so the
      // arm's root never swings out through the back of the top.
      loft(mesh, upperArmRings(-0.3, outfit.sleeve > 1 ? 1.05 : outfit.sleeve, count(6)), sides, { color: 'shirt', inflate: outfit.sleeveLoose, capStart: false, capEnd: false });
      if (outfit.sleeve > 1) {
        loft(mesh, forearmRings(-0.06, outfit.sleeve - 1, count(5)), sides, { color: 'shirt', inflate: outfit.sleeveLoose, capStart: false, capEnd: false });
        loft(mesh, forearmRings(outfit.sleeve - 1.07, outfit.sleeve - 1, 1), sides, { color: 'cuff', inflate: outfit.sleeveLoose + 0.04, capStart: false, capEnd: false });
      }
    }

    const hip = at(`${side}Hip`);
    const knee = at(`${side}Knee`);
    const foot = at(`${side}Foot`);
    const thighR = seg[`${side}Thigh`].skinRadius;
    const shankR = seg[`${side}Shank`].skinRadius;
    const legForward = frames[BONE[`${side}Thigh`]].x;
    const thighRings = (from, to, rings) => along(hip, knee, legForward, rings, from, to,
      profile([[-0.14, thighR * 1.0], [0.1, thighR * 1.18], [0.5, thighR * 1.0], [0.92, thighR * 0.66], [1, shankR * 0.92]]),
      profile([[-0.14, thighR * 1.0], [0.1, thighR * 1.1], [0.5, thighR * 0.95], [1, shankR * 0.9]]),
      profile([[0, 0], [0.5, thighR * 0.08], [1, 0]]));
    loft(mesh, thighRings(-0.14, 1.0, count(10)), sides);
    if (!clothing) loft(mesh, thighRings(-0.05, 0.42, count(4)), sides, { color: 'kit', inflate: 1.08, capStart: false, capEnd: false });
    else loft(mesh, thighRings(-0.05, 1.04, count(9)), sides, { color: 'pants', inflate: 1.12, capStart: false, capEnd: false });
    // Shin and calf: the calf sits high and behind.
    // The shin starts inside the thigh, so the knee bends without a seam.
    const shinRings = (from, to, rings) => along(knee, foot, frames[BONE[`${side}Shin`]].x, rings, from, to,
      profile([[-0.12, shankR * 0.6], [0, shankR * 0.92], [0.28, shankR * 1.1], [0.7, shankR * 0.7], [0.97, shankR * 0.5]]),
      profile([[-0.12, shankR * 0.6], [0, shankR * 0.9], [0.28, shankR * 0.98], [0.97, shankR * 0.52]]),
      profile([[0, 0], [0.28, -shankR * 0.18], [0.7, -shankR * 0.05], [1, 0]]));
    loft(mesh, shinRings(-0.12, 0.97, count(10)), sides);
    if (clothing) {
      // Jeans fall straight to the shoe; joggers gather into a cuff.
      const joggers = clothing.bottom === 'joggers';
      loft(mesh, along(knee, foot, frames[BONE[`${side}Shin`]].x, count(8), -0.14, 0.9, () => shankR * 1.12, () => shankR * 1.1), sides, { color: 'pants', inflate: joggers ? 1.12 : 1.22, capStart: false, capEnd: false });
      if (joggers) loft(mesh, shinRings(0.82, 0.9, 1), sides, { color: 'cuff2', inflate: 1.15, capStart: false, capEnd: false });
    }
  }

  let { positions, indices, colors, bones, weightPositions } = mesh;
  if (faceted) ({ positions, indices, colors, bones, weightPositions } = facet(positions, indices, colors, bones, weightPositions));
  let positionArray = Float32Array.from(positions);
  const indexArray = Uint32Array.from(indices);
  if (!faceted) positionArray = relax({ positions: positionArray, indices: indexArray }, LOFT.relaxPasses, LOFT.relaxAmount).positions;
  const normals = computeNormals(positionArray, indexArray);
  // `regions` names what each vertex is (skin, kit, band, top) for painting.
  return { positions: positionArray, normals, indices: indexArray, regions: colors, ...skinWeights(Float32Array.from(weightPositions), frames, bones), bindFrames: frames, bindPoints: points };
}
