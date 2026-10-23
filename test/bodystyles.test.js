import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, P, PRESETS } from '../src/body.js';
import { BODY_STYLE_KEYS, buildSkinMesh } from '../src/bodystyles.js';
import { buildLoftBody } from '../src/loftbody.js';
import { buildFleshBody } from '../src/fleshbody.js';
import { buildDetailMap, DETAIL, detailUv } from '../src/skindetail.js';
import { BONES } from '../src/rig.js';
import { progression } from '../tools/bodysheet-cast.js';

// The body-size progression of the comparison sheets (tools/bodysheet.html), both sexes.
const CAST = [...progression('male'), ...progression('female')].map((row) => ({ ...row, body: buildBody(row.inputs) }));

/** What every skin mesh must be, whatever its style: finite, indexed in range, weighted to one. */
function checkMesh(name, mesh) {
  const count = mesh.positions.length / 3;
  assert.ok(count > 100, `${name}: has vertices`);
  assert.equal(mesh.normals.length, mesh.positions.length, `${name}: a normal for each vertex`);
  for (const array of [mesh.positions, mesh.normals]) {
    for (let index = 0; index < array.length; index += 1) if (!Number.isFinite(array[index])) assert.fail(`${name}: a vertex is not a number (${index})`);
  }
  assert.equal(mesh.indices.length % 3, 0, `${name}: whole triangles`);
  let highest = 0;
  for (const index of mesh.indices) highest = Math.max(highest, index);
  assert.ok(highest < count, `${name}: indices within the vertices (${highest} of ${count})`);
  assert.equal(mesh.skinIndex.length, count * 4);
  assert.equal(mesh.skinWeight.length, count * 4);
  for (let vertex = 0; vertex < count; vertex += 1) {
    let sum = 0;
    for (let slot = 0; slot < 4; slot += 1) {
      sum += mesh.skinWeight[vertex * 4 + slot];
      assert.ok(mesh.skinIndex[vertex * 4 + slot] < BONES.length, `${name}: a bone that exists`);
    }
    if (Math.abs(sum - 1) > 1e-4) assert.fail(`${name}: vertex ${vertex}'s weights sum to ${sum}`);
  }
  if (mesh.regions) assert.equal(mesh.regions.length, count, `${name}: a region for each vertex`);
}

test('the loft styles build for every body of the size progression: finite, indexed, weighted to one', () => {
  assert.equal(CAST.length, 14);
  for (const { key, inputs, body } of CAST) {
    for (const style of ['lofted', 'sculpt', 'detail']) checkMesh(`${inputs.sex} ${key} ${style}`, buildSkinMesh(body, style));
  }
});

test('the flesh style builds for the thinnest, the fittest and the heaviest of each sex (coarse grid, so the test is quick)', () => {
  for (const key of ['starved', 'athletic', 'obese']) {
    for (const { inputs, body } of CAST.filter((row) => row.key === key)) checkMesh(`${inputs.sex} ${key} flesh`, buildFleshBody(body, { cell: 0.014 }));
  }
});

test('every key in BODY_STYLES builds a body (the default included)', () => {
  const { body } = CAST[3];
  for (const style of BODY_STYLE_KEYS) {
    const mesh = style === 'flesh' ? buildFleshBody(body, { cell: 0.014 }) : buildSkinMesh(body, style);
    checkMesh(style, mesh);
  }
  assert.ok(BODY_STYLE_KEYS.includes('sculpt') && BODY_STYLE_KEYS.includes('flesh') && BODY_STYLE_KEYS.includes('detail'));
});

test('the progression lands on its targets: BMI and body fat read back from the built bodies', () => {
  const wanted = { male: { starved: [14, 0.04], thin: [18, 0.1], average: [23, 0.17], athletic: [23, 0.11], bodybuilder: [29, 0.08], overweight: [29, 0.27], obese: [38, 0.38], veryObese: [48, 0.46] }, female: { starved: [14, 0.08], thin: [18, 0.2], average: [22, 0.27], athletic: [21.5, 0.18], overweight: [28, 0.36], obese: [36, 0.44] } };
  for (const { key, inputs, bmi, bodyFat } of CAST) {
    const [targetBmi, targetFat] = wanted[inputs.sex][key];
    assert.ok(Math.abs(bmi - targetBmi) < 0.3, `${inputs.sex} ${key}: BMI ${bmi.toFixed(1)} for ${targetBmi}`);
    assert.ok(Math.abs(bodyFat - targetFat) < 0.005, `${inputs.sex} ${key}: fat ${bodyFat.toFixed(3)} for ${targetFat}`);
    assert.equal(inputs.heightCm, inputs.sex === 'male' ? 180 : 168);
  }
});

test('a crowd member is built as he was, whatever style is asked for; the default style is the baseline loft', () => {
  const body = buildBody(PRESETS.contender);
  const crowd = buildLoftBody(body, { lowDetail: true });
  const crowdSculpted = buildLoftBody(body, { lowDetail: true, sculpt: true });
  assert.deepEqual(Array.from(crowd.positions), Array.from(crowdSculpted.positions), 'sculpting is not done in a crowd');
  assert.equal(crowd.indices.length, crowdSculpted.indices.length);
  const lofted = buildSkinMesh(body, 'lofted');
  const plain = buildLoftBody(body);
  assert.deepEqual(Array.from(lofted.positions), Array.from(plain.positions), 'lofted is the default build');
  assert.ok(crowd.indices.length < plain.indices.length / 2, 'and a crowd member is far cheaper');
  assert.equal(plain.uvs, undefined, 'the baseline carries no texture coordinates');
});

test('the sculpt style is a build of the same loft: deterministic, a few times the triangles, clothes still fit over it', () => {
  const body = CAST.find((row) => row.key === 'bodybuilder').body;
  const first = buildSkinMesh(body, 'sculpt');
  const second = buildSkinMesh(body, 'sculpt');
  assert.deepEqual(Array.from(first.positions), Array.from(second.positions));
  const base = buildSkinMesh(body, 'lofted');
  assert.ok(first.indices.length > base.indices.length && first.indices.length < base.indices.length * 3, `${first.indices.length / 3} against ${base.indices.length / 3} triangles`);
  // Trunks are drawn over it, as in the baseline.
  assert.ok(first.regions.includes('kit') && first.regions.includes('band'));
});

test('the sculpt style keeps armour clear of the skin: at every height of the trunk the skin is inside what is worn over it', () => {
  for (const preset of ['knight', 'joan', 'hidalgo']) {
    const body = buildBody(PRESETS[preset]);
    const mesh = buildLoftBody(body, { sculpt: true });
    const hip = mesh.bindPoints[P.pelvis][1];
    // The farthest from the trunk's axis (x forward, z across), by height, of the skin and of everything on it.
    const reach = (worn) => {
      const bins = new Map();
      for (let vertex = 0; vertex < mesh.regions.length; vertex += 1) {
        const isSkin = mesh.regions[vertex] === 'skin';
        if (isSkin === worn) continue;
        const height = mesh.positions[vertex * 3 + 1] - hip;
        // Trunk vertices only (not the arms hanging beside it): the bones that carry them say so.
        if (height < 0.12 || height > 0.36 || mesh.skinIndex[vertex * 4] > 2 || Math.abs(mesh.positions[vertex * 3 + 2]) > 0.3) continue;
        const bin = Math.floor(height / 0.04);
        bins.set(bin, Math.max(bins.get(bin) ?? 0, Math.hypot(mesh.positions[vertex * 3], mesh.positions[vertex * 3 + 2])));
      }
      return bins;
    };
    const skin = reach(false);
    const cloth = reach(true);
    assert.ok(skin.size >= 4 && cloth.size >= 4, `${preset}: skin and cloth both span the trunk`);
    for (const [bin, radius] of skin) assert.ok(!cloth.has(bin) || cloth.get(bin) >= radius * 0.98, `${preset}: at ${bin * 4} cm the skin (${radius.toFixed(3)}) is not through the cloth (${cloth.get(bin)?.toFixed(3)})`);
  }
});

test('the detail style: the loft with texture coordinates, and a map whose texels are bounded', () => {
  const body = CAST.find((row) => row.key === 'athletic' && row.inputs.sex === 'male').body;
  const mesh = buildSkinMesh(body, 'detail');
  checkMesh('detail', mesh);
  const count = mesh.positions.length / 3;
  assert.equal(mesh.uvs.length, count * 2);
  for (const value of mesh.uvs) assert.ok(value >= 0 && value <= 1, `a coordinate in the map (${value})`);
  const { width, height, bump, occlusion, range } = mesh.detail;
  assert.equal(bump.length, width * height);
  assert.equal(occlusion.length, width * height);
  assert.equal(range, DETAIL.range);
  // The map is not flat (a fit trunk has ribs, abs, collarbones), and not wild.
  let lowest = 255;
  let highest = 0;
  for (const value of bump) {
    lowest = Math.min(lowest, value);
    highest = Math.max(highest, value);
  }
  assert.ok(highest - lowest > 20 && lowest > 0 && highest < 255, `bump ${lowest} to ${highest}`);
  // A thin man's map carries more than a fat man's over the same tile: the same rules, drawn by what is on him.
  const spread = (key) => {
    const { bump: other } = buildDetailMap(CAST.find((row) => row.key === key && row.inputs.sex === 'male').body);
    let sum = 0;
    for (let index = 0; index < 512 * 384; index += 1) sum += Math.abs(other[(Math.floor(index / 512)) * width + (index % 512)] - 128);
    return sum;
  };
  assert.ok(spread('starved') > spread('obese') * 1.5, 'ribs and spine on the starved, folds only on the obese');
  // The seam of a part closes: the texture the first and last vertex of a ring look up is the same line.
  const around = detailUv('trunk');
  const first = around({ t: 0.5 }, 0);
  const last = around({ t: 0.5 }, 1);
  assert.ok(Math.abs(first[1] - last[1]) < 1e-9 && last[0] > first[0]);
});

test('the flesh style draws trunks and a sports top over the skin it grew, cut clean at their edges', () => {
  const { body } = CAST.find((row) => row.key === 'average' && row.inputs.sex === 'female');
  const mesh = buildFleshBody(body, { cell: 0.014 });
  for (const role of ['kit', 'band', 'top']) assert.ok(mesh.regions.includes(role), `${role} is drawn`);
  const heights = (role) => mesh.regions.map((region, vertex) => (region === role ? mesh.positions[vertex * 3 + 1] : null)).filter((value) => value !== null);
  const top = heights('top');
  const spread = Math.max(...top) - Math.min(...top);
  assert.ok(spread > 0.1 && spread < 0.3, `the top is a band ${spread.toFixed(2)} m tall`);
});
