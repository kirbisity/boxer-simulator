import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBody } from '../src/body.js';
import { buildSkinMesh } from '../src/bodystyles.js';
import { BASE_BODY, baseBodyMesh, measureBaseBody, placeBaseBody } from '../src/basebody.js';
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

test('measured and placed again on its own joints and the reference rings, the base mesh comes back as modelled', () => {
  for (const sex of ['male', 'female']) {
    const data = baseBodyMesh(sex);
    const reference = buildBody(data.reference);
    const H = reference.heightM;
    const { baseParts } = buildLoftBody(reference, { ...baseLoftOptions(false), base: { measure: true } });
    const rig = measureBaseBody(data, baseParts, H);
    // The same rings on the mesh's own joints: every point should land where it was modelled.
    const own = Object.fromEntries(Object.entries(baseParts).map(([name, part]) => [name, { ...part, a: data.joints[BASE_BODY.axes[name][0]].map((v) => v * H), b: data.joints[BASE_BODY.axes[name][1]].map((v) => v * H) }]));
    const { sources } = placeBaseBody(rig, own, () => 1, H);
    let worst = 0;
    for (let vertex = 0; vertex < data.count; vertex += 1) {
      worst = Math.max(worst, Math.hypot(...[0, 1, 2].map((axis) => sources[vertex * 3 + axis] - data.positions[vertex * 3 + axis] * H)));
    }
    assert.ok(worst < 0.0005, `${sex}: a point comes back ${(worst * 1000).toFixed(2)} mm from where it was modelled`);
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
