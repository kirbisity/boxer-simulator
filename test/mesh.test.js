import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, P, PRESETS } from '../src/body.js';
import { buildBodyMesh } from '../src/bodymesh.js';
import { BONE, BONES, bindPoints, boneFrames, fromFrame, toFrame } from '../src/rig.js';
import { vec } from '../src/pose.js';

const light = buildMesh(PRESETS.light);
function buildMesh(inputs) {
  return buildBodyMesh(buildBody(inputs));
}

test('the skin is one closed surface, wound outward', () => {
  const { positions, normals, indices } = light;
  const uses = new Map();
  let outward = 0;
  for (let face = 0; face < indices.length; face += 3) {
    const [a, b, c] = [indices[face], indices[face + 1], indices[face + 2]];
    for (const [i, j] of [[a, b], [b, c], [c, a]]) {
      const key = i < j ? `${i},${j}` : `${j},${i}`;
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
    const u = [positions[b * 3] - positions[a * 3], positions[b * 3 + 1] - positions[a * 3 + 1], positions[b * 3 + 2] - positions[a * 3 + 2]];
    const v = [positions[c * 3] - positions[a * 3], positions[c * 3 + 1] - positions[a * 3 + 1], positions[c * 3 + 2] - positions[a * 3 + 2]];
    if (vec.dot(vec.cross(u, v), [normals[a * 3], normals[a * 3 + 1], normals[a * 3 + 2]]) > 0) outward += 1;
  }
  const open = [...uses.values()].filter((count) => count !== 2).length;
  assert.ok(open <= 4, `${open} edges not shared by exactly two faces`);
  assert.ok(outward / (indices.length / 3) > 0.98, 'faces point outward');
});

test('every vertex is skinned: weights sum to one, and limbs only move their own side', () => {
  const { skinIndex, skinWeight, positions } = light;
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    let sum = 0;
    for (let slot = 0; slot < 4; slot += 1) {
      sum += skinWeight[vertex * 4 + slot];
      const bone = BONES[skinIndex[vertex * 4 + slot]];
      const z = positions[vertex * 3 + 2];
      if (skinWeight[vertex * 4 + slot] > 0 && Math.abs(z) > 0.03 && /^[lr][A-Z]/.test(bone)) assert.equal(bone[0] === 'l', z > 0, `vertex ${vertex} on the ${z > 0 ? 'left' : 'right'} weighted to ${bone}`);
    }
    assert.ok(Math.abs(sum - 1) < 1e-5);
  }
});

test('the body follows its inputs: a trained heavyweight has more of everything than a lightweight', () => {
  const heavy = buildMesh(PRESETS.heavy);
  const width = (mesh) => {
    let most = 0;
    for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
      if (Math.abs(mesh.positions[vertex * 3 + 1] - mesh.bindPoints[P.neck][1] + 0.15) < 0.02) most = Math.max(most, Math.abs(mesh.positions[vertex * 3 + 2]));
    }
    return most;
  };
  assert.ok(heavy.positions.length > light.positions.length, 'more surface');
  assert.ok(width(heavy) > width(light) * 1.1, 'broader through the chest');
});

test('rig frames are orthonormal and carry a point from the bind pose to the posed body and back', () => {
  const body = buildBody(PRESETS.amateur);
  const bind = boneFrames(bindPoints(body), body);
  for (const frame of bind) {
    for (const [a, b] of [['x', 'y'], ['y', 'z'], ['x', 'z']]) assert.ok(Math.abs(vec.dot(frame[a], frame[b])) < 1e-9);
    assert.ok(Math.abs(vec.length(frame.x) - 1) < 1e-9 && Math.abs(vec.length(frame.y) - 1) < 1e-9);
  }
  const elbow = bindPoints(body)[P.lElbow];
  const local = toFrame(bind[BONE.lUpperArm], elbow);
  assert.ok(Math.abs(local[1] - body.lengths.upperArm) < 1e-9 && Math.abs(local[0]) < 1e-9, 'the elbow sits at the end of the upper arm');
  const back = fromFrame(bind[BONE.lUpperArm], local);
  assert.ok(vec.length(vec.sub(back, elbow)) < 1e-9);
});
