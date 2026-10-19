// Level mode, the boss-defeat cutscene on the screen: the thin layer over cutscene.js's state machine. It draws the letterbox bars, the
// title card ('LORD VAELEN · FELLED', gold on black) and its narration, drifting embers, and a skip hint; swings the follow camera
// low onto the boss and back; shakes it; calls the storm's strike and the white flash; slows the world's clock (it is a factor, never a
// stop: the boss's fall is the simulation's own); holds the player while it plays and frees him when it returns (ending.js).
// Styled under "Level Mode: the boss cutscene" in boxer.css.
//
// The page makes one with its hooks and calls, each frame: `frame(dt)` (real seconds), `steer(dt)` after the follow camera is set,
// `jolt(camera)` after the camera is placed, and asks `speed()` for the world's pace. A tap, Enter, Space or Esc skips (after a second).

import { P } from '../body.js';
import { CUTSCENE, createCutscene, cutsceneHolds, cutsceneLook, cutscenePhase, cutsceneSpeed, skipCutscene, stepCutscene } from './cutscene.js';
import { endingHold, endingRelease, endingWatched } from './ending.js';
import { bossStatus } from './level.js';

/** How the camera frames the boss (it is a camera, not a timing, so it lives here): a low angle, a little way off, looking up at a giant. */
export const CUTSCENE_CAMERA = {
  // The orbit's pitch (rad; negative looks up from below) and distance (m): his fall is wide, and 210 cm of man needs room.
  pitch: -0.14,
  distance: 5.6,
  // m over his hips the camera looks at (his chest: the fall reads best with the head in frame).
  lift: 0.35,
  // Sideways of the line from him to the player (rad): the profile of the fall, not the player's back in the way.
  turns: [0.9, -0.9, 0.5, -0.5, 0],
};

const cutsceneElement = (tag, className, html = '') => Object.assign(document.createElement(tag), { className, innerHTML: html });
const turnToward = (from, to) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from));

/**
 * The director. `hooks`: orbit() (the follow camera's), roomTest(x, z, y) (the stage's camera room: true where the lens fits), strike() (the
 * storm's lightning now), flash(strength) (the white), now() (real s, unused but for the tests' clock). Returns
 * { start(world), frame(dt), steer(dt), jolt(camera), speed(), cancel(), skip(), active }.
 */
export function createCutsceneDirector(hooks) {
  let run = null;
  let layer = null;
  let nodes = null;
  const sway = { x: 0, y: 0, z: 0 };

  const onKey = (event) => {
    if (!run || !cutsceneHolds(run.state) || event.repeat || !['Enter', ' ', 'Escape', 'Spacebar'].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    skip();
  };
  const onTap = (event) => {
    if (!run || !cutsceneHolds(run.state)) return;
    // (Anything tapped while the scene plays is the scene's: no blow is thrown behind it.)
    event.preventDefault();
    event.stopPropagation();
    skip();
  };

  function build(name) {
    layer = cutsceneElement('div', 'cs-layer');
    layer.setAttribute('aria-hidden', 'true');
    const embers = Array.from({ length: 16 }, (_, index) => `<i style="left:${(index * 53 + 11) % 100}%;animation-delay:${((index * 37) % 50) / 10}s;animation-duration:${5 + (index % 5)}s"></i>`).join('');
    layer.innerHTML = `<div class="cs-bar cs-top"></div><div class="cs-bar cs-bottom"></div><div class="cs-embers">${embers}</div>
      <div class="cs-title"><div class="cs-name"><span></span><em>·</em><b>${CUTSCENE.words.felled}</b></div><div class="cs-rule"></div><p class="cs-line"></p></div>
      <div class="cs-skip">Tap to skip</div>`;
    layer.querySelector('.cs-name span').textContent = name.toUpperCase();
    layer.querySelector('.cs-line').innerHTML = CUTSCENE.words.line.map((line) => `<span></span>`).join('');
    layer.querySelectorAll('.cs-line span').forEach((span, index) => { span.textContent = CUTSCENE.words.line[index]; });
    nodes = {
      top: layer.querySelector('.cs-top'), bottom: layer.querySelector('.cs-bottom'), title: layer.querySelector('.cs-title'),
      line: layer.querySelector('.cs-line'), embers: layer.querySelector('.cs-embers'), skip: layer.querySelector('.cs-skip'),
    };
    document.body.append(layer);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onTap, true);
  }

  function teardown() {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onTap, true);
    layer?.remove();
    document.body.classList.remove('cutscene');
    layer = nodes = null;
    sway.x = sway.y = sway.z = 0;
  }

  function start(world) {
    if (run) return false;
    run = { world, state: createCutscene(), yaw: null };
    endingWatched(world);
    endingHold(world, true);
    build(bossStatus(world).name || 'The boss');
    return true;
  }

  /** The strike, the flash, the cards, the return of control, each as the machine fires it. */
  function frame(dt) {
    if (!run) return;
    const { world, state } = run;
    for (const event of stepCutscene(state, dt)) {
      if (event === 'strike') {
        hooks.strike();
        hooks.flash(state.config.flash.strength);
      } else if (event === 'return') endingRelease(world);
    }
    const look = cutsceneLook(state);
    document.body.classList.toggle('cutscene', look.hold);
    nodes.top.style.transform = `scaleY(${look.bars})`;
    nodes.bottom.style.transform = `scaleY(${look.bars})`;
    nodes.title.style.opacity = String(look.title);
    nodes.line.style.opacity = String(look.line);
    nodes.embers.style.opacity = String(Math.min(1, look.bars) * 0.9);
    nodes.skip.style.opacity = String(state.time >= state.config.skipAfter && cutscenePhase(state) !== 'return' ? 0.7 : 0);
    // The thunder: a shake that sways the camera a little, along no axis in particular.
    const t = state.time * 31;
    sway.x = Math.sin(t * 1.3) * look.shake;
    sway.y = Math.sin(t * 1.7 + 1) * look.shake * 0.7;
    sway.z = Math.cos(t * 1.1 + 2) * look.shake;
    if (state.done) {
      teardown();
      run = null;
    }
  }

  /** Swing the follow camera's orbit toward the boss (low, in profile) by how far the scene has taken it, and back. */
  function steer(dt) {
    if (!run) return;
    const { world, state } = run;
    const { swing } = cutsceneLook(state);
    if (swing <= 0) return;
    const boss = world.fighters[world.stage.level.boss?.id];
    if (!boss) return;
    const orbit = hooks.orbit();
    const focus = [boss.x[P.pelvis * 3], boss.x[P.pelvis * 3 + 1] + CUTSCENE_CAMERA.lift, boss.x[P.pelvis * 3 + 2]];
    orbit.target.set(orbit.target.x + (focus[0] - orbit.target.x) * swing, orbit.target.y + (focus[1] - orbit.target.y) * swing, orbit.target.z + (focus[2] - orbit.target.z) * swing);
    orbit.pitch += (CUTSCENE_CAMERA.pitch - orbit.pitch) * swing;
    const wanted = CUTSCENE_CAMERA.distance;
    // In profile: toward the player's side, as far round as the stage's walls leave room for (the first turn that gives most of the distance, else the one that gives the most).
    const me = world.fighters[0];
    const toward = Math.atan2(me.x[P.pelvis * 3 + 2] - focus[2], me.x[P.pelvis * 3] - focus[0]);
    if (run.yaw === null || swing < 0.05) run.yaw = null;
    if (run.yaw === null) {
      const reach = (yaw) => {
        for (let along = 1; along <= wanted; along += 0.25) {
          const flat = Math.cos(CUTSCENE_CAMERA.pitch) * along;
          if (!hooks.roomTest(focus[0] + Math.cos(yaw) * flat, focus[2] + Math.sin(yaw) * flat, focus[1] + Math.sin(CUTSCENE_CAMERA.pitch) * along)) return Math.max(1, along - 0.25);
        }
        return wanted;
      };
      let best = null;
      for (const turn of CUTSCENE_CAMERA.turns) {
        const yaw = toward + turn;
        const distance = reach(yaw);
        if (!best || distance > best.distance) best = { yaw, distance };
        if (distance >= wanted * 0.85) break;
      }
      run.yaw = best.yaw;
      run.distance = best.distance;
    }
    orbit.yaw = turnToward(orbit.yaw, run.yaw) * swing + orbit.yaw * (1 - swing);
    orbit.distance += (Math.min(wanted, run.distance) - orbit.distance) * swing;
  }

  /** After the camera is placed: the shake. */
  function jolt(camera) {
    if (!run) return;
    camera.position.x += sway.x;
    camera.position.y += sway.y;
    camera.position.z += sway.z;
  }

  function skip() {
    return Boolean(run) && skipCutscene(run.state);
  }

  function cancel() {
    if (!run) return;
    endingHold(run.world, false);
    teardown();
    run = null;
  }

  return {
    start, frame, steer, jolt, skip, cancel,
    speed: () => (run ? cutsceneSpeed(run.state) : 1),
    get active() { return Boolean(run); },
    get state() { return run?.state ?? null; },
  };
}
