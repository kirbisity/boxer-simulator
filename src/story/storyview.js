// Story mode on the page: the Story entry's screen (the main menu's), its event cards over a still 3D scene (the chapter's battle
// field, its men drawn up, held still), the battle played as the hero (main.js runs it; this watches it through `tick`), the
// chapter's scenes (src/story/scenes/stage.js, filmed here: the bars, the dark, the lines, the camera), the ending pages (where he
// fell, who outlived him, his family, his luck, the lives lived), retry as the same man or begin a new one, and the 中文 / English
// switch (kept in this browser). The flow is src/story/runner.js's; the life is src/story/life.js's; nothing here decides anything.
//
// main.js gives `installStory` its hooks: closeMenus(), storage(), stage(setup, { paused }) (build and show a story world, the hero played),
// world(), pause(on), orbit() (the camera's orbit, to steer in a scene), watch(on) (the hero left to his own mind: the test bed's
// autoplay), home() (back to the menu). It calls back each frame: tick(world) after the world's steps, think(world) inside each
// step (a scene's posing), steer(dt) after the follow camera is placed; holding() says the hero is the scene's, not the player's.
// Test hooks: window.boxer.story (main.js puts `hooks` there).

import { CHAPTERS, COMRADES, FLASHBACKS, STORY_FAMILY, STORY_HERO } from './chapters/index.js';
import { STORY_BATTLES } from './battles/index.js';
import { STORY, storyApplyEffects, storyBeginAnew, storyEnterChapter, storyLoad, storyLuck, storyLuckText, storyMarkDead, storyNewLife, storyRetry, storySave, storyText } from './life.js';
import { storyGetLang, storyOnLang, storySetLang } from './language.js';
import { createChapterRun, storyAnswer, storyBattleDone, storyBattleOver, storyBattleSetup, storyCommandMen, storyCurrent, storyFinaleDone, storyLifeLived, storyNextChapter, storyReadOutcome, storySceneDone, storyWatch, storyWatchStep, STORY_RUN } from './runner.js';
import { knockOut } from '../physics.js';
import { P } from '../body.js';
import { createScenePlay, layDead, poseSetFigures, sceneFocus, sceneHeld, sceneLook, sceneThink, setFocus, skipSceneLine, stageSetFigures, stepScene } from './scenes/stage.js';
import { storySetSetup, STORY_SETS } from './scenes/sets.js';
import { createFinalePlay, finaleLook, finaleShots, skipFinale, stepFinale, STORY_FINALE } from './scenes/finale.js';

// The page's own words, both ways.
export const STORY_WORDS = {
  title: { zh: '军户', en: 'The Conscript' },
  subtitle: { zh: '一个明朝兵的一生，1587—1621。', en: 'One Ming soldier\'s life, 1587-1621.' },
  begin: { zh: '开始一生', en: 'Begin a life' },
  continue: { zh: '继续', en: 'Continue' },
  anew: { zh: '换一个人，从头开始', en: 'Begin a new man' },
  retry: { zh: '还是这个人，再来一次', en: 'Retry as the same man' },
  back: { zh: '返回', en: 'Back' },
  menu: { zh: '主菜单', en: 'Menu' },
  next: { zh: '继续', en: 'Continue' },
  chapterOf: { zh: (n) => `第 ${n} 章`, en: (n) => `Chapter ${n}` },
  year: { zh: (year) => `${year} 年`, en: (year) => String(year) },
  age: { zh: (age) => `${age} 岁`, en: (age) => `aged ${age}` },
  fell: { zh: '他倒下了', en: 'He fell' },
  lived: { zh: '他活过了这一生', en: 'He lived through it' },
  where: { zh: '倒在', en: 'Where he fell' },
  how: { zh: '怎么死的', en: 'How' },
  outlived: { zh: '比他活得久的人', en: 'Who outlived him' },
  nobody: { zh: '没有人。', en: 'Nobody.' },
  fallen: { zh: '先他而去的人', en: 'Who went before him' },
  family: { zh: '他的家人', en: 'His family' },
  luck: { zh: '他的运气', en: 'His luck' },
  lives: { zh: (n) => `这是第 ${n} 个人的一生。`, en: (n) => (n === 1 ? 'The first life lived.' : `Life ${n} of the lives lived.`) },
  record: { zh: '活过的人', en: 'The lives lived' },
  alive: { zh: '还活着', en: 'living' },
  dead: { zh: '已死', en: 'dead' },
  hold: { zh: '守住你在队列中的位置。你不能指挥别人。', en: 'Hold your place in the line. You command no one.' },
  holdSquad: { zh: '守住位置。你只能指挥你的一队人。', en: 'Hold your place. You command your squad alone.' },
  holdOfficer: { zh: '你指挥这一部人马。', en: 'You command the company.' },
  away: { zh: (s) => `你离开了自己的位置（${s} 秒）`, en: (s) => `You are out of your place in the line (${s} s)` },
  luckSoFar: { zh: '至今的运气', en: 'Luck so far' },
  noChapters: { zh: '还没有章节。', en: 'No chapters yet.' },
  skip: { zh: '点击继续', en: 'Tap to go on' },
  firstLast: { zh: '第一仗，就是最后一仗。', en: 'His first battle was his last.' },
  span: { zh: (born, died) => `${born}—${died}`, en: (born, died) => `${born}-${died}` },
  // How a man died, where a card gives it as a kind (`dies: { jin: 'executed' }`, a fatal choice's `how`).
  kinds: { executed: { zh: '被斩首', en: 'beheaded' } },
  cleanRun: { zh: '在这之前，每一仗他都是第一次就活了下来。', en: 'Every battle before this one, he came through at the first try.' },
};

const STORY_STYLE = `
#story-layer { position: fixed; inset: 0; z-index: 60; pointer-events: none; font-family: 'Noto Serif SC', 'Songti SC', Georgia, serif; color: #efe6d2; }
#story-layer > * { pointer-events: auto; }
#story-layer .sv-lang { position: absolute; top: calc(12px + env(safe-area-inset-top, 0px)); right: 14px; display: flex; gap: 2px; background: rgba(12,10,8,0.6); border: 1px solid rgba(239,230,210,0.25); border-radius: 18px; padding: 2px; z-index: 3; }
#story-layer .sv-lang button { background: none; border: 0; color: #cfc4ad; padding: 6px 11px; border-radius: 15px; font: inherit; font-size: 14px; cursor: pointer; }
#story-layer .sv-lang button.on { background: #efe6d2; color: #1b1712; }
#story-layer .sv-screen { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 30%, rgba(30,24,18,0.86), rgba(8,7,6,0.97)); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 24px 16px; text-align: center; overflow-y: auto; }
#story-layer .sv-screen h1 { font-size: clamp(34px, 7vw, 60px); letter-spacing: 0.12em; margin: 0; font-weight: 600; }
#story-layer .sv-screen p { margin: 0; color: #bdb29c; max-width: 34em; line-height: 1.6; }
#story-layer .sv-buttons { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; width: min(340px, 100%); }
#story-layer button.sv-go { background: rgba(239,230,210,0.08); color: #efe6d2; border: 1px solid rgba(239,230,210,0.35); border-radius: 6px; padding: 13px 16px; font: inherit; font-size: 17px; cursor: pointer; text-align: left; }
#story-layer button.sv-go:hover { background: rgba(239,230,210,0.16); }
#story-layer button.sv-go.main { background: #efe6d2; color: #1b1712; border-color: #efe6d2; }
#story-layer .sv-card-wrap { position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: center; padding: 16px 16px calc(28px + env(safe-area-inset-bottom, 0px)); background: linear-gradient(to top, rgba(6,5,4,0.85), rgba(6,5,4,0.15) 60%, rgba(6,5,4,0)); }
#story-layer .sv-card { width: min(640px, 100%); background: rgba(16,13,10,0.9); border: 1px solid rgba(239,230,210,0.22); border-radius: 8px; padding: 20px 22px 18px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
#story-layer .sv-kicker { font-size: 13px; letter-spacing: 0.14em; color: #a89c84; text-transform: uppercase; margin-bottom: 10px; }
#story-layer .sv-text { font-size: 19px; line-height: 1.7; margin: 0 0 14px; white-space: pre-line; }
#story-layer .sv-choices { display: flex; flex-direction: column; gap: 8px; }
#story-layer .sv-hud { position: absolute; top: calc(12px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%); background: rgba(12,10,8,0.62); border-radius: 6px; padding: 7px 14px; font-size: 14px; color: #ddd2bb; max-width: calc(100% - 180px); text-align: center; pointer-events: none; }
#story-layer .sv-hud b { display: block; font-size: 12px; letter-spacing: 0.12em; color: #a89c84; font-weight: 400; }
#story-layer .sv-hud .sv-away { color: #ff9b7a; display: block; margin-top: 3px; }
#story-layer .sv-scene { position: absolute; inset: 0; pointer-events: auto; }
#story-layer .sv-black { position: absolute; inset: 0; background: #000; opacity: 0; }
#story-layer .sv-bar { position: absolute; left: 0; right: 0; height: 12vh; background: #000; transform: scaleY(0); }
#story-layer .sv-bar.top { top: 0; transform-origin: top; }
#story-layer .sv-bar.bottom { bottom: 0; transform-origin: bottom; }
#story-layer .sv-line { position: absolute; left: 50%; bottom: 3vh; transform: translateX(-50%); width: min(760px, calc(100% - 32px)); text-align: center; font-size: clamp(17px, 2.4vw, 22px); line-height: 1.6; color: #f1e9d6; text-shadow: 0 1px 6px #000; min-height: 2em; transition: opacity 0.6s; }
#story-layer .sv-line.narrator { font-style: italic; color: #d9cfba; }
#story-layer .sv-vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.85) 100%); opacity: 0; pointer-events: none; }
#story-layer .sv-line.finale { color: #ece4d0; font-size: clamp(17px, 2.3vw, 21px); letter-spacing: 0.02em; }
#story-layer .sv-line.letter { bottom: auto; top: 50%; transform: translate(-50%, -50%); width: min(620px, calc(100% - 32px)); font-size: clamp(17px, 2.2vw, 20px); line-height: 1.9; color: #e8dfc8; }
#story-layer .sv-page { position: absolute; inset: 0; background: rgba(8,7,6,0.94); overflow-y: auto; display: flex; justify-content: center; padding: 48px 16px 32px; }
#story-layer .sv-page article { width: min(640px, 100%); }
#story-layer .sv-page h1 { font-size: clamp(30px, 6vw, 46px); margin: 0 0 4px; font-weight: 600; letter-spacing: 0.06em; }
#story-layer .sv-page h2 { font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: #a89c84; font-weight: 400; margin: 22px 0 6px; }
#story-layer .sv-page p { margin: 0 0 6px; line-height: 1.65; font-size: 17px; }
#story-layer .sv-page .sv-luck { font-size: 22px; color: #f3dca0; }
#story-layer .sv-page ul { margin: 0; padding: 0; list-style: none; line-height: 1.6; }
#story-layer .sv-page .sv-buttons { margin-top: 26px; }
body[data-game="story"] #restart { display: none !important; }
body.story-card .fight-ui, body.story-card .hud, body.story-card #icons, body.story-card .camera-bar, body.story-scene .fight-ui, body.story-scene .hud, body.story-scene #icons { visibility: hidden !important; }
@media (max-width: 520px) { #story-layer .sv-text { font-size: 17px; } #story-layer .sv-hud { max-width: calc(100% - 130px); font-size: 12px; } }
`;

const svEl = (tag, { dataset = null, ...props } = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  if (dataset) Object.assign(node.dataset, dataset);
  node.append(...children.filter((child) => child !== null && child !== undefined && child !== false));
  return node;
};

/** The story on the page. `hooks`: from main.js (see the head of this file). Returns what main.js calls, and the test hooks. */
export function installStory(hooks) {
  const style = svEl('style', { textContent: STORY_STYLE });
  document.head.append(style);
  const layer = svEl('div', { id: 'story-layer' });
  layer.hidden = true;
  document.body.append(layer);

  // The language: story/language.js's (one place, to be pointed at the game's own setting, src/i18n.js).
  let language = storyGetLang();
  storyOnLang((next) => {
    language = next;
    redraw?.();
  });
  let life = null;
  let run = null;
  let view = null;
  // The battle as it is fought: its setup, the watch on his place, the world's time at the last tick.
  let fight = null;
  // A scene playing: its play (scenes/stage.js) and its nodes; the finale (scenes/finale.js) as it plays.
  let scene = null;
  let finale = null;
  let autoplay = false;
  // What is on: 'screen' | 'card' | 'battle' | 'scene' | 'ending' | null; and how to draw it again (a language switch).
  let redraw = null;

  const say = (text) => storyText(text, language);
  const word = (key, ...args) => {
    const entry = STORY_WORDS[key][language] ?? STORY_WORDS[key].en;
    return typeof entry === 'function' ? entry(...args) : entry;
  };
  const save = () => storySave(hooks.storage(), life);

  function langSwitch() {
    const box = svEl('div', { className: 'sv-lang' });
    for (const [key, label] of [['zh', '中文'], ['en', 'English']]) {
      box.append(svEl('button', { type: 'button', textContent: label, className: key === language ? 'on' : '', onclick: () => setLanguage(key) }));
    }
    return box;
  }

  function setLanguage(next) {
    if (!STORY.languages.includes(next)) return language;
    return storySetLang(next);
  }

  /** Clear the layer and put this in it (with the language switch), or hide it. */
  function show(kind, ...nodes) {
    view = kind;
    layer.replaceChildren(...nodes, langSwitch());
    layer.hidden = kind === null;
    document.body.classList.toggle('story-card', kind === 'card' || kind === 'screen' || kind === 'ending');
    document.body.classList.toggle('story-scene', kind === 'scene');
  }

  // ---- The Story screen -----------------------------------------------------------------------------------------------

  function open() {
    hooks.closeMenus?.();
    life = storyLoad(hooks.storage());
    redraw = open;
    const buttons = svEl('div', { className: 'sv-buttons' });
    const playable = life && !life.dead && CHAPTERS.length;
    const fallen = life?.dead && life.dead.kind !== 'lived';
    if (playable) {
      const chapter = CHAPTERS.find((each) => each.n === life.chapter) ?? CHAPTERS[0];
      buttons.append(svEl('button', { type: 'button', className: 'sv-go main', textContent: `${word('continue')} · ${say(chapter.title)}`, onclick: () => beginChapter(chapter) }));
    } else if (fallen) {
      buttons.append(svEl('button', { type: 'button', className: 'sv-go main', textContent: word('retry'), onclick: retry }));
    }
    if (CHAPTERS.length) buttons.append(svEl('button', { type: 'button', className: `sv-go${playable || fallen ? '' : ' main'}`, textContent: life ? word('anew') : word('begin'), onclick: beginAnew }));
    else buttons.append(svEl('p', { textContent: word('noChapters') }));
    buttons.append(svEl('button', { type: 'button', className: 'sv-go', textContent: word('back'), onclick: leaveToMenu }));
    const record = life?.record?.length ? svEl('p', { textContent: `${word('record')}: ${life.record.length}` }) : null;
    show('screen', svEl('div', { className: 'sv-screen' }, svEl('h1', { textContent: word('title') }), svEl('p', { textContent: word('subtitle') }), record, buttons));
  }

  function leaveToMenu() {
    close();
    hooks.home();
  }

  function close() {
    if (finale) endFinale();
    scene = null;
    fight = null;
    run = null;
    redraw = null;
    show(null);
  }

  function beginAnew() {
    life = life ? storyBeginAnew(life, { family: STORY_FAMILY, hero: STORY_HERO }) : storyNewLife(null, { family: STORY_FAMILY, hero: STORY_HERO });
    beginChapter(CHAPTERS[0]);
  }

  function retry() {
    life = storyRetry(life);
    const chapter = CHAPTERS.find((each) => each.n === life.chapter) ?? CHAPTERS[0];
    beginChapter(chapter);
  }

  // ---- A chapter ---------------------------------------------------------------------------------------------------------

  /** A seed for this battle: the man, the chapter and the try (a retry is a new day's fighting, not the same one replayed). */
  const battleSeed = (chapter) => ((life.seed ^ Math.imul(chapter.n + 1, 2654435761) ^ Math.imul(life.attempts[chapter.n] ?? 1, 40503) ^ Math.imul(life.lives, 97)) >>> 0) || 1;

  // (A retry's life is the checkpoint, the man as he entered the chapter: it is entered afresh.)
  function beginChapter(chapter) {
    if (!chapter) return open();
    run = createChapterRun(life, chapter, { battles: STORY_BATTLES, comrades: COMRADES, flashbacks: FLASHBACKS });
    life = run.life;
    save();
    // The still scene behind the cards: the battle's field with its men drawn up, held.
    if (run.battle) {
      const setup = storyBattleSetup(run, battleSeed(chapter));
      hooks.stage(setup, { paused: true });
      storyCommandMen(hooks.world(), setup, life);
      fight = { setup, watch: storyWatch(setup), last: null, done: false };
    } else fight = null;
    flow();
  }

  /** On to whatever the chapter asks for now. */
  function flow() {
    const current = storyCurrent(run);
    if (current.kind === 'card') return showCard(current.card);
    if (current.kind === 'battle') return startBattle();
    if (current.kind === 'scene') return startScene(current.scene);
    if (current.kind === 'finale') return startFinale(current);
    if (current.kind === 'dead') return showEnding(current.page);
    if (current.kind === 'done') return nextChapter();
    return null;
  }

  function showCard(card) {
    redraw = () => showCard(card);
    hooks.pause(true);
    const kicker = svEl('div', { className: 'sv-kicker', textContent: `${say(run.chapter.title)} · ${word('year', run.chapter.year)}` });
    const choices = svEl('div', { className: 'sv-choices' });
    const options = card.choices?.length ? card.choices : [{ text: STORY_WORDS.next }];
    options.forEach((choice, index) => {
      choices.append(svEl('button', { type: 'button', className: `sv-go${options.length === 1 ? ' main' : ''}`, textContent: say(choice.text), onclick: () => answer(index) }));
    });
    show('card', svEl('div', { className: 'sv-card-wrap' }, svEl('div', { className: 'sv-card', dataset: { card: card.id ?? '' } }, kicker, svEl('p', { className: 'sv-text', textContent: say(card.text) }), choices)));
  }

  function answer(index = 0) {
    if (view !== 'card') return null;
    storyAnswer(run, index);
    save();
    return flow();
  }

  // ---- The battle ----------------------------------------------------------------------------------------------------------

  function startBattle() {
    // Built again from the life as the cards have left it (his place in the line, who stands beside him), at the same seed.
    const setup = storyBattleSetup(run, battleSeed(run.chapter));
    hooks.stage(setup, { paused: true });
    fight = { setup, watch: storyWatch(setup), last: null, done: false };
    storyCommandMen(hooks.world(), fight.setup, life);
    fight.last = hooks.world().time;
    hooks.watch(autoplay);
    hooks.pause(false);
    redraw = drawHud;
    drawHud();
  }

  function drawHud() {
    const orders = life.rank === 'officer' ? word('holdOfficer') : life.rank === 'squadLeader' ? word('holdSquad') : word('hold');
    const away = svEl('span', { className: 'sv-away' });
    away.hidden = true;
    fight.awayNode = away;
    show('battle', svEl('div', { className: 'sv-hud' }, svEl('b', { textContent: say(run.chapter.title) }), orders, away));
    layer.querySelector('.sv-lang').style.pointerEvents = 'auto';
  }

  /** After the world's steps each frame: the watch on his place, and the end of the battle. */
  function tick(world) {
    if (finale) return finaleTick(world);
    if (scene) return sceneTick(world);
    if (!fight || fight.done || !run || storyCurrent(run).kind !== 'battle' || view !== 'battle') return null;
    const dt = world.time - (fight.last ?? world.time);
    fight.last = world.time;
    if (dt > 0) storyWatchStep(fight.watch, world, fight.setup, dt);
    if (fight.awayNode) {
      const out = fight.watch.away > 0.5;
      fight.awayNode.hidden = !out;
      if (out) fight.awayNode.textContent = word('away', fight.watch.away.toFixed(0));
    }
    if (!storyBattleOver(world, fight.setup, fight.watch, run.battle)) return null;
    return endBattle(world);
  }

  function endBattle(world = hooks.world()) {
    if (!fight || fight.done) return null;
    fight.done = true;
    hooks.pause(true);
    const outcome = storyReadOutcome(world, fight.setup, fight.watch);
    storyBattleDone(run, outcome);
    save();
    return flow();
  }

  // ---- A scene -------------------------------------------------------------------------------------------------------------

  /** The overlay a scene or the finale is filmed under: the dark, the bars, a vignette, the line. */
  function filmNodes(onTap) {
    const nodes = { black: svEl('div', { className: 'sv-black' }), vignette: svEl('div', { className: 'sv-vignette' }), top: svEl('div', { className: 'sv-bar top' }), bottom: svEl('div', { className: 'sv-bar bottom' }), line: svEl('p', { className: 'sv-line' }) };
    const root = svEl('div', { className: 'sv-scene', onpointerdown: (event) => { event.preventDefault(); onTap(); } }, nodes.vignette, nodes.black, nodes.top, nodes.bottom, nodes.line);
    return { nodes, root };
  }

  /** The year a scene is set in: the chapter's (a scene before the battle, of the years before it, has its own `year`). */
  const sceneYear = (sceneDef) => sceneDef.year ?? run.chapter.year;

  function startScene(sceneDef) {
    // A scene on a set of its own (the drill ground, the yard, the gate by lantern): its world built for it, its figures the
    // life's people as they are now.
    const set = sceneDef.set ? STORY_SETS[sceneDef.set] : null;
    let world = hooks.world();
    let play;
    if (set) {
      const setup = storySetSetup(set, run.life, { year: sceneYear(sceneDef), seed: battleSeed(run.chapter), memory: Boolean(sceneDef.memory) });
      // (The scene's own changes to the set for this life: `adjust(life)` → { who: { face, pose } }, as he faces the pole or turns from it.)
      const adjust = typeof sceneDef.adjust === 'function' ? sceneDef.adjust(run.life) ?? {} : {};
      for (const figure of setup.figures) {
        const change = adjust[figure.who];
        if (change?.pose) figure.pose = change.pose;
        if (change?.face) figure.yaw = Math.atan2(-(change.face[1] - figure.at[1]), change.face[0] - figure.at[0]);
      }
      hooks.stage(setup, { paused: false });
      world = hooks.world();
      play = createScenePlay(world, sceneDef, { hero: setup.player, cast: setup.comrades, figures: setup.figures, camera: setup.camera, cameras: setup.cameras, language, life: run.life });
    } else {
      if (!world || !fight) {
        storySceneDone(run);
        return flow();
      }
      // Who fell, for a scene about a body: the named men who fell in the battle, then his family in it (whom the story mourns).
      const states = run.outcome?.comrades ?? {};
      const ids = Object.keys(fight.setup.comrades ?? {});
      const fallen = [...ids.filter((id) => states[id] && states[id] !== 'alive'), ...ids.filter((id) => run.life.family[id])];
      play = createScenePlay(world, sceneDef, { hero: fight.setup.player, cast: fight.setup.comrades, fallen, language, life: run.life });
    }
    const { nodes, root } = filmNodes(() => skipSceneLine(play));
    scene = { play, nodes, last: world.time, world, set: Boolean(set) };
    redraw = () => { play.language = language; layer.replaceChildren(root, langSwitch()); };
    show('scene', root);
    hooks.watch(false);
    hooks.pause(false);
    drawScene();
  }

  function drawScene() {
    const look = sceneLook(scene.play);
    scene.nodes.black.style.opacity = String(look.black);
    scene.nodes.top.style.transform = `scaleY(${look.bars})`;
    scene.nodes.bottom.style.transform = `scaleY(${look.bars})`;
    const text = look.line?.text ?? '';
    if (scene.nodes.line.textContent !== text) scene.nodes.line.textContent = text;
    scene.nodes.line.className = `sv-line${look.line?.who === 'narrator' ? ' narrator' : ''}`;
  }

  function sceneTick(world) {
    // (A world built for the scene starts its own clock.)
    if (world !== scene.world) Object.assign(scene, { world, last: world.time });
    const dt = world.time - scene.last;
    scene.last = world.time;
    const due = dt > 0 ? stepScene(scene.play, dt) : [];
    drawScene();
    if (!due.includes('done')) return null;
    const wasSet = scene.set;
    scene = null;
    hooks.pause(true);
    storySceneDone(run);
    save();
    // Back from a set to the cards: the battle's field behind them again, held still.
    if (wasSet && fight && storyCurrent(run).kind === 'card') {
      hooks.stage(fight.setup, { paused: true });
      storyCommandMen(hooks.world(), fight.setup, life);
    }
    return flow();
  }

  // ---- The finale: he lies dying, and the life comes back to him --------------------------------------------------------

  const stageCanvas = () => document.querySelector('#stage');

  function startFinale(current) {
    const world = hooks.world();
    const shots = finaleShots(run.life, current.flashbacks?.length ? current.flashbacks : FLASHBACKS);
    const play = createFinalePlay(shots, { language });
    const { nodes, root } = filmNodes(() => skipFinale(play));
    // The battle's world, where he lies (taken by the night, if the battle left him standing: the after-cards say how).
    const hero = fight && world ? world.fighters[fight.setup.player] : null;
    if (hero && hero.state !== 'out') layDead(world, hero, { up: true, reason: 'fell under the company flag' });
    finale = { play, nodes, root, world, last: world?.time ?? 0, hero: fight?.setup.player ?? null, figures: null, camera: null, shot: -1 };
    redraw = () => { play.language = language; layer.replaceChildren(root, langSwitch()); };
    show('scene', root);
    hooks.watch(false);
    hooks.pause(false);
    finaleShot(0);
    drawFinale();
  }

  /** A shot begins: its world built (in the dark the shot before closed to), its figures placed, its camera. */
  function finaleShot(index) {
    const shot = finale.play.shots[index];
    finale.shot = index;
    if (shot.first) {
      finale.figures = null;
      finale.camera = null;
      return;
    }
    if (shot.kind === 'black') return;
    const set = STORY_SETS[shot.set] ?? STORY_SETS.field;
    const setup = storySetSetup(set, run.life, { year: shot.year ?? 1621, memory: shot.kind === 'memory', seed: index + 1, alias: shot.alias ?? {} });
    for (const figure of setup.figures) if (shot.poses?.[figure.who]) figure.pose = shot.poses[figure.who];
    hooks.stage(setup, { paused: false });
    const world = hooks.world();
    finale.world = world;
    finale.last = world.time;
    finale.figures = stageSetFigures(world, setup.figures.map((figure) => ({ ...figure })));
    const camera = shot.camera ?? setup.camera;
    finale.camera = { ...camera, distance: camera.distance * (shot.closer ?? 1) };
    finale.since = world.time;
  }

  function drawFinale() {
    const look = finaleLook(finale.play);
    const nodes = finale.nodes;
    nodes.black.style.opacity = String(look.black);
    nodes.top.style.transform = `scaleY(${look.bars})`;
    nodes.bottom.style.transform = `scaleY(${look.bars})`;
    nodes.vignette.style.opacity = String(look.vignette);
    const text = look.line?.text ?? '';
    if (nodes.line.textContent !== text) nodes.line.textContent = text;
    nodes.line.className = `sv-line finale${look.kind === 'black' ? ' letter' : ''}`;
    const canvas = stageCanvas();
    if (canvas) canvas.style.filter = `grayscale(${look.grey.toFixed(3)}) sepia(${look.warm.toFixed(3)}) brightness(${look.dim.toFixed(3)})`;
  }

  function finaleTick(world) {
    if (world !== finale.world) Object.assign(finale, { world, last: world.time });
    return null;
  }

  /**
   * Each drawn frame (`dt` s of the page's own clock: the finale is not the world's, which is slowed on the field and starts
   * again with each set's world): the finale on, its shots begun as they come.
   */
  function finaleFrame(dt) {
    const due = dt > 0 ? stepFinale(finale.play, Math.min(dt, 0.1)) : [];
    for (const event of due) if (event.shot !== undefined && event.shot > 0) finaleShot(event.shot);
    drawFinale();
    if (!due.includes('done')) return null;
    endFinale();
    storyFinaleDone(run);
    save();
    return flow();
  }

  /** The finale's film taken down (the canvas's own colour back). */
  function endFinale() {
    const canvas = stageCanvas();
    if (canvas) canvas.style.filter = '';
    finale = null;
    hooks.pause(true);
  }

  /** The finale's camera: on him where he fell (from above, coming down), else the shot's set. */
  function finaleFocus() {
    if (finale.camera) return setFocus(finale.camera, finale.world.time - (finale.since ?? 0));
    const hero = finale.hero !== null ? finale.world?.fighters[finale.hero] : null;
    if (!hero) return null;
    const at = [hero.x[P.pelvis * 3], hero.x[P.pelvis * 3 + 1], hero.x[P.pelvis * 3 + 2]];
    const into = finale.play.into;
    const spec = STORY_FINALE.camera;
    return { target: [at[0], Math.max(0.1, at[1] * 0.6), at[2]], yaw: spec.yaw + into * spec.turn, pitch: spec.pitch, distance: Math.max(spec.near, spec.far - into * spec.closing) };
  }

  /** Inside each step of the world: the scene's posing of the hero, or a set's figures. */
  function think() {
    if (scene) sceneThink(scene.play);
    if (finale?.figures) poseSetFigures(finale.world, finale.figures, finale.world.time - (finale.since ?? 0));
  }

  /** After the follow camera: in a scene, the camera eased onto the shot. */
  function steer(dt) {
    if (finale) finaleFrame(dt);
    const focus = scene ? sceneFocus(scene.play) : finale ? finaleFocus() : null;
    if (!focus) return;
    const orbit = hooks.orbit();
    const film = scene ?? finale;
    // The scene's own camera, kept from frame to frame (the follow camera sets the orbit afresh each frame): from where the
    // orbit was when the scene began, eased onto the shot (about two thirds of the way in a second); then the orbit is it.
    const cam = (film.cam ??= { target: [orbit.target.x, orbit.target.y, orbit.target.z], yaw: orbit.yaw, pitch: orbit.pitch, distance: orbit.distance });
    // (In the dark it is there at once: the dark lifts on the shot.)
    const black = scene ? sceneLook(scene.play).black : finaleLook(finale.play).black;
    const ease = black > 0.95 ? 1 : 1 - Math.exp(-dt * 1.1);
    for (let axis = 0; axis < 3; axis += 1) cam.target[axis] += (focus.target[axis] - cam.target[axis]) * ease;
    cam.yaw += Math.atan2(Math.sin(focus.yaw - cam.yaw), Math.cos(focus.yaw - cam.yaw)) * ease;
    cam.pitch += (focus.pitch - cam.pitch) * ease;
    cam.distance += (focus.distance - cam.distance) * ease;
    orbit.target.set(...cam.target);
    Object.assign(orbit, { yaw: cam.yaw, pitch: cam.pitch, distance: cam.distance });
  }

  // ---- The end of a chapter, and of a life ---------------------------------------------------------------------------------

  function nextChapter() {
    const next = storyNextChapter(CHAPTERS, run.chapter.n);
    if (next) return beginChapter(next);
    const page = storyLifeLived(run);
    save();
    return showEnding(page);
  }

  /** How a man died, in the language shown: words given both ways, or a kind (STORY_WORDS.kinds). */
  const howSaid = (how) => (typeof how === 'string' ? say(STORY_WORDS.kinds[how] ?? how) : say(how));
  const nameList = (people) => (people.length ? people.map((person) => say(person.name)).join(language === 'zh' ? '、' : ', ') : word('nobody'));

  function showEnding(page) {
    redraw = () => showEnding(page);
    hooks.pause(true);
    const chapter = CHAPTERS.find((each) => each.n === page.chapter);
    // (A man who fell: his luck is that of the battles he came through; his first battle his last, it says so.)
    const luckText = page.kind !== 'lived' && !page.passed?.length ? STORY_WORDS.firstLast : page.kind !== 'lived' && page.luck?.never ? STORY_WORDS.cleanRun : storyLuckText(page.luck ?? { odds: 1, percent: 100 });
    // (A member a card brought into his life is `true` there: read as his entry in chapters/family.js.)
    const family = Object.entries(page.family ?? {}).filter(([, person]) => person).map(([who, raw]) => {
      const person = typeof raw === 'object' ? raw : { ...STORY_FAMILY[who], alive: true };
      const how = howSaid(person.diedAt?.how);
      return svEl('li', { textContent: `${say(person.name ?? who)}: ${person.alive === false ? `${word('dead')}${how ? `, ${how}` : ''}` : word('alive')}` });
    });
    const fallen = (page.fallen ?? []).map((person) => svEl('li', { textContent: `${say(person.name)}${person.diedAt?.how ? `: ${howSaid(person.diedAt.how)}` : ''}` }));
    const where = [say(page.where ?? chapter?.title), page.year ? word('year', page.year) : null, page.age ? word('age', page.age) : null].filter(Boolean).join(' · ');
    const lived = page.kind === 'lived';
    const buttons = svEl('div', { className: 'sv-buttons' },
      lived ? null : svEl('button', { type: 'button', className: 'sv-go main', textContent: word('retry'), onclick: retry }),
      svEl('button', { type: 'button', className: `sv-go${lived ? ' main' : ''}`, textContent: word('anew'), onclick: beginAnew }),
      svEl('button', { type: 'button', className: 'sv-go', textContent: word('menu'), onclick: leaveToMenu }));
    const article = svEl('article', { dataset: { ending: page.kind } },
      svEl('h1', { textContent: page.finale ? `${say(page.name)} · ${word('span', life?.hero?.born ?? STORY.born, page.year)}` : `${say(page.name)} · ${lived ? word('lived') : word('fell')}` }),
      svEl('p', { textContent: where }),
      page.text ? svEl('p', { textContent: say(page.text) }) : null,
      page.how ? svEl('h2', { textContent: word('how') }) : null,
      page.how ? svEl('p', { textContent: howSaid(page.how) }) : null,
      svEl('h2', { textContent: word('outlived') }), svEl('p', { textContent: nameList(page.outlived ?? []) }),
      fallen.length ? svEl('h2', { textContent: word('fallen') }) : null, fallen.length ? svEl('ul', {}, ...fallen) : null,
      family.length ? svEl('h2', { textContent: word('family') }) : null, family.length ? svEl('ul', {}, ...family) : null,
      svEl('h2', { textContent: word('luck') }), svEl('p', { className: 'sv-luck', textContent: say(luckText) }),
      svEl('p', { textContent: word('lives', page.life) }),
      buttons);
    show('ending', svEl('div', { className: 'sv-page' }, article));
  }

  // ---- What main.js and the tests call --------------------------------------------------------------------------------------

  const testHooks = {
    open,
    begin: () => beginAnew(),
    answer,
    language: (next) => (next ? setLanguage(next) : language),
    // The hero left to his own mind (the AI's), as every other man: for shots and runs in a page.
    autoplay: (on = true) => {
      autoplay = Boolean(on);
      if (view === 'battle') hooks.watch(autoplay);
      return autoplay;
    },
    endBattle: () => endBattle(),
    // The hero struck down where he stands (tests and shots of a death page: the battle then ends as it would).
    fall: () => {
      const world = hooks.world();
      const hero = fight && world?.fighters[fight.setup.player];
      if (hero && hero.state !== 'out') knockOut(world, hero, { time: world.time, effects: [], attacker: null }, 'struck down (a test)', 'killed');
      return Boolean(hero);
    },
    skipLine: () => (scene ? skipSceneLine(scene.play) : finale ? skipFinale(finale.play) : false),
    // A stand-in life at chapter `n` (shots and checks of one scene without playing the life to it): a new man, every chapter to
    // `n` entered (its comrades with him), then `effects` (life.js storyApplyEffects: flags, family, rank, `dies`), the men who
    // `fell` in chapter n's battle, and the run of chapter n begun.
    stand: (n, { seed = 11, effects = {}, fell = [] } = {}) => {
      hooks.closeMenus?.();
      life = storyNewLife(life, { seed, family: STORY_FAMILY, hero: STORY_HERO });
      for (const chapter of CHAPTERS.filter((each) => each.n <= n)) storyEnterChapter(life, chapter, { comrades: COMRADES });
      storyApplyEffects(life, effects);
      for (const id of fell) storyMarkDead(life, id, { how: { zh: '战死', en: 'killed' } });
      const chapter = CHAPTERS.find((each) => each.n === n);
      run = createChapterRun(life, chapter, { battles: STORY_BATTLES, comrades: COMRADES, flashbacks: FLASHBACKS });
      run.index = (chapter.before ?? []).length;
      run.pending = [];
      return { chapter: chapter.id, comrades: life.comrades.map((comrade) => `${comrade.id}${comrade.alive ? '' : ' (dead)'}`) };
    },
    // Play one of the stand-in chapter's scenes now (by id): a set's on its own world; a body's on the battle's field, held
    // still, its subject (or the chapter's family in it) struck down first.
    playScene: (id) => {
      const sceneDef = run.chapter.scenes?.find((each) => each.id === id);
      if (!sceneDef) return false;
      if (!sceneDef.set && run.battle) {
        const setup = storyBattleSetup(run, battleSeed(run.chapter));
        hooks.stage(setup, { paused: true });
        fight = { setup, watch: storyWatch(setup), last: null, done: false };
        const world = hooks.world();
        for (const who of Object.keys(setup.comrades ?? {})) if (run.life.family[who]) knockOut(world, world.fighters[setup.comrades[who]], { time: world.time, effects: [], attacker: null }, 'cut down', 'killed');
        run.outcome = { hero: 'alive', comrades: {} };
      }
      run.pending = [sceneDef];
      startScene(sceneDef);
      return true;
    },
    // A set shown by itself (shots of the sets: scenes/sets.js), its figures the stand-in life's people at `year`, remembered.
    showSet: (id, year = 1600) => {
      const sceneDef = { id, set: id, year, memory: true, script: [{ who: 'narrator', line: { zh: id, en: id } }] };
      run.pending = [sceneDef];
      startScene(sceneDef);
      return Boolean(STORY_SETS[id]);
    },
    // The finale for the stand-in life (chapter 8's): its battle's field staged, the hero struck down in it (or, `lived`, come
    // through it and taken by the night: the finale lays him down), and the life seen.
    finale: ({ lived = false } = {}) => {
      const setup = storyBattleSetup(run, battleSeed(run.chapter));
      hooks.stage(setup, { paused: false });
      fight = { setup, watch: storyWatch(setup), last: null, done: false };
      storyCommandMen(hooks.world(), setup, life);
      const world = hooks.world();
      if (!lived) knockOut(world, world.fighters[setup.player], { time: world.time, effects: [], attacker: null }, 'cut down under the company flag', 'killed');
      run.dying = lived ? { kind: 'lived' } : { kind: 'battle', how: { zh: '战死', en: 'killed' }, text: run.chapter.ending?.text ?? null, where: run.chapter.title };
      run.phase = 'finale';
      return flow();
    },
    // The finale's shots (their ids), and a jump to one (`at`: an index; the world of that shot built, the clock set into it by `into` s).
    finaleShots: () => (finale ? finale.play.shots.map((shot) => shot.id ?? shot.kind) : run?.phase === 'finale' ? finaleShots(run.life, FLASHBACKS).map((shot) => shot.id ?? shot.kind) : []),
    finaleJump: (at, into = 0) => {
      if (!finale) return false;
      finale.play.index = at;
      finale.play.into = into;
      finaleShot(at);
      return true;
    },
    retry,
    anew: beginAnew,
    state: () => ({
      view,
      phase: run?.phase ?? null,
      card: view === 'card' ? storyCurrent(run).card?.id ?? null : null,
      chapter: run?.chapter?.n ?? null,
      scene: scene ? { id: scene.play.scene.id, line: scene.play.index, lines: scene.play.lines.length } : null,
      finale: finale ? { shot: finale.play.index, shots: finale.play.shots.length, id: finale.play.shots[finale.play.index]?.id ?? finale.play.shots[finale.play.index]?.kind, into: finale.play.into, look: finaleLook(finale.play) } : null,
      watch: fight?.watch ? { away: fight.watch.away, leftPlace: fight.watch.leftPlace, decidedAt: fight.watch.decidedAt, downAt: fight.watch.downAt } : null,
      outcome: run?.outcome ?? null,
      life: life ? { lives: life.lives, chapter: life.chapter, rank: life.rank, place: life.place, attempts: life.attempts, dead: Boolean(life.dead), comrades: life.comrades.map((comrade) => ({ id: comrade.id, alive: comrade.alive })), family: life.family, luck: storyLuck(life) } : null,
    }),
    run: () => run,
    life: () => life,
    words: STORY_WORDS,
    config: STORY_RUN,
  };

  return {
    open, tick, think, steer, close,
    hooks: testHooks,
    /** The hero is the scene's (not the player's) while a scene or the finale plays. */
    holding: () => Boolean(scene || finale),
    /** The men a scene holds still (they think nothing of their own): main.js leaves them out of the AI's thinking. */
    held: () => (scene ? sceneHeld(scene.play) : finale?.figures ? finale.figures.map((figure) => finale.world.fighters[figure.index]?.id).filter((id) => id !== undefined) : []),
    /** The world's pace (a share): slowed while he lies dying on the field. */
    pace: () => (finale ? finaleLook(finale.play).pace : 1),
    /** A scene's camera is on. */
    get filming() { return Boolean(scene || finale); },
    /** The game has left story mode (main.js setGame): take everything down. */
    leave: () => { if (!layer.hidden) close(); },
    get active() { return !layer.hidden; },
  };
}
