// Step out (physics.js startEvade, WORLD.evade): a whole-body evasion by where the blow comes (evadeKind): aside from one
// from above or a thrust, under one swung level at the head, back from one swung level at the body, a hop out of one at the
// legs. Larger than any defence, at `costJumps` of his own jump's cost, and it gets him out of a blow made in time.

import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { advance, createWorld, evadeKind, placeFighter, point, startEvade, throwPunch } from '../src/physics.js';
import { WORLD } from '../src/physics/config.js';
import { jumpOf } from '../src/physics/jump.js';
import { MOVES } from '../src/moves.js';

/** A striker (`hero`) and the man played, `gap` m apart and facing. */
function facing(hero, gap = 1.45, seed = 1) {
  const world = createWorld([structuredClone(PRESETS[hero]), { ...structuredClone(PRESETS.samurai), style: 'katana' }], { seed, arena: { halfX: 10, halfZ: 10 } });
  const [striker, man] = world.fighters;
  man.player = true;
  advance(world, 0.4, () => {});
  placeFighter(striker, -gap / 2, 0);
  placeFighter(man, gap / 2, 0);
  striker.yaw = 0;
  man.yaw = Math.PI;
  advance(world, 0.2, () => {});
  return { world, striker, man };
}

test('the kind of step out follows the blow: aside from above or a thrust, a duck under a level cut at the head, back from one at the body, a hop over one at the legs', () => {
  const punch = (move, zone) => ({ spec: MOVES[move], zone });
  assert.equal(evadeKind(punch('shomen', 'head')), 'aside');
  assert.equal(evadeKind(punch('tsuki', 'body')), 'aside');
  assert.equal(evadeKind(punch('yokogiri', 'head')), 'duck');
  assert.equal(evadeKind(punch('yokogiri', 'body')), 'back');
  assert.equal(evadeKind(punch('spearSweep', 'legs')), 'hop');
  assert.equal(evadeKind(null), 'aside');
});

test('it costs costJumps of his own jump, and takes him a metre aside, where a defence\'s sidestep goes a fraction of it', () => {
  const { world, man } = facing('samurai', 3);
  const before = man.stamina;
  const jump = jumpOf(man).cost;
  const start = [...man.root];
  assert.ok(startEvade(world, man));
  assert.ok(Math.abs(before - man.stamina - WORLD.evade.costJumps * jump) < 1e-6, `cost ${before - man.stamina} against a jump's ${jump}`);
  advance(world, WORLD.evade.seconds.aside, () => {});
  assert.ok(Math.hypot(man.root[0] - start[0], man.root[1] - start[1]) > 0.9);
  // Not again while he is carried on by a stroke of his own.
  man.committed = 0.3;
  assert.equal(startEvade(world, man), false);
});

test('a duck takes the head down under a cut, a hop takes the feet off the floor', () => {
  const ducking = facing('samurai');
  const head = point(ducking.man.x, P.head)[1];
  throwPunch(ducking.world, ducking.striker, 'yokogiri', 'head');
  startEvade(ducking.world, ducking.man);
  advance(ducking.world, 0.2, () => {});
  assert.ok(point(ducking.man.x, P.head)[1] < head - 0.15, 'the head down');
  const hopping = facing('spear', 1.7);
  throwPunch(hopping.world, hopping.striker, 'spearSweep', 'legs');
  startEvade(hopping.world, hopping.man);
  let air = false;
  for (let step = 0; step < 40; step += 1) {
    advance(hopping.world, 1 / 60, () => {});
    air ||= Boolean(hopping.man.air);
  }
  assert.ok(air, 'off the floor');
});

test('stepped out of as it starts, a cut from above, a level cut at the head and one at the body all miss', () => {
  for (const [move, zone] of [['shomen', 'head'], ['yokogiri', 'head'], ['yokogiri', 'body']]) {
    let hits = 0;
    for (let seed = 1; seed <= 6; seed += 1) {
      const { world, striker, man } = facing('samurai', 1.35 + 0.05 * seed, seed);
      throwPunch(world, striker, move, zone);
      startEvade(world, man);
      const from = world.events.length;
      for (let step = 0; step < 70 && striker.punch; step += 1) advance(world, 1 / 60, () => {});
      hits += world.events.slice(from).some((event) => event.kind === 'landed' && event.attacker === striker.id);
    }
    assert.equal(hits, 0, `${move} at the ${zone}`);
  }
});
