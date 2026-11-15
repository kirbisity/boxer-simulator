// The trailer pipeline's hands on the game: the dev server (tools/serve.py) and a Chrome of its own (a separate profile, remote debugging),
// started when they are not already up, and one page driven over the DevTools protocol. Not part of the game.
//
// Viewports: 'phone' lays the page out as a 405x720 phone and draws it at 1080x1920 (the HUD the size it is on a phone); the frame is
// always 1080x1920.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const CONFIG = {
  port: Number(process.env.TRAILER_PORT ?? 8935),
  debugPort: Number(process.env.TRAILER_DEBUG_PORT ?? 9333),
  chrome: process.env.TRAILER_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  // The phone the HUD is laid out for (CSS px) and the frame (px).
  phone: { width: 405, height: 720 },
  frame: { width: 1080, height: 1920 },
  jpegQuality: 94,
};

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const up = async (url) => { try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } };

/** The dev server and the Chrome, started if they are not running. `root`: the repository (served at /). `profile`: Chrome's own folder. */
export async function ensureRunning({ root, profile }) {
  if (!(await up(`http://localhost:${CONFIG.port}/`))) {
    spawn('python3', ['tools/serve.py', String(CONFIG.port)], { cwd: root, detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 40 && !(await up(`http://localhost:${CONFIG.port}/`)); i += 1) await sleep(250);
  }
  if (!(await up(`http://127.0.0.1:${CONFIG.debugPort}/json/version`))) {
    mkdirSync(profile, { recursive: true });
    spawn(CONFIG.chrome, [`--user-data-dir=${profile}`, `--remote-debugging-port=${CONFIG.debugPort}`, '--no-first-run', '--no-default-browser-check',
      '--window-size=600,1040', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--autoplay-policy=no-user-gesture-required', 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 60 && !(await up(`http://127.0.0.1:${CONFIG.debugPort}/json/version`)); i += 1) await sleep(250);
  }
}

/** A fresh tab, driven. Close it with `page.close()`. */
export async function openPage() {
  const base = `http://127.0.0.1:${CONFIG.debugPort}`;
  const target = await (await fetch(`${base}/json/new?about:blank`, { method: 'PUT' })).json();
  // In front, alone: a tab behind another is throttled (its frames drawn late, its screenshots slow).
  for (const other of await (await fetch(`${base}/json`)).json()) if (other.type === 'page' && other.id !== target.id) await fetch(`${base}/json/close/${other.id}`).catch(() => {});
  await fetch(`${base}/json/activate/${target.id}`).catch(() => {});
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, bad) => { ws.addEventListener('open', ok, { once: true }); ws.addEventListener('error', bad, { once: true }); });
  let next = 1;
  const waiting = new Map();
  let crashed = false;
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
    if (msg.method === 'Inspector.targetCrashed') { crashed = true; for (const done of waiting.values()) done({ error: { message: 'the page crashed' } }); waiting.clear(); }
  });
  const send = (method, params = {}) => new Promise((ok, bad) => {
    if (crashed) return bad(new Error('the page crashed'));
    const id = next++;
    waiting.set(id, (msg) => (msg.error ? bad(new Error(`${method}: ${msg.error.message}`)) : ok(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable');
  await send('Inspector.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const page = {
    send,
    async viewport(kind = 'phone') {
      const css = kind === 'phone' ? CONFIG.phone : { width: CONFIG.frame.width / 2, height: CONFIG.frame.height / 2 };
      await send('Emulation.setDeviceMetricsOverride', { width: css.width, height: css.height, deviceScaleFactor: CONFIG.frame.width / css.width, mobile: false });
    },
    async goto(url, { waitFor = null, timeout = 30000 } = {}) {
      await send('Page.navigate', { url });
      const started = Date.now();
      for (;;) {
        await sleep(300);
        try {
          if (await page.eval(waitFor ?? 'document.readyState === "complete"')) return;
        } catch { /* still loading */ }
        if (Date.now() - started > timeout) throw new Error(`${url}: not ready in ${timeout} ms`);
      }
    },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async shot(file, { png = false, transparent = false } = {}) {
      if (transparent) await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
      const r = await send('Page.captureScreenshot', png ? { format: 'png' } : { format: 'jpeg', quality: CONFIG.jpegQuality });
      writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    async close() {
      try { ws.close(); } catch { /* gone */ }
      await fetch(`${base}/json/close/${target.id}`).catch(() => {});
    },
    get crashed() { return crashed; },
  };
  return page;
}

/** Frames of a take into `dir` (f00000.jpg ...), stepping the game per `segments` ([{ frames, dt }]); the events heard, by video time. */
export async function recordSegments(page, dir, segments, { fps = 60 } = {}) {
  mkdirSync(dir, { recursive: true });
  await page.eval('window.TC.mark()');
  const events = [];
  let index = 0;
  for (const { frames, dt = 1 / fps } of segments) {
    for (let k = 0; k < frames; k += 1) {
      const heard = await page.eval(`window.TC.step(${dt})`);
      for (const e of heard) events.push({ t: +(index / fps).toFixed(4), slow: dt < 1 / fps - 1e-6, ...e });
      await page.shot(join(dir, `f${String(index).padStart(5, '0')}.jpg`));
      index += 1;
    }
  }
  return { frames: index, events };
}

export const exists = existsSync;
