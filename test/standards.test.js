// Group fights: each side's standard and the slight pull towards it, the
// fallen standard taken up, and the crawl of a man who cannot stand or has
// lost his nerve.

import test from 'node:test';
import assert from 'node:assert/strict';

import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, breakJoint, createWorld, dropWeapon, inFight, startCrawl } from '../src/physics.js';
import { FACTIONS } from '../src/outfits.js';
import { WEAPONS } from '../src/weapons.js';
import { scenarioWorld } from '../src/scenarios.js';

const think = (world, dt) => thinkAll(world, dt);
const duel = (red, blue) => createWorld([{ inputs: structuredClone(PRESETS[red]), corner: 'red' }, { inputs: structuredClone(PRESETS[blue]), corner: 'blue' }], { seed: 3 });

test('every faction standard is a weapon with a flag, borne as its style', () => {
  for (const faction of Object.values(FACTIONS)) {
    if (!faction.standard) continue;
    assert.ok(WEAPONS[faction.standard.weapon]?.flag, faction.label);
  }
});

test('a big side\'s leader is the man nearest its middle, and bears its standard', () => {
  const world = scenarioWorld('rhodes', 1);
  for (const corner of ['red', 'blue']) {
    const { leader, kind } = world.standards[corner];
    const team = world.fighters.filter((fighter) => fighter.corner === corner);
    const middle = team.reduce((sum, fighter) => [sum[0] + fighter.root[0] / team.length, sum[1] + fighter.root[1] / team.length], [0, 0]);
    const distance = (fighter) => Math.hypot(fighter.root[0] - middle[0], fighter.root[1] - middle[1]);
    assert.equal(distance(world.fighters[leader]), Math.min(...team.map(distance)));
    assert.equal(world.fighters[leader].weapon.kind, kind);
  }
  assert.deepEqual([world.standards.red.kind, world.standards.blue.kind], ['banner', 'sancak']);
});

test('a samurai leader wears his great banner and keeps his weapon', () => {
  const world = scenarioWorld('sekigahara', 1);
  const leader = world.fighters[world.standards.red.leader];
  assert.equal(leader.wornStandard.kind, 'nobori');
  assert.ok(leader.weapon && !leader.weapon.spec.flag);
});

test('a one-on-one has no standard', () => {
  assert.deepEqual(duel('knight', 'samurai').standards, {});
});

test('a dropped standard is not picked up by the enemy, and the nearest of its own takes it up', () => {
  const world = scenarioWorld('rhodes', 1);
  advance(world, 0.5, think);
  const bearer = world.fighters[world.standards.red.leader];
  dropWeapon(world, bearer, 'disarmed', [0, 1, 1.5]);
  let takenBy = null;
  for (let t = 0; t < 12 && takenBy === null; t += 0.25) {
    advance(world, 0.25, think);
    const holder = world.fighters.find((fighter) => fighter.weapon?.held && fighter.weapon.kind === 'banner');
    if (holder) takenBy = holder;
  }
  assert.ok(takenBy, 'nobody took the banner up');
  assert.equal(takenBy.corner, 'red');
});

test('a fallen leader\'s worn banner comes off his back and is taken up in the hands', () => {
  const world = scenarioWorld('sekigahara', 1);
  advance(world, 0.5, think);
  const leader = world.fighters[world.standards.red.leader];
  leader.state = 'out';
  advance(world, 0.1, think);
  assert.ok(leader.wornStandard.shed);
  assert.ok(world.debris.some((debris) => debris.weapon === 'nobori' && debris.colour === world.standards.red.colour));
  for (let t = 0; t < 15 && !world.fighters.some((fighter) => fighter.weapon?.held && fighter.weapon.kind === 'nobori' && fighter.corner === 'red'); t += 0.25) advance(world, 0.25, think);
  assert.ok(world.fighters.some((fighter) => fighter.weapon?.held && fighter.weapon.kind === 'nobori' && fighter.corner === 'red'));
});

test('a broken knee: down, then on his knees crawling away, out of the fight', () => {
  const world = duel('heavy', 'light');
  world.rules = { noPins: true };
  const fighter = world.fighters[0];
  breakJoint(world, fighter, 'lKnee');
  for (let t = 0; t < 8 && !fighter.crawling; t += 0.25) advance(world, 0.25, think);
  assert.ok(fighter.crawling);
  assert.equal(inFight(fighter), false);
  assert.equal(boutWinner(world), 'blue');
});

test('a man crawling goes on his knees, low, away from the enemy, and is let go', () => {
  const world = duel('heavy', 'light');
  const crawler = world.fighters[0];
  const enemy = world.fighters[1];
  advance(world, 0.5, think);
  startCrawl(world, crawler, 'test');
  const apart = () => Math.hypot(crawler.x[P.pelvis * 3] - enemy.x[P.pelvis * 3], crawler.x[P.pelvis * 3 + 2] - enemy.x[P.pelvis * 3 + 2]);
  advance(world, 1.5, think);
  const before = apart();
  advance(world, 2, think);
  assert.ok(crawler.x[P.pelvis * 3 + 1] < 0.6 * crawler.body.lengths.thigh + 0.3, `pelvis at ${crawler.x[P.pelvis * 3 + 1]}`);
  assert.ok(crawler.x[P.lKnee * 3 + 1] < 0.12 && crawler.x[P.rKnee * 3 + 1] < 0.12, 'knees on the floor');
  assert.ok(apart() > before, 'crawling away');
  assert.ok(!world.events.some((event) => event.kind === 'landed' && event.defender === crawler.id && event.time > 2));
});

test('adrenaline makes a badly hurt man in a panic far less likely to crawl', () => {
  const crawled = (adrenaline) => {
    let count = 0;
    for (let seed = 1; seed <= 30; seed += 1) {
      const world = createWorld([{ inputs: structuredClone(PRESETS.heavy), corner: 'red' }, { inputs: structuredClone(PRESETS.light), corner: 'blue' }], { seed });
      const man = world.fighters[0];
      man.panicked = true;
      man.bloodLost = 0.9 * 2;
      man.legDamage.l = 1e3;
      man.adrenaline = adrenaline;
      man.calmFor = -1e9;
      advance(world, 2, (current, dt) => {
        man.adrenaline = adrenaline;
        thinkAll(current, dt);
      });
      if (man.crawling) count += 1;
    }
    return count;
  };
  const calm = crawled(0);
  const surging = crawled(1);
  assert.ok(calm > 10, `without adrenaline ${calm} of 30 crawled`);
  assert.ok(surging < calm / 3, `with adrenaline ${surging} of 30 crawled (without: ${calm})`);
});
