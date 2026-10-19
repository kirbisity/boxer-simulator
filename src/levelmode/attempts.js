// Level mode, the attempts: every death is a failed attempt on the prince, and the run's last attempt is the one that frees him. The
// run keeps a record of each failure (so the ending can tell the story of the night) and the one attempt now under way.
//
//   beginAttempt(world)        the operative wakes (the start, or a respawn after a death): where he began and who is beside him
//   recordAttempt(world, at)   he is out: the attempt goes on the record (checkpoints.js noteDeath), with the place ({ section, place })
//   attemptLog(world)          the whole record for the story: { start, failed: [record], final: { ... } }
//   attemptCount(world)        the attempt he is on (the deaths so far plus the one in hand): "Attempts: N" at the ending
//   attemptStory(log)          the short story paragraph the ending tells: templated from the log, varied in its wording, and
//                              the same words for the same log (a hash of the log picks among the phrasings; no chance, no model)
//
// A record: { number, from (the rest he woke at, null = the stage's start), rest (the last rest he reached by then), section, place
// (where he fell, the section's id and name), killer (the name of the man the death event credits, null for none), cause (the death
// event's own words), comrades (their names at the start of it), fallen (those of them who fell before him), seconds (how long it
// lasted), time (the world's clock when it ended) }. It lives in the run (world.stage.level.attempts, .attempt).
// No DOM here.

import { levelOf } from './items.js';
import { comradesOf } from './team.js';

// The events that put a man out (physics.js knockOut: the `kind` it was given, and the death event's `attacker` is who is credited).
const OUT_KINDS = new Set(['knockout', 'killed', 'bledOut', 'drowned', 'out']);

// More failures than this are not all told one by one: the first two and the last two, and the ones between in a line.
const TALE_MOST = 6;

/** The names of the comrades alive now. */
const namesAlive = (world) => comradesOf(world).filter((fighter) => fighter.state !== 'out').map((fighter) => fighter.body.inputs.name);

/** The name of the stage's first place (where a run with no rest begins). */
const startPlace = (world) => {
  const def = world.stage.def;
  return def.sections.find((section) => section.id === def.start.section)?.name ?? def.title ?? 'the start';
};

/** Who put the operative out and how, from the death event: { killer (a name, or null when no man is credited), cause (its words, or null) }. */
export function deathOf(world) {
  for (let at = world.events.length - 1; at >= 0; at -= 1) {
    const event = world.events[at];
    if (event.fighter !== 0 || !OUT_KINDS.has(event.kind)) continue;
    // (A fall, the sea or his own bleeding credit him with his own death when nobody else is to blame.)
    const by = event.attacker !== undefined && event.attacker !== 0 ? world.fighters[event.attacker] : null;
    return { killer: by?.body.inputs.name ?? null, cause: event.effects?.[0] ?? null };
  }
  return { killer: null, cause: null };
}

/** A new attempt begins now, at the checkpoint he is at, with the comrades beside him. */
export function beginAttempt(world) {
  const level = levelOf(world);
  level.attempt = { since: world.time, from: level.checkpoint?.name ?? null, comrades: namesAlive(world) };
  return level.attempt;
}

/** He is out: the attempt in hand goes on the record. `place`: where he fell ({ section: id, place: name }). Returns the record. */
export function recordAttempt(world, { section = null, place = null } = {}) {
  const level = levelOf(world);
  const open = level.attempt ?? beginAttempt(world);
  const { killer, cause } = deathOf(world);
  const alive = new Set(namesAlive(world));
  const record = {
    number: level.attempts.length + 1, from: open.from, rest: level.checkpoint?.name ?? null, section, place, killer, cause,
    comrades: [...open.comrades], fallen: open.comrades.filter((name) => !alive.has(name)),
    seconds: Math.max(0, Math.round(world.time - open.since)), time: Math.round(world.time),
  };
  level.attempts.push(record);
  return record;
}

/** The attempt he is on: the deaths so far, and this one. */
export const attemptCount = (world) => (levelOf(world)?.attempts.length ?? 0) + 1;

/** The record of the run so far, for the story: { start (the stage's first place), failed: [record], final: { the attempt in hand } }. */
export function attemptLog(world) {
  const level = levelOf(world);
  const open = level.attempt ?? { since: 0, from: null, comrades: [] };
  return {
    start: startPlace(world),
    failed: level.attempts.map((record) => ({ ...record, comrades: [...record.comrades], fallen: [...record.fallen] })),
    final: {
      number: level.attempts.length + 1, from: open.from, rest: level.checkpoint?.name ?? null, comrades: [...open.comrades],
      survivors: namesAlive(world), seconds: Math.max(0, Math.round(world.time - open.since)), time: Math.round(world.time),
    },
  };
}

// ---- The story --------------------------------------------------------------------------------------------------

const ORDINALS = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const COUNTS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

const taleOrdinal = (number) => ORDINALS[number] ?? `${number}th`;
const taleCount = (number) => COUNTS[number] ?? String(number);
const taleCapital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
// A name read in the middle of a sentence: "The Well" is "the Well".
const talePlain = (name) => name.replace(/^The /, 'the ');

/** Names as a list: "A", "A and B", "A, B and C". */
function taleList(names) {
  const plain = names.map(talePlain);
  return plain.length < 2 ? plain.join('') : `${plain.slice(0, -1).join(', ')} and ${plain[plain.length - 1]}`;
}

/** A stable number from the log's own words (FNV-1a), the one thing that picks a phrasing. */
function taleHash(text) {
  let hash = 2166136261;
  for (let at = 0; at < text.length; at += 1) hash = Math.imul(hash ^ text.charCodeAt(at), 16777619);
  return hash >>> 0;
}

/** A stable choice among phrasings: the same log, the same `salt`, the same words. */
const talePick = (seed, salt, options) => options[(Math.imul(seed + salt * 7919, 2654435761) >>> 0) % options.length];

/** How long, in words: "under a minute", "about a minute", "about seven minutes". */
function taleDuration(seconds) {
  if (seconds < 45) return 'under a minute';
  const minutes = Math.round(seconds / 60);
  return minutes <= 1 ? 'about a minute' : `about ${taleCount(minutes)} minutes`;
}

/** Who is beside him, as the story says it ("with Maren and Old Tobin beside you"); alone when nobody is. */
const taleCompany = (names, seed, salt) => (names.length
  ? `with ${taleList(names)} ${talePick(seed, salt, ['beside you', 'at your side', 'at your back'])}`
  : talePick(seed, salt, ['alone', 'on your own']));

/** How the death went, as a clause with its own subject: a man to blame, else what the death event says. */
function taleEnding(record, seed) {
  const where = record.place ? talePlain(record.place) : 'the dark';
  const killer = record.killer ? talePlain(record.killer) : null;
  const salt = record.number * 31;
  if (killer) {
    return talePick(seed, salt + 5, [
      `${killer} ended it at ${where}`,
      `you fell to ${killer} at ${where}`,
      `${killer} cut you down at ${where}`,
      `it ended at ${killer}'s hands, at ${where}`,
    ]);
  }
  const cause = record.cause ?? '';
  if (/sea/.test(cause)) return talePick(seed, salt + 5, [`the sea took you off ${where}`, `you were lost to the sea beneath ${where}`]);
  if (/edge|fell/.test(cause)) return talePick(seed, salt + 5, [`a fall ended it at ${where}`, `you went over the edge at ${where}`]);
  if (/blood|internal/.test(cause)) return talePick(seed, salt + 5, [`you bled out at ${where}`, `your wounds finished it at ${where}`]);
  return talePick(seed, salt + 5, [`you died at ${where}`, `it ended at ${where}`]);
}

/** One failed attempt, told in a sentence or two. */
function taleFailure(record, log, seed) {
  const salt = record.number * 31;
  const ordinal = taleOrdinal(record.number);
  const opener = talePick(seed, salt, [`The ${ordinal} attempt`, `The ${ordinal} try`, `On the ${ordinal} attempt you`]);
  const starts = record.from ? talePlain(record.from) : talePlain(log.start);
  // (An attempt begins and sets out; it is only a man who wakes.)
  const began = record.from
    ? talePick(seed, salt + 1, opener.endsWith(' you') ? [`began at ${starts}`, `woke at ${starts}`, `set out from ${starts}`] : [`began at ${starts}`, `started at ${starts}`, `set out from ${starts}`])
    : talePick(seed, salt + 1, [`began at ${starts}`, `set out from ${starts}`, `started at ${starts}`]);
  const company = taleCompany(record.comrades, seed, salt + 2);
  // (The last rest he reached, when it is further on than the one he woke at.)
  const rested = record.rest && record.rest !== record.from ? `, rested at ${talePlain(record.rest)}` : '';
  let sentence = `${opener} ${began} ${company}${rested}, and ${taleEnding(record, seed)}.`;
  if (record.fallen.length) {
    sentence += ` ${taleCapital(taleList(record.fallen))} ${talePick(seed, salt + 3, ['fell before you', 'went down first', 'did not outlast you'])}.`;
  }
  if (taleHash(`${seed}:${record.number}:time`) % 3 === 0) sentence += ` It lasted ${taleDuration(record.seconds)}.`;
  return sentence;
}

/** The failures between the first two and the last two, in one line. */
function taleBetween(middle, seed) {
  const places = new Map();
  for (const record of middle) if (record.place) places.set(record.place, (places.get(record.place) ?? 0) + 1);
  const [place] = [...places.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0] ?? [];
  const count = taleCapital(taleCount(middle.length));
  const tail = place ? `, most of them near ${talePlain(place)}` : '';
  return talePick(seed, 7, [
    `${count} more attempts went the same way${tail}.`,
    `${count} more nights ended in the dark${tail}.`,
    `After that came ${taleCount(middle.length)} more failures${tail}.`,
  ]);
}

/** The attempt that counted: who stood with the operative, and who walked out with him. */
function taleSuccess(final, seed, failures) {
  const ordinal = taleOrdinal(final.number);
  const company = taleCompany(final.comrades, seed, 900);
  const lost = final.comrades.filter((name) => !final.survivors.includes(name));
  let leaving;
  if (!final.comrades.length) leaving = talePick(seed, 901, ['You walked out of it alone.', 'No one else was left to walk out with you.']);
  else if (!lost.length) leaving = talePick(seed, 901, [`${taleCapital(taleList(final.comrades))} walked out with you.`, `The ${taleCount(final.comrades.length + 1)} of you walked out of it alive.`]);
  else if (lost.length === final.comrades.length) leaving = talePick(seed, 901, [`${taleCapital(taleList(lost))} did not walk out with you.`, 'You walked out of it alone, and you remembered every name.']);
  else leaving = `${taleCapital(taleList(final.survivors))} walked out with you; ${taleList(lost)} did not.`;
  const open = failures
    ? talePick(seed, 902, [
      `The ${ordinal} attempt was the one that counted: ${company}, you came through the dark to the prince, and the cell stood open at last.`,
      `Then came the ${ordinal} attempt. ${taleCapital(company)}, you did not fall this time, and the cell stood open at last.`,
      `On the ${ordinal} attempt, ${company}, you reached the prince, and the cell stood open at last.`,
    ])
    : talePick(seed, 902, [
      `It took one night and one attempt: ${company}, you went up the cliff, through the garrison and past the jailer, and the cell stood open at last.`,
      `There was no second try. ${taleCapital(company)}, you went in and did not fall, and the cell stood open at last.`,
      `The first attempt was the only one it needed: ${company}, you came up through the storm, and the cell stood open at last.`,
    ]);
  const took = taleHash(`${seed}:took`) % 2 === 0 ? ` It had taken ${taleDuration(final.seconds)}.` : '';
  return `${open} ${leaving}${failures ? '' : took}`;
}

/**
 * The story the ending tells, from `attemptLog(world)`: one paragraph, in the second person. Each earlier attempt is told in turn (where it
 * began, who stood with you, where and by whom it ended, who fell before you), and the paragraph ends on the attempt that counted. With
 * no deaths it is the clean night alone. The same log always gives the same words. (Past TALE_MOST failures the first two and the last two
 * are told in full, and a line sums up the rest.)
 */
export function attemptStory(log) {
  const seed = taleHash(JSON.stringify(log));
  const failed = log.failed;
  const told = failed.length > TALE_MOST
    ? [...failed.slice(0, 2).map((record) => taleFailure(record, log, seed)), taleBetween(failed.slice(2, -2), seed), ...failed.slice(-2).map((record) => taleFailure(record, log, seed))]
    : failed.map((record) => taleFailure(record, log, seed));
  return [...told, taleSuccess(log.final, seed, failed.length)].join(' ');
}
