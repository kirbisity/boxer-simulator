import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { createWorld } from '../src/physics.js';
import { battleTally, clock, howBeaten, notableFacts, tallyRows, WOUNDED_AT, wounded } from '../src/battletally.js';

// Five a side, fresh: the tally is read off the men's state and the events, so each case sets those by hand.
const battle = () => createWorld(Array.from({ length: 10 }, (_, index) => ({ inputs: structuredClone(PRESETS.contender), corner: index < 5 ? 'red' : 'blue' })), { seed: 4 });
const say = (world, kind, fighter, extra = {}) => world.events.push({ time: world.time, kind, fighter, effects: [], ...extra });

test('a fresh battle: every man standing, nobody killed, wounded or gone', () => {
  const tally = battleTally(battle());
  for (const corner of ['red', 'blue']) assert.deepEqual(tally[corner], { men: 5, killed: 0, wounded: 0, down: 0, cold: 0, broke: 0, crawled: 0, crawling: 0, fled: 0, rallied: 0, standing: 5 });
  assert.deepEqual(tallyRows(tally).map(([field]) => field), ['men', 'standing'], 'only the rows some side has any of');
});

test('the dead, the knocked cold, the fled and the rallied are each counted once, on their own side', () => {
  const world = battle();
  const [r0, r1, r2, r3] = world.fighters;
  const [b0, b1] = world.fighters.slice(5);
  // Red: one killed, one bled out, one beheaded (down as 'out', but dead), one knocked cold.
  for (const man of [r0, r1, r2, r3]) man.state = 'out';
  say(world, 'killed', r0.id, { attacker: b0.id });
  say(world, 'bledOut', r1.id, { attacker: b0.id });
  say(world, 'severed', r2.id, { attacker: b1.id, joint: 'neck' });
  say(world, 'knockout', r3.id, { attacker: b1.id });
  // Blue: one broke, crawled away in the rout and off the field; another broke, ran, came back twice.
  say(world, 'panic', b0.id);
  say(world, 'crawl', b0.id, { effects: ['crawls away in the rout'] });
  Object.assign(b0, { fled: true, dormant: true });
  say(world, 'panic', b1.id);
  say(world, 'rally', b1.id, { effects: ['comes back to the fight'] });
  say(world, 'rally', b1.id, { effects: ['comes back to the fight'] });
  // (A man steadying where he stands is not a rally from the edge.)
  say(world, 'rally', b1.id, { effects: ['steadies'] });
  const tally = battleTally(world);
  assert.equal(tally.red.killed, 3, 'killed, bled out and beheaded');
  assert.equal(tally.red.down, 4, 'the level tool\'s down: every man on the ground, the dead too');
  assert.equal(tally.red.cold, 1, 'down and alive: the knocked-cold one');
  assert.equal(tally.red.standing, 1);
  assert.deepEqual([tally.blue.broke, tally.blue.crawled, tally.blue.fled, tally.blue.rallied, tally.blue.standing], [2, 1, 1, 2, 4]);
  assert.equal(tally.blue.killed + tally.blue.down, 0);
  assert.deepEqual(tallyRows(tally).map(([field]) => field), ['men', 'killed', 'cold', 'crawled', 'fled', 'rallied', 'standing']);
});

test('wounded: a man who lived and was really hurt, or has a bone broken; never the dead', () => {
  const world = battle();
  const [scratched, bled, broken, dead] = world.fighters;
  // A scratch is no wound; a quarter of the blood that drops a man is.
  scratched.bloodLost = 0;
  assert.equal(wounded(scratched), false);
  bled.bloodLost = 10;
  assert.ok(wounded(bled), `bled past ${WOUNDED_AT}`);
  broken.broken.add('lElbow');
  assert.ok(wounded(broken), 'a broken bone');
  dead.broken.add('neck');
  dead.state = 'out';
  say(world, 'killed', dead.id);
  assert.equal(battleTally(world).red.wounded, 2, 'the hurt who lived; the dead man is killed, not wounded');
});

test('how the beaten side lost: broke, cut down, or beaten down', () => {
  const side = (fields) => ({ men: 10, killed: 0, cold: 0, down: 0, fled: 0, crawling: 0, broke: 0, standing: 0, ...fields });
  assert.equal(howBeaten(side({ broke: 6, fled: 2, killed: 3, cold: 5 })), 'broke and ran', 'most of it broke, though most of the runners were caught');
  assert.equal(howBeaten(side({ broke: 9, fled: 7 })), 'broke and fled the field');
  assert.equal(howBeaten(side({ broke: 2, killed: 6, cold: 4 })), 'were cut down');
  assert.equal(howBeaten(side({ killed: 10 })), 'were cut down to the last man');
  assert.equal(howBeaten(side({ killed: 2, cold: 8 })), 'were beaten down');
});

test('a notable fact: the most kills, else the most blows; the arrows and shots', () => {
  const world = battle();
  const [archer] = world.fighters;
  for (const victim of world.fighters.slice(5, 7)) say(world, 'killed', victim.id, { attacker: archer.id });
  for (let index = 0; index < 3; index += 1) world.events.push({ time: 0, kind: 'loosed', attacker: archer.id, effects: [] });
  const facts = notableFacts(world, (fighter) => `man ${fighter.id}`);
  assert.deepEqual(facts.map((fact) => [fact.label, fact.name, fact.count]), [['Most kills', 'man 0', 2], ['Arrows loosed', undefined, 3]]);
  assert.deepEqual(notableFacts(battle()), [], 'nothing worth a line');
  assert.equal(clock(151.4), '2:31');
  assert.equal(clock(9), '0:09');
});
