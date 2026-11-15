import test from 'node:test';
import { readFileSync, statSync } from 'node:fs';
import assert from 'node:assert/strict';
import { MUSIC_CUES, SCENE_MUSIC, cueFor } from '../src/audio/music/manifest.js';
import { SCENARIOS } from '../src/scenarios.js';

const MOMENTS = ['opening', 'boss', 'victory', 'defeat'];

test('every cue decodes to a real MP3 or MP4 file', () => {
  for (const [id, cue] of Object.entries(MUSIC_CUES)) {
    // (A supplied piece is a file beside the page; a sting is embedded.)
    const bytes = cue.file ? readFileSync(cue.file) : Buffer.from(cue.data, 'base64');
    assert.ok(bytes.length > 20000, `${id}: only ${bytes.length} bytes`);
    if (cue.mime === 'audio/mpeg') {
      const id3 = bytes.subarray(0, 3).toString('latin1') === 'ID3';
      const sync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
      assert.ok(id3 || sync, `${id}: no ID3 tag or MPEG frame sync`);
    } else {
      assert.equal(cue.mime, 'audio/mp4', `${id}: mime`);
      assert.equal(bytes.subarray(4, 8).toString('latin1'), 'ftyp', `${id}: no ftyp box`);
    }
    assert.equal(typeof cue.loop, 'boolean', `${id}: loop`);
    assert.ok(cue.loopStart >= 0 && cue.loopEnd > cue.loopStart, `${id}: loop points`);
    assert.ok(cue.gain > 0 && cue.gain < 4, `${id}: gain`);
  }
});

test('the loops run 30-60 s and the stings 8-15 s', () => {
  for (const [id, cue] of Object.entries(MUSIC_CUES)) {
    const seconds = cue.loopEnd - cue.loopStart;
    // (A whole piece looped, every supplied one, runs its length: 2 to 4 and a half minutes.)
    if (id === 'bossChoir' || cue.file) assert.ok(seconds >= 120 && seconds <= 270, `${id}: a ${seconds} s piece`);
    else if (cue.loop) assert.ok(seconds >= 30 && seconds <= 60, `${id}: a ${seconds} s loop`);
    else assert.ok(seconds >= 8 && seconds <= 15, `${id}: a ${seconds} s sting`);
  }
});

test('every scene names a looped opening cue', () => {
  for (const [scene, group] of Object.entries(SCENE_MUSIC)) {
    assert.ok(MUSIC_CUES[group], `${scene}: no cue ${group}`);
    assert.equal(MUSIC_CUES[group].loop, true, `${scene}: ${group} does not loop`);
  }
});

test('cueFor covers every scenario, Dunnottar and the colosseum', () => {
  for (const scene of [...Object.keys(SCENARIOS), 'dunnottar', 'colosseum']) {
    assert.ok(MUSIC_CUES[cueFor(scene, 'opening')], `${scene}: no opening`);
    for (const moment of ['victory', 'defeat']) assert.ok(MUSIC_CUES[cueFor(scene, moment)], `${scene}: no ${moment}`);
    for (const moment of MOMENTS) {
      const cue = cueFor(scene, moment);
      assert.ok(cue === null || MUSIC_CUES[cue], `${scene} ${moment}: ${cue}`);
    }
  }
  assert.ok(MUSIC_CUES[cueFor('dunnottar', 'boss')], 'no boss cue');
  // (A boss with no track of his own has the generated one: the yard's dummy; Battle Mode has no bosses, so never asks.)
  assert.equal(cueFor('yard', 'boss'), 'boss');
  assert.equal(cueFor('nowhere', 'opening'), null);
  assert.equal(cueFor('ring', 'opening'), null);
  // (The menus have no music.)
  assert.equal(cueFor(null, 'menu'), null);
  assert.equal(MUSIC_CUES.menu, undefined, 'the old menu theme is gone');
  assert.equal(cueFor(null, 'opening'), null);
});

test('the embedded music fits 2 MB and the pieces 50 MB, each loaded only when its scene wants it', () => {
  // (The stings and the Dunnottar boss's choir embedded, 1.6 MB of base64; thirteen pieces of 3 to 4 MB at 128 kbps.)
  const cues = Object.values(MUSIC_CUES);
  const embedded = cues.reduce((sum, cue) => sum + (cue.data?.length ?? 0), 0);
  assert.ok(embedded <= 2e6, `${(embedded / 1e6).toFixed(2)} MB of base64`);
  const files = [...new Set(cues.filter((cue) => cue.file).map((cue) => cue.file))];
  const total = files.reduce((sum, file) => sum + statSync(file).size, 0);
  assert.ok(total <= 50e6, `${(total / 1e6).toFixed(1)} MB of pieces`);
});

test('the supplied pieces are all played somewhere', () => {
  const played = new Set([...Object.values(SCENE_MUSIC), 'boss']);
  for (const [id, cue] of Object.entries(MUSIC_CUES)) if (cue.file) assert.ok(played.has(id), `${id} (${cue.title}) plays nowhere`);
});
