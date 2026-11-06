import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, point, step } from '../src/physics.js';
import { stepHorse } from '../src/physics/mounted.js';
import { scenarioWorld } from '../src/scenarios.js';

const FIELD = { halfX: 60, halfZ: 40 };
const rider = (key) => ({ ...structuredClone(PRESETS[key]), mounted: true });

test('a coarse horse steps as far in a long substep as in the short ones it stands for (rates per second, not per step)', () => {
  const make = () => {
    const world = createWorld([{ inputs: rider('kheshig'), corner: 'red' }, { inputs: structuredClone(PRESETS.street), corner: 'blue' }], { seed: 1, arena: FIELD });
    const horse = world.horses[0];
    horse.goal = { heading: horse.yaw + 0.6, speed: horse.paces.gallop };
    horse.goalAt = Infinity;
    return { world, horse };
  };
  const fine = make();
  const coarse = make();
  const h = 1 / 480;
  for (let k = 0; k < 960; k += 1) stepHorse(fine.world, fine.horse, h);
  for (let k = 0; k < 240; k += 1) stepHorse(coarse.world, coarse.horse, 4 * h);
  assert.ok(fine.horse.speed > 3 && Math.abs(fine.horse.yaw - make().horse.yaw) > 0.3, `got away and turned: ${fine.horse.speed}, ${fine.horse.yaw}`);
  assert.ok(Math.abs(fine.horse.speed - coarse.horse.speed) < 0.05, `speed ${fine.horse.speed} v ${coarse.horse.speed}`);
  assert.ok(Math.abs(fine.horse.yaw - coarse.horse.yaw) < 0.02, `yaw ${fine.horse.yaw} v ${coarse.horse.yaw}`);
  assert.ok(Math.hypot(fine.horse.at[0] - coarse.horse.at[0], fine.horse.at[1] - coarse.horse.at[1]) < 0.1, 'the same ground covered');
  assert.ok(Math.abs((fine.horse.tire ?? 0) - (coarse.horse.tire ?? 0)) < 1e-3, 'tired as much');
});

test('a small mounted fight keeps every rider and horse in full', () => {
  const world = createWorld([{ inputs: rider('knight'), corner: 'red' }, { inputs: rider('samurai'), corner: 'blue' }], { seed: 1, arena: FIELD });
  for (let k = 0; k < 30; k += 1) advance(world, 1 / 60);
  for (const fighter of world.fighters) assert.equal(fighter.detail, 'full');
  for (const horse of world.horses) assert.equal(horse.detail, 'full');
});

test('in a big battle a rider out of the fight is coarse or a pose, carried in the saddle, and back in full without a jolt', () => {
  const world = scenarioWorld('mobei', 1);
  const dt = 1 / 60;
  const last = new Map();
  let sawPose = false;
  let sawCoarseHorse = false;
  let switches = 0;
  for (let k = 0; k < 60 * 8; k += 1) {
    thinkAll(world, dt);
    step(world, dt);
    for (const horse of world.horses) if (horse.detail === 'coarse') sawCoarseHorse = true;
    for (const fighter of world.fighters) {
      if (!fighter.mount || fighter.state !== 'up') continue;
      const horse = fighter.mount;
      if (fighter.detail === 'proxy') sawPose = true;
      // Seated: his hips over the saddle, his head above them.
      const pelvis = point(fighter.x, P.pelvis);
      assert.ok(Math.hypot(pelvis[0] - horse.at[0], pelvis[2] - horse.at[1]) < 1.2 * horse.withers, `rider ${fighter.id} off his horse (${fighter.detail})`);
      assert.ok(fighter.x[P.head * 3 + 1] - pelvis[1] > 0.35, `rider ${fighter.id} not upright (${fighter.detail})`);
      // Back in full: moving with his horse, not flung off it.
      const was = last.get(fighter.id);
      if (fighter.detail === 'full' && was && was !== 'full') {
        switches += 1;
        const neck = P.neck * 3;
        const carrier = fighter.carrier;
        const slip = Math.hypot(fighter.v[neck] - carrier[0], fighter.v[neck + 1] - carrier[1], fighter.v[neck + 2] - carrier[2]);
        assert.ok(slip < 4, `rider ${fighter.id} back in full from ${was} at ${slip.toFixed(2)} m/s off his horse`);
      }
      last.set(fighter.id, fighter.detail);
    }
  }
  assert.ok(sawPose, 'a rider out of the fight is a pose');
  assert.ok(sawCoarseHorse, 'a horse out of the fight is coarse');
  assert.ok(switches > 0, 'riders came back into full');
});
