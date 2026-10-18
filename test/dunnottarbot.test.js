// The difficulty bot (tools/dunnottar.js) runs: a few seconds of each policy along the cliff path, and the boss duel's
// set-up, without throwing. (The full sweep is a tool, not a test: it takes minutes.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { Run, basePlan, bossDuel } from '../tools/dunnottar.js';

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
