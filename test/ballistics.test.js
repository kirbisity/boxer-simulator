// Exterior ballistics (physics/ballistics.js): every gun's round and every arrow flies under gravity and the air's drag,
// its energy falling with the distance it has flown; the shooter holds over for the drop at the distance he judges; what
// it does to a man and through his armour is by the energy it strikes with (physics/ranged.js gunRound, bulletHit).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { mingSoldier } from '../src/cast.js';
import { advance, aimPoint, createWorld, placeFighter, seededRandom, throwPunch } from '../src/physics.js';
import { atRange, BALLISTICS, dragRate, holdover, judgedShare, rangeTable } from '../src/physics/ballistics.js';
import { arrowProjectile, gunFlight, heldOver } from '../src/physics/ranged.js';
import { ARROW, CROSSBOW, GUN, MATCHLOCK, RIFLE, THREE_EYED, WEAPONS } from '../src/weapons.js';

const target = () => normaliseInputs({ ...structuredClone(PRESETS.contender), sex: 'male', heightCm: 176, style: 'unskilled', outfit: null, accessories: [] });

test('a round ball sheds ~2.5 m/s a metre from 450 m/s, as the Graz armoury measured its guns\' balls (Krenn et al. 1995)', () => {
  const ball = { kg: 0.025, velocity: 454, curve: 'sphere' };
  const lost = (ball.velocity - atRange(ball, 24).speed) / 24;
  assert.ok(lost > 1.8 && lost < 3, `${lost.toFixed(2)} m/s per m`);
  // (A constant Cd of 0.47, the slow sphere's, would give half of it: the drag rises through the speed of sound.)
  assert.ok(dragRate(ball, 450) > 1.8 * dragRate(ball, 150));
});

test('every round loses energy with distance; a spitzer keeps more of it than a ball, the three-eyed gun has least', () => {
  for (const shot of [GUN, MATCHLOCK, THREE_EYED, RIFLE]) {
    const energies = [0, 30, 60, 120].map((d) => atRange(shot.projectile, d).joules);
    for (let k = 1; k < energies.length; k += 1) assert.ok(energies[k] < energies[k - 1], energies.map(Math.round).join(' > '));
  }
  const kept = (shot, d) => atRange(shot.projectile, d).joules / shot.energy;
  assert.ok(kept(RIFLE, 100) > 0.75 && kept(MATCHLOCK, 100) < 0.45, `rifle ${kept(RIFLE, 100).toFixed(2)}, matchlock ${kept(MATCHLOCK, 100).toFixed(2)}`);
  for (const d of [0, 50, 120]) assert.ok(atRange(THREE_EYED.projectile, d).joules < atRange(MATCHLOCK.projectile, d).joules / 2);
  // Song Yingchang's 80 paces (~120 m): the teppō's ball still has a third of its muzzle energy, ~340 J, at ~230 m/s.
  const song = atRange(MATCHLOCK.projectile, 120);
  assert.ok(song.joules > 280 && song.joules < 400 && song.speed > 200, `${Math.round(song.joules)} J at ${Math.round(song.speed)} m/s`);
});

test('held over for the drop at the distance, the ball comes down on the mark; laid on the line, it falls short', () => {
  const muzzle = [0, 1.4, 0];
  const heightAt = (dir, x) => {
    const chord = gunFlight({ arena: null }, MATCHLOCK.projectile, muzzle, dir).find((c) => c.to[0] >= x);
    const s = (x - chord.from[0]) / (chord.to[0] - chord.from[0]);
    return chord.from[1] + (chord.to[1] - chord.from[1]) * s;
  };
  const level = [1, 0, 0];
  assert.ok(heightAt(level, 100) < muzzle[1] - 0.4, 'a level shot falls ~half a metre by 100 m');
  assert.ok(Math.abs(heightAt(heldOver(level, MATCHLOCK.projectile, 100), 100) - muzzle[1]) < 0.05, 'held over, it is on the mark');
  assert.ok(holdover(RIFLE.projectile, 100) < holdover(MATCHLOCK.projectile, 100) / 4, 'a rifle hardly needs it');
  // A novice judges a distance short (and so holds over too little); a master, true.
  assert.ok(judgedShare(0) < 0.9 && judgedShare(1) === 1);
});

test('a matchlock at 60 m: held over, a steady master hits the man, with less of the ball\'s energy than at the muzzle', () => {
  const spread = MATCHLOCK.spread;
  MATCHLOCK.spread = 0;
  try {
    let hit = null;
    for (let seed = 1; seed < 6 && !hit; seed += 1) {
      const world = createWorld([{ inputs: structuredClone(PRESETS.matchlock), corner: 'red' }, { inputs: target(), corner: 'blue' }], { seed, arena: { halfX: 40, halfZ: 10 } });
      const [gunner, victim] = world.fighters;
      gunner.body.skill = 1;
      placeFighter(gunner, -30, 0);
      placeFighter(victim, 30, 0);
      victim.handsDown = true;
      advance(world, 0.5);
      throwPunch(world, gunner, 'fireLong', 'body');
      advance(world, 3);
      hit = world.events.find((event) => event.kind === 'shot' && event.defender === victim.id);
    }
    assert.ok(hit, 'it hit him');
    assert.ok(hit.energy < 0.7 * MATCHLOCK.energy && hit.energy > 0.45 * MATCHLOCK.energy, `${Math.round(hit.energy)} J`);
  } finally {
    MATCHLOCK.spread = spread;
  }
});

test('arrows lose energy to the air as they fly, a light arrow faster than a heavy one; a bolt least', () => {
  const war = arrowProjectile({ spec: WEAPONS.longbow });
  const light = arrowProjectile({ spec: { arrowSpeed: 60, arrowEnergy: 0.6 } });
  const bolt = arrowProjectile(null, CROSSBOW);
  assert.ok(war.kg > 0.06 && war.kg < 0.1, `war arrow ${Math.round(war.kg * 1000)} g`);
  const share = (projectile, d) => Math.exp(-2 * dragRate(projectile, projectile.velocity) * d);
  assert.ok(share(light, 60) < share(war, 60) && share(war, 60) < share(bolt, 60));
  assert.ok(share(war, 60) > 0.7 && share(war, 60) < 0.92, `a war arrow keeps ${share(war, 60).toFixed(2)} of its energy over 60 m`);
});

test('an arrow lobbed over a man before him at a mark 30 m off comes down on it, the drag in its arc', () => {
  const random = seededRandom(5);
  const blue = [mingSoldier(random, 'spear', 'garrison', { people: 'mingSouth' }), mingSoldier(random, 'bow', 'garrison', { people: 'mingSouth' })];
  const entries = [...blue.map((inputs) => ({ inputs: normaliseInputs(inputs), corner: 'blue' })), { inputs: target(), corner: 'red' }];
  const world = createWorld(entries, { seed: 5, arena: { halfX: 40, halfZ: 8 }, formation: { blue: { front: 4, layout: [[0, 0], [1.3, 0]], drill: { advance: false } } } });
  const [, bow, red] = world.fighters;
  placeFighter(red, -26, 0);
  bow.body.skill = 1;
  const { spread } = ARROW;
  const judge = BALLISTICS.judge;
  ARROW.spread = 0;
  BALLISTICS.judge = { spread: [0, 0], short: [0, 0] };
  try {
    for (let t = 0; t < 8; t += 0.05) advance(world, 0.05, (current, dt) => thinkAll(current, dt, new Set([red.id])));
    const fell = world.arrows.filter((arrow) => arrow.landed || arrow.done);
    assert.ok(fell.length > 0, 'he shot');
    const off = fell.map((arrow) => Math.hypot(arrow.x[0] - red.x[0], arrow.x[2] - red.x[2]));
    assert.ok(off.filter((d) => d < 2).length >= fell.length / 2, `arrows fell ${off.map((d) => d.toFixed(1)).join(', ')} m off the mark`);
    assert.ok(fell.every((arrow) => arrow.energy < (arrow.speed / ARROW.speed) ** 2 * (bow.weapon.spec.arrowEnergy ?? 1)), 'each lost energy on the way');
  } finally {
    ARROW.spread = spread;
    BALLISTICS.judge = judge;
  }
});

test('the range table is the flight: speed falls and drop grows metre by metre', () => {
  const table = rangeTable(MATCHLOCK.projectile);
  for (const d of [10, 50, 100, 150]) assert.ok(table.speed[d] < table.speed[d - 1] && table.drop[d] > table.drop[d - 1]);
});
