// node bodysheet.mjs <label> [url] : the bare builds of each sex, front, side and back, whole and from the chest up.
import { mkdirSync } from 'node:fs';
import { openTab } from './cdp.mjs';
const SP = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const [label, url = 'http://127.0.0.1:8989/index.html'] = process.argv.slice(2);
const dir = `${SP}/body/shots`; mkdirSync(dir, { recursive: true });
const tab = await openTab(9336, url, { width: 1600, height: 1000 });
const HIDE = 'header,footer,.screen,#home,#fight-ui,#hud,.hud,#clock,#ghost-bar,.ghost-bar,#log,#banner,.level-hud,#speeds,.fu-pick,#pause,#restart,#sheet-labels,.arena::after{display:none!important}';
await tab.evaluate(`(() => { boxer.skipIntro(); boxer.adaptiveResolution?.(false); const s = document.createElement('style'); s.textContent = ${JSON.stringify(HIDE)}; document.head.append(s); return 1; })()`);
await tab.evaluate(`(() => { boxer.state.game = 'sandbox'; boxer.state.mode = 'watch'; boxer.fight([{ preset: 'light', outfit: { kind: 'commoner', design: 0 } }], [{ preset: 'light', outfit: { kind: 'commoner', design: 0 } }], { seed: 5, distance: 7, place: 'field', paused: true }); boxer.finishBuilding(); return 1; })()`);
const BUILDS = { male: [['thin', 17.5, 0.25], ['ordinary', 22.5, 0.3], ['muscular', 27.5, 0.92], ['fat', 36, 0.1]], female: [['thin', 17, 0.25], ['ordinary', 21.5, 0.3], ['muscular', 24.5, 0.92], ['fat', 36, 0.1]] };
const people = await tab.evaluate(`(async () => { const ph = await import('/src/physiology.js'); const { FRAMES } = await import('/src/body.js'); const out = {};
  for (const [sex, builds] of Object.entries(${JSON.stringify(BUILDS)})) out[sex] = builds.map(([name, bmi, exercise]) => { const heightCm = sex === 'male' ? 178 : 165;
    const inputs = { name, style: 'boxing', sex, heightCm, frame: 'medium', age: 27, exercise, calories: 3000, outfit: { kind: 'mma', design: 0 }, accessories: [], look: { skinTone: 'light', hairStyle: sex === 'male' ? 'buzz' : 'bun', hairColor: '#3a2a1a', facialHair: 'none', eyeColor: 'brown' } };
    inputs.calories = Math.round(ph.caloriesForWeight(inputs, bmi * (heightCm / 100) ** 2, FRAMES.medium.lean)); return inputs; });
  return out; })()`);
const box = async () => tab.evaluate(`(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`);
const shoot = async (file, sex, turn, camera) => {
  const spec = { options: people[sex].map((inputs) => [{ inputs }, inputs.name, '']), rows: [people[sex][0]], camera, spacing: 0.8 };
  await tab.evaluate(`(() => { boxer.state.place = 'field'; boxer.designSheet(${JSON.stringify(spec)}, 0, null, ${turn}); boxer.finishSkins?.(); boxer.playFrames(2); return 1; })()`);
  await tab.shot(file, await box());
};
await shoot(`${dir}/warm.png`, 'male', 0, { distance: 4, pitch: 0.04, yaw: 0, height: 0.95 }); await shoot(`${dir}/warm.png`, 'male', 0, { distance: 4, pitch: 0.04, yaw: 0, height: 0.95 });
for (const sex of ['female', 'male']) for (const [view, turn] of [['front', 0], ['side', Math.PI / 2], ['back', Math.PI]]) {
  const top = sex === 'male' ? 1.78 : 1.65;
  await shoot(`${dir}/${label}-${sex}-${view}-whole.png`, sex, turn, { distance: 4.3, pitch: 0.03, yaw: 0, height: 0.92 });
  await shoot(`${dir}/${label}-${sex}-${view}-top.png`, sex, turn, { distance: 2.5, pitch: 0.0, yaw: 0, height: top - 0.3 });
}
console.log(label, 'ERRS', JSON.stringify(tab.errs.splice(0)));
await tab.close();
