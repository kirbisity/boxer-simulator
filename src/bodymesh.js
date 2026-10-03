// The body's skin as one continuous surface. The anatomy is written as a
// signed distance field: each muscle group, fat deposit and bony landmark is
// a rounded primitive sized from the body model, and the primitives are
// blended with a smooth minimum so they flow into each other the way flesh
// does. The field is meshed in the bind pose (surface nets) and every vertex
// is weighted to its nearest bones for skinning. No Three.js here: the
// output is plain arrays, so it can be built and checked in Node.

import { P } from './body.js';
import { vec } from './pose.js';
import { BONES, bindPoints, boneFrames } from './rig.js';

export const MESH = {
  cell: 0.013, // m: grid spacing; ~1.5 cm keeps a finger-width of detail
  blend: 0.035, // m: how far apart two shapes start to merge
  weightPower: 6, // sharper means stiffer joints, softer means rubberier
  maxInfluences: 4,
};

// ---- Primitives -------------------------------------------------------------

/** A tapered capsule: radius r1 at a, r2 at b. */
function cone(a, b, r1, r2) {
  const ab = vec.sub(b, a);
  const lengthSquared = vec.dot(ab, ab);
  const pad = Math.max(r1, r2);
  return {
    box: [Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad, Math.min(a[2], b[2]) - pad, Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad, Math.max(a[2], b[2]) + pad],
    distance(x, y, z) {
      const px = x - a[0];
      const py = y - a[1];
      const pz = z - a[2];
      let t = (px * ab[0] + py * ab[1] + pz * ab[2]) / lengthSquared;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = px - ab[0] * t;
      const dy = py - ab[1] * t;
      const dz = pz - ab[2] * t;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) - (r1 + (r2 - r1) * t);
    },
  };
}

/** An ellipsoid with semi-axes `radii` along the axes of `frame` (default: world). */
function ellipsoid(center, radii, axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
  const pad = Math.max(...radii);
  return {
    box: [center[0] - pad, center[1] - pad, center[2] - pad, center[0] + pad, center[1] + pad, center[2] + pad],
    distance(x, y, z) {
      const d = [x - center[0], y - center[1], z - center[2]];
      const u = vec.dot(d, axes[0]) / radii[0];
      const v = vec.dot(d, axes[1]) / radii[1];
      const w = vec.dot(d, axes[2]) / radii[2];
      const k0 = Math.sqrt(u * u + v * v + w * w);
      const k1 = Math.sqrt((u / radii[0]) ** 2 + (v / radii[1]) ** 2 + (w / radii[2]) ** 2);
      return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(...radii);
    },
  };
}

/**
 * The anatomy, as primitives in the bind pose.
 * @param layer 'skin' (everything, with fat) or 'muscle' (no fat, slimmer)
 */
export function anatomy(body, layer = 'skin') {
  const points = bindPoints(body);
  const at = (name) => points[P[name]];
  const seg = body.segments;
  const L = body.lengths;
  const H = body.heightM;
  const skin = layer === 'skin';
  const radius = (key) => (skin ? seg[key].skinRadius : seg[key].muscleRadius);
  const fatShare = (key) => seg[key].tissue.fat / seg[key].mass;
  const muscle = (key) => seg[key].tissue.muscle / (seg[key].tissue.muscle + seg[key].tissue.fat);
  const female = body.inputs.sex === 'female';
  const shapes = [];
  const lerp = vec.lerp;

  // Trunk: pelvis basin, waist, rib cage, with the muscles that shape it.
  const pelvis = at('pelvis');
  const neck = at('neck');
  const trunkAt = (u, forward = 0, left = 0) => vec.add(lerp(pelvis, neck, u), [forward, 0, left]);
  const R = radius('trunk');
  const trunkFat = skin ? fatShare('trunk') : 0;
  const build = muscle('trunk');
  const chestHalf = L.shoulderSpan * 0.4 + 0.02;
  const depth = R * 0.6;
  shapes.push(ellipsoid(trunkAt(0.66), [depth * (1 + 0.2 * build), L.trunk * 0.3, chestHalf]));
  shapes.push(ellipsoid(trunkAt(0.36, trunkFat * 0.1), [depth * (0.92 + trunkFat * 1.6), L.trunk * 0.26, L.hipSpan * 0.5 + R * 0.3 + trunkFat * 0.12]));
  shapes.push(ellipsoid(trunkAt(0.06, -0.01), [depth * 0.95, L.trunk * 0.2, L.hipSpan / 2 + radius('lThigh') * 0.75]));
  for (const side of [1, -1]) {
    // Glutes, pectorals (or a sports-top bust), lats.
    shapes.push(ellipsoid(trunkAt(0.02, -depth * 0.55, side * L.hipSpan * 0.32), [radius('lThigh') * 0.8, radius('lThigh') * 0.95, radius('lThigh') * 0.85]));
    const pec = female ? [0.05, 0.055, 0.065] : [0.03 + 0.03 * build, 0.06, 0.075 + 0.02 * build];
    shapes.push(ellipsoid(trunkAt(female ? 0.72 : 0.78, depth * 0.62, side * chestHalf * 0.42), pec));
    shapes.push(ellipsoid(trunkAt(0.62, -depth * 0.25, side * chestHalf * 0.82), [depth * 0.55, L.trunk * 0.22, 0.03 + 0.03 * build]));
    // Trapezius from the neck to the shoulder, deltoid over the joint.
    const shoulder = at(side > 0 ? 'lShoulder' : 'rShoulder');
    shapes.push(cone(lerp(neck, shoulder, 0.1), lerp(neck, shoulder, 0.85), 0.045 + 0.025 * body.neckIndex, 0.035));
    shapes.push(ellipsoid(vec.add(shoulder, [0, 0.005, 0]), [radius('lUpperArm') * 1.25, radius('lUpperArm') * 1.3, radius('lUpperArm') * 1.2]));
  }
  if (trunkFat > 0.15) shapes.push(ellipsoid(trunkAt(0.33, depth * 0.55), [0.04 + trunkFat * 0.2, L.trunk * 0.18, L.hipSpan * 0.45]));

  // Neck into the base of the skull (the head itself is built separately).
  const neckRadius = L.headRadius * (0.44 + 0.12 * body.neckIndex) * (skin ? 1 : 0.92);
  shapes.push(cone(vec.add(neck, [0, -0.02, 0]), lerp(neck, at('head'), 0.55), neckRadius * 1.2, neckRadius));

  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    const shoulder = at(`${side}Shoulder`);
    const elbow = at(`${side}Elbow`);
    const hand = at(`${side}Hand`);
    const upperR = radius(`${side}UpperArm`);
    const foreR = radius(`${side}Forearm`);
    const armForward = [1, 0, 0];
    const armMuscle = muscle(`${side}UpperArm`);
    shapes.push(cone(shoulder, elbow, upperR * 0.95, upperR * 0.72));
    // Biceps in front, triceps behind, bulging with training.
    const belly = upperR * (0.55 + 0.25 * armMuscle);
    shapes.push(cone(vec.add(lerp(shoulder, elbow, 0.3), vec.scale(armForward, upperR * 0.32)), vec.add(lerp(shoulder, elbow, 0.75), vec.scale(armForward, upperR * 0.3)), belly, belly * 0.7));
    shapes.push(cone(vec.add(lerp(shoulder, elbow, 0.2), vec.scale(armForward, -upperR * 0.3)), vec.add(lerp(shoulder, elbow, 0.7), vec.scale(armForward, -upperR * 0.28)), belly * 1.05, belly * 0.8));
    // Forearm: thick below the elbow, narrow at the wrist (inside the glove).
    const wrist = lerp(elbow, hand, 0.72);
    shapes.push(cone(lerp(elbow, hand, 0.02), lerp(elbow, hand, 0.35), foreR * 1.15, foreR * 1.05));
    shapes.push(cone(lerp(elbow, hand, 0.35), wrist, foreR * 1.05, foreR * 0.62));
    shapes.push(ellipsoid(elbow, [upperR * 0.62, upperR * 0.6, upperR * 0.62]));

    const hip = at(`${side}Hip`);
    const knee = at(`${side}Knee`);
    const foot = at(`${side}Foot`);
    const thighR = radius(`${side}Thigh`);
    const shankR = radius(`${side}Shank`);
    const legMuscle = muscle(`${side}Thigh`);
    const hipTop = vec.add(hip, [0, 0.02, sign * 0.01]);
    shapes.push(cone(hipTop, knee, thighR * 1.12, thighR * 0.62));
    // Quadriceps sweep in front, hamstrings behind, inner thigh.
    const quad = thighR * (0.55 + 0.25 * legMuscle);
    shapes.push(cone(vec.add(lerp(hip, knee, 0.2), [thighR * 0.3, 0, sign * thighR * 0.1]), vec.add(lerp(hip, knee, 0.82), [thighR * 0.32, 0, 0]), quad, quad * 0.6));
    shapes.push(cone(vec.add(lerp(hip, knee, 0.15), [-thighR * 0.3, 0, 0]), vec.add(lerp(hip, knee, 0.7), [-thighR * 0.28, 0, 0]), quad * 0.95, quad * 0.7));
    shapes.push(ellipsoid(knee, [shankR * 0.95, shankR * 0.9, shankR * 0.9]));
    // Shin and calf: the calf's two heads bulge high at the back.
    const ankle = lerp(knee, foot, 0.95);
    shapes.push(cone(knee, ankle, shankR * 0.82, shankR * 0.5));
    const calf = shankR * (0.62 + 0.2 * muscle(`${side}Shank`));
    shapes.push(cone(vec.add(lerp(knee, foot, 0.15), [-shankR * 0.32, 0, 0]), vec.add(lerp(knee, foot, 0.5), [-shankR * 0.2, 0, 0]), calf, calf * 0.55));
  }
  void H;
  return { shapes, points };
}

// ---- Field and surface -------------------------------------------------------

function smoothMin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

/** Sample the blended field on a grid; each shape only touches its own box. */
export function sampleField(shapes, cell = MESH.cell, blend = MESH.blend) {
  const margin = blend + cell * 2;
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
          const d = shape.distance(low[0] + i * cell, y, z);
          field[index] = smoothMin(field[index], d, blend);
        }
      }
    }
  }
  return { field, size, low, cell };
}

const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

/** Surface nets: one vertex per cell the surface crosses, quads across each crossing edge. */
export function surfaceNets({ field, size, low, cell }) {
  const [nx, ny, nz] = size;
  const at = (i, j, k) => field[i + nx * (j + ny * k)];
  const cellVertex = new Int32Array(nx * ny * nz).fill(-1);
  const positions = [];
  const normals = [];
  const values = new Float32Array(8);
  for (let k = 0; k < nz - 1; k += 1) {
    for (let j = 0; j < ny - 1; j += 1) {
      for (let i = 0; i < nx - 1; i += 1) {
        let inside = 0;
        for (let c = 0; c < 8; c += 1) {
          values[c] = at(i + CORNERS[c][0], j + CORNERS[c][1], k + CORNERS[c][2]);
          if (values[c] < 0) inside += 1;
        }
        if (inside === 0 || inside === 8) continue;
        // The vertex sits at the mean of the edge crossings.
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let count = 0;
        for (const [a, b] of EDGES) {
          if ((values[a] < 0) === (values[b] < 0)) continue;
          const t = values[a] / (values[a] - values[b]);
          sx += CORNERS[a][0] + (CORNERS[b][0] - CORNERS[a][0]) * t;
          sy += CORNERS[a][1] + (CORNERS[b][1] - CORNERS[a][1]) * t;
          sz += CORNERS[a][2] + (CORNERS[b][2] - CORNERS[a][2]) * t;
          count += 1;
        }
        const u = sx / count;
        const v = sy / count;
        const w = sz / count;
        // Normal from the trilinear field's gradient at the vertex: smooth across cells.
        const gx = (1 - v) * (1 - w) * (values[1] - values[0]) + v * (1 - w) * (values[3] - values[2]) + (1 - v) * w * (values[5] - values[4]) + v * w * (values[7] - values[6]);
        const gy = (1 - u) * (1 - w) * (values[2] - values[0]) + u * (1 - w) * (values[3] - values[1]) + (1 - u) * w * (values[6] - values[4]) + u * w * (values[7] - values[5]);
        const gz = (1 - u) * (1 - v) * (values[4] - values[0]) + u * (1 - v) * (values[5] - values[1]) + (1 - u) * v * (values[6] - values[2]) + u * v * (values[7] - values[3]);
        const g = Math.hypot(gx, gy, gz) || 1;
        cellVertex[i + nx * (j + ny * k)] = positions.length / 3;
        positions.push(low[0] + (i + u) * cell, low[1] + (j + v) * cell, low[2] + (k + w) * cell);
        normals.push(gx / g, gy / g, gz / g);
      }
    }
  }
  const indices = [];
  const vertexAt = (i, j, k) => cellVertex[i + nx * (j + ny * k)];
  // Wound counter-clockwise seen from outside (the field rises outward).
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, b, c, a, c, d);
    else indices.push(a, c, b, a, d, c);
  };
  for (let k = 1; k < nz - 1; k += 1) {
    for (let j = 1; j < ny - 1; j += 1) {
      for (let i = 1; i < nx - 1; i += 1) {
        const here = at(i, j, k) < 0;
        if (here !== (at(i + 1, j, k) < 0)) quad(vertexAt(i, j, k), vertexAt(i, j - 1, k), vertexAt(i, j - 1, k - 1), vertexAt(i, j, k - 1), here);
        if (here !== (at(i, j + 1, k) < 0)) quad(vertexAt(i, j, k), vertexAt(i, j, k - 1), vertexAt(i - 1, j, k - 1), vertexAt(i - 1, j, k), here);
        if (here !== (at(i, j, k + 1) < 0)) quad(vertexAt(i, j, k), vertexAt(i - 1, j, k), vertexAt(i - 1, j - 1, k), vertexAt(i, j - 1, k), here);
      }
    }
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), indices: Uint32Array.from(indices) };
}

// ---- Skin weights ------------------------------------------------------------

function segmentDistance(p, a, b) {
  const ab = vec.sub(b, a);
  const t = Math.max(0, Math.min(1, vec.dot(vec.sub(p, a), ab) / Math.max(1e-9, vec.dot(ab, ab))));
  return vec.length(vec.sub(p, vec.add(a, vec.scale(ab, t))));
}

// A limb bone may only move skin on its own side of the body, so the inside
// of one thigh is never dragged along by the other leg.
const SIDE = BONES.map((name) => (/^l[A-Z]/.test(name) ? 1 : /^r[A-Z]/.test(name) ? -1 : 0));

/** Up to four bone influences per vertex, by inverse distance to each bone's segment. */
export function skinWeights(positions, frames) {
  const count = positions.length / 3;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const scores = new Float64Array(BONES.length);
  for (let vertex = 0; vertex < count; vertex += 1) {
    const p = [positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]];
    const side = p[2] > 0.02 ? 1 : p[2] < -0.02 ? -1 : 0;
    for (let bone = 0; bone < BONES.length; bone += 1) {
      if (SIDE[bone] !== 0 && side !== 0 && SIDE[bone] !== side) {
        scores[bone] = 0;
        continue;
      }
      const d = Math.max(0.01, segmentDistance(p, frames[bone].origin, frames[bone].end));
      scores[bone] = 1 / d ** MESH.weightPower;
    }
    const best = [...scores.keys()].sort((a, b) => scores[b] - scores[a]).slice(0, MESH.maxInfluences);
    const total = best.reduce((sum, bone) => sum + scores[bone], 0);
    best.forEach((bone, slot) => {
      skinIndex[vertex * 4 + slot] = bone;
      skinWeight[vertex * 4 + slot] = scores[bone] / total;
    });
  }
  return { skinIndex, skinWeight };
}

/** Everything a renderer needs to skin this body: bind-pose surface, weights, bind frames. */
export function buildBodyMesh(body, layer = 'skin', cell = MESH.cell) {
  const { shapes, points } = anatomy(body, layer);
  const surface = surfaceNets(sampleField(shapes, cell));
  const frames = boneFrames(points, body);
  return { ...surface, ...skinWeights(surface.positions, frames), bindFrames: frames, bindPoints: points };
}

