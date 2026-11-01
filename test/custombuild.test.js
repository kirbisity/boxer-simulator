// The custom build (tools/bundle.js --custom, tools/custom.js): the sandbox only, one file under its budget, level mode, The Last
// Gate, the intro, the tutorial, the menus and the music left out, every name kept code imports from them stood in for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CUSTOM_BUDGET, CUSTOM_GROUND_TILES, CUSTOM_STUBS, CUSTOM_TRANSFORMS } from '../tools/custom.js';
import { DETAIL_MAP_DATA } from '../src/detailmaps-data.js';
import { MUSIC_CUES } from '../src/audio/music/manifest.js';
import { STORM_SKY_DATA } from '../src/levelmode/stormsky-data.js';

const ROOT = new URL('..', import.meta.url).pathname;
const bundle = (...args) => execFileSync('node', ['tools/bundle.js', ...args], { cwd: ROOT, stdio: 'pipe', maxBuffer: 1 << 26 }).toString();
const plan = JSON.parse(bundle('--custom', '--plan'));
/** Each `import { names } from './x.js'` of a module as the custom page has it (CUSTOM_TRANSFORMS), as [target module, names]. */
const sourceOf = (name) => (CUSTOM_TRANSFORMS[name] ?? String)(readFileSync(join(ROOT, `src/${name}.js`), 'utf8'));
const importsOf = (name) => [...sourceOf(name).matchAll(/^import \{([^}]*)\} from '(\.{1,2}\/[\w/-]+)\.js'/gm)]
  .map(([, names, path]) => [new URL(`${path}.js`, `file:///src/${name}.js`).pathname.replace(/^\/src\//, '').replace(/\.js$/, ''), names.split(',').map((each) => each.trim()).filter(Boolean)]);

test('the custom plan leaves out level mode, The Last Gate, the intro, the tutorial, the menus and the music', () => {
  const left = new Set([...plan.excluded, ...plan.stubbed]);
  for (const name of ['menu', 'intro', 'tutorial', 'lastgate', 'lastgateview', 'levelmode/level', 'levelmode/stage', 'levelmode/storm', 'levelmode/stormsky-data', 'levelmode/stages/dunnottar', 'levelmode/kit', 'levelmode/story', 'levelmode/hud', 'audio/music/data/menu', 'audio/music/data/bosschoir']) assert.ok(left.has(name), `${name} is in the custom page`);
  // What the fights use is kept whole: the physics, the AI, the fire, the builder's presets, the sound effects, the faces.
  for (const name of ['physics', 'ai', 'physics/flame', 'flameview', 'outfits', 'weapons', 'roster', 'levelmode/presets', 'levelmode/water', 'audio/samples', 'audio/engine', 'photoface', 'main']) {
    assert.ok(plan.modules.includes(name), `${name} is not in the custom page`);
    assert.ok(!plan.stubbed.includes(name), `${name} is stubbed`);
  }
});

test('no kept module needs an excluded one at runtime: every name it imports from one is in that one\'s stand-in', () => {
  for (const name of plan.modules.filter((each) => !plan.stubbed.includes(each))) {
    for (const [target, names] of importsOf(name)) {
      assert.ok(!plan.excluded.includes(target), `${name} imports ${target}, left out with no stand-in`);
      if (!plan.stubbed.includes(target)) continue;
      const stub = CUSTOM_STUBS[target];
      for (const each of names) assert.match(stub, new RegExp(`^export (const|function) ${each.replace('$', '\\$')}\\b`, 'm'), `${name} imports ${each} from ${target}, not in its stand-in`);
    }
  }
  // A stand-in imports nothing: it stands in the page's one scope.
  for (const stub of Object.values(CUSTOM_STUBS)) assert.doesNotMatch(stub, /^import /m);
});

test('the custom page is one file under its budget, without the music, the storm sky or the left-out tiles', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'custom-bundle-')), 'gladiator-custom.html');
  bundle(out, '--custom');
  const size = statSync(out).size;
  assert.ok(size < CUSTOM_BUDGET && CUSTOM_BUDGET <= 15_000_000, `${size} bytes`);
  const page = readFileSync(out, 'utf8');
  assert.doesNotMatch(page, /sourceMappingURL/);
  // (Long strings survive minifying whole: a piece of each is enough to find it.)
  const piece = (base64) => base64.slice(2000, 2200);
  for (const cue of Object.values(MUSIC_CUES)) assert.ok(!page.includes(piece(cue.data)), 'a music cue is in the custom page');
  for (const photo of Object.values(STORM_SKY_DATA)) if (photo.jpeg) assert.ok(!page.includes(piece(photo.jpeg)), 'a storm-sky photo is in the custom page');
  for (const [name, tile] of Object.entries(DETAIL_MAP_DATA)) {
    const data = JSON.stringify(tile).match(/"([A-Za-z0-9+/=]{4000,})"/)[1];
    assert.equal(page.includes(piece(data)), tile.kind !== 'ground' || CUSTOM_GROUND_TILES.includes(name), `the ${name} tile`);
  }
  // It opens in the sandbox: the stand-in menu's way in.
  assert.match(page, /dataset\.game\s*!==\s*["']sandbox["']/);
});
