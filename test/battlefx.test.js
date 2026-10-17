import test from 'node:test';
import assert from 'node:assert/strict';
import { BATTLE_FX, BLACK_POWDER, battleFxGlint, battleFxShotPuffs, battleFxStepPuff } from '../src/battlefx.js';

const seeded = (seed = 3) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

test('black powder throws a cloud and a pan puff; smokeless leaves only a faint wisp', () => {
  const shot = { from: [0, 1.4, 0], dir: [1, 0, 0], pan: [-0.85, 1.43, 0] };
  const powder = battleFxShotPuffs({ ...shot, powder: true, long: true }, seeded());
  const wisp = battleFxShotPuffs({ ...shot, powder: false, long: true, pan: null }, seeded());
  assert.ok(powder.length >= 8, `${powder.length}`);
  assert.ok(powder.some((puff) => puff.at[0] < -0.5), 'a puff at the pan');
  assert.ok(wisp.length <= 2);
  assert.ok(Math.max(...wisp.map((puff) => puff.alpha)) < Math.min(...powder.map((puff) => puff.alpha)));
  assert.ok(Math.max(...wisp.map((puff) => puff.life)) < 3);
  assert.ok(BLACK_POWDER.has('matchlock') && !BLACK_POWDER.has('rifle'));
});

test('the cloud is stopped by the air within a couple of metres, then drifts on the breeze, swells, and thins away', () => {
  const [fastest] = battleFxShotPuffs({ from: [0, 1.4, 0], dir: [1, 0, 0], powder: true, long: true, pan: null }, seeded()).sort((a, b) => b.velocity[0] - a.velocity[0]);
  const dt = 1 / 60;
  let now = battleFxStepPuff(fastest, dt);
  const firstSize = now.size;
  for (let step = 0; step < 60; step += 1) now = battleFxStepPuff(fastest, dt);
  assert.ok(fastest.at[0] > 0.5 && fastest.at[0] < 3, `out to ${fastest.at[0]} m in a second`);
  // By now it moves with the breeze, not the blast.
  assert.ok(Math.abs(fastest.velocity[0] - BATTLE_FX.wind[0]) < 0.2, `${fastest.velocity[0]}`);
  assert.ok(now.size > firstSize * 3);
  const midOpacity = now.opacity;
  let lived = 1;
  while (now) {
    now = battleFxStepPuff(fastest, dt);
    lived += dt;
    if (now) assert.ok(now.opacity <= midOpacity + 1e-9);
  }
  assert.ok(lived > 5 && lived < 16, `gone after ${lived.toFixed(1)} s`);
});

test('a blade glints where the sun mirrors into the eye, and nowhere else', () => {
  // The sun straight up, the eye straight up: a blade lying flat (its flat facing up) glints in the middle.
  const flat = [0, 1, 0];
  const edge = [0, 0, 1];
  const glint = battleFxGlint([-0.5, 1, 0], [0.5, 1, 0], flat, edge, [0, 1, 0], [0, 6, 0]);
  assert.ok(glint && glint.strength > 0.9, JSON.stringify(glint));
  assert.ok(Math.abs(glint.at[0]) < 0.05, 'under the eye');
  // The eye off to one side along the blade: the mirror point moves along the blade towards it.
  const aside = battleFxGlint([-0.5, 1, 0], [0.5, 1, 0], flat, edge, [0, 1, 0], [0.6, 6, 0]);
  assert.ok(aside && aside.at[0] > 0.02, JSON.stringify(aside));
  // Turned on its edge to the sun: no face looks that way.
  assert.equal(battleFxGlint([-0.5, 1, 0], [0.5, 1, 0], [0, 0, 1], [0, 1, 0], [0, 1, 0], [0, 6, 0]), null);
  // Stood up on end, pointing at the sun: nothing either.
  assert.equal(battleFxGlint([0, 1, 0], [0, 2, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0], [0, 6, 0]), null);
  // A lamp (a point, not a direction) over the blade.
  const lamp = battleFxGlint([-0.5, 1, 0], [0.5, 1, 0], flat, edge, [0, 4, 0], [0, 6, 0], undefined, true);
  assert.ok(lamp && lamp.strength > 0.9);
});
