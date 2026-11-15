// Which worn points are left out under others, by part/role/piece and height: node hidden.mjs <repo> <preset> <bmi>
const [repo, presetName = 'knight', bmiArg = '24'] = process.argv.slice(2);
const { buildBody, PRESETS, FRAMES, normaliseInputs } = await import(`${repo}/src/body.js`);
const { buildSkinMesh } = await import(`${repo}/src/bodystyles.js`);
const { caloriesForWeight } = await import(`${repo}/src/physiology.js`);
const base = normaliseInputs(structuredClone(PRESETS[presetName]));
const h = base.heightCm / 100;
globalThis.__fitDump = [];
globalThis.__meshDump = [];
const mesh = buildSkinMesh(buildBody({ ...base, calories: Math.round(caloriesForWeight(base, Number(bmiArg) * h * h, FRAMES[base.frame].lean)) }), 'base');
console.log(Object.keys(mesh).join(' '));

console.log(typeof mesh.hiddenTriangles, mesh.hiddenTriangles?.length ?? mesh.hiddenTriangles?.size, mesh.covered?.length);
const [y0, y1] = (process.argv[5] ?? '0.84,0.93').split(',').map(Number);
const P = mesh.positions; const I = mesh.indices;
const roleAt = (index) => mesh.regions[I[index]];
const hid = mesh.hiddenTriangles instanceof Set ? (t) => mesh.hiddenTriangles.has(t) : (t) => Boolean(mesh.hiddenTriangles?.[t]);
const tally = new Map();
for (let i = 0; i < I.length; i += 3) {
  const c = [0, 1, 2].map((a) => (P[I[i] * 3 + a] + P[I[i + 1] * 3 + a] + P[I[i + 2] * 3 + a]) / 3);
  if (c[1] < y0 || c[1] > y1) continue;
  if (Math.abs(c[2]) > 0.2 && c[1] > 0.9) continue; const k = `${roleAt(i)}`;
  const g = tally.get(k) ?? tally.set(k, { n: 0, z: [9, -9], x: [9, -9] }).get(k);
  g.n += 1; g.z = [Math.min(g.z[0], c[2]), Math.max(g.z[1], c[2])]; g.x = [Math.min(g.x[0], c[0]), Math.max(g.x[1], c[0])];
}
for (const [k, g] of [...tally].sort()) console.log(k.padEnd(24), String(g.n).padStart(4), 'z', g.z.map((v) => (v * 1000).toFixed(0)).join('..'), 'x', g.x.map((v) => (v * 1000).toFixed(0)).join('..'));
