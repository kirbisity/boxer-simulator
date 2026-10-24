// Level mode, the attempts: every death is a failed attempt (the recorder keeps who killed him, where, who stood with him, how long), and
// the ending tells the night as a short story, templated from that record (the generator: the same log, the same words). The story ends
// on the plot twist's end (levelmode/ending.js): the empty room behind the jailer, and the operative who stayed below as the new Noname.

import test from 'node:test';
import assert from 'node:assert/strict';
import { knockOut, placeOnFloor } from '../src/physics.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { DN_Y, DUNNOTTAR } from '../src/levelmode/stages/dunnottar.js';
import { attemptCount, attemptLog, attemptStory, createLevelWorld, levelThink, respawnPlayer, restAtPoint, restartFromRest } from '../src/levelmode/level.js';
import { deathOf } from '../src/levelmode/attempts.js';
import { attemptsLine, endingLines } from '../src/levelmode/story.js';

const man = (world, id) => world.fighters.find((fighter) => fighter.spawn?.id === id);
const dunnottar = (seed = 3) => createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed });
const fall = (world, fighter, attacker = undefined, reason = 'is struck down', kind = 'killed') => knockOut(world, fighter, { time: world.time, attacker, effects: [] }, reason, kind);
const REST = DUNNOTTAR.sections.find((section) => section.rest).rest;

/** The operative is killed by `by` (a spawn id), the level notes it, and he wakes at the last rest. */
function dieTo(world, by, { wake = true } = {}) {
  const me = world.fighters[0];
  fall(world, me, man(world, by).id);
  levelThink(world, 1 / 60);
  if (wake) respawnPlayer(world);
}

// ---- The recorder -------------------------------------------------------------------------------------------------

test('attempts: a run with no death is on its first attempt, with the two comrades it began with', () => {
  const world = dunnottar();
  assert.equal(attemptCount(world), 1);
  const log = attemptLog(world);
  assert.deepEqual(log.failed, []);
  assert.deepEqual(log.final.comrades, ['Maren', 'Old Tobin']);
  assert.deepEqual(log.final.survivors, ['Maren', 'Old Tobin']);
  assert.equal(log.start, 'The Cliff Path');
});

test('attempts: every death is counted, the ones before the first rest too, with the killer, the place and the comrades', () => {
  const world = dunnottar();
  const level = world.stage.level;
  dieTo(world, 'levy1');
  assert.equal(level.attempts.length, 1);
  assert.equal(attemptCount(world), 2);
  const [first] = level.attempts;
  assert.equal(first.number, 1);
  assert.equal(first.killer, 'Hob');
  assert.equal(first.section, 'cliff');
  assert.equal(first.place, 'The Cliff Path');
  assert.equal(first.from, null, 'no rest yet: the stage\'s start');
  assert.equal(first.rest, null);
  assert.deepEqual(first.comrades, ['Maren', 'Old Tobin']);
  assert.deepEqual(first.fallen, []);
  assert.ok(first.seconds >= 0 && first.time >= first.seconds);
  dieTo(world, 'levy3');
  dieTo(world, 'levy5');
  assert.deepEqual(level.attempts.map((record) => [record.number, record.killer]), [[1, 'Hob'], [2, 'Davie'], [3, 'Rab']]);
  assert.equal(level.deaths, 3, 'the level counts its deaths as before');
  assert.equal(attemptCount(world), 4);
});

test('attempts: a death is recorded once, not once a step, however long the screen takes to wake him', () => {
  const world = dunnottar();
  fall(world, world.fighters[0], man(world, 'levy1').id);
  for (let step = 0; step < 30; step += 1) levelThink(world, 1 / 60);
  assert.equal(world.stage.level.attempts.length, 1);
  respawnPlayer(world);
  assert.equal(world.stage.level.attempts.length, 1);
});

test('attempts: after a rest, the next attempt begins at it; the record says where it began and the last rest reached', () => {
  const world = dunnottar();
  const level = world.stage.level;
  dieTo(world, 'levy1');
  restAtPoint(world, REST);
  dieTo(world, 'levy3');
  const [first, second] = level.attempts;
  assert.equal(first.from, null);
  assert.equal(second.from, null, 'he woke at the start: the rest was reached during it');
  assert.equal(second.rest, REST.name, 'the last rest he had reached');
  const log = attemptLog(world);
  assert.equal(log.final.from, REST.name, 'the third begins at the rest');
  assert.equal(log.final.number, 3);
});

test('attempts: the comrades with him at the start of an attempt are those the rest recorded; the ones who fell in it are said', () => {
  const world = dunnottar();
  const level = world.stage.level;
  fall(world, man(world, 'tobin'));
  dieTo(world, 'levy1');
  assert.deepEqual(level.attempts[0].comrades, ['Maren', 'Old Tobin']);
  assert.deepEqual(level.attempts[0].fallen, ['Old Tobin'], 'he fell before the operative did');
  // He was brought back: the second attempt began with both, and a rest while one lies dead leaves him out of the third.
  assert.deepEqual(level.attempt.comrades, ['Maren', 'Old Tobin']);
  fall(world, man(world, 'maren'));
  restAtPoint(world, REST);
  dieTo(world, 'levy3');
  assert.deepEqual(level.attempts[1].comrades, ['Maren', 'Old Tobin']);
  assert.deepEqual(level.attempts[1].fallen, ['Maren'], 'lost between the two rests');
  assert.deepEqual(level.attempt.comrades, ['Old Tobin'], 'she is lost for good');
});

test('attempts: a death with nobody to blame (the sea, a fall) has no killer, and its own words', () => {
  const world = dunnottar();
  fall(world, world.fighters[0], 0, 'lost to the sea', 'drowned');
  levelThink(world, 1 / 60);
  const [record] = world.stage.level.attempts;
  assert.equal(record.killer, null);
  assert.equal(record.cause, 'lost to the sea');
  assert.deepEqual(deathOf(world), { killer: null, cause: 'lost to the sea' });
});

test('attempts: a death out of every section still has a place: the one the stage last had awake', () => {
  const world = dunnottar();
  const me = world.fighters[0];
  placeOnFloor(me, -114, -4, DN_Y.start - 60, 0);
  fall(world, me, man(world, 'levy1').id);
  levelThink(world, 1 / 60);
  assert.equal(world.stage.level.attempts[0].section, 'cliff');
});

test('attempts: beginning again from the last rest by choice is not a failed attempt', () => {
  const world = dunnottar();
  restAtPoint(world, REST);
  assert.ok(restartFromRest(world));
  assert.equal(world.stage.level.attempts.length, 0);
  assert.equal(attemptCount(world), 1);
});

// ---- The generator ------------------------------------------------------------------------------------------------

/** A log as the recorder makes it, for the generator alone. */
function logOf(failed, final = {}) {
  return {
    start: 'The Cliff Path',
    failed: failed.map((record, at) => ({ number: at + 1, from: null, rest: null, section: 'cliff', place: 'The Cliff Path', killer: 'Hob', cause: 'is struck down', comrades: ['Maren', 'Old Tobin'], fallen: [], seconds: 120, time: 120, ...record })),
    final: { number: failed.length + 1, from: null, rest: null, comrades: ['Maren', 'Old Tobin'], survivors: ['Maren', 'Old Tobin'], seconds: 600, time: 700, ...final },
  };
}

test('story: the same log always tells the same story; a different log, a different one', () => {
  const log = logOf([{ killer: 'Sergeant Hay', place: 'The Quadrangle' }, { killer: 'Hob' }]);
  assert.equal(attemptStory(log), attemptStory(structuredClone(log)));
  assert.equal(attemptStory(log), attemptStory(log));
  const other = logOf([{ killer: 'Sergeant Hay', place: 'The Quadrangle' }, { killer: 'Davie' }]);
  assert.notEqual(attemptStory(log), attemptStory(other));
});

test('story: no deaths is a single one-night paragraph that names no failure, and ends below the keep with Caby', () => {
  const story = attemptStory(logOf([]));
  assert.ok(!story.includes('\n'), 'one paragraph');
  assert.match(story, /Maren and Old Tobin/);
  assert.match(story, /empty|held no one/);
  assert.match(story, /Caby/);
  assert.match(story, /new Noname waits/);
  assert.match(story, /whoever comes next/);
  assert.ok(!/prince|cell stood open|walked out/.test(story), story);
  assert.ok(!/second attempt|third|fell to|cut you down/.test(story), story);
  // The company at the end: none left, or alone from the start; those who lived wait at the chapel gate.
  assert.match(attemptStory(logOf([], { comrades: [], survivors: [] })), /alone|on your own|No one was left|no one left/);
  assert.match(attemptStory(logOf([], { survivors: ['Maren'] })), /Maren waited at the chapel gate; Old Tobin did not live to/);
  assert.match(attemptStory(logOf([], { survivors: ['Maren', 'Old Tobin'] })), /Maren and Old Tobin waited at the chapel gate/);
});

test('story: one death names where it began, who stood with you, who killed you and where, and ends on the last attempt', () => {
  const log = logOf([{ killer: 'Sergeant Hay', place: 'The Quadrangle', comrades: ['Maren'], fallen: ['Maren'], seconds: 400 }], { comrades: ['Maren', 'Old Tobin'], from: 'The Well' });
  const story = attemptStory(log);
  assert.match(story, /first (attempt|try)|On the first attempt/);
  assert.match(story, /Sergeant Hay/);
  assert.match(story, /the Quadrangle/);
  assert.match(story, /Cliff Path/);
  assert.match(story, /with Maren (beside you|at your side|at your back)/);
  assert.match(story, /Maren (fell before you|went down first|did not outlast you)/);
  assert.match(story, /second/);
  assert.ok(story.lastIndexOf('second') > story.indexOf('Sergeant Hay'), 'the last attempt comes after the failure');
  assert.match(story, /Caby/);
  assert.ok(story.indexOf('Caby') > story.lastIndexOf('second'), 'and the paragraph ends on the cesspool');
  assert.ok(!/prince|cell stood open/.test(story), story);
  assert.ok(!/Old Tobin/.test(story.slice(0, story.indexOf('second'))), 'he was not with her on the first');
});

test('story: many deaths are each named, in order, and the paragraph ends on the last attempt below the keep', () => {
  const killers = ['Hob', 'Davie', 'Rab', 'Sandy', 'Corporal Rae'];
  const places = ['The Cliff Path', 'The Gatehouse and the Oillets', 'The Tunnelled Ascent', 'The Quadrangle', 'The Tower House and the Upper Walls'];
  const log = logOf(killers.map((killer, at) => ({ killer, place: places[at], comrades: at < 3 ? ['Maren', 'Old Tobin'] : ['Old Tobin'], fallen: at === 2 ? ['Old Tobin'] : [] })), { comrades: ['Old Tobin'], survivors: ['Old Tobin'] });
  const story = attemptStory(log);
  let last = -1;
  for (const killer of killers) {
    const at = story.indexOf(killer);
    assert.ok(at > last, `${killer} is named, after the one before`);
    last = at;
  }
  for (const place of places) assert.ok(story.includes(place.replace(/^The /, 'the ')) || story.includes(place), place);
  for (const ordinal of ['first', 'second', 'third', 'fourth', 'fifth', 'sixth']) assert.ok(story.includes(ordinal), ordinal);
  assert.ok(story.lastIndexOf('sixth') > last, 'the sixth is the last');
  assert.match(story, /Old Tobin waited at the chapel gate/);
  assert.match(story, /new Noname waits/);
  assert.ok(!/prince|cell stood open/.test(story), story);
  assert.ok(story.trim().endsWith('.'));
  assert.ok(!story.includes('\n'));
});

test('story: the comrade lists are the names of those with him, however many', () => {
  const both = attemptStory(logOf([{ comrades: ['Maren', 'Old Tobin'] }]));
  assert.match(both, /Maren and Old Tobin/);
  const none = attemptStory(logOf([{ comrades: [] }], { comrades: [], survivors: [] }));
  assert.match(none, /alone|on your own/);
  assert.ok(!/Maren|Old Tobin/.test(none));
  const three = attemptStory(logOf([{ comrades: ['Maren', 'Old Tobin', 'One-Eye Colm'] }]));
  assert.match(three, /Maren, Old Tobin and One-Eye Colm/);
});

test('story: a killer called "The ..." reads right mid-sentence, and a death with no killer reads from its cause', () => {
  assert.match(attemptStory(logOf([{ killer: 'The Turnkey', place: 'Whigs\' Vault' }])), /the Turnkey/);
  const sea = attemptStory(logOf([{ killer: null, cause: 'lost to the sea', place: 'The Cliff Path' }]));
  assert.match(sea, /sea/);
  assert.ok(!/null|undefined/.test(sea));
  assert.match(attemptStory(logOf([{ killer: null, cause: 'collapsed from blood loss' }])), /bled out|wounds finished it/);
  assert.match(attemptStory(logOf([{ killer: null, cause: 'fell off the edge' }])), /fall ended it|over the edge/);
});

test('story: a long record is told by its first two and last two attempts and a line for the rest; the wording varies from log to log', () => {
  const ten = logOf(Array.from({ length: 10 }, (_, at) => ({ killer: `Guard ${at + 1}`, place: at % 2 ? 'The Quadrangle' : 'The Gatehouse and the Oillets' })));
  const story = attemptStory(ten);
  for (const name of ['Guard 1', 'Guard 2', 'Guard 9', 'Guard 10']) assert.ok(story.includes(name), name);
  assert.ok(!story.includes('Guard 5'), 'the middle is summed up');
  assert.match(story, /Six (more attempts|more nights)|After that came six/);
  assert.match(story, /eleventh/);
  const openers = new Set();
  for (let at = 0; at < 24; at += 1) openers.add(attemptStory(logOf([{ killer: `Man ${at}` }])).split(/[ ,]/).slice(0, 3).join(' '));
  assert.ok(openers.size >= 2, 'the same words are not used for every log');
  const finishes = new Set();
  for (let at = 0; at < 24; at += 1) finishes.add(attemptStory(logOf([{ killer: `Man ${at}` }])).split('. ').pop().slice(0, 12));
  assert.ok(finishes.size >= 2 || openers.size >= 3);
});

test('story: a run read from the real record tells the real night', () => {
  const world = dunnottar();
  dieTo(world, 'levy1');
  restAtPoint(world, REST);
  dieTo(world, 'levy3');
  const story = attemptStory(attemptLog(world));
  assert.match(story, /Hob/);
  assert.match(story, /Davie/);
  assert.match(story, /Gorge Brazier/);
  assert.match(story, /third/);
  assert.equal(story, attemptStory(attemptLog(world)));
});

test('the ending cards carry the story and the count, before the stage\'s end', () => {
  const plain = endingLines({ civiliansHarmed: false });
  const told = endingLines({ civiliansHarmed: false, attempts: { count: 3, story: 'A story.' } });
  assert.equal(told.length, plain.length + 2);
  assert.equal(told[told.length - 3], 'A story.');
  assert.equal(told[told.length - 2], 'Attempts: 3');
  assert.equal(told[told.length - 1], plain[plain.length - 1]);
  assert.equal(attemptsLine(1), 'Attempts: 1');
});
