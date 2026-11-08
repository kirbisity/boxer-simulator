// Walk fields (physics/walkfield.js): the nearest enemy's walk read off one field spread from his side's men agrees with
// fieldworks.js walkingDistance to within a cell or so, round a palisade's end, through a gap narrower than a cell and over a
// ditch. And decisions by perception (ai.js AI.perceive): the men the player can see deciding are thought for in full.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { AI, thinkAll } from '../src/ai.js';
import { advance, seededRandom } from '../src/physics.js';
import { walkingDistance } from '../src/physics/fieldworks.js';
import { nearestWalk, WALKFIELD } from '../src/physics/walkfield.js';
import { STORY_BATTLES } from '../src/story/battles/index.js';
import { storyBattleWorld } from '../src/story/runner.js';
import { storyNorthLife } from '../tools/storynorth.js';

const PROFILE = [[-2.4, 0], [-1.6, -1.2], [-0.5, -1.2], [0.3, 0.7], [1.5, 0.7], [2.6, 0]];
// A palisade with its lower end free and a gap a ladder's width, and apart from it a ditch: walkingDistance is exact for
// each alone (round a wall's end on flat ground; straight over a ditch), the field is held to it there.
const FENCED = { halfX: 20, halfZ: 12, works: { walls: [{ points: [[4, -10], [4, 12]], height: 1.8, kind: 'palisade', gaps: [[14, 15.1]] }] } };
const DITCHED = { halfX: 20, halfZ: 12, works: { ditches: [{ from: [-2, -12], to: [-2, 12], profile: PROFILE }] } };
// The palisade right across the floor: the gap is the only way.
const CLOSED = { halfX: 20, halfZ: 12, works: { walls: [{ points: [[4, -12], [4, 12]], height: 1.8, kind: 'palisade', gaps: [[16, 17.1]] }] } };

/** One man of `corner` standing at (x, z), in a world of the arena (only what the field reads of him). */
function oneMan(arena, x, z, corner = 'blue') {
  const man = { id: 0, corner, state: 'up', x: new Float64Array(P.pelvis * 3 + 3) };
  man.x[P.pelvis * 3] = x;
  man.x[P.pelvis * 3 + 2] = z;
  return { arena, fighters: [man], time: 0 };
}

test("the walk field's nearest walk is fieldworks.js walkingDistance to within a cell", () => {
  const random = seededRandom(4);
  let compared = 0;
  for (let k = 0; k < 400; k += 1) {
    const arena = k % 2 ? FENCED : DITCHED;
    const from = [-14 + random() * 26, -9 + random() * 18];
    const angle = random() * Math.PI * 2;
    const to = [from[0] + Math.cos(angle) * random() * 12, from[1] + Math.sin(angle) * random() * 12];
    if (Math.abs(to[0]) > 19 || Math.abs(to[1]) > 11) continue;
    const world = oneMan(arena, ...from);
    const exact = walkingDistance(world, from, to);
    if (exact > WALKFIELD.reach - 2) continue;
    const field = nearestWalk(world, 'blue', ...to);
    // (Nothing said: further than `reach` from the works, where the straight line is the walk.)
    if (!field) {
      assert.ok(Math.abs(exact - Math.hypot(to[0] - from[0], to[1] - from[1])) < 1e-9, `${from} to ${to}: off the works, straight`);
      continue;
    }
    assert.equal(field.who, 0, `${from} to ${to}: field ${field.walk}, exact ${exact.toFixed(2)}`);
    // (Never much shorter; longer by at most a cell's diagonal and the grid's bends.)
    assert.ok(field.walk > exact - 0.1 && field.walk < exact + WALKFIELD.cell * Math.SQRT2, `${from} to ${to}: field ${field.walk.toFixed(2)}, exact ${exact.toFixed(2)}`);
    compared += 1;
  }
  assert.ok(compared > 200, `${compared} compared`);
});

test('the field goes round a wall by its gap, narrower than a cell, and says nothing far from the works', () => {
  // Across the palisade at z = -4: through the 1.1 m gap at z 4-5.1, not through the posts.
  const world = oneMan(CLOSED, 1, -4);
  const across = nearestWalk(world, 'blue', 7, -4);
  const round = Math.hypot(4 - 1, 4.55 + 4) + Math.hypot(7 - 4, -4 - 4.55);
  assert.ok(across.walk > round - 0.5 && across.walk < round + 1.5, `round by the gap: ${across.walk.toFixed(2)} (${round.toFixed(2)} by its middle)`);
  // Past `reach` it is beyond: no walk.
  world.fighters[0].x[P.pelvis * 3 + 2] = -11;
  world.time = 1;
  assert.equal(nearestWalk(world, 'blue', 7, -11).walk, Infinity);
  // Of a side with nobody standing: no walk.
  world.fighters[0].state = 'out';
  world.time = 2;
  assert.equal(nearestWalk(world, 'blue', 2, 0).walk, Infinity);
  // On open ground (no works) the field says nothing: the straight line is the walk.
  assert.equal(nearestWalk({ arena: { halfX: 20, halfZ: 12 }, fighters: [], time: 0 }, 'blue', 0, 0), null);
});

test('a story battle is thought for as the hero perceives it: the men near him or in his view in full, the far ones at a slower beat', () => {
  const battle = STORY_BATTLES.pyongyang;
  const life = storyNorthLife(battle, { rank: 'soldier', place: 'front' });
  const setup = battle.setup(life, 1);
  const world = storyBattleWorld(setup, life);
  assert.equal(world.perceiver, setup.player);
  const hero = world.fighters[setup.player];
  const where = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
  const apart = (fighter) => Math.hypot(where(fighter)[0] - where(hero)[0], where(fighter)[1] - where(hero)[1]);
  const thinks = new Map();
  let far = 0;
  for (let step = 0; step < 240; step += 1) {
    advance(world, 1 / 60, (current, dt) => thinkAll(current, dt));
    for (const fighter of world.fighters) {
      if (fighter.state === 'out' || fighter.id === hero.id) continue;
      if (apart(fighter) <= AI.perceive.close - 0.5) assert.equal(fighter.unperceived, false, `man ${fighter.id} within ${AI.perceive.close} m of him`);
      if (apart(fighter) > AI.perceive.sharp + 1) {
        assert.equal(fighter.unperceived, true, `man ${fighter.id} past ${AI.perceive.sharp} m`);
        far += 1;
      }
      // (His reading of the field round him: kept, if he is not perceived, for appraiseEvery s.)
      if (fighter.fieldFear) thinks.set(fighter.id, [...(thinks.get(fighter.id) ?? []), fighter.fieldFear.at]);
    }
  }
  assert.ok(far > 0, 'some men far from him');
  // A man never perceived reads the field round him at most every appraiseEvery s.
  for (const [id, times] of thinks) {
    const fighter = world.fighters[id];
    if (!fighter.unperceived || apart(fighter) < AI.perceive.sharp + 3) continue;
    const reads = [...new Set(times)];
    for (let k = 2; k < reads.length; k += 1) assert.ok(reads[k] - reads[k - 1] >= AI.perceive.appraiseEvery - 1e-9 || reads[k] - reads[k - 1] < 1e-9, `man ${id} read the field ${reads[k] - reads[k - 1]} s after the last`);
  }
  // Nobody played: every man in full.
  const watched = storyBattleWorld(setup, life);
  watched.perceiver = undefined;
  advance(watched, 0.5, (current, dt) => thinkAll(current, dt));
  assert.ok(watched.fighters.every((fighter) => !fighter.unperceived));
});
