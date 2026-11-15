// node zoomu.mjs <out-prefix> <url> <unit> <col> <build> <shots: turn,distance,height,lookY;...> : one unit's man close, several views.
import { openTab } from './cdp.mjs';
import { units } from './units.mjs';
const SP = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const WT = '/Users/yanlinzhu/Documents/unix_workspace/boxer-simulator/.claude/worktrees/agent-a48fadadcf3037dd6';
const { FRAMES, normaliseInputs } = await import(`${WT}/src/body.js`);
const { caloriesForWeight } = await import(`${WT}/src/physiology.js`);
const [out, url, key, col, buildArg, shotsArg] = process.argv.slice(2);
const U = units(`${SP}/casts.json`);
const BUILDS = { ordinary: { bmi: 24 }, thin: { bmi: 18 }, muscular: { bmi: 28, exercise: 0.95 }, fat: { bmi: 36, exercise: 0.15 }, heavy: { bmi: 38 }, asis: null };
const built = (man, b) => {
  if (!b) return structuredClone(man);
  const { bmi, exercise } = b; const base = normaliseInputs(structuredClone(man));
  if (exercise !== undefined) base.exercise = exercise;
  const h = base.heightCm / 100;
  return { ...structuredClone(man), ...(exercise !== undefined ? { exercise } : {}), calories: Math.round(caloriesForWeight(base, bmi * h * h, FRAMES[base.frame].lean)) };
};
const tab = await openTab(9350, url, { width: 900, height: 900 });
const HIDE = 'header,footer,.screen,#home,#fight-ui,#hud,.hud,#clock,#ghost-bar,.ghost-bar,#log,#banner,.level-hud,#speeds,.fu-pick,#pause,#restart,#sheet-labels,.arena::after{display:none!important}';
await tab.evaluate(`(() => { ${process.env.PRE ?? ""}; boxer.skipIntro(); boxer.adaptiveResolution?.(false); const s = document.createElement('style'); s.textContent = ${JSON.stringify(HIDE)}; document.head.append(s); boxer.bodyStyle('base');
  const r = boxer.scene.renderer; r.__orig = r.render.bind(r);
  r.render = (scene, camera) => { const k = window.__cam; if (k) { camera.position.set(...k.pos); camera.lookAt(...k.look); camera.fov = k.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); } r.__orig(scene, camera); };
  boxer.state.game = 'sandbox'; boxer.state.mode = 'watch'; boxer.fight([{ preset: 'light', outfit: { kind: 'commoner', design: 0 } }], [{ preset: 'light', outfit: { kind: 'commoner', design: 0 } }], { seed: 5, distance: 7, place: 'field', paused: true }); boxer.finishBuilding(); return 1; })()`);
const box = async () => tab.evaluate(`(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`);
const inputs = built(U[key].cols[Number(col)], BUILDS[buildArg]); if (process.env.BARE_HEAD) inputs.outfit.bareHead = true;
const spec = { options: [[{ inputs }, 'x', '']], rows: [inputs], camera: { distance: 4.6, pitch: 0.03, yaw: 0, height: 0.98 }, spacing: 1 };
let n = 0;
for (const s of ['0,3,1,1', ...shotsArg.split(';')]) {
  const [turn, distance, height, lookY] = s.split(',').map(Number);
  await tab.evaluate(`(() => { window.__cam = null; boxer.state.place = 'field'; boxer.designSheet(${JSON.stringify(spec)}, 0, null, ${process.env.ORBIT ? 0 : turn}); boxer.finishSkins?.(); boxer.playFrames(2); window.__cam = { pos: ${process.env.ORBIT ? `[${distance * Math.cos(turn)}, ${height}, ${distance * Math.sin(turn) + 0.001}]` : `[${distance}, ${height}, 0.001]`}, look: [0, ${lookY}, 0], fov: 30 }; boxer.playFrames(1, 0); return 1; })()`);
  // The sheet puts the man at the origin facing +x turned by `turn`; the camera looks from +x.
  if (n > 0) await tab.shot(`${out}-${n}.png`, await box()); n += 1;
}
console.log(key, 'ERRS', JSON.stringify(tab.errs.splice(0)));
await tab.close();
