// The recorded cries and the army's charge: the sets there and embedded, a woman's voice a woman's, pitched by the body, rationed (a
// budget, a cooldown, light blows silent, adrenaline masking pain, a weaker man crying more), machines silent; the charge only from a
// large side running at the enemy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { P } from '../src/body.js';
import { SAMPLE_SETS } from '../src/audio/samples.js';
import { samplePlan } from '../src/audio/sfx/sampled.js';
import { SOUND_FAMILIES, soundCandidates } from '../src/audio/families.js';
import { CRY_KINDS, cryRate } from '../src/audio/sfx/voice.js';
import { CRIES, createCryDirector, cryPain, hurtChance } from '../src/audio/cries.js';
import { CHARGE, chargeOf } from '../src/audio/charge.js';
import { createListener } from '../src/audio/ear.js';

const SEXES = ['male', 'female'];

/** A seeded random. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A fighter enough for the director and the charge: his head and pelvis at (x, z), going (vx, vz). */
function man(id, x, z, { sex = 'male', height = 1.78, mass = 80, age = 30, exercise = 0.5, corner = 'red', machine = false, vx = 0, vz = 0, adrenaline = 0 } = {}) {
  const n = Object.keys(P).length + 2;
  const at = new Float64Array(n * 3);
  const v = new Float64Array(n * 3);
  for (let k = 0; k < n; k += 1) {
    at[k * 3] = x;
    at[k * 3 + 1] = k === P.head ? 1.65 : 1;
    at[k * 3 + 2] = z;
    v[k * 3] = vx;
    v[k * 3 + 2] = vz;
  }
  return { id, corner, state: 'up', x: at, v, adrenaline, body: { heightM: height, bodyMassKg: mass, inputs: { sex, age, exercise }, gear: machine ? { machine: true } : {} } };
}

const struck = (fighter, energy, t, covering = 'flesh') => ({ type: 'voice', kind: 'struck', strength: 0.6, energy, covering, who: fighter.id, t, x: fighter.x[P.head * 3], y: 1.65, z: fighter.x[P.head * 3 + 2] });

test('the cry sets are there for each sex and kind, the charge loop too, and the bundle carries them', () => {
  for (const sex of SEXES) for (const kind of Object.keys(CRY_KINDS)) assert.ok(SAMPLE_SETS[`voice-${sex}-${kind}`]?.length >= 2, `voice-${sex}-${kind}`);
  assert.deepEqual(SAMPLE_SETS.charge, ['charge-1']);
  if (!existsSync('dist/gladiator.html')) return;
  const page = readFileSync('dist/gladiator.html', 'utf8');
  for (const name of [...SAMPLE_SETS['voice-female-scream'], ...SAMPLE_SETS['voice-male-hurt'], 'charge-1']) assert.ok(page.includes(readFileSync(`src/audio/samples/${name}.mp3`).toString('base64')), `${name} in the bundle`);
});

test('a woman cries with the woman\'s takes, a man with the man\'s; an effort has none', () => {
  const director = createCryDirector({ random: () => 0 });
  const listener = createListener();
  const her = man(0, 1, 0, { sex: 'female' });
  const him = man(1, -1, 0);
  const out = director.tick([{ type: 'voice', kind: 'death', who: 0, t: 0, x: 1, y: 1.6, z: 0 }], [her, him], listener, 0);
  assert.equal(out[0].cry.sex, 'female');
  const plan = (event) => samplePlan('voice', SOUND_FAMILIES.voice.params(event), event, () => 0.5);
  assert.equal(plan(out[0]).set, 'voice-female-dying');
  assert.equal(plan({ type: 'voice', kind: 'struck', strength: 0.8, size: 1.8, mass: 85 }).set, 'voice-male-hurt');
  assert.equal(plan({ type: 'voice', kind: 'wound', strength: 0.8, sex: 'female' }).set, 'voice-female-scream');
  assert.equal(plan({ type: 'voice', kind: 'effort', strength: 1 }), null);
  assert.equal(soundCandidates([{ type: 'voice', kind: 'effort', strength: 1, x: 0, y: 1.6, z: -1, t: 0 }], listener).length, 0, 'an effort is not played');
});

test('the pitch follows the body: bigger and older lower, a child higher, each man his own voice', () => {
  const base = { sex: 'male', height: 1.78, mass: 80, age: 30, id: 1 };
  assert.ok(cryRate({ ...base, height: 1.95, mass: 110 }) < cryRate(base));
  assert.ok(cryRate({ ...base, height: 1.6, mass: 60 }) > cryRate(base));
  assert.ok(cryRate({ ...base, age: 62 }) < cryRate(base));
  assert.ok(cryRate({ ...base, age: 13 }) > cryRate(base));
  assert.equal(cryRate(base), cryRate(base), 'the same man the same voice');
  assert.notEqual(cryRate(base), cryRate({ ...base, id: 2 }), 'another man another');
  assert.ok(Math.abs(cryRate(base, 1) / cryRate(base) - 1) < 0.05, 'each cry a little off his voice');
});

test('a light blow is mostly silent; the same blow makes a weaker man cry more; adrenaline masks it', () => {
  const average = man(0, 0, 0);
  const strong = man(1, 0, 0, { mass: 105, exercise: 0.9 });
  const weak = man(2, 0, 0, { mass: 55, exercise: 0.1, age: 60 });
  assert.ok(hurtChance(cryPain(average, 15)) < 0.05, `a jab: ${hurtChance(cryPain(average, 15))}`);
  assert.equal(hurtChance(cryPain(average, 60, 'plate')), 0, 'a blow turned by plate hurts little');
  const blow = 60;
  assert.ok(cryPain(weak, blow) > cryPain(average, blow) && cryPain(average, blow) > cryPain(strong, blow));
  assert.ok(hurtChance(cryPain(weak, blow)) > 2 * hurtChance(cryPain(strong, blow)), `weak ${hurtChance(cryPain(weak, blow))} strong ${hurtChance(cryPain(strong, blow))}`);
  const hard = cryPain(average, 150);
  assert.ok(hurtChance(hard, 1) < 0.3 * hurtChance(hard, 0), 'adrenaline masks the pain');
  // Through the director: many such blows, the weak man cries more often than the strong one, and the hot one least.
  const counts = { weak: 0, strong: 0, hot: 0 };
  const hot = man(0, 0, 0, { adrenaline: 0.9 });
  const random = seeded(5);
  for (let k = 0; k < 400; k += 1) {
    for (const [name, fighter] of [['weak', { ...weak, id: 0 }], ['strong', { ...strong, id: 0 }], ['hot', hot]]) {
      const out = createCryDirector({ random }).tick([struck(fighter, 70, 0)], [fighter], createListener(), 0);
      counts[name] += out.filter((e) => e.cry).length;
    }
  }
  assert.ok(counts.weak > 1.5 * counts.strong, JSON.stringify(counts));
  assert.ok(counts.hot < counts.strong + counts.weak && counts.hot < 0.5 * counts.weak, JSON.stringify(counts));
});

test('machines never cry', () => {
  const director = createCryDirector({ random: () => 0 });
  const robot = man(0, 1, 0, { machine: true });
  const out = director.tick([struck(robot, 400, 0), { type: 'voice', kind: 'death', who: 0, t: 0, x: 1, y: 1.6, z: 0 }], [robot], createListener(), 0);
  assert.equal(out.filter((e) => e.type === 'voice').length, 0);
});

/** Run the director over `seconds` of a fight: `fighters` round the ear, each tick a share of them struck by a blow of random energy. Returns cries a minute and the most at once. */
function simulate(fighters, { seconds = 120, hitsPerManPerSecond = 0.6, seed = 3 } = {}) {
  const random = seeded(seed);
  const director = createCryDirector({ random });
  const listener = createListener();
  listener.y = 1.65;
  const dt = 1 / 30;
  let cries = 0;
  let most = 0;
  const ends = [];
  for (let t = 0; t < seconds; t += dt) {
    const events = [];
    for (const fighter of fighters) if (random() < hitsPerManPerSecond * dt) events.push(struck(fighter, 5 * (80 / 5) ** random(), t));
    const out = director.tick(events, fighters, listener, t).filter((e) => e.cry);
    for (const e of out) ends.push(t + e.cry.delay + CRY_KINDS[e.cry.kind].seconds / e.cry.rate);
    cries += out.length;
    most = Math.max(most, ends.filter((end) => end > t).length);
  }
  return { perMinute: (cries * 60) / seconds, most };
}

test('the budget: a duel is heard now and then, a battle no louder; never more cries at once than the budget', () => {
  const duel = simulate([man(0, 1.5, -2), man(1, -0.5, -2.5, { sex: 'female' })], { hitsPerManPerSecond: 0.5 });
  const army = [];
  const random = seeded(11);
  for (let i = 0; i < 120; i += 1) army.push(man(i, (random() - 0.5) * 60, (random() - 0.5) * 60, { corner: i % 2 ? 'red' : 'blue' }));
  const battle = simulate(army, { hitsPerManPerSecond: 0.5 });
  console.log(`cries a minute: duel ${duel.perMinute.toFixed(1)} (most at once ${duel.most}), battle of 120 ${battle.perMinute.toFixed(1)} (most at once ${battle.most})`);
  assert.ok(duel.most <= CRIES.budget.few && battle.most <= CRIES.budget.battle, JSON.stringify({ duel, battle }));
  assert.ok(duel.perMinute > 2 && duel.perMinute < 30, `duel ${duel.perMinute}`);
  assert.ok(battle.perMinute < 25, `battle ${battle.perMinute}`);
});

test('a man who just cried is silent a while, however he is hit', () => {
  const director = createCryDirector({ random: () => 0 });
  const him = man(0, 1, -1, { mass: 55, exercise: 0 });
  const listener = createListener();
  let heard = 0;
  for (let t = 0; t < CRIES.cooldown.hurt; t += 0.1) heard += director.tick([struck(him, 300, t)], [him], listener, t).filter((e) => e.cry).length;
  assert.equal(heard, 1);
});

test('the charge: only a large side running at the enemy, louder the more, gone as the lines meet', () => {
  const listener = createListener();
  const line = (count, corner, z, vz) => Array.from({ length: count }, (_, i) => man(i + (corner === 'red' ? 0 : 1000), (i - count / 2) * 1.2, z, { corner, vz }));
  const big = chargeOf([...line(30, 'red', -10, -4), ...line(30, 'blue', -60, 0)], listener);
  assert.ok(big.red.charging && big.red.count === 30 && Number.isFinite(big.red.level), JSON.stringify(big.red));
  assert.equal(big.blue.charging, false, 'a side standing does not roar');
  const bigger = chargeOf([...line(80, 'red', -10, -4), ...line(30, 'blue', -60, 0)], listener);
  assert.ok(bigger.red.level > big.red.level);
  const small = chargeOf([...line(8, 'red', -10, -4), ...line(8, 'blue', -60, 0)], listener);
  assert.equal(small.red.charging, false, 'a brawl of a few never');
  const duel = chargeOf([man(0, 0, -3, { vz: -4 }), man(1, 0, -12, { corner: 'blue' })], listener);
  assert.equal(duel.red.charging, false);
  const met = chargeOf([...line(30, 'red', -10, -4), ...line(30, 'blue', -10 - CHARGE.met - 0.5, 0)], listener);
  assert.ok(met.red.level === -Infinity || met.red.fade < 0.1, 'the lines met: faded');
  const robots = chargeOf([...line(30, 'red', -10, -4).map((f) => ({ ...f, body: { ...f.body, gear: { machine: true } } })), ...line(30, 'blue', -60, 0)], listener);
  assert.equal(robots.red.charging, false, 'machines do not roar');
});
