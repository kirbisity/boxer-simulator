// The battle pickers' posters: for each battle of Battle Mode (scenarios.js SCENARIOS), its key units, a few of each side's
// commonest kinds (and a rider, if it has them), set facing each other on the battle's own ground, shot low from the side, and
// graded as The Last Gate's end poster is (lastgateview.js: the sides' colours glowing in from either edge, the head and foot
// darkened, a vignette and grain), saved small as assets/battles/<key>.webp for the cards (src/battlethumbs.js; the bundle
// inlines them). Also the custom battle's card (`custom`) and its grounds' (`map-<place>`: custombattle.js CUSTOM_BATTLE.maps).
// Level Mode's stages keep their stills (tools/battle-thumbs.mjs).
// Usage: python3 tools/serve.py 8988 &   then   node tools/battle-posters.mjs [--port 8988] [--debug 9338] [--chrome <path>] [key...]
// With no keys, every one. It starts its own Chrome on the debug port and stops it after.

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  if (at < 0) return fallback;
  return args.splice(at, 2)[1];
};
const port = option('port', '8988');
const debugPort = option('debug', '9338');
const chromePath = option('chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const plan = JSON.parse(readFileSync('tools/battle-posters.json', 'utf8'));
const { CUSTOM_BATTLE } = await import('../src/custombattle.js');

/** A ground's camera: its battles' own (CUSTOM_BATTLE.maps: yaw, pitch, distance, as render.js orbits), at `mapDistance` of the distance and `mapPitch`. */
function groundCamera(place, shot) {
  const { yaw, distance } = CUSTOM_BATTLE.maps[place].camera;
  const far = distance * shot.mapDistance;
  return { eye: [Math.cos(shot.mapPitch) * Math.cos(yaw) * far, shot.look[1] + Math.sin(shot.mapPitch) * far, Math.cos(shot.mapPitch) * Math.sin(yaw) * far], look: shot.look };
}

const profile = mkdtempSync(join(tmpdir(), 'battle-posters-'));
const chrome = spawn(chromePath, ['--headless=new', '--enable-automation', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--mute-audio', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const stop = () => {
  chrome.kill('SIGKILL');
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // Chrome still letting go of its profile: the system's temporary folder clears it in time.
  }
};
process.on('exit', stop);

async function connect() {
  for (let tries = 0; tries < 60; tries += 1) {
    try {
      return await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`no Chrome on port ${debugPort}`);
}

const target = await connect();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve));
let nextId = 1;
const waiting = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && waiting.has(message.id)) {
    waiting.get(message.id)(message);
    waiting.delete(message.id);
  }
  if (message.method === 'Runtime.exceptionThrown') console.error('page exception:', message.params.exceptionDetails.exception?.description);
});
const send = (method, params = {}) => new Promise((resolve) => {
  const id = nextId++;
  waiting.set(id, resolve);
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const answer = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 600000 });
  const thrown = answer.result?.exceptionDetails ?? answer.error;
  if (thrown) throw new Error(thrown.exception?.description ?? JSON.stringify(thrown));
  return answer.result?.result?.value;
};

// In the page: the UI hidden, the camera taken over, the grade laid over the picture, and `__posterStage(key, shot)` to set
// up a battle's key units on its ground.
const HARNESS = `(async () => {
  const style = document.createElement('style');
  style.textContent = [
    'body > *:not(.arena):not(canvas):not(#poster-grade) { visibility: hidden !important }',
    '#side-pick, .arena > *:not(canvas) { display: none !important } .arena::after, .arena::before { display: none !important }',
    '.arena canvas { filter: contrast(1.12) saturate(1.12) brightness(0.96) }',
    '#poster-grade { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; visibility: visible !important; display: block !important }',
    '#poster-grade > i { position: absolute; inset: 0 }',
  ].join('\\n');
  document.head.appendChild(style);
  const grade = document.createElement('div');
  grade.id = 'poster-grade';
  const layer = (css) => { const each = document.createElement('i'); each.style.cssText = css; grade.append(each); return each; };
  // The sides' colours glowing in from their edges; the light between them; the head and foot darkened; the vignette; grain.
  window.__posterSides = layer('mix-blend-mode: overlay');
  layer('background: radial-gradient(ellipse 45% 55% at 50% 52%, rgba(255, 196, 128, 0.22), rgba(255, 196, 128, 0) 70%); mix-blend-mode: screen');
  layer('background: linear-gradient(180deg, rgba(6, 8, 11, 0.62) 0%, rgba(6, 8, 11, 0) 34%, rgba(6, 8, 11, 0) 60%, rgba(6, 8, 11, 0.88) 100%)');
  layer('background: radial-gradient(ellipse 75% 85% at 50% 48%, rgba(0, 0, 0, 0) 55%, rgba(0, 0, 0, 0.62) 100%)');
  const noise = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="160" height="160" filter="url(%23n)"/></svg>';
  layer('background: url(\\'data:image/svg+xml;utf8,' + noise + '\\'); opacity: 0.14; mix-blend-mode: overlay');
  document.body.append(grade);
  const boxer = window.boxer;
  const renderer = boxer.scene.renderer;
  const draw = renderer.render.bind(renderer);
  renderer.render = (scene, camera) => {
    const shot = window.__posterCam;
    if (shot && camera === boxer.scene.camera) {
      camera.position.set(...shot.eye);
      camera.lookAt(...shot.look);
      camera.fov = shot.fov;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    }
    draw(scene, camera);
  };
  const { battleOf, scenarioFighters } = await import('/src/scenarios.js');
  const { unitOf, unitsOf } = await import('/src/muster.js');
  const { isMounted } = await import('/src/horses.js');
  const { CUSTOM_BATTLE, customLevel, customSetup, customUnitsOf } = await import('/src/custombattle.js');
  /** A side's key men: one of each of its commonest kinds on foot, and one of its riders if it has them. */
  const keyMen = (men, units, foot, riders) => {
    const kinds = new Map();
    for (const man of men) {
      const kind = unitOf(units, man)?.id ?? [man.outfit?.kind, man.style, isMounted(man)].join('.');
      if (!kinds.has(kind)) kinds.set(kind, []);
      kinds.get(kind).push(man);
    }
    const sorted = [...kinds.values()].sort((a, b) => b.length - a.length);
    const onFoot = sorted.filter((kind) => !isMounted(kind[0]));
    // A side all on horse (the steppe's) shows as many riders as another shows men.
    const mounted = sorted.filter((kind) => isMounted(kind[0])).slice(0, onFoot.length ? riders : foot + riders);
    return [...onFoot.slice(0, foot + riders - mounted.length).map((kind) => kind[0]), ...mounted.map((kind) => kind[0])];
  };
  /** Where they stand: the foot in a short slant from near the camera to further off, the riders behind them (or, with no foot, in their place); red on the left. */
  const placesOf = (men, corner, shot) => {
    const sign = corner === 'red' ? -1 : 1;
    const anyFoot = men.some((man) => !isMounted(man));
    let foot = 0;
    let rider = 0;
    return men.map((man) => {
      if (isMounted(man) && anyFoot) return (rider += 1, [sign * (shot.riderAt[0] + (rider - 1) * shot.step[0]), shot.riderAt[1] - (rider - 1) * shot.step[1]]);
      const wide = isMounted(man) ? 1.8 : 1;
      foot += 1;
      return [sign * (shot.apart / 2 + (wide - 1) + (foot - 1) * shot.step[0] * wide), shot.nearest - (foot - 1) * shot.step[1] * wide - (wide - 1) * 2];
    });
  };
  /** Each side's colour glowing in from its edge (\`tint\` over the red and blue of the sides). */
  const sidesGlow = (shot) => {
    const colour = (corner) => shot.tint?.[corner] ?? (corner === 'red' ? 'rgba(214, 38, 32, 0.55)' : 'rgba(46, 104, 232, 0.55)');
    return 'linear-gradient(90deg, ' + colour('red') + ' 0%, rgba(128, 128, 128, 0) 38%, rgba(128, 128, 128, 0) 62%, ' + colour('blue') + ' 100%)';
  };
  window.__posterStage = (key, shot) => {
    let level;
    let cast;
    let setup;
    if (key === 'custom' || key.startsWith('map-')) {
      const map = key === 'custom' ? CUSTOM_BATTLE.first.map : key.slice(4);
      const battle = { map, factions: shot.factions, sides: { red: { men: [] }, blue: { men: [] } }, lead: null };
      level = customLevel(battle);
      cast = Object.fromEntries(['red', 'blue'].map((corner) => [corner, shot.units[corner].map((id) => level.units[corner].find((unit) => unit.id === id).make())]));
      const places = Object.fromEntries(['red', 'blue'].map((corner) => [corner, placesOf(cast[corner], corner, shot)]));
      battle.sides = Object.fromEntries(['red', 'blue'].map((corner) => [corner, { men: cast[corner].map((man, index) => ({ unit: shot.units[corner][index], at: places[corner][index] })), formation: 'hand' }]));
      setup = customSetup(battle);
      key = CUSTOM_BATTLE.key;
    } else {
      level = battleOf(key);
      // A duel (no cast: the ring, the subway) is its own two, where they stand.
      if (!level.cast) {
        // (One a side: the sizes the battle before left are not a duel's.)
        boxer.state.teamSizes.red = 1;
        boxer.state.teamSizes.blue = 1;
        boxer.level(key);
        window.__posterSides.style.background = sidesGlow(shot);
        return Object.fromEntries(['red', 'blue'].map((corner) => [corner, scenarioFighters(level).filter((entry) => entry.corner === corner).map((entry) => entry.inputs.name)]));
      }
      const all = level.cast(Math.random);
      cast = Object.fromEntries(['red', 'blue'].map((corner) => [corner, keyMen(all[corner], level.armies ? unitsOf(level, corner) : [], shot.foot, shot.riders)]));
      setup = { cast, places: Object.fromEntries(['red', 'blue'].map((corner) => [corner, placesOf(cast[corner], corner, shot)])), lead: null };
    }
    boxer.level(key, setup);
    window.__posterSides.style.background = sidesGlow(shot);
    return Object.fromEntries(['red', 'blue'].map((corner) => [corner, cast[corner].map((man) => man.name + (isMounted(man) ? ' (horse)' : ''))]));
  };
  return true;
})()`;

await send('Runtime.enable');
await send('Page.enable');

const keys = args.length ? args : Object.keys(plan).filter((key) => !['_', 'default', 'mapDefault'].includes(key));
const sizes = {};
let loaded = null;
for (const key of keys) {
  const ground = key.startsWith('map-');
  const given = { ...plan.default, ...(ground ? plan.mapDefault : {}), ...plan[key] };
  const shot = ground ? { ...given, ...groundCamera(key.slice(4), given) } : given;
  const [width, height] = shot.size;
  if (loaded !== `${width}x${height}`) {
    await send('Emulation.setDeviceMetricsOverride', { width: width * 2, height: height * 2, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` });
    for (let waited = 0; waited < 60000; waited += 250) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (await evaluate('Boolean(window.boxer && document.readyState === "complete")').catch(() => false)) break;
    }
    await evaluate('boxer.skipIntro(); boxer.adaptiveResolution(false); true');
    await evaluate(HARNESS);
    loaded = `${width}x${height}`;
  }
  const started = Date.now();
  // The same men each run (the casts draw on Math.random): a seeded stand-in, from the key.
  const cast = await evaluate(`(() => {
    let seed = ${[...key].reduce((hash, letter) => (hash * 31 + letter.charCodeAt(0)) >>> 0, 7) + (shot.seed ?? 0)};
    Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    window.__posterCam = ${JSON.stringify({ eye: shot.eye, look: shot.look, fov: shot.fov })};
    const cast = window.__posterStage(${JSON.stringify(key)}, ${JSON.stringify(shot)});
    boxer.finishBuilding();
    boxer.finishSkins();
    return cast;
  })()`);
  // A moment in their guard (the views built, the men settled into their stance), the picture drawn with the camera set.
  await evaluate(`boxer.playFrames(${shot.frames}); boxer.finishSkins(); boxer.playFrames(2); true`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const picture = await send('Page.captureScreenshot', { format: 'webp', quality: shot.quality, clip: { x: 0, y: 0, width: width * 2, height: height * 2, scale: 0.5 } });
  const bytes = Buffer.from(picture.result.data, 'base64');
  writeFileSync(`assets/battles/${key}.webp`, bytes);
  sizes[key] = bytes.length;
  console.log(`${key}: ${(bytes.length / 1024).toFixed(1)} KB, ${((Date.now() - started) / 1000).toFixed(0)} s · ${cast.red.join(', ')} | ${cast.blue.join(', ')}`);
}
console.log(`total ${(Object.values(sizes).reduce((sum, size) => sum + size, 0) / 1024).toFixed(0)} KB`);
socket.close();
process.exit(0);
