// The story's small readers, shared by every chapter's cards: what the life holds (a comrade alive, a flag set, a family
// member there) and what the battle gave back (the hero down, his place left, a named man fallen). Every chapter reads
// the life and the outcome only through these, so the outcome's shape is written down once, here.
//
// The outcome a battle hands back (the engine fills it; anything missing reads as "nothing happened"):
//   { hero: 'alive' | 'out' | 'fled', leftPlace: bool, won: bool, comrades: { [comradeId]: 'alive' | 'out' | 'dead' } }
// A comrade "fell" in this battle if the outcome says so, or if the life already marks him dead in this chapter (the
// engine may apply the battle's deaths to the life before the after-cards are read).
//
// Names here are prefixed `chap` because the bundle is one shared scope (tools/bundle.js).

import { COMRADES } from './comrades.js';

// A named man in the life, or null if he is not in it (yet): a man whose chapter has not come is not there, even if the
// engine lists every comrade from the start.
export function chapComrade(life, id) {
  const man = (life?.comrades ?? []).find((each) => each.id === id) ?? null;
  const joins = man?.joins ?? COMRADES.find((each) => each.id === id)?.joins ?? 1;
  return man && (life?.chapter ?? 1) >= joins ? man : null;
}

// Alive in the life (not fallen in the battle just read, if an outcome is given).
export function chapAlive(life, id, outcome) {
  const man = chapComrade(life, id);
  if (!man || man.alive === false) return false;
  return !chapFell(life, outcome, id);
}

// Fell in the battle this outcome came from.
export function chapFell(life, outcome, id) {
  const state = outcome?.comrades?.[id];
  if (state === 'out' || state === 'dead') return true;
  const man = chapComrade(life, id);
  return Boolean(man && man.alive === false && man.diedAt && man.diedAt.chapter === life?.chapter && man.diedAt.how !== 'executed');
}

// Dead, whenever and however (battle or execution), as the life records it.
export function chapDead(life, id) {
  const man = chapComrade(life, id);
  return Boolean(man && man.alive === false);
}

// He was in the battle at all: alive in the life when it began (fell in it, or came out of it).
export function chapWasThere(life, outcome, id) {
  const man = chapComrade(life, id);
  if (!man) return false;
  if (man.alive !== false) return true;
  return chapFell(life, outcome, id);
}

export function chapFlag(life, key) {
  return Boolean(life?.flags?.[key]);
}

export function chapFamily(life, key) {
  return Boolean(life?.family?.[key]);
}

export function chapRank(life) {
  return life?.rank ?? 'soldier';
}

export function chapLeftPlace(outcome) {
  return Boolean(outcome?.leftPlace) && outcome?.hero !== 'out';
}

export function chapHeroUp(outcome) {
  return !outcome || outcome.hero !== 'out';
}

// An after-card for a named man who fell in this chapter's battle: narration, shown only if he did.
export function chapFallenCard(chapterId, comradeId, text) {
  return { id: `${chapterId}-fell-${comradeId}`, when: (life, outcome) => chapFell(life, outcome, comradeId), text, choices: [] };
}

// An after-card for a named man who came through this chapter's battle alive.
export function chapLivedCard(chapterId, comradeId, text, choices = []) {
  return { id: `${chapterId}-lived-${comradeId}`, when: (life, outcome) => chapWasThere(life, outcome, comradeId) && !chapFell(life, outcome, comradeId), text, choices };
}

// Qi Jiguang's law on a man who leaves his place, as his drill manual has it (纪效新书, 卷三 临阵连坐军法): "凡临阵退缩，
// 许甲长割兵耳……回兵，查无耳者，斩"; "凡行列不齐……擅离队伍……俱治军法". Every chapter's judgement card (shown when
// the battle's outcome says he left his place and lived) quotes it between its own lines: what he did, then what was done.
export const CHAP_LAW = {
  zh: '按戚将军《纪效新书》里的军法：“凡临阵退缩，许甲长割兵耳”，“回兵，查无耳者，斩”；“擅离队伍……俱治军法”。',
  en: 'By General Qi\'s law in his drill manual, the Jixiao Xinshu (纪效新书): "a man who falls back in battle, his file leader may cut off his ear"; "at the roll after, any man with no ear is beheaded"; "whoever leaves his file ... is dealt with by military law."',
};

export function chapJudgementCard(chapterId, before, after, choices) {
  return {
    id: `${chapterId}-judgement`,
    when: (life, outcome) => chapLeftPlace(outcome),
    text: { zh: `${before.zh}${CHAP_LAW.zh}${after.zh}`, en: `${before.en} ${CHAP_LAW.en} ${after.en}` },
    choices,
  };
}
