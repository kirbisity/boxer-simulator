// Page wiring: builder, HUD, controls, and the loop that steps the world and
// draws it. The simulation runs at a fixed step whatever the frame rate.

import { buildBody, fighterFile, FRAMES, normaliseInputs, P, PRESETS } from './body.js';
import { calorieRange, caloriesForWeight, deriveStats, exerciseHours } from './physiology.js';
import { hurtShare, thinkAll } from './ai.js';
import { MOVES, STRATEGIES, STYLE_KEYS, STYLES } from './moves.js';
import { advance, boutWinner, collapseAt, dropWeapon, concussionCapacity, createWorld, perform, placeFighter, point, startCrawl, throwPunch } from './physics.js';
import { DEFAULT_LOOK, LOOK_OPTIONS } from './face.js';
import { STYLE } from './toon.js';
import { randomCharacter, randomGladiator, varyCharacter } from './cast.js';
import { installMenus } from './menu.js';
import { crewFighter, SCENARIOS, scenarioFighters } from './scenarios.js';
import { CLOTH_COLORS, defaultHeadgear, FACTION_KEYS, factionOf, FACTIONS, HEADGEAR, headgearOptions, OUTFIT_KEYS, outfitOf, OUTFITS, randomColors } from './outfits.js';
import { addIcon, dramaCamera, momentFor, momentPlaying, resetDrama, startMoment, timeScale, updateIcons } from './drama.js';
import { beginCrowdBatches, endCrowdBatches } from './crowdview.js';
import { buildFighterView, clearCrowdTemplates, PLACE_ARENAS, SKIN_TONES, createScene, disposeFighterView, placeCamera, render, resize, setLayer, setPlace, showImpact, updateFighterView, updateProps, updateSpray } from './render.js';
import { clearGore, severView, spawnShot, spawnSparks, updateArms, updateArrows, updateBlood, updateDebris, updateShots, updateStumps, woundBlood } from './weaponview.js';

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
  // Which side the player takes in play mode.
  playSide: 'red',
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
  // The sandbox's place: the ring, the Colosseum, or the subway platform.
  place: 'ring',
  sandboxRosters: null,
  levelRosters: {},
  // Which part of the game is on: 'home' (the fight behind the menus),
  // 'quick', 'versus', 'level' or 'sandbox'; and what the banner's button does.
  game: 'home',
  next: null,
  // The sandbox's own fighters, sizes and place, kept while elsewhere.
  sandbox: null,
};
const realSeconds = () => performance.now() / 1000;
/** A short name for crowded places: the first name, and its number if it has one ("Dave 2"). */
const shortName = (name) => {
  const number = name.match(/ (\d+)$/);
  // A rank or title ("Sgt. Cole", "Sir Edric") gives way to the name after it.
  const words = name.split(' ');
  const first = /\.$/.test(words[0]) || ['Sir', 'Officer'].includes(words[0]) ? words[1] ?? words[0] : words[0];
  return `${first}${number ? ` ${number[1]}` : ''}`;
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
    // A level's crew; in the sandbox, the lead again, exactly (the dice re-roll them as anyone).
    if (crew) mate = crewFighter(lead, crew[index % crew.length]);
    else mate = structuredClone(lead);
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

/** Fresh colours from the fighter's outfit palette (a level's characters keep theirs). */
function shuffleColors(inputs) {
  const outfit = outfitField(inputs);
  const colors = randomColors(outfit.kind);
  if (Object.keys(colors).length) outfit.colors = colors;
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
  const place = scenario?.scene ?? state.place;
  const arena = scenario?.arena ?? PLACE_ARENAS[place];
  state.world = createWorld([...sides[0], ...sides[1]], { seed: state.seed, arena, rules: scenario?.rules, formation: scenario?.formation });
  clearGore(scene);
  setPlace(scene, place, arena);
  // A level frames its own place; anything else starts from the usual ringside view.
  Object.assign(scene.orbit, scenario?.camera ?? { yaw: -0.5, pitch: 0.2, distance: 5.2 });
  document.body.dataset.place = place;
  $('#place').closest('label').hidden = Boolean(scenario);
  rebuildViews({ progressive: true });
  state.eventCursor = 0;
  state.finishedAt = null;
  resetDrama(state.drama);
  $('#log').replaceChildren();
  $('#banner').hidden = true;
  renderHud();
  if (state.mode === 'play') buildPad();
}

/** Rebuild the fighters' models, for a new bout or a new shading style. */
// A crowd this big (fighters in all) draws everyone but each side's lead
// simply: no skeleton beneath, fewer rings, no soft flesh. The simulation
// is the same for all of them.
const CROWD_DRAWING = 8;

// Crowd templates kept from bout to bout (a restart reuses them), up to this many.
const CROWD_TEMPLATE_CAP = 160;
// Building an army's models is spread over frames, this many ms a frame, so the page never stalls.
const BUILD_BUDGET_MS = 24;

/**
 * Build every fighter's model. A big fight (`progressive`) builds its two
 * leads now and the rest a few each frame (see buildQueuedViews); the
 * simulation waits until all are drawn.
 */
function rebuildViews({ progressive = false } = {}) {
  for (const view of state.views) disposeFighterView(scene, view);
  if ((scene.crowdTemplates?.size ?? 0) > CROWD_TEMPLATE_CAP) clearCrowdTemplates(scene);
  const crowd = state.world.fighters.length > CROWD_DRAWING;
  const leads = new Set(['red', 'blue'].map((corner) => state.world.fighters.find((fighter) => fighter.corner === corner)?.id));
  const build = (fighter) => {
    const view = buildFighterView(scene, fighter, { simple: crowd && !leads.has(fighter.id) });
    setLayer(view, state.layer);
    return view;
  };
  const order = [...state.world.fighters].sort((a, b) => Number(leads.has(b.id)) - Number(leads.has(a.id)));
  const now = progressive && crowd ? order.filter((fighter) => leads.has(fighter.id)) : order;
  state.views = now.map(build);
  state.viewQueue = order.slice(now.length);
  state.buildView = build;
  showMustering();
}

/** A few more of an army's models, within this frame's budget; done, the fight goes on. */
function buildQueuedViews() {
  if (!state.viewQueue?.length) return;
  const started = performance.now();
  while (state.viewQueue.length && performance.now() - started < BUILD_BUDGET_MS) state.views.push(state.buildView(state.viewQueue.shift()));
  showMustering();
}

const mustering = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'mustering', hidden: true }));
function showMustering() {
  const waiting = state.viewQueue?.length ?? 0;
  mustering.hidden = waiting === 0;
  if (waiting) mustering.textContent = `Mustering the armies… ${state.views.length} / ${state.views.length + waiting}`;
}

// ---- Loop -------------------------------------------------------------------

function thinkForBout(world, dt) {
  const players = state.mode === 'play' && player() ? new Set([player().id]) : new Set();
  // The one you play is simulated in full however big the fight.
  world.keepFull = players;
  thinkAll(world, dt, players);
  if (players.size) walkAbout(player());
}

// ---- Walk mode: the player walks or runs about, guard down ----------------

const WALK_KEYS = { w: [1, 0], arrowup: [1, 0], s: [-1, 0], arrowdown: [-1, 0], a: [0, 1], arrowleft: [0, 1], d: [0, -1], arrowright: [0, -1] };
const walkHeld = new Set();

/** Steer the walking player: the held directions, taken from where the camera looks; facing the way he goes. */
function walkAbout(fighter) {
  if (!fighter.walking) return;
  const look = [scene.orbit.target.x - scene.camera.position.x, scene.orbit.target.z - scene.camera.position.z];
  const length = Math.hypot(look[0], look[1]);
  // A camera straight overhead (or not yet placed) gives no heading: then his own facing does.
  const ahead = length > 1e-3 ? [look[0] / length, look[1] / length] : [Math.cos(fighter.yaw), -Math.sin(fighter.yaw)];
  // Left of the camera's view on the floor.
  const left = [ahead[1], -ahead[0]];
  let along = 0;
  let across = 0;
  for (const key of walkHeld) {
    const [forward, side] = WALK_KEYS[key] ?? [0, 0];
    along += forward;
    across += side;
  }
  const pelvis = [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
  fighter.strafe = 0;
  if (!along && !across) {
    // Standing: keep the way he faces.
    fighter.move = 0;
    fighter.goTo = [pelvis[0] + Math.cos(fighter.yaw) * 3, 0, pelvis[1] - Math.sin(fighter.yaw) * 3];
    return;
  }
  const way = [ahead[0] * along + left[0] * across, ahead[1] * along + left[1] * across];
  const size = Math.hypot(way[0], way[1]);
  // Opposite keys held together cancel out: he stands.
  if (size < 1e-6) {
    fighter.move = 0;
    return;
  }
  fighter.goTo = [pelvis[0] + (way[0] / size) * 3, 0, pelvis[1] + (way[1] / size) * 3];
  fighter.move = 1;
  fighter.running = state.walkRunning && !fighter.crawling;
}

/** Into walk mode, or back into the fight (the guard up, the footwork the style's). */
function setWalking(on) {
  const fighter = player();
  if (!fighter) return;
  fighter.walking = on;
  if (!on) {
    fighter.crawling = false;
    fighter.goTo = null;
    fighter.move = 0;
    fighter.running = false;
    walkHeld.clear();
  }
  buildPad();
}

/** Walking about on his knees, or back on his feet (the sandbox's look at the crawl). */
function setCrawling(on) {
  const fighter = player();
  if (!fighter?.walking) return;
  fighter.crawling = on;
  buildPad();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // A big moment slows the simulation, not the drawing.
  buildQueuedViews();
  // While an army is still being drawn, the fight waits for it.
  if (!state.paused && !state.viewQueue?.length) tick(dt * state.speed * timeScale(state.drama, realSeconds()));
  draw(dt);
  requestAnimationFrame(frame);
}

// The most a frame may spend simulating (ms). A big battle at its height
// can cost more than real time to simulate; past this budget the frame stops
// and lets the fight run a little slower than real time, rather than trying
// to catch up and stalling the page (each frame longer than the last).
const SIM_BUDGET_MS = 20;

function tick(seconds, { budget = SIM_BUDGET_MS } = {}) {
  state.accumulator += seconds;
  const started = performance.now();
  while (state.accumulator >= STEP) {
    state.before = snapshot(state.world);
    advance(state.world, STEP, thinkForBout, STEP);
    state.accumulator -= STEP;
    if (performance.now() - started > budget) {
      // Out of time: what is left is dropped, not owed to the next frame.
      state.accumulator = Math.min(state.accumulator, STEP * 0.999);
      break;
    }
  }
  consumeEvents();
  const winner = boutWinner(state.world);
  // Behind the menus, one fight follows another.
  if (state.game === 'home' && state.finishedAt !== null && state.world.time > state.finishedAt + 3) state.next.run();
  if (winner && state.finishedAt === null && !momentPlaying(state.drama, realSeconds())) {
    state.finishedAt = state.world.time;
    const team = state.world.fighters.filter((fighter) => fighter.corner === winner);
    const name = team.length > 1 ? `${winner === 'red' ? 'Red' : 'Blue'} team` : team[0].body.inputs.name;
    $('#banner').hidden = state.game === 'home';
    // How it ended: the last fighter out on the losing side says.
    const ends = { severed: 'Cut down', killed: 'Killed', bledOut: 'Bled out', knockout: 'KO', stopped: 'Stopped', pinned: 'Held down' };
    const ending = [...state.world.events].reverse().find((event) => ends[event.kind] && state.world.fighters[event.fighter]?.corner !== winner);
    $('#banner-text').textContent = `${ends[ending?.kind] ?? 'KO'} — ${name} wins`;
  }
}

// ---- Drawing between steps ---------------------------------------------------
// The world moves in fixed 1/60 s steps. In slow motion a step comes only
// every few frames, so drawing the latest step shows a body that jumps and
// then stands still. Drawing instead the share of the way from the step
// before to the latest that the clock has reached keeps every frame moving.
// Only the picture is blended; the simulation is untouched, so a bout plays
// out the same whether it is watched slowed or not.

/** What drawing reads from the simulation, as it is now. */
function snapshot(world) {
  return {
    world,
    fighters: world.fighters.map((fighter) => ({ x: fighter.x.slice(), dir: fighter.weapon?.dir?.slice() })),
    debris: world.debris.map((piece) => ({ x: piece.x?.slice(), q: piece.q?.slice() })),
  };
}

const blend = (from, to, share) => to.map((value, index) => from[index] + (value - from[index]) * share);
const unit = (vector) => {
  const length = Math.hypot(...vector) || 1;
  return vector.map((value) => value / length);
};

/**
 * Put the world where the clock is, between the last two steps, for one
 * drawing; returns how to put it back.
 */
function blendWorld(world, before, share) {
  if (!before || before.world !== world || share <= 0 || share >= 1) return () => {};
  const kept = [];
  world.fighters.forEach((fighter, index) => {
    const then = before.fighters[index];
    if (!then) return;
    const now = { fighter, x: fighter.x.slice(), dir: fighter.weapon?.dir };
    kept.push(now);
    fighter.x.set(blend(then.x, now.x, share));
    if (then.dir && now.dir) fighter.weapon.dir = unit(blend(then.dir, now.dir, share));
  });
  world.debris.forEach((piece, index) => {
    const then = before.debris[index];
    if (!then?.x || !piece.x) return;
    kept.push({ piece, x: piece.x, q: piece.q });
    piece.x = blend(then.x, piece.x, share);
    if (then.q && piece.q) {
      // The short way round: q and −q are the same turn.
      const sign = then.q.reduce((sum, value, at) => sum + value * piece.q[at], 0) < 0 ? -1 : 1;
      piece.q = unit(blend(then.q.map((value) => value * sign), piece.q, share));
    }
  });
  return () => {
    for (const entry of kept) {
      if (entry.fighter) {
        entry.fighter.x.set(entry.x);
        if (entry.dir) entry.fighter.weapon.dir = entry.dir;
      } else {
        entry.piece.x = entry.x;
        entry.piece.q = entry.q;
      }
    }
  };
}

// Third person: `distance` m behind and `pitch` rad above the man played,
// looking at a point `aboveHips` m over his hips and `shoulder` m to his
// right (over the shoulder, his man in view); the target keeps up `ease`
// of the way each frame, and the camera swings round behind him `turn` of
// the way. Walking, the turn is the player's (drag): the keys go by the camera.
const CAMERA_FOLLOW = { distance: 3.4, pitch: 0.24, aboveHips: 0.45, shoulder: 0.55, ease: 0.2, turn: 0.05 };

/** Where the following camera looks: beside him, so that he stands left of the picture and his man shows past his right shoulder. */
function shoulderPoint(fighter) {
  const pelvis = point(fighter.x, P.pelvis);
  return [pelvis[0] + Math.sin(fighter.yaw) * CAMERA_FOLLOW.shoulder, pelvis[1], pelvis[2] + Math.cos(fighter.yaw) * CAMERA_FOLLOW.shoulder];
}

/** Behind the man played, at a fixed distance; in the fight, round behind him as he turns. */
function followCamera(fighter) {
  const orbit = scene.orbit;
  orbit.distance += (CAMERA_FOLLOW.distance - orbit.distance) * 0.1;
  orbit.pitch += (CAMERA_FOLLOW.pitch - orbit.pitch) * 0.05;
  // Held by the player's own drag, or walking about: his choice of view.
  if (fighter.walking || pointers.size) return;
  // He faces (cos yaw, −sin yaw) on the floor: the camera sits the other way.
  const behind = Math.atan2(Math.sin(fighter.yaw), -Math.cos(fighter.yaw));
  const turn = Math.atan2(Math.sin(behind - orbit.yaw), Math.cos(behind - orbit.yaw));
  orbit.yaw += turn * CAMERA_FOLLOW.turn;
}

function draw(dt) {
  const restore = blendWorld(state.world, state.before, state.paused ? 1 : state.accumulator / STEP);
  try {
    drawWorld(dt);
  } finally {
    restore();
  }
}

function drawWorld(dt) {
  const world = state.world;
  // The moment on screen: between the last two steps, as the bodies are drawn.
  const drawnTime = world.time - STEP + (state.paused ? STEP : state.accumulator);
  const pelvisMid = [0, 0, 0];
  for (const fighter of world.fighters) {
    pelvisMid[0] += fighter.x[24] / world.fighters.length;
    pelvisMid[2] += fighter.x[26] / world.fighters.length;
  }
  const sheet = document.body.classList.contains('sheet');
  // Playing: the camera follows his man from behind (third person).
  const followed = state.mode === 'play' && !sheet ? player() : null;
  if (followed) followCamera(followed);
  // A crowd needs a wider shot: back off with the spread of the fighters.
  else if (world.fighters.length > 2 && !sheet) {
    const spread = Math.max(...world.fighters.map((fighter) => Math.hypot(fighter.x[24] - pelvisMid[0], fighter.x[26] - pelvisMid[2])));
    const furthest = state.scenario ? SCENARIOS[state.scenario].camera?.maxDistance ?? Infinity : Infinity;
    scene.orbit.distance += (Math.min(furthest, Math.max(5.2, 3.4 + spread * 2.2)) - scene.orbit.distance) * 0.03;
  }
  // A design sheet holds its own framing.
  if (followed) placeCamera(scene, shoulderPoint(followed), { ease: CAMERA_FOLLOW.ease, height: followed.x[P.pelvis * 3 + 1] + CAMERA_FOLLOW.aboveHips });
  else placeCamera(scene, sheet ? null : pelvisMid);
  dramaCamera(scene, state.drama, world, realSeconds());
  // Crowd weapons, shields and banners are drawn as instanced batches, filled as the views update.
  beginCrowdBatches(scene);
  for (const view of state.views) {
    updateFighterView(view, dt * (state.paused ? 0 : state.speed), world.time);
    updateArms(scene, view, drawnTime);
    updateStumps(view);
  }
  updateProps(scene, state.views, world);
  updateDebris(scene, world);
  endCrowdBatches(scene);
  updateArrows(scene, world);
  updateBlood(scene, world, dt * (state.paused ? 0 : state.speed));
  updateShots(scene, dt * (state.paused ? 0 : state.speed));
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
    if ((event.kind === 'landed' || event.kind === 'blocked') && event.target !== 'shield') showImpact(scene, state.views, event);
    if (event.weapon && (event.kind === 'landed' || event.kind === 'blocked')) woundBlood(scene, event);
    if (event.kind === 'clash' || event.kind === 'glance') spawnSparks(scene, event.point);
    if (event.kind === 'shot') spawnShot(scene, event);
    if (event.kind === 'arrow') (event.bounced ? spawnSparks(scene, event.point, 7) : woundBlood(scene, event));
    if (event.kind === 'bladeBlock') (event.cut > 1 ? woundBlood : (view, at) => spawnSparks(view, at.point, 6))(scene, event);
    if (event.kind === 'severed') {
      const view = state.views.find((entry) => entry.fighter.id === event.fighter);
      if (view) severView(scene, view, event, state.world.debris[event.debris]);
    }
    const moment = momentFor(event);
    if (moment) {
      // Slow motion and the camera's push-in are for one man against
      // another; in a crowd something is always happening, and the icon says enough.
      if (state.world.fighters.length <= 2) startMoment(state.drama, moment, realSeconds());
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
    // Blood lost, against what puts him down: shown once he is bleeding.
    const blood = card.querySelector('.blood');
    blood.hidden = !(fighter.bloodLost > 0);
    blood.querySelector('i').style.width = `${Math.min(100, Math.round(((fighter.bloodLost ?? 0) / collapseAt()) * 100))}%`;
    card.querySelector('.kd').textContent = fighter.state === 'out' ? 'OUT' : fighter.state === 'down' ? 'DOWN' : fighter.panicked ? 'PANIC' : fighter.stagger > 0 ? 'REELING' : `KD ${fighter.knockdowns}`;
    const nerve = fighter.aiConfidence ?? 0;
    const mood = nerve > 0.35 ? ' · confident' : nerve < -0.35 ? ' · wary' : '';
    // The sandbox reads out fear and adrenaline; everywhere else, one health bar says enough.
    const feeling = ` · fear ${Math.round((fighter.fear ?? 0) * 100)}% · adrenaline ${Math.round((fighter.adrenaline ?? 0) * 100)}%`;
    card.querySelector('.speed').textContent = `${fighter.stats.lastHandSpeed.toFixed(1)} m/s${mood}${feeling}`;
    card.querySelector('.health i').style.width = `${Math.round((1 - hurtShare(fighter)) * 100)}%`;
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
  else if (event.kind === 'severed') text = `🩸 <b>${name(event.fighter)}</b> · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'loosed') return;
  else if (event.kind === 'arrow') text = `🏹 <b>${name(event.attacker)}</b> → <b>${name(event.defender)}</b> · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'shot') text = `🔫 <b>${name(event.attacker)}</b> fires${event.defender !== undefined ? ` → <b>${name(event.defender)}</b>` : ''} · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'panic' || event.kind === 'rally') text = `${event.kind === 'panic' ? '😱' : '🔥'} <b>${name(event.fighter)}</b> ${event.effects.join(', ')}`;
  else if (event.kind === 'staggered') text = `🌀 <b>${name(event.fighter)}</b> staggers · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'killed') text = `☠️ <b>${name(event.fighter)}</b> · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'bledOut') text = `🩸 <b>${name(event.fighter)}</b> · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'disarmed' || event.kind === 'drew') text = `🗡️ <b>${name(event.fighter)}</b> · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'clash' || event.kind === 'glance' || event.kind === 'out' || event.kind === 'surge') return;
  else if (event.kind === 'bladeBlock') text = `<b>${name(event.attacker)}</b> meets <b>${name(event.defender)}</b>'s ${event.punch ?? 'strike'} with the blade · <em>${event.effects.join(', ') || 'fended off'}</em>`;
  else if (event.kind === 'pickup') text = `🗡️ <b>${name(event.fighter)}</b> · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'styleSwitch') text = `<b>${name(event.fighter)}</b> switches to ${STYLES[event.style].label}`;
  else if (event.kind === 'pinning') text = `<b>${name(event.attacker)}</b> goes to hold <b>${name(event.defender)}</b> down`;
  else if (event.kind === 'held') text = `🤼 <b>${name(event.fighter)}</b> is held down`;
  else if (event.kind === 'pinBroken') text = `<b>${name(event.fighter)}</b> breaks the hold`;
  else if (event.kind === 'pinned') text = `🤼 <b>${name(event.fighter)}</b> held down · <em>${event.effects.join(', ')}</em>`;
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
  if (['knockout', 'broken', 'severed', 'killed', 'bledOut', 'pinned'].includes(event.kind) || event.effects?.some((effect) => effect.startsWith('knockdown'))) row.className = 'big';
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
    onPick(button.dataset.value, button);
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
  select.append(...Array.from({ length: 20 }, (_, index) => new Option(String(index + 1), String(index + 1))));
  select.addEventListener('change', () => {
    state.teamSizes[corner] = Number(select.value);
    refreshBuilder();
    newBout();
  });
}
$('#shuffle-all').addEventListener('click', () => {
  for (const corner of ['red', 'blue']) {
    for (const inputs of state.rosters[corner]) shuffleColors(inputs);
    fillCornerForm(corner);
  }
});
// The dice beside a side's size: everyone after its lead, re-rolled as anyone at all.
for (const corner of ['red', 'blue']) {
  document.querySelector(`.dice[data-corner="${corner}"]`).addEventListener('click', () => {
    const roster = state.rosters[corner];
    for (let index = 1; index < roster.length; index += 1) roster[index] = randomCharacter();
    state.rosters[corner] = roster.slice(0, Math.max(1, state.teamSizes[corner]));
    ensureRoster(corner, state.scenario ? SCENARIOS[state.scenario] : null);
    refreshBuilder();
    newBout();
  });
}
$('#place').addEventListener('change', (event) => {
  state.place = event.target.value;
  newBout();
});
segmented('#modes', (mode, button) => {
  // Leaving play (or changing sides), the one he played fights with his guard up again.
  if (player()?.walking) setWalking(false);
  state.mode = mode;
  state.playSide = button.dataset.side ?? 'red';
  $('#pad').hidden = mode !== 'play';
  if (mode === 'play') buildPad();
  document.body.classList.toggle('playing', mode === 'play');
});
$('#pause').addEventListener('click', () => {
  state.paused = !state.paused;
  $('#pause').textContent = state.paused ? 'Play' : 'Pause';
});
$('#restart').addEventListener('click', newBout);
$('#banner-again').addEventListener('click', () => (state.next ? state.next.run() : newBout()));
$('#banner-menu').addEventListener('click', () => goHome());
$('#open-menu').addEventListener('click', () => goHome());

// The fighter the player controls: his side's lead (the side is chosen with the Play buttons).
const player = () => state.world.fighters.find((fighter) => fighter.corner === state.playSide) ?? state.world.fighters[0];
// Keys: punches on the right hand's home row, kicks and knees above and
// below, defences on the left hand.
const KEYS = {
  j: 'jab', k: 'cross', h: 'hook', u: 'uppercut', l: 'roundhouse', o: 'lowKick', i: 'teep', n: 'knee', m: 'elbow', ',': 'upElbow',
  c: 'clinch', r: 'rush', ' ': 'guard', s: 'slip', q: 'roll', e: 'parry', z: 'leanBack', x: 'check', b: 'body', f: 'shoot', y: 'rHook', g: 'collarTie',
};
const LABELS = {
  jab: 'Jab', cross: 'Cross', hook: 'Hook', uppercut: 'Upper', roundhouse: 'Kick', lowKick: 'Low kick', teep: 'Teep', knee: 'Knee',
  elbow: 'Elbow', upElbow: 'Up elbow', clinch: 'Clinch', rush: 'Charge', guard: 'Guard', slip: 'Slip', roll: 'Roll', parry: 'Parry',
  leanBack: 'Lean back', check: 'Check', stepBack: 'Step back', body: 'Body', shoot: 'Shoot', rHook: 'Rear hook', collarTie: 'Collar tie',
};

function command(name) {
  // Any fighting move puts the guard back up.
  if (player()?.walking) setWalking(false);
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

/** The pad shows the moves of the player's own style; walking, the four ways, run, and back to the fight. */
function buildPad() {
  const pad = $('#pad');
  if (player()?.walking) {
    const arrows = [['▲', 'w'], ['◀', 'a'], ['▼', 's'], ['▶', 'd']].map(([text, key]) => Object.assign(document.createElement('button'), { textContent: text, ariaLabel: { w: 'Forward', a: 'Left', s: 'Back', d: 'Right' }[key] }));
    arrows.forEach((button, index) => (button.dataset.walk = ['w', 'a', 's', 'd'][index]));
    const run = Object.assign(document.createElement('button'), { innerHTML: 'Run <kbd>⇧</kbd>' });
    run.dataset.run = '1';
    run.classList.toggle('on', Boolean(state.walkRunning));
    const crawl = Object.assign(document.createElement('button'), { innerHTML: 'Crawl <kbd>C</kbd>' });
    crawl.dataset.crawl = '1';
    crawl.classList.toggle('on', Boolean(player().crawling));
    const fight = Object.assign(document.createElement('button'), { innerHTML: 'Guard up <kbd>V</kbd>' });
    fight.dataset.walkToggle = '1';
    pad.replaceChildren(...arrows, run, crawl, fight);
    return;
  }
  const style = STYLES[player().style];
  const names = [...Object.keys(style.attacks), ...Object.keys(style.defences), 'body'];
  const keyFor = Object.fromEntries(Object.entries(KEYS).map(([key, name]) => [name, key === ' ' ? '␣' : key.toUpperCase()]));
  pad.replaceChildren(...['◀', '▶'].map((arrow, index) => Object.assign(document.createElement('button'), { textContent: arrow, ariaLabel: index ? 'Step in' : 'Step back' })));
  pad.children[0].dataset.move = '-1';
  pad.children[1].dataset.move = '1';
  for (const name of names) {
    const button = document.createElement('button');
    button.dataset.command = name;
    button.innerHTML = `${LABELS[name] ?? name} <kbd>${keyFor[name] ?? ''}</kbd>`;
    if (name === 'body') button.classList.toggle('on', Boolean(state.aimBody));
    pad.append(button);
  }
  const walk = Object.assign(document.createElement('button'), { innerHTML: 'Walk <kbd>V</kbd>' });
  walk.dataset.walkToggle = '1';
  pad.append(walk);
}

$('#pad').addEventListener('pointerdown', (press) => {
  const button = press.target.closest('button');
  if (!button) return;
  if (button.dataset.walkToggle) return setWalking(!player().walking);
  if (button.dataset.crawl) return setCrawling(!player().crawling);
  if (button.dataset.run) {
    state.walkRunning = !state.walkRunning;
    button.classList.toggle('on', state.walkRunning);
    return;
  }
  if (button.dataset.walk) {
    const key = button.dataset.walk;
    walkHeld.add(key);
    const stop = () => {
      walkHeld.delete(key);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return;
  }
  if (button.dataset.move) {
    player().move = Number(button.dataset.move);
    const stop = () => {
      player().move = 0;
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  } else command(button.dataset.command);
});
const typing = (target) => Boolean(target.closest?.('input, select, textarea, [contenteditable]'));
window.addEventListener('keydown', (press) => {
  if (state.mode !== 'play' || typing(press.target) || press.repeat) return;
  const key = press.key.toLowerCase();
  if (key === 'v') return setWalking(!player().walking);
  if (player().walking) {
    if (key === 'c') return setCrawling(!player().crawling);
    if (key === 'shift') state.walkRunning = true;
    if (WALK_KEYS[key]) {
      press.preventDefault();
      walkHeld.add(key);
      return;
    }
  }
  if (press.key === 'a' || press.key === 'ArrowLeft') player().move = -1;
  else if (press.key === 'd' || press.key === 'ArrowRight') player().move = 1;
  else if (KEYS[key]) {
    press.preventDefault();
    command(KEYS[key]);
  }
});
// Away from the window, every held key and button is let go.
window.addEventListener('blur', () => {
  walkHeld.clear();
  state.walkRunning = false;
  if (state.mode === 'play' && player()) player().move = 0;
});
window.addEventListener('keyup', (press) => {
  const key = press.key.toLowerCase();
  walkHeld.delete(key);
  if (key === 'shift') state.walkRunning = false;
  if (state.mode === 'play' && !player()?.walking && ['a', 'd', 'ArrowLeft', 'ArrowRight'].includes(press.key)) player().move = 0;
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
// design's own unless chosen), headgear, and the fists.
// The pickers offer the design's own colour and every named cloth colour.
const PICKER_COLORS = { design: null, ...CLOTH_COLORS };
const colorName = (hex) => (hex ? Object.keys(PICKER_COLORS).find((name) => PICKER_COLORS[name] === hex) ?? 'design' : 'design');
const outfitField = (inputs) => (inputs.outfit ??= { kind: 'boxing', design: 0 });
const OUTFIT_FIELDS = [
  {
    key: 'kind', label: 'Outfit', options: OUTFIT_KEYS, names: Object.fromEntries(OUTFIT_KEYS.map((key) => [key, OUTFITS[key].label])),
    get: (inputs) => outfitField(inputs).kind,
    set: (inputs, value) => {
      Object.assign(outfitField(inputs), { kind: value, design: 0, colors: randomColors(value) });
      inputs.accessories = defaultHeadgear(value);
    },
  },
  {
    key: 'design', label: 'Design', options: ['0', '1', '2'], names: null,
    get: (inputs) => String(outfitField(inputs).design ?? 0), set: (inputs, value) => { outfitField(inputs).design = Number(value); },
  },
  {
    key: 'top', label: 'Top', options: Object.keys(PICKER_COLORS),
    get: (inputs) => colorName(outfitField(inputs).colors?.top), set: (inputs, value) => { outfitField(inputs).colors = { ...outfitField(inputs).colors, top: PICKER_COLORS[value] ?? undefined }; },
  },
  {
    key: 'bottom', label: 'Legs', options: Object.keys(PICKER_COLORS),
    get: (inputs) => colorName(outfitField(inputs).colors?.bottom), set: (inputs, value) => { outfitField(inputs).colors = { ...outfitField(inputs).colors, bottom: PICKER_COLORS[value] ?? undefined }; },
  },
  {
    // What the outfit offers for the head; filled in per outfit (see fillCornerForm).
    key: 'headgear', label: 'Headgear', options: Object.keys(HEADGEAR).concat('none'),
    get: (inputs) => (inputs.accessories ?? [])[0] ?? 'none',
    set: (inputs, value) => { inputs.accessories = value === 'none' ? [] : [value]; },
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
  // The characters under their factions.
  presetSelect.replaceChildren(...FACTION_KEYS.map((faction) => {
    const group = document.createElement('optgroup');
    group.label = `${FACTIONS[faction].glyph} ${FACTIONS[faction].label}`;
    group.append(...Object.entries(PRESETS).filter(([, preset]) => factionOf(preset) === faction).map(([key, preset]) => new Option(preset.name, key)));
    return group;
  }).filter((group) => group.children.length));
  presetSelect.value = Object.keys(PRESETS).find((key) => PRESETS[key].name === current(corner).name) ?? 'heavy';
  presetSelect.addEventListener('change', () => {
    const chosen = normaliseInputs(structuredClone(PRESETS[presetSelect.value]));
    shuffleColors(chosen);
    setCurrent(corner, chosen);
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
  // New colours from this outfit's palette, as often as wanted.
  const shuffle = Object.assign(document.createElement('button'), { type: 'button', className: 'shuffle', textContent: 'Shuffle colours' });
  shuffle.addEventListener('click', () => {
    shuffleColors(current(corner));
    fillCornerForm(corner);
  });
  outfit.append(shuffle);
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
      if (file.kind !== 'gladiator/fighter' && file.kind !== 'boxer-simulator/fighter') throw new Error('not a fighter file');
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
  // Headgear this outfit allows; anything else is taken off.
  const headOptions = headgearOptions(kind);
  if (!headOptions.includes((inputs.accessories ?? [])[0] ?? 'none')) inputs.accessories = [];
  outfit.querySelector('[data-outfit="headgear"]').replaceChildren(...headOptions.map((option) => new Option(option === 'none' ? 'None' : HEADGEAR[option].label, option)));
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

/**
 * The builder edits whichever fighters are on: the sandbox's own two, or a
 * level's. A level's are kept as tuned until the page is reloaded, so the
 * tuning survives going back to the ring and returning.
 */
function chooseLevel(key) {
  if (!state.scenario) state.sandboxRosters = state.rosters;
  if (key) {
    const scenario = SCENARIOS[key];
    // A level with a whole cast is made fresh each visit, at its own sizes.
    if (scenario.cast) state.levelRosters[key] = scenario.cast(Math.random);
    state.levelRosters[key] ??= Object.fromEntries(scenarioFighters(scenario).map(({ inputs, corner }) => [corner, [inputs]]));
    state.rosters = state.levelRosters[key];
    if (scenario.cast) for (const corner of ['red', 'blue']) state.teamSizes[corner] = state.rosters[corner].length;
  } else state.rosters = state.sandboxRosters;
  state.scenario = key;
  refreshBuilder();
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

const SETUP_KIND = 'gladiator/setup';
const OLD_SETUP_KIND = 'boxer-simulator/setup';

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
  if ((file?.kind !== SETUP_KIND && file?.kind !== OLD_SETUP_KIND) || !file.teams?.red?.length || !file.teams?.blue?.length) throw new Error('not a setup');
  if (file.level && !SCENARIOS[file.level]) throw new Error(`no level called ${file.level}`);
  if ((file.level ?? null) !== state.scenario) chooseLevel(file.level ?? null);
  const fighter = (entry) => {
    const { weightKg, ...inputs } = entry;
    return normaliseInputs({ ...inputs, look: { ...DEFAULT_LOOK, ...inputs.look } });
  };
  state.rosters = { red: file.teams.red.map(fighter), blue: file.teams.blue.map(fighter) };
  if (state.scenario) state.levelRosters[state.scenario] = state.rosters;
  for (const corner of ['red', 'blue']) {
    state.teamSizes[corner] = Math.min(20, state.rosters[corner].length);
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

// ---- The parts of the game: the menus' fights, levels and the sandbox -----------

let goHome = () => {};

/** Show which part of the game is on: the footer keeps only what it uses. */
function setGame(game, next = null) {
  if (state.game === 'sandbox' && game !== 'sandbox') state.sandbox = { rosters: state.rosters, teamSizes: { ...state.teamSizes }, place: state.place };
  state.game = game;
  state.next = next;
  document.body.dataset.game = game;
  $('#banner-again').textContent = next?.text ?? 'Next bout';
  $('#builder').hidden = true;
  state.paused = false;
  $('#pause').textContent = 'Pause';
  document.body.classList.remove('sheet');
  document.querySelector('#sheet-labels')?.replaceChildren();
}

/** A one-on-one (or any sides) from the menus: given fighters, in a given place. */
function match({ red, blue, place, game, next }) {
  setGame(game, next);
  state.scenario = null;
  state.rosters = { red: red.map((inputs) => normaliseInputs(structuredClone(inputs))), blue: blue.map((inputs) => normaliseInputs(structuredClone(inputs))) };
  state.teamSizes = { red: red.length, blue: blue.length };
  state.editing = { red: 0, blue: 0 };
  state.place = place;
  newBout();
}

/** The fight behind the menus: two random gladiators in the Colosseum, one after another. */
function attract() {
  if (state.mode === 'play') $('#modes button[data-value="watch"]').click();
  match({ red: [randomGladiator()], blue: [randomGladiator()], place: 'colosseum', game: 'home', next: { text: 'Next bout', run: attract } });
  Object.assign(scene.orbit, { distance: 4.6, pitch: 0.12 });
}

function enterLevel(key) {
  setGame('level', { text: 'Again', run: () => chooseLevel(key) });
  chooseLevel(key);
}

/** The sandbox as it was left: its own fighters, sides and place. */
function enterSandbox() {
  setGame('sandbox');
  const kept = state.sandbox ?? { rosters: { red: [normaliseInputs(structuredClone(PRESETS.heavy))], blue: [normaliseInputs(structuredClone(PRESETS.light))] }, teamSizes: { red: 1, blue: 1 }, place: 'ring' };
  state.scenario = null;
  state.rosters = kept.rosters;
  state.sandboxRosters = kept.rosters;
  state.teamSizes = { ...kept.teamSizes };
  state.place = kept.place;
  state.editing = { red: 0, blue: 0 };
  $('#place').value = kept.place;
  refreshBuilder();
  newBout();
}

// ---- Portraits: one fighter drawn alone, for the Deadliest Warrior cards ----------

const portraits = new Map();
let portraitView = null;
let portraitQueue = Promise.resolve();

/** A picture of a fighter in his guard, drawn off-screen once and kept (a data URL). */
function portrait(key, inputs) {
  if (portraits.has(key)) return portraits.get(key);
  const made = (portraitQueue = portraitQueue.then(() => new Promise((done) => setTimeout(() => done(drawPortrait(inputs)), 0))));
  portraits.set(key, made);
  return made;
}

function drawPortrait(inputs) {
  if (!portraitView) {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 380;
    portraitView = createScene(canvas);
    portraitView.renderer.setPixelRatio(1);
    resize(portraitView, 300, 380);
    portraitView.places.ring.visible = false;
    portraitView.scene.background = new THREE.Color(0x1a1f2c);
    portraitView.scene.fog = null;
  }
  const world = createWorld([{ inputs: normaliseInputs(structuredClone(inputs)), corner: 'red' }], { seed: 3 });
  const fighter = world.fighters[0];
  placeFighter(fighter, 0, 0);
  fighter.yaw = -0.45;
  advance(world, 0.7, null, STEP);
  const view = buildFighterView(portraitView, fighter);
  setLayer(view, 'skin');
  updateFighterView(view, 0, world.time);
  updateArms(portraitView, view, world.time);
  updateProps(portraitView, [view], world);
  Object.assign(portraitView.orbit, { distance: 2.35, pitch: 0.08, yaw: 0.15 });
  portraitView.orbit.target.set(0, 1.0, 0);
  placeCamera(portraitView, null);
  render(portraitView);
  const url = portraitView.renderer.domElement.toDataURL('image/png');
  disposeFighterView(portraitView, view);
  return url;
}

/** The character creator's fighter: standing alone, facing the camera, to one side of the panel. */
function preview(inputs, event) {
  const place = event === 'boxing' ? 'ring' : 'colosseum';
  const wide = innerWidth > 760;
  state.world = createWorld([{ inputs: normaliseInputs(structuredClone(inputs)), corner: 'red' }], { seed: 3, arena: PLACE_ARENAS[place] });
  clearGore(scene);
  setPlace(scene, place, PLACE_ARENAS[place]);
  const fighter = state.world.fighters[0];
  // +z is screen left: on a wide screen the panel is on the left, so the fighter goes right.
  placeFighter(fighter, 0, wide ? -0.75 : 0);
  fighter.handsDown = true;
  fighter.yaw = -0.5;
  advance(state.world, 0.6, null, STEP);
  state.paused = true;
  state.finishedAt = null;
  state.eventCursor = 0;
  resetDrama(state.drama);
  rebuildViews();
  // On a phone the panel fills the lower part, so the camera stands back and
  // aims below the feet: the whole fighter sits in the top third.
  Object.assign(scene.orbit, { distance: wide ? 4.2 : 7, pitch: 0.08, yaw: 0.15 });
  scene.orbit.target.set(0, wide ? 1 : -0.8, 0);
  document.body.classList.add('sheet');
}

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
const menus = installMenus({
  attract, match, sandbox: enterSandbox, level: enterLevel, preview, portrait,
  stats: (inputs) => deriveStats(buildBody(normaliseInputs(structuredClone(inputs)))),
  calorieRange: (inputs) => calorieRange(inputs, (FRAMES[inputs.frame] ?? FRAMES.medium).lean),
  hours: exerciseHours,
  onMenu: (home) => { goHome = home; },
});
menus.home();
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
    // Worn by its own characters where it has any (a gown on the lady), else by a man and a woman.
    // Gowns stand wider than trousers.
    spacing: OUTFITS[kind].designs.some((design) => design.bottom?.kind === 'gown') ? 1.1 : undefined,
    rows: Object.values(PRESETS).filter((preset) => preset.outfit?.kind === kind).slice(0, 2).concat([PRESETS.light, PRESETS.contender]).slice(0, 2),
    // Wider for more designs, and above the ropes.
    camera: { distance: 2.9 + 0.7 * Math.max(0, OUTFITS[kind].designs.length - 3), pitch: 0.08 + 0.03 * Math.max(0, OUTFITS[kind].designs.length - 3), yaw: 0.15, height: 0.95 },
  };
}

// Every piece of headgear, on the outfit it goes with.
SHEETS.headgear = {
  options: [['casual', 'headset'], ['sports', 'cap'], ['hiking', 'boonie'], ['yakuza', 'hat'], ['commoner', 'headWrap'], ['knight', 'plume'], ['samurai', 'crest']]
    .map(([kind, item]) => [{ outfit: { kind, design: 0 }, accessories: [item] }, HEADGEAR[item].label, OUTFITS[kind].label]),
  rows: [PRESETS.heavy, PRESETS.contender],
  camera: { distance: 6.2, pitch: 0.12, yaw: 0.15, height: 1.2 },
};

/** The inputs a sheet option builds: a look field, an outfit, or a body fed to a BMI. */
function sheetInputs(sheet, row, value) {
  // A whole character as an option (a lineup of different people).
  if (value.inputs) return normaliseInputs(structuredClone(value.inputs));
  const inputs = normaliseInputs(structuredClone(sheet.rows[row]));
  if (sheet.field) return { ...inputs, look: { ...inputs.look, [sheet.field]: value } };
  if (value.outfit) return { ...inputs, outfit: value.outfit, accessories: value.accessories ?? defaultHeadgear(value.outfit.kind) };
  const height = inputs.heightCm / 100;
  return { ...inputs, calories: Math.round(caloriesForWeight(inputs, value.bmi * height * height, FRAMES[inputs.frame].lean)) };
}

/** Line up every option of a sheet for one build (`row`), labelled, and frame them. */
function designSheet(kind, row = 0, closeUp = null, turn = 0, pick = null) {
  // `pick`: only these columns (a shortlist to choose from).
  // `kind`: a sheet's name, or a sheet itself ({ options, rows, camera }).
  const named = typeof kind === 'string' ? SHEETS[kind] : kind;
  const sheet = pick ? { ...named, options: pick.map((column) => named.options[column]) } : named;
  const spacing = sheet.spacing ?? { faces: 0.55, bodies: 0.8, physiques: 1.15 }[kind] ?? 0.85;
  const entries = sheet.options.map(([value, label], column) => ({ inputs: { ...sheetInputs(sheet, row, value), name: label }, corner: 'red', column }));
  const middle = (entries.length - 1) / 2;
  state.paused = true;
  state.world = createWorld(entries, { seed: 3 });
  clearGore(scene);
  // Option A on the left as the camera sees it (+z is screen left).
  state.world.fighters.forEach((fighter, index) => {
    placeFighter(fighter, 0, (middle - entries[index].column) * spacing);
    fighter.handsDown = true;
    // Turn the bladed stance so the face, not the hips, points at the camera.
    fighter.yaw = -0.5 + turn;
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

/**
 * Test hook: a fight of any inputs, red against blue (each a list of
 * partial inputs over the contender preset), at a distance, paused or not.
 */
function fight(red, blue, { seed = 1, distance = null, paused = false, place = state.place } = {}) {
  const build = ({ preset = 'contender', ...inputs }) => ({ ...structuredClone(PRESETS[preset]), ...inputs });
  const entries = [...red.map((inputs) => ({ inputs: build(inputs), corner: 'red' })), ...blue.map((inputs) => ({ inputs: build(inputs), corner: 'blue' }))];
  document.body.classList.remove('sheet');
  document.querySelector('#sheet-labels')?.replaceChildren();
  state.world = createWorld(entries, { seed, arena: PLACE_ARENAS[place] });
  clearGore(scene);
  setPlace(scene, place, PLACE_ARENAS[place]);
  if (distance && state.world.fighters.length === 2) {
    placeFighter(state.world.fighters[0], -distance / 2, 0);
    placeFighter(state.world.fighters[1], distance / 2, 0);
  }
  state.eventCursor = 0;
  state.finishedAt = null;
  state.paused = paused;
  resetDrama(state.drama);
  $('#banner').hidden = true;
  rebuildViews();
  return state.world.fighters.map((fighter) => fighter.style);
}

// Test hook: step the world by seconds without the frame clock.
window.boxer = {
  state,
  scene,
  designSheet,
  presets: PRESETS,
  fight,
  // Open a level (its key in SCENARIOS), as its menu button does; null for the sandbox.
  level: chooseLevel,
  preview,
  throw: (move, zone, who = 0) => throwPunch(state.world, state.world.fighters[who], move, zone),
  // Knock a fighter's weapon out of his hand, sideways.
  disarm: (who = 0) => dropWeapon(state.world, state.world.fighters[who], 'disarmed', [0, 1.2, 2.2]),
  // Send a fighter crawling away, as a badly hurt man in a panic does.
  crawl: (who = 0) => startCrawl(state.world, state.world.fighters[who], 'crawls away'),
  // Play `count` real frames of `dt` s each, as the page's own loop would (tests, profiling).
  playFrames: (count, dt = 1 / 60) => {
    for (let index = 0; index < count; index += 1) {
      buildQueuedViews();
      if (!state.paused && !state.viewQueue?.length) tick(dt * state.speed * timeScale(state.drama, realSeconds()));
      draw(dt);
    }
  },
  // Finish an army's models now (tests; the page builds them a few a frame).
  finishBuilding: () => {
    while (state.viewQueue?.length) state.views.push(state.buildView(state.viewQueue.shift()));
    showMustering();
  },
  advance: (seconds) => {
    tick(seconds, { budget: Infinity });
    draw(0);
  },
};
