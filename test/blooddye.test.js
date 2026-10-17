import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOOD_DYE, bloodDyeAdd, bloodDyeClear, bloodDyeCloudAt, bloodDyeCreate, bloodDyeLand, bloodDyeUniforms, bloodDyeUpload, bloodDyeWaterAt } from '../src/blooddye.js';

// A place with one round puddle (radius 1 m at x 3) in a ground group that may be hidden (the cartoon look).
function viewWithPuddle({ shown = true, place = 'port' } = {}) {
  const puddle = (x, z) => {
    const d = Math.hypot(x - 3, z);
    return d < 1 ? { wet: 1 - d * 0.5, reach: 0.7 } : null;
  };
  const ground = { visible: shown, userData: { bloodDyeWater: [puddle] }, children: [] };
  return { place, places: { [place]: { visible: true, children: [{ visible: true, userData: {}, children: [] }, ground] } } };
}

test('a drop in standing water dissolves into a cloud; on dry ground it does not (it stains)', () => {
  const view = viewWithPuddle();
  const dye = bloodDyeCreate();
  assert.equal(bloodDyeLand(view, dye, 0, 0, 1, 0), false, 'dry ground');
  assert.equal(dye.clouds.length, 0);
  assert.equal(bloodDyeLand(view, dye, 3.1, 0.1, 1, 0), true, 'in the puddle');
  assert.equal(dye.clouds.length, 1);
  assert.equal(dye.clouds[0].reach, 0.7);
});

test('a hidden ground (the cartoon look) has no water: blood stains as before', () => {
  const view = viewWithPuddle({ shown: false });
  const dye = bloodDyeCreate();
  assert.equal(bloodDyeWaterAt(view, 3, 0).wet, 0);
  assert.equal(bloodDyeLand(view, dye, 3, 0, 1, 0), false);
  assert.equal(dye.clouds.length, 0);
});

test('drops landing together run into one cloud; one far off makes its own', () => {
  const dye = bloodDyeCreate();
  bloodDyeAdd(dye, 0, 0, 1, 1, 0);
  bloodDyeAdd(dye, 0.05, 0, 1, 1, 0);
  bloodDyeAdd(dye, 0, 0.04, 2, 1, 0);
  assert.equal(dye.clouds.length, 1);
  assert.equal(dye.clouds[0].amount, 4);
  assert.ok(Math.abs(dye.clouds[0].x - 0.0125) < 1e-9 && Math.abs(dye.clouds[0].z - 0.02) < 1e-9, 'the middle by amount');
  bloodDyeAdd(dye, 2, 2, 1, 1, 0);
  assert.equal(dye.clouds.length, 2);
  // Never more clouds than the shader takes: the rest join the nearest.
  for (let index = 0; index < 40; index += 1) bloodDyeAdd(dye, index * 0.5, -5, 1, 1, 0);
  assert.equal(dye.clouds.length, BLOOD_DYE.maxClouds);
  assert.equal(dye.clouds.reduce((sum, cloud) => sum + cloud.amount, 0), 45, 'no blood lost');
});

test('a cloud spreads like diffusion, pales as it does, and stops at the size of its water', () => {
  const dye = bloodDyeCreate();
  const cloud = bloodDyeAdd(dye, 0, 0, 20, 0.6, 0);
  const at = (t) => bloodDyeCloudAt(cloud, t);
  assert.ok(Math.abs(at(0).sigma - BLOOD_DYE.startSigma) < 1e-9, 'a few cm at first');
  assert.ok(at(1).sigma < 0.15, `still small after 1 s: ${at(1).sigma}`);
  assert.ok(at(10).sigma > at(1).sigma && at(10).density < at(1).density, 'wider and paler');
  assert.ok(Math.abs(at(40).sigma - 0.6) < 1e-9, 'the puddle\'s size by 40 s');
  assert.equal(at(400).sigma, 0.6, 'and no further');
  // The amount stays: density × area is constant.
  for (const t of [0, 5, 30]) assert.ok(Math.abs(at(t).density * at(t).sigma ** 2 - BLOOD_DYE.perDrop * 20) < 1e-9);
  // Fresh blood into an old cloud makes it darker, not wider.
  const before = at(20);
  bloodDyeAdd(dye, 0, 0, 20, 0.6, 20);
  const after = bloodDyeCloudAt(cloud, 20);
  assert.ok(after.sigma < before.sigma && after.density > before.density);
});

test('the clouds go to the shader, and are cleared for a new bout and a new place', () => {
  const view = viewWithPuddle();
  const dye = bloodDyeCreate();
  bloodDyeLand(view, dye, 3, 0, 1, 0);
  bloodDyeLand(view, dye, 3.6, 0.3, 1, 0);
  bloodDyeUpload(dye, 5, view.place);
  assert.equal(bloodDyeUniforms.bloodDyeCount.value, 2);
  const data = bloodDyeUniforms.bloodDyeClouds.value;
  assert.equal(data[0], 3);
  assert.ok(Math.abs(data[2] - bloodDyeCloudAt(dye.clouds[0], 5).sigma) < 1e-6);
  // A new bout.
  bloodDyeClear(dye);
  bloodDyeUpload(dye, 5, view.place);
  assert.equal(bloodDyeUniforms.bloodDyeCount.value, 0);
  // A new place: the old place's clouds go.
  bloodDyeLand(view, dye, 3, 0, 1, 0);
  bloodDyeUpload(dye, 6, 'meadow');
  assert.equal(dye.clouds.length, 0);
  assert.equal(bloodDyeUniforms.bloodDyeCount.value, 0);
  // No blood: nothing for the shader.
  bloodDyeUpload(bloodDyeCreate(), 0);
  assert.equal(bloodDyeUniforms.bloodDyeCount.value, 0);
});

test('clouds that spread into each other become one, keeping all the blood', () => {
  const dye = bloodDyeCreate();
  bloodDyeAdd(dye, 0, 0, 3, 1, 0);
  bloodDyeAdd(dye, 0.3, 0, 5, 1, 0);
  assert.equal(dye.clouds.length, 2, 'apart at first');
  bloodDyeUpload(dye, 1);
  assert.equal(dye.clouds.length, 2, 'still apart after 1 s');
  bloodDyeUpload(dye, 20);
  assert.equal(dye.clouds.length, 1, 'one cloud once they overlap');
  assert.equal(dye.clouds[0].amount, 8);
  assert.ok(Math.abs(dye.clouds[0].x - 0.1875) < 1e-9);
});
