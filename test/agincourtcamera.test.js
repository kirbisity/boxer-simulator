// Agincourt's camera: where the watching camera stands when the battle opens (render.js placeCamera: the orbit about the middle of all the men, drawn back to the level's
// `maxDistance`) and what it sees. It once stood at the English line, 12 m up and looking down the field with the woods' crowns on both sides of it and the English
// archers behind its lens: the whole of the English army was out of the picture. Now it looks across the field from above the woods, and both armies are in it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs, P } from '../src/body.js';
import { createWorld, seededRandom } from '../src/physics.js';
import { battleOf } from '../src/scenarios.js';
import { frameDistance } from '../src/watchcam.js';

const FOV = 40;
const ASPECT = 16 / 9;

/** Where the camera is for the level's opening, and a function from a world point to the screen (x, y in -1..1 when in the picture; z the depth in front of the lens). */
function opening(key) {
  const level = battleOf(key);
  const sides = level.cast(seededRandom(1));
  const entries = ['red', 'blue'].flatMap((corner) => sides[corner].map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner })));
  const world = createWorld(entries, { seed: 1, arena: level.arena, rules: level.rules, formation: level.formation });
  const men = world.fighters;
  const middle = [0, 1.1, 0];
  for (const man of men) {
    middle[0] += man.x[P.pelvis * 3] / men.length;
    middle[2] += man.x[P.pelvis * 3 + 2] / men.length;
  }
  const spread = Math.max(...men.map((man) => Math.hypot(man.x[P.pelvis * 3] - middle[0], man.x[P.pelvis * 3 + 2] - middle[2])));
  const { yaw, pitch, maxDistance } = level.camera;
  const distance = Math.min(maxDistance ?? Infinity, frameDistance(spread));
  const camera = [middle[0] + Math.cos(pitch) * Math.cos(yaw) * distance, middle[1] + Math.sin(pitch) * distance, middle[2] + Math.cos(pitch) * Math.sin(yaw) * distance];
  const forward = middle.map((value, index) => value - camera[index]);
  const length = Math.hypot(...forward);
  forward.forEach((value, index) => (forward[index] = value / length));
  const right = [-forward[2], 0, forward[0]];
  const rightLength = Math.hypot(...right);
  right.forEach((value, index) => (right[index] = value / rightLength));
  const up = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
  const tan = Math.tan((FOV / 2) * (Math.PI / 180));
  const screen = (point) => {
    const d = point.map((value, index) => value - camera[index]);
    const depth = d[0] * forward[0] + d[1] * forward[1] + d[2] * forward[2];
    return { x: (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / depth / (tan * ASPECT), y: (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / depth / tan, depth };
  };
  return { level, world, camera, screen, distance };
}

test('Agincourt opens with both armies in the picture, the English line in front and the French vanguard across the field', () => {
  const { world, screen } = opening('agincourt');
  const corner = (name) => world.fighters.filter((man) => man.corner === name);
  for (const side of ['blue', 'red']) {
    const seen = corner(side).filter((man) => !man.mount).map((man) => screen([man.x[P.pelvis * 3], 1, man.x[P.pelvis * 3 + 2]]));
    const inside = seen.filter((at) => at.depth > 0 && Math.abs(at.x) < 0.98 && Math.abs(at.y) < 0.98).length;
    assert.ok(inside >= seen.length * 0.9, `${side}: ${inside} of ${seen.length} men on the screen`);
  }
});

test('Agincourt\'s camera stands above the woods\' crowns, not among them', () => {
  const { camera, level } = opening('agincourt');
  // The trees of the wood's edge are 6 to 10 m tall (worksview.js WORKS_VIEW.wood), their crowns another few metres across.
  assert.ok(camera[1] > 20, `${camera[1].toFixed(1)} m up`);
  // And it looks across the field, from beyond the wood on one side of it, not along the corridor from the English end (where it stood among the trees).
  const edge = Math.max(...level.arena.works.walls[0].points.map((point) => Math.abs(point[1])));
  assert.ok(Math.abs(camera[2]) > edge, `${camera[2].toFixed(1)} m across, the woods' edge at ${edge} m`);
});
