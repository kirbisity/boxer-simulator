// V7 in the game: the default body style, built in slices or in a worker, and under armour the skin it covers left out
// (loftbody.js coveredRegions, `hideCovered`); the crowd's body untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBody, PRESETS } from '../src/body.js';
import { buildSkinMesh, buildSkinMeshSteps, DEFAULT_BODY_STYLE, makeSkinTextures, skinTextureKey } from '../src/bodystyles.js';
import { buildLoftBody, coveredRegions, LOFT, runSteps } from '../src/loftbody.js';
import { fleshAnatomy, fleshField } from '../src/fleshbody.js';
import { compositionKey } from '../src/skintex.js';
import { hospitaller } from '../src/cast.js';
import { LEVEL_PRESETS } from '../src/levelmode/presets.js';
import { bodyCheck, skinWorkerAnswer } from '../src/skinworker.js';
import { smoothMin } from '../src/bodymesh.js';
import { BONES } from '../src/rig.js';

const LIMBS = ['lUpper', 'rUpper', 'lFore', 'rFore', 'lThigh', 'rThigh', 'lShin', 'rShin'];
const seeded = (seed = 7) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
// The kits the request names: a knight in plate, a Han lamellar soldier, a samurai in ō-yoroi (and one in lamellar), a mail-clad
// Hospitaller-era knight (the Templar's hauberk) and Rhodes's Hospitaller in plate, a gambesoned fighter (the Forger) and a brigandine man.
const KITS = {
  knight: { inputs: PRESETS.knight, parts: ['trunk', 'neck', ...LIMBS] },
  hanLamellar: { inputs: PRESETS.hanCrossbow, parts: ['trunk', 'lUpper', 'rUpper', 'lFore', 'rFore', 'lThigh', 'rThigh'] },
  oyoroi: { inputs: PRESETS.tametomo, parts: ['trunk', ...LIMBS] },
  samuraiLamellar: { inputs: PRESETS.samurai, parts: ['trunk', 'neck', ...LIMBS] },
  mail: { inputs: PRESETS.templar, parts: ['trunk', 'neck', ...LIMBS] },
  hospitaller: { inputs: hospitaller(seeded()), parts: ['trunk', 'neck', ...LIMBS] },
  gambeson: { inputs: LEVEL_PRESETS.forger, parts: ['trunk', 'lUpper', 'rUpper', 'lFore', 'rFore', 'lThigh', 'rThigh'] },
  brigandine: { inputs: PRESETS.crossbow, parts: ['trunk', 'lUpper', 'rUpper', 'lFore', 'rFore', 'lThigh', 'rThigh'] },
};

/** Finite, indexed in range, every vertex's weights summing to one. */
function checkMesh(name, mesh) {
  const count = mesh.positions.length / 3;
  for (const array of [mesh.positions, mesh.normals, mesh.uvs ?? []]) for (const value of array) if (!Number.isFinite(value)) assert.fail(`${name}: not a number`);
  for (const index of mesh.indices) if (index >= count) assert.fail(`${name}: an index past the vertices`);
  assert.equal(mesh.skinWeight.length, count * 4);
  assert.equal(mesh.regions.length, count);
  assert.equal(mesh.rigid.length, count);
  for (let vertex = 0; vertex < count; vertex += 1) {
    let sum = 0;
    for (let slot = 0; slot < 4; slot += 1) {
      sum += mesh.skinWeight[vertex * 4 + slot];
      assert.ok(mesh.skinIndex[vertex * 4 + slot] < BONES.length);
    }
    if (Math.abs(sum - 1) > 1e-4) assert.fail(`${name}: vertex ${vertex}'s weights sum to ${sum}`);
  }
  // Every vertex is used by a triangle (the left-out ones are dropped, not kept unused).
  const used = new Uint8Array(count);
  for (const index of mesh.indices) used[index] = 1;
  assert.ok(used.every(Boolean), `${name}: every vertex used`);
}

const skinTriangles = (mesh) => {
  let count = 0;
  for (let corner = 0; corner < mesh.indices.length; corner += 3) if ([0, 1, 2].every((offset) => mesh.regions[mesh.indices[corner + offset]] === 'skin')) count += 1;
  return count;
};

test('V7 is the default body style, the plain loft still to be had', () => {
  assert.equal(DEFAULT_BODY_STYLE, 'v7');
  const render = readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  assert.match(render, /export let BODY_STYLE = DEFAULT_BODY_STYLE;/);
  assert.match(render, /slicedStyles: \['v7'\]/);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /\['lofted', '1 · Lofted/, 'the design sheet still lists the old style');
});

test('what each kit covers: the parts its closed pieces lie over, the margin off every end', () => {
  for (const [name, { inputs, parts }] of Object.entries(KITS)) {
    const covered = coveredRegions(buildBody(inputs));
    assert.ok(covered, `${name}: armour covers something`);
    for (const part of parts) assert.ok(covered[part]?.length, `${name}: ${part} covered`);
    for (const [part, stretches] of Object.entries(covered)) {
      for (const [from, to] of stretches) {
        assert.ok(Number.isFinite(from) && Number.isFinite(to) && to > from, `${name} ${part}: a stretch`);
        assert.ok(from > -0.6 && to < 1.2, `${name} ${part}: within the part (${from}..${to})`);
      }
    }
  }
  // Bare, or a gladiator bare above the belt: nothing covered on the trunk.
  assert.equal(coveredRegions(buildBody(PRESETS.contender)), null);
  assert.equal(coveredRegions(buildBody(PRESETS.hoplomachus)).trunk, undefined);
  // The plate knight's covered trunk keeps skin at the hips and the neck: margins at both ends of the breastplate.
  const plate = coveredRegions(buildBody(PRESETS.knight)).trunk[0];
  assert.ok(plate[0] > -0.12 && plate[1] < 1.1);
  // Sheer lace sleeves (skin painted through them) cover nothing.
  const lace = coveredRegions(buildBody({ ...PRESETS.contender, sex: 'female', outfit: { kind: 'gothic', design: 0 } }));
  assert.ok(!lace?.lUpper || lace.lUpper.every(([from, to]) => to - from < 2));
});

test('under armour V7 builds the covered skin not at all: fewer triangles than the same body bare, still a sound skinned mesh', () => {
  for (const [name, { inputs }] of Object.entries(KITS)) {
    const body = buildBody(inputs);
    const mesh = buildSkinMesh(body, 'v7');
    checkMesh(`${name} v7`, mesh);
    assert.ok(mesh.hiddenTriangles > 0, `${name}: some skin left out`);
    // The same build without leaving anything out has exactly those triangles more.
    const whole = buildLoftBody(body, { sculpt: 'rules', rules: { share: 0, density: 'medium' } });
    assert.equal(whole.indices.length / 3 - mesh.indices.length / 3, mesh.hiddenTriangles, `${name}: the left-out triangles`);
    assert.ok(skinTriangles(mesh) < skinTriangles(whole), `${name}: fewer skin triangles than with it all drawn (${skinTriangles(mesh)} vs ${skinTriangles(whole)})`);
    // The same man in a boxer's trunks (no armour) draws more skin, and more triangles of it.
    const bare = buildSkinMesh(buildBody({ ...inputs, outfit: { kind: 'boxing', design: 0 } }), 'v7');
    assert.ok(skinTriangles(mesh) < skinTriangles(bare), `${name}: fewer skin triangles than bare (${skinTriangles(mesh)} vs ${skinTriangles(bare)})`);
  }
});

test('the skin left out is only what a closed piece covers: what stays is the open ends, the joints and anything bare', () => {
  const body = buildBody(PRESETS.knight);
  const mesh = buildSkinMesh(body, 'v7');
  const covered = mesh.covered;
  // Every skin triangle kept that lies in a covered stretch touches its edge (a triangle straddling the line), never the middle.
  assert.ok(covered.lFore[0][0] > 0 && covered.lFore[0][1] < 1, 'the forearm keeps skin at the elbow and the wrist');
  assert.ok(covered.lShin[0][1] < 0.97, 'the shin keeps skin above the ankle');
  // Hands, feet and the head are their own meshes (render.js): none of them is in the skin mesh to leave out.
  assert.ok(mesh.positions.length > 0);
});

test('the crowd\'s body (the low-detail loft) is byte for byte what it was', () => {
  const hash = (mesh) => createHash('sha256').update(Buffer.from(mesh.positions.buffer)).update(Buffer.from(mesh.normals.buffer)).update(Buffer.from(mesh.indices.buffer)).update(Buffer.from(mesh.skinIndex.buffer)).update(Buffer.from(mesh.skinWeight.buffer)).digest('hex').slice(0, 16);
  const paint = (mesh) => createHash('sha256').update(`${mesh.regions.join(',')}|${mesh.rigid.join(',')}`).digest('hex').slice(0, 16);
  // Made before V7 came into the game (the low-detail loft of these presets).
  const before = {
    contender: ['65f215b325a9747e', 'a132c7944de33631'], knight: ['74e8bb3e895e0175', '1dd77ca0785dcb63'], samurai: ['bf9b788dce59f68d', '984738ad34524b74'],
    hanCrossbow: ['78545d437116c7bc', '721b46fd40ea145d'], crossbow: ['ff8ef72c410e4834', 'ba8f41a002601561'], templar: ['93aea5cbdd2ae832', '9d1016be266f106f'], heavy: ['366ae5ce1cdb70b4', '8d77b60ca133d7e4'],
  };
  for (const [preset, [geometry, regions]] of Object.entries(before)) {
    const mesh = buildLoftBody(buildBody(PRESETS[preset]), { lowDetail: true });
    assert.equal(hash(mesh), geometry, `${preset}: the crowd body's geometry`);
    assert.equal(paint(mesh), regions, `${preset}: the crowd body's paint`);
    assert.deepEqual(Object.keys(mesh), ['positions', 'normals', 'indices', 'regions', 'rigid', 'skinIndex', 'skinWeight', 'bindFrames', 'bindPoints']);
  }
});

test('V7 built in slices is V7 built at once; no slice is a whole body', () => {
  const body = buildBody(PRESETS.contender);
  const steps = buildSkinMeshSteps(body, 'v7');
  let slices = 0;
  let next = steps.next();
  while (!next.done) {
    slices += 1;
    next = steps.next();
  }
  assert.ok(slices > 30, `many slices (${slices})`);
  const whole = buildSkinMesh(body, 'v7');
  assert.deepEqual(next.value.positions, whole.positions);
  assert.deepEqual(next.value.skinWeight, whole.skinWeight);
  assert.deepEqual(runSteps(buildSkinMeshSteps(body, 'lofted')).indices, buildLoftBody(body).indices);
});

test('the flesh field\'s shape grid reads exactly what reading every shape does', () => {
  const anatomy = fleshAnatomy(buildBody(PRESETS.heavy), { refined: true });
  const field = fleshField(anatomy);
  const reach = anatomy.band + 0.01 + 0.01;
  const every = (x, y, z) => {
    let lean = 1;
    for (const shape of anatomy.shapes) {
      const box = shape.box;
      if (x < box[0] - reach || x > box[3] + reach || y < box[1] - reach || y > box[4] + reach || z < box[2] - reach || z > box[5] + reach) continue;
      lean = smoothMin(lean, shape.distance(x, y, z), shape.blend ?? 0.01);
    }
    if (lean > anatomy.band || lean < -anatomy.band) return lean;
    return null;
  };
  const random = seeded(3);
  for (let probe = 0; probe < 4000; probe += 1) {
    const [x, y, z] = [random() * 0.9 - 0.45, random() * 2, random() * 0.9 - 0.45];
    const far = every(x, y, z);
    if (far !== null) assert.equal(field(x, y, z), far);
  }
});

test('maps under armour: the covered rows left blank, their own cache key, nothing out of range', () => {
  const body = buildBody(PRESETS.knight);
  const mesh = buildSkinMesh(body, 'v7');
  const maps = makeSkinTextures(body, 'v7', mesh);
  assert.ok(maps.albedo.length && maps.normal.length && maps.ao.length && maps.rough.length);
  assert.notEqual(skinTextureKey(body, 'v7', mesh), compositionKey(body, 'v7'), 'kept apart from the bare body\'s maps');
  const bare = buildBody(PRESETS.contender);
  assert.equal(skinTextureKey(bare, 'v7', buildSkinMesh(bare, 'v7')), compositionKey(bare, 'v7'));
});

test('the skin worker\'s answer is the mesh built here; a body made otherwise there is refused', () => {
  const body = buildBody(PRESETS.crossbow);
  const { answer, transfer } = skinWorkerAnswer({ id: 3, inputs: body.inputs, style: 'v7', check: bodyCheck(body) });
  assert.equal(answer.id, 3);
  const here = buildSkinMesh(body, 'v7');
  assert.deepEqual(answer.built.positions, here.positions);
  assert.deepEqual(answer.built.indices, here.indices);
  assert.ok(answer.maps.albedo.length > 0);
  assert.equal(new Set(transfer).size, transfer.length, 'no buffer handed over twice');
  // Maps the page has already: not made again.
  const known = skinWorkerAnswer({ id: 4, inputs: body.inputs, style: 'v7', check: bodyCheck(body), known: [skinTextureKey(body, 'v7', here)] }).answer;
  assert.equal(known.maps, null);
  const refused = skinWorkerAnswer({ id: 5, inputs: body.inputs, style: 'v7', check: bodyCheck(body).map((value) => value + 1) }).answer;
  assert.equal(refused.mismatch, true);
});

test('the margin kept round each piece is a few centimetres', () => {
  assert.ok(LOFT.cover.margin >= 0.03 && LOFT.cover.margin <= 0.08);
});

test('the one-file bundle carries the skin worker\'s code, and refuses an aliased import', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'v7-bundle-')), 'gladiator.html');
  execFileSync('node', ['tools/bundle.js', out], { cwd: new URL('..', import.meta.url).pathname, stdio: 'pipe' });
  const page = readFileSync(out, 'utf8');
  const worker = page.match(/<script type="text\/plain" id="skin-worker-source">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(worker, 'the worker source is in the page');
  for (const name of ['skinworker', 'bodystyles', 'loftbody', 'fleshbody', 'skintex', 'body']) assert.ok(worker.includes(`// ---- src/${name}.js ----`), `${name} in the worker`);
  assert.ok(!worker.includes('// ---- src/render.js ----'), 'no page code in the worker');
  assert.match(readFileSync(new URL('../tools/bundle.js', import.meta.url), 'utf8'), /an aliased import/);
});
