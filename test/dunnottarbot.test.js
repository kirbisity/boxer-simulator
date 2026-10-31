// The difficulty bot (tools/dunnottar.js) runs: a few seconds of each policy along the cliff path, the sewer route's plan, the knight's and the boss duel's
// set-up, without throwing. (The full sweep is a tool, not a test: it takes minutes.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { Run, basePlan, bossDuel, knightDuel, setRoute } from '../tools/dunnottar.js';
import { DUNNOTTAR_SEWER_ROUTE } from '../src/levelmode/stages/dunnottar.js';

test('dunnottar bot: both policies walk the route for a few seconds', () => {
  for (const policy of ['careful', 'reckless']) {
    const run = new Run({ policy, seed: 3, plan: basePlan() });
    const start = run.me.x[P.pelvis * 3];
    const report = run.play({ seconds: 6, final: false });
    assert.equal(report.deaths.length, 0, policy);
    assert.ok(run.me.x[P.pelvis * 3] > start + 3, `${policy} walked on`);
    assert.equal(report.furthest, 'cliff');
  }
});

test('dunnottar bot: the boss duel starts at the chapel gate and runs', () => {
  const result = bossDuel('healed', 5, false, 4);
  assert.equal(result.variant, 'healed');
  assert.ok(['beaten', 'died', 'timeout'].includes(result.result));
});

test('dunnottar bot: the sewer route is a policy option: the plan goes by the sea cave, through the crypt and up the well shaft (no lever), joins the main route, and a run on it walks on', () => {
  setRoute('sewer');
  try {
    const plan = basePlan();
    assert.equal(plan.length, DUNNOTTAR_SEWER_ROUTE.reduce((total, leg) => total + leg.points.length, 0));
    assert.ok(plan.some((entry) => entry.leg === 'the cistern causeway'));
    assert.ok(!plan.some((entry) => entry.acts.some((act) => act.kind === 'lever')), 'no lever to pull: the heavy door stays shut');
    assert.ok(plan.some((entry) => entry.leg === 'up the well shaft'), 'up the well shaft into the cellar');
    assert.ok(!plan.some((entry) => entry.leg === 'the oillet stair'), 'the gatehouse is not on it');
    assert.ok(plan.some((entry) => entry.leg === 'the long cellar'), 'it joins the main route in the cellar');
    const run = new Run({ policy: 'careful', seed: 3, plan });
    run.play({ seconds: 6, final: false });
    assert.equal(run.report().route, 'sewer');
    assert.equal(run.report().furthest, 'cliff');
  } finally {
    setRoute('front');
  }
});

test('dunnottar bot: the knight duel starts at the gorge brazier with the knight awake and runs', () => {
  const result = knightDuel(5, false, 4);
  assert.ok(['beaten', 'died', 'timeout'].includes(result.result));
  assert.equal(typeof result.knightHurt, 'number');
});
