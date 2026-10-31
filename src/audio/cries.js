// The cry director: which of the fighters' voices are heard, and as what. The simulation logs a voice for every blow a man takes, every
// bad wound, every death (audio/log.js); played as logged, a battle would be a wall of screaming that buries the fight. So a cry is the
// exception, rationed:
//
//   - Pain, not force: a blow's cry comes from the pain it gives *him* (cryPain): the energy that reached the flesh through what he
//     wears, against his toughness (his body's mass, his fitness, his age). The same blow makes a small, untrained or old man cry out
//     where a big fit one takes it in silence. A light blow is mostly silent; the chance rises steeply with the pain.
//   - Adrenaline masks pain (ai.js `fighter.adrenaline`, the player's weaponarts.js): a man fighting hot is mostly silent; he cries when
//     it wears off, or when the wound is too bad to mask.
//   - Fear follows fear: a man who breaks (`panicked`) cries out as he does, and now and then as he runs, the more the more afraid.
//   - The badly hurt (crawling, lying down) moan now and then; a man knocked down may groan; a dying man cries his last.
//   - The budget: at most a few cries at once (fewer in a battle), only the nearest men (in a battle only within a few metres: the far
//     field carries the rest), each man silent for a while after he cries, ranked by kind, intensity and nearness when there are more.
//   - A cry follows the blow by a reaction's time (it never lands on the blow's transient) and is pitched by his body (sfx/voice.js
//     cryRate): his own voice, a little different each time.
//   - A machine (gear.machine: a robot) never cries.
//   - Some blows are pain itself, whatever else is going on (CRY_STRIKERS, by what struck: a whip's lash): a living man lashed nearly always
//     screams or cries out, adrenaline hardly masking it, and the budget, the spacing and his cooldown do not hold it back; only his own short
//     gap between two such cries does (a flurry is a cry a lash, not ten at once).
//   - Grief (`grief` voices: a prisoner weeping, levelmode/awareness.js `mourn`) is heard as a sob (a moan) or now and then a wail (fear), rationed
//     as the moans are; a `roar` (a thing rising out of the filth to fight, the same file's `lurk`) is always heard, a groan or a roar pitched low.
//
// Pure (no context): `createCryDirector().tick(...)` takes the tick's logged events and the fighters and returns the events with the
// voices replaced by the cries let through (each a voice event carrying its `cry`). Node tests run it on a battle.

import { P } from '../body.js';
import { CRY_KINDS, CRY_VOICE, cryRate, crySex } from './sfx/voice.js';

/** The director's numbers. */
export const CRIES = {
  // Who is heard one by one (m from the ear): in a fight of a few, `near`; in a battle (`crowdFrom` or more men up within `crowdWithin`
  // m) only `nearBattle`, the cries of the rest lost in the far field's din.
  near: 16, nearBattle: 9, crowdFrom: 10, crowdWithin: 20,
  // The most cries at once: a fight of a few, a battle (more at once blur into one wail over the blows).
  budget: { few: 3, battle: 2 },
  // No two cries start closer than this (s): each heard as one man's; in a battle further apart (the few near men heard now and then, the
  // fight's own noise between: ~15-20 a minute however many are hurt).
  spacing: { few: 0.25, battle: 1.5 },
  // The cries no blow brought (a moan, a cry of fear) come no closer together than this (s) among all the men, however many lie hurt
  // or run: the field's misery heard now and then, not as a chorus.
  ambientGap: { few: 2, battle: 5 },
  // After he cries, a man is silent this long (s) by what he cried (a death is never held back).
  cooldown: { hurt: 2.5, scream: 4, moan: 5, fear: 3.5, dying: 0 },
  // The cry comes a reaction's time after the blow (s, from..to): the blow's crack heard first, clear.
  delay: [0.07, 0.16],
  // A cry heard while a sound this much louder (dB at the ear) has just been heard is ducked by `duckDb` (engine.js): the fight first.
  duckOver: 3, duckDb: 5,
};

/**
 * Pain from a blow:
 *   reference  J that reach the flesh of the reference man (75 kg, fitness 0.5, 30 years) to hurt him `full` (a cry for certain-ish):
 *              a hard punch (60-100 J) into the bare body; a light jab (10-20 J) far under
 *   from       the felt / toughness ratio where pain starts (0), `to` where it is full (1); on a log scale between
 *   mass       toughness as (mass / 75)^mass: a heavier body takes more
 *   fitness    toughness × (base + span × exercise): trained men take blows
 *   ageFrom    past this age, toughness falls `age` a year (to `ageFloor`)
 *   through    the share of a blow's energy each covering lets through to the man under it (a shield none)
 */
export const CRY_PAIN = {
  reference: 60, from: 0.15, to: 3, mass: 0.8, fitness: { base: 0.7, span: 0.6 }, ageFrom: 40, age: 0.01, ageFloor: 0.7,
  through: { flesh: 1, padded: 0.55, leather: 0.5, lamellar: 0.35, scale: 0.35, mail: 0.3, plate: 0.15, wood: 0, shieldmetal: 0 },
};

/**
 * The chance of each cry:
 *   hurt       none under pain `from`; above it (pain - from)/(1 - from) to the `power`, times `top`; pain past `screamAt` is a scream
 *   wound      a bad wound (log.js: severity ≥ 0.5) cries (base + span × severity)
 *   mask       adrenaline 1 takes this share of a blow's chance (and `intensityMask` of its loudness); of a wound's, `woundMask` (a cut
 *              to the bone breaks through it)
 *   down       a man knocked down groans (a hurt cry, at `downIntensity`), this often
 *   moan       a man lying down or crawling moans every `every` s (from..to), this often; fear the same for a broken man, by his fear
 *   breaks     a man as he breaks cries out this often (× his fear)
 */
export const CRY_CHANCE = {
  hurt: { from: 0.2, power: 1.3, top: 0.85, screamAt: 0.85 },
  wound: { base: 0.4, span: 0.6 },
  mask: 0.85, intensityMask: 0.35, woundMask: 0.5,
  down: 0.5, downIntensity: 0.6,
  moan: { every: [7, 14], chance: 0.45 },
  fear: { every: [4, 9], chance: 0.6 },
  breaks: 0.8,
};

/**
 * What struck, when it is pain itself (a voice event's `striker`, audio/log.js): a whip's lash (physics/whip.js) cuts the skin and stings far past its
 * energy (the cry director's cryPain reads energy, and a lash's few joules would leave most men silent), and a man lashed screams or cries out:
 *   chance    the chance a landed lash on a living, conscious man cries (machines never do), whatever its energy
 *   mask      the share of that adrenaline takes away at full (a man fighting hot still cries at the whip, most of the time)
 *   scream    the voice's strength (log.js: its share of the pain that floors a man) from which it is a scream, not a cry of hurt
 *   floor     the least intensity of the cry
 *   gap       s: the least time between two of a man's lash cries (a flurry of three is a cry, a cry, a cry; not one over another)
 * The budget, the spacing and the cooldowns of the other cries (CRIES) do not hold a lash's back.
 */
export const CRY_STRIKERS = {
  lash: { chance: 0.96, mask: 0.15, scream: 0.28, floor: 0.6, gap: 0.65 },
};

/**
 * Other voices the director knows (neither blows nor deaths):
 *   grief   a weeping man's sob (`strength` under `wailFrom`: a moan at it) or wail (a fear cry): rationed as the moans are (CRIES.ambientGap)
 *   roar    a groan or a roar (a moan, or at `roarFrom` and up a scream), always heard, pitched `pitch` of his voice (deeper), not under the range's floor
 */
export const CRY_VOICES = { grief: { wailFrom: 0.7 }, roar: { roarFrom: 0.7, pitch: 0.82 } };

/** A fighter's voice: { sex, height, mass, age, id, machine }. */
export function voiceOfFighter(fighter) {
  const body = fighter.body ?? {};
  const inputs = body.inputs ?? {};
  return { sex: crySex(inputs.sex), height: body.heightM ?? (inputs.heightCm ?? 178) / 100, mass: body.bodyMassKg ?? body.massKg ?? 80, age: inputs.age ?? 30, id: fighter.id, machine: Boolean(body.gear?.machine) };
}

/** How much a man takes (J at the flesh for pain 'reference'), from his body. */
export function cryToughness(fighter) {
  const spec = CRY_PAIN;
  const voice = voiceOfFighter(fighter);
  const exercise = fighter.body?.inputs?.exercise ?? 0.5;
  const age = Math.max(spec.ageFloor, 1 - spec.age * Math.max(0, voice.age - spec.ageFrom));
  return spec.reference * (voice.mass / 75) ** spec.mass * (spec.fitness.base + spec.fitness.span * exercise) * age;
}

/** The pain (0..1) a blow of `energy` J on `covering` gives `fighter`. */
export function cryPain(fighter, energy, covering = 'flesh') {
  const spec = CRY_PAIN;
  const felt = (energy ?? 0) * (spec.through[covering] ?? 0.4);
  const ratio = felt / cryToughness(fighter);
  if (ratio <= spec.from) return 0;
  return Math.min(1, Math.log(ratio / spec.from) / Math.log(spec.to / spec.from));
}

/** The chance (0..1) a blow of `pain` makes him cry, with `adrenaline` (0..1) in him. */
export function hurtChance(pain, adrenaline = 0) {
  const spec = CRY_CHANCE.hurt;
  if (pain < spec.from) return 0;
  return spec.top * ((pain - spec.from) / (1 - spec.from)) ** spec.power * (1 - CRY_CHANCE.mask * Math.min(1, adrenaline));
}

/** The chance a bad wound of `severity` cries, with `adrenaline`. */
export const woundChance = (severity, adrenaline = 0) => Math.min(1, CRY_CHANCE.wound.base + CRY_CHANCE.wound.span * severity) * (1 - CRY_CHANCE.woundMask * Math.min(1, adrenaline));

const headOf = (fighter) => [fighter.x[P.head * 3], fighter.x[P.head * 3 + 1], fighter.x[P.head * 3 + 2]];
const lerp = (a, b, s) => a + (b - a) * s;

/**
 * A director, its memory per fighter (by id: when he may cry again, his state last seen, when he next moans or cries in fear) and the
 * cries still sounding. `random` the dice. `tick(events, fighters, listener, now)` → the events, their voices replaced by the cries
 * let through. `reset()` for a new world.
 */
export function createCryDirector({ random = Math.random } = {}) {
  const men = new Map();
  let sounding = [];
  let lastStart = -Infinity;
  let lastAmbient = -Infinity;
  const memory = (fighter, now) => {
    let seen = men.get(fighter.id);
    if (!seen) {
      seen = { quietUntil: -Infinity, state: fighter.state, panicked: Boolean(fighter.panicked), nextMoan: now + lerp(...CRY_CHANCE.moan.every, random()), nextFear: now + lerp(...CRY_CHANCE.fear.every, random()), died: false };
      men.set(fighter.id, seen);
    }
    return seen;
  };

  function tick(events, fighters, listener, now) {
    const others = [];
    const wanted = [];
    // How crowded it is round the ear: a battle hears only its nearest.
    let crowd = 0;
    const r2 = CRIES.crowdWithin ** 2;
    for (const fighter of fighters) {
      if (fighter.dormant || fighter.state === 'out' || !fighter.x) continue;
      const dx = fighter.x[P.pelvis * 3] - listener.x;
      const dz = fighter.x[P.pelvis * 3 + 2] - listener.z;
      if (dx * dx + dz * dz < r2) crowd += 1;
    }
    const battle = crowd >= CRIES.crowdFrom;
    const near = battle ? CRIES.nearBattle : CRIES.near;
    const fighterOf = (who) => (fighters[who]?.id === who ? fighters[who] : fighters.find((fighter) => fighter.id === who));
    const distanceTo = (at) => Math.hypot(at[0] - listener.x, at[1] - listener.y, at[2] - listener.z);
    const want = (fighter, kind, intensity, at, extra = {}) => {
      const distance = distanceTo(at);
      if (distance > near) return;
      wanted.push({ fighter, kind, intensity, at, distance, ...extra });
    };

    // The logged voices: a blow taken, a wound, a death (effort has no recording: dropped).
    for (const event of events) {
      if (event.type !== 'voice') {
        others.push(event);
        continue;
      }
      const fighter = fighterOf(event.who);
      if (!fighter || fighter.body?.gear?.machine) continue;
      const seen = memory(fighter, now);
      const at = [event.x, event.y, event.z];
      const adrenaline = Math.max(0, fighter.adrenaline ?? 0);
      if (event.kind === 'death') {
        if (seen.died) continue;
        seen.died = true;
        want(fighter, 'dying', 1, at, { always: true });
      } else if (event.kind === 'wound') {
        if (random() < woundChance(event.strength ?? 0.5, adrenaline)) want(fighter, 'scream', (event.strength ?? 0.5) * (1 - CRY_CHANCE.intensityMask * adrenaline * 0.5), at, { delayed: true });
      } else if (event.kind === 'struck' && CRY_STRIKERS[event.striker]) {
        // Pain itself (a lash): he cries out nearly every time, whatever else is sounding; only his own gap holds one back.
        const spec = CRY_STRIKERS[event.striker];
        const when = event.t ?? now;
        if (when < (seen.painUntil ?? -Infinity) || random() >= spec.chance * (1 - spec.mask * Math.min(1, adrenaline))) continue;
        seen.painUntil = when + spec.gap;
        const strength = event.strength ?? 0.5;
        want(fighter, strength >= spec.scream ? 'scream' : 'hurt', Math.max(spec.floor, strength), at, { delayed: true, pain: true });
      } else if (event.kind === 'grief') {
        const wail = (event.strength ?? 0.5) >= CRY_VOICES.grief.wailFrom;
        want(fighter, wail ? 'fear' : 'moan', event.strength ?? 0.5, at, { grief: true });
      } else if (event.kind === 'roar') {
        want(fighter, (event.strength ?? 1) >= CRY_VOICES.roar.roarFrom ? 'scream' : 'moan', event.strength ?? 1, at, { always: true, pitch: CRY_VOICES.roar.pitch });
      } else if (event.kind === 'struck') {
        // The pain of it to him (its energy and covering logged with it), or else the part's jolt.
        const pain = event.energy !== undefined ? cryPain(fighter, event.energy, event.covering) : event.strength ?? 0;
        if (random() < hurtChance(pain, adrenaline)) want(fighter, pain >= CRY_CHANCE.hurt.screamAt ? 'scream' : 'hurt', pain * (1 - CRY_CHANCE.intensityMask * adrenaline), at, { delayed: true });
      }
    }

    // The states: knocked down, lying or crawling hurt, broken and running.
    for (const fighter of fighters) {
      if (fighter.dormant || !fighter.x || fighter.body?.gear?.machine) continue;
      const seen = men.get(fighter.id);
      if (!seen) {
        if (fighter.state !== 'out') memory(fighter, now);
        continue;
      }
      if (fighter.state === 'out') {
        seen.state = 'out';
        continue;
      }
      const at = headOf(fighter);
      const adrenaline = Math.max(0, fighter.adrenaline ?? 0);
      if (fighter.state === 'down' && seen.state !== 'down' && random() < CRY_CHANCE.down * (1 - CRY_CHANCE.mask * adrenaline)) want(fighter, 'hurt', CRY_CHANCE.downIntensity, at);
      seen.state = fighter.state;
      const broke = fighter.panicked && !seen.panicked;
      seen.panicked = Boolean(fighter.panicked);
      const fear = Math.min(1, Math.max(0, fighter.fear ?? (fighter.panicked ? 1 : 0)));
      if (broke) {
        if (random() < CRY_CHANCE.breaks * Math.max(0.5, fear)) want(fighter, 'fear', fear, at);
        seen.nextFear = now + lerp(...CRY_CHANCE.fear.every, random());
      } else if (fighter.panicked && now >= seen.nextFear) {
        seen.nextFear = now + lerp(...CRY_CHANCE.fear.every, random());
        if (random() < CRY_CHANCE.fear.chance * fear) want(fighter, 'fear', fear, at);
      }
      if ((fighter.crawling || fighter.state === 'down') && now >= seen.nextMoan) {
        seen.nextMoan = now + lerp(...CRY_CHANCE.moan.every, random());
        if (random() < CRY_CHANCE.moan.chance) want(fighter, 'moan', 0.5, at);
      }
    }

    // The budget: the most deserving first; a man still crying or lately cried is silent (a death excepted); the rest dropped, not queued.
    sounding = sounding.filter((cry) => cry.ends > now);
    const budget = battle ? CRIES.budget.battle : CRIES.budget.few;
    const spacing = battle ? CRIES.spacing.battle : CRIES.spacing.few;
    wanted.sort((a, b) => score(b, near) - score(a, near));
    const cries = [];
    for (const cry of wanted) {
      const seen = memory(cry.fighter, now);
      // (A lash's cry, `pain`, is not held back by the rationing: CRY_STRIKERS.)
      const free = cry.always || cry.pain;
      if (!free && now < seen.quietUntil) continue;
      if (sounding.some((other) => other.who === cry.fighter.id) && !free) continue;
      if (sounding.length >= budget && !free) continue;
      if (now < lastStart + spacing && !free) continue;
      const ambient = !cry.pain && (cry.kind === 'moan' || cry.kind === 'fear') && !cry.always;
      if (ambient && now < lastAmbient + (battle ? CRIES.ambientGap.battle : CRIES.ambientGap.few)) continue;
      if (ambient) lastAmbient = now;
      const voice = voiceOfFighter(cry.fighter);
      const rate = cry.pitch ? Math.max(CRY_VOICE.range[0], cryRate(voice, random() * 2 - 1) * cry.pitch) : cryRate(voice, random() * 2 - 1);
      const intensity = Math.max(0, Math.min(1, cry.intensity));
      const delay = cry.delayed ? lerp(...CRIES.delay, random()) : 0;
      seen.quietUntil = now + delay + CRIES.cooldown[cry.kind];
      lastStart = now + delay;
      sounding.push({ who: cry.fighter.id, ends: now + delay + CRY_KINDS[cry.kind].seconds / rate });
      cries.push({ type: 'voice', t: now, x: cry.at[0], y: cry.at[1], z: cry.at[2], kind: cry.kind, who: cry.fighter.id, cry: { kind: cry.kind, sex: crySex(voice.sex), intensity, rate, delay } });
    }
    return cries.length ? [...others, ...cries] : others;
  }

  return {
    tick,
    reset() {
      men.clear();
      sounding = [];
      lastStart = -Infinity;
      lastAmbient = -Infinity;
    },
    /** How many cries are sounding at `now`. */
    sounding: (now) => sounding.filter((cry) => cry.ends > now).length,
  };
}

/** A cry's rank: its kind's weight, its intensity, nearness (a cry at the edge of hearing counts one less than one at the ear). */
function score(cry, near) {
  return CRY_KINDS[cry.kind].weight + cry.intensity - cry.distance / near;
}
