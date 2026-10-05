// Regressions for the bugs found in the code review: each test fails on the
// code before its fix.

import test from 'node:test';
import assert from 'node:assert/strict';

import { PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, dropWeapon, seededRandom, throwPunch } from '../src/physics.js';
import { footSoldier, hospitaller, mexicaWarrior, varyCharacter } from '../src/cast.js';
import { SCENARIOS, scenarioWorld } from '../src/scenarios.js';
import { MOVES, STYLES } from '../src/moves.js';

const duel = (red, blue, options = {}) => createWorld([{ inputs: structuredClone(red), corner: 'red' }, { inputs: structuredClone(blue), corner: 'blue' }], { seed: 3, ...options });

test('joint strain drains while the joint is back in range, not only while it is over', () => {
  const world = duel(PRESETS.heavy, PRESETS.light);
  const fighter = world.fighters[0];
  fighter.strain = { lKnee: 0.04 };
  advance(world, 1);
  assert.ok(fighter.strain.lKnee < 0.001, `strain left after a second in range: ${fighter.strain.lKnee}`);
});

test('a dropped gun keeps the rounds it had', () => {
  const world = duel(PRESETS.rifle, PRESETS.heavy, { distance: 8 });
  const shooter = world.fighters[0];
  shooter.weapon.charges = 3;
  dropWeapon(world, shooter, 'dropped');
  const debris = world.debris.find((item) => item.weapon === 'rifle');
  assert.equal(debris.charges, 3);
});

test('an army\'s men are built as men: beards and men\'s hair, not overridden women', () => {
  const random = seededRandom(11);
  const men = Array.from({ length: 120 }, (_, index) => [footSoldier, (r) => mexicaWarrior(r), (r) => hospitaller(r, 'spear', 'sergeant')][index % 3](random));
  const womensHair = new Set(['bun', 'ponytail']);
  assert.ok(men.every((man) => man.sex === 'male'));
  assert.ok(men.filter((man) => womensHair.has(man.look.hairStyle)).length === 0, 'no bun or ponytail among the men');
  // Built from a woman's preset (the contender), forced male: a man's height.
  const forced = Array.from({ length: 40 }, () => varyCharacter(PRESETS.contender, random, { sex: 'male' }));
  const mean = forced.reduce((sum, man) => sum + man.heightCm, 0) / forced.length;
  assert.ok(mean > PRESETS.contender.heightCm + 6, `forced men average ${mean.toFixed(1)} cm`);
});

test('a battle\'s world is drawn from its cast', () => {
  const world = scenarioWorld('rhodes', 2);
  assert.ok(world.fighters.length > 20);
  assert.ok(world.fighters.some((fighter) => fighter.corner === 'red') && world.fighters.some((fighter) => fighter.corner === 'blue'));
});

test('every ranged soldier stands behind the line, the three-eyed gunners too', () => {
  const cast = SCENARIOS.pyongyang.cast(seededRandom(5));
  const firstRanged = cast.red.findIndex((inputs) => STYLES[inputs.style]?.ranged);
  assert.ok(firstRanged > 0 && cast.red.slice(firstRanged).every((inputs) => STYLES[inputs.style]?.ranged));
});

test('a fighter does not answer a blow aimed at his team-mate', () => {
  // A jab at his team-mate, over and over, at different seeds: he never ducks it.
  let answered = 0;
  for (let seed = 1; seed <= 20; seed += 1) {
    const world = createWorld([
      { inputs: structuredClone(PRESETS.heavy), corner: 'red' },
      { inputs: structuredClone(PRESETS.light), corner: 'red' },
      { inputs: structuredClone(PRESETS.contender), corner: 'blue' },
    ], { seed });
    const [watcher, mate, attacker] = world.fighters;
    for (let step = 0; step < 90; step += 1) {
      if (!attacker.punch) {
        throwPunch(world, attacker, 'jab', 'head');
        if (attacker.punch) attacker.punch.target = mate.id;
      }
      thinkAll(world, 1 / 60, new Set([attacker.id, mate.id]));
      advance(world, 1 / 60);
      if (watcher.defence?.from === attacker.id) answered += 1;
    }
  }
  assert.equal(answered, 0);
});

test('the stamina a strike needs is what it costs', () => {
  const world = duel(PRESETS.heavy, PRESETS.light);
  const fighter = world.fighters[0];
  advance(world, 0.3);
  const drain = MOVES.hook.cost / fighter.body.aerobic;
  fighter.stamina = drain * 0.9;
  assert.equal(throwPunch(world, fighter, 'hook', 'head'), false, 'not enough left for the hook');
  fighter.stamina = drain * 1.1;
  assert.equal(throwPunch(world, fighter, 'hook', 'head'), true, 'enough for it');
});
