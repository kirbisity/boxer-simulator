import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, P } from '../src/body.js';
import { BONE, bindPoints } from '../src/rig.js';
import { buildSkinMesh } from '../src/bodystyles.js';
import { BASE_BODY, baseBindJoints, baseBodyMesh, baseStarvation, baseStarvedDetail, measureBaseBody, placeBaseBody } from '../src/basebody.js';
import { baseLoftOptions, buildLoftBody } from '../src/loftbody.js';
import { FLAT_UV } from '../src/skindetail.js';
import { progression } from '../tools/bodysheet-cast.js';

const CAST = [...progression('male'), ...progression('female')].map((row) => ({ ...row, body: buildBody(row.inputs) }));

/** The base skin's own points: the mesh's skin region, in the order the loft adds them (after the cloth). */
const skinPoints = (mesh) => mesh.regions.map((region, index) => (region === 'skin' ? index : -1)).filter((index) => index >= 0);

test('the base style builds for every body of the progression: finite, about a fighter\'s count of triangles, every skin point on a tile', () => {
  for (const { key, body } of CAST) {
    const mesh = buildSkinMesh(body, 'base');
    const name = `${body.inputs.sex} ${key}`;
    for (const value of mesh.positions) if (!Number.isFinite(value)) assert.fail(`${name}: a point is not a number`);
    const triangles = mesh.indices.length / 3;
    // (8k of base mesh, a few hundred more where its seams are split, the fight kit's lofts over it.)
    assert.ok(triangles > 8000 && triangles < 11000, `${name}: ${triangles} triangles`);
    for (const index of skinPoints(mesh)) {
      const [u, v] = [mesh.uvs[index * 2], mesh.uvs[index * 2 + 1]];
      assert.ok(u !== FLAT_UV[0] || v !== FLAT_UV[1], `${name}: skin point ${index} has its tile's coordinates`);
    }
  }
});

test('the reference build gets the base mesh as modelled: every point where the tool put it, scaled to its height (the arms aside)', (t) => {
  // (The model as it is: no shoulder design (BASE_BODY.shoulder null). The default, D2, reshapes the shoulders on purpose.)
  const design = BASE_BODY.shoulder;
  BASE_BODY.shoulder = null;
  t.after(() => {
    BASE_BODY.shoulder = design;
  });
  for (const sex of ['male', 'female']) {
    const data = baseBodyMesh(sex);
    const reference = buildBody(data.reference);
    const H = reference.heightM;
    const { baseParts } = buildLoftBody(reference, { ...baseLoftOptions(false), base: { measure: true } });
    const joints = Object.fromEntries(Object.entries(P).map(([name, index]) => [name, bindPoints(reference)[index]]));
    const rig = measureBaseBody(data, baseParts, H, joints);
    const placed = baseBindJoints(rig, joints, H);
    const { sources } = placeBaseBody(rig, baseParts, () => 1, H, 0, placed.skin, placed.reach);
    let worst = 0;
    // (All but the arms: the upper arm drawn to the game's length, the forearm out to its hand, basebody.js baseBindJoints. The
    // legs and the neck run at the game's lengths too, a few millimetres off the model's.)
    const arm = (index) => /Upper$|Fore$/.test(data.parts[index]);
    for (let vertex = 0; vertex < data.count; vertex += 1) {
      if (arm(data.part[vertex]) || (data.blend[vertex] > 0 && arm(data.part2[vertex]))) continue;
      worst = Math.max(worst, Math.hypot(...[0, 1, 2].map((axis) => sources[vertex * 3 + axis] - data.positions[vertex * 3 + axis] * H)));
    }
    assert.ok(worst < 0.004, `${sex}: a point lands ${(worst * 1000).toFixed(2)} mm from where it was modelled`);
  }
});

test('the rig follows the model: limbs along the skin\'s own axes at the game\'s lengths, bound on the rig\'s roots, the forearm out to the hand', () => {
  for (const { key, body } of CAST) {
    const name = `${body.inputs.sex} ${key}`;
    const mesh = buildSkinMesh(body, 'base');
    const rigPoints = bindPoints(body);
    const bind = mesh.bindPoints;
    const length = (points, a, b) => Math.hypot(...[0, 1, 2].map((axis) => points[P[b]][axis] - points[P[a]][axis]));
    for (const [a, b] of [['lShoulder', 'lElbow'], ['lElbow', 'lHand'], ['lHip', 'lKnee'], ['lKnee', 'lFoot'], ['neck', 'head']]) {
      assert.ok(Math.abs(length(bind, a, b) - length(rigPoints, a, b)) < 1e-6, `${name}: ${a} to ${b} at the game's length`);
    }
    for (const root of ['pelvis', 'neck', 'lHip', 'rHip', 'lShoulder', 'rShoulder']) {
      assert.ok(Math.hypot(...[0, 1, 2].map((axis) => bind[P[root]][axis] - rigPoints[P[root]][axis])) < 1e-9, `${name}: ${root} bound where the rig holds it`);
    }
    // The left forearm's skin reaches within 3 cm of the hand point (under the palm's heel, BASE_BODY.handSeat 2.1 cm).
    const [elbow, hand] = [bind[P.lElbow], bind[P.lHand]];
    const along = hand.map((value, axis) => value - elbow[axis]);
    const reach = Math.hypot(...along);
    let farthest = 0;
    // (The forearm's own skin: points the left forearm carries most of. With the arms hanging closer, a fat man's hip lay within
    // the band beyond his hand.)
    const forearm = (index) => [0, 1, 2, 3].some((slot) => mesh.skinIndex[index * 4 + slot] === BONE.lForearm && mesh.skinWeight[index * 4 + slot] > 0.5);
    for (const index of skinPoints(mesh)) {
      if (!forearm(index)) continue;
      const p = [0, 1, 2].map((axis) => mesh.positions[index * 3 + axis] - elbow[axis]);
      const t = (p[0] * along[0] + p[1] * along[1] + p[2] * along[2]) / reach;
      const off = Math.hypot(...p.map((value, axis) => value - (along[axis] / reach) * t));
      // (Within 9 cm of the bound line: a forearm's 3-4 cm and the skin's offset from its bone, the shoulder's root shift.)
      if (off < 0.09 && t < reach + 0.05) farthest = Math.max(farthest, t);
    }
    assert.ok(reach - farthest < 0.03 && farthest < reach, `${name}: the forearm ends ${((reach - farthest) * 100).toFixed(1)} cm short of the hand point`);
  }
});

test('a crowd in the base style wears the crowd mesh (about 2.5k triangles of skin)', () => {
  const body = CAST.find((row) => row.key === 'average').body;
  const mesh = buildLoftBody(body, { lowDetail: true, base: true });
  const skin = new Set(skinPoints(mesh));
  let triangles = 0;
  for (let corner = 0; corner < mesh.indices.length; corner += 3) if (skin.has(mesh.indices[corner])) triangles += 1;
  assert.ok(triangles > 2300 && triangles < 3200, `${triangles} skin triangles`);
});

test('fat masses: only overweight and up, not in a crowd; firmer and quicker when overweight, slower and looser when very obese', () => {
  const male = progression('male');
  const built = (key, crowd = false) => {
    const body = buildBody(male.find((row) => row.key === key).inputs);
    return crowd ? buildLoftBody(body, { lowDetail: true, base: true }) : buildSkinMesh(body, 'base');
  };
  assert.equal(built('average').slosh, undefined, 'no masses on an average build');
  assert.equal(built('veryObese', true).slosh, undefined, 'none in a crowd');
  const over = built('overweight').slosh.figures;
  const huge = built('veryObese').slosh;
  assert.ok(over.omega / (2 * Math.PI) > 4 && over.zeta > 0.25, 'overweight: about 4-5 Hz, damping about 0.3');
  assert.ok(huge.figures.omega / (2 * Math.PI) < 2.6 && huge.figures.zeta < 0.16, 'very obese: about 2-2.5 Hz, damping 0.12-0.15');
  assert.ok(huge.masses.some((mass) => mass.name === 'belly'), 'a very obese body has a belly mass');
});

test('starvation: the emaciated contour and detail only on a starved body, none on a normal one', () => {
  for (const sex of ['male', 'female']) {
    const rows = progression(sex);
    const starved = buildBody(rows.find((row) => row.key === 'starved').inputs);
    const average = buildBody(rows.find((row) => row.key === 'average').inputs);
    assert.ok(baseStarvation(starved) > 0.9, `${sex}: the starved build is starved`);
    assert.equal(baseStarvation(average), 0, `${sex}: an average build is not`);
    assert.equal(baseStarvedDetail(average), null, `${sex}: no rib detail on an average build`);
    assert.ok(baseStarvedDetail(starved)?.slopes.length > 0, `${sex}: rib detail on a starved build`);
    const delta = baseBodyMesh(sex).starved;
    const most = delta.reduce((m, value) => Math.max(m, Math.abs(value)), 0);
    assert.ok(most > 0.003 && most <= 0.0151, `${sex}: a contour of up to 2.5 cm (${(most * 170).toFixed(1)} cm at 1.7 m)`);
  }
});
