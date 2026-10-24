// Stage 1, Dunnottar (levelmode/stages/dunnottar.js): the data is sound, every section is reached along the route by a
// scripted walker (through every portal), and the shortcuts and doors open and shut.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { placeOnFloor } from '../src/physics.js';
import { activeSections, checkStage, createStageWorld, mechanismsOf, pullLever, regionContains, setMechanism, stageTerrain, updateStage } from '../src/levelmode/stage.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { STAGES } from '../src/levelmode/stages.js';
import { DN_RAVINE, DN_Y, DUNNOTTAR, DUNNOTTAR_BRANCHES, DUNNOTTAR_ROUTE, DUNNOTTAR_SHORTCUTS } from '../src/levelmode/stages/dunnottar.js';
import { DN_CESSPOOL } from '../src/levelmode/stages/dunnottar-sewer.js';
import { floodFill } from './edges.js';
import { hipsAt, walk } from './walker.js';

const world = (seed = 7) => createStageWorld(DUNNOTTAR, levelPreset('forger'), { seed });
/** Nobody else about (the walker is the question, not the garrison). */
const quiet = (current) => current.fighters.slice(1).forEach((fighter) => { fighter.dormant = true; });
const pelvisY = (fighter) => fighter.x[P.pelvis * 3 + 1];

test('dunnottar: registered, sound, ten sections with the cast the spec calls for', () => {
  assert.equal(STAGES.dunnottar, DUNNOTTAR);
  assert.deepEqual(checkStage(DUNNOTTAR), []);
  assert.deepEqual(DUNNOTTAR.sections.map((section) => section.id), ['cliff', 'gate', 'ascent', 'quad', 'vault', 'crypt', 'sewer', 'tower', 'chapel', 'cell']);
  const spawns = DUNNOTTAR.sections.flatMap((section) => section.spawns);
  const enemies = spawns.filter((spawn) => (spawn.role === 'enemy' || spawn.role === 'boss') && !spawn.dead);
  assert.ok(enemies.length >= 12 && enemies.length <= 32, `${enemies.length} enemies`);
  // The main line's cast stood at 14 (the bot's careful policy reaches Vaelen 12 in 16 against it), 15 with the knight at the postern, 21 with the drawbridge's guard
  // (three archers on the barbican, three levies at the bridge's end and its forecourt: the front is meant to be very hard); the vault's optional branches add at most six, and the
  // old drain (the way round the gate) four: a sergeant and three levies.
  assert.ok(enemies.length >= 28 && enemies.length <= 32, `${enemies.length} enemies: 21 on the main line, 3 to 6 in the optional branches, 4 in the drain`);
  // The front's men are one alarm, and the archers keep their posts on the barbican (there is no way up to them).
  const front = enemies.filter((spawn) => spawn.alarm === 'front');
  assert.deepEqual(front.map((spawn) => spawn.id).sort(), ['archer1', 'archer2', 'archer3', 'bridgeguard1', 'bridgeguard2', 'bridgelevy', 'gateknight'].sort());
  assert.ok(front.filter((spawn) => spawn.preset === 'dunnottarArcher').every((spawn) => spawn.perch && spawn.post[1] > 6));
  assert.equal(spawns.filter((spawn) => spawn.role === 'prisoner').length, 2);
  assert.ok(spawns.some((spawn) => spawn.role === 'boss' && spawn.preset === 'vaelen'));
  assert.deepEqual(DUNNOTTAR.sections.filter((section) => section.rest).map((section) => section.rest.id), ['rest1', 'rest2', 'rest2b', 'restdrain', 'rest3']);
  assert.deepEqual(mechanismsOf(DUNNOTTAR).map((mechanism) => mechanism.id).sort(), ['cliffgate', 'celldoor', 'chapelgate', 'cryptgate', 'innerdoor', 'irongate', 'ladder1'].sort());
  const notes = DUNNOTTAR.sections.flatMap((section) => section.items).filter((item) => item.kind === 'note').map((item) => item.note).sort();
  assert.deepEqual(notes, ['bridge', 'cellar', 'drain', 'ledger', 'order', 'powder', 'seagate', 'servant', 'soldier', 'warden']);
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
  // (The crypt and the cell are off the main line: the branches' test and the ending's reach them; the sewer is the way round the gate: its own test.)
  for (const section of DUNNOTTAR.sections.filter((entry) => !['cell', 'crypt', 'sewer'].includes(entry.id))) assert.ok(seen.has(section.id), `${section.id} was active`);
  assert.ok(pelvisY(me) > DN_Y.ladderRoom, 'he is in the chapel, on his feet');
});

test('dunnottar: the shortcuts and doors block while shut and let a man through when open', () => {
  for (const shortcut of DUNNOTTAR_SHORTCUTS) {
    const open = shortcut.state ?? 'open';
    const attempt = (state, seed = 12) => {
      const w = world(seed);
      const me = w.fighters[0];
      placeOnFloor(me, shortcut.start[0], shortcut.start[2], shortcut.start[1], shortcut.facing);
      if (state) setMechanism(w, shortcut.mechanism, state);
      updateStage(w, true);
      // Nobody else about: the doors are the question, not the garrison.
      return walk(w, me, shortcut.points, { seconds: 40, think: quiet });
    };
    // (The ladder is 1.5 m wide: a walker's footing may slip it, so a few tries.)
    let through = attempt(open);
    for (const seed of [13, 14, 15]) if (through.reached < shortcut.points.length) through = attempt(open, seed);
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

// The places a man can step off into nothing: the cliffs (the gorge's south and west edges, the ravine's west bank beside the drawbridge, the sea
// breaches in the wall walk parapet), the court-side gap in the lower walk parapet, and the sides of the ladder. Nowhere else.
const CLIFFS = [
  (e) => e.floor < 0.5 && (e.at[1] >= 55 || e.at[0] <= -63),
  (e) => Math.abs(e.floor) < 0.5 && e.at[0] >= DN_RAVINE.x0 - 1 && e.at[0] <= DN_RAVINE.x0 + 0.5 && e.at[1] > 38 && e.at[1] < 56,
  (e) => e.at[1] <= -38 && e.floor > 17,
  (e) => e.at[0] >= 5 && e.at[0] <= 9 && e.at[1] > -34 && e.at[1] < -33 && e.floor > 17,
  (e) => e.at[0] >= 12.5 && e.at[0] <= 16.5 && e.at[1] > -34 && e.at[1] < -26 && e.floor > 12 && e.floor < 18,
  // The cesspool's pit (dunnottar-sewer.js): the side of a ramp is a step down into the sludge (0.75 m); the ramps are the way out of it.
  (e) => Math.hypot(e.at[0] - DN_CESSPOOL.at[0], e.at[1] - DN_CESSPOOL.at[2]) < DN_CESSPOOL.radius + 0.6 && Math.abs(e.floor - DN_CESSPOOL.rim) < 0.3,
];

test('dunnottar: a man can walk off the map only where there is a cliff (every state of the doors)', () => {
  for (const open of [false, true]) {
    const states = Object.fromEntries(mechanismsOf(DUNNOTTAR).map((mechanism) => [mechanism.id, open ? Object.keys(mechanism.states).find((state) => state !== mechanism.state) : mechanism.state]));
    const terrain = stageTerrain(DUNNOTTAR, DUNNOTTAR.sections.map((section) => section.id), states);
    const flood = floodFill(terrain, DUNNOTTAR.start.at);
    assert.ok(!flood.truncated);
    assert.ok(flood.standing > (open ? 22000 : 19500), `${flood.standing} places to stand`);
    const stray = flood.edges.filter((edge) => !CLIFFS.some((allowed) => allowed(edge)));
    assert.deepEqual(stray.map((edge) => `${edge.at.map((v) => v.toFixed(1))} at ${edge.floor.toFixed(2)}`), [], `open ${open}`);
  }
});

test('dunnottar: the vault branches can be walked: torture chamber, stores, the well shaft down to the crypt, the sea-gate, and back up behind the heavy door', () => {
  for (const branch of DUNNOTTAR_BRANCHES) {
    const w = world(11);
    const me = w.fighters[0];
    placeOnFloor(me, branch.start[0], branch.start[2], branch.start[1], branch.facing);
    for (const id of branch.open ?? []) setMechanism(w, id, 'open');
    updateStage(w, true);
    const seen = new Set(w.stage.active);
    const result = walk(w, me, branch.points, { seconds: 200, think: quiet, each: () => w.stage.active.forEach((id) => seen.add(id)) });
    assert.equal(result.reached, branch.points.length, `${branch.name}: stuck at ${JSON.stringify(branch.points[result.reached])} near ${result.stuckAt?.map((v) => v.toFixed(1))}`);
    assert.ok(w.stage.active.includes(branch.to), `${branch.name}: ${branch.to} is active at the end (${w.stage.active})`);
    for (const id of branch.seen ?? []) assert.ok(seen.has(id), `${branch.name}: ${id} woke along it`);
    assert.ok(pelvisY(me) > 0, `${branch.name}: on his feet`);
  }
});

test('dunnottar: the crypt sleeps until he is on the well shaft or at the stair from the sea-gate, and wakes its own men', () => {
  const w = world(5);
  const me = w.fighters[0];
  placeOnFloor(me, 20, -22.5, DN_Y.vault, 0);
  updateStage(w, true);
  assert.ok(!w.stage.active.includes('crypt'), `the cellar does not wake the crypt (${w.stage.active})`);
  const men = w.fighters.filter((fighter) => ['crypt1', 'cryptwarden', 'gatewarden'].includes(fighter.spawn?.id));
  assert.equal(men.length, 3);
  assert.ok(men.every((fighter) => fighter.dormant), 'its men are asleep');
  placeOnFloor(me, 27.2, -29.6, DN_Y.vault, 0);
  updateStage(w, true);
  assert.ok(w.stage.active.includes('crypt'), 'on the landing of the well shaft the crypt wakes');
  assert.ok(men.every((fighter) => !fighter.dormant), 'its men are awake');
  placeOnFloor(me, 16, -24.4, DN_Y.crypt, 0);
  updateStage(w, true);
  assert.ok(w.stage.active.includes('crypt'), `down in the gallery the crypt is the section (${w.stage.active})`);
});

test('dunnottar: the hidden lever at the sea-gate lifts the heavy door of the stair, and only then', () => {
  const w = world(6);
  const lever = DUNNOTTAR.sections.find((section) => section.id === 'crypt').levers[0];
  assert.equal(lever.target, 'cryptgate');
  assert.equal(w.stage.mechanisms.cryptgate, 'closed');
  assert.equal(pullLever(w, lever.id), true);
  assert.equal(w.stage.mechanisms.cryptgate, 'open');
});
