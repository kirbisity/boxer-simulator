// The intro, played on the first visit before the home menu: the legends
// (roster entries with `legend`) brought out in the arena a faction at a
// time, each faction behind its card, then all of them in a line. It only
// chooses who stands where and where the camera looks; main.js stages the
// fighters (the `stage` hooks) in the same world and drawing as everywhere
// else. Skippable at any moment; remembered once seen.

import { FACTIONS } from './outfits.js';
import { WARRIORS } from './roster.js';

export const INTRO = {
  storageKey: 'gladiator.introSeen',
  // Seconds: the opening title, a faction's card (its legends are built behind it,
  // the one still moment), the shot of them, the closing line-up, the fade out.
  // A faction's card holds at least `card`, longer while its fighters are built.
  times: { title: 2.2, card: 0.8, shot: 2.3, lineup: 3.8, fade: 0.45 },
  // With reduced motion: shorter, and the camera cuts rather than moves.
  reduced: { title: 1.4, card: 0.5, shot: 1.7, lineup: 2.6, fade: 0 },
  // Fighters shown together at most (one faction's): each a full model, slow to build.
  together: 2,
  // The line-up: an arc of this radius (m) about a point in front, every man facing it;
  // so far apart (m) beside a man of his own faction, so far from the next faction's.
  arc: { radius: 9, centreZ: 6, spacing: 1.3, factionGap: 1.75 },
  // The Colosseum's sand inside the podium wall (m, half-axes, a little in): the camera stays within it,
  // or above the wall's top (`wall`, m) and the seats behind, rising `rise` m for each wall's radius out, by `clear` m.
  // No further out than `seats` of the wall's radius (the outer wall stands there).
  room: { rx: 10.1, rz: 6.6, wall: 3.6, rise: 8.3, clear: 1.5, seats: 1.5 },
  // The line-up's camera: the turns off square (rad) and pitches tried, the nearest that sees all
  // from inside the wall taken; it starts `closer`, `crane` lower and `swing` round, and moves to it.
  // Further than `farthest` (m), they are too small to make out: the camera pans along them, `few` in view.
  lineup: { farthest: 17, few: 2, turns: [0, 0.25, 0.5, 0.8, 1.1], pitches: [0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 0.9, 1.05], closer: 0.93, crane: 0.12, swing: 0.15 },
  // The bladed stance turns the face this far round from the hips (rad): turned back so the face meets the camera.
  faceTurn: -0.45,
  // A chapter's shot: the camera swings this far round (rad) and closes from `from` to `to` of the framing distance.
  swing: 0.32, push: { from: 1.14, to: 0.98 },
};

/** The legends, in their order (a bare `legend: true` after the numbered). */
export function introLegends(warriors = WARRIORS) {
  const order = (warrior) => (typeof warrior.legend === 'object' ? warrior.legend.order ?? Infinity : Infinity);
  return warriors.filter((warrior) => warrior.legend).sort((a, b) => order(a) - order(b)).map((warrior) => ({
    key: warrior.key,
    name: warrior.title,
    kicker: warrior.legend.kicker ?? FACTIONS[warrior.faction]?.label ?? '',
    line: warrior.legend.line ?? warrior.line,
    faction: warrior.faction,
    inputs: warrior.inputs,
  }));
}

/**
 * The intro's plan: chapters (a faction's legends shown together, up to
 * `together`), each man's place on the line-up's arc and his facing, and
 * the timeline (`shots`, each { kind, start, end, chapter }).
 */
export function introPlan(legends = introLegends(), { reduced = false } = {}) {
  const times = reduced ? INTRO.reduced : INTRO.times;
  const chapters = [];
  for (const legend of legends) {
    const last = chapters[chapters.length - 1];
    if (last && last.faction === legend.faction && last.legends.length < INTRO.together) last.legends.push(legend);
    else chapters.push({ faction: legend.faction, legends: [legend] });
  }
  // Places along the arc: left to right as the camera sees them, in the order shown.
  const { radius, centreZ, spacing, factionGap } = INTRO.arc;
  let along = 0;
  const placed = [];
  chapters.forEach((chapter, index) => {
    if (index) along += factionGap;
    chapter.legends.forEach((legend, at) => {
      if (at) along += spacing;
      placed.push({ legend, along });
    });
  });
  const middle = along / 2;
  for (const { legend, along: s } of placed) {
    const angle = (s - middle) / radius;
    const x = radius * Math.sin(angle);
    const z = centreZ - radius * Math.cos(angle);
    // Facing the arc's centre, where the camera stands for the line-up.
    legend.x = x;
    legend.z = z;
    legend.yaw = Math.atan2(-(centreZ - z), -x) + INTRO.faceTurn;
    legend.look = Math.atan2(centreZ - z, -x);
  }
  const shots = [];
  let clock = 0;
  const add = (kind, length, chapter = null) => {
    shots.push({ kind, start: clock, end: clock + length, chapter });
    clock += length;
  };
  add('title', times.title);
  chapters.forEach((chapter, index) => {
    add('card', times.card, index);
    add('shot', times.shot, index);
  });
  add('lineup', times.lineup);
  add('fade', times.fade);
  return { chapters, legends: placed.map((entry) => entry.legend), shots, length: clock, times, reduced };
}

// ---- Seen before -------------------------------------------------------------
// localStorage may be missing or refuse (a private window, blocked storage):
// then the intro shows once per page load.

const introMemory = { seen: false };

/** Whether this visitor has seen the intro. */
export function introSeen() {
  try {
    return introMemory.seen || globalThis.localStorage?.getItem(INTRO.storageKey) === '1';
  } catch {
    return introMemory.seen;
  }
}

function markIntroSeen() {
  introMemory.seen = true;
  try {
    globalThis.localStorage?.setItem(INTRO.storageKey, '1');
  } catch {
    // Remembered for this page only.
  }
}

/** Play it on this load? Not once seen, nor for an automated browser (tests). */
export function introWanted() {
  return !introSeen() && !globalThis.navigator?.webdriver;
}

// ---- Playing it ------------------------------------------------------------------

const introEase = (share) => share * share * (3 - 2 * share);
const introClamp = (value) => Math.max(0, Math.min(1, value));

const introNode = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

let introRunning = null;

/** Whether the intro is on now. */
export const introPlaying = () => Boolean(introRunning);

/** Stop the intro now, as its Skip button does; false if it was not playing. */
export function skipIntro() {
  if (!introRunning || introRunning.closing()) return false;
  introRunning.finish();
  return true;
}

/** Test hook: move the intro on `seconds` in steps of `dt` (its own clock); the shot it is on, or null once over. */
export function stepIntro(seconds, dt = 1 / 30) {
  let shot = null;
  for (let left = seconds; left > 1e-9 && introRunning; left -= dt) shot = introRunning.step(Math.min(dt, left));
  return introRunning ? shot : null;
}

/**
 * Play the intro. `stage`: main.js's hooks (begin, with the plan, so the legends can be made ready ahead; place, lineup, camera,
 * fit, end); `onDone` runs once it ends or is skipped (the home menu).
 */
export function playIntro(stage, onDone) {
  if (introRunning) return;
  const reduced = Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const plan = introPlan(introLegends(), { reduced });
  const root = introNode('div', 'intro');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Intro: the legends');
  if (reduced) root.classList.add('reduced');
  const title = introNode('div', 'intro-title');
  title.append(introNode('em', '', 'The legends of'), introNode('h1', '', 'Gladiator'), introNode('p', '', 'Fighters of bone, muscle and steel — every blow simulated.'));
  const card = introNode('div', 'intro-card');
  const head = introNode('div', 'intro-faction');
  const captions = introNode('div', 'intro-captions');
  const skip = introNode('button', 'intro-skip', 'Skip ›');
  skip.type = 'button';
  skip.setAttribute('aria-label', 'Skip the intro');
  const progress = introNode('div', 'intro-progress');
  const black = introNode('div', 'intro-black');
  root.append(title, head, captions, card, progress, skip, black);
  document.body.append(root);
  document.body.dataset.intro = 'on';
  stage.begin(plan);

  let clock = 0;
  let last = performance.now();
  let frameId = 0;
  let staged = -1;
  let lineupKeys = null;
  const shotKeys = new Map();
  let finished = false;
  let closing = false;

  const opacity = (node, value) => {
    node.style.opacity = String(value);
    node.style.visibility = value <= 0.001 ? 'hidden' : 'visible';
  };

  // A chapter's card: the faction's glyph, name and blurb (put up as the shot before it ends).
  let carded = -1;
  const fillCard = (index) => {
    if (carded === index || !plan.chapters[index]) return;
    carded = index;
    const faction = FACTIONS[plan.chapters[index].faction] ?? { label: plan.chapters[index].faction, glyph: '', blurb: '' };
    card.replaceChildren(introNode('span', 'glyph', faction.glyph), introNode('h2', '', faction.label), introNode('p', '', faction.blurb));
  };
  // Its shot's faction above, and a caption for each man below.
  const fillCaptions = (chapter) => {
    const faction = FACTIONS[chapter.faction] ?? { label: chapter.faction, glyph: '' };
    head.replaceChildren(introNode('span', '', `${faction.glyph} ${faction.label}`));
    // Left to right as they stand (the camera looks at them from in front).
    const shown = [...chapter.legends].sort((a, b) => a.x - b.x);
    captions.style.setProperty('--count', String(shown.length));
    captions.replaceChildren(...shown.map((legend) => {
      const box = introNode('div', 'intro-caption');
      box.append(introNode('em', '', legend.kicker), introNode('b', '', legend.name), introNode('span', '', legend.line));
      return box;
    }));
  };

  // Whether a camera pose is clear of the arena: within the podium wall, or
  // over it and the seats rising behind it.
  const inside = ({ target: aim, yaw, pitch, distance }) => {
    const x = aim[0] + Math.cos(pitch) * Math.cos(yaw) * distance;
    const y = aim[1] + Math.sin(pitch) * distance;
    const z = aim[2] + Math.cos(pitch) * Math.sin(yaw) * distance;
    const { rx, rz, wall, rise, clear, seats } = INTRO.room;
    const out = Math.hypot(x / rx, z / rz);
    return out < 1 || (out < seats && y > wall + rise * (out - 1) + clear);
  };

  // Framed to fit these points; if that puts the camera in the wall (a narrow
  // screen stands back), from higher up. `margin`: how much further back it may go.
  const framed = (points, pose, target, bounds, margin = 1) => {
    let shot = { ...pose, ...stage.fit(points, { ...pose, target, bounds }) };
    while (!inside({ ...shot, distance: shot.distance * margin }) && shot.pitch < 1.2) {
      const pitch = shot.pitch + 0.1;
      shot = { ...pose, pitch, ...stage.fit(points, { ...pose, pitch, target, bounds }) };
    }
    return shot;
  };

  // The camera's start and end for a chapter: in front of its men, swinging
  // round and closing in, framed to fit above the captions.
  const chapterCamera = (chapter) => {
    const look = chapter.legends.reduce((sum, legend) => sum + legend.look, 0) / chapter.legends.length;
    const x = chapter.legends.reduce((sum, legend) => sum + legend.x, 0) / chapter.legends.length;
    const z = chapter.legends.reduce((sum, legend) => sum + legend.z, 0) / chapter.legends.length;
    const target = [x, 1.0, z];
    const points = chapter.legends.flatMap((legend) => [[-0.75, 0], [0.75, 0], [-0.75, 2.05], [0.75, 2.05]].map(([side, height]) => [legend.x + side * Math.sin(look), height, legend.z - side * Math.cos(look)]));
    const bottom = captionShare();
    const bounds = { left: -0.9, right: 0.9, bottom: -1 + 2 * bottom + 0.04, top: 0.8 };
    const from = { yaw: look - INTRO.swing / 2, pitch: 0.2 };
    const to = { yaw: look + INTRO.swing / 2, pitch: 0.1 };
    const start = framed(points, from, target, bounds, INTRO.push.from);
    const end = framed(points, to, target, bounds, INTRO.push.from);
    return { poses: [{ ...start, distance: start.distance * INTRO.push.from }, { ...end, distance: end.distance * INTRO.push.to }] };
  };

  // The share of the screen's height the captions take, from the bottom.
  const captionShare = () => {
    const box = captions.getBoundingClientRect();
    return box.height ? introClamp((innerHeight - box.top) / innerHeight) : 0.25;
  };

  // The line-up: from the lowest place clear of the arena that sees them all,
  // craning up and back to it; on a narrow screen, a pan along them.
  const lineupCamera = () => {
    const legends = plan.legends;
    const points = legends.flatMap((legend) => [[legend.x, 0, legend.z], [legend.x, 2.05, legend.z]]);
    const target = [0, 0.9, legends.reduce((sum, legend) => sum + legend.z, 0) / legends.length];
    // Above the title, which takes the lower part of the screen.
    const bounds = { left: -0.94, right: 0.94, bottom: -0.2, top: 0.8 };
    // The lowest pitch from which some turn sees them all from inside; at it, the nearest.
    let best = null;
    for (const pitch of INTRO.lineup.pitches) {
      for (const turn of INTRO.lineup.turns) {
        const pose = { yaw: Math.PI / 2 + turn, pitch, ...stage.fit(points, { yaw: Math.PI / 2 + turn, pitch, target, bounds }) };
        if (inside(pose) && (!best || pose.distance < best.distance)) best = pose;
      }
      if (best) break;
    }
    // Too far to make them out (a narrow screen), or nowhere: a pan along the line instead, a few at a time.
    if (!best || best.distance > INTRO.lineup.farthest) {
      const few = INTRO.lineup.few;
      const end = (group) => {
        const look = group.reduce((sum, legend) => sum + legend.look, 0) / group.length;
        const aim = [group.reduce((sum, legend) => sum + legend.x, 0) / group.length, 0.9, group.reduce((sum, legend) => sum + legend.z, 0) / group.length];
        const seen = group.flatMap((legend) => [[-0.8, 0], [0.8, 0], [-0.8, 2.05], [0.8, 2.05]].map(([side, height]) => [legend.x + side * Math.sin(look), height, legend.z - side * Math.cos(look)]));
        return framed(seen, { yaw: look, pitch: 0.3 }, aim, { ...bounds, bottom: -0.45 });
      };
      // Through each few in turn, so the camera keeps round the arc rather than cutting across it.
      // With reduced motion, cuts from each few to the next (`stepped`).
      const firsts = legends.slice(0, legends.length - few + 1).map((legend, at) => at).filter((at, index, all) => !reduced || at % few === 0 || index === all.length - 1);
      return { stepped: true, poses: firsts.map((at) => end(legends.slice(at, at + few))) };
    }
    // Closer and lower along the same line of sight: still inside the wall.
    const start = { ...best, pitch: Math.max(0.05, best.pitch - INTRO.lineup.crane), distance: best.distance * INTRO.lineup.closer, yaw: best.yaw - INTRO.lineup.swing };
    return { poses: [inside(start) ? start : { ...best, distance: best.distance * INTRO.lineup.closer }, best] };
  };

  // The camera `share` of the way along its poses (eased; with reduced motion, at the last, or a cut from one to the next).
  const blendPose = ({ poses, stepped }, share) => {
    if (reduced && stepped) return poses[Math.min(poses.length - 1, Math.floor(introClamp(share) * poses.length))];
    const along = (reduced ? 1 : introEase(introClamp(share))) * (poses.length - 1);
    const at = Math.min(poses.length - 2, Math.floor(along));
    const from = poses[Math.max(0, at)];
    const to = poses[Math.max(0, at) + (poses.length > 1 ? 1 : 0)];
    const part = poses.length > 1 ? along - Math.max(0, at) : 0;
    const mix = (a, b) => a + (b - a) * part;
    return { target: from.target.map((value, index) => mix(value, to.target[index])), yaw: mix(from.yaw, to.yaw), pitch: mix(from.pitch, to.pitch), distance: mix(from.distance, to.distance) };
  };

  const fade = (share, length) => (reduced ? (share > 0 ? 1 : 0) : introClamp(share / length));

  function tick(now) {
    if (finished) return;
    frameId = requestAnimationFrame(tick);
    // A long frame (a build, a hidden tab) does not eat the intro: at most 1/20 s a frame.
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
  }

  function step(dt) {
    clock += dt;
    if (closing || finished) return;
    const shot = plan.shots.find((each) => clock < each.end) ?? plan.shots[plan.shots.length - 1];
    const into = clock - shot.start;
    const length = shot.end - shot.start;
    progress.style.transform = `scaleX(${introClamp(clock / plan.length)})`;
    root.dataset.shot = shot.kind;

    if (shot.kind === 'title') {
      fillCard(0);
      opacity(title, reduced ? 1 : Math.min(introClamp(into / 0.5), introClamp((length - into) / 0.4)));
      opacity(card, reduced ? 0 : introClamp((into - (length - 0.3)) / 0.3));
      opacity(captions, 0);
      opacity(head, 0);
      const swing = reduced ? 0 : into / length;
      // From the sand, looking up past the podium wall at the crowd, turning slowly.
      stage.camera({ target: [0, 3.6, -7], yaw: Math.PI / 2 - 0.3 + swing * 0.35, pitch: -0.2 + swing * 0.04, distance: 11.5 - swing * 0.8 });
    } else if (shot.kind === 'card') {
      opacity(title, 0);
      opacity(card, 1);
      if (staged !== shot.chapter) {
        // The card is up, painted over everything: now the slow part, building the men behind it.
        const chapter = plan.chapters[shot.chapter];
        fillCard(shot.chapter);
        if (into < (reduced ? 0 : 0.05)) return;
        staged = shot.chapter;
        stage.place(chapter.legends);
        opacity(captions, 0);
        fillCaptions(chapter);
        shotKeys.set(shot.chapter, chapterCamera(chapter));
        last = performance.now();
      }
      opacity(card, reduced ? 1 : introClamp((length - into) / 0.3));
      const keys = shotKeys.get(shot.chapter);
      if (keys) stage.camera(blendPose(keys, 0));
      opacity(head, 0);
    } else if (shot.kind === 'shot') {
      const next = plan.shots.find((each) => each.start >= shot.end);
      // Into the next card: it comes up over the last moment of this shot.
      if (next?.kind === 'card' && into > length - 0.3) fillCard(next.chapter);
      opacity(card, next?.kind === 'card' && !reduced ? introClamp((into - (length - 0.3)) / 0.3) : 0);
      const keys = shotKeys.get(shot.chapter);
      if (keys) stage.camera(blendPose(keys, into / length));
      opacity(head, Math.min(fade(into - 0.15, 0.3), fade(length - into, 0.3)));
      opacity(captions, Math.min(fade(into - 0.25, 0.35), fade(length - into, 0.3)));
      // Into the line-up: a short dip to black.
      opacity(black, next?.kind === 'lineup' && !reduced ? introClamp((into - (length - 0.3)) / 0.3) : 0);
    } else if (shot.kind === 'lineup') {
      opacity(card, 0);
      opacity(head, 0);
      opacity(captions, 0);
      if (!lineupKeys) {
        stage.lineup();
        lineupKeys = lineupCamera();
        title.querySelector('em').textContent = 'The legends';
        title.classList.add('low');
        title.querySelector('p').textContent = plan.chapters.map((chapter) => FACTIONS[chapter.faction]?.glyph ?? '').join(' ');
        last = performance.now();
      }
      stage.camera(blendPose(lineupKeys, into / length));
      opacity(black, reduced ? 0 : introClamp(1 - into / 0.35));
      opacity(title, reduced ? 1 : Math.min(introClamp((into - 0.6) / 0.6), 1));
    } else {
      // The fade out, then the menu.
      opacity(black, reduced ? 1 : introClamp(into / length));
      if (clock >= plan.length) finish();
    }
  }

  // Done, or skipped: everything the intro made goes, then the menu (built under the black), then the black lifts.
  function finish() {
    if (closing) return;
    closing = true;
    markIntroSeen();
    window.removeEventListener('keydown', onKey, true);
    root.removeEventListener('click', onClick);
    opacity(black, 1);
    for (const node of [title, card, head, captions, skip, progress]) opacity(node, 0);
    root.style.pointerEvents = 'none';
    // A frame for the black to be painted before the menu's fighters are built.
    // (A hidden page has no frames: then a moment's wait does.)
    let done = false;
    const after = (then) => {
      const once = () => {
        if (done) return;
        done = true;
        then();
      };
      requestAnimationFrame(() => requestAnimationFrame(once));
      setTimeout(once, 120);
    };
    after(() => {
      finished = true;
      cancelAnimationFrame(frameId);
      stage.end();
      introRunning = null;
      delete document.body.dataset.intro;
      onDone?.();
      if (reduced) {
        root.remove();
        return;
      }
      black.style.transition = 'opacity 0.5s ease';
      requestAnimationFrame(() => opacity(black, 0));
      setTimeout(() => root.remove(), 600);
    });
  }

  // Any tap or click skips (the whole overlay is the button); so do Escape, Enter and Space.
  const onClick = (press) => {
    press.preventDefault();
    finish();
  };
  const onKey = (key) => {
    if (!['Escape', 'Enter', ' ', 'Spacebar'].includes(key.key)) return;
    key.preventDefault();
    key.stopPropagation();
    finish();
  };
  root.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey, true);
  // `step`: move the intro on by dt seconds without waiting for frames (tests, a hidden page).
  introRunning = { finish, closing: () => closing, step: (dt) => { step(dt); return root.dataset.shot; } };
  opacity(black, 0);
  opacity(card, 0);
  opacity(head, 0);
  opacity(captions, 0);
  frameId = requestAnimationFrame(tick);
}
