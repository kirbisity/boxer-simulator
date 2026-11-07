// The custom build (`node tools/bundle.js --custom` → dist/gladiator-custom.html): a test bed that is only the sandbox (custom
// mode: the fighter builder and its fights), opened at once, in one file under 15 MB. The fights are the same code as the full
// game's (physics, AI, weapons, outfits, fire, sound effects, the builder's roster and presets); what custom mode never reaches is
// left out: level mode (the Dunnottar stages, their kit, the storm and its sky photographs, the story, cutscenes and HUD), story mode, Last
// Stand Squad (and its squad builder), the intro, the tutorial, the home screen and its other modes, and the music (its cues
// gone, the engine plays its stings instead, as with a cue that is missing).
//
// An excluded module that kept code imports is replaced by a stub here declaring just what is imported: inert where the kept
// code calls it on every path (always behind a level, Last Stand Squad or intro test, so a fight never sees a difference), throwing
// where it would open a part of the game that is not here. tools/bundle.js refuses a build in which a kept module imports a
// name an excluded module's stub does not declare.

/** Modules left out (each one's stub, if kept code imports it, is in STUBS). */
export const CUSTOM_EXCLUDED = (name) => /^levelmode\//.test(name) && !CUSTOM_KEPT_LEVEL.includes(name)
  || /^audio\/music\/data\//.test(name)
  // (Story mode's ground, its walls and ladders, is kept: worksview.js draws ladders on any battle's works.)
  || /^story\/(?!ground\/)/.test(name)
  || ['lastgate', 'lastgateview', 'squad', 'intro', 'tutorial', 'menu', 'battlethumbs', 'custombattleview'].includes(name);
// Level mode's modules that the fights use too: the picture quality, water to wade in (and its config, its drawing in a battle's
// field works), and the level's characters (offered among the builder's presets).
const CUSTOM_KEPT_LEVEL = ['levelmode/quality', 'levelmode/config', 'levelmode/water', 'levelmode/kitwater', 'levelmode/presets'];

/** The most a custom page may weigh (bytes, the page itself: nothing goes beside it). */
export const CUSTOM_BUDGET = 15_000_000;

// The grounds' baked tiles (detailmaps-data, 0.4 to 2.4 MB each) kept, for the sandbox's own places (the Colosseum's sand, the port's
// concrete, the shore's beach, the earth of the green, the field and Sengoku); the rest (the grass, the town's cobbles,
// the plain's dry grass and gravel) drawn painted as with the maps off. Chosen to leave about 1 MB of the budget for the game to grow
// into; every other baked picture (the armour's, the cloth atlas, the helmets', the sky photograph, the photo faces) is kept whole.
export const CUSTOM_GROUND_TILES = ['sand', 'concrete', 'beach', 'earth'];

/** Data modules cut down (as tools/bundle.js LITE does), by module: its one exported const → what is kept. */
export const CUSTOM_DATA = {
  'detailmaps-data': (data) => Object.fromEntries(Object.entries(data).filter(([name, tile]) => tile.kind !== 'ground' || CUSTOM_GROUND_TILES.includes(name))),
};

/** Source rewritten, by module. */
export const CUSTOM_TRANSFORMS = {
  // No music: no cues (and none of their data imported). The player finds no cue and stays silent; victory and defeat get the engine's stings.
  'audio/music/manifest': (source) => {
    const cues = /^export const MUSIC_CUES = \{\n[\s\S]*?\n\};\n/m;
    if (!cues.test(source)) throw new Error('src/audio/music/manifest.js: no MUSIC_CUES block to empty');
    return source.replace(/^import \{ MUSIC_DATA_\w+ \} from '\.\/data\/\w+\.js';\n/gm, '').replace(cues, '// (Custom build: no music; tools/custom.js.)\nexport const MUSIC_CUES = {};\n');
  },
};

/** The page's own extra style: the sandbox's ways into level mode hidden (they lead to what is not here). */
export const CUSTOM_CSS = '\n/* Custom build (tools/custom.js): no level mode. */\n#level-character, #ghost-walk, #real-walk { display: none !important; }\n';

const missing = (what) => `() => { throw new Error('${what}: not in the custom build (tools/custom.js)'); }`;

/** Stand-ins for the excluded modules that kept code imports, by module (ES module source, as a module file would be). */
export const CUSTOM_STUBS = {
  // Story mode (src/story/): not here; the page's hooks into it inert.
  'story/storyview': `
export function installStory() {
  return { open() { throw new Error('story mode: not in the custom build (tools/custom.js)'); }, tick() {}, think() {}, steer() {}, close() {}, leave() {}, holding: () => false, held: () => [], pace: () => 1, filming: false, active: false, hooks: {} };
}
`,
  // The home screen: there is none; "the menu" is the sandbox (entered at once, and kept as it is from inside it).
  menu: `
export function installMenus(game) {
  const close = () => { document.body.dataset.overlay = ''; };
  const home = () => {
    close();
    if (document.body.dataset.game !== 'sandbox') game.sandbox();
  };
  game.onMenu(home);
  return { home, close, lastGate: home, levels: home, stages: home, versus: home, quickEvent: home };
}
`,
  intro: `
export const introPlaying = () => false;
export const skipIntro = () => {};
export const stepIntro = () => false;
export const playIntro = ${missing('the intro')};
`,
  tutorial: `
export const TUTORIAL = { swingEvery: 2, nearFrom: 1.6, storageKey: 'gladiator.tutorialDone' };
export const TUTORIAL_STEPS = [];
export const tutorialDone = () => true;
export const tutorialWanted = () => false;
export const markTutorialDone = () => {};
export const forgetTutorial = () => {};
export function installTutorial() {
  return { start() { throw new Error('the tutorial: not in the custom build (tools/custom.js)'); }, stop() {}, update() {}, signal() {}, setDevice() {}, run: null, active: false };
}
`,
  lastgate: `
export const LAST_GATE = { title: 'Last Stand Squad', place: 'lastgate', arena: { halfX: 18, halfZ: 10.5 }, gate: { x: 0 }, puddles: [] };
export const createLastGate = ${missing('Last Stand Squad')};
export const createLastGateBoard = () => ({ add: () => null, list: () => [], best: () => null });
export const drainLastGate = () => ({ rebuilds: [], news: [] });
export const lastGateResult = () => null;
export const stepLastGate = () => {};
`,
  lastgateview: `
export const createLastGateView = () => ({ start() {}, update() {}, news() {}, end() {}, hide() {} });
`,
  'levelmode/awareness': `
export const awarenessReport = () => null;
export const freePrisoner = () => false;
export const gatherFollowers = () => 0;
`,
  'levelmode/awarenessview': `
export const createAwarenessOverlay = () => ({ show() {}, update() {}, dispose() {} });
`,
  'levelmode/checkpoints': `
export const snapshotGear = () => null;
`,
  'levelmode/cutsceneview': `
export const createCutsceneDirector = () => ({ start() {}, frame() {}, steer() {}, jolt() {}, speed: () => 1, cancel() {}, skip() {}, active: false, state: null });
export const createTwistDirector = () => ({ frame() {}, steer() {}, say() {}, cancel() {}, active: false });
`,
  'levelmode/endingview': `
export const createGuide = ${missing('level mode')};
`,
  'levelmode/hud': `
export const installLevelHud = () => ({ update() {}, reset() {}, toast() {} });
`,
  'levelmode/items': `
export const feetFloor = () => 0;
export const holdPlayer = () => {};
`,
  'levelmode/kit': `
export const stageCameraRoom = ${missing('level mode')};
`,
  'levelmode/level': `
export const attemptCount = () => 0;
export const attemptLog = () => [];
export const attemptStory = () => null;
export const bossFightOn = () => false;
export const contextFor = () => null;
export const createLevelWorld = ${missing('level mode')};
export const drainRebuilds = () => [];
export const drainUi = () => [];
export const dropDown = () => false;
export const endingDone = () => {};
export const endingOf = () => null;
export const interact = () => false;
export const interactions = () => [];
export const killBoss = () => false;
export const killNoname = () => false;
export const levelBusy = () => false;
export const levelOpponent = (world, me) => opponentFor(world, me);
export const levelThink = () => {};
export const respawnPlayer = () => {};
export const restAtPoint = () => false;
export const restartFromRest = () => false;
export const useItem = () => false;
`,
  'levelmode/markers': `
export const createLevelMarkers = ${missing('level mode')};
`,
  // The level character's form (built hidden with the corners'): the Forger, as levelmode/sandbox.js has him until another is built.
  'levelmode/sandbox': `
export function heroClean(raw) {
  const inputs = normaliseInputs(structuredClone(raw ?? levelPreset('forger')));
  delete inputs.mounted;
  inputs.name = String(inputs.name ?? '').trim().slice(0, 32) || 'Nameless';
  return inputs;
}
export const heroLoad = () => heroClean(null);
export const heroSave = () => false;
export const applySandbox = ${missing('level mode')};
export const sandboxBadge = () => null;
export const sandboxPlaces = () => [];
export const travelTo = () => false;
`,
  'levelmode/stage': `
export const cameraTerrain = () => null;
export const interiorAt = () => false;
export const mechanismsOf = () => [];
export const pullLever = () => false;
export const setMechanism = () => false;
export const updateStage = () => {};
`,
  'levelmode/stagelooks': `
export const DEFAULT_STAGE_LOOK = 'stormBreak';
export const STAGE_LOOKS = {};
export const stageLookNames = () => [];
export const stageLookOf = () => ({});
`,
  'levelmode/stages': `
export const STAGES = {};
`,
  'levelmode/storm': `
export const buildStormPlace = ${missing('level mode')};
export const stormEnvironment = () => null;
export const stormLastStrike = () => null;
export const stormLook = () => 'stormBreak';
export const stormOnSkyArrived = () => {};
export const stormRelease = () => {};
export const stormReset = () => {};
export const stormSetLook = () => 'stormBreak';
export const stormStrikeNow = () => {};
`,
  'levelmode/story': `
export const NOTES = {};
export const STAGE_ONE = null;
export const closeStory = () => {};
export const showDeath = () => {};
export const showEnding = () => {};
export const showFinale = () => {};
export const showNote = () => {};
export const showOpening = () => {};
export const storyBusy = () => false;
`,
  'levelmode/terrainview': `
export const createStageView = ${missing('level mode')};
export const disposeStageView = () => {};
export const placeStageSea = () => {};
export const updateStageView = () => {};
`,
  'levelmode/travel': `
export const travelPlaces = () => [];
`,
};
