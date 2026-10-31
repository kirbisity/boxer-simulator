// The ambience loops (src/audio/samples/loop-*.mp3, samples.js AMBIENCE_LOOPS): small mono MP3s whose period is looped inside the
// decoded buffer past the encoder's padding; played wide by two reads half a period apart; the places that hear each, by their tags;
// the recorded bed taking over from the synth one once decoded, the synth bed kept until then.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AMBIENCE_LOOPS, FIRE_LOOP, LOOP_FILES, startLoop } from '../src/audio/samples.js';
import { AMBIENCE_BEDS, FIRE_SOUND, PLACE_AMBIENCE, ambienceTargets, createAmbience, fireVoice, heardFires } from '../src/audio/ambience.js';

const DIR = 'src/audio/samples';

/** The first MPEG frame's header: version, sample rate, channels, bitrate (kb/s). */
function mp3Header(bytes) {
  assert.ok(bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0, 'no MPEG frame sync at the start (no ID3 tag either)');
  const mpeg1 = ((bytes[1] >> 3) & 3) === 3;
  const rate = mpeg1 ? [44100, 48000, 32000][(bytes[2] >> 2) & 3] : null;
  const bitrate = mpeg1 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320][bytes[2] >> 4] : null;
  return { mpeg1, rate, bitrate, mono: bytes[3] >> 6 === 3 };
}

test('each loop is a small mono 32 kHz MP3 long enough for its period and the lead either side', () => {
  let total = 0;
  for (const [name, loop] of Object.entries(AMBIENCE_LOOPS)) {
    const bytes = readFileSync(`${DIR}/${loop.file}.mp3`);
    const header = mp3Header(bytes);
    assert.ok(header.mpeg1 && header.rate === 32000 && header.mono, `${name}: ${JSON.stringify(header)}`);
    assert.ok(header.bitrate >= 32 && header.bitrate <= 48, `${name}: ${header.bitrate} kb/s`);
    assert.ok(bytes.length <= 120 * 1024, `${name}: ${bytes.length} bytes`);
    total += bytes.length;
    // CBR: its length in seconds from its size (less the Info frame), at least the period and both leads.
    const seconds = (bytes.length * 8) / (header.bitrate * 1000);
    assert.ok(seconds >= loop.seconds + 2 * loop.lead - 0.05, `${name}: ${seconds.toFixed(2)} s for ${loop.seconds} + 2 × ${loop.lead}`);
    assert.ok(loop.seconds >= 8 && loop.seconds <= 20, `${name}: a period of ${loop.seconds} s`);
    // A whole number of samples at 32 kHz (the file's), 44.1 and 48 kHz (a context's): the loop points fall on samples.
    for (const rate of [32000, 44100, 48000]) assert.ok(Math.abs(loop.seconds * rate - Math.round(loop.seconds * rate)) < 1e-6, `${name} at ${rate}`);
  }
  assert.ok(total <= 260 * 1024, `${total} bytes in all`);
  assert.deepEqual(LOOP_FILES.sort(), ['loop-fire', 'loop-market', 'loop-rain', 'loop-wind']);
  const readme = readFileSync(`${DIR}/README.md`, 'utf8');
  for (const name of LOOP_FILES) assert.ok(readme.includes(`${name}.mp3`), `README lists ${name}`);
});

/** A context that records what is made of it. */
function fakeContext(sampleRate = 4000) {
  const made = { sources: [], gains: [], mergers: [] };
  const param = (value = 0) => ({ value, targets: [], setTargetAtTime(target) { this.targets.push(target); this.value = target; }, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = (extra = {}) => ({ connections: [], connect(to, output, input) { this.connections.push({ to, output, input }); }, disconnect() {}, ...extra });
  const ctx = {
    sampleRate,
    currentTime: 0,
    createBuffer: (channels, length, rate) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: (channel) => data[channel] };
    },
    createGain: () => {
      const gain = node({ gain: param(1) });
      made.gains.push(gain);
      return gain;
    },
    createBiquadFilter: () => node({ type: '', frequency: param(20000) }),
    createPanner: () => node({ positionX: param(), positionY: param(), positionZ: param() }),
    createChannelMerger: () => {
      const merger = node();
      made.mergers.push(merger);
      return merger;
    },
    createBufferSource: () => {
      const source = node({ playbackRate: param(1), buffer: null, loop: false, loopStart: 0, loopEnd: 0, started: null, stopped: null, start(when, offset) { this.started = { when, offset }; }, stop(when) { this.stopped = when; } });
      made.sources.push(source);
      return source;
    },
  };
  return { ctx, made };
}

/** A decoded loop: noise of a known RMS over its period. */
function fakeLoop(ctx, name, amplitude = 0.1) {
  const { seconds, lead } = AMBIENCE_LOOPS[name];
  const buffer = ctx.createBuffer(1, Math.ceil((seconds + 2 * lead) * ctx.sampleRate), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = index % 2 ? amplitude : -amplitude;
  return { buffer, loopStart: lead, loopEnd: lead + seconds };
}

test('a loop is played between its loop points, inside the decoded buffer past the padding, two reads half a period apart', () => {
  const { ctx, made } = fakeContext();
  const loop = fakeLoop(ctx, 'wind');
  const out = { connect() {} };
  const playing = startLoop(ctx, loop, out, 1, () => 0.9);
  assert.equal(made.sources.length, 2);
  const period = loop.loopEnd - loop.loopStart;
  for (const source of made.sources) {
    assert.ok(source.loop && source.loopStart === 0.25 && source.loopEnd === 0.25 + 12.5);
    assert.ok(source.started.offset >= source.loopStart && source.started.offset < source.loopEnd, `${source.started.offset}`);
    assert.equal(source.started.when, 1);
  }
  const apart = Math.abs(made.sources[1].started.offset - made.sources[0].started.offset);
  assert.ok(Math.abs(apart - period / 2) < 1e-9, `${apart}`);
  assert.deepEqual(made.sources.map((source) => source.connections[0].input), [0, 1], 'one to the left, one to the right');
  playing.stop(3);
  assert.ok(made.sources.every((source) => source.stopped === 3));
});

test('the places that hear each loop: rain where it falls in the open, wind outdoors, the market in a town by day', () => {
  // Rain: the storm's, or a place's own weather (the quay at night), not under a roof; none on a dry field.
  assert.ok(Number.isFinite(ambienceTargets({ place: 'port' }).rain), 'the quay in the rain');
  assert.equal(ambienceTargets({ place: 'field' }).rain, -Infinity);
  assert.ok(Number.isFinite(ambienceTargets({ place: 'dunnottar', rain: 0.8, room: { enclosure: 0.2 } }).rain));
  assert.equal(ambienceTargets({ place: 'dunnottar', rain: 0.8, room: { enclosure: 0.9, roofed: true } }).rain, -Infinity, 'under a roof: the drumming on it');
  // Wind: every outdoor place; none in the halls.
  for (const [place, spec] of Object.entries(PLACE_AMBIENCE)) {
    const wind = ambienceTargets({ place }).wind;
    assert.equal(Number.isFinite(wind), Boolean(spec.wind) && !spec.indoor, `${place}: wind ${wind}`);
  }
  // The market: the places tagged with one (a market square), by day; thinned by rain, muffled indoors.
  const marketPlaces = Object.entries(PLACE_AMBIENCE).filter(([, spec]) => spec.market).map(([place]) => place);
  assert.deepEqual(marketPlaces.sort(), ['jiangnan', 'town']);
  const town = ambienceTargets({ place: 'town' }).market;
  assert.ok(town > 45 && town < 65, `${town}`);
  assert.equal(ambienceTargets({ place: 'town', night: true }).market, -Infinity);
  assert.ok(ambienceTargets({ place: 'town', rain: 0.8 }).market < town - 6);
  assert.ok(ambienceTargets({ place: 'town', room: { enclosure: 1, roofed: true } }).market < town - 20);
  for (const place of ['plain', 'colosseum', 'dunnottar', 'port', 'sengoku']) assert.equal(ambienceTargets({ place }).market, -Infinity, place);
  // Under a loud fight the beds dip (the arena's crowd does not).
  const calm = ambienceTargets({ place: 'colosseum' });
  const loud = ambienceTargets({ place: 'colosseum', duck: 1 });
  assert.ok(Math.abs(calm.wind - loud.wind - 6) < 1e-9 && loud.crowd === calm.crowd);
});

test('a decoded loop takes over its synth bed at the same level; until then the synth bed plays', () => {
  const { ctx, made } = fakeContext();
  const loops = {};
  const bank = { loop: (name) => loops[name] ?? null };
  const ambience = createAmbience(ctx, { connect() {} }, () => null, bank);
  const targets = ambienceTargets({ place: 'town' });
  ambience.update(targets, {}, 0, 0.25);
  assert.deepEqual(Object.keys(ambience.recorded), [], 'nothing decoded: no recorded bed');
  assert.ok(ambience.beds.wind.gain.value > 0, 'the synth wind meanwhile');
  loops.wind = fakeLoop(ctx, 'wind');
  loops.market = fakeLoop(ctx, 'market');
  ambience.update(targets, {}, 1, 0.25);
  assert.deepEqual(Object.keys(ambience.recorded).sort(), ['market', 'wind']);
  assert.equal(ambience.beds.wind.gain.value, 0, 'the synth wind faded out');
  assert.ok(ambience.beds.rain.gain.value === 0 && !ambience.recorded.rain, 'no rain in a dry town');
  assert.ok(ambience.recorded.wind.gain.gain.value > 0 && ambience.recorded.market.gain.gain.value > 0);
  // Its level matched: the recorded bed's RMS at its gain is the synth bed's at the gain it would have had.
  const synthRms = (() => {
    const buffer = made.sources.find((source) => source.buffer?.numberOfChannels === 2 && Math.abs(source.buffer.duration - 12) < 0.01).buffer;
    let sum = 0;
    for (const channel of [0, 1]) for (const value of buffer.getChannelData(channel)) sum += value * value;
    return Math.sqrt(sum / (2 * buffer.length));
  })();
  const synthGain = ambience.beds.wind.gain.targets.at(-2);
  assert.ok(Math.abs(ambience.recorded.wind.gain.gain.value * 0.1 - synthGain * synthRms) < 1e-6 * synthGain);
  // The loop's two reads are looped inside its period; each bed is in the list the engine eases.
  const reads = made.sources.filter((source) => source.buffer === loops.wind.buffer);
  assert.equal(reads.length, 2);
  assert.ok(reads.every((source) => source.loop && source.loopStart === 0.25 && source.loopEnd === 12.75));
  for (const name of Object.keys(AMBIENCE_LOOPS)) assert.ok(AMBIENCE_BEDS.includes(name), name);
  // Out of the town (a scene change): the market eases to nothing.
  ambience.update(ambienceTargets({ place: 'plain' }), {}, 2, 0.25);
  assert.equal(ambience.recorded.market.gain.gain.value, 0);
});

test('a fire\'s loop: a small mono MP3 of a whole number of samples, decoded with the beds', () => {
  const bytes = readFileSync(`${DIR}/${FIRE_LOOP.file}.mp3`);
  const header = mp3Header(bytes);
  assert.ok(header.mpeg1 && header.rate === 32000 && header.mono && header.bitrate <= 48, JSON.stringify(header));
  assert.ok(bytes.length <= 40 * 1024, `${bytes.length} bytes`);
  assert.ok((bytes.length * 8) / (header.bitrate * 1000) >= FIRE_LOOP.seconds + 2 * FIRE_LOOP.lead - 0.05);
  for (const rate of [32000, 44100, 48000]) assert.ok(Math.abs(FIRE_LOOP.seconds * rate - Math.round(FIRE_LOOP.seconds * rate)) < 1e-6, `at ${rate}`);
  assert.ok(LOOP_FILES.includes(FIRE_LOOP.file));
});

test('a fire is heard by its size: a torch quiet, thin and high, a brazier louder and fuller, a blaze loudest and lowest', () => {
  const [dim, torch, brazier, hearth, blaze] = [0.12, 0.28, 0.5, 0.6, 1.5].map((size) => fireVoice(size));
  for (const [small, large] of [[dim, torch], [torch, brazier], [brazier, hearth], [hearth, blaze]]) {
    assert.ok(large.level > small.level, `${small.level} < ${large.level}`);
    assert.ok(large.rate <= small.rate && large.highpass <= small.highpass && large.lowpass <= small.lowpass);
  }
  assert.ok(Math.abs(torch.level - FIRE_SOUND.torch) < 1e-9, 'a torch at its own level');
  assert.ok(brazier.level - torch.level > 4 && blaze.level - brazier.level > 8);
  assert.ok(torch.rate > 1 && blaze.rate < 0.9 && torch.highpass > 4 * blaze.highpass);
  // At the ear: by the distance's falloff, nearer louder.
  const at = (distance) => heardFires([{ at: [distance, 0, 0], size: 0.5 }], [0, 0, 0])[0].level;
  assert.ok(Math.abs(at(1) - at(4) - 20 * Math.log10(4)) < 1e-9);
});

test('only the nearest few fires are heard (a phone\'s voices), a fire heard kept against one a little nearer; a candle not at all', () => {
  const fires = Array.from({ length: 12 }, (_, k) => ({ at: [k * 1.2 + 1, 0, 0], size: k % 2 ? 0.28 : 0.5 }));
  const heard = heardFires(fires, [0, 0, 0]);
  assert.equal(heard.length, FIRE_SOUND.nearest);
  assert.deepEqual(heard.map((one) => one.fire), fires.slice(0, FIRE_SOUND.nearest));
  // From the far end of the row, the nearest there.
  assert.deepEqual(heardFires(fires, [15, 0, 0]).map((one) => one.fire).sort((a, b) => a.at[0] - b.at[0]), fires.slice(-FIRE_SOUND.nearest));
  // Two fires at about one distance do not take turns: the one sounding stays.
  const pair = [{ at: [3, 0, 0], size: 0.28 }, { at: [-3.3, 0, 0], size: 0.28 }];
  assert.equal(heardFires(pair, [0, 0, 0], [pair[1]], { ...FIRE_SOUND, nearest: 1 })[0].fire, pair[1]);
  assert.equal(heardFires(pair, [0, 0, 0], [], { ...FIRE_SOUND, nearest: 1 })[0].fire, pair[0]);
  // Too far, or too small (a candle's flame), not heard.
  assert.equal(heardFires([{ at: [FIRE_SOUND.within + 1, 0, 0], size: 1 }], [0, 0, 0]).length, 0);
  assert.equal(heardFires([{ at: [1, 0, 0], size: 0.09 }], [0, 0, 0]).length, 0);
});

test('the fires\' loops play at the nearest few, placed at each, by size; walking on, the far ones are let go and the cap holds', () => {
  const { ctx, made } = fakeContext();
  const loops = {};
  const bank = { loop: (name) => loops[name] ?? null };
  const crackles = [];
  const ambience = createAmbience(ctx, { connect() {} }, (at) => (crackles.push(at), null), bank);
  const fires = Array.from({ length: 10 }, (_, k) => ({ at: [k * 3, 1.5, 0], size: k === 1 ? 0.5 : 0.28 }));
  const targets = ambienceTargets({ place: 'dunnottar' });
  // Before the loop decodes: the synth's crackles at the nearest, no loop.
  ambience.update(targets, { fires, ear: [0, 1.6, 0] }, 0, 0.25);
  assert.equal(ambience.fires.size, 0);
  assert.equal(crackles.length, 1);
  loops.fire = { buffer: ctx.createBuffer(1, Math.ceil(6.74 * ctx.sampleRate), ctx.sampleRate), loopStart: 0.25, loopEnd: 6.49 };
  for (let k = 0; k < 4; k += 1) ambience.update(targets, { fires, ear: [0, 1.6, 0] }, 1 + k * 0.25, 0.25);
  assert.deepEqual([...ambience.fires.keys()], fires.slice(0, FIRE_SOUND.nearest));
  assert.equal(crackles.length, 1, 'the loop takes over from the synth\'s crackles');
  const reads = made.sources.filter((source) => source.buffer === loops.fire.buffer);
  assert.equal(reads.length, FIRE_SOUND.nearest);
  assert.ok(reads.every((source) => source.loop && source.loopStart === 0.25 && source.loopEnd === 6.49));
  // The brazier (fires[1]) a little lower than the torches; each its own read, placed at its fire.
  assert.ok(reads[1].playbackRate.value < reads[0].playbackRate.value);
  // Louder the bigger and the nearer: the brazier at 3 m over the torch at 6 m.
  const gainOf = (fire) => ambience.fires.get(fire).gain.gain.value;
  assert.ok(gainOf(fires[1]) > gainOf(fires[2]));
  // Walk down the row: never more than the cap, the ones left behind stopped.
  for (let step = 0; step < 20; step += 1) {
    ambience.update(targets, { fires, ear: [step * 1.5, 1.6, 0] }, 3 + step * 0.25, 0.25);
    assert.ok(ambience.fires.size <= FIRE_SOUND.nearest, `${ambience.fires.size} fires`);
  }
  assert.deepEqual([...ambience.fires.keys()].sort((a, b) => a.at[0] - b.at[0]), fires.slice(-FIRE_SOUND.nearest));
  const stopped = made.sources.filter((source) => source.buffer === loops.fire.buffer && source.stopped !== null);
  assert.equal(stopped.length, made.sources.filter((source) => source.buffer === loops.fire.buffer).length - FIRE_SOUND.nearest);
  // Out of the castle: no fires, all let go.
  ambience.update(targets, { ear: [0, 0, 0] }, 9, 0.25);
  assert.equal(ambience.fires.size, 0);
});
