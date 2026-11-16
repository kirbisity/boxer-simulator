// Vertices of a box of the bind pose by role and piece@t: node regionprobe.mjs <repo> <preset> <kind> <design> <bmi> <x0,x1> <y0,y1> <z0,z1>
const [repo, presetName, kind, design, bmiArg, xs, ys, zs] = process.argv.slice(2);
const { buildBody, PRESETS, FRAMES, normaliseInputs } = await import(`${repo}/src/body.js`);
const { buildSkinMesh } = await import(`${repo}/src/bodystyles.js`);
const { caloriesForWeight } = await import(`${repo}/src/physiology.js`);
const base = normaliseInputs(structuredClone(PRESETS[presetName]));
const h = base.heightCm / 100;
const inputs = { ...base, calories: Math.round(caloriesForWeight(base, Number(bmiArg) * h * h, FRAMES[base.frame].lean)), outfit: { kind, design: Number(design) }, accessories: [] };
globalThis.__T1 = process.env.T1 === "1"; globalThis.__probe = {}; buildSkinMesh(buildBody(inputs), 'base'); const mesh = globalThis.__probe.mesh;
const [x0, x1] = xs.split(',').map(Number), [y0, y1] = ys.split(',').map(Number), [z0, z1] = zs.split(',').map(Number);
const P = mesh.positions; const tally = new Map();
const used = new Uint8Array(P.length / 3); for (const i of mesh.indices) used[i] = 1;
for (let v = 0; v < P.length / 3; v += 1) {
  const [x, y, z] = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
  if (!used[v] || x < x0 || x > x1 || y < y0 || y > y1 || z < z0 || z > z1) continue;
  const r = mesh.ringOf.get(v);
  const key = `${mesh.colors[v]} ${r ? `${r.piece}@${r.t.toFixed(2)}` : '?'}${mesh.underLayer?.has(v) ? 'h' : ''}`;
  const e = tally.get(key) ?? { n: 0, xmin: 1e9, y: 0 }; e.n += 1; if (x < e.xmin) { e.xmin = x; e.y = y; } tally.set(key, e);
}
for (const [k, e] of [...tally].sort()) console.log(e.n, k, 'xmin', (e.xmin * 1000).toFixed(0), "y", (e.y * 1000).toFixed(0));
