import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS, buildBody, normaliseInputs } from '../src/body.js';
import { AI, routFear, thinkAll } from '../src/ai.js';
import { advance, breakJoint, createWorld, crawlStance, inFight } from '../src/physics.js';
import { contextAction, playerCrawl } from '../src/control.js';

const duel = (red, blue, seed = 3) => createWorld([{ inputs: structuredClone(PRESETS[red]), corner: 'red' }, { inputs: structuredClone(PRESETS[blue]), corner: 'blue' }], { seed });
const bodyOf = (preset) => buildBody(normaliseInputs(structuredClone(PRESETS[preset])));

test('on all fours a thin man has his knees close together, a heavy man wide apart', () => {
  const thin = crawlStance(bodyOf('contender'));
  const heavy = crawlStance(bodyOf('heavy'));
  const sumo = crawlStance(bodyOf('sumo'));
  assert.ok(thin.knee * 2 < 0.22, `thin knees ${(thin.knee * 200).toFixed(0)} cm apart`);
  assert.ok(heavy.knee > thin.knee * 1.3, 'heavy wider than thin');
  assert.ok(sumo.knee > heavy.knee, 'the heaviest widest');
  assert.ok(heavy.foot > heavy.knee && heavy.hand > heavy.knee, 'feet and hands outside the knees');
});

test('a side losing men fears it; a lone man or a pair do not', () => {
  const men = (count, corner) => Array.from({ length: count }, () => ({ inputs: structuredClone(PRESETS.contender), corner }));
  const world = createWorld([...men(10, 'red'), ...men(10, 'blue')], { seed: 2 });
  thinkAll(world, 1 / 60);
  const man = world.fighters[0];
  assert.equal(routFear(world, man), 0, 'nobody lost yet');
  for (const fallen of world.fighters.slice(1, 7)) fallen.state = 'out';
  thinkAll(world, 1 / 60);
  assert.ok(routFear(world, man) >= AI.rout.losses * 0.99, `${AI.rout.lossesFull * 100}% of his side lost: the full fear of the rout`);
  const pair = duel('contender', 'contender');
  thinkAll(pair, 1 / 60);
  pair.fighters[0].state = 'out';
  assert.equal(routFear(pair, pair.fighters[1]), 0, 'a duel is no battle');
});

test('the broken of a big losing side run for their rear and leave the field; the battle ends', () => {
  const men = (count, corner, preset) => Array.from({ length: count }, () => ({ inputs: structuredClone(PRESETS[preset]), corner }));
  const world = createWorld([...men(6, 'red', 'heavy'), ...men(6, 'blue', 'light')], { seed: 5, arena: { halfX: 9, halfZ: 6 } });
  thinkAll(world, 1 / 60);
  const rear = world.sides.blue.rear;
  for (const man of world.fighters.filter((fighter) => fighter.corner === 'blue')) man.panicked = true;
  const start = world.fighters.filter((fighter) => fighter.corner === 'blue').map((fighter) => fighter.x[P.pelvis * 3] * rear[0] + fighter.x[P.pelvis * 3 + 2] * rear[1]);
  for (let t = 0; t < 12; t += 0.25) advance(world, 0.25, (current, dt) => thinkAll(current, dt));
  const blue = world.fighters.filter((fighter) => fighter.corner === 'blue');
  const moved = blue.map((fighter, index) => fighter.x[P.pelvis * 3] * rear[0] + fighter.x[P.pelvis * 3 + 2] * rear[1] - start[index]);
  assert.ok(moved.filter((metres) => metres > 1).length >= 3, `most ran back: ${moved.map((m) => m.toFixed(1)).join(', ')}`);
  assert.ok(blue.some((fighter) => fighter.fled), 'some reached the edge and fled');
  for (const fighter of blue.filter((each) => each.fled)) assert.equal(inFight(fighter), false);
});

test('a broken arm can put a man on his knees, panicked or not', () => {
  let crawled = 0;
  for (let seed = 1; seed <= 12; seed += 1) {
    const world = duel('heavy', 'light', seed);
    const man = world.fighters[1];
    breakJoint(world, man, 'lElbow');
    breakJoint(world, man, 'rElbow');
    for (let t = 0; t < 8 && !man.crawling; t += 0.25) advance(world, 0.25, (current, dt) => thinkAll(current, dt));
    if (man.crawling) crawled += 1;
  }
  assert.ok(crawled >= 4, `${crawled} of 12 with both arms broken went down to crawl`);
});

test('the player can go down to crawl and is still in the fight; up again if his legs bear him', () => {
  const world = duel('contender', 'contender');
  advance(world, 0.5, () => {});
  const me = world.fighters[0];
  assert.equal(playerCrawl(world, me, true), true);
  assert.ok(me.crawling);
  assert.equal(inFight(me), true, 'his own choice: still in it');
  assert.equal(contextAction(world, me), 'stand');
  assert.equal(playerCrawl(world, me, false), true);
  assert.ok(!me.crawling);
  playerCrawl(world, me, true);
  breakJoint(world, me, 'lKnee');
  assert.equal(playerCrawl(world, me, false), false, 'a broken knee will not stand him up');
});
