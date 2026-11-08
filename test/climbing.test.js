// Climbing a wall (physics/ladders.js, physics/fieldworks.js FIELDWORKS.face): a sheer face stops a man walking into it and
// never throws him up it; a story wall's ladders lie at its foot until men raise them; men go up a ladder two abreast at a
// stair's pace, one to every spacing of each lane, onto the walk at its head; the player gets on only by walking at the wall,
// and climbs back down when he pulls away; knocked off it, a man falls from his rung's height and is hurt; a ladder with a man
// low on it is shoved off by a defender at its head, the man going over with it; one with a man near its top takes two. On
// it his feet and hands are on its rungs, a foot on one at every moment, the two by turns; he goes up only from over its
// bottom rung, never climbing the air beside it from where he stood under it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { mingSoldier, sengokuWarrior } from '../src/cast.js';
import { advance, createWorld, fall, placeOnFloor, point, seededRandom } from '../src/physics.js';
import { reliefAt, worksOf, worksStateOf } from '../src/physics/fieldworks.js';
import { boardLadder, LADDERS, ladderLimbs, ladderLoad, ladderPlace, ladderPushSeconds, standLadder } from '../src/physics/ladders.js';
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

test('men climb a ladder two abreast at a stair\'s pace, one to every spacing of each lane, onto the walk at its head', () => {
  const { world } = wallWorld({ attackers: 4 });
  const ladder = world.siegeLadders[0];
  standLadder(world, ladder);
  // Its foot out at its lean: the ladder's line from its foot to its head at 65° from the ground.
  assert.ok(Math.abs(Math.atan2(ladder.height, ladder.footOut + ladder.run) - (Math.PI / 2 - LADDERS.lean)) < 1e-6, 'at its slope');
  const men = world.fighters.slice(1);
  const ups = new Map(men.map((man) => [man, []]));
  const lanes = new Set();
  let closest = Infinity;
  for (let t = 0; t < 40; t += 0.05) {
    advance(world, 0.05, toTheWall);
    for (const man of men) if (man.climbing) {
      ups.get(man).push([world.time, man.climbing.up]);
      lanes.add(man.climbing.lane);
      for (const other of men) {
        if (other !== man && other.climbing?.lane === man.climbing.lane && other.climbing.up > man.climbing.up) closest = Math.min(closest, (other.climbing.up - man.climbing.up) / Math.cos(LADDERS.lean));
      }
    }
  }
  assert.deepEqual([...lanes].sort(), [0, 1], 'both lanes climbed');
  // The first man's pace while climbing clear of anyone above him: its pace along it, so much up.
  const first = men.find((man) => ups.get(man).length && ups.get(man)[0][0] === Math.min(...men.filter((each) => ups.get(each).length).map((each) => ups.get(each)[0][0])));
  const climbing = ups.get(first).filter(([, up]) => up > 0.2 && up < ladder.height - 0.2);
  const pace = (climbing.at(-1)[1] - climbing[0][1]) / (climbing.at(-1)[0] - climbing[0][0]);
  const rise = LADDERS.climb.pace * Math.cos(LADDERS.lean);
  assert.ok(Math.abs(pace - rise) < 0.05, `${pace.toFixed(2)} m/s up it (${rise.toFixed(2)})`);
  assert.ok(closest >= LADDERS.climb.spacing - 0.05, `a man a spacing below the man above in his lane (${closest.toFixed(2)} m of ladder)`);
  const onto = world.events.filter((event) => event.kind === 'ladder' && event.onto).map((event) => event.fighters[0]);
  assert.equal(new Set(onto).size, men.length, `all up onto the walk (${onto.length})`);
  assert.ok(Math.abs((first.lift ?? 0) - 4.5) < 0.05, 'standing on the walk');
});

/** How far (m) a point is from the nearest of a ladder's rungs (each a bar across it, LADDERS.rung apart along its rails). */
function offRung(ladder, at) {
  const length = Math.hypot(ladder.head[0] - ladder.foot[0], ladder.height, ladder.head[2] - ladder.foot[1]);
  const along = [(ladder.head[0] - ladder.foot[0]) / length, ladder.height / length, (ladder.head[2] - ladder.foot[1]) / length];
  const r = [at[0] - ladder.foot[0], at[1] - ladder.base, at[2] - ladder.foot[1]];
  const s = r[0] * along[0] + r[1] * along[1] + r[2] * along[2];
  const across = r[0] * ladder.u[0] + r[2] * ladder.u[1];
  const off = Math.hypot(r[0] - along[0] * s - ladder.u[0] * across, r[1] - along[1] * s, r[2] - along[2] * s - ladder.u[1] * across);
  const rung = Math.max(1, Math.round(s / LADDERS.rung)) * LADDERS.rung;
  return Math.hypot(s - rung, off);
}

test('on a ladder his feet and hands are on its rungs, a foot standing on one while the other comes up; he climbs from over its foot', () => {
  const { world } = wallWorld({ attackers: 2 });
  const ladder = world.siegeLadders[0];
  standLadder(world, ladder);
  // The second man starts under the ladder, by the wall: he gets on from there.
  const [first, under] = world.fighters.slice(1);
  placeOnFloor(under, 0.6, -0.4, 0, 0);
  const spec = LADDERS.climb;
  const feet = [];
  const hands = [];
  let footless = 0;
  let samples = 0;
  let worstOff = 0;
  const switched = { l: 0, r: 0 };
  const last = {};
  for (let t = 0; t < 30; t += 0.05) {
    advance(world, 0.05, toTheWall);
    for (const man of [first, under]) {
      const climbing = man.climbing;
      if (!climbing || man.state !== 'up') continue;
      // Never up off the ground beside it: his stance on his place on its line (over the balls of his feet) once he climbs.
      if (climbing.up > 0.05) {
        const [x, z] = ladderPlace(ladder, climbing.up, climbing.lane);
        worstOff = Math.max(worstOff, Math.hypot(x + ladder.out[0] * spec.heel - man.root[0], z + ladder.out[1] * spec.heel - man.root[1]));
      }
      if (climbing.up < 0.5 || climbing.up > ladder.height - 0.5) continue;
      samples += 1;
      const limbs = ladderLimbs(ladder, man);
      let standing = 0;
      for (const side of ['l', 'r']) {
        // The place it is set (its ankle, `heel` out from the rung and its ankle's height over it) and where it is.
        const foot = point(man.x, P[`${side}Foot`]);
        feet.push(offRung(ladder, foot));
        hands.push(offRung(ladder, point(man.x, P[`${side}Hand`])));
        const set = limbs[side].foot;
        // (Set on a rung, not on its way between two: the ball of the foot, `heel` in from its ankle, on it.)
        if (offRung(ladder, [set[0] - ladder.out[0] * spec.heel, set[1], set[2] - ladder.out[1] * spec.heel]) < 0.01) standing += 1;
        const rung = Math.round((set[1] - ladder.base) / (LADDERS.rung * Math.cos(LADDERS.lean)));
        if (man === first && last[side] !== undefined && rung !== last[side]) switched[side] += 1;
        if (man === first) last[side] = rung;
        assert.ok(foot[1] > ladder.base - 0.2, 'no foot through the ground');
      }
      if (standing === 0) footless += 1;
    }
  }
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const share = (values, within) => values.filter((value) => value < within).length / values.length;
  assert.ok(samples > 50, `watched on it (${samples})`);
  // A foot on its rung: its ankle the ball-to-ankle and the ankle's height from the rung (~0.13 m); before, a guard's stance
  // stood on the air at the stance's height, half the feet more than 0.2 m off any rung (median 0.21 m).
  assert.ok(median(feet) < 0.16, `feet on the rungs (median ${median(feet).toFixed(2)} m off one)`);
  assert.ok(share(feet, 0.2) > 0.75, `most of the time (${(share(feet, 0.2) * 100).toFixed(0)}% within 0.2 m)`);
  // His hands gripping rungs (before: a guard held before him, 7% of the time near a rung).
  assert.ok(median(hands) < 0.12, `hands on the rungs (median ${median(hands).toFixed(2)} m off one)`);
  assert.equal(footless, 0, 'a foot on a rung at every moment');
  assert.ok(switched.l > 2 && switched.r > 2, `each foot goes up rung by rung, by turns (${switched.l}, ${switched.r})`);
  // (Before he waited to be over its foot, the man from under it went up the air by the wall 1.2 m off his place.)
  assert.ok(worstOff < 0.3, `never climbing beside it (${worstOff.toFixed(2)} m off his place)`);
  assert.ok(world.events.some((event) => event.kind === 'ladder' && event.onto && event.fighters[0] === under.id), 'the man from under it up it and onto the walk');
});

test('the player is not put on a ladder as he passes its foot: he gets on walking at the wall, holds, and climbs back down', () => {
  const { world } = wallWorld({ attackers: 1 });
  const ladder = world.siegeLadders[0];
  standLadder(world, ladder);
  const man = world.fighters[1];
  man.player = true;
  const along = (z) => () => {
    man.goTo = [man.root[0], 0, z];
    man.move = 0.6;
  };
  // Along the wall across its foot: not on it.
  placeOnFloor(man, ladder.foot[0] + 0.2, -3, 0, 0);
  for (let t = 0; t < 4; t += 0.05) advance(world, 0.05, along(3));
  assert.ok(!man.climbing, 'walked past its foot');
  // Standing at its foot: not on it.
  placeOnFloor(man, ladder.foot[0] - 0.2, 0.3, 0, 0);
  for (let t = 0; t < 1; t += 0.05) advance(world, 0.05, () => { man.goTo = null; man.move = 0; });
  assert.ok(!man.climbing, 'stood at its foot');
  // At the wall: on it and up.
  for (let t = 0; t < 2; t += 0.05) advance(world, 0.05, () => { man.goTo = [4, 0, 0.3]; man.move = 0.6; });
  assert.ok(man.climbing, 'on it');
  const up = man.climbing.up;
  assert.ok(up > 0.3, `going up (${up.toFixed(2)} m)`);
  // Let go of the stick: he holds his rung.
  for (let t = 0; t < 1; t += 0.05) advance(world, 0.05, () => { man.goTo = null; man.move = 0; });
  assert.ok(man.climbing && Math.abs(man.climbing.up - up) < 0.05, 'holding');
  // Away from the wall: down, and off at its foot.
  for (let t = 0; t < 8 && man.climbing; t += 0.05) advance(world, 0.05, () => { man.goTo = [-6, 0, 0.3]; man.move = 0.6; });
  assert.ok(!man.climbing, 'off it at its foot');
  assert.equal(man.state, 'up', 'on his feet');
  assert.ok(point(man.x, P.pelvis)[1] < 1.3, 'on the ground');
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

  // The defender at its head, a man 1 m up it (climbing on while the push goes on, as far as his weight still lets one man
  // shove it at its 25° lean: physics/ladders.js statics): shoved off with him on it.
  const { world: second } = wallWorld({ attackers: 1, seed: 5 });
  const ladder2 = second.siegeLadders[0];
  standLadder(second, ladder2);
  const defender = second.fighters[0];
  defender.dormant = false;
  placeOnFloor(defender, walk[0] + 0.45, 0.3, 4.5, Math.PI);
  const climber = second.fighters[1];
  const [x2, z2] = ladderPlace(ladder2, 1);
  placeOnFloor(climber, x2, z2, 1, climber.yaw);
  boardLadder(second, climber, ladder2, 1);
  for (let t = 0; t < ladderPushSeconds(ladder2) + 0.3 && ladder2.up; t += 1 / 60) advance(second, 1 / 60, () => {});
  assert.equal(ladder2.up, false, 'pushed off');
  assert.equal(ladder2.pushedLoaded, 1, 'with a man on it');
  assert.equal(climber.climbing, null);
  assert.notEqual(climber.state, 'up', 'he goes over with it');
});

test('at its stair\'s slope a ladder is harder to push off: one man cannot shove it with a man at its top, two can', () => {
  const { world } = wallWorld({ attackers: 2 });
  const ladder = world.siegeLadders[0];
  standLadder(world, ladder);
  const man = world.fighters[1];
  const [x, z] = ladderPlace(ladder, ladder.height - 0.5);
  placeOnFloor(man, x, z, ladder.height - 0.5, man.yaw);
  boardLadder(world, man, ladder, ladder.height - 0.5);
  const { torque } = ladderLoad(world, ladder);
  assert.ok(torque > LADDERS.push * ladder.height, `one man's push short of it (${(torque / ladder.height).toFixed(0)} N needed)`);
  assert.ok(torque < LADDERS.pushers * LADDERS.push * ladder.height, 'two men\'s enough');
  // With the four-to-one rule's lean (14°), one man shoved it off with that man on it.
  const steep = Math.tan(Math.atan(0.25)) / Math.tan(LADDERS.lean);
  assert.ok(torque * steep < LADDERS.push * ladder.height, 'at 14° one man could');
  assert.ok(ladderPushSeconds(ladder) > 2, `the push takes its head out past the upright (${ladderPushSeconds(ladder).toFixed(1)} s)`);
});
