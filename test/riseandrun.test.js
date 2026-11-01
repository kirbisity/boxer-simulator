// Getting up and running from the body (physics/rising.js, physics/gait.js): a staged rise whose pace is strength against
// weight (with all he wears), injured limbs changing it, and a run whose speed, start, stop and stride follow leg power,
// mass and leg length. Measured with the tools' own trials (tools/getting-up.js riseAlone, tools/gait.js runTrial).

import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { advance, breakJoint, createWorld, deliverImpulse, placeFighter } from '../src/physics.js';
import { gaitBody, runSpeed, strideOf } from '../src/physics/gait.js';
import { riseMargins, stagePace } from '../src/physics/rising.js';
import { buildBody } from '../src/body.js';
import { RISE_BUILDS, riseAlone } from '../tools/getting-up.js';
import { GAIT_BUILDS, runTrial } from '../tools/gait.js';

const SEEDS = [0, 1, 2];
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

/** Falls and rises of one build (RISE_BUILDS entry), over a few seeds: { stood, time (mean of those who stood), braced, crawled }. */
function rises(entry, seconds = 30) {
  const { inputs, setup } = entry.inputs ? entry : { inputs: entry };
  const runs = SEEDS.map((seed) => riseAlone(inputs, seed, seconds, { setup })).filter((run) => run.fell);
  const stood = runs.filter((run) => run.stood);
  return { runs, stood: stood.length, time: stood.length ? mean(stood.map((run) => run.time)) : Infinity, braced: runs.filter((run) => run.braced).length, crawled: runs.filter((run) => run.crawling).length };
}

test('getting up: the starved man is slow and the frail one cannot stand (he crawls or lies): never stuck, never NaN', () => {
  const starved = rises(RISE_BUILDS.starved);
  const light = rises(RISE_BUILDS.light);
  assert.ok(starved.time > light.time * 1.8, `starved ${starved.time.toFixed(1)} s against a light man's ${light.time.toFixed(1)}`);
  const frail = rises(RISE_BUILDS.frail, 40);
  assert.ok(frail.stood < frail.runs.length, `the frail man fails at least once (${frail.stood} of ${frail.runs.length} stood)`);
  for (const run of frail.runs) assert.ok(run.stood || run.crawling || run.tries >= 3, `up, crawling or trying again (${JSON.stringify(run.stalls)})`);
  // The very weakest: he gives it up and lies (out of the fight), every part finite, trying again after a long rest.
  const world = createWorld([{ ...GAIT_BUILDS.starved, calories: 1200 }, PRESETS.light], { seed: 9 });
  const man = world.fighters[0];
  placeFighter(world.fighters[1], 4);
  advance(world, 0.5);
  deliverImpulse({ fighter: man, shares: [[P.neck, 1], [P.pelvis, 0.3]], direction: [1, 0.1, 0], impulse: 120 });
  const states = new Set();
  for (let second = 0; second < 60; second += 1) {
    advance(world, 1);
    states.add(man.state);
    assert.ok(man.x.every(Number.isFinite), 'no NaN');
  }
  assert.ok(states.has('rising') && states.has('down'), `he tries and sinks back (${[...states]})`);
  assert.ok(man.floored || man.crawling || man.state === 'up', 'given up for now (floored), crawling, or up');
  assert.notEqual(man.state, 'rising', 'not caught half up');
});

test('getting up with an injury: a broken arm pushes up on the other, slower; a hurt leg comes up on the good one; a broken knee crawls', () => {
  const sound = rises(RISE_BUILDS.average);
  const arm = rises(RISE_BUILDS['average, broken arm']);
  assert.equal(arm.stood, arm.runs.length);
  assert.ok(arm.time > sound.time + 0.3, `broken arm ${arm.time.toFixed(1)} s against ${sound.time.toFixed(1)}`);
  const leg = rises(RISE_BUILDS['average, hurt leg']);
  assert.ok(leg.time > sound.time * 1.5, `hurt leg ${leg.time.toFixed(1)} s`);
  const knee = rises(RISE_BUILDS['average, broken knee']);
  assert.equal(knee.stood, 0, 'not on a broken knee');
  assert.equal(knee.crawled, knee.runs.length, 'he crawls');
  // The leg he rises on is the sound one, and the push is all on the arm that is whole.
  const world = createWorld([GAIT_BUILDS.average, PRESETS.light], { seed: 3 });
  const man = world.fighters[0];
  man.legDamage.l = 1e6;
  assert.equal(riseMargins(man).lead, 'r');
  breakJoint(world, man, 'rElbow');
  const whole = riseMargins(createWorld([GAIT_BUILDS.average, PRESETS.light], { seed: 3 }).fighters[0]);
  assert.ok(riseMargins(man).push < whole.push * 0.75, 'one arm to push with');
});

test('getting up: each stage is slower the nearer the limbs are to their limit, and armour is weight to lift', () => {
  assert.equal(stagePace(3), 1);
  assert.ok(stagePace(1.2) > stagePace(1.4) && stagePace(1.4) > 1);
  const knight = createWorld([PRESETS.knight, PRESETS.light], { seed: 1 }).fighters[0];
  const unarmoured = createWorld([{ ...PRESETS.knight, outfit: { kind: 'sports' } }, PRESETS.light], { seed: 1 }).fighters[0];
  assert.ok(riseMargins(knight).stand < riseMargins(unarmoured).stand * 0.8, 'the same man lifts his harness too');
});

test('running: an AI man runs at a pace below his sprint, more of it the better his wind; a heavy man needs more ground to stop from the same speed', () => {
  const fit = createWorld([GAIT_BUILDS.athletic, PRESETS.light], { seed: 1 }).fighters[0];
  const unfit = createWorld([GAIT_BUILDS.obese, PRESETS.light], { seed: 1 }).fighters[0];
  assert.ok(runSpeed(fit, false) < runSpeed(fit, true) * 0.75);
  assert.ok(runSpeed(fit, false) / runSpeed(fit, true) > runSpeed(unfit, false) / runSpeed(unfit, true), 'the fitter runs nearer his sprint');
  const stop = (inputs) => {
    let pace = 1;
    runTrial(inputs, { seconds: 0.7, setup: (me) => { pace = 3 / runSpeed(me, true); } });
    return runTrial(inputs, { seconds: 5, pace }).stopping;
  };
  const athletic = stop(GAIT_BUILDS.athletic);
  assert.ok(stop(GAIT_BUILDS.obese) > athletic * 1.3, 'the obese man');
  assert.ok(stop(GAIT_BUILDS.plate) > athletic * 1.3, 'the man in plate');
});

test('running: a tired man and a hurt leg run slower; the same run twice is the same run', () => {
  const fresh = runTrial(GAIT_BUILDS.average, { seconds: 6 });
  const tired = runTrial(GAIT_BUILDS.average, { seconds: 6, setup: (me) => { me.stamina = 0; } });
  const limping = runTrial(GAIT_BUILDS.average, { seconds: 6, setup: (me) => { me.legDamage.r = 1e6; } });
  assert.ok(tired.topSpeed < fresh.topSpeed * 0.95, `spent ${tired.topSpeed.toFixed(2)} against ${fresh.topSpeed.toFixed(2)} m/s`);
  assert.ok(limping.topSpeed < fresh.topSpeed * 0.8, `a hurt leg ${limping.topSpeed.toFixed(2)} m/s`);
  assert.equal(limping.fell, false, 'he hobbles, he does not fall');
  assert.deepEqual(runTrial(GAIT_BUILDS.average, { seconds: 6 }), fresh, 'deterministic');
});

test('getting up from a crawl he was put on his knees by: he tries from his knees when his legs will bear him (the player asking, or by himself later)', async () => {
  const { playerCrawl } = await import('../src/control.js');
  const { startCrawl } = await import('../src/physics.js');
  const world = createWorld([GAIT_BUILDS.average, PRESETS.light], { seed: 4 });
  const man = world.fighters[0];
  placeFighter(world.fighters[1], 6);
  advance(world, 0.5);
  startCrawl(world, man, 'cannot get up: crawls');
  man.crawlWeak = true;
  advance(world, 1);
  // Legs worn to nothing and spent: not yet.
  man.legDamage.l = man.legDamage.r = 1e6;
  man.stamina = 0;
  assert.equal(playerCrawl(world, man, false), false, 'his legs will not bear him');
  assert.equal(man.crawling, true);
  // Sound again: he comes up off his knees, a foot through and up, and stands.
  man.legDamage.l = man.legDamage.r = 0;
  man.stamina = 1;
  assert.equal(playerCrawl(world, man, false), true);
  assert.equal(man.state, 'rising');
  assert.equal(man.rise.stage, 'step');
  for (let second = 0; second < 8 && man.state !== 'up'; second += 0.5) advance(world, 0.5);
  assert.equal(man.state, 'up');
  assert.equal(man.crawling, false);
  assert.ok(man.x.every(Number.isFinite));
});
