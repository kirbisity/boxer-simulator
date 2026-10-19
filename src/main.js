// Page wiring: builder, HUD, controls, and the loop that steps the world and
// draws it. The simulation runs at a fixed step whatever the frame rate.

import { buildBody, fighterFile, FRAMES, normaliseInputs, P, PRESETS } from './body.js';
import { calorieRange, caloriesForWeight, deriveStats, exerciseHours } from './physiology.js';
import { hurtShare, thinkAll } from './ai.js';
import { MOVES, STRATEGIES, STYLE_KEYS, STYLES } from './moves.js';
import { advance, opponentFor, collapseAt, dropWeapon, concussionCapacity, createWorld, perform, placeFighter, placeOnFloor, point, reviveFighter, startCrawl, throwPunch, WORLD } from './physics.js';
import { DEFAULT_LOOK, LOOK_OPTIONS } from './face.js';
import { activateLook, activateLookNow, activeLook, DEFAULT_LOOK_ID, OFFICIAL_LOOK_ID, flattenView, loadLook, lookById, lookIdFromSearch, lookList, LOOKS, rememberedLookId, rememberLook } from './looks.js';
import { installLooksBench } from './looksbench.js';
import { randomCharacter, randomGladiator, varyCharacter } from './cast.js';
import { ratingOf } from './roster.js';
import { installMenus } from './menu.js';
import { LEVEL_PRESETS, levelPreset } from './levelmode/presets.js';
import { introPlaying, playIntro, skipIntro, stepIntro } from './intro.js';
import { askRunLock, breakRun, CONTROL, contextAction, directFighter, endRun, keyStick, MOVE_KEYS, newOrders, playerCrawl } from './control.js';
import { installFightControls, TOUCH } from './touch.js';
import { canCommand, clearOrders, COMMAND_ORDERS, giveOrder } from './command.js';
import { createFightUiMarks } from './fightui/marker.js';
import { fightUiChoose } from './fightui/index.js';
import { fightUiWireToggle } from './fightui/toggle.js';
import { cameraRoom, createFollowCam } from './followcam.js';
import { createSeeThrough } from './seethrough.js';
import { adaptiveSize, createAdaptiveResolution } from './adaptres.js';
import { sceneryLodOn, sceneryLodStats, setSceneryLod } from './scenerylod.js';
import { createTapper, createWatchCam, focusOn, frameAll, frameDistance, pickMan, stepFree, stepReframe, zoomBy, zoomLimits } from './watchcam.js';
import { forgetTutorial, installTutorial, markTutorialDone, TUTORIAL, TUTORIAL_STEPS, tutorialDone, tutorialWanted } from './tutorial.js';
import { checkButtons } from './uicheck.js';
import { crewFighter, SCENARIOS, scenarioFighters } from './scenarios.js';
import { CLOTH_COLORS, defaultHeadgear, FACTION_KEYS, factionOf, FACTIONS, HEADGEAR, headgearOptions, OUTFIT_KEYS, outfitOf, OUTFITS, PICKABLE_OUTFIT_KEYS, randomColors } from './outfits.js';
import { addIcon, dramaCamera, momentFor, momentPlaying, resetDrama, startMoment, timeScale, updateIcons } from './drama.js';
import { beginCrowdBatches, CROWD_VIEW, endCrowdBatches } from './crowdview.js';
import { crowdLod, protectedMen, STAGE_CROWD_VIEW } from './crowdlod.js';
import { updateNets } from './arenaview.js';
import { buildFighterView, clearCrowdTemplates, PLACE_ARENAS, SKIN_TONES, createScene, disposeFighterView, forgetPlaces, placeCamera, reapplyPlace, render, resize, selectCrowdDraw, setLayer, setPlace, showImpact, updateFighterView, updateProps, updateSpray } from './render.js';
import { buildHorseView, disposeHorseView, updateHorseView } from './horseview.js';
import { canRide, HORSES, isMounted, mountAll, mountedTeams, mountOf } from './horses.js';
import { awarenessReport, freePrisoner, gatherFollowers } from './levelmode/awareness.js';
import { createAwarenessOverlay } from './levelmode/awarenessview.js';
import { pullLever, setMechanism, updateStage } from './levelmode/stage.js';
import { bannerWinner, contextFor, createLevelWorld, drainRebuilds, drainUi, endingDone, interact, interactions, killBoss, levelBusy, levelOpponent, levelThink, princeOf, respawnPlayer, restAtPoint, restartFromRest, useItem } from './levelmode/level.js';
import { feetFloor, holdPlayer } from './levelmode/items.js';
import { installLevelHud } from './levelmode/hud.js';
import { NOTES, STAGE_ONE, closeStory, showDeath, showEnding, showFinale, showNote, showOpening, storyBusy } from './levelmode/story.js';
import { createLevelMarkers } from './levelmode/markers.js';
import { createShards } from './levelmode/endingview.js';
import { STAGES } from './levelmode/stages.js';
import { createStageView, disposeStageView, placeStageSea, updateStageView } from './levelmode/terrainview.js';
import { stormEnvironment, stormLook, stormReset, stormSetLook, stormStrikeNow } from './levelmode/storm.js';
import { DEFAULT_STAGE_LOOK, STAGE_LOOKS, stageLookNames } from './levelmode/stagelooks.js';
import { stageCameraRoom } from './levelmode/kit.js';
import { ktSightline } from './levelmode/kittex.js';
import { clearGore, severView, spawnBlood, spawnShot, spawnSparks, updateArms, updateArrows, updateBlood, updateDebris, updateShots, updateStumps, updateWhips, woundBlood } from './weaponview.js';

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
  // Sandbox: a side that stands still (no AI: no guard, no blows, no footwork), a target for testing armour.
  standStill: '',
  paused: false,
  mode: 'watch',
  aimBody: false,
  // The player's orders (control.js): his lock, stick, guard, attacks asked for.
  orders: newOrders(),
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

// The look (looks.js): ?look= over the one remembered. One that needs nothing loaded is in force before the scene is made; the others are switched to once the page is up.
const startingLookId = lookIdFromSearch(location.search) ?? rememberedLookId() ?? OFFICIAL_LOOK_ID;
activateLookNow(startingLookId);

const scene = createScene($('#stage'));
if (activeLook().id !== DEFAULT_LOOK_ID) reapplyPlace(scene);

// The tutorial's card (tutorial.js); installed below, once the yard it stages is defined.
let tutorial = { signal() {}, update() {}, setDevice() {}, start() {}, stop() {}, active: false };

// The third-person camera of play mode (followcam.js), kept out of the place's walls.
let cameraWalls = null;
// (A stage's walls and roofs are walked along from the target, so that a thin wall is not leapt over: `march`, set by enterStage.)
const cameraRoomTest = (x, z, y) => !cameraWalls || cameraWalls(x, z, y);
const followCam = createFollowCam(undefined, { room: cameraRoomTest });

// The camera when watching (watchcam.js): framing everyone, or taken over by the viewer's zoom and tap.
let watchCam = createWatchCam();

// Scenery between the camera and the men it watches is drawn see-through (seethrough.js).
const seeThrough = createSeeThrough();

// The marks of the player's blows in the fight (fightui/marker.js): where each goes, its way, how it went.
const fightMarks = createFightUiMarks(scene);
let fightMarksClock = 0;

// The fight's controls (touch.js): drawn over the fight in play mode only.
const fightControls = installFightControls($('#fight-ui'), {
  world: () => state.world,
  player: () => player(),
  orders: () => state.orders,
  now: realSeconds,
  look: (yaw, pitch) => followCam.look(yaw, pitch, realSeconds(), state.orders.lock !== null),
  zoom: (ratio) => followCam.zoom(ratio),
  signal: (kind, detail) => tutorial.signal(kind, detail),
  onDevice: (kind) => tutorial.setDevice(kind),
  project: (at) => {
    const projected = new THREE.Vector3(at[0], at[1], at[2]).project(scene.camera);
    const box = scene.renderer.domElement.getBoundingClientRect();
    return [box.left + ((projected.x + 1) / 2) * box.width, box.top + ((1 - projected.y) / 2) * box.height, projected.z < 1 && Math.abs(projected.x) < 1.2 && Math.abs(projected.y) < 1.2];
  },
  ray: (x, y) => {
    const box = scene.renderer.domElement.getBoundingClientRect();
    const through = new THREE.Vector3(((x - box.left) / box.width) * 2 - 1, -((y - box.top) / box.height) * 2 + 1, 0.5).unproject(scene.camera);
    const origin = scene.camera.position;
    const dir = through.sub(origin).normalize();
    return { origin: [origin.x, origin.y, origin.z], dir: [dir.x, dir.y, dir.z] };
  },
  floorAxes: () => floorAxes(),
  marks: () => (state.mode === 'play' ? fightMarks : null),
  clock: () => fightMarksClock,
  order: (kind) => orderSide(kind),
  // In a stage the man he is on is one near or aware of him, not the nearest of the garrison.
  opponent: (world, me) => (world.stage?.level ? levelOpponent(world, me) : opponentFor(world, me)),
});
fightUiWireToggle($('#fightui-pick'));
// Level mode's own controls on top of the fight's: the context pill, the items, the action bar (levelmode/hud.js).
const levelHud = installLevelHud($('#fight-ui'), { world: () => state.world, active: () => Boolean(state.world?.stage?.level) && state.mode === 'play', now: realSeconds });

// The ring on the floor round the man locked on.
const lockRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), new THREE.MeshBasicMaterial({ color: 0xffcf4a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
lockRing.rotation.x = -Math.PI / 2;
lockRing.renderOrder = 2;
lockRing.visible = false;
scene.scene.add(lockRing);

// The way of a charge just ordered: a gold arrow on the floor before him, fading.
const CHARGE_ARROW = { ahead: 2.2, seconds: 1.6 };
const chargeArrow = new THREE.Group();
{
  const shape = new THREE.Shape();
  shape.moveTo(-0.7, -0.09);
  shape.lineTo(0.25, -0.09);
  shape.lineTo(0.25, -0.3);
  shape.lineTo(0.8, 0);
  shape.lineTo(0.25, 0.3);
  shape.lineTo(0.25, 0.09);
  shape.lineTo(-0.7, 0.09);
  const flat = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xffcf4a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  flat.rotation.x = -Math.PI / 2;
  flat.renderOrder = 2;
  chargeArrow.add(flat);
}
chargeArrow.visible = false;
scene.scene.add(chargeArrow);
let chargeArrowAt = -Infinity;

/** Give the player's side an order (command.js): a charge goes the way the camera looks, or at the man he is locked on. */
function orderSide(kind) {
  const me = player();
  if (state.mode !== 'play' || !canCommand(state.world, me)) return;
  const locked = lockedTarget();
  const dir = locked ? [locked.x[P.pelvis * 3] - me.x[P.pelvis * 3], locked.x[P.pelvis * 3 + 2] - me.x[P.pelvis * 3 + 2]] : floorAxes().ahead;
  const command = giveOrder(state.world, me, kind, { dir });
  if (command?.kind !== 'charge') return;
  chargeArrow.position.set(command.at[0] + command.dir[0] * CHARGE_ARROW.ahead, 0.03, command.at[1] + command.dir[1] * CHARGE_ARROW.ahead);
  chargeArrow.rotation.y = Math.atan2(-command.dir[1], command.dir[0]);
  chargeArrowAt = realSeconds();
}

/** The charge's arrow, fading out. */
function placeChargeArrow() {
  const age = realSeconds() - chargeArrowAt;
  chargeArrow.visible = state.mode === 'play' && age < CHARGE_ARROW.seconds;
  if (chargeArrow.visible) chargeArrow.children[0].material.opacity = 0.85 * (1 - age / CHARGE_ARROW.seconds);
}

/** The lock's ring under his man's feet, turning slowly. */
function placeLockRing() {
  const locked = state.mode === 'play' && state.orders.lock !== null ? state.world.fighters[state.orders.lock] : null;
  lockRing.visible = Boolean(locked);
  if (!locked) return;
  lockRing.position.set(locked.x[P.pelvis * 3], 0.025, locked.x[P.pelvis * 3 + 2]);
  lockRing.rotation.z = realSeconds() * 0.8;
}

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
  leaveStage();
  state.seed += 1;
  // A scenario is the same world on its own floor, with its own people.
  const scenario = state.scenario ? SCENARIOS[state.scenario] : null;
  // Each side: its lead (the one the builder edits) and, in a team fight,
  // the level's crew or, in the ring, fighters from the presets.
  // Who rides is each fighter's own (`inputs.mounted`, set in the builder; those whose kit rides: horses.js canRide).
  const sides = ['red', 'blue'].map((corner) => teamFor(corner, scenario).map((inputs) => ({ inputs, corner })));
  refreshMountButton();
  // Five presets for six places: a name used twice gets a number.
  const names = new Map();
  for (const entry of [...sides[0], ...sides[1]]) {
    const count = (names.get(entry.inputs.name) ?? 0) + 1;
    names.set(entry.inputs.name, count);
    if (count > 1) entry.inputs = { ...entry.inputs, name: `${entry.inputs.name.split(" ")[0]} ${count}` };
  }
  // Horsemen need room to charge and wheel: a place too small for it gives way to the open field.
  const mounted = [...sides[0], ...sides[1]].some((entry) => entry.inputs.mounted && canRide(entry.inputs));
  const place = scenario?.scene ?? (mounted && (PLACE_ARENAS[state.place]?.halfX ?? 0) < PLACE_ARENAS.field.halfX * 0.6 ? 'field' : state.place);
  const arena = scenario?.arena ?? PLACE_ARENAS[place];
  state.world = createWorld([...sides[0], ...sides[1]], { seed: state.seed, arena, rules: scenario?.rules, formation: scenario?.formation });
  clearGore(scene);
  setPlace(scene, place, arena, scenario?.weather);
  fightMarks.reset();
  fightMarks.warm();
  cameraWalls = cameraRoom(place, arena);
  cameraRoomTest.march = false;
  followCam.reset();
  // A level frames its own place; anything else starts from the usual ringside view.
  Object.assign(scene.orbit, scenario?.camera ?? { yaw: -0.5, pitch: 0.2, distance: 5.2 });
  watchCam = createWatchCam();
  cameraNote = '';
  document.body.dataset.place = place;
  $('#place').closest('label').hidden = Boolean(scenario);
  rebuildViews({ progressive: true });
  state.eventCursor = 0;
  state.finishedAt = null;
  resetDrama(state.drama);
  $('#log').replaceChildren();
  $('#banner').hidden = true;
  renderHud();
  state.orders = newOrders();
  fightControls.reset();
  if (state.game === 'tutorial') placeYard();
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
  // The horses (physics/mounted.js), one model each.
  for (const view of state.horseViews ?? []) disposeHorseView(scene, view);
  const crowded = (state.world.horses?.length ?? 0) > 4;
  state.horseViews = (state.world.horses ?? []).map((horse) => buildHorseView(scene, horse, { detail: crowded ? 'low' : 'full' }));
  if ((scene.crowdTemplates?.size ?? 0) > CROWD_TEMPLATE_CAP) clearCrowdTemplates(scene);
  const crowd = state.world.fighters.length > CROWD_DRAWING;
  // (In a stage the man played is the one lead: the first man met on the other side is no better drawn than the rest of his garrison.)
  const leads = new Set(state.world.stage ? [state.world.fighters[0].id] : ['red', 'blue'].map((corner) => state.world.fighters.find((fighter) => fighter.corner === corner)?.id));
  const build = (fighter) => {
    const view = buildFighterView(scene, fighter, { simple: crowd && !leads.has(fighter.id) });
    setLayer(view, state.layer);
    return view;
  };
  const order = [...state.world.fighters].sort((a, b) => Number(leads.has(b.id)) - Number(leads.has(a.id)));
  // Built a few a frame (the two leads first, a frame each: each is a full model), or all now.
  const now = progressive && crowd ? [] : order;
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
  // A level-mode stage: the sections around the player awake, the rest dormant (levelmode/stage.js); then his own
  // systems (levelmode/level.js): an action in hand, tonics at work, a death, the boss's second phase.
  if (world.stage) {
    updateStage(world);
    if (world.stage.level) levelThink(world, dt);
  }
  // The intro's legends stand in their guard: nobody to fight.
  if (state.game === 'intro') return;
  const players = state.mode === 'play' && player() ? new Set([player().id]) : new Set();
  // The one you play is simulated in full however big the fight.
  world.keepFull = new Set(players);
  // Standing still: no thinking at all; he stays where he is, guard down, and takes what comes.
  const still = new Set(players);
  // Crawling (the sandbox's look at it): that side down on its knees, still in the fight; the player's man as he chooses.
  const crawlSide = !state.scenario && state.standStill.startsWith('crawl:') ? state.standStill.slice(6) : null;
  for (const fighter of world.fighters) {
    if (players.has(fighter.id)) continue;
    if (fighter.corner === crawlSide && !fighter.crawling) playerCrawl(world, fighter, true);
    else if (fighter.corner !== crawlSide && fighter.crawlChosen) playerCrawl(world, fighter, false);
  }
  if (state.standStill && !crawlSide && !state.scenario) {
    for (const fighter of world.fighters) {
      if (fighter.corner !== state.standStill || players.has(fighter.id)) continue;
      still.add(fighter.id);
      world.keepFull.add(fighter.id);
      Object.assign(fighter, { move: 0, strafe: 0, running: false, goTo: null, defence: null, rush: null });
    }
  }
  // The training partner thinks nothing: he stands, and swings only when the tutorial says.
  if (state.game === 'tutorial') {
    const partner = yardPartner();
    if (partner) {
      still.add(partner.id);
      world.keepFull.add(partner.id);
      yardStep(world, partner);
    }
  }
  thinkAll(world, dt, still);
  if (!players.size) return;
  // At a bandage, a change of harness, a stoop for a weapon: he stands where he is.
  if (world.stage?.level && levelBusy(world)) {
    endRun(state.orders);
    player().runMode = false;
    holdPlayer(player());
  }
  // Walking about (V), the keys steer him; otherwise he does as the orders say.
  else if (player().walking) walkAbout(player());
  else {
    // The movement keys: a stick, the way the camera looks.
    state.orders.keyStick = keyStick(fightKeys, floorAxes(), state.walkRunning);
    if (state.orders.keyStick) tutorial.signal('move', 1);
    directFighter(world, player(), state.orders, dt);
  }
}

/** The camera's own axes on the floor: the way it looks, and its right. */
function floorAxes() {
  const look = [scene.orbit.target.x - scene.camera.position.x, scene.orbit.target.z - scene.camera.position.z];
  const length = Math.hypot(look[0], look[1]) || 1;
  const ahead = [look[0] / length, look[1] / length];
  return { ahead, right: [-ahead[1], ahead[0]] };
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
  fighter.runMode = fighter.running;
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
    fighter.runMode = false;
    walkHeld.clear();
  }
}

/** Walking about on his knees, or back on his feet (the sandbox's look at the crawl). */
function setCrawling(on) {
  const fighter = player();
  if (!fighter?.walking) return;
  fighter.crawling = on;
}

let last = performance.now();
// A big battle that cannot keep up is drawn with fewer pixels (adaptres.js); a duel never.
const resolution = createAdaptiveResolution();
function frame(now) {
  // The next frame is asked for first: an error in this one must never stop the game.
  requestAnimationFrame(frame);
  const started = performance.now();
  const interval = now - last;
  const dt = Math.min(0.1, interval / 1000);
  last = now;
  try {
    resolution.frame(scene, interval, adaptiveSize(state.world?.fighters.length ?? 0, Boolean(state.world?.stage)));
    // A big moment slows the simulation, not the drawing.
    buildQueuedViews();
    // While an army is still being drawn, the fight waits for it.
    if (!state.paused && !state.viewQueue?.length) tick(dt * state.speed * timeScale(state.drama, realSeconds()));
    draw(dt);
  } catch (error) {
    // Reported once per kind of error, not sixty times a second.
    const key = String(error?.stack ?? error);
    if (!frameErrors.has(key)) {
      frameErrors.add(key);
      console.error('Gladiator frame error (the game carries on):', error);
    }
  }
  resolution.worked(performance.now() - started);
}
const frameErrors = new Set();

// The most a frame may spend simulating (ms). A big battle at its height
// can cost more than real time to simulate; past this budget the frame stops
// and lets the fight run a little slower than real time, rather than trying
// to catch up and stalling the page (each frame longer than the last).
const SIM_BUDGET_MS = 20;

function tick(seconds, { budget = SIM_BUDGET_MS } = {}) {
  // The training yard begins again when a man in it is out (between frames: never while one is drawn).
  if (state.game === 'tutorial' && yard.restart) newBout();
  // A level-mode card (the opening, a note, the finale) holds the world still behind it.
  if (state.world.stage?.level && storyBusy()) {
    state.accumulator = 0;
    return;
  }
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
  if (state.world.stage?.level) drainLevel();
  // The intro has one side only, and the tutorial's partner is there to be struck: no bout to win.
  if (state.game === 'intro' || state.game === 'tutorial') return;
  // (A stage has no banner: bannerWinner is none there.)
  const winner = bannerWinner(state.world);
  // Behind the menus, one fight follows another.
  if (state.game === 'home' && state.finishedAt !== null && state.world.time > state.finishedAt + 3) state.next.run();
  if (winner && state.finishedAt === null && !momentPlaying(state.drama, realSeconds())) {
    state.finishedAt = state.world.time;
    const team = state.world.fighters.filter((fighter) => fighter.corner === winner);
    const name = team.length > 1 ? `${winner === 'red' ? 'Red' : 'Blue'} team` : team[0].body.inputs.name;
    $('#banner').hidden = state.game === 'home';
    // How it ended: the last fighter out on the losing side says.
    const ends = { severed: 'Cut down', killed: 'Killed', bledOut: 'Bled out', drowned: 'Lost to the sea', knockout: 'KO', stopped: 'Stopped', pinned: 'Held down' };
    const ending = [...state.world.events].reverse().find((event) => ends[event.kind] && state.world.fighters[event.fighter]?.corner !== winner);
    $('#banner-text').textContent = `${ends[ending?.kind] ?? 'KO'} — ${name} wins`;
  }
}

// ---- Level mode: what the player's systems tell the screen ---------------------------------------

/** A fighter's model built again (his body was made over: an outfit changed, a helm off, a man revived). */
function rebuildFighterView(id) {
  const fighter = state.world.fighters[id];
  const at = state.views.findIndex((view) => view.fighter.id === id);
  if (!fighter || at < 0) return;
  disposeFighterView(scene, state.views[at]);
  state.views[at] = state.buildView(fighter);
  if (fighter.dormant) {
    state.views[at].group.visible = false;
    state.views[at].stale = true;
  }
}

/** The level's messages since the last step: toasts, a note to read, the death, the second phase. */
function drainLevel() {
  const world = state.world;
  for (const id of drainRebuilds(world)) rebuildFighterView(id);
  for (const message of drainUi(world)) {
    if (message.type === 'toast') levelHud.toast(message.text);
    else if (message.type === 'note') showNote(NOTES[message.key] ?? { title: 'A note', body: String(message.key) });
    else if (message.type === 'death') showDeath(() => {
      // Behind the dark: wake at the last rest (unless the bout has been left or begun again).
      if (state.world !== world) return;
      respawnPlayer(world);
      for (const id of drainRebuilds(world)) rebuildFighterView(id);
      state.orders = newOrders();
      fightControls.reset();
      followCam.reset();
    });
    else if (message.type === 'phase2') levelHud.toast('The helm comes off');
    else if (message.type === 'ending') beginEnding(world);
    else if (message.type === 'rested') {
      // From now on the footer's Restart goes back to this rest, not the start.
      $('#restart').textContent = 'Last rest';
      $('#restart').title = 'Begin again from the last rest you reached';
    }
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
    // (A dormant man of a stage is not drawn and does not move: nothing to blend.)
    fighters: world.fighters.map((fighter) => (fighter.dormant ? null : { x: fighter.x.slice(), dir: fighter.weapon?.dir?.slice(), offDir: fighter.offWeapon?.dir?.slice() })),
    debris: world.debris.map((piece) => ({ x: piece.x?.slice(), q: piece.q?.slice() })),
    horses: (world.horses ?? []).map((horse) => ({ at: horse.at.slice(), yaw: horse.yaw, stride: horse.stride })),
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
    const now = { fighter, x: fighter.x.slice(), dir: fighter.weapon?.dir, offDir: fighter.offWeapon?.dir };
    kept.push(now);
    const x = fighter.x;
    for (let at = 0; at < x.length; at += 1) x[at] = then.x[at] + (now.x[at] - then.x[at]) * share;
    if (then.dir && now.dir) fighter.weapon.dir = unit(blend(then.dir, now.dir, share));
    if (then.offDir && now.offDir) fighter.offWeapon.dir = unit(blend(then.offDir, now.offDir, share));
  });
  (world.horses ?? []).forEach((horse, index) => {
    const then = before.horses?.[index];
    if (!then) return;
    kept.push({ horse, at: horse.at, yaw: horse.yaw, stride: horse.stride });
    horse.at = blend(then.at, horse.at, share);
    horse.yaw = then.yaw + Math.atan2(Math.sin(horse.yaw - then.yaw), Math.cos(horse.yaw - then.yaw)) * share;
    // The stride wraps round at 1: blended the short way.
    let stride = horse.stride - then.stride;
    stride -= Math.round(stride);
    horse.stride = (((then.stride + stride * share) % 1) + 1) % 1;
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
      if (entry.horse) {
        Object.assign(entry.horse, { at: entry.at, yaw: entry.yaw, stride: entry.stride });
      } else if (entry.fighter) {
        entry.fighter.x.set(entry.x);
        if (entry.dir && entry.fighter.weapon) entry.fighter.weapon.dir = entry.dir;
        if (entry.offDir && entry.fighter.offWeapon) entry.fighter.offWeapon.dir = entry.offDir;
      } else {
        entry.piece.x = entry.x;
        entry.piece.q = entry.q;
      }
    }
  };
}

// Third person (followcam.js): over his shoulder from behind, or locked on,
// on both men; following a smoothed anchor with critically damped springs.
// The player's drag of the view (touch.js: the top half, or the right
// button) is kept a while, then eased back.

/** The man the player has locked on, in play mode. */
const lockedTarget = () => (state.mode === 'play' && state.orders.lock !== null ? state.world.fighters[state.orders.lock] ?? null : null);

/** The follow camera, this frame: behind the man played, or on him and the man he is locked on. */
function followCamera(fighter, dt) {
  const orbit = scene.orbit;
  const locked = lockedTarget();
  const view = followCam.update({
    me: point(fighter.x, P.pelvis),
    facing: fighter.yaw,
    down: fighter.state !== 'up',
    foe: locked ? point(locked.x, P.pelvis) : null,
    moving: Boolean(fighter.walking || ((state.orders.stick || state.orders.keyStick || state.orders.runLock) && state.orders.lock === null)),
    aspect: scene.camera.aspect,
    from: { yaw: orbit.yaw, pitch: orbit.pitch, distance: orbit.distance, target: [orbit.target.x, orbit.target.y, orbit.target.z] },
  }, realSeconds(), dt);
  Object.assign(orbit, { yaw: view.yaw, pitch: view.pitch, distance: view.distance });
  orbit.target.set(...view.target);
  if (endingCam) endingCamera(dt);
}

/** The men as the watching camera sees them: where each stands, how high his neck is, and whether he is left lying. */
function watchMen(world) {
  return world.fighters.map((fighter) => ({
    id: fighter.id,
    x: fighter.x[P.pelvis * 3],
    y: fighter.x[P.neck * 3 + 1],
    z: fighter.x[P.pelvis * 3 + 2],
    up: fighter.state === 'up',
    gone: fighter.state === 'out' && (fighter.outFor ?? 0) > WORLD.goneSeconds,
  }));
}

/**
 * The camera when watching. Auto: the middle of everyone, a crowd drawn back to fit (a pair keeps the
 * zoom the viewer gave it). Free (the viewer zoomed or tapped a man): it stays where he put it and
 * follows the man he tapped, or the men near where it looks (watchcam.js).
 */
function watchCamera(world, middle, dt) {
  const spread = Math.max(0, ...world.fighters.map((fighter) => Math.hypot(fighter.x[24] - middle[0], fighter.x[26] - middle[2])));
  watchCam.spread = spread;
  const orbit = scene.orbit;
  if (watchCam.mode === 'free') {
    stepFree(watchCam, orbit, watchMen(world), dt);
    const { min, max } = zoomLimits(spread);
    orbit.distance = Math.max(min, Math.min(max, orbit.distance));
  } else if (world.fighters.length > 2 || world.horses?.length) {
    // A crowd needs a wider shot: back off with the spread of the fighters.
    const furthest = state.scenario ? SCENARIOS[state.scenario].camera?.maxDistance ?? Infinity : Infinity;
    orbit.distance += (Math.min(furthest, frameDistance(spread)) - orbit.distance) * 0.03;
    watchCam.reframing = false;
  } else stepReframe(watchCam, orbit, spread, dt);
}

// The camera's small bar: what the camera is doing, and 'Frame all' to go back to the whole field.
const cameraBar = $('#camera-bar');
let cameraNote = '';
function showCameraBar(watching) {
  const show = watching && state.mode !== 'play' && !state.viewQueue?.length && $('#builder').hidden && ['sandbox', 'quick', 'versus', 'level'].includes(state.game);
  cameraBar.hidden = !show;
  if (!show) return;
  const free = watchCam.mode === 'free';
  const man = free && watchCam.focus !== null ? state.world.fighters[watchCam.focus] : null;
  const note = man ? `Following ${shortName(man.body.inputs.name)}` : free ? 'Zoomed in' : 'Auto camera';
  if (note === cameraNote) return;
  cameraNote = note;
  cameraBar.dataset.mode = free ? 'free' : 'auto';
  $('#camera-note').textContent = note;
  $('#frame-all').hidden = !free;
}

// The points on a man the camera must see past the scenery to.
const WATCHED = [P.head, P.neck, P.pelvis, P.lFoot, P.rFoot];
// In a crowd, the men nearest what the camera looks at (at most this many).
const WATCHED_IN_CROWD = 3;

/**
 * What the camera is there to see: the man played and the man he is locked
 * on; one man against another, both; in a crowd, the point the camera looks
 * at and the men nearest it.
 */
function watchedPoints(world, followed) {
  const standing = world.fighters.filter((fighter) => !(fighter.state === 'out' && (fighter.outFor ?? 0) > WORLD.goneSeconds));
  let men;
  const points = [];
  if (followed) men = [followed, lockedTarget()].filter(Boolean);
  else if (standing.length <= 2) men = standing;
  else {
    const at = scene.orbit.target;
    points.push([at.x, at.y, at.z]);
    const off = (fighter) => Math.hypot(fighter.x[P.pelvis * 3] - at.x, fighter.x[P.pelvis * 3 + 2] - at.z);
    men = standing.slice().sort((a, b) => off(a) - off(b)).slice(0, WATCHED_IN_CROWD);
  }
  // The man the viewer follows is the one he is looking at.
  const looked = !followed && watchCam.mode === 'free' && watchCam.focus !== null ? world.fighters[watchCam.focus] : null;
  if (looked && !men.includes(looked)) men = [looked, ...men];
  for (const fighter of men) for (const particle of WATCHED) points.push(point(fighter.x, particle));
  return points;
}

function draw(dt, { render: drawIt = true } = {}) {
  const restore = blendWorld(state.world, state.before, state.paused ? 1 : state.accumulator / STEP);
  try {
    drawWorld(dt, drawIt);
  } finally {
    restore();
  }
}

/** The men a big battle always draws in full (see protectedMen): who the viewer plays, has locked on, or follows. */
function safeMen(world, followed) {
  const looked = !followed && watchCam.focus !== null ? world.fighters[watchCam.focus] : null;
  return protectedMen({ player: followed, lock: lockedTarget(), opponent: followed ? opponentFor(world, followed) : null, focus: looked, fighters: world.fighters });
}

function drawWorld(dt, drawIt = true) {
  const world = state.world;
  // The moment on screen: between the last two steps, as the bodies are drawn.
  const drawnTime = world.time - STEP + (state.paused ? STEP : state.accumulator);
  const pelvisMid = [0, 0, 0];
  for (const fighter of world.fighters) {
    pelvisMid[0] += fighter.x[24] / world.fighters.length;
    pelvisMid[2] += fighter.x[26] / world.fighters.length;
  }
  // A design sheet, and the intro, hold their own framing.
  const sheet = document.body.classList.contains('sheet') || state.game === 'intro';
  // Playing: the camera follows his man from behind (third person).
  const followed = state.mode === 'play' && !sheet ? player() : null;
  if (followed) followCamera(followed, dt);
  else if (!sheet) watchCamera(world, pelvisMid, dt);
  // A design sheet holds its own framing; so does a viewer who has taken the camera (it follows his man or men).
  // Never under the floor: the orbit rises over what it looks at instead (a drag down, a zoom out, a slope, a fall).
  placeCamera(scene, followed || sheet || watchCam.mode === 'free' ? null : pelvisMid, { ground: !sheet });
  // In a stage the walls and roofs between the camera and the man played let him through (a dithered fade: levelmode/kittex.js).
  if (world.stage && followed) ktSightline(scene.camera.position, [followed.x[P.neck * 3], followed.x[P.neck * 3 + 1], followed.x[P.neck * 3 + 2]], true);
  // The push-in is for the camera that frames the fight: the viewer's own zoom is left where he put it.
  if (followed || sheet || watchCam.mode === 'auto') dramaCamera(scene, state.drama, world, realSeconds());
  showCameraBar(!followed && !sheet);
  seeThrough.update(scene, document.body.classList.contains('sheet') ? [] : watchedPoints(world, followed), dt);
  // Crowd weapons, shields and banners are drawn as instanced batches, filled as the views update.
  beginCrowdBatches(scene);
  for (const view of state.horseViews ?? []) updateHorseView(view, world);
  selectCrowdDraw(scene, state.views, safeMen(world, followed), world.stage ? STAGE_CROWD_VIEW : CROWD_VIEW);
  if (world.stage && stageView) {
    updateStageView(stageView, world, scene.camera);
    // (The castle's shaders are built in the first frame, not as each is first wanted: levelmode/kit.js.)
    stageView.warm?.(() => render(scene));
  }
  if (world.stage) awarenessOverlay?.update(world, scene.camera);
  for (const view of state.views) {
    // A dormant man (his section of a stage is not active) is not drawn, and posed afresh when he wakes.
    if (view.fighter.dormant) {
      view.group.visible = false;
      view.stale = true;
      continue;
    }
    // Off screen (a crowd man the camera does not see): not posed or counted, and posed afresh the frame he is back.
    if (view.culled) {
      view.stale = true;
      continue;
    }
    view.group.visible = true;
    updateFighterView(view, dt * (state.paused ? 0 : state.speed), world.time);
    updateArms(scene, view, drawnTime);
    updateStumps(view);
  }
  updateProps(scene, state.views, world);
  updateDebris(scene, world);
  endCrowdBatches(scene);
  updateArrows(scene, world);
  updateNets(scene, world, dt * (state.paused ? 0 : state.speed));
  updateWhips(scene, world);
  updateBlood(scene, world, dt * (state.paused ? 0 : state.speed));
  updateShots(scene, dt * (state.paused ? 0 : state.speed));
  updateSpray(scene, dt * (state.paused ? 0 : state.speed));
  placeLockRing();
  placeChargeArrow();
  // The marks keep the fight's pace: slowed with it (a slow-motion moment, ¼×), still while it is paused.
  fightMarksClock += dt * (state.paused ? 0 : state.speed * timeScale(state.drama, realSeconds()));
  fightMarks.update(state.mode === 'play' ? world : null, fightMarksClock);
  if (drawIt) render(scene);
  updateIcons(state.drama, scene, world, canvas, realSeconds());
  renderHud();
  fightControls.update();
  levelHud.update();
  tutorial.update();
}

function consumeEvents() {
  const events = state.world.events;
  while (state.eventCursor < events.length) {
    const event = events[state.eventCursor];
    state.eventCursor += 1;
    if ((event.kind === 'landed' || event.kind === 'blocked') && event.target !== 'shield') showImpact(scene, state.views, event);
    if (event.weapon && (event.kind === 'landed' || event.kind === 'blocked')) woundBlood(scene, event);
    if (event.kind === 'horseHit' && event.cut + event.pierce > 1) woundBlood(scene, event);
    if (event.kind === 'clash' || event.kind === 'glance') spawnSparks(scene, event.point);
    if (event.kind === 'shot') spawnShot(scene, event);
    if (event.kind === 'arrow') (event.bounced ? spawnSparks(scene, event.point, 7) : woundBlood(scene, event));
    if (event.kind === 'bladeBlock') (event.cut > 1 ? woundBlood : (view, at) => spawnSparks(view, at.point, 18))(scene, event);
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
    // The sandbox shows each lead's fighting rating (roster.js: ∝ inferred K/D; Maximus is 100).
    const rating = state.game === 'sandbox' ? ratingOf(fighter.body.inputs) : null;
    card.querySelector('.name').textContent = rating ? `${fighter.body.inputs.name} · ⚔ ${rating}` : fighter.body.inputs.name;
    card.querySelector('.stamina i').style.width = `${Math.round(fighter.stamina * 100)}%`;
    const capacity = concussionCapacity(fighter);
    card.querySelector('.brain i').style.width = `${Math.min(100, Math.round((fighter.concussion / capacity) * 100))}%`;
    // Blood lost, against what puts him down: shown once he is bleeding.
    const blood = card.querySelector('.blood');
    blood.hidden = !(fighter.bloodLost > 0);
    blood.querySelector('i').style.width = `${Math.min(100, Math.round(((fighter.bloodLost ?? 0) / collapseAt()) * 100))}%`;
    card.querySelector('.kd').textContent = fighter.state === 'out' ? 'OUT' : fighter.state === 'down' ? 'DOWN' : fighter.panicked ? 'PANIC' : fighter.dazed > 0 ? 'DAZED' : fighter.stagger > 0 ? 'REELING' : `KD ${fighter.knockdowns}`;
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
  else if (event.kind === 'dazed') text = `💫 <b>${name(event.fighter)}</b> is dazed · <em>${event.effects.join(', ')}</em>`;
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
  else if (event.kind === 'drowned') text = `🌊 <b>${name(event.fighter)}</b> · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'disarmed' || event.kind === 'drew') text = `🗡️ <b>${name(event.fighter)}</b> · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'clash' || event.kind === 'glance' || event.kind === 'out' || event.kind === 'surge') return;
  else if (event.kind === 'parry') text = `⚔️ <b>${name(event.fighter)}</b> parries <b>${name(event.attacker)}</b>'s ${event.punch} · <em>${event.effects.join(', ')}${event.answering ? ', cutting as he does' : ''}</em>`;
  else if (event.kind === 'bladeBlock') text = `<b>${name(event.attacker)}</b> meets <b>${name(event.defender)}</b>'s ${event.punch ?? 'strike'} with the blade · <em>${event.effects.join(', ') || 'fended off'}</em>`;
  else if (event.kind === 'pickup') text = `🗡️ <b>${name(event.fighter)}</b> · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'styleSwitch') text = `<b>${name(event.fighter)}</b> switches to ${STYLES[event.style].label}`;
  else if (event.kind === 'pinning') text = `<b>${name(event.attacker)}</b> goes to hold <b>${name(event.defender)}</b> down`;
  else if (event.kind === 'held') text = `🤼 <b>${name(event.fighter)}</b> is held down`;
  else if (event.kind === 'pinBroken') text = `<b>${name(event.fighter)}</b> breaks the hold`;
  else if (event.kind === 'pinned') text = `🤼 <b>${name(event.fighter)}</b> held down · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'impact') text = `💥 <b>${name(event.fighter)}</b> · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'pain') text = `😣 <b>${name(event.fighter)}</b> · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'unhorsed') text = `🐎 <b>${name(event.fighter)}</b> · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'horseDown') text = `🐎 ${event.rider !== undefined ? `<b>${name(event.rider)}</b>'s horse` : 'A horse'} goes down · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'horseHit') text = `<b>${name(event.attacker)}</b> ${event.punch} → ${event.rider !== undefined ? `<b>${name(event.rider)}</b>'s horse` : 'a horse'} (${event.target}) · ${event.speed.toFixed(1)} m/s · ${event.energy.toFixed(0)} J${event.effects.length ? ` · <em>${event.effects.join(', ')}</em>` : ''}`;
  else if (event.kind === 'horseCrash') text = `🐎 ${event.rider !== undefined ? `<b>${name(event.rider)}</b>'s horse` : 'A horse'} · ${event.speed.toFixed(1)} m/s · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'trampled') text =`🐎 <b>${name(event.fighter)}</b> · <em>${event.effects.join(', ')}</em>`;
  else if (event.kind === 'crash') text = `💥 <b>${name(event.defender)}</b> crashed into${event.attacker === undefined ? '' : ` by <b>${name(event.attacker)}</b>`} (${event.target}) · ${event.speed.toFixed(1)} m/s · ${event.energy.toFixed(0)} J · ${(event.force / 1000).toFixed(1)} kN${event.effects.length ? ` · <em>${event.effects.join(', ')}</em>` : ''}`;
  else if (event.kind === 'collision') text = `<b>${name(event.attacker)}</b> charges in · ${event.speed.toFixed(1)} m/s · ${event.impulse.toFixed(0)} N·s of momentum`;
  // A strike's line needs its numbers; anything else without a line of its own is not logged.
  else if (event.attacker === undefined || event.speed === undefined || event.impulse === undefined || event.force === undefined || !event.effects) return;
  else {
    const where = event.kind === 'blocked' ? `blocked by ${event.target.replace(/^[lr]/, '').toLowerCase()}` : `→ ${event.target}`;
    const head = event.target === 'head' ? ` · head Δv <b>${event.headDeltaV.toFixed(2)}</b> m/s` : '';
    text = `<b>${name(event.attacker)}</b> ${event.punch} ${where} · ${event.speed.toFixed(1)} m/s · ${event.impulse.toFixed(1)} N·s · ${Math.round(event.force).toLocaleString()} N${head}`;
    if (event.effects.length) text += ` · <em>${event.effects.join(', ')}</em>`;
  }
  const row = document.createElement('li');
  row.innerHTML = text;
  if (['knockout', 'broken', 'severed', 'killed', 'bledOut', 'drowned', 'pinned'].includes(event.kind) || event.effects?.some((effect) => effect.startsWith('knockdown'))) row.className = 'big';
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
// ---- The look: a selector, ?look=, and what is remembered ---------------------

const lookSelect = $('#look');
lookSelect.append(...LOOKS.map((look) => Object.assign(new Option(look.placeholder ? `${look.label} (soft)` : look.label, look.id), { title: look.blurb })));
lookSelect.value = activeLook().id;
let lookQueue = Promise.resolve();

/**
 * Switch the whole game to another look: its scripts and scene setup are
 * loaded first (a failure leaves the toon look, with a warning), then the
 * place is lit again and every model rebuilt, a few a frame as at a level's
 * start (an army rebuilt at once stalls the page for seconds). Resolves when
 * the look is in force. Switches are taken in turn.
 */
function switchLook(id, { remember = false } = {}) {
  lookQueue = lookQueue.then(async () => {
    const look = (await loadLook(id, [scene])) ?? lookById(DEFAULT_LOOK_ID);
    activateLook(look);
    lookSelect.value = look.id;
    if (remember) rememberLook(look.id);
    reapplyPlace(scene);
    // The scenery's meshes may have been swapped (scenerylod.js): see-through finds its pieces anew.
    seeThrough.forget();
    // Templates keep the materials of the look they were built in.
    clearCrowdTemplates(scene);
    rebuildViews({ progressive: true });
    return look;
  });
  return lookQueue;
}
lookSelect.addEventListener('change', () => switchLook(lookSelect.value, { remember: true }));

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
$('#stand-still').addEventListener('change', (event) => {
  state.standStill = event.target.value;
});
/** The sandbox's Mounted button: everyone on the field who can ride rides, or all of them on foot (each fighter's own choice is in the builder). */
function refreshMountButton() {
  const button = $('#mounted');
  if (!button) return;
  const fighters = ['red', 'blue'].flatMap((corner) => state.rosters[corner]?.slice(0, state.teamSizes[corner]) ?? []);
  const riders = fighters.filter(canRide);
  const riding = riders.filter(isMounted).length;
  button.disabled = riders.length === 0;
  button.dataset.all = String(riders.length > 0 && riding === riders.length);
  button.textContent = riders.length > 0 && riding === riders.length ? '🐎 Dismount all' : '🐎 Mount all';
  button.title = riders.length
    ? `${riding} of the ${riders.length} who can ride are mounted. Each fighter's own Mounted choice is in Build fighters. A mounted fight is on the open field.`
    : 'Nobody here rides (knights, samurai, steppe, sultanates, Ming cavalry...)';
}
$('#mounted').addEventListener('click', () => {
  const on = $('#mounted').dataset.all !== 'true';
  for (const corner of ['red', 'blue']) mountAll(state.rosters[corner].slice(0, state.teamSizes[corner]), on);
  refreshBuilder();
  newBout();
});
$('#place').addEventListener('change', (event) => {
  state.place = event.target.value;
  newBout();
});
segmented('#modes', (mode, button) => {
  // Leaving play (or changing sides), the one he played fights with his guard up again.
  if (player()?.walking) setWalking(false);
  state.mode = mode;
  state.playSide = button.dataset.side ?? 'red';
  state.orders = newOrders();
  followCam.reset();
  watchCam = createWatchCam();
  cameraNote = '';
  fightKeys.clear();
  // Orders given while playing are taken back: his side goes its own way.
  clearOrders(state.world);
  fightControls.setActive(mode === 'play');
  document.body.classList.toggle('playing', mode === 'play');
});
$('#pause').addEventListener('click', () => {
  state.paused = !state.paused;
  $('#pause').textContent = state.paused ? 'Play' : 'Pause';
});
// Restart: the bout from the beginning, running (not left paused).
$('#restart').addEventListener('click', () => {
  // In a stage: from the last rest if one was reached (the button says so), else from the start.
  if (state.world.stage?.level) {
    restartStage();
    return;
  }
  newBout();
  state.paused = false;
  $('#pause').textContent = 'Pause';
});
$('#banner-again').addEventListener('click', () => (state.next ? state.next.run() : newBout()));
$('#banner-menu').addEventListener('click', () => goHome());
$('#banner-retry').addEventListener('click', newBout);
$('#open-menu').addEventListener('click', () => goHome());

// The sandbox's tools sit in a panel behind the Sandbox button at the top: a tap opens it, another (or Esc, or a tap outside, or the choice of Watch / Play / Build) closes it.
function setSandboxPanel(open) {
  document.body.classList.toggle('sandbox-open', open);
  $('#sandbox-menu').setAttribute('aria-expanded', String(open));
}
$('#sandbox-menu').addEventListener('click', () => setSandboxPanel(!document.body.classList.contains('sandbox-open')));
document.addEventListener('pointerdown', (press) => {
  if (document.body.classList.contains('sandbox-open') && !press.target.closest('#sandbox-panel, #sandbox-menu, .menu-popup')) setSandboxPanel(false);
});
window.addEventListener('keydown', (press) => { if (press.key === 'Escape') setSandboxPanel(false); });
$('#modes').addEventListener('click', () => setSandboxPanel(false));
$('#open-builder').addEventListener('click', () => setSandboxPanel(false));
// The sandbox's ghost walk: the Dunnottar stage, unseen by its garrison, to walk and look it over. He goes in as the
// sandbox's red lead; the ghost bar under the clock changes the pace (as the sandbox's speeds) and who he is, in place.
$('#ghost-walk').addEventListener('click', () => {
  setSandboxPanel(false);
  enterStage('dunnottar', { ghost: true, player: state.rosters.red[0] });
  boxer.finishBuilding();
  syncGhostBar();
});
// The stage's look (levelmode/stagelooks.js): a name in the ghost bar's Look select, `boxer.stageLook(name)`, or ?stagelook=; kept for next time.
const stageLookKey = 'boxer.stageLook';
const stageLookSelect = $('#ghost-look');
stageLookSelect.append(...stageLookNames().map((name) => new Option(STAGE_LOOKS[name].label, name)));
/** Change the stage's look now (whatever place is open: the choice is kept for the next time the stage opens); returns { look, looks }. */
function chooseStageLook(name, options) {
  const chosen = stormSetLook(name, options);
  if (name !== undefined) {
    try {
      localStorage.setItem(stageLookKey, chosen);
    } catch {
      // Nothing kept.
    }
  }
  stageView?.setEnvironment?.(stormEnvironment(scene.renderer));
  stageView?.bakeShadow?.(scene.renderer, STAGE_LOOKS[chosen]);
  document.body.style.setProperty('--stage-vignette', STAGE_LOOKS[chosen].vignette);
  stageLookSelect.value = chosen;
  return { look: chosen, looks: stageLookNames() };
}
stageLookSelect.addEventListener('change', () => {
  chooseStageLook(stageLookSelect.value);
  stageLookSelect.blur();
});
/** The look this visitor last chose (or the address's `?stagelook=`), else the default's. */
function rememberedStageLook() {
  const wanted = new URLSearchParams(location.search).get('stagelook');
  if (STAGE_LOOKS[wanted]) return wanted;
  try {
    const saved = localStorage.getItem(stageLookKey);
    if (STAGE_LOOKS[saved]) return saved;
  } catch {
    // Nothing kept.
  }
  return DEFAULT_STAGE_LOOK;
}
const ghostAs = $('#ghost-as');
ghostAs.append(
  Object.assign(document.createElement('optgroup'), { label: 'Dunnottar' }),
  Object.assign(document.createElement('optgroup'), { label: 'Everyone' }),
);
ghostAs.children[0].append(...Object.entries(LEVEL_PRESETS).map(([key, preset]) => new Option(preset.name, `level:${key}`)));
ghostAs.children[1].append(...Object.entries(PRESETS).map(([key, preset]) => new Option(preset.name, `preset:${key}`)));
ghostAs.addEventListener('change', () => ghostPlayAs(ghostAs.value));
for (const button of document.querySelectorAll('#ghost-bar [data-speed]')) {
  button.addEventListener('click', () => {
    $(`#speeds button[data-value="${button.dataset.speed}"]`)?.click();
    syncGhostBar();
  });
}

/** The ghost bar shows the pace now and who he is. */
function syncGhostBar() {
  for (const button of document.querySelectorAll('#ghost-bar [data-speed]')) button.classList.toggle('on', Number(button.dataset.speed) === state.speed);
  const name = state.world?.fighters[0]?.body.inputs.name;
  const match = [...ghostAs.options].find((option) => option.text === name);
  if (match) ghostAs.value = match.value;
}

/** In the ghost walk, he becomes someone else where he stands (made new, whole: a look at the stage as that man). */
function ghostPlayAs(choice) {
  const world = state.world;
  if (!world?.stage?.ghost) return;
  const [kind, key] = choice.split(':');
  const inputs = kind === 'level' ? levelPreset(key) : normaliseInputs(structuredClone(PRESETS[key]));
  const me = world.fighters[0];
  reviveFighter(world, me, inputs, { at: [me.x[P.pelvis * 3], feetFloor(me), me.x[P.pelvis * 3 + 2]], yaw: me.yaw });
  rebuildFighterView(0);
  state.stageOptions = { ...state.stageOptions, player: inputs };
  state.orders = newOrders();
  fightControls.reset();
  ghostAs.blur();
}
$('#open-menu').addEventListener('click', () => setSandboxPanel(false));

// The fighter the player controls: his side's lead (the side is chosen with the Play buttons).
const player = () => state.world.fighters.find((fighter) => fighter.corner === state.playSide) ?? state.world.fighters[0];
// Keys: punches on the right hand's home row, kicks and knees above and
// below, defences on the left hand.
// The movement keys (w a s d, the arrows) move him the way the camera looks;
// F does the special action; Tab locks on; Space held guards, tapped dodges.
const KEYS = {
  j: 'jab', k: 'cross', h: 'hook', u: 'uppercut', l: 'roundhouse', o: 'lowKick', i: 'teep', n: 'knee', m: 'elbow', ',': 'upElbow',
  c: 'clinch', r: 'rush', q: 'roll', e: 'parry', z: 'leanBack', x: 'check', b: 'body', y: 'rHook', g: 'collarTie',
};
// Orders to his side, in a battle (command.js): 7 To me, 8 Charge, 9 Hold, 0 Free (1–6 are the attack buttons).
const ORDER_KEYS = Object.fromEntries(COMMAND_ORDERS.map((entry) => [entry.key, entry.kind]));
// The movement keys held in the fight (not walk mode), and when Space went down.
const fightKeys = new Set();
let lastForward = { key: null, at: -Infinity };
let spaceDown = null;
const LABELS = {
  jab: 'Jab', cross: 'Cross', hook: 'Hook', uppercut: 'Upper', roundhouse: 'Kick', lowKick: 'Low kick', teep: 'Teep', knee: 'Knee',
  elbow: 'Elbow', upElbow: 'Up elbow', clinch: 'Clinch', rush: 'Charge', guard: 'Guard', slip: 'Slip', roll: 'Roll', parry: 'Parry',
  leanBack: 'Lean back', check: 'Check', stepBack: 'Step back', body: 'Body', shoot: 'Shoot', rHook: 'Rear hook', collarTie: 'Collar tie',
  clubR: 'Club', clubL: 'Left club', swipeR: 'Swipe', swipeL: 'Left swipe',
};

/** A move's name on a button: its own label, or its key in words ("hammerOverhead" → "Hammer overhead"). */
function moveLabel(name) {
  if (LABELS[name]) return LABELS[name];
  const words = name.replace(/([A-Z])/g, ' $1').toLowerCase();
  return words[0].toUpperCase() + words.slice(1);
}

function command(name) {
  // Any fighting move puts the guard back up.
  if (player()?.walking) setWalking(false);
  // A blow thrown from a key stops a run, as a tap on the attack does.
  breakRun(state.orders);
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

const typing = (target) => Boolean(target.closest?.('input, select, textarea, [contenteditable]'));
window.addEventListener('keydown', (press) => {
  if (state.mode !== 'play' || typing(press.target) || press.repeat) return;
  const key = press.key.toLowerCase();
  fightControls.setDevice('mouse');
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
  if (key === 'shift') state.walkRunning = true;
  // Shift+R locks the run (or lets it go); so does a second tap on forward within CONTROL.run.doubleTap. It then goes on with the keys let go.
  if (press.shiftKey && key === 'r') {
    press.preventDefault();
    askRunLock(state.orders);
    return;
  }
  if (MOVE_KEYS[key]) {
    press.preventDefault();
    if (MOVE_KEYS[key][0] > 0) {
      const now = realSeconds();
      if (lastForward.key === key && now - lastForward.at <= CONTROL.run.doubleTap) askRunLock(state.orders, true);
      lastForward = { key, at: now };
    }
    fightKeys.add(key);
  } else if (press.key === ' ') {
    // Held, the guard stays up; tapped, a dodge (as the Guard button).
    press.preventDefault();
    state.orders.guard = true;
    spaceDown = realSeconds();
  } else if (press.key === 'Tab') {
    press.preventDefault();
    fightControls.toggleLock();
  } else if (key === 'c') {
    // Down on his knees to crawl, or up again.
    playerCrawl(state.world, player(), !player().crawling);
  } else if (key === 'f') {
    // The special action, whatever it is now (the button's label).
    const action = contextAction(state.world, player());
    if (action) {
      (state.orders.actions ??= []).push(action);
      tutorial.signal('action', action);
    }
  } else if (ORDER_KEYS[key]) {
    press.preventDefault();
    orderSide(ORDER_KEYS[key]);
  } else if (KEYS[key]) {
    press.preventDefault();
    command(KEYS[key]);
  }
});
// Away from the window, every held key and button is let go.
window.addEventListener('blur', () => {
  walkHeld.clear();
  fightKeys.clear();
  state.walkRunning = false;
  if (state.mode === 'play' && player()) player().move = 0;
  state.orders.keyStick = null;
  state.orders.guard = false;
  spaceDown = null;
});
window.addEventListener('keyup', (press) => {
  const key = press.key.toLowerCase();
  walkHeld.delete(key);
  fightKeys.delete(key);
  if (key === 'shift') state.walkRunning = false;
  if (press.key === ' ') {
    state.orders.guard = false;
    if (spaceDown !== null && realSeconds() - spaceDown < TOUCH.guardTap) {
      (state.orders.evasions ??= []).push(1);
      tutorial.signal('evade');
    }
    spaceDown = null;
  }
});

// Orbit: drag to turn, wheel or pinch to zoom. Watching, a zoom or a tap on a
// man takes the camera (watchcam.js): it follows him; a double tap or 'Frame
// all' gives it back.
const canvas = $('#stage');
const pointers = new Map();
const tapper = createTapper();
/** Whether the viewer's gestures move the watching camera (not the follow camera, a design sheet or the intro). */
const viewerCamera = () => state.mode !== 'play' && state.game !== 'intro' && !document.body.classList.contains('sheet');
function zoomView(ratio) {
  if (viewerCamera()) zoomBy(watchCam, scene.orbit, ratio, watchCam.spread ?? 0);
  else scene.orbit.distance = Math.max(1.6, Math.min(12, scene.orbit.distance * ratio));
}
/** The man under a tap, if any: each man's head, pelvis and feet on the screen as a stick figure. */
function manAt(x, y) {
  const box = canvas.getBoundingClientRect();
  const projected = new THREE.Vector3();
  const onScreen = (fighter, particle) => {
    projected.set(fighter.x[particle * 3], fighter.x[particle * 3 + 1], fighter.x[particle * 3 + 2]).project(scene.camera);
    return [box.left + ((projected.x + 1) / 2) * box.width, box.top + ((1 - projected.y) / 2) * box.height, projected.z];
  };
  const shapes = [];
  for (const fighter of state.world.fighters) {
    if (fighter.state === 'out' && (fighter.outFor ?? 0) > WORLD.goneSeconds) continue;
    const points = [P.head, P.pelvis, P.lFoot, P.rFoot].map((particle) => onScreen(fighter, particle));
    if (points.some((point) => point[2] > 1)) continue;
    shapes.push({ id: fighter.id, depth: points[1][2], points: points.map(([px, py]) => [px, py]) });
  }
  return pickMan(shapes, x, y);
}
function tapView(tap) {
  if (!viewerCamera() || !state.world) return;
  if (tap.kind === 'double') return frameAll(watchCam);
  const id = manAt(tap.x, tap.y);
  if (id !== null) focusOn(watchCam, id);
  // A tap on nobody lets go of the man but keeps the zoom.
  else if (watchCam.mode === 'free') focusOn(watchCam, null);
}
canvas.addEventListener('pointerdown', (press) => {
  canvas.setPointerCapture(press.pointerId);
  pointers.set(press.pointerId, [press.clientX, press.clientY]);
  if (pointers.size === 1) tapper.press(press.clientX, press.clientY, realSeconds() * 1000);
  else tapper.cancel();
});
canvas.addEventListener('pointermove', (move) => {
  if (!pointers.has(move.pointerId)) return;
  const [x, y] = pointers.get(move.pointerId);
  if (pointers.size === 1) {
    tapper.move(move.clientX, move.clientY);
    scene.orbit.yaw -= (move.clientX - x) * 0.008;
    scene.orbit.pitch = Math.max(-0.05, Math.min(1.3, scene.orbit.pitch + (move.clientY - y) * 0.006));
  } else if (pointers.size === 2) {
    const [other] = [...pointers.entries()].filter(([id]) => id !== move.pointerId).map(([, position]) => position);
    const before = Math.hypot(x - other[0], y - other[1]);
    const after = Math.hypot(move.clientX - other[0], move.clientY - other[1]);
    zoomView(before / Math.max(1, after));
  }
  pointers.set(move.pointerId, [move.clientX, move.clientY]);
});
canvas.addEventListener('pointerup', (up) => {
  const alone = pointers.size === 1 && pointers.has(up.pointerId);
  pointers.delete(up.pointerId);
  const tap = alone ? tapper.release(up.clientX, up.clientY, realSeconds() * 1000) : null;
  if (tap) tapView(tap);
});
canvas.addEventListener('pointercancel', (up) => {
  pointers.delete(up.pointerId);
  tapper.cancel();
});
canvas.addEventListener('wheel', (wheel) => {
  wheel.preventDefault();
  // A trackpad's pinch arrives as a wheel with ctrl held, in small steps.
  zoomView(Math.exp(wheel.deltaY * (wheel.ctrlKey ? 0.015 : 0.002)));
}, { passive: false });
$('#frame-all').addEventListener('click', () => frameAll(watchCam));

// ---- Builder ----------------------------------------------------------------

const FIELDS = [
  { key: 'sex', label: 'Sex', type: 'select', options: ['male', 'female'] },
  { key: 'heightCm', label: 'Height', type: 'range', min: 150, max: 210, step: 1, unit: 'cm' },
  { key: 'frame', label: 'Frame', type: 'select', options: ['small', 'medium', 'large'] },
  { key: 'age', label: 'Age', type: 'range', min: 18, max: 100, step: 1, unit: 'yr' },
  { key: 'exercise', label: 'Exercise', type: 'range', min: 0, max: 1, step: 0.01, format: (value) => `${Math.round(exerciseHours(value))} h/wk` },
  // Body fat is not set but settles from what goes in and what is burnt; the
  // slider spans the intakes that settle between BMI 10 and BMI 100.
  { key: 'calories', label: 'Calories', type: 'range', step: 10, range: (inputs) => calorieRange(inputs, (FRAMES[inputs.frame] ?? FRAMES.medium).lean), format: (value) => `${Math.round(value).toLocaleString('en')} kcal` },
  // How precisely he places his blows, apart from his body (WORLD.skill).
  { key: 'skill', label: 'Skill', type: 'range', min: 0, max: 1, step: 0.05, format: (value) => `${Math.round((value ?? 0.5) * 100)}%` },
];
const HAIR_COLORS = { black: '#120d0a', 'dark brown': '#2a1a10', brown: '#6b4a2a', blond: '#c9a25e', red: '#8a3a1c', grey: '#8d8d8d' };
// The compact grid: the fighting style first, then the look.
const LOOK_FIELDS = [
  { key: 'style', label: 'Style', options: STYLE_KEYS, names: Object.fromEntries(STYLE_KEYS.map((key) => [key, STYLES[key].label])), onInputs: true },
  { key: 'skinTone', label: 'Skin', options: Object.keys(SKIN_TONES), names: { porcelain: 'porcelain', light: 'light', lightTan: 'light tan', medium: 'medium', tan: 'tan', deep: 'deep' } },
  { key: 'hairStyle', label: 'Hair', options: LOOK_OPTIONS.hairStyle, names: { cleanShort: 'clean short', midLong: 'mid-long', long: 'long', ringletPigtails: 'ringlet pigtails', ringlets: 'ringlets', ringletUpdo: 'ringlet updo', hime: 'hime cut (waist length)' } },
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
    key: 'kind', label: 'Outfit', options: PICKABLE_OUTFIT_KEYS, names: Object.fromEntries(PICKABLE_OUTFIT_KEYS.map((key) => [key, OUTFITS[key].label])),
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
  picker.replaceChildren(...state.rosters[corner].slice(0, size).map((fighter, index) => new Option(`${index + 1} · ${isMounted(fighter) ? '🐎 ' : ''}${fighter.name}${index === 0 ? ' (lead)' : ''}`, String(index))));
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
    // The slot keeps its choice to ride (if the new man's kit rides).
    if (current(corner).mounted) chosen.mounted = true;
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
  form.querySelector('.mount-check').addEventListener('change', (changed) => {
    current(corner).mounted = changed.target.checked;
    fillMemberPicker(corner);
    fillCornerForm(corner);
    refreshMountButton();
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
  // Mounted is each fighter's own, and only if his kit rides (levels have no horses).
  const rides = canRide(inputs);
  const mount = form.querySelector('.mount-check');
  form.querySelector('.mount-row').hidden = Boolean(state.scenario);
  mount.disabled = !rides;
  mount.checked = rides && Boolean(inputs.mounted);
  const horse = mountOf(inputs);
  form.querySelector('.mount-note').textContent = !rides ? 'his people did not ride' : mount.checked ? `${HORSES[horse.breed].label}${horse.barding === 'bare' ? '' : `, ${horse.barding} barding`}` : 'on foot';
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
    // Whether he rides: his own choice, written only where it is so.
    mounted: isMounted(inputs) ? true : undefined,
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
  // Each fighter's own Mounted; an older file's side-level one is given to the riders of that side.
  const teams = mountedTeams(file);
  state.rosters = { red: teams.red.map(fighter), blue: teams.blue.map(fighter) };
  if (state.scenario) state.levelRosters[state.scenario] = state.rosters;
  for (const corner of ['red', 'blue']) {
    state.teamSizes[corner] = Math.min(20, state.rosters[corner].length);
    state.editing[corner] = 0;
  }
  refreshBuilder();
  newBout();
  askSide();
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
  document.body.classList.remove('ghost-walk');
  if (state.game === 'sandbox' && game !== 'sandbox') state.sandbox = { rosters: state.rosters, teamSizes: { ...state.teamSizes }, place: state.place };
  if (game !== 'tutorial') {
    // Out of the yard, however he left it (finished, skipped, the menu): a next visit opens on the home screen.
    if (state.game === 'tutorial') markTutorialDone();
    tutorial.stop();
    delete document.body.dataset.tutorialStep;
  }
  state.game = game;
  state.next = next;
  $('#restart').textContent = 'Restart';
  $('#restart').title = '';
  document.body.dataset.game = game;
  $('#banner-again').textContent = next?.text ?? 'Next bout';
  // Retry the same bout, beside a next that is something else (a new opponent); a next that is itself a retry stands alone.
  $('#banner-retry').hidden = !next || Boolean(next.retry);
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
  if (game !== 'home') askSide();
}

// ---- Choosing a side ------------------------------------------------------------

/**
 * Which side the player takes, or to watch: asked once as a part of the game
 * is entered from the menus (kept for its rematches and next bouts), the
 * fight held still until it is answered.
 */
function askSide() {
  if (state.sideAsked) return;
  state.sideAsked = true;
  const pick = $('#side-pick');
  for (const corner of ['red', 'blue']) {
    const team = state.world.fighters.filter((fighter) => fighter.corner === corner);
    const lead = team[0]?.body.inputs;
    if (!lead) continue;
    const faction = FACTIONS[factionOf(lead)]?.label ?? '';
    pick.querySelector(`[data-side="${corner}"]`).innerHTML = `<em>Play as</em><b>${lead.name}</b><span>${[faction, team.length > 1 ? `${team.length} fighters` : STYLES[lead.style]?.label].filter(Boolean).join(' · ')}</span>`;
  }
  pick.hidden = false;
  state.paused = true;
}

$('#side-pick').addEventListener('click', (press) => {
  if (press.target.closest('.side-back')) {
    goHome();
    return;
  }
  const side = press.target.closest('button')?.dataset.side;
  if (!side) return;
  $('#side-pick').hidden = true;
  state.paused = false;
  $('#pause').textContent = 'Pause';
  // The footer's own buttons do the switching (hidden in a battle, there in the sandbox).
  const button = side === 'watch' ? $('#modes button[data-value="watch"]') : $(`#modes button[data-value="play"]${side === 'blue' ? '[data-side="blue"]' : ':not([data-side])'}`);
  button.click();
});

/** The fight behind the menus: two random gladiators in the Colosseum, one after another. */
function attract() {
  if (state.mode === 'play') $('#modes button[data-value="watch"]').click();
  // Back at the menus: the next part of the game entered asks for a side again.
  state.sideAsked = false;
  $('#side-pick').hidden = true;
  match({ red: [randomGladiator()], blue: [randomGladiator()], place: 'colosseum', game: 'home', next: { text: 'Next bout', run: attract } });
  Object.assign(scene.orbit, { distance: 4.6, pitch: 0.12 });
}

function enterLevel(key) {
  setGame('level', { text: 'Retry', retry: true, run: () => chooseLevel(key) });
  chooseLevel(key);
  askSide();
}

// ---- The tutorial: the training yard ----------------------------------------------
// The player with a katana, in the Colosseum's sand, against Sir Edric in
// full plate with a training staff: he stands still to be struck (his plate
// turns most cuts), and only at the guard step does he swing, every
// `TUTORIAL.swingEvery` s, stepping in if the player is out of reach.

const YARD = {
  place: 'colosseum',
  trainee: { ...PRESETS.ronin, style: 'katana', name: 'Trainee', skill: 0.5 },
  partner: { ...PRESETS.knight, style: 'staff' },
  // Where each stands at the start (x, z: m), facing the other.
  traineeAt: [-2.6, 0.6],
  partnerAt: [1.4, 0],
  // His swing: the staff's overhead blow at the head; he steps in from beyond `reach` m.
  swing: 'naginataCut',
  reach: 1.9,
};
const yard = { swinging: false, eventCursor: 0, lastAt: null, restart: false, disarm: false };

const yardPartner = () => state.world?.fighters.find((fighter) => fighter.corner === 'blue') ?? null;
const yardTrainee = () => state.world?.fighters.find((fighter) => fighter.corner === 'red') ?? null;

/** Both in their places, facing each other; what the yard watches, from now. */
function placeYard() {
  const [trainee, partner] = [yardTrainee(), yardPartner()];
  if (!trainee || !partner) return;
  placeFighter(trainee, ...YARD.traineeAt);
  placeFighter(partner, ...YARD.partnerAt);
  trainee.yaw = 0;
  partner.yaw = Math.PI;
  state.before = null;
  yard.eventCursor = 0;
  yard.lastAt = null;
  yard.restart = false;
  // Started again mid-lesson (a man out): the lock as it was.
  const step = tutorial.run?.step?.key;
  if (step && TUTORIAL_STEPS.findIndex((entry) => entry.key === step) > TUTORIAL_STEPS.findIndex((entry) => entry.key === 'lock') && step !== 'unlock') state.orders.lock = partner.id;
  if (step === 'pickUp') yardStage('disarm');
}

/** The partner, each step: at the guard step he closes in and swings; otherwise he stands. A man out starts the yard again. */
function yardStep(world, partner) {
  const trainee = yardTrainee();
  if (partner.state === 'out' || trainee.state === 'out') yard.restart = true;
  if (yard.disarm) {
    // His sword knocked to the sand at his feet; no sidearm drawn in its place: he must pick it up.
    yard.disarm = false;
    if (trainee.weapon?.held) {
      trainee.sidearmDrawn = true;
      dropWeapon(world, trainee, 'disarmed', [0, 0.3, 0.6]);
    }
  }
  if (!yard.swinging || partner.state !== 'up') {
    partner.move = 0;
    partner.goTo = null;
    return;
  }
  const apart = Math.hypot(trainee.x[P.pelvis * 3] - partner.x[P.pelvis * 3], trainee.x[P.pelvis * 3 + 2] - partner.x[P.pelvis * 3 + 2]);
  partner.focus = trainee.id;
  if (apart > YARD.reach) {
    partner.goTo = point(trainee.x, P.pelvis);
    partner.move = 0.7;
    return;
  }
  partner.move = 0;
  partner.goTo = null;
  if (!partner.punch && world.time >= (yard.swingAt ?? 0) && trainee.state === 'up') {
    throwPunch(world, partner, YARD.swing, 'head');
    yard.swingAt = world.time + TUTORIAL.swingEvery;
  }
}

/** What a step needs of the yard as it begins. */
function yardStage(what) {
  if (what.startsWith('step:')) {
    const key = what.slice(5);
    document.body.dataset.tutorialStep = key;
    yard.swinging = key === 'guard';
    yard.swingAt = (state.world?.time ?? 0) + 1;
  } else if (what === 'finished') {
    document.body.dataset.tutorialStep = 'finished';
    yard.swinging = false;
  } else if (what === 'disarm') yard.disarm = true;
}

/** What the tutorial sees of the yard, each frame. */
function observeYard() {
  const world = state.world;
  const trainee = yardTrainee();
  const partner = yardPartner();
  const at = point(trainee.x, P.pelvis);
  // Walked: his hips' way over the floor, not their sway (a step's worth a frame at most).
  const walked = yard.lastAt && trainee.state === 'up' ? Math.min(0.2, Math.hypot(at[0] - yard.lastAt[0], at[2] - yard.lastAt[2])) : 0;
  yard.lastAt = at;
  let blocked = 0;
  for (; yard.eventCursor < world.events.length; yard.eventCursor += 1) {
    const event = world.events[yard.eventCursor];
    // Met on his guard, his shield, or his blade (a limb on it, or blade on blade).
    if ((event.kind === 'blocked' && event.defender === trainee.id) || (event.kind === 'bladeBlock' && event.attacker === trainee.id) || (event.kind === 'clash' && event.fighter === trainee.id && event.other === undefined)) blocked += 1;
  }
  const apart = partner ? Math.hypot(partner.x[P.pelvis * 3] - at[0], partner.x[P.pelvis * 3 + 2] - at[2]) : Infinity;
  return { walked: walked > 0.004 ? walked : 0, near: apart < TUTORIAL.nearFrom, locked: state.orders.lock !== null, guarding: state.orders.guard, blocked, armed: Boolean(trainee.weapon?.held) };
}

/** Into the training yard: the player plays the trainee at once (no side to choose), the card on its first step. */
function enterTutorial() {
  state.sideAsked = true;
  $('#side-pick').hidden = true;
  match({ red: [YARD.trainee], blue: [YARD.partner], place: YARD.place, game: 'tutorial', next: { text: 'Again', retry: true, run: enterTutorial } });
  $('#modes button[data-value="play"]:not([data-side])').click();
  tutorial.start();
}

// ---- Level mode: stages -----------------------------------------------------------
// A stage (levelmode/stage.js) is a walkable world of sections; the player walks about in it, third
// person, with the sections around him awake. `boxer.levelMode(key)` opens one (STAGES).

let stageView = null;
// What goes with the stage's drawing: the markers on things to use, the prince's shards; the ending's camera (a push-in on the prince); and
// which run is on (a card that comes back after the stage was left, or begun again, is ignored).
let stageMarkers = null;
let stageShards = null;
let endingCam = null;
let stageRun = 0;
// A development overlay of what each man is doing (boxer.stage().overlay(true)).
let awarenessOverlay = null;

/**
 * Take a stage down when the screen goes to anything else (the menu, a battle, the sandbox): its cards, its drawing, its
 * markers; and the storm is let go (render.js setPlace does that when the place changes, so no rain or fog is left behind).
 */
function leaveStage() {
  if (!stageView && !stageMarkers) return;
  stageRun += 1;
  closeStory();
  levelHud.reset();
  stageMarkers?.dispose();
  stageShards?.dispose();
  stageMarkers = stageShards = null;
  endingCam = null;
  if (stageView) disposeStageView(stageView);
  stageView = null;
  awarenessOverlay?.show(false);
  cameraRoomTest.march = false;
}

/**
 * Open a stage in play mode: the player at its start (the operative, or `player`'s inputs: the ghost walk's choice). `ghost`:
 * the sandbox's ghost walk, unseen by the garrison. `opening`: the title card over the storm first (the menu's way in; the
 * world holds still behind it, and play begins when it is tapped away); a replay from the finale skips the lore.
 */
function enterStage(key, { opening = false, ghost = false, player = null } = {}) {
  const stage = STAGES[key];
  if (!stage) throw new Error(`no stage called ${key}`);
  leaveStage();
  const run = (stageRun += 1);
  setGame('level', { text: 'Retry', retry: true, run: () => enterStage(key, { ghost, player }) });
  state.stageOptions = { ghost, player };
  state.scenario = null;
  state.seed += 1;
  // The operative (a fixed preset), in his combat stance: the stick within the run threshold fights, past it runs (control.js).
  state.world = createLevelWorld(stage, player ? normaliseInputs(structuredClone(player)) : levelPreset('forger'), { seed: state.seed });
  // Ghost walk (the sandbox's debug for designing the stage): the garrison never notices him (levelmode/awareness.js).
  state.world.stage.ghost = ghost;
  document.body.classList.toggle('ghost-walk', ghost);
  clearGore(scene);
  // (A stage may be set in a place of its own: the storm of Dunnottar, levelmode/storm.js.)
  const place = stage.place ?? 'stage';
  setPlace(scene, place, PLACE_ARENAS[place]);
  if (stageView) disposeStageView(stageView);
  stageView = createStageView(stage);
  scene.places[place].add(stageView.group);
  placeStageSea(scene.places[place], stage);
  // Things drawn with the stage and kept up with its own update each frame.
  stageMarkers = createLevelMarkers(stageView.group);
  stageShards = stage.ending ? createShards(stageView.group) : null;
  stageView.extras = (world) => {
    stageMarkers?.update(world);
    stageShards?.update(world);
  };
  if (place === 'dunnottar') {
    stormReset(stage.weather?.seed);
    chooseStageLook(rememberedStageLook());
  }
  fightMarks.reset();
  fightMarks.warm();
  // The follow camera is held off the stage's walls and roofs (levelmode/kit.js).
  cameraWalls = stageCameraRoom(() => state.world.arena.terrain);
  cameraRoomTest.march = true;
  followCam.reset();
  Object.assign(scene.orbit, { yaw: Math.PI + 0.3, pitch: 0.25, distance: 5.2 });
  watchCam = createWatchCam();
  cameraNote = '';
  document.body.dataset.place = place;
  $('#place').closest('label').hidden = true;
  rebuildViews({ progressive: true });
  state.eventCursor = 0;
  state.finishedAt = null;
  resetDrama(state.drama);
  $('#log').replaceChildren();
  $('#banner').hidden = true;
  state.orders = newOrders();
  fightControls.reset();
  state.sideAsked = true;
  $('#side-pick').hidden = true;
  $('#modes button[data-value="play"]:not([data-side])').click();
  state.walkRunning = false;
  levelHud.reset();
  renderHud();
  if (opening) showOpening(() => { if (run === stageRun) followCam.reset(); }, stageStory(stage));
}

/** The footer's Restart in a stage: back to the last rest reached (his gear and items from then; what he opened stays open), else the stage from its start. */
function restartStage() {
  const world = state.world;
  const key = world.stage.def.id;
  if (!restartFromRest(world)) {
    enterStage(key, state.stageOptions);
    return;
  }
  closeStory();
  endingCam = null;
  for (const id of drainRebuilds(world)) rebuildFighterView(id);
  state.orders = newOrders();
  fightControls.reset();
  followCam.reset();
  state.paused = false;
  $('#pause').textContent = 'Pause';
}

/** The story's text for a stage (its card's title and lore): Stage 1's. */
const stageStory = () => STAGE_ONE;

/**
 * The ending (levelmode/ending.js has staged the cell): the player held, the cards over the scene, the camera pushing in on
 * the prince with each line, then the finale card: return to the menu, or play again from the start.
 */
function beginEnding(world) {
  const run = stageRun;
  const key = world.stage.def.id;
  state.orders = newOrders();
  fightControls.reset();
  endingCam = { k: 0, goal: 0 };
  // How far the push-in goes with each line (0: the player; 1: close on the prince, who is what the lines are about: a narrow phone screen frames him first).
  const beats = [0.45, 0.58, 0.68, 0.76, 0.83, 0.88, 0.92, 0.95];
  showEnding({
    civiliansHarmed: world.stage.civiliansHarmed,
    onLine: (index) => {
      if (run !== stageRun || !endingCam) return;
      // (An upright phone cannot hold the player and the prince in one picture: it goes to the prince at once.)
      endingCam.goal = Math.max(beats[Math.min(index, beats.length - 1)], scene.camera.aspect < 1 ? 0.85 : 0);
      // The storm begins to break: a last strike on the closing line.
      if (index === beats.length - 2) stormStrikeNow(false);
    },
  }, () => {
    if (run !== stageRun) return;
    endingDone(world);
    showFinale({ onMenu: () => goHome(), onAgain: () => enterStage(key) });
  });
}

/** The follow camera, pushed in toward the prince as the ending's lines come (a slow ease). */
function endingCamera(dt) {
  const prince = princeOf(state.world);
  if (!endingCam || !prince) return;
  const orbit = scene.orbit;
  endingCam.k += (endingCam.goal - endingCam.k) * (1 - Math.exp(-dt / 2.4));
  const k = endingCam.k;
  const head = [prince.x[P.head * 3], prince.x[P.head * 3 + 1] - 0.1, prince.x[P.head * 3 + 2]];
  orbit.target.set(orbit.target.x + (head[0] - orbit.target.x) * k, orbit.target.y + (head[1] - orbit.target.y) * k, orbit.target.z + (head[2] - orbit.target.z) * k);
  const wanted = Math.max(1.6, orbit.distance * (1 - 0.45 * k));
  orbit.pitch += (0.1 - orbit.pitch) * Math.min(1, k * 1.5);
  // Swung round to the side, so the player does not stand between the lens and the prince: to whichever side the cell's walls
  // leave room for (the first that gives most of the distance, else the one that gives the most).
  const swing = Math.min(1, k * 4);
  const reach = (yaw) => {
    for (let along = 1; along <= wanted; along += 0.25) {
      const flat = Math.cos(orbit.pitch) * along;
      if (!cameraRoomTest(orbit.target.x + Math.cos(yaw) * flat, orbit.target.z + Math.sin(yaw) * flat, orbit.target.y + Math.sin(orbit.pitch) * along)) return Math.max(1, along - 0.25);
    }
    return wanted;
  };
  let best = null;
  for (const turn of [0.95, -0.95, 0.5, -0.5, 0]) {
    const yaw = orbit.yaw + turn * swing;
    const distance = reach(yaw);
    if (!best || distance > best.distance) best = { yaw, distance };
    if (distance >= wanted * 0.85) break;
  }
  orbit.yaw = best.yaw;
  orbit.distance = best.distance;
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
    // Rewritten below as the look asks (flattenView): the baseline it is undone to is this size.
    portraitView.defaults.renderer.pixelRatio = 1;
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
  // Drawn plainly in the look's renderer settings and colours: its steel map must be in place before the fighter is built.
  flattenView(portraitView);
  const view = buildFighterView(portraitView, fighter);
  setLayer(view, 'skin');
  updateFighterView(view, 0, world.time);
  updateArms(portraitView, view, world.time);
  updateProps(portraitView, [view], world);
  Object.assign(portraitView.orbit, { distance: 2.35, pitch: 0.08, yaw: 0.15 });
  portraitView.orbit.target.set(0, 1.0, 0);
  placeCamera(portraitView, null);
  flattenView(portraitView);
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


// ---- The intro (intro.js): the legends, staged in the arena ---------------------
// One faction's legends at a time are simulated (standing in guard, no
// thinking) and drawn; those shown before are kept, still and hidden, for the
// line-up at the end, then freed.

// Room for the line-up's arc (the Colosseum's sand is 10.5 × 7 m).
const INTRO_ARENA = { halfX: 9.8, halfZ: 6.5 };
const introKept = [];
const introPoint = new THREE.Vector3();

const introStage = {
  /** Clear whatever was on (the fight behind the menu) for the empty arena. */
  begin() {
    if (state.mode === 'play') $('#modes button[data-value="watch"]').click();
    state.sideAsked = false;
    $('#side-pick').hidden = true;
    for (const id of ['home', 'quick', 'levels-screen', 'stages-screen', 'versus', 'wizard']) $(`#${id}`).hidden = true;
    setGame('intro');
    state.scenario = null;
    for (const view of state.views) disposeFighterView(scene, view);
    state.views = [];
    state.viewQueue = [];
    state.world = createWorld([], { seed: 3, arena: INTRO_ARENA });
    state.before = null;
    clearGore(scene);
    setPlace(scene, 'colosseum', PLACE_ARENAS.colosseum);
    document.body.dataset.place = 'colosseum';
    state.paused = true;
    state.finishedAt = null;
    state.eventCursor = 0;
    resetDrama(state.drama);
    $('#banner').hidden = true;
    $('#log').replaceChildren();
  },
  /** These legends ({ inputs, x, z, yaw }) in their places, in guard, breathing; the last lot kept, still and hidden. */
  place(legends) {
    for (const view of state.views) {
      view.group.visible = false;
      introKept.push({ view, time: state.world.time });
    }
    state.world = createWorld(legends.map((legend) => ({ inputs: normaliseInputs(structuredClone(legend.inputs)), corner: 'red' })), { seed: 3, arena: INTRO_ARENA });
    state.world.fighters.forEach((fighter, index) => {
      placeFighter(fighter, legends[index].x, legends[index].z);
      fighter.yaw = legends[index].yaw;
    });
    advance(state.world, 0.6, null, STEP);
    state.before = null;
    state.eventCursor = state.world.events.length;
    state.views = state.world.fighters.map((fighter) => {
      const view = buildFighterView(scene, fighter);
      setLayer(view, state.layer);
      return view;
    });
    state.paused = false;
  },
  /** Everyone at once, still. */
  lineup() {
    state.paused = true;
    // Drawn again where they stand: a hidden view is not posed.
    for (const { view, time } of introKept) {
      view.group.visible = true;
      updateFighterView(view, 0, time);
      updateArms(scene, view, time);
    }
  },
  camera({ target, yaw, pitch, distance }) {
    Object.assign(scene.orbit, { yaw, pitch, distance });
    scene.orbit.target.set(...target);
    placeCamera(scene, null);
  },
  /**
   * The nearest distance from which all these points fall within `bounds`
   * (of the screen, −1 to 1), the target raised or lowered so they sit in
   * the middle of them: { distance, target }.
   */
  fit(points, { target, yaw, pitch, bounds }) {
    const project = (at) => introPoint.set(...at).project(scene.camera);
    const aim = [...target];
    let distance = 10;
    for (let round = 0; round < 3; round += 1) {
      let near = 0.5;
      // Within the camera's far plane (60 m), or everything is "outside".
      let far = 45;
      for (let pass = 0; pass < 22; pass += 1) {
        distance = (near + far) / 2;
        introStage.camera({ target: aim, yaw, pitch, distance });
        scene.camera.updateMatrixWorld();
        const inside = points.every((at) => {
          project(at);
          return introPoint.z < 1 && introPoint.x >= bounds.left && introPoint.x <= bounds.right && introPoint.y >= bounds.bottom && introPoint.y <= bounds.top;
        });
        if (inside) far = distance;
        else near = distance;
      }
      distance = far;
      introStage.camera({ target: aim, yaw, pitch, distance });
      scene.camera.updateMatrixWorld();
      const heights = points.map((at) => project(at).y);
      const off = (bounds.top + bounds.bottom) / 2 - (Math.max(...heights) + Math.min(...heights)) / 2;
      // Up the screen by `off` is down the world by about this much at this distance.
      aim[1] -= off * distance * Math.tan(THREE.MathUtils.degToRad(scene.camera.fov / 2));
    }
    return { distance, target: aim };
  },
  /** Free everything the intro built. */
  end() {
    for (const { view } of introKept) disposeFighterView(scene, view);
    introKept.length = 0;
  },
};

// ---- Start -------------------------------------------------------------------

function fit() {
  const box = canvas.getBoundingClientRect();
  resize(scene, box.width, box.height);
  // The pad and log sit just above the controls, however many rows they wrap to.
  document.documentElement.style.setProperty('--controls-height', `${$('.controls').getBoundingClientRect().height}px`);
}
window.addEventListener('resize', fit);
// The footer wraps to more rows in some modes (the sandbox's): what sits above it follows.
new ResizeObserver(fit).observe($('.controls'));
buildCornerForm('red');
buildCornerForm('blue');
tutorial = installTutorial($('#fight-ui'), {
  now: realSeconds,
  stage: yardStage,
  observe: observeYard,
  exit: () => goHome(),
  again: () => enterTutorial(),
});
tutorial.setDevice(fightControls.device);
const menus = installMenus({
  intro: (then) => playIntro(introStage, then), attract, match, sandbox: enterSandbox, level: enterLevel, tutorial: enterTutorial, preview, portrait,
  // Level Mode: a stage from its card (levelmode/stages.js): its men built at once, the title card over the storm, the world held still behind it.
  onStage: (key) => { enterStage(key, { opening: true }); boxer.finishBuilding(); },
  stats: (inputs) => deriveStats(buildBody(normaliseInputs(structuredClone(inputs)))),
  calorieRange: (inputs) => calorieRange(inputs, (FRAMES[inputs.frame] ?? FRAMES.medium).lean),
  hours: exerciseHours,
  onMenu: (home) => { goHome = home; },
});
fit();
// The first visit opens straight in the training yard (Skip tutorial in its corner goes to the menu); after, the menu.
// The intro is kept for the home screen's "Watch the intro": half a minute is too long before the first fight.
if (tutorialWanted()) enterTutorial();
else menus.home();
requestAnimationFrame(frame);
// A look that needs its scripts loaded or its scene prepared (or one not found: it warns and stays toon) comes now, over the first bout.
if (activeLook().id !== startingLookId) switchLook(startingLookId);

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
  const build = ({ preset = 'contender', ...inputs }) => ({ ...structuredClone(PRESETS[preset] ?? LEVEL_PRESETS[preset]), ...inputs });
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

// The looks harness (looksbench.js): staged still-lifes, shots and timings, for comparing looks.
installLooksBench({
  state,
  scene,
  looks: { list: lookList, current: () => activeLook().id, set: switchLook },
  setGame,
  forgetPlaces: () => forgetPlaces(scene),
  chooseLevel,
  fight,
  // The first visit's intro is over the scene until skipped.
  introPlaying,
  skipIntro,
  finishBuilding: () => boxer.finishBuilding(),
  // Exact frames of `dt` s: the world stepped without the time budget, the views updated, nothing drawn.
  exactFrames: (count, dt) => {
    for (let index = 0; index < count; index += 1) {
      tick(dt, { budget: Infinity });
      draw(dt, { render: false });
    }
  },
  draw,
  render: () => render(scene),
  resize: (width, height) => resize(scene, width, height),
  fit,
});

// Test hook: step the world by seconds without the frame clock.
const boxer = window.boxer = {
  state,
  scene,
  // The intro: end it now (true if it was playing), as Skip does; or play it again.
  skipIntro,
  playIntro: () => playIntro(introStage, () => goHome()),
  // Cheaper scenery (scenerylod.js) on or off, to compare in the same page; no argument: whether it is on. `sceneryLodStats` says what was swapped in the place shown.
  sceneryLod: (on) => {
    if (on !== undefined) {
      setSceneryLod(scene, on);
      seeThrough.forget();
    }
    return sceneryLodOn();
  },
  sceneryLodStats: () => sceneryLodStats(scene),
  // Adaptive resolution (adaptres.js): on or off (off: the full pixel ratio, kept), and what it is doing now; no argument: just that.
  adaptiveResolution: (on) => {
    if (on !== undefined) resolution.set(on, scene);
    return resolution.info(scene);
  },
  introPlaying,
  // Move the intro on (its own clock, s) without frames; the shot it is on, null once over.
  introStep: stepIntro,
  designSheet,
  // What the scenery see-through has faded now ([{ name, opacity, box }]); refresh() tests again at the next frame.
  seeThrough,
  // The watching camera's state ({ mode: 'auto' | 'free', focus }) and its two verbs, as a tap and 'Frame all' do them.
  watchCam: () => watchCam,
  // The man under a point on the screen (what a tap picks), or null.
  manAt,
  focusOn: (id) => focusOn(watchCam, id),
  frameAll: () => frameAll(watchCam),
  presets: PRESETS,
  fight,
  // Open a level (its key in SCENARIOS), as its menu button does; null for the sandbox.
  level: chooseLevel,
  // Level mode: open a stage (a key of STAGES, levelmode/stages.js) in play mode, walking; returns the sections active at its start.
  levelMode: (key = 'testyard', options = {}) => {
    menus.close();
    enterStage(key, options);
    boxer.finishBuilding();
    return state.world.stage.active;
  },
  // The look of the Dunnottar stage (levelmode/stagelooks.js): `stageLook()` says which (and the names); `stageLook(name)` changes it now; `stageLook(undefined, { still: true })` stops the lightning.
  stageLook: (name, options) => (name === undefined && !options ? { look: stormLook(), looks: stageLookNames() } : chooseStageLook(name, options)),
  // The stage now: its world's `stage` (def, active sections, mechanism states), and the verbs: put a gate or ladder in a state, pull a lever.
  // The player's systems in the stage (levelmode/level.js): the run, what the button offers, and the verbs (for the console and tests).
  // (Named levelRun: `level` above opens a Battle Mode level, and a second `level:` key would shadow it.)
  levelRun: () => {
    const world = state.world;
    return {
      run: world.stage?.level ?? null, world,
      context: () => contextFor(world), near: () => interactions(world).map((entry) => `${entry.id}:${entry.distance.toFixed(2)}`),
      act: () => interact(world), use: (kind) => useItem(world, kind), rest: () => restAtPoint(world, world.stage.def.sections.find((section) => section.rest).rest),
      // Stand the player at a place of the stage ([x, y, z]), facing yaw.
      put: (at, yaw = 0) => { placeOnFloor(world.fighters[0], at[0], at[2], at[1], yaw); return true; },
      // The boss struck down by hand (the ending follows: his door opens, the cell scene when the player is near the prince).
      killBoss: () => killBoss(world),
      hurt: (amount = 0.05) => { const me = world.fighters[0]; me.bleed = (me.bleed ?? 0) + amount; me.bleedOutside = (me.bleedOutside ?? 0) + amount; return me.bleed; },
    };
  },
  // `awareness()`: what each man is doing (idle, patrol, aggro, search, return, flee, cower, follow, stayed); `free(id)`: a prisoner (spawn id) becomes an ally who follows; `gather()`: the followers to the player's side; `overlay(on)`: a letter over each head.
  stage: () => ({
    run: state.world.stage ?? null, set: (id, to) => setMechanism(state.world, id, to), pull: (id) => pullLever(state.world, id), view: stageView,
    awareness: () => awarenessReport(state.world),
    free: (id) => freePrisoner(state.world, id),
    gather: () => gatherFollowers(state.world),
    overlay: (on = true) => {
      awarenessOverlay ??= createAwarenessOverlay(scene.renderer.domElement);
      awarenessOverlay.show(on);
      return on;
    },
  }),
  // The training yard, as the Levels menu opens it (any menu screen closed); its run (step, progress).
  tutorial: () => {
    menus.close();
    enterTutorial();
  },
  tutorialRun: () => tutorial.run,
  // Whether this visitor has been through the yard; forget it (the next load opens in the yard again).
  tutorialDone,
  forgetTutorial: () => {
    forgetTutorial();
    try {
      localStorage.removeItem(TUTORIAL.storageKey);
    } catch {
      // Nothing kept to forget.
    }
  },
  // Dev tool: every control on the screen now, judged for size, place and whether anything covers it (uicheck.js).
  checkButtons,
  preview,
  // The fight's attack controls: 'target' (tap his man himself, the default) or 'buttons' (fightui/index.js); remembered.
  fightUi: (id) => fightUiChoose(id),
  fightMarks,
  throw: (move, zone, who = 0) => throwPunch(state.world, state.world.fighters[who], move, zone),
  // Knock a fighter's weapon out of his hand, sideways.
  disarm: (who = 0) => dropWeapon(state.world, state.world.fighters[who], 'disarmed', [0, 1.2, 2.2]),
  // Send a fighter crawling away, as a badly hurt man in a panic does.
  crawl: (who = 0) => startCrawl(state.world, state.world.fighters[who], 'crawls away'),
  // Crowd drawing by distance (far bodies, off-screen men left out, fewer shadows) on or off, to compare the two in one page; returns whether it is on.
  lod: (on) => {
    if (on !== undefined) crowdLod.enabled = Boolean(on);
    return crowdLod.enabled;
  },
  // Play `count` real frames of `dt` s each, as the page's own loop would (tests, profiling).
  playFrames: (count, dt = 1 / 60) => {
    for (let index = 0; index < count; index += 1) {
      buildQueuedViews();
      if (!state.paused && !state.viewQueue?.length) tick(dt * state.speed * timeScale(state.drama, realSeconds()));
      draw(dt);
    }
  },
  // Profiling: a level entered as its menu button does, watched (or played as `side`), its armies built.
  enterLevel: (key, side = 'watch') => {
    menus.close();
    enterLevel(key);
    if (!$('#side-pick').hidden) $(`#side-pick [data-side="${side}"]`).click();
    boxer.finishBuilding();
  },
  // Profiling: `frames` frames of 1/60 s, each timed in its three parts (ms, averaged): the
  // simulation (no time budget), the views updated, and the picture drawn (waited for on the GPU).
  bench: (frames = 60) => {
    const gl = scene.renderer.getContext();
    const pixel = new Uint8Array(4);
    const finish = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const totals = { physics: 0, views: 0, render: 0 };
    finish();
    for (let index = 0; index < frames; index += 1) {
      const started = performance.now();
      tick(STEP, { budget: Infinity });
      const stepped = performance.now();
      draw(STEP, { render: false });
      const updated = performance.now();
      render(scene);
      finish();
      totals.physics += stepped - started;
      totals.views += updated - stepped;
      totals.render += performance.now() - updated;
    }
    const average = (value) => Math.round((value / frames) * 100) / 100;
    const info = scene.renderer.info.render;
    return { physics: average(totals.physics), views: average(totals.views), render: average(totals.render), frame: average(totals.physics + totals.views + totals.render), calls: info.calls, triangles: info.triangles, fighters: state.world.fighters.length, down: state.world.fighters.filter((fighter) => fighter.state !== 'up').length, time: Math.round(state.world.time * 10) / 10 };
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
  // Profiling: a level entered as its menu button does, watched (or played as `side`), its armies built.
  enterLevel: (key, side = 'watch') => {
    menus.close();
    enterLevel(key);
    if (!$('#side-pick').hidden) $(`#side-pick [data-side="${side}"]`).click();
    boxer.finishBuilding();
  },
  // Profiling: `frames` frames of 1/60 s, each timed in its three parts (ms, averaged): the
  // simulation (no time budget), the views updated, and the picture drawn (waited for on the GPU).
  bench: (frames = 60) => {
    const gl = scene.renderer.getContext();
    const pixel = new Uint8Array(4);
    const finish = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const totals = { physics: 0, views: 0, render: 0 };
    finish();
    for (let index = 0; index < frames; index += 1) {
      const started = performance.now();
      tick(STEP, { budget: Infinity });
      const stepped = performance.now();
      draw(STEP, { render: false });
      const updated = performance.now();
      render(scene);
      finish();
      totals.physics += stepped - started;
      totals.views += updated - stepped;
      totals.render += performance.now() - updated;
    }
    const average = (value) => Math.round((value / frames) * 100) / 100;
    const info = scene.renderer.info.render;
    return { physics: average(totals.physics), views: average(totals.views), render: average(totals.render), frame: average(totals.physics + totals.views + totals.render), calls: info.calls, triangles: info.triangles, fighters: state.world.fighters.length, down: state.world.fighters.filter((fighter) => fighter.state !== 'up').length, time: Math.round(state.world.time * 10) / 10 };
  },
  // Blood (tests, shots): throw `count` drops from a point; let the blood alone run on `seconds` (drops fall, stains, clouds in water).
  blood: {
    spawn: (at, direction = [0, 1, 0], count = 20, speed = 1.5) => spawnBlood(scene, at, direction, count, speed),
    step: (seconds, dt = 1 / 60) => {
      for (let left = seconds; left > 1e-9; left -= dt) updateBlood(scene, state.world, Math.min(dt, left));
    },
    clouds: () => scene.blood?.dye.clouds ?? [],
  },
  // Shots and sparks (tests, shots): fire a shot event ({ from, to, weapon, attacker }); throw sparks at a point; let them run on `seconds`.
  fx: {
    shot: (event) => spawnShot(scene, { attacker: 0, time: state.world.time, point: event.to, normal: [0, 0, 1], harm: 0, ...event }),
    sparks: (at, count) => spawnSparks(scene, at, count),
    step: (seconds, dt = 1 / 60) => {
      for (let left = seconds; left > 1e-9; left -= dt) {
        updateShots(scene, Math.min(dt, left));
        updateBlood(scene, state.world, Math.min(dt, left));
      }
    },
  },
};
