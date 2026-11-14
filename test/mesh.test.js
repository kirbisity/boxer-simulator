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

/** Share of faces whose normal points away from the nearest bone: outward. */
function outwardShare(mesh) {
  const { positions, indices, bindFrames } = mesh;
  const p = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  let outward = 0;
  for (let face = 0; face < indices.length; face += 3) {
    const [a, b, c] = [p(indices[face]), p(indices[face + 1]), p(indices[face + 2])];
    const normal = vec.cross(vec.sub(b, a), vec.sub(c, a));
    const centroid = vec.scale(vec.add(a, vec.add(b, c)), 1 / 3);
    let nearest = null;
    let best = Infinity;
    for (const frame of bindFrames) {
      const ab = vec.sub(frame.end, frame.origin);
      const t = Math.max(0, Math.min(1, vec.dot(vec.sub(centroid, frame.origin), ab) / Math.max(1e-9, vec.dot(ab, ab))));
      const onBone = vec.add(frame.origin, vec.scale(ab, t));
      const distance = vec.length(vec.sub(centroid, onBone));
      if (distance < best) {
        best = distance;
        nearest = onBone;
      }
    }
    if (vec.dot(normal, vec.sub(centroid, nearest)) > 0) outward += 1;
  }
  return outward / (indices.length / 3);
}

test('every body style is wound outward, so the ink outline stays behind it', async () => {
  const { buildLoftBody } = await import('../src/loftbody.js');
  const body = buildBody(PRESETS.heavy);
  for (const [name, mesh] of [['dense', buildBodyMesh(body)], ['smoothed', buildBodyMesh(body, 'skin', 0.024, 4)], ['lofted', buildLoftBody(body)], ['faceted', buildLoftBody(body, { faceted: true })]]) {
    // Big faceted faces near the joints are sometimes nearest the wrong
    // bone, so the measure reads a little low there; inside-out reads ~10%.
    const share = outwardShare(mesh);
    assert.ok(share > 0.8, `${name}: ${(share * 100).toFixed(0)}% of faces outward`);
  }
});

test('a plate breastplate rides the chest bone alone (rigid: no bend, twist or dent); the fauld below stays lofted', async () => {
  const { buildLoftBody } = await import('../src/loftbody.js');
  for (const preset of ['knight', 'joan', 'hidalgo']) {
    const mesh = buildLoftBody(buildBody(PRESETS[preset]));
    const rigid = mesh.rigid.map((flag, vertex) => (flag ? vertex : -1)).filter((vertex) => vertex >= 0);
    assert.ok(rigid.length > 100, `${preset}: a rigid breastplate`);
    const steel = rigid.filter((vertex) => mesh.regions[vertex] === 'steel' || mesh.regions[vertex] === 'steel2');
    assert.ok(steel.length > 50, `${preset}: the plate itself is rigid`);
    for (const vertex of rigid) {
      assert.equal(mesh.skinIndex[vertex * 4], BONE.chest);
      assert.equal(mesh.skinWeight[vertex * 4], 1);
    }
    // Below the waist the plate's fauld still follows the hips.
    const lowSteel = mesh.regions.some((region, vertex) => !mesh.rigid[vertex] && region === 'steel' && mesh.positions[vertex * 3 + 1] < mesh.bindPoints[P.pelvis][1] + 0.1);
    assert.ok(lowSteel, `${preset}: a lofted fauld`);
  }
  assert.ok(!buildLoftBody(buildBody(PRESETS.heavy)).rigid.some(Boolean), 'no rigid piece without a breastplate');
});

test('steel is stiff: a plate\'s points all carry the same weights, so no plate bends; a crowd\'s body is left as it was', async () => {
  const { buildLoftBody, stiffnessOf } = await import('../src/loftbody.js');
  assert.equal(stiffnessOf('steel'), 'plate');
  assert.equal(stiffnessOf('cloth'), null);
  const distinct = (mesh) => {
    const seen = new Set();
    let steel = 0;
    mesh.regions.forEach((region, vertex) => {
      if (region !== 'steel') return;
      steel += 1;
      seen.add([0, 1, 2, 3].map((slot) => `${mesh.skinIndex[vertex * 4 + slot]}:${mesh.skinWeight[vertex * 4 + slot].toFixed(4)}`).join(' '));
    });
    return seen.size / steel;
  };
  const body = buildBody(PRESETS.knight);
  assert.ok(distinct(buildLoftBody(body)) < 0.15, 'a harness of stiff plates and rows');
  assert.ok(distinct(buildLoftBody(body, { lowDetail: true })) > 0.5, 'the crowd\'s harness follows the body point by point');
});

test('loose cloth sways and stiff steel does not: looseness is on cloth standing off the body only, never in a crowd; a swing lags its bone and comes to rest', async () => {
  const { buildLoftBody } = await import('../src/loftbody.js');
  const { ClothSwing, CLOTH_SWAY } = await import('../src/clothsway.js');
  const body = buildBody({ ...PRESETS.light, outfit: { kind: 'ronin', design: 2 } });
  const mesh = buildLoftBody(body);
  assert.ok(mesh.sway.some((share) => share > 0.05), 'a kimono hangs loose somewhere');
  mesh.regions.forEach((region, vertex) => {
    if (region === 'skin' || region === 'steel') assert.equal(mesh.sway[vertex], 0, `${region} does not sway`);
  });
  assert.equal(buildLoftBody(body, { lowDetail: true }).sway, undefined);
  const frames = (x) => BONES.map(() => ({ origin: [x, 1, 0] }));
  const swing = new ClothSwing(BONES.length);
  swing.update(frames(0), 1 / 60);
  for (let step = 1; step <= 12; step += 1) swing.update(frames(step * 0.05), 1 / 60);
  assert.ok(swing.uniform.value[0] < -0.01, 'the cloth hangs behind a bone moving off');
  assert.ok(Math.abs(swing.uniform.value[0]) <= CLOTH_SWAY.reach + 1e-6);
  for (let step = 0; step < 600; step += 1) swing.update(frames(0.6), 1 / 60);
  assert.ok(Math.abs(swing.uniform.value[0]) < 1e-3, 'and comes to rest when the bone does');
});

test('the horse peoples\' kit and the armies that met them loft whole: every design of each new outfit, its armour drawn', async () => {
  const { buildLoftBody, ARMOR_KINDS } = await import('../src/loftbody.js');
  const { OUTFITS } = await import('../src/outfits.js');
  const kinds = ['xiongnu', 'hun', 'hunNoble', 'lateRoman', 'goth', 'gothNoble', 'republicanLegionary', 'cataphract', 'parthianArcher'];
  for (const kind of kinds) {
    OUTFITS[kind].designs.forEach((design, index) => {
      if (design.armor) assert.ok(ARMOR_KINDS[design.armor.kind], `${kind} #${index}: armour ${design.armor.kind} is drawn`);
      const mesh = buildLoftBody(buildBody({ ...PRESETS.heavy, outfit: { kind, design: index }, accessories: [] }));
      assert.ok(mesh.positions.length > 0, `${kind} #${index}`);
      if (design.armor) assert.ok(mesh.regions.some((region) => region !== 'skin'), `${kind} #${index}: something over the skin`);
    });
  }
  // The cataphract is in iron to the wrists and the ankles.
  const cataphract = buildLoftBody(buildBody({ ...PRESETS.heavy, outfit: { kind: 'cataphract', design: 0 }, accessories: [] }));
  const steelBelow = cataphract.regions.some((region, vertex) => (region === 'steel' || region === 'steel2') && cataphract.positions[vertex * 3 + 1] < cataphract.bindPoints[P.lKnee][1] - 0.1);
  assert.ok(steelBelow, 'iron on the shins');
});
