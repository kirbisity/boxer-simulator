// Stage 1, Dunnottar (levelmode/stages/dunnottar.js): the data is sound, every section is reached along the route by a
// scripted walker (through every portal), and the shortcuts and doors open and shut.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { placeOnFloor } from '../src/physics.js';
import { activeSections, checkStage, createStageWorld, mechanismsOf, regionContains, setMechanism, stageTerrain, updateStage } from '../src/levelmode/stage.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { STAGES } from '../src/levelmode/stages.js';
import { DN_Y, DUNNOTTAR, DUNNOTTAR_ROUTE, DUNNOTTAR_SHORTCUTS } from '../src/levelmode/stages/dunnottar.js';
import { floodFill } from './edges.js';
import { hipsAt, walk } from './walker.js';

const world = (seed = 7) => createStageWorld(DUNNOTTAR, levelPreset('forger'), { seed });
/** Nobody else about (the walker is the question, not the garrison). */
const quiet = (current) => current.fighters.slice(1).forEach((fighter) => { fighter.dormant = true; });
const pelvisY = (fighter) => fighter.x[P.pelvis * 3 + 1];

test('dunnottar: registered, sound, eight sections with the cast the spec calls for', () => {
  assert.equal(STAGES.dunnottar, DUNNOTTAR);
  assert.deepEqual(checkStage(DUNNOTTAR), []);
  assert.deepEqual(DUNNOTTAR.sections.map((section) => section.id), ['cliff', 'gate', 'ascent', 'quad', 'vault', 'tower', 'chapel', 'cell']);
  const spawns = DUNNOTTAR.sections.flatMap((section) => section.spawns);
  const enemies = spawns.filter((spawn) => (spawn.role === 'enemy' || spawn.role === 'boss') && !spawn.dead);
  assert.ok(enemies.length >= 20 && enemies.length <= 32, `${enemies.length} enemies`);
  assert.equal(spawns.filter((spawn) => spawn.role === 'prisoner').length, 2);
  assert.ok(spawns.some((spawn) => spawn.role === 'boss' && spawn.preset === 'vaelen'));
  assert.deepEqual(DUNNOTTAR.sections.filter((section) => section.rest).map((section) => section.rest.id), ['rest1', 'rest2', 'rest3']);
  assert.deepEqual(mechanismsOf(DUNNOTTAR).map((mechanism) => mechanism.id).sort(), ['cliffgate', 'celldoor', 'chapelgate', 'innerdoor', 'irongate', 'ladder1'].sort());
  const notes = DUNNOTTAR.sections.flatMap((section) => section.items).filter((item) => item.kind === 'note').map((item) => item.note).sort();
  assert.deepEqual(notes, ['ledger', 'order', 'powder', 'servant', 'soldier']);
  assert.ok(DUNNOTTAR.sections.some((section) => section.items.some((item) => item.kind === 'key')));
});

test('dunnottar: every spawn, item, lever and rest stands inside its own section, on a floor', () => {
  const w = world();
  const lost = [];
  for (const section of DUNNOTTAR.sections) {
    const inside = ([x, y, z]) => regionContains(section.bounds, x, z, y + 0.9);
    const ones = [...section.spawns.map((spawn) => [spawn.id, spawn.post]), ...section.items.map((item) => [item.id, item.at]), ...section.levers.map((lever) => [lever.id, lever.at]), ...(section.rest ? [[section.rest.id, section.rest.at]] : [])];
    for (const [id, at] of ones) if (!inside(at)) lost.push(`${id} ${JSON.stringify(at)} is outside ${section.id}`);
  }
  assert.deepEqual(lost, []);
  // The fighters of the stage were each set down on a floor (not dropped to the sea).
  for (const fighter of w.fighters) assert.ok(pelvisY(fighter) > DN_Y.sea + 1, `${fighter.spawn?.id ?? 'player'} at ${pelvisY(fighter)}`);
});

test('dunnottar: a walker goes the whole way, cliff path to chapel, through every portal', () => {
  const w = world();
  const me = w.fighters[0];
  const seen = new Set(w.stage.active);
  let last = 0;
  for (const leg of DUNNOTTAR_ROUTE) {
    for (const id of leg.open ?? []) setMechanism(w, id, 'open');
    const result = walk(w, me, leg.points, { seconds: 260, think: quiet, each: () => w.stage.active.forEach((id) => seen.add(id)) });
    assert.equal(result.reached, leg.points.length, `${leg.name}: stuck at waypoint ${result.reached} (${JSON.stringify(leg.points[result.reached])}) near ${result.stuckAt?.map((v) => v.toFixed(1))}`);
    assert.ok(w.stage.active.includes(leg.to), `${leg.name}: ${leg.to} is active at the end of it (${w.stage.active})`);
    last = w.time;
  }
  assert.ok(last > 300, `the route takes a while (${last.toFixed(0)} s)`);
  for (const section of DUNNOTTAR.sections.filter((entry) => entry.id !== 'cell')) assert.ok(seen.has(section.id), `${section.id} was active`);
  assert.ok(pelvisY(me) > DN_Y.ladderRoom, 'he is in the chapel, on his feet');
});

test('dunnottar: the shortcuts and doors block while shut and let a man through when open', () => {
  for (const shortcut of DUNNOTTAR_SHORTCUTS) {
    const open = shortcut.state ?? 'open';
    const attempt = (state) => {
      const w = world(11);
      const me = w.fighters[0];
      placeOnFloor(me, shortcut.start[0], shortcut.start[2], shortcut.start[1], shortcut.facing);
      if (state) setMechanism(w, shortcut.mechanism, state);
      updateStage(w, true);
      // Nobody else about: the doors are the question, not the garrison.
      return walk(w, me, shortcut.points, { seconds: 40, think: quiet });
    };
    const through = attempt(open);
    assert.equal(through.reached, shortcut.points.length, `${shortcut.name} open: stuck at ${JSON.stringify(shortcut.points[through.reached])} near ${through.stuckAt?.map((v) => v.toFixed(1))}`);
    if (shortcut.blockedWhenClosed) {
      const shut = attempt(null);
      assert.ok(shut.reached < shortcut.points.length, `${shortcut.name} shut: he walked through it`);
    }
  }
});

test('dunnottar: the sections that hold the player at each rest and shortcut are the ones that should', () => {
  // Rest 1, 2 and 3 are each in their own section's bounds, and the active set there includes it.
  for (const section of DUNNOTTAR.sections.filter((entry) => entry.rest)) {
    const [x, y, z] = section.rest.at;
    assert.ok(activeSections(DUNNOTTAR, [x, y + 0.9, z]).includes(section.id), section.rest.id);
  }
});

// The places a man can step off into nothing: the cliffs (the gorge's south and west edges, the sea breaches in the wall walk
// parapet), the court-side gap in the lower walk parapet, and the sides of the ladder. Nowhere else.
const CLIFFS = [
  (e) => e.floor < 0.5 && (e.at[1] >= 55 || e.at[0] <= -63),
  (e) => e.at[1] <= -38 && e.floor > 17,
  (e) => e.at[0] >= 5 && e.at[0] <= 9 && e.at[1] > -34 && e.at[1] < -33 && e.floor > 17,
  (e) => e.at[0] >= 12.5 && e.at[0] <= 16.5 && e.at[1] > -34 && e.at[1] < -26 && e.floor > 12 && e.floor < 18,
];

test('dunnottar: a man can walk off the map only where there is a cliff (every state of the doors)', () => {
  for (const open of [false, true]) {
    const states = Object.fromEntries(mechanismsOf(DUNNOTTAR).map((mechanism) => [mechanism.id, open ? Object.keys(mechanism.states).find((state) => state !== mechanism.state) : mechanism.state]));
    const terrain = stageTerrain(DUNNOTTAR, DUNNOTTAR.sections.map((section) => section.id), states);
    const flood = floodFill(terrain, DUNNOTTAR.start.at);
    assert.ok(!flood.truncated);
    assert.ok(flood.standing > (open ? 20000 : 19000), `${flood.standing} places to stand`);
    const stray = flood.edges.filter((edge) => !CLIFFS.some((allowed) => allowed(edge)));
    assert.deepEqual(stray.map((edge) => `${edge.at.map((v) => v.toFixed(1))} at ${edge.floor.toFixed(2)}`), [], `open ${open}`);
  }
});
