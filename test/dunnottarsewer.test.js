// Stage 1, Dunnottar: the way round the guarded gate. A full-plate knight stands on the ledge to the postern; the sea cave at the foot of the gorge shelf
// leads into the Old Drain (section `sewer`), which comes up by the crypt's sea-gate into the vault. The data is sound (the sections hold the men and
// things in them, the cave's mouth lies where its portals say, the drain is walkable end to end and has no drop in it) and a ghost-walk sprint goes from
// the cliff path to the vault by it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { advance, placeOnFloor } from '../src/physics.js';
import { OUTFITS } from '../src/outfits.js';
import { floorAt } from '../src/physics/terrain.js';
import { activeSections, mechanismsOf, sectionById, setMechanism, stageTerrain, updateStage } from '../src/levelmode/stage.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { createLevelWorld, levelThink } from '../src/levelmode/level.js';
import { travelPlaces } from '../src/levelmode/travel.js';
import { DN_RAVINE, DN_Y, DUNNOTTAR, DUNNOTTAR_ROUTE, DUNNOTTAR_SEWER_ROUTE } from '../src/levelmode/stages/dunnottar.js';
import { DN_CAVE, DN_CAVE_STAIR, DN_CESSPOOL } from '../src/levelmode/stages/dunnottar-sewer.js';
import { floodFill } from './edges.js';
import { walk } from './walker.js';

const sewer = sectionById(DUNNOTTAR, 'sewer');
const cliff = sectionById(DUNNOTTAR, 'cliff');
const pelvisY = (fighter) => fighter.x[P.pelvis * 3 + 1];
const quiet = (current) => current.fighters.slice(1).forEach((fighter) => { fighter.dormant = true; });

// (Round 3: the levies Wat, Peem and Jock and Sergeant Mungo are gone, the user's call: no soldier goes down into the sewage. The one man there is Noname,
// the cesspool's miniboss: test/dunnottarcesspool.test.js.)
test('sewer: a section of its own, dark, with one rest half way, no soldier in it but the one thing in the cesspool, and things to take', () => {
  assert.ok(sewer);
  assert.ok(sewer.activeOnly, 'drawn only while he is in it');
  assert.equal(sewer.rest.id, 'restdrain', 'one smugglers\' brazier on the way');
  assert.ok(sewer.light <= 0.25, 'dark');
  assert.deepEqual(sewer.spawns.map((spawn) => spawn.id), ['noname'], 'nobody but Noname');
  assert.ok(sewer.items.some((item) => item.kind === 'bandage') && sewer.items.some((item) => item.kind === 'tonic'));
  // The fast-travel list has it (the sandbox's Go to menu is made from the stage's own data).
  assert.ok(travelPlaces(DUNNOTTAR).some((place) => place.id === 'section:sewer' && place.label === 'The Old Drain'));
  // The note at the stair head hints at the drain.
  const note = cliff.items.find((item) => item.note === 'drain');
  assert.ok(note && note.at[1] < 1 && note.at[2] > 50, 'the note stands on the shelf by the stair head');
});

test('sewer: the front gate is held by a knight in full plate, on the ledge to the postern, where there is no way past him', () => {
  const gate = sectionById(DUNNOTTAR, 'gate');
  const knight = gate.spawns.find((spawn) => spawn.id === 'gateknight');
  assert.ok(knight && knight.role === 'enemy' && knight.tier === 3);
  assert.equal(knight.inputs.name, 'Sir Alasdair');
  const inputs = levelPreset(knight.preset);
  assert.equal(inputs.outfit.kind, 'knight');
  assert.ok(OUTFITS.knight.plated && OUTFITS.knight.label.includes('full plate'));
  assert.ok(inputs.outfit.design >= 0);
  // The ledge is the one way to the postern: a slab 3.4 m across, and he stands on it, looking back the way a man comes.
  const ledge = gate.terrain.find((solid) => solid.kind === 'slab' && solid.at[1] > 53 && solid.size[1] < 4 && solid.size[0] > 10);
  assert.ok(ledge, 'the ledge');
  assert.ok(ledge.size[1] <= 3.6);
  assert.ok(Math.abs(knight.post[2] - ledge.at[1]) < ledge.size[1] / 2 - 0.5, 'on the ledge, not beside it');
  assert.ok(knight.post[0] > ledge.at[0] - ledge.size[0] / 2 && knight.post[0] < 2, 'before the postern');
  assert.ok(Math.abs(Math.cos(knight.facing) + 1) < 1e-6, 'facing west, along the ledge toward the shelf');
});

test('sewer: the sea cave is under the gorge shelf, its mouth in the cliff face at the foot of a stair, and the shelf over it is a plate', () => {
  const states = Object.fromEntries(mechanismsOf(DUNNOTTAR).map((mechanism) => [mechanism.id, mechanism.state]));
  const shelfOnly = stageTerrain(DUNNOTTAR, ['cliff'], states);
  // The plate: the shelf is level there as everywhere, and a man put under it (in the cave) is not inside the shelf's column.
  assert.equal(floorAt(shelfOnly, DN_CAVE.x, 50, 1), DN_Y.gorge);
  assert.equal(floorAt(shelfOnly, DN_CAVE.x, 57.6, DN_CAVE.floor + 0.5), DN_CAVE.floor);
  assert.equal(floorAt(shelfOnly, DN_CAVE.x, 50, DN_CAVE.floor + 1), -Infinity, 'cut away under the plate: the cave is not the shelf');
  // The shelf elsewhere is whole (a column to the sea).
  assert.equal(floorAt(shelfOnly, -60, 50, DN_CAVE.floor + 0.5), -Infinity);
  const plates = cliff.terrain.filter((solid) => solid.kind === 'slab' && solid.top === DN_Y.gorge && solid.bottom !== undefined && !solid.span);
  assert.equal(plates.length, 1);
  // Who is active where: the cave's south end holds both sections (the plate and the face are the cliff's), its depths only the sewer, the shelf only the cliff.
  assert.deepEqual(activeSections(DUNNOTTAR, [DN_CAVE.x, DN_CAVE.floor + 0.95, 57.6]), ['cliff', 'sewer']);
  assert.deepEqual(activeSections(DUNNOTTAR, [DN_CAVE.x, DN_CAVE.floor + 0.95, 55.2]), ['cliff', 'sewer']);
  assert.deepEqual(activeSections(DUNNOTTAR, [DN_CAVE.x, DN_CAVE.floor + 0.95, 50]), ['sewer']);
  assert.deepEqual(activeSections(DUNNOTTAR, [DN_CAVE.x, 1, 50]), ['cliff']);
  assert.ok(activeSections(DUNNOTTAR, [DN_CAVE_STAIR.head + 1.7, 0.95, 56.5]).includes('cliff'), 'at the stair head');
  assert.ok(!activeSections(DUNNOTTAR, [DN_CAVE_STAIR.head + 1.7, 0.95, 56.5]).includes('gate'), 'the stair head does not wake the gatehouse');
});

test('sewer: the drain is walkable from the cave to the sea-gate, without a drop in it, and its floors are each in the sewer or the crypt', () => {
  const states = Object.fromEntries(mechanismsOf(DUNNOTTAR).map((mechanism) => [mechanism.id, mechanism.state]));
  const terrain = stageTerrain(DUNNOTTAR, DUNNOTTAR.sections.map((section) => section.id), states);
  // (From the landing, over the cave's side of the stage: x -57..-0.5, so that the shelf's east end and the sea-gate chamber's far side are left alone.)
  const flood = floodFill(terrain, [DN_CAVE.x, DN_CAVE.floor, 57.6], { limit: 200000, bounds: [-57, -0.5, -45, 62] });
  assert.ok(!flood.truncated);
  // Every edge is on the cliff: the landing's and the stair's open side, the shelf's south edge, the ravine's west bank beside the drawbridge; and the sides of
  // the cesspool's ramps (a step down into its pit).
  const inPit = (edge) => Math.hypot(edge.at[0] - DN_CESSPOOL.at[0], edge.at[1] - DN_CESSPOOL.at[2]) < DN_CESSPOOL.radius + 0.6 && Math.abs(edge.floor - DN_CESSPOOL.rim) < 0.3;
  const onRavine = (edge) => Math.abs(edge.floor) < 0.5 && edge.at[0] >= DN_RAVINE.x0 - 1 && edge.at[0] <= DN_RAVINE.x0 + 0.5;
  const stray = flood.edges.filter((edge) => !(edge.at[1] >= 55 && edge.floor < 0.5) && !inPit(edge) && !onRavine(edge));
  assert.deepEqual(stray.map((edge) => `${edge.at.map((v) => v.toFixed(1))} at ${edge.floor.toFixed(2)}`), []);
  assert.ok(flood.standing > 1500, `${flood.standing} places to stand`);
  // The walker's way through the sewer: each point of it stands in the sewer (or the crypt) and on a floor.
  for (const leg of DUNNOTTAR_SEWER_ROUTE.filter((entry) => ['sewer', 'crypt'].includes(entry.to))) {
    for (const [x, z] of leg.points) {
      // (Looking down from under the shelf's level, so as to find the drain's floor and not the shelf's; from higher at the last stair.)
      const floor = floorAt(terrain, x, z, x > -13 && z < -30 ? 3 : -0.8);
      assert.ok(Number.isFinite(floor), `${leg.name}: ${x},${z} has a floor`);
      assert.ok(activeSections(DUNNOTTAR, [x, floor + 0.95, z]).some((id) => ['sewer', 'crypt'].includes(id)), `${leg.name}: ${x},${z} is in the sewer or the crypt`);
    }
  }
});

test('sewer: nothing else claims the drain: no other section holds a point of its floor, but the crypt at the sea-gate door and the cliff at the mouth', () => {
  for (const [x, z] of [[-48.5, 40], [-48.5, 12], [-48.5, -4], [-48.5, -30], [-30, -37.9], [-14, -37.9]]) {
    const y = (z < -15 ? DN_CAVE.drain : DN_CAVE.floor) + 0.95;
    assert.deepEqual(activeSections(DUNNOTTAR, [x, y, z]), ['sewer'], `${x},${z}`);
  }
  assert.deepEqual(activeSections(DUNNOTTAR, [-3, DN_Y.crypt + 0.95, -37.9]), ['crypt', 'sewer']);
});

test('sewer: a ghost walk at a sprint goes from the cliff path through the sea cave and the old drain, up the stair behind the heavy door, into the vault', () => {
  const w = createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed: 21 });
  w.stage.ghost = true;
  const me = w.fighters[0];
  me.running = true;
  const seen = new Set();
  const think = (current, dt) => {
    quiet(current);
    levelThink(current, dt);
    current.stage.active.forEach((id) => seen.add(id));
  };
  // (From the foot of the cliff path's last leg: the path itself is the main route's.)
  for (const leg of DUNNOTTAR_SEWER_ROUTE.slice(0, DUNNOTTAR_SEWER_ROUTE.findIndex((entry) => entry.name === 'the long cellar'))) {
    for (const id of leg.open ?? []) setMechanism(w, id, 'open');
    me.running = true;
    const result = walk(w, me, leg.points, { seconds: 200, think });
    assert.equal(result.reached, leg.points.length, `${leg.name}: stuck at ${JSON.stringify(leg.points[result.reached])} near ${result.stuckAt?.map((v) => v.toFixed(1))}`);
    assert.ok(w.stage.active.includes(leg.to), `${leg.name}: ${leg.to} is active at the end of it (${w.stage.active})`);
  }
  for (const id of ['cliff', 'sewer', 'crypt', 'vault']) assert.ok(seen.has(id), `${id} was active on the way`);
  assert.ok(!seen.has('gate') && !seen.has('ascent') && !seen.has('quad'), 'the gatehouse is never come near');
  assert.ok(w.stage.active.includes('vault') && pelvisY(me) > DN_Y.vault, 'he is in the vault, on his feet');
  assert.ok(w.time < 400, `the whole way takes ${w.time.toFixed(0)} s`);
});

test('sewer: the sea-gate lever lifts the heavy door, and the route from the sea-gate joins the main one in the cellar', () => {
  const lever = DUNNOTTAR_SEWER_ROUTE.find((leg) => leg.lever);
  assert.ok(lever);
  assert.equal(lever.lever, 'seagatelever');
  assert.deepEqual(lever.open, ['cryptgate']);
  const joined = DUNNOTTAR_SEWER_ROUTE.slice(-DUNNOTTAR_ROUTE.slice(5).length);
  assert.deepEqual(joined.map((leg) => leg.name), DUNNOTTAR_ROUTE.slice(5).map((leg) => leg.name));
});

test('sewer: a man knocked down on a floor below y 0 (the cave, the cistern, the drain) gets up again, as he does on the floors above it', () => {
  // (The share of a height that getting up asks for, physics/rising.js, was a share of a negative number below y 0: a higher mark, which no man reaches. The bot lay in the cistern for an hour.)
  for (const [name, x, y, z] of [['the gorge', -30, 0, 46], ['the crypt', 16, 1.4, -24.4], ['the cistern', -48.5, -5, 14], ['the long drain', -30, -1.6, -37.9]]) {
    const w = createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed: 3 });
    const me = w.fighters[0];
    placeOnFloor(me, x, z, y, 0);
    updateStage(w, true);
    const think = (current, dt) => {
      quiet(current);
      levelThink(current, dt);
    };
    advance(w, 1 / 60, think);
    Object.assign(me, { state: 'down', knockdowns: 1, downTimer: 0.5, motorScale: 0 });
    for (let step = 0; step < 60 * 14; step += 1) advance(w, 1 / 60, think);
    assert.equal(me.state, 'up', `${name}: on his feet again after fourteen seconds (lift ${me.lift})`);
  }
});
