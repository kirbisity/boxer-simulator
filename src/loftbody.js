// A low-polygon body, built the way game characters are: each part is a
// loft of elliptical rings along its bones, with a designed profile (the
// deltoid cap, the biceps, the narrow elbow, the calf), and the parts
// overlap where they meet rather than being fused. ~3k triangles for the
// whole body, and no lumps: every ring is a clean ellipse. 'faceted' drops to
// seven sides and flat normals, for a low-poly art look.

import { P } from './body.js';
import { skinWeights } from './bodymesh.js';
import { vec } from './pose.js';
import { BONE, bindPoints, boneFrames } from './rig.js';

export const LOFT = {
  sides: 14,
  facetedSides: 7,
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
function loft(mesh, rings, sides, { capStart = true, capEnd = true, color = 'skin', inflate = 1 } = {}) {
  const start = mesh.positions.length / 3;
  for (const ring of rings) {
    for (let step = 0; step < sides; step += 1) {
      const angle = (step / sides) * Math.PI * 2;
      const p = vec.add(ring.center, vec.add(vec.scale(ring.depthAxis, Math.cos(angle) * ring.depth * inflate), vec.scale(ring.widthAxis, Math.sin(angle) * ring.width * inflate)));
      mesh.positions.push(...p);
      mesh.colors.push(color);
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
    mesh.colors.push(color);
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
    rings.push({ center, depthAxis, widthAxis, depth: depthAt(t), width: widthAt(t) });
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
function facet(positions, indices, colors) {
  const flatPositions = [];
  const flatIndices = [];
  const flatColors = [];
  for (let face = 0; face < indices.length; face += 1) {
    const i = indices[face];
    flatPositions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    flatColors.push(colors[i]);
    flatIndices.push(face);
  }
  return { positions: flatPositions, indices: flatIndices, colors: flatColors };
}

export function buildLoftBody(body, { faceted = false } = {}) {
  const sides = faceted ? LOFT.facetedSides : LOFT.sides;
  const rows = faceted ? 0.5 : 1;
  const count = (n) => Math.max(2, Math.round(n * rows));
  const points = bindPoints(body);
  const frames = boneFrames(points, body);
  const at = (name) => points[P[name]];
  const seg = body.segments;
  const L = body.lengths;
  const mesh = { positions: [], indices: [], colors: [] };
  const fat = seg.trunk.tissue.fat / seg.trunk.mass;
  const build = seg.trunk.tissue.muscle / (seg.trunk.tissue.muscle + seg.trunk.tissue.fat);
  const R = seg.trunk.skinRadius;
  const forward = [1, 0, 0];

  // Trunk: hips, waist, chest, shoulders, narrowing into the neck.
  const hipHalf = L.hipSpan / 2 + seg.lThigh.skinRadius * 0.85;
  const neckR = L.headRadius * (0.44 + 0.12 * body.neckIndex);
  // The top slopes from the shoulders up into the neck: the trapezius.
  const width = profile([[-0.12, hipHalf * 0.8], [0.02, hipHalf], [0.3, L.hipSpan * 0.42 + R * 0.25 + fat * 0.1], [0.62, L.shoulderSpan * 0.42 + 0.02], [0.84, L.shoulderSpan * 0.48], [0.94, L.shoulderSpan * 0.4], [1.04, neckR * (1.7 + 0.5 * body.neckIndex)], [1.12, neckR * 1.15]]);
  const depth = profile([[-0.12, R * 0.5], [0.02, R * 0.62], [0.3, R * (0.55 + fat * 0.8)], [0.62, R * 0.62 * (1 + 0.15 * build)], [0.88, R * 0.52], [1.04, neckR * 1.3], [1.12, neckR * 1.05]]);
  const lean = profile([[0, -0.012], [0.3, fat * 0.05], [0.65, 0.012], [1, -0.01]]);
  const trunkRings = (from, to, rings) => along(at('pelvis'), at('neck'), forward, rings, from, to, depth, width, lean);
  loft(mesh, trunkRings(-0.12, 1.12, count(18)), sides);
  // Kit is geometry, not paint: shorts, waistband and (for women) a sports
  // top are lofts a little proud of the skin, so their edges are crisp.
  loft(mesh, trunkRings(-0.12, 0.2, count(5)), sides, { color: 'kit', inflate: 1.05, capStart: false, capEnd: false });
  loft(mesh, trunkRings(0.17, 0.25, 1), sides, { color: 'band', inflate: 1.08, capStart: false, capEnd: false });
  // Fewer sides cut deeper chords, so the faceted top needs more clearance.
  if (body.inputs.sex === 'female') loft(mesh, trunkRings(0.56, 0.86, count(5)), sides, { color: 'top', inflate: faceted ? 1.1 : 1.05, capStart: false, capEnd: false });
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
    loft(mesh, along(shoulder, elbow, armForward, count(10), -0.3, 1.0,
      profile([[-0.3, upperR * 0.45], [-0.06, upperR * 1.22], [0.15, upperR * 1.2], [0.5, upperR * (1 + 0.15 * armBuild)], [0.9, upperR * 0.74], [1, upperR * 0.7]]),
      profile([[-0.3, upperR * 0.45], [-0.06, upperR * 1.25], [0.15, upperR * 1.15], [0.5, upperR * 0.92], [1, upperR * 0.72]])), sides);
    // Forearm: full below the elbow, tapering to the wrist inside the glove.
    loft(mesh, along(elbow, hand, armForward, count(8), -0.04, 0.74,
      profile([[-0.04, upperR * 0.7], [0.2, foreR * 1.05], [0.74, foreR * 0.6]]),
      profile([[-0.04, upperR * 0.72], [0.2, foreR * 1.18], [0.74, foreR * 0.68]])), sides);

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
    loft(mesh, thighRings(-0.05, 0.42, count(4)), sides, { color: 'kit', inflate: 1.08, capStart: false, capEnd: false });
    // Shin and calf: the calf sits high and behind.
    loft(mesh, along(knee, foot, frames[BONE[`${side}Shin`]].x, count(10), 0, 0.97,
      profile([[0, shankR * 0.9], [0.28, shankR * 1.1], [0.7, shankR * 0.7], [0.97, shankR * 0.5]]),
      profile([[0, shankR * 0.88], [0.28, shankR * 0.98], [0.97, shankR * 0.52]]),
      profile([[0, 0], [0.28, -shankR * 0.18], [0.7, -shankR * 0.05], [1, 0]])), sides);
  }

  let { positions, indices, colors } = mesh;
  if (faceted) ({ positions, indices, colors } = facet(positions, indices, colors));
  const positionArray = Float32Array.from(positions);
  const indexArray = Uint32Array.from(indices);
  const normals = computeNormals(positionArray, indexArray);
  // `regions` names what each vertex is (skin, kit, band, top) for painting.
  return { positions: positionArray, normals, indices: indexArray, regions: colors, ...skinWeights(positionArray, frames), bindFrames: frames, bindPoints: points };
}
