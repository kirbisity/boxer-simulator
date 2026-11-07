// The Hun River finale: he lies dying under the company flag, and the life he lived comes back to him. Pure (no DOM): the page
// (storyview.js) films it, the tests (test/story-finale.test.js) run it.
//
// What he sees is drawn from the life the player lived: the flashback pool (chapters/flashbacks.js, the writer's), each entry
// shown only if its `when(life)` holds; of those, a few by their `weight` (a seeded draw: the same life always sees the same
// things, another life other things), with what a life cannot leave out kept in (his brother; Jin Aman at the flagpole if he
// died there; his wife and children if he had them; one of the comrades who died; at least one of the few slightly beautiful
// moments). They come in the order he lived them. Then the `last` lines: his waist tag, and his brother's letter.
//
// The shots: the field first (the battle going on round him, slowed, the colour going out of it); then each remembered moment,
// a short tableau on its own set (scenes/sets.js) with the real figures (his brother, Jin, his wife, the girl in the doorway),
// its line under it; back to the field between some, greyer each time and closer on him; the last field shot on his waist
// tag; then black, and the letter on the black; then the page.

import { storyText } from '../life.js';

export const STORY_FINALE = {
  // How many moments he sees (of those his life allows): a few, not a catalogue; one more if he had a family.
  count: 6,
  familyExtra: 1,
  // The year of each moment (the figures' ages come from it) and the set it is staged on (scenes/sets.js STORY_SETS); `poses`
  // a figure posed otherwise than the set has him; `alias` whom a set's stand-in is.
  memories: {
    'fb-pole': { year: 1576, set: 'carryingPole' },
    'fb-jar': { year: 1586, set: 'coinJar' },
    'fb-flats': { year: 1587, set: 'flats' },
    'fb-finished': { year: 1587, set: 'flatsAfter' },
    'fb-spared': { year: 1587, set: 'flatsSpared' },
    'fb-wang': { year: 1587, set: 'recite' },
    'fb-lou': { year: 1592, set: 'march' },
    'fb-jin-snow': { year: 1593, set: 'snowRoad' },
    'fb-heads': { year: 1593, set: 'gateHeads' },
    'fb-he': { year: 1593, set: 'gateHeadsHe' },
    'fb-ye': { year: 1593, set: 'letters' },
    'fb-jin-pole': { year: 1595, set: 'drillGround' },
    'fb-jin-fell': { year: 1595, set: 'motherDoor' },
    'fb-zhu': { year: 1597, set: 'fireside', alias: { friend: 'zhu' } },
    'fb-toe': { year: 1598, set: 'toe' },
    'fb-kuandian': { year: 1606, set: 'road' },
    'fb-cart': { year: 1606, set: 'cart' },
    'fb-matchmaker': { year: 1607, set: 'fireside', alias: { friend: 'ma' } },
    'fb-cotton': { year: 1607, set: 'cotton' },
    'fb-single': { year: 1609, set: 'alone' },
    'fb-diggers': { year: 1610, set: 'diggers' },
    'fb-diggers-free': { year: 1610, set: 'diggersFree' },
    'fb-ahe-lift': { year: 1613, set: 'yard' },
    'fb-ahe-wait': { year: 1614, set: 'yard', poses: { hero: 'crouch' } },
    'fb-ahe-hands': { year: 1616, set: 'hands' },
    'fb-son-trade': { year: 1619, set: 'son' },
    'fb-son-none': { year: 1619, set: 'son' },
    'fb-footprints': { year: 1619, set: 'footprints' },
    'fb-wang-alive': { year: 1620, set: 'pagesSun' },
    'fb-children': { year: 1621, set: 'doorway' },
    'fb-shen': { year: 1621, set: 'shen' },
    'fb-last-tag': { year: 1621, set: 'field', camera: { target: [0.4, 0.03, -0.12], yaw: -1.4, pitch: 1.2, distance: 1.15, drift: { distance: -0.03 } } },
  },
  // What a life cannot leave out, each a group of which one is kept (the heaviest of them, if the draw took none).
  keep: [
    ['fb-pole', 'fb-jar', 'fb-flats', 'fb-finished', 'fb-spared'],
    ['fb-jin-pole'],
    ['fb-children', 'fb-cotton', 'fb-ahe-wait', 'fb-ahe-lift', 'fb-ahe-hands', 'fb-son-trade', 'fb-son-none', 'fb-matchmaker'],
    ['fb-wang', 'fb-lou', 'fb-ye', 'fb-he', 'fb-zhu', 'fb-jin-fell'],
  ],
  // Back to the field after every `every` moments (never just before the last field shot).
  every: 2,
  // The shots' timing (s). A moment opens out of the dark (`open`, after `hold` in it while its world is built), holds its line
  // as long as the line takes to read slowly (`perChar` a character, by language; `base`; never past `most`), a little after,
  // then closes to dark. The field: its first shot, its returns, the last.
  black: { hold: 0.5, open: 1.6, close: 1.1, last: 2.6 },
  line: { base: 2.6, perChar: { en: 0.06, zh: 0.22 }, most: 11, after: 1.4 },
  letter: { base: 3.5, perChar: { en: 0.058, zh: 0.21 }, most: 28, after: 3 },
  field: { first: 6, between: 3.6 },
  // The look (the page's filter over the 3D: grayscale, sepia, brightness, a vignette): the field going grey and dark as he
  // goes, a step each time back to it; the moments by their tone, the heavy ones nearer grey, the beautiful a little warm.
  look: {
    field: { grey: [0.15, 0.6], dim: [0.95, 0.8], step: { grey: 0.12, dim: -0.06 }, vignette: 0.55 },
    tone: {
      heavy: { grey: 0.55, warm: 0.08, dim: 0.86, vignette: 0.5 },
      sad: { grey: 0.4, warm: 0.16, dim: 0.9, vignette: 0.45 },
      beautiful: { grey: 0.22, warm: 0.26, dim: 0.97, vignette: 0.4 },
    },
  },
  // The field slowed while he lies there (a share of the world's own pace).
  pace: 0.3,
  // Each return to the field is closer on him (a share of the set's camera distance).
  closer: 0.82,
  // The first shot, on the battle's own field: the camera over him where he fell, looking down (rad of pitch), turning slowly
  // (`turn` rad a second from `yaw`) and coming down from `far` m toward `near` (`closing` m a second).
  camera: { yaw: -0.8, turn: 0.03, pitch: 1.05, far: 7, near: 3.2, closing: 0.6 },
};

/** A string hash (FNV-1a), for the life's own seed. */
function finaleHash(text) {
  let hash = 2166136261;
  for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

/** A seeded generator (mulberry32). */
function finaleRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Whether an entry is for this life (its `when`; one that throws is not). */
function finaleFor(entry, life) {
  try {
    return Boolean(entry.when?.(life) ?? true);
  } catch {
    return false;
  }
}

/** The year a moment is of (STORY_FINALE.memories, else the life's own year). */
const finaleYear = (entry, life) => STORY_FINALE.memories[entry.id]?.year ?? life.year ?? 1621;

/**
 * What he sees: { drawn: [entries, in the order he lived them], last: [the closing entries, in the pool's order] }.
 * Deterministic for a life: the draw's seed is the life's own (its seed and which life of the player's it is).
 */
export function finaleFlashbacks(life, pool, { count = null } = {}) {
  const eligible = pool.filter((entry) => !entry.last && finaleFor(entry, life));
  const last = pool.filter((entry) => entry.last && finaleFor(entry, life));
  const wanted = Math.min(eligible.length, count ?? STORY_FINALE.count + (life.family?.wife ? STORY_FINALE.familyExtra : 0));
  const random = finaleRandom(finaleHash(`${life.seed}:${life.lives ?? 1}:finale`));
  // A weighted draw without replacement (each entry's key u^(1/weight), the highest keys taken).
  const keyed = eligible.map((entry) => ({ entry, key: random() ** (1 / Math.max(1e-3, entry.weight ?? 1)) })).sort((a, b) => b.key - a.key);
  const chosen = new Set(keyed.slice(0, wanted).map(({ entry }) => entry));
  // What a life cannot leave out: one of each group it has, swapped in for the least of the rest drawn.
  const protectedSet = new Set();
  for (const group of STORY_FINALE.keep) {
    const members = eligible.filter((entry) => group.includes(entry.id));
    if (!members.length) continue;
    const had = members.find((entry) => chosen.has(entry));
    if (had) {
      protectedSet.add(had);
      continue;
    }
    const best = members.sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1) || keyed.findIndex((k) => k.entry === a) - keyed.findIndex((k) => k.entry === b))[0];
    const drop = [...chosen].filter((entry) => !protectedSet.has(entry)).sort((a, b) => keyed.findIndex((k) => k.entry === b) - keyed.findIndex((k) => k.entry === a))[0];
    if (drop && chosen.size >= wanted) chosen.delete(drop);
    chosen.add(best);
    protectedSet.add(best);
  }
  // At least one of the slightly beautiful moments, if the life had any.
  if (![...chosen].some((entry) => entry.tone === 'beautiful')) {
    const beautiful = keyed.find(({ entry }) => entry.tone === 'beautiful')?.entry;
    const drop = [...chosen].filter((entry) => !protectedSet.has(entry)).sort((a, b) => keyed.findIndex((k) => k.entry === b) - keyed.findIndex((k) => k.entry === a))[0];
    if (beautiful) {
      if (drop && chosen.size >= wanted) chosen.delete(drop);
      chosen.add(beautiful);
    }
  }
  const order = (entry) => pool.indexOf(entry);
  const drawn = [...chosen].sort((a, b) => finaleYear(a, life) - finaleYear(b, life) || order(a) - order(b));
  return { drawn, last };
}

/** How long a line holds (s), by its length in the language shown. */
function finaleRead(text, language, spec = STORY_FINALE.line) {
  const shown = storyText(text, language);
  return Math.min(spec.most, spec.base + shown.length * (spec.perChar[language] ?? spec.perChar.en)) + spec.after;
}

/**
 * The shots of the finale for a life: [{ kind: 'field' | 'memory' | 'black', id?, set?, year?, text?, tone?, look, … }].
 * `first` the opening field shot (on the battle's own world, if the page has it), `returns` the field's set between.
 */
export function finaleShots(life, pool) {
  const { drawn, last } = finaleFlashbacks(life, pool);
  const look = STORY_FINALE.look;
  const field = (step, extra = {}) => ({
    kind: 'field', set: 'field', year: 1621, step,
    look: { grey: Math.min(0.95, look.field.grey[1] + look.field.step.grey * step), dim: Math.max(0.4, look.field.dim[1] + look.field.step.dim * step), warm: 0, vignette: look.field.vignette },
    closer: STORY_FINALE.closer ** step,
    ...extra,
  });
  const shots = [{ kind: 'field', first: true, step: 0, look: { grey: look.field.grey[0], dim: look.field.dim[0], warm: 0, vignette: look.field.vignette * 0.6, to: { grey: look.field.grey[1], dim: look.field.dim[1] } } }];
  let returns = 0;
  drawn.forEach((entry, index) => {
    const memory = STORY_FINALE.memories[entry.id] ?? {};
    shots.push({ kind: 'memory', id: entry.id, set: memory.set ?? 'field', year: memory.year ?? 1621, alias: memory.alias ?? {}, poses: memory.poses ?? {}, camera: memory.camera ?? null, text: entry.text, tone: entry.tone, cast: entry.cast ?? [], look: { ...look.tone[entry.tone] ?? look.tone.sad } });
    const more = index < drawn.length - 1;
    if (more && (index + 1) % STORY_FINALE.every === 0) {
      returns += 1;
      shots.push(field(returns));
    }
  });
  // The waist tag over the last of the field (close on him), then the rest of the last lines on black.
  const [tag, ...rest] = last;
  if (tag) shots.push(field(returns + 1, { id: tag.id, text: tag.text, tone: tag.tone, lastField: true, camera: STORY_FINALE.memories[tag.id]?.camera ?? null }));
  for (const entry of rest) shots.push({ kind: 'black', id: entry.id, text: entry.text, tone: entry.tone, look: { grey: 1, dim: 0, warm: 0, vignette: 1 } });
  return shots;
}

/** How long a shot lasts (s) in a language. */
export function finaleShotSeconds(shot, language = 'en') {
  const black = STORY_FINALE.black;
  if (shot.kind === 'black') return black.hold + finaleRead(shot.text, language, STORY_FINALE.letter);
  const open = shot.first ? 0 : black.hold + black.open;
  const close = shot.lastField ? black.last : black.close;
  const body = shot.text ? finaleRead(shot.text, language) : shot.first ? STORY_FINALE.field.first : STORY_FINALE.field.between;
  return open + body + close;
}

/** Begin the finale: its shots, in a language. `stepFinale` moves it on, `finaleLook` says what the screen shows. */
export function createFinalePlay(shots, { language = 'en' } = {}) {
  return { shots, language, index: 0, into: 0, time: 0, done: false, started: false, skipped: false };
}

/** Move it on `dt` s. Returns what fell due: { shot } as each begins (its index), 'done' at the end. */
export function stepFinale(play, dt) {
  const due = [];
  if (play.done) return due;
  if (!play.started) {
    play.started = true;
    due.push({ shot: 0 });
  }
  play.time += dt;
  play.into += dt;
  const length = finaleShotSeconds(play.shots[play.index], play.language);
  if (play.into >= length) {
    play.index += 1;
    play.into = 0;
    play.skipped = false;
    if (play.index >= play.shots.length) {
      play.done = true;
      due.push('done');
    } else due.push({ shot: play.index });
  }
  return due;
}

/** A tap: on to the shot's close (not before its line has been up a moment). */
export function skipFinale(play) {
  if (play.done || play.skipped) return false;
  const shot = play.shots[play.index];
  const black = STORY_FINALE.black;
  const open = shot.first || shot.kind === 'black' ? black.hold : black.hold + black.open;
  if (play.into < open + 0.6) return false;
  const close = shot.kind === 'black' ? 0 : shot.lastField ? black.last : black.close;
  play.into = Math.max(play.into, finaleShotSeconds(shot, play.language) - close);
  play.skipped = true;
  return true;
}

const finaleSmooth = (u) => {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
};

/**
 * What the screen shows now: { shot (its index), kind, black (0..1), grey, warm, dim, vignette (0..1), bars, line: { text,
 * tone } | null, pace (the world's, a share) }.
 */
export function finaleLook(play) {
  const shot = play.shots[Math.min(play.index, play.shots.length - 1)];
  const black = STORY_FINALE.black;
  const length = finaleShotSeconds(shot, play.language);
  const t = play.into;
  const openAt = shot.first ? 0 : black.hold;
  const opened = shot.first ? 1 : finaleSmooth((t - openAt) / black.open);
  const close = shot.lastField ? black.last : black.close;
  const closing = shot.kind === 'black' ? 0 : finaleSmooth((t - (length - close)) / close);
  const dark = shot.kind === 'black' || play.done ? 1 : Math.max(1 - opened, closing);
  // The first shot's colour going out of it as it plays.
  const ramp = shot.look.to ? finaleSmooth(t / length) : 0;
  const grey = shot.look.to ? shot.look.grey + (shot.look.to.grey - shot.look.grey) * ramp : shot.look.grey;
  const dim = shot.look.to ? shot.look.dim + (shot.look.to.dim - shot.look.dim) * ramp : shot.look.dim;
  // The line: up once the shot is open (on black: after the hold), and gone as it closes.
  const lineFrom = shot.kind === 'black' ? black.hold : openAt + black.open * 0.5;
  const text = shot.text && t >= lineFrom && closing < 0.5 ? { text: storyText(shot.text, play.language), tone: shot.tone ?? null } : null;
  return {
    shot: play.index, kind: shot.kind, id: shot.id ?? null, black: dark, grey, warm: shot.look.warm ?? 0, dim, vignette: shot.look.vignette ?? 0,
    bars: 1, line: text, pace: shot.kind === 'field' ? STORY_FINALE.pace : 1,
  };
}

/** The finale's length in all (s), in a language. */
export function finaleSeconds(shots, language = 'en') {
  return shots.reduce((sum, shot) => sum + finaleShotSeconds(shot, language), 0);
}
