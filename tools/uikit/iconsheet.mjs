// A contact sheet of every drawn icon (uiicons.js) at 16, 22, 28 and 64 px: node tools/uikit/iconsheet.mjs <out.png> [names,comma]
// (Working tool of the interface overhaul; nothing in the game reads this folder, and it can be dropped.)
import { openPage } from './cdp.mjs';
const [out, only] = process.argv.slice(2);
const page = await openPage({ width: 1500, height: 1000, scale: 2 });
await page.goto(process.env.SITE ?? 'http://localhost:8994/index.html');
await page.until('Boolean(window.boxer)', 60000);
await page.eval(`(async () => {
  const m = await import('/src/uiicons.js?' + Date.now());
  const names = ${only ? JSON.stringify(only.split(',')) : 'm.UI_ICON_NAMES'};
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#1b1712;color:#e8dcc0;overflow:auto;padding:14px;display:grid;grid-template-columns:repeat(6,1fr);gap:10px;font:11px system-ui';
  for (const name of names) {
    const cell = document.createElement('div');
    cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;border:1px solid #3a3226;padding:6px';
    const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:flex-end;gap:10px';
    for (const size of [16, 22, 28, 64]) { const s = document.createElement('span'); s.style.cssText = 'width:' + size + 'px;height:' + size + 'px;display:block'; s.innerHTML = m.uiIconMarkup(name) ?? '?'; s.firstChild.style && (s.firstChild.style.cssText = 'width:100%;height:100%;display:block'); row.append(s); }
    const label = document.createElement('div'); label.textContent = name;
    cell.append(row, label); host.append(cell);
  }
  document.body.append(host);
})()`);
await page.wait(500);
await page.shot(out);
console.log([...new Set(page.logs)].slice(0, 5).join(' | '));
await page.close();
