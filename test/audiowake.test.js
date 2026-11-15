import test from 'node:test';
import assert from 'node:assert/strict';
import { WAKE, createWake } from '../src/audio/wake.js';

/** A pretend browser: a context whose resume takes only when the browser allows it, a clock, and timers run by hand. */
function rig({ allowsWithoutGesture = true } = {}) {
  const world = { now: 0, timers: [], inGesture: false, made: 0, primed: 0, closed: 0, ctx: null };
  const makeContext = () => {
    world.made += 1;
    const ctx = {
      state: 'running',
      currentTime: 0,
      broken: false,
      resume() {
        if (!ctx.broken && (world.inGesture || allowsWithoutGesture)) ctx.state = 'running';
        return Promise.resolve();
      },
      suspend() {
        ctx.state = 'suspended';
        return Promise.resolve();
      },
    };
    return ctx;
  };
  const wake = createWake({
    context: () => world.ctx,
    create: () => { world.ctx = makeContext(); },
    rebuild: () => { world.closed += 1; world.ctx = makeContext(); },
    prime: () => { world.primed += 1; },
    wall: () => world.now,
    later: (fn, seconds) => world.timers.push({ at: world.now + seconds, fn }),
  });
  world.wait = (seconds) => {
    world.now += seconds;
    if (world.ctx?.state === 'running' && !world.ctx.stalled) world.ctx.currentTime += seconds;
    const due = world.timers.filter((timer) => timer.at <= world.now);
    world.timers = world.timers.filter((timer) => timer.at > world.now);
    for (const timer of due) timer.fn();
  };
  world.tap = () => {
    world.inGesture = true;
    wake.gesture();
    world.inGesture = false;
  };
  return { wake, world };
}

test('the first gesture makes the context; a hidden page suspends it and a shown one resumes it', () => {
  const { wake, world } = rig();
  world.tap();
  assert.equal(world.made, 1);
  wake.hide();
  assert.equal(world.ctx.state, 'suspended');
  wake.show();
  world.wait(WAKE.settle + 0.1);
  assert.equal(world.ctx.state, 'running');
  assert.deepEqual(wake.status(), { away: false, refused: false, dead: false });
  // The first gesture after the return wakes the output even so; the next leaves a running context alone.
  world.tap();
  world.tap();
  assert.equal(world.primed, 1);
});

test('a resume refused without a gesture is taken up by the next tap, with a silent sample', () => {
  const { wake, world } = rig({ allowsWithoutGesture: false });
  world.tap();
  wake.hide();
  wake.show();
  world.wait(WAKE.settle + 0.1);
  assert.equal(world.ctx.state, 'suspended');
  assert.equal(wake.status().refused, true);
  world.tap();
  assert.equal(world.ctx.state, 'running');
  assert.equal(world.primed, 1);
  world.wait(WAKE.settle + 0.1);
  assert.equal(wake.status().refused, false);
  assert.equal(world.made, 1, 'the same context, resumed');
});

test('a gesture on a hidden page does nothing', () => {
  const { wake, world } = rig();
  world.tap();
  wake.hide();
  world.tap();
  assert.equal(world.ctx.state, 'suspended');
  assert.equal(world.primed, 0);
});

test('a context a gesture cannot resume is built anew by the next gesture', () => {
  const { wake, world } = rig({ allowsWithoutGesture: false });
  world.tap();
  wake.hide();
  world.ctx.broken = true;
  wake.show();
  world.wait(WAKE.settle + 0.1);
  world.tap();
  world.wait(WAKE.settle + 0.1);
  assert.equal(wake.status().dead, true);
  world.tap();
  assert.equal(world.closed, 1);
  assert.equal(world.made, 2);
  assert.equal(world.ctx.state, 'running');
  assert.equal(wake.status().dead, false);
});

test('a context running with its clock stood still is dead; one whose clock moves again is well', () => {
  const { wake, world } = rig();
  world.tap();
  wake.watch();
  world.ctx.stalled = true;
  world.wait(WAKE.stall / 2);
  wake.watch();
  assert.equal(wake.status().dead, false, 'not yet');
  world.wait(WAKE.stall);
  wake.watch();
  assert.equal(wake.status().dead, true);
  world.ctx.stalled = false;
  world.wait(0.1);
  wake.watch();
  assert.equal(wake.status().dead, false);
  world.ctx.stalled = true;
  world.wait(WAKE.stall * 2);
  wake.watch();
  world.tap();
  assert.equal(world.made, 2, 'rebuilt by the gesture');
});

test('a context interrupted while shown is resumed; one suspended while hidden is left', () => {
  const { wake, world } = rig();
  world.tap();
  world.ctx.state = 'interrupted';
  wake.stateChanged(world.ctx);
  assert.equal(world.ctx.state, 'running');
  wake.hide();
  wake.stateChanged(world.ctx);
  assert.equal(world.ctx.state, 'suspended');
  wake.show();
  assert.equal(world.ctx.state, 'running');
});
