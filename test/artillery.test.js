// Artillery, cover and scaling ladders (physics/artillery.js, physics/cover.js, physics/ladders.js): a ball through a
// file of men leaves energy in each and goes on with less; canister opens in a cone; a stone parapet stops a ball, an
// arrow and a matchlock's shot while a daub screen stops an arrow and only slows a ball; a ladder whose head nobody holds
// is pushed off by a defender at it, its men falling, and raised again; a folangji fires as fast as its chambers are
// swapped, then as fast as they are charged; a man behind a parapet is less exposed than one before it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { mingSoldier, sengokuWarrior } from '../src/cast.js';
import { advance, createWorld, placeFighter, placeOnFloor, point, seededRandom } from '../src/physics.js';
import { reliefAt, worksOf } from '../src/physics/fieldworks.js';
import { ARTILLERY, firePiece, tissueLoss } from '../src/physics/artillery.js';
import { COVER, exposureOf, screenOnPath } from '../src/physics/cover.js';
import { boardLadder, LADDERS, ladderLoad, ladderPlace, ladderPushSeconds, standLadder, stepLadders } from '../src/physics/ladders.js';
import { wallWorks } from '../src/story/ground/walls.js';
import { ARROW, MATCHLOCK } from '../src/weapons.js';

const still = () => {};

/** A man stood at (x, z) on the works' ground there (on a rampart, its height). */
const stand = (world, fighter, x, z) => placeOnFloor(fighter, x, z, reliefAt(worksOf(world.arena), x, z), fighter.yaw);

/** Ming gunners at x = -12 and a file of Japanese ashigaru standing one behind another along +x. */
function file(count, { seed = 1, kind = 'folangji', spacing = 1.2, works = null } = {}) {
  const random = seededRandom(seed);
  const men = [{ inputs: mingSoldier(random, 'dao', 'brigandine'), corner: 'red' }, { inputs: mingSoldier(random, 'dao', 'brigandine'), corner: 'red' }];
  for (let k = 0; k < count; k += 1) men.push({ inputs: sengokuWarrior(random, { tint: {} }, 'yari', 'ashigaru'), corner: 'blue' });
  const world = createWorld(men, { seed, arena: { halfX: 40, halfZ: 12, ...(works ? { works } : {}) }, artillery: [{ kind, at: [-12, 0], facing: [1, 0], crew: [0, 1], load: 'ball' }] });
  placeFighter(world.fighters[0], -13, -0.8);
  placeFighter(world.fighters[1], -13, 0.8);
  for (let k = 0; k < count; k += 1) placeFighter(world.fighters[2 + k], k * spacing, 0);
  return world;
}

test('tissue drag: a ball keeps exp(-ρ Cd A L / m) of its energy, a heavy ball the more', () => {
  const light = tissueLoss(0.025, 2.05e-4, 1000, 0.25);
  const heavy = tissueLoss(5, 9e-3, 270000, 0.25);
  assert.ok(Math.abs(light.kept - Math.exp(-1060 * 0.47 * 2.05e-4 * 0.25 / 0.025)) < 1e-9);
  assert.ok(light.kept < 0.5, `a musket ball loses most of itself in a torso (${light.kept.toFixed(2)} kept)`);
  assert.ok(heavy.kept > 0.75, `a great gun's ball keeps most (${heavy.kept.toFixed(2)} kept)`);
});

test('a ball fired down a file goes through man after man, losing energy at each, and kills them', () => {
  const world = file(5);
  const piece = world.artillery.pieces[0];
  piece.mark = point(world.fighters[2].x, P.neck);
  piece.bearing = 0;
  piece.elevation = Math.atan2(piece.mark[1] - (ARTILLERY.pieces.folangji.muzzleUp), 12);
  firePiece(world, piece, world.fighters[0], 'ball');
  advance(world, 0.3, still);
  const hits = world.events.filter((event) => event.kind === 'shot' && event.gun);
  assert.ok(hits.length >= 2, `it went through more than one man (${hits.length})`);
  // Each man it went on from, it went on from with less.
  for (let k = 1; k < hits.length; k += 1) assert.ok(hits[k].deposited > 0 && hits[k].kept < 1, 'energy left in each');
  const energies = hits.map((event) => event.energy);
  for (let k = 1; k < energies.length; k += 1) assert.ok(energies[k] < energies[k - 1], `less energy into each next man (${energies.map((e) => Math.round(e)).join(' > ')})`);
  assert.ok(world.fighters.slice(2).filter((fighter) => fighter.state === 'out').length >= 1, 'the first man is down');
  assert.equal(piece.seated, false, 'its chamber is spent');
});

test('canister opens in a cone: its balls spread across the file, more men hit across it than by one ball', () => {
  const random = seededRandom(4);
  const men = [{ inputs: mingSoldier(random, 'dao', 'brigandine'), corner: 'red' }];
  // A rank across the line, 15 m out.
  for (let k = 0; k < 9; k += 1) men.push({ inputs: sengokuWarrior(random, { tint: {} }, 'yari', 'ashigaru'), corner: 'blue' });
  const world = createWorld(men, { seed: 4, arena: { halfX: 40, halfZ: 12 }, artillery: [{ kind: 'folangji', at: [-12, 0], facing: [1, 0], crew: [0], load: 'canister' }] });
  placeFighter(world.fighters[0], -13, 0);
  for (let k = 0; k < 9; k += 1) placeFighter(world.fighters[1 + k], 3, (k - 4) * 0.8);
  const piece = world.artillery.pieces[0];
  piece.mark = point(world.fighters[5].x, P.neck);
  piece.elevation = Math.atan2(piece.mark[1] - ARTILLERY.pieces.folangji.muzzleUp, 15);
  firePiece(world, piece, world.fighters[0]);
  const balls = world.artillery.balls;
  assert.equal(balls.length, ARTILLERY.pieces.folangji.canister.pellets);
  const across = balls.map((ball) => Math.atan2(ball.v[2], ball.v[0]));
  const sd = Math.sqrt(across.reduce((sum, value) => sum + value * value, 0) / across.length);
  assert.ok(sd > 0.6 * ARTILLERY.pieces.folangji.canister.cone && sd < 1.6 * ARTILLERY.pieces.folangji.canister.cone, `its cone (${sd.toFixed(3)} rad)`);
  advance(world, 0.3, still);
  const struck = new Set(world.events.filter((event) => event.kind === 'shot' && event.gun).map((event) => event.defender));
  assert.ok(struck.size >= 3, `several men of the rank struck (${struck.size})`);
});

test('a stone parapet stops a ball, an arrow and a matchlock ball; a daub screen stops an arrow but not a ball', () => {
  const { works } = wallWorks({ x: 1, z: [-9, 9], height: 4.5, ladders: [0] });
  const random = seededRandom(1);
  const world = createWorld([{ inputs: mingSoldier(random, 'dao'), corner: 'red' }], { seed: 1, arena: { halfX: 15, halfZ: 9, works } });
  // From the field below to a man's chest on the walk: into the parapet.
  const from = [-10, 1.4, 3];
  const chest = [1.8, 5.8 - 0.5, 3];
  const folangji = ARTILLERY.pieces.folangji;
  const ballArea = Math.PI * Math.cbrt((3 * folangji.ballKg) / (4 * Math.PI * ARTILLERY.iron)) ** 2;
  for (const missile of [{ area: ballArea, joules: 0.5 * folangji.ballKg * folangji.velocity ** 2 }, { area: COVER.arrowArea, joules: ARROW.joules }, { area: COVER.ballArea, joules: MATCHLOCK.energy }]) {
    const screen = screenOnPath(world, from, chest, missile);
    assert.ok(screen?.stops, `stopped by the stone (${missile.joules} J against ${Math.round(screen?.cost ?? 0)})`);
  }
  // His head over the parapet: clear.
  assert.equal(screenOnPath(world, from, [1.8, 6.3, 3], { area: COVER.ballArea, joules: MATCHLOCK.energy }), null);
  // Under the walk in the ladder's gap the face is still stone; above the walk, the gap is open (the crenel).
  assert.ok(screenOnPath(world, [-5, 2, 0], [3, 2, 0], { area: COVER.ballArea, joules: MATCHLOCK.energy })?.stops);
  const daub = { walls: [{ points: [[0, -5], [0, 5]], height: 1.5, kind: 'palisade', cover: { material: 'earth', thick: 0.1 } }] };
  const field = createWorld([{ inputs: mingSoldier(random, 'dao'), corner: 'red' }], { seed: 1, arena: { halfX: 15, halfZ: 9, works: daub } });
  assert.ok(screenOnPath(field, [-8, 1.2, 0], [8, 1.2, 0], { area: COVER.arrowArea, joules: ARROW.joules }).stops, 'an arrow stops in the daub');
  const ball = screenOnPath(field, [-8, 1.2, 0], [8, 1.2, 0], { area: COVER.ballArea, joules: MATCHLOCK.energy });
  assert.ok(!ball.stops && ball.left < MATCHLOCK.energy && ball.left > 0.5 * MATCHLOCK.energy, `a ball comes through slower (${Math.round(ball.left)} J)`);
  // A palisade of rails (no cover) stops nothing.
  const rails = createWorld([{ inputs: mingSoldier(random, 'dao'), corner: 'red' }], { seed: 1, arena: { halfX: 15, halfZ: 9, works: { walls: [{ points: [[0, -5], [0, 5]], height: 1.8, kind: 'palisade' }] } } });
  assert.equal(screenOnPath(rails, [-8, 1.2, 0], [8, 1.2, 0], { area: COVER.arrowArea, joules: ARROW.joules }), null);
});

test('a man behind the parapet is less exposed to the enemy than one in the open before it', () => {
  const { works, walk } = wallWorks({ x: 1, z: [-9, 9], height: 4.5, ladders: [0] });
  const random = seededRandom(2);
  const men = [
    { inputs: sengokuWarrior(random, { tint: {} }, 'matchlock', 'ashigaru'), corner: 'blue' },
    ...Array.from({ length: 4 }, () => ({ inputs: mingSoldier(random, 'matchlock'), corner: 'red' })),
  ];
  const world = createWorld(men, { seed: 2, arena: { halfX: 15, halfZ: 9, works } });
  stand(world, world.fighters[0], walk[0] + 0.5, 4);
  for (let k = 0; k < 4; k += 1) placeFighter(world.fighters[1 + k], -13.5, -3 + 2 * k);
  advance(world, 0.5, still);
  const behind = exposureOf(world, world.fighters[0]);
  const open = exposureOf(world, world.fighters[1]);
  assert.ok(behind < 0.6, `behind the parapet (${behind.toFixed(2)})`);
  assert.ok(open > behind, `in the open (${open.toFixed(2)}) more than behind it`);
});

/** A wall with one ladder, a defender on the walk (at its head, or along the walk) and attackers at its foot. */
function ladderWorld({ seed = 3, climbers = 1, atHead = false, defenderAt = 0.3 } = {}) {
  const { works, walk } = wallWorks({ x: 1, z: [-9, 9], height: 4.5, ladders: [0] });
  const random = seededRandom(seed);
  const men = [{ inputs: sengokuWarrior(random, { tint: {} }, 'yari', 'ashigaru'), corner: 'blue' }];
  for (let k = 0; k < climbers + 2 + (atHead ? 1 : 0); k += 1) men.push({ inputs: mingSoldier(random, 'dao'), corner: 'red' });
  const world = createWorld(men, { seed, arena: { halfX: 15, halfZ: 9, works } });
  stand(world, world.fighters[0], walk[0] + 0.45, defenderAt);
  // Two at the foot, out from it; the climbers in its line behind them.
  stand(world, world.fighters[1], -0.8, -0.7);
  stand(world, world.fighters[2], -0.8, 0.7);
  for (let k = 0; k < climbers; k += 1) stand(world, world.fighters[3 + k], 0.5 - 0.7 * k, 0);
  if (atHead) stand(world, world.fighters[3 + climbers], walk[0] + 0.15, -0.3);
  return { world, walk };
}

/** The ladder stood against the wall, and climbers on it, `up` m above its foot each (on its rungs there). */
function onLadder(world, ids, ups) {
  const ladder = world.siegeLadders[0];
  if (!ladder.up) standLadder(world, ladder);
  ids.forEach((id, k) => {
    const fighter = world.fighters[id];
    const [x, z] = ladderPlace(ladder, ups[k]);
    placeOnFloor(fighter, x, z, ups[k], fighter.yaw);
    boardLadder(world, fighter, ladder, ups[k]);
  });
}

test('a ladder: its load is its own and its climbers weight about its foot; pushed off with nobody at its head, its man falls; raised again', () => {
  const { world } = ladderWorld({ climbers: 1 });
  const ladder = world.siegeLadders[0];
  assert.equal(ladder.attackers, 'red');
  const climber = world.fighters[3];
  onLadder(world, [3], [2.5]);
  const load = ladderLoad(world, ladder);
  assert.equal(load.climbers.length, 1, 'the man on the face is on it');
  assert.ok(load.torque < LADDERS.push * ladder.height, 'one man can shove it with one man on it');
  for (let t = 0; t < ladderPushSeconds(ladder) + 0.2 && ladder.up; t += 1 / 60) stepLadders(world, 1 / 60);
  assert.equal(ladder.up, false, 'pushed off');
  assert.equal(ladder.pushedOff, 1);
  assert.equal(climber.state, 'down', 'the man on it falls with it');
  const fell = world.events.find((event) => event.kind === 'ladder' && !event.up);
  assert.deepEqual(fell.fighters, [climber.id]);
  // Out from the face, he falls to the ground at the wall's foot, hurt by it.
  assert.ok(point(climber.x, P.pelvis)[0] < 1, 'out from the face');
  const hurt = () => Object.values(climber.damage).reduce((sum, value) => sum + value, 0);
  const before = hurt();
  advance(world, 2, still);
  assert.ok(point(climber.x, P.pelvis)[1] < 0.6, `on the ground (${point(climber.x, P.pelvis)[1].toFixed(2)})`);
  assert.ok(hurt() > before || climber.state === 'out', `hurt by the fall (${before.toFixed(3)} → ${hurt().toFixed(3)})`);
  // The gap is shut while it lies.
  assert.equal(world.worksState.closed.length, 1);
  // Raised by the two at its foot.
  world.fighters[0].state = 'out';
  for (let t = 0; t < LADDERS.raiseSeconds + 1; t += 0.1) stepLadders(world, 0.1);
  assert.equal(ladder.up, true, 'raised again');
  assert.equal(world.worksState.closed.length, 0);
});

test('a ladder held at its head by an attacker is not pushed off; one too heavy for the push stands', () => {
  const { world: held } = ladderWorld({ climbers: 1, atHead: true });
  onLadder(held, [3], [2]);
  for (let t = 0; t < 3; t += 0.1) stepLadders(held, 0.1);
  assert.equal(held.siegeLadders[0].up, true, 'held');
  const { world: heavy } = ladderWorld({ climbers: 3 });
  onLadder(heavy, [3, 4, 5], [1, 2, 3]);
  const ladder = heavy.siegeLadders[0];
  // (Make his push the less: a man's push under what the load asks of it.)
  const load = ladderLoad(heavy, ladder);
  assert.equal(load.climbers.length, 3);
  assert.ok(load.torque > ladderLoad(held, held.siegeLadders[0]).torque, 'three men weigh it to the wall more than one');
  const saved = LADDERS.push;
  LADDERS.push = (load.torque / ladder.height) * 0.9;
  try {
    for (let t = 0; t < 3; t += 0.1) stepLadders(heavy, 0.1);
    assert.equal(ladder.up, true, 'too heavy to shove');
  } finally {
    LADDERS.push = saved;
  }
});

test('a folangji fires as fast as its chambers are swapped, then as they are charged', () => {
  const world = file(0, { kind: 'folangji' });
  const piece = world.artillery.pieces[0];
  const spec = ARTILLERY.pieces.folangji;
  // Laid on a fixed mark down the field (no man there), its two men kept at their posts; its shots over 70 s.
  const times = [];
  for (let t = 0; t < 70; t += 0.05) {
    piece.pickIn = Infinity;
    piece.mark = [10, 1, 0];
    advance(world, 0.05, (current) => {
      for (const id of piece.crew) placeFighter(current.fighters[id], -12.9, id === 0 ? -0.8 : 0.8);
    });
    if (piece.firedAt > (times.at(-1) ?? -1)) times.push(piece.firedAt);
  }
  assert.ok(times.length > spec.chambers, `its five chambers fired, and more once charged again (${times.length})`);
  const gaps = times.slice(1).map((time, k) => time - times[k]);
  // While charged chambers wait: a swap between shots. Once they are spent: as fast as the loader charges them.
  for (const gap of gaps.slice(0, spec.chambers - 1)) assert.ok(Math.abs(gap - spec.swapSeconds) < 0.5, `${spec.swapSeconds} s apart (${gaps.map((each) => each.toFixed(1)).join(', ')})`);
  assert.ok(Math.max(...gaps) > spec.chargeSeconds - spec.swapSeconds - 1, `then the charging rules (${gaps.map((each) => each.toFixed(1)).join(', ')})`);
});
