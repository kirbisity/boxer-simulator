// node wearshots.mjs <label> <url> [unit...] : each unit's ordinary man alone on the field, one place and light, a full figure
// and close shots of the torso (front, back): SP/wear/shots/<unit>-<shot>-<label>.png. For clean | worn comparisons.
import { mkdirSync } from 'node:fs';
import { openTab } from './cdp.mjs';
import { units } from './units.mjs';
const SP = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const WT = '/Users/yanlinzhu/Documents/unix_workspace/boxer-simulator/.claude/worktrees/unit-remodel';
const { FRAMES, normaliseInputs } = await import(`${WT}/src/body.js`);
const { caloriesForWeight } = await import(`${WT}/src/physiology.js`);
const [label, url, ...want] = process.argv.slice(2); const style = 'base';
const U = units(`${SP}/casts.json`);
const keys = want.length ? want : ['knight'];
const BUILDS = { ordinary: { bmi: 24 }, thin: { bmi: 18 }, muscular: { bmi: 28, exercise: 0.95 }, fat: { bmi: 36, exercise: 0.15 } };
const builds = ['ordinary'];
// [turn, how near (share of the full shot's distance), the height looked at]
const SHOTS = { full: [0.5, 1, 1.02], torso: [0.5, 0.36, 1.3], torsoBack: [0.5 + Math.PI, 0.36, 1.3], legs: [0.9, 0.4, 0.62] };
const VIEWS = { front: 0.5, side: 0.5 + Math.PI / 2, back: 0.5 + Math.PI };
const built = (man, { bmi, exercise }) => {
  const base = normaliseInputs(structuredClone(man));
  if (exercise !== undefined) base.exercise = exercise;
  const h = base.heightCm / 100;
  return { ...structuredClone(man), ...(exercise !== undefined ? { exercise } : {}), calories: Math.round(caloriesForWeight(base, bmi * h * h, FRAMES[base.frame].lean)) };
};
const tab = await openTab(9336, url, { width: 760, height: 1100 });
const HIDE = 'header,footer,.screen,#home,#fight-ui,#hud,.hud,#clock,#ghost-bar,.ghost-bar,#log,#banner,.level-hud,#speeds,.fu-pick,#pause,#restart,#sheet-labels,.arena::after{display:none!important}';
await tab.evaluate(`(() => { boxer.skipIntro(); boxer.adaptiveResolution?.(false); const s = document.createElement('style'); s.textContent = ${JSON.stringify(HIDE)}; document.head.append(s); boxer.bodyStyle(${JSON.stringify(style)});
  const r = boxer.scene.renderer; r.__orig = r.render.bind(r);
  r.render = (scene, camera) => { const k = window.__cam; if (k) { camera.position.set(...k.pos); camera.lookAt(...k.look); camera.fov = k.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); } r.__orig(scene, camera); };
  boxer.state.game = 'sandbox'; boxer.state.mode = 'watch'; boxer.fight([{ preset: 'light', outfit: { kind: 'commoner', design: 0 } }], [{ preset: 'light', outfit: { kind: 'commoner', design: 0 } }], { seed: 5, distance: 7, place: 'field', paused: true }); boxer.finishBuilding(); return boxer.bodyStyle(); })()`);
const box = async () => tab.evaluate(`(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`);
const camera = { distance: 4.6, pitch: 0.03, yaw: 0, height: 0.98 };
const shoot = async (file, options, [turn, near, at], spacing = 1) => {
  const spec = { options, rows: [options[0][0].inputs], camera, spacing };
  await tab.evaluate(`(() => { window.__cam = null; boxer.state.place = 'field'; boxer.designSheet(${JSON.stringify(spec)}, 0, null, ${turn}); boxer.finishSkins?.(); boxer.playFrames(2); const c = boxer.scene.camera; const p = c.position.toArray(), look = [0, ${at}, 0]; window.__cam = { pos: p.map((v, i) => look[i] + (v - look[i]) * ${near}), look, fov: 26.5 }; boxer.playFrames(1, 0); return 1; })()`);
  await tab.shot(file, await box());
};
const dir = `${SP}/wear/shots`; mkdirSync(dir, { recursive: true });
const bare = Boolean(process.env.BARE);
let warm = false;
for (const key of keys) {
  const man = U[key].cols[U[key].close ?? 0];
  for (const build of builds) {
    const inputs = built(man, BUILDS[build]);
    if (bare) { inputs.outfit = { kind: 'mma', design: 0 }; inputs.accessories = []; }
    for (const [view, turn] of Object.entries(SHOTS)) {
      if (!warm) { await shoot(`${SP}/warm.png`, [[{ inputs }, 'x', '']], turn); warm = true; }
      await shoot(`${dir}/${key}-${view}-${label}.png`, [[{ inputs }, 'x', '']], turn);
    }
  }
  if (bare) { const inputs = built(man, BUILDS.ordinary); await shoot(`${dir}/empty-${label}.png`, [[{ inputs }, 'x', ''], [{ inputs }, 'y', '']], 0.5, 60); }
  console.log(key, 'ERRS', JSON.stringify(tab.errs.splice(0)));
}
await tab.close();
