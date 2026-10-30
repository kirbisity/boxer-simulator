// Which synth family plays each recorded event (audio/log.js's types), and the ear's gathering of one tick's events into candidates:
// each with its family's parameters (its level at 1 m among them), its distance and direction from the ear, its level there, and
// whether the 10-20 m rule keeps it. (Where a recorded take fits an event, sfx/sampled.js plays it instead of, or beside, the family.) Pure (the parameters need no context): Node tests and the timing tool run it.

import { earDirection, isMapWide, levelAtEar, limitPerTick, thinningKeeps } from './ear.js';
import { clashParams, playClash } from './sfx/clash.js';
import { clatterParams, fallParams, playClatter, playFall } from './sfx/fall.js';
import { horseParams, playHorse } from './sfx/horse.js';
import { arrowHitParams, impactParams, playImpact } from './sfx/impact.js';
import { playShot, shotParams } from './sfx/ranged.js';
import { playStep, stepParams } from './sfx/step.js';
import { playSwing, swingParams } from './sfx/swing.js';
import { cryLevel, cryOfEvent, playVoice, voiceParams } from './sfx/voice.js';
import { mechParams, playMech, playThunder, thunderParams } from './sfx/world.js';
import { playWound, woundParams } from './sfx/wound.js';

/**
 * Each event type: its parameters, its player, the bus it goes to ('effects' or 'voices'), `boost` (dB over its level, the user's
 * choice: the weapon's work, on armour, on flesh, on another weapon, and the guns, are what a fight is heard as), `silent` (logged
 * but not played) and `sampledOnly` (played only from its recordings: the synth's cries and grunts sounded wrong, the user said; the
 * cries are now the recorded ones, rationed by audio/cries.js, and an effort, which has no recording, is silent).
 */
export const SOUND_FAMILIES = {
  hit: { params: impactParams, play: playImpact, bus: 'effects', boost: 6 },
  wound: { params: woundParams, play: playWound, bus: 'effects', boost: 4 },
  clash: { params: clashParams, play: playClash, bus: 'effects', boost: 6 },
  swing: { params: swingParams, play: playSwing, bus: 'effects' },
  step: { params: stepParams, play: playStep, bus: 'effects' },
  fall: { params: (event) => fallParams(event, 'fall'), play: playFall, bus: 'effects' },
  land: { params: (event) => fallParams(event, 'land'), play: playFall, bus: 'effects' },
  clatter: { params: clatterParams, play: playClatter, bus: 'effects' },
  voice: { params: voiceFamilyParams, play: playVoice, bus: 'voices', sampledOnly: true },
  horse: { params: horseParams, play: playHorse, bus: 'effects' },
  shot: { params: shotParams, play: playShot, bus: 'effects', boost: 4 },
  arrowhit: { params: arrowHitParams, play: playImpact, bus: 'effects', boost: 4 },
  mech: { params: mechParams, play: playMech, bus: 'effects' },
  thunder: { params: thunderParams, play: playThunder, bus: 'ambience' },
};

/** A voice event's params: the synth's, at its cry's level where it is one (cryOfEvent), else silent (an effort: no recording). */
function voiceFamilyParams(event) {
  const params = voiceParams(event);
  const cry = cryOfEvent(event);
  return { ...params, level: cry ? cryLevel(cry) : -Infinity };
}

/**
 * One tick's events as candidates for voices: { event, family, params, distance, azimuth, elevation, atEar, mapWide }, those the
 * circle and the 10-20 m rule keep, limited per kind. Thunder is heard at its own distance (the bolt is far over the sea; the event's
 * point is only where to pan it).
 */
export function soundCandidates(events, listener) {
  const out = [];
  for (const event of mergeVoices(events)) {
    const family = SOUND_FAMILIES[event.type];
    if (!family || family.silent) continue;
    const mapWide = isMapWide(event);
    const direction = earDirection(listener, event.x ?? listener.x, event.y ?? listener.y, event.z ?? listener.z, { distance: 0, azimuth: 0, elevation: 0 });
    const distance = event.type === 'thunder' ? Math.max(direction.distance, event.distance ?? 2000) : direction.distance;
    const params = family.params(event);
    if (params.level === -Infinity) continue;
    const atEar = levelAtEar(params.level + (family.boost ?? 0), distance, mapWide);
    if (!thinningKeeps(atEar, distance, mapWide)) continue;
    out.push({ event, family, params, distance, azimuth: direction.azimuth, elevation: direction.elevation, atEar, mapWide });
  }
  return limitPerTick(out);
}

/**
 * A blow that wounds is logged as two voices of the same man at the same instant (the cry of the wound and the grunt of being struck):
 * one throat makes one sound, so only the stronger is kept. Returns `events` itself when there is nothing to merge.
 */
export function mergeVoices(events) {
  let strongest = null;
  for (const event of events) {
    if (event.type !== 'voice' || event.who === undefined || event.who < 0) continue;
    strongest ??= new Map();
    const key = `${event.who}:${event.t}`;
    const kept = strongest.get(key);
    if (!kept || (event.strength ?? 0) > (kept.strength ?? 0)) strongest.set(key, event);
  }
  if (!strongest) return events;
  return events.filter((event) => event.type !== 'voice' || event.who === undefined || event.who < 0 || strongest.get(`${event.who}:${event.t}`) === event);
}
