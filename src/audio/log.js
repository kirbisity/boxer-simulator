// PLACEHOLDER (replaced at merge by the event agent's log): the sound log, a capped ring of what happened, on the world.
// `soundEvent(world, type, data)` appends { type, t, x, y, z, ...data }; the ear (audio/engine.js) reads what is new with `readSounds`.
// Events beyond `world.ear.radius` are not kept, but thunder and gunfire (heard over the whole map).

const SOUND_LOG_CAP = 256;

/** Record a sound. A no-op when the world has `sounds === false` (a headless run that wants nothing). */
export function soundEvent(world, type, data) {
  if (world.sounds === false) return;
  const ear = world.ear;
  const mapWide = type === 'thunder' || (type === 'shot' && (data.kind === 'matchlock' || data.kind === 'cannon'));
  if (ear && !mapWide && Math.hypot(data.x - ear.x, data.y - ear.y, data.z - ear.z) > ear.radius) return;
  const log = (world.sounds ??= { ring: new Array(SOUND_LOG_CAP), count: 0 });
  log.ring[log.count % SOUND_LOG_CAP] = { type, t: world.time ?? 0, ...data };
  log.count += 1;
}

/** What has been recorded since `cursor` (at most the ring's length): { events, cursor }. */
export function readSounds(world, cursor = 0) {
  const log = world.sounds;
  if (!log) return { events: [], cursor: 0 };
  const events = [];
  for (let index = Math.max(cursor, log.count - SOUND_LOG_CAP); index < log.count; index += 1) events.push(log.ring[index % SOUND_LOG_CAP]);
  return { events, cursor: log.count };
}
