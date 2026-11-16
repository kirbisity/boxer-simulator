// The top bands of a coat's trunk piece after the fit: node bandprobe.mjs <repo> <preset> <kind> <design> <bmi> [role]
const [repo, presetName, kind, design, bmiArg = '24', role = 'cloth2'] = process.argv.slice(2);
const { buildBody, PRESETS, FRAMES, normaliseInputs } = await import(`${repo}/src/body.js`);
const { buildSkinMesh } = await import(`${repo}/src/bodystyles.js`);
const { caloriesForWeight } = await import(`${repo}/src/physiology.js`);
const base = normaliseInputs(structuredClone(PRESETS[presetName]));
const h = base.heightCm / 100;
const inputs = { ...base, calories: Math.round(caloriesForWeight(base, Number(bmiArg) * h * h, FRAMES[base.frame].lean)), outfit: { kind, design: Number(design) }, accessories: [] };
globalThis.__probe = {}; buildSkinMesh(buildBody(inputs), "base"); const mesh = globalThis.__probe.mesh;
const P = mesh.positions;
const pieces = new Map();
for (const [v, ring] of mesh.ringOf) {
  let p = pieces.get(ring.piece); if (!p) pieces.set(ring.piece, p = new Map());
  let r = p.get(ring); if (!r) p.set(ring, r = []); r.push(v);
}
const at = (v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
for (const [piece, rings] of pieces) {
  const list = [...rings.entries()];
  if (list.length < 3) continue;
  const r0 = list[0][1];
  const top = list[0][0];
  if (mesh.colors[r0[0]] !== role && mesh.colors[r0[Math.floor(r0.length / 2)]] !== role) continue;
  console.log('piece', piece, 'rings', list.length, 't', list.map(([r]) => r.t.toFixed(2)).join(' '), 'colors0', mesh.colors[r0[0]]);
  const n = r0.length;
  for (let s = 0; s < n; s += Math.max(1, Math.floor(n / 16))) {
    const a = mesh.ringA[r0[s]];
    const rows = [0, 1, 2, 3].map((k) => at(list[k][1][s]));
    const d = (x, y) => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 1000;
    console.log(`  a ${(a * 180 / Math.PI).toFixed(0).padStart(4)} y0 ${(rows[0][1] * 1000).toFixed(0)} band01 ${d(rows[0], rows[1]).toFixed(0)} band12 ${d(rows[1], rows[2]).toFixed(0)} band23 ${d(rows[2], rows[3]).toFixed(0)} col ${mesh.colors[list[0][1][s]]}/${mesh.colors[list[1][1][s]]}`);
  }
}
