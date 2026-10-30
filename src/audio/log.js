// The sound log: what happened in the world, for the ear to hear. Objects do not own sounds; the simulation writes down each event
// (a blow, a clash, a step, a fall, a cry) where and when it happened, with the physical quantities that made it, and the ear
// (src/audio/ear.js) reads the new ones each audio tick and turns those within its circle into sound.
//
// Nothing here changes the simulation: a call reads values the physics has already worked out and writes only to `world.sounds`.
// With no ear (`world.ear` unset: in Node, in tests and tools, before the first tap) a call returns at once. Callers whose event
// costs anything to put together test `world.ear` first themselves.
//
//   world.ear = { x, y, z, radius }   set by the audio engine each frame: the listener (world m, y up), and how far it hears
//   world.sounds                      a ring of the last SOUND_RING events, made on the first: event k is at index k % SOUND_RING
//   world.soundsCount                 how many have been recorded, ever (the reader's cursor runs on it)
//
// An event is { type, t (world.time), x, y, z, ...its fields }; the types and their fields are in the spec
// (working-memory/projects/boxer-simulator/specs/2026-10-24-sound-design.md) and the hooks that write them name the values they take.

import { P } from '../body.js';
import { HELMETS, outfitOf } from '../outfits.js';
import { protectionAt } from '../physics.js';
import { surfaceAt, surfaceUnder } from './surface.js';

/** How many events the log keeps: a reader more than this far behind has lost the oldest. */
export const SOUND_RING = 4096;

// Heard over the whole map, wherever the ear is: thunder and gunpowder.
const MAP_WIDE_SHOTS = new Set(['matchlock', 'cannon']);

/** Record a sound event at `data.x, data.y, data.z` (or `data.at`, a point), unless the ear is too far off to hear it. */
export function soundEvent(world, type, data) {
  const ear = world.ear;
  if (!ear) return;
  const at = data.at;
  const x = at ? at[0] : data.x;
  const y = at ? at[1] : data.y;
  const z = at ? at[2] : data.z;
  // (A point that is no point, a NaN from a part that has none, is nowhere to be heard.)
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  const mapWide = type === 'thunder' || (type === 'shot' && MAP_WIDE_SHOTS.has(data.kind));
  if (!mapWide && Math.hypot(x - ear.x, z - ear.z) > ear.radius) return;
  const event = { type, t: world.time, ...data, x, y, z };
  if (at) delete event.at;
  world.sounds ??= new Array(SOUND_RING);
  const count = world.soundsCount ?? 0;
  world.sounds[count % SOUND_RING] = event;
  world.soundsCount = count + 1;
}

/**
 * The events recorded since `cursor` (a count of events, from the last read; 0 at first), oldest first, and the cursor to read from
 * next. A reader that fell more than a ring behind gets the last ring of them.
 */
export function readSounds(world, cursor = 0) {
  const count = world.soundsCount ?? 0;
  const events = [];
  for (let index = Math.max(cursor, count - SOUND_RING); index < count; index += 1) events.push(world.sounds[index % SOUND_RING]);
  return { events, cursor: count };
}

// ---- What meets what -----------------------------------------------------------------------------------------------------------

// A part guarded by less than this (blunt or cut, 0..1) is bare to a blow: what it meets is the man (cloth, a robe, a corset).
const BARE_BELOW = 0.12;

/**
 * What each kit's body armour (an outfit design's `armor.kind`, outfits.js) is made of, as a blow sounds on it. A kit whose armour is
 * only pieces on the limbs and the head (the gladiators') is null: its pieces are plate where they turn a blade (bronze greaves,
 * manicae of lames) and quilted linen where they do not.
 */
export const ARMOUR_COVERING = {
  plate: 'plate', breastplate: 'plate', conquistador: 'plate', segmentata: 'plate', toseiDo: 'plate', okegawa: 'plate', roninDo: 'plate', robot: 'plate',
  templar: 'mail', haubergeon: 'mail', hauberk: 'mail', centurion: 'mail', krug: 'mail',
  lamellar: 'lamellar', oyoroi: 'lamellar', doMaru: 'lamellar', doMaruSode: 'lamellar', hanLamellar: 'lamellar', mingLamellar: 'lamellar', mingEliteLamellar: 'lamellar',
  mongolLamellar: 'lamellar', mongolIron: 'lamellar', kheshig: 'lamellar', ironPagoda: 'lamellar',
  // Small plates riveted inside cloth or sewn over it: a rattle of little plates under the blow.
  scissor: 'scale', guanYu: 'scale', mingScale: 'scale', mingScaleCoat: 'scale', brigandine: 'scale', mingBrigandine: 'scale', mingElite: 'scale',
  // Quilted cotton and linen, felt and cloth over mail (a kazaghand's outside is cloth), a soft vest: the blow lands in padding.
  mingQuilt: 'padded', escaupil: 'padded', ichcahuipilli: 'padded', jaguarSuit: 'padded', featherSuit: 'padded', dolama: 'padded', kazaghand: 'padded',
  mongolDeel: 'padded', patrolVest: 'padded', plateCarrier: 'padded',
  // Hard leather, a lion's hide, a riot suit's moulded shell: a sharp slap, no ring.
  maximus: 'leather', commodus: 'leather', riot: 'leather', heavyRiot: 'leather',
  hoplomachus: null, murmillo: null, secutor: null, retiarius: null, thraex: null,
};

/** What each helm (outfits.js HELMETS, by the design's `head.kind`) is made of: iron and bronze ring as plate; the rest by their stuff. */
export const HELM_COVERING = {
  bascinet: 'plate', stechhelm: 'plate', greatHelm: 'plate', kettleHat: 'plate', kabuto: 'plate', jingasa: 'plate', arenaHelm: 'plate', mingHat: 'plate',
  mingHelm: 'plate', pagodaHelm: 'plate', hanHelm: 'plate', galea: 'plate', steppeHelm: 'plate', chichak: 'plate', ayyubidHelm: 'plate', morion: 'plate',
  cabasset: 'plate', potHelmet: 'plate', robotHead: 'plate', montefortino: 'plate', ridgeHelm: 'plate', spangenhelm: 'plate',
  riotHelmet: 'leather', opsHelmet: 'leather', lionHead: 'leather',
  jaguarHelm: 'wood', eagleHelm: 'wood',
  turban: 'padded', bork: 'padded', bashlyk: 'padded',
};

/** What a blow on a fighter's part (a capsule key: head, trunk, lForearm...) meets: flesh, or what covers it there. */
export function coveringAt(fighter, part) {
  const gear = fighter.body.gear;
  const guard = protectionAt(gear, part);
  if (Math.max(guard.blunt ?? 0, guard.cut ?? 0) < BARE_BELOW) return 'flesh';
  const { look } = outfitOf(fighter.body.inputs);
  if (part === 'head') return HELM_COVERING[look.head?.kind] ?? (HELMETS[look.head?.kind] && guard.deflects ? 'plate' : 'padded');
  const kit = ARMOUR_COVERING[look.armor?.kind];
  if (kit) return kit;
  return guard.deflects ? 'plate' : 'padded';
}

// The step's and the fall's armour: what jingles or clanks on a man as he moves (scale rattles as lamellar does; leather as padding).
const KIT_ARMOUR = { plate: 'plate', mail: 'mail', lamellar: 'lamellar', scale: 'lamellar', padded: 'padded', leather: 'padded', wood: 'padded', flesh: 'none' };

/** The armour a fighter moves in, as his steps and falls sound: none | mail | plate | lamellar | padded (his trunk's covering). */
export function armourOf(fighter) {
  return KIT_ARMOUR[coveringAt(fighter, 'trunk')];
}

/** A shield's face as a blow sounds on it: an iron buckler or a steel rodela rings; boards, wicker, hide and a riot shield's plastic knock. */
export function shieldCovering(shield) {
  return shield?.spec.look === 'steel' ? 'shieldmetal' : 'wood';
}

/** What struck, for a blow of a limb (a move's `limb`: rHand, lFoot, rKnee, lElbow): fist, foot, knee or elbow. */
export function limbStriker(limb) {
  if (limb.endsWith('Hand')) return 'fist';
  if (limb.endsWith('Foot')) return 'foot';
  if (limb.endsWith('Knee')) return 'knee';
  if (limb.endsWith('Elbow')) return 'elbow';
  return 'body';
}

/** What struck, for a weapon's blow by how it landed (weapons.js harmMix): an edge across (blade), a point first (point), or the weight (blunt). */
export function weaponStriker(mix) {
  if (mix.cut + mix.pierce <= mix.blunt) return 'blunt';
  return mix.pierce > mix.cut ? 'point' : 'blade';
}

/**
 * The part of a weapon two weapons met at, `along` m from the hand: its shaft or grip short of where it strikes from (a haft), else its
 * head: an edge or a point (blade) or a weight (blunt).
 */
export function weaponPart(weapon, along) {
  const spec = weapon.spec;
  if (along < spec.strikeFrom) return 'haft';
  const harm = spec.harm ?? {};
  return (harm.swing?.cut ?? 0) > 0 || (harm.thrust?.pierce ?? 0) > 0 || (harm.thrust?.cut ?? 0) > 0 ? 'blade' : 'blunt';
}

/** A man's voice, as the synthesised one is pitched: his standing height (m) and his body's own mass (kg, without his kit). */
export function voiceOf(fighter) {
  return { size: fighter.body.heightM, mass: fighter.body.bodyMassKg ?? fighter.body.massKg, who: fighter.id, sex: fighter.body.inputs?.sex, age: fighter.body.inputs?.age };
}

/** Where a fighter's particle is: [x, y, z] (a copy). */
export function particleAt(fighter, index) {
  return [fighter.x[index * 3], fighter.x[index * 3 + 1], fighter.x[index * 3 + 2]];
}

// ---- The events the hooks write ------------------------------------------------------------------------------------------------

// The strikers that are a weapon's head (log.js weaponStriker).
const WEAPON_STRIKERS = new Set(['blade', 'point', 'blunt']);

// A blow that moves the part struck this fast (m/s: its impulse over the mass it meets) is as hard as a cry gets; a lighter one, less.
const STRUCK_FULL = 3;
// A cut into the flesh that spends this much (J) is the worst there is: twice what physics.js calls a deep cut.
const CUT_FULL = 80;
// A wound this bad or worse (0..1) makes him cry out.
const CRY_FROM = 0.5;

/**
 * A blow landed: on `struck`'s `part` at `at`, by `by` (a fighter, or null for none), with the energy it spent (J) and its impulse
 * (N s). `covering`: what it met, if not what he wears there (a shield's face). `deltaV` (m/s, the part's speed change): above
 * nothing, and he is not out, he grunts with it. Callers test world.ear first (what it meets is looked up here).
 */
export function soundHit(world, struck, by, part, at, { energy, impulse, striker, covering = null, braced = false, deltaV = 0 }) {
  if (!world.ear) return;
  // `mass`: the weapon's (kg) for a weapon's blow: a heavier one is heard lower.
  const mass = WEAPON_STRIKERS.has(striker) ? by?.weapon?.spec?.mass : undefined;
  const met = covering ?? coveringAt(struck, part);
  soundEvent(world, 'hit', { at, energy, impulse, striker, covering: met, part, braced, who: struck.id, by: by ? by.id : -1, mass });
  // (The blow's energy and what it met go with his voice: the pain of it to him is the cry director's, audio/cries.js.)
  if (deltaV > 0 && struck.state !== 'out') soundVoice(world, struck, 'struck', Math.min(1, deltaV / STRUCK_FULL), { energy, covering: met });
}

/** A wound opened or a bone broken on `fighter` at `at`: cut | stab | bone | crush, `severity` 0..1; a bad one and he cries out. */
export function soundWound(world, fighter, kind, severity, at) {
  if (!world.ear) return;
  soundEvent(world, 'wound', { at, kind, severity, who: fighter.id });
  if (severity >= CRY_FROM && fighter.state !== 'out') soundVoice(world, fighter, 'wound', severity);
}

/** A cut's severity, from the energy (J) it spent opening the flesh. */
export const cutSeverity = (joules) => Math.min(1, joules / CUT_FULL);

/** His voice: effort | struck | wound | death, `strength` 0..1, from his head (`more`: the blow's energy and covering, for a struck). */
export function soundVoice(world, fighter, kind, strength, more = null) {
  if (!world.ear) return;
  soundEvent(world, 'voice', { at: particleAt(fighter, P.head), kind, strength, ...voiceOf(fighter), ...more });
}

// A body settling onto the floor slower than this (m/s) makes no thud; once down, his hips bouncing on it within `FALL_AGAIN` s are the same fall.
const FALL_FROM = 0.8;
const FALL_AGAIN = 0.6;
const fellAt = new WeakMap();

/** A body that has come down on the floor (`type` fall) or a jump landed (`type` land), at `at`, going `speed` m/s into it. */
export function soundDown(world, fighter, type, at, speed) {
  if (!world.ear) return;
  if (type === 'fall') {
    if (speed < FALL_FROM || world.time - (fellAt.get(fighter) ?? -Infinity) < FALL_AGAIN) return;
    fellAt.set(fighter, world.time);
  }
  soundEvent(world, type, { at, mass: fighter.body.massKg, speed, surface: surfaceAt(world, at[0], at[1], at[2]), armour: armourOf(fighter), who: fighter.id });
}

/** A foot come down (`side` l or r) at `at`, the man going `speed` m/s: on what, and how deep in water. */
export function soundStep(world, fighter, side, at, speed) {
  if (!world.ear) return;
  const ground = surfaceUnder(world, at[0], at[1], at[2]);
  // `heels`: a heeled boot (outfits.js heels, the gear's lift): it clicks on a hard floor.
  soundEvent(world, 'step', { at, speed, mass: fighter.body.massKg, surface: ground.surface, depth: ground.depth, armour: armourOf(fighter), heels: (fighter.body.gear?.heelLift ?? 0) > 0, who: fighter.id, foot: side });
}

// A weapon's tip slower than this (m/s) does not whoosh.
const SWING_FROM = 8;
// Each weapon's stroke as the swing tracker last saw it: { stroke, peak, at, sent }.
const swings = new WeakMap();

/**
 * Follow a held weapon's tip through its stroke (`stroke`: its strike in flight, or null), once a step: when the tip, having gone
 * faster than SWING_FROM, starts to slow, that was the fastest of the stroke and the swing is logged there, once.
 */
export function trackSwing(world, fighter, weapon, stroke) {
  if (!world.ear) return;
  let seen = swings.get(weapon);
  if (!seen || seen.stroke !== stroke) {
    seen = { stroke, peak: 0, at: null, sent: false };
    swings.set(weapon, seen);
  }
  if (!stroke || seen.sent || !weapon.tipVelocity) return;
  const v = weapon.tipVelocity;
  const speed = Math.hypot(v[0], v[1], v[2]);
  if (speed >= seen.peak) {
    seen.peak = speed;
    seen.at = weapon.tip ? [...weapon.tip] : null;
    return;
  }
  if (seen.peak < SWING_FROM || !seen.at) return;
  seen.sent = true;
  const spec = weapon.spec;
  // `head`: what leads the stroke through the air (a weight, a mace's: the recorded whoosh; or an edge).
  soundEvent(world, 'swing', { at: seen.at, speed: seen.peak, length: spec.length, mass: spec.mass, head: (spec.harm?.swing?.cut ?? 0) > 0 ? 'blade' : 'blunt', who: fighter.id });
}

// The least drive a strike is heard at (m/s): a fist's is 5-9 at its fastest, the guess for a man's first strike.
const PUNCH_SWING_LEAST = 6;
// The unarmed strikes already heard (one whoosh a strike).
const punchesHeard = new WeakSet();

/**
 * An unarmed strike's whoosh (a punch, a kick, a knee, an elbow), once a step: logged as its drive starts (past the windup), so the
 * whoosh (sfx/sampled.js: its rising end) is heard on the way in, into the blow (which lands 0.03-0.15 s later). `speed`: the strike's
 * fastest is not known yet: the faster of the limb's now, the man's last strike's peak and PUNCH_SWING_LEAST; `reach`: the drive's
 * time (s); `head`: fist (a hand or an elbow) or foot (a foot or a knee).
 */
export function trackPunchSwing(world, fighter) {
  if (!world.ear) return;
  const punch = fighter.punch;
  if (!punch || punch.spec.path === 'blade' || punch.landed || punch.limb === undefined || punchesHeard.has(punch)) return;
  if (punch.t < (punch.spec.windup ?? 0)) return;
  const i = punch.limb * 3;
  const speed = Math.hypot(fighter.v[i], fighter.v[i + 1], fighter.v[i + 2]);
  punchesHeard.add(punch);
  const limb = punch.spec.limb ?? '';
  const foot = limb.endsWith('Foot') || limb.endsWith('Knee');
  soundEvent(world, 'swing', { at: particleAt(fighter, punch.limb), speed: Math.max(speed, fighter.stats?.lastHandSpeed ?? 0, PUNCH_SWING_LEAST), length: foot ? 0.9 : 0.7, mass: foot ? 8 : 2, head: foot ? 'foot' : 'fist', reach: Math.max(0.12, (punch.spec.extendUntil ?? 0.25) - punch.t), who: fighter.id });
}
