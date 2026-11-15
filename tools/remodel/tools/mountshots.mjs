// node mountshots.mjs <before|after> [url] : each mounted man alone, close on the rider from the saddle up, four turns
// (front, three-quarter, side, back) and a low side view of the skirt over the saddle, to <SP>/mounted1/<unit>-<phase>-<n>.png.
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const SP = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const [phase, url = 'http://127.0.0.1:8990/cur/index.html'] = process.argv.slice(2);
mkdirSync(`${SP}/mounted1`, { recursive: true });
// turn, distance, camera height, look height (the man sits about 1.2-2.3 m up)
const shots = '0.7,3.4,2.0,1.6;1.57,3.4,1.9,1.55;2.4,3.4,2.0,1.6;3.14,3.4,2.0,1.6;1.57,2.4,1.4,1.4';
for (const unit of (process.env.UNITS ?? 'mBayara,mLamellar,mConquistador,mKnight').split(',')) {
  const out = execFileSync('node', [`${SP}/tools/zoomu.mjs`, `${SP}/mounted1/${unit}-${phase}`, url, unit, '0', 'asis', shots], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, ORBIT: '1' } });
  process.stdout.write(out);
}
