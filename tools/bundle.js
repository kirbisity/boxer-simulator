// Inline the modules and stylesheet into one page for the hosted review copy.
// Usage: node tools/bundle.js [out.html] [--no-minify] [--lite | --custom]
// The code is minified with esbuild (comments and whitespace gone, names mangled) unless --no-minify is given, which keeps the source as it is for debugging.
// A minified build also writes <out>.map, a source map to the unminified bundle; the page names it in a sourceMappingURL comment but does not carry it.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { CUSTOM_BUDGET, CUSTOM_CSS, CUSTOM_DATA, CUSTOM_EXCLUDED, CUSTOM_STUBS, CUSTOM_TRANSFORMS } from './custom.js';

// In load order: a module's top-level code may use only what comes before it. The looks (the kit, one file per look, then the registry) come before toon.js, which asks the registry which look is in force.
const MODULES = ['aging', 'outfitsets', 'outfits', 'robotdogs', 'horses', 'physiology', 'maiming', 'body', 'physics/config', 'physics/overdraft', 'physics/terrain', 'physics/jump', 'joints', 'pose', 'weapons', 'moves', 'life', 'formation', 'handling', 'physics/fieldworks', 'audio/surface', 'audio/log', 'physics/arts', 'physics/gaps', 'physics/footing', 'physics/press', 'physics', 'physics/ranged', 'physics/grappling', 'physics/net', 'physics/throwable', 'physics/brush', 'physics/whip', 'physics/flame', 'physics/rising', 'physics/gait', 'physics/mounted', 'cast', 'riding', 'command', 'ai', 'battletally', 'battleend', 'lastgate', 'gesture', 'finisher', 'lowstrike', 'runsteer', 'weaponarts', 'control', 'followcam', 'watchcam', 'cameraarm', 'occluders', 'camerarig', 'scenerylod', 'levelmode/quality', 'adaptres', 'rig', 'bodymesh', 'skintones', 'sculpt', 'skinrules', 'skindetail', 'skintex', 'detailmaps', 'loftbody', 'fleshbody', 'bodystyles', 'skinworker', 'looks/kit', 'looks/toon', 'looks/probe-lite', 'looks', 'blooddye', 'detailmaps-data', 'clothmaps-data', 'detailtex', 'helmstyle', 'helmforms', 'helmmaps-data', 'helmmaps', 'knighthelms-data', 'knighthelms', 'menpo', 'ground/painted', 'ground/living', 'scenery/skyball-photo-data', 'scenery/skyball', 'scenery/generated', 'scenery/trees', 'scenery', 'toon', 'chinahelms', 'chinahelmview', 'stechzeug', 'netcloth', 'arenaview', 'soft', 'dangle', 'bones', 'faceregions', 'photohair', 'hairswing', 'hairmass', 'photoface', 'photohead', 'facemorph', 'face', 'wardrobe', 'robotview', 'exoview', 'oyoroi', 'crowdview', 'crowdlod', 'props/town', 'props/rural', 'props/arena', 'props/harbour', 'props/coast', 'props/subway', 'props/jiangnan', 'props/cajamarca', 'props/plains', 'fightui/logic', 'fightui/icons', 'fightui/kit', 'fightui/command', 'fightui/buttons', 'fightui/target', 'fightui/index', 'fightui/toggle', 'fightui/marker', 'generalmark', 'depthrange', 'levelmode/kitpaint', 'levelmode/kitshadow', 'levelmode/kitwear', 'levelmode/kittex', 'levelmode/kitgeo', 'levelmode/kitchapel', 'levelmode/kitfilth', 'levelmode/kitprops', 'levelmode/stagelooks', 'levelmode/stormsky-data', 'levelmode/stagesky', 'levelmode/storm', 'levelmode/water', 'levelmode/kitwater', 'worksview', 'render', 'battlefx', 'machinefx', 'arrowsight', 'weaponview', 'wind', 'flameview', 'blastview', 'horsebard', 'horsemesh', 'horsehair', 'robotdogview', 'horseview', 'drama', 'hitfeel', 'hitfeelview', 'chargefeel', 'chargefeelview', 'artdrama', 'artdramaview', 'scenarios', 'battlethumbs', 'muster', 'musterview', 'ratings', 'roster', 'custombattle', 'squad', 'custombattleview', 'setcard', 'infopop', 'overdraftview', 'touch', 'tutorial', 'intro', 'levelmode/presets', 'levelmode/story', 'audio/synth', 'audio/ear', 'audio/sfx/impact', 'audio/sfx/clash', 'audio/sfx/wound', 'audio/sfx/swing', 'audio/sfx/step', 'audio/sfx/fall', 'audio/sfx/voice', 'audio/sfx/horse', 'audio/sfx/ranged', 'audio/sfx/world', 'audio/sfx/spark', 'audio/sfx/ui', 'audio/sfx/thump', 'audio/sfx/art', 'audio/sfx/sampled', 'audio/samples', 'audio/families', 'audio/cries', 'audio/acoustics', 'audio/farfield', 'audio/charge', 'audio/flamesound', 'audio/ambience', 'audio/music/data/menu', 'audio/music/data/roman', 'audio/music/data/medieval', 'audio/music/data/japan', 'audio/music/data/china', 'audio/music/data/korea', 'audio/music/data/aztec', 'audio/music/data/ottoman', 'audio/music/data/modern', 'audio/music/data/scottish', 'audio/music/data/boss', 'audio/music/data/bosschoir', 'audio/music/data/victory', 'audio/music/data/defeat', 'audio/music/manifest', 'audio/music', 'audio/engine', 'audio/controls', 'audio/bench', 'lastgateview', 'menu', 'uicheck', 'looksbench', 'levelmode/stages/testyard-vault', 'levelmode/stages/testyard', 'levelmode/landform', 'levelmode/stages/dnbuild', 'levelmode/stages/dunnottar-sewer', 'levelmode/stages/dunnottar-vault', 'levelmode/stages/dunnottar-chapel', 'levelmode/stages/dunnottar-light', 'levelmode/stages/dunnottar', 'levelmode/stages', 'levelmode/awareness', 'levelmode/stage', 'levelmode/travel', 'levelmode/config', 'levelmode/adapter', 'levelmode/items', 'levelmode/loot', 'levelmode/attempts', 'levelmode/checkpoints', 'levelmode/interact', 'levelmode/cutscene', 'levelmode/ending', 'levelmode/level', 'levelmode/team', 'levelmode/sandbox', 'levelmode/teamview', 'levelmode/hud', 'levelmode/markers', 'levelmode/endingview', 'levelmode/cutsceneview', 'levelmode/torchpool', 'levelmode/visibility', 'levelmode/kit', 'levelmode/terrainview', 'levelmode/awarenessview', 'main'];
const args = process.argv.slice(2);
const minify = !args.includes('--no-minify');
// `--lite`: a smaller page (a test build, under 15 MB with nothing beside it): the heaviest baked pictures left out, each where the
// game already draws without them (the `#maps=off` look), least seen first; the sounds, music and photo faces kept. No source map.
const lite = args.includes('--lite');
// `--custom`: only the sandbox (custom mode), opened at once, as a test bed in one file under CUSTOM_BUDGET bytes (tools/custom.js):
// the modules it never reaches left out (stubbed where kept code imports them), the music gone, the ground tiles of its places kept.
const custom = args.includes('--custom');
if (lite && custom) throw new Error('--lite and --custom are two different builds: pick one');
const out = args.find((arg) => !arg.startsWith('--')) ?? (lite ? 'dist/gladiator-lite.html' : custom ? 'dist/gladiator-custom.html' : 'dist/gladiator.html');
// The modules in this page, in order: a custom page's excluded modules gone, or in their place their stubs (CUSTOM_STUBS).
const modules = custom ? MODULES.filter((name) => !CUSTOM_EXCLUDED(name) || CUSTOM_STUBS[name]) : MODULES;
const stubbed = (name) => custom && CUSTOM_EXCLUDED(name);
// `--plan`: the page's modules as JSON (in, stubbed, left out), nothing built.
if (args.includes('--plan')) {
  console.log(JSON.stringify({ modules, stubbed: modules.filter(stubbed), excluded: MODULES.filter((name) => !modules.includes(name)) }));
  process.exit(0);
}
// What a lite page leaves out, by module: its data (the module's one exported const) cut down to what is kept.
const LITE = {
  // The grounds' tiles (13 MB of the 15): the places' painted ground is drawn under them anyway. Of the armour's, the samurai's
  // lacing (kozane, 0.7 MB) too; the rest kept (plate, mail and the others on most armoured men: 1.6 MB).
  'detailmaps-data': (data) => Object.fromEntries(Object.entries(data).filter(([name, tile]) => tile.kind !== 'ground' && !LITE_DROPPED_TILES.includes(name))),
  // The cloth atlas and the helmets' sheets: cloth and helmets drawn as with the maps off (detailtex.js, helmmaps.js).
  'clothmaps-data': () => ({}),
  'helmmaps-data': () => ({}),
  'knighthelms-data': () => ({}),
  // Level mode's storm-sky photographs (its painted storm sky kept: levelmode/stagesky.js), their sizes and colours kept.
  'levelmode/stormsky-data': (data) => Object.fromEntries(Object.entries(data).map(([name, photo]) => [name, { ...photo, jpeg: null }])),
};
const LITE_DROPPED_TILES = ['kozane'];
/** A lite (or custom) page's stand-in for a data module: its exported const, cut down (LITE, CUSTOM_DATA). */
async function cutSource(name, cuts, build) {
  const module = await import(new URL(`../src/${name}.js`, import.meta.url));
  const [[constName, data]] = Object.entries(module);
  return `// (${build} build: ${name}.js cut down by tools/bundle.js.)\nexport const ${constName} = ${JSON.stringify(cuts[name](data))};\n`;
}
const liteSources = new Map();
if (lite) for (const name of Object.keys(LITE)) liteSources.set(name, await cutSource(name, LITE, 'Lite'));
if (custom) for (const name of Object.keys(CUSTOM_DATA)) liteSources.set(name, await cutSource(name, CUSTOM_DATA, 'Custom'));
/** A module's source as this page has it: a custom page's stub or rewrite, a cut-down data module, or the file. */
function sourceOf(name) {
  if (stubbed(name)) return `// (Custom build: ${name}.js left out; its stand-in from tools/custom.js.)\n${CUSTOM_STUBS[name].trimStart()}`;
  const source = liteSources.get(name) ?? readFileSync(`src/${name}.js`, 'utf8');
  return custom && CUSTOM_TRANSFORMS[name] ? CUSTOM_TRANSFORMS[name](source) : source;
}
const declared = (source) => [...source.matchAll(/^(?:export )?(?:const|let|(?:async )?function\*?|class) +([A-Za-z_$][\w$]*)/gm)].map(([, identifier]) => identifier);

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('boxer.css', 'utf8') + readFileSync('fightui.css', 'utf8') + (custom ? CUSTOM_CSS : '');
// The recorded sound effects (src/audio/samples/*.mp3), their bytes put into samples.js, which fetches the files from the source.
const SAMPLE_EMBED_LINE = 'const SAMPLE_EMBED = null;';
function sampleEmbed() {
  const files = readdirSync('src/audio/samples').filter((file) => file.endsWith('.mp3')).sort();
  return `const SAMPLE_EMBED = {\n${files.map((file) => `  '${file.replace(/\.mp3$/, '')}': '${readFileSync(`src/audio/samples/${file}`).toString('base64')}',`).join('\n')}\n};`;
}
// The photo faces' maps and manifest (assets/faces/), as data URLs by file name, put into photoface.js, which otherwise fetches them.
const FACE_EMBED_LINE = 'const PHOTO_FACE_EMBED = null;';
const FACE_TYPES = { jpg: 'image/jpeg', png: 'image/png', json: 'application/json' };
function faceEmbed() {
  const files = readdirSync('assets/faces').filter((file) => /\.(jpg|png|json)$/.test(file)).sort();
  return `const PHOTO_FACE_EMBED = {\n${files.map((file) => `  '${file}': 'data:${FACE_TYPES[file.split('.').pop()]};base64,${readFileSync(`assets/faces/${file}`).toString('base64')}',`).join('\n')}\n};`;
}
// The battle pickers' stills (assets/battles/*.webp), as data URLs by battle, put into battlethumbs.js, which otherwise fetches them.
const THUMB_EMBED_LINE = 'const BATTLE_THUMB_EMBED = null;';
function thumbEmbed() {
  const files = readdirSync('assets/battles').filter((file) => file.endsWith('.webp')).sort();
  return `const BATTLE_THUMB_EMBED = {\n${files.map((file) => `  '${file.replace(/\.webp$/, '')}': 'data:image/webp;base64,${readFileSync(`assets/battles/${file}`).toString('base64')}',`).join('\n')}\n};`;
}
/** A module's code with its imports and exports taken out (the bundle is one scope). */
function strip(name) {
  let source = sourceOf(name);
  if (name === 'photoface') {
    if (!source.includes(FACE_EMBED_LINE)) throw new Error(`src/photoface.js: no '${FACE_EMBED_LINE}' to fill`);
    source = source.replace(FACE_EMBED_LINE, faceEmbed());
  }
  if (name === 'battlethumbs') {
    if (!source.includes(THUMB_EMBED_LINE)) throw new Error(`src/battlethumbs.js: no '${THUMB_EMBED_LINE}' to fill`);
    source = source.replace(THUMB_EMBED_LINE, thumbEmbed());
  }
  if (name === 'audio/samples') {
    if (!source.includes(SAMPLE_EMBED_LINE)) throw new Error(`src/audio/samples.js: no '${SAMPLE_EMBED_LINE}' to fill`);
    source = source.replace(SAMPLE_EMBED_LINE, sampleEmbed());
  }
  return source
    .replace(/^import [^;]+;\n/gm, '')
    // Re-exports (export { x } from './y.js') name what is already in the shared scope.
    .replace(/^export \{[^}]*\} from [^;]+;\n/gm, '')
    .replace(/^export (async function|const|function\*|function|class|let) /gm, '$1 ');
}
const lateImports = [];
const code = modules.map((name) => {
  const source = sourceOf(name);
  const stripped = strip(name);
  // An aliased import (`a as b`) is stripped with the rest, and `b` then names nothing: refuse it.
  if (/^import \{[^}]*\bas\b/m.test(source)) throw new Error(`src/${name}.js: an aliased import, which the bundle cannot keep`);
  if (/^(import|export) /m.test(stripped)) throw new Error(`src/${name}.js: an import or export survived the bundling`);
  // Every local module imported must be on the list, or the page dies at load.
  for (const [, names, path] of source.matchAll(/(?:\{([^}]*)\} )?from '(\.{1,2}\/[\w/-]+)\.js'/g)) {
    const imported = new URL(`${path}.js`, `file:///src/${name}.js`).pathname.replace(/^\/src\//, '').replace(/\.js$/, '');
    if (!MODULES.includes(imported)) throw new Error(`src/${name}.js imports ${imported}.js, which is not in MODULES`);
    if (!modules.includes(imported)) throw new Error(`src/${name}.js imports ${imported}.js, which this build leaves out with no stand-in (tools/custom.js CUSTOM_STUBS)`);
    // A stand-in must declare every name imported from it, or the page dies when the name is first used.
    if (stubbed(imported)) {
      const has = declared(sourceOf(imported));
      const lacking = (names ?? '').split(',').map((each) => each.trim()).filter((each) => each && !has.includes(each));
      if (lacking.length) throw new Error(`src/${name}.js imports ${lacking.join(', ')} from ${imported}.js, which the custom build's stand-in for it lacks (tools/custom.js CUSTOM_STUBS)`);
    }
    // The bundle is one scope in list order: a module's top level may use only what is above it (a const below it is still in its temporal dead zone: the page dies at load with a blank screen, though the ES-module page works).
    if (MODULES.indexOf(imported) > MODULES.indexOf(name)) lateImports.push(`${name} imports ${imported}`);
  }
  return `// ---- src/${name}.js ----\n${stripped}`;
}).join('\n');

if (process.env.BUNDLE_STRICT_ORDER && lateImports.length) throw new Error(`modules above what they import:\n${lateImports.join('\n')}`);
if (lateImports.length) console.warn(`${lateImports.length} imports point below their module (fine only if used inside functions):\n${lateImports.join('\n')}`);

// One shared scope: two modules declaring the same top-level name would
// stop the page with a SyntaxError, so refuse to write it.
const seen = new Map();
for (const name of modules) {
  for (const identifier of declared(sourceOf(name))) {
    if (seen.has(identifier)) throw new Error(`${identifier} is declared in both ${seen.get(identifier)} and ${name}`);
    seen.set(identifier, name);
  }
}

// The whole page must at least compile: a name declared twice inside a
// function stops it as surely as one at the top.
try {
  new vm.Script(code);
} catch (error) {
  throw new Error(`the bundled page does not compile: ${error.message}`);
}

const title = html.match(/<title>.*<\/title>/)[0];
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const markup = html.match(/<main[\s\S]*<\/main>/)[0];
const three = html.match(/<script src="https:\/\/cdnjs[^>]+><\/script>/)[0];
// The skin worker (src/skinworker.js) runs in a thread of its own: its code and the modules it needs, again, as a classic script the
// page hands to a Worker (render.js skinWorker), in the order of MODULES.
const needs = new Set();
const follow = (name) => {
  if (needs.has(name)) return;
  needs.add(name);
  for (const [, path] of sourceOf(name).matchAll(/from '(\.{1,2}\/[\w/-]+)\.js'/g)) follow(new URL(`${path}.js`, `file:///src/${name}.js`).pathname.replace(/^\/src\//, '').replace(/\.js$/, ''));
};
follow('skinworker');
const workerCode = modules.filter((name) => needs.has(name)).map((name) => `// ---- src/${name}.js ----\n${strip(name)}`).join('\n');
try {
  new vm.Script(workerCode);
} catch (error) {
  throw new Error(`the bundled skin worker does not compile: ${error.message}`);
}
/**
 * The code minified. The bundle is one ES module (or the worker's one classic script), so every top-level name is as local as an inner one and may be mangled with the rest; properties are never touched (window.boxer, data keys, THREE's own).
 * Long string literals (the base64 audio and sky pictures) are lifted out first and put back after, so the minifier never reads or rewrites them.
 */
function minified(source, sourcefile) {
  const strings = [];
  const lifted = source.replace(/'[^'\\\n]{2000,}'/g, (literal) => `'@@DATA${strings.push(literal) - 1}@@'`);
  const result = transformSync(lifted, { minify: true, format: 'esm', target: 'es2022', legalComments: 'none', sourcemap: 'external', sourcefile });
  let restored = 0;
  const code = result.code.replace(/(["'`])@@DATA(\d+)@@\1/g, (match, quote, index) => (restored++, strings[index]));
  if (restored !== strings.length) throw new Error(`minifying lost ${strings.length - restored} of ${strings.length} long strings`);
  return { code, map: result.map };
}
let pageCode = code;
let pageWorker = workerCode;
if (minify) {
  const mapName = `${basename(out)}.map`;
  const main = minified(code, 'gladiator-src.js');
  pageCode = main.code;
  pageWorker = minified(workerCode, 'skin-worker-src.js').code;
  new vm.Script(pageCode);
  if (!lite && !custom) {
    pageCode += `\n//# sourceMappingURL=${mapName}\n`;
    writeFileSync(`${out}.map`, main.map);
  }
}
if (/<\/script/i.test(pageCode + pageWorker)) throw new Error('a closing script tag inside the code would end the page\'s script early');
// A custom page is opened as a file of its own (not inside the review copy's wrapper): it says its encoding itself.
const page = `${custom ? '<meta charset="utf-8">\n' : ''}${title}\n${fonts}\n<style>\n${css}</style>\n${markup}\n${three}\n<script type="text/plain" id="skin-worker-source">\n${pageWorker}</script>\n<script type="module">\n${pageCode}</script>\n`;
const bytes = Buffer.byteLength(page);
if (custom && bytes >= CUSTOM_BUDGET) throw new Error(`the custom page is ${bytes} bytes, over its budget of ${CUSTOM_BUDGET} (tools/custom.js CUSTOM_BUDGET): leave out more (CUSTOM_GROUND_TILES first); ${out} not written`);
writeFileSync(out, page);
console.log(`${out}: ${(bytes / 1024).toFixed(0)} KB${custom ? ` (${bytes} bytes of the custom budget's ${CUSTOM_BUDGET})` : ''}`);
