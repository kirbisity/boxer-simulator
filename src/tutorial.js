// The tutorial: the training yard, one control at a time. A card says what
// to do, in the words of the hand in use (a finger, or a mouse and keys);
// the step is done when the player has done it, and the next comes. The
// steps and their progress are plain data and functions (tested in Node);
// installTutorial draws the card. main.js stages the yard: the player with
// a katana, a training partner in plate who stands still and, at the guard
// step, swings a staff at him; the sword knocked from his hands for the
// special button.

import { getLang, onLangChange, t } from './i18n.js';

export const TUTORIAL = {
  // rad of view turned to finish looking about.
  lookFor: 1.6,
  // m walked, and within how far of the partner (m), to finish moving.
  walkFor: 1,
  nearFrom: 2.6,
  // Different attacks made to finish striking.
  strikes: 3,
  // s with the guard held (if no blow has been met on it).
  guardFor: 4,
  // s a done step's card shows its tick before the next.
  doneSeconds: 0.9,
  // s the closing card stays before the menu.
  finishSeconds: 7,
  // s between the partner's swings at the guard step.
  swingEvery: 2.2,
  // Where a visitor's having been through the yard (finished, skipped or left) is kept.
  storageKey: 'gladiator.tutorialDone',
};

// ---- Been through it --------------------------------------------------------------
// A first visit opens in the yard; once finished, skipped or left, the home
// screen. localStorage may be missing or refuse (a private window, blocked
// storage): then it is remembered for this page load only.

const tutorialMemory = { done: false };

/** Whether this visitor has been through the yard (`storage`: localStorage, or a stand-in). */
export function tutorialDone(storage = globalThis.localStorage) {
  try {
    return tutorialMemory.done || storage?.getItem(TUTORIAL.storageKey) === '1';
  } catch {
    return tutorialMemory.done;
  }
}

/** Remember that he has been through it. */
export function markTutorialDone(storage = globalThis.localStorage) {
  tutorialMemory.done = true;
  try {
    storage?.setItem(TUTORIAL.storageKey, '1');
  } catch {
    // Remembered for this page only.
  }
}

/** Open the page in the yard? Only the first time, and not for an automated browser (tests). */
export function tutorialWanted(storage = globalThis.localStorage, agent = globalThis.navigator) {
  return !tutorialDone(storage) && !agent?.webdriver;
}

/** Test hook: forget this page's memory of it (the storage is the caller's). */
export function forgetTutorial() {
  tutorialMemory.done = false;
}

/**
 * The steps, in order: a title, what to do by touch and by mouse and keys,
 * and when it is done (from the step's progress: see createTutorialRun).
 * `stage` names what the yard does as the step begins (main.js).
 */
export const TUTORIAL_STEPS = [
  {
    key: 'look', title: 'Look around',
    touch: 'Drag <b>anywhere</b> off the stick and the buttons to turn the view. Pinch with two fingers to zoom.',
    mouse: 'Drag with the <b>right mouse button</b> (or the left, anywhere off the stick) to turn the view. The wheel zooms.',
    done: (progress) => progress.look >= TUTORIAL.lookFor,
  },
  {
    key: 'move', title: 'Move',
    touch: 'Drag the <b>stick</b> at the bottom left. Push it to the edge to run while you hold it there (weapon down, no guard). Walk up to Edric.',
    mouse: '<b>W A S D</b> or the <b>arrow keys</b> walk the way the camera looks; <b>Shift</b> runs while held (weapon down, no guard). Walk up to Edric.',
    done: (progress) => progress.walked >= TUTORIAL.walkFor && progress.near,
  },
  {
    key: 'lock', title: 'Lock on',
    touch: 'Tap <b>Lock</b> (the target sight, left of Crawl). You face Edric as you move, and the camera keeps you both in view.',
    mouse: 'Press <b>Tab</b> to lock on. You face Edric as you move, and the camera keeps you both in view.',
    done: (progress) => progress.locked,
  },
  {
    key: 'strike', title: 'Strike',
    touch: '<b>Tap Edric where to cut</b>: head, body or legs, left or right (with the Buttons controls, a coloured button). Each colour is a kind of blow. Make <b>three different</b> cuts.',
    mouse: '<b>Click Edric where to cut</b>: head, body or legs, left or right (with the Buttons controls, a coloured button or keys 1–6). Make <b>three different</b> cuts.',
    done: (progress) => progress.kinds.size >= TUTORIAL.strikes,
    stage: 'teachPad',
  },
  {
    key: 'combo', title: 'Combination',
    touch: '<b>Tap the same place twice, quickly</b>: the cut, then the next one after it, a combination.',
    mouse: '<b>Click the same place twice, quickly</b>: the cut, then the next one after it, a combination.',
    done: (progress) => progress.combos >= 1,
  },
  {
    key: 'shove', title: 'Shove',
    touch: '<b>Press and hold</b> anywhere to shove him back. On a man who is down, it holds him down.',
    mouse: '<b>Press and hold</b> the mouse button to shove him back. On a man who is down, it holds him down.',
    done: (progress) => progress.holds >= 1,
  },
  {
    key: 'guard', title: 'Guard',
    touch: 'Edric swings at you now. <b>Hold Guard 🛡</b> to block with your sword. A quick tap of it dodges instead.',
    mouse: 'Edric swings at you now. <b>Hold T</b> to block with your sword. A quick tap of it dodges instead.',
    done: (progress) => progress.blocked >= 1 || progress.guarded >= TUTORIAL.guardFor,
    stage: 'swing',
  },
  {
    key: 'pickUp', title: 'The special button',
    touch: 'Your sword is knocked from your hands. The <b>special button</b> (top of the right edge) changes with the moment: now it says <b>Pick up ✋</b>. Tap it.',
    mouse: 'Your sword is knocked from your hands. The <b>special action</b> changes with the moment: now it is <b>Pick up ✋</b>. Press <b>F</b>.',
    done: (progress) => progress.armed,
    stage: 'disarm',
  },
  {
    key: 'unlock', title: 'Let go',
    touch: 'Tap the lit <b>Lock</b> again to let go of Edric. The camera follows behind you again.',
    mouse: 'Press <b>Tab</b> again to let go of Edric. The camera follows behind you again.',
    done: (progress) => !progress.locked,
  },
  {
    key: 'jump', title: 'Jump',
    touch: 'Tap <b>Jump</b> (right edge, over Guard). How high you go is your body: legs, weight, armour, how tired. Jumps get you onto low ledges and over gaps.',
    mouse: 'Press <b>Space</b> to jump. How high you go is your body: legs, weight, armour, how tired. Jumps get you onto low ledges and over gaps.',
    done: (progress) => progress.landed >= 1,
  },
  {
    key: 'crawl', title: 'Crawl',
    touch: 'Tap <b>Crawl</b> (bottom of the right edge) to go down on your hands and knees: low, slow, hard to spot. Tap it again (<b>Stand</b>) to get up. Not while locked on.',
    mouse: 'Press <b>C</b> to go down on your hands and knees: low, slow, hard to spot. Press it again to get up. Not while locked on.',
    done: (progress) => progress.crawled && progress.stood,
  },
];

/** The steps' words in Chinese, by step (the English stays on the step itself, where the tests read it). */
export const TUTORIAL_STEPS_ZH = {
  look: {
    title: '看看四周',
    touch: '在摇杆和按键以外的<b>任意位置</b>拖动，转动视角。双指捏合缩放。',
    mouse: '按住<b>鼠标右键</b>拖动（或左键，在摇杆以外的任意位置）转动视角。滚轮缩放。',
  },
  move: {
    title: '移动',
    touch: '拖动左下角的<b>摇杆</b>。推到边上并按住就是奔跑（兵器放低，没有格挡）。走到埃德里克跟前。',
    mouse: '<b>W A S D</b> 或<b>方向键</b>朝镜头方向走；按住 <b>Shift</b> 奔跑（兵器放低，没有格挡）。走到埃德里克跟前。',
  },
  lock: {
    title: '锁定',
    touch: '点<b>锁定</b>（准星图标，在“爬行”左边）。移动时你会一直面朝埃德里克，镜头把你们俩都框在画面里。',
    mouse: '按 <b>Tab</b> 锁定。移动时你会一直面朝埃德里克，镜头把你们俩都框在画面里。',
  },
  strike: {
    title: '出招',
    touch: '<b>在埃德里克身上点你要砍的地方</b>：头、身子或腿，左边或右边（用“按键”操作时，点彩色按键）。每种颜色是一种招式。砍出<b>三种不同</b>的招。',
    mouse: '<b>在埃德里克身上点你要砍的地方</b>：头、身子或腿，左边或右边（用“按键”操作时，点彩色按键或按 1–6）。砍出<b>三种不同</b>的招。',
  },
  combo: {
    title: '连招',
    touch: '<b>在同一个地方快速连点两下</b>：一刀下去，紧跟着下一刀，这就是连招。',
    mouse: '<b>在同一个地方快速连点两下</b>：一刀下去，紧跟着下一刀，这就是连招。',
  },
  shove: {
    title: '推搡',
    touch: '在任意位置<b>按住不放</b>，把他推开。对方倒地时，这一下能把他按住。',
    mouse: '<b>按住</b>鼠标键不放，把他推开。对方倒地时，这一下能把他按住。',
  },
  guard: {
    title: '格挡',
    touch: '埃德里克要朝你挥过来了。<b>按住格挡 🛡</b>，用剑架住。轻点一下则是闪避。',
    mouse: '埃德里克要朝你挥过来了。<b>按住 T</b>，用剑架住。轻点一下则是闪避。',
  },
  pickUp: {
    title: '特殊键',
    touch: '你的剑被打飞了。<b>特殊键</b>（右侧最上方）会随情况变化：现在它写着<b>捡起 ✋</b>。点它。',
    mouse: '你的剑被打飞了。<b>特殊动作</b>会随情况变化：现在是<b>捡起 ✋</b>。按 <b>F</b>。',
  },
  unlock: {
    title: '解除锁定',
    touch: '再点一下亮着的<b>锁定</b>，放开埃德里克。镜头又回到你身后。',
    mouse: '再按一下 <b>Tab</b>，放开埃德里克。镜头又回到你身后。',
  },
  jump: {
    title: '跳跃',
    touch: '点<b>跳跃</b>（右侧，格挡上方）。跳多高全看你这副身子：腿力、体重、盔甲、累不累。能跳上矮台，跃过沟坎。',
    mouse: '按<b>空格</b>跳跃。跳多高全看你这副身子：腿力、体重、盔甲、累不累。能跳上矮台，跃过沟坎。',
  },
  crawl: {
    title: '爬行',
    touch: '点<b>爬行</b>（右侧最下方），手脚着地：身子低，走得慢，不容易被发现。再点一下（<b>站起</b>）起身。锁定时不能爬。',
    mouse: '按 <b>C</b> 手脚着地：身子低，走得慢，不容易被发现。再按一下起身。锁定时不能爬。',
  },
};

/** A step's words (`title`, `touch`, `mouse`) in the language in force: its English, or its `zh` (TUTORIAL_STEPS_ZH). */
const tutorialWords = (step, field) => (getLang() === 'zh' && TUTORIAL_STEPS_ZH[step.key]?.[field]) || step[field];

/** A step's progress, from nothing. */
const freshProgress = () => ({ look: 0, walked: 0, near: false, locked: false, kinds: new Set(), combos: 0, holds: 0, blocked: 0, guarded: 0, armed: false, landed: 0, crawled: false, stood: false });

/**
 * One run through the steps. `signal(kind, detail)` takes what the controls
 * report ('look' rad, 'move', 'strike' move, 'combo', 'hold', 'action',
 * 'lock', 'unlock', 'evade'); `observe(state, dt)` the yard each frame
 * ({ walked m this frame, near, locked, guarding, blocked (blows met this frame), armed, landed (jumps landed this frame),
 * crawling, standing }).
 * Returns { step, index, finished, done, signal, observe, skip, progress }.
 */
export function createTutorialRun(steps = TUTORIAL_STEPS) {
  const run = { index: 0, progress: freshProgress(), done: false, finished: false };
  const step = () => steps[run.index] ?? null;
  const check = () => {
    if (!run.done && step()?.done(run.progress)) run.done = true;
  };
  return {
    get index() { return run.index; },
    get step() { return step(); },
    get finished() { return run.finished; },
    /** Done, and waiting for the next step to be called up. */
    get done() { return run.done; },
    get progress() { return run.progress; },
    signal(kind, detail) {
      if (run.finished || run.done) return;
      const progress = run.progress;
      if (kind === 'look') progress.look += detail ?? 0;
      else if (kind === 'strike') progress.kinds.add(detail);
      else if (kind === 'combo') progress.combos += 1;
      else if (kind === 'hold') progress.holds += 1;
      else if (kind === 'lock') progress.locked = true;
      else if (kind === 'unlock') progress.locked = false;
      check();
    },
    observe(state, dt) {
      if (run.finished || run.done) return;
      const progress = run.progress;
      progress.walked += state.walked ?? 0;
      progress.near = Boolean(state.near);
      progress.locked = Boolean(state.locked);
      progress.armed = Boolean(state.armed);
      progress.blocked += state.blocked ?? 0;
      progress.landed += state.landed ?? 0;
      // Down on his knees, then up on his feet again.
      if (state.crawling) progress.crawled = true;
      if (progress.crawled && state.standing) progress.stood = true;
      if (state.guarding) progress.guarded += dt;
      check();
    },
    /** On to the next step (done or skipped): its progress from nothing. Returns the new step, or null at the end. */
    next() {
      if (run.finished) return null;
      run.index += 1;
      run.progress = freshProgress();
      run.done = false;
      if (run.index >= steps.length) run.finished = true;
      return step();
    },
  };
}

const cardElement = (tag, className, html) => Object.assign(document.createElement(tag), { className, ...(html ? { innerHTML: html } : {}) });

/**
 * The tutorial's card over the fight, and a Skip tutorial button in the top
 * corner. `hooks`: now() (s), stage(key) (the yard does what a step needs as
 * it begins), observe() (the yard's state for the run, each frame), exit()
 * (back to the menu), again() (from the start).
 * Returns { start, stop, update, signal, setDevice, run }.
 */
export function installTutorial(root, hooks) {
  const card = root.appendChild(cardElement('section', 'tutorial-card'));
  card.hidden = true;
  card.setAttribute('aria-live', 'polite');
  card.innerHTML = '<div class="head"><em class="count"></em><b class="title"></b><span class="tick">✓</span></div><p class="text"></p>'
    + `<div class="actions"><button type="button" class="skip">${t('tutorial.skipStep')}</button><button type="button" class="exit" hidden>${t('tutorial.menu')}</button></div>`;
  // Out of the whole yard to the home screen, at any moment: big, in the corner, always there.
  const skipAll = root.appendChild(cardElement('button', 'tutorial-skip', t('tutorial.skipAll')));
  skipAll.type = 'button';
  skipAll.hidden = true;
  skipAll.setAttribute('aria-label', t('tutorial.skipAllLabel'));
  skipAll.addEventListener('click', () => hooks.exit());
  // The card in the new language when it changes (src/i18n.js), mid-step too.
  onLangChange(() => {
    card.querySelector('.exit').textContent = t('tutorial.menu');
    skipAll.innerHTML = t('tutorial.skipAll');
    skipAll.setAttribute('aria-label', t('tutorial.skipAllLabel'));
    if (run) show();
  });
  let run = null;
  let device = 'touch';
  let doneAt = null;
  let finishedAt = null;
  let last = null;

  function show() {
    const step = run?.step;
    card.classList.toggle('finished', !step);
    card.classList.remove('done');
    if (!step) {
      card.querySelector('.count').textContent = t('tutorial.yard');
      card.querySelector('.title').textContent = t('tutorial.welldone');
      card.querySelector('.text').innerHTML = t('tutorial.finished');
      card.querySelector('.skip').textContent = t('tutorial.again');
      card.querySelector('.exit').hidden = false;
      skipAll.hidden = true;
      return;
    }
    card.querySelector('.count').textContent = t('tutorial.count', { at: run.index + 1, of: TUTORIAL_STEPS.length });
    card.querySelector('.title').textContent = tutorialWords(step, 'title');
    card.querySelector('.text').innerHTML = tutorialWords(step, device === 'mouse' ? 'mouse' : 'touch');
    card.querySelector('.skip').textContent = t('tutorial.skipStep');
    card.querySelector('.exit').hidden = true;
    skipAll.hidden = false;
  }

  function begin(step) {
    if (step?.stage) hooks.stage(step.stage);
    hooks.stage(step ? `step:${step.key}` : 'finished');
    show();
  }

  function advance() {
    doneAt = null;
    const step = run.next();
    if (!step) finishedAt = hooks.now();
    begin(step);
  }

  card.querySelector('.skip').addEventListener('click', () => {
    if (!run) return;
    if (run.finished) hooks.again();
    else advance();
  });
  card.querySelector('.exit').addEventListener('click', () => hooks.exit());

  return {
    start() {
      run = createTutorialRun();
      doneAt = null;
      finishedAt = null;
      last = hooks.now();
      card.hidden = false;
      begin(run.step);
    },
    stop() {
      run = null;
      card.hidden = true;
      skipAll.hidden = true;
    },
    /** Each frame: the yard observed, a done step ticked and then the next. */
    update() {
      if (!run) return;
      const now = hooks.now();
      const dt = Math.min(0.1, now - (last ?? now));
      last = now;
      if (run.finished) {
        if (now - finishedAt > TUTORIAL.finishSeconds) hooks.exit();
        return;
      }
      run.observe(hooks.observe(), dt);
      if (run.done && doneAt === null) {
        doneAt = now;
        card.classList.add('done');
        navigator.vibrate?.(20);
      }
      if (doneAt !== null && now - doneAt > TUTORIAL.doneSeconds) advance();
    },
    signal(kind, detail) {
      run?.signal(kind, detail);
    },
    setDevice(kind) {
      if (kind === device) return;
      device = kind;
      if (run) show();
    },
    get run() { return run; },
    get active() { return Boolean(run); },
  };
}
