// node studio.mjs <base url> <query> [<query>...] : the repo's body sheet (tools/bodysheet.html) run for each query; the
// pictures land in the served tree's shots/<name>.png.
const [base, ...queries] = process.argv.slice(2);
for (const query of queries) {
  const made = await (await fetch(`http://127.0.0.1:9336/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(made.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  let next = 1; const waiting = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d.result); waiting.delete(d.id); } };
  const send = (method, params = {}) => new Promise((ok) => { const id = next++; waiting.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${base}/tools/bodysheet.html?${query}` });
  let title = '';
  for (let i = 0; i < 600; i += 1) { await new Promise((r) => setTimeout(r, 500)); title = (await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true }))?.result?.value ?? ''; if (/^(done|error)/.test(title)) break; }
  console.log(query, '->', title);
  await fetch(`http://127.0.0.1:9336/json/close/${made.id}`); ws.close();
}
