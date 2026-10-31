// The context button's reach for gates, doors and ladders (levelmode/interact.js): offered across the whole approach to a gate, not on one spot in front of it,
// from its own side only; and the approaches in Dunnottar's data are as deep as the spec asks (5 m and more).

import test from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { placeOnFloor } from '../src/physics.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { createLevelWorld, interactions } from '../src/levelmode/level.js';
import { updateStage } from '../src/levelmode/stage.js';
import { DUNNOTTAR, DN_Y } from '../src/levelmode/stages/dunnottar.js';
import { LEVEL_CONFIG } from '../src/levelmode/config.js';

const world = () => createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed: 4 });
const stand = (w, x, y, z) => {
  placeOnFloor(w.fighters[0], x, z, y, 0);
  updateStage(w, true);
  return interactions(w);
};
const offers = (w, id, x, y, z) => stand(w, x, y, z).some((entry) => entry.id === id);

test('interact: the button for a gate is offered over the whole approach, a stride or four from any point along its width', () => {
  const w = world();
  assert.ok(LEVEL_CONFIG.interact.mechanismReach >= 3.5, 'the reach for a gate is generous');
  // The great gate (cliffgate), inside the guard hall: its leaf is z 44.6..47.8 at x -6; from the middle of the hall, from either end of its width, from the side and from 4 m off.
  for (const [x, z] of [[-4.2, 46.2], [-3, 44.2], [-3, 48.2], [-2.2, 46.2], [-2.6, 44.8], [-2.6, 47.8], [-2.8, 49.6]]) {
    assert.ok(offers(w, 'gate:cliffgate', x, DN_Y.gorge, z), `the great gate is offered at ${x}, ${z}`);
  }
  // The iron gate at the foot of the vault's shortcut stair (z -17.9, 5.4 wide at x 24.7): across the cellar, 4 m along it.
  for (const [x, z] of [[24.7, -19.4], [22.4, -20.5], [27.2, -20.6], [21, -20], [24.7, -21.5], [28.4, -19.8]]) {
    assert.ok(offers(w, 'gate:irongate', x, DN_Y.vault, z), `the iron gate is offered at ${x}, ${z}`);
  }
  // The chapel's gate (x -2.8, the wall walk's east end), from along the walk.
  for (const [x, z] of [[-1.4, -36], [0.5, -36.2], [0.8, -35.0], [0.6, -38.2]]) {
    assert.ok(offers(w, 'gate:chapelgate', x, DN_Y.ladderRoom, z), `the chapel gate is offered at ${x}, ${z}`);
  }
  // And the ladder, kicked down from the wall walk, from along it.
  for (const [x, z] of [[14.3, -35.4], [12, -36.6], [17, -36.2], [10.8, -35.4]]) {
    assert.ok(offers(w, 'ladder:ladder1', x, DN_Y.ladderRoom, z), `the ladder is offered at ${x}, ${z}`);
  }
});

test('interact: not from the wrong side, nor from too far, nor from another floor', () => {
  const w = world();
  // The great gate from outside it (the gorge side, x < -6.8): not offered, even at arm's length.
  for (const [x, z] of [[-8.4, 46.2], [-9.5, 45], [-12, 46.2]]) assert.ok(!offers(w, 'gate:cliffgate', x, DN_Y.gorge, z), `the great gate is not offered from outside at ${x}`);
  // Too far inside the hall: more than the reach from the leaf.
  assert.ok(!offers(w, 'gate:cliffgate', 2.4, DN_Y.gorge, 46.2), 'not from 8 m off');
  // The iron gate from the stair side (north of the cellar is the way in; the stair above it, y 6.2 and up, is another floor).
  assert.ok(!offers(w, 'gate:irongate', 24.7, DN_Y.vault + 3, -12), 'not from the stair above it');
  // The chapel gate from inside the chapel (it is worked from the wall walk): not offered.
  assert.ok(!offers(w, 'gate:chapelgate', -8, DN_Y.ladderRoom, -36), 'not from inside the chapel');
  // The ladder: not from the court below.
  assert.ok(!offers(w, 'ladder:ladder1', 14.3, DN_Y.quad, -30), 'not from the court');
});

test('interact: the gates and the ladder of Dunnottar open from regions at least 5 m deep on their own side', () => {
  for (const section of DUNNOTTAR.sections) {
    for (const mechanism of [...section.gates, ...section.ladders]) {
      const region = mechanism.opensFrom ?? mechanism.kickFrom;
      if (!region) continue;
      const entry = Array.isArray(region) ? region[0] : region;
      const depth = Math.max(...entry.size);
      assert.ok(depth >= 5, `${mechanism.id}: the region is ${entry.size} m`);
    }
  }
});

test('interact: the lever and the gate answer with a label that names the target', () => {
  const w = world();
  const found = stand(w, -3, DN_Y.gorge, 46.2).find((entry) => entry.id === 'gate:cliffgate');
  assert.match(found.label, /bar|gate/i);
  // (Dunnottar has no lever now: the sea-gate's is gone, the user's call. Every lever a stage has names itself one.)
  for (const lever of DUNNOTTAR.sections.flatMap((section) => section.levers)) assert.match(lever.label ?? 'Pull lever', /lever/i);
  const me = w.fighters[0];
  assert.ok(Number.isFinite(me.x[P.pelvis * 3]));
});
