// The sound log (src/audio/log.js): a ring the ear reads with a cursor; nothing at all without an ear; what is too far off is not
// heard but for thunder and gunpowder. And the events at their sources: a bout, a horse, a battle, a walk through the Old Drain's
// cistern (stone, then sewage to the shin) and the gates of Dunnottar, each with values a physicist would sign; recording them moves nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, placeOnFloor, seededRandom } from '../src/physics.js';
import { SCENARIOS } from '../src/scenarios.js';
import { coveringAt, readSounds, SOUND_RING, soundEvent } from '../src/audio/log.js';
import { surfaceAt, surfaceUnder } from '../src/audio/surface.js';
import { collectItem } from '../src/levelmode/items.js';
import { createLevelWorld } from '../src/levelmode/level.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { createStageWorld, pullLever, sectionById, setMechanism, updateStage } from '../src/levelmode/stage.js';
import { DUNNOTTAR } from '../src/levelmode/stages/dunnottar.js';
import { TESTYARD } from '../src/levelmode/stages/testyard.js';
import { walk } from './walker.js';

const hearing = (radius = 20) => ({ time: 0, ear: { x: 0, y: 1.6, z: 0, radius } });
const duel = (red, blue, extra = {}) => createWorld([{ inputs: structuredClone(PRESETS[red]), corner: 'red' }, { inputs: structuredClone(PRESETS[blue]), corner: 'blue' }], { seed: 7, ...extra });
/** The ear on a fighter's head, as the engine puts it each frame. */
const listenTo = (world, fighter, radius = 20) => {
  world.ear = { x: fighter.x[P.head * 3], y: fighter.x[P.head * 3 + 1], z: fighter.x[P.head * 3 + 2], radius };
};
const ofType = (world, type) => readSounds(world, 0).events.filter((event) => event.type === type);
const finite = (event) => ['x', 'y', 'z', 't'].every((key) => Number.isFinite(event[key]));

test('sound log: events go into a ring of SOUND_RING, the cursor reads only the new ones, oldest first, across the wrap', () => {
  const world = hearing();
  soundEvent(world, 'step', { x: 1, y: 0, z: 1, speed: 1 });
  soundEvent(world, 'step', { at: [2, 0, 2], speed: 2 });
  let read = readSounds(world, 0);
  assert.equal(read.events.length, 2);
  assert.equal(read.cursor, 2);
  assert.deepEqual([read.events[1].x, read.events[1].y, read.events[1].z], [2, 0, 2], 'a point given as `at` is laid out as x, y, z');
  assert.equal(read.events[1].at, undefined);
  assert.equal(read.events[0].t, 0);
  world.time = 1.5;
  soundEvent(world, 'step', { x: 0, y: 0, z: 0, speed: 3 });
  read = readSounds(world, read.cursor);
  assert.deepEqual(read.events.map((event) => event.speed), [3], 'only what came after the cursor');
  assert.equal(read.events[0].t, 1.5);
  assert.deepEqual(readSounds(world, read.cursor).events, [], 'nothing new');
  // Round the ring and past it: the reader keeping up sees every one in order; one that fell more than a ring behind gets the last ring.
  let cursor = read.cursor;
  const seen = [];
  for (let k = 0; k < SOUND_RING * 2 + 7; k += 1) {
    soundEvent(world, 'step', { x: 0, y: 0, z: 0, speed: 100 + k });
    if (k % 1000 === 999) {
      const next = readSounds(world, cursor);
      seen.push(...next.events.map((event) => event.speed));
      cursor = next.cursor;
    }
  }
  const last = readSounds(world, cursor);
  seen.push(...last.events.map((event) => event.speed));
  assert.deepEqual(seen, Array.from({ length: SOUND_RING * 2 + 7 }, (_, k) => 100 + k));
  assert.equal(world.sounds.length, SOUND_RING, 'the ring never grows');
  const behind = readSounds(world, 0);
  assert.equal(behind.events.length, SOUND_RING);
  assert.equal(behind.events[0].speed, 100 + SOUND_RING + 7, 'the oldest still in the ring');
  assert.equal(behind.events.at(-1).speed, 100 + SOUND_RING * 2 + 6);
  assert.equal(behind.cursor, world.soundsCount);
});

test('sound log: no ear, no log; out of the circle not heard, but thunder and gunpowder are heard over the whole map', () => {
  const deaf = { time: 0 };
  soundEvent(deaf, 'hit', { x: 0, y: 1, z: 0, energy: 50 });
  assert.equal(deaf.sounds, undefined, 'nothing is made');
  assert.equal(readSounds(deaf, 0).events.length, 0);
  const world = hearing(20);
  soundEvent(world, 'hit', { x: 19, y: 1, z: 0 });
  soundEvent(world, 'hit', { x: 15, y: 1, z: 15 });
  soundEvent(world, 'hit', { x: 0, y: 30, z: 1 });
  assert.equal(world.soundsCount, 2, 'within 20 m on the floor (height is no matter), one at 21 m dropped');
  soundEvent(world, 'thunder', { x: 900, y: 0, z: 0, distance: 900 });
  soundEvent(world, 'shot', { x: 300, y: 1, z: 0, kind: 'matchlock' });
  soundEvent(world, 'shot', { x: 300, y: 1, z: 0, kind: 'cannon' });
  soundEvent(world, 'shot', { x: 300, y: 1, z: 0, kind: 'bow' });
  soundEvent(world, 'shot', { x: 300, y: 1, z: 0, kind: 'crossbow' });
  assert.deepEqual(readSounds(world, 2).events.map((event) => event.kind ?? event.type), ['thunder', 'matchlock', 'cannon']);
  // A point that is no point is nowhere.
  soundEvent(world, 'hit', { x: Number.NaN, y: 1, z: 0 });
  assert.equal(world.soundsCount, 5);
});

test('sound log: recording changes nothing: a bout and a walk with an ear go exactly as without one', () => {
  const plain = duel('knight', 'samurai');
  const heard = duel('knight', 'samurai');
  for (let k = 0; k < 8 * 60; k += 1) {
    advance(plain, 1 / 60, (current, dt) => thinkAll(current, dt));
    advance(heard, 1 / 60, (current, dt) => {
      listenTo(current, current.fighters[0]);
      thinkAll(current, dt);
    });
  }
  assert.ok(heard.soundsCount > 20, `${heard.soundsCount} sounds`);
  plain.fighters.forEach((fighter, index) => assert.deepEqual([...heard.fighters[index].x], [...fighter.x]));
  assert.equal(heard.events.length, plain.events.length);
  // And in the drain: a walk off the causeway into the sewage.
  const runs = [false, true].map((ear) => {
    const world = cistern();
    const me = world.fighters[0];
    walk(world, me, [[-48.5, 11], [-52, 13]], { seconds: 15, each: ear ? (current) => listenTo(current, me) : null });
    return world;
  });
  assert.ok(runs[1].soundsCount > 10);
  runs[0].fighters.forEach((fighter, index) => assert.deepEqual([...runs[1].fighters[index].x], [...fighter.x]));
});

test('sound log: a bout of fists: punches and kicks of tens to hundreds of joules on flesh, steps on the ring\'s boards, the struck grunt', () => {
  const world = duel('heavy', 'light');
  advance(world, 20, (current, dt) => {
    listenTo(current, current.fighters[0]);
    thinkAll(current, dt);
  });
  const hits = ofType(world, 'hit');
  assert.ok(hits.length >= 3, `${hits.length} hits`);
  for (const hit of hits) {
    assert.ok(finite(hit) && ['fist', 'foot', 'knee', 'elbow', 'body'].includes(hit.striker), JSON.stringify(hit));
    assert.ok(hit.energy > 1 && hit.energy < 1500, `${hit.striker} ${hit.energy.toFixed(0)} J`);
    assert.ok(hit.impulse > 0.5 && hit.impulse < 200, `${hit.impulse.toFixed(1)} N s`);
    assert.equal(hit.covering, 'flesh', 'boxers in their shorts');
    assert.ok(hit.who !== hit.by && [0, 1].includes(hit.who) && [0, 1].includes(hit.by));
  }
  const fists = hits.filter((hit) => hit.striker === 'fist');
  assert.ok(fists.length && fists.some((hit) => hit.energy > 10), 'a punch lands with tens of joules');
  const steps = ofType(world, 'step');
  assert.ok(steps.length > 20);
  for (const step of steps) {
    assert.ok(finite(step) && step.surface === 'wood' && step.depth === 0 && step.armour === 'none' && ['l', 'r'].includes(step.foot));
    assert.ok(step.mass > 50 && step.mass < 200 && step.speed >= 0 && step.speed < 10);
  }
  const voices = ofType(world, 'voice');
  assert.ok(voices.some((voice) => voice.kind === 'struck'), 'a man struck grunts');
  for (const voice of voices) assert.ok(voice.strength > 0 && voice.strength <= 1 && voice.size > 1.4 && voice.size < 2.2);
});

test('sound log: steel: blades meet, edges and points land on plate and lamellar, the swing whooshes at its fastest', () => {
  const world = duel('knight', 'samurai');
  advance(world, 20, (current, dt) => {
    listenTo(current, current.fighters[0]);
    thinkAll(current, dt);
  });
  const clashes = ofType(world, 'clash');
  assert.ok(clashes.length >= 1, 'the blades meet');
  for (const clash of clashes) assert.ok(finite(clash) && clash.speed > 0 && clash.speed < 40 && ['blade', 'haft', 'blunt'].includes(clash.a) && typeof clash.slide === 'boolean');
  const hits = ofType(world, 'hit');
  assert.ok(hits.some((hit) => ['blade', 'point', 'blunt'].includes(hit.striker)));
  assert.ok(hits.some((hit) => hit.covering === 'plate' && hit.who === 0), 'the samurai\'s blows ring on the knight\'s plate');
  assert.ok(hits.some((hit) => hit.covering === 'lamellar' && hit.who === 1), 'the knight\'s on the samurai\'s lamellar');
  for (const hit of hits) assert.ok(hit.energy > 0 && hit.energy < 2000, `${hit.energy} J`);
  const swings = ofType(world, 'swing');
  assert.ok(swings.length >= 1);
  for (const swing of swings) assert.ok(swing.speed > 8 && swing.speed < 80 && swing.length > 0.3 && swing.mass > 0.3 && swing.mass < 6);
  assert.ok(ofType(world, 'step').every((step) => step.armour === (step.who === 0 ? 'plate' : 'lamellar')));
  // What covers each part: plate over the knight, lamellar on the samurai, flesh under a robe.
  const [knight, samurai] = world.fighters;
  assert.equal(coveringAt(knight, 'trunk'), 'plate');
  assert.equal(coveringAt(knight, 'head'), 'plate');
  assert.equal(coveringAt(samurai, 'trunk'), 'lamellar');
  assert.equal(coveringAt(duel('heavy', 'light').fighters[0], 'head'), 'flesh');
});

test('sound log: a rider: each hoof comes down on its beat, as heavy as the laden horse', () => {
  const rider = { ...structuredClone(PRESETS.knight), mounted: true };
  const world = createWorld([{ inputs: rider, corner: 'red' }, { inputs: structuredClone(PRESETS.yari), corner: 'blue' }], { seed: 1, arena: { halfX: 30, halfZ: 20 } });
  advance(world, 8, (current, dt) => {
    listenTo(current, current.fighters[1], 60);
    thinkAll(current, dt);
  });
  const hooves = ofType(world, 'horse').filter((event) => event.kind === 'hoof');
  assert.ok(hooves.length > 8, `${hooves.length} hoof beats`);
  for (const hoof of hooves) assert.ok(finite(hoof) && hoof.mass > 400 && hoof.mass < 1200 && hoof.surface === 'earth' && ['walk', 'trot', 'canter', 'gallop'].includes(hoof.gait));
  assert.ok(new Set(hooves.map((hoof) => hoof.leg)).size === 4, 'all four legs');
});

test('sound log: a battle (Rhodes, 1522): on the sand, the bows and the matchlocks, the arrows going in, the men falling', () => {
  const scenario = SCENARIOS.rhodes;
  const cast = scenario.cast(seededRandom(7));
  const world = createWorld([...cast.red.map((inputs) => ({ inputs, corner: 'red' })), ...cast.blue.map((inputs) => ({ inputs, corner: 'blue' }))], { seed: 7, arena: scenario.arena, formation: scenario.formation });
  // (The engine says where the fight is: the view's place.)
  world.place = scenario.scene;
  advance(world, 10, (current, dt) => {
    current.ear = { x: 0, y: 1.6, z: 0, radius: 40 };
    thinkAll(current, dt);
  });
  const types = new Set(readSounds(world, 0).events.map((event) => event.type));
  for (const type of ['hit', 'wound', 'step', 'fall', 'voice', 'shot', 'arrowhit', 'clash', 'swing']) assert.ok(types.has(type), `${type} in ${[...types]}`);
  assert.ok(ofType(world, 'step').every((step) => step.surface === 'sand'), 'the beach before the fort');
  const shots = ofType(world, 'shot');
  assert.ok(shots.some((shot) => shot.kind === 'bow') && shots.some((shot) => shot.kind === 'matchlock' && shot.weapon));
  for (const arrow of ofType(world, 'arrowhit')) assert.ok(arrow.speed > 20 && arrow.speed < 120, `${arrow.speed} m/s`);
  for (const wound of ofType(world, 'wound')) assert.ok(['cut', 'stab', 'bone', 'crush'].includes(wound.kind) && wound.severity > 0 && wound.severity <= 1);
  for (const fall of ofType(world, 'fall')) assert.ok(fall.speed > 0.8 && fall.speed < 15 && fall.mass > 40);
  assert.ok(ofType(world, 'voice').some((voice) => voice.kind === 'death'), 'a man dies aloud');
});

/** A run with the player on the causeway of the Old Drain's cistern, everybody else asleep. */
function cistern() {
  const world = createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed: 3 });
  const me = world.fighters[0];
  placeOnFloor(me, -48.5, 6, -5, Math.PI / 2);
  updateStage(world, true);
  for (const fighter of world.fighters) if (fighter !== me) fighter.dormant = true;
  return world;
}

test('sound log: a walk through the cistern: steps on the causeway\'s flags, then in the sewage to the shin; the surface under a point', () => {
  const world = cistern();
  const me = world.fighters[0];
  const result = walk(world, me, [[-48.5, 11], [-52, 13], [-52, 16]], { seconds: 30, each: (current) => listenTo(current, me) });
  assert.ok(result.reached >= 2, JSON.stringify(result));
  const steps = ofType(world, 'step');
  const dry = steps.filter((step) => step.surface === 'stone');
  const wet = steps.filter((step) => step.surface === 'water');
  assert.ok(dry.length > 6 && wet.length > 3, `${dry.length} on stone, ${wet.length} in the sewage`);
  for (const step of dry) assert.ok(step.depth === 0 && Math.abs(step.x + 48.5) < 2.2, 'on the causeway');
  for (const step of wet) assert.ok(Math.abs(step.depth - 0.28) < 0.01 && step.x < -50, `${step.depth} m deep at x ${step.x}`);
  // The ground the engine can ask after itself.
  assert.deepEqual(surfaceUnder(world, -48.5, -4.9, 10), { surface: 'stone', depth: 0 });
  assert.equal(surfaceUnder(world, -53, -5.3, 10).surface, 'water');
  // The flat fights: by the place when it is known, else what the arena shows.
  const ring = duel('heavy', 'light');
  assert.equal(surfaceAt(ring, 0, 0, 0), 'wood');
  ring.place = 'colosseum';
  assert.equal(surfaceAt(ring, 0, 0, 0), 'sand');
  assert.equal(surfaceAt(duel('heavy', 'light', { arena: { halfX: 9, halfZ: 7 } }), 0, 0, 0), 'earth');
});

test('sound log: the gates of a stage: a door swung open, a lever thrown and the gate it works, a thing taken up', () => {
  const world = createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed: 3 });
  world.ear = { x: -5, y: 1.6, z: 46, radius: 20 };
  assert.equal(setMechanism(world, 'cliffgate', 'open'), true);
  const [door] = ofType(world, 'mech');
  assert.ok(door && door.kind === 'door' && door.state === 'opening' && door.id === 'cliffgate' && finite(door), JSON.stringify(door));
  // A door far off is not heard.
  world.ear = { x: 200, y: 0, z: 200, radius: 20 };
  setMechanism(world, 'cliffgate', 'closed');
  assert.equal(ofType(world, 'mech').length, 1);
  const yard = createStageWorld(TESTYARD, structuredClone(PRESETS.amateur));
  yard.ear = { x: 20, y: 1.6, z: 0, radius: 20 };
  assert.equal(pullLever(yard, 'lever1'), true);
  assert.deepEqual(ofType(yard, 'mech').map((event) => `${event.kind} ${event.state}`), ['lever opening', 'gate opening']);
  // A bandage taken up off the floor of the drain.
  const bandage = sectionById(DUNNOTTAR, 'sewer').items.find((item) => item.kind === 'bandage');
  world.ear = { x: bandage.at[0], y: bandage.at[1], z: bandage.at[2], radius: 20 };
  assert.equal(collectItem(world, bandage), true);
  const taken = ofType(world, 'mech').at(-1);
  assert.ok(taken.kind === 'pickup' && taken.id === bandage.id && taken.x === bandage.at[0]);
});
