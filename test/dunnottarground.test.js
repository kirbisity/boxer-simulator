// Stage 1, Dunnottar: the scenery stands on the ground. Every prop, rock, cairn and fence is at the height of what is under it: a floor of the stage
// (physics/terrain.js floorAt over every section) or the mainland hillside as the kit draws it (levelmode/landform.js mainlandHeight, the same
// function). The trebuchet behind the start stood 7 m up in the air (it was put at the plateau's height on the slope below it): this is so that
// nothing floats again when the land or a floor moves.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mechanismsOf, stageTerrain } from '../src/levelmode/stage.js';
import { mainlandHeight } from '../src/levelmode/landform.js';
import { DUNNOTTAR } from '../src/levelmode/stages/dunnottar.js';
import { floorAt } from '../src/physics/terrain.js';

const states = Object.fromEntries(mechanismsOf(DUNNOTTAR).map((mechanism) => [mechanism.id, mechanism.state]));
const terrain = stageTerrain(DUNNOTTAR, DUNNOTTAR.sections.map((section) => section.id), states);
const land = mainlandHeight(DUNNOTTAR);

/** The ground under (x, z) for a thing whose foot is at y: the highest floor or hillside at or a little above its foot, within `reach` m of the point. */
function groundUnder(x, z, y, reach = 0) {
  let best = -Infinity;
  const offsets = reach > 0 ? [[0, 0], [reach, 0], [-reach, 0], [0, reach], [0, -reach], [reach, reach], [reach, -reach], [-reach, reach], [-reach, -reach]] : [[0, 0]];
  for (const [dx, dz] of offsets) {
    const floor = floorAt(terrain, x + dx, z + dz, y + 0.6);
    if (floor > best) best = floor;
    const hill = land(x + dx, z + dz);
    if (hill <= y + 0.6 && hill > best) best = hill;
  }
  return best;
}

// Props that hang on a wall, perch on something or hang from a roof: not stood on the ground.
const HUNG = new Set(['torch', 'raven', 'drip', 'grating', 'chains', 'keys', 'lever', 'chandelier', 'banner', 'votive', 'shaft', 'lightshaft', 'privy', 'flies']);
// (The privy is placed at its seat's height on its own stone block, and the flies hover over it.)

test('scenery: every prop on the ground stands on it (a floor or the hillside), within a few centimetres', () => {
  const floating = [];
  let checked = 0;
  // (The old drain is left out: it is being rebuilt apart, the cesspool and its water with it; its props are its own.)
  for (const section of DUNNOTTAR.sections.filter((entry) => entry.id !== 'sewer')) {
    for (const decor of section.decor) {
      if (decor.kind !== 'prop' || HUNG.has(decor.what) || decor.lift) continue;
      const [x, y, z] = decor.at;
      const ground = groundUnder(x, z, y);
      checked += 1;
      // (Litter and a puddle lie a hair over the floor; a thing on a table or a heap of kegs stands on that: it is counted from what it stands on, the table's top being a floor of its own to the physics or not.)
      // (A puddle lies on a floor, or in a flooded bed a stride under it.)
      if (decor.what === 'puddle' ? Math.abs(y - ground) > 0.45 : Math.abs(y - ground) > 0.12 && !(y > ground && y - ground < 1.0 && ['tools', 'crate', 'keys', 'chalice', 'bucket', 'skull', 'candle'].includes(decor.what))) floating.push(`${section.id} ${decor.what} at ${decor.at.map((v) => v.toFixed(2))}: the ground is at ${ground.toFixed(2)}`);
    }
  }
  assert.ok(checked > 150, `${checked} props looked at`);
  assert.deepEqual(floating, []);
});

test('scenery: the rocks and cairns of the mainland stand in the hillside: none floats over it, none is buried out of sight', () => {
  const wrong = [];
  // (The mainland's: the cliff path's section. A rock in a cave stands on the cave's floor, not on the hill over it.)
  for (const section of DUNNOTTAR.sections.filter((entry) => entry.id === 'cliff')) {
    for (const decor of section.decor) {
      if (decor.kind === 'outcrop') {
        for (const lump of decor.lumps) {
          const [x, y, z] = lump.at;
          const ground = land(x, z);
          // (A lump's foot is sunk in the ground; its top shows above it.)
          if (y > ground + 0.05) wrong.push(`${section.id} rock at ${x},${z}: its foot ${y.toFixed(2)} over the ground ${ground.toFixed(2)}`);
          if (y + lump.r[1] * 1.1 < ground + 0.5) wrong.push(`${section.id} rock at ${x},${z}: buried (top ${(y + lump.r[1] * 1.1).toFixed(2)}, ground ${ground.toFixed(2)})`);
        }
      }
      if (decor.kind === 'cairn') {
        const [x, y, z] = decor.at;
        const ground = groundUnder(x, z, y);
        if (Math.abs(y - ground) > 0.12) wrong.push(`${section.id} cairn at ${x},${z}: at ${y}, the ground at ${ground.toFixed(2)}`);
      }
    }
  }
  assert.deepEqual(wrong, []);
});

test('scenery: every fence runs on the ground, post by post (the ground within a post\'s reach)', () => {
  const wrong = [];
  for (const section of DUNNOTTAR.sections) {
    for (const fence of section.decor.filter((decor) => decor.kind === 'fence')) {
      for (let i = 0; i + 1 < fence.points.length; i += 1) {
        const [x0, z0, y0] = fence.points[i];
        const [x1, z1, y1] = fence.points[i + 1];
        const length = Math.hypot(x1 - x0, z1 - z0);
        for (let s = 0; s <= length + 1e-6; s += 1.6) {
          const t = length ? s / length : 0;
          const [x, z, y] = [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, y0 + (y1 - y0) * t];
          const ground = groundUnder(x, z, y, 0.5);
          // (A rail along a stair runs over its treads' nosings: up to a tread's rise over the ground beside it.)
          if (y - ground > 0.3 || ground - y > 0.5) wrong.push(`${section.id} fence at ${x.toFixed(1)},${z.toFixed(1)}: at ${y.toFixed(2)}, the ground at ${ground.toFixed(2)}`);
        }
      }
    }
  }
  assert.deepEqual(wrong, []);
});

test('scenery: the start\'s plateau sits in the hillside (the hill rises to meet it): no table of grass standing proud of the slope', () => {
  // Round the plateau (x -126..-104, z -10..2, at y 14), a metre out, the drawn hillside is within half a metre of the plateau's top.
  for (const [x, z] of [[-127, -4], [-115, 3], [-115, -11], [-127, 2], [-127, -10]]) {
    const hill = land(x, z);
    assert.ok(Math.abs(hill - 14) < 0.6, `the hill at ${x},${z} is at ${hill.toFixed(2)}`);
  }
});
