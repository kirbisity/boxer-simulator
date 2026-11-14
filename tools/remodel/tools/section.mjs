// The z extent per dominant bone and paint role of the edges crossing a height. node section.mjs <repo> <preset> <style> <bmi> <share of trunk above hip> [outfit kind]
const [repo, presetName, style, bmiArg, shareArg, kind] = process.argv.slice(2);
const { buildBody, PRESETS, FRAMES, normaliseInputs } = await import(`${repo}/src/body.js`);
const { buildSkinMesh } = await import(`${repo}/src/bodystyles.js`);
const { caloriesForWeight } = await import(`${repo}/src/physiology.js`);
const { BONES: B } = await import(`${repo}/src/rig.js`); const BONES = Array.isArray(B) ? B.map((b) => b.name ?? b) : Object.keys(B);
const base = normaliseInputs(structuredClone(PRESETS[presetName]));
const h = base.heightCm / 100;
const inputs = { ...base, calories: Math.round(caloriesForWeight(base, Number(bmiArg) * h * h, FRAMES[base.frame].lean)) };
if (kind) { inputs.outfit = { kind, design: 0 }; inputs.accessories = []; }
const body = buildBody(inputs); const mesh = buildSkinMesh(body, style);
const L = body.lengths; const hipY = L.ankle + L.shank + L.thigh; const y = hipY + Number(shareArg) * L.trunk;
const dom = (v) => { let best = 0, bw = -1; for (let k = 0; k < 4; k += 1) if (mesh.skinWeight[v * 4 + k] > bw) { bw = mesh.skinWeight[v * 4 + k]; best = mesh.skinIndex[v * 4 + k]; } return BONES[best]; };
const groups = {};
for (let t = 0; t < mesh.indices.length; t += 3) for (let e = 0; e < 3; e += 1) {
  const a = mesh.indices[t + e], b = mesh.indices[t + (e + 1) % 3];
  const ya = mesh.positions[a * 3 + 1], yb = mesh.positions[b * 3 + 1];
  if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
  const u = (y - ya) / (yb - ya); const z = mesh.positions[a * 3 + 2] + u * (mesh.positions[b * 3 + 2] - mesh.positions[a * 3 + 2]);
  const x = mesh.positions[a * 3] + u * (mesh.positions[b * 3] - mesh.positions[a * 3]);
  const key = `${dom(u < 0.5 ? a : b)}/${mesh.regions[a]}`;
  const g = groups[key] ??= { n: 0, z: [Infinity, -Infinity], x: [Infinity, -Infinity] };
  g.n += 1; g.z = [Math.min(g.z[0], z), Math.max(g.z[1], z)]; g.x = [Math.min(g.x[0], x), Math.max(g.x[1], x)];
}
console.log(style, 'y', y.toFixed(3), 'shoulderSpan', L.shoulderSpan.toFixed(3));
for (const [k, g] of Object.entries(groups)) console.log(k.padEnd(22), String(g.n).padStart(4), 'z', g.z.map((v) => (v * 1000).toFixed(0)).join('..'), ' x', g.x.map((v) => (v * 1000).toFixed(0)).join('..'));
