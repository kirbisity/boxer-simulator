// The man played keeps a little further off a wall than the garrison (WORLD.terrain.playerClearance): the camera's arm starts with its ball clear of the stone he stands
// at, and he does not look stuck to it. The doorways and flights of the stage must still let him through.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARM } from '../src/cameraarm.js';
import { P } from '../src/body.js';
import { WORLD } from '../src/physics/config.js';
import { placeOnFloor } from '../src/physics.js';
import { createStageWorld, updateStage } from '../src/levelmode/stage.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { DN_Y, DUNNOTTAR } from '../src/levelmode/stages/dunnottar.js';
import { walk } from './walker.js';

const quiet = (current) => current.fighters.slice(1).forEach((fighter) => { fighter.dormant = true; });

test('walls: the man played stops a body radius and a clearance off a wall; the clearance is the camera arm ball\'s, near enough', () => {
  const spec = WORLD.terrain;
  assert.ok(spec.playerClearance > 0);
  // The arm's soft ball (the radius it settles on) fits between the wall and a man at the wall's standoff, so the arm does not start pressed against the stone.
  assert.ok(spec.bodyRadius + spec.playerClearance >= ARM.radius, `${spec.bodyRadius + spec.playerClearance} m off the wall, the arm's ball ${ARM.radius}`);
  // The ascent's vestibule: the east face of the wall at x 14.5 (z 31.8..40.4). He walks west at it from the stair's foot, and stops short of the face.
  const w = createStageWorld(DUNNOTTAR, levelPreset('forger'), { seed: 3 });
  const me = w.fighters[0];
  placeOnFloor(me, 17.5, 36.5, DN_Y.landing, Math.PI);
  updateStage(w, true);
  walk(w, me, [[12.5, 36.5]], { seconds: 6, think: quiet, within: 0.05 });
  const gap = me.x[P.pelvis * 3] - 14.5;
  assert.ok(gap >= spec.bodyRadius + spec.playerClearance - 0.04, `stopped ${gap.toFixed(2)} m off the wall`);
  assert.ok(gap <= spec.bodyRadius + spec.playerClearance + 0.2, `and not much further (${gap.toFixed(2)} m)`);
});
