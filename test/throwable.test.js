import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { infantrySoldier, swatOfficer } from '../src/cast.js';
import { advance, createWorld, placeFighter, point } from '../src/physics.js';
import { directFighter, newOrders } from '../src/control.js';
import { THROW, THROWABLES } from '../src/weapons.js';
import { artLabel, artPrimed } from '../src/weaponarts.js';
import { flyThrown, startThrow, throwChoice, throwableOf } from '../src/physics/throwable.js';
import { think } from '../src/ai.js';

const ARENA = { halfX: 40, halfZ: 40 };

/** A world of these men (each { inputs, corner, at: [x, z] }), placed where asked, no one thinking unless stepped so. */
function field(men, seed = 3) {
  const world = createWorld(men.map(({ inputs, corner }) => ({ inputs, corner })), { seed, arena: ARENA });
  world.fighters.forEach((fighter, index) => placeFighter(fighter, men[index].at[0], men[index].at[1]));
  return world;
}

/** A grenade of `kind` gone off where it lies at `at` (owned by fighter `owner`), stepped until it has. */
function goOff(world, kind, at, owner = 0) {
  world.thrown ??= [];
  world.thrown.push({ id: world.thrown.length, kind, owner, x: [...at], v: [0, 0, 0], fuseAt: world.time, resting: true, done: false });
  flyThrown(world, 1 / 120);
}

const plain = (heightCm = 178) => ({ ...PRESETS.contender, style: 'boxing', heightCm, outfit: { kind: 'casual', design: 0 } });

test('throwables: the infantryman carries one frag, a SWAT officer one flashbang, a boxer none', () => {
  const world = field([
    { inputs: infantrySoldier(() => 0.3), corner: 'red', at: [0, 0] },
    { inputs: swatOfficer(() => 0.3, 'handgun'), corner: 'red', at: [2, 0] },
    { inputs: swatOfficer(() => 0.6, 'baton'), corner: 'red', at: [4, 0] },
    { inputs: plain(), corner: 'blue', at: [10, 0] },
  ]);
  const [soldier, swat, baton, boxer] = world.fighters;
  assert.deepEqual(soldier.throwable, { kind: 'frag', left: 1 });
  assert.equal(soldier.style, 'rifle');
  assert.deepEqual(swat.throwable, { kind: 'flashbang', left: 1 });
  assert.deepEqual(baton.throwable, { kind: 'flashbang', left: 1 });
  assert.equal(boxer.throwable, undefined);
});

test('throwables: the weapon-art button throws it with no adrenaline, once; then it is the art\'s again', () => {
  const world = field([{ inputs: infantrySoldier(() => 0.3), corner: 'red', at: [0, 0] }, { inputs: plain(), corner: 'blue', at: [12, 0] }]);
  const [me] = world.fighters;
  const orders = newOrders();
  const step = (seconds) => advance(world, seconds, (current, dt) => directFighter(current, me, orders, dt));
  step(0.3);
  me.adrenaline = 0;
  assert.equal(artPrimed(me), true, 'the button is shown with no blood up');
  assert.equal(artLabel(me), THROWABLES.frag.label);
  orders.actions = ['art'];
  step(1 / 60);
  assert.ok(me.throwing, 'the pin pulled, the throw begun');
  assert.equal(me.throwable.left, 0);
  assert.equal(artPrimed(me), false, 'a rifle has no art: the button goes');
  step(THROW.release + 0.1);
  assert.equal(world.thrown.length, 1, 'thrown');
  const grenade = world.thrown[0];
  // Lobbed over the man 12 m off: it comes down near him, not at the thrower's feet.
  step(2);
  const landed = Math.hypot(grenade.x[0] - 12, grenade.x[2]);
  assert.ok(landed < 4.5, `it fell ${landed.toFixed(1)} m from the mark`);
  // Pressed again: nothing more to throw.
  orders.actions = ['art'];
  step(0.5);
  assert.equal(world.thrown.length, 1);
  assert.equal(world.events.filter((event) => event.kind === 'pin').length, 1);
  step(THROWABLES.frag.fuse);
  assert.ok(world.events.some((event) => event.kind === 'blast' && event.throwable === 'frag'), 'it went off');
});

/** The harm a frag at the origin does to a man standing `distance` m off in `outfit` (the mean over `trials` bursts). */
function fragHarm(distance, outfit, trials = 40) {
  let total = 0;
  let killed = 0;
  for (let trial = 0; trial < trials; trial += 1) {
    const world = field([{ inputs: plain(), corner: 'red', at: [-30, 0] }, { inputs: { ...plain(), outfit }, corner: 'blue', at: [distance, 0] }], 10 + trial);
    const man = world.fighters[1];
    goOff(world, 'frag', [0, 0.05, 0]);
    total += man.gunshot ?? 0;
    if (man.state === 'out') killed += 1;
  }
  return { harm: total / trials, killed: killed / trials };
}

test('throwables: a frag\'s fragments wound less the further off, and armour stops many', () => {
  const near = fragHarm(2, { kind: 'casual', design: 0 });
  const lethal = fragHarm(5, { kind: 'casual', design: 0 });
  const far = fragHarm(15, { kind: 'casual', design: 0 });
  assert.ok(near.harm > lethal.harm && lethal.harm > far.harm, `2 m ${near.harm.toFixed(2)}, 5 m ${lethal.harm.toFixed(2)}, 15 m ${far.harm.toFixed(2)}`);
  assert.ok(near.killed > 0.8, `at 2 m nearly every man dies: ${near.killed}`);
  assert.ok(lethal.killed > 0.1 && lethal.killed < 0.7 && lethal.harm > 0.5, `at 5 m (its lethal radius) some killed outright, all hurt: ${lethal.killed}, ${lethal.harm.toFixed(2)}`);
  assert.ok(far.killed < 0.1, `at 15 m (its casualty radius) few die: ${far.killed}`);
  const armoured = fragHarm(5, { kind: 'infantry', design: 0 });
  assert.ok(armoured.harm < lethal.harm * 0.7, `plate carrier and helmet at 5 m ${armoured.harm.toFixed(2)} against ${lethal.harm.toFixed(2)} bare`);
});

test('throwables: a man between takes the fragments meant for the one behind him', () => {
  let open = 0;
  let shielded = 0;
  for (let trial = 0; trial < 30; trial += 1) {
    const alone = field([{ inputs: plain(), corner: 'red', at: [-30, 0] }, { inputs: plain(), corner: 'blue', at: [4, 0] }], 50 + trial);
    goOff(alone, 'frag', [0, 0.05, 0]);
    open += alone.fighters[1].gunshot ?? 0;
    const behind = field([{ inputs: plain(), corner: 'red', at: [-30, 0] }, { inputs: plain(), corner: 'blue', at: [4, 0] }, { inputs: plain(), corner: 'blue', at: [3.2, 0] }], 50 + trial);
    goOff(behind, 'frag', [0, 0.05, 0]);
    shielded += behind.fighters[1].gunshot ?? 0;
  }
  assert.ok(shielded < open * 0.6, `behind a man ${shielded.toFixed(2)}, in the open ${open.toFixed(2)}`);
});

test('throwables: a flashbang dazes a man near it and not one far off, wounds no one, and less with his back to it', () => {
  const world = field([
    { inputs: plain(), corner: 'red', at: [-30, 0] },
    // Facing the burst (blue faces -x), 2 m off; one at 20 m; one at 2 m the other side, facing away from it.
    { inputs: plain(), corner: 'blue', at: [2, 0] },
    { inputs: plain(), corner: 'blue', at: [20, 0] },
    { inputs: plain(), corner: 'blue', at: [0, 2.5] },
  ]);
  const [, near, far, side] = world.fighters;
  side.yaw = Math.PI / 2;
  goOff(world, 'flashbang', [0, 0.05, 0]);
  assert.ok(near.dazed > 3, `near: dazed ${near.dazed}`);
  assert.ok(near.stagger > 0, 'near its foot he reels');
  assert.ok(near.stun > 0);
  assert.equal(far.dazed, 0, 'far off, nothing');
  assert.ok(side.dazed > 0 && side.dazed < near.dazed, `his back to it: ${side.dazed} against ${near.dazed}`);
  for (const man of world.fighters) assert.ok(!(man.gunshot > 0), 'no fragments');
});

test('throwables: the AI throws into a knot of enemies at a throw\'s distance, never near his own men, never in a melee', () => {
  const knot = [[14, 0], [15, 1.5], [15, -1.5], [16.5, 0.5]];
  const make = (friends, foes) => field([
    { inputs: infantrySoldier(() => 0.3), corner: 'red', at: [0, 0] },
    ...friends.map((at) => ({ inputs: plain(), corner: 'red', at })),
    ...foes.map((at) => ({ inputs: plain(), corner: 'blue', at })),
  ]);
  // A knot of four 15 m off, nobody of his near it: he throws, at the middle of them.
  let world = make([[-2, 3]], knot);
  const mark = throwChoice(world, world.fighters[0], 3);
  assert.ok(mark && Math.abs(mark[0] - 15) < 1.5 && Math.abs(mark[2]) < 1.5, `mark ${mark}`);
  // Stepping his mind: within a few seconds he has thrown it.
  const soldier = world.fighters[0];
  advance(world, 4, (current, dt) => { if (current.fighters[0].state === 'up') think(current, current.fighters[0], dt); });
  assert.equal(soldier.throwable.left, 0, 'thrown');
  // A man of his own among them: not.
  world = make([[15.5, -0.5]], knot);
  assert.equal(throwChoice(world, world.fighters[0], 3), null);
  // A single enemy: not worth a grenade.
  world = make([], [[15, 0]]);
  assert.equal(throwChoice(world, world.fighters[0], 3), null);
  // An enemy at arm's length: he fights him.
  world = make([], [...knot, [1.5, 0]]);
  assert.equal(throwChoice(world, world.fighters[0], 3), null);
  // Too close to throw a frag at (the knot 4 m off).
  world = make([], knot.map(([x, z]) => [x - 11, z]));
  assert.equal(throwChoice(world, world.fighters[0], 3), null);
  assert.ok(throwableOf(world.fighters[0]));
});
