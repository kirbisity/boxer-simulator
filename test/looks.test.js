import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activateLook, activeLook, DEFAULT_LOOK_ID, lookById, lookList, LOOKS, setLook } from '../src/looks.js';
import { defineLook, linearise, outlineScale, unlinearise } from '../src/looks/kit.js';
import { STYLE } from '../src/toon.js';

const HOOKS = ['prepare', 'apply', 'surface', 'steel', 'renderFrame', 'resize', 'dispose', 'renderer'];

test('every registered look has what the plumbing reads', () => {
  const ids = new Set();
  for (const look of LOOKS) {
    assert.match(look.id, /^[a-z][a-z0-9-]*$/);
    assert.ok(!ids.has(look.id), `${look.id} is registered twice`);
    ids.add(look.id);
    assert.ok(look.label && look.blurb, `${look.id} needs a label and a blurb`);
    assert.ok(['toon', 'soft'].includes(look.style), `${look.id}: style`);
    assert.ok(Array.isArray(look.scripts), `${look.id}: scripts`);
    for (const url of look.scripts) assert.match(url, /^https:\/\/(cdn\.jsdelivr\.net\/npm\/three@0\.128\.0\/|cdnjs\.cloudflare\.com\/)/, `${look.id}: ${url} is not a script the page's CSP allows and r128 matches`);
    assert.equal(typeof look.linear, 'boolean', `${look.id}: linear`);
    assert.ok(look.outlines === true || look.outlines === false || typeof look.outlines === 'number', `${look.id}: outlines`);
    for (const hook of ['prepare', 'apply', 'surface', 'steel', 'renderFrame', 'resize', 'dispose']) assert.ok(look[hook] === undefined || typeof look[hook] === 'function', `${look.id}.${hook} is a function`);
  }
});

test('the five looks to compare, and toon, are registered, one file each', () => {
  assert.deepEqual(LOOKS.map((look) => look.id), ['toon', 'physical-sky', 'hdr-post', 'probe-lite', 'quality-physical', 'photo-hdri']);
  const files = readdirSync(new URL('../src/looks/', import.meta.url)).filter((name) => name !== 'kit.js' && !name.endsWith('-data.js')).map((name) => name.replace(/\.js$/, ''));
  assert.deepEqual(files.sort(), LOOKS.map((look) => look.id).sort(), 'a look is a file named by its id in src/looks/');
  assert.deepEqual(lookList().map((look) => look.id), LOOKS.map((look) => look.id));
});

test('toon is the default and has no hooks: it changes nothing', () => {
  assert.equal(DEFAULT_LOOK_ID, 'toon');
  assert.equal(activeLook().id, 'toon');
  const toon = lookById('toon');
  assert.equal(toon.style, 'toon');
  assert.equal(toon.linear, false);
  assert.equal(outlineScale(toon), 1);
  assert.deepEqual(toon.scripts, [], 'toon loads nothing extra');
  for (const hook of HOOKS) assert.equal(toon[hook], undefined, `toon.${hook} must be left out (an absent hook is the identity)`);
  assert.equal(STYLE.current, 'toon');
});

test('setting a look sets the style, and toon puts everything back', async () => {
  try {
    assert.equal((await setLook('physical-sky')).id, 'physical-sky');
    assert.equal(STYLE.current, 'soft');
    assert.equal((await setLook('toon')).id, 'toon');
    assert.equal(STYLE.current, 'toon');
    assert.equal(activeLook(), lookById('toon'));
  } finally {
    activateLook(lookById('toon'));
  }
});

test('an unknown look, or one whose script will not load, falls back to toon with a warning', async () => {
  const warnings = [];
  const warn = console.warn;
  console.warn = (...message) => warnings.push(message.join(' '));
  // A page that cannot fetch scripts: every tag fails.
  globalThis.document = {
    createElement: () => ({ remove() {} }),
    head: { append: (tag) => queueMicrotask(() => tag.onerror()) },
  };
  const broken = defineLook({ id: 'broken-test-look', label: 'Broken', blurb: 'x', scripts: ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/missing.js'] });
  LOOKS.push(broken);
  try {
    assert.equal((await setLook('no-such-look')).id, 'toon');
    assert.equal((await setLook('broken-test-look')).id, 'toon');
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /no-such-look/);
    assert.match(warnings[1], /broken-test-look.*toon/);
  } finally {
    LOOKS.pop();
    console.warn = warn;
    delete globalThis.document;
    activateLook(lookById('toon'));
  }
});

test('outlines: false is none, true as drawn, a number a multiplier', () => {
  assert.equal(outlineScale({ outlines: false }), 0);
  assert.equal(outlineScale({ outlines: true }), 1);
  assert.equal(outlineScale({ outlines: 2.5 }), 2.5);
});

test('linearise decodes sRGB colours and unlinearise restores the authored values exactly', () => {
  // A stand-in for THREE: only what the kit touches.
  class Color {
    constructor(hex) {
      this.r = ((hex >> 16) & 255) / 255;
      this.g = ((hex >> 8) & 255) / 255;
      this.b = (hex & 255) / 255;
    }
    isColor = true;
    convertSRGBToLinear() {
      for (const channel of ['r', 'g', 'b']) this[channel] = this[channel] < 0.04045 ? this[channel] * 0.0773993808 : ((this[channel] * 0.9478672986 + 0.0521327014) ** 2.4);
      return this;
    }
    toArray() {
      return [this.r, this.g, this.b];
    }
    fromArray([r, g, b]) {
      Object.assign(this, { r, g, b });
      return this;
    }
  }
  const noop = function () {};
  globalThis.THREE = { sRGBEncoding: 3001, LinearEncoding: 3000, Material: { prototype: { onBeforeCompile: noop } } };
  try {
    const material = { color: new Color(0x5f7f3a), emissive: new Color(0), userData: {}, map: { encoding: 3000 }, vertexColors: false, onBeforeCompile: noop };
    linearise(material);
    assert.ok(material.color.g < 0.25, 'the green of 0x7f is about 0.21 in linear light, not 0.5');
    assert.equal(material.map.encoding, 3001);
    linearise(material);
    assert.ok(Math.abs(material.color.g - 0.2122) < 0.001, 'a second pass does not decode twice');
    unlinearise(material);
    assert.deepEqual([material.color.r, material.color.g, material.color.b], [0x5f / 255, 0x7f / 255, 0x3a / 255]);
    assert.equal(material.map.encoding, 3000);
  } finally {
    delete globalThis.THREE;
  }
});

test('the bundle carries the kit, the registry and every look file, and refuses duplicate names', () => {
  const bundler = readFileSync(new URL('../tools/bundle.js', import.meta.url), 'utf8');
  for (const name of ['looks/kit', 'looks', 'looksbench', ...LOOKS.map((look) => `looks/${look.id}`)]) assert.ok(bundler.includes(`'${name}'`), `${name} is not in tools/bundle.js MODULES`);
  const out = join(mkdtempSync(join(tmpdir(), 'looks-bundle-')), 'gladiator.html');
  // The bundler throws if two modules declare one top-level name or a module does not compile.
  execFileSync('node', ['tools/bundle.js', out], { cwd: new URL('..', import.meta.url).pathname, stdio: 'pipe' });
  const page = readFileSync(out, 'utf8');
  for (const name of ['looks/kit', 'looks', 'looksbench', ...LOOKS.map((look) => `looks/${look.id}`)]) assert.ok(page.includes(`// ---- src/${name}.js ----`), `${name} is not in the bundle`);
  assert.ok(page.indexOf('src/looks/kit.js') < page.indexOf('src/looks/toon.js') && page.indexOf('src/looks.js') < page.indexOf('src/toon.js'), 'the registry loads before toon.js, which reads it');
});

test('the dev server names shots safely', () => {
  const script = "import sys; sys.path.insert(0, 'tools'); import serve; print('|'.join(str(serve.shot_filename(n)) for n in ['a.png', '../../etc/passwd', 'x y/z', '', '...', 'colosseum-toon']))";
  const out = execFileSync('python3', ['-c', script], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } }).toString().trim();
  assert.equal(out, 'a.png|passwd.png|z.png|None|None|colosseum-toon.png');
});
