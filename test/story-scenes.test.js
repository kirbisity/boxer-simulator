// Story mode's staged scenes and the Hun River finale (src/story/scenes/): every chapter scene resolves to a playable script
// (its set, its stage words, its placement after a card or as a fatal choice's); every set builds a world for the lives that
// reach it and its scene plays to the end headless, the figures placed, posed and laid down without a NaN; the runner queues
// scenes after cards and before a fatal page, and the finale before the last page; the finale's flashbacks are the same for a
// life and differ between lives (comrades alive or dead, Jin at the pole, the family), kept to what the life allows, in the
// order he lived them, closing on the waist tag and the letter; its shots run to the end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { advance, createWorld } from '../src/physics.js';
import { thinkAll } from '../src/ai.js';
import { storyEnterChapter, storyMarkDead, storyNewLife, storyApplyEffects } from '../src/story/life.js';
import { CHAPTERS, COMRADES, FLASHBACKS, STORY_FAMILY, STORY_HERO } from '../src/story/chapters/index.js';
import { STORY_BATTLES } from '../src/story/battles/index.js';
import { createChapterRun, storyAnswer, storyBattleDone, storyCurrent, storyFinaleDone, storySceneDone } from '../src/story/runner.js';
import { createScenePlay, poseSetFigures, sceneHeld, sceneLook, sceneThink, sceneWords, stageSetFigures, stepScene } from '../src/story/scenes/stage.js';
import { storySetSetup, STORY_SET, STORY_SETS } from '../src/story/scenes/sets.js';
import { createFinalePlay, finaleFlashbacks, finaleLook, finaleSeconds, finaleShots, stepFinale, STORY_FINALE } from '../src/story/scenes/finale.js';

// The stage words a script may use (scenes/stage.js): the body scene's, and a set's.
const STAGE_WORDS = new Set(['cut', 'approach', 'turn', 'kneel', 'search', 'still', 'rise', 'dark', 'lift', 'fall', 'shot', ...Object.keys(STORY_SET.poses)]);

/** A life entered to chapter `n` (every comrade who joins by then), then `effects` (flags, family, `dies`) and the men who `fell` in n. */
function lifeAt(n, { seed = 5, effects = {}, fell = [] } = {}) {
  const life = storyNewLife(null, { seed, family: STORY_FAMILY, hero: STORY_HERO });
  for (const chapter of CHAPTERS.filter((each) => each.n <= n)) storyEnterChapter(life, chapter, { comrades: COMRADES });
  storyApplyEffects(life, effects);
  for (const id of fell) storyMarkDead(life, id, { how: { zh: '战死', en: 'killed' } });
  return life;
}

const family = { family: { wife: true, son: true, daughter: true }, flags: { married: true } };

/** No part of any man anywhere but a number. */
function finite(world) {
  return world.fighters.every((fighter) => fighter.x.every(Number.isFinite));
}

/** A set's world for a life, its scene played to the end (the world stepped as the page steps it: the held figures think nothing). */
function playSet(sceneDef, life, { year = life.year, memory = false, alias = {} } = {}) {
  const setup = storySetSetup(STORY_SETS[sceneDef.set], life, { year, memory, alias });
  const world = createWorld(setup.fighters, setup.options);
  const play = createScenePlay(world, sceneDef, { hero: setup.player, cast: setup.comrades, figures: setup.figures, camera: setup.camera, life });
  const step = 1 / 30;
  let blackest = 0;
  for (let t = 0; t < 90 && !play.done; t += step) {
    // (The page steps the world before the scene's first step: a figure not yet placed is left alone.)
    advance(world, step, (current, dt) => {
      thinkAll(current, dt, new Set(sceneHeld(play)));
      sceneThink(play);
    });
    stepScene(play, step);
    blackest = Math.max(blackest, sceneLook(play).black);
  }
  return { setup, world, play, blackest };
}

test('every chapter scene resolves to a playable script: lines in both languages, known stage words, its set, its place', () => {
  for (const chapter of CHAPTERS) {
    const beforeCards = new Set((chapter.before ?? []).map((card) => card.id));
    const fatalScenes = new Set((chapter.before ?? []).flatMap((card) => card.choices ?? []).map((choice) => choice.fatal?.scene).filter(Boolean));
    for (const scene of chapter.scenes ?? []) {
      assert.ok(scene.script?.length, `${scene.id}: a script`);
      for (const line of scene.script) {
        assert.ok(line.line?.zh !== undefined && line.line?.en !== undefined, `${scene.id}: a line in both languages`);
        for (const { word, who } of sceneWords(line)) {
          assert.ok(STAGE_WORDS.has(word), `${scene.id}: stage word ${word}`);
          // A shot named is one of its set's.
          if (word === 'shot') assert.ok(who === 'main' || STORY_SETS[scene.set]?.cameras?.[who], `${scene.id}: shot ${who}`);
        }
      }
      if (scene.set) assert.ok(STORY_SETS[scene.set], `${scene.id}: set ${scene.set}`);
      if (scene.after) assert.ok(beforeCards.has(scene.after), `${scene.id}: after a card of its chapter (${scene.after})`);
      if (scene.at === 'fatal') assert.ok(fatalScenes.has(scene.id), `${scene.id}: a fatal choice plays it`);
    }
    for (const id of fatalScenes) assert.ok(chapter.scenes.some((scene) => scene.id === id && scene.at === 'fatal'), `${chapter.id}: fatal scene ${id}`);
  }
  // The key scenes are staged: the brother on the flats (on the battle's own field), the tally, the drill ground, the homecoming, the pole.
  const ids = new Set(CHAPTERS.flatMap((chapter) => (chapter.scenes ?? []).filter((scene) => scene.set || scene.id === 'suppression-mud').map((scene) => scene.id)));
  for (const id of ['suppression-mud', 'pyongyang-tally', 'ulsan-drillground', 'ulsan-drillground-others', 'ulsan-drillground-self', 'liaodong-homecoming', 'sarhu-pole']) assert.ok(ids.has(id), id);
});

test('every set scene plays headless to its end for the lives that reach it: placed, posed, laid down in the dark, no NaN', () => {
  const cases = [
    [3, 'pyongyang-tally', {}],
    [5, 'ulsan-drillground', { effects: { flags: { jinExecuted: true, watchedJin: true }, dies: { jin: 'executed' } } }],
    [5, 'ulsan-drillground', { effects: { flags: { jinExecuted: true }, dies: { jin: 'executed' } } }],
    [5, 'ulsan-drillground-others', { fell: ['jin'] }],
    [5, 'ulsan-drillground-self', {}],
    [6, 'liaodong-homecoming', { effects: { ...family, flags: { married: true, waitedForAhe: true } } }],
    [6, 'liaodong-homecoming', { effects: family }],
    [7, 'sarhu-pole', {}],
    [7, 'sarhu-pole-self', {}],
  ];
  for (const [n, id, options] of cases) {
    const chapter = CHAPTERS.find((each) => each.n === n);
    const sceneDef = chapter.scenes.find((scene) => scene.id === id);
    const life = lifeAt(n, options);
    const { setup, world, play, blackest } = playSet(sceneDef, life, { year: sceneDef.year ?? chapter.year });
    assert.ok(play.done, `${id}: played to its end`);
    assert.ok(finite(world), `${id}: no NaN`);
    assert.ok(setup.figures.length >= 1 && world.fighters[setup.player], `${id}: its figures, the hero among them`);
    const words = play.lines.flatMap((line) => sceneWords(line).map(({ word, who }) => `${word}:${who}`));
    if (words.some((word) => word.startsWith('dark'))) assert.ok(blackest > 0.95, `${id}: the dark comes down`);
    // Laid down in the dark: every man the script fells is out, lying (his head low).
    for (const word of words.filter((each) => each.startsWith('fall:'))) {
      const who = word.slice(5);
      for (const figure of setup.figures.filter((each) => each.who === who || String(each.who).startsWith(`${who}-`))) {
        const fighter = world.fighters[figure.index];
        assert.equal(fighter.state, 'out', `${id}: ${figure.who} fallen`);
        assert.ok(fighter.x[P.head * 3 + 1] < 0.4, `${id}: ${figure.who} lying`);
      }
    }
  }
  // Jin at the pole is there though the life has him dead already (the card before the scene killed him), bowed, his hands bound.
  const drill = lifeAt(5, { effects: { flags: { jinExecuted: true }, dies: { jin: 'executed' } } });
  const setup = storySetSetup(STORY_SETS.drillGround, drill, { year: 1595 });
  assert.ok(setup.comrades.jin !== undefined, 'Jin in the row');
  // Jin dead in Korea: not in the row of the strangers' scene.
  const korea = lifeAt(5, { fell: ['jin'] });
  assert.equal(storySetSetup(STORY_SETS.drillGroundOthers, korea, { year: 1595 }).comrades.jin, undefined);
});

test('the homecoming: the girl comes to him if he waited, and he gets up and goes to her if he did not', () => {
  const chapter = CHAPTERS.find((each) => each.n === 6);
  const sceneDef = chapter.scenes.find((scene) => scene.id === 'liaodong-homecoming');
  const waited = playSet(sceneDef, lifeAt(6, { effects: { ...family, flags: { married: true, waitedForAhe: true } } }), { year: sceneDef.year });
  const at = (result, who) => result.world.fighters[result.setup.comrades[who]];
  const gap = (result) => Math.hypot(at(result, 'daughter').root[0] - at(result, 'hero').root[0], at(result, 'daughter').root[1] - at(result, 'hero').root[1]);
  assert.ok(gap(waited) < 1.6, `she came to him (${gap(waited).toFixed(2)} m)`);
  const lifted = playSet(sceneDef, lifeAt(6, { effects: family }), { year: sceneDef.year });
  const daughter = lifted.setup.figures.find((figure) => figure.who === 'daughter');
  assert.ok(Math.hypot(at(lifted, 'daughter').root[0] - daughter.at[0], at(lifted, 'daughter').root[1] - daughter.at[1]) < 0.5, 'she stayed by her mother');
  assert.ok(!at(lifted, 'hero').kneel && gap(lifted) < 1.6, `he got up and went to her (${gap(lifted).toFixed(2)} m)`);
  assert.equal(waited.play.lines.length, lifted.play.lines.length, 'one ending line each');
});

test('the runner: a scene after its card, a fatal choice\'s scene before its page, and the finale before the last page', () => {
  // Ulsan: the drill ground plays as soon as the card of Jin at the pole is answered.
  const ulsan = CHAPTERS.find((each) => each.n === 5);
  const run = createChapterRun(lifeAt(4, {}), ulsan, { battles: STORY_BATTLES, comrades: COMRADES, flashbacks: FLASHBACKS });
  assert.equal(storyCurrent(run).card.id, 'ulsan-shimenzhai');
  storyAnswer(run, 1);
  assert.equal(storyCurrent(run).card.id, 'ulsan-jin');
  storyAnswer(run, 0);
  assert.equal(storyCurrent(run).kind, 'scene');
  assert.equal(storyCurrent(run).scene.id, 'ulsan-drillground');
  assert.equal(storySceneDone(run).kind, 'card');
  // He goes to the drill ground: his own execution staged, then his page.
  const fatal = createChapterRun(lifeAt(4, {}), ulsan, { battles: STORY_BATTLES, comrades: COMRADES });
  storyAnswer(fatal, 0);
  assert.equal(storyCurrent(fatal).scene?.id, 'ulsan-drillground-self');
  assert.equal(storySceneDone(fatal).kind, 'dead');
  // Sarhu: the pole as the oath is read.
  const sarhu = CHAPTERS.find((each) => each.n === 7);
  const oath = createChapterRun(lifeAt(6, {}), sarhu, { battles: STORY_BATTLES, comrades: COMRADES });
  while (storyCurrent(oath).kind === 'card' && storyCurrent(oath).card.id !== 'sarhu-oath') storyAnswer(oath, 0);
  storyAnswer(oath, 0);
  assert.equal(storyCurrent(oath).scene?.id, 'sarhu-pole');
  // The Hun River: fallen in the battle, the finale and then a death page; through it, the finale and the life's last page.
  const hun = CHAPTERS.find((each) => each.n === 8);
  for (const fell of [true, false]) {
    const last = createChapterRun(lifeAt(7, {}), hun, { battles: STORY_BATTLES, comrades: COMRADES, flashbacks: FLASHBACKS });
    while (storyCurrent(last).kind === 'card') storyAnswer(last, 0);
    assert.equal(storyCurrent(last).kind, 'battle');
    storyBattleDone(last, { hero: fell ? 'out' : 'alive', leftPlace: false, won: false, comrades: {} });
    for (let guard = 0; guard < 40 && storyCurrent(last).kind !== 'finale'; guard += 1) {
      const now = storyCurrent(last);
      if (now.kind === 'card') storyAnswer(last, 0);
      else if (now.kind === 'scene') storySceneDone(last);
    }
    const now = storyCurrent(last);
    assert.equal(now.kind, 'finale', fell ? 'fallen: the finale' : 'through it: the finale');
    assert.ok(now.flashbacks.length);
    const page = storyFinaleDone(last);
    assert.equal(page.kind, 'dead');
    assert.equal(page.page.finale, true);
    assert.equal(page.page.kind, fell ? 'battle' : 'lived');
  }
});

/** The ids the finale shows a life. */
const finaleIds = (life) => finaleShots(life, FLASHBACKS).map((shot) => shot.id ?? shot.kind);

test('the finale\'s flashbacks: the same for a life, different between lives, kept to what the life allows, in the order he lived them', () => {
  const plain = () => lifeAt(8, {});
  assert.deepEqual(finaleIds(plain()), finaleIds(plain()), 'the same life sees the same');
  const lives = {
    plain: plain(),
    family: lifeAt(8, { effects: { family: { wife: true, son: true, daughter: true }, flags: { married: true, waitedForAhe: true, letterRead: true, aheWarmedHands: true } } }),
    jin: lifeAt(8, { seed: 9, effects: { flags: { jinExecuted: true, single: true }, dies: { jin: 'executed' } } }),
    dead: lifeAt(8, { seed: 13, effects: { dies: { wang: 'killed', lou: 'killed', ye: 'killed', he: 'killed' } } }),
    otherMan: lifeAt(8, { seed: 77 }),
  };
  const seen = Object.fromEntries(Object.entries(lives).map(([key, life]) => [key, finaleIds(life)]));
  assert.equal(new Set(Object.values(seen).map((ids) => ids.join(','))).size, Object.keys(seen).length, `each life its own: ${JSON.stringify(seen)}`);
  for (const [key, life] of Object.entries(lives)) {
    const { drawn, last } = finaleFlashbacks(life, FLASHBACKS);
    // Only what the life allows.
    for (const entry of drawn) assert.ok(entry.when(life), `${key}: ${entry.id} is this life's`);
    // His brother, always.
    assert.ok(drawn.some((entry) => STORY_FINALE.keep[0].includes(entry.id)), `${key}: his brother`);
    // One of the slightly beautiful moments.
    assert.ok(drawn.some((entry) => entry.tone === 'beautiful'), `${key}: a beautiful moment`);
    // In the order he lived them.
    const years = drawn.map((entry) => STORY_FINALE.memories[entry.id]?.year ?? 0);
    assert.deepEqual(years, [...years].sort((a, b) => a - b), `${key}: in order`);
    // The last lines: the waist tag, then the letter (read to him, or never).
    assert.deepEqual(last.map((entry) => entry.id), ['fb-last-tag', life.flags.letterRead ? 'fb-last-letter' : 'fb-last-unread']);
    // Every moment has its set.
    for (const shot of finaleShots(life, FLASHBACKS)) if (shot.set) assert.ok(STORY_SETS[shot.set], `${key}: ${shot.id} on set ${shot.set}`);
  }
  assert.ok(seen.jin.includes('fb-jin-pole'), 'Jin at the pole, if he died there');
  assert.ok(!seen.plain.includes('fb-jin-pole') && !seen.dead.includes('fb-jin-pole'), 'not if he did not');
  assert.ok(seen.family.some((id) => STORY_FINALE.keep[2].includes(id)), 'the family, if he had one');
  assert.ok(!seen.plain.some((id) => ['fb-cotton', 'fb-children', 'fb-ahe-wait', 'fb-ahe-lift', 'fb-ahe-hands'].includes(id)), 'no family he never had');
  assert.ok(seen.dead.some((id) => STORY_FINALE.keep[3].includes(id)), 'a comrade who died');
  // The shots: the field first, returns to it between, the last field on the tag, the letter on black last.
  for (const ids of Object.values(seen)) {
    assert.equal(ids[0], 'field');
    assert.ok(ids.filter((id) => id === 'field').length >= 2);
    assert.equal(ids[ids.length - 2], 'fb-last-tag');
    assert.ok(['fb-last-letter', 'fb-last-unread'].includes(ids[ids.length - 1]));
  }
});

test('the finale plays to its end: every shot\'s set built and posed for its life, the screen dark between, the letter on black', () => {
  const life = lifeAt(8, { effects: { ...family, flags: { married: true, waitedForAhe: true, letterRead: true, jinExecuted: true }, dies: { jin: 'executed' } }, fell: ['shen', 'lou'] });
  const shots = finaleShots(life, FLASHBACKS);
  for (const shot of shots.filter((each) => each.set)) {
    const setup = storySetSetup(STORY_SETS[shot.set], life, { year: shot.year ?? 1621, memory: shot.kind === 'memory', alias: shot.alias ?? {} });
    const world = createWorld(setup.fighters, setup.options);
    const figures = stageSetFigures(world, setup.figures.map((figure) => ({ ...figure, pose: shot.poses?.[figure.who] ?? figure.pose })));
    for (let t = 0; t < 1; t += 1 / 30) advance(world, 1 / 30, () => poseSetFigures(world, figures, t));
    assert.ok(finite(world), `${shot.id ?? shot.kind}: no NaN`);
  }
  // The field after: his comrades who fell in this battle lie by him; one who died long ago does not.
  const field = storySetSetup(STORY_SETS.field, life, { year: 1621 });
  assert.ok(field.comrades.shen !== undefined && field.comrades.lou !== undefined);
  assert.equal(field.comrades.jin, undefined);
  const seconds = { en: finaleSeconds(shots, 'en'), zh: finaleSeconds(shots, 'zh') };
  assert.ok(seconds.en > 60 && seconds.en < 300 && seconds.zh > 60 && seconds.zh < 300, `two to four minutes or so (${seconds.en.toFixed(0)} s, ${seconds.zh.toFixed(0)} s)`);
  for (const language of ['en', 'zh']) {
    const play = createFinalePlay(shots, { language });
    const begun = [];
    let darkBetween = true;
    for (let t = 0; t < 400 && !play.done; t += 0.05) {
      for (const due of stepFinale(play, 0.05)) if (due.shot !== undefined) begun.push(due.shot);
      const look = finaleLook(play);
      for (const key of ['black', 'grey', 'dim', 'vignette']) assert.ok(look[key] >= 0 && look[key] <= 1, `${key} ${look[key]}`);
      // (A shot opens out of the dark: just after it begins, the screen is black.)
      if (begun.length > 1 && play.into < 0.05 && look.black < 0.9 && !shots[play.index].first) darkBetween = false;
      if (play.index === shots.length - 1) assert.equal(look.black, 1, 'the letter on black');
    }
    assert.ok(play.done, `${language}: played to its end`);
    assert.deepEqual(begun, shots.map((_, index) => index));
    assert.ok(darkBetween, 'dark between the shots');
  }
});
