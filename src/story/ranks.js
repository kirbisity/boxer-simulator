// Story mode: the ladder Chen Er climbs, and how a man climbed it. Pure data and pure readers (no DOM), used by life.js,
// runner.js and the chapters' promotion cards (chapters/kit.js chapPromotionCards); run in Node by test/story-ranks.test.js.
//
// The ladder is the southern one, Qi Jiguang's (纪效新书, the 18-juan edition, 卷一 原束伍): a squad (队) of twelve under
// its 队长, split into two 甲 of five each under a 甲长 (the man who cuts a coward's ear, 卷三 临阵连坐军法); "四队为一哨，
// 哨长居之"; "四哨为一官，哨官居之"; the 把总 over the 哨官 (卷三: "割首级哨队长兵夫专委把总管束"). The northern manual,
// 练兵实纪 卷一 (1571), names the same steps 伍长, 队长 (队总), 旗总 (three 队), 百总 (a 局), 把总 (a 司 of four 局),
// 千总 (a 部); in the Wanli camps the two sets were both in use. Each rank chose the rank below ("令千总选部下把总……
// 又令各百总选旗总"; the 18-juan manual's 哨长 "于兵内自举抽出队长"): a man rose because the man above him picked him.
//
// How a man got picked (what `merit` and `vacancy` stand for here):
//  - merit (功): heads (首级) above all; the Ming paid and promoted by the head, and Qi made the heads the whole 哨's
//    (卷三: the heads "尽数派与本哨官部内冲锋兵勇，均分报功"), so a man's own share was his standing in the line: not
//    breaking, being first in, killing. The battle is read for it (storyBattleMerit). A beaten side holds no field and
//    cuts no heads: its kills count for nothing.
//  - a vacancy: a leader killed. Qi's law beheads the 甲长 of a squad whose men fell back and let their 队长 die, and
//    the 队长 of a 哨 that let its 哨长 die (卷三); the man of the squad who stood his ground takes the flag.
//  - and the officials: merit went up the chain on paper, and the paper could be kept back (Li Rusong's report after
//    Pyongyang put the northern men first; Yang Hao buried Ulsan's dead), written under another man's name (冒功), or a
//    post sold. A chapter's card does this with the effect `merit: 'withhold'`.
// Names here are prefixed `story` because the bundle is one shared scope (tools/bundle.js).

/**
 * The ranks, lowest first. `scope`: which of the engine's three commands he has in battle (runner.js storyCommandMen, the
 * battles' koreaRowOf, the kit by rank: soldier stands in his file, squadLeader at his squad's back, officer behind the
 * line). `men`: how many men he orders (Infinity: his whole side, as the battles are drawn at a scale). `from`: the first
 * chapter he can reach it in; `merit`: the merit on his books since his last promotion that earns it; `take`: the choice
 * on its promotion card (the 甲长's duty is the ear of a man who falls back: "许甲长割兵耳", 卷三).
 */
export const STORY_RANKS = [
  {
    id: 'bing', scope: 'soldier', men: 0, from: 1, merit: 0,
    name: { zh: '兵', en: 'soldier' },
    leads: { zh: '只管自己', en: 'only himself' },
  },
  {
    id: 'jiazhang', scope: 'soldier', men: 4, from: 1, merit: 4,
    name: { zh: '甲长', en: 'file leader (甲长, jiazhang)' },
    leads: { zh: '一甲五人，他在内', en: 'his file (甲) of five, himself among them' },
    take: { zh: '领了这份差事：谁往后退，割谁的耳朵。', en: 'Take the duty: whoever falls back, his ear.' },
  },
  {
    id: 'duizhang', scope: 'squadLeader', men: 11, from: 2, merit: 4,
    name: { zh: '队长', en: 'squad leader (队长, duizhang)' },
    leads: { zh: '一队十二人：鸳鸯阵', en: 'a squad (队) of twelve: the mandarin-duck formation' },
    take: { zh: '接过队旗。', en: 'Take the squad\'s flag.' },
  },
  {
    id: 'shaozhang', scope: 'squadLeader', men: 47, from: 3, merit: 5,
    name: { zh: '哨长', en: 'platoon leader (哨长, shaozhang)' },
    leads: { zh: '四队为一哨', en: 'a platoon (哨) of four squads' },
    take: { zh: '接过哨旗。', en: 'Take the platoon\'s flag.' },
  },
  {
    id: 'shaoguan', scope: 'officer', men: Infinity, from: 6, merit: 5,
    name: { zh: '哨官', en: 'company officer (哨官, shaoguan)' },
    leads: { zh: '四哨为一官', en: 'a company (官) of four platoons' },
    take: { zh: '接过官旗。', en: 'Take the company\'s banner.' },
  },
  {
    id: 'bazong', scope: 'officer', men: Infinity, from: 7, merit: 6,
    name: { zh: '把总', en: 'commander (把总, bazong)' },
    leads: { zh: '一总：几个哨官和他们的兵', en: 'a command (总) of companies' },
    take: { zh: '接过令箭。', en: 'Take the arrow of command (令箭).' },
  },
];

export const STORY_SCOPES = ['soldier', 'squadLeader', 'officer'];

// The merit a battle puts on his books: lived through it, held his place, his side won, each man he put down (at most
// `killsMax` of them: the heads are the 哨's), his named comrades all come out of it beside him; less for leaving his place.
export const STORY_MERIT = { lived: 1, held: 1, won: 1, kill: 1, killsMax: 2, kept: 1, leftPlace: -2 };

/** A rank by id, or null. */
export const storyRankOf = (id) => STORY_RANKS.find((rank) => rank.id === id) ?? null;

/** Where a rank stands in the ladder (0 the soldier), or -1. */
export const storyRankIndex = (id) => STORY_RANKS.findIndex((rank) => rank.id === id);

/** The lowest rank of a command scope ('squadLeader': the 队长), for an effect or an old save that names only the scope. */
export const storyRankOfScope = (scope) => STORY_RANKS.find((rank) => rank.scope === scope) ?? null;

/** The rank above, or null at the top. */
export const storyRankAbove = (id) => STORY_RANKS[storyRankIndex(id) + 1] ?? null;

/** His rank in the life (an old save, or a life whose scope was set alone: the lowest rank of that scope). */
export function storyGradeOf(life) {
  const grade = storyRankOf(life?.grade);
  if (grade && (!life?.rank || grade.scope === life.rank)) return grade.id;
  return storyRankOfScope(life?.rank)?.id ?? 'bing';
}

/**
 * The merit a battle's outcome is worth (the runner's outcome: hero, leftPlace, won, comrades, detail.hero.kills).
 * Nothing for a man who fell or fled. Never below 0.
 */
export function storyBattleMerit(outcome) {
  if (!outcome || outcome.hero !== 'alive') return 0;
  const kills = Math.min(STORY_MERIT.killsMax, outcome.detail?.hero?.kills ?? outcome.kills ?? 0);
  const comrades = Object.values(outcome.comrades ?? {});
  let merit = STORY_MERIT.lived;
  merit += outcome.leftPlace ? STORY_MERIT.leftPlace : STORY_MERIT.held;
  if (outcome.won) merit += STORY_MERIT.won + kills * STORY_MERIT.kill;
  if (comrades.length && comrades.every((state) => state === 'alive')) merit += STORY_MERIT.kept;
  return Math.max(0, merit);
}

/**
 * Whether he is promoted after this chapter's battle, and how: { rank, how: 'vacancy' | 'merit' } or null. Never twice in a
 * chapter, never before the rank's `from`, never for a man who left his place, fled or fell. A vacancy (`vacancy`: the
 * record's losses among the leaders, or the battle's own: `outcome.superiorFell`) wants only that he stood his ground; merit
 * wants the rank's `merit` on his books.
 */
export function storyPromotionDue(life, outcome, { vacancy = false } = {}) {
  if (!life || !outcome || outcome.hero !== 'alive' || outcome.leftPlace) return null;
  const n = life.chapter ?? 0;
  if ((life.promotions ?? []).some((each) => each.chapter === n)) return null;
  const next = storyRankAbove(storyGradeOf(life));
  if (!next || n < next.from) return null;
  if (vacancy || outcome.superiorFell) return { rank: next.id, how: 'vacancy' };
  if ((life.merit ?? 0) >= next.merit) return { rank: next.id, how: 'merit' };
  return null;
}
