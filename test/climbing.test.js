// Climbing a wall (physics/ladders.js, physics/fieldworks.js FIELDWORKS.face): a sheer face stops a man walking into it and
// never throws him up it; a story wall's ladders lie at its foot until men raise them; a man goes up a ladder at a climbing
// pace, one to every spacing of it, onto the walk at its head; knocked off it, he falls from his rung's height and is hurt;
// a ladder with a man on it is shoved off by a defender at its head, the man going over with it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { mingSoldier, sengokuWarrior } from '../src/cast.js';
import { advance, createWorld, fall, placeOnFloor, point, seededRandom } from '../src/physics.js';
import { reliefAt, worksOf, worksStateOf } from '../src/physics/fieldworks.js';
import { boardLadder, LADDERS, ladderPlace, standLadder } from '../src/physics/ladders.js';
import { wallWorks } from '../src/story/ground/walls.js';

/** A wall along z at x = 1 (its walk on +x), one ladder at z = 0; a Japanese defender and Ming attackers. */
function wallWorld({ attackers = 1, bare = false, seed = 3 } = {}) {
  const { works, walk } = wallWorks({ x: 1, z: [-9, 9], height: 4.5, ladders: [0] });
  const random = seededRandom(seed);
  const men = [{ inputs: sengokuWarrior(random, { tint: {} }, 'yari', 'ashigaru'), corner: 'blue' }];
  for (let k = 0; k < attackers; k += 1) men.push({ inputs: mingSoldier(random, 'dao'), corner: 'red' });
  // (Bare: the rampart's sheer face alone, no wall line, no ladder: nothing but the relief to stop him.)
  const world = createWorld(men, { seed, arena: { halfX: 15, halfZ: 9, works: bare ? { ditches: works.ditches } : works } });
  const at = (fighter, x, z) => placeOnFloor(fighter, x, z, reliefAt(worksOf(world.arena), x, z), fighter.yaw);
  // The defender well along the walk, out of the way.
  at(world.fighters[0], walk[0] + 2, 6);
  world.fighters[0].dormant = true;
  for (let k = 0; k < attackers; k += 1) at(world.fighters[1 + k], -3 - 1.5 * k, 0.3 * k);
  return { world, walk, at };
}

/** Each man walks for the wall's far side (as a man goes for the enemy on it), or to his post at the ladder's foot. */
const toTheWall = (world) => {
  for (const man of world.fighters.slice(1)) {
    man.goTo = man.ladderPost ? [man.ladderPost.at[0], 0, man.ladderPost.at[1]] : [4, 0, 0];
    man.move = 1;
  }
};

const hipsUp = (fighter) => point(fighter.x, P.pelvis)[1];

test('a sheer face stops a man walking into it: he is never thrown up it (the ladder-gap fling)', () => {
  // On main before the face rule, the man walking into the bare 4.5 m face (15 : 1) was lifted onto it part by part and
  // thrown 13 m into the air.
  for (const [z, toward] of [[0, 0], [-2, 0], [0.4, 3]]) {
    const { world } = wallWorld({ bare: true });
    const man = world.fighters[1];
    placeOnFloor(man, -3, z, 0, 0);
    let highest = 0;
    for (let t = 0; t < 10; t += 1 / 30) {
      advance(world, 1 / 30, () => {
        man.goTo = [4, 0, toward];
        man.move = 1;
      });
      highest = Math.max(highest, hipsUp(man));
    }
    assert.ok(highest < 1.3, `his hips no higher than a man standing (${highest.toFixed(2)} m)`);
    assert.equal(man.state, 'up', 'still on his feet at the face');
    assert.ok((man.lift ?? 0) < 0.45, `his stance at the face's foot (${(man.lift ?? 0).toFixed(2)} m)`);
    assert.ok(man.root[0] < 1.05, `stopped at it (x ${man.root[0].toFixed(2)})`);
  }
});

test('a story wall\'s ladder lies at its foot, its gap closed, until two men at its foot raise it', () => {
  const { world } = wallWorld({ attackers: 2 });
  const ladder = world.siegeLadders[0];
  assert.equal(ladder.up, false, 'lying');
  assert.equal(ladder.tilt, 1);
  assert.ok(worksStateOf(world).closed.includes(ladder.piece), 'its gap shut');
  let raisedAt = null;
  for (let t = 0; t < 30 && raisedAt === null; t += 0.05) {
    advance(world, 0.05, toTheWall);
    if (ladder.up) raisedAt = world.time;
  }
  assert.ok(raisedAt !== null, 'raised');
  assert.ok(raisedAt >= LADDERS.raiseSeconds, `in the time it takes (${raisedAt?.toFixed(1)} s)`);
  assert.ok(!worksStateOf(world).closed.includes(ladder.piece), 'its gap open');
});

test('men climb a ladder at a climbing pace, one to every spacing of it, onto the walk at its head', () => {
  const { world } = wallWorld({ attackers: 2 });
  const ladder = world.siegeLadders[0];
  standLadder(world, ladder);
  const [first, second] = world.fighters.slice(1);
  const ups = [];
  let closest = Infinity;
  for (let t = 0; t < 30; t += 0.05) {
    advance(world, 0.05, toTheWall);
    if (first.climbing) ups.push([world.time, first.climbing.up]);
    if (first.climbing && second.climbing) closest = Math.min(closest, (first.climbing.up - second.climbing.up) / Math.cos(LADDERS.lean));
  }
  // Its pace while climbing clear of the man above (none: he is the first).
  const climbing = ups.filter(([, up]) => up > 0.2 && up < ladder.height - 0.2);
  const pace = (climbing.at(-1)[1] - climbing[0][1]) / (climbing.at(-1)[0] - climbing[0][0]);
  assert.ok(Math.abs(pace - LADDERS.climb.pace) < 0.05, `${pace.toFixed(2)} m/s up it`);
  assert.ok(closest >= LADDERS.climb.spacing - 0.05, `the second a spacing below the first (${closest.toFixed(2)} m of ladder)`);
  const onto = world.events.filter((event) => event.kind === 'ladder' && event.onto).map((event) => event.fighters[0]);
  assert.deepEqual(onto, [first.id, second.id], 'both up onto the walk, in turn');
  assert.ok(Math.abs((first.lift ?? 0) - 4.5) < 0.05, 'standing on the walk');
});

test('knocked off a ladder he falls from his rung\'s height and is hurt by the ground; a ladder with a man on it is shoved off', () => {
  const { world, walk } = wallWorld({ attackers: 1 });
  const ladder = world.siegeLadders[0];
  standLadder(world, ladder);
  const man = world.fighters[1];
  const [x, z] = ladderPlace(ladder, 3);
  placeOnFloor(man, x, z, 3, man.yaw);
  boardLadder(world, man, ladder, 3);
  // Held there a moment: his stance on the rungs, 3 m up.
  advance(world, 0.5, () => {});
  assert.ok(man.climbing && hipsUp(man) > 3.4, `on his rung (${hipsUp(man).toFixed(2)} m)`);
  const hurt = () => Object.values(man.damage).reduce((sum, value) => sum + value, 0);
  const before = hurt();
  fall(world, man, 'struck');
  advance(world, 2.5, () => {});
  assert.equal(man.climbing, null, 'off the ladder');
  assert.ok(hipsUp(man) < 0.6, `down on the ground (${hipsUp(man).toFixed(2)} m)`);
  assert.ok(hurt() > before || man.state === 'out', `hurt by a 3 m fall (${before.toFixed(3)} → ${hurt().toFixed(3)})`);

  // The defender at its head, a man 2 m up it: shoved off with him on it.
  const { world: second } = wallWorld({ attackers: 1, seed: 5 });
  const ladder2 = second.siegeLadders[0];
  standLadder(second, ladder2);
  const defender = second.fighters[0];
  defender.dormant = false;
  placeOnFloor(defender, walk[0] + 0.45, 0.3, 4.5, Math.PI);
  const climber = second.fighters[1];
  const [x2, z2] = ladderPlace(ladder2, 2);
  placeOnFloor(climber, x2, z2, 2, climber.yaw);
  boardLadder(second, climber, ladder2, 2);
  for (let t = 0; t < LADDERS.pushSeconds + 0.3 && ladder2.up; t += 1 / 60) advance(second, 1 / 60, () => {});
  assert.equal(ladder2.up, false, 'pushed off');
  assert.equal(ladder2.pushedLoaded, 1, 'with a man on it');
  assert.equal(climber.climbing, null);
  assert.notEqual(climber.state, 'up', 'he goes over with it');
});
