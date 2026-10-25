// The synth families' common parts (audio/sfx/*): how loud a physical event is (sound pressure level at 1 m, from the energy it puts into
// the air), how that level is played (the mix's window onto real loudness), and the few building blocks every family is made of: noise
// buffers made once, envelopes, filters, a bank of ringing modes, and short buffers filled sample by sample (a rattle of small plates, a
// crackle, a run of grains) where a node per grain would cost more than the samples.
//
// A voice is a little bag of nodes (`sfxVoice`): every source started in it is counted, and when the last one ends the whole chain is
// disconnected, so nothing lives on after its sound.
//
// Nothing here runs without an AudioContext; the pure parts (levels, the window) run in Node for the tests.

// ---- Loudness ------------------------------------------------------------------------------------------------------------------------

/**
 * The air's reference: sound power is radiated into a sphere; intensity at 1 m is power / 4π; the level is 10 log10(I / 1e-12 W/m²).
 * `REFERENCE_SPL` is the level played at full scale, and `SQUEEZE` how much of real life's range is kept: the 60 dB between a footstep
 * and a sword's clash at arm's length is squeezed into the ~40 dB a speaker in a room gives (the ear itself hears loudness as about the
 * 0.6 power of pressure: 0.7 keeps more than that).
 */
export const AUDIO_LEVEL = { REFERENCE_SPL: 100, SQUEEZE: 0.7, ceiling: 1 };

/** The level (dB SPL at 1 m) of `energy` J turned into sound with `efficiency` (a share, the material's radiation) over `seconds`. */
export function levelFromEnergy(energy, efficiency, seconds) {
  const power = (Math.max(1e-9, energy) * efficiency) / Math.max(0.005, seconds);
  return 10 * Math.log10(power / (4 * Math.PI) / 1e-12);
}

/**
 * The playback gain of a level at the ear (dB SPL): full scale at the reference, the range squeezed; never past full scale (a gun at
 * arm's length is as loud as the speaker goes). Each family's parts add up to about this peak.
 */
export function gainOfLevel(spl) {
  return Math.min(AUDIO_LEVEL.ceiling, 10 ** (((spl - AUDIO_LEVEL.REFERENCE_SPL) * AUDIO_LEVEL.SQUEEZE) / 20));
}

/**
 * How bright a struck thing's first instant is (Hz, the excitation's cut-off): the contact is shorter for a stiffer pair and a faster blow
 * (Hertz: contact time ∝ v^-1/5, so the band ∝ E^1/10 at a given mass). `hardness` 0 (flesh) .. 1 (steel on steel).
 */
export function contactBrightness(hardness, energy) {
  return (500 + 7500 * hardness * hardness) * Math.max(0.5, Math.min(2, (Math.max(0.01, energy) / 10) ** 0.1));
}

export const clamp01 = (value) => Math.max(0, Math.min(1, value));
export const sfxClamp = (value, low, high) => Math.max(low, Math.min(high, value));

// ---- Voices: nodes that clean themselves up -------------------------------------------------------------------------------------------

/** A voice into `out`: its nodes, its live sources, and when it ends. */
export function sfxVoice(ctx, out) {
  return { ctx, out, nodes: [], live: 0, end: ctx.currentTime, done: null };
}

/** Keep a node in the voice (disconnected with it). */
export function sfxKeep(voice, node) {
  voice.nodes.push(node);
  return node;
}

/** Start a source in the voice from `when` to `stop`; the last source to end takes the voice's nodes down. */
export function sfxRun(voice, source, when, stop) {
  sfxKeep(voice, source);
  voice.live += 1;
  source.onended = sfxEnded(voice);
  source.start(when);
  source.stop(stop);
  voice.end = Math.max(voice.end, stop);
  return source;
}

/** A filter into `dest`. */
export function sfxFilter(voice, dest, type, frequency, q = 0.7) {
  const filter = sfxKeep(voice, voice.ctx.createBiquadFilter());
  filter.type = type;
  filter.frequency.value = sfxClamp(frequency, 10, voice.ctx.sampleRate * 0.45);
  filter.Q.value = q;
  filter.connect(dest);
  return filter;
}

/** A plain gain into `dest`. */
export function sfxGain(voice, dest, value = 1) {
  const gain = sfxKeep(voice, voice.ctx.createGain());
  gain.gain.value = value;
  gain.connect(dest);
  return gain;
}

/**
 * A gain into `dest` shaped as a struck thing sounds: up in `attack` s to `peak`, held `hold` s, then down 60 dB over `decay` s
 * (an exponential: a ring dies by a fixed share each instant).
 */
export function sfxEnvelope(voice, dest, when, peak, attack, hold, decay) {
  const gain = sfxKeep(voice, voice.ctx.createGain());
  const g = gain.gain;
  g.setValueAtTime(0.0001, when);
  g.linearRampToValueAtTime(Math.max(0.0001, peak), when + Math.max(0.0005, attack));
  if (hold > 0) g.setValueAtTime(Math.max(0.0001, peak), when + attack + hold);
  g.exponentialRampToValueAtTime(Math.max(0.0001, peak) * 0.001, when + attack + hold + Math.max(0.005, decay));
  gain.connect(dest);
  return gain;
}

// ---- Noise ----------------------------------------------------------------------------------------------------------------------------

const NOISE_CACHE = new WeakMap();

/** A 3 s buffer of noise of a colour ('white', 'pink', 'brown'), made once per context. */
export function noiseBuffer(ctx, color = 'white') {
  let cache = NOISE_CACHE.get(ctx);
  if (!cache) NOISE_CACHE.set(ctx, (cache = {}));
  if (cache[color]) return cache[color];
  const length = Math.floor(ctx.sampleRate * 3);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, brown = 0;
  for (let index = 0; index < length; index += 1) {
    const white = Math.random() * 2 - 1;
    if (color === 'white') data[index] = white;
    else if (color === 'pink') {
      // Paul Kellet's economy pink: three one-pole filters summed.
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[index] = (b0 + b1 + b2 + white * 0.1848) * 0.22;
    } else {
      brown = (brown + 0.02 * white) / 1.02;
      data[index] = brown * 3.5;
    }
  }
  cache[color] = buffer;
  return buffer;
}

/**
 * How much of noise's amplitude a band-pass of quality `q` keeps (about the square root of its share of the spectrum): a family filtering
 * noise into a band multiplies by its inverse, so that the band, not the noise it was cut from, is at the level asked for.
 */
export const bandMakeUp = (q) => Math.sqrt(Math.max(0.5, q) * 6);

/** Noise of a colour into `dest` from `when` for `seconds`, from a random place in the buffer (each sound its own), at `rate`. */
export function sfxNoise(voice, dest, when, seconds, color = 'white', rate = 1) {
  const source = voice.ctx.createBufferSource();
  source.buffer = noiseBuffer(voice.ctx, color);
  source.loop = true;
  source.playbackRate.value = rate;
  source.connect(dest);
  const offset = Math.random() * (source.buffer.duration - 0.1);
  sfxKeep(voice, source);
  voice.live += 1;
  source.onended = sfxEnded(voice);
  source.start(when, offset);
  source.stop(when + seconds);
  voice.end = Math.max(voice.end, when + seconds);
  return source;
}

/** The handler that takes a voice down when its last source ends (shared by sfxRun and sfxNoise). */
function sfxEnded(voice) {
  return () => {
    voice.live -= 1;
    if (voice.live > 0) return;
    for (const node of voice.nodes) {
      try {
        node.disconnect();
      } catch {
        // Already gone.
      }
    }
    voice.nodes.length = 0;
    voice.done?.();
  };
}

/** A short burst: noise through a filter, enveloped. */
export function sfxBurst(voice, dest, { when, peak, attack = 0.001, hold = 0, decay, type = 'bandpass', frequency, q = 1, color = 'white', rate = 1 }) {
  const envelope = sfxEnvelope(voice, dest, when, peak, attack, hold, decay);
  const filter = sfxFilter(voice, envelope, type, frequency, q);
  sfxNoise(voice, filter, when, attack + hold + decay + 0.02, color, rate);
  return envelope;
}

/** A tone: an oscillator of `type` at `frequency` (an optional glide to `to` over the sound), enveloped. */
export function sfxTone(voice, dest, { when, peak, attack = 0.002, hold = 0, decay, frequency, to = null, type = 'sine', detune = 0 }) {
  const envelope = sfxEnvelope(voice, dest, when, peak, attack, hold, decay);
  const oscillator = voice.ctx.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, when);
  if (to) oscillator.frequency.exponentialRampToValueAtTime(Math.max(5, to), when + attack + hold + decay);
  oscillator.detune.value = detune;
  oscillator.connect(envelope);
  sfxRun(voice, oscillator, when, when + attack + hold + decay + 0.02);
  return oscillator;
}

/**
 * A bank of ringing modes (a struck plate, a blade, a bell-like boss): each `{ f, decay, amp }` a sine that dies 60 dB over its own decay.
 * `peak` the whole bank's level.
 */
export function sfxModes(voice, dest, when, modes, peak) {
  const sum = modes.reduce((total, mode) => total + mode.amp, 0) || 1;
  for (const mode of modes) {
    if (mode.f > voice.ctx.sampleRate * 0.45) continue;
    sfxTone(voice, dest, { when, peak: (peak * mode.amp) / sum, attack: 0.0008, decay: mode.decay, frequency: mode.f });
  }
}

// ---- Buffers filled by hand -------------------------------------------------------------------------------------------------------------

/** A mono buffer of `seconds`, filled by `fill(data, rate)`. */
export function sfxBuffer(ctx, seconds, fill) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  fill(buffer.getChannelData(0), ctx.sampleRate);
  return buffer;
}

/** Play a buffer into `dest` at `when` with a gain. */
export function sfxPlayBuffer(voice, dest, buffer, when, gain = 1, rate = 1) {
  const source = voice.ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  const level = sfxGain(voice, dest, gain);
  source.connect(level);
  sfxRun(voice, source, when, when + buffer.duration / rate + 0.01);
  return source;
}

/**
 * Write grains into `data`: `count` damped sinusoids (small plates, rings of mail, crackles, drops), each at a random time within
 * `spread` s (bunched toward the start by `bunch`), a frequency between `low` and `high` Hz, dying 60 dB over `decay` s, at `amp`
 * (each a little louder or softer at random).
 */
export function writeGrains(data, rate, { count, spread, low, high, decay, amp = 0.5, bunch = 1, start = 0, random = Math.random }) {
  const decaySamples = Math.max(8, Math.floor(decay * rate));
  for (let grain = 0; grain < count; grain += 1) {
    const at = Math.floor((start + spread * random() ** bunch) * rate);
    const frequency = low * (high / low) ** random();
    const step = (2 * Math.PI * frequency) / rate;
    const fall = Math.exp(-6.9 / decaySamples);
    let level = amp * (0.4 + 0.6 * random());
    const phase = random() * 6.283;
    const end = Math.min(data.length, at + decaySamples);
    for (let index = at, k = 0; index < end; index += 1, k += 1) {
      data[index] += level * Math.sin(phase + step * k);
      level *= fall;
    }
  }
}

/** Write crackle into `data`: noise bursts a few samples long at random times (wet tissue tearing, fire, sand under a boot). */
export function writeCrackle(data, rate, { count, spread, length = 0.002, amp = 0.6, start = 0, random = Math.random, shape = (share) => 1 }) {
  const samples = Math.max(2, Math.floor(length * rate));
  for (let grain = 0; grain < count; grain += 1) {
    const share = random();
    const at = Math.floor((start + spread * share) * rate);
    const level = amp * shape(share) * (0.3 + 0.7 * random());
    const end = Math.min(data.length, at + samples);
    for (let index = at; index < end; index += 1) data[index] += level * (random() * 2 - 1) * (1 - (index - at) / samples);
  }
}

/** A one-pole low-pass over `data` in place (cut-off `frequency` Hz): to round the grains off. */
export function lowpassInPlace(data, rate, frequency) {
  const k = 1 - Math.exp((-2 * Math.PI * frequency) / rate);
  let y = 0;
  for (let index = 0; index < data.length; index += 1) {
    y += k * (data[index] - y);
    data[index] = y;
  }
}

/** A seeded random (for loops made once, the same each load: the din, the beds). */
export function sfxRandom(seed = 1) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
