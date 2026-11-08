// Story mode: playing a chapter. Pure (no DOM): the page (src/story/storyview.js) and the tests (test/story-runner.test.js) drive
// the same machine. A chapter goes
//
//   before   its before-cards, each as its `when` allows (narration, or a choice whose effects the life takes; a fatal one ends it)
//   deploy   (a battle with a `deploy` his rank may choose in: src/story/deploy.js) its formation and his place, chosen
//   battle   the world built from the battle's setup, the hero the player (army orders as his rank allows: storyCommandMen),
//            watched as it goes (storyWatchStep: has he left his place?) and over by storyBattleOver
//   judged   the outcome read generically (storyReadOutcome: the hero alive, fallen or fled; how long he was out of his place;
//            each named man's fate), written into the life (who fell, and how), and a judgement card if he left his place
//            (the chapter's own, or STORY_JUDGEMENT: charged, flogged or executed, by Qi Jiguang's law)
//   after    its after-cards (they may read the outcome: when(life, outcome))
//   scenes   its scenes at 'after' (each as its `when` allows), played by the page on the battle's own field (or on a set of
//            their own: scenes/sets.js)
//   finale   (the last chapter, `finale`): he lies dying, and the life comes back to him (scenes/finale.js), then the page
//   done     the chapter lived through (his luck counts it), and the next chapter, or the end of the life
// and a death anywhere (the battle, a fatal choice, the judgement) ends it on the ending page (life.js storyDie).
// A scene `at: 'before'` plays before the chapter's first card, or (`after: <card id>`) as soon as that card is answered, if its
// `when` holds then; a fatal choice's `scene` (the chapter's scene of that id) plays before its page.
// `storyRunBattle` fights a chapter's battle headless (Node): the hero thinks for himself as every man does (ai.js).

import { P } from '../body.js';
import { thinkAll } from '../ai.js';
import { judgeBattle } from '../battleend.js';
import { slotAt } from '../formation.js';
import { advance, createWorld, inFight } from '../physics.js';
import { storyApplyEffects, storyChoose, storyCreditBattle, storyDie, storyEnterChapter, storyLivedThrough, storyMarkDead, storyPassChapter } from './life.js';
import { storyGradeOf, storyRankOf } from './ranks.js';
import { storyDeployOffer, storyDeployResolve } from './deploy.js';

export const STORY_RUN = {
  // Left his place: further than `metres` from where his rank and file put him, for `seconds` together, while the battle is
  // undecided. 8 m: a column's whole depth and a rank more (the ladder columns' five ranks at 1.6 m are 6.4 m deep), as far as
  // a man is carried when his column bunches up at a ladder's foot or a press pushes it about; past it he has gone (forward
  // after a runner, or back out of the line). 10 s: time to walk those 8 m back at the drill's pace (formation.js DRILL.pace,
  // 0.8 m/s), so a man knocked or pushed out of his place who makes his way back is never counted as having left it.
  leftPlace: { metres: 8, seconds: 10 },
  // Ahead or back of his place: the share of the offset along the line's front (toward the enemy) that makes it one or the other.
  ahead: 0.3,
  // His place where his side has no formation (storyPlaceOf): carried with the men nearest it at the start, this many (two ranks
  // of a column four abreast: his own and the next; enough that one man running ahead or falling moves it little).
  placeMates: 8,
  // When a battle is over for the story: the hero down this long (s: the fall seen, the camera on him); the battle decided
  // (battleend.js) this long (the field seen as it ends); or the battle's own `seconds`.
  heroDownSeconds: 3,
  decidedSeconds: 6,
  // The headless step (s), as tools/levels.js steps a level.
  step: 0.1,
};

// What every chapter's judgement may fall back on: by the law of Qi Jiguang's armies (his Jixiao xinshu 纪效新书, the drill and
// the prohibitions every southern army kept after him): a man who leaves his place is charged before his officer; one who falls
// back out of the line is flogged with the military staff (军棍); one who flees the field is put to death.
export const STORY_JUDGEMENT = {
  ahead: {
    id: 'judgement-ahead',
    text: {
      zh: '仗后，他被叫到百户面前。他擅自离开了队列去追人。按戚继光定下的军法，记过一次。',
      en: 'After the battle he is called before the commander. He left the line to go after men on his own. By the law Qi Jiguang set down, a charge is written against his name.',
    },
    choices: [{ text: { zh: '认罪。', en: 'He accepts it.' }, effects: { flags: { charged: true } } }],
  },
  back: {
    id: 'judgement-back',
    text: {
      zh: '仗后，他被叫到百户面前。他从队列里退了下来。按戚继光的军法，退者当斩；念他初次上阵，打军棍。',
      en: 'After the battle he is called before the commander. He fell back out of the line. By Qi Jiguang\'s law the man who falls back dies; for a first battle, the commander has him flogged with the military staff (军棍) instead.',
    },
    choices: [{ text: { zh: '挨打。', en: 'He takes the flogging.' }, effects: { flags: { flogged: true }, place: 'front' } }],
  },
  fled: {
    id: 'judgement-fled',
    text: {
      zh: '他逃离了战场。他们在路上找到了他。按军法，临阵脱逃者斩。',
      en: 'He ran from the field. They found him on the road. By the law of the army, the man who flees battle is beheaded.',
    },
    choices: [{ text: { zh: '……', en: '…' }, effects: {}, fatal: { how: 'executed', text: { zh: '他被斩首，首级示众。', en: 'He was beheaded, and his head shown to the company.' } } }],
  },
};

// The ways a man goes out of a battle, in words both ways (physics.js knockOut kinds; battletally.js counts the senseless
// left on the field as dead, as a battlefield does).
const STORY_FALLS = {
  killed: { zh: '被杀', en: 'killed' },
  bledOut: { zh: '流血而死', en: 'bled to death' },
  died: { zh: '伤重而死', en: 'died of his wounds' },
  drowned: { zh: '淹死', en: 'drowned' },
  knockout: { zh: '被打昏在地，死在原地', en: 'knocked senseless and left to die where he lay' },
  out: { zh: '伤重倒地，死在原地', en: 'cut down past going on, and left where he lay' },
  severed: { zh: '被砍倒', en: 'cut down' },
  // Left on the field wounded, his side beaten: the winners go over it after (the story's chapters say who did it).
  finished: { zh: '受伤倒在地上，没能离开', en: 'left wounded on the field, and never left it' },
  fell: { zh: '倒在战场上', en: 'fell on the field' },
};
const STORY_OUT_KINDS = new Set(Object.keys(STORY_FALLS));

const storyAt = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];

/** A chapter after `n` that there is (the registry may have gaps), or null. */
export function storyNextChapter(chapters, n) {
  return chapters.filter((chapter) => chapter.n > n).sort((a, b) => a.n - b.n)[0] ?? null;
}

/** Whether a card or scene is for this moment (its `when`, given the life and the outcome; no `when` is always). A `when` that throws is not. */
function storyWhen(item, life, outcome) {
  if (typeof item?.when !== 'function') return true;
  try {
    return Boolean(item.when(life, outcome));
  } catch {
    return false;
  }
}

/** Begin a chapter for this life: it is entered (its year, his age, who joins him, the checkpoint), its before-cards first. */
export function createChapterRun(life, chapter, { battles = {}, comrades = [], flashbacks = [] } = {}) {
  storyEnterChapter(life, chapter, { comrades });
  const run = { life, chapter, battle: battles[chapter.battle] ?? null, deploy: null, phase: 'before', index: 0, outcome: null, setup: null, death: null, queue: [], scene: null, sceneIndex: 0, pending: [], flashbacks, dying: null };
  // The scenes before any card.
  storyQueueScenes(run, (scene) => scene.at === 'before' && !scene.after);
  return run;
}

/** Queue the chapter's scenes that `pick` chooses (and whose `when` holds now) to play next, before anything else. */
function storyQueueScenes(run, pick) {
  for (const scene of run.chapter.scenes ?? []) if (pick(scene) && storyWhen(scene, run.life, run.outcome)) run.pending.push(scene);
}

/** The cards of a phase still to come, as their `when` allows now. */
function storyCardsOf(run, phase) {
  if (phase === 'before') return run.chapter.before ?? [];
  if (phase === 'judged') return run.queue;
  if (phase === 'after') return run.chapter.after ?? [];
  return [];
}

/**
 * What the chapter asks for now: { kind: 'card', card } | { kind: 'deploy', offer } | { kind: 'battle' } | { kind: 'scene', scene } | { kind: 'done' } |
 * { kind: 'dead', page }. Moves past cards whose `when` says no, and phases with nothing in them.
 */
export function storyCurrent(run) {
  for (;;) {
    // A scene a card or a fatal choice brought on plays before whatever comes next (the page of a death too).
    if (run.pending?.length) return { kind: 'scene', scene: run.pending[0] };
    if (run.phase === 'finale') return { kind: 'finale', dying: run.dying, flashbacks: run.flashbacks ?? [] };
    if (run.phase === 'dead') return { kind: 'dead', page: run.death };
    if (run.phase === 'done') return { kind: 'done' };
    if (run.phase === 'before' || run.phase === 'judged' || run.phase === 'after') {
      const cards = storyCardsOf(run, run.phase);
      while (run.index < cards.length && !storyWhen(cards[run.index], run.life, run.outcome)) run.index += 1;
      if (run.index < cards.length) return { kind: 'card', card: cards[run.index] };
      run.phase = { before: 'deploy', judged: 'after', after: 'scenes' }[run.phase];
      run.index = 0;
      if (run.phase === 'deploy' && !run.battle) run.phase = 'judged';
      continue;
    }
    // Drawing up his men, where the battle offers it to a man of his rank (deploy.js); else on to the battle.
    if (run.phase === 'deploy') {
      const offer = run.deploy ? null : storyDeployOffer(run.battle, run.life);
      if (offer) return { kind: 'deploy', offer };
      run.phase = 'battle';
      continue;
    }
    if (run.phase === 'battle') return { kind: 'battle', battle: run.battle };
    if (run.phase === 'scenes') {
      const scenes = (run.chapter.scenes ?? []).filter((scene) => (scene.at ?? 'after') === 'after');
      while (run.sceneIndex < scenes.length && !storyWhen(scenes[run.sceneIndex], run.life, run.outcome)) run.sceneIndex += 1;
      if (run.sceneIndex < scenes.length) return { kind: 'scene', scene: scenes[run.sceneIndex] };
      storyPassChapter(run.life, run.chapter.n);
      // The last chapter does not end with him walking away from it: the night takes him where he stands (its after-cards
      // say so), and the finale is his.
      if (run.chapter.finale) {
        run.dying = { kind: 'lived' };
        run.phase = 'finale';
        continue;
      }
      run.phase = 'done';
      continue;
    }
    return { kind: 'done' };
  }
}

/** The before-scenes of a chapter (played over its still scene before its cards), as their `when` allows. */
export function storyScenesBefore(run) {
  return (run.chapter.scenes ?? []).filter((scene) => scene.at === 'before' && storyWhen(scene, run.life, run.outcome));
}

/**
 * Answer the card now: `choice` its index (a narration card takes none). Its effects go into the life; a fatal choice ends the
 * life there (its death page). Returns what is current after it.
 */
export function storyAnswer(run, choice = 0) {
  const current = storyCurrent(run);
  if (current.kind !== 'card') return current;
  // (A narration card may carry effects of its own: the merit a report keeps back from him.)
  if (current.card.effects) storyApplyEffects(run.life, current.card.effects);
  const { fatal } = current.card.choices?.length ? storyChoose(run.life, current.card, choice) : { fatal: null };
  run.index += 1;
  if (fatal) {
    storyEnd(run, { kind: 'fatal', how: fatal.how, text: fatal.text ?? run.chapter.ending?.text, where: run.chapter.title });
    // The death itself, staged (the drill ground, the pole), before its page.
    if (fatal.scene) storyQueueScenes(run, (scene) => scene.id === fatal.scene);
  } else if (run.phase === 'before') storyQueueScenes(run, (scene) => scene.at === 'before' && scene.after === current.card.id);
  return storyCurrent(run);
}

/** His men drawn up (`chosen`: { formation?, post? }; deploy.js gives the defaults for the rest): on to the battle. */
export function storyDeploy(run, chosen = null) {
  if (storyCurrent(run).kind !== 'deploy') return storyCurrent(run);
  run.deploy = storyDeployResolve(run.battle, run.life, chosen);
  return storyCurrent(run);
}

/** The scene now is played: on to the next. */
export function storySceneDone(run) {
  if (run.pending?.length) run.pending.shift();
  else if (storyCurrent(run).kind === 'scene') run.sceneIndex += 1;
  return storyCurrent(run);
}

/**
 * The finale is played (he has died, the life seen again): his page. Fallen in the battle, a death at this chapter as any other
 * (the retry is the player's); through the battle and taken by the night, the life lived to its end.
 */
export function storyFinaleDone(run) {
  if (run.phase !== 'finale') return storyCurrent(run);
  const dying = run.dying ?? { kind: 'lived' };
  run.dying = null;
  if (dying.kind === 'lived') {
    run.death = storyLivedThrough(run.life, { where: run.chapter.title, text: run.chapter.ending?.lived ?? run.chapter.ending?.text ?? null });
    run.death.finale = true;
    run.phase = 'dead';
  } else {
    storyEnd(run, dying);
    run.death.finale = true;
  }
  return storyCurrent(run);
}

/** End the life in this chapter: its ending page (life.js storyDie). */
function storyEnd(run, death) {
  run.death = storyDie(run.life, death);
  run.phase = 'dead';
  return run.death;
}

/** The life lived through every chapter there is: its last page. */
export function storyLifeLived(run) {
  if (run.phase === 'dead' && run.death) return run.death;
  run.death = storyLivedThrough(run.life, { where: run.chapter.title, text: run.chapter.ending?.lived ?? null });
  return run.death;
}

// ---- The battle -----------------------------------------------------------------------------------------------------------

/** The battle's setup for this life at a seed (the battle file's `setup`, with his men as drawn up: `deploy`, else the run's), kept on the run. */
export function storyBattleSetup(run, seed = 1, deploy = run.deploy) {
  run.setup = run.battle.setup(run.life, seed, deploy ? { deploy } : {});
  // His family the battle cast (his brother in the column): kept as the battle made them, so later scenes stage the same man.
  for (const [who, index] of Object.entries(run.setup.comrades ?? {})) {
    const member = run.life.family?.[who];
    if (member && typeof member === 'object' && !member.inputs && run.setup.fighters[index]) member.inputs = structuredClone(run.setup.fighters[index].inputs);
  }
  // How it is shown ({ scene, weather, camera }): the setup's, else the battle's own (a battle may give it once for all setups).
  run.setup.view ??= run.battle.view ?? null;
  run.seed = seed;
  return run.setup;
}

/**
 * The world for a setup (createWorld), the orders his rank lets him give set on it; the battle seen through him (ai.js
 * AI.perceive: the men he cannot see deciding decide at a slower beat), headless as when played.
 */
export function storyBattleWorld(setup, life) {
  const world = createWorld(setup.fighters, setup.options);
  world.perceiver = setup.player;
  storyCommandMen(world, setup, life);
  return world;
}

/**
 * Whom he commands (command.js `world.commandMen`), as his rank says (ranks.js STORY_RANKS `men`): a private soldier nobody
 * (he cannot order the army); a 甲长 his file's four, a 队长 his squad's eleven (the setup's `squad` where it has that many,
 * else the nearest of his side), a 哨长 his platoon's forty-seven; a 哨官 and above his whole side.
 */
export function storyCommandMen(world, setup, life) {
  const hero = world.fighters[setup.player];
  if (!hero) return null;
  world.commandMen ??= {};
  const men = storyRankOf(storyGradeOf(life))?.men ?? 0;
  if (men === Infinity) {
    delete world.commandMen[hero.corner];
    return null;
  }
  if (men > 0) {
    const near = world.fighters.filter((fighter) => fighter.corner === hero.corner && fighter !== hero)
      .sort((a, b) => Math.hypot(...storyAt(a).map((v, i) => v - storyAt(hero)[i])) - Math.hypot(...storyAt(b).map((v, i) => v - storyAt(hero)[i])))
      .slice(0, men).map((fighter) => fighter.id);
    world.commandMen[hero.corner] = setup.squad?.length >= men ? setup.squad.slice(0, men) : near;
  } else world.commandMen[hero.corner] = [];
  return world.commandMen[hero.corner];
}

/** Watching where he stands, step by step: how long together he has been out of his place, and which way. */
export function storyWatch(setup) {
  return { away: 0, longest: 0, farthest: 0, way: null, toPlace: null, mates: null, carried: null, leftPlace: null, decidedAt: null, downAt: null, place: setup.slot ? [setup.slot.x, setup.slot.z] : null };
}

/**
 * His place now: his slot in his side's formation where it has one (it moves as the line moves); else where the setup stood
 * him, carried as far as the men round him there have gone (a side with no drill, as the Korea battles' columns: they cross
 * the ground and go up the ladders each on his own, and his place is in among them, not on the form-up line). The men round
 * him (STORY_RUN.placeMates) are picked the first time it is asked, as they stand then; those down or fled no longer count.
 */
export function storyPlaceOf(world, hero, watch) {
  const formation = hero.slot ? world.formations?.[hero.formation] : null;
  if (formation) return slotAt(formation, hero.slot);
  if (!watch.place) return null;
  watch.mates ??= world.fighters
    .filter((fighter) => fighter !== hero && fighter.corner === hero.corner && fighter.state !== 'out' && !fighter.mount)
    .map((fighter) => ({ id: fighter.id, from: storyAt(fighter) }))
    .sort((a, b) => Math.hypot(a.from[0] - watch.place[0], a.from[1] - watch.place[1]) - Math.hypot(b.from[0] - watch.place[0], b.from[1] - watch.place[1]))
    .slice(0, STORY_RUN.placeMates);
  const going = watch.mates.filter((mate) => world.fighters[mate.id]?.state !== 'out' && !world.fighters[mate.id]?.fled);
  if (!going.length) return watch.carried ?? watch.place;
  const moved = [0, 1].map((k) => going.reduce((sum, mate) => sum + storyAt(world.fighters[mate.id])[k] - mate.from[k], 0) / going.length);
  watch.carried = [watch.place[0] + moved[0], watch.place[1] + moved[1]];
  return watch.carried;
}

// A storm of walls: the column's duty is forward, to its ladder's foot, up it and onto the walk, so being ahead of his slot is
// not being out of it there; only falling back counts, or going aside further than STORY_RUN.leftPlace.metres (along the wall
// past the next ladder: the stories' ladders stand 5-6 m apart).
/** Whether a setup is a storm of walls: its own `storm`, else ladders among its field's works. */
export const storyIsStorm = (setup) => setup.storm ?? Boolean(setup.options?.arena?.works?.ladders?.length);

/** One step of watching (`dt` s): his distance from his place, counted while he is up and the battle undecided. */
export function storyWatchStep(watch, world, setup, dt) {
  const hero = world.fighters[setup.player];
  if (!hero) return watch;
  const decided = Boolean(judgeBattle(world));
  if (decided) watch.decidedAt ??= world.time;
  if (hero.state === 'out' && !hero.fled) watch.downAt ??= world.time;
  const place = storyPlaceOf(world, hero, watch);
  if (!place || decided || hero.state === 'out') {
    watch.away = 0;
    return watch;
  }
  const at = storyAt(hero);
  const offset = [at[0] - place[0], at[1] - place[1]];
  const distance = Math.hypot(offset[0], offset[1]);
  // His line's front (toward the enemy) and its right hand (forward × up, x and z), to say which way his place is.
  const formation = hero.slot ? world.formations?.[hero.formation] : null;
  const forward = formation?.forward ?? [hero.corner === 'red' ? 1 : -1, 0];
  const right = [-forward[1], forward[0]];
  const ahead = offset[0] * forward[0] + offset[1] * forward[1];
  const aside = offset[0] * right[0] + offset[1] * right[1];
  // (In a storm, how far ahead he is does not count: only how far back or aside.)
  const counted = storyIsStorm(setup) && ahead > 0 ? Math.abs(aside) : distance;
  watch.distance = distance;
  // Where his place is from him, in his line's terms (m ahead of him, m to his right): the page says so.
  watch.toPlace = { ahead: -ahead, right: -aside };
  if (counted <= STORY_RUN.leftPlace.metres) {
    watch.away = 0;
    return watch;
  }
  watch.away += dt;
  watch.farthest = Math.max(watch.farthest, distance);
  // Which way: along his line's front (toward the enemy), or back from it.
  const along = ahead / distance;
  const way = along > STORY_RUN.ahead ? 'ahead' : along < -STORY_RUN.ahead ? 'back' : 'aside';
  watch.way = way;
  if (watch.away > watch.longest) watch.longest = watch.away;
  if (watch.away >= STORY_RUN.leftPlace.seconds && !watch.leftPlace) watch.leftPlace = { way: way === 'aside' ? 'back' : way, seconds: watch.away, metres: distance, at: world.time };
  if (watch.leftPlace) Object.assign(watch.leftPlace, { seconds: Math.max(watch.leftPlace.seconds, watch.away), metres: Math.max(watch.leftPlace.metres, distance) });
  return watch;
}

/** Whether the battle is over for the story: him down a while, or fled; its time up; its own `ends`, else the battle decided a while. */
export function storyBattleOver(world, setup, watch, battle) {
  const hero = world.fighters[setup.player];
  if (!hero) return true;
  if (hero.fled) return true;
  if (watch.downAt !== null && world.time - watch.downAt >= STORY_RUN.heroDownSeconds) return true;
  if (world.time >= (battle?.seconds ?? Infinity)) return true;
  // A battle that says when it is over (its `ends`) is over then; else the battle decided a while.
  if (typeof battle?.ends === 'function') return Boolean(battle.ends(world));
  return watch.decidedAt !== null && world.time - watch.decidedAt >= STORY_RUN.decidedSeconds;
}

/** A man's name both ways (the setup's names, else his inputs' name). */
function storyNameOf(world, setup, id) {
  return setup.names?.[id] ?? { zh: world.fighters[id]?.body.inputs.name ?? '', en: world.fighters[id]?.body.inputs.name ?? '' };
}

/** How a man went out: the event that put him out (its kind, its words, who did it), both ways. */
function storyFallOf(world, setup, fighter) {
  const event = [...world.events].reverse().find((each) => each.fighter === fighter.id && STORY_OUT_KINDS.has(each.kind));
  const kind = event?.kind ?? 'fell';
  const words = STORY_FALLS[kind] ?? STORY_FALLS.fell;
  const by = event && Number.isInteger(event.attacker) && event.attacker !== fighter.id ? world.fighters[event.attacker] : null;
  const attacker = by ? storyNameOf(world, setup, by.id) : null;
  // (By one of his own: an arrow from the rank behind, a spear in the press.)
  const own = by && by.corner === fighter.corner;
  const text = !attacker ? { ...words }
    : own ? { zh: `${words.zh}。下手的是自己人${attacker.zh}`, en: `${words.en}, by one of his own, ${attacker.en}` }
      : { zh: `${words.zh}。下手的是${attacker.zh}`, en: `${words.en}, by ${attacker.en}` };
  return { kind, reason: event?.effects?.[0] ?? null, by: attacker, text, time: event?.time ?? world.time };
}

/**
 * A man's fate in the battle: fell (out on the field: killed, or left senseless there, as battletally.js counts; or of the
 * beaten side and still on the field out of the fight at the end, crawling or unable to rise: the winners go over the field
 * after a battle), fled, or lived.
 */
function storyFateOf(world, setup, id) {
  const fighter = world.fighters[id];
  if (!fighter) return null;
  const fled = Boolean(fighter.fled);
  const verdict = judgeBattle(world);
  const beaten = verdict?.winner && verdict.winner !== fighter.corner;
  const left = !fled && fighter.state !== 'out' && beaten && !inFight(fighter);
  const fell = (fighter.state === 'out' && !fled) || left;
  const how = !fell ? null : left ? { kind: 'finished', reason: null, by: null, text: { ...STORY_FALLS.finished }, time: world.time } : storyFallOf(world, setup, fighter);
  return { fell, fled, alive: !fell, how, index: id };
}

/**
 * The battle as the story reads it, from the world as it ended, in the chapters' shape (src/story/chapters/kit.js):
 *   { hero: 'alive' | 'out' | 'fled', leftPlace: bool, won: bool, comrades: { [id]: 'alive' | 'out' | 'dead' } }
 * ('dead': a death among the events; 'out': down on the field or left on it, which a battlefield counts with the dead; a man
 * who fled is 'alive'), and beside it the detail the engine writes into the life and the pages: `detail.hero` (fell, fled,
 * how, kills, leftPlace { way, seconds, metres }) and `detail.comrades[id]` (fell, fled, how).
 */
export function storyReadOutcome(world, setup, watch) {
  const detail = storyReadDetail(world, setup, watch);
  const state = (fate) => (!fate?.fell ? 'alive' : STORY_DEATHS.has(fate.how?.kind) ? 'dead' : 'out');
  return {
    hero: detail.hero.fled ? 'fled' : detail.hero.fell ? 'out' : 'alive',
    leftPlace: Boolean(detail.hero.leftPlace),
    won: detail.won,
    // The man over him (the setup's `superior`) fell: his place is open.
    superiorFell: Boolean(detail.superior?.fell),
    comrades: Object.fromEntries(Object.entries(detail.comrades).map(([id, fate]) => [id, state(fate)])),
    detail,
  };
}

// The out kinds that are a death (battletally.js's), as against a man left senseless or past going on.
const STORY_DEATHS = new Set(['killed', 'bledOut', 'died', 'drowned']);

/** The battle in detail (storyReadOutcome's `detail`). */
function storyReadDetail(world, setup, watch) {
  const hero = world.fighters[setup.player];
  const fate = storyFateOf(world, setup, setup.player);
  const kills = world.events.filter((event) => event.attacker === hero.id && STORY_OUT_KINDS.has(event.kind) && event.fighter !== hero.id && world.fighters[event.fighter]?.corner !== hero.corner);
  const killed = new Set(kills.map((event) => event.fighter)).size;
  const verdict = judgeBattle(world);
  const comrades = Object.fromEntries(Object.entries(setup.comrades ?? {}).map(([id, index]) => [id, storyFateOf(world, setup, index)]));
  return {
    hero: { ...fate, kills: killed, leftPlace: watch?.leftPlace ? { ...watch.leftPlace } : null },
    comrades,
    superior: Number.isInteger(setup.superior) ? storyFateOf(world, setup, setup.superior) : null,
    won: verdict ? verdict.winner === hero.corner : null,
    verdict: verdict ? { winner: verdict.winner, how: verdict.how } : null,
    time: world.time,
  };
}

/**
 * The outcome into the life and the run: each named man who fell is dead in the story (and how); the hero fallen ends the life
 * on the chapter's ending page; fled, or out of his place, he is judged (the chapter's `judgement`, else STORY_JUDGEMENT).
 */
export function storyBattleDone(run, outcome) {
  run.outcome = outcome;
  const detail = outcome.detail ?? storyDetailOf(outcome);
  for (const [id, fate] of Object.entries(detail.comrades ?? {})) if (fate?.fell) storyMarkDead(run.life, id, { how: fate.how?.text ?? null });
  if (detail.hero.fell) {
    const death = { kind: 'battle', how: detail.hero.how?.text ?? null, text: run.chapter.ending?.text ?? null, where: run.chapter.title };
    // In the last chapter he lies dying first, and the life comes back to him (the finale); then the page.
    if (run.chapter.finale) {
      run.dying = death;
      run.phase = 'finale';
    } else storyEnd(run, death);
    return storyCurrent(run);
  }
  // What the battle puts on his books (ranks.js storyBattleMerit): the promotion cards read it, a report may keep it back.
  storyCreditBattle(run.life, outcome);
  const judgement = { ...STORY_JUDGEMENT, ...(run.chapter.judgement ?? {}) };
  // A chapter that judges a man out of his place among its own after-cards (an id ending '-judgement': kit.js
  // chapJudgementCard) is not judged twice; fleeing the field is always the army's to judge.
  const ownJudgement = (run.chapter.after ?? []).some((card) => String(card.id ?? '').endsWith('-judgement'));
  run.queue = [];
  if (detail.hero.fled) run.queue.push(judgement.fled);
  else if (detail.hero.leftPlace && !ownJudgement) run.queue.push(judgement[detail.hero.leftPlace.way] ?? judgement.back);
  run.phase = 'judged';
  run.index = 0;
  return storyCurrent(run);
}

/** The detail of an outcome given only in the chapters' shape (a test's stub): fell, fled and left his place from the words. */
function storyDetailOf(outcome) {
  const fate = (word) => ({ fell: word === 'out' || word === 'dead', fled: word === 'fled', alive: word === 'alive' || word === 'fled', how: word === 'dead' ? { kind: 'killed', text: { ...STORY_FALLS.killed } } : word === 'out' ? { kind: 'fell', text: { ...STORY_FALLS.fell } } : null });
  return {
    hero: { ...fate(outcome.hero), kills: outcome.kills ?? 0, leftPlace: outcome.leftPlace ? { way: outcome.leftWay ?? 'back', seconds: 0, metres: 0 } : null },
    comrades: Object.fromEntries(Object.entries(outcome.comrades ?? {}).map(([id, word]) => [id, fate(word)])),
    won: outcome.won ?? null,
    superior: outcome.superiorFell ? fate('dead') : null,
  };
}

/**
 * Fight a chapter's battle headless (Node, or a test): the setup's world stepped as tools/levels.js steps a level (every man
 * thinking for himself, the hero too), watched, until storyBattleOver; his men drawn up as `deploy` says, else as the battle's
 * defaults (deploy.js). Returns { world, setup, watch, outcome }.
 */
export function storyRunBattle(battle, life, seed = 1, { step = STORY_RUN.step, seconds = battle.seconds, deploy = null } = {}) {
  const setup = battle.setup(life, seed, deploy ? { deploy } : {});
  const world = storyBattleWorld(setup, life);
  const watch = storyWatch(setup);
  const limit = { ...battle, seconds };
  while (!storyBattleOver(world, setup, watch, limit)) {
    advance(world, step, (current, dt) => thinkAll(current, dt));
    storyWatchStep(watch, world, setup, step);
  }
  return { world, setup, watch, outcome: storyReadOutcome(world, setup, watch) };
}
