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

test('getting up: a fit man is up in 1.5-2.5 s; heavier for his strength, slower; plate slower than mail; a heavy or weak man presses a hand on his knee', () => {
  const athletic = rises(RISE_BUILDS.athletic);
  const average = rises(RISE_BUILDS.average);
  const overweight = rises(RISE_BUILDS.overweight);
  const obese = rises(RISE_BUILDS.obese);
  const plate = rises(RISE_BUILDS.plate);
  const mail = rises(RISE_BUILDS.mail);
  for (const [name, row] of Object.entries({ athletic, average, overweight, obese, plate, mail })) assert.equal(row.stood, row.runs.length, `${name} gets up every time`);
  assert.ok(athletic.time > 1.4 && athletic.time < 2.6, `a fit man ${athletic.time.toFixed(1)} s`);
  assert.ok(athletic.time < average.time && average.time < overweight.time && overweight.time < obese.time, `athletic ${athletic.time.toFixed(1)}, average ${average.time.toFixed(1)}, overweight ${overweight.time.toFixed(1)}, obese ${obese.time.toFixed(1)} s`);
  assert.ok(obese.time > 4 && obese.time < 8, `a heavy untrained man ${obese.time.toFixed(1)} s`);
  assert.ok(plate.time > mail.time && plate.time > average.time + 0.8, `plate ${plate.time.toFixed(1)}, mail ${mail.time.toFixed(1)}, average ${average.time.toFixed(1)} s`);
  assert.equal(athletic.braced, 0, 'a fit man stands off his legs alone');
  assert.equal(obese.braced, obese.runs.length, 'a heavy untrained man with a hand on his knee');
  assert.equal(plate.braced, plate.runs.length, 'and a man in plate');
});

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

test('running: top speed by build, as men run (an athletic man ~8.5 m/s, an average one 6-7, obese 3-4.5, plate 3-4.5), a stride of 3-4.5 steps a second', () => {
  const top = Object.fromEntries(Object.entries(GAIT_BUILDS).map(([name, inputs]) => [name, gaitBody(buildBody(inputs)).top]));
  assert.ok(top.athletic > 7.8 && top.athletic < 9.2, `athletic ${top.athletic.toFixed(2)}`);
  assert.ok(top.average > 5.8 && top.average < 7.2, `average ${top.average.toFixed(2)}`);
  assert.ok(top.obese > 3 && top.obese < 4.5, `obese ${top.obese.toFixed(2)}`);
  assert.ok(top.plate > 3 && top.plate < 4.5, `plate ${top.plate.toFixed(2)}`);
  assert.ok(top.athletic > top.average && top.average > top.overweight && top.overweight > top.obese, 'leaner and stronger, faster');
  assert.ok(top.gambeson > top.mail && top.gambeson > top.plate, 'armour slows him');
  assert.ok(top.light > top.sumo && top.athletic > top.old && top.light > top.starved, 'the sumo, the old and the starved are slow');
  // Measured: a sprint gets there, and its stride is a man's.
  for (const name of ['athletic', 'average', 'obese']) {
    const run = runTrial(GAIT_BUILDS[name], { seconds: 7 });
    assert.equal(run.fell, false);
    assert.ok(Math.abs(run.topSpeed / top[name] - 1) < 0.08, `${name}: ${run.topSpeed.toFixed(2)} m/s against ${top[name].toFixed(2)}`);
    assert.ok(run.stepRate > 2.5 && run.stepRate < 4.6, `${name}: ${run.stepRate.toFixed(2)} steps a second`);
  }
  // The stride lengthens and quickens with speed.
  const man = createWorld([GAIT_BUILDS.average, PRESETS.light], { seed: 1 }).fighters[0];
  const jog = strideOf(man, 3);
  const sprint = strideOf(man, 6.5);
  assert.ok(sprint.overlap < jog.overlap, 'more flight at a sprint');
  assert.ok(1 / (sprint.overlap * sprint.seconds) > 1 / (jog.overlap * jog.seconds), 'quicker steps');
  assert.ok(sprint.lift > jog.lift, 'the heel comes up higher');
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
