// Story mode's ladder (src/story/ranks.js): the ranks and what each commands in battle, the merit a battle is worth, and the
// promotions the chapters give (src/story/chapters/*: chapPromotionCards), driven through the real chapters with stub battle
// outcomes: a life that fights well rises by the chapters the spec says, the officials' cards keep merit back or give his
// post to another man, a dead superior opens a place, and a man who left his place is not promoted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY_MERIT, STORY_RANKS, STORY_SCOPES, storyBattleMerit, storyGradeOf, storyPromotionDue, storyRankOf } from '../src/story/ranks.js';
import { storyApplyEffects, storyEnterChapter, storyNewLife, storyValidLife } from '../src/story/life.js';
import { createChapterRun, storyAnswer, storyBattleDone, storyBattleWorld, storyCurrent, storyDeploy, storyReadOutcome, storySceneDone, storyWatch } from '../src/story/runner.js';
import { CHAPTERS, COMRADES, STORY_FAMILY, STORY_HERO } from '../src/story/chapters/index.js';
import { STORY_BATTLES } from '../src/story/battles/index.js';

const chapter = (n) => CHAPTERS.find((each) => each.n === n);

/** A stub battle outcome in the chapters' shape: he lived and held, his side won, his living comrades all came out. */
function fought(life, { won = true, kills = 2, leftPlace = false, superiorFell = false, hero = 'alive' } = {}) {
  const comrades = Object.fromEntries(life.comrades.filter((each) => each.alive).map((each) => [each.id, 'alive']));
  return { hero, leftPlace, won, kills, superiorFell, comrades };
}

/** The first choice of a card that does not end the life, unless `picks` names one by card id. */
const choose = (card, picks) => picks[card.id] ?? Math.max(0, (card.choices ?? []).findIndex((choice) => !choice.fatal));

/** Play a chapter through with a stub outcome; returns the cards shown. */
function play(life, n, battle = {}, picks = {}) {
  const run = createChapterRun(life, chapter(n), { battles: STORY_BATTLES, comrades: COMRADES });
  const shown = [];
  for (let guard = 0; guard < 400; guard += 1) {
    const current = storyCurrent(run);
    if (current.kind === 'card') {
      shown.push(current.card.id);
      storyAnswer(run, choose(current.card, picks));
    } else if (current.kind === 'deploy') storyDeploy(run);
    else if (current.kind === 'battle') storyBattleDone(run, fought(life, battle));
    else if (current.kind === 'scene') storySceneDone(run);
    else break;
  }
  assert.ok(!life.dead, `chapter ${n}: he died (${life.dead?.how?.en ?? ''})`);
  return shown;
}

const newLife = () => storyNewLife(null, { seed: 7, family: STORY_FAMILY, hero: STORY_HERO });

test('the ladder: unique ranks, lowest first, each on one of the three commands, commanding no fewer than the one below', () => {
  assert.equal(new Set(STORY_RANKS.map((rank) => rank.id)).size, STORY_RANKS.length);
  assert.equal(STORY_RANKS[0].id, 'bing');
  STORY_RANKS.forEach((rank, index) => {
    assert.ok(STORY_SCOPES.includes(rank.scope), rank.id);
    assert.ok(rank.name.zh && rank.name.en && rank.leads.zh && rank.leads.en, rank.id);
    if (index === 0) return;
    const below = STORY_RANKS[index - 1];
    assert.ok(rank.men >= below.men && rank.from >= below.from, rank.id);
    assert.ok(STORY_SCOPES.indexOf(rank.scope) >= STORY_SCOPES.indexOf(below.scope), rank.id);
    assert.ok(rank.take.zh && rank.take.en, rank.id);
  });
  // Every command the battles know has a rank on it.
  for (const scope of STORY_SCOPES) assert.ok(STORY_RANKS.some((rank) => rank.scope === scope), scope);
});

test('each rank commands in battle what it leads: the file, the squad, the platoon, the side', () => {
  for (const rank of STORY_RANKS) {
    const life = newLife();
    storyApplyEffects(life, { rank: rank.id });
    storyEnterChapter(life, chapter(2), { comrades: COMRADES });
    const setup = STORY_BATTLES.wokou.setup(life, 1);
    const world = storyBattleWorld(setup, life);
    const hero = world.fighters[setup.player];
    const ordered = world.commandMen?.[hero.corner];
    const side = world.fighters.filter((each) => each.corner === hero.corner).length - 1;
    if (rank.men === Infinity) assert.equal(ordered, undefined, `${rank.id}: his whole side`);
    else assert.equal(ordered.length, Math.min(rank.men, side), rank.id);
    assert.equal(life.rank, rank.scope, rank.id);
  }
});

test('the merit of a battle: living, holding, winning, the heads (a beaten side cuts none), comrades kept; nothing for the fallen', () => {
  const best = { hero: 'alive', leftPlace: false, won: true, kills: 9, comrades: { a: 'alive' } };
  assert.equal(storyBattleMerit(best), STORY_MERIT.lived + STORY_MERIT.held + STORY_MERIT.won + STORY_MERIT.killsMax + STORY_MERIT.kept);
  assert.equal(storyBattleMerit({ ...best, won: false }), STORY_MERIT.lived + STORY_MERIT.held + STORY_MERIT.kept);
  assert.ok(storyBattleMerit({ ...best, leftPlace: true }) < storyBattleMerit(best));
  assert.equal(storyBattleMerit({ ...best, hero: 'out' }), 0);
  assert.equal(storyBattleMerit({ ...best, hero: 'fled' }), 0);
  assert.equal(storyBattleMerit(null), 0);
});

test('a life that fights well: file leader after the flats, squad leader after the raid, platoon leader at Pyongyang, company officer in Liaodong, commander after Sarhu', () => {
  const life = newLife();
  const grades = [];
  // He buries his brother on the flats (carrying a "bandit" back would cost him the day's merit); he does not buy a post.
  const picks = { 'suppression-grave': 1, 'liaodong-post': 1 };
  for (const n of [1, 2, 3, 4, 5, 6, 7]) {
    play(life, n, n === 4 ? { won: false } : {}, picks);
    grades.push(storyGradeOf(life));
  }
  assert.deepEqual(grades, ['jiazhang', 'duizhang', 'shaozhang', 'shaozhang', 'shaozhang', 'shaoguan', 'bazong']);
  assert.deepEqual(life.promotions.map((each) => [each.chapter, each.how]), [[1, 'merit'], [2, 'merit'], [3, 'vacancy'], [6, 'merit'], [7, 'vacancy']]);
  // Pyongyang's credit, Ulsan's report and Sarhu's rout kept merit back from him.
  assert.ok(life.withheld > 0);
  assert.equal(life.rank, 'officer');
  assert.ok(storyValidLife(life));
});

test('the officials keep it back: a "bandit" carried home, and a post his merit earned given to another man', () => {
  const carried = newLife();
  play(carried, 1, {}, { 'suppression-grave': 0 });
  assert.equal(storyGradeOf(carried), 'bing');
  assert.ok(carried.withheld >= 4 && carried.merit === 0);

  // Byeokjegwan: his merit has earned a squad, and a household man's cousin gets it.
  const life = newLife();
  play(life, 1, {}, { 'suppression-grave': 1 });
  storyApplyEffects(life, { merit: 10 });
  const shown = play(life, 4);
  assert.ok(shown.includes('byeokjegwan-passed-over'));
  assert.equal(storyGradeOf(life), 'jiazhang');
  assert.equal(life.merit, 0);
  assert.ok(life.flags.passedOver);
});

test('a dead superior opens his place to a man who stood; not to one who left his', () => {
  const life = newLife();
  play(life, 1, { won: false, kills: 0 }, { 'suppression-grave': 1 });
  assert.equal(storyGradeOf(life), 'bing');
  const shown = play(life, 2, { won: false, kills: 0, superiorFell: true });
  assert.ok(shown.includes('wokou-promoted-jiazhang-vacancy'));
  assert.equal(storyGradeOf(life), 'jiazhang');

  const ran = newLife();
  play(ran, 1, { won: false, kills: 0 }, { 'suppression-grave': 1 });
  play(ran, 2, { superiorFell: true, leftPlace: true });
  assert.equal(storyGradeOf(ran), 'bing');
  assert.equal(storyPromotionDue({ ...ran, chapter: 3 }, fought(ran, { leftPlace: true }), { vacancy: true }), null);
});

test('one promotion a chapter, none before a rank\'s chapter; a post bought counts as his promotion there', () => {
  const life = { chapter: 2, grade: 'jiazhang', rank: 'soldier', merit: 99, promotions: [] };
  assert.deepEqual(storyPromotionDue(life, { hero: 'alive' }), { rank: 'duizhang', how: 'merit' });
  assert.equal(storyPromotionDue({ ...life, promotions: [{ chapter: 2 }] }, { hero: 'alive' }), null);
  assert.equal(storyPromotionDue({ ...life, grade: 'shaozhang', rank: 'squadLeader' }, { hero: 'alive' }), null, 'a company only from Liaodong');

  const buyer = newLife();
  storyApplyEffects(buyer, { rank: 'duizhang' });
  play(buyer, 6, {}, { 'liaodong-post': 0 });
  assert.equal(storyGradeOf(buyer), 'shaoguan');
  assert.deepEqual(buyer.promotions.at(-1), { chapter: 6, rank: 'shaoguan', how: 'bought' });
  assert.ok(buyer.flags.boughtRank);
});

test('a rank effect by command alone keeps the rank he holds in it; an old save without a grade reads as its command\'s lowest', () => {
  const life = newLife();
  storyApplyEffects(life, { rank: 'shaozhang' });
  storyApplyEffects(life, { rank: 'squadLeader' });
  assert.equal(life.grade, 'shaozhang');
  storyApplyEffects(life, { rank: 'officer' });
  assert.equal(life.grade, 'shaoguan');
  assert.equal(life.kit, 'mingElite');
  storyApplyEffects(life, { rank: 'emperor' });
  assert.equal(life.grade, 'shaoguan');
  assert.equal(storyGradeOf({ rank: 'squadLeader' }), 'duizhang');
  assert.equal(storyGradeOf({ rank: 'officer', grade: 'bing' }), 'shaoguan');
  assert.ok(!storyValidLife({ ...life, grade: 'bing' }));
  assert.equal(storyRankOf('nobody'), null);
});

test('the raid\'s battle names his squad leader as the man over him: his fall reads as a place opened', () => {
  const life = newLife();
  storyEnterChapter(life, chapter(2), { comrades: COMRADES });
  const setup = STORY_BATTLES.wokou.setup(life, 1);
  assert.ok(Number.isInteger(setup.superior) && setup.superior !== setup.player);
  assert.equal(setup.squad.length, 11);
  const world = storyBattleWorld(setup, life);
  assert.equal(world.fighters[setup.superior].corner, world.fighters[setup.player].corner);
  assert.equal(storyReadOutcome(world, setup, storyWatch(setup)).superiorFell, false);
  world.fighters[setup.superior].state = 'out';
  assert.equal(storyReadOutcome(world, setup, storyWatch(setup)).superiorFell, true);
  // A squad leader has no squad leader over him in the raid.
  storyApplyEffects(life, { rank: 'duizhang' });
  assert.equal(STORY_BATTLES.wokou.setup(life, 1).superior, undefined);
});
