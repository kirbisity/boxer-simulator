// Level mode, the boss-defeat cutscene on the screen: the thin layer over cutscene.js's state machine. It draws the letterbox bars, the
// title card ('LORD VAELEN · FELLED', gold on black) and its narration, drifting embers, and a skip hint; swings the follow camera
// low onto the boss and back; shakes it; calls the storm's strike and the white flash; slows the world's clock (it is a factor, never a
// stop: the boss's fall is the simulation's own); holds the player while it plays and frees him when it returns (ending.js).
// Styled under "Level Mode: the boss cutscene" in boxer.css.
//
// The page makes one with its hooks and calls, each frame: `frame(dt)` (real seconds), `steer(dt)` after the follow camera is set,
// `jolt(camera)` after the camera is placed, and asks `speed()` for the world's pace. A tap, Enter, Space or Esc skips (after a second).
// Below it, the plot twist's director (createTwistDirector): the dark of the chute and of the cut into the reveal, the reveal's bars and close
// shot of the player kneeling by Caby, and the spoken lines; it plays on the world's clock (ending.js TWIST), so it has nothing to skip.

import { P } from '../body.js';
import { CUTSCENE, createCutscene, cutsceneHolds, cutsceneLook, cutscenePhase, cutsceneSpeed, skipCutscene, stepCutscene } from './cutscene.js';
import { TWIST, endingHold, endingOf, endingRelease, endingWatched, nonameOf } from './ending.js';
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

// ---- The plot twist on the screen -----------------------------------------------------------------------------------------

/** How the twist is framed (cameras and fades, not the story's timings: those are ending.js TWIST's, on the world's clock). */
export const TWIST_CAMERA = {
  // The chute: the camera tips down to look into the hole as the dark comes (rad of pitch; s for the dark to close, and to lift once he is in the sludge).
  fall: { pitch: 1.05, dark: 0.35, lift: 0.9 },
  // The cut into the reveal (s): the dark closes this fast, holds until the scene is set (TWIST.reveal.cut), and lifts over `lift`.
  cut: { dark: 0.3, lift: 0.7 },
  // The reveal: a low, close shot of the two of them from the side (m over the middle of them it looks at; pitch, rad; distance, m), the letterbox
  // bars in and out (s), and the turns off the line across them that it tries, the first that has room.
  reveal: { lift: 0.05, pitch: 0.5, distance: 2.5, bars: 0.6, turns: [1.35, -1.35, 0.9, -0.9, 1.75, -1.75] },
  // A spoken line stays up this long (s of the world's clock).
  line: 4.2,
};

const twSmooth = (u) => {
  const v = Math.min(1, Math.max(0, u));
  return v * v * (3 - 2 * v);
};

/** What the twist puts over the screen now: { black, bars } (0..1), from the ending's phase and how long it has been in it. Pure. */
export function twistLook(world) {
  const ending = endingOf(world);
  if (!ending) return { black: 0, bars: 0 };
  const t = world.time - (ending.since ?? 0);
  if (ending.phase === 'fall') return { black: twSmooth(t / TWIST_CAMERA.fall.dark), bars: 0 };
  if (ending.phase === 'landing') return { black: 1 - twSmooth((world.time - ending.landedAt) / TWIST_CAMERA.fall.lift), bars: 0 };
  if (ending.phase === 'reveal') {
    const { cut, rise } = TWIST.reveal;
    const { bars } = TWIST_CAMERA.reveal;
    const black = t < cut ? twSmooth(t / TWIST_CAMERA.cut.dark) : 1 - twSmooth((t - cut) / TWIST_CAMERA.cut.lift);
    return { black, bars: twSmooth(t / bars) * (1 - twSmooth((t - (rise - bars)) / bars)) };
  }
  return { black: 0, bars: 0 };
}

/**
 * The twist's director (ending.js): the dark of the chute and of the cut into the reveal, the reveal's letterbox and its camera, and the spoken lines
 * (`{ type: 'line' }`) in the lower bar. It reads the ending's phase and the world's clock each frame, so a pause holds it and a restart ends it.
 * `hooks`: orbit() (the follow camera's), roomTest(x, z, y). Returns { frame(world), steer(world), say(world, text), cancel(), active }.
 */
export function createTwistDirector(hooks) {
  let layer = null;
  let nodes = null;
  let line = null;
  let pick = null;
  let busy = false;

  function build() {
    if (layer) return;
    layer = cutsceneElement('div', 'cs-layer tw-layer');
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = '<div class="tw-black"></div><div class="cs-bar cs-top"></div><div class="cs-bar cs-bottom"></div><p class="tw-line"></p>';
    nodes = { black: layer.querySelector('.tw-black'), top: layer.querySelector('.cs-top'), bottom: layer.querySelector('.cs-bottom'), line: layer.querySelector('.tw-line') };
    document.body.append(layer);
  }

  function teardown() {
    layer?.remove();
    layer = nodes = null;
    document.body.classList.remove('cutscene');
  }

  function frame(world) {
    const look = world?.stage?.level ? twistLook(world) : { black: 0, bars: 0 };
    // (A line is the moment's: gone with it, down the chute or up off his knees.)
    const lineUp = Boolean(line) && world === line.world && world.time < line.until && endingOf(world)?.phase === line.phase;
    busy = look.black > 0 || look.bars > 0;
    if (!busy && !lineUp) {
      if (layer) teardown();
      return;
    }
    build();
    nodes.black.style.opacity = String(look.black);
    nodes.top.style.transform = `scaleY(${look.bars})`;
    nodes.bottom.style.transform = `scaleY(${look.bars})`;
    if (lineUp && nodes.line.textContent !== line.text) nodes.line.textContent = line.text;
    nodes.line.classList.toggle('shown', lineUp);
    document.body.classList.toggle('cutscene', look.bars > 0.05);
  }

  /** The chute: the camera looks down into the hole. The reveal: a low, close shot of the two of them, from the side that has room. */
  function steer(world) {
    const ending = endingOf(world);
    const def = world?.stage?.def.ending;
    if (!ending || !def) return;
    const orbit = hooks.orbit();
    const t = world.time - (ending.since ?? 0);
    if (ending.phase === 'fall') {
      const u = Math.min(1, t / TWIST_CAMERA.fall.dark);
      const [x, y, z] = def.hole.at;
      orbit.target.set(orbit.target.x + (x - orbit.target.x) * u, orbit.target.y + (y + 0.4 - orbit.target.y) * u, orbit.target.z + (z - orbit.target.z) * u);
      orbit.pitch += (TWIST_CAMERA.fall.pitch - orbit.pitch) * u;
      return;
    }
    if (ending.phase !== 'reveal' || !ending.posed) {
      pick = null;
      return;
    }
    const swing = twistLook(world).bars;
    const me = world.fighters[0];
    const caby = nonameOf(world);
    if (!caby || swing <= 0) return;
    const spec = TWIST_CAMERA.reveal;
    const head = [me.x[P.head * 3], me.x[P.head * 3 + 1], me.x[P.head * 3 + 2]];
    const neck = [caby.x[P.head * 3], caby.x[P.head * 3 + 1], caby.x[P.head * 3 + 2]];
    const focus = [(head[0] + neck[0]) / 2, (head[1] + neck[1]) / 2 + spec.lift, (head[2] + neck[2]) / 2];
    if (!pick) {
      // Across the line between the two of them, to whichever side the walls leave room for (the first turn that gives most of the distance).
      const across = Math.atan2(neck[2] - head[2], neck[0] - head[0]);
      const reach = (yaw) => {
        for (let along = 0.6; along <= spec.distance; along += 0.2) {
          const flat = Math.cos(spec.pitch) * along;
          if (!hooks.roomTest(focus[0] + Math.cos(yaw) * flat, focus[2] + Math.sin(yaw) * flat, focus[1] + Math.sin(spec.pitch) * along)) return Math.max(0.8, along - 0.2);
        }
        return spec.distance;
      };
      for (const turn of spec.turns) {
        const yaw = across + turn;
        const distance = reach(yaw);
        if (!pick || distance > pick.distance) pick = { yaw, distance };
        if (distance >= spec.distance * 0.9) break;
      }
    }
    orbit.target.set(orbit.target.x + (focus[0] - orbit.target.x) * swing, orbit.target.y + (focus[1] - orbit.target.y) * swing, orbit.target.z + (focus[2] - orbit.target.z) * swing);
    orbit.pitch += (spec.pitch - orbit.pitch) * swing;
    orbit.yaw = turnToward(orbit.yaw, pick.yaw) * swing + orbit.yaw * (1 - swing);
    orbit.distance += (pick.distance - orbit.distance) * swing;
  }

  /** A spoken line (the ending's `{ type: 'line' }`): up in the lower bar for a few seconds. */
  function sayLine(world, text) {
    line = { world, text, until: world.time + TWIST_CAMERA.line, phase: endingOf(world)?.phase };
  }

  function cancel() {
    line = null;
    pick = null;
    busy = false;
    teardown();
  }

  return { frame, steer, say: sayLine, cancel, get active() { return busy; } };
}
