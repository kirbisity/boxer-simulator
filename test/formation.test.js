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
        deepest = Math.max(deepest, aheadOfSlot(fighter, formation));
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
