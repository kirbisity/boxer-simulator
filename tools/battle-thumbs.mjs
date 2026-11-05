// The battle pickers' stills: each battle of Battle Mode (scenarios.js SCENARIOS) run in headless Chrome, watched, until its
// moment (tools/battle-thumbs.json), then a close shot of the thick of it saved small as assets/battles/<key>.webp, which the
// menu's cards show (src/battlethumbs.js; the bundle inlines them).
// A Level Mode stage is shot the same way, from a `stage` entry: its player stood at `at` until its men come to him.
// Usage: python3 tools/serve.py 8988 &   then   node tools/battle-thumbs.mjs [--port 8988] [--debug 9338] [--chrome <path>] [key...]
// With no keys, every stage in the data file (the battles' cards are tools/battle-posters.mjs's). THUMB_DEBUG=1 prints what each shot framed. It starts its own Chrome on the debug port and stops it after.

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
const shots = JSON.parse(readFileSync('tools/battle-thumbs.json', 'utf8'));
// With no keys, the stages only: the battles' cards are posters now (tools/battle-posters.mjs); a battle named here is still shot as before.
const keys = args.length ? args : Object.keys(shots).filter((key) => shots[key]?.stage);
// The picture: drawn at twice its size, then halved (a sharper small picture than one drawn small).
const SIZE = { width: 480, height: 270, quality: 72 };

const profile = mkdtempSync(join(tmpdir(), 'battle-thumbs-'));
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
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

// In the page: the UI hidden, the camera taken over for every picture drawn, the clash found.
const HARNESS = `(() => {
  const style = document.createElement('style');
  style.textContent = 'body > *:not(.arena):not(canvas) { visibility: hidden !important } #side-pick, .arena > *:not(canvas) { display: none !important } .arena::after, .arena::before { display: none !important }';
  document.head.appendChild(style);
  const boxer = window.boxer;
  const renderer = boxer.scene.renderer;
  const draw = renderer.render.bind(renderer);
  renderer.render = (scene, camera) => {
    const shot = window.__thumbCam;
    if (shot && camera === boxer.scene.camera) {
      camera.position.set(...shot.eye);
      camera.lookAt(...shot.look);
      camera.fov = shot.fov;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    }
    draw(scene, camera);
  };
  // The men standing (or, when no two foes stand, everyone: a duel's clinch, a man down).
  const men = (anyone) => boxer.state.world.fighters.filter((man) => (anyone || man.state === 'up')).map((man) => ({ corner: man.corner, x: man.x[24], y: man.x[25], z: man.x[26] }));
  const foes = (a, b) => a.corner !== b.corner && a.corner !== 'grey' && b.corner !== 'grey';
  // Where the two sides press hardest: the nearest pair of foes, scored by how many stand near them.
  window.__thumbFocus = (shot, anyone = false) => {
    const all = men(anyone);
    if (shot.focus === 'red' || shot.focus === 'blue') {
      const side = all.filter((man) => man.corner === shot.focus);
      const others = all.filter((man) => foes(man, { corner: shot.focus }));
      const middle = side.reduce((sum, man) => [sum[0] + man.x / side.length, sum[1] + man.z / side.length], [0, 0]);
      const nearestFoe = (man) => others.reduce((best, foe) => (!best || Math.hypot(foe.x - man.x, foe.z - man.z) < Math.hypot(best.x - man.x, best.z - man.z) ? foe : best), null);
      // \`front\`: the side's man nearest a foe, the camera across his line to him; else the man nearest the side's middle.
      const by = shot.front ? (man) => { const foe = nearestFoe(man); return foe ? Math.hypot(foe.x - man.x, foe.z - man.z) : Infinity; } : (man) => Math.hypot(man.x - middle[0], man.z - middle[1]);
      side.sort((a, b) => by(a) - by(b));
      const man = side[shot.man ?? 0];
      if (!man) return anyone ? null : window.__thumbFocus(shot, true);
      const foe = nearestFoe(man);
      return { at: [man.x, man.y, man.z], axis: foe ? Math.atan2(foe.z - man.z, foe.x - man.x) : 0, apart: foe ? by(man) : Infinity };
    }
    let best = null;
    for (const a of all) {
      if (a.corner !== 'red') continue;
      for (const b of all) {
        if (!foes(a, b)) continue;
        const apart = Math.hypot(a.x - b.x, a.z - b.z);
        const mid = [(a.x + b.x) / 2, (a.z + b.z) / 2];
        const near = all.filter((man) => Math.hypot(man.x - mid[0], man.z - mid[1]) < 3.5).length;
        const score = near - apart * 1.5;
        if (!best || score > best.score) best = { score, apart, near, at: [mid[0], Math.max(a.y, b.y), mid[1]], axis: Math.atan2(b.z - a.z, b.x - a.x) };
      }
    }
    return best ?? (anyone ? null : window.__thumbFocus(shot, true));
  };
  return true;
})()`;

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: SIZE.width * 2, height: SIZE.height * 2, deviceScaleFactor: 1, mobile: false });

const sizes = {};
for (const key of keys) {
  const shot = { ...shots.default, ...shots[key] };
  const started = Date.now();
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` });
  for (let waited = 0; waited < 60000; waited += 250) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await evaluate('Boolean(window.boxer && document.readyState === "complete")').catch(() => false)) break;
  }
  // The same men each run (the casts draw on Math.random): a seeded stand-in, from the battle's key.
  await evaluate(`(() => {
    let seed = ${[...key].reduce((hash, letter) => (hash * 31 + letter.charCodeAt(0)) >>> 0, 7) + (shot.seed ?? 0)};
    Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    boxer.skipIntro();
    boxer.adaptiveResolution(false);
    ${shot.stage ? `boxer.levelMode(${JSON.stringify(shot.stage)});` : `boxer.enterLevel(${JSON.stringify(key)}, 'watch');`}
    return true;
  })()`);
  // A Level Mode stage: the player stood at \`at\` (onto the spot, then onto the floor found there, as tools/stageshots.js does).
  if (shot.stage) {
    await evaluate(`(async () => {
      const { floorAt } = await import('/src/physics/terrain.js');
      const [x, y, z] = ${JSON.stringify(shot.at)};
      const level = boxer.levelRun();
      level.put([x, y + 0.3, z], ${shot.facing ?? 0});
      boxer.advance(4 / 60);
      const floor = floorAt(boxer.state.world.arena.terrain, x, z, y + 1.5);
      if (floor != null) level.put([x, floor, z], ${shot.facing ?? 0});
      boxer.advance(10 / 60);
      return true;
    })()`);
  }
  await evaluate(HARNESS);
  // On to the moment, a few frames at a time (the page's own pace: the views built as they come).
  // At least `time` s of the battle; then (a clash) on until two foes are within `close` m and `hold` s more; never past `limit` s.
  const clock = () => evaluate('boxer.playFrames(30); boxer.state.world.time');
  while ((await clock()) < shot.time);
  if (shot.focus === 'clash') {
    while ((await clock()) < shot.limit && !((await evaluate(`window.__thumbFocus(${JSON.stringify(shot)})`))?.apart < shot.close));
    const until = (await clock()) + shot.hold;
    while ((await clock()) < until);
  }
  const focus = await evaluate(`window.__thumbFocus(${JSON.stringify(shot)})`);
  if (!focus) throw new Error(`${key}: nobody standing to frame: ${await evaluate("JSON.stringify(boxer.state.world.fighters.map((man) => [man.corner, man.state]))")}`);
  if (process.env.THUMB_DEBUG) console.log(key, JSON.stringify(focus), await evaluate('JSON.stringify({ time: boxer.state.world.time, up: boxer.state.world.fighters.filter((man) => man.state === "up").length })'));
  const turn = focus.axis + Math.PI / 2 + shot.yaw;
  const eye = [focus.at[0] + Math.cos(turn) * shot.distance, focus.at[1] - 1 + shot.height, focus.at[2] + Math.sin(turn) * shot.distance];
  const look = [focus.at[0], focus.at[1] - 1 + shot.aim, focus.at[2]];
  await evaluate(`window.__thumbCam = ${JSON.stringify({ eye, look, fov: shot.fov })}; boxer.playFrames(${shot.after ?? 2}); true`);
  const picture = await send('Page.captureScreenshot', { format: 'webp', quality: SIZE.quality, clip: { x: 0, y: 0, width: SIZE.width * 2, height: SIZE.height * 2, scale: 0.5 } });
  const bytes = Buffer.from(picture.result.data, 'base64');
  writeFileSync(`assets/battles/${key}.webp`, bytes);
  sizes[key] = bytes.length;
  console.log(`${key}: ${(bytes.length / 1024).toFixed(1)} KB, ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
console.log(`total ${(Object.values(sizes).reduce((sum, size) => sum + size, 0) / 1024).toFixed(0)} KB`);
socket.close();
process.exit(0);
