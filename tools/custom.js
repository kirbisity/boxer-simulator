// The custom pages (`npm run bundle:custom`, tools/bundle.js --custom[=<page>]): test beds, each one self-contained file under its budget
// (CUSTOM_BUDGET) published on its own, two of them so neither holds the other's work back (CUSTOM_PAGES):
//   fights  dist/historically-accurate-combat-simulator-custom.html: the fighters and their fights: the menus, the sandbox, the
//           custom battle, Battle Mode's battles, Deadliest Warrior, Who Wins?, Last Stand Squad. No level mode, story or story places.
//   places  dist/historically-accurate-combat-simulator-custom-places.html: the places walked and fought in: level mode's Dunnottar
//           stages, the story and its chapters, the story places (the canal town, Pyongyang) and the custom battle, whose ground
//           and sky picker opens them (Pyongyang, the canal town, Sarhu) for a fight. The menus are its way in too; the sandbox's own
//           ground tiles (sand, beach) are not carried, its places drawn painted.
// Both: the fights are the same code as the full game's (physics, AI, weapons, outfits, fire, sound effects, the builder's roster and
// presets); neither has the intro, the tutorial or the music (its cues gone, the engine plays its stings instead, as with a cue that
// is missing).
//
// An excluded module that kept code imports is replaced by a stub here declaring just what is imported: inert where the kept
// code calls it on every path (always behind a level, story or intro test, so a fight never sees a difference), throwing
// where it would open a part of the game that is not here. tools/bundle.js refuses a build in which a kept module imports a
// name an excluded module's stub does not declare.
//
// Each page's code is packed (packCode): the code gzipped and base64'd, the long incompressible strings in it (the baked pictures and
// recorded sounds, base64 already) carried beside it as they are, once for the page and its skin worker both; a small loader
// (PACK_LOADER) unpacks it with the browser's DecompressionStream and runs it. About 4 MB lighter than the plain page.

import { execFileSync } from 'node:child_process';
import { gunzipSync, gzipSync } from 'node:zlib';

/** The most a custom page may weigh (bytes, the page itself: nothing goes beside it). Set under the 16 MB a published test
 *  page may weigh, with room for the wrapper it is published in. */
export const CUSTOM_BUDGET = 15_500_000;

// Level mode's modules that the fights use too: the picture quality, water to wade in (and its config, its drawing in a battle's
// field works), and the level's characters (offered among the builder's presets).
const KEPT_LEVEL = ['levelmode/quality', 'levelmode/config', 'levelmode/water', 'levelmode/kitmirror', 'levelmode/kitwater', 'levelmode/presets'];
/** Left out of both pages: the intro, the tutorial (a first visit would open in it) and the music's data. */
const NEITHER = (name) => /^audio\/music\/data\//.test(name) || ['intro', 'tutorial'].includes(name);

// The grounds' baked tiles (detailmaps-data, 0.4 to 2.4 MB each) the fights page keeps, for the sandbox's own places (the Colosseum's
// sand, the shore's beach); the rest (the grass, the town's cobbles, the plain's dry grass and gravel, the earth, the port's
// concrete) drawn painted as with the maps off. The places page carries none (its places are drawn painted).
export const CUSTOM_GROUND_TILES = ['sand', 'beach'];

// The armour maps carried clean on the custom pages, by data module: their wear (tools/blender/wear.py) is in the full game, and
// none of the featured units wears them (the Roman hoops and scales, the mirror plates, the Ming arm guards, riot armour, the
// arena and turban helmets, the steppe and Chinese war masks). Left clean here on 2026-11-15, when wearing them took the page
// 4.5 KB past its budget; the clean ones are about 111 KB lighter (fine detail is what WebP packs worst).
// The cloth atlas (clothmaps-data: one picture, so its `atlas` and the cells' `means` together) carried clean as well since its
// wear (wear.py CLOTH_WEAR) took the page about 0.45 MB past its budget on 2026-11-15.
export const CUSTOM_CLEAN_MAPS = {
  'detailmaps-data': ['segmentata', 'scale', 'krug', 'bifu', 'polymer'],
  'helmmaps-data': ['formMurmillo', 'formThraex', 'formHoplomachus', 'formSecutor', 'formScissor', 'formTurbanTurkman', 'maskTiemian', 'maskShoumian', 'maskKipchak', 'maskHorde', 'maskVentail'],
  'clothmaps-data': ['atlas', 'means'],
};
// The clean maps are read from the commit whose armour and cloth data files were packed without wear (wear.py's clean source,
// main 70afbbc): the maps are not kept twice in the tree.
const CLEAN_MAPS_COMMIT = '70afbbc';
const cleanMaps = {};
for (const [module, names] of Object.entries(CUSTOM_CLEAN_MAPS)) {
  const source = execFileSync('git', ['show', `${CLEAN_MAPS_COMMIT}:src/${module}.js`], { maxBuffer: 1 << 28 }).toString('base64');
  const [data] = Object.values(await import(`data:text/javascript;base64,${source}`));
  cleanMaps[module] = Object.fromEntries(names.map((name) => {
    if (!data[name]) throw new Error(`tools/custom.js CUSTOM_CLEAN_MAPS: ${name} is not in ${module}.js at ${CLEAN_MAPS_COMMIT}`);
    return [name, data[name]];
  }));
}
const withClean = (module, data) => ({ ...data, ...cleanMaps[module] });

/** Data modules cut down (as tools/bundle.js LITE does), by module: its one exported const → what is kept; `tiles` the ground tiles kept. */
const dataCuts = (tiles) => ({
  'detailmaps-data': (data) => Object.fromEntries(Object.entries(withClean('detailmaps-data', data)).filter(([name, tile]) => tile.kind !== 'ground' || tiles.includes(name))),
  'helmmaps-data': (data) => withClean('helmmaps-data', data),
  'clothmaps-data': (data) => withClean('clothmaps-data', data),
});

/** A source rewrite that must find what it rewrites (the file changed under it otherwise): `cuts` [what, its replacement]. */
const rewrite = (file, cuts) => (source) => cuts.reduce((text, [what, by]) => {
  if (!text.includes(what)) throw new Error(`${file}: no "${what}" for tools/custom.js to rewrite`);
  return text.replace(what, by);
}, source);
/** The whole line of `source` holding `what`. */
const lineOf = (file, what) => (source) => {
  const line = source.split('\n').find((each) => each.includes(what));
  if (!line) throw new Error(`${file}: no line with "${what}" for tools/custom.js to rewrite`);
  return `${line}\n`;
};

// No music: no cues (and none of their data imported). The player finds no cue and stays silent; victory and defeat get the engine's stings.
const noMusic = (source) => {
  const cues = /^export const MUSIC_CUES = \{\n[\s\S]*?\n\};\n/m;
  if (!cues.test(source)) throw new Error('src/audio/music/manifest.js: no MUSIC_CUES block to empty');
  return source.replace(/^import \{ MUSIC_DATA_\w+ \} from '\.\/data\/\w+\.js';\n/gm, '').replace(cues, '// (Custom build: no music; tools/custom.js.)\nexport const MUSIC_CUES = {};\n');
};
// The menus without their ways into the tutorial and the intro (neither page has them); `story` false: without Story either.
const menuWithout = ({ story }) => (source) => {
  const cut = (text, what, by = '') => rewrite('src/menu.js', [[lineOf('src/menu.js', what)(text), by]])(text);
  let text = cut(source, "textContent: t('menu.home.tutorial')");
  text = cut(text, 'game.intro(home)');
  text = cut(text, "const yard = choice({ glyph: 'target'", '    const yard = null;\n');
  return story ? text : cut(text, 'onClick: stories,');
};

/** The two pages: each one's file, what it leaves out (stubbed where kept code imports it: CUSTOM_STUBS), its data cut down, its
 *  sources rewritten and its extra style. */
export const CUSTOM_PAGES = {
  fights: {
    out: 'dist/historically-accurate-combat-simulator-custom.html',
    excluded: (name) => NEITHER(name)
      || /^levelmode\//.test(name) && !KEPT_LEVEL.includes(name)
      // (Story mode's ground, its walls and ladders, is kept: worksview.js draws ladders on any battle's works.)
      || /^story\/(?!ground\/)/.test(name)
      // (The story's places and the kit they are built with: walked through level mode's stage and lit by its baked shadow, neither of them here.)
      || /^(townkit|places)\//.test(name)
      // (And the canal town's people.)
      || ['townfolk', 'townfolkview'].includes(name),
    data: dataCuts(CUSTOM_GROUND_TILES),
    transforms: { 'audio/music/manifest': noMusic, menu: menuWithout({ story: false }) },
    // The sandbox's ways into level mode hidden (they lead to what is not here).
    css: '\n/* Custom build (tools/custom.js): no level mode. */\n#level-character, #ghost-walk, #real-walk { display: none !important; }\n',
  },
  places: {
    out: 'dist/historically-accurate-combat-simulator-custom-places.html',
    excluded: NEITHER,
    data: dataCuts([]),
    transforms: { 'audio/music/manifest': noMusic, menu: menuWithout({ story: true }) },
    css: '',
  },
};

// ---- Packing ------------------------------------------------------------------------------------------------------------------
/** A literal at least this long, of base64 or a data URL's characters only (never code), is a candidate to carry unpacked. */
const PACK_LITERAL = /(["'])([A-Za-z0-9+/=:;,.-]{2000,})\1/g;
/** Carried unpacked when gzip saves less than this share of it (the base64 of a WebP, JPEG or MP3 saves about a quarter; base64 JSON far more). */
const PACK_KEEP_RATIO = 0.6;
const PACK_TOKEN = (index) => `@@PACKED${index}@@`;

/**
 * The page's code (`main`, a module) and its skin worker's (`worker`), packed: { strings, main, worker }, `strings` the literals
 * carried as they are (one a line), `main` and `worker` the rest gzipped, in base64, each literal a PACK_TOKEN.
 */
export function packCode(main, worker) {
  const strings = [];
  const index = new Map();
  const lift = (code) => code.replace(PACK_LITERAL, (literal, quote, text) => {
    if (!index.has(text)) index.set(text, gzipSync(text).length / text.length < 1 - PACK_KEEP_RATIO ? null : strings.push(text) - 1);
    const at = index.get(text);
    return at === null ? literal : `${quote}${PACK_TOKEN(at)}${quote}`;
  });
  const zip = (code) => gzipSync(lift(code), { level: 9 }).toString('base64');
  return { main: zip(main), worker: zip(worker), strings };
}

/** The loader: unpacks the code (packCode) and runs it, the worker's source put where render.js looks for it first. */
export const PACK_LOADER = `const packed = (id) => document.getElementById(id).textContent;
const strings = packed('packed-strings').split('\\n');
async function unpack(id) {
  const bytes = Uint8Array.from(atob(packed(id).trim()), (char) => char.charCodeAt(0));
  const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return text.replace(/@@PACKED(\\d+)@@/g, (token, at) => strings[at]);
}
const [worker, main] = await Promise.all([unpack('packed-worker'), unpack('packed-main')]);
document.getElementById('skin-worker-source').textContent = worker;
const script = document.createElement('script');
script.type = 'module';
script.textContent = main;
document.body.append(script);
`;

/** The packed page's markup around its code: the strings, the two packed codes, the loader. */
export const packedScripts = ({ main, worker, strings }) => `<script type="text/plain" id="skin-worker-source"></script>\n<script type="text/plain" id="packed-strings">${strings.join('\n')}</script>\n<script type="text/plain" id="packed-worker">${worker}</script>\n<script type="text/plain" id="packed-main">${main}</script>\n<script type="module">\n${PACK_LOADER}</script>\n`;

/** A packed page's code as it runs (for tests): { main, worker }. */
export function unpackPage(page) {
  const block = (id) => page.match(new RegExp(`<script type="text/plain" id="${id}">([\\s\\S]*?)</script>`))[1];
  const strings = block('packed-strings').split('\n');
  const unpack = (id) => gunzipSync(Buffer.from(block(id), 'base64')).toString().replace(/@@PACKED(\d+)@@/g, (token, at) => strings[at]);
  return { main: unpack('packed-main'), worker: unpack('packed-worker') };
}

const missing = (what) => `() => { throw new Error('${what}: not in the custom build (tools/custom.js)'); }`;

/** Stand-ins for the excluded modules that kept code imports, by module (ES module source, as a module file would be). */
export const CUSTOM_STUBS = {
  // (Unused here: the custom page carries the base meshes, the game's body, and the code that places them.)
  'basebody-data': `
export const BASE_BODY_DATA = null;
`,
  basebody: `
export const baseBodyAvailable = () => false;
export const baseHeatBones = () => null;
export const baseStarvation = () => 0;
export const baseStarvedDetail = () => null;
export const baseBodyMesh = ${missing('the base meshes')};
export const baseBodyUvs = ${missing('the base meshes')};
export const measureBaseBody = ${missing('the base meshes')};
export const placeBaseBody = ${missing('the base meshes')};
export const baseBindJoints = ${missing('the base meshes')};
`,
  // The story's places (src/places/, src/townkit/): not here; each an empty place under a plain light, should anything ask for one.
  'places/canaltown': `
export const CANAL_TOWN_LIGHT = { background: 0x9aa4aa, fog: [60, 400], far: 520, key: 0xffffff, keyIntensity: 0.1, rim: 0xffffff, sun: 0.85, hemi: 0.7 };
export function buildCanalTown() {
  return new THREE.Group();
}
export const CANAL_TOWN = null;
export function canalTownPlan() {
  return null;
}
canalTownPlan.absent = true;
`,
  'places/pyongyang': `
export const PYONGYANG_LIGHT = { background: 0xd3dbe2, fog: [150, 1500], far: 2400, key: 0xffffff, keyIntensity: 0.1, rim: 0xffffff, sun: 1, hemi: 0.62 };
export function buildPyongyang() {
  return new THREE.Group();
}
export function buildPyongyangTown() {
  return new THREE.Group();
}
export function pyongyangTownTerrain() {
  return null;
}
export function pyongyangPlan() {
  return null;
}
pyongyangPlan.absent = true;
`,
  'places/storyplaces': `
export const STORY_PLACES = {};
export const STORY_MUSTER_RADIUS = 0;
export function storyPlaceWeather() {
  return null;
}
`,
  'townkit/place': `
export function tkSetTier() {}
export const tkTier = () => 'low';
`,
  'townkit/weather': `
export const tkWeatherNow = () => ({});
`,
  // The canal town's people: no canal town here, so none.
  townfolkview: `
export function townfolkFrame() {}
export function townfolkReset() {}
export function townfolkInfo() {
  return null;
}
`,
  // Story mode (src/story/): not here; the page's hooks into it inert.
  'story/storyview': `
export function installStory() {
  return { open() { throw new Error('story mode: not in the custom build (tools/custom.js)'); }, tick() {}, think() {}, steer() {}, close() {}, leave() {}, holding: () => false, held: () => [], pace: () => 1, placeMark: () => null, filming: false, active: false, hooks: {} };
}
`,
  // A story scene's pose at ease: no story places to walk here, so never asked for.
  'story/scenes/stage': `
export const easeFor = () => null;
`,
  // His place's mark (story mode's): nothing to mark.
  'story/placemark': `
export function createStoryPlaceMark() {
  return { update() {} };
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
export const createStageWorld = ${missing('a stage to walk')};
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
export const STAGE_LIST = [];
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
