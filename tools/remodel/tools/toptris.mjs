// Drawn triangles of one role in a box of the bind pose, with each corner's part, piece and ring t: node toptris.mjs <repo> <preset> <bmi> <role> <y0,y1> <z0,z1>
const [repo, presetName, bmiArg, role, ys, zs] = process.argv.slice(2);
const { buildBody, PRESETS, FRAMES, normaliseInputs } = await import(`${repo}/src/body.js`);
const { buildSkinMesh } = await import(`${repo}/src/bodystyles.js`);
const { caloriesForWeight } = await import(`${repo}/src/physiology.js`);
const base = normaliseInputs(structuredClone(PRESETS[presetName]));
const h = base.heightCm / 100;
globalThis.__fitDump = [];
const mesh = buildSkinMesh(buildBody({ ...base, calories: Math.round(caloriesForWeight(base, Number(bmiArg) * h * h, FRAMES[base.frame].lean)) }), 'base');
const [y0, y1] = ys.split(',').map(Number); const [z0, z1] = zs.split(',').map(Number);
const P = mesh.positions; const I = mesh.indices;
const tally = new Map();
for (let i = 0; i < I.length; i += 3) {
  if (mesh.regions[I[i]] !== role) continue;
  const c = [0, 1, 2].map((a) => (P[I[i] * 3 + a] + P[I[i + 1] * 3 + a] + P[I[i + 2] * 3 + a]) / 3);
  if (c[1] < y0 || c[1] > y1 || c[2] < z0 || c[2] > z1 || c[0] < 0) continue;
  const key = [0, 1, 2].map((k) => { const r = mesh.ringOf?.get(I[i + k]); return r ? `${r.piece}@${r.t.toFixed(2)}${mesh.underLayer?.has(I[i + k]) ? 'h' : ''}` : '?'; }).sort().join(' ');
  tally.set(key, (tally.get(key) ?? 0) + 1);
}
for (const [k, n] of [...tally].sort()) console.log(n, k);
