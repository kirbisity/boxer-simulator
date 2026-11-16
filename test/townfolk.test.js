// The canal town's people (src/townfolk.js): recorded once from the game's own standing and walk, about the square's edges
// on an ordinary day, and once a fight starts in the square, in at the doors or up the lane, a few watching from doorways;
// none of it touches a fight.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';

// (The kit's modules name THREE only inside the functions that make meshes: none is called here.)
globalThis.THREE ??= {};
const { CANAL_TOWN, canalTownDoors, canalTownPlan } = await import('../src/places/canaltown.js');
const { TOWNFOLK, createTownfolk, recordTownfolk, townfolkFight, townfolkPoints, townfolkStep } = await import('../src/townfolk.js');

const clips = recordTownfolk();
const houses = canalTownPlan().houses.filter((house) => !house.far && Math.abs(house.at[0]) < 70 && Math.abs(house.at[1]) < 40);
const made = () => createTownfolk(clips, { doors: canalTownDoors(), houses });

/** Men of two sides about the court's middle, as a world's fighters are read (townfolkFight). */
function fightAt(x0, z0) {
  return Array.from({ length: 12 }, (_, index) => {
    const x = new Float64Array(45);
    x[P.pelvis * 3] = x0 + ((index % 6) - 2.5) * 2;
    x[P.pelvis * 3 + 2] = z0 + (index < 6 ? -2 : 2);
    return { state: 'up', corner: index < 6 ? 'red' : 'blue', x };
  });
}

test('each one is recorded standing (or on his heels) and walking: a stride that closes, at a walking pace', () => {
  assert.equal(clips.length, TOWNFOLK.people.length);
  for (const clip of clips) {
    assert.ok(clip.idle.length >= TOWNFOLK.idle * TOWNFOLK.rate - 1, 'the standing clip is whole');
    const stride = clip.walk.length / TOWNFOLK.rate;
    assert.ok(stride >= TOWNFOLK.stride[0] && stride <= TOWNFOLK.stride[1], `a stride of ${stride} s`);
    assert.ok(clip.speed > 0.4 && clip.speed < 1.4, `walks at ${clip.speed} m/s`);
    for (const frame of [...clip.idle, ...clip.walk]) for (const value of frame) assert.ok(Number.isFinite(value));
  }
});

test('on an ordinary day they keep to the square\'s edges, out of the battle\'s court, and the strollers walk their beat', () => {
  const town = made();
  const court = CANAL_TOWN.court;
  const walked = new Set();
  for (let step = 0; step < 30 * 60; step += 1) {
    townfolkStep(town, 1 / 30, null);
    for (const one of town.folk) {
      assert.ok(!(Math.abs(one.at[0]) < court.halfX && Math.abs(one.at[1]) < court.halfZ), `${one.person.who} stays out of the court (${one.at})`);
      if (one.mix > 0.5) walked.add(one.index);
    }
  }
  assert.equal(town.folk.filter((one) => one.gone).length, 0);
  assert.deepEqual([...walked].sort(), town.folk.filter((one) => one.person.stroll).map((one) => one.index));
});

test('a fight in the square sends them in at the doors or up the lane; two or three watch from doorways, facing it', () => {
  const town = made();
  for (let step = 0; step < 90; step += 1) townfolkStep(town, 1 / 30, null);
  const men = fightAt(0, 0);
  const fight = townfolkFight(men);
  assert.ok(fight, 'two sides up near the square: a fight');
  let nearest = Infinity;
  for (let step = 0; step < 60 * 30; step += 1) {
    townfolkStep(town, 1 / 30, fight);
    for (const one of town.folk) {
      if (one.gone) continue;
      for (const point of townfolkPoints(town, one)) for (const value of point) assert.ok(Number.isFinite(value));
      for (const man of fight.men) nearest = Math.min(nearest, Math.hypot(man[0] - one.at[0], man[1] - one.at[1]));
    }
  }
  const watching = town.folk.filter((one) => one.watching);
  assert.ok(watching.length >= 2 && watching.length <= TOWNFOLK.watchers, `${watching.length} watch`);
  assert.ok(town.folk.every((one) => one.gone || one.watching), 'everyone else has gone in');
  assert.equal(new Set(watching.map((one) => one.exit.door)).size, watching.length, 'one to a doorway');
  for (const one of watching) {
    const door = town.doors[one.exit.door];
    assert.ok(Math.hypot(one.at[0] - door.at[0], one.at[1] - door.at[1]) < 0.3, 'in the doorway');
    const facing = [Math.cos(one.yaw), -Math.sin(one.yaw)];
    const toward = [fight.at[0] - one.at[0], fight.at[1] - one.at[1]];
    assert.ok(facing[0] * toward[0] + facing[1] * toward[1] > 0.8 * Math.hypot(...toward), 'facing the fight');
    assert.ok(['man', 'woman', 'old'].includes(one.person.who), 'a grown one');
  }
  assert.ok(nearest >= TOWNFOLK.clear * 0.8, `kept clear of the fighters (${nearest.toFixed(2)} m at the nearest)`);
});

test('no fight with one side, nor one far off; a walk after it leaves them where it left them', () => {
  assert.equal(townfolkFight(fightAt(0, 0).filter((man) => man.corner === 'red')), null);
  assert.equal(townfolkFight(fightAt(120, 0)), null);
  const town = made();
  townfolkStep(town, 1 / 30, townfolkFight(fightAt(0, 0)));
  for (let step = 0; step < 60 * 30; step += 1) townfolkStep(town, 1 / 30, null);
  assert.ok(town.folk.every((one) => one.gone || one.watching), 'the fight over, nobody comes out again in the same visit');
});

test('a watcher steps in when the fighting comes to his door', () => {
  const town = made();
  const fight = townfolkFight(fightAt(0, 0));
  for (let step = 0; step < 60 * 30; step += 1) townfolkStep(town, 1 / 30, fight);
  const watcher = town.folk.find((one) => one.watching);
  const near = { at: fight.at, men: [...fight.men, [watcher.at[0] + 1, watcher.at[1]]] };
  for (let step = 0; step < 10 * 30; step += 1) townfolkStep(town, 1 / 30, near);
  assert.ok(watcher.gone && !watcher.watching, 'gone in');
});
