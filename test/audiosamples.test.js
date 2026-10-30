// The recorded sound effects (src/audio/samples): small MP3 files, every set's files there, the events mapped to them (sfx/sampled.js)
// with their loudness, length and pitch following the event, the synth left for the rest; and the bundle carrying their bytes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { LOOP_FILES, SAMPLE_FILES, SAMPLE_SETS, createSampleBank, transientStart } from '../src/audio/samples.js';
import { playSample, playWithSamples, samplePlan } from '../src/audio/sfx/sampled.js';
import { SOUND_FAMILIES } from '../src/audio/families.js';

const DIR = 'src/audio/samples';
// (A thunder's roar is the longest take, 2.6 s.)
const FILE_CAP = 16 * 1024;
// (Room for the voices and the looping ambience beds coming in; the one-shot takes alone are ~300 KB.)
const TOTAL_CAP = 700 * 1024;
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
  assert.deepEqual(mp3s.sort(), [...SAMPLE_FILES, ...LOOP_FILES].sort());
  const readme = readFileSync(`${DIR}/README.md`, 'utf8');
  for (const name of SAMPLE_FILES) assert.ok(readme.includes(`${name}.mp3`), `README lists ${name}`);
});

test('the events a recording fits play it; the rest are left to the synth', () => {
  assert.equal(plan({ type: 'clash', speed: 10, a: 'blade', b: 'blade' }).set, 'clash');
  assert.equal(plan({ type: 'hit', energy: 150, striker: 'blade', covering: 'flesh' }).set, 'slice');
  assert.equal(plan({ type: 'hit', energy: 150, striker: 'blunt', covering: 'flesh' }).set, 'bonehit');
  assert.equal(plan({ type: 'hit', energy: 300, striker: 'blade', covering: 'plate' }).set, 'break');
  assert.equal(plan({ type: 'hit', energy: 60, striker: 'fist', covering: 'plate' }), null);
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
  for (const set of ['clash', 'slice', 'bonehit', 'break', 'gore', 'bones', 'armourstep', 'clatter', 'maceswing', 'gunshot', 'step-heel', 'helmet', 'woodshield', 'punch', 'fistswing', 'thunder']) assert.ok(SAMPLE_SETS[set]?.length, set);
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
  assert.equal(plan({ type: 'step', speed: 1.4, mass: 80, surface: 'wood', armour: 'none' }), null, 'no recording of boards (the ring\'s canvas): the synth');
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
  const embed = Object.fromEntries([...SAMPLE_FILES, ...LOOP_FILES].map((name) => [name, readFileSync(`${DIR}/${name}.mp3`).toString('base64')]));
  let decoded = 0;
  const ctx = { decodeAudioData: async (bytes) => (decoded += 1, { duration: bytes.byteLength / 5000, sampleRate: 1000, getChannelData: () => new Float32Array([0, 0, 0.5, 0.2]) }) };
  const bank = createSampleBank(ctx, { embed, random: () => 0 });
  assert.equal(await bank.ready, SAMPLE_FILES.length + LOOP_FILES.length);
  assert.equal(decoded, SAMPLE_FILES.length + LOOP_FILES.length);
  assert.deepEqual([bank.loop('rain').loopStart, bank.loop('rain').loopEnd], [0.25, 0.25 + 9.24]);
  assert.equal(bank.pick('clash').offset, 0.001);
  assert.equal(bank.pick('nothing'), null);
});

test('the bundle carries every sample\'s bytes', { skip: !existsSync('dist/gladiator.html') && 'no dist/gladiator.html (node tools/bundle.js)' }, () => {
  const page = readFileSync('dist/gladiator.html', 'utf8');
  assert.ok(statSync('dist/gladiator.html').mtimeMs >= Math.max(...[...SAMPLE_FILES, ...LOOP_FILES].map((name) => statSync(`${DIR}/${name}.mp3`).mtimeMs)), 'the bundle is older than the samples: rebuild it');
  for (const name of [...SAMPLE_FILES, ...LOOP_FILES]) assert.ok(page.includes(readFileSync(`${DIR}/${name}.mp3`).toString('base64')), `${name} is not in the bundle`);
});

test('the third batch: heels, a helmet, a wooden shield, punches, the fist\'s whoosh, thunder', () => {
  const heel = (surface, mass = 60) => plan({ type: 'step', speed: 1.4, mass, surface, armour: 'none', heels: true });
  assert.equal(heel('stone').set, 'step-heel');
  assert.equal(heel('tile').set, 'step-heel');
  assert.equal(heel('wood').set, 'step-heel');
  assert.ok(heel('wood').synth, 'heels on boards: the synth\'s knock of the boards under them');
  assert.equal(heel('grass').set, 'step-grass-walk', 'heels on grass: the grass');
  assert.equal(plan({ type: 'step', speed: 1.4, mass: 60, surface: 'stone', armour: 'none' }).set, 'step-stone-walk', 'no heels: the stone');
  assert.ok(heel('stone', 110).trim > heel('stone', 50).trim, 'a heavier woman in heels louder');
  assert.equal(plan({ type: 'hit', energy: 150, striker: 'blade', covering: 'plate', part: 'head' }).set, 'helmet');
  assert.equal(plan({ type: 'hit', energy: 60, striker: 'fist', covering: 'plate', part: 'head' }).set, 'helmet');
  assert.equal(plan({ type: 'hit', energy: 150, striker: 'blade', covering: 'plate', part: 'trunk' }).set, 'break');
  assert.equal(plan({ type: 'hit', energy: 150, striker: 'blade', covering: 'wood', part: 'shield' }).set, 'woodshield');
  assert.equal(plan({ type: 'hit', energy: 80, striker: 'body', covering: 'wood', part: 'shield' }).set, 'woodshield');
  assert.equal(plan({ type: 'clash', speed: 10, a: 'blade', b: 'shield' }).set, 'woodshield');
  const haft = plan({ type: 'clash', speed: 10, a: 'blade', b: 'haft' });
  const boards = plan({ type: 'clash', speed: 10, a: 'blade', b: 'shield' });
  assert.equal(haft.set, 'woodshield');
  assert.ok(haft.rate > boards.rate && haft.seconds < boards.seconds, 'a haft higher and shorter than a shield');
  for (const striker of ['fist', 'foot', 'knee', 'elbow']) assert.equal(plan({ type: 'hit', energy: 60, striker, covering: 'flesh', part: 'head' }).set, 'punch', striker);
  assert.equal(plan({ type: 'hit', energy: 60, striker: 'fist', covering: 'padded', part: 'trunk' }).set, 'punch');
  assert.ok(plan({ type: 'hit', energy: 60, striker: 'foot', covering: 'flesh' }).rate < plan({ type: 'hit', energy: 60, striker: 'fist', covering: 'flesh' }).rate, 'a kick lower than a punch');
  const whoosh = plan({ type: 'swing', speed: 8, length: 0.7, mass: 2, head: 'fist', reach: 0.2 });
  assert.equal(whoosh.set, 'fistswing');
  assert.ok(whoosh.fromEnd, 'the whoosh\'s rising end, into the blow');
  assert.equal(plan({ type: 'swing', speed: 8, length: 0.9, mass: 8, head: 'foot', reach: 0.2 }).set, 'fistswing');
  const near = plan({ type: 'thunder', distance: 200 });
  const far = plan({ type: 'thunder', distance: 4000 });
  assert.equal(near.set, 'thunder');
  assert.ok(far.skip > near.skip && far.rate < near.rate && far.synthGain > near.synthGain, 'far thunder the rumble only, lower, the synth carrying it');
  assert.equal(near.synth.crack, 0, 'the crack is the recording\'s, not doubled');
});

test('the new sets scale with the blow: a harder one louder and longer, a faster drive louder', () => {
  const blow = (type, fields) => [plan({ type, ...fields, energy: 8 }), plan({ type, ...fields, energy: 400 })];
  for (const [light, heavy] of [
    blow('hit', { striker: 'blade', covering: 'plate', part: 'head', mass: 1.2 }),
    blow('hit', { striker: 'blade', covering: 'wood', part: 'shield', mass: 1.2 }),
    blow('hit', { striker: 'fist', covering: 'flesh', part: 'head' }),
  ]) {
    assert.equal(light.set, heavy.set);
    assert.ok(heavy.trim > light.trim && heavy.seconds > light.seconds && heavy.fade > light.fade, `${heavy.set}: ${light.trim}/${light.seconds} -> ${heavy.trim}/${heavy.seconds}`);
  }
  const slowClash = plan({ type: 'clash', speed: 2, a: 'blade', b: 'shield' });
  const fastClash = plan({ type: 'clash', speed: 18, a: 'blade', b: 'shield' });
  assert.ok(fastClash.trim > slowClash.trim && fastClash.seconds > slowClash.seconds);
  const jab = plan({ type: 'swing', speed: 5, length: 0.7, mass: 2, head: 'fist', reach: 0.2 });
  const cross = plan({ type: 'swing', speed: 13, length: 0.7, mass: 2, head: 'fist', reach: 0.2 });
  assert.ok(cross.trim > jab.trim && cross.seconds > jab.seconds);
  // (And the level the trim scales grows with the speed: v^6.)
  assert.ok(SOUND_FAMILIES.swing.params({ speed: 13, length: 0.7, mass: 2 }).level > SOUND_FAMILIES.swing.params({ speed: 5, length: 0.7, mass: 2 }).level + 20);
});

test('a take played from its end plays its last seconds', () => {
  const started = [];
  const node = () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, playbackRate: { value: 1 }, start: (when, offset) => started.push(offset), stop() {} });
  const voice = { ctx: { createGain: node, createBufferSource: node }, nodes: [], live: 0, end: 0 };
  playSample(voice, {}, { buffer: { duration: 0.4 }, offset: 0.01 }, { rate: 1, trim: 1, seconds: 0.15, fade: 0.03, fromEnd: true }, 0, 0.5);
  assert.ok(Math.abs(started[0] - 0.25) < 1e-9, `${started[0]}`);
});

test('the fourth batch: a body falling, a whip\'s lash, a wooden door\'s creak and slam', () => {
  for (const set of ['bodyfall', 'whip', 'door-creak', 'door-slam']) assert.ok(SAMPLE_SETS[set]?.length, set);
  assert.equal(SAMPLE_SETS.bodyfall.length, 5);
  const fall = (fields) => plan({ type: 'fall', mass: 80, speed: 4, surface: 'stone', armour: 'none', ...fields });
  for (const surface of ['stone', 'tile', 'wood', 'earth', 'grass', 'sand', 'snow']) assert.equal(fall({ surface }).set, 'bodyfall', surface);
  assert.equal(fall({ surface: 'stone' }).synth, null);
  assert.equal(fall({ surface: 'water' }), null, 'a fall in water: the synth\'s splash');
  const plated = fall({ armour: 'plate', surface: 'earth' });
  assert.equal(plated.set, 'clatter');
  assert.deepEqual(plated.extra.map((layer) => layer.set), ['bodyfall'], 'the kit\'s crash over the body\'s thud');
  assert.equal(plated.synth, null);
  assert.equal(plan({ type: 'land', mass: 80, speed: 4, surface: 'stone', armour: 'none' }), null, 'landing on his feet is not a fall');
  for (const covering of ['flesh', 'leather', 'mail', 'plate', 'wood']) assert.equal(plan({ type: 'hit', energy: 10, striker: 'lash', covering, part: 'trunk' }).set, 'whip', covering);
  const lashSkin = plan({ type: 'hit', energy: 10, striker: 'lash', covering: 'flesh', part: 'trunk' });
  const lashPlate = plan({ type: 'hit', energy: 10, striker: 'lash', covering: 'plate', part: 'trunk' });
  assert.ok(lashPlate.seconds < lashSkin.seconds && lashPlate.rate > lashSkin.rate && lashPlate.synth && !lashSkin.synth, 'on armour shorter, higher, the synth\'s knock beside it');
  assert.equal(plan({ type: 'hit', energy: 10, striker: 'blade', covering: 'flesh' }).set, 'slice', 'a blade still slices');
  const door = (state, kind = 'door') => plan({ type: 'mech', kind, state });
  assert.equal(door('opening').set, 'door-creak');
  assert.equal(door('opening').extra, undefined, 'opening: no slam');
  const shut = door('closing');
  assert.equal(shut.set, 'door-creak');
  assert.deepEqual(shut.extra.map((layer) => layer.set), ['door-slam']);
  assert.ok(shut.extra[0].delay > 0 && shut.extra[0].delay < shut.seconds + 0.2, 'the slam into the creak');
  assert.equal(door('closed').extra[0].set, 'door-slam');
  assert.equal(door('closing', 'chest').extra[0].set, 'door-slam');
  for (const kind of ['gate', 'portcullis', 'lock', 'lever', 'ladder', 'pickup']) assert.equal(door('closing', kind), null, kind);
});

test('the fourth batch scales: a harder fall or lash louder and longer, a heavier body lower, a door heavier than a chest', () => {
  const fall = (speed, mass = 80) => plan({ type: 'fall', mass, speed, surface: 'stone', armour: 'none' });
  assert.ok(fall(8).trim > fall(1.2).trim && fall(8).seconds > fall(1.2).seconds && fall(8).fade > fall(1.2).fade);
  assert.ok(fall(4, 120).trim > fall(4, 50).trim && fall(4, 120).seconds > fall(4, 50).seconds && fall(4, 120).rate < fall(4, 50).rate, 'a heavier man louder, longer, lower');
  assert.ok(SOUND_FAMILIES.fall.params({ speed: 8, mass: 80, surface: 'stone' }).level > SOUND_FAMILIES.fall.params({ speed: 1.2, mass: 80, surface: 'stone' }).level);
  const lash = (energy) => plan({ type: 'hit', energy, striker: 'lash', covering: 'flesh', part: 'trunk' });
  assert.ok(lash(30).trim > lash(3).trim && lash(30).seconds > lash(3).seconds && lash(30).fade > lash(3).fade);
  assert.ok(lash(3).trim > 1.5, 'lifted over the tip\'s few joules to be heard');
  const door = plan({ type: 'mech', kind: 'door', state: 'closing' });
  const chest = plan({ type: 'mech', kind: 'chest', state: 'closing' });
  assert.ok(door.trim > chest.trim && door.rate < chest.rate && door.extra[0].seconds > chest.extra[0].seconds && door.extra[0].trim > chest.extra[0].trim);
});

test('a layer with a delay is played that long after the take', () => {
  const started = [];
  const node = () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, playbackRate: { value: 1 }, start: (when) => started.push(when), stop() {} });
  const voice = { ctx: { createGain: node, createBufferSource: node }, nodes: [], live: 0, end: 0, out: {} };
  const bank = { pick: () => ({ buffer: { duration: 1.5 }, offset: 0 }) };
  const event = { type: 'mech', kind: 'door', state: 'closing' };
  playWithSamples(bank, voice, SOUND_FAMILIES.mech, event, SOUND_FAMILIES.mech.params(event), 1, 0.5);
  assert.equal(started.length, 2);
  assert.ok(started[1] - started[0] > 0.3, `${started}`);
});
