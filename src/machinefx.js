// A machine's (gear.machine: the humanoid robot, the combat bot) electrics
// failing, as the view shows it: graphics only, nothing in the fight hangs
// on it. A man bleeds; a machine shorts out. Its power runs at tens of volts
// and high current through cables at every joint: cut, or with its control
// dead and its motors' drives failing all at once, the conductors touch and
// arc, a blue-white flash that ionises the air (the colour of an arc
// welder's, much bluer than a fire's), throws droplets of molten copper and
// aluminium as sparks, and flickers as the contacts bounce and part.
//
// Two things, both run as emitters with a start and a life, kept in a small
// fixed pool (no allocation once the bout is under way):
//   'death': the machine goes down (killed, knocked out, cut down past going
//     on): a hard flash and a burst of sparks at its chest, then for a moment
//     arcs jumping at its joints, one after another, flickering, dying away.
//   'stump': a limb cut off: the stump sputters, sparks in bursts from the
//     cut cables with an arc now and then, weaker as the capacitors drain.
// What they do is asked of the view through `emit` (weaponview.js): sparks
// (from a point along a direction), an arc (a jagged short line between two
// points) and a flash (a point of light), so this file holds only numbers.

import { soundEvent } from './audio/log.js';
import { P } from './body.js';
import { point } from './physics.js';

export const MACHINE_FX = {
  // The pool: at most this many emitters running at once (a battle of bots).
  maxEmitters: 24,
  death: {
    seconds: 0.9,
    // The first moment: a hard flash (m) and a burst of sparks off the chest.
    flash: 0.5, burst: 26,
    // Then an arc at a joint every so often (s, the gap at the start; it widens as it dies), each with a few sparks.
    arcEvery: 0.07, arcSparks: 4,
  },
  stump: {
    seconds: 2.4,
    // Bursts of sparks from the cut: about this many a second at the start, `perBurst` each, an arc in this share of them.
    burstsPerSecond: 9, perBurst: 5, arcShare: 0.35,
    // The first moment, as it parts: a flash and a spray.
    flash: 0.32, burst: 22,
  },
  // Heard: each short is a sound event (audio/log.js) of this type at the spark's root, `intensity` 0..1 by kind
  // (the death's the harder: every drive at once; a cut stump's one cable bundle).
  sound: 'robotSpark', intensity: { death: 1, stump: 0.7 },
  // What brings a machine's death sparks: the events of a man put out of the fight (physics knockOut).
  downKinds: new Set(['killed', 'knockout', 'out', 'drowned']),
};

/** A store of emitters for one view: a fixed pool, and the machines already shorted out (once each). */
export function machineFxCreate(spec = MACHINE_FX) {
  const pool = [];
  for (let slot = 0; slot < spec.maxEmitters; slot += 1) pool.push({ live: false, kind: null, fighter: -1, joint: null, side: null, start: 0, next: 0, seed: 0, first: false });
  return { pool, downed: new Set() };
}

/** A new bout: every emitter out, no machine down. */
export function machineFxClear(store) {
  for (const emitter of store.pool) emitter.live = false;
  store.downed.clear();
}

/**
 * What an event asks of a machine's electrics: 'stump' (a part of it cut
 * off), 'death' (it is out of the fight), or null: a man (no machine), or
 * anything else.
 */
export function machineFxFor(event, fighter, spec = MACHINE_FX) {
  if (!fighter?.body?.gear?.machine) return null;
  if (event.kind === 'severed') return 'stump';
  if (spec.downKinds.has(event.kind)) return 'death';
  return null;
}

/**
 * Hear an event: start what it asks for, and log the short's sound
 * (`spec.sound`, { at, kind, intensity }: at the stump's joint for a cut, the
 * machine's middle for a death) for the audio to play. A machine dies once
 * (finished off where it lay, it does not short out again). Returns the
 * emitter started, or null.
 */
export function machineFxHear(store, event, world, now, spec = MACHINE_FX) {
  const fighter = world.fighters[event.fighter];
  const kind = machineFxFor(event, fighter, spec);
  if (!kind) return null;
  if (kind === 'death') {
    if (store.downed.has(fighter.id)) return null;
    store.downed.add(fighter.id);
  }
  // Full: the oldest gives way.
  let slot = store.pool.find((emitter) => !emitter.live);
  if (!slot) slot = store.pool.reduce((oldest, emitter) => (emitter.start < oldest.start ? emitter : oldest));
  slot.live = true;
  slot.kind = kind;
  slot.fighter = fighter.id;
  slot.joint = event.joint ?? null;
  slot.side = event.side ?? null;
  slot.start = now;
  slot.next = now;
  slot.seed = (fighter.id * 7919 + Math.round(now * 1000)) % 65536;
  slot.first = true;
  if (world.ear) {
    const at = kind === 'stump' && event.point ? event.point : point(fighter.x, P.pelvis);
    soundEvent(world, spec.sound, { at, kind, fighter: fighter.id, intensity: spec.intensity[kind] });
  }
  return slot;
}

/** Any emitter running (the view skips the step when not). */
export function machineFxBusy(store) {
  return store.pool.some((emitter) => emitter.live);
}

/**
 * Run the emitters to `now`. `emit` is the view's: { flash(emitter, size),
 * sparks(emitter, count), arc(emitter, strength 0..1) }, each finding where
 * on the machine it is (the chest or a joint for a death, the stump for a
 * cut); `random`: Math.random or a seeded stand-in.
 */
export function machineFxStep(store, now, emit, random = Math.random, spec = MACHINE_FX) {
  for (const emitter of store.pool) {
    if (!emitter.live) continue;
    const own = spec[emitter.kind];
    const age = now - emitter.start;
    if (age > own.seconds) {
      emitter.live = false;
      continue;
    }
    // (`first` is still set while the first moment is emitted: the view puts a death's at the chest.)
    if (emitter.first) {
      emit.flash(emitter, own.flash);
      emit.sparks(emitter, own.burst);
      emitter.first = false;
    }
    // Weaker as it goes: fewer and fainter arcs, the gaps between them longer.
    const left = 1 - age / own.seconds;
    while (emitter.next <= now) {
      if (emitter.kind === 'death') {
        emit.arc(emitter, left);
        emit.sparks(emitter, Math.max(1, Math.round(own.arcSparks * left)));
        emitter.next += own.arcEvery * (0.5 + random()) / Math.max(0.25, left);
      } else {
        emit.sparks(emitter, Math.max(1, Math.round(own.perBurst * (0.4 + left))));
        if (random() < own.arcShare * left) emit.arc(emitter, left);
        emitter.next += (0.4 + random() * 1.2) / (own.burstsPerSecond * Math.max(0.2, left));
      }
    }
  }
}
