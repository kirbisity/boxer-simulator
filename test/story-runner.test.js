// Story mode's runner (src/story/runner.js): a whole chapter driven headless with a stub battle outcome (cards, effects, the
// judgement of a man who left his place, after-cards and scenes reading the outcome, the death page), the watch on his place, the
// orders his rank allows, Level 1's scene staged on its battle's field, and Level 1's real battle run headless over a few seeds
// (how often the hero dies, how often a named comrade does: reported, not tuned). STORY_SEEDS=n runs more seeds.

import test from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { advance, knockOut, placeFighter } from '../src/physics.js';
import { thinkAll } from '../src/ai.js';
import { canCommand, giveOrder } from '../src/command.js';
import { storyNewLife } from '../src/story/life.js';
import { createChapterRun, storyAnswer, storyBattleDone, storyBattleWorld, storyCommandMen, storyCurrent, storyNextChapter, storyRunBattle, storySceneDone, storyWatch, storyWatchStep, STORY_JUDGEMENT, STORY_RUN } from '../src/story/runner.js';
import { bodyAxes, createScenePlay, sceneLook, sceneThink, stepScene } from '../src/story/scenes/stage.js';
import { CHAPTERS, COMRADES as STORY_PEOPLE, STORY_FAMILY, STORY_HERO } from '../src/story/chapters/index.js';
import { STORY_BATTLES } from '../src/story/battles/index.js';

const T = (en) => ({ zh: en, en });
const COMRADES = [{ id: 'chen', name: T('Chen'), preset: 'mingSpear', joins: 1, bond: 2 }, { id: 'lou', name: T('Lou'), preset: 'mingSpear', joins: 1 }];
const stubBattle = { id: 'stub', setup: () => ({ fighters: [], options: {}, player: 0, comrades: {} }), seconds: 1 };
const CHAPTER = {
  id: 'test', n: 1, year: 1587, title: T('Test'), battle: 'stub',
  before: [
    { id: 'narration', text: T('It is dry.'), choices: [] },
    { id: 'place', text: T('Where?'), choices: [{ text: T('Front'), effects: { place: 'front' } }, { text: T('Second'), effects: { place: 'second', bond: { chen: 1 } } }] },
    { id: 'never', when: () => false, text: T('Never shown'), choices: [] },
  ],
  after: [
    { id: 'mourn', when: (life, outcome) => outcome?.comrades?.chen === 'dead', text: T('Chen is dead.'), choices: [{ text: T('Bury him'), effects: { flags: { buried: 'chen' } } }] },
    { id: 'quiet', when: (life, outcome) => outcome?.comrades?.chen === 'alive', text: T('Quiet.'), choices: [] },
  ],
  scenes: [{ id: 'chen', at: 'after', when: (life, outcome) => outcome?.comrades?.chen === 'dead', script: [{ who: 'narrator', line: T('…') }] }],
  ending: { text: T('He died young.') },
};
// The chapters' shape (src/story/chapters/kit.js), with the engine's `detail` beside it as storyReadOutcome gives it.
const outcome = ({ fell = false, fled = false, leftPlace = null, chen = false } = {}) => ({
  hero: fled ? 'fled' : fell ? 'out' : 'alive', leftPlace: Boolean(leftPlace), won: true, comrades: { chen: chen ? 'dead' : 'alive', lou: 'alive' },
  detail: {
    hero: { fell, fled, alive: !fell, how: fell ? { kind: 'killed', text: T('killed, by Wang') } : null, kills: 0, leftPlace },
    comrades: { chen: { fell: chen, fled: false, alive: !chen, how: chen ? { text: T('bled to death') } : null }, lou: { fell: false, fled: false, alive: true, how: null } },
    won: true,
  },
});
const begin = () => createChapterRun(storyNewLife(null, { seed: 7 }), CHAPTER, { battles: { stub: stubBattle }, comrades: COMRADES });

test('a whole chapter headless: cards in order (a `when` that says no is passed over), the battle, the outcome into the life, the judgement, after-cards and a scene that read it, the chapter lived through', () => {
  const run = begin();
  assert.equal(storyCurrent(run).card.id, 'narration');
  assert.equal(storyAnswer(run).card.id, 'place');
  assert.equal(storyAnswer(run, 1).kind, 'battle');
  assert.equal(run.life.place, 'second');
  assert.equal(run.life.comrades.find((comrade) => comrade.id === 'chen').bond, 3);
  // He fell back out of the line for a while: he is judged; Chen fell.
  const after = storyBattleDone(run, outcome({ chen: true, leftPlace: { way: 'back', seconds: 7, metres: 8 } }));
  assert.equal(after.card.id, STORY_JUDGEMENT.back.id);
  assert.equal(run.life.comrades.find((comrade) => comrade.id === 'chen').alive, false);
  assert.equal(run.life.comrades.find((comrade) => comrade.id === 'chen').diedAt.how.en, 'bled to death');
  assert.equal(storyAnswer(run).card.id, 'mourn');
  assert.equal(run.life.flags.flogged, true);
  assert.equal(storyAnswer(run).kind, 'scene');
  assert.equal(run.life.flags.buried, 'chen');
  assert.equal(storySceneDone(run).kind, 'done');
  assert.deepEqual(run.life.passed, [1]);
});

test('no comrade fell and he kept his place: no judgement, the quiet card, no scene', () => {
  const run = begin();
  storyAnswer(run);
  storyAnswer(run, 0);
  assert.equal(storyBattleDone(run, outcome()).card.id, 'quiet');
  assert.equal(storyAnswer(run).kind, 'done');
});

test('the hero falls in the battle: the life ends on the chapter\'s ending page, how he fell on it', () => {
  const run = begin();
  storyAnswer(run);
  storyAnswer(run, 0);
  const end = storyBattleDone(run, outcome({ fell: true, chen: true }));
  assert.equal(end.kind, 'dead');
  assert.equal(end.page.how.en, 'killed, by Wang');
  assert.equal(end.page.text.en, 'He died young.');
  assert.deepEqual(end.page.outlived.map((comrade) => comrade.id), ['lou']);
  assert.equal(run.life.attempts[1], 2);
});

test('he flees the field: judged by the army\'s law, executed (a fatal judgement)', () => {
  const run = begin();
  storyAnswer(run);
  storyAnswer(run, 0);
  assert.equal(storyBattleDone(run, outcome({ fled: true })).card.id, STORY_JUDGEMENT.fled.id);
  const end = storyAnswer(run);
  assert.equal(end.kind, 'dead');
  assert.equal(end.page.kind, 'fatal');
  assert.equal(end.page.how, 'executed');
});

test('a fatal choice before the battle ends the life there; a chapter without its battle goes straight on to its after-cards', () => {
  const fatal = { ...CHAPTER, before: [{ id: 'refuse', text: T('Refuse?'), choices: [{ text: T('Refuse'), effects: {}, fatal: { how: 'executed', text: T('Beheaded') } }] }] };
  const run = createChapterRun(storyNewLife(null, { seed: 1 }), fatal, { battles: { stub: stubBattle } });
  assert.equal(storyAnswer(run).kind, 'dead');
  assert.equal(run.death.text.en, 'Beheaded');
  const unbattled = createChapterRun(storyNewLife(null, { seed: 1 }), { ...CHAPTER, battle: 'not-written' }, {});
  storyAnswer(unbattled);
  // (No battle, no outcome: the after-cards that read one are not shown.)
  assert.equal(storyAnswer(unbattled).kind, 'done');
  assert.equal(storyNextChapter([{ n: 1 }, { n: 4 }, { n: 2 }], 1).n, 2);
  assert.equal(storyNextChapter([{ n: 1 }], 1), null);
});

/** Level 1 for a fresh life: its chapter entered, the battle's setup and world at a seed. */
function levelOne(seed = 3, rank = 'soldier') {
  const chapter = CHAPTERS.find((each) => each.n === 1);
  const run = createChapterRun(storyNewLife(null, { seed: 11, family: STORY_FAMILY, hero: STORY_HERO }), chapter, { battles: STORY_BATTLES, comrades: STORY_PEOPLE });
  run.life.rank = rank;
  const battle = STORY_BATTLES[chapter.battle];
  const setup = battle.setup(run.life, seed);
  return { run, battle, setup, world: storyBattleWorld(setup, run.life) };
}

test('Level 1\'s setup: the hero in the company\'s line by his place, his living comrades beside him, his brother among the column', () => {
  const { setup, world, run } = levelOne();
  const hero = world.fighters[setup.player];
  assert.equal(hero.corner, 'red');
  assert.equal(hero.body.inputs.name, run.life.hero.name.en);
  assert.ok(setup.fighters.length >= 60 && setup.fighters.length <= 100, `${setup.fighters.length} men`);
  for (const comrade of run.life.comrades) {
    const man = world.fighters[setup.comrades[comrade.id]];
    assert.equal(man.corner, 'red');
    assert.ok(Math.hypot(man.x[P.pelvis * 3] - hero.x[P.pelvis * 3], man.x[P.pelvis * 3 + 2] - hero.x[P.pelvis * 3 + 2]) < 4, `${comrade.id} stands beside him`);
  }
  assert.equal(world.fighters[setup.comrades.brother].corner, 'blue');
  assert.ok(!world.fighters[setup.comrades.brother].weapon, 'the brother carries no weapon');
});

test('a private soldier commands nobody; a squad leader his squad; an officer his side', () => {
  const soldier = levelOne(3, 'soldier');
  const hero = soldier.world.fighters[soldier.setup.player];
  assert.equal(canCommand(soldier.world, hero), false);
  const leader = levelOne(3, 'squadLeader');
  const squadHero = leader.world.fighters[leader.setup.player];
  assert.equal(canCommand(leader.world, squadHero), true);
  const squad = leader.world.commandMen.red;
  assert.ok(squad.length >= 5 && squad.length <= 11);
  giveOrder(leader.world, squadHero, 'hold');
  const outsider = leader.world.fighters.find((fighter) => fighter.corner === 'red' && fighter !== squadHero && !squad.includes(fighter.id));
  assert.ok(outsider);
  const officer = levelOne(3, 'officer');
  assert.equal(officer.world.commandMen?.red, undefined);
  assert.equal(canCommand(officer.world, officer.world.fighters[officer.setup.player]), true);
  storyCommandMen(officer.world, officer.setup, { rank: 'soldier' });
  assert.equal(canCommand(officer.world, officer.world.fighters[officer.setup.player]), false);
});

test('the watch: out of his place past the named distance for the named time is leaving it, and which way', () => {
  const { setup, world } = levelOne();
  const hero = world.fighters[setup.player];
  const watch = storyWatch(setup);
  storyWatchStep(watch, world, setup, 0.1);
  assert.equal(watch.away, 0);
  // Back from the line (red faces +x): further than the distance.
  placeFighter(hero, hero.x[P.pelvis * 3] - (STORY_RUN.leftPlace.metres + 2), hero.x[P.pelvis * 3 + 2]);
  for (let t = 0; t < STORY_RUN.leftPlace.seconds - 0.5; t += 0.1) storyWatchStep(watch, world, setup, 0.1);
  assert.equal(watch.leftPlace, null, 'not yet');
  for (let t = 0; t < 1; t += 0.1) storyWatchStep(watch, world, setup, 0.1);
  assert.equal(watch.leftPlace.way, 'back');
});

test('Level 1\'s scene staged on its field: the body laid face down, turned face up with the spear, the hero kneeling by it', () => {
  const { setup, world, run } = levelOne();
  const brother = world.fighters[setup.comrades.brother];
  knockOut(world, brother, { time: world.time, effects: [] }, 'cut down', 'killed');
  // The field after the battle: the column gone (dormant: not stepped), so nobody fights round the scene.
  for (const fighter of world.fighters) if (fighter.corner === 'blue' && fighter !== brother) fighter.dormant = true;
  // The chapter's own scene (the writer's: its subject found as the brother who fell, opened in the dark, the body turned), else a stand-in.
  const scene = run.chapter.scenes?.[0] ?? { id: 'brother', script: [{ who: 'narrator', stage: 'cut', line: T('') }, { who: 'hero', stage: 'turn', line: T('') }, { who: 'narrator', stage: 'kneel', line: T('') }, { who: 'narrator', stage: 'search', line: T('') }] };
  const play = createScenePlay(world, scene, { hero: setup.player, cast: setup.comrades, fallen: ['brother'], language: 'en' });
  assert.equal(play.subjectId, 'brother');
  const step = 1 / 30;
  let downFirst = null;
  let kneeled = 0;
  for (let t = 0; t < 60 && !play.done; t += step) {
    stepScene(play, step);
    advance(world, step, (current, dt) => {
      thinkAll(current, dt, new Set([setup.player]));
      sceneThink(play);
    });
    if (play.set && downFirst === null) downFirst = bodyAxes(brother).chest[1];
    if (['kneel', 'search', 'still'].includes(play.stage)) kneeled = Math.max(kneeled, world.fighters[setup.player].kneel?.share ?? 0);
  }
  assert.ok(play.done);
  assert.ok(downFirst < -0.5, `laid face down (chest ${downFirst?.toFixed(2)})`);
  assert.ok(bodyAxes(brother).chest[1] > 0.3, `turned face up (chest ${bodyAxes(brother).chest[1].toFixed(2)})`);
  assert.ok(kneeled > 0.9, 'he kneels by him');
  assert.equal(sceneLook(play).bars, 0);
});

test('Level 1\'s real battle, headless, a few seeds: reported (how often the hero falls, how often each named man does)', { timeout: 900_000 }, (t) => {
  const seeds = Number(process.env.STORY_SEEDS ?? 3);
  const chapter = CHAPTERS.find((each) => each.n === 1);
  const battle = STORY_BATTLES[chapter.battle];
  const tally = { hero: 0, fled: 0, left: 0, people: {} };
  const lines = [];
  for (let seed = 1; seed <= seeds; seed += 1) {
    const run = createChapterRun(storyNewLife(null, { seed: 100 + seed, family: STORY_FAMILY, hero: STORY_HERO }), chapter, { battles: STORY_BATTLES, comrades: STORY_PEOPLE });
    const { outcome: read, world } = storyRunBattle(battle, run.life, seed);
    assert.ok(['alive', 'out', 'fled'].includes(read.hero));
    const result = read.detail;
    assert.equal(typeof result.hero.fell, 'boolean');
    if (result.hero.fell) tally.hero += 1;
    if (result.hero.fled) tally.fled += 1;
    if (result.hero.leftPlace) tally.left += 1;
    for (const [id, fate] of Object.entries(result.comrades)) tally.people[id] = (tally.people[id] ?? 0) + (fate.fell ? 1 : 0);
    lines.push(`seed ${seed}: ${world.time.toFixed(0)} s; hero ${result.hero.fell ? `fell (${result.hero.how?.text.en})` : result.hero.fled ? 'fled' : 'lived'}, kills ${result.hero.kills}${result.hero.leftPlace ? `, left his place ${result.hero.leftPlace.way}` : ''}; ${Object.entries(result.comrades).map(([id, fate]) => `${id} ${fate.fell ? 'fell' : fate.fled ? 'fled' : 'lived'}`).join(', ')}`);
  }
  const share = (n) => `${n}/${seeds}`;
  t.diagnostic(lines.join('\n'));
  t.diagnostic(`hero fell ${share(tally.hero)}, fled ${share(tally.fled)}, left his place ${share(tally.left)}; ${Object.entries(tally.people).map(([id, n]) => `${id} fell ${share(n)}`).join(', ')}`);
});

test('the whole life, every chapter there is, played headless: each battle\'s setup built for the life as it stands, a stub outcome, every card answered (its last choice), to the end', (t) => {
  let life = storyNewLife(null, { seed: 21, family: STORY_FAMILY, hero: STORY_HERO });
  let chapter = CHAPTERS[0];
  const seen = [];
  let page = null;
  while (chapter && !page) {
    const run = createChapterRun(life, chapter, { battles: STORY_BATTLES, comrades: STORY_PEOPLE });
    for (let guard = 0; guard < 200; guard += 1) {
      const now = storyCurrent(run);
      if (now.kind === 'card') storyAnswer(run, Math.max(0, (now.card.choices?.length ?? 1) - 1));
      else if (now.kind === 'battle') {
        const setup = now.battle.setup(run.life, 5);
        assert.ok(setup.fighters[setup.player], `${chapter.id}: the hero is in the battle`);
        storyBattleDone(run, { hero: 'alive', leftPlace: false, won: true, comrades: Object.fromEntries(Object.keys(setup.comrades ?? {}).map((id) => [id, 'alive'])) });
      } else if (now.kind === 'scene') storySceneDone(run);
      else if (now.kind === 'dead') {
        page = now.page;
        break;
      } else break;
    }
    seen.push(`${chapter.n}${run.battle ? '' : ' (no battle yet)'}${run.phase === 'dead' ? ' (died)' : ''}`);
    life = run.life;
    chapter = page ? null : storyNextChapter(CHAPTERS, chapter.n);
  }
  assert.ok(seen.length >= 1);
  t.diagnostic(`chapters played: ${seen.join(', ')}${page ? `; ended by ${page.kind} at chapter ${page.chapter}` : '; lived through'}`);
});
