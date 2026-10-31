// Stage 1, Dunnottar, round 3: the dark under the roofs, the water that rings where a man wades, and the old drain's cesspool with the one man in it, Noname.
// The sewer holds nobody but him; the cesspool lies where its constants say (under the inner cell, in the sewer's bounds, its pit on the floor the physics
// has); he is the preset the plot twist wants (Astacius's kit and helmet, a long sword, the prince's face) and loses his helmet as he dies, staying dead
// after a rest; the water's pure parts (where it is, the rings, what a wading man makes) and the wading's hold; every interior is dark and has a light.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { fearTarget, hurtShare, thinkAll } from '../src/ai.js';
import { advance, knockOut, placeOnFloor } from '../src/physics.js';
import { floorAt, rayBlocked } from '../src/physics/terrain.js';
import { outfitOf } from '../src/outfits.js';
import { interiorAt, regionContains, sectionById, updateStage } from '../src/levelmode/stage.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { bossStatus, createLevelWorld, levelThink, restAtPoint, wadeGear } from '../src/levelmode/level.js';
import { LEVEL_CONFIG } from '../src/levelmode/config.js';
import { QUALITY_TIERS } from '../src/levelmode/quality.js';
import { approachLevels, interiorLevels, levelsSettled, STAGE_LOOKS } from '../src/levelmode/stagelooks.js';
import { addRipple, ageRipples, newRipples, rippleRing, stageWaters, WATER, wadeDrag, waterAt, waterContains, waterSources } from '../src/levelmode/water.js';
import { DUNNOTTAR } from '../src/levelmode/stages/dunnottar.js';
import { DN_CESSPOOL, DN_CESSPOOL_REGION, DN_NONAME_POST, DN_NONAME_SPAWN } from '../src/levelmode/stages/dunnottar-sewer.js';
import { mindState } from '../src/levelmode/awareness.js';
import { DN_DARK_FLOOR, DN_DARK_MOST, DN_INTERIOR } from '../src/levelmode/stages/dunnottar-light.js';

const sewer = sectionById(DUNNOTTAR, 'sewer');
const P0 = DN_CESSPOOL;

/** A run with the player stood in the cesspool hall's west door (the sewer awake). */
function inCesspool(seed = 4) {
  const w = createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed });
  placeOnFloor(w.fighters[0], P0.at[0] - P0.hall + 0.4, P0.at[2], P0.rim, 0);
  updateStage(w, true);
  return w;
}
const noname = (w) => w.fighters.find((fighter) => fighter.spawn?.id === DN_NONAME_SPAWN);

// ---- the sewer's cast ----------------------------------------------------------------------------------------

test('cesspool: the sewer holds one man, Noname, an enemy of tier 3 buried in a heap on the island in the middle of the pit; the levies, the sergeant and everybody else are gone', () => {
  assert.equal(sewer.spawns.length, 1);
  const [spawn] = sewer.spawns;
  assert.equal(spawn.id, 'noname');
  assert.equal(DN_NONAME_SPAWN, 'noname');
  assert.equal(spawn.preset, 'noname');
  assert.equal(spawn.role, 'enemy');
  assert.equal(spawn.tier, 3);
  assert.equal(spawn.inputs.name, 'Noname');
  assert.ok(spawn.miniboss, 'a miniboss (he stays dead after a rest)');
  for (const gone of ['drain1', 'drain2', 'drainward', 'drain3']) assert.ok(!DUNNOTTAR.sections.some((section) => section.spawns.some((entry) => entry.id === gone)), `${gone} is gone`);
  // He lies buried in the middle, on the island (a hand under the sludge: a man who dies on it has his face out of it), where the way over the pit goes; he waited in the alcove
  // and came out of it from the left once (the user's call: he starts in the middle, hidden, and rises).
  assert.deepEqual(spawn.post, DN_NONAME_POST);
  assert.ok(Math.abs(spawn.post[0] - P0.island.at[0]) < 0.01 && Math.abs(spawn.post[2] - P0.island.at[1]) < 0.01 && spawn.post[1] === P0.island.top, 'on the island');
  assert.ok(spawn.lurk && !spawn.ambush, 'buried (`lurk`), not lying in wait in an alcove');
  assert.ok(P0.island.top < P0.at[1] && P0.island.top + 0.2 > P0.at[1], 'the island just under the surface');
  assert.ok(P0.island.top - P0.floor <= 0.45, 'a step up from the bed');
});

// ---- the cesspool's constants -----------------------------------------------------------------------------------

test('cesspool: its constants lie in the sewer, on the floor the physics has (the bed in the pit, the rim walk round it), under the inner cell', () => {
  const [x, surface, z] = P0.at;
  assert.ok(regionContains(sewer.bounds, x, z, P0.floor + 1), 'the centre is in the sewer');
  assert.ok(regionContains(sewer.bounds, x + P0.hall - 0.5, z, P0.rim + 1), 'and the hall\'s edge');
  assert.ok(P0.floor < surface && surface < P0.rim, 'the sludge lies over the bed and under the rim');
  assert.ok(Math.abs(surface - P0.floor - P0.depth) < 1e-9);
  assert.ok(P0.radius * 2 >= 12 && P0.radius * 2 <= 16, 'an arena 12-16 m across');
  const w = inCesspool();
  const terrain = w.arena.terrain;
  assert.equal(floorAt(terrain, x - 3.5, z + 2, P0.rim + 1), P0.floor, 'the bed in the pit');
  assert.equal(floorAt(terrain, P0.island.at[0], P0.island.at[1], P0.rim + 1), P0.island.top, 'the island');
  for (const angle of [0.4, 1.2, 2.0, 2.8, 3.6, 4.4, 5.2, 6.0]) {
    const r = (P0.radius + P0.hall) / 2;
    assert.ok(Math.abs(floorAt(terrain, x + Math.cos(angle) * r, z + Math.sin(angle) * r, P0.rim + 1) - P0.rim) < 0.02, `the rim at ${angle}`);
  }
  // The stage names the arena; the plot twist's drop lands in it from the inner cell above.
  assert.deepEqual(DUNNOTTAR.regions.cesspool, DN_CESSPOOL_REGION);
  assert.ok(regionContains(DUNNOTTAR.regions.cesspool, x, z, P0.floor + 0.5));
  const cell = sectionById(DUNNOTTAR, 'cell');
  const [c] = cell.bounds;
  assert.ok(Math.abs(c.at[0] - x) < P0.radius && Math.abs(c.at[1] - z) < P0.radius, 'the inner cell stands over the pit');
  // The privy's hole in it is over the pit too, and the grating in the vault is under the hole (the chute between them: levelmode/ending.js).
  const [hx, , hz] = DUNNOTTAR.ending.hole.at;
  assert.ok(Math.hypot(hx - x, hz - z) < P0.radius - 0.8, 'the chute falls into the sludge, not onto the rim');
  const grating = sectionById(DUNNOTTAR, 'sewer').decor.find((decor) => decor.what === 'grating' && Math.hypot(decor.at[0] - x, decor.at[2] - z) < P0.hall);
  assert.ok(grating && Math.hypot(grating.at[0] - hx, grating.at[2] - hz) < 0.2, 'the grating is under the hole');
  // Its water is the sludge, over the whole pit.
  const pool = stageWaters(DUNNOTTAR).find((water) => water.id === 'cesspool');
  assert.equal(pool.murk, 'sludge');
  assert.equal(pool.at[1], surface);
  assert.ok(waterContains(pool, x + P0.radius - 0.2, z) && waterContains(pool, x, z - P0.radius + 0.2));
});

// ---- Noname -------------------------------------------------------------------------------------------------------

test('cesspool: Noname is Astacius\'s kit and smooth helmet with a long sword and no shield, a young fit man with the prince\'s face, who fears nothing', () => {
  const inputs = levelPreset('noname');
  assert.equal(inputs.name, 'Noname');
  assert.equal(inputs.style, 'longsword');
  assert.equal(inputs.outfit.kind, 'scissor');
  const head = outfitOf(inputs).look.head;
  assert.deepEqual([head.kind, head.style], ['arenaHelm', 'scissor']);
  assert.ok(inputs.skill >= 0.65 && inputs.skill <= 0.9);
  assert.equal(inputs.age, 24);
  assert.equal(inputs.look.hairStyle, 'long');
  assert.equal(inputs.look.facialHair, 'none');
  assert.ok(['porcelain', 'light'].includes(inputs.look.skinTone), 'pale');
  assert.ok(inputs.helmetOffOnDeath);
  const w = inCesspool();
  const man = noname(w);
  assert.equal(man.weapon?.kind, 'longsword');
  assert.ok(!man.shield, 'no shield');
  assert.equal(man.body.gear.courage, 1, 'he never breaks: fearless');
  const me = w.fighters[0];
  assert.equal(fearTarget(w, man, -1, me), 0, 'outmatched and hurt, still no fear');
});

test('cesspool: as Noname dies his helmet comes off (his face bare) and lies by his head on the sludge; once; and he stays dead after a rest', () => {
  const w = inCesspool();
  const man = noname(w);
  levelThink(w, 1 / 60);
  assert.ok(!w.stage.level.dropped?.length, 'nothing dropped while he lives');
  knockOut(w, man, { time: w.time, effects: [] }, 'dies', 'killed');
  levelThink(w, 1 / 60);
  assert.equal(man.body.inputs.outfit.bareHead, true);
  assert.equal(outfitOf(man.body.inputs).look.head, null, 'his face shows');
  const [helmet] = w.stage.level.dropped;
  assert.equal(helmet.id, 'helmet:noname');
  assert.equal(helmet.owner, 'noname');
  assert.deepEqual([helmet.head.kind, helmet.head.style], ['arenaHelm', 'scissor']);
  const head = [man.x[P.head * 3], man.x[P.head * 3 + 2]];
  assert.ok(Math.hypot(helmet.at[0] - head[0], helmet.at[2] - head[1]) < 1, 'by his head');
  assert.ok(helmet.at[1] >= P0.at[1] - 0.07 && helmet.at[1] < P0.at[1] + 0.3, 'on the sludge, not sunk out of sight');
  assert.ok(w.events.some((event) => event.kind === 'helmetOff' && event.fighter === man.id));
  levelThink(w, 1 / 60);
  assert.equal(w.stage.level.dropped.length, 1, 'once');
  // A rest brings the drain's dead back: not him.
  restAtPoint(w, sewer.rest);
  assert.equal(man.state, 'out', 'the miniboss stays down');
  assert.equal(w.stage.level.dropped.length, 1, 'his helmet lies where it fell');
  assert.ok(hurtShare(man) >= 0);
});

test('cesspool: Noname has the boss\'s bar (his name, "The Cesspool", his health) once he is awake and aware of the player, and it holds empty for a moment when he falls', () => {
  const w = inCesspool(9);
  const man = noname(w);
  const bar = () => bossStatus(w);
  // Not awake: no bar.
  man.dormant = true;
  assert.equal(bar().show, false, 'nothing to show for a man who is not awake');
  man.dormant = false;
  // The player at the west door: Noname is out of sight in his alcove and does not know of him: no bar.
  const look = (current, dt) => {
    updateStage(current);
    levelThink(current, dt);
  };
  advance(w, 1, look);
  assert.equal(bar().show, false, 'not yet: he is hidden');
  // Over the pit's edge and on toward the heap, within a few metres of it: he rises, he fights, the bar is up from the moment he begins to rise.
  placeOnFloor(w.fighters[0], P0.island.at[0] - 3, P0.at[2], P0.floor, 0);
  advance(w, 0.4, look);
  assert.equal(mindState(w, man.id), 'rise');
  assert.equal(bar().show, true, 'rising at the player: the bar (and the boss music) from now');
  advance(w, 3, look);
  assert.equal(bar().show, true, 'aware of the player');
  assert.equal(bar().name, 'Noname');
  assert.equal(bar().title, 'The Cesspool');
  assert.equal(bar().felled, false);
  assert.ok(bar().fraction > 0.99 && bar().fraction <= 1, 'whole');
  // Out of range (the player far down the drain): no bar though he is aware.
  const me = w.fighters[0];
  placeOnFloor(me, P0.at[0] - P0.hall - 25, P0.at[2], P0.rim, 0);
  assert.equal(bar().show, false, `${LEVEL_CONFIG.boss.barRange} m is the bar's reach`);
  placeOnFloor(me, P0.island.at[0] - 3, P0.at[2], P0.floor, 0);
  assert.equal(bar().show, true);
  // He falls: the bar is empty and struck through for the felled seconds, then gone. He is not the stage's boss (no phase two, no cutscene).
  knockOut(w, man, { time: w.time, effects: [] }, 'dies', 'killed');
  levelThink(w, 1 / 60);
  assert.equal(bar().show, true);
  assert.equal(bar().felled, true);
  assert.equal(bar().fraction, 0);
  advance(w, LEVEL_CONFIG.boss.felledSeconds + 0.5, (current, dt) => levelThink(current, dt));
  assert.equal(bar().show, false, 'gone after the seconds it holds');
  assert.equal(w.stage.level.boss.id !== man.id, true, 'the stage boss is Vaelen, not him');
});

test('cesspool: the reveal: buried in the heap Noname is nowhere to be seen or fought; near it he rises at the player, his bar up, a line said once', () => {
  const w = inCesspool(5);
  const man = noname(w);
  const me = w.fighters[0];
  const step = (seconds) => advance(w, seconds, (current, dt) => {
    updateStage(current);
    levelThink(current, dt);
    thinkAll(current, dt, new Set([0]));
  });
  step(2);
  assert.equal(bossStatus(w).show, false, 'at the door: no bar');
  assert.ok(!w.stage.level.ui.some((message) => message.type === 'toast' && message.text === sewer.spawns[0].reveal));
  // Over the pit's edge (the arena, stage.regions.cesspool): still buried, he does not stir.
  placeOnFloor(me, DN_CESSPOOL_REGION.at[0] - DN_CESSPOOL_REGION.size[0] / 2 + 1, P0.at[2], P0.rim, 0);
  step(1);
  assert.equal(mindState(w, man.id), 'lurk', 'the heap lies still');
  assert.equal(bossStatus(w).show, false);
  // On to within a few metres of the heap: he rises.
  placeOnFloor(me, P0.island.at[0] - 3.2, P0.at[2], P0.floor, 0);
  step(0.5);
  assert.equal(bossStatus(w).show, true, 'his bar is up (and with it the boss music, main.js audioScene)');
  assert.equal(w.stage.level.ui.filter((message) => message.type === 'toast' && message.text === sewer.spawns[0].reveal).length, 1, 'the line, once');
  step(3);
  assert.ok(['aggro', 'search'].includes(mindState(w, man.id)), 'risen, he fights');
  step(2);
  assert.equal(w.stage.level.ui.filter((message) => message.type === 'toast' && message.text === sewer.spawns[0].reveal).length, 1, 'once');
});

test('cesspool: Noname never leaves his hall: the player who backs out into the drain is not followed past its door', () => {
  const w = inCesspool(6);
  const man = noname(w);
  const me = w.fighters[0];
  placeOnFloor(me, P0.island.at[0] - 3.2, P0.at[2], P0.floor, 0);
  const step = (seconds) => advance(w, seconds, (current, dt) => {
    updateStage(current);
    levelThink(current, dt);
    thinkAll(current, dt, new Set([0]));
  });
  step(3.5);
  // (The sluices came down as he rose; put out in the drain, as a death or a rest would put him, the player has them open again: stage.js keepSeals.)
  // Out into the drain, 6 m past the door, and he stands there.
  placeOnFloor(me, P0.at[0] - P0.hall - 6, P0.at[2], P0.rim, 0);
  let west = Infinity;
  for (let k = 0; k < 20; k += 1) {
    me.goTo = null;
    me.move = 0;
    step(0.5);
    west = Math.min(west, man.x[P.pelvis * 3]);
  }
  const pen = sewer.spawns[0].pen;
  assert.notEqual(mindState(w, man.id), 'lurk', 'he had risen at the player');
  assert.ok(west > pen.at[0] - pen.size[0] / 2 - 0.5, `the farthest west he went: ${west.toFixed(2)} (the hall's wall at ${(P0.at[0] - P0.hall).toFixed(2)})`);
});

test('cesspool: Noname is a little harder than he was (body and drill, never a multiplier): more muscle for the same mass and a better-taught sword', () => {
  const inputs = levelPreset('noname');
  assert.ok(inputs.exercise >= 0.85 && inputs.skill >= 0.9);
  assert.ok(!('damage' in inputs) && !('health' in inputs) && !('multiplier' in inputs), 'no hidden multiplier');
  const body = noname(inCesspool()).body;
  assert.ok(body.muscleKg >= 37, `${body.muscleKg.toFixed(1)} kg of muscle`);
  assert.ok(body.bodyMassKg > 78 && body.bodyMassKg < 82, `${body.bodyMassKg.toFixed(1)} kg: still a fit 80-kg gladiator`);
});

// ---- the water ---------------------------------------------------------------------------------------------------

test('water: the bodies of water are the crypt\'s flood, the cistern and the cesspool; where a point is in one, by its shape and its depth', () => {
  const waters = stageWaters(DUNNOTTAR);
  assert.deepEqual(waters.map((water) => water.id).sort(), ['cesspool', 'cistern', 'cryptflood', 'cryptway']);
  for (const water of waters) assert.ok(water.bed < water.at[1], `${water.id}: a bed under it`);
  const rect = { id: 'r', shape: 'rect', at: [0, 1, 0], size: [4, 2], bed: 0.5 };
  const oval = { id: 'o', shape: 'ellipse', at: [10, 1, 0], size: [4, 2], bed: 0.5 };
  assert.ok(waterContains(rect, 1.9, 0.9) && !waterContains(rect, 2.1, 0));
  assert.ok(waterContains(oval, 11.9, 0) && !waterContains(oval, 11.9, 0.9), 'an ellipse is not its box');
  assert.equal(waterAt([rect, oval], 1, 0.8, 0), rect);
  assert.equal(waterAt([rect, oval], 1, 1.5, 0), null, 'above the surface');
  assert.equal(waterAt([rect, oval], 1, -0.2, 0), null, 'under the bed');
});

test('water: a pool of ripples keeps the newest, spreads each ring and lets it die', () => {
  const pool = newRipples(3);
  for (let k = 0; k < 5; k += 1) addRipple(pool, { x: k, z: 0, born: k, amp: 1 });
  assert.deepEqual(pool.list.map((ripple) => ripple.x), [2, 3, 4]);
  const ring = rippleRing({ x: 0, z: 0, born: 0, amp: 1 }, 1);
  const later = rippleRing({ x: 0, z: 0, born: 0, amp: 1 }, 2);
  assert.ok(Math.abs(ring.radius - WATER.speed) < 1e-9 && later.radius > ring.radius);
  assert.ok(later.strength < ring.strength && ring.strength < 1);
  assert.equal(rippleRing({ x: 0, z: 0, born: 0, amp: 1 }, WATER.life + 0.1), null);
  ageRipples(pool, 4 + WATER.life + 0.01);
  assert.equal(pool.list.length, 0);
});

test('water: a man wading rings the water at his moving feet and leaves a wake; a man standing still does not; a body dropped into it splashes big', () => {
  const water = { id: 'w', shape: 'rect', at: [0, 0, 0], size: [20, 20], bed: -0.6 };
  const feet = (x, lift = 0) => [[x - 0.1, -0.55 + lift, 0.1], [x + 0.1, -0.55, -0.1]];
  // Standing still: nothing.
  const still = new Map();
  let made = { ripples: [], splashes: [] };
  for (let k = 0; k < 30; k += 1) made = waterSources([water], [{ id: 1, feet: feet(0), hips: [0, 0.35, 0] }], still, k / 30);
  assert.equal(made.ripples.length, 0);
  // Walking at 1.4 m/s: rings at the feet and a wake behind the hips, not every frame.
  const walking = new Map();
  const rings = [];
  for (let k = 0; k < 60; k += 1) {
    const x = (k / 30) * 1.4;
    const step = waterSources([water], [{ id: 1, feet: [[x - 0.1 + 0.2 * Math.sin(k), -0.55, 0.1], [x + 0.1 - 0.2 * Math.sin(k), -0.55, -0.1]], hips: [x, 0.35, 0] }], walking, k / 30);
    rings.push(...step.ripples);
  }
  assert.ok(rings.length >= 6 && rings.length <= 30, `${rings.length} rings in 2 s`);
  assert.ok(rings.some((ripple) => ripple.x < 2.8 - 0.3), 'a wake behind him');
  assert.ok(rings.every((ripple) => ripple.water === 'w'));
  // Dropped in from above at 6 m/s: a big ring and a burst of drops.
  const falling = new Map();
  waterSources([water], [{ id: 2, feet: [[0, 1.5, 0], [0, 1.5, 0]], hips: [0, 2.4, 0] }], falling, 0);
  const splash = waterSources([water], [{ id: 2, feet: [[0, -0.5, 0], [0, -0.5, 0]], hips: [0, 1.0, 0] }], falling, 0.2);
  assert.equal(splash.ripples.length, 1);
  assert.ok(splash.ripples[0].amp > 1);
  assert.ok(splash.splashes[0].count >= WATER.bigDrops);
});

test('water: the cesspool\'s sludge holds a man\'s legs by its depth over his feet while he is in it and lets them go after; the island and the rim do not', () => {
  const w = inCesspool();
  const me = w.fighters[0];
  const foot = me.body.gear.foot;
  const accel = me.body.gear.accel;
  placeOnFloor(me, P0.at[0] - 2, P0.at[2] + 2, P0.floor, 0);
  wadeGear(w);
  // (The sludge is 0.49 m deep over the bed, the cesspool's viscosity 2: the knee's 0.75 and a further 2^-0.75, the share the table and the thickness give him.)
  const drag = wadeDrag(stageWaters(DUNNOTTAR).find((water) => water.id === 'cesspool'), P0.depth, me.body.heightM);
  assert.ok(drag.foot < 0.5 && drag.foot > 0.35, `a man in the pit goes at ${drag.foot.toFixed(2)} of a walk (it was 0.62 before the graded hold)`);
  assert.ok(Math.abs(me.body.gear.foot - foot * drag.foot) < 1e-3, 'held');
  assert.ok(Math.abs(me.body.gear.accel - accel * drag.accel) < 1e-3);
  wadeGear(w);
  assert.ok(Math.abs(me.body.gear.foot - foot * drag.foot) < 1e-3, 'not held twice over');
  placeOnFloor(me, P0.at[0] - P0.hall + 0.4, P0.at[2], P0.rim, 0);
  wadeGear(w);
  assert.equal(me.body.gear.foot, foot, 'let go on the rim');
  assert.equal(me.body.gear.accel, accel);
  assert.ok(!me.wading);
  // The crypt's flood is 0.28 m, plain water: a shin, 0.9 and not more.
  const crypt = stageWaters(DUNNOTTAR).filter((water) => water.id.startsWith('crypt'));
  for (const water of crypt) assert.ok(wadeDrag(water, water.at[1] - water.bed, 1.75).foot > 0.9);
  // Noname on his island, a hand under the sludge: not held (the island is 0.07 m under the surface: ankle-deep, nothing).
  assert.ok(!noname(w).wading, 'the island holds no one');
});

// ---- the light ---------------------------------------------------------------------------------------------------

test('light: every room under a roof is dark (a low floor of the sky\'s light, the sun shut out) and has a flame or a lantern of its own', () => {
  const sources = new Set(['torch', 'brazier', 'lantern', 'hearth', 'fungus']);
  const lit = (decor) => (decor.kind === 'prop' && sources.has(decor.what) && decor.light !== false) || decor.kind === 'chandelier' || decor.kind === 'votive';
  for (const room of DUNNOTTAR.interiors) {
    const spec = room.spec;
    const share = spec.probe ?? spec.ambient;
    assert.ok(share <= DN_DARK_MOST && share >= DN_DARK_FLOOR, `${room.id}: the sky's light ${share}`);
    assert.ok((spec.ambient ?? 0.4) <= DN_DARK_MOST, `${room.id}: hemisphere`);
    assert.ok((spec.sun ?? 0.05) <= 0.06, `${room.id}: the sun`);
    assert.ok(spec.torch >= 0.8, `${room.id}: the flames burn`);
    const flames = DUNNOTTAR.sections.flatMap((section) => section.decor).filter((decor) => lit(decor) && regionContains(room.area, decor.at[0], decor.at[2], decor.at[1] + 0.5));
    assert.ok(flames.length >= 1, `${room.id}: a light of its own`);
  }
  // The sections the user named are all covered somewhere: a point in each is in an interior.
  for (const [name, x, y, z] of [['gate hall', 0, 0.5, 46], ['gallery', 26, 5, 46], ['ascent', 17, 9, 20], ['vault', 20, 7, -22.5], ['torture', 6, 7, -31], ['stores', 15, 7, -12], ['crypt', 16, 2.4, -24.4], ['keep', 51, 13, -24], ['tower stair', 61, 14, -23.8], ['chapel', -18, 18, -36], ['cell', -40, 18, -36], ['grotto', -48.5, -4, 50], ['drain', -48.5, -4, 30], ['cesspool', P0.at[0], P0.rim + 1, P0.at[2]]]) {
    assert.ok(interiorAt(DUNNOTTAR, x, y, z), `${name} is an interior`);
  }
  for (const [name, x, y, z] of [['the cliff path', -90, 9, -4], ['the gorge', -30, 1, 46], ['the court', 20, 13.2, -10], ['the wall walk', 30, 25.9, -36]]) assert.equal(interiorAt(DUNNOTTAR, x, y, z), null, `${name} is under the sky`);
  assert.equal(interiorAt(DUNNOTTAR, P0.at[0], P0.rim + 1, P0.at[2]), DN_INTERIOR.cesspool);
});

test('light: from one dark room into another the light is eased, never stepped; at rest it is the room\'s own', () => {
  const look = STAGE_LOOKS.stormBreak;
  const outside = interiorLevels(look, {}, 0);
  const vault = interiorLevels(look, DN_INTERIOR.cellar, 1);
  const crypt = interiorLevels(look, DN_INTERIOR.crypt, 1);
  let now = approachLevels(outside, vault, 0);
  assert.ok(levelsSettled(now, outside));
  let last = now.probe;
  for (let k = 0; k < 400; k += 1) {
    now = approachLevels(now, k < 200 ? vault : crypt, 0.05);
    assert.ok(Math.abs(now.probe - last) < 0.06 * look.ambient.gain, `step ${k}`);
    last = now.probe;
    if (k === 199) assert.ok(levelsSettled(now, vault, 1e-3), 'the vault\'s');
  }
  assert.ok(levelsSettled(now, crypt, 1e-3), 'the crypt\'s');
  assert.ok(crypt.fogFar < outside.fogFar && crypt.sun < outside.sun);
});

test('light: the quality tiers give fewer real lights and no water reflection to a slow machine, never none', () => {
  assert.ok(QUALITY_TIERS.high.lamps > QUALITY_TIERS.low.lamps);
  assert.ok(QUALITY_TIERS.low.lamps >= 3);
  assert.ok(QUALITY_TIERS.medium.lamps <= QUALITY_TIERS.high.lamps && QUALITY_TIERS.medium.lamps >= QUALITY_TIERS.low.lamps);
  assert.equal(QUALITY_TIERS.low.waterReflect, 0);
  assert.equal(QUALITY_TIERS.high.waterReflect, 1);
  assert.ok(QUALITY_TIERS.low.ripples >= 4 && QUALITY_TIERS.high.ripples <= WATER.ripples);
});
