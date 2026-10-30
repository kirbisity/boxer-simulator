// Recorded sound effects (src/audio/samples/*.mp3, cut from the user's clips: samples/README.md): a sword on a sword, a blade through
// flesh, a blow on bone, bones breaking, steel on plate, a man in armour walking, a weapon clattering down, a mace's swing, a pistol's
// shot; footsteps on stone, grass, mud and in water (walking and running); hooves on stone and on turf, and a horse's whinny; heels on a
// hard floor, a blow on a helmet, a blow on a wooden shield, punches and the fist's whoosh before them, thunder.
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
};

/** Every file of every set. */
export const SAMPLE_FILES = [...new Set(Object.values(SAMPLE_SETS).flat())];

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
 * `take(name)` one file's take, or null (the sound board plays each); `count()` how many have decoded; `ready` a promise of that count
 * once all have been tried.
 */
export function createSampleBank(ctx, { embed = SAMPLE_EMBED, base = null, fetcher = globalThis.fetch?.bind(globalThis), random = Math.random } = {}) {
  const takes = new Map();
  async function load(name) {
    let bytes;
    if (embed?.[name]) bytes = sampleBytes(embed[name]);
    else {
      if (!fetcher) return;
      // (The source page is index.html at the repo's root.)
      const response = await fetcher(new URL(`${name}.mp3`, base ?? new URL('src/audio/samples/', globalThis.document?.baseURI ?? 'http://localhost/')));
      if (!response.ok) throw new Error(`${response.status}`);
      bytes = await response.arrayBuffer();
    }
    const buffer = await ctx.decodeAudioData(bytes);
    takes.set(name, { buffer, offset: transientStart(buffer.getChannelData(0), buffer.sampleRate) });
  }
  const ready = Promise.all(SAMPLE_FILES.map((name) => load(name).catch((error) => console.warn(`Gladiator: the sound ${name} could not be loaded`, error)))).then(() => takes.size);
  return {
    ready,
    count: () => takes.size,
    take: (name) => takes.get(name) ?? null,
    pick(set) {
      const names = (SAMPLE_SETS[set] ?? []).filter((name) => takes.has(name));
      return names.length ? takes.get(names[Math.floor(random() * names.length)]) : null;
    },
  };
}
