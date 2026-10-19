// Level mode, the boss-defeat cutscene (levelmode/cutscene.js): the pure state machine over real seconds. Its phases advance with the
// config's timings, time slows on the blow and is never stopped, the strike and the cards come when due, it skips (after a second),
// control returns and the doors are offered at its return, and the stage's ending is the world's side of it (ending.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { CUTSCENE, createCutscene, cutsceneHolds, cutsceneLength, cutsceneLook, cutscenePhase, cutsceneSpeed, skipCutscene, stepCutscene } from '../src/levelmode/cutscene.js';

/** Step a cutscene for `seconds` in 1/60 s frames; the events it fired, in order, each with the time it came. */
function play(cutscene, seconds, dt = 1 / 60) {
  const fired = [];
  for (let at = 0; at < seconds - 1e-9; at += dt) for (const event of stepCutscene(cutscene, dt)) fired.push([event, Number(cutscene.time.toFixed(2))]);
  return fired;
}
const nearly = (actual, wanted, tolerance, message) => assert.ok(Math.abs(actual - wanted) <= tolerance, `${message}: ${actual} against ${wanted}`);

test('cutscene: its length is what the brief asks (6 to 9 s) and every phase has a reason in the config', () => {
  const length = cutsceneLength();
  assert.ok(length >= 6 && length <= 9, `${length} s`);
  assert.deepEqual(CUTSCENE.phases.map((phase) => phase.id), ['blow', 'fall', 'title', 'return']);
  assert.equal(CUTSCENE.phases[0].seconds, 1.2, 'the slow-motion on the blow lasts about 1.2 s');
  assert.equal(CUTSCENE.speed.blow, 0.25, 'a quarter speed');
  assert.ok(CUTSCENE.skipAfter >= 1);
});

test('cutscene: the phases advance with the configured timings, and each event comes when it is due', () => {
  const cutscene = createCutscene();
  assert.equal(cutscenePhase(cutscene), 'blow');
  const fired = play(cutscene, cutsceneLength() + 0.5);
  assert.equal(cutscenePhase(cutscene), 'done');
  assert.ok(cutscene.done);
  assert.deepEqual(fired.map(([event]) => event), ['start', 'strike', 'title', 'line', 'return', 'done']);
  const at = Object.fromEntries(fired);
  const [blow, fall, title] = CUTSCENE.phases.map((phase) => phase.seconds);
  nearly(at.start, 0, 0.05, 'starts at once');
  nearly(at.strike, blow + CUTSCENE.strikeAt, 0.05, 'the strike falls just after he starts to fall');
  nearly(at.title, blow + fall, 0.05, 'the title');
  nearly(at.line, blow + fall + CUTSCENE.lineAt, 0.05, 'the narration after it');
  nearly(at.return, blow + fall + title, 0.05, 'control returns');
  nearly(at.done, cutsceneLength(), 0.05, 'and it is over');
  // Phase by phase.
  const walk = createCutscene();
  play(walk, blow - 0.1);
  assert.equal(cutscenePhase(walk), 'blow');
  play(walk, 0.2);
  assert.equal(cutscenePhase(walk), 'fall');
  play(walk, fall);
  assert.equal(cutscenePhase(walk), 'title');
  play(walk, title);
  assert.equal(cutscenePhase(walk), 'return');
  // A long frame (a stalled tab) does not lose an event.
  const jumpy = createCutscene();
  assert.deepEqual(stepCutscene(jumpy, 20), ['start', 'strike', 'title', 'line', 'return', 'done']);
});

test('cutscene: time slows to a quarter on the blow, eases up through the fall and the title, and is never stopped', () => {
  const cutscene = createCutscene();
  const speeds = [];
  for (let step = 0; step < cutsceneLength() * 60 + 30; step += 1) {
    stepCutscene(cutscene, 1 / 60);
    speeds.push([cutscenePhase(cutscene), cutsceneSpeed(cutscene)]);
  }
  assert.ok(speeds.every(([, speed]) => speed >= CUTSCENE.speed.blow - 1e-9 && speed <= 1 + 1e-9), 'never frozen, never faster than life');
  const during = (id) => speeds.filter(([phase]) => phase === id).map(([, speed]) => speed);
  assert.ok(during('blow').every((speed) => speed === CUTSCENE.speed.blow), 'the blow is at a quarter');
  const fall = during('fall');
  assert.ok(fall[0] < fall.at(-1) && fall.every((speed, index) => index === 0 || speed >= fall[index - 1] - 1e-9), 'the fall eases up');
  assert.ok(fall.at(-1) <= CUTSCENE.speed.fall + 1e-9);
  const title = during('title');
  assert.ok(title.at(-1) > CUTSCENE.speed.title && title.at(-1) <= 1);
  assert.equal(during('return').at(-1), 1);
  assert.equal(cutsceneSpeed(cutscene), 1, 'and normal once it is through');
});

test('cutscene: the screen is as it should be through it (bars, swing, cards, shake, flash)', () => {
  const cutscene = createCutscene();
  const looks = [];
  for (let step = 0; step < cutsceneLength() * 60 + 30; step += 1) {
    stepCutscene(cutscene, 1 / 60);
    looks.push({ phase: cutscenePhase(cutscene), time: cutscene.time, ...cutsceneLook(cutscene) });
  }
  const at = (time) => looks.reduce((best, look) => (Math.abs(look.time - time) < Math.abs(best.time - time) ? look : best));
  for (const look of looks) for (const key of ['bars', 'swing', 'title', 'line', 'flash']) assert.ok(look[key] >= 0 && look[key] <= 1 + 1e-9, `${key} ${look[key]}`);
  assert.equal(at(0.02).title, 0);
  assert.ok(at(1.0).bars > 0.9 && at(1.0).swing > 0.9, 'bars closed and the camera on the boss by the end of the blow');
  const strike = CUTSCENE.phases[0].seconds + CUTSCENE.strikeAt;
  assert.ok(at(strike + 0.02).flash > 0.5, 'the white of the strike');
  assert.ok(at(strike + CUTSCENE.flash.seconds + 0.1).flash === 0, 'and it clears');
  assert.ok(at(strike + 0.02).shake > at(strike + 1.5).shake, 'the thunder dies away');
  assert.ok(at(1.0).flash === 0, 'no flash before the strike');
  const titleAt = CUTSCENE.phases[0].seconds + CUTSCENE.phases[1].seconds;
  assert.ok(at(titleAt + 1).title > 0.95, 'the title is up');
  assert.ok(at(titleAt + 1).line < 0.2, 'the narration waits for the title to settle');
  assert.ok(at(titleAt + CUTSCENE.lineAt + CUTSCENE.fade.in + 0.05).line > 0.95, 'and is up after');
  assert.ok(at(titleAt + CUTSCENE.phases[2].seconds - 0.02).title < 0.05, 'the cards are gone by the time he is given back the camera');
  assert.ok(at(titleAt + CUTSCENE.phases[2].seconds + CUTSCENE.phases[3].seconds * 0.5).swing < 0.6, 'the camera is on its way back');
  const last = looks.at(-1);
  assert.deepEqual([last.bars, last.swing, last.title, last.line, last.flash, last.shake], [0, 0, 0, 0, 0, 0], 'nothing is left on the screen');
});

test('cutscene: a tap skips it, but not in the first second; a skipped scene returns at once and clears its cards', () => {
  const early = createCutscene();
  play(early, CUTSCENE.skipAfter - 0.1);
  assert.equal(skipCutscene(early), false, 'too soon');
  assert.equal(early.skipped, false);
  play(early, 0.2);
  assert.equal(skipCutscene(early), true);
  assert.equal(skipCutscene(early), false, 'once');
  assert.equal(cutscenePhase(early), 'return');
  assert.equal(cutsceneSpeed(early), 1, 'the world is at full speed');
  const fired = play(early, 2);
  assert.ok(early.done);
  assert.ok(fired.map(([event]) => event).includes('return') && fired.at(-1)[0] === 'done');
  nearly(fired.at(-1)[1] - CUTSCENE.skipAfter, CUTSCENE.skipReturn, 0.4, 'a shortened return');
  // A skip in the middle of the title takes the cards down from where they stood.
  const late = createCutscene();
  play(late, CUTSCENE.phases[0].seconds + CUTSCENE.phases[1].seconds + 1.6);
  const shown = cutsceneLook(late);
  assert.ok(shown.title > 0.9 && shown.line > 0.3);
  assert.ok(skipCutscene(late));
  assert.equal(cutsceneLook(late).title, shown.title, 'the same card, fading from there');
  play(late, CUTSCENE.skipReturn + 0.1);
  assert.equal(cutsceneLook(late).title, 0);
  // Skipped before the strike: it is dropped (no flash from nowhere).
  const before = createCutscene();
  play(before, CUTSCENE.skipAfter + 0.05);
  skipCutscene(before);
  const events = play(before, 2).map(([event]) => event);
  assert.ok(!events.includes('strike') && !events.includes('title'), `${events}`);
  assert.ok(events.includes('return') && events.includes('done'));
});

test('cutscene: the player is held until the return, and free for it (control comes back as the camera does)', () => {
  const cutscene = createCutscene();
  assert.equal(cutsceneHolds(cutscene), true);
  play(cutscene, cutsceneLength() - CUTSCENE.phases[3].seconds - 0.1);
  assert.equal(cutsceneHolds(cutscene), true);
  play(cutscene, 0.2);
  assert.equal(cutscenePhase(cutscene), 'return');
  assert.equal(cutsceneHolds(cutscene), false);
  play(cutscene, 2);
  assert.equal(cutsceneHolds(cutscene), false);
  assert.ok(cutsceneLook(cutscene).hold === false);
});
