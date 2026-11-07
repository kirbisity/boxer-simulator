// Level mode, the attempts: every death is a failed attempt on the keep, and the run's last attempt is the one that reaches the back room behind
// the chapel, finds it empty and goes down the chute (levelmode/ending.js: the operative stays below with Caby, the new Noname). The run keeps a
// record of each failure (so the ending can tell the story of the night) and the one attempt now under way.
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
import { getLang, tname } from '../i18n.js';

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
      // How the epilogue ended (ending.js: 'cleared', 'held', 'fell'), when it has.
      outcome: level.ending?.outcome ?? null,
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

/**
 * The attempt that was the last: who stood with the operative and who was left waiting for him, the empty room behind the jailer, and the end of it:
 * he stays below the keep with Caby, the new Noname, waiting for whoever comes next.
 */
function taleLast(final, seed, failures) {
  const ordinal = taleOrdinal(final.number);
  const company = taleCompany(final.comrades, seed, 900);
  const lost = final.comrades.filter((name) => !final.survivors.includes(name));
  let left;
  if (!final.comrades.length) left = talePick(seed, 901, ['You had gone in alone, and no one waited for you at the chapel gate.', 'You came alone; there was no one to come back for.']);
  else if (!lost.length) left = talePick(seed, 901, [`${taleCapital(taleList(final.comrades))} waited at the chapel gate for a man who did not come back.`, `${taleCapital(taleList(final.comrades))} waited at the chapel gate. You never came back for them.`]);
  else if (lost.length === final.comrades.length) left = talePick(seed, 901, [`${taleCapital(taleList(lost))} did not live to see the chapel.`, 'You went on alone, and you remembered every name.']);
  else left = `${taleCapital(taleList(final.survivors))} waited at the chapel gate; ${taleList(lost)} did not live to.`;
  const reached = failures
    ? talePick(seed, 902, [
      `The ${ordinal} attempt was the last: ${company}, you came through the dark and past the jailer, and the room behind him was empty.`,
      `Then came the ${ordinal} attempt. ${taleCapital(company)}, you did not fall this time, and behind the jailer you found an empty room.`,
      `On the ${ordinal} attempt, ${company}, you got past the jailer at last, and the room behind him held no one.`,
    ])
    : talePick(seed, 902, [
      `It took one night and one attempt: ${company}, you went up the cliff, through the garrison and past the jailer, and the room behind him was empty.`,
      `There was no second try. ${taleCapital(company)}, you went in, did not fall, and found the room behind the jailer empty.`,
      `The first attempt was the only one there was: ${company}, you came up through the storm and past the jailer to an empty room.`,
    ]);
  const took = taleHash(`${seed}:took`) % 2 === 0 ? ` It had taken ${taleDuration(final.seconds)}.` : '';
  // (Fallen in the epilogue, he lies by Caby; else he waits there, the new Noname.)
  const end = final.outcome === 'fell'
    ? talePick(seed, 903, [
      'You did not climb out again. The Queen\'s men came down after you, and you fell beside Caby in the dark below the keep, the new Noname, and the last.',
      'You never came back up. Below the keep the new Noname held the dark as long as he could, and fell beside Caby.',
    ])
    : talePick(seed, 903, [
      'You did not climb out again. You stayed in the dark below the keep with Caby, and the new Noname waits there for whoever comes next.',
      'You never came back up. Below the keep, beside Caby, the new Noname waits in the dark for whoever comes next.',
    ]);
  return `${reached} ${left}${failures ? '' : took} ${end}`;
}

/**
 * The story the ending tells, from `attemptLog(world)`: one paragraph, in the second person. Each earlier attempt is told in turn (where it
 * began, who stood with you, where and by whom it ended, who fell before you), and the paragraph ends on the last: the empty room, and the
 * operative who stayed below with Caby as the new Noname. With no deaths it is the one night alone. The same log always gives the same words.
 * (Past TALE_MOST failures the first two and the last two are told in full, and a line sums up the rest.)
 */
export function attemptStory(log, lang = getLang()) {
  if (lang === 'zh') return attemptStoryZh(log);
  const seed = taleHash(JSON.stringify(log));
  const failed = log.failed;
  const told = failed.length > TALE_MOST
    ? [...failed.slice(0, 2).map((record) => taleFailure(record, log, seed)), taleBetween(failed.slice(2, -2), seed), ...failed.slice(-2).map((record) => taleFailure(record, log, seed))]
    : failed.map((record) => taleFailure(record, log, seed));
  return [...told, taleLast(log.final, seed, failed.length)].join(' ');
}


// ---- The story in Chinese -----------------------------------------------------------------------------------------
// Not the English put word for word: the same log, the same seed and the same choices, told as Chinese tells it (a list joined
// with 、 and 和, the count in Chinese numerals, the names and places from the names catalogue: i18n.js tname).

/** 1 to 99 in Chinese numerals (一, 十二, 二十三); beyond, the digits. */
function taleNumeralZh(number) {
  const digits = '零一二三四五六七八九';
  if (number < 10) return digits[number];
  if (number < 100) return `${number >= 20 ? digits[Math.floor(number / 10)] : ''}十${number % 10 ? digits[number % 10] : ''}`;
  return String(number);
}

const taleNameZh = (name) => tname(name);

/** 甲、乙和丙. */
function taleListZh(names) {
  const named = names.map(taleNameZh);
  return named.length < 2 ? named.join('') : `${named.slice(0, -1).join('、')}和${named[named.length - 1]}`;
}

function taleDurationZh(seconds) {
  if (seconds < 45) return '不到一分钟';
  const minutes = Math.round(seconds / 60);
  return minutes <= 1 ? '一分钟上下' : `大约${taleNumeralZh(minutes)}分钟`;
}

/** Who is beside him, as a clause of its own ("玛伦在你身边"), or alone. */
const taleCompanyZh = (names, seed, salt) => (names.length
  ? `${taleListZh(names)}${talePick(seed, salt, ['在你身边', '陪在你左右', '跟在你身后'])}`
  : talePick(seed, salt, ['你孤身一人', '你独自一人']));

function taleEndingZh(record, seed) {
  const where = record.place ? taleNameZh(record.place) : '黑暗里';
  const killer = record.killer ? taleNameZh(record.killer) : null;
  const salt = record.number * 31;
  if (killer) {
    return talePick(seed, salt + 5, [
      `最后在${where}被${killer}了结`,
      `最后在${where}倒在${killer}手下`,
      `在${where}，${killer}送你上了路`,
      `到了${where}，命就交在了${killer}手里`,
    ]);
  }
  const cause = record.cause ?? '';
  if (/sea/.test(cause)) return talePick(seed, salt + 5, [`在${where}被海浪卷走`, `从${where}落进海里，再没浮上来`]);
  if (/edge|fell/.test(cause)) return talePick(seed, salt + 5, [`在${where}一脚踏空，摔死了`, `从${where}的崖边栽了下去`]);
  if (/blood|internal/.test(cause)) return talePick(seed, salt + 5, [`在${where}流尽了血`, `在${where}伤重不治`]);
  return talePick(seed, salt + 5, [`死在了${where}`, `在${where}断了气`]);
}

function taleFailureZh(record, log, seed) {
  const salt = record.number * 31;
  const opener = talePick(seed, salt, [`第${taleNumeralZh(record.number)}次`, `第${taleNumeralZh(record.number)}回`, `第${taleNumeralZh(record.number)}次尝试`]);
  const starts = taleNameZh(record.from ?? log.start);
  const began = record.from
    ? talePick(seed, salt + 1, [`你从${starts}出发`, `你在${starts}醒来`, `你从${starts}动身`])
    : talePick(seed, salt + 1, [`你从${starts}出发`, `你从${starts}动身`, `你从${starts}起步`]);
  const company = taleCompanyZh(record.comrades, seed, salt + 2);
  const rested = record.rest && record.rest !== record.from ? `，在${taleNameZh(record.rest)}歇过脚` : '';
  let sentence = `${opener}，${began}，${company}${rested}，${taleEndingZh(record, seed)}。`;
  if (record.fallen.length) sentence += `${taleListZh(record.fallen)}${talePick(seed, salt + 3, ['比你先倒下了', '先走了一步', '没能撑得比你久'])}。`;
  if (taleHash(`${seed}:${record.number}:time`) % 3 === 0) sentence += `前后撑了${taleDurationZh(record.seconds)}。`;
  return sentence;
}

function taleBetweenZh(middle, seed) {
  const places = new Map();
  for (const record of middle) if (record.place) places.set(record.place, (places.get(record.place) ?? 0) + 1);
  const [place] = [...places.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0] ?? [];
  const count = taleNumeralZh(middle.length);
  const tail = place ? `，大多死在${taleNameZh(place)}一带` : '';
  return talePick(seed, 7, [
    `之后又有${count}次，结局都一样${tail}。`,
    `又是${count}个夜晚，都断送在黑暗里${tail}。`,
    `再往后，又败了${count}次${tail}。`,
  ]);
}

function taleLastZh(final, seed, failures) {
  const ordinal = `第${taleNumeralZh(final.number)}次`;
  const company = taleCompanyZh(final.comrades, seed, 900);
  const lost = final.comrades.filter((name) => !final.survivors.includes(name));
  let left;
  if (!final.comrades.length) left = talePick(seed, 901, ['你是一个人进去的，礼拜堂门口没有人等你。', '你独自前来，也就没有谁要你回去找。']);
  else if (!lost.length) left = talePick(seed, 901, [`${taleListZh(final.comrades)}在礼拜堂门口，等一个再也没回来的人。`, `${taleListZh(final.comrades)}守在礼拜堂门口。你再没回去找他们。`]);
  else if (lost.length === final.comrades.length) left = talePick(seed, 901, [`${taleListZh(lost)}没能活着看到礼拜堂。`, '最后只剩你一个人往前走，每一个名字你都记着。']);
  else left = `${taleListZh(final.survivors)}在礼拜堂门口等你；${taleListZh(lost)}没能撑到那里。`;
  const reached = failures
    ? talePick(seed, 902, [
      `${ordinal}是最后一次。${company}，你穿过黑暗，越过狱卒——他身后的屋子，空空如也。`,
      `然后是${ordinal}。${company}，这一回你没有倒下；可狱卒身后，只有一间空屋。`,
      `${ordinal}，${company}，你总算越过了狱卒，他身后的屋里一个人也没有。`,
    ])
    : talePick(seed, 902, [
      `一个夜晚，一次尝试：${company}，你爬上悬崖，杀穿守军，越过狱卒——他身后的屋子是空的。`,
      `没有第二次。${company}，你走了进去，没有倒下，狱卒身后的屋子却空着。`,
      `第一次，也是唯一的一次：${company}，你顶着风暴一路杀上来，越过狱卒，只看见一间空屋。`,
    ]);
  const took = taleHash(`${seed}:took`) % 2 === 0 ? `前后用了${taleDurationZh(final.seconds)}。` : '';
  const end = final.outcome === 'fell'
    ? talePick(seed, 903, [
      '你没能再爬出去。女王的人追了下来，你倒在卡比身旁，倒在城堡底下的黑暗里——新的无名者，也是最后一个。',
      '你再没回到地面。城堡底下，新的无名者守着那片黑暗，守到守不住为止，最后倒在卡比身边。',
    ])
    : talePick(seed, 903, [
      '你没有再爬出去。你和卡比一起留在城堡底下的黑暗里；新的无名者在那里等着，等下一个来的人。',
      '你再没回到地面。城堡底下，卡比身旁，新的无名者在黑暗里等着下一个人。',
    ]);
  return `${reached}${left}${failures ? '' : took}${end}`;
}

/** attemptStory in Chinese: the same log, the same picks (the seed is the log's), the same shape. */
function attemptStoryZh(log) {
  const seed = taleHash(JSON.stringify(log));
  const failed = log.failed;
  const told = failed.length > TALE_MOST
    ? [...failed.slice(0, 2).map((record) => taleFailureZh(record, log, seed)), taleBetweenZh(failed.slice(2, -2), seed), ...failed.slice(-2).map((record) => taleFailureZh(record, log, seed))]
    : failed.map((record) => taleFailureZh(record, log, seed));
  return [...told, taleLastZh(log.final, seed, failed.length)].join('');
}
