// The back's outline at the midline (z within 15 mm), by height: the outermost point of each role (x min), every 15 mm.
// node backline.mjs <repo> <preset> <kind> <design> <bmi> <y0,y1> [side: back|front|left]
const [repo, presetName, kind, design, bmiArg, ys, side = 'back'] = process.argv.slice(2);
const { buildBody, PRESETS, FRAMES, normaliseInputs } = await import(`${repo}/src/body.js`);
const { buildSkinMesh } = await import(`${repo}/src/bodystyles.js`);
const { caloriesForWeight } = await import(`${repo}/src/physiology.js`);
const base = normaliseInputs(structuredClone(PRESETS[presetName]));
const h = base.heightCm / 100;
const inputs = { ...base, calories: Math.round(caloriesForWeight(base, Number(bmiArg) * h * h, FRAMES[base.frame].lean)), outfit: { kind, design: Number(design) }, accessories: [] };
globalThis.__T1 = process.env.T1 === '1'; globalThis.__probe = {}; buildSkinMesh(buildBody(inputs), 'base'); const mesh = globalThis.__probe.mesh;
const P = mesh.positions; const [y0, y1] = ys.split(',').map(Number);
const used = new Uint8Array(P.length / 3); for (const i of mesh.indices) used[i] = 1;
const rows = new Map();
for (let v = 0; v < P.length / 3; v += 1) {
  if (!used[v] || mesh.underLayer?.has(v)) continue;
  const [x, y, z] = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
  const [out, across] = side === 'back' ? [-x, z] : side === 'front' ? [x, z] : [z, x];
  if (Math.abs(across) > 0.015 || y < y0 || y > y1 || out < 0) continue;
  const row = Math.round(y / 0.015);
  const r = mesh.ringOf.get(v); const key = `${mesh.colors[v]}${r ? '@' + r.piece : ''}`;
  let m = rows.get(row); if (!m) rows.set(row, m = {});
  m[key] = Math.max(m[key] ?? 0, out);
}
for (const row of [...rows.keys()].sort((a, b) => b - a)) console.log((row * 15).toString().padStart(5), Object.entries(rows.get(row)).sort((a, b) => b[1] - a[1]).map(([k, o]) => `${k}:${(o * 1000).toFixed(0)}`).join(' '));
