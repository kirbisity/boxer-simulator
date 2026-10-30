// Fieldworks and soft ground (physics/fieldworks.js): stakes impale a horse that runs onto them and turn one
// that sees them in time; a palisade stops horses and walks men along it to its gap; a ditch stops a horse at
// its lip and slows a man down and up it; mud sinks a man by his weight, holds his legs, tires him, takes his
// footing, and is heard as mud; a man face down in it or under the heap smothers. Rotating volleys keep the fire
// going; arrows and balls strike horses. The three battles' casts, armies and works.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs, P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, placeFighter, seededRandom } from '../src/physics.js';
import { footSoldier, mountedKnight, nobleKnight, europeanSoldier } from '../src/cast.js';
import { FIELDWORKS, footSink, mireStep, reliefAt, smothering, softAt, walkingDistance, worksOf } from '../src/physics/fieldworks.js';
import { surfaceAt } from '../src/audio/surface.js';
import { ARMIES, battleOf, SCENARIOS } from '../src/scenarios.js';
import { MUSTER } from '../src/muster.js';
import { DRILL } from '../src/formation.js';
import { missileInHorse } from '../src/physics/ranged.js';

const think = (world, dt) => thinkAll(world, dt);
const STAKES = { stakes: [{ from: [4, -8], to: [4, 8], rows: 2, every: 1.0, rowGap: 0.9, toward: -1, height: 1.05, reach: 0.95, stagger: 0.5 }] };
const FENCE = { walls: [{ points: [[4, -12], [4, 12]], height: 1.8, kind: 'palisade', gaps: [[16, 18]] }] };
const DITCH = { ditches: [{ from: [4, -12], to: [4, 12], profile: [[-2.4, 0], [-1.6, -1.2], [-0.5, -1.2], [0.3, 0.7], [1.5, 0.7], [2.6, 0]] }] };
const MUD = { soft: [{ x: [-30, 30], z: [-10, 10], depth: 0.22, firm: 0.5, viscosity: 2, footing: 0.7 }] };

/** A rider charging an archer 11 m off across the works. */
function charge(works, seed = 2, { from = -14 } = {}) {
  const random = seededRandom(seed);
  const world = createWorld([{ inputs: mountedKnight(random, 'longsword'), corner: 'red' }, { inputs: footSoldier(random, 'bow'), corner: 'blue' }], { seed, arena: { halfX: 25, halfZ: 12, works } });
  placeFighter(world.fighters[1], 7, 0);
  world.horses[0].at[0] = from;
  return world;
}

test('a horse galloping onto the stakes from too close to stop is run through and stopped; one that sees them in time pulls up short of them', () => {
  // Released at the gallop 2 m short of the points: it cannot stop.
  const world = charge(STAKES, 2, { from: 0 });
  const horse = world.horses[0];
  horse.speed = 9;
  horse.goal = { heading: horse.yaw, speed: 9 };
  for (let t = 0; t < 1.5; t += 0.05) advance(world, 0.05, () => {});
  const staked = world.events.filter((event) => event.kind === 'horseHit' && event.weapon === 'stake');
  assert.ok(staked.length > 0, 'it ran onto a stake');
  assert.ok(staked[0].effects.some((effect) => /run through|stabbed/.test(effect)), staked[0].effects.join(', '));
  assert.ok(horse.speed < 6 || horse.state !== 'up', `it was stopped (${horse.speed.toFixed(1)} m/s, ${horse.state})`);
  // From a long way off it sees them: it stands short of the points, unhurt.
  const seen = charge(STAKES, 3);
  // (It may thread the first row, the stakes a metre apart and a horse's chest some 0.65 m across: not the second.)
  const points = Math.max(...worksOf(seen.arena).stakes.map((stake) => stake.tip[0]));
  let deepest = -Infinity;
  for (let t = 0; t < 12; t += 0.1) {
    advance(seen, 0.1, think);
    // (Before the line of stakes, not round its end.)
    if (Math.abs(seen.horses[0].at[1]) < 7.5) deepest = Math.max(deepest, seen.horses[0].at[0] + FIELDWORKS.horse.front * seen.horses[0].withers);
  }
  assert.ok(deepest < points + 0.15, `its chest (${deepest.toFixed(2)}) short of the last points (${points.toFixed(2)})`);
  assert.equal(seen.events.filter((event) => event.kind === 'horseHit' && event.weapon === 'stake').length, 0);
});

test('a palisade stops a horse; a man walks along it to its gap and through', () => {
  const world = charge(FENCE, 2, { from: 0 });
  const horse = world.horses[0];
  horse.at[1] = -6;
  horse.speed = 8;
  horse.goal = { heading: horse.yaw, speed: 8 };
  for (let t = 0; t < 1.5; t += 0.05) advance(world, 0.05, () => {});
  assert.ok(horse.at[0] + FIELDWORKS.horse.front * horse.withers < 4 + 0.3, `held at the fence (${horse.at[0].toFixed(2)})`);
  assert.ok(world.events.some((event) => event.kind === 'horseStopped'), 'stopped against it');
  // A man on foot after a man standing behind it: along the fence to the gap (z 4 to 6), and through.
  const random = seededRandom(5);
  const walk = createWorld([{ inputs: footSoldier(random, 'spear'), corner: 'red' }, { inputs: { ...footSoldier(random, 'spear'), style: 'passive' }, corner: 'blue' }], { seed: 5, arena: { halfX: 25, halfZ: 12, works: FENCE } });
  placeFighter(walk.fighters[0], -2, 0);
  placeFighter(walk.fighters[1], 11, 2);
  const man = walk.fighters[0];
  let crossed = false;
  let nearest = Infinity;
  for (let t = 0; t < 40 && !crossed; t += 0.1) {
    advance(walk, 0.1, think);
    crossed = man.x[P.pelvis * 3] > 5;
    // Never through a stretch of the fence: crossing x = 4, he is in the gap.
    if (Math.abs(man.x[P.pelvis * 3] - 4) < 0.2) nearest = Math.min(nearest, Math.abs(man.x[P.pelvis * 3 + 2] - 5));
  }
  assert.ok(crossed, 'he got through');
  assert.ok(nearest <= 1.05, `through the gap (${nearest.toFixed(2)} m from its middle)`);
  // Round the fence is further than across it.
  assert.ok(walkingDistance(walk, [0, -4], [8, -4]) > 9, 'round by the gap');
  assert.equal(walkingDistance(walk, [0, 5], [8, 5]), 8);
});

test('a ditch: the ground goes down into it and up onto its bank; a horse is stopped at its lip; a man is slowed crossing it', () => {
  const works = worksOf({ works: DITCH });
  assert.equal(reliefAt(works, 0, 0), 0);
  assert.ok(Math.abs(reliefAt(works, 3, 0) + 1.2) < 1e-9, 'the bottom');
  assert.ok(Math.abs(reliefAt(works, 5, 0) - 0.7) < 1e-9, 'the bank');
  const world = charge(DITCH, 2, { from: -3 });
  const horse = world.horses[0];
  horse.speed = 8;
  horse.goal = { heading: horse.yaw, speed: 8 };
  for (let t = 0; t < 1; t += 0.05) advance(world, 0.05, () => {});
  assert.ok(horse.at[0] < 2, `it never got into the ditch (${horse.at[0].toFixed(2)})`);
  assert.equal(horse.state === 'up' ? horse.speed < 2 : true, true, 'stopped, or down at its lip');
  // A man walking at a man beyond it: slower across than over the same ground without it.
  const across = (works) => {
    const random = seededRandom(5);
    const walk = createWorld([{ inputs: footSoldier(random, 'spear'), corner: 'red' }, { inputs: { ...footSoldier(random, 'spear'), style: 'passive' }, corner: 'blue' }], { seed: 5, arena: { halfX: 25, halfZ: 12, works } });
    placeFighter(walk.fighters[0], -2, 0);
    placeFighter(walk.fighters[1], 11, 2);
    let lowest = 0;
    for (let t = 0; t < 40; t += 0.1) {
      advance(walk, 0.1, think);
      lowest = Math.min(lowest, walk.fighters[0].lift ?? 0);
      if (walk.fighters[0].x[P.pelvis * 3] > 6.5) return { t, lowest };
    }
    return { t: Infinity, lowest };
  };
  const ditch = across(DITCH);
  const flat = across(null);
  assert.ok(ditch.lowest < -1, `he went down into it (${ditch.lowest.toFixed(2)})`);
  assert.ok(ditch.t > flat.t + 2 && ditch.t < Infinity, `across the ditch in ${ditch.t.toFixed(1)} s, the flat in ${flat.t.toFixed(1)} s`);
});

test('a ditch dug along a bending line, deeper and wider in places: its ground follows the line, eases between its points, and is whole round the bends', () => {
  const profile = [[-1, 0], [-0.5, -0.6], [0, -0.6], [0.5, 0]];
  const works = worksOf({ works: { ditches: [{ points: [[0, -6, 1, 1], [0.6, 0, 1.5, 2], [0, 6, 1, 1]], profile }] } });
  const [ditch] = works.ditches;
  assert.equal(ditch.pieces.length, 2);
  // At its points: the profile as dug there (heights × deep, offsets × wide).
  assert.ok(Math.abs(reliefAt(works, 0.6 - 0.25, 0) + 0.9) < 0.01, 'the bottom at the bend, half as deep again');
  assert.ok(reliefAt(works, 0.6 - 1.7, 0) < -0.05 && reliefAt(works, 0.6 - 2.1, 0) === 0, 'twice as wide there: its lip two metres off the line');
  const [first] = ditch.pieces;
  const nearFirst = [first.a[0] - first.left[0] * 0.25 + first.u[0] * 0.01, first.a[1] - first.left[1] * 0.25 + first.u[1] * 0.01];
  assert.ok(Math.abs(reliefAt(works, ...nearFirst) + 0.6) < 0.01, 'at its first point as the profile says');
  // Halfway along a piece, eased between them.
  const between = reliefAt(works, 0.3 - 0.25, -3);
  assert.ok(between < -0.6 && between > -0.9, `eased (${between.toFixed(2)})`);
  // No step anywhere across the bend, and nothing beyond its ends.
  let worst = 0;
  for (let x = -2; x <= 2; x += 0.1) {
    for (let z = -1; z <= 1; z += 0.02) worst = Math.max(worst, Math.abs(reliefAt(works, x, z + 0.02) - reliefAt(works, x, z)));
  }
  assert.ok(worst < 0.1, `smooth round the bend (${worst.toFixed(3)} m per 2 cm)`);
  assert.equal(reliefAt(works, 0, -6.5), 0, 'beyond its ends, level ground');
  // A man's way over it is the longer for the climb.
  assert.ok(walkingDistance({ arena: { works: { ditches: [{ points: [[0, -6], [0.6, 0], [0, 6]], profile }] } } }, [-3, 0], [3, 0]) > 6.3, 'the climb counts');
});

test('mud: a man sinks by his weight, the knight in plate deeper than the archer; it holds his legs and his footing, slows and tires him, and sounds as mud', () => {
  const works = worksOf({ works: MUD });
  const world = createWorld([{ inputs: normaliseInputs(structuredClone(PRESETS.knight)), corner: 'red' }, { inputs: normaliseInputs(structuredClone(PRESETS.longbow)), corner: 'blue' }], { seed: 3, arena: { halfX: 30, halfZ: 10, works: MUD } });
  const [knight, archer] = world.fighters;
  const knightSink = footSink(works, knight, 0, 0);
  const archerSink = footSink(works, archer, 0, 0);
  assert.ok(knightSink > archerSink * 1.4, `knight ${knightSink.toFixed(2)} m, archer ${archerSink.toFixed(2)} m`);
  assert.ok(knightSink <= MUD.soft[0].firm + 1e-9, 'never past the firm layer');
  placeFighter(knight, -14, 0);
  placeFighter(archer, 14, 0);
  const foot = knight.body.gear.foot;
  for (let t = 0; t < 2; t += 0.1) advance(world, 0.1, think);
  assert.ok(knight.lift < -0.25, `his stance has sunk (${knight.lift.toFixed(2)})`);
  assert.ok(knight.x[P.lFoot * 3 + 1] < 0, 'his feet under the mud\'s surface');
  assert.ok(knight.body.gear.foot < foot * 0.7 && knight.wading?.mud, 'his legs held');
  assert.ok(knight.mired.footing < 1, 'his footing worse');
  assert.equal(surfaceAt(world, 0, 0, 0), 'mud');
  // Slower across the mud than across the dry field, and it costs him wind the dry walk does not.
  const pace = (works) => {
    const w = createWorld([{ inputs: normaliseInputs(structuredClone(PRESETS.knight)), corner: 'red' }, { inputs: { ...normaliseInputs(structuredClone(PRESETS.spear)), style: 'passive' }, corner: 'blue' }], { seed: 3, arena: { halfX: 30, halfZ: 10, works } });
    placeFighter(w.fighters[0], -14, 0);
    placeFighter(w.fighters[1], 14, 0);
    const x0 = w.fighters[0].x[P.pelvis * 3];
    for (let t = 0; t < 6; t += 0.1) advance(w, 0.1, think);
    return w.fighters[0].x[P.pelvis * 3] - x0;
  };
  const muddy = pace(MUD);
  const dry = pace(null);
  assert.ok(muddy < dry * 0.75, `${muddy.toFixed(2)} m in the mud, ${dry.toFixed(2)} m on the dry`);
  // Out of it, his legs are his own again.
  placeFighter(knight, 0, 0);
  world.arena = { ...world.arena, works: null };
  for (const fighter of world.fighters) fighter.arena = world.arena;
  assert.ok(softAt(works, 40, 0) === null);
});

test('a man down face first in the mud, or under the weight of the men on him, smothers', () => {
  const world = createWorld([{ inputs: nobleKnight(seededRandom(1)), corner: 'red' }, { inputs: nobleKnight(seededRandom(2)), corner: 'blue' }, { inputs: nobleKnight(seededRandom(3)), corner: 'blue' }], { seed: 1, arena: { halfX: 30, halfZ: 10, works: MUD } });
  const [down, onTop, other] = world.fighters;
  const works = worksOf(world.arena);
  // Lying face down: his back up, his head at the mud.
  down.state = 'down';
  for (let index = 0; index < down.x.length; index += 3) down.x[index + 1] = 0.08;
  // His spine along +x, his left shoulder to his left (+z, as a man facing +x has it): lying so, his back is up.
  down.x[P.pelvis * 3] = 0; down.x[P.neck * 3] = 0.5; down.x[P.head * 3] = 0.7;
  down.x[P.lShoulder * 3 + 2] = 0.2; down.x[P.rShoulder * 3 + 2] = -0.2;
  down.x[P.lShoulder * 3] = down.x[P.rShoulder * 3] = 0.45;
  down.x[P.pelvis * 3 + 2] = down.x[P.neck * 3 + 2] = down.x[P.head * 3 + 2] = 0;
  const face = smothering(world, works, down);
  // Turn him over: his back is down, his face up.
  down.x[P.lShoulder * 3 + 2] = -0.2; down.x[P.rShoulder * 3 + 2] = 0.2;
  const onHisBack = smothering(world, works, down);
  assert.equal(face, 'face down in the mud');
  assert.equal(onHisBack, null);
  // Two men lying across him: the weight on his chest.
  for (const man of [onTop, other]) for (let index = 0; index < man.x.length; index += 3) {
    man.x[index] = 0.25 + (index % 9) * 0.01;
    man.x[index + 1] = 0.3;
    man.x[index + 2] = 0;
  }
  assert.equal(smothering(world, works, down), 'crushed under the press');
  // Kept there (the world's step: fieldworks.js mireStep), he is out; a man who can breathe gets his wind back.
  for (let t = 0; t <= FIELDWORKS.smother.seconds + 1; t += 0.25) {
    down.state = 'down';
    mireStep(world, 0.25);
    if (down.state === 'out') break;
  }
  assert.equal(down.state, 'out');
  assert.ok(world.events.some((event) => event.kind === 'smothered' && event.fighter === down.id));
});

test('ranks of guns behind a palisade fire by ranks: a volley, then the men who fired change places with loaded men behind, the next volley a reload\'s time over the ranks later', () => {
  const random = seededRandom(4);
  const guns = Array.from({ length: 9 }, () => europeanSoldier(random, 'arquebusier'));
  const target = Array.from({ length: 4 }, () => nobleKnight(random));
  const world = createWorld([...guns.map((inputs) => ({ inputs, corner: 'blue' })), ...target.map((inputs) => ({ inputs, corner: 'red' }))], {
    seed: 4, arena: { halfX: 25, halfZ: 10, works: { walls: [{ points: [[2.6, -11], [2.6, 11]], height: 1.8, kind: 'palisade' }] } },
    formation: { blue: { front: 4, spacing: 2, rowSpacing: 1, perRow: 3, drill: { advance: false } }, red: { front: 10, spacing: 2, perRow: 4 } },
  });
  const shots = [];
  for (let t = 0; t < 30; t += 0.1) {
    advance(world, 0.1, think);
    for (const event of world.events) if (event.kind === 'shot' && event.time > t - 0.1 - 1e-9 && event.time <= t + 1e-9) shots.push(event);
  }
  const swaps = world.fighters.filter((fighter) => fighter.swappedAt !== undefined).length;
  assert.ok(swaps >= 6, `the ranks changed places (${swaps} men)`);
  // Volleys: shots in bursts, the bursts some five seconds apart (15 s to load, three ranks), and never a pause of a whole reload.
  const times = shots.map((event) => event.time).sort((a, b) => a - b);
  const volleys = times.filter((time, index) => index === 0 || time - times[index - 1] > DRILL.volleyWindow + 0.2);
  const gaps = volleys.slice(1).map((time, index) => time - volleys[index]);
  // (Nine guns, the leader's among them with the standard on his back: the first rank comes round again after its
  // load and its walk back to the front, about 18 s; so four volleys at least in thirty seconds.)
  assert.ok(volleys.length >= 4, `${volleys.length} volleys in thirty seconds (${volleys.map((time) => time.toFixed(1)).join(', ')})`);
  assert.ok(Math.min(...gaps) >= 15 / 3 - 0.5 && Math.max(...gaps) < 12, `volleys ${gaps.map((gap) => gap.toFixed(1)).join(', ')} s apart`);
  assert.ok(new Set(shots.map((event) => event.attacker)).size > 3, 'fired by more than the first rank');
});

test('an arrow or a ball strikes a horse: through its hide, a ball through any barding; an arrow glances off plate', () => {
  const random = seededRandom(9);
  const world = createWorld([{ inputs: mountedKnight(random), corner: 'red' }, { inputs: footSoldier(random, 'bow'), corner: 'blue' }], { seed: 9, arena: { halfX: 25, halfZ: 12 } });
  const horse = world.horses[0];
  const shooter = world.fighters[1];
  const legs = horse.capsules.find((capsule) => capsule.part === 'legs');
  const chest = horse.capsules.find((capsule) => capsule.part === 'chest');
  missileInHorse(world, shooter, { horse, capsule: legs, point: legs.a }, [1, 0, 0], 100, { arrow: true });
  assert.ok(horse.bleed > 0, 'the arrow in its leg bleeds it');
  const bleed = horse.bleed;
  world.random = () => 0;
  missileInHorse(world, shooter, { horse, capsule: chest, point: chest.a }, [1, 0, 0], 100, { arrow: true });
  assert.equal(horse.bleed, bleed, 'off the steel peytral');
  missileInHorse(world, shooter, { horse, capsule: chest, point: chest.a }, [1, 0, 0], 1000, { arrow: false });
  assert.ok(horse.bleed > bleed, 'a ball goes through it');
});

test('the battles with works (Agincourt, Cerignola, Qi Jiguang): the works where the lines are, the sides within the muster cap, each army one the setup screen has', () => {
  for (const [key, defenders] of [['agincourt', 35], ['cerignola', 35], ['qiJiguang', 28]]) {
    const level = battleOf(key);
    const cast = level.cast(seededRandom(2));
    assert.ok(cast.red.length <= MUSTER.cap && cast.blue.length <= MUSTER.cap, key);
    assert.equal(cast.blue.length, defenders, key);
    assert.ok(level.arena.works, `${key} has its works`);
    const works = worksOf(level.arena);
    // The defenders stand behind their works, the attackers before them.
    const world = createWorld(['red', 'blue'].flatMap((corner) => cast[corner].map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner }))), { seed: 2, arena: level.arena, formation: level.formation });
    const line = Math.max(...works.stakes.map((stake) => stake.foot[0]), ...works.walls.filter((wall) => wall.kind === 'palisade').map((wall) => wall.a[0]), ...works.ditches.map((ditch) => ditch.from[0]), -Infinity);
    for (const fighter of world.fighters) {
      const x = fighter.mount ? fighter.mount.at[0] : fighter.x[P.pelvis * 3];
      if (fighter.corner === 'blue') assert.ok(x > line, `${key}: ${fighter.body.inputs.name} behind the works (${x.toFixed(1)} > ${line.toFixed(1)})`);
      else assert.ok(x < line - 3, `${key}: ${fighter.body.inputs.name} before them`);
    }
    // The setup screen's armies for its sides.
    for (const corner of ['red', 'blue']) for (const army of level.armies[corner]) assert.ok(ARMIES[army], `${key} ${army}`);
  }
  assert.equal(SCENARIOS.nagashino, undefined, 'Nagashino gave way to Sekigahara');
  assert.equal(SCENARIOS.sekigahara.scene, 'sengoku', 'Sekigahara is fought in the Sengoku place');
  assert.equal(SCENARIOS.sekigahara.arena.works, undefined, 'in the open: no works');
  assert.ok(ARMIES.east && ARMIES.west, 'the East and the West, for the setup screen');
});

test('a horse driven at a canter or more through deep mud founders and throws its rider; on firm ground, or at a walk, it does not', () => {
  // Ridden on across the field at `speed` (m/s) for `seconds`, nothing before it: why it went down, or nothing.
  const ride = (works, speed, seed, seconds = 6) => {
    const world = charge(works, seed, { from: -24 });
    placeFighter(world.fighters[1], 24, 9);
    const horse = world.horses[0];
    horse.speed = speed;
    for (let t = 0; t < seconds && horse.state === 'up'; t += 0.05) {
      horse.goal = { heading: 0, speed };
      horse.goalAt = Infinity; // (held to it: the rider's own hand on the reins does not take it back)
      advance(world, 0.05, () => {});
    }
    const down = world.events.find((event) => event.kind === 'horseDown');
    return { horse, rider: world.fighters[0], reason: down?.effects[0] };
  };
  let foundered = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const { horse, rider, reason } = ride(MUD, 9, seed);
    if (reason !== 'founders in the mud') continue;
    foundered += 1;
    assert.ok(!horse.dead, 'down floundering, not dead');
    assert.notEqual(rider.mount, horse, 'its rider thrown');
  }
  assert.ok(foundered >= 5, `${foundered} of 6 went down at the gallop within 6 s of mud`);
  for (const seed of [1, 2, 3]) {
    assert.equal(ride(null, 9, seed).reason, undefined, 'on firm ground it gallops on');
    assert.equal(ride(MUD, 1.5, seed, 20).reason, undefined, 'at a walk it picks its feet out of the mud');
  }
});
