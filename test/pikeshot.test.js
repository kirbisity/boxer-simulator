// Pike and shot: guns fired from behind a thin rank of their own men, between the files (physics/ranged.js
// comradeInLane, FIRE_LANE), held for a comrade's body in the ball's path, held until the enemy is within the gun's
// effective range (formation.js DRILL.holdFire), and fired by ranks (formation.js volleyDue). Cerignola's and Qi
// Jiguang's lines drawn up close, the guns behind the pikes and the shields; Qi's idle guards gone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs, P, PRESETS } from '../src/body.js';
import { effectiveRange, laneFouled, thinkAll } from '../src/ai.js';
import { europeanSoldier, pikeman } from '../src/cast.js';
import { DRILL, volleyDue } from '../src/formation.js';
import { advance, createWorld, placeFighter, seededRandom } from '../src/physics.js';
import { battleOf } from '../src/scenarios.js';
import { MATCHLOCK } from '../src/weapons.js';
import { sightFrom } from '../src/physics/ranged.js';

/**
 * A rank of three pikes a metre apart (blue, at x = 4), a gun a metre behind them in the gap between two of their
 * files and another straight behind a pikeman, drilled to hold their fire; a man standing before them at `at` (x).
 */
function pikesAndShot(at = -5) {
  const random = seededRandom(3);
  const blue = [pikeman(random, 'landsknecht', 'pike'), pikeman(random, 'landsknecht', 'pike'), pikeman(random, 'landsknecht', 'pike'), europeanSoldier(random, 'arquebusier'), europeanSoldier(random, 'arquebusier')];
  const mark = normaliseInputs({ ...structuredClone(PRESETS.contender), sex: 'male', style: 'unskilled', accessories: [] });
  const entries = [...blue.map((inputs) => ({ inputs: normaliseInputs(inputs), corner: 'blue' })), { inputs: mark, corner: 'red' }];
  const layout = [[0, -1], [0, 0], [0, 1], [1, 0.5], [1, -1]];
  const world = createWorld(entries, { seed: 3, arena: { halfX: 20, halfZ: 8 }, formation: { blue: { front: 4, layout, drill: { advance: false, holdFire: true } } } });
  const red = world.fighters[5];
  placeFighter(red, at, 0);
  return { world, gap: world.fighters[3], behind: world.fighters[4], pikes: world.fighters.slice(0, 3), red };
}

/** Shots fired in `seconds` with the mark standing still (not thought for), the rest thinking. */
function fight(world, red, seconds) {
  const from = world.events.length;
  for (let t = 0; t < seconds; t += 0.05) advance(world, 0.05, (current, dt) => thinkAll(current, dt, new Set([red.id])));
  return world.events.slice(from).filter((event) => event.kind === 'shot');
}

test('a gun behind a thin rank of his own fires between their files: the lane past their shoulders is clear, and his ball goes by them', () => {
  const { world, gap, red } = pikesAndShot();
  advance(world, 0.3, (current, dt) => thinkAll(current, dt, new Set([red.id])));
  assert.equal(laneFouled(world, gap, red), null, 'the gap between two files is a clear lane');
  const shots = fight(world, red, 8);
  assert.ok(shots.some((shot) => shot.attacker === gap.id), 'he fires from behind the pikes');
  assert.ok(shots.every((shot) => shot.defender === undefined || world.fighters[shot.defender].corner === 'red'), 'no ball into his own');
});

test('a gun with a comrade\'s body in his ball\'s path holds his fire, and leans out of his place for a lane', () => {
  const { world, behind, pikes, red } = pikesAndShot();
  // His man 10 m off on the line from his gun shoulder over the head of the pikeman before him, from the first.
  const from = sightFrom(behind);
  const head = [pikes[0].x[P.head * 3], pikes[0].x[P.head * 3 + 2]];
  const way = [head[0] - from[0], head[1] - from[2]];
  const length = Math.hypot(way[0], way[1]);
  placeFighter(red, from[0] + (way[0] / length) * 10, from[2] + (way[1] / length) * 10);
  assert.equal(laneFouled(world, behind, red)?.fighter, pikes[0], 'the pikeman before him is in his lane');
  // Each time he lays his gun on, his lane is clear: never with the pikeman in it; to find it, he leans out of his place.
  const from0 = world.events.length;
  const aims = [];
  for (let t = 0; t < 8; t += 0.05) {
    const was = behind.punch;
    advance(world, 0.05, (current, dt) => thinkAll(current, dt, new Set([red.id])));
    if (behind.punch && behind.punch !== was) aims.push({ lean: behind.lean ?? 0, fouled: laneFouled(world, behind, red) });
  }
  assert.ok(aims.every((aim) => aim.fouled === null), 'he lays on only down a clear lane');
  assert.ok(aims.length === 0 || Math.abs(aims[0].lean) > 0.1, `he leaned out for it (${aims.map((aim) => aim.lean.toFixed(2)).join(', ')} m)`);
  assert.ok(aims.length > 0 || Math.abs(behind.lean ?? 0) > 0.1, 'or leans and waits');
  const shots = world.events.slice(from0).filter((event) => event.kind === 'shot' && event.attacker === behind.id);
  assert.ok(shots.every((shot) => shot.defender === undefined || world.fighters[shot.defender].corner === 'red'), 'no ball into his own');
});

test('drilled guns hold their fire until the enemy is within the gun\'s effective range (half a man\'s breadth to one deviation of its spread)', () => {
  assert.ok(Math.abs(effectiveRange({ spec: { shot: MATCHLOCK } }) - DRILL.holdFire.halfBreadth / MATCHLOCK.spread) < 1e-9);
  assert.ok(effectiveRange({ spec: { shot: MATCHLOCK } }) > 10 && effectiveRange({ spec: { shot: MATCHLOCK } }) < 20, 'a matchlock: some 14 m');
  const { world, gap, red } = pikesAndShot(-16);
  assert.equal(fight(world, red, 6).length, 0, 'at 21 m: held');
  placeFighter(red, -5, 0);
  assert.ok(fight(world, red, 6).some((shot) => shot.attacker === gap.id), 'at 10 m: fired');
});

test('guns in two ranks fire by ranks: one rank in its window, the other a reload over the ranks later', () => {
  const level = battleOf('qiJiguang');
  const sides = level.cast(seededRandom(2));
  const world = createWorld(['red', 'blue'].flatMap((corner) => sides[corner].map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner }))), { seed: 2, arena: level.arena, formation: level.formation });
  const formation = world.formations.blue;
  const guns = world.fighters.filter((fighter) => fighter.style === 'matchlock');
  const aheads = guns.map((gun) => gun.slot.ahead);
  const first = guns.filter((gun) => gun.slot.ahead > (Math.max(...aheads) + Math.min(...aheads)) / 2);
  const second = guns.filter((gun) => !first.includes(gun));
  assert.equal(first.length, 4);
  assert.equal(second.length, 2);
  world.time = 10;
  assert.ok(volleyDue(world, formation, first[0]), 'the first rank given the word');
  assert.ok(volleyDue(world, formation, first[1]), 'and its other men with it');
  assert.ok(!volleyDue(world, formation, second[0]), 'not the second rank in the first\'s window');
  world.time = 10 + DRILL.volleyWindow + 0.1;
  assert.ok(!volleyDue(world, formation, second[0]), 'nor before its turn');
  world.time = 10 + MATCHLOCK.reloadSeconds / 2 + 0.1;
  assert.ok(volleyDue(world, formation, second[0]), 'the second rank, a reload over two ranks later');
  assert.ok(!volleyDue(world, formation, first[0]), 'the first rank loading');
});

test('Cerignola and Qi Jiguang\'s lines drawn up close, the guns behind a thin rank of pikes or shields, in the gaps between their files', () => {
  for (const key of ['cerignola', 'qiJiguang']) {
    const level = battleOf(key);
    const sides = level.cast(seededRandom(4));
    const world = createWorld(['red', 'blue'].flatMap((corner) => sides[corner].map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner }))), { seed: 4, arena: level.arena, formation: level.formation });
    const men = world.fighters.filter((fighter) => fighter.corner === 'blue');
    const guns = men.filter((fighter) => fighter.style === 'matchlock');
    const front = Math.max(...men.map((fighter) => fighter.slot.ahead));
    const frontRank = men.filter((fighter) => fighter.slot.ahead > front - DRILL.frontDepth);
    assert.ok(frontRank.every((fighter) => fighter.style !== 'matchlock'), `${key}: no gun in the front rank`);
    for (const gun of guns) {
      assert.ok(front - gun.slot.ahead < 3, `${key}: each gun close behind the front`);
      const nearest = Math.min(...frontRank.map((fighter) => Math.abs(fighter.slot.across - gun.slot.across)));
      assert.ok(nearest > 0.3, `${key}: in a gap between the front rank's files (${nearest.toFixed(2)} m off the nearest)`);
    }
    // Close order: the front rank's men no more than a metre apart.
    const across = frontRank.map((fighter) => fighter.slot.across).sort((a, b) => a - b);
    const spacing = Math.min(...across.slice(1).map((value, index) => value - across[index]));
    assert.ok(spacing <= 1.05, `${key}: shoulder to shoulder (${spacing.toFixed(2)} m)`);
    // The foremost gun of every file of guns has a clear lane at a man 12 m straight before him, from his place or
    // leaning out of it (DRILL.lean: past a shield held out on its bearer's arm); those behind him in his file come up
    // to fire in his place (the countermarch).
    const mark = world.fighters.find((fighter) => fighter.corner === 'red' && !fighter.mount);
    const foremost = guns.filter((gun) => !guns.some((other) => Math.abs(other.slot.across - gun.slot.across) < DRILL.file && other.slot.ahead > gun.slot.ahead));
    assert.ok(foremost.length >= 4, `${key}: files of guns side by side`);
    for (const gun of foremost) {
      const [x, z] = [gun.x[P.pelvis * 3], gun.x[P.pelvis * 3 + 2]];
      const clear = [0, -0.15, 0.15, -DRILL.lean, DRILL.lean].some((lean) => {
        placeFighter(gun, x, z + lean);
        placeFighter(mark, x - 12, z);
        return laneFouled(world, gun, mark) === null;
      });
      placeFighter(gun, x, z);
      assert.ok(clear, `${key}: gun ${gun.id} has a lane`);
    }
  }
});

test('Qi Jiguang\'s level: his squads only, the idle guards (and the general\'s figure with them) gone from behind the squads', () => {
  const level = battleOf('qiJiguang');
  const { blue } = level.cast(seededRandom(2));
  assert.equal(blue.length, 24, 'two squads of twelve');
  assert.ok(blue.every((man) => man.outfit.kind === 'mingBrigandine'), 'none in the elite\'s lamellar');
  assert.ok(!level.roster.en.includes('guards'));
  const backs = level.formation.blue.layout.map(([back]) => back);
  assert.ok(Math.max(...backs) < 3, 'nobody standing idle far behind the squads');
});
