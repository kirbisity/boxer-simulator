// The crowd's body in the base style (buildLoftBody `lowDetail` + `base`: the crowd mesh placed on a man's rings), for every
// distinct build of a stage's cast and of the body progression: built in bounded time, every point within the man. On the
// crowd mesh's sparser rows the chest's width was once read off a row holding one point beside the midline (basebody.js
// shoulderPlus), the chest flung metres out, and the cloth fitting's sampling of those faces ran the page out of memory
// (Dunnottar's turnkey and Lord Vaelen: "target crashed" on opening the stage).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, P } from '../src/body.js';
import { bindPoints } from '../src/rig.js';
import { buildLoftBody } from '../src/loftbody.js';
import { crowdKey } from '../src/crowdview.js';
import { createLevelWorld } from '../src/levelmode/level.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { DUNNOTTAR } from '../src/levelmode/stages/dunnottar.js';
import { progression } from '../tools/bodysheet-cast.js';

test('the crowd bake: every build of Dunnottar\'s cast and the progression bakes in bounded time, every point within the man', () => {
  const world = createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed: 4 });
  const builds = new Map();
  for (const fighter of world.fighters) if (!builds.has(crowdKey(fighter))) builds.set(crowdKey(fighter), fighter.body);
  for (const row of [...progression('male'), ...progression('female')]) builds.set(`${row.inputs.sex} ${row.key}`, buildBody(row.inputs));
  assert.ok(builds.size > 25, `${builds.size} builds`);
  const started = performance.now();
  for (const body of builds.values()) {
    const name = body.inputs.name ?? body.inputs.sex;
    const mesh = buildLoftBody(body, { lowDetail: true, base: true });
    const pelvis = bindPoints(body)[P.pelvis];
    const points = mesh.positions.length / 3;
    assert.ok(points < 5000, `${name}: ${points} points`);
    for (let point = 0; point < points; point += 1) {
      const [x, y, z] = [mesh.positions[point * 3], mesh.positions[point * 3 + 1], mesh.positions[point * 3 + 2]];
      // (Standing, arms at his sides, a skirt flared: the widest a third of his height from the line through his pelvis.)
      const off = Math.hypot(x - pelvis[0], z - pelvis[2]) / body.heightM;
      if (!(off < 0.4) || !(y > -0.02 && y < body.heightM)) assert.fail(`${name}: point ${point} at [${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}] is out of the man`);
    }
  }
  // (About 6 s here for 34 builds; a runaway bake ran out of 4 GB in a minute.)
  const seconds = (performance.now() - started) / 1000;
  assert.ok(seconds < 40, `${seconds.toFixed(1)} s`);
});
