// The custom pages (tools/bundle.js --custom[=places], tools/custom.js): the fights page (no level mode, story or story places) and
// the places page, each one packed file under its budget with room to grow, the intro, the tutorial and the music left out of both,
// every name kept code imports from what is left out stood in for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CUSTOM_BUDGET, CUSTOM_CLEAN_MAPS, CUSTOM_GROUND_TILES, CUSTOM_PAGES, CUSTOM_STUBS, unpackPage } from '../tools/custom.js';
import { DETAIL_MAP_DATA } from '../src/detailmaps-data.js';
import { CLOTH_MAP_DATA } from '../src/clothmaps-data.js';
import { MUSIC_CUES } from '../src/audio/music/manifest.js';
import { STORM_SKY_DATA } from '../src/levelmode/stormsky-data.js';

const ROOT = new URL('..', import.meta.url).pathname;
const bundle = (...args) => execFileSync('node', ['tools/bundle.js', ...args], { cwd: ROOT, stdio: 'pipe', maxBuffer: 1 << 26 }).toString();
const plans = { fights: JSON.parse(bundle('--custom', '--plan')), places: JSON.parse(bundle('--custom=places', '--plan')) };
const plan = plans.fights;
/** Each `import { names } from './x.js'` of a module as a custom page has it (its transforms), as [target module, names]. */
const sourceOf = (name, page = 'fights') => (CUSTOM_PAGES[page].transforms[name] ?? String)(readFileSync(join(ROOT, `src/${name}.js`), 'utf8'));
const importsOf = (name, page) => [...sourceOf(name, page).matchAll(/^import \{([^}]*)\} from '(\.{1,2}\/[\w/-]+)\.js'/gm)]
  .map(([, names, path]) => [new URL(`${path}.js`, `file:///src/${name}.js`).pathname.replace(/^\/src\//, '').replace(/\.js$/, ''), names.split(',').map((each) => each.trim()).filter(Boolean)]);

test('the fights page leaves out level mode, the story, its places, the intro, the tutorial and the music', () => {
  const left = new Set([...plan.excluded, ...plan.stubbed]);
  for (const name of ['intro', 'tutorial', 'places/pyongyang', 'places/canaltown', 'townkit/build', 'story/storyview', 'story/chapters/07-sarhu', 'levelmode/level', 'levelmode/stage', 'levelmode/storm', 'levelmode/stormsky-data', 'levelmode/stages/dunnottar', 'levelmode/kit', 'levelmode/story', 'levelmode/hud', 'audio/music/data/victory', 'audio/music/data/bosschoir']) assert.ok(left.has(name), `${name} is in the custom page`);
  // What the fights use is kept whole: the physics, the AI, the fire, the builder's presets, the sound effects, the faces.
  // The menus and their screens are here: the custom battle, Battle Mode, Deadliest Warrior, Last Stand Squad.
  for (const name of ['physics', 'ai', 'physics/flame', 'flameview', 'outfits', 'weapons', 'roster', 'levelmode/presets', 'levelmode/water', 'audio/samples', 'audio/engine', 'photoface', 'menu', 'custombattleview', 'battlethumbs', 'lastgate', 'lastgateview', 'scenarios', 'main']) {
    assert.ok(plan.modules.includes(name), `${name} is not in the custom page`);
    assert.ok(!plan.stubbed.includes(name), `${name} is stubbed`);
  }
});

test('the places page has level mode, the story, its places and the custom battle\'s ground and sky picker, without the intro, tutorial or music', () => {
  const places = plans.places;
  for (const name of ['intro', 'tutorial', 'audio/music/data/victory']) assert.ok(!places.modules.includes(name) || places.stubbed.includes(name), `${name} is in the places page`);
  for (const name of ['levelmode/stage', 'levelmode/stages/dunnottar', 'levelmode/storm', 'places/canaltown', 'places/pyongyang', 'places/storyplaces', 'townkit/build', 'story/storyview', 'story/chapters/07-sarhu', 'story/battles/08-hunriver', 'custombattle', 'custombattleview', 'menu', 'main']) {
    assert.ok(places.modules.includes(name), `${name} is not in the places page`);
    assert.ok(!places.stubbed.includes(name), `${name} is stubbed`);
  }
});

test('no kept module needs an excluded one at runtime: every name it imports from one is in that one\'s stand-in', () => {
  for (const [page, plan] of Object.entries(plans)) for (const name of plan.modules.filter((each) => !plan.stubbed.includes(each))) {
    for (const [target, names] of importsOf(name, page)) {
      assert.ok(!plan.excluded.includes(target), `${name} imports ${target}, left out with no stand-in`);
      if (!plan.stubbed.includes(target)) continue;
      const stub = CUSTOM_STUBS[target];
      for (const each of names) assert.match(stub, new RegExp(`^export (const|function) ${each.replace('$', '\\$')}\\b`, 'm'), `${name} imports ${each} from ${target}, not in its stand-in`);
    }
  }
  // A stand-in imports nothing: it stands in the page's one scope.
  for (const stub of Object.values(CUSTOM_STUBS)) assert.doesNotMatch(stub, /^import /m);
});

/** A custom page built into a scratch folder: its file's text, its size and its code as it runs. */
const built = (page) => {
  const out = join(mkdtempSync(join(tmpdir(), 'custom-bundle-')), `${page}.html`);
  bundle(out, `--custom=${page}`);
  const html = readFileSync(out, 'utf8');
  return { html, size: statSync(out).size, code: unpackPage(html) };
};
/** Room each page keeps to grow into (bytes under its budget). */
const HEADROOM = 2_000_000;

test('the fights page is one packed file under its budget with room to grow, without the music, the storm sky or the left-out tiles', () => {
  const { html: page, size, code } = built('fights');
  assert.ok(size < CUSTOM_BUDGET - HEADROOM && CUSTOM_BUDGET < 16_000_000, `${size} bytes`);
  assert.doesNotMatch(page, /sourceMappingURL/);
  // (Long strings survive minifying whole: a piece of each is enough to find it.)
  const piece = (base64) => base64.slice(2000, 2200);
  for (const cue of Object.values(MUSIC_CUES)) assert.ok(cue.file ? !page.includes(cue.file) : !page.includes(piece(cue.data)), 'a music cue is in the custom page');
  for (const photo of Object.values(STORM_SKY_DATA)) if (photo.jpeg) assert.ok(!page.includes(piece(photo.jpeg)), 'a storm-sky photo is in the custom page');
  for (const [name, tile] of Object.entries(DETAIL_MAP_DATA)) {
    const data = JSON.stringify(tile).match(/"([A-Za-z0-9+/=]{4000,})"/)[1];
    // (A tile carried clean, CUSTOM_CLEAN_MAPS: its worn image is not on the page, looked for whole, as a piece of a worn image
    // can be found in its clean one, where both run through the same flat stretch.)
    if (CUSTOM_CLEAN_MAPS['detailmaps-data'].includes(name)) assert.ok(!page.includes(data), `the ${name} tile is carried worn`);
    else assert.equal(page.includes(piece(data)), tile.kind !== 'ground' || CUSTOM_GROUND_TILES.includes(name), `the ${name} tile`);
  }
  // (The cloth atlas carried clean: its worn picture is not on the page, the clean one is.)
  const cleanCloth = execFileSync('git', ['show', '70afbbc:src/clothmaps-data.js'], { maxBuffer: 1 << 26 }).toString().split("atlas: '")[1].split("'")[0];
  if (CLOTH_MAP_DATA.atlas !== cleanCloth) assert.ok(!page.includes(CLOTH_MAP_DATA.atlas), 'the cloth atlas is carried worn');
  assert.ok(page.includes(piece(cleanCloth)), 'the clean cloth atlas is not on the page');
  // Nothing of the places: Pyongyang and the canal town are not among the custom battle's grounds.
  assert.doesNotMatch(code.main, /PYONGYANG_WEATHER|buildCanalTown\b/);
  // It links nothing but the three.js script and the fonts.
  assert.deepEqual([...page.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map(([, url]) => new URL(url).host).sort(), ['cdnjs.cloudflare.com', 'fonts.googleapis.com']);
});

test('the places page is one packed file under its budget with room to grow, its code whole', () => {
  const { html: page, size, code } = built('places');
  assert.ok(size < CUSTOM_BUDGET - HEADROOM, `${size} bytes`);
  assert.doesNotMatch(page, /sourceMappingURL/);
  // The story places' code is there, and so is the unpacked skin worker.
  assert.match(code.main, /canaltown/);
  assert.ok(code.worker.length > 100_000);
  for (const cue of Object.values(MUSIC_CUES)) if (!cue.file) assert.ok(!page.includes(cue.data.slice(2000, 2200)), 'a music cue is in the places page');
});
