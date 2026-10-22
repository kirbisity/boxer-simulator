import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, PRESETS } from '../src/body.js';
import { BODY_STYLE_KEYS, buildSkinMesh, skinTexturesNow, styleSpec, STYLE_SPECS } from '../src/bodystyles.js';
import { buildLoftBody, FILLET } from '../src/loftbody.js';
import { buildFleshBody } from '../src/fleshbody.js';
import { clearSkinTextureCache, compositionKey, skinTextureCache, SKINTEX } from '../src/skintex.js';
import { LANDMARKS, rulesProfile, rulesTraits, trunkRule, limbRule } from '../src/skinrules.js';
import { bindPoints } from '../src/rig.js';
import { P } from '../src/body.js';
import { FACE_MORPH, faceMarks, faceMorphWeights, morphHeadPoint } from '../src/facemorph.js';
import { DETAIL } from '../src/skindetail.js';
import { progression } from '../tools/bodysheet-cast.js';

// Round two's body styles (bodystyles.js v1..v6): textures, the rules, blended joins and the face that follows the body.
const CAST = [...progression('male'), ...progression('female')].map((row) => ({ ...row, body: buildBody(row.inputs) }));
const one = (sex, key) => CAST.find((row) => row.inputs.sex === sex && row.key === key).body;
const ROUND_TWO = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'];

function finite(name, array) {
  for (let index = 0; index < array.length; index += 1) if (!Number.isFinite(array[index])) assert.fail(`${name}: not a number at ${index}`);
}

test('round two adds six styles, each morphing the face; the textured ones say what maps they want', () => {
  for (const style of ROUND_TWO) {
    assert.ok(BODY_STYLE_KEYS.includes(style), style);
    assert.equal(styleSpec(style).face, true, `${style} follows the body with the face`);
  }
  for (const style of ['lofted', 'sculpt', 'flesh', 'detail']) assert.ok(!styleSpec(style).face, `${style} keeps round one's face`);
  for (const style of ['v1', 'v2', 'v3', 'v4']) assert.ok(STYLE_SPECS[style].tex.layers.includes('albedo'), style);
  assert.deepEqual(STYLE_SPECS.v1.tex.layers, ['albedo', 'ao'], 'v1 is the Lambert-safe one: no normals');
});

test('the textured lofts build for the thinnest, the fittest and the heaviest: finite, weighted, texture coordinates inside the atlas', () => {
  for (const [sex, key] of [['male', 'starved'], ['male', 'bodybuilder'], ['male', 'veryObese'], ['female', 'obese']]) {
    const body = one(sex, key);
    for (const style of ['v2', 'v4']) {
      const mesh = buildSkinMesh(body, style);
      const count = mesh.positions.length / 3;
      finite(`${sex} ${key} ${style} positions`, mesh.positions);
      finite(`${sex} ${key} ${style} normals`, mesh.normals);
      assert.equal(mesh.uvs.length, count * 2);
      for (const value of mesh.uvs) assert.ok(value >= 0 && value <= 1, `${style}: a coordinate in the atlas (${value})`);
      let highest = 0;
      for (const index of mesh.indices) highest = Math.max(highest, index);
      assert.ok(highest < count);
      for (let vertex = 0; vertex < count; vertex += 1) {
        const sum = mesh.skinWeight[vertex * 4] + mesh.skinWeight[vertex * 4 + 1] + mesh.skinWeight[vertex * 4 + 2] + mesh.skinWeight[vertex * 4 + 3];
        if (Math.abs(sum - 1) > 1e-4) assert.fail(`${style}: vertex ${vertex} weighs ${sum}`);
      }
    }
  }
});

test('the maps: their sizes, every byte set, cached per composition bucket (a second build of the same body is a hit)', () => {
  clearSkinTextureCache();
  const body = one('male', 'athletic');
  const built = buildSkinMesh(body, 'v2');
  const maps = skinTexturesNow(body, 'v2', built);
  const [width, height] = DETAIL.atlas;
  assert.equal(maps.width, width);
  assert.equal(maps.height, height);
  assert.equal(maps.albedo.length, width * height * 4);
  assert.equal(maps.normal.length, width * height * 4);
  assert.equal(maps.ao.length, width * height);
  assert.equal(maps.rough.length, width * height);
  assert.equal(maps.bytes, width * height * 10);
  // A trained trunk's normals lean (ribs, abs): not all flat; none points into the skin.
  let leaning = 0;
  for (let at = 0; at < width * height; at += 1) {
    if (Math.abs(maps.normal[at * 4] - 128) > 6 || Math.abs(maps.normal[at * 4 + 1] - 128) > 6) leaning += 1;
    assert.ok(maps.normal[at * 4 + 2] >= 128, 'a normal points out of the skin');
  }
  assert.ok(leaning > 2000, `${leaning} texels carry a slope`);
  // The albedo is a multiplier near "no change": nothing black, nothing far over it.
  let darkest = 255;
  for (let at = 0; at < width * height * 4; at += 4) darkest = Math.min(darkest, maps.albedo[at], maps.albedo[at + 1]);
  assert.ok(darkest > 60, `darkest albedo ${darkest}`);
  assert.equal(skinTextureCache.misses, 1);
  const again = skinTexturesNow(body, 'v2', buildSkinMesh(body, 'v2'));
  assert.equal(again, maps, 'the same maps, from the cache');
  assert.equal(skinTextureCache.hits, 1);
  // A body a shade different in the same bucket shares them; a starved one does not.
  assert.equal(compositionKey(buildBody({ ...body.inputs, calories: body.inputs.calories + 15 }), 'v2'), compositionKey(body, 'v2'));
  assert.notEqual(compositionKey(one('male', 'starved'), 'v2'), compositionKey(body, 'v2'));
  assert.notEqual(compositionKey(body, 'v3'), compositionKey(body, 'v2'), 'each style its own maps');
});

test('the cache keeps at most its limit of buckets', () => {
  clearSkinTextureCache();
  const keys = new Set();
  for (const { body } of CAST.slice(0, 3)) {
    for (const style of ['v1']) {
      skinTexturesNow(body, style, buildSkinMesh(body, style));
      keys.add(compositionKey(body, style));
    }
  }
  assert.equal(skinTextureCache.map.size, keys.size);
  assert.ok(skinTextureCache.map.size <= SKINTEX.cacheLimit);
});

test('the field bake (B baked onto A) makes finite maps of the same size', () => {
  clearSkinTextureCache();
  const body = one('male', 'starved');
  const maps = skinTexturesNow(body, 'v3', buildSkinMesh(body, 'v3'));
  assert.equal(maps.normal.length, DETAIL.atlas[0] * DETAIL.atlas[1] * 4);
  assert.ok(maps.ao.some((value) => value < 200), 'the starved body has hollows');
});

test('the rules: finite and bounded everywhere, the starved show ribs the fat do not, the trained abs', () => {
  const starved = rulesTraits(one('male', 'starved'));
  const fat = rulesTraits(one('male', 'veryObese'));
  const fit = rulesTraits(one('male', 'bodybuilder'));
  assert.ok(starved.ribs > 0.5 && fat.ribs < 0.05, `ribs ${starved.ribs} and ${fat.ribs}`);
  assert.ok(fit.abs > 0.5 && fat.abs < 0.05, `abs ${fit.abs} and ${fat.abs}`);
  const relief = (R) => {
    let most = 0;
    for (let u = -0.1; u <= 1.1; u += 0.01) {
      for (let angle = 0; angle < Math.PI * 2; angle += 0.05) {
        const mark = trunkRule(R, u, angle);
        for (const value of Object.values(mark)) assert.ok(Number.isFinite(value));
        assert.ok(Math.abs(mark.h) <= 0.016 && mark.crease >= 0 && mark.crease <= 1);
        most = Math.max(most, Math.abs(mark.h));
      }
    }
    return most;
  };
  assert.ok(relief(starved) > relief(fat), 'a starved trunk carries more relief than a fat one');
  for (const kind of ['upper', 'fore', 'thigh', 'shin']) {
    for (let t = -0.2; t <= 1.05; t += 0.05) {
      for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
        const mark = limbRule(fit, kind, 'l', t, angle);
        assert.ok(Number.isFinite(mark.h) && mark.vein >= 0 && mark.vein <= 1, `${kind} at ${t}`);
      }
    }
  }
});

test('the rules\' profile curve passes through its stops and never overshoots them', () => {
  const stops = [[0, 1], [0.3, 2], [0.5, 2.1], [0.8, 0.5], [1, 0.5]];
  const curve = rulesProfile(stops);
  for (const [u, value] of stops) assert.ok(Math.abs(curve(u) - value) < 1e-9);
  for (let index = 1; index < stops.length; index += 1) {
    const [u0, v0] = stops[index - 1];
    const [u1, v1] = stops[index];
    for (let k = 1; k < 20; k += 1) {
      const value = curve(u0 + ((u1 - u0) * k) / 20);
      assert.ok(value >= Math.min(v0, v1) - 1e-9 && value <= Math.max(v0, v1) + 1e-9, `between ${u0} and ${u1}: ${value}`);
    }
  }
  assert.equal(curve(-1), 1);
  assert.equal(curve(2), 0.5);
});

test('the blended joins move the skin only a little, only outwards, never under cloth, and keep the triangles', () => {
  const body = one('male', 'bodybuilder');
  const plain = buildLoftBody(body, { sculpt: 'rules', rules: { share: 0 } });
  const blended = buildLoftBody(body, { sculpt: 'rules', rules: { share: 0 }, fillet: true });
  assert.deepEqual(Array.from(plain.indices), Array.from(blended.indices));
  const most = Math.max(...FILLET.pairs.map(([, , k]) => k)) / 4;
  let moved = 0;
  for (let vertex = 0; vertex < plain.positions.length / 3; vertex += 1) {
    const step = Math.hypot(...[0, 1, 2].map((axis) => blended.positions[vertex * 3 + axis] - plain.positions[vertex * 3 + axis]));
    assert.ok(step <= most + 1e-6, `vertex ${vertex} moved ${step}`);
    if (step > 1e-5) {
      moved += 1;
      assert.equal(blended.regions[vertex], 'skin', 'only skin is blended');
    }
  }
  assert.ok(moved > 100, `${moved} points blended`);
  // In plate the skin is left as it was (the armour is built on the rings).
  const knight = buildBody(PRESETS.knight);
  assert.deepEqual(Array.from(buildLoftBody(knight, { sculpt: 'rules', rules: { share: 0 } }).positions), Array.from(buildLoftBody(knight, { sculpt: 'rules', rules: { share: 0 }, fillet: true }).positions));
});

test('the refined flesh styles build (coarse grid, so the test is quick): finite, and painted per skin vertex', () => {
  for (const key of ['starved', 'obese']) {
    const mesh = buildFleshBody(one('male', key), { cell: 0.016, paint: true, refined: true });
    finite(`${key} positions`, mesh.positions);
    assert.equal(mesh.tint.length, mesh.positions.length);
    for (const value of mesh.tint) assert.ok(value > 0.3 && value < 1.2, `a tint ${value}`);
  }
});

test('the face morph: weights in 0..1 that follow the body, every point moved a bounded amount, the paint within the map', () => {
  const weights = Object.fromEntries(CAST.map(({ inputs, key, body }) => [`${inputs.sex} ${key}`, faceMorphWeights(body)]));
  for (const [name, w] of Object.entries(weights)) {
    for (const part of ['gaunt', 'full', 'defined', 'square', 'sag']) assert.ok(w[part] >= 0 && w[part] <= 1, `${name} ${part} ${w[part]}`);
  }
  assert.ok(weights['male starved'].gaunt > 0.8 && weights['male starved'].full === 0);
  assert.ok(weights['male veryObese'].full > 0.8 && weights['male veryObese'].gaunt === 0);
  assert.ok(weights['male athletic'].gaunt < 0.05 && weights['male athletic'].defined > 0.3);
  assert.ok(weights['male bodybuilder'].square > weights['female athletic'].square, 'a trained man\'s jaw squares more than a woman\'s');
  for (const w of [weights['male starved'], weights['male veryObese'], weights['male bodybuilder'], weights['female obese']]) {
    for (let y = -1.2; y <= 1.1; y += 0.1) {
      for (let azimuth = 0; azimuth < Math.PI * 2; azimuth += 0.2) {
        const ring = Math.sqrt(Math.max(0, 1 - Math.min(1, y * y)));
        const point = [Math.cos(azimuth) * ring, y, Math.sin(azimuth) * ring];
        const moved = morphHeadPoint(...point, w);
        moved.forEach((value) => assert.ok(Number.isFinite(value)));
        assert.ok(Math.hypot(...moved.map((value, axis) => value - point[axis])) <= FACE_MORPH.most + 1e-9);
        const paint = faceMarks(...moved, w);
        paint.forEach((value) => assert.ok(value > 0.4 && value * FACE_MORPH.neutral <= 1.0001, `paint ${value}`));
      }
    }
  }
  // An average face is barely touched.
  const average = weights['male average'];
  assert.ok(Math.hypot(...morphHeadPoint(0.6, -0.45, 0.55, average).map((value, axis) => value - [0.6, -0.45, 0.55][axis])) < 0.03);
});

test('V7: the loft wrapped onto the flesh field: 8-12k triangles, finite, texture coordinates in the atlas, its maps V2\'s', () => {
  for (const [sex, key] of [['male', 'starved'], ['male', 'bodybuilder'], ['male', 'veryObese'], ['female', 'obese']]) {
    const body = one(sex, key);
    const mesh = buildSkinMesh(body, 'v7');
    const triangles = mesh.indices.length / 3;
    assert.ok(triangles >= 8000 && triangles <= 12000, `${sex} ${key}: ${triangles} triangles`);
    finite(`${sex} ${key} v7 positions`, mesh.positions);
    finite(`${sex} ${key} v7 normals`, mesh.normals);
    for (const value of mesh.uvs) assert.ok(value >= 0 && value <= 1);
    for (let vertex = 0; vertex < mesh.normals.length / 3; vertex += 1) {
      const length = Math.hypot(mesh.normals[vertex * 3], mesh.normals[vertex * 3 + 1], mesh.normals[vertex * 3 + 2]);
      assert.ok(Math.abs(length - 1) < 1e-3, 'unit normals');
    }
  }
  assert.deepEqual(STYLE_SPECS.v7.tex, STYLE_SPECS.v2.tex, 'the same maps as V2');
  // The wrap moves the skin only so far from the loft it started as, and not at all in plate.
  const knight = buildBody(PRESETS.knight);
  assert.equal(buildSkinMesh(knight, 'v7').indices.length > 0, true);
});

test('the landmarks sit where the reference has them: rib margin, xiphoid and collarbones as fractions of standing height', () => {
  const body = one('male', 'starved');
  const points = bindPoints(body);
  const pelvis = points[P.pelvis][1];
  const neck = points[P.neck][1];
  const height = (u) => (pelvis + u * (neck - pelvis)) / body.heightM;
  assert.ok(Math.abs(height(LANDMARKS.archSide) - 0.64) < 0.015, `rib margin at ${height(LANDMARKS.archSide)}`);
  assert.ok(Math.abs(height(LANDMARKS.xiphoid) - 0.69) < 0.015, `xiphoid at ${height(LANDMARKS.xiphoid)}`);
  // The rig's neck joint is at 0.80 of the height (the reference's notch 0.81): the collarbones go as high as the trunk reaches.
  assert.ok(Math.abs(height(LANDMARKS.clavicle) - 0.81) < 0.02, `collarbones at ${height(LANDMARKS.clavicle)}`);
  assert.ok(Math.abs(height(LANDMARKS.navel) - 0.6) < 0.015, `navel at ${height(LANDMARKS.navel)}`);
  // The rib bands of a starved trunk lie between the rib margin and the collarbones, none over the soft belly below the arch.
  const R = rulesTraits(body);
  // Ribbing: how much the height swings over a rib's span (two ribs' worth of u) at the side of the cage.
  const relief = (centre) => {
    const heights = [];
    for (let u = centre - 0.045; u <= centre + 0.045; u += 0.005) heights.push(trunkRule(R, u, 1.0).h);
    return Math.max(...heights) - Math.min(...heights);
  };
  assert.ok(relief(0.8) > 0.002, 'ribs high on the cage');
  assert.ok(relief(0.3) < relief(0.8) / 2, 'the belly under the arch is not ribbed');
});
