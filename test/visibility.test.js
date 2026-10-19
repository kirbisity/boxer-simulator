// What a stage paints (levelmode/visibility.js) and at what quality (levelmode/quality.js, adaptres.js): the decisions, with no drawing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES } from '../src/levelmode/stages.js';
import { createTerrain, rayBlocked, slabOf, wallOf } from '../src/physics/terrain.js';
import { chooseSections, fogReach, holdMan, holdSections, manDrawn, manSeen, nearestBoxDistance, pastReach, pastReachHeld, regionBoxes, sectionGraph, seeThroughIds, VISIBILITY } from '../src/levelmode/visibility.js';
import { pinnedRung, QUALITY_KEY, QUALITY_TIERS, readQuality, rungsFor, tierOf, TIER_NAMES, writeQuality } from '../src/levelmode/quality.js';
import { createAdaptiveResolution } from '../src/adaptres.js';

const DUNNOTTAR = STAGES.dunnottar;

// A stage of four rooms in a row: a - b - c - d, and a side room e off b.
const row = () => ({
  sea: -9,
  sections: [
    { id: 'a', bounds: [{ at: [0, 0], size: [10, 10] }], portals: [{ to: 'b', area: { at: [5, 0], size: [2, 4] } }] },
    { id: 'b', bounds: [{ at: [10, 0], size: [10, 10] }], portals: [{ to: 'c', area: { at: [15, 0], size: [2, 4] } }, { to: 'e', area: { at: [10, 5], size: [4, 2] } }] },
    { id: 'c', bounds: [{ at: [20, 0], size: [10, 10] }], portals: [{ to: 'd', area: { at: [25, 0], size: [2, 4] } }] },
    { id: 'd', bounds: [{ at: [30, 0], size: [10, 10] }], portals: [] },
    { id: 'e', bounds: [{ at: [10, 10], size: [10, 10] }], portals: [] },
  ],
});
const GRAPH = sectionGraph(row(), { margin: 0, openingMargin: 0 });
const states = (map) => Object.fromEntries(map);

test('a region is boxes: a rectangle, a turned one by its bounds, a polygon, a list; each with the margin', () => {
  const [one] = regionBoxes({ at: [10, 20], size: [4, 6] }, { margin: 1 });
  assert.deepEqual([one.x0, one.x1, one.z0, one.z1], [7, 13, 16, 24]);
  const [turned] = regionBoxes({ at: [0, 0], size: [4, 2], yaw: Math.PI / 2 });
  assert.ok(Math.abs(turned.x1 - 1) < 1e-9 && Math.abs(turned.z1 - 2) < 1e-9, 'a quarter turn swaps the sides');
  const [poly] = regionBoxes({ polygon: [[0, 0], [4, 1], [2, 5]] });
  assert.deepEqual([poly.x0, poly.x1, poly.z0, poly.z1], [0, 4, 0, 5]);
  assert.equal(regionBoxes([{ at: [0, 0], size: [1, 1] }, { at: [9, 9], size: [1, 1] }]).length, 2);
  assert.deepEqual(regionBoxes(null), []);
  const [low] = regionBoxes({ at: [0, 0], size: [1, 1] }, { low: -9 });
  assert.ok(low.y0 < -9 && low.y1 >= 80, 'floor to sky');
});

test('the portals of the stage make a graph that is followed either way', () => {
  assert.equal(GRAPH.links.length, 4);
  assert.deepEqual(GRAPH.near.b.map((l) => [l.a, l.b]), [['a', 'b'], ['b', 'c'], ['b', 'e']]);
  assert.equal(GRAPH.near.d.length, 1);
  const real = sectionGraph(DUNNOTTAR);
  assert.equal(real.ids.length, DUNNOTTAR.sections.length);
  for (const id of real.ids) assert.ok(real.bounds[id].length > 0, `${id} has bounds`);
  assert.ok(real.links.every((l) => l.boxes.length > 0), 'every portal has an area');
});

test('sections in sight through open portals are detail, up to the hops; the rest far or off', () => {
  const all = chooseSections(GRAPH, { active: new Set(['a']) });
  assert.deepEqual(states(all), { a: 'detail', b: 'detail', c: 'detail', d: 'detail', e: 'detail' }, 'three hops reach d; e is two');
  const short = chooseSections(GRAPH, { active: new Set(['a']), hops: 1 });
  assert.deepEqual(states(short), { a: 'detail', b: 'detail', c: 'far', d: 'far', e: 'far' });
  const shut = chooseSections(GRAPH, { active: new Set(['a']), open: (link) => link.b !== 'c' });
  assert.deepEqual(states(shut), { a: 'detail', b: 'detail', c: 'far', d: 'far', e: 'detail' }, 'a shut gate between b and c hides what is past it');
  const away = chooseSections(GRAPH, { active: new Set(['a']), inView: (boxes) => boxes[0].x0 < 12 });
  assert.equal(away.get('c'), 'off', 'c is outside the view');
  assert.equal(away.get('d'), 'off');
  assert.equal(away.get('b'), 'detail');
});

test('a link out of view does not lead on, and a section out of view is off even if active', () => {
  const noView = chooseSections(GRAPH, { active: new Set(['b']), inView: (boxes) => boxes.every((b) => b.x1 < 22 && b.x0 > -1) });
  assert.equal(noView.get('d'), 'off');
  const blind = chooseSections(GRAPH, { active: new Set(['b']), inView: () => false });
  assert.deepEqual([...blind.values()], ['off', 'off', 'off', 'off', 'off'], 'nothing in view, nothing painted');
  const far = chooseSections(GRAPH, { active: new Set(['a']), reach: (id) => id !== 'd' && id !== 'c' });
  assert.equal(far.get('c'), 'off', 'past the fog');
  assert.equal(far.get('d'), 'off');
});

test('several active sections (the man in a portal) are all detail', () => {
  const both = chooseSections(GRAPH, { active: new Set(['a', 'b']), hops: 0 });
  assert.deepEqual(states(both), { a: 'detail', b: 'detail', c: 'far', d: 'far', e: 'far' });
});

test('the real stage: from the quad the neighbours are detail and the headland a silhouette', () => {
  const graph = sectionGraph(DUNNOTTAR);
  const result = chooseSections(graph, { active: new Set(['quad']), hops: 1 });
  assert.equal(result.get('quad'), 'detail');
  for (const link of graph.near.quad) assert.equal(result.get(link.a === 'quad' ? link.b : link.a), 'detail');
  assert.equal(result.get('cell'), 'far', 'the cell is two doors from the quad');
});

test('a section that was in detail stays so for the hold, then settles', () => {
  const held = {};
  const detail = new Map([['a', 'detail']]);
  assert.equal(holdSections(held, detail, 0.016).get('a'), 'detail');
  const gone = new Map([['a', 'far']]);
  assert.equal(holdSections(held, gone, 0.2).get('a'), 'detail', '0.2 s into 0.5');
  assert.equal(holdSections(held, gone, 0.2).get('a'), 'detail');
  assert.equal(holdSections(held, gone, 0.2).get('a'), 'far', 'past the hold');
  assert.equal(holdSections(held, new Map([['a', 'off']]), 0.016).get('a'), 'off', 'from far to off is at once');
  assert.equal(holdSections(held, detail, 0.016).get('a'), 'detail', 'and back at once');
});

test('reach: past the fog, never within it, hysteresis at the line', () => {
  assert.equal(fogReach(175), 175 + VISIBILITY.fogMargin);
  assert.equal(fogReach(Infinity), Infinity);
  assert.ok(pastReach(100, 10, 50));
  assert.ok(!pastReach(100, 60, 50), 'its edge is within reach');
  assert.ok(pastReach(5, 0, 0), 'reach 0: never drawn');
  assert.ok(!pastReach(1e6, 0, Infinity));
  assert.equal(pastReachHeld(50.5, 0, 50, false), true);
  assert.equal(pastReachHeld(49.5, 0, 50, true), true, 'once past it stays past until 1.5 m inside');
  assert.equal(pastReachHeld(48, 0, 50, true), false);
  assert.equal(nearestBoxDistance([{ x0: 0, x1: 2, y0: 0, y1: 2, z0: 0, z1: 2 }, { x0: 10, x1: 12, y0: 0, y1: 2, z0: 0, z1: 2 }], 11, 1, 5), 3);
});

test('a gate of bars is seen through, a door is not, a wall is', () => {
  const ids = seeThroughIds(DUNNOTTAR);
  assert.ok(ids.has('irongate'), 'the portcullis of bars');
  assert.ok(!ids.has('cliffgate'), 'a door of planks');
  const terrain = createTerrain([slabOf([0, 0], [40, 10], 0), wallOf([5, 0], [0.4, 6], 0, 4, { id: 'wall' }), wallOf([-5, 0], [0.4, 6], 0, 4, { id: 'bars' })]);
  const see = new Set(['bars']);
  assert.ok(rayBlocked(terrain, [10, 0], [0, 0], 1.5, 1.5, see), 'the wall stops the eye');
  assert.ok(!rayBlocked(terrain, [-10, 0], [-1, 0], 1.5, 1.5, see), 'the bars do not');
  assert.ok(rayBlocked(terrain, [-10, 0], [-1, 0], 1.5, 1.5), 'though they stop a man');
});

test('a man behind a wall is not seen, one in the open is, one near is drawn anyway, and he lingers', () => {
  const terrain = createTerrain([slabOf([0, 0], [40, 10], 0), wallOf([5, 0], [0.4, 8], 0, 4, { id: 'wall' })]);
  const blocked = (a, b, ya, yb) => rayBlocked(terrain, a, b, ya, yb);
  assert.ok(!manSeen([12, 1.7, 0], [0, 0, 0], blocked), 'the wall between');
  assert.ok(manSeen([12, 1.7, 0], [8, 0, 0], blocked), 'this side of it');
  assert.ok(manSeen([12, 12, 0], [0, 0, 0], blocked), 'seen over it from high up');
  assert.equal(manDrawn({ safe: true, sectionState: 'off', seen: false }), true);
  assert.equal(manDrawn({ near: true, sectionState: 'far', seen: false }), true);
  assert.equal(manDrawn({ sectionState: 'far', seen: true }), false, 'in a section painted as a silhouette');
  assert.equal(manDrawn({ sectionState: 'detail', seen: false }), false);
  assert.equal(manDrawn({ sectionState: 'detail', seen: true }), true);
  const held = {};
  assert.equal(holdMan(held, 7, true, 0.016), true);
  assert.equal(holdMan(held, 7, false, 0.2), true, 'a moment after he was last seen');
  assert.equal(holdMan(held, 7, false, 0.2), false);
});

test('the tiers get cheaper, never dearer, from high to low', () => {
  const keys = Object.keys(QUALITY_TIERS.high);
  for (const key of keys) {
    for (let k = 1; k < TIER_NAMES.length; k += 1) {
      assert.ok(QUALITY_TIERS[TIER_NAMES[k]][key] <= QUALITY_TIERS[TIER_NAMES[k - 1]][key], `${key}: ${TIER_NAMES[k]} is not dearer than ${TIER_NAMES[k - 1]}`);
    }
  }
  assert.equal(tierOf('nonsense'), QUALITY_TIERS.high);
  assert.equal(QUALITY_TIERS.low.decals, 0, 'low has no decals');
  assert.equal(QUALITY_TIERS.low.taps, 1);
});

test('the remembered quality: a known mode, anything else is auto, a broken storage is auto', () => {
  const kept = {};
  const storage = { getItem: (k) => kept[k] ?? null, setItem: (k, v) => { kept[k] = v; } };
  assert.equal(readQuality(storage), 'auto');
  writeQuality(storage, 'low');
  assert.equal(kept[QUALITY_KEY], 'low');
  assert.equal(readQuality(storage), 'low');
  kept[QUALITY_KEY] = 'ultra';
  assert.equal(readQuality(storage), 'auto');
  const broken = { getItem: () => { throw new Error('private window'); }, setItem: () => { throw new Error('private window'); } };
  assert.equal(readQuality(broken), 'auto');
  assert.doesNotThrow(() => writeQuality(broken, 'high'));
  assert.equal(readQuality(null), 'auto');
  assert.equal(pinnedRung('high', 5), 0);
  assert.equal(pinnedRung('low', 5), 4);
});

// ---- the ladder, driven by frame times -------------------------------------------------------------

/** A view with a renderer that remembers its pixel ratio. */
function fakeView(ratio = 2) {
  globalThis.THREE ??= { Vector2: class { constructor() { this.x = 0; this.y = 0; } } };
  const renderer = { ratio, getPixelRatio: () => renderer.ratio, setPixelRatio: (r) => { renderer.ratio = r; }, getSize: (v) => v };
  return { renderer };
}

/** Run frames of `ms` for `seconds`; the page's own work 8 ms. */
function run(controller, view, seconds, ms, options = { tiered: true }) {
  for (let t = 0; t < seconds; t += ms / 1000) {
    controller.frame(view, ms, 30, options);
    controller.worked(8);
  }
}

test('in a stage the rungs walk pixels then tiers down as frames stay slow, and back up when they ease', () => {
  const view = fakeView(2);
  const controller = createAdaptiveResolution();
  const tiers = [];
  controller.onTier = (tier) => tiers.push(tier);
  run(controller, view, 1, 16.6);
  assert.equal(view.renderer.ratio, 2);
  assert.equal(controller.tier, 'high');
  run(controller, view, 12, 45);
  assert.equal(view.renderer.ratio, 1, 'the floor');
  assert.equal(controller.tier, 'low');
  assert.deepEqual(tiers, ['medium', 'low'], 'high to medium to low, each once');
  run(controller, view, 40, 16.6);
  assert.ok(view.renderer.ratio > 1, 'back up a step or more');
  assert.notEqual(controller.tier, 'low');
});

test('a machine that is far behind has stepped down within the first seconds', () => {
  const view = fakeView(2);
  const controller = createAdaptiveResolution();
  run(controller, view, 2.5, 55);
  assert.ok(view.renderer.ratio <= 1.5, `ratio ${view.renderer.ratio} after 2.5 s of 55 ms frames`);
});

test('pinned: high holds the full picture, low the cheapest, whatever the frame times; unpinned is auto again', () => {
  const view = fakeView(2);
  const controller = createAdaptiveResolution();
  run(controller, view, 0.2, 16.6);
  controller.pin(Infinity, view);
  run(controller, view, 1, 16.6);
  assert.equal(view.renderer.ratio, 1);
  assert.equal(controller.tier, 'low');
  controller.pin(0, view);
  run(controller, view, 5, 60);
  assert.equal(view.renderer.ratio, 2, 'held at full however slow');
  assert.equal(controller.tier, 'high');
  controller.pin(null, view);
  run(controller, view, 8, 60);
  assert.ok(view.renderer.ratio < 2, 'auto steps down again');
});

test('outside a stage the rungs are pixels alone, and the tier is high', () => {
  const view = fakeView(2);
  const controller = createAdaptiveResolution();
  run(controller, view, 12, 45, { tiered: false });
  assert.equal(view.renderer.ratio, 1);
  assert.equal(controller.tier, 'high');
});

test('a 1x screen has no pixels to give, so the tiers carry it', () => {
  const view = fakeView(1);
  const controller = createAdaptiveResolution();
  run(controller, view, 12, 45);
  assert.equal(view.renderer.ratio, 1);
  assert.equal(controller.tier, 'low');
  assert.equal(rungsFor(1).length, 3);
});

test('a section that is active only (the crypt) is painted in detail only while it is active, never through a portal', () => {
  const stage = row();
  stage.sections[2].activeOnly = true;
  const graph = sectionGraph(stage, { margin: 0, openingMargin: 0 });
  assert.ok(graph.activeOnly.has('c'));
  const seen = chooseSections(graph, { active: new Set(['b']) });
  assert.equal(seen.get('c'), 'far', 'next to the man, but only a silhouette');
  assert.equal(seen.get('d'), 'far', 'and nothing is reached through it');
  assert.equal(seen.get('a'), 'detail');
  const inside = chooseSections(graph, { active: new Set(['c']) });
  assert.equal(inside.get('c'), 'detail');
  assert.equal(inside.get('d'), 'detail', 'from inside it the way on is followed');
  const real = sectionGraph(STAGES.dunnottar);
  assert.ok(real.activeOnly.has('crypt'));
  assert.notEqual(chooseSections(real, { active: new Set(['vault']) }).get('crypt'), 'detail');
});
