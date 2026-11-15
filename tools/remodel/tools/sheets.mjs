// node sheets.mjs <before|after> <unit...|all> : front, three-quarter, back, builds, head close-up and a windy motion strip per unit.
import { mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { openTab } from './cdp.mjs';
import { units } from './units.mjs';
const SP = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const [phase, ...want] = process.argv.slice(2);
const only = process.env.ONLY ? process.env.ONLY.split(',') : null; // parts: turn,builds,head,motion
const U = units(`${SP}/casts.json`);
const keys = want[0] === 'all' || !want.length ? Object.keys(U) : want;
const tab = await openTab(9336, process.env.URL ?? 'http://127.0.0.1:8989/index.html');
const HIDE = 'header,footer,.screen,#home,#fight-ui,#hud,.hud,#clock,#ghost-bar,.ghost-bar,#log,#banner,.level-hud,#speeds,.fu-pick,#pause,#restart,#sheet-labels,.arena::after{display:none!important}';
const prepare = async (tab) => {
await tab.evaluate(`(() => { boxer.skipIntro(); boxer.adaptiveResolution?.(false); const s = document.createElement('style'); s.textContent = ${JSON.stringify(HIDE)}; document.head.append(s);
  const r = boxer.scene.renderer; r.__orig = r.render.bind(r);
  r.render = (scene, camera) => { const k = window.__cam; if (k) { camera.position.set(...k.pos); camera.lookAt(...k.look); camera.fov = k.fov || 35; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); } r.__orig(scene, camera); };
  window.__centre = (i) => { const f = boxer.state.world.fighters[i]; let x = 0, y = 0, z = 0, n = f.x.length / 3; for (let p = 0; p < n; p += 1) { x += f.x[p * 3]; y += f.x[p * 3 + 1]; z += f.x[p * 3 + 2]; } return [x / n, y / n, z / n]; };
  window.__top = (i) => { const f = boxer.state.world.fighters[i]; let y = 0; for (let p = 1; p < f.x.length; p += 3) y = Math.max(y, f.x[p]); return y; };
  return 1; })()`);
};
await prepare(tab);
const canvasBox = async (tab_ = tab) => tab_.evaluate(`(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`);
const sheet = async (file, spec, turn, closeUp = null) => {
  await tab.evaluate(`(() => { window.__cam = null; boxer.state.place = 'field'; boxer.designSheet(${JSON.stringify(spec)}, 0, ${JSON.stringify(closeUp)}, ${turn}); boxer.finishSkins?.(); boxer.playFrames(2); return 1; })()`);
  await tab.shot(file, await canvasBox());
};
let warm = false;
for (const key of keys) {
  const unit = U[key];
  if (!unit) { console.log('unknown unit', key); continue; }
  const dir = `${SP}/${key}`; mkdirSync(dir, { recursive: true });
  const n = unit.cols.length;
  const spacing = unit.wide ? 2.4 : 0.95;
  const options = unit.cols.map((inputs, i) => [{ inputs }, unit.labels[i], '']);
  const camera = { distance: (unit.wide ? 5 : 2.6) + 0.75 * Math.max(0, n - 2) * (unit.wide ? 2 : 1), pitch: 0.06, yaw: 0, height: unit.wide ? 1.3 : 0.95 };
  const base = { options, rows: [unit.cols[0]], camera, spacing };
  const does = (part) => !only || only.includes(part);
  if (!warm) { await tab.evaluate(`(() => { boxer.state.game = 'sandbox'; boxer.state.mode = 'watch'; boxer.fight([{ preset: 'light', outfit: { kind: 'commoner', design: 0 } }], [{ preset: 'light', outfit: { kind: 'commoner', design: 0 } }], { seed: 5, distance: 7, place: 'field', paused: true }); boxer.finishBuilding(); return 1; })()`); await sheet(`${SP}/warm.png`, base, 0.5); await sheet(`${SP}/warm.png`, base, 0.5); warm = true; }
  if (does('turn')) for (const [name, turn] of [['front', 0.5], ['threeq', 1.25], ['back', 0.5 + Math.PI], ['side', 0.5 + Math.PI / 2]]) await sheet(`${dir}/${phase}-${name}.png`, base, turn);
  const close = unit.close ?? 0;
  if (does('builds') && unit.builds !== false) {
    const builds = { options: [[{ bmi: 17 }, 'thin', ''], [{ bmi: 24 }, 'ordinary', ''], [{ bmi: 38 }, 'heavy', '']], rows: [unit.cols[close]], camera: { distance: 3.3, pitch: 0.06, yaw: 0, height: 0.95 }, spacing: 1.0 };
    await sheet(`${dir}/${phase}-builds-front.png`, builds, 0.5);
    await sheet(`${dir}/${phase}-builds-back.png`, builds, 0.5 + Math.PI * 0.8);
  }
  if (does('head')) {
    const one = { options: [[{ inputs: unit.cols[close] }, 'x', '']], rows: [unit.cols[close]], camera, spacing };
    const top = unit.cols[close].mounted ? 2.3 : (unit.cols[close].heightCm ?? 170) / 100;
    for (const [name, turn] of [['head-front', 0.5], ['head-threeq', 1.3], ['head-back', 0.5 + Math.PI * 0.85]]) await sheet(`${dir}/${phase}-${name}.png`, one, turn, { column: 0, distance: 1.25, pitch: 0.02, yaw: 0, height: top - 0.2 });
    for (const [name, turn] of [['torso-front', 0.5], ['torso-threeq', 1.3]]) await sheet(`${dir}/${phase}-${name}.png`, one, turn, { column: 0, distance: 1.9, pitch: 0.04, yaw: 0, height: top * 0.62 });
  }
  if (does('motion')) {
    const man = unit.cols[close];
    const main = tab; { const tab = await openTab(9336, process.env.URL ?? 'http://127.0.0.1:8989/index.html'); await prepare(tab);
    await tab.evaluate(`(() => { boxer.state.game = 'sandbox'; boxer.state.mode = 'watch'; boxer.fight([${JSON.stringify(man)}], [{ preset: 'light', outfit: { kind: 'commoner', design: 0 }, style: 'unskilled' }], { seed: 5, distance: 7, place: 'field', paused: true }); boxer.finishBuilding(); boxer.state.speed = 1; boxer.state.accumulator = 0; boxer.finishSkins?.(); return 1; })()`);
    let t = 0;
    const far = man.mounted ? 1.7 : 1;
    for (const at of [0.6, 1.0, 1.4, 1.9, 2.3, 2.7, 3.1, 3.5]) {
      await tab.evaluate(`(() => { boxer.state.paused = false; for (let i = 0; i < 600 && boxer.state.world.time < ${at} - 1e-6; i += 1) boxer.playFrames(1, 1 / 60); boxer.state.paused = true; const c = __centre(0), o = __centre(1); const dx = o[0] - c[0], dz = o[2] - c[2], d = Math.hypot(dx, dz) || 1;
        // From the man's front left quarter, a little above the belt.
        const ax = dx / d, az = dz / d; const px = c[0] + (ax * 2.0 - az * 2.2) * ${far}, pz = c[2] + (az * 2.0 + ax * 2.2) * ${far};
        window.__cam = { pos: [px, c[1] + 0.35, pz], look: [c[0], c[1] + 0.05, c[2]], fov: 38 }; boxer.playFrames(1, 0); return 1; })()`);
      t = at;
      await tab.shot(`${dir}/${phase}-motion-${String(Math.round(at * 10)).padStart(2, '0')}.png`, await canvasBox(tab));
    }
    main.errs.push(...tab.errs); await tab.close(); }
  }
  // One contact sheet per unit.
  execFileSync('python3', [`${SP}/tools/contact.py`, dir, phase], { stdio: 'inherit' });
  console.log(key, 'ERRS', JSON.stringify(tab.errs.splice(0)));
}
await tab.close();
