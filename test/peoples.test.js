import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PEOPLES, peopleBuilds } from '../src/peoples.js';
import { PRESETS } from '../src/body.js';
import { bannerman, mingSoldier } from '../src/cast.js';
import { seededRandom } from '../src/physics.js';

test('every rank is its people plus its stated difference', () => {
  const builds = peopleBuilds();
  assert.deepEqual(builds.ming.garrison, { heightCm: PEOPLES.ming.heightCm, weightKg: PEOPLES.ming.weightKg, exercise: PEOPLES.ming.exercise });
  assert.equal(builds.ming.elite.heightCm, PEOPLES.ming.heightCm + PEOPLES.ming.ranks.elite.heightCm);
  assert.equal(builds.ming.brigandine.exercise, 0.68, 'a sum lands on the figure it states');
  // A body of men drawn from another people stands on that people's base.
  assert.equal(builds.qi.brigandine.heightCm, PEOPLES.mingSouth.heightCm + PEOPLES.qi.ranks.brigandine.heightCm);
  // A mix's kinds are differences from their rank.
  const [, , boys] = builds.mingCoast.garrison.mix;
  assert.equal(boys[1].heightCm, builds.mingCoast.garrison.heightCm + PEOPLES.mingCoast.ranks.garrison.mix[2][1].heightCm);
  for (const [people, ranks] of Object.entries(builds)) {
    for (const [rank, build] of Object.entries(ranks)) {
      for (const field of ['heightCm', 'weightKg', 'exercise']) assert.ok(Number.isFinite(build[field]), `${people} ${rank} ${field}`);
    }
  }
});

test('the named presets and the cast soldiers come from the one table', () => {
  assert.equal(PRESETS.mingSpear.heightCm, PEOPLES.ming.heightCm + 2);
  assert.equal(PRESETS.bannerBow.calories, PEOPLES.jurchen.calories + 500);
  // A generated man is drawn about his rank's build: the means of many lie on it.
  const random = seededRandom(3);
  const mean = (make) => Array.from({ length: 400 }, () => make().heightCm).reduce((sum, height) => sum + height, 0) / 400;
  assert.ok(Math.abs(mean(() => mingSoldier(random, 'spear', 'garrison')) - PEOPLES.ming.heightCm) < 1);
  assert.ok(Math.abs(mean(() => bannerman(random, 'spear', 'banner')) - (PEOPLES.jurchen.heightCm + PEOPLES.jurchen.ranks.banner.heightCm)) < 1);
});
