// Drive the game in headless Chrome over CDP: load the page, inject harness.js, run the shot list, save JPEGs and numbers.
// Usage: node drive.mjs <debugPort> <pageUrl> <outDir> [step...]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [debugPort, pageUrl, outDir, ...steps] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));

const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
const socket = new WebSocket(targets.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve));
let nextId = 1;
const waiting = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && waiting.has(message.id)) {
    waiting.get(message.id)(message);
    waiting.delete(message.id);
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') console.error('page:', message.params.args.map((a) => a.value ?? a.description).join(' '));
  if (message.method === 'Runtime.exceptionThrown') console.error('page exception:', message.params.exceptionDetails.exception?.description);
});
const send = (method, params = {}) => new Promise((resolve) => {
  const id = nextId++;
  waiting.set(id, resolve);
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const answer = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 600000 });
  if (answer.result?.exceptionDetails) throw new Error(answer.result.exceptionDetails.exception?.description ?? JSON.stringify(answer.result.exceptionDetails));
  return answer.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: pageUrl });
for (let waited = 0; waited < 60000; waited += 250) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (await evaluate('Boolean(window.__looks && window.__photoFaces)').catch(() => false)) break;
}
await evaluate(readFileSync(join(here, 'harness.js'), 'utf8'));
for (const step of steps) {
  const started = Date.now();
  const result = await evaluate(`window.__faceHarness.run(${JSON.stringify(step)})`);
  for (const shot of result.shots ?? []) {
    writeFileSync(join(outDir, `${shot.name}.jpg`), Buffer.from(shot.dataUrl.split(',')[1], 'base64'));
    delete shot.dataUrl;
  }
  console.log(JSON.stringify({ step, ms: Date.now() - started, ...result }));
}
socket.close();
process.exit(0);
