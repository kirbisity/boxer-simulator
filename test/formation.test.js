import test from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, seededRandom } from '../src/physics.js';
import { aheadOfSlot, DRILL, moveFormations, slotAt } from '../src/formation.js';
import { legionSides, SCENARIOS } from '../src/scenarios.js';

/** Rome against Han, `count` a side, laid out as the level lays them. */
function battle(count, seed = 3) {
  const sides = legionSides(seededRandom(seed), count);
  const level = SCENARIOS.legion;
  return createWorld([...sides.red.map((inputs) => ({ inputs, corner: 'red' })), ...sides.blue.map((inputs) => ({ inputs, corner: 'blue' }))], { seed, arena: level.arena, formation: level.formation });
}

test('drilled men form up on their leader: each remembers his place from him, the leader his own at nought', () => {
  const world = battle(40);
  for (const corner of ['red', 'blue']) {
    const formation = world.formations[corner];
    assert.ok(formation, corner);
    const leader = world.fighters[formation.leader];
    assert.ok(Math.abs(leader.slot.ahead) < 1e-9 && Math.abs(leader.slot.across) < 1e-9);
    for (const id of formation.members) {
      const fighter = world.fighters[id];
      const slot = slotAt(formation, fighter.slot);
      assert.ok(Math.hypot(slot[0] - fighter.x[P.pelvis * 3], slot[1] - fighter.x[P.pelvis * 3 + 2]) < 1e-6, 'his slot is where he stands');
    }
  }
  // A side without drilled men (or too few) has no formation.
  const loose = createWorld([{ inputs: legionSides(seededRandom(1), 2).red[0], corner: 'red' }, { inputs: legionSides(seededRandom(1), 2).blue[0], corner: 'blue' }]);
  assert.deepEqual(loose.formations, {});
});

test('the legion walks up in its ranks and the Han hold theirs; nobody runs on deep past his place; the back ranks are only poses', () => {
  const world = battle(60);
  const start = { red: [...world.formations.red.anchor], blue: [...world.formations.blue.anchor] };
  let deepest = -Infinity;
  let posedBehind = 0;
  let behind = 0;
  for (let second = 0; second < 30; second += 1) {
    advance(world, 1, (current, dt) => thinkAll(current, dt));
    for (const corner of ['red', 'blue']) {
      const formation = world.formations[corner];
      for (const id of formation.members) {
        const fighter = world.fighters[id];
        if (fighter.state !== 'up') continue;
        // A shooter just relieved walks back to his new place: not out of place.
        if (world.time - (fighter.swappedAt ?? -Infinity) > 4) deepest = Math.max(deepest, aheadOfSlot(fighter, formation));
        if (!fighter.inFront && !fighter.punch) {
          behind += 1;
          if (fighter.detail === 'proxy') posedBehind += 1;
        }
      }
    }
  }
  const moved = (corner) => Math.hypot(world.formations[corner].anchor[0] - start[corner][0], world.formations[corner].anchor[1] - start[corner][1]);
  assert.ok(moved('red') > 5, `the legion advanced (${moved('red').toFixed(1)} m)`);
  assert.ok(moved('blue') < 1e-9, 'the Han held their ground');
  assert.ok(deepest < 4, `no man far out past his place (${deepest.toFixed(1)} m)`);
  assert.ok(posedBehind / behind > 0.9, `the ranks behind the front are poses (${posedBehind} of ${behind})`);
});

test('a fallen man in the front rank: the man behind him in his file steps into his place', () => {
  const world = battle(40);
  const formation = world.formations.red;
  const members = formation.members.map((id) => world.fighters[id]);
  moveFormations(world, 1 / 60);
  const front = members.find((fighter) => fighter.inFront);
  const place = { ...front.slot };
  const behind = members.filter((fighter) => fighter !== front && Math.abs(fighter.slot.across - place.across) < DRILL.file && fighter.slot.ahead < place.ahead).sort((a, b) => b.slot.ahead - a.slot.ahead)[0];
  assert.ok(behind, 'someone behind him');
  front.state = 'out';
  formation.review = 0;
  moveFormations(world, 1 / 60);
  assert.deepEqual(behind.slot, place);
});

test('the testudo: closed up on the approach, the front rank\'s shields a wall, the rest a roof; opened for the charge', async () => {
  const { shieldDisc } = await import('../src/physics.js');
  const world = battle(40);
  const formation = world.formations.red;
  let closed = false;
  let opened = false;
  for (let second = 0; second < 30 && !opened; second += 1) {
    advance(world, 1, (current, dt) => thinkAll(current, dt));
    if (formation.testudo && formation.close < 0.75) {
      closed = true;
      const men = formation.members.map((id) => world.fighters[id]).filter((fighter) => fighter.state === 'up' && fighter.shield && !fighter.defence);
      const roofs = men.filter((fighter) => fighter.shieldPose === 'roof');
      const walls = men.filter((fighter) => fighter.shieldPose === 'wall');
      assert.ok(roofs.length && walls.length, 'a roof and a wall');
      assert.ok(roofs.every((fighter) => shieldDisc(fighter).normal[1] > 0.5), 'the roof faces up');
      assert.ok(walls.every((fighter) => Math.abs(shieldDisc(fighter).normal[1]) < 0.5), 'the wall faces forward');
    }
    if (closed && !formation.testudo) opened = true;
  }
  assert.ok(closed, 'it closed up into the testudo');
  assert.ok(opened, 'and opened out for the charge');
  assert.ok(formation.gap > 0, 'before the lines met');
});
