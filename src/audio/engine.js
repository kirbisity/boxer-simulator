// The sound engine: the AudioContext and its buses, the mixer's settings, and the audio tick that turns what the ear hears into voices.
//
//   voice:  [synth family, or a recorded take: sfx/sampled.js] → gain → low-pass (the air, a wall between, behind on speakers) → panner (HRTF, or stereo on speakers)
//                                 ↘ send (by the voice's distance and the room) → the reverb
//   buses:  effects | voices | ambience | music → master → compressor → mute → out;  the reverb (probed: acoustics.js) → master
//
// The context exists only after the first tap, click or key (browsers allow no sound before one), and is resumed when the page comes back
// into view. Until then, and in Node where there is no AudioContext at all, every call is a no-op; the one thing done every frame
// regardless is telling the simulation where the ear is (`world.ear`), so that the sound log keeps only what it can hear.
//
// main.js calls `frame(info, dt)` from its render frame; the work is done at ~30 Hz: the ear placed (the camera's orientation, the
// player's head), the new events gathered, ranked and given voices (24, 14 on a phone; the quietest stolen by a louder one), the long
// voices' occlusion looked at again at 5 Hz, the room probed at 4 Hz, breathing and arrows going past, the far field's sectors, the
// ambience and the music.

import { sweepReach } from '../physics/terrain.js';
import { P } from '../body.js';
import { overdraftDepth } from '../physics/overdraft.js';
import { readSounds } from './log.js';
import { EAR, airCutoff, allocateVoices, behindCutoff, createListener, distanceGain, earDirection, isPhone, placeListener } from './ear.js';
import { OPEN_ROOM, PROBE, copyRoom, createReverb, probeRays, reverbSend, roomFromProbe, smoothRoom } from './acoustics.js';
import { countSectors, createFarField, createSectors } from './farfield.js';
import { ambienceTargets, createAmbience } from './ambience.js';
import { createMusic, musicMoment } from './music.js';
import { SOUND_FAMILIES, soundCandidates } from './families.js';
import { gainOfLevel, sfxVoice } from './synth.js';
import { createSampleBank } from './samples.js';
import { playWithSamples } from './sfx/sampled.js';
import { breathParams, playBreath, voiceOfBody } from './sfx/voice.js';
import { playWhizz, whizzParams } from './sfx/ranged.js';
import { playUi, uiParams } from './sfx/ui.js';
import { playThump, thumpParams } from './sfx/thump.js';
import { artDrawParams, artImpactParams, playArtDraw, playArtImpact } from './sfx/art.js';

/** The mixer's settings: the five levels (0..1), the Speakers toggle (null: the machine's default), mute. Kept in this browser. */
export const AUDIO_SETTINGS = { key: 'gladiator-audio', defaults: { master: 0.8, effects: 1, ambience: 0.8, music: 0.6, voices: 1, speakers: null, muted: false } };

/** The settings kept in `storage` (localStorage, or null where it is denied), over the defaults. */
export function loadAudioSettings(storage) {
  try {
    const kept = JSON.parse(storage?.getItem(AUDIO_SETTINGS.key) ?? 'null');
    return { ...AUDIO_SETTINGS.defaults, ...(kept && typeof kept === 'object' ? kept : {}) };
  } catch {
    return { ...AUDIO_SETTINGS.defaults };
  }
}

/** Keep the settings in `storage` (quietly nothing where it is denied). */
export function saveAudioSettings(storage, settings) {
  try {
    storage?.setItem(AUDIO_SETTINGS.key, JSON.stringify(settings));
  } catch {
    // A private window or blocked storage: the settings last this visit.
  }
}

/** How often the tick runs, the occlusion of long voices is looked at again, the room probed, the ambience moved (Hz). */
const RATES = { tick: 30, occlusion: 5, probe: PROBE.rate, ambience: 4 };
/** The breathers heard at once beside the player, and how near (m). */
const BREATH = { others: 2, near: 7 };

/** A fighter's mass (kg), summed once. */
const MASSES = new WeakMap();
function fighterMass(fighter) {
  let mass = MASSES.get(fighter);
  if (mass === undefined) {
    mass = fighter.body?.masses?.reduce((sum, value) => sum + value, 0) ?? 80;
    MASSES.set(fighter, mass);
  }
  return mass;
}
const fighterHeight = (fighter) => (fighter.body?.inputs?.heightCm ?? 178) / 100;

/** How hard a man is working, for his breath: 0 rested .. 1 spent, past 1 in the overdraft. */
export function exertionOf(fighter) {
  const stamina = fighter.stamina ?? 1;
  return stamina < 0 ? 1 + overdraftDepth(stamina) * 0.5 : 1 - Math.max(0, Math.min(1, stamina));
}

/**
 * The engine. `env`: the page (window), or nothing in Node (then everything is a no-op). Returns the controls main.js, the menus and the
 * bench use.
 */
export function createAudioEngine(env = typeof window === 'undefined' ? null : window) {
  const storage = (() => {
    try {
      return env?.localStorage ?? null;
    } catch {
      return null;
    }
  })();
  const settings = loadAudioSettings(storage);
  const phone = env ? isPhone(env) : false;
  const listener = createListener();
  const sectors = createSectors();
  const listeners = new Set();
  const state = {
    ctx: null, samples: null, buses: null, master: null, mute: null, reverb: null, music: null, ambience: null, farField: null, farMode: null,
    active: [], world: null, cursor: 0, clock: 0, occlusionClock: 0, probeClock: 0, ambienceClock: 0,
    room: copyRoom(OPEN_ROOM), probeHits: new Array(12), terrain: null, roomTest: null,
    breaths: new Map(), whizzed: new WeakSet(), excitement: 0, loud: 0, worldBorn: 0,
    bench: { room: null, ambience: null, far: null, open: false },
  };
  const speakers = () => (settings.speakers === null ? phone : Boolean(settings.speakers));
  const budget = () => (phone ? EAR.phoneBudget : EAR.budget);

  function changed() {
    saveAudioSettings(storage, settings);
    applyLevels();
    for (const callback of listeners) callback(settings);
  }

  function applyLevels() {
    if (!state.ctx) return;
    const now = state.ctx.currentTime;
    for (const name of ['effects', 'voices', 'ambience', 'music']) {
      state.buses[name].dry.gain.setTargetAtTime(settings[name], now, 0.05);
      state.buses[name].wet.gain.setTargetAtTime(settings[name], now, 0.05);
    }
    state.master.gain.setTargetAtTime(settings.master, now, 0.05);
    state.mute.gain.setTargetAtTime(settings.muted ? 0 : 1, now, 0.03);
    if (state.farMode !== speakers()) buildFarField();
  }

  // ---- The context and its graph ------------------------------------------------------------------------------------------------------

  function unlock() {
    if (state.ctx) {
      if (state.ctx.state !== 'running') state.ctx.resume().catch(() => {});
      return;
    }
    const Context = env?.AudioContext ?? env?.webkitAudioContext;
    if (!Context) return;
    // An iPhone or iPad keeps Web Audio silent while the ring switch is on silent, unless the page says its sound is playback (as a
    // video's is), not an alert's.
    try {
      if (env.navigator?.audioSession) env.navigator.audioSession.type = 'playback';
    } catch {}
    try {
      state.ctx = new Context({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    build();
    state.ctx.resume().catch(() => {});
  }

  function build() {
    const ctx = state.ctx;
    const compressor = ctx.createDynamicsCompressor();
    // A limiter's settings: the mix is left alone until it nears full scale (a gun at arm's length is not).
    compressor.threshold.value = -10;
    compressor.knee.value = 8;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.25;
    state.mute = ctx.createGain();
    compressor.connect(state.mute);
    state.mute.connect(ctx.destination);
    state.master = ctx.createGain();
    state.master.connect(compressor);
    const reverbIn = ctx.createGain();
    const reverbOut = ctx.createGain();
    reverbOut.connect(state.master);
    state.reverb = createReverb(ctx, reverbIn, reverbOut);
    state.buses = {};
    for (const name of ['effects', 'voices', 'ambience', 'music']) {
      // Each bus: dry to the master, and a return to the reverb that each voice's own send feeds; both at the bus's level (a voice sent
      // to the reverb with its bus turned down is turned down in the reverb too).
      const dry = ctx.createGain();
      dry.connect(state.master);
      const wet = ctx.createGain();
      wet.connect(reverbIn);
      state.buses[name] = { dry, wet };
    }
    state.music = createMusic(ctx, state.buses.music.dry, { onMissing: (moment) => ui(moment) });
    // The recorded takes (samples.js), decoded in the background: until they are, the synth plays everything.
    state.samples = createSampleBank(ctx);
    state.ambience = createAmbience(ctx, state.buses.ambience.dry, (at, bus, mapWide) => placeVoice(at, bus, { mapWide, priority: -Infinity }), state.samples);
    buildFarField();
    applyLevels();
    state.reverb.set(state.room, ctx.currentTime);
  }

  function buildFarField() {
    if (!state.ctx) return;
    for (const bed of state.farField?.beds ?? []) bed.panner.disconnect();
    state.farMode = speakers();
    state.farPanners = [];
    state.farField = createFarField(state.ctx, state.buses.ambience.dry, (azimuth, out) => {
      const chain = makePanner(azimuth, out);
      state.farPanners.push(chain);
      return chain.input;
    });
  }

  /** A panner into `out` for a side (far field): HRTF placed 30 m off on that side, or stereo with the behind-dulling. */
  function makePanner(azimuth, out) {
    const ctx = state.ctx;
    if (!speakers()) {
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'linear';
      panner.rolloffFactor = 0;
      panner.connect(out);
      return { input: panner, panner, azimuth };
    }
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = behindCutoff(azimuth);
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.sin(azimuth);
    filter.connect(panner);
    panner.connect(out);
    return { input: filter, panner, azimuth };
  }

  // ---- Voices ---------------------------------------------------------------------------------------------------------------------------

  /** Whether a line from the ear to `at` meets a solid of the terrain (a wall, a floor in the way). */
  function blocked(at) {
    if (!state.terrain) return false;
    const dx = at[0] - listener.x;
    const dy = at[1] - listener.y;
    const dz = at[2] - listener.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 0.8) return false;
    const dir = [dx / length, dy / length, dz / length];
    return sweepReach(state.terrain, [listener.x, listener.y, listener.z], dir, length, 0.02) < length - 0.4;
  }

  /** The low-pass of a voice: the air's, a wall's, the speakers' behind. */
  function cutoffFor(chain) {
    let cutoff = airCutoff(chain.distance);
    if (chain.blocked) cutoff = Math.min(cutoff, EAR.blockedCutoff);
    if (speakers()) cutoff = Math.min(cutoff, behindCutoff(chain.azimuth));
    return cutoff;
  }

  /**
   * A placed voice at `at` into a bus: its chain built (and the voice budget kept: a voice is taken from a quieter one if need be,
   * or null if this one is the quietest), its synth voice returned to play into. `atEar`: the level at the ear (dB SPL) for ranking.
   */
  function placeVoice(at, bus, { mapWide = false, atEar = 40, priority = 0, direction = null } = {}) {
    const ctx = state.ctx;
    if (!ctx) return null;
    if (state.active.length >= budget()) {
      if (priority === -Infinity) return null;
      const quietest = state.active.reduce((low, chain) => (!low || chain.atEar < low.atEar ? chain : low), null);
      if (!quietest || atEar <= quietest.atEar + EAR.stealMargin) return null;
      silence(quietest);
    }
    const seen = direction ?? earDirection(listener, at[0], at[1], at[2]);
    const chain = { at, bus, mapWide, atEar, distance: seen.distance, azimuth: seen.azimuth, elevation: seen.elevation, blocked: false, ends: ctx.currentTime + 0.5, nodes: [] };
    chain.blocked = blocked(at);
    const occlusion = ctx.createGain();
    occlusion.gain.value = chain.blocked ? 10 ** (-EAR.blockedLoss / 20) : 1;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoffFor(chain);
    occlusion.connect(filter);
    let panner;
    if (speakers()) {
      panner = ctx.createStereoPanner();
      panner.pan.value = Math.sin(chain.azimuth) * Math.cos(chain.elevation);
    } else {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'linear';
      panner.rolloffFactor = 0;
      setPosition(panner, at);
    }
    filter.connect(panner);
    panner.connect(state.buses[bus].dry);
    const send = ctx.createGain();
    send.gain.value = bus === 'music' ? 0 : reverbSend(state.room, chain.distance);
    filter.connect(send);
    send.connect(state.buses[bus].wet);
    chain.nodes.push(occlusion, filter, panner, send);
    chain.occlusion = occlusion;
    chain.filter = filter;
    const voice = sfxVoice(ctx, occlusion);
    voice.done = () => release(chain);
    voice.chain = chain;
    chain.voice = voice;
    state.active.push(chain);
    return voice;
  }

  function setPosition(panner, at) {
    if (panner.positionX) {
      panner.positionX.value = at[0];
      panner.positionY.value = at[1];
      panner.positionZ.value = at[2];
    } else panner.setPosition(at[0], at[1], at[2]);
  }

  /** A voice ended: its chain taken down. */
  function release(chain) {
    for (const node of chain.nodes) {
      try {
        node.disconnect();
      } catch {
        // Already gone.
      }
    }
    chain.nodes.length = 0;
    const at = state.active.indexOf(chain);
    if (at >= 0) state.active.splice(at, 1);
  }

  /** A voice taken for a louder one: faded out in 30 ms, its sources stopped. */
  function silence(chain) {
    const now = state.ctx.currentTime;
    chain.occlusion.gain.cancelScheduledValues(now);
    chain.occlusion.gain.setTargetAtTime(0, now, 0.01);
    for (const node of chain.voice.nodes) if (typeof node.stop === 'function') {
      try {
        node.stop(now + 0.05);
      } catch {
        // Not started or already stopped.
      }
    }
    const at = state.active.indexOf(chain);
    if (at >= 0) state.active.splice(at, 1);
  }

  /** Play one candidate (families.js) now (after the time the sound takes to arrive). */
  function playCandidate(candidate) {
    const { event, family, params, distance } = candidate;
    const at = [event.x ?? listener.x, event.y ?? listener.y, event.z ?? listener.z];
    const voice = placeVoice(at, family.bus, { mapWide: candidate.mapWide, atEar: candidate.atEar, direction: candidate });
    if (!voice) return;
    const chain = voice.chain;
    // Thunder far over the sea: placed at the strike's bearing, heard at its own distance.
    if (event.type === 'thunder') {
      chain.distance = distance;
      chain.filter.frequency.value = cutoffFor(chain);
    }
    const when = state.ctx.currentTime + 0.01 + distance / 343;
    const gain = gainOfLevel(candidate.atEar);
    chain.ends = playWithSamples(state.samples, voice, family, event, params, when, gain);
  }

  // ---- The tick -----------------------------------------------------------------------------------------------------------------------

  /** Every frame: the ear told to the world; at the tick's rate, the sound. */
  function frame(info, dt) {
    const world = info.world;
    // (While the bench is open it holds the ear and runs the tick itself.)
    if (!world || state.bench.open) return;
    if (info.head) placeListener(listener, info.head, info.camera);
    world.ear ??= { x: 0, y: 0, z: 0, radius: EAR.radius };
    world.ear.x = listener.x;
    world.ear.y = listener.y;
    world.ear.z = listener.z;
    world.ear.radius = EAR.radius;
    // The place (a PLACE_ARENAS key): what the log asks for the surface under a foot in a flat fight (audio/surface.js).
    if (info.place) world.place = info.place;
    if (world !== state.world) {
      // A new world: what was recorded before the ear came to it is not played.
      state.world = world;
      state.cursor = readSounds(world, 0).cursor;
      state.worldBorn = performance.now() / 1000;
      state.breaths.clear();
      state.strikeCount = info.strike?.count ?? 0;
    }
    // The storm's lightning (levelmode/storm.js): each new strike is thunder, heard at its distance (after distance / 343 s: playCandidate).
    const strike = info.strike;
    let thunder = null;
    if (strike && strike.count !== state.strikeCount) {
      state.strikeCount = strike.count;
      const distance = Math.hypot(strike.at[0] - listener.x, strike.at[1] - listener.z);
      thunder = { type: 'thunder', t: world.time ?? 0, x: strike.at[0], y: listener.y + 60, z: strike.at[1], distance };
    }
    state.clock += dt;
    if (state.clock < 1 / RATES.tick) return;
    const step = state.clock;
    state.clock = 0;
    const read = readSounds(world, state.cursor);
    state.cursor = read.cursor;
    if (!state.ctx || state.ctx.state !== 'running') return;
    tick(info, thunder ? [...read.events, thunder] : read.events, step);
  }

  function tick(info, events, dt) {
    const ctx = state.ctx;
    const now = ctx.currentTime;
    const world = info.world;
    state.terrain = info.terrain ?? null;
    state.roomTest = info.room ?? null;
    if (ctx.listener.positionX) {
      ctx.listener.positionX.value = listener.x;
      ctx.listener.positionY.value = listener.y;
      ctx.listener.positionZ.value = listener.z;
      ctx.listener.forwardX.value = listener.forward[0];
      ctx.listener.forwardY.value = listener.forward[1];
      ctx.listener.forwardZ.value = listener.forward[2];
      ctx.listener.upX.value = listener.up[0];
      ctx.listener.upY.value = listener.up[1];
      ctx.listener.upZ.value = listener.up[2];
    } else {
      ctx.listener.setPosition(listener.x, listener.y, listener.z);
      ctx.listener.setOrientation(...listener.forward, ...listener.up);
    }
    // The events of this tick: gathered, limited, ranked against the playing voices, played.
    const candidates = soundCandidates(events, listener);
    if (candidates.length) {
      const { start } = allocateVoices(state.active, candidates, budget());
      for (const candidate of start) playCandidate(candidate);
      for (const candidate of candidates) {
        if (candidate.atEar > state.loud) state.loud = candidate.atEar;
        // An arena's crowd rises to a heavy blow, a bad wound, a man going down.
        const e = candidate.event;
        if ((e.type === 'hit' && e.energy > 150) || (e.type === 'wound' && e.severity > 0.5) || e.type === 'fall' || (e.type === 'voice' && e.kind === 'death')) state.excitement = Math.min(1, state.excitement + 0.35);
      }
    }
    state.loud = Math.max(0, state.loud - 25 * dt);
    state.excitement = Math.max(0, state.excitement - 0.25 * dt);
    // The long voices' walls looked at again as the ear moves (and their pan, on speakers, as the camera turns).
    state.occlusionClock -= dt;
    if (state.occlusionClock <= 0) {
      state.occlusionClock = 1 / RATES.occlusion;
      for (const chain of state.active) {
        if (chain.ends - now < 0.4) continue;
        const was = chain.blocked;
        const seen = earDirection(listener, chain.at[0], chain.at[1], chain.at[2]);
        if (chain.mapWide && chain.distance > seen.distance) seen.distance = chain.distance;
        chain.azimuth = seen.azimuth;
        chain.blocked = blocked(chain.at);
        if (was !== chain.blocked) chain.occlusion.gain.setTargetAtTime(chain.blocked ? 10 ** (-EAR.blockedLoss / 20) : 1, now, 0.05);
        chain.filter.frequency.setTargetAtTime(cutoffFor(chain), now, 0.05);
      }
    }
    breathe(info, now);
    whizz(world, now);
    // The room: probed a few times a second (or the bench's place), eased.
    state.probeClock -= dt;
    if (state.probeClock <= 0) {
      state.probeClock = 1 / RATES.probe;
      const target = state.bench.room ?? (state.terrain || state.roomTest ? roomFromProbe(probeRays(state.terrain, state.roomTest, [listener.x, listener.y, listener.z], state.probeHits)) : OPEN_ROOM);
      state.roomTarget = target;
    }
    if (state.roomTarget) {
      smoothRoom(state.room, state.roomTarget, dt);
      state.reverb.set(state.room, now);
    }
    // The far field: one pass over the fighters (or the bench's counts).
    state.farField.update(state.bench.far ?? countSectors(world.fighters, listener, sectors), now);
    placeFarPanners();
    // The ambience and the music, a few times a second.
    state.ambienceClock -= dt;
    if (state.ambienceClock <= 0) {
      const step = 1 / RATES.ambience;
      state.ambienceClock = step;
      // (The beds duck under a loud fight as the music does.)
      const scene = { ...info.ambience, room: state.room, ear: [listener.x, listener.y, listener.z], excitement: state.excitement, duck: Math.max(0, (state.loud - 78) / 20), ...state.bench.ambience };
      state.ambience.update(ambienceTargets(scene), scene, now, step);
    }
    if (state.bench.open) state.music.maintain(now);
    else {
      const moment = musicMoment({ ...info.music, worldId: worldId(world), worldAge: performance.now() / 1000 - state.worldBorn });
      state.music.update({ ...moment, scene: info.music?.scene, duck: Math.max(0, (state.loud - 78) / 20) }, now);
    }
  }

  const worldIds = new WeakMap();
  let nextWorldId = 1;
  function worldId(world) {
    if (!worldIds.has(world)) worldIds.set(world, nextWorldId++);
    return worldIds.get(world);
  }

  /** The far field's panners kept on their sides of the camera as it turns (HRTF: 30 m off the ear that way). */
  function placeFarPanners() {
    for (const chain of state.farPanners ?? []) {
      if (!chain.panner.positionX) continue;
      const c = Math.cos(chain.azimuth);
      const s = Math.sin(chain.azimuth);
      const fx = listener.forward[0];
      const fz = listener.forward[2];
      const fl = Math.hypot(fx, fz) || 1;
      setPosition(chain.panner, [listener.x + 30 * ((fx / fl) * c + listener.right[0] * s), listener.y, listener.z + 30 * ((fz / fl) * c + listener.right[2] * s)]);
    }
  }

  /** Breathing: the player always, and the nearest few others, each breath scheduled from his exertion. */
  function breathe(info, now) {
    const world = info.world;
    const wanted = [];
    const player = info.player;
    if (player && player.state !== 'out') wanted.push(player);
    const others = [];
    for (const fighter of world.fighters) {
      if (fighter === player || fighter.dormant || fighter.state === 'out') continue;
      const head = P.head * 3;
      const d = Math.hypot(fighter.x[head] - listener.x, fighter.x[head + 1] - listener.y, fighter.x[head + 2] - listener.z);
      if (d < BREATH.near) others.push({ fighter, d });
    }
    others.sort((a, b) => a.d - b.d);
    for (const { fighter } of others.slice(0, BREATH.others)) wanted.push(fighter);
    for (const fighter of wanted) {
      let breather = state.breaths.get(fighter);
      if (!breather) {
        breather = { next: now + Math.random(), inhale: true };
        state.breaths.set(fighter, breather);
      }
      if (now < breather.next) continue;
      const exertion = exertionOf(fighter);
      const breath = breathParams(exertion, fighterHeight(fighter));
      const head = P.head * 3;
      const at = [fighter.x[head], fighter.x[head + 1], fighter.x[head + 2]];
      // His own mouth is a hand from his ears: the nearest a breath is heard from.
      const d = Math.max(0.3, Math.hypot(at[0] - listener.x, at[1] - listener.y, at[2] - listener.z));
      const atEar = breath.level + 20 * Math.log10(Math.max(EAR.floor, 1 / d));
      const voice = placeVoice(at, 'voices', { atEar, priority: fighter === player ? 0 : -Infinity });
      breather.next = now + (breather.inhale ? breath.inSeconds : breath.outSeconds) + 0.05;
      if (voice) voice.chain.ends = playBreath(voice, voice.out, breath, now + 0.01, gainOfLevel(atEar), breather.inhale);
      breather.inhale = !breather.inhale;
    }
    for (const fighter of state.breaths.keys()) if (!wanted.includes(fighter)) state.breaths.delete(fighter);
  }

  /** Arrows and bolts in the air: one going past within a few metres of the head whizzes, once, as it comes by. */
  function whizz(world, now) {
    for (const arrow of world.arrows ?? []) {
      if (arrow.done || arrow.landed || state.whizzed.has(arrow)) continue;
      const v = arrow.v;
      const speed = Math.hypot(v[0], v[1], v[2]);
      if (speed < 5) continue;
      const rx = listener.x - arrow.x[0];
      const ry = listener.y - arrow.x[1];
      const rz = listener.z - arrow.x[2];
      // Its closest approach to the head: the time to it along its flight, and how near.
      const t = (rx * v[0] + ry * v[1] + rz * v[2]) / (speed * speed);
      if (t < 0 || t > 0.15) continue;
      const cx = arrow.x[0] + v[0] * t - listener.x;
      const cy = arrow.x[1] + v[1] * t - listener.y;
      const cz = arrow.x[2] + v[2] * t - listener.z;
      const closest = Math.hypot(cx, cy, cz);
      if (closest > 4) continue;
      state.whizzed.add(arrow);
      const params = whizzParams(speed, closest);
      const at = [listener.x + cx, listener.y + cy, listener.z + cz];
      const atEar = params.level + 20 * Math.log10(distanceGain(closest));
      const voice = placeVoice(at, 'effects', { atEar });
      if (voice) voice.chain.ends = playWhizz(voice, voice.out, params, now + t - params.seconds * 0.5 + 0.01, gainOfLevel(atEar));
    }
  }

  // ---- The menus' sounds and the bench -------------------------------------------------------------------------------------------------

  /** A UI sound (click, confirm, back, victory, defeat), straight into the effects bus. */
  function ui(kind) {
    if (!state.ctx || state.ctx.state !== 'running') return;
    const voice = sfxVoice(state.ctx, state.buses.effects.dry);
    playUi(voice, voice.out, uiParams(kind), state.ctx.currentTime + 0.005, 0.8);
  }

  /** The hit feel's thump (hitfeel.js) of a blow the player felt, at `gain` (0..1), a blow of `strength` (0..1: lower and longer the heavier), straight into the effects bus. */
  function thump(gain, strength = gain) {
    if (!state.ctx || state.ctx.state !== 'running' || !(gain > 0)) return;
    const voice = sfxVoice(state.ctx, state.buses.effects.dry);
    playThump(voice, voice.out, thumpParams(strength), state.ctx.currentTime + 0.002, Math.min(1, gain));
  }

  /**
   * A weapon art's own layer (artdrama.js), straight into the effects bus: 'draw' at its start (`blade`: with the steel's ring),
   * 'impact' at its contact, by `strength` (0..1; `metal`: with a ring of steel), at `gain` (0..1).
   */
  function art(kind, gain, { strength = 1, metal = false, blade = true } = {}) {
    if (!state.ctx || state.ctx.state !== 'running' || !(gain > 0)) return;
    const voice = sfxVoice(state.ctx, state.buses.effects.dry);
    const when = state.ctx.currentTime + 0.002;
    if (kind === 'draw') playArtDraw(voice, voice.out, artDrawParams(blade), when, Math.min(1, gain));
    else playArtImpact(voice, voice.out, artImpactParams(strength, metal), when, Math.min(1, gain));
  }

  /**
   * Play an event as the bench asks: `event` (its type and fields) at `at` ([x, y, z], round a listener at the origin facing -z), now.
   * Returns { params, atEar, distance } (what was played), or null without a context.
   */
  function playEventAt(event, at) {
    if (!state.ctx) return null;
    const family = SOUND_FAMILIES[event.type];
    if (!family) return null;
    const full = { t: 0, ...event, x: at[0], y: at[1], z: at[2] };
    const direction = earDirection(listener, at[0], at[1], at[2]);
    const params = family.params(full);
    const distance = event.type === 'thunder' ? Math.max(direction.distance, event.distance ?? 2000) : direction.distance;
    const atEar = params.level + 20 * Math.log10(distanceGain(distance, event.type === 'thunder' || event.kind === 'matchlock' || event.kind === 'cannon'));
    playCandidate({ event: full, family, params, distance, azimuth: direction.azimuth, elevation: direction.elevation, atEar, mapWide: true });
    return { params, atEar, distance, azimuth: direction.azimuth };
  }

  /** Breath of an exertion and size at `at` (the bench). */
  function playBreathAt(exertion, size, at, inhale = false) {
    if (!state.ctx) return null;
    const breath = breathParams(exertion, size);
    const d = Math.max(0.3, Math.hypot(at[0] - listener.x, at[1] - listener.y, at[2] - listener.z));
    const atEar = breath.level + 20 * Math.log10(distanceGain(d));
    const voice = placeVoice(at, 'voices', { atEar: 200 });
    if (voice) playBreath(voice, voice.out, breath, state.ctx.currentTime + 0.01, gainOfLevel(atEar), inhale);
    return breath;
  }

  if (env?.addEventListener) {
    // The first gesture starts the sound (sound is on by default); a page back in view takes it up again.
    for (const kind of ['pointerdown', 'keydown', 'touchend']) env.addEventListener(kind, unlock, { capture: true, passive: true });
    // (A page loaded after a tap already given, a reload, may start at once.)
    if (env.navigator?.userActivation?.hasBeenActive) unlock();
    env.document?.addEventListener('visibilitychange', () => {
      if (!state.ctx) return;
      if (env.document.hidden) state.ctx.suspend().catch(() => {});
      else state.ctx.resume().catch(() => {});
    });
  }

  return {
    settings,
    phone,
    listener,
    frame,
    ui,
    thump,
    art,
    unlock,
    /** Set a mixer level or toggle (name: master, effects, ambience, music, voices, speakers, muted); kept. */
    set(name, value) {
      settings[name] = value;
      changed();
    },
    toggleMute() {
      settings.muted = !settings.muted;
      changed();
      return settings.muted;
    },
    /** Whether the output is stereo panning (Speakers) rather than HRTF. */
    speakers,
    onChange(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    /** What is going on (the bench, tests): the context's state, voices playing, the room, the far field's sums. */
    status: () => ({ running: state.ctx?.state === 'running', voices: state.active.length, budget: budget(), room: { ...state.room }, sectors, mode: speakers() ? 'stereo' : 'hrtf', music: state.music?.status() ?? null, samples: state.samples?.count() ?? 0, loops: Object.keys(state.ambience?.recorded ?? {}) }),
    context: () => state.ctx,
    bench: {
      open(on) {
        state.bench.open = on;
        if (!on) {
          state.bench.room = null;
          state.bench.ambience = null;
          state.bench.far = null;
          state.music?.stop();
        }
      },
      /** Hold the listener at a point facing a way (the bench's circle: at the origin, facing -z). */
      listen(head, camera) {
        placeListener(listener, head, camera);
      },
      playEventAt,
      playBreathAt,
      /** An arrow at `speed` m/s going past at `at` (its closest point to the ear). */
      playWhizzAt(speed, at) {
        if (!state.ctx) return null;
        const closest = Math.hypot(at[0] - listener.x, at[1] - listener.y, at[2] - listener.z);
        const params = whizzParams(speed, closest);
        const atEar = params.level + 20 * Math.log10(distanceGain(closest));
        const voice = placeVoice(at, 'effects', { atEar: 200 });
        if (voice) voice.chain.ends = playWhizz(voice, voice.out, params, state.ctx.currentTime + 0.01, gainOfLevel(atEar));
        return params;
      },
      room(room) {
        state.bench.room = room;
      },
      ambience(override) {
        state.bench.ambience = override;
      },
      far(counts) {
        state.bench.far = counts;
      },
      music: (id) => state.music?.play(id),
      stopMusic: () => state.music?.stop(),
      /** Run the tick with a still world (the bench's own: no fighters) so the room, the beds and the far field move. */
      tick(dt) {
        if (!state.ctx) return;
        tick({ world: { fighters: [], arrows: [] }, ambience: {}, music: {} }, [], dt);
      },
    },
  };
}
