// Page wiring: builder, HUD, controls, and the loop that steps the world and
// draws it. The simulation runs at a fixed step whatever the frame rate.

import { buildBody, fighterFile, PRESETS } from './body.js';
import { thinkAll } from './ai.js';
import { advance, boutWinner, createWorld, throwPunch } from './physics.js';
import { buildFighterView, createScene, disposeFighterView, placeCamera, render, resize, setLayer, showImpact, updateFighterView, updateSpray } from './render.js';

const STEP = 1 / 60;
const $ = (selector) => document.querySelector(selector);

const state = {
  corners: { red: { ...PRESETS.heavy, skinTone: 'tan' }, blue: { ...PRESETS.light, skinTone: 'light' } },
  world: null,
  views: [],
  layer: 'skin',
  speed: 1,
  paused: false,
  mode: 'watch',
  aimBody: false,
  seed: 7,
  eventCursor: 0,
  accumulator: 0,
  finishedAt: null,
};

const scene = createScene($('#stage'));

function newBout() {
  for (const view of state.views) disposeFighterView(scene, view);
  state.seed += 1;
  state.world = createWorld([{ inputs: state.corners.red, corner: 'red' }, { inputs: state.corners.blue, corner: 'blue' }], { seed: state.seed });
  state.views = state.world.fighters.map((fighter) => {
    const look = state.corners[fighter.corner];
    const view = buildFighterView(scene, fighter, { skinTone: look.skinTone, hairColor: fighter.corner === 'red' ? 0x1b1410 : 0x6b4a2a });
    setLayer(view, state.layer);
    return view;
  });
  state.eventCursor = 0;
  state.finishedAt = null;
  $('#log').replaceChildren();
  $('#banner').hidden = true;
  renderHud();
}

// ---- Loop -------------------------------------------------------------------

function thinkForBout(world, dt) {
  const players = state.mode === 'play' ? new Set([0]) : new Set();
  thinkAll(world, dt, players);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!state.paused) tick(dt * state.speed);
  draw(dt);
  requestAnimationFrame(frame);
}

function tick(seconds) {
  state.accumulator += seconds;
  const steps = Math.floor(state.accumulator / STEP);
  if (steps > 0) {
    advance(state.world, steps * STEP, thinkForBout, STEP);
    state.accumulator -= steps * STEP;
  }
  consumeEvents();
  const winner = boutWinner(state.world);
  if (winner && state.finishedAt === null) {
    state.finishedAt = state.world.time;
    const name = state.corners[winner].name;
    $('#banner').hidden = false;
    $('#banner-text').textContent = `KO — ${name} wins`;
  }
}

function draw(dt) {
  const world = state.world;
  const pelvisMid = [0, 0, 0];
  for (const fighter of world.fighters) {
    pelvisMid[0] += fighter.x[24] / world.fighters.length;
    pelvisMid[2] += fighter.x[26] / world.fighters.length;
  }
  placeCamera(scene, pelvisMid);
  for (const view of state.views) updateFighterView(view, dt * (state.paused ? 0 : state.speed));
  updateSpray(scene, dt * (state.paused ? 0 : state.speed));
  render(scene);
  renderHud();
}

function consumeEvents() {
  const events = state.world.events;
  while (state.eventCursor < events.length) {
    const event = events[state.eventCursor];
    state.eventCursor += 1;
    if (event.kind === 'landed' || event.kind === 'blocked') showImpact(scene, state.views, event);
    logEvent(event);
  }
}

// ---- HUD and log ----------------------------------------------------------

function renderHud() {
  for (const fighter of state.world?.fighters ?? []) {
    const card = $(`#hud-${fighter.corner}`);
    card.querySelector('.name').textContent = state.corners[fighter.corner].name;
    card.querySelector('.stamina i').style.width = `${Math.round(fighter.stamina * 100)}%`;
    const capacity = 4 * fighter.body.chin * (fighter.knockdowns + 1);
    card.querySelector('.brain i').style.width = `${Math.min(100, Math.round((fighter.concussion / capacity) * 100))}%`;
    card.querySelector('.kd').textContent = fighter.state === 'out' ? 'OUT' : fighter.state === 'down' ? 'DOWN' : `KD ${fighter.knockdowns}`;
    card.querySelector('.speed').textContent = `${fighter.stats.lastHandSpeed.toFixed(1)} m/s`;
  }
  const time = state.world?.time ?? 0;
  $('#clock').textContent = `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
}

function logEvent(event) {
  const world = state.world;
  const name = (id) => state.corners[world.fighters[id].corner].name.split(' ')[0];
  let text;
  if (event.kind === 'stopped') text = `<b>${name(event.fighter)}</b> cannot continue`;
  else {
    const where = event.kind === 'blocked' ? `blocked by ${event.target.replace(/^[lr]/, '').toLowerCase()}` : `→ ${event.target}`;
    const head = event.target === 'head' ? ` · head Δv <b>${event.headDeltaV.toFixed(2)}</b> m/s` : '';
    text = `<b>${name(event.attacker)}</b> ${event.punch} ${where} · ${event.speed.toFixed(1)} m/s · ${event.impulse.toFixed(1)} N·s · ${Math.round(event.force).toLocaleString()} N${head}`;
    if (event.effects.length) text += ` · <em>${event.effects.join(', ')}</em>`;
  }
  const row = document.createElement('li');
  row.innerHTML = text;
  if (event.effects?.some((effect) => effect.startsWith('knockdown'))) row.className = 'big';
  const log = $('#log');
  log.prepend(row);
  while (log.children.length > 5) log.lastChild.remove();
}

// ---- Controls ---------------------------------------------------------------

function segmented(selector, onPick) {
  const group = $(selector);
  group.addEventListener('click', (click) => {
    const button = click.target.closest('button[data-value]');
    if (!button) return;
    for (const other of group.querySelectorAll('button')) other.classList.toggle('on', other === button);
    onPick(button.dataset.value);
  });
}

segmented('#layers', (layer) => {
  state.layer = layer;
  for (const view of state.views) setLayer(view, layer);
});
segmented('#corner-tabs', (corner) => { $('.corners').dataset.showing = corner; });
segmented('#speeds', (speed) => { state.speed = Number(speed); });
segmented('#modes', (mode) => {
  state.mode = mode;
  $('#pad').hidden = mode !== 'play';
  document.body.classList.toggle('playing', mode === 'play');
});
$('#pause').addEventListener('click', () => {
  state.paused = !state.paused;
  $('#pause').textContent = state.paused ? 'Play' : 'Pause';
});
$('#restart').addEventListener('click', newBout);
$('#banner-again').addEventListener('click', newBout);

const player = () => state.world.fighters[0];
const COMMANDS = {
  jab: () => throwPunch(state.world, player(), 'jab', state.aimBody ? 'body' : 'head'),
  cross: () => throwPunch(state.world, player(), 'cross', state.aimBody ? 'body' : 'head'),
  hook: () => throwPunch(state.world, player(), 'hook', state.aimBody ? 'body' : 'head'),
  uppercut: () => throwPunch(state.world, player(), 'uppercut', state.aimBody ? 'body' : 'head'),
  guard: () => { player().guardHigh = 0.6; },
  slip: () => {
    player().slip = 0.32;
    player().slipSide = Math.random() < 0.5 ? 1 : -1;
  },
  body: () => {
    state.aimBody = !state.aimBody;
    $('[data-command="body"]').classList.toggle('on', state.aimBody);
  },
};
$('#pad').addEventListener('pointerdown', (press) => {
  const button = press.target.closest('button');
  if (!button) return;
  if (button.dataset.move) {
    player().move = Number(button.dataset.move);
    const stop = () => {
      player().move = 0;
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointerup', stop);
  } else COMMANDS[button.dataset.command]?.();
});
const KEYS = { j: 'jab', k: 'cross', h: 'hook', u: 'uppercut', ' ': 'guard', s: 'slip', b: 'body' };
window.addEventListener('keydown', (press) => {
  if (state.mode !== 'play' || press.target.closest('input, select')) return;
  if (press.key === 'a' || press.key === 'ArrowLeft') player().move = -1;
  else if (press.key === 'd' || press.key === 'ArrowRight') player().move = 1;
  else if (KEYS[press.key]) {
    press.preventDefault();
    COMMANDS[KEYS[press.key]]();
  }
});
window.addEventListener('keyup', (press) => {
  if (state.mode === 'play' && ['a', 'd', 'ArrowLeft', 'ArrowRight'].includes(press.key)) player().move = 0;
});

// Orbit: drag to turn, wheel or pinch to zoom.
const canvas = $('#stage');
const pointers = new Map();
canvas.addEventListener('pointerdown', (press) => {
  canvas.setPointerCapture(press.pointerId);
  pointers.set(press.pointerId, [press.clientX, press.clientY]);
});
canvas.addEventListener('pointermove', (move) => {
  if (!pointers.has(move.pointerId)) return;
  const [x, y] = pointers.get(move.pointerId);
  if (pointers.size === 1) {
    scene.orbit.yaw += (move.clientX - x) * 0.008;
    scene.orbit.pitch = Math.max(-0.05, Math.min(1.3, scene.orbit.pitch + (move.clientY - y) * 0.006));
  } else if (pointers.size === 2) {
    const [other] = [...pointers.entries()].filter(([id]) => id !== move.pointerId).map(([, position]) => position);
    const before = Math.hypot(x - other[0], y - other[1]);
    const after = Math.hypot(move.clientX - other[0], move.clientY - other[1]);
    scene.orbit.distance = Math.max(1.6, Math.min(12, scene.orbit.distance * (before / Math.max(1, after))));
  }
  pointers.set(move.pointerId, [move.clientX, move.clientY]);
});
const release = (up) => pointers.delete(up.pointerId);
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('wheel', (wheel) => {
  wheel.preventDefault();
  scene.orbit.distance = Math.max(1.6, Math.min(12, scene.orbit.distance * Math.exp(wheel.deltaY * 0.001)));
}, { passive: false });

// ---- Builder ----------------------------------------------------------------

const FIELDS = [
  { key: 'sex', label: 'Sex', type: 'select', options: ['male', 'female'] },
  { key: 'heightCm', label: 'Height', type: 'range', min: 150, max: 210, step: 1, unit: 'cm' },
  { key: 'frame', label: 'Frame', type: 'select', options: ['small', 'medium', 'large'] },
  { key: 'age', label: 'Age', type: 'range', min: 18, max: 60, step: 1, unit: 'yr' },
  { key: 'training', label: 'Training', type: 'range', min: 0, max: 1, step: 0.05, format: (value) => `${Math.round(value * 100)}%` },
  { key: 'bodyFat', label: 'Body fat', type: 'range', min: 0.06, max: 0.4, step: 0.01, format: (value) => `${Math.round(value * 100)}%` },
  { key: 'skinTone', label: 'Skin', type: 'select', options: ['light', 'medium', 'tan', 'deep'] },
];

function buildCornerForm(corner) {
  const form = $(`#build-${corner}`);
  const presetSelect = form.querySelector('.preset');
  presetSelect.replaceChildren(...Object.entries(PRESETS).map(([key, preset]) => new Option(preset.name, key)));
  presetSelect.value = Object.keys(PRESETS).find((key) => PRESETS[key].name === state.corners[corner].name) ?? 'heavy';
  presetSelect.addEventListener('change', () => {
    state.corners[corner] = { ...PRESETS[presetSelect.value], skinTone: state.corners[corner].skinTone };
    fillCornerForm(corner);
  });
  const fields = form.querySelector('.fields');
  fields.replaceChildren(...FIELDS.map((field) => {
    const row = document.createElement('label');
    row.className = 'field';
    row.innerHTML = `<span>${field.label}</span>`;
    const input = field.type === 'select' ? document.createElement('select') : document.createElement('input');
    if (field.type === 'select') input.append(...field.options.map((option) => new Option(option, option)));
    else Object.assign(input, { type: 'range', min: field.min, max: field.max, step: field.step });
    input.dataset.key = field.key;
    const value = document.createElement('output');
    row.append(input, value);
    input.addEventListener('input', () => {
      state.corners[corner][field.key] = field.type === 'range' ? Number(input.value) : input.value;
      fillCornerForm(corner);
    });
    return row;
  }));
  form.querySelector('.copy').addEventListener('click', async () => {
    const code = btoa(JSON.stringify(fighterFile(state.corners[corner])));
    const box = form.querySelector('.code');
    box.value = code;
    try {
      await navigator.clipboard.writeText(code);
      form.querySelector('.copy').textContent = 'Copied';
    } catch {
      box.select();
    }
  });
  form.querySelector('.load').addEventListener('click', () => {
    try {
      const file = JSON.parse(atob(form.querySelector('.code').value.trim()));
      if (file.kind !== 'boxer-simulator/fighter') throw new Error('not a fighter file');
      state.corners[corner] = { ...file.inputs, skinTone: state.corners[corner].skinTone };
      fillCornerForm(corner);
    } catch {
      form.querySelector('.code').value = 'That code is not a fighter file.';
    }
  });
  form.querySelector('.name-input').addEventListener('input', (typed) => {
    state.corners[corner].name = typed.target.value || 'Fighter';
  });
  fillCornerForm(corner);
}

function fillCornerForm(corner) {
  const form = $(`#build-${corner}`);
  const inputs = state.corners[corner];
  form.querySelector('.name-input').value = inputs.name;
  form.querySelector('.copy').textContent = 'Copy code';
  for (const field of FIELDS) {
    const input = form.querySelector(`[data-key="${field.key}"]`);
    input.value = inputs[field.key];
    input.nextElementSibling.textContent = field.format ? field.format(inputs[field.key]) : field.unit ? `${inputs[field.key]} ${field.unit}` : '';
  }
  const body = buildBody(inputs);
  const rows = [
    ['Weight', `${body.massKg.toFixed(1)} kg`], ['Muscle', `${body.muscleKg.toFixed(1)} kg`],
    ['Bone', `${body.boneKg.toFixed(1)} kg`], ['Fat', `${body.fatKg.toFixed(1)} kg`],
    ['Reach', `${Math.round(body.reach * 100)} cm`], ['Bone density', `${Math.round(body.boneDensity * 100)}%`],
    ['Punch force', `${Math.round(body.motorForce[7])} N`], ['Cross mass', `${body.strikeMass.cross.toFixed(1)} kg`],
    ['Chin', `${body.chin.toFixed(2)} m/s`], ['Engine', `${Math.round(body.aerobic * 100)}%`],
  ];
  form.querySelector('.derived').innerHTML = rows.map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('');
}

$('#open-builder').addEventListener('click', () => {
  $('#builder').hidden = false;
  state.paused = true;
});
$('#close-builder').addEventListener('click', () => {
  $('#builder').hidden = true;
  state.paused = false;
  $('#pause').textContent = 'Pause';
  newBout();
});

// ---- Start -------------------------------------------------------------------

function fit() {
  const box = canvas.getBoundingClientRect();
  resize(scene, box.width, box.height);
}
window.addEventListener('resize', fit);
buildCornerForm('red');
buildCornerForm('blue');
newBout();
fit();
requestAnimationFrame(frame);

// Test hook: step the world by seconds without the frame clock.
window.boxer = {
  state,
  scene,
  advance: (seconds) => {
    tick(seconds);
    draw(0);
  },
};
