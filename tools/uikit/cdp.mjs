// A small Chrome DevTools Protocol driver for screenshots (headless Chrome on 9344).
// (Working tool of the interface overhaul: tools/uikit/ is read by nothing in the game and can be dropped.)
// Needs a headless Chrome with --remote-debugging-port (CDP_PORT, default 9344) and the site served (tools/serve.py).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = Number(process.env.CDP_PORT ?? 9344);

export async function openPage({ width = 1440, height = 900, mobile = false, scale = 1, url = 'about:blank' } = {}) {
  const target = await (await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 1;
  const waiting = new Map();
  const logs = [];
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && waiting.has(data.id)) {
      const { resolve, reject } = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.error) reject(new Error(JSON.stringify(data.error))); else resolve(data.result);
    } else if (data.method === 'Runtime.exceptionThrown') {
      logs.push(`EXCEPTION ${data.params.exceptionDetails?.exception?.description ?? data.params.exceptionDetails?.text}`);
    } else if (data.method === 'Runtime.consoleAPICalled' && (data.params.type === 'error' || data.params.type === 'warning')) {
      logs.push(`${data.params.type}: ${data.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ')}`.slice(0, 400));
    }
  };
  const send = (method, params = {}, timeout = 90000) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`CDP ${method} timed out`)); }, timeout);
    waiting.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  const page = {
    send, logs, width, height,
    async size(w, h, isMobile = mobile, dpr = scale) {
      page.width = w; page.height = h;
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: isMobile });
      await send('Emulation.setTouchEmulationEnabled', { enabled: isMobile });
    },
    async goto(address) {
      await send('Page.navigate', { url: address });
      await page.wait(600);
    },
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    async eval(expression, { awaitPromise = true } = {}) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
      if (result.exceptionDetails) throw new Error(`eval failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}\n${expression.slice(0, 200)}`);
      return result.result.value;
    },
    async until(expression, timeout = 30000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (await page.eval(expression)) return true;
        await page.wait(150);
      }
      throw new Error(`timed out waiting for ${expression}`);
    },
    async shot(file, { clip = null } = {}) {
      const params = { format: 'png', captureBeyondViewport: false };
      if (clip) params.clip = { ...clip, scale: 1 };
      const { data } = await send('Page.captureScreenshot', params);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    },
    async click(selector, index = 0) {
      return page.eval(`(() => { const node = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!node) return false; node.click(); return true; })()`);
    },
    async close() {
      try { await send('Page.close'); } catch { /* gone */ }
      ws.close();
    },
  };
  await page.size(width, height, mobile, scale);
  if (url !== 'about:blank') await page.goto(url);
  return page;
}
