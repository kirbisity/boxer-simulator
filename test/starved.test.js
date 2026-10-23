// The Starved Rebel: his body (a really low BMI, all from the body model), his rags torn open over the ribs (outfits.js RAGS,
// loftbody.js `holes`), the men dealt like him (cast.js starvedRebel), the level preset, and his fights.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, PRESETS } from '../src/body.js';
import { deriveStats } from '../src/physiology.js';
import { buildSkinMesh } from '../src/bodystyles.js';
import { buildLoftBody, coveredRegions, TOPS } from '../src/loftbody.js';
import { OUTFITS, ragTear, ragTorn } from '../src/outfits.js';
import { randomCharacter, starvedRebel } from '../src/cast.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld, seededRandom } from '../src/physics.js';
import { levelPreset, LEVEL_PRESETS } from '../src/levelmode/presets.js';
import { createStageWorld } from '../src/levelmode/stage.js';
import { TESTYARD } from '../src/levelmode/stages/testyard.js';
import { WARRIORS } from '../src/roster.js';

const finite = (mesh) => [mesh.positions, mesh.normals].every((array) => array.every(Number.isFinite)) && mesh.indices.every((index) => index < mesh.positions.length / 3);

test('his body: BMI 14–15.5 at 160–175 cm, a few percent fat, wasted, frail-boned, weak and short of wind, from his inputs alone', () => {
  const inputs = PRESETS.starved;
  const body = buildBody(inputs);
  const stats = deriveStats(body);
  const levy = buildBody(levelPreset('dunnottarSoldier'));
  const hob = buildBody(PRESETS.spear);
  assert.ok(inputs.heightCm >= 160 && inputs.heightCm <= 175);
  assert.ok(stats.bmi >= 14 && stats.bmi <= 15.5, `BMI ${stats.bmi.toFixed(2)}`);
  assert.ok(stats.bodyFat > 0.02 && stats.bodyFat < 0.07, `${(stats.bodyFat * 100).toFixed(1)}% fat`);
  assert.ok(stats.starving > 0.3, 'starving');
  assert.ok(body.tScore < -1.5, `T-score ${body.tScore.toFixed(2)}: thin bones`);
  assert.ok(body.muscleKg < 0.8 * levy.muscleKg && body.motorForce[7] < 0.7 * levy.motorForce[7], 'weaker than a levy');
  assert.ok(body.aerobic < hob.aerobic, 'less wind than a fed peasant');
  assert.ok(body.fracture.rib < hob.fracture.rib, 'his ribs break sooner');
  // No multiplier of any kind: an ordinary kit, his own skill a levy's.
  assert.equal(OUTFITS.rags.damageDealt, undefined);
  assert.equal(OUTFITS.rags.protection, undefined);
  assert.ok(inputs.skill <= 0.2);
  assert.ok(Object.values(body.segments).every((segment) => Number.isFinite(segment.mass) && segment.mass > 0));
});

test('the rags build with no NaN in every style: a few hundred triangles of plain wrapped cloth, torn open over the ribs', () => {
  const body = buildBody(PRESETS.starved);
  const cloth = (mesh, role = null) => {
    let count = 0;
    for (let corner = 0; corner < mesh.indices.length; corner += 3) {
      const regions = [0, 1, 2].map((offset) => mesh.regions[mesh.indices[corner + offset]]);
      if (role ? regions.every((region) => region === role) : regions.some((region) => region !== 'skin')) count += 1;
    }
    return count;
  };
  const [plain, crowd, v7] = [buildLoftBody(body), buildLoftBody(body, { lowDetail: true }), buildSkinMesh(body, 'v7')];
  for (const mesh of [plain, crowd, v7]) {
    assert.ok(finite(mesh));
    assert.ok(mesh.regions.includes('top') && mesh.regions.includes('rope') && mesh.regions.includes('kit'));
    assert.ok(cloth(mesh) < 800, `${cloth(mesh)} triangles of cloth`);
  }
  assert.ok(plain.indices.length / 3 < 7000, `the plain body in his rags: ${plain.indices.length / 3} triangles`);
  assert.ok(v7.indices.length / 3 < 10000, `V7 in his rags: ${v7.indices.length / 3} triangles`);
  // The shirt is a wrap with whole quads cut out of it: well under what the uncut wrap would be (TOPS.rags.torn).
  const torn = TOPS.rags.torn;
  const uncut = 2 * (torn.rings * torn.sides + 2 * torn.sleeveRings * torn.sleeveSides);
  assert.ok(cloth(plain, 'top') < 0.8 * uncut, `${cloth(plain, 'top')} shirt triangles of ${uncut} uncut`);
  // The front and the sides over the cage are gone; the shoulders and the back mostly kept.
  const tear = ragTear(PRESETS.starved.outfit);
  for (const [u, angle] of [[0.5, 0], [0.65, 0.3], [0.55, -0.3], [0.55, 1.85], [0.55, -1.85]]) assert.ok(ragTorn(tear, u, angle), `torn at ${u}, ${angle}`);
  for (const [u, angle] of [[0.9, 1.4], [0.9, -1.4], [0.5, 2.7]]) assert.ok(!ragTorn(tear, u, angle), `kept at ${u}, ${angle}`);
  assert.equal(coveredRegions(body), null);
  // Under armour (a retiarius's belt and arm guards, nothing on the trunk) a whole shirt covers the trunk; the torn one does not.
  OUTFITS.ragsUnderArmour = { label: 'test', movement: 'good', designs: [{ top: { kind: 'rags', color: '#b9ad8e' }, armor: { kind: 'retiarius', color: '#8d9097' }, feet: { kind: 'bare' } }] };
  OUTFITS.shirtUnderArmour = { label: 'test', movement: 'good', designs: [{ top: { kind: 'longsleeve', color: '#b9ad8e' }, armor: { kind: 'retiarius', color: '#8d9097' }, feet: { kind: 'bare' } }] };
  try {
    const torn = coveredRegions(buildBody({ ...PRESETS.starved, outfit: { kind: 'ragsUnderArmour', design: 0 } }));
    const whole = coveredRegions(buildBody({ ...PRESETS.starved, outfit: { kind: 'shirtUnderArmour', design: 0 } }));
    assert.ok(whole?.trunk?.some(([from, to]) => from < 0.4 && to > 0.8), 'a whole shirt covers the cage');
    assert.ok(!torn?.trunk?.some(([from, to]) => to > 0.4 && from < 0.8), `the rags leave it bare: ${JSON.stringify(torn?.trunk)}`);
  } finally {
    delete OUTFITS.ragsUnderArmour;
    delete OUTFITS.shirtUnderArmour;
  }
});

test('the plain loft (drawn while his V7 skin is built) paints his ribs; a fed man\'s is plain', () => {
  const starved = buildLoftBody(buildBody(PRESETS.starved));
  assert.ok(starved.tint && starved.tint.length === starved.positions.length);
  assert.ok(Math.min(...starved.tint) < 0.85 && Math.max(...starved.tint) > 1.0, 'grooves dark, ribs lit');
  assert.equal(buildLoftBody(buildBody(PRESETS.spear)).tint, undefined);
  assert.equal(buildLoftBody(buildBody(PRESETS.starved), { lowDetail: true }).tint, undefined, 'not in a crowd');
});

test('starving rebels dealt at random: 18 to 60, 160–175 cm, BMI 14–15.5, each in his own rags', () => {
  const random = seededRandom(21);
  const men = Array.from({ length: 24 }, () => starvedRebel(random));
  for (const man of men) {
    const stats = deriveStats(buildBody(man));
    assert.ok(man.age >= 18 && man.age <= 60, `${man.name}: ${man.age}`);
    assert.ok(man.heightCm >= 160 && man.heightCm <= 175);
    assert.ok(stats.bmi >= 13.8 && stats.bmi <= 15.7, `${man.name}: BMI ${stats.bmi.toFixed(2)}`);
    assert.equal(man.outfit.kind, 'rags');
    assert.equal(man.style, 'pitchfork');
    assert.ok(man.outfit.tear.amount >= 0.6 && man.outfit.tear.amount <= 1);
  }
  assert.ok(new Set(men.map((man) => man.name)).size > 12, 'names differ');
  assert.ok(new Set(men.map((man) => man.outfit.tear.sleeve)).size >= 3, 'sleeves torn differently');
  assert.ok(new Set(men.map((man) => man.outfit.design)).size === 2, 'bare and wrapped feet');
  assert.ok(finite(buildLoftBody(buildBody(men[0]))));
});

test('he is the roster\'s and the sandbox\'s, but never dealt at random (the casts and battles stay as they were)', () => {
  assert.ok(WARRIORS.some((warrior) => warrior.key === 'starved' && warrior.title === 'Starved Rebel'));
  const random = seededRandom(3);
  for (let index = 0; index < 200; index += 1) assert.notEqual(randomCharacter(random).name, PRESETS.starved.name);
});

test('the level preset builds, and a stage spawn can use it (as itself, or with a dealt man\'s inputs)', () => {
  const inputs = levelPreset('starvedRebel');
  assert.equal(inputs.outfit.kind, 'rags');
  assert.ok(LEVEL_PRESETS.starvedRebel && PRESETS.starvedRebel === undefined);
  const stage = structuredClone(TESTYARD);
  stage.sections = stage.sections.filter((section) => section.id !== 'vault');
  for (const section of stage.sections) section.portals = section.portals.filter((portal) => portal.to !== 'vault');
  stage.sections[0].ladders = [];
  stage.sections[0].spawns = [
    { id: 'starved1', preset: 'starvedRebel', role: 'enemy', tier: 1, post: [6, 0, 4], facing: 0 },
    { id: 'starved2', preset: 'starvedRebel', role: 'enemy', tier: 1, post: [6, 0, -4], facing: 0, inputs: starvedRebel(seededRandom(4)) },
  ];
  const world = createStageWorld(stage, structuredClone(PRESETS.ronin), { seed: 3 });
  const [first, second] = ['starved1', 'starved2'].map((id) => world.fighters.find((fighter) => fighter.spawn?.id === id));
  assert.equal(first.body.inputs.name, 'Starved rebel');
  assert.equal(first.corner, 'blue');
  assert.notEqual(second.body.inputs.name, 'Starved rebel');
  assert.equal(second.body.inputs.outfit.kind, 'rags');
  advance(world, 1, (current, dt) => thinkAll(current, dt));
  assert.ok(world.fighters.every((fighter) => fighter.x.every(Number.isFinite)));
});

test('he fights headless: against a levy and a Maidstone rebel, the bouts run and stay finite', () => {
  for (const [other, seed] of [[levelPreset('dunnottarSoldier'), 1001], [PRESETS.spear, 1002]]) {
    const world = createWorld([{ inputs: structuredClone(PRESETS.starved), corner: 'red' }, { inputs: structuredClone(other), corner: 'blue' }], { seed });
    for (let second = 0; second < 8 && !boutWinner(world); second += 1) advance(world, 1, (current, dt) => thinkAll(current, dt));
    assert.ok(world.fighters.every((fighter) => fighter.x.every(Number.isFinite)));
    assert.equal(world.fighters[0].body.inputs.style, 'pitchfork');
  }
});
