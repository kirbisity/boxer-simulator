// Recorded sound effects (src/audio/samples/*.mp3, cut from the user's clips: samples/README.md): a sword on a sword, a blade through
// flesh, a blow on bone, bones breaking, steel on plate, a man in armour walking, a weapon clattering down, a mace's swing, a pistol's
// shot; footsteps on stone, grass, mud and in water (walking and running); hooves on stone and on turf, and a horse's whinny; heels on a
// hard floor, a blow on a helmet, a blow on a wooden shield, punches and the fist's whoosh before them, thunder; a bow and a crossbow, a
// portcullis, a sword on mail and into leather (and variants derived from the takes: a fist on plate, lamellar, a blade's swing); a man's and a woman's
// cries (hurt, scream, moan, fear, dying), an army's charge. And three ambience loops, the places' beds (ambience.js): rain, wind, a town's market.
// Each set is a few takes of one sound; a take is picked at random each time.
//
// From the source (the ES-module page, index.html) the files are fetched from src/audio/samples/; the single-file bundle (tools/bundle.js) puts their
// bytes in SAMPLE_EMBED instead. Each is decoded once, when the AudioContext is made. Until a set has decoded, or where it fails, the
// synth plays as before (sfx/sampled.js decides which events a sample plays).
//
// A clip is cut with its transient at its start, but an MP3 decoder may put its priming silence ahead of it: each decoded buffer's own
// first loud sample is found and the clip is started from just before it, so the hit is heard at the instant it is scheduled.

/** The sets: each a list of files (names in samples/, without .mp3). */
export const SAMPLE_SETS = {
  clash: ['clash-1', 'clash-2', 'clash-3', 'clash-4', 'clash-5', 'clash-6', 'clash-7', 'clash-8'],
  slice: ['slice-1', 'slice-2'],
  gore: ['gore-1', 'gore-2', 'gore-3', 'gore-4'],
  bonehit: ['bonehit-1', 'bonehit-2', 'bonehit-3', 'bonehit-4'],
  bones: ['bones-1', 'bones-2', 'bones-3', 'bones-4', 'bones-5', 'bones-6'],
  break: ['break-1', 'break-2', 'break-3'],
  armourstep: Array.from({ length: 14 }, (_, index) => `armourstep-${index + 1}`),
  clatter: ['clatter-1'],
  maceswing: ['maceswing-1'],
  gunshot: ['gunshot-1', 'gunshot-2'],
  'step-stone-walk': ['step-stone-walk-1', 'step-stone-walk-2', 'step-stone-walk-3', 'step-stone-walk-4', 'step-stone-walk-5'],
  'step-stone-run': ['step-stone-run-1', 'step-stone-run-2', 'step-stone-run-3', 'step-stone-run-4'],
  'step-grass-walk': ['step-grass-walk-1', 'step-grass-walk-2', 'step-grass-walk-3'],
  'step-grass-run': ['step-grass-run-1', 'step-grass-run-2'],
  'step-mud': ['step-mud-1', 'step-mud-2', 'step-mud-3'],
  'step-water': ['step-water-1', 'step-water-2', 'step-water-3', 'step-water-4', 'step-water-5', 'step-water-6'],
  'hoof-soft': Array.from({ length: 9 }, (_, index) => `hoof-soft-${index + 1}`),
  'hoof-stone': ['hoof-stone-1', 'hoof-stone-2', 'hoof-stone-3', 'hoof-stone-4'],
  neigh: ['neigh-1'],
  'step-heel': Array.from({ length: 6 }, (_, index) => `step-heel-${index + 1}`),
  helmet: ['helmet-1'],
  woodshield: ['woodshield-1'],
  punch: Array.from({ length: 7 }, (_, index) => `punch-${index + 1}`),
  fistswing: Array.from({ length: 5 }, (_, index) => `fistswing-${index + 1}`),
  thunder: ['thunder-1', 'thunder-2'],
  // (The fourth batch: a body falling, a whip's lash, a wooden door's creak and its slam.)
  bodyfall: Array.from({ length: 5 }, (_, index) => `bodyfall-${index + 1}`),
  whip: ['whip-1'],
  'door-creak': ['door-creak-1', 'door-creak-2'],
  'door-slam': ['door-slam-1'],
  // (The fifth batch: a bow and a crossbow loosed, the crossbow's latch and its crank, a portcullis's chain and its slam, a sword on mail,
  // a sword stabbed into leather.)
  bow: ['bow-1'],
  crossbow: ['crossbow-1'],
  'crossbow-latch': ['crossbow-latch-1'],
  'crossbow-crank': ['crossbow-crank-1'],
  'portcullis-chain': ['portcullis-chain-1'],
  'portcullis-slam': ['portcullis-slam-1'],
  mail: ['mail-1', 'mail-2', 'mail-3'],
  stab: ['stab-1', 'stab-2', 'stab-3'],
  // Derived from the takes above (samples/README.md says from what): a fist or a shoulder on plate (the punch's thud under the plate's
  // clank, duller and shorter), a blow on lamellar or scale (the mail's rattle lower over a plate's knock), a blade's swing (the fist's and
  // the mace's whooshes, higher and thinner).
  platepunch: ['platepunch-1', 'platepunch-2', 'platepunch-3', 'platepunch-4'],
  lamellar: ['lamellar-1', 'lamellar-2', 'lamellar-3'],
  bladeswing: ['bladeswing-1', 'bladeswing-2', 'bladeswing-3', 'bladeswing-4'],
  // Steel on a steel shield: the shells' takes already here (a helmet's ring, steel on plate), none new.
  shieldclang: ['helmet-1', 'break-1', 'break-3'],
  // Cries (sfx/voice.js CRY_KINDS; chosen by audio/cries.js): a man's and a woman's, each a set per kind (a few composed of two pieces).
  ...voiceSets({ male: { hurt: 7, scream: 3, moan: 4, fear: 4, dying: 2 }, female: { hurt: 4, scream: 3, moan: 3, fear: 2, dying: 2 } }),
  // An army's charge roared: one loop (engine.js plays it under a large side running at the enemy: audio/charge.js).
  charge: ['charge-1'],
};

/** The cry sets: voice-<sex>-<kind>, each `count` takes. */
function voiceSets(counts) {
  const sets = {};
  for (const [sex, kinds] of Object.entries(counts)) for (const [kind, count] of Object.entries(kinds)) sets[`voice-${sex}-${kind}`] = Array.from({ length: count }, (_, index) => `voice-${sex}-${kind}-${index + 1}`);
  return sets;
}

/** Every file of every set. */
export const SAMPLE_FILES = [...new Set(Object.values(SAMPLE_SETS).flat())];

/**
 * The ambience loops (samples/loop-*.mp3, ambience.js plays them as beds): each one period of `seconds`, cut seamless (its tail
 * crossfaded into its head), mono. The file carries `lead` s of the period's own tail before it and of its head after it, so an MP3's
 * priming silence and end padding fall outside the period, and a decoder that trims its priming or keeps it only slides the period along
 * the repeated audio: looped from loopStart = lead to loopEnd = lead + seconds, it has no gap and no seam either way.
 */
export const AMBIENCE_LOOPS = {
  rain: { file: 'loop-rain', seconds: 9.24, lead: 0.25 },
  wind: { file: 'loop-wind', seconds: 12.5, lead: 0.25 },
  market: { file: 'loop-market', seconds: 17, lead: 0.25 },
};

/** Every loop's file. */
export const LOOP_FILES = Object.values(AMBIENCE_LOOPS).map((loop) => loop.file);

/** The bytes of each file (base64), put here by tools/bundle.js; null from the source, which fetches the files. */
const SAMPLE_EMBED = null;

/** A decoded buffer's start (s): just before its first sample within 24 dB of its peak (the encoder's priming skipped). */
export function transientStart(data, rate) {
  let peak = 0;
  for (let index = 0; index < data.length; index += 1) peak = Math.max(peak, Math.abs(data[index]));
  const bar = peak * 0.063;
  let first = 0;
  while (first < data.length && Math.abs(data[first]) < bar) first += 1;
  return Math.max(0, first / rate - 0.001);
}

/** base64 → ArrayBuffer. */
function sampleBytes(base64) {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index);
  return bytes.buffer;
}

/**
 * The bank for a context: every file decoded in the background. `pick(set)` a random decoded take of a set ({ buffer, offset }) or null;
 * `take(name)` one file's take, or null (the sound board plays each); `loop(name)` an ambience loop ({ buffer, loopStart, loopEnd }) or
 * null; `count()` how many have decoded; `ready` a promise of that count once all have been tried.
 */
export function createSampleBank(ctx, { embed = SAMPLE_EMBED, base = null, fetcher = globalThis.fetch?.bind(globalThis), random = Math.random } = {}) {
  const takes = new Map();
  const loops = new Map();
  async function decode(name) {
    let bytes;
    if (embed?.[name]) bytes = sampleBytes(embed[name]);
    else {
      if (!fetcher) return;
      // (The source page is index.html at the repo's root.)
      const response = await fetcher(new URL(`${name}.mp3`, base ?? new URL('src/audio/samples/', globalThis.document?.baseURI ?? 'http://localhost/')));
      if (!response.ok) throw new Error(`${response.status}`);
      bytes = await response.arrayBuffer();
    }
    return ctx.decodeAudioData(bytes);
  }
  async function load(name) {
    const buffer = await decode(name);
    takes.set(name, { buffer, offset: transientStart(buffer.getChannelData(0), buffer.sampleRate) });
  }
  async function loadLoop(name) {
    const { file, seconds, lead } = AMBIENCE_LOOPS[name];
    const buffer = await decode(file);
    // (A file cut short would loop on its padding: refused, and the synth bed plays.)
    if (buffer.duration < lead + seconds + 0.02) throw new Error(`${buffer.duration.toFixed(3)} s, short of its period`);
    loops.set(name, { buffer, loopStart: lead, loopEnd: lead + seconds });
  }
  const warn = (name) => (error) => console.warn(`Gladiator: the sound ${name} could not be loaded`, error);
  const ready = Promise.all([...SAMPLE_FILES.map((name) => load(name).catch(warn(name))), ...Object.keys(AMBIENCE_LOOPS).map((name) => loadLoop(name).catch(warn(name)))]).then(() => takes.size + loops.size);
  return {
    ready,
    count: () => takes.size + loops.size,
    take: (name) => takes.get(name) ?? null,
    loop: (name) => loops.get(name) ?? null,
    pick(set) {
      const names = (SAMPLE_SETS[set] ?? []).filter((name) => takes.has(name));
      return names.length ? takes.get(names[Math.floor(random() * names.length)]) : null;
    },
  };
}

/**
 * A loop ({ buffer, loopStart, loopEnd }: the bank's) played into `out` from `when` on, until stopped: the mono period read twice, half a
 * period apart, one to the left and one to the right, so the bed is wide and round the head; started at a random point of it. Returns
 * { stop(at) }.
 */
export function startLoop(ctx, loop, out, when, random = Math.random) {
  const merger = ctx.createChannelMerger(2);
  merger.connect(out);
  const period = loop.loopEnd - loop.loopStart;
  const first = random() * period;
  const sources = [0, 1].map((channel) => {
    const source = ctx.createBufferSource();
    source.buffer = loop.buffer;
    source.loop = true;
    source.loopStart = loop.loopStart;
    source.loopEnd = loop.loopEnd;
    source.connect(merger, 0, channel);
    source.start(when, loop.loopStart + ((first + (channel * period) / 2) % period));
    return source;
  });
  return {
    stop(at) {
      for (const source of sources) source.stop(at);
    },
  };
}

/** A loop's level: the RMS of its period (first channel). */
export function loopRms(loop) {
  const data = loop.buffer.getChannelData(0);
  const from = Math.floor(loop.loopStart * loop.buffer.sampleRate);
  const to = Math.min(data.length, Math.floor(loop.loopEnd * loop.buffer.sampleRate));
  let sum = 0;
  for (let index = from; index < to; index += 1) sum += data[index] * data[index];
  return Math.sqrt(sum / Math.max(1, to - from));
}
