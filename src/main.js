// Page wiring: builder, HUD, controls, and the loop that steps the world and
// draws it. The simulation runs at a fixed step whatever the frame rate.

import { buildBody, fighterFile, FRAMES, normaliseInputs, P, PRESETS } from './body.js';
import { calorieRange, caloriesForWeight, deriveStats, exerciseHours } from './physiology.js';
import { thinkAll } from './ai.js';
import { MOVES, STRATEGIES, STYLE_KEYS, STYLES } from './moves.js';
import { advance, boutWinner, concussionCapacity, createWorld, perform, placeFighter, throwPunch } from './physics.js';
import { DEFAULT_LOOK, LOOK_OPTIONS } from './face.js';
import { STYLE } from './toon.js';
import { crewFighter, SCENARIOS, scenarioFighters } from './scenarios.js';
import { OUTFIT_KEYS, OUTFITS, outfitOf } from './outfits.js';
import { addIcon, dramaCamera, momentFor, momentPlaying, resetDrama, startMoment, timeScale, updateIcons } from './drama.js';
import { buildFighterView, SKIN_TONES, createScene, disposeFighterView, placeCamera, render, resize, setLayer, setPlace, showImpact, updateFighterView, updateProps, updateSpray } from './render.js';

const STEP = 1 / 60;
const $ = (selector) => document.querySelector(selector);

const state = {
  // Each side's fighters, in order (the first leads); the builder edits one
  // of each side at a time, the one `editing` points to.
  rosters: { red: [normaliseInputs(structuredClone(PRESETS.heavy))], blue: [normaliseInputs(structuredClone(PRESETS.light))] },
  editing: { red: 0, blue: 0 },
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
  drama: { active: null, icons: [] },
  scenario: null,
  // How many on each side: 1 to 8, not necessarily the same.
  teamSizes: { red: 1, blue: 1 },
  sandboxRosters: null,
  levelRosters: {},
};
const realSeconds = () => performance.now() / 1000;
/** A short name for crowded places: the first name, and its number if it has one ("Dave 2"). */
const shortName = (name) => {
  const number = name.match(/ (\d+)$/);
  return `${name.split(' ')[0]}${number ? ` ${number[1]}` : ''}`;
};

const scene = createScene($('#stage'));

/** The fighter of a side the builder is editing, and replacing it. */
const current = (corner) => state.rosters[corner][state.editing[corner]];
const setCurrent = (corner, inputs) => { state.rosters[corner][state.editing[corner]] = inputs; };

/**
 * Fill a side's roster up to its size: the level's crew or, in the ring,
 * the presets, each in the lead's style. Members already there — and any
 * edits to them — are kept, even past the size, so shrinking a side and
 * growing it again brings the same people back.
 */
function ensureRoster(corner, scenario) {
  const roster = state.rosters[corner];
  const lead = roster[0];
  while (roster.length < state.teamSizes[corner]) {
    const index = roster.length - 1;
    const crew = scenario?.crews?.[corner];
    let mate;
    if (crew) mate = crewFighter(lead, crew[index % crew.length]);
    else {
      const leads = new Set([state.rosters.red[0].name, state.rosters.blue[0].name]);
      const spare = Object.values(PRESETS).filter((preset) => !leads.has(preset.name));
      mate = normaliseInputs({ ...structuredClone(spare[(index + (corner === 'blue' ? 2 : 0)) % spare.length]), style: lead.style });
    }
    // A name already in the fight gets a number.
    const taken = new Set([...state.rosters.red, ...state.rosters.blue].map((fighter) => fighter.name));
    let name = mate.name;
    for (let count = 2; taken.has(name); count += 1) name = `${mate.name.split(' ')[0]} ${count}`;
    roster.push({ ...mate, name });
  }
}

/** A side's fighters for a bout: its roster, as many as the side has. */
function teamFor(corner, scenario) {
  ensureRoster(corner, scenario);
  return state.rosters[corner].slice(0, state.teamSizes[corner]);
}

function newBout() {
  state.seed += 1;
  // A scenario is the same world on its own floor, with its own people.
  const scenario = state.scenario ? SCENARIOS[state.scenario] : null;
  // Each side: its lead (the one the builder edits) and, in a team fight,
  // the level's crew or, in the ring, fighters from the presets.
  const sides = ['red', 'blue'].map((corner) => teamFor(corner, scenario).map((inputs) => ({ inputs, corner })));
  // Five presets for six places: a name used twice gets a number.
  const names = new Map();
  for (const entry of [...sides[0], ...sides[1]]) {
    const count = (names.get(entry.inputs.name) ?? 0) + 1;
    names.set(entry.inputs.name, count);
    if (count > 1) entry.inputs = { ...entry.inputs, name: `${entry.inputs.name.split(" ")[0]} ${count}` };
  }
  state.world = createWorld([...sides[0], ...sides[1]], { seed: state.seed, arena: scenario?.arena });
  setPlace(scene, scenario?.scene ?? 'ring', scenario?.arena);
  if (scenario) Object.assign(scene.orbit, scenario.camera);
  document.body.dataset.place = scenario?.scene ?? 'ring';
  rebuildViews();
  state.eventCursor = 0;
  state.finishedAt = null;
  resetDrama(state.drama);
  $('#log').replaceChildren();
  $('#banner').hidden = true;
  renderHud();
  if (state.mode === 'play') buildPad();
}

/** Rebuild the fighters' models, for a new bout or a new shading style. */
function rebuildViews() {
  for (const view of state.views) disposeFighterView(scene, view);
  state.views = state.world.fighters.map((fighter) => {
    const view = buildFighterView(scene, fighter);
    setLayer(view, state.layer);
    return view;
  });
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
  // A big moment slows the simulation, not the drawing.
  if (!state.paused) tick(dt * state.speed * timeScale(state.drama, realSeconds()));
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
  if (winner && state.finishedAt === null && !momentPlaying(state.drama, realSeconds())) {
    state.finishedAt = state.world.time;
    const team = state.world.fighters.filter((fighter) => fighter.corner === winner);
    const name = team.length > 1 ? `${winner === 'red' ? 'Red' : 'Blue'} team` : team[0].body.inputs.name;
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
  // A crowd needs a wider shot: back off with the spread of the fighters.
  if (world.fighters.length > 2 && !document.body.classList.contains('sheet')) {
    const spread = Math.max(...world.fighters.map((fighter) => Math.hypot(fighter.x[24] - pelvisMid[0], fighter.x[26] - pelvisMid[2])));
    scene.orbit.distance += (Math.max(5.2, 3.4 + spread * 2.2) - scene.orbit.distance) * 0.03;
  }
  // A design sheet holds its own framing.
  placeCamera(scene, document.body.classList.contains('sheet') ? null : pelvisMid);
  dramaCamera(scene, state.drama, world, realSeconds());
  for (const view of state.views) updateFighterView(view, dt * (state.paused ? 0 : state.speed), world.time);
  updateProps(scene, state.views, world);
  updateSpray(scene, dt * (state.paused ? 0 : state.speed));
  render(scene);
  updateIcons(state.drama, scene, world, canvas, realSeconds());
  renderHud();
}

function consumeEvents() {
  const events = state.world.events;
  while (state.eventCursor < events.length) {
    const event = events[state.eventCursor];
    state.eventCursor += 1;
    if (event.kind === 'landed' || event.kind === 'blocked') showImpact(scene, state.views, event);
    const moment = momentFor(event);
    if (moment) {
      startMoment(state.drama, moment, realSeconds());
      addIcon(state.drama, moment, realSeconds());
    }
    logEvent(event);
  }
}

// ---- HUD and log ----------------------------------------------------------

function renderHud() {
  for (const corner of ['red', 'blue']) {
    const team = (state.world?.fighters ?? []).filter((fighter) => fighter.corner === corner);
    if (!team.length) continue;
    // The card follows the lead; a team fight lists everyone under it.
    const fighter = team[0];
    const card = $(`#hud-${corner}`);
    card.querySelector('.name').textContent = fighter.body.inputs.name;
    card.querySelector('.stamina i').style.width = `${Math.round(fighter.stamina * 100)}%`;
    const capacity = concussionCapacity(fighter);
    card.querySelector('.brain i').style.width = `${Math.min(100, Math.round((fighter.concussion / capacity) * 100))}%`;
    card.querySelector('.kd').textContent = fighter.state === 'out' ? 'OUT' : fighter.state === 'down' ? 'DOWN' : `KD ${fighter.knockdowns}`;
    const nerve = fighter.aiConfidence ?? 0;
    const mood = nerve > 0.35 ? ' · confident' : nerve < -0.35 ? ' · wary' : '';
    card.querySelector('.speed').textContent = `${fighter.stats.lastHandSpeed.toFixed(1)} m/s${mood}`;
    let roster = card.querySelector('.roster');
    if (!roster) roster = card.appendChild(Object.assign(document.createElement('div'), { className: 'roster' }));
    roster.hidden = team.length < 2;
    roster.innerHTML = team.map((member) => {
      const status = member.state === 'out' ? 'out' : member.state === 'up' ? 'up' : 'down';
      return `<span class="${status}">${shortName(member.body.inputs.name)}</span>`;
    }).join('');
  }
  const time = state.world?.time ?? 0;
  $('#clock').textContent = `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
}

function logEvent(event) {
  const world = state.world;
  const name = (id) => shortName(world.fighters[id].body.inputs.name);
  let text;
  if (event.kind === 'stopped') text = `<b>${name(event.fighter)}</b> cannot continue`;
  else if (event.kind === 'knockout') text = `💥 <b>${name(event.fighter)}</b> is out cold · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'broken') text = `🦴 <b>${name(event.fighter)}</b> · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'heavy') text = `<b>${name(event.attacker)}</b> loads up a heavy ${event.punch}`;
  else if (event.kind === 'focus') return;
  else if (event.kind === 'strategy') text = `<b>${name(event.fighter)}</b> switches to ${STRATEGIES[event.strategy]?.label ?? event.strategy}`;
  else if (event.kind === 'accessory') text = `${event.icon} <b>${name(event.fighter)}</b>'s ${event.item} goes flying`;
  else if (event.kind === 'fell') text = `<b>${name(event.fighter)}</b> goes over · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'clinch') text = `<b>${name(event.attacker)}</b> takes the clinch`;
  else if (event.kind === 'collision') text = `<b>${name(event.attacker)}</b> charges in · ${event.speed.toFixed(1)} m/s · ${event.impulse.toFixed(0)} N·s of momentum`;
  else if (event.attacker === undefined || event.speed === undefined) return;
  else {
    const where = event.kind === 'blocked' ? `blocked by ${event.target.replace(/^[lr]/, '').toLowerCase()}` : `→ ${event.target}`;
    const head = event.target === 'head' ? ` · head Δv <b>${event.headDeltaV.toFixed(2)}</b> m/s` : '';
    text = `<b>${name(event.attacker)}</b> ${event.punch} ${where} · ${event.speed.toFixed(1)} m/s · ${event.impulse.toFixed(1)} N·s · ${Math.round(event.force).toLocaleString()} N${head}`;
    if (event.effects.length) text += ` · <em>${event.effects.join(', ')}</em>`;
  }
  const row = document.createElement('li');
  row.innerHTML = text;
  if (event.kind === 'knockout' || event.kind === 'broken' || event.effects?.some((effect) => effect.startsWith('knockdown'))) row.className = 'big';
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
segmented('#styles', (style) => {
  STYLE.current = style;
  rebuildViews();
});
segmented('#speeds', (speed) => { state.speed = Number(speed); });
for (const corner of ['red', 'blue']) {
  const select = $(`#team-${corner}`);
  select.append(...Array.from({ length: 8 }, (_, index) => new Option(String(index + 1), String(index + 1))));
  select.addEventListener('change', () => {
    state.teamSizes[corner] = Number(select.value);
    refreshBuilder();
    newBout();
  });
}
segmented('#modes', (mode) => {
  state.mode = mode;
  $('#pad').hidden = mode !== 'play';
  if (mode === 'play') buildPad();
  document.body.classList.toggle('playing', mode === 'play');
});
$('#pause').addEventListener('click', () => {
  state.paused = !state.paused;
  $('#pause').textContent = state.paused ? 'Play' : 'Pause';
});
$('#restart').addEventListener('click', newBout);
$('#banner-again').addEventListener('click', newBout);

const player = () => state.world.fighters[0];
// Keys: punches on the right hand's home row, kicks and knees above and
// below, defences on the left hand.
const KEYS = {
  j: 'jab', k: 'cross', h: 'hook', u: 'uppercut', l: 'roundhouse', o: 'lowKick', i: 'teep', n: 'knee', m: 'elbow', ',': 'upElbow',
  c: 'clinch', r: 'rush', ' ': 'guard', s: 'slip', q: 'roll', e: 'parry', z: 'leanBack', x: 'check', b: 'body',
};
const LABELS = {
  jab: 'Jab', cross: 'Cross', hook: 'Hook', uppercut: 'Upper', roundhouse: 'Kick', lowKick: 'Low kick', teep: 'Teep', knee: 'Knee',
  elbow: 'Elbow', upElbow: 'Up elbow', clinch: 'Clinch', rush: 'Charge', guard: 'Guard', slip: 'Slip', roll: 'Roll', parry: 'Parry',
  leanBack: 'Lean back', check: 'Check', stepBack: 'Step back', body: 'Body',
};

function command(name) {
  if (name === 'body') {
    state.aimBody = !state.aimBody;
    document.querySelector('[data-command="body"]')?.classList.toggle('on', state.aimBody);
    return;
  }
  const spec = MOVES[name];
  if (spec?.kind === 'strike') {
    const zone = spec.zones.includes('legs') ? 'legs' : state.aimBody ? 'body' : 'head';
    throwPunch(state.world, player(), name, zone);
  } else perform(state.world, player(), name);
}

/** The pad shows the moves of the player's own style. */
function buildPad() {
  const style = STYLES[player().style];
  const names = [...Object.keys(style.attacks), ...Object.keys(style.defences), 'body'];
  const keyFor = Object.fromEntries(Object.entries(KEYS).map(([key, name]) => [name, key === ' ' ? '␣' : key.toUpperCase()]));
  const pad = $('#pad');
  pad.replaceChildren(...['◀', '▶'].map((arrow, index) => Object.assign(document.createElement('button'), { textContent: arrow, ariaLabel: index ? 'Step in' : 'Step back' })));
  pad.children[0].dataset.move = '-1';
  pad.children[1].dataset.move = '1';
  for (const name of names) {
    const button = document.createElement('button');
    button.dataset.command = name;
    button.innerHTML = `${LABELS[name] ?? name} <kbd>${keyFor[name] ?? ''}</kbd>`;
    pad.append(button);
  }
}

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
  } else command(button.dataset.command);
});
window.addEventListener('keydown', (press) => {
  if (state.mode !== 'play' || press.target.closest('input, select')) return;
  if (press.key === 'a' || press.key === 'ArrowLeft') player().move = -1;
  else if (press.key === 'd' || press.key === 'ArrowRight') player().move = 1;
  else if (KEYS[press.key]) {
    press.preventDefault();
    command(KEYS[press.key]);
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
  { key: 'exercise', label: 'Exercise', type: 'range', min: 0, max: 1, step: 0.01, format: (value) => `${Math.round(exerciseHours(value))} h/wk` },
  // Body fat is not set but settles from what goes in and what is burnt; the
  // slider spans the intakes that settle between BMI 10 and BMI 100.
  { key: 'calories', label: 'Calories', type: 'range', step: 10, range: (inputs) => calorieRange(inputs, (FRAMES[inputs.frame] ?? FRAMES.medium).lean), format: (value) => `${Math.round(value).toLocaleString('en')} kcal` },
];
const HAIR_COLORS = { black: '#120d0a', 'dark brown': '#2a1a10', brown: '#6b4a2a', blond: '#c9a25e', red: '#8a3a1c', grey: '#8d8d8d' };
// The compact grid: the fighting style first, then the look.
const LOOK_FIELDS = [
  { key: 'style', label: 'Style', options: STYLE_KEYS, names: Object.fromEntries(STYLE_KEYS.map((key) => [key, STYLES[key].label])), onInputs: true },
  { key: 'skinTone', label: 'Skin', options: Object.keys(SKIN_TONES), names: { light: 'light', lightTan: 'light tan', medium: 'medium', tan: 'tan', deep: 'deep' } },
  { key: 'hairStyle', label: 'Hair', options: LOOK_OPTIONS.hairStyle, names: { cleanShort: 'clean short', midLong: 'mid-long', long: 'long' } },
  { key: 'hairColor', label: 'Colour', options: Object.keys(HAIR_COLORS), toValue: (name) => HAIR_COLORS[name], fromValue: (hex) => Object.keys(HAIR_COLORS).find((name) => HAIR_COLORS[name] === hex) ?? 'black' },
  { key: 'facialHair', label: 'Face', options: LOOK_OPTIONS.facialHair },
  { key: 'eyeColor', label: 'Eyes', options: LOOK_OPTIONS.eyeColor },
];

// The outfit: which kind and which of its designs, its colours (the
// design's own unless chosen), a headset, and the fists.
const CLOTH_COLORS = {
  design: null, navy: '#24324a', maroon: '#7a2230', black: '#1c1c20', charcoal: '#26262b', grey: '#6b6e74',
  white: '#e4e4e6', olive: '#4a5233', denim: '#2b3550', sand: '#b39a73', red: '#b8302c', blue: '#2a59c4',
};
const colorName = (hex) => (hex ? Object.keys(CLOTH_COLORS).find((name) => CLOTH_COLORS[name] === hex) ?? 'design' : 'design');
const outfitField = (inputs) => (inputs.outfit ??= { kind: 'boxing', design: 0 });
const OUTFIT_FIELDS = [
  {
    key: 'kind', label: 'Outfit', options: OUTFIT_KEYS, names: Object.fromEntries(OUTFIT_KEYS.map((key) => [key, OUTFITS[key].label])),
    get: (inputs) => outfitField(inputs).kind, set: (inputs, value) => { Object.assign(outfitField(inputs), { kind: value, design: 0, colors: {} }); },
  },
  {
    key: 'design', label: 'Design', options: ['0', '1', '2'], names: null,
    get: (inputs) => String(outfitField(inputs).design ?? 0), set: (inputs, value) => { outfitField(inputs).design = Number(value); },
  },
  {
    key: 'top', label: 'Top', options: Object.keys(CLOTH_COLORS),
    get: (inputs) => colorName(outfitField(inputs).colors?.top), set: (inputs, value) => { outfitField(inputs).colors = { ...outfitField(inputs).colors, top: CLOTH_COLORS[value] ?? undefined }; },
  },
  {
    key: 'bottom', label: 'Legs', options: Object.keys(CLOTH_COLORS),
    get: (inputs) => colorName(outfitField(inputs).colors?.bottom), set: (inputs, value) => { outfitField(inputs).colors = { ...outfitField(inputs).colors, bottom: CLOTH_COLORS[value] ?? undefined }; },
  },
  {
    key: 'headset', label: 'Headset', options: ['off', 'on'],
    get: (inputs) => ((inputs.accessories ?? []).includes('headset') ? 'on' : 'off'),
    set: (inputs, value) => { inputs.accessories = value === 'on' ? ['headset'] : []; },
  },
  {
    key: 'fists', label: 'Fists', options: ['outfit', 'bare', 'gloved'],
    get: (inputs) => (inputs.gloves === undefined ? 'outfit' : inputs.gloves ? 'gloved' : 'bare'),
    set: (inputs, value) => { if (value === 'outfit') delete inputs.gloves; else inputs.gloves = value === 'gloved'; },
  },
];

/** Which of a side's fighters the form is showing: one entry per fighter on the side. */
function fillMemberPicker(corner) {
  const picker = $(`#build-${corner} .member`);
  const size = state.teamSizes[corner];
  picker.closest('label').hidden = size < 2;
  picker.replaceChildren(...state.rosters[corner].slice(0, size).map((fighter, index) => new Option(`${index + 1} · ${fighter.name}${index === 0 ? ' (lead)' : ''}`, String(index))));
  picker.value = String(state.editing[corner]);
}

function buildCornerForm(corner) {
  const form = $(`#build-${corner}`);
  form.querySelector('.member').addEventListener('change', (changed) => {
    state.editing[corner] = Number(changed.target.value);
    fillCornerForm(corner);
  });
  const presetSelect = form.querySelector('.preset');
  presetSelect.replaceChildren(...Object.entries(PRESETS).map(([key, preset]) => new Option(preset.name, key)));
  presetSelect.value = Object.keys(PRESETS).find((key) => PRESETS[key].name === current(corner).name) ?? 'heavy';
  presetSelect.addEventListener('change', () => {
    setCurrent(corner, normaliseInputs(structuredClone(PRESETS[presetSelect.value])));
    fillCornerForm(corner);
  });
  const fields = form.querySelector('.fields');
  fields.replaceChildren(...FIELDS.map((field) => {
    const row = document.createElement('label');
    row.className = 'field';
    row.innerHTML = `<span>${field.label}</span>`;
    const input = field.type === 'select' ? document.createElement('select') : document.createElement('input');
    if (field.type === 'select') input.append(...field.options.map((option) => new Option(field.names?.[option] ?? option, option)));
    else Object.assign(input, { type: 'range', min: field.min, max: field.max, step: field.step });
    input.dataset.key = field.key;
    const value = document.createElement('output');
    row.append(input, value);
    input.addEventListener('input', () => {
      current(corner)[field.key] = field.type === 'range' ? Number(input.value) : input.value;
      fillCornerForm(corner);
    });
    return row;
  }));
  const looks = form.querySelector('.looks');
  looks.replaceChildren(...LOOK_FIELDS.map((field) => {
    const row = document.createElement('label');
    row.className = 'look-field';
    row.innerHTML = `<span>${field.label}</span>`;
    const select = document.createElement('select');
    select.append(...field.options.map((option) => new Option(field.names?.[option] ?? option, option)));
    select.dataset.look = field.key;
    select.addEventListener('change', () => {
      if (field.onInputs) current(corner)[field.key] = select.value;
      else current(corner).look = { ...DEFAULT_LOOK, ...current(corner).look, [field.key]: field.toValue ? field.toValue(select.value) : select.value };
    });
    row.append(select);
    return row;
  }));
  // Gear: only shown for a fighter in street clothes.
  const outfit = document.createElement('div');
  outfit.className = 'looks outfit';
  outfit.replaceChildren(...OUTFIT_FIELDS.map((field) => {
    const row = document.createElement('label');
    row.className = 'look-field';
    row.innerHTML = `<span>${field.label}</span>`;
    const select = document.createElement('select');
    select.append(...field.options.map((option) => new Option(field.names?.[option] ?? option, option)));
    select.dataset.outfit = field.key;
    select.addEventListener('change', () => {
      field.set(current(corner), select.value);
      fillCornerForm(corner);
    });
    row.append(select);
    return row;
  }));
  looks.after(outfit);
  form.querySelector('.copy').addEventListener('click', async () => {
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(fighterFile(current(corner))))));
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
      const file = JSON.parse(decodeURIComponent(escape(atob(form.querySelector('.code').value.trim()))));
      if (file.kind !== 'boxer-simulator/fighter') throw new Error('not a fighter file');
      setCurrent(corner, normaliseInputs({ ...file.inputs, look: { ...DEFAULT_LOOK, ...file.inputs.look } }));
      fillCornerForm(corner);
    } catch {
      form.querySelector('.code').value = 'That code is not a fighter file.';
    }
  });
  form.querySelector('.name-input').addEventListener('input', (typed) => {
    current(corner).name = typed.target.value || 'Fighter';
    fillMemberPicker(corner);
  });
  fillCornerForm(corner);
}

function fillCornerForm(corner) {
  const form = $(`#build-${corner}`);
  const inputs = current(corner);
  fillMemberPicker(corner);
  // A level's fighters are tuned, not swapped for a preset.
  form.querySelector('.preset').closest('label').hidden = Boolean(state.scenario);
  const outfit = form.querySelector('.outfit');
  // The design names follow the outfit chosen.
  const kind = outfitOf(inputs).kind;
  // One design picked per outfit: the choice shows only when there are more.
  const designSelect = outfit.querySelector('[data-outfit="design"]');
  const offered = OUTFITS[kind].designs.map((design, index) => [design, index]).filter(([design, index]) => !design.levelOnly || index === outfitOf(inputs).design);
  designSelect.replaceChildren(...offered.map(([design, index]) => new Option(design.label, String(index))));
  designSelect.closest('label').hidden = offered.length < 2;
  for (const field of OUTFIT_FIELDS) outfit.querySelector(`[data-outfit="${field.key}"]`).value = field.get(inputs);
  form.querySelector('.name-input').value = inputs.name;
  form.querySelector('.copy').textContent = 'Copy code';
  for (const field of FIELDS) {
    const input = form.querySelector(`[data-key="${field.key}"]`);
    if (field.range) {
      // The span moves with height, sex, frame and exercise; keep the intake inside it.
      const [low, high] = field.range(inputs);
      Object.assign(input, { min: Math.floor(low / 10) * 10, max: Math.ceil(high / 10) * 10 });
      inputs[field.key] = Math.min(Number(input.max), Math.max(Number(input.min), inputs[field.key]));
    }
    input.value = inputs[field.key];
    input.nextElementSibling.textContent = field.format ? field.format(inputs[field.key]) : field.unit ? `${inputs[field.key]} ${field.unit}` : '';
  }
  const look = { ...DEFAULT_LOOK, ...inputs.look };
  for (const field of LOOK_FIELDS) {
    const value = field.onInputs ? inputs[field.key] ?? 'boxing' : look[field.key];
    form.querySelector(`[data-look="${field.key}"]`).value = field.fromValue ? field.fromValue(value) : value;
  }
  const body = buildBody(inputs);
  const stats = deriveStats(body);
  const kg = (value) => (value > 0 ? `${Math.round(value)} kg` : 'cannot');
  const rows = [
    ['Weight', `${stats.weight.toFixed(1)} kg`], ['Body fat', `${(stats.bodyFat * 100).toFixed(1)}%`], ['BMI', stats.bmi.toFixed(1)],
    ['Lean', `${stats.lean.toFixed(1)} kg`], ['Resting', `${Math.round(stats.rmr)} kcal`], ['Arm', `${Math.round(stats.arm)} cm`],
    ['Bone T', stats.tScore.toFixed(1)], ['Squat', kg(stats.squat)], ['Bench', kg(stats.bench)],
    ['Grip', `${Math.round(stats.grip)} kg`], ['30 m', Number.isFinite(stats.sprint) ? `${stats.sprint.toFixed(2)} s` : 'cannot'], ['Impact', `${Math.round(stats.impact)} J`],
    ['Reach', `${Math.round(body.reach * 100)} cm`], ['Punch', `${Math.round(body.motorForce[7])} N`], ['Chin', `${body.chin.toFixed(2)} m/s`],
  ];
  form.querySelector('.derived').innerHTML = rows.map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('');
}

// ---- Levels -------------------------------------------------------------------

function buildLevels() {
  const list = $('#level-list');
  const sandbox = document.createElement('button');
  sandbox.className = 'level';
  sandbox.innerHTML = '<b>Sandbox</b><span>The ring, gloves on, any two fighters from the builder.</span>';
  sandbox.addEventListener('click', () => chooseLevel(null));
  list.replaceChildren(sandbox, ...Object.entries(SCENARIOS).map(([key, scenario]) => {
    const card = document.createElement('button');
    card.className = 'level';
    const who = scenario.fighters.map((fighter) => `${fighter.name} · ${fighter.heightCm} cm, ${fighter.weightKg} kg`).join('<br>');
    card.innerHTML = `<b>${scenario.title}</b><em>${scenario.place}</em><span>${scenario.blurb}</span><small>${who}</small>`;
    card.addEventListener('click', () => chooseLevel(key));
    return card;
  }));
}

/**
 * The builder edits whichever fighters are on: the sandbox's own two, or a
 * level's. A level's are kept as tuned until the page is reloaded, so the
 * tuning survives going back to the ring and returning.
 */
function chooseLevel(key) {
  if (!state.scenario) state.sandboxRosters = state.rosters;
  if (key) {
    state.levelRosters[key] ??= Object.fromEntries(scenarioFighters(SCENARIOS[key]).map(({ inputs, corner }) => [corner, [inputs]]));
    state.rosters = state.levelRosters[key];
  } else state.rosters = state.sandboxRosters;
  state.scenario = key;
  refreshBuilder();
  $('#levels').hidden = true;
  state.paused = false;
  $('#pause').textContent = 'Pause';
  newBout();
}

/** Rosters filled to size, the fighter being edited kept in range, both forms redrawn. */
function refreshBuilder() {
  const scenario = state.scenario ? SCENARIOS[state.scenario] : null;
  for (const corner of ['red', 'blue']) {
    ensureRoster(corner, scenario);
    state.editing[corner] = Math.min(state.editing[corner], state.teamSizes[corner] - 1);
    $(`#team-${corner}`).value = String(state.teamSizes[corner]);
    fillCornerForm(corner);
  }
  $('#builder h1').textContent = scenario ? `Fighters · ${scenario.title}` : 'Fighters';
}

// ---- Setups: everything in the fight, as JSON to keep and load again ----------

const SETUP_KIND = 'boxer-simulator/setup';

/** The whole fight as set up: the place, both sides' sizes and every fighter on them. */
function setupFile() {
  const side = (corner) => state.rosters[corner].slice(0, state.teamSizes[corner]).map((inputs) => ({
    ...inputs,
    // The weight the body settles at, for reading (and for a level's file); calories are what set it.
    weightKg: Math.round(buildBody(inputs).massKg * 10) / 10,
  }));
  return { kind: SETUP_KIND, version: 1, level: state.scenario, teams: { red: side('red'), blue: side('blue') } };
}

function loadSetup(file) {
  if (file?.kind !== SETUP_KIND || !file.teams?.red?.length || !file.teams?.blue?.length) throw new Error('not a setup');
  if (file.level && !SCENARIOS[file.level]) throw new Error(`no level called ${file.level}`);
  if ((file.level ?? null) !== state.scenario) chooseLevel(file.level ?? null);
  const fighter = (entry) => {
    const { weightKg, ...inputs } = entry;
    return normaliseInputs({ ...inputs, look: { ...DEFAULT_LOOK, ...inputs.look } });
  };
  state.rosters = { red: file.teams.red.map(fighter), blue: file.teams.blue.map(fighter) };
  if (state.scenario) state.levelRosters[state.scenario] = state.rosters;
  for (const corner of ['red', 'blue']) {
    state.teamSizes[corner] = Math.min(8, state.rosters[corner].length);
    state.editing[corner] = 0;
  }
  refreshBuilder();
  newBout();
}

$('#copy-setup').addEventListener('click', async () => {
  const text = JSON.stringify(setupFile(), null, 2);
  const box = $('#setup-code');
  box.value = text;
  const button = $('#copy-setup');
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    box.select();
    button.textContent = 'Select and copy';
  }
  setTimeout(() => { button.textContent = 'Copy setup'; }, 2500);
});
$('#load-setup').addEventListener('click', () => {
  const box = $('#setup-code');
  try {
    loadSetup(JSON.parse(box.value));
    $('#load-setup').textContent = 'Loaded';
  } catch (error) {
    box.value = `That is not a setup (${error.message}). Paste one copied with Copy setup.`;
  }
  setTimeout(() => { $('#load-setup').textContent = 'Load setup'; }, 2500);
});

$('#open-levels').addEventListener('click', () => {
  $('#levels').hidden = false;
  state.paused = true;
});
$('#close-levels').addEventListener('click', () => {
  $('#levels').hidden = true;
  state.paused = false;
});

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
  // The pad and log sit just above the controls, however many rows they wrap to.
  document.documentElement.style.setProperty('--controls-height', `${$('.controls').getBoundingClientRect().height}px`);
}
window.addEventListener('resize', fit);
buildCornerForm('red');
buildCornerForm('blue');
buildLevels();
newBout();
fit();
requestAnimationFrame(frame);

// ---- Design sheets -------------------------------------------------------------

const SHEETS = {
  faces: {
    field: 'faceShape',
    options: [
      ['shonen', 'A · Shonen', 'angular jaw, pointed chin, sharp slanted eyes'],
      ['shojo', 'B · Shojo', 'soft round cheeks, small chin, big round eyes'],
      ['seinen', 'C · Seinen', 'longer face, squarer jaw, narrow eyes'],
    ],
    rows: [PRESETS.light, PRESETS.contender, PRESETS.heavy],
    // The stance is bladed: the face looks about 0.55 rad round from +x.
    camera: { distance: 1.55, pitch: 0.04, yaw: 0.12, height: 1.4 },
  },
  bodies: {
    field: 'bodyStyle',
    options: [
      ['lofted', '1 · Lofted', 'low-poly rings, lightly smoothed · ~5.9k triangles'],
      ['smoothed', '2 · Smoothed', 'anatomy field, coarse and relaxed · ~8k'],
      ['faceted', '3 · Faceted', 'flat-shaded low poly · ~0.8k'],
    ],
    rows: [PRESETS.heavy, PRESETS.contender],
    // Inside the ropes (the ring edge is 3 m out), so none cross the view.
    camera: { distance: 2.75, pitch: 0.1, yaw: 0.15, height: 0.95 },
  },
  // One build fed for BMI 10 to 100: the extremes of the calorie slider.
  physiques: {
    options: [10, 17, 24, 45, 100].map((bmi) => [{ bmi }, `BMI ${bmi}`, '']),
    rows: [{ ...PRESETS.amateur, exercise: 0.3 }, { ...PRESETS.contender, exercise: 0.3 }],
    camera: { distance: 4.2, pitch: 0.08, yaw: 0.15, height: 0.95 },
  },
};

// One sheet per outfit: its three designs on a man (row 0) and a woman (row 1).
for (const kind of OUTFIT_KEYS) {
  SHEETS[`outfit-${kind}`] = {
    options: OUTFITS[kind].designs.filter((design) => !design.levelOnly).map((design, index) => [{ outfit: { kind, design: index } }, design.label, OUTFITS[kind].label]),
    rows: [PRESETS.light, PRESETS.contender],
    camera: { distance: 2.9, pitch: 0.08, yaw: 0.15, height: 0.95 },
  };
}

/** The inputs a sheet option builds: a look field, an outfit, or a body fed to a BMI. */
function sheetInputs(sheet, row, value) {
  const inputs = normaliseInputs(structuredClone(sheet.rows[row]));
  if (sheet.field) return { ...inputs, look: { ...inputs.look, [sheet.field]: value } };
  if (value.outfit) return { ...inputs, outfit: value.outfit };
  const height = inputs.heightCm / 100;
  return { ...inputs, calories: Math.round(caloriesForWeight(inputs, value.bmi * height * height, FRAMES[inputs.frame].lean)) };
}

/** Line up every option of a sheet for one build (`row`), labelled, and frame them. */
function designSheet(kind, row = 0, closeUp = null) {
  const sheet = SHEETS[kind];
  const spacing = { faces: 0.55, bodies: 0.8, physiques: 1.15 }[kind] ?? 0.85;
  const entries = sheet.options.map(([value, label], column) => ({ inputs: { ...sheetInputs(sheet, row, value), name: label }, corner: 'red', column }));
  const middle = (entries.length - 1) / 2;
  state.paused = true;
  state.world = createWorld(entries, { seed: 3 });
  // Option A on the left as the camera sees it (+z is screen left).
  state.world.fighters.forEach((fighter, index) => {
    placeFighter(fighter, 0, (middle - entries[index].column) * spacing);
    fighter.handsDown = true;
    // Turn the bladed stance so the face, not the hips, points at the camera.
    fighter.yaw = -0.5;
  });
  advance(state.world, 0.6, null, STEP);
  rebuildViews();
  // A close-up frames one option from any side: { column, yaw, pitch, distance }.
  const { distance, pitch, yaw, height } = { ...sheet.camera, ...closeUp };
  Object.assign(scene.orbit, { distance, pitch, yaw });
  const focusZ = closeUp ? state.world.fighters[closeUp.column].x[P.pelvis * 3 + 2] : 0;
  $('#banner').hidden = true;
  for (let pass = 0; pass < 3; pass += 1) {
    scene.orbit.target.set(0, height, focusZ);
    draw(0);
  }
  // Labels under each option of the framed row.
  const overlay = document.querySelector('#sheet-labels') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'sheet-labels' }));
  overlay.replaceChildren();
  overlay.hidden = Boolean(closeUp);
  const box = canvas.getBoundingClientRect();
  sheet.options.forEach(([, label, note], column) => {
    if (kind === 'physiques') {
      const stats = deriveStats(state.world.fighters[column].body);
      note = `${stats.weight.toFixed(0)} kg · ${(stats.bodyFat * 100).toFixed(0)}% fat · ${entries[column].inputs.calories} kcal`;
    }
    const fighter = state.world.fighters[column];
    const anchor = new THREE.Vector3(fighter.x[P.pelvis * 3], kind === 'faces' ? fighter.x[P.neck * 3 + 1] - 0.2 : 0.35, fighter.x[P.pelvis * 3 + 2]).project(scene.camera);
    const tag = document.createElement('div');
    tag.className = 'sheet-label';
    tag.innerHTML = `<b>${label}</b><span>${note}</span>`;
    tag.style.left = `${box.left + ((anchor.x + 1) / 2) * box.width}px`;
    tag.style.top = `${box.top + ((1 - anchor.y) / 2) * box.height}px`;
    overlay.append(tag);
  });
  document.body.classList.add('sheet');
  return state.world.fighters.length;
}

// Test hook: step the world by seconds without the frame clock.
window.boxer = {
  state,
  scene,
  designSheet,
  advance: (seconds) => {
    tick(seconds);
    draw(0);
  },
};
