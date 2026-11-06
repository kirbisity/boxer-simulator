// The press of a crowd (physics/press.js) and the high ground: force carried man to man through bodies in contact; a man
// hemmed in cannot step back, and has no room for a swing beside him; a slope's pull adds to a run down it and to a push
// down it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { MOVES } from '../src/moves.js';
import { advance, createWorld, placeOnFloor } from '../src/physics.js';
import { WORLD } from '../src/physics/config.js';
import { blockStep, recordContact, setDrive, slopeHold, solvePress } from '../src/physics/press.js';
import { createTerrain, floorAt } from '../src/physics/terrain.js';
import { swingFouled } from '../src/ai.js';

/** A bare man for the press: his mass, standing, at x along a file. */
function man(id, x, kg = 80) {
  return { id, x, corner: 'red', state: 'up', body: { massKg: kg }, knock: [0, 0, 0], press: undefined, rootVelocity: [0, 0], groundSlope: undefined };
}

/**
 * A file of men along +x, each touching the next, the first `pushers` (from the back) driving on toward +x; the press run for
 * `seconds` with the knock decaying as checkBalance lets it. Returns the men (the front man last).
 */
function file(count, pushers, seconds = 1) {
  const men = Array.from({ length: count }, (_, index) => man(index, index * 0.4));
  const world = { fighters: men };
  const dt = 1 / 60;
  const decay = Math.exp(-WORLD.balance.absorbPerSecond * dt);
  let most = 0;
  for (let t = 0; t < seconds; t += dt) {
    // (pushApart's normal is from the second to the first: the man behind to the man before is -x.)
    for (let index = 0; index + 1 < count; index += 1) recordContact(world, men[index + 1], men[index], [1, 0, 0], 0.02);
    men.forEach((one, index) => setDrive(one, index < pushers ? [1, 0] : [0, 0], 1));
    solvePress(world, dt, () => 1);
    for (const one of men) one.knock = one.knock.map((value) => value * decay);
    most = Math.max(most, Math.hypot(...men.at(-1).knock));
  }
  return { men, most };
}

test('one man pushing a man standing is held by his feet; four ranks behind carry the front man off his feet', () => {
  const limit = WORLD.balance.speed;
  const one = file(2, 1);
  assert.ok(one.most < 0.2 * limit, `one pusher: knock ${one.most.toFixed(2)}`);
  const four = file(5, 4);
  assert.ok(four.most > limit, `four ranks: knock ${four.most.toFixed(2)} past ${limit}`);
  // The more ranks behind, the more bears on the front man.
  const loads = [2, 3, 4, 5].map((count) => file(count, count - 1).men.at(-1).press.load);
  for (let index = 1; index < loads.length; index += 1) assert.ok(loads[index] > loads[index - 1], `loads ${loads.map((value) => value.toFixed(2))}`);
});

test('a man pinned between the ranks pushing behind him and a man before him is squeezed, not knocked', () => {
  const { men } = file(4, 2);
  const pinned = men[2];
  assert.ok(pinned.press.load > 0.5, `load ${pinned.press.load.toFixed(2)}`);
  assert.equal(pinned.press.knock, 0);
  assert.equal(pinned.press.count, 2);
});

test('a man borne on from behind cannot step back into him; a step forward, or back from a man idle behind him, goes', () => {
  const { men } = file(3, 1);
  const middle = men[1];
  const facing = [1, 0, 0];
  const back = [-1, 0];
  blockStep(middle, back, facing);
  assert.ok(Math.abs(back[0]) < 1e-9, `step back ${back[0]}`);
  const on = [1, 0];
  blockStep(middle, on, facing);
  assert.equal(on[0], 1);
  // Nobody pushing: the man behind is shouldered aside.
  const idle = file(3, 0).men[1];
  const free = [-1, 0];
  blockStep(idle, free, facing);
  assert.equal(free[0], -1);
});

test('on a slope a push down it is held the less, one up it the more; on the flat as ever', () => {
  const flat = man(0, 0);
  assert.equal(slopeHold(flat, 1, 0), 1);
  // A 20% slope falling toward +x.
  const hill = { ...man(1, 0), groundSlope: [-0.2, 0] };
  const down = slopeHold(hill, 1, 0);
  const up = slopeHold(hill, -1, 0);
  assert.ok(down < 0.8 && down > 0.6, `down ${down.toFixed(2)}`);
  assert.ok(up > 1.2 && up < 1.35, `up ${up.toFixed(2)}`);
  // Men standing on a hill each hold their own weight's pull; pushing down it, the slope's pull goes on with the push.
  const front = (fall) => {
    const men = Array.from({ length: 3 }, (_, index) => ({ ...man(index, index * 0.4), groundSlope: [-fall, 0] }));
    const world = { fighters: men };
    for (let step = 0; step < 4; step += 1) {
      for (let index = 0; index + 1 < men.length; index += 1) recordContact(world, men[index + 1], men[index], [1, 0, 0], 0.02);
      men.forEach((one, index) => setDrive(one, index < 2 ? [1, 0] : [0, 0], 1));
      solvePress(world, 1 / 60, () => 1);
    }
    return men[2].press.load;
  };
  assert.ok(front(0.2) > front(0) * 1.2, `on the hill ${front(0.2).toFixed(2)}, flat ${front(0).toFixed(2)}`);
});

/** A world on a ramp falling toward +x at `grade`, one man at x facing `yaw`. */
function onRamp(grade, x, yaw, preset = 'samurai') {
  const half = 20;
  const terrain = createTerrain([{ kind: 'ramp', at: [0, 0], size: [2 * half, 20], from: grade * half, to: -grade * half }], { sea: -50 });
  const world = createWorld([{ inputs: structuredClone(PRESETS[preset]), corner: 'red' }], { seed: 1, arena: { halfX: 18, halfZ: 9, open: true, terrain } });
  const fighter = world.fighters[0];
  placeOnFloor(fighter, x, 0, floorAt(terrain, x, 0), yaw);
  return { world, fighter };
}

test('a run down a slope goes faster than on the flat, and up it slower', () => {
  const top = (grade, way) => {
    const { world, fighter } = onRamp(grade, -6 * way, way > 0 ? 0 : Math.PI);
    let fastest = 0;
    for (let t = 0; t < 3; t += 1 / 60) {
      fighter.running = true;
      fighter.move = 1;
      fighter.goTo = [12 * way, 0, 0];
      advance(world, 1 / 60);
      fastest = Math.max(fastest, Math.hypot(...fighter.rootVelocity));
    }
    return fastest;
  };
  const flat = top(0, 1);
  const down = top(0.1, 1);
  const up = top(0.1, -1);
  assert.ok(down > flat * 1.03, `down ${down.toFixed(2)} flat ${flat.toFixed(2)}`);
  assert.ok(up < flat * 0.97, `up ${up.toFixed(2)} flat ${flat.toFixed(2)}`);
});

test('a swing has no room with a man at his side; a thrust goes out past him; with room the swing is made', () => {
  const world = createWorld([{ inputs: structuredClone(PRESETS.samurai), corner: 'red' }, { inputs: structuredClone(PRESETS.samurai), corner: 'red' }, { inputs: structuredClone(PRESETS.samurai), corner: 'blue' }], { seed: 1 });
  const [me, mate, foe] = world.fighters;
  placeOnFloor(me, 0, 0, 0, 0);
  placeOnFloor(foe, 1.6, 0, 0, Math.PI);
  // Shoulder to shoulder on his sword side (-z, a right-hander's): the flat cut across opens out through him.
  placeOnFloor(mate, 0, -0.5, 0, 0);
  assert.equal(swingFouled(world, me, MOVES.yokogiri, foe), true);
  assert.equal(swingFouled(world, me, MOVES.tsuki, foe), false);
  // At his back: the overhead cut is raised back through his face.
  placeOnFloor(mate, -0.5, 0, 0, 0);
  assert.equal(swingFouled(world, me, MOVES.shomen, foe), true);
  assert.equal(swingFouled(world, me, MOVES.tsuki, foe), false);
  placeOnFloor(mate, -4, 4, 0, 0);
  assert.equal(swingFouled(world, me, MOVES.yokogiri, foe), false);
  // The man he aims at is not in his way.
  assert.equal(swingFouled(world, me, MOVES.shomen, foe), false);
});
