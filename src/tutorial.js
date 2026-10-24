// The tutorial: the training yard, one control at a time. A card says what
// to do, in the words of the hand in use (a finger, or a mouse and keys);
// the step is done when the player has done it, and the next comes. The
// steps and their progress are plain data and functions (tested in Node);
// installTutorial draws the card. main.js stages the yard: the player with
// a katana, a training partner in plate who stands still and, at the guard
// step, swings a staff at him; the sword knocked from his hands for the
// special button.

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
    touch: 'Drag on the <b>top half</b> of the screen to turn the view. Pinch there with two fingers to zoom.',
    mouse: 'Drag with the <b>right mouse button</b> (or the left, in the top half) to turn the view. The wheel zooms.',
    done: (progress) => progress.look >= TUTORIAL.lookFor,
  },
  {
    key: 'move', title: 'Move',
    touch: 'Drag on the <b>bottom half</b>: a stick appears under your thumb. Push it to the edge to run while you hold it there (weapon down, no guard). Walk up to Edric.',
    mouse: '<b>W A S D</b> or the <b>arrow keys</b> walk the way the camera looks; <b>Shift</b> runs while held (weapon down, no guard). Walk up to Edric.',
    done: (progress) => progress.walked >= TUTORIAL.walkFor && progress.near,
  },
  {
    key: 'lock', title: 'Lock on',
    touch: 'Tap <b>Lock ◎</b> (right edge). You face Edric as you move, and the camera keeps you both in view.',
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
    touch: 'Tap <b>Unlock</b> to let go of Edric. The camera follows behind you again.',
    mouse: 'Press <b>Tab</b> again to let go of Edric. The camera follows behind you again.',
    done: (progress) => !progress.locked,
  },
  {
    key: 'jump', title: 'Jump',
    touch: 'Tap <b>Jump</b> (right edge, over Lock). How high you go is your body: legs, weight, armour, how tired. Jumps get you onto low ledges and over gaps.',
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
    + '<div class="actions"><button type="button" class="skip">Skip step</button><button type="button" class="exit" hidden>Menu</button></div>';
  // Out of the whole yard to the home screen, at any moment: big, in the corner, always there.
  const skipAll = root.appendChild(cardElement('button', 'tutorial-skip', 'Skip tutorial <b>›</b>'));
  skipAll.type = 'button';
  skipAll.hidden = true;
  skipAll.setAttribute('aria-label', 'Skip the tutorial: go to the menu');
  skipAll.addEventListener('click', () => hooks.exit());
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
      card.querySelector('.count').textContent = 'Training yard';
      card.querySelector('.title').textContent = 'Well done';
      card.querySelector('.text').innerHTML = 'That is every control. Lock on, cut where you tap him, guard when he swings, and the special button does the rest. Back to the menu in a moment.';
      card.querySelector('.skip').textContent = 'Again';
      card.querySelector('.exit').hidden = false;
      skipAll.hidden = true;
      return;
    }
    card.querySelector('.count').textContent = `Training yard · ${run.index + 1} of ${TUTORIAL_STEPS.length}`;
    card.querySelector('.title').textContent = step.title;
    card.querySelector('.text').innerHTML = device === 'mouse' ? step.mouse : step.touch;
    card.querySelector('.skip').textContent = 'Skip step';
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
