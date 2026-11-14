import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, FRAMES, P } from '../src/body.js';
import { BONE, bindPoints } from '../src/rig.js';
import { buildSkinMesh, skinTextureKey } from '../src/bodystyles.js';
import { BASE_BODY, baseBindJoints, baseBodyMesh, baseStarvedDetail, measureBaseBody, placeBaseBody } from '../src/basebody.js';
import { LOFT, baseBoneRelief, baseFamilyWeights, baseFrame, baseLoftOptions, baseRigOf, buildLoftBody } from '../src/loftbody.js';
import { FLAT_UV } from '../src/skindetail.js';
import { caloriesForWeight } from '../src/physiology.js';
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
    // (8k of base mesh, a few hundred more where its seams are split, the fight kit's lofts over it; less the skin a closed
    // piece covers, a starved woman's under her top coming to a few dozen under 8k.)
    assert.ok(triangles > 7900 && triangles < 11000, `${name}: ${triangles} triangles`);
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

test('the family of builds: a body is a mix of them summing to one, the emaciated build and its bone relief the thin\'s alone', () => {
  for (const sex of ['male', 'female']) {
    const rows = progression(sex);
    const height = baseRigOf(sex, false).height;
    const of = (key) => buildBody(rows.find((row) => row.key === key).inputs);
    for (const row of rows) {
      const weights = baseFamilyWeights(buildBody(row.inputs), height);
      assert.equal(weights.length, BASE_BODY.family.builds.length);
      assert.ok(Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-9, `${sex} ${row.key}: the builds' weights sum to one`);
    }
    const [starved, thin, average, obese] = ['starved', 'thin', 'average', 'obese'].map(of);
    const emaciated = (body) => baseFamilyWeights(body, height)[BASE_BODY.family.builds.indexOf('E')];
    assert.ok(emaciated(starved) > 0.85, `${sex}: a starved body is the emaciated build`);
    assert.ok(emaciated(thin) > 0.3 && emaciated(thin) < 0.8, `${sex}: a thin one part of it`);
    assert.ok(Math.abs(emaciated(average)) < 0.1 && emaciated(obese) === 0, `${sex}: an average or a fat one none of it`);
    // (The ends of the game's range: under the emaciated build's own BMI a body wastes on past it, with none of the muscular
    // build's gain taken off; the fattest body is the fattest build, and a body between F3 and it a share of both.)
    const builds = BASE_BODY.family.builds;
    const at = (bmi) => baseFamilyWeights(buildBody({ ...average.inputs, calories: caloriesForWeight(average.inputs, bmi * average.heightM ** 2) }), height);
    const [wasted, fat, fattest] = [10, 60, 100].map(at);
    assert.ok(wasted[builds.indexOf('E')] > 1.15 && Math.abs(wasted[builds.indexOf('M')]) < 1e-9, `${sex}: a BMI of 10 past the emaciated build (${wasted.map((weight) => weight.toFixed(2))})`);
    assert.ok(fat[builds.indexOf('F4')] > 0.2 && fat[builds.indexOf('F4')] < 0.8 && fat[builds.indexOf('F3')] > 0.2, `${sex}: a BMI of 60 between the fat builds (${fat.map((weight) => weight.toFixed(2))})`);
    assert.ok(fattest[builds.indexOf('F4')] > 0.95, `${sex}: a BMI of 100 the fattest build (${fattest.map((weight) => weight.toFixed(2))})`);
    for (const weights of [wasted, fat, fattest]) assert.ok(Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-9);
    // (The relief fades with the body's cover, faster than the build's share: LOFT.boneCover.)
    const shows = [starved, thin, average, obese].map((body) => baseBoneRelief(body, height));
    // (A starved body of the cast, a BMI of 14, is drawn 5% narrower than the skeleton the relief's build was sculpted on,
    // LOFT.frame: a millimetre and a half more over its ribs. Under a BMI of 13 the relief is whole.)
    assert.ok(shows[0] > 0.7 && shows[1] > 0.1 && shows[1] < 0.5 && shows[2] < 0.1 && shows[3] < 0.01, `${sex}: bones through a starved body's skin, faintly a thin one's, not an average one's (${shows.map((show) => show.toFixed(2))})`);
    const wasting = buildBody({ ...average.inputs, calories: caloriesForWeight(average.inputs, 12.5 * average.heightM ** 2) });
    assert.ok(baseBoneRelief(wasting, height) > 0.95, `${sex}: all of it through a body of BMI 12.5`);
    const detail = baseStarvedDetail(starved, shows[0]);
    assert.equal(detail.heights.length, detail.width * detail.height, `${sex}: a height a texel of the relief's tile`);
    const most = detail.heights.reduce((m, value) => Math.max(m, Math.abs(value)), 0);
    assert.ok(most > 0.003 && most <= 0.006 + 1e-6, `${sex}: a relief of up to 1 cm (${(most * 1680).toFixed(1)} mm at 1.68 m)`);
    assert.equal(detail.weight, shows[0]);
    // (Bodies a composition bucket apart in nothing else do not share maps where the relief they show differs.)
    assert.notEqual(skinTextureKey(starved, 'base', buildSkinMesh(starved, 'base')), skinTextureKey(thin, 'base', buildSkinMesh(thin, 'base')));
  }
});

test('the frame: a body is drawn as broad as its skeleton, a thin one a little narrower, and at one weight a broad frame is a leaner build', (t) => {
  t.after(() => {
    delete globalThis.BASE_WIDTHS;
  });
  for (const sex of ['male', 'female']) {
    const height = baseRigOf(sex, false).height;
    const average = progression(sex).find((row) => row.key === 'average').inputs;
    const of = (frame, bmi) => {
      const inputs = { ...average, frame };
      return buildBody({ ...inputs, calories: caloriesForWeight(inputs, bmi * (inputs.heightCm / 100) ** 2, FRAMES[frame].lean) });
    };
    // (From the ordinary build up a frame's own width, and the skin's joints off the rig's by what the rig lacks of it.)
    for (const frame of ['small', 'medium', 'large']) {
      const { across, apart, section } = baseFrame(of(frame, 26), height);
      assert.ok(Math.abs(across - LOFT.frame.widths[frame]) < 1e-9, `${sex} ${frame}: drawn ${across.toFixed(3)} of the builds' breadth`);
      assert.ok(Math.abs(apart * FRAMES[frame].width - across) < 1e-9 && Math.abs(section - across ** LOFT.frame.section) < 1e-9);
    }
    // (Under it a little narrower by its weight: 5% at a BMI of 13.)
    const thin = baseFrame(of('medium', 13), height).across;
    assert.ok(thin > 0.93 && thin < 0.96, `${sex}: a BMI of 13 drawn ${thin.toFixed(3)} as broad`);
    // (The same weight on a broader frame is a leaner build: more of the emaciated one at a BMI of 16.)
    const emaciated = (frame) => baseFamilyWeights(of(frame, 16), height)[BASE_BODY.family.builds.indexOf('E')];
    assert.ok(emaciated('small') < emaciated('medium') && emaciated('medium') < emaciated('large'), `${sex}: leaner on a broader frame`);
    // (As drawn, at one BMI: across the deltoids half of the skeleton's fifth between a small and a large frame, as ANSUR II
    // has it, LOFT.frame; the chest broader too.)
    const drawn = (frame) => {
      globalThis.BASE_WIDTHS = [];
      buildSkinMesh(of(frame, 22), 'base');
      return globalThis.BASE_WIDTHS.at(-1);
    };
    const [small, medium, large] = ['small', 'medium', 'large'].map(drawn);
    const shoulders = large.bideltoid / small.bideltoid;
    assert.ok(small.bideltoid < medium.bideltoid && medium.bideltoid < large.bideltoid && shoulders > 1.08 && shoulders < 1.15, `${sex}: a large frame's shoulders ${shoulders.toFixed(3)} of a small one's`);
    assert.ok(small.chest < medium.chest && medium.chest < large.chest, `${sex}: its chest broader`);
  }
});
