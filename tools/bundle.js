// Inline the modules and stylesheet into one page for the hosted review copy.
// Usage: node tools/bundle.js [out.html] [--no-minify]
// The code is minified with esbuild (comments and whitespace gone, names mangled) unless --no-minify is given, which keeps the source as it is for debugging.
// A minified build also writes <out>.map, a source map to the unminified bundle; the page names it in a sourceMappingURL comment but does not carry it.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

// In load order: a module's top-level code may use only what comes before it. The looks (the kit, one file per look, then the registry) come before toon.js, which asks the registry which look is in force.
const MODULES = ['aging', 'outfits', 'horses', 'physiology', 'body', 'physics/config', 'physics/overdraft', 'physics/terrain', 'physics/jump', 'joints', 'pose', 'weapons', 'moves', 'life', 'formation', 'handling', 'physics/fieldworks', 'audio/surface', 'audio/log', 'physics', 'physics/ranged', 'physics/grappling', 'physics/net', 'physics/brush', 'physics/whip', 'physics/rising', 'physics/gait', 'physics/mounted', 'cast', 'riding', 'command', 'ai', 'battletally', 'gesture', 'finisher', 'runsteer', 'control', 'followcam', 'watchcam', 'cameraarm', 'occluders', 'camerarig', 'scenerylod', 'levelmode/quality', 'adaptres', 'rig', 'bodymesh', 'skintones', 'sculpt', 'skinrules', 'skindetail', 'skintex', 'loftbody', 'fleshbody', 'bodystyles', 'skinworker', 'looks/kit', 'looks/toon', 'looks/probe-lite', 'looks', 'blooddye', 'ground/painted', 'ground/living', 'scenery/skyball-photo-data', 'scenery/skyball', 'scenery/generated', 'scenery/trees', 'scenery', 'toon', 'stechzeug', 'netcloth', 'arenaview', 'soft', 'dangle', 'bones', 'facemorph', 'face', 'wardrobe', 'robotview', 'oyoroi', 'crowdview', 'crowdlod', 'props/town', 'props/rural', 'props/arena', 'props/harbour', 'props/coast', 'props/subway', 'props/jiangnan', 'props/cajamarca', 'props/plains', 'fightui/logic', 'fightui/icons', 'fightui/kit', 'fightui/command', 'fightui/buttons', 'fightui/target', 'fightui/index', 'fightui/toggle', 'fightui/marker', 'depthrange', 'levelmode/kitpaint', 'levelmode/kitshadow', 'levelmode/kitwear', 'levelmode/kittex', 'levelmode/kitgeo', 'levelmode/kitchapel', 'levelmode/kitfilth', 'levelmode/kitprops', 'levelmode/stagelooks', 'levelmode/stormsky-data', 'levelmode/stagesky', 'levelmode/storm', 'levelmode/water', 'levelmode/kitwater', 'worksview', 'render', 'battlefx', 'arrowsight', 'weaponview', 'horsemesh', 'horsehair', 'horseview', 'drama', 'scenarios', 'muster', 'musterview', 'ratings', 'roster', 'overdraftview', 'touch', 'tutorial', 'intro', 'levelmode/presets', 'levelmode/story', 'audio/synth', 'audio/ear', 'audio/sfx/impact', 'audio/sfx/clash', 'audio/sfx/wound', 'audio/sfx/swing', 'audio/sfx/step', 'audio/sfx/fall', 'audio/sfx/voice', 'audio/sfx/horse', 'audio/sfx/ranged', 'audio/sfx/world', 'audio/sfx/ui', 'audio/families', 'audio/acoustics', 'audio/farfield', 'audio/ambience', 'audio/music/data/menu', 'audio/music/data/roman', 'audio/music/data/medieval', 'audio/music/data/japan', 'audio/music/data/china', 'audio/music/data/korea', 'audio/music/data/aztec', 'audio/music/data/ottoman', 'audio/music/data/modern', 'audio/music/data/scottish', 'audio/music/data/boss', 'audio/music/data/victory', 'audio/music/data/defeat', 'audio/music/manifest', 'audio/music', 'audio/engine', 'audio/controls', 'audio/bench', 'menu', 'uicheck', 'looksbench', 'levelmode/stages/testyard-vault', 'levelmode/stages/testyard', 'levelmode/landform', 'levelmode/stages/dnbuild', 'levelmode/stages/dunnottar-sewer', 'levelmode/stages/dunnottar-vault', 'levelmode/stages/dunnottar-chapel', 'levelmode/stages/dunnottar-light', 'levelmode/stages/dunnottar', 'levelmode/stages', 'levelmode/awareness', 'levelmode/stage', 'levelmode/travel', 'levelmode/config', 'levelmode/adapter', 'levelmode/items', 'levelmode/loot', 'levelmode/attempts', 'levelmode/checkpoints', 'levelmode/interact', 'levelmode/cutscene', 'levelmode/ending', 'levelmode/level', 'levelmode/team', 'levelmode/sandbox', 'levelmode/teamview', 'levelmode/hud', 'levelmode/markers', 'levelmode/endingview', 'levelmode/cutsceneview', 'levelmode/torchpool', 'levelmode/visibility', 'levelmode/kit', 'levelmode/terrainview', 'levelmode/awarenessview', 'main'];
const args = process.argv.slice(2);
const minify = !args.includes('--no-minify');
const out = args.find((arg) => !arg.startsWith('--')) ?? 'dist/gladiator.html';

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('boxer.css', 'utf8') + readFileSync('fightui.css', 'utf8');
/** A module's code with its imports and exports taken out (the bundle is one scope). */
function strip(name) {
  return readFileSync(`src/${name}.js`, 'utf8')
    .replace(/^import [^;]+;\n/gm, '')
    // Re-exports (export { x } from './y.js') name what is already in the shared scope.
    .replace(/^export \{[^}]*\} from [^;]+;\n/gm, '')
    .replace(/^export (async function|const|function\*|function|class|let) /gm, '$1 ');
}
const lateImports = [];
const code = MODULES.map((name) => {
  const source = readFileSync(`src/${name}.js`, 'utf8');
  const stripped = strip(name);
  // An aliased import (`a as b`) is stripped with the rest, and `b` then names nothing: refuse it.
  if (/^import \{[^}]*\bas\b/m.test(source)) throw new Error(`src/${name}.js: an aliased import, which the bundle cannot keep`);
  if (/^(import|export) /m.test(stripped)) throw new Error(`src/${name}.js: an import or export survived the bundling`);
  // Every local module imported must be on the list, or the page dies at load.
  for (const [, path] of source.matchAll(/from '(\.{1,2}\/[\w/-]+)\.js'/g)) {
    const imported = new URL(`${path}.js`, `file:///src/${name}.js`).pathname.replace(/^\/src\//, '').replace(/\.js$/, '');
    if (!MODULES.includes(imported)) throw new Error(`src/${name}.js imports ${imported}.js, which is not in MODULES`);
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
for (const name of MODULES) {
  const source = readFileSync(`src/${name}.js`, 'utf8');
  for (const [, identifier] of source.matchAll(/^(?:export )?(?:const|let|(?:async )?function\*?|class) +([A-Za-z_$][\w$]*)/gm)) {
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
  for (const [, path] of readFileSync(`src/${name}.js`, 'utf8').matchAll(/from '(\.{1,2}\/[\w/-]+)\.js'/g)) follow(new URL(`${path}.js`, `file:///src/${name}.js`).pathname.replace(/^\/src\//, '').replace(/\.js$/, ''));
};
follow('skinworker');
const workerCode = MODULES.filter((name) => needs.has(name)).map((name) => `// ---- src/${name}.js ----\n${strip(name)}`).join('\n');
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
  pageCode += `\n//# sourceMappingURL=${mapName}\n`;
  writeFileSync(`${out}.map`, main.map);
}
if (/<\/script/i.test(pageCode + pageWorker)) throw new Error('a closing script tag inside the code would end the page\'s script early');
const page = `${title}\n${fonts}\n<style>\n${css}</style>\n${markup}\n${three}\n<script type="text/plain" id="skin-worker-source">\n${pageWorker}</script>\n<script type="module">\n${pageCode}</script>\n`;
writeFileSync(out, page);
console.log(`${out}: ${(page.length / 1024).toFixed(0)} KB`);
