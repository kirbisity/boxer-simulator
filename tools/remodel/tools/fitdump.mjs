// What the fit did to each piece of a man's kit, by part and paint role: node fitdump.mjs <repo> <preset> <bmi>
const [repo, presetName = 'knight', bmiArg = '24'] = process.argv.slice(2);
const { buildBody, PRESETS, FRAMES, normaliseInputs } = await import(`${repo}/src/body.js`);
const { buildSkinMesh } = await import(`${repo}/src/bodystyles.js`);
const { caloriesForWeight } = await import(`${repo}/src/physiology.js`);
const base = normaliseInputs(structuredClone(PRESETS[presetName]));
const h = base.heightCm / 100;
const inputs = { ...base, calories: Math.round(caloriesForWeight(base, Number(bmiArg) * h * h, FRAMES[base.frame].lean)) };
globalThis.__fitDump = [];
buildSkinMesh(buildBody(inputs), 'base');
const groups = new Map();
for (const d of globalThis.__fitDump) {
  const key = `${d.name}/${d.role}/${typeof d.piece === 'object' ? (d.piece?.name ?? d.piece?.kind ?? 'obj') : d.piece}`;
  const g = groups.get(key) ?? groups.set(key, { n: 0, radius: 0, need: 0, standoff: 0, laid: 0, out: 0, t: [9, -9], found: 0 }).get(key);
  g.n += 1; g.radius += d.radius; g.need += d.need; g.standoff += d.standoff; g.laid += d.laid; g.out += d.radius * d.laid; g.t = [Math.min(g.t[0], d.t), Math.max(g.t[1], d.t)]; g.found += d.need > 0;
}
console.log('part/role/piece'.padEnd(40), 'n'.padStart(5), 'found', 't range   ', 'ring r', 'skin', 'inflate', 'laid', 'out mm', 'off skin');
for (const [k, g] of [...groups].sort()) console.log(k.padEnd(40), String(g.n).padStart(5), (g.found / g.n).toFixed(2), g.t.map((v) => v.toFixed(2)).join('..'), (1000 * g.radius / g.n).toFixed(0).padStart(5), (1000 * g.need / g.n).toFixed(0).padStart(5), (g.standoff / g.n).toFixed(3), (g.laid / g.n).toFixed(3), (1000 * g.out / g.n).toFixed(0).padStart(5), (1000 * (g.out - g.need) / g.n).toFixed(0).padStart(5));
