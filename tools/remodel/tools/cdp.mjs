// A small Chrome DevTools driver: one tab, evaluate, screenshot.
import { writeFileSync } from 'node:fs';
export async function openTab(port, url, { width = 1400, height = 1000 } = {}) {
  const made = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(made.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  let next = 1; const waiting = new Map(); const errs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waiting.has(d.id)) { const [ok, no] = waiting.get(d.id); waiting.delete(d.id); d.error ? no(new Error(JSON.stringify(d.error))) : ok(d.result); }
    else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errs.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((ok, no) => { const id = next++; waiting.set(id, [ok, no]); ws.send(JSON.stringify({ id, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  for (let i = 0; i < 200; i += 1) { await new Promise((r) => setTimeout(r, 250)); try { if (await evaluate('Boolean(window.boxer && window.boxer.designSheet)')) break; } catch {} }
  const shot = async (file, clip) => { const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); writeFileSync(file, Buffer.from(r.data, 'base64')); };
  const close = async () => { await fetch(`http://127.0.0.1:${port}/json/close/${made.id}`); ws.close(); };
  return { evaluate, shot, close, errs, send };
}
