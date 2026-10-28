// A battle's soaked ground is standing water too (Agincourt's ploughland after the night's rain): the same water as the castle's cesspool, as the physics, the picture and the
// ear have it. And the arrows of a big battle: drawn a little larger from far off, never past a cap, and as they are close to.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, seededRandom } from '../src/physics.js';
import { footSoldier } from '../src/cast.js';
import { horseMire, softAt, standingWater, worksOf } from '../src/physics/fieldworks.js';
import { surfaceUnder } from '../src/audio/surface.js';
import { stepParams } from '../src/audio/sfx/step.js';
import { BATTLE_WATER, WATER, addRipple, ageRipples, newRipples, rippleRing, waterAt, waterContains, waterDepth, waterSources, wadeDrag, waterViscosity, worksWaters } from '../src/levelmode/water.js';
import { battleOf } from '../src/scenarios.js';
import { ARROW_SIGHT, arrowSightScale, metresPerPixel } from '../src/arrowsight.js';

const agincourt = () => battleOf('agincourt');

test('Agincourt\'s field has a body of water over it: a film on the mud, the whole field, as thick as its clay, shallow', () => {
  const works = worksOf(agincourt().arena);
  const waters = worksWaters(works);
  assert.equal(waters.length, 1, 'one sheet over the ploughland');
  const [water] = waters;
  assert.equal(water.kind, 'water');
  assert.equal(water.murk, 'mud');
  assert.equal(waterViscosity(water), works.soft[0].viscosity, 'as thick as the clay it stands on (the cesspool\'s sludge)');
  // Shallow: a film in the furrows, not a lake: a few centimetres over the mud.
  const film = water.at[1] - 0.008;
  assert.ok(film > 0.01 && film <= 0.08, `${film.toFixed(3)} m of water over the mud`);
  assert.ok(waterDepth(water) < 0.6, 'over the plough\'s pan at the most');
  // It covers the field the French cross, from their end to the English line, and not the ground beyond the woods.
  for (const [x, z] of [[-45, 0], [-20, 6], [0, -8], [8, 0], [45, 3]]) assert.ok(waterContains(water, x, z), `water at ${x}, ${z}`);
  assert.ok(!waterContains(water, 0, 30));
  // A man's foot in it rings it (the castle's water code), by the film's surface.
  assert.ok(waterAt(waters, -10, 0, 0), 'a foot sunk in the mud is in the water');
  assert.ok(!waterAt(waters, -10, 0.5, 0), 'a foot well lifted is not');
});

test('the water over the mud is over the men\'s feet as the mud is: it holds the legs more, the horses\' too', () => {
  const works = worksOf(agincourt().arena);
  const soft = softAt(works, -10, 0);
  assert.ok(standingWater(soft) > 0 && standingWater(soft) <= 0.08);
  assert.equal(standingWater(softAt(works, -50.01, 0)), 0, 'none off the field');
  // The same mud, dry on top, against it wet: the same sunk man's legs held more.
  const sunk = 0.3;
  const wet = wadeDrag(soft.area, sunk + standingWater(soft), 1.75);
  const dry = wadeDrag(soft.area, sunk, 1.75);
  assert.ok(wet.foot < dry.foot, `${wet.foot.toFixed(3)} wet, ${dry.foot.toFixed(3)} dry`);
  assert.ok(wet.foot > dry.foot * 0.75, 'by a little: a few centimetres, not a flood');
  // A horse goes through it slower than through the same mud with no water on it.
  const random = seededRandom(3);
  const world = createWorld([{ inputs: footSoldier(random, 'spear'), corner: 'red' }, { inputs: footSoldier(random, 'spear'), corner: 'blue' }], { seed: 3, arena: agincourt().arena });
  const horse = { at: [-10, 0], withers: 1.6, mass: 450, rider: null };
  const wetPace = horseMire(world, horse).pace;
  const dryArena = { ...agincourt().arena, works: { ...agincourt().arena.works, soft: [{ ...agincourt().arena.works.soft[0], water: 0 }] } };
  const dryPace = horseMire({ arena: dryArena, fighters: [] }, horse).pace;
  assert.ok(wetPace < dryPace, `${wetPace.toFixed(3)} wet, ${dryPace.toFixed(3)} dry`);
});

test('the men and horses wading it ring it, as in the castle: fewer, and nearer the camera, for a battle\'s numbers', () => {
  const [water] = worksWaters(worksOf(agincourt().arena));
  // A man's feet moving through the water (sunk below its surface) ring it and trail a wake.
  const memory = new Map();
  const man = (x) => ({ id: 1, feet: [[x, -0.1, 0], [x + 0.3, -0.1, 0.2]], hips: [x, 0.9, 0] });
  let rings = 0;
  for (let step = 0; step < 40; step += 1) rings += waterSources([water], [man(-20 + step * 0.06)], memory, step * 0.05, BATTLE_WATER).ripples.length;
  assert.ok(rings >= 2, `${rings} rings from a man wading two seconds`);
  // A battle's rings are made less often than the castle's (seventy men would be a blur of them) and die sooner.
  const castle = new Map();
  let castleRings = 0;
  for (let step = 0; step < 40; step += 1) castleRings += waterSources([water], [man(-20 + step * 0.06)], castle, step * 0.05, WATER).ripples.length;
  assert.ok(rings < castleRings, `${rings} against the castle's ${castleRings}`);
  assert.ok(BATTLE_WATER.life < WATER.life);
  // A ring fades out over the battle's own life.
  const pool = newRipples(BATTLE_WATER.ripples);
  addRipple(pool, { x: 0, z: 0, born: 0, amp: 1, water: water.id });
  assert.ok(rippleRing(pool.list[0], 0.5, BATTLE_WATER).strength > 0);
  assert.equal(rippleRing(pool.list[0], BATTLE_WATER.life + 0.1, BATTLE_WATER), null);
  ageRipples(pool, BATTLE_WATER.life + 0.1, BATTLE_WATER);
  assert.equal(pool.list.length, 0);
});

test('the field is heard as mud with water on it: a splash with the squelch', () => {
  const random = seededRandom(5);
  const world = createWorld([{ inputs: footSoldier(random, 'spear'), corner: 'red' }, { inputs: footSoldier(random, 'spear'), corner: 'blue' }], { seed: 5, arena: agincourt().arena });
  world.place = 'agincourt';
  const ground = surfaceUnder(world, -10, 0, 0);
  assert.equal(ground.surface, 'mud');
  assert.ok(ground.depth > 0, 'water standing on it');
  const step = stepParams({ surface: ground.surface, depth: ground.depth, speed: 1.5, mass: 100 });
  const dry = stepParams({ surface: 'mud', depth: 0, speed: 1.5, mass: 100 });
  assert.ok(step.splash > 0 && dry.splash === 0, 'a splash over the squelch');
  assert.ok(step.level > dry.level, 'a little louder');
  // Water proper is unchanged: it splashes by its depth.
  assert.ok(stepParams({ speed: 3, surface: 'water', depth: 0.8 }).splash > stepParams({ speed: 3, surface: 'water', depth: 0.1 }).splash);
});

test('an arrow is drawn larger from far off, up to a cap, and as it is near the camera', () => {
  const view = { fovDeg: 40, heightPx: 720 };
  const near = arrowSightScale(4, view);
  assert.deepEqual(near, { across: 1, along: 1 }, 'true to size close to');
  let last = near;
  for (const distance of [8, 12, 20, 30, 45, 70]) {
    const seen = arrowSightScale(distance, view);
    assert.ok(seen.across >= last.across && seen.along >= last.along, `no smaller at ${distance} m`);
    last = seen;
  }
  const far = arrowSightScale(60, view);
  assert.ok(far.across > 1.5, `a shaft ${far.across.toFixed(1)} times as thick at 60 m`);
  // The shaft is a pixel or so wide on the screen where it can be.
  const mid = arrowSightScale(20, view);
  const pixels = (0.008 * mid.across) / metresPerPixel(20, view.fovDeg, view.heightPx);
  assert.ok(Math.abs(pixels - ARROW_SIGHT.pixels) < 0.01, `${pixels.toFixed(2)} px at 20 m`);
  // Capped: never a pole, however far; longer only by the square root of its thickness, to its own cap.
  assert.equal(arrowSightScale(500, view).across, ARROW_SIGHT.thicker);
  assert.ok(arrowSightScale(500, view).along <= ARROW_SIGHT.longer);
  assert.ok(arrowSightScale(500, view).along <= Math.sqrt(arrowSightScale(500, view).across) + 1e-9);
  // A taller view (a bigger screen) shows the arrow wider already: less is added.
  assert.ok(arrowSightScale(20, { fovDeg: 40, heightPx: 1440 }).across < mid.across);
});
