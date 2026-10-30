// The recorded sound effects (src/audio/samples): small MP3 files, every set's files there, the events mapped to them (sfx/sampled.js)
// with their loudness, length and pitch following the event, the synth left for the rest; and the bundle carrying their bytes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { SAMPLE_FILES, SAMPLE_SETS, createSampleBank, transientStart } from '../src/audio/samples.js';
import { samplePlan } from '../src/audio/sfx/sampled.js';
import { SOUND_FAMILIES } from '../src/audio/families.js';

const DIR = 'src/audio/samples';
const FILE_CAP = 12 * 1024;
const TOTAL_CAP = 300 * 1024;
const half = () => 0.5;
const plan = (event) => samplePlan(event.type, SOUND_FAMILIES[event.type].params(event), event, half);

test('every sample is a small MP3 that is there, and nothing else is in the folder', () => {
  let total = 0;
  for (const name of SAMPLE_FILES) {
    const path = `${DIR}/${name}.mp3`;
    assert.ok(existsSync(path), `${path} is missing`);
    const bytes = readFileSync(path);
    assert.ok(bytes.length > 500 && bytes.length <= FILE_CAP, `${name}: ${bytes.length} bytes`);
    assert.ok(bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0, `${name}: no MPEG frame sync`);
    total += bytes.length;
  }
  assert.ok(total <= TOTAL_CAP, `${total} bytes in all`);
  const mp3s = readdirSync(DIR).filter((file) => file.endsWith('.mp3')).map((file) => file.replace(/\.mp3$/, ''));
  assert.deepEqual(mp3s.sort(), [...SAMPLE_FILES].sort());
  const readme = readFileSync(`${DIR}/README.md`, 'utf8');
  for (const name of SAMPLE_FILES) assert.ok(readme.includes(`${name}.mp3`), `README lists ${name}`);
});

test('the events a recording fits play it; the rest are left to the synth', () => {
  assert.equal(plan({ type: 'clash', speed: 10, a: 'blade', b: 'blade' }).set, 'clash');
  assert.equal(plan({ type: 'clash', speed: 10, a: 'blade', b: 'haft' }), null);
  assert.equal(plan({ type: 'hit', energy: 150, striker: 'blade', covering: 'flesh' }).set, 'slice');
  assert.equal(plan({ type: 'hit', energy: 150, striker: 'blunt', covering: 'flesh' }).set, 'bonehit');
  assert.equal(plan({ type: 'hit', energy: 300, striker: 'blade', covering: 'plate' }).set, 'break');
  assert.equal(plan({ type: 'hit', energy: 60, striker: 'fist', covering: 'flesh' }), null);
  assert.equal(plan({ type: 'hit', energy: 150, striker: 'blade', covering: 'mail' }), null);
  assert.equal(plan({ type: 'wound', kind: 'cut', severity: 0.8 }).set, 'gore');
  assert.equal(plan({ type: 'wound', kind: 'bone', severity: 0.8 }).set, 'bones');
  assert.equal(plan({ type: 'wound', kind: 'stab', severity: 0.8 }), null);
  const step = plan({ type: 'step', speed: 2, mass: 90, surface: 'sand', armour: 'plate' });
  assert.equal(step.set, 'armourstep');
  assert.equal(step.synth.armour, 'none', 'the ground with no recording (sand) still the synth, the armour the recording');
  assert.equal(plan({ type: 'step', speed: 2, mass: 80, surface: 'snow', armour: 'none' }), null);
  assert.equal(plan({ type: 'fall', mass: 85, speed: 4, surface: 'earth', armour: 'plate' }).set, 'clatter');
  assert.equal(plan({ type: 'clatter', speed: 3, mass: 1.2 }).set, 'clatter');
  assert.equal(plan({ type: 'swing', speed: 15, length: 0.7, mass: 1.6, head: 'blunt' }).set, 'maceswing');
  assert.equal(plan({ type: 'swing', speed: 22, length: 1, mass: 1.3, head: 'blade' }), null);
  assert.equal(plan({ type: 'shot', kind: 'matchlock' }).set, 'gunshot');
  assert.equal(plan({ type: 'shot', kind: 'bow' }), null);
  for (const set of ['clash', 'slice', 'bonehit', 'break', 'gore', 'bones', 'armourstep', 'clatter', 'maceswing', 'gunshot']) assert.ok(SAMPLE_SETS[set]?.length, set);
});

test('a harder event plays longer and louder; a heavier weapon lower', () => {
  const light = plan({ type: 'hit', energy: 10, striker: 'blade', covering: 'flesh', mass: 1.2 });
  const heavy = plan({ type: 'hit', energy: 300, striker: 'blade', covering: 'flesh', mass: 1.2 });
  assert.ok(heavy.seconds > light.seconds && heavy.fade > light.fade);
  const slow = plan({ type: 'clash', speed: 2, a: 'blade', b: 'blade', mass: 1.2 });
  const fast = plan({ type: 'clash', speed: 18, a: 'blade', b: 'blade', mass: 1.2 });
  assert.ok(fast.seconds > slow.seconds);
  const knife = plan({ type: 'hit', energy: 100, striker: 'blade', covering: 'flesh', mass: 0.3 });
  const axe = plan({ type: 'hit', energy: 100, striker: 'blade', covering: 'flesh', mass: 3 });
  assert.ok(axe.rate < 1 && knife.rate > 1, `${axe.rate} < 1 < ${knife.rate}`);
  // (The loudness itself is the family's level from the energy: the engine's gain, which the trim scales.)
  assert.ok(SOUND_FAMILIES.clash.params({ speed: 18, a: 'blade', b: 'blade' }).level > SOUND_FAMILIES.clash.params({ speed: 2, a: 'blade', b: 'blade' }).level);
  // Each take a little off at random.
  const rates = [0, 1].map((r) => samplePlan('clash', SOUND_FAMILIES.clash.params({ speed: 10, a: 'blade', b: 'blade' }), { mass: 1.2 }, () => r).rate);
  assert.ok(rates[1] / rates[0] > 1.08 && rates[1] / rates[0] < 1.2);
});

test('a footstep plays its ground\'s recording, walking or running by the pace, the armour\'s clank on top', () => {
  assert.equal(plan({ type: 'step', speed: 1.4, mass: 80, surface: 'stone', armour: 'none' }).set, 'step-stone-walk');
  assert.equal(plan({ type: 'step', speed: 5, mass: 80, surface: 'stone', armour: 'none' }).set, 'step-stone-run');
  assert.equal(plan({ type: 'step', speed: 1.4, mass: 80, surface: 'grass', armour: 'none' }).set, 'step-grass-walk');
  assert.equal(plan({ type: 'step', speed: 5, mass: 80, surface: 'earth', armour: 'none' }).set, 'step-grass-run');
  assert.equal(plan({ type: 'step', speed: 1.4, mass: 80, surface: 'mud', armour: 'none' }).set, 'step-mud');
  assert.equal(plan({ type: 'step', speed: 1.4, mass: 80, surface: 'water', depth: 0.3, armour: 'none' }).set, 'step-water');
  assert.equal(plan({ type: 'step', speed: 1.4, mass: 80, surface: 'wood', armour: 'none' }), null, 'no recording of boards: the synth');
  const plated = plan({ type: 'step', speed: 1.4, mass: 90, surface: 'stone', armour: 'plate' });
  assert.equal(plated.set, 'step-stone-walk');
  assert.deepEqual(plated.extra.map((layer) => layer.set), ['armourstep']);
  assert.equal(plan({ type: 'step', speed: 1.4, mass: 90, surface: 'sand', armour: 'plate' }).set, 'armourstep');
});

test('a heavier man\'s step is louder, lower and drawn out; a lighter man\'s quieter, shorter, crisper', () => {
  const light = plan({ type: 'step', speed: 1.4, mass: 50, surface: 'stone', armour: 'none' });
  const heavy = plan({ type: 'step', speed: 1.4, mass: 120, surface: 'stone', armour: 'none' });
  assert.ok(heavy.trim > light.trim * 2, `${heavy.trim} vs ${light.trim}`);
  assert.ok(heavy.rate <= 0.9 && light.rate > 1.05, `${heavy.rate} ${light.rate}`);
  assert.ok(heavy.share > light.share && heavy.fade > light.fade);
  // (And the step's own level already grows with the mass.)
  assert.ok(SOUND_FAMILIES.step.params({ speed: 1.4, mass: 120, surface: 'stone' }).level > SOUND_FAMILIES.step.params({ speed: 1.4, mass: 50, surface: 'stone' }).level);
  const run = plan({ type: 'step', speed: 5, mass: 80, surface: 'stone', armour: 'none' });
  const walk = plan({ type: 'step', speed: 1.4, mass: 80, surface: 'stone', armour: 'none' });
  assert.ok(run.trim > walk.trim && run.share < walk.share);
});

test('hooves: hard ground clops, soft ground thuds, by the gait; the neigh recorded, the snort synthesised', () => {
  const hoof = (surface, gait) => plan({ type: 'horse', kind: 'hoof', surface, gait, speed: 3, mass: 550 });
  assert.equal(hoof('stone', 'walk').set, 'hoof-stone');
  assert.equal(hoof('earth', 'gallop').set, 'hoof-soft');
  assert.equal(hoof('mud', 'trot'), null);
  assert.ok(hoof('grass', 'gallop').trim > hoof('grass', 'walk').trim);
  assert.equal(plan({ type: 'horse', kind: 'neigh', mass: 500 }).set, 'neigh');
  assert.equal(plan({ type: 'horse', kind: 'snort', mass: 500 }), null);
});

test('a decoded take starts at its transient, past any silence before it', () => {
  const data = new Float32Array(1000);
  data[480] = 0.9;
  assert.ok(Math.abs(transientStart(data, 1000) - 0.479) < 1e-9);
});

test('the bank decodes every file and picks only among the decoded', async () => {
  const embed = Object.fromEntries(SAMPLE_FILES.map((name) => [name, readFileSync(`${DIR}/${name}.mp3`).toString('base64')]));
  let decoded = 0;
  const ctx = { decodeAudioData: async (bytes) => (decoded += 1, { duration: bytes.byteLength / 5000, sampleRate: 1000, getChannelData: () => new Float32Array([0, 0, 0.5, 0.2]) }) };
  const bank = createSampleBank(ctx, { embed, random: () => 0 });
  assert.equal(await bank.ready, SAMPLE_FILES.length);
  assert.equal(decoded, SAMPLE_FILES.length);
  assert.equal(bank.pick('clash').offset, 0.001);
  assert.equal(bank.pick('nothing'), null);
});

test('the bundle carries every sample\'s bytes', { skip: !existsSync('dist/gladiator.html') && 'no dist/gladiator.html (node tools/bundle.js)' }, () => {
  const page = readFileSync('dist/gladiator.html', 'utf8');
  assert.ok(statSync('dist/gladiator.html').mtimeMs >= Math.max(...SAMPLE_FILES.map((name) => statSync(`${DIR}/${name}.mp3`).mtimeMs)), 'the bundle is older than the samples: rebuild it');
  for (const name of SAMPLE_FILES) assert.ok(page.includes(readFileSync(`${DIR}/${name}.mp3`).toString('base64')), `${name} is not in the bundle`);
});
